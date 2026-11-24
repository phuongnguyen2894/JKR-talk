// Số người đang xem (cả khách) cho từng trang. Chỉ hiện khi có từ 2 người trở lên; chỉ là con số, không lộ ai đang xem.
// Máy chủ tính từ các tin báo lượt xem (xem server/stats.js); trang hỏi lại mỗi 20 giây khi đang mở.
let live = { pages: {}, chat: {} };
let whereFn = null, started = false;

const count = () => {
  const w = whereFn?.();
  if (!w) return 0;
  return (w.page === 'chat' && w.target ? live.chat[w.target] : live.pages[w.page]) || 0;
};

// gắn / cập nhật / gỡ nhãn "đang xem" ở tiêu đề trang (chat: cạnh tên nhóm, vì dòng phụ bên dưới bị cắt bằng dấu … trên màn hình nhỏ)
function paint() {
  const n = count();
  const old = document.querySelector('.live-pill');
  if (n < 2) { old?.remove(); return; }
  // tiêu đề đang hiển thị (bỏ qua h1 bị ẩn như tiêu đề danh sách nhóm trên máy tính)
  const visible = (el) => el && el.getClientRects().length > 0;
  const host = [...document.querySelectorAll('#view h1, #root h1')].find(visible);
  if (!host) { old?.remove(); return; }
  const text = `👁 ${n} đang xem`;
  if (old && old.parentElement === host) { if (old.textContent !== text) old.textContent = text; return; }
  old?.remove();
  const el = document.createElement('span');
  el.className = 'live-pill';
  el.setAttribute('role', 'status');
  el.textContent = text;
  host.appendChild(el);
}

async function poll() {
  if (document.visibilityState !== 'visible') return;
  try {
    const r = await fetch('/api/public/live');
    if (r.ok) { live = await r.json(); paint(); }
  } catch { /* lỗi mạng: giữ số cũ */ }
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
