// Game "Nuôi thú": khu nhà chung cho các bạn thú. Máy chủ quyết định mọi thay đổi; máy khách chỉ hiển thị và gửi thao tác.
import { $, $$, esc, S, api, toast, fail, go, coinIcon, openModal, closeModal, confirmBox, ask } from './core.js';

let P = null;
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const HAB_NAME = { house: 'Nhà', cage: 'Lồng', tank: 'Bể' };
let cssDone = false;
function loadCss() {
  if (cssDone || document.getElementById('pets-css')) { cssDone = true; return Promise.resolve(); }
  return new Promise((ok) => { const l = document.createElement('link'); l.id = 'pets-css'; l.rel = 'stylesheet'; l.href = '/pets.css'; l.onload = l.onerror = ok; document.head.appendChild(l); cssDone = true; });
}
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
const MOOD = { happy: '😊', ok: '🙂', hungry: '🍖', bored: '😞', dirty: '🫧', sleepy: '😴' };
const STAT = [['food', 'No', '#F59E0B'], ['fun', 'Vui', '#EC4899'], ['clean', 'Sạch', '#0EA5E9'], ['health', 'Khỏe', '#22C55E']];
const ACT = [['feed', '🍽️', 'Cho ăn'], ['play', '🎾', 'Chơi'], ['wash', '🫧', 'Tắm'], ['sleep', '🌙', 'Ngủ']];
const SCALE = [0.8, 0.92, 1.04, 1.18];
const LV = { love: '😍', like: '😊', neutral: '😐', dislike: '🤢' };

// hình tạm: ảnh nếu Admin đã tải, không thì chữ viết tắt trên nền màu kèm biểu tượng loài
function face(p, size = 64, { scene = false } = {}) {
  if (p.sprite && p.anim) { // có hoạt hình: ảnh khởi đầu là khung 1 của idle; mountAnims() đổi khung theo trạng thái
    const s = Math.round(size * (scene ? 1.6 : 1.15)), a = p.anim.idle.urls[0];
    const acc = `${p.collar ? `<i class="pt-acc c" title="${esc(p.collar.name)}" aria-hidden="true">${p.collar.emoji}</i>` : ''}${p.outfit ? `<i class="pt-acc o" title="${esc(p.outfit.name)}" aria-hidden="true">${p.outfit.emoji}</i>` : ''}`;
    return `<span class="pt-spr" data-pet="${p.id}" ${scene ? 'data-scene="1"' : ''} style="width:${s}px;height:${s}px"><img src="${esc(a)}" alt="" draggable="false" width="${s}" height="${s}">${acc}</span>`;
  }
  if (p.sprite) { // hình pixel art đầy đủ cơ thể (đã vẽ sẵn kích thước theo giai đoạn): hiển thị bằng nét sắc, không cắt tròn
    const s = Math.round(size * (scene ? 1.6 : 1.15));
    const acc = `${p.collar ? `<i class="pt-acc c" title="${esc(p.collar.name)}" aria-hidden="true">${p.collar.emoji}</i>` : ''}${p.outfit ? `<i class="pt-acc o" title="${esc(p.outfit.name)}" aria-hidden="true">${p.outfit.emoji}</i>` : ''}`;
    return `<span class="pt-spr" style="width:${s}px;height:${s}px"><img src="${esc(p.sprite)}" alt="" draggable="false" width="${s}" height="${s}">${acc}</span>`;
  }
  const inner = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" draggable="false">` : `<b>${esc(p.initials)}</b>`;
  const acc = `${p.collar ? `<i class="pt-acc c" title="${esc(p.collar.name)}" aria-hidden="true">${p.collar.emoji}</i>` : ''}${p.outfit ? `<i class="pt-acc o" title="${esc(p.outfit.name)}" aria-hidden="true">${p.outfit.emoji}</i>` : ''}`;
  return `<span class="pt-face" style="width:${size}px;height:${size}px;background:${esc(p.color)};font-size:${Math.round(size * 0.34)}px">${inner}<i class="pt-sp" aria-hidden="true">${p.emoji}</i>${acc}</span>`;
}
const bar = (v, c) => `<span class="pt-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"><i style="width:${v}%;background:${c}"></i></span>`;

export async function renderPets(view, arg) {
  P = { walk: {}, walkAt: {}, s: null, sel: null, closet: null, ev: null, lastEv: 0, visit: null, view: 'home', shop: null, cat: 'food', sp: null, food: false, toy: false, busy: false, tick: 0, off: 0, tools: null };
  view.innerHTML = '<div class="pt-wrap"><div class="pt" id="pt"><p class="pt-hint">Đang tải…</p></div></div>';
  await loadCss();
  const root = $('#pt', view);
  root.onclick = onClick;
  try { await refresh(root); } catch (e) { root.innerHTML = `<p class="pt-hint">${esc(e.message)}</p><a class="pt-btn" href="#/games">Quay lại</a>`; return; }
  const wt = setInterval(() => { if (!document.body.contains(root)) clearInterval(wt); else walkTick(root); }, 1000);
  P.tick = setInterval(() => {
    if (!document.body.contains(root)) return clearInterval(P?.tick);
    for (const b of $$('[data-cd]', root)) {
      const left = Math.max(0, Number(b.dataset.cd) - Date.now());
      b.disabled = left > 0; const t = $('.pt-cd', b); if (t) t.textContent = left > 0 ? `${Math.ceil(left / 1000)}s` : '';
    }
  }, 1000);
  const again = () => { if (document.body.contains(root) && !document.hidden && !P.busy) refresh(root).catch(() => {}); };
  const iv = setInterval(() => { if (!document.body.contains(root)) clearInterval(iv); else again(); }, 60_000);
  document.addEventListener('visibilitychange', again);
}

