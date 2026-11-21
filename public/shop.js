// Cửa hàng xu tím và trang Danh hiệu
import { $, $$, S, api, esc, avatar, actions, fail, toast, openModal, closeModal, coinIcon, lvBadge } from './core.js';
import { FRAME_NAMES, COLOR_NAMES, nameCls } from './frames.js';

const fmt = (n) => Number(n).toLocaleString('vi-VN');
let tab = 'frame';

const preview = (frame, size = 'lg') => `<div class="fr-prev">${avatar({ ...S.me, frame }, size)}</div>`;
const nameSample = (colorId, big = false) => `<b class="${nameCls({ nameColor: colorId }).trim()}" style="font-size:${big ? 19 : 17}px">${esc(S.me.displayName)}</b>`;
const kindOf = (id) => id.split(':')[0];

// Đồ đã có không tự áp dụng và cũng không áp dụng ở đây: người dùng chọn dùng ở trang Thăng cấp (hồ sơ cấp bậc)
function ownedTag(equipped) {
  return equipped ? '<span class="st done">Đang dùng</span>' : '<span class="st doing">Đã sở hữu</span>';
}

export async function renderShop(view, t = tab) {
  tab = t;
  const sh = await api('GET', '/shop');
  S.me = { ...S.me, coins: sh.coins, balance: sh.balance, frame: sh.equipped.frame, nameColor: sh.equipped.color };
  const buy = (kind, it) => {
    if (it.owned) return ownedTag(kind === 'frame' ? sh.equipped.frame === it.id : sh.equipped.color === it.id);
    return it.price > sh.balance
      ? '<button class="btn sm" disabled>Chưa đủ xu</button>'
      : `<button class="btn sm primary" data-act="shop-buy" data-kind="${kind}" data-id="${it.id}">Mua</button>`;
  };
  const price = (it) => (it.owned ? '' : `<span class="shop-price">${coinIcon(16)}${fmt(it.price)}</span>`);
  let body = '';
  if (tab === 'frame') {
    body = `<div class="shop-grid">${sh.frames.map((it) => `<div class="card shop-item">${preview(it.id)}<b>${esc(it.name)}</b>${price(it)}${buy('frame', it)}</div>`).join('')}
      <div class="card shop-item shop-note"><span class="small muted">Khung của danh hiệu Bot trend không bán ở đây</span><span class="pill">Chỉ nhận từ danh hiệu</span></div></div>`;
  } else if (tab === 'color') {
    body = `<p class="small muted">Màu tên hiện trong chat, hồ sơ và danh sách. Xem trước bằng tên của bạn.</p>
      <div class="list">${sh.colors.map((it) => `<div class="card row between" style="gap:10px"><div class="grow">${nameSample(it.id, true)}<div class="tiny muted">${esc(it.name)}</div></div>${price(it)}${buy('color', it)}</div>`).join('')}</div>`;
  } else {
    const fr = sh.mine.frames, co = sh.mine.colors;
    body = `<section class="card col"><div class="h2" style="margin:0">Khung avatar đã có</div>
        <div class="shop-grid">${fr.map((f) => `<div class="shop-mine">${preview(f.id, '')}<span class="tiny">${esc(f.name)}</span>${f.source === 'title' ? '<span class="tiny muted">Danh hiệu</span>' : ''}${ownedTag(sh.equipped.frame === f.id)}</div>`).join('') || '<p class="small muted">Bạn chưa có khung nào. Vào tab Khung avatar để mua.</p>'}</div>
      </section>
      <section class="card col"><div class="h2" style="margin:0">Màu tên đã có</div>
        <div class="list">${co.map((c) => `<div class="row between">${nameSample(c.id)}<span class="tiny muted grow" style="margin-left:8px">${esc(c.name)}${c.source === 'title' ? ' · Danh hiệu' : ''}</span>${ownedTag(sh.equipped.color === c.id)}</div>`).join('') || '<p class="small muted">Bạn chưa có màu tên nào. Vào tab Màu tên để mua.</p>'}</div>
      </section>
      <section class="card col"><p class="small muted" style="margin:0">Đồ đã mua hoặc nhận từ danh hiệu không tự áp dụng. Bạn chọn khung và màu để dùng ở trang Thăng cấp.</p>
        <a class="btn primary" href="#/level">Chọn khung và màu ở Thăng cấp</a></section>`;
  }
  view.innerHTML = `<div class="page"><div class="page-inner">
    <div class="row between"><h1>Cửa hàng xu tím</h1><a class="btn sm" href="#/level">Thăng cấp</a></div>
    <p class="small muted">Dùng xu tím để mua khung avatar và màu tên. Đồ đã mua là của bạn mãi mãi, mua đồ không làm bạn tụt cấp.</p>
    <section class="card col">
      <div class="coin-stats">
        <div class="coin-stat">${coinIcon(34)}<b>${fmt(sh.coins)}</b><span class="small">Xu đã kiếm</span><span class="tiny muted">Dùng để tính thăng cấp, chỉ tăng</span></div>
        <div class="coin-stat spend">${coinIcon(34)}<b>${fmt(sh.balance)}</b><span class="small">Xu có thể tiêu</span><span class="tiny muted">Dùng để mua đồ, bị trừ khi mua</span></div>
      </div>
    </section>
    <div class="pillnav" role="group" aria-label="Chọn mục">${[['frame', 'Khung avatar'], ['color', 'Màu tên'], ['mine', 'Của tôi']].map(([k, n]) => `<button data-shoptab="${k}" aria-pressed="${tab === k}">${n}</button>`).join('')}</div>
    ${body}
  </div></div>`;
  $$('[data-shoptab]', view).forEach((b) => (b.onclick = () => renderShop(view, b.dataset.shoptab).catch(fail)));
}

