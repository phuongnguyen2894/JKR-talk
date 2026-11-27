// Cửa hàng xu tím và trang Danh hiệu
import { $, $$, S, api, esc, avatar, actions, fail, toast, openModal, closeModal, coinIcon, lvBadge, itemName, titleName, condLabel } from './core.js';
import { t as tr, fmtNum } from './i18n.js';
import { FRAME_NAMES, COLOR_NAMES, nameCls } from './frames.js';

const fmt = fmtNum;
let tab = 'frame';

const preview = (frame, size = 'lg') => `<div class="fr-prev">${avatar({ ...S.me, frame }, size)}</div>`;
const nameSample = (colorId, big = false) => `<b class="${nameCls({ nameColor: colorId }).trim()}" style="font-size:${big ? 19 : 17}px">${esc(S.me.displayName)}</b>`;
const kindOf = (id) => id.split(':')[0];

// Đồ đã có không tự áp dụng và cũng không áp dụng ở đây: người dùng chọn dùng ở trang Thăng cấp (hồ sơ cấp bậc)
function ownedTag(equipped) {
  return equipped ? `<span class="st done">${tr('lvl.inUse')}</span>` : `<span class="st doing">${tr('sh.owned')}</span>`;
}

export async function renderShop(view, t = tab) {
  tab = t;
  const sh = await api('GET', '/shop');
  S.me = { ...S.me, coins: sh.coins, balance: sh.balance, frame: sh.equipped.frame, nameColor: sh.equipped.color };
  const buy = (kind, it) => {
    if (it.owned) return ownedTag(kind === 'frame' ? sh.equipped.frame === it.id : sh.equipped.color === it.id);
    return it.price > sh.balance
      ? `<button class="btn sm" disabled>${tr('sh.notEnough')}</button>`
      : `<button class="btn sm primary" data-act="shop-buy" data-kind="${kind}" data-id="${it.id}">${tr('sh.buy')}</button>`;
  };
  const price = (it) => (it.owned ? '' : `<span class="shop-price">${coinIcon(16)}${fmt(it.price)}</span>`);
  let body = '';
  if (tab === 'frame') {
    body = `<div class="shop-grid">${sh.frames.map((it) => `<div class="card shop-item">${preview(it.id)}<b>${esc(itemName('frame', it.id, it.name))}</b>${price(it)}${buy('frame', it)}</div>`).join('')}
      <div class="card shop-item shop-note"><span class="small muted">${tr('sh.titleFramesNote')}</span><span class="pill">${tr('sh.titleOnly')}</span></div></div>`;
  } else if (tab === 'color') {
    body = `<p class="small muted">${tr('sh.colorsNote')}</p>
      <div class="list">${sh.colors.map((it) => `<div class="card row between" style="gap:10px"><div class="grow">${nameSample(it.id, true)}<div class="tiny muted">${esc(itemName('color', it.id, it.name))}</div></div>${price(it)}${buy('color', it)}</div>`).join('')}</div>`;
  } else {
    const fr = sh.mine.frames, co = sh.mine.colors;
    body = `<section class="card col"><div class="h2" style="margin:0">${tr('sh.myFrames')}</div>
        <div class="shop-grid">${fr.map((f) => `<div class="shop-mine">${preview(f.id, '')}<span class="tiny">${esc(itemName('frame', f.id, f.name))}</span>${f.source === 'title' ? `<span class="tiny muted">${tr('lvl.titleTag')}</span>` : ''}${ownedTag(sh.equipped.frame === f.id)}</div>`).join('') || `<p class="small muted">${tr('sh.noFrames')}</p>`}</div>
      </section>
      <section class="card col"><div class="h2" style="margin:0">${tr('sh.myColors')}</div>
        <div class="list">${co.map((c) => `<div class="row between">${nameSample(c.id)}<span class="tiny muted grow" style="margin-left:8px">${esc(itemName('color', c.id, c.name))}${c.source === 'title' ? ` · ${tr('lvl.titleTag')}` : ''}</span>${ownedTag(sh.equipped.color === c.id)}</div>`).join('') || `<p class="small muted">${tr('sh.noColors')}</p>`}</div>
      </section>
      <section class="card col"><p class="small muted" style="margin:0">${tr('sh.mineNote')}</p>
        <a class="btn primary" href="#/level">${tr('sh.chooseAtLevel')}</a></section>`;
  }
  view.innerHTML = `<div class="page"><div class="page-inner">
    <div class="row between"><h1>${tr('nav.shop')}</h1><a class="btn sm" href="#/level">${tr('nav.level')}</a></div>
    <p class="small muted">${tr('sh.intro')}</p>
    <section class="card col">
      <div class="coin-stats">
        <div class="coin-stat">${coinIcon(34)}<b>${fmt(sh.coins)}</b><span class="small">${tr('lvl.earned')}</span><span class="tiny muted">${tr('sh.earnedNote')}</span></div>
        <div class="coin-stat spend">${coinIcon(34)}<b>${fmt(sh.balance)}</b><span class="small">${tr('lvl.spendable')}</span><span class="tiny muted">${tr('lvl.spendableNote')}</span></div>
      </div>
    </section>
    <div class="pillnav" role="group" aria-label="${tr('sh.section')}">${[['frame', tr('sh.tabFrames')], ['color', tr('sh.tabColors')], ['mine', tr('sh.tabMine')]].map(([k, n]) => `<button data-shoptab="${k}" aria-pressed="${tab === k}">${n}</button>`).join('')}</div>
    ${body}
  </div></div>`;
  $$('[data-shoptab]', view).forEach((b) => (b.onclick = () => renderShop(view, b.dataset.shoptab).catch(fail)));
}

