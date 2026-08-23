const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
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
        // Ưu tiên đọc tokens từ notification data (nếu đã denormalize)
        let tokens = data.fcmTokens || [];
        if (!tokens.length) {
            // Fallback: đọc từ user doc
            const userDoc = await db.collection("users").doc(toUserId).get();
            if (!userDoc.exists) return;
            tokens = userDoc.data()?.fcmTokens || [];
        }
        const fcmTokens = tokens;
        if (fcmTokens.length === 0) return;

        // Tạo title theo type
        const titleMap = {
            penalty: "⚠️ Phạt Mất Lượt!",
            contract_exception: "✨ HĐ Ngoại lệ",
            contract: "📝 Hợp đồng mới",
            attendance: "📋 Điểm danh HV",
            test: "🧪 Giao Test",
            gp_sync_error: "🔴 Lỗi đồng bộ GP",
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
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");

/**
 * Cloud Function: Khi user document thay đổi → sync role vào Auth Custom Claims
 * Mục đích: Giảm Firestore reads trong Security Rules (getUserRole() đọc token thay vì get())
 */
exports.syncUserRoleClaim = onDocumentWritten("users/{userId}", async (event) => {
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();
    
    // Chỉ sync khi role thay đổi hoặc user mới tạo
    if (!after?.role) return;
    if (before?.role === after.role) return;
    
    try {
        const auth = getAuth();
        await auth.setCustomUserClaims(event.params.userId, { role: after.role });
        console.log(`✅ Synced custom claim: ${event.params.userId} → role=${after.role}`);
    } catch (err) {
        console.error(`❌ Failed to sync custom claim for ${event.params.userId}:`, err.message);
    }
});

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

// (Tạm) Reset/Update GP sync status for a student
exports.gpResetSync = onCall({ maxInstances: 1 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Chưa đăng nhập.");
    const { contractNumber, branchId, gpSubscribeId, gpPersonId, action } = request.data;
    if (!contractNumber) throw new HttpsError("invalid-argument", "Thiếu contractNumber.");
    let q = db.collection('students').where('contractNumber', '==', contractNumber);
    if (branchId) q = q.where('branchId', '==', branchId);
    const snap = await q.limit(5).get();
    if (snap.empty) return { success: false, message: 'Không tìm thấy HĐ' };
    const batch = db.batch();
    snap.docs.forEach(doc => {
        if (action === 'update' && gpSubscribeId) {
            // Update with new GP IDs
            batch.update(doc.ref, {
                gpSynced: true,
                gpSubscribeId: gpSubscribeId,
                gpPersonId: gpPersonId || FieldValue.delete(),
                gpSyncedAt: FieldValue.serverTimestamp(),
                gpNote: 'Fix: tạo lại HĐ đúng mã giảm giá'
            });
        } else {
            // Reset (delete GP fields)
            batch.update(doc.ref, {
                gpSynced: FieldValue.delete(),
                gpSubscribeId: FieldValue.delete(),
                gpPersonId: FieldValue.delete(),
                gpSyncedAt: FieldValue.delete(),
                gpNote: 'Reset: cho phép resync'
            });
        }
    });
    await batch.commit();
    return { success: true, message: `${action === 'update' ? 'Updated' : 'Reset'} ${snap.size} docs for HĐ "${contractNumber}"` };
});

// ============ GREENPOOL: TÌM SALE TRÊN GP (Server-side) ============ //
// Tìm Sale trên GP bằng Admin API (không bị CORS như client-side)
// Ưu tiên: (1) SĐT cùng site → (2) SĐT cross-site → (3) Tên cùng site
const GP_ADMIN_PHONE = '0332143334';
const GP_ADMIN_PASSWORD = '123456a@';
const GP_BASE_URL = 'https://quanly.greenpool.vn/api';

let _gpAdminTokenCache = null;
let _gpAdminTokenExpiry = 0;

async function gpAdminLogin() {
    if (_gpAdminTokenCache && Date.now() < _gpAdminTokenExpiry) return _gpAdminTokenCache;
    try {
        const res = await fetch(`${GP_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ phone: GP_ADMIN_PHONE, password: GP_ADMIN_PASSWORD })
        });
        const data = await res.json();
        if (data.status === 'success' && data.authorisation?.token) {
            _gpAdminTokenCache = data.authorisation.token;
            _gpAdminTokenExpiry = Date.now() + 50 * 60 * 1000; // 50 phút
            return _gpAdminTokenCache;
        }
        console.error('[GP] Admin login failed:', JSON.stringify(data).substring(0, 200));
        return null;
    } catch (e) {
        console.error('[GP] Admin login error:', e.message);
        return null;
    }
}

// Cache danh sách Sale GP (refresh mỗi 10 phút)
let _gpSaleListCache = null;
let _gpSaleListExpiry = 0;

async function getGpSaleList() {
    if (_gpSaleListCache && Date.now() < _gpSaleListExpiry) return _gpSaleListCache;
    const token = await gpAdminLogin();
    if (!token) return [];
    try {
        const res = await fetch(`${GP_BASE_URL}/admin/user?role=sale&has_total=false`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });
        const data = await res.json();
        let users = data?.data || data || [];
        if (!Array.isArray(users)) users = [];
        _gpSaleListCache = users;
        _gpSaleListExpiry = Date.now() + 10 * 60 * 1000; // Cache 10 phút
        console.log(`[GP] Loaded ${users.length} sale users from GP Admin API`);
        return users;
    } catch (e) {
        console.error('[GP] Failed to fetch sale list:', e.message);
        return [];
    }
}

/**
 * Tìm Sale trên GP bằng SĐT hoặc tên
 * @param {Object} saleInfo - { name: string, phone: string }
 * @param {number} siteId - GP site_id
 * @returns {Object|null} - { id, phone, fullname } hoặc null
 */
async function findSaleOnGP(saleInfo, siteId) {
    const { name, phone } = saleInfo || {};
    if (!phone && !name) return null;

    const allSales = await getGpSaleList();
    if (allSales.length === 0) {
        console.warn('[GP] ⚠️ Sale list empty → cannot match');
        return null;
    }

    const sameSite = allSales.filter(u => u.site_id === siteId);
    const searchList = sameSite.length > 0 ? sameSite : allSales;

    // BƯỚC 1: Tìm SĐT cùng site (chính xác nhất)
    if (phone) {
        const byPhone = searchList.find(u => u.phone === phone);
        if (byPhone) {
            console.log(`[GP] ✅ Match Sale by phone (same-site): ${phone} → "${byPhone.fullname}" (ID:${byPhone.id}, site:${byPhone.site_id})`);
            return { id: byPhone.id, phone: byPhone.phone, fullname: byPhone.fullname };
        }
    }

    // BƯỚC 2: Tìm TÊN cùng site (exact keyword match — ALL keywords phải khớp)
    if (name) {
        const nameUpper = name.toUpperCase().trim();
        const ignoreWords = ['SALE', 'ADMIN', 'MANAGER', 'CHUYÊN', 'VIÊN', 'NHÂN', 'TEST'];
        const keywords = nameUpper.split(/\s+/).filter(w => w.length >= 2 && !ignoreWords.includes(w));
        console.log(`[GP] 🔍 Matching Sale by name: "${name}" → keywords: [${keywords.join(', ')}] (site:${siteId})`);

        if (keywords.length > 0) {
            // Exact match: ALL keywords phải khớp
            const exactMatches = [];
            for (const u of searchList) {
                const gpName = (u.fullname || '').toUpperCase();
                if (keywords.every(kw => gpName.includes(kw))) exactMatches.push(u);
            }
            if (exactMatches.length === 1) {
                const pick = exactMatches[0];
                console.log(`[GP] ✅ Match Sale by name (exact, same-site): "${name}" → "${pick.fullname}" (ID:${pick.id})`);
                return { id: pick.id, phone: pick.phone, fullname: pick.fullname };
            }
            if (exactMatches.length > 1) {
                // Nhiều hơn 1 match → chọn người có nhiều keyword khớp nhất + tên ngắn nhất (gần nhất)
                exactMatches.sort((a, b) => (a.fullname || '').length - (b.fullname || '').length);
                const pick = exactMatches[0];
                console.log(`[GP] ✅ Match Sale by name (best of ${exactMatches.length}, same-site): "${name}" → "${pick.fullname}" (ID:${pick.id})`);
                return { id: pick.id, phone: pick.phone, fullname: pick.fullname };
            }

            // Partial match: tính score, yêu cầu ≥50% keywords khớp
            let bestMatch = null;
            let bestScore = 0;
            for (const u of searchList) {
                const gpName = (u.fullname || '').toUpperCase();
                const matchCount = keywords.filter(kw => gpName.includes(kw)).length;
                const score = matchCount / keywords.length;
                if (score > bestScore && score >= 0.5) {
                    bestScore = score;
                    bestMatch = u;
                }
            }
            if (bestMatch) {
                console.log(`[GP] ✅ Match Sale by name (partial ${Math.round(bestScore * 100)}%, same-site): "${name}" → "${bestMatch.fullname}" (ID:${bestMatch.id})`);
                return { id: bestMatch.id, phone: bestMatch.phone, fullname: bestMatch.fullname };
            }
        }
    }

    // BƯỚC 3: Cross-site phone (cuối cùng, có cảnh báo)
    if (phone) {
        const byPhoneAll = allSales.find(u => u.phone === phone);
        if (byPhoneAll) {
            console.warn(`[GP] ⚠️ Match Sale by phone CROSS-SITE: ${phone} → "${byPhoneAll.fullname}" (site:${byPhoneAll.site_id}) ≠ target ${siteId}`);
            return { id: byPhoneAll.id, phone: byPhoneAll.phone, fullname: byPhoneAll.fullname };
        }
    }

    console.warn(`[GP] ⚠️ Không match Sale nào cho name="${name}", phone="${phone}" tại site ${siteId}`);
    return null;
}

// ============ GREENPOOL PROXY (External API v2) ============ //
// Tạo subscribe trên GreenPool qua External API (API Key, không cần login)
exports.gpCreateSubscribe = onCall({ maxInstances: 10 }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Chưa đăng nhập.");
    }
    const { personInfo, subscribeInfo, paymentInfo, branchId: clientBranchId, customerSource } = request.data;
    const saleInfo = request.data.saleInfo || {};  // { name, phone } từ client

    if (!personInfo || !subscribeInfo) {
        throw new HttpsError("invalid-argument", "Thiếu personInfo hoặc subscribeInfo.");
    }

    const GP_EXT = "https://quanly.greenpool.vn/api/external";
    const GP_API_KEY = "nK8yAQSjn50cloL0l5aYp6tWEG6Kabo5VV3hTrWMRvlABqAX";
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': GP_API_KEY
    };

    const contractNumber = subscribeInfo.contract || '';
    const siteId = subscribeInfo.site_id || paymentInfo?.site_id || 2;
    const branchId = clientBranchId || '';
    const phone = personInfo.phone || '';

    // ========== TÌM SALE GP (server-side) ==========
    // Ưu tiên: (1) support_user_id từ client → (2) saleInfo (name/phone) → (3) Firestore user → (4) site default
    const SITE_USER_IDS = { 1: 4267, 2: 4225, 3: 4251, 4: 4245, 5: 4243 };
    let userId = parseInt(subscribeInfo.support_user_id) || 0;
    let saleMatchMethod = userId ? 'client_support_user_id' : '';
    let usedFallback = false;

    if (!userId) {
        // Bước 1: Tìm từ saleInfo (name + phone gửi từ client)
        if (saleInfo.phone || saleInfo.name) {
            try {
                const gpSale = await findSaleOnGP(saleInfo, siteId);
                if (gpSale) {
                    userId = gpSale.id;
                    saleMatchMethod = `server_match: "${gpSale.fullname}" (${gpSale.phone || 'no-phone'})`;
                }
            } catch (e) {
                console.warn(`[GP-v2] findSaleOnGP error: ${e.message}`);
            }
        }

        // Bước 2: Nếu vẫn chưa có, thử lấy phone từ Firestore user doc
        if (!userId && request.auth?.uid) {
            try {
                const callerDoc = await db.collection('users').doc(request.auth.uid).get();
                if (callerDoc.exists) {
                    const callerData = callerDoc.data();
                    const callerPhone = callerData.phone || callerData.phoneNumber || '';
                    const callerName = callerData.name || '';
                    if (callerPhone || callerName) {
                        const gpSale = await findSaleOnGP({ name: callerName, phone: callerPhone }, siteId);
                        if (gpSale) {
                            userId = gpSale.id;
                            saleMatchMethod = `server_firestore_user: "${gpSale.fullname}" (${gpSale.phone || 'no-phone'})`;
                        }
                    }
                }
            } catch (e) { /* non-blocking */ }
        }

        // Bước 3: Fallback cuối cùng — dùng user site mặc định
        if (!userId) {
            userId = SITE_USER_IDS[siteId] || 4225;
            usedFallback = true;
            saleMatchMethod = `⚠️ FALLBACK site default: ${userId}`;
            console.warn(`[GP-v2] ⚠️ FALLBACK: dùng user site mặc định ${userId} vì không tìm được Sale name="${saleInfo.name}" phone="${saleInfo.phone}"`);
        }
    }

    console.log(`[GP-v2] Called by ${request.auth.uid}, phone=${phone}, site=${siteId}, contract=${contractNumber}, user_id=${userId}, match=${saleMatchMethod}`);

    // ========== CHỐNG SPAM: Firestore Lock ==========
    // Khi user bấm nút liên tục, nhiều request chạy đồng thời
    // Lock bằng atomic create() → chỉ request đầu tiên được xử lý
    const lockId = `${contractNumber}_${branchId}_${phone}`.replace(/[\/\.]/g, '_');
    const lockRef = db.collection('_gpSyncLocks').doc(lockId);
    let lockAcquired = false;
    if (contractNumber) {
        try {
            await lockRef.create({
                createdAt: FieldValue.serverTimestamp(),
                uid: request.auth.uid,
                contract: contractNumber,
                phone: phone
            });
            lockAcquired = true;
            console.log(`[GP-v2] 🔒 Lock acquired: ${lockId}`);
        } catch (e) {
            // create() fails if doc already exists → another request is processing
            console.warn(`[GP-v2] ⚠️ Lock exists: ${lockId} → chặn request trùng`);
            return { success: false, reason: 'already_processing', error: 'already_processing', message: `HĐ "${contractNumber}" đang được đồng bộ, vui lòng chờ.` };
        }
    }

    try {

        // ========== BƯỚC 1: CHECK TRÙNG HĐ (Firestore) ==========
        if (contractNumber) {
            console.log(`[GP-v2] Checking duplicate contract: "${contractNumber}" (site: ${siteId}, branch: ${branchId})`);
            let firestoreQuery = db.collection('students').where('contractNumber', '==', contractNumber);
            if (branchId) firestoreQuery = firestoreQuery.where('branchId', '==', branchId);
            const existingDocs = await firestoreQuery.limit(5).get();
            const syncedDoc = existingDocs.docs.find(d => d.data().gpSubscribeId);
            if (syncedDoc) {
                const sData = syncedDoc.data();
                const msg = `Mã HĐ "${contractNumber}" đã sync GP (GP #${sData.gpSubscribeId}) cho ${sData.name || '?'} tại cơ sở này`;
                console.warn(`[GP-v2] ⚠️ ${msg}`);
                return { success: false, reason: 'duplicate_contract', error: 'duplicate_contract', message: msg, existingSubscribeId: sData.gpSubscribeId, existingPersonName: sData.name };
            }

            // Check GP: tìm person theo phone → check subscribes
            if (phone) {
                try {
                    const personsRes = await fetch(`${GP_EXT}/persons?user_id=${userId}&phone=${phone}&site_id=${siteId}`, { headers });
                    const personsData = await personsRes.json();
                    const persons = personsData?.data || [];
                    if (persons.length > 0) {
                        const pId = persons[0].id;
                        const subsRes = await fetch(`${GP_EXT}/persons/${pId}/subscribes?user_id=${userId}`, { headers });
                        const subsData = await subsRes.json();
                        const existingSub = (subsData?.data || []).find(s => s.contract === contractNumber);
                        if (existingSub) {
                            const msg = `Mã HĐ "${contractNumber}" đã tồn tại trên GP (GP #${existingSub.id})`;
                            console.warn(`[GP-v2] ⚠️ ${msg}`);
                            // Auto-mark Firestore
                            if (branchId) {
                                try {
                                    const markDocs = await db.collection('students')
                                        .where('contractNumber', '==', contractNumber)
                                        .where('branchId', '==', branchId).limit(3).get();
                                    const batch = db.batch();
                                    markDocs.docs.forEach(doc => {
                                        if (!doc.data().gpSubscribeId) {
                                            batch.update(doc.ref, { gpSynced: true, gpSubscribeId: existingSub.id, gpNote: 'Auto-linked: đã có trên GP' });
                                        }
                                    });
                                    await batch.commit();
                                } catch (e) { /* skip */ }
                            }
                            return { success: false, reason: 'duplicate_contract', error: 'duplicate_contract', message: msg, existingSubscribeId: existingSub.id };
                        }
                    }
                } catch (gpCheckErr) {
                    console.warn(`[GP-v2] ⚠️ GP duplicate check failed (continuing): ${gpCheckErr.message}`);
                }
            }
            console.log(`[GP-v2] ✅ Contract "${contractNumber}" chưa có → tiếp tục`);
        }

        // ========== BƯỚC 2: TẠO SUBSCRIBE (External API) ==========
        let rawDiscountCode = (paymentInfo?.discount_code || paymentInfo?.discount_value || '').trim();

        // Auto-detect discount khi Sale chỉ sửa tiền thanh toán mà không chọn mã giảm giá
        if (!rawDiscountCode) {
            // App gửi total_amount HOẶC original_amount → check cả 2
            const origAmt = parseInt(paymentInfo?.original_amount) || parseInt(paymentInfo?.total_amount) || 0;
            const paidAmt = parseInt(paymentInfo?.pay_amount) || 0;
            if (origAmt > 0 && paidAmt > 0 && origAmt > paidAmt) {
                const diffK = Math.round((origAmt - paidAmt) / 1000);
                rawDiscountCode = `GIAM${diffK}K`;
                console.log(`[GP-v2] ⚡ Auto-detect discount: original=${origAmt}, paid=${paidAmt}, diff=${diffK}K → "${rawDiscountCode}"`);
            }
        }

        // === MAP DISCOUNT CODE THEO SITE ===
        // App gửi mã %: GIAM15 → GIAM15_NCT
        // App gửi mã số tiền: GIAM500K → NCT_G500K (chỉ dùng mã ĐÃ CÓ trên GP)
        const SITE_SUFFIX = { 1: '_NCT', 2: '_CTT', 3: '_TK', 4: '_TT', 5: '_TTRI' };
        const STANDARD_CODES = ['GIAM10', 'GIAM15', 'GIAM20', 'GIAM25', 'GIAM30', 'GIAM40', 'GIAM50'];

        // Map mã giảm số tiền cố định ĐÃ CÓ trên GP (site → amountK → GP code)
        // Site 1=NCT, 2=CTT, 3=TK, 4=HM(Hoàng Mai), 5=TT(Thanh Trì)
        // ⚠️ Chỉ dùng mã ĐÃ TỒN TẠI ĐÚNG SITE trên GP (tạo qua GP admin web)
        const FIXED_DISCOUNT_MAP = {
            // Site 1: NCT (Nguyễn Cơ Thạch) — updated 24/6/2026 from GP sync
            1: { 500: 'NCT_G500K', 525: 'GIAM525K1', 800: 'NCT_G800K', 900: 'NCT_G900K', 1000: 'VCG1000', 1200: 'NCT_G1200K', 1500: 'VCG1500' },
            // Site 2: CTT (Cung TTDN) — updated 24/6/2026
            2: { 200: 'CTT_G200K', 500: 'GIAM500K', 600: 'GIAM600K', 700: 'GIAM700K', 800: 'GIAM800K', 900: 'CTT_G900K', 1000: 'GIAM1TR', 1200: 'GIAM1TR2', 1500: 'GIAM1TR5', 2000: '3THANGT1' },
            // Site 3: TK (Thuỷ Khuê) — updated 24/6/2026
            3: { 525: 'GIAM525K', 800: 'GIẢM 800', 900: '900K', 1000: '1TR', 1200: '1TR2' },
            // Site 4: HM (Hoàng Mai) — updated 24/6/2026
            4: { 500: 'TT_G500K', 525: 'TT_G525K', 800: 'TT_G800K', 900: 'TT_G900K', 1000: '1000000', 1200: 'TT_G1200K', 1500: '1500000', 2000: '2000000' },
            // Site 5: TTRI (Thanh Trì) — updated 24/6/2026
            5: { 1000: 'COMBO HB', 1500: '-1TR500', 2000: 'TRI ÂN 2TR', 2500: 'CA HB' },
        };

        let discountCode = rawDiscountCode;
        let discountWarning = '';  // Cảnh báo khi mã bị drop

        // ✅ BYPASS: nếu mã được chọn từ dropdown GP (isGpCode=true) → gửi thẳng RAW, KHÔNG normalize
        const isGpCode = !!paymentInfo?.isGpCode;
        if (discountCode && isGpCode) {
            // Mã từ GP dropdown → giữ NGUYÊN (kể cả dấu tiếng Việt, space, ký tự đặc biệt)
            // VD: "GIẢM 20%", "COMBO HB", "-1TR500", "HB 20%"
            console.log(`[GP-v2] ✅ GP dropdown code → gửi thẳng RAW: "${discountCode}" (site ${siteId})`);
        } else if (discountCode) {
            // ✅ NORMALIZE: chỉ cho mã NHẬP TAY — bỏ dấu tiếng Việt, xử lý format
            // "GIẢM 20%" → "GIAM20%", "Giảm 500K" → "GIAM500K"
            const removeDiacritics = (str) => str
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // Bỏ combining marks
                .replace(/đ/gi, 'd')
                .replace(/Đ/g, 'D');
            discountCode = removeDiacritics(discountCode).trim().toUpperCase();
            // "GIAM 20%" → "GIAM20%", "GIAM 500K" → "GIAM500K" (bỏ space)
            discountCode = discountCode.replace(/^GIAM\s+/i, 'GIAM');
            // Nếu chỉ là "20%" → "GIAM20%"
            if (/^\d+%$/.test(discountCode)) {
                discountCode = 'GIAM' + discountCode;
            }
            console.log(`[GP-v2] Discount normalized: "${rawDiscountCode}" → "${discountCode}" (nhập tay)`);

        } else if (discountCode) {
            // === MAPPING LOGIC (chỉ áp dụng khi Sale nhập tay) ===

            // ✅ VALIDATE: nếu mã có suffix site khác → sửa lại suffix đúng
            // VD: "CTT_G25" tại site 3 (TK) → phải map lại
            const currentSuffix = SITE_SUFFIX[siteId] || '';
            const allSuffixes = Object.values(SITE_SUFFIX);
            if (allSuffixes.some(s => discountCode.includes(s)) && currentSuffix && !discountCode.includes(currentSuffix)) {
                console.warn(`[GP-v2] ⚠️ Mã "${discountCode}" thuộc site khác, không đúng site ${siteId} (${currentSuffix}) → sẽ strip suffix và re-map`);
                const strippedSuffix = allSuffixes.reduce((c, s) => c.replace(s, ''), discountCode);
                if (STANDARD_CODES.includes(strippedSuffix)) {
                    discountCode = strippedSuffix;
                    console.log(`[GP-v2] Stripped to standard: "${discountCode}"`);
                } else {
                    console.warn(`[GP-v2] ⚠️ Cannot re-map "${discountCode}" (wrong site) → dropping`);
                    discountWarning = `Mã "${rawDiscountCode}" thuộc cơ sở khác (không phải site ${siteId}). Đã bỏ mã.`;
                    discountCode = '';
                }
            }

            if (discountCode && STANDARD_CODES.includes(discountCode)) {
                const suffix = SITE_SUFFIX[siteId] || '_CTT';
                discountCode = discountCode + suffix;
                console.log(`[GP-v2] Discount: "${rawDiscountCode}" → "${discountCode}" (site ${siteId})`);
            } else if (discountCode && /^GIAM(\d+)K$/i.test(discountCode)) {
                const kMatch = discountCode.match(/^GIAM(\d+)K$/i);
                const amountK = parseInt(kMatch[1]);
                const siteMap = FIXED_DISCOUNT_MAP[siteId] || {};
                const gpCode = siteMap[amountK];
                if (gpCode) {
                    discountCode = gpCode;
                    console.log(`[GP-v2] Fixed discount: "${rawDiscountCode}" → "${discountCode}" (site ${siteId})`);
                } else {
                    console.warn(`[GP-v2] ⚠️ Mã "${rawDiscountCode}" KHÔNG CÓ mapping cho site ${siteId}`);
                    discountWarning = `Mã "${rawDiscountCode}" không có trên GP cho cơ sở này (site ${siteId}). HĐ sẽ có nợ.`;
                    discountCode = '';
                }
            } else if (discountCode && /^GIAM(\d+)%/i.test(discountCode)) {
                const pct = discountCode.match(/^GIAM(\d+)%/i)[1];
                const stdCode = `GIAM${pct}`;
                if (STANDARD_CODES.includes(stdCode)) {
                    const suffix = SITE_SUFFIX[siteId] || '_CTT';
                    discountCode = stdCode + suffix;
                    console.log(`[GP-v2] Percent discount: "${rawDiscountCode}" → "${discountCode}" (site ${siteId})`);
                } else {
                    console.warn(`[GP-v2] ⚠️ Percent "${pct}%" không trong STANDARD_CODES`);
                    discountWarning = `Mã "${rawDiscountCode}" không hỗ trợ trên GP.`;
                    discountCode = '';
                }
            } else if (discountCode && /^\d+$/.test(discountCode) && parseInt(discountCode) >= 100000) {
                const amountK = Math.round(parseInt(discountCode) / 1000);
                const siteMap = FIXED_DISCOUNT_MAP[siteId] || {};
                const gpCode = siteMap[amountK];
                if (gpCode) {
                    discountCode = gpCode;
                    console.log(`[GP-v2] Numeric discount: "${rawDiscountCode}" → ${amountK}K → "${discountCode}" (site ${siteId})`);
                } else {
                    console.warn(`[GP-v2] ⚠️ Numeric discount "${rawDiscountCode}" (${amountK}K) KHÔNG CÓ mapping cho site ${siteId}`);
                    discountWarning = `Mã "${rawDiscountCode}" (${amountK}K) không có trên GP cho cơ sở này (site ${siteId}). HĐ sẽ có nợ.`;
                    discountCode = '';
                }
            } else if (discountCode && /^(\d+)K$/i.test(discountCode)) {
                const kMatch = discountCode.match(/^(\d+)K$/i);
                const amountK = parseInt(kMatch[1]);
                const siteMap = FIXED_DISCOUNT_MAP[siteId] || {};
                const gpCode = siteMap[amountK];
                if (gpCode) {
                    discountCode = gpCode;
                    console.log(`[GP-v2] Shorthand discount: "${rawDiscountCode}" → ${amountK}K → "${discountCode}" (site ${siteId})`);
                } else {
                    console.warn(`[GP-v2] ⚠️ Shorthand discount "${rawDiscountCode}" (${amountK}K) KHÔNG CÓ mapping cho site ${siteId}`);
                    discountWarning = `Mã "${rawDiscountCode}" (${amountK}K) không có trên GP cho cơ sở này (site ${siteId}). HĐ sẽ có nợ.`;
                    discountCode = '';
                }
            } else if (discountCode) {
                // Mã đã có suffix đúng site → gửi thẳng
                const currentSuffix2 = SITE_SUFFIX[siteId] || '';
                if (currentSuffix2 && discountCode.includes(currentSuffix2)) {
                    console.log(`[GP-v2] GP code already correct site: "${discountCode}" (site ${siteId})`);
                } else {
                    // Thử tra FIXED_DISCOUNT_MAP xem mã có exact match không
                    const siteMap = FIXED_DISCOUNT_MAP[siteId] || {};
                    const isKnownCode = Object.values(siteMap).includes(discountCode);
                    if (isKnownCode) {
                        console.log(`[GP-v2] ✅ Known GP code: "${discountCode}" (site ${siteId})`);
                    } else {
                        console.warn(`[GP-v2] ⚠️ Discount code "${discountCode}" không nhận dạng được → gửi thẳng thử`);
                        // KHÔNG DROP — gửi thẳng, để GP tự validate
                    }
                }
            }
        }
        const totalAmount = parseInt(paymentInfo?.total_amount) || 0;
        let paidAmount = parseInt(paymentInfo?.pay_amount || paymentInfo?.total_amount) || 0;
        const payMethod = paymentInfo?.pay_method || 'CASH';

        // ✅ TRIỆT ĐỂ: LUÔN gửi pay_amount >= giá gốc gói GP → KHÔNG BAO GIỜ ghi nợ
        // GP tự cap pay ở mức total_amount (sau discount) → thừa tiền cũng OK
        // Discount code vẫn gửi kèm → GP tự áp dụng
        const safePayAmount = Math.max(totalAmount, paidAmount, 10000000);
        if (safePayAmount !== paidAmount) {
            console.warn(`[GP-v2] ⚠️ pay_amount (${paidAmount}) → ép lên ${safePayAmount} để TRÁNH NỢ (discount: "${discountCode}")`);
        }
        paidAmount = safePayAmount;

        const extPayload = {
            user_id: userId,
            phone: phone,
            fullname: (personInfo.fullname || '').toUpperCase(),
            // App: 1=Nam, 2=Nữ → GP: 1=Nam, 0=Nữ
            gender: personInfo.gender === 2 ? 0 : (personInfo.gender || 1),
            site_id: siteId,
            package_id: subscribeInfo.package_id,
            start_date: subscribeInfo.start_date || new Date().toISOString().split('T')[0],
            active_type: subscribeInfo.active_type === 'FUTURE' ? 'FIRST_USE' : (subscribeInfo.active_type || 'NOW'),
            contract: contractNumber,
            pay_method: payMethod,
            pay_amount: paidAmount,
            notes: `Đồng bộ từ TLSC (${branchId})`
        };

        // Thêm discount_code nếu có
        if (discountCode) {
            extPayload.discount_code = discountCode;
            console.log(`[GP-v2] Discount code: "${discountCode}"`);
        }

        // === Step 1: Tạo lead trước (GP API yêu cầu có lead trước khi tạo subscribe) ===
        try {
            const leadPayload = {
                user_id: userId,
                name: (personInfo.fullname || '').toUpperCase(),
                phone: phone,
                gender: personInfo.gender === 2 ? 0 : (personInfo.gender || 1),
                site_id: siteId,
                source: 'FACE'
            };
            console.log(`[GP-v2] Creating lead for ${phone}...`);
            const leadRes = await fetch(`${GP_EXT}/leads`, {
                method: 'POST', headers,
                body: JSON.stringify(leadPayload)
            });
            const leadData = await leadRes.json();
            if (leadData.success) {
                console.log(`[GP-v2] ✅ Lead created: #${leadData.data?.lead_id}`);
            } else {
                console.log(`[GP-v2] Lead exists or skipped: ${leadData.message || JSON.stringify(leadData.errors || {})}`);
            }
        } catch (leadErr) {
            console.warn(`[GP-v2] ⚠️ Lead creation error (non-blocking): ${leadErr.message}`);
        }

        // === Step 2: Tạo subscribe ===
        console.log(`[GP-v2] POST /subscribes:`, JSON.stringify(extPayload));
        const subRes = await fetch(`${GP_EXT}/subscribes`, {
            method: 'POST', headers,
            body: JSON.stringify(extPayload)
        });
        const subText = await subRes.text();
        console.log(`[GP-v2] Response status: ${subRes.status}, body: ${subText.substring(0, 500)}`);
        
        let subData;
        try { subData = JSON.parse(subText); } catch (e) { subData = { raw: subText }; }

        const subId = subData?.data?.subscribe_id || subData?.data?.id || subData?.id;
        const personId = subData?.data?.person_id;

        if (subId) {
            console.log(`[GP-v2] ✅ Subscribe created: #${subId}, person: #${personId}`);
            console.log(`[GP-v2] Total: ${subData?.data?.total_amount}, Paid: ${subData?.data?.pay_amount}, Remain: ${subData?.data?.remain_amount}`);

            // === AUTO-FIX NỢ: Nếu GP trả remain_amount > 0, tự thanh toán bổ sung ===
            const remainAmount = parseInt(subData?.data?.remain_amount) || 0;
            if (remainAmount > 0) {
                console.warn(`[GP-v2] ⚠️ GP ghi nợ ${remainAmount}đ cho subscribe #${subId} → tự thanh toán bổ sung`);
                try {
                    const GP_BASE = 'https://quanly.greenpool.vn/api';
                    const adminLoginRes2 = await fetch(`${GP_BASE}/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({ phone: '0332143334', password: '123456a@' })
                    });
                    const adminLoginData2 = await adminLoginRes2.json();
                    const adminToken2 = adminLoginData2?.authorisation?.token;
                    if (adminToken2) {
                        const payDebtRes = await fetch(`${GP_BASE}/admin/subscribe/${subId}/payment`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${adminToken2}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({ amount: remainAmount, pay_method: payMethod || 'cash', note: 'Auto-fix nợ từ TLSC App' })
                        });
                        const payDebtData = await payDebtRes.json();
                        if (payDebtRes.ok) {
                            console.log(`[GP-v2] ✅ Auto-fix nợ thành công: +${remainAmount}đ cho GP#${subId}`);
                        } else {
                            console.warn(`[GP-v2] ⚠️ Auto-fix nợ response: ${JSON.stringify(payDebtData)}`);
                        }
                    }
                } catch (debtErr) {
                    console.warn(`[GP-v2] ⚠️ Auto-fix nợ error (non-blocking): ${debtErr.message}`);
                }
            }

            // === Check name mismatch: create member if phone belongs to parent ===
            if (personId) {
                try {
                    const personRes = await fetch(`${GP_EXT}/persons/${personId}?user_id=${userId}`, { headers });
                    const personData = await personRes.json();
                    const gpPersonName = (personData?.data?.fullname || '').trim().toUpperCase();
                    const studentName = (personInfo.fullname || '').trim().toUpperCase();

                    if (gpPersonName && studentName && gpPersonName !== studentName) {
                        console.log(`[GP-v2] ⚠️ Name mismatch: GP="${gpPersonName}" vs Student="${studentName}" → creating member`);

                        const GP_BASE = 'https://quanly.greenpool.vn/api';
                        // Login admin
                        const adminLoginRes = await fetch(`${GP_BASE}/login`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({ phone: '0332143334', password: '123456a@' })
                        });
                        const adminLoginData = await adminLoginRes.json();
                        const adminToken = adminLoginData?.authorisation?.token;

                        if (adminToken) {
                            const adminHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${adminToken}` };

                            // Create member under parent person
                            const memberRes = await fetch(`${GP_BASE}/admin/member`, {
                                method: 'POST', headers: adminHeaders,
                                body: JSON.stringify({
                                    owner_person_id: personId,
                                    fullname: personInfo.fullname.toUpperCase(),
                                    member_type: 'group',
                                    gender: personInfo.gender === 2 ? 'female' : 'male',
                                })
                            });
                            const memberData = await memberRes.json();
                            const memberId = memberData?.id;

                            if (memberId) {
                                // Link member to subscribe
                                await fetch(`${GP_BASE}/admin/subscribe-member`, {
                                    method: 'POST', headers: adminHeaders,
                                    body: JSON.stringify({ subscribe_id: subId, member_id: memberId })
                                });
                                console.log(`[GP-v2] ✅ Member #${memberId} "${studentName}" linked to subscribe #${subId} (parent: "${gpPersonName}")`);
                            } else {
                                console.warn(`[GP-v2] ⚠️ Failed to create member: ${JSON.stringify(memberData)}`);
                            }
                        }
                    }
                } catch (memberErr) {
                    console.warn(`[GP-v2] ⚠️ Member check/creation failed: ${memberErr.message}`);
                }

                // === Update person mkt_channel (Nguồn / Kênh) ===
                if (customerSource) {
                    try {
                        const SOURCE_MAP = {
                            'FACE': 'FACE',
                            'WALK-IN': 'KHÁCH WALK IN',
                            'HOTLINE': 'KHÁCH CÁ NHÂN',
                            'RENEW': 'KHÁCH RENEW',
                            'REFER': 'KHÁCH GIỚI THIỆU',
                            'ĐI THỊ TRƯỜNG': 'ĐI THỊ TRƯỜNG'
                        };
                        const mktChannel = SOURCE_MAP[customerSource] || customerSource;

                        const GP_BASE = 'https://quanly.greenpool.vn/api';
                        // Reuse admin token if available, or login
                        let adminTk;
                        try {
                            const lr = await fetch(`${GP_BASE}/login`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                                body: JSON.stringify({ phone: '0332143334', password: '123456a@' })
                            });
                            const ld = await lr.json();
                            adminTk = ld?.authorisation?.token;
                        } catch (e) { /* skip */ }

                        if (adminTk) {
                            // Get current person data for required PUT fields
                            const pRes = await fetch(`${GP_BASE}/admin/person/${personId}`, {
                                headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${adminTk}` }
                            });
                            const pData = await pRes.json();

                            await fetch(`${GP_BASE}/admin/person/${personId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${adminTk}` },
                                body: JSON.stringify({
                                    fullname: pData.fullname || personInfo.fullname || '',
                                    phone: pData.phone || phone,
                                    gender: pData.gender || 1,
                                    address: pData.address || 'Hà Nội',
                                    birthday: pData.birthday || '2000-01-01',
                                    mkt_channel: mktChannel
                                })
                            });
                            console.log(`[GP-v2] ✅ Person #${personId} mkt_channel set to "${mktChannel}" (from "${customerSource}")`);
                        }
                    } catch (srcErr) {
                        console.warn(`[GP-v2] ⚠️ mkt_channel update failed: ${srcErr.message}`);
                    }
                }
            }

            // Auto-save gpSubscribeId vào Firestore
            if (contractNumber) {
                try {
                    let savQuery = db.collection('students').where('contractNumber', '==', contractNumber);
                    if (branchId) savQuery = savQuery.where('branchId', '==', branchId);
                    const studentDocs = await savQuery.limit(3).get();
                    const batch = db.batch();
                    studentDocs.docs.forEach(doc => {
                        if (!doc.data().gpSubscribeId) {
                            const updateData = {
                                gpSynced: true,
                                gpSubscribeId: subId,
                                gpPersonId: personId || null,
                                gpSyncedAt: FieldValue.serverTimestamp(),
                                gpSaleMatchMethod: saleMatchMethod || ''
                            };
                            // Ghi warning nếu dùng fallback
                            if (usedFallback) {
                                updateData.gpSaleWarning = `⚠️ Không tìm được Sale "${saleInfo.name || ''}" (${saleInfo.phone || ''}) trên GP → dùng user mặc định site ${siteId} (ID:${userId})`;
                                updateData.gpSaleWarningAt = FieldValue.serverTimestamp();
                            }
                            batch.update(doc.ref, updateData);
                        }
                    });
                    await batch.commit();
                    console.log(`[GP-v2] ✅ Auto-saved gpSubscribeId to ${studentDocs.size} doc(s)`);
                } catch (saveErr) {
                    console.warn(`[GP-v2] ⚠️ Auto-save failed: ${saveErr.message}`);
                }
            }
            return { success: true, subscribeId: subId, personId: personId, discountWarning: discountWarning || undefined, saleMatchMethod: saleMatchMethod || undefined };
        }

        // ========== LỖI ==========
        console.error(`[GP-v2] ❌ Subscribe failed:`, JSON.stringify(subData).substring(0, 300));
        await notifyAdminSyncError(contractNumber, personInfo.fullname, 'Subscribe failed: ' + (subData?.message || JSON.stringify(subData).substring(0, 100)));
        return { success: false, error: 'Subscribe creation failed', detail: subData };
    } catch (err) {
        console.error(`[GP] ❌ Exception:`, err.message);
        // Gửi thông báo cho Admin
        await notifyAdminSyncError('', '', 'Exception: ' + err.message);
        throw new HttpsError("internal", err.message);
    } finally {
        // ========== CLEANUP LOCK ==========
        if (lockAcquired) {
            try {
                await lockRef.delete();
                console.log(`[GP-v2] 🔓 Lock released: ${lockId}`);
            } catch (e) { /* ignore */ }
        }
    }
});

