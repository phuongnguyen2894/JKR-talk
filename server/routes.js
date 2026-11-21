import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, now, tx, homeGroupIds, nameKey, trendGroupId, hotGroupId } from './db.js';
import { COUNTRY, REGIONS, PROVINCES, provinceById } from './geo.js';
import {
  bad, forbidden, notFound, HttpError, hashPassword, checkPassword, randomToken, rateLimit,
  getUser, publicUser, selfUser, getGroup, getMember, memberIds, addMember, removeMember,
  isSystemAdmin, isSuper, canPostTrend, locationOf, log, hub, isOnline, notify, pushOnly, messageDto, areFriends, isBlockedEither, shareGroup, pair,
  AVATAR_COUNT, msgImages,
} from './lib.js';

import { firstUrl, buildPreview } from './preview.js';
import { statusOf, pendingLevelUp, recompute, touchDaily, onMessage, onHeart, onNewsPost, onTrendClick, award, duplicateTrendLink, TREND_LINK_HOURS, TITLES, normalizeXLink, userTitles, titlesStatus, shopStatus, buyItem, setAppearance, dropTitleRewards } from './levels.js';
import { vapidPublicKey, getPrefs, setPrefs, hasSubscription, saveSubscription, removeSubscription } from './push.js';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PROD = process.env.NODE_ENV === 'production';
const PRIVATE_LIMIT_DEFAULT = 100;
const PRIVATE_LIMIT_MAX = 200;
const HOME_CHANGE_COOLDOWN = 30 * 24 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
const MAX_IMAGE = 2 * 1024 * 1024;

const wrap = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.catch === 'function') r.catch(next);
  } catch (e) {
    next(e);
  }
};
const str = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v) => (Number.isInteger(Number(v)) ? Number(v) : NaN);

export const api = express.Router();
api.use(express.json({ limit: '4mb' }));

// ---- xác thực ----------------------------------------------------------------
function auth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = token && db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s) throw new HttpError(401, 'Vui lòng đăng nhập');
  const u = getUser(s.user_id);
  if (!u || u.status === 'deleted') throw new HttpError(401, 'Tài khoản không tồn tại');
  if (u.status === 'locked') {
    if (u.locked_until && u.locked_until < now()) {
      db.prepare("UPDATE users SET status='active', locked_until=NULL WHERE id=?").run(u.id);
    } else {
      throw new HttpError(403, u.locked_until ? 'Tài khoản đang bị khóa tạm thời' : 'Tài khoản đã bị khóa');
    }
  }
  req.user = u;
  req.token = token;
  next();
}
const adminOnly = (req, _res, next) => {
  if (req.user.role !== 'admin') throw forbidden();
  next();
};
// chỉ Admin hệ thống
const superOnly = (req, _res, next) => {
  if (req.user.role !== 'admin' || !req.user.is_super) throw forbidden('Chỉ Admin hệ thống mới có quyền này');
  next();
};

// ============================================================================
// Công khai: địa lý, đăng ký, đăng nhập
// ============================================================================
api.get('/geo', (_req, res) => res.json({ country: COUNTRY, regions: REGIONS, provinces: PROVINCES }));

// ---- Chào mừng thành viên mới: giao diện riêng của từng nhóm, không đăng vào khung chat chung ----
db.exec(`CREATE TABLE IF NOT EXISTS welcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_welcomes_group_user ON welcomes(group_id, user_id);`);
const WELCOME_TYPES = ['country', 'region', 'province', 'private'];
const NEWCOMER_MS = 7 * 86400_000; // "mới" = tham gia trong 7 ngày qua
const WELCOME_PER_AUTHOR = 3;
const autoWelcomeText = (g, name) => `🎉 Chào mừng ${name} đến với ${g.type === 'country' ? 'JKR talks' : `nhóm ${g.name}`}! Mọi người cùng chào đón thành viên mới của chúng ta nhé 💜`;

// Lời chào tự động của tài khoản Admin hệ thống (nằm trong mục Chào mừng của nhóm, mỗi người một lần ở mỗi nhóm)
function welcomeUser(uid, g) {
  try {
    if (!g || !['country', 'region', 'province'].includes(g.type)) return;
    const bot = db.prepare('SELECT id FROM users WHERE is_super = 1 ORDER BY id LIMIT 1').get();
    if (!bot || bot.id === uid) return;
    if (db.prepare('SELECT 1 FROM welcomes WHERE group_id = ? AND user_id = ? AND author_id = ?').get(g.id, uid, bot.id)) return;
    db.prepare('INSERT INTO welcomes (group_id, user_id, author_id, body, created_at) VALUES (?,?,?,?,?)').run(g.id, uid, bot.id, autoWelcomeText(g, getUser(uid).display_name), now());
    if (g.type === 'country') notify(uid, 'welcome', `Chào mừng bạn đến với JKR talks! Xem lời chào của mọi người ở mục Chào mừng của "${g.name}"`, { url: `/#/welcome/${g.id}`, tag: `welcome-${g.id}` });
  } catch (e) { console.error('[welcome]', e.message); }
}
// Chuyển các tin chào mừng tự động cũ ra khỏi khung chat chung (một lần)
(function migrateOldWelcomes() {
  if (db.prepare("SELECT 1 FROM app_kv WHERE key = 'welcome_migrated'").get()) return;
  const bot = db.prepare('SELECT id FROM users WHERE is_super = 1 ORDER BY id LIMIT 1').get();
  if (bot) {
    for (const m of db.prepare("SELECT id, group_id, mentions, created_at FROM messages WHERE user_id = ? AND deleted = 0 AND mentions IS NOT NULL AND body LIKE '🎉 Chào mừng @%'").all(bot.id)) {
      let target; try { target = JSON.parse(m.mentions)[0]; } catch { continue; }
      const g = getGroup(m.group_id);
      if (!target || !g) continue;
      db.prepare('INSERT INTO welcomes (group_id, user_id, author_id, body, created_at) VALUES (?,?,?,?,?)').run(g.id, target, bot.id, autoWelcomeText(g, getUser(target)?.display_name || 'bạn mới'), m.created_at);
      db.prepare('UPDATE messages SET deleted = 1 WHERE id = ?').run(m.id);
    }
  }
  db.prepare("INSERT OR REPLACE INTO app_kv (key, value) VALUES ('welcome_migrated', '1')").run();
})();

(function rewriteAutoWelcomes() {
  if (db.prepare("SELECT 1 FROM app_kv WHERE key = 'welcome_text_v2'").get()) return;
  const bot = db.prepare('SELECT id FROM users WHERE is_super = 1 ORDER BY id LIMIT 1').get();
  if (bot) {
    for (const w of db.prepare("SELECT id, group_id, user_id FROM welcomes WHERE author_id = ? AND body LIKE '%đu LingOrm%'").all(bot.id)) {
      const g = getGroup(w.group_id), u = getUser(w.user_id);
      if (g && u) db.prepare('UPDATE welcomes SET body = ? WHERE id = ?').run(autoWelcomeText(g, u.display_name), w.id);
    }
  }
  db.prepare("INSERT OR REPLACE INTO app_kv (key, value) VALUES ('welcome_text_v2', '1')").run();
})();

// số thành viên mới chưa được mình chào
function newcomerCount(gid, uid) {
  return db.prepare(`SELECT COUNT(*) c FROM members m JOIN users u ON u.id = m.user_id
    WHERE m.group_id = ? AND m.joined_at > ? AND m.user_id != ? AND u.status = 'active' AND u.is_super = 0
      AND NOT EXISTS (SELECT 1 FROM welcomes w WHERE w.group_id = m.group_id AND w.user_id = m.user_id AND w.author_id = ?)`).get(gid, now() - NEWCOMER_MS, uid, uid).c;
}

api.post(
  '/auth/register',
  wrap((req, res) => {
    rateLimit(`reg:${req.ip}`, Number(process.env.REGISTER_RATE_LIMIT || 10), 3600_000);
    const email = str(req.body.email, 200).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const displayName = str(req.body.displayName, 30);
    const province = provinceById(req.body.provinceId);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw bad('Email không hợp lệ');
    if (password.length < 8) throw bad('Mật khẩu cần ít nhất 8 ký tự');
    if (req.body.acceptCommunity !== true) throw bad('Bạn cần đồng ý: JKR talks chỉ dành cho fan Only LingOrm, không chào đón multi, only toxic, anti, chỉ bàn luận về LingOrm ở các nhóm công khai');
    if (req.body.passwordConfirm !== undefined && req.body.passwordConfirm !== password) throw bad('Mật khẩu xác nhận không khớp');
    if (displayName.length < 2) throw bad('Tên hiển thị cần ít nhất 2 ký tự');
    if (displayName.includes('@') || displayName.toLowerCase() === email) throw bad('Tên hiển thị không được trùng email');
    if (req.body.country && req.body.country !== COUNTRY.code) throw bad('Hiện app mới hỗ trợ Việt Nam');
    if (!province) throw bad('Vui lòng chọn tỉnh/thành');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw bad('Email này đã được dùng');
    if (db.prepare('SELECT 1 FROM users WHERE name_key = ?').get(nameKey(displayName))) throw bad('Tên hiển thị này đã có người dùng, hãy chọn tên khác');

    const id = tx(() => {
      const r = db
        .prepare(
          `INSERT INTO users (email, pass_hash, display_name, name_key, avatar_color, province_id, verified, created_at)
           VALUES (?,?,?,?,?,?,1,?)`
        )
        .run(email, hashPassword(password), displayName, nameKey(displayName), crypto.randomInt(AVATAR_COUNT), province.id, now());
      const uid = Number(r.lastInsertRowid);
      for (const gid of homeGroupIds(province)) addMember(gid, uid); // auto-join đủ 3 group
      addMember(trendGroupId(), uid); // và nhóm Đẩy trend
      return uid;
    });
    for (const gid of homeGroupIds(province)) welcomeUser(id, getGroup(gid)); // lời chào tự động ở mục Chào mừng của 3 nhóm
    // không cần xác nhận email: đăng nhập luôn sau khi đăng ký
    const token = randomToken();
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)').run(token, id, now());
    res.status(201).json({ id, token, user: selfUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  })
);

api.post(
  '/auth/login',
  wrap((req, res) => {
    rateLimit(`login:${req.ip}`, Number(process.env.LOGIN_RATE_LIMIT || 20), 600_000);
    const email = str(req.body.email, 200).toLowerCase();
    const u = db.prepare("SELECT * FROM users WHERE email = ? AND status != 'deleted'").get(email);
    if (!u || !checkPassword(String(req.body.password || ''), u.pass_hash)) throw new HttpError(401, 'Email hoặc mật khẩu không đúng');
    if (u.status === 'locked' && !(u.locked_until && u.locked_until < now()))
      throw new HttpError(403, u.locked_until ? 'Tài khoản đang bị khóa tạm thời' : 'Tài khoản đã bị khóa');
    if (u.status === 'locked') db.prepare("UPDATE users SET status='active', locked_until=NULL WHERE id=?").run(u.id);
    const token = randomToken();
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)').run(token, u.id, now());
    res.json({ token, user: selfUser(u) });
  })
);

// ============================================================================
// Khách chưa đăng ký: chỉ đọc nhóm công khai, Đẩy trend, Chủ đề nóng, Bản tin
// ============================================================================
const GUEST_TYPES = ['trend', 'country', 'region', 'province', 'topic'];
const GUEST_MSG_LIMIT = 30;
const guestLimit = (req, _res, next) => { rateLimit(`guest:${req.ip}`, 120, 60_000); next(); };
// tin cho khách: chỉ tên + ảnh đại diện người đăng, không có id/online/vị trí
function guestMsg(m, extra = {}) {
  const d = messageDto(m, null);
  return {
    id: d.id, groupId: d.groupId, body: d.body, imageUrl: d.imageUrl, imageUrls: d.imageUrls, preview: d.preview, fwd: d.fwd,
    hearts: extra.hearts ?? d.hearts, createdAt: d.createdAt, modRole: d.modRole,
    user: { displayName: d.user.displayName, avatarColor: d.user.avatarColor, avatarUrl: d.user.avatarUrl, deleted: d.user.deleted, staff: d.user.staff, level: d.user.level, frame: d.user.frame, nameColor: d.user.nameColor },
    reply: d.reply && !d.reply.deleted ? { displayName: d.reply.displayName, body: d.reply.body, hasImage: d.reply.hasImage } : null,
    ...('groupName' in extra ? { groupName: extra.groupName } : {}),
  };
}
api.get('/public/groups', guestLimit, wrap((_req, res) => {
  const rows = db.prepare(`SELECT id, type, name, highlighted FROM groups WHERE type IN ('trend','country','region','province','topic')`).all()
    .map(({ highlighted, ...g }) => (g.type === 'topic' ? { ...g, highlighted: !!highlighted, hlAt: highlighted || 0 } : g));
  const order = { trend: 0, country: 1, region: 2, province: 3, topic: 4 };
  rows.sort((a, b) => order[a.type] - order[b.type] || (b.hlAt || 0) - (a.hlAt || 0) || a.name.localeCompare(b.name, 'vi'));
  for (const g of rows) delete g.hlAt;
  res.json({ groups: rows });
}));
api.get('/public/groups/:id', guestLimit, wrap((req, res) => {
  const g = getGroup(int(req.params.id));
  if (!g || !GUEST_TYPES.includes(g.type)) throw notFound('Không tìm thấy nhóm công khai');
  const rows = db.prepare('SELECT * FROM messages WHERE group_id = ? AND deleted = 0 ORDER BY id DESC LIMIT ?').all(g.id, GUEST_MSG_LIMIT);
  res.json({ group: { id: g.id, type: g.type, name: g.name }, messages: rows.reverse().map((m) => guestMsg(m)), limit: GUEST_MSG_LIMIT });
}));
api.get('/public/hot', guestLimit, wrap(async (_req, res) => {
  const rows = await hotRows(null, null, false); // khách không kích hoạt tải xem trước từ trang ngoài
  const pinned = hotPosts().map((m) => guestMsg(m, { hearts: messageDto(m, null).hearts, groupName: 'Chủ đề nóng' }));
  res.json({ pinned, items: rows.map((m) => ({ ...guestMsg(m, { hearts: m.hc, groupName: getGroup(m.group_id).name }), interactions: m.score })) });
}));
api.get('/public/topic-board', guestLimit, wrap((req, res) => res.json({ topics: topicBoard(boardTab(req)).map(({ joined, creatorName, ...t }) => t) })));
api.get('/public/news', guestLimit, wrap((_req, res) => {
  const rows = db.prepare('SELECT * FROM news ORDER BY pinned DESC, id DESC LIMIT 100').all();
  res.json({ news: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, imageUrl: newsImgs(n)[0] || null, imageUrls: newsImgs(n), pinned: !!n.pinned, edited: !!n.edited, createdAt: n.created_at, hearts: newsHearts(n.id) })) });
}));

// Mọi route bên dưới cần đăng nhập
api.use(auth);

api.post('/auth/logout', wrap((req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
}));

