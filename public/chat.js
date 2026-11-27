import { $, $$, esc, S, api, go, icon, locText, avatar, groupAvatar, fmtTime, fmtDate, fmtDateTime, dayKey, toast, fail, openModal, closeModal, ask, confirmBox, lightbox, refreshGroups, actions, mutedNow, imageToDataUrl, linkify, newsGallery, roleOf, avatarR, roleClass, roleSr, lvBadge, memberPickerHtml, wireMemberPicker, pickedIds } from './core.js';
import { maybeAskPush } from './push.js';
import { rememberRx, reactsHtml, composerPanelHtml, wireEmojiSuggest, reactIcon } from './emoji.js';
import { nameCls } from './frames.js';
import { t as tr } from './i18n.js';

const PUBLIC = ['country', 'region', 'province', 'topic'];
const EMOJI = ['😀','😂','🥹','😍','🥰','😭','😘','🤣','👍','🙏','👏','🔥','💜','💚','💙','💖','✨','🎉','😎','🤗','😅','🥺','😢','😡','🤔','🙌','💪','🌸','⭐','🎬','📺','🍿'];
const RULES = ['ch.rule1', 'ch.rule2', 'ch.rule3', 'ch.rule4', 'ch.rule5', 'ch.rule6']; // khoá dịch

let C = null; // trạng thái cuộc trò chuyện đang mở
export const activeChat = () => C;

const isPublic = (g) => PUBLIC.includes(g.type);
export const canModerate = (g) =>
  g.type === 'private' ? g.role === 'admin' : isPublic(g) && (g.role === 'mod' || S.me.role === 'admin');

// ===========================================================================
export async function renderChat(view, gid) {
  C = null;
  view.innerHTML = `<div class="gate muted">${tr('cmt.loading')}</div>`;
  let group;
  try {
    group = (await api('GET', `/groups/${gid}`)).group;
  } catch (e) {
    view.innerHTML = `<div class="gate"><p>${esc(e.message)}</p><a class="btn" href="#/chat">${tr('ch.back')}</a></div>`;
    return;
  }
  // Nhóm công khai chưa tham gia: vẫn xem được tin (chỉ đọc), muốn chat/thả tim thì bấm Tham gia
  const joined = group.role !== undefined;
  // Chủ đề thảo luận: chat / thả tim ngay, không cần bấm Tham gia (máy chủ tự thêm khi tương tác lần đầu)
  C = { gid: group.id, group, joined, open: group.type === 'topic', seen: new Set(), first: null, last: null, hasMore: false, replyTo: null, images: [], emoji: false };
  let first;
  try { first = await api('GET', `/groups/${gid}/messages?limit=40`); } catch (e) { C = null; view.innerHTML = `<div class="gate"><p>${esc(e.message)}</p><a class="btn" href="#/chat">${tr('ch.back')}</a></div>`; return; }
  C.hasMore = first.hasMore;
  C.tags = [];
  if (group.type === 'trend') { try { C.tags = (await api('GET', '/trend/tags')).tags; } catch {} }
  drawChat(view);
  wireSwipe();
  for (const m of first.messages) appendMsg(m, true);
  scrollBottom(true);
  if (S.jumpMsg) { const id = S.jumpMsg; S.jumpMsg = null; setTimeout(() => actions['goto-msg']({ dataset: { id } }), 80); } // mở từ thông báo: nhảy tới tin liên quan
  if (joined) {
    markRead();
    if (isPublic(group) && !C.open && !group.rulesAck) showRules();
  } else {
    // chưa có WebSocket cho người xem ngoài: làm mới nhẹ mỗi 8 giây
    const mine = C;
    if (group.type === 'topic') markRead(); // chủ đề chưa tham gia: ghi mốc đã xem để số tin mới về 0
    const t = setInterval(async () => {
      if (C !== mine || !$('#msgs')) return clearInterval(t);
      try { for (const m of (await api('GET', `/groups/${mine.gid}/messages?limit=40`)).messages) appendMsg(m); if (mine.group.type === 'topic') markRead(); } catch {}
    }, 8000);
  }
}

function subtitle(g) {
  if (g.type === 'trend') return `${tr('guest.subTrend')} · ${tr('ch.subTrendReview')} · ${tr('ch.members', { n: g.memberCount })}`;
  if (g.type === 'topic') return `${g.highlighted ? `<span class="hl-pill">★ ${tr('ch.featured')}</span> ` : ''}${tr('ch.topic')}${g.description ? ` · ${esc(g.description)}` : ''} · ${tr('ch.members', { n: g.memberCount })}`;
  if (isPublic(g)) return `${tr('ch.publicSub')} · ${tr('ch.members', { n: g.memberCount })}`;
  if (g.type === 'private') return `${tr('ch.privateSub')} · ${tr('ch.members', { n: `${g.memberCount}/${g.memberLimit}` })}`;
  const p = g.peer;
  return `${tr('nav.dm')}${p?.online ? ` · <span class="dot"></span> ${tr('ch.online')}` : ''}`;
}

function drawChat(view) {
  const g = C.group;
  view.innerHTML = `
  <div class="chat-head">
    <a class="icon-btn back" href="#/chat" aria-label="${tr('ch.backList')}">${icon('back', 22)}</a>
    ${g.type === 'dm' ? avatar(g.peer) : groupAvatar(g)}
    <div class="grow"><h1>${esc(g.name)}</h1><div class="small muted sub">${subtitle(g)}</div></div>
    ${C.joined && ['country', 'region', 'province', 'private'].includes(g.type) ? `<button class="icon-btn welcome-btn" data-act="welcome-open" data-id="${g.id}" aria-label="${tr('ch.welcomeNew')}${g.newcomers ? `, ${tr('ch.notGreeted', { n: g.newcomers })}` : ''}" title="${tr('ch.welcomeNew')}">👋${g.newcomers ? `<span class="badge">${g.newcomers > 99 ? '99+' : g.newcomers}</span>` : ''}</button>` : ''}
    ${g.type === 'topic' ? `<button class="icon-btn" data-act="share-topic" data-id="${g.id}" data-name="${esc(g.name)}" aria-label="${tr('ch.shareTopic')}" title="${tr('ch.shareTopic')}">${icon('share', 20)}</button>` : ''}
    <button class="icon-btn info-btn" data-act="info" aria-label="${tr('ch.groupInfo')}">${icon('info', 20)}</button>
    ${g.type !== 'dm' && C.joined ? `<button class="icon-btn" data-act="mute-dialog" aria-label="${tr('nav.notifs')}" title="${g.muted ? tr('ch.mutedNow') : tr('ch.mute')}">${icon('bell', 20)}${g.muted ? `<span class="sr-only">${tr('ch.mutedSr')}</span>` : ''}</button>
    ${g.type !== 'trend' && g.type !== 'country' ? `<button class="btn sm leave-btn" data-act="leave" data-id="${g.id}">${tr('ch.leave')}</button>` : ''}` : ''}
  </div>
  <div id="pinbar">${pinBarHtml()}</div>
  <div id="tagbar">${tagBarHtml()}</div>
  <div id="subs"></div>
  <div class="chat-body">
    <div class="chat-col">
      <div class="msgs" id="msgs" aria-live="off"><div id="more" ${C.hasMore ? '' : 'hidden'} style="text-align:center"><button class="btn sm" data-act="load-more">${tr('ch.loadOlder')}</button></div></div>
      <div class="rt-wrap"><button class="read-toggle" id="readtoggle" data-act="toggle-read" aria-pressed="false" aria-label="${tr('ch.readToggle')}"></button></div>
      <div class="composer" id="composer">${composerHtml()}</div>
    </div>
    <aside class="info wide" aria-label="${tr('ch.groupInfo')}">${infoHtml()}</aside>
  </div>`;
  wireComposer();
  syncReadMode();
  if (g.type === 'trend') loadSubs();
  // tin liền nhau của cùng một người (cách nhau dưới 5 phút, không có dòng ngày xen giữa): ẩn avatar và tên ở các tin sau
  const box = $('#msgs');
  if (box) { new MutationObserver(() => groupMsgs(box)).observe(box, { childList: true }); groupMsgs(box); }
  if (box && g.type === 'trend') { let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(loadCaps, 700); }).observe(box, { childList: true }); }
}
const GROUP_MS = 5 * 60_000;
function groupMsgs(box) {
  let prev = null;
  for (const el of box.children) {
    if (!el.classList.contains('msg')) { prev = null; continue; }
    const cont = !!prev && prev.dataset.uid === el.dataset.uid && Math.abs(Number(el.dataset.t) - Number(prev.dataset.t)) < GROUP_MS;
    el.classList.toggle('cont', cont);
    prev = el;
  }
}

