// ===================== MODULE: KHÁCH HÀNG (customer.js) ===================== //
// Depends on: db, currentUserId, currentUserRole, FIXED_BRANCHES, sendNotification, isDivingCurriculum
// from app.js (loaded first)

window.populateKhachhangBranches = function populateKhachhangBranches() {
    const sel = document.getElementById('khachhang-branch');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Chọn cơ sở --</option>';
    FIXED_BRANCHES.forEach(b => {
        sel.innerHTML += `<option value="${b.id}">${b.name}</option>`;
    });
};

// ===================== KHÁCH HÀNG - DASHBOARD HĐ LIÊN KẾT ===================== //
// Load và hiển thị các HĐ CLB đã liên kết
window.loadLinkedContracts = async function loadLinkedContracts() {
    const container = document.getElementById('kh-linked-cards');
    if (!container || !currentUserId) return;

    try {
        const userDoc = await db.collection('users').doc(currentUserId).get();
        const userData = userDoc.data();
        const linked = userData?.linkedContracts || [];

        if (linked.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:30px; color:var(--text-muted);">
                    <i class="fa-solid fa-link-slash" style="font-size:28px; display:block; margin-bottom:10px;"></i>
                    Chưa liên kết hợp đồng nào.<br>
                    <button onclick="addLinkedContract()" style="margin-top:12px; padding:10px 20px; border-radius:10px; border:1px solid rgba(16,185,129,0.3); background:rgba(16,185,129,0.1); color:#10b981; font-size:14px; font-weight:600; cursor:pointer;">
                        <i class="fa-solid fa-plus"></i> Thêm Hợp Đồng
                    </button>
                </div>`;
            return;
        }

        let html = '';
        for (const lc of linked) {
            try {
                const aDoc = await db.collection('athletes').doc(lc.athleteId).get();
                if (!aDoc.exists) {
                    html += `<div style="padding:16px; border:1px solid rgba(239,68,68,0.3); border-radius:12px; background:rgba(239,68,68,0.05);">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div><i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i> HĐ "${lc.contractNumber}" — Không tìm thấy VĐV</div>
                            <button onclick="removeLinkedContract('${lc.athleteId}')" style="border:none; background:none; color:#ef4444; cursor:pointer; font-size:13px;"><i class="fa-solid fa-trash"></i> Xoá</button>
                        </div>
                    </div>`;
                    continue;
                }
                const a = aDoc.data();
                const branch = FIXED_BRANCHES.find(b => b.id === a.branchId);
                const branchName = branch?.name || 'N/A';
                const expDate = a.expiresAt?.toDate ? a.expiresAt.toDate() : (a.expiresAt ? new Date(a.expiresAt) : null);
                const activDate = a.activatedAt?.toDate ? a.activatedAt.toDate() : (a.activatedAt ? new Date(a.activatedAt) : null);
                const _expEnd = expDate ? new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate(), 23, 59, 59) : null;
                const isExpired = a.isExpired || (_expEnd && new Date() > _expEnd);
                const isFrozen = a.isFrozen;

                // Status badge
                let statusBadge = '';
                if (isExpired) statusBadge = '<span style="padding:3px 10px; border-radius:6px; font-size:11px; font-weight:600; background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">Hết hạn</span>';
                else if (isFrozen) statusBadge = '<span style="padding:3px 10px; border-radius:6px; font-size:11px; font-weight:600; background:rgba(139,92,246,0.1); color:#8b5cf6; border:1px solid rgba(139,92,246,0.3);">Bảo lưu</span>';
                else statusBadge = '<span style="padding:3px 10px; border-radius:6px; font-size:11px; font-weight:600; background:rgba(16,185,129,0.1); color:#10b981; border:1px solid rgba(16,185,129,0.3);">Đang học</span>';

                // Attendance info
                const totalAtt = a.totalAttendance || 0;
                const perWeek = a.sessionsPerWeek || 3;
                const months = a.contractMonths || 3;

                html += `
                <div style="padding:16px 18px; border:1px solid var(--border-color); border-radius:14px; background:var(--card-bg);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                        <div>
                            <div style="font-size:17px; font-weight:700; color:var(--text-color); margin-bottom:4px;">
                                <i class="fa-solid fa-medal" style="color:#f59e0b;"></i> ${a.name || 'N/A'}
                            </div>
                            <div style="font-size:12px; color:var(--text-muted);">
                                HĐ: <strong>${a.contractNumber || 'N/A'}</strong> • Lớp: <strong>${a.classLevel || 'N/A'}</strong> • ${branchName}
                            </div>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            ${statusBadge}
                            <button onclick="removeLinkedContract('${lc.athleteId}')" title="Xoá liên kết" style="border:none; background:none; color:var(--text-muted); cursor:pointer; font-size:14px; padding:4px;"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:10px; margin-bottom:12px;">
                        <div style="padding:10px; border-radius:10px; background:rgba(59,130,246,0.08); text-align:center;">
                            <div style="font-size:22px; font-weight:700; color:#3b82f6;">${totalAtt}</div>
                            <div style="font-size:11px; color:var(--text-muted);">Buổi đã học</div>
                        </div>
                        <div style="padding:10px; border-radius:10px; background:rgba(245,158,11,0.08); text-align:center;">
                            <div style="font-size:22px; font-weight:700; color:#f59e0b;">${perWeek}</div>
                            <div style="font-size:11px; color:var(--text-muted);">Buổi/tuần</div>
                        </div>
                        <div style="padding:10px; border-radius:10px; background:rgba(16,185,129,0.08); text-align:center;">
                            <div style="font-size:22px; font-weight:700; color:#10b981;">${months}</div>
                            <div style="font-size:11px; color:var(--text-muted);">Tháng HĐ</div>
                        </div>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted); display:flex; flex-wrap:wrap; gap:12px;">
                        <span><i class="fa-solid fa-calendar-check"></i> Kích hoạt: ${activDate ? activDate.toLocaleDateString('vi-VN') : 'Chưa KH'}</span>
                        <span><i class="fa-solid fa-calendar-xmark"></i> Hết hạn: ${expDate ? expDate.toLocaleDateString('vi-VN') : 'N/A'}</span>
                        <span><i class="fa-solid fa-phone"></i> SĐT: ${a.phone || 'N/A'}</span>
                    </div>
                </div>`;
            } catch (e) {
                html += `<div style="padding:12px; color:#ef4444; font-size:13px;">Lỗi tải HĐ ${lc.contractNumber}: ${e.message}</div>`;
            }
        }
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">Lỗi: ${e.message}</div>`;
    }
}

