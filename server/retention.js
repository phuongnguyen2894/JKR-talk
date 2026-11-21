// Chỉ giữ tin nhắn trong RETENTION_DAYS ngày gần nhất (mặc định 38): xóa tin cũ hơn,
// tim của các tin đó (ON DELETE CASCADE) và các tệp ảnh không còn được dùng ở đâu.
import fs from 'node:fs';
import path from 'node:path';
import { db, now, trendGroupId } from './db.js';
import { hub, memberIds } from './lib.js';
import { linksIn } from './levels.js';
import { purgeStats } from './stats.js';

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
  for (const r of db.prepare('SELECT images FROM news WHERE images IS NOT NULL UNION ALL SELECT images FROM messages WHERE images IS NOT NULL').all()) {
    try { for (const u of JSON.parse(r.images)) add(u); } catch { /* bỏ qua */ }
  }
  for (const r of db.prepare('SELECT preview FROM messages WHERE preview IS NOT NULL AND preview != \'0\'').all()) {
    const f = previewImage(r.preview);
    if (f) used.add(f);
  }
  return used;
}

// Xóa các tệp ảnh của những tin vừa bị xóa nếu không còn nơi nào dùng
function dropFiles(rows, uploadDir) {
  const candidates = new Set();
  for (const m of rows) {
    const a = fileOf(m.image_url), b = previewImage(m.preview);
    try { for (const u of JSON.parse(m.images || '[]')) { const f = fileOf(u); if (f) candidates.add(f); } } catch { /* bỏ qua */ }
    if (a) candidates.add(a);
    if (b) candidates.add(b);
  }
  let files = 0;
  if (candidates.size) {
    const used = referencedFiles();
    for (const url of candidates) {
      if (used.has(url)) continue;
      try { fs.unlinkSync(path.join(uploadDir, path.basename(url))); files++; } catch { /* đã mất */ }
    }
  }
  return files;
}

export function purgeOldMessages(uploadDir, days = RETENTION_DAYS) {
  const cutoff = now() - days * DAY;
  const old = db.prepare('SELECT id, image_url, images, preview FROM messages WHERE created_at < ?').all(cutoff);
  if (!old.length) return { messages: 0, files: 0 };
  db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoff);
  db.prepare("DELETE FROM comments WHERE kind = 'msg' AND target_id NOT IN (SELECT id FROM messages)").run();
  return { messages: old.length, files: dropFiles(old, uploadDir) };
}

// Đẩy trend: mọi tin (có link hoặc không) chỉ tồn tại TREND_LINK_HOURS giờ (mặc định 38), quá hạn thì xóa và báo cho các máy đang mở
export function purgeTrendLinks(uploadDir, hours = Number(process.env.TREND_LINK_HOURS || 38)) {
  const gid = trendGroupId();
  const cutoff = now() - hours * 3600_000;
  const old = db.prepare("SELECT id, image_url, images, preview FROM messages WHERE group_id = ? AND created_at < ?").all(gid, cutoff);
  if (!old.length) return { messages: 0, files: 0 };
  const del = db.prepare('DELETE FROM messages WHERE id = ?');
  for (const m of old) del.run(m.id);
  db.prepare("DELETE FROM comments WHERE kind = 'msg' AND target_id NOT IN (SELECT id FROM messages)").run();
  const members = memberIds(gid);
  for (const m of old) hub.sendMany(members, { type: 'message_deleted', groupId: gid, messageId: m.id });
  return { messages: old.length, files: dropFiles(old, uploadDir) };
}

// Đẩy trend: xóa các tin có link trùng với tin đăng trước đó (giữ tin sớm nhất), dùng để dọn các tin trùng có từ trước khi có quy tắc chặn trùng
export function dedupeTrendLinks(uploadDir) {
  const gid = trendGroupId();
  const rows = db.prepare("SELECT id, body, image_url, images, preview FROM messages WHERE group_id = ? AND deleted = 0 AND body LIKE '%http%' ORDER BY id").all(gid);
  const seen = new Set();
  const dup = [];
  for (const m of rows) {
    const keys = linksIn(m.body);
    if (!keys.length) continue;
    if (keys.some((k) => seen.has(k))) dup.push(m);
    else keys.forEach((k) => seen.add(k));
  }
  if (!dup.length) return { messages: 0, files: 0 };
  const del = db.prepare('DELETE FROM messages WHERE id = ?');
  for (const m of dup) del.run(m.id);
  db.prepare("DELETE FROM comments WHERE kind = 'msg' AND target_id NOT IN (SELECT id FROM messages)").run();
  const members = memberIds(gid);
  for (const m of dup) hub.sendMany(members, { type: 'message_deleted', groupId: gid, messageId: m.id });
  return { messages: dup.length, files: dropFiles(dup, uploadDir) };
}

export function startRetention(uploadDir) {
  const run = () => {
    try {
      purgeStats();
      const r = purgeOldMessages(uploadDir);
      if (r.messages) console.log(`[retention] đã xóa ${r.messages} tin nhắn cũ hơn ${RETENTION_DAYS} ngày, ${r.files} ảnh`);
    } catch (e) { console.error('[retention] lỗi', e.message); }
  };
  setTimeout(run, 30_000).unref();
  setInterval(run, 6 * 3600_000).unref();
  const runTrend = () => {
    try {
      const r = purgeTrendLinks(uploadDir);
      if (r.messages) console.log(`[trend] đã xóa ${r.messages} tin quá hạn trong Đẩy trend`);
      const d = dedupeTrendLinks(uploadDir);
      if (d.messages) console.log(`[trend] đã xóa ${d.messages} tin có link trùng trong Đẩy trend`);
    } catch (e) { console.error('[trend] lỗi', e.message); }
  };
  setTimeout(runTrend, 20_000).unref();
  setInterval(runTrend, 10 * 60_000).unref(); // kiểm tra mỗi 10 phút
}
