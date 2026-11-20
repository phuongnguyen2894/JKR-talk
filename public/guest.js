// Chế độ khách (chưa đăng ký): chỉ đọc nhóm công khai, Đẩy trend, Chủ đề nóng, Bản tin
import { $, esc, api, go, icon, avatar, groupAvatar, fmtTime, fmtDate, fmtDateTime, dayKey, actions, lightbox, linkify } from './core.js';
import { previewHtml } from './chat.js';

const G = { groups: null, trendId: 0 };
const GROUP_ICON = { country: 'flag', region: 'grid', province: 'pin' };
const wide = () => matchMedia('(min-width: 900px)').matches;

async function loadGroups() {
  if (!G.groups) {
    G.groups = (await api('GET', '/public/groups')).groups;
    G.trendId = G.groups.find((g) => g.type === 'trend')?.id || 0;
  }
  return G.groups;
}

const cta = (text = 'Đăng ký để thả tim, trò chuyện và tham gia các nhóm.') =>
  `<div class="guest-cta" role="region" aria-label="Mời đăng ký"><span class="grow small">${text}</span>
    <a class="btn sm" href="#/login">Đăng nhập</a><a class="btn primary sm" href="#/register">Đăng ký</a></div>`;

function buildGuestShell(root) {
  if ($('#app.guest')) return;
  root.innerHTML = `<div class="app guest" id="app">
    <nav class="side" id="side" aria-label="Nhóm công khai"></nav>
    <main class="main" id="view"></main>
    <nav class="tabs-bar" id="tabs" aria-label="Điều hướng"></nav></div>`;
}

function renderGuestSide(r) {
  const activeId = r.name === 'g' ? Number(r.arg) : 0;
  const item = (g) => `<a class="nav-item" href="#/g/${g.id}" ${g.id === activeId ? 'aria-current="page"' : ''}>${icon(GROUP_ICON[g.type] || 'chat')}<span class="name">${esc(g.name)}</span></a>`;
  const sec = (title, type) => {
    const list = G.groups.filter((g) => g.type === type);
    return list.length ? `<div class="sec">${title}</div>${list.map(item).join('')}` : '';
  };
  const nav = (hash, name, label, ic) => `<a class="nav-item" href="${hash}" ${r.name === name ? 'aria-current="page"' : ''}>${icon(ic)}<span class="name">${label}</span></a>`;
  $('#side').innerHTML = `<div class="brand"><span class="logo">JK</span>JKR talks</div><h1 class="mob-title">Nhóm công khai</h1>
    <div class="card col guest-welcome" style="gap:8px;margin:4px 8px 8px">
      <div class="small">Bạn đang xem với tư cách <b>khách</b>. Chỉ đọc được các nhóm công khai, tin nhắn chỉ được lưu 38 ngày.</div>
      <div class="row" style="gap:8px"><a class="btn sm grow" href="#/login">Đăng nhập</a><a class="btn primary sm grow" href="#/register">Đăng ký</a></div></div>
    <div class="sec">Khác</div>
    ${G.trendId ? `<a class="nav-item" href="#/g/${G.trendId}" ${G.trendId === activeId ? 'aria-current="page"' : ''}>${icon('trend')}<span class="name">Đẩy trend</span></a>` : ''}
    ${nav('#/hot', 'hot', 'Chủ đề nóng', 'flame')}
    ${nav('#/news', 'news', 'Bản tin', 'news')}
    ${sec('Cả nước', 'country')}${sec('Vùng', 'region')}${sec('Tỉnh / Thành phố', 'province')}`;
  const tab = (hash, on, label, ic) => `<a href="${hash}" ${on ? 'aria-current="page"' : ''}>${icon(ic, 22)}${label}</a>`;
  $('#tabs').innerHTML =
    tab('#/explore', r.name === 'explore' || (r.name === 'g' && activeId !== G.trendId), 'Nhóm', 'chat') +
    (G.trendId ? tab(`#/g/${G.trendId}`, activeId === G.trendId, 'Đẩy trend', 'trend') : '') +
    tab('#/news', r.name === 'news', 'Bản tin', 'news') +
    tab('#/hot', r.name === 'hot', 'Chủ đề nóng', 'flame') +
    tab('#/login', false, 'Đăng nhập', 'friends');
}

