// Ghi nhận lượt xem trang và thời gian hoạt động (gửi cho server để Admin hệ thống xem thống kê).
// Không gửi nội dung tin nhắn; chỉ gửi tên trang, nhóm đang xem (số id) và số giây có thao tác.
import { S, api } from './core.js';

const TICK = 15_000; // gửi 15 giây một lần khi đang xem và có thao tác
const IDLE_MS = 180_000; // quá 3 phút không thao tác thì không tính thời gian
let started = false, lastAct = Date.now(), cur = null;

function where() {
  const [path] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = '', arg = ''] = path.split('/');
  return { page: name || 'chat', target: name === 'chat' && /^\d+$/.test(arg) ? Number(arg) : 0 };
}
const send = (event, extra = {}) => api('POST', '/track', { event, page: cur.page, target: cur.target, ...extra }).catch(() => {});

function view() {
  if (!S.token || !S.me) return;
  const w = where();
  if (cur && cur.page === w.page && cur.target === w.target) return;
  cur = w;
  send('view');
}
function tick() {
  if (!S.token || !S.me || !cur || document.visibilityState !== 'visible') return;
  if (Date.now() - lastAct > IDLE_MS) return;
  send('ping', { seconds: TICK / 1000 });
}

export function startTracking() {
  if (started) return;
  started = true;
  const touch = () => { lastAct = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel']) window.addEventListener(ev, touch, { passive: true, capture: true });
  window.addEventListener('hashchange', view);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { lastAct = Date.now(); view(); } });
  view();
  setInterval(tick, TICK);
}
