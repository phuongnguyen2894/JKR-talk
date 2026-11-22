// Mini game Muay Thai: cược xu tím vào 1 trong 2 võ sĩ. Kết quả do máy chủ quyết định, trang này chỉ hiển thị và phát lại kịch bản.
// Luồng: PICK (chọn cặp + cược) → FIGHT (phát hoạt hình) → RESULT. Tải lại trang: #/muaythai/<mã trận> đưa về đúng màn.
import { $, $$, esc, S, api, icon, toast, coinIcon } from './core.js';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const CORNER = { red: { shirt: '#D93A40', glove: '#E5484D', gloveDark: '#A02A30', name: 'Góc đỏ' }, blue: { shirt: '#3B6FE0', glove: '#4F83F0', gloveDark: '#2B55B0', name: 'Góc xanh' } };
const SKIN = '#E8B58C', SKIN_D = '#D49E74';
const VERB = { punch: 'tung cú đấm', kick: 'tung cú đá', knee: 'tung cú gối', elbow: 'tung cú chỏ' };
const BURST = { punch: 'BỐP!', kick: 'ĐÙNG!', knee: 'BỊCH!', elbow: 'CHÁT!' };

let M = null;
let cssLoaded = false;
function loadCss() {
  if (cssLoaded || document.getElementById('mt-css')) { cssLoaded = true; return Promise.resolve(); }
  return new Promise((ok) => {
    const l = document.createElement('link');
    l.id = 'mt-css'; l.rel = 'stylesheet'; l.href = '/muaythai.css';
    l.onload = l.onerror = () => { cssLoaded = true; ok(); };
    document.head.appendChild(l);
  });
}

// ---- võ sĩ (SVG, thân dùng chung, chỉ đổi màu theo góc, tư thế, ảnh đầu) ----------------------------------
let svgN = 0;
function fighterSvg(f, { pose = 'guard', crown = false, w = 120 } = {}) {
  const c = CORNER[f.corner];
  const id = `mh${++svgN}`;
  const back = pose === 'kick' ? `<g transform="rotate(-80 70 156)"><rect x="63" y="156" width="15" height="50" rx="7" fill="${SKIN}"/><ellipse cx="70" cy="208" rx="11" ry="6" fill="${SKIN}"/></g>` : `<rect x="63" y="156" width="15" height="50" rx="7" fill="${SKIN}"/><ellipse cx="71" cy="208" rx="11" ry="6" fill="${SKIN}"/>`;
  let front, rear;
  if (pose === 'win') {
    front = `<path d="M76 80L90 56L86 34" stroke="${SKIN_D}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="86" cy="28" r="12" fill="${c.gloveDark}"/>`;
    rear = `<path d="M44 80L30 56L34 34" stroke="${SKIN}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="34" cy="28" r="13" fill="${c.glove}"/>`;
  } else if (pose === 'punch') {
    front = `<path d="M76 80L108 84" stroke="${SKIN_D}" stroke-width="12" stroke-linecap="round" fill="none"/><circle cx="112" cy="84" r="13" fill="${c.gloveDark}"/>`;
    rear = `<path d="M44 80L28 106L48 88" stroke="${SKIN}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="50" cy="84" r="13" fill="${c.glove}"/>`;
  } else {
    front = `<path d="M76 80L92 106L74 90" stroke="${SKIN_D}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="72" cy="84" r="12" fill="${c.gloveDark}"/>`;
    rear = `<path d="M44 80L28 106L48 88" stroke="${SKIN}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="50" cy="84" r="13" fill="${c.glove}"/>`;
  }
  const head = `<g${f.corner === 'blue' ? ' transform="translate(120 0) scale(-1 1)"' : ''}><clipPath id="${id}"><circle cx="60" cy="36" r="27"/></clipPath>
    <circle cx="60" cy="36" r="27" fill="${esc(f.color || '#6D28D9')}"/>
    <text x="60" y="43" text-anchor="middle" font-family="Be Vietnam Pro,system-ui,sans-serif" font-size="19" font-weight="700" fill="#fff">${esc(f.initials)}</text>
    ${f.headUrl ? `<image href="${esc(f.headUrl)}" x="33" y="9" width="54" height="54" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>` : ''}
    <circle cx="60" cy="36" r="27" fill="none" stroke="#fff" stroke-width="3"/></g>`;
  const body = `<rect x="42" y="156" width="15" height="50" rx="7" fill="${SKIN}"/><ellipse cx="49" cy="208" rx="11" ry="6" fill="${SKIN}"/>${back}
    <rect x="40" y="64" width="40" height="64" rx="14" fill="${SKIN}"/><path d="M60 80v34M49 92h22M49 104h22" stroke="${SKIN_D}" stroke-width="2" stroke-linecap="round" fill="none"/>
    <rect x="36" y="118" width="48" height="44" rx="10" fill="${c.shirt}"/><rect x="36" y="118" width="48" height="9" rx="4" fill="#FFC83D"/><path d="M60 128v32" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
    ${front}<rect x="54" y="58" width="12" height="12" fill="${SKIN}"/>${head}
    ${crown ? '<polygon points="44,10 47,-6 54,3 60,-10 66,3 73,-6 76,10" fill="#FFC83D" stroke="#B7791F" stroke-width="2" stroke-linejoin="round"/>' : ''}${rear}`;
  const flip = f.corner === 'blue' ? `<g transform="translate(120 0) scale(-1 1)">${body}</g>` : body;
  const tilt = pose === 'stagger' ? `<g transform="rotate(${f.corner === 'blue' ? -12 : 12} 60 210)">${flip}</g>` : flip;
  return `<svg width="${w}" height="${Math.round((w * 236) / 120)}" viewBox="0 -16 120 236" role="img" aria-label="${esc(f.name)}, ${CORNER[f.corner].name}" style="display:block;overflow:visible">${tilt}</svg>`;
}

