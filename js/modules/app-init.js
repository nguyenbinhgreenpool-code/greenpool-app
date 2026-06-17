// ===== GreenPool App — Init & Listeners (v11.0) =====
// Khởi tạo app, listeners, event bindings, sale form
// Load LAST — sau tất cả modules khác

async function gpLogin() {
    if (GP_API.token && Date.now() < GP_API.tokenExpiry) return GP_API.token;
    try {
        const res = await fetch(`${GP_API.baseUrl}/login`, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ phone: GP_API.phone, password: GP_API.password })
        });
        const data = await res.json();
        if (data.status === 'success' && data.authorisation?.token) {
            GP_API.token = data.authorisation.token;
            GP_API.tokenExpiry = Date.now() + 60 * 60 * 1000; // 1 giờ
            console.log('✅ [GP] Đăng nhập GreenPool API thành công');
            return GP_API.token;
        }
        throw new Error('Login failed: ' + JSON.stringify(data));
    } catch (e) {
        console.error('❌ [GP] Lỗi đăng nhập:', e);
        return null;
    }
}

// Gọi API GreenPool
async function gpFetch(endpoint, method = 'GET', body = null) {
    const token = await gpLogin();
    if (!token) return null;
    try {
        const opts = {
            method,
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${GP_API.baseUrl}/admin/${endpoint}`, opts);
        const text = await res.text();
        if (!text || text.trim() === '') return { success: true, status: res.status };
        try { return JSON.parse(text); } catch (e) { return { success: true, raw: text }; }
    } catch (e) {
        console.error(`❌ [GP] API Error (${endpoint}):`, e);
        return null;
    }
}

// Tạo person mới trên GreenPool (luôn tạo mới để support_user_id luôn được set)
async function gpFindOrCreatePerson(name, phone, gender) {
    if (!phone || phone.length < 8) return null;
    // Luôn tạo person mới → GreenPool sẽ set support_user_id cho subscribe
    // (Nếu dùng person cũ đã có subscribe, GP sẽ bỏ qua support_user_id)
    const gpGender = (gender === 'Nữ' || gender === 'female') ? 2 : 1;
    const newPerson = await gpFetch('person', 'POST', {
        fullname: name.toUpperCase(),
        phone: phone,
        gender: gpGender,
        address: 'Hà Nội'
    });
    if (newPerson?.id) {
        console.log(`✅ [GP] Tạo KH mới: ${name} (ID:${newPerson.id})`);
        return newPerson;
    }
    if (newPerson?.data?.id) return newPerson.data;
    console.error('❌ [GP] Không tạo được KH:', newPerson);
    return null;
}

// Tìm sale trên GreenPool bằng tên hoặc SĐT → trả full object {id, phone, fullname}
async function gpFindSale(saleName, salePhone) {
    const gpSiteId = GP_API.siteMap[currentBranchId] || 2;
    const cacheKey = `${gpSiteId}_${salePhone || saleName || ''}`;
    if (!salePhone && !saleName) return null;
    if (GP_API.saleCache[cacheKey]) return GP_API.saleCache[cacheKey];
    let res = await gpFetch(`user?role=sale&has_total=false`);
    if (res && res.data && Array.isArray(res.data)) res = res.data;
    if (!res || !Array.isArray(res)) { console.warn('[GP] Sale list empty/invalid'); return null; }

    // Lọc theo site_id trước (ưu tiên Sale cùng cơ sở)
    const sameSite = res.filter(u => u.site_id === gpSiteId);
    const searchList = sameSite.length > 0 ? sameSite : res; // fallback all nếu site rỗng

    // Tìm theo SĐT trước (chính xác nhất)
    if (salePhone) {
        const byPhone = searchList.find(u => u.phone === salePhone);
        if (byPhone) {
            const obj = { id: byPhone.id, phone: byPhone.phone, fullname: byPhone.fullname };
            GP_API.saleCache[cacheKey] = obj;
            console.log(`✅ [GP] Match Sale by phone: ${salePhone} → "${byPhone.fullname}" (site:${byPhone.site_id})`);
            return obj;
        }
        // Fallback: tìm tất cả site nếu cùng site không có
        const byPhoneAll = res.find(u => u.phone === salePhone);
        if (byPhoneAll) {
            const obj = { id: byPhoneAll.id, phone: byPhoneAll.phone, fullname: byPhoneAll.fullname };
            GP_API.saleCache[cacheKey] = obj;
            console.log(`✅ [GP] Match Sale by phone (cross-site): ${salePhone} → "${byPhoneAll.fullname}" (site:${byPhoneAll.site_id})`);
            return obj;
        }
    }

    // Tìm theo tên (chỉ trong cùng site)
    if (saleName) {
        const nameUpper = saleName.toUpperCase().trim();
        const ignoreWords = ['SALE', 'ADMIN', 'MANAGER', 'CHUYÊN', 'VIÊN', 'NHÂN'];
        const keywords = nameUpper.split(/\s+/).filter(w => w.length >= 2 && !ignoreWords.includes(w));
        console.log(`🔍 [GP] Matching Sale: "${saleName}" → keywords: [${keywords.join(', ')}] (site:${gpSiteId})`);
        
        // Ưu tiên exact match cùng site
        const candidates = [];
        for (const u of searchList) {
            const gpName = (u.fullname || '').toUpperCase();
            if (keywords.length > 0 && keywords.every(kw => gpName.includes(kw))) candidates.push(u);
        }
        
        if (candidates.length >= 1) {
            const pick = candidates[0];
            const obj = { id: pick.id, phone: pick.phone, fullname: pick.fullname };
            GP_API.saleCache[cacheKey] = obj;
            console.log(`✅ [GP] Match Sale: "${saleName}" → "${pick.fullname}" (ID:${pick.id}, site:${pick.site_id})`);
            return obj;
        }
        
        // Fallback: partial match cùng site
        for (const u of searchList) {
            const gpName = (u.fullname || '').toUpperCase();
            if (keywords.some(kw => gpName.includes(kw))) {
                const obj = { id: u.id, phone: u.phone, fullname: u.fullname };
                GP_API.saleCache[cacheKey] = obj;
                console.log(`✅ [GP] Match Sale (partial): "${saleName}" → "${u.fullname}" (ID:${u.id}, site:${u.site_id})`);
                return obj;
            }
        }
    }
    console.warn(`⚠️ [GP] Không match Sale nào cho "${saleName}" tại site ${gpSiteId}`);
    return null;
}

// Login GP bằng SĐT Sale (mỗi sale có token riêng)
async function gpLoginAsSale(saleGpPhone) {
    const cacheKey = `sale_token_${saleGpPhone}`;
    if (GP_API[cacheKey] && Date.now() < GP_API[`${cacheKey}_exp`]) return GP_API[cacheKey];
    try {
        const res = await fetch(`${GP_API.baseUrl}/login`, {
            method: 'POST', mode: 'cors', credentials: 'omit',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ phone: saleGpPhone, password: '123456789' })
        });
        const data = await res.json();
        if (data.status === 'success' && data.authorisation?.token) {
            GP_API[cacheKey] = data.authorisation.token;
            GP_API[`${cacheKey}_exp`] = Date.now() + 60 * 60 * 1000;
            console.log(`✅ [GP] Login Sale ${saleGpPhone} OK`);
            return GP_API[cacheKey];
        }
        console.warn(`⚠️ [GP] Login Sale ${saleGpPhone} thất bại`);
        return null;
    } catch (e) { console.error('[GP] Login Sale lỗi:', e); return null; }
}

// Gọi API GP với token tuỳ chọn
async function gpFetchWithToken(token, endpoint, method = 'GET', body = null) {
    try {
        const opts = {
            method, mode: 'cors', credentials: 'omit',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${GP_API.baseUrl}/admin/${endpoint}`, opts);
        const text = await res.text();
        if (!text || text.trim() === '') return { success: true, status: res.status };
        try { return JSON.parse(text); } catch (e) { return { success: true, raw: text }; }
    } catch (e) { console.error(`❌ [GP] API Error (${endpoint}):`, e); return null; }
}

// Đồng bộ HĐ sang GreenPool
async function syncToGreenPool(studentData) {
    const { name, phone, gender, curriculum, contractNumber, paymentInfo = {}, ageCategory, customerSource } = studentData;
    const gpSiteId = GP_API.siteMap[currentBranchId] || 2;
    const sitePackages = GP_API.packageMap[gpSiteId] || GP_API.packageMap[2];
    let packageId = sitePackages[curriculum];
    // Fallback: nếu curriculum = "Bơi Sải"/"Bơi Ếch" → tự map lại
    if (!packageId) {
        const fallbackMap = {
            'Bơi Ếch': ['Ếch Trẻ em', 'Ếch Người lớn'],
            'Bơi Sải': ['Sải Trẻ em', 'Sải Người lớn'],
            'Ếch Vip': ['Ếch Vip Trẻ em', 'Ếch Vip Người lớn'],
            'Sải Vip': ['Sải Vip Trẻ em', 'Sải Vip Người lớn']
        };
        const candidates = fallbackMap[curriculum];
        if (candidates) {
            // Dùng ageCategory hoặc mặc định "Trẻ em"
            const age = ageCategory || 'Trẻ em';
            const resolved = candidates.find(c => c.includes(age)) || candidates[0];
            packageId = sitePackages[resolved];
            if (packageId) console.log(`ℹ️ [GP] Fallback: "${curriculum}" → "${resolved}" (pkg ${packageId})`);
        }
    }
    if (!packageId) {
        console.warn(`⚠️ [GP] Không tìm thấy mapping gói "${curriculum}" tại site ${gpSiteId} → bỏ qua đồng bộ`);
        return { success: false, reason: 'no_mapping' };
    }
    if (!phone || phone.length < 8) {
        console.warn(`⚠️ [GP] Không có SĐT → bỏ qua đồng bộ`);
        return { success: false, reason: 'no_phone' };
    }

    try {
        // 0. Kiểm tra KH đã có trên GreenPool CÙNG CƠ SỞ → cảnh báo nếu Sale khác quản lý
        let existingSupportUser = null;
        try {
            const gpSiteId = GP_API.siteMap[currentBranchId] || 2;
            const existSearch = await gpFetch(`person?filter[phone]=${encodeURIComponent(phone)}&size=5`);
            if (existSearch?.data?.length > 0) {
                const existPerson = existSearch.data[0];
                console.log(`ℹ️ [GP] KH "${existPerson.fullname}" (ID:${existPerson.id}) đã tồn tại trên GP`);
                // Tìm subscribe có support_user — CHỈ CÙNG SITE
                const subSearch = await gpFetch(`subscribe?filter[person_id]=${existPerson.id}&size=20`);
                const subs = subSearch?.data || [];
                for (const sub of subs) {
                    if (!sub.support_user_id) continue;
                    // Lấy site_id của subscribe (từ package hoặc trực tiếp)
                    const subSiteId = sub.package?.site_id || sub.site_id || null;
                    // Chỉ check cùng cơ sở — khác cơ sở thì bỏ qua (mỗi CS do Sale riêng chăm sóc)
                    if (subSiteId && String(subSiteId) !== String(gpSiteId)) continue;
                    existingSupportUser = sub.support_user || null;
                    if (!existingSupportUser && sub.support_user_id) {
                        existingSupportUser = { id: sub.support_user_id, fullname: `Sale #${sub.support_user_id}` };
                    }
                    break;
                }
                if (existingSupportUser) {
                    console.log(`ℹ️ [GP] KH có NV chăm sóc CÙNG CS: ${existingSupportUser.fullname} (ID:${existingSupportUser.id})`);
                }
            }
        } catch (checkErr) { console.warn('[GP] Lỗi kiểm tra KH cũ:', checkErr); }

        // 1. Tìm Sale GP (hỗ trợ override từ resync)
        const overrideSale = studentData._overrideSale || null;
        const saleUser = overrideSale || window._currentUserData || {};
        const saleName = saleUser.name || (overrideSale ? '' : currentUserDisplayName) || '';
        const salePhone = saleUser.phone || saleUser.phoneNumber || '';
        if (overrideSale) console.log(`ℹ️ [GP] Resync: dùng Sale gốc "${saleName}" (${salePhone})`);
        let gpSale = null;
        try {
            gpSale = await gpFindSale(saleName, salePhone);
        } catch (e) { console.warn('[GP] gpFindSale lỗi (CORS?):', e.message); }

        // Fallback: nếu gpFindSale fail, dùng phone từ Firestore user
        const finalSalePhone = gpSale?.phone || salePhone || '';
        if (!finalSalePhone) {
            console.warn(`⚠️ [GP] Sale "${saleName}" KHÔNG CÓ SĐT → GP sẽ dùng tài khoản site mặc định (có thể sai sale)! Hãy cập nhật SĐT cho user.`);
        }
        if (!gpSale && finalSalePhone) {
            console.log(`ℹ️ [GP] gpFindSale fail, dùng fallback phone: ${finalSalePhone}`);
        }

        // Kiểm tra: Sale hiện tại ≠ NV chăm sóc cũ CÙNG CƠ SỞ → cảnh báo
        if (existingSupportUser && gpSale) {
            const existId = String(existingSupportUser.id);
            const currentId = String(gpSale.id);
            if (existId && currentId && existId !== currentId) {
                const brName = FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || 'cơ sở';
                const warnMsg = `⚠️ CẢNH BÁO: KH "${name}" (${phone}) đang được NV "${existingSupportUser.fullname}" chăm sóc tại ${brName} trên GreenPool, nhưng Sale "${gpSale.fullname}" đang tạo HĐ mới (${contractNumber}).`;
                console.warn(warnMsg);
                try {
                    const adminSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
                    const warnP = [];
                    adminSnap.forEach(doc => { warnP.push(sendNotification(doc.id, 'system', warnMsg)); });
                    await Promise.all(warnP);
                } catch (e) { console.warn('[GP] Lỗi gửi cảnh báo Admin:', e); }
            }
        }

        // 2. Chuẩn bị data gửi Cloud Function (CF sẽ tạo person + subscribe cùng Sale token)
        const today = new Date().toISOString().split('T')[0];
        const originalAmount = parseInt(paymentInfo.totalAmount) || 0;
        const paidAmount = parseInt(paymentInfo.paidAmount) || originalAmount;
        const payMethod = paymentInfo.payMethod || 'cash';
        const discountCode = paymentInfo.discountCode || '';
        const isGpCode = paymentInfo.isGpCode || false;
        const saleGpId = gpSale?.id ? String(gpSale.id) : '';
        const gpSiteId = GP_API.siteMap[currentBranchId] || 2;
        const gpGender = (gender === 'Nữ' || gender === 'female') ? 2 : 1;

        const proxyPayload = {
            salePhone: finalSalePhone,
            branchId: currentBranchId,
            customerSource: customerSource || 'FACE',
            personInfo: {
                fullname: name.toUpperCase(),
                phone: phone,
                gender: gpGender,
                address: 'Hà Nội',
                mkt_source: customerSource || 'FACE',
                mkt_channel: customerSource || 'FACE'
            },
            subscribeInfo: {
                package_id: packageId,
                contract: contractNumber || '',
                start_date: today,
                active_type: 'FUTURE',
                support_user_id: saleGpId,
                site_id: gpSiteId
            },
            paymentInfo: {
                // GP: total=giá sau giảm, pay=giá sau giảm, GP tự tính discount từ package.price - total
                total_amount: paidAmount || originalAmount,
                remain_amount: 0,
                site_id: gpSiteId,
                mkt_source: customerSource || 'FACE',
                pay_method: payMethod,
                pay_amount: paidAmount || originalAmount,
                support_user_id: saleGpId,
                discount_type: discountCode ? 'code' : undefined,
                discount_value: discountCode ? discountCode.replace(/^GIAM/i, '').replace(/(\d+)K$/i, (m, n) => String(parseInt(n) * 1000)) : undefined
            }
        };
        console.log('📤 [GP] Proxy payload:', JSON.stringify(proxyPayload));

        // Gọi Cloud Function proxy (tạo person + subscribe cùng Sale token)
        const gpProxy = firebase.functions().httpsCallable('gpCreateSubscribe');
        try {
            const proxyResult = await gpProxy(proxyPayload);
            if (proxyResult.data?.success) {
                const subId = proxyResult.data.subscribeId;
                const gpPersonId = proxyResult.data.personId;
                console.log(`✅ [GP] Đồng bộ thành công! Subscribe ID: ${subId}, Person ID: ${gpPersonId}`);
                return { success: true, subscribeId: subId, personId: gpPersonId };
            }
            // Trùng mã HĐ trên GP → bỏ qua sync, không alert Sale
            if (proxyResult.data?.error === 'duplicate_contract') {
                const msg = proxyResult.data.message || `Mã HĐ đã tồn tại trên GreenPool`;
                console.warn(`⚠️ [GP] ${msg}`);
                return { success: false, reason: 'duplicate_contract', existingSubscribeId: proxyResult.data.existingSubscribeId, detail: msg };
            }
            console.error('❌ [GP] Tạo subscribe thất bại:', proxyResult.data);
            return { success: false, reason: 'subscribe_failed', detail: proxyResult.data };
        } catch (proxyErr) {
            console.error('❌ [GP] Cloud Function lỗi:', proxyErr);
            return { success: false, reason: 'proxy_error', detail: proxyErr.message };
        }
    } catch (e) {
        console.error('❌ [GP] Lỗi đồng bộ:', e);
        return { success: false, reason: 'error', detail: e.message };
    }
}

// ===== RESYNC: Đồng bộ lại các HĐ bị miss GP =====

window.resyncFailedGP = async function () {
    if (currentUserRole !== 'ADMIN') return alert('❌ Chỉ Admin được dùng!');
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Tìm tất cả HV tạo hôm nay, chưa sync GP
    let missedStudents = [];
    const snap = await db.collection('students')
        .where('createdAt', '>=', today)
        .get();
    snap.forEach(doc => {
        const d = doc.data();
        if (!d.gpSynced && !d.gpSubscribeId && d.contractNumber && d.phone) {
            missedStudents.push({ id: doc.id, ...d, _branchId: d.branchId || '' });
        }
    });

    if (missedStudents.length === 0) return alert('✅ Không có HĐ nào cần resync!');

    const list = missedStudents.map((s, i) => `${i + 1}. ${s.name} (HĐ: ${s.contractNumber}, ${s.curriculum || '?'}) - ${FIXED_BRANCHES.find(b => b.id === s._branchId)?.name || '?'}`).join('\n');
    if (!confirm(`🔄 Tìm thấy ${missedStudents.length} HĐ chưa sync GP:\n\n${list}\n\nBấm OK để đồng bộ tất cả.`)) return;

    // Pre-load Sale info cho tất cả creatorIds
    const creatorIds = [...new Set(missedStudents.map(s => s.creatorId || s.saleId).filter(Boolean))];
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
    console.log(`📋 Sale map:`, saleMap);

    let ok = 0, fail = 0;
    for (const s of missedStudents) {
        try {
            // Tạm set currentBranchId
            const origBranch = currentBranchId;
            currentBranchId = s._branchId;
            // Lấy Sale gốc từ creatorId
            const originalSale = saleMap[s.creatorId || s.saleId] || null;
            const result = await syncToGreenPool({
                name: s.name, phone: s.phone, gender: s.gender || '',
                curriculum: s.curriculum || 'Bơi Ếch',
                contractNumber: s.contractNumber,
                paymentInfo: { totalAmount: s.totalAmount || '0', paidAmount: s.paidAmount || '0', payMethod: 'cash' },
                ageCategory: s.ageCategory || '',
                customerSource: s.customerSource || 'FACE',
                _overrideSale: originalSale
            });
            currentBranchId = origBranch;

            if (result.success) {
                await db.collection('students').doc(s.id).update({
                    gpSynced: true,
                    gpSubscribeId: result.subscribeId,
                    gpPersonId: result.personId,
                    gpSyncedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    gpNote: 'Resync thủ công'
                });
                console.log(`✅ Resync OK: ${s.name} (${s.contractNumber}) → GP #${result.subscribeId}`);
                ok++;
            } else if (result.reason === 'duplicate_contract') {
                await db.collection('students').doc(s.id).update({
                    gpSynced: true,
                    gpSubscribeId: result.existingSubscribeId || 'existed',
                    gpSyncedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    gpNote: 'Resync: đã có trên GP'
                });
                console.log(`ℹ️ Resync: ${s.contractNumber} đã có trên GP`);
                ok++;
            } else {
                console.warn(`⚠️ Resync fail: ${s.contractNumber}`, result);
                fail++;
            }
        } catch (e) {
            console.error(`❌ Resync error: ${s.contractNumber}`, e);
            fail++;
        }
    }
    alert(`🔄 Resync hoàn tất!\n✅ Thành công: ${ok}\n❌ Thất bại: ${fail}`);
};

