// Khóa giao diện: không phóng to/thu nhỏ, không kéo ngang (iOS Safari bỏ qua user-scalable=no nên cần chặn bằng JS)
(() => {
  const stop = (e) => e.preventDefault();
  // iOS: cử chỉ chụm hai ngón
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, stop, { passive: false }));
  // Hai ngón trở lên: chặn
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  // Máy tính: Ctrl + lăn chuột / Ctrl +, -, 0
  document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '_', '0'].includes(e.key)) e.preventDefault(); });

  // ---- Bàn phím trên điện thoại ----------------------------------------------------
  // iOS không co trang khi bàn phím mở (bàn phím phủ lên trên), và tùy phiên bản innerHeight có thể co hoặc không,
  // nên KHÔNG so với innerHeight. Thay vào đó: khi đang gõ trong một ô nhập, co khung app đúng bằng vùng nhìn thấy
  // (visualViewport) và đặt nó tại vị trí iOS đang cuộn tới, so với chiều cao lúc chưa mở bàn phím (base).
  const vv = window.visualViewport;
  const root = document.documentElement;
  const isField = (el) => !!el && (el.tagName === 'TEXTAREA' || el.isContentEditable ||
    (el.tagName === 'INPUT' && !['checkbox', 'radio', 'file', 'button', 'submit', 'range', 'color'].includes(el.type)));
  const typing = () => isField(document.activeElement);
  // Không cần chừa thêm chỗ: đo thực tế trên iOS 26 cho thấy vùng nhìn thấy đã trừ cả thanh nổi "lên / xuống / xong"
  const kbExtra = 0;

  let base = vv ? vv.height : window.innerHeight; // chiều cao vùng nhìn thấy khi không có bàn phím
  let wasKb = false;
  const fit = () => {
    if (!vv) return;
    if (!typing()) base = Math.max(vv.height, window.innerHeight);
    const kb = typing() && base - vv.height > 120;
    root.classList.toggle('kb', kb);
    if (kb) {
      root.style.setProperty('--app-h', Math.round(vv.height - kbExtra) + 'px');
      root.style.setProperty('--app-top', Math.round(vv.offsetTop) + 'px');
      if (!wasKb) setTimeout(() => { const m = document.getElementById('msgs'); if (m) m.scrollTop = m.scrollHeight; }, 60); // giữ tin mới nhất trong tầm nhìn
    } else {
      root.style.removeProperty('--app-h');
      root.style.removeProperty('--app-top');
    }
    wasKb = kb;
  };
  // iOS báo thay đổi vùng nhìn thấy trễ và nhiều lần trong lúc bàn phím trượt lên: đo lại vài lần
  const refit = () => { fit(); [80, 200, 400, 700].forEach((t) => setTimeout(fit, t)); };
  if (vv) {
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }
  document.addEventListener('focusin', (e) => { if (isField(e.target)) refit(); });
  document.addEventListener('focusout', () => setTimeout(() => {
    if (typing()) return; // chuyển sang ô nhập khác: giữ nguyên
    fit();
    window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; // trả trang về đúng chỗ sau khi bàn phím đóng
  }, 80));
  window.addEventListener('orientationchange', () => setTimeout(() => { if (vv && !typing()) base = vv.height; fit(); }, 300));
})();
