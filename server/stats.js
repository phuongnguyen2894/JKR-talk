// Thống kê sử dụng cho Admin hệ thống: người dùng hoạt động mỗi ngày (DAU), trang xem nhiều, thời gian trên app, giờ cao điểm.
// Tính cả khách (chưa đăng nhập, nhận diện bằng mã ẩn danh ngẫu nhiên trên trình duyệt) và người dùng đã đăng ký.
// Không lưu nội dung, chỉ lưu tên trang, nhóm đang xem và số giây hoạt động.
import { db } from './db.js';

export const dayOf = (t = Date.now()) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10); // ngày theo giờ Việt Nam
const hourOf = (t = Date.now()) => new Date(t + 7 * 3600_000).getUTCHours(); // giờ theo giờ Việt Nam
export const PAGES = ['chat', 'news', 'hot', 'level', 'shop', 'titles', 'settings', 'admin', 'topics', 'discover', 'friends', 'tools', 'bugs', 'welcome', 'join', 'explore', 'login', 'register', 'muaythai', 'games', 'pets'];
export const VID_RE = /^[A-Za-z0-9_-]{16,40}$/;
const KEEP_DAYS = 400;

// actor: { kind: 'u', id: <id người dùng> } hoặc { kind: 'g', id: <mã khách ẩn danh> }
// event 'view': mở một trang; 'ping': thêm số giây hoạt động (gửi mỗi 15 giây khi đang xem và có thao tác)
// Số người đang xem (cả khách): giữ trong bộ nhớ, không ghi DB. Mỗi người (tài khoản hoặc mã khách) tính một lần ở trang xem gần nhất;
// quá LIVE_MS không có tin báo (đóng tab, ẩn tab, lâu không thao tác) thì không tính nữa.
const LIVE_MS = 45_000;
const live = new Map(); // `${kind}:${id}` -> { page, target, at }
const markLive = (actor, page, target) => live.set(`${actor.kind}:${actor.id}`, { page, target, at: Date.now() });
// Chỉ trả những trang/nhóm có từ 2 người trở lên (không lộ trang chỉ có một người)
export function liveCounts() {
  const t = Date.now(), pages = {}, chat = {};
  for (const [k, v] of live) {
    if (t - v.at > LIVE_MS) { live.delete(k); continue; }
    pages[v.page] = (pages[v.page] || 0) + 1;
    if (v.page === 'chat' && v.target) chat[v.target] = (chat[v.target] || 0) + 1;
  }
  const keep = (o) => Object.fromEntries(Object.entries(o).filter(([, n]) => n >= 2));
  return { pages: keep(pages), chat: keep(chat) };
}

export function track(actor, { page, target, event, seconds }) {
  const pg = PAGES.includes(page) ? page : 'other';
  const tg = pg === 'chat' && Number.isInteger(Number(target)) && Number(target) > 0 ? Number(target) : 0;
  if (pg !== 'other' && (event === 'view' || event === 'ping')) markLive(actor, pg, tg);
  const day = dayOf();
  const views = event === 'view' ? 1 : 0;
  const secs = event === 'ping' ? Math.max(0, Math.min(30, Math.round(Number(seconds) || 0))) : 0;
  if (!views && !secs) return false;
  const id = String(actor.id);
  db.prepare('INSERT INTO stat_actors (day, kind, actor, views, seconds) VALUES (?,?,?,?,?) ON CONFLICT(day, kind, actor) DO UPDATE SET views = views + excluded.views, seconds = seconds + excluded.seconds').run(day, actor.kind, id, views, secs);
  db.prepare('INSERT INTO stat_pages (day, kind, page, target, views, seconds) VALUES (?,?,?,?,?,?) ON CONFLICT(day, kind, page, target) DO UPDATE SET views = views + excluded.views, seconds = seconds + excluded.seconds').run(day, actor.kind, pg, tg, views, secs);
  db.prepare('INSERT INTO stat_hours (day, hour, kind, actor, views, seconds) VALUES (?,?,?,?,?,?) ON CONFLICT(day, hour, kind, actor) DO UPDATE SET views = views + excluded.views, seconds = seconds + excluded.seconds').run(day, hourOf(), actor.kind, id, views, secs);
  return true;
}
// Người dùng đăng nhập từ một trình duyệt từng là khách: nối mã khách với tài khoản để không đếm một người hai lần trong cùng một ngày
export function linkVisitor(vid, uid) {
  if (!VID_RE.test(String(vid || ''))) return;
  db.prepare('INSERT INTO visitor_links (vid, user_id, linked_at) VALUES (?,?,?) ON CONFLICT(vid) DO UPDATE SET user_id = excluded.user_id, linked_at = excluded.linked_at').run(vid, uid, Date.now());
}

