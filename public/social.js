import { $, $$, esc, S, api, go, icon, avatar, groupAvatar, toast, fail, openModal, closeModal, confirmBox, refreshGroups, refreshCounters, actions, memberPickerHtml, wireMemberPicker, pickedIds } from './core.js';

export async function renderFriends(view) {
  view.innerHTML = '<div class="page"><div class="page-inner muted">Đang tải…</div></div>';
  const [f, jr] = await Promise.all([api('GET', '/friends'), api('GET', '/private/requests')]);
  const priv = S.groups.filter((g) => g.type === 'private');
  const person = (u, right) => `<div class="card">${avatar(u, '')}<button class="grow" style="background:none;border:0;text-align:left;font-weight:600;font-size:15px;padding:0" data-act="profile" data-id="${u.id}">${esc(u.displayName)}${u.online ? ' <span class="dot" title="Đang online"></span>' : ''}</button>${right}</div>`;
  view.innerHTML = `<div class="page"><div class="page-inner">
    <div class="row between"><h1>Bạn bè</h1><button class="btn primary" data-act="add-friend-hint">Thêm bạn</button></div>
    ${f.incoming.length || f.outgoing.length ? `<section><div class="h2">Lời mời kết bạn</div><div class="list">
      ${f.incoming.map((r) => person(r.user, `<button class="btn primary sm" data-act="fr-accept" data-id="${r.id}">Chấp nhận</button><button class="btn sm" data-act="fr-decline" data-id="${r.id}">Từ chối</button>`)).join('')}
      ${f.outgoing.map((r) => person(r.user, `<span class="small muted">Đang chờ</span><button class="btn sm" data-act="fr-cancel" data-id="${r.id}">Hủy</button>`)).join('')}</div></section>` : ''}
    <section><div class="h2">Danh sách bạn</div><div class="list">
      ${f.friends.map((u) => person(u, `<button class="btn" data-act="dm" data-id="${u.id}">Nhắn tin</button>`)).join('') || '<p class="muted small">Chưa có bạn bè. Bấm vào tên một người trong nhóm chat để gửi lời mời kết bạn.</p>'}</div></section>
    <section><div class="row between"><div class="h2" style="margin:0">Nhóm riêng</div><button class="link-btn" style="font-size:14px;font-weight:600;color:var(--accent)" data-act="create-private">Tạo nhóm</button></div>
      <div class="list" style="margin-top:8px">${priv.map((g) => `<a class="card" href="#/chat/${g.id}">${groupAvatar(g)}<span class="grow" style="font-weight:600">${esc(g.name)}</span>${g.unread ? `<span class="badge">${g.unread}</span>` : ''}</a>`).join('') || '<p class="muted small">Bạn chưa có nhóm riêng nào.</p>'}</div></section>
    ${jr.requests.length ? `<section><div class="h2">Yêu cầu vào nhóm riêng</div><div class="list">${jr.requests.map((r) => `<div class="card col"><div class="small"><strong>${esc(r.user.displayName)}</strong> muốn vào <strong>${esc(r.groupName)}</strong></div><div class="row"><button class="btn primary grow" data-act="jr-approve" data-id="${r.id}">Duyệt</button><button class="btn grow" data-act="jr-reject" data-id="${r.id}">Từ chối</button></div></div>`).join('')}</div></section>` : ''}
    ${f.blocked.length ? `<section><div class="h2">Đã chặn</div><div class="list">${f.blocked.map((u) => `<div class="card"><span class="grow">${esc(u.displayName)}</span><button class="btn sm" data-act="unblock" data-id="${u.id}">Bỏ chặn</button></div>`).join('')}</div></section>` : ''}
  </div></div>`;
}

const reloadHere = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

