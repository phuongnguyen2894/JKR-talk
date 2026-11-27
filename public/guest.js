// Chế độ khách (chưa đăng ký): chỉ đọc nhóm công khai, Đẩy trend, Chủ đề nóng, Bản tin
import { $, esc, api, go, icon, avatar, groupAvatar, fmtTime, fmtDate, fmtDateTime, dayKey, actions, lightbox, linkify, newsGallery, roleOf, avatarR, roleClass, roleSr } from './core.js';
import { previewHtml } from './chat.js';
import { boardCard, HOT_TABS, sectionHead, ALL_N } from './hot.js';
import { loadEmoji, emojiHtml } from './emoji.js';
import { renderTools } from './pages.js';
import { t, getLang } from './i18n.js';
import { langButton, maybeAskLang } from './langpick.js';
import { newsText, fitNews } from './newstext.js';

const G = { groups: null, trendId: 0 };
const GROUP_ICON = { country: 'flag', region: 'grid', province: 'pin', topic: 'chat' };
const wide = () => matchMedia('(min-width: 900px)').matches;

async function loadGroups() {
  if (!G.groups) {
    G.groups = (await api('GET', '/public/groups')).groups;
    G.trendId = G.groups.find((g) => g.type === 'trend')?.id || 0;
  }
  return G.groups;
}

const cta = (text = t('guest.cta')) =>
  `<div class="guest-cta" role="region" aria-label="${esc(t('guest.ctaAria'))}"><span class="grow small">${text}</span>
    ${langButton()}<a class="btn sm" href="#/login">${t('auth.login')}</a><a class="btn primary sm" href="#/register">${t('guest.signup')}</a></div>`;

function buildGuestShell(root) {
  if ($('#app.guest')) return;
  root.innerHTML = `<div class="app guest" id="app">
    <nav class="side" id="side" aria-label="${t('nav.guestGroups')}"></nav>
    <main class="main" id="view"></main>
    <nav class="tabs-bar" id="tabs" aria-label="${t('nav.navAria')}"></nav></div>`;
}

function renderGuestSide(r) {
  const activeId = r.name === 'g' ? Number(r.arg) : 0;
  const item = (g) => `<a class="nav-item${g.highlighted ? ' hl-topic' : ''}" href="#/g/${g.id}" ${g.id === activeId ? 'aria-current="page"' : ''}>${icon(g.highlighted ? 'star' : GROUP_ICON[g.type] || 'chat')}<span class="name">${esc(g.name)}${g.highlighted ? `<span class="sr-only"> ${t('nav.featured')}</span>` : ''}</span></a>`;
  const sec = (title, type) => {
    const list = G.groups.filter((g) => g.type === type);
    return list.length ? `<div class="sec">${title}</div>${list.map(item).join('')}` : '';
  };
  const nav = (hash, name, label, ic) => `<a class="nav-item" href="${hash}" ${r.name === name ? 'aria-current="page"' : ''}>${icon(ic)}<span class="name">${label}</span></a>`;
  $('#side').innerHTML = `<div class="brand"><span class="logo">JK</span>JKR talks</div><h1 class="mob-title">${t('nav.guestGroups')}</h1>
    <div class="card col guest-welcome" style="gap:8px;margin:4px 8px 8px">
      <div class="small">${t('guest.welcome')}</div>
      <div class="row" style="gap:8px">${langButton()}<a class="btn sm grow" href="#/login">${t('auth.login')}</a><a class="btn primary sm grow" href="#/register">${t('guest.signup')}</a></div></div>
    <div class="sec">${t('nav.other')}</div>
    ${G.trendId ? `<a class="nav-item" href="#/g/${G.trendId}" ${G.trendId === activeId ? 'aria-current="page"' : ''}>${icon('trend')}<span class="name">${t('nav.trend')}</span></a>` : ''}
    ${nav('#/hot', 'hot', t('nav.hot'), 'flame')}
    ${nav('#/news', 'news', t('nav.news'), 'news')}
    ${nav('#/tools', 'tools', t('nav.tools'), 'tool')}
    ${sec(t('nav.country'), 'country')}${sec(t('nav.region'), 'region')}${sec(t('nav.province'), 'province')}${sec(t('nav.topics'), 'topic')}`;
  const tab = (hash, on, label, ic) => `<a href="${hash}" ${on ? 'aria-current="page"' : ''}>${icon(ic, 22)}${label}</a>`;
  $('#tabs').innerHTML =
    tab('#/explore', r.name === 'explore' || (r.name === 'g' && activeId !== G.trendId), t('tab.groups'), 'chat') +
    (G.trendId ? tab(`#/g/${G.trendId}`, activeId === G.trendId, t('nav.trend'), 'trend') : '') +
    tab('#/news', r.name === 'news', t('nav.news'), 'news') +
    tab('#/hot', r.name === 'hot', t('nav.hot'), 'flame') +
    tab('#/login', false, t('auth.login'), 'friends');
}