function crowdSvg() {
  let s = '';
  for (let i = 0; i < 10; i++) { const x = 14 + 38 * i; s += `<circle cx="${x}" cy="13" r="7" fill="#3B1C80"/><path d="M${x - 15} 46c0-14 6-21 15-21s15 7 15 21z" fill="#3B1C80"/>`; }
  const cols = ['#7C3AED', '#6D28D9', '#8B5CF6', '#5B21B6', '#A78BFA', '#6D28D9', '#7C3AED', '#6D28D9', '#6D28D9', '#8B5CF6'];
  for (let i = 0; i < 9; i++) {
    const x = 20 + 40 * i, col = cols[i];
    if (i % 3 === 1) s += `<path d="M${x - 13} 38L${x - 18} 18M${x + 13} 38L${x + 18} 18" stroke="${col}" stroke-width="6" stroke-linecap="round" fill="none"/><circle cx="${x - 18}" cy="16" r="3.5" fill="${col}"/><circle cx="${x + 18}" cy="16" r="3.5" fill="${col}"/>`;
    s += `<circle cx="${x}" cy="24" r="10" fill="${col}"/><path d="M${x - 18} 48c0-16 7-24 18-24s18 8 18 24z" fill="${col}"/>`;
  }
  return `<svg class="mt-crowd" viewBox="0 0 358 46" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${s}</svg>`;
}
const arenaBack = () => '<div class="mt-glow"></div><i class="mt-rope r1"></i><i class="mt-rope r2"></i><i class="mt-rope r3"></i><i class="mt-post l"></i><i class="mt-post r"></i><div class="mt-floor"></div>';
const coinPill = (n) => `<span class="mt-pill" id="mt-bal" aria-label="Số dư ${fmt(n)} xu tím">${coinIcon(18)}${fmt(n)}</span>`;
const header = (title, back) => `<div class="mt-head">${back || '<a class="mt-back" href="#/chat" aria-label="Thoát game, về danh sách nhóm">' + icon('back', 22) + '</a>'}<h1>${title}</h1>${coinPill(M.balance)}</div>`;
const setBalance = (n) => { M.balance = n; if (S.me) S.me = { ...S.me, balance: n }; const el = $('#mt-bal'); if (el) el.innerHTML = `${coinIcon(18)}${fmt(n)}`; };