// ============================================================================
// Hồ sơ & cài đặt
// ============================================================================
api.get('/me', wrap((req, res) => {
  touchDaily(req.user.id);
  const u = recompute(req.user.id) || getUser(req.user.id);
  res.json({ user: selfUser(u), levelUp: pendingLevelUp(u) });
}));
api.get('/me/level', wrap((req, res) => {
  recompute(req.user.id);
  res.json({ level: statusOf(req.user.id) });
}));
api.get('/me/titles', wrap((req, res) => {
  recompute(req.user.id);
  res.json(titlesStatus(req.user.id));
}));
api.get('/shop', wrap((req, res) => res.json(shopStatus(req.user.id))));
api.post('/shop/buy', wrap((req, res) => {
  rateLimit(`shopbuy:${req.user.id}`, 30, 60_000);
  const r = buyItem(req.user.id, String(req.body.kind || ''), req.body.id);
  if (r.error) throw bad(r.error);
  res.json({ ...r, shop: shopStatus(req.user.id) });
}));
api.post('/me/appearance', wrap((req, res) => {
  const r = setAppearance(req.user.id, req.body || {});
  if (r.error) throw bad(r.error);
  res.json({ user: selfUser(getUser(req.user.id)) });
}));
api.post('/me/level-seen', wrap((req, res) => {
  db.prepare('UPDATE users SET lvl_seen = lvl WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
}));
// Bấm vào link X được gửi trong Đẩy trend: +1 xu tím, mỗi link tính một lần
api.post('/trend/click', wrap((req, res) => {
  rateLimit(`xclick:${req.user.id}`, 60, 60_000);
  const m = db.prepare('SELECT * FROM messages WHERE id = ? AND deleted = 0').get(int(req.body.messageId));
  if (!m || m.group_id !== trendGroupId()) throw notFound('Tin nhắn không tồn tại');
  const url = String(req.body.url || '');
  if (!normalizeXLink(url) || !m.body.includes(url.replace(/[#?].*$/, ''))) return res.json({ coins: 0 });
  res.json({ coins: onTrendClick(req.user.id, url) });
}));
// Admin cấp / thu hồi danh hiệu (Bot trend...) cho người dùng
api.post('/admin/users/:id/titles', adminOnly, wrap((req, res) => {
  const uid = int(req.params.id);
  if (!getUser(uid)) throw notFound('Không tìm thấy người dùng');
  const title = String(req.body.title || '');
  if (!TITLES[title]) throw bad('Danh hiệu không hợp lệ');
  if (req.body.grant === false) db.prepare('DELETE FROM user_titles WHERE user_id = ? AND title = ?').run(uid, title);
  else db.prepare('INSERT OR IGNORE INTO user_titles (user_id, title, granted_at) VALUES (?,?,?)').run(uid, title, now());
  log(req.user.id, req.body.grant === false ? 'revoke_title' : 'grant_title', { target: uid, reason: title });
  dropTitleRewards(uid);
  recompute(uid);
  res.json({ titles: userTitles(uid) });
}));

api.patch(
  '/me',
  wrap((req, res) => {
    const b = req.body;
    const sets = [];
    const vals = [];
    const set = (col, v) => (sets.push(`${col} = ?`), vals.push(v));
    if (b.displayName !== undefined) {
      const n = str(b.displayName, 30);
      if (n.length < 2) throw bad('Tên hiển thị cần ít nhất 2 ký tự');
      if (n.includes('@') || n.toLowerCase() === req.user.email) throw bad('Tên hiển thị không được trùng email');
      if (db.prepare('SELECT 1 FROM users WHERE name_key = ? AND id != ?').get(nameKey(n), req.user.id)) throw bad('Tên hiển thị này đã có người dùng, hãy chọn tên khác');
      set('display_name', n);
      set('name_key', nameKey(n));
    }
    if (b.language !== undefined) {
      if (!['vi', 'en', 'th'].includes(b.language)) throw bad('Ngôn ngữ không hợp lệ');
      set('language', b.language);
    }
    if (b.avatarColor !== undefined) set('avatar_color', Math.abs(int(b.avatarColor)) % AVATAR_COUNT || 0);
    if (b.avatarUrl !== undefined) set('avatar_url', b.avatarUrl ? checkUploadUrl(b.avatarUrl) : null);
    if (b.friendPolicy !== undefined) {
      if (!['everyone', 'shared', 'none'].includes(b.friendPolicy)) throw bad('Giá trị không hợp lệ');
      set('friend_policy', b.friendPolicy);
    }
    for (const [k, col] of [['showOnline', 'show_online'], ['newsPush', 'news_push'], ['hideSuggestions', 'hide_suggestions']])
      if (b[k] !== undefined) set(col, b[k] ? 1 : 0);
    if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.user.id);
    res.json({ user: selfUser(getUser(req.user.id)) });
  })
);

// Đổi mật khẩu: cần mật khẩu hiện tại; các phiên đăng nhập khác bị đăng xuất
api.post(
  '/me/password',
  wrap((req, res) => {
    rateLimit(`pw:${req.user.id}`, 10, 3600_000);
    const cur = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const next = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
    if (!checkPassword(cur, req.user.pass_hash)) throw bad('Mật khẩu hiện tại không đúng');
    if (next.length < 8) throw bad('Mật khẩu mới cần ít nhất 8 ký tự');
    if (next.length > 200) throw bad('Mật khẩu quá dài');
    if (req.body.confirmPassword !== undefined && req.body.confirmPassword !== next) throw bad('Mật khẩu xác nhận không khớp');
    if (next === cur) throw bad('Mật khẩu mới phải khác mật khẩu hiện tại');
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.token);
    res.json({ ok: true });
  })
);

// Đổi vị trí home (giới hạn 1 lần / 30 ngày)
api.post(
  '/me/home',
  wrap((req, res) => {
    const p = provinceById(req.body.provinceId);
    if (!p) throw bad('Tỉnh/thành không hợp lệ');
    const u = req.user;
    if (p.id === u.province_id) throw bad('Bạn đang chọn tỉnh/thành này rồi');
    if (u.home_changed_at && now() - u.home_changed_at < HOME_CHANGE_COOLDOWN) {
      const days = Math.ceil((HOME_CHANGE_COOLDOWN - (now() - u.home_changed_at)) / DAY);
      throw bad(`Bạn chỉ đổi được vị trí 1 lần / 30 ngày. Thử lại sau ${days} ngày.`);
    }
    const leaveOld = !!req.body.leaveOld;
    tx(() => {
      const oldIds = homeGroupIds(provinceById(u.province_id));
      const newIds = homeGroupIds(p);
      if (leaveOld) for (const gid of oldIds) if (!newIds.includes(gid)) removeMember(gid, u.id);
      for (const gid of newIds) addMember(gid, u.id);
      db.prepare('UPDATE users SET province_id = ?, home_changed_at = ? WHERE id = ?').run(p.id, now(), u.id);
    });
    res.json({ user: selfUser(getUser(u.id)) });
  })
);

// Xóa tài khoản
api.delete(
  '/me',
  wrap((req, res) => {
    if (!checkPassword(String(req.body.password || ''), req.user.pass_hash)) throw bad('Mật khẩu không đúng');
    const id = req.user.id;
    tx(() => {
      db.prepare(
        `DELETE FROM messages WHERE group_id IN (SELECT id FROM groups WHERE type = 'dm' AND key LIKE 'dm:%'
          AND id IN (SELECT group_id FROM members WHERE user_id = ?))`
      ).run(id);
      db.prepare("UPDATE users SET status='deleted', email=?, display_name='Người dùng đã xóa', name_key=NULL, pass_hash='', avatar_url=NULL, verify_token=NULL WHERE id=?").run(`deleted-${id}@deleted.invalid`, id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM members WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM friends WHERE a = ? OR b = ?').run(id, id);
      db.prepare('DELETE FROM friend_requests WHERE from_id = ? OR to_id = ?').run(id, id);
      db.prepare('DELETE FROM blocks WHERE blocker = ? OR blocked = ?').run(id, id);
      db.prepare('DELETE FROM notifications WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM reactions WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM join_requests WHERE user_id = ?').run(id);
      db.prepare("DELETE FROM groups WHERE type = 'private' AND id NOT IN (SELECT group_id FROM members)").run();
    });
    res.json({ ok: true });
  })
);

// ============================================================================
// Upload ảnh (data URL, ≤ 2MB)
// ============================================================================
const IMG_TYPES = {
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/gif': { ext: 'gif', magic: [0x47, 0x49, 0x46] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
};
const checkUploadUrl = (u) => {
  if (typeof u !== 'string' || !/^\/uploads\/[A-Za-z0-9_-]+\.(png|jpg|gif|webp)$/.test(u)) throw bad('Ảnh không hợp lệ');
  return u;
};

api.post(
  '/upload',
  wrap((req, res) => {
    rateLimit(`up:${req.user.id}`, 20, 60_000);
    const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.dataUrl || ''));
    const t = m && IMG_TYPES[m[1]];
    if (!t) throw bad('Chỉ hỗ trợ ảnh PNG, JPG, GIF, WEBP');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_IMAGE) throw bad('Ảnh quá lớn (tối đa 2MB)');
    if (!t.magic.every((b, i) => buf[i] === b)) throw bad('Tệp ảnh không hợp lệ');
    const name = `${randomToken(12)}.${t.ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    res.json({ url: `/uploads/${name}` });
  })
);

// ============================================================================
// Group
// ============================================================================
const PUBLIC_TYPES = ['country', 'region', 'province', 'topic']; // topic: chủ đề thảo luận do Admin/Mod tạo
const isMuted = (m) => m.notif_muted_until === -1 || (m.notif_muted_until && m.notif_muted_until > now());

function groupDto(g, uid, member) {
  const dto = {
    id: g.id, type: g.type, name: g.name, short: g.short, lang: g.lang, avatarUrl: g.avatar_url,
    memberLimit: g.member_limit, createdBy: g.created_by,
  };
  if (g.type === 'topic') { dto.description = g.description || ''; dto.highlighted = !!g.highlighted; }
  if (member) {
    dto.role = member.role;
    dto.mutedUntil = member.notif_muted_until;
    dto.muted = isMuted(member);
    dto.rulesAck = !!member.rules_ack;
    if (g.type === 'trend') dto.canPost = canPostTrend(uid);
    dto.modMutedUntil = member.mod_muted_until && member.mod_muted_until > now() ? member.mod_muted_until : null;
    if (WELCOME_TYPES.includes(g.type)) dto.newcomers = newcomerCount(g.id, uid);
  }
  if (g.type === 'dm') {
    const other = memberIds(g.id).find((x) => x !== uid);
    dto.peer = publicUser(getUser(other), uid);
    dto.name = dto.peer.displayName;
  }
  return dto;
}

api.get(
  '/groups/mine',
  wrap((req, res) => {
    const rows = db
      .prepare(
        `SELECT g.*, m.* , g.id AS gid,
           (SELECT COUNT(*) FROM messages x WHERE x.group_id = g.id AND x.id > m.last_read_id AND x.user_id != m.user_id AND x.deleted = 0) AS unread,
           (SELECT MAX(id) FROM messages x WHERE x.group_id = g.id) AS last_id
         FROM members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ?`
      )
      .all(req.user.id);
    const order = { trend: -1, country: 0, region: 1, province: 2, topic: 3, private: 4, dm: 5 };
    const out = [];
    for (const r of rows) {
      const g = getGroup(r.gid);
      const dto = groupDto(g, req.user.id, getMember(g.id, req.user.id));
      if (g.type === 'dm' && isBlockedEither(req.user.id, dto.peer.id)) continue;
      dto.unread = Math.min(r.unread, 99);
      dto.lastId = r.last_id || 0;
      out.push(dto);
    }
    out.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name, 'vi'));
    // chủ đề nổi bật: hiện cho mọi người ở đầu mục Chủ đề thảo luận, kể cả khi chưa tham gia
    const highlights = db.prepare("SELECT id, name FROM groups WHERE type = 'topic' AND highlighted IS NOT NULL ORDER BY highlighted DESC").all();
    res.json({ groups: out, highlights });
  })
);

api.get(
  '/groups/discover',
  wrap((req, res) => {
    const type = PUBLIC_TYPES.includes(req.query.type) ? req.query.type : null;
    const q = str(req.query.q, 60).toLowerCase();
    const rows = db
      .prepare(
        `SELECT g.*, (SELECT COUNT(*) FROM members WHERE group_id = g.id) AS cnt,
                EXISTS(SELECT 1 FROM members WHERE group_id = g.id AND user_id = ?) AS joined
         FROM groups g WHERE g.type IN ('country','region','province') ${type ? 'AND g.type = ?' : ''}`
      )
      .all(...(type ? [req.user.id, type] : [req.user.id]));
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
    const groups = rows
      .filter((g) => !q || norm(g.name).includes(norm(q)))
      .map((g) => ({ id: g.id, type: g.type, name: g.name, short: g.short, lang: g.lang, memberCount: g.cnt, joined: !!g.joined }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    res.json({ groups });
  })
);

// Gợi ý group gần vị trí / cùng ngôn ngữ (chưa tham gia)
api.get(
  '/groups/suggestions',
  wrap((req, res) => {
    if (req.user.hide_suggestions) return res.json({ groups: [], hidden: true });
    const home = provinceById(req.user.province_id);
    const sameRegion = PROVINCES.filter((p) => p.region === home.region && p.id !== home.id).slice(0, 4);
    const keys = sameRegion.map((p) => `${COUNTRY.code}:p:${p.id}`);
    const rows = keys
      .map((k) => db.prepare('SELECT * FROM groups WHERE key = ?').get(k))
      .filter((g) => g && !getMember(g.id, req.user.id));
    res.json({
      groups: rows.map((g) => ({ id: g.id, type: g.type, name: g.name, lang: g.lang, reason: 'Cùng khu vực với bạn' })),
    });
  })
);

// Chủ đề thảo luận: ai cũng chat / thả tim được, không cần bấm "Tham gia" → tự vào khi tương tác lần đầu
// (đã đồng ý quy tắc cộng đồng lúc đăng ký; người bị mời ra khỏi chủ đề thì không tự vào lại)
function autoJoinTopic(gid, uid) {
  const g = getGroup(gid);
  if (g?.type !== 'topic') return;
  const m = getMember(gid, uid);
  if (m) { if (!m.rules_ack) db.prepare('UPDATE members SET rules_ack = 1 WHERE group_id = ? AND user_id = ?').run(gid, uid); return; }
  if (db.prepare('SELECT 1 FROM bans WHERE group_id = ? AND user_id = ?').get(gid, uid)) return;
  addMember(gid, uid);
  db.prepare('UPDATE members SET rules_ack = 1 WHERE group_id = ? AND user_id = ?').run(gid, uid);
}
function requireMember(gid, uid) {
  const g = getGroup(gid);
  if (!g) throw notFound('Không tìm thấy nhóm');
  const m = getMember(gid, uid);
  if (!m) throw forbidden('Bạn chưa tham gia nhóm này');
  return { g, m };
}

api.get(
  '/groups/:id',
  wrap((req, res) => {
    const id = int(req.params.id);
    const g = getGroup(id);
    if (!g) throw notFound('Không tìm thấy nhóm');
    const m = getMember(id, req.user.id);
    if (!m && !PUBLIC_TYPES.includes(g.type)) throw forbidden();
    const dto = groupDto(g, req.user.id, m);
    dto.memberCount = db.prepare('SELECT COUNT(*) c FROM members WHERE group_id = ?').get(id).c;
    dto.mods = db
      .prepare("SELECT user_id FROM members WHERE group_id = ? AND role IN ('mod','admin')")
      .all(id)
      .map((r) => ({ ...publicUser(getUser(r.user_id)), role: getMember(id, r.user_id).role }));
    dto.canPin = canPin(g, req.user.id, m);
    dto.pinned = pinnedDto(g, req.user.id);
    if (g.type === 'private' && m) {
      dto.members = memberIds(id).map((uid) => ({ ...publicUser(getUser(uid), req.user.id), role: getMember(id, uid).role }));
    }
    res.json({ group: dto });
  })
);

// ---- Chủ đề thảo luận: Admin / Mod tạo, mọi người vào bàn luận như một nhóm chat ----
const canCreateTopic = (uid) => isSystemAdmin(uid) || (getUser(uid)?.lvl || 0) >= 4 ||
  !!db.prepare("SELECT 1 FROM members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? AND m.role = 'mod' AND g.type IN ('country','region','province','topic')").get(uid);
function topicDto(g, uid) {
  const m = getMember(g.id, uid);
  const last = db.prepare('SELECT MAX(created_at) t FROM messages WHERE group_id = ? AND deleted = 0').get(g.id).t;
  return {
    id: g.id, name: g.name, description: g.description || '', createdAt: g.created_at, lastAt: last || g.created_at,
    memberCount: db.prepare('SELECT COUNT(*) c FROM members WHERE group_id = ?').get(g.id).c,
    creator: g.created_by ? publicUser(getUser(g.created_by)) : null, joined: !!m,
    canManage: g.created_by === uid || isSystemAdmin(uid),
    highlighted: !!g.highlighted, highlightedAt: g.highlighted || 0,
  };
}
const pendingDto = (g) => ({ id: g.id, name: g.name, description: g.description || '', createdAt: g.created_at, creator: g.created_by ? publicUser(getUser(g.created_by)) : null });
api.get('/topics', wrap((req, res) => {
  const rows = db.prepare("SELECT * FROM groups WHERE type = 'topic'").all();
  // chủ đề nổi bật lên đầu (mới đặt trước), sau đó theo hoạt động gần nhất
  const topics = rows.map((g) => topicDto(g, req.user.id)).sort((a, b) => b.highlightedAt - a.highlightedAt || b.lastAt - a.lastAt);
  const mine = db.prepare("SELECT * FROM groups WHERE type = 'topic_pending' AND created_by = ? ORDER BY id DESC").all(req.user.id).map(pendingDto);
  res.json({ topics, mine, needsApproval: !canCreateTopic(req.user.id), canHighlight: isSystemAdmin(req.user.id) });
}));

// Bảng "Chủ đề nóng": tab Mới (theo thời điểm được duyệt) và tab Nổi bật (Admin đặt, hoặc sôi nổi trong 24 giờ qua)
const HOT_TOPIC_MIN_MSGS = 5, HOT_TOPIC_MIN_USERS = 2; // "nhiều thảo luận": ít nhất 5 tin từ 2 người khác nhau trong 24 giờ
function topicBoard(tab, uid = null) {
  const since = now() - 86400_000;
  const stat = db.prepare('SELECT COUNT(*) n, COUNT(DISTINCT user_id) u, MAX(created_at) t FROM messages WHERE group_id = ? AND deleted = 0 AND created_at > ?');
  const last = db.prepare('SELECT MAX(created_at) t FROM messages WHERE group_id = ? AND deleted = 0');
  const mem = db.prepare('SELECT COUNT(*) c FROM members WHERE group_id = ?');
  let items = db.prepare("SELECT * FROM groups WHERE type = 'topic'").all().map((g) => {
    const s = stat.get(g.id, since);
    return {
      id: g.id, name: g.name, description: g.description || '', approvedAt: g.approved_at || g.created_at,
      lastAt: last.get(g.id).t || g.created_at, memberCount: mem.get(g.id).c, msgs24h: s.n, users24h: s.u,
      highlighted: !!g.highlighted, hlAt: g.highlighted || 0,
      creatorName: g.created_by ? getUser(g.created_by)?.display_name || null : null,
      joined: uid ? !!getMember(g.id, uid) : false,
    };
  });
  if (tab === 'hot') {
    items = items.filter((t) => t.highlighted || (t.msgs24h >= HOT_TOPIC_MIN_MSGS && t.users24h >= HOT_TOPIC_MIN_USERS))
      .sort((a, b) => b.hlAt - a.hlAt || b.msgs24h - a.msgs24h || b.lastAt - a.lastAt);
  } else items.sort((a, b) => b.approvedAt - a.approvedAt || b.id - a.id);
  return items.slice(0, 50).map(({ hlAt, ...t }) => t);
}
const boardTab = (req) => (req.query.tab === 'hot' ? 'hot' : 'new');
api.get('/topic-board', wrap((req, res) => res.json({
  topics: topicBoard(boardTab(req), req.user.id), needsApproval: !canCreateTopic(req.user.id),
  mine: db.prepare("SELECT * FROM groups WHERE type = 'topic_pending' AND created_by = ? ORDER BY id DESC").all(req.user.id).map(pendingDto),
})));

// Duyệt chủ đề (Admin)
api.get('/topics/pending', adminOnly, wrap((_req, res) => {
  res.json({ topics: db.prepare("SELECT * FROM groups WHERE type = 'topic_pending' ORDER BY id").all().map(pendingDto) });
}));
api.post('/topics/pending/:id/approve', adminOnly, wrap((req, res) => {
  const g = getGroup(int(req.params.id));
  if (!g || g.type !== 'topic_pending') throw notFound('Chủ đề này không còn chờ duyệt');
  tx(() => {
    db.prepare("UPDATE groups SET type = 'topic', approved_at = ?, key = ? WHERE id = ?").run(now(), `topic:${g.created_by}:${now()}:${randomToken(4)}`, g.id);
    if (g.created_by && getUser(g.created_by)?.status === 'active') {
      addMember(g.id, g.created_by, 'mod'); // người tạo quản lý chủ đề
      db.prepare('UPDATE members SET rules_ack = 1 WHERE group_id = ? AND user_id = ?').run(g.id, g.created_by);
    }
  });
  log(req.user.id, 'approve_topic', { group: g.id, name: g.name });
  if (g.created_by) award(g.created_by, 'topic', 30, { ref: String(g.id) });
  if (g.created_by) notify(g.created_by, 'moderation', `Chủ đề "${g.name}" của bạn đã được duyệt và hiện ở mục Chủ đề nóng`, { url: `/#/chat/${g.id}`, tag: `topic-ok-${g.id}` });
  res.json({ ok: true });
}));
api.post('/topics/pending/:id/reject', adminOnly, wrap((req, res) => {
  const g = getGroup(int(req.params.id));
  if (!g || g.type !== 'topic_pending') throw notFound('Chủ đề này không còn chờ duyệt');
  const reason = str(req.body.reason, 300);
  db.prepare('DELETE FROM groups WHERE id = ?').run(g.id);
  log(req.user.id, 'reject_topic', { group: g.id, name: g.name, reason });
  if (g.created_by) notify(g.created_by, 'moderation', `Chủ đề "${g.name}" chưa được duyệt${reason ? `: ${reason}` : ''}`, { tag: `topic-no-${g.id}` });
  res.json({ ok: true });
}));
// Người tạo rút lại chủ đề đang chờ duyệt
api.delete('/topics/pending/:id', wrap((req, res) => {
  const g = getGroup(int(req.params.id));
  if (!g || g.type !== 'topic_pending' || g.created_by !== req.user.id) throw notFound('Không tìm thấy chủ đề chờ duyệt');
  db.prepare('DELETE FROM groups WHERE id = ?').run(g.id);
  res.json({ ok: true });
}));
// Admin đặt / bỏ nổi bật một chủ đề
api.post('/topics/:id/highlight', wrap((req, res) => {
  if (!isSystemAdmin(req.user.id)) throw forbidden('Chỉ Admin được đặt chủ đề nổi bật');
  const g = getGroup(int(req.params.id));
  if (!g || g.type !== 'topic') throw notFound('Không tìm thấy chủ đề');
  const on = req.body.on !== false;
  db.prepare('UPDATE groups SET highlighted = ? WHERE id = ?').run(on ? now() : null, g.id);
  log(req.user.id, on ? 'highlight_topic' : 'unhighlight_topic', { group: g.id, name: g.name });
  if (on && g.created_by) award(g.created_by, 'hl', 50, { ref: String(g.id) });
  res.json({ topic: topicDto(getGroup(g.id), req.user.id) });
}));
api.post('/topics', wrap((req, res) => {
  const free = canCreateTopic(req.user.id); // Admin/Mod: tạo tuỳ ý; người dùng thường: chờ Admin duyệt
  rateLimit(`topic:${req.user.id}`, free ? 10 : 5, free ? 3600_000 : 86400_000);
  const name = str(req.body.name, 60), description = str(req.body.description, 300);
  if (name.length < 2) throw bad('Tên chủ đề cần ít nhất 2 ký tự');
  if (!free) {
    if (db.prepare("SELECT COUNT(*) c FROM groups WHERE type = 'topic_pending' AND created_by = ?").get(req.user.id).c >= 3) throw bad('Bạn đang có 3 chủ đề chờ duyệt. Hãy đợi Admin duyệt rồi tạo tiếp.');
    const key = `topic:${req.user.id}:${now()}:${randomToken(4)}`;
    const r = db.prepare('INSERT INTO groups (type, key, name, description, created_by, created_at) VALUES (?,?,?,?,?,?)')
      .run('topic_pending', key, name, description || null, req.user.id, now());
    const gid = Number(r.lastInsertRowid);
    log(req.user.id, 'submit_topic', { group: gid, name });
    for (const a of db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all()) {
      notify(a.id, 'mod', `${req.user.display_name} đề xuất chủ đề "${name}" — đang chờ duyệt`, { url: '/#/admin', tag: 'topic-pending' });
    }
    return res.status(202).json({ pending: true, topic: pendingDto(getGroup(gid)) });
  }
  const id = tx(() => {
    const r = db.prepare('INSERT INTO groups (type, key, name, description, created_by, created_at) VALUES (?,?,?,?,?,?)')
      .run('topic', `topic:${req.user.id}:${now()}:${randomToken(4)}`, name, description || null, req.user.id, now());
    const gid = Number(r.lastInsertRowid);
    db.prepare('UPDATE groups SET approved_at = ? WHERE id = ?').run(now(), gid);
    addMember(gid, req.user.id, 'mod'); // người tạo quản lý chủ đề
    db.prepare('UPDATE members SET rules_ack = 1 WHERE group_id = ? AND user_id = ?').run(gid, req.user.id);
    return gid;
  });
  log(req.user.id, 'create_topic', { group: id, name });
  award(req.user.id, 'topic', 30, { ref: String(id) });
  res.status(201).json({ topic: topicDto(getGroup(id), req.user.id) });
}));
api.patch('/topics/:id', wrap((req, res) => {
  const g = getGroup(int(req.params.id));
  if (!g || g.type !== 'topic') throw notFound('Không tìm thấy chủ đề');
  if (g.created_by !== req.user.id && !isSystemAdmin(req.user.id)) throw forbidden();
  const name = req.body.name !== undefined ? str(req.body.name, 60) : g.name;
  const description = req.body.description !== undefined ? str(req.body.description, 300) : g.description || '';
  if (name.length < 2) throw bad('Tên chủ đề cần ít nhất 2 ký tự');
  db.prepare('UPDATE groups SET name = ?, description = ? WHERE id = ?').run(name, description || null, g.id);
  res.json({ topic: topicDto(getGroup(g.id), req.user.id) });
}));
api.delete('/topics/:id', wrap((req, res) => {
  const g = getGroup(int(req.params.id));
  if (!g || g.type !== 'topic') throw notFound('Không tìm thấy chủ đề');
  if (g.created_by !== req.user.id && !isSystemAdmin(req.user.id)) throw forbidden();
  const ids = memberIds(g.id);
  tx(() => {
    db.prepare("DELETE FROM comments WHERE kind = 'msg' AND target_id IN (SELECT id FROM messages WHERE group_id = ?)").run(g.id);
    db.prepare('DELETE FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE group_id = ?)').run(g.id);
    db.prepare('DELETE FROM messages WHERE group_id = ?').run(g.id);
    db.prepare('DELETE FROM members WHERE group_id = ?').run(g.id);
    db.prepare('DELETE FROM groups WHERE id = ?').run(g.id);
  });
  log(req.user.id, 'delete_topic', { group: g.id, name: g.name });
  for (const id of ids) if (id !== req.user.id) notify(id, 'group_dissolved', `Chủ đề "${g.name}" đã được đóng`);
  res.json({ ok: true });
}));

// ---- ghim một tin nhắn lên đầu nhóm ----------------------------------------------
function canPin(g, uid, m = getMember(g.id, uid)) {
  if (g.type === 'dm' || g.type === 'hot') return false;
  if (g.type === 'private') return m?.role === 'admin';
  return isSystemAdmin(uid);
}
function pinnedDto(g, uid) {
  if (!g.pinned_message_id) return null;
  const msg = db.prepare('SELECT * FROM messages WHERE id = ? AND group_id = ? AND deleted = 0').get(g.pinned_message_id, g.id);
  return msg ? messageDto(msg, uid) : null;
}
api.post('/groups/:id/pin', wrap((req, res) => {
  const g = getGroup(int(req.params.id));
  if (!g) throw notFound('Không tìm thấy nhóm');
  if (!canPin(g, req.user.id)) throw forbidden('Chỉ Admin được ghim tin nhắn');
  const msg = db.prepare('SELECT * FROM messages WHERE id = ? AND group_id = ? AND deleted = 0').get(int(req.body.messageId), g.id);
  if (!msg) throw notFound('Tin nhắn không tồn tại trong nhóm này');
  db.prepare('UPDATE groups SET pinned_message_id = ? WHERE id = ?').run(msg.id, g.id);
  log(req.user.id, 'pin_message', { group: g.id, message: msg.id });
  hub.sendMany(memberIds(g.id), { type: 'pin', groupId: g.id, message: messageDto(msg, null) });
  res.json({ pinned: messageDto(msg, req.user.id) });
}));
api.delete('/groups/:id/pin', wrap((req, res) => {
  const g = getGroup(int(req.params.id));
  if (!g) throw notFound('Không tìm thấy nhóm');
  if (!canPin(g, req.user.id)) throw forbidden('Chỉ Admin được bỏ ghim tin nhắn');
  db.prepare('UPDATE groups SET pinned_message_id = NULL WHERE id = ?').run(g.id);
  hub.sendMany(memberIds(g.id), { type: 'pin', groupId: g.id, message: null });
  res.json({ ok: true });
}));

// ---- bình luận: bản tin và tin ở Chủ đề nóng --------------------------------------------
const COMMENT_KINDS = ['news', 'msg'];
// kiểm tra người dùng được xem/bình luận đối tượng này; trả về { ownerId } (tác giả để báo khi có bình luận)
function commentTarget(kind, id, uid) {
  if (!COMMENT_KINDS.includes(kind)) throw bad('Loại bình luận không hợp lệ');
  if (kind === 'news') {
    const n = db.prepare('SELECT id FROM news WHERE id = ?').get(id);
    if (!n) throw notFound('Bản tin không tồn tại');
    return { ownerId: null };
  }
  const msg = db.prepare('SELECT * FROM messages WHERE id = ? AND deleted = 0').get(id);
  if (!msg) throw notFound('Tin nhắn không tồn tại');
  const g = getGroup(msg.group_id);
  const open = [...PUBLIC_TYPES, 'trend', 'hot'].includes(g.type);
  if (!open && !getMember(g.id, uid)) throw forbidden();
  if (isBlockedEither(uid, msg.user_id)) throw forbidden();
  return { ownerId: msg.user_id };
}
const commentDto = (c, uid) => ({
  id: c.id, body: c.body, createdAt: c.created_at, user: publicUser(getUser(c.user_id)),
  mine: c.user_id === uid, canDelete: c.user_id === uid || isSystemAdmin(uid),
});
api.get('/comments/:kind/:id', wrap((req, res) => {
  commentTarget(req.params.kind, int(req.params.id), req.user.id);
  const rows = db.prepare('SELECT * FROM comments WHERE kind = ? AND target_id = ? ORDER BY id ASC LIMIT 300').all(req.params.kind, int(req.params.id));
  res.json({ comments: rows.filter((c) => c.user_id === req.user.id || !isBlockedEither(req.user.id, c.user_id)).map((c) => commentDto(c, req.user.id)) });
}));
api.post('/comments/:kind/:id', wrap((req, res) => {
  rateLimit(`cmt:${req.user.id}`, 20, 60_000);
  const kind = req.params.kind, id = int(req.params.id);
  const { ownerId } = commentTarget(kind, id, req.user.id);
  const body = str(req.body.body, 1000);
  if (!body) throw bad('Bình luận trống');
  const r = db.prepare('INSERT INTO comments (kind, target_id, user_id, body, created_at) VALUES (?,?,?,?,?)').run(kind, id, req.user.id, body, now());
  if (ownerId && ownerId !== req.user.id) notify(ownerId, 'reply', `${req.user.display_name} đã bình luận tin của bạn ở Chủ đề nóng`, { url: '/#/hot', tag: `cmt-${id}` });
  res.status(201).json({ comment: commentDto(db.prepare('SELECT * FROM comments WHERE id = ?').get(r.lastInsertRowid), req.user.id) });
}));
api.delete('/comments/:cid', wrap((req, res) => {
  const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(int(req.params.cid));
  if (!c) throw notFound();
  if (c.user_id !== req.user.id && !isSystemAdmin(req.user.id)) throw forbidden();
  db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
  res.json({ ok: true });
}));

api.post(
  '/groups/:id/join',
  wrap((req, res) => {
    const g = getGroup(int(req.params.id));
    if (!g || !PUBLIC_TYPES.includes(g.type)) throw notFound('Không tìm thấy nhóm công khai');
    if (db.prepare('SELECT 1 FROM bans WHERE group_id=? AND user_id=?').get(g.id, req.user.id)) throw forbidden('Bạn đã bị mời ra khỏi nhóm này');
    const had = !!getMember(g.id, req.user.id);
    addMember(g.id, req.user.id); // vào ngay, không cần duyệt; không đổi vị trí home
    if (!had) welcomeUser(req.user.id, g);
    res.json({ group: groupDto(g, req.user.id, getMember(g.id, req.user.id)) });
  })
);

api.post(
  '/groups/:id/leave',
  wrap((req, res) => {
    const { g, m } = requireMember(int(req.params.id), req.user.id);
    if (g.type === 'dm') throw bad('Không thể rời cuộc trò chuyện 1-1');
    if (g.type === 'trend') throw bad('Không thể rời nhóm Đẩy trend');
    if (g.type === 'country') throw bad('Không thể rời nhóm quốc gia');
    if (g.type === 'private') return leavePrivate(g, req.user.id, res);
    removeMember(g.id, req.user.id);
    res.json({ ok: true });
  })
);

// ---- tag người dùng (@tên) ----------------------------------------------------
// Chỉ nhận người ở trong nhóm, không phải chính mình, không phải Admin hệ thống, không chặn nhau,
// và tên của họ có thật trong nội dung tin.
function validMentions(gid, authorId, body, ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const raw of ids.slice(0, 10)) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id === authorId || out.includes(id)) continue;
    const u = getUser(id);
    if (!u || u.status !== 'active' || u.is_super || !getMember(gid, id) || isBlockedEither(authorId, id)) continue;
    if (!body.toLowerCase().includes('@' + u.display_name.toLowerCase())) continue;
    out.push(id);
  }
  return out;
}
function notifyMentions(g, author, ids) {
  const where = g.type === 'dm' ? 'tin nhắn riêng' : `"${g.name}"`;
  for (const id of ids) notify(id, 'mention', `${author.display_name} đã nhắc đến bạn trong ${where}`, { url: `/#/chat/${g.id}`, tag: `mention-${g.id}` });
}
api.get('/groups/:id/mention-search', wrap((req, res) => {
  const tg = getGroup(int(req.params.id));
  const { g } = tg?.type === 'topic' ? { g: tg } : requireMember(int(req.params.id), req.user.id); // chủ đề: chưa tham gia vẫn tag được
  const q = nameKey(str(req.query.q, 30)).replace(/[%_\\]/g, '');
  const rows = db.prepare(`SELECT u.id FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ? AND u.id != ? AND u.is_super = 0 AND u.status = 'active' AND u.name_key LIKE ?
      ORDER BY (u.name_key LIKE ?) DESC, u.display_name LIMIT 20`).all(g.id, req.user.id, '%' + q + '%', q + '%');
  const users = rows.filter((r) => !isBlockedEither(req.user.id, r.id)).slice(0, 8).map((r) => { const p = publicUser(getUser(r.id)); return { id: p.id, displayName: p.displayName, avatarColor: p.avatarColor, avatarUrl: p.avatarUrl }; });
  res.json({ users });
}));

