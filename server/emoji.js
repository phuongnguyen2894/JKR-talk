// Emoji tùy chỉnh do Admin thêm và danh sách react hợp lệ
import fs from 'node:fs';
import path from 'node:path';
import { db, now } from './db.js';

export const EMOJI_LIMIT = 100;
export const EMOJI_MAX_BYTES = 256 * 1024;
export const EMOJI_MAX_PER_MESSAGE = 20;
export const REACTION_MAX_PER_USER = 3; // mỗi người tối đa 3 react khác nhau trên một tin
export const NAME_RE = /^[a-z0-9_]{2,32}$/;
const TOMBSTONE_MS = 30 * 24 * 3600_000; // tên đã xóa được giữ 30 ngày

// Emoji mặc định (Unicode) cũng dùng được để react
export const UNICODE_REACTIONS = ['😀', '😂', '🥹', '😍', '🥰', '😭', '😘', '🤣', '👍', '🙏', '👏', '🔥', '💜', '💚', '💙', '💖', '✨', '🎉', '😎', '🤗', '😅', '🥺', '😢', '😡', '🤔', '🙌', '💪', '🌸', '⭐', '🎬', '📺', '🍿'];

export const activeEmoji = () => db.prepare('SELECT * FROM custom_emoji WHERE deleted_at IS NULL ORDER BY id').all();
export const visibleEmoji = () => db.prepare('SELECT id, name, url FROM custom_emoji WHERE deleted_at IS NULL AND hidden = 0 ORDER BY id').all();

// Số lần dùng: số tin nhắn có chứa :tên:
export const usageOf = (name) => db.prepare("SELECT COUNT(*) c FROM messages WHERE deleted = 0 AND instr(body, ?) > 0").get(`:${name}:`).c;

// Kiểm tra khóa react: 'heart' | 'u:<emoji mặc định>' | 'e:<id emoji tùy chỉnh>'. Trả về { ok, error }
export function checkReactionKey(key, { forNew = true } = {}) {
  if (key === 'heart') return { ok: true };
  if (typeof key !== 'string') return { ok: false, error: 'Emoji không hợp lệ' };
  if (key.startsWith('u:')) return UNICODE_REACTIONS.includes(key.slice(2)) ? { ok: true } : { ok: false, error: 'Emoji không hợp lệ' };
  if (key.startsWith('e:')) {
    const e = db.prepare('SELECT * FROM custom_emoji WHERE id = ? AND deleted_at IS NULL').get(Number(key.slice(2)));
    if (!e) return { ok: false, error: 'Emoji này không còn' };
    if (forNew && e.hidden) return { ok: false, error: 'Emoji này đã bị ẩn' };
    return { ok: true };
  }
  return { ok: false, error: 'Emoji không hợp lệ' };
}

// Số emoji tùy chỉnh (đang có) xuất hiện trong nội dung tin
export function countCustomTokens(body) {
  const names = new Set(activeEmoji().map((e) => e.name));
  let n = 0;
  for (const m of String(body || '').matchAll(/:([a-z0-9_]{2,32}):/g)) if (names.has(m[1])) n++;
  return n;
}

// Kiểm tra tệp ảnh đã tải lên cho emoji: PNG, GIF hoặc WebP, tối đa 256 KB
export function checkEmojiFile(url, uploadDir) {
  if (typeof url !== 'string' || !/^\/uploads\/[A-Za-z0-9_-]+\.(png|jpg|gif|webp)$/.test(url)) return 'Emoji chỉ nhận ảnh PNG, JPG, GIF hoặc WebP';
  try {
    const size = fs.statSync(path.join(uploadDir, path.basename(url))).size;
    if (size > EMOJI_MAX_BYTES) return `Ảnh nặng ${Math.ceil(size / 1024)} KB, vượt mức 256 KB`;
  } catch { return 'Không tìm thấy ảnh đã tải lên'; }
  return null;
}

// Kiểm tra tên mới: đúng định dạng, chưa có, không nằm trong 30 ngày giữ tên của emoji đã xóa
export function checkEmojiName(name, exceptId = 0) {
  if (!NAME_RE.test(name)) return 'Tên chỉ gồm chữ thường không dấu, số và dấu gạch dưới, 2 đến 32 ký tự';
  const same = db.prepare('SELECT id, deleted_at FROM custom_emoji WHERE name = ? AND id != ?').all(name, exceptId);
  if (same.some((r) => r.deleted_at === null)) return `Tên :${name}: đã có. Hãy chọn tên khác.`;
  if (same.some((r) => r.deleted_at > now() - TOMBSTONE_MS)) return `Tên :${name}: vừa được xóa gần đây, hãy chọn tên khác.`;
  return null;
}

export function addEmoji(name, url, adminId) {
  const r = db.prepare('INSERT INTO custom_emoji (name, url, created_by, created_at) VALUES (?,?,?,?)').run(name, url, adminId, now());
  return Number(r.lastInsertRowid);
}

// Thông tin hình của một khóa react 'e:<id>' (để hiển thị cả emoji đã ẩn); khóa khác trả về null
export function emojiMeta(key) {
  if (typeof key !== 'string' || !key.startsWith('e:')) return null;
  const e = db.prepare('SELECT name, url FROM custom_emoji WHERE id = ? AND deleted_at IS NULL').get(Number(key.slice(2)));
  return e ? { name: e.name, url: e.url } : null;
}