actions['shop-buy'] = async (el) => {
  const { kind, id } = el.dataset;
  const sh = await api('GET', '/shop');
  const it = (kind === 'frame' ? sh.frames : sh.colors).find((x) => x.id === id);
  if (!it) return;
  const m = openModal(`<div class="col shop-confirm"><div class="small" style="font-weight:700;letter-spacing:.06em;color:var(--accent)">${kind === 'frame' ? tr('sh.buyFrameCap') : tr('sh.buyColorCap')}</div>
    ${kind === 'frame' ? preview(id, 'lg') : `<div style="padding:8px">${nameSample(id, true)}</div>`}
    <h2 style="margin:0">${esc(itemName(kind, it.id, it.name))}</h2>
    <div class="card col" style="gap:6px;text-align:left">
      <div class="row between"><span class="small muted">${tr('sh.price')}</span><span class="shop-price">${coinIcon(16)}${fmt(it.price)}</span></div>
      <div class="row between"><span class="small muted">${tr('sh.balanceNow')}</span><b>${fmt(sh.balance)}</b></div>
      <div class="row between" style="border-top:1px solid var(--line);padding-top:6px"><span class="small muted">${tr('sh.balanceAfter')}</span><b style="color:#135A48">${fmt(sh.balance - it.price)}</b></div>
    </div>
    <div class="btns"><button type="button" class="btn" data-close>${tr('push.askLater')}</button><button type="button" class="btn primary" id="buyok">${tr('sh.buyFor', { n: fmt(it.price) })}</button></div></div>`);
  $('[data-close]', m).onclick = closeModal;
  $('#buyok', m).onclick = async () => {
    try {
      const r = await api('POST', '/shop/buy', { kind, id: Number(id.split(':')[1]) });
      closeModal();
      const m2 = openModal(`<div class="col shop-confirm"><h2 style="margin:0">${tr('sh.nowOwn', { n: esc(itemName(kind, it.id, it.name)) })}</h2>
        ${kind === 'frame' ? preview(id, 'lg') : `<div style="padding:8px">${nameSample(id, true)}</div>`}
        <p class="small muted" style="margin:0">${tr('sh.left', { n: fmt(r.balance) })}</p>
        <p class="small muted" style="margin:0">${tr('sh.notApplied')}</p>
        <div class="btns"><button type="button" class="btn" data-close>${tr('sh.keepShopping')}</button><a class="btn primary" href="#/level">${tr('sh.useAtLevel')}</a></div></div>`);
      $('[data-close]', m2).onclick = () => { closeModal(); renderShop($('#view')).catch(fail); };
    } catch (e) { fail(e); }
  };
};

actions.equip = async (el) => {
  const kind = el.dataset.kind, id = el.dataset.id || null;
  S.me = (await api('POST', '/me/appearance', { [kind === 'frame' ? 'frame' : 'color']: id })).user;
  toast(id ? tr('sh.applied') : tr('sh.backDefault'));
  S.hooks.renderSide?.();
  window.dispatchEvent(new Event('hashchange')); // vẽ lại trang đang mở
};

