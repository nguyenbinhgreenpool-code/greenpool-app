// ===== GreenPool App — Notifications (v11.0) =====
// Hệ thống thông báo, bell, push notification

// ===================== HỆ THỐNG THÔNG BÁO ===================== //

// Helper: lấy danh sách Admin/Manager IDs (cache trong session, tránh query lặp)
// NOTE: _adminIdsCache và _managerIdsCache được khai báo trong app-state.js

async function getAdminIds() {
    if (_adminIdsCache) return _adminIdsCache;
    try {
        const snap = await db.collection('users').where('role', '==', 'ADMIN').get();
        _adminIdsCache = snap.docs.map(d => d.id);
        return _adminIdsCache;
    } catch (e) { console.warn('getAdminIds error:', e); return []; }
}

async function getManagerIds(branchId) {
    const brId = branchId || currentBranchId;
    if (_managerIdsCache[brId]) return _managerIdsCache[brId];
    try {
        const snap = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', brId).get();
        _managerIdsCache[brId] = snap.docs.map(d => d.id);
        return _managerIdsCache[brId];
    } catch (e) { console.warn('getManagerIds error:', e); return []; }
}

// Gửi notification cho tất cả Admin (trừ sender) — dùng cache, chỉ query 1 lần/session
async function notifyAllAdmins(type, message, excludeId) {
    const ids = (await getAdminIds()).filter(id => id !== (excludeId || currentUserId));
    return Promise.all(ids.map(id => sendNotification(id, type, message)));
}

// Gửi notification cho tất cả Manager cùng branch — dùng cache
async function notifyAllManagers(type, message, branchId) {
    const ids = await getManagerIds(branchId);
    return Promise.all(ids.map(id => sendNotification(id, type, message)));
}

// Gửi thông báo cho user
async function sendNotification(toUserId, type, message) {
    try {
        await db.collection('notifications').add({
            toUserId,
            type, // 'contract', 'contract_exception', 'penalty'
            message,
            fromUserId: currentUserId,
            fromUserName: currentUserDisplayName || 'Hệ thống',
            branchId: currentBranchId,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.error('Lỗi gửi thông báo:', e);
    }
}

// Listener thông báo real-time
var notifUnsub = null;
var notifData = [];
var shownNotifIds = new Set(); // Track đã hiện push notification chưa

// Xin quyền + đăng ký FCM token cho push notifications
async function requestNotificationPermission() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.warn('Browser không hỗ trợ Notification hoặc ServiceWorker');
        return;
    }
    try {
        // Nếu chưa hỏi quyền lần nào hoặc đã từ chối, hiện banner nhắc
        if (Notification.permission === 'default') {
            showNotifPermissionBanner();
        }
        if (Notification.permission !== 'granted') {
            const perm = await Notification.requestPermission();
            console.log('Notification permission:', perm);
            if (perm !== 'granted') {
                showNotifPermissionBanner();
                return;
            }
            hideNotifPermissionBanner();
        }
        if (!currentUserId) return;

        // Lấy FCM token — đăng ký SW trước, rồi mới init messaging
        let swReg;
        try {
            swReg = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
        } catch (swErr) {
            console.warn('ServiceWorker registration failed:', swErr);
            return;
        }
        const messaging = firebase.messaging();
        let token = null;
        try {
            token = await messaging.getToken({ vapidKey: 'BJ0lg_355URnJMi7X3LZH4erZJTK2ZRYyco1QX_OnNTa_q9YF6wBLy1MlslCCurQRp22KR_qGLdxPRJbC4QxhRo', serviceWorkerRegistration: swReg });
        } catch (e1) {
            console.warn('FCM getToken failed:', e1);
        }
        if (!token) {
            console.warn('Không lấy được FCM token');
            return;
        }
        console.log('✅ FCM token:', token.substring(0, 20) + '...');

        // Lưu token vào user document (hỗ trợ nhiều thiết bị)
        const userRef = db.collection('users').doc(currentUserId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return;

        const existingTokens = userDoc.data().fcmTokens || [];
        if (!existingTokens.includes(token)) {
            existingTokens.push(token);
            await userRef.update({ fcmTokens: existingTokens });
            console.log('✅ FCM token saved!');
        }

        // Lắng nghe foreground messages (khi app đang mở)
        messaging.onMessage((payload) => {
            console.log('Foreground FCM:', payload);
            const title = payload.notification?.title || '🔔 GreenPool';
            const body = payload.notification?.body || '';
            showBrowserNotification(title, body, 'fcm-' + Date.now());
            showToastNotification(title, body);
        });
    } catch (e) {
        console.warn('FCM setup error:', e);
    }
}

// Banner nhắc bật thông báo
function showNotifPermissionBanner() {
    if (document.getElementById('notif-perm-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'notif-perm-banner';
    banner.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:99998; background:linear-gradient(135deg, #1e40af, #3b82f6); color:#fff; padding:14px 20px; border-radius:14px; box-shadow:0 8px 32px rgba(0,0,0,0.3); display:flex; align-items:center; gap:12px; max-width:400px; width:90%;';
    banner.innerHTML = `
        <div style="font-size:24px;">🔔</div>
        <div style="flex:1;">
            <div style="font-weight:700; font-size:14px;">Bật thông báo</div>
            <div style="font-size:12px; opacity:0.9;">Nhận thông báo HĐ mới, điểm danh, phạt... ngay trên điện thoại</div>
        </div>
        <button onclick="requestNotificationPermission(); this.closest('#notif-perm-banner').remove();" style="border:none; background:rgba(255,255,255,0.2); color:#fff; padding:8px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap;">Bật ngay</button>
        <button onclick="this.closest('#notif-perm-banner').remove()" style="border:none; background:none; color:rgba(255,255,255,0.6); font-size:18px; cursor:pointer;">&times;</button>
    `;
    document.body.appendChild(banner);
}
function hideNotifPermissionBanner() {
    document.getElementById('notif-perm-banner')?.remove();
}

// Hiện browser push notification
function showBrowserNotification(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        const notif = new Notification(title, {
            body: body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: tag || 'greenpool-notif',
            vibrate: [200, 100, 200],
            requireInteraction: true
        });
        notif.onclick = () => {
            window.focus();
            notif.close();
        };
    } catch (e) {
        // Fallback cho mobile: dùng service worker registration
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, {
                    body: body,
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: tag || 'greenpool-notif',
                    vibrate: [200, 100, 200],
                    requireInteraction: true
                });
            });
        }
    }
}

