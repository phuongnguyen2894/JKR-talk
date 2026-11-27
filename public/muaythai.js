// Mini game Muay Thai: cược xu tím vào 1 trong 2 võ sĩ. Kết quả do máy chủ quyết định, trang này chỉ hiển thị và phát lại kịch bản.
// Luồng: PICK (chọn cặp + cược) → FIGHT (phát hoạt hình) → RESULT. Tải lại trang: #/muaythai/<mã trận> đưa về đúng màn.
import { $, $$, esc, S, api, icon, toast, coinIcon } from './core.js';
import { t as tr, fmtNum } from './i18n.js';
const cornerName = (c) => tr(c === 'red' ? 'mt.red' : 'mt.blue');
import { fighterHtml, mountSprites, loadSprites, CORNER } from './sprite.js';
import { pvpInit, pvpStop, pvpBadge, pvpScreenHtml, pvpAction, pvpInput, openCreate, openBox, pvpOpen, routeChallenge } from './pvp.js';

const fmt = (n) => fmtNum(n || 0);
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
// đòn và tiếng động theo ngôn ngữ đang dùng
const VERB = (m) => tr(`mt.v.${m}`);
const BURST = (m) => tr(`mt.b.${m}`);

let M = null;
let cssLoaded = false;
function loadCss() {
  if (cssLoaded || document.getElementById('mt-css')) { cssLoaded = true; return Promise.resolve(); }
  const one = (id, href) => new Promise((ok) => {
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet'; l.href = href;
    l.onload = l.onerror = ok;
    document.head.appendChild(l);
  });
  return Promise.all([one('mt-css', '/muaythai.css'), one('mt-css2', '/muaythai-pvp.css')]).then(() => { cssLoaded = true; });
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
const coinPill = (n) => `<span class="mt-pill" id="mt-bal" aria-label="${tr('mt.balance', { n: fmt(n) })}">${coinIcon(18)}${fmt(n)}</span>`;
const header = (title, back) => `<div class="mt-head">${back || `<a class="mt-back" href="#/games" aria-label="${tr('mt.backGames')}">` + icon('back', 22) + '</a>'}<h1>${title}</h1>${coinPill(M.balance)}</div>`;
const setBalance = (n) => { M.balance = n; if (S.me) S.me = { ...S.me, balance: n }; const el = $('#mt-bal'); if (el) el.innerHTML = `${coinIcon(18)}${fmt(n)}`; };

// ---- vào game ---------------------------------------------------------------------------------------------
export async function renderMuayThai(view, arg) {
  M?.stop?.();
  M = { screen: 'load', mode: null, pvMatch: null, startLocal: 0, tab: 'random', sub: 'char', slots: { A: null, B: null }, active: 'A', q: '', users: [], chars: [], match: null, pick: null, stake: 50, balance: S.me?.balance || 0, stop: null, busy: false, last: null, res: null };
  view.innerHTML = `<div class="mt-wrap"><div class="mt" id="mt"><div class="mt-load">${tr('cmt.loading')}</div></div></div>`;
  await Promise.all([loadCss(), loadSprites()]);
  pvpInit(M);
  const root = $('#mt', view);
  root.onclick = onClick;
  root.oninput = onInput;
  try {
    const [w, c] = await Promise.all([api('GET', '/mt/wallet'), api('GET', '/mt/characters')]);
    M.balance = w.balance; M.chars = c.characters;
    if (S.me) S.me = { ...S.me, balance: w.balance };
    const seg = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
    if (arg === 'pvp' || arg === 'box') {
      pvpBadge(M);
      if (arg === 'box') return await openBox(M, H);
      if (seg[2]) { try { return await pvpOpen(M, H, seg[2]); } catch { /* lời thách không còn: mở màn tạo */ } }
      return await openCreate(M, H);
    }
    if (arg) {
      try {
        const m = await api('GET', `/mt/matches/${encodeURIComponent(arg)}`);
        M.match = m; M.tab = m.mode; if (m.mode === 'custom') M.last = m.fighters.map((f) => ({ type: f.type, id: f.id }));
        if (m.status === 'settled') { M.res = m; M.pick = m.result.pick; M.stake = m.result.stake; return draw('result'); }
        return draw('pick');
      } catch { /* hết hạn hoặc không có: mở trận mới */ }
    }
    await newMatch('random');
  } catch (e) { root.innerHTML = `<div class="mt-load">${esc(e.message)}<br><a class="mt-btn ghost" href="#/chat">${tr('ch.back')}</a></div>`; }
}

async function newMatch(mode, pair) {
  const body = mode === 'random' ? { mode } : { mode, fighterA: pair[0], fighterB: pair[1] };
  const m = await api('POST', '/mt/matches', body);
  M.match = m; M.tab = mode; M.pick = null; M.res = null; M.mode = null;
  M.stake = Math.max(m.stake.min, Math.min(M.stake, m.stake.max));
  setBalance(m.balance ?? M.balance);
  try { history.replaceState(null, '', `#/muaythai/${m.matchId}`); } catch { /* bỏ qua */ }
  draw('pick');
}

function draw(screen) {
  pvpStop(M);
  M.screen = screen;
  const root = $('#mt');
  if (!root) return;
  root.innerHTML = screen === 'pick' ? pickHtml() : screen === 'custom' ? customHtml() : screen === 'fight' ? fightHtml() : screen === 'result' ? resultHtml() : pvpScreenHtml(M, screen, H);
  mountSprites(root);
  if (screen === 'fight') startFight();
  if (screen === 'custom' && M.sub === 'user') $('#mt-q')?.focus();
}

// ---- PICK ----------------------------------------------------------------------------------------------------
const tabsHtml = () => `<div class="mt-tabs" role="tablist" aria-label="${tr('mt.pairMode')}">
  <button role="tab" aria-selected="${M.tab === 'random'}" data-mt="tab-random">${tr('mt.random')}</button>
  <button role="tab" aria-selected="${M.tab === 'custom'}" data-mt="tab-custom">${tr('mt.custom')}</button>
  <button role="tab" aria-selected="${M.tab === 'pvp'}" data-mt="pv-tab">${tr('mt.pvp')}${M.pv?.incoming ? `<span class="mt-badge">${M.pv.incoming}</span>` : ''}</button></div>`;

function stakeLine() {
  const win = Math.floor(M.stake * M.match.payoutMultiplier);
  return `<div class="mt-sum"><div>${tr('mt.win')} <b class="gold">+${tr('mt.coins', { n: fmt(win) })}</b></div><i></i><div>${tr('mt.lose')} <b>−${tr('mt.coins', { n: fmt(M.stake) })}</b></div></div>`;
}
function startState() {
  if (M.busy) return { label: tr('mt.entering'), off: true };
  if (!M.pick) return { label: tr('mt.tapFighter'), off: true };
  if (M.balance < M.match.stake.min) return { label: tr('mt.noCoins'), off: true };
  if (M.balance < M.stake) return { label: tr('mt.noCoins'), off: true };
  return { label: tr('mt.start'), off: false };
}
function pickHtml() {
  const [a, b] = M.match.fighters;
  const st = startState();
  const slot = (f, side) => `<button type="button" class="mt-fslot ${side}${M.pick === side ? ' on' : M.pick ? ' dim' : ''}" data-mt="pick-${side}" aria-pressed="${M.pick === side}" aria-label="${tr('mt.betFor', { n: esc(f.name), c: cornerName(f.corner), x: f.odds })}">
      ${M.pick === side ? `<span class="mt-you">${tr('mt.yourPick')}</span>` : ''}<span class="mt-shadow"></span>${fighterHtml(f, { w: 170 })}</button>`;
  const name = (f, side) => `<div class="mt-fname ${side}${M.pick && M.pick !== side ? ' dim' : ''}">${esc(f.name)} <span class="x">x${f.odds}</span><small>${CORNER[f.corner].name}</small></div>`;
  const lowCoins = M.balance < M.match.stake.min;
  return `${header('Muay Thai')}${tabsHtml()}
    <div class="mt-arena pick">${arenaBack()}
      <div class="mt-fighters">${slot(a, 'A')}${slot(b, 'B')}</div><span class="mt-vs" aria-hidden="true">VS</span>
      <div class="mt-names">${name(a, 'A')}${name(b, 'B')}</div>${crowdSvg()}</div>
    <button type="button" class="mt-btn ghost" data-mt="change-pair">${icon('shuffle', 18)}${M.tab === 'random' ? tr('mt.newPair') : tr('mt.otherPair')}</button>
    <div class="mt-lbl">${tr('mt.stakeLbl')} (${M.match.stake.min}–${M.match.stake.max})</div>
    <div class="mt-chips" role="group" aria-label="${tr('mt.quick')}">${[10, 50, 100].map((v) => `<button data-mt="stake" data-v="${v}" aria-pressed="${M.stake === v}">${v}</button>`).join('')}<button class="wide" data-mt="stake" data-v="all" aria-pressed="${M.stake === Math.min(M.match.stake.max, M.balance) && M.balance >= M.match.stake.min && ![10, 50, 100].includes(M.stake)}">${tr('em.all')}</button></div>
    <div class="mt-step"><button aria-label="${tr('mt.dec')}" data-mt="dec">−</button>
      <label class="mt-amt">${coinIcon(18)}<input id="mt-stake" type="number" inputmode="numeric" min="${M.match.stake.min}" max="${M.match.stake.max}" step="1" value="${M.stake}" aria-label="${tr('mt.stakeLbl')}"></label>
      <button aria-label="${tr('mt.inc')}" data-mt="inc">+</button></div>
    <div id="mt-sum">${stakeLine()}</div>
    ${lowCoins ? `<p class="mt-note">${tr('mt.lowNote')}</p>` : ''}
    <button type="button" class="mt-btn primary" id="mt-start" data-mt="start" ${st.off ? 'disabled' : ''}>${st.label}</button>`;
}

// ---- tự chọn cặp -----------------------------------------------------------------------------------------------
const headChip = (f, size = 48, ring = '') => `<span class="mt-head-c" style="width:${size}px;height:${size}px;background:${esc(f.color || '#6D28D9')};${ring}"><b>${esc(f.initials)}</b>${f.headUrl ? `<img src="${esc(f.headUrl)}" alt="" loading="lazy">` : ''}</span>`;
function customHtml() {
  const slotBox = (side) => {
    const f = M.slots[side], corner = side === 'A' ? 'red' : 'blue';
    return `<button type="button" class="mt-slot ${corner}${M.active === side ? ' active' : ''}" data-mt="slot-${side}" aria-pressed="${M.active === side}" aria-label="${cornerName(corner)}: ${f ? esc(f.name) : tr('mt.notChosen')}">
      ${f ? headChip(f) : '<span class="mt-head-c empty"><b>?</b></span>'}<span class="t"><b>${f ? esc(f.name) : tr('mt.notChosenCap')}</b><small>${cornerName(corner)}</small></span></button>`;
  };
  const taken = (f) => (M.slots.A?.type === f.type && M.slots.A?.id === f.id ? 'A' : M.slots.B?.type === f.type && M.slots.B?.id === f.id ? 'B' : null);
  let list;
  if (M.sub === 'char') {
    list = `<div class="mt-grid">${M.chars.map((c) => {
      const f = { type: 'character', id: c.id, name: c.name, initials: c.initials, color: c.color, headUrl: c.headUrl };
      const t = taken(f);
      return `<button type="button" class="mt-char${t ? ' on ' + (t === 'A' ? 'red' : 'blue') : ''}" data-mt="char" data-id="${esc(c.id)}" aria-pressed="${!!t}">${headChip(f, 50, t ? `border-color:${t === 'A' ? '#D93A40' : '#3B6FE0'};border-width:3px` : '')}<span>${esc(c.name)}</span>${t ? `<em class="${t === 'A' ? 'red' : 'blue'}">${t === 'A' ? tr('mt.red') : tr('mt.blue')}</em>` : '<em></em>'}</button>`;
    }).join('')}</div><p class="mt-hint">${tr('mt.charHint')}</p>`;
  } else {
    list = `<label class="sr-only" for="mt-q">${tr('c.pickAny')}</label>
      <div class="mt-search">${icon('search', 18)}<input id="mt-q" type="search" placeholder="${tr('mt.searchPh')}" value="${esc(M.q)}" autocomplete="off"></div>
      <div id="mt-users" class="mt-users">${usersHtml(taken)}</div>
      <p class="mt-hint">${tr('mt.userHint')}</p>`;
  }
  const both = M.slots.A && M.slots.B;
  return `${header(tr('mt.custom'), `<button class="mt-back" data-mt="to-pick" aria-label="${tr('ch.back')}">${icon('back', 22)}</button>`)}${tabsHtml()}
    <div class="mt-slots">${slotBox('A')}<span class="mt-vs2">VS</span>${slotBox('B')}</div>
    <div class="mt-tabs pill" role="tablist" aria-label="${tr('mt.fighterType')}"><button role="tab" aria-selected="${M.sub === 'char'}" data-mt="sub-char">${tr('mt.chars')}</button><button role="tab" aria-selected="${M.sub === 'user'}" data-mt="sub-user">${tr('mt.users')}</button></div>
    ${list}
    <button type="button" class="mt-btn ghost" data-mt="fill-random">${icon('shuffle', 18)}${tr('mt.fillRandom')}</button>
    <button type="button" class="mt-btn primary" data-mt="confirm" ${both ? '' : 'disabled'}>${both ? tr('mt.confirmPair') : tr('mt.pickTwo')}</button>`;
}
function usersHtml(taken) {
  if (M.q.trim().length < 2) return `<p class="mt-hint">${tr('mt.type2')}</p>`;
  if (M.loadingUsers) return `<p class="mt-hint">${tr('mt.searching')}</p>`;
  if (!M.users.length) return `<p class="mt-hint">${tr('mt.noOne')}</p>`;
  return M.users.map((u) => {
    const f = { type: 'user', id: u.id, name: u.name, initials: u.initials, color: u.color, headUrl: u.headUrl };
    const t = taken(f);
    return `<button type="button" class="mt-urow${t ? ' on' : ''}" data-mt="user" data-id="${esc(u.id)}" aria-pressed="${!!t}">${headChip(f, 44)}
      <span class="t"><b>${esc(u.name)}${u.self ? ` <small>(${tr('ch.you')})</small>` : ''}</b><small>${esc(u.province || '')}</small></span>
      ${t ? `<em class="${t === 'A' ? 'red' : 'blue'}">${t === 'A' ? tr('mt.red') : tr('mt.blue')}</em>` : u.relation === 'friend' ? `<em class="rel">${tr('nav.friends')}</em>` : u.relation === 'group' ? `<em class="rel">${tr('mt.sameGroup')}</em>` : ''}</button>`;
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

const cur = () => (M.mode === 'pvp' ? M.pvMatch : M.match);
// ---- FIGHT -------------------------------------------------------------------------------------------------------
function fightHtml() {
  const [a, b] = cur().fighters;
  const pf = cur().fighters.find((f) => f.side === M.pick);
  const pvp = M.mode === 'pvp', opp = pvp ? cur().fighters.find((f) => f.side !== M.pick) : null;
  return `${header(tr('mt.match'))}<div id="mt-fight">
    <div class="mt-hud"><div class="hp"><div class="n">${esc(a.name)}</div><div class="bar l"><i id="hp-A" class="red" style="width:100%"></i></div></div>
      <span class="mt-clock" id="mt-clock" role="timer" aria-label="${tr('mt.elapsed')}">0:00</span>
      <div class="hp"><div class="n r">${esc(b.name)}</div><div class="bar r"><i id="hp-B" class="blue" style="width:100%"></i></div></div></div>
    <div class="mt-arena fight" id="mt-ring">${arenaBack()}
      <div class="mt-fighters"><div class="mt-fslot A" id="f-A" role="presentation">${fighterHtml(a, { pose: 'walk', w: 200 })}</div><div class="mt-fslot B" id="f-B" role="presentation">${fighterHtml(b, { pose: 'walk', w: 200 })}</div></div>
      <div class="mt-burst" id="mt-burst" aria-hidden="true"><svg viewBox="0 0 120 120"><polygon points="60,2 72,34 104,18 88,48 118,60 88,72 104,102 72,86 60,118 48,86 16,102 32,72 2,60 32,48 16,18 48,34" fill="#FFC83D" stroke="#B7791F" stroke-width="3" stroke-linejoin="round"/><text id="mt-burst-t" x="60" y="68" text-anchor="middle" transform="rotate(-8 60 60)" font-family="Be Vietnam Pro,system-ui,sans-serif" font-size="22" font-weight="900" fill="#2A1B00">${BURST('punch')}</text></svg></div>
      ${crowdSvg()}</div>
    <div class="mt-count" id="mt-count" hidden aria-live="assertive"></div><div class="mt-log" id="mt-log" role="status" aria-live="polite">${tr('mt.ready')}</div>
    <div class="mt-bet">${pvp ? tr('mt.watchingPvp', { o: `<b>${esc(opp?.name || '')}</b>`, n: `<b>${tr('mt.coins', { n: fmt(M.stake) })}</b>` }) : tr('mt.youBet', { n: `<b>${tr('mt.coins', { n: fmt(M.stake) })}</b>`, f: `<b>${esc(pf?.name || '')}</b>` })}</div>
    <button type="button" class="mt-btn ghost" data-mt="skip">${tr('mt.skip')}</button></div>`;
}
function startFight() {
  const data = M.res, [fa, fb] = cur().fighters, F = { A: fa, B: fb };
  const sp = reduced() ? 0.6 : 1; // giảm chuyển động: rút ngắn thời gian
  const timers = [];
  let done = false, clock = 0;
  const alive = () => !done && M.screen === 'fight' && $('#mt-fight');
  const startLocal = M.mode === 'pvp' ? M.startLocal : Date.now(); // giờ bắt đầu chung (đã quy về đồng hồ máy này)
  const base = startLocal - Date.now();
  const at = (ms, fn) => timers.push(setTimeout(() => { if (alive()) fn(); }, Math.max(0, base + ms * sp)));
  const setPose = (side, pose) => { const el = $(`#f-${side}`); if (el) { el.innerHTML = fighterHtml(F[side], { pose, w: 200 }); mountSprites(el); } };
  const stop = () => { done = true; timers.forEach(clearTimeout); clearInterval(clock); };
  M.stop = stop;
  const finish = () => { if (done) return; stop(); draw('result'); };
  M.skip = finish;
  const cnt = $('#mt-count');
  clock = setInterval(() => {
    const el0 = Date.now() - startLocal;
    if (el0 < 0) { if (cnt) { cnt.hidden = false; cnt.textContent = String(Math.ceil(-el0 / 1000)); } return; } // đếm ngược 3-2-1 trước giờ bắt đầu
    if (cnt) cnt.hidden = true;
    const sec = Math.floor(el0 / sp / 1000); // đồng hồ đếm lên: trận kết thúc khi một bên hết máu
    const el = $('#mt-clock'); if (el) el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }, 200);
  at(450, () => { setPose('A', 'guard'); setPose('B', 'guard'); });
  const ev = data.script.events;
  ev.forEach((e, i) => {
    if (base + e.tMs * sp < -1200) { for (const s of ['A', 'B']) { const bar = $(`#hp-${s}`); if (bar) bar.style.width = `${e.hp[s]}%`; } return; } // vào muộn: đòn này đã qua
    at(e.tMs, () => {
      const t = e.by === 'A' ? 'B' : 'A';
      setPose(e.by, e.move === 'kick' ? 'kick' : 'punch');
      setPose(t, 'stagger');
      $(`#f-${e.by}`)?.classList.add('lunge'); $(`#f-${t}`)?.classList.add('hurt');
      const burst = $('#mt-burst'); if (burst) { $('#mt-burst-t').textContent = BURST(e.move); burst.classList.remove('show'); void burst.offsetWidth; burst.classList.add('show'); }
      const ring = $('#mt-ring'); if (ring && !reduced() && e.damage >= 14) { ring.classList.remove('shake'); void ring.offsetWidth; ring.classList.add('shake'); }
      for (const s of ['A', 'B']) { const bar = $(`#hp-${s}`); if (bar) bar.style.width = `${e.hp[s]}%`; }
      const log = $('#mt-log'); if (log) log.textContent = tr(e.ko ? 'mt.hitKo' : 'mt.hit', { a: F[e.by].name, v: VERB(e.move), b: F[t].name });
    });
    if (!(e.ko && i === ev.length - 1)) at(e.tMs + 420, () => { for (const s of ['A', 'B']) { setPose(s, 'guard'); $(`#f-${s}`)?.classList.remove('lunge', 'hurt'); } });
  });
  const last = ev[ev.length - 1];
  const loser = data.script.winner === 'A' ? 'B' : 'A';
  at(last.tMs + 420, () => { setPose(data.script.winner, 'guard'); $(`#f-${data.script.winner}`)?.classList.remove('lunge'); setPose(loser, 'ko'); const log = $('#mt-log'); if (log) log.textContent = tr('mt.down', { n: F[loser].name }); });
  at(last.tMs + 1900, finish);
}

// ---- RESULT --------------------------------------------------------------------------------------------------------
function resultHtml() {
  const r = M.res.result, [a, b] = cur().fighters, pvp = M.mode === 'pvp', opp = pvp ? (r.pick === 'A' ? b : a) : null;
  const W = r.winner === 'A' ? a : b, L = r.winner === 'A' ? b : a;
  const won = r.won;
  setBalance(M.res.balanceFinal);
  const ko = r.method === 'KO';
  const conf = won ? Array.from({ length: 12 }, (_, i) => `<i class="cf c${i % 5}" style="left:${(i * 83) % 96 + 2}%;top:${(i * 37) % 40 + 4}%;animation-delay:${(i % 6) * 0.15}s"></i>`).join('') : '';
  const loserHtml = ko ? `<div class="mt-loser ko">${fighterHtml(L, { pose: 'ko', w: 140 })}</div>` : `<div class="mt-loser sit">${fighterHtml(L, { pose: 'defeat', w: 150 })}</div>`;
  return `${header(tr('mt.result'))}
    <div class="mt-banner ${won ? 'win' : 'lose'}">${(pvp ? (won ? tr('mt.youBeat', { n: esc(opp.name) }) : tr('mt.beatYou', { n: esc(W.name) })) : tr('mt.wins', { n: esc(W.name) })).toUpperCase()} ${ko ? tr('mt.byKo') : tr('mt.byPoints')}</div>
    <div class="mt-arena result">${arenaBack()}${conf}<div class="mt-winner">${fighterHtml(W, { pose: 'win', crown: true, w: 200 })}</div>${loserHtml}${crowdSvg()}</div>
    <div class="mt-card ${won ? 'win' : 'lose'}" role="status"><div class="a">${pvp ? (won ? tr('mt.youWon') : tr('mt.youLost')) : won ? tr('mt.rightPick') : tr('mt.wrongPick')}</div>
      <div class="b">${won ? '+' + fmt(r.payout) : '−' + fmt(r.stake)} xu</div>
      <div class="c">${won ? (pvp ? tr('mt.pvpWinLine', { s: fmt(r.stake), n: fmt(r.payout - r.stake) }) : tr('mt.winLine', { s: fmt(r.stake), x: cur().payoutMultiplier })) : tr('mt.loseLine', { s: fmt(r.stake) })}</div></div>
    <div class="mt-bal"><span>${tr('mt.newBal')}</span><b>${coinIcon(18)}${fmt(M.res.balanceFinal)}</b></div>
    ${pvp ? `<button type="button" class="mt-btn primary" data-mt="pv-again" id="mt-again">${tr('mt.rematch', { n: fmt(r.stake) })}</button>
    <div class="mt-pair">${M.pv.ch?.opponent?.isFriend ? `<button type="button" class="mt-btn ghost" data-mt="pv-dm" data-id="${M.pv.ch.opponent.id}">${tr('mt.msgTo', { n: esc(opp.name) })}</button>` : `<button type="button" class="mt-btn ghost" data-mt="pv-box">${tr('mt.inbox')}</button>`}<a class="mt-btn ghost" href="#/games">${tr('mt.exit')}</a></div>`
    : `<button type="button" class="mt-btn primary" data-mt="again" id="mt-again">${tr('mt.again')}</button>
    <a class="mt-btn ghost" href="#/games">${tr('mt.exit')}</a>`}`;
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
    if (e.status === 410) { toast(tr('mt.expiredNew')); try { return await newMatch(M.tab === 'random' ? 'random' : 'custom', M.last); } catch { /* xuống dưới */ } }
    toast(e.message); draw('pick');
  }
}

function onInput(e) {
  if (e.target.id?.startsWith('pv-')) return pvpInput(e, M, H);
  if (e.target.id === 'mt-stake') {
    const v = Math.floor(Number(e.target.value));
    if (Number.isFinite(v) && v > 0) { M.stake = Math.min(v, M.match.stake.max); const s = $('#mt-sum'); if (s) s.innerHTML = stakeLine(); const b = $('#mt-start'); if (b) { const st = startState(); b.disabled = st.off || v < M.match.stake.min; b.textContent = v < M.match.stake.min ? tr('mt.min', { n: M.match.stake.min }) : st.label; } }
  } else if (e.target.id === 'mt-q') { M.q = e.target.value; searchUsers(); }
}
async function onClick(e) {
  const t = e.target.closest('[data-mt]');
  if (!t) return;
  const act = t.dataset.mt;
  const clamp = (v) => Math.max(M.match.stake.min, Math.min(M.match.stake.max, v));
  try {
    if (act.startsWith('pv-')) return await pvpAction(act, t, M, H);
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

// ---- thách đấu: cầu nối với pvp.js --------------------------------------------------------------------------------------------
function enterFight(c) {
  M.mode = 'pvp'; M.tab = 'pvp';
  M.pvMatch = { fighters: c.fighters, payoutMultiplier: c.payoutMultiplier };
  M.res = c; M.pick = c.mySide; M.stake = c.stake;
  M.startLocal = c.startAt - (c.serverNow - Date.now()); // quy giờ bắt đầu của máy chủ về đồng hồ máy này
  const end = M.startLocal + c.script.durationMs + 1500;
  if (Date.now() > end) { setBalance(c.balanceFinal); return draw('result'); } // trận đã kết thúc: vào thẳng kết quả
  setBalance(c.balanceAfterStake); // trong lúc phát chưa cộng tiền thắng
  draw('fight');
}
const H = { header, tabsHtml, headChip, fighterHtml, crowdSvg, arenaBack, icon, coinIcon, esc, fmt, draw, setBalance, toast, enterFight };
window.addEventListener('mt-pvp', async (ev) => {
  if (!M || !$('#mt')) return;
  pvpBadge(M);
  const id = ev.detail?.id;
  try {
    if (['pvpwait', 'pvpin'].includes(M.screen) && M.pv.ch?.id === id) routeChallenge(M, H, await api('GET', `/mt/pvp/${encodeURIComponent(id)}`));
    else if (M.screen === 'box') await openBox(M, H);
  } catch { /* bỏ qua */ }
});