async function refresh(root) {
  const s = await api('GET', '/pets');
  P.s = s; P.off = s.serverNow - Date.now();
  if (!s.pets.some((p) => p.id === P.sel)) P.sel = s.pets[0]?.id || null;
  if (S.me) S.me.balance = s.balance;
  playNewEvents(root, s.events);
  draw(root);
}

// chỗ đứng trong nhà: hai hàng trên sàn, xếp đều để các bạn không chồng lên nhau
const slotTop = (i) => (i % 2 ? 66 : 38);
const slotLeft = (i, n) => { const cols = Math.max(1, Math.ceil(n / 2)), col = Math.floor(i / 2); return n === 1 ? 50 : cols === 1 ? 32 + (i % 2) * 36 : 14 + col * (62 / (cols - 1)) + (i % 2 ? 6 : 0); };
function sceneHtml(pets, { sel, home, readonly = false, habs = null } = {}) {
  return `<div class="pt-scene t${home.tier}" aria-label="Trong nhà: ${esc(home.name)}">
    <span class="pt-deco d1" aria-hidden="true">🖼️</span><span class="pt-deco d2" aria-hidden="true">🪟</span>
    ${home.tier >= 2 ? '<span class="pt-deco d3" aria-hidden="true">🕰️</span>' : ''}${home.tier >= 3 ? '<span class="pt-deco d5" aria-hidden="true">🪴</span>' : ''}${home.tier >= 4 ? '<span class="pt-deco d6" aria-hidden="true">📚</span>' : ''}${home.tier >= 5 ? '<span class="pt-deco d4" aria-hidden="true">🪔</span>' : ''}
    ${pets.length ? pets.map((p, i) => `<button type="button" class="pt-pet w${(p.id % 4) + 1}${p.sprite ? ' has-spr' : ''}${p.anim ? ` has-anim${P.walk?.[p.id] ? ' walking' : (P.react?.petId === p.id || (P.ev && (P.ev.a === p.id || P.ev.b === p.id)) ? '' : ' still')}` : ''}${sel === p.id ? ' on' : ''}${P.react && P.react.petId === p.id ? ` r-${P.react.level}` : ''}${P.ev && (P.ev.a === p.id || P.ev.b === p.id) ? ` ev-${P.ev.type}` : ''}" style="left:${slotLeft(i, pets.length)}%;top:${slotTop(i) - (p.sprite ? 12 : 0)}%;--s:${p.sprite ? 1 : SCALE[p.stage] || 1}" data-pt="${readonly ? 'v-pick' : 'pick'}" data-pid="${p.id}" data-id="${p.id}" aria-label="${esc(p.name)}, ${esc(p.mood.label)}" aria-pressed="${sel === p.id}">
        <span class="pt-mood" aria-hidden="true">${P.react && P.react.petId === p.id ? LV[P.react.level] : P.ev && (P.ev.a === p.id || P.ev.b === p.id) ? P.ev.emoji : MOOD[p.mood.key] || '🙂'}</span>${face(p, 58, { scene: true })}${p.stage >= 3 ? '<span class="pt-crown" aria-hidden="true">👑</span>' : ''}<small>${esc(p.name)}</small></button>`).join('')
      : '<p class="pt-empty">Khu nhà đang trống. Hãy nhận nuôi một bạn nhé!</p>'}
  </div>`;
}

