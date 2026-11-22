// Thách đấu 1v1 Muay Thai: người dùng mời nhau, cả hai cùng cược xu tím.
// Xu của người mời bị giữ ngay khi gửi, xu của người nhận bị giữ khi chấp nhận; máy chủ bốc thăm 50/50 và chốt kết quả trong một giao dịch.
// Hủy / từ chối / hết hạn (30 phút) thì hoàn đủ cho người mời. Người thắng nhận payoutFor(cược) = 1.9 x cược (phí 5% bị loại khỏi nền xu).
// Cả hai xem cùng lúc: máy chủ ghi giờ bắt đầu (sau 3 giây), mọi máy phát cùng một kịch bản từ giờ đó.
import crypto from 'node:crypto';
import { db, tx, now } from './db.js';
import { HttpError, bad, forbidden, notFound, getUser, rateLimit, isBlockedEither, areFriends, notify, hub, locationOf, log } from './lib.js';
import { balanceOf } from './levels.js';
import { MT, validStake, payoutFor, generateScript, fighterView, initialsOf, defaultHead, avatarHex } from './muaythai.js';

export const PVP = { TTL_MS: 30 * 60_000, START_DELAY_MS: 3000, MAX_PENDING_OUT: 5, INVITES_PER_HOUR: 10, PAIR_PER_DAY: 10 };

db.exec(`
CREATE TABLE IF NOT EXISTS mt_challenges (
  id TEXT PRIMARY KEY, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, stake INTEGER NOT NULL, from_red INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  winner TEXT, script TEXT, start_at INTEGER, settled_at INTEGER, payout INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mt_ch_to ON mt_challenges(to_id, status);
CREATE INDEX IF NOT EXISTS idx_mt_ch_from ON mt_challenges(from_id, status);
`);
// quyền nhận lời mời: everyone | friends (mặc định) | none
try { db.exec("ALTER TABLE users ADD COLUMN mt_invite TEXT NOT NULL DEFAULT 'friends'"); } catch { /* đã có cột */ }

class PvpError extends HttpError {
  constructor(status, code, message) { super(status, message); this.code = code; }
}
const err = (status, code, message) => new PvpError(status, code, message);

// ---- sổ xu (cùng bảng mt_ledger với đấu máy) --------------------------------------------------------------
function addNet(uid, delta, reason, id) {
  db.prepare('UPDATE users SET game_net = game_net + ? WHERE id = ?').run(delta, uid);
  db.prepare('INSERT INTO mt_ledger (user_id, delta, reason, match_id, balance_after, created_at) VALUES (?,?,?,?,?,?)').run(uid, delta, reason, id, balanceOf(getUser(uid)), now());
}
const chRow = (id) => (typeof id === 'string' && id.length < 60 ? db.prepare('SELECT * FROM mt_challenges WHERE id = ?').get(id) : null);
const nameOf = (uid) => getUser(uid)?.display_name || 'Người dùng';

// hoàn xu cho người mời và đổi trạng thái (chỉ khi còn chờ)
function closePending(id, status) {
  return tx(() => {
    const c = chRow(id);
    if (!c || c.status !== 'pending') return null;
    db.prepare('UPDATE mt_challenges SET status = ?, settled_at = ? WHERE id = ?').run(status, now(), id);
    addNet(c.from_id, c.stake, 'pvp_refund', id);
    return c;
  });
}
export function expireDue() {
  const rows = db.prepare("SELECT id FROM mt_challenges WHERE status = 'pending' AND expires_at < ?").all(now());
  for (const { id } of rows) {
    const c = closePending(id, 'expired');
    if (c) {
      notify(c.from_id, 'mt_invite', `Lời thách đấu tới ${nameOf(c.to_id)} đã hết hạn, đã hoàn ${c.stake} xu`, { url: '/#/muaythai/box', tag: `mtch-${id}` });
      hub.send(c.from_id, { type: 'mt_pvp', id });
      hub.send(c.to_id, { type: 'mt_pvp', id });
    }
  }
}

