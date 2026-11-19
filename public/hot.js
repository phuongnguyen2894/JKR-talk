import { previewHtml } from './chat.js';
import { $, esc, S, api, icon, avatar, fmtDateTime } from './core.js';

// Chủ đề nóng: 38 tin nhắn nhiều tim nhất ở các nhóm công khai trong 24 giờ qua
export async function renderHot(view) {
  const { items } = await api('GET', '/hot');
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>Chủ đề nóng</h1>
    <p class="small muted">38 tin nhắn nhận được nhiều tim nhất ở các nhóm công khai trong 24 giờ qua. Thả tim bằng nút trái tim dưới mỗi tin nhắn.</p>
    <div class="list">${items.map((m, i) => `<div class="card col" style="gap:6px">
      <div class="row wrap"><span class="pill">#${i + 1}</span><a class="pill warn" href="#/chat/${m.groupId}">${esc(m.groupName)} →</a>
        <span class="row" style="gap:4px;margin-left:auto;color:var(--heart);font-weight:700">${icon('heart', 16, 'fill="currentColor"')}${m.hearts}</span></div>
      <div class="row">${avatar(m.user)}<div class="grow"><b>${esc(m.user.displayName)}</b> <span class="tiny muted">${fmtDateTime(m.createdAt)}</span></div></div>
      ${m.body ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.body)}</div>` : ''}
      ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="Ảnh trong tin nhắn" style="max-width:240px;border-radius:10px" loading="lazy">` : ''}
      ${previewHtml(m.preview)}
    </div>`).join('') || '<p class="muted">Chưa có chủ đề nóng nào. Hãy thả tim cho những tin nhắn bạn thích!</p>'}</div>
  </div></div>`;
}
