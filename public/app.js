import { $, $$, esc, S, api, go, icon, avatar, fmtDateTime, toast, fail, openModal, closeModal, refreshGroups, refreshCounters, setToken, actions, isStaff, mutedNow, lvBadge, coinIcon } from './core.js';
import { renderLevel, showLevelUp } from './level.js';
import { renderShop, renderTitles } from './shop.js';
import { nameCls } from './frames.js';
import { loadEmoji, onReactionsEvent } from './emoji.js';
import { startTracking } from './track.js';
import { renderChat, onSocket } from './chat.js';
import { renderFriends, renderJoin } from './social.js';
import { renderHot } from './hot.js';
import { renderMuayThai } from './muaythai.js';
import { renderGames } from './games.js';
import { renderPets } from './pets.js';
import { routeGuest } from './guest.js';
import { renderWelcome } from './welcome.js';
import { renderTopics } from './topics.js';
import { registerSW, syncPush, unsubscribeThisDevice } from './push.js';
import { renderBugs } from './bugs.js';
import { initLang, setLang, t } from './i18n.js';
import { renderLogin, renderRegister, renderDiscover, renderNews, renderSettings, renderAdmin, renderTools } from './pages.js';

const root = $('#root');
const wide = () => matchMedia('(min-width: 900px)').matches;

// ---- shell -----------------------------------------------------------------------
function buildShell() {
  root.innerHTML = `<div class="app" id="app">
    <nav class="side" id="side" aria-label="${t('nav.groupsAria')}"></nav>
    <main class="main" id="view"></main>
    <nav class="tabs-bar" id="tabs" aria-label="${t('nav.navAria')}"></nav></div>`;
}