// ---- trang Danh hiệu --------------------------------------------------------------
const TT_ICON = {
  1: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  2: '<path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor"/>',
  3: '<path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" fill="currentColor"/>',
};
export const titleChip = (n, name, big = false) => `<span class="tt t${n}${big ? ' big' : ''}"><svg viewBox="0 0 24 24" width="${big ? 20 : 16}" height="${big ? 20 : 16}" aria-hidden="true">${TT_ICON[n]}</svg>${esc(name)}</span>`;

export async function renderTitles(view) {
  const { titles, equipped } = await api('GET', '/me/titles');
  const done = titles.filter((t) => t.state === 'done').length;
  const cond = (c) => `<div class="lvl-cond"><div class="row between"><span>${esc(condLabel(c))}</span><b class="small">${fmt(c.have)} / ${fmt(c.need)}</b></div><div class="lvl-bar"><i style="width:${c.ok ? 100 : Math.min(100, Math.round((c.have / c.need) * 100))}%"></i></div></div>`;
  const card = (t) => {
    const ok = t.state === 'done';
    const stx = { done: `<span class="st done">${tr('lvl.reached')}</span>`, doing: `<span class="st doing">${tr('sh.inProgress')}</span>`, locked: `<span class="st locked">${tr('sh.locked')}</span>` }[t.state];
    const useF = ok ? (equipped.frame === t.reward.frame ? `<span class="st done">${tr('lvl.inUse')}</span>` : `<span class="st doing">${tr('sh.received')}</span>`) : `<span class="st locked">${tr('sh.locked')}</span>`;
    const useC = ok ? (equipped.color === t.reward.color ? `<span class="st done">${tr('lvl.inUse')}</span>` : `<span class="st doing">${tr('sh.received')}</span>`) : `<span class="st locked">${tr('sh.locked')}</span>`;
    return `<section class="card col" style="gap:12px">
      <div class="row between">${titleChip(t.n, titleName(t.key, t.name), true)}${stx}</div>
      <div class="tiny muted" style="font-weight:700;letter-spacing:.04em">${tr('sh.condCap')}</div>
      ${t.conditions.map(cond).join('')}
      ${t.needs && !ok && t.state === 'locked' ? `<div class="tiny muted">${tr('sh.unlockAfter', { t: esc(titleName(t.needsKey, t.needs)) })}</div>` : ''}
      <div class="tiny muted" style="font-weight:700;letter-spacing:.04em">${tr('sh.rewardCap')}</div>
      <div class="title-rw" ${ok ? '' : 'style="opacity:.55"'}><span class="tiny muted" style="width:70px;flex:none">${tr('lvl.framesCap')}</span>${preview(t.reward.frame, '')}<div class="grow"><b class="small">${esc(itemName('frame', t.reward.frame, t.reward.frameName))}</b><div>${useF}</div></div></div>
      <div class="title-rw" ${ok ? '' : 'style="opacity:.55"'}><span class="tiny muted" style="width:70px;flex:none">${tr('lvl.colorsCap')}</span><div class="grow">${nameSample(t.reward.color, true)}<div class="tiny muted">${esc(itemName('color', t.reward.color, t.reward.colorName))}</div></div>${useC}</div>
      <span class="pill warn" style="align-self:flex-start">${tr('sh.cannotBuy')}</span>
    </section>`;
  };
  view.innerHTML = `<div class="page" id="titles-page"><div class="page-inner">
    <div class="row between"><h1>${tr('nav.titles')}</h1><a class="btn sm" href="#/level">${tr('nav.level')}</a></div>
    <p class="small muted">${tr('sh.titlesIntro')}</p>
    <section class="card row" style="gap:12px"><div class="grow"><b style="font-size:20px">${done} / ${titles.length}</b><div class="small muted">${tr('sh.titlesDone')}</div></div><div class="lvl-bar" style="width:140px"><i style="width:${Math.round((done / titles.length) * 100)}%"></i></div></section>
    ${titles.map(card).join('')}
    <section class="card col" style="border-style:dashed;text-align:center"><b class="small muted">${tr('sh.moreSoon')}</b><span class="tiny muted">${tr('sh.moreSoonNote')}</span></section>
    <section class="card col"><div class="small muted">${tr('sh.titlesFoot', { a: `<a href="#/level">${tr('nav.level')}</a>` })}</div></section>
  </div></div>`;
}
