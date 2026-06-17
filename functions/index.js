const { onDocumentCreated } = require("firebase-functions/v2/firestore");
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

// ============ GREENPOOL PROXY (External API v2) ============ //
// Tạo subscribe trên GreenPool qua External API (API Key, không cần login)
exports.gpCreateSubscribe = onCall({ maxInstances: 10 }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Chưa đăng nhập.");
    }
    const { personInfo, subscribeInfo, paymentInfo, branchId: clientBranchId, customerSource } = request.data;

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
    // Fallback user_id theo site (user phải ĐÚNG SITE thì GP mới apply discount)
    const SITE_USER_IDS = { 1: 42, 2: 4225, 3: 4251, 4: 4245, 5: 4240 };
    const userId = parseInt(subscribeInfo.support_user_id) || SITE_USER_IDS[siteId] || 4225;

    console.log(`[GP-v2] Called by ${request.auth.uid}, phone=${phone}, site=${siteId}, contract=${contractNumber}, user_id=${userId}`);

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
        const rawDiscountCode = (paymentInfo?.discount_code || paymentInfo?.discount_value || '').trim();

        // === MAP DISCOUNT CODE THEO SITE ===
        // App gửi mã %: GIAM15 → GIAM15_NCT
        // App gửi mã số tiền: GIAM500K → NCT_G500K (chỉ dùng mã ĐÃ CÓ trên GP)
        const SITE_SUFFIX = { 1: '_NCT', 2: '_CTT', 3: '_TK', 4: '_TT', 5: '_TTRI' };
        const STANDARD_CODES = ['GIAM10', 'GIAM15', 'GIAM20', 'GIAM25', 'GIAM30', 'GIAM40', 'GIAM50'];

        // Map mã giảm số tiền cố định ĐÃ CÓ trên GP (site → amountK → GP code)
        // Site 1=NCT, 2=CTT, 3=TK, 4=HM(Hoàng Mai), 5=TT(Thanh Trì)
        // ⚠️ Chỉ dùng mã ĐÃ TỒN TẠI ĐÚNG SITE trên GP (tạo qua GP admin web)
        const FIXED_DISCOUNT_MAP = {
            1: { 500: 'NCT_G500K', 525: 'NCT_G525K', 800: 'NCT_G800K', 900: 'NCT_G900K', 1000: 'NCT_G1000K', 1200: 'NCT_G1200K' },
            2: { 200: 'CTT_G200K', 500: 'CTT_G500K', 600: 'GIAM600K', 700: 'GIAM700K', 800: 'CTT_G800K', 900: 'CTT_G900K', 1000: 'GIAM1TR', 1200: 'CTT_G1200K', 1500: 'GIAM1TR5' },
            3: { 900: 'GIAM900K', 1200: 'GIAM1200K' },
            4: { 500: 'TT_G500K', 800: 'TT_G800K', 900: 'TT_G900K', 1200: 'TT_G1200K' },  // HM: mã TT_ là tên cũ trên GP
            5: { 200: '-200K', 500: '-500k', 1000: 'COMBO HB' }  // Thanh Trì
        };

        let discountCode = rawDiscountCode;

        if (paymentInfo?.isGpCode && discountCode) {
            // Mã GP gốc từ dropdown (đã sync từ GP) → gửi thẳng, KHÔNG mapping
            console.log(`[GP-v2] GP code from dropdown: "${discountCode}" (skip mapping)`);
        } else if (discountCode && STANDARD_CODES.includes(discountCode)) {
            // Mã % chuẩn → thêm suffix site (GIAM15 → GIAM15_NCT)
            const suffix = SITE_SUFFIX[siteId] || '_CTT';
            discountCode = discountCode + suffix;
            console.log(`[GP-v2] Discount: "${rawDiscountCode}" → "${discountCode}" (site ${siteId})`);
        } else if (discountCode && /^GIAM(\d+)K$/i.test(discountCode)) {
            // Mã giảm số tiền (GIAM500K, GIAM900K...) → tra bảng mã GP
            const kMatch = discountCode.match(/^GIAM(\d+)K$/i);
            const amountK = parseInt(kMatch[1]);
            const siteMap = FIXED_DISCOUNT_MAP[siteId] || {};
            const gpCode = siteMap[amountK];
            if (gpCode) {
                discountCode = gpCode;
                console.log(`[GP-v2] Fixed discount: "${rawDiscountCode}" → "${discountCode}" (site ${siteId})`);
            } else {
                // ⚠️ Mã chưa có mapping → KHÔNG gửi lên GP (tránh nợ ảo)
                console.warn(`[GP-v2] ⚠️ Mã "${rawDiscountCode}" KHÔNG CÓ mapping cho site ${siteId} → bỏ qua discount (tránh nợ ảo)`);
                discountCode = '';  // Xoá mã → GP sẽ tính full giá, không tạo nợ ảo
            }
        } else if (discountCode && /^(\d+)%$/.test(discountCode)) {
            // Mã dạng "15%", "20%", "10%" → GIAM15_NCT, GIAM20_CTT...
            const pct = discountCode.match(/^(\d+)%$/)[1];
            const suffix = SITE_SUFFIX[siteId] || '_CTT';
            discountCode = `GIAM${pct}${suffix}`;
            console.log(`[GP-v2] Percent discount: "${rawDiscountCode}" → "${discountCode}" (site ${siteId})`);
        } else if (discountCode && /^GIAM(\d+)%/i.test(discountCode)) {
            // Mã dạng "GIAM15%", "GIAM20%TT", "GIAM25%" → GIAM15_NCT, GIAM20_CTT...
            const pct = discountCode.match(/^GIAM(\d+)%/i)[1];
            const suffix = SITE_SUFFIX[siteId] || '_CTT';
            discountCode = `GIAM${pct}${suffix}`;
            console.log(`[GP-v2] Percent discount: "${rawDiscountCode}" → "${discountCode}" (site ${siteId})`);
        } else if (discountCode && /^\d+$/.test(discountCode) && parseInt(discountCode) >= 100000) {
            // Mã dạng số thuần "500000", "1000000"... → chuyển thành K rồi tra bảng
            const amountK = Math.round(parseInt(discountCode) / 1000);
            const siteMap = FIXED_DISCOUNT_MAP[siteId] || {};
            const gpCode = siteMap[amountK];
            if (gpCode) {
                discountCode = gpCode;
                console.log(`[GP-v2] Numeric discount: "${rawDiscountCode}" → ${amountK}K → "${discountCode}" (site ${siteId})`);
            } else {
                console.warn(`[GP-v2] ⚠️ Numeric discount "${rawDiscountCode}" (${amountK}K) KHÔNG CÓ mapping cho site ${siteId} → bỏ qua`);
                discountCode = '';
            }
        } else if (discountCode && /^(\d+)K$/i.test(discountCode)) {
            // Mã dạng shorthand "500K", "200K", "1200K"... (Sale nhập tắt, không có GIAM)
            const kMatch = discountCode.match(/^(\d+)K$/i);
            const amountK = parseInt(kMatch[1]);
            const siteMap = FIXED_DISCOUNT_MAP[siteId] || {};
            const gpCode = siteMap[amountK];
            if (gpCode) {
                discountCode = gpCode;
                console.log(`[GP-v2] Shorthand discount: "${rawDiscountCode}" → ${amountK}K → "${discountCode}" (site ${siteId})`);
            } else {
                console.warn(`[GP-v2] ⚠️ Shorthand discount "${rawDiscountCode}" (${amountK}K) KHÔNG CÓ mapping cho site ${siteId} → bỏ qua`);
                discountCode = '';
            }
        } else if (discountCode) {
            // Mã cũ / mã tự nhập khác → bỏ qua nếu không nhận dạng được (tránh nợ ảo)
            console.warn(`[GP-v2] ⚠️ Discount code "${discountCode}" không nhận dạng được → bỏ qua (tránh nợ ảo)`);
            discountCode = '';
        }
        const paidAmount = parseInt(paymentInfo?.pay_amount || paymentInfo?.total_amount) || 0;
        const payMethod = paymentInfo?.pay_method || 'CASH';

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
                            batch.update(doc.ref, {
                                gpSynced: true,
                                gpSubscribeId: subId,
                                gpPersonId: personId || null,
                                gpSyncedAt: FieldValue.serverTimestamp()
                            });
                        }
                    });
                    await batch.commit();
                    console.log(`[GP-v2] ✅ Auto-saved gpSubscribeId to ${studentDocs.size} doc(s)`);
                } catch (saveErr) {
                    console.warn(`[GP-v2] ⚠️ Auto-save failed: ${saveErr.message}`);
                }
            }
            return { success: true, subscribeId: subId, personId: personId };
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
    }
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
        schedule: "0 19 * * *",   // 19:00 UTC = 2:00 AM Vietnam (UTC+7)
        timeZone: "Asia/Ho_Chi_Minh",
        region: "asia-southeast1",
        retryCount: 2,
    },
    async (event) => {
        const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "thang-long-swimming-club";
        const databaseName = backupClient.databasePath(projectId, "(default)");
        const bucket = `gs://${projectId}-firestore-backups`;
        const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

        console.log(`🔄 Bắt đầu backup Firestore → ${bucket}/${timestamp}`);

        try {
            const [response] = await backupClient.exportDocuments({
                name: databaseName,
                outputUriPrefix: `${bucket}/${timestamp}`,
                collectionIds: [], // [] = tất cả collections
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

// ===== TẠM: HTTP endpoint để gọi fix trực tiếp bằng curl (XÓA SAU KHI DÙNG) =====
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
