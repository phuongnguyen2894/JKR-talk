// Chủ đề thảo luận: Admin / Mod tạo, mọi người vào bàn luận như một nhóm chat
import { $, S, esc, api, go, openModal, closeModal, imageToDataUrl, icon, fmtDateTime, toast, fail, ask, confirmBox, actions, refreshGroups, avatarR, roleOf, roleClass } from './core.js';

export const ago = (t) => {
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
};

// Nút tạo chủ đề + danh sách chủ đề của tôi đang chờ duyệt (dùng ở trang Chủ đề nóng và Tất cả chủ đề)
export const createTopicHtml = (needsApproval, isAdmin = false) => `<button class="btn primary" data-act="topic-new" data-approval="${needsApproval ? 1 : 0}" data-admin="${isAdmin ? 1 : 0}">${isAdmin ? '+ Tạo' : '+ Tạo chủ đề'}</button>`;
export const pendingMineHtml = (mine = []) => mine.length ? `<section class="card col" style="gap:6px" aria-label="Chủ đề đang chờ duyệt">
  <div class="h2" style="margin:0">Đang chờ Admin duyệt</div>
  ${mine.map((t) => `<div class="row wrap" style="gap:8px"><span class="pill warn">Chờ duyệt</span><b class="grow">${esc(t.name)}</b><span class="tiny muted">${ago(t.createdAt)}</span><button class="btn sm" data-act="topic-withdraw" data-id="${t.id}">Rút lại</button></div>`).join('')}
  <p class="tiny muted" style="margin:0">Duyệt xong chủ đề sẽ hiện ở mục Chủ đề nóng và bạn nhận được thông báo.</p></section>` : '';

export async function renderTopics(view) {
  const { topics, mine, needsApproval, canHighlight } = await api('GET', '/topics');
  view.innerHTML = `<div class="page" id="topics-page"><div class="page-inner">
    <div class="row between wrap"><h1>Chủ đề thảo luận</h1>${createTopicHtml(needsApproval, S.me.role === 'admin')}</div>
    <p class="small muted">Ai cũng có thể đề xuất chủ đề; chủ đề của người dùng sẽ hiện sau khi Admin duyệt. Bấm vào một chủ đề để đọc và cùng trò chuyện.</p>
    ${pendingMineHtml(mine)}
    <div class="list">${topics.map((t) => {
      const r = roleOf(t.creator);
      return `<article class="card col topic-card${t.highlighted ? ' hl' : ''}">
      <a class="topic-link" href="#/chat/${t.id}">
        <span class="topic-ic" aria-hidden="true">${icon(t.highlighted ? 'star' : 'chat', 20)}</span>
        <span class="grow">${t.highlighted ? '<span class="hl-pill">★ Nổi bật</span>' : ''}<b class="topic-name">${esc(t.name)}</b>${t.joined ? ' <span class="pill">Đã tham gia</span>' : ''}
          ${t.description ? `<span class="small muted topic-desc">${esc(t.description)}</span>` : ''}
          <span class="tiny muted">${t.memberCount} thành viên · hoạt động ${ago(t.lastAt)}${t.creator ? ` · tạo bởi <span class="${roleClass(r).trim()}">${esc(t.creator.displayName)}</span>` : ''}</span></span>
      </a>
      <div class="row wrap" style="gap:6px"><button class="btn sm" data-act="share-topic" data-id="${t.id}" data-name="${esc(t.name)}">${icon('share', 15)} Chia sẻ</button>${canHighlight ? `<button class="btn sm" data-act="topic-hl" data-id="${t.id}" data-on="${t.highlighted ? 0 : 1}">${t.highlighted ? 'Bỏ nổi bật' : '★ Đặt nổi bật'}</button>` : ''}${t.canManage ? `<button class="btn sm" data-act="topic-edit" data-id="${t.id}" data-name="${esc(t.name)}" data-desc="${esc(t.description)}">Sửa</button><button class="btn sm danger" data-act="topic-del" data-id="${t.id}" data-name="${esc(t.name)}">Đóng chủ đề</button>` : ''}</div>
    </article>`;
    }).join('') || '<p class="muted">Chưa có chủ đề nào.</p>'}</div>
  </div></div>`;
}