function petPanel(p) {
  const nxt = p.nextAt;
  const pct = nxt ? Math.min(100, Math.round(((p.intimacy - STAGE_FROM(p.stage)) / (nxt - STAGE_FROM(p.stage))) * 100)) : 100;
  const cdAt = (a) => Date.now() + p.cooldowns[a];
  return `<section class="pt-card" aria-label="Chăm ${esc(p.name)}">
    <div class="pt-head">${face(p, 52)}<div class="grow"><div class="pt-name"><b>${esc(p.name)}</b><button type="button" class="pt-mini" data-pt="rename" data-id="${p.id}" aria-label="Đổi tên">✏️</button></div>
      <div class="pt-sub">${esc(p.species)} · ${esc(p.stageName)} · ${MOOD[p.mood.key]} ${esc(p.mood.label)}</div></div></div>
    <div class="pt-int"><div class="row between"><span class="pt-sub">Thân thiết: <b>${fmt(p.intimacy)}</b></span><span class="pt-sub">${nxt ? `Còn ${fmt(nxt - p.intimacy)} để lên ${esc(STAGE_NAME(p.stage + 1))}` : 'Đã trưởng thành'}</span></div>
      ${bar(pct, '#7C3AED')}<span class="pt-sub">Hôm nay còn cộng được +${p.gainLeft}</span>
      ${p.losing ? `<span class="pt-warn" role="status">😢 ${esc(p.name)} đang buồn, Thân thiết đang giảm ${p.lossRate} mỗi giờ. Hãy chăm bạn ấy nhé!</span>` : ''}</div>
    <div class="pt-stats">${STAT.map(([k, n, c]) => `<div class="pt-stat"><span>${n}</span>${bar(p.stats[k], c)}<b>${p.stats[k]}</b></div>`).join('')}</div>
    <p class="pt-sub" style="margin:2px 0">${esc(p.trait)}</p>
    ${habLine(p)}
    <button type="button" class="pt-btn" data-pt="closet" data-id="${p.id}" aria-expanded="${P.closet === p.id}">👕 Trang phục${p.outfit || p.collar ? ` · ${[p.outfit?.name, p.collar?.name].filter(Boolean).map(esc).join(', ')}` : ''}</button>
    ${P.closet === p.id ? closetHtml(p) : ''}
    <div class="pt-acts">${ACT.map(([a, e, n]) => `<button type="button" class="pt-act" data-pt="${a}" data-id="${p.id}" data-cd="${cdAt(a)}" ${p.cooldowns[a] > 0 ? 'disabled' : ''}><span aria-hidden="true">${e}</span>${n}<em class="pt-cd">${p.cooldowns[a] > 0 ? `${Math.ceil(p.cooldowns[a] / 1000)}s` : ''}</em></button>`).join('')}</div>
    ${P.food ? `<div class="pt-foods" role="group" aria-label="Chọn món ăn">${P.s.foodsBySp[p.sp].map((f) => `<button type="button" class="pt-food${f.id === p.favFood ? ' fav' : ''}" data-pt="food" data-id="${p.id}" data-food="${f.id}"><span aria-hidden="true">${f.emoji}</span>${esc(f.name)}<small>${LV[p.tastes[f.id]] || ''}</small></button>`).join('')}
      ${P.s.shopFoods.filter((f) => f.sp === p.sp && (P.s.inv[`food:${f.id}`] || 0) > 0).map((f) => `<button type="button" class="pt-food prem" data-pt="food" data-id="${p.id}" data-food="${f.id}"><span aria-hidden="true">${f.emoji}</span>${esc(f.name)}<small>${LV[p.tastes[f.id]] || ''} x${P.s.inv[`food:${f.id}`]} · ${effText(f)}</small></button>`).join('')}
      <button type="button" class="pt-food" data-pt="shop-open" data-cat="food" data-sp="${p.sp}"><span aria-hidden="true">🛒</span>Mua thêm</button></div>` : ''}
    ${P.toy ? `<div class="pt-foods" role="group" aria-label="Chọn đồ chơi"><button type="button" class="pt-food" data-pt="toy" data-id="${p.id}" data-toy=""><span aria-hidden="true">🖐️</span>Chơi tay không</button>
      ${P.s.shopToys.filter((x) => x.sp === p.sp && (P.s.inv[`toy:${x.id}`] || 0) > 0).map((x) => `<button type="button" class="pt-food prem" data-pt="toy" data-id="${p.id}" data-toy="${x.id}"><span aria-hidden="true">${x.emoji}</span>${esc(x.name)}<small>${LV[p.tastes[x.id]] || ''} Vui +${x.fun}</small></button>`).join('')}</div>` : ''}
  </section>`;
}
const effText = (f) => [f.food ? `No +${f.food}` : '', f.fun ? `Vui +${f.fun}` : '', f.health ? `Khỏe +${f.health}` : ''].filter(Boolean).join(' ');
function habLine(p) {
  const h = P.s.habitat[p.homeType];
  return h.tier > 0 ? `<p class="pt-sub" style="margin:0">${h.emoji} ${esc(h.name)}: tụt chỉ số chậm hơn ${h.slow}%, ngủ hồi thêm</p>`
    : `<p class="pt-sub" style="margin:0">Chưa có ${HAB_NAME[p.homeType].toLowerCase()} cho ${esc(p.name)}. <button type="button" class="pt-mini" data-pt="shop-open" data-cat="home" data-sp="${p.sp}">Mua ở cửa hàng</button></p>`;
}
function closetHtml(p) {
  const mine = P.s.closet.filter((c) => c.sp === p.sp);
  const row = (slot, title) => {
    const list = mine.filter((c) => c.slot === slot), cur = p[slot]?.id;
    return `<div class="pt-foods" role="group" aria-label="${title}"><span class="pt-sub" style="width:100%">${title}</span>
      ${list.map((c) => `<button type="button" class="pt-food${c.id === cur ? ' fav' : ''}" data-pt="wear" data-id="${p.id}" data-slot="${slot}" data-item="${c.id}" aria-pressed="${c.id === cur}"><span aria-hidden="true">${c.emoji}</span>${esc(c.name)}</button>`).join('') || '<span class="pt-sub">Chưa có món nào.</span>'}
      ${cur ? `<button type="button" class="pt-food" data-pt="wear" data-id="${p.id}" data-slot="${slot}" data-item="">Bỏ ra</button>` : ''}
      <button type="button" class="pt-food" data-pt="shop-open" data-cat="${slot}" data-sp="${p.sp}"><span aria-hidden="true">🛒</span>Mua thêm</button></div>`;
  };
  return `<div class="pt-closet">${row('outfit', 'Quần áo')}${row('collar', 'Vòng cổ')}</div>`;
}
const STAGE_FROM = (n) => P.s.stages[n]?.from ?? 0;
const STAGE_NAME = (n) => P.s.stages[n]?.name ?? '';

function homeCard(s) {
  const h = s.home, nx = h.next;
  const full = h.used >= h.capacity;
  return `<section class="pt-card">
    <div class="row between"><div><b>${esc(h.name)}</b> <span class="pt-sub">· Bậc ${h.tier}/5</span></div><span class="pt-sub">Đang nuôi ${h.used}/${h.capacity}</span></div>
    <div class="pt-int"><div class="row between"><span class="pt-sub">Diện tích: <b>${h.area.used}/${h.area.total} ô</b> (nhà, lồng, bể đặt trong khu nhà)</span><button type="button" class="pt-mini" data-pt="shop-open" data-cat="home">Chỗ ở</button></div>${bar(Math.min(100, Math.round((h.area.used / h.area.total) * 100)), h.area.used > h.area.total ? '#EF4444' : '#14B8A6')}</div>
    ${!full ? '<button type="button" class="pt-btn primary block" data-pt="adopt">+ Nhận nuôi thêm một bạn</button>' : ''}
    ${nx ? `<div class="pt-next"><div><b>Mở rộng: ${esc(nx.name)}</b><div class="pt-sub">Nuôi được ${nx.capacity} bạn · diện tích ${h.area.total} → ${nx.area} ô${nx.minLevel ? ` · cần cấp ${esc(nx.minLevelName)}` : ''}</div></div>
      <button type="button" class="pt-btn ${nx.levelOk ? '' : 'ghost'}" data-pt="expand" ${nx.levelOk ? '' : 'aria-disabled="true"'}>${nx.levelOk ? `${coinIcon(16)} ${fmt(nx.price)}` : 'Chưa đủ cấp'}</button></div>` : '<p class="pt-sub" style="margin:0">Khu nhà đã ở bậc cao nhất.</p>'}
  </section>`;
}

