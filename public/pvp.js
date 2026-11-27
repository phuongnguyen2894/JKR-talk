// Thách đấu 1v1 Muay Thai: màn tạo lời thách, chờ trả lời, nhận lời, hộp thư. Trận đấu và kết quả dùng chung màn với đấu máy (muaythai.js).
// Máy chủ giữ xu, bốc thăm và chốt kết quả; cả hai máy phát cùng kịch bản từ cùng một giờ bắt đầu.
import { $, S, api } from './core.js';
import { t as tr } from './i18n.js';

export const LIM = { min: 10, max: 500 };
const HEX = ['#6D28D9', '#C2410C', '#0F766E', '#B45309', '#1D4ED8', '#BE185D']; // màu đậm theo chỉ số avatarColor (0-5)
const MULT = 1.9;
const payoutOf = (stake) => Math.floor(stake * MULT);
const initialsOf = (name) => { const w = String(name || '?').trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || '?').slice(0, 2)).toUpperCase(); };

export function pvpInit(M) {
  M.pv = { target: null, users: [], friends: null, q: '', loadingUsers: false, fromRed: true, stake: 50, box: 'in', items: [], stats: { wins: 0, losses: 0, net: 0 }, incoming: 0, ch: null, off: 0, timer: 0, busy: false };
}
export function pvpStop(M) { if (M.pv?.timer) { clearInterval(M.pv.timer); M.pv.timer = 0; } }

const meCard = () => ({ id: S.me.id, name: S.me.displayName, initials: initialsOf(S.me.displayName), color: HEX[Number(S.me.avatarColor) || 0] || HEX[0], headUrl: S.me.avatarUrl || null });
const asFighter = (u, corner) => ({ corner, name: u.name, initials: u.initials, color: u.color, headUrl: u.headUrl });
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export async function pvpBadge(M) {
  try { const r = await api('GET', '/mt/pvp?box=in'); M.pv.incoming = r.incoming; const b = $('#mt-pvbadge'); if (b) { b.textContent = r.incoming || ''; b.hidden = !r.incoming; } } catch { /* bỏ qua */ }
}

// ---- HTML từng màn --------------------------------------------------------------------------------------------------
const pill = (t) => `<span class="mt-pill2">${t}</span>`;
function vsCard(H, a, b, labelA, labelB) {
  return `<div class="mt-vscard"><div class="s">${H.fighterHtml(a, { w: 96 })}<b>${H.esc(labelA)}</b><span class="c red">${tr('mt.red')}</span></div>
    <div class="m"><span class="vs">VS</span></div><div class="s">${H.fighterHtml(b, { w: 96 })}<b>${H.esc(labelB)}</b><span class="c blue">${tr('mt.blue')}</span></div></div>`;
}
function userRows(M, H) {
  const p = M.pv, searching = p.q.trim().length >= 2;
  const list = searching ? p.users : p.friends || [];
  if (searching && p.loadingUsers) return `<p class="mt-hint">${tr('mt.searching')}</p>`;
  if (!list.length) return `<p class="mt-hint">${searching ? tr('mt.noOne') : tr('pv.noFriends')}</p>`;
  return list.map((u) => `<button type="button" class="mt-urow${p.target?.id === u.id ? ' on' : ''}" data-mt="pv-pick" data-id="${H.esc(u.id)}" aria-pressed="${p.target?.id === u.id}" ${u.canChallenge ? '' : 'disabled'}>
    ${H.headChip(u, 44)}<span class="t"><b>${H.esc(u.name)}</b><small>${H.esc(u.province || '')}</small></span>
    ${u.canChallenge ? (u.relation === 'friend' ? `<em class="rel">${tr('nav.friends')}</em>` : u.relation === 'group' ? `<em class="rel">${tr('mt.sameGroup')}</em>` : '') : `<em class="rel off">${u.self ? tr('wl.you') : tr('pv.noInvites')}</em>`}</button>`).join('');
}
function sendState(M) {
  const p = M.pv;
  if (p.busy) return { label: tr('pv.sending'), off: true };
  if (!p.target) return { label: tr('pv.pickWho'), off: true };
  if (p.stake < LIM.min) return { label: tr('mt.min', { n: LIM.min }), off: true };
  if (M.balance < p.stake) return { label: tr('mt.noCoins'), off: true };
  return { label: tr('pv.send'), off: false };
}
const sumHtml = (stake) => `<div class="mt-sum"><div>${tr('pv.winGet')} <b class="gold">${tr('mt.coins', { n: payoutOf(stake) })}</b> <small>(${tr('pv.profit', { n: payoutOf(stake) - stake })})</small></div><i></i><div>${tr('mt.lose')} <b>−${tr('mt.coins', { n: stake })}</b></div></div>`;

