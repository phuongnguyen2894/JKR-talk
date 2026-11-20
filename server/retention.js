// Chỉ giữ tin nhắn trong RETENTION_DAYS ngày gần nhất (mặc định 38): xóa tin cũ hơn,
// tim của các tin đó (ON DELETE CASCADE) và các tệp ảnh không còn được dùng ở đâu.
import fs from 'node:fs';
import path from 'node:path';
import { db, now } from './db.js';

export const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 38;
const DAY = 24 * 3600 * 1000;

const fileOf = (url) => (typeof url === 'string' && /^\/uploads\/[A-Za-z0-9_-]+\.(png|jpg|gif|webp)$/.test(url) ? url : null);

function previewImage(json) {
  try { return fileOf(JSON.parse(json || 'null')?.image); } catch { return null; }
}

// tập ảnh còn được tham chiếu ở bất kỳ đâu
function referencedFiles() {
  const used = new Set();
  const add = (u) => { const f = fileOf(u); if (f) used.add(f); };
  for (const [table, col] of [['users', 'avatar_url'], ['groups', 'avatar_url'], ['messages', 'image_url'], ['reports', 'snapshot_image'], ['news', 'image_url'], ['bug_reports', 'screenshot_url']]) {
    for (const r of db.prepare(`SELECT ${col} AS u FROM ${table} WHERE ${col} IS NOT NULL`).all()) add(r.u);
  }
  for (const r of db.prepare('SELECT images FROM news WHERE images IS NOT NULL').all()) {
    try { for (const u of JSON.parse(r.images)) add(u); } catch { /* bỏ qua */ }
  }
  for (const r of db.prepare('SELECT preview FROM messages WHERE preview IS NOT NULL AND preview != \'0\'').all()) {
    const f = previewImage(r.preview);
    if (f) used.add(f);
  }
  return used;
}

export function purgeOldMessages(uploadDir, days = RETENTION_DAYS) {
  const cutoff = now() - days * DAY;
  const old = db.prepare('SELECT id, image_url, preview FROM messages WHERE created_at < ?').all(cutoff);
  if (!old.length) return { messages: 0, files: 0 };
  const candidates = new Set();
  for (const m of old) {
    const a = fileOf(m.image_url), b = previewImage(m.preview);
    if (a) candidates.add(a);
    if (b) candidates.add(b);
  }
  db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoff);
  let files = 0;
  if (candidates.size) {
    const used = referencedFiles();
    for (const url of candidates) {
      if (used.has(url)) continue;
      try { fs.unlinkSync(path.join(uploadDir, path.basename(url))); files++; } catch { /* đã mất */ }
    }
  }
  return { messages: old.length, files };
}

export function startRetention(uploadDir) {
  const run = () => {
    try {
      const r = purgeOldMessages(uploadDir);
      if (r.messages) console.log(`[retention] đã xóa ${r.messages} tin nhắn cũ hơn ${RETENTION_DAYS} ngày, ${r.files} ảnh`);
    } catch (e) { console.error('[retention] lỗi', e.message); }
  };
  setTimeout(run, 30_000).unref();
  setInterval(run, 6 * 3600_000).unref();
}