function eventsHtml(s) {
  if (s.pets.length < 2) return `<section class="pt-card"><b>Các bạn chơi với nhau</b><p class="pt-sub" style="margin:0">Khi có từ 2 bạn trở lên, các bạn sẽ tự chơi, ôm, ngủ chung, chải lông cho nhau. Hãy mở rộng khu nhà để nuôi thêm bạn nhé!</p></section>`;
  const ago = (at) => { const m = Math.max(0, Math.round((Date.now() + P.off - at) / 60000)); return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : `${Math.round(m / 60)} giờ trước`; };
  return `<section class="pt-card"><b>Các bạn chơi với nhau</b><p class="pt-sub" style="margin:0">Mỗi ${s.socialEveryMin} phút các bạn tự tương tác (kể cả khi bạn không mở app), mỗi bạn +1 Thân thiết.</p>
    <ul class="pt-log">${s.events.map((e) => `<li><span aria-hidden="true">${e.emoji}</span><span class="grow">${esc(e.text)}<small>${esc(e.label)} · ${ago(e.at)}</small></span></li>`).join('') || '<li class="pt-sub">Chưa có tương tác nào, lát nữa quay lại xem nhé.</li>'}</ul></section>`;
}
// sự kiện mới đến khi đang mở trang: hai bạn làm hoạt cảnh và có thông báo
function playNewEvents(root, evs) {
  const fresh = evs.filter((e) => e.id > P.lastEv).reverse();
  if (P.loaded && fresh.length) {
    const e = fresh[fresh.length - 1];
    P.ev = e; clearTimeout(P.evT); P.evT = setTimeout(() => { P.ev = null; if (P.view === 'home' && !P.visit && document.body.contains(root)) draw(root); }, 5000);
    toast(`${e.emoji} ${e.text}`, 4500);
  }
  P.lastEv = Math.max(P.lastEv, ...evs.map((e) => e.id), 0);
  P.loaded = true;
}
function draw(root) {
  const s = P.s;
  if (P.view === 'shop') return drawShop(root);
  if (P.visit) return drawVisit(root);
  const sel = s.pets.find((p) => p.id === P.sel);
  root.innerHTML = `<header class="pt-top"><a class="pt-back" href="#/games" aria-label="Quay lại mục Game">‹</a><h1>Nuôi thú${s.beta ? ' <span class="pt-beta">Thử nghiệm</span>' : ''}</h1><span class="pt-coin" aria-label="Số dư">${coinIcon(18)} ${fmt(s.balance)}</span></header>
    <button type="button" class="pt-btn block" data-pt="shop-open" data-cat="food">🛒 Cửa hàng vật phẩm</button>
    ${sceneHtml(s.pets, { sel: P.sel, home: s.home, habs: s.habitat })}
    ${sel ? petPanel(sel) : ''}
    ${homeCard(s)}
    ${eventsHtml(s)}
    <section class="pt-card"><b>Thăm nhà bạn bè</b><div id="pt-friends" class="pt-sub">Đang tải…</div></section>
    ${S.me?.role === 'admin' ? adminHtml() : ''}
    <p class="pt-foot">Chăm sóc miễn phí, không kiếm xu. Thân thiết tăng khi bạn chăm đúng lúc, mỗi bạn tối đa +${s.dailyCap} mỗi ngày. Nếu để bạn ấy buồn (có chỉ số dưới 20) thì Thân thiết bị trừ theo giờ, nhưng không tụt khỏi giai đoạn đã đạt và thú không bao giờ mất.</p>`;
  mountAnims(root);
  loadFriends(root);
}
async function loadFriends(root) {
  const el = $('#pt-friends', root);
  try {
    const { friends } = await api('GET', '/pets/friends');
    if (!document.body.contains(el)) return;
    el.innerHTML = friends.length ? `<div class="pt-fr">${friends.map((f) => `<button type="button" class="pt-btn" data-pt="visit" data-id="${f.id}">${esc(f.displayName)} <small>${f.count} bạn</small></button>`).join('')}</div>` : 'Chưa có bạn bè nào nuôi thú.';
  } catch { if (el) el.textContent = 'Chưa tải được.'; }
}

