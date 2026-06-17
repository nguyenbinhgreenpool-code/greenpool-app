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

// ============ GREENPOOL PROXY ============ //
// Tạo subscribe trên GreenPool từ server (bypass CORS issues)
exports.gpCreateSubscribe = onCall({ maxInstances: 10 }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Chưa đăng nhập.");
    }
    const { salePhone, salePassword, personInfo, subscribeInfo, paymentInfo, branchId: clientBranchId, customerSource } = request.data;
    
    // Mapping site → tài khoản GP thuộc site đó (tránh Admin site 3 tạo gói site khác)
    const SITE_ACCOUNTS = {
        1: { phone: '0865028566', pass: '123456789', label: 'Sale NCT' },      // Đoàn Trung Kiên
        2: { phone: '0769101101', pass: '123456789', label: 'Sale CTT' },      // Quán Thị Hồng
        3: { phone: '0334019412', pass: '123456789', label: 'Sale TK' },       // Nguyễn Thị Dung - Sale TK (site 3)
        4: { phone: '0326324642', pass: '123456789', label: 'Sale HM' },       // Ngọc Thị Linh - Sale HM (site 4)
        5: { phone: '0934654683', pass: '123456789', label: 'Sale TT' }        // Mai Anh Thanh Trì (site 5)
    };
    const targetSiteId = subscribeInfo?.site_id || paymentInfo?.site_id || 2;
    const siteFallback = SITE_ACCOUNTS[targetSiteId] || SITE_ACCOUNTS[2];

    // LUÔN ưu tiên tài khoản ĐÚNG SITE trước → đảm bảo person+subscribe tạo ở đúng cơ sở
    console.log(`[GP] Called by ${request.auth.uid}, salePhone=${salePhone || '(none)'}, targetSite=${targetSiteId} (${siteFallback.label})`);
    if (!personInfo || !subscribeInfo) {
        throw new HttpsError("invalid-argument", "Thiếu personInfo hoặc subscribeInfo.");
    }

    const GP_BASE = "https://quanly.greenpool.vn/api";
    try {
        // 1. Login GP — ưu tiên tài khoản đúng site TRƯỚC, sale phone là fallback
        let token = null;
        const loginAttempts = [
            { phone: siteFallback.phone, pass: siteFallback.pass, label: `${siteFallback.label} (site ${targetSiteId})` }
        ];
        // Thêm salePhone làm fallback nếu khác với site account
        if (salePhone && salePhone !== siteFallback.phone) {
            loginAttempts.push({ phone: salePhone, pass: salePassword || '123456789', label: 'Sale-fallback' });
        }

        for (const attempt of loginAttempts) {
            console.log(`[GP] Login attempt: ${attempt.label} (${attempt.phone})...`);
            try {
                const loginRes = await fetch(`${GP_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ phone: attempt.phone, password: attempt.pass })
                });
                const loginData = await loginRes.json();
                if (loginData.status === 'success' && loginData.authorisation?.token) {
                    token = loginData.authorisation.token;
                    console.log(`[GP] ✅ Login OK via ${attempt.label}`);
                    break;
                }
                console.warn(`[GP] ⚠️ Login ${attempt.label} failed: ${loginData.status}`);
            } catch (loginErr) {
                console.error(`[GP] Login ${attempt.label} error: ${loginErr.message}`);
            }
        }

        if (!token) {
            console.error(`[GP] ❌ All login attempts failed for salePhone=${salePhone}`);
            return { success: false, error: 'GP login failed - all attempts exhausted' };
        }
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // ========== BƯỚC 2: CHECK TRÙNG HĐ (CHỈ CÙNG CƠ SỞ) ==========
        const contractNumber = subscribeInfo.contract || '';
        const siteId = subscribeInfo.site_id || paymentInfo.site_id;
        const branchId = clientBranchId || ''; // branchId từ client

        if (contractNumber) {
            console.log(`[GP] Checking duplicate contract: "${contractNumber}" (site: ${siteId}, branch: ${branchId})`);

            // Check 1: Firestore — cùng HĐ + cùng branchId + đã sync GP
            let firestoreQuery = db.collection('students').where('contractNumber', '==', contractNumber);
            if (branchId) firestoreQuery = firestoreQuery.where('branchId', '==', branchId);
            const existingDocs = await firestoreQuery.limit(5).get();
            const syncedDoc = existingDocs.docs.find(d => d.data().gpSubscribeId);
            if (syncedDoc) {
                const sData = syncedDoc.data();
                const msg = `Mã HĐ "${contractNumber}" đã sync GP (GP #${sData.gpSubscribeId}) cho ${sData.name || '?'} tại cơ sở này`;
                console.warn(`[GP] ⚠️ ${msg}`);
                return { success: false, reason: 'duplicate_contract', error: 'duplicate_contract', message: msg, existingSubscribeId: sData.gpSubscribeId, existingPersonName: sData.name };
            }

            // Check 2: GP API — cùng HĐ + cùng site
            try {
                const gpSearchRes = await fetch(`${GP_BASE}/admin/subscribe?filter[contract]=${encodeURIComponent(contractNumber)}&size=20`, { method: 'GET', headers });
                const gpSearchData = await gpSearchRes.json();
                const gpSubs = gpSearchData?.data || [];
                console.log(`[GP] GP search "${contractNumber}": ${gpSubs.length} results`);
                
                // Tìm exact match contract (listing API có thể partial match)
                const exactMatches = gpSubs.filter(s => s.contract === contractNumber && s.deleted_at === null);
                
                if (exactMatches.length > 0) {
                    // Listing API không trả site_id → check detail nếu cần
                    let gpExisting = null;
                    for (const em of exactMatches) {
                        // Nếu có site_id trong listing → check ngay
                        if (em.site_id && siteId && String(em.site_id) === String(siteId)) {
                            gpExisting = em;
                            break;
                        }
                        // Nếu listing thiếu site_id → fetch detail
                        if (!em.site_id) {
                            try {
                                const detRes = await fetch(`${GP_BASE}/admin/subscribe/${em.id}`, { method: 'GET', headers });
                                const detData = await detRes.json();
                                const detSiteId = detData?.subscribe?.package?.site_id || detData?.payment?.site_id;
                                if (detSiteId && siteId && String(detSiteId) === String(siteId)) {
                                    gpExisting = em;
                                    break;
                                }
                            } catch (e) { /* skip */ }
                        }
                    }
                    
                    if (gpExisting) {
                        const msg = `Mã HĐ "${contractNumber}" đã tồn tại trên GP cùng cơ sở (GP #${gpExisting.id})`;
                        console.warn(`[GP] ⚠️ ${msg}`);
                        // Auto-mark Firestore as synced
                        if (branchId) {
                            try {
                                const markQuery = db.collection('students')
                                    .where('contractNumber', '==', contractNumber)
                                    .where('branchId', '==', branchId);
                                const markDocs = await markQuery.limit(3).get();
                                const batch = db.batch();
                                markDocs.docs.forEach(doc => {
                                    if (!doc.data().gpSubscribeId) {
                                        batch.update(doc.ref, {
                                            gpSynced: true,
                                            gpSubscribeId: gpExisting.id,
                                            gpNote: 'Auto-linked: đã có trên GP'
                                        });
                                    }
                                });
                                await batch.commit();
                            } catch (e) { /* skip */ }
                        }
                        return { success: false, reason: 'duplicate_contract', error: 'duplicate_contract', message: msg, existingSubscribeId: gpExisting.id };
                    }
                }
            } catch (gpSearchErr) {
                console.warn(`[GP] ⚠️ GP search failed (continuing): ${gpSearchErr.message}`);
            }
            console.log(`[GP] ✅ Contract "${contractNumber}" chưa có ở cơ sở này → tiếp tục`);
        }

        // ========== BƯỚC 3: TÌM/TẠO PERSON (theo SĐT → check tên) ==========
        let personId = null;
        let memberId = null;
        const phone = personInfo.phone;
        const inputName = (personInfo.fullname || '').trim().toUpperCase();

        if (phone) {
            console.log(`[GP] Step 1: Search person by phone: ${phone}`);
            const searchRes = await fetch(`${GP_BASE}/admin/person?filter[phone]=${phone}&size=10`, { method: 'GET', headers });
            const searchData = await searchRes.json();
            const persons = searchData?.data || [];

            if (persons.length > 0) {
                // SĐT đã có → check tên
                const matchedPerson = persons.find(p => (p.fullname || '').trim().toUpperCase() === inputName);

                if (matchedPerson) {
                    // ĐÚNG TÊN → verify person accessible từ token hiện tại (cùng site)
                    try {
                        const verifyRes = await fetch(`${GP_BASE}/admin/person/${matchedPerson.id}`, { method: 'GET', headers });
                        if (verifyRes.ok) {
                            personId = matchedPerson.id;
                            console.log(`[GP] Step 2a: Phone + Name match → verified person #${personId} (${matchedPerson.fullname})`);
                        } else {
                            console.warn(`[GP] ⚠️ Person #${matchedPerson.id} exists but NOT accessible (khác site) → will create new`);
                        }
                    } catch (vErr) {
                        console.warn(`[GP] ⚠️ Person verify failed: ${vErr.message} → will create new`);
                    }
                } else {
                    // KHÁC TÊN → tạo person MỚI
                    console.log(`[GP] Step 2b: Phone exists but name "${inputName}" ≠ "${persons[0].fullname}" → create NEW person`);
                }
            } else {
                console.log(`[GP] Step 2: Phone not found → will create new person`);
            }
        }

        // ========== BƯỚC 3.5: TẠO LEAD TRƯỚC (GP bắt buộc lead_id khi tạo Person) ==========
        let leadId = null;
        if (!personId) {
            try {
                const leadPayload = {
                    name: personInfo.fullname || '',
                    phone: phone || '',
                    site_id: targetSiteId,
                    status: 'new'
                };
                console.log(`[GP] Step 3a: Creating Lead: ${leadPayload.name} (${leadPayload.phone})`);
                const leadRes = await fetch(`${GP_BASE}/admin/leads`, { method: 'POST', headers, body: JSON.stringify(leadPayload) });
                const leadData = await leadRes.json();
                leadId = leadData?.id;
                if (leadId) {
                    console.log(`[GP] ✅ Lead created: #${leadId} (assigned_to: ${leadData.assigned_to})`);
                } else {
                    console.warn(`[GP] ⚠️ Lead creation failed:`, JSON.stringify(leadData).substring(0, 200));
                    // Lead trùng phone → tìm lead cũ để lấy ID
                    if (phone) {
                        const existLeadRes = await fetch(`${GP_BASE}/admin/leads?filter[phone]=${phone}&size=5`, { method: 'GET', headers });
                        const existLeadData = await existLeadRes.json();
                        const existLead = (existLeadData?.data || []).find(l => l.phone === phone);
                        if (existLead) {
                            leadId = existLead.id;
                            console.log(`[GP] ✅ Found existing lead: #${leadId} (${existLead.name})`);
                        }
                    }
                }
            } catch (leadErr) {
                console.warn(`[GP] ⚠️ Lead creation error (continuing): ${leadErr.message}`);
            }
        }

        // Tạo person mới nếu chưa có (truyền lead_id nếu có)
        if (!personId) {
            console.log(`[GP] Step 3b: Creating new person: ${personInfo.fullname} (${phone}) lead_id=${leadId || 'none'}`);
            const personPayload = { ...personInfo };
            if (typeof personPayload.gender === 'string') {
                personPayload.gender = personPayload.gender === 'female' ? 2 : 1;
            }
            if (!personPayload.address) personPayload.address = 'Hà Nội';
            if (leadId) personPayload.by_lead_id = leadId;

            const personRes = await fetch(`${GP_BASE}/admin/person`, { method: 'POST', headers, body: JSON.stringify(personPayload) });
            const personData = await personRes.json();
            personId = personData?.id || personData?.data?.id;

            // Retry: nếu lỗi quyền chuyển đổi lead → tạo person KHÔNG có by_lead_id
            if (!personId && leadId && JSON.stringify(personData).includes('quy\u1EC1n')) {
                console.warn(`[GP] ⚠️ Lead permission error → retrying WITHOUT by_lead_id`);
                delete personPayload.by_lead_id;
                const retryPersonRes = await fetch(`${GP_BASE}/admin/person`, { method: 'POST', headers, body: JSON.stringify(personPayload) });
                const retryPersonData = await retryPersonRes.json();
                personId = retryPersonData?.id || retryPersonData?.data?.id;
                if (personId) {
                    console.log(`[GP] ✅ Person created (no lead): #${personId}`);
                }
            }

            // GP chặn tạo trùng phone → xử lý theo tên
            if (!personId && phone) {
                console.warn(`[GP] Person create failed → re-searching phone: ${phone}`);
                const retryRes = await fetch(`${GP_BASE}/admin/person?filter[phone]=${phone}&size=10`, { method: 'GET', headers });
                const retryData = await retryRes.json();
                const retryPersons = retryData?.data || [];

                // Verify từng person xem có accessible từ site hiện tại không
                let verifiedPerson = null;
                for (const rp of retryPersons) {
                    try {
                        const vr = await fetch(`${GP_BASE}/admin/person/${rp.id}`, { method: 'GET', headers });
                        if (vr.ok) { verifiedPerson = rp; break; }
                    } catch (e) { /* skip */ }
                }

                if (verifiedPerson && (verifiedPerson.fullname || '').trim().toUpperCase() === inputName) {
                    personId = verifiedPerson.id;
                    console.log(`[GP] ✅ Found verified person on retry: #${personId}`);
                } else if (verifiedPerson) {
                    // TÊN KHÁC nhưng cùng site → tạo "Thành viên phụ" (member)
                    personId = verifiedPerson.id;
                    console.warn(`[GP] ⚠️ GP blocked same phone, name "${inputName}" ≠ "${verifiedPerson.fullname}" → creating MEMBER under person #${personId}`);
                    try {
                        const gpGender = (personInfo.gender === 2 || personInfo.gender === 'female') ? 'female' : 'male';
                        const memberRes = await fetch(`${GP_BASE}/admin/member`, {
                            method: 'POST', headers,
                            body: JSON.stringify({
                                owner_person_id: personId,
                                fullname: personInfo.fullname,
                                member_type: 'training',
                                gender: gpGender
                            })
                        });
                        const memberData = await memberRes.json();
                        if (memberData?.id) {
                            memberId = memberData.id;
                            console.log(`[GP] ✅ Member created: #${memberId} (${personInfo.fullname}) under person #${personId} (${retryPersons[0].fullname})`);
                        } else {
                            console.warn(`[GP] ⚠️ Member creation failed: ${JSON.stringify(memberData).substring(0, 150)}`);
                        }
                    } catch (memberErr) {
                        console.warn(`[GP] ⚠️ Member error: ${memberErr.message}`);
                    }
                }
            }

            if (!personId) {
                console.error(`[GP] ❌ Person creation failed:`, JSON.stringify(personData).substring(0, 300));
                // Gửi thông báo cho Admin
                await notifyAdminSyncError(contractNumber, personInfo.fullname, 'Person creation failed: ' + (JSON.stringify(personData).substring(0, 100)));
                return { success: false, error: 'Person creation failed', detail: personData };
            }
            console.log(`[GP] ✅ Person ready: #${personId}${memberId ? ', Member: #' + memberId : ''}`);
        }

        // ========== BƯỚC 3.9: UPDATE PERSON VỚI NGUỒN KHÁCH ==========
        const sourceValue = customerSource || personInfo?.mkt_source || personInfo?.mkt_channel || null;
        if (sourceValue && personId) {
            try {
                // Lấy thông tin person hiện tại để có đủ required fields
                const pGetRes = await fetch(`${GP_BASE}/admin/person/${personId}`, { method: 'GET', headers });
                const pCurrent = await pGetRes.json();
                const updateBody = {
                    fullname: pCurrent.fullname || personInfo.fullname,
                    phone: pCurrent.phone || personInfo.phone,
                    gender: pCurrent.gender || 1,
                    address: pCurrent.address || 'Hà Nội',
                    birthday: pCurrent.birthday || '2000-01-01',
                    mkt_channel: sourceValue,
                    mkt_source: sourceValue
                };
                const pUpdateRes = await fetch(`${GP_BASE}/admin/person/${personId}`, {
                    method: 'PUT', headers, body: JSON.stringify(updateBody)
                });
                const pUpdateData = await pUpdateRes.json();
                console.log(`[GP] ✅ Person source updated: mkt_channel=${pUpdateData.mkt_channel || 'N/A'}, mkt_source=${pUpdateData.mkt_source || 'N/A'}`);
            } catch (srcErr) {
                console.warn(`[GP] ⚠️ Person source update failed (non-critical): ${srcErr.message}`);
            }
        }

        // ========== BƯỚC 4: TẠO SUBSCRIBE ==========
        const requestBody = {
            subscribe: { ...subscribeInfo, person_id: personId },
            payment: { ...paymentInfo, person_id: personId }
        };
        Object.keys(requestBody.payment).forEach(k => {
            if (requestBody.payment[k] === undefined) delete requestBody.payment[k];
        });

        console.log(`[GP] Creating subscribe, person_id=${personId}, package=${subscribeInfo.package_id}`);
        const subRes = await fetch(`${GP_BASE}/admin/subscribe`, {
            method: 'POST', headers,
            body: JSON.stringify(requestBody)
        });
        const subText = await subRes.text();
        console.log(`[GP] Subscribe response status: ${subRes.status}, body length: ${subText.length}`);
        let subData;
        try { subData = JSON.parse(subText); } catch (e) { subData = { raw: subText }; }

        let subId = subData?.id || subData?.data?.id || subData?.subscribe?.id;

        // Nếu lỗi "khác cơ sở" HOẶC "No query results" (person thuộc site khác) → retry
        const subDataStr = JSON.stringify(subData);
        const needSiteRetry = !subId && (subDataStr.includes('kh\u00e1c c\u01a1 s\u1edf') || subDataStr.includes('No query results'));
        if (needSiteRetry) {
            const targetSiteId2 = subscribeInfo.site_id || paymentInfo.site_id || 2;
            // Mapping site → tài khoản GP thuộc site đó
            const siteFallbacks = {
                1: { phone: '0865028566', pass: '123456789', label: 'Sale NCT' },
                2: { phone: '0332143334', pass: '123456a@', label: 'Admin TTDN' },
                3: { phone: '0332143334', pass: '123456a@', label: 'Admin TK' },
                4: { phone: '0334019412', pass: '123456789', label: 'Sale HM' },
                5: { phone: '0934654683', pass: '123456789', label: 'Sale TT' }
            };
            const fallback = siteFallbacks[targetSiteId2] || siteFallbacks[2];
            console.warn(`[GP] ⚠️ Lỗi "khác cơ sở" → retry bằng ${fallback.label} (site ${targetSiteId2})`);
            try {
                const fbLoginRes = await fetch(`${GP_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ phone: fallback.phone, password: fallback.pass })
                });
                const fbLoginData = await fbLoginRes.json();
                const fbToken = fbLoginData?.authorisation?.token;
                if (fbToken) {
                    const fbHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${fbToken}` };

                    // Tìm hoặc tạo person MỚI tại đúng site bằng tài khoản site
                    let newPersonId = null;
                    const phone2 = personInfo.phone;
                    const inputName2 = (personInfo.fullname || '').trim().toUpperCase();

                    if (phone2) {
                        const searchRes2 = await fetch(`${GP_BASE}/admin/person?filter[phone]=${phone2}&size=10`, { method: 'GET', headers: fbHeaders });
                        const searchData2 = await searchRes2.json();
                        const persons2 = searchData2?.data || [];
                        const match2 = persons2.find(p => (p.fullname || '').trim().toUpperCase() === inputName2);
                        if (match2) {
                            newPersonId = match2.id;
                            console.log(`[GP] ✅ Found person at site ${targetSiteId2}: #${newPersonId}`);
                        } else if (persons2.length > 0) {
                            newPersonId = persons2[0].id;
                            console.log(`[GP] ✅ Reusing person at site ${targetSiteId2}: #${newPersonId} (${persons2[0].fullname})`);
                        }
                    }

                    // Nếu chưa có person → tạo mới bằng tài khoản site
                    if (!newPersonId) {
                        console.log(`[GP] Creating person at site ${targetSiteId2}...`);
                        const pp = { ...personInfo };
                        if (typeof pp.gender === 'string') pp.gender = pp.gender === 'female' ? 2 : 1;
                        if (!pp.address) pp.address = 'Hà Nội';
                        const pRes = await fetch(`${GP_BASE}/admin/person`, { method: 'POST', headers: fbHeaders, body: JSON.stringify(pp) });
                        const pData = await pRes.json();
                        newPersonId = pData?.id || pData?.data?.id;
                        if (newPersonId) {
                            console.log(`[GP] ✅ Person created at site ${targetSiteId2}: #${newPersonId}`);
                        } else {
                            console.warn(`[GP] ⚠️ Person creation at site failed:`, JSON.stringify(pData).substring(0, 200));
                            // Fallback: search lại
                            if (phone2) {
                                const sr = await fetch(`${GP_BASE}/admin/person?filter[phone]=${phone2}&size=5`, { method: 'GET', headers: fbHeaders });
                                const sd = await sr.json();
                                if ((sd?.data || []).length > 0) {
                                    newPersonId = sd.data[0].id;
                                    console.log(`[GP] ✅ Found on retry: #${newPersonId}`);
                                }
                            }
                        }
                    }

                    // Retry subscribe với person mới + tài khoản đúng site
                    const retryBody = {
                        subscribe: { ...subscribeInfo, person_id: newPersonId || personId },
                        payment: { ...paymentInfo, person_id: newPersonId || personId }
                    };
                    Object.keys(retryBody.payment).forEach(k => {
                        if (retryBody.payment[k] === undefined) delete retryBody.payment[k];
                    });
                    console.log(`[GP] Retry subscribe with person #${newPersonId || personId} via ${fallback.label}...`);
                    const retryRes = await fetch(`${GP_BASE}/admin/subscribe`, {
                        method: 'POST', headers: fbHeaders,
                        body: JSON.stringify(retryBody)
                    });
                    const retryText = await retryRes.text();
                    let retryData;
                    try { retryData = JSON.parse(retryText); } catch (e) { retryData = { raw: retryText }; }
                    subId = retryData?.id || retryData?.data?.id || retryData?.subscribe?.id;
                    if (subId) {
                        if (newPersonId) personId = newPersonId;
                        console.log(`[GP] ✅ Subscribe created (${fallback.label} fallback): #${subId}`);
                    } else {
                        console.error(`[GP] ❌ Site fallback cũng fail:`, JSON.stringify(retryData).substring(0, 300));
                        subData = retryData;
                    }
                }
            } catch (retryErr) { console.error(`[GP] Site fallback error:`, retryErr.message); }
        }

        if (subId) {
            console.log(`[GP] ✅ Subscribe created: #${subId}`);

            // Gán member vào subscribe (nếu trùng SĐT + tên khác → đã tạo member)
            if (memberId) {
                try {
                    const linkRes = await fetch(`${GP_BASE}/admin/subscribe-member`, {
                        method: 'POST', headers,
                        body: JSON.stringify({ subscribe_id: subId, member_id: memberId })
                    });
                    if (linkRes.status === 201 || linkRes.status === 200) {
                        console.log(`[GP] ✅ Member #${memberId} linked to subscribe #${subId}`);
                    } else {
                        const linkData = await linkRes.text();
                        console.warn(`[GP] ⚠️ Link member failed: ${linkRes.status} ${linkData.substring(0, 150)}`);
                    }
                } catch (linkErr) {
                    console.warn(`[GP] ⚠️ Link member error: ${linkErr.message}`);
                }
            }
            // Auto-save gpSubscribeId vào Firestore (cùng branchId)
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
                    console.log(`[GP] ✅ Auto-saved gpSubscribeId to ${studentDocs.size} doc(s)`);
                } catch (saveErr) {
                    console.warn(`[GP] ⚠️ Auto-save failed: ${saveErr.message}`);
                }
            }
            // ========== LINK LEAD → person (converted_customer_id) ==========
            if (personId && phone) {
                try {
                    // Tìm tất cả leads theo SĐT (bao gồm lead tạo thủ công trên GP)
                    const leadSearchRes = await fetch(`${GP_BASE}/admin/leads?filter[phone]=${phone}&size=10`, { method: 'GET', headers });
                    const leadSearchData = await leadSearchRes.json();
                    const matchedLeads = (leadSearchData.data || []).filter(l => l.status !== 'converted');
                    for (const lead of matchedLeads) {
                        await fetch(`${GP_BASE}/admin/leads/${lead.id}`, {
                            method: 'PUT', headers,
                            body: JSON.stringify({ name: lead.name, phone: lead.phone, converted_customer_id: personId })
                        });
                        console.log(`[GP] ✅ Lead #${lead.id} "${lead.name}" → linked to person #${personId}`);
                    }
                    if (matchedLeads.length === 0) console.log(`[GP] ℹ️ No unconverted leads found for phone ${phone}`);
                } catch (cvErr) {
                    console.warn(`[GP] ⚠️ Lead link failed (non-critical): ${cvErr.message}`);
                }
            }
            return { success: true, subscribeId: subId, personId: personId, leadId: leadId || null };
        }
        console.error(`[GP] ❌ Subscribe failed:`, JSON.stringify(subData).substring(0, 300));
        // Gửi thông báo cho Admin
        await notifyAdminSyncError(contractNumber, '', 'Subscribe creation failed: ' + (JSON.stringify(subData).substring(0, 100)));
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