// ---- DTO ------------------------------------------------------------------------------------------------------
const redId = (c) => (c.from_red ? c.from_id : c.to_id);
const blueId = (c) => (c.from_red ? c.to_id : c.from_id);
const sideOf = (c, uid) => (uid === redId(c) ? 'A' : 'B');
function userCard(uid) {
  const u = getUser(uid);
  const own = u && u.status === 'active' ? u.avatar_url : null;
  return { id: uid, name: u && u.status !== 'deleted' ? u.display_name : 'Người dùng', initials: initialsOf(u?.display_name), color: avatarHex(u?.avatar_color), headUrl: own || defaultHead(), province: u ? locationOf(u).province : null };
}
function dto(c, viewer) {
  const mine = viewer === c.from_id ? 'from' : 'to';
  const other = mine === 'from' ? c.to_id : c.from_id;
  const mySide = sideOf(c, viewer);
  const out = {
    id: c.id, status: c.status, stake: c.stake, payout: payoutFor(c.stake), payoutMultiplier: MT.PAYOUT_MULTIPLIER, role: mine,
    createdAt: c.created_at, expiresAt: c.expires_at, serverNow: now(),
    fighters: [fighterView('A', 'user', redId(c)), fighterView('B', 'user', blueId(c))], mySide,
    opponent: { ...userCard(other), isFriend: areFriends(viewer, other) },
  };
  if (c.status === 'settled') {
    const winSide = (c.winner === 'from') === !!c.from_red ? 'A' : 'B';
    const won = winSide === mySide;
    out.result = { winner: winSide, method: 'KO', won, stake: c.stake, payout: won ? c.payout : 0, pick: mySide };
    out.script = JSON.parse(c.script || 'null');
    out.startAt = c.start_at;
    // trong lúc trận còn đang phát, số dư hiển thị chưa cộng tiền thắng (tránh lộ kết quả)
    const bal = balanceOf(getUser(viewer));
    out.balanceFinal = bal;
    out.balanceAfterStake = bal - (won ? c.payout : 0);
  }
  return out;
}
const isOpen = (c) => c.status === 'pending' && c.expires_at >= now();

function stats(uid) {
  const rows = db.prepare("SELECT from_id, to_id, stake, winner, payout FROM mt_challenges WHERE status = 'settled' AND (from_id = ? OR to_id = ?)").all(uid, uid);
  let wins = 0, losses = 0, net = 0;
  for (const r of rows) {
    const won = (r.winner === 'from') === (r.from_id === uid);
    if (won) { wins++; net += r.payout - r.stake; } else { losses++; net -= r.stake; }
  }
  return { wins, losses, net };
}
export const pendingIncoming = (uid) => db.prepare("SELECT COUNT(*) c FROM mt_challenges WHERE to_id = ? AND status = 'pending' AND expires_at >= ?").get(uid, now()).c;

