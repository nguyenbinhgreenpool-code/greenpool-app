// ===================== MODULE GIÁO VIÊN ===================== //
// Tách từ app.js ngày 2026-04-15
// Functions: renderTeacherStudents, editStudentInfo, transferStudent, 
//            uploadCompletionVideo, deleteStudent, cleanupExpiredVideos
// Dependencies: localState, db, currentUserId, currentUserRole, 
//               currentUserDisplayName, FIXED_BRANCHES, storage,
//               filterByDate, sendNotification, isDivingCurriculum,
//               renderDateFilterBar, syncToGoogleSheet
// ============================================================ //

let teacherSearchQuery = '';
let teacherFilterMode = 'all';

window.renderTeacherStudents = function renderTeacherStudents() {
    const list = document.getElementById('teacher-students-list');
    const statsBox = document.getElementById('teacher-stats-summary');
    let teacherId = document.getElementById('select-teacher-view').value;

    // NẾU TÀI KHOẢN HIỆN TẠI LÀ HLV -> Khóa luôn teacherId = currentUserId
    if (currentUserRole === 'TEACHER') {
        teacherId = currentUserId;
    }

    list.innerHTML = '';
    if (statsBox) statsBox.innerHTML = '';

    // Render thông tin giáo viên được chọn (chỉ cho ADMIN/SALE)
    const teacherCard = document.getElementById('teacher-profile-card');
    if (teacherCard) {
        const selectedTeacher = localState.teachers.find(t => t.id === teacherId);
        if (selectedTeacher && currentUserRole !== 'TEACHER') {
            teacherCard.style.display = 'block';
            const avatarEl = document.getElementById('teacher-card-avatar');
            const nameEl = document.getElementById('teacher-card-name');
            const emailEl = document.getElementById('teacher-card-email');
            const detailsEl = document.getElementById('teacher-card-details');
            if (avatarEl) {
                avatarEl.innerHTML = selectedTeacher.avatarUrl
                    ? `<img src="${selectedTeacher.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`
                    : (selectedTeacher.name || 'G').charAt(0).toUpperCase();
            }
            if (nameEl) {
                // Tìm tất cả vị trí (slot numbers cố định) của GV này trong fixedOrder
                const fo = localState.fixedOrder;
                const slotNums = localState.fixedSlotNumbers;
                let slotLabels = [];
                for (let qi = 0; qi < fo.length; qi++) {
                    if (fo[qi] === selectedTeacher.id) {
                        slotLabels.push(slotNums[qi] || (qi + 1));
                    }
                }
                const posLabel = slotLabels.length > 0 ? `#${slotLabels.join(', #')} ` : '';
                nameEl.textContent = posLabel + (selectedTeacher.name || '');
            }
            if (emailEl) emailEl.textContent = selectedTeacher.email || '';
            if (detailsEl) {
                let badges = '';
                const branchName = FIXED_BRANCHES.find(b => b.id === selectedTeacher.branchId)?.name || '';
                if (branchName) badges += `<span style="background:rgba(37,99,235,0.1); color:var(--primary); padding:3px 8px; border-radius:12px;">📍 ${branchName}</span>`;
                badges += `<span style="background:rgba(37,99,235,0.1); color:var(--primary); padding:3px 8px; border-radius:12px;">🎫 ${selectedTeacher.teacherType || 'Chính'}</span>`;
                // Hiển thị vị trí hiện tại trong queue (slot gần nhất)
                const posInQueue = localState.fixedOrder.indexOf(selectedTeacher.id);
                const ciPos = localState.currentIndex || 0;
                if (posInQueue !== -1) {
                    const distFromCurrent = (posInQueue - ciPos + localState.fixedOrder.length) % localState.fixedOrder.length;
                    badges += `<span style="background:rgba(139,92,246,0.1); color:#7c3aed; padding:3px 8px; border-radius:12px;">🔢 Vị trí: ${distFromCurrent === 0 ? 'TOP 1' : `cách ${distFromCurrent} lượt`}</span>`;
                }
                if (selectedTeacher.phone) badges += `<span style="background:rgba(16,185,129,0.1); color:var(--secondary); padding:3px 8px; border-radius:12px;">📱 ${selectedTeacher.phone}</span>`;
                if (selectedTeacher.qualification) badges += `<span style="background:rgba(245,158,11,0.1); color:#d97706; padding:3px 8px; border-radius:12px;">🎓 ${selectedTeacher.qualification}</span>`;
                if (selectedTeacher.experience) badges += `<span style="background:rgba(139,92,246,0.1); color:#7c3aed; padding:3px 8px; border-radius:12px;">⏱️ ${selectedTeacher.experience} năm KN</span>`;
                detailsEl.innerHTML = badges;
            }
        } else {
            teacherCard.style.display = 'none';
        }
    }

    if (!teacherId || localState.teachers.length === 0) return;

    const allStudents = filterByDate(localState.students.filter(s => s.assignedTeacherId === teacherId));

    // Thống kê nhanh
    const totalCount = allStudents.length;
    const activeCount = allStudents.filter(s => s.sessions < (s.totalSessions || 10)).length;
    const doneCount = allStudents.filter(s => s.sessions >= (s.totalSessions || 10)).length;

    if (statsBox) {
        statsBox.innerHTML = renderDateFilterBar() + `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px;">
            <div style="text-align: center; padding: 10px; background: rgba(37,99,235,0.08); border-radius: 8px; border: 1px solid rgba(37,99,235,0.15);">
                <div style="font-size: 20px; font-weight: 700; color: var(--primary);">${totalCount}</div>
                <div style="font-size: 11px; color: var(--text-muted);">Tổng HV</div>
            </div>
            <div style="text-align: center; padding: 10px; background: rgba(16,185,129,0.08); border-radius: 8px; border: 1px solid rgba(16,185,129,0.15);">
                <div style="font-size: 20px; font-weight: 700; color: #10b981;">${activeCount}</div>
                <div style="font-size: 11px; color: var(--text-muted);">Đang học</div>
            </div>
            <div style="text-align: center; padding: 10px; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.15);">
                <div style="font-size: 20px; font-weight: 700; color: #ef4444;">${doneCount}</div>
                <div style="font-size: 11px; color: var(--text-muted);">Hoàn thành</div>
            </div>
            </div>
        `;
    }

    if (totalCount === 0) {
        list.innerHTML = `<div class="empty-state" style="text-align:center; padding:20px; color:var(--text-muted);">Chưa có học viên nào.</div>`;
        return;
    }

    // Lọc theo trạng thái
    let filtered = allStudents;
    if (teacherFilterMode === 'active') {
        filtered = filtered.filter(s => s.sessions < (s.totalSessions || 10));
    } else if (teacherFilterMode === 'done') {
        filtered = filtered.filter(s => s.sessions >= (s.totalSessions || 10));
    } else if (teacherFilterMode === 'self') {
        filtered = filtered.filter(s => s.source === 'Self');
    } else if (teacherFilterMode === 'test') {
        filtered = filtered.filter(s => s.isTestStudent === true);
    } else if (teacherFilterMode === 'zero') {
        filtered = filtered.filter(s => (s.sessions || 0) === 0);
    }

    // Lọc theo tên tìm kiếm
    if (teacherSearchQuery) {
        const q = teacherSearchQuery.toLowerCase();
        filtered = filtered.filter(s => s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q)));
    }

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Không tìm thấy học viên phù hợp.</div>`;
        return;
    }

    // Build lookup map: userId -> userName (Sale)
    const saleMap = {};
    localState.sales.forEach(s => { saleMap[s.id] = s.name; });
    localState.teachers.forEach(t => { if (!saleMap[t.id]) saleMap[t.id] = t.name; });
    // Giữ tên người đã bị đuổi việc
    localState.firedUsers.forEach(u => { if (!saleMap[u.id]) saleMap[u.id] = u.name + ' (nghỉ)'; });

    // Render compact rows
    let htmlParts = '';
    filtered.forEach(st => {
        const total = st.totalSessions || 10;
        const percent = Math.min((st.sessions / total) * 100, 100);
        const isDone = st.sessions >= total;
        const curType = st.curriculum || 'Bơi Ếch';
        const hideProgressBtn = (curType === 'Bơi Ngửa' || curType === 'Bơi Bướm' || curType === 'PT');
        const maxSteps = (curType === 'Bơi Ếch' || curType === 'Bơi Sải' || curType === 'Ếch Vip' || curType === 'Sải Vip') ? 6 : 0;
        const currentStep = st.currentStep || 0;
        let stepText = currentStep ? `B${currentStep}` : '';
        const progressColor = isDone ? '#ef4444' : '#3b82f6';
        const statusDot = isDone ? '🔴' : '🟢';
        const saleName = st.creatorId ? (saleMap[st.creatorId] || 'Sale ẩn') : '';
        const contractNum = st.contractNumber || '';
        // Điều kiện chốt lương: Bơi ≥7 buổi, Dolphin 1 ≥3/4, Dolphin 2 ≥4/5, Lặn khác ≥ tổng-1
        let canConfirmSalary = st.sessions >= 7;
        if (isDivingCurriculum(curType)) {
            if (curType === 'Dolphin 1') canConfirmSalary = st.sessions >= 3;
            else if (curType === 'Dolphin 2') canConfirmSalary = st.sessions >= 4;
            else canConfirmSalary = st.sessions >= (total - 1);
        }
        const isSalaryConfirmed = st.salaryConfirmed || false;
        const saleOk = st.saleConfirmed === true;
        const salaryMonth = st.salarySubmittedMonth || '';

        // Format ngày giờ điền HĐ
        let createdDateStr = '';
        if (st.createdAt) {
            const d = st.createdAt.toDate ? st.createdAt.toDate() : new Date(st.createdAt);
            createdDateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }

        // Dòng ngang gọn: Tên HV (Sale) Số HĐ
        htmlParts += `
            <div class="student-compact-row" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--card-bg); border: 1px solid ${isSalaryConfirmed ? 'rgba(16,185,129,0.3)' : (isDone ? 'rgba(239,68,68,0.2)' : 'var(--border-color)')}; border-radius: 8px; cursor: pointer; transition: all 0.2s; ${isDone && !isSalaryConfirmed ? 'opacity:0.7;' : ''} ${isSalaryConfirmed ? 'background: rgba(16,185,129,0.05);' : ''}" 
                 onclick="var act = this.nextElementSibling; if(act && act.classList.contains('compact-details')) act.classList.toggle('expanded');">
                
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                        <span style="font-size: 11px;">${isSalaryConfirmed ? '✅' : statusDot}</span>
                        <span style="font-weight: 600; font-size: 14px;">${st.name}</span>
                        ${st.transferredFrom ? `<span style="font-size: 10px; background: rgba(245,158,11,0.15); color: #d97706; padding: 1px 6px; border-radius: 10px; font-weight: 600;">🔄 CN</span>` : ''}
                        ${st.isUpgrade ? `<span style="font-size: 10px; background: rgba(16,185,129,0.15); color: #059669; padding: 1px 6px; border-radius: 10px; font-weight: 600;">⬆️ NC</span>` : ''}
                        ${saleName ? `<span style="font-size: 11px; color: var(--text-muted);">(${saleName})</span>` : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px; flex-wrap: wrap;">
                        ${contractNum && contractNum !== 'Chưa có' ? `<span style="font-size: 11px; color: #8b5cf6; font-weight: 500;">HĐ: ${contractNum}</span>` : ''}
                        <span style="font-size: 11px; color: #f59e0b;">${curType}</span>
                        ${stepText ? `<span style="font-size: 10px; background: rgba(37,99,235,0.1); color: var(--primary); padding: 1px 5px; border-radius: 3px; font-weight: 600;">${stepText}</span>` : ''}
                        ${saleOk ? `<span style="font-size: 10px; background: rgba(16,185,129,0.1); color: #10b981; padding: 1px 5px; border-radius: 3px; font-weight: 600;">✅ Sale XN</span>` : ''}
                        ${salaryMonth ? `<span style="font-size: 10px; background: rgba(245,158,11,0.1); color: #d97706; padding: 1px 5px; border-radius: 3px; font-weight: 600;">💰 Đã chốt T${salaryMonth.split('-')[1]}</span>` : ''}
                        ${createdDateStr ? `<span style="font-size: 10px; color: var(--text-muted);"><i class="fa-regular fa-calendar"></i> ${createdDateStr}</span>` : ''}
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <div style="width: 50px; height: 5px; background: rgba(0,0,0,0.1); border-radius: 3px; overflow: hidden;">
                        <div style="width: ${percent}%; height: 100%; background: ${progressColor};"></div>
                    </div>
                    <span style="font-size: 12px; font-weight: 600; color: ${isDone ? '#ef4444' : 'var(--text-color)'}; min-width: 35px; text-align: right;">${st.sessions}/${total}</span>
                </div>
            </div>

            <div class="compact-details" style="display: none; padding: 12px 14px; background: rgba(0,0,0,0.02); border: 1px solid var(--border-color); border-top: none; border-radius: 0 0 8px 8px; margin-top: -2px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; margin-bottom: 10px;">
                    <div><span style="color: var(--text-muted);">Giới tính:</span> <strong>${st.gender || 'Chưa rõ'}</strong></div>
                    <div><span style="color: var(--text-muted);">Độ tuổi:</span> <strong>${st.ageCategory || 'Chưa rõ'}</strong></div>
                    <div><span style="color: var(--text-muted);">SĐT:</span> <strong>${st.phone || 'Không có'}</strong></div>
                    <div><span style="color: var(--text-muted);">Nguồn:</span> <strong>${st.source === 'Sale' ? '💼 Qua Sale' : '🏊 GV Tự tuyển'}</strong></div>
                    <div><span style="color: var(--text-muted);">Kiểu bơi:</span> <strong style="color: #f59e0b;">${curType}</strong></div>
                    <div><span style="color: var(--text-muted);">Số buổi:</span> <strong>${st.sessions} / ${total}</strong></div>
                    ${maxSteps > 0 ? `<div style="grid-column: 1/-1;"><span style="color: var(--text-muted);">Tiến trình:</span> <strong style="color: var(--primary);">Bước ${currentStep} / ${maxSteps}</strong></div>` : ''}
                    ${contractNum && contractNum !== 'Chưa có' ? `<div style="grid-column: 1/-1;"><span style="color: var(--text-muted);">Hợp đồng:</span> <strong style="color: #8b5cf6;">${contractNum}</strong></div>` : ''}
                    ${saleName ? `<div style="grid-column: 1/-1;"><span style="color: var(--text-muted);">Sale nhập HĐ:</span> <strong>${saleName}</strong></div>` : ''}
                    ${createdDateStr ? `<div style="grid-column: 1/-1;"><span style="color: var(--text-muted);">Ngày điền HĐ:</span> <strong style="color: var(--primary);">${createdDateStr}</strong></div>` : ''}
                    ${st.transferredFrom ? `<div style="grid-column: 1/-1;"><span style="color: var(--text-muted);">🔄 Chuyển từ:</span> <strong style="color: #d97706;">${st.transferredByName || 'GV khác'}</strong></div>` : ''}
                    ${st.source === 'Self' ? `<div style="grid-column: 1/-1;"><span style="color: var(--text-muted);">📋 Lý do tự tuyển:</span> <strong style="color: #10b981;">${st.selfRecruitReason || 'Chưa ghi nhận'}</strong></div>` : ''}
                    ${st.customerReview ? `<div style="grid-column: 1/-1; background: rgba(245,158,11,0.08); padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(245,158,11,0.15); margin-top: 4px;">
                        <span style="color: #d97706; font-weight: 600;"><i class="fa-solid fa-star"></i> Nhận xét KH:</span>
                        <div style="color: var(--text-color); margin-top: 2px;">${st.customerReview}</div>
                    </div>` : ''}
                </div>

                <div style="margin-bottom: 8px;">
                    <button class="btn btn-sm" onclick="event.stopPropagation(); showAttendanceHistory('${st.id}', this)" style="background: rgba(99,102,241,0.1); color: #6366f1; font-size: 11px; padding: 4px 10px; border: 1px solid rgba(99,102,241,0.25);">
                        <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử điểm danh
                    </button>
                    <div id="att-history-${st.id}" style="display:none; margin-top:8px;"></div>
                </div>

                ${maxSteps > 0 ? `
                <div style="display: flex; gap: 4px; margin-bottom: 10px;">
                    ${Array.from({ length: maxSteps }, (_, i) => `
                        <div style="flex: 1; height: 6px; border-radius: 3px; background: ${i < currentStep ? '#10b981' : 'rgba(0,0,0,0.1)'};"></div>
                    `).join('')}
                </div>
                ` : ''}

                ${currentUserRole === 'TEACHER' ? `
                <div style="display: flex; gap: 8px; flex-wrap: wrap; border-top: 1px dashed var(--border-color); padding-top: 10px;">
                    ${!hideProgressBtn ? `
                    <button class="btn btn-sm" onclick="event.stopPropagation(); openCurriculumModal('${st.id}', '${st.name}', '${curType}', ${currentStep})" style="background: rgba(37,99,235,0.1); color: var(--primary); font-size: 12px; padding: 5px 12px; border: none;">
                        <i class="fa-solid fa-book-open"></i> Giáo Án
                    </button>
                    ` : ''}
                    ${canConfirmSalary && !isSalaryConfirmed && !salaryMonth ? `
                    <button class="btn btn-sm" onclick="event.stopPropagation(); confirmSalary('${st.id}', '${st.name}')" style="background: rgba(16,185,129,0.15); color: #059669; font-size: 12px; padding: 5px 12px; border: 1px solid rgba(16,185,129,0.3); font-weight: 600;">
                        <i class="fa-solid fa-money-check-dollar"></i> Chốt Lương
                    </button>
                    ` : ''}
                    ${(isSalaryConfirmed || salaryMonth) && !saleOk ? `
                    <span style="font-size: 12px; color: #f59e0b; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-hourglass-half"></i> Chờ Sale xác nhận
                    </span>
                    ` : ''}
                    ${saleOk ? `
                    <span style="font-size: 12px; color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-circle-check"></i> Đã chốt lương
                    </span>
                    ` : ''}
                </div>
                ` : ''}

                ${(currentUserRole === 'TEACHER' || currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') ? `
                <div style="display: flex; gap: 8px; flex-wrap: wrap; border-top: 1px dashed var(--border-color); padding-top: 10px; margin-top: ${currentUserRole === 'TEACHER' ? '8' : '0'}px;">
                    <button class="btn btn-sm" onclick="event.stopPropagation(); transferStudent('${st.id}', '${st.name.replace(/'/g, "\\'")}', '${teacherId}')" style="background: rgba(245,158,11,0.1); color: #d97706; font-size: 12px; padding: 5px 12px; border: 1px solid rgba(245,158,11,0.25);">
                        <i class="fa-solid fa-right-left"></i> Chuyển GV
                    </button>
                    <button class="btn btn-sm" onclick="event.stopPropagation(); editStudentInfo('${st.id}')" style="background: rgba(37,99,235,0.1); color: var(--primary); font-size: 12px; padding: 5px 12px; border: 1px solid rgba(37,99,235,0.25);">
                        <i class="fa-solid fa-pen-to-square"></i> Bổ sung TT
                    </button>
                    ${(maxSteps > 0 ? currentStep >= maxSteps : (curType === 'PT' ? true : st.sessions >= 7)) ? `
                    <button class="btn btn-sm" onclick="event.stopPropagation(); uploadCompletionVideo('${st.id}', '${st.name.replace(/'/g, "\\'")}')" style="background: rgba(139,92,246,0.1); color: #7c3aed; font-size: 12px; padding: 5px 12px; border: 1px solid rgba(139,92,246,0.25);">
                        <i class="fa-solid fa-video"></i> ${st.completionVideoUrl ? '🎬 Đổi Video' : '📹 Upload Video KT'}
                    </button>
                    ` : ''}
                    ${st.completionVideoUrl ? `
                    <a href="${st.completionVideoUrl}" target="_blank" onclick="event.stopPropagation();" style="font-size: 12px; padding: 5px 12px; color: #7c3aed; text-decoration: none; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-play-circle"></i> Xem video
                    </a>
                    ` : ''}
                    ${(currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') ? `
                    <button class="btn btn-sm" onclick="event.stopPropagation(); deleteStudent('${st.id}', '${st.name.replace(/'/g, "\'")}'  , '${st.assignedTeacherId || ''}')" style="background: rgba(239,68,68,0.1); color: #ef4444; font-size: 12px; padding: 5px 12px; border: 1px solid rgba(239,68,68,0.25);">
                        <i class="fa-solid fa-trash"></i> Xóa HV
                    </button>
                    ` : ''}
                </div>
                ` : ''}

                ${currentUserRole === 'SALE' && isDone && !saleOk ? `
                <div style="border-top: 1px dashed var(--border-color); padding-top: 10px; margin-top: 8px;">
                    <button class="btn btn-sm" onclick="event.stopPropagation(); saleConfirmStudent('${st.id}', '${st.name.replace(/'/g, "\\'")}')" style="background: rgba(16,185,129,0.15); color: #059669; font-size: 12px; padding: 5px 12px; border: 1px solid rgba(16,185,129,0.3); font-weight: 600;">
                        <i class="fa-solid fa-circle-check"></i> Xác nhận HĐ
                    </button>
                </div>
                ` : ''}
            </div>
        `;
    });
    list.innerHTML = htmlParts;
};
// Bổ sung/sửa thông tin HV
// Xem lịch sử điểm danh của HV
window.showAttendanceHistory = async function (studentId, btnEl) {
    const container = document.getElementById('att-history-' + studentId);
    if (!container) return;
    if (container.style.display !== 'none') {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    container.innerHTML = '<div style="text-align:center; padding:8px; color:var(--text-muted); font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';
    try {
        const attSnap = await db.collection('attendance')
            .where('studentId', '==', studentId)
            .get();
        const attDocs = attSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
                const ta = (a.createdAt || a.timestamp)?.toDate ? (a.createdAt || a.timestamp).toDate().getTime() : 0;
                const tb = (b.createdAt || b.timestamp)?.toDate ? (b.createdAt || b.timestamp).toDate().getTime() : 0;
                return tb - ta;
            })
            .slice(0, 30);
        if (attDocs.length === 0) {
            container.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:6px;">Chưa có lịch sử điểm danh.</div>';
            return;
        }
        let html = '<div style="font-size:12px; font-weight:600; color:var(--text-color); margin-bottom:6px;"><i class="fa-solid fa-clock-rotate-left"></i> Lịch sử điểm danh (gần nhất):</div>';
        html += '<div style="max-height:200px; overflow-y:auto; border:1px solid var(--border-color); border-radius:8px;">';
        html += '<table style="width:100%; border-collapse:collapse; font-size:11px;">';
        html += `<thead><tr style="background:rgba(37,99,235,0.05);"><th style="padding:5px 8px; text-align:left;">Ngày giờ</th><th style="padding:5px 8px; text-align:left;">Người ĐD</th><th style="padding:5px 8px; text-align:center;">Buổi</th>${currentUserRole === 'ADMIN' ? '<th style="padding:5px 8px; text-align:center;">Xoá</th>' : ''}</tr></thead><tbody>`;
        let rowNum = 0;
        attDocs.forEach(d => {
            const rawTs = d.createdAt || d.timestamp;
            const ts = rawTs?.toDate ? rawTs.toDate() : (rawTs ? new Date(rawTs) : null);
            const dateStr = ts ? ts.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' }) : '?';
            const timeStr = ts ? ts.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' }) : '';
            const marker = d.checkedByName || d.markedByName || d.teacherName || '—';
            rowNum++;
            html += `<tr style="border-top:1px solid var(--border-color); ${rowNum % 2 === 0 ? 'background:rgba(0,0,0,0.02);' : ''}">
                <td style="padding:4px 8px;">${dateStr} ${timeStr}</td>
                <td style="padding:4px 8px;">${marker}</td>
                <td style="padding:4px 8px; text-align:center;">${d.sessionNumber || rowNum}</td>
                ${currentUserRole === 'ADMIN' ? `<td style="padding:4px 8px; text-align:center;">
                    <button onclick="event.stopPropagation(); deleteAttendanceRecord('${d.id}', '${studentId}', '${dateStr} ${timeStr}', ${d.sessionNumber || rowNum})"
                        style="border:none; background:rgba(239,68,68,0.1); color:#ef4444; cursor:pointer; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600;"
                        title="Xoá buổi điểm danh này">🗑</button>
                </td>` : ''}
            </tr>`;
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<div style="font-size:11px; color:#ef4444; padding:6px;">Lỗi: ${e.message}</div>`;
    }
};

