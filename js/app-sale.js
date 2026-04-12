// ===== GreenPool App — Sale Module (v7.0) =====

let saleFilterMode = 'all';
window.setSaleFilter = function (mode) {
    saleFilterMode = mode;
    document.querySelectorAll('.sale-filter-btn').forEach(btn => {
        const isActive = btn.getAttribute('data-filter') === mode;
        btn.style.background = isActive ? 'var(--primary)' : 'transparent';
        btn.style.color = isActive ? '#fff' : 'var(--text-muted)';
        btn.style.borderColor = isActive ? 'var(--primary)' : 'var(--border-color)';
    });
    renderSaleStats();
};

window.filterSaleContracts = function () {
    renderSaleStats();
};

// ============= TOGGLE SALE STATS MODE (HV / CLB) ============= //
let _saleClbData = [];
window.toggleSaleStatsMode = function (isClb) {
    const hvMode = document.getElementById('salestats-hv-mode');
    const clbMode = document.getElementById('salestats-clb-mode');
    const btnHv = document.getElementById('salestats-btn-hv');
    const btnClb = document.getElementById('salestats-btn-clb');
    if (!hvMode || !clbMode) return;

    if (isClb) {
        hvMode.style.display = 'none';
        clbMode.style.display = 'block';
        btnHv.style.background = 'transparent'; btnHv.style.color = 'var(--text-muted)';
        btnClb.style.background = 'var(--primary)'; btnClb.style.color = '#fff';
        loadSaleClbStats();
    } else {
        hvMode.style.display = 'block';
        clbMode.style.display = 'none';
        btnHv.style.background = 'var(--primary)'; btnHv.style.color = '#fff';
        btnClb.style.background = 'transparent'; btnClb.style.color = 'var(--text-muted)';
    }
};