// Toast notification popup — hiện rõ trên màn hình
// Phát tiếng chuông thông báo bằng Web Audio API
function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Nốt 1
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = 830; // Nốt cao
        gain1.gain.setValueAtTime(0.3, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.3);

        // Nốt 2 (cao hơn)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = 1046; // Nốt cao hơn
        gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.15);
        osc2.stop(ctx.currentTime + 0.5);

        // Nốt 3 (cao nhất)
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.value = 1318;
        gain3.gain.setValueAtTime(0.25, ctx.currentTime + 0.3);
        gain3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(ctx.currentTime + 0.3);
        osc3.stop(ctx.currentTime + 0.7);

        // Tự đóng sau 1s
        setTimeout(() => ctx.close(), 1000);
    } catch (e) { console.warn('Sound error:', e); }

    // Rung điện thoại
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }
}

function showToastNotification(title, body) {
    // Phát chuông + rung
    playNotificationSound();
    // Tạo container nếu chưa có
    let container = document.getElementById('toast-notif-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-notif-container';
        container.style.cssText = 'position:fixed; top:20px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:8px; pointer-events:none; max-width:360px;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = 'pointer-events:auto; background:var(--card-bg, #1e293b); border:1px solid var(--primary, #2563eb); border-radius:12px; padding:14px 18px; box-shadow:0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(37,99,235,0.3); animation:slideInRight 0.3s ease; cursor:pointer; max-width:100%;';
    toast.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:10px;">
            <div style="font-size:20px; flex-shrink:0;">🔔</div>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:13px; color:var(--primary, #3b82f6); margin-bottom:3px;">${title}</div>
                <div style="font-size:12px; color:var(--text-color, #e2e8f0); line-height:1.4; word-break:break-word;">${body.length > 120 ? body.substring(0, 120) + '...' : body}</div>
            </div>
            <div style="font-size:14px; color:var(--text-muted, #64748b); cursor:pointer; flex-shrink:0;" onclick="this.closest('div[style]').remove()">&times;</div>
        </div>
    `;
    toast.onclick = () => toast.remove();
    container.appendChild(toast);

    // Inject animation nếu chưa có
    if (!document.getElementById('toast-anim-style')) {
        const style = document.createElement('style');
        style.id = 'toast-anim-style';
        style.textContent = `@keyframes slideInRight { from { transform: translateX(100%); opacity:0; } to { transform: translateX(0); opacity:1; } } @keyframes fadeOut { from { opacity:1; } to { opacity:0; transform:translateY(-10px); } }`;
        document.head.appendChild(style);
    }

    // Tự ẩn sau 6 giây
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 6000);
}

function listenToNotifications() {
    if (notifUnsub) notifUnsub();
    if (!currentUserId) return;

    notifUnsub = db.collection('notifications')
        .where('toUserId', '==', currentUserId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .onSnapshot(snap => {
            console.log('🔔 Notification listener: received', snap.docs.length, 'notifications');
            const prevIds = new Set(notifData.map(n => n.id));
            notifData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Đã orderBy trong Firestore nên không cần sort JS

            // Auto-cleanup: xóa thông báo ĐÃ ĐỌC quá 7 ngày (giữ slot cho mới)
            if (prevIds.size === 0) {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const oldRead = notifData.filter(n => {
                    if (!n.read) return false;
                    const t = n.createdAt?.toDate ? n.createdAt.toDate() : null;
                    return t && t < sevenDaysAgo;
                });
                if (oldRead.length > 0) {
                    const cleanBatch = db.batch();
                    oldRead.forEach(n => cleanBatch.delete(db.collection('notifications').doc(n.id)));
                    cleanBatch.commit().then(() => console.log(`🧹 Auto-cleanup: xóa ${oldRead.length} thông báo cũ đã đọc`)).catch(e => console.warn('Cleanup err:', e));
                }
            }

            // Push notification cho thông báo MỚI (chưa đọc, chưa hiện)
            notifData.forEach(n => {
                if (!n.read && !shownNotifIds.has(n.id) && prevIds.size > 0) {
                    // Chỉ push khi không phải lần load đầu (prevIds.size > 0)
                    const title = n.type === 'penalty' ? '⚠️ Phạt Mất Lượt!'
                        : n.type === 'contract_exception' ? '✨ Hợp đồng Ngoại lệ'
                            : n.type === 'transfer' ? '🔄 Chuyển nhượng HV'
                                : n.type === 'test_kick' ? '🧪 Giao Test Khách'
                                    : n.type === 'attendance' ? '📋 Điểm danh HV'
                                        : n.type === 'salary' ? '💰 Chốt lương'
                                            : n.type === 'completion' ? '🎉 Hoàn thành khóa'
                                                : '📝 Học viên Mới!';
                    showBrowserNotification(title, n.message, n.id);
                    showToastNotification(title, n.message);
                }
                shownNotifIds.add(n.id);
            });

            renderNotificationBadge();
            renderNotificationPanel();
        }, err => {
            console.error('Notification listener error:', err);
        });
}

function renderNotificationBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const unread = notifData.filter(n => !n.read).length;
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
}

function renderNotificationPanel() {
    const panel = document.getElementById('notif-list');
    if (!panel) return;

    if (notifData.length === 0) {
        panel.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fa-solid fa-bell-slash" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>Chưa có thông báo nào</div>';
        return;
    }

    let html = '';
    notifData.forEach(n => {
        const isUnread = !n.read;
        let timeStr = '';
        if (n.createdAt) {
            const d = n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt);
            timeStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }
        const typeIcon = n.type === 'penalty' ? '⚠️' : n.type === 'contract_exception' ? '✨' : n.type === 'salary' ? '💰' : n.type === 'completion' ? '🎉' : '📝';
        const bgColor = isUnread ? 'rgba(37,99,235,0.06)' : 'transparent';
        const borderLeft = isUnread ? '3px solid var(--primary)' : '3px solid transparent';

        html += `
            <div onclick="markNotifRead('${n.id}')" style="padding: 10px 12px; border-bottom: 1px solid var(--border-color); background: ${bgColor}; border-left: ${borderLeft}; cursor: pointer; transition: all 0.2s;">
                <div style="font-size: 13px; color: var(--text-color); line-height: 1.4;">${n.message}</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                    <i class="fa-regular fa-clock"></i> ${timeStr}
                    ${isUnread ? '<span style="color: var(--primary); font-weight: 600; margin-left: 8px;">● Mới</span>' : ''}
                </div>
            </div>
        `;
    });
    panel.innerHTML = html;
}

// Đánh dấu đã đọc
window.markNotifRead = async function (notifId) {
    try {
        await db.collection('notifications').doc(notifId).update({ read: true });
    } catch (e) { console.error(e); }
};

// Đánh dấu tất cả đã đọc
window.markAllNotifsRead = async function () {
    const unread = notifData.filter(n => !n.read);
    const batch = db.batch();
    unread.forEach(n => {
        batch.update(db.collection('notifications').doc(n.id), { read: true });
    });
    try { await batch.commit(); } catch (e) { console.error(e); }
};

// Đóng panel khi bấm ra ngoài
document.addEventListener('click', function (e) {
    const panel = document.getElementById('notif-panel');
    const bell = document.getElementById('notif-bell-btn');
    if (!panel || !bell) return;
    if (!panel.contains(e.target) && !bell.contains(e.target)) {
        panel.classList.remove('show');
    }
});