// ---- vào game ---------------------------------------------------------------------------------------------
export async function renderMuayThai(view, arg) {
  M?.stop?.();
  M = { screen: 'load', tab: 'random', sub: 'char', slots: { A: null, B: null }, active: 'A', q: '', users: [], chars: [], match: null, pick: null, stake: 50, balance: S.me?.balance || 0, stop: null, busy: false, last: null, res: null };
  view.innerHTML = '<div class="mt-wrap"><div class="mt" id="mt"><div class="mt-load">Đang tải…</div></div></div>';
  await loadCss();
  const root = $('#mt', view);
  root.onclick = onClick;
  root.oninput = onInput;
  try {
    const [w, c] = await Promise.all([api('GET', '/mt/wallet'), api('GET', '/mt/characters')]);
    M.balance = w.balance; M.chars = c.characters;
    if (S.me) S.me = { ...S.me, balance: w.balance };
    if (arg) {
      try {
        const m = await api('GET', `/mt/matches/${encodeURIComponent(arg)}`);
        M.match = m; M.tab = m.mode; if (m.mode === 'custom') M.last = m.fighters.map((f) => ({ type: f.type, id: f.id }));
        if (m.status === 'settled') { M.res = m; M.pick = m.result.pick; M.stake = m.result.stake; return draw('result'); }
        return draw('pick');
      } catch { /* hết hạn hoặc không có: mở trận mới */ }
    }
    await newMatch('random');
  } catch (e) { root.innerHTML = `<div class="mt-load">${esc(e.message)}<br><a class="mt-btn ghost" href="#/chat">Quay lại</a></div>`; }
}

async function newMatch(mode, pair) {
  const body = mode === 'random' ? { mode } : { mode, fighterA: pair[0], fighterB: pair[1] };
  const m = await api('POST', '/mt/matches', body);
  M.match = m; M.tab = mode; M.pick = null; M.res = null;
  M.stake = Math.max(m.stake.min, Math.min(M.stake, m.stake.max));
  setBalance(m.balance ?? M.balance);
  try { history.replaceState(null, '', `#/muaythai/${m.matchId}`); } catch { /* bỏ qua */ }
  draw('pick');
}

function draw(screen) {
  M.screen = screen;
  const root = $('#mt');
  if (!root) return;
  root.innerHTML = screen === 'pick' ? pickHtml() : screen === 'custom' ? customHtml() : screen === 'fight' ? fightHtml() : resultHtml();
  if (screen === 'fight') startFight();
  if (screen === 'custom' && M.sub === 'user') $('#mt-q')?.focus();
}

// ---- PICK ----------------------------------------------------------------------------------------------------
const tabsHtml = () => `<div class="mt-tabs" role="tablist" aria-label="Chế độ chọn cặp">
  <button role="tab" aria-selected="${M.tab === 'random'}" data-mt="tab-random">Cặp ngẫu nhiên</button>
  <button role="tab" aria-selected="${M.tab === 'custom'}" data-mt="tab-custom">Tự chọn cặp</button></div>`;

