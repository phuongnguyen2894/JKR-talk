import { pushSectionHtml } from './push.js';
import { t, getLang, setLang } from './i18n.js';
import { langBar, restoreForm, applyLang } from './langpick.js';
import { newsText, fitNews } from './newstext.js';
import { LANGS } from './i18n.js';
import { adminEmoji } from './emoji.js';
import { adminGame } from './mtadmin.js';
import { renderStats } from './stats.js';
import { commentBlock } from './comments.js';
import { $, $$, esc, S, api, go, icon, locText, avatar, groupAvatar, fmtTime, fmtDate, fmtDateTime, toast, fail, openModal, closeModal, ask, confirmBox, refreshGroups, refreshCounters, actions, setToken, provinceName, imageToDataUrl, linkify, newsGallery, lightbox, lvBadge } from './core.js';

// ===========================================================================
// Đăng nhập / đăng ký (render vào #root, ngoài shell)
// ===========================================================================
export function renderLogin(root, query) {
  const note = '';
  root.innerHTML = `<div class="auth"><div class="auth-box">
    <div class="brand" style="padding:0"><span class="logo">JK</span>JKR talks</div>
    ${langBar()}
    <div><h1>${t('auth.login')}</h1><p class="muted small" style="margin-top:8px">${t('auth.loginSub')}</p><p class="muted small" style="margin-top:4px">${t('auth.focus')}</p></div>
    ${note}<div id="err"></div>
    <form id="lf" class="col">
      <div class="field"><label for="email">${t('auth.email')}</label><input class="input" id="email" type="email" required autocomplete="email" placeholder="you@email.com"></div>
      <div class="field"><label for="pw">${t('auth.password')}</label><input class="input" id="pw" type="password" required autocomplete="current-password"></div>
      <button class="btn primary block" style="min-height:52px;font-size:16px;border-radius:14px">${t('auth.login')}</button>
    </form>
    <p class="small muted">${t('auth.noAccount')} <a href="#/register" style="color:var(--accent);font-weight:600">${t('auth.signup')}</a></p>
    <p class="small muted"><a href="#/explore" style="color:var(--accent);font-weight:600">${t('auth.preview')}</a></p></div></div>`;
  restoreForm();
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('POST', '/auth/login', { email: $('#email').value, password: $('#pw').value });
      setToken(r.token);
      S.hooks.boot();
    } catch (er) { $('#err').innerHTML = `<div class="error" role="alert">${esc(er.message)}</div>`; }
  };
}