let _saleClbUnsub = null;
window.loadSaleClbStats = async function () {
    const statsBox = document.getElementById('sale-clb-stats');
    const listBox = document.getElementById('sale-clb-list');
    if (!statsBox || !listBox) return;

    // Cleanup previous listener
    if (_saleClbUnsub) { _saleClbUnsub(); _saleClbUnsub = null; }

    listBox.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';

    const branchId = currentBranchId || currentUserBranchId || (localState.branches?.[0]?.id);
    let query = db.collection('athletes').where('branchId', '==', branchId);
    if (currentUserRole === 'SALE') {
        query = query.where('creatorId', '==', currentUserId);
    }

    _saleClbUnsub = query.onSnapshot(async (snap) => {
    try {
        _saleClbData = [];
        snap.forEach(doc => { _saleClbData.push({ id: doc.id, ...doc.data() }); });

        // Hiện dropdown chọn Sale cho Admin/Manager
        const clbSaleWrap = document.getElementById('stats-clb-sale-filter-wrap');
        const clbSaleSelect = document.getElementById('stats-clb-sale-filter');
        if ((currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') && clbSaleWrap && clbSaleSelect) {
            clbSaleWrap.style.display = 'block';
            // Re-populate mỗi lần load
            const prevClbVal = clbSaleSelect.value;
            const creatorIds = [...new Set(_saleClbData.map(a => a.creatorId).filter(Boolean))];
            const usersSnap = await db.collection('users').get();
            const usersMap = {};
            usersSnap.docs.forEach(d => { usersMap[d.id] = d.data().name; });
            while (clbSaleSelect.options.length > 1) clbSaleSelect.remove(1);
            creatorIds.forEach(cid => {
                if (usersMap[cid]) {
                    const opt = document.createElement('option');
                    opt.value = cid;
                    opt.textContent = usersMap[cid];
                    clbSaleSelect.appendChild(opt);
                }
            });
            clbSaleSelect.value = prevClbVal;
            const selectedId = clbSaleSelect.value;
            if (selectedId) {
                _saleClbData = _saleClbData.filter(a => a.creatorId === selectedId);
            }
        } else if (clbSaleWrap) {
            clbSaleWrap.style.display = 'none';
        }

        // Stats
        const now = new Date();
        const active = _saleClbData.filter(a => {
            if (a.isFrozen) return false;
            if (a.isExpired) return false;
            const exp = a.expiresAt?.toDate ? a.expiresAt.toDate() : null;
            if (exp && exp <= now) return false;
            return !!a.activatedAt; // phải đã kích hoạt
        }).length;
        const frozen = _saleClbData.filter(a => a.isFrozen).length;
        const expired = _saleClbData.filter(a => {
            if (a.isFrozen) return false;
            if (a.isExpired) return true;
            const exp = a.expiresAt?.toDate ? a.expiresAt.toDate() : null;
            return exp && exp <= now;
        }).length;
        const notActivated = _saleClbData.filter(a => !a.activatedAt && !a.isFrozen && !a.isExpired).length;

        statsBox.innerHTML = `
            <div style="text-align:center; padding:10px; background:rgba(59,130,246,0.08); border-radius:10px;">
                <div style="font-size:20px; font-weight:700; color:var(--primary);">${_saleClbData.length}</div>
                <div style="font-size:11px; color:var(--text-muted);">Tổng VĐV</div>
            </div>
            <div style="text-align:center; padding:10px; background:rgba(16,185,129,0.08); border-radius:10px;">
                <div style="font-size:20px; font-weight:700; color:#10b981;">${active}</div>
                <div style="font-size:11px; color:var(--text-muted);">Hoạt động</div>
            </div>
            <div style="text-align:center; padding:10px; background:rgba(245,158,11,0.08); border-radius:10px;">
                <div style="font-size:20px; font-weight:700; color:#f59e0b;">${frozen}</div>
                <div style="font-size:11px; color:var(--text-muted);">Bảo lưu</div>
            </div>
            <div style="text-align:center; padding:10px; background:rgba(239,68,68,0.08); border-radius:10px;">
                <div style="font-size:20px; font-weight:700; color:#ef4444;">${expired}</div>
                <div style="font-size:11px; color:var(--text-muted);">Hết hạn</div>
            </div>
            ${notActivated > 0 ? `<div style="text-align:center; padding:10px; background:rgba(107,114,128,0.08); border-radius:10px;">
                <div style="font-size:20px; font-weight:700; color:#6b7280;">${notActivated}</div>
                <div style="font-size:11px; color:var(--text-muted);">Chưa KH</div>
            </div>` : ''}`;

        renderSaleClbList();
    } catch (e) {
        if (listBox) listBox.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">Lỗi: ${e.message}</div>`;
    }
    }); // end onSnapshot
};

function renderSaleClbList() {
    const listBox = document.getElementById('sale-clb-list');
    if (!listBox) return;

    const searchVal = (document.getElementById('sale-clb-search')?.value || '').toLowerCase().trim();
    let filtered = _saleClbData;
    if (searchVal) {
        filtered = filtered.filter(a =>
            (a.name || '').toLowerCase().includes(searchVal) ||
            (a.phone || '').includes(searchVal) ||
            (a.contractNumber || '').toLowerCase().includes(searchVal)
        );
    }

    // Lọc theo trạng thái
    if (_saleClbFilterMode !== 'all') {
        const now = new Date();
        filtered = filtered.filter(a => {
            const expDate = a.expiresAt?.toDate ? a.expiresAt.toDate() : null;
            const isExpired = a.isExpired || (expDate && expDate <= now && !a.isFrozen);
            if (_saleClbFilterMode === 'active') return !a.isFrozen && !isExpired && !!a.activatedAt;
            if (_saleClbFilterMode === 'expired') return isExpired;
            if (_saleClbFilterMode === 'frozen') return a.isFrozen;
            return true;
        });
    }

    if (filtered.length === 0) {
        listBox.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">Không tìm thấy VĐV nào.</div>';
        return;
    }

    const now = new Date();
    let html = '';
    filtered.forEach(a => {
        const expDate = a.expiresAt?.toDate ? a.expiresAt.toDate() : null;
        const isFrozen = a.isFrozen;
        const isExpired = a.isExpired || (expDate && expDate <= now && !isFrozen);
        const notActive = !a.activatedAt && !isFrozen && !isExpired;
        
        let statusLabel, statusColor;
        if (isFrozen) { statusLabel = '❄️ Bảo lưu'; statusColor = '#f59e0b'; }
        else if (isExpired) { statusLabel = '⛔ Hết hạn'; statusColor = '#ef4444'; }
        else if (notActive) { statusLabel = '⏳ Chưa KH'; statusColor = '#6b7280'; }
        else { statusLabel = '✅ Hoạt động'; statusColor = '#10b981'; }

        const expStr = expDate ? expDate.toLocaleDateString('vi-VN') : 'N/A';
        const activatedDate = a.activatedAt?.toDate ? a.activatedAt.toDate() : null;
        const activatedStr = activatedDate ? activatedDate.toLocaleDateString('vi-VN') : 'Chưa KH';
        const pkg = `${a.sessionsPerWeek || 3} buổi/tuần × ${a.contractMonths || 3} tháng`;

        html += `<div style="padding:12px 14px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:10px; border-left:3px solid ${statusColor};">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="font-weight:600; font-size:14px; color:var(--text-color);">🏅 ${a.name || 'N/A'}</div>
                <span style="font-size:11px; padding:2px 8px; border-radius:12px; background:${statusColor}15; color:${statusColor}; font-weight:600;">${statusLabel}</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px 14px; font-size:12px; color:var(--text-muted);">
                ${a.phone ? `<span>📞 ${a.phone}</span>` : ''}
                ${a.contractNumber ? `<span>📋 ${a.contractNumber}</span>` : ''}
                <span>🏊 Lớp ${a.athleteClass || 'N/A'}</span>
                <span>📦 ${pkg}</span>
                <span>📅 KH: ${activatedStr}</span>
                <span>📅 HSD: ${expStr}</span>
            </div>
        </div>`;
    });
    listBox.innerHTML = html;
}

window.filterSaleClbList = function () {
    renderSaleClbList();
};

let _saleClbFilterMode = 'all';
window.setSaleClbFilter = function (mode) {
    _saleClbFilterMode = mode;
    document.querySelectorAll('.sale-clb-filter-btn').forEach(btn => {
        if (btn.dataset.filter === mode) {
            btn.style.background = 'var(--primary)'; btn.style.color = '#fff';
            btn.style.border = '1px solid var(--primary)';
        } else {
            btn.style.background = 'transparent'; btn.style.color = 'var(--text-muted)';
            btn.style.border = '1px solid var(--border-color)';
        }
    });
    renderSaleClbList();
};

function renderSaleStats() {
    const statsBox = document.getElementById('sale-personal-stats');
    const listBox = document.getElementById('sale-contracts-list');
    if (!statsBox || !listBox) return;
    if (currentUserRole !== 'SALE' && currentUserRole !== 'ADMIN' && currentUserRole !== 'MANAGER') {
        statsBox.innerHTML = '';
        listBox.innerHTML = '';
        return;
    }

    // Lọc học viên do Sale hiện tại tạo (cả Sale và Tự tuyển)
    const saleId = currentUserRole === 'SALE' ? currentUserId : null;
    let myStudentsRaw = saleId
        ? localState.students.filter(s => s.creatorId === saleId)
        : localState.students; // Admin/Manager thấy tất cả
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
        const creatorIds = [...new Set(localState.students.map(s => s.creatorId).filter(Boolean))];
        const usersMap = {};
        localState.teachers.forEach(t => { usersMap[t.id] = t.name; });
        localState.firedUsers?.forEach(u => { usersMap[u.id] = u.name; });
        db.collection('users').get().then(snap => {
            snap.docs.forEach(d => { usersMap[d.id] = d.data().name; });
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
        });
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
                <div style="margin-top: 6px; display: flex; justify-content: flex-end;">
                    <button class="btn btn-sm" onclick="editStudentInfo('${st.id}')" style="background: rgba(37,99,235,0.1); color: var(--primary); font-size: 11px; padding: 4px 10px; border: 1px solid rgba(37,99,235,0.25);">
                        <i class="fa-solid fa-pen-to-square"></i> Bổ sung TT
                    </button>
                </div>
            </div>
        `;
    });
    listBox.innerHTML = html;
}

// updateAllUI đã chuyển sang app-core.js


window.saleAssignStudent = async function (name, phone, gender, ageCategory, contractNumber, teacherId, curriculum, ptSessions, isException = false, age = 0, isTestStudent = false, isDiving = false) {
    if (!currentBranchId) return alert("Vui lòng chọn cơ sở gốc!");
    const tList = localState.teachers;
    const tObj = tList.find(x => x.id === teacherId);
    if (!tObj) return alert("Giáo viên không tồn tại trong DS!");

    try {
        // Kiểm tra trùng số hợp đồng (client-side filter to avoid composite index)
        if (contractNumber) {
            const allBranchStudents = await db.collection('students')
                .where('branchId', '==', currentBranchId)
                .get();
            const existingContract = allBranchStudents.docs.find(doc => doc.data().contractNumber === contractNumber);
            if (existingContract) {
                return alert(`Số hợp đồng "${contractNumber}" đã tồn tại trong hệ thống! Vui lòng kiểm tra lại.`);
            }
        }

        // Kiểm tra trùng họ tên / tuổi / SĐT - phát hiện gói nâng cấp
        let isUpgrade = false;
        let upgradeFromId = '';
        const trimmedName = name.trim().toLowerCase();
        const existingStudents = await db.collection('students')
            .where('branchId', '==', currentBranchId)
            .get();

        const duplicates = existingStudents.docs.filter(doc => {
            const d = doc.data();
            const existingName = (d.name || '').trim().toLowerCase();
            if (existingName === trimmedName) return true; // Trùng họ tên
            if (existingName === trimmedName && d.age && age && d.age === age) return true; // Trùng tên + tuổi
            if (phone && d.phone && d.phone === phone && phone.length >= 8) return true; // Trùng SĐT
            return false;
        });

        if (duplicates.length > 0) {
            const dupInfo = duplicates.map(doc => {
                const d = doc.data();
                return `  • "${d.name}" - ${d.curriculum || 'Bơi Ếch'} (HĐ: ${d.contractNumber || 'N/A'}, Buổi: ${d.sessions}/${d.totalSessions})`;
            }).join('\n');

            const upgradeConfirm = confirm(
                `⚡ Phát hiện HV có thể trùng!\n\nHọc viên mới: "${name}" (${curriculum})\n\nĐã có trong hệ thống:\n${dupInfo}\n\n👉 Đây có phải GÓI NÂNG CẤP không?\n\n[OK] = Đúng, gói nâng cấp → Lưu thông tin nâng cấp\n[Cancel] = Không phải, bỏ qua → Tiếp tục bình thường`
            );

            if (upgradeConfirm) {
                isUpgrade = true;
                upgradeFromId = duplicates[0].id;
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
        if (!isException) {
            // Xác nhận bình thường → Di chuyển currentIndex đến GV tiếp theo
            let _logFromIdx = 0, _logToIdx = 0, _logDebt = {};
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let fo = doc.data().fixedOrder || doc.data().turns || [];
                    let ci = doc.data().currentIndex || 0;
                    let dm = doc.data().debtMap || {};
                    _logFromIdx = ci;
                    if (fo.length > 0) {
                        const result = getNextActiveIndex(fo, ci, dm, localState.teachers);
                        _logToIdx = result.nextIndex;
                        _logDebt = result.updatedDebt;
                        transaction.update(qDoc, {
                            fixedOrder: fo,
                            currentIndex: result.nextIndex,
                            debtMap: result.updatedDebt
                        });
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
                debtSnapshot: _logDebt
            });
            alert('Đã gán Học viên thành công! Con trỏ đã chuyển sang Giáo viên tiếp theo.');
            console.log('✅ [HĐ] Queue updated + alert shown. Sending notifications...');
            sendNotification(teacherId, 'contract', `📝 ${currentUserDisplayName || 'Sale'} vừa gán học viên "${name}" cho bạn (HĐ: ${contractNumber || 'Chưa có'}, ${curriculum || 'Bơi Ẻch'}).`);
            try {
                const mgrSnap = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', currentBranchId).get();
                mgrSnap.forEach(doc => sendNotification(doc.id, 'contract', `📋 HĐ mới: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ẻch'})`));
            } catch (e) { console.error('Manager notify error:', e); }
            try {
                const adminSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
                adminSnap.forEach(doc => {
                    if (doc.id !== currentUserId) sendNotification(doc.id, 'contract', `📋 HĐ mới: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ẻch'}) - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`);
                });
            } catch (e) { console.error('Admin notify error:', e); }
        } else if (isDiving) {
            // LẶN → Không theo queue, không ghi nợ, chỉ gán thẳng
            alert(`🤿 Đã gán HV "${name}" cho GV Lặn "${tObj.name}" thành công!`);
            sendNotification(teacherId, 'contract', `🤿 ${currentUserDisplayName || 'Sale'} gán HV Lặn "${name}" cho bạn (${curriculum}).`);
            try {
                const mgrSnap3 = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', currentBranchId).get();
                mgrSnap3.forEach(doc => sendNotification(doc.id, 'contract', `🤿 HĐ Lặn: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (${curriculum})`));
            } catch (e) { console.error('Manager notify error:', e); }
            try {
                const adminSnap3 = await db.collection('users').where('role', '==', 'ADMIN').get();
                adminSnap3.forEach(doc => {
                    if (doc.id !== currentUserId) sendNotification(doc.id, 'contract', `🤿 HĐ Lặn: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (${curriculum}) - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`);
                });
            } catch (e) { console.error('Admin notify error:', e); }
        } else {
            // Ngoại Lệ → Thêm debt cho SLOT CỤ THỂ của GV được nhận ngoại lệ. currentIndex GIỮ NGUYÊN.
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let dm = doc.data().debtMap || {};
                    let fo = doc.data().fixedOrder || [];
                    let ci = doc.data().currentIndex || 0;
                    // Tìm slot INDEX gần nhất PHÍA TRƯỚC của GV này
                    let targetSlotIdx = -1;
                    for (let i = 0; i < fo.length; i++) {
                        const checkIdx = (ci + i) % fo.length;
                        if (fo[checkIdx] === teacherId) {
                            targetSlotIdx = checkIdx;
                            break;
                        }
                    }
                    if (targetSlotIdx === -1) targetSlotIdx = fo.indexOf(teacherId);
                    const slotKey = 's' + targetSlotIdx;
                    dm[slotKey] = (dm[slotKey] || 0) + 1;
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
                detail: `HĐ ngoại lệ "${contractNumber || 'N/A'}" cho GV "${tObj?.name}" | HV "${name}" (${curriculum || 'Bơi Ếch'}). GV bị ghi nợ 1 lượt.`
            });
            alert('Đã gán HĐ NGOẠI LỆ thành công! Giáo viên nhận HĐ đã bị ghi nợ 1 vòng. Giáo viên Top 1 giữ nguyên vị trí.');
            // Gửi thông báo cho GV
            sendNotification(teacherId, 'contract_exception', `✨ ${currentUserDisplayName || 'Sale'} gán HĐ ngoại lệ học viên "${name}" cho bạn (${curriculum || 'Bơi Ếch'}). Bạn đã bị ghi nợ 1 lượt.`);
            // Gửi thông báo cho Quản lý cơ sở và Admin
            try {
                const mgrSnap2 = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', currentBranchId).get();
                mgrSnap2.forEach(doc => sendNotification(doc.id, 'contract_exception', `📋 HĐ ngoại lệ: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (${curriculum || 'Bơi Ếch'})`));
            } catch (e) { console.error('Manager notify error:', e); }
            try {
                const adminSnap2 = await db.collection('users').where('role', '==', 'ADMIN').get();
                adminSnap2.forEach(doc => {
                    if (doc.id !== currentUserId) sendNotification(doc.id, 'contract_exception', `📋 HĐ ngoại lệ: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (${curriculum || 'Bơi Ếch'}) - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`);
                });
            } catch (e) { console.error('Admin notify error:', e); }
        }
    } catch (e) {
        console.error('❌ [HĐ] Lỗi phân bổ:', e);
        alert('Lỗi phân bổ: ' + e);
    }
}

