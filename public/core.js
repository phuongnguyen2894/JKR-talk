import { frameSvg } from './frames.js';
import { LOCALE, getLang } from './i18n.js';
// Trạng thái dùng chung, API client, modal, toast, tiện ích.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const S = {
  token: safeGet('jkr_token'),
  me: null,
  geo: null,
  groups: [],
  unreadNews: 0,
  unreadHot: 0,
  unreadNotif: 0,
  hooks: {}, // renderSide, onMessage... do app.js gắn vào
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function setToken(t) {
  S.token = t;
  try { t ? localStorage.setItem('jkr_token', t) : localStorage.removeItem('jkr_token'); } catch {}
}

// Khi máy chủ có bản mới (đã triển khai lại) mà trang đang mở là bản cũ: nhắc tải lại để tránh lỗi lệch phiên bản
let seenVersion = null;
function checkVersion(v) {
  if (!v) return;
  if (seenVersion === null) { seenVersion = v; return; }
  if (v === seenVersion || document.getElementById('updbar')) return;
  const bar = document.createElement('div');
  bar.id = 'updbar'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>Có bản mới của JKR talks.</span><button type="button" class="btn sm primary" id="updbtn">Tải lại</button>';
  document.body.appendChild(bar);
  document.getElementById('updbtn').onclick = () => location.reload();
}
export async function api(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'content-type': 'application/json', ...(S.token ? { authorization: `Bearer ${S.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  checkVersion(res.headers.get('x-app-version'));
  if (!res.ok) {
    if (res.status === 401 && S.token) S.hooks.logout?.(true);
    const err = new Error(data.error || 'Có lỗi xảy ra');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };

// ---- icon (stroke, theo thiết kế) -------------------------------------------
const P = {
  flag: '<path d="M5 4v17M5 4h12l-2 4 2 4H5"/>',
  grid: '<path d="M9 4v16M15 4v16M4 9h16M4 15h16"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  friends: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5a3.5 3.5 0 0 1 0 7M18 14c2 .6 3 2.7 3 5"/>',
  send: '<path d="M4 12l16-8-6 16-3-7-7-1z"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2V5zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  bell: '<path d="M6 17V11a6 6 0 1 1 12 0v6l2 2H4l2-2zM10 21h4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  bug: '<path d="M8 9h8v5a4 4 0 0 1-8 0V9zM9.5 5.5L11 8M14.5 5.5L13 8M4 12.5h4M16 12.5h4M5 19l3-2M19 19l-3-2M12 10v8"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.5 17.2a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.3-.6-.6-2.3 2.6-2.6z"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  shuffle: '<path d="M4 7h3c5 0 5 10 10 10h3M4 17h3c1.6 0 2.7-.8 3.6-2M20 7h-3c-1.6 0-2.7.8-3.6 2M17 4l3 3-3 3M17 14l3 3-3 3"/>',
  glove: '<path d="M7 11V7.5A3.5 3.5 0 0 1 10.5 4h3A4.5 4.5 0 0 1 18 8.5V12a5 5 0 0 1-2.5 4.3V19h-7v-2.7A5 5 0 0 1 7 12.5zM8.5 19h7M7 11h4"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-2.5A4.8 4.8 0 0 1 21 11c-2 4.600-9 9-9 9z"/>',
};
export const icon = (n, s = 16, extra = '') =>
  `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${P[n] || ''}</svg>`;

// ---- avatar -------------------------------------------------------------------
export function avatar(u, cls = '') {
  const name = u?.displayName || '?';
  const inner = u?.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="">` : esc([...name][0]?.toUpperCase() || '?');
  const fr = u?.frame ? frameSvg(u.frame) : ''; // khung đã mua / phần thưởng danh hiệu thay cho khung tím của cấp bậc
  const av = `<span class="av c${(u?.avatarColor || 0) % 6} ${cls}${!fr && u?.level >= 2 && !u?.staff ? ' lvf' : ''}" aria-hidden="true">${inner}</span>`;
  return fr ? `<span class="av-fr">${av}${fr}</span>` : av;
}
export const groupAvatar = (g) =>
  g.avatarUrl ? `<span class="av sq"><img src="${esc(g.avatarUrl)}" alt=""></span>`
  : g.type === 'private' ? `<span class="av sq">${icon('lock', 18)}</span>`
  : `<span class="av sq">${esc(g.short || [...g.name][0] || '?')}</span>`;

export const fmtTime = (t) => new Date(t).toLocaleTimeString(LOCALE[getLang()] || 'vi-VN', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (t) => new Date(t).toLocaleDateString(LOCALE[getLang()] || 'vi-VN');
export const fmtDateTime = (t) => `${fmtDate(t)} ${fmtTime(t)}`;
export const dayKey = (t) => new Date(t).toDateString();
// Nơi ở: "Hà Nội, Việt Nam" hoặc chỉ quốc gia (nước chưa có cấp tỉnh/thành); tên quốc gia theo ngôn ngữ đang dùng
export const locText = (l) => { if (!l) return ''; const c = l.countryNames?.[getLang()] || l.country; const p = l.provinceNames?.[getLang()] || l.province; return p ? `${p}, ${c}` : c; };
// Tên tỉnh/thành của nước ngoài Việt Nam theo ngôn ngữ (Thái Lan có tên tiếng Thái cho người dùng ไทย)
export const subLabel = (s) => (getLang() === 'th' && s.th ? s.th : s.name);

// ---- toast ---------------------------------------------------------------------
export function toast(text, ms = 4500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}
export const fail = (e) => toast(e?.message || 'Có lỗi xảy ra');

// ---- modal ---------------------------------------------------------------------
let modalOpener = null;
export function openModal(html, { onClose } = {}) {
  closeModal();
  modalOpener = document.activeElement;
  const b = document.createElement('div');
  b.className = 'backdrop';
  b.id = 'modal';
  b.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  b._onClose = onClose;
  b.addEventListener('mousedown', (e) => { if (e.target === b) closeModal(); });
  document.body.appendChild(b);
  const first = $('input:not([type=hidden]), select, textarea, .btn.primary, button', b);
  first?.focus();
  return b;
}
export function closeModal() {
  const m = $('#modal');
  if (!m) return;
  m._onClose?.();
  m.remove();
  modalOpener?.focus?.();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// Hộp thoại nhập liệu: trả về object giá trị hoặc null nếu hủy
export function ask({ title, text = '', fields = [], ok = 'Xác nhận', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const f = fields.map((x) => {
      const id = `ask_${x.name}`;
      if (x.type === 'select')
        return `<div class="field"><label for="${id}">${esc(x.label)}</label><select class="input" id="${id}" name="${x.name}">${x.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(x.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
      if (x.type === 'checkbox')
        return `<label class="check"><input type="checkbox" name="${x.name}" ${x.value ? 'checked' : ''}> ${esc(x.label)}</label>`;
      if (x.type === 'textarea')
        return `<div class="field"><label for="${id}">${esc(x.label)}</label><textarea class="input" id="${id}" name="${x.name}" maxlength="${x.max || 500}" placeholder="${esc(x.placeholder || '')}" ${x.required ? 'required' : ''}>${esc(x.value || '')}</textarea></div>`;
      return `<div class="field"><label for="${id}">${esc(x.label)}</label><input class="input" id="${id}" name="${x.name}" type="${x.type || 'text'}" value="${esc(x.value ?? '')}" placeholder="${esc(x.placeholder || '')}" ${x.required ? 'required' : ''} ${x.min ? `min="${x.min}"` : ''} ${x.max ? `max="${x.max}"` : ''}></div>`;
    }).join('');
    const m = openModal(
      `<form id="askform" class="col"><h2>${esc(title)}</h2>${text ? `<p class="muted small">${esc(text)}</p>` : ''}${f}
       <div class="btns"><button type="button" class="btn" data-close>Hủy</button><button class="btn ${danger ? 'danger' : 'primary'}">${esc(ok)}</button></div></form>`,
      { onClose: () => finish(null) }
    );
    $('[data-close]', m).onclick = () => closeModal();
    $('#askform', m).onsubmit = (e) => {
      e.preventDefault();
      const out = {};
      for (const x of fields) {
        const el = $(`[name="${x.name}"]`, m);
        out[x.name] = x.type === 'checkbox' ? el.checked : el.value;
      }
      finish(out);
      closeModal();
    };
  });
}
export const confirmBox = (title, text, ok = 'Đồng ý', danger = false) =>
  ask({ title, text, ok, danger }).then((v) => !!v);

export function lightbox(src) {
  openModal(`<div class="lightbox"><img src="${esc(src)}" alt="Ảnh phóng to"></div><div class="btns"><button class="btn" data-close>Đóng</button></div>`);
  $('#modal [data-close]').onclick = closeModal;
}

// ---- tải dữ liệu dùng chung -----------------------------------------------------
export async function refreshGroups() {
  const { groups, highlights = [] } = await api('GET', '/groups/mine');
  S.groups = groups;
  S.highlights = highlights;
  S.hooks.renderSide?.();
}
export async function refreshCounters() {
  const [n, nt, h] = await Promise.all([api('GET', '/news'), api('GET', '/notifications'), api('GET', '/hot/unread').catch(() => ({ unread: 0 }))]);
  S.unreadNews = n.unread;
  S.unreadHot = location.hash.startsWith('#/hot') ? 0 : h.unread;
  S.unreadNotif = nt.unread;
  S.hooks.renderSide?.();
}

export const isStaff = () => S.me?.role === 'admin' || S.groups.some((g) => (g.type === 'private' ? g.role === 'admin' : g.role === 'mod'));
export const provinceName = (id) => S.geo?.provinces.find((p) => p.id === id)?.name || '';
export const mutedNow = (g) => g.muted && (g.mutedUntil === -1 || g.mutedUntil > Date.now());

// Bảng hành động cho các nút data-act (app.js gắn listener click toàn cục)
export const actions = {};

// Chọn người để thêm vào nhóm riêng: bạn bè; Admin hệ thống tìm được bất kỳ ai (theo tên hoặc email)
export function memberPickerHtml(friends) {
  const isAdmin = S.me?.role === 'admin' || (S.me?.level || 0) >= 5; // Admin và cấp Tím Thủy Tổ thêm được bất kỳ ai
  return `<div class="col pick" style="gap:6px">
    ${isAdmin ? `<label class="label" for="pick-q">Tìm người dùng bất kỳ (${S.me.role === 'admin' ? 'Admin' : 'Tím Thủy Tổ'})</label>
      <input class="input" id="pick-q" type="search" placeholder="${S.me.role === 'admin' ? 'Tên hoặc email' : 'Tên người dùng'}" autocomplete="off">
      <div id="pick-res" class="col" style="gap:2px"></div>` : ''}
    <div class="label" style="margin-top:4px">${isAdmin ? 'Đã chọn / bạn bè' : 'Bạn bè'}</div>
    <div id="pick-list" class="col" style="gap:2px">${friends.map((f) => `<label class="check"><input type="checkbox" value="${f.id}"> ${esc(f.displayName)}</label>`).join('') || `<p class="small muted" id="pick-empty">${isAdmin ? 'Chưa chọn ai. Tìm ở ô phía trên.' : 'Bạn chưa có bạn bè để mời. Có thể mời sau.'}</p>`}</div></div>`;
}
export function wireMemberPicker(exclude = new Set()) {
  const q = $('#pick-q');
  if (!q) return;
  let t;
  const inList = (id) => !!$(`#pick-list input[value="${id}"]`);
  q.oninput = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const term = q.value.trim();
      if (term.length < 2) { $('#pick-res').innerHTML = ''; return; }
      try {
        const { users } = await api('GET', S.me.role === 'admin' ? `/admin/users?q=${encodeURIComponent(term)}` : `/people/search?q=${encodeURIComponent(term)}`);
        const list = users.filter((u) => u.id !== S.me.id && u.status === 'active' && !exclude.has(u.id) && !inList(u.id)).slice(0, 8);
        $('#pick-res').innerHTML = list.map((u) => `<label class="check"><input type="checkbox" value="${u.id}" data-name="${esc(u.displayName)}"> ${esc(u.displayName)}${u.email ? ` <span class="tiny muted">${esc(u.email)}</span>` : ''}</label>`).join('') || '<p class="small muted">Không tìm thấy (hoặc đã ở trong nhóm).</p>';
      } catch (e) { fail(e); }
    }, 250);
  };
  // tích chọn một kết quả → chuyển sang danh sách đã chọn (giữ lại khi tìm tiếp)
  $('#pick-res').onchange = (e) => {
    const cb = e.target.closest('input[type=checkbox]');
    if (!cb?.checked) return;
    $('#pick-empty')?.remove();
    $('#pick-list').insertAdjacentHTML('afterbegin', `<label class="check"><input type="checkbox" value="${cb.value}" checked> ${esc(cb.dataset.name)}</label>`);
    cb.closest('label').remove();
  };
}
export const pickedIds = (root) => [...new Set($$('#pick-list input:checked', root).map((i) => Number(i.value)))];

// Chia sẻ liên kết: điện thoại mở bảng chia sẻ của hệ thống, máy tính sao chép vào bộ nhớ tạm
export async function shareLink(url, title) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title, url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Đã sao chép liên kết chủ đề'); }
  catch { window.prompt('Sao chép liên kết này:', url); }
}
export const topicLink = (id) => `${location.origin}/t/${id}`;
actions['share-topic'] = (el) => shareLink(topicLink(el.dataset.id), el.dataset.name || 'JKR talks');

// Đọc ảnh và thu nhỏ trước khi tải lên (tối đa maxSide px, JPEG) để tải nhanh hơn; GIF giữ nguyên
export async function imageToDataUrl(file, maxSide = 1600) {
  const raw = () => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  if (file.type === 'image/gif') {
    if (file.size > 2 * 1024 * 1024) throw new Error('Ảnh GIF quá lớn (tối đa 2MB)');
    return raw();
  }
  if (file.size > 25 * 1024 * 1024) throw new Error('Ảnh quá lớn');
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    URL.revokeObjectURL(url);
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    if (k === 1 && file.size < 300 * 1024) return raw();
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', 0.82);
    if (out.length * 0.75 > 2 * 1024 * 1024) return c.toDataURL('image/jpeg', 0.6);
    return out;
  } catch {
    if (file.size > 2 * 1024 * 1024) throw new Error('Ảnh quá lớn (tối đa 2MB)');
    return raw();
  }
}

// Văn bản → HTML đã escape, liên kết http(s) thành thẻ <a> hiển thị rút gọn
// Đoạn văn thường: escape + tô sáng các @tên đã được tag
// :tên: của emoji tùy chỉnh thành hình (tên không có trong danh sách thì giữ nguyên chữ)
function withEmoji(h) {
  if (!S.emojiByName || !h.includes(':')) return h;
  return h.replace(/:([a-z0-9_]{2,32}):/g, (m, n) => { const e = S.emojiByName[n]; return e ? `<img class="cemoji" src="${esc(e.url)}" alt=":${n}:" title=":${n}:" loading="lazy" decoding="async">` : m; });
}
function plainHtml(seg, mentions) {
  const h = esc(seg);
  if (!mentions?.length) return withEmoji(h);
  const by = new Map(mentions.map((u) => ['@' + u.displayName.toLowerCase(), u]));
  const tags = [...by.keys()].sort((a, b) => b.length - a.length).map((t) => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return h.replace(new RegExp(tags.join('|'), 'gi'), (t) => {
    const u = by.get(t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").toLowerCase());
    return '<span class="mention' + (u && (u.all || S.me?.id === u.id) ? ' me' : '') + '">' + t + '</span>';
  }).replace(/(<span class="mention[^>]*>.*?<\/span>)|([^<]+)/g, (all, tag, txt) => (tag ? tag : withEmoji(txt)));
}
export function linkify(text, mentions) {
  const t = String(text ?? '');
  const re = /https?:\/\/[^\s<>"]+/gi;
  const out = [];
  let last = 0, m;
  while ((m = re.exec(t))) {
    let url = m[0];
    const trail = url.match(/[.,;:!?)\]}'"…]+$/);
    if (trail) url = url.slice(0, -trail[0].length);
    if (!/^https?:\/\/[^/]+\./i.test(url)) continue;
    let short = url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
    const q = short.search(/[?#]/);
    if (q > -1) short = short.slice(0, q) + '…';
    if (short.length > 34) short = short.slice(0, 33) + '…';
    out.push(plainHtml(t.slice(last, m.index), mentions));
    out.push('<a class="ext-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer nofollow" title="' + esc(url) + '">' + esc(short) + '</a>');
    last = m.index + url.length;
    re.lastIndex = last;
  }
  out.push(plainHtml(t.slice(last), mentions));
  return out.join('');
}

// ---- vai trò quản trị: biểu tượng ở góc ảnh + màu tên (Admin hệ thống / Admin: vàng, Mod: tím) ----
// staff: 'super' | 'admin' (toàn hệ thống, từ server); modRole: vai trò trong nhóm (Mod nhóm công khai, quản trị nhóm riêng)
export const roleOf = (u, modRole) => (u && u.staff) || (modRole ? 'mod' : null);
const ROLE_SVG = {
  super: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>',
  admin: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z"/></svg>',
  mod: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
};
const ROLE_TEXT = { super: 'Admin hệ thống', admin: 'Admin', mod: 'Mod' };
// ảnh đại diện kèm biểu tượng vai trò (không có vai trò: như avatar thường)
export function avatarR(u, role, cls = '') {
  const av = avatar(u, cls);
  return role ? `<span class="av-wrap">${av}<span class="role-badge rb-${role === 'mod' ? 'mod' : 'admin'}">${ROLE_SVG[role]}</span></span>` : av;
}
export const roleClass = (role) => (role ? ` role-${role === 'mod' ? 'mod' : 'admin'}` : '');
export const roleSr = (role) => (role ? `<span class="sr-only"> (${ROLE_TEXT[role]})</span>` : '');


// ---- Cấp bậc (Tím Mầm Non → Tím Thủy Tổ) và Xu tím ----------------------------------------
export const LEVEL_NAMES = ['', 'Tím Mầm Non', 'Tím Sương Sương', 'Tím Mộng Mơ', 'Tím Thủy Chung', 'Tím Thủy Tổ'];
const LV_SVG = {
  1: '<path d="M20 4C9 4 4 9 4 15c0 2 1 4 3 5 0-5 3-9 9-11-4 3-6 6-6.5 11C15 20 20 15 20 4z"/>',
  2: '<path d="M12 12L12.00 1.50M12.00 4.80L9.21 2.85M12.00 4.80L14.79 2.85M12.00 7.60L10.03 6.22M12.00 7.60L13.97 6.22M12 12L2.91 6.75M5.76 8.40L2.68 9.84M5.76 8.40L5.47 5.01M8.19 9.80L6.01 10.81M8.19 9.80L7.98 7.41M12 12L2.91 17.25M5.76 15.60L5.47 18.99M5.76 15.60L2.68 14.16M8.19 14.20L7.98 16.59M8.19 14.20L6.01 13.19M12 12L12.00 22.50M12.00 19.20L14.79 21.15M12.00 19.20L9.21 21.15M12.00 16.40L13.97 17.78M12.00 16.40L10.03 17.78M12 12L21.09 17.25M18.24 15.60L21.32 14.16M18.24 15.60L18.53 18.99M15.81 14.20L17.99 13.19M15.81 14.20L16.02 16.59M12 12L21.09 6.75M18.24 8.40L18.53 5.01M18.24 8.40L21.32 9.84M15.81 9.80L16.02 7.41M15.81 9.80L17.99 10.81" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  3: '<path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.2 6-.8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  4: '<path d="M6.5 2h3.6L12 6.5 13.9 2h3.6l-3.8 8h-3.4z"/><circle cx="12" cy="15.5" r="6.5"/>',
  5: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/>',
};
// huy hiệu cấp: chỉ hiện biểu tượng tô màu cạnh tên (cấp 0 hoặc đang ẩn: không hiện gì)
export const lvBadge = (n, size = 18) => (n >= 1 && n <= 5
  ? `<span class="lvb l${n}" style="width:${size}px;height:${size}px" role="img" aria-label="${LEVEL_NAMES[n]}" title="${LEVEL_NAMES[n]}"><svg viewBox="0 0 24 24" aria-hidden="true">${LV_SVG[n]}</svg></span>` : '');
// đồng Xu tím (chữ LO ở giữa); gradient dùng chung khai báo trong index.html
export const coinIcon = (size = 18) => `<svg class="coin" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><circle cx="12" cy="12" r="11.4" fill="url(#cgR)"/><circle cx="12" cy="12" r="10" fill="none" stroke="#F1EAFF" stroke-opacity=".55" stroke-width=".8" stroke-dasharray="1.1 1.1"/><circle cx="12" cy="12" r="8" fill="url(#cgF)" stroke="#E4D9FF" stroke-width=".9"/><path d="M5.9 9.3A6.7 6.7 0 0 1 11 5.4" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.1" stroke-linecap="round"/><text x="12" y="15.4" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="8.4" font-weight="800" letter-spacing="-.2" fill="#2B0F6B" fill-opacity=".55">LO</text><text x="12" y="14.8" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="8.4" font-weight="800" letter-spacing="-.2" fill="#fff">LO</text></svg>`;

// Lưới ảnh bản tin (1 ảnh: rộng đầy đủ; 2-4 ảnh: lưới 2 cột). act = tên hành động khi bấm vào ảnh.
export function newsGallery(urls, act = 'news-zoom') {
  const list = (urls || []).slice(0, 4);
  if (!list.length) return '';
  return `<div class="news-gallery g${list.length}">${list.map((u) => `<img src="${esc(u)}" alt="" data-act="${act}" data-src="${esc(u)}" loading="lazy" decoding="async">`).join('')}</div>`;
}