const GROUP_ICON = { country: 'flag', region: 'grid', province: 'pin', private: 'lock', dm: 'chat', topic: 'chat' };
function renderSide() {
  const side = $('#side');
  if (!side || !S.me) return;
  // Chủ đề nổi bật (Admin đặt) luôn hiện đầu mục, kể cả khi chưa tham gia; sau đó là các chủ đề đã tham gia
  const topicItems = (item, activeId) => {
    const hl = S.highlights || [];
    const mine = S.groups.filter((g) => g.type === 'topic');
    const hot = hl.map((h) => {
      const g = mine.find((x) => x.id === h.id);
      return `<a class="nav-item hl-topic" href="#/chat/${h.id}" ${h.id === activeId ? 'aria-current="page"' : ''}>${icon('star')}<span class="name">${esc(h.name)}<span class="sr-only"> ${t('nav.featured')}</span></span>${(g ? g.unread : h.unread) ? `<span class="badge" aria-label="${t('nav.unread', { n: g ? g.unread : h.unread })}">${g ? g.unread : h.unread}</span>` : ''}</a>`;
    }).join('');
    return hot + mine.filter((g) => !hl.some((h) => h.id === g.id)).map(item).join('');
  };
  const r = parseHash();
  const activeId = r.name === 'chat' ? Number(r.arg) : 0;
  const item = (g) => `<a class="nav-item" href="#/chat/${g.id}" ${g.id === activeId ? 'aria-current="page"' : ''}>
    ${g.type === 'dm' ? avatar(g.peer, '" style="width:20px;height:20px;font-size:11px') : icon(GROUP_ICON[g.type])}
    <span class="name">${esc(g.name)}${g.muted ? ` <span class="tiny muted">${t('nav.muted')}</span>` : ''}</span>${g.unread ? `<span class="badge" aria-label="${t('nav.unread', { n: g.unread })}">${g.unread}</span>` : ''}</a>`;
  const tg = S.groups.find((g) => g.type === 'trend');
  const sec = (title, type) => {
    const list = S.groups.filter((g) => g.type === type);
    return list.length ? `<div class="sec">${title}</div>${list.map(item).join('')}` : '';
  };
  const nav = (hash, name, label, ic, badge) => `<a class="nav-item" href="${hash}" ${r.name === name ? 'aria-current="page"' : ''}>${icon(ic)}<span class="name">${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  side.innerHTML = `<div class="brand"><span class="logo">JK</span>JKR talks</div><h1 class="mob-title">${t('nav.yourGroups')}</h1>
    ${sec(t('nav.country'), 'country')}${sec(t('nav.region'), 'region')}${sec(t('nav.province'), 'province')}
    <div class="sec">${t('nav.topics')}</div>${topicItems(item, activeId)}
    ${nav('#/topics', 'topics', t('nav.allTopics'), 'search')}
    ${sec(t('nav.private'), 'private')}
    <button class="nav-item accent" data-act="create-private">${icon('plus')}<span class="name">${t('nav.createPrivate')}</span></button>
    ${sec(t('nav.dm'), 'dm')}
    <div class="sec">${t('nav.other')}</div>
    ${tg ? `<a class="nav-item" href="#/chat/${tg.id}" ${tg.id === activeId ? 'aria-current="page"' : ''}>${icon('trend')}<span class="name">${t('nav.trend')}</span>${tg.unread ? `<span class="badge">${tg.unread}</span>` : ''}</a>` : ''}
    ${nav('#/discover', 'discover', t('nav.discover'), 'search')}
    ${nav('#/hot', 'hot', t('nav.hot'), 'flame', S.unreadHot)}
    ${nav('#/news', 'news', t('nav.news'), 'news', S.unreadNews)}
    ${nav('#/friends', 'friends', t('nav.friends'), 'friends')}
    <a class="nav-item" href="#/level" ${r.name === 'level' ? 'aria-current="page"' : ''}>${coinIcon(20)}<span class="name">${t('nav.level')}</span></a>
    <a class="nav-item" href="#/shop" ${r.name === 'shop' ? 'aria-current="page"' : ''}>${icon('star', 20)}<span class="name">${t('nav.shop')}</span></a>
    <a class="nav-item" href="#/titles" ${r.name === 'titles' ? 'aria-current="page"' : ''}>${icon('trend', 20)}<span class="name">${t('nav.titles')}</span></a>
    <a class="nav-item" href="#/games" ${['games', 'muaythai', 'pets'].includes(r.name) ? 'aria-current="page"' : ''}>${icon('glove')}<span class="name">${t('nav.games')}</span></a>
    ${nav('#/tools', 'tools', t('nav.tools'), 'tool')}
    ${S.me.role === 'admin' ? '' : `<button class="nav-item" data-act="report-bug">${icon('bug')}<span class="name">${t('nav.reportBug')}</span></button>`}
    ${S.me.role === 'admin' ? nav('#/bugs', 'bugs', t('nav.bugs'), 'bug') : ''}
    ${isStaff() ? nav('#/admin', 'admin', S.me.role === 'admin' ? t('nav.admin') : t('nav.reports'), 'shield') : ''}
    <button class="nav-item" data-act="notifs">${icon('bell')}<span class="name">${t('nav.notifs')}</span>${S.unreadNotif ? `<span class="badge">${S.unreadNotif}</span>` : ''}</button>
    <a class="nav-item only-mobile" href="#/settings" ${r.name === 'settings' ? 'aria-current="page"' : ''}>${icon('gear')}<span class="name">${t('nav.settings')}</span></a>
    <div class="side-foot"><a class="nav-item" href="#/settings" style="min-height:48px" ${r.name === 'settings' ? 'aria-current="page"' : ''}>${avatar(S.me)}<span class="name${nameCls(S.me)}" style="font-weight:600">${esc(S.me.displayName)}${lvBadge(S.me.level)}</span>${icon('gear')}</a></div>`;

  const chatUnread = S.groups.reduce((n, g) => n + (g.type === 'trend' ? 0 : g.unread || 0), 0) + (S.highlights || []).reduce((n, h) => n + (S.groups.some((g) => g.id === h.id) ? 0 : h.unread || 0), 0);
  const trendTab = tg ? `<a href="#/chat/${tg.id}" ${tg.id === activeId ? 'aria-current="page"' : ''}>${icon('trend', 22)}${t('nav.trend')}${tg.unread ? `<span class="badge">${tg.unread}</span>` : ''}</a>` : '';
  const tab = (hash, name, label, ic, badge) => `<a href="${hash}" ${(r.name === name && !(name === 'chat' && tg && activeId === tg.id)) ? 'aria-current="page"' : ''}>${icon(ic, 22)}${label}${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  $('#tabs').innerHTML = tab('#/chat', 'chat', t('tab.groups'), 'chat', chatUnread + S.unreadNotif) + trendTab + tab('#/news', 'news', t('nav.news'), 'news', S.unreadNews) + tab('#/hot', 'hot', t('nav.hot'), 'flame', S.unreadHot) + `<a href="#/level" ${r.name === 'level' ? 'aria-current="page"' : ''}>${S.me.level ? lvBadge(S.me.level, 24) : coinIcon(24)}${t('nav.level')}</a>`;
  const total = chatUnread + S.unreadNews + S.unreadNotif + S.unreadHot;
  document.title = total ? `(${total}) JKR talks` : 'JKR talks';
}
S.hooks.renderSide = renderSide;
S.hooks.toastMsg = (g, m) => toast(`${g.type === 'dm' ? '' : g.name + ' · '}${m.user.displayName}: ${m.body || '[Ảnh]'}`.slice(0, 120));

// ---- router ----------------------------------------------------------------------
function parseHash() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = '', arg = ''] = path.split('/');
  return { name, arg, query: new URLSearchParams(qs || '') };
}