// Hashtag của ngày ở đầu Đẩy trend: bấm mở tab "Top" trên X (app X nếu đã cài)
const xTagUrl = (t) => `https://x.com/search?q=${encodeURIComponent('#' + t)}`;
function tagBarHtml() {
  if (C?.group?.type !== 'trend') return '';
  const admin = S.me?.role === 'admin';
  const hasTags = !!C.tags?.length;
  return `<div class="tagbar"><span class="tiny muted grow">${hasTags || admin ? tr('ch.tagsHint') : tr('ch.capHint')}</span>
    <button class="btn sm" data-act="cap-toggle" aria-pressed="${capOn()}" title="${tr('ch.capTitle')}">${tr('ch.autoCap')}: ${capOn() ? tr('ch.on') : tr('ch.off')}</button>
    ${admin ? `<button class="btn sm" data-act="tags-edit">${tr('ch.edit')}</button>` : ''}
    ${hasTags || admin ? `<div class="tag-row">${(C.tags || []).map((t) => `<a class="tag-chip" href="${xTagUrl(t)}" target="_blank" rel="noopener noreferrer" aria-label="${tr('ch.openTag', { t: esc(t) })}">#${esc(t)} ${icon('share', 13)}</a>`).join('') || `<span class="tiny muted">${tr('ch.noTags')}</span>`}</div>` : ''}</div>`;
}
actions['tags-edit'] = () => {
  const m = openModal(`<form id="tagf" class="col"><h2>${tr('ch.tagsToday')}</h2>
    <div class="field"><label for="tagin">${tr('ch.tagsPerLine')}</label>
    <textarea class="input" id="tagin" rows="5" placeholder="#usmilePajamaPartyWithOrm">${esc((C.tags || []).map((t) => '#' + t).join('\n'))}</textarea></div>
    <p class="tiny muted">${tr('ch.tagsNote')}</p>
    <div class="field"><label for="capsel">${tr('ch.capTopic')}</label><select class="input" id="capsel" disabled><option>${tr('cmt.loading')}</option></select>
    <p class="tiny muted">${tr('ch.capNote')}</p></div>
    <div class="btns"><button type="button" class="btn" data-close>${tr('c.cancel')}</button><button class="btn primary">${tr('ch.save')}</button></div></form>`);
  $('[data-close]', m).onclick = closeModal;
  let capSel = '';
  api('GET', '/admin/trend/caption-topic').then((r) => {
    capSel = r.selected;
    const el = $('#capsel', m); if (!el) return;
    el.innerHTML = `<option value="">${tr('ch.capAuto')}</option>${r.topics.map((t) => `<option value="${esc(t.label)}" ${t.label === r.selected ? 'selected' : ''}>${esc(t.label)}${t.enabled ? ` (${tr('ch.enabled')})` : ''}</option>`).join('')}`;
    el.disabled = false;
  }).catch(() => { const el = $('#capsel', m); if (el) el.innerHTML = `<option>${tr('ch.capLoadFail')}</option>`; });
  $('#tagf', m).onsubmit = async (e) => {
    e.preventDefault();
    const tags = $('#tagin', m).value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    try {
      const sel = $('#capsel', m); if (sel && !sel.disabled && sel.value !== capSel) await api('PUT', '/admin/trend/caption-topic', { label: sel.value });
      C.tags = (await api('PUT', '/admin/trend/tags', { tags })).tags; closeModal(); const el = $('#tagbar'); if (el) el.innerHTML = tagBarHtml(); toast(tr('ch.tagsSaved')); } catch (er) { fail(er); }
  };
};

function pinBarHtml() {
  const p = C?.group?.pinned;
  if (!p) return '';
  const text = p.body ? p.body.replace(/\s+/g, ' ').slice(0, 140) : p.imageUrl ? tr('a.photoTag') : '';
  return `<div class="pinbar"><button type="button" class="pin-go" data-act="goto-msg" data-id="${p.id}" aria-label="${tr('ch.gotoPinned')}">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 5 3 3H7l3-3-1-5zM12 12v8"/></svg>
      <span class="pin-txt"><b>${esc(p.user.displayName)}</b>: ${esc(text)}</span></button>
    ${C.group.canPin ? `<button type="button" class="icon-btn pin-x" data-act="unpin" aria-label="${tr('ch.unpin')}">${icon('x', 16)}</button>` : ''}</div>`;
}
const redrawPin = () => { const el = $('#pinbar'); if (el) el.innerHTML = pinBarHtml(); };
actions['pin-msg'] = async (el) => {
  const id = Number(el.dataset.id);
  try {
    if (C.group.pinned?.id === id) { await api('DELETE', `/groups/${C.gid}/pin`); C.group.pinned = null; toast(tr('ch.unpinned')); }
    else { C.group.pinned = (await api('POST', `/groups/${C.gid}/pin`, { messageId: id })).pinned; toast(tr('ch.pinned')); }
    redrawPin();
  } catch (e) { fail(e); }
};
actions.unpin = async () => {
  try { await api('DELETE', `/groups/${C.gid}/pin`); C.group.pinned = null; redrawPin(); toast(tr('ch.unpinned')); } catch (e) { fail(e); }
};

const canAct = () => C.joined || C.open;
const canAddAny = () => S.me.role === 'admin' || (S.me.level || 0) >= 5;
// lần đầu chat / thả tim trong chủ đề → đã thành thành viên: cập nhật menu, bắt đầu nhận tin realtime
async function becameMember() {
  if (!C || C.joined) return;
  C.joined = true;
  C.group.rulesAck = true;
  await refreshGroups().catch(() => {});
  markRead();
}

function composerHtml() {
  const g = C.group;
  if (!canAct())
    return `<div class="notice row between wrap"><span>${tr('ch.readOnly')}</span><button class="btn primary sm" data-act="join" data-id="${g.id}">${tr('ch.join')}</button></div>`;
  if (g.type === 'trend' && !g.canPost && !g.canSubmit)
    return `<div class="notice">${tr('ch.staffOnly')}</div>`;
  if (isPublic(g) && !C.open && !g.rulesAck)
    return `<div class="notice row between wrap"><span>${tr('ch.ackRules')}</span><button class="btn primary sm" data-act="rules">${tr('ch.viewRules')}</button></div>`;
  if (g.modMutedUntil && g.modMutedUntil > Date.now())
    return `<div class="notice">${tr('ch.modMuted', { d: `${fmtTime(g.modMutedUntil)} ${fmtDate(g.modMutedUntil)}` })}</div>`;
  return `
    ${g.type === 'trend' ? `<div class="tiny muted" style="padding:4px 12px 0">${tr('ch.trendNote')}${g.canSubmit ? ` <b>${tr('ch.trendReview')}</b> ${tr('ch.trendReview2', { l: tr('lv.3') })}` : ''}</div>` : ''}
    ${C.replyTo ? `<div class="replybar"><span class="grow small">${tr('ch.reply')} <b>${esc(C.replyTo.name)}</b>: ${esc(C.replyTo.text)}</span><button class="link-btn" data-act="cancel-reply" aria-label="${tr('ch.cancelReply')}">${icon('x', 14)}</button></div>` : ''}
    ${C.images.length ? `<div class="preview-row">${C.images.map((u, i) => `<div class="preview"><img src="${esc(u)}" alt="${tr('ch.imgToSend', { n: i + 1 })}"><button type="button" data-act="remove-image" data-i="${i}" aria-label="${tr('ch.removeImg', { n: i + 1 })}">${icon('x', 14)}</button></div>`).join('')}</div>` : ''}
    ${C.emoji ? composerPanelHtml() : ''}
    <form id="msgform" autocomplete="off">
      <input type="file" id="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden>
      <button type="button" class="icon-btn" data-act="pick-image" aria-label="${tr('ch.sendImg')}">${icon('image', 22)}</button>
      <button type="button" class="icon-btn" data-act="emoji-toggle" aria-label="${tr('ch.pickEmoji')}" aria-expanded="${C.emoji}">${icon('smile', 22)}</button>
      <label for="msg" class="sr-only">${tr('ch.message')}</label>
      <input class="input" id="msg" type="text" maxlength="2000" placeholder="${tr('ch.msgTo', { g: esc(g.name) })}">
      <button class="btn primary" style="width:48px;padding:0" aria-label="${tr('cmt.send')}">${icon('send', 20)}</button>
    </form>`;
}

