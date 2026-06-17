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

// ===================== CACHE STRATEGY ===================== //
const CACHE_VERSION = '8.0';
const CACHE_NAME = 'greenpool-v' + CACHE_VERSION;

// Assets cần pre-cache khi install (load offline được)
const PRE_CACHE_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.min.js',
    '/js/app-common.min.js',
    '/js/clb.min.js',
    '/js/customer.min.js',
    '/js/teacher.min.js',
    '/js/letan.min.js',
    '/icon-192.png',
    '/icon-512.png',
    '/manifest.json'
];

// Domains cần cache (CDN, fonts, Firebase SDK)
const CACHEABLE_ORIGINS = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://cdnjs.cloudflare.com',
    'https://www.gstatic.com/firebasejs',
    'https://cdn.jsdelivr.net',
    'https://cdn.sheetjs.com'
];

// Domains KHÔNG BAO GIỜ cache (API, realtime data)
const NEVER_CACHE = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'fcmregistrations.googleapis.com',
    'cloudfunctions.net',
    'quanly.greenpool.vn',
    'script.google.com',
    'firebasestorage.googleapis.com'
];

// ===================== INSTALL: Pre-cache assets ===================== //
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Pre-caching assets...');
            return cache.addAll(PRE_CACHE_ASSETS).catch(err => {
                console.warn('[SW] Pre-cache partial fail (OK):', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// ===================== ACTIVATE: Xoá cache cũ ===================== //
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('[SW] Xoá cache cũ:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ===================== FETCH: Smart caching ===================== //
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // 1. KHÔNG cache API/Firestore/GP — luôn fetch network
    if (NEVER_CACHE.some(domain => url.hostname.includes(domain))) {
        return; // Để browser xử lý bình thường
    }

    // 2. Navigation (HTML) → Network first, cache fallback
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                return response;
            }).catch(() => caches.match('/index.html'))
        );
        return;
    }

    // 3. Static assets cùng origin (.js, .css, images) → Network first, cache fallback
    if (url.origin === self.location.origin) {
        e.respondWith(
            fetch(e.request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    // 4. CDN/Fonts/Firebase SDK → Cache first (ít thay đổi)
    if (CACHEABLE_ORIGINS.some(origin => url.href.startsWith(origin))) {
        e.respondWith(
            caches.match(e.request).then(cached => {
                if (cached) return cached;
                return fetch(e.request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // 5. Mọi thứ khác → Network bình thường
});

// ===================== PUSH NOTIFICATION CLICK ===================== //
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
