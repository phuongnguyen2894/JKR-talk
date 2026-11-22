// Thách đấu 1v1 Muay Thai: màn tạo lời thách, chờ trả lời, nhận lời, hộp thư. Trận đấu và kết quả dùng chung màn với đấu máy (muaythai.js).
// Máy chủ giữ xu, bốc thăm và chốt kết quả; cả hai máy phát cùng kịch bản từ cùng một giờ bắt đầu.
import { $, S, api } from './core.js';

export const LIM = { min: 10, max: 500 };
const HEX = ['#6D28D9', '#C2410C', '#0F766E', '#B45309', '#1D4ED8', '#BE185D']; // màu đậm theo chỉ số avatarColor (0-5)
const MULT = 1.9;
const payoutOf = (stake) => Math.floor(stake * MULT);
const initialsOf = (name) => { const w = String(name || '?').trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || '?').slice(0, 2)).toUpperCase(); };

export function pvpInit(M) {
  M.pv = { target: null, users: [], friends: null, q: '', loadingUsers: false, fromRed: true, stake: 50, box: 'in', items: [], stats: { wins: 0, losses: 0, net: 0 }, invite: 'friends', incoming: 0, ch: null, off: 0, timer: 0, busy: false };
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
  return `<div class="mt-vscard"><div class="s">${H.fighterHtml(a, { w: 96 })}<b>${H.esc(labelA)}</b><span class="c red">Góc đỏ</span></div>
    <div class="m"><span class="vs">VS</span></div><div class="s">${H.fighterHtml(b, { w: 96 })}<b>${H.esc(labelB)}</b><span class="c blue">Góc xanh</span></div></div>`;
}
function userRows(M, H) {
  const p = M.pv, searching = p.q.trim().length >= 2;
  const list = searching ? p.users : p.friends || [];
  if (searching && p.loadingUsers) return '<p class="mt-hint">Đang tìm…</p>';
  if (!list.length) return `<p class="mt-hint">${searching ? 'Không tìm thấy ai.' : 'Bạn chưa có bạn bè nào trong danh sách. Gõ tên để tìm người khác.'}</p>`;
  return list.map((u) => `<button type="button" class="mt-urow${p.target?.id === u.id ? ' on' : ''}" data-mt="pv-pick" data-id="${H.esc(u.id)}" aria-pressed="${p.target?.id === u.id}" ${u.canChallenge ? '' : 'disabled'}>
    ${H.headChip(u, 44)}<span class="t"><b>${H.esc(u.name)}</b><small>${H.esc(u.province || '')}</small></span>
    ${u.canChallenge ? (u.relation === 'friend' ? '<em class="rel">Bạn bè</em>' : u.relation === 'group' ? '<em class="rel">Cùng nhóm</em>' : '') : `<em class="rel off">${u.self ? 'Bạn' : 'Không nhận lời mời'}</em>`}</button>`).join('');
}
function sendState(M) {
  const p = M.pv;
  if (p.busy) return { label: 'Đang gửi…', off: true };
  if (!p.target) return { label: 'Chọn người để thách đấu', off: true };
  if (p.stake < LIM.min) return { label: `Tối thiểu ${LIM.min} xu`, off: true };
  if (M.balance < p.stake) return { label: 'Không đủ xu tím', off: true };
  return { label: 'Gửi lời thách đấu', off: false };
}
const sumHtml = (stake) => `<div class="mt-sum"><div>Thắng nhận <b class="gold">${payoutOf(stake)} xu</b> <small>(lãi ${payoutOf(stake) - stake})</small></div><i></i><div>Thua <b>−${stake} xu</b></div></div>`;

