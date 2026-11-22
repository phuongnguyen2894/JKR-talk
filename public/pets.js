// Game "Nuôi thú": khu nhà chung cho các bạn thú. Máy chủ quyết định mọi thay đổi; máy khách chỉ hiển thị và gửi thao tác.
import { $, $$, esc, S, api, toast, fail, go, coinIcon, openModal, closeModal, confirmBox } from './core.js';

let P = null;
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

// hình tạm: ảnh nếu Admin đã tải, không thì chữ viết tắt trên nền màu kèm biểu tượng loài
function face(p, size = 64) {
  const inner = p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" draggable="false">` : `<b>${esc(p.initials)}</b>`;
  return `<span class="pt-face" style="width:${size}px;height:${size}px;background:${esc(p.color)};font-size:${Math.round(size * 0.34)}px">${inner}<i class="pt-sp" aria-hidden="true">${p.emoji}</i></span>`;
}
const bar = (v, c) => `<span class="pt-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"><i style="width:${v}%;background:${c}"></i></span>`;

export async function renderPets(view, arg) {
  P = { s: null, sel: null, visit: null, view: 'home', shop: null, cat: 'food', food: false, toy: false, busy: false, tick: 0, off: 0, tools: null };
  view.innerHTML = '<div class="pt-wrap"><div class="pt" id="pt"><p class="pt-hint">Đang tải…</p></div></div>';
  await loadCss();
  const root = $('#pt', view);
  root.onclick = onClick;
  try { await refresh(root); } catch (e) { root.innerHTML = `<p class="pt-hint">${esc(e.message)}</p><a class="pt-btn" href="#/games">Quay lại</a>`; return; }
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
  draw(root);
}

function sceneHtml(pets, { sel, home, readonly = false, habs = null } = {}) {
  return `<div class="pt-scene t${home.tier}" aria-label="Khu nhà ${esc(home.name)}">
    <span class="pt-deco d1" aria-hidden="true">${home.tier >= 2 ? '🌳' : '🌿'}</span><span class="pt-deco d2" aria-hidden="true">${home.tier >= 3 ? '🏡' : '🏠'}</span>
    ${habs ? Object.entries(habs).filter(([ty, h]) => h.tier > 0 && pets.some((p) => p.homeType === ty)).map(([, h], i) => `<span class="pt-hab h${i}" title="${esc(h.name)}" aria-hidden="true">${h.emoji}</span>`).join('') : ''}
    ${home.tier >= 4 ? '<span class="pt-deco d3" aria-hidden="true">⛲</span>' : ''}${home.tier >= 5 ? '<span class="pt-deco d4" aria-hidden="true">🎠</span>' : ''}
    ${pets.length ? pets.map((p, i) => `<button type="button" class="pt-pet w${(p.id % 4) + 1}${sel === p.id ? ' on' : ''}" style="left:${8 + ((i * 29 + 11) % 62)}%;top:${34 + ((i * 17) % 38)}%;--s:${SCALE[p.stage] || 1}" data-pt="${readonly ? 'v-pick' : 'pick'}" data-id="${p.id}" aria-label="${esc(p.name)}, ${esc(p.mood.label)}" aria-pressed="${sel === p.id}">
        <span class="pt-mood" aria-hidden="true">${MOOD[p.mood.key] || '🙂'}</span>${face(p, 58)}${p.stage >= 3 ? '<span class="pt-crown" aria-hidden="true">👑</span>' : ''}<small>${esc(p.name)}</small></button>`).join('')
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
    <div class="pt-acts">${ACT.map(([a, e, n]) => `<button type="button" class="pt-act" data-pt="${a}" data-id="${p.id}" data-cd="${cdAt(a)}" ${p.cooldowns[a] > 0 ? 'disabled' : ''}><span aria-hidden="true">${e}</span>${n}<em class="pt-cd">${p.cooldowns[a] > 0 ? `${Math.ceil(p.cooldowns[a] / 1000)}s` : ''}</em></button>`).join('')}</div>
    ${P.food ? `<div class="pt-foods" role="group" aria-label="Chọn món ăn">${P.s.foods.map((f) => `<button type="button" class="pt-food${f.id === p.favFood ? ' fav' : ''}" data-pt="food" data-id="${p.id}" data-food="${f.id}"><span aria-hidden="true">${f.emoji}</span>${esc(f.name)}${f.id === p.favFood ? '<small>Thích</small>' : ''}</button>`).join('')}
      ${P.s.shopFoods.filter((f) => (P.s.inv[`food:${f.id}`] || 0) > 0).map((f) => `<button type="button" class="pt-food prem" data-pt="food" data-id="${p.id}" data-food="${f.id}"><span aria-hidden="true">${f.emoji}</span>${esc(f.name)}<small>x${P.s.inv[`food:${f.id}`]} · ${effText(f)}</small></button>`).join('')}
      <button type="button" class="pt-food" data-pt="shop-open" data-cat="food"><span aria-hidden="true">🛒</span>Mua thêm</button></div>` : ''}
    ${P.toy ? `<div class="pt-foods" role="group" aria-label="Chọn đồ chơi"><button type="button" class="pt-food" data-pt="toy" data-id="${p.id}" data-toy=""><span aria-hidden="true">🖐️</span>Chơi tay không</button>
      ${P.s.shopToys.filter((x) => (P.s.inv[`toy:${x.id}`] || 0) > 0).map((x) => `<button type="button" class="pt-food prem" data-pt="toy" data-id="${p.id}" data-toy="${x.id}"><span aria-hidden="true">${x.emoji}</span>${esc(x.name)}<small>Vui +${x.fun}</small></button>`).join('')}</div>` : ''}
  </section>`;
}
const effText = (f) => [f.food ? `No +${f.food}` : '', f.fun ? `Vui +${f.fun}` : '', f.health ? `Khỏe +${f.health}` : ''].filter(Boolean).join(' ');
function habLine(p) {
  const h = P.s.habitat[p.homeType];
  return h.tier > 0 ? `<p class="pt-sub" style="margin:0">${h.emoji} ${esc(h.name)}: tụt chỉ số chậm hơn ${h.slow}%, ngủ hồi thêm</p>`
    : `<p class="pt-sub" style="margin:0">Chưa có ${HAB_NAME[p.homeType].toLowerCase()} cho ${esc(p.name)}. <button type="button" class="pt-mini" data-pt="shop-open" data-cat="${p.homeType}">Mua ở cửa hàng</button></p>`;
}
const STAGE_FROM = (n) => P.s.stages[n]?.from ?? 0;
const STAGE_NAME = (n) => P.s.stages[n]?.name ?? '';