api.get('/groups/:id/welcome', wrap((req, res) => {
  const { g } = requireMember(int(req.params.id), req.user.id);
  if (!WELCOME_TYPES.includes(g.type)) throw bad('Nhóm này không có mục Chào mừng');
  const rows = db.prepare(`SELECT m.user_id, m.joined_at FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ? AND m.joined_at > ? AND u.status = 'active' AND u.is_super = 0 ORDER BY m.joined_at DESC LIMIT 60`).all(g.id, now() - NEWCOMER_MS);
  const newcomers = rows
    .filter((r) => r.user_id === req.user.id || !isBlockedEither(req.user.id, r.user_id))
    .map((r) => {
      const ws = db.prepare('SELECT * FROM welcomes WHERE group_id = ? AND user_id = ? ORDER BY id DESC LIMIT 30').all(g.id, r.user_id).reverse()
        .filter((w) => w.author_id === req.user.id || !isBlockedEither(req.user.id, w.author_id));
      return {
        user: publicUser(getUser(r.user_id)), isMe: r.user_id === req.user.id, joinedAt: r.joined_at,
        welcomes: ws.map((w) => ({ id: w.id, author: publicUser(getUser(w.author_id)), body: w.body, createdAt: w.created_at, mine: w.author_id === req.user.id })),
        mineCount: ws.filter((w) => w.author_id === req.user.id).length,
      };
    })
    .sort((a, b) => Number(b.isMe) - Number(a.isMe));
  res.json({ group: { id: g.id, name: g.name, type: g.type }, newcomers, days: 7, perAuthor: WELCOME_PER_AUTHOR });
}));
api.post('/groups/:id/welcome/:uid', wrap((req, res) => {
  rateLimit(`welcome:${req.user.id}`, 20, 60_000);
  const gid = int(req.params.id), target = int(req.params.uid);
  const { g, m } = requireMember(gid, req.user.id);
  if (!WELCOME_TYPES.includes(g.type)) throw bad('Nhóm này không có mục Chào mừng');
  if (PUBLIC_TYPES.includes(g.type) && !m.rules_ack) throw forbidden('Bạn cần xác nhận đã đọc quy tắc cộng đồng trước khi gửi lời chào');
  if (m.mod_muted_until && m.mod_muted_until > now()) throw forbidden('Bạn đang bị tắt tiếng trong nhóm này');
  if (target === req.user.id) throw bad('Bạn không thể tự chào mừng mình');
  const tm = getMember(gid, target), tu = getUser(target);
  if (!tm || !tu || tu.status !== 'active' || tu.is_super || tm.joined_at <= now() - NEWCOMER_MS) throw notFound('Không tìm thấy thành viên mới này');
  if (isBlockedEither(req.user.id, target)) throw forbidden('Không thể gửi lời chào cho người này');
  const body = str(req.body.body, 300);
  if (!body) throw bad('Hãy viết vài chữ chào mừng');
  const mine = db.prepare('SELECT COUNT(*) c FROM welcomes WHERE group_id = ? AND user_id = ? AND author_id = ?').get(gid, target, req.user.id).c;
  if (mine >= WELCOME_PER_AUTHOR) throw bad(`Bạn đã gửi đủ ${WELCOME_PER_AUTHOR} lời chào cho thành viên này`);
  const r = db.prepare('INSERT INTO welcomes (group_id, user_id, author_id, body, created_at) VALUES (?,?,?,?,?)').run(gid, target, req.user.id, body, now());
  if (mine === 0) notify(target, 'welcome', `${req.user.display_name} đã gửi lời chào mừng bạn trong "${g.name}"`, { url: `/#/welcome/${gid}`, tag: `welcome-${gid}` });
  res.status(201).json({ welcome: { id: Number(r.lastInsertRowid), author: publicUser(getUser(req.user.id)), body, createdAt: now(), mine: true } });
}));

