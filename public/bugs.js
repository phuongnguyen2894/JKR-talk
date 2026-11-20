import { $, $$, esc, S, api, toast, fail, openModal, closeModal, fmtDateTime, actions, imageToDataUrl } from './core.js';

const STATUS = {
  new: ['Mới', 'warn'],
  sent: ['Đã gửi agent', ''],
  fixed: ['Đã sửa', 'ok'],
  dismissed: ['Bỏ qua', ''],
};
const readFile = (f) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });

// ===========================================================================
// Người dùng: báo lỗi
// ===========================================================================
actions['report-bug'] = () => {
  const m = openModal(`<form id="bugf" class="col"><h2>Báo lỗi</h2>
    <p class="small muted">Mô tả lỗi bạn gặp. Chúng tôi tự đính kèm trang bạn đang mở và loại thiết bị để dễ tìm lỗi.</p>
    <div class="field"><label for="bt">Tiêu đề</label><input class="input" id="bt" required minlength="3" maxlength="120" placeholder="Ví dụ: Không gửi được ảnh"></div>
    <div class="field"><label for="bd">Chuyện gì đã xảy ra?</label><textarea class="input" id="bd" required minlength="10" maxlength="4000" placeholder="Bạn đã làm gì, mong đợi gì, và thực tế ra sao?"></textarea></div>
    <div class="field"><label for="bs">Ảnh chụp màn hình (không bắt buộc, tối đa 2MB)</label><input id="bs" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></div>
    <div class="btns"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary" id="bsend">Gửi báo lỗi</button></div></form>`);
  $('[data-close]', m).onclick = closeModal;
  $('#bugf').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#bsend');
    btn.disabled = true;
    try {
      let screenshotUrl;
      const f = $('#bs').files[0];
      if (f) {
        screenshotUrl = (await api('POST', '/upload', { dataUrl: await imageToDataUrl(f) })).url;
      }
      await api('POST', '/bugs', { title: $('#bt').value, description: $('#bd').value, screenshotUrl, page: `${location.hash || '#/'} (${innerWidth}x${innerHeight})` });
      closeModal();
      toast('Đã gửi báo lỗi. Cảm ơn bạn!');
    } catch (er) { btn.disabled = false; fail(er); }
  };
};

// ===========================================================================
// Admin: danh sách lỗi, chọn lỗi gửi cho agent kèm prompt
// ===========================================================================
let state = { status: 'new', webhook: false };

