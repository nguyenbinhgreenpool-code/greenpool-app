// ===================== MODULE LỄ TÂN - ĐIỂM DANH ===================== //
// Tách từ app.js ngày 2026-04-15
// Functions: searchStudentForAttendance, markAttendance, cancelAttendance,
//            renderLetanManageTable, renderLetanHistory, renderLetanClbHistory
// Dependencies: localState, db, currentUserId, currentUserRole,
//               currentUserDisplayName, currentBranchId, FIXED_BRANCHES,
//               sendNotification, syncToGoogleSheet, renderManageStudents
// ==================================================================== //

// ===================== LỄ TÂN - ĐIỂM DANH ===================== //

// Tìm kiếm học viên cho điểm danh
window.searchStudentForAttendance = async function (query) {
    const container = document.getElementById('letan-results');
    if (!container) return;

    if (!query || query.trim().length < 2) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">
            <i class="fa-solid fa-magnifying-glass" style="font-size: 28px; display: block; margin-bottom: 10px;"></i>
            Nhập tên hoặc SĐT học viên để tìm kiếm
        </div>`;
        return;
    }

    const q = query.trim().toLowerCase();
    const results = localState.students.filter(s =>
        s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q)) || (s.contractNumber && s.contractNumber.toLowerCase().includes(q))
    );

    if (results.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">
            <i class="fa-solid fa-user-slash" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
            Không tìm thấy học viên "${query}"
        </div>`;
        return;
    }

    // Build teacher name lookup
    const teacherMap = {};
    localState.teachers.forEach(t => { teacherMap[t.id] = t.name; });

    // Lấy attendance 20 phút gần nhất để hiện nút Huỷ (cache 30 giây)
    const now = new Date();
    const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000);
    let recentAttMap = {}; // studentId -> { docId, time }
    try {
        const cacheKey = '_recentAttCache';
        const cached = window[cacheKey];
        let attDocs;
        if (cached && (Date.now() - cached.time) < 30000) {
            attDocs = cached.docs;
        } else {
            // Chỉ query 20 phút gần nhất (thay vì toàn bộ hôm nay!)
            const attSnap = await db.collection('attendance')
                .where('branchId', '==', currentBranchId)
                .where('createdAt', '>=', twentyMinAgo)
                .get();
            attDocs = [];
            attSnap.forEach(doc => attDocs.push({ id: doc.id, ...doc.data() }));
            window[cacheKey] = { docs: attDocs, time: Date.now() };
        }
        attDocs.forEach(d => {
            const t = d.createdAt?.toDate ? d.createdAt.toDate() : (d.createdAt ? new Date(d.createdAt) : null);
            if (t && t >= twentyMinAgo) {
                if (!recentAttMap[d.studentId] || t > recentAttMap[d.studentId].time) {
                    recentAttMap[d.studentId] = { docId: d.id, time: t, session: d.sessionNumber };
                }
            }
        });
    } catch (e) { console.warn('Recent att query:', e); }


    // Build sale name lookup (dùng localState, không query Firestore)
    const saleMap = {};
    (localState.teachers || []).forEach(u => { saleMap[u.id] = u.name || ''; });
    (localState.sales || []).forEach(u => { saleMap[u.id] = u.name || ''; });
    (localState.firedUsers || []).forEach(u => { saleMap[u.id] = u.name || ''; });

    container.innerHTML = results.map(st => {
        const total = st.totalSessions || 10;
        const percent = Math.min((st.sessions / total) * 100, 100);
        const isDone = st.sessions >= total;
        const teacherName = teacherMap[st.assignedTeacherId] || 'Chưa gán';
        const curType = st.curriculum || 'Bơi Ếch';
        const recent = recentAttMap[st.id];
        const canCancel = !!recent;
        const cancelRemain = canCancel ? Math.max(0, Math.ceil((recent.time.getTime() + 20 * 60 * 1000 - now.getTime()) / 60000)) : 0;
        const saleName = st.saleConfirmedBy || st.creatorName || (st.creatorId ? saleMap[st.creatorId] : '') || '';

        return `
        <div style="padding: 14px; background: var(--card-bg); border: 1px solid ${isDone ? 'rgba(239,68,68,0.2)' : 'var(--border-color)'}; border-radius: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="font-weight: 600; font-size: 15px;">${st.name}</span>
                        <span style="font-size: 11px; color: #f59e0b; font-weight: 500;">${curType}</span>
                        ${st.transferredFrom ? '<span style="font-size: 10px; background: rgba(245,158,11,0.15); color: #d97706; padding: 1px 5px; border-radius: 8px;">🔄 CN</span>' : ''}
                        ${isDivingCurriculum(curType) ? (st.waiverSigned
                            ? `<span onclick="viewSignedWaiver('${st.id}', '${st.name.replace(/'/g, "\\\\'")}')" style="font-size: 10px; background: rgba(16,185,129,0.15); color: #059669; padding: 1px 5px; border-radius: 8px; cursor:pointer;">✅ Đã ký CK</span>`
                            : '<span style="font-size: 10px; background: rgba(239,68,68,0.15); color: #dc2626; padding: 1px 5px; border-radius: 8px; font-weight:600;">❌ Chưa ký CK</span>')
                        : ''}
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">
                        <i class="fa-solid fa-person-swimming"></i> GV: <strong style="color: var(--primary);">${teacherName}</strong>
                        ${st.phone ? ` · <i class="fa-solid fa-phone"></i> ${st.phone}` : ''}
                        ${st.contractNumber ? ` · <i class="fa-solid fa-file-contract"></i> HĐ: ${st.contractNumber}` : ''}
                    </div>
                    ${saleName ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                        <i class="fa-solid fa-user-tie"></i> Sale: <strong>${saleName}</strong>
                    </div>` : ''}
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                        <div style="flex: 1; height: 6px; background: rgba(0,0,0,0.1); border-radius: 3px; overflow: hidden;">
                            <div style="width: ${percent}%; height: 100%; background: ${isDone ? '#ef4444' : '#3b82f6'};"></div>
                        </div>
                        <span style="font-size: 13px; font-weight: 600; color: ${isDone ? '#ef4444' : 'var(--text-color)'};">${st.sessions}/${total}</span>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-end;">
                    <button onclick="markAttendance('${st.id}', '${st.name.replace(/'/g, "\\'")}', ${st.sessions}, ${total}, '${st.assignedTeacherId}')" 
                        ${isDone ? 'disabled' : ''}
                        style="padding: 10px 16px; border-radius: 8px; border: none; cursor: ${isDone ? 'not-allowed' : 'pointer'}; font-weight: 600; font-size: 13px;
                        background: ${isDone ? 'rgba(0,0,0,0.1)' : 'rgba(139,92,246,0.15)'}; color: ${isDone ? 'var(--text-muted)' : '#8b5cf6'}; 
                        border: 1px solid ${isDone ? 'transparent' : 'rgba(139,92,246,0.3)'}; white-space: nowrap;">
                        <i class="fa-solid fa-clipboard-check"></i> ${isDone ? 'Hoàn thành' : 'Điểm danh'}
                    </button>
                    ${canCancel ? `
                    <button onclick="cancelAttendance('${st.id}', '${st.name.replace(/'/g, "\\'")}', '${recent.docId}', ${st.sessions})"
                        style="padding: 6px 12px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-size: 11px;
                        background: rgba(239,68,68,0.12); color: #ef4444; border: 1px solid rgba(239,68,68,0.25); white-space: nowrap;">
                        <i class="fa-solid fa-xmark"></i> Huỷ buổi học (${cancelRemain}p)
                    </button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
};

