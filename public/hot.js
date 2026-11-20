import { previewHtml } from './chat.js';
import { $, $$, esc, S, api, icon, avatar, fmtDateTime, linkify, imageToDataUrl, actions, toast, fail, confirmBox } from './core.js';

// Chủ đề nóng: tin nhắn đạt ít nhất 38 tim ở các nhóm công khai trong 24 giờ qua (tối đa 38 tin)
const SCOPES = [['', 'Tất cả'], ['country', 'Quốc gia'], ['region', 'Khu vực'], ['province', 'Tỉnh thành']];
const SHOW_FILTER = false; // tạm ẩn bộ lọc; đặt true để bật lại
let scope = '';
export async function renderHot(view, sc = scope) {
  if (!SHOW_FILTER) sc = '';
  scope = sc;
  const { items, pinned = [] } = await api('GET', '/hot' + (sc ? '?scope=' + sc : ''));
  const isAdmin = S.me.role === 'admin';
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>Chủ đề nóng</h1>
    <p class="small muted">Chỉ hiện những tin nhắn đạt ít nhất 38 tim ở các nhóm công khai trong 24 giờ qua. Thả tim bằng nút trái tim dưới mỗi tin nhắn.</p>
    ${isAdmin ? `<form class="card col" id="hotpost" aria-label="Đăng bài lên Chủ đề nóng">
      <label for="hotbody"><b>Đăng bài lên Chủ đề nóng</b> <span class="tiny muted">(chỉ Admin; hiện đầu trang cho mọi người)</span></label>
      <textarea class="input" id="hotbody" maxlength="2000" rows="3" placeholder="Viết nội dung hoặc dán liên kết cần mọi người chú ý…"></textarea>
      <div class="row wrap"><input type="file" id="hotimg" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="Ảnh đính kèm"><span class="grow"></span><button class="btn primary">Đăng</button></div></form>` : ''}
    ${pinned.length ? `<h2 class="h2" style="margin:8px 0 0">Từ quản trị</h2><div class="list">${pinned.map((m) => pinnedCard(m, isAdmin)).join('')}</div>` : ''}
    ${SHOW_FILTER ? `<div class="pillnav" role="group" aria-label="Lọc theo phạm vi">${SCOPES.map(([k, n]) => `<button data-sc="${k}" aria-pressed="${sc === k}">${n}</button>`).join('')}</div>` : ''}
    <div class="list">${items.map((m, i) => `<div class="card col" style="gap:6px">
      <div class="row wrap"><span class="pill">#${i + 1}</span><a class="pill warn" href="#/chat/${m.groupId}">${esc(m.groupName)} →</a>
        <span class="row" style="gap:4px;margin-left:auto;color:var(--heart);font-weight:700">${icon('heart', 16, 'fill="currentColor"')}${m.hearts}</span></div>
      <div class="row">${avatar(m.user)}<div class="grow"><b>${esc(m.user.displayName)}</b> <span class="tiny muted">${fmtDateTime(m.createdAt)}</span></div></div>
      ${m.body ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${linkify(m.body, m.mentions)}</div>` : ''}
      ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="Ảnh trong tin nhắn" style="max-width:240px;border-radius:10px" loading="lazy">` : ''}
      ${previewHtml(m.preview)}
    </div>`).join('') || '<p class="muted">Chưa có chủ đề nóng nào ở phạm vi này. Hãy thả tim cho những tin nhắn bạn thích!</p>'}</div>
  </div></div>`;
  const form = $('#hotpost', view);
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const body = $('#hotbody').value.trim();
    const f = $('#hotimg').files[0];
    if (!body && !f) return;
    const btn = $('button', form); btn.disabled = true;
    try {
      const imageUrl = f ? (await api('POST', '/upload', { dataUrl: await imageToDataUrl(f) })).url : undefined;
      await api('POST', '/hot/posts', { body, imageUrl });
      toast('Đã đăng lên Chủ đề nóng');
      await renderHot(view);
    } catch (er) { btn.disabled = false; fail(er); }
  };
  $$('[data-sc]', view).forEach((b) => (b.onclick = () => renderHot(view, b.dataset.sc).catch(() => {})));
}

function pinnedCard(m, isAdmin) {
  return `<div class="card col hot-pin" style="gap:6px" data-mid="${m.id}">
    <div class="row wrap"><span class="pill warn">Từ quản trị</span><span class="tiny muted">${fmtDateTime(m.createdAt)}</span></div>
    <div class="row">${avatar(m.user)}<div class="grow"><b>${esc(m.user.displayName)}</b></div></div>
    ${m.body ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${linkify(m.body, m.mentions)}</div>` : ''}
    ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="Ảnh trong bài đăng" style="max-width:100%;border-radius:10px" loading="lazy" decoding="async">` : ''}
    ${previewHtml(m.preview)}
    <div class="row" style="gap:4px">
      <button type="button" class="heart ${m.hearted ? 'on' : ''}" data-act="heart" data-id="${m.id}" ${m.user.id === S.me.id ? 'disabled' : ''} aria-pressed="${m.hearted}" aria-label="Thả tim, hiện có ${m.hearts} tim">${icon('heart', 15, m.hearted ? 'fill="currentColor"' : '')}<span class="hc">${m.hearts || ''}</span></button>
      <button type="button" class="link-btn" data-act="fwd-msg" data-id="${m.id}">Chuyển tiếp</button>
      ${isAdmin ? `<button type="button" class="link-btn" data-act="hot-del" data-id="${m.id}">Xóa</button>` : ''}
    </div></div>`;
}
actions['hot-del'] = async (el) => {
  if (!(await confirmBox('Xóa bài đăng?', 'Bài sẽ biến mất khỏi Chủ đề nóng với mọi người.', 'Xóa', true))) return;
  try { await api('DELETE', `/messages/${el.dataset.id}`); toast('Đã xóa'); await renderHot($('#view')); } catch (e) { fail(e); }
};
