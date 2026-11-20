// Mục "Chào mừng" riêng của từng nhóm: gửi lời chào cho thành viên mới, không đăng vào khung chat chung
import { $, esc, S, api, go, icon, avatar, toast, fail, actions } from './core.js';

const QUICK = [
  'Chào mừng bạn đến với nhóm! 💜',
  'Rất vui được gặp bạn, cùng nhau đu LingOrm nhé! 🎉',
  'Welcome to the LingOrm fam! 🌸',
];

const ago = (t) => {
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
};

const bubble = (w) => `<div class="wl-msg${w.mine ? ' mine' : ''}"><span class="wl-who">${esc(w.author.displayName)}</span> <span>${esc(w.body)}</span></div>`;

function cardHtml(n, perAuthor) {
  const u = n.user;
  const left = perAuthor - n.mineCount;
  const form = n.isMe
    ? '<p class="small muted">Đây là bạn. Lời chào của mọi người dành cho bạn sẽ hiện ở đây.</p>'
    : left > 0
      ? `<div class="wl-quick">${QUICK.map((q) => `<button type="button" class="chip" data-act="wl-quick" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <form class="wl-form" data-uid="${u.id}"><label class="sr-only" for="wl-${u.id}">Lời chào gửi ${esc(u.displayName)}</label>
          <input class="input" id="wl-${u.id}" maxlength="300" placeholder="Viết lời chào cho ${esc(u.displayName)}…" autocomplete="off"><button class="btn primary">Gửi</button></form>`
      : '<p class="small muted">Bạn đã gửi đủ lời chào cho thành viên này. Cảm ơn bạn! 💜</p>';
  return `<article class="card col wl-card" data-uid="${u.id}">
    <div class="row">${avatar(u)}<div class="grow"><b>${esc(u.displayName)}</b>${n.isMe ? ' <span class="pill">Bạn</span>' : ''}<div class="tiny muted">Tham gia ${ago(n.joinedAt)}</div></div>
      <span class="tiny muted">${n.welcomes.length ? `${n.welcomes.length} lời chào` : 'Chưa có lời chào'}</span></div>
    <div class="wl-list">${n.welcomes.map(bubble).join('')}</div>${form}</article>`;
}

export async function renderWelcome(view, gid) {
  const d = await api('GET', `/groups/${gid}/welcome`);
  const g = d.group;
  const mineFirst = d.newcomers;
  view.innerHTML = `<div class="page"><div class="page-inner">
    <div class="row"><a class="icon-btn back-wl" href="#/chat/${g.id}" aria-label="Quay lại nhóm">${icon('back', 22)}</a>
      <div class="grow"><h1 style="margin:0">Chào mừng thành viên mới</h1><div class="small muted">${esc(g.name)}</div></div></div>
    <p class="small muted">Thành viên tham gia trong ${d.days} ngày qua. Lời chào ở đây gửi riêng cho từng người và không hiện trong khung chat chung của nhóm. Mỗi người được chào tối đa ${d.perAuthor} lần bởi cùng một bạn.</p>
    <div class="list" id="wl">${mineFirst.map((n) => cardHtml(n, d.perAuthor)).join('') || '<p class="muted">Chưa có thành viên mới trong thời gian gần đây.</p>'}</div>
  </div></div>`;
  view.dataset.wl = gid;
}

actions['wl-quick'] = (el) => {
  const input = el.closest('.wl-card').querySelector('input');
  if (input) { input.value = el.dataset.q; input.focus(); }
};

document.addEventListener('submit', async (e) => {
  const f = e.target.closest?.('.wl-form');
  if (!f) return;
  e.preventDefault();
  const view = f.closest('#view');
  const gid = Number(view?.dataset.wl);
  const input = f.querySelector('input');
  const body = input.value.trim();
  if (!body) return;
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    await api('POST', `/groups/${gid}/welcome/${f.dataset.uid}`, { body });
    const g = S.groups.find((x) => x.id === gid);
    const first = !f.closest('.wl-card').querySelector('.wl-msg.mine');
    if (g && first && g.newcomers > 0) { g.newcomers--; S.hooks.renderSide?.(); }
    toast('Đã gửi lời chào 💜');
    await renderWelcome(view, gid);
  } catch (er) { btn.disabled = false; fail(er); }
});

actions['welcome-open'] = (el) => go(`#/welcome/${el.dataset.id}`);