// ---- cửa hàng ---------------------------------------------------------------------------------------------------------------
const CATS = [['food', 'Đồ ăn'], ['toy', 'Đồ chơi'], ['outfit', 'Quần áo'], ['collar', 'Vòng cổ'], ['home', 'Chỗ ở']];
function drawShop(root) {
  const d = P.shop;
  if (!d.species.some((x) => x.id === P.sp)) P.sp = (d.species.find((x) => x.mine) || d.species[0]).id;
  const sp = d.species.find((x) => x.id === P.sp), cat = CATS.some((c) => c[0] === P.cat) ? P.cat : 'food';
  const hint = cat === 'food' ? `Đồ ăn dành cho ${sp.name.toLowerCase()}, dùng một lần. Tăng nhiều chỉ số hơn món miễn phí và cộng thêm Thân thiết.`
    : cat === 'outfit' || cat === 'collar' ? `${cat === 'outfit' ? 'Quần áo' : 'Vòng cổ'} dành cho ${sp.name.toLowerCase()}, mua một lần dùng mãi. Chỉ để làm đẹp: vào mục Trang phục của từng bạn để mặc.`
    : cat === 'toy' ? `Đồ chơi dành cho ${sp.name.toLowerCase()}, mua một lần dùng mãi. Chơi với đồ chơi thì Vui tăng nhiều hơn và thêm Thân thiết.`
      : `${sp.home.name} dành cho ${sp.pets.join(', ')}. Đặt trong khu nhà và chiếm số ô bằng bậc (bậc 1 = 1 ô, bậc 2 = 2 ô, bậc 3 = 3 ô). Bậc càng cao thì thú tụt chỉ số càng chậm và ngủ hồi nhiều hơn. Nâng bậc được trừ giá món cũ. Hết diện tích thì nâng cấp khu nhà.`;
  const items = cat === 'home' ? sp.home.items : sp[cat];
  root.innerHTML = `<header class="pt-top"><button type="button" class="pt-back" data-pt="shop-close" aria-label="Quay lại">‹</button><h1>Cửa hàng</h1><span class="pt-coin" aria-label="Số dư">${coinIcon(18)} ${fmt(d.balance)}</span></header>
    <div class="pt-tabs" role="tablist" aria-label="Loài thú">${d.species.map((x) => `<button type="button" role="tab" aria-selected="${x.id === sp.id}" class="pt-tab" data-pt="shop-sp" data-sp="${x.id}">${esc(x.name)}${x.mine ? '' : ' <small>(chưa nuôi)</small>'}</button>`).join('')}</div>
    <div class="pt-tabs" role="tablist" aria-label="Loại vật phẩm">${CATS.map(([id, name]) => `<button type="button" role="tab" aria-selected="${id === cat}" class="pt-tab sub" data-pt="shop-cat" data-cat="${id}">${id === 'home' ? esc(sp.home.name) : name}</button>`).join('')}</div>
    <p class="pt-sub">${esc(hint)}</p>
    ${cat === 'home' ? `<div class="pt-int"><div class="row between"><span class="pt-sub">Diện tích khu nhà: <b>${d.area.used}/${d.area.total} ô</b></span></div>${bar(Math.min(100, Math.round((d.area.used / d.area.total) * 100)), '#14B8A6')}</div>` : ''}
    <div class="pt-items">${items.map((it) => {
      const eff = it.tier ? `Tụt chỉ số chậm hơn ${Math.round((1 - d.habMult[it.tier]) * 100)}% · ngủ hồi +${d.sleepBonus * it.tier} Khỏe` : (cat === 'outfit' || cat === 'collar') ? 'Chỉ để làm đẹp' : [effText(it), it.int ? `Thân thiết +${it.int}` : ''].filter(Boolean).join(' · ');
      const act = cat === 'food'
        ? `<div class="pt-fr"><button type="button" class="pt-btn" data-pt="buy" data-item="food:${it.id}" data-qty="1">${coinIcon(14)} ${fmt(it.price)}</button><button type="button" class="pt-btn" data-pt="buy" data-item="food:${it.id}" data-qty="5">x5 · ${fmt(it.price * 5)}</button></div>`
        : cat === 'outfit' || cat === 'collar' ? (it.owned ? '<span class="pt-own">Đã có</span>' : `<button type="button" class="pt-btn" data-pt="buy" data-item="${cat}:${it.id}">${coinIcon(14)} ${fmt(it.price)}</button>`)
        : cat === 'home' ? (it.current ? '<span class="pt-own">Đang dùng</span>' :  it.worse ? '<span class="pt-own off">Đã có bậc cao hơn</span>' : !it.fits ? `<button type="button" class="pt-btn ghost" data-pt="no-room" data-need="${it.size}">Cần thêm diện tích</button>` : `<button type="button" class="pt-btn" data-pt="buy" data-item="${sp.home.type}:${it.id}">${coinIcon(14)} ${fmt(it.cost)}${it.cost !== it.price ? ` <small>(giá ${fmt(it.price)})</small>` : ''}</button>`)
        : it.owned ? '<span class="pt-own">Đã có</span>' : `<button type="button" class="pt-btn" data-pt="buy" data-item="toy:${it.id}">${coinIcon(14)} ${fmt(it.price)}</button>`;
      return `<div class="pt-item"><span class="pt-ie" aria-hidden="true">${it.emoji}</span><div class="grow"><b>${esc(it.name)}</b>${cat === 'food' && it.qty ? ` <span class="pt-own">Đang có ${it.qty}</span>` : ''}<div class="pt-sub">${esc(eff)}</div>${it.react ? `<div class="pt-sub pt-react">${it.react.map((x) => `${esc(x.name)} ${LV[x.level]}`).join(' · ')}</div>` : ''}</div>${act}</div>`;
    }).join('')}</div>`;
}
async function openShop(root, cat, sp) {
  P.shop = await api('GET', '/pets/shop'); P.view = 'shop'; if (cat) P.cat = cat; if (sp) P.sp = sp; drawShop(root);
}