// Xem chi tiết trạng thái Queue (Admin)
window.showQueueDebug = async function () {
    if (!currentBranchId) return alert('Chưa chọn cơ sở!');
    const brName = FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || currentBranchId;
    
    try {
        const qDoc = await db.collection('queues').doc(currentBranchId).get();
        if (!qDoc.exists) return alert('Không có dữ liệu queue!');
        const data = qDoc.data();
        const fo = data.fixedOrder || [];
        const ci = data.currentIndex || 0;
        const dm = data.debtMap || {};
        const slotNums = data.fixedSlotNumbers || {};
        const testMap = data.testingMap || {};

        let msg = `📊 TRẠNG THÁI HÀNG ĐỢI — ${brName}\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `Con trỏ (currentIndex): ${ci}\n`;
        msg += `Tổng slot: ${fo.length}\n\n`;
        msg += `THỨ TỰ GV (từ currentIndex):\n`;

        for (let i = 0; i < fo.length; i++) {
            const realIdx = (ci + i) % fo.length;
            const tid = fo[realIdx];
            const teacher = localState.teachers.find(t => t.id === tid);
            const name = teacher ? teacher.name : '(không tìm thấy)';
            const paused = teacher?.queuePaused ? ' ⏸️PAUSED' : '';
            const sk = 's' + realIdx;
            const debt = dm[sk] || 0;
            const debtStr = debt > 0 ? ` 🔴 Nợ ${debt} vòng` : '';
            const isTest = testMap[tid] ? ' 🧪 Test' : '';
            const marker = i === 0 ? ' ← TOP 1' : '';
            const sn = slotNums[realIdx] || (realIdx + 1);
            msg += `  ${i + 1}. #${sn} ${name}${paused}${debtStr}${isTest}${marker}\n`;
        }

        // Lịch sử phạt 7 ngày gần đây
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const penSnap = await db.collection('penalties')
            .where('branchId', '==', currentBranchId)
            .get();
        const recentPenalties = penSnap.docs
            .map(d => d.data())
            .filter(p => {
                const ts = p.createdAt?.toDate?.();
                return ts && ts >= weekAgo;
            })
            .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0));

        if (recentPenalties.length > 0) {
            msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `📋 PHẠT MẤT LƯỢT (7 ngày gần):\n`;
            recentPenalties.forEach(p => {
                const time = p.createdAt?.toDate?.()?.toLocaleString('vi-VN') || '—';
                msg += `  • ${p.teacherName || '?'} — bởi ${p.saleName || '?'} — "${p.reason || '?'}" (${time})\n`;
            });
        }

        // debtMap chi tiết
        const debtKeys = Object.keys(dm).filter(k => dm[k] > 0);
        if (debtKeys.length > 0) {
            msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `🔴 CHI TIẾT NỢ (debtMap):\n`;
            debtKeys.forEach(k => {
                const slotIdx = parseInt(k.replace('s', ''));
                const tid = fo[slotIdx];
                const teacher = localState.teachers.find(t => t.id === tid);
                msg += `  • Slot ${slotIdx} (${teacher?.name || '?'}): nợ ${dm[k]} vòng\n`;
            });
        }

        alert(msg);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Xem lịch sử chuyển turn (Admin/Manager)
