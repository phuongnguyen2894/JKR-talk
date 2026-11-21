// Emoji tùy chỉnh do Admin thêm, react tin nhắn bằng emoji, bảng chọn emoji và trang quản trị emoji
import { $, $$, S, api, esc, icon, avatar, actions, fail, toast, openModal, closeModal, confirmBox } from './core.js';

export const UNICODE = ['😀', '😂', '🥹', '😍', '🥰', '😭', '😘', '🤣', '👍', '🙏', '👏', '🔥', '💜', '💚', '💙', '💖', '✨', '🎉', '😎', '🤗', '😅', '🥺', '😢', '😡', '🤔', '🙌', '💪', '🌸', '⭐', '🎬', '📺', '🍿'];
const RECENT_KEY = 'jkr_emoji_recent';
const MAX_RECENT = 8;

// ---- kho emoji tùy chỉnh ----------------------------------------------------------------
export async function loadEmoji(guest = false) {
  try {
    const r = await api('GET', guest ? '/public/emoji' : '/emoji');
    S.emoji = r.emoji || [];
  } catch { S.emoji ||= []; }
  S.emojiByName = Object.fromEntries(S.emoji.map((e) => [e.name, e]));
  S.emojiById = Object.fromEntries(S.emoji.map((e) => [e.id, e]));
}
export const pickable = () => (S.emoji || []).filter((e) => !e.hidden);

const HEART = '<svg class="rx-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11z" fill="currentColor"/></svg>';
export const reactIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="12" r="8"/><path d="M8 13.5q3 3 6 0M9 10h.01M13 10h.01M19 3v5M16.5 5.5h5"/></svg>';

// hình của một khóa react: 'heart' | 'u:😂' | 'e:<id>'
export function emojiHtml(key, custom) {
  if (key === 'heart') return HEART;
  if (key.startsWith('u:')) return `<span class="rx-u">${esc(key.slice(2))}</span>`;
  const id = Number(key.slice(2));
  const e = custom || S.emojiById?.[id];
  return e ? `<img class="cemoji" src="${esc(e.url)}" alt=":${esc(e.name)}:" loading="lazy" decoding="async">` : '<span class="rx-u">?</span>';
}
const keyLabel = (key, custom) => (key === 'heart' ? 'Tim' : key.startsWith('u:') ? key.slice(2) : `:${(custom || S.emojiById?.[Number(key.slice(2))])?.name || '?'}:`);

// ---- react dưới tin nhắn --------------------------------------------------------------------
const RX = new Map(); // id tin -> [{ emoji, count, mine, custom }]
export function rememberRx(m) { RX.set(m.id, (m.reactions || []).map((r) => ({ ...r }))); }

export function reactsHtml(m, { own = false, can = true } = {}) {
  if (m.deleted) return '';
  const list = RX.get(m.id) || m.reactions || [];
  if (!list.length && (own || !can)) return `<div class="reacts" data-rx="${m.id}"></div>`;
  const chips = list.map((r) => `<button type="button" class="rchip${r.mine ? ' mine' : ''}" data-act="${own || !can ? 'react-who' : 'react-toggle'}" data-id="${m.id}" data-emoji="${esc(r.emoji)}" aria-pressed="${r.mine}" aria-label="${esc(keyLabel(r.emoji, r.custom))}, ${r.count} người">${emojiHtml(r.emoji, r.custom)}<span>${r.count}</span></button>`).join('');
  const add = !own && can && list.length ? `<button type="button" class="radd" data-act="react-open" data-id="${m.id}" aria-label="Thêm react"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>` : '';
  return `<div class="reacts" data-rx="${m.id}">${chips}${add}</div>`;
}
function redrawRx(mid) {
  const box = $(`.reacts[data-rx="${mid}"]`);
  const msg = box?.closest('.msg');
  if (!box || !msg) return;
  const own = msg.classList.contains('own');
  const tmp = document.createElement('div');
  tmp.innerHTML = reactsHtml({ id: mid, deleted: false }, { own, can: !!S.me });
  box.replaceWith(tmp.firstElementChild);
}
export function applyReactions(mid, list) { RX.set(mid, list.map((r) => ({ ...r }))); redrawRx(mid); }