function redrawComposer() {
  const keep = $('#msg')?.value || '';
  $('#composer').innerHTML = composerHtml();
  wireComposer();
  const i = $('#msg');
  if (i) { i.value = keep; i.focus(); }
}

function wireComposer() {
  const form = $('#msgform');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#msg');
    const body = input.value.trim();
    if (!body && !C.images.length) return;
    input.disabled = true;
    try {
      const low = body.toLowerCase();
      const mentions = Object.entries(C.mentionMap || {}).filter(([n]) => low.includes('@' + n)).map(([, id]) => id);
      const sent = await api('POST', `/groups/${C.gid}/messages`, { body, imageUrls: C.images, replyTo: C.replyTo?.id, mentions });
      const message = sent.message;
      C.mentionMap = {};
      C.replyTo = null; C.images = []; C.emoji = false;
      if (sent.pending) { toast(tr('ch.sentPending'), 5000); loadSubs(); } else appendMsg(message);
      becameMember();
      setTimeout(maybeAskPush, 1200);
      scrollBottom(true);
      redrawComposer();
      $('#msg').value = '';
    } catch (err) {
      input.disabled = false;
      fail(err);
    }
  };
  wireMention();
  wireEmojiSuggest($('#msg'), $('#composer'));
  $('#file').onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    try {
      if (C.images.length + files.length > 4) throw new Error(tr('ch.max4', { n: C.images.length }));
      for (const f of files) C.images.push((await api('POST', '/upload', { dataUrl: await imageToDataUrl(f) })).url);
      redrawComposer();
    } catch (err) { redrawComposer(); fail(err); }
  };
}