const dowOf = (d) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = Thứ hai

// Báo cáo cho `days` ngày gần nhất (tính cả hôm nay), chia theo đối tượng: all (cả hai), users (đã đăng ký), guests (khách)
export function statsReport(days = 30) {
  days = Math.min(Math.max(Number(days) || 30, 1), 365);
  const list = [];
  for (let i = days - 1; i >= 0; i--) list.push(dayOf(Date.now() - i * 86400_000));
  const from = list[0];
  const links = new Map(db.prepare('SELECT vid, user_id FROM visitor_links').all().map((r) => [r.vid, String(r.user_id)]));
  const actorRows = db.prepare('SELECT day, kind, actor, views, seconds FROM stat_actors WHERE day >= ?').all(from);
  const hourRows = db.prepare('SELECT day, hour, kind, actor, views FROM stat_hours WHERE day >= ?').all(from);
  const activeUsers = new Set(actorRows.filter((r) => r.kind === 'u').map((r) => `${r.day}|${r.actor}`));
  // khách đã đăng nhập thành tài khoản hoạt động cùng ngày: gộp vào tài khoản đó
  const resolve = (r) => {
    if (r.kind === 'g') { const u = links.get(r.actor); if (u && activeUsers.has(`${r.day}|${u}`)) return { kind: 'u', actor: u }; }
    return { kind: r.kind, actor: r.actor };
  };
  const merged = new Map();
  for (const r of actorRows) {
    const k = resolve(r), key = `${r.day}|${k.kind}|${k.actor}`;
    const m = merged.get(key) || { day: r.day, kind: k.kind, actor: k.actor, views: 0, seconds: 0 };
    m.views += r.views; m.seconds += r.seconds; merged.set(key, m);
  }
  const mergedHours = new Map();
  for (const r of hourRows) {
    const k = resolve(r), key = `${r.day}|${r.hour}|${k.kind}|${k.actor}`;
    const m = mergedHours.get(key) || { day: r.day, hour: r.hour, kind: k.kind, views: 0 };
    m.views += r.views; mergedHours.set(key, m);
  }
  const signups = {};
  for (const u of db.prepare("SELECT created_at FROM users WHERE status != 'deleted' AND created_at >= ?").all(Date.now() - (days + 1) * 86400_000)) {
    const d = dayOf(u.created_at); signups[d] = (signups[d] || 0) + 1;
  }
  const totalUsers = db.prepare("SELECT COUNT(*) c FROM users WHERE status = 'active'").get().c;
  const occ = Array(7).fill(0);
  for (const d of list) occ[dowOf(d)]++;

  const build = (kinds) => {
    const sel = (r) => kinds.includes(r.kind);
    const actors = [...merged.values()].filter(sel);
    const by = {};
    for (const r of actors) { const b = (by[r.day] ||= { users: 0, seconds: 0, views: 0 }); b.users++; b.seconds += r.seconds; b.views += r.views; }
    const series = list.map((d) => ({
      day: d, dau: by[d]?.users || 0, seconds: by[d]?.seconds || 0, views: by[d]?.views || 0,
      newUsers: kinds.includes('u') ? signups[d] || 0 : 0,
      avgSeconds: by[d]?.users ? Math.round(by[d].seconds / by[d].users) : 0,
    }));
    const win = (n) => { const start = dayOf(Date.now() - (n - 1) * 86400_000); return new Set(actors.filter((r) => r.day >= start).map((r) => `${r.kind}|${r.actor}`)).size; };
    const last7 = series.slice(-7);
    const userDays = series.reduce((n, s) => n + s.dau, 0);
    const totalSeconds = series.reduce((n, s) => n + s.seconds, 0);
    const viewsTotal = series.reduce((n, s) => n + s.views, 0);
    const ph = kinds.map(() => '?').join(',');
    const pages = db.prepare(`SELECT page, SUM(views) views, SUM(seconds) seconds FROM stat_pages WHERE day >= ? AND kind IN (${ph}) GROUP BY page ORDER BY views DESC, seconds DESC`).all(from, ...kinds);
    const groups = db.prepare(`SELECT target, SUM(views) views, SUM(seconds) seconds FROM stat_pages WHERE day >= ? AND kind IN (${ph}) AND page = 'chat' AND target > 0 GROUP BY target ORDER BY views DESC, seconds DESC LIMIT 15`).all(from, ...kinds)
      .map((r) => { const g = db.prepare('SELECT name, type FROM groups WHERE id = ?').get(r.target); return { id: r.target, name: g?.name || `Nhóm ${r.target}`, type: g?.type || null, views: r.views, seconds: r.seconds }; });
    // heatmap giờ cao điểm: 7 thứ x 24 giờ; giá trị = trung bình mỗi ngày
    const hmU = Array.from({ length: 7 }, () => Array(24).fill(0));
    const hmV = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const h of mergedHours.values()) if (kinds.includes(h.kind)) { const w = dowOf(h.day); hmU[w][h.hour] += 1; hmV[w][h.hour] += h.views; }
    const norm = (g) => g.map((row, w) => row.map((v) => (occ[w] ? Math.round((v / occ[w]) * 100) / 100 : 0)));
    const heatmap = { users: norm(hmU), views: norm(hmV) };
    let peak = null;
    heatmap.users.forEach((row, w) => row.forEach((v, h) => { if (v > 0 && (!peak || v > peak.value)) peak = { weekday: w, hour: h, value: v }; }));
    return {
      summary: {
        dauToday: series[series.length - 1].dau,
        dauYesterday: series.length > 1 ? series[series.length - 2].dau : 0,
        dauAvg7: last7.length ? Math.round((last7.reduce((n, s) => n + s.dau, 0) / last7.length) * 10) / 10 : 0,
        wau: win(7), mau: win(30),
        avgSecondsPerUserDay: userDays ? Math.round(totalSeconds / userDays) : 0,
        totalSeconds,
        viewsToday: series[series.length - 1].views, viewsTotal,
        avgViewsPerUserDay: userDays ? Math.round((viewsTotal / userDays) * 10) / 10 : 0,
      },
      series, pages, groups, heatmap, peak,
    };
  };
  const trackedSince = db.prepare('SELECT MIN(day) d FROM stat_actors').get().d || null;
  const segments = { all: build(['u', 'g']), users: build(['u']), guests: build(['g']) };
  // đăng ký mới: hôm nay / hôm qua, 7 ngày và 30 ngày gần nhất (so với kỳ liền trước); không phụ thuộc khoảng xem
  const since = Date.now() - 60 * 86400_000;
  const dayCount = {};
  for (const u of db.prepare("SELECT created_at FROM users WHERE status != 'deleted' AND created_at >= ?").all(since)) { const d = dayOf(u.created_at); dayCount[d] = (dayCount[d] || 0) + 1; }
  const sumDays = (from, n) => { let t = 0; for (let i = from; i < from + n; i++) t += dayCount[dayOf(Date.now() - i * 86400_000)] || 0; return t; };
  const signupStats = {
    today: sumDays(0, 1), yesterday: sumDays(1, 1),
    week: sumDays(0, 7), prevWeek: sumDays(7, 7),
    month: sumDays(0, 30), prevMonth: sumDays(30, 30),
    total: db.prepare("SELECT COUNT(*) c FROM users WHERE status != 'deleted'").get().c,
  };
  return {
    days, from, today: list[list.length - 1], totalUsers, trackedSince, segments, signups: signupStats,
    // giữ các trường cũ (số liệu tổng hợp) để bản giao diện cũ đang mở chưa tải lại vẫn hiển thị được
    ...segments.all, summary: { ...segments.all.summary, totalUsers, trackedSince },
  };
}

export function purgeStats() {
  const cut = dayOf(Date.now() - KEEP_DAYS * 86400_000);
  for (const t of ['stat_actors', 'stat_pages', 'stat_hours']) db.prepare(`DELETE FROM ${t} WHERE day < ?`).run(cut);
  db.prepare('DELETE FROM visitor_links WHERE linked_at < ?').run(Date.now() - KEEP_DAYS * 86400_000);
}