function stakeLine() {
  const win = Math.floor(M.stake * M.match.payoutMultiplier);
  return `<div class="mt-sum"><div>Thắng <b class="gold">+${fmt(win)} xu</b></div><i></i><div>Thua <b>−${fmt(M.stake)} xu</b></div></div>`;
}
function startState() {
  if (M.busy) return { label: 'Đang vào võ đài…', off: true };
  if (!M.pick) return { label: 'Chạm vào võ sĩ để chọn', off: true };
  if (M.balance < M.match.stake.min) return { label: 'Không đủ xu tím', off: true };
  if (M.balance < M.stake) return { label: 'Không đủ xu tím', off: true };
  return { label: 'Bắt đầu', off: false };
}
function pickHtml() {
  const [a, b] = M.match.fighters;
  const st = startState();
  const slot = (f, side) => `<button type="button" class="mt-fslot ${side}${M.pick === side ? ' on' : M.pick ? ' dim' : ''}" data-mt="pick-${side}" aria-pressed="${M.pick === side}" aria-label="Cược cho ${esc(f.name)}, ${CORNER[f.corner].name}, thưởng x${f.odds}">
      ${M.pick === side ? '<span class="mt-you">Bạn chọn</span>' : ''}<span class="mt-shadow"></span>${fighterSvg(f, { w: 108 })}</button>`;
  const name = (f, side) => `<div class="mt-fname ${side}${M.pick && M.pick !== side ? ' dim' : ''}">${esc(f.name)} <span class="x">x${f.odds}</span><small>${CORNER[f.corner].name}</small></div>`;
  const lowCoins = M.balance < M.match.stake.min;
  return `${header('Muay Thai')}${tabsHtml()}
    <div class="mt-arena pick">${arenaBack()}
      <div class="mt-fighters">${slot(a, 'A')}${slot(b, 'B')}</div><span class="mt-vs" aria-hidden="true">VS</span>
      <div class="mt-names">${name(a, 'A')}${name(b, 'B')}</div>${crowdSvg()}</div>
    <button type="button" class="mt-btn ghost" data-mt="change-pair">${icon('shuffle', 18)}${M.tab === 'random' ? 'Đổi cặp khác' : 'Chọn cặp khác'}</button>
    <div class="mt-lbl">Số xu cược (${M.match.stake.min}–${M.match.stake.max})</div>
    <div class="mt-chips" role="group" aria-label="Chọn nhanh số xu">${[10, 50, 100].map((v) => `<button data-mt="stake" data-v="${v}" aria-pressed="${M.stake === v}">${v}</button>`).join('')}<button class="wide" data-mt="stake" data-v="all" aria-pressed="${M.stake === Math.min(M.match.stake.max, M.balance) && M.balance >= M.match.stake.min && ![10, 50, 100].includes(M.stake)}">Tất cả</button></div>
    <div class="mt-step"><button aria-label="Giảm 10 xu" data-mt="dec">−</button>
      <label class="mt-amt">${coinIcon(18)}<input id="mt-stake" type="number" inputmode="numeric" min="${M.match.stake.min}" max="${M.match.stake.max}" step="1" value="${M.stake}" aria-label="Số xu cược"></label>
      <button aria-label="Tăng 10 xu" data-mt="inc">+</button></div>
    <div id="mt-sum">${stakeLine()}</div>
    ${lowCoins ? '<p class="mt-note">Bạn chưa đủ xu tím để cược. Xu tím kiếm được khi nhắn tin, nhận thưởng hằng ngày và tương tác trong app.</p>' : ''}
    <button type="button" class="mt-btn primary" id="mt-start" data-mt="start" ${st.off ? 'disabled' : ''}>${st.label}</button>`;
}