function createHtml(M, H) {
  const p = M.pv, st = sendState(M), t = p.target;
  const me = meCard();
  const red = p.fromRed ? asFighter(me, 'red') : asFighter(t || { name: '?', initials: '?', color: '#4B3F7A' }, 'red');
  const blue = p.fromRed ? asFighter(t || { name: '?', initials: '?', color: '#4B3F7A' }, 'blue') : asFighter(me, 'blue');
  const nameA = p.fromRed ? tr('wl.you') : t?.name || tr('pv.opponent'), nameB = p.fromRed ? t?.name || tr('pv.opponent') : tr('wl.you');
  return `${H.header('Muay Thai')}${H.tabsHtml()}
    <button type="button" class="mt-btn ghost" data-mt="pv-box">${H.icon('bell', 18)}${tr('pv.inbox')}<span class="mt-badge" id="mt-pvbadge" ${p.incoming ? '' : 'hidden'}>${p.incoming || ''}</span></button>
    <div class="mt-lbl">${tr('pv.pickWho')}</div>
    <label class="sr-only" for="pv-q">${tr('c.pickAny')}</label>
    <div class="mt-search">${H.icon('search', 18)}<input id="pv-q" type="search" placeholder="${tr('mt.searchPh')}" value="${H.esc(p.q)}" autocomplete="off"></div>
    <div id="pv-users" class="mt-users">${userRows(M, H)}</div>
    ${t ? vsCard(H, red, blue, nameA, nameB) + `<button type="button" class="mt-btn ghost sm" data-mt="pv-corner">${H.icon('shuffle', 16)}${tr('pv.swap', { c: p.fromRed ? tr('mt.red') : tr('mt.blue') })}</button>` : ''}
    <div class="mt-chips" role="group" aria-label="${tr('mt.quick')}">${[10, 50, 100].map((v) => `<button data-mt="pv-stake" data-v="${v}" aria-pressed="${p.stake === v}">${v}</button>`).join('')}<button class="wide" data-mt="pv-stake" data-v="all" aria-pressed="false">${tr('em.all')}</button></div>
    <div class="mt-step"><button aria-label="${tr('mt.dec')}" data-mt="pv-dec">−</button>
      <label class="mt-amt">${H.coinIcon(18)}<input id="pv-stake" type="number" inputmode="numeric" min="${LIM.min}" max="${LIM.max}" value="${p.stake}" aria-label="${tr('pv.stakeEach')}"><small>${tr('pv.each')}</small></label>
      <button aria-label="${tr('mt.inc')}" data-mt="pv-inc">+</button></div>
    <div id="pv-sum">${sumHtml(p.stake)}</div>
    <div class="mt-escrow">${H.icon('lock', 18)}<span>${tr('pv.escrow', { n: p.stake, o: t ? H.esc(t.name) : tr('pv.opponent') })}</span></div>
    <button type="button" class="mt-btn primary" id="pv-send" data-mt="pv-send" ${st.off ? 'disabled' : ''}>${st.label}</button>`;
}