export async function renderBugs(view, status = state.status) {
  if (S.me.role !== 'admin') { view.innerHTML = '<div class="gate"><p>Bạn không có quyền xem trang này.</p></div>'; return; }
  state.status = status;
  const { bugs, counts, webhookConfigured } = await api('GET', `/admin/bugs${status === 'all' ? '' : `?status=${status}`}`);
  state.webhook = webhookConfigured;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>Danh sách lỗi</h1>
    <div class="pillnav" role="group" aria-label="Lọc theo trạng thái">
      ${[['new', 'Mới'], ['sent', 'Đã gửi agent'], ['fixed', 'Đã sửa'], ['dismissed', 'Bỏ qua']].map(([k, n]) => `<button data-st="${k}" aria-pressed="${status === k}">${n} (${counts[k] || 0})</button>`).join('')}
      <button data-st="all" aria-pressed="${status === 'all'}">Tất cả (${total})</button></div>
    ${webhookConfigured ? '' : '<div class="notice small">Chưa cấu hình <b>AGENT_WEBHOOK_URL</b> trên máy chủ nên chưa gửi thẳng được. Bạn vẫn dùng được nút "Sao chép prompt" để dán vào agent.</div>'}
    <div class="row wrap card" style="position:sticky;top:0;z-index:2">
      <label class="check"><input type="checkbox" id="selall"> Chọn tất cả</label>
      <span class="small muted grow" id="selcount">Chưa chọn lỗi nào</span>
      <button class="btn" data-act="bug-copy" id="bcopy" disabled>Sao chép prompt</button>
      <button class="btn primary" data-act="bug-send" id="bsendall" disabled>Gửi cho agent</button></div>
    <div class="list">${bugs.map((b) => {
      const [label, cls] = STATUS[b.status] || ['', ''];
      return `<article class="card col" style="gap:8px">
        <label class="row" style="align-items:flex-start;gap:12px;cursor:pointer"><input type="checkbox" class="bug-check" value="${b.id}" style="width:20px;height:20px;margin-top:3px;accent-color:var(--accent)" aria-label="Chọn lỗi #${b.id}">
          <span class="grow"><b>#${b.id} ${esc(b.title)}</b>
            <span class="row wrap" style="gap:8px;margin-top:2px"><span class="pill ${cls}">${label}</span><span class="tiny muted">${esc(b.reporter)} · ${fmtDateTime(b.createdAt)}</span>${b.sentAt ? `<span class="tiny muted">· gửi agent ${fmtDateTime(b.sentAt)}</span>` : ''}</span></span></label>
        <p class="small" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(b.description)}</p>
        ${b.page ? `<div class="tiny muted">Trang: ${esc(b.page)}</div>` : ''}
        ${b.userAgent ? `<div class="tiny muted" style="overflow-wrap:anywhere">Thiết bị: ${esc(b.userAgent)}</div>` : ''}
        ${b.screenshotPath ? `<a href="${esc(b.screenshotPath)}" target="_blank" rel="noopener"><img src="${esc(b.screenshotPath)}" alt="Ảnh chụp màn hình lỗi #${b.id}" style="max-width:220px;max-height:160px;border-radius:10px;border:1px solid var(--line)" loading="lazy"></a>` : ''}
        ${b.agentResult ? `<div class="tiny muted" style="overflow-wrap:anywhere">Phản hồi agent: ${esc(b.agentResult)}</div>` : ''}
        <div class="row wrap">
          ${b.status !== 'fixed' ? `<button class="btn sm" data-act="bug-status" data-id="${b.id}" data-to="fixed">Đánh dấu đã sửa</button>` : ''}
          ${b.status !== 'dismissed' ? `<button class="btn sm" data-act="bug-status" data-id="${b.id}" data-to="dismissed">Bỏ qua</button>` : ''}
          ${b.status !== 'new' ? `<button class="btn sm" data-act="bug-status" data-id="${b.id}" data-to="new">Mở lại</button>` : ''}</div></article>`;
    }).join('') || '<p class="muted">Không có lỗi nào ở mục này.</p>'}</div></div></div>`;

  $$('[data-st]', view).forEach((b) => (b.onclick = () => renderBugs(view, b.dataset.st).catch(fail)));
  const sync = () => {
    const n = selected().length;
    $('#selcount').textContent = n ? `Đã chọn ${n} lỗi` : 'Chưa chọn lỗi nào';
    $('#bcopy').disabled = $('#bsendall').disabled = !n;
    $('#selall').checked = n > 0 && n === $$('.bug-check').length;
  };
  $$('.bug-check', view).forEach((c) => (c.onchange = sync));
  $('#selall').onchange = (e) => { $$('.bug-check').forEach((c) => (c.checked = e.target.checked)); sync(); };
}
const selected = () => $$('.bug-check:checked').map((c) => Number(c.value));

actions['bug-status'] = async (el) => {
  try { await api('PATCH', `/admin/bugs/${el.dataset.id}`, { status: el.dataset.to }); renderBugs($('#view')); } catch (e) { fail(e); }
};

// Hộp thoại: soạn prompt, xem trước đúng nội dung sẽ gửi, rồi gửi hoặc sao chép
async function agentDialog(mode) {
  const ids = selected();
  if (!ids.length) return;
  let saved = '';
  try { saved = localStorage.getItem('jkr_agent_prompt') || ''; } catch {}
  const first = await api('POST', '/admin/bugs/compose', { ids, prompt: saved });
  const m = openModal(`<form id="agf" class="col"><h2>Gửi ${ids.length} lỗi cho agent</h2>
    <div class="field"><label for="agp">Prompt cho agent</label><textarea class="input" id="agp" required maxlength="4000" style="min-height:120px"></textarea></div>
    <div class="field"><label for="agv">Nội dung sẽ gửi (đã gồm chi tiết các lỗi đã chọn)</label><textarea class="input" id="agv" readonly style="min-height:200px;font-size:13px"></textarea></div>
    ${state.webhook ? '' : '<div class="notice small">Chưa cấu hình AGENT_WEBHOOK_URL nên không gửi thẳng được. Hãy sao chép rồi dán vào agent.</div>'}
    <div class="btns"><button type="button" class="btn" data-close>Hủy</button><button type="button" class="btn" id="agcopy">Sao chép</button><button class="btn primary" id="agsend" ${state.webhook ? '' : 'disabled'}>Gửi cho agent</button></div></form>`);
  $('[data-close]', m).onclick = closeModal;
  $('#agp').value = saved || first.defaultPrompt;
  $('#agv').value = first.text;
  let t;
  const refresh = async () => {
    try { $('#agv').value = (await api('POST', '/admin/bugs/compose', { ids, prompt: $('#agp').value })).text; } catch {}
  };
  refresh();
  $('#agp').oninput = () => { clearTimeout(t); t = setTimeout(refresh, 300); };
  $('#agcopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#agv').value); toast('Đã sao chép nội dung gửi agent'); }
    catch { $('#agv').select(); toast('Hãy nhấn Ctrl+C để sao chép'); }
  };
  $('#agf').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#agsend');
    btn.disabled = true; btn.textContent = 'Đang gửi…';
    try {
      const prompt = $('#agp').value;
      const r = await api('POST', '/admin/bugs/send', { ids, prompt });
      try { localStorage.setItem('jkr_agent_prompt', prompt); } catch {}
      closeModal();
      toast(`Đã gửi ${r.sent} lỗi cho agent`);
      renderBugs($('#view'));
    } catch (er) { btn.disabled = false; btn.textContent = 'Gửi cho agent'; fail(er); }
  };
  if (mode === 'copy') $('#agcopy').focus();
}
actions['bug-send'] = () => agentDialog('send').catch(fail);
actions['bug-copy'] = () => agentDialog('copy').catch(fail);