// ---- tự chọn cặp -----------------------------------------------------------------------------------------------
const headChip = (f, size = 48, ring = '') => `<span class="mt-head-c" style="width:${size}px;height:${size}px;background:${esc(f.color || '#6D28D9')};${ring}"><b>${esc(f.initials)}</b>${f.headUrl ? `<img src="${esc(f.headUrl)}" alt="" loading="lazy">` : ''}</span>`;
function customHtml() {
  const slotBox = (side) => {
    const f = M.slots[side], corner = side === 'A' ? 'red' : 'blue';
    return `<button type="button" class="mt-slot ${corner}${M.active === side ? ' active' : ''}" data-mt="slot-${side}" aria-pressed="${M.active === side}" aria-label="${CORNER[corner].name}: ${f ? esc(f.name) : 'chưa chọn'}">
      ${f ? headChip(f) : '<span class="mt-head-c empty"><b>?</b></span>'}<span class="t"><b>${f ? esc(f.name) : 'Chưa chọn'}</b><small>${CORNER[corner].name}</small></span></button>`;
  };
  const taken = (f) => (M.slots.A?.type === f.type && M.slots.A?.id === f.id ? 'A' : M.slots.B?.type === f.type && M.slots.B?.id === f.id ? 'B' : null);
  let list;
  if (M.sub === 'char') {
    list = `<div class="mt-grid">${M.chars.map((c) => {
      const f = { type: 'character', id: c.id, name: c.name, initials: c.initials, color: c.color, headUrl: c.headUrl };
      const t = taken(f);
      return `<button type="button" class="mt-char${t ? ' on ' + (t === 'A' ? 'red' : 'blue') : ''}" data-mt="char" data-id="${esc(c.id)}" aria-pressed="${!!t}">${headChip(f, 50, t ? `border-color:${t === 'A' ? '#D93A40' : '#3B6FE0'};border-width:3px` : '')}<span>${esc(c.name)}</span>${t ? `<em class="${t === 'A' ? 'red' : 'blue'}">${t === 'A' ? 'Góc đỏ' : 'Góc xanh'}</em>` : '<em></em>'}</button>`;
    }).join('')}</div><p class="mt-hint">Đầu nhân vật là ảnh do admin cấu hình, thân dùng chung. Chạm lại để bỏ chọn.</p>`;
  } else {
    list = `<label class="sr-only" for="mt-q">Tìm người dùng</label>
      <div class="mt-search">${icon('search', 18)}<input id="mt-q" type="search" placeholder="Tìm theo tên hiển thị" value="${esc(M.q)}" autocomplete="off"></div>
      <div id="mt-users" class="mt-users">${usersHtml(taken)}</div>
      <p class="mt-hint">Ai cũng chọn được làm võ sĩ, kể cả bạn. Chỉ hiện tên, tỉnh/thành và ảnh đại diện công khai.</p>`;
  }
  const both = M.slots.A && M.slots.B;
  return `${header('Tự chọn cặp', `<button class="mt-back" data-mt="to-pick" aria-label="Quay lại">${icon('back', 22)}</button>`)}${tabsHtml()}
    <div class="mt-slots">${slotBox('A')}<span class="mt-vs2">VS</span>${slotBox('B')}</div>
    <div class="mt-tabs pill" role="tablist" aria-label="Loại võ sĩ"><button role="tab" aria-selected="${M.sub === 'char'}" data-mt="sub-char">Nhân vật</button><button role="tab" aria-selected="${M.sub === 'user'}" data-mt="sub-user">Người dùng</button></div>
    ${list}
    <button type="button" class="mt-btn ghost" data-mt="fill-random">${icon('shuffle', 18)}Ngẫu nhiên cho góc còn trống</button>
    <button type="button" class="mt-btn primary" data-mt="confirm" ${both ? '' : 'disabled'}>${both ? 'Xác nhận cặp đấu' : 'Chọn đủ hai võ sĩ'}</button>`;
}
function usersHtml(taken) {
  if (M.q.trim().length < 2) return '<p class="mt-hint">Gõ ít nhất 2 ký tự để tìm.</p>';
  if (M.loadingUsers) return '<p class="mt-hint">Đang tìm…</p>';
  if (!M.users.length) return '<p class="mt-hint">Không tìm thấy ai.</p>';
  return M.users.map((u) => {
    const f = { type: 'user', id: u.id, name: u.name, initials: u.initials, color: u.color, headUrl: u.headUrl };
    const t = taken(f);
    return `<button type="button" class="mt-urow${t ? ' on' : ''}" data-mt="user" data-id="${esc(u.id)}" aria-pressed="${!!t}">${headChip(f, 44)}
      <span class="t"><b>${esc(u.name)}${u.self ? ' <small>(bạn)</small>' : ''}</b><small>${esc(u.province || '')}</small></span>
      ${t ? `<em class="${t === 'A' ? 'red' : 'blue'}">${t === 'A' ? 'Góc đỏ' : 'Góc xanh'}</em>` : u.relation === 'friend' ? '<em class="rel">Bạn bè</em>' : u.relation === 'group' ? '<em class="rel">Cùng nhóm</em>' : ''}</button>`;
  }).join('');
}
let searchTimer = 0, searchSeq = 0;
function searchUsers() {
  clearTimeout(searchTimer);
  const q = M.q.trim();
  if (q.length < 2) { M.users = []; M.loadingUsers = false; return refreshUsers(); }
  M.loadingUsers = true; refreshUsers();
  const seq = ++searchSeq;
  searchTimer = setTimeout(async () => {
    try { const r = await api('GET', `/mt/users?q=${encodeURIComponent(q)}`); if (seq === searchSeq) { M.users = r.users; } } catch (e) { if (seq === searchSeq) { M.users = []; toast(e.message); } }
    if (seq === searchSeq) { M.loadingUsers = false; refreshUsers(); }
  }, 300);
}
function refreshUsers() {
  const box = $('#mt-users');
  if (!box) return;
  const taken = (f) => (M.slots.A?.type === f.type && M.slots.A?.id === f.id ? 'A' : M.slots.B?.type === f.type && M.slots.B?.id === f.id ? 'B' : null);
  box.innerHTML = usersHtml(taken);
}
function assign(f) {
  const side = (s) => M.slots[s] && M.slots[s].type === f.type && M.slots[s].id === f.id;
  if (side('A')) { M.slots.A = null; M.active = 'A'; return; } // chạm lại để bỏ chọn
  if (side('B')) { M.slots.B = null; M.active = 'B'; return; }
  M.slots[M.active] = f;
  M.active = M.active === 'A' ? (M.slots.B ? 'A' : 'B') : (M.slots.A ? 'B' : 'A');
}