// ---- gợi ý @tag khi gõ -------------------------------------------------------
function wireMention() {
  const input = $('#msg');
  if (!input || C.group.type === 'trend') return;
  let timer, items = [], active = 0, seq = 0;
  const pop = () => $('#mention-pop');
  const close = () => { pop()?.remove(); items = []; };
  const token = () => {
    const before = input.value.slice(0, input.selectionStart ?? input.value.length);
    const m = before.match(/(?:^|\s)@([^\s@]{0,30})$/);
    return m ? { q: m[1], start: before.length - m[1].length - 1 } : null;
  };
  const draw = () => {
    pop()?.remove();
    if (!items.length) return;
    const el = document.createElement('div');
    el.id = 'mention-pop'; el.className = 'mention-pop'; el.setAttribute('role', 'listbox');
    el.innerHTML = items.map((u, i) => `<button type="button" role="option" class="mention-item" data-i="${i}" aria-selected="${i === active}">${avatar(u, '" style="width:24px;height:24px;font-size:12px')}<span>${esc(u.displayName)}</span></button>`).join('');
    $('#composer').appendChild(el);
    el.onmousedown = (e) => { e.preventDefault(); const b = e.target.closest('[data-i]'); if (b) pick(items[Number(b.dataset.i)]); };
  };
  const pick = (u) => {
    const t = token();
    if (!t) return close();
    const after = input.value.slice(input.selectionStart ?? input.value.length);
    const ins = '@' + u.displayName + ' ';
    input.value = input.value.slice(0, t.start) + ins + after;
    const pos = t.start + ins.length;
    input.setSelectionRange(pos, pos);
    if (!u.all) (C.mentionMap ||= {})[u.displayName.toLowerCase()] = u.id;
    close(); input.focus();
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const t = token();
    if (!t) return close();
    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const r = await api('GET', `/groups/${C.gid}/mention-search?q=${encodeURIComponent(t.q)}`);
        if (mine !== seq || !token()) return;
        items = r.users;
        if (S.me.role === 'admin' && C.group.type !== 'dm' && 'everyone'.startsWith(t.q.toLowerCase())) items = [{ id: 0, displayName: 'everyone', all: true }, ...items];
        active = 0; draw();
      } catch { close(); }
    }, 180);
  });
  input.addEventListener('keydown', (e) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

const EVERYONE = { id: -1, displayName: 'everyone', all: true };
const mentionsOf = (m) => (m.mentionAll ? [...(m.mentions || []), EVERYONE] : m.mentions);

// ---- hiển thị tin nhắn ---------------------------------------------------------
const mine = (m) => m.user.id === S.me.id;
const canDelete = (m) => !m.deleted && (mine(m) || canModerate(C.group));

const safeHref = (u) => (/^https?:\/\//i.test(u) ? u : '#');
export function previewHtml(p) {
  if (!p) return '';
  return `<a class="lp" href="${esc(safeHref(p.url))}" target="_blank" rel="noopener noreferrer nofollow">
    <span class="lp-t"><b>${esc(p.title)}</b>${p.description ? `<span class="lp-d">${esc(p.description)}</span>` : ''}</span>
    ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async">` : ''}
    <span class="lp-s">${esc(p.site)}${p.time ? ` · ${fmtDateTime(p.time)}` : ''}</span></a>`;
}

// tin chỉ gồm 1 đến 5 emoji tùy chỉnh (đều có thật) thì hiện to
function onlyEmoji(body) {
  if (!/^(?:\s*:[a-z0-9_]{2,32}:\s*){1,5}$/.test(body)) return '';
  return [...body.matchAll(/:([a-z0-9_]{2,32}):/g)].every((x) => S.emojiByName?.[x[1]]) ? ' emoji-only' : '';
}
function msgHtml(m) {
  const own = mine(m);
  const quote = m.reply && !m.reply.deleted ? `<button type="button" class="quote" data-act="goto-msg" data-id="${m.reply.id}" aria-label="${tr('ch.gotoReplied')}">↪ ${esc(m.reply.displayName)}: ${m.reply.deleted ? tr('ch.deleted') : m.reply.body ? esc(m.reply.body) : m.reply.hasImage ? tr('a.photoTag') : ''}</button>` : '';
  const text = m.deleted
    ? `<div class="text gone">${tr('ch.deleted')}</div>`
    : (m.body ? (own ? `<div class="bubble${onlyEmoji(m.body)}">${linkify(m.body, mentionsOf(m))}</div>` : `<div class="text${onlyEmoji(m.body)}">${linkify(m.body, mentionsOf(m))}</div>`) : '');
  // ảnh (tối đa 4, dạng lưới) và xem trước link nằm dưới chữ
  const media = m.deleted ? '' : `${newsGallery(m.imageUrls?.length ? m.imageUrls : m.imageUrl ? [m.imageUrl] : [], 'zoom')}${m.preview ? previewHtml(m.preview) : ''}`;
  const rr = roleOf(m.user, m.modRole);
  rememberRx(m);
  const reactBtn = m.deleted || own || !canAct() ? '' : `<button type="button" class="link-btn reactbtn" data-act="react-open" data-id="${m.id}" aria-label="${tr('ch.addReact')}">${reactIcon}</button>`;
  const fwdTag = m.fwd && !m.deleted ? `<div class="tiny muted fwd">↪ ${tr('ch.fwdFrom', { n: esc(m.fwd.name) })}${m.fwd.group ? ` · ${esc(m.fwd.group)}` : ''}</div>` : '';
  const canReply = canAct() && !(C.group.type === 'trend' && !C.group.canPost);
  const acts = m.deleted ? '' : `<div class="actions">
      <button type="button" class="link-btn more" data-act="msg-more" aria-haspopup="menu" aria-expanded="false" aria-label="${tr('ch.moreActions')}">⋯</button>
      <div class="msg-menu" role="menu" hidden>
        ${canReply ? `<button type="button" role="menuitem" data-act="reply" data-id="${m.id}">${tr('ch.reply')}</button>` : ''}
        <button type="button" role="menuitem" data-act="fwd-msg" data-id="${m.id}">${tr('ch.forward')}</button>
        <button type="button" role="menuitem" data-act="react-who" data-id="${m.id}">${tr('ch.whoReacted')}</button>
        ${C.group.canPin ? `<button type="button" role="menuitem" data-act="pin-msg" data-id="${m.id}">${C.group.pinned?.id === m.id ? tr('ch.unpin') : tr('ch.pin')}</button>` : ''}
        ${!own && canAct() ? `<button type="button" role="menuitem" data-act="report-msg" data-id="${m.id}">${tr('ch.report')}</button>` : ''}
        ${canDelete(m) ? `<button type="button" role="menuitem" class="danger" data-act="del-msg" data-id="${m.id}">${tr('news.delete')}</button>` : ''}
      </div></div>`;
  const who = m.user.deleted
    ? `<span class="who muted">${esc(m.user.displayName)}</span>`
    : `<button class="who${roleClass(rr)}${nameCls(m.user)}" data-act="profile" data-id="${m.user.id}">${esc(m.user.displayName)}${roleSr(rr)}${lvBadge(m.user.level)}</button>`;
  return `<div class="msg ${own ? 'own' : ''}" data-mid="${m.id}" data-uid="${m.user.id}" data-t="${m.createdAt}" data-name="${esc(m.user.displayName)}">
    ${own ? '' : m.user.deleted ? avatar(m.user) : `<button class="av-btn" style="background:none;border:0;padding:0" data-act="profile" data-id="${m.user.id}" aria-label="${tr('ch.viewProfile', { n: esc(m.user.displayName) })}">${avatarR(m.user, rr)}</button>`}
    <div class="body">
      <div class="meta">${own ? '' : who}<span class="tiny muted time">${fmtTime(m.createdAt)}</span></div>
      ${fwdTag}${quote}${media ? `${text}<div class="bline"><div class="bmedia">${media}</div><div class="row">${reactBtn}${acts}</div></div>` : `<div class="bline">${text}<div class="row">${reactBtn}${acts}</div></div>`}
      ${reactsHtml(m, { own, can: canAct() })}
    </div></div>`;
}

function appendMsg(m, initial = false) {
  const box = $('#msgs');
  if (!box || C.seen.has(m.id)) return;
  C.seen.add(m.id);
  const stick = initial || box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const k = dayKey(m.createdAt);
  let html = '';
  if (C.lastDay !== k) { html += `<div class="day">${fmtDate(m.createdAt)}</div>`; C.lastDay = k; }
  if (m.deleted) return;
  box.insertAdjacentHTML('beforeend', html + msgHtml(m));
  C.last = m.id;
  if (!C.first) C.first = m.id;
  if (stick && !initial) scrollBottom();
}

const scrollBottom = () => { const b = $('#msgs'); if (b) b.scrollTop = b.scrollHeight; };

async function markRead() {
  if (!C || (!C.joined && C.group?.type !== 'topic') || document.hidden) return;
  try { await api('POST', `/groups/${C.gid}/read`); } catch {}
  const g = S.groups.find((x) => x.id === C.gid);
  if (g && g.unread) { g.unread = 0; S.hooks.renderSide?.(); }
  const h = (S.highlights || []).find((x) => x.id === C.gid);
  if (h && h.unread) { h.unread = 0; S.hooks.renderSide?.(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) markRead(); });

// ---- realtime ------------------------------------------------------------------
export function onSocket(ev) {
  if (ev.type === 'message') {
    const m = ev.message;
    if (C && C.gid === m.groupId && $('#msgs')) {
      appendMsg(m);
      if (!mine(m)) markRead();
      return;
    }
    const g = S.groups.find((x) => x.id === m.groupId);
    if (!g) return refreshGroups();
    if (!mine(m)) {
      g.unread = Math.min((g.unread || 0) + 1, 99);
      if (!mutedNow(g)) { S.hooks.toastMsg?.(g, m); }
      S.hooks.renderSide?.();
    }
  } else if (ev.type === 'pin' && C && C.gid === ev.groupId) {
    C.group.pinned = ev.message;
    redrawPin();
  } else if (ev.type === 'message_preview' && C && C.gid === ev.groupId) {
    const el = $(`.msg[data-mid="${ev.messageId}"] .body`);
    if (el && !$('.lp', el)) {
      const row = $('.row', el);
      const line = row?.parentElement; // dòng chứa nút tim và ⋯
      if (line?.classList.contains('bline')) {
        const media = $('.bmedia', line);
        if (media) media.insertAdjacentHTML('beforeend', previewHtml(ev.preview)); // đã có ảnh: xem trước nằm dưới ảnh
        else { // tin chỉ có chữ: khung xem trước và nút tim/⋯ nằm cùng một hàng bên dưới
          line.insertAdjacentHTML('afterend', `<div class="bline"><div class="bmedia">${previewHtml(ev.preview)}</div></div>`);
          line.nextElementSibling.appendChild(row);
        }
      }
    }
  } else if (ev.type === 'message_deleted' && C && C.gid === ev.groupId) {
    const el = $(`.msg[data-mid="${ev.messageId}"]`);
    // tin bị xóa biến mất hẳn (kèm dòng ngày nếu không còn tin nào dưới nó) và bỏ trích dẫn trỏ tới nó
    $$(`.quote[data-id="${ev.messageId}"]`).forEach((q) => q.hidden = true);
    if (el) {
      const prev = el.previousElementSibling, next = el.nextElementSibling;
      el.hidden = true;
      el.style.display = 'none';
      if (prev?.classList.contains('day') && (!next || next.classList.contains('day'))) prev.style.display = 'none';
    }
  }
}

// ---- quy tắc, thông báo, rời nhóm ----------------------------------------------
function showRules() {
  openModal(`<h2>${tr('ch.rules')}</h2><p class="muted small">${tr('ch.rulesRead', { g: esc(C.group.name) })}</p>
    <ol class="col small" style="padding-left:20px;margin:0">${RULES.map((r) => `<li>${esc(tr(r))}</li>`).join('')}</ol>
    <div class="btns"><button class="btn" data-close>${tr('push.askLater')}</button><button class="btn primary" id="ack">${tr('ch.readAgree')}</button></div>`);
  $('#modal [data-close]').onclick = closeModal;
  $('#ack').onclick = async () => {
    try {
      await api('POST', `/groups/${C.gid}/rules-ack`);
      C.group.rulesAck = true;
      closeModal();
      redrawComposer();
    } catch (e) { fail(e); }
  };
}
actions.rules = showRules;

actions.join = async (el) => {
  try {
    await api('POST', `/groups/${el.dataset.id}/join`);
    await refreshGroups();
    go(`#/chat/${el.dataset.id}`);
  } catch (e) { fail(e); }
};
actions.leave = async (el) => {
  const g = S.groups.find((x) => x.id === Number(el.dataset.id));
  const msg = g?.type === 'private' ? tr('ch.leavePrivate') : tr('ch.leavePublic');
  if (!(await confirmBox(tr('ch.leaveQ', { g: g?.name || '' }), msg, tr('ch.leave'), true))) return;
  try {
    await api('POST', `/groups/${el.dataset.id}/leave`);
    await refreshGroups();
    go('#/chat');
  } catch (e) { fail(e); }
};
actions['mute-dialog'] = async () => {
  const v = await ask({
    title: tr('ch.groupNotifs'),
    fields: [{ name: 'duration', label: tr('ch.mute'), type: 'select', value: C.group.muted ? 'off' : '1h', options: [
      { value: '1h', label: tr('ch.for1h') }, { value: '8h', label: tr('ch.for8h') }, { value: 'forever', label: tr('ch.forever') }, { value: 'off', label: tr('ch.unmute') }] }],
  });
  if (!v) return;
  try {
    const r = await api('POST', `/groups/${C.gid}/mute`, v);
    C.group.muted = r.muted; C.group.mutedUntil = r.mutedUntil;
    const g = S.groups.find((x) => x.id === C.gid);
    if (g) { g.muted = r.muted; g.mutedUntil = r.mutedUntil; }
    toast(r.muted ? tr('ch.mutedToast') : tr('ch.unmutedToast'));
  } catch (e) { fail(e); }
};

