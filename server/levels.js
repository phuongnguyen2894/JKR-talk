// Cấp bậc và Xu tím: tính xu, điều kiện lên cấp, thông báo lên cấp.
// Người mới chưa có cấp (lvl = 0); xong 3 việc khởi đầu thì nhận cấp 1. Xu kiếm lúc cấp 0 vẫn được giữ.
import { db, now, tx, trendGroupId } from './db.js';
import { getUser, notify } from './lib.js';
import { hasSubscription } from './push.js';

export const TITLES = {
  bot_trend: 'Bot trend',
  bot_trend_cao_thu: 'Bot trend cao thủ',
  bot_trend_huyen_thoai: 'Bot trend huyền thoại',
};

// Mỗi cấp: mốc xu tím cộng thêm điều kiện riêng (nếu có) và đặc quyền mới
export const LEVELS = [
  { lvl: 1, name: 'Tím Mầm Non', min: 0, perk: 'Huy hiệu Tím Mầm Non cạnh tên.' },
  { lvl: 2, name: 'Tím Sương Sương', min: 1000, perk: 'Khung avatar tím.' },
  { lvl: 3, name: 'Tím Mộng Mơ', min: 3000, title: 'bot_trend', perk: 'Từ giờ bạn có thể gửi link vào Đẩy trend.' },
  { lvl: 4, name: 'Tím Thủy Chung', min: 7000, links: 1000, title: 'bot_trend_cao_thu', perk: 'Từ giờ bạn tạo chủ đề không cần duyệt và đăng được bài lên Bản tin.' },
  { lvl: 5, name: 'Tím Thủy Tổ', min: 15000, news: 500, topics: 20, title: 'bot_trend_huyen_thoai', perk: 'Từ giờ bạn thêm ngay được bất kỳ ai vào nhóm riêng của mình, không cần kết bạn.' },
];
export const TOPIC_PEOPLE = 20; // chủ đề được tính: có ít nhất 20 người khác nhau gửi tin
export const levelName = (n) => LEVELS.find((l) => l.lvl === n)?.name || '';

// ---- ngày theo giờ Việt Nam ----------------------------------------------------
const dayOf = (t = Date.now()) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);

// ---- đếm cho điều kiện ----------------------------------------------------------
const q1 = (sql, ...a) => db.prepare(sql).get(...a);
const startCounts = (uid) => ({
  msgs: q1("SELECT COUNT(*) c FROM coin_log WHERE user_id = ? AND kind = 'msg'", uid).c,
  hearts: q1('SELECT COUNT(*) c FROM reactions WHERE user_id = ?', uid).c,
  push: hasSubscription(uid),
});
export const START_NEED = { msgs: 5, hearts: 3 };
export const trendLinks = (uid) => q1("SELECT COUNT(*) c FROM messages WHERE user_id = ? AND group_id = ? AND deleted = 0 AND (body LIKE '%http://%' OR body LIKE '%https://%')", uid, trendGroupId()).c;
export const newsPosts = (uid) => q1('SELECT COUNT(*) c FROM news WHERE author_id = ?', uid).c;
export const topicsWithPeople = (uid) => q1(
  `SELECT COUNT(*) c FROM groups g WHERE g.type = 'topic' AND g.created_by = ?
   AND (SELECT COUNT(DISTINCT m.user_id) FROM messages m WHERE m.group_id = g.id AND m.deleted = 0) >= ?`, uid, TOPIC_PEOPLE).c;
const hasTitle = (uid, t) => !!q1('SELECT 1 FROM user_titles WHERE user_id = ? AND title = ?', uid, t);
export const userTitles = (uid) => db.prepare('SELECT title FROM user_titles WHERE user_id = ? ORDER BY granted_at').all(uid).map((r) => r.title);

// Điều kiện để đạt cấp L (danh sách có nhãn, dùng cả để tính và để hiển thị tiến độ)
export function conditionsFor(L, u) {
  const c = [{ key: 'coins', label: 'Xu tím', have: u.coins, need: L.min, ok: u.coins >= L.min }];
  if (L.links) { const h = trendLinks(u.id); c.push({ key: 'links', label: 'Gửi link vào Đẩy trend', have: h, need: L.links, ok: h >= L.links }); }
  if (L.news) { const h = newsPosts(u.id); c.push({ key: 'news', label: 'Đăng bài vào Bản tin', have: h, need: L.news, ok: h >= L.news }); }
  if (L.topics) { const h = topicsWithPeople(u.id); c.push({ key: 'topics', label: `Chủ đề có ${TOPIC_PEOPLE} người khác nhau gửi tin`, have: h, need: L.topics, ok: h >= L.topics }); }
  if (L.title) { const h = hasTitle(u.id, L.title); c.push({ key: 'title', label: `Danh hiệu ${TITLES[L.title]}`, have: h ? 1 : 0, need: 1, ok: h, title: true }); }
  return c;
}

