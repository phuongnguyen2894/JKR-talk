// Ghi nhận lượt xem trang và thời gian hoạt động (gửi cho server để Admin hệ thống xem thống kê), cả khách và người dùng đăng ký.
// Không gửi nội dung tin nhắn; chỉ gửi tên trang, nhóm đang xem (số id), số giây có thao tác và mã khách ẩn danh ngẫu nhiên.
import { S, api } from './core.js';

const TICK = 15_000; // gửi 15 giây một lần khi đang xem và có thao tác
const IDLE_MS = 180_000; // quá 3 phút không thao tác thì không tính thời gian
let started = false, lastAct = Date.now(), cur = null;

// mã khách ẩn danh: chuỗi ngẫu nhiên lưu trên trình duyệt, không gắn với thông tin cá nhân
function visitorId() {
  try {
    let v = localStorage.getItem('jkr_vid');
    if (!v || !/^[A-Za-z0-9_-]{16,40}$/.test(v)) {
      const a = new Uint8Array(18);
      (crypto || window.crypto).getRandomValues(a);
      v = [...a].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 30);
      localStorage.setItem('jkr_vid', v);
    }
    return v;
  } catch { return 'anon' + Math.random().toString(36).slice(2, 12).padEnd(14, '0'); }
}

function where() {
  const [path] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = '', arg = ''] = path.split('/');
  const id = /^\d+$/.test(arg) ? Number(arg) : 0;
  if (name === 'g') return { page: 'chat', target: id }; // khách xem một nhóm công khai
  if (!name) return { page: S.token ? 'chat' : 'news', target: 0 };
  return { page: name, target: name === 'chat' ? id : 0 };
}
const send = (event, extra = {}) => {
  const body = { event, page: cur.page, target: cur.target, vid: visitorId(), ...extra };
  if (S.token && S.me) return api('POST', '/track', body).catch(() => {});
  return fetch('/api/public/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
};

function view() {
  const w = where();
  if (cur && cur.page === w.page && cur.target === w.target && cur.auth === !!S.me) return;
  cur = { ...w, auth: !!S.me };
  send('view');
}
function tick() {
  if (!cur || document.visibilityState !== 'visible') return;
  if (Date.now() - lastAct > IDLE_MS) return;
  send('ping', { seconds: TICK / 1000 });
}

// khởi động (một lần); gọi lại sau khi đăng nhập thì gửi lại lượt xem hiện tại kèm mã khách để nối với tài khoản
export function startTracking() {
  if (started) { cur = null; view(); return; }
  started = true;
  const touch = () => { lastAct = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel']) window.addEventListener(ev, touch, { passive: true, capture: true });
  window.addEventListener('hashchange', view);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { lastAct = Date.now(); view(); } });
  view();
  setInterval(tick, TICK);
}