export async function renderRegister(root) {
  if (!S.geo) S.geo = await api('GET', '/geo');
  const { regions, provinces } = S.geo;
  root.innerHTML = `<div class="auth"><div class="auth-box">
    <div class="brand" style="padding:0"><span class="logo">JK</span>JKR talks</div>
    ${langBar()}
    <div><h1>${t('auth.signup')}</h1><p class="muted small" style="margin-top:8px">${t('auth.signupSub')}</p></div>
    <div id="err"></div>
    <form id="rf" class="col">
      <div class="field"><label for="email">${t('auth.email')}</label><input class="input" id="email" type="email" required autocomplete="email" placeholder="you@email.com"></div>
      <div class="field"><label for="dn">${t('auth.displayName')}</label><input class="input" id="dn" required minlength="2" maxlength="30" autocomplete="nickname" placeholder="${t('auth.dnPh')}"></div>
      <div class="field"><label for="pw">${t('auth.password')}</label><input class="input" id="pw" type="password" required minlength="8" autocomplete="new-password" placeholder="${t('set.pwHint')}"></div>
      <div class="field"><label for="pw2">${t('auth.confirmPw')}</label><input class="input" id="pw2" type="password" required minlength="8" autocomplete="new-password" placeholder="${t('auth.pw2Ph')}"></div>
      ${(S.geo.countries || []).length > 1 ? `<div class="field"><label for="country">${t('auth.country')}</label><select class="input" id="country">${S.geo.countries.map((c) => `<option value="${c.code}">${esc(c.names[getLang()] || c.name)}</option>`).join('')}</select></div>` : ''}
      <div class="geo-card" id="geocard">
        <div style="font-weight:700">${t('auth.where')}</div>
        <div class="field"><label for="region">${t('auth.region')}</label><select class="input" id="region">${regions.map((r) => `<option value="${r.code}">${esc(r.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="city">${t('auth.city')}</label><select class="input" id="city"></select></div>
        <div class="small muted" id="geohint"></div>
      </div>
      <label class="check" style="align-items:flex-start"><input type="checkbox" id="accept" required style="margin-top:2px"><span>${t('auth.accept')}</span></label>
      <button class="btn primary block" id="regbtn" disabled style="min-height:52px;font-size:16px;border-radius:14px">${t('auth.signup')}</button>
    </form>
    <p class="small muted">${t('auth.haveAccount')} <a href="#/login" style="color:var(--accent);font-weight:600">${t('auth.login')}</a></p></div></div>`;
  const fillCities = () => {
    $('#city').innerHTML = provinces.filter((p) => p.region === $('#region').value).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    hint();
  };
  const hint = () => {
    const r = regions.find((x) => x.code === $('#region').value);
    const c = provinces.find((p) => p.id === Number($('#city').value));
    $('#geohint').textContent = t('auth.geoHint', { r: r.name, c: c?.name });
  };
  $('#accept').onchange = (e) => { $('#regbtn').disabled = !e.target.checked; };
  const pickCountry = () => {
    const cc = $('#country')?.value || 'VN';
    $('#geocard').hidden = cc !== 'VN';
    $('#cnote')?.remove();
    if (cc !== 'VN') $('#geocard').insertAdjacentHTML('beforebegin', `<div class="small muted" id="cnote">${esc(t('auth.intlHint', { c: S.geo.countries.find((x) => x.code === cc).names[getLang()] }))}</div>`);
    $('#city').required = cc === 'VN';
  };
  if ($('#country')) $('#country').onchange = pickCountry;
  $('#region').onchange = fillCities;
  $('#city').onchange = hint;
  fillCities();
  restoreForm();
  pickCountry();
  $('#rf').onsubmit = async (e) => {
    e.preventDefault();
    if ($('#pw').value !== $('#pw2').value) { $('#err').innerHTML = `<div class="error" role="alert">${t('auth.pwMismatch')}</div>`; $('#pw2').focus(); return; }
    try {
      const r = await api('POST', '/auth/register', { email: $('#email').value, displayName: $('#dn').value, password: $('#pw').value, passwordConfirm: $('#pw2').value, acceptCommunity: $('#accept').checked, provinceId: Number($('#city').value), country: $('#country')?.value || 'VN', language: getLang() });
      setToken(r.token);
      S.hooks.boot();
    } catch (er) { $('#err').innerHTML = `<div class="error" role="alert">${esc(er.message)}</div>`; }
  };
}

// ===========================================================================
// Khám phá nhóm
// ===========================================================================
export async function renderDiscover(view) {
  let type = 'region', q = '';
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>Khám phá nhóm</h1>
    <label class="sr-only" for="q">Tìm nhóm</label>
    <input class="input" id="q" type="search" placeholder="Tìm vùng, tỉnh/thành">
    <div class="pillnav" role="group" aria-label="Loại nhóm">
      <button data-type="country" aria-pressed="false">Quốc gia</button><button data-type="region" aria-pressed="true">Vùng</button><button data-type="province" aria-pressed="false">Tỉnh / Thành</button></div>
    <p class="small muted">Nhóm công khai tại Việt Nam: vào tự do, không cần duyệt. Tham gia nhóm khác không làm đổi vị trí của bạn.</p>
    <div id="sugg"></div><div class="list" id="gl"></div></div></div>`;
  const load = async () => {
    const { groups } = await api('GET', `/groups/discover?type=${type}&q=${encodeURIComponent(q)}`);
    $('#gl').innerHTML = groups.map((g) => `<div class="card">${groupAvatar(g)}<div class="grow"><div style="font-weight:600">${esc(g.name)}</div><div class="tiny muted">${g.memberCount} thành viên</div></div>
      ${g.joined ? `<span class="pill ok" style="padding:6px 10px;font-size:13px">Đã vào</span><a class="btn sm" href="#/chat/${g.id}">Mở</a>` : `<button class="btn primary" data-act="join-from-discover" data-id="${g.id}">Tham gia</button>`}</div>`).join('') || '<p class="muted">Không tìm thấy nhóm phù hợp.</p>';
  };
  $$('.pillnav button', view).forEach((b) => (b.onclick = () => { type = b.dataset.type; $$('.pillnav button', view).forEach((x) => x.setAttribute('aria-pressed', x === b)); load().catch(fail); }));
  let t;
  $('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value; load().catch(fail); }, 200); };
  await load();
  if (!S.me.hideSuggestions) {
    const s = await api('GET', '/groups/suggestions').catch(() => ({ groups: [] }));
    if (s.groups.length) $('#sugg').innerHTML = `<div class="card col" style="background:var(--soft)"><div class="row between"><strong>Gợi ý cho bạn</strong><button class="link-btn" data-act="hide-sugg">Ẩn gợi ý</button></div>
      ${s.groups.map((g) => `<div class="row"><div class="grow"><b>${esc(g.name)}</b> <span class="tiny muted">· ${esc(g.reason)}</span></div><button class="btn sm primary" data-act="join-from-discover" data-id="${g.id}">Tham gia</button></div>`).join('')}</div>`;
  }
}
actions['join-from-discover'] = async (el) => {
  try { await api('POST', `/groups/${el.dataset.id}/join`); await refreshGroups(); toast('Đã tham gia nhóm'); go(`#/chat/${el.dataset.id}`); } catch (e) { fail(e); }
};
actions['hide-sugg'] = async () => {
  try { const r = await api('PATCH', '/me', { hideSuggestions: true }); S.me = r.user; $('#sugg').innerHTML = ''; } catch (e) { fail(e); }
};

// ===========================================================================
// Bản tin
// ===========================================================================
export async function renderNews(view) {
  const { news } = await api('GET', '/news');
  const admin = S.me.role === 'admin';
  const canPost = admin || (S.me.level || 0) >= 4; // từ cấp Tím Thủy Chung được đăng bản tin
  view.innerHTML = `<div class="page"><div class="page-inner">
    <div class="row between"><h1>${t('nav.news')}</h1>${canPost ? '<button class="btn primary" data-act="news-new">Đăng bản tin</button>' : ''}</div>
    <p class="small muted">${t('news.intro')}</p>
    <div class="list">${news.map((n) => `<article class="card col" ${n.read ? '' : 'style="border-color:var(--accent)"'}>
      <div class="row wrap">${n.pinned ? `<span class="pill warn">${t('news.pinned')}</span>` : ''}${n.read ? '' : `<span class="pill">${t('news.new')}</span>`}${n.author ? `<span class="tiny" style="font-weight:600">${esc(n.author.displayName)}${lvBadge(n.author.level, 16)}</span>` : ''}<span class="tiny muted">${fmtDateTime(n.createdAt)}</span>${n.edited ? '<span class="tiny muted">· đã chỉnh sửa</span>' : ''}</div>
      ${newsText(n)}
      ${newsGallery(n.imageUrls)}
      <div class="row" style="gap:4px"><button type="button" class="heart ${n.hearted ? 'on' : ''}" data-act="news-heart" data-id="${n.id}" aria-pressed="${n.hearted}" aria-label="${t('news.heart', { n: n.hearts })}">${icon('heart', 15, n.hearted ? 'fill="currentColor"' : '')}<span class="hc">${n.hearts || ''}</span></button>${commentBlock('news', n.id, n.commentCount)}</div>
      ${!admin && n.mine ? `<div class="row wrap"><button class="btn sm danger" data-act="news-del" data-id="${n.id}" data-mine="1">${t('news.delete')}</button></div>` : ''}
      ${admin ? `<div class="row wrap"><button class="btn sm" data-act="news-pin" data-id="${n.id}" data-pinned="${n.pinned ? 1 : 0}">${n.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}</button><button class="btn sm" data-act="news-edit" data-id="${n.id}" data-title="${esc(n.titleOrig)}" data-body="${esc(n.bodyOrig)}" data-imgs="${esc(JSON.stringify(n.imageUrls || []))}">Sửa</button><button class="btn sm danger" data-act="news-del" data-id="${n.id}">Xóa</button></div>` : ''}
    </article>`).join('') || `<p class="muted">${t('news.empty')}</p>`}</div></div></div>`;
  fitNews(view);
  if (S.unreadNews) { api('POST', '/news/read-all').then(() => { S.unreadNews = 0; S.hooks.renderSide(); }).catch(() => {}); }
}
const newsForm = (v = {}) => [
  { name: 'title', label: 'Tiêu đề', value: v.title || '', required: true, max: 150 },
  { name: 'body', label: 'Nội dung', type: 'textarea', value: v.body || '', required: true, max: 5000 },
];
actions['news-heart'] = async (el) => {
  const r = await api('POST', `/news/${el.dataset.id}/heart`);
  el.classList.toggle('on', r.hearted);
  el.setAttribute('aria-pressed', r.hearted);
  el.innerHTML = icon('heart', 15, r.hearted ? 'fill="currentColor"' : '') + `<span class="hc">${r.hearts || ''}</span>`;
  el.setAttribute('aria-label', t('news.heart', { n: r.hearts }));
};
actions['news-zoom'] = (el) => lightbox(el.dataset.src);
actions['news-more'] = (el) => { const p = el.previousElementSibling; const open = p.classList.toggle('clamp'); el.textContent = open ? t('news.more') : t('news.less'); };
actions['news-new'] = async () => {
  const m = openModal(`<form id="nf" class="col"><h2>Đăng bản tin</h2>
    <div class="field"><label for="nt">Tiêu đề (không bắt buộc)</label><input class="input" id="nt" maxlength="150"></div>
    <div class="field"><label for="nb">Nội dung (không bắt buộc)</label><textarea class="input" id="nb" maxlength="5000"></textarea></div>
    <div class="field"><label for="ni">Ảnh (không bắt buộc, tối đa 4 ảnh, mỗi ảnh tối đa 2MB)</label><input id="ni" type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp"></div>
    ${S.me.role === 'admin' ? '<label class="check"><input type="checkbox" id="np"> Ghim lên đầu</label>' : ''}
    <p class="small muted">${S.me.role === 'admin' ? 'Bản tin hiện cho toàn bộ người dùng và gửi thông báo đẩy tới người bật thông báo bản tin.' : 'Bài hiện cho toàn bộ người dùng, ghi tên bạn là người đăng. Admin có thể xóa bài vi phạm.'}</p>
    <div class="btns"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Đăng</button></div></form>`);
  $('[data-close]', m).onclick = closeModal;
  $('#nf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const files = [...$('#ni').files];
      if (files.length > 4) throw new Error('Chỉ chọn tối đa 4 ảnh');
      const imageUrls = [];
      for (const f of files) imageUrls.push((await api('POST', '/upload', { dataUrl: await imageToDataUrl(f) })).url);
      await api('POST', S.me.role === 'admin' ? '/admin/news' : '/news', { title: $('#nt').value, body: $('#nb').value, imageUrls, pinned: !!$('#np')?.checked });
      closeModal(); renderNews($('#view'));
    } catch (er) { fail(er); }
  };
};
actions['news-edit'] = async (el) => {
  const d = el.dataset;
  let cur = []; try { cur = JSON.parse(d.imgs || '[]'); } catch { /* không có ảnh */ }
  const m = openModal(`<form id="nef" class="col"><h2>Sửa bản tin</h2>
    <div class="field"><label for="net">Tiêu đề (không bắt buộc)</label><input class="input" id="net" maxlength="150"></div>
    <div class="field"><label for="neb">Nội dung (không bắt buộc)</label><textarea class="input" id="neb" maxlength="5000" rows="8"></textarea></div>
    ${cur.length ? `<div class="thumb-row">${cur.map((u, i) => `<div class="th"><img src="${esc(u)}" alt="Ảnh ${i + 1}"><label><input type="checkbox" data-rm="${i}"> Gỡ</label></div>`).join('')}</div>` : ''}
    <div class="field"><label for="nei">Thêm ảnh (tổng tối đa 4 ảnh, không bắt buộc)</label><input id="nei" type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp"></div>
    <div class="btns"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Lưu</button></div></form>`);
  $('#net').value = d.title; $('#neb').value = d.body;
  $('[data-close]', m).onclick = closeModal;
  $('#nef').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const patch = { title: $('#net').value, body: $('#neb').value };
      const kept = cur.filter((_, i) => !$(`[data-rm="${i}"]`)?.checked);
      const files = [...$('#nei').files];
      if (kept.length + files.length > 4) throw new Error(`Tối đa 4 ảnh (hiện giữ ${kept.length}, thêm ${files.length})`);
      for (const f of files) kept.push((await api('POST', '/upload', { dataUrl: await imageToDataUrl(f) })).url);
      patch.imageUrls = kept;
      await api('PATCH', `/admin/news/${d.id}`, patch);
      closeModal(); renderNews($('#view'));
    } catch (er) { fail(er); }
  };
};
actions['news-pin'] = async (el) => { try { await api('PATCH', `/admin/news/${el.dataset.id}`, { pinned: el.dataset.pinned !== '1' }); renderNews($('#view')); } catch (e) { fail(e); } };
actions['news-del'] = async (el) => {
  if (!(await confirmBox('Xóa bản tin?', 'Bản tin sẽ biến mất với mọi người.', 'Xóa', true))) return;
  try { await api('DELETE', el.dataset.mine ? `/news/${el.dataset.id}` : `/admin/news/${el.dataset.id}`); renderNews($('#view')); } catch (e) { fail(e); }
};

