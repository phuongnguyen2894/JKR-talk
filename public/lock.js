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
  // iOS: sau khi bàn phím đóng, trang đôi khi giữ khung hình nhỏ/lệch; đưa về đầu trang để bố cục tính lại
  const reflow = () => setTimeout(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }, 80);
  document.addEventListener('focusout', reflow);
  // iOS: bàn phím phủ lên trang (không co khung hiển thị), nên ô nhập bị che. Co khung app theo vùng nhìn thấy thật (visualViewport)
  // và ẩn thanh tab khi bàn phím mở để ô nhập luôn nằm ngay trên bàn phím.
  const vv = window.visualViewport;
  if (vv) {
    const root = document.documentElement;
    let wasKb = false;
    const fit = () => {
      const kb = window.innerHeight - vv.height > 120;
      root.classList.toggle('kb', kb);
      if (kb) {
        root.style.setProperty('--app-h', Math.round(vv.height) + 'px');
        root.style.setProperty('--app-top', Math.round(vv.offsetTop) + 'px');
        if (!wasKb) setTimeout(() => { const m = document.getElementById('msgs'); if (m) m.scrollTop = m.scrollHeight; }, 50); // giữ tin mới nhất trong tầm nhìn
      } else {
        root.style.removeProperty('--app-h');
        root.style.removeProperty('--app-top');
      }
      wasKb = kb;
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }
  if (window.visualViewport) visualViewport.addEventListener('resize', () => { if (visualViewport.height >= innerHeight - 1) reflow(); });
})();
