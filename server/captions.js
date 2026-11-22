// Caption cho link X trong Đẩy trend: máy chủ gọi công cụ tạo caption (vbots-caption) và tạo sẵn vài caption cho mỗi link.
// Người dùng bấm link thì app copy caption + keyword + hashtag và mở ô trả lời của bài đó trên X (xử lý ở máy khách).
// Tạo trước (không tạo lúc bấm) vì trình duyệt chỉ cho copy ngay trong lúc bấm, chờ mạng xong mới copy thì có thể bị chặn.
import { db, now } from './db.js';

const API = (process.env.CAPTION_API_URL || 'https://vbots-caption.vercel.app').replace(/\/+$/, '');
const API_KEY = process.env.CAPTION_API_KEY || ''; // tùy chọn: gửi kèm nếu dịch vụ yêu cầu khóa
export const CAPTIONS_PER_LINK = 6;
export const CAPTIONS_MAX_PER_LINK = 24; // tạo thêm khi người dùng bấm hết vòng, tối đa chừng này mỗi link

db.exec(`
CREATE TABLE IF NOT EXISTS trend_captions (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_trend_cap_msg ON trend_captions(message_id);
CREATE TABLE IF NOT EXISTS trend_caption_use (user_id INTEGER NOT NULL, message_id INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, message_id));
`);

try { db.exec('ALTER TABLE trend_captions ADD COLUMN sig TEXT'); } catch { /* đã có cột */ }

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
export const refreshTopics = () => { cfg.t = 0; };
export const selectedTopicLabel = () => db.prepare("SELECT value FROM app_kv WHERE key = 'trend_caption_topic'").get()?.value || '';
export const setSelectedTopicLabel = (label) => db.prepare("INSERT OR REPLACE INTO app_kv (key, value) VALUES ('trend_caption_topic', ?)").run(label || '');
// chữ ký của chủ đề đang dùng: đổi chủ đề, đổi keyword/hashtag hay nội dung chủ đề đều làm caption cũ hết hiệu lực
const sigOf = (t) => (t ? ['v2', t.label, t.topic, t.tagsAndKeywords, t.language, t.charLimit, !!t.allowEmojis, t.fullNames].join('|') : '');
export async function currentSig() { return sigOf(await activeTopic()); }
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
// caption, rồi keyword, rồi hashtag ở dòng dưới cùng
export function compose(caption, tags) {
  const toks = (tags || '').split(/\s+/).filter(Boolean);
  const kw = toks.filter((x) => !x.startsWith('#')).join(' '), ht = toks.filter((x) => x.startsWith('#')).join(' ');
  return [caption, [kw, ht].filter(Boolean).join('\n')].filter(Boolean).join('\n\n').slice(0, 280);
}
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

const running = new Set();
// chạy nền, không chặn người dùng; mỗi bài chỉ tạo một lần
export function ensureCaptions(messageId) {
  if (running.has(messageId)) return;
  running.add(messageId);
  (async () => {
    const t = await activeTopic();
    if (!t) return;
    const sig = sigOf(t);
    if (db.prepare('SELECT 1 FROM trend_captions WHERE message_id = ? AND sig = ? LIMIT 1').get(messageId, sig)) return; // đã có caption của chủ đề hiện tại
    db.prepare('DELETE FROM trend_captions WHERE message_id = ?').run(messageId); // caption của chủ đề cũ: bỏ, tạo lại theo chủ đề mới
    const found = [];
    for (let round = 0; round < 2 && found.length < CAPTIONS_PER_LINK; round++) {
      const batch = await Promise.allSettled(Array.from({ length: 3 }, () => oneCaption(t)));
      for (const b of batch) if (b.status === 'fulfilled' && b.value && !found.some((x) => norm(x) === norm(b.value))) found.push(b.value);
    }
    const texts = found.length ? found.map((c) => compose(c, t.tagsAndKeywords)) : [compose('', t.tagsAndKeywords)]; // dịch vụ lỗi: ít nhất vẫn có keyword và hashtag
    if (!texts[0]) return;
    const ins = db.prepare('INSERT INTO trend_captions (message_id, text, created_at, sig) VALUES (?,?,?,?)');
    for (const x of texts) ins.run(messageId, x, now(), sig);
  })().catch(() => {}).finally(() => running.delete(messageId));
}

// Trả cả bộ caption và vị trí bắt đầu riêng của từng người (tránh hàng loạt bình luận giống hệt nhau);
// máy khách xoay vòng qua bộ này mỗi lần người dùng bấm, nên mỗi lần bấm ra một caption khác.
export function captionFor(userId, messageId, sig) {
  const rows = db.prepare('SELECT text FROM trend_captions WHERE message_id = ? AND sig = ? ORDER BY id').all(messageId, sig);
  return rows.length ? { texts: rows.map((r) => r.text), start: (userId + messageId) % rows.length, n: rows.length } : null;
}
// tạo thêm caption mới cho bài (người dùng sắp bấm hết vòng); bỏ caption trùng, tối đa CAPTIONS_MAX_PER_LINK
const growing = new Set();
export function moreCaptions(messageId) {
  if (running.has(messageId) || growing.has(messageId)) return;
  growing.add(messageId);
  (async () => {
    const t = await activeTopic();
    if (!t) return;
    const sig = sigOf(t);
    const have = db.prepare('SELECT text FROM trend_captions WHERE message_id = ? AND sig = ?').all(messageId, sig).map((r) => r.text);
    if (!have.length || have.length >= CAPTIONS_MAX_PER_LINK) return;
    const batch = await Promise.allSettled(Array.from({ length: 3 }, () => oneCaption(t)));
    const ins = db.prepare('INSERT INTO trend_captions (message_id, text, created_at, sig) VALUES (?,?,?,?)');
    for (const b of batch) {
      if (b.status !== 'fulfilled' || !b.value) continue;
      const text = compose(b.value, t.tagsAndKeywords);
      if (have.some((x) => norm(x) === norm(text)) || have.length >= CAPTIONS_MAX_PER_LINK) continue;
      ins.run(messageId, text, now(), sig); have.push(text);
    }
  })().catch(() => {}).finally(() => growing.delete(messageId));
}
export function recordUse(userId, messageId) {
  db.prepare('INSERT OR IGNORE INTO trend_caption_use (user_id, message_id, at) VALUES (?,?,?)').run(userId, messageId, now());
}
export function purgeOrphanCaptions() {
  db.prepare('DELETE FROM trend_captions WHERE message_id NOT IN (SELECT id FROM messages)').run();
}