// Huỷ buổi học (trong 20 phút sau khi điểm danh)
window.cancelAttendance = async function (studentId, studentName, attDocId, currentSessions) {
    if (currentSessions <= 0) return alert('Học viên chưa điểm danh buổi nào!');
    if (!confirm(`⚠️ Huỷ buổi học cho "${studentName}"?\n\nSố buổi sẽ giảm từ ${currentSessions} → ${currentSessions - 1}.\nGiáo viên sẽ nhận thông báo.`)) return;

    try {
        // Xoá bản ghi điểm danh TRƯỚC
        await db.collection('attendance').doc(attDocId).delete();

        // Giảm 1 buổi (dùng increment thay vì đếm attendance để tránh reset HV nhập tay)
        await db.collection('students').doc(studentId).update({
            sessions: firebase.firestore.FieldValue.increment(-1)
        });
        const actualCount = Math.max(0, currentSessions - 1);

        // Thông báo GV
        const st = localState.students.find(s => s.id === studentId);
        if (st && st.assignedTeacherId) {
            sendNotification(st.assignedTeacherId, 'system', `❌ Lễ tân đã huỷ buổi học của HV "${studentName}" (${currentSessions} → ${actualCount}). GV báo bận.`);
        }

        alert(`✅ Đã huỷ buổi học cho "${studentName}" — còn ${actualCount} buổi.`);

        // Sync xoá cột điểm danh trên Google Sheet
        try {
            const stuDocCancel = await db.collection('students').doc(studentId).get();
            const stuCancel = stuDocCancel.exists ? stuDocCancel.data() : {};
            if (stuCancel.contractNumber) {
                const brName = FIXED_BRANCHES.find(b => b.id === (stuCancel.branchId || currentBranchId))?.name || 'Khác';
                syncToGoogleSheet({
                    action: 'markAttendance',
                    branchName: brName,
                    contractNumber: stuCancel.contractNumber,
                    sessionNumber: currentSessions, // buổi vừa huỷ = currentSessions (đã giảm 1)
                    date: ''  // Ghi rỗng = xoá
                });
            }
        } catch (e) { console.warn('Sheet cancel sync error:', e); }

        // Refresh
        const searchInput = document.getElementById('letan-search');
        if (searchInput && searchInput.value) {
            setTimeout(() => searchStudentForAttendance(searchInput.value), 500);
        }
        setTimeout(() => renderLetanManageTable(), 600);
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

// Điểm danh - tích 1 buổi cho học viên
window.markAttendance = async function (studentId, studentName, currentSessions, totalSessions, teacherId) {
    if (currentSessions >= totalSessions) {
        alert('Học viên đã hoàn thành khóa học!');
        return;
    }

    // Kiểm tra waiver cho môn Lặn
    try {
        const stDoc = await db.collection('students').doc(studentId).get();
        const stData = stDoc.data();
        if (stData && isDivingCurriculum(stData.curriculum) && !stData.waiverSigned) {
            alert(`⚠️ HV "${studentName}" chưa ký Cam kết miễn trừ trách nhiệm!\n\nYêu cầu khách hàng tra cứu hợp đồng và ký cam kết trước khi học Lặn.`);
            return;
        }
    } catch (e) { console.warn('Waiver check error:', e); }

    const teacherName = localState.teachers.find(t => t.id === teacherId)?.name || 'GV';

    // Kiểm tra GV có báo bận không (dùng localState)
    try {
        const teacherData = (localState.teachers || []).find(t => t.id === teacherId);
        if (teacherData && teacherData.isBusy) {
            alert(`⚠️ GV "${teacherName}" hiện KHÔNG CÓ Ở BỂ (đang báo bận).\n\nVui lòng yêu cầu HV "${studentName}" liên hệ lại với GV "${teacherName}" để sắp xếp lịch học.`);
            return;
        }
    } catch (e) { console.warn('Busy check error:', e); }

    // Kiểm tra GV có đang full lớp không (max 7 HV/ca = 60 phút)
    try {
        const now = new Date();
        const sixtyMinAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const attSnap = await db.collection('attendance')
            .where('branchId', '==', currentBranchId)
            .where('createdAt', '>=', sixtyMinAgo)
            .get();

        // Đếm HV đang học trong 60 phút gần nhất (unique student) cho GV này
        const activeStudents = new Set();
        attSnap.forEach(doc => {
            const d = doc.data();
            if (d.teacherId !== teacherId) return;
            const t = d.createdAt?.toDate();
            if (t && t >= sixtyMinAgo) {
                activeStudents.add(d.studentId);
            }
        });

        if (activeStudents.size >= 7) {
            const proceed = confirm(
                `⚠️ CẢNH BÁO: GV "${teacherName}" đang FULL LỚP!\n\n` +
                `Hiện tại: ${activeStudents.size}/7 học viên đang học.\n\n` +
                `🔸 Bấm "Huỷ" → Báo HV chờ ca tiếp theo\n` +
                `🔸 Bấm "OK" → Xác nhận điểm danh (đã hẹn với GV)\n\n` +
                `Học viên đã có hẹn trước với GV "${teacherName}"?`
            );
            if (!proceed) {
                alert(`ℹ️ Đã huỷ. Vui lòng báo HV "${studentName}" chờ ca tiếp theo của GV "${teacherName}".`);
                return;
            }
        }
    } catch (e) { console.warn('Capacity check error:', e); }

    // Kiểm tra HV đã điểm danh hôm nay — enforce khoảng cách 20 phút
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        // Chỉ lấy attendance HÔM NAY (thay vì toàn bộ lịch sử)
        const todayAttSnap = await db.collection('attendance')
            .where('studentId', '==', studentId)
            .where('branchId', '==', currentBranchId)
            .where('createdAt', '>=', todayStart)
            .get();
        const todayRecords = [];
        todayAttSnap.forEach(doc => {
            const d = doc.data();
            const t = d.createdAt?.toDate();
            if (t) todayRecords.push(t);
        });
        if (todayRecords.length > 0) {
            const lastTime = todayRecords.sort((a, b) => b - a)[0];
            const minutesSinceLast = Math.floor((new Date().getTime() - lastTime.getTime()) / 60000);
            const timeStr = lastTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

            if (minutesSinceLast < 20) {
                // Trong 20 phút — CHẶN CỨNG, phải đợi hết thời gian huỷ
                const remainMin = 20 - minutesSinceLast;
                alert(`⛔ HV "${studentName}" vừa điểm danh lúc ${timeStr}.\n\n⏳ Cần đợi thêm ${remainMin} phút nữa mới được điểm danh lần tiếp.\n\n💡 Nếu điểm danh nhầm, hãy bấm "Huỷ buổi học" trước.`);
                return;
            }

            // Sau 20 phút — cho phép nhưng hỏi xác nhận
            const proceed = confirm(
                `⚠️ HV "${studentName}" ĐÃ ĐIỂM DANH HÔM NAY!\n\n` +
                `Lần điểm danh gần nhất: ${timeStr} (${minutesSinceLast} phút trước)\n` +
                `Tổng buổi hôm nay: ${todayRecords.length} buổi\n\n` +
                `Bạn có CHẮC CHẮN muốn điểm danh thêm buổi nữa không?\n\n` +
                `🔸 Bấm "OK" → Xác nhận điểm danh buổi thứ ${todayRecords.length + 1} trong ngày\n` +
                `🔸 Bấm "Huỷ" → Không điểm danh`
            );
            if (!proceed) return;
        }
    } catch (e) { console.warn('Duplicate attendance check error:', e); }

    // Kiểm tra HĐ 45 ngày
    let expiryWarning = '';
    try {
        const stuDoc = await db.collection('students').doc(studentId).get();
        const stuData = stuDoc.exists ? stuDoc.data() : {};
        const firstLesson = stuData.firstLessonDate?.toDate ? stuData.firstLessonDate.toDate() : null;
        if (firstLesson) {
            const daysPassed = Math.floor((new Date() - firstLesson) / (1000 * 60 * 60 * 24));
            const daysLeft = 45 - daysPassed;
            if (daysLeft <= 0) {
                expiryWarning = `\n\n🚨 CẢNH BÁO: HĐ đã QUÁ HẠN 45 ngày! (Đã ${daysPassed} ngày từ buổi đầu)`;
            } else if (daysLeft <= 5) {
                expiryWarning = `\n\n⚠️ CHÚ Ý: HĐ còn ${daysLeft} ngày nữa hết hạn 45 ngày!`;
            }
        }
    } catch (e) { console.warn('45-day check error:', e); }

    if (!confirm(`✅ Điểm danh: ${studentName}\n\nBuổi ${currentSessions + 1} / ${totalSessions}\nGiáo viên: ${teacherName}${expiryWarning}\n\nXác nhận?`)) return;

    try {
        // Lưu log điểm danh TRƯỚC
        await db.collection('attendance').add({
            studentId: studentId,
            studentName: studentName,
            teacherId: teacherId,
            teacherName: teacherName,
            sessionNumber: currentSessions + 1,
            checkedBy: currentUserId,
            checkedByName: currentUserDisplayName || 'Lễ tân',
            branchId: currentBranchId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Tăng 1 buổi (dùng increment thay vì đếm attendance để tránh reset HV nhập tay)
        const updateData = { sessions: firebase.firestore.FieldValue.increment(1) };
        if (currentSessions === 0) {
            updateData.firstLessonDate = firebase.firestore.FieldValue.serverTimestamp();
        }
        await db.collection('students').doc(studentId).update(updateData);

        // Gửi thông báo cho GV xác nhận — kèm tên bể
        const branchName = FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || 'cơ sở';
        await sendNotification(teacherId, 'attendance', `📋 Lễ tân điểm danh HV "${studentName}" tại 🏊 ${branchName} (buổi ${currentSessions + 1}/${totalSessions}). Vui lòng xác nhận.`);

        // Thông báo Sale khi HV hoàn thành buổi cuối
        if (currentSessions + 1 >= totalSessions) {
            try {
                const stuDoc2 = await db.collection('students').doc(studentId).get();
                const stu2 = stuDoc2.exists ? stuDoc2.data() : {};
                const saleId = stu2.creatorId || stu2.saleId;
                if (saleId) {
                    await sendNotification(saleId, 'completion', `🎉 HV "${studentName}" đã hoàn thành ${totalSessions}/${totalSessions} buổi tại 🏊 ${branchName}! Khóa học kết thúc.`);
                }
            } catch (e) { console.warn('Notify sale completion error:', e); }
        }

        alert(`✅ Đã điểm danh "${studentName}" — Buổi ${currentSessions + 1}/${totalSessions}\n🏊 Học tại bể: ${branchName}${expiryWarning}`);

        // Auto sync điểm danh lên Google Sheet (ghi vào cột "Buổi X")
        try {
            const stuDocSync = await db.collection('students').doc(studentId).get();
            const contractNum = stuDocSync.exists ? stuDocSync.data().contractNumber : '';
            if (contractNum) {
                syncToGoogleSheet({
                    action: 'markAttendance',
                    branchName: branchName,
                    contractNumber: contractNum,
                    sessionNumber: currentSessions + 1,
                    date: new Date().toLocaleDateString('vi-VN')
                });
            }
        } catch (e) { console.warn('Sheet attendance sync error:', e); }

        // Refresh kết quả tìm kiếm
        const searchInput = document.getElementById('letan-search');
        if (searchInput && searchInput.value) {
            setTimeout(() => searchStudentForAttendance(searchInput.value), 500);
        }
        // Refresh bảng quản lý
        setTimeout(() => renderLetanManageTable(), 600);
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

// ============ BẢNG QUẢN LÝ ĐIỂM DANH (LỄ TÂN) ============ //
// Toggle Lễ Tân mode: Học viên vs CLB
window.toggleLetanMode = function (isClb) {
    const hvMode = document.getElementById('letan-hv-mode');
    const clbMode = document.getElementById('letan-clb-mode');
    const btnHv = document.getElementById('letan-btn-hv');
    const btnClb = document.getElementById('letan-btn-clb');

    if (isClb) {
        if (hvMode) hvMode.style.display = 'none';
        if (clbMode) clbMode.style.display = 'block';
        if (btnHv) { btnHv.style.background = 'transparent'; btnHv.style.color = 'var(--text-muted)'; }
        if (btnClb) { btnClb.style.background = 'var(--primary)'; btnClb.style.color = '#fff'; }
    } else {
        if (hvMode) hvMode.style.display = 'block';
        if (clbMode) clbMode.style.display = 'none';
        if (btnHv) { btnHv.style.background = 'var(--primary)'; btnHv.style.color = '#fff'; }
        if (btnClb) { btnClb.style.background = 'transparent'; btnClb.style.color = 'var(--text-muted)'; }
    }
};

window.renderLetanManageTable = async function () {
    const container = document.getElementById('letan-manage-table');
    if (!container || !currentBranchId) return;

    const searchQ = (document.getElementById('letan-manage-search')?.value || '').trim().toLowerCase();

    // Dùng localState.students — KHÔNG query Firestore lúc render!
    const branchStudents = localState.students.filter(s => s.branchId === currentBranchId);
    const teacherMap = {};
    localState.teachers.forEach(t => { teacherMap[t.id] = t.name; });

    // Build sale map from localState
    const saleMapLocal = {};
    (localState.teachers || []).forEach(u => { saleMapLocal[u.id] = u.name || ''; });
    (localState.sales || []).forEach(u => { saleMapLocal[u.id] = u.name || ''; });
    (localState.firedUsers || []).forEach(u => { saleMapLocal[u.id] = u.name || ''; });

    let entries = branchStudents.map(s => ({
        id: s.id,
        name: s.name || '?',
        teacherName: teacherMap[s.assignedTeacherId] || '?',
        totalSessions: s.totalSessions || 10,
        currentSessions: s.sessions || 0,
        curriculum: s.curriculum || 'Bơi Ếch',
        contractNumber: s.contractNumber || '',
        saleName: s.saleConfirmedBy || s.creatorName || (s.creatorId ? saleMapLocal[s.creatorId] : '') || '',
        phone: s.phone || ''
    }));

    if (searchQ) {
        entries = entries.filter(v =>
            v.name.toLowerCase().includes(searchQ) ||
            (v.contractNumber && v.contractNumber.toLowerCase().includes(searchQ)) ||
            (v.phone && v.phone.includes(searchQ))
        );
    }

    if (entries.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Không tìm thấy học viên</div>`;
        return;
    }

    // Sort: đang học (sessions > 0 & chưa xong) trước, xong cuối
    entries.sort((a, b) => {
        const aDone = a.currentSessions >= a.totalSessions;
        const bDone = b.currentSessions >= b.totalSessions;
        if (aDone && !bDone) return 1;
        if (!aDone && bDone) return -1;
        return 0;
    });

    const now = new Date();

    container.innerHTML = entries.map(info => {
        const total = info.totalSessions;
        const cur = info.currentSessions;
        const pct = Math.min((cur / total) * 100, 100);
        const isDone = cur >= total;
        const eName = info.name.replace(/'/g, "\\\\'");

        const activeBorder = isDone ? 'rgba(239,68,68,0.2)' : 'var(--border-color)';
        const activeBg = isDone ? 'rgba(239,68,68,0.03)' : 'var(--card-bg)';

        return `
        <div style="margin-bottom: 8px; border: 1px solid ${activeBorder}; border-radius: 10px; overflow: hidden;">
            <div onclick="loadLetanAttHistory('${info.id}', this)"
                style="padding: 12px 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; background: ${activeBg};">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:14px;">
                        ${info.name}
                        ${isDone ? '<span style="color:#ef4444; font-size:11px;">✅ Xong</span>' : ''}
                    </div>
                    <div style="font-size:11px; color:var(--text-muted);">GV: ${info.teacherName} · ${info.curriculum}${info.contractNumber ? ` · HĐ: <strong>${info.contractNumber}</strong>` : ''}</div>
                    ${info.saleName ? `<div style="font-size:11px; color:var(--text-muted);"><i class="fa-solid fa-user-tie" style="color:#f59e0b;"></i> Sale: <strong>${info.saleName}</strong></div>` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="text-align:right;">
                        <div style="font-weight:700; font-size:14px; color:${isDone ? '#ef4444' : 'var(--primary)'};">${cur}/${total}</div>
                        <div style="width:60px; height:4px; background:rgba(0,0,0,0.1); border-radius:2px; overflow:hidden; margin-top:2px;">
                            <div style="width:${pct}%; height:100%; background:${isDone ? '#ef4444' : '#3b82f6'};"></div>
                        </div>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-down" style="font-size:10px; color:var(--text-muted);"></i>
            </div>
            <div id="letan-att-${info.id}" style="display:none; background:rgba(0,0,0,0.02); border-top:1px solid var(--border-color);">
                <div style="padding:10px; text-align:center; color:var(--text-muted); font-size:12px;">Bấm để xem lịch sử điểm danh...</div>
            </div>
        </div>`;
    }).join('');
};

// Lazy-load lịch sử điểm danh khi bấm mở HV (tiết kiệm reads!)
window.loadLetanAttHistory = async function (studentId, headerEl) {
    const detailDiv = document.getElementById('letan-att-' + studentId);
    if (!detailDiv) return;

    // Toggle: đã mở thì đóng
    if (detailDiv.style.display === 'block') {
        detailDiv.style.display = 'none';
        return;
    }
    detailDiv.style.display = 'block';

    // Nếu đã load rồi (có data-loaded), không query lại
    if (detailDiv.dataset.loaded === '1') return;

    detailDiv.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        // Chỉ query attendance của 1 HV này — tối đa ~10-15 docs
        const snap = await db.collection('attendance')
            .where('studentId', '==', studentId)
            .where('branchId', '==', currentBranchId)
            .get();

        const logs = [];
        snap.forEach(doc => {
            const d = doc.data();
            logs.push({
                docId: doc.id,
                session: d.sessionNumber || 0,
                time: d.createdAt?.toDate() || null,
                checkedBy: d.checkedByName || 'Lễ tân'
            });
        });
        logs.sort((a, b) => (b.time || 0) - (a.time || 0));

        // Nút huỷ buổi gần nhất (trong 20 phút)
        const now = new Date();
        const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000);
        const latestLog = logs[0];
        const canCancel = latestLog && latestLog.time && latestLog.time >= twentyMinAgo;

        const st = localState.students.find(s => s.id === studentId);
        const eName = (st?.name || '').replace(/'/g, "\\\\'");
        const cur = st?.sessions || 0;

        let cancelHtml = '';
        if (canCancel) {
            const cancelRemain = Math.max(0, Math.ceil((latestLog.time.getTime() + 20 * 60 * 1000 - now.getTime()) / 60000));
            cancelHtml = `<div style="padding:6px 10px; text-align:right;">
                <button onclick="event.stopPropagation(); cancelAttendance('${studentId}', '${eName}', '${latestLog.docId}', ${cur})"
                    style="padding:5px 10px; border-radius:6px; border:none; cursor:pointer; font-weight:600; font-size:11px;
                    background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.25);">
                    <i class="fa-solid fa-xmark"></i> Huỷ buổi gần nhất (${cancelRemain}p)
                </button>
            </div>`;
        }

        const logsHtml = logs.length === 0
            ? '<div style="padding:8px; color:var(--text-muted); font-size:12px;">Chưa điểm danh lần nào</div>'
            : logs.map(l => {
                const timeStr = l.time ? l.time.toLocaleDateString('vi-VN') + ' ' + l.time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '?';
                return `<div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 8px; border-bottom:1px solid var(--border-color);">
                    <span>Buổi <strong>${l.session}</strong></span>
                    <span style="color:var(--text-muted);">${timeStr}</span>
                </div>`;
            }).join('');

        detailDiv.innerHTML = `
            <div style="padding:6px 10px; font-size:11px; font-weight:600; color:var(--text-muted); background:rgba(0,0,0,0.03);">📅 Lịch sử điểm danh (${logs.length} lần)</div>
            ${cancelHtml}
            ${logsHtml}`;
        detailDiv.dataset.loaded = '1';
    } catch (e) {
        detailDiv.innerHTML = `<div style="padding:10px; color:#ef4444; font-size:12px;">Lỗi: ${e.message}</div>`;
    }
}


// ===================== LỊCH SỬ ĐIỂM DANH HV THEO NGÀY (LỄ TÂN) =====================
window.renderLetanHvHistory = async function (dateStr) {
    const container = document.getElementById('letan-hv-history-result');
    const countEl = document.getElementById('letan-hv-history-count');
    if (!container) return;
    if (!dateStr) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;"><i class="fa-solid fa-calendar-days" style="font-size:20px; display:block; margin-bottom:6px; opacity:0.3;"></i>Chọn ngày để xem lịch sử điểm danh HV</div>';
        if (countEl) countEl.textContent = '';
        return;
    }

    container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        const brId = currentBranchId;
        const selectedDate = new Date(dateStr);
        selectedDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const snap = await db.collection('attendance')
            .where('branchId', '==', brId)
            .where('createdAt', '>=', selectedDate)
            .where('createdAt', '<', nextDay)
            .get();

        const dayDocs = snap.docs.sort((a, b) => {
            const tA = a.data().createdAt?.toDate?.()?.getTime() || 0;
            const tB = b.data().createdAt?.toDate?.()?.getTime() || 0;
            return tB - tA;
        });

        const dateLabel = selectedDate.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

        if (dayDocs.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">
                <i class="fa-solid fa-calendar-xmark" style="font-size:20px; display:block; margin-bottom:6px; opacity:0.3;"></i>
                Không có HV điểm danh ngày <b>${dateLabel}</b>
            </div>`;
            if (countEl) countEl.textContent = '';
            return;
        }

        if (countEl) countEl.textContent = `${dayDocs.length} lượt`;

        // Group by teacher
        const byTeacher = {};
        dayDocs.forEach(doc => {
            const d = doc.data();
            const tName = d.teacherName || 'Chưa gán';
            if (!byTeacher[tName]) byTeacher[tName] = [];
            byTeacher[tName].push(d);
        });

        const teacherColor = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

        let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:13px; font-weight:600; color:var(--text-color);">📅 ${dateLabel}</span>
            <span style="font-size:12px; background:rgba(59,130,246,0.12); color:#3b82f6; padding:3px 10px; border-radius:8px; font-weight:700;">${dayDocs.length} HV</span>
        </div>`;

        let colorIdx = 0;
        Object.keys(byTeacher).sort().forEach(tName => {
            const students = byTeacher[tName];
            const lc = teacherColor[colorIdx % teacherColor.length];
            colorIdx++;
            html += `<div style="margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="background:${lc}; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700;">GV ${tName}</span>
                    <span style="font-size:11px; color:var(--text-muted);">${students.length} HV</span>
                </div>`;
            students.forEach(d => {
                const ts = d.createdAt?.toDate ? d.createdAt.toDate() : null;
                const time = ts ? ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
                html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 8px; border-bottom:1px dashed var(--border-color); font-size:12px;">
                    <span style="font-weight:500;">${d.studentName || 'HV'}</span>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <span style="color:var(--text-muted);">Buổi <strong>${d.sessionNumber || '?'}</strong></span>
                        <span style="color:var(--text-muted);"><i class="fa-solid fa-clock"></i> ${time}</span>
                        <span style="font-size:10px; color:${lc};">${d.checkedByName || 'LT'}</span>
                    </div>
                </div>`;
            });
            html += `</div>`;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error('renderLetanHvHistory error:', e);
        container.innerHTML = '<div style="text-align:center; padding:15px; color:#ef4444;">Lỗi tải dữ liệu.</div>';
    }
};

// ===================== LỊCH SỬ ĐIỂM DANH CLB THEO NGÀY (LỄ TÂN) =====================
window.renderLetanClbHistory = async function (dateStr) {
    const container = document.getElementById('letan-clb-history-result');
    const countEl = document.getElementById('letan-clb-history-count');
    if (!container) return;
    if (!dateStr) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;"><i class="fa-solid fa-calendar-days" style="font-size:20px; display:block; margin-bottom:6px; opacity:0.3;"></i>Chọn ngày để xem lịch sử điểm danh CLB</div>';
        if (countEl) countEl.textContent = '';
        return;
    }

    container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        const brId = currentBranchId;
        const selectedDate = new Date(dateStr);
        selectedDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const snap = await db.collection('clb_attendance')
            .where('branchId', '==', brId)
            .where('timestamp', '>=', selectedDate)
            .where('timestamp', '<', nextDay)
            .get();

        const dayDocs = snap.docs.sort((a, b) => {
            const tA = a.data().timestamp?.toDate?.()?.getTime() || 0;
            const tB = b.data().timestamp?.toDate?.()?.getTime() || 0;
            return tB - tA;
        });

        const dateLabel = selectedDate.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

        if (dayDocs.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">
                <i class="fa-solid fa-calendar-xmark" style="font-size:20px; display:block; margin-bottom:6px; opacity:0.3;"></i>
                Không có VĐV điểm danh ngày <b>${dateLabel}</b>
            </div>`;
            if (countEl) countEl.textContent = '';
            return;
        }

        if (countEl) countEl.textContent = `${dayDocs.length} lượt`;

        // Group by class
        const byClass = {};
        dayDocs.forEach(doc => {
            const d = doc.data();
            const cl = d.classLevel || '?';
            if (!byClass[cl]) byClass[cl] = [];
            byClass[cl].push(d);
        });

        const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' };

        let html = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:13px; font-weight:600; color:var(--text-color);">📅 ${dateLabel}</span>
            <span style="font-size:12px; background:rgba(245,158,11,0.12); color:#f59e0b; padding:3px 10px; border-radius:8px; font-weight:700;">${dayDocs.length} VĐV</span>
        </div>`;

        Object.keys(byClass).sort().forEach(cl => {
            const students = byClass[cl];
            const lc = levelColor[cl] || '#6b7280';
            html += `<div style="margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="background:${lc}; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700;">Lớp ${cl}</span>
                    <span style="font-size:11px; color:var(--text-muted);">${students.length} VĐV</span>
                </div>`;
            students.forEach(d => {
                const ts = d.timestamp?.toDate ? d.timestamp.toDate() : null;
                const time = ts ? ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
                const confirmed = d.coachConfirmed ? `<span style="font-size:10px; color:#10b981;"><i class="fa-solid fa-circle-check"></i> ${d.coachConfirmedName || 'HLV'}</span>` : '<span style="font-size:10px; color:var(--text-muted);">Chưa XN</span>';
                html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 8px; border-bottom:1px dashed var(--border-color); font-size:12px;">
                    <span style="font-weight:500;">${d.athleteName || 'VĐV'}</span>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <span style="color:var(--text-muted);"><i class="fa-solid fa-clock"></i> ${time}</span>
                        ${confirmed}
                    </div>
                </div>`;
            });
            html += `</div>`;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error('renderLetanClbHistory error:', e);
        container.innerHTML = '<div style="text-align:center; padding:15px; color:#ef4444;">Lỗi tải dữ liệu.</div>';
    }
};