// ---- FIGHT -------------------------------------------------------------------------------------------------------
function fightHtml() {
  const [a, b] = M.match.fighters;
  const pf = M.match.fighters.find((f) => f.side === M.pick);
  return `${header('Trận đấu')}<div id="mt-fight">
    <div class="mt-hud"><div class="hp"><div class="n">${esc(a.name)}</div><div class="bar l"><i id="hp-A" class="red" style="width:100%"></i></div></div>
      <span class="mt-clock" id="mt-clock" role="timer" aria-label="Thời gian còn lại">0:09</span>
      <div class="hp"><div class="n r">${esc(b.name)}</div><div class="bar r"><i id="hp-B" class="blue" style="width:100%"></i></div></div></div>
    <div class="mt-arena fight" id="mt-ring">${arenaBack()}
      <div class="mt-fighters"><div class="mt-fslot A" id="f-A" role="presentation">${fighterSvg(a, { w: 140 })}</div><div class="mt-fslot B" id="f-B" role="presentation">${fighterSvg(b, { w: 140 })}</div></div>
      <div class="mt-burst" id="mt-burst" aria-hidden="true"><svg viewBox="0 0 120 120"><polygon points="60,2 72,34 104,18 88,48 118,60 88,72 104,102 72,86 60,118 48,86 16,102 32,72 2,60 32,48 16,18 48,34" fill="#FFC83D" stroke="#B7791F" stroke-width="3" stroke-linejoin="round"/><text id="mt-burst-t" x="60" y="68" text-anchor="middle" transform="rotate(-8 60 60)" font-family="Be Vietnam Pro,system-ui,sans-serif" font-size="22" font-weight="900" fill="#2A1B00">BỐP!</text></svg></div>
      ${crowdSvg()}</div>
    <div class="mt-log" id="mt-log" role="status" aria-live="polite">Hai võ sĩ vào vị trí…</div>
    <div class="mt-bet">Bạn cược <b>${fmt(M.stake)} xu</b> cho <b>${esc(pf?.name || '')}</b></div>
    <button type="button" class="mt-btn ghost" data-mt="skip">Bỏ qua</button></div>`;
}
function startFight() {
  const data = M.res, [fa, fb] = M.match.fighters, F = { A: fa, B: fb };
  const sp = reduced() ? 0.6 : 1; // giảm chuyển động: rút ngắn thời gian
  const timers = [];
  let done = false, clock = 0;
  const alive = () => !done && M.screen === 'fight' && $('#mt-fight');
  const at = (ms, fn) => timers.push(setTimeout(() => { if (alive()) fn(); }, ms * sp));
  const setPose = (side, pose) => { const el = $(`#f-${side}`); if (el) el.innerHTML = fighterSvg(F[side], { pose, w: 140 }); };
  const stop = () => { done = true; timers.forEach(clearTimeout); clearInterval(clock); };
  M.stop = stop;
  const finish = () => { if (done) return; stop(); draw('result'); };
  M.skip = finish;
  const t0 = performance.now();
  clock = setInterval(() => {
    const left = Math.max(0, Math.ceil(data.script.durationMs - (performance.now() - t0) / sp) / 1000);
    const el = $('#mt-clock'); if (el) el.textContent = `0:${String(Math.ceil(left)).padStart(2, '0')}`;
  }, 200);
  const ev = data.script.events;
  ev.forEach((e, i) => {
    at(e.tMs, () => {
      const t = e.by === 'A' ? 'B' : 'A';
      setPose(e.by, e.move === 'kick' ? 'kick' : 'punch');
      setPose(t, 'stagger');
      $(`#f-${e.by}`)?.classList.add('lunge'); $(`#f-${t}`)?.classList.add('hurt');
      const burst = $('#mt-burst'); if (burst) { $('#mt-burst-t').textContent = BURST[e.move] || 'BỐP!'; burst.classList.remove('show'); void burst.offsetWidth; burst.classList.add('show'); }
      const ring = $('#mt-ring'); if (ring && !reduced() && e.damage >= 14) { ring.classList.remove('shake'); void ring.offsetWidth; ring.classList.add('shake'); }
      for (const s of ['A', 'B']) { const bar = $(`#hp-${s}`); if (bar) bar.style.width = `${e.hp[s]}%`; }
      const log = $('#mt-log'); if (log) log.textContent = `${F[e.by].name} ${VERB[e.move] || 'ra đòn'} trúng ${F[t].name}${e.ko ? ' và hạ gục đối thủ!' : ''}`;
    });
    if (!(e.ko && i === ev.length - 1)) at(e.tMs + 420, () => { for (const s of ['A', 'B']) { setPose(s, 'guard'); $(`#f-${s}`)?.classList.remove('lunge', 'hurt'); } });
  });
  const last = ev[ev.length - 1];
  if (last.ko) {
    const loser = data.script.winner === 'A' ? 'B' : 'A';
    at(last.tMs + 420, () => { setPose(data.script.winner, 'guard'); $(`#f-${data.script.winner}`)?.classList.remove('lunge'); setPose(loser, 'guard'); $(`#f-${loser}`)?.classList.add('down'); const log = $('#mt-log'); if (log) log.textContent = `${F[loser].name} nằm sàn, trọng tài đếm…`; });
    at(last.tMs + 1700, finish);
  } else {
    at(data.script.durationMs, () => { const log = $('#mt-log'); if (log) log.textContent = 'Hết giờ! Trọng tài chấm điểm…'; });
    at(data.script.durationMs + 1200, finish);
  }
}