// sự kiện thời gian thực: số đếm mới của tin; giữ lại react của chính mình
export function onReactionsEvent(ev) {
  const old = RX.get(ev.messageId) || [];
  const mineSet = new Set(old.filter((r) => r.mine).map((r) => r.emoji));
  if (ev.actorId === S.me?.id) { if (ev.added) mineSet.add(ev.emoji); else mineSet.delete(ev.emoji); }
  RX.set(ev.messageId, ev.reactions.map((r) => ({ ...r, mine: mineSet.has(r.emoji) })));
  redrawRx(ev.messageId);
  // các nút tim cũ ở trang khác (Chủ đề nóng): cập nhật số tổng
  $$(`.heart[data-id="${ev.messageId}"] .hc`).forEach((el) => { el.textContent = ev.hearts || ''; });
}

actions['react-toggle'] = async (el) => {
  const r = await api('POST', `/messages/${el.dataset.id}/react`, { emoji: el.dataset.emoji });
  applyReactions(Number(el.dataset.id), r.reactions);
};

// ---- bảng chọn emoji (bảng trượt từ dưới lên) ---------------------------------------------------
const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const remember = (key) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...recent().filter((k) => k !== key)].slice(0, MAX_RECENT))); } catch { /* bỏ qua */ } };
const keyValid = (k) => k === 'heart' || k.startsWith('u:') || (k.startsWith('e:') && S.emojiById?.[Number(k.slice(2))] && !S.emojiById[Number(k.slice(2))].hidden);

function pkBtn(key, name) {
  return `<button type="button" class="pk" data-act="pick-emoji" data-key="${esc(key)}" data-name="${esc(name)}" aria-label="${esc(name)}">${emojiHtml(key)}</button>`;
}
function pickerBody(mode) {
  const rec = recent().filter(keyValid).filter((k) => mode === 'react' || k !== 'heart');
  const custom = pickable();
  return `${rec.length ? `<div class="pk-sec">GẦN ĐÂY</div><div class="pk-grid">${rec.map((k) => pkBtn(k, keyLabel(k))).join('')}</div>` : ''}
    ${mode === 'react' ? `<div class="pk-sec">TIM</div><div class="pk-grid">${pkBtn('heart', 'tim')}</div>` : ''}
    ${custom.length ? `<div class="pk-sec">EMOJI JKR TALKS <span>${custom.length}</span></div><div class="pk-grid">${custom.map((e) => pkBtn(`e:${e.id}`, `:${e.name}:`)).join('')}</div>` : ''}
    <div class="pk-sec" data-default>MẶC ĐỊNH</div><div class="pk-grid" data-default>${UNICODE.map((u) => pkBtn(`u:${u}`, u)).join('')}</div>`;
}
export function openPicker(mode, id) {
  const m = openModal(`<div class="col picker" data-mode="${mode}" data-id="${id || ''}"><div class="sheet-grab" aria-hidden="true"></div>
    <label class="sr-only" for="pk-q">Tìm emoji</label><input class="input" id="pk-q" type="search" placeholder="Tìm emoji theo tên" autocomplete="off">
    <div id="pk-body" class="pk-body">${pickerBody(mode)}</div></div>`);
  $('.modal', m).classList.add('sheet');
  const q = $('#pk-q', m);
  q.oninput = () => {
    const t = q.value.trim().toLowerCase().replace(/:/g, '');
    $$('.pk', m).forEach((b) => { b.hidden = !!t && !b.dataset.name.toLowerCase().includes(t); });
    $$('[data-default]', m).forEach((el) => { el.hidden = !!t; });
  };
}
actions['react-open'] = (el) => openPicker('react', el.dataset.id);
actions['pick-emoji'] = async (el) => {
  const pk = el.closest('.picker');
  const key = el.dataset.key;
  if (pk?.dataset.mode === 'react') {
    closeModal();
    remember(key);
    const r = await api('POST', `/messages/${pk.dataset.id}/react`, { emoji: key });
    applyReactions(Number(pk.dataset.id), r.reactions);
  }
};