// ============ FIX SALE NAMES: Sửa tên Sale sai trên GP cho các HĐ từ 13/8 ============ //
// Admin-only: Tìm các HĐ đã sync GP trong khoảng thời gian bị lỗi, sửa support_user cho đúng
exports.gpFixSaleNames = onCall({ maxInstances: 1, timeoutSeconds: 300 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Chưa đăng nhập.");
    
    // Kiểm tra caller là ADMIN
    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'ADMIN') {
        throw new HttpsError("permission-denied", "Chỉ Admin mới được dùng.");
    }

    const { fromDate, toDate, dryRun } = request.data || {};
    // Default: 13/8/2026 14:00 → now
    const from = fromDate ? new Date(fromDate) : new Date('2026-08-13T07:00:00Z'); // 14:00 VN = 07:00 UTC
    const to = toDate ? new Date(toDate) : new Date();
    const isDryRun = dryRun !== false; // Mặc định dry-run = true (chỉ check, chưa fix)

    console.log(`[GP-Fix] ${isDryRun ? '🔍 DRY RUN' : '🔧 FIX MODE'}: from=${from.toISOString()} to=${to.toISOString()}`);

    // Tìm tất cả students đã sync GP trong khoảng thời gian bị lỗi
    const snap = await db.collection('students')
        .where('gpSynced', '==', true)
        .where('gpSyncedAt', '>=', from)
        .where('gpSyncedAt', '<=', to)
        .get();

    if (snap.empty) {
        return { success: true, message: 'Không có HĐ nào trong khoảng thời gian này', total: 0 };
    }

    console.log(`[GP-Fix] Found ${snap.size} students synced in range`);

    // Load sale info cho tất cả creatorIds
    const creatorIds = [...new Set(snap.docs.map(d => d.data().creatorId || d.data().saleId).filter(Boolean))];
    const saleMap = {};
    for (const cid of creatorIds) {
        try {
            const uDoc = await db.collection('users').doc(cid).get();
            if (uDoc.exists) {
                const u = uDoc.data();
                saleMap[cid] = { name: u.name || '', phone: u.phone || u.phoneNumber || '' };
            }
        } catch (e) { /* skip */ }
    }
    console.log(`[GP-Fix] Loaded ${Object.keys(saleMap).length} sale users from Firestore`);

    // Login GP admin
    const token = await gpAdminLogin();
    if (!token) {
        return { success: false, message: 'Không login được GP Admin API' };
    }

    const SITE_MAP = {
        'branch_nguyen_co_thach': 1,
        'branch_cung_ttdn': 2,
        'branch_thuy_khue': 3,
        'branch_hoang_mai': 4,
        'branch_thanh_tri': 5
    };

    const results = [];
    let fixed = 0, skipped = 0, errors = 0;

    for (const doc of snap.docs) {
        const s = doc.data();
        const gpSubId = s.gpSubscribeId;
        if (!gpSubId || gpSubId === 'existed') { skipped++; continue; }

        const creatorId = s.creatorId || s.saleId || '';
        const originalSale = saleMap[creatorId] || null;
        if (!originalSale) {
            results.push({ contract: s.contractNumber, status: 'skip', reason: 'no_creator', creatorId });
            skipped++;
            continue;
        }

        const siteId = SITE_MAP[s.branchId] || 2;

        // Tìm Sale đúng trên GP
        let gpSale = null;
        try {
            gpSale = await findSaleOnGP(originalSale, siteId);
        } catch (e) {
            results.push({ contract: s.contractNumber, status: 'error', reason: `findSale error: ${e.message}` });
            errors++;
            continue;
        }

        if (!gpSale) {
            results.push({ contract: s.contractNumber, status: 'skip', reason: `no_gp_sale for "${originalSale.name}" (${originalSale.phone})`, siteId });
            skipped++;
            continue;
        }

        // Lấy thông tin subscribe hiện tại từ GP
        let currentSupportUserId = null;
        try {
            const subRes = await fetch(`${GP_BASE_URL}/admin/subscribe/${gpSubId}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
            const subData = await subRes.json();
            currentSupportUserId = subData?.support_user_id || subData?.data?.support_user_id || null;
        } catch (e) {
            results.push({ contract: s.contractNumber, gpSubId, status: 'error', reason: `get subscribe error: ${e.message}` });
            errors++;
            continue;
        }

        // So sánh: nếu Sale đã đúng → skip
        if (currentSupportUserId && String(currentSupportUserId) === String(gpSale.id)) {
            results.push({ contract: s.contractNumber, gpSubId, status: 'ok', currentSale: gpSale.fullname });
            skipped++;
            continue;
        }

        const entry = {
            contract: s.contractNumber,
            gpSubId,
            student: s.name,
            originalSale: originalSale.name,
            currentGpSaleId: currentSupportUserId,
            correctGpSaleId: gpSale.id,
            correctGpSaleName: gpSale.fullname,
            siteId
        };

        if (isDryRun) {
            entry.status = 'would_fix';
            results.push(entry);
            fixed++;
            continue;
        }

        // FIX: Update support_user_id trên GP
        try {
            const updateRes = await fetch(`${GP_BASE_URL}/admin/subscribe/${gpSubId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ support_user_id: gpSale.id })
            });
            const updateData = await updateRes.json();
            if (updateRes.ok) {
                entry.status = 'fixed';
                // Cập nhật Firestore
                await doc.ref.update({
                    gpSaleMatchMethod: `fix: "${gpSale.fullname}" (ID:${gpSale.id})`,
                    gpSaleWarning: FieldValue.delete(),
                    gpSaleWarningAt: FieldValue.delete(),
                    gpSaleFixedAt: FieldValue.serverTimestamp()
                });
                fixed++;
            } else {
                entry.status = 'error';
                entry.reason = `PUT failed: ${JSON.stringify(updateData).substring(0, 200)}`;
                errors++;
            }
        } catch (e) {
            entry.status = 'error';
            entry.reason = `PUT exception: ${e.message}`;
            errors++;
        }
        results.push(entry);
    }

    const summary = `${isDryRun ? '🔍 DRY RUN' : '🔧 FIXED'}: ${fixed} fix, ${skipped} skip, ${errors} error (total: ${snap.size})`;
    console.log(`[GP-Fix] ${summary}`);

    return { success: true, message: summary, total: snap.size, fixed, skipped, errors, results };
});

