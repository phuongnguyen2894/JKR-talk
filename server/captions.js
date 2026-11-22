// Caption cho link X trong Đẩy trend: máy chủ gọi công cụ tạo caption (vbots-caption) và tạo sẵn vài caption cho mỗi link.
// Người dùng bấm link thì app copy caption + keyword + hashtag và mở ô trả lời của bài đó trên X (xử lý ở máy khách).
// Tạo trước (không tạo lúc bấm) vì trình duyệt chỉ cho copy ngay trong lúc bấm, chờ mạng xong mới copy thì có thể bị chặn.
import { db, now } from './db.js';

const API = (process.env.CAPTION_API_URL || 'https://vbots-caption.vercel.app').replace(/\/+$/, '');
const API_KEY = process.env.CAPTION_API_KEY || ''; // tùy chọn: gửi kèm nếu dịch vụ yêu cầu khóa
export const CAPTIONS_PER_LINK = 6;

db.exec(`
CREATE TABLE IF NOT EXISTS trend_captions (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_trend_cap_msg ON trend_captions(message_id);
CREATE TABLE IF NOT EXISTS trend_caption_use (user_id INTEGER NOT NULL, message_id INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, message_id));
`);

const headers = () => ({ 'content-type': 'application/json', 'user-agent': 'JKR-talks/1.0', ...(API_KEY ? { 'x-api-key': API_KEY } : {}) });

// ---- chủ đề caption (lấy từ cấu hình của công cụ caption) ------------------------------------------------------------
let cfg = { t: 0, topics: [] };
export async function captionTopics() {
  if (now() - cfg.t < 60_000) return cfg.topics;
  try {
    const r = await fetch(`${API}/api/config`, { headers: headers(), signal: AbortSignal.timeout(8000) });
    if (r.ok) { const j = await r.json(); cfg = { t: now(), topics: Array.isArray(j.topics) ? j.topics.filter((x) => x && x.label && x.topic) : [] }; }
  } catch { cfg.t = now() - 45_000; /* lỗi mạng: dùng bản cũ, thử lại sau 15 giây */ }
  return cfg.topics;
}
export const selectedTopicLabel = () => db.prepare("SELECT value FROM app_kv WHERE key = 'trend_caption_topic'").get()?.value || '';
export const setSelectedTopicLabel = (label) => db.prepare("INSERT OR REPLACE INTO app_kv (key, value) VALUES ('trend_caption_topic', ?)").run(label || '');
async function activeTopic() {
  const topics = await captionTopics();
  const label = selectedTopicLabel();
  return topics.find((t) => t.label === label) || topics.find((t) => t.enabled) || null; // chưa chọn: chủ đề đang bật đầu tiên
}

// ---- tạo caption ------------------------------------------------------------------------------------------------------------
async function oneCaption(t) {
  const r = await fetch(`${API}/api/generate`, {
    method: 'POST', headers: headers(), signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({ topic: t.topic, tagsAndKeywords: t.tagsAndKeywords || '', charLimit: t.charLimit || 280, topicLabel: t.label, language: t.language, allowEmojis: !!t.allowEmojis, fullNames: t.fullNames !== false }),
  });
  if (!r.ok) throw new Error(`caption api ${r.status}`);
  const j = await r.json();
  return j.fallback ? '' : String(j.caption || '').trim(); // bỏ caption mẫu dự phòng của dịch vụ để khỏi trùng nhau
}
const compose = (caption, tags) => [caption, (tags || '').trim()].filter(Boolean).join('\n\n').slice(0, 280);
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

const running = new Set();
// chạy nền, không chặn người dùng; mỗi bài chỉ tạo một lần
export function ensureCaptions(messageId) {
  if (running.has(messageId) || db.prepare('SELECT 1 FROM trend_captions WHERE message_id = ? LIMIT 1').get(messageId)) return;
  running.add(messageId);
  (async () => {
    const t = await activeTopic();
    if (!t) return;
    const found = [];
    for (let round = 0; round < 2 && found.length < CAPTIONS_PER_LINK; round++) {
      const batch = await Promise.allSettled(Array.from({ length: 3 }, () => oneCaption(t)));
      for (const b of batch) if (b.status === 'fulfilled' && b.value && !found.some((x) => norm(x) === norm(b.value))) found.push(b.value);
    }
    const texts = found.length ? found.map((c) => compose(c, t.tagsAndKeywords)) : [compose('', t.tagsAndKeywords)]; // dịch vụ lỗi: ít nhất vẫn có keyword và hashtag
    if (!texts[0]) return;
    const ins = db.prepare('INSERT INTO trend_captions (message_id, text, created_at) VALUES (?,?,?)');
    for (const x of texts) ins.run(messageId, x, now());
  })().catch(() => {}).finally(() => running.delete(messageId));
}

// mỗi người một caption khác nhau cho cùng một bài (tránh hàng loạt bình luận giống hệt nhau); cùng người, cùng bài thì luôn cùng caption
export function captionFor(userId, messageId) {
  const rows = db.prepare('SELECT text FROM trend_captions WHERE message_id = ? ORDER BY id').all(messageId);
  return rows.length ? { text: rows[(userId + messageId) % rows.length].text, n: rows.length } : null;
}
export function recordUse(userId, messageId) {
  db.prepare('INSERT OR IGNORE INTO trend_caption_use (user_id, message_id, at) VALUES (?,?,?)').run(userId, messageId, now());
}
export function purgeOrphanCaptions() {
  db.prepare('DELETE FROM trend_captions WHERE message_id NOT IN (SELECT id FROM messages)').run();
}
