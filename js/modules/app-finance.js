// ===== GreenPool App — Finance & Salary (v11.0) =====
// Chốt lương, xác nhận Sale, thống kê tài chính


// Điểm danh Buổi học

// Chốt lương cho học viên đủ điều kiện

// Mở Modal Giáo Án Của Học Viên


// ===================== FINANCE / CHỐT LƯƠNG ===================== //

// Khởi tạo bộ lọc Finance
window.initFinanceFilters = function () {
    const monthSel = document.getElementById('finance-month-filter');
    const branchSel = document.getElementById('finance-branch-filter');
    if (!monthSel || !branchSel) return;

    // Tạo options cho 12 tháng gần nhất
    const now = new Date();
    let mHtml = '';
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
        mHtml += `<option value="${val}" ${i === 0 ? 'selected' : ''}>${label}</option>`;
    }
    monthSel.innerHTML = mHtml;

    // Tạo options cho cơ sở — Ẩn dropdown riêng, dùng CS từ global header
    branchSel.style.display = 'none';
    // Lấy CS hiện tại từ global dropdown
    const globalBranch = document.getElementById('global-branch-select')?.value || '';
    branchSel.value = globalBranch;

    renderFinanceTab();
};

// Render bảng chốt lương — Tab Finance
window.renderFinanceTab = async function () {
    const container = document.getElementById('finance-content');
    if (!container) return;

    const monthSel = document.getElementById('finance-month-filter');
    const month = monthSel?.value || '';
    // Luôn lấy CS từ global dropdown
    const branchFilter = document.getElementById('global-branch-select')?.value || '';

    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        let query = db.collection('salary_submissions').where('month', '==', month);
        if (branchFilter) query = query.where('branchId', '==', branchFilter);

        const snap = await query.get();

        if (snap.empty) {
            container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-inbox" style="font-size:32px; display:block; margin-bottom:10px;"></i>Chưa có bảng chốt lương nào cho tháng này.</div>';
            return;
        }

        // Group by teacher — merge nhiều doc salary_submissions cùng teacher
        let html = '';
        const rawSubmissions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Gom students theo teacherId
        const teacherMap = {};
        rawSubmissions.forEach(sub => {
            const tid = sub.teacherId || sub.teacherName || 'unknown';
            if (!teacherMap[tid]) {
                teacherMap[tid] = {
                    teacherId: sub.teacherId,
                    teacherName: sub.teacherName,
                    branchId: sub.branchId,
                    month: sub.month,
                    submittedAt: sub.submittedAt,
                    students: [],
                    docIds: []
                };
            }
            // Merge students
            const existingStudents = sub.students || [];
            existingStudents.forEach(s => {
                // Tránh trùng studentId
                if (!teacherMap[tid].students.find(es => es.studentId && es.studentId === s.studentId)) {
                    teacherMap[tid].students.push(s);
                }
            });
            teacherMap[tid].docIds.push(sub.id);
            // Lấy submittedAt mới nhất
            if (sub.submittedAt && (!teacherMap[tid].submittedAt || (sub.submittedAt.toDate?.() > teacherMap[tid].submittedAt.toDate?.()))) {
                teacherMap[tid].submittedAt = sub.submittedAt;
            }
        });
        
        const submissions = Object.values(teacherMap);
        
        // Fallback: lookup teacher name cho docs thiếu tên
        for (const sub of submissions) {
            if (!sub.teacherName && sub.teacherId) {
                try {
                    const tDoc = await db.collection('users').doc(sub.teacherId).get();
                    if (tDoc.exists) sub.teacherName = tDoc.data().name || 'GV';
                } catch (e) { /* skip */ }
            }
        }
        
        submissions.sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || ''));
        window._financeSubmissions = submissions;
        window._financeMonth = month;

        // Bảng giá tiền công GV
        const SALARY_PRICE_MAP = {
            'Bơi Ếch Trẻ em': 750000, 'Bơi Ếch': 750000,
            'Bơi Sải Trẻ em': 900000, 'Bơi Sải': 900000,
            'Ếch Vip Trẻ em': 1312000, 'Ếch Vip': 1312000,
            'Sải Vip Trẻ em': 1487500, 'Sải Vip': 1487500,
            'Bơi Ếch Người lớn': 900000,
            'Bơi Sải Người lớn': 1050000,
            'Ếch Vip Người lớn': 1487500,
            'Sải Vip Người lớn': 1662000,
            'Bơi Ngửa': 1050000,
            'Bơi Bướm': 1650000,
            'PT': 200000, // tính theo buổi
            'Dolphin 1': 1400000, 'Dolphin 2': 2200000, 'Basic Mermaid': 2200000,
            'Pro. Mermaid': 3800000, 'Lặn Nghệ thuật': 2200000, 'Trải nghiệm Tiên cá': 0
        };

        function calcSalary(s) {
            const cur = s.curriculum || 'Bơi Ếch';
            const age = s.ageCategory || 'Trẻ em';
            if (cur === 'PT') return (s.sessions || 0) * 200000;
            // Thử key chính xác trước (VD: "Ếch Trẻ em"), rồi fallback
            const exactKey = cur + ' ' + age;
            if (SALARY_PRICE_MAP[exactKey]) return SALARY_PRICE_MAP[exactKey];
            if (SALARY_PRICE_MAP[cur]) return SALARY_PRICE_MAP[cur];
            return 0;
        }

        let grandTotal = 0;

        submissions.forEach((sub, subIdx) => {
            const branchName = FIXED_BRANCHES.find(b => b.id === sub.branchId)?.name || sub.branchId;
            const students = sub.students || [];
            const time = sub.submittedAt?.toDate ? sub.submittedAt.toDate().toLocaleString('vi-VN') : '—';
            const adultCount = students.filter(s => s.ageCategory === 'Người lớn').length;
            const childCount = students.filter(s => s.ageCategory !== 'Người lớn').length;
            let teacherTotal = 0;

            html += `<div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:16px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid var(--border-color);">
                    <div>
                        <div style="font-weight:700; font-size:15px; color:var(--text-color);"><i class="fa-solid fa-chalkboard-teacher" style="color:var(--primary);"></i> ${sub.teacherName}</div>
                        <div style="font-size:12px; color:var(--text-muted);">📍 ${branchName} · 📅 ${time}</div>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <span style="background:rgba(37,99,235,0.1); color:var(--primary); padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600;">${students.length} HV</span>
                        <span style="background:rgba(236,72,153,0.1); color:#ec4899; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600;">👶 ${childCount}</span>
                        <span style="background:rgba(16,185,129,0.1); color:#10b981; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600;">👤 ${adultCount}</span>
                    </div>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:12px;">
                        <thead>
                            <tr style="background:rgba(37,99,235,0.05);">
                                <th style="padding:8px; text-align:left; border-bottom:1px solid var(--border-color);">#</th>
                                <th style="padding:8px; text-align:left; border-bottom:1px solid var(--border-color);">Họ tên</th>
                                <th style="padding:8px; text-align:left; border-bottom:1px solid var(--border-color);">SĐT</th>
                                <th style="padding:8px; text-align:left; border-bottom:1px solid var(--border-color);">Số HĐ</th>
                                <th style="padding:8px; text-align:left; border-bottom:1px solid var(--border-color);">Kiểu bơi</th>
                                <th style="padding:8px; text-align:center; border-bottom:1px solid var(--border-color);">Buổi</th>
                                <th style="padding:8px; text-align:center; border-bottom:1px solid var(--border-color);">Độ tuổi</th>
                                <th style="padding:8px; text-align:left; border-bottom:1px solid var(--border-color);">Sale</th>
                                <th style="padding:8px; text-align:right; border-bottom:1px solid var(--border-color);">Thành tiền</th>
                                <th style="padding:8px; text-align:center; border-bottom:1px solid var(--border-color);">Sale XN</th>
                                <th style="padding:8px; text-align:center; border-bottom:1px solid var(--border-color);">Ngày Sale XN</th>
                            </tr>
                        </thead>
                        <tbody>`;

            students.forEach((s, idx) => {
                const price = calcSalary(s);
                teacherTotal += price;
                html += `<tr style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:6px 8px;">${idx + 1}</td>
                    <td style="padding:6px 8px; font-weight:600;">${s.name}</td>
                    <td style="padding:6px 8px;">${s.phone || '—'}</td>
                    <td style="padding:6px 8px;">${s.contractNumber || '—'}</td>
                    <td style="padding:6px 8px;">${s.curriculum || 'Bơi Ếch'}</td>
                    <td style="padding:6px 8px; text-align:center;">${s.sessions}/${s.totalSessions}</td>
                    <td style="padding:6px 8px; text-align:center;">${s.ageCategory === 'Người lớn' ? '👤 NL' : '👶 TE'}</td>
                    <td style="padding:6px 8px; color:#8b5cf6; font-weight:500;">${s.creatorName || s.saleName || '—'}</td>
                    <td style="padding:6px 8px; text-align:right; font-weight:600; color:#059669;">${price.toLocaleString('vi-VN')}đ</td>
                    <td style="padding:6px 8px; text-align:center; color:#10b981;"><i class="fa-solid fa-circle-check"></i></td>
                    <td style="padding:6px 8px; text-align:center; font-size:11px; color:var(--text-muted);">${s.saleConfirmedAt ? (s.saleConfirmedAt.toDate ? s.saleConfirmedAt.toDate().toLocaleString('vi-VN') : new Date(s.saleConfirmedAt).toLocaleString('vi-VN')) : '—'}${s.saleConfirmedBy ? '<br><span style="color:#8b5cf6;font-weight:500;">' + s.saleConfirmedBy + '</span>' : ''}</td>
                </tr>`;
            });

            grandTotal += teacherTotal;
            html += `<tr style="background:rgba(16,185,129,0.08); font-weight:700;">
                <td colspan="9" style="padding:8px; text-align:right; color:var(--text-color);">💰 Tổng tiền công ${sub.teacherName}:</td>
                <td style="padding:8px; text-align:right; color:#059669; font-size:14px;">${teacherTotal.toLocaleString('vi-VN')}đ</td>
                <td></td>
            </tr>`;
            html += `</tbody></table></div>
            <div style="margin-top:10px; text-align:right;">
                <button onclick="exportTeacherSalary(${subIdx})" style="padding:6px 14px; border:none; background:rgba(16,185,129,0.15); color:#059669; border-radius:8px; font-weight:600; font-size:12px; cursor:pointer;">
                    <i class="fa-solid fa-file-excel"></i> Xuất Excel
                </button>
            </div>
            </div>`;
        });

        // Tổng tất cả GV
        html += `<div style="background:linear-gradient(135deg, rgba(37,99,235,0.1), rgba(16,185,129,0.1)); border:2px solid var(--primary); border-radius:12px; padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
                <span style="font-size:16px; font-weight:700; color:var(--text-color);"><i class="fa-solid fa-calculator"></i> TỔNG CỘNG TẤT CẢ:</span>
                <span style="font-size:20px; font-weight:800; color:#059669; margin-left:12px;">${grandTotal.toLocaleString('vi-VN')}đ</span>
            </div>
            <button onclick="exportAllSalary()" style="padding:8px 20px; border:none; background:#059669; color:#fff; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">
                <i class="fa-solid fa-file-excel"></i> Xuất tất cả ra Excel
            </button>
        </div>`;

        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">Lỗi tải dữ liệu: ' + e.message + '</div>';
    }
};