let routeSeq = 0;
async function route() {
  const r = parseHash();
  const seq = ++routeSeq;
  closeModal();
  if (!S.token || !S.me) {
    if (r.name === 'register') return renderRegister(root);
    if (r.name === 'login') return renderLogin(root, r.query);
    if (await routeGuest(root, r)) return; // khách: xem nhóm công khai, Chủ đề nóng, Bản tin
    return go('#/login');
  }
  if (r.name === 'explore' || r.name === 'g') return go(r.name === 'g' && r.arg ? `#/chat/${r.arg}` : '#/chat');
  if ($('#app.guest')) root.innerHTML = '';
  if (r.name === 'login' || r.name === 'register' || !r.name) return go('#/chat');
  if (!$('#app')) buildShell();
  const view = $('#view');
  const app = $('#app');
  app.classList.toggle('show-side', r.name === 'chat' && !r.arg);
  app.classList.toggle('in-chat', r.name === 'chat' && !!r.arg);
  renderSide();
  try {
    switch (r.name) {
      case 'chat':
        if (!r.arg) {
          if (wide() && S.groups.length) return go(`#/chat/${S.groups[0].id}`);
          view.innerHTML = '<div class="gate muted">Chọn một nhóm để bắt đầu trò chuyện.</div>';
          return;
        }
        return await renderChat(view, Number(r.arg));
      case 'welcome': return await renderWelcome(view, Number(r.arg));
      case 'topics': return await renderTopics(view);
      case 'tools': return renderTools(view);
      case 'discover': return await renderDiscover(view);
      case 'friends': return await renderFriends(view);
      case 'games': return await renderGames(view);
      case 'muaythai': return await renderMuayThai(view, r.arg);
      case 'pets': return await renderPets(view, r.arg);
      case 'hot':
        if (S.unreadHot) { S.unreadHot = 0; renderSide(); }
        api('POST', '/hot/seen').catch(() => {});
        return await renderHot(view);
      case 'bugs': return await renderBugs(view);
      case 'news': await refreshCounters().catch(() => {}); return await renderNews(view);
      case 'settings': return renderSettings(view);
      case 'level': return await renderLevel(view);
      case 'shop': return await renderShop(view);
      case 'titles': return await renderTitles(view);
      case 'admin': return await renderAdmin(view);
      case 'join': return await renderJoin(view, r.arg);
      default: return go('#/chat');
    }
  } catch (e) {
    if (seq === routeSeq) view.innerHTML = `<div class="gate"><p>${esc(e.message)}</p><a class="btn" href="#/chat">Về trang chính</a></div>`;
  }
}
window.addEventListener('hashchange', route);

