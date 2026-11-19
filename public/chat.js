import { $, $$, esc, S, api, go, icon, avatar, groupAvatar, fmtTime, fmtDate, fmtDateTime, dayKey, toast, fail, openModal, closeModal, ask, confirmBox, lightbox, refreshGroups, actions, mutedNow } from './core.js';

const PUBLIC = ['country', 'region', 'province'];
const EMOJI = ['😀','😂','🥹','😍','🥰','😭','😘','🤣','👍','🙏','👏','🔥','💜','💚','💙','💖','✨','🎉','😎','🤗','😅','🥺','😢','😡','🤔','🙌','💪','🌸','⭐','🎬','📺','🍿'];
const RULES = [
  'Ở các group chung chỉ nói về LingOrm và JKR.',
  'Tôn trọng mọi thành viên, không công kích hay phân biệt đối xử.',
  'Không spam, quảng cáo hay đăng liên kết lạ.',
  'Không đăng nội dung nhạy cảm hoặc vi phạm pháp luật.',
  'Gặp vi phạm hãy dùng nút Báo cáo thay vì tranh cãi.',
];

let C = null; // trạng thái cuộc trò chuyện đang mở
export const activeChat = () => C;

const isPublic = (g) => PUBLIC.includes(g.type);
export const canModerate = (g) =>
  g.type === 'private' ? g.role === 'admin' : isPublic(g) && (g.role === 'mod' || S.me.role === 'admin');

// ===========================================================================
export async function renderChat(view, gid) {
  C = null;
  view.innerHTML = '<div class="gate muted">Đang tải…</div>';
  let group;
  try {
    group = (await api('GET', `/groups/${gid}`)).group;
  } catch (e) {
    view.innerHTML = `<div class="gate"><p>${esc(e.message)}</p><a class="btn" href="#/chat">Quay lại</a></div>`;
    return;
  }
  if (group.role === undefined) {
    // Group công khai chưa tham gia: xem thông tin và tham gia ngay
    view.innerHTML = `<div class="gate">${groupAvatar(group)}<h1>${esc(group.name)}</h1>
      <p class="muted">Nhóm công khai · ${group.memberCount} thành viên · vào tự do, không cần duyệt</p>
      <button class="btn primary" data-act="join" data-id="${group.id}">Tham gia nhóm</button>
      <a class="btn" href="#/discover">Quay lại khám phá</a></div>`;
    return;
  }
  C = { gid: group.id, group, seen: new Set(), first: null, last: null, hasMore: false, replyTo: null, image: null, emoji: false };
  const { messages, hasMore } = await api('GET', `/groups/${gid}/messages?limit=40`);
  C.hasMore = hasMore;
  drawChat(view);
  for (const m of messages) appendMsg(m, true);
  scrollBottom(true);
  markRead();
  if (isPublic(group) && !group.rulesAck) showRules();
}

function subtitle(g) {
  if (isPublic(g)) return `Nhóm công khai · vào tự do, không cần duyệt · ${g.memberCount} thành viên`;
  if (g.type === 'private') return `Nhóm riêng · ${g.memberCount}/${g.memberLimit} thành viên`;
  const p = g.peer;
  return `Tin nhắn riêng${p?.online ? ' · <span class="dot"></span> đang online' : ''}${p?.location?.province ? ' · ' + esc(p.location.province) : ''}`;
}

function drawChat(view) {
  const g = C.group;
  view.innerHTML = `
  <div class="chat-head">
    <a class="icon-btn back" href="#/chat" aria-label="Quay lại danh sách">${icon('back', 22)}</a>
    ${g.type === 'dm' ? avatar(g.peer) : groupAvatar(g)}
    <div class="grow"><h1>${esc(g.name)}</h1><div class="small muted sub">${subtitle(g)}</div></div>
    <button class="icon-btn info-btn" data-act="info" aria-label="Thông tin nhóm">${icon('info', 20)}</button>
    ${g.type !== 'dm' ? `<button class="icon-btn" data-act="mute-dialog" aria-label="Thông báo" title="${g.muted ? 'Đang tắt thông báo' : 'Tắt thông báo'}">${icon('bell', 20)}${g.muted ? '<span class="sr-only">đang tắt</span>' : ''}</button>
    <button class="btn sm leave-btn" data-act="leave" data-id="${g.id}">Rời nhóm</button>` : ''}
  </div>
  <div class="chat-body">
    <div class="chat-col">
      <div class="msgs" id="msgs" aria-live="off"><div id="more" ${C.hasMore ? '' : 'hidden'} style="text-align:center"><button class="btn sm" data-act="load-more">Tải tin cũ hơn</button></div></div>
      <div class="rt-wrap"><button class="read-toggle" id="readtoggle" data-act="toggle-read" aria-pressed="false" aria-label="Ẩn hoặc hiện thanh tiêu đề, ô nhập và menu"></button></div>
      <div class="composer" id="composer">${composerHtml()}</div>
    </div>
    <aside class="info wide" aria-label="Thông tin nhóm">${infoHtml()}</aside>
  </div>`;
  wireComposer();
  syncReadMode();
}

