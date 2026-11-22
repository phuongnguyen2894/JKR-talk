// Trang Thống kê cho Admin hệ thống: DAU, trang xem nhiều nhất, thời gian trên app
import { $, $$, S, api, esc, fail } from './core.js';

const PAGE_NAMES = {
  chat: 'Chat nhóm', news: 'Bản tin', hot: 'Chủ đề nóng', level: 'Thăng cấp', shop: 'Cửa hàng xu tím', titles: 'Danh hiệu', settings: 'Cài đặt',
  admin: 'Quản trị', topics: 'Tất cả chủ đề', discover: 'Khám phá nhóm', friends: 'Bạn bè', tools: 'Công cụ', bugs: 'Danh sách lỗi',
  welcome: 'Chào thành viên mới', join: 'Tham gia bằng link', other: 'Khác',
};
const fmt = (n) => Number(n).toLocaleString('vi-VN');
export function fmtDur(s) {
  s = Math.round(s || 0);
  if (s < 60) return `${s} giây`;
  if (s < 3600) return `${Math.floor(s / 60)} phút${s % 60 ? ` ${s % 60} giây` : ''}`;
  return `${Math.floor(s / 3600)} giờ${Math.floor((s % 3600) / 60) ? ` ${Math.floor((s % 3600) / 60)} phút` : ''}`;
}
const dm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

// biểu đồ cột đơn giản bằng SVG (có chú thích văn bản thay thế và số liệu chi tiết bên dưới)
function bars(series, key, { label, fmtVal = fmt }) {
  const W = 600, H = 150, PAD = 22, n = series.length;
  const max = Math.max(1, ...series.map((s) => s[key]));
  const bw = (W - PAD * 2) / n;
  const rects = series.map((s, i) => {
    const h = Math.round((s[key] / max) * (H - 30));
    return `<rect x="${(PAD + i * bw + bw * 0.15).toFixed(1)}" y="${H - 18 - h}" width="${(bw * 0.7).toFixed(1)}" height="${h}" rx="2" fill="var(--accent)"><title>${dm(s.day)}: ${fmtVal(s[key])}</title></rect>`;
  }).join('');
  const tick = (i) => `<text x="${(PAD + i * bw + bw / 2).toFixed(1)}" y="${H - 3}" text-anchor="middle" font-size="11" fill="var(--muted)">${dm(series[i].day)}</text>`;
  const marks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map(tick).join('');
  const total = series.reduce((x, s) => x + s[key], 0);
  return `<svg viewBox="0 0 ${W} ${H}" class="stat-chart" role="img" aria-label="${esc(label)}: cao nhất ${fmtVal(max)}, trung bình ${fmtVal(Math.round(total / n))} mỗi ngày">
    <text x="${PAD}" y="12" font-size="11" fill="var(--muted)">${fmtVal(max)}</text><line x1="${PAD}" y1="16" x2="${W - PAD}" y2="16" stroke="var(--line)" stroke-dasharray="3 4"/>${rects}${marks}</svg>`;
}