// Helper: Gửi thông báo lỗi sync GP cho tất cả Admin
async function notifyAdminSyncError(contractNumber, studentName, errorDetail) {
    try {
        // Tìm tất cả Admin
        const adminsSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
        if (adminsSnap.empty) return;

        const msg = `🔴 Đồng bộ GP thất bại!\n` +
            (contractNumber ? `📋 HĐ: ${contractNumber}` : '') +
            (studentName ? ` | HV: ${studentName}` : '') +
            `\n❌ Lỗi: ${errorDetail}\n⏰ ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;

        const batch = db.batch();
        adminsSnap.docs.forEach(adminDoc => {
            const notifRef = db.collection('notifications').doc();
            batch.set(notifRef, {
                toUserId: adminDoc.id,
                type: 'gp_sync_error',
                message: msg,
                read: false,
                createdAt: FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        console.log(`[GP] 📢 Đã gửi thông báo lỗi sync cho ${adminsSnap.size} Admin`);
    } catch (e) {
        console.warn(`[GP] Không gửi được thông báo lỗi: ${e.message}`);
    }
}

// ============ SCHEDULED FIRESTORE BACKUP (mỗi ngày 2h sáng VN) ============ //
const { onSchedule } = require("firebase-functions/v2/scheduler");
const firestoreAdmin = require("@google-cloud/firestore");

const backupClient = new firestoreAdmin.v1.FirestoreAdminClient();

exports.scheduledFirestoreBackup = onSchedule(
    {
        schedule: "0 19 * * 0",   // 19:00 UTC = 2:00 AM Vietnam (UTC+7)
        timeZone: "Asia/Ho_Chi_Minh",
        region: "asia-southeast1",
        retryCount: 2,
    },
    async (event) => {
        const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "thang-long-swimming-club";
        const databaseName = backupClient.databasePath(projectId, "(default)");
        const bucket = `gs://${projectId}-firestore-backups`;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-"); // YYYY-MM-DDTHH-MM-SS-mmmZ

        console.log(`🔄 Bắt đầu backup Firestore → ${bucket}/${timestamp}`);

        try {
            const [response] = await backupClient.exportDocuments({
                name: databaseName,
                outputUriPrefix: `${bucket}/${timestamp}`,
                collectionIds: ['students', 'athletes', 'users', 'attendance', 'clb_attendance', 'queues', 'settings', 'config', 'branches'],
            });
            console.log(`✅ Backup thành công: ${response.name}`);

            // Gửi thông báo cho Admin
            const adminsSnap = await db.collection("users").where("role", "==", "ADMIN").get();
            if (!adminsSnap.empty) {
                const batch = db.batch();
                adminsSnap.docs.forEach((adminDoc) => {
                    const notifRef = db.collection("notifications").doc();
                    batch.set(notifRef, {
                        toUserId: adminDoc.id,
                        type: "system",
                        fcmTokens: adminDoc.data()?.fcmTokens || [],
                        message: `✅ Backup Firestore thành công!\n📅 ${timestamp}\n📦 ${bucket}/${timestamp}`,
                        read: false,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                });
                await batch.commit();
            }
            return response;
        } catch (err) {
            console.error("❌ Backup thất bại:", err.message);

            // Thông báo lỗi cho Admin
            const adminsSnap = await db.collection("users").where("role", "==", "ADMIN").get();
            if (!adminsSnap.empty) {
                const batch = db.batch();
                adminsSnap.docs.forEach((adminDoc) => {
                    const notifRef = db.collection("notifications").doc();
                    batch.set(notifRef, {
                        toUserId: adminDoc.id,
                        type: "system",
                        fcmTokens: adminDoc.data()?.fcmTokens || [],
                        message: `❌ Backup Firestore THẤT BẠI!\n📅 ${timestamp}\n🔴 Lỗi: ${err.message}`,
                        read: false,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                });
                await batch.commit();
            }
            throw err;
        }
    }
);

// ============ MANUAL BACKUP (Admin gọi từ app) ============ //
exports.manualFirestoreBackup = onCall({ region: "asia-southeast1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Chưa đăng nhập.");
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "ADMIN") {
        throw new HttpsError("permission-denied", "Chỉ Admin mới được backup.");
    }

    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "thang-long-swimming-club";
    const databaseName = backupClient.databasePath(projectId, "(default)");
    const bucket = `gs://${projectId}-firestore-backups`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    try {
        const [response] = await backupClient.exportDocuments({
            name: databaseName,
            outputUriPrefix: `${bucket}/${timestamp}`,
            collectionIds: [],
        });
        return { success: true, message: `Backup started: ${response.name}`, path: `${bucket}/${timestamp}` };
    } catch (err) {
        throw new HttpsError("internal", `Backup failed: ${err.message}`);
    }
});

// ============ FIX GP PAYMENT (TẠM - XÓA SAU KHI CHẠY) ============ //
// mode='preview' → CHỈ ĐỌC (mặc định)
// mode='fix'     → XÓA subscribe cũ + TẠO LẠI mới bằng TK Sale
/* DISABLED - temp fix function, removed for cost optimization
exports.gpFixTodayPayments = onCall({ maxInstances: 1, timeoutSeconds: 540 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Chưa đăng nhập.");
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "ADMIN") {
        throw new HttpsError("permission-denied", "Chỉ Admin.");
    }

    const mode = request.data?.mode || 'preview';
    const GP_BASE = "https://quanly.greenpool.vn/api";
    // TK Admin TTDN — có quyền xóa subscribe
    const ADMIN_TTDN = { phone: '0332143334', pass: '123456a@' };
    const SITE_ACCOUNTS = {
        1: { phone: '0865028566', pass: '123456789', label: 'NCT' },
        2: { phone: '0769101101', pass: '123456789', label: 'CTT' },
        3: { phone: '0334019412', pass: '123456789', label: 'TK' },
        4: { phone: '0326324642', pass: '123456789', label: 'HM' },
        5: { phone: '0934654683', pass: '123456789', label: 'TT' }
    };
    const siteMap = { 'branch_nct': 1, 'branch_ctt': 2, 'branch_tk': 3, 'branch_hm': 4, 'branch_tt': 5 };

    const today = new Date('2026-06-11T17:00:00Z');
    const allSnap = await db.collection('students').where('createdAt', '>=', today).get();
    const docs = allSnap.docs.filter(d => d.data().gpSynced === true && d.data().gpSubscribeId);
    console.log(`[FixGP] Mode: ${mode}, Found ${docs.length} students`);

    const results = [];
    const tokenCache = {};      // cache token theo site (cho GET)
    const saleTokenCache = {};  // cache token theo salePhone (cho CREATE)
    const userCache = {};       // cache user doc theo uid
    let adminTTDNToken = null;  // token Admin TTDN (cho DELETE)

    // Helper: login GP
    async function gpLogin(phone, pass) {
        const key = phone;
        if (saleTokenCache[key]) return saleTokenCache[key];
        const loginRes = await fetch(`${GP_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ phone, password: pass || '123456789' })
        });
        const loginData = await loginRes.json();
        const tok = loginData?.authorisation?.token;
        if (tok) saleTokenCache[key] = tok;
        return tok;
    }

    // Helper: lấy SĐT Sale từ creatorId
    async function getSalePhone(creatorId) {
        if (!creatorId) return null;
        if (userCache[creatorId]) return userCache[creatorId];
        const userDoc = await db.collection('users').doc(creatorId).get();
        if (!userDoc.exists) return null;
        const u = userDoc.data();
        const phone = u.phone || u.phoneNumber || '';
        const name = u.name || u.displayName || '';
        userCache[creatorId] = { phone, name };
        return { phone, name };
    }

    // Login Admin TTDN 1 lần (dùng cho DELETE)
    adminTTDNToken = await gpLogin(ADMIN_TTDN.phone, ADMIN_TTDN.pass);
    if (!adminTTDNToken) {
        console.error('[FixGP] ❌ Admin TTDN login FAILED!');
        return { error: 'Admin TTDN login failed' };
    }
    console.log('[FixGP] ✅ Admin TTDN login OK');
    const adminHeaders = { 'Authorization': `Bearer ${adminTTDNToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };

    for (const doc of docs) {
        const d = doc.data();
        const gpSubId = d.gpSubscribeId;
        if (!gpSubId || gpSubId === 'existed') continue;

        const siteId = siteMap[d.branchId] || 2;
        const acct = SITE_ACCOUNTS[siteId] || SITE_ACCOUNTS[2];

        try {
            // Login site account (cho GET)
            if (!tokenCache[siteId]) {
                tokenCache[siteId] = await gpLogin(acct.phone, acct.pass);
            }
            const siteToken = tokenCache[siteId];
            if (!siteToken) { results.push({ contract: d.contractNumber, name: d.name, status: 'LOGIN_FAIL' }); continue; }
            const siteHeaders = { 'Authorization': `Bearer ${siteToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };

            // Lấy SĐT Sale thật từ creatorId
            const saleInfo = await getSalePhone(d.creatorId);
            const salePhone = saleInfo?.phone || '';
            const saleName = saleInfo?.name || '';

            // GET subscribe hiện tại
            const subRes = await fetch(`${GP_BASE}/admin/subscribe/${gpSubId}`, { method: 'GET', headers: adminHeaders });
            if (!subRes.ok) { results.push({ contract: d.contractNumber, name: d.name, gpSubId, status: 'GP_FETCH_FAIL', http: subRes.status }); continue; }
            const rawGP = await subRes.json();

            const gpSub = rawGP.subscribe || rawGP;
            const payment = rawGP.payment || gpSub.payment || null;
            const pkg = gpSub.package || {};

            const packagePrice = parseInt(pkg.price) || 0;
            const gpRemain = parseInt(payment?.remain_amount) || 0;
            const gpDiscountValue = payment?.discount_value || '';
            const gpDiscountAmount = parseInt(payment?.discount_amount) || 0;
            const gpPay = parseInt(payment?.pay_amount) || 0;
            const gpTotal = parseInt(payment?.total_amount) || 0;

            const hasDiscountCode = gpDiscountValue && gpDiscountValue.length > 0;
            const isBuggy = gpRemain > 0 && hasDiscountCode && gpDiscountAmount === 0;

            const correctAmount = packagePrice - gpRemain;
            const fixTotal = correctAmount > 0 ? correctAmount : gpTotal;

            const entry = {
                contract: d.contractNumber,
                name: d.name,
                site: acct.label,
                sale: saleName || '?',
                salePhone: salePhone || '?',
                gpSubId,
                gp: {
                    packageName: pkg.name || '', packagePrice,
                    total_amount: gpTotal, pay_amount: gpPay, remain_amount: gpRemain,
                    discount_value: gpDiscountValue, discount_amount: gpDiscountAmount,
                },
                isBuggy,
                status: isBuggy ? 'NEED_FIX' : 'OK'
            };

            if (isBuggy) {
                entry.fixPlan = {
                    action: 'XÓA subscribe cũ → TẠO LẠI bằng TK Sale',
                    total_amount: fixTotal, pay_amount: fixTotal, remain_amount: 0,
                    note: `Mã ${gpDiscountValue}: giảm ${gpRemain.toLocaleString()}đ → thực trả = ${fixTotal.toLocaleString()}đ`
                };
            }

            // ===== FIX: XÓA + TẠO LẠI =====
            if (mode === 'fix' && isBuggy) {
                // Login bằng TK Sale thật
                let saleToken = null;
                if (salePhone) {
                    saleToken = await gpLogin(salePhone, '123456789');
                    console.log(`[FixGP] Sale login: ${saleName} (${salePhone}) → ${saleToken ? 'OK' : 'FAIL'}`);
                }
                // Fallback: dùng tk site nếu sale login thất bại
                if (!saleToken) {
                    console.warn(`[FixGP] ⚠️ Sale login fail → fallback to site account ${acct.label}`);
                    saleToken = siteToken;
                }
                const saleHeaders = { 'Authorization': `Bearer ${saleToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };

                // Bước 1: XÓA subscribe cũ (dùng admin hoặc sale token)
                console.log(`[FixGP] DELETE #${gpSubId} (${d.contractNumber})...`);
                const delRes = await fetch(`${GP_BASE}/admin/subscribe/${gpSubId}`, { method: 'DELETE', headers: adminHeaders });
                const delText = await delRes.text();
                console.log(`[FixGP] DELETE: ${delRes.status}`);

                if (!delRes.ok) {
                    entry.status = 'DELETE_FAIL';
                    entry.fixResponse = delText.substring(0, 300);
                    results.push(entry);
                    continue;
                }

                // Bước 2: TẠO LẠI bằng TK Sale
                const createPayload = {
                    subscribe: {
                        person_id: gpSub.person_id,
                        package_id: gpSub.package_id,
                        site_id: gpSub.site_id,
                        contract: gpSub.contract || d.contractNumber,
                        start_date: gpSub.start_date || new Date().toISOString().split('T')[0],
                        active_type: 'FUTURE',
                        support_user_id: gpSub.support_user_id || payment?.support_user_id || '',
                        note: gpSub.note || ''
                    },
                    payment: {
                        total_amount: fixTotal,
                        pay_amount: fixTotal,
                        remain_amount: 0,
                        site_id: gpSub.site_id,
                        person_id: gpSub.person_id,
                        pay_method: payment?.pay_method || 'cash',
                        support_user_id: payment?.support_user_id || gpSub.support_user_id || '',
                        mkt_source: payment?.mkt_source || ''
                    }
                };

                console.log(`[FixGP] CREATE bằng Sale ${saleName} (${salePhone})...`);
                const createRes = await fetch(`${GP_BASE}/admin/subscribe`, {
                    method: 'POST', headers: saleHeaders,
                    body: JSON.stringify(createPayload)
                });
                const createText = await createRes.text();
                let createData;
                try { createData = JSON.parse(createText); } catch (e) { createData = { raw: createText }; }

                const newSubId = createData?.id || createData?.data?.id || createData?.subscribe?.id;

                if (createRes.ok && newSubId) {
                    entry.status = 'FIXED';
                    entry.newGpSubId = newSubId;
                    await doc.ref.update({ gpSubscribeId: newSubId });
                    console.log(`[FixGP] ✅ FIXED ${d.contractNumber}: old #${gpSubId} → new #${newSubId} (Sale: ${saleName})`);
                } else {
                    entry.status = 'CREATE_FAIL';
                    entry.fixResponse = createText.substring(0, 500);
                    console.error(`[FixGP] ❌ CREATE FAIL ${d.contractNumber}: ${createText.substring(0, 200)}`);
                }
            }

            results.push(entry);
        } catch (e) {
            results.push({ contract: d.contractNumber, name: d.name, status: 'ERROR', error: e.message });
        }
    }

    const needFix = results.filter(r => r.isBuggy).length;
    const fixed = results.filter(r => r.status === 'FIXED').length;
    return { mode, total: docs.length, needFix, fixed, results };
});
*/

// ===== TẠM: HTTP endpoint để gọi fix trực tiếp bằng curl (XÓA SAU KHI DÙNG) =====
/* DISABLED - temp fix function, removed for cost optimization
exports.gpFixHttp = onRequest({ maxInstances: 1, timeoutSeconds: 540 }, async (req, res) => {
    const SECRET = 'fix-gp-2026-06-12';
    if (req.query.key !== SECRET && req.body?.key !== SECRET) {
        return res.status(403).json({ error: 'Invalid key' });
    }
    const mode = req.query.mode || req.body?.mode || 'preview';
    
    const GP_BASE = "https://quanly.greenpool.vn/api";
    const ADMIN_TTDN = { phone: '0332143334', pass: '123456a@' };
    const SITE_ACCOUNTS = {
        1: { phone: '0865028566', pass: '123456789', label: 'NCT' },
        2: { phone: '0769101101', pass: '123456789', label: 'CTT' },
        3: { phone: '0334019412', pass: '123456789', label: 'TK' },
        4: { phone: '0326324642', pass: '123456789', label: 'HM' },
        5: { phone: '0934654683', pass: '123456789', label: 'TT' }
    };
    const siteMap = { 'branch_nct': 1, 'branch_ctt': 2, 'branch_tk': 3, 'branch_hm': 4, 'branch_tt': 5 };

    // Map contract → GP discount entity ID (GP chỉ chấp nhận discount qua ID)
    // Site 3(TK): 900K=39, GIẢM20%=2, 1TR2=175
    // Site 2(CTT): GIAM500K=60
    // Site 5(TT): GIẢM15%=125, HB20%=108
    // Site 1(NCT): 10%=206
    const DISCOUNT_ID_MAP = {
        '812': 39, '813': 39, '815': 39, '814': 39,       // TK: 900K
        '824': 2, '825': 2,                                 // TK: GIẢM 20%
        'A15307': 175,                                       // TK: 1TR2 (1.200.000)
        'MĐ7229': 60, 'MĐ7233': 60, 'MĐ9129': 60,        // CTT: GIAM500K
        'A3347': 108,                                        // TT: HB 20%
        'VA0082': 125, 'VA0083': 108,                       // TT: GIẢM15%, HB20%
        'JMG2538': 206                                       // NCT: 10%
    };

    const today = new Date('2026-06-11T17:00:00Z');
    const allSnap = await db.collection('students').where('createdAt', '>=', today).get();
    const docs = allSnap.docs.filter(d => d.data().gpSynced === true && d.data().gpSubscribeId);
    console.log(`[FixHTTP] Mode: ${mode}, Found ${docs.length} students`);

    const results = [];
    const tokenCache = {};
    const saleTokenCache = {};
    const userCache = {};

    async function gpLogin(phone, pass) {
        if (saleTokenCache[phone]) return saleTokenCache[phone];
        const r = await fetch(`${GP_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ phone, password: pass || '123456789' })
        });
        const d = await r.json();
        const t = d?.authorisation?.token;
        if (t) saleTokenCache[phone] = t;
        return t;
    }

    async function getSalePhone(creatorId) {
        if (!creatorId) return null;
        if (userCache[creatorId]) return userCache[creatorId];
        const ud = await db.collection('users').doc(creatorId).get();
        if (!ud.exists) return null;
        const u = ud.data();
        userCache[creatorId] = { phone: u.phone || u.phoneNumber || '', name: u.name || u.displayName || '' };
        return userCache[creatorId];
    }

    // Login Admin TTDN
    const adminToken = await gpLogin(ADMIN_TTDN.phone, ADMIN_TTDN.pass);
    if (!adminToken) return res.json({ error: 'Admin TTDN login failed' });
    console.log('[FixHTTP] ✅ Admin TTDN login OK');
    const adminH = { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };

    for (const doc of docs) {
        const d = doc.data();
        const gpSubId = d.gpSubscribeId;
        if (!gpSubId || gpSubId === 'existed') continue;

        const siteId = siteMap[d.branchId] || 2;
        const acct = SITE_ACCOUNTS[siteId] || SITE_ACCOUNTS[2];

        try {
            // GET subscribe (dùng admin TTDN)
            const subRes = await fetch(`${GP_BASE}/admin/subscribe/${gpSubId}`, { method: 'GET', headers: adminH });
            if (!subRes.ok) { results.push({ contract: d.contractNumber, name: d.name, gpSubId, status: 'GP_FETCH_FAIL', http: subRes.status }); continue; }
            const rawGP = await subRes.json();

            const gpSub = rawGP.subscribe || rawGP;
            const payment = rawGP.payment || gpSub.payment || null;
            const pkg = gpSub.package || {};

            const packagePrice = parseInt(pkg.price) || 0;
            const gpRemain = parseInt(payment?.remain_amount) || 0;
            const gpDiscountValue = payment?.discount_value || '';
            const gpDiscountAmount = parseInt(payment?.discount_amount) || 0;
            const gpTotal = parseInt(payment?.total_amount) || 0;
            const gpPay = parseInt(payment?.pay_amount) || 0;

            // GP dùng package.price làm tổng → remain = package.price - pay_amount
            // Buggy nếu remain > 0 HOẶC (mode=refix: có discount code nhưng GP discount_amount=0)
            const fsDiscountCode = d.gpDiscountCode || d.discountCode || '';
            const hasDiscountId = !!DISCOUNT_ID_MAP[d.contractNumber];
            const hasDiscount = fsDiscountCode || gpDiscountValue || hasDiscountId;
            const isBuggy = gpRemain > 0 || (mode === 'refix' && hasDiscount && gpDiscountAmount === 0);

            const entry = {
                contract: d.contractNumber, name: d.name, site: acct.label, gpSubId,
                pkg: pkg.name, pkgPrice: packagePrice,
                total: gpTotal, pay: gpPay, remain: gpRemain,
                discount: gpDiscountValue, discountAmt: gpDiscountAmount,
                isBuggy, status: isBuggy ? 'NEED_FIX' : 'OK'
            };

            if (isBuggy) {
                entry.fixPlan = { payAs: packagePrice, action: 'DELETE+CREATE' };
                // Lấy Sale info
                const saleInfo = await getSalePhone(d.creatorId);
                entry.sale = saleInfo?.name || '?';
                entry.salePhone = saleInfo?.phone || '?';
            }

            if ((mode === 'fix' || mode === 'refix') && isBuggy) {
                // LƯU thông tin HĐ trước khi xóa
                const savedInfo = {
                    person_id: gpSub.person_id, package_id: gpSub.package_id,
                    site_id: gpSub.site_id, contract: gpSub.contract || d.contractNumber,
                    start_date: gpSub.start_date, support_user_id: gpSub.support_user_id || payment?.support_user_id || '',
                    note: gpSub.note || '', pay_method: payment?.pay_method || 'cash',
                    mkt_source: payment?.mkt_source || ''
                };
                console.log(`[FixHTTP] Saved info for ${d.contractNumber}: ${JSON.stringify(savedInfo)}`);

                // BƯỚC 1: XÓA bằng Admin TTDN
                console.log(`[FixHTTP] DELETE #${gpSubId}...`);
                const delRes = await fetch(`${GP_BASE}/admin/subscribe/${gpSubId}`, { method: 'DELETE', headers: adminH });
                const delText = await delRes.text();
                console.log(`[FixHTTP] DELETE: ${delRes.status}`);

                if (!delRes.ok) {
                    entry.status = 'DELETE_FAIL';
                    entry.error = delText.substring(0, 300);
                    results.push(entry); continue;
                }

                // BƯỚC 2: Login Sale
                const saleInfo = await getSalePhone(d.creatorId);
                let saleToken = null;
                if (saleInfo?.phone) {
                    saleToken = await gpLogin(saleInfo.phone, '123456789');
                    console.log(`[FixHTTP] Sale: ${saleInfo.name} (${saleInfo.phone}) → ${saleToken ? 'OK' : 'FAIL'}`);
                }
                if (!saleToken) {
                    // Fallback: dùng tk site
                    saleToken = await gpLogin(acct.phone, acct.pass);
                    console.log(`[FixHTTP] ⚠️ Fallback site ${acct.label}`);
                }
                const saleH = { 'Authorization': `Bearer ${saleToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };

                // BƯỚC 3: TẠO LẠI bằng Sale
                // GP backend validate discount_value = EXACT match GP discount entity code cho site
                // Discount entities đã tạo trên GP cho mỗi site
                const DISCOUNT_VALUE_MAP = {
                    '812': 'GIAM900K', '813': 'GIAM900K', '815': 'GIAM900K', '814': 'GIAM900K',  // TK id=207
                    '824': 'GIAM20%TK', '825': 'GIAM20%TK',                                       // TK id=212
                    'A15307': 'GIAM1200K',                                                         // TK id=208
                    'MĐ7229': 'GIAM500K', 'MĐ7233': 'GIAM500K', 'MĐ9129': 'GIAM500K',          // CTT id=60
                    'A3347': 'GIAM20%TT',                                                         // TT id=210
                    'VA0082': 'GIAM15%', 'VA0083': 'GIAM20%TT',                                  // TT id=209,210
                    'JMG2538': 'GIAM10%NCT'                                                       // NCT id=211
                };
                const discountValue = DISCOUNT_VALUE_MAP[d.contractNumber] || null;
                
                // Tính giá sau giảm
                let discountedPrice = packagePrice;
                if (discountValue) {
                    const pctMatch = discountValue.match(/(\d+)%/);
                    const kMatch = discountValue.match(/(\d+)K$/i);
                    if (pctMatch) {
                        discountedPrice = Math.round(packagePrice * (100 - parseInt(pctMatch[1])) / 100);
                    } else if (kMatch) {
                        discountedPrice = packagePrice - parseInt(kMatch[1]) * 1000;
                    }
                }
                
                console.log(`[FixHTTP] dv=${discountValue}, pkg=${packagePrice}`);

                const payload = {
                    subscribe: {
                        person_id: savedInfo.person_id, package_id: savedInfo.package_id,
                        site_id: savedInfo.site_id, contract: savedInfo.contract,
                        start_date: savedInfo.start_date, active_type: 'FUTURE',
                        support_user_id: savedInfo.support_user_id, note: savedInfo.note
                    },
                    payment: {
                        total_amount: packagePrice,
                        pay_amount: packagePrice,
                        remain_amount: 0,
                        discount_type: discountValue ? 'code' : undefined,
                        discount_value: discountValue || undefined,
                        site_id: savedInfo.site_id, person_id: savedInfo.person_id,
                        pay_method: savedInfo.pay_method, support_user_id: savedInfo.support_user_id,
                        mkt_source: savedInfo.mkt_source
                    }
                };
                console.log(`[FixHTTP] Payload:`, JSON.stringify(payload.payment));

                console.log(`[FixHTTP] CREATE...`);
                const createRes = await fetch(`${GP_BASE}/admin/subscribe`, {
                    method: 'POST', headers: saleH,
                    body: JSON.stringify(payload)
                });
                const createText = await createRes.text();
                let createData; try { createData = JSON.parse(createText); } catch(e) {}
                const newId = createData?.id || createData?.subscribe?.id || createData?.data?.id;

                if (createRes.ok && newId) {
                    entry.status = 'FIXED';
                    entry.newGpSubId = newId;
                    await doc.ref.update({ gpSubscribeId: newId });
                    console.log(`[FixHTTP] ✅ ${d.contractNumber}: #${gpSubId} → #${newId}`);
                } else {
                    entry.status = 'CREATE_FAIL';
                    entry.error = createText.substring(0, 500);
                    console.error(`[FixHTTP] ❌ ${d.contractNumber}: ${createText.substring(0, 200)}`);
                }
            }

            results.push(entry);
        } catch (e) {
            results.push({ contract: d.contractNumber, name: d.name, status: 'ERROR', error: e.message });
        }
    }

    const needFix = results.filter(r => r.isBuggy).length;
    const fixed = results.filter(r => r.status === 'FIXED').length;
    res.json({ mode, total: docs.length, needFix, fixed, results });
});
*/

// ============ ĐỒNG BỘ MÃ GIẢM GIÁ TỪ GP → FIRESTORE ============ //
// Login từng site account → GET /admin/discount → lọc gói HB → lưu Firestore
// Không dùng admin switching → an toàn, không ảnh hưởng các function khác

async function syncDiscountsFromGP() {
    const GP_BASE = "https://quanly.greenpool.vn/api";
    const SITE_ACCOUNTS = {
        1: { phone: '0865028566', pass: '123456789', label: 'NCT', name: 'Nguyễn Cơ Thạch' },
        2: { phone: '0769101101', pass: '123456789', label: 'CTT', name: 'Cầu Tó Thanh Trì' },
        3: { phone: '0334019412', pass: '123456789', label: 'TK', name: 'Thuỷ Khuê' },
        4: { phone: '0326324642', pass: '123456789', label: 'HM', name: 'Hoàng Mai' },
        5: { phone: '0934654683', pass: '123456789', label: 'TT', name: 'Thanh Trì' },
    };

    // Package IDs học bơi/lặn theo từng site (từ GP_API.packageMap)
    const SWIM_PACKAGE_IDS = {
        1: [503, 502, 505, 504, 510, 509, 512, 511, 508],           // NCT
        2: [532, 531, 669, 670, 563, 562, 565, 564, 696, 697, 698, 695, 489],  // Cung TTDN
        3: [730, 725, 731, 726, 739, 737, 740, 738, 732, 733],      // Thuỷ Khuê
        4: [428, 429, 431, 432, 434, 420],                           // Hoàng Mai
        5: [550, 549, 552, 551, 590, 588, 591, 589, 553, 555, 702], // Thanh Trì
    };
    const sites = {};
    const errors = [];

    for (const [siteId, acct] of Object.entries(SITE_ACCOUNTS)) {
        const swimPkgIds = SWIM_PACKAGE_IDS[siteId] || [];
        try {
            // Login bằng tài khoản site
            const loginRes = await fetch(`${GP_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ phone: acct.phone, password: acct.pass })
            });
            const loginData = await loginRes.json();
            const token = loginData?.authorisation?.token;
            if (!token) {
                errors.push({ site: siteId, label: acct.label, error: 'Login failed' });
                continue;
            }

            // GET tất cả discount của site này
            const discRes = await fetch(`${GP_BASE}/admin/discount`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
            const allDiscounts = await discRes.json();
            if (!Array.isArray(allDiscounts)) {
                errors.push({ site: siteId, label: acct.label, error: 'Invalid response' });
                continue;
            }

            // Lọc: chỉ lấy discount có GẮN package HỌC BƠI (không lấy gym/spa)
            const discounts = allDiscounts
                .filter(d => {
                    const pkgs = d.packages || [];
                    if (pkgs.length === 0) return false;
                    // Discount phải có ÍT NHẤT 1 package thuộc danh sách học bơi
                    // Dùng Number() vì GP API có thể trả id dạng string
                    return pkgs.some(p => swimPkgIds.includes(Number(p.id)));
                })
                .map(d => {
                    const type = d.discount_type; // 'percent' hoặc 'fixed'
                    const value = d.discount_value;
                    let label = '';
                    if (type === 'percent') {
                        label = `Giảm ${value}%`;
                    } else if (type === 'fixed') {
                        label = value >= 1000000
                            ? `Giảm ${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}tr`
                            : `Giảm ${Math.round(value / 1000)}K`;
                    }
                    return {
                        code: d.code,
                        type: type,
                        value: value,
                        label: label,
                        packages: (d.packages || []).map(p => ({
                            id: p.id,
                            name: p.name
                        }))
                    };
                })
                // Sắp xếp: fixed trước (tăng dần), % sau (tăng dần)
                .sort((a, b) => {
                    if (a.type === b.type) return a.value - b.value;
                    return a.type === 'fixed' ? -1 : 1;
                })
                // Loại bỏ trùng lặp (cùng type + value)
                .filter((d, idx, arr) => arr.findIndex(x => x.type === d.type && x.value === d.value) === idx);

            sites[siteId] = {
                name: acct.name,
                label: acct.label,
                count: discounts.length,
                discounts: discounts
            };
            console.log(`[SyncDisc] ✅ Site ${siteId} (${acct.label}): ${allDiscounts.length} tổng → ${discounts.length} mã HB: ${discounts.map(d => d.code).join(', ')}`);
        } catch (e) {
            errors.push({ site: siteId, label: acct.label, error: e.message });
            console.error(`[SyncDisc] ❌ Site ${siteId}: ${e.message}`);
        }
    }

    // Lưu vào Firestore: config/gp_discounts
    const syncData = {
        lastSyncedAt: FieldValue.serverTimestamp(),
        lastSyncedAtISO: new Date().toISOString(),
        sites: sites,
        errors: errors
    };
    await db.collection('config').doc('gp_discounts').set(syncData, { merge: false });

    const totalCodes = Object.values(sites).reduce((sum, s) => sum + s.count, 0);
    console.log(`[SyncDisc] ✅ Saved ${totalCodes} discount codes across ${Object.keys(sites).length} sites`);
    return { success: true, totalCodes, siteCount: Object.keys(sites).length, errors };
}

// Callable: Admin gọi thủ công từ app
exports.gpSyncDiscounts = onCall({ maxInstances: 1, timeoutSeconds: 60 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Chưa đăng nhập.");
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "ADMIN") {
        throw new HttpsError("permission-denied", "Chỉ Admin mới được sync.");
    }
    console.log(`[SyncDisc] Manual sync triggered by ${request.auth.uid}`);
    const result = await syncDiscountsFromGP();
    return result;
});

// Scheduled: Tự động sync mỗi ngày 7h sáng VN (0:00 UTC)
exports.gpSyncDiscountsScheduled = onSchedule(
    {
        schedule: "0 0 * * *",  // 0:00 UTC = 7:00 AM Vietnam
        timeZone: "Asia/Ho_Chi_Minh",
        region: "asia-southeast1",
        retryCount: 1,
    },
    async () => {
        console.log("[SyncDisc] Scheduled daily sync started");
        await syncDiscountsFromGP();
    }
);