function msgHtml(m) {
  const quote = m.reply ? `<div class="quote">↪ ${esc(m.reply.displayName)}: ${m.reply.body ? esc(m.reply.body) : m.reply.hasImage ? t('a.photoTag') : ''}</div>` : '';
  const fwd = m.fwd ? `<div class="tiny muted fwd">↪ ${t('ch.fwdFrom', { n: esc(m.fwd.name) })}${m.fwd.group ? ` · ${esc(m.fwd.group)}` : ''}</div>` : '';
  const rr = roleOf(m.user, m.modRole);
  return `<div class="msg" data-mid="${m.id}">${avatarR(m.user, rr)}
    <div class="body">
      <div class="meta"><span class="who${roleClass(rr)}">${esc(m.user.displayName)}${roleSr(rr)}</span><span class="tiny muted time">${fmtTime(m.createdAt)}</span></div>
      ${fwd}${quote}${m.body ? `<div class="text">${linkify(m.body)}</div>` : ''}${(m.imageUrls?.length || m.imageUrl) ? `<div class="bmedia">${newsGallery(m.imageUrls?.length ? m.imageUrls : [m.imageUrl], 'guest-zoom')}</div>` : ''}
      ${previewHtml(m.preview)}
      <div class="row" style="gap:4px;margin-top:2px"><button type="button" class="heart" data-act="guest-cta" aria-label="${t('news.heartGuest', { n: m.hearts })}">${icon('heart', 15)}<span class="hc">${m.hearts || ''}</span></button></div>
      ${(m.reactions || []).length ? `<div class="reacts">${m.reactions.map((r) => `<span class="rchip">${emojiHtml(r.emoji, r.custom)}<span>${r.count}</span></span>`).join('')}</div>` : ''}
    </div></div>`;
}
actions['guest-zoom'] = (el) => lightbox(el.dataset.src);
actions['guest-cta'] = () => go('#/register');

async function renderGuestGroup(view, gid) {
  const { group: g, messages, limit } = await api('GET', `/public/groups/${gid}`);
  let last = '', list = '';
  for (const m of messages) {
    const k = dayKey(m.createdAt);
    if (k !== last) { list += `<div class="day">${fmtDate(m.createdAt)}</div>`; last = k; }
    list += msgHtml(m);
  }
  const sub = g.type === 'trend' ? t('guest.subTrend') : g.type === 'topic' ? t('nav.topics') : t('nav.guestGroups');
  view.innerHTML = `
  <div class="chat-head">
    <a class="icon-btn back" href="#/explore" aria-label="${t('ch.backList')}">${icon('back', 22)}</a>
    ${groupAvatar(g)}
    <div class="grow"><h1>${esc(g.name)}</h1><div class="small muted sub">${sub} · ${t('gu.readOnly')}</div></div>
    ${g.type === 'topic' ? `<button class="icon-btn" data-act="share-topic" data-id="${g.id}" data-name="${esc(g.name)}" aria-label="${t('ch.shareTopic')}" title="${t('ch.shareTopic')}">${icon('share', 20)}</button>` : ''}
  </div>
  <div class="chat-body"><div class="chat-col">
    <div class="msgs" id="msgs">
      ${messages.length >= limit ? `<div class="notice small" style="margin:8px">${t('guest.limit', { n: limit })} <a href="#/register" style="color:var(--accent);font-weight:600">${t('guest.signup')}</a> ${t('guest.limitCta')}</div>` : ''}
      ${list || `<div class="gate muted">${t('gu.noMsgs')}</div>`}
    </div>
    <div class="composer">${cta(g.type === 'trend' ? t('guest.ctaTrend') : t('guest.ctaGroup'))}</div>
  </div></div>`;
  const box = $('#msgs');
  box.scrollTop = box.scrollHeight;
  // khách mở chủ đề (thường qua link chia sẻ) → đăng nhập/đăng ký xong quay lại đúng chủ đề
  try { if (g.type === 'topic') sessionStorage.setItem('jkr_next', `#/chat/${g.id}`); else sessionStorage.removeItem('jkr_next'); } catch { /* bỏ qua */ }
}