// ---- API --------------------------------------------------------------------------------------------------------
export function mountPvp(api, wrap) {
  const me = (req) => req.user.id;
  const mineOrFail = (req) => {
    expireDue();
    const c = chRow(String(req.params.id));
    if (!c || (c.from_id !== me(req) && c.to_id !== me(req))) throw err(404, 'CHALLENGE_NOT_FOUND', 'Không tìm thấy lời thách đấu');
    return c;
  };

  api.get('/mt/pvp/settings', wrap((req, res) => res.json({ invite: getUser(me(req)).mt_invite || 'friends' })));
  api.put('/mt/pvp/settings', wrap((req, res) => {
    const v = req.body?.invite;
    if (!['everyone', 'friends', 'none'].includes(v)) throw bad('Lựa chọn không hợp lệ');
    db.prepare('UPDATE users SET mt_invite = ? WHERE id = ?').run(v, me(req));
    res.json({ invite: v });
  }));

  // gửi lời thách đấu
  api.post('/mt/pvp', wrap((req, res) => {
    expireDue();
    const uid = me(req);
    rateLimit(`mtinv:${uid}`, PVP.INVITES_PER_HOUR, 3600_000);
    const toId = Number(req.body?.toId), stake = req.body?.stake;
    if (!validStake(stake)) throw err(400, 'INVALID_STAKE', `Số xu cược phải là số nguyên từ ${MT.MIN_STAKE} đến ${MT.MAX_STAKE}`);
    const to = Number.isInteger(toId) ? getUser(toId) : null;
    if (!to || to.status !== 'active' || to.is_super) throw err(404, 'OPPONENT_NOT_FOUND', 'Không tìm thấy người này');
    if (toId === uid) throw err(400, 'SELF', 'Bạn không thể tự thách đấu chính mình');
    if (isBlockedEither(uid, toId)) throw err(403, 'BLOCKED', 'Bạn không thể mời người này');
    const pref = to.mt_invite || 'friends';
    if (pref === 'none' || (pref === 'friends' && !areFriends(uid, toId))) throw err(403, 'NOT_ACCEPTING', `${to.display_name} không nhận lời mời đấu từ bạn`);
    const fromRed = req.body?.fromRed === false ? 0 : 1;
    const id = crypto.randomUUID();
    tx(() => {
      if (db.prepare("SELECT COUNT(*) c FROM mt_challenges WHERE from_id = ? AND status = 'pending'").get(uid).c >= PVP.MAX_PENDING_OUT) throw err(429, 'TOO_MANY_PENDING', `Bạn đang có ${PVP.MAX_PENDING_OUT} lời thách chờ trả lời, hãy đợi hoặc hủy bớt`);
      if (db.prepare("SELECT 1 FROM mt_challenges WHERE from_id = ? AND to_id = ? AND status = 'pending'").get(uid, toId)) throw err(409, 'ALREADY_PENDING', 'Bạn đã có một lời thách đang chờ người này trả lời');
      const day = now() - 86400_000;
      if (db.prepare("SELECT COUNT(*) c FROM mt_challenges WHERE status = 'settled' AND settled_at > ? AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))").get(day, uid, toId, toId, uid).c >= PVP.PAIR_PER_DAY) throw err(429, 'PAIR_LIMIT', `Hai bạn đã đấu đủ ${PVP.PAIR_PER_DAY} trận hôm nay`);
      if (balanceOf(getUser(uid)) < stake) throw err(402, 'INSUFFICIENT_BALANCE', 'Không đủ xu tím');
      db.prepare('INSERT INTO mt_challenges (id, from_id, to_id, stake, from_red, created_at, expires_at) VALUES (?,?,?,?,?,?,?)').run(id, uid, toId, stake, fromRed, now(), now() + PVP.TTL_MS);
      addNet(uid, -stake, 'pvp_escrow', id);
    });
    notify(toId, 'mt_invite', `${req.user.display_name} thách bạn đấu Muay Thai, cược ${stake} xu. Trả lời trong 30 phút`, { url: `/#/muaythai/pvp/${id}`, tag: `mtch-${id}` });
    hub.send(toId, { type: 'mt_pvp', id });
    res.status(201).json(dto(chRow(id), uid));
  }));

  // danh sách: in (nhận), out (đã gửi), history (lịch sử) + thống kê
  api.get('/mt/pvp', wrap((req, res) => {
    expireDue();
    const uid = me(req), box = ['in', 'out', 'history'].includes(req.query.box) ? req.query.box : 'in';
    let rows;
    if (box === 'in') rows = db.prepare("SELECT * FROM mt_challenges WHERE to_id = ? AND status = 'pending' ORDER BY expires_at").all(uid);
    else if (box === 'out') rows = db.prepare("SELECT * FROM mt_challenges WHERE from_id = ? AND status = 'pending' ORDER BY expires_at").all(uid);
    else rows = db.prepare("SELECT * FROM mt_challenges WHERE (from_id = ? OR to_id = ?) AND status != 'pending' ORDER BY COALESCE(settled_at, created_at) DESC LIMIT 30").all(uid, uid);
    const items = rows.map((c) => {
      const other = uid === c.from_id ? c.to_id : c.from_id;
      const base = { id: c.id, status: c.status, stake: c.stake, role: uid === c.from_id ? 'from' : 'to', expiresAt: c.expires_at, at: c.settled_at || c.created_at, opponent: userCard(other) };
      if (c.status === 'settled') { const won = (c.winner === 'from') === (uid === c.from_id); base.won = won; base.delta = won ? c.payout - c.stake : -c.stake; }
      return base;
    });
    res.json({ items, stats: stats(uid), incoming: pendingIncoming(uid), invite: getUser(uid).mt_invite || 'friends', serverNow: now() });
  }));

  api.get('/mt/pvp/:id', wrap((req, res) => { const c = mineOrFail(req); res.json(dto(c, me(req))); }));

  // chấp nhận: giữ xu của người nhận, bốc thăm, chốt kết quả, ghi giờ bắt đầu chung
  api.post('/mt/pvp/:id/accept', wrap((req, res) => {
    const c0 = mineOrFail(req);
    const uid = me(req);
    if (c0.to_id !== uid) throw forbidden('Chỉ người được mời mới chấp nhận được');
    if (c0.status === 'settled') throw err(409, 'ALREADY_ACCEPTED', 'Trận này đã diễn ra');
    if (c0.status !== 'pending') throw err(410, 'CHALLENGE_CLOSED', 'Lời thách đấu này không còn hiệu lực');
    const winnerFrom = crypto.randomInt(0, 2) === 0;
    tx(() => {
      const c = chRow(c0.id);
      if (c.status !== 'pending' || c.expires_at < now()) throw err(410, 'CHALLENGE_CLOSED', 'Lời thách đấu này không còn hiệu lực');
      if (balanceOf(getUser(uid)) < c.stake) throw err(402, 'INSUFFICIENT_BALANCE', 'Không đủ xu tím');
      addNet(uid, -c.stake, 'pvp_escrow', c.id);
      const winSide = winnerFrom === !!c.from_red ? 'A' : 'B';
      const script = generateScript(winSide);
      const payout = payoutFor(c.stake);
      db.prepare("UPDATE mt_challenges SET status = 'settled', winner = ?, script = ?, start_at = ?, settled_at = ?, payout = ? WHERE id = ?")
        .run(winnerFrom ? 'from' : 'to', JSON.stringify(script), now() + PVP.START_DELAY_MS, now(), payout, c.id);
      addNet(winnerFrom ? c.from_id : c.to_id, payout, 'pvp_payout', c.id);
    });
    notify(c0.from_id, 'mt_invite', `${req.user.display_name} đã chấp nhận, trận đang bắt đầu`, { url: `/#/muaythai/pvp/${c0.id}`, tag: `mtch-${c0.id}` });
    hub.send(c0.from_id, { type: 'mt_pvp', id: c0.id });
    res.json(dto(chRow(c0.id), uid));
  }));

  api.post('/mt/pvp/:id/decline', wrap((req, res) => {
    const c0 = mineOrFail(req);
    if (c0.to_id !== me(req)) throw forbidden('Chỉ người được mời mới từ chối được');
    if (c0.status !== 'pending') throw err(409, 'CHALLENGE_CLOSED', 'Lời thách đấu này không còn hiệu lực');
    closePending(c0.id, 'declined');
    notify(c0.from_id, 'mt_invite', `${req.user.display_name} đã từ chối lời thách đấu, đã hoàn ${c0.stake} xu`, { url: '/#/muaythai/box', tag: `mtch-${c0.id}` });
    hub.send(c0.from_id, { type: 'mt_pvp', id: c0.id });
    res.json(dto(chRow(c0.id), me(req)));
  }));
  api.post('/mt/pvp/:id/cancel', wrap((req, res) => {
    const c0 = mineOrFail(req);
    if (c0.from_id !== me(req)) throw forbidden('Chỉ người mời mới hủy được');
    if (c0.status !== 'pending') throw err(409, 'CHALLENGE_CLOSED', 'Lời thách đấu này không còn hiệu lực');
    closePending(c0.id, 'cancelled');
    hub.send(c0.to_id, { type: 'mt_pvp', id: c0.id });
    res.json(dto(chRow(c0.id), me(req)));
  }));

  setInterval(() => { try { expireDue(); } catch { /* thử lại ở lần sau */ } }, 30_000).unref();
}
