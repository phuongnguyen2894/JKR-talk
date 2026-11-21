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

let days = 30;
export async function renderStats(body, d = days) {
  days = d;
  const r = await api('GET', `/admin/stats?days=${days}`);
  const s = r.summary;
  const delta = s.dauToday - s.dauYesterday;
  const share = s.totalUsers ? Math.round((s.dauToday / s.totalUsers) * 100) : 0;
  const totalViews = r.pages.reduce((n, p) => n + p.views, 0) || 1;
  const tile = (v, l, sub = '') => `<div class="stat-tile"><b>${v}</b><span class="small">${l}</span>${sub ? `<span class="tiny muted">${sub}</span>` : ''}</div>`;
  body.innerHTML = `<div class="pillnav" role="group" aria-label="Khoảng thời gian">${[7, 30, 90].map((n) => `<button data-sd="${n}" aria-pressed="${days === n}">${n} ngày</button>`).join('')}</div>
    <div class="stat-grid">
      ${tile(fmt(s.dauToday), 'Người dùng hoạt động hôm nay (DAU)', `${delta === 0 ? 'bằng' : delta > 0 ? `tăng ${delta}` : `giảm ${-delta}`} so với hôm qua · ${share}% tổng số`)}
      ${tile(fmt(s.dauAvg7), 'DAU trung bình 7 ngày')}
      ${tile(fmt(s.wau), 'Hoạt động trong 7 ngày (WAU)')}
      ${tile(fmt(s.mau), 'Hoạt động trong 30 ngày (MAU)', `trên ${fmt(s.totalUsers)} tài khoản`)}
      ${tile(fmtDur(s.avgSecondsPerUserDay), 'Thời gian trên app, trung bình mỗi người mỗi ngày')}
      ${tile(fmtDur(s.totalSeconds), `Tổng thời gian trên app (${days} ngày)`)}
    </div>
    <section class="card col"><div class="h2" style="margin:0">Người dùng hoạt động mỗi ngày</div>${bars(r.series, 'dau', { label: 'Người dùng hoạt động mỗi ngày' })}</section>
    <section class="card col"><div class="h2" style="margin:0">Thời gian trên app (trung bình mỗi người dùng hoạt động)</div>${bars(r.series, 'avgSeconds', { label: 'Thời gian trung bình mỗi người mỗi ngày', fmtVal: fmtDur })}</section>
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
  $$('[data-sd]', body).forEach((b) => (b.onclick = () => renderStats(body, Number(b.dataset.sd)).catch(fail)));
}