function composerHtml() {
  const g = C.group;
  if (isPublic(g) && !g.rulesAck)
    return `<div class="notice row between wrap"><span>Hãy xác nhận đã đọc quy tắc cộng đồng để bắt đầu chat.</span><button class="btn primary sm" data-act="rules">Xem quy tắc</button></div>`;
  if (g.modMutedUntil && g.modMutedUntil > Date.now())
    return `<div class="notice">Bạn đang bị tắt tiếng trong nhóm này đến ${fmtTime(g.modMutedUntil)} ${fmtDate(g.modMutedUntil)}.</div>`;
  return `
    ${C.replyTo ? `<div class="replybar"><span class="grow small">Trả lời <b>${esc(C.replyTo.name)}</b>: ${esc(C.replyTo.text)}</span><button class="link-btn" data-act="cancel-reply" aria-label="Hủy trả lời">${icon('x', 14)}</button></div>` : ''}
    ${C.image ? `<div class="preview"><img src="${esc(C.image)}" alt="Ảnh sẽ gửi"><button data-act="remove-image" aria-label="Bỏ ảnh">${icon('x', 14)}</button></div>` : ''}
    ${C.emoji ? `<div class="emoji-panel">${EMOJI.map((e) => `<button type="button" data-act="emoji" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div>` : ''}
    <form id="msgform" autocomplete="off">
      <input type="file" id="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
      <button type="button" class="icon-btn" data-act="pick-image" aria-label="Gửi ảnh">${icon('image', 22)}</button>
      <button type="button" class="icon-btn" data-act="emoji-toggle" aria-label="Chọn emoji" aria-expanded="${C.emoji}">${icon('smile', 22)}</button>
      <label for="msg" class="sr-only">Tin nhắn</label>
      <input class="input" id="msg" type="text" maxlength="2000" placeholder="Nhắn vào ${esc(g.name)}">
      <button class="btn primary" style="width:48px;padding:0" aria-label="Gửi">${icon('send', 20)}</button>
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
    if (!body && !C.image) return;
    input.disabled = true;
    try {
      const { message } = await api('POST', `/groups/${C.gid}/messages`, { body, imageUrl: C.image, replyTo: C.replyTo?.id });
      C.replyTo = null; C.image = null; C.emoji = false;
      appendMsg(message);
      scrollBottom(true);
      redrawComposer();
      $('#msg').value = '';
    } catch (err) {
      input.disabled = false;
      fail(err);
    }
  };
  $('#file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return toast('Ảnh quá lớn (tối đa 2MB)');
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
    try {
      C.image = (await api('POST', '/upload', { dataUrl })).url;
      redrawComposer();
    } catch (err) { fail(err); }
  };
}

// ---- hiển thị tin nhắn ---------------------------------------------------------
const mine = (m) => m.user.id === S.me.id;
const canDelete = (m) => !m.deleted && (mine(m) || canModerate(C.group));