api.post('/groups/:id/rules-ack', wrap((req, res) => {
  requireMember(int(req.params.id), req.user.id);
  db.prepare('UPDATE members SET rules_ack = 1 WHERE group_id = ? AND user_id = ?').run(int(req.params.id), req.user.id);
  res.json({ ok: true });
}));

api.post('/groups/:id/mute', wrap((req, res) => {
  const { m } = requireMember(int(req.params.id), req.user.id);
  const d = req.body.duration;
  const until = d === '1h' ? now() + 3600_000 : d === '8h' ? now() + 8 * 3600_000 : d === 'forever' ? -1 : d === 'off' ? null : undefined;
  if (until === undefined) throw bad('Thời gian không hợp lệ');
  db.prepare('UPDATE members SET notif_muted_until = ? WHERE group_id = ? AND user_id = ?').run(until, int(req.params.id), req.user.id);
  res.json({ mutedUntil: until, muted: until !== null });
}));

api.post('/groups/:id/read', wrap((req, res) => {
  const gid = int(req.params.id);
  requireMember(gid, req.user.id);
  db.prepare('UPDATE members SET last_read_id = COALESCE((SELECT MAX(id) FROM messages WHERE group_id = ?),0) WHERE group_id = ? AND user_id = ?').run(gid, gid, req.user.id);
  res.json({ ok: true });
}));

// ---- tin nhắn -----------------------------------------------------------------
api.get(
  '/groups/:id/messages',
  wrap((req, res) => {
    const gid = int(req.params.id);
    // nhóm công khai: ai cũng đọc được, không cần tham gia
    const pub = getGroup(gid);
    const { g } = pub && PUBLIC_TYPES.includes(pub.type) ? { g: pub } : requireMember(gid, req.user.id);
    if (g.type === 'dm' && isBlockedEither(req.user.id, memberIds(gid).find((x) => x !== req.user.id))) throw forbidden();
    const limit = Math.min(Math.max(int(req.query.limit) || 40, 1), 100);
    const before = int(req.query.before);
    const rows = db
      .prepare(`SELECT * FROM messages WHERE group_id = ? AND deleted = 0 ${before ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`)
      .all(...(before ? [gid, before, limit] : [gid, limit]));
    res.json({ messages: rows.reverse().map((m) => messageDto(m, req.user.id)), hasMore: rows.length === limit });
  })
);

