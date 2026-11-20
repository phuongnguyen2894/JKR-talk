import { previewHtml } from './chat.js';
import { commentBlock } from './comments.js';
import { ago, createTopicHtml, pendingMineHtml } from './topics.js';
import { $, $$, esc, S, api, icon, avatar, fmtDateTime, linkify, roleOf, avatarR, roleClass, roleSr, actions, toast, fail, confirmBox } from './core.js';

// Chủ đề nóng gồm 3 tab:
//  - Mới: chủ đề thảo luận mới được duyệt, mới nhất trước
//  - Nổi bật: chủ đề Admin đặt nổi bật hoặc có nhiều thảo luận trong 24 giờ qua
//  - Từ quản trị: bài do Admin đăng
//  - Tin nhiều tim: tin nhắn đạt ít nhất 38 tim ở các nhóm công khai trong 24 giờ qua (tối đa 38 tin)
export const HOT_TABS = [['all', 'Tổng hợp'], ['hot', 'Nổi bật'], ['new', 'Mới'], ['admin', 'Từ quản trị'], ['hearts', 'Tin nhiều tim']];
export const ALL_TOPICS = 3, ALL_ADMIN = 3, ALL_OTHER = 10; // tab Tổng hợp: 3 chủ đề nổi bật, 3 bài quản trị mới nhất, rồi tin khác
let htab = 'all';

// Tiêu đề từng khối trong tab Tổng hợp, kèm nút "Xem tất cả" sang tab tương ứng
export const sectionHead = (title, tab) => `<div class="row between" style="margin-top:8px"><h2 class="h2" style="margin:0">${title}</h2><button type="button" class="link-btn" data-htab="${tab}">Xem tất cả</button></div>`;

// Thẻ chủ đề trong tab Mới / Nổi bật (dùng chung cho khách: href trỏ tới #/g/ thay vì #/chat/)
export function boardCard(t, tab, guest = false) {
  const busy = t.msgs24h > 0 ? `${t.msgs24h} tin trong 24 giờ` : `hoạt động ${ago(t.lastAt)}`;
  return `<article class="card col topic-card${t.highlighted ? ' hl' : ''}">
    <a class="topic-link" href="#/${guest ? 'g' : 'chat'}/${t.id}">
      <span class="topic-ic" aria-hidden="true">${icon(t.highlighted ? 'star' : tab === 'hot' ? 'flame' : 'chat', 20)}</span>
      <span class="grow">${t.highlighted ? '<span class="hl-pill">★ Nổi bật</span>' : tab === 'new' ? `<span class="pill">Mới duyệt ${esc(ago(t.approvedAt))}</span>` : '<span class="pill warn">Đang sôi</span>'}
        <b class="topic-name">${esc(t.name)}</b>${t.joined ? ' <span class="pill">Đã tham gia</span>' : ''}
        ${t.description ? `<span class="small muted topic-desc">${esc(t.description)}</span>` : ''}
        <span class="tiny muted">${t.memberCount} thành viên · ${busy}${t.creatorName ? ` · tạo bởi ${esc(t.creatorName)}` : ''}</span></span>
    </a></article>`;
}

const heartCard = (m, i) => `<div class="card col" style="gap:6px">
  <div class="row wrap"><span class="pill">#${i + 1}</span><a class="pill warn" href="#/chat/${m.groupId}">${esc(m.groupName)} →</a>
    <span class="row" style="gap:4px;margin-left:auto;color:var(--heart);font-weight:700">${icon('heart', 16, 'fill="currentColor"')}${m.hearts}</span></div>
  <div class="row">${avatarR(m.user, roleOf(m.user, m.modRole))}<div class="grow"><b class="${roleClass(roleOf(m.user, m.modRole)).trim()}">${esc(m.user.displayName)}${roleSr(roleOf(m.user, m.modRole))}</b> <span class="tiny muted">${fmtDateTime(m.createdAt)}</span></div></div>
  ${m.body ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${linkify(m.body, m.mentions)}</div>` : ''}
  ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="Ảnh trong tin nhắn" style="max-width:240px;border-radius:10px" loading="lazy">` : ''}
  ${previewHtml(m.preview)}
  ${commentBlock('msg', m.id, m.commentCount)}
</div>`;