// ---- RESULT --------------------------------------------------------------------------------------------------------
function resultHtml() {
  const r = M.res.result, [a, b] = M.match.fighters;
  const W = r.winner === 'A' ? a : b, L = r.winner === 'A' ? b : a;
  const won = r.won;
  setBalance(M.res.balanceFinal);
  const ko = r.method === 'KO';
  const conf = won ? Array.from({ length: 12 }, (_, i) => `<i class="cf c${i % 5}" style="left:${(i * 83) % 96 + 2}%;top:${(i * 37) % 40 + 4}%;animation-delay:${(i % 6) * 0.15}s"></i>`).join('') : '';
  const loserHtml = ko ? `<div class="mt-loser ko"><div>${fighterSvg(L, { w: 70 })}</div></div>` : `<div class="mt-loser sit">${fighterSvg(L, { pose: 'stagger', w: 100 })}</div>`;
  return `${header('Kết quả')}
    <div class="mt-banner ${won ? 'win' : 'lose'}">${esc(W.name).toUpperCase()} THẮNG ${ko ? 'BẰNG KO' : 'THEO ĐIỂM'}</div>
    <div class="mt-arena result">${arenaBack()}${conf}<div class="mt-winner">${fighterSvg(W, { pose: 'win', crown: true, w: 138 })}</div>${loserHtml}${crowdSvg()}</div>
    <div class="mt-card ${won ? 'win' : 'lose'}" role="status"><div class="a">${won ? 'Bạn đoán đúng!' : 'Tiếc quá, bạn đoán chưa trúng'}</div>
      <div class="b">${won ? '+' + fmt(r.payout) : '−' + fmt(r.stake)} xu</div>
      <div class="c">${won ? `Cược ${fmt(r.stake)} xu · thưởng x${M.match.payoutMultiplier}` : `Mất ${fmt(r.stake)} xu cược`}</div></div>
    <div class="mt-bal"><span>Số dư mới</span><b>${coinIcon(18)}${fmt(M.res.balanceFinal)}</b></div>
    <button type="button" class="mt-btn primary" data-mt="again" id="mt-again">Chơi tiếp</button>
    <a class="mt-btn ghost" href="#/chat">Thoát</a>`;
}

// ---- sự kiện -------------------------------------------------------------------------------------------------------
async function doBet() {
  if (M.busy || !M.pick) return;
  const st = startState(); if (st.off) return;
  M.busy = true; draw('pick');
  try {
    const r = await api('POST', `/mt/matches/${M.match.matchId}/bet`, { pick: M.pick, stake: M.stake });
    M.res = r; M.busy = false;
    setBalance(r.balanceAfterStake); // trong lúc phát chỉ hiện số dư sau khi trừ cược
    draw('fight');
  } catch (e) {
    M.busy = false;
    if (e.status === 409) { // đã cược (bấm hai lần hoặc nhiều tab): lấy kết quả đã chốt
      try { const m = await api('GET', `/mt/matches/${M.match.matchId}`); if (m.status === 'settled') { M.res = m; M.pick = m.result.pick; M.stake = m.result.stake; return draw('result'); } } catch { /* rơi xuống thông báo */ }
    }
    if (e.status === 410) { toast('Trận đã hết hạn, đã tạo trận mới'); try { return await newMatch(M.tab === 'random' ? 'random' : 'custom', M.last); } catch { /* xuống dưới */ } }
    toast(e.message); draw('pick');
  }
}