// Hàm helper tạo XLSX và download (dùng SheetJS)
function downloadXLSX(rows, filename, sheetName) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Auto-width columns
    const colWidths = rows[0].map((_, colIdx) => {
        let max = 10;
        rows.forEach(row => {
            const val = String(row[colIdx] || '');
            if (val.length > max) max = val.length;
        });
        return { wch: Math.min(max + 2, 40) };
    });
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
    XLSX.writeFile(wb, filename);
}

function salaryPrice(s) {
    const MAP = {
        'Bơi Ếch Trẻ em': 750000, 'Bơi Ếch': 750000,
        'Bơi Sải Trẻ em': 900000, 'Bơi Sải': 900000,
        'Ếch Vip Trẻ em': 1312000, 'Ếch Vip': 1312000,
        'Sải Vip Trẻ em': 1487500, 'Sải Vip': 1487500,
        'Bơi Ếch Người lớn': 900000, 'Bơi Sải Người lớn': 1050000,
        'Ếch Vip Người lớn': 1487500, 'Sải Vip Người lớn': 1662000,
        'Bơi Ngửa': 1050000, 'Bơi Bướm': 1650000, 'PT': 200000,
        'Dolphin 1': 1400000, 'Dolphin 2': 2200000, 'Basic Mermaid': 2200000,
        'Pro. Mermaid': 3800000, 'Lặn Nghệ thuật': 2200000, 'Trải nghiệm Tiên cá': 0
    };
    const cur = s.curriculum || 'Bơi Ếch';
    const age = s.ageCategory || 'Trẻ em';
    if (cur === 'PT') return (s.sessions || 0) * 200000;
    return MAP[cur + ' ' + age] || MAP[cur] || 0;
}