function waitHtml(M, H) {
  const c = M.pv.ch, o = c.opponent;
  const [a, b] = c.fighters;
  return `${H.header(tr('pv.challenge'))}
    <div class="mt-status"><span class="ic">${H.icon('bell', 22)}</span><div><b>${tr('pv.waitingFor', { n: H.esc(o.name) })}</b><small>${tr('pv.timeLeft', { t: `<b id="pv-count">${clock(c.expiresAt - (Date.now() + M.pv.off))}</b>` })}</small></div></div>
    <div class="mt-arena wait">${H.arenaBack()}<div class="mt-fighters"><div class="mt-fslot A">${H.fighterHtml(a, { w: 150 })}</div><div class="mt-fslot B dim">${H.fighterHtml(b, { w: 150 })}</div></div>
      <span class="mt-vs" aria-hidden="true">VS</span>${H.crowdSvg()}</div>
    <div class="mt-escrow big">${H.icon('lock', 22)}<span><b>${tr('pv.held', { n: c.stake })}</b><br>${tr('pv.winLose', { w: c.payout, l: c.stake })}</span></div>
    <ul class="mt-steps"><li class="done">${tr('pv.step1', { n: H.esc(o.name) })}</li><li class="now">${tr('pv.step2', { n: H.esc(o.name) })}</li><li>${tr('pv.step3')}</li></ul>
    ${o.isFriend ? `<button type="button" class="mt-btn ghost" data-mt="pv-dm" data-id="${o.id}">${tr('mt.msgTo', { n: H.esc(o.name) })}</button>` : ''}
    <button type="button" class="mt-btn danger" data-mt="pv-cancel">${tr('pv.cancel', { n: c.stake })}</button>`;
}

function inHtml(M, H) {
  const c = M.pv.ch, o = c.opponent;
  const [a, b] = c.fighters;
  const low = M.balance < c.stake;
  const mineSide = c.mySide === 'A' ? tr('mt.red') : tr('mt.blue');
  return `${H.header(tr('pv.challenge'))}
    <div class="mt-status">${H.headChip({ ...o, headUrl: o.headUrl }, 44)}<div><b>${tr('pv.challengesYou', { n: H.esc(o.name) })}</b><small>${H.esc(o.province || '')} · ${tr('pv.toAnswer', { t: `<b id="pv-count">${clock(c.expiresAt - (Date.now() + M.pv.off))}</b>` })}</small></div></div>
    <div class="mt-arena wait">${H.arenaBack()}<div class="mt-fighters"><div class="mt-fslot A">${H.fighterHtml(a, { w: 150 })}</div><div class="mt-fslot B">${H.fighterHtml(b, { w: 150 })}</div></div>
      <span class="mt-vs" aria-hidden="true">VS</span><div class="mt-names"><div class="mt-fname A">${H.esc(a.name)}<small>${tr('mt.red')}${c.mySide === 'A' ? ` · ${tr('wl.you')}` : ''}</small></div><div class="mt-fname B">${H.esc(b.name)}<small>${tr('mt.blue')}${c.mySide === 'B' ? ` · ${tr('wl.you')}` : ''}</small></div></div>${H.crowdSvg()}</div>
    <div class="mt-rows"><div><span>${tr('pv.betEach')}</span><b>${tr('mt.coins', { n: c.stake })}</b></div><div><span>${tr('pv.winGet')}</span><b class="gold">${tr('mt.coins', { n: c.payout })} <small>(${tr('pv.profitFee', { n: c.payout - c.stake })})</small></b></div><div><span>${tr('pv.yourBal')}</span><b>${H.fmt(M.balance)} → ${H.fmt(Math.max(0, M.balance - c.stake))}</b></div></div>
    <button type="button" class="mt-btn primary" data-mt="pv-accept" data-id="${c.id}" ${low ? 'disabled' : ''}>${low ? tr('mt.noCoins') : tr('pv.acceptNow')}</button>
    <div class="mt-pair"><button type="button" class="mt-btn ghost" data-mt="pv-decline" data-id="${c.id}">${tr('ch.reject')}</button></div>
    <p class="mt-hint" style="text-align:center">${tr('pv.yourCorner', { c: mineSide })}</p>`;
}

function endHtml(M, H) {
  const c = M.pv.ch;
  const msg = { declined: tr('pv.declined'), cancelled: tr('pv.cancelled'), expired: tr('pv.expired') }[c.status] || tr('pv.invalid');
  return `${H.header(tr('pv.challenge'))}<div class="mt-load">${msg}<br>${c.role === 'from' ? tr('pv.refunded', { n: c.stake }) : ''}</div>
    <button type="button" class="mt-btn primary" data-mt="pv-back">${tr('pv.other')}</button><button type="button" class="mt-btn ghost" data-mt="pv-box">${tr('pv.inbox')}</button>`;
}

