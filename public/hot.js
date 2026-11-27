import { previewHtml } from './chat.js';
import { commentBlock } from './comments.js';
import { ago, createTopicHtml, pendingMineHtml } from './topics.js';
import { nameCls } from './frames.js';
import { t as tr } from './i18n.js';
import { $, $$, esc, S, api, icon, avatar, fmtDateTime, linkify, roleOf, avatarR, roleClass, roleSr, actions, toast, fail, confirmBox } from './core.js';

// Chủ đề nóng gồm 3 tab:
//  - Mới: chủ đề thảo luận mới được duyệt, mới nhất trước
//  - Nổi bật: chủ đề Admin đặt nổi bật hoặc có nhiều thảo luận trong 24 giờ qua
//  - Đáng chú ý: bài do Admin đăng
//  - Tin nhiều tương tác: tin nhắn đạt ít nhất 38 tương tác (tim + bình luận + trả lời) ở các nhóm công khai trong 24 giờ qua (tối đa 38 tin)
// [tab, khoá tên] — tên hiển thị: tr(khoá)
export const HOT_TABS = [['all', 'hot.tAll'], ['hot', 'hot.tHot'], ['new', 'hot.tNew'], ['admin', 'hot.tAdmin'], ['hearts', 'hot.tHearts']];
export const ALL_N = 5; // tab Tổng hợp: 5 bài đáng chú ý > 5 chủ đề nổi bật > 5 tin nhiều tương tác > 5 chủ đề mới được duyệt
let htab = 'all';

// Tiêu đề từng khối trong tab Tổng hợp, kèm nút "Xem tất cả" sang tab tương ứng
export const sectionHead = (title, tab) => `<div class="row between" style="margin-top:8px"><h2 class="h2" style="margin:0">${title}</h2>${tab ? `<button type="button" class="link-btn" data-htab="${tab}">${tr('hot.seeAll')}</button>` : ''}</div>`;

// Thẻ chủ đề trong tab Mới / Nổi bật (dùng chung cho khách: href trỏ tới #/g/ thay vì #/chat/)
export function boardCard(t, tab, guest = false) {
  const busy = t.msgs24h > 0 ? tr('hot.msgs24h', { n: t.msgs24h }) : tr('hot.active', { t: ago(t.lastAt) });
  return `<article class="card col topic-card${t.highlighted ? ' hl' : ''}">
    <a class="topic-link" href="#/${guest ? 'g' : 'chat'}/${t.id}">
      <span class="topic-ic" aria-hidden="true">${icon(t.highlighted ? 'star' : tab === 'hot' ? 'flame' : 'chat', 20)}</span>
      <span class="grow">${t.highlighted ? `<span class="hl-pill">★ ${tr('ch.featured')}</span>` : tab === 'new' ? `<span class="pill">${tr('hot.newApproved', { t: esc(ago(t.approvedAt)) })}</span>` : `<span class="pill warn">${tr('hot.buzzing')}</span>`}
        <b class="topic-name">${esc(t.name)}</b>${t.joined ? ` <span class="pill">${tr('hot.joined')}</span>` : ''}
        ${t.description ? `<span class="small muted topic-desc">${esc(t.description)}</span>` : ''}
        <span class="tiny muted">${tr('ch.members', { n: t.memberCount })} · ${busy}${t.creatorName ? ` · ${tr('hot.by', { n: esc(t.creatorName) })}` : ''}</span></span>
    </a>${!guest && S.me?.role === 'admin' ? `<div class="row" style="justify-content:flex-end"><button class="btn sm danger" data-act="topic-del" data-id="${t.id}" data-name="${esc(t.name)}">${tr('ch.closeTopic')}</button></div>` : ''}</article>`;
}

const heartCard = (m, i) => `<div class="card col" style="gap:6px">
  <div class="row wrap"><span class="pill">#${i + 1}</span><span class="pill warn">${tr('hot.interactions', { n: m.interactions })}</span><a class="pill warn" href="#/chat/${m.groupId}">${esc(m.groupName)} →</a>
    <span class="row" style="gap:4px;margin-left:auto;color:var(--heart);font-weight:700">${icon('heart', 16, 'fill="currentColor"')}${m.hearts}</span></div>
  <div class="row">${avatarR(m.user, roleOf(m.user, m.modRole))}<div class="grow"><b class="${(roleClass(roleOf(m.user, m.modRole)) + nameCls(m.user)).trim()}">${esc(m.user.displayName)}${roleSr(roleOf(m.user, m.modRole))}</b> <span class="tiny muted">${fmtDateTime(m.createdAt)}</span></div></div>
  ${m.body ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${linkify(m.body, m.mentions)}</div>` : ''}
  ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="${tr('hot.msgPhoto')}" style="max-width:240px;border-radius:10px" loading="lazy">` : ''}
  ${previewHtml(m.preview)}
  ${commentBlock('msg', m.id, m.commentCount)}
</div>`;