// ---- hoạt hình sprite (idle / walk / happy) ----------------------------------------------------------------------------------------
// trạng thái đang hiển thị của từng bạn: vui (tâm trạng tốt hoặc vừa được thích) → happy; đang đi dạo → walk; còn lại → idle
function animMode(id, scene) {
  const p = P.s.pets.find((x) => x.id === id);
  if (!p) return 'idle';
  if (P.act && P.act.petId === id && Date.now() < P.act.until && p.anim?.[P.act.mode]) return P.act.mode; // vừa cho ăn / chơi / tắm / ngủ: diễn hoạt cảnh tương ứng
  if (P.react && P.react.petId === id && ['love', 'like'].includes(P.react.level)) return 'happy';
  const low = Object.values(p.stats).filter((v) => v < 25).length; // nhiều chỉ số thấp cùng lúc: buồn vì bị bỏ mặc
  if (low >= 2 && p.anim?.sad) return 'sad';
  if (['hungry', 'bored', 'dirty', 'sleepy'].includes(p.mood.key) && p.anim?.[p.mood.key]) return p.mood.key; // đói, chán, bẩn, buồn ngủ
  if ((P.burst?.[id] || 0) > Date.now()) return 'happy'; // vui thì chỉ thỉnh thoảng mới xòe cánh nhảy một lúc, không lặp liên tục
  return scene && P.walk[id] ? 'walk' : 'idle';
}
function mountAnims(root) {
  for (const el of $$('.pt-spr[data-pet]', root)) {
    const id = Number(el.dataset.pet), p = P.s.pets.find((x) => x.id === id), img = el.querySelector('img');
    if (!p?.anim || !img) continue;
    for (const a of Object.values(p.anim)) for (const u of a.urls) { const pre = new Image(); pre.src = u; } // tải sẵn để không nháy
    if (reducedMotion()) continue; // giảm chuyển động: giữ khung đầu của idle
    let i = 0, last = '';
    const step = () => {
      if (!el.isConnected || !P) return;
      const mode = animMode(id, el.dataset.scene === '1'), a = p.anim[mode] || p.anim.idle;
      if (mode !== last) { last = mode; i = 0; el._shut = false; el._until = 0; }
      if (a.blink) { // idle chỉ nháy mắt: mở mắt lâu (2,5 đến 6 giây), nhắm rất nhanh (~0,15 giây), thân không đổi
        // kiểm tra mỗi 60 ms (không hẹn giờ dài) để đổi sang walk/happy... ngay khi trạng thái đổi, không bị trễ vài giây
        const t = Date.now();
        if (!el._until) { el._shut = false; img.src = a.urls[0]; el._until = t + 2500 + Math.random() * 3500; }
        else if (t >= el._until) { el._shut = !el._shut; img.src = a.urls[el._shut ? 1 : 0]; el._until = t + (el._shut ? 150 : 2500 + Math.random() * 3500); }
        el._t = setTimeout(step, 60);
        return;
      }
      img.src = a.urls[i % a.urls.length]; i++;
      el._t = setTimeout(step, 1000 / a.fps);
    };
    clearTimeout(el._t); step();
  }
}
// thỉnh thoảng các bạn có hoạt hình đứng yên rồi đi dạo một lúc (chỉ ở cảnh khu nhà); đang đi dạo thì mới trôi qua lại
function walkTick(root) {
  if (!P?.s || P.view !== 'home' || P.visit) return;
  const t = Date.now();
  for (const p of P.s.pets) {
    if (!p.anim) continue;
    // đang vui: thỉnh thoảng (cách nhau 20 đến 45 giây) xòe cánh nhảy khoảng 2,4 giây rồi lại đứng yên hoặc đi dạo
    const nb = (P.nextBurst ||= {});
    if (p.mood.key === 'happy' && !(P.burst?.[p.id] > t)) {
      if (!nb[p.id]) nb[p.id] = t + 6000 + Math.random() * 10000;
      else if (t >= nb[p.id]) { (P.burst ||= {})[p.id] = t + 2400; nb[p.id] = t + 2400 + 20000 + Math.random() * 25000; }
    }
    const w = (P.walkAt ||= {})[p.id] || { on: false, until: t + 2000 + Math.random() * 4000 };
    if (t >= w.until) { w.on = !w.on; w.until = t + (w.on ? 3000 + Math.random() * 2500 : 4000 + Math.random() * 4000); }
    if (!['idle', 'walk'].includes(animMode(p.id, false)) && w.on) { w.on = false; w.until = t + 3000; } // đang đói, buồn, vui...: đứng tại chỗ, không đi dạo
    P.walkAt[p.id] = w; (P.walk ||= {})[p.id] = w.on;
    const b = $(`.pt-pet[data-pid="${p.id}"]`, root);
    if (b && p.anim) { const busy = P.react?.petId === p.id || (P.ev && (P.ev.a === p.id || P.ev.b === p.id)); b.classList.toggle('walking', w.on); b.classList.toggle('still', !w.on && !busy); }
  }
}
// ---- thăm nhà ----------------------------------------------------------------------------------------------------------
function drawVisit(root) {
  const v = P.visit;
  root.innerHTML = `<header class="pt-top"><button type="button" class="pt-back" data-pt="v-back" aria-label="Quay lại">‹</button><h1>Nhà của ${esc(v.owner.displayName)}</h1><span></span></header>
    ${sceneHtml(v.pets, { sel: P.vsel, home: v.home, readonly: true })}
    <section class="pt-card"><p class="pt-sub" style="margin:0">${esc(v.home.name)} · ${v.pets.length} bạn. Chọn một bạn rồi vuốt ve để tặng chút Thân thiết (mỗi nhà một lần mỗi ngày).</p>
      ${P.vsel ? `<button type="button" class="pt-btn primary block" data-pt="pat" ${v.patted ? 'disabled' : ''}>${v.patted ? 'Hôm nay bạn đã vuốt ve rồi' : '🤲 Vuốt ve'}</button>` : ''}</section>`;
}

