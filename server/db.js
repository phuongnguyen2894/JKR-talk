import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { COUNTRY, REGIONS, PROVINCES } from './geo.js';

const dbFile = process.env.DB_FILE || path.join(process.cwd(), 'data', 'jkr.db');
if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true });

export const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA cache_size = -65536; PRAGMA temp_store = MEMORY;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_color INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT,
  language TEXT NOT NULL DEFAULT 'vi',
  country TEXT NOT NULL DEFAULT 'VN',
  province_id INTEGER NOT NULL,
  home_changed_at INTEGER,
  role TEXT NOT NULL DEFAULT 'user',            -- user | admin
  status TEXT NOT NULL DEFAULT 'active',        -- active | locked | deleted
  locked_until INTEGER,                         -- null + status=locked => vĩnh viễn
  verified INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT,
  friend_policy TEXT NOT NULL DEFAULT 'shared', -- everyone | shared | none
  show_online INTEGER NOT NULL DEFAULT 1,
  news_push INTEGER NOT NULL DEFAULT 1,
  hide_suggestions INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                -- country | region | province | private | dm
  key TEXT UNIQUE,                   -- VN | VN:north | VN:p:12 | dm:1:2
  name TEXT NOT NULL,
  short TEXT,
  lang TEXT NOT NULL DEFAULT 'vi',
  avatar_url TEXT,
  member_limit INTEGER,
  created_by INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',  -- member | mod (công khai) | admin (riêng)
  mod_muted_until INTEGER,              -- bị mod/admin mute
  notif_muted_until INTEGER,            -- tự tắt thông báo (-1 = vô thời hạn)
  rules_ack INTEGER NOT NULL DEFAULT 0,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
CREATE TABLE IF NOT EXISTS bans (
  group_id INTEGER NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  reply_to INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, id);
CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL, to_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friends (
  a INTEGER NOT NULL, b INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (a, b)   -- a < b
);
CREATE TABLE IF NOT EXISTS blocks (
  blocker INTEGER NOT NULL, blocked INTEGER NOT NULL, PRIMARY KEY (blocker, blocked)
);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY, group_id INTEGER NOT NULL, created_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL,
  message_id INTEGER,
  group_id INTEGER,
  group_type TEXT,
  snapshot_body TEXT, snapshot_image TEXT,   -- admin chỉ thấy nội dung bị report, không đọc cả cuộc trò chuyện
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',       -- open | resolved
  resolution TEXT, note TEXT, handled_by INTEGER, handled_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mod_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL, action TEXT NOT NULL,
  target_user_id INTEGER, group_id INTEGER, message_id INTEGER, reason TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE IF NOT EXISTS bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page TEXT,                         -- trang đang mở khi báo lỗi
  user_agent TEXT,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new | sent | fixed | dismissed
  sent_at INTEGER, sent_by INTEGER, agent_prompt TEXT, agent_result TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bug_reports(status, id);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, body TEXT NOT NULL, image_url TEXT,
  pinned INTEGER NOT NULL DEFAULT 0, edited INTEGER NOT NULL DEFAULT 0,
  author_id INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS news_reads (
  user_id INTEGER NOT NULL, news_id INTEGER NOT NULL, PRIMARY KEY (user_id, news_id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, type TEXT NOT NULL, text TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, id);
`);

export const now = () => Date.now();

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---- Group công khai theo địa lý: tạo sẵn toàn bộ khi khởi động -------------
export function ensureGroup(type, key, name, short) {
  const row = db.prepare('SELECT id FROM groups WHERE key = ?').get(key);
  if (row) return row.id;
  const r = db
    .prepare('INSERT INTO groups (type, key, name, short, created_at) VALUES (?,?,?,?,?)')
    .run(type, key, name, short || null, now());
  return Number(r.lastInsertRowid);
}

export function seedGeoGroups() {
  ensureGroup('country', COUNTRY.code, COUNTRY.name, 'VN');
  for (const r of REGIONS) ensureGroup('region', `${COUNTRY.code}:${r.code}`, r.name, r.short);
  for (const p of PROVINCES) ensureGroup('province', `${COUNTRY.code}:p:${p.id}`, p.name, null);
}
seedGeoGroups();

// Nhóm "Đẩy trend": ai cũng đọc/thả tim, chỉ admin và mod được đăng
// Nhóm ẩn chứa các bài do Admin đăng thẳng lên trang Chủ đề nóng (không ai là thành viên, không hiện ở danh sách nhóm)
export const hotGroupId = () => ensureGroup('hot', 'HOT', 'Chủ đề hot', '🌟');
export const trendGroupId = () => ensureGroup('trend', 'TREND', 'Đẩy trend', '🔥');
db.prepare("INSERT OR IGNORE INTO members (group_id, user_id, role, joined_at) SELECT ?, id, 'member', ? FROM users WHERE status != 'deleted'").run(trendGroupId(), now());

// 3 group (quốc gia, khu vực, tỉnh/thành) ứng với một tỉnh
export function homeGroupIds(province) {
  return [
    ensureGroup('country', COUNTRY.code),
    ensureGroup('region', `${COUNTRY.code}:${province.region}`),
    ensureGroup('province', `${COUNTRY.code}:p:${province.id}`),
  ];
}

// ---- Tên hiển thị duy nhất (không phân biệt hoa/thường, bỏ khoảng trắng thừa) ----
export const nameKey = (s) => String(s).normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
try { db.exec('ALTER TABLE users ADD COLUMN name_key TEXT'); } catch { /* đã có cột */ }
try { db.exec('ALTER TABLE messages ADD COLUMN preview TEXT'); } catch { /* đã có cột */ }
try { db.exec('ALTER TABLE messages ADD COLUMN images TEXT'); } catch { /* đã có cột */ } // JSON: tối đa 4 ảnh; image_url giữ ảnh đầu tiên
try { db.exec('ALTER TABLE messages ADD COLUMN fwd TEXT'); } catch { /* đã có cột */ }
try { db.exec('ALTER TABLE messages ADD COLUMN fwd_id INTEGER'); } catch { /* đã có cột */ }
try { db.exec('ALTER TABLE messages ADD COLUMN mentions TEXT'); } catch { /* đã có cột */ }
try { db.exec('ALTER TABLE messages ADD COLUMN mention_all INTEGER NOT NULL DEFAULT 0'); } catch { /* đã có cột */ } // admin tag @everyone
try { db.exec('ALTER TABLE groups ADD COLUMN description TEXT'); } catch { /* đã có cột */ } // mô tả của chủ đề thảo luận
try { db.exec('ALTER TABLE groups ADD COLUMN highlighted INTEGER'); } catch { /* đã có cột */ } // chủ đề được Admin đặt nổi bật (thời điểm đặt)
// Thời điểm chủ đề được duyệt (chủ đề chờ duyệt có type = 'topic_pending' nên không hiện ở đâu cả cho tới khi duyệt)
try { db.exec('ALTER TABLE groups ADD COLUMN approved_at INTEGER'); } catch { /* đã có cột */ }
db.exec("UPDATE groups SET approved_at = created_at WHERE type = 'topic' AND approved_at IS NULL");
try { db.exec('ALTER TABLE groups ADD COLUMN pinned_message_id INTEGER'); } catch { /* đã có cột */ } // tin được ghim lên đầu nhóm
// Bình luận cho bản tin (kind='news') và tin nhắn ở Chủ đề nóng (kind='msg')
db.exec(`CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, target_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(kind, target_id);`);
try { db.exec('ALTER TABLE news ADD COLUMN images TEXT'); } catch { /* đã có cột */ } // JSON: tối đa 4 ảnh; image_url giữ ảnh đầu tiên
// is_super = 1: Admin hệ thống (duy nhất được phong Admin). role='admin' & is_super=0: Admin
try { db.exec('ALTER TABLE users ADD COLUMN is_super INTEGER NOT NULL DEFAULT 0'); } catch { /* đã có cột */ }
try { db.exec('ALTER TABLE users ADD COLUMN hot_seen INTEGER NOT NULL DEFAULT 0'); } catch { /* đã có cột */ }
// game_net: lãi/lỗ cộng dồn từ mini game Muay Thai (có thể âm); số dư = coins - coins_spent + game_net, không ảnh hưởng cấp
try { db.exec('ALTER TABLE users ADD COLUMN game_net INTEGER NOT NULL DEFAULT 0'); } catch { /* đã có cột */ }
if (!db.prepare('SELECT 1 FROM users WHERE is_super = 1').get()) db.exec("UPDATE users SET is_super = 1 WHERE role = 'admin'");
for (const u of db.prepare("SELECT id, display_name FROM users WHERE name_key IS NULL AND status != 'deleted'").all()) {
  try { db.prepare('UPDATE users SET name_key = ? WHERE id = ?').run(nameKey(u.display_name), u.id); } catch { /* trùng cũ: bỏ qua */ }
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_key ON users(name_key) WHERE name_key IS NOT NULL');

// ---- Cấp bậc và Xu tím ------------------------------------------------------
// coins: tổng Xu tím đã kiếm (chỉ tăng); lvl: cấp cao nhất đã đạt (0 = chưa có cấp); lvl_seen: cấp đã chúc mừng
for (const c of [
  'coins INTEGER NOT NULL DEFAULT 0', 'lvl INTEGER NOT NULL DEFAULT 0', 'lvl_seen INTEGER NOT NULL DEFAULT 0',
  'hide_level INTEGER NOT NULL DEFAULT 0', 'start_done INTEGER NOT NULL DEFAULT 0', 'streak INTEGER NOT NULL DEFAULT 0', 'last_day TEXT',
]) { try { db.exec(`ALTER TABLE users ADD COLUMN ${c}`); } catch { /* đã có cột */ } }
db.exec(`
CREATE TABLE IF NOT EXISTS coin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL,
  ref TEXT, day TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_ref ON coin_log(user_id, kind, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coin_day ON coin_log(user_id, kind, day);
CREATE TABLE IF NOT EXISTS user_titles (
  user_id INTEGER NOT NULL, title TEXT NOT NULL, granted_at INTEGER NOT NULL, PRIMARY KEY (user_id, title)
);
`);

// ---- Cửa hàng xu tím và khung avatar / màu tên ------------------------------
// coins_spent: tổng xu đã tiêu (số dư = coins - coins_spent); frame, name_color: đồ đang dùng ('shop:3', 'title:1'...)
for (const c of ['coins_spent INTEGER NOT NULL DEFAULT 0', 'frame TEXT', 'name_color TEXT']) { try { db.exec(`ALTER TABLE users ADD COLUMN ${c}`); } catch { /* đã có cột */ } }
db.exec(`
CREATE TABLE IF NOT EXISTS user_items (
  user_id INTEGER NOT NULL, item TEXT NOT NULL, price INTEGER NOT NULL, acquired_at INTEGER NOT NULL, PRIMARY KEY (user_id, item)
);
`);

// ---- Emoji tùy chỉnh và react bằng emoji ---------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS custom_emoji (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at INTEGER NOT NULL, deleted_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_emoji_name ON custom_emoji(name) WHERE deleted_at IS NULL;
`);
// reactions: thêm cột emoji vào khóa chính (tim cũ chuyển thành react 'heart')
if (!db.prepare('PRAGMA table_info(reactions)').all().some((c) => c.name === 'emoji')) {
  db.exec(`
    BEGIN;
    CREATE TABLE reactions_new (
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL, emoji TEXT NOT NULL DEFAULT 'heart', created_at INTEGER NOT NULL,
      PRIMARY KEY (message_id, user_id, emoji)
    );
    INSERT INTO reactions_new (message_id, user_id, emoji, created_at) SELECT message_id, user_id, 'heart', created_at FROM reactions;
    DROP TABLE reactions;
    ALTER TABLE reactions_new RENAME TO reactions;
    COMMIT;
  `);
}


// Thống kê theo đối tượng: kind 'u' = người dùng đã đăng ký (actor = id), 'g' = khách (actor = mã ẩn danh trên trình duyệt)
db.exec(`
CREATE TABLE IF NOT EXISTS stat_actors (
  day TEXT NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, actor)
);
CREATE TABLE IF NOT EXISTS stat_pages (
  day TEXT NOT NULL, kind TEXT NOT NULL, page TEXT NOT NULL, target INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, page, target)
);
CREATE TABLE IF NOT EXISTS stat_hours (
  day TEXT NOT NULL, hour INTEGER NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour, kind, actor)
);
CREATE TABLE IF NOT EXISTS visitor_links (vid TEXT PRIMARY KEY, user_id INTEGER NOT NULL, linked_at INTEGER NOT NULL);
`);
const hasTable = (n) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(n);
if (hasTable('daily_users')) {
  db.exec(`
    INSERT OR IGNORE INTO stat_actors (day, kind, actor, views, seconds) SELECT day, 'u', CAST(user_id AS TEXT), views, seconds FROM daily_users;
    INSERT OR IGNORE INTO stat_pages (day, kind, page, target, views, seconds) SELECT day, 'u', page, target, views, seconds FROM daily_pages;
    INSERT OR IGNORE INTO stat_hours (day, hour, kind, actor, views, seconds) SELECT day, hour, 'u', CAST(user_id AS TEXT), views, seconds FROM hourly_users;
    DROP TABLE daily_users; DROP TABLE daily_pages; DROP TABLE hourly_users;
  `);
}