function msgHtml(m) {
  const quote = m.reply ? `<div class="quote">↪ ${esc(m.reply.displayName)}: ${m.reply.body ? esc(m.reply.body) : m.reply.hasImage ? '[Ảnh]' : ''}</div>` : '';
  const fwd = m.fwd ? `<div class="tiny muted fwd">↪ Chuyển tiếp từ ${esc(m.fwd.name)}${m.fwd.group ? ` · ${esc(m.fwd.group)}` : ''}</div>` : '';
  const role = m.modRole ? `<span class="pill">${m.modRole === 'mod' ? 'Mod' : 'Admin'}</span>` : '';
  return `<div class="msg" data-mid="${m.id}">${avatar(m.user)}
    <div class="body">
      <div class="meta"><span class="who">${esc(m.user.displayName)}</span>${role}<span class="tiny muted">${fmtTime(m.createdAt)}</span></div>
      ${fwd}${quote}${m.body ? `<div class="text">${linkify(m.body)}</div>` : ''}${m.imageUrl ? `<img class="pic" data-act="guest-zoom" data-src="${esc(m.imageUrl)}" src="${esc(m.imageUrl)}" alt="Ảnh trong tin nhắn" loading="lazy" decoding="async">` : ''}
      ${previewHtml(m.preview)}
      <div class="row" style="gap:4px;margin-top:2px"><button type="button" class="heart" data-act="guest-cta" aria-label="Thả tim (cần đăng ký), hiện có ${m.hearts} tim">${icon('heart', 15)}<span class="hc">${m.hearts || ''}</span></button></div>
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
  const sub = g.type === 'trend' ? 'Nơi đăng các bài cần tương tác' : 'Nhóm công khai';
  view.innerHTML = `
  <div class="chat-head">
    <a class="icon-btn back" href="#/explore" aria-label="Quay lại danh sách">${icon('back', 22)}</a>
    ${groupAvatar(g)}
    <div class="grow"><h1>${esc(g.name)}</h1><div class="small muted sub">${sub} · chế độ khách (chỉ đọc)</div></div>
  </div>
  <div class="chat-body"><div class="chat-col">
    <div class="msgs" id="msgs">
      ${messages.length >= limit ? `<div class="notice small" style="margin:8px">Khách chỉ xem được ${limit} tin gần nhất. <a href="#/register" style="color:var(--accent);font-weight:600">Đăng ký</a> để xem toàn bộ.</div>` : ''}
      ${list || '<div class="gate muted">Chưa có tin nhắn nào.</div>'}
    </div>
    <div class="composer">${cta(g.type === 'trend' ? 'Đăng ký để thả tim và lan tỏa các bài đẩy trend.' : 'Đăng ký để tham gia nhóm, thả tim và trò chuyện.')}</div>
  </div></div>`;
  const box = $('#msgs');
  box.scrollTop = box.scrollHeight;
}

async function renderGuestHot(view) {
  const { items } = await api('GET', '/public/hot');
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>Chủ đề nóng</h1>
    <p class="small muted">38 tin nhắn nhận được nhiều tim nhất ở các nhóm công khai trong 24 giờ qua.</p>
    ${cta()}
    <div class="list">${items.map((m, i) => `<div class="card col" style="gap:6px">
      <div class="row wrap"><span class="pill">#${i + 1}</span><a class="pill warn" href="#/g/${m.groupId}">${esc(m.groupName)} →</a>
        <span class="row" style="gap:4px;margin-left:auto;color:var(--heart);font-weight:700">${icon('heart', 16, 'fill="currentColor"')}${m.hearts}</span></div>
      <div class="row">${avatar(m.user)}<div class="grow"><b>${esc(m.user.displayName)}</b> <span class="tiny muted">${fmtDateTime(m.createdAt)}</span></div></div>
      ${m.body ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${linkify(m.body)}</div>` : ''}
      ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" alt="Ảnh trong tin nhắn" style="max-width:240px;border-radius:10px" loading="lazy" decoding="async">` : ''}
      ${previewHtml(m.preview)}
    </div>`).join('') || '<p class="muted">Chưa có chủ đề nóng nào.</p>'}</div>
  </div></div>`;
}

async function renderGuestNews(view) {
  const { news } = await api('GET', '/public/news');
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>Bản tin</h1>
    <p class="small muted">Thông báo từ đội vận hành JKR talks.</p>
    ${cta()}
    <div class="list">${news.map((n) => `<article class="card col">
      <div class="row wrap">${n.pinned ? '<span class="pill warn">Ghim</span>' : ''}<span class="tiny muted">${fmtDateTime(n.createdAt)}</span>${n.edited ? '<span class="tiny muted">· đã chỉnh sửa</span>' : ''}</div>
      <h2 style="font-size:18px">${esc(n.title)}</h2>
      <p class="news-body clamp" style="white-space:pre-wrap;overflow-wrap:anywhere">${linkify(n.body)}</p><button type="button" class="link-btn news-more" data-act="news-more" hidden>Xem thêm</button>
      ${n.imageUrl ? `<img src="${esc(n.imageUrl)}" alt="" style="max-width:100%;border-radius:12px" loading="lazy" decoding="async">` : ''}
    </article>`).join('') || '<p class="muted">Chưa có bản tin nào.</p>'}</div></div></div>`;
  view.querySelectorAll('.news-body').forEach((p) => { if (p.scrollHeight > p.clientHeight + 1) p.nextElementSibling.hidden = false; else p.classList.remove('clamp'); });
}

// Điều hướng cho khách. Trả về false nếu route này không dành cho khách.
export async function routeGuest(root, r) {
  if (r.name === 'chat' && r.arg) return go(`#/g/${r.arg}`), true; // link nhóm được chia sẻ
  if (!['explore', 'g', 'hot', 'news', ''].includes(r.name)) return false;
  if (!r.name) return go('#/news'), true; // vào trang gốc → Bản tin
  buildGuestShell(root);
  await loadGroups();
  const app = $('#app');
  app.classList.toggle('show-side', r.name === 'explore');
  app.classList.toggle('in-chat', r.name === 'g');
  renderGuestSide(r);
  const view = $('#view');
  try {
    if (r.name === 'explore') {
      if (wide() && G.groups.length) return go(`#/g/${G.groups.find((g) => g.type === 'country')?.id || G.groups[0].id}`), true;
      view.innerHTML = '<div class="gate muted">Chọn một nhóm để xem.</div>';
    } else if (r.name === 'g') await renderGuestGroup(view, Number(r.arg));
    else if (r.name === 'hot') await renderGuestHot(view);
    else if (r.name === 'news') await renderGuestNews(view);
  } catch (e) {
    view.innerHTML = `<div class="gate"><p>${esc(e.message)}</p><a class="btn" href="#/explore">Về danh sách nhóm</a></div>`;
  }
  return true;
}