// ---- Admin ----------------------------------------------------------------------------------------------------------------
function adminHtml() {
  return `<details class="pt-card" id="pt-admin"><summary><b>Quản trị: thử nghiệm</b></summary><div id="pt-admin-body" class="pt-sub">Đang tải…</div></details>`;
}
async function loadAdmin(root) {
  const body = $('#pt-admin-body', root);
  if (!body) return;
  const d = await api('GET', '/admin/pets/settings');
  P.tools = d;
  body.innerHTML = `<div class="pt-col">
    <label class="pt-sub">Ai chơi được<select id="pt-mode" class="pt-in"><option value="admin" ${d.mode === 'admin' ? 'selected' : ''}>Chỉ admin (thử nghiệm)</option><option value="all" ${d.mode === 'all' ? 'selected' : ''}>Mọi người</option></select></label>
    <div class="pt-sub">Giá mở rộng (xu tím) lên bậc 2, 3, 4, 5:</div>
    <div class="pt-prices">${d.tiers.slice(1).map((t) => `<input class="pt-in" inputmode="numeric" data-price value="${t.price}" aria-label="Giá lên ${esc(t.name)}">`).join('')}</div>
    <button type="button" class="pt-btn" data-pt="a-save">Lưu cài đặt</button>
    <div class="pt-sub">Công cụ thử (chỉ tác động tài khoản của bạn):</div>
    <div class="pt-fr"><button type="button" class="pt-btn" data-pt="a-skip" data-h="6">Tua +6 giờ</button><button type="button" class="pt-btn" data-pt="a-skip" data-h="24">Tua +24 giờ</button><button type="button" class="pt-btn" data-pt="a-social">Tạo tương tác ngay</button><button type="button" class="pt-btn" data-pt="a-coins">+1.000 xu thử</button><button type="button" class="pt-btn danger" data-pt="a-reset">Làm lại từ đầu</button></div>
    <div class="pt-sub">Ảnh các bạn thú (đang dùng hình tạm nếu chưa có ảnh):</div>
    <div class="pt-fr">${d.kinds.map((k) => `<div class="pt-kimg">${face({ ...k, color: k.color }, 48)}<b>${esc(k.name)}</b><button type="button" class="pt-mini" data-pt="a-img" data-id="${esc(k.id)}">${k.imageUrl ? 'Đổi' : 'Chọn'}</button>${k.imageUrl ? `<button type="button" class="pt-mini" data-pt="a-imgdel" data-id="${esc(k.id)}">Bỏ</button>` : ''}</div>`).join('')}</div>
    <input type="file" id="pt-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden></div>`;
}
async function squareDataUrl(file) {
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) throw new Error('Chỉ nhận ảnh PNG, JPG, GIF hoặc WebP');
  const bmp = await createImageBitmap(file), side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
  x.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  return c.toDataURL('image/jpeg', 0.88);
}