export async function renderHot(view, tab = htab) {
  htab = tab;
  const isAdmin = S.me.role === 'admin';
  const needHot = tab === 'all' || tab === 'admin' || tab === 'hearts';
  const [{ items = [], pinned = [] }, board] = await Promise.all([
    needHot ? api('GET', '/hot') : Promise.resolve({}),
    tab === 'all' ? api('GET', '/topic-board?tab=hot') : tab === 'hot' || tab === 'new' ? api('GET', '/topic-board?tab=' + tab) : Promise.resolve(null),
  ]);
  const needsApproval = board ? board.needsApproval : !isAdmin;
  let body;
  if (tab === 'all') {
    body = `${board.topics.length ? `${sectionHead('Chủ đề nổi bật', 'hot')}<div class="list">${board.topics.slice(0, ALL_TOPICS).map((t) => boardCard(t, 'hot')).join('')}</div>` : ''}
      ${pinned.length ? `${sectionHead('Từ quản trị', 'admin')}<div class="list">${pinned.slice(0, ALL_ADMIN).map((m) => pinnedCard(m, isAdmin)).join('')}</div>` : ''}
      ${items.length ? `${sectionHead('Tin khác được quan tâm', 'hearts')}<div class="list">${items.slice(0, ALL_OTHER).map(heartCard).join('')}</div>` : ''}
      ${!board.topics.length && !pinned.length && !items.length ? '<p class="muted">Chưa có gì nổi bật. Hãy vào bàn luận hoặc thả tim cho những tin bạn thích!</p>' : ''}`;
  } else if (tab === 'hot' || tab === 'new') {
    body = `<p class="small muted">${tab === 'new' ? 'Chủ đề mới được duyệt, mới nhất ở trên cùng.' : 'Chủ đề được Admin đặt nổi bật, hoặc đang có nhiều thảo luận trong 24 giờ qua.'}</p>
      <div class="list">${board.topics.map((t) => boardCard(t, tab)).join('') || `<p class="muted">${tab === 'new' ? 'Chưa có chủ đề nào.' : 'Chưa có chủ đề nổi bật. Hãy vào bàn luận để chủ đề lên đây!'}</p>`}</div>`;
  } else if (tab === 'admin') {
    body = `<p class="small muted">Thông báo và bài đăng từ đội quản trị.</p>
      <div class="list">${pinned.map((m) => pinnedCard(m, isAdmin)).join('') || '<p class="muted">Chưa có bài nào từ quản trị.</p>'}</div>`;
  } else {
    body = `<p class="small muted">Chỉ hiện những tin nhắn đạt ít nhất 38 tim ở các nhóm công khai trong 24 giờ qua. Thả tim bằng nút trái tim dưới mỗi tin nhắn.</p>
      <div class="list">${items.map(heartCard).join('') || '<p class="muted">Chưa có tin nào đạt ngưỡng. Hãy thả tim cho những tin nhắn bạn thích!</p>'}</div>`;
  }
  view.innerHTML = `<div class="page" id="hot-page"><div class="page-inner">
    <div class="row between wrap"><h1>Chủ đề nóng</h1>${createTopicHtml(needsApproval, isAdmin)}</div>
    ${board ? pendingMineHtml(board.mine) : ''}
    <div class="pillnav" role="group" aria-label="Chọn mục">${HOT_TABS.map(([k, n]) => `<button data-htab="${k}" aria-pressed="${tab === k}">${n}</button>`).join('')}</div>
    ${body}
  </div></div>`;
  $$('[data-htab]', view).forEach((b) => (b.onclick = () => renderHot(view, b.dataset.htab).catch(() => {})));
}
document.addEventListener('topics-changed', (e) => { if ($('#hot-page')) renderHot($('#view'), e.detail?.tab || htab).catch(() => {}); });

function pinnedCard(m, isAdmin) {
  return `<div class="card col hot-pin" style="gap:6px" data-mid="${m.id}">
    <div class="row wrap"><span class="pill warn">Từ quản trị</span><span class="tiny muted">${fmtDateTime(m.createdAt)}</span></div>
    <div class="row">${avatarR(m.user, roleOf(m.user, m.modRole))}<div class="grow"><b class="${roleClass(roleOf(m.user, m.modRole)).trim()}">${esc(m.user.displayName)}${roleSr(roleOf(m.user, m.modRole))}</b></div></div>
    ${m.body ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${linkify(m.body, m.mentions)}</div>` : ''}
    ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="Ảnh trong bài đăng" style="max-width:100%;border-radius:10px" loading="lazy" decoding="async">` : ''}
    ${previewHtml(m.preview)}
    <div class="row" style="gap:4px">
      <button type="button" class="heart ${m.hearted ? 'on' : ''}" data-act="heart" data-id="${m.id}" ${m.user.id === S.me.id ? 'disabled' : ''} aria-pressed="${m.hearted}" aria-label="Thả tim, hiện có ${m.hearts} tim">${icon('heart', 15, m.hearted ? 'fill="currentColor"' : '')}<span class="hc">${m.hearts || ''}</span></button>
      <button type="button" class="link-btn" data-act="fwd-msg" data-id="${m.id}">Chuyển tiếp</button>
      ${isAdmin ? `<button type="button" class="link-btn" data-act="hot-del" data-id="${m.id}">Xóa</button>` : ''}
    </div>${commentBlock('msg', m.id, m.commentCount)}</div>`;
}
actions['hot-del'] = async (el) => {
  if (!(await confirmBox('Xóa bài đăng?', 'Bài sẽ biến mất khỏi Chủ đề nóng với mọi người.', 'Xóa', true))) return;
  try { await api('DELETE', `/messages/${el.dataset.id}`); toast('Đã xóa'); await renderHot($('#view')); } catch (e) { fail(e); }
};