actions['add-friend-hint'] = () => {
  openModal(`<h2>Thêm bạn</h2><p class="small">Mở một nhóm chat, bấm vào <b>tên hoặc ảnh</b> của người bạn muốn kết bạn rồi chọn <b>Kết bạn</b>. Họ cần chấp nhận lời mời thì hai bạn mới nhắn tin riêng được.</p><div class="btns"><button class="btn primary" data-close>Đã hiểu</button></div>`);
  $('#modal [data-close]').onclick = closeModal;
};
actions['friend-add'] = async (el) => {
  try { await api('POST', '/friends/request', { userId: Number(el.dataset.id) }); closeModal(); toast('Đã gửi lời mời kết bạn'); } catch (e) { fail(e); }
};
const answer = (verb, msg) => async (el) => {
  try { await api('POST', `/friends/requests/${el.dataset.id}/${verb}`); closeModal(); toast(msg); refreshCounters(); if (location.hash.startsWith('#/friends')) reloadHere(); } catch (e) { fail(e); }
};
actions['fr-accept'] = answer('accept', 'Đã trở thành bạn bè');
actions['fr-decline'] = answer('decline', 'Đã từ chối lời mời');
actions['fr-cancel'] = async (el) => { try { await api('DELETE', `/friends/requests/${el.dataset.id}`); reloadHere(); } catch (e) { fail(e); } };
actions.unfriend = async (el) => {
  if (!(await confirmBox('Hủy kết bạn?', 'Hai bạn sẽ không nhắn tin riêng được nữa.', 'Hủy kết bạn', true))) return;
  try { await api('DELETE', `/friends/${el.dataset.id}`); closeModal(); await refreshGroups(); if (location.hash.startsWith('#/friends')) reloadHere(); } catch (e) { fail(e); }
};
actions.block = async (el) => {
  if (!(await confirmBox('Chặn người này?', 'Họ sẽ không thấy hồ sơ của bạn, không nhắn tin hay gửi lời mời được. Họ không được thông báo.', 'Chặn', true))) return;
  try { await api('POST', `/blocks/${el.dataset.id}`); toast('Đã chặn'); await refreshGroups(); if (location.hash.startsWith('#/friends')) reloadHere(); } catch (e) { fail(e); }
};
actions.unblock = async (el) => { try { await api('DELETE', `/blocks/${el.dataset.id}`); await refreshGroups(); reloadHere(); } catch (e) { fail(e); } };
actions.dm = async (el) => {
  try {
    const { group } = await api('POST', `/dm/${el.dataset.id}`);
    closeModal();
    await refreshGroups();
    go(`#/chat/${group.id}`);
  } catch (e) { fail(e); }
};
const jr = (verb) => async (el) => { try { await api('POST', `/private/requests/${el.dataset.id}/${verb}`); await refreshGroups(); reloadHere(); } catch (e) { fail(e); } };
actions['jr-approve'] = jr('approve');
actions['jr-reject'] = jr('reject');

actions['create-private'] = async () => {
  const { friends } = await api('GET', '/friends');
  openModal(`<form id="pgf" class="col"><h2>Tạo nhóm riêng</h2>
    <div class="field"><label for="pgname">Tên nhóm</label><input class="input" id="pgname" required minlength="2" maxlength="50" placeholder="Ví dụ: Hội bạn thân"></div>
    <div><div class="label">Thêm thành viên (không bắt buộc)</div>${memberPickerHtml(friends)}</div>
    <p class="small muted">Bạn sẽ là admin của nhóm. Nhóm riêng không xuất hiện trong tìm kiếm hay gợi ý. Giới hạn mặc định 100 thành viên.</p>
    <div class="btns"><button type="button" class="btn" data-close>Hủy</button><button class="btn primary">Tạo nhóm</button></div></form>`);
  $('#modal [data-close]').onclick = closeModal;
  wireMemberPicker();
  $('#pgf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { group } = await api('POST', '/private', { name: $('#pgname').value, memberIds: pickedIds() });
      closeModal();
      await refreshGroups();
      go(`#/chat/${group.id}`);
    } catch (er) { fail(er); }
  };
};

// Vào nhóm riêng bằng liên kết mời -> chờ admin duyệt
export async function renderJoin(view, code) {
  view.innerHTML = '<div class="gate muted">Đang kiểm tra liên kết…</div>';
  try {
    const { group } = await api('GET', `/invite/${code}`);
    if (group.joined) return go(`#/chat/${group.id}`);
    view.innerHTML = `<div class="gate">${groupAvatar({ type: 'private', name: group.name })}<h1>${esc(group.name)}</h1><p class="muted">Nhóm riêng · ${group.memberCount} thành viên. Admin cần duyệt yêu cầu của bạn trước khi bạn vào được.</p>
      <button class="btn primary" id="joinreq">Xin vào nhóm</button><a class="btn" href="#/chat">Quay lại</a></div>`;
    $('#joinreq').onclick = async () => {
      try { await api('POST', `/invite/${code}/join`); view.innerHTML = `<div class="gate"><h1>Đã gửi yêu cầu</h1><p class="muted">Bạn sẽ được thông báo khi admin duyệt.</p><a class="btn" href="#/chat">Về trang chính</a></div>`; } catch (e) { fail(e); }
    };
  } catch (e) {
    view.innerHTML = `<div class="gate"><h1>Liên kết không dùng được</h1><p class="muted">${esc(e.message)}</p><a class="btn" href="#/chat">Về trang chính</a></div>`;
  }
}
