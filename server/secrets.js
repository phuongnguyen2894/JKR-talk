// Lưu bí mật (khoá API) trong DB ở dạng đã mã hoá AES-256-GCM. Khoá mã hoá nằm ở FILE RIÊNG cạnh DB (.secret_key, quyền 600) hoặc lấy từ biến
// môi trường APP_SECRET, nên một bản sao lưu chỉ có DB thì không lộ khoá. Khoá API không bao giờ được trả lại cho trình duyệt.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, now } from './db.js';

let master = null;
function masterKey() {
  if (master) return master;
  const dbFile = process.env.DB_FILE || path.join(process.cwd(), 'data', 'jkr.db');
  if (process.env.APP_SECRET) master = crypto.createHash('sha256').update(process.env.APP_SECRET).digest();
  else if (dbFile === ':memory:') master = crypto.randomBytes(32); // test: khoá chỉ tồn tại trong tiến trình
  else {
    const file = path.join(path.dirname(dbFile), '.secret_key');
    try { master = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex'); } catch { master = null; }
    if (!master || master.length !== 32) { master = crypto.randomBytes(32); fs.writeFileSync(file, master.toString('hex'), { mode: 0o600 }); }
  }
  return master;
}

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}
export function decrypt(blob) {
  try {
    const [v, iv, tag, ct] = String(blob).split(':');
    if (v !== 'v1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  } catch { return null; } // khoá mã hoá đổi hoặc dữ liệu hỏng: coi như chưa có
}

const row = (k) => db.prepare('SELECT value FROM app_settings WHERE key = ?').get(k)?.value;
const put = (k, v) => db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
const del = (k) => db.prepare('DELETE FROM app_settings WHERE key = ?').run(k);

// Cấu hình Gemini: ưu tiên khoá Admin nhập trong giao diện, rồi mới tới biến môi trường GEMINI_API_KEY
export function geminiConfig() {
  const stored = row('gemini_api_key');
  const fromDb = stored ? decrypt(stored) : null;
  const key = fromDb || process.env.GEMINI_API_KEY || '';
  return { key, source: fromDb ? 'admin' : process.env.GEMINI_API_KEY ? 'env' : null, model: row('gemini_model') || process.env.GEMINI_MODEL || 'gemini-2.5-flash', customModel: row('gemini_model') || null };
}
export function saveGemini({ apiKey, model }) {
  if (apiKey !== undefined) put('gemini_api_key', encrypt(apiKey));
  if (model !== undefined) { if (model) put('gemini_model', model); else del('gemini_model'); }
  put('gemini_updated_at', String(now()));
}
export function clearGeminiKey() { del('gemini_api_key'); put('gemini_updated_at', String(now())); }
// Chỉ để hiển thị trạng thái: 4 ký tự cuối, không đủ để dùng lại khoá
export const maskKey = (k) => (k ? `••••${k.slice(-4)}` : '');
export const geminiUpdatedAt = () => Number(row('gemini_updated_at')) || null;