// Thêm HĐ mới
window.addLinkedContract = async function () {
    if (!currentUserId) return;
    const userDoc = await db.collection('users').doc(currentUserId).get();
    const userData = userDoc.data();
    const linked = userData?.linkedContracts || [];

    if (linked.length >= 3) {
        alert('⚠️ Tối đa 3 hợp đồng! Vui lòng xoá bớt HĐ cũ trước.');
        return;
    }

    const contractNum = prompt('📝 Nhập số hợp đồng CLB cần thêm:');
    if (!contractNum || !contractNum.trim()) return;
    const cn = contractNum.trim();

    // Check đã liên kết chưa
    if (linked.some(l => l.contractNumber === cn)) {
        alert('⚠️ Hợp đồng này đã được liên kết!');
        return;
    }

    try {
        const snap = await db.collection('athletes').where('contractNumber', '==', cn).get();
        if (snap.empty) {
            alert(`❌ Không tìm thấy hợp đồng "${cn}" trong hệ thống!\n\nVui lòng kiểm tra lại số HĐ.`);
            return;
        }
        const aDoc = snap.docs[0];
        const aData = aDoc.data();

        if (!confirm(`Liên kết hợp đồng:\n\nHĐ: ${cn}\nVĐV: ${aData.name || 'N/A'}\nLớp: ${aData.classLevel || 'N/A'}\n\nXác nhận?`)) return;

        const newLinked = [...linked, {
            athleteId: aDoc.id,
            contractNumber: cn,
            athleteName: aData.name || '',
            linkedAt: new Date().toISOString()
        }];
        const newIds = [...(userData?.linkedAthleteIds || []), aDoc.id];

        await db.collection('users').doc(currentUserId).update({
            linkedContracts: newLinked,
            linkedAthleteIds: newIds
        });
        alert(`✅ Đã liên kết HĐ "${cn}" — VĐV: ${aData.name}`);
        loadLinkedContracts();
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Xoá liên kết HĐ
window.removeLinkedContract = async function (athleteId) {
    if (!currentUserId) return;
    if (!confirm('Xoá liên kết hợp đồng này?\n\n(Bạn có thể thêm lại sau)')) return;

    try {
        const userDoc = await db.collection('users').doc(currentUserId).get();
        const userData = userDoc.data();
        const newLinked = (userData?.linkedContracts || []).filter(l => l.athleteId !== athleteId);
        const newIds = (userData?.linkedAthleteIds || []).filter(id => id !== athleteId);

        await db.collection('users').doc(currentUserId).update({
            linkedContracts: newLinked,
            linkedAthleteIds: newIds
        });
        alert('✅ Đã xoá liên kết!');
        loadLinkedContracts();
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};
let _khSearchTimeout = null;
// Khách hàng gửi nhận xét
window.submitCustomerReview = async function (studentId, studentName) {
    const textarea = document.getElementById('review-' + studentId);
    if (!textarea) return;
    const review = textarea.value.trim();
    if (!review) { alert('Vui lòng nhập nhận xét!'); return; }
    if (review.length > 200) { alert('Nhận xét tối đa 200 ký tự!'); return; }
    if (!confirm(`Gửi nhận xét cho "${studentName}"?\n\n"${review}"\n\nNhận xét này sẽ được gửi đến Giáo viên và Sale.`)) return;

    try {
        // Lưu nhận xét vào student
        await db.collection('students').doc(studentId).update({
            customerReview: review,
            reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Lấy thông tin HV để gửi thông báo
        const stDoc = await db.collection('students').doc(studentId).get();
        const stData = stDoc.data();

        // Gửi thông báo cho GV
        if (stData.assignedTeacherId) {
            sendNotification(stData.assignedTeacherId, 'system', `⭐ Khách hàng "${studentName}" nhận xét: "${review}"`);
        }
        // Gửi thông báo cho Sale (creatorId)
        if (stData.creatorId && stData.creatorId !== stData.assignedTeacherId) {
            sendNotification(stData.creatorId, 'system', `⭐ Khách hàng "${studentName}" nhận xét: "${review}"`);
        }
        // Gửi thông báo cho Admin
        const adminSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
        adminSnap.docs.forEach(doc => {
            if (doc.id !== stData.assignedTeacherId && doc.id !== stData.creatorId) {
                sendNotification(doc.id, 'system', `⭐ Khách hàng "${studentName}" nhận xét: "${review}"`);
            }
        });

        alert('✅ Gửi nhận xét thành công! Cảm ơn bạn đã đánh giá.');
        // Reload lại kết quả
        const searchInput = document.getElementById('customer-search');
        if (searchInput) searchStudentProgress(searchInput.value);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

window.searchStudentProgress = function (query) {
    const container = document.getElementById('khachhang-results');
    if (!container) return;

    // Toggle nút xoá
    const clearBtn = document.getElementById('khachhang-search-clear');
    if (clearBtn) clearBtn.style.display = query && query.trim().length > 0 ? 'block' : 'none';

    if (!query || query.trim().length < 2) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">
            <i class="fa-solid fa-search" style="font-size: 28px; display: block; margin-bottom: 10px;"></i>
            ${currentUserRole === 'KHACHHANG' ? 'Nhập số hợp đồng hoặc số điện thoại để tra cứu' : 'Nhập tên hoặc số hợp đồng để tra cứu'}
        </div>`;
        return;
    }

    // KHACHHANG: yêu cầu nhập tối thiểu 4 ký tự
    if (currentUserRole === 'KHACHHANG' && query.trim().length < 4) {
        container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">
            <i class="fa-solid fa-keyboard" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
            Vui lòng nhập đầy đủ số hợp đồng
        </div>`;
        return;
    }

    clearTimeout(_khSearchTimeout);
    _khSearchTimeout = setTimeout(async () => {
        container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 20px;"></i> Đang tìm...
        </div>`;

        try {
            // Lấy branch đã chọn
            const selectedBranch = document.getElementById('khachhang-branch')?.value;
            if (!selectedBranch) {
                container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">
                    <i class="fa-solid fa-building" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
                    Vui lòng chọn cơ sở trước khi tìm kiếm
                </div>`;
                return;
            }

            const partSnap = await db.collection('students').where('branchId', '==', selectedBranch).get();
            // Tìm thêm VĐV CLB
            const clbSnap = await db.collection('athletes').where('branchId', '==', selectedBranch).get();

            const q = query.trim().toLowerCase().replace(/\s+/g, '');

            // KHÁCH HÀNG + TẤT CẢ: chỉ khớp chính xác SĐT, Số HĐ, hoặc Họ tên đầy đủ
            const filterFn = (s) => {
                const contract = (s.contractNumber || '').toLowerCase().replace(/\s+/g, '');
                const phone = (s.phone || '').replace(/\s+/g, '');
                const name = (s.name || '').toLowerCase().replace(/\s+/g, '');
                // Khớp chính xác: Số HĐ hoặc SĐT hoặc Họ tên
                return contract === q || phone === q || name === q;
            };

            const studentResults = partSnap.docs
                .map(d => ({ id: d.id, ...d.data(), _type: 'student' }))
                .filter(filterFn);

            const clbResults = clbSnap.docs
                .map(d => ({ id: d.id, ...d.data(), _type: 'clb' }))
                .filter(filterFn);

            const results = [...studentResults, ...clbResults];

            if (results.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">
                    <i class="fa-solid fa-user-slash" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
                    Không tìm thấy "${query}"
                </div>`;
                return;
            }

            const teacherIds = [...new Set(results.map(s => s.assignedTeacherId).filter(Boolean))];
            const teacherMap = {};
            for (const tid of teacherIds) {
                try {
                    const tDoc = await db.collection('users').doc(tid).get();
                    if (tDoc.exists) teacherMap[tid] = tDoc.data().name;
                } catch (e) { /* skip */ }
            }

            // Lấy lịch sử điểm danh cho tất cả HV tìm thấy
            const studentIds = results.map(s => s.id);
            const attendanceMap = {};
            try {
                const attSnap = await db.collection('attendance')
                    .where('studentId', 'in', studentIds.slice(0, 10))
                    .get();
                attSnap.docs.forEach(d => {
                    const data = d.data();
                    if (!attendanceMap[data.studentId]) attendanceMap[data.studentId] = [];
                    attendanceMap[data.studentId].push(data);
                });
            } catch (e) { console.warn('Attendance query:', e); }

            container.innerHTML = results.map(st => {
                // === VĐV CLB ===
                if (st._type === 'clb') {
                    const branchName = FIXED_BRANCHES.find(b => b.id === st.branchId)?.name || '';
                    const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' }[st.classLevel] || '#6b7280';
                    const activatedAt = st.activatedAt?.toDate ? st.activatedAt.toDate() : null;
                    const expiresAt = st.expiresAt?.toDate ? st.expiresAt.toDate() : null;
                    const _expEnd2 = expiresAt ? new Date(expiresAt.getFullYear(), expiresAt.getMonth(), expiresAt.getDate(), 23, 59, 59) : null;
                    const isExpired = st.isExpired || (_expEnd2 && _expEnd2 < new Date());
                    const statusText = st.isFrozen ? '⏸ Bảo lưu' : isExpired ? '❌ Hết hạn' : '✅ Hoạt động';
                    const statusColor = st.isFrozen ? '#6366f1' : isExpired ? '#ef4444' : '#16a34a';

                    return `
                    <div style="padding: 16px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px;">
                            <span style="font-weight: 700; font-size: 16px; color: var(--text-color);">${st.name}</span>
                            <span style="font-size: 11px; background: ${levelColor}20; color: ${levelColor}; padding: 2px 8px; border-radius: 20px; font-weight: 700;">🏅 CLB Lớp ${st.classLevel || '?'}</span>
                            <span style="font-size: 11px; background: ${statusColor}15; color: ${statusColor}; padding: 2px 8px; border-radius: 20px; font-weight: 600;">${statusText}</span>
                        </div>
                        <div style="font-size: 13px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px;">
                            ${st.contractNumber ? `<div><i class="fa-solid fa-file-contract"></i> HĐ: <strong>${st.contractNumber}</strong></div>` : ''}
                            ${branchName ? `<div><i class="fa-solid fa-location-dot"></i> ${branchName}</div>` : ''}
                            ${st.phone ? `<div><i class="fa-solid fa-phone"></i> ${st.phone}</div>` : ''}
                            <div><i class="fa-solid fa-calendar-check"></i> Đã tập: <strong style="color: var(--primary);">${st.totalAttendance || 0}</strong> buổi</div>
                            ${activatedAt ? `<div><i class="fa-solid fa-calendar-plus"></i> Kích hoạt: ${activatedAt.toLocaleDateString('vi-VN')}</div>` : ''}
                            ${expiresAt ? `<div><i class="fa-solid fa-calendar-xmark"></i> Hết hạn: ${expiresAt.toLocaleDateString('vi-VN')}</div>` : ''}
                        </div>
                    </div>`;
                }

                // === Học viên bơi ===
                const total = st.totalSessions || 10;
                const percent = Math.min((st.sessions / total) * 100, 100);
                const isDone = st.sessions >= total;
                const teacherName = teacherMap[st.assignedTeacherId] || 'Chưa gán';
                const curType = st.curriculum || 'Bơi Ếch';
                const branchName = FIXED_BRANCHES.find(b => b.id === st.branchId)?.name || '';
                const attendances = attendanceMap[st.id] || [];
                const currentStep = st.currentStep || 0;

                // Lấy danh sách bước giáo án theo kiểu bơi
                let stepNames = [];
                if (curType === 'Bơi Ếch' || curType === 'Ếch Vip') {
                    stepNames = ['Làm quen nước', 'Đạp chân ếch', 'Chân kết hợp thở', 'Tay ếch kết hợp thở', 'Chân tay kết hợp thở', 'Hoàn thiện'];
                } else if (curType === 'Bơi Sải' || curType === 'Sải Vip') {
                    stepNames = ['Chân sải', 'Chân kết hợp thở', 'Tay sải', 'Tay kết hợp thở', 'Chân tay kết hợp thở', 'Hoàn thiện'];
                }

                // Tạo tiến trình từng bước có tên
                let stepsHtml = '';
                if (stepNames.length > 0) {
                    stepsHtml = `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
                        <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;">
                            <i class="fa-solid fa-book-open"></i> Tiến trình giáo án (${curType}):
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            ${stepNames.map((sName, idx) => {
                        const stepNum = idx + 1;
                        const isCompleted = stepNum <= currentStep;
                        const isCurrent = stepNum === currentStep;
                        return `<div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px;
                                    background: ${isCompleted ? 'rgba(16,185,129,0.08)' : isCurrent ? 'rgba(59,130,246,0.08)' : 'rgba(0,0,0,0.02)'};
                                    border: 1px solid ${isCompleted ? 'rgba(16,185,129,0.2)' : isCurrent ? 'rgba(59,130,246,0.2)' : 'rgba(0,0,0,0.05)'};">
                                    <div style="width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0;
                                        background: ${isCompleted ? '#10b981' : isCurrent ? '#3b82f6' : 'rgba(0,0,0,0.08)'};
                                        color: ${isCompleted || isCurrent ? '#fff' : 'var(--text-muted)'};">
                                        ${isCompleted ? '✓' : stepNum}
                                    </div>
                                    <div style="flex: 1;">
                                        <span style="font-size: 13px; font-weight: ${isCompleted || isCurrent ? '600' : '400'};
                                            color: ${isCompleted ? '#059669' : isCurrent ? '#2563eb' : 'var(--text-muted)'};">
                                            ${sName}
                                        </span>
                                        ${isCurrent ? '<span style="font-size: 10px; background: #3b82f6; color: #fff; padding: 1px 6px; border-radius: 10px; margin-left: 6px; font-weight: 600;">Đang học</span>' : ''}
                                    </div>
                                </div>`;
                    }).join('')}
                        </div>
                    </div>`;
                } else {
                    // Nếu kiểu bơi không có giáo án cụ thể, hiện circles đơn giản
                    let circlesHtml = '';
                    for (let i = 1; i <= total; i++) {
                        const done = i <= st.sessions;
                        circlesHtml += `<div style="width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;
                            background: ${done ? (isDone ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)') : 'rgba(0,0,0,0.05)'};
                            color: ${done ? (isDone ? '#10b981' : '#3b82f6') : 'var(--text-muted)'};
                            border: 1.5px solid ${done ? (isDone ? '#10b981' : '#3b82f6') : 'rgba(0,0,0,0.1)'};">
                            ${done ? '✓' : i}
                        </div>`;
                    }
                    stepsHtml = `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 10px;">${circlesHtml}</div>`;
                }

                // Tạo lịch sử điểm danh
                let historyHtml = '';
                if (attendances.length > 0) {
                    historyHtml = `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-color);">
                        <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;">
                            <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử điểm danh:
                        </div>
                        ${attendances.slice(0, 10).map(a => {
                        const d = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
                        const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                        const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                        return `<div style="display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px;">
                                <span style="color: #3b82f6; font-weight: 600;">Buổi ${a.sessionNumber}</span>
                                <span style="color: var(--text-muted);">📅 ${dateStr} · ⏰ ${timeStr}</span>
                            </div>`;
                    }).join('')}
                    </div>`;
                } else if (st.sessions > 0) {
                    historyHtml = `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-color);">
                        <div style="font-size: 12px; color: var(--text-muted);">
                            <i class="fa-solid fa-info-circle"></i> Đã học ${st.sessions} buổi (chưa có log điểm danh chi tiết)
                        </div>
                    </div>`;
                }

                return `
                <div style="padding: 16px; background: var(--card-bg); border: 1px solid ${isDone ? 'rgba(16,185,129,0.3)' : 'var(--border-color)'}; border-radius: 12px;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;">
                        <span style="font-weight: 700; font-size: 16px; color: var(--text-color);">${st.name}</span>
                        <span style="font-size: 11px; background: rgba(59,130,246,0.1); color: #3b82f6; padding: 2px 8px; border-radius: 20px; font-weight: 500;">${curType}</span>
                        ${isDone ? '<span style="font-size: 11px; background: rgba(16,185,129,0.15); color: #10b981; padding: 2px 8px; border-radius: 20px; font-weight: 600;">✅ Hoàn thành</span>'
                        : `<span style="font-size: 11px; background: rgba(245,158,11,0.1); color: #d97706; padding: 2px 8px; border-radius: 20px; font-weight: 500;">🏊 Đang học</span>`}
                    </div>
                    <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px;">
                        <i class="fa-solid fa-person-swimming"></i> GV: <strong style="color: var(--primary);">${teacherName}</strong>
                        ${branchName ? ` · <i class="fa-solid fa-location-dot"></i> ${branchName}` : ''}
                        ${st.contractNumber ? ` · <i class="fa-solid fa-file-contract"></i> HĐ: ${st.contractNumber}` : ''}
                    </div>
                    ${(() => {
                        if (!isDivingCurriculum(curType)) return '';
                        if (st.waiverSigned) {
                            const waiverDate = st.waiverSignedAt?.toDate ? st.waiverSignedAt.toDate().toLocaleDateString('vi-VN') : '';
                            const eName = st.name.replace(/'/g, "\\\\'");
                            return `<div onclick="viewSignedWaiver('${st.id}', '${eName}')" style="padding:8px 12px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); border-radius:8px; margin-bottom:10px; display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <span style="font-size:12px; color:#059669; font-weight:600;">✅ Đã ký cam kết miễn trừ trách nhiệm ${waiverDate ? '(' + waiverDate + ')' : ''}</span>
                                <span style="font-size:11px; color:#0891b2; text-decoration:underline;">Xem lại</span>
                            </div>`;
                        }
                        const eName = st.name.replace(/'/g, "\\\\'");
                        return `<div style="padding:12px; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); border-radius:10px; margin-bottom:10px;">
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                                <span style="font-size:18px;">⚠️</span>
                                <span style="font-size:13px; font-weight:700; color:#dc2626;">Chưa ký Cam kết miễn trừ trách nhiệm</span>
                            </div>
                            <p style="font-size:12px; color:var(--text-muted); margin:0 0 10px;">Bạn cần ký cam kết trước khi tham gia lớp Lặn. Vui lòng đọc kỹ nội dung và ký xác nhận.</p>
                            <button onclick="openWaiverForm('${st.id}', '${eName}')"
                                style="width:100%; padding:10px; border-radius:8px; border:none; background:#0891b2; color:#fff; font-weight:700; font-size:13px; cursor:pointer;">
                                🤿 Đọc và ký Cam kết miễn trừ trách nhiệm
                            </button>
                        </div>`;
                    })()}
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                        <div style="flex: 1; height: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden;">
                            <div style="width: ${percent}%; height: 100%; background: ${isDone ? '#10b981' : '#3b82f6'}; transition: width 0.3s;"></div>
                        </div>
                        <span style="font-size: 14px; font-weight: 700; color: ${isDone ? '#10b981' : 'var(--text-color)'};">${st.sessions}/${total}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted);">
                        ${isDone ? '🎉 Học viên đã hoàn thành khóa học!' : `📌 Còn ${total - st.sessions} buổi nữa để hoàn thành`}
                    </div>
                    ${stepsHtml}
                    ${historyHtml}
                    ${(() => {
                        if (!st.completionVideoUrl) return '';
                        const uploadTime = st.videoUploadedAt?.toDate ? st.videoUploadedAt.toDate().getTime() : (st.videoUploadedAt || 0);
                        const daysLeft = Math.ceil((uploadTime + 10 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000));
                        if (daysLeft <= 0) return '';
                        return `
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <span style="font-size: 12px; font-weight: 600; color: #7c3aed;">
                                    <i class="fa-solid fa-video"></i> Video kết thúc khóa học
                                </span>
                                <span style="font-size: 10px; background: ${daysLeft <= 3 ? 'rgba(239,68,68,0.1)' : 'rgba(139,92,246,0.1)'}; color: ${daysLeft <= 3 ? '#ef4444' : '#7c3aed'}; padding: 2px 8px; border-radius: 10px; font-weight: 600;">
                                    ⏳ Còn ${daysLeft} ngày
                                </span>
                            </div>
                            <video controls playsinline preload="metadata" style="width: 100%; max-height: 300px; border-radius: 10px; background: #000;"
                                src="${st.completionVideoUrl}">
                            </video>
                        </div>`;
                    })()}
                    ${(() => {
                        // Ô nhận xét khách hàng
                        if (st.customerReview) {
                            return `<div style="margin-top: 12px; padding: 12px; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); border-radius: 10px;">
                                <div style="font-size: 12px; font-weight: 600; color: #d97706; margin-bottom: 4px;"><i class="fa-solid fa-star"></i> Nhận xét của bạn:</div>
                                <div style="font-size: 13px; color: var(--text-color);">${st.customerReview}</div>
                                <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">${st.reviewedAt?.toDate ? st.reviewedAt.toDate().toLocaleDateString('vi-VN') : ''}</div>
                            </div>`;
                        }
                        return `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
                            <div style="font-size: 12px; font-weight: 600; color: #d97706; margin-bottom: 6px;"><i class="fa-solid fa-pen-fancy"></i> Nhận xét về khóa học:</div>
                            <textarea id="review-${st.id}" maxlength="200" rows="2" placeholder="Chia sẻ cảm nhận của bạn về khóa học... (tối đa 200 ký tự)"
                                style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color); font-size:13px; resize:none;"></textarea>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                                <span id="review-count-${st.id}" style="font-size:11px; color:var(--text-muted);">0/200</span>
                                <button onclick="submitCustomerReview('${st.id}', '${st.name.replace(/'/g, "\\\\'")}')" style="padding:6px 16px; border-radius:8px; border:none; background:#f59e0b; color:#fff; font-weight:600; font-size:12px; cursor:pointer;">
                                    <i class="fa-solid fa-paper-plane"></i> Gửi nhận xét
                                </button>
                            </div>
                            <script>document.getElementById('review-${st.id}')?.addEventListener('input', function() { document.getElementById('review-count-${st.id}').textContent = this.value.length + '/200'; });</script>
                        </div>`;
                    })()}
                </div>`;
            }).join('');

            // ===== Tìm VĐV CLB TL KID =====
            try {
                const clbSnap = await db.collection('athletes').get();
                const clbResults = clbSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(a => a.name.toLowerCase().includes(q) || (a.phone || '').includes(q) || (a.contractNumber || '').toLowerCase().includes(q));

                if (clbResults.length > 0) {
                    // Tìm HLV phụ trách theo classLevel
                    const coachSnap = await db.collection('users').where('isCoach', '==', true).get();
                    const coachMap = {};
                    coachSnap.docs.forEach(doc => {
                        const u = doc.data();
                        (u.coachClasses || []).forEach(cl => {
                            if (!coachMap[cl + '_' + (u.branchId || '')]) coachMap[cl + '_' + (u.branchId || '')] = u.name;
                        });
                    });

                    // Lấy điểm danh CLB hôm nay
                    const clbToday = new Date(); clbToday.setHours(0, 0, 0, 0);
                    const clbNow = Date.now();
                    let clbAttMap = {};
                    try {
                        const clbAttSnap = await db.collection('clb_attendance').where('timestamp', '>=', clbToday).get();
                        clbAttSnap.docs.forEach(d => {
                            const data = d.data();
                            const ts = data.timestamp?.toDate ? data.timestamp.toDate().getTime() : 0;
                            if (!clbAttMap[data.athleteId] || ts > clbAttMap[data.athleteId].latest) {
                                clbAttMap[data.athleteId] = { count: (clbAttMap[data.athleteId]?.count || 0) + 1, latest: ts };
                            } else {
                                clbAttMap[data.athleteId].count++;
                            }
                        });
                    } catch (e) { console.warn('CLB att query:', e); }

                    const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' };

                    container.innerHTML += `<div style="margin-top:16px; padding-top:16px; border-top:2px solid var(--border-color);">
                        <div style="font-size:14px; font-weight:700; color:#f59e0b; margin-bottom:12px;">
                            <i class="fa-solid fa-medal"></i> CLB TL KID (${clbResults.length} kết quả)
                        </div>` +
                        clbResults.map(a => {
                            const lc = levelColor[a.classLevel] || '#6b7280';
                            const coachName = coachMap[a.classLevel + '_' + (a.branchId || '')] || 'Chưa gán HLV';
                            const branchName = FIXED_BRANCHES.find(b => b.id === a.branchId)?.name || '';

                            let statusBadge = '';
                            if (a.isFrozen) {
                                statusBadge = '<span style="font-size:11px; background:rgba(99,102,241,0.1); color:#6366f1; padding:2px 8px; border-radius:20px; font-weight:600;">⏸ Bảo lưu</span>';
                            } else if (a.isExpired) {
                                statusBadge = '<span style="font-size:11px; background:rgba(239,68,68,0.1); color:#ef4444; padding:2px 8px; border-radius:20px; font-weight:600;">Hết hạn</span>';
                            } else if (a.activatedAt) {
                                statusBadge = '<span style="font-size:11px; background:rgba(34,197,94,0.1); color:#16a34a; padding:2px 8px; border-radius:20px; font-weight:600;">🏊 Đang học</span>';
                            } else {
                                statusBadge = '<span style="font-size:11px; background:rgba(107,114,128,0.1); color:#6b7280; padding:2px 8px; border-radius:20px; font-weight:600;">Chưa kích hoạt</span>';
                            }

                            // Trạng thái điểm danh hôm nay
                            let todayBadge = '';
                            const cAtt = clbAttMap[a.id];
                            if (cAtt) {
                                const elapsed = clbNow - cAtt.latest;
                                if (elapsed < 90 * 60 * 1000) {
                                    const rMin = Math.ceil((90 * 60 * 1000 - elapsed) / 60000);
                                    todayBadge = `<div style="font-size:12px; color:#3b82f6; font-weight:600; margin-top:4px;">🏊 Đang tập luyện (còn ${rMin}p)</div>`;
                                } else {
                                    todayBadge = `<div style="font-size:12px; color:#10b981; font-weight:600; margin-top:4px;">✅ Đã điểm danh hôm nay (${cAtt.count} lần)</div>`;
                                }
                            } else {
                                todayBadge = `<div style="font-size:12px; color:var(--text-muted); margin-top:4px;">⭕ Chưa điểm danh hôm nay</div>`;
                            }

                            const expDate = a.expiresAt?.toDate ? a.expiresAt.toDate().toLocaleDateString('vi-VN') : '';

                            return `
                        <div style="padding:16px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; margin-bottom:10px;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                                <span style="font-weight:700; font-size:16px; color:var(--text-color);">${a.name}</span>
                                <span style="background:${lc}; color:#fff; padding:2px 10px; border-radius:20px; font-size:12px; font-weight:700;">Lớp ${a.classLevel}</span>
                                ${statusBadge}
                            </div>
                            <div style="font-size:13px; color:var(--text-muted); margin-bottom:6px;">
                                <i class="fa-solid fa-medal" style="color:#f59e0b;"></i> HLV: <strong style="color:var(--primary);">${coachName}</strong>
                                ${branchName ? ` · <i class="fa-solid fa-location-dot"></i> ${branchName}` : ''}
                            </div>
                            <div style="font-size:13px; color:var(--text-muted); margin-bottom:6px;">
                                ${a.contractNumber ? `<i class="fa-solid fa-file-contract"></i> HĐ: <strong>${a.contractNumber}</strong>` : ''}
                                · ${a.sessionsPerWeek} buổi/tuần · ${a.contractMonths} tháng
                                ${expDate ? ` · Hạn: ${expDate}` : ''}
                            </div>
                            <div style="font-size:13px; color:var(--primary); font-weight:600;">
                                <i class="fa-solid fa-check-circle"></i> Đã học: ${a.totalAttendance || 0} buổi
                            </div>
                            ${todayBadge}
                        </div>`;
                        }).join('') + '</div>';
                }
            } catch (clbErr) { console.warn('CLB search:', clbErr); }
        } catch (e) {
            console.error(e);
            container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--danger);">Lỗi: ${e.message}</div>`;
        }
    }, 500);
};