const ago = (t) => { const d = Date.now() - t, m = Math.floor(d / 60000); return m < 1 ? tr('ago.now') : m < 60 ? tr('ago.min', { n: m }) : m < 1440 ? tr('ago.hour', { n: Math.floor(m / 60) }) : tr('ago.day', { n: Math.floor(m / 1440) }); };
function boxHtml(M, H) {
  const p = M.pv, s = p.stats;
  const row = (it) => {
    const o = it.opponent, f = asFighter(o, 'red');
    const head = `${H.headChip(f, 40)}`;
    if (p.box === 'in') return `<div class="mt-inrow">${head}<div class="t"><b>${tr('pv.challengesYouShort', { n: H.esc(o.name) })}</b><small>${tr('pv.eachLeft', { n: it.stake, t: clock(it.expiresAt - (Date.now() + p.off)) })}</small></div>
      <button class="mt-mini primary" data-mt="pv-accept" data-id="${it.id}" ${M.balance < it.stake ? 'disabled' : ''}>${tr('pv.take')}</button><button class="mt-mini" data-mt="pv-decline" data-id="${it.id}">${tr('ch.reject')}</button></div>`;
    if (p.box === 'out') return `<div class="mt-inrow">${head}<div class="t"><b>${tr('pv.youChallenge', { n: H.esc(o.name) })}</b><small>${tr('pv.eachLeft', { n: it.stake, t: clock(it.expiresAt - (Date.now() + p.off)) })}</small></div>
      <button class="mt-mini" data-mt="pv-open" data-id="${it.id}">${tr('pv.view')}</button><button class="mt-mini" data-mt="pv-cancel" data-id="${it.id}">${tr('c.cancel')}</button></div>`;
    const chip = it.status === 'settled' ? (it.won ? `<span class="chip win">${tr('pv.won')}</span>` : `<span class="chip lose">${tr('pv.lost')}</span>`) : `<span class="chip">${{ declined: tr('pv.hDeclined'), cancelled: tr('pv.hCancelled'), expired: tr('pv.hExpired') }[it.status] || it.status}</span>`;
    const amt = it.status === 'settled' ? `<b class="${it.won ? 'gold' : ''}">${it.delta > 0 ? '+' : '−'}${Math.abs(it.delta)}</b>` : '<b class="muted">0</b>';
    return `<div class="mt-inrow hist" ${it.status === 'settled' ? `data-mt="pv-open" data-id="${it.id}" role="button" tabindex="0"` : ''}>${head}<div class="t"><b>${H.esc(o.name)}</b><small>${ago(it.at)} · ${tr('pv.eachN', { n: it.stake })}</small></div>${amt}${chip}</div>`;
  };
  const empty = { in: tr('pv.emptyIn'), out: tr('pv.emptyOut'), history: tr('pv.emptyHist') }[p.box];
  return `${H.header(tr('mt.pvp'), `<button class="mt-back" data-mt="pv-back" aria-label="${tr('ch.back')}">${H.icon('back', 22)}</button>`)}
    <div class="mt-stats"><div><b>${s.wins}</b><span>${tr('pv.won')}</span></div><i></i><div><b>${s.losses}</b><span>${tr('pv.lost')}</span></div><i></i><div><b class="gold">${s.net > 0 ? '+' : s.net < 0 ? '−' : ''}${Math.abs(s.net)}</b><span>${tr('pv.net')}</span></div></div>
    <div class="mt-tabs" role="tablist" aria-label="${tr('mt.inbox')}">${[['in', tr('pv.tIn')], ['out', tr('pv.tOut')], ['history', tr('pv.tHist')]].map(([k, n]) => `<button role="tab" aria-selected="${p.box === k}" data-mt="pv-box-tab" data-v="${k}">${n}${k === 'in' && p.incoming ? `<span class="mt-badge">${p.incoming}</span>` : ''}</button>`).join('')}</div>
    <div class="mt-users">${p.items.map(row).join('') || `<p class="mt-hint">${empty}</p>`}</div>`;
}