// Cấp cao nhất đủ điều kiện (phải đủ lần lượt từng cấp)
function eligibleLevel(u) {
  if (!u.start_done) return 0;
  let lvl = 1;
  for (const L of LEVELS.slice(1)) {
    if (conditionsFor(L, u).every((x) => x.ok)) lvl = L.lvl; else break;
  }
  return lvl;
}

// Tính lại: xong việc khởi đầu thì nhận cấp 1, đủ điều kiện thì lên cấp (không bao giờ tụt cấp)
export function recompute(uid, { silent = false } = {}) {
  let u = getUser(uid);
  if (!u || u.status === 'deleted') return null;
  if (!u.start_done) {
    const t = startCounts(uid);
    if (u.role === 'admin' || (t.msgs >= START_NEED.msgs && t.hearts >= START_NEED.hearts && t.push)) {
      db.prepare('UPDATE users SET start_done = 1 WHERE id = ?').run(uid);
      u = getUser(uid);
    }
  }
  const target = eligibleLevel(u);
  if (target > u.lvl) {
    db.prepare('UPDATE users SET lvl = ?, lvl_seen = CASE WHEN ? THEN ? ELSE lvl_seen END WHERE id = ?').run(target, silent ? 1 : 0, target, uid);
    if (!silent) {
      const L = LEVELS.find((x) => x.lvl === target);
      const text = target === 1
        ? `Bạn đã nhận cấp 1 ${L.name}. Xu tím bạn đã kiếm từ trước vẫn được giữ nguyên.`
        : `Bạn đã lên ${L.name} (cấp ${target}). ${L.perk}`;
      notify(uid, 'level', text, { url: '/#/level', tag: `level-${target}` });
    }
  }
  return getUser(uid);
}

// ---- cộng xu ---------------------------------------------------------------------
// ref: khóa chống cộng trùng (cùng người, cùng loại, cùng ref chỉ cộng một lần); cap: tối đa xu mỗi ngày cho loại này
export function award(uid, kind, amount, { ref = null, cap = 0 } = {}) {
  const u = getUser(uid);
  if (!u || u.status === 'deleted' || amount <= 0) return 0;
  const day = dayOf();
  if (cap) {
    const used = q1('SELECT COALESCE(SUM(amount),0) s FROM coin_log WHERE user_id = ? AND kind = ? AND day = ?', uid, kind, day).s;
    amount = Math.min(amount, cap - used);
    if (amount <= 0) return 0;
  }
  const ins = db.prepare('INSERT OR IGNORE INTO coin_log (user_id, kind, amount, ref, day, created_at) VALUES (?,?,?,?,?,?)').run(uid, kind, amount, ref, day, now());
  if (!ins.changes) return 0;
  db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(amount, uid);
  recompute(uid);
  return amount;
}

// Vào app mỗi ngày: +3 xu, đủ chuỗi 7 ngày liên tiếp: +20 xu
export function touchDaily(uid) {
  const u = getUser(uid);
  if (!u) return;
  const day = dayOf();
  if (u.last_day === day) return;
  const yesterday = dayOf(Date.now() - 86400_000);
  const streak = u.last_day === yesterday ? u.streak + 1 : 1;
  db.prepare('UPDATE users SET last_day = ?, streak = ? WHERE id = ?').run(day, streak, uid);
  award(uid, 'daily', 3, { ref: day });
  if (streak % 7 === 0) award(uid, 'streak', 20, { ref: `s:${day}` });
}

// Tin nhắn hợp lệ (nhóm, từ 5 ký tự, không trùng tin liền trước của mình trong nhóm) +1 xu; người được trả lời +2 xu (tối đa 20/ngày)
export function onMessage(user, g, dto, replyOwnerId) {
  if (g.type === 'dm') return;
  const text = String(dto.body || '').trim();
  if ([...text].length >= 5) {
    const prev = db.prepare('SELECT body FROM messages WHERE group_id = ? AND user_id = ? AND id < ? AND deleted = 0 ORDER BY id DESC LIMIT 3').all(g.id, user.id, dto.id);
    if (!prev.some((p) => p.body.trim() === text)) award(user.id, 'msg', 1, { ref: String(dto.id) });
  }
  if (replyOwnerId && replyOwnerId !== user.id) award(replyOwnerId, 'reply', 2, { ref: String(dto.id), cap: 20 });
  recompute(user.id);
}

