// Service worker: nhận thông báo đẩy và mở đúng trang khi bấm vào. Không lưu cache nội dung (luôn dùng bản mới nhất).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const opts = {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    data: { url: d.url || '/' },
  };
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; } // cùng nhóm/loại thì thay thế thay vì chồng nhiều thông báo
  e.waitUntil(self.registration.showNotification(d.title || 'JKR talks', opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus();
        c.postMessage({ type: 'nav', url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
