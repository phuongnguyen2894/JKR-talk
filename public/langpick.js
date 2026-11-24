// Chọn ngôn ngữ: thanh chọn ở trang đăng nhập/đăng ký, hộp chọn lần đầu cho khách, nút đổi ngôn ngữ cho khách.
import { $, esc, S, icon, openModal, closeModal, actions } from './core.js';
import { LANGS, getLang, setLang, t, isLang, guessBrowserLang, storedLang } from './i18n.js';

// hàng nút ngôn ngữ (dùng ở trang đăng nhập / đăng ký)
export const langBar = () => `<div class="lang-bar" role="group" aria-label="${esc(t('lang.label'))}">${LANGS.map((l) => `<button type="button" class="lang-opt" data-act="lang-set" data-lang="${l.code}" aria-pressed="${getLang() === l.code}" lang="${l.code === 'zh' ? 'zh-Hans' : l.code}">${esc(l.name)}</button>`).join('')}</div>`;

// đổi ngôn ngữ rồi vẽ lại trang hiện tại (hashchange); giữ lại chữ đang nhập ở form đăng nhập/đăng ký
export function applyLang(code, { remember = true } = {}) {
  if (!isLang(code)) return;
  const keep = {};
  for (const id of ['email', 'dn', 'pw', 'pw2', 'region', 'city']) { const el = document.getElementById(id); if (el && el.value !== '') keep[id] = el.value; }
  const acc = document.getElementById('accept')?.checked;
  setLang(code, remember);
  S.pendingForm = keep; S.pendingAccept = acc;
  S.hooks.renderSide?.();
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
export function restoreForm() {
  const keep = S.pendingForm; if (!keep) return;
  for (const [id, v] of Object.entries(keep)) { const el = document.getElementById(id); if (el) { el.value = v; if (id === 'region') el.dispatchEvent(new Event('change')); } }
  if (keep.city) { const c = document.getElementById('city'); if (c) { c.value = keep.city; c.dispatchEvent(new Event('change')); } }
  if (S.pendingAccept) { const a = document.getElementById('accept'); if (a) { a.checked = true; a.dispatchEvent(new Event('change')); } }
  S.pendingForm = null; S.pendingAccept = undefined;
}

actions['lang-set'] = (el) => { closeModal(); applyLang(el.dataset.lang); };
actions['lang-open'] = () => openLangModal();

// hộp chọn ngôn ngữ cho khách (lần đầu hoặc khi bấm nút)
export function openLangModal() {
  const cur = getLang();
  const m = openModal(`<h2>${esc(t('lang.title'))}</h2>
    <div class="lang-list" role="group" aria-label="${esc(t('lang.title'))}">${LANGS.map((l) => `<button type="button" class="lang-card" data-act="lang-set" data-lang="${l.code}" aria-pressed="${cur === l.code}" lang="${l.code === 'zh' ? 'zh-Hans' : l.code}"><b>${esc(l.name)}</b></button>`).join('')}</div>
    <p class="small muted">${esc(t('lang.hint'))}</p>
    <div class="btns"><button type="button" class="btn" data-close>${esc(t('lang.close'))}</button></div>`);
  $('.lang-card[aria-pressed="true"]', m)?.focus(); // vòng focus nằm đúng ngôn ngữ đang chọn, không gây hiểu nhầm hai ô cùng được chọn
  $('[data-close]', m).onclick = () => { try { localStorage.setItem('jkr_lang', getLang()); } catch { /* bỏ qua */ } closeModal(); };
}

// khách chưa từng chọn ngôn ngữ: hỏi một lần
export function maybeAskLang() {
  if (S.token || storedLang() || S.langAsked) return;
  S.langAsked = true;
  setLang(guessBrowserLang(), false);
  openLangModal();
}

export const langButton = () => `<button type="button" class="icon-btn lang-btn" data-act="lang-open" aria-label="${esc(t('lang.label'))}" title="${esc(t('lang.label'))}">${icon('globe', 20)}</button>`;