// ===================== BỘ LỌC THỜI GIAN ===================== //
if (typeof dateFilterMode === 'undefined') var dateFilterMode = 'all';
if (typeof dateFilterFrom === 'undefined') var dateFilterFrom = null;
if (typeof dateFilterTo === 'undefined') var dateFilterTo = null;

// Lọc danh sách theo thời gian đăng ký (createdAt)

async function checkDuplicateContract(contractNumber, branchId) {
    if (!contractNumber || !branchId) return null;
    // Check trong students — cùng cơ sở
    const studentsSnap = await db.collection('students')
        .where('contractNumber', '==', contractNumber)
        .where('branchId', '==', branchId)
        .limit(5)
        .get();
    if (!studentsSnap.empty) {
        const d = studentsSnap.docs[0].data();
        return `⚠️ Số hợp đồng "${contractNumber}" đã tồn tại!\n👤 HV: ${d.name || 'N/A'}\n📋 Loại: Học viên\n\nVui lòng kiểm tra lại.`;
    }
    // Check trong athletes (CLB) — cùng cơ sở
    const athletesSnap = await db.collection('athletes')
        .where('contractNumber', '==', contractNumber)
        .where('branchId', '==', branchId)
        .limit(5)
        .get();
    if (!athletesSnap.empty) {
        const d = athletesSnap.docs[0].data();
        return `⚠️ Số hợp đồng "${contractNumber}" đã tồn tại!\n👤 VĐV: ${d.name || 'N/A'}\n📋 Loại: CLB KID TL\n\nVui lòng kiểm tra lại.`;
    }
    return null;
}

// ===================== GOOGLE SHEET AUTO SYNC ===================== //
// Dán URL Web App từ Google Apps Script vào đây sau khi deploy
// GOOGLE_SHEET_WEBAPP_URL declared in app-sheet.js
// GOOGLE_CLB_SHEET_URL declared in app-sheet.js


function renderSaleStats() {
    const statsBox = document.getElementById('sale-personal-stats');
    const listBox = document.getElementById('sale-contracts-list');
    if (!statsBox || !listBox) return;
    if (currentUserRole !== 'SALE' && currentUserRole !== 'ADMIN' && currentUserRole !== 'MANAGER') {
        statsBox.innerHTML = '';
        listBox.innerHTML = '';
        return;
    }

    // Lọc học viên do Sale hiện tại tạo (cả Sale và Tự tuyển) — bao gồm HĐ đã chốt
    const allStudentsData = localState.allStudents || localState.students;
    const saleId = currentUserRole === 'SALE' ? currentUserId : null;
    let myStudentsRaw = saleId
        ? allStudentsData.filter(s => s.creatorId === saleId)
        : allStudentsData; // Admin/Manager thấy tất cả
    // MANAGER: chỉ xem cơ sở của mình
    if (currentUserRole === 'MANAGER' && currentBranchId) {
        myStudentsRaw = myStudentsRaw.filter(s => s.branchId === currentBranchId);
    }

    // Hiện dropdown chọn Sale cho Admin/Manager
    const saleFilterWrap = document.getElementById('stats-sale-filter-wrap');
    const saleFilterSelect = document.getElementById('stats-sale-filter');
    if ((currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') && saleFilterWrap && saleFilterSelect) {
        saleFilterWrap.style.display = 'block';
        // Re-populate danh sách Sale mỗi lần render
        const prevVal = saleFilterSelect.value;
        const creatorIds = [...new Set(allStudentsData.map(s => s.creatorId).filter(Boolean))];
        const usersMap = {};
        localState.teachers.forEach(t => { usersMap[t.id] = t.name; });
        localState.firedUsers?.forEach(u => { usersMap[u.id] = u.name; });
        // Dùng localState thay vì query Firestore (tiết kiệm reads)
        (localState.allUsers || []).forEach(u => { usersMap[u.id] = u.name; });
        // Xoá options cũ, giữ "Tất cả"
        while (saleFilterSelect.options.length > 1) saleFilterSelect.remove(1);
        creatorIds.forEach(cid => {
            if (usersMap[cid]) {
                const opt = document.createElement('option');
                opt.value = cid;
                opt.textContent = usersMap[cid];
                saleFilterSelect.appendChild(opt);
            }
        });
        saleFilterSelect.value = prevVal;
        // Filter theo Sale đã chọn
        const selectedSaleId = saleFilterSelect.value;
        if (selectedSaleId) {
            myStudentsRaw = myStudentsRaw.filter(s => s.creatorId === selectedSaleId);
        }
    } else if (saleFilterWrap) {
        saleFilterWrap.style.display = 'none';
    }

    const myStudents = filterByDate(myStudentsRaw);

    const totalContracts = myStudents.length;
    const activeCount = myStudents.filter(s => (s.sessions || 0) < (s.totalSessions || 10)).length;
    const doneCount = myStudents.filter(s => (s.sessions || 0) >= (s.totalSessions || 10)).length;
    const saleContracts = myStudents.filter(s => s.source === 'Sale').length;
    const selfContracts = myStudents.filter(s => s.source === 'Self').length;

    // Render bộ lọc thời gian + 5 ô thống kê
    statsBox.innerHTML = renderDateFilterBar() + `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 10px;">
        <div style="text-align: center; padding: 10px; background: rgba(37,99,235,0.08); border-radius: 8px; border: 1px solid rgba(37,99,235,0.15);">
            <div style="font-size: 22px; font-weight: 700; color: var(--primary);">${totalContracts}</div>
            <div style="font-size: 10px; color: var(--text-muted);">Tổng HĐ</div>
        </div>
        <div style="text-align: center; padding: 10px; background: rgba(59,130,246,0.08); border-radius: 8px; border: 1px solid rgba(59,130,246,0.15);">
            <div style="font-size: 22px; font-weight: 700; color: #3b82f6;">${activeCount}</div>
            <div style="font-size: 10px; color: var(--text-muted);">Đang học</div>
        </div>
        <div style="text-align: center; padding: 10px; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.15);">
            <div style="font-size: 22px; font-weight: 700; color: #ef4444;">${doneCount}</div>
            <div style="font-size: 10px; color: var(--text-muted);">Hoàn thành</div>
        </div>
        <div style="text-align: center; padding: 10px; background: rgba(245,158,11,0.08); border-radius: 8px; border: 1px solid rgba(245,158,11,0.15);">
            <div style="font-size: 22px; font-weight: 700; color: #f59e0b;">${saleContracts}</div>
            <div style="font-size: 10px; color: var(--text-muted);">Sale Bán</div>
        </div>
        <div style="text-align: center; padding: 10px; background: rgba(16,185,129,0.08); border-radius: 8px; border: 1px solid rgba(16,185,129,0.15);">
            <div style="font-size: 22px; font-weight: 700; color: #10b981;">${selfContracts}</div>
            <div style="font-size: 10px; color: var(--text-muted);">GV Tự tuyển</div>
        </div>
        </div>
    `;

    // Áp dụng bộ lọc + tìm kiếm
    const searchText = (document.getElementById('sale-search-student')?.value || '').trim().toLowerCase();
    let filtered = myStudents;

    // Lọc theo trạng thái
    if (saleFilterMode === 'active') {
        filtered = filtered.filter(s => (s.sessions || 0) < (s.totalSessions || 10));
    } else if (saleFilterMode === 'done') {
        filtered = filtered.filter(s => (s.sessions || 0) >= (s.totalSessions || 10));
    } else if (saleFilterMode === 'test') {
        filtered = filtered.filter(s => s.isTestStudent === true);
    }

    // Lọc theo tìm kiếm (tên, SĐT, số HĐ)
    if (searchText) {
        filtered = filtered.filter(s =>
            (s.name || '').toLowerCase().includes(searchText) ||
            (s.contractNumber || '').toLowerCase().includes(searchText) ||
            (s.phone || '').includes(searchText)
        );
    }

    // Render danh sách HĐ chi tiết
    if (filtered.length === 0) {
        listBox.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-muted); font-size:13px;">Không tìm thấy hợp đồng nào.</div>';
        return;
    }

    // Build teacher name lookup
    const teacherMap = {};
    localState.teachers.forEach(t => { teacherMap[t.id] = t.name; });
    localState.firedUsers.forEach(u => { if (!teacherMap[u.id]) teacherMap[u.id] = u.name + ' (nghỉ)'; });

    let html = '';
    filtered.forEach((st, idx) => {
        const teacherName = teacherMap[st.assignedTeacherId] || 'Chưa phân bổ';
        const isSale = st.source === 'Sale';
        const contractNum = st.contractNumber && st.contractNumber !== 'Chưa có' ? st.contractNumber : '';
        const curType = st.curriculum || 'Bơi Ếch';
        const sessions = st.sessions || 0;
        const total = st.totalSessions || 10;
        const isDone = sessions >= total;

        // Format ngày giờ điền HĐ
        let createdDateStr = '';
        if (st.createdAt) {
            const d = st.createdAt.toDate ? st.createdAt.toDate() : new Date(st.createdAt);
            createdDateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }

        html += `
            <div style="padding: 10px 12px; border: 1px solid ${isDone ? 'rgba(239,68,68,0.2)' : 'var(--border-color)'}; border-radius: 8px; background: var(--card-bg); ${isDone ? 'opacity:0.75;' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="font-weight: 600; font-size: 13px;">${idx + 1}. ${st.name}</span>
                            <span style="font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 600; ${isSale ? 'background: rgba(245,158,11,0.12); color: #d97706;' : 'background: rgba(16,185,129,0.12); color: #059669;'}">${isSale ? 'Sale' : 'Tự tuyển'}</span>
                            ${isDone ? '<span style="font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 600; background: rgba(239,68,68,0.12); color: #ef4444;">✅ Xong</span>' : ''}
                            ${st.isUpgrade ? '<span style="font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 600; background: rgba(16,185,129,0.12); color: #059669;">⬆️ NC</span>' : ''}
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px; font-size: 12px;">
                            <span style="color: var(--primary); font-weight: 500;"><i class="fa-solid fa-chalkboard-user"></i> ${teacherName}</span>
                            <span style="color: #f59e0b;"><i class="fa-solid fa-person-swimming"></i> ${curType}</span>
                            <span style="color: var(--text-muted);">${sessions}/${total} buổi</span>
                        </div>
                        ${createdDateStr ? `<div style="margin-top: 3px; font-size: 11px; color: var(--text-muted);"><i class="fa-regular fa-calendar"></i> Điền HĐ: ${createdDateStr}</div>` : ''}
                    </div>
                    ${contractNum ? `<span style="font-size: 11px; color: #8b5cf6; font-weight: 600; white-space: nowrap; background: rgba(139,92,246,0.08); padding: 3px 8px; border-radius: 6px;">HĐ: ${contractNum}</span>` : ''}
                </div>
                <div style="margin-top: 6px; display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap;">
                    <button class="btn btn-sm" onclick="editStudentInfo('${st.id}')" style="background: rgba(37,99,235,0.1); color: var(--primary); font-size: 11px; padding: 4px 10px; border: 1px solid rgba(37,99,235,0.25);">
                        <i class="fa-solid fa-pen-to-square"></i> Bổ sung TT
                    </button>
                    ${isDone ? `<button class="btn btn-sm" onclick="renewSaleContract('${st.id}', '${st.name.replace(/'/g, "\\\\'")}')" style="background:rgba(16,185,129,0.12); color:#059669; font-size:11px; padding:4px 10px; border:1px solid rgba(16,185,129,0.3); font-weight:600;">
                        <i class="fa-solid fa-arrow-rotate-right"></i> Gia hạn HĐ
                    </button>` : ''}
                </div>
            </div>
        `;
    });
    listBox.innerHTML = html;
}

// ===================== GIA HẠN HỢP ĐỒNG HV CƠ BẢN ===================== //

window.renewSaleContract = async function (studentId, studentName) {
    const st = localState.students.find(s => s.id === studentId);
    if (!st) return alert('Không tìm thấy học viên!');

    const currentSessions = st.sessions || 0;
    const currentTotal = st.totalSessions || 10;
    const oldContract = st.contractNumber || 'Chưa có';

    // Bước 1: Nhập số HĐ mới
    const newContract = prompt(
        `🔄 GIA HẠN HỢP ĐỒNG\n\n` +
        `👤 HV: ${studentName}\n` +
        `📋 HĐ cũ: ${oldContract}\n` +
        `📊 Đã học: ${currentSessions}/${currentTotal} buổi\n\n` +
        `Nhập SỐ HỢP ĐỒNG MỚI:`
    );
    if (!newContract || !newContract.trim()) return;

    // Bước 2: Chọn kiểu bơi (có thể đổi)
    const curTypes = ['Bơi Ếch', 'Bơi Sải', 'Ếch Vip', 'Sải Vip', 'Bơi Ngửa', 'Bơi Bướm', 'PT'];
    const newCurriculum = prompt(
        `🏊 Kiểu bơi hiện tại: ${st.curriculum || 'Bơi Ếch'}\n\n` +
        `Chọn kiểu bơi cho gói mới:\n${curTypes.join(' / ')}\n\n` +
        `(Bỏ trống = giữ nguyên):`,
        st.curriculum || 'Bơi Ếch'
    );
    if (newCurriculum === null) return;
    const finalCurriculum = (newCurriculum.trim() && curTypes.includes(newCurriculum.trim())) ? newCurriculum.trim() : (st.curriculum || 'Bơi Ếch');

    // Tính số buổi thêm
    let addSessions;
    if (finalCurriculum === 'Ếch Vip' || finalCurriculum === 'Sải Vip') {
        addSessions = 15;
    } else if (finalCurriculum === 'PT') {
        const ptStr = prompt('Nhập số buổi PT cần thêm:', '10');
        if (!ptStr) return;
        addSessions = parseInt(ptStr) || 10;
    } else {
        addSessions = 10;
    }

    const newTotal = currentTotal + addSessions;

    // Xác nhận
    if (!confirm(
        `✅ XÁC NHẬN GIA HẠN\n\n` +
        `👤 ${studentName}\n` +
        `📋 HĐ: ${oldContract} → ${newContract.trim()}\n` +
        `🏊 Kiểu bơi: ${finalCurriculum}\n` +
        `📊 Buổi: ${currentSessions}/${currentTotal} → ${currentSessions}/${newTotal} (+${addSessions} buổi)\n\n` +
        `⚠️ Giữ nguyên số buổi đã học & lịch sử điểm danh.`
    )) return;

    try {
        await db.collection('students').doc(studentId).update({
            contractNumber: newContract.trim(),
            totalSessions: newTotal,
            curriculum: finalCurriculum,
            renewedAt: firebase.firestore.FieldValue.serverTimestamp(),
            previousContractNumber: oldContract,
            previousTotalSessions: currentTotal,
            salaryConfirmed: false,
            saleConfirmed: false,
            isFullyCompleted: false,
            salarySubmittedMonth: '',
            isUpgrade: true
        });

        // Sync lên Google Sheet
        const branchObj = FIXED_BRANCHES.find(b => b.id === (st.branchId || currentBranchId));
        const teacherObj = localState.teachers.find(t => t.id === st.assignedTeacherId);
        syncToGoogleSheet({
            action: 'addRow',
            branchName: branchObj?.name || 'N/A',
            stt: '',
            syncTime: new Date().toLocaleString('vi-VN'),
            createdAt: new Date().toLocaleDateString('vi-VN'),
            name: studentName,
            contractNumber: newContract.trim(),
            phone: st.phone || '',
            curriculum: finalCurriculum,
            ageCategory: st.ageCategory || '',
            teacherName: teacherObj?.name || 'N/A',
            saleName: currentUserDisplayName || 'Sale',
            sessions: newTotal
        });

        // Thông báo cho GV
        if (st.assignedTeacherId) {
            await sendNotification(st.assignedTeacherId, 'contract',
                `🔄 Gia hạn HĐ: "${studentName}" (HĐ mới: ${newContract.trim()}, ${finalCurriculum}). Thêm ${addSessions} buổi → ${currentSessions}/${newTotal}.`
            );
        }

        alert(`✅ Gia hạn thành công!\n\n"${studentName}" — HĐ: ${newContract.trim()}\nBuổi: ${currentSessions}/${newTotal}`);
    } catch (e) {
        console.error('Renew sale contract error:', e);
        alert('❌ Lỗi: ' + e.message);
    }
};


function getActiveTab() {
    const active = document.querySelector('.nav-links li.active');
    return active ? active.getAttribute('data-tab') : 'dashboard';
}

// Render tab cụ thể
function renderTab(tabName) {
    switch (tabName) {
        case 'dashboard': case 'sale':
            if (typeof renderDashboard === 'function') renderDashboard();
            break;
        case 'teacher':
            if (typeof renderTeacherStudents === 'function') renderTeacherStudents();
            break;
        case 'salestats':
            if (typeof renderSaleStats === 'function') renderSaleStats();
            break;
        case 'letan':
            if (typeof renderLetanManageTable === 'function') renderLetanManageTable();
            break;
        case 'clb':
            if (typeof renderLetanClbManageTable === 'function') renderLetanClbManageTable();
            break;
    }
}


// Cập nhật giao diện — CHỈ render tab đang mở
// _uiTimer declared in app-state.js
function updateAllUI() {
    clearTimeout(_uiTimer);
    _uiTimer = setTimeout(() => {
        updateTeacherSelects();
        // Luôn render dashboard (nhẹ, chứa queue)
        if (typeof renderDashboard === 'function') renderDashboard();
        // Chỉ render thêm tab đang mở (nếu không phải dashboard)
        const activeTab = getActiveTab();
        if (activeTab !== 'dashboard' && activeTab !== 'sale') {
            renderTab(activeTab);
        }
    }, 800);
}

