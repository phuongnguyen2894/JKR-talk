// Chủ đề thảo luận: Admin / Mod tạo, mọi người vào bàn luận như một nhóm chat
import { $, S, esc, api, go, openModal, closeModal, imageToDataUrl, icon, fmtDateTime, toast, fail, ask, confirmBox, actions, refreshGroups, avatarR, roleOf, roleClass } from './core.js';
import { t as tr } from './i18n.js';

export const ago = (t) => {
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 1) return tr('ago.now');
  if (m < 60) return tr('ago.min', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return tr('ago.hour', { n: h });
  return tr('ago.day', { n: Math.floor(h / 24) });
};

// Nút tạo chủ đề + danh sách chủ đề của tôi đang chờ duyệt (dùng ở trang Chủ đề nóng và Tất cả chủ đề)
export const createTopicHtml = (needsApproval, isAdmin = false) => `<button class="btn primary" data-act="topic-new" data-approval="${needsApproval ? 1 : 0}" data-admin="${isAdmin ? 1 : 0}">${isAdmin ? `+ ${tr('tp.create')}` : `+ ${tr('tp.createTopic')}`}</button>`;
export const pendingMineHtml = (mine = []) => mine.length ? `<section class="card col" style="gap:6px" aria-label="${tr('tp.pendingAria')}">
  <div class="h2" style="margin:0">${tr('tp.pendingTitle')}</div>
  ${mine.map((t) => `<div class="row wrap" style="gap:8px"><span class="pill warn">${tr('tp.pending')}</span><b class="grow">${esc(t.name)}</b><span class="tiny muted">${ago(t.createdAt)}</span><button class="btn sm" data-act="topic-withdraw" data-id="${t.id}">${tr('ch.withdraw')}</button></div>`).join('')}
  <p class="tiny muted" style="margin:0">${tr('tp.pendingNote')}</p></section>` : '';

export async function renderTopics(view) {
  const { topics, mine, needsApproval, canHighlight } = await api('GET', '/topics');
  view.innerHTML = `<div class="page" id="topics-page"><div class="page-inner">
    <div class="row between wrap"><h1>${tr('nav.topics')}</h1>${createTopicHtml(needsApproval, S.me.role === 'admin')}</div>
    <p class="small muted">${tr('tp.intro')}</p>
    ${pendingMineHtml(mine)}
    <div class="list">${topics.map((t) => {
      const r = roleOf(t.creator);
      return `<article class="card col topic-card${t.highlighted ? ' hl' : ''}">
      <a class="topic-link" href="#/chat/${t.id}">
        <span class="topic-ic" aria-hidden="true">${icon(t.highlighted ? 'star' : 'chat', 20)}</span>
        <span class="grow">${t.highlighted ? `<span class="hl-pill">★ ${tr('ch.featured')}</span>` : ''}<b class="topic-name">${esc(t.name)}</b>${t.joined ? ` <span class="pill">${tr('hot.joined')}</span>` : ''}
          ${t.description ? `<span class="small muted topic-desc">${esc(t.description)}</span>` : ''}
          <span class="tiny muted">${tr('ch.members', { n: t.memberCount })} · ${tr('hot.active', { t: ago(t.lastAt) })}${t.creator ? ` · ${tr('hot.by', { n: `<span class="${roleClass(r).trim()}">${esc(t.creator.displayName)}</span>` })}` : ''}</span></span>
      </a>
      <div class="row wrap" style="gap:6px"><button class="btn sm" data-act="share-topic" data-id="${t.id}" data-name="${esc(t.name)}">${icon('share', 15)} ${tr('tp.share')}</button>${canHighlight ? `<button class="btn sm" data-act="topic-hl" data-id="${t.id}" data-on="${t.highlighted ? 0 : 1}">${t.highlighted ? tr('tp.unfeature') : `★ ${tr('tp.feature')}`}</button>` : ''}${t.canManage ? `<button class="btn sm" data-act="topic-edit" data-id="${t.id}" data-name="${esc(t.name)}" data-desc="${esc(t.description)}">${tr('ch.edit')}</button><button class="btn sm danger" data-act="topic-del" data-id="${t.id}" data-name="${esc(t.name)}">${tr('ch.closeTopic')}</button>` : ''}</div>
    </article>`;
    }).join('') || `<p class="muted">${tr('hot.noTopics')}</p>`}</div>
  </div></div>`;
}