function homeCard(s) {
  const h = s.home, nx = h.next;
  const full = h.used >= h.capacity;
  return `<section class="pt-card">
    <div class="row between"><div><b>${esc(h.name)}</b> <span class="pt-sub">· Bậc ${h.tier}/5</span></div><span class="pt-sub">Đang nuôi ${h.used}/${h.capacity}</span></div>
    ${!full ? '<button type="button" class="pt-btn primary block" data-pt="adopt">+ Nhận nuôi thêm một bạn</button>' : ''}
    ${nx ? `<div class="pt-next"><div><b>Mở rộng: ${esc(nx.name)}</b><div class="pt-sub">Nuôi được ${nx.capacity} bạn${nx.minLevel ? ` · cần cấp ${esc(nx.minLevelName)}` : ''}</div></div>
      <button type="button" class="pt-btn ${nx.levelOk ? '' : 'ghost'}" data-pt="expand" ${nx.levelOk ? '' : 'aria-disabled="true"'}>${nx.levelOk ? `${coinIcon(16)} ${fmt(nx.price)}` : 'Chưa đủ cấp'}</button></div>` : '<p class="pt-sub" style="margin:0">Khu nhà đã ở bậc cao nhất.</p>'}
  </section>`;
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
    <section class="pt-card"><b>Thăm nhà bạn bè</b><div id="pt-friends" class="pt-sub">Đang tải…</div></section>
    ${S.me?.role === 'admin' ? adminHtml() : ''}
    <p class="pt-foot">Chăm sóc miễn phí, không kiếm xu. Thân thiết tăng khi bạn chăm đúng lúc, mỗi bạn tối đa +${s.dailyCap} mỗi ngày. Nếu để bạn ấy buồn (có chỉ số dưới 20) thì Thân thiết bị trừ theo giờ, nhưng không tụt khỏi giai đoạn đã đạt và thú không bao giờ mất.</p>`;
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
const CAT_HINT = {
  food: 'Đồ ăn dùng một lần, tăng nhiều chỉ số hơn món miễn phí và cộng thêm Thân thiết.',
  toy: 'Đồ chơi mua một lần dùng mãi: chơi với đồ chơi thì Vui tăng nhiều hơn và thêm Thân thiết.',
};
function drawShop(root) {
  const d = P.shop, cat = d.cats.find((c) => c.id === P.cat) || d.cats[0];
  const hint = CAT_HINT[cat.id] || `${cat.name} dành cho ${cat.for.join(', ')}. Bậc càng cao thì thú tụt chỉ số càng chậm và ngủ hồi nhiều hơn. Nâng bậc được trừ giá món cũ.`;
  root.innerHTML = `<header class="pt-top"><button type="button" class="pt-back" data-pt="shop-close" aria-label="Quay lại">‹</button><h1>Cửa hàng</h1><span class="pt-coin" aria-label="Số dư">${coinIcon(18)} ${fmt(d.balance)}</span></header>
    <div class="pt-tabs" role="tablist" aria-label="Loại vật phẩm">${d.cats.map((c) => `<button type="button" role="tab" aria-selected="${c.id === cat.id}" class="pt-tab" data-pt="shop-cat" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</div>
    <p class="pt-sub">${esc(hint)}</p>
    <div class="pt-items">${cat.items.map((it) => {
      const eff = it.tier ? `Tụt chỉ số chậm hơn ${Math.round((1 - d.habMult[it.tier]) * 100)}% · ngủ hồi +${d.sleepBonus * it.tier} Khỏe` : [effText(it), it.int ? `Thân thiết +${it.int}` : ''].filter(Boolean).join(' · ') + (cat.id === 'toy' ? '' : '');
      const act = cat.id === 'food'
        ? `<div class="pt-fr"><button type="button" class="pt-btn" data-pt="buy" data-item="food:${it.id}" data-qty="1">${coinIcon(14)} ${fmt(it.price)}</button><button type="button" class="pt-btn" data-pt="buy" data-item="food:${it.id}" data-qty="5">x5 · ${fmt(it.price * 5)}</button></div>`
        : it.tier ? (it.current ? '<span class="pt-own">Đang dùng</span>' : it.worse ? '<span class="pt-own off">Đã có bậc cao hơn</span>' : `<button type="button" class="pt-btn" data-pt="buy" data-item="${cat.id}:${it.id}">${coinIcon(14)} ${fmt(it.cost)}${it.cost !== it.price ? ` <small>(giá ${fmt(it.price)})</small>` : ''}</button>`)
        : it.owned ? '<span class="pt-own">Đã có</span>' : `<button type="button" class="pt-btn" data-pt="buy" data-item="toy:${it.id}">${coinIcon(14)} ${fmt(it.price)}</button>`;
      return `<div class="pt-item"><span class="pt-ie" aria-hidden="true">${it.emoji}</span><div class="grow"><b>${esc(it.name)}</b>${cat.id === 'food' && it.qty ? ` <span class="pt-own">Đang có ${it.qty}</span>` : ''}<div class="pt-sub">${esc(eff)}</div></div>${act}</div>`;
    }).join('')}</div>`;
}
async function openShop(root, cat) {
  P.shop = await api('GET', '/pets/shop'); P.view = 'shop'; if (cat) P.cat = cat; drawShop(root);
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
    <div class="pt-fr"><button type="button" class="pt-btn" data-pt="a-skip" data-h="6">Tua +6 giờ</button><button type="button" class="pt-btn" data-pt="a-skip" data-h="24">Tua +24 giờ</button><button type="button" class="pt-btn" data-pt="a-coins">+1.000 xu thử</button><button type="button" class="pt-btn danger" data-pt="a-reset">Làm lại từ đầu</button></div>
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
  if (a === 'shop-open') return run(async () => { await openShop(root, t.dataset.cat); });
  if (a === 'shop-close') { P.view = 'home'; return refresh(root); }
  if (a === 'shop-cat') { P.cat = t.dataset.cat; return drawShop(root); }
  if (a === 'buy') return run(async () => {
    P.shop = await api('POST', '/pets/shop/buy', { item: t.dataset.item, qty: Number(t.dataset.qty) || 1 });
    drawShop(root); toast('Đã mua!', 1800);
  });
  if (a === 'pick') { P.sel = id; P.food = false; return draw(root); }
  if (a === 'v-pick') { P.vsel = id; return drawVisit(root); }
  if (a === 'feed') { P.food = !P.food; P.toy = false; return draw(root); }
  if (a === 'play' && Object.keys(P.s.inv).some((k) => k.startsWith('toy:') && P.s.inv[k] > 0)) { P.toy = !P.toy; P.food = false; return draw(root); } // có đồ chơi: chọn đồ chơi trước
  if (['play', 'wash', 'sleep', 'food', 'toy'].includes(a)) {
    return run(async () => {
      const r = await api('POST', `/pets/${id}/${a === 'food' ? 'feed' : a === 'toy' ? 'play' : a}`, a === 'food' ? { food: t.dataset.food } : a === 'toy' ? { toy: t.dataset.toy || undefined } : {});
      P.food = false; P.toy = false; if (r.inv) P.s.inv = r.inv;
      const i = P.s.pets.findIndex((p) => p.id === id); if (i >= 0) P.s.pets[i] = r.pet;
      draw(root);
      toast(r.lost ? `${r.pet.name} đã bị trừ ${r.lost} Thân thiết vì bị bỏ mặc. ${r.gained ? `Chăm xong +${r.gained}` : ''}` : r.levelUp ? `${r.pet.name} đã lớn thành ${r.levelUp}! 🎉` : r.gained ? `${r.liked ? 'Bạn ấy rất thích! ' : ''}+${r.gained} Thân thiết` : 'Hôm nay đã đủ điểm Thân thiết, bạn ấy vẫn rất vui', 2500);
    });
  }
  if (a === 'rename') {
    const p = P.s.pets.find((x) => x.id === id), name = prompt('Đặt tên mới (tối đa 20 ký tự):', p?.name || '');
    if (name === null) return;
    return run(async () => { await api('PATCH', `/pets/${id}`, { name }); await refresh(root); });
  }
  if (a === 'adopt') return openAdopt(root);
  if (a === 'adopt-do') return run(async () => { closeModal(); P.s = await api('POST', '/pets/adopt', { kind: t.dataset.kind }); P.sel = P.s.pets[P.s.pets.length - 1]?.id; toast('Đã nhận nuôi!'); draw(root); });
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
