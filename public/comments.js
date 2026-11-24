// Bình luận cho bản tin (kind 'news') và tin nhắn ở Chủ đề nóng (kind 'msg')
import { $, esc, api, avatar, fmtDateTime, linkify, actions, toast, fail, confirmBox, avatarR, roleOf, roleClass, roleSr } from './core.js';
import { t } from './i18n.js';

const label = (n) => (n ? t('cmt.count', { n }) : t('cmt.label'));

// Nút mở khung bình luận + khung (ẩn) đặt ngay dưới
export function commentBlock(kind, id, count = 0) {
  return `<div class="cmt" data-kind="${kind}" data-id="${id}">
    <button type="button" class="link-btn cmt-toggle" data-act="cmt-toggle" aria-expanded="false">
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>
      <span class="cmt-count" data-n="${count}">${label(count)}</span></button>
    <div class="cmt-box" hidden></div></div>`;
}

const itemHtml = (c) => {
  const r = roleOf(c.user);
  return `<div class="cmt-item" data-cid="${c.id}">${avatarR(c.user, r, 'sm')}
    <div class="cmt-body"><div class="cmt-meta"><b class="${roleClass(r).trim()}">${esc(c.user.displayName)}${roleSr(r)}</b> <span class="tiny muted">${fmtDateTime(c.createdAt)}</span>
      ${c.canDelete ? `<button type="button" class="link-btn cmt-del" data-act="cmt-del" data-cid="${c.id}">${t('news.delete')}</button>` : ''}</div>
      <div class="cmt-text">${linkify(c.body)}</div></div></div>`;
};

async function load(wrap) {
  const box = $('.cmt-box', wrap);
  box.innerHTML = `<p class="small muted">${t('cmt.loading')}</p>`;
  const { comments } = await api('GET', `/comments/${wrap.dataset.kind}/${wrap.dataset.id}`);
  box.innerHTML = `<div class="cmt-list">${comments.map(itemHtml).join('') || `<p class="small muted cmt-empty">${t('cmt.empty')}</p>`}</div>
    <form class="cmt-form"><label class="sr-only" for="cmt-${wrap.dataset.kind}-${wrap.dataset.id}">${t('cmt.writeAria')}</label>
      <input class="input" id="cmt-${wrap.dataset.kind}-${wrap.dataset.id}" maxlength="1000" placeholder="${t('cmt.write')}" autocomplete="off">
      <button class="btn primary sm">${t('cmt.send')}</button></form>`;
  setCount(wrap, comments.length);
}
function setCount(wrap, n) {
  const el = $('.cmt-count', wrap);
  el.dataset.n = n;
  el.textContent = label(n);
}

actions['cmt-toggle'] = async (el) => {
  const wrap = el.closest('.cmt');
  const box = $('.cmt-box', wrap);
  const open = box.hidden;
  box.hidden = !open;
  el.setAttribute('aria-expanded', String(open));
  if (open) { try { await load(wrap); $('input', box)?.focus(); } catch (e) { box.hidden = true; fail(e); } }
};
actions['cmt-del'] = async (el) => {
  if (!(await confirmBox(t('cmt.delTitle'), t('cmt.delText'), t('news.delete'), true))) return;
  const wrap = el.closest('.cmt');
  try { await api('DELETE', `/comments/${el.dataset.cid}`); await load(wrap); } catch (e) { fail(e); }
};
document.addEventListener('submit', async (e) => {
  const form = e.target.closest?.('.cmt-form');
  if (!form) return;
  e.preventDefault();
  const wrap = form.closest('.cmt');
  const input = $('input', form);
  const body = input.value.trim();
  if (!body) return;
  const btn = $('button', form); btn.disabled = true;
  try {
    const { comment } = await api('POST', `/comments/${wrap.dataset.kind}/${wrap.dataset.id}`, { body });
    $('.cmt-empty', wrap)?.remove();
    $('.cmt-list', wrap).insertAdjacentHTML('beforeend', itemHtml(comment));
    setCount(wrap, Number($('.cmt-count', wrap).dataset.n) + 1);
    input.value = '';
    toast(t('cmt.sent'));
  } catch (er) { fail(er); }
  btn.disabled = false;
  input.focus();
});