// ---- realtime -------------------------------------------------------------------
let ws, wsTimer, wsTries = 0;
function connectWs() {
  clearTimeout(wsTimer);
  if (!S.token) return;
  ws?.close();
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(S.token)}`);
  ws.onopen = () => { if (wsTries) { refreshGroups().catch(() => {}); } wsTries = 0; };
  ws.onmessage = (e) => {
    let ev; try { ev = JSON.parse(e.data); } catch { return; }
    if (ev.type === 'reactions') return onReactionsEvent(ev);
    if (ev.type === 'emoji_changed') return void loadEmoji().catch(() => {});
    if (['message', 'message_deleted', 'message_preview', 'heart', 'pin'].includes(ev.type)) return onSocket(ev);
    if (ev.type === 'notification') {
      S.unreadNotif++; renderSide();
      toast(ev.notification.text, 7000);
      if (['group_invite', 'join_approved', 'group_dissolved', 'moderation'].includes(ev.notification.type)) refreshGroups().catch(() => {});
      if (ev.notification.type === 'title') api('GET', '/me').then((r) => { S.me = r.user; renderSide(); if (['titles', 'shop'].includes(parseHash().name)) route(); }).catch(() => {});
      if (ev.notification.type === 'level') api('GET', '/me').then(async (r) => { S.me = r.user; renderSide(); if (parseHash().name === 'level') await route(); showLevelUp(r.levelUp); }).catch(() => {});
      if (ev.notification.type === 'friend_accept' && parseHash().name === 'friends') route();
    } else if (ev.type === 'news') { S.unreadNews++; renderSide(); toast(`Bản tin mới: ${ev.news.title}`, 7000); }
    else if (ev.type === 'trend_sub') window.dispatchEvent(new CustomEvent('trend-sub'));
    else if (ev.type === 'trend_caps') window.dispatchEvent(new CustomEvent('trend-caps'));
    else if (ev.type === 'mt_pvp') window.dispatchEvent(new CustomEvent('mt-pvp', { detail: ev }));
    else if (ev.type === 'news_silent') { S.unreadNews++; renderSide(); }
    else if (ev.type === 'hot_new') { if (parseHash().name === 'hot') api('POST', '/hot/seen').catch(() => {}); else { S.unreadHot++; renderSide(); } }
    else if (ev.type === 'bug_new') { toast('Có báo lỗi mới'); if (parseHash().name === 'bugs') route(); }
    else if (ev.type === 'report_new') { toast('Có báo cáo mới cần xử lý'); if (parseHash().name === 'admin') route(); }
    else if (ev.type === 'locked') logout(true);
  };
  ws.onclose = (e) => {
    if (!S.token || e.code === 4001) return;
    wsTimer = setTimeout(connectWs, Math.min(1000 * 2 ** wsTries++, 15000));
  };
}

// ---- boot / logout ---------------------------------------------------------------
async function boot() {
  try {
    S.geo ||= await api('GET', '/geo');
    if (!S.token) { startTracking(); return route(); } // khách

    const meRes = await api('GET', '/me');
    S.me = meRes.user;
    setLang(S.me.language || 'vi'); // người dùng đăng nhập: dùng ngôn ngữ đã lưu trong tài khoản
    await Promise.all([refreshGroups(), refreshCounters(), loadEmoji()]);
    connectWs();
    syncPush();
    // chủ đề nổi bật chưa tham gia không nhận tin realtime: hỏi lại số tin mới mỗi 30 giây khi đang mở trang
    clearInterval(S._hlTimer);
    S._hlTimer = setInterval(() => { if (!document.hidden && S.token && (S.highlights || []).some((h) => !S.groups.some((g) => g.id === h.id))) refreshGroups().catch(() => {}); }, 30000);
    if (!parseHash().name || ['login', 'register'].includes(parseHash().name)) {
      // vừa đăng nhập/đăng ký từ một chủ đề được chia sẻ → quay lại đúng chủ đề đó
      let next = null;
      try { next = sessionStorage.getItem('jkr_next'); sessionStorage.removeItem('jkr_next'); } catch { /* bỏ qua */ }
      history.replaceState(null, '', next && /^#\/chat\/\d+$/.test(next) ? next : '#/chat');
    }
    root.innerHTML = '';
    route();
    showLevelUp(meRes.levelUp);
    startTracking(); // người dùng đã đăng ký (hoặc vừa đăng nhập từ trình duyệt từng là khách)
  } catch (e) {
    if (S.token) { setToken(null); S.me = null; }
    startTracking();
    route();
  }
}
async function logout(silent) {
  if (!silent) await unsubscribeThisDevice().catch(() => {}); // thiết bị này thôi nhận thông báo của tài khoản cũ
  if (!silent) await api('POST', '/auth/logout').catch(() => {});
  setToken(null);
  S.me = null; S.groups = []; S.unreadNews = 0; S.unreadNotif = 0; S.unreadHot = 0;
  clearTimeout(wsTimer); ws?.close(); ws = null;
  root.innerHTML = '';
  document.title = 'JKR talks';
  if (silent) toast('Phiên đăng nhập đã kết thúc');
  location.hash = '#/login';
  route();
}
S.hooks.boot = boot;
S.hooks.logout = logout;

// ---- thông báo -------------------------------------------------------------------
actions.notifs = async () => {
  try {
    const { notifications } = await api('GET', '/notifications');
    openModal(`<div class="row" style="justify-content:space-between"><h2>Thông báo</h2><button type="button" class="icon-btn" data-close aria-label="Đóng">${icon('x', 20)}</button></div><div class="list notif-list">${notifications.map((n) => `<div class="card col" ${n.url ? `role="link" tabindex="0" data-nurl="${esc(n.url)}" data-nmsg="${n.msgId || ''}"` : ''} style="gap:2px;${n.url ? 'cursor:pointer;' : ''}${n.read ? '' : 'border-color:var(--accent)'}"><div class="small">${esc(n.text)}</div><div class="tiny muted">${fmtDateTime(n.createdAt)}</div></div>`).join('') || '<p class="muted small">Chưa có thông báo nào.</p>'}</div>
      <div class="btns"><button class="btn primary" data-close>Đóng</button></div>`);
    for (const b of document.querySelectorAll('#modal [data-close]')) b.onclick = closeModal;
    const openNotif = (e) => {
      if (e.type === 'keydown' && e.key !== 'Enter') return;
      const card = e.target.closest('[data-nurl]'); if (!card) return;
      const hash = card.dataset.nurl.replace(/^\/?#?/, '#'), msg = Number(card.dataset.nmsg) || 0;
      closeModal();
      if (msg && location.hash === hash) return window.dispatchEvent(new CustomEvent('goto-msg', { detail: msg })); // đã ở đúng nhóm: chỉ cuộn tới tin
      S.jumpMsg = msg || null; go(hash);
    };
    $('#modal .notif-list').addEventListener('click', openNotif); $('#modal .notif-list').addEventListener('keydown', openNotif);
    if (S.unreadNotif) { await api('POST', '/notifications/read'); S.unreadNotif = 0; renderSide(); }
  } catch (e) { fail(e); }
};

// ---- listener toàn cục cho nút data-act ----------------------------------------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch(fail); }
});

registerSW();
initLang();
boot();