function onInput(e) {
  if (e.target.id === 'mt-stake') {
    const v = Math.floor(Number(e.target.value));
    if (Number.isFinite(v) && v > 0) { M.stake = Math.min(v, M.match.stake.max); const s = $('#mt-sum'); if (s) s.innerHTML = stakeLine(); const b = $('#mt-start'); if (b) { const st = startState(); b.disabled = st.off || v < M.match.stake.min; b.textContent = v < M.match.stake.min ? `Tối thiểu ${M.match.stake.min} xu` : st.label; } }
  } else if (e.target.id === 'mt-q') { M.q = e.target.value; searchUsers(); }
}
async function onClick(e) {
  const t = e.target.closest('[data-mt]');
  if (!t) return;
  const act = t.dataset.mt;
  const clamp = (v) => Math.max(M.match.stake.min, Math.min(M.match.stake.max, v));
  try {
    if (act === 'pick-A' || act === 'pick-B') { M.pick = M.pick === act.slice(-1) ? null : act.slice(-1); draw('pick'); }
    else if (act === 'stake') { M.stake = t.dataset.v === 'all' ? clamp(Math.min(M.match.stake.max, M.balance)) : Number(t.dataset.v); draw('pick'); }
    else if (act === 'inc') { M.stake = clamp(M.stake + 10); draw('pick'); }
    else if (act === 'dec') { M.stake = clamp(M.stake - 10); draw('pick'); }
    else if (act === 'start') await doBet();
    else if (act === 'skip') M.skip?.();
    else if (act === 'tab-random') { if (M.tab !== 'random') { await newMatch('random'); } }
    else if (act === 'tab-custom') { if (M.screen === 'custom') return; M.tab = 'custom'; if (M.match?.mode === 'custom') draw('pick'); else draw('custom'); }
    else if (act === 'change-pair') { if (M.tab === 'random') await newMatch('random'); else draw('custom'); }
    else if (act === 'to-pick') { M.tab = M.match?.mode || 'random'; draw('pick'); }
    else if (act === 'sub-char' || act === 'sub-user') { M.sub = act.slice(4); draw('custom'); }
    else if (act === 'slot-A' || act === 'slot-B') { M.active = act.slice(-1); draw('custom'); }
    else if (act === 'char') { const c = M.chars.find((x) => x.id === t.dataset.id); if (c) assign({ type: 'character', id: c.id, name: c.name, initials: c.initials, color: c.color, headUrl: c.headUrl }); draw('custom'); }
    else if (act === 'user') {
      const u = M.users.find((x) => x.id === t.dataset.id);
      if (u) { assign({ type: 'user', id: u.id, name: u.name, initials: u.initials, color: u.color, headUrl: u.headUrl }); const q = M.q; draw('custom'); const i = $('#mt-q'); if (i) { i.value = q; } }
    }
    else if (act === 'fill-random') {
      const used = new Set([M.slots.A, M.slots.B].filter(Boolean).map((f) => `${f.type}:${f.id}`));
      const pool = M.chars.filter((c) => !used.has(`character:${c.id}`));
      for (const s of ['A', 'B']) if (!M.slots[s] && pool.length) { const c = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; M.slots[s] = { type: 'character', id: c.id, name: c.name, initials: c.initials, color: c.color, headUrl: c.headUrl }; }
      draw('custom');
    }
    else if (act === 'confirm') {
      if (!(M.slots.A && M.slots.B)) return;
      M.last = [{ type: M.slots.A.type, id: M.slots.A.id }, { type: M.slots.B.type, id: M.slots.B.id }];
      await newMatch('custom', M.last);
    }
    else if (act === 'again') {
      t.disabled = true;
      if (M.tab === 'custom' && M.last) await newMatch('custom', M.last); else await newMatch('random');
    }
  } catch (er) { toast(er.message); if (M?.screen === 'result') { const b = $('#mt-again'); if (b) b.disabled = false; } }
}