window.showQueueHistory = async function () {
    if (!currentBranchId) return alert('Chưa chọn cơ sở!');
    const brName = FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || currentBranchId;

    try {
        const maxShow = Math.max((localState.fixedOrder?.length || 10) * 2 + 10, 30);
        const snap = await db.collection('queue_logs')
            .where('branchId', '==', currentBranchId)
            .orderBy('createdAt', 'desc')
            .limit(maxShow)
            .get();

        if (snap.empty) {
            alert('Chưa có lịch sử chuyển turn nào cho cơ sở này.\n\n(Lịch sử sẽ được ghi từ bây giờ trở đi)');
            return;
        }

        // Render modal overlay
        const actionLabel = {
            'contract': '📝 Gán HĐ',
            'contract_exception': '✨ HĐ Ngoại lệ',
            'penalty': '⚠️ Phạt lượt',
            'cut_turn': '✂️ Cắt lượt',
            'rewind': '⬆️ Đẩy lên Top',
            'push_teacher': '➕ Thêm GV',
            'change_type': '🔄 Đổi loại GV'
        };
        const actionColor = {
            'contract': '#3b82f6',
            'contract_exception': '#f59e0b',
            'penalty': '#ef4444',
            'cut_turn': '#8b5cf6',
            'rewind': '#10b981',
            'push_teacher': '#06b6d4',
            'change_type': '#ec4899'
        };

        let rows = '';
        snap.docs.forEach((doc, i) => {
            const d = doc.data();
            const time = d.createdAt?.toDate?.()?.toLocaleString('vi-VN') || '—';
            const label = actionLabel[d.action] || d.action;
            const color = actionColor[d.action] || '#888';
            const fromTo = (d.fromIndex !== null && d.toIndex !== null) ? `Index: ${d.fromIndex} → ${d.toIndex}` : '';
            rows += `
                <tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:10px 12px; font-size:12px; color:var(--text-muted); white-space:nowrap;">${time}</td>
                    <td style="padding:10px 12px;">
                        <span style="display:inline-block; padding:3px 10px; border-radius:6px; font-size:11px; font-weight:600; background:${color}18; color:${color}; border:1px solid ${color}40;">${label}</span>
                    </td>
                    <td style="padding:10px 12px; font-size:13px; color:var(--text-color);">${d.detail || '—'}</td>
                    <td style="padding:10px 12px; font-size:12px; color:var(--text-muted);">${fromTo}</td>
                    <td style="padding:10px 12px; font-size:12px; color:var(--text-muted);">${d.performedByName || '—'}</td>
                </tr>`;
        });

        // Tạo modal
        let modal = document.getElementById('queue-history-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'queue-history-modal';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `
            <div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;" onclick="if(event.target===this) this.remove();">
                <div style="background:var(--card-bg); border-radius:16px; max-width:900px; width:100%; max-height:85vh; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.4); display:flex; flex-direction:column;">
                    <div style="padding:16px 20px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h3 style="margin:0; font-size:16px; color:var(--text-color);">📋 Lịch sử Turn — ${brName}</h3>
                            <p style="margin:4px 0 0; font-size:12px; color:var(--text-muted);">${snap.size} bản ghi gần nhất</p>
                        </div>
                        <button onclick="document.getElementById('queue-history-modal').remove()" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-muted); padding:4px 8px;">✕</button>
                    </div>
                    <div style="overflow-y:auto; flex:1;">
                        <table style="width:100%; border-collapse:collapse; min-width:700px;">
                            <thead>
                                <tr style="background:var(--bg-color); position:sticky; top:0;">
                                    <th style="padding:10px 12px; text-align:left; font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Thời gian</th>
                                    <th style="padding:10px 12px; text-align:left; font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Loại</th>
                                    <th style="padding:10px 12px; text-align:left; font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Chi tiết</th>
                                    <th style="padding:10px 12px; text-align:left; font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Index</th>
                                    <th style="padding:10px 12px; text-align:left; font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Người thực hiện</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    } catch (e) {
        // Có thể cần composite index
        if (e.message?.includes('index')) {
            alert('⚠️ Cần tạo Firestore Index cho queue_logs.\\n\\nVui lòng mở Console Firebase → Firestore → Indexes → Tạo index:\\nCollection: queue_logs\\nFields: branchId ASC, createdAt DESC');
        } else {
            alert('Lỗi: ' + e.message);
        }
    }
};

