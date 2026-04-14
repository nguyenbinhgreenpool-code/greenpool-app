// Import Firebase Messaging cho push notifications
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDLDbXD4ac9zJZ3nm6DRFt09W2iMlDczp4",
    authDomain: "thang-long-swimming-club.firebaseapp.com",
    projectId: "thang-long-swimming-club",
    storageBucket: "thang-long-swimming-club.firebasestorage.app",
    messagingSenderId: "254618493495",
    appId: "1:254618493495:web:492ecaced0f0397bfc15b2"
});

const messaging = firebase.messaging();

// Background message handler — hiện notification khi app tắt
messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || '🔔 GreenPool';
    const options = {
        body: payload.notification?.body || 'Bạn có thông báo mới',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [300, 100, 300, 100, 300],
        requireInteraction: true,
        tag: 'greenpool-' + Date.now(),
        renotify: true,
        data: payload.data || {}
    };
    return self.registration.showNotification(title, options);
});

const CACHE_NAME = 'greenpool-v7.0';

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
    if (url.origin === self.location.origin) {
        e.respondWith(
            fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
        );
    } else {
        e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    }
});

// Push Notification click → mở/focus app
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('tlsc.web.app') && 'focus' in client) {
                    return client.focus();
                }
            }
            return clients.openWindow('/');
        })
    );
});
