// Thống kê sử dụng cho Admin hệ thống: người dùng hoạt động mỗi ngày (DAU), trang xem nhiều, thời gian trên app.
// Chỉ đếm người đã đăng nhập; không lưu nội dung, chỉ lưu tên trang, nhóm đang xem và số giây hoạt động.
import { db } from './db.js';

export const dayOf = (t = Date.now()) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10); // ngày theo giờ Việt Nam
const hourOf = (t = Date.now()) => new Date(t + 7 * 3600_000).getUTCHours(); // giờ theo giờ Việt Nam
export const PAGES = ['chat', 'news', 'hot', 'level', 'shop', 'titles', 'settings', 'admin', 'topics', 'discover', 'friends', 'tools', 'bugs', 'welcome', 'join'];
const KEEP_DAYS = 400;

// event 'view': người dùng mở một trang; 'ping': thêm số giây hoạt động (khách hàng gửi mỗi 15 giây khi đang xem và có thao tác)
export function track(uid, { page, target, event, seconds }) {
  const pg = PAGES.includes(page) ? page : 'other';
  const tg = pg === 'chat' && Number.isInteger(Number(target)) && Number(target) > 0 ? Number(target) : 0;
  const day = dayOf();
  const views = event === 'view' ? 1 : 0;
  const secs = event === 'ping' ? Math.max(0, Math.min(30, Math.round(Number(seconds) || 0))) : 0;
  if (!views && !secs) return false;
  db.prepare('INSERT INTO daily_users (day, user_id, views, seconds) VALUES (?,?,?,?) ON CONFLICT(day, user_id) DO UPDATE SET views = views + excluded.views, seconds = seconds + excluded.seconds').run(day, uid, views, secs);
  db.prepare('INSERT INTO daily_pages (day, page, target, views, seconds) VALUES (?,?,?,?,?) ON CONFLICT(day, page, target) DO UPDATE SET views = views + excluded.views, seconds = seconds + excluded.seconds').run(day, pg, tg, views, secs);
  db.prepare('INSERT INTO hourly_users (day, hour, user_id, views, seconds) VALUES (?,?,?,?,?) ON CONFLICT(day, hour, user_id) DO UPDATE SET views = views + excluded.views, seconds = seconds + excluded.seconds').run(day, hourOf(), uid, views, secs);
  return true;
}

// Báo cáo cho `days` ngày gần nhất (tính cả hôm nay)
export function statsReport(days = 30) {
  days = Math.min(Math.max(Number(days) || 30, 1), 365);
  const list = [];
  for (let i = days - 1; i >= 0; i--) list.push(dayOf(Date.now() - i * 86400_000));
  const from = list[0];
  const rows = db.prepare('SELECT day, COUNT(*) users, COALESCE(SUM(seconds),0) seconds, COALESCE(SUM(views),0) views FROM daily_users WHERE day >= ? GROUP BY day').all(from);
  const by = Object.fromEntries(rows.map((r) => [r.day, r]));
  const newBy = {};
  for (const u of db.prepare("SELECT created_at FROM users WHERE status != 'deleted' AND created_at >= ?").all(Date.now() - (days + 1) * 86400_000)) {
    const d = dayOf(u.created_at); newBy[d] = (newBy[d] || 0) + 1;
  }
  const series = list.map((d) => ({ day: d, dau: by[d]?.users || 0, seconds: by[d]?.seconds || 0, views: by[d]?.views || 0, newUsers: newBy[d] || 0, avgSeconds: by[d]?.users ? Math.round(by[d].seconds / by[d].users) : 0 }));
  const today = list[list.length - 1];
  const win = (n) => db.prepare('SELECT COUNT(DISTINCT user_id) c FROM daily_users WHERE day >= ?').get(dayOf(Date.now() - (n - 1) * 86400_000)).c;
  const last7 = series.slice(-7);
  const userDays = series.reduce((n, s) => n + s.dau, 0);
  const totalSeconds = series.reduce((n, s) => n + s.seconds, 0);
  const pages = db.prepare("SELECT page, SUM(views) views, SUM(seconds) seconds FROM daily_pages WHERE day >= ? GROUP BY page ORDER BY views DESC, seconds DESC").all(from);
  const groups = db.prepare("SELECT target, SUM(views) views, SUM(seconds) seconds FROM daily_pages WHERE day >= ? AND page = 'chat' AND target > 0 GROUP BY target ORDER BY views DESC, seconds DESC LIMIT 15").all(from)
    .map((r) => { const g = db.prepare('SELECT name, type FROM groups WHERE id = ?').get(r.target); return { id: r.target, name: g?.name || `Nhóm ${r.target}`, type: g?.type || null, views: r.views, seconds: r.seconds }; });
  // heatmap giờ cao điểm: 7 ngày trong tuần (T2 đến CN) x 24 giờ; giá trị = trung bình mỗi ngày (số người hoạt động, lượt xem)
  const dowOf = (d) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = Thứ hai
  const occ = Array(7).fill(0);
  for (const d of list) occ[dowOf(d)]++;
  const hmUsers = Array.from({ length: 7 }, () => Array(24).fill(0));
  const hmViews = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const h of db.prepare('SELECT day, hour, views FROM hourly_users WHERE day >= ?').all(from)) {
    const w = dowOf(h.day);
    hmUsers[w][h.hour] += 1;
    hmViews[w][h.hour] += h.views;
  }
  const norm = (g) => g.map((row, w) => row.map((v) => (occ[w] ? Math.round((v / occ[w]) * 100) / 100 : 0)));
  const heatmap = { users: norm(hmUsers), views: norm(hmViews) };
  let peak = null;
  heatmap.users.forEach((row, w) => row.forEach((v, h) => { if (v > 0 && (!peak || v > peak.value)) peak = { weekday: w, hour: h, value: v }; }));
  return {
    days, from, today, heatmap, peak,
    summary: {
      dauToday: series[series.length - 1].dau,
      dauYesterday: series.length > 1 ? series[series.length - 2].dau : 0,
      dauAvg7: last7.length ? Math.round((last7.reduce((n, s) => n + s.dau, 0) / last7.length) * 10) / 10 : 0,
      wau: win(7), mau: win(30),
      totalUsers: db.prepare("SELECT COUNT(*) c FROM users WHERE status = 'active'").get().c,
      avgSecondsPerUserDay: userDays ? Math.round(totalSeconds / userDays) : 0,
      totalSeconds,
      viewsToday: series[series.length - 1].views,
      viewsTotal: series.reduce((n, s) => n + s.views, 0),
      avgViewsPerUserDay: userDays ? Math.round((series.reduce((n, s) => n + s.views, 0) / userDays) * 10) / 10 : 0,
      trackedSince: db.prepare('SELECT MIN(day) d FROM daily_users').get().d || null,
    },
    series, pages, groups,
  };
}

export function purgeStats() {
  const cut = dayOf(Date.now() - KEEP_DAYS * 86400_000);
  db.prepare('DELETE FROM daily_users WHERE day < ?').run(cut);
  db.prepare('DELETE FROM daily_pages WHERE day < ?').run(cut);
  db.prepare('DELETE FROM hourly_users WHERE day < ?').run(cut);
}