// ---- thao tác ---------------------------------------------------------------------------------------------------------------
async function onClick(e) {
  const t = e.target.closest('[data-pt]'); if (!t || t.disabled) return;
  const root = e.currentTarget, a = t.dataset.pt, id = Number(t.dataset.id);
  if (P.busy) return;
  const run = async (fn) => { P.busy = true; try { await fn(); } catch (er) { fail(er); } finally { P.busy = false; } };
  if (a === 'shop-open') return run(async () => { await openShop(root, t.dataset.cat, t.dataset.sp || P.s.pets.find((q) => q.id === P.sel)?.sp); });
  if (a === 'no-room') return toast(`Khu nhà chưa đủ diện tích (cần ${t.dataset.need} ô). Hãy nâng cấp khu nhà để có thêm diện tích.`, 4500);
  if (a === 'shop-sp') { P.sp = t.dataset.sp; return drawShop(root); }
  if (a === 'shop-close') { P.view = 'home'; return refresh(root); }
  if (a === 'shop-cat') { P.cat = t.dataset.cat; return drawShop(root); }
  if (a === 'buy') return run(async () => {
    P.shop = await api('POST', '/pets/shop/buy', { item: t.dataset.item, qty: Number(t.dataset.qty) || 1 });
    drawShop(root); toast('Đã mua!', 1800);
  });
  if (a === 'pick') { P.sel = id; P.food = false; return draw(root); }
  if (a === 'v-pick') { P.vsel = id; return drawVisit(root); }
  if (a === 'closet') { P.closet = P.closet === id ? null : id; return draw(root); }
  if (a === 'wear') return run(async () => { P.s = await api('POST', `/pets/${id}/wear`, { slot: t.dataset.slot, item: t.dataset.item || null }); draw(root); toast(t.dataset.item ? 'Đã mặc cho bạn ấy!' : 'Đã bỏ ra', 1800); });
  if (a === 'feed') { P.food = !P.food; P.toy = false; return draw(root); }
  if (a === 'play' && P.s.shopToys.some((x) => x.sp === P.s.pets.find((q) => q.id === id)?.sp && P.s.inv[`toy:${x.id}`] > 0)) { P.toy = !P.toy; P.food = false; return draw(root); } // có đồ chơi: chọn đồ chơi trước
  if (['play', 'wash', 'sleep', 'food', 'toy'].includes(a)) {
    return run(async () => {
      const r = await api('POST', `/pets/${id}/${a === 'food' ? 'feed' : a === 'toy' ? 'play' : a}`, a === 'food' ? { food: t.dataset.food } : a === 'toy' ? { toy: t.dataset.toy || undefined } : {});
      P.food = false; P.toy = false; if (r.inv) P.s.inv = r.inv;
      const i = P.s.pets.findIndex((p) => p.id === id); if (i >= 0) P.s.pets[i] = r.pet;
      const actMode = { feed: 'eat', food: 'eat', toy: 'play', play: 'play', wash: 'wash', sleep: 'sleep' }[a];
      if (actMode) P.act = { petId: id, mode: actMode, until: Date.now() + (actMode === 'sleep' ? 4500 : 3200) };
      if (r.reaction) { P.react = { petId: id, level: r.reaction.level }; clearTimeout(P.reactT); P.reactT = setTimeout(() => { P.react = null; if (P.view === 'home' && !P.visit && document.body.contains(root)) draw(root); }, 3500); }
      draw(root);
      if (r.reaction) toast(`${r.reaction.emoji} ${r.reaction.text}`, 4200);
      toast(r.lost ? `${r.pet.name} đã bị trừ ${r.lost} Thân thiết vì bị bỏ mặc. ${r.gained ? `Chăm xong +${r.gained}` : ''}` : r.levelUp ? `${r.pet.name} đã lớn thành ${r.levelUp}! 🎉` : r.gained ? `${r.liked ? 'Bạn ấy rất thích! ' : ''}+${r.gained} Thân thiết` : 'Hôm nay đã đủ điểm Thân thiết, bạn ấy vẫn rất vui', 2500);
    });
  }
  if (a === 'rename') {
    const p = P.s.pets.find((x) => x.id === id);
    let name = p?.name || '', err = '';
    for (;;) {
      const r = await ask({ title: 'Đổi tên', text: err || 'Tên phải riêng biệt và không trùng tên mặc định.', ok: 'Lưu', fields: [{ name: 'name', label: 'Tên mới', value: name, required: true }] });
      if (!r) return;
      name = r.name.trim();
      try { await api('PATCH', `/pets/${id}`, { name }); await refresh(root); return toast('Đã đổi tên'); } catch (er) { err = er.message; }
    }
  }
  if (a === 'adopt') return openAdopt(root);
  if (a === 'adopt-do') {
    const kind = P.s.kinds.find((k) => k.id === t.dataset.kind); closeModal();
    let name = '', err = '';
    for (;;) { // hỏi tên cho tới khi hợp lệ hoặc người dùng hủy
      const r = await ask({ title: `Đặt tên cho bạn ${kind.species.toLowerCase()} này`, text: err || `Bạn nhận nuôi ${kind.name}. Tên phải riêng biệt, không trùng tên bạn thú khác và không dùng tên mặc định (${P.s.kinds.map((k) => k.name).join(', ')}).`, ok: 'Nhận nuôi', fields: [{ name: 'name', label: 'Tên của bạn ấy', value: name, placeholder: 'Ví dụ: Bông, Xíu Mại', required: true }] });
      if (!r) return;
      name = r.name.trim();
      try { P.s = await api('POST', '/pets/adopt', { kind: kind.id, name }); P.sel = P.s.pets[P.s.pets.length - 1]?.id; toast(`Đã nhận nuôi ${name}!`); return draw(root); } catch (er) { err = er.message; }
    }
  }
  if (a === 'expand') {
    const nx = P.s.home.next;
    if (!nx.levelOk) return toast(`Cần đạt cấp ${nx.minLevelName} để mở rộng lên ${nx.name}`);
    if (!(await confirmBox(`Mở rộng lên ${nx.name}?`, `Tốn ${fmt(nx.price)} xu tím, nuôi được ${nx.capacity} bạn.`, 'Mở rộng'))) return;
    return run(async () => { P.s = await api('POST', '/pets/home/expand'); toast('Đã mở rộng khu nhà!'); draw(root); });
  }
  if (a === 'visit') return run(async () => { P.visit = await api('GET', `/pets/visit/${id}`); P.vsel = null; drawVisit(root); });
  if (a === 'v-back') { P.visit = null; return draw(root); }
  if (a === 'pat') return run(async () => {
    const r = await api('POST', `/pets/visit/${P.visit.owner.id}/pat`, { petId: P.vsel });
    P.visit.patted = true; toast(`Bạn đã vuốt ve ${r.petName}`, 2500); drawVisit(root);
  });
  // Admin
  if (a === 'a-save') return run(async () => {
    const prices = $$('[data-price]', root).map((i) => Number(i.value));
    await api('PUT', '/admin/pets/settings', { mode: $('#pt-mode', root).value, prices }); toast('Đã lưu'); await refresh(root);
  });
  if (a === 'a-skip') return run(async () => { await api('POST', '/admin/pets/skip', { hours: Number(t.dataset.h) }); await refresh(root); toast('Đã tua thời gian'); });
  if (a === 'a-social') return run(async () => { const r = await api('POST', '/admin/pets/social', { n: 1 }); if (!r.events) toast('Cần từ 2 bạn thú trở lên'); await refresh(root); });
  if (a === 'a-coins') return run(async () => { const r = await api('POST', '/admin/pets/coins', { amount: 1000 }); toast(`Số dư: ${fmt(r.balance)} xu`); await refresh(root); });
  if (a === 'a-reset') return run(async () => { if (!(await confirmBox('Làm lại từ đầu?', 'Xóa toàn bộ thú và khu nhà của bạn (không hoàn xu đã mua mở rộng).', 'Xóa', true))) return; await api('POST', '/admin/pets/reset'); await refresh(root); });
  if (a === 'a-img') {
    const input = $('#pt-file', root); input.value = '';
    input.onchange = () => run(async () => { const f = input.files[0]; if (!f) return; const { url } = await api('POST', '/upload', { dataUrl: await squareDataUrl(f) }); await api('PATCH', `/admin/pets/kinds/${encodeURIComponent(t.dataset.id)}`, { imageUrl: url }); await refresh(root); toast('Đã đổi ảnh'); });
    return input.click();
  }
  if (a === 'a-imgdel') return run(async () => { await api('PATCH', `/admin/pets/kinds/${encodeURIComponent(t.dataset.id)}`, { imageUrl: null }); await refresh(root); });
}
function openAdopt(root) {
  const free = P.s.kinds.filter((k) => !k.adopted);
  openModal(`<h2>Nhận nuôi một bạn</h2><div class="pt-adopt">${free.map((k) => `<button type="button" class="pt-adopt-i" data-pt="adopt-do" data-kind="${esc(k.id)}">${face(k, 52)}<span class="grow"><b>${esc(k.name)}</b> <small>${esc(k.species)}</small><span class="pt-sub">${esc(k.trait)}</span></span></button>`).join('') || '<p class="pt-sub">Bạn đã nuôi đủ cả 6 bạn.</p>'}</div>
    <div class="btns"><button class="btn primary" data-close>Đóng</button></div>`);
  $('#modal [data-close]').onclick = closeModal;
  $('#modal').addEventListener('click', (ev) => { const b = ev.target.closest('[data-pt="adopt-do"]'); if (b) onClick({ target: b, currentTarget: root }); });
}
// mở khung Admin khi bấm vào tiêu đề (tải dữ liệu một lần)
document.addEventListener('toggle', (ev) => { const d = ev.target; if (d?.id === 'pt-admin' && d.open) loadAdmin(d.closest('#pt')).catch(fail); }, true);
