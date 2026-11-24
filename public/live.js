// Số mắt xem (người đang xem, cả khách) của từng trang: CHỈ ADMIN thấy. Chỉ hiện khi có từ 2 người trở lên; chỉ là con số, không lộ ai.
// Máy chủ tính từ các tin báo lượt xem (xem server/stats.js, /admin/live); trang hỏi lại mỗi 20 giây khi đang mở.
import { icon, api, S } from './core.js';
const isAdmin = () => S.me?.role === 'admin';
let live = { pages: {}, chat: {} };
let whereFn = null, started = false;

const count = () => {
  const w = whereFn?.();
  if (!w) return 0;
  return (w.page === 'chat' && w.target ? live.chat[w.target] : live.pages[w.page]) || 0;
};

// gắn / cập nhật / gỡ nhãn "đang xem" ở tiêu đề trang (chat: cạnh tên nhóm, vì dòng phụ bên dưới bị cắt bằng dấu … trên màn hình nhỏ)
function paint() {
  const n = isAdmin() ? count() : 0;
  const old = document.querySelector('.live-pill');
  if (n < 2) { old?.remove(); return; }
  // tiêu đề đang hiển thị (bỏ qua h1 bị ẩn như tiêu đề danh sách nhóm trên máy tính)
  const visible = (el) => el && el.getClientRects().length > 0;
  const host = [...document.querySelectorAll('#view h1, #root h1')].find(visible);
  if (!host) { old?.remove(); return; }
  const text = `${n} đang xem`;
  if (old && old.parentElement === host) { if (old.dataset.n !== String(n)) { old.dataset.n = String(n); old.innerHTML = `${icon('eye', 14)}${text}`; } return; }
  old?.remove();
  const el = document.createElement('span');
  el.className = 'live-pill';
  el.setAttribute('role', 'status');
  el.dataset.n = String(n);
  el.innerHTML = `${icon('eye', 14)}${text}`;
  host.appendChild(el);
}

async function poll() {
  if (document.visibilityState !== 'visible' || !isAdmin()) return;
  try { live = await api('GET', '/admin/live'); paint(); } catch { /* lỗi mạng hoặc không đủ quyền: giữ số cũ */ }
}

export function startLive(where) {
  whereFn = where;
  if (started) return;
  started = true;
  poll();
  setInterval(poll, 20_000);
  setInterval(paint, 2000); // trang vẽ lại thì gắn lại nhãn
  window.addEventListener('hashchange', () => { setTimeout(paint, 500); setTimeout(poll, 1500); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
}
