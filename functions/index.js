const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

/**
 * Cloud Function: Khi có notification mới → gửi FCM push
 * Trigger: Firestore onCreate trên collection "notifications"
 */
exports.sendPushNotification = onDocumentCreated("notifications/{notifId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const toUserId = data.toUserId;
    const message = data.message || "";
    const type = data.type || "system";

    if (!toUserId) return;

    try {
        const userDoc = await db.collection("users").doc(toUserId).get();
        if (!userDoc.exists) return;

        const fcmTokens = userDoc.data().fcmTokens || [];
        if (fcmTokens.length === 0) return;

        // Tạo title theo type
        const titleMap = {
            penalty: "⚠️ Phạt Mất Lượt!",
            contract_exception: "✨ HĐ Ngoại lệ",
            contract: "📝 Hợp đồng mới",
            attendance: "📋 Điểm danh HV",
            test: "🧪 Giao Test",
            system: "🔔 Thông báo",
        };
        const title = titleMap[type] || "🔔 GreenPool";

        const messaging = getMessaging();

        // Gửi đến tất cả token của user (nhiều thiết bị)
        const results = await Promise.allSettled(
            fcmTokens.map((token) =>
                messaging.send({
                    token: token,
                    notification: {
                        title: title,
                        body: message.substring(0, 200),
                    },
                    data: {
                        type: type,
                        notifId: event.params.notifId,
                    },
                    webpush: {
                        notification: {
                            title: title,
                            body: message.substring(0, 200),
                            icon: "/icon-192.png",
                            badge: "/icon-192.png",
                            vibrate: [200, 100, 200],
                            requireInteraction: true,
                        },
                        fcmOptions: {
                            link: "https://tlsc.web.app",
                        },
                    },
                })
            )
        );

        // Xoá token hết hạn
        const invalidTokens = [];
        results.forEach((result, i) => {
            if (result.status === "rejected") {
                const err = result.reason;
                if (
                    err.code === "messaging/invalid-registration-token" ||
                    err.code === "messaging/registration-token-not-registered"
                ) {
                    invalidTokens.push(fcmTokens[i]);
                }
            }
        });

        if (invalidTokens.length > 0) {
            const validTokens = fcmTokens.filter((t) => !invalidTokens.includes(t));
            await db.collection("users").doc(toUserId).update({
                fcmTokens: validTokens,
            });
        }
    } catch (error) {
        console.error("FCM push error:", error);
    }
});

// ============ ADMIN RESET PASSWORD ============ //
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");

exports.adminResetPassword = onCall(async (request) => {
    // Kiểm tra đã đăng nhập
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Bạn chưa đăng nhập.");
    }

    const callerUid = request.auth.uid;
    // Kiểm tra caller là ADMIN
    const callerDoc = await db.collection("users").doc(callerUid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "ADMIN") {
        throw new HttpsError("permission-denied", "Chỉ Admin mới được đổi mật khẩu.");
    }

    const { email, newPassword } = request.data;
    if (!email || !newPassword) {
        throw new HttpsError("invalid-argument", "Thiếu email hoặc mật khẩu mới.");
    }
    if (newPassword.length < 6) {
        throw new HttpsError("invalid-argument", "Mật khẩu phải ít nhất 6 ký tự.");
    }

    try {
        const auth = getAuth();
        const user = await auth.getUserByEmail(email);
        await auth.updateUser(user.uid, { password: newPassword });
        return { success: true, message: `Đã đổi mật khẩu cho ${email}` };
    } catch (err) {
        if (err.code === "auth/user-not-found") {
            throw new HttpsError("not-found", "Không tìm thấy email này.");
        }
        throw new HttpsError("internal", err.message);
    }
});
