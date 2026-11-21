// Trang "Cấp bậc của tôi", hộp chúc mừng lên cấp
import { $, S, api, esc, icon, avatar, actions, fail, openModal, closeModal, lvBadge, coinIcon, LEVEL_NAMES } from './core.js';

const fmt = (n) => Number(n).toLocaleString('vi-VN');
const EARN = [
  ['Gửi tin nhắn trong nhóm', '+1', 'Tin từ 5 ký tự, không trùng tin liền trước, không tính tin nhắn riêng'],
  ['Tin của bạn được thả tim', '+2 mỗi tim', 'Tối đa 50 xu mỗi ngày, mỗi người tối đa 3 tim mỗi ngày'],
  ['Có người trả lời tin của bạn', '+2', 'Tối đa 20 xu mỗi ngày'],
  ['Vào app mỗi ngày', '+3', ''],
  ['Đủ chuỗi 7 ngày vào app liên tiếp', '+20', 'Mỗi lần đủ 7 ngày'],
  ['Chủ đề của bạn được duyệt', '+30', ''],
  ['Chủ đề của bạn được Admin đặt nổi bật', '+50', ''],
  ['Bấm vào link X trong Đẩy trend', '+1', 'Chỉ link x.com hoặc twitter.com, mỗi link tính một lần'],
];
const PRIVS = [
  [2, 'Khung avatar tím'],
  [3, 'Gửi link vào Đẩy trend'],
  [4, 'Tạo chủ đề không cần duyệt, đăng bài lên Bản tin'],
];

const condRow = (c) => `<div class="lvl-row">${c.key === 'coins' ? `<span class="lvl-coin">${coinIcon(22)}</span>` : `<span class="${c.ok ? 'lvl-ok' : 'lvl-no'}">${c.ok ? '✓' : '·'}</span>`}${esc(c.label)}<span class="chip">${c.title ? (c.ok ? 'Đã đạt' : 'Chưa đạt') : `${fmt(c.have)} / ${fmt(c.need)}`}</span></div>`;