// ===================== REALTIME FIREBASE LISTENERS ===================== //


function listenToBranchData(branchId) {
    clearListeners();
    currentBranchId = branchId;

    // KHACHHANG: không cần listener nào — chỉ tra cứu HĐ bằng số hợp đồng
    if (currentUserRole === 'KHACHHANG') return;

    // Athletes listener: chỉ cần cho ADMIN, MANAGER, LETAN, TEACHER-HLV
    const needsAthletes = ['ADMIN', 'MANAGER', 'LETAN', 'VIEWER'].includes(currentUserRole)
        || (currentUserRole === 'TEACHER' && window._currentUserData?.isCoach);
    if (needsAthletes) {
        listenToAthletes();
    }

    // 1. Lắng nghe Giáo viên (real-time vì ít docs ~6)
    const u1 = db.collection('users').where('role', '==', 'TEACHER').where('branchId', '==', branchId)
        .onSnapshot(snap => {
            localState.teachers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateAllUI();
            // Re-render CLB cards khi teachers load (để coachMap đúng)
            if (typeof renderClbTable === 'function') renderClbTable();
        });

    // 2. Lắng nghe Học viên — lọc theo role để tiết kiệm reads
    let studentsQuery;
    if (currentUserRole === 'TEACHER') {
        // GV chỉ xem HV mình phụ trách
        studentsQuery = db.collection('students')
            .where('assignedTeacherId', '==', currentUserId);
    } else if (currentUserRole === 'SALE') {
        // Sale chỉ xem HV mình tạo
        studentsQuery = db.collection('students')
            .where('creatorId', '==', currentUserId);
    } else {
        // Admin, Manager, Lễ tân: xem toàn cơ sở
        studentsQuery = db.collection('students')
            .where('branchId', '==', branchId);
    }

    // VIEWER: chỉ xem, dùng get() 1 lần thay vì onSnapshot (tiết kiệm reads)
    if (currentUserRole === 'VIEWER') {
        studentsQuery.get().then(snap => {
            const allDocs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            localState.students = allDocs.filter(s => !s.isFullyCompleted);
            localState.allStudents = allDocs;
            const archived = allDocs.filter(s => s.isFullyCompleted === true);
            localState.archivedStudentCount = archived.length;
            const byTeacher = {};
            archived.forEach(s => {
                const tid = s.assignedTeacherId;
                if (tid) byTeacher[tid] = (byTeacher[tid] || 0) + 1;
            });
            localState.archivedCountByTeacher = byTeacher;
            localState.students.sort((a, b) => {
                const tA = a.createdAt?.toDate?.() || a.createdAt || 0;
                const tB = b.createdAt?.toDate?.() || b.createdAt || 0;
                return tB - tA;
            });
            updateAllUI();
        }).catch(e => console.error('VIEWER students load error:', e));
    } else {
    const u2 = studentsQuery.onSnapshot(snap => {
            const allDocs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            localState.students = allDocs.filter(s => !s.isFullyCompleted);
            localState.allStudents = allDocs;
            const archived = allDocs.filter(s => s.isFullyCompleted === true);
            localState.archivedStudentCount = archived.length;
            const byTeacher = {};
            archived.forEach(s => {
                const tid = s.assignedTeacherId;
                if (tid) byTeacher[tid] = (byTeacher[tid] || 0) + 1;
            });
            localState.archivedCountByTeacher = byTeacher;
            localState.students.sort((a, b) => {
                const tA = a.createdAt?.toDate?.() || a.createdAt || 0;
                const tB = b.createdAt?.toDate?.() || b.createdAt || 0;
                return tB - tA;
            });
            updateAllUI();
        });
    unsubs.push(u2);
    } // end else (non-VIEWER)

    // 3. Lắng nghe Queue (real-time vì 1 doc, cần cập nhật ngay)
    const u3 = db.collection('queues').doc(branchId)
        .onSnapshot(doc => {
            localState.queueLoaded = true;
            if (doc.exists) {
                const d = doc.data();
                localState.testingMap = d.testingMap || {};

                if (d.fixedOrder && !d.queue) {
                    const fo = d.fixedOrder || [];
                    const ci = d.currentIndex || 0;
                    const oldDm = d.debtMap || {};
                    const rotated = [...fo.slice(ci), ...fo.slice(0, ci)];
                    const newDm = {};
                    for (const [key, val] of Object.entries(oldDm)) {
                        if (key.startsWith('s') && val > 0) {
                            const idx = parseInt(key.substring(1));
                            if (fo[idx]) {
                                newDm[fo[idx]] = (newDm[fo[idx]] || 0) + val;
                            }
                        }
                    }
                    const filtered = rotated.filter(tid => {
                        const t = localState.teachers.find(tt => tt.id === tid);
                        return t && !t.queuePaused;
                    });
                    localState.queue = filtered;
                    localState.debtMap = newDm;
                    db.collection('queues').doc(branchId).update({
                        queue: filtered,
                        debtMap: newDm
                    }).catch(e => console.error('Auto-migrate to FIFO error:', e));
                    console.log('🔄 Auto-migrated from fixedOrder to FIFO queue');
                } else {
                    localState.queue = d.queue || [];
                    localState.debtMap = d.debtMap || {};
                    if (d.testCurrentIndex !== undefined) {
                        db.collection('queues').doc(branchId).update({
                            testCurrentIndex: firebase.firestore.FieldValue.delete()
                        }).catch(() => {});
                    }
                }
            } else {
                localState.queue = [];
                localState.debtMap = {};
                localState.testingMap = {};
            }
            renderDashboard();
        });

    // 4. Sale — get() 1 lần (ít thay đổi, ~3 docs)
    db.collection('users').where('role', '==', 'SALE').where('branchId', '==', branchId).get()
        .then(snap => {
            localState.sales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderDashboard();
        }).catch(e => console.error('Load sales error:', e));

    // 5. Fired users — get() 1 lần (ít thay đổi)
    db.collection('users').where('role', '==', 'FIRED').where('branchId', '==', branchId).get()
        .then(snap => {
            localState.firedUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            localState.allUsers = [...(localState.teachers || []), ...(localState.sales || []), ...(localState.firedUsers || [])];
        }).catch(e => console.error('Load fired error:', e));

    unsubs.push(u1, u3);
}

// ===================== CORE LOGIC & ACTIONS ===================== //

function resolveDebtAtFront(queue, debtMap) {
    const q = [...queue];
    const debt = { ...debtMap };
    const skipped = [];
    let safety = q.length;
    while (q.length > 0 && safety > 0) {
        const top = q[0];
        if ((debt[top] || 0) > 0) {
            const teacherName = (localState.teachers.find(t => t.id === top) || {}).name || top;
            console.warn(`⚠️ resolveDebt: "${teacherName}" có nợ ${debt[top]} → đẩy xuống cuối, nợ -1`);
            debt[top]--;
            if (debt[top] <= 0) delete debt[top];
            skipped.push(top);
            q.push(q.shift()); // xuống cuối
            safety--;
        } else {
            break;
        }
    }
    return { queue: q, debtMap: debt, skipped };
}

// ===================== QUEUE ACTION LOG ===================== //
// Ghi log thay đổi turn — giữ 5 vòng turn gần nhất

window.saleAssignStudent = async function (name, phone, gender, ageCategory, contractNumber, teacherId, curriculum, ptSessions, isException = false, age = 0, isTestStudent = false, isDiving = false, skipQueue = false, paymentInfo = {}, rawCurriculum = '') {
    // === DEDUP: Chặn gọi trùng cùng HĐ trong 30 giây ===
    if (!window._saleAssignGuard) window._saleAssignGuard = {};
    const dedupKey = (contractNumber || '') + '|' + (name || '') + '|' + teacherId;
    const now = Date.now();
    if (window._saleAssignGuard[dedupKey] && (now - window._saleAssignGuard[dedupKey]) < 30000) {
        console.warn('⚠️ [DEDUP] Chặn tạo trùng HĐ:', dedupKey, 'cách lần trước', now - window._saleAssignGuard[dedupKey], 'ms');
        return;
    }
    window._saleAssignGuard[dedupKey] = now;
    // Dọn guard cũ (>60s) tránh leak
    Object.keys(window._saleAssignGuard).forEach(k => { if (now - window._saleAssignGuard[k] > 60000) delete window._saleAssignGuard[k]; });

    if (!currentBranchId) return alert("Vui lòng chọn cơ sở gốc!");
    const tList = localState.teachers;
    const tObj = tList.find(x => x.id === teacherId);
    if (!tObj) return alert("Giáo viên không tồn tại trong DS!");

    try {
        // Kiểm tra trùng số hợp đồng (cả HV + VĐV CLB cùng cơ sở)
        if (contractNumber) {
            const dupMsg = await checkDuplicateContract(contractNumber, currentBranchId);
            if (dupMsg) return alert(dupMsg);
        }

        // Kiểm tra trùng SĐT - thông báo gói đã đăng ký
        let isUpgrade = false;
        let upgradeFromId = '';
        if (phone && phone.length >= 8) {
            const existingStudents = await db.collection('students')
                .where('branchId', '==', currentBranchId)
                .get();

            const phoneMatches = existingStudents.docs.filter(doc => {
                const d = doc.data();
                return d.phone && d.phone === phone;
            });

            if (phoneMatches.length > 0) {
                const matchInfo = phoneMatches.map((doc, i) => {
                    const d = doc.data();
                    return `  ${i + 1}. "${d.name}" — ${d.curriculum || 'Bơi Ếch'} (HĐ: ${d.contractNumber || 'N/A'}, Buổi: ${d.sessions}/${d.totalSessions || 10})`;
                }).join('\n');

                alert(`📋 SĐT "${phone}" đã đăng ký ${phoneMatches.length} gói:\n\n${matchInfo}\n\n→ HĐ mới "${name}" (${curriculum}) sẽ được tạo bình thường.`);

                isUpgrade = true;
                upgradeFromId = phoneMatches[0].id;
            }
        }

        let computedTotalSessions;
        if (DIVING_CURRICULUMS[curriculum]) {
            computedTotalSessions = DIVING_CURRICULUMS[curriculum];
        } else if (curriculum === 'Ếch Vip' || curriculum === 'Sải Vip') {
            computedTotalSessions = 15;
        } else if (curriculum === 'PT') {
            computedTotalSessions = parseInt(ptSessions) || 10;
        } else {
            computedTotalSessions = 10;
        }

        await db.collection('students').add({
            name, phone, gender, ageCategory, age: age || 0,
            assignedTeacherId: teacherId,
            contractNumber: contractNumber || 'Chưa có',
            branchId: currentBranchId,
            sessions: 0,
            totalSessions: computedTotalSessions,
            curriculum: curriculum || 'Bơi Ếch',
            source: 'Sale',
            creatorId: currentUserId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            isTestStudent: isTestStudent || false,
            isFullyCompleted: false,
            sheetSyncedAt: firebase.firestore.FieldValue.serverTimestamp(),
            ...(isUpgrade ? { isUpgrade: true, upgradeFromStudentId: upgradeFromId } : {})
        });

        // Auto sync lên Google Sheet
        const tObjSync = localState.teachers.find(t => t.id === teacherId);
        const branchObj = FIXED_BRANCHES.find(b => b.id === currentBranchId);
        syncToGoogleSheet({
            action: 'addRow',
            branchName: branchObj?.name || 'N/A',
            stt: '',
            syncTime: new Date().toLocaleString('vi-VN'),
            createdAt: new Date().toLocaleDateString('vi-VN'),
            name, 
            contractNumber: contractNumber || 'Chưa có',
            phone: phone || '',
            curriculum: curriculum || 'Bơi Ếch',
            ageCategory: ageCategory || '',
            teacherName: tObjSync?.name || 'N/A',
            saleName: currentUserDisplayName || 'Sale',
            sessions: computedTotalSessions
        });

        console.log('✅ [HĐ] Đã lưu HV, bắt đầu update queue...', { branchId: currentBranchId, teacherId, isException });
        const qDoc = db.collection('queues').doc(currentBranchId);

        // LOGIC HÀNG CHỜ MỚI (V4.14) - Sử dụng Skip List (Ghi Nợ Lượt)
        // skipQueue = true: đang gán nhiều HV trong 1 lượt, chưa phải HV cuối → không advance queue
        if (skipQueue) {
            console.log(`⏭️ [HĐ] skipQueue=true: Gán HV "${name}" cho GV "${tObj?.name}" mà KHÔNG advance queue`);
            logQueueAction({
                action: 'contract_batch',
                teacherId: teacherId,
                teacherName: tObj?.name || '',
                studentName: name,
                contractNumber: contractNumber || '',
                detail: `Gán HV "${name}" (${curriculum || 'Bơi Ếch'}) cho GV "${tObj?.name}" — cùng lượt, chưa chuyển turn`
            });
            await sendNotification(teacherId, 'contract', `📝 ${currentUserDisplayName || 'Sale'} vừa gán học viên "${name}" cho bạn (HĐ: ${contractNumber || 'Chưa có'}, ${curriculum || 'Bơi Ếch'}).`);
            // Thông báo Manager + Admin cho batch
            try {
                const mgrBatch = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', currentBranchId).get();
                const mgrPB = [];
                mgrBatch.forEach(doc => mgrPB.push(sendNotification(doc.id, 'contract', `📋 HĐ mới: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj?.name}" | HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ếch'})`)));
                await Promise.all(mgrPB);
            } catch (e) { console.error('Manager notify batch error:', e); }
            try {
                const admBatch = await db.collection('users').where('role', '==', 'ADMIN').get();
                const admPB = [];
                admBatch.forEach(doc => {
                    if (doc.id !== currentUserId) admPB.push(sendNotification(doc.id, 'contract', `📋 HĐ mới: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj?.name}" | HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ếch'}) - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`));
                });
                await Promise.all(admPB);
            } catch (e) { console.error('Admin notify batch error:', e); }
            try {
                console.log('🔄 [GP] Đồng bộ batch HV:', { name, phone, curriculum, contractNumber });
                const gpPayload = { name, phone, gender: gender || '', curriculum: rawCurriculum || curriculum || '', contractNumber: contractNumber || '', paymentInfo, ageCategory, customerSource: document.getElementById('sale-customer-source')?.value || 'FACE' };
                let gpR = await syncToGreenPool(gpPayload);
                // Retry 1 lần nếu fail (trừ duplicate)
                if (!gpR.success && gpR.reason !== 'duplicate_contract' && gpR.reason !== 'no_mapping' && gpR.reason !== 'no_phone') {
                    console.warn(`⚠️ [GP] Batch sync fail lần 1, retry sau 2s... (${contractNumber})`);
                    await new Promise(r => setTimeout(r, 2000));
                    gpR = await syncToGreenPool(gpPayload);
                }
                if (gpR.success) {
                    console.log(`✅ [GP] Batch sync OK: ${contractNumber}`);
                    try {
                        const ss = await db.collection('students').where('contractNumber', '==', contractNumber).where('branchId', '==', currentBranchId).limit(1).get();
                        if (!ss.empty) await ss.docs[0].ref.update({ gpSynced: true, gpSubscribeId: gpR.subscribeId, gpPersonId: gpR.personId, gpSyncedAt: firebase.firestore.FieldValue.serverTimestamp() });
                    } catch (e2) { console.warn('[GP] Lưu sync batch lỗi:', e2); }
                } else if (gpR.reason === 'duplicate_contract') {
                    console.log(`ℹ️ [GP] Batch: HĐ "${contractNumber}" đã có trên GP (skip)`);
                    alert(`⚠️ Mã HĐ "${contractNumber}" đã tồn tại trên GreenPool!\nGP sẽ không tạo trùng.`);
                    try {
                        const admDupBatch = await db.collection('users').where('role', '==', 'ADMIN').get();
                        admDupBatch.forEach(doc => {
                            sendNotification(doc.id, 'system', `⚠️ HĐ TRÙNG (batch): Sale "${currentUserDisplayName}" tạo HĐ "${contractNumber}" nhưng đã tồn tại trên GP (#${gpR.existingSubscribeId || '?'}) - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`);
                        });
                    } catch (e) { console.error('Admin dup batch notify error:', e); }
                    try {
                        const ss2 = await db.collection('students').where('contractNumber', '==', contractNumber).where('branchId', '==', currentBranchId).limit(1).get();
                        if (!ss2.empty) await ss2.docs[0].ref.update({ gpSynced: true, gpSubscribeId: gpR.existingSubscribeId || 'existed', gpSyncedAt: firebase.firestore.FieldValue.serverTimestamp(), gpNote: 'HĐ đã tồn tại trên GP' });
                    } catch (e3) { console.warn('[GP] Lưu duplicate batch lỗi:', e3); }
                } else {
                    console.error(`❌ [GP] Batch sync thất bại sau retry: ${contractNumber}`, gpR);
                    const errMsg1 = `🔴 GP sync thất bại (batch): HĐ "${contractNumber}" - HV "${name}" - Lỗi: ${gpR.reason || 'unknown'} - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`;
                    try {
                        const admErrBatch = await db.collection('users').where('role', '==', 'ADMIN').get();
                        admErrBatch.forEach(doc => sendNotification(doc.id, 'gp_sync_error', errMsg1));
                    } catch (e) { console.error('Admin err batch notify:', e); }
                    sendNotification(currentUserId, 'gp_sync_error', errMsg1);
                }
            } catch (gpErr) {
                console.error('⚠️ [GP] Batch sync exception:', gpErr);
                const errMsg2 = `🔴 GP sync lỗi (batch): HĐ "${contractNumber}" - HV "${name}" - ${gpErr.message || 'Unknown error'}`;
                try {
                    const admExBatch = await db.collection('users').where('role', '==', 'ADMIN').get();
                    admExBatch.forEach(doc => sendNotification(doc.id, 'gp_sync_error', errMsg2));
                } catch (e) { /* skip */ }
                sendNotification(currentUserId, 'gp_sync_error', errMsg2);
            }
            return;
        }
        if (!isException) {
            // Xác nhận bình thường → GV nhận HĐ xuống cuối, giải quyết nợ cho Top 1 mới
            let _logFromIdx = 0, _logToIdx = 0, _logDebt = {}, _logSkipped = [], _logRoundNumber = 0;
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let queue = doc.data().queue || [];
                    let dm = doc.data().debtMap || {};
                    let roundNum = doc.data().roundNumber || 1;
                    let turnsInRound = doc.data().turnsInRound || 0;
                    _logFromIdx = 0;
                    
                    if (queue.length > 0) {
                        const totalSlots = queue.length; // tổng slot trong vòng
                        
                        // GV nhận HĐ xuống cuối
                        const idx = queue.indexOf(teacherId);
                        if (idx !== -1) queue.splice(idx, 1);
                        queue.push(teacherId);
                        turnsInRound++; // 1 turn cho GV nhận HĐ
                        
                        // Giải quyết nợ cho Top 1 mới
                        const result = resolveDebtAtFront(queue, dm);
                        queue = result.queue;
                        dm = result.debtMap;
                        turnsInRound += result.skipped.length; // mỗi GV bị trừ nợ qua lượt = 1 turn
                        
                        _logSkipped = result.skipped.map(tid => {
                            const t = localState.teachers.find(tt => tt.id === tid);
                            return { teacherId: tid, teacherName: t?.name || '?', reason: 'debt' };
                        });
                        
                        // Tính vòng: chỉ tăng khi ĐỦ tất cả slot đã được xử lý
                        if (turnsInRound >= totalSlots) {
                            roundNum++;
                            turnsInRound = turnsInRound - totalSlots; // carry-over nếu dư
                        }
                        _logRoundNumber = roundNum;
                        _logToIdx = 0;
                        
                        transaction.update(qDoc, { queue, debtMap: dm, roundNumber: roundNum, turnsInRound });
                    }
                }
            });
            // Ghi log chuyển turn
            logQueueAction({
                action: 'contract',
                fromIndex: _logFromIdx,
                toIndex: _logToIdx,
                teacherId: teacherId,
                teacherName: tObj?.name || '',
                studentName: name,
                contractNumber: contractNumber || '',
                detail: `Gán HĐ "${contractNumber || 'N/A'}" cho GV "${tObj?.name}" | HV "${name}" (${curriculum || 'Bơi Ếch'})`,
                debtSnapshot: _logDebt,
                skippedSlots: _logSkipped,
                roundNumber: _logRoundNumber
            });
            alert('Đã gán Học viên thành công! Con trỏ đã chuyển sang Giáo viên tiếp theo.');
            console.log('✅ [HĐ] Queue updated + alert shown. Sending notifications...');
            await sendNotification(teacherId, 'contract', `📝 ${currentUserDisplayName || 'Sale'} vừa gán học viên "${name}" cho bạn (HĐ: ${contractNumber || 'Chưa có'}, ${curriculum || 'Bơi Ếch'}).`);
            try {
                const mgrSnap = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', currentBranchId).get();
                const mgrPromises = [];
                mgrSnap.forEach(doc => mgrPromises.push(sendNotification(doc.id, 'contract', `📋 HĐ mới: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ếch'})`)));
                await Promise.all(mgrPromises);
            } catch (e) { console.error('Manager notify error:', e); }
            try {
                const adminSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
                const admPromises = [];
                adminSnap.forEach(doc => {
                    if (doc.id !== currentUserId) admPromises.push(sendNotification(doc.id, 'contract', `📋 HĐ mới: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ếch'}) - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`));
                });
                await Promise.all(admPromises);
            } catch (e) { console.error('Admin notify error:', e); }
        } else if (isDiving) {
            // LẶN → Không theo queue, không ghi nợ, chỉ gán thẳng
            alert(`🤿 Đã gán HV "${name}" cho GV Lặn "${tObj.name}" thành công!`);
            await sendNotification(teacherId, 'contract', `🤿 ${currentUserDisplayName || 'Sale'} gán HV Lặn "${name}" cho bạn (${curriculum}).`);
            try {
                const mgrSnap3 = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', currentBranchId).get();
                const mgrP3 = [];
                mgrSnap3.forEach(doc => mgrP3.push(sendNotification(doc.id, 'contract', `🤿 HĐ Lặn: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (${curriculum})`)));
                await Promise.all(mgrP3);
            } catch (e) { console.error('Manager notify error:', e); }
            try {
                const adminSnap3 = await db.collection('users').where('role', '==', 'ADMIN').get();
                const admP3 = [];
                adminSnap3.forEach(doc => {
                    if (doc.id !== currentUserId) admP3.push(sendNotification(doc.id, 'contract', `🤿 HĐ Lặn: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (${curriculum}) - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`));
                });
                await Promise.all(admP3);
            } catch (e) { console.error('Admin notify error:', e); }
        } else {
            // Ngoại Lệ → Thêm debt cho GV. Vị trí trong queue GIỮ NGUYÊN.
            let _exRoundNum = 1;
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let dm = doc.data().debtMap || {};
                    _exRoundNum = doc.data().roundNumber || 1;
                    dm[teacherId] = (dm[teacherId] || 0) + 1;
                    transaction.update(qDoc, { debtMap: dm });
                }
            });
            // Ghi log ngoại lệ
            logQueueAction({
                action: 'contract_exception',
                teacherId: teacherId,
                teacherName: tObj?.name || '',
                studentName: name,
                contractNumber: contractNumber || '',
                detail: `HĐ ngoại lệ "${contractNumber || 'N/A'}" cho GV "${tObj?.name}" | HV "${name}" (${curriculum || 'Bơi Ếch'}). GV bị ghi nợ 1 lượt.`,
                roundNumber: _exRoundNum
            });
            alert('Đã gán HĐ NGOẠI LỆ thành công! Giáo viên nhận HĐ đã bị ghi nợ 1 vòng. Giáo viên Top 1 giữ nguyên vị trí.');
            // Gửi thông báo cho GV
            await sendNotification(teacherId, 'contract_exception', `✨ ${currentUserDisplayName || 'Sale'} gán HĐ ngoại lệ học viên "${name}" cho bạn (${curriculum || 'Bơi Ếch'}). Bạn đã bị ghi nợ 1 lượt.`);
            // Gửi thông báo cho Quản lý cơ sở và Admin
            try {
                const mgrSnap2 = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', currentBranchId).get();
                const mgrP2 = [];
                mgrSnap2.forEach(doc => mgrP2.push(sendNotification(doc.id, 'contract_exception', `📋 HĐ ngoại lệ: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (${curriculum || 'Bơi Ếch'})`)));
                await Promise.all(mgrP2);
            } catch (e) { console.error('Manager notify error:', e); }
            try {
                const adminSnap2 = await db.collection('users').where('role', '==', 'ADMIN').get();
                const admP2 = [];
                adminSnap2.forEach(doc => {
                    if (doc.id !== currentUserId) admP2.push(sendNotification(doc.id, 'contract_exception', `📋 HĐ ngoại lệ: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (${curriculum || 'Bơi Ếch'}) - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`));
                });
                await Promise.all(admP2);
            } catch (e) { console.error('Admin notify error:', e); }
        }

        // ===== ĐỒNG BỘ SANG GREENPOOL (quanly.greenpool.vn) =====
        // Chạy async, không block — nếu lỗi thì chỉ log, không ảnh hưởng Firebase
        try {
            console.log('🔄 [GP] Bắt đầu đồng bộ:', { name, phone, gender, rawCurriculum: rawCurriculum || curriculum, contractNumber });
            const gpPayload2 = {
                name, phone, gender: gender || '',
                curriculum: rawCurriculum || curriculum || '',
                contractNumber: contractNumber || '',
                paymentInfo, ageCategory,
                customerSource: document.getElementById('sale-customer-source')?.value || 'FACE'
            };
            let gpResult = await syncToGreenPool(gpPayload2);
            // Retry 1 lần nếu fail (trừ duplicate/no_mapping/no_phone)
            if (!gpResult.success && gpResult.reason !== 'duplicate_contract' && gpResult.reason !== 'no_mapping' && gpResult.reason !== 'no_phone') {
                console.warn(`⚠️ [GP] Sync fail lần 1, retry sau 2s... (${contractNumber})`);
                await new Promise(r => setTimeout(r, 2000));
                gpResult = await syncToGreenPool(gpPayload2);
            }
            if (gpResult.success) {
                console.log(`✅ [GP] Đồng bộ HĐ "${contractNumber}" → GreenPool OK (Sub:${gpResult.subscribeId})`);
                try {
                    const stuSnap = await db.collection('students')
                        .where('contractNumber', '==', contractNumber)
                        .where('branchId', '==', currentBranchId)
                        .limit(1).get();
                    if (!stuSnap.empty) {
                        await stuSnap.docs[0].ref.update({
                            gpSynced: true,
                            gpSubscribeId: gpResult.subscribeId,
                            gpPersonId: gpResult.personId,
                            gpSyncedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            gpDiscountCode: paymentInfo.discountCode || '',
                            gpTotalAmount: parseInt(paymentInfo.totalAmount) || 0,
                            gpPaidAmount: parseInt(paymentInfo.paidAmount) || 0
                        });
                    }
                } catch (e2) { console.warn('[GP] Lưu sync status lỗi:', e2); }
            } else if (gpResult.reason === 'duplicate_contract') {
                console.warn(`⚠️ [GP] HĐ "${contractNumber}" đã có trên GP (skip sync)`);
                alert(`⚠️ Mã HĐ "${contractNumber}" đã tồn tại trên GreenPool!\nGP sẽ không tạo trùng.\n\n${gpResult.message || ''}`);
                try {
                    const admDupSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
                    const admDupP = [];
                    admDupSnap.forEach(doc => {
                        admDupP.push(sendNotification(doc.id, 'system', `⚠️ HĐ TRÙNG: Sale "${currentUserDisplayName}" tạo HĐ "${contractNumber}" nhưng đã tồn tại trên GP (#${gpResult.existingSubscribeId || '?'}) - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`));
                    });
                    await Promise.all(admDupP);
                } catch (e) { console.error('Admin dup notify error:', e); }
                try {
                    const stuSnap2 = await db.collection('students')
                        .where('contractNumber', '==', contractNumber)
                        .where('branchId', '==', currentBranchId)
                        .limit(1).get();
                    if (!stuSnap2.empty) {
                        await stuSnap2.docs[0].ref.update({
                            gpSynced: true,
                            gpSubscribeId: gpResult.existingSubscribeId || 'existed',
                            gpSyncedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            gpNote: 'HĐ đã tồn tại trên GP trước khi tạo trên App'
                        });
                    }
                } catch (e3) { console.warn('[GP] Lưu duplicate status lỗi:', e3); }
            } else {
                console.warn(`⚠️ [GP] Chưa đồng bộ được sau retry: ${gpResult.reason}`);
                const errMsg3 = `🔴 GP sync thất bại: HĐ "${contractNumber}" - HV "${name}" - Lỗi: ${gpResult.reason || 'unknown'} - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`;
                try {
                    const admErrSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
                    admErrSnap.forEach(doc => sendNotification(doc.id, 'gp_sync_error', errMsg3));
                } catch (e) { /* skip */ }
                sendNotification(currentUserId, 'gp_sync_error', errMsg3);
            }
        } catch (gpErr) {
            console.error('⚠️ [GP] Lỗi đồng bộ GreenPool:', gpErr);
            const errMsg4 = `🔴 GP sync lỗi: HĐ "${contractNumber}" - HV "${name}" - ${gpErr.message || 'Unknown error'}`;
            try {
                const admExSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
                admExSnap.forEach(doc => sendNotification(doc.id, 'gp_sync_error', errMsg4));
            } catch (e) { /* skip */ }
            sendNotification(currentUserId, 'gp_sync_error', errMsg4);
        }

    } catch (e) {
        console.error('❌ [HĐ] Lỗi phân bổ:', e);
        alert('Lỗi phân bổ: ' + e);
    }
}




