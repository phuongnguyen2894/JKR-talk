import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { db, now, homeGroupIds, nameKey, trendGroupId } from './db.js';
import { provinceById } from './geo.js';
import { api, UPLOAD_DIR } from './routes.js';
import { startRetention } from './retention.js';
import { hub, hashPassword, getUser, addMember } from './lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === 'production';

// ---- tài khoản admin hệ thống (seed) -----------------------------------------
function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || (PROD ? '' : 'admin@jkr.local')).toLowerCase();
  const password = process.env.ADMIN_PASSWORD || (PROD ? '' : 'admin12345');
  if (!email || !password) return;
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return;
  const province = provinceById(1);
  const r = db
    .prepare(`INSERT INTO users (email, pass_hash, display_name, name_key, province_id, role, verified, created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(email, hashPassword(password), 'Admin JKR', nameKey('Admin JKR'), province.id, 'admin', 1, now());
  for (const gid of [...homeGroupIds(province), trendGroupId()]) addMember(gid, Number(r.lastInsertRowid));
  console.log(PROD ? `[seed] đã tạo admin: ${email}` : `[seed] admin: ${email} / ${password}`);
}
seedAdmin();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ws: wss:; script-src 'self'; frame-ancestors 'none'"
  );
  next();
});
app.get('/healthz', (_req, res) => {
  try { db.prepare('SELECT 1').get(); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
});
app.use('/api', api);
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '365d', immutable: true, index: false }));
app.use(express.static(path.join(__dirname, '..', 'public'), { setHeaders: (res, f) => { if (/.(js|html|css)$/.test(f)) res.setHeader('Cache-Control', 'no-cache'); } }));

const server = http.createServer(app);

// ---- WebSocket realtime --------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  const s = token && db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  const u = s && getUser(s.user_id);
  if (!u || u.status !== 'active') return ws.close(4001, 'unauthorized');
  hub.add(u.id, ws);
  ws.on('close', () => hub.remove(u.id, ws));
  ws.on('error', () => {});
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) ws.terminate();
    else {
      ws.isAlive = false;
      ws.ping();
    }
  }
}, 30_000).unref();

// ---- sao lưu SQLite hằng ngày (giữ 7 bản gần nhất) + tắt máy an toàn ----------------
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'data', 'backups');
function backup() {
  if (process.env.DB_FILE === ':memory:') return;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `jkr-${new Date().toISOString().slice(0, 10)}.db`);
    fs.rmSync(file, { force: true });
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const old = fs.readdirSync(BACKUP_DIR).filter((f) => /^jkr-.*\.db$/.test(f)).sort().slice(0, -7);
    for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
    console.log('[backup] ok', file);
  } catch (e) { console.error('[backup] lỗi', e.message); }
}
startRetention(UPLOAD_DIR);
if (process.env.NODE_ENV === 'production') {
  setTimeout(backup, 60_000).unref();
  setInterval(backup, 24 * 3600_000).unref();
}
function shutdown() {
  console.log('Đang tắt máy chủ…');
  for (const ws of wss.clients) ws.close(1001, 'server restart');
  server.close(() => { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {} process.exit(0); });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => console.log(`JKR talks chạy tại http://localhost:${PORT}`));