// ---- soạn tin: bảng emoji nhỏ cạnh khung soạn tin và gợi ý :tên: ----------------------------------------
export function composerPanelHtml() {
  const custom = pickable();
  return `<div class="emoji-panel emoji-panel-lg" role="group" aria-label="Chọn emoji">
    ${custom.length ? `<div class="pk-sec">EMOJI JKR TALKS</div><div class="pk-grid">${custom.map((e) => `<button type="button" class="pk" data-act="emoji-insert" data-name="${esc(e.name)}" aria-label=":${esc(e.name)}:">${emojiHtml(`e:${e.id}`)}</button>`).join('')}</div>` : ''}
    <div class="pk-sec">MẶC ĐỊNH</div><div class="pk-grid">${UNICODE.map((u) => `<button type="button" class="pk" data-act="emoji" data-e="${u}" aria-label="${u}"><span class="rx-u">${u}</span></button>`).join('')}</div></div>`;
}
actions['emoji-insert'] = (el) => {
  const i = $('#msg');
  if (!i) return;
  i.value += `:${el.dataset.name}: `;
  i.focus();
};

// gợi ý khi gõ :ab trong khung soạn tin
export function wireEmojiSuggest(input, host) {
  if (!input) return;
  let items = [], active = 0;
  const pop = () => $('#emoji-pop');
  const close = () => { pop()?.remove(); items = []; };
  const token = () => {
    const before = input.value.slice(0, input.selectionStart ?? input.value.length);
    const m = before.match(/(?:^|\s):([a-z0-9_]{2,32})$/);
    return m ? { q: m[1], start: before.length - m[1].length - 1 } : null;
  };
  const draw = () => {
    pop()?.remove();
    if (!items.length) return;
    const el = document.createElement('div');
    el.id = 'emoji-pop'; el.className = 'mention-pop'; el.setAttribute('role', 'listbox');
    el.innerHTML = items.map((e, i) => `<button type="button" role="option" class="mention-item" data-i="${i}" aria-selected="${i === active}"><img class="cemoji" src="${esc(e.url)}" alt="" style="width:24px;height:24px"><span>:${esc(e.name)}:</span></button>`).join('');
    host.appendChild(el);
    el.onmousedown = (ev) => { ev.preventDefault(); const b = ev.target.closest('[data-i]'); if (b) pick(items[Number(b.dataset.i)]); };
  };
  const pick = (e) => {
    const t = token();
    if (!t) return close();
    const after = input.value.slice(input.selectionStart ?? input.value.length);
    const ins = `:${e.name}: `;
    input.value = input.value.slice(0, t.start) + ins + after;
    const pos = t.start + ins.length;
    input.setSelectionRange(pos, pos);
    close(); input.focus();
  };
  input.addEventListener('input', () => {
    const t = token();
    if (!t) return close();
    const all = pickable();
    items = [...all.filter((e) => e.name.startsWith(t.q)), ...all.filter((e) => !e.name.startsWith(t.q) && e.name.includes(t.q))].slice(0, 6);
    active = 0; draw();
  });
  input.addEventListener('keydown', (e) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(items[active]); }
    else if (e.key === 'Escape') close();
  }, true);
  input.addEventListener('blur', () => setTimeout(close, 150));
}

// ---- ai đã react ----------------------------------------------------------------------------------
actions['react-who'] = async (el) => {
  const { reactions } = await api('GET', `/messages/${el.dataset.id}/reactions`);
  const total = reactions.reduce((n, r) => n + r.users.length, 0);
  let tab = el.dataset.emoji && reactions.some((r) => r.emoji === el.dataset.emoji) ? el.dataset.emoji : 'all';
  const m = openModal('<div class="col" id="who-sheet"></div>');
  $('.modal', m).classList.add('sheet');
  const draw = () => {
    const rows = tab === 'all'
      ? [...new Map(reactions.flatMap((r) => r.users.map((u) => [u.id, { u, keys: reactions.filter((x) => x.users.some((y) => y.id === u.id)).map((x) => x.emoji) }]))).values()]
      : reactions.find((r) => r.emoji === tab).users.map((u) => ({ u, keys: [tab] }));
    $('#who-sheet', m).innerHTML = `<div class="sheet-grab" aria-hidden="true"></div><h2 style="margin:0">Ai đã react</h2>
      ${total ? `<div class="pillnav" role="group" aria-label="Lọc theo emoji"><button data-wt="all" aria-pressed="${tab === 'all'}">Tất cả ${total}</button>${reactions.map((r) => `<button data-wt="${esc(r.emoji)}" aria-pressed="${tab === r.emoji}">${emojiHtml(r.emoji)} ${r.users.length}</button>`).join('')}</div>
      <div class="list">${rows.map(({ u, keys }) => `<div class="row" style="min-height:48px">${avatar(u)}<b class="grow">${esc(u.displayName)}${u.id === S.me?.id ? ' <span class="tiny muted">(bạn)</span>' : ''}</b><span class="row" style="gap:4px">${keys.map((k) => emojiHtml(k, reactions.find((r) => r.emoji === k)?.custom)).join('')}</span></div>`).join('')}</div>` : '<p class="small muted">Chưa có ai react tin nhắn này.</p>'}
      <div class="btns"><button class="btn" data-close>Đóng</button></div>`;
    $$('[data-wt]', m).forEach((b) => (b.onclick = () => { tab = b.dataset.wt; draw(); }));
    $('[data-close]', m).onclick = closeModal;
  };
  draw();
};