function buildSalaryRows(submissions) {
    const rows = [['STT', 'Giáo viên', 'Cơ sở', 'Họ tên HV', 'SĐT', 'Số HĐ', 'Kiểu bơi', 'Buổi', 'Độ tuổi', 'Sale', 'Thành tiền', 'Sale XN', 'Ngày Sale XN']];
    let idx = 0;
    submissions.forEach(sub => {
        const branchName = FIXED_BRANCHES.find(b => b.id === sub.branchId)?.name || sub.branchId;
        (sub.students || []).forEach(s => {
            idx++;
            const price = salaryPrice(s);
            const saleXNDate = s.saleConfirmedAt ? (s.saleConfirmedAt.toDate ? s.saleConfirmedAt.toDate().toLocaleString('vi-VN') : new Date(s.saleConfirmedAt).toLocaleString('vi-VN')) : '';
            rows.push([idx, sub.teacherName, branchName, s.name, s.phone || '', s.contractNumber || '', s.curriculum || 'Bơi Ếch', `${s.sessions}/${s.totalSessions}`, s.ageCategory === 'Người lớn' ? 'Người lớn' : 'Trẻ em', s.creatorName || s.saleName || '', price, s.saleConfirmedBy || '', saleXNDate]);
        });
        const total = (sub.students || []).reduce((sum, s) => sum + salaryPrice(s), 0);
        rows.push(['', '', '', '', '', '', '', '', '', `Tổng ${sub.teacherName}:`, total]);
    });
    const grandTotal = submissions.reduce((sum, sub) => sum + (sub.students || []).reduce((s2, s) => s2 + salaryPrice(s), 0), 0);
    rows.push(['', '', '', '', '', '', '', '', '', 'TỔNG CỘNG:', grandTotal]);
    return rows;
}
// Xuất Excel từng GV: bỏ cột Buổi + Thành tiền
function buildTeacherSalaryRows(submissions) {
    const rows = [['STT', 'Giáo viên', 'Cơ sở', 'Họ tên HV', 'SĐT', 'Số HĐ', 'Kiểu bơi', 'Độ tuổi', 'Sale', 'Sale XN', 'Ngày Sale XN']];
    let idx = 0;
    submissions.forEach(sub => {
        const branchName = FIXED_BRANCHES.find(b => b.id === sub.branchId)?.name || sub.branchId;
        (sub.students || []).forEach(s => {
            idx++;
            const saleXNDate = s.saleConfirmedAt ? (s.saleConfirmedAt.toDate ? s.saleConfirmedAt.toDate().toLocaleString('vi-VN') : new Date(s.saleConfirmedAt).toLocaleString('vi-VN')) : '';
            rows.push([idx, sub.teacherName, branchName, s.name, s.phone || '', s.contractNumber || '', s.curriculum || 'Bơi Ếch', s.ageCategory === 'Người lớn' ? 'Người lớn' : 'Trẻ em', s.creatorName || s.saleName || '', s.saleConfirmedBy || '', saleXNDate]);
        });
    });
    return rows;
}