actions['shop-buy'] = async (el) => {
  const { kind, id } = el.dataset;
  const sh = await api('GET', '/shop');
  const it = (kind === 'frame' ? sh.frames : sh.colors).find((x) => x.id === id);
  if (!it) return;
  const m = openModal(`<div class="col shop-confirm"><div class="small" style="font-weight:700;letter-spacing:.06em;color:var(--accent)">${kind === 'frame' ? 'MUA KHUNG AVATAR' : 'MUA MÀU TÊN'}</div>
    ${kind === 'frame' ? preview(id, 'lg') : `<div style="padding:8px">${nameSample(id, true)}</div>`}
    <h2 style="margin:0">${esc(it.name)}</h2>
    <div class="card col" style="gap:6px;text-align:left">
      <div class="row between"><span class="small muted">Giá</span><span class="shop-price">${coinIcon(16)}${fmt(it.price)}</span></div>
      <div class="row between"><span class="small muted">Số dư hiện tại</span><b>${fmt(sh.balance)}</b></div>
      <div class="row between" style="border-top:1px solid var(--line);padding-top:6px"><span class="small muted">Số dư sau khi mua</span><b style="color:#135A48">${fmt(sh.balance - it.price)}</b></div>
    </div>
    <div class="btns"><button type="button" class="btn" data-close>Để sau</button><button type="button" class="btn primary" id="buyok">Mua với ${fmt(it.price)} xu</button></div></div>`);
  $('[data-close]', m).onclick = closeModal;
  $('#buyok', m).onclick = async () => {
    try {
      const r = await api('POST', '/shop/buy', { kind, id: Number(id.split(':')[1]) });
      closeModal();
      const m2 = openModal(`<div class="col shop-confirm"><h2 style="margin:0">Bạn đã sở hữu ${esc(it.name)}</h2>
        ${kind === 'frame' ? preview(id, 'lg') : `<div style="padding:8px">${nameSample(id, true)}</div>`}
        <p class="small muted" style="margin:0">Còn lại ${fmt(r.balance)} xu tím.</p>
        <p class="small muted" style="margin:0">Đồ mới chưa được áp dụng. Bạn chọn dùng ở trang Thăng cấp.</p>
        <div class="btns"><button type="button" class="btn" data-close>Tiếp tục mua sắm</button><a class="btn primary" href="#/level">Chọn dùng ở Thăng cấp</a></div></div>`);
      $('[data-close]', m2).onclick = () => { closeModal(); renderShop($('#view')).catch(fail); };
    } catch (e) { fail(e); }
  };
};

