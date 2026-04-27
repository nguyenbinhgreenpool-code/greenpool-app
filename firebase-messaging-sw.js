// Firebase Cloud Messaging Service Worker
// File này cần thiết cho FCM push notifications (background)
// Nội dung giống sw.js — FCM yêu cầu file này ở root

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