// ---- thao tác trên tin nhắn ----------------------------------------------------
export function setHeart(btn, hearts, hearted) {
  if (!btn) return;
  if (hearted !== undefined) {
    btn.classList.toggle('on', hearted);
    btn.setAttribute('aria-pressed', hearted);
    btn.innerHTML = icon('heart', 15, hearted ? 'fill="currentColor"' : '') + '<span class="hc"></span>';
  }
  $('.hc', btn).textContent = hearts || '';
  btn.setAttribute('aria-label', tr('news.heart', { n: hearts }));
}
actions.heart = async (el) => {
  const r = await api('POST', `/messages/${el.dataset.id}/heart`);
  setHeart(el, r.hearts, r.hearted);
  becameMember();
};
// giờ gửi chỉ hiện khi chạm vào tin nhắn
document.addEventListener('click', (e) => {
  const msg = e.target.closest('.msg');
  if (!msg || e.target.closest('button, a, img, input, textarea, select, .msg-menu, [data-act]')) return;
  if (getSelection()?.toString()) return; // đang bôi đen chữ để sao chép
  msg.classList.toggle('show-time');
});

// menu ⋯ của tin nhắn: hiện dạng nổi (fixed) để không bị cắt bởi vùng cuộn
function closeMsgMenu() {
  $$('.msg-menu:not([hidden])').forEach((m) => {
    m.hidden = true;
    m.style.cssText = '';
    m.parentElement.querySelector('.more')?.setAttribute('aria-expanded', 'false');
  });
}
actions['msg-more'] = (el) => {
  const menu = el.parentElement.querySelector('.msg-menu');
  const wasOpen = !menu.hidden;
  closeMsgMenu();
  if (wasOpen) return;
  menu.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden'; // ra khỏi luồng trước khi đo, để không đẩy lệch hàng nút
  menu.hidden = false;
  el.setAttribute('aria-expanded', 'true');
  const r = el.getBoundingClientRect(), mh = menu.offsetHeight, mw = menu.offsetWidth;
  const top = r.bottom + mh + 8 > innerHeight ? Math.max(8, r.top - mh - 4) : r.bottom + 4;
  const left = Math.min(Math.max(8, r.left), innerWidth - mw - 8);
  menu.style.cssText = `position:fixed;top:${top}px;left:${left}px`;
  menu.querySelector('button')?.focus();
};
document.addEventListener('click', (e) => {
  if (!e.target.closest('.msg-menu, [data-act="msg-more"]') || e.target.closest('.msg-menu button')) closeMsgMenu();
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMsgMenu(); });
document.addEventListener('scroll', closeMsgMenu, true);

// vuốt sang phải trên một tin để trả lời nhanh (cảm ứng)
function wireSwipe() {
  const box = $('#msgs');
  if (!box) return;
  let x0, y0, el0, t0;
  box.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
    el0 = x0 > 28 ? e.target.closest('.msg') : null;
  }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (!el0) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = Math.abs(t.clientY - y0);
    const msg = el0; el0 = null;
    if (dx > 70 && dy < 30 && Date.now() - t0 < 600) {
      const b = msg.querySelector('[data-act="reply"]');
      if (b) { actions.reply(b); $('#msg')?.focus(); }
    }
  }, { passive: true });
}

actions.reply = (el) => {
  const msg = el.closest('.msg');
  C.replyTo = { id: Number(msg.dataset.mid), name: msg.dataset.name, text: ($('.text, .bubble', msg)?.textContent || tr('a.photoTag')).slice(0, 60) };
  redrawComposer();
};
actions['cancel-reply'] = () => { C.replyTo = null; redrawComposer(); };
actions['pick-image'] = () => $('#file').click();
actions['remove-image'] = (el) => { C.images.splice(Number(el.dataset.i), 1); redrawComposer(); };
actions['emoji-toggle'] = () => { C.emoji = !C.emoji; redrawComposer(); };
actions.emoji = (el) => { const i = $('#msg'); i.value += el.dataset.e; i.focus(); };
actions.zoom = (el) => lightbox(el.dataset.src);
actions['goto-msg'] = async (el) => {
  const find = () => $(`.msg[data-mid="${el.dataset.id}"]`);
  for (let i = 0; i < 10 && !find(); i++) {
    if ($('#more').hidden) break;
    await actions['load-more']();
  }
  const t = find();
  if (!t) return toast(tr('ch.origMissing'));
  t.scrollIntoView({ block: 'center', behavior: 'smooth' });
  t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
};
actions['load-more'] = async () => {
  const box = $('#msgs');
  const { messages, hasMore } = await api('GET', `/groups/${C.gid}/messages?limit=40&before=${C.first}`).catch((e) => (fail(e), { messages: [], hasMore: true }));
  if (!messages.length) return;
  const prevH = box.scrollHeight;
  const html = messages.map((m) => { C.seen.add(m.id); return msgHtml(m); }).join('');
  $('#more').insertAdjacentHTML('afterend', html);
  C.first = messages[0].id;
  box.scrollTop += box.scrollHeight - prevH;
  $('#more').hidden = !hasMore;
};
actions['del-msg'] = async (el) => {
  const msg = el.closest('.msg');
  const own = msg.dataset.uid === String(S.me.id);
  let reason;
  if (own) { if (!(await confirmBox(tr('ch.delQ'), tr('ch.delText'), tr('news.delete'), true))) return; }
  else {
    const v = await ask({ title: tr('ch.delViolation'), fields: [{ name: 'reason', label: tr('ch.reasonSent'), type: 'textarea', required: true, max: 300 }], ok: tr('news.delete'), danger: true });
    if (!v) return;
    reason = v.reason;
  }
  try { await api('DELETE', `/messages/${msg.dataset.mid}`, { reason }); } catch (e) { fail(e); }
};

actions['fwd-msg'] = async (el) => {
  const mid = Number(el.dataset.id);
  try {
    const { groups } = await api('GET', '/groups/mine');
    const opts = groups.filter((g) => g.type !== 'trend' || g.canPost).map((g) => ({ value: g.id, label: g.name }));
    if (!opts.length) return toast(tr('ch.noFwdGroups'));
    const v = await ask({ title: tr('ch.fwdTitle'), text: tr('ch.fwdText'), fields: [{ name: 'groupId', label: tr('ch.fwdTo'), type: 'select', options: opts }], ok: tr('ch.forward') });
    if (!v) return;
    await api('POST', `/messages/${mid}/forward`, { groupId: Number(v.groupId) });
    toast(tr('ch.forwarded'));
  } catch (e) { fail(e); }
};