let gtab = 'all';
async function renderGuestHot(view, tab = gtab) {
  gtab = tab;
  const [{ items, pinned = [] }, board, boardNew] = await Promise.all([api('GET', '/public/hot'), tab === 'all' ? api('GET', '/public/topic-board?tab=hot') : tab === 'hot' || tab === 'new' ? api('GET', '/public/topic-board?tab=' + tab) : Promise.resolve(null), tab === 'all' ? api('GET', '/public/topic-board?tab=new') : Promise.resolve(null)]);
  const adminCard = (m) => `<div class="card col" style="gap:6px">
      <div class="row wrap"><span class="pill warn">${t('hot.fromAdmin')}</span><span class="tiny muted">${fmtDateTime(m.createdAt)}</span></div>
      <div class="row">${avatarR(m.user, roleOf(m.user))}<div class="grow"><b class="${roleClass(roleOf(m.user)).trim()}">${esc(m.user.displayName)}${roleSr(roleOf(m.user))}</b></div></div>
      ${m.body ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${linkify(m.body, [])}</div>` : ''}
      ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="${t('hot.postPhoto')}" style="max-width:100%;border-radius:10px" loading="lazy" decoding="async">` : ''}
      ${previewHtml(m.preview)}
      <div class="row" style="gap:4px"><button type="button" class="heart" data-act="guest-cta" aria-label="${t('news.heartGuest', { n: m.hearts })}">${icon('heart', 15)}<span class="hc">${m.hearts || ''}</span></button></div>
    </div>`;
  const heartCard = (m, i) => `<div class="card col" style="gap:6px">
      <div class="row wrap"><span class="pill">#${i + 1}</span><span class="pill warn">${t('hot.interactions', { n: m.interactions })}</span><a class="pill warn" href="#/g/${m.groupId}">${esc(m.groupName)} →</a>
        <span class="row" style="gap:4px;margin-left:auto;color:var(--heart);font-weight:700">${icon('heart', 16, 'fill="currentColor"')}${m.hearts}</span></div>
      <div class="row">${avatar(m.user)}<div class="grow"><b>${esc(m.user.displayName)}</b> <span class="tiny muted">${fmtDateTime(m.createdAt)}</span></div></div>
      ${m.body ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${linkify(m.body)}</div>` : ''}
      ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="${t('hot.msgPhoto')}" style="max-width:240px;border-radius:10px" loading="lazy" decoding="async">` : ''}
      ${previewHtml(m.preview)}
    </div>`;
  let body;
  if (tab === 'all') {
    body = `${pinned.length ? `${sectionHead(t('hot.tAdmin'), 'admin')}<div class="list">${pinned.slice(0, ALL_N).map(adminCard).join('')}</div>` : ''}
      ${board.topics.length ? `${sectionHead(t('hot.featuredTopics'), 'hot')}<div class="list">${board.topics.slice(0, ALL_N).map((t) => boardCard(t, 'hot', true)).join('')}</div>` : ''}
      ${items.length ? `${sectionHead(t('hot.tHearts'), 'hearts')}<div class="list">${items.slice(0, ALL_N).map(heartCard).join('')}</div>` : ''}
      ${boardNew.topics.length ? `${sectionHead(t('hot.newTopics'), 'new')}<div class="list">${boardNew.topics.slice(0, ALL_N).map((t) => boardCard(t, 'new', true)).join('')}</div>` : ''}
      ${!board.topics.length && !pinned.length && !items.length && !boardNew.topics.length ? `<p class="muted">${t('gu.nothing')}</p>` : ''}`;
  } else if (tab === 'admin') body = `<div class="list">${pinned.map(adminCard).join('') || `<p class="muted">${t('hot.noAdmin')}</p>`}</div>`;
  else if (board) body = `<div class="list">${board.topics.map((t) => boardCard(t, tab, true)).join('') || `<p class="muted">${t('hot.noTopics')}</p>`}</div>`;
  else body = `<p class="small muted">${t('gu.heartsNote')}</p><div class="list">${items.map(heartCard).join('') || `<p class="muted">${t('gu.noHot')}</p>`}</div>`;
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>${t('nav.hot')}</h1>
    ${cta()}
    <div class="pillnav" role="group" aria-label="${t('sh.section')}">${HOT_TABS.map(([k, n]) => `<button data-htab="${k}" aria-pressed="${tab === k}">${t(n)}</button>`).join('')}</div>
    ${body}
  </div></div>`;
  view.querySelectorAll('[data-htab]').forEach((b) => (b.onclick = () => renderGuestHot(view, b.dataset.htab).catch(() => {})));
}

async function renderGuestNews(view) {
  const { news } = await api('GET', `/public/news?lang=${getLang()}`);
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>${t('nav.news')}</h1>
    <p class="small muted">${t('news.introGuest')}</p>
    ${cta()}
    <div class="list">${news.map((n) => `<article class="card col">
      <div class="row wrap">${n.pinned ? `<span class="pill warn">${t('news.pinned')}</span>` : ''}<span class="tiny muted">${fmtDateTime(n.createdAt)}</span>${n.edited ? `<span class="tiny muted">${t('news.edited')}</span>` : ''}</div>
      ${newsText(n)}
      ${newsGallery(n.imageUrls, 'guest-zoom')}
      <div class="row" style="gap:4px"><button type="button" class="heart" data-act="guest-cta" aria-label="${t('news.heartGuest', { n: n.hearts })}">${icon('heart', 15)}<span class="hc">${n.hearts || ''}</span></button></div>
    </article>`).join('') || `<p class="muted">${t('news.empty')}</p>`}</div></div></div>`;
  fitNews(view);
}

