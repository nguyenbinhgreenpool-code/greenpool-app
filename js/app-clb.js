// ===== GreenPool App — CLB Module (v7.0) =====

// ===================== CLB TL KID ===================== //
const CLB_LEVELS = ['Mầm', 'D1', 'D2', 'C', 'B', 'A'];
let clbAthletesCache = [];
let clbAthleteUnsub = null;

// Thêm VĐV mới
window.addAthlete = async function () {
    const name = document.getElementById('clb-name')?.value.trim();
    const phone = document.getElementById('clb-phone')?.value.trim();
    const gender = document.getElementById('clb-gender')?.value;
    const contractNumber = document.getElementById('clb-contract')?.value.trim();
    const classLevel = document.getElementById('clb-class')?.value;
    const sessionsPerWeek = parseInt(document.getElementById('clb-sessions-week')?.value) || 3;
    const contractMonths = parseInt(document.getElementById('clb-contract-months')?.value) || 3;
    const activateDateStr = document.getElementById('clb-activate-date')?.value;
    const saleEl = document.getElementById('clb-sale');
    const selectedSaleId = saleEl?.value || '';
    const saleName = selectedSaleId ? (saleEl.options[saleEl.selectedIndex]?.textContent || '') : '';

    if (!name) return alert('⚠️ Vui lòng nhập tên VĐV!');
    if (!phone) return alert('⚠️ Vui lòng nhập số điện thoại VĐV!');

    // Parse ngày đăng ký
    let activatedAt = null, expiresAt = null;
    if (activateDateStr) {
        activatedAt = new Date(activateDateStr);
        expiresAt = new Date(activatedAt);
        expiresAt.setMonth(expiresAt.getMonth() + contractMonths);
    }

    try {
        // Check trùng SĐT + Họ tên
        if (phone && name) {
            const brId = currentBranchId || currentUserBranchId;
            const existing = await db.collection('athletes').where('phone', '==', phone).where('branchId', '==', brId).get();
            // Lọc thêm theo tên
            const matched = existing.docs.find(d => d.data().name.toLowerCase() === name.toLowerCase());
            if (matched) {
                const existDoc = matched;
                const ex = existDoc.data();
                if (ex.isExpired) {
                    if (confirm(`📋 VĐV "${ex.name}" (SĐT: ${phone}) đã có trong hệ thống (HĐ cũ: ${ex.contractNumber}).\n\nHĐ đã hết hạn. Kích hoạt lại hợp đồng mới?`)) {
                        const newContract = prompt(`📝 Nhập số hợp đồng MỚI cho ${ex.name}:`, contractNumber);
                        if (!newContract) return;
                        const oldContracts = ex.contractHistory || [];
                        oldContracts.push({ contractNumber: ex.contractNumber, months: ex.contractMonths, sessions: ex.sessionsPerWeek, expiredAt: ex.expiresAt, classLevel: ex.classLevel });
                        await db.collection('athletes').doc(existDoc.id).update({
                            contractNumber: newContract,
                            contractMonths,
                            sessionsPerWeek,
                            classLevel,
                            isExpired: false,
                            isFrozen: false,
                            activatedAt: activatedAt || null,
                            expiresAt: expiresAt || null,
                            contractHistory: oldContracts
                        });
                        // Auto sync CLB gia hạn lên Google Sheet
                        const brNameSync1 = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'N/A';
                        syncClbRowToSheet({
                            action: 'addClbRow', branchName: 'CLB_' + brNameSync1, stt: '',
                            syncTime: new Date().toLocaleString('vi-VN'),
                            name: ex.name, phone: phone || '',
                            contractNumber: newContract,
                            athleteClass: classLevel || ex.classLevel || '',
                            pkg: `${sessionsPerWeek || ex.sessionsPerWeek || 3} buổi/tuần × ${contractMonths || ex.contractMonths || 3} tháng`,
                            activatedAt: activatedAt ? activatedAt.toLocaleDateString('vi-VN') : 'Chưa KH',
                            expiresAt: expiresAt ? expiresAt.toLocaleDateString('vi-VN') : 'N/A',
                            saleName: saleName || window._currentUserData?.name || 'N/A'
                        });
                        alert(`✅ Đã kích hoạt lại HĐ mới "${newContract}" cho ${ex.name}!\nHĐ cũ "${ex.contractNumber}" đã lưu lại.`);
                        document.getElementById('clb-name').value = '';
                        document.getElementById('clb-phone').value = '';
                        document.getElementById('clb-contract').value = '';
                        document.getElementById('clb-activate-date').value = '';
                        return;
                    } else return;
                } else {
                    alert(`⚠️ VĐV "${ex.name}" (SĐT: ${phone}) đã tồn tại và đang hoạt động!\nHĐ: ${ex.contractNumber} | Lớp: ${ex.classLevel}`);
                    return;
                }
            }
        }

        await db.collection('athletes').add({
            name, phone: phone || '', gender: gender || 'Nam',
            contractNumber: contractNumber || 'Chưa có',
            classLevel,
            branchId: currentBranchId || currentUserBranchId,
            sessionsPerWeek,
            contractMonths,
            activatedAt: activatedAt || null,
            expiresAt: expiresAt || null,
            isExpired: false,
            totalAttendance: 0,
            creatorId: selectedSaleId || currentUserId,
            creatorName: saleName || window._currentUserData?.name || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Auto sync VĐV CLB mới lên Google Sheet
        const brNameSync2 = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'N/A';
        syncClbRowToSheet({
            action: 'addClbRow', branchName: 'CLB_' + brNameSync2, stt: '',
            syncTime: new Date().toLocaleString('vi-VN'),
            name: name, phone: phone || '',
            contractNumber: contractNumber || 'Chưa có',
            athleteClass: classLevel || '',
            pkg: `${sessionsPerWeek || 3} buổi/tuần × ${contractMonths || 3} tháng`,
            activatedAt: activatedAt ? activatedAt.toLocaleDateString('vi-VN') : 'Chưa KH',
            expiresAt: expiresAt ? expiresAt.toLocaleDateString('vi-VN') : 'N/A',
            saleName: saleName || window._currentUserData?.name || 'N/A'
        });
        alert('✅ Đã thêm VĐV CLB mới!');
        // Thông báo Admin + Manager
        const brName = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'cơ sở';
        try {
            const admSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
            admSnap.forEach(doc => { if (doc.id !== currentUserId) sendNotification(doc.id, 'contract', `🏊 VĐV CLB mới: "${name}" (HĐ: ${contractNumber || 'N/A'}) tại ${brName} — bởi ${currentUserDisplayName || 'Admin'}`); });
        } catch (e) { /* skip */ }
        try {
            const mgrSnap = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', (currentBranchId || currentUserBranchId)).get();
            mgrSnap.forEach(doc => { if (doc.id !== currentUserId) sendNotification(doc.id, 'contract', `🏊 VĐV CLB mới: "${name}" (HĐ: ${contractNumber || 'N/A'}) tại ${brName} — bởi ${currentUserDisplayName || 'Sale'}`); });
        } catch (e) { /* skip */ }
        document.getElementById('clb-name').value = '';
        document.getElementById('clb-phone').value = '';
        document.getElementById('clb-contract').value = '';
        document.getElementById('clb-activate-date').value = '';
        if (document.getElementById('clb-sale')) document.getElementById('clb-sale').value = '';
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Thêm VĐV mới (từ Sale tab)
window.addAthleteSale = async function () {
    const name = document.getElementById('sale-clb-name')?.value.trim();
    const phone = document.getElementById('sale-clb-phone')?.value.trim();
    const gender = document.getElementById('sale-clb-gender')?.value;
    const contractNumber = document.getElementById('sale-clb-contract')?.value.trim();
    const classLevel = document.getElementById('sale-clb-class')?.value;
    const sessionsPerWeek = parseInt(document.getElementById('sale-clb-sessions')?.value) || 2;
    const contractMonths = parseInt(document.getElementById('sale-clb-months')?.value) || 1;
    const athleteNote = document.getElementById('sale-clb-note')?.value.trim() || '';
    const activateDateVal = document.getElementById('sale-clb-activate-date')?.value; // YYYY-MM-DD

    // Parse ngày kích hoạt
    let activatedAt = null;
    let expiresAt = null;
    if (activateDateVal) {
        activatedAt = new Date(activateDateVal);
        expiresAt = new Date(activateDateVal);
        expiresAt.setMonth(expiresAt.getMonth() + contractMonths);
    }

    if (!name) return alert('⚠️ Vui lòng nhập họ tên VĐV!');
    if (!contractNumber) return alert('⚠️ Vui lòng nhập số hợp đồng!');
    if (!phone) return alert('⚠️ Vui lòng nhập số điện thoại VĐV!');

    try {
        // Check trùng SĐT + Họ tên
        if (phone && name) {
            const brId = currentBranchId || currentUserBranchId;
            const existing = await db.collection('athletes').where('phone', '==', phone).where('branchId', '==', brId).get();
            // Lọc thêm theo tên
            const matched = existing.docs.find(d => d.data().name.toLowerCase() === name.toLowerCase());
            if (matched) {
                const existDoc = matched;
                const ex = existDoc.data();
                if (ex.isExpired) {
                    if (confirm(`📋 VĐV "${ex.name}" (SĐT: ${phone}) đã có trong hệ thống.\nHĐ cũ: ${ex.contractNumber} | Lớp: ${ex.classLevel} | Đã học: ${ex.totalAttendance || 0} buổi\n\nHĐ đã hết hạn. Kích hoạt lại hợp đồng mới?`)) {
                        const newContract = prompt(`📝 Nhập số hợp đồng MỚI cho ${ex.name}:`, contractNumber);
                        if (!newContract) return;
                        // Dùng ngày kích hoạt từ form nếu có, hoặc hỏi
                        let newActivatedAt = activatedAt;
                        let newExpiresAt = expiresAt;
                        if (!newActivatedAt) {
                            const activateDateStr = prompt(`📅 Nhập ngày kích hoạt HĐ mới (DD/MM/YYYY):\n\nVí dụ: 15/03/2026\nĐể trống = kích hoạt khi điểm danh buổi đầu.`);
                            if (activateDateStr && activateDateStr.trim()) {
                                const parts = activateDateStr.trim().split('/');
                                if (parts.length === 3) {
                                    const d = parseInt(parts[0]), m = parseInt(parts[1]) - 1, y = parseInt(parts[2]);
                                    newActivatedAt = new Date(y, m, d);
                                    newExpiresAt = new Date(y, m + (contractMonths || ex.contractMonths || 1), d);
                                }
                            }
                        }
                        const oldContracts = ex.contractHistory || [];
                        oldContracts.push({ contractNumber: ex.contractNumber, months: ex.contractMonths, sessions: ex.sessionsPerWeek, expiredAt: ex.expiresAt, classLevel: ex.classLevel });
                        const updateData = {
                            contractNumber: newContract,
                            contractMonths,
                            sessionsPerWeek,
                            classLevel,
                            isExpired: false,
                            isFrozen: false,
                            activatedAt: newActivatedAt || null,
                            expiresAt: newExpiresAt || null,
                            contractHistory: oldContracts
                        };
                        await db.collection('athletes').doc(existDoc.id).update(updateData);
                        // Auto sync CLB gia hạn lên Google Sheet (Sale tab)
                        const brNameSync3 = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'N/A';
                        syncClbRowToSheet({
                            action: 'addClbRow', branchName: 'CLB_' + brNameSync3, stt: '',
                            syncTime: new Date().toLocaleString('vi-VN'),
                            name: ex.name, phone: phone || '',
                            contractNumber: newContract,
                            athleteClass: classLevel || ex.classLevel || '',
                            pkg: `${sessionsPerWeek || ex.sessionsPerWeek || 3} buổi/tuần × ${contractMonths || ex.contractMonths || 3} tháng`,
                            activatedAt: newActivatedAt ? newActivatedAt.toLocaleDateString('vi-VN') : 'Chưa KH',
                            expiresAt: newExpiresAt ? newExpiresAt.toLocaleDateString('vi-VN') : 'N/A',
                            saleName: window._currentUserData?.name || 'N/A'
                        });
                        const activateMsg = newActivatedAt
                            ? `Kích hoạt: ${newActivatedAt.toLocaleDateString('vi-VN')} → Hết hạn: ${newExpiresAt.toLocaleDateString('vi-VN')}`
                            : 'Sẽ kích hoạt khi điểm danh buổi đầu';
                        alert(`✅ Đã gia hạn HĐ mới "${newContract}" cho ${ex.name}!\n${activateMsg}\nHĐ cũ "${ex.contractNumber}" đã lưu lại.\nTổng buổi đã học vẫn giữ: ${ex.totalAttendance || 0}`);
                        document.getElementById('sale-clb-name').value = '';
                        document.getElementById('sale-clb-phone').value = '';
                        document.getElementById('sale-clb-contract').value = '';
                        if (document.getElementById('sale-clb-activate-date')) document.getElementById('sale-clb-activate-date').value = '';
                        return;
                    } else return;
                } else {
                    alert(`⚠️ VĐV "${ex.name}" (SĐT: ${phone}) đã tồn tại và đang hoạt động!\nHĐ: ${ex.contractNumber} | Lớp: ${ex.classLevel}`);
                    return;
                }
            }
        }

        await db.collection('athletes').add({
            name, phone: phone || '', gender: gender || 'Nam',
            contractNumber: contractNumber || 'Chưa có',
            classLevel,
            branchId: currentBranchId || currentUserBranchId,
            sessionsPerWeek,
            contractMonths,
            activatedAt: activatedAt || null,
            expiresAt: expiresAt || null,
            isExpired: false,
            totalAttendance: 0,
            creatorId: currentUserId,
            creatorName: window._currentUserData?.name || '',
            athleteNote: athleteNote,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Auto sync VĐV CLB mới lên Google Sheet (Sale tab)
        const brNameSync4 = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'N/A';
        syncClbRowToSheet({
            action: 'addClbRow', branchName: 'CLB_' + brNameSync4, stt: '',
            syncTime: new Date().toLocaleString('vi-VN'),
            name: name, phone: phone || '',
            contractNumber: contractNumber || 'Chưa có',
            athleteClass: classLevel || '',
            pkg: `${sessionsPerWeek || 3} buổi/tuần × ${contractMonths || 3} tháng`,
            activatedAt: activatedAt ? activatedAt.toLocaleDateString('vi-VN') : 'Chưa KH',
            expiresAt: expiresAt ? expiresAt.toLocaleDateString('vi-VN') : 'N/A',
            saleName: window._currentUserData?.name || 'N/A'
        });
        const activateMsg = activatedAt
            ? `Kích hoạt: ${activatedAt.toLocaleDateString('vi-VN')} → Hết hạn: ${expiresAt.toLocaleDateString('vi-VN')}`
            : 'Sẽ kích hoạt khi điểm danh buổi đầu';
        alert(`✅ Đã thêm VĐV CLB mới!\n${activateMsg}`);
        // Thông báo Admin + Manager
        const brName2 = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'cơ sở';
        try {
            const admSnap2 = await db.collection('users').where('role', '==', 'ADMIN').get();
            admSnap2.forEach(doc => { if (doc.id !== currentUserId) sendNotification(doc.id, 'contract', `🏊 VĐV CLB mới: "${name}" (HĐ: ${contractNumber || 'N/A'}) tại ${brName2} — bởi ${currentUserDisplayName || 'Sale'}`); });
        } catch (e) { /* skip */ }
        try {
            const mgrSnap2 = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', (currentBranchId || currentUserBranchId)).get();
            mgrSnap2.forEach(doc => { if (doc.id !== currentUserId) sendNotification(doc.id, 'contract', `🏊 VĐV CLB mới: "${name}" (HĐ: ${contractNumber || 'N/A'}) tại ${brName2} — bởi ${currentUserDisplayName || 'Sale'}`); });
        } catch (e) { /* skip */ }
        document.getElementById('sale-clb-name').value = '';
        document.getElementById('sale-clb-phone').value = '';
        document.getElementById('sale-clb-contract').value = '';
        if (document.getElementById('sale-clb-note')) document.getElementById('sale-clb-note').value = '';
        if (document.getElementById('sale-clb-activate-date')) document.getElementById('sale-clb-activate-date').value = '';
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};
function listenToAthletes() {
    if (clbAthleteUnsub) clbAthleteUnsub();
    let query = db.collection('athletes');

    // Tất cả role đều lọc theo cơ sở
    const branchForFilter = currentBranchId || currentUserBranchId;
    if (branchForFilter) {
        query = query.where('branchId', '==', branchForFilter);
    }

    // Load danh sách Sale vào dropdown
    const saleSelect = document.getElementById('clb-sale');
    if (saleSelect && saleSelect.options.length <= 1) {
        db.collection('users').get().then(snap => {
            snap.docs.forEach(d => {
                const u = d.data();
                if (u.role === 'SALE' || u.role === 'ADMIN') {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = u.name;
                    saleSelect.appendChild(opt);
                }
            });
        });
    }

    clbAthleteUnsub = query.onSnapshot(snap => {
        clbAthletesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Auto-expire kiểm tra (cả 2 chiều)
        const now = new Date();
        clbAthletesCache.forEach(a => {
            if (a.expiresAt) {
                const exp = a.expiresAt.toDate ? a.expiresAt.toDate() : new Date(a.expiresAt);
                if (!a.isExpired && now > exp) {
                    // Hết hạn → đánh dấu
                    db.collection('athletes').doc(a.id).update({ isExpired: true });
                } else if (a.isExpired && now <= exp) {
                    // Đã gia hạn (expiresAt mới > ngày hiện tại) nhưng flag cũ chưa reset → auto reset
                    db.collection('athletes').doc(a.id).update({ isExpired: false });
                    a.isExpired = false; // Update local cache ngay
                }
            }
        });

        renderClbTable();
        // Auto-fix creatorId nếu creatorName đã đổi nhưng creatorId chưa đổi
        if (currentUserRole === 'ADMIN') migrateClbCreatorIds();
    });
}

// Xuất Excel (CSV) danh sách VĐV CLB theo lớp đang filter
window.exportClbExcel = function () {
    const filterClass = document.getElementById('clb-filter-class')?.value || '';
    let data = clbAthletesCache.filter(a => !a.isExpired);
    if (filterClass) data = data.filter(a => a.classLevel === filterClass);

    if (data.length === 0) return alert('⚠️ Không có VĐV nào để xuất!');

    // Sort theo lớp → tên
    const classOrder = { 'Mầm': 0, 'D1': 1, 'D2': 2, 'C': 3, 'B': 4, 'A': 5 };
    data.sort((a, b) => (classOrder[a.classLevel] || 0) - (classOrder[b.classLevel] || 0) || a.name.localeCompare(b.name, 'vi'));

    const rows = [['STT', 'Họ và tên', 'Số hợp đồng', 'Loại hợp đồng', 'Ngày kích hoạt', 'Lớp tập luyện', 'SĐT', 'Trạng thái']];

    data.forEach((a, i) => {
        const contractType = `${a.contractMonths || '?'} tháng ${a.sessionsPerWeek || '?'} buổi/tuần`;
        let activatedDate = '—';
        if (a.activatedAt) {
            const d = a.activatedAt.toDate ? a.activatedAt.toDate() : new Date(a.activatedAt);
            activatedDate = d.toLocaleDateString('vi-VN');
        }
        const status = a.isFrozen ? 'Bảo lưu' : 'Đang học';
        rows.push([i + 1, a.name, a.contractNumber || '', contractType, activatedDate, a.classLevel || '', a.phone || '', status]);
    });

    const brName = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'CS';
    const fileName = filterClass ? `VDV_CLB_Lop_${filterClass}_${brName}.xlsx` : `VDV_CLB_TatCa_${brName}.xlsx`;
    downloadXLSX(rows, fileName, 'Danh sách VĐV');
};

// Render bảng VĐV
window.renderClbTable = function () {
    const tbody = document.getElementById('clb-athletes-tbody');
    if (!tbody) return;

    // --- STATS ---
    const statsContainer = document.getElementById('clb-stats-container');
    if (statsContainer) {
        let baseData = clbAthletesCache;
        if (currentUserRole === 'TEACHER') {
            const cc = window._currentUserData?.coachClasses || [];
            baseData = baseData.filter(a => cc.includes(a.classLevel));
        }
        const active = baseData.filter(a => !a.isExpired);
        const classCounts = {};
        CLB_LEVELS.forEach(l => { classCounts[l] = 0; });
        active.forEach(a => { if (classCounts[a.classLevel] !== undefined) classCounts[a.classLevel]++; });

        const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' };
        let statsHtml = '';
        // Tổng VĐV chỉ Admin/Manager thấy, HLV không thấy
        if (currentUserRole !== 'TEACHER') {
            statsHtml += `
                <div onclick="document.getElementById('clb-filter-class').value=''; renderClbTable();"
                    style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:10px; padding:12px; text-align:center; cursor:pointer; transition:transform 0.15s;"
                    onmouseenter="this.style.transform='scale(1.05)';"
                    onmouseleave="this.style.transform='scale(1)';">
                    <div style="font-size:22px; font-weight:700; color:var(--primary);">${active.length}</div>
                    <div style="font-size:11px; color:var(--text-muted);">Tổng VĐV</div>
                </div>`;
        }
        CLB_LEVELS.forEach(l => {
            if (currentUserRole === 'TEACHER') {
                const cc = window._currentUserData?.coachClasses || [];
                if (!cc.includes(l)) return;
            }
            statsHtml += `
                <div onclick="document.getElementById('clb-filter-class').value='${l}'; renderClbTable(); document.getElementById('clb-athletes-tbody')?.scrollIntoView({behavior:'smooth'});"
                    style="background:${levelColor[l]}15; border:1px solid ${levelColor[l]}40; border-radius:10px; padding:12px; text-align:center; cursor:pointer; transition:transform 0.15s, box-shadow 0.15s;"
                    onmouseenter="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px ${levelColor[l]}30';"
                    onmouseleave="this.style.transform='scale(1)'; this.style.boxShadow='none';">
                    <div style="font-size:22px; font-weight:700; color:${levelColor[l]};">${classCounts[l]}</div>
                    <div style="font-size:11px; color:var(--text-muted);">Lớp ${l}</div>
                </div>`;
        });
        // Today attendance count — filter theo cơ sở hiện tại
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const brId = currentBranchId || currentUserBranchId;
        db.collection('clb_attendance')
            .where('branchId', '==', brId)
            .where('timestamp', '>=', today)
            .get().then(snap => {
                let todayCount = snap.size;
                if (currentUserRole === 'TEACHER') {
                    const cc = window._currentUserData?.coachClasses || [];
                    todayCount = snap.docs.filter(d => cc.includes(d.data().classLevel)).length;
                }
                const todayEl = document.getElementById('clb-today-count');
                if (todayEl) todayEl.textContent = todayCount;
            }).catch(() => {
                // Fallback: nếu thiếu composite index, query không có orderBy
                db.collection('clb_attendance')
                    .where('branchId', '==', brId)
                    .get().then(snap => {
                        const todayDocs = snap.docs.filter(d => {
                            const ts = d.data().timestamp?.toDate?.();
                            return ts && ts >= today;
                        });
                        let todayCount = todayDocs.length;
                        if (currentUserRole === 'TEACHER') {
                            const cc = window._currentUserData?.coachClasses || [];
                            todayCount = todayDocs.filter(d => cc.includes(d.data().classLevel)).length;
                        }
                        const todayEl = document.getElementById('clb-today-count');
                        if (todayEl) todayEl.textContent = todayCount;
                    });
            });
        statsHtml += `
            <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:12px; text-align:center;">
                <div style="font-size:22px; font-weight:700; color:#10b981;" id="clb-today-count">...</div>
                <div style="font-size:11px; color:var(--text-muted);">Điểm danh hôm nay</div>
            </div>`;
        statsContainer.innerHTML = statsHtml;
    }

    // --- FILTER ---
    const filterClass = document.getElementById('clb-filter-class')?.value || '';
    const filterStatus = document.getElementById('clb-filter-status')?.value || 'active';
    const search = (document.getElementById('clb-search')?.value || '').trim().toLowerCase();

    // Reset trang khi filter/search thay đổi
    const filterKey = `${filterClass}|${filterStatus}|${search}`;
    if (window._clbLastFilterKey !== filterKey) {
        window._clbCurrentPage = 1;
        window._clbLastFilterKey = filterKey;
    }

    // HLV filter by coachClasses
    let filtered = clbAthletesCache;
    if (currentUserRole === 'TEACHER') {
        const coachClasses = window._currentUserData?.coachClasses || [];
        filtered = filtered.filter(a => coachClasses.includes(a.classLevel));
    }

    if (filterClass) filtered = filtered.filter(a => a.classLevel === filterClass);
    if (filterStatus === 'active') filtered = filtered.filter(a => !a.isExpired && !a.isFrozen);
    else if (filterStatus === 'frozen') filtered = filtered.filter(a => a.isFrozen);
    else if (filterStatus === 'expired') filtered = filtered.filter(a => a.isExpired);
    if (search) filtered = filtered.filter(a => a.name.toLowerCase().includes(search) || (a.phone || '').includes(search) || (a.contractNumber || '').toLowerCase().includes(search));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">Không có VĐV nào.</td></tr>`;
        return;
    }

    // Sắp xếp theo ngày thêm (mới nhất trước)
    filtered.sort((a, b) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt || 0);
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt || 0);
        return tB - tA;
    });

    // Pagination: hiện 10 VĐV mỗi lần
    const PAGE_SIZE = 10;
    const currentPage = window._clbCurrentPage || 1;
    const showCount = currentPage * PAGE_SIZE;
    const visibleItems = filtered.slice(0, showCount);
    const hasMore = filtered.length > showCount;

    let html = '';
    visibleItems.forEach(a => {
        const levelIdx = CLB_LEVELS.indexOf(a.classLevel);
        const canPromote = levelIdx < CLB_LEVELS.length - 1 && !a.isExpired && !a.isFrozen;
        const nextLevel = canPromote ? CLB_LEVELS[levelIdx + 1] : null;

        let statusHtml = '';
        let dateHtml = '';
        if (a.isFrozen) {
            const frozenUntil = a.frozenUntil?.toDate ? a.frozenUntil.toDate() : null;
            statusHtml = `<span style="background:rgba(99,102,241,0.1); color:#6366f1; padding:3px 8px; border-radius:6px; font-size:12px; font-weight:600;">⏸ Bảo lưu</span>`;
            dateHtml = frozenUntil ? `BL đến ${frozenUntil.toLocaleDateString('vi-VN')}` : '';
        } else if (a.isExpired) {
            statusHtml = '<span style="background:rgba(239,68,68,0.1); color:#ef4444; padding:3px 8px; border-radius:6px; font-size:12px; font-weight:600;">Hết hạn</span>';
        } else if (a.activatedAt) {
            statusHtml = '<span style="background:rgba(34,197,94,0.1); color:#16a34a; padding:3px 8px; border-radius:6px; font-size:12px; font-weight:600;">Hoạt động</span>';
            const exp = a.expiresAt?.toDate ? a.expiresAt.toDate() : null;
            dateHtml = exp ? `${exp.toLocaleDateString('vi-VN')}` : '';
        } else {
            statusHtml = '<span style="background:rgba(107,114,128,0.1); color:#6b7280; padding:3px 8px; border-radius:6px; font-size:12px; font-weight:600;">Chưa kích hoạt</span>';
        }

        const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' }[a.classLevel] || '#6b7280';

        // Action buttons
        let actionsHtml = '';
        if (canPromote) {
            actionsHtml += `<button class="btn btn-sm" onclick="promoteAthlete('${a.id}', '${a.classLevel}')" style="font-size:11px; padding:4px 8px; background:rgba(16,185,129,0.1); color:#10b981; border:1px solid rgba(16,185,129,0.3);"><i class="fa-solid fa-arrow-up"></i> ${nextLevel}</button>`;
        }
        if (!a.isExpired && !a.isFrozen && a.activatedAt && currentUserRole === 'ADMIN') {
            actionsHtml += ` <button class="btn btn-sm" onclick="extendAthlete('${a.id}')" style="font-size:11px; padding:4px 8px; background:rgba(245,158,11,0.1); color:#d97706; border:1px solid rgba(245,158,11,0.3);"><i class="fa-solid fa-calendar-plus"></i></button>`;
            actionsHtml += ` <button class="btn btn-sm" onclick="freezeAthlete('${a.id}')" style="font-size:11px; padding:4px 8px; background:rgba(99,102,241,0.1); color:#6366f1; border:1px solid rgba(99,102,241,0.3);"><i class="fa-solid fa-pause"></i> BL</button>`;
        }
        if (a.isFrozen && currentUserRole === 'ADMIN') {
            actionsHtml += ` <button class="btn btn-sm" onclick="unfreezeAthlete('${a.id}')" style="font-size:11px; padding:4px 8px; background:rgba(34,197,94,0.1); color:#16a34a; border:1px solid rgba(34,197,94,0.3);"><i class="fa-solid fa-play"></i> Mở BL</button>`;
        }
        if (currentUserRole === 'ADMIN') {
            actionsHtml += ` <button class="btn btn-sm" onclick="editAthlete('${a.id}')" style="font-size:11px; padding:4px 8px; background:rgba(59,130,246,0.1); color:#3b82f6; border:1px solid rgba(59,130,246,0.3);"><i class="fa-solid fa-pen"></i></button>`;
            actionsHtml += ` <button class="btn btn-sm" onclick="deleteAthlete('${a.id}', '${a.name.replace(/'/g, "\\\\'")}')" style="font-size:11px; padding:4px 8px; background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.3);"><i class="fa-solid fa-trash"></i></button>`;
        }

        html += `
            <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:12px 15px;">
                    <div style="font-weight:600; color:var(--text-color);">${a.name} <span style="font-size:11px; color:var(--text-muted);">(${a.gender || 'N/A'})</span></div>
                    ${a.phone ? `<div style="font-size:12px; color:var(--text-muted);">${a.phone}</div>` : ''}
                    ${a.contractNumber ? `<div style="font-size:11px; color:var(--text-muted);">HĐ: ${a.contractNumber}</div>` : ''}
                    <div style="font-size:11px; color:var(--primary); font-weight:600;">Đã học: ${a.totalAttendance || 0} buổi</div>
                    ${a.creatorName ? `<div style="font-size:11px; color:var(--text-muted);"><i class="fa-solid fa-user-tag"></i> Sale: ${a.creatorName} ${currentUserRole === 'ADMIN' ? `<button onclick="changeSaleForAthlete('${a.id}')" style="margin-left:4px; padding:1px 5px; border:none; background:rgba(59,130,246,0.1); color:#3b82f6; border-radius:3px; cursor:pointer; font-size:10px;" title="Đổi Sale"><i class="fa-solid fa-right-left"></i></button>` : ''}</div>` : ''}
                    <div style="margin-top:4px;">
                        ${(currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER')
                ? `<textarea id="note-${a.id}" placeholder="📝 Phương án vào bể..." onblur="saveAthleteNote('${a.id}', this.value)" style="width:100%; min-height:28px; max-height:60px; padding:4px 6px; font-size:11px; border:1px solid var(--border-color); border-radius:5px; background:var(--card-bg); color:var(--text-color); resize:vertical; box-sizing:border-box;">${(a.athleteNote || '').replace(/</g, '&lt;')}</textarea>`
                : (a.athleteNote ? `<div style="font-size:11px; color:#10b981; padding:4px 6px; background:rgba(16,185,129,0.05); border-radius:5px; border:1px solid rgba(16,185,129,0.15);"><i class="fa-solid fa-clipboard"></i> ${(a.athleteNote || '').replace(/</g, '&lt;')}</div>` : `<div style="font-size:11px; color:var(--text-muted); padding:4px 6px;">— Chưa có ghi chú</div>`)
            }
                    </div>
                </td>
                <td style="padding:12px 15px;">
                    <span style="background:${levelColor}; color:#fff; padding:3px 10px; border-radius:6px; font-size:13px; font-weight:700;">${a.classLevel}</span>
                </td>
                <td style="padding:12px 15px; font-size:13px; color:var(--text-color);">
                    ${a.sessionsPerWeek} buổi/tuần<br>
                    <span style="color:var(--text-muted);">${a.contractMonths} tháng</span>
                </td>
                <td style="padding:12px 15px; font-size:13px; color:var(--text-color);">
                    ${dateHtml || '—'}
                </td>
                <td style="padding:12px 15px;">${statusHtml}</td>
                <td style="padding:12px 15px; white-space:nowrap;">${actionsHtml}</td>
            </tr>
        `;
    });

    // Nút "Xem thêm" hoặc "Đã hiện hết"
    if (hasMore) {
        html += `<tr><td colspan="6" style="text-align:center; padding:12px;">
            <button onclick="window._clbCurrentPage = ${currentPage + 1}; renderClbTable();"
                style="padding:8px 24px; border-radius:8px; border:1px solid var(--primary); background:rgba(37,99,235,0.1); color:var(--primary); font-weight:600; cursor:pointer; font-size:13px;">
                <i class="fa-solid fa-chevron-down"></i> Xem thêm (${Math.min(filtered.length - showCount, PAGE_SIZE)} VĐV nữa)
            </button>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Đang hiện ${showCount}/${filtered.length} VĐV</div>
        </td></tr>`;
    } else if (filtered.length > PAGE_SIZE) {
        html += `<tr><td colspan="6" style="text-align:center; padding:8px; font-size:12px; color:var(--text-muted);">
            Đã hiện tất cả ${filtered.length} VĐV
        </td></tr>`;
    }

    tbody.innerHTML = html;

    // Set max-height cho bảng có scroll
    const tableWrapper = tbody.closest('.table-responsive') || tbody.closest('div');
    if (tableWrapper) {
        tableWrapper.style.maxHeight = '600px';
        tableWrapper.style.overflowY = 'auto';
    }
    renderClbTodayAttendance(); // Hiện danh sách điểm danh hôm nay
};

// Lưu ghi chú VĐV CLB (phương án vào bể)
window.saveAthleteNote = async function (athleteId, note) {
    try {
        await db.collection('athletes').doc(athleteId).update({ athleteNote: note.trim() });
    } catch (e) {
        console.error('Lỗi lưu ghi chú VĐV:', e);
    }
};

// Chuyển cấp VĐV
window.promoteAthlete = async function (athleteId, currentLevel) {
    const idx = CLB_LEVELS.indexOf(currentLevel);
    if (idx >= CLB_LEVELS.length - 1) return alert('VĐV đã ở cấp cao nhất (A)!');
    const nextLevel = CLB_LEVELS[idx + 1];
    if (!confirm(`⬆️ Chuyển VĐV lên lớp ${nextLevel}?`)) return;
    await db.collection('athletes').doc(athleteId).update({ classLevel: nextLevel });
    alert(`✅ Đã chuyển lên lớp ${nextLevel}!`);
};

// Gia hạn nghỉ lễ hàng loạt (Admin)
// Xoá hàng loạt VĐV CLB (Admin)
window.bulkDeleteAthletes = async function () {
    const brId = currentBranchId || currentUserBranchId;
    if (!brId) return alert('⚠️ Chưa chọn cơ sở!');

    const snap = await db.collection('athletes').where('branchId', '==', brId).get();
    if (snap.empty) return alert('Không có VĐV nào!');

    const confirm1 = prompt(`⚠️ XOÁ TẤT CẢ ${snap.size} VĐV CLB ở cơ sở này?\n\nGõ "XOA" để xác nhận:`);
    if (confirm1 !== 'XOA') return alert('Đã huỷ.');

    let count = 0;
    for (const doc of snap.docs) {
        await doc.ref.delete();
        count++;
    }
    alert(`✅ Đã xoá ${count} VĐV!`);
};

window.bulkExtendHoliday = async function () {
    const days = parseInt(prompt('📅 Nhập số ngày nghỉ lễ cần gia hạn cho TẤT CẢ VĐV đang hoạt động:', '3'));
    if (!days || days <= 0) return;

    const brId = currentBranchId || currentUserBranchId;
    if (!confirm(`⚠️ Gia hạn ${days} ngày cho TẤT CẢ VĐV đang hoạt động tại cơ sở?\n\nThao tác này sẽ cộng thêm ${days} ngày vào hạn HĐ.`)) return;

    try {
        const snap = await db.collection('athletes')
            .where('branchId', '==', brId)
            .where('isExpired', '==', false)
            .get();

        let count = 0;
        const batch = db.batch();
        snap.docs.forEach(doc => {
            const d = doc.data();
            if (d.isFrozen || !d.expiresAt) return;
            const exp = d.expiresAt.toDate ? d.expiresAt.toDate() : new Date(d.expiresAt);
            exp.setDate(exp.getDate() + days);
            batch.update(doc.ref, { expiresAt: exp });
            count++;
        });
        await batch.commit();
        alert(`✅ Đã gia hạn ${days} ngày cho ${count} VĐV!`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Gia hạn từng VĐV (Admin)
window.extendAthlete = async function (athleteId) {
    const days = parseInt(prompt('📅 Nhập số ngày gia hạn thêm:', '3'));
    if (!days || days <= 0) return;

    try {
        const doc = await db.collection('athletes').doc(athleteId).get();
        const d = doc.data();
        if (!d.expiresAt) return alert('VĐV chưa kích hoạt HĐ!');
        const exp = d.expiresAt.toDate ? d.expiresAt.toDate() : new Date(d.expiresAt);
        exp.setDate(exp.getDate() + days);
        await db.collection('athletes').doc(athleteId).update({ expiresAt: exp });
        alert(`✅ Đã gia hạn ${days} ngày cho ${d.name}! Hạn mới: ${exp.toLocaleDateString('vi-VN')}`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Bảo lưu VĐV (Admin) - 30 ngày
window.freezeAthlete = async function (athleteId) {
    if (!confirm('⏸ Bảo lưu VĐV này 30 ngày?\n\nHĐ sẽ tạm dừng và tự động cộng 30 ngày khi mở bảo lưu.')) return;

    try {
        const doc = await db.collection('athletes').doc(athleteId).get();
        const d = doc.data();
        const frozenUntil = new Date();
        frozenUntil.setDate(frozenUntil.getDate() + 30);

        await db.collection('athletes').doc(athleteId).update({
            isFrozen: true,
            frozenAt: firebase.firestore.FieldValue.serverTimestamp(),
            frozenUntil: frozenUntil
        });
        alert(`✅ Đã bảo lưu ${d.name} đến ${frozenUntil.toLocaleDateString('vi-VN')}!`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Mở bảo lưu VĐV (Admin)
window.unfreezeAthlete = async function (athleteId) {
    if (!confirm('▶️ Mở bảo lưu VĐV này?\n\nHĐ sẽ được cộng thêm 30 ngày từ hôm nay.')) return;

    try {
        const doc = await db.collection('athletes').doc(athleteId).get();
        const d = doc.data();
        // Cộng 30 ngày vào expiresAt
        let exp = d.expiresAt?.toDate ? d.expiresAt.toDate() : new Date();
        const now = new Date();
        // Nếu HĐ đã qua hạn trong lúc BL thì tính từ hôm nay
        if (exp < now) exp = now;
        exp.setDate(exp.getDate() + 30);

        await db.collection('athletes').doc(athleteId).update({
            isFrozen: false,
            frozenAt: null,
            frozenUntil: null,
            expiresAt: exp,
            isExpired: false
        });
        alert(`✅ Đã mở bảo lưu ${d.name}! Hạn mới: ${exp.toLocaleDateString('vi-VN')}`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Sửa thông tin VĐV CLB (Admin)
window.editAthlete = async function (athleteId) {
    try {
        const doc = await db.collection('athletes').doc(athleteId).get();
        if (!doc.exists) return alert('Không tìm thấy VĐV!');
        const a = doc.data();
        const ALL_CLB = ['Mầm', 'D1', 'D2', 'C', 'B', 'A'];

        const name = prompt(`Tên VĐV:`, a.name);
        if (name === null) return;
        const phone = prompt(`SĐT:`, a.phone || '');
        if (phone === null) return;
        const gender = prompt(`Giới tính (Nam/Nữ):`, a.gender || 'Nam');
        if (gender === null) return;
        const classLevel = prompt(`Lớp (${ALL_CLB.join(', ')}):`, a.classLevel || 'Mầm');
        if (classLevel === null) return;
        const contractNumber = prompt(`Số HĐ:`, a.contractNumber || '');
        if (contractNumber === null) return;
        const sessionsPerWeek = prompt(`Buổi/tuần:`, a.sessionsPerWeek || 3);
        if (sessionsPerWeek === null) return;
        const contractMonths = prompt(`Số tháng HĐ:`, a.contractMonths || 3);
        if (contractMonths === null) return;

        // Cho Admin sửa ngày kích hoạt
        const currentActivated = a.activatedAt?.toDate ? a.activatedAt.toDate() : null;
        const currentDateStr = currentActivated
            ? `${currentActivated.getFullYear()}-${String(currentActivated.getMonth() + 1).padStart(2, '0')}-${String(currentActivated.getDate()).padStart(2, '0')}`
            : '';
        const newDateStr = prompt(`Ngày kích hoạt (YYYY-MM-DD):`, currentDateStr);
        if (newDateStr === null) return;

        const updates = {
            name: name.trim() || a.name,
            phone: phone.trim(),
            gender: gender.trim() || 'Nam',
            classLevel: ALL_CLB.includes(classLevel.trim()) ? classLevel.trim() : a.classLevel,
            contractNumber: contractNumber.trim() || 'Chưa có',
            sessionsPerWeek: parseInt(sessionsPerWeek) || a.sessionsPerWeek,
            contractMonths: parseInt(contractMonths) || a.contractMonths
        };

        // Cập nhật ngày kích hoạt + tự tính ngày hết hạn
        if (newDateStr.trim()) {
            const newDate = new Date(newDateStr.trim());
            if (!isNaN(newDate.getTime())) {
                updates.activatedAt = newDate;
                const months = parseInt(contractMonths) || a.contractMonths || 3;
                const expires = new Date(newDate);
                expires.setMonth(expires.getMonth() + months);
                updates.expiresAt = expires;
                updates.isExpired = expires < new Date();
            }
        }

        await db.collection('athletes').doc(athleteId).update(updates);
        alert(`✅ Đã cập nhật thông tin ${updates.name}!`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Xoá VĐV CLB (Admin)
// Import VĐV CLB từ CSV (Admin)
window.importClbCsv = async function (input) {
    const file = input.files[0];
    if (!file) return;
    input.value = ''; // reset

    const reader = new FileReader();
    reader.onload = async function (e) {
        const text = e.target.result;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);

        if (lines.length < 2) {
            return alert('⚠️ File CSV cần ít nhất 2 dòng (1 header + 1 data).\n\nĐịnh dạng:\nTên,SĐT,Số HĐ,Ngày kích hoạt,Buổi/tuần,Số tháng\nNguyễn Văn A,0912345678,HD001,01/03/2026,3,3');
        }

        // Skip header
        const dataLines = lines.slice(1);
        const brId = currentBranchId || currentUserBranchId;
        if (!brId) return alert('⚠️ Chưa chọn cơ sở!');

        // Hỏi lớp mặc định
        const defaultClass = prompt('🏋️ Lớp mặc định cho tất cả VĐV import?\n\nCác lớp: Mầm, D1, D2, C, B, A', 'Mầm');
        if (defaultClass === null) return;
        const validLevels = ['Mầm', 'D1', 'D2', 'C', 'B', 'A'];
        const classLevel = validLevels.includes(defaultClass.trim()) ? defaultClass.trim() : 'Mầm';

        // Auto-detect dấu phân cách (;  ,  hoặc tab)
        const firstLine = dataLines[0];
        let delimiter = ',';
        if (firstLine.includes(';')) delimiter = ';';
        else if (firstLine.includes('\t')) delimiter = '\t';

        if (!confirm(`📋 Import ${dataLines.length} VĐV CLB vào lớp "${classLevel}"?\n\nDấu phân cách: "${delimiter === '\t' ? 'TAB' : delimiter}"\nCột: Tên${delimiter}SĐT${delimiter}Số HĐ${delimiter}Ngày kích hoạt${delimiter}Buổi/tuần${delimiter}Số tháng\n\nDòng đầu tiên:\n${firstLine}\n\nBấm OK để bắt đầu.`)) return;

        let errors = [];
        let success = 0;

        for (let i = 0; i < dataLines.length; i++) {
            const cols = dataLines[i].split(delimiter).map(c => c.trim());
            if (cols.length < 1 || !cols[0]) { errors.push(`Dòng ${i + 2}: trống`); continue; }

            const name = cols[0];
            const phone = cols[1] || '';
            const contractNumber = cols[2] || 'Chưa có';
            const activateDateStr = cols[3] || '';
            const sessionsPerWeek = parseInt(cols[4]) || 3;
            const contractMonths = parseInt(cols[5]) || 3;

            // Parse ngày kích hoạt (dd/mm/yyyy)
            let activatedAt = null;
            let expiresAt = null;
            if (activateDateStr) {
                const parts = activateDateStr.split('/');
                if (parts.length === 3) {
                    const d = parseInt(parts[0]), m = parseInt(parts[1]) - 1, y = parseInt(parts[2]);
                    activatedAt = new Date(y, m, d);
                    expiresAt = new Date(y, m + contractMonths, d);
                }
            }

            try {
                await db.collection('athletes').add({
                    name, phone, gender: 'Nam',
                    contractNumber, classLevel,
                    branchId: brId,
                    sessionsPerWeek, contractMonths,
                    activatedAt: activatedAt || null,
                    expiresAt: expiresAt || null,
                    isExpired: false,
                    totalAttendance: 0,
                    creatorId: currentUserId,
                    creatorName: window._currentUserData?.name || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                success++;
            } catch (err) {
                errors.push(`Dòng ${i + 2} (${name}): ${err.message}`);
            }
        }

        let msg = `✅ Import thành công ${success}/${dataLines.length} VĐV!`;
        if (errors.length > 0) {
            msg += `\n\n⚠️ Lỗi:\n${errors.slice(0, 10).join('\n')}`;
        }
        alert(msg);
    };
    reader.readAsText(file, 'UTF-8');
};

window.deleteAthlete = async function (athleteId, name) {
    if (!confirm(`🗑️ Xoá VĐV "${name}" khỏi CLB?\n\n⚠️ Thao tác này KHÔNG THỂ hoàn tác!`)) return;
    try {
        await db.collection('athletes').doc(athleteId).delete();
        alert(`✅ Đã xoá VĐV "${name}"!`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