function createHtml(M, H) {
  const p = M.pv, st = sendState(M), t = p.target;
  const me = meCard();
  const red = p.fromRed ? asFighter(me, 'red') : asFighter(t || { name: '?', initials: '?', color: '#4B3F7A' }, 'red');
  const blue = p.fromRed ? asFighter(t || { name: '?', initials: '?', color: '#4B3F7A' }, 'blue') : asFighter(me, 'blue');
  const nameA = p.fromRed ? 'Bạn' : t?.name || 'Đối thủ', nameB = p.fromRed ? t?.name || 'Đối thủ' : 'Bạn';
  return `${H.header('Muay Thai')}${H.tabsHtml()}
    <button type="button" class="mt-btn ghost" data-mt="pv-box">${H.icon('bell', 18)}Hộp thư thách đấu<span class="mt-badge" id="mt-pvbadge" ${p.incoming ? '' : 'hidden'}>${p.incoming || ''}</span></button>
    <div class="mt-lbl">Chọn người để thách đấu</div>
    <label class="sr-only" for="pv-q">Tìm người dùng</label>
    <div class="mt-search">${H.icon('search', 18)}<input id="pv-q" type="search" placeholder="Tìm theo tên hiển thị" value="${H.esc(p.q)}" autocomplete="off"></div>
    <div id="pv-users" class="mt-users">${userRows(M, H)}</div>
    ${t ? vsCard(H, red, blue, nameA, nameB) + `<button type="button" class="mt-btn ghost sm" data-mt="pv-corner">${H.icon('shuffle', 16)}Đổi góc (bạn đang ở ${p.fromRed ? 'góc đỏ' : 'góc xanh'})</button>` : ''}
    <div class="mt-chips" role="group" aria-label="Chọn nhanh số xu">${[10, 50, 100].map((v) => `<button data-mt="pv-stake" data-v="${v}" aria-pressed="${p.stake === v}">${v}</button>`).join('')}<button class="wide" data-mt="pv-stake" data-v="all" aria-pressed="false">Tất cả</button></div>
    <div class="mt-step"><button aria-label="Giảm 10 xu" data-mt="pv-dec">−</button>
      <label class="mt-amt">${H.coinIcon(18)}<input id="pv-stake" type="number" inputmode="numeric" min="${LIM.min}" max="${LIM.max}" value="${p.stake}" aria-label="Số xu cược mỗi bên"><small>mỗi bên</small></label>
      <button aria-label="Tăng 10 xu" data-mt="pv-inc">+</button></div>
    <div id="pv-sum">${sumHtml(p.stake)}</div>
    <div class="mt-escrow">${H.icon('lock', 18)}<span>${p.stake} xu của bạn được giữ lại ngay. ${t ? H.esc(t.name) : 'Đối thủ'} có 30 phút để trả lời; từ chối, hủy hoặc hết hạn thì hoàn lại đủ. Phí 5% chỉ tính khi có trận.</span></div>
    <button type="button" class="mt-btn primary" id="pv-send" data-mt="pv-send" ${st.off ? 'disabled' : ''}>${st.label}</button>`;
}

function waitHtml(M, H) {
  const c = M.pv.ch, o = c.opponent;
  const [a, b] = c.fighters;
  return `${H.header('Lời thách đấu')}
    <div class="mt-status"><span class="ic">${H.icon('bell', 22)}</span><div><b>Đang chờ ${H.esc(o.name)} trả lời</b><small>Còn <b id="pv-count">${clock(c.expiresAt - (Date.now() + M.pv.off))}</b> trước khi hết hạn</small></div></div>
    <div class="mt-arena wait">${H.arenaBack()}<div class="mt-fighters"><div class="mt-fslot A">${H.fighterHtml(a, { w: 150 })}</div><div class="mt-fslot B dim">${H.fighterHtml(b, { w: 150 })}</div></div>
      <span class="mt-vs" aria-hidden="true">VS</span>${H.crowdSvg()}</div>
    <div class="mt-escrow big">${H.icon('lock', 22)}<span><b>${c.stake} xu đang được giữ lại</b><br>Thắng nhận ${c.payout} xu, thua mất ${c.stake} xu.</span></div>
    <ul class="mt-steps"><li class="done">Đã gửi lời thách và thông báo cho ${H.esc(o.name)}</li><li class="now">${H.esc(o.name)} chấp nhận thì màn này tự vào trận, cả hai xem cùng lúc</li><li>Bạn đang offline thì nhận thông báo, bấm vào xem lại</li></ul>
    ${o.isFriend ? `<button type="button" class="mt-btn ghost" data-mt="pv-dm" data-id="${o.id}">Nhắn cho ${H.esc(o.name)}</button>` : ''}
    <button type="button" class="mt-btn danger" data-mt="pv-cancel">Hủy lời thách (hoàn ${c.stake} xu)</button>`;
}