// ===========================================================================
// Cài đặt
// ===========================================================================
export async function renderSettings(view) {
  const u = S.me;
  const myCountries = await api('GET', '/me/countries').then((r) => r.countries).catch(() => []); // chỉ hiện ô quốc gia khi có hơn một nước
  const { regions, provinces } = S.geo;
  const cooldown = u.homeChangedAt && Date.now() - u.homeChangedAt < 30 * 864e5;
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>${t('set.title')}</h1>
    <section class="card col"><div class="h2" style="margin:0">${t('set.profile')}</div>
      <div class="row">${avatar(u, 'lg')}<div class="grow"><div class="small muted">${esc(u.email)}</div><div class="small muted">${esc(u.location.province ? `${u.location.province} · ${u.location.region}` : locText(u.location))}</div></div></div>
      <form id="pf" class="col">
        <div class="field"><label for="dn">${t('auth.displayName')}</label><input class="input" id="dn" value="${esc(u.displayName)}" required minlength="2" maxlength="30"></div>
        <div class="field"><label for="lang">${t('lang.label')}</label><select class="input" id="lang">${LANGS.map((l) => `<option value="${l.code}" ${u.language === l.code ? 'selected' : ''}>${l.name}</option>`).join('')}</select></div>
        <div class="field"><label for="av">${t('set.avatarColor')}</label><div class="row">${[0, 1, 2, 3, 4, 5].map((i) => `<label style="cursor:pointer"><input type="radio" name="avc" value="${i}" class="sr-only" ${u.avatarColor === i ? 'checked' : ''}><span class="av c${i}" style="${u.avatarColor === i ? 'outline:3px solid var(--accent);outline-offset:2px' : ''}" data-avc>${esc([...u.displayName][0].toUpperCase())}</span></label>`).join('')}</div></div>
        <div class="field"><label for="avf">${t('set.avatarUpload')}</label><input type="file" id="avf" accept="image/png,image/jpeg,image/gif,image/webp"></div>
        <button class="btn primary">${t('set.saveProfile')}</button></form></section>
    <section class="card col"><div class="h2" style="margin:0">${t('set.changePw')}</div>
      <form id="pwf" class="col" autocomplete="off">
        <div class="field"><label for="pw0">${t('set.curPw')}</label><input class="input" id="pw0" type="password" required autocomplete="current-password"></div>
        <div class="field"><label for="pw1">${t('set.newPw')}</label><input class="input" id="pw1" type="password" required minlength="8" autocomplete="new-password" placeholder="${t('set.pwHint')}"></div>
        <div class="field"><label for="pw2">${t('set.newPw2')}</label><input class="input" id="pw2" type="password" required minlength="8" autocomplete="new-password"></div>
        <p class="small muted">${t('set.pwNote')}</p>
        <button class="btn">${t('set.changePw')}</button></form></section>
    <section class="card col"><div class="h2" style="margin:0">${t('set.home')}</div>
      <p class="small muted">${t('set.homeNote')}${cooldown ? ` <b>${t('set.homeCooldown')}</b>` : ''}</p>
      <form id="hf" class="col">${myCountries.length > 1 ? `<div class="field"><label for="hc">${t('set.country')}</label><select class="input" id="hc">${myCountries.map((c) => `<option value="${c.code}" ${c.code === (u.country || 'VN') ? 'selected' : ''}>${esc(c.names[getLang()] || c.name)}</option>`).join('')}</select></div>` : ''}<div class="field" id="hpfield" ${(u.country || 'VN') !== 'VN' ? 'hidden' : ''}><label for="hp">${t('auth.city')}</label><select class="input" id="hp" ${cooldown ? 'disabled' : ''}>${regions.map((r) => `<optgroup label="${esc(r.name)}">${provinces.filter((p) => p.region === r.code).map((p) => `<option value="${p.id}" ${p.id === u.provinceId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <button class="btn" ${cooldown ? 'disabled' : ''}>${t('set.changeHome')}</button></form></section>
    <div id="pushslot"></div>
    <section class="card col"><div class="h2" style="margin:0">${t('set.privacy')}</div>
      <div class="field"><label for="fp">${t('set.friendPolicy')}</label><select class="input" id="fp">${[['shared', t('set.fp.shared')], ['everyone', t('set.fp.everyone')], ['none', t('set.fp.none')]].map(([c, n]) => `<option value="${c}" ${u.friendPolicy === c ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <label class="check"><input type="checkbox" id="so" ${u.showOnline ? 'checked' : ''}> ${t('set.showOnline')}</label>
      <label class="check"><input type="checkbox" id="sl" ${u.shareLocation ? 'checked' : ''}> ${t('set.shareLoc')}</label>
      <label class="check"><input type="checkbox" id="np" ${u.newsPush ? 'checked' : ''}> ${t('set.newsPush')}</label>
      <label class="check"><input type="checkbox" id="hs" ${u.hideSuggestions ? 'checked' : ''}> ${t('set.hideSug')}</label>
      <button class="btn" id="savepriv">${t('set.savePriv')}</button></section>
    <section class="card col"><div class="h2" style="margin:0">${t('set.account')}</div>
      <div class="row wrap">${S.me.role === 'admin' ? '' : `<button class="btn" data-act="report-bug">${t('nav.reportBug')}</button>`}<button class="btn" data-act="logout">${t('set.logout')}</button><button class="btn danger" data-act="delete-account">${t('set.deleteAccount')}</button></div></section>
  </div></div>`;
  pushSectionHtml().then((html) => { const slot = $('#pushslot'); if (slot) slot.outerHTML = html; }).catch(() => {});
  let pendingAvatar;
  $('#avf').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const dataUrl = await imageToDataUrl(f, 512); pendingAvatar = (await api('POST', '/upload', { dataUrl })).url; toast('Đã chọn ảnh. Bấm "Lưu hồ sơ".'); } catch (er) { fail(er); }
  };
  const save = async (body) => { try { const r = await api('PATCH', '/me', body); S.me = r.user; if (body.language) setLang(S.me.language); toast(t('set.saved')); S.hooks.renderSide(); return true; } catch (e) { fail(e); } };
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const body = { displayName: $('#dn').value, language: $('#lang').value, avatarColor: Number($('[name=avc]:checked')?.value ?? 0) };
    if (pendingAvatar) body.avatarUrl = pendingAvatar;
    if (await save(body)) renderSettings(view);
  };
  $('#pwf').onsubmit = async (e) => {
    e.preventDefault();
    if ($('#pw1').value !== $('#pw2').value) return toast('Mật khẩu xác nhận không khớp');
    try {
      await api('POST', '/me/password', { currentPassword: $('#pw0').value, newPassword: $('#pw1').value, confirmPassword: $('#pw2').value });
      e.target.reset();
      toast('Đã đổi mật khẩu');
    } catch (er) { fail(er); }
  };
  $('#savepriv').onclick = () => save({ friendPolicy: $('#fp').value, showOnline: $('#so').checked, shareLocation: $('#sl').checked, newsPush: $('#np').checked, hideSuggestions: $('#hs').checked });
  if ($('#hc')) $('#hc').onchange = () => { $('#hpfield').hidden = $('#hc').value !== 'VN'; };
  $('#hf').onsubmit = async (e) => {
    e.preventDefault();
    const cc = $('#hc') ? $('#hc').value : 'VN';
    const pid = Number($('#hp').value);
    if (cc === 'VN' && (u.country || 'VN') === 'VN' && pid === u.provinceId) return toast('Bạn đang chọn tỉnh/thành này rồi');
    if (cc !== 'VN' && cc === u.country) return toast('Bạn đang chọn quốc gia này rồi');
    const cname = myCountries.find((c) => c.code === cc)?.names[getLang()] || cc;
    const v = await ask({ title: `Đổi vị trí sang ${cc === 'VN' ? provinceName(pid) : cname}?`, text: 'Bạn sẽ vào các nhóm theo vị trí mới. Bạn chỉ đổi được 1 lần / 30 ngày.', fields: [{ name: 'leaveOld', type: 'checkbox', label: 'Rời các nhóm vùng và tỉnh/thành cũ', value: true }], ok: 'Đổi vị trí' });
    if (!v) return;
    try { const r = await api('POST', '/me/home', cc === 'VN' ? { country: 'VN', provinceId: pid, leaveOld: v.leaveOld } : { country: cc, leaveOld: v.leaveOld }); S.me = r.user; await refreshGroups(); toast('Đã đổi vị trí'); renderSettings(view); } catch (er) { fail(er); }
  };
};
actions.logout = () => S.hooks.logout();
actions['delete-account'] = async () => {
  const v = await ask({ title: 'Xóa tài khoản?', text: 'Dữ liệu cá nhân của bạn sẽ bị xóa. Tin nhắn cũ trong group công khai sẽ hiển thị là "Người dùng đã xóa". Không thể hoàn tác.', fields: [{ name: 'password', label: 'Nhập mật khẩu để xác nhận', type: 'password', required: true }], ok: 'Xóa vĩnh viễn', danger: true });
  if (!v) return;
  try { await api('DELETE', '/me', { password: v.password }); toast('Tài khoản đã được xóa'); S.hooks.logout(true); } catch (e) { fail(e); }
};

// ===========================================================================
// Quản trị: report (admin + mod + admin group riêng), người dùng, mod, nhật ký
// ===========================================================================
const ACTION_LABEL = { dismiss: 'Bỏ qua (không vi phạm)', delete_message: 'Xóa tin nhắn', mute: 'Tắt tiếng 24 giờ trong nhóm', kick: 'Xóa khỏi nhóm', warn: 'Cảnh cáo', lock_temp: 'Khóa tài khoản tạm thời', lock_perm: 'Khóa tài khoản vĩnh viễn' };
const LOG_LABEL = { delete_message: 'Xóa tin nhắn', mute: 'Tắt tiếng', kick: 'Xóa khỏi nhóm', warn: 'Cảnh cáo', lock_temp: 'Khóa tạm', lock_perm: 'Khóa vĩnh viễn', unlock: 'Mở khóa', grant_mod: 'Trao quyền mod', revoke_mod: 'Thu hồi mod', grant_admin: 'Trao quyền Admin', revoke_admin: 'Thu hồi Admin' };

export async function renderAdmin(view, tab = 'reports') {
  const admin = S.me.role === 'admin';
  if (!admin) tab = 'reports';
  const tabs = admin ? [['reports', 'Báo cáo'], ['topics', 'Chủ đề chờ duyệt'], ['emoji', 'Emoji'], ['game', 'Game'], ['users', 'Người dùng'], ['mods', 'Mod'], ...(S.me.isSuper ? [['admins', 'Admin'], ['intl', 'Quốc gia'], ['stats', 'Thống kê']] : []), ['logs', 'Nhật ký']] : [['reports', 'Báo cáo']];
  view.innerHTML = `<div class="page"><div class="page-inner"><h1>${admin ? 'Quản trị' : 'Báo cáo trong nhóm của bạn'}</h1>
    <div class="pillnav">${tabs.map(([k, n]) => `<button data-tab="${k}" aria-pressed="${k === tab}">${n}<span class="tab-cnt" data-cnt="${k}"></span></button>`).join('')}</div><div id="tabbody"></div></div></div>`;
  $$('[data-tab]', view).forEach((b) => (b.onclick = () => renderAdmin(view, b.dataset.tab)));
  // số lượng trên mỗi tab (tải song song, không chặn nội dung tab)
  if (admin) api('GET', '/admin/counts').then((c) => {
    for (const [k, v] of Object.entries(c)) { const el = $(`[data-cnt="${k}"]`, view); if (el) el.textContent = v.toLocaleString('vi-VN'); }
  }).catch(() => {});
  const body = $('#tabbody');
  try {
    if (tab === 'reports') await adminReports(body);
    if (tab === 'topics') await adminTopics(body);
    if (tab === 'emoji') await adminEmoji(body);
    if (tab === 'game') await adminGame(body);
    if (tab === 'users') await adminUsers(body);
    if (tab === 'mods') await adminMods(body);
    if (tab === 'admins' && S.me.isSuper) await adminAdmins(body);
    if (tab === 'intl' && S.me.isSuper) await adminIntl(body);
    if (tab === 'stats' && S.me.isSuper) await renderStats(body);
    if (tab === 'logs') await adminLogs(body);
  } catch (e) { body.innerHTML = `<div class="error">${esc(e.message)}</div>`; }
}

async function adminTopics(body) {
  const { topics } = await api('GET', '/topics/pending');
  body.innerHTML = `<div class="list">${topics.map((t) => `<article class="card col">
    <div class="row wrap"><span class="pill warn">Chờ duyệt</span><span class="tiny muted">${fmtDateTime(t.createdAt)}</span><span class="small">Đề xuất bởi <b>${esc(t.creator?.displayName || 'Người dùng đã xóa')}</b></span></div>
    <h2 style="font-size:17px">${esc(t.name)}</h2>
    ${t.description ? `<p class="small" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(t.description)}</p>` : ''}
    <div class="row wrap" style="gap:8px"><button class="btn primary sm" data-act="topic-approve" data-id="${t.id}">Duyệt</button><button class="btn danger sm" data-act="topic-reject" data-id="${t.id}" data-name="${esc(t.name)}">Từ chối</button></div></article>`).join('') || '<p class="muted">Không có chủ đề nào đang chờ duyệt.</p>'}</div>`;
}
actions['topic-approve'] = async (el) => {
  try { await api('POST', `/topics/pending/${el.dataset.id}/approve`); toast('Đã duyệt. Chủ đề hiện ở Chủ đề nóng.'); renderAdmin($('#view'), 'topics'); } catch (e) { fail(e); }
};
actions['topic-reject'] = async (el) => {
  const v = await ask({ title: `Từ chối "${el.dataset.name}"?`, text: 'Chủ đề sẽ bị xóa và người đề xuất nhận được thông báo kèm lý do (nếu có).', fields: [{ name: 'reason', label: 'Lý do (không bắt buộc)', type: 'textarea', max: 300 }], ok: 'Từ chối' });
  if (!v) return;
  try { await api('POST', `/topics/pending/${el.dataset.id}/reject`, { reason: v.reason }); toast('Đã từ chối'); renderAdmin($('#view'), 'topics'); } catch (e) { fail(e); }
};

async function adminReports(body) {
  const { reports } = await api('GET', '/reports');
  const admin = S.me.role === 'admin';
  const where = (r) => r.groupType === 'private' ? 'Nhóm riêng' : r.groupType === 'dm' ? 'Chat 1-1' : 'Nhóm công khai';
  body.innerHTML = `<div class="list">${reports.map((r) => `<article class="card col">
    <div class="row wrap"><span class="pill warn">${where(r)}</span>${r.groupName && r.groupType !== 'dm' ? `<span class="small">${esc(r.groupName)}</span>` : ''}<span class="tiny muted">${fmtDateTime(r.createdAt)}</span></div>
    <div class="small">Người bị báo cáo: <b>${esc(r.target.displayName)}</b>${r.targetStatus === 'locked' ? ' <span class="pill">đã khóa</span>' : ''}${r.reporter ? ` · Người báo cáo: ${esc(r.reporter.displayName)}` : ''}</div>
    <div class="small"><b>Lý do:</b> ${esc(r.reason)}</div>
    ${r.snapshotBody || r.snapshotImage ? `<div class="quote" style="white-space:pre-wrap;max-width:none">${esc(r.snapshotBody || '')}${r.snapshotImage ? `<br><img src="${esc(r.snapshotImage)}" alt="Ảnh bị báo cáo" style="max-width:220px;border-radius:8px">` : ''}</div>` : ''}
    <div><button class="btn primary sm" data-act="resolve" data-id="${r.id}" data-msg="${r.messageId || ''}" data-group="${r.groupId && r.groupType !== 'dm' ? 1 : ''}">Xử lý</button></div></article>`).join('') || '<p class="muted">Không có báo cáo nào đang chờ.</p>'}</div>`;
}
actions.resolve = async (el) => {
  const admin = S.me.role === 'admin';
  const opts = Object.keys(ACTION_LABEL).filter((a) =>
    (admin || ['dismiss', 'delete_message', 'mute', 'kick'].includes(a)) && (a !== 'lock_perm' || S.me.isSuper) &&
    (a !== 'delete_message' || el.dataset.msg) && (!['mute', 'kick'].includes(a) || el.dataset.group));
  const v = await ask({ title: 'Xử lý báo cáo', text: 'Người báo cáo sẽ được thông báo khi báo cáo được xử lý.', fields: [
    { name: 'action', label: 'Hành động', type: 'select', options: opts.map((a) => ({ value: a, label: ACTION_LABEL[a] })) },
    ...(admin ? [{ name: 'days', label: 'Số ngày khóa (nếu khóa tạm thời)', type: 'number', value: 7, min: 1, max: 365 }] : []),
    { name: 'note', label: 'Ghi chú / lý do gửi cho người bị xử lý', type: 'textarea', max: 300 }], ok: 'Xác nhận' });
  if (!v) return;
  try { await api('POST', `/reports/${el.dataset.id}/resolve`, { action: v.action, days: Number(v.days), note: v.note }); toast('Đã xử lý báo cáo'); renderAdmin($('#view'), 'reports'); } catch (e) { fail(e); }
};

async function adminUsers(body) {
  body.innerHTML = `<div class="col"><label class="sr-only" for="uq">Tìm người dùng</label><input class="input" id="uq" type="search" placeholder="Tìm theo tên hoặc email"><div class="list" id="ul"></div></div>`;
  const load = async () => {
    const { users } = await api('GET', `/admin/users?q=${encodeURIComponent($('#uq').value)}`);
    $('#ul').innerHTML = users.map((u) => `<div class="card">${avatar(u)}<div class="grow"><b>${esc(u.displayName)}</b> ${u.role === 'admin' ? `<span class="pill">${u.isSuper ? 'Admin hệ thống' : 'Admin'}</span>` : ''}${u.status === 'locked' ? '<span class="pill warn">Đã khóa</span>' : ''}<div class="tiny muted">${esc(u.email)} · ${esc(u.location?.province || '')}</div></div>
      <div class="user-acts">${S.me.isSuper && u.role !== 'admin' && u.status === 'active' ? `<button class="btn sm" data-act="grant-admin" data-id="${u.id}" data-name="${esc(u.displayName)}">Trao quyền Admin</button>` : ''}
      ${u.role === 'admin' && !(S.me.isSuper && !u.isSuper) ? '' : `<button class="btn sm" data-act="grant-mod" data-id="${u.id}" data-name="${esc(u.displayName)}">Trao quyền mod</button>
      ${u.status === 'locked' ? `<button class="btn sm" data-act="unlock" data-id="${u.id}">Mở khóa</button>` : `<button class="btn sm danger" data-act="lock" data-id="${u.id}">Khóa</button>`}`}</div></div>`).join('') || '<p class="muted">Không tìm thấy.</p>';
  };
  let t; $('#uq').oninput = () => { clearTimeout(t); t = setTimeout(() => load().catch(fail), 250); };
  await load();
}
actions.lock = async (el) => {
  const v = await ask({ title: 'Khóa tài khoản', fields: [
    { name: 'kind', label: 'Loại', type: 'select', options: [{ value: 'temp', label: 'Tạm thời' }, ...(S.me.isSuper ? [{ value: 'perm', label: 'Vĩnh viễn' }] : [])] },
    { name: 'days', label: 'Số ngày (nếu tạm thời)', type: 'number', value: 7, min: 1, max: 365 },
    { name: 'reason', label: 'Lý do', type: 'textarea', required: true, max: 300 }], ok: 'Khóa', danger: true });
  if (!v) return;
  try { await api('POST', `/admin/users/${el.dataset.id}/lock`, { permanent: v.kind === 'perm', days: Number(v.days), reason: v.reason }); toast('Đã khóa tài khoản'); renderAdmin($('#view'), 'users'); } catch (e) { fail(e); }
};
actions.unlock = async (el) => { try { await api('POST', `/admin/users/${el.dataset.id}/unlock`); renderAdmin($('#view'), 'users'); } catch (e) { fail(e); } };
actions['grant-mod'] = async (el) => {
  const { groups } = await api('GET', '/groups/discover');
  const v = await ask({ title: `Trao quyền mod cho ${el.dataset.name}`, text: 'Bất kỳ người dùng nào cũng được trao quyền; nếu chưa ở trong nhóm sẽ tự được thêm vào. Mod chỉ quản lý được nhóm được giao, không xem được nhóm riêng tư.', fields: [
    { name: 'groupId', label: 'Nhóm công khai', type: 'select', options: groups.map((g) => ({ value: g.id, label: g.name })) }], ok: 'Trao quyền' });
  if (!v) return;
  try { await api('POST', '/admin/mods', { groupId: Number(v.groupId), userId: Number(el.dataset.id) }); toast('Đã trao quyền mod'); } catch (e) { fail(e); }
};
actions['grant-admin'] = async (el) => {
  if (!(await confirmBox(`Trao quyền Admin cho ${el.dataset.name}?`, 'Admin quản trị toàn hệ thống: xóa tin, xử lý báo cáo, khóa tạm tài khoản, đăng bản tin, trao quyền mod. Admin không được phong Admin khác hay khóa vĩnh viễn.', 'Trao quyền'))) return;
  try { await api('POST', '/admin/admins', { userId: Number(el.dataset.id) }); toast('Đã trao quyền Admin'); renderAdmin($('#view'), 'users'); } catch (e) { fail(e); }
};
async function adminAdmins(body) {
  const { admins } = await api('GET', '/admin/admins');
  body.innerHTML = `<p class="small muted">Chỉ Admin hệ thống mới phong hoặc thu hồi Admin. Phong Admin ở tab "Người dùng" (tìm theo tên hoặc email).</p><div class="list">${admins.map((a) => `<div class="card">${avatar(a)}<div class="grow"><b>${esc(a.displayName)}</b> <span class="pill">${a.isSuper ? 'Admin hệ thống' : 'Admin'}</span><div class="tiny muted">${esc(a.email)}</div></div>${a.isSuper ? '' : `<button class="btn sm danger" data-act="revoke-admin" data-id="${a.id}">Thu hồi</button>`}</div>`).join('')}</div>`;
}
actions['revoke-admin'] = async (el) => {
  if (!(await confirmBox('Thu hồi quyền Admin?', 'Người này trở lại người dùng thường (quyền mod ở các nhóm, nếu có, vẫn giữ).', 'Thu hồi', true))) return;
  try { await api('DELETE', `/admin/admins/${el.dataset.id}`); renderAdmin($('#view'), 'admins'); } catch (e) { fail(e); }
};
async function adminIntl(body) {
  const r = await api('GET', '/admin/intl');
  body.innerHTML = `<section class="card col"><div class="h2" style="margin:0">Quốc gia Đông Nam Á</div>
    <p class="small muted">Việt Nam luôn mở. Các nước khác ${r.public ? '<b>đang mở cho mọi người</b>: ai cũng chọn được khi đăng ký và thấy nhóm quốc gia.' : '<b>đang chỉ Admin thấy</b>: người dùng thường và khách không thấy nhóm và không chọn được khi đăng ký.'}</p>
    <label class="check"><input type="checkbox" id="ipub" ${r.public ? 'checked' : ''}> Mở các quốc gia ngoài Việt Nam cho mọi người</label>
    <p class="tiny muted">Để thử trước: vào Cài đặt, mục "Vị trí home", chọn quốc gia (Admin không bị giới hạn 30 ngày), rồi quay lại Việt Nam khi xong. Mỗi nước hiện có một nhóm chat cấp quốc gia, chưa có tỉnh/thành.</p>
    <div class="stat-table" role="table" aria-label="Quốc gia">${r.countries.map((c) => `<div class="stat-row" role="row"><span role="cell">${esc(c.names.vi)} <span class="tiny muted">${esc(c.names.en)} · ${esc(c.names.th)} · ${esc(c.names.zh)}</span></span><b role="cell">${c.members.toLocaleString('vi-VN')}</b></div>`).join('')}</div>
    <p class="tiny muted">Số bên phải là số thành viên của nhóm quốc gia.</p></section>`;
  $('#ipub').onchange = async (e) => {
    const on = e.target.checked;
    if (on && !(await confirmBox('Mở các quốc gia cho mọi người?', 'Người dùng mới sẽ chọn được Thái Lan, Indonesia, Malaysia... khi đăng ký, và mọi người thấy các nhóm quốc gia. Bạn có thể đóng lại, nhưng nhóm đã có thành viên sẽ bị ẩn với họ khi đóng.', 'Mở'))) { e.target.checked = false; return; }
    try { await api('PATCH', '/admin/intl', { public: on }); toast(on ? 'Đã mở cho mọi người' : 'Đã đóng, chỉ Admin thấy'); await adminIntl(body); } catch (er) { e.target.checked = !on; fail(er); }
  };
}
async function adminMods(body) {
  const { mods } = await api('GET', '/admin/mods');
  body.innerHTML = `<p class="small muted">Trao quyền mod cho bất kỳ ai ở tab "Người dùng" (tìm theo tên hoặc email). Mod là tùy chọn cho mỗi nhóm công khai.</p><div class="list">${mods.map((m) => `<div class="card">${avatar(m.user)}<div class="grow"><b>${esc(m.user.displayName)}</b><div class="tiny muted">Mod của ${esc(m.groupName)}</div></div><button class="btn sm danger" data-act="revoke-mod" data-gid="${m.groupId}" data-id="${m.user.id}">Thu hồi</button></div>`).join('') || '<p class="muted">Chưa có mod nào.</p>'}</div>`;
}
actions['revoke-mod'] = async (el) => {
  if (!(await confirmBox('Thu hồi quyền mod?', '', 'Thu hồi', true))) return;
  try { await api('DELETE', `/admin/mods/${el.dataset.gid}/${el.dataset.id}`); renderAdmin($('#view'), 'mods'); } catch (e) { fail(e); }
};
async function adminLogs(body) {
  const { logs } = await api('GET', '/admin/logs');
  body.innerHTML = `<div class="list">${logs.map((l) => `<div class="card col" style="gap:2px"><div class="small"><b>${esc(LOG_LABEL[l.action] || l.action)}</b> · ${esc(l.actor)}${l.target ? ` → ${esc(l.target)}` : ''}${l.group ? ` · ${esc(l.group)}` : ''}</div>${l.reason ? `<div class="small muted">${esc(l.reason)}</div>` : ''}<div class="tiny muted">${fmtDateTime(l.createdAt)}</div></div>`).join('') || '<p class="muted">Chưa có hành động nào.</p>'}</div>`;
}

// ===========================================================================
// Công cụ: liên kết tới các trang ngoài
// ===========================================================================
const TOOLS = [
  { name: 'Tạo caption', url: 'https://vbots-caption.vercel.app', desc: 'Công cụ tạo caption.', ic: 'news' },
  { name: 'Theo dõi trend', url: 'https://www.lingorm.site/lingorm_tagtrend', desc: 'Theo dõi trend của LingOrm.', ic: 'trend' },
];
export function renderTools(view) {
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>Công cụ</h1>
    <p class="small muted">Các trang hỗ trợ dành cho fan LingOrm. Mở ở tab mới.</p>
    <div class="list">${TOOLS.map((t) => `<a class="card tool-card" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">
      <span class="tool-ic">${icon(t.ic, 22)}</span>
      <span class="grow"><b>${esc(t.name)}</b><span class="small muted tool-desc">${esc(t.desc)}</span><span class="tiny muted">${esc(new URL(t.url).host)}</span></span>
      <span class="tool-go" aria-hidden="true">${icon('ext', 18)}</span>
      <span class="sr-only">(mở tab mới)</span></a>`).join('')}</div>
  </div></div>`;
}
