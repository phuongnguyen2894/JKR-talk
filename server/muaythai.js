// Mini game Muay Thai: cược xu tím vào 1 trong 2 võ sĩ, kết quả random 50/50 do máy chủ quyết định.
// Máy khách chỉ hiển thị và phát lại kịch bản hoạt hình. Xu ảo, không nạp bằng tiền thật, không quy đổi ra tiền thật.
// Số dư dùng chung với xu tím của app: số dư = coins - coins_spent + game_net. Lãi/lỗ của game chỉ vào game_net nên không ảnh hưởng cấp (cấp chỉ tính xu đã kiếm).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, tx, now } from './db.js';
import { HttpError, bad, notFound, getUser, rateLimit, isBlockedEither, locationOf, log } from './lib.js';
import { balanceOf } from './levels.js';

export const MT = {
  MIN_STAKE: 10, MAX_STAKE: 500, PAYOUT_MULTIPLIER: 1.9, WINNER_ATTACK_RATE: 65,
  MATCH_TTL_MIN: 30, BET_RATE_LIMIT_MS: 1000, EVENT_MIN: 10, EVENT_MAX: 14, HIT_GAP_MS: 1100,
};

db.exec(`
CREATE TABLE IF NOT EXISTS mt_characters (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, initials TEXT NOT NULL, color TEXT NOT NULL,
  head_image_url TEXT, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS mt_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mt_matches (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, mode TEXT NOT NULL,
  a_type TEXT NOT NULL, a_id TEXT NOT NULL, b_type TEXT NOT NULL, b_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready', winner TEXT, method TEXT, script TEXT,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, settled_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mt_matches_user ON mt_matches(user_id, status);
CREATE TABLE IF NOT EXISTS mt_bets (
  id TEXT PRIMARY KEY, match_id TEXT NOT NULL UNIQUE REFERENCES mt_matches(id), user_id INTEGER NOT NULL,
  pick TEXT NOT NULL, stake INTEGER NOT NULL, won INTEGER NOT NULL, payout INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mt_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL,
  match_id TEXT, balance_after INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mt_ledger_match ON mt_ledger(match_id);
`);
const CHARACTERS = [
  ['juad', 'Juad', 'JU', '#B45309'], ['lolo', 'Lolo', 'LO', '#047857'], ['abu', 'Abu', 'AB', '#B91C1C'], ['udon', 'Udon', 'UD', '#6D28D9'],
  ['capybara', 'Capybara', 'CA', '#92400E'], ['uni', 'Uni', 'UN', '#0E7490'], ['lingorm', 'LingOrm', 'LO', '#BE185D'], ['ormling', 'OrmLing', 'OL', '#A21CAF'],
];
CHARACTERS.forEach(([id, name, initials, color], i) => db.prepare('INSERT OR IGNORE INTO mt_characters (id, name, initials, color, sort_order) VALUES (?,?,?,?,?)').run(id, name, initials, color, i));

// ---- lỗi có mã -------------------------------------------------------------------
class MtError extends HttpError {
  constructor(status, code, message) { super(status, message); this.code = code; }
}
const err = (status, code, message) => new MtError(status, code, message);

// ---- logic thuần (có test) -----------------------------------------------------------
export const validStake = (s) => Number.isInteger(s) && s >= MT.MIN_STAKE && s <= MT.MAX_STAKE;
export const payoutFor = (stake) => Math.floor(stake * MT.PAYOUT_MULTIPLIER);

// chia `total` thành `parts` phần nguyên dương theo trọng số ngẫu nhiên
function split(total, parts, rng) {
  const w = Array.from({ length: parts }, () => rng(1, 6));
  const sum = w.reduce((a, b) => a + b, 0);
  const out = w.map((x) => Math.max(1, Math.floor((total * x) / sum)));
  let diff = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0; i = (i + 1) % parts) {
    if (diff > 0) { out[i]++; diff--; } else if (out[i] > 1) { out[i]--; diff++; }
  }
  return out;
}