const fields = (v = {}) => [
  { name: 'name', label: tr('tp.name'), value: v.name || '', required: true, max: 60 },
  { name: 'description', label: tr('tp.desc'), type: 'textarea', value: v.description || '', max: 300 },
];
// Admin: một nút "Tạo" cho cả chủ đề thảo luận lẫn bài đăng từ quản trị
function adminCompose() {
  const m = openModal(`<form id="composef" class="col"><h2>${tr('tp.new')}</h2>
    <div class="pillnav" role="group" aria-label="${tr('tp.kind')}"><button type="button" data-kind="topic" aria-pressed="true">${tr('ch.topic')}</button><button type="button" data-kind="post" aria-pressed="false">${tr('tp.adminPost')}</button></div>
    <p class="muted small" id="cmphint">${tr('tp.hintTopic')}</p>
    <div data-sec="topic" class="col"><div class="field"><label for="cp-name">${tr('tp.name')}</label><input class="input" id="cp-name" maxlength="60" autocomplete="off"></div>
      <div class="field"><label for="cp-desc">${tr('tp.desc')}</label><textarea class="input" id="cp-desc" maxlength="300"></textarea></div></div>
    <div data-sec="post" class="col" hidden><div class="field"><label for="cp-body">${tr('tp.body')}</label><textarea class="input" id="cp-body" maxlength="2000" rows="4" placeholder="${tr('tp.bodyPh')}"></textarea></div>
      <div class="field"><label for="cp-img">${tr('tp.img')}</label><input type="file" id="cp-img" accept="image/png,image/jpeg,image/gif,image/webp"></div></div>
    <div class="btns"><button type="button" class="btn" data-close>${tr('c.cancel')}</button><button class="btn primary" id="cp-ok">${tr('tp.createTopic')}</button></div></form>`);
  let kind = 'topic';
  const hints = { topic: tr('tp.hintTopic'), post: tr('tp.hintPost') };
  const setKind = (k) => {
    kind = k;
    m.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
    m.querySelectorAll('[data-sec]').forEach((d) => { d.hidden = d.dataset.sec !== k; });
    $('#cmphint', m).textContent = hints[k];
    $('#cp-ok', m).textContent = k === 'topic' ? tr('tp.createTopic') : tr('tp.post');
    $(k === 'topic' ? '#cp-name' : '#cp-body', m).focus();
  };
  m.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => setKind(b.dataset.kind)));
  $('[data-close]', m).onclick = () => closeModal();
  $('#composef', m).onsubmit = async (e) => {
    e.preventDefault();
    const ok = $('#cp-ok', m); ok.disabled = true;
    try {
      if (kind === 'topic') {
        const r = await api('POST', '/topics', { name: $('#cp-name', m).value, description: $('#cp-desc', m).value });
        closeModal(); await refreshGroups(); toast(tr('tp.created')); go(`#/chat/${r.topic.id}`);
      } else {
        const body = $('#cp-body', m).value.trim(), f = $('#cp-img', m).files[0];
        if (!body && !f) { ok.disabled = false; return; }
        const imageUrl = f ? (await api('POST', '/upload', { dataUrl: await imageToDataUrl(f) })).url : undefined;
        await api('POST', '/hot/posts', { body, imageUrl });
        closeModal(); toast(tr('tp.posted'));
        document.dispatchEvent(new CustomEvent('topics-changed', { detail: { tab: 'admin' } }));
      }
    } catch (er) { ok.disabled = false; fail(er); }
  };
}
actions['topic-new'] = async (el) => {
  if (el?.dataset?.admin === '1') return adminCompose();
  const approval = el?.dataset?.approval === '1';
  const v = await ask({ title: tr('tp.createTitle'), text: approval ? tr('tp.createApproval') : tr('tp.createDirect'), fields: fields(), ok: approval ? tr('tp.submit') : tr('tp.create') });
  if (!v) return;
  try {
    const r = await api('POST', '/topics', v);
    if (r.pending) { toast(tr('tp.submitted'), 6000); document.dispatchEvent(new CustomEvent('topics-changed')); return; }
    await refreshGroups();
    toast(tr('tp.created'));
    go(`#/chat/${r.topic.id}`);
  } catch (e) { fail(e); }
};
actions['topic-withdraw'] = async (el) => {
  try { await api('DELETE', `/topics/pending/${el.dataset.id}`); toast(tr('tp.withdrawn')); document.dispatchEvent(new CustomEvent('topics-changed')); } catch (e) { fail(e); }
};
document.addEventListener('topics-changed', () => { if ($('#topics-page')) renderTopics($('#view')).catch(() => {}); });
actions['topic-edit'] = async (el) => {
  const v = await ask({ title: tr('tp.editTitle'), fields: fields({ name: el.dataset.name, description: el.dataset.desc }), ok: tr('ch.save') });
  if (!v) return;
  try { await api('PATCH', `/topics/${el.dataset.id}`, v); await refreshGroups(); renderTopics($('#view')); } catch (e) { fail(e); }
};
actions['topic-hl'] = async (el) => {
  const on = el.dataset.on === '1';
  try {
    await api('POST', `/topics/${el.dataset.id}/highlight`, { on });
    await refreshGroups();
    toast(on ? tr('tp.featured') : tr('tp.unfeatured'));
    renderTopics($('#view'));
  } catch (e) { fail(e); }
};
actions['topic-del'] = async (el) => {
  if (!(await confirmBox(tr('tp.closeQ', { n: el.dataset.name }), tr('tp.closeText'), tr('ch.closeTopic'), true))) return;
  try {
    await api('DELETE', `/topics/${el.dataset.id}`); await refreshGroups(); toast(tr('tp.closed'));
    if (location.hash.startsWith('#/topics')) renderTopics($('#view')); else go(location.hash.startsWith('#/hot') ? '#/hot' : '#/topics'); // đang ở trong chủ đề vừa đóng thì chuyển sang danh sách
  } catch (e) { fail(e); }
};
