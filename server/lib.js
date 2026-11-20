import crypto from 'node:crypto';
import { pushToUser, PUSH_TYPE_MAP } from './push.js';
import { db, now } from './db.js';
import { provinceById, regionByCode } from './geo.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const bad = (m) => new HttpError(400, m);
export const forbidden = (m = 'Bạn không có quyền thực hiện thao tác này') => new HttpError(403, m);
export const notFound = (m = 'Không tìm thấy') => new HttpError(404, m);

// ---- mật khẩu / token ---------------------------------------------------------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${h}`;
}
export function checkPassword(pw, stored) {
  const [salt, h] = stored.split(':');
  if (!salt || !h) return false;
  const a = Buffer.from(h, 'hex');
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export const randomToken = (n = 32) => crypto.randomBytes(n).toString('base64url');

// ---- rate limit đơn giản trong bộ nhớ ----------------------------------------
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const t = Date.now();
  const b = buckets.get(key) || { n: 0, reset: t + windowMs };
  if (t > b.reset) {
    b.n = 0;
    b.reset = t + windowMs;
  }
  b.n++;
  buckets.set(key, b);
  if (b.n > max) throw new HttpError(429, 'Thao tác quá nhanh, vui lòng thử lại sau');
}
setInterval(() => {
  const t = Date.now();
  for (const [k, b] of buckets) if (t > b.reset) buckets.delete(k);
}, 60_000).unref();

// ---- user -------------------------------------------------------------------
export const AVATAR_COUNT = 6;

export function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function locationOf(u) {
  const p = provinceById(u.province_id);
  const r = p && regionByCode(p.region);
  return { country: 'Việt Nam', province: p?.name || null, region: r?.name || null };
}

// Thông tin công khai của một người dùng (không lộ email, chỉ tới cấp tỉnh/thành)
export function publicUser(u, viewerId) {
  if (!u) return { id: 0, displayName: 'Người dùng đã xóa', avatarColor: 0, deleted: true };
  if (u.status === 'deleted')
    return { id: u.id, displayName: 'Người dùng đã xóa', avatarColor: 0, deleted: true };
  const out = {
    id: u.id,
    displayName: u.display_name,
    avatarColor: u.avatar_color,
    avatarUrl: u.avatar_url,
    language: u.language,
    isAdmin: u.role === 'admin',
    staff: u.role === 'admin' ? (u.is_super ? 'super' : 'admin') : null, // vai trò toàn hệ thống (hiện huy hiệu + màu tên)
  };
  if (viewerId) out.online = presenceVisible(u, viewerId) ? isOnline(u.id) : undefined;
  return out;
}

export function selfUser(u) {
  const base = publicUser(u);
  return {
    ...base,
    location: locationOf(u), // chỉ chính chủ (và admin) mới thấy vị trí
    email: u.email,
    provinceId: u.province_id,
    verified: !!u.verified,
    role: u.role,
    isSuper: u.role === 'admin' && !!u.is_super,
    friendPolicy: u.friend_policy,
    showOnline: !!u.show_online,
    newsPush: !!u.news_push,
    hideSuggestions: !!u.hide_suggestions,
    homeChangedAt: u.home_changed_at,
  };
}

function presenceVisible(target, viewerId) {
  if (!target.show_online) return false;
  const v = getUser(viewerId);
  return !!v?.show_online;
}

// ---- bạn bè / chặn ----------------------------------------------------------
export const pair = (x, y) => (x < y ? [x, y] : [y, x]);
export function areFriends(x, y) {
  const [a, b] = pair(x, y);
  return !!db.prepare('SELECT 1 FROM friends WHERE a = ? AND b = ?').get(a, b);
}
export function isBlockedEither(x, y) {
  return !!db
    .prepare('SELECT 1 FROM blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)')
    .get(x, y, y, x);
}
export function shareGroup(x, y) {
  return !!db
    .prepare(
      `SELECT 1 FROM members m1 JOIN members m2 ON m1.group_id = m2.group_id
       JOIN groups g ON g.id = m1.group_id
       WHERE m1.user_id = ? AND m2.user_id = ? AND g.type != 'dm' LIMIT 1`
    )
    .get(x, y);
}

// ---- group ------------------------------------------------------------------
export const getGroup = (id) => db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
export const getMember = (gid, uid) =>
  db.prepare('SELECT * FROM members WHERE group_id = ? AND user_id = ?').get(gid, uid);
export const memberIds = (gid) =>
  db.prepare('SELECT user_id FROM members WHERE group_id = ?').all(gid).map((r) => r.user_id);

export function addMember(gid, uid, role = 'member') {
  db.prepare(
    `INSERT OR IGNORE INTO members (group_id, user_id, role, rules_ack, joined_at, last_read_id)
     VALUES (?,?,?,?,?, COALESCE((SELECT MAX(id) FROM messages WHERE group_id = ?),0))`
  ).run(gid, uid, role, 0, now(), gid);
}
export const removeMember = (gid, uid) =>
  db.prepare('DELETE FROM members WHERE group_id = ? AND user_id = ?').run(gid, uid);