// Điều hướng cho khách. Trả về false nếu route này không dành cho khách.
export async function routeGuest(root, r) {
  if (r.name === 'chat' && r.arg) return go(`#/g/${r.arg}`), true; // link nhóm được chia sẻ
  if (!['explore', 'g', 'hot', 'news', 'tools', ''].includes(r.name)) return false;
  if (!r.name) return go('#/news'), true; // vào trang gốc → Bản tin
  buildGuestShell(root);
  maybeAskLang();
  await Promise.all([loadGroups(), loadEmoji(true)]);
  const app = $('#app');
  app.classList.toggle('show-side', r.name === 'explore');
  app.classList.toggle('in-chat', r.name === 'g');
  renderGuestSide(r);
  const view = $('#view');
  try {
    if (r.name === 'explore') {
      if (wide() && G.groups.length) return go(`#/g/${G.groups.find((g) => g.type === 'country')?.id || G.groups[0].id}`), true;
      view.innerHTML = `<div class="gate muted">${t('gu.pickGroup')}</div>`;
    } else if (r.name === 'g') await renderGuestGroup(view, Number(r.arg));
    else if (r.name === 'hot') await renderGuestHot(view);
    else if (r.name === 'news') await renderGuestNews(view);
    else if (r.name === 'tools') renderTools(view);
  } catch (e) {
    view.innerHTML = `<div class="gate"><p>${esc(e.message)}</p><a class="btn" href="#/explore">${t('gu.backGroups')}</a></div>`;
  }
  return true;
}
