import { $, $$, esc, S, api, go, icon, locText, avatar, groupAvatar, toast, fail, openModal, closeModal, confirmBox, refreshGroups, refreshCounters, actions, memberPickerHtml, wireMemberPicker, pickedIds } from './core.js';
import { t } from './i18n.js';

export async function renderFriends(view) {
  view.innerHTML = `<div class="page"><div class="page-inner muted">${t('cmt.loading')}</div></div>`;
  const [f, jr] = await Promise.all([api('GET', '/friends'), api('GET', '/private/requests')]);
  const priv = S.groups.filter((g) => g.type === 'private');
  const person = (u, right) => `<div class="card">${avatar(u, '')}<button class="grow" style="background:none;border:0;text-align:left;font-weight:600;font-size:15px;padding:0" data-act="profile" data-id="${u.id}">${esc(u.displayName)}${u.online ? ` <span class="dot" title="${t('ch.onlineCap')}"></span>` : ''}${u.location ? `<span class="small muted loc-line" style="font-weight:400">${icon('pin', 14)}${esc(locText(u.location))}</span>` : ''}</button>${right}</div>`;
  view.innerHTML = `<div class="page"><div class="page-inner">
    <div class="row between"><h1>${t('nav.friends')}</h1><button class="btn primary" data-act="add-friend-hint">${t('so.addFriend')}</button></div>
    ${f.incoming.length || f.outgoing.length ? `<section><div class="h2">${t('so.requests')}</div><div class="list">
      ${f.incoming.map((r) => person(r.user, `<button class="btn primary sm" data-act="fr-accept" data-id="${r.id}">${t('so.accept')}</button><button class="btn sm" data-act="fr-decline" data-id="${r.id}">${t('ch.reject')}</button>`)).join('')}
      ${f.outgoing.map((r) => person(r.user, `<span class="small muted">${t('so.waiting')}</span><button class="btn sm" data-act="fr-cancel" data-id="${r.id}">${t('c.cancel')}</button>`)).join('')}</div></section>` : ''}
    <section><div class="h2">${t('so.list')}</div><div class="list">
      ${f.friends.map((u) => person(u, `<button class="btn" data-act="dm" data-id="${u.id}">${t('ch.dm')}</button>`)).join('') || `<p class="muted small">${t('so.none')}</p>`}</div></section>
    <section><div class="row between"><div class="h2" style="margin:0">${t('nav.private')}</div><button class="link-btn" style="font-size:14px;font-weight:600;color:var(--accent)" data-act="create-private">${t('so.createGroup')}</button></div>
      <div class="list" style="margin-top:8px">${priv.map((g) => `<a class="card" href="#/chat/${g.id}">${groupAvatar(g)}<span class="grow" style="font-weight:600">${esc(g.name)}</span>${g.unread ? `<span class="badge">${g.unread}</span>` : ''}</a>`).join('') || `<p class="muted small">${t('so.noPrivate')}</p>`}</div></section>
    ${jr.requests.length ? `<section><div class="h2">${t('so.joinReqs')}</div><div class="list">${jr.requests.map((r) => `<div class="card col"><div class="small">${t('so.wantsJoin', { u: `<strong>${esc(r.user.displayName)}</strong>`, g: `<strong>${esc(r.groupName)}</strong>` })}</div><div class="row"><button class="btn primary grow" data-act="jr-approve" data-id="${r.id}">${t('ch.approve')}</button><button class="btn grow" data-act="jr-reject" data-id="${r.id}">${t('ch.reject')}</button></div></div>`).join('')}</div></section>` : ''}
    ${f.blocked.length ? `<section><div class="h2">${t('so.blocked')}</div><div class="list">${f.blocked.map((u) => `<div class="card"><span class="grow">${esc(u.displayName)}</span><button class="btn sm" data-act="unblock" data-id="${u.id}">${t('so.unblock')}</button></div>`).join('')}</div></section>` : ''}
  </div></div>`;
}

const reloadHere = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

actions['add-friend-hint'] = () => {
  openModal(`<h2>${t('so.addFriend')}</h2><p class="small">${t('so.addHow')}</p><div class="btns"><button class="btn primary" data-close>${t('ch.gotIt')}</button></div>`);
  $('#modal [data-close]').onclick = closeModal;
};
actions['friend-add'] = async (el) => {
  try { await api('POST', '/friends/request', { userId: Number(el.dataset.id) }); closeModal(); toast(t('so.reqSent')); } catch (e) { fail(e); }
};
const answer = (verb, msg) => async (el) => {
  try { await api('POST', `/friends/requests/${el.dataset.id}/${verb}`); closeModal(); toast(t(msg)); refreshCounters(); if (location.hash.startsWith('#/friends')) reloadHere(); } catch (e) { fail(e); }
};
actions['fr-accept'] = answer('accept', 'so.nowFriends');
actions['fr-decline'] = answer('decline', 'so.declined');
actions['fr-cancel'] = async (el) => { try { await api('DELETE', `/friends/requests/${el.dataset.id}`); reloadHere(); } catch (e) { fail(e); } };
actions.unfriend = async (el) => {
  if (!(await confirmBox(t('so.unfriendQ'), t('so.unfriendText'), t('ch.unfriend'), true))) return;
  try { await api('DELETE', `/friends/${el.dataset.id}`); closeModal(); await refreshGroups(); if (location.hash.startsWith('#/friends')) reloadHere(); } catch (e) { fail(e); }
};
actions.block = async (el) => {
  if (!(await confirmBox(t('so.blockQ'), t('so.blockText'), t('ch.block'), true))) return;
  try { await api('POST', `/blocks/${el.dataset.id}`); toast(t('so.blockedToast')); await refreshGroups(); if (location.hash.startsWith('#/friends')) reloadHere(); } catch (e) { fail(e); }
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
  openModal(`<form id="pgf" class="col"><h2>${t('nav.createPrivate')}</h2>
    <div class="field"><label for="pgname">${t('ch.groupName')}</label><input class="input" id="pgname" required minlength="2" maxlength="50" placeholder="${t('so.namePh')}"></div>
    <div><div class="label">${t('so.addOptional')}</div>${memberPickerHtml(friends)}</div>
    <p class="small muted">${t('so.createNote')}</p>
    <div class="btns"><button type="button" class="btn" data-close>${t('c.cancel')}</button><button class="btn primary">${t('so.createGroup')}</button></div></form>`);
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
  view.innerHTML = `<div class="gate muted">${t('so.checkingLink')}</div>`;
  try {
    const { group } = await api('GET', `/invite/${code}`);
    if (group.joined) return go(`#/chat/${group.id}`);
    view.innerHTML = `<div class="gate">${groupAvatar({ type: 'private', name: group.name })}<h1>${esc(group.name)}</h1><p class="muted">${t('ch.privateSub')} · ${t('ch.members', { n: group.memberCount })}. ${t('so.needApproval')}</p>
      <button class="btn primary" id="joinreq">${t('so.askJoin')}</button><a class="btn" href="#/chat">${t('ch.back')}</a></div>`;
    $('#joinreq').onclick = async () => {
      try { await api('POST', `/invite/${code}/join`); view.innerHTML = `<div class="gate"><h1>${t('so.reqDone')}</h1><p class="muted">${t('so.reqDoneNote')}</p><a class="btn" href="#/chat">${t('a.home')}</a></div>`; } catch (e) { fail(e); }
    };
  } catch (e) {
    view.innerHTML = `<div class="gate"><h1>${t('so.linkBad')}</h1><p class="muted">${esc(e.message)}</p><a class="btn" href="#/chat">${t('a.home')}</a></div>`;
  }
}