// biểu đồ cột chồng: người dùng đăng ký (tím) và khách (hồng) mỗi ngày
function stacked(us, gs) {
  const W = 600, H = 150, PAD = 22, n = us.length;
  const max = Math.max(1, ...us.map((u, i) => u.dau + gs[i].dau));
  const bw = (W - PAD * 2) / n;
  const rects = us.map((u, i) => {
    const hu = Math.round((u.dau / max) * (H - 30)), hg = Math.round((gs[i].dau / max) * (H - 30)), x = (PAD + i * bw + bw * 0.15).toFixed(1), w = (bw * 0.7).toFixed(1);
    return `<rect x="${x}" y="${H - 18 - hu}" width="${w}" height="${hu}" fill="var(--accent)"><title>${dm(u.day)}: ${u.dau} đăng ký</title></rect><rect x="${x}" y="${H - 18 - hu - hg}" width="${w}" height="${hg}" fill="var(--guest)"><title>${dm(u.day)}: ${gs[i].dau} khách</title></rect>`;
  }).join('');
  const tick = (i) => `<text x="${(PAD + i * bw + bw / 2).toFixed(1)}" y="${H - 3}" text-anchor="middle" font-size="11" fill="var(--muted)">${dm(us[i].day)}</text>`;
  const marks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map(tick).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="stat-chart" role="img" aria-label="Người dùng đăng ký và khách hoạt động mỗi ngày, cao nhất ${max} người"><text x="${PAD}" y="12" font-size="11" fill="var(--muted)">${max}</text><line x1="${PAD}" y1="16" x2="${W - PAD}" y2="16" stroke="var(--line)" stroke-dasharray="3 4"/>${rects}${marks}</svg>`;
}
const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WD_LONG = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
// heatmap giờ cao điểm: 7 dòng (thứ) x 24 cột (giờ), màu đậm hơn = nhiều hơn
function heatmap(grid, unit) {
  const CW = 24, CH = 24, LX = 30, TY = 18;
  const max = Math.max(0, ...grid.flat());
  const cells = grid.map((row, w) => row.map((v, h) => {
    const op = max ? (v / max) : 0;
    return `<rect x="${LX + h * CW}" y="${TY + w * CH}" width="${CW - 2}" height="${CH - 2}" rx="3" fill="${v ? 'var(--accent)' : 'var(--soft)'}" fill-opacity="${v ? (0.15 + op * 0.85).toFixed(2) : 1}"><title>${WD_LONG[w]}, ${String(h).padStart(2, '0')}:00 - ${String(h + 1).padStart(2, '0')}:00: ${fmt(v)} ${unit}</title></rect>`;
  }).join('')).join('');
  const hours = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => `<text x="${LX + h * CW + CW / 2 - 1}" y="12" text-anchor="middle" font-size="10" fill="var(--muted)">${h}h</text>`).join('');
  const wds = WD.map((d, w) => `<text x="${LX - 6}" y="${TY + w * CH + 16}" text-anchor="end" font-size="11" fill="var(--muted)">${d}</text>`).join('');
  return `<svg viewBox="0 0 ${LX + 24 * CW} ${TY + 7 * CH}" class="stat-chart" role="img" aria-label="Bản đồ nhiệt theo giờ, cao nhất ${fmt(max)} ${unit}">${hours}${wds}${cells}</svg>
    <div class="row" style="gap:6px;justify-content:flex-end"><span class="tiny muted">Ít</span>${[0.15, 0.35, 0.6, 0.8, 1].map((o) => `<i class="hm-key" style="opacity:${o}"></i>`).join('')}<span class="tiny muted">Nhiều</span></div>`;
}

let days = 30, hmMetric = 'users', seg = 'all';
const SEG_NAMES = { all: 'Tất cả', users: 'Đã đăng ký', guests: 'Khách' };
export async function renderStats(body, d = days) {
  days = d;
  const raw = await api('GET', `/admin/stats?days=${days}`);
  const r = { ...raw.segments[seg], totalUsers: raw.totalUsers, trackedSince: raw.trackedSince };
  const s = { ...r.summary, totalUsers: raw.totalUsers, trackedSince: raw.trackedSince };
  const { all, users, guests } = raw.segments;
  const delta = s.dauToday - s.dauYesterday;
  const share = s.totalUsers ? Math.round((s.dauToday / s.totalUsers) * 100) : 0;
  const who = seg === 'guests' ? 'Khách' : seg === 'users' ? 'Người dùng đã đăng ký' : 'Khách và người dùng';
  const totalViews = r.pages.reduce((n, p) => n + p.views, 0) || 1;
  const tile = (v, l, sub = '') => `<div class="stat-tile"><b>${v}</b><span class="small">${l}</span>${sub ? `<span class="tiny muted">${sub}</span>` : ''}</div>`;
  const cmp = (label, fn) => `<div class="stat-row cmp" role="row"><span role="cell">${label}</span><b role="cell">${fn(all.summary)}</b><span role="cell">${fn(users.summary)}</span><span role="cell">${fn(guests.summary)}</span></div>`;
  const comparison = `<section class="card col"><div class="h2" style="margin:0">So sánh khách và người dùng đã đăng ký</div>
      <div class="stat-table" role="table" aria-label="So sánh khách và người dùng đã đăng ký">
        <div class="stat-row cmp head" role="row"><span role="columnheader"></span><span role="columnheader">Tất cả</span><span role="columnheader">Đăng ký</span><span role="columnheader">Khách</span></div>
        ${cmp('DAU hôm nay', (x) => fmt(x.dauToday))}${cmp('WAU (7 ngày)', (x) => fmt(x.wau))}${cmp('MAU (30 ngày)', (x) => fmt(x.mau))}
        ${cmp('Lượt xem hôm nay', (x) => fmt(x.viewsToday))}${cmp(`Lượt xem (${days} ngày)`, (x) => fmt(x.viewsTotal))}
        ${cmp('Lượt xem/người/ngày', (x) => String(x.avgViewsPerUserDay).replace('.', ','))}${cmp('Thời gian/người/ngày', (x) => fmtDur(x.avgSecondsPerUserDay))}
      </div>
      <div class="h2" style="margin:8px 0 0">Người dùng hoạt động mỗi ngày: đăng ký và khách</div>${stacked(users.series, guests.series)}
      <div class="row" style="gap:12px;justify-content:center"><span class="small"><i class="hm-key" style="opacity:1"></i> Đăng ký</span><span class="small"><i class="hm-key" style="opacity:1;background:var(--guest)"></i> Khách</span></div>
      <p class="tiny muted">Khách đăng nhập hoặc đăng ký trong cùng ngày chỉ được tính một lần, ở nhóm đăng ký. Cột "Tất cả" là số người khác nhau, không cộng trùng.</p></section>`;
  const sg = raw.signups || { today: 0, yesterday: 0, week: 0, prevWeek: 0, month: 0, prevMonth: 0, total: 0 };
  const vs = (a, b, label) => `${a === b ? 'bằng' : a > b ? `tăng ${a - b}` : `giảm ${b - a}`} so với ${label}`;
  const signupBlock = `<section class="card col"><div class="h2" style="margin:0">Người dùng đăng ký mới</div>
      <div class="stat-grid">
        ${tile(fmt(sg.today), 'Hôm nay', vs(sg.today, sg.yesterday, 'hôm qua'))}
        ${tile(fmt(sg.week), '7 ngày gần nhất', vs(sg.week, sg.prevWeek, '7 ngày trước đó'))}
        ${tile(fmt(sg.month), '30 ngày gần nhất', vs(sg.month, sg.prevMonth, '30 ngày trước đó'))}
        ${tile(fmt(sg.total), 'Tổng số tài khoản')}
      </div>
      <div class="h2" style="margin:8px 0 0">Đăng ký mới mỗi ngày</div>${bars(all.series, 'newUsers', { label: 'Đăng ký mới mỗi ngày' })}</section>`;
  body.innerHTML = `${signupBlock}${comparison}
    <div class="pillnav" role="group" aria-label="Xem số liệu của">${Object.entries(SEG_NAMES).map(([k, n]) => `<button data-seg="${k}" aria-pressed="${seg === k}">${n}</button>`).join('')}</div>
    <div class="pillnav" role="group" aria-label="Khoảng thời gian">${[7, 30, 90].map((n) => `<button data-sd="${n}" aria-pressed="${days === n}">${n} ngày</button>`).join('')}</div>
    <div class="stat-grid">
      ${tile(fmt(s.dauToday), `${who} hoạt động hôm nay (DAU)`, `${delta === 0 ? 'bằng' : delta > 0 ? `tăng ${delta}` : `giảm ${-delta}`} so với hôm qua${seg === 'users' ? ` · ${share}% tổng số tài khoản` : ''}`)}
      ${tile(fmt(s.dauAvg7), 'DAU trung bình 7 ngày')}
      ${tile(fmt(s.wau), 'Hoạt động trong 7 ngày (WAU)')}
      ${tile(fmt(s.mau), 'Hoạt động trong 30 ngày (MAU)', seg === 'users' ? `trên ${fmt(s.totalUsers)} tài khoản` : '')}
      ${tile(fmtDur(s.avgSecondsPerUserDay), 'Thời gian trên app, trung bình mỗi người mỗi ngày')}
      ${tile(fmtDur(s.totalSeconds), `Tổng thời gian trên app (${days} ngày)`)}
      ${tile(fmt(s.viewsToday), 'Lượt xem trang hôm nay', `${fmt(s.viewsTotal)} lượt trong ${days} ngày · ${String(s.avgViewsPerUserDay).replace('.', ',')} lượt/người/ngày`)}
    </div>
    <section class="card col"><div class="h2" style="margin:0">${esc(SEG_NAMES[seg])}: hoạt động mỗi ngày</div>${bars(r.series, 'dau', { label: 'Người dùng hoạt động mỗi ngày' })}</section>
    <section class="card col"><div class="h2" style="margin:0">Lượt xem trang mỗi ngày</div>${bars(r.series, 'views', { label: 'Lượt xem trang mỗi ngày' })}</section>
    <section class="card col"><div class="h2" style="margin:0">Thời gian trên app (trung bình mỗi người dùng hoạt động)</div>${bars(r.series, 'avgSeconds', { label: 'Thời gian trung bình mỗi người mỗi ngày', fmtVal: fmtDur })}</section>
    <section class="card col"><div class="row between wrap"><div class="h2" style="margin:0">Heatmap giờ cao điểm</div><div class="pillnav" role="group" aria-label="Chỉ số heatmap" style="margin:0"><button data-hm="users" aria-pressed="${hmMetric === 'users'}">Người dùng</button><button data-hm="views" aria-pressed="${hmMetric === 'views'}">Lượt xem</button></div></div>
      ${heatmap(r.heatmap[hmMetric], hmMetric === 'users' ? 'người hoạt động' : 'lượt xem')}
      <div class="small muted">${r.peak ? `Giờ cao điểm: <b>${WD_LONG[r.peak.weekday]}, ${String(r.peak.hour).padStart(2, '0')}:00 đến ${String(r.peak.hour + 1).padStart(2, '0')}:00</b> (trung bình ${String(r.peak.value).replace('.', ',')} người hoạt động).` : 'Chưa đủ dữ liệu để xác định giờ cao điểm.'} Giá trị là trung bình mỗi ngày trong khoảng đã chọn.</div></section>
    <section class="card col"><div class="h2" style="margin:0">Trang được xem nhiều nhất</div>
      <div class="stat-table" role="table" aria-label="Trang được xem nhiều nhất">
        <div class="stat-row head" role="row"><span role="columnheader">Trang</span><span role="columnheader">Lượt xem</span><span role="columnheader">Tỷ lệ</span><span role="columnheader">Thời gian</span></div>
        ${r.pages.map((p) => `<div class="stat-row" role="row"><span role="cell">${esc(PAGE_NAMES[p.page] || p.page)}</span><b role="cell">${fmt(p.views)}</b><span role="cell">${Math.round((p.views / totalViews) * 100)}%</span><span role="cell">${fmtDur(p.seconds)}</span></div>`).join('') || '<p class="small muted" style="margin:0">Chưa có dữ liệu.</p>'}
      </div></section>
    <section class="card col"><div class="h2" style="margin:0">Nhóm và chủ đề xem nhiều nhất</div>
      <div class="stat-table" role="table" aria-label="Nhóm và chủ đề xem nhiều nhất">
        <div class="stat-row head" role="row"><span role="columnheader">Nhóm</span><span role="columnheader">Lượt xem</span><span role="columnheader"></span><span role="columnheader">Thời gian</span></div>
        ${r.groups.map((g) => `<div class="stat-row" role="row"><span role="cell">${esc(g.name)}</span><b role="cell">${fmt(g.views)}</b><span role="cell"></span><span role="cell">${fmtDur(g.seconds)}</span></div>`).join('') || '<p class="small muted" style="margin:0">Chưa có dữ liệu.</p>'}
      </div></section>
    <details class="card col"><summary>Số liệu theo ngày</summary>
      <div class="stat-table" role="table" aria-label="Số liệu theo ngày">
        <div class="stat-row head" role="row"><span role="columnheader">Ngày</span><span role="columnheader">DAU</span><span role="columnheader">Mới</span><span role="columnheader">TB/người</span></div>
        ${[...r.series].reverse().map((x) => `<div class="stat-row" role="row"><span role="cell">${dm(x.day)}</span><b role="cell">${fmt(x.dau)}</b><span role="cell">${fmt(x.newUsers)}</span><span role="cell">${fmtDur(x.avgSeconds)}</span></div>`).join('')}
      </div></details>
    <p class="tiny muted">Thống kê tính từ ${r.summary.trackedSince ? esc(r.summary.trackedSince) : 'khi bật tính năng'}, chỉ gồm người đã đăng nhập (chưa tính khách). Thời gian chỉ tính khi bạn đang mở app và có thao tác, ngừng tính sau 3 phút không thao tác. Giờ theo múi giờ Việt Nam.</p>`;
  $$('[data-seg]', body).forEach((b) => (b.onclick = () => { seg = b.dataset.seg; renderStats(body, days).catch(fail); }));
  $$('[data-sd]', body).forEach((b) => (b.onclick = () => renderStats(body, Number(b.dataset.sd)).catch(fail)));
  $$('[data-hm]', body).forEach((b) => (b.onclick = () => { hmMetric = b.dataset.hm; renderStats(body, days).catch(fail); }));
}