// ---- Quản trị: danh sách emoji --------------------------------------------------------------------------
const ago = (t) => new Date(t).toLocaleDateString('vi-VN');
export async function adminEmoji(body) {
  const { emoji, limit } = await api('GET', '/admin/emoji');
  const pct = Math.round((emoji.length / limit) * 100);
  body.innerHTML = `<section class="card col"><div class="row between"><b>Emoji tùy chỉnh</b><span class="small muted">${emoji.length} / ${limit}</span></div>
      <div class="lvl-bar" role="img" aria-label="Đã dùng ${pct} phần trăm"><i style="width:${pct}%"></i></div>
      <div class="small muted">Mọi người dùng đều dùng được. Chỉ Admin thêm, đổi tên, ẩn và xóa.</div>
      <button class="btn primary" data-act="emoji-add">Thêm emoji</button></section>
    <input class="input" id="emoji-q" type="search" placeholder="Tìm theo tên" autocomplete="off" aria-label="Tìm emoji theo tên">
    <section class="card col" id="emoji-list" style="gap:0">${emoji.map((e) => `<div class="row emoji-row${e.hidden ? ' hid' : ''}" data-name="${esc(e.name)}" style="min-height:60px;border-top:1px solid var(--line);padding:6px 0">
        <img class="cemoji" src="${esc(e.url)}" alt="" style="width:40px;height:40px">
        <div class="grow"><b>:${esc(e.name)}:${e.hidden ? ' <span class="tiny muted">(đang ẩn)</span>' : ''}</b><div class="tiny muted">${e.createdBy ? `Thêm bởi ${esc(e.createdBy)} · ` : ''}${ago(e.createdAt)} · dùng ${e.uses.toLocaleString('vi-VN')} lần</div></div>
        <button class="btn sm" data-act="emoji-rename" data-id="${e.id}" data-name="${esc(e.name)}" aria-label="Đổi tên ${esc(e.name)}">Sửa</button>
        <button class="btn sm" data-act="emoji-hide" data-id="${e.id}" data-hidden="${e.hidden ? 1 : 0}">${e.hidden ? 'Hiện' : 'Ẩn'}</button>
        <button class="btn sm danger" data-act="emoji-del" data-id="${e.id}" data-name="${esc(e.name)}" aria-label="Xóa ${esc(e.name)}">Xóa</button></div>`).join('') || '<p class="small muted" style="margin:0">Chưa có emoji nào.</p>'}</section>
    <p class="tiny muted">Xóa emoji: tin cũ hiện lại chữ :tên:, react bằng emoji đó biến mất. Ẩn emoji: mất khỏi bảng chọn nhưng tin cũ vẫn hiện hình.</p>`;
  $('#emoji-q', body).oninput = (e) => {
    const t = e.target.value.trim().toLowerCase();
    $$('.emoji-row', body).forEach((r) => { r.hidden = !!t && !r.dataset.name.includes(t); });
  };
}
const refreshAdmin = () => { const b = $('#tabbody'); if (b) adminEmoji(b).catch(fail); };