function inHtml(M, H) {
  const c = M.pv.ch, o = c.opponent;
  const [a, b] = c.fighters;
  const low = M.balance < c.stake;
  const mineSide = c.mySide === 'A' ? 'đỏ' : 'xanh';
  return `${H.header('Lời thách đấu')}
    <div class="mt-status">${H.headChip({ ...o, headUrl: o.headUrl }, 44)}<div><b>${H.esc(o.name)} thách bạn đấu</b><small>${H.esc(o.province || '')} · còn <b id="pv-count">${clock(c.expiresAt - (Date.now() + M.pv.off))}</b> để trả lời</small></div></div>
    <div class="mt-arena wait">${H.arenaBack()}<div class="mt-fighters"><div class="mt-fslot A">${H.fighterHtml(a, { w: 150 })}</div><div class="mt-fslot B">${H.fighterHtml(b, { w: 150 })}</div></div>
      <span class="mt-vs" aria-hidden="true">VS</span><div class="mt-names"><div class="mt-fname A">${H.esc(a.name)}<small>Góc đỏ${c.mySide === 'A' ? ' · Bạn' : ''}</small></div><div class="mt-fname B">${H.esc(b.name)}<small>Góc xanh${c.mySide === 'B' ? ' · Bạn' : ''}</small></div></div>${H.crowdSvg()}</div>
    <div class="mt-rows"><div><span>Mỗi bên cược</span><b>${c.stake} xu</b></div><div><span>Thắng nhận</span><b class="gold">${c.payout} xu <small>(lãi ${c.payout - c.stake}, phí 5%)</small></b></div><div><span>Số dư của bạn</span><b>${H.fmt(M.balance)} → ${H.fmt(Math.max(0, M.balance - c.stake))}</b></div></div>
    <button type="button" class="mt-btn primary" data-mt="pv-accept" data-id="${c.id}" ${low ? 'disabled' : ''}>${low ? 'Không đủ xu tím' : 'Chấp nhận và đấu ngay'}</button>
    <div class="mt-pair"><button type="button" class="mt-btn ghost" data-mt="pv-decline" data-id="${c.id}">Từ chối</button><button type="button" class="mt-btn ghost" data-mt="pv-optout" data-id="${c.id}">Không nhận lời mời nữa</button></div>
    <p class="mt-hint" style="text-align:center">Bạn ở góc ${mineSide}.</p>`;
}

function endHtml(M, H) {
  const c = M.pv.ch;
  const msg = { declined: 'Lời thách đấu đã bị từ chối.', cancelled: 'Lời thách đấu đã được hủy.', expired: 'Lời thách đấu đã hết hạn.' }[c.status] || 'Lời thách đấu không còn hiệu lực.';
  return `${H.header('Lời thách đấu')}<div class="mt-load">${msg}<br>${c.role === 'from' ? `Đã hoàn ${c.stake} xu cho bạn.` : ''}</div>
    <button type="button" class="mt-btn primary" data-mt="pv-back">Thách đấu người khác</button><button type="button" class="mt-btn ghost" data-mt="pv-box">Hộp thư thách đấu</button>`;
}