export async function renderHot(view, tab = htab) {
  htab = tab;
  const isAdmin = S.me.role === 'admin';
  const needHot = tab === 'all' || tab === 'admin' || tab === 'hearts';
  const [{ items = [], pinned = [] }, board, boardNew] = await Promise.all([
    needHot ? api('GET', '/hot') : Promise.resolve({}),
    tab === 'all' ? api('GET', '/topic-board?tab=hot') : tab === 'hot' || tab === 'new' ? api('GET', '/topic-board?tab=' + tab) : Promise.resolve(null),
    tab === 'all' ? api('GET', '/topic-board?tab=new') : Promise.resolve(null),
  ]);
  const needsApproval = board ? board.needsApproval : !isAdmin;
  let body;
  if (tab === 'all') {
    body = `${pinned.length ? `${sectionHead(tr('hot.tAdmin'), 'admin')}<div class="list">${pinned.slice(0, ALL_N).map((m) => pinnedCard(m, isAdmin)).join('')}</div>` : ''}
      ${board.topics.length ? `${sectionHead(tr('hot.featuredTopics'), 'hot')}<div class="list">${board.topics.slice(0, ALL_N).map((t) => boardCard(t, 'hot')).join('')}</div>` : ''}
      ${items.length ? `${sectionHead(tr('hot.tHearts'), 'hearts')}<div class="list">${items.slice(0, ALL_N).map(heartCard).join('')}</div>` : ''}
      ${boardNew.topics.length ? `${sectionHead(tr('hot.newTopics'), 'new')}<div class="list">${boardNew.topics.slice(0, ALL_N).map((t) => boardCard(t, 'new')).join('')}</div>` : ''}
      ${!board.topics.length && !pinned.length && !items.length && !boardNew.topics.length ? `<p class="muted">${tr('hot.emptyAll')}</p>` : ''}`;
  } else if (tab === 'hot' || tab === 'new') {
    body = `<p class="small muted">${tab === 'new' ? tr('hot.newNote') : tr('hot.hotNote')}</p>
      <div class="list">${board.topics.map((t) => boardCard(t, tab)).join('') || `<p class="muted">${tab === 'new' ? tr('hot.noTopics') : tr('hot.noHot')}</p>`}</div>`;
  } else if (tab === 'admin') {
    body = `<p class="small muted">${tr('hot.adminNote')}</p>
      <div class="list">${pinned.map((m) => pinnedCard(m, isAdmin)).join('') || `<p class="muted">${tr('hot.noAdmin')}</p>`}</div>`;
  } else {
    body = `<p class="small muted">${tr('hot.heartsNote')}</p>
      <div class="list">${items.map(heartCard).join('') || `<p class="muted">${tr('hot.noHearts')}</p>`}</div>`;
  }
  view.innerHTML = `<div class="page" id="hot-page"><div class="page-inner">
    <div class="row between wrap"><h1>${tr('nav.hot')}</h1>${createTopicHtml(needsApproval, isAdmin)}</div>
    ${board ? pendingMineHtml(board.mine) : ''}
    <div class="pillnav" role="group" aria-label="${tr('sh.section')}">${HOT_TABS.map(([k, n]) => `<button data-htab="${k}" aria-pressed="${tab === k}">${tr(n)}</button>`).join('')}</div>
    ${body}
  </div></div>`;
  $$('[data-htab]', view).forEach((b) => (b.onclick = () => renderHot(view, b.dataset.htab).catch(() => {})));
}
document.addEventListener('topics-changed', (e) => { if ($('#hot-page')) renderHot($('#view'), e.detail?.tab || htab).catch(() => {}); });

function pinnedCard(m, isAdmin) {
  return `<div class="card col hot-pin" style="gap:6px" data-mid="${m.id}">
    <div class="row wrap"><span class="pill warn">${tr('hot.fromAdmin')}</span><span class="tiny muted">${fmtDateTime(m.createdAt)}</span></div>
    <div class="row">${avatarR(m.user, roleOf(m.user, m.modRole))}<div class="grow"><b class="${(roleClass(roleOf(m.user, m.modRole)) + nameCls(m.user)).trim()}">${esc(m.user.displayName)}${roleSr(roleOf(m.user, m.modRole))}</b></div></div>
    ${m.body ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${linkify(m.body, m.mentions)}</div>` : ''}
    ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="${tr('hot.postPhoto')}" style="max-width:100%;border-radius:10px" loading="lazy" decoding="async">` : ''}
    ${previewHtml(m.preview)}
    <div class="row" style="gap:4px">
      <button type="button" class="heart ${m.hearted ? 'on' : ''}" data-act="heart" data-id="${m.id}" ${m.user.id === S.me.id ? 'disabled' : ''} aria-pressed="${m.hearted}" aria-label="${tr('news.heart', { n: m.hearts })}">${icon('heart', 15, m.hearted ? 'fill="currentColor"' : '')}<span class="hc">${m.hearts || ''}</span></button>
      <button type="button" class="link-btn" data-act="fwd-msg" data-id="${m.id}">${tr('ch.forward')}</button>
      ${isAdmin ? `<button type="button" class="link-btn" data-act="hot-del" data-id="${m.id}">${tr('news.delete')}</button>` : ''}
    </div>${commentBlock('msg', m.id, m.commentCount)}</div>`;
}
actions['hot-del'] = async (el) => {
  if (!(await confirmBox(tr('hot.delQ'), tr('hot.delText'), tr('news.delete'), true))) return;
  try { await api('DELETE', `/messages/${el.dataset.id}`); toast(tr('hot.deleted')); await renderHot($('#view')); } catch (e) { fail(e); }
};