// ===================== EVENT BINDINGS (FORM) ===================== //

document.addEventListener('DOMContentLoaded', () => {

    // ===================== AUTHENTICATION LOGIC ===================== //
    auth = firebase.auth();
    // Giữ phiên đăng nhập ngay cả khi đóng trình duyệt
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e => console.warn('Persistence error:', e));
    const authUi = document.getElementById('auth-ui');
    const mainAppUi = document.getElementById('main-app-ui');
    const pendingUi = document.getElementById('pending-ui');
    const authForm = document.getElementById('auth-form');

    // Toggle Login/Register được handle bởi window.toggleLoginMode phía dưới

    // Toggle Mật Khẩu (Show/Hide)
    const togglePassword = document.getElementById('toggle-password-visibility');
    const passwordInput = document.getElementById('auth-password');
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            togglePassword.className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
        });
    }

    const toggleConfirmPassword = document.getElementById('toggle-confirm-password-visibility');
    const confirmPasswordInput = document.getElementById('auth-confirm-password');
    if (toggleConfirmPassword && confirmPasswordInput) {
        toggleConfirmPassword.addEventListener('click', () => {
            const type = confirmPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            confirmPasswordInput.setAttribute('type', type);
            toggleConfirmPassword.className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
        });
    }

    // Modal Quên mật khẩu
    const forgotLink = document.getElementById('auth-forgot-password-link');
    const forgotModal = document.getElementById('forgot-password-modal');
    const closeForgotModal = document.getElementById('close-forgot-modal');
    const btnSendReset = document.getElementById('btn-send-reset-email');

    if (forgotLink && forgotModal) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('forgot-email').value = document.getElementById('auth-email').value; // copy qua
            forgotModal.style.display = 'flex';
        });

        closeForgotModal.addEventListener('click', () => {
            forgotModal.style.display = 'none';
        });

        btnSendReset.addEventListener('click', async () => {
            const email = document.getElementById('forgot-email').value;
            if (!email) return alert('Vui lòng nhập định dạng email hợp lệ!');

            btnSendReset.disabled = true;
            btnSendReset.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';

            try {
                await auth.sendPasswordResetEmail(email);
                alert('Hệ thống đã gửi liên kết đặt lại mật khẩu vào hòm thư nội bộ của bạn. Vui lòng kiểm tra (Kể cả hộp thư rác).');
                forgotModal.style.display = 'none';
            } catch (err) {
                alert('Lỗi: ' + err.message);
            } finally {
                btnSendReset.disabled = false;
                btnSendReset.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi liên kết đặt lại';
            }
        });
    }

    // Submit Auth Form
    const btnAuthSubmit = document.getElementById('btn-auth-submit');
    if (btnAuthSubmit) {
        btnAuthSubmit.addEventListener('click', async (e) => {
            e.preventDefault();

            const emailInput = document.getElementById('auth-email');
            const passwordInput = document.getElementById('auth-password');
            const nameInput = document.getElementById('auth-name');
            const errorMsg = document.getElementById('auth-error-msg');

            // Validation thủ công
            if (!emailInput.value || !passwordInput.value) {
                authForm.reportValidity(); // Ép HTML5 hiên popup đỏ
                return;
            }
            if (!isLoginMode && !nameInput.value) {
                errorMsg.style.display = 'block';
                errorMsg.textContent = 'Lỗi: Vui lòng nhập Họ và Tên!';
                return;
            }

            const email = emailInput.value;
            const password = passwordInput.value;
            const name = nameInput.value;

            errorMsg.style.display = 'none';
            btnAuthSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
            btnAuthSubmit.disabled = true;

            try {
                if (isLoginMode) {
                    await auth.signInWithEmailAndPassword(email, password);
                } else {
                    const confirmPasswordInput = document.getElementById('auth-confirm-password');
                    if (!name) throw new Error('Vui lòng nhập Họ và Tên!');
                    if (password !== confirmPasswordInput.value) {
                        throw new Error('Mật khẩu xác nhận không khớp!');
                    }

                    // Đánh cờ để ngăn onAuthStateChanged xử lý trong lúc đăng ký
                    window._isRegistering = true;

                    let cred;
                    try {
                        cred = await auth.createUserWithEmailAndPassword(email, password);
                    } catch (regErr) {
                        if (regErr.code === 'auth/email-already-in-use') {
                            // TK Auth cũ còn tồn tại (data Firestore đã bị xóa)
                            // Thử đăng nhập bằng mật khẩu mới nhập
                            try {
                                cred = await auth.signInWithEmailAndPassword(email, password);
                                // Kiểm tra nếu Firestore doc đã bị xóa → tạo lại
                                const existDoc = await db.collection('users').doc(cred.user.uid).get();
                                if (!existDoc.exists) {
                                    await db.collection('users').doc(cred.user.uid).set({
                                        email: email,
                                        name: name,
                                        role: 'PENDING',
                                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                                    });
                                }
                            } catch (signInErr) {
                                window._isRegistering = false;
                                throw new Error('Email này đã được đăng ký trước đó. Vui lòng bấm "Quên mật khẩu" để lấy lại hoặc liên hệ Admin.');
                            }
                        } else {
                            window._isRegistering = false;
                            throw regErr;
                        }
                    }

                    // Check nếu đăng ký là khách hàng
                    const isCustomer = document.getElementById('auth-is-customer')?.checked;
                    const assignedRole = isCustomer ? 'KHACHHANG' : 'PENDING';

                    // Nếu là tạo mới (không phải recover), tạo Firestore doc
                    const existingDoc = await db.collection('users').doc(cred.user.uid).get();
                    if (!existingDoc.exists) {
                        await db.collection('users').doc(cred.user.uid).set({
                            email: email,
                            name: name,
                            role: assignedRole,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }

                    if (isCustomer) {
                        // Số HĐ CLB (tuỳ chọn)
                        const contractInput = document.getElementById('auth-contract-number')?.value?.trim();

                        if (contractInput) {
                            // Có nhập số HĐ → validate và liên kết
                            const athleteSnap = await db.collection('athletes').where('contractNumber', '==', contractInput).get();
                            if (athleteSnap.empty) {
                                // Xoá tài khoản vừa tạo nếu HĐ sai
                                if (cred?.user) {
                                    await db.collection('users').doc(cred.user.uid).delete().catch(() => {});
                                    await cred.user.delete().catch(() => {});
                                }
                                window._isRegistering = false;
                                throw new Error(`Số hợp đồng "${contractInput}" không tồn tại trong hệ thống! Vui lòng kiểm tra lại hoặc bỏ trống để đăng ký không liên kết.`);
                            }
                            const athleteDoc = athleteSnap.docs[0];
                            const athleteData = athleteDoc.data();

                            // Lưu linked contract vào user doc
                            await db.collection('users').doc(cred.user.uid).update({
                                linkedAthleteIds: [athleteDoc.id],
                                linkedContracts: [{
                                    athleteId: athleteDoc.id,
                                    contractNumber: contractInput,
                                    athleteName: athleteData.name || '',
                                    linkedAt: new Date().toISOString()
                                }]
                            });

                            window._isRegistering = false;
                            alert(`✅ Đăng ký thành công!\n\nĐã liên kết HĐ: ${contractInput}\nVĐV: ${athleteData.name || 'N/A'}\n\nChào mừng bạn đến GreenPool.`);
                        } else {
                            // Không nhập HĐ → đăng ký bình thường, dùng tra cứu
                            window._isRegistering = false;
                            alert('✅ Đăng ký thành công!\n\nBạn có thể tra cứu tiến trình bằng tên hoặc số HĐ.\nNếu có HĐ CLB, bạn có thể liên kết sau trong mục "Thêm HĐ".');
                        }
                        window.location.reload();
                    } else {
                        // NV: Đăng ký xong -> Đăng xuất ngay để chờ duyệt
                        await auth.signOut();
                        window._isRegistering = false;
                        alert('✅ Đăng ký tài khoản thành công! Vui lòng báo Admin phê duyệt trước khi Đăng nhập.');
                        document.getElementById('auth-name').value = '';
                        const toggleLnk = document.getElementById('auth-toggle-link');
                        if (toggleLnk) toggleLnk.click();
                    }
                }
            } catch (err) {
                window._isRegistering = false;
                errorMsg.style.display = 'block';
                errorMsg.textContent = 'Lỗi: ' + err.message;
            } finally {
                window._isRegistering = false;
                btnAuthSubmit.innerHTML = isLoginMode ? 'Đăng Nhập' : 'Đăng Ký';
                btnAuthSubmit.disabled = false;
            }
        });
    }

    // Logout Pending
    const btnPendingLogout = document.getElementById('btn-pending-logout');
    if (btnPendingLogout) btnPendingLogout.addEventListener('click', () => auth.signOut());

    // Listen to Auth State
    // Helper ẩn splash screen
    function _hideSplash() {
        var sp = document.getElementById('splash-screen');
        if (sp) { sp.classList.add('hide'); setTimeout(function() { sp.remove(); }, 600); }
    }

    auth.onAuthStateChanged(async (user) => {
        // Bỏ qua nếu đang trong quá trình đăng ký (tránh race condition)
        if (window._isRegistering) return;
        if (user) {
            currentUserId = user.uid;
            isSuperAdmin = (user.email === SUPER_ADMIN_EMAIL);
            // Fetch role
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    const data = userDoc.data();
                    currentUserRole = data.role || 'PENDING';
                    currentUserBranchId = data.branchId || null;
                    window._currentUserData = data; // Store for CLB coachClasses
                    if (currentUserRole === 'FIRED') {
                        // Tài khoản đã bị đuổi việc
                        alert('Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên. Vui lòng liên hệ Ban quản lý để biết thêm chi tiết.');
                        auth.signOut();
                        return;
                    } else if (currentUserRole === 'PENDING') {
                        authUi.style.display = 'none';
                        mainAppUi.style.display = 'none';
                        pendingUi.style.display = 'flex';
                        _hideSplash();
                    } else {
                        // LETAN: cho phép đăng nhập nhiều thiết bị
                        authUi.style.display = 'none';
                        pendingUi.style.display = 'none';
                        mainAppUi.style.display = 'flex';
                        _hideSplash();
                        applyRoleUI(currentUserRole);
                        initFixedBranches();
                        listenToNotifications();
                        requestNotificationPermission();
                        // Chạy cleanup video hết hạn sau khi auth xác nhận xong
                        if (currentUserRole === 'TEACHER' || currentUserRole === 'ADMIN') {
                            setTimeout(() => cleanupExpiredVideos(), 3000);
                        }
                    }
                    setupLogoutHeader(data.name, currentUserRole, data.avatarUrl);
                    currentUserDisplayName = data.name || 'Người dùng';
                    renderUserProfile(data);
                } else {
                    // userDoc null → retry 1 lần sau 2s (có thể do cache hết hạn)
                    console.warn('⚠️ userDoc not found, retrying in 2s...');
                    setTimeout(async () => {
                        try {
                            const retryDoc = await db.collection('users').doc(user.uid).get();
                            if (retryDoc.exists) {
                                console.log('✅ Retry success, reloading...');
                                window.location.reload();
                            } else {
                                console.error('❌ userDoc still not found after retry');
                                auth.signOut();
                            }
                        } catch (retryErr) {
                            console.warn('Retry also failed, keeping session:', retryErr);
                        }
                    }, 2000);
                }
            } catch (e) {
                console.error("Auth state error", e);
                // KHÔNG sign out khi lỗi — giữ phiên đăng nhập, thử lại sau 5s
                console.warn('⚠️ Giữ phiên đăng nhập, thử tải lại sau 5s...');
                setTimeout(async () => {
                    try {
                        const retryDoc = await db.collection('users').doc(user.uid).get();
                        if (retryDoc.exists) {
                            console.log('✅ Retry success, reloading...');
                            window.location.reload();
                        }
                    } catch (retryErr) {
                        console.warn('Retry failed, keeping session:', retryErr);
                    }
                }, 5000);
            }
        } else {
            currentUserId = null;
            currentUserRole = null;
            currentUserBranchId = null;
            currentUserDisplayName = null;
            authUi.style.display = 'flex';
            mainAppUi.style.display = 'none';
            pendingUi.style.display = 'none';
            _hideSplash();
            clearListeners();
            const infoBox = document.getElementById('user-profile-info');
            if (infoBox) infoBox.style.display = 'none';
        }
    });

    function applyRoleUI(role) {
        const tabs = document.querySelectorAll('.nav-links li');
        tabs.forEach(t => t.style.display = 'flex'); // Reset all

        // Gán class role vào body để CSS có thể ẩn/hiện phần tử theo quyền
        document.body.classList.remove('role-admin', 'role-sale', 'role-teacher', 'role-manager', 'role-letan', 'role-ketoan', 'role-viewer');
        document.body.classList.add('role-' + role.toLowerCase());

        // Hide Admin + Letan + CLB + SaleStats tab default
        const adminTab = document.getElementById('nav-item-admin');
        const letanTab = document.getElementById('nav-item-letan');
        const clbTab = document.getElementById('nav-item-clb');
        const saleStatsTab = document.getElementById('nav-item-salestats');
        const financeTab = document.getElementById('nav-item-finance');
        if (adminTab) adminTab.style.display = 'none';
        if (letanTab) letanTab.style.display = 'none';
        if (clbTab) clbTab.style.display = 'none';
        if (saleStatsTab) saleStatsTab.style.display = 'none';
        if (financeTab) financeTab.style.display = 'none';

        if (role === 'SALE') {
            const tTab = document.querySelector('[data-tab="teacher"]');
            if (tTab) tTab.style.display = 'none';
            const khTab = document.querySelector('[data-tab="khachhang"]');
            if (khTab) khTab.style.display = 'none';
            if (saleStatsTab) saleStatsTab.style.display = 'flex';
            document.querySelector('[data-tab="sale"]').click();
        } else if (role === 'TEACHER') {
            const sTab = document.querySelector('[data-tab="sale"]');
            if (sTab) sTab.style.display = 'none';
            const khTab = document.querySelector('[data-tab="khachhang"]');
            if (khTab) khTab.style.display = 'none';

            // Ẩn quyền chọn Giáo viên khác, giáo viên chỉ xem được của chính mình
            const tControl = document.querySelector('.teacher-view-controls');
            if (tControl) tControl.style.display = 'none';

            document.querySelector('[data-tab="teacher"]').click();

            // HLV: hiện tab CLB nếu isCoach
            if (window._currentUserData?.isCoach) {
                if (clbTab) clbTab.style.display = 'flex';
                listenToAthletes();
                // Đảm bảo phần điểm danh + nút xác nhận load cho HLV
                setTimeout(() => {
                    if (typeof renderClbTodayAttendance === 'function') renderClbTodayAttendance();
                }, 2000);
                // Ẩn form nhập VĐV cho HLV (chỉ Sale/Admin nhập)
                const clbAddSec = document.getElementById('clb-add-section');
                if (clbAddSec) clbAddSec.style.display = 'none';
            }

            // Ẩn ô tổng HV cơ sở cho GV
            const statTotal = document.getElementById('stat-total-students');
            if (statTotal) statTotal.style.display = 'none';
            // Ẩn card "HV Mới Hôm Nay" và section Trend/Phân tích cho GV
            const statNewToday = document.getElementById('stat-new-today-card');
            if (statNewToday) statNewToday.style.display = 'none';
            const analyticsSection = document.getElementById('dashboard-analytics-section');
            if (analyticsSection) analyticsSection.style.display = 'none';
            // Hiện nút Báo bận cho GV
            const busySection = document.getElementById('teacher-busy-section');
            if (busySection) busySection.style.display = 'block';
            const salarySection = document.getElementById('teacher-salary-section');
            if (salarySection) salarySection.style.display = 'block';
            // Lắng nghe trạng thái bận
            db.collection('users').doc(currentUserId).onSnapshot(doc => {
                if (!doc.exists) return;
                const isBusy = doc.data().isBusy || false;
                const statusText = document.getElementById('busy-status-text');
                const btn = document.getElementById('btn-toggle-busy');
                if (statusText) statusText.innerHTML = isBusy ? '🔴 Đang báo bận — Không có ở bể' : '🟢 Đang sẵn sàng dạy';
                if (btn) {
                    btn.innerHTML = isBusy ? '✅ Có mặt lại' : '⏸️ Báo bận';
                    btn.style.background = isBusy ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)';
                    btn.style.color = isBusy ? '#16a34a' : '#d97706';
                    btn.style.borderColor = isBusy ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)';
                }
                if (busySection) {
                    busySection.querySelector('div').style.borderColor = isBusy ? 'rgba(239,68,68,0.4)' : 'var(--border-color)';
                    busySection.querySelector('div').style.background = isBusy ? 'rgba(239,68,68,0.03)' : 'var(--card-bg)';
                }
            });
        } else if (role === 'ADMIN') {
            if (adminTab) adminTab.style.display = 'flex';
            if (letanTab) letanTab.style.display = 'flex';
            if (clbTab) clbTab.style.display = 'flex';
            if (saleStatsTab) saleStatsTab.style.display = 'flex';
            if (financeTab) financeTab.style.display = 'flex';
            const clbAdminActions = document.getElementById('clb-admin-actions');
            if (clbAdminActions) clbAdminActions.style.display = 'flex';

            const qHist = document.getElementById('btn-queue-history');
            if (qHist) qHist.style.display = 'inline-flex';
            document.querySelector('[data-tab="dashboard"]').click();
            loadAdminUsers();
            loadAdminClbStudents();
            listenToAthletes();
            if (typeof renderLetanClbSection === 'function') renderLetanClbSection();
            initFinanceFilters();
        } else if (role === 'VIEWER') {
            // VIEWER (Giám sát): Chỉ xem, KHÔNG cần real-time → dùng get() tiết kiệm reads
            if (adminTab) adminTab.style.display = 'none';
            if (letanTab) letanTab.style.display = 'flex';
            if (clbTab) clbTab.style.display = 'flex';
            if (saleStatsTab) saleStatsTab.style.display = 'flex';
            if (financeTab) financeTab.style.display = 'flex';
            document.querySelector('[data-tab="dashboard"]').click();
            loadAdminClbStudents();
            listenToAthletes();
            if (typeof renderLetanClbSection === 'function') renderLetanClbSection();
            initFinanceFilters();
            // Ẩn form nhập HĐ Sale + CLB
            const saleForm = document.getElementById('form-sale-add');
            if (saleForm) saleForm.closest('.section-container').style.display = 'none';
            const saleClbSec = document.getElementById('sale-clb-section');
            if (saleClbSec) saleClbSec.style.display = 'none';
            const salePenalty = document.getElementById('sale-penalty-buttons');
            if (salePenalty) salePenalty.style.display = 'none';
        } else if (role === 'MANAGER') {
            // MANAGER: Xem tất cả tab + chỉnh sửa giống Admin nhưng chỉ cơ sở của mình
            if (adminTab) adminTab.style.display = 'flex';
            if (letanTab) letanTab.style.display = 'flex';
            if (clbTab) clbTab.style.display = 'flex';
            if (financeTab) financeTab.style.display = 'flex';
            if (saleStatsTab) saleStatsTab.style.display = 'flex';
            const clbAdminActions2 = document.getElementById('clb-admin-actions');
            if (clbAdminActions2) clbAdminActions2.style.display = 'flex';

            const qHist2 = document.getElementById('btn-queue-history');
            if (qHist2) qHist2.style.display = 'inline-flex';
            document.querySelector('[data-tab="dashboard"]').click();
            loadAdminUsers();
            loadAdminClbStudents();
            listenToAthletes();
            if (typeof renderLetanClbSection === 'function') renderLetanClbSection();
            initFinanceFilters();

            // Ẩn nút đồng bộ/sao lưu — chỉ Admin mới có quyền
            const syncBtns = document.getElementById('admin-sync-buttons');
            if (syncBtns) syncBtns.style.display = 'none';

            // Chỉ ẩn phần duyệt TK + phân quyền đối với MANAGER khác cơ sở (ở bước js filter)
            // Bỏ ẩn CSS để render ra được
            // const style = document.createElement('style');
            // style.textContent = `
            //     .manager-branch #admin-approval-section,
            //     .manager-branch [onclick*="approveUser"],
            //     .manager-branch [onclick*="rejectUser"] { display: none !important; }
            // `;
            // document.head.appendChild(style);
            document.body.classList.add('manager-branch');
        } else if (role === 'LETAN') {
            // LETAN: CHỈ xem tab Lễ Tân, ẩn tất cả tab khác
            const dTab = document.querySelector('[data-tab="dashboard"]');
            if (dTab) dTab.style.display = 'none';
            const sTab = document.querySelector('[data-tab="sale"]');
            if (sTab) sTab.style.display = 'none';
            const tTab = document.querySelector('[data-tab="teacher"]');
            if (tTab) tTab.style.display = 'none';
            const setTab = document.querySelector('[data-tab="settings"]');
            if (setTab) setTab.style.display = 'none';
            const tracuuTab = document.querySelector('[data-tab="khachhang"]');
            if (tracuuTab) tracuuTab.style.display = 'none';
            if (letanTab) letanTab.style.display = 'flex';
            document.querySelector('[data-tab="letan"]').click();
            if (typeof renderLetanClbSection === 'function') renderLetanClbSection();
            if (typeof loadTodayAttendance === 'function') loadTodayAttendance();
        } else if (role === 'KETOAN') {
            // KETOAN: Dashboard (giới hạn) + Finance + Admin (chỉ bảng HV)
            const sTab = document.querySelector('[data-tab="sale"]');
            if (sTab) sTab.style.display = 'none';
            const tTab = document.querySelector('[data-tab="teacher"]');
            if (tTab) tTab.style.display = 'none';
            const khTab = document.querySelector('[data-tab="khachhang"]');
            if (khTab) khTab.style.display = 'none';
            if (financeTab) financeTab.style.display = 'flex';
            if (adminTab) adminTab.style.display = 'flex';

            // Ẩn lượt chia + HV đang học tại bể trên Dashboard
            const queueSec = document.getElementById('dashboard-queue-section');
            if (queueSec) queueSec.style.display = 'none';
            const testQueueSec = document.getElementById('test-queue-section');
            if (testQueueSec) testQueueSec.style.display = 'none';
            const poolSec = document.getElementById('dashboard-pool-section');
            if (poolSec) poolSec.style.display = 'none';

            // Admin: chỉ hiện bảng Hệ Thống Quản Lý Học Viên
            const secApproval = document.getElementById('admin-sec-approval');
            if (secApproval) secApproval.style.display = 'none';
            const secStaff = document.getElementById('admin-sec-staff');
            if (secStaff) secStaff.style.display = 'none';
            const secStats = document.getElementById('admin-sec-stats');
            if (secStats) secStats.style.display = 'none';
            const secBranch = document.getElementById('admin-sec-branch-overview');
            if (secBranch) secBranch.style.display = 'none';
            // Ẩn nút đổi MK user
            const changePwBtn = document.getElementById('btn-admin-change-pw');
            if (changePwBtn) changePwBtn.style.display = 'none';

            document.querySelector('[data-tab="dashboard"]').click();
            loadAdminUsers();
            initFinanceFilters();
            // KETOAN không cần load CLB athletes (tiết kiệm reads)
        } else if (role === 'KHACHHANG') {
            // KHACHHANG: chỉ xem Tra cứu tiến trình
            const dTab = document.querySelector('[data-tab="dashboard"]');
            if (dTab) dTab.style.display = 'none';
            const sTab = document.querySelector('[data-tab="sale"]');
            if (sTab) sTab.style.display = 'none';
            const tTab = document.querySelector('[data-tab="teacher"]');
            if (tTab) tTab.style.display = 'none';
            const setTab = document.querySelector('[data-tab="settings"]');
            if (setTab) setTab.style.display = 'none';
            const khTab = document.querySelector('[data-tab="khachhang"]');
            if (khTab) khTab.style.display = 'flex';
            document.querySelector('[data-tab="khachhang"]').click();
            // Populate branch dropdown cho Khách
            populateKhachhangBranches();
            // Load HĐ đã liên kết
            loadLinkedContracts();
        }
    }

    function setupLogoutHeader(name, role, avatarUrl) {
        const roleNames = {
            'ADMIN': '💎 Giám Đốc',
            'MANAGER': '🏢 Quản lý Cơ sở',
            'SALE': '💼 Chuyên viên Sale',
            'TEACHER': '🏊 Huấn luyện viên',
            'LETAN': '📋 Lễ tân',
            'KETOAN': '💰 Kế toán',
            'KHACHHANG': '👤 Khách hàng',
            'VIEWER': '👁️ Giám sát'
        };
        const displayRole = roleNames[role] || role;

        const nameEl = document.getElementById('current-user-name');
        const roleEl = document.getElementById('current-user-role');
        const infoBox = document.getElementById('user-profile-info');
        const btnLogout = document.getElementById('btn-header-logout');
        const avatarEl = document.getElementById('current-user-avatar');

        if (nameEl) nameEl.textContent = name || 'Trống';
        if (roleEl) roleEl.textContent = displayRole;
        if (infoBox) infoBox.style.display = 'block';

        // Render avatar in header
        if (avatarEl) {
            if (avatarUrl) {
                avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                const initial = (name || 'U').charAt(0).toUpperCase();
                avatarEl.innerHTML = `<span style="font-size:16px;font-weight:700;">${initial}</span>`;
            }
        }

        if (btnLogout && !btnLogout.hasAttribute('data-bound')) {
            btnLogout.addEventListener('click', () => {
                auth.signOut();
            });
            btnLogout.setAttribute('data-bound', 'true');
        }
    }

    // ===================== APP EVENT BINDINGS ===================== //

    // Lắng nghe Tab
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => {
            document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.getElementById(`tab-${li.getAttribute('data-tab')}`).classList.add('active');
            // Render tab vừa mở (data đã sẵn trong localState)
            const tabName = li.getAttribute('data-tab');
            renderTab(tabName);
            // Load bảng quản lý khi mở tab Lễ Tân
            if (tabName === 'letan') {
                if (typeof renderLetanManageTable === 'function') renderLetanManageTable();
                if (typeof loadTodayAttendance === 'function' && !window._todayAttLoaded) {
                    window._todayAttLoaded = true;
                    loadTodayAttendance();
                }
            }
            if (tabName === 'clb') {
                if (typeof renderClbTable === 'function') renderClbTable();
                if (typeof renderClbTodayAttendance === 'function') renderClbTodayAttendance();
            }
            // Lazy-load Admin tab: chỉ start heavy listeners khi bấm vào, unsubscribe khi rời
            if (tabName === 'admin' && (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') && currentUserRole !== 'KETOAN') {
                if (!window._adminListenersLoaded) {
                    window._adminListenersLoaded = true;
                    loadAdminStaffStats();
                    loadAdminDetailedOverview();
                }
            } else if (tabName !== 'admin' && window._adminListenersLoaded) {
                // Unsubscribe heavy listeners khi rời tab Admin
                if (typeof adminStatsUnsub === 'function') { adminStatsUnsub(); adminStatsUnsub = null; }
                if (typeof adminDetailedUnsubStudents === 'function') { adminDetailedUnsubStudents(); adminDetailedUnsubStudents = null; }
                if (typeof adminDetailedUnsubPenalties === 'function') { adminDetailedUnsubPenalties(); adminDetailedUnsubPenalties = null; }
                window._adminListenersLoaded = false;
            }
        });
    });

    let isSaleExceptionMode = false;

    // Ngoại lệ Toggle
    const toggleSaleException = document.getElementById('toggle-sale-exception');
    if (toggleSaleException) {
        toggleSaleException.addEventListener('change', (e) => {
            isSaleExceptionMode = e.target.checked;
            const normalView = document.getElementById('sale-normal-teacher-view');
            const exceptionView = document.getElementById('sale-exception-teacher-view');
            const btnConfirm = document.getElementById('btn-sale-confirm');
            const btnSkip = document.getElementById('btn-sale-skip');

            if (isSaleExceptionMode) {
                if (normalView) normalView.style.display = 'none';
                if (exceptionView) {
                    exceptionView.style.display = 'block';
                    exceptionView.innerHTML = '<select id="sale-exception-select" class="modern-select" style="border-color: #f59e0b; background-color: #fef3c7; color: #b45309;"></select>';
                    const sel = document.getElementById('sale-exception-select');
                    localState.teachers.forEach(t => {
                        const opt = document.createElement('option');
                        opt.value = t.id;
                        opt.textContent = t.name;
                        sel.appendChild(opt);
                    });
                }
                if (btnConfirm) btnConfirm.innerHTML = '<i class="fa-solid fa-star"></i> Xác nhận HĐ Ngoại Lệ';
                if (btnSkip) btnSkip.style.display = 'none'; // Ẩn nút phạt vì ngoại lệ không liên quan đến phạt Queue
            } else {
                if (normalView) normalView.style.display = 'block';
                if (exceptionView) exceptionView.style.display = 'none';
                if (btnConfirm) btnConfirm.innerHTML = '<i class="fa-solid fa-check"></i> Xác nhận Hợp Đồng';
                if (btnSkip) btnSkip.style.display = 'block';
            }
        });
    }

    // Toggle PT sessions - Sale (bỏ static binding, dùng dynamic trong generateSaleStudentForms)

    // Toggle PT sessions - Teacher
    const teacherCurriculum = document.getElementById('teacher-student-curriculum');
    const teacherPtGroup = document.getElementById('teacher-pt-sessions-group');
    if (teacherCurriculum && teacherPtGroup) {
        teacherCurriculum.addEventListener('change', (e) => {
            teacherPtGroup.style.display = e.target.value === 'PT' ? 'block' : 'none';
        });
    }

    // Format số tiền với dấu chấm ngàn
    window.formatMoney = function(el) {
        const raw = el.value.replace(/[^0-9]/g, '');
        el.value = raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };

    // Tính giảm giá tự động: từ dropdown hoặc nhập tay (GIAM500K, GIAM20%)
    window.calcDiscount = function(idx) {
        const totalEl = document.getElementById(`sale-student-total-${idx}`);
        const paidEl = document.getElementById(`sale-student-paid-${idx}`);
        const sel = document.getElementById(`sale-student-discount-${idx}`);
        const customEl = document.getElementById(`sale-student-discount-custom-${idx}`);
        const previewEl = document.getElementById(`sale-discount-preview-${idx}`);
        if (!totalEl || !paidEl) return;

        const totalRaw = parseInt(totalEl.value.replace(/\./g, '')) || 0;

        // Lấy giá trị discount: ưu tiên custom input, fallback dropdown
        let code = '';
        let dropdownValue = 0;
        let dropdownType = '';
        if (customEl && customEl.value.trim()) {
            code = customEl.value.trim().toUpperCase();
        } else if (sel && sel.value) {
            code = sel.value;
            const selOpt = sel.selectedOptions?.[0];
            dropdownType = selOpt?.dataset?.type || '';
            dropdownValue = parseInt(selOpt?.dataset?.value) || 0;
        }

        if (!totalRaw || !code) {
            if (previewEl) previewEl.style.display = 'none';
            if (!code && totalRaw) {
                paidEl.value = String(totalRaw).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            }
            return;
        }

        let discountAmount = 0;
        let discountLabel = '';

        // Mã đặc biệt: COMBO HB → giảm cố định 1.000.000đ
        const specialCodes = { 'COMBO HB': 1000000 };
        if (specialCodes[code]) {
            discountAmount = specialCodes[code];
            discountLabel = discountAmount.toLocaleString('vi-VN') + 'đ';
        }

        // Từ dropdown (đã có type/value)
        if (!discountAmount && dropdownValue > 0) {
            if (dropdownType === 'percent') {
                discountAmount = Math.round(totalRaw * dropdownValue / 100);
                discountLabel = dropdownValue + '% = ' + discountAmount.toLocaleString('vi-VN') + 'đ';
            } else if (dropdownType === 'fixed') {
                discountAmount = dropdownValue;
                discountLabel = discountAmount.toLocaleString('vi-VN') + 'đ';
            }
        }

        // 1. Parse từ mã nhập tay: GIAM500K
        if (!discountAmount) {
            const matchK = code.match(/^GIAM(\d+)K$/);
            if (matchK) {
                discountAmount = parseInt(matchK[1]) * 1000;
                discountLabel = discountAmount.toLocaleString('vi-VN') + 'đ';
            }
        }

        // 2. Parse từ mã nhập tay: GIAM20%
        if (!discountAmount) {
            const matchP = code.match(/^GIAM(\d+)%$/);
            if (matchP) {
                const pct = parseInt(matchP[1]);
                discountAmount = Math.round(totalRaw * pct / 100);
                discountLabel = pct + '% = ' + discountAmount.toLocaleString('vi-VN') + 'đ';
            }
        }

        // 3. Auto-normalize: "500K" → "GIAM500K"
        if (!discountAmount) {
            const matchShort = code.match(/^(\d+)K$/);
            if (matchShort) {
                discountAmount = parseInt(matchShort[1]) * 1000;
                discountLabel = discountAmount.toLocaleString('vi-VN') + 'đ';
            }
        }

        if (discountAmount > 0) {
            const paid = Math.max(0, totalRaw - discountAmount);
            paidEl.value = String(paid).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            if (previewEl) {
                previewEl.style.display = 'block';
                previewEl.innerHTML = '<i class="fa-solid fa-tag"></i> Giảm: <b>' + discountLabel + '</b> → Thanh toán: <b>' + paid.toLocaleString('vi-VN') + 'đ</b>';
            }
        } else if (code && !specialCodes[code]) {
            if (previewEl) {
                previewEl.style.display = 'block';
                previewEl.innerHTML = '⚠️ Mã không đúng định dạng (VD: GIAM500K, GIAM20%, COMBO HB)';
            }
            if (totalRaw) paidEl.value = String(totalRaw).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        }
    };

    // Sync mã giảm giá từ GP (Admin only)
    window.syncGpDiscounts = async function() {
        if (currentUserRole !== 'ADMIN') return alert('❌ Chỉ Admin mới được sync!');
        try {
            const btn = event?.target?.closest('button');
            if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Đang sync...'; }
            const gpSync = firebase.functions().httpsCallable('gpSyncDiscounts');
            const result = await gpSync({});
            if (result.data?.success) {
                alert(`✅ Đã sync ${result.data.totalDiscounts || 0} mã giảm giá từ GP!\n\nĐóng form và mở lại để thấy mã mới.`);
            } else {
                alert('⚠️ Sync không thành công: ' + (result.data?.error || 'Unknown'));
            }
            if (btn) { btn.disabled = false; btn.innerHTML = '🔄 Sync GP'; }
        } catch (e) {
            alert('❌ Lỗi sync: ' + e.message);
        }
    };

    // Helper: lấy discount info từ form (dropdown GP hoặc nhập tay)
    window.getDiscountInfo = function(idx) {
        const customVal = (document.getElementById(`sale-student-discount-custom-${idx}`)?.value || '').trim().toUpperCase();
        const sel = document.getElementById(`sale-student-discount-${idx}`);
        const dropdownVal = sel?.value || '';
        const isGpCode = !customVal && !!dropdownVal && sel?.selectedOptions?.[0]?.dataset?.gpCode === 'true';
        return { discountCode: customVal || dropdownVal || '', isGpCode };
    };

    // Xử lý chuyển đổi curriculum (Bơi / Lặn / PT)
    window.handleCurriculumChange = function (idx, value) {
        const ptGroup = document.getElementById(`sale-pt-group-${idx}`);
        const diveGroup = document.getElementById(`sale-dive-teacher-group-${idx}`);
        if (ptGroup) ptGroup.style.display = value === 'PT' ? 'block' : 'none';
        if (diveGroup) {
            if (isDivingCurriculum(value)) {
                diveGroup.style.display = 'block';
                // Populate danh sách GV Lặn
                const sel = document.getElementById(`sale-dive-teacher-${idx}`);
                if (sel) {
                    sel.innerHTML = '';
                    const diveTeachers = localState.teachers.filter(t => t.canDive);
                    if (diveTeachers.length === 0) {
                        sel.innerHTML = '<option value="">Chưa có GV Lặn</option>';
                    } else {
                        diveTeachers.forEach(t => {
                            sel.innerHTML += `<option value="${t.id}">${t.name}</option>`;
                        });
                    }
                }
            } else {
                diveGroup.style.display = 'none';
            }
        }

        // Ẩn/hiện phần "Giáo viên nhận hợp đồng" tuỳ theo gói lặn (giữ nút xác nhận)
        const teacherHeader = document.getElementById('sale-teacher-info-header');
        const normalView = document.getElementById('sale-normal-teacher-view');
        const exceptionView = document.getElementById('sale-exception-teacher-view');
        if (teacherHeader) {
            const count = parseInt(document.getElementById('sale-contract-count')?.value) || 1;
            let allDiving = true;
            for (let i = 1; i <= count; i++) {
                const curVal = document.getElementById(`sale-student-curriculum-${i}`)?.value || '';
                if (!isDivingCurriculum(curVal)) { allDiving = false; break; }
            }
            const hideTeacher = allDiving ? 'none' : '';
            teacherHeader.style.display = allDiving ? 'none' : 'flex';
            if (normalView) normalView.style.display = allDiving ? 'none' : '';
            if (exceptionView && allDiving) exceptionView.style.display = 'none';
        }
    };

    // ============ GENERATE DYNAMIC SALE STUDENT FORMS ============ //
    window.generateSaleStudentForms = function (count) {
        const container = document.getElementById('sale-students-container');
        if (!container) return;
        const n = parseInt(count) || 1;

        let html = '';
        if (n > 1) {
            html += `<div style="display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap;">`;
            for (let i = 1; i <= n; i++) {
                html += `<button type="button" onclick="showSaleTab(${i})" id="sale-tab-btn-${i}"
                    style="padding: 6px 14px; border-radius: 8px; border: 1px solid ${i === 1 ? 'var(--primary)' : 'var(--border-color)'};
                    background: ${i === 1 ? 'var(--primary)' : 'transparent'}; color: ${i === 1 ? '#fff' : 'var(--text-muted)'};
                    font-size: 12px; font-weight: 600; cursor: pointer;">HV ${i}</button>`;
            }
            html += `</div>`;
        }

        for (let i = 1; i <= n; i++) {
            html += `
            <div class="sale-student-block" id="sale-block-${i}" style="display: ${i === 1 ? 'block' : 'none'}; ${n > 1 ? 'padding: 12px; border: 1px solid var(--border-color); border-radius: 10px; margin-bottom: 8px;' : ''}">
                ${n > 1 ? `<div style="font-size: 13px; font-weight: 600; color: var(--primary); margin-bottom: 8px;"><i class="fa-solid fa-user"></i> Học viên ${i}</div>` : ''}
                <div class="form-group">
                    <label>Tên Học Viên <span style="color:#ef4444">*</span></label>
                    <input type="text" id="sale-student-name-${i}" placeholder="Nhập tên học viên...">
                </div>
                <div class="form-group">
                    <label>Số Điện Thoại <span style="color:#ef4444">*</span></label>
                    <input type="tel" id="sale-student-phone-${i}" placeholder="Nhập số điện thoại...">
                </div>
                <div class="form-group">
                    <label>Số Hợp Đồng <span style="color:#ef4444">*</span></label>
                    <input type="text" id="sale-student-contract-${i}" placeholder="Ví dụ: HD00${i}...">
                </div>
                <div class="row-form">
                    <div class="form-group flex-1">
                        <label>Kiểu Bơi / Lặn <span style="color:#ef4444">*</span></label>
                        <select id="sale-student-curriculum-${i}" class="modern-select" onchange="handleCurriculumChange(${i}, this.value)">
                            <optgroup label="Bơi Ếch">
                                <option value="Ếch Trẻ em">Ếch Trẻ em</option>
                                <option value="Ếch Người lớn">Ếch Người lớn</option>
                            </optgroup>
                            <optgroup label="Bơi Sải">
                                <option value="Sải Trẻ em">Sải Trẻ em</option>
                                <option value="Sải Người lớn">Sải Người lớn</option>
                            </optgroup>
                            <optgroup label="Ếch Vip (15 buổi)">
                                <option value="Ếch Vip Trẻ em">Ếch Vip Trẻ em</option>
                                <option value="Ếch Vip Người lớn">Ếch Vip Người lớn</option>
                            </optgroup>
                            <optgroup label="Sải Vip (15 buổi)">
                                <option value="Sải Vip Trẻ em">Sải Vip Trẻ em</option>
                                <option value="Sải Vip Người lớn">Sải Vip Người lớn</option>
                            </optgroup>
                            <optgroup label="🤿 Lặn">
                                <option value="Dolphin 1">🤿 Dolphin 1 (4 buổi)</option>
                                <option value="Dolphin 2">🤿 Dolphin 2 (5 buổi)</option>
                                <option value="Basic Mermaid">🧜 Basic Mermaid (5 buổi)</option>
                                <option value="Pro. Mermaid">🧜 Pro. Mermaid (5 buổi)</option>
                                <option value="Lặn Nghệ thuật">🤿 Lặn Nghệ thuật (4 buổi)</option>
                                <option value="Trải nghiệm Tiên cá">🧜 Trải nghiệm Tiên cá (1 buổi)</option>
                            </optgroup>
                            <optgroup label="Khác">
                                <option value="Bơi Ngửa">Bơi Ngửa</option>
                                <option value="Bơi Bướm">Bơi Bướm</option>
                                <option value="PT">Khách PT (Cá nhân)</option>
                            </optgroup>
                        </select>
                    </div>
                    <div class="form-group" id="sale-pt-group-${i}" style="display: none; flex: 1;">
                        <label>Số buổi PT</label>
                        <input type="number" id="sale-student-pt-${i}" placeholder="Nhập số buổi..." min="1" value="10">
                    </div>
                    <div class="form-group" id="sale-dive-teacher-group-${i}" style="display: none; flex: 1;">
                        <label>GV Lặn <span style="color:#ef4444">*</span></label>
                        <select id="sale-dive-teacher-${i}" class="modern-select" style="border-color:#06b6d4; background:rgba(6,182,212,0.08); color:#0891b2;"></select>
                    </div>
                </div>
                <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" id="sale-student-test-${i}" style="width:16px; height:16px; cursor:pointer;">
                    <label for="sale-student-test-${i}" style="font-size:13px; color:var(--text-muted); cursor:pointer; margin:0;">🧪 Học viên test đăng ký</label>
                </div>
                <div style="margin-top: 10px; padding: 12px; border-radius: 10px; background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.15);">
                    <div style="font-size: 13px; font-weight: 600; color: #10b981; margin-bottom: 8px;"><i class="fa-solid fa-money-bill-wave"></i> Thông tin thanh toán</div>
                    <div class="row-form">
                        <div class="form-group flex-1">
                            <label>Tổng tiền gốc (đ)</label>
                            <input type="text" inputmode="numeric" id="sale-student-total-${i}" placeholder="VD: 3.000.000" style="padding:8px 10px;" oninput="formatMoney(this); calcDiscount(${i})">
                        </div>
                        <div class="form-group flex-1">
                            <label>Mã giảm giá ${currentUserRole === 'ADMIN' ? '<button type="button" onclick="syncGpDiscounts()" style="margin-left:6px; padding:2px 8px; font-size:10px; border-radius:4px; border:1px solid rgba(59,130,246,0.3); background:rgba(59,130,246,0.08); color:#3b82f6; cursor:pointer;" title="Sync mã giảm từ GP">🔄 Sync GP</button>' : ''}</label>
                            <select id="sale-student-discount-${i}" class="modern-select" style="padding:8px 10px;" onchange="document.getElementById('sale-student-discount-custom-${i}').value=''; calcDiscount(${i})">
                                <option value="">-- Không giảm giá --</option>
                            </select>
                            <input type="text" id="sale-student-discount-custom-${i}" placeholder="Hoặc nhập: GIAM500K" style="margin-top:4px; padding:6px 10px; font-size:12px; border:1px dashed var(--border-color); border-radius:6px;" oninput="if(this.value.trim()){document.getElementById('sale-student-discount-${i}').value='';} calcDiscount(${i})">
                        </div>
                    </div>
                    <div id="sale-discount-preview-${i}" style="display:none; padding:6px 10px; margin-bottom:8px; border-radius:8px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.15); font-size:12px; color:#ef4444;"></div>
                    <div class="row-form">
                        <div class="form-group flex-1">
                            <label style="color:#10b981; font-weight:600;">💰 Thanh toán = Tổng số GP (đ)</label>
                            <input type="text" inputmode="numeric" id="sale-student-paid-${i}" placeholder="Tự tính sau giảm giá" style="padding:8px 10px; font-weight:600; color:#10b981; background:rgba(16,185,129,0.05);" oninput="formatMoney(this)">
                        </div>
                        <div class="form-group flex-1">
                            <label>Phương thức</label>
                            <select id="sale-student-paymethod-${i}" class="modern-select">
                                <option value="cash">💵 Tiền mặt</option>
                                <option value="transfer">🏦 Chuyển khoản</option>
                                <option value="card">💳 Thẻ</option>
                            </select>
                        </div>
                    </div>
                </div>
                <details style="margin-top: 6px;">
                    <summary style="font-size: 14px; color: var(--text-color); cursor: pointer; user-select: none; font-weight: 600;">
                        <i class="fa-solid fa-plus-circle"></i> Thông tin bổ sung
                    </summary>
                    <div style="margin-top: 8px;">
                        <div class="row-form">
                            <div class="form-group flex-1">
                                <label>Giới tính</label>
                                <select id="sale-student-gender-${i}" class="modern-select">
                                    <option value="Nam">Nam</option>
                                    <option value="Nữ">Nữ</option>
                                </select>
                            </div>
                            <div class="form-group" style="width:80px;">
                                <label>Số tuổi</label>
                                <input type="number" id="sale-student-age-${i}" placeholder="VD: 8" min="1" max="80" class="modern-select" style="padding:8px 10px;">
                            </div>
                        </div>
                    </div>
                </details>
            </div>`;
        }
        container.innerHTML = html;

        // Populate discount dropdowns — mã giảm từ GP (Firestore) hoặc fallback hardcode
        (async () => {
            const gpSiteId = GP_API.siteMap[currentBranchId] || 2;
            let gpDiscounts = null;
            try {
                const cfgDoc = await db.collection('config').doc('gp_discounts').get();
                if (cfgDoc.exists) {
                    const siteData = cfgDoc.data()?.sites?.[String(gpSiteId)];
                    if (siteData?.discounts?.length > 0) {
                        gpDiscounts = siteData.discounts;
                        console.log(`✅ [Discount] GP: ${gpDiscounts.length} mã cho ${siteData.label} (site ${gpSiteId})`);
                    }
                }
            } catch (e) { console.warn('[Discount] Load GP failed:', e.message); }

            const fallbackPct = [
                { label: 'Giảm 10%', code: 'GIAM10', type: 'percent', value: 10 },
                { label: 'Giảm 15%', code: 'GIAM15', type: 'percent', value: 15 },
                { label: 'Giảm 20%', code: 'GIAM20', type: 'percent', value: 20 },
                { label: 'Giảm 25%', code: 'GIAM25', type: 'percent', value: 25 },
                { label: 'Giảm 30%', code: 'GIAM30', type: 'percent', value: 30 },
                { label: 'Giảm 40%', code: 'GIAM40', type: 'percent', value: 40 },
                { label: 'Giảm 50%', code: 'GIAM50', type: 'percent', value: 50 },
            ];
            const fallbackFixed = {
                'branch_nguyen_co_thach': [
                    { label: 'Giảm 500K', code: 'GIAM500K', type: 'fixed', value: 500000 },
                    { label: 'Giảm 800K', code: 'GIAM800K', type: 'fixed', value: 800000 },
                    { label: 'Giảm 900K', code: 'GIAM900K', type: 'fixed', value: 900000 },
                    { label: 'Giảm 1.200K', code: 'GIAM1200K', type: 'fixed', value: 1200000 },
                ],
                'branch_cung_ttdn': [
                    { label: 'Giảm 200K', code: 'GIAM200K', type: 'fixed', value: 200000 },
                    { label: 'Giảm 500K', code: 'GIAM500K', type: 'fixed', value: 500000 },
                    { label: 'Giảm 600K', code: 'GIAM600K', type: 'fixed', value: 600000 },
                    { label: 'Giảm 700K', code: 'GIAM700K', type: 'fixed', value: 700000 },
                    { label: 'Giảm 800K', code: 'GIAM800K', type: 'fixed', value: 800000 },
                    { label: 'Giảm 900K', code: 'GIAM900K', type: 'fixed', value: 900000 },
                    { label: 'Giảm 1.000K', code: 'GIAM1000K', type: 'fixed', value: 1000000 },
                    { label: 'Giảm 1.200K', code: 'GIAM1200K', type: 'fixed', value: 1200000 },
                    { label: 'Giảm 1.500K', code: 'GIAM1500K', type: 'fixed', value: 1500000 },
                ],
                'branch_thuy_khue': [
                    { label: 'Giảm 900K', code: 'GIAM900K', type: 'fixed', value: 900000 },
                    { label: 'Giảm 1.200K', code: 'GIAM1200K', type: 'fixed', value: 1200000 },
                ],
                'branch_hoang_mai': [
                    { label: 'Giảm 500K', code: 'GIAM500K', type: 'fixed', value: 500000 },
                    { label: 'Giảm 800K', code: 'GIAM800K', type: 'fixed', value: 800000 },
                    { label: 'Giảm 900K', code: 'GIAM900K', type: 'fixed', value: 900000 },
                    { label: 'Giảm 1.200K', code: 'GIAM1200K', type: 'fixed', value: 1200000 },
                ],
                'branch_thanh_tri': [
                    { label: 'Giảm 200K', code: 'GIAM200K', type: 'fixed', value: 200000 },
                    { label: 'Giảm 500K', code: 'GIAM500K', type: 'fixed', value: 500000 },
                    { label: 'Giảm 1.000K', code: 'GIAM1000K', type: 'fixed', value: 1000000 },
                ],
            };

            for (let i = 1; i <= count; i++) {
                const sel = document.getElementById(`sale-student-discount-${i}`);
                if (!sel) continue;
                if (gpDiscounts) {
                    const pctList = gpDiscounts.filter(d => d.type === 'percent');
                    const fixedList = gpDiscounts.filter(d => d.type === 'fixed');
                    if (pctList.length > 0) {
                        const grp = document.createElement('optgroup');
                        grp.label = '── Giảm % (GP) ──';
                        pctList.forEach(d => { const opt = document.createElement('option'); opt.value = d.code; opt.textContent = d.label; opt.dataset.type = d.type; opt.dataset.value = d.value; opt.dataset.gpCode = 'true'; grp.appendChild(opt); });
                        sel.appendChild(grp);
                    }
                    if (fixedList.length > 0) {
                        const grp = document.createElement('optgroup');
                        grp.label = '── Giảm số tiền (GP) ──';
                        fixedList.forEach(d => { const opt = document.createElement('option'); opt.value = d.code; opt.textContent = `${d.label} (${d.code})`; opt.dataset.type = d.type; opt.dataset.value = d.value; opt.dataset.gpCode = 'true'; grp.appendChild(opt); });
                        sel.appendChild(grp);
                    }
                } else {
                    const grpPct = document.createElement('optgroup'); grpPct.label = '── Giảm % ──';
                    fallbackPct.forEach(d => { const opt = document.createElement('option'); opt.value = d.code; opt.textContent = d.label; opt.dataset.type = d.type; opt.dataset.value = d.value; grpPct.appendChild(opt); });
                    sel.appendChild(grpPct);
                    const branchFixed = fallbackFixed[currentBranchId] || [];
                    if (branchFixed.length > 0) {
                        const grpFixed = document.createElement('optgroup'); grpFixed.label = '── Giảm số tiền ──';
                        branchFixed.forEach(d => { const opt = document.createElement('option'); opt.value = d.code; opt.textContent = d.label; opt.dataset.type = d.type; opt.dataset.value = d.value; grpFixed.appendChild(opt); });
                        sel.appendChild(grpFixed);
                    }
                }
            }
        })();
    };

    window.showSaleTab = function (idx) {
        document.querySelectorAll('.sale-student-block').forEach(b => b.style.display = 'none');
        document.querySelectorAll('[id^="sale-tab-btn-"]').forEach(btn => {
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-muted)';
            btn.style.borderColor = 'var(--border-color)';
        });
        const block = document.getElementById(`sale-block-${idx}`);
        const btn = document.getElementById(`sale-tab-btn-${idx}`);
        if (block) block.style.display = 'block';
        if (btn) { btn.style.background = 'var(--primary)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--primary)'; }
    };

    // Init default 1 form
    generateSaleStudentForms(1);

    // ============ SWITCH FORM MODE (Sale / Tự Tuyển) ============ //
    let currentFormMode = 'sale';
    window.switchFormMode = function (mode) {
        currentFormMode = mode;
        const btnSale = document.getElementById('form-mode-sale');
        const btnSelf = document.getElementById('form-mode-self');
        const saleSection = document.getElementById('sale-teacher-section');
        const selfSection = document.getElementById('self-teacher-section');
        const countSection = document.getElementById('sale-contract-count-section');
        const penaltyBtns = document.getElementById('sale-penalty-buttons');

        if (mode === 'sale') {
            if (btnSale) { btnSale.style.background = 'var(--primary)'; btnSale.style.color = '#fff'; }
            if (btnSelf) { btnSelf.style.background = 'transparent'; btnSelf.style.color = 'var(--text-muted)'; }
            if (saleSection) saleSection.style.display = '';
            if (selfSection) selfSection.style.display = 'none';
            if (countSection) countSection.style.display = '';
            if (penaltyBtns) penaltyBtns.style.display = 'flex';
        } else {
            if (btnSelf) { btnSelf.style.background = 'var(--secondary)'; btnSelf.style.color = '#fff'; }
            if (btnSale) { btnSale.style.background = 'transparent'; btnSale.style.color = 'var(--text-muted)'; }
            if (saleSection) saleSection.style.display = 'none';
            if (selfSection) selfSection.style.display = '';
            if (countSection) countSection.style.display = 'none';
            if (penaltyBtns) penaltyBtns.style.display = 'none';
            // Reset to 1 form in self mode
            document.getElementById('sale-contract-count').value = '1';
            generateSaleStudentForms(1);
        }
    };

    // Gán học viên từ Sale hoặc Tự Tuyển (UNIFIED HANDLER)
    const formSaleAdd = document.getElementById('form-sale-add');
    if (formSaleAdd) {
        formSaleAdd.addEventListener('submit', async (e) => {
            e.preventDefault();
            // === GUARD: Chống bấm nhiều lần tạo trùng ===
            if (window._isFormSubmitting) {
                console.warn('⚠️ Form đang xử lý, bỏ qua lần bấm thừa');
                return;
            }
            window._isFormSubmitting = true;
            const submitBtns = formSaleAdd.querySelectorAll('button[type="submit"], input[type="submit"]');
            submitBtns.forEach(b => { b.disabled = true; b._origText = b.textContent; b.textContent = '⏳ Đang xử lý...'; });
            try {
                // === CHẾ ĐỘ TỰ TUYỂN ===
                if (currentFormMode === 'self') {
                    const name = document.getElementById('sale-student-name-1')?.value;
                    const contractNumber = document.getElementById('sale-student-contract-1')?.value || '';
                    const rawCurriculum = document.getElementById('sale-student-curriculum-1')?.value || 'Ếch Trẻ em';
                    const { curriculum, ageCategory } = parseCurriculumValue(rawCurriculum);
                    const phone = document.getElementById('sale-student-phone-1')?.value || '';
                    const gender = document.getElementById('sale-student-gender-1')?.value || 'Nam';
                    const age = parseInt(document.getElementById('sale-student-age-1')?.value) || 0;
                    const ptSessions = document.getElementById('sale-student-pt-1')?.value || '10';
                    const teacherId = document.getElementById('select-teacher-view-self')?.value;
                    const selfRecruitReason = document.getElementById('self-recruit-reason')?.value || '';

                    if (!name) return alert('❌ Vui lòng nhập Tên học viên!');
                    if (!phone) return alert('❌ Vui lòng nhập Số điện thoại!');
                    if (!contractNumber) return alert('❌ Vui lòng nhập Số hợp đồng!');
                    if (!teacherId) return alert('❌ Chưa chọn Giáo viên tự tuyển!');
                    if (!selfRecruitReason) return alert('❌ Vui lòng chọn Lý do tự tuyển!');

                    // Kiểm tra trùng số hợp đồng (cả HV + VĐV CLB cùng cơ sở)
                    if (contractNumber) {
                        const dupMsg = await checkDuplicateContract(contractNumber, currentBranchId);
                        if (dupMsg) return alert(dupMsg);
                    }

                    const selfTotalSessions = DIVING_CURRICULUMS[curriculum] || ((curriculum === 'Ếch Vip' || curriculum === 'Sải Vip') ? 15 : (curriculum === 'PT' ? (parseInt(ptSessions) || 10) : 10));
                    const isTestStudent = document.getElementById('sale-student-test-1')?.checked || false;
                    await db.collection('students').add({
                        name, phone, gender, ageCategory, age: age || 0, assignedTeacherId: teacherId,
                        contractNumber: contractNumber || 'Chưa có',
                        branchId: currentBranchId, sessions: 0,
                        totalSessions: selfTotalSessions,
                        curriculum: curriculum || 'Bơi Ếch', source: 'Self',
                        creatorId: currentUserId,
                        isTestStudent: isTestStudent,
                        isFullyCompleted: false,
                        selfRecruitReason: selfRecruitReason,
                        sheetSyncedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // Auto sync lên Google Sheet
                    const tObjSelf = localState.teachers.find(t => t.id === teacherId);
                    const branchObjSelf = FIXED_BRANCHES.find(b => b.id === currentBranchId);
                    syncToGoogleSheet({
                        action: 'addRow',
                        branchName: branchObjSelf?.name || 'N/A',
                        stt: '',
                        syncTime: new Date().toLocaleString('vi-VN'),
                        createdAt: new Date().toLocaleDateString('vi-VN'),
                        name,
                        contractNumber: contractNumber || 'Chưa có',
                        phone: phone || '',
                        curriculum: curriculum || 'Bơi Ếch',
                        ageCategory: ageCategory || '',
                        teacherName: tObjSelf?.name || 'N/A',
                        saleName: currentUserDisplayName || 'Sale',
                        sessions: selfTotalSessions
                    });

                    // ===== ĐỒNG BỘ SANG GREENPOOL (tự tuyển) =====
                    try {
                        const _diSelf = getDiscountInfo(1);
                        const selfPaymentInfo = {
                            totalAmount: (document.getElementById('sale-student-total-1')?.value || '0').replace(/\./g, ''),
                            paidAmount: (document.getElementById('sale-student-paid-1')?.value || '').replace(/\./g, ''),
                            payMethod: document.getElementById('sale-student-paymethod-1')?.value || 'cash',
                            discountCode: _diSelf.discountCode,
                            isGpCode: _diSelf.isGpCode
                        };
                        console.log('🔄 [GP] Bắt đầu đồng bộ tự tuyển:', { name, phone, rawCurriculum, contractNumber });
                        const gpResult = await syncToGreenPool({
                            name, phone, gender: gender || '',
                            curriculum: rawCurriculum || '',
                            contractNumber: contractNumber || '',
                            paymentInfo: selfPaymentInfo,
                            customerSource: document.getElementById('sale-customer-source')?.value || 'FACE'
                        });
                        if (gpResult.success) {
                            console.log(`✅ [GP] Đồng bộ HĐ tự tuyển "${contractNumber}" → GreenPool OK (Sub:${gpResult.subscribeId})`);
                            try {
                                const stuSnap = await db.collection('students')
                                    .where('contractNumber', '==', contractNumber)
                                    .where('branchId', '==', currentBranchId)
                                    .limit(1).get();
                                if (!stuSnap.empty) {
                                    await stuSnap.docs[0].ref.update({
                                        gpSynced: true,
                                        gpSubscribeId: gpResult.subscribeId,
                                        gpPersonId: gpResult.personId,
                                        gpSyncedAt: firebase.firestore.FieldValue.serverTimestamp(),
                                        gpDiscountCode: selfPaymentInfo.discountCode || '',
                                        gpTotalAmount: parseInt(selfPaymentInfo.totalAmount) || 0,
                                        gpPaidAmount: parseInt(selfPaymentInfo.paidAmount) || 0
                                    });
                                }
                            } catch (e2) { console.warn('[GP] Lưu sync tự tuyển lỗi:', e2); }
                        } else if (gpResult.reason === 'duplicate_contract') {
                            console.log(`ℹ️ [GP] Tự tuyển: HĐ "${contractNumber}" đã có trên GP (skip)`);
                            try {
                                const ss3 = await db.collection('students').where('contractNumber', '==', contractNumber).where('branchId', '==', currentBranchId).limit(1).get();
                                if (!ss3.empty) await ss3.docs[0].ref.update({ gpSynced: true, gpSubscribeId: gpResult.existingSubscribeId || 'existed', gpSyncedAt: firebase.firestore.FieldValue.serverTimestamp(), gpNote: 'HĐ đã tồn tại trên GP' });
                            } catch (e3) { console.warn('[GP] Lưu duplicate tự tuyển lỗi:', e3); }
                        }
                    } catch (gpErr) { console.warn('⚠️ [GP] Sync tự tuyển lỗi:', gpErr); }

                    alert('✅ Thêm học viên tự tuyển thành công!');

                    // Gửi thông báo cho GV được gán (nếu khác người tạo)
                    if (teacherId !== currentUserId) {
                        await sendNotification(teacherId, 'contract', `📝 ${currentUserDisplayName || 'Nhân viên'} vừa thêm HV tự tuyển "${name}" cho bạn (HĐ: ${contractNumber || 'Chưa có'}, ${curriculum || 'Bơi Ếch'}).`);
                    }
                    // Gửi thông báo cho Quản lý cơ sở
                    try {
                        const mgrSelfSnap = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', currentBranchId).get();
                        const mgrSelfP = [];
                        mgrSelfSnap.forEach(doc => mgrSelfP.push(sendNotification(doc.id, 'contract', `📋 HĐ tự tuyển: "${currentUserDisplayName || 'GV'}" → HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ếch'}) | GV: ${tObjSelf?.name || 'Chưa gán'}`)));
                        await Promise.all(mgrSelfP);
                    } catch (e) { console.error('Manager notify self error:', e); }
                    // Gửi thông báo cho Admin
                    try {
                        const adminSelfSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
                        const admSelfP = [];
                        const brSelfName = FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || '';
                        const notifyMsg = `📋 HĐ tự tuyển: "${currentUserDisplayName || 'GV'}" → HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ếch'}) | GV: ${tObjSelf?.name || 'Chưa gán'} - CS: ${brSelfName}`;
                        adminSelfSnap.forEach(doc => {
                            if (doc.id !== currentUserId) admSelfP.push(sendNotification(doc.id, 'contract', notifyMsg));
                        });
                        console.log(`[Notify] Sending self-recruit notification to ${admSelfP.length} admin(s)`);
                        const results = await Promise.allSettled(admSelfP);
                        const failed = results.filter(r => r.status === 'rejected');
                        if (failed.length > 0) console.error(`[Notify] ${failed.length} admin notify failed:`, failed.map(f => f.reason?.message));
                    } catch (e) { console.error('Admin notify self error:', e); }

                    generateSaleStudentForms(1);
                    return;
                }

                // === CHẾ ĐỘ SALE ===
                const count = parseInt(document.getElementById('sale-contract-count')?.value) || 1;

                let teacherId;
                if (isSaleExceptionMode) {
                    const exSel = document.getElementById('sale-exception-select');
                    if (exSel) teacherId = exSel.value;
                } else {
                    teacherId = document.getElementById('sale-suggested-teacher-id')?.value;
                }

                // Kiểm tra xem tất cả HV đều lặn → không cần teacherId từ queue
                let allStudentsDiving = true;
                for (let i = 1; i <= count; i++) {
                    const curVal = document.getElementById(`sale-student-curriculum-${i}`)?.value || '';
                    if (!isDivingCurriculum(curVal)) { allStudentsDiving = false; break; }
                }
                if (!teacherId && !allStudentsDiving) return alert('Hệ thống chưa xác định được Giáo viên!');

                // Validate all forms
                for (let i = 1; i <= count; i++) {
                    const name = document.getElementById(`sale-student-name-${i}`)?.value;
                    const contract = document.getElementById(`sale-student-contract-${i}`)?.value;
                    const phoneVal = document.getElementById(`sale-student-phone-${i}`)?.value;
                    if (!name || !contract) {
                        showSaleTab(i);
                        return alert(`❌ HV ${i}: Vui lòng nhập đủ Tên và Số HĐ!`);
                    }
                    if (!phoneVal) {
                        showSaleTab(i);
                        return alert(`❌ HV ${i}: Vui lòng nhập Số điện thoại!`);
                    }
                }

                // Submit all students
                for (let i = 1; i <= count; i++) {
                    const name = document.getElementById(`sale-student-name-${i}`).value;
                    const phone = document.getElementById(`sale-student-phone-${i}`).value;
                    const gender = document.getElementById(`sale-student-gender-${i}`)?.value || 'Nam';
                    const age = parseInt(document.getElementById(`sale-student-age-${i}`)?.value) || 0;
                    const contractNumber = document.getElementById(`sale-student-contract-${i}`).value;
                    const rawCurriculum = document.getElementById(`sale-student-curriculum-${i}`).value;
                    const { curriculum, ageCategory } = parseCurriculumValue(rawCurriculum);
                    const ptSessions = document.getElementById(`sale-student-pt-${i}`)?.value || '10';

                    // Xác định teacherId theo loại curriculum
                    let finalTeacherId = teacherId;
                    let isDiving = false;
                    if (isDivingCurriculum(rawCurriculum)) {
                        const diveSel = document.getElementById(`sale-dive-teacher-${i}`);
                        finalTeacherId = diveSel?.value;
                        if (!finalTeacherId) return alert(`❌ HV ${i}: Vui lòng chọn GV Lặn!`);
                        isDiving = true;
                    }

                    const isLastStudent = (i === count);
                    const isTest = document.getElementById(`sale-student-test-${i}`)?.checked || false;
                    // Lặn: không theo queue (isDiving=true → truyền isException=true để skip queue, nhưng không ghi nợ)
                    const isExceptionForThisStudent = isDiving ? true : (isSaleExceptionMode && (i === 1));
                    // Chỉ advance queue khi là HV CUỐI CÙNG trong lượt
                    const skipQueue = (!isLastStudent && !isDiving && !isExceptionForThisStudent);
                    // Thông tin thanh toán
                    const _diQ = getDiscountInfo(i);
                    const paymentInfo = {
                        totalAmount: (document.getElementById(`sale-student-total-${i}`)?.value || '0').replace(/\./g, ''),
                        paidAmount: (document.getElementById(`sale-student-paid-${i}`)?.value || '').replace(/\./g, ''),
                        payMethod: document.getElementById(`sale-student-paymethod-${i}`)?.value || 'cash',
                        discountCode: _diQ.discountCode,
                        isGpCode: _diQ.isGpCode
                    };
                    await saleAssignStudent(name, phone, gender, ageCategory, contractNumber, finalTeacherId, curriculum, ptSessions, isExceptionForThisStudent, age, isTest, isDiving, skipQueue, paymentInfo, rawCurriculum);
                }

                alert(`✅ Đã gán ${count} học viên thành công!`);
                generateSaleStudentForms(1);
                document.getElementById('sale-contract-count').value = '1';

                if (isSaleExceptionMode) {
                    toggleSaleException.checked = false;
                    toggleSaleException.dispatchEvent(new Event('change'));
                }
                renderDashboard();
                if (typeof _refreshStudents === 'function') _refreshStudents();
            } catch (submitErr) {
                console.error('SUBMIT ERROR:', submitErr);
                alert('❌ Lỗi xác nhận HĐ: ' + submitErr.message);
            } finally {
                // Reset guard chống double-submit
                window._isFormSubmitting = false;
                const submitBtns = formSaleAdd.querySelectorAll('button[type="submit"], input[type="submit"]');
                submitBtns.forEach(b => { b.disabled = false; if (b._origText) b.textContent = b._origText; });
            }
        });
    }

    // Điểm danh Buổi học
    window.incrementSession = async function (studentId, currentSessions, totalSessions = 10) {
        if (currentSessions < totalSessions) {
            await db.collection('students').doc(studentId).update({
                sessions: currentSessions + 1
            });
        }
    };

    // Chốt lương cho học viên đủ điều kiện
    window.confirmSalary = async function (studentId, studentName) {
        if (!confirm(`Xác nhận CHỐT LƯƠNG cho học viên "${studentName}"? Hành động này không thể hoàn tác.`)) return;
        try {
            const now = new Date();
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            await db.collection('students').doc(studentId).update({
                salaryConfirmed: true,
                salaryConfirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
                salaryConfirmedBy: currentUserId,
                salarySubmittedMonth: month,
                salarySubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                saleRejected: firebase.firestore.FieldValue.delete(),
                saleRejectedBy: firebase.firestore.FieldValue.delete(),
                saleRejectedAt: firebase.firestore.FieldValue.delete()
            });
            // Thông báo Sale: GV đã chốt lương
            const stuDoc = await db.collection('students').doc(studentId).get();
            const stuData = stuDoc.exists ? stuDoc.data() : {};
            const saleUserId = stuData.creatorId || stuData.saleId;
            if (saleUserId && saleUserId !== currentUserId) {
                const teacherName = window._currentUserData?.name || 'GV';
                await sendNotification(saleUserId, 'salary', `💰 GV "${teacherName}" đã chốt lương cho HV "${studentName}". Vui lòng xác nhận.`);
            }
            alert(`Đã chốt lương cho "${studentName}" thành công!`);
        } catch (e) {
            console.error(e);
            alert('Lỗi: ' + e.message);
        }
    };

    // Mở Modal Giáo Án Của Học Viên
    window.openCurriculumModal = function (id, name, type, currentStep) {
        const modal = document.getElementById('curriculum-modal');
        if (!modal) return;

        document.getElementById('curriculum-student-id').value = id;
        document.getElementById('curriculum-type').value = type;
        document.getElementById('curriculum-student-info').textContent = `Học viên: ${name} (${type})`;

        const stepsContainer = document.getElementById('curriculum-steps');
        stepsContainer.innerHTML = '';

        let steps = [];
        if (type === 'Bơi Ếch') {
            steps = ['Làm quen nước', 'Đạp chân ếch', 'Chân kết hợp thở', 'Tay ếch kết hợp thở', 'Chân tay kết hợp thở', 'Hoàn thiện'];
        } else if (type === 'Bơi Sải') {
            steps = ['Chân sải', 'Chân kết hợp thở', 'Tay sải', 'Tay kết hợp thở', 'Chân tay kết hợp thở', 'Hoàn thiện'];
        }

        steps.forEach((stepName, i) => {
            const stepNum = i + 1;
            const isChecked = stepNum <= currentStep;
            stepsContainer.innerHTML += `
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px; background: ${isChecked ? 'rgba(16,185,129,0.1)' : '#f8fafc'}; border: 1px solid ${isChecked ? '#10b981' : '#e2e8f0'}; border-radius: 6px;">
                    <input type="radio" name="curriculum-step-radio" id="step-${stepNum}" value="${stepNum}" ${stepNum == currentStep ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                    <label for="step-${stepNum}" style="margin: 0; cursor: pointer; color: ${isChecked ? '#059669' : '#475569'}; font-weight: ${isChecked ? '600' : '400'}; flex-grow: 1;">
                        Bước ${stepNum}: ${stepName}
                        ${isChecked ? ' <i class="fa-solid fa-circle-check" style="color: #10b981; margin-left: 5px;"></i>' : ''}
                    </label>
                </div>
            `;
        });

        modal.style.display = 'flex';
    };

    // Đóng Modal Giáo Án
    const closeBtn = document.getElementById('close-curriculum-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('curriculum-modal').style.display = 'none';
        });
    }

    // Lưu Tiến Trình Giáo Án
    const saveCurriculumBtn = document.getElementById('btn-save-curriculum');
    if (saveCurriculumBtn) {
        saveCurriculumBtn.addEventListener('click', async () => {
            const id = document.getElementById('curriculum-student-id').value;
            const checkedRadio = document.querySelector('input[name="curriculum-step-radio"]:checked');
            if (!checkedRadio) {
                // Nếu User không chọn nút nào cả (chưa có bước nào trong quá khứ)
                return alert('Vui lòng tích chọn Bước giáo án hiện tại!');
            }

            saveCurriculumBtn.disabled = true;
            saveCurriculumBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

            const step = parseInt(checkedRadio.value);
            try {
                await db.collection('students').doc(id).update({
                    currentStep: step
                });
                document.getElementById('curriculum-modal').style.display = 'none';
            } catch (e) {
                console.error(e);
                alert("Lỗi lưu tiến trình: " + e.message);
            } finally {
                saveCurriculumBtn.disabled = false;
                saveCurriculumBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Tiến Trình';
            }
        });
    }

    // Bỏ qua Thêm/Xóa Giáo Viên vì hiện tại quản lý qua Users Đăng Ký

    // Lắng nghe khi select Teacher View đổi -> render lại list
    const btnSelectTeacherView = document.getElementById('select-teacher-view');
    if (btnSelectTeacherView) {
        btnSelectTeacherView.addEventListener('change', renderTeacherStudents);
    }

    // Tìm kiếm học viên
    const searchInput = document.getElementById('teacher-search-student');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            teacherSearchQuery = e.target.value;
            renderTeacherStudents();
        });
    }

    // Lọc trạng thái (Tất cả / Đang học / Hoàn thành)
    document.querySelectorAll('.teacher-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.teacher-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            teacherFilterMode = btn.getAttribute('data-filter');
            renderTeacherStudents();
        });
    });

    // Lắng nghe chuyển đổi cơ sở
    const branchSel = document.getElementById('global-branch-select');
    if (branchSel) {
        branchSel.addEventListener('change', (e) => {
            if (e.target.value) {
                listenToBranchData(e.target.value);
                // Re-render Finance tab khi chuyển CS
                if (typeof renderFinanceTab === 'function') renderFinanceTab();
            }
        });
    }

    // Toggle Theme
    var themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            let isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            isDark = !isDark;

            if (isDark) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('greenpool-theme', 'dark');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('greenpool-theme', 'light');
            }
            updateThemeToggleUI(isDark);
        });
    }

}); // Đóng DOMContentLoaded 