// Kịch bản hoạt hình, sinh SAU khi đã biết người thắng nên luôn khớp kết quả. Trận kéo dài cho đến khi một bên hết máu (luôn kết thúc bằng KO).
// Bất biến: đòn cuối do bên thắng tung và làm bên thua hết máu (đúng 1 đòn ko, finalHp[thua] = 0); bên thắng còn máu (> 0);
// HP không bao giờ tăng; tMs tăng dần và < durationMs; 10–14 đòn, mỗi đòn cách nhau khoảng 1,1 giây.
export function generateScript(winner, rng = crypto.randomInt) {
  const loser = winner === 'A' ? 'B' : 'A';
  const n = rng(MT.EVENT_MIN, MT.EVENT_MAX + 1);
  const winnerFinal = rng(15, 81);
  const by = Array.from({ length: n }, (_, i) => (i === n - 1 ? winner : rng(0, 100) < MT.WINNER_ATTACK_RATE ? winner : loser));
  if (!by.slice(0, n - 1).includes(loser)) by[rng(0, n - 1)] = loser; // bên thua phải có ít nhất một đòn để bên thắng mất máu
  const winIdx = by.map((b, i) => (b === winner ? i : -1)).filter((i) => i >= 0);
  const loseIdx = by.map((b, i) => (b === loser ? i : -1)).filter((i) => i >= 0);
  const dmgW = split(100, winIdx.length, rng); // tổng sát thương bên thắng gây ra = toàn bộ máu bên thua
  const dmgL = split(100 - winnerFinal, loseIdx.length, rng);
  const dmg = Array(n).fill(0);
  winIdx.forEach((i, k) => { dmg[i] = dmgW[k]; });
  loseIdx.forEach((i, k) => { dmg[i] = dmgL[k]; });
  const moves = ['punch', 'kick', 'knee', 'elbow'];
  const hp = { A: 100, B: 100 };
  let t = 700;
  const events = by.map((b, i) => {
    const target = b === 'A' ? 'B' : 'A';
    hp[target] = Math.max(0, hp[target] - dmg[i]);
    if (i) t += MT.HIT_GAP_MS + rng(-250, 251);
    const ev = { tMs: t, by: b, move: moves[rng(0, moves.length)], damage: dmg[i], hp: { ...hp } };
    if (i === n - 1) ev.ko = true;
    return ev;
  });
  return { durationMs: t + 1500, events, winner, method: 'KO', finalHp: { ...hp } };
}

// ---- võ sĩ -------------------------------------------------------------------------
// avatar_color của người dùng là chỉ số 0-5 (lớp .av.c0-c5 ở giao diện); trong game cần màu đậm hợp nền tối
const AVATAR_HEX = ['#6D28D9', '#C2410C', '#0F766E', '#B45309', '#1D4ED8', '#BE185D'];
export const avatarHex = (i) => AVATAR_HEX[Number(i) || 0] || AVATAR_HEX[0];
export const initialsOf = (name) => {
  const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const s = w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] || '?').slice(0, 2);
  return s.toUpperCase();
};
export const defaultHead = () => db.prepare("SELECT value FROM mt_settings WHERE key = 'default_user_head_url'").get()?.value || null;
const charRow = (id) => db.prepare('SELECT * FROM mt_characters WHERE id = ?').get(id);
const activeChars = () => db.prepare('SELECT * FROM mt_characters WHERE active = 1 ORDER BY sort_order').all();

export function fighterView(side, type, id) {
  const base = { side, corner: side === 'A' ? 'red' : 'blue', type, id: String(id), odds: MT.PAYOUT_MULTIPLIER };
  if (type === 'character') {
    const c = charRow(id);
    return { ...base, name: c?.name || 'Võ sĩ', initials: c?.initials || '?', color: c?.color || '#6D28D9', headUrl: c?.head_image_url || null, isDefaultHead: false };
  }
  const u = getUser(Number(id));
  const alive = u && u.status === 'active';
  const own = alive ? u.avatar_url : null;
  return {
    ...base, name: u && u.status !== 'deleted' ? u.display_name : 'Người dùng', initials: initialsOf(u?.display_name),
    color: avatarHex(u?.avatar_color), headUrl: own || defaultHead(), isDefaultHead: !own,
  };
}
const fightersOf = (m) => [fighterView('A', m.a_type, m.a_id), fighterView('B', m.b_type, m.b_id)];

function checkFighter(f, playerId) {
  if (!f || !['character', 'user'].includes(f.type) || (typeof f.id !== 'string' && typeof f.id !== 'number')) throw err(400, 'INVALID_FIGHTERS', 'Võ sĩ không hợp lệ');
  const id = String(f.id);
  if (f.type === 'character') {
    const c = charRow(id);
    if (!c || !c.active) throw err(404, 'FIGHTER_NOT_FOUND', 'Không tìm thấy nhân vật này');
  } else {
    const u = /^\d+$/.test(id) ? getUser(Number(id)) : null;
    if (!u || u.status !== 'active' || u.is_super || isBlockedEither(playerId, u.id)) throw err(404, 'FIGHTER_NOT_FOUND', 'Không tìm thấy người dùng này');
  }
  return { type: f.type, id };
}