// Tim: người nhận +2 xu (tối đa 50/ngày, mỗi người thả tối đa 3 tim/ngày cho cùng một người); người thả được tính việc khởi đầu
export function onHeart(giverId, ownerId, messageId) {
  if (giverId !== ownerId) {
    const today = dayOf();
    const fromGiver = q1("SELECT COUNT(*) c FROM coin_log WHERE user_id = ? AND kind = 'heart' AND day = ? AND ref LIKE ?", ownerId, today, `%:${giverId}`).c;
    if (fromGiver < 3) award(ownerId, 'heart', 2, { ref: `${messageId}:${giverId}`, cap: 50 });
  }
  recompute(giverId);
}

// Bấm vào link X trong Đẩy trend: +1 xu, mỗi link tính một lần
export const X_HOSTS = new Set(['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);
export function normalizeXLink(raw) {
  try {
    const u = new URL(String(raw));
    if (!['http:', 'https:'].includes(u.protocol) || !X_HOSTS.has(u.hostname.toLowerCase())) return null;
    return `x.com${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch { return null; }
}
export function onTrendClick(uid, url) {
  const key = normalizeXLink(url);
  return key ? award(uid, 'xlink', 1, { ref: key }) : 0;
}

// ---- trạng thái cho giao diện ------------------------------------------------------
export function statusOf(uid) {
  const u = getUser(uid);
  const next = LEVELS.find((l) => l.lvl === (u.start_done ? u.lvl + 1 : 1));
  const tasks = !u.start_done ? (() => { const t = startCounts(uid); return [
    { key: 'msgs', label: 'Gửi 5 tin nhắn', have: Math.min(t.msgs, START_NEED.msgs), need: START_NEED.msgs },
    { key: 'hearts', label: 'Thả 3 tim cho tin của người khác', have: Math.min(t.hearts, START_NEED.hearts), need: START_NEED.hearts },
    { key: 'push', label: 'Bật thông báo đẩy', have: t.push ? 1 : 0, need: 1 },
  ]; })() : null;
  return {
    level: u.lvl, name: u.lvl ? levelName(u.lvl) : '', coins: u.coins, streak: u.streak,
    tasks,
    next: next && u.start_done ? { level: next.lvl, name: next.name, conditions: conditionsFor(next, u) } : null,
    titles: userTitles(uid),
    stats: { messages: q1("SELECT COUNT(*) c FROM messages WHERE user_id = ? AND deleted = 0", uid).c, hearts: q1('SELECT COUNT(*) c FROM reactions r JOIN messages m ON m.id = r.message_id WHERE m.user_id = ?', uid).c, topics: q1("SELECT COUNT(*) c FROM groups WHERE type = 'topic' AND created_by = ?", uid).c },
    levels: LEVELS.map((l) => ({ level: l.lvl, name: l.name, min: l.min, perk: l.perk })),
  };
}
// Chúc mừng lên cấp chưa xem
export function pendingLevelUp(u) {
  if (!u.start_done || u.lvl <= u.lvl_seen) return null;
  const L = LEVELS.find((x) => x.lvl === u.lvl);
  return { level: u.lvl, name: L.name, perk: L.perk, coins: u.coins };
}

// ---- chuyển đổi lần đầu: người dùng cũ coi như đã xong việc khởi đầu, xu tính từ lịch sử ----
(function migrate() {
  if (db.prepare("SELECT 1 FROM app_kv WHERE key = 'levels_v1'").get()) return;
  tx(() => {
    db.exec(`UPDATE users SET start_done = 1 WHERE status != 'deleted'`);
    db.exec(`UPDATE users SET coins =
      (SELECT COUNT(*) FROM messages m JOIN groups g ON g.id = m.group_id WHERE m.user_id = users.id AND m.deleted = 0 AND g.type NOT IN ('dm') AND length(trim(m.body)) >= 5)
      + 2 * (SELECT COUNT(*) FROM reactions r JOIN messages m ON m.id = r.message_id WHERE m.user_id = users.id AND r.user_id != users.id)
      WHERE status != 'deleted'`);
    db.prepare("INSERT OR REPLACE INTO app_kv (key, value) VALUES ('levels_v1', '1')").run();
  });
  for (const u of db.prepare("SELECT id FROM users WHERE status != 'deleted'").all()) recompute(u.id, { silent: true });
})();