actions['emoji-add'] = () => {
  let url = null;
  const m = openModal(`<form id="emf" class="col"><h2>Thêm emoji</h2>
    <div class="field"><label for="emfile">Ảnh (PNG, GIF hoặc WebP, tối đa 256 KB)</label><input id="emfile" type="file" accept="image/png,image/gif,image/webp"></div>
    <div id="emprev" class="row" style="min-height:72px"></div>
    <div class="field"><label for="emname">Tên emoji</label><div class="row" style="gap:4px"><span>:</span><input class="input grow" id="emname" maxlength="32" autocomplete="off" placeholder="cuoi_lan"><span>:</span></div>
      <div class="tiny muted">Chữ thường không dấu, số và dấu gạch dưới, 2 đến 32 ký tự. Người dùng gõ :tên: để dùng.</div></div>
    <div id="emerr" class="small" style="color:var(--danger);font-weight:600" role="alert"></div>
    <div class="btns"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary" id="emok" disabled>Thêm emoji</button></div></form>`);
  $('[data-close]', m).onclick = closeModal;
  const err = (t) => { $('#emerr', m).textContent = t || ''; };
  const sync = () => { $('#emok', m).disabled = !url || !/^[a-z0-9_]{2,32}$/.test($('#emname', m).value); };
  $('#emname', m).oninput = (e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); err(''); sync(); };
  $('#emfile', m).onchange = async (e) => {
    const f = e.target.files[0];
    url = null; err('');
    $('#emprev', m).innerHTML = '';
    if (!f) return sync();
    if (!/^image\/(png|gif|webp)$/.test(f.type)) { err('Emoji chỉ nhận ảnh PNG, GIF hoặc WebP'); return sync(); }
    if (f.size > 256 * 1024) { err(`Ảnh nặng ${Math.ceil(f.size / 1024)} KB, vượt mức 256 KB. Hãy chọn ảnh nhỏ hơn.`); return sync(); }
    try {
      const dataUrl = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });
      url = (await api('POST', '/upload', { dataUrl })).url;
      $('#emprev', m).innerHTML = `<img class="cemoji" src="${esc(url)}" alt="Xem trước" style="width:72px;height:72px"><span class="small" style="color:#135A48;font-weight:600">${Math.ceil(f.size / 1024)} KB, hợp lệ</span>`;
      if (!$('#emname', m).value) $('#emname', m).value = f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
    } catch (er) { err(er.message); }
    sync();
  };
  $('#emf', m).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/admin/emoji', { name: $('#emname', m).value, imageUrl: url });
      closeModal(); toast(`Đã thêm :${$('#emname', m)?.value || ''}:`); refreshAdmin();
    } catch (er) { err(er.message); }
  };
};
actions['emoji-rename'] = async (el) => {
  const m = openModal(`<form id="emr" class="col"><h2>Đổi tên emoji</h2><div class="field"><label for="emrn">Tên mới</label><div class="row" style="gap:4px"><span>:</span><input class="input grow" id="emrn" maxlength="32" value="${esc(el.dataset.name)}"><span>:</span></div></div>
    <div id="emrerr" class="small" style="color:var(--danger);font-weight:600" role="alert"></div>
    <p class="tiny muted">Tin cũ dùng tên cũ sẽ hiện lại thành chữ.</p><div class="btns"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Lưu</button></div></form>`);
  $('[data-close]', m).onclick = closeModal;
  $('#emrn', m).oninput = (e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''); };
  $('#emr', m).onsubmit = async (e) => {
    e.preventDefault();
    try { await api('PATCH', `/admin/emoji/${el.dataset.id}`, { name: $('#emrn', m).value }); closeModal(); refreshAdmin(); }
    catch (er) { $('#emrerr', m).textContent = er.message; }
  };
};
actions['emoji-hide'] = async (el) => { await api('PATCH', `/admin/emoji/${el.dataset.id}`, { hidden: el.dataset.hidden !== '1' }); refreshAdmin(); };
actions['emoji-del'] = async (el) => {
  if (!(await confirmBox(`Xóa :${el.dataset.name}:?`, 'Tin cũ sẽ hiện lại chữ :tên:, react bằng emoji này biến mất. Tên được giữ 30 ngày.', 'Xóa', true))) return;
  await api('DELETE', `/admin/emoji/${el.dataset.id}`);
  toast('Đã xóa emoji'); refreshAdmin();
};