// Xoá 1 record điểm danh (chỉ ADMIN)
window.deleteAttendanceRecord = async function (attDocId, studentId, dateTimeStr, sessionNum) {
    if (currentUserRole !== 'ADMIN') return alert('Chỉ Admin mới được xoá!');
    if (!confirm(`⚠️ XÁC NHẬN XOÁ BUỔI ĐIỂM DANH\n\n🗓 Ngày: ${dateTimeStr}\n📌 Buổi số: ${sessionNum}\n\nĐiều này sẽ:\n• Xoá record điểm danh\n• Trừ 1 buổi học cho HV\n\nBạn chắc chắn?`)) return;

    try {
        await db.collection('attendance').doc(attDocId).delete();

        const stDoc = await db.collection('students').doc(studentId).get();
        if (stDoc.exists) {
            const currentSessions = stDoc.data().sessions || 0;
            await db.collection('students').doc(studentId).update({
                sessions: Math.max(0, currentSessions - 1)
            });
        }

        alert(`✅ Đã xoá buổi điểm danh ngày ${dateTimeStr}!\nSố buổi đã được cập nhật.`);

        // Re-sync toàn bộ điểm danh cho HV này lên Sheet (rebuild cột)
        try {
            const stuSync = await db.collection('students').doc(studentId).get();
            const stuData = stuSync.exists ? stuSync.data() : {};
            if (stuData.contractNumber) {
                const brName = FIXED_BRANCHES.find(b => b.id === stuData.branchId)?.name || 'Khác';
                const attRecords = await db.collection('attendance').where('studentId', '==', studentId).get();
                const dates = attRecords.docs
                    .map(d => ({ ts: d.data().createdAt?.toDate?.()?.getTime() || 0, date: d.data().createdAt?.toDate?.()?.toLocaleDateString('vi-VN') || '' }))
                    .sort((a, b) => a.ts - b.ts)
                    .map(r => r.date);
                // Xoá cột cũ rồi ghi lại
                const totalSessions = stuData.totalSessions || 10;
                const allDates = [...dates];
                for (let i = dates.length; i < totalSessions; i++) allDates.push(''); // xoá cột thừa
                syncToGoogleSheet({
                    action: 'syncAttendanceBulk',
                    branchName: brName,
                    contractNumber: stuData.contractNumber,
                    dates: allDates
                });
            }
        } catch (e) { console.warn('Sheet delete sync error:', e); }

        const container = document.getElementById('att-history-' + studentId);
        if (container) {
            container.style.display = 'none';
            showAttendanceHistory(studentId);
        }
        if (typeof renderManageStudents === 'function') renderManageStudents();
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

window.editStudentInfo = async function (studentId) {
    const st = localState.students.find(s => s.id === studentId);
    if (!st) return alert('Không tìm thấy học viên!');

    const isAdmin = currentUserRole === 'ADMIN';
    const isManager = currentUserRole === 'MANAGER';
    const isSale = currentUserRole === 'SALE';
    const updates = {};
    const hasFullEditRight = isAdmin || isManager;

    // 1. Tên HV - Admin và Manager
    if (hasFullEditRight) {
        const name = prompt(`📝 Tên hiện tại: ${st.name}\nNhập tên mới (bỏ trống = giữ nguyên):`, st.name || '');
        if (name === null) return;
        if (name.trim() && name.trim() !== st.name) updates.name = name.trim();
    }

    // 2. Số HĐ - Admin và Manager
    if (hasFullEditRight) {
        const contract = prompt(`📄 Số HĐ hiện tại: ${st.contractNumber || 'Chưa có'}\nNhập số HĐ mới (bỏ trống = giữ nguyên):`, st.contractNumber || '');
        if (contract === null) return;
        if (contract.trim() && contract.trim() !== st.contractNumber) updates.contractNumber = contract.trim();
    }

    // 3. SĐT - tất cả
    const phone = prompt(`📱 SĐT hiện tại: ${st.phone || 'Chưa có'}\nNhập SĐT mới (bỏ trống = giữ nguyên):`, st.phone || '');
    if (phone === null) return;
    if (phone.trim()) updates.phone = phone.trim();

    // 4. Giới tính - tất cả
    const gender = prompt(`👤 Giới tính hiện tại: ${st.gender || 'Nam'}\nNhập: Nam / Nữ (bỏ trống = giữ nguyên):`, st.gender || 'Nam');
    if (gender === null) return;
    if (gender.trim() && (gender.trim() === 'Nam' || gender.trim() === 'Nữ')) updates.gender = gender.trim();

    // 5. Kiểu bơi - Admin + Sale + Manager
    if (isAdmin || isSale || isManager) {
        const curTypes = ['Bơi Ếch', 'Bơi Sải', 'Ếch Vip', 'Sải Vip', 'Bơi Ngửa', 'Bơi Bướm', 'PT'];
        const curriculum = prompt(`🏊 Kiểu bơi hiện tại: ${st.curriculum || 'Bơi Ếch'}\nChọn: ${curTypes.join(' / ')}\n(bỏ trống = giữ nguyên):`, st.curriculum || 'Bơi Ếch');
        if (curriculum === null) return;
        if (curriculum.trim() && curTypes.includes(curriculum.trim())) updates.curriculum = curriculum.trim();
    }

    // 6. Nhóm tuổi - Admin + Sale + Manager
    if (isAdmin || isSale || isManager) {
        const ageCategory = prompt(`👶 Nhóm tuổi hiện tại: ${st.ageCategory || 'Trẻ em'}\nNhập: Trẻ em / Người lớn (bỏ trống = giữ nguyên):`, st.ageCategory || 'Trẻ em');
        if (ageCategory === null) return;
        if (ageCategory.trim() && (ageCategory.trim() === 'Trẻ em' || ageCategory.trim() === 'Người lớn')) updates.ageCategory = ageCategory.trim();
    }

    // 7. Số tuổi - tất cả
    const ageStr = prompt(`🎂 Số tuổi hiện tại: ${st.age || 'Chưa có'}\nNhập số tuổi (bỏ trống = giữ nguyên):`, st.age || '');
    if (ageStr === null) return;
    if (ageStr.trim() && parseInt(ageStr)) updates.age = parseInt(ageStr);

    // 8. Tổng số buổi + Số buổi đã học - Admin + Manager
    if (hasFullEditRight) {
        const totalStr = prompt(`📦 Tổng số buổi khoá học: ${st.totalSessions || 10}\nNhập tổng buổi mới (bỏ trống = giữ nguyên):`, st.totalSessions || 10);
        if (totalStr === null) return;
        const newTotal = parseInt(totalStr);
        if (!isNaN(newTotal) && newTotal > 0 && newTotal !== (st.totalSessions || 10)) {
            updates.totalSessions = newTotal;
        }

        const currentTotal = updates.totalSessions || st.totalSessions || 10;
        const sessStr = prompt(`📋 Số buổi đã học: ${st.sessions || 0} / ${currentTotal}\nNhập số buổi mới (bỏ trống = giữ nguyên):`, st.sessions || 0);
        if (sessStr === null) return;
        const newSess = parseInt(sessStr);
        if (!isNaN(newSess) && newSess >= 0 && newSess <= currentTotal && newSess !== st.sessions) {
            updates.sessions = newSess;
        } else if (!isNaN(newSess) && (newSess < 0 || newSess > currentTotal)) {
            alert(`⚠️ Số buổi phải từ 0 đến ${currentTotal}!`);
            return;
        }
    }

    if (Object.keys(updates).length === 0) return alert('Không có thay đổi nào.');

    try {
        await db.collection('students').doc(studentId).update(updates);

        // Nếu Admin trừ buổi → xoá bản ghi điểm danh gần nhất
        if (isAdmin && updates.sessions !== undefined && updates.sessions < (st.sessions || 0)) {
            const diff = (st.sessions || 0) - updates.sessions;
            try {
                const attSnap = await db.collection('attendance')
                    .where('studentId', '==', studentId)
                    .get();
                // Sort in JS
                const sortedDocs = attSnap.docs.sort((a, b) => {
                    const tA = a.data().createdAt?.toDate?.()?.getTime() || 0;
                    const tB = b.data().createdAt?.toDate?.()?.getTime() || 0;
                    return tB - tA;
                }).slice(0, diff);
                const batch = db.batch();
                sortedDocs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            } catch (attErr) {
                console.warn('Xoá attendance lỗi (có thể cần index):', attErr);
                // Fallback: query without orderBy
                try {
                    const fallback = await db.collection('attendance')
                        .where('studentId', '==', studentId)
                        .get();
                    const sorted = fallback.docs
                        .filter(d => d.data().createdAt)
                        .sort((a, b) => b.data().createdAt.toMillis() - a.data().createdAt.toMillis());
                    const batch2 = db.batch();
                    sorted.slice(0, diff).forEach(doc => batch2.delete(doc.ref));
                    await batch2.commit();
                } catch (e2) { console.warn('Fallback also failed:', e2); }
            }
        }

        // Auto sync lên Google Sheet (chỉ HV này)
        try {
            const updatedDoc = await db.collection('students').doc(studentId).get();
            const updatedSt = updatedDoc.data();
            const brName = FIXED_BRANCHES.find(b => b.id === (updatedSt.branchId || currentBranchId))?.name || 'Khác';
            const teacherObj = localState.teachers.find(t => t.id === updatedSt.assignedTeacherId);
            const saleMapLocal = {};
            localState.sales.forEach(s => { saleMapLocal[s.id] = s.name; });
            localState.teachers.forEach(t => { if (!saleMapLocal[t.id]) saleMapLocal[t.id] = t.name; });
            const saleName = updatedSt.saleConfirmedBy || (updatedSt.creatorId ? saleMapLocal[updatedSt.creatorId] : '') || '';
            const createdDate = updatedSt.createdAt?.toDate ? updatedSt.createdAt.toDate().toLocaleDateString('vi-VN') : '';
            syncToGoogleSheet({
                action: 'updateOrInsert',
                data: {
                    name: updatedSt.name || '',
                    phone: updatedSt.phone || '',
                    contractNumber: updatedSt.contractNumber || '',
                    swimType: updatedSt.curriculum || '',
                    ageGroup: updatedSt.ageCategory || '',
                    teacherName: teacherObj?.name || '',
                    saleName: saleName,
                    sessions: updatedSt.sessions || 0,
                    branchName: brName,
                    contractDate: createdDate
                }
            });
        } catch (syncErr) {
            console.warn('Sync Sheet sau edit:', syncErr);
        }

        alert('✅ Đã cập nhật thông tin!' + (updates.sessions !== undefined && updates.sessions < (st.sessions || 0) ? `\n📋 Đã xoá ${(st.sessions || 0) - updates.sessions} bản ghi điểm danh gần nhất.\n📤 Đã sync lên Sheet.` : '\n📤 Đã sync lên Sheet.'));
    } catch (e) {
        alert('Lỗi cập nhật: ' + e.message);
    }
};

// Xóa học viên (chỉ ADMIN)
window.deleteStudent = async function (studentId, studentName, teacherId) {
    if (!confirm(`⚠️ Xác nhận XÓA học viên "${studentName}"?\n\nHành động này không thể hoàn tác!`)) return;

    try {
        // Lấy data trước khi xóa
        const doc = await db.collection('students').doc(studentId).get();
        const data = doc.exists ? doc.data() : {};

        // Xóa video nếu có
        if (data.completionVideoUrl) {
            try {
                const fileRef = storage.refFromURL(data.completionVideoUrl);
                await fileRef.delete();
            } catch (e) { console.warn('Delete video:', e); }
        }

        // Xóa tất cả attendance records
        try {
            const attSnap = await db.collection('attendance').where('studentId', '==', studentId).get();
            const batch = db.batch();
            attSnap.docs.forEach(d => batch.delete(d.ref));
            if (attSnap.size > 0) await batch.commit();
        } catch (e) { console.warn('Delete attendance:', e); }

        // Xóa student doc
        await db.collection('students').doc(studentId).delete();

        // Thông báo cho GV
        if (teacherId) {
            sendNotification(teacherId, 'system', `🗑️ Admin đã xóa học viên "${studentName}"${data.contractNumber ? ' (HĐ: ' + data.contractNumber + ')' : ''} khỏi danh sách của bạn.`);
        }

        // Thông báo cho Sale (nếu có)
        if (data.createdBy && data.createdBy !== teacherId) {
            sendNotification(data.createdBy, 'system', `🗑️ Admin đã xóa HĐ "${data.contractNumber || studentName}" khỏi hệ thống.`);
        }

        alert(`✅ Đã xóa học viên "${studentName}" và toàn bộ dữ liệu liên quan (điểm danh, video, HĐ)!`);
    } catch (err) {
        alert('❌ Lỗi: ' + err.message);
    }
};

// Chuyển nhượng học viên sang GV khác
window.transferStudent = async function (studentId, studentName, currentTeacherId) {
    // Lấy danh sách GV cùng cơ sở (trừ GV hiện tại)
    const otherTeachers = localState.teachers.filter(t => t.id !== currentTeacherId);
    if (otherTeachers.length === 0) {
        alert('Không có giáo viên khác trong cơ sở này để chuyển nhượng!');
        return;
    }

    // Tạo danh sách chọn
    let options = otherTeachers.map((t, i) => `${i + 1}. ${t.name} (${t.teacherType || 'Chính'})`).join('\n');
    const choice = prompt(`🔄 Chuyển nhượng HV: ${studentName}\n\nChọn giáo viên nhận (nhập số):\n${options}`);
    if (!choice) return;

    const idx = parseInt(choice) - 1;
    if (isNaN(idx) || idx < 0 || idx >= otherTeachers.length) {
        alert('Lựa chọn không hợp lệ!');
        return;
    }

    const newTeacher = otherTeachers[idx];
    const currentTeacher = localState.teachers.find(t => t.id === currentTeacherId);
    const fromName = currentTeacher ? currentTeacher.name : 'GV cũ';

    if (!confirm(`Xác nhận chuyển nhượng HV "${studentName}" từ ${fromName} ➜ ${newTeacher.name}?\n\nMọi thông tin, số buổi, tiến trình sẽ được giữ nguyên.`)) return;

    try {
        // Cập nhật student document
        await db.collection('students').doc(studentId).update({
            assignedTeacherId: newTeacher.id,
            transferredFrom: currentTeacherId,
            transferredByName: fromName,
            transferredAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Cập nhật TẤT CẢ attendance records sang GV mới
        let attUpdated = 0;
        try {
            const attSnap = await db.collection('attendance')
                .where('studentId', '==', studentId)
                .get();
            if (!attSnap.empty) {
                const batch = db.batch();
                attSnap.forEach(doc => {
                    batch.update(doc.ref, {
                        teacherId: newTeacher.id,
                        teacherName: newTeacher.name
                    });
                });
                await batch.commit();
                attUpdated = attSnap.size;
            }
        } catch (attErr) {
            console.warn('Lỗi cập nhật attendance khi chuyển GV:', attErr);
        }

        // Gửi thông báo cho GV nhận
        await db.collection('notifications').add({
            toUserId: newTeacher.id,
            type: 'transfer',
            message: `🔄 Bạn nhận chuyển nhượng HV "${studentName}" từ ${fromName}. Số buổi và tiến trình giữ nguyên.`,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Sync lên Google Sheet (cập nhật GV mới)
        try {
            const updatedDoc = await db.collection('students').doc(studentId).get();
            const updatedSt = updatedDoc.data();
            const brName = FIXED_BRANCHES.find(b => b.id === (updatedSt.branchId || currentBranchId))?.name || 'Khác';
            const saleMapLocal = {};
            localState.sales.forEach(s => { saleMapLocal[s.id] = s.name; });
            localState.teachers.forEach(t => { if (!saleMapLocal[t.id]) saleMapLocal[t.id] = t.name; });
            const saleName = updatedSt.saleConfirmedBy || (updatedSt.creatorId ? saleMapLocal[updatedSt.creatorId] : '') || '';
            const createdDate = updatedSt.createdAt?.toDate ? updatedSt.createdAt.toDate().toLocaleDateString('vi-VN') : '';
            syncToGoogleSheet({
                action: 'updateOrInsert',
                data: {
                    name: updatedSt.name || '',
                    phone: updatedSt.phone || '',
                    contractNumber: updatedSt.contractNumber || '',
                    swimType: updatedSt.curriculum || '',
                    ageGroup: updatedSt.ageCategory || '',
                    teacherName: newTeacher.name || '',
                    saleName: saleName,
                    sessions: updatedSt.sessions || 0,
                    branchName: brName,
                    contractDate: createdDate
                }
            });
        } catch (syncErr) { console.warn('Sheet sync transfer:', syncErr); }

        alert(`✅ Đã chuyển nhượng "${studentName}" cho ${newTeacher.name} thành công!${attUpdated > 0 ? `\n📋 Đã cập nhật ${attUpdated} bản ghi điểm danh` : ''}\n📤 Đã đồng bộ lên Sheet.`);
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

// ===================== UPLOAD VIDEO KẾT THÚC KHÓA HỌC ===================== //
window.uploadCompletionVideo = function (studentId, studentName) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file
        if (!file.type.startsWith('video/')) {
            alert('❌ Vui lòng chọn file video!');
            return;
        }
        if (file.size > 100 * 1024 * 1024) {
            alert('❌ Video quá lớn! Tối đa 100MB.\nGợi ý: Quay video 1-2 phút, chất lượng 720p.');
            return;
        }

        const confirmUpload = confirm(`📹 Upload video kết thúc khóa cho "${studentName}"?\n\nFile: ${file.name}\nDung lượng: ${(file.size / 1024 / 1024).toFixed(1)} MB`);
        if (!confirmUpload) return;

        // Tạo overlay progress
        const overlay = document.createElement('div');
        overlay.id = 'upload-overlay';
        overlay.innerHTML = `
            <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9999; display: flex; align-items: center; justify-content: center;">
                <div style="background: var(--card-bg); border-radius: 16px; padding: 30px 40px; text-align: center; min-width: 300px;">
                    <i class="fa-solid fa-cloud-arrow-up" style="font-size: 36px; color: #7c3aed; margin-bottom: 12px;"></i>
                    <div style="font-weight: 600; font-size: 16px; color: var(--text-color); margin-bottom: 8px;">Đang upload video...</div>
                    <div id="upload-progress-text" style="font-size: 14px; color: var(--text-muted); margin-bottom: 12px;">0%</div>
                    <div style="width: 100%; height: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden;">
                        <div id="upload-progress-bar" style="width: 0%; height: 100%; background: #7c3aed; transition: width 0.3s;"></div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        try {
            const ext = file.name.split('.').pop();
            const ref = storage.ref(`completion-videos/${studentId}.${ext}`);
            const uploadTask = ref.put(file);

            uploadTask.on('state_changed',
                (snapshot) => {
                    const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                    const bar = document.getElementById('upload-progress-bar');
                    const txt = document.getElementById('upload-progress-text');
                    if (bar) bar.style.width = pct + '%';
                    if (txt) txt.textContent = pct + '%';
                },
                (error) => {
                    overlay.remove();
                    alert('❌ Lỗi upload: ' + error.message);
                },
                async () => {
                    const downloadUrl = await uploadTask.snapshot.ref.getDownloadURL();
                    await db.collection('students').doc(studentId).update({
                        completionVideoUrl: downloadUrl,
                        videoUploadedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    overlay.remove();
                    alert('✅ Upload video thành công cho "' + studentName + '"!');
                }
            );
        } catch (err) {
            overlay.remove();
            alert('❌ Lỗi: ' + err.message);
        }
    };
    input.click();
};

// Tự động dọn video hết hạn (> 10 ngày)
window.cleanupExpiredVideos = async function cleanupExpiredVideos() {
    try {
        const snap = await db.collection('students').where('completionVideoUrl', '!=', '').get();
        const now = Date.now();
        const TEN_DAYS = 10 * 24 * 60 * 60 * 1000;

        for (const doc of snap.docs) {
            const data = doc.data();
            if (!data.completionVideoUrl || !data.videoUploadedAt) continue;
            const uploadTime = data.videoUploadedAt.toDate ? data.videoUploadedAt.toDate().getTime() : data.videoUploadedAt;
            if (now - uploadTime > TEN_DAYS) {
                // Xóa file trên Storage
                try {
                    const fileRef = storage.refFromURL(data.completionVideoUrl);
                    await fileRef.delete();
                } catch (e) { console.warn('Storage delete:', e); }
                // Xóa URL trong Firestore
                await db.collection('students').doc(doc.id).update({
                    completionVideoUrl: firebase.firestore.FieldValue.delete(),
                    videoUploadedAt: firebase.firestore.FieldValue.delete()
                });
                console.log('🗑️ Đã xóa video hết hạn:', data.name || doc.id);
            }
        }
    } catch (e) { console.warn('Cleanup expired videos:', e); }
};
// Cleanup video hết hạn sẽ được gọi sau khi auth hoàn tất (xem onAuthStateChanged)