// Admin: Đẩy GV cuối hàng lên Top 1 (hoàn tác cắt lượt nhầm)
window.rewindQueueToLast = async function () {
    if (!currentBranchId) return;
    const fo = localState.fixedOrder || [];
    const ci = localState.currentIndex || 0;
    if (fo.length === 0) return;

    // Tìm GV cuối hàng (active, không paused) — đi ngược từ ci
    let lastActiveIdx = -1;
    for (let i = fo.length - 1; i >= 1; i--) {
        const realIdx = (ci + i) % fo.length;
        const tid = fo[realIdx];
        const teacher = localState.teachers.find(t => t.id === tid);
        if (teacher && !teacher.queuePaused) {
            lastActiveIdx = realIdx;
            break;
        }
    }
    if (lastActiveIdx === -1) return alert('Không tìm được GV cuối hàng!');

    const lastTeacher = localState.teachers.find(t => t.id === fo[lastActiveIdx]);
    if (!confirm(`⬆️ Đẩy "${lastTeacher?.name || 'GV'}" lên Top 1?\n\nGV này sẽ được nhận HĐ tiếp theo.`)) return;

    try {
        await db.collection('queues').doc(currentBranchId).update({
            currentIndex: lastActiveIdx
        });
        logQueueAction({
            action: 'rewind',
            fromIndex: ci,
            toIndex: lastActiveIdx,
            teacherId: fo[lastActiveIdx],
            teacherName: lastTeacher?.name || '',
            detail: `Đẩy GV "${lastTeacher?.name}" lên Top 1 (hoàn tác)`
        });
        alert(`✅ Đã đẩy "${lastTeacher?.name}" lên Top 1!`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Cắt lượt (Admin): Di chuyển currentIndex đến GV tiếp theo
window.cutQueueTurn = async function (unused, skipConfirm = false) {
    if (!currentBranchId) return;
    if (!skipConfirm && !confirm('Bạn muốn cắt lượt GV hiện tại và chuyển sang GV tiếp theo?')) return;

    const qDoc = db.collection('queues').doc(currentBranchId);
    let _cutFrom = 0, _cutTo = 0, _cutTeacherId = '', _cutTeacherName = '';
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(qDoc);
            if (doc.exists) {
                let fo = doc.data().fixedOrder || [];
                let ci = doc.data().currentIndex || 0;
                let dm = doc.data().debtMap || {};
                _cutFrom = ci;
                _cutTeacherId = fo[ci] || '';
                const teacher = localState.teachers.find(t => t.id === _cutTeacherId);
                _cutTeacherName = teacher?.name || '';
                if (fo.length > 0) {
                    const result = getNextActiveIndex(fo, ci, dm, localState.teachers);
                    _cutTo = result.nextIndex;
                    transaction.update(qDoc, {
                        fixedOrder: fo,
                        currentIndex: result.nextIndex,
                        debtMap: result.updatedDebt
                    });
                }
            }
        });
        // Log cắt lượt (chỉ khi KHÔNG phải penalty gọi — penalty tự log riêng)
        if (!skipConfirm) {
            logQueueAction({
                action: 'cut_turn',
                fromIndex: _cutFrom,
                toIndex: _cutTo,
                teacherId: _cutTeacherId,
                teacherName: _cutTeacherName,
                detail: `Admin cắt lượt GV "${_cutTeacherName}"`
            });
        }
    } catch (e) { console.error(e); }
};