async function initFixedBranches() {
    // Load thêm cơ sở từ Firestore (nếu có tạo mới)
    try {
        const branchSnap = await db.collection('branches').get();
        branchSnap.docs.forEach(doc => {
            const existing = FIXED_BRANCHES.find(b => b.id === doc.id);
            if (existing) {
                // Cập nhật trạng thái tạm dừng
                existing.paused = doc.data().paused || false;
            } else {
                FIXED_BRANCHES.push({ id: doc.id, name: doc.data().name, paused: doc.data().paused || false });
            }
        });
    } catch (e) {
        console.warn('Could not load dynamic branches:', e);
    }
    // Nếu là ADMIN -> Cho phép thấy toàn bộ cơ sở (trừ tạm dừng trong dropdown)
    // Nếu là SALE/TEACHER -> Chỉ Filter lại đúng Cơ sở được cấp quyền
    const activeBranches = FIXED_BRANCHES.filter(b => !b.paused);
    const isChiefAccountant = currentUserRole === 'KETOAN' && window._currentUserData?.isChiefAccountant;
    if (currentUserRole === 'ADMIN' || currentUserRole === 'VIEWER' || isChiefAccountant) {
        localState.branches = activeBranches;
    } else {
        localState.branches = activeBranches.filter(b => b.id === currentUserBranchId);
        if (localState.branches.length === 0) {
            // Fallback nếu User không có dữ liệu Branch hợp lệ
            localState.branches = activeBranches.length > 0 ? [activeBranches[0]] : [FIXED_BRANCHES[0]];
        }
    }

    const branchSelect = document.getElementById('global-branch-select');
    const oldBranchId = branchSelect.value;

    branchSelect.innerHTML = '';
    localState.branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name;
        branchSelect.appendChild(opt);
    });

    // Nếu không phải ADMIN/KT trưởng/VIEWER thì Disable tính năng chọn cơ sở
    const canSwitchBranch = currentUserRole === 'ADMIN' || currentUserRole === 'VIEWER' || isChiefAccountant;
    if (!canSwitchBranch) {
        branchSelect.disabled = true;
    } else {
        branchSelect.disabled = false;
    }

    const targetId = localState.branches[0].id; // Lấy cơ sở đầu tiên trong mảng đã lọc làm gốc
    branchSelect.value = targetId;
    listenToBranchData(targetId);

    // Lắng nghe trạng thái mở/đóng chốt lương (real-time)
    if (typeof listenSalaryToggle === 'function') listenSalaryToggle();

    // Ẩn/hiện phần quản lý cơ sở theo quyền (chỉ ADMIN thấy)
    const branchSection = document.getElementById('settings-branch-section');
    if (branchSection) branchSection.style.display = (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') ? 'block' : 'none';
    const addForm = document.getElementById('settings-add-branch-form');
    if (addForm) addForm.style.display = (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') ? 'block' : 'none';

    // Render danh sách cơ sở trong tab Cài đặt
    renderSettingsBranchList();
    // Populate dropdown chọn cơ sở cho tra cứu
    populateKhachhangBranches();
}

// Render danh sách cơ sở trong tab Cài đặt (có nút tạm dừng cho ADMIN)

function renderSettingsBranchList() {
    const container = document.getElementById('settings-branch-list');
    if (!container) return;
    container.innerHTML = '';
    FIXED_BRANCHES.forEach((b, idx) => {
        const isPaused = b.paused || false;
        const pauseBtn = (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') ? (isPaused
            ? `<button class="btn btn-sm" onclick="toggleBranchPause('${b.id}', false)" style="height:30px; font-size:11px; white-space:nowrap; background:rgba(34,197,94,0.1); color:#16a34a; border:1px solid rgba(34,197,94,0.3);"><i class="fa-solid fa-play"></i> Kích hoạt</button>`
            : `<button class="btn btn-sm" onclick="toggleBranchPause('${b.id}', true)" style="height:30px; font-size:11px; white-space:nowrap; background:rgba(245,158,11,0.1); color:#d97706; border:1px solid rgba(245,158,11,0.3);"><i class="fa-solid fa-pause"></i> Tạm dừng</button>`
        ) : '';
        container.innerHTML += `
            <div class="st-item" style="display:flex; justify-content:space-between; align-items:center; ${isPaused ? 'opacity:0.6; border-color:#f59e0b; background:rgba(245,158,11,0.03);' : ''}">
                <div>
                    <strong>${isPaused ? '⏸️' : '🟢'} Cơ sở ${idx + 1}: </strong> ${b.name}
                    ${isPaused ? '<span style="color:#f59e0b; font-size:12px; font-weight:600;"> • TẠM DỪNG</span>' : ''}
                </div>
                ${pauseBtn}
            </div>
        `;
    });
}

// Admin tạm dừng / kích hoạt cơ sở

window.toggleBranchPause = async function (branchId, pause) {
    if (currentUserRole === 'ADMIN' && !isSuperAdmin) return alert('⚠️ Chỉ Admin chính mới có quyền thay đổi trạng thái cơ sở!');
    const branch = FIXED_BRANCHES.find(b => b.id === branchId);
    if (!branch) return;
    const action = pause ? 'TẠM DỪNG' : 'KÍCH HOẠT LẠI';
    if (!confirm(`${pause ? '⏸️' : '▶️'} Xác nhận ${action} cơ sở "${branch.name}"?\n\n${pause ? 'Dữ liệu sẽ được giữ nguyên để theo dõi và thống kê.' : 'Cơ sở sẽ hoạt động trở lại.'}`)) return;
    try {
        await db.collection('branches').doc(branchId).set({ name: branch.name, paused: pause }, { merge: true });
        branch.paused = pause;
        initFixedBranches();
        alert(`${pause ? '⏸️' : '✅'} Đã ${action} cơ sở "${branch.name}".`);
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

// Admin thêm cơ sở mới

window.addNewBranch = async function () {
    const nameInput = document.getElementById('new-branch-name');
    const name = nameInput?.value?.trim();
    if (!name) { alert('Vui lòng nhập tên cơ sở!'); return; }

    const id = 'branch_' + name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

    if (FIXED_BRANCHES.find(b => b.id === id || b.name === name)) {
        alert('Cơ sở này đã tồn tại!'); return;
    }

    if (!confirm(`Thêm cơ sở mới: "${name}"?\n\nHệ thống sẽ tự tạo hàng đợi và dữ liệu liên quan.`)) return;

    try {
        await db.collection('branches').doc(id).set({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        await db.collection('queues').doc(id).set({ turns: [] });
        FIXED_BRANCHES.push({ id, name });
        initFixedBranches();
        nameInput.value = '';
        alert(`✅ Đã thêm cơ sở "${name}" thành công!`);
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

// ============ TẠM: Fix GP Payment cho HĐ sáng 12/6 ============ //
// Bước 1: fixGpPayments()       → PREVIEW (chỉ xem, không sửa)
// Bước 2: fixGpPayments('fix')  → THỰC SỰ SỬA
window.fixGpPayments = async function(mode) {
    if (currentUserRole !== 'ADMIN') return alert('Chỉ Admin!');
    
    const isPreview = mode !== 'fix';
    
    if (isPreview) {
        if (!confirm('🔍 XEM TRƯỚC dữ liệu GP cho các HĐ sáng 12/6?\n\n⚠️ Chỉ ĐỌC, KHÔNG sửa gì.\nSau khi xem xong, gõ fixGpPayments("fix") để sửa.')) return;
    } else {
        if (!confirm('🔧 XÁC NHẬN SỬA payment GP?\n\n⚠️ Sẽ cập nhật payment trên GreenPool.\n\nBạn đã xem preview chưa? Chắc chắn muốn sửa?')) return;
    }
    
    try {
        const fn = firebase.functions().httpsCallable('gpFixTodayPayments');
        console.log(`📤 Gọi CF mode=${isPreview ? 'preview' : 'fix'}...`);
        const result = await fn({ mode: isPreview ? 'preview' : 'fix' });
        const data = result.data;
        
        console.log('📋 Full results:', JSON.stringify(data, null, 2));
        
        const fmt = (n) => n ? n.toLocaleString('vi-VN') + 'đ' : '0đ';
        let msg = isPreview 
            ? `🔍 PREVIEW GP PAYMENT (CHỈ ĐỌC)\n\n`
            : `🔧 KẾT QUẢ FIX GP PAYMENT\n\n`;
        msg += `Tổng: ${data.total} | Cần fix: ${data.needFix}`;
        if (!isPreview) msg += ` | Đã fix: ${data.fixed}`;
        msg += '\n\n';
        
        (data.results || []).forEach((r, i) => {
            msg += `━━ ${i+1}. ${r.name} (HĐ: ${r.contract}) — ${r.site} ━━\n`;
            
            if (r.gp) {
                msg += `  🌐 GP: gói=${r.gp.packageName} (${fmt(r.gp.packagePrice)})\n`;
                msg += `       tổng=${fmt(r.gp.total_amount)}, trả=${fmt(r.gp.pay_amount)}, nợ=${fmt(r.gp.remain_amount)}\n`;
                if (r.gp.discount_value) msg += `       mã giảm=${r.gp.discount_value} (giảm ${fmt(r.gp.discount_amount)})\n`;
            }
            
            if (r.isBuggy && r.fixPlan) {
                msg += `  ⚠️ SAI → Sửa: tổng=${fmt(r.fixPlan.total_amount)}, trả=${fmt(r.fixPlan.pay_amount)}, nợ=${fmt(r.fixPlan.remain_amount)}\n`;
                msg += `       ${r.fixPlan.note}\n`;
            }
            
            if (r.status === 'FIXED') msg += '  ✅ ĐÃ SỬA\n';
            else if (r.status === 'OK') msg += '  ✅ OK\n';
            else if (r.status === 'NEED_FIX') msg += '  🔴 CẦN SỬA\n';
            else if (r.status === 'UPDATE_FAIL') msg += `  ❌ THẤT BẠI: ${r.fixResponse || ''}\n`;
            else msg += `  ℹ️ ${r.status}\n`;
            
            msg += '\n';
        });
        
        if (isPreview && data.needFix > 0) {
            msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `Có ${data.needFix} HĐ cần sửa.\n`;
            msg += `Gõ:  fixGpPayments("fix")  để sửa.\n`;
        } else if (isPreview && data.needFix === 0) {
            msg += `\n⚠️ Hệ thống không phát hiện HĐ sai.\nXem Console (F12) để kiểm tra raw data GP.\n`;
        }
        
        alert(msg);
    } catch (e) {
        console.error('Fix GP error:', e);
        alert('❌ Lỗi: ' + e.message);
    }
};