export function pvpScreenHtml(M, screen, H) {
  return screen === 'pvp' ? createHtml(M, H) : screen === 'pvpwait' ? waitHtml(M, H) : screen === 'pvpin' ? inHtml(M, H) : screen === 'pvpend' ? endHtml(M, H) : boxHtml(M, H);
}

// ---- tải dữ liệu, đồng hồ đếm ngược ------------------------------------------------------------------------------------------
export function pvpTicker(M, H) {
  pvpStop(M);
  M.pv.timer = setInterval(() => {
    if (!$('#mt')) return pvpStop(M);
    const c = M.pv.ch;
    const el = $('#pv-count');
    if (el && c) { const left = c.expiresAt - (Date.now() + M.pv.off); el.textContent = clock(left); if (left <= -1500) { pvpStop(M); pvpOpen(M, H, c.id); } }
  }, 1000);
}
export async function loadFriends(M) {
  if (M.pv.friends) return;
  try { M.pv.friends = (await api('GET', '/mt/users?friends=1')).users; } catch { M.pv.friends = []; }
}
export async function loadBox(M) {
  const r = await api('GET', `/mt/pvp?box=${M.pv.box}`);
  Object.assign(M.pv, { items: r.items, stats: r.stats, incoming: r.incoming, off: r.serverNow - Date.now() });
}
export async function openCreate(M, H) {
  M.tab = 'pvp'; M.mode = null;
  try { history.replaceState(null, '', '#/muaythai/pvp'); } catch { /* bỏ qua */ }
  H.draw('pvp');
  await Promise.all([loadFriends(M), pvpBadge(M)]);
  if (M.screen === 'pvp') { const box = $('#pv-users'); if (box) box.innerHTML = userRows(M, H); }
}
export async function openBox(M, H) {
  M.tab = 'pvp'; M.mode = null;
  try { history.replaceState(null, '', '#/muaythai/box'); } catch { /* bỏ qua */ }
  await loadBox(M);
  H.draw('box');
  pvpTicker(M, H);
}
// mở một lời thách theo trạng thái hiện tại
export async function pvpOpen(M, H, id) {
  const c = await api('GET', `/mt/pvp/${encodeURIComponent(id)}`);
  routeChallenge(M, H, c);
}
export function routeChallenge(M, H, c) {
  M.tab = 'pvp';
  M.pv.ch = c; M.pv.off = c.serverNow - Date.now();
  try { history.replaceState(null, '', `#/muaythai/pvp/${c.id}`); } catch { /* bỏ qua */ }
  if (c.status === 'settled') return H.enterFight(c);
  if (c.status === 'pending') { H.draw(c.role === 'from' ? 'pvpwait' : 'pvpin'); return pvpTicker(M, H); }
  H.draw('pvpend');
}

// ---- thao tác ---------------------------------------------------------------------------------------------------------------
let searchSeq = 0, searchTimer = 0;
export function pvpInput(e, M, H) {
  const p = M.pv;
  if (e.target.id === 'pv-q') {
    p.q = e.target.value; clearTimeout(searchTimer);
    const q = p.q.trim();
    const paint = () => { const box = $('#pv-users'); if (box) box.innerHTML = userRows(M, H); };
    if (q.length < 2) { p.users = []; p.loadingUsers = false; return paint(); }
    p.loadingUsers = true; paint();
    const seq = ++searchSeq;
    searchTimer = setTimeout(async () => {
      try { const r = await api('GET', `/mt/users?q=${encodeURIComponent(q)}`); if (seq === searchSeq) p.users = r.users; } catch (er) { if (seq === searchSeq) { p.users = []; H.toast(er.message); } }
      if (seq === searchSeq) { p.loadingUsers = false; paint(); }
    }, 300);
  } else if (e.target.id === 'pv-stake') {
    const v = Math.floor(Number(e.target.value));
    if (Number.isFinite(v) && v > 0) {
      p.stake = Math.min(v, LIM.max);
      const s = $('#pv-sum'); if (s) s.innerHTML = sumHtml(p.stake);
      const b = $('#pv-send'); if (b) { const st = sendState(M); b.disabled = st.off; b.textContent = st.label; }
    }
  }
}