export async function renderLevel(view) {
  const { level: st } = await api('GET', '/me/level');
  S.me = { ...S.me, level: st.level, coins: st.coins };
  const u = S.me;
  const next = st.next;
  let progress = '';
  if (st.tasks) {
    const done = st.tasks.filter((t) => t.have >= t.need).length;
    progress = `<section class="card col">
      <div class="row between"><div class="h2" style="margin:0">Bắt đầu thăng cấp</div><span class="small muted">${done} / ${st.tasks.length} việc</span></div>
      <div class="lvl-bar" role="img" aria-label="Đã xong ${done} trên ${st.tasks.length} việc"><i style="width:${Math.round((done / st.tasks.length) * 100)}%"></i></div>
      ${st.tasks.map((t) => `<div class="lvl-row"><span class="${t.have >= t.need ? 'lvl-ok' : 'lvl-no'}">${t.have >= t.need ? '✓' : '·'}</span>${esc(t.label)}${t.need > 1 ? `<span class="chip">${t.have} / ${t.need}</span>` : ''}</div>`).join('')}
      ${st.tasks.some((t) => t.key === 'push' && t.have < 1) ? '<button class="btn" data-act="lvl-push">Bật thông báo đẩy</button>' : ''}
      <p class="small muted">Xong ${st.tasks.length} việc là bạn nhận ngay cấp 1 <b>Tím Mầm Non</b> và mở huy hiệu. Xu tím bạn đã kiếm từ trước vẫn được giữ nguyên.</p>
    </section>`;
  } else if (next) {
    const coins = next.conditions.find((c) => c.key === 'coins');
    const pct = Math.min(100, Math.round((coins.have / coins.need) * 100));
    progress = `<section class="card col">
      <div class="row between"><div class="h2" style="margin:0">Điều kiện lên ${esc(next.name)}</div><span class="small muted">cấp ${next.level}</span></div>
      <div class="lvl-bar" role="img" aria-label="Đã được ${pct} phần trăm số xu tím cần có"><i style="width:${pct}%"></i></div>
      ${next.conditions.map(condRow).join('')}
      <p class="small muted">Cần đủ tất cả điều kiện để lên cấp ${next.level}.</p>
    </section>`;
  } else {
    progress = `<section class="card col"><div class="h2" style="margin:0">Cấp cao nhất</div><p class="small muted">Bạn đã đạt cấp cao nhất <b>${esc(LEVEL_NAMES[5])}</b>. Cảm ơn bạn đã gắn bó với cộng đồng.</p></section>`;
  }
  const levels = st.levels || [];
  view.innerHTML = `<div class="page"><div class="page-inner">
    <h1>Cấp bậc của tôi</h1>
    <section class="card col lvl-hero" style="padding-top:20px">
      ${avatar({ ...u, level: u.level }, 'lg')}
      <div class="row" style="justify-content:center;margin-top:6px"><b style="font-size:20px">${esc(u.displayName)}</b>${lvBadge(u.level, 26)}</div>
      ${u.level ? `<div class="small" style="font-weight:600;color:var(--accent)">${esc(LEVEL_NAMES[u.level])} · Cấp ${u.level}</div>` : ''}
      <div class="row" style="justify-content:center;font-weight:700;font-size:22px">${coinIcon(26)}${fmt(st.coins)}<span class="small muted" style="font-weight:400">xu tím đã kiếm</span></div>
      ${st.streak ? `<div class="small muted">Chuỗi ${st.streak} ngày liên tiếp</div>` : ''}
    </section>
    ${progress}
    <section class="card col"><div class="h2" style="margin:0">Số liệu</div>
      <div class="row" style="gap:8px">${[[st.stats.messages, 'Tin nhắn'], [st.stats.hearts, 'Tim nhận'], [st.stats.topics, 'Chủ đề']].map(([n, l]) => `<div class="card" style="flex:1;text-align:center;padding:10px 4px"><b style="font-size:20px">${fmt(n)}</b><div class="tiny muted">${l}</div></div>`).join('')}</div>
    </section>
    <section class="card col"><div class="h2" style="margin:0">Đặc quyền theo cấp</div>
      ${PRIVS.map(([lv, t]) => `<div class="lvl-row"><span class="lvl-pv${u.level >= lv ? '' : ' locked'}">${lvBadge(lv, 22)}</span><span ${u.level >= lv ? '' : 'class="muted"'}>${esc(t)}</span></div>`).join('')}
      <p class="tiny muted">Mọi tính năng chat, thả tim, trả lời, kết bạn đều dùng được ngay từ đầu, cấp chỉ thêm đặc quyền mới.</p>
    </section>
    <section class="card col"><div class="h2" style="margin:0">Các cấp</div>
      ${levels.map((l) => `<div class="lvl-row">${lvBadge(l.level, 22)}<b>${esc(l.name)}</b><span class="chip">${l.min ? `từ ${fmt(l.min)} xu` : 'sau 3 việc khởi đầu'}</span></div>`).join('')}
    </section>
    ${st.titles.length ? `<section class="card col"><div class="h2" style="margin:0">Danh hiệu</div><div class="row wrap">${st.titles.map((t) => `<span class="pill">${esc({ bot_trend: 'Bot trend', bot_trend_cao_thu: 'Bot trend cao thủ', bot_trend_huyen_thoai: 'Bot trend huyền thoại' }[t] || t)}</span>`).join('')}</div></section>` : ''}
    <section class="card col"><div class="h2" style="margin:0">Cách kiếm xu tím</div>
      ${EARN.map(([t, x, note]) => `<div class="lvl-row"><span class="earn-t">${esc(t)}${note ? `<br><span class="tiny muted">${esc(note)}</span>` : ''}</span><span class="chip" style="display:inline-flex;align-items:center;gap:4px">${coinIcon(14)}${esc(x)}</span></div>`).join('')}
      <p class="tiny muted">Xu tím chỉ tăng, không bị trừ. Có đủ xu và đủ điều kiện của cấp thì tự lên cấp.</p>
    </section>
  </div></div>`;
}

actions['lvl-push'] = async () => {
  const { enablePush } = await import('./push.js');
  if (typeof enablePush === 'function') { await enablePush(); renderLevel($('#view')); }
};

// Hộp chúc mừng khi vừa lên cấp (server trả levelUp trong GET /me)
export function showLevelUp(lu) {
  if (!lu) return;
  const m = openModal(`<div class="col lvl-modal"><div class="small" style="font-weight:700;letter-spacing:.06em;color:var(--accent)">${lu.level === 1 ? 'CHÀO MỪNG BẠN' : 'CHÚC MỪNG BẠN ĐÃ LÊN CẤP'}</div>
    <div class="lvl-big">${lvBadge(lu.level, 56)}</div>
    <h2 style="margin:0">${esc(lu.name)}</h2>
    <p class="muted" style="margin:0">${lu.level === 1 ? 'Bạn đã xong các việc khởi đầu. Xu tím bạn đã kiếm từ trước vẫn được giữ nguyên.' : `Bạn đạt ${fmt(lu.coins)} xu tím. Cảm ơn bạn đã gắn bó với cộng đồng.`}</p>
    ${lu.perk && lu.level > 1 ? `<div class="card col" style="text-align:left"><div class="tiny" style="font-weight:700;color:var(--accent)">ĐẶC QUYỀN MỚI</div><div class="small">${esc(lu.perk)}</div></div>` : ''}
    <div class="btns"><a class="btn" href="#/level" data-close>Xem cấp bậc</a><button class="btn primary" data-close>Tuyệt vời</button></div></div>`);
  m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  api('POST', '/me/level-seen').catch(() => {});
}