const ago = (t) => { const d = Date.now() - t, m = Math.floor(d / 60000); return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.floor(m / 60)} giờ trước` : `${Math.floor(m / 1440)} ngày trước`; };
function boxHtml(M, H) {
  const p = M.pv, s = p.stats;
  const row = (it) => {
    const o = it.opponent, f = asFighter(o, 'red');
    const head = `${H.headChip(f, 40)}`;
    if (p.box === 'in') return `<div class="mt-inrow">${head}<div class="t"><b>${H.esc(o.name)} thách bạn</b><small>${it.stake} xu mỗi bên · còn ${clock(it.expiresAt - (Date.now() + p.off))}</small></div>
      <button class="mt-mini primary" data-mt="pv-accept" data-id="${it.id}" ${M.balance < it.stake ? 'disabled' : ''}>Nhận</button><button class="mt-mini" data-mt="pv-decline" data-id="${it.id}">Từ chối</button></div>`;
    if (p.box === 'out') return `<div class="mt-inrow">${head}<div class="t"><b>Thách ${H.esc(o.name)}</b><small>${it.stake} xu mỗi bên · còn ${clock(it.expiresAt - (Date.now() + p.off))}</small></div>
      <button class="mt-mini" data-mt="pv-open" data-id="${it.id}">Xem</button><button class="mt-mini" data-mt="pv-cancel" data-id="${it.id}">Hủy</button></div>`;
    const chip = it.status === 'settled' ? (it.won ? '<span class="chip win">Thắng</span>' : '<span class="chip lose">Thua</span>') : `<span class="chip">${{ declined: 'Từ chối, đã hoàn', cancelled: 'Đã hủy, đã hoàn', expired: 'Hết hạn, đã hoàn' }[it.status] || it.status}</span>`;
    const amt = it.status === 'settled' ? `<b class="${it.won ? 'gold' : ''}">${it.delta > 0 ? '+' : '−'}${Math.abs(it.delta)}</b>` : '<b class="muted">0</b>';
    return `<div class="mt-inrow hist" ${it.status === 'settled' ? `data-mt="pv-open" data-id="${it.id}" role="button" tabindex="0"` : ''}>${head}<div class="t"><b>${H.esc(o.name)}</b><small>${ago(it.at)} · ${it.stake} xu mỗi bên</small></div>${amt}${chip}</div>`;
  };
  const empty = { in: 'Chưa có lời thách nào gửi cho bạn.', out: 'Bạn chưa có lời thách nào đang chờ.', history: 'Chưa có trận thách đấu nào.' }[p.box];
  return `${H.header('Thách đấu', `<button class="mt-back" data-mt="pv-back" aria-label="Quay lại">${H.icon('back', 22)}</button>`)}
    <div class="mt-stats"><div><b>${s.wins}</b><span>Thắng</span></div><i></i><div><b>${s.losses}</b><span>Thua</span></div><i></i><div><b class="gold">${s.net > 0 ? '+' : s.net < 0 ? '−' : ''}${Math.abs(s.net)}</b><span>Xu ròng</span></div></div>
    <div class="mt-tabs" role="tablist" aria-label="Hộp thư">${[['in', 'Nhận'], ['out', 'Đã gửi'], ['history', 'Lịch sử']].map(([k, n]) => `<button role="tab" aria-selected="${p.box === k}" data-mt="pv-box-tab" data-v="${k}">${n}${k === 'in' && p.incoming ? `<span class="mt-badge">${p.incoming}</span>` : ''}</button>`).join('')}</div>
    <div class="mt-users">${p.items.map(row).join('') || `<p class="mt-hint">${empty}</p>`}</div>
    <div class="mt-pref"><b>Ai được mời bạn đấu?</b><div>${[['everyone', 'Mọi người'], ['friends', 'Bạn bè'], ['none', 'Không ai']].map(([k, n]) => `<button data-mt="pv-pref" data-v="${k}" aria-pressed="${p.invite === k}">${n}</button>`).join('')}</div></div>`;
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
  Object.assign(M.pv, { items: r.items, stats: r.stats, incoming: r.incoming, invite: r.invite, off: r.serverNow - Date.now() });
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
    H.toast(`Đã hủy, hoàn ${c.stake} xu`);
    return p.ch && p.ch.id === id ? openCreate(M, H) : refreshBox(M, H);
  }
  if (act === 'pv-accept') {
    t.disabled = true;
    try { const c = await api('POST', `/mt/pvp/${t.dataset.id}/accept`); await refreshBal(); p.ch = c; p.off = c.serverNow - Date.now(); return H.enterFight(c); } catch (e) { t.disabled = false; H.toast(e.message); if (M.screen === 'box') await refreshBox(M, H); else if (p.ch) pvpOpen(M, H, p.ch.id).catch(() => {}); }
    return;
  }
  if (act === 'pv-decline' || act === 'pv-optout') {
    if (act === 'pv-optout') { await api('PUT', '/mt/pvp/settings', { invite: 'none' }); p.invite = 'none'; }
    await api('POST', `/mt/pvp/${t.dataset.id}/decline`);
    H.toast(act === 'pv-optout' ? 'Đã từ chối. Bạn sẽ không nhận lời mời đấu nữa' : 'Đã từ chối');
    return M.screen === 'box' ? refreshBox(M, H) : openBox(M, H);
  }
  if (act === 'pv-box') return openBox(M, H);
  if (act === 'pv-box-tab') { p.box = t.dataset.v; return refreshBox(M, H); }
  if (act === 'pv-pref') { await api('PUT', '/mt/pvp/settings', { invite: t.dataset.v }); p.invite = t.dataset.v; return H.draw('box'); }
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