actions.equip = async (el) => {
  const kind = el.dataset.kind, id = el.dataset.id || null;
  S.me = (await api('POST', '/me/appearance', { [kind === 'frame' ? 'frame' : 'color']: id })).user;
  toast(id ? 'Đã áp dụng' : 'Đã về mặc định');
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
  const cond = (c) => `<div class="lvl-cond"><div class="row between"><span>${esc(c.label)}</span><b class="small">${fmt(c.have)} / ${fmt(c.need)}</b></div><div class="lvl-bar"><i style="width:${c.ok ? 100 : Math.min(100, Math.round((c.have / c.need) * 100))}%"></i></div></div>`;
  const card = (t) => {
    const ok = t.state === 'done';
    const stx = { done: '<span class="st done">Đã đạt</span>', doing: '<span class="st doing">Đang làm</span>', locked: '<span class="st locked">Chưa mở</span>' }[t.state];
    const useF = ok ? (equipped.frame === t.reward.frame ? '<span class="st done">Đang dùng</span>' : '<span class="st doing">Đã nhận</span>') : '<span class="st locked">Chưa mở</span>';
    const useC = ok ? (equipped.color === t.reward.color ? '<span class="st done">Đang dùng</span>' : '<span class="st doing">Đã nhận</span>') : '<span class="st locked">Chưa mở</span>';
    return `<section class="card col" style="gap:12px">
      <div class="row between">${titleChip(t.n, t.name, true)}${stx}</div>
      <div class="tiny muted" style="font-weight:700;letter-spacing:.04em">ĐIỀU KIỆN</div>
      ${t.conditions.map(cond).join('')}
      ${t.needs && !ok && t.state === 'locked' ? `<div class="tiny muted">Mở sau khi đạt ${esc(t.needs)}</div>` : ''}
      <div class="tiny muted" style="font-weight:700;letter-spacing:.04em">PHẦN THƯỞNG</div>
      <div class="title-rw" ${ok ? '' : 'style="opacity:.55"'}><span class="tiny muted" style="width:70px;flex:none">KHUNG AVATAR</span>${preview(t.reward.frame, '')}<div class="grow"><b class="small">${esc(t.reward.frameName)}</b><div>${useF}</div></div></div>
      <div class="title-rw" ${ok ? '' : 'style="opacity:.55"'}><span class="tiny muted" style="width:70px;flex:none">MÀU TÊN</span><div class="grow">${nameSample(t.reward.color, true)}<div class="tiny muted">${esc(t.reward.colorName)}</div></div>${useC}</div>
      <span class="pill warn" style="align-self:flex-start">Không thể mua bằng xu tím</span>
    </section>`;
  };
  view.innerHTML = `<div class="page" id="titles-page"><div class="page-inner">
    <div class="row between"><h1>Danh hiệu</h1><a class="btn sm" href="#/level">Thăng cấp</a></div>
    <p class="small muted">Đạt danh hiệu để nhận khung avatar và màu tên riêng. Phần thưởng của danh hiệu không bán trong cửa hàng và không thể mua bằng xu tím.</p>
    <section class="card row" style="gap:12px"><div class="grow"><b style="font-size:20px">${done} / ${titles.length}</b><div class="small muted">danh hiệu đã đạt</div></div><div class="lvl-bar" style="width:140px"><i style="width:${Math.round((done / titles.length) * 100)}%"></i></div></section>
    ${titles.map(card).join('')}
    <section class="card col" style="border-style:dashed;text-align:center"><b class="small muted">Sắp có thêm danh hiệu</b><span class="tiny muted">Danh hiệu mới sẽ xuất hiện ở đây cùng điều kiện và phần thưởng.</span></section>
    <section class="card col"><div class="small muted">Phần thưởng không tự áp dụng. Bạn chọn khung và màu để dùng ở <a href="#/level">trang Thăng cấp</a>, có thể xen kẽ đồ mua và đồ danh hiệu.</div></section>
  </div></div>`;
}
