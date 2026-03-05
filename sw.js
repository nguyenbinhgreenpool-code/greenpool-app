const CACHE_NAME = 'greenpool-v5.75';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    // Chỉ bypass cache cho file cùng domain (HTML, JS, CSS của app)
    if (url.origin === self.location.origin) {
        e.respondWith(
            fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
        );
    } else {
        // Cross-origin (Firebase SDK, CDN, Fonts) → dùng bình thường
        e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    }
});

// Push Notification click → mở/focus app
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Nếu app đã mở → focus
            for (const client of clientList) {
                if (client.url.includes('tlsc.web.app') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Nếu chưa mở → mở mới
            return clients.openWindow('/');
        })
    );
});