const safeHref = (u) => (/^https?:\/\//i.test(u) ? u : '#');
export function previewHtml(p) {
  if (!p) return '';
  return `<a class="lp" href="${esc(safeHref(p.url))}" target="_blank" rel="noopener noreferrer nofollow">
    <span class="lp-t"><b>${esc(p.title)}</b>${p.description ? `<span class="lp-d">${esc(p.description)}</span>` : ''}</span>
    ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ''}
    <span class="lp-s">${esc(p.site)}${p.time ? ` · ${fmtDateTime(p.time)}` : ''}</span></a>`;
}

function msgHtml(m) {
  const own = mine(m);
  const quote = m.reply ? `<button type="button" class="quote" data-act="goto-msg" data-id="${m.reply.id}" aria-label="Đi tới tin nhắn được trả lời">↪ ${esc(m.reply.displayName)}: ${m.reply.deleted ? 'Tin nhắn đã bị xóa' : m.reply.body ? esc(m.reply.body) : m.reply.hasImage ? '[Ảnh]' : ''}</button>` : '';
  const text = m.deleted
    ? `<div class="text gone">Tin nhắn đã bị xóa</div>`
    : `${m.body ? (own ? `<div class="bubble">${esc(m.body)}</div>` : `<div class="text">${esc(m.body)}</div>`) : ''}${m.imageUrl ? `<img class="pic" data-act="zoom" data-src="${esc(m.imageUrl)}" src="${esc(m.imageUrl)}" alt="Ảnh trong tin nhắn" loading="lazy">` : ''}`;
  const role = m.modRole ? `<span class="pill">${m.modRole === 'mod' ? 'Mod' : 'Admin'}</span>` : '';
  const heartBtn = m.deleted ? '' : `<button type="button" class="heart ${m.hearted ? 'on' : ''}" data-act="heart" data-id="${m.id}" ${own ? 'disabled' : ''} aria-pressed="${m.hearted}" aria-label="Thả tim, hiện có ${m.hearts} tim">${icon('heart', 15, m.hearted ? 'fill="currentColor"' : '')}<span class="hc">${m.hearts || ''}</span></button>`;
  const acts = m.deleted ? '' : `<div class="actions">
      <button class="link-btn" data-act="reply" data-id="${m.id}">Trả lời</button>
      ${!own ? `<button class="link-btn" data-act="report-msg" data-id="${m.id}">Báo cáo</button>` : ''}
      ${canDelete(m) ? `<button class="link-btn" data-act="del-msg" data-id="${m.id}">Xóa</button>` : ''}</div>`;
  const who = m.user.deleted
    ? `<span class="who muted">${esc(m.user.displayName)}</span>`
    : `<button class="who" data-act="profile" data-id="${m.user.id}">${esc(m.user.displayName)}</button>`;
  return `<div class="msg ${own ? 'own' : ''}" data-mid="${m.id}" data-uid="${m.user.id}" data-name="${esc(m.user.displayName)}">
    ${own ? '' : m.user.deleted ? avatar(m.user) : `<button class="av-btn" style="background:none;border:0;padding:0" data-act="profile" data-id="${m.user.id}" aria-label="Xem hồ sơ ${esc(m.user.displayName)}">${avatar(m.user)}</button>`}
    <div class="body">
      <div class="meta">${own ? '' : who}${own ? '' : role}<span class="tiny muted">${fmtTime(m.createdAt)}</span></div>
      ${quote}${text}${m.deleted ? '' : previewHtml(m.preview)}<div class="row" style="gap:4px;margin-top:2px">${heartBtn}${acts}</div>
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
  box.insertAdjacentHTML('beforeend', html + msgHtml(m));
  C.last = m.id;
  if (!C.first) C.first = m.id;
  if (stick && !initial) scrollBottom();
}

const scrollBottom = () => { const b = $('#msgs'); if (b) b.scrollTop = b.scrollHeight; };

async function markRead() {
  if (!C || document.hidden) return;
  try { await api('POST', `/groups/${C.gid}/read`); } catch {}
  const g = S.groups.find((x) => x.id === C.gid);
  if (g && g.unread) { g.unread = 0; S.hooks.renderSide?.(); }
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
  } else if (ev.type === 'heart' && C && C.gid === ev.groupId) {
    setHeart($(`.msg[data-mid="${ev.messageId}"] .heart`), ev.hearts);
  } else if (ev.type === 'message_preview' && C && C.gid === ev.groupId) {
    const el = $(`.msg[data-mid="${ev.messageId}"] .body`);
    if (el && !$('.lp', el)) {
      const box = $('.actions', el)?.parentElement;
      if (box) box.insertAdjacentHTML('beforebegin', previewHtml(ev.preview));
    }
  } else if (ev.type === 'message_deleted' && C && C.gid === ev.groupId) {
    const el = $(`.msg[data-mid="${ev.messageId}"]`);
    if (el) {
      $('.body', el).innerHTML = `<div class="meta"><span class="tiny muted">Đã xóa</span></div><div class="text gone">Tin nhắn đã bị xóa</div>`;
    }
  }
}

// ---- quy tắc, thông báo, rời nhóm ----------------------------------------------
function showRules() {
  openModal(`<h2>Quy tắc cộng đồng</h2><p class="muted small">Vui lòng đọc và xác nhận trước khi chat trong "${esc(C.group.name)}".</p>
    <ol class="col small" style="padding-left:20px;margin:0">${RULES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
    <div class="btns"><button class="btn" data-close>Để sau</button><button class="btn primary" id="ack">Tôi đã đọc và đồng ý</button></div>`);
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
  const msg = g?.type === 'private' ? 'Rời xong bạn không xem được tin nhắn mới và phải được mời lại để quay lại.' : 'Bạn có thể tham gia lại bất cứ lúc nào.';
  if (!(await confirmBox(`Rời "${g?.name || 'nhóm'}"?`, msg, 'Rời nhóm', true))) return;
  try {
    await api('POST', `/groups/${el.dataset.id}/leave`);
    await refreshGroups();
    go('#/chat');
  } catch (e) { fail(e); }
};
actions['mute-dialog'] = async () => {
  const v = await ask({
    title: 'Thông báo của nhóm',
    fields: [{ name: 'duration', label: 'Tắt thông báo', type: 'select', value: C.group.muted ? 'off' : '1h', options: [
      { value: '1h', label: 'Trong 1 giờ' }, { value: '8h', label: 'Trong 8 giờ' }, { value: 'forever', label: 'Vô thời hạn' }, { value: 'off', label: 'Bật lại thông báo' }] }],
  });
  if (!v) return;
  try {
    const r = await api('POST', `/groups/${C.gid}/mute`, v);
    C.group.muted = r.muted; C.group.mutedUntil = r.mutedUntil;
    const g = S.groups.find((x) => x.id === C.gid);
    if (g) { g.muted = r.muted; g.mutedUntil = r.mutedUntil; }
    toast(r.muted ? 'Đã tắt thông báo nhóm' : 'Đã bật lại thông báo');
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
  btn.setAttribute('aria-label', `Thả tim, hiện có ${hearts} tim`);
}
actions.heart = async (el) => {
  const r = await api('POST', `/messages/${el.dataset.id}/heart`);
  setHeart(el, r.hearts, r.hearted);
};
actions.reply = (el) => {
  const msg = el.closest('.msg');
  C.replyTo = { id: Number(msg.dataset.mid), name: msg.dataset.name, text: ($('.text, .bubble', msg)?.textContent || '[Ảnh]').slice(0, 60) };
  redrawComposer();
};
actions['cancel-reply'] = () => { C.replyTo = null; redrawComposer(); };
actions['pick-image'] = () => $('#file').click();
actions['remove-image'] = () => { C.image = null; redrawComposer(); };
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
  if (!t) return toast('Không tìm thấy tin nhắn gốc');
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
  if (own) { if (!(await confirmBox('Xóa tin nhắn?', 'Tin nhắn sẽ biến mất với mọi người.', 'Xóa', true))) return; }
  else {
    const v = await ask({ title: 'Xóa tin nhắn vi phạm', fields: [{ name: 'reason', label: 'Lý do (gửi cho người bị xử lý)', type: 'textarea', required: true, max: 300 }], ok: 'Xóa', danger: true });
    if (!v) return;
    reason = v.reason;
  }
  try { await api('DELETE', `/messages/${msg.dataset.mid}`, { reason }); } catch (e) { fail(e); }
};

export const REPORT_REASONS = ['Spam hoặc quảng cáo', 'Quấy rối, công kích', 'Bàn tán chuyện đời tư của hai bạn diễn', 'Nội dung không phù hợp', 'Mạo danh', 'Khác'];
export async function reportDialog({ messageId, userId, groupId }) {
  const v = await ask({
    title: messageId ? 'Báo cáo tin nhắn' : 'Báo cáo người dùng',
    text: 'Người bị báo cáo sẽ không biết ai đã báo cáo.',
    fields: [
      { name: 'cat', label: 'Lý do', type: 'select', options: REPORT_REASONS.map((r) => ({ value: r, label: r })) },
      { name: 'detail', label: 'Mô tả thêm (không bắt buộc)', type: 'textarea', max: 400 },
    ],
    ok: 'Gửi báo cáo',
  });
  if (!v) return;
  try {
    await api('POST', '/reports', { messageId, userId, groupId, reason: v.detail ? `${v.cat}: ${v.detail}` : v.cat });
    toast('Đã gửi báo cáo. Cảm ơn bạn!');
  } catch (e) { fail(e); }
}
actions['report-msg'] = (el) => reportDialog({ messageId: Number(el.closest('.msg').dataset.mid), groupId: C?.gid });

// ---- hồ sơ người dùng -----------------------------------------------------------
export async function openProfile(uid, gid = C?.gid) {
  if (uid === S.me.id) return go('#/settings');
  let r;
  try { r = await api('GET', `/users/${uid}`); } catch (e) { return fail(e); }
  const u = r.user;
  const loc = [u.location?.province, u.location?.region, u.location?.country].filter(Boolean).slice(0, 2).join(' · ');
  const g = gid ? S.groups.find((x) => x.id === gid) : null;
  const rel = { none: `<button class="btn primary" data-act="friend-add" data-id="${u.id}">Kết bạn</button>`,
    sent: `<button class="btn" disabled>Đã gửi lời mời</button>`,
    received: `<button class="btn primary" data-act="fr-accept" data-id="${r.requestId}">Chấp nhận lời mời</button>`,
    friend: `<button class="btn primary" data-act="dm" data-id="${u.id}">Nhắn tin</button>` }[r.relation] || '';
  const staff = g && canModerate(g) && r.relation !== 'self';
  openModal(`<div class="row">${avatar(u, 'lg')}<div class="grow"><h2>${esc(u.displayName)} ${u.isAdmin ? '<span class="pill">Admin</span>' : ''}</h2><div class="muted small">${esc(loc)}</div>
      ${u.online ? '<div class="small"><span class="dot"></span> Đang online</div>' : ''}</div></div>
    <div class="row wrap">${rel}</div>
    <div class="row wrap">
      ${r.relation === 'friend' ? `<button class="btn sm" data-act="unfriend" data-id="${u.id}">Hủy kết bạn</button>` : ''}
      <button class="btn sm" data-act="block" data-id="${u.id}">Chặn</button>
      <button class="btn sm" data-act="report-user" data-id="${u.id}" data-gid="${gid || ''}">Báo cáo</button>
    </div>
    ${staff ? `<div><div class="h2">Quản lý nhóm</div><div class="row wrap"><button class="btn sm" data-act="mod-mute" data-id="${u.id}" data-gid="${g.id}">Tắt tiếng</button><button class="btn sm danger" data-act="mod-kick" data-id="${u.id}" data-gid="${g.id}">${g.type === 'private' ? 'Xóa khỏi nhóm' : 'Mời ra khỏi nhóm'}</button></div></div>` : ''}
    <div class="btns"><button class="btn" data-close>Đóng</button></div>`);
  $('#modal [data-close]').onclick = closeModal;
}
actions.profile = (el) => openProfile(Number(el.dataset.id));
actions['report-user'] = (el) => { closeModal(); reportDialog({ userId: Number(el.dataset.id), groupId: Number(el.dataset.gid) || undefined }); };
actions['mod-mute'] = async (el) => {
  const v = await ask({ title: 'Tắt tiếng thành viên', fields: [
    { name: 'minutes', label: 'Số phút', type: 'number', value: 60, min: 1, max: 43200, required: true },
    { name: 'reason', label: 'Lý do', type: 'textarea', required: true, max: 300 }], ok: 'Tắt tiếng' });
  if (!v) return;
  try { await api('POST', `/groups/${el.dataset.gid}/members/${el.dataset.id}/mute`, { minutes: Number(v.minutes), reason: v.reason }); toast('Đã tắt tiếng thành viên'); } catch (e) { fail(e); }
};
actions['mod-kick'] = async (el) => {
  const v = await ask({ title: 'Xóa thành viên khỏi nhóm', fields: [{ name: 'reason', label: 'Lý do', type: 'textarea', required: true, max: 300 }], ok: 'Xóa', danger: true });
  if (!v) return;
  try {
    await api('POST', `/groups/${el.dataset.gid}/members/${el.dataset.id}/kick`, { reason: v.reason });
    toast('Đã xóa thành viên');
    if (C) { C.group = (await api('GET', `/groups/${C.gid}`)).group; $('.info')?.replaceChildren(); $('.info') && ($('.info').innerHTML = infoHtml()); }
  } catch (e) { fail(e); }
};

// ---- panel thông tin nhóm ------------------------------------------------------
const ABOUT = {
  country: 'Nhóm chat cả nước, tự động có khi bạn đăng ký. Ai cũng có thể tham gia.',
  region: 'Nhóm chat theo khu vực, tự động có theo tỉnh/thành bạn chọn. Ai cũng có thể tham gia.',
  province: 'Nhóm chat theo tỉnh/thành, tự động có khi bạn chọn nơi ở. Ai cũng có thể tham gia.',
  private: 'Nhóm riêng tư, không xuất hiện trong tìm kiếm hay gợi ý.',
  dm: 'Cuộc trò chuyện riêng giữa hai người bạn bè.',
};
function infoHtml() {
  const g = C.group;
  let h = `<section><div class="h2">Về nhóm</div><p class="small">${esc(ABOUT[g.type])}</p></section>`;
  if (isPublic(g)) {
    h += `<section><div class="h2">Quản trị viên</div>${g.mods.length ? g.mods.map((u) => `<div class="row" style="min-height:44px">${avatar(u)}<span>${esc(u.displayName)} <span class="muted">· Mod</span></span></div>`).join('') : '<p class="small muted">Chưa có mod.</p>'}
      <p class="small muted" style="margin-top:4px">Mod là tùy chọn, do admin hệ thống chỉ định.</p></section>`;
  }
  if (g.type === 'private') {
    const admin = g.role === 'admin';
    h += `<section><div class="h2">Thành viên (${g.members.length}/${g.memberLimit})</div><div class="list">${g.members.map((u) => `
      <div class="row" style="min-height:44px">${avatar(u)}<button class="who grow" style="background:none;border:0;text-align:left;font-weight:600;padding:0" data-act="profile" data-id="${u.id}">${esc(u.displayName)}${u.role === 'admin' ? ' <span class="pill">Admin</span>' : ''}${u.id === S.me.id ? ' <span class="muted">(bạn)</span>' : ''}</button>
        ${admin && u.id !== S.me.id ? `<button class="link-btn" data-act="pg-admin" data-id="${u.id}" data-role="${u.role}">${u.role === 'admin' ? 'Gỡ admin' : 'Làm admin'}</button><button class="link-btn" data-act="mod-kick" data-id="${u.id}" data-gid="${g.id}">Xóa</button>` : ''}</div>`).join('')}</div></section>`;
    if (admin) h += `<section class="col"><div class="h2">Quản lý nhóm</div>
      <button class="btn sm" data-act="pg-invite">Mời bạn bè</button>
      <button class="btn sm" data-act="pg-links">Liên kết mời</button>
      <button class="btn sm" data-act="pg-edit">Đổi tên / giới hạn</button>
      <button class="btn sm danger" data-act="pg-dissolve">Giải tán nhóm</button></section>`;
  }
  if (g.type !== 'dm') h += `<section><button class="btn danger block" data-act="leave" data-id="${g.id}">Rời nhóm</button></section>`;
  if (g.type !== 'dm') h += `<section><div class="h2">Gặp vấn đề?</div><button class="btn block" data-act="report-help">Báo cáo người dùng cho ${g.type === 'private' ? 'admin nhóm' : 'admin/mod'}</button></section>`;
  else h += `<section><div class="h2">Gặp vấn đề?</div><button class="btn block" data-act="report-user" data-id="${g.peer.id}" data-gid="${g.id}">Báo cáo người này</button></section>`;
  return h;
}
actions.info = () => openModal(`${infoHtml()}<div class="btns"><button class="btn" data-close>Đóng</button></div>`) && ($('#modal [data-close]').onclick = closeModal);
actions['report-help'] = () => openModal(`<h2>Báo cáo vi phạm</h2><p class="small">Bấm vào <b>tên người dùng</b> để xem hồ sơ rồi chọn <b>Báo cáo</b>, hoặc bấm <b>Báo cáo</b> dưới từng tin nhắn. Người bị báo cáo sẽ không biết ai đã báo cáo.</p><div class="btns"><button class="btn primary" data-close>Đã hiểu</button></div>`) && ($('#modal [data-close]').onclick = closeModal);

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
  const v = await ask({ title: 'Cài đặt nhóm', fields: [
    { name: 'name', label: 'Tên nhóm', value: C.group.name, required: true, max: 50 },
    { name: 'memberLimit', label: 'Giới hạn thành viên (tối đa 200)', type: 'number', value: C.group.memberLimit, min: 2, max: 200, required: true }], ok: 'Lưu' });
  if (!v) return;
  try { await api('PATCH', `/private/${C.gid}`, { name: v.name, memberLimit: Number(v.memberLimit) }); await reloadGroup(); location.reload(); } catch (e) { fail(e); }
};
actions['pg-dissolve'] = async () => {
  if (!(await confirmBox('Giải tán nhóm?', 'Toàn bộ tin nhắn sẽ bị xóa và không thể khôi phục.', 'Giải tán', true))) return;
  try { await api('DELETE', `/private/${C.gid}`); await refreshGroups(); go('#/chat'); } catch (e) { fail(e); }
};
actions['pg-invite'] = async () => {
  const { friends } = await api('GET', '/friends');
  const ids = new Set(C.group.members.map((m) => m.id));
  const cands = friends.filter((f) => !ids.has(f.id));
  if (!cands.length) return toast('Không còn bạn bè nào để mời');
  openModal(`<form id="invf" class="col"><h2>Mời bạn bè</h2><p class="small muted">Chỉ mời được người là bạn bè.</p>
    ${cands.map((f) => `<label class="check"><input type="checkbox" value="${f.id}"> ${esc(f.displayName)}</label>`).join('')}
    <div class="btns"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Mời</button></div></form>`);
  $('#modal [data-close]').onclick = closeModal;
  $('#invf').onsubmit = async (e) => {
    e.preventDefault();
    const userIds = $$('#invf input:checked').map((i) => Number(i.value));
    if (!userIds.length) return;
    try { await api('POST', `/private/${C.gid}/invite`, { userIds }); closeModal(); toast('Đã thêm thành viên'); await reloadGroup(); } catch (er) { fail(er); }
  };
};
actions['pg-links'] = async () => {
  const draw = async () => {
    const { links } = await api('GET', `/private/${C.gid}/links`);
    const m = openModal(`<h2>Liên kết mời</h2><p class="small muted">Người vào bằng liên kết phải chờ admin duyệt. Liên kết hết hạn sau thời gian đặt và có thể thu hồi bất cứ lúc nào.</p>
      <div class="list">${links.map((l) => { const url = `${location.origin}/#/join/${l.code}`; return `<div class="card col"><input class="input" readonly value="${esc(url)}" aria-label="Liên kết mời"><div class="row between"><span class="tiny muted">Hết hạn ${fmtTime(l.expires_at)} ${fmtDate(l.expires_at)}</span><span><button class="btn sm" data-copy="${esc(url)}">Sao chép</button> <button class="btn sm danger" data-revoke="${l.code}">Thu hồi</button></span></div></div>`; }).join('') || '<p class="small muted">Chưa có liên kết nào.</p>'}</div>
      <form id="lf" class="row"><label class="sr-only" for="hrs">Số giờ hiệu lực</label><select class="input" id="hrs"><option value="1">1 giờ</option><option value="24" selected>24 giờ</option><option value="168">7 ngày</option><option value="720">30 ngày</option></select><button class="btn primary">Tạo liên kết</button></form>
      <div class="btns"><button class="btn" data-close>Đóng</button></div>`);
    $('[data-close]', m).onclick = closeModal;
    $('#lf', m).onsubmit = async (e) => { e.preventDefault(); try { await api('POST', `/private/${C.gid}/links`, { hours: Number($('#hrs').value) }); draw(); } catch (er) { fail(er); } };
    $$('[data-copy]', m).forEach((b) => (b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('Đã sao chép liên kết'))));
    $$('[data-revoke]', m).forEach((b) => (b.onclick = async () => { await api('DELETE', `/private/links/${b.dataset.revoke}`).catch(fail); draw(); }));
  };
  draw().catch(fail);
};

// Chế độ đọc: ẩn/hiện tiêu đề nhóm, ô nhập tin và menu để có thêm chỗ đọc
function applyRead(on) {
  document.querySelector('.app')?.classList.toggle('read-mode', on);
  const b = document.getElementById('readtoggle');
  if (b) {
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'Hiện khung chat và menu' : 'Ẩn khung chat và menu';
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