const matchRow = (id) => db.prepare('SELECT * FROM mt_matches WHERE id = ?').get(id);
function matchDto(m) {
  return {
    matchId: m.id, expiresAt: m.expires_at, fighters: fightersOf(m), stake: { min: MT.MIN_STAKE, max: MT.MAX_STAKE },
    payoutMultiplier: MT.PAYOUT_MULTIPLIER, mode: m.mode, status: m.status,
  };
}
function ownMatch(uid, id) {
  const m = typeof id === 'string' && id.length < 60 ? matchRow(id) : null;
  if (!m || m.user_id !== uid) throw err(404, 'MATCH_NOT_FOUND', 'Không tìm thấy trận đấu');
  return m;
}

export function createMatch(uid, input) {
  let a, b;
  if (input?.mode === 'random') {
    const cs = activeChars();
    if (cs.length < 2) throw err(400, 'INVALID_FIGHTERS', 'Chưa đủ nhân vật để ghép cặp');
    const i = crypto.randomInt(0, cs.length);
    let j = crypto.randomInt(0, cs.length - 1); if (j >= i) j++;
    a = { type: 'character', id: cs[i].id }; b = { type: 'character', id: cs[j].id };
  } else if (input?.mode === 'custom') {
    a = checkFighter(input.fighterA, uid); b = checkFighter(input.fighterB, uid);
    if (a.type === b.type && a.id === b.id) throw err(400, 'SAME_FIGHTER', 'Hai võ sĩ phải khác nhau');
  } else throw err(400, 'INVALID_FIGHTERS', 'Chế độ không hợp lệ');
  const id = crypto.randomUUID();
  tx(() => {
    db.prepare("UPDATE mt_matches SET status = 'expired' WHERE user_id = ? AND status = 'ready'").run(uid); // đổi cặp khác: trận cũ hết hạn, không tốn xu
    db.prepare('INSERT INTO mt_matches (id, user_id, mode, a_type, a_id, b_type, b_id, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, uid, input.mode, a.type, a.id, b.type, b.id, now(), now() + MT.MATCH_TTL_MIN * 60_000);
  });
  return matchRow(id);
}

// Đặt cược và chốt kết quả: một giao dịch, mỗi trận chỉ cược một lần (UNIQUE match_id là lớp bảo vệ cuối)
export function checkBetInput(pick, stake) {
  if (!validStake(stake)) throw err(400, 'INVALID_STAKE', `Số xu cược phải là số nguyên từ ${MT.MIN_STAKE} đến ${MT.MAX_STAKE}`);
  if (pick !== 'A' && pick !== 'B') throw err(400, 'INVALID_PICK', 'Hãy chọn võ sĩ để cược');
}
export function placeBet(uid, matchId, pick, stake, rng = crypto.randomInt) {
  checkBetInput(pick, stake);
  return tx(() => {
    const m = ownMatch(uid, matchId);
    if (m.status === 'settled') throw err(409, 'MATCH_ALREADY_BET', 'Trận này đã cược rồi');
    if (m.status === 'expired' || m.expires_at < now()) throw err(410, 'MATCH_EXPIRED', 'Trận đã hết hạn, hãy tạo trận mới');
    const u = getUser(uid);
    if (balanceOf(u) < stake) throw err(402, 'INSUFFICIENT_BALANCE', 'Không đủ xu tím');
    const winner = rng(0, 2) === 0 ? 'A' : 'B'; // 50/50
    const method = 'KO';
    const script = generateScript(winner, rng);
    const won = pick === winner;
    const payout = won ? payoutFor(stake) : 0;
    const afterStake = balanceOf(u) - stake;
    const final = afterStake + payout;
    const t = now();
    db.prepare('UPDATE users SET game_net = game_net - ? + ? WHERE id = ?').run(stake, payout, uid);
    db.prepare('INSERT INTO mt_ledger (user_id, delta, reason, match_id, balance_after, created_at) VALUES (?,?,?,?,?,?)').run(uid, -stake, 'bet_stake', matchId, afterStake, t);
    if (payout > 0) db.prepare('INSERT INTO mt_ledger (user_id, delta, reason, match_id, balance_after, created_at) VALUES (?,?,?,?,?,?)').run(uid, payout, 'bet_payout', matchId, final, t);
    db.prepare('INSERT INTO mt_bets (id, match_id, user_id, pick, stake, won, payout, created_at) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), matchId, uid, pick, stake, won ? 1 : 0, payout, t);
    db.prepare("UPDATE mt_matches SET status = 'settled', winner = ?, method = ?, script = ?, settled_at = ? WHERE id = ?").run(winner, method, JSON.stringify(script), t, matchId);
    return { matchId, result: { winner, method, won, pick, stake, payout }, script, balanceAfterStake: afterStake, balanceFinal: final };
  });
}

function settledDto(m, uid) {
  const bet = db.prepare('SELECT * FROM mt_bets WHERE match_id = ?').get(m.id);
  const last = db.prepare('SELECT balance_after b FROM mt_ledger WHERE match_id = ? ORDER BY id DESC LIMIT 1').get(m.id);
  const stakeRow = db.prepare("SELECT balance_after b FROM mt_ledger WHERE match_id = ? AND reason = 'bet_stake'").get(m.id);
  return {
    ...matchDto(m),
    result: { winner: m.winner, method: m.method, won: !!bet?.won, pick: bet?.pick, stake: bet?.stake || 0, payout: bet?.payout || 0 },
    script: JSON.parse(m.script || 'null'),
    balanceAfterStake: stakeRow?.b ?? balanceOf(getUser(uid)), balanceFinal: last?.b ?? balanceOf(getUser(uid)),
  };
}

// ---- API ------------------------------------------------------------------------------
export function mountMuayThai(api, wrap, adminOnly, checkUploadUrl, uploadDir) {
  // ảnh đầu: phải là ảnh đã tải lên máy chủ (PNG/JPG/GIF/WebP), tối đa 512 KB
  const headImage = (u) => {
    const url = checkUploadUrl(u);
    if (!/\.(png|jpe?g|gif|webp)$/i.test(url)) throw bad('Chỉ nhận ảnh PNG, JPG, GIF hoặc WebP');
    let size;
    try { size = fs.statSync(path.join(uploadDir, path.basename(url))).size; } catch { throw bad('Không tìm thấy ảnh đã tải lên'); }
    if (size > 512 * 1024) throw bad(`Ảnh nặng ${Math.ceil(size / 1024)} KB, vượt mức 512 KB`);
    return url;
  };
  const me = (req) => req.user.id;
  const walletOf = (uid) => balanceOf(getUser(uid));
  api.get('/mt/wallet', wrap((req, res) => res.json({ balance: walletOf(me(req)), stake: { min: MT.MIN_STAKE, max: MT.MAX_STAKE }, payoutMultiplier: MT.PAYOUT_MULTIPLIER })));
  api.get('/mt/characters', wrap((_req, res) => res.json({
    characters: activeChars().map((c) => ({ id: c.id, name: c.name, initials: c.initials, color: c.color, headUrl: c.head_image_url || null })),
  })));
  api.post('/mt/matches', wrap((req, res) => {
    rateLimit(`mtnew:${me(req)}`, 30, 60_000);
    const m = createMatch(me(req), req.body || {});
    res.status(201).json({ ...matchDto(m), balance: walletOf(me(req)) });
  }));
  api.post('/mt/matches/:id/bet', wrap((req, res) => {
    checkBetInput(req.body?.pick, req.body?.stake); // đầu vào sai không tính vào giới hạn tốc độ
    try { rateLimit(`mtbet:${me(req)}`, 1, MT.BET_RATE_LIMIT_MS); } catch { throw err(429, 'RATE_LIMITED', 'Bạn cược nhanh quá, đợi một chút nhé'); }
    res.json(placeBet(me(req), String(req.params.id), req.body?.pick, req.body?.stake));
  }));
  api.get('/mt/matches/:id', wrap((req, res) => {
    const m = ownMatch(me(req), String(req.params.id));
    if (m.status === 'settled') return res.json(settledDto(m, me(req)));
    if (m.status === 'expired' || m.expires_at < now()) throw err(410, 'MATCH_EXPIRED', 'Trận đã hết hạn, hãy tạo trận mới');
    res.json({ ...matchDto(m), balance: walletOf(me(req)) });
  }));
  // Tìm người dùng làm võ sĩ: chỉ trả trường công khai (tên, tỉnh/thành, ảnh); bạn bè trước, rồi người cùng nhóm, rồi còn lại
  api.get('/mt/users', wrap((req, res) => {
    rateLimit(`mtsearch:${me(req)}`, 60, 60_000);
    const term = String(req.query.q || '').trim().slice(0, 60).replace(/^@/, '').replace(/[%_]/g, '');
    const onlyFriends = req.query.friends === '1'; // danh sách bạn bè mặc định (không cần gõ tìm)
    if (!onlyFriends && term.length < 2) return res.json({ users: [] });
    const rows = onlyFriends
      ? db.prepare("SELECT u.* FROM users u WHERE u.status = 'active' AND u.is_super = 0 AND u.id IN (SELECT CASE WHEN a = ? THEN b ELSE a END FROM friends WHERE a = ? OR b = ?) ORDER BY u.display_name LIMIT 60").all(me(req), me(req), me(req))
      : db.prepare("SELECT * FROM users WHERE status = 'active' AND is_super = 0 AND display_name LIKE ? ORDER BY display_name LIMIT 60").all(`%${term}%`);
    const friends = new Set(db.prepare('SELECT CASE WHEN a = ? THEN b ELSE a END id FROM friends WHERE a = ? OR b = ?').all(me(req), me(req), me(req)).map((r) => r.id));
    const mates = new Set(db.prepare(`SELECT DISTINCT m2.user_id id FROM members m1 JOIN members m2 ON m1.group_id = m2.group_id JOIN groups g ON g.id = m1.group_id
      WHERE m1.user_id = ? AND g.type IN ('private','topic','province','region')`).all(me(req)).map((r) => r.id));
    const rank = { friend: 0, group: 1, none: 2 };
    const users = rows.filter((u) => !isBlockedEither(me(req), u.id)).map((u) => ({
      id: String(u.id), name: u.display_name, initials: initialsOf(u.display_name), color: avatarHex(u.avatar_color), province: locationOf(u).province,
      headUrl: u.avatar_url || defaultHead(), isDefaultHead: !u.avatar_url,
      relation: friends.has(u.id) ? 'friend' : mates.has(u.id) ? 'group' : 'none', self: u.id === me(req),
      canChallenge: u.id !== me(req) && (u.mt_invite || 'friends') !== 'none' && ((u.mt_invite || 'friends') === 'everyone' || friends.has(u.id)),
    })).sort((x, y) => rank[x.relation] - rank[y.relation] || x.name.localeCompare(y.name, 'vi')).slice(0, 10);
    res.json({ users });
  }));
  api.get('/admin/mt/settings', adminOnly, wrap((_req, res) => res.json({
    characters: db.prepare('SELECT * FROM mt_characters ORDER BY sort_order').all().map((c) => ({ id: c.id, name: c.name, initials: c.initials, color: c.color, headUrl: c.head_image_url || null, active: !!c.active })),
    defaultUserHeadUrl: defaultHead(),
  })));
  api.patch('/admin/mt/settings', adminOnly, wrap((req, res) => {
    const url = req.body.defaultUserHeadUrl ? headImage(req.body.defaultUserHeadUrl) : null;
    if (url) db.prepare("INSERT OR REPLACE INTO mt_settings (key, value) VALUES ('default_user_head_url', ?)").run(url);
    else db.prepare("DELETE FROM mt_settings WHERE key = 'default_user_head_url'").run();
    log(req.user.id, 'mt_default_head', { reason: url || 'bỏ ảnh' });
    res.json({ ok: true });
  }));
  // Admin đặt ảnh đầu cho nhân vật (null = dùng chữ viết tắt)
  api.patch('/admin/mt/characters/:id', adminOnly, wrap((req, res) => {
    const c = charRow(String(req.params.id));
    if (!c) throw notFound('Không tìm thấy nhân vật');
    const url = req.body.headImageUrl ? headImage(req.body.headImageUrl) : null;
    db.prepare('UPDATE mt_characters SET head_image_url = ? WHERE id = ?').run(url, c.id);
    log(req.user.id, 'mt_character_head', { reason: `${c.id}: ${url || 'bỏ ảnh'}` });
    res.json({ ok: true });
  }));
  // xóa các trận chưa cược đã hết hạn
  const sweep = () => { try { db.prepare("UPDATE mt_matches SET status = 'expired' WHERE status = 'ready' AND expires_at < ?").run(now()); } catch { /* bỏ qua */ } };
  setInterval(sweep, 10 * 60_000).unref();
}