api.post(
  '/groups/:id/messages',
  wrap((req, res) => {
    rateLimit(`msg:${req.user.id}`, 20, 10_000);
    const gid = int(req.params.id);
    autoJoinTopic(gid, req.user.id);
    const { g, m } = requireMember(gid, req.user.id);
    const body = str(req.body.body, 2000);
    // tối đa 4 ảnh mỗi tin (imageUrls); imageUrl (cũ): một ảnh
    const rawImgs = Array.isArray(req.body.imageUrls) ? req.body.imageUrls : req.body.imageUrl ? [req.body.imageUrl] : [];
    if (rawImgs.length > 4) throw bad('Mỗi tin nhắn gửi kèm tối đa 4 ảnh');
    const imageUrls = [...new Set(rawImgs.map(checkUploadUrl))];
    const imageUrl = imageUrls[0] || null;
    if (!body && !imageUrl) throw bad('Tin nhắn trống');
    if (g.type === 'trend' && !canPostTrend(req.user.id)) throw forbidden('Chỉ admin, mod và người dùng từ cấp Tím Mộng Mơ mới được đăng trong Đẩy trend');
    if (g.type === 'trend' && duplicateTrendLink(body)) throw new HttpError(409, `Link này đã có trong Đẩy trend. Tin trong Đẩy trend chỉ tồn tại ${TREND_LINK_HOURS} giờ, hết hạn mới gửi lại được.`);
    if (PUBLIC_TYPES.includes(g.type) && !m.rules_ack) throw forbidden('Bạn cần xác nhận đã đọc quy tắc cộng đồng trước khi chat');
    if (m.mod_muted_until && m.mod_muted_until > now()) throw forbidden('Bạn đang bị tắt tiếng trong nhóm này');
    if (g.type === 'dm') {
      const peer = memberIds(gid).find((x) => x !== req.user.id);
      if (!peer || !areFriends(req.user.id, peer) || isBlockedEither(req.user.id, peer)) throw forbidden('Không thể nhắn tin cho người này');
    }
    let replyTo = null;
    if (req.body.replyTo) {
      const r = db.prepare('SELECT id FROM messages WHERE id = ? AND group_id = ?').get(int(req.body.replyTo), gid);
      replyTo = r?.id ?? null;
    }
    const mentionIds = validMentions(gid, req.user.id, body, req.body.mentions);
    // @everyone: chỉ Admin (toàn hệ thống), không dùng trong tin nhắn riêng
    const mentionAll = /(^|\s)@everyone(?![\p{L}\p{N}_])/iu.test(body) && isSystemAdmin(req.user.id) && g.type !== 'dm';
    const r = db
      .prepare('INSERT INTO messages (group_id, user_id, body, image_url, images, reply_to, mentions, mention_all, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(gid, req.user.id, body, imageUrl, imageUrls.length ? JSON.stringify(imageUrls) : null, replyTo, mentionIds.length ? JSON.stringify(mentionIds) : null, mentionAll ? 1 : 0, now());
    const dto = messageDto(db.prepare('SELECT * FROM messages WHERE id = ?').get(r.lastInsertRowid), req.user.id);
    db.prepare('UPDATE members SET last_read_id = ? WHERE group_id = ? AND user_id = ?').run(dto.id, gid, req.user.id);
    hub.sendMany(memberIds(gid), { type: 'message', message: dto });
    res.status(201).json({ message: dto });
    touchDaily(req.user.id);
    onMessage(req.user, g, dto, replyTo ? db.prepare('SELECT user_id FROM messages WHERE id = ?').get(replyTo)?.user_id : null);
    notifyMentions(g, req.user, mentionIds);
    if (mentionAll) {
      const text = `${req.user.display_name} đã nhắc đến mọi người trong "${g.name}"`;
      tx(() => {
        for (const uid of memberIds(gid)) {
          if (uid === req.user.id || mentionIds.includes(uid)) continue;
          const mm = getMember(gid, uid);
          if (!mm || isMuted(mm) || isBlockedEither(req.user.id, uid)) continue;
          notify(uid, 'mention', text, { url: `/#/chat/${gid}`, tag: `mention-${gid}` });
        }
      });
    }
    // báo cho người được trả lời (nếu chưa được báo vì tag)
    if (replyTo && g.type !== 'dm') {
      const orig = db.prepare('SELECT user_id FROM messages WHERE id = ?').get(replyTo);
      if (orig && orig.user_id !== req.user.id && !mentionIds.includes(orig.user_id) && getMember(gid, orig.user_id) && !isBlockedEither(req.user.id, orig.user_id)) {
        notify(orig.user_id, 'reply', `${req.user.display_name} đã trả lời tin của bạn trong "${g.name}"`, { url: `/#/chat/${gid}`, tag: `reply-${gid}` });
      }
    }
    // tin nhắn riêng: chỉ đẩy thông báo ngoài app (không thêm vào danh sách thông báo)
    if (g.type === 'dm') {
      const peer = memberIds(gid).find((x) => x !== req.user.id);
      const pm = peer && getMember(gid, peer);
      if (pm && !isMuted(pm)) pushOnly(peer, 'dm', { body: `${req.user.display_name} đã nhắn tin cho bạn`, url: `/#/chat/${gid}`, tag: `dm-${gid}` });
    }
    // xem trước liên kết: lấy nền, xong thì báo cho các thành viên
    const link = firstUrl(body);
    if (link) {
      buildPreview(link, UPLOAD_DIR).then((p) => {
        if (!p) return;
        db.prepare('UPDATE messages SET preview = ? WHERE id = ?').run(JSON.stringify(p), dto.id);
        hub.sendMany(memberIds(gid), { type: 'message_preview', groupId: gid, messageId: dto.id, preview: p });
      }).catch(() => {});
    }
  })
);

// Chuyển tiếp tin từ nhóm khác (kể cả chưa tham gia, nếu là nhóm công khai) vào nhóm mình đã tham gia
api.post(
  '/messages/:id/forward',
  wrap((req, res) => {
    rateLimit(`msg:${req.user.id}`, 20, 10_000);
    const src = db.prepare('SELECT * FROM messages WHERE id = ?').get(int(req.params.id));
    if (!src || src.deleted) throw notFound('Tin nhắn không tồn tại');
    const sg = getGroup(src.group_id);
    const srcPublic = PUBLIC_TYPES.includes(sg.type) || sg.type === 'trend' || sg.type === 'hot';
    if (!srcPublic && !getMember(sg.id, req.user.id)) throw forbidden('Không thể chuyển tiếp tin từ nhóm riêng bạn chưa tham gia');
    if (sg.type === 'dm' && isBlockedEither(req.user.id, src.user_id)) throw forbidden();
    if (isBlockedEither(req.user.id, src.user_id)) throw forbidden();
    const gid = int(req.body.groupId);
    autoJoinTopic(gid, req.user.id);
    const { g, m } = requireMember(gid, req.user.id);
    if (g.type === 'trend' && !canPostTrend(req.user.id)) throw forbidden('Chỉ admin, mod và người dùng từ cấp Tím Mộng Mơ mới được đăng trong Đẩy trend');
    if (g.type === 'trend' && duplicateTrendLink(src.body)) throw new HttpError(409, `Link này đã có trong Đẩy trend. Link chỉ tồn tại ${TREND_LINK_HOURS} giờ, hết hạn mới gửi lại được.`);
    if (PUBLIC_TYPES.includes(g.type) && !m.rules_ack) throw forbidden('Bạn cần xác nhận đã đọc quy tắc cộng đồng trước khi chat');
    if (m.mod_muted_until && m.mod_muted_until > now()) throw forbidden('Bạn đang bị tắt tiếng trong nhóm này');
    if (g.type === 'dm') {
      const peer = memberIds(gid).find((x) => x !== req.user.id);
      if (!peer || !areFriends(req.user.id, peer) || isBlockedEither(req.user.id, peer)) throw forbidden('Không thể nhắn tin cho người này');
    }
    // tin gốc đã là tin chuyển tiếp thì giữ nguồn gốc ban đầu
    const fwd = src.fwd || JSON.stringify({ name: publicUser(getUser(src.user_id)).displayName, group: sg.type === 'dm' || sg.type === 'private' ? null : sg.name });
    const r = db
      .prepare('INSERT INTO messages (group_id, user_id, body, image_url, images, preview, fwd, fwd_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(gid, req.user.id, src.body, src.image_url, src.images, src.preview, fwd, src.fwd_id || src.id, now());
    const dto = messageDto(db.prepare('SELECT * FROM messages WHERE id = ?').get(r.lastInsertRowid), req.user.id);
    db.prepare('UPDATE members SET last_read_id = ? WHERE group_id = ? AND user_id = ?').run(dto.id, gid, req.user.id);
    hub.sendMany(memberIds(gid), { type: 'message', message: dto });
    res.status(201).json({ message: dto, groupId: gid });
  })
);

// Thả tim màu tím: bật/tắt, mỗi người 1 tim cho mỗi tin; không tự thả tim tin của mình
api.post(
  '/messages/:id/heart',
  wrap((req, res) => {
    rateLimit(`heart:${req.user.id}`, 60, 60_000);
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(int(req.params.id));
    if (!msg || msg.deleted) throw notFound('Tin nhắn không tồn tại');
    autoJoinTopic(msg.group_id, req.user.id);
    if (getGroup(msg.group_id)?.type !== 'hot') requireMember(msg.group_id, req.user.id);
    // tin chuyển tiếp: thả tim vào tin gốc
    const root = msg.fwd_id ? db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.fwd_id) : msg;
    if (!root || root.deleted) throw notFound('Tin nhắn gốc không còn');
    if (msg.user_id === req.user.id || root.user_id === req.user.id) throw bad('Bạn không thể thả tim tin nhắn của mình');
    const had = db.prepare('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ?').get(root.id, req.user.id);
    if (had) db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ?').run(root.id, req.user.id);
    else db.prepare('INSERT INTO reactions (message_id, user_id, created_at) VALUES (?,?,?)').run(root.id, req.user.id, now());
    const hearts = db.prepare('SELECT COUNT(*) c FROM reactions WHERE message_id = ?').get(root.id).c;
    // báo cho mọi nhóm đang hiển thị tin gốc hoặc bản chuyển tiếp của nó
    for (const t of db.prepare('SELECT id, group_id FROM messages WHERE (id = ? OR fwd_id = ?) AND deleted = 0').all(root.id, root.id)) {
      hub.sendMany(memberIds(t.group_id), { type: 'heart', groupId: t.group_id, messageId: t.id, hearts });
    }
    if (!had) onHeart(req.user.id, root.user_id, root.id);
    if (!had && [1, 5, 10, 25, 50, 100].includes(hearts)) {
      notify(root.user_id, 'heart', hearts === 1 ? `${req.user.display_name} đã thả tim tin nhắn của bạn` : `Tin nhắn của bạn đã nhận được ${hearts} tim`, { url: `/#/chat/${root.group_id}`, tag: `heart-${root.id}` });
    }
    res.json({ hearts, hearted: !had });
  })
);

// Chủ đề nóng: 38 tin nhắn nhận được nhiều tim nhất trong 24 giờ qua, ở các group công khai
const HOT_LIMIT = 38; // tối đa 38 tin
const hotMinHearts = () => Number(process.env.HOT_MIN_HEARTS || 38); // chỉ tin đạt ít nhất 38 tim (trong 24 giờ qua) mới vào Chủ đề nóng
// Chống trùng: cùng một liên kết (bỏ phần query/#) hoặc cùng nội dung chữ thì chỉ giữ tin nhiều tim nhất (đã xếp trước)
function hotKey(m) {
  const u = firstUrl(m.body || '');
  if (u) { try { const x = new URL(u); return 'u:' + x.hostname.replace(/^(www|m|mobile)\./, '').toLowerCase() + x.pathname.replace(/\/+$/, '').toLowerCase(); } catch { /* bỏ qua */ } }
  const t = (m.body || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (t.length >= 8) return 't:' + t;
  if (m.image_url) return 'i:' + m.image_url;
  return 'm:' + m.id;
}
function dedupeHot() {
  const seen = new Set();
  return (m) => { const k = hotKey(m); if (seen.has(k)) return false; seen.add(k); return true; };
}
// Bài do Admin đăng thẳng lên Chủ đề nóng (giống Đẩy trend: chỉ admin đăng, mọi người đọc và thả tim)
const HOT_POSTS_SHOWN = 10;
const hotPosts = () => db.prepare('SELECT * FROM messages WHERE group_id = ? AND deleted = 0 ORDER BY id DESC LIMIT ?').all(hotGroupId(), HOT_POSTS_SHOWN);
api.post('/hot/posts', adminOnly, wrap((req, res) => {
  rateLimit(`hotpost:${req.user.id}`, 20, 60_000);
  const body = str(req.body.body, 2000);
  const imageUrl = req.body.imageUrl ? checkUploadUrl(req.body.imageUrl) : null;
  if (!body && !imageUrl) throw bad('Bài đăng trống');
  const r = db.prepare('INSERT INTO messages (group_id, user_id, body, image_url, created_at) VALUES (?,?,?,?,?)').run(hotGroupId(), req.user.id, body, imageUrl, now());
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json({ post: { ...messageDto(m, req.user.id), groupName: 'Chủ đề nóng' } });
  const link = firstUrl(body);
  if (link) buildPreview(link, UPLOAD_DIR).then((p) => { if (p) db.prepare('UPDATE messages SET preview = ? WHERE id = ?').run(JSON.stringify(p), m.id); }).catch(() => {});
}));

// Tương tác trong 24 giờ qua = tim + bình luận + trả lời; cần ít nhất ngưỡng (mặc định 38) mới vào Chủ đề nóng / Tổng hợp
function hotCore(viewerId, scope) {
  const types = scope ? [scope] : ['trend', 'country', 'region', 'province', 'topic'];
  const since = now() - DAY;
  return db
    .prepare(
      `SELECT * FROM (
         SELECT m.*,
           (SELECT COUNT(*) FROM reactions r WHERE r.message_id = m.id AND r.created_at > @since) AS hc,
           (SELECT COUNT(*) FROM comments c WHERE c.kind = 'msg' AND c.target_id = m.id AND c.created_at > @since) AS cc,
           (SELECT COUNT(*) FROM messages x WHERE x.reply_to = m.id AND x.deleted = 0 AND x.created_at > @since) AS rc
         FROM messages m JOIN groups g ON g.id = m.group_id
         WHERE g.type IN (${types.map((t) => `'${t}'`).join(',')}) AND m.deleted = 0 AND m.fwd_id IS NULL AND m.fwd IS NULL
       ) WHERE hc + cc + rc >= @min ORDER BY hc + cc + rc DESC, id DESC LIMIT @lim`
    )
    .all({ since, min: hotMinHearts(), lim: HOT_LIMIT * 4 }) // lấy dư để còn lọc tin của người bị chặn và tin trùng
    .map((m) => ({ ...m, score: m.hc + m.cc + m.rc }))
    .filter((m) => !viewerId || !isBlockedEither(viewerId, m.user_id))
    .filter(dedupeHot())
    .slice(0, HOT_LIMIT);
}
async function hotRows(viewerId, scope, backfill = true) {
    const rows = hotCore(viewerId, scope);
    // tin cũ chưa có xem trước: lấy bù một lần (lưu '0' nếu không có để khỏi thử lại)
    if (backfill) await Promise.all(
      rows.filter((m) => m.preview == null && firstUrl(m.body)).slice(0, 10).map(async (m) => {
        const p = await buildPreview(firstUrl(m.body), UPLOAD_DIR).catch(() => null);
        m.preview = p ? JSON.stringify(p) : '0';
        db.prepare('UPDATE messages SET preview = ? WHERE id = ?').run(m.preview, m.id);
      })
    );
    return rows;
}
api.get(
  '/hot',
  wrap(async (req, res) => {
    const scope = ['country', 'region', 'province'].includes(req.query.scope) ? req.query.scope : null;
    const rows = await hotRows(req.user.id, scope);
    res.json({
      pinned: hotPosts().map((m) => ({ ...messageDto(m, req.user.id), groupName: 'Chủ đề nóng' })),
      items: rows.map((m) => ({ ...messageDto(m, req.user.id), hearts: m.hc, interactions: m.score, groupName: getGroup(m.group_id).name })),
    });
  })
);

// Xóa tin nhắn: admin hệ thống, mod (group công khai), admin (group riêng)
function canModerate(g, uid) {
  if (isSystemAdmin(uid)) return g.type !== 'private' && g.type !== 'dm';
  const m = getMember(g.id, uid);
  if (!m) return false;
  return (g.type !== 'private' && g.type !== 'dm' && m.role === 'mod') || (g.type === 'private' && m.role === 'admin');
}
const canKickMute = canModerate;

api.delete(
  '/messages/:id',
  wrap((req, res) => {
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(int(req.params.id));
    if (!msg) throw notFound();
    const g = getGroup(msg.group_id);
    const own = msg.user_id === req.user.id;
    if (!own && !canModerate(g, req.user.id)) throw forbidden();
    db.prepare('UPDATE messages SET deleted = 1 WHERE id = ?').run(msg.id);
    if (!own) {
      const reason = str(req.body?.reason, 300) || 'Vi phạm quy tắc cộng đồng';
      log(req.user.id, 'delete_message', { target: msg.user_id, group: g.id, message: msg.id, reason });
      notify(msg.user_id, 'moderation', `Tin nhắn của bạn trong "${g.name}" đã bị xóa. Lý do: ${reason}`);
    }
    hub.sendMany(memberIds(g.id), { type: 'message_deleted', groupId: g.id, messageId: msg.id });
    res.json({ ok: true });
  })
);

api.post(
  '/groups/:id/members/:uid/mute',
  wrap((req, res) => {
    const g = getGroup(int(req.params.id));
    const uid = int(req.params.uid);
    if (!g || !canKickMute(g, req.user.id)) throw forbidden();
    if (uid === req.user.id || !getMember(g.id, uid)) throw bad('Thành viên không hợp lệ');
    const minutes = Math.min(Math.max(int(req.body.minutes) || 60, 1), 60 * 24 * 30);
    const reason = str(req.body.reason, 300) || 'Vi phạm quy tắc cộng đồng';
    db.prepare('UPDATE members SET mod_muted_until = ? WHERE group_id = ? AND user_id = ?').run(now() + minutes * 60_000, g.id, uid);
    log(req.user.id, 'mute', { target: uid, group: g.id, reason });
    notify(uid, 'moderation', `Bạn bị tắt tiếng ${minutes} phút trong "${g.name}". Lý do: ${reason}`);
    res.json({ ok: true });
  })
);

api.post(
  '/groups/:id/members/:uid/kick',
  wrap((req, res) => {
    const g = getGroup(int(req.params.id));
    const uid = int(req.params.uid);
    if (!g || !canKickMute(g, req.user.id)) throw forbidden();
    if (uid === req.user.id || !getMember(g.id, uid)) throw bad('Thành viên không hợp lệ');
    if (g.type === 'private' && getMember(g.id, uid).role === 'admin') throw forbidden('Hãy gỡ quyền admin trước khi xóa');
    const reason = str(req.body.reason, 300) || 'Vi phạm quy tắc cộng đồng';
    removeMember(g.id, uid);
    if (g.type !== 'private') db.prepare('INSERT OR IGNORE INTO bans (group_id, user_id) VALUES (?,?)').run(g.id, uid);
    log(req.user.id, 'kick', { target: uid, group: g.id, reason });
    notify(uid, 'moderation', `Bạn đã bị xóa khỏi "${g.name}". Lý do: ${reason}`);
    res.json({ ok: true });
  })
);

// ============================================================================
// Bạn bè, chặn, nhắn tin 1-1
// ============================================================================
api.get(
  '/users/:id',
  wrap((req, res) => {
    const id = int(req.params.id);
    const u = getUser(id);
    if (!u || (id !== req.user.id && isBlockedEither(req.user.id, id))) throw notFound('Không tìm thấy người dùng');
    const pending = db.prepare("SELECT * FROM friend_requests WHERE status='pending' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))").get(req.user.id, id, id, req.user.id);
    res.json({
      user: publicUser(u, req.user.id),
      relation: id === req.user.id ? 'self' : areFriends(req.user.id, id) ? 'friend' : pending ? (pending.from_id === req.user.id ? 'sent' : 'received') : 'none',
      requestId: pending?.id,
    });
  })
);

api.get(
  '/friends',
  wrap((req, res) => {
    const me = req.user.id;
    const friends = db.prepare('SELECT a, b FROM friends WHERE a = ? OR b = ?').all(me, me)
      .map((r) => (r.a === me ? r.b : r.a))
      .map((id) => publicUser(getUser(id), me))
      .sort((x, y) => x.displayName.localeCompare(y.displayName, 'vi'));
    const incoming = db.prepare("SELECT * FROM friend_requests WHERE to_id = ? AND status = 'pending' ORDER BY id DESC").all(me)
      .map((r) => ({ id: r.id, user: publicUser(getUser(r.from_id)), createdAt: r.created_at }));
    const outgoing = db.prepare("SELECT * FROM friend_requests WHERE from_id = ? AND status = 'pending' ORDER BY id DESC").all(me)
      .map((r) => ({ id: r.id, user: publicUser(getUser(r.to_id)), createdAt: r.created_at }));
    const blocked = db.prepare('SELECT blocked FROM blocks WHERE blocker = ?').all(me).map((r) => publicUser(getUser(r.blocked)));
    res.json({ friends, incoming, outgoing, blocked });
  })
);

api.post(
  '/friends/request',
  wrap((req, res) => {
    rateLimit(`fr:${req.user.id}`, 30, 3600_000);
    const me = req.user.id;
    const to = int(req.body.userId);
    const t = getUser(to);
    const generic = () => new HttpError(400, 'Không thể gửi lời mời kết bạn cho người này');
    if (!t || t.status !== 'active' || to === me || isBlockedEither(me, to)) throw generic();
    if (t.role === 'admin' || req.user.role === 'admin') throw bad('Không thể kết bạn với admin hệ thống');
    if (areFriends(me, to)) throw bad('Hai bạn đã là bạn bè');
    if (t.friend_policy === 'none') throw generic();
    if (t.friend_policy === 'shared' && !shareGroup(me, to)) throw generic();
    const dup = db.prepare("SELECT 1 FROM friend_requests WHERE status='pending' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))").get(me, to, to, me);
    if (dup) throw bad('Đã có lời mời đang chờ');
    db.prepare('INSERT INTO friend_requests (from_id, to_id, created_at) VALUES (?,?,?)').run(me, to, now());
    notify(to, 'friend_request', `${req.user.display_name} muốn kết bạn với bạn`);
    res.status(201).json({ ok: true });
  })
);

function answerRequest(accept) {
  return wrap((req, res) => {
    const r = db.prepare("SELECT * FROM friend_requests WHERE id = ? AND to_id = ? AND status = 'pending'").get(int(req.params.id), req.user.id);
    if (!r) throw notFound('Lời mời không còn tồn tại');
    db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run(accept ? 'accepted' : 'declined', r.id);
    if (accept) {
      if (isBlockedEither(r.from_id, r.to_id)) throw forbidden();
      const [a, b] = pair(r.from_id, r.to_id);
      db.prepare('INSERT OR IGNORE INTO friends (a, b, created_at) VALUES (?,?,?)').run(a, b, now());
      notify(r.from_id, 'friend_accept', `${req.user.display_name} đã chấp nhận lời mời kết bạn`);
    }
    res.json({ ok: true });
  });
}
api.post('/friends/requests/:id/accept', answerRequest(true));
api.post('/friends/requests/:id/decline', answerRequest(false));
api.delete('/friends/requests/:id', wrap((req, res) => { // hủy lời mời đã gửi
  db.prepare("DELETE FROM friend_requests WHERE id = ? AND from_id = ? AND status = 'pending'").run(int(req.params.id), req.user.id);
  res.json({ ok: true });
}));

api.delete('/friends/:uid', wrap((req, res) => {
  const [a, b] = pair(req.user.id, int(req.params.uid));
  db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').run(a, b);
  res.json({ ok: true });
}));

api.post('/blocks/:uid', wrap((req, res) => {
  const me = req.user.id, uid = int(req.params.uid);
  if (!getUser(uid) || uid === me) throw bad('Người dùng không hợp lệ');
  tx(() => {
    db.prepare('INSERT OR IGNORE INTO blocks (blocker, blocked) VALUES (?,?)').run(me, uid);
    const [a, b] = pair(me, uid);
    db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').run(a, b);
    db.prepare("DELETE FROM friend_requests WHERE status='pending' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))").run(me, uid, uid, me);
  });
  res.json({ ok: true }); // người bị chặn không được thông báo
}));
api.delete('/blocks/:uid', wrap((req, res) => {
  db.prepare('DELETE FROM blocks WHERE blocker = ? AND blocked = ?').run(req.user.id, int(req.params.uid));
  res.json({ ok: true });
}));

// Mở (hoặc tạo) cuộc trò chuyện 1-1 với bạn bè
api.post('/dm/:uid', wrap((req, res) => {
  const me = req.user.id, uid = int(req.params.uid);
  if (!getUser(uid) || !areFriends(me, uid) || isBlockedEither(me, uid)) throw forbidden('Chỉ nhắn tin riêng được khi đã là bạn bè');
  const [a, b] = pair(me, uid);
  const key = `dm:${a}:${b}`;
  let g = db.prepare('SELECT * FROM groups WHERE key = ?').get(key);
  if (!g) {
    tx(() => {
      const r = db.prepare("INSERT INTO groups (type, key, name, created_at) VALUES ('dm',?,?,?)").run(key, 'DM', now());
      addMember(Number(r.lastInsertRowid), me);
      addMember(Number(r.lastInsertRowid), uid);
      db.prepare('UPDATE members SET rules_ack = 1 WHERE group_id = ?').run(Number(r.lastInsertRowid));
    });
    g = db.prepare('SELECT * FROM groups WHERE key = ?').get(key);
  }
  res.json({ group: groupDto(g, me, getMember(g.id, me)) });
}));

// ============================================================================
// Group riêng tư
// ============================================================================
const isPrivAdmin = (gid, uid) => getMember(gid, uid)?.role === 'admin';
function requirePrivAdmin(gid, uid) {
  const g = getGroup(gid);
  if (!g || g.type !== 'private') throw notFound('Không tìm thấy nhóm');
  if (!isPrivAdmin(gid, uid)) throw forbidden('Chỉ admin của nhóm mới làm được');
  return g;
}
// Ai được thêm thẳng vào nhóm riêng: bạn bè; Admin hệ thống thêm được bất kỳ ai (không cần kết bạn / chấp nhận).
// Luôn loại tài khoản không hoạt động và người đã chặn nhau.
// Admin hoặc người đạt cấp 5 (Tím Thủy Tổ): thêm ngay bất kỳ ai vào nhóm riêng, không cần kết bạn
const canAddAnyone = (uid) => isSystemAdmin(uid) || (getUser(uid)?.lvl || 0) >= 5;
const canAddToPrivate = (uid, id) => {
  if (id === uid || isBlockedEither(uid, id)) return false;
  if (canAddAnyone(uid)) return getUser(id)?.status === 'active';
  return areFriends(uid, id);
};
const memberCount = (gid) => db.prepare('SELECT COUNT(*) c FROM members WHERE group_id = ?').get(gid).c;
function assertRoom(g, extra) {
  if (memberCount(g.id) + extra > (g.member_limit || PRIVATE_LIMIT_DEFAULT)) throw bad('Nhóm đã đầy, không thể thêm thành viên');
}

// Tìm người để thêm vào nhóm riêng (Admin hoặc cấp 5): chỉ trả tên và ảnh đại diện, không lộ email
api.get('/people/search', wrap((req, res) => {
  if (!canAddAnyone(req.user.id)) throw forbidden('Cần đạt cấp Tím Thủy Tổ để tìm người dùng');
  rateLimit(`usearch:${req.user.id}`, 60, 60_000);
  const term = str(req.query.q, 60);
  if (term.length < 2) return res.json({ users: [] });
  const rows = db.prepare("SELECT * FROM users WHERE status = 'active' AND id != ? AND display_name LIKE ? ORDER BY display_name LIMIT 8").all(req.user.id, `%${term.replace(/[%_]/g, '')}%`);
  res.json({ users: rows.filter((u) => !isBlockedEither(req.user.id, u.id)).map((u) => ({ id: u.id, displayName: u.display_name, avatarColor: u.avatar_color, avatarUrl: u.avatar_url, status: u.status })) });
}));
api.post('/private', wrap((req, res) => {
  rateLimit(`pg:${req.user.id}`, 10, 3600_000);
  const name = str(req.body.name, 50);
  if (name.length < 2) throw bad('Tên nhóm cần ít nhất 2 ký tự');
  const avatar = req.body.avatarUrl ? checkUploadUrl(req.body.avatarUrl) : null;
  const ids = [...new Set((req.body.memberIds || []).map(int))].filter((id) => canAddToPrivate(req.user.id, id));
  const gid = tx(() => {
    const r = db.prepare("INSERT INTO groups (type, name, avatar_url, member_limit, created_by, created_at) VALUES ('private',?,?,?,?,?)").run(name, avatar, PRIVATE_LIMIT_DEFAULT, req.user.id, now());
    const gid = Number(r.lastInsertRowid);
    addMember(gid, req.user.id, 'admin'); // người tạo tự thành admin
    for (const id of ids) addMember(gid, id);
    db.prepare('UPDATE members SET rules_ack = 1 WHERE group_id = ?').run(gid);
    return gid;
  });
  for (const id of ids) notify(id, 'group_invite', `${req.user.display_name} đã thêm bạn vào nhóm "${name}"`);
  res.status(201).json({ group: groupDto(getGroup(gid), req.user.id, getMember(gid, req.user.id)) });
}));

api.patch('/private/:id', wrap((req, res) => {
  const g = requirePrivAdmin(int(req.params.id), req.user.id);
  if (req.body.name !== undefined) {
    const name = str(req.body.name, 50);
    if (name.length < 2) throw bad('Tên nhóm cần ít nhất 2 ký tự');
    db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(name, g.id);
  }
  if (req.body.avatarUrl !== undefined) db.prepare('UPDATE groups SET avatar_url = ? WHERE id = ?').run(req.body.avatarUrl ? checkUploadUrl(req.body.avatarUrl) : null, g.id);
  if (req.body.memberLimit !== undefined) {
    const lim = int(req.body.memberLimit);
    if (!(lim >= 2 && lim <= PRIVATE_LIMIT_MAX)) throw bad(`Giới hạn phải từ 2 đến ${PRIVATE_LIMIT_MAX}`);
    if (lim < memberCount(g.id)) throw bad('Giới hạn nhỏ hơn số thành viên hiện tại');
    db.prepare('UPDATE groups SET member_limit = ? WHERE id = ?').run(lim, g.id);
  }
  res.json({ group: groupDto(getGroup(g.id), req.user.id, getMember(g.id, req.user.id)) });
}));

// Mời bạn bè (Admin hệ thống: bất kỳ ai) → vào nhóm ngay, không cần chấp nhận
api.post('/private/:id/invite', wrap((req, res) => {
  const g = requirePrivAdmin(int(req.params.id), req.user.id);
  const ids = [...new Set((req.body.userIds || []).map(int))].filter((id) => canAddToPrivate(req.user.id, id) && !getMember(g.id, id));
  if (!ids.length) throw bad(canAddAnyone(req.user.id) ? 'Không có người dùng hợp lệ để thêm' : 'Không có bạn bè hợp lệ để mời');
  assertRoom(g, ids.length);
  for (const id of ids) {
    addMember(g.id, id);
    db.prepare('UPDATE members SET rules_ack = 1 WHERE group_id = ? AND user_id = ?').run(g.id, id);
    notify(id, 'group_invite', `${req.user.display_name} đã thêm bạn vào nhóm "${g.name}"`);
  }
  res.json({ added: ids.length });
}));

api.get('/private/:id/links', wrap((req, res) => {
  const g = requirePrivAdmin(int(req.params.id), req.user.id);
  res.json({ links: db.prepare('SELECT code, expires_at, revoked FROM invites WHERE group_id = ? AND revoked = 0 AND expires_at > ? ORDER BY expires_at DESC').all(g.id, now()) });
}));
api.post('/private/:id/links', wrap((req, res) => {
  const g = requirePrivAdmin(int(req.params.id), req.user.id);
  const hours = Math.min(Math.max(int(req.body.hours) || 24, 1), 24 * 30);
  const code = randomToken(9);
  db.prepare('INSERT INTO invites (code, group_id, created_by, expires_at) VALUES (?,?,?,?)').run(code, g.id, req.user.id, now() + hours * 3600_000);
  res.status(201).json({ code, expiresAt: now() + hours * 3600_000 });
}));
api.delete('/private/links/:code', wrap((req, res) => {
  const inv = db.prepare('SELECT * FROM invites WHERE code = ?').get(str(req.params.code, 40));
  if (!inv) throw notFound();
  requirePrivAdmin(inv.group_id, req.user.id);
  db.prepare('UPDATE invites SET revoked = 1 WHERE code = ?').run(inv.code);
  res.json({ ok: true });
}));

function validInvite(code) {
  const inv = db.prepare('SELECT * FROM invites WHERE code = ?').get(str(code, 40));
  if (!inv || inv.revoked || inv.expires_at < now()) throw new HttpError(410, 'Liên kết mời đã hết hạn hoặc bị thu hồi');
  const g = getGroup(inv.group_id);
  if (!g) throw new HttpError(410, 'Nhóm không còn tồn tại');
  return { inv, g };
}
api.get('/invite/:code', wrap((req, res) => {
  const { g } = validInvite(req.params.code);
  res.json({ group: { id: g.id, name: g.name, memberCount: memberCount(g.id), joined: !!getMember(g.id, req.user.id) } });
}));
// Vào bằng link: phải chờ admin duyệt
api.post('/invite/:code/join', wrap((req, res) => {
  const { g } = validInvite(req.params.code);
  if (getMember(g.id, req.user.id)) throw bad('Bạn đã ở trong nhóm này');
  if (db.prepare("SELECT 1 FROM join_requests WHERE group_id = ? AND user_id = ? AND status = 'pending'").get(g.id, req.user.id)) throw bad('Yêu cầu của bạn đang chờ duyệt');
  db.prepare('INSERT INTO join_requests (group_id, user_id, created_at) VALUES (?,?,?)').run(g.id, req.user.id, now());
  for (const r of db.prepare("SELECT user_id FROM members WHERE group_id = ? AND role = 'admin'").all(g.id))
    notify(r.user_id, 'join_request', `${req.user.display_name} xin vào nhóm "${g.name}"`);
  res.status(201).json({ pending: true });
}));

api.get('/private/requests', wrap((req, res) => {
  const rows = db.prepare(
    `SELECT jr.*, g.name AS gname FROM join_requests jr JOIN groups g ON g.id = jr.group_id
     WHERE jr.status = 'pending' AND jr.group_id IN (SELECT group_id FROM members WHERE user_id = ? AND role = 'admin') ORDER BY jr.id DESC`
  ).all(req.user.id);
  res.json({ requests: rows.map((r) => ({ id: r.id, groupId: r.group_id, groupName: r.gname, user: publicUser(getUser(r.user_id)) })) });
}));
function answerJoin(approve) {
  return wrap((req, res) => {
    const r = db.prepare("SELECT * FROM join_requests WHERE id = ? AND status = 'pending'").get(int(req.params.id));
    if (!r) throw notFound('Yêu cầu không còn tồn tại');
    const g = requirePrivAdmin(r.group_id, req.user.id);
    if (approve) {
      assertRoom(g, 1);
      addMember(g.id, r.user_id);
      db.prepare('UPDATE members SET rules_ack = 1 WHERE group_id = ? AND user_id = ?').run(g.id, r.user_id);
      notify(r.user_id, 'join_approved', `Bạn đã được duyệt vào nhóm "${g.name}"`);
    }
    db.prepare('UPDATE join_requests SET status = ? WHERE id = ?').run(approve ? 'approved' : 'rejected', r.id);
    res.json({ ok: true });
  });
}
api.post('/private/requests/:id/approve', answerJoin(true));
api.post('/private/requests/:id/reject', answerJoin(false));

api.post('/private/:id/admins/:uid', wrap((req, res) => {
  const g = requirePrivAdmin(int(req.params.id), req.user.id);
  if (!getMember(g.id, int(req.params.uid))) throw bad('Người này không ở trong nhóm');
  db.prepare("UPDATE members SET role='admin' WHERE group_id=? AND user_id=?").run(g.id, int(req.params.uid));
  res.json({ ok: true });
}));
api.delete('/private/:id/admins/:uid', wrap((req, res) => {
  const g = requirePrivAdmin(int(req.params.id), req.user.id);
  const admins = db.prepare("SELECT COUNT(*) c FROM members WHERE group_id=? AND role='admin'").get(g.id).c;
  if (admins <= 1) throw bad('Nhóm cần ít nhất 1 admin');
  db.prepare("UPDATE members SET role='member' WHERE group_id=? AND user_id=?").run(g.id, int(req.params.uid));
  res.json({ ok: true });
}));

function leavePrivate(g, uid, res) {
  const m = getMember(g.id, uid);
  const others = memberCount(g.id) - 1;
  const otherAdmins = db.prepare("SELECT COUNT(*) c FROM members WHERE group_id=? AND role='admin' AND user_id != ?").get(g.id, uid).c;
  if (m.role === 'admin' && others > 0 && otherAdmins === 0) throw bad('Bạn là admin cuối cùng. Hãy chuyển quyền admin cho người khác trước khi rời.');
  removeMember(g.id, uid);
  if (others === 0) db.prepare('DELETE FROM groups WHERE id = ?').run(g.id);
  res.json({ ok: true });
}
api.delete('/private/:id', wrap((req, res) => {
  const g = requirePrivAdmin(int(req.params.id), req.user.id);
  const ids = memberIds(g.id);
  db.prepare('DELETE FROM groups WHERE id = ?').run(g.id); // giải tán
  for (const id of ids) if (id !== req.user.id) notify(id, 'group_dissolved', `Nhóm "${g.name}" đã được giải tán`);
  res.json({ ok: true });
}));

// ============================================================================
// Report & kiểm duyệt
// ============================================================================
api.post(
  '/reports',
  wrap((req, res) => {
    rateLimit(`rep:${req.user.id}`, 20, 3600_000);
    const reason = str(req.body.reason, 500);
    if (reason.length < 3) throw bad('Vui lòng nêu lý do');
    let targetId, g = null, snapshot = {}, msgId = null;
    if (req.body.messageId) {
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(int(req.body.messageId));
      if (!msg || msg.deleted) throw notFound('Tin nhắn không tồn tại');
      g = getGroup(msg.group_id);
      if (!getMember(g.id, req.user.id) && g.type !== 'topic') throw forbidden(); // chủ đề: ai cũng đọc nên ai cũng báo cáo được
      targetId = msg.user_id;
      msgId = msg.id;
      snapshot = { body: msg.body, image: msg.image_url };
    } else {
      targetId = int(req.body.userId);
      if (!getUser(targetId)) throw notFound('Người dùng không tồn tại');
      if (req.body.groupId) {
        g = getGroup(int(req.body.groupId));
        if (g && !getMember(g.id, req.user.id)) g = null;
      }
    }
    if (targetId === req.user.id) throw bad('Bạn không thể tự báo cáo mình');
    const r = db.prepare(
      `INSERT INTO reports (reporter_id, target_user_id, message_id, group_id, group_type, snapshot_body, snapshot_image, reason, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(req.user.id, targetId, msgId, g?.id ?? null, g?.type ?? 'dm', snapshot.body ?? null, snapshot.image ?? null, reason, now());
    // Người bị report không được biết ai report: không có thông báo cho họ.
    // Admin/mod nhận thông báo realtime.
    const handlers = new Set(db.prepare("SELECT id FROM users WHERE role='admin' AND status='active'").all().map((x) => x.id));
    if (g && g.type !== 'dm') {
      const role = g.type === 'private' ? 'admin' : 'mod';
      for (const x of db.prepare('SELECT user_id FROM members WHERE group_id = ? AND role = ?').all(g.id, role)) handlers.add(x.user_id);
    }
    handlers.delete(req.user.id);
    for (const h of handlers) hub.send(h, { type: 'report_new', id: Number(r.lastInsertRowid) });
    res.status(201).json({ ok: true });
  })
);

function reportDto(r, viewerIsAdmin) {
  const target = getUser(r.target_user_id);
  return {
    id: r.id, groupId: r.group_id, groupType: r.group_type,
    groupName: r.group_id ? getGroup(r.group_id)?.name : null,
    messageId: r.message_id, snapshotBody: r.snapshot_body, snapshotImage: r.snapshot_image,
    reason: r.reason, status: r.status, resolution: r.resolution, note: r.note, createdAt: r.created_at,
    target: publicUser(target), targetStatus: target?.status,
    reporter: viewerIsAdmin ? publicUser(getUser(r.reporter_id)) : undefined, // mod không thấy người báo cáo
  };
}

// Hàng chờ: admin hệ thống thấy tất cả; mod/admin group chỉ thấy report trong group của mình
api.get('/reports', wrap((req, res) => {
  const admin = req.user.role === 'admin';
  const status = req.query.status === 'resolved' ? 'resolved' : 'open';
  const rows = admin
    ? db.prepare('SELECT * FROM reports WHERE status = ? ORDER BY id DESC LIMIT 200').all(status)
    : db.prepare(
        `SELECT r.* FROM reports r JOIN members m ON m.group_id = r.group_id AND m.user_id = ?
         WHERE r.status = ? AND ((r.group_type IN ('country','region','province','topic') AND m.role='mod') OR (r.group_type='private' AND m.role='admin'))
         ORDER BY r.id DESC LIMIT 200`
      ).all(req.user.id, status);
  res.json({ reports: rows.map((r) => reportDto(r, admin)) });
}));

const ACTIONS_GROUP = ['dismiss', 'delete_message', 'mute', 'kick'];
const ACTIONS_ADMIN = [...ACTIONS_GROUP, 'warn', 'lock_temp', 'lock_perm'];

api.post(
  '/reports/:id/resolve',
  wrap((req, res) => {
    const r = db.prepare("SELECT * FROM reports WHERE id = ? AND status = 'open'").get(int(req.params.id));
    if (!r) throw notFound('Report không còn tồn tại');
    const g = r.group_id ? getGroup(r.group_id) : null;
    const admin = req.user.role === 'admin';
    const groupHandler = g && g.type !== 'dm' && (g.type === 'private' ? isPrivAdmin(g.id, req.user.id) : getMember(g.id, req.user.id)?.role === 'mod');
    if (!admin && !groupHandler) throw forbidden();
    const action = req.body.action;
    if (!(admin ? ACTIONS_ADMIN : ACTIONS_GROUP).includes(action)) throw bad('Hành động không hợp lệ');
    const note = str(req.body.note, 300) || 'Vi phạm quy tắc cộng đồng';
    const target = r.target_user_id;

    tx(() => {
      if (action === 'delete_message' && r.message_id) {
        db.prepare('UPDATE messages SET deleted = 1 WHERE id = ?').run(r.message_id);
        hub.sendMany(memberIds(r.group_id), { type: 'message_deleted', groupId: r.group_id, messageId: r.message_id });
        log(req.user.id, 'delete_message', { target, group: r.group_id, message: r.message_id, reason: note });
        notify(target, 'moderation', `Tin nhắn của bạn đã bị xóa. Lý do: ${note}`);
      }
      if (action === 'mute' && g && getMember(g.id, target)) {
        db.prepare('UPDATE members SET mod_muted_until = ? WHERE group_id = ? AND user_id = ?').run(now() + 24 * 3600_000, g.id, target);
        log(req.user.id, 'mute', { target, group: g.id, reason: note });
        notify(target, 'moderation', `Bạn bị tắt tiếng 24 giờ trong "${g.name}". Lý do: ${note}`);
      }
      if (action === 'kick' && g && getMember(g.id, target)) {
        removeMember(g.id, target);
        if (g.type !== 'private') db.prepare('INSERT OR IGNORE INTO bans (group_id, user_id) VALUES (?,?)').run(g.id, target);
        log(req.user.id, 'kick', { target, group: g.id, reason: note });
        notify(target, 'moderation', `Bạn đã bị xóa khỏi "${g.name}". Lý do: ${note}`);
      }
      if (action === 'warn') {
        log(req.user.id, 'warn', { target, reason: note });
        notify(target, 'moderation', `Cảnh cáo từ quản trị viên: ${note}`);
      }
      if (action === 'lock_temp' || action === 'lock_perm') lockUser(req.user.id, target, action === 'lock_temp' ? Math.min(int(req.body.days) || 7, 365) : null, note);
      db.prepare("UPDATE reports SET status='resolved', resolution=?, note=?, handled_by=?, handled_at=? WHERE id=?").run(action, note, req.user.id, now(), r.id);
    });
    notify(r.reporter_id, 'report_done', 'Báo cáo của bạn đã được xử lý. Cảm ơn bạn đã giúp giữ cộng đồng lành mạnh.');
    res.json({ ok: true });
  })
);

function lockUser(actor, uid, days, reason) {
  const t = getUser(uid);
  const sup = isSuper(actor);
  if (!t || (t.role === 'admin' && (!sup || t.is_super))) throw forbidden('Không thể khóa tài khoản này');
  if (!days && !sup) throw forbidden('Chỉ Admin hệ thống mới được khóa vĩnh viễn');
  db.prepare("UPDATE users SET status='locked', locked_until=? WHERE id=?").run(days ? now() + days * DAY : null, uid);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
  hub.send(uid, { type: 'locked' });
  log(actor, days ? 'lock_temp' : 'lock_perm', { target: uid, reason });
}

// ============================================================================
// Thông báo
// ============================================================================
api.get('/notifications', wrap((req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  res.json({
    notifications: rows.map((n) => ({ id: n.id, type: n.type, text: n.text, read: !!n.read, createdAt: n.created_at })),
    unread: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).c,
  });
}));
api.post('/notifications/read', wrap((req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
}));

// ============================================================================
// Bản tin
// ============================================================================
// Tim cho bản tin (bảng riêng, không tính vào Chủ đề nóng)
db.exec('CREATE TABLE IF NOT EXISTS news_hearts (news_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (news_id, user_id))');
const newsHearts = (id) => db.prepare('SELECT COUNT(*) c FROM news_hearts WHERE news_id = ?').get(id).c;
// tên ngắn của bản tin cho thông báo (tiêu đề / nội dung / ảnh đều có thể trống)
const newsLabel = (n) => n.title || (n.body ? n.body.replace(/\s+/g, ' ').slice(0, 80) : 'có ảnh mới');
const NEWS_MAX_IMAGES = 4;
const newsImgs = (n) => { try { if (n.images) return JSON.parse(n.images); } catch { /* dùng cột cũ */ } return n.image_url ? [n.image_url] : []; };
function cleanNewsImages(list) {
  if (!Array.isArray(list)) throw bad('Danh sách ảnh không hợp lệ');
  const urls = [...new Set(list.map((u) => checkUploadUrl(u)))];
  if (urls.length > NEWS_MAX_IMAGES) throw bad(`Mỗi bản tin tối đa ${NEWS_MAX_IMAGES} ảnh`);
  return urls;
}
const newsDto = (n, uid) => ({
  commentCount: db.prepare("SELECT COUNT(*) c FROM comments WHERE kind = 'news' AND target_id = ?").get(n.id).c,
  imageUrls: newsImgs(n),
  hearts: newsHearts(n.id), hearted: !!db.prepare('SELECT 1 FROM news_hearts WHERE news_id = ? AND user_id = ?').get(n.id, uid),
  author: (() => { const a = getUser(n.author_id); return a && a.role !== 'admin' ? { id: a.id, displayName: publicUser(a).displayName, level: publicUser(a).level } : null; })(),
  mine: n.author_id === uid,
  id: n.id, title: n.title, body: n.body, imageUrl: newsImgs(n)[0] || null, pinned: !!n.pinned, edited: !!n.edited,
  createdAt: n.created_at, read: !!db.prepare('SELECT 1 FROM news_reads WHERE user_id=? AND news_id=?').get(uid, n.id),
});

// ---- thông báo đẩy ngoài app ----------------------------------------------------
api.get('/push/config', wrap((req, res) => {
  res.json({ publicKey: vapidPublicKey, subscribed: hasSubscription(req.user.id), prefs: getPrefs(req.user.id) });
}));
api.post('/push/subscribe', wrap((req, res) => {
  rateLimit(`push:${req.user.id}`, 20, 60_000);
  if (!saveSubscription(req.user.id, req.body.subscription, req.get('user-agent'))) throw bad('Đăng ký thông báo không hợp lệ');
  recompute(req.user.id);
  res.json({ ok: true, prefs: getPrefs(req.user.id) });
}));
api.post('/push/unsubscribe', wrap((req, res) => {
  removeSubscription(req.user.id, req.body.endpoint);
  res.json({ ok: true, subscribed: hasSubscription(req.user.id) });
}));
api.patch('/push/prefs', wrap((req, res) => {
  res.json({ prefs: setPrefs(req.user.id, req.body) });
}));

api.get('/news', wrap((req, res) => {
  const rows = db.prepare('SELECT * FROM news ORDER BY pinned DESC, id DESC LIMIT 100').all();
  const items = rows.map((n) => newsDto(n, req.user.id));
  res.json({ news: items, unread: items.filter((n) => !n.read).length });
}));
api.post('/news/read-all', wrap((req, res) => {
  db.prepare('INSERT OR IGNORE INTO news_reads (user_id, news_id) SELECT ?, id FROM news').run(req.user.id);
  res.json({ ok: true });
}));
api.post('/news/:id/read', wrap((req, res) => {
  db.prepare('INSERT OR IGNORE INTO news_reads (user_id, news_id) VALUES (?,?)').run(req.user.id, int(req.params.id));
  res.json({ ok: true });
}));

api.post('/admin/news', adminOnly, wrap((req, res) => {
  const title = str(req.body.title, 150), body = str(req.body.body, 5000);
  const imgs = req.body.imageUrls !== undefined ? cleanNewsImages(req.body.imageUrls) : req.body.imageUrl ? cleanNewsImages([req.body.imageUrl]) : [];
  if (!title && !body && !imgs.length) throw bad('Hãy nhập tiêu đề, nội dung hoặc chọn ảnh'); // tiêu đề và nội dung đều không bắt buộc
  const pinned = req.body.pinned ? 1 : 0;
  const r = db.prepare('INSERT INTO news (title, body, image_url, images, pinned, author_id, created_at) VALUES (?,?,?,?,?,?,?)').run(title, body, imgs[0] || null, JSON.stringify(imgs), pinned, req.user.id, now());
  const n = db.prepare('SELECT * FROM news WHERE id = ?').get(r.lastInsertRowid);
  onNewsPost(req.user.id, n.id);
  const recipients = db.prepare("SELECT id FROM users WHERE status='active' AND news_push=1 AND verified=1").all();
  for (const u of recipients) {
    hub.send(u.id, { type: 'news', news: { id: n.id, title: newsLabel(n) } });
    if (u.id !== req.user.id) pushOnly(u.id, 'news', { body: `Bản tin mới: ${newsLabel(n)}`, url: '/#/news', tag: `news-${n.id}` });
  }
  hub.sendMany(db.prepare("SELECT id FROM users WHERE status='active' AND news_push=0").all().map((u) => u.id), { type: 'news_silent' });
  res.status(201).json({ news: newsDto(n, req.user.id) });
}));
// Từ cấp 4 (Tím Thủy Chung) được đăng bài lên Bản tin; bài của thành viên không đẩy thông báo tới mọi người
api.post('/news', wrap((req, res) => {
  if (!isSystemAdmin(req.user.id) && (req.user.lvl || 0) < 4) throw forbidden('Cần đạt cấp Tím Thủy Chung để đăng bản tin');
  rateLimit(`newspost:${req.user.id}`, 10, 3600_000);
  const title = str(req.body.title, 150), body = str(req.body.body, 5000);
  const imgs = req.body.imageUrls !== undefined ? cleanNewsImages(req.body.imageUrls) : [];
  if (!title && !body && !imgs.length) throw bad('Hãy nhập tiêu đề, nội dung hoặc chọn ảnh');
  const r = db.prepare('INSERT INTO news (title, body, image_url, images, pinned, author_id, created_at) VALUES (?,?,?,?,0,?,?)').run(title, body, imgs[0] || null, JSON.stringify(imgs), req.user.id, now());
  const n = db.prepare('SELECT * FROM news WHERE id = ?').get(r.lastInsertRowid);
  hub.sendMany(db.prepare("SELECT id FROM users WHERE status='active'").all().map((u) => u.id).filter((id) => id !== req.user.id), { type: 'news_silent' });
  onNewsPost(req.user.id, n.id);
  recompute(req.user.id);
  res.status(201).json({ news: newsDto(n, req.user.id) });
}));
// Người đăng tự xóa bài của mình
api.delete('/news/:id', wrap((req, res) => {
  const n = db.prepare('SELECT * FROM news WHERE id = ?').get(int(req.params.id));
  if (!n || n.author_id !== req.user.id) throw notFound('Không tìm thấy bản tin của bạn');
  db.prepare('DELETE FROM news_hearts WHERE news_id = ?').run(n.id);
  db.prepare("DELETE FROM comments WHERE kind = 'news' AND target_id = ?").run(n.id);
  db.prepare('DELETE FROM news_reads WHERE news_id = ?').run(n.id);
  db.prepare('DELETE FROM news WHERE id = ?').run(n.id);
  res.json({ ok: true });
}));
api.patch('/admin/news/:id', adminOnly, wrap((req, res) => {
  const n = db.prepare('SELECT * FROM news WHERE id = ?').get(int(req.params.id));
  if (!n) throw notFound();
  const b = req.body;
  const title = b.title !== undefined ? str(b.title, 150) : n.title;
  const body = b.body !== undefined ? str(b.body, 5000) : n.body;
  // imageUrls: danh sách ảnh mới (tối đa 4); không gửi = giữ nguyên. imageUrl (cũ): null/'' = gỡ hết ảnh, chuỗi = chỉ một ảnh
  const cur = newsImgs(n);
  const imgs = b.imageUrls !== undefined ? cleanNewsImages(b.imageUrls) : b.imageUrl === undefined ? cur : b.imageUrl ? cleanNewsImages([b.imageUrl]) : [];
  if (!title && !body && !imgs.length) throw bad('Bản tin cần có tiêu đề, nội dung hoặc ảnh');
  const contentChanged = title !== n.title || body !== n.body || JSON.stringify(imgs) !== JSON.stringify(cur);
  db.prepare('UPDATE news SET title=?, body=?, image_url=?, images=?, pinned=?, edited=? WHERE id=?').run(title, body, imgs[0] || null, JSON.stringify(imgs), b.pinned !== undefined ? (b.pinned ? 1 : 0) : n.pinned, contentChanged ? 1 : n.edited, n.id);
  res.json({ news: newsDto(db.prepare('SELECT * FROM news WHERE id = ?').get(n.id), req.user.id) });
}));
api.post('/news/:id/heart', wrap((req, res) => {
  rateLimit(`nheart:${req.user.id}`, 60, 60_000);
  const n = db.prepare('SELECT id FROM news WHERE id = ?').get(int(req.params.id));
  if (!n) throw notFound('Bản tin không tồn tại');
  const had = db.prepare('SELECT 1 FROM news_hearts WHERE news_id = ? AND user_id = ?').get(n.id, req.user.id);
  if (had) db.prepare('DELETE FROM news_hearts WHERE news_id = ? AND user_id = ?').run(n.id, req.user.id);
  else db.prepare('INSERT INTO news_hearts (news_id, user_id, created_at) VALUES (?,?,?)').run(n.id, req.user.id, now());
  res.json({ hearts: newsHearts(n.id), hearted: !had });
}));
api.delete('/admin/news/:id', adminOnly, wrap((req, res) => {
  db.prepare('DELETE FROM news_hearts WHERE news_id = ?').run(int(req.params.id));
  db.prepare("DELETE FROM comments WHERE kind = 'news' AND target_id = ?").run(int(req.params.id));
  db.prepare('DELETE FROM news WHERE id = ?').run(int(req.params.id));
  db.prepare('DELETE FROM news_reads WHERE news_id = ?').run(int(req.params.id));
  res.json({ ok: true });
}));

// ============================================================================
// Admin hệ thống: người dùng, mod, log
// ============================================================================
api.get('/admin/users', adminOnly, wrap((req, res) => {
  const q = `%${str(req.query.q, 60)}%`;
  const rows = db.prepare("SELECT * FROM users WHERE status != 'deleted' AND (display_name LIKE ? OR email LIKE ?) ORDER BY id DESC LIMIT 50").all(q, q);
  res.json({ users: rows.map((u) => ({ ...publicUser(u), location: locationOf(u), email: u.email, status: u.status, lockedUntil: u.locked_until, role: u.role, isSuper: !!u.is_super })) });
}));
api.post('/admin/users/:id/lock', adminOnly, wrap((req, res) => {
  const days = req.body.permanent ? null : Math.min(int(req.body.days) || 7, 365);
  lockUser(req.user.id, int(req.params.id), days, str(req.body.reason, 300) || 'Vi phạm quy tắc cộng đồng');
  res.json({ ok: true });
}));
api.post('/admin/users/:id/unlock', adminOnly, wrap((req, res) => {
  db.prepare("UPDATE users SET status='active', locked_until=NULL WHERE id=? AND status='locked'").run(int(req.params.id));
  log(req.user.id, 'unlock', { target: int(req.params.id) });
  res.json({ ok: true });
}));

// Số lượng hiển thị trên các tab của trang quản trị
api.get('/admin/counts', adminOnly, wrap((_req, res) => {
  const c = (sql) => db.prepare(sql).get().c;
  res.json({
    reports: c("SELECT COUNT(*) c FROM reports WHERE status = 'open'"),
    users: c("SELECT COUNT(*) c FROM users WHERE status != 'deleted'"),
    mods: c("SELECT COUNT(DISTINCT m.user_id) c FROM members m JOIN groups g ON g.id = m.group_id WHERE m.role = 'mod' AND g.type IN ('country','region','province','topic')"),
    admins: c("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND status != 'deleted'"),
    topics: c("SELECT COUNT(*) c FROM groups WHERE type = 'topic_pending'"),
  });
}));

// Trao / thu hồi quyền mod trong từng group công khai
api.get('/admin/mods', adminOnly, wrap((_req, res) => {
  const rows = db.prepare("SELECT m.group_id, m.user_id FROM members m JOIN groups g ON g.id=m.group_id WHERE m.role='mod' AND g.type IN ('country','region','province','topic')").all();
  res.json({ mods: rows.map((r) => ({ groupId: r.group_id, groupName: getGroup(r.group_id).name, user: publicUser(getUser(r.user_id)) })) });
}));
api.post('/admin/mods', adminOnly, wrap((req, res) => {
  const g = getGroup(int(req.body.groupId));
  const uid = int(req.body.userId);
  if (!g || !PUBLIC_TYPES.includes(g.type)) throw bad('Chỉ trao quyền mod cho group công khai');
  const target = getUser(uid);
  if (!target || target.status === 'deleted') throw bad('Không tìm thấy người dùng');
  if (target.role === 'admin') throw bad('Admin đã có toàn quyền');
  // trao cho bất kỳ ai: chưa ở trong nhóm thì tự thêm vào (gỡ lệnh cấm nếu có)
  db.prepare('DELETE FROM bans WHERE group_id = ? AND user_id = ?').run(g.id, uid);
  if (!getMember(g.id, uid)) addMember(g.id, uid);
  db.prepare("UPDATE members SET role='mod' WHERE group_id=? AND user_id=?").run(g.id, uid);
  log(req.user.id, 'grant_mod', { target: uid, group: g.id });
  notify(uid, 'mod', `Bạn được trao quyền mod của nhóm "${g.name}"`);
  res.json({ ok: true });
}));
api.delete('/admin/mods/:groupId/:userId', adminOnly, wrap((req, res) => {
  const gid = int(req.params.groupId), uid = int(req.params.userId);
  db.prepare("UPDATE members SET role='member' WHERE group_id=? AND user_id=? AND role='mod'").run(gid, uid);
  log(req.user.id, 'revoke_mod', { target: uid, group: gid });
  notify(uid, 'mod', 'Quyền mod của bạn đã được thu hồi');
  res.json({ ok: true });
}));

// Phong / thu hồi Admin: chỉ Admin hệ thống
api.get('/admin/admins', superOnly, wrap((_req, res) => {
  const rows = db.prepare("SELECT * FROM users WHERE role = 'admin' AND status != 'deleted' ORDER BY is_super DESC, id").all();
  res.json({ admins: rows.map((u) => ({ ...publicUser(u), email: u.email, isSuper: !!u.is_super })) });
}));
api.post('/admin/admins', superOnly, wrap((req, res) => {
  const uid = int(req.body.userId);
  const t = getUser(uid);
  if (!t || t.status !== 'active') throw bad('Không tìm thấy người dùng (hoặc tài khoản đang bị khóa)');
  if (t.role === 'admin') throw bad('Người này đã là Admin');
  db.prepare("UPDATE users SET role = 'admin', is_super = 0 WHERE id = ?").run(uid);
  addMember(trendGroupId(), uid);
  log(req.user.id, 'grant_admin', { target: uid });
  notify(uid, 'mod', 'Bạn được trao quyền Admin');
  res.json({ ok: true });
}));
api.delete('/admin/admins/:userId', superOnly, wrap((req, res) => {
  const uid = int(req.params.userId);
  const t = getUser(uid);
  if (!t || t.role !== 'admin') throw notFound('Người này không phải Admin');
  if (t.is_super) throw bad('Không thể thu hồi Admin hệ thống');
  db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(uid);
  log(req.user.id, 'revoke_admin', { target: uid });
  notify(uid, 'mod', 'Quyền Admin của bạn đã được thu hồi');
  res.json({ ok: true });
}));

api.get('/admin/logs', adminOnly, wrap((_req, res) => {
  const rows = db.prepare('SELECT * FROM mod_logs ORDER BY id DESC LIMIT 200').all();
  res.json({
    logs: rows.map((l) => ({
      id: l.id, action: l.action, reason: l.reason, createdAt: l.created_at, messageId: l.message_id,
      actor: publicUser(getUser(l.actor_id)).displayName,
      target: l.target_user_id ? publicUser(getUser(l.target_user_id)).displayName : null,
      group: l.group_id ? getGroup(l.group_id)?.name : null,
    })),
  });
}));

// ============================================================================
// Báo lỗi: mọi người dùng gửi; admin xem danh sách và giao cho agent sửa
// ============================================================================
const BUG_STATUSES = ['new', 'sent', 'fixed', 'dismissed'];

api.post(
  '/bugs',
  wrap((req, res) => {
    rateLimit(`bug:${req.user.id}`, 10, 3600_000);
    const title = str(req.body.title, 120);
    const description = str(req.body.description, 4000);
    if (title.length < 3) throw bad('Vui lòng nhập tiêu đề lỗi (ít nhất 3 ký tự)');
    if (description.length < 10) throw bad('Vui lòng mô tả lỗi rõ hơn (ít nhất 10 ký tự)');
    const shot = req.body.screenshotUrl ? checkUploadUrl(req.body.screenshotUrl) : null;
    const r = db
      .prepare('INSERT INTO bug_reports (reporter_id, title, description, page, user_agent, screenshot_url, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(req.user.id, title, description, str(req.body.page, 300) || null, str(req.get('user-agent'), 300) || null, shot, now());
    for (const a of db.prepare("SELECT id FROM users WHERE role='admin' AND status='active'").all())
      if (a.id !== req.user.id) hub.send(a.id, { type: 'bug_new', id: Number(r.lastInsertRowid) });
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  })
);

const publicOrigin = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
const bugDto = (b, origin) => ({
  id: b.id, title: b.title, description: b.description, page: b.page, userAgent: b.user_agent,
  screenshotUrl: b.screenshot_url ? origin + b.screenshot_url : null, screenshotPath: b.screenshot_url,
  status: b.status, createdAt: b.created_at, sentAt: b.sent_at, agentResult: b.agent_result,
  reporter: publicUser(getUser(b.reporter_id)).displayName,
});

api.get('/admin/bugs', adminOnly, wrap((req, res) => {
  const status = BUG_STATUSES.includes(req.query.status) ? req.query.status : null;
  const rows = db.prepare(`SELECT * FROM bug_reports ${status ? 'WHERE status = ?' : ''} ORDER BY id DESC LIMIT 300`).all(...(status ? [status] : []));
  const counts = Object.fromEntries(BUG_STATUSES.map((s) => [s, 0]));
  for (const c of db.prepare('SELECT status, COUNT(*) c FROM bug_reports GROUP BY status').all()) counts[c.status] = c.c;
  res.json({ bugs: rows.map((b) => bugDto(b, publicOrigin(req))), counts, webhookConfigured: !!process.env.AGENT_WEBHOOK_URL });
}));

api.patch('/admin/bugs/:id', adminOnly, wrap((req, res) => {
  const b = db.prepare('SELECT id FROM bug_reports WHERE id = ?').get(int(req.params.id));
  if (!b) throw notFound('Không tìm thấy lỗi');
  if (!BUG_STATUSES.includes(req.body.status)) throw bad('Trạng thái không hợp lệ');
  db.prepare('UPDATE bug_reports SET status = ? WHERE id = ?').run(req.body.status, b.id);
  res.json({ ok: true });
}));

const DEFAULT_AGENT_PROMPT =
  'Hãy điều tra và sửa các lỗi dưới đây trong dự án JKR talks. Tìm nguyên nhân gốc, sửa tối thiểu, chạy npm test, rồi tóm tắt thay đổi.';

function pickBugs(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(int))].filter((x) => x > 0).slice(0, 20);
  if (!list.length) throw bad('Hãy chọn ít nhất một lỗi');
  const rows = list.map((id) => db.prepare('SELECT * FROM bug_reports WHERE id = ?').get(id)).filter(Boolean);
  if (!rows.length) throw notFound('Không tìm thấy lỗi đã chọn');
  return rows;
}
function composeAgentText(userPrompt, bugs, origin) {
  const parts = bugs.map((b) => [
    `## Lỗi #${b.id}: ${b.title}`,
    b.page ? `- Trang: ${b.page}` : null,
    b.user_agent ? `- Thiết bị: ${b.user_agent}` : null,
    `- Báo lúc: ${new Date(b.created_at).toISOString()}`,
    b.screenshot_url ? `- Ảnh chụp: ${origin}${b.screenshot_url}` : null,
    '', 'Mô tả của người dùng:', b.description,
  ].filter((x) => x !== null).join('\n'));
  return `${userPrompt}\n\n---\nDự án: JKR talks (${origin})\nSố lỗi: ${bugs.length}\n\n${parts.join('\n\n')}\n`;
}

// Ghép sẵn nội dung gửi agent (dùng để xem trước / sao chép)
api.post('/admin/bugs/compose', superOnly, wrap((req, res) => {
  const bugs = pickBugs(req.body.ids);
  const prompt = str(req.body.prompt, 4000) || DEFAULT_AGENT_PROMPT;
  res.json({ text: composeAgentText(prompt, bugs, publicOrigin(req)), defaultPrompt: DEFAULT_AGENT_PROMPT });
}));

// Gửi các lỗi đã chọn + prompt tới agent qua webhook (AGENT_WEBHOOK_URL)
api.post('/admin/bugs/send', superOnly, wrap(async (req, res) => {
  const url = process.env.AGENT_WEBHOOK_URL;
  if (!url) throw bad('Chưa cấu hình AGENT_WEBHOOK_URL trên máy chủ. Hãy dùng nút "Sao chép prompt".');
  const bugs = pickBugs(req.body.ids);
  const prompt = str(req.body.prompt, 4000);
  if (prompt.length < 5) throw bad('Vui lòng nhập prompt cho agent');
  const origin = publicOrigin(req);
  const text = composeAgentText(prompt, bugs, origin);
  const headers = { 'content-type': 'application/json' };
  if (process.env.AGENT_WEBHOOK_TOKEN) headers.authorization = `Bearer ${process.env.AGENT_WEBHOOK_TOKEN}`;
  let status = 0, snippet = '';
  try {
    const r = await fetch(url, {
      method: 'POST', headers, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        event: 'bug_fix_request', source: 'jkr-talks', text, prompt,
        bugs: bugs.map((b) => bugDto(b, origin)).map(({ id, title, description, page, userAgent, screenshotUrl, createdAt }) => ({ id, title, description, page, userAgent, screenshotUrl, createdAt })),
      }),
    });
    status = r.status;
    snippet = (await r.text().catch(() => '')).slice(0, 500);
  } catch (e) {
    throw new HttpError(502, `Không gửi được tới agent: ${e.name === 'TimeoutError' ? 'quá thời gian chờ' : e.message}`);
  }
  if (status < 200 || status >= 300) throw new HttpError(502, `Agent trả về lỗi HTTP ${status}${snippet ? ': ' + snippet.slice(0, 120) : ''}`);
  const mark = db.prepare("UPDATE bug_reports SET status='sent', sent_at=?, sent_by=?, agent_prompt=?, agent_result=? WHERE id=?");
  for (const b of bugs) { mark.run(now(), req.user.id, prompt, `HTTP ${status}${snippet ? ' ' + snippet : ''}`, b.id); log(req.user.id, 'bug_send', { reason: `#${b.id} ${b.title}`.slice(0, 200) }); }
  res.json({ ok: true, sent: bugs.length, status, response: snippet });
}));

// ---- lỗi ---------------------------------------------------------------------
api.use((_req, _res, next) => next(new HttpError(404, 'Không tìm thấy')));
api.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu quá lớn' });
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

export { isOnline };