// Phạt Mất Lượt
window.saleSkipTurn = async function () {
    if (!currentBranchId) return alert('Chưa chọn Cơ sở!');
    if (localState.fixedOrder.length === 0) return alert('Hàng chờ trống!');
    const reason = prompt('PHẠT MẤT LƯỢT: Nhập lý do (tối đa 20 ký tự):');
    if (reason === null) return; // Cancelled
    const trimmedReason = (reason || 'Không rõ').substring(0, 20);

    // Lấy thông tin GV bị phạt TRƯỚC khi cắt queue
    const ci = localState.currentIndex || 0;
    const penalizedTeacherId = localState.fixedOrder[ci];
    const penalizedTeacher = localState.teachers.find(t => t.id === penalizedTeacherId);
    const penalizedTeacherName = penalizedTeacher ? penalizedTeacher.name : 'Không rõ';

    try {
        await cutQueueTurn(0, true);

        // Gửi thông báo cho GV bị phạt
        if (penalizedTeacherId) {
            sendNotification(penalizedTeacherId, 'penalty', `⚠️ ${currentUserDisplayName || 'Sale'} đã PHẠT MẤT LƯỢT của bạn! Lý do: "${trimmedReason}". Bạn đã bị đẩy xuống cuối hàng đợi.`);
        }

        // Lưu log phạt vào Firestore
        await db.collection('penalties').add({
            teacherId: penalizedTeacherId,
            teacherName: penalizedTeacherName,
            saleId: currentUserId,
            saleName: currentUserDisplayName || 'Sale',
            reason: trimmedReason,
            branchId: currentBranchId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Ghi log phạt mất lượt
        logQueueAction({
            action: 'penalty',
            fromIndex: ci,
            teacherId: penalizedTeacherId,
            teacherName: penalizedTeacherName,
            detail: `Phạt mất lượt GV "${penalizedTeacherName}". Lý do: "${trimmedReason}"`
        });

        alert('Phạt mất lượt thành công! Con trỏ đã chuyển sang GV tiếp theo.');
    } catch (e) {
        console.error('saleSkipTurn error:', e);
        alert('Lỗi: ' + e.message);
    }
};

// Kích Test - giao test cho GV đầu hàng chưa bận test
window.saleTestKick = async function () {
    if (!currentBranchId) return alert('Chưa chọn Cơ sở!');
    if (localState.fixedOrder.length === 0) return alert('Hàng chờ trống!');

    const now = Date.now();

    // Tìm GV đầu tiên theo thứ tự từ currentIndex KHÔNG bị pause VÀ KHÔNG đang test
    const ci = localState.currentIndex || 0;
    let availableForTest = null;
    for (let i = 0; i < localState.fixedOrder.length; i++) {
        const idx = (ci + i) % localState.fixedOrder.length;
        const id = localState.fixedOrder[idx];
        const t = localState.teachers.find(tt => tt.id === id);
        if (!t || t.queuePaused) continue;
        const ts = localState.testingMap[id];
        if (!ts) { availableForTest = id; break; }
        const startMs = ts.toDate ? ts.toDate().getTime() : ts;
        if ((now - startMs) >= 15 * 60 * 1000) { availableForTest = id; break; }
    }

    if (!availableForTest) {
        alert('Tất cả giáo viên trong hàng đợi đều đang bận test!');
        return;
    }

    const teacher = localState.teachers.find(t => t.id === availableForTest);
    if (!confirm(`🧪 Giao test cho: ${teacher.name}?\n\nGV sẽ bận test 15 phút, không mất lượt.`)) return;

    try {
        // Lưu timestamp bắt đầu test
        await db.collection('queues').doc(currentBranchId).update({
            [`testingMap.${availableForTest}`]: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Gửi thông báo cho GV
        await db.collection('notifications').add({
            toUserId: availableForTest,
            type: 'test_kick',
            message: `🧪 Bạn được giao TEST khách tại ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || 'cơ sở'}. Bận 15 phút, không mất lượt.`,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert(`✅ Đã giao test cho ${teacher.name}! (15 phút)`);
    } catch (e) {
        console.error('saleTestKick error:', e);
        alert('Lỗi: ' + e.message);
    }
};

// Hoàn tất test sớm - xoá đánh dấu "đang test"
window.finishTest = async function (teacherId) {
    if (!confirm('Xác nhận GV đã hoàn tất test sớm?')) return;
    try {
        await db.collection('queues').doc(currentBranchId).update({
            [`testingMap.${teacherId}`]: firebase.firestore.FieldValue.delete()
        });
        alert('✅ Đã hoàn tất test!');
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

// Auto-refresh hàng đợi mỗi 5s để cập nhật đếm ngược test
setInterval(() => {
    if (localState.queueLoaded && Object.keys(localState.testingMap).length > 0) {
        renderDashboard();
    }
}, 5000);


window.saleConfirmStudent = async function (studentId, studentName) {
    if (!confirm(`✅ Xác nhận HĐ cho "${studentName}"?\n\nSau khi xác nhận, HV sẽ được chuyển về bảng Kế Toán.`)) return;
    try {
        const stuDoc = await db.collection('students').doc(studentId).get();
        const s = stuDoc.exists ? stuDoc.data() : {};

        await db.collection('students').doc(studentId).update({
            saleConfirmed: true,
            saleConfirmedBy: currentUserDisplayName || 'Sale',
            saleConfirmedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Lấy tên GV: thử nhiều field name + fallback lookup user doc
        let teacherName = s.teacherName || s.assignedTeacherName || '';
        if (!teacherName && s.assignedTeacherId) {
            try {
                const tDoc = await db.collection('users').doc(s.assignedTeacherId).get();
                if (tDoc.exists) teacherName = tDoc.data().name || '';
            } catch (e) { /* skip */ }
        }

        // Tạo salary_submissions → về Kế Toán
        await db.collection('salary_submissions').add({
            teacherId: s.assignedTeacherId || '',
            teacherName: teacherName,
            branchId: s.branchId || currentBranchId,
            month: s.salarySubmittedMonth || '',
            students: [{
                studentId: studentId,
                name: s.name || studentName,
                phone: s.phone || '',
                contractNumber: s.contractNumber || '',
                curriculum: s.curriculum || 'Bơi Ếch',
                ageCategory: s.ageCategory || 'Trẻ em',
                sessions: s.sessions || 0,
                totalSessions: s.totalSessions || 10,
                creatorName: s.creatorName || '',
                saleConfirmedBy: currentUserDisplayName || 'Sale'
            }],
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            saleConfirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'confirmed'
        });

        alert(`✅ Đã xác nhận "${studentName}"!\nHV đã chuyển về bảng Kế Toán.`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Sale xem danh sách HV chờ xác nhận chốt lương (chỉ HV mà GV đã bấm chốt)
window.showPendingSaleConfirm = async function () {
    try {
        // Query HV cơ sở hiện tại, đã được GV chốt lương (có salarySubmittedMonth), chưa saleConfirmed
        const snap = await db.collection('students')
            .where('branchId', '==', currentBranchId)
            .get();

        const usersSnap = await db.collection('users').get();
        const usersMap = {};
        usersSnap.docs.forEach(d => { usersMap[d.id] = d.data(); });

        const pending = [];
        snap.docs.forEach(doc => {
            const s = doc.data();
            // Chỉ hiện HV đã được GV chốt lương + chưa Sale xác nhận
            // Sale chỉ thấy HV mình nhập, Admin/Manager thấy tất cả
            if (s.salarySubmittedMonth && !s.saleConfirmed) {
                if (currentUserRole === 'SALE' && s.creatorId && s.creatorId !== currentUserId) return;
                const teacherName = usersMap[s.assignedTeacherId]?.name || 'Chưa gán';
                pending.push({
                    id: doc.id,
                    name: s.name,
                    phone: s.phone || '',
                    sessions: s.sessions || 0,
                    total: s.totalSessions || 10,
                    teacherName,
                    teacherId: s.assignedTeacherId || '',
                    salaryMonth: s.salarySubmittedMonth
                });
            }
        });

        if (pending.length === 0) {
            alert('✅ Không có HV nào chờ xác nhận!\n\nChưa có GV nào gửi chốt lương.');
            return;
        }

        let overlay = document.getElementById('sale-confirm-overlay');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'sale-confirm-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;';

        let listHtml = '';
        pending.forEach(p => {
            const eName = p.name.replace(/'/g, "\\'");
            listHtml += `
                <div id="sale-pend-${p.id}" style="display:flex; align-items:center; gap:8px; padding:12px; background:var(--bg-color); border-radius:10px; margin-bottom:8px; border:1px solid var(--border-color);">
                    <div style="flex:1;">
                        <div style="font-weight:600; color:var(--text-color);">${p.name}</div>
                        <div style="font-size:11px; color:var(--text-muted);">GV: ${p.teacherName} · ${p.sessions}/${p.total} buổi · ${p.salaryMonth}</div>
                    </div>
                    <div style="display:flex; gap:6px; flex-shrink:0;">
                        <button onclick="saleConfirmStudent('${p.id}', '${eName}'); document.getElementById('sale-pend-${p.id}').style.opacity='0.3';" style="padding:5px 10px; border-radius:6px; border:none; background:#10b981; color:#fff; font-weight:600; cursor:pointer; font-size:11px;">✅ XN</button>
                        <button onclick="saleRejectStudent('${p.id}', '${eName}', '${p.teacherId}'); document.getElementById('sale-pend-${p.id}').style.opacity='0.3';" style="padding:5px 10px; border-radius:6px; border:none; background:#ef4444; color:#fff; font-weight:600; cursor:pointer; font-size:11px;">❌ Từ chối</button>
                    </div>
                </div>`;
        });

        overlay.innerHTML = `
            <div style="background:var(--card-bg); border-radius:16px; padding:20px; max-width:450px; width:100%; max-height:80vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 style="margin:0; font-size:16px; color:var(--text-color);">📋 HV chờ xác nhận (${pending.length})</h3>
                    <button onclick="document.getElementById('sale-confirm-overlay').remove()" style="border:none; background:none; font-size:20px; cursor:pointer; color:var(--text-muted);">✕</button>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">HV đã được GV gửi chốt lương, chờ Sale xác nhận hoặc từ chối</div>
                ${listHtml}
            </div>`;

        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    } catch (e) {
        alert('❌ Lỗi: ' + e.message);
    }
};

// Sale: Từ chối chốt lương → trả HV lại, thông báo GV
window.saleRejectStudent = async function (studentId, studentName, teacherId) {
    if (!confirm(`❌ Từ chối xác nhận "${studentName}"?\n\nHV sẽ quay lại cho GV, GV sẽ nhận thông báo.`)) return;
    try {
        // Xóa salarySubmittedMonth để GV có thể chốt lại
        await db.collection('students').doc(studentId).update({
            salarySubmittedMonth: firebase.firestore.FieldValue.delete(),
            salarySubmittedAt: firebase.firestore.FieldValue.delete(),
            saleRejected: true,
            saleRejectedBy: currentUserDisplayName || 'Sale',
            saleRejectedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Xóa khỏi salary_submissions
        const subSnap = await db.collection('salary_submissions')
            .where('teacherId', '==', teacherId)
            .get();
        const batch = db.batch();
        subSnap.docs.forEach(d => {
            const students = d.data().students || [];
            const updated = students.filter(s => s.studentId !== studentId);
            if (updated.length !== students.length) {
                batch.update(d.ref, { students: updated });
            }
        });
        await batch.commit();

        // Gửi thông báo cho GV
        if (teacherId) {
            await db.collection('notifications').add({
                toUserId: teacherId,
                message: `❌ Sale đã từ chối xác nhận HV "${studentName}". Vui lòng kiểm tra lại.`,
                type: 'system',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                read: false
            });
        }

        alert(`✅ Đã từ chối "${studentName}". GV sẽ nhận thông báo.`);
    } catch (e) {
        alert('❌ Lỗi: ' + e.message);
    }
};

// GV xem danh sách HV điểm danh hôm nay