const fields = (v = {}) => [
  { name: 'name', label: 'Tên chủ đề', value: v.name || '', required: true, max: 60 },
  { name: 'description', label: 'Mô tả ngắn (không bắt buộc)', type: 'textarea', value: v.description || '', max: 300 },
];
// Admin: một nút "Tạo" cho cả chủ đề thảo luận lẫn bài đăng từ quản trị
function adminCompose() {
  const m = openModal(`<form id="composef" class="col"><h2>Tạo mới</h2>
    <div class="pillnav" role="group" aria-label="Loại nội dung"><button type="button" data-kind="topic" aria-pressed="true">Chủ đề thảo luận</button><button type="button" data-kind="post" aria-pressed="false">Bài từ quản trị</button></div>
    <p class="muted small" id="cmphint">Chủ đề hiện ở Chủ đề nóng, mọi người vào bàn luận như một nhóm chat.</p>
    <div data-sec="topic" class="col"><div class="field"><label for="cp-name">Tên chủ đề</label><input class="input" id="cp-name" maxlength="60" autocomplete="off"></div>
      <div class="field"><label for="cp-desc">Mô tả ngắn (không bắt buộc)</label><textarea class="input" id="cp-desc" maxlength="300"></textarea></div></div>
    <div data-sec="post" class="col" hidden><div class="field"><label for="cp-body">Nội dung</label><textarea class="input" id="cp-body" maxlength="2000" rows="4" placeholder="Viết nội dung hoặc dán liên kết cần mọi người chú ý…"></textarea></div>
      <div class="field"><label for="cp-img">Ảnh đính kèm (không bắt buộc)</label><input type="file" id="cp-img" accept="image/png,image/jpeg,image/gif,image/webp"></div></div>
    <div class="btns"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary" id="cp-ok">Tạo chủ đề</button></div></form>`);
  let kind = 'topic';
  const hints = { topic: 'Chủ đề hiện ở Chủ đề nóng, mọi người vào bàn luận như một nhóm chat.', post: 'Bài hiện ở tab "Đáng chú ý" của Chủ đề nóng cho mọi người.' };
  const setKind = (k) => {
    kind = k;
    m.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
    m.querySelectorAll('[data-sec]').forEach((d) => { d.hidden = d.dataset.sec !== k; });
    $('#cmphint', m).textContent = hints[k];
    $('#cp-ok', m).textContent = k === 'topic' ? 'Tạo chủ đề' : 'Đăng bài';
    $(k === 'topic' ? '#cp-name' : '#cp-body', m).focus();
  };
  m.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => setKind(b.dataset.kind)));
  $('[data-close]', m).onclick = () => closeModal();
  $('#composef', m).onsubmit = async (e) => {
    e.preventDefault();
    const ok = $('#cp-ok', m); ok.disabled = true;
    try {
      if (kind === 'topic') {
        const r = await api('POST', '/topics', { name: $('#cp-name', m).value, description: $('#cp-desc', m).value });
        closeModal(); await refreshGroups(); toast('Đã tạo chủ đề'); go(`#/chat/${r.topic.id}`);
      } else {
        const body = $('#cp-body', m).value.trim(), f = $('#cp-img', m).files[0];
        if (!body && !f) { ok.disabled = false; return; }
        const imageUrl = f ? (await api('POST', '/upload', { dataUrl: await imageToDataUrl(f) })).url : undefined;
        await api('POST', '/hot/posts', { body, imageUrl });
        closeModal(); toast('Đã đăng bài từ quản trị');
        document.dispatchEvent(new CustomEvent('topics-changed', { detail: { tab: 'admin' } }));
      }
    } catch (er) { ok.disabled = false; fail(er); }
  };
}
actions['topic-new'] = async (el) => {
  if (el?.dataset?.admin === '1') return adminCompose();
  const approval = el?.dataset?.approval === '1';
  const v = await ask({ title: 'Tạo chủ đề thảo luận', text: approval ? 'Chủ đề của bạn sẽ được gửi cho Admin duyệt. Sau khi được duyệt, nó hiện ở mục Chủ đề nóng cho mọi người cùng bàn luận.' : 'Chủ đề hiện cho mọi người. Ai cũng có thể vào đọc và tham gia bàn luận, theo quy tắc cộng đồng.', fields: fields(), ok: approval ? 'Gửi duyệt' : 'Tạo' });
  if (!v) return;
  try {
    const r = await api('POST', '/topics', v);
    if (r.pending) { toast('Đã gửi chủ đề cho Admin duyệt. Bạn sẽ nhận thông báo khi có kết quả.', 6000); document.dispatchEvent(new CustomEvent('topics-changed')); return; }
    await refreshGroups();
    toast('Đã tạo chủ đề');
    go(`#/chat/${r.topic.id}`);
  } catch (e) { fail(e); }
};
actions['topic-withdraw'] = async (el) => {
  try { await api('DELETE', `/topics/pending/${el.dataset.id}`); toast('Đã rút lại chủ đề'); document.dispatchEvent(new CustomEvent('topics-changed')); } catch (e) { fail(e); }
};
document.addEventListener('topics-changed', () => { if ($('#topics-page')) renderTopics($('#view')).catch(() => {}); });
actions['topic-edit'] = async (el) => {
  const v = await ask({ title: 'Sửa chủ đề', fields: fields({ name: el.dataset.name, description: el.dataset.desc }), ok: 'Lưu' });
  if (!v) return;
  try { await api('PATCH', `/topics/${el.dataset.id}`, v); await refreshGroups(); renderTopics($('#view')); } catch (e) { fail(e); }
};
actions['topic-hl'] = async (el) => {
  const on = el.dataset.on === '1';
  try {
    await api('POST', `/topics/${el.dataset.id}/highlight`, { on });
    await refreshGroups();
    toast(on ? 'Đã đặt chủ đề nổi bật' : 'Đã bỏ nổi bật');
    renderTopics($('#view'));
  } catch (e) { fail(e); }
};
actions['topic-del'] = async (el) => {
  if (!(await confirmBox(`Đóng chủ đề "${el.dataset.name}"?`, 'Toàn bộ tin nhắn trong chủ đề sẽ bị xóa và thành viên sẽ nhận thông báo.', 'Đóng chủ đề', true))) return;
  try {
    await api('DELETE', `/topics/${el.dataset.id}`); await refreshGroups(); toast('Đã đóng chủ đề');
    if (location.hash.startsWith('#/topics')) renderTopics($('#view')); else go(location.hash.startsWith('#/hot') ? '#/hot' : '#/topics'); // đang ở trong chủ đề vừa đóng thì chuyển sang danh sách
  } catch (e) { fail(e); }
};