// Quyền Admin (toàn hệ thống): gồm Admin hệ thống và Admin
export function isSystemAdmin(uid) {
  return getUser(uid)?.role === 'admin';
}
// Admin hệ thống: cấp cao nhất
export function isSuper(uid) {
  const u = getUser(uid);
  return u?.role === 'admin' && !!u.is_super;
}

// Được đăng vào "Đẩy trend": admin hệ thống hoặc mod của bất kỳ nhóm công khai nào
export function canPostTrend(uid) {
  if (isSystemAdmin(uid)) return true;
  return !!db.prepare("SELECT 1 FROM members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? AND m.role = 'mod' AND g.type IN ('country','region','province') LIMIT 1").get(uid);
}

export function log(actor, action, { target, group, message, reason } = {}) {
  db.prepare(
    'INSERT INTO mod_logs (actor_id, action, target_user_id, group_id, message_id, reason, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(actor, action, target ?? null, group ?? null, message ?? null, reason ?? null, now());
}

// ---- realtime hub -----------------------------------------------------------
const sockets = new Map(); // userId -> Set<ws>
export const hub = {
  add(uid, ws) {
    if (!sockets.has(uid)) sockets.set(uid, new Set());
    sockets.get(uid).add(ws);
  },
  remove(uid, ws) {
    const s = sockets.get(uid);
    if (!s) return;
    s.delete(ws);
    if (!s.size) sockets.delete(uid);
  },
  send(uid, event) {
    const s = sockets.get(uid);
    if (!s) return;
    const data = JSON.stringify(event);
    for (const ws of s) if (ws.readyState === 1) ws.send(data);
  },
  sendMany(uids, event) {
    for (const uid of uids) this.send(uid, event);
  },
};
export const isOnline = (uid) => sockets.has(uid);

// Thông báo trong app (đẩy realtime nếu đang online)
export function notify(uid, type, text, opts = {}) {
  const r = db
    .prepare('INSERT INTO notifications (user_id, type, text, created_at) VALUES (?,?,?,?)')
    .run(uid, type, text, now());
  hub.send(uid, {
    type: 'notification',
    notification: { id: Number(r.lastInsertRowid), type, text, read: false, createdAt: now() },
  });
  const kind = PUSH_TYPE_MAP[type];
  if (kind && !isOnline(uid)) pushToUser(uid, kind, { body: text, url: opts.url || '/', tag: opts.tag });
}
// Chỉ gửi thông báo đẩy (không lưu vào danh sách thông báo), bỏ qua nếu người dùng đang mở app
export function pushOnly(uid, kind, payload) {
  if (!isOnline(uid)) pushToUser(uid, kind, payload);
}

// ---- tin nhắn ---------------------------------------------------------------
export function messageDto(m, viewerId) {
  const author = getUser(m.user_id);
  let reply = null;
  if (m.reply_to) {
    const r = db.prepare('SELECT * FROM messages WHERE id = ?').get(m.reply_to);
    if (r) {
      const ra = getUser(r.user_id);
      reply = {
        id: r.id,
        body: r.deleted ? '' : r.body.slice(0, 120),
        deleted: !!r.deleted,
        hasImage: !!r.image_url && !r.deleted,
        displayName: publicUser(ra).displayName,
      };
    }
  }
  const member = getMember(m.group_id, m.user_id);
  // tin chuyển tiếp: tim được tính chung cho tin gốc
  const rootId = m.fwd_id || m.id;
  const rootGone = m.fwd_id ? !db.prepare('SELECT 1 FROM messages WHERE id = ? AND deleted = 0').get(rootId) : false;
  const hearts = rootGone ? 0 : db.prepare('SELECT COUNT(*) c FROM reactions WHERE message_id = ?').get(rootId).c;
  const hearted = viewerId && !rootGone ? !!db.prepare('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ?').get(rootId, viewerId) : false;
  return {
    hearts: m.deleted ? 0 : hearts,
    hearted,
    id: m.id,
    groupId: m.group_id,
    user: publicUser(author),
    modRole: member?.role === 'mod' ? 'mod' : member?.role === 'admin' ? 'admin' : null,
    body: m.deleted ? '' : m.body,
    imageUrl: m.deleted ? null : m.image_url,
    preview: m.deleted || !m.preview || m.preview === '0' ? null : JSON.parse(m.preview),
    deleted: !!m.deleted,
    fwd: m.fwd ? JSON.parse(m.fwd) : null,
    mentionAll: !m.deleted && !!m.mention_all,
    commentCount: db.prepare("SELECT COUNT(*) c FROM comments WHERE kind = 'msg' AND target_id = ?").get(m.id).c,
    mentions: m.deleted || !m.mentions ? [] : JSON.parse(m.mentions).map((id) => publicUser(getUser(id))).filter((u) => !u.deleted).map((u) => ({ id: u.id, displayName: u.displayName })),
    reply,
    createdAt: m.created_at,
  };
}