// giá trị gửi lên máy chủ giữ tiếng Việt (admin đọc); nhãn hiển thị theo ngôn ngữ
export const REPORT_REASONS = ['Spam hoặc quảng cáo', 'Quấy rối, công kích', 'Nội dung không phù hợp', 'Mạo danh', 'Khác'];
export const reasonLabel = (r) => tr(`ch.rr${REPORT_REASONS.indexOf(r)}`);
export async function reportDialog({ messageId, userId, groupId }) {
  const v = await ask({
    title: messageId ? tr('ch.reportMsg') : tr('ch.reportUser'),
    text: tr('ch.reportAnon'),
    fields: [
      { name: 'cat', label: tr('ch.reason'), type: 'select', options: REPORT_REASONS.map((r) => ({ value: r, label: reasonLabel(r) })) },
      { name: 'detail', label: tr('ch.moreDetail'), type: 'textarea', max: 400 },
    ],
    ok: tr('ch.sendReport'),
  });
  if (!v) return;
  try {
    await api('POST', '/reports', { messageId, userId, groupId, reason: v.detail ? `${v.cat}: ${v.detail}` : v.cat });
    toast(tr('ch.reportSent'));
  } catch (e) { fail(e); }
}
actions['report-msg'] = (el) => reportDialog({ messageId: Number(el.closest('.msg').dataset.mid), groupId: C?.gid });

// ---- hồ sơ người dùng -----------------------------------------------------------
export async function openProfile(uid, gid = C?.gid) {
  if (uid === S.me.id) return go('#/settings');
  let r;
  try { r = await api('GET', `/users/${uid}`); } catch (e) { return fail(e); }
  const u = r.user;
  const g = gid ? S.groups.find((x) => x.id === gid) : null;
  const rel = u.isAdmin ? '' : { none: `<button class="btn primary" data-act="friend-add" data-id="${u.id}">${tr('ch.addFriend')}</button>`,
    sent: `<button class="btn" disabled>${tr('ch.reqSent')}</button>`,
    received: `<button class="btn primary" data-act="fr-accept" data-id="${r.requestId}">${tr('ch.acceptReq')}</button>`,
    friend: `<button class="btn primary" data-act="dm" data-id="${u.id}">${tr('ch.dm')}</button>` }[r.relation] || '';
  const staff = g && canModerate(g) && r.relation !== 'self';
  openModal(`<div class="row">${avatar(u, 'lg')}<div class="grow"><h2>${esc(u.displayName)} ${u.isAdmin ? '<span class="pill">Admin</span>' : ''}</h2>
      ${u.online ? `<div class="small"><span class="dot"></span> ${tr('ch.onlineCap')}</div>` : ''}
      ${u.location ? `<div class="small muted loc-line">${icon('pin', 14)}${esc(locText(u.location))}</div>` : ''}</div></div>
    <div class="row wrap">${rel}</div>
    <div class="row wrap">
      ${r.relation === 'friend' ? `<button class="btn sm" data-act="unfriend" data-id="${u.id}">${tr('ch.unfriend')}</button>` : ''}
      <button class="btn sm" data-act="block" data-id="${u.id}">${tr('ch.block')}</button>
      <button class="btn sm" data-act="report-user" data-id="${u.id}" data-gid="${gid || ''}">${tr('ch.report')}</button>
    </div>
    ${staff ? `<div><div class="h2">${tr('ch.manageGroup')}</div><div class="row wrap"><button class="btn sm" data-act="mod-mute" data-id="${u.id}" data-gid="${g.id}">${tr('ch.muteUser')}</button><button class="btn sm danger" data-act="mod-kick" data-id="${u.id}" data-gid="${g.id}">${g.type === 'private' ? tr('ch.removeFromGroup') : tr('ch.kick')}</button></div></div>` : ''}
    <div class="btns"><button class="btn" data-close>${tr('lang.close')}</button></div>`);
  $('#modal [data-close]').onclick = closeModal;
}
actions.profile = (el) => openProfile(Number(el.dataset.id));
actions['report-user'] = (el) => { closeModal(); reportDialog({ userId: Number(el.dataset.id), groupId: Number(el.dataset.gid) || undefined }); };
actions['mod-mute'] = async (el) => {
  const v = await ask({ title: tr('ch.muteMember'), fields: [
    { name: 'minutes', label: tr('ch.minutes'), type: 'number', value: 60, min: 1, max: 43200, required: true },
    { name: 'reason', label: tr('ch.reason'), type: 'textarea', required: true, max: 300 }], ok: tr('ch.muteUser') });
  if (!v) return;
  try { await api('POST', `/groups/${el.dataset.gid}/members/${el.dataset.id}/mute`, { minutes: Number(v.minutes), reason: v.reason }); toast(tr('ch.memberMuted')); } catch (e) { fail(e); }
};
actions['mod-kick'] = async (el) => {
  const v = await ask({ title: tr('ch.removeMember'), fields: [{ name: 'reason', label: tr('ch.reason'), type: 'textarea', required: true, max: 300 }], ok: tr('news.delete'), danger: true });
  if (!v) return;
  try {
    await api('POST', `/groups/${el.dataset.gid}/members/${el.dataset.id}/kick`, { reason: v.reason });
    toast(tr('ch.memberRemoved'));
    if (C) { C.group = (await api('GET', `/groups/${C.gid}`)).group; $('.info')?.replaceChildren(); $('.info') && ($('.info').innerHTML = infoHtml()); }
  } catch (e) { fail(e); }
};

// ---- panel thông tin nhóm ------------------------------------------------------
const ABOUT = {
  country: 'ch.aboutCountry',
  region: 'ch.aboutRegion',
  province: 'ch.aboutProvince',
  private: 'ch.aboutPrivate',
  dm: 'ch.aboutDm',
};
function infoHtml() {
  const g = C.group;
  let h = `<section><div class="h2">${tr('ch.about')}</div><p class="small">${esc(ABOUT[g.type] ? tr(ABOUT[g.type]) : '')}</p></section>`;
  if (isPublic(g)) {
    h += `<section><div class="h2">${tr('ch.mods')}</div>${g.mods.length ? g.mods.map((u) => `<div class="row" style="min-height:44px">${avatar(u)}<span>${esc(u.displayName)} <span class="muted">· Mod</span></span></div>`).join('') : `<p class="small muted">${tr('ch.noMods')}</p>`}
      <p class="small muted" style="margin-top:4px">${tr('ch.modsNote')}</p></section>`;
  }
  if (g.type === 'topic' && S.me.role === 'admin') h += `<section class="col"><div class="h2">${tr('ch.manageTopic')}</div><button class="btn danger block" data-act="topic-del" data-id="${g.id}" data-name="${esc(g.name)}">${tr('ch.closeTopic')}</button>
      <p class="small muted" style="margin-top:4px">${tr('ch.closeTopicNote')}</p></section>`;
  if (g.type === 'private') {
    const admin = g.role === 'admin';
    h += `<section><div class="h2">${tr('ch.membersTitle')} (${g.members.length}/${g.memberLimit})</div><div class="list">${g.members.map((u) => `
      <div class="row" style="min-height:44px">${avatar(u)}<button class="who grow" style="background:none;border:0;text-align:left;font-weight:600;padding:0" data-act="profile" data-id="${u.id}">${esc(u.displayName)}${u.role === 'admin' ? ' <span class="pill">Admin</span>' : ''}${u.id === S.me.id ? ` <span class="muted">(${tr('ch.you')})</span>` : ''}</button>
        ${admin && u.id !== S.me.id ? `<button class="link-btn" data-act="pg-admin" data-id="${u.id}" data-role="${u.role}">${u.role === 'admin' ? tr('ch.removeAdmin') : tr('ch.makeAdmin')}</button><button class="link-btn" data-act="mod-kick" data-id="${u.id}" data-gid="${g.id}">${tr('news.delete')}</button>` : ''}</div>`).join('')}</div></section>`;
    if (admin) h += `<section class="col"><div class="h2">${tr('ch.manageGroup')}</div>
      <button class="btn sm" data-act="pg-invite">${canAddAny() ? tr('ch.addMembers') : tr('ch.inviteFriends')}</button>
      <button class="btn sm" data-act="pg-links">${tr('ch.inviteLinks')}</button>
      <button class="btn sm" data-act="pg-edit">${tr('ch.renameLimit')}</button>
      <button class="btn sm danger" data-act="pg-dissolve">${tr('ch.dissolve')}</button></section>`;
  }
  if (!C.joined && !C.open) h += `<section><button class="btn primary block" data-act="join" data-id="${g.id}">${tr('ch.join')}</button></section>`;
  else if (g.type !== 'dm' && g.type !== 'trend' && g.type !== 'country') h += `<section><button class="btn danger block" data-act="leave" data-id="${g.id}">${tr('ch.leave')}</button></section>`;
  if (g.type !== 'dm') h += `<section><div class="h2">${tr('ch.problem')}</div><button class="btn block" data-act="report-help">${g.type === 'private' ? tr('ch.reportToAdmin') : tr('ch.reportToMod')}</button></section>`;
  else h += `<section><div class="h2">${tr('ch.problem')}</div><button class="btn block" data-act="report-user" data-id="${g.peer.id}" data-gid="${g.id}">${tr('ch.reportPerson')}</button></section>`;
  return h;
}
actions.info = () => openModal(`${infoHtml()}<div class="btns"><button class="btn" data-close>${tr('lang.close')}</button></div>`) && ($('#modal [data-close]').onclick = closeModal);
actions['report-help'] = () => openModal(`<h2>${tr('ch.reportViolation')}</h2><p class="small">${tr('ch.reportHow')}</p><div class="btns"><button class="btn primary" data-close>${tr('ch.gotIt')}</button></div>`) && ($('#modal [data-close]').onclick = closeModal);

