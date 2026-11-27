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

// Danh hiệu Bot trend: tự trao khi đủ điều kiện (số link X đã bấm trong Đẩy trend, số link đã gửi vào Đẩy trend), phải đạt lần lượt
export const TITLE_DEFS = [
  { n: 1, key: 'bot_trend', clicks: 100 },
  { n: 2, key: 'bot_trend_cao_thu', clicks: 500, links: 300, needs: 'bot_trend' },
  { n: 3, key: 'bot_trend_huyen_thoai', clicks: 2000, links: 1000, needs: 'bot_trend_cao_thu' },
];
// Phần thưởng của danh hiệu (không bán): khung avatar và màu tên
export const TITLE_REWARDS = {
  1: { frame: 'Khung Bot trend', color: 'Xanh ngọc Bot trend' },
  2: { frame: 'Khung Bot trend cao thủ', color: 'Xanh dương cao thủ' },
  3: { frame: 'Khung Bot trend huyền thoại', color: 'Lửa huyền thoại' },
};
// Đồ bán bằng xu tím
export const SHOP = {
  frame: [
    { id: 1, name: 'Viền tím', price: 300 }, { id: 2, name: 'Vòng hoa', price: 600 }, { id: 3, name: 'Hạt ngọc', price: 600 },
    { id: 4, name: 'Ánh sao', price: 900 }, { id: 5, name: 'Pha lê', price: 1500 },
  ],
  color: [
    { id: 1, name: 'Hồng đào', price: 200 }, { id: 2, name: 'Bạc hà', price: 200 }, { id: 3, name: 'Vàng nắng', price: 400 },
    { id: 4, name: 'Tím mộng', price: 600 }, { id: 5, name: 'Hoàng hôn', price: 800 },
  ],
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
// số link đã gửi vào Đẩy trend (mỗi link khác nhau một lần); đếm theo nhật ký xu nên không mất khi tin hết hạn sau 38 giờ
export const trendLinks = (uid) => q1("SELECT COUNT(*) c FROM coin_log WHERE user_id = ? AND kind = 'tlink'", uid).c;
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
  if (L.title) { const h = hasTitle(u.id, L.title); c.push({ key: 'title', titleKey: L.title, label: `Danh hiệu ${TITLES[L.title]}`, have: h ? 1 : 0, need: 1, ok: h, title: true }); }
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
export const xLinkClicks = (uid) => q1("SELECT COUNT(*) c FROM coin_log WHERE user_id = ? AND kind = 'xlink'", uid).c;

// Tự trao danh hiệu Bot trend khi đủ điều kiện (lần lượt từng danh hiệu)
function grantTitles(uid, silent) {
  const clicks = xLinkClicks(uid);
  const links = trendLinks(uid);
  for (const d of TITLE_DEFS) {
    if (hasTitle(uid, d.key)) continue;
    if (d.needs && !hasTitle(uid, d.needs)) break;
    if (clicks < d.clicks || (d.links && links < d.links)) break;
    db.prepare('INSERT OR IGNORE INTO user_titles (user_id, title, granted_at) VALUES (?,?,?)').run(uid, d.key, now());
    if (!silent) notify(uid, 'title', ['title', { ti: d.key }], { url: '/#/titles', tag: `title-${d.key}` });
  }
}

export function recompute(uid, { silent = false } = {}) {
  let u = getUser(uid);
  if (!u || u.status === 'deleted') return null;
  grantTitles(uid, silent);
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
      const text = target === 1 ? ['level1', { lv: 1 }] : ['levelUp', { lv: target }]; // theo ngôn ngữ người nhận
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
  if (replyOwnerId && replyOwnerId !== user.id) award(replyOwnerId, 'reply', 2, { ref: String(dto.id) });
  // gửi link vào Đẩy trend: +1 xu, mỗi link (bỏ phần sau dấu ? và #) mỗi người một lần
  if (g.type === 'trend') {
    const key = normalizeLink((text.match(/https?:\/\/[^\s]+/i) || [])[0]);
    if (key) award(user.id, 'tlink', 1, { ref: key });
  }
  recompute(user.id);
}

// Tim: người nhận +2 xu (tối đa 50/ngày, mỗi người thả tối đa 3 tim/ngày cho cùng một người); người thả được tính việc khởi đầu
export function onHeart(giverId, ownerId, messageId, key = 'heart') {
  // mỗi react (tim hoặc emoji) +2 xu; mỗi người mỗi emoji một lần trên mỗi tin nên bật tắt không cộng thêm
  if (giverId !== ownerId) award(ownerId, 'heart', 2, { ref: key === 'heart' ? `${messageId}:${giverId}` : `${messageId}:${giverId}:${key}` });
  recompute(giverId);
}
// Đăng bài lên Bản tin: +3 xu
export function onNewsPost(uid, newsId) {
  award(uid, 'news', 3, { ref: String(newsId) });
}
export function normalizeLink(raw) {
  try {
    const u = new URL(String(raw).replace(/[),.;!?]+$/, ''));
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return `${u.hostname.replace(/^(www|m|mobile)\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch { return null; }
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

// ---- danh hiệu, cửa hàng, khung avatar và màu tên ----------------------------------
export const balanceOf = (u) => Math.max(0, (u.coins || 0) - (u.coins_spent || 0) + (u.game_net || 0));
const ownedShop = (uid) => new Set(db.prepare('SELECT item FROM user_items WHERE user_id = ?').all(uid).map((r) => r.item));
const titleN = (uid) => TITLE_DEFS.filter((d) => hasTitle(uid, d.key)).map((d) => d.n);

// Trạng thái từng danh hiệu: điều kiện, tiến độ, phần thưởng
export function titlesStatus(uid) {
  const u = getUser(uid);
  const clicks = xLinkClicks(uid), links = trendLinks(uid);
  const out = TITLE_DEFS.map((d) => {
    const has = hasTitle(uid, d.key);
    const conditions = [{ key: 'clicks', label: 'Bấm link X trong Đẩy trend', have: has ? Math.max(clicks, d.clicks) : clicks, need: d.clicks, ok: has || clicks >= d.clicks }];
    if (d.links) conditions.push({ key: 'links', label: 'Gửi link vào Đẩy trend', have: has ? Math.max(links, d.links) : links, need: d.links, ok: has || links >= d.links });
    const prevOk = !d.needs || hasTitle(uid, d.needs);
    return { n: d.n, key: d.key, name: TITLES[d.key], state: has ? 'done' : prevOk ? 'doing' : 'locked', conditions, reward: { frame: `title:${d.n}`, frameName: TITLE_REWARDS[d.n].frame, color: `title:${d.n}`, colorName: TITLE_REWARDS[d.n].color }, needs: d.needs ? TITLES[d.needs] : null, needsKey: d.needs || null };
  });
  return { titles: out, equipped: { frame: u.frame || null, color: u.name_color || null } };
}

// Cửa hàng: số dư, đồ bán, đồ đã sở hữu (kể cả phần thưởng danh hiệu)
export function shopStatus(uid) {
  const u = getUser(uid);
  const mine = ownedShop(uid);
  const tn = titleN(uid);
  const list = (kind, cur) => SHOP[kind].map((it) => ({ id: `shop:${it.id}`, name: it.name, price: it.price, owned: mine.has(`${kind}:${it.id}`), equipped: cur === `shop:${it.id}` }));
  return {
    balance: balanceOf(u), coins: u.coins,
    frames: list('frame', u.frame), colors: list('color', u.name_color),
    mine: {
      frames: [...SHOP.frame.filter((it) => mine.has(`frame:${it.id}`)).map((it) => ({ id: `shop:${it.id}`, name: it.name, source: 'shop' })), ...tn.map((n) => ({ id: `title:${n}`, name: TITLE_REWARDS[n].frame, source: 'title' }))],
      colors: [...SHOP.color.filter((it) => mine.has(`color:${it.id}`)).map((it) => ({ id: `shop:${it.id}`, name: it.name, source: 'shop' })), ...tn.map((n) => ({ id: `title:${n}`, name: TITLE_REWARDS[n].color, source: 'title' }))],
    },
    equipped: { frame: u.frame || null, color: u.name_color || null },
  };
}

// Mua đồ bằng xu tím (đồ vĩnh viễn, không hoàn xu; mua không làm giảm tổng xu đã kiếm nên không tụt cấp)
export function buyItem(uid, kind, id) {
  const it = SHOP[kind]?.find((x) => x.id === Number(id));
  if (!it) return { error: 'Vật phẩm không tồn tại' };
  const key = `${kind}:${it.id}`;
  return tx(() => {
    const u = getUser(uid);
    if (ownedShop(uid).has(key)) return { error: 'Bạn đã sở hữu vật phẩm này' };
    if (balanceOf(u) < it.price) return { error: 'Bạn chưa đủ xu tím để mua vật phẩm này' };
    db.prepare('UPDATE users SET coins_spent = coins_spent + ? WHERE id = ?').run(it.price, uid);
    db.prepare('INSERT INTO user_items (user_id, item, price, acquired_at) VALUES (?,?,?,?)').run(uid, key, it.price, now());
    return { ok: true, item: { kind, id: `shop:${it.id}`, name: it.name, price: it.price }, balance: balanceOf(getUser(uid)) };
  });
}

// Chọn khung avatar / màu tên đang dùng (chỉ chọn được đồ đã sở hữu hoặc phần thưởng danh hiệu đã đạt); null = bỏ chọn
export function setAppearance(uid, body) {
  const mine = ownedShop(uid), tn = titleN(uid);
  const ok = (kind, v) => {
    const [src, n] = String(v).split(':');
    if (src === 'shop') return mine.has(`${kind}:${Number(n)}`) && SHOP[kind].some((x) => x.id === Number(n));
    if (src === 'title') return tn.includes(Number(n));
    return false;
  };
  const sets = [], vals = [];
  for (const [field, col, kind] of [['frame', 'frame', 'frame'], ['color', 'name_color', 'color']]) {
    if (body[field] === undefined) continue;
    if (body[field] === null || body[field] === '') { sets.push(`${col} = NULL`); continue; }
    if (!ok(kind, body[field])) return { error: 'Bạn chưa sở hữu vật phẩm này' };
    sets.push(`${col} = ?`); vals.push(String(body[field]));
  }
  if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals, uid);
  return { ok: true };
}
// Thu hồi danh hiệu: bỏ khung/màu tên của danh hiệu đó nếu đang dùng
export function dropTitleRewards(uid) {
  const tn = titleN(uid);
  const u = getUser(uid);
  const bad = (v) => v && v.startsWith('title:') && !tn.includes(Number(v.split(':')[1]));
  if (bad(u.frame)) db.prepare('UPDATE users SET frame = NULL WHERE id = ?').run(uid);
  if (bad(u.name_color)) db.prepare('UPDATE users SET name_color = NULL WHERE id = ?').run(uid);
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
    level: u.lvl, name: u.lvl ? levelName(u.lvl) : '', coins: u.coins, balance: balanceOf(u), streak: u.streak,
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

// ---- Đẩy trend: link không được trùng và chỉ tồn tại 38 giờ ----------------------------
export const TREND_LINK_HOURS = Number(process.env.TREND_LINK_HOURS || 38);
export const linksIn = (text) => [...new Set((String(text || '').match(/https?:\/\/[^\s]+/gi) || []).map(normalizeLink).filter(Boolean))];
// Trả về link đã có trong Đẩy trend (còn tồn tại) nếu tin mới chứa link trùng, ngược lại null
export function duplicateTrendLink(text) {
  const mine = linksIn(text);
  if (!mine.length) return null;
  const have = new Set();
  for (const r of db.prepare("SELECT body FROM messages WHERE group_id = ? AND deleted = 0 AND body LIKE '%http%'").all(trendGroupId())) for (const k of linksIn(r.body)) have.add(k);
  return mine.find((k) => have.has(k)) || null;
}
