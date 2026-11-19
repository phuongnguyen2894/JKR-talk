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
  unreadNotif: 0,
  hooks: {}, // renderSide, onMessage... do app.js gắn vào
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function setToken(t) {
  S.token = t;
  try { t ? localStorage.setItem('jkr_token', t) : localStorage.removeItem('jkr_token'); } catch {}
}

export async function api(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'content-type': 'application/json', ...(S.token ? { authorization: `Bearer ${S.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
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
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-2.5A4.8 4.8 0 0 1 21 11c-2 4.600-9 9-9 9z"/>',
};
export const icon = (n, s = 16, extra = '') =>
  `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${P[n] || ''}</svg>`;

// ---- avatar -------------------------------------------------------------------
export function avatar(u, cls = '') {
  const name = u?.displayName || '?';
  const inner = u?.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="">` : esc([...name][0]?.toUpperCase() || '?');
  return `<span class="av c${(u?.avatarColor || 0) % 6} ${cls}" aria-hidden="true">${inner}</span>`;
}
export const groupAvatar = (g) =>
  g.avatarUrl ? `<span class="av sq"><img src="${esc(g.avatarUrl)}" alt=""></span>`
  : g.type === 'private' ? `<span class="av sq">${icon('lock', 18)}</span>`
  : `<span class="av sq">${esc(g.short || [...g.name][0] || '?')}</span>`;

export const fmtTime = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (t) => new Date(t).toLocaleDateString('vi-VN');
export const fmtDateTime = (t) => `${fmtDate(t)} ${fmtTime(t)}`;
export const dayKey = (t) => new Date(t).toDateString();

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
  const { groups } = await api('GET', '/groups/mine');
  S.groups = groups;
  S.hooks.renderSide?.();
}
export async function refreshCounters() {
  const [n, nt] = await Promise.all([api('GET', '/news'), api('GET', '/notifications')]);
  S.unreadNews = n.unread;
  S.unreadNotif = nt.unread;
  S.hooks.renderSide?.();
}

export const isStaff = () => S.me?.role === 'admin' || S.groups.some((g) => (g.type === 'private' ? g.role === 'admin' : g.role === 'mod'));
export const provinceName = (id) => S.geo?.provinces.find((p) => p.id === id)?.name || '';
export const mutedNow = (g) => g.muted && (g.mutedUntil === -1 || g.mutedUntil > Date.now());

// Bảng hành động cho các nút data-act (app.js gắn listener click toàn cục)
export const actions = {};