export async function pvpAction(act, t, M, H) {
  const p = M.pv;
  const clamp = (v) => Math.max(LIM.min, Math.min(LIM.max, v));
  const refreshBal = async () => { try { H.setBalance((await api('GET', '/mt/wallet')).balance); } catch { /* bỏ qua */ } };
  if (act === 'pv-tab') return openCreate(M, H);
  if (act === 'pv-pick') { const u = [...(p.friends || []), ...p.users].find((x) => x.id === t.dataset.id); if (u && u.canChallenge) { p.target = u; const q = p.q; H.draw('pvp'); const i = $('#pv-q'); if (i) i.value = q; } return; }
  if (act === 'pv-corner') { p.fromRed = !p.fromRed; const q = p.q; H.draw('pvp'); const i = $('#pv-q'); if (i) i.value = q; return; }
  if (act === 'pv-stake') { p.stake = t.dataset.v === 'all' ? clamp(Math.min(LIM.max, M.balance)) : Number(t.dataset.v); return keep(M, H); }
  if (act === 'pv-inc') { p.stake = clamp(p.stake + 10); return keep(M, H); }
  if (act === 'pv-dec') { p.stake = clamp(p.stake - 10); return keep(M, H); }
  if (act === 'pv-send') {
    const st = sendState(M); if (st.off) return;
    p.busy = true; H.draw('pvp');
    try {
      const c = await api('POST', '/mt/pvp', { toId: Number(p.target.id), stake: p.stake, fromRed: p.fromRed });
      p.busy = false; await refreshBal();
      routeChallenge(M, H, c);
    } catch (e) { p.busy = false; H.toast(e.message); const q = p.q; H.draw('pvp'); const i = $('#pv-q'); if (i) i.value = q; }
    return;
  }
  if (act === 'pv-cancel') {
    const id = t.dataset.id || p.ch?.id;
    const c = await api('POST', `/mt/pvp/${id}/cancel`); await refreshBal();
    H.toast(tr('pv.cancelledToast', { n: c.stake }));
    return p.ch && p.ch.id === id ? openCreate(M, H) : refreshBox(M, H);
  }
  if (act === 'pv-accept') {
    t.disabled = true;
    try { const c = await api('POST', `/mt/pvp/${t.dataset.id}/accept`); await refreshBal(); p.ch = c; p.off = c.serverNow - Date.now(); return H.enterFight(c); } catch (e) { t.disabled = false; H.toast(e.message); if (M.screen === 'box') await refreshBox(M, H); else if (p.ch) pvpOpen(M, H, p.ch.id).catch(() => {}); }
    return;
  }
  if (act === 'pv-decline') {
    await api('POST', `/mt/pvp/${t.dataset.id}/decline`);
    H.toast(tr('ch.rejected'));
    return M.screen === 'box' ? refreshBox(M, H) : openBox(M, H);
  }
  if (act === 'pv-box') return openBox(M, H);
  if (act === 'pv-box-tab') { p.box = t.dataset.v; return refreshBox(M, H); }
  if (act === 'pv-back') return openCreate(M, H);
  if (act === 'pv-open') return pvpOpen(M, H, t.dataset.id);
  if (act === 'pv-dm') { const { group } = await api('POST', `/dm/${t.dataset.id}`); location.hash = `#/chat/${group.id}`; return; }
  if (act === 'pv-again') { // đòi lại: thách lại cùng người, cùng mức cược
    const c0 = p.ch; if (!c0) return;
    t.disabled = true;
    try { const c = await api('POST', '/mt/pvp', { toId: c0.opponent.id, stake: c0.stake, fromRed: c0.mySide === 'A' }); await refreshBal(); routeChallenge(M, H, c); } catch (e) { t.disabled = false; H.toast(e.message); }
  }
}
async function refreshBox(M, H) { await loadBox(M); H.draw('box'); pvpTicker(M, H); }
function keep(M, H) { const q = M.pv.q; H.draw('pvp'); const i = $('#pv-q'); if (i) i.value = q; }
