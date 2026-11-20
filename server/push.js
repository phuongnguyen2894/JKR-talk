// Thông báo đẩy ngoài app (Web Push, VAPID). Không import lib.js để tránh vòng phụ thuộc.
import * as webpush from 'web-push';
import { db, now } from './db.js';

db.exec(`
CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  ua TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subs(user_id);
`);
try { db.exec('ALTER TABLE users ADD COLUMN push_prefs TEXT'); } catch { /* đã có cột */ }

// Loại thông báo người dùng bật/tắt được. Mặc định bật hết.
export const PUSH_KINDS = ['mention', 'reply', 'heart', 'dm', 'social', 'system', 'news'];
export const PUSH_TYPE_MAP = {
  mention: 'mention', reply: 'reply', heart: 'heart', dm: 'dm',
  friend_request: 'social', friend_accept: 'social', group_invite: 'social', join_request: 'social', join_approved: 'social',
  moderation: 'system', report_done: 'system', mod: 'system', group_dissolved: 'system',
};

// Khóa VAPID tạo một lần, lưu trong cơ sở dữ liệu (volume) nên không đổi sau mỗi lần deploy
function loadKeys() {
  const get = (k) => db.prepare('SELECT value FROM app_kv WHERE key = ?').get(k)?.value;
  let pub = process.env.VAPID_PUBLIC_KEY || get('vapid_public');
  let priv = process.env.VAPID_PRIVATE_KEY || get('vapid_private');
  if (!pub || !priv) {
    ({ publicKey: pub, privateKey: priv } = webpush.generateVAPIDKeys());
    db.prepare('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)').run('vapid_public', pub);
    db.prepare('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)').run('vapid_private', priv);
  }
  return { pub, priv };
}
const keys = loadKeys();
export const vapidPublicKey = keys.pub;
// "subject" gửi tới dịch vụ đẩy: dùng địa chỉ công khai của app, không dùng thông tin cá nhân
const subject = process.env.PUBLIC_URL || (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : 'https://localhost');
webpush.setVapidDetails(subject, keys.pub, keys.priv);

// Dùng cho kiểm thử: không gửi mạng, ghi lại vào mảng
export const pushLog = [];
const DRY = () => process.env.PUSH_DRY_RUN === '1';

export function getPrefs(uid) {
  let saved = {};
  try { saved = JSON.parse(db.prepare('SELECT push_prefs FROM users WHERE id = ?').get(uid)?.push_prefs || '{}'); } catch { /* mặc định */ }
  return Object.fromEntries(PUSH_KINDS.map((k) => [k, saved[k] !== false]));
}
export function setPrefs(uid, patch) {
  const cur = getPrefs(uid);
  for (const k of PUSH_KINDS) if (typeof patch?.[k] === 'boolean') cur[k] = patch[k];
  db.prepare('UPDATE users SET push_prefs = ? WHERE id = ?').run(JSON.stringify(cur), uid);
  return cur;
}

export const hasSubscription = (uid) => !!db.prepare('SELECT 1 FROM push_subs WHERE user_id = ? LIMIT 1').get(uid);

export function saveSubscription(uid, sub, ua) {
  const ep = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || ''), auth = String(sub?.keys?.auth || '');
  if (!/^https:\/\//i.test(ep) || ep.length > 1000 || !p256dh || !auth) return false;
  db.prepare(`INSERT INTO push_subs (user_id, endpoint, p256dh, auth, ua, created_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua`)
    .run(uid, ep, p256dh, auth, String(ua || '').slice(0, 200), now());
  return true;
}
export const removeSubscription = (uid, endpoint) => db.prepare('DELETE FROM push_subs WHERE user_id = ? AND endpoint = ?').run(uid, String(endpoint || ''));

// Gửi tới mọi thiết bị của người dùng (nếu loại thông báo này đang bật). Không chặn luồng chính, lỗi chỉ ghi log.
export function pushToUser(uid, kind, payload) {
  try {
    if (!getPrefs(uid)[kind]) return;
    const subs = db.prepare('SELECT * FROM push_subs WHERE user_id = ?').all(uid);
    if (!subs.length) return;
    const body = JSON.stringify({ title: 'JKR talks', ...payload });
    for (const s of subs) {
      if (DRY()) { pushLog.push({ uid, kind, endpoint: s.endpoint, payload: JSON.parse(body) }); continue; }
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 6 * 3600, urgency: 'normal' })
        .catch((e) => {
          if (e?.statusCode === 404 || e?.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE id = ?').run(s.id); // thiết bị đã gỡ đăng ký
          else console.error('[push]', e?.statusCode || e?.message);
        });
    }
  } catch (e) { console.error('[push]', e.message); }
}
