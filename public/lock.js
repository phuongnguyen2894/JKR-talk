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
})();