async function reloadGroup() {
  C.group = (await api('GET', `/groups/${C.gid}`)).group;
  const a = $('.info'); if (a) a.innerHTML = infoHtml();
  await refreshGroups();
}
actions['pg-admin'] = async (el) => {
  try {
    await api(el.dataset.role === 'admin' ? 'DELETE' : 'POST', `/private/${C.gid}/admins/${el.dataset.id}`);
    await reloadGroup();
  } catch (e) { fail(e); }
};
actions['pg-edit'] = async () => {
  const v = await ask({ title: tr('ch.groupSettings'), fields: [
    { name: 'name', label: tr('ch.groupName'), value: C.group.name, required: true, max: 50 },
    { name: 'memberLimit', label: tr('ch.memberLimit'), type: 'number', value: C.group.memberLimit, min: 2, max: 200, required: true }], ok: tr('ch.save') });
  if (!v) return;
  try { await api('PATCH', `/private/${C.gid}`, { name: v.name, memberLimit: Number(v.memberLimit) }); await reloadGroup(); location.reload(); } catch (e) { fail(e); }
};
actions['pg-dissolve'] = async () => {
  if (!(await confirmBox(tr('ch.dissolveQ'), tr('ch.dissolveText'), tr('ch.dissolveOk'), true))) return;
  try { await api('DELETE', `/private/${C.gid}`); await refreshGroups(); go('#/chat'); } catch (e) { fail(e); }
};
actions['pg-invite'] = async () => {
  const { friends } = await api('GET', '/friends');
  const ids = new Set(C.group.members.map((m) => m.id));
  const cands = friends.filter((f) => !ids.has(f.id));
  const sysAdmin = canAddAny();
  if (!cands.length && !sysAdmin) return toast(tr('ch.noMoreFriends'));
  openModal(`<form id="invf" class="col"><h2>${sysAdmin ? tr('ch.addMembers') : tr('ch.inviteFriends')}</h2><p class="small muted">${sysAdmin ? tr('ch.addAnyNote') : tr('ch.friendsOnly')}</p>
    ${memberPickerHtml(cands)}
    <div class="btns"><button type="button" class="btn" data-close>${tr('c.cancel')}</button><button class="btn primary">${sysAdmin ? tr('ch.add') : tr('ch.invite')}</button></div></form>`);
  $('#modal [data-close]').onclick = closeModal;
  wireMemberPicker(ids);
  $('#invf').onsubmit = async (e) => {
    e.preventDefault();
    const userIds = pickedIds();
    if (!userIds.length) return;
    try { await api('POST', `/private/${C.gid}/invite`, { userIds }); closeModal(); toast(tr('ch.membersAdded')); await reloadGroup(); } catch (er) { fail(er); }
  };
};
actions['pg-links'] = async () => {
  const draw = async () => {
    const { links } = await api('GET', `/private/${C.gid}/links`);
    const m = openModal(`<h2>${tr('ch.inviteLinks')}</h2><p class="small muted">${tr('ch.linksNote')}</p>
      <div class="list">${links.map((l) => { const url = `${location.origin}/#/join/${l.code}`; return `<div class="card col"><input class="input" readonly value="${esc(url)}" aria-label="${tr('ch.inviteLinks')}"><div class="row between"><span class="tiny muted">${tr('ch.expires', { d: `${fmtTime(l.expires_at)} ${fmtDate(l.expires_at)}` })}</span><span><button class="btn sm" data-copy="${esc(url)}">${tr('ch.copy')}</button> <button class="btn sm danger" data-revoke="${l.code}">${tr('ch.revoke')}</button></span></div></div>`; }).join('') || `<p class="small muted">${tr('ch.noLinks')}</p>`}</div>
      <form id="lf" class="row"><label class="sr-only" for="hrs">${tr('ch.validFor')}</label><select class="input" id="hrs"><option value="1">${tr('ch.hours', { n: 1 })}</option><option value="24" selected>${tr('ch.hours', { n: 24 })}</option><option value="168">${tr('ch.days', { n: 7 })}</option><option value="720">${tr('ch.days', { n: 30 })}</option></select><button class="btn primary">${tr('ch.createLink')}</button></form>
      <div class="btns"><button class="btn" data-close>${tr('lang.close')}</button></div>`);
    $('[data-close]', m).onclick = closeModal;
    $('#lf', m).onsubmit = async (e) => { e.preventDefault(); try { await api('POST', `/private/${C.gid}/links`, { hours: Number($('#hrs').value) }); draw(); } catch (er) { fail(er); } };
    $$('[data-copy]', m).forEach((b) => (b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => toast(tr('ch.linkCopied')))));
    $$('[data-revoke]', m).forEach((b) => (b.onclick = async () => { await api('DELETE', `/private/links/${b.dataset.revoke}`).catch(fail); draw(); }));
  };
  draw().catch(fail);
};

// Chế độ đọc: ẩn/hiện tiêu đề nhóm, ô nhập tin và menu để có thêm chỗ đọc
function applyRead(on) {
  const app = document.querySelector('.app');
  app?.classList.toggle('read-mode', on);
  if (app) { void app.offsetHeight; requestAnimationFrame(() => window.scrollTo(0, 0)); } // buộc tính lại bố cục khi ẩn/hiện thanh
  const b = document.getElementById('readtoggle');
  if (b) {
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? tr('ch.showChrome') : tr('ch.hideChrome');
    b.innerHTML = on
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  }
}
let readMode = false;
try { readMode = localStorage.getItem('jkr_readmode') === '1'; } catch {}
actions['toggle-read'] = () => {
  readMode = !readMode;
  try { localStorage.setItem('jkr_readmode', readMode ? '1' : '0'); } catch {}
  applyRead(readMode);
};
export const syncReadMode = () => applyRead(readMode);

// ---- caption cho link X ở Đẩy trend ------------------------------------------------------------------------------------------
const X_STATUS = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[^/?#]+\/status\/(\d+)/i;
// số lần đã bấm mỗi bài trên máy này (để xoay caption, không lặp lại cho đến khi hết vòng)
const capUses = (mid) => { try { return Number(JSON.parse(localStorage.getItem('jkr_capuse') || '{}')[mid]) || 0; } catch { return 0; } };
function bumpUses(mid) {
  try {
    const m = JSON.parse(localStorage.getItem('jkr_capuse') || '{}');
    m[mid] = (Number(m[mid]) || 0) + 1;
    const keys = Object.keys(m); if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete m[k]; // giữ gọn
    localStorage.setItem('jkr_capuse', JSON.stringify(m));
  } catch { /* bỏ qua */ }
}
function capOn() { try { return localStorage.getItem('jkr_cap') !== 'off'; } catch { return true; } }
actions['cap-toggle'] = () => {
  try { localStorage.setItem('jkr_cap', capOn() ? 'off' : 'on'); } catch { /* bỏ qua */ }
  const el = $('#tagbar'); if (el) el.innerHTML = tagBarHtml();
  toast(capOn() ? tr('ch.capOnToast') : tr('ch.capOffToast'));
};
// copy ngay trong lúc bấm (trình duyệt chỉ cho copy khi đang có thao tác của người dùng)
function copyText(text) {
  const legacy = () => { try { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;left:-9999px'; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); } catch { /* bỏ qua */ } };
  try { if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(legacy); else legacy(); } catch { legacy(); }
}
// tải trước caption của các bài X đang hiện; bài chưa có thì hỏi lại sau vài giây (máy chủ đang tạo nền)
async function loadCaps(tries = 0) {
  const mine = C;
  if (!mine || mine.group.type !== 'trend' || !capOn()) return;
  mine.caps ||= {};
  const ids = [...$$('#msgs .msg')].filter((el) => [...el.querySelectorAll('a[href]')].some((a) => X_STATUS.test(a.href))).map((el) => Number(el.dataset.mid)).filter((id) => id && !mine.caps[id]).slice(-40);
  if (!ids.length) return;
  try {
    const r = await api('GET', `/trend/captions?ids=${ids.join(',')}`);
    if (C !== mine) return;
    Object.assign(mine.caps, r.captions);
    if (r.pending.length && tries < 5) setTimeout(() => { if (C === mine) loadCaps(tries + 1); }, 4000);
  } catch { /* bỏ qua: bấm link vẫn mở bình thường */ }
}

window.addEventListener('goto-msg', (e) => { if (C) actions['goto-msg']({ dataset: { id: e.detail } }); });

// ---- bài chờ duyệt ở Đẩy trend ---------------------------------------------------------------------------------------------------
async function loadSubs() {
  const mine = C, el = $('#subs');
  if (!el || mine?.group?.type !== 'trend') return;
  try {
    const r = await api('GET', '/trend/submissions');
    if (C !== mine || !$('#subs')) return;
    const item = (x, review) => `<div class="card col" style="gap:4px;padding:10px 12px" data-sid="${x.id}">
      <div class="tiny muted">${review ? `<b>${esc(x.author.displayName)}</b> · ` : ''}${x.status === 'rejected' ? `<span style="color:var(--danger,#B42318)">${tr('ch.notApproved')}${x.note ? `: ${esc(x.note)}` : ''}</span>` : tr('ch.waitingReview')}</div>
      <div class="small" style="white-space:pre-wrap;word-break:break-word">${esc(x.body.slice(0, 300))}</div>
      ${x.imageUrls.length ? `<div class="tiny muted">${tr('ch.withPhotos', { n: x.imageUrls.length })}</div>` : ''}
      <div class="row" style="gap:8px;justify-content:flex-end">${review
        ? `<button class="btn sm" data-act="sub-reject" data-id="${x.id}">${tr('ch.reject')}</button><button class="btn primary sm" data-act="sub-approve" data-id="${x.id}">${tr('ch.approve')}</button>`
        : x.status === 'pending' ? `<button class="btn sm" data-act="sub-cancel" data-id="${x.id}">${tr('ch.withdraw')}</button>` : ''}</div></div>`;
    const parts = [];
    if (r.review.length) parts.push(`<details class="card col" style="padding:8px 12px" open><summary><b>${tr('ch.pendingPosts')} (${r.review.length})</b></summary><div class="col" style="gap:8px;margin-top:8px;max-height:40vh;overflow-y:auto">${r.review.map((x) => item(x, true)).join('')}</div></details>`);
    if (r.mine.length) parts.push(`<details class="card col" style="padding:8px 12px" open><summary><b>${tr('ch.myPending')} (${r.mine.length})</b></summary><div class="col" style="gap:8px;margin-top:8px">${r.mine.map((x) => item(x, false)).join('')}</div></details>`);
    el.innerHTML = parts.length ? `<div class="col" style="gap:8px;padding:8px 12px">${parts.join('')}</div>` : '';
  } catch { /* bỏ qua */ }
}
window.addEventListener('trend-sub', () => { if (C?.group?.type === 'trend') loadSubs(); });
actions['sub-approve'] = async (el) => { el.disabled = true; try { await api('POST', `/trend/submissions/${el.dataset.id}/approve`); toast(tr('ch.approvedToast')); } catch (e) { fail(e); } loadSubs(); };
actions['sub-reject'] = async (el) => {
  const reason = prompt(tr('ch.rejectReason'));
  if (reason === null) return;
  el.disabled = true; try { await api('POST', `/trend/submissions/${el.dataset.id}/reject`, { reason }); toast(tr('ch.rejected')); } catch (e) { fail(e); } loadSubs();
};
actions['sub-cancel'] = async (el) => { try { await api('DELETE', `/trend/submissions/${el.dataset.id}`); toast(tr('ch.withdrawn')); } catch (e) { fail(e); } loadSubs(); };

// Admin đổi chủ đề caption (hoặc công cụ caption đổi hashtag): bỏ caption đã tải, tải lại theo chủ đề mới
window.addEventListener('trend-caps', () => { if (C?.group?.type === 'trend') { C.caps = {}; loadCaps(); } });

// Bấm vào link X trong Đẩy trend: server cộng 1 xu tím (mỗi link một lần), link vẫn mở bình thường
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('.msg a.ext-link, .msg a.lp');
  if (!a || !C?.group || C.group.type !== 'trend') return;
  let host = '';
  try { host = new URL(a.href).hostname.toLowerCase(); } catch { return; }
  if (!/^(www\.|mobile\.)?(x|twitter)\.com$/.test(host)) return;
  const mid = Number(a.closest('.msg')?.dataset.mid);
  if (!mid) return;
  const orig = a.href;
  // đã có caption cho bài này: copy caption + keyword + hashtag và mở thẳng ô trả lời của bài đó trên X (đổi địa chỉ ngay trước khi trình duyệt chuyển trang)
  const cap = C.caps?.[mid], st = X_STATUS.exec(orig);
  const captioned = !!(cap && st && capOn() && !e.metaKey && !e.ctrlKey && !e.shiftKey);
  if (captioned) {
    const used = capUses(mid), text = cap.texts[(cap.start + used) % cap.texts.length]; // mỗi lần bấm một caption khác trong bộ
    bumpUses(mid);
    if (used + 3 >= cap.texts.length) { // sắp hết vòng: nhờ máy chủ tạo thêm, lần sau tải lại bộ mới
      const keep = C;
      api('POST', '/trend/captions/more', { messageId: mid }).then(() => setTimeout(() => { if (C === keep) { delete C.caps[mid]; loadCaps(); } }, 9000)).catch(() => {});
    }
    copyText(text);
    a.href = `https://x.com/intent/post?in_reply_to=${st[1]}&text=${encodeURIComponent(text)}`;
    setTimeout(() => { a.href = orig; }, 1000);
  }
  if (captioned) toast(tr('ch.capCopied'));
  api('POST', '/trend/click', { messageId: mid, url: orig, captioned }).then((r) => { if (r.coins) toast(`+${r.coins} ${tr('coin').toLowerCase()}`); }).catch(() => {});
});