window.exportTeacherSalary = function (idx) {
    const subs = window._financeSubmissions;
    if (!subs || !subs[idx]) return alert('Không tìm thấy dữ liệu!');
    const sub = subs[idx];
    const rows = buildTeacherSalaryRows([sub]);
    const month = window._financeMonth || '';
    downloadXLSX(rows, `Luong_${sub.teacherName.replace(/\s+/g, '_')}_${month}.xlsx`, 'Lương GV');
};

window.exportAllSalary = function () {
    const subs = window._financeSubmissions;
    if (!subs || subs.length === 0) return alert('Không có dữ liệu!');
    const rows = buildSalaryRows(subs);
    const month = window._financeMonth || '';
    downloadXLSX(rows, `Luong_TatCa_${month}.xlsx`, 'Tổng hợp lương');
};
// ===================== MỞ/ĐÓNG CHỐT LƯƠNG (Kế toán điều khiển) ===================== //
window._salaryIsOpen = false; // cache trạng thái

// Toggle mở/đóng chốt lương (chỉ KT/Admin)
window.toggleSalaryOpen = async function () {
    try {
        const docRef = db.collection('settings').doc('salary');
        const docSnap = await docRef.get();
        const currentOpen = docSnap.exists ? (docSnap.data().isOpen || false) : false;
        const newOpen = !currentOpen;

        const action = newOpen ? 'MỞ' : 'ĐÓNG';
        if (!confirm(`${newOpen ? '🔓' : '🔒'} Xác nhận ${action} chốt lương?\n\n${newOpen ? 'Giáo viên sẽ có thể bấm chốt lương.' : 'Giáo viên sẽ KHÔNG thể chốt lương cho đến khi mở lại.'}`)) return;

        await docRef.set({
            isOpen: newOpen,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUserDisplayName || currentUserId
        }, { merge: true });

        window._salaryIsOpen = newOpen;
        updateSalaryToggleUI(newOpen, currentUserDisplayName);
        alert(`✅ Đã ${action} chốt lương!`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Cập nhật UI nút toggle
function updateSalaryToggleUI(isOpen, updatedBy) {
    const icon = document.getElementById('salary-toggle-icon');
    const label = document.getElementById('salary-toggle-label');
    const info = document.getElementById('salary-toggle-info');
    const btn = document.getElementById('salary-toggle-btn');
    const section = document.getElementById('salary-toggle-section');

    if (isOpen) {
        if (icon) { icon.className = 'fa-solid fa-lock-open'; icon.style.color = '#10b981'; }
        if (label) { label.textContent = 'Chốt lương đang MỞ'; label.style.color = '#10b981'; }
        if (info) info.textContent = updatedBy ? `Mở bởi: ${updatedBy}` : '';
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-lock"></i> Đóng chốt lương';
            btn.style.background = 'rgba(239,68,68,0.15)';
            btn.style.color = '#ef4444';
        }
        if (section) { section.style.borderColor = 'rgba(16,185,129,0.4)'; section.style.background = 'rgba(16,185,129,0.05)'; }
    } else {
        if (icon) { icon.className = 'fa-solid fa-lock'; icon.style.color = '#ef4444'; }
        if (label) { label.textContent = 'Chốt lương đang ĐÓNG'; label.style.color = '#ef4444'; }
        if (info) info.textContent = updatedBy ? `Đóng bởi: ${updatedBy}` : 'Giáo viên chưa thể chốt lương.';
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Mở chốt lương';
            btn.style.background = 'rgba(16,185,129,0.15)';
            btn.style.color = '#059669';
        }
        if (section) { section.style.borderColor = 'rgba(239,68,68,0.3)'; section.style.background = 'rgba(239,68,68,0.04)'; }
    }
}

// Lắng nghe real-time trạng thái chốt lương
window.listenSalaryToggle = function () {
    db.collection('settings').doc('salary').onSnapshot(snap => {
        const data = snap.exists ? snap.data() : {};
        window._salaryIsOpen = data.isOpen || false;
        updateSalaryToggleUI(window._salaryIsOpen, data.updatedBy || '');

        // Cập nhật nút GV
        const teacherSalarySection = document.getElementById('teacher-salary-section');
        if (teacherSalarySection && currentUserRole === 'TEACHER') {
            if (window._salaryIsOpen) {
                teacherSalarySection.style.display = 'block';
                teacherSalarySection.innerHTML = `
                    <button onclick="submitSalary()"
                        style="width:100%; padding:14px 20px; border-radius:10px; border:none; cursor:pointer; font-weight:700; font-size:14px; background:linear-gradient(135deg, #f59e0b, #d97706); color:#fff; box-shadow:0 4px 15px rgba(245,158,11,0.3); display:flex; align-items:center; justify-content:center; gap:8px;">
                        <i class="fa-solid fa-coins"></i> 💰 Chốt Lương Tháng Này
                    </button>`;
            } else {
                teacherSalarySection.style.display = 'block';
                teacherSalarySection.innerHTML = `
                    <div style="width:100%; padding:14px 20px; border-radius:10px; border:1px dashed rgba(239,68,68,0.4); background:rgba(239,68,68,0.05); text-align:center;">
                        <div style="font-weight:700; font-size:14px; color:#ef4444; margin-bottom:4px;">
                            <i class="fa-solid fa-lock"></i> Chốt lương chưa được mở
                        </div>
                        <div style="font-size:12px; color:var(--text-muted);">Vui lòng chờ Kế toán mở chốt lương.</div>
                    </div>`;
            }
        }
    }, err => {
        console.warn('Salary toggle listener error:', err);
        window._salaryIsOpen = true; // fallback cho phép chốt
    });
};

// GV: Chốt lương tháng hiện tại
window.submitSalary = async function () {
    if (!currentUserId) return;

    // Kiểm tra KT đã mở chốt lương chưa
    try {
        const salaryDoc = await db.collection('settings').doc('salary').get();
        const isOpen = salaryDoc.exists ? (salaryDoc.data().isOpen || false) : false;
        if (!isOpen) {
            alert('🔒 Kế toán chưa mở chốt lương!\n\nVui lòng chờ Kế toán bấm "Mở chốt lương" trước.');
            return;
        }
    } catch (e) {
        // Nếu lỗi → cho phép chốt (fallback)
        console.warn('Check salary open failed, allowing:', e);
    }

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;

    try {
        // Lấy danh sách HV của GV này
        const studSnap = await db.collection('students')
            .where('assignedTeacherId', '==', currentUserId)
            .where('branchId', '==', currentBranchId)
            .get();

        // Lấy danh sách HV đã chốt ở các tháng trước (tránh trùng gói thường)
        const prevSnap = await db.collection('salary_submissions')
            .where('teacherId', '==', currentUserId)
            .get();
        const alreadySubmittedIds = new Set();
        const ptSubmittedSessions = {}; // PT: track tổng buổi đã chốt
        prevSnap.docs.forEach(d => {
            (d.data().students || []).forEach(s => {
                if (s.curriculum === 'PT') {
                    ptSubmittedSessions[s.studentId] = (ptSubmittedSessions[s.studentId] || 0) + (s.sessions || 0);
                } else {
                    alreadySubmittedIds.add(s.studentId);
                }
            });
        });

        // Lọc HV đủ điều kiện
        // - Gói thường: đủ buổi + ≥7 buổi + chưa chốt tháng này
        // - Gói PT: đã dạy ≥ 50% khóa, chốt theo buổi đã ĐD (trừ buổi đã chốt)
        const eligible = [];
        const notEligible = [];
        const ptRemaining = []; // HV PT còn buổi chưa chốt
        studSnap.docs.forEach(doc => {
            const s = doc.data();
            const sessions = s.sessions || 0;
            const total = s.totalSessions || 10;
            const cur = s.curriculum || 'Bơi Ếch';

            // Bỏ qua HV đã chốt tháng này (đã bấm chốt trước đó trong tháng)
            if (s.salarySubmittedMonth === month) return;

            if (cur === 'PT') {
                // PT: cho phép chốt khi >= 50% khóa
                const prevSubmitted = ptSubmittedSessions[doc.id] || 0;
                const remainingSessions = sessions - prevSubmitted;
                const halfTotal = Math.ceil(total / 2);

                if (sessions >= halfTotal && remainingSessions > 0) {
                    eligible.push({ studentId: doc.id, ...s, sessions: remainingSessions, _ptPartial: true, _ptPrevSubmitted: prevSubmitted });
                    if (sessions < total) {
                        ptRemaining.push({ name: s.name, done: sessions, total: total, remaining: total - sessions });
                    }
                } else if (remainingSessions <= 0) {
                    // Đã chốt hết buổi
                    return;
                } else {
                    notEligible.push({ name: s.name, reasons: [`PT chưa đủ 50% (${sessions}/${total}, cần ≥${halfTotal})`] });
                }
            } else {
                // Gói thường hoặc Lặn
                if (alreadySubmittedIds.has(doc.id)) return;
                let minSessions = 7; // Bơi: ≥7 buổi
                const cur = s.curriculum || '';
                if (isDivingCurriculum(cur)) {
                    if (cur === 'Dolphin 1') minSessions = 3;
                    else if (cur === 'Dolphin 2') minSessions = 4;
                    else minSessions = Math.max(1, total - 1);
                }

                if (sessions >= minSessions) {
                    eligible.push({ studentId: doc.id, ...s });
                } else {
                    notEligible.push({ name: s.name, reasons: [`chưa đủ buổi (${sessions}/${total}, cần ≥${minSessions})`] });
                }
            }
        });

        if (eligible.length === 0) {
            let msg = `❌ Không có HV nào đủ điều kiện chốt lương ${monthLabel}.\n\n`;
            msg += `Điều kiện:\n  • Gói Bơi: Tối thiểu 7 buổi\n  • Dolphin 1: 3/4 buổi\n  • Dolphin 2: 4/5 buổi\n  • Gói PT: Đã dạy ≥ 50% khóa\n\n`;
            if (notEligible.length > 0) {
                msg += 'HV chưa đủ:\n';
                notEligible.slice(0, 5).forEach(ne => {
                    msg += `  • "${ne.name}": ${ne.reasons.join(', ')}\n`;
                });
                if (notEligible.length > 5) msg += `  ... và ${notEligible.length - 5} HV khác`;
            }
            alert(msg);
            return;
        }

        // Hiện danh sách để GV xác nhận
        let confirmMsg = `💰 CHỐT LƯƠNG ${monthLabel}\n\n`;
        confirmMsg += `Có ${eligible.length} HV đủ điều kiện:\n`;
        eligible.forEach((s, i) => {
            if (s._ptPartial) {
                confirmMsg += `${i + 1}. "${s.name}" — PT 🏋️ (chốt ${s.sessions} buổi${s._ptPrevSubmitted ? ', đã chốt trước: ' + s._ptPrevSubmitted + ' buổi' : ''})\n`;
            } else {
                confirmMsg += `${i + 1}. "${s.name}" — ${s.curriculum || 'Bơi Ếch'} (${s.sessions}/${s.totalSessions || 10}) ${s.ageCategory === 'Người lớn' ? '👤' : '👶'}\n`;
            }
        });
        if (ptRemaining.length > 0) {
            confirmMsg += '\n📌 HV PT còn buổi chưa chốt:\n';
            ptRemaining.forEach(p => {
                confirmMsg += `  • "${p.name}": còn ${p.remaining} buổi (${p.done}/${p.total})\n`;
            });
        }
        confirmMsg += '\nXác nhận chốt?';
        if (!confirm(confirmMsg)) return;

        // Đánh dấu HV đã chốt — chờ Sale xác nhận (KHÔNG ghi salary_submissions)
        const batch = db.batch();
        eligible.forEach(s => {
            batch.update(db.collection('students').doc(s.studentId), {
                salarySubmittedMonth: month,
                salarySubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                salaryConfirmed: true,
                salaryConfirmedBy: currentUserId,
                saleRejected: firebase.firestore.FieldValue.delete(),
                saleRejectedBy: firebase.firestore.FieldValue.delete(),
                saleRejectedAt: firebase.firestore.FieldValue.delete()
            });
        });
        await batch.commit();

        // Thông báo cho Sale: GV đã chốt lương → cần xác nhận
        const saleIds = [...new Set(eligible.map(s => s.creatorId || s.saleId).filter(Boolean))];
        const teacherName = currentUserDisplayName || 'GV';
        const branchName = FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || 'cơ sở';
        for (const sid of saleIds) {
            if (sid !== currentUserId) {
                await sendNotification(sid, 'salary', `💰 GV "${teacherName}" đã chốt lương ${monthLabel} tại 🏊 ${branchName} (${eligible.filter(s => (s.creatorId || s.saleId) === sid).length} HV). Vui lòng xác nhận.`);
            }
        }

        alert(`✅ Đã chốt lương ${monthLabel}!\n\n${eligible.length} HV đã gửi cho Sale xác nhận.\nSau khi Sale xác nhận sẽ chuyển về bảng Kế Toán.`);
    } catch (e) {
        alert('Lỗi chốt lương: ' + e.message);
    }
};

// Sale: Xác nhận HĐ cho học viên → ghi salary_submissions (về Kế Toán)
// Không dùng confirm()/alert() để tránh nhảy trang trên mobile
window.saleConfirmStudent = async function (studentId, studentName) {
    const row = document.getElementById('sale-pend-' + studentId);
    if (!row) return;
    // Disable buttons ngay lập tức
    row.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
    try {
        const stuDoc = await db.collection('students').doc(studentId).get();
        const s = stuDoc.exists ? stuDoc.data() : {};

        // Check if fully completed (sale confirmed + enough sessions)
        const isCompleted = (s.sessions || 0) >= (s.totalSessions || 10);
        const updateData = {
            saleConfirmed: true,
            saleConfirmedBy: currentUserDisplayName || 'Sale',
            saleConfirmedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (isCompleted && s.salaryConfirmed) updateData.isFullyCompleted = true;
        await db.collection('students').doc(studentId).update(updateData);

        // Lấy tên GV: thử nhiều field name + fallback lookup user doc
        let teacherName = s.teacherName || s.assignedTeacherName || '';
        if (!teacherName && s.assignedTeacherId) {
            try {
                const tDoc = await db.collection('users').doc(s.assignedTeacherId).get();
                if (tDoc.exists) teacherName = tDoc.data().name || '';
            } catch (e) { /* skip */ }
        }

        // Lấy tên Sale/người tạo HĐ
        let saleName = s.creatorName || '';
        if (!saleName && s.creatorId) {
            try {
                const saleDoc = await db.collection('users').doc(s.creatorId).get();
                if (saleDoc.exists) saleName = saleDoc.data().name || '';
            } catch (e) { /* skip */ }
        }
        if (!saleName && s.saleId) {
            try {
                const saleDoc2 = await db.collection('users').doc(s.saleId).get();
                if (saleDoc2.exists) saleName = saleDoc2.data().name || '';
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
                creatorName: saleName,
                saleName: saleName,
                saleConfirmedBy: currentUserDisplayName || 'Sale',
                saleConfirmedAt: new Date().toISOString()
            }],
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            saleConfirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'confirmed'
        });

        // Cập nhật inline — không dùng alert()
        row.style.borderColor = '#10b981';
        row.style.background = 'rgba(16,185,129,0.08)';
        row.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:600; color:var(--text-color);">${studentName}</div>
                <div style="font-size:11px; color:#10b981; font-weight:600; margin-top:2px;">✅ Đã xác nhận · Chuyển về Kế Toán</div>
            </div>
            <div style="font-size:18px;">✅</div>`;
        // Cập nhật counter trong header
        _updatePendingCounter(-1);
    } catch (e) {
        row.querySelectorAll('button').forEach(b => { b.disabled = false; b.style.opacity = '1'; });
        row.style.borderColor = '#ef4444';
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'font-size:10px; color:#ef4444; margin-top:4px;';
        errDiv.textContent = '❌ Lỗi: ' + e.message;
        row.querySelector('div').appendChild(errDiv);
    }
};

// Sale xem danh sách HV chờ xác nhận chốt lương (chỉ HV mà GV đã bấm chốt)
window.showPendingSaleConfirm = async function () {
    try {
        const brId = currentBranchId || currentUserBranchId;
        if (!brId) return alert('⚠️ Chưa chọn cơ sở!');

        // Query HV cơ sở hiện tại, đã được GV chốt lương (có salarySubmittedMonth), chưa saleConfirmed
        const snap = await db.collection('students')
            .where('branchId', '==', brId)
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

        // Lưu pending count ban đầu để cập nhật counter
        window._salePendingCount = pending.length;
        window._updatePendingCounter = function(delta) {
            window._salePendingCount += delta;
            const ctr = document.getElementById('sale-pend-counter');
            if (ctr) ctr.textContent = `📋 HV chờ xác nhận (${Math.max(0, window._salePendingCount)})`;
        };

        let listHtml = '';
        pending.forEach(p => {
            const eName = p.name.replace(/'/g, "\\'");
            listHtml += `
                <div id="sale-pend-${p.id}" style="display:flex; align-items:center; gap:8px; padding:12px; background:var(--bg-color); border-radius:10px; margin-bottom:8px; border:1px solid var(--border-color); transition: all 0.3s ease;">
                    <div style="flex:1;">
                        <div style="font-weight:600; color:var(--text-color);">${p.name}</div>
                        <div style="font-size:11px; color:var(--text-muted);">GV: ${p.teacherName} · ${p.sessions}/${p.total} buổi · ${p.salaryMonth}</div>
                    </div>
                    <div style="display:flex; gap:6px; flex-shrink:0;">
                        <button onclick="saleConfirmStudent('${p.id}', '${eName}')" style="padding:5px 10px; border-radius:6px; border:none; background:#10b981; color:#fff; font-weight:600; cursor:pointer; font-size:11px;">✅ XN</button>
                        <button onclick="saleRejectStudent('${p.id}', '${eName}', '${p.teacherId}')" style="padding:5px 10px; border-radius:6px; border:none; background:#ef4444; color:#fff; font-weight:600; cursor:pointer; font-size:11px;">❌ Từ chối</button>
                    </div>
                </div>`;
        });

        overlay.innerHTML = `
            <div style="background:var(--card-bg); border-radius:16px; padding:20px; max-width:450px; width:100%; max-height:80vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h3 id="sale-pend-counter" style="margin:0; font-size:16px; color:var(--text-color);">📋 HV chờ xác nhận (${pending.length})</h3>
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
// Không dùng confirm()/alert() để tránh nhảy trang trên mobile
window.saleRejectStudent = async function (studentId, studentName, teacherId) {
    const row = document.getElementById('sale-pend-' + studentId);
    if (!row) return;
    // Disable buttons ngay lập tức
    row.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
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
        const branchName = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || '';
        const saleName = currentUserDisplayName || 'Sale';
        if (teacherId) {
            sendNotification(teacherId, 'salary', `❌ Sale "${saleName}" đã từ chối xác nhận chốt lương HV "${studentName}" tại ${branchName}. Vui lòng kiểm tra lại.`);
        }

        // Cập nhật inline — không dùng alert()
        row.style.borderColor = '#ef4444';
        row.style.background = 'rgba(239,68,68,0.08)';
        row.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:600; color:var(--text-color);">${studentName}</div>
                <div style="font-size:11px; color:#ef4444; font-weight:600; margin-top:2px;">❌ Đã từ chối · GV sẽ nhận thông báo</div>
            </div>
            <div style="font-size:18px;">❌</div>`;
        // Cập nhật counter trong header
        _updatePendingCounter(-1);
    } catch (e) {
        row.querySelectorAll('button').forEach(b => { b.disabled = false; b.style.opacity = '1'; });
        row.style.borderColor = '#ef4444';
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'font-size:10px; color:#ef4444; margin-top:4px;';
        errDiv.textContent = '❌ Lỗi: ' + e.message;
        row.querySelector('div').appendChild(errDiv);
    }
};

// GV xem danh sách HV điểm danh hôm nay
