// ===== GreenPool App — Letan Module (v7.0) =====

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

    // Lấy attendance gần đây (20 phút) để hiện nút Huỷ
    const now = new Date();
    const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000);
    let recentAttMap = {}; // studentId -> { docId, time }
    try {
        const attSnap = await db.collection('attendance')
            .where('branchId', '==', currentBranchId)
            .get();
        attSnap.forEach(doc => {
            const d = doc.data();
            const t = d.createdAt?.toDate();
            if (t && t >= twentyMinAgo) {
                if (!recentAttMap[d.studentId] || t > recentAttMap[d.studentId].time) {
                    recentAttMap[d.studentId] = { docId: doc.id, time: t, session: d.sessionNumber };
                }
            }
        });
    } catch (e) { console.warn('Recent att query:', e); }

    container.innerHTML = results.map(st => {
        const total = st.totalSessions || 10;
        const percent = Math.min((st.sessions / total) * 100, 100);
        const isDone = st.sessions >= total;
        const teacherName = teacherMap[st.assignedTeacherId] || 'Chưa gán';
        const curType = st.curriculum || 'Bơi Ếch';
        const recent = recentAttMap[st.id];
        const canCancel = !!recent;
        const cancelRemain = canCancel ? Math.max(0, Math.ceil((recent.time.getTime() + 20 * 60 * 1000 - now.getTime()) / 60000)) : 0;

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
                    ${st.saleConfirmedBy || st.creatorName ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                        <i class="fa-solid fa-user-tie"></i> Sale: <strong>${st.saleConfirmedBy || st.creatorName || 'N/A'}</strong>
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
        // Giảm 1 buổi
        await db.collection('students').doc(studentId).update({
            sessions: firebase.firestore.FieldValue.increment(-1)
        });

        // Xoá bản ghi điểm danh
        await db.collection('attendance').doc(attDocId).delete();

        // Thông báo GV
        const st = localState.students.find(s => s.id === studentId);
        if (st && st.assignedTeacherId) {
            sendNotification(st.assignedTeacherId, 'system', `❌ Lễ tân đã huỷ buổi học của HV "${studentName}" (${currentSessions} → ${currentSessions - 1}). GV báo bận.`);
        }

        alert(`✅ Đã huỷ buổi học cho "${studentName}" — còn ${currentSessions - 1} buổi.`);

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

    // Kiểm tra GV có báo bận không
    try {
        const teacherDoc = await db.collection('users').doc(teacherId).get();
        if (teacherDoc.exists && teacherDoc.data().isBusy) {
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

    // Kiểm tra HV đã điểm danh hom nay chưa (tránh kích nhầm 2 buổi/ngày)
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayAttSnap = await db.collection('attendance')
            .where('studentId', '==', studentId)
            .where('branchId', '==', currentBranchId)
            .get();
        const todayRecords = [];
        todayAttSnap.forEach(doc => {
            const d = doc.data();
            const t = d.createdAt?.toDate();
            if (t && t >= todayStart) todayRecords.push(t);
        });
        if (todayRecords.length > 0) {
            const lastTime = todayRecords.sort((a, b) => b - a)[0];
            const timeStr = lastTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const proceed = confirm(
                `⚠️ CẢNH BÁO: HV "${studentName}" ĐÃ ĐIỂM DANH HÔM NAY!\n\n` +
                `Lần điểm danh gần nhất: ${timeStr}\n` +
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
        // Tăng số buổi + lưu firstLessonDate nếu là buổi đầu
        const updateData = {
            sessions: firebase.firestore.FieldValue.increment(1)
        };
        if (currentSessions === 0) {
            updateData.firstLessonDate = firebase.firestore.FieldValue.serverTimestamp();
        }
        await db.collection('students').doc(studentId).update(updateData);

        // Lưu log điểm danh
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

    try {
        // Lấy attendance logs của cơ sở
        const snap = await db.collection('attendance')
            .where('branchId', '==', currentBranchId)
            .get();

        // Gom theo studentId
        const studentMap = {};
        snap.forEach(doc => {
            const d = doc.data();
            if (!studentMap[d.studentId]) {
                studentMap[d.studentId] = {
                    name: d.studentName || '?',
                    teacherName: d.teacherName || '?',
                    logs: []
                };
            }
            studentMap[d.studentId].logs.push({
                docId: doc.id,
                session: d.sessionNumber || 0,
                time: d.createdAt?.toDate() || null,
                checkedBy: d.checkedByName || 'Lễ tân'
            });
        });

        // Bổ sung info + filter
        const branchStudents = localState.students.filter(s => s.branchId === currentBranchId);
        const teacherMap = {};
        localState.teachers.forEach(t => { teacherMap[t.id] = t.name; });

        // Thêm HV chưa điểm danh lần nào
        branchStudents.forEach(s => {
            if (!studentMap[s.id]) {
                studentMap[s.id] = {
                    name: s.name,
                    teacherName: teacherMap[s.assignedTeacherId] || '?',
                    logs: []
                };
            }
            // Cập nhật tên mới nhất
            studentMap[s.id].totalSessions = s.totalSessions || 10;
            studentMap[s.id].currentSessions = s.sessions || 0;
            studentMap[s.id].curriculum = s.curriculum || 'Bơi Ếch';
        });

        let entries = Object.entries(studentMap);
        // Sort logs per student (newest first)
        entries.forEach(([, v]) => {
            v.logs.sort((a, b) => (b.time || 0) - (a.time || 0));
        });
        if (searchQ) {
            entries = entries.filter(([, v]) => v.name.toLowerCase().includes(searchQ));
        }

        if (entries.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Chưa có dữ liệu điểm danh</div>`;
            return;
        }

        // Tính thời gian còn lại cho HV đang học (60 phút)
        const now = new Date();
        const sixtyMinAgo = new Date(now.getTime() - 60 * 60 * 1000);
        entries.forEach(([sid, v]) => {
            const latestLog = v.logs[0]?.time;
            if (latestLog && latestLog >= sixtyMinAgo) {
                v.isActive = true;
                v.remainMin = Math.max(0, Math.ceil((latestLog.getTime() + 60 * 60 * 1000 - now.getTime()) / 60000));
            } else {
                v.isActive = false;
                v.remainMin = 0;
            }
        });

        // Sắp xếp: đang học (mới nhất trước) → bình thường (theo thứ tự đăng ký)
        const branchIds = branchStudents.map(s => s.id);
        entries.sort((a, b) => {
            if (a[1].isActive && !b[1].isActive) return -1;
            if (!a[1].isActive && b[1].isActive) return 1;
            if (a[1].isActive && b[1].isActive) {
                return (b[1].logs[0]?.time || 0) - (a[1].logs[0]?.time || 0);
            }
            // Cả 2 không active → theo thứ tự đăng ký
            return branchIds.indexOf(a[0]) - branchIds.indexOf(b[0]);
        });

        container.innerHTML = entries.map(([sid, info]) => {
            const total = info.totalSessions || 10;
            const cur = info.currentSessions || 0;
            const pct = Math.min((cur / total) * 100, 100);
            const isDone = cur >= total;
            const isActive = info.isActive;

            // Nút huỷ buổi: chỉ hiện nếu log mới nhất trong 20 phút
            const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000);
            const latestLog = info.logs[0];
            const canCancel = latestLog && latestLog.time && latestLog.time >= twentyMinAgo;
            const cancelDocId = canCancel ? (latestLog.docId || '') : '';
            const cancelRemain = canCancel ? Math.max(0, Math.ceil((latestLog.time.getTime() + 20 * 60 * 1000 - now.getTime()) / 60000)) : 0;
            const eName = info.name.replace(/'/g, "\\\\'");

            const logsHtml = info.logs.length === 0
                ? '<div style="padding:8px; color:var(--text-muted); font-size:12px;">Chưa điểm danh lần nào</div>'
                : info.logs.map(l => {
                    const timeStr = l.time ? l.time.toLocaleDateString('vi-VN') + ' ' + l.time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '?';
                    return `<div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 8px; border-bottom:1px solid var(--border-color);">
                        <span>Buổi <strong>${l.session}</strong></span>
                        <span style="color:var(--text-muted);">${timeStr}</span>
                    </div>`;
                }).join('');

            const activeBorder = isActive ? 'rgba(6,182,212,0.5)' : (isDone ? 'rgba(239,68,68,0.2)' : 'var(--border-color)');
            const activeBg = isActive ? 'rgba(6,182,212,0.04)' : (isDone ? 'rgba(239,68,68,0.03)' : 'var(--card-bg)');

            return `
            <div style="margin-bottom: 8px; border: 1px solid ${activeBorder}; border-radius: 10px; overflow: hidden; ${isActive ? 'box-shadow: 0 0 8px rgba(6,182,212,0.15);' : ''}">
                <div onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'"
                    style="padding: 12px 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; background: ${activeBg};">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; font-size:14px;">
                            ${isActive ? '<span style="color:#06b6d4;">🏊</span> ' : ''}${info.name} 
                            ${isDone ? '<span style="color:#ef4444; font-size:11px;">✅ Xong</span>' : ''}
                            ${isActive ? `<span style="font-size:10px; padding:2px 6px; border-radius:8px; background:rgba(6,182,212,0.15); color:#06b6d4; font-weight:700;">⏳ ${info.remainMin}p</span>` : ''}
                        </div>
                        <div style="font-size:11px; color:var(--text-muted);">GV: ${info.teacherName} · ${info.curriculum || 'Bơi Ếch'}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${canCancel ? `<button onclick="event.stopPropagation(); cancelAttendance('${sid}', '${eName}', '${cancelDocId}', ${cur})"
                            style="padding:5px 10px; border-radius:6px; border:none; cursor:pointer; font-weight:600; font-size:11px;
                            background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.25); white-space:nowrap;">
                            <i class="fa-solid fa-xmark"></i> Huỷ (${cancelRemain}p)
                        </button>` : ''}
                        <div style="text-align:right;">
                            <div style="font-weight:700; font-size:14px; color:${isDone ? '#ef4444' : 'var(--primary)'};">${cur}/${total}</div>
                            <div style="width:60px; height:4px; background:rgba(0,0,0,0.1); border-radius:2px; overflow:hidden; margin-top:2px;">
                                <div style="width:${pct}%; height:100%; background:${isDone ? '#ef4444' : '#3b82f6'};"></div>
                            </div>
                        </div>
                    </div>
                    <i class="fa-solid fa-chevron-down" style="font-size:10px; color:var(--text-muted);"></i>
                </div>
                <div style="display:none; background:rgba(0,0,0,0.02); border-top:1px solid var(--border-color);">
                    <div style="padding:6px 10px; font-size:11px; font-weight:600; color:var(--text-muted); background:rgba(0,0,0,0.03);">📅 Lịch sử điểm danh (${info.logs.length} lần)</div>
                    ${logsHtml}
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        console.error('renderLetanManageTable error:', e);
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--danger);">Lỗi tải dữ liệu: ${e.message}</div>`;
    }
};

// Thống kê cá nhân Sale
let saleFilterMode = 'all';


// ===================== LỄ TÂN ĐIỂM DANH CLB ===================== //
window.renderLetanClbSection = function () {
    const container = document.getElementById('letan-clb-section');
    if (!container) return;

    container.innerHTML = `
        <div class="section-container">
            <div class="section-header">
                <h3><i class="fa-solid fa-medal" style="color:#f59e0b;"></i> Điểm danh CLB TL KID</h3>
                <p class="subtitle">Tìm và điểm danh VĐV CLB.</p>
            </div>
            <div style="position:relative; margin-bottom:12px;">
                <i class="fa-solid fa-search" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--text-muted);"></i>
                <input type="text" id="letan-clb-search" placeholder="Tìm tên, SĐT hoặc số HĐ VĐV CLB..." 
                    style="width:100%; padding:10px 14px 10px 40px; border-radius:10px; border:1px solid var(--border-color); background:var(--card-bg); color:var(--text-color); font-size:13px;"
                    oninput="searchClbForAttendance()">
            </div>
            <div id="letan-clb-results" style="max-height:400px; overflow-y:auto;"></div>
        </div>
    `;
    renderLetanClbManageTable();
};

window.searchClbForAttendance = async function () {
    const q = (document.getElementById('letan-clb-search')?.value || '').trim().toLowerCase();
    const resultsDiv = document.getElementById('letan-clb-results');
    if (!resultsDiv) return;
    if (!q) { resultsDiv.innerHTML = ''; return; }

    const snap = await db.collection('athletes').where('branchId', '==', currentBranchId || currentUserBranchId).get();
    const athletes = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.name.toLowerCase().includes(q) || (a.phone || '').includes(q) || (a.contractNumber || '').toLowerCase().includes(q));

    if (athletes.length === 0) {
        resultsDiv.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-muted);">Không tìm thấy VĐV</div>';
        return;
    }

    // Lấy điểm danh hôm nay
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const now = Date.now();
    const todayAttMap = {}; // athleteId -> { count, latestTimestamp }
    try {
        const todayAttSnap = await db.collection('clb_attendance')
            .where('branchId', '==', currentBranchId || currentUserBranchId)
            .where('timestamp', '>=', today)
            .get();
        todayAttSnap.docs.forEach(d => {
            const data = d.data();
            const ts = data.timestamp?.toDate ? data.timestamp.toDate().getTime() : 0;
            if (!todayAttMap[data.athleteId] || ts > todayAttMap[data.athleteId].latest) {
                todayAttMap[data.athleteId] = { count: (todayAttMap[data.athleteId]?.count || 0) + 1, latest: ts };
            } else {
                todayAttMap[data.athleteId].count++;
            }
        });
    } catch (attErr) {
        console.warn('CLB attendance query error:', attErr);
    }

    resultsDiv.innerHTML = athletes.map(a => {
        const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' }[a.classLevel] || '#6b7280';
        const isExpired = a.isExpired || (a.expiresAt && (a.expiresAt.toDate ? a.expiresAt.toDate() : new Date(a.expiresAt)) < new Date());

        // Trạng thái điểm danh hôm nay
        let attendBadge = '';
        const att = todayAttMap[a.id];
        if (att) {
            const elapsed = now - att.latest;
            const isTraining = elapsed < 90 * 60 * 1000; // trong 90 phút
            if (isTraining) {
                const remainMin = Math.ceil((90 * 60 * 1000 - elapsed) / 60000);
                attendBadge = `<div style="font-size:11px; color:#3b82f6; font-weight:600; margin-top:3px; animation: pulse 2s infinite;">
                    🏊 Đang tập luyện (còn ${remainMin}p)</div>`;
            } else {
                attendBadge = `<div style="font-size:11px; color:#10b981; font-weight:600; margin-top:3px;">
                    ✅ Đã điểm danh hôm nay (${att.count} lần)</div>`;
            }
        } else {
            attendBadge = `<div style="font-size:11px; color:var(--text-muted); margin-top:3px;">
                ⭕ Chưa điểm danh hôm nay</div>`;
        }

        const activatedAt = a.activatedAt?.toDate ? a.activatedAt.toDate() : null;
        const expiresAt = a.expiresAt?.toDate ? a.expiresAt.toDate() : (a.expiresAt ? new Date(a.expiresAt) : null);
        const extendedDays = a.extendedDays || 0;
        const totalAtt = a.totalAttendance || 0;

        // Tính ngày còn lại
        let daysLeftStr = '';
        if (expiresAt && !isExpired) {
            const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
            const daysColor = daysLeft <= 7 ? '#ef4444' : daysLeft <= 14 ? '#f59e0b' : '#10b981';
            daysLeftStr = `<span style="color:${daysColor}; font-weight:600;">(còn ${daysLeft} ngày)</span>`;
        }

        return `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:12px 15px; border:1px solid var(--border-color); border-radius:10px; margin-bottom:8px; background:var(--card-bg);">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600;">${a.name} ${a.creatorName ? `<span style="font-size:11px; color:#8b5cf6; font-weight:500;">(${a.creatorName})</span>` : ''} <span style="background:${levelColor}; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">${a.classLevel}</span></div>
                    <div style="font-size:12px; color:var(--text-muted);">${a.phone || ''} • ${a.sessionsPerWeek} buổi/tuần • ${a.contractMonths}T ${isExpired ? '• <span style="color:#ef4444;font-weight:600;">HẾT HẠN</span>' : ''}</div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px; display:flex; flex-wrap:wrap; gap:4px 12px;">
                        <span>📊 Đã tập: <strong style="color:var(--primary);">${totalAtt}</strong> buổi</span>
                        ${activatedAt ? `<span>📅 KH: <strong>${activatedAt.toLocaleDateString('vi-VN')}</strong></span>` : ''}
                        ${expiresAt ? `<span>⏰ HH: <strong>${expiresAt.toLocaleDateString('vi-VN')}</strong> ${daysLeftStr}</span>` : ''}
                        ${extendedDays > 0 ? `<span style="color:#8b5cf6; font-weight:600;">🔄 +${extendedDays} ngày GH</span>` : ''}
                    </div>
                    ${a.athleteNote ? `<div style="font-size:11px; color:#10b981; margin-top:2px;"><i class="fa-solid fa-clipboard"></i> ${a.athleteNote}</div>` : ''}
                    ${attendBadge}
                    <button onclick="event.stopPropagation(); showClbAttHistory('${a.id}', this)" style="margin-top:4px; border:none; background:rgba(99,102,241,0.1); color:#6366f1; font-size:10px; padding:3px 8px; border-radius:6px; cursor:pointer; font-weight:600;">
                        <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử ĐD
                    </button>
                    <div id="clb-att-history-${a.id}" style="display:none; margin-top:6px;"></div>
                </div>
                <button class="btn btn-sm btn-primary" onclick="markClbAttendance('${a.id}')" style="font-size:12px; padding:6px 14px; white-space:nowrap; flex-shrink:0; margin-left:8px;" ${isExpired ? 'disabled style="opacity:0.5;"' : ''}>
                    <i class="fa-solid fa-check"></i> Điểm danh
                </button>
            </div>
        `;
    }).join('');
};

// Hiện lịch sử điểm danh CLB
window.showClbAttHistory = async function (athleteId, btnEl) {
    const container = document.getElementById('clb-att-history-' + athleteId);
    if (!container) return;
    if (container.style.display !== 'none') {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    container.innerHTML = '<div style="text-align:center; padding:6px; color:var(--text-muted); font-size:11px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';
    try {
        const snap = await db.collection('clb_attendance')
            .where('athleteId', '==', athleteId)
            .get();
        const docs = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
                const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
                const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
                return tb - ta;
            })
            .slice(0, 30);

        if (docs.length === 0) {
            container.innerHTML = '<div style="font-size:11px; color:var(--text-muted); padding:4px;">Chưa có lịch sử.</div>';
            return;
        }

        let html = '<div style="max-height:180px; overflow-y:auto; border:1px solid var(--border-color); border-radius:8px;">';
        html += '<table style="width:100%; border-collapse:collapse; font-size:11px;">';
        html += `<thead><tr style="background:rgba(99,102,241,0.06);"><th style="padding:4px 8px; text-align:left;">STT</th><th style="padding:4px 8px; text-align:left;">Ngày</th><th style="padding:4px 8px; text-align:left;">Giờ vào</th><th style="padding:4px 8px; text-align:left;">Người ĐD</th></tr></thead><tbody>`;
        docs.forEach((d, idx) => {
            const ts = d.timestamp?.toDate ? d.timestamp.toDate() : null;
            const dateStr = ts ? ts.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' }) : '?';
            const timeStr = ts ? ts.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' }) : '';
            const marker = d.checkedByName || d.markedByName || '—';
            html += `<tr style="border-top:1px solid var(--border-color); ${idx % 2 === 1 ? 'background:rgba(0,0,0,0.02);' : ''}">
                <td style="padding:3px 8px; color:var(--primary); font-weight:600;">${idx + 1}</td>
                <td style="padding:3px 8px;">${dateStr}</td>
                <td style="padding:3px 8px;">${timeStr}</td>
                <td style="padding:3px 8px;">${marker}</td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `<div style="font-size:11px; color:#ef4444; padding:4px;">Lỗi: ${e.message}</div>`;
    }
};

window.markClbAttendance = async function (athleteId) {
    try {
        // Chạy song song 3 queries để tăng tốc
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const now = new Date();
        const startOfWeek = new Date(now);
        const day = startOfWeek.getDay();
        startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
        startOfWeek.setHours(0, 0, 0, 0);

        const [docSnap, todayAttendance, weekAttendance] = await Promise.all([
            db.collection('athletes').doc(athleteId).get(),
            db.collection('clb_attendance').where('athleteId', '==', athleteId).where('timestamp', '>=', today).get(),
            db.collection('clb_attendance').where('athleteId', '==', athleteId).where('timestamp', '>=', startOfWeek).get()
        ]);

        if (!docSnap.exists) return alert('Không tìm thấy VĐV!');
        const a = docSnap.data();

        // Check hết hạn
        if (a.isExpired) return alert('❌ HĐ đã hết hạn!');
        if (a.isFrozen) return alert('⏸ VĐV đang bảo lưu, không thể điểm danh!');
        if (a.expiresAt) {
            const exp = a.expiresAt.toDate ? a.expiresAt.toDate() : new Date(a.expiresAt);
            if (new Date() > exp) {
                await db.collection('athletes').doc(athleteId).update({ isExpired: true });
                return alert('❌ HĐ đã hết hạn!');
            }
        }

        // Check đã điểm danh hôm nay
        if (todayAttendance.size >= 1) {
            if (!confirm(`⚠️ VĐV "${a.name}" đã điểm danh hôm nay rồi (${todayAttendance.size} lần).\n\nXác nhận điểm danh lần ${todayAttendance.size + 1}?`)) return;
        }

        // Check quá buổi/tuần
        if (weekAttendance.size >= (a.sessionsPerWeek || 2)) {
            if (!confirm(`⚠️ VĐV "${a.name}" đã đi ${weekAttendance.size}/${a.sessionsPerWeek} buổi tuần này.\n\nVẫn cho điểm danh?`)) return;
        }

        // Kích hoạt HĐ (buổi đầu)
        const updates = {
            totalAttendance: (a.totalAttendance || 0) + 1
        };

        if (!a.activatedAt) {
            updates.activatedAt = firebase.firestore.FieldValue.serverTimestamp();
            const expDate = new Date();
            expDate.setMonth(expDate.getMonth() + (a.contractMonths || 1));
            updates.expiresAt = expDate;
            alert(`🎯 Kích hoạt HĐ! Hết hạn: ${expDate.toLocaleDateString('vi-VN')}`);
        }

        await Promise.all([
            db.collection('athletes').doc(athleteId).update(updates),
            db.collection('clb_attendance').add({
                athleteId,
                athleteName: a.name,
                branchId: currentBranchId || currentUserBranchId,
                classLevel: a.classLevel,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                markedBy: currentUserId
            })
        ]);

        const noteInfo = a.athleteNote ? `\n\n📝 Phương án vào bể:\n${a.athleteNote}` : '';
        alert(`✅ Điểm danh thành công: ${a.name} (Buổi ${(a.totalAttendance || 0) + 1})${noteInfo}`);

        // Gửi thông báo cho Khách hàng (KHACHHANG) liên kết với VĐV này
        try {
            const brName = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'cơ sở';
            const khSnap = await db.collection('users')
                .where('role', '==', 'KHACHHANG')
                .where('linkedAthleteIds', 'array-contains', athleteId)
                .get();
            khSnap.docs.forEach(doc => {
                sendNotification(doc.id, 'clb_attendance', `🏊 VĐV "${a.name}" đã điểm danh buổi ${(a.totalAttendance || 0) + 1} tại ${brName} (${a.classLevel || 'CLB'}).`);
            });
        } catch (e) { console.warn('KH notify error:', e); }

        searchClbForAttendance(); // Refresh
        renderLetanClbManageTable(); // Refresh management table
    } catch (e) {
        alert('Lỗi điểm danh: ' + e.message);
    }
};

// Quản lý điểm danh CLB hôm nay
window.renderLetanClbManageTable = async function () {
    const container = document.getElementById('letan-clb-manage-table');
    if (!container) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    try {
        const snap = await db.collection('clb_attendance')
            .where('branchId', '==', currentBranchId || currentUserBranchId)
            .get();

        const todayDocs = snap.docs.filter(doc => {
            const ts = doc.data().timestamp?.toDate?.();
            return ts && ts >= today;
        }).sort((a, b) => {
            const tA = a.data().timestamp?.toDate?.()?.getTime() || 0;
            const tB = b.data().timestamp?.toDate?.()?.getTime() || 0;
            return tB - tA;
        });

        if (todayDocs.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Chưa có điểm danh CLB hôm nay.</div>';
            return;
        }

        const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' };
        const SESSION_MINUTES = 90;

        // Chia thành đang tập và đã kết thúc
        const active = [];
        const ended = [];
        todayDocs.forEach(doc => {
            const d = doc.data();
            const ts = d.timestamp?.toDate ? d.timestamp.toDate() : null;
            const diffMin = ts ? Math.floor((now - ts) / 60000) : 999;
            const isActive = diffMin < SESSION_MINUTES;
            const remaining = SESSION_MINUTES - diffMin;
            const entry = { ...d, ts, diffMin, isActive, remaining, docId: doc.id };
            if (isActive) active.push(entry);
            else ended.push(entry);
        });

        let html = '';

        // VĐV đang tập (ưu tiên trên đầu)
        if (active.length > 0) {
            html += `<div style="font-size:12px; font-weight:700; color:#16a34a; padding:6px 14px; text-transform:uppercase; letter-spacing:0.5px;">🟢 Đang tập (${active.length})</div>`;
            active.forEach(d => {
                const time = d.ts ? d.ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
                const lc = levelColor[d.classLevel] || '#6b7280';
                const canCancel = d.diffMin <= 20;
                const cancelRemain = 20 - d.diffMin;
                const eName = (d.athleteName || 'VĐV').replace(/'/g, "\\'");
                html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border:1px solid rgba(34,197,94,0.4); border-radius:8px; margin-bottom:6px; background:rgba(34,197,94,0.05);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#16a34a; animation:pulse 1.5s infinite;"></span>
                        <span style="background:${lc}; color:#fff; padding:2px 8px; border-radius:5px; font-size:11px; font-weight:700;">${d.classLevel || '?'}</span>
                        <div style="font-weight:600; font-size:14px; color:var(--text-color);">${d.athleteName || 'VĐV'}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                        <span style="font-size:12px; color:#16a34a; font-weight:600;">Còn ${d.remaining} phút</span>
                        <span style="font-size:12px; color:var(--text-muted);"><i class="fa-solid fa-clock" style="margin-right:3px;"></i>${time}</span>
                        ${canCancel ? `<button onclick="cancelClbAttendance('${d.docId}', '${eName}')"
                            style="border:none; background:rgba(239,68,68,0.12); color:#ef4444; padding:5px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; border:1px solid rgba(239,68,68,0.25);">
                            <i class="fa-solid fa-xmark"></i> Huỷ (${cancelRemain}p)
                        </button>` : ''}
                    </div>
                </div>`;
            });
        }

        // VĐV đã kết thúc
        if (ended.length > 0) {
            html += `<div style="font-size:12px; font-weight:700; color:var(--text-muted); padding:6px 14px; margin-top:8px; text-transform:uppercase; letter-spacing:0.5px;">⚪ Kết thúc (${ended.length})</div>`;
            ended.forEach(d => {
                const time = d.ts ? d.ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
                const lc = levelColor[d.classLevel] || '#6b7280';
                html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border:1px solid var(--border-color); border-radius:8px; margin-bottom:6px; background:var(--card-bg); opacity:0.6;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="background:${lc}; color:#fff; padding:2px 8px; border-radius:5px; font-size:11px; font-weight:700;">${d.classLevel || '?'}</span>
                        <div style="font-weight:600; font-size:14px; color:var(--text-color);">${d.athleteName || 'VĐV'}</div>
                    </div>
                    <div style="font-size:12px; color:var(--text-muted);"><i class="fa-solid fa-clock" style="margin-right:3px;"></i>${time}</div>
                </div>`;
            });
        }

        container.innerHTML = html;

        // Auto-refresh mỗi 60 giây nếu còn VĐV đang tập
        if (active.length > 0) {
            clearTimeout(window._clbManageTimer);
            window._clbManageTimer = setTimeout(() => renderLetanClbManageTable(), 60000);
        }
    } catch (e) {
        container.innerHTML = '<div style="color:var(--text-muted); padding:15px; text-align:center;">Lỗi tải dữ liệu.</div>';
    }
};

// Lịch sử điểm danh CLB theo ngày cụ thể
window.renderClbHistoryAttendance = async function (dateStr) {
    const container = document.getElementById('clb-history-result');
    if (!container) return;
    if (!dateStr) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;"><i class="fa-solid fa-calendar-days" style="font-size:20px; display:block; margin-bottom:6px; opacity:0.3;"></i>Chọn ngày để xem lịch sử điểm danh</div>';
        return;
    }

    container.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        const brId = currentBranchId || currentUserBranchId;
        const selectedDate = new Date(dateStr);
        selectedDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const snap = await db.collection('clb_attendance')
            .where('branchId', '==', brId)
            .get();

        const dayDocs = snap.docs.filter(doc => {
            const ts = doc.data().timestamp?.toDate?.();
            return ts && ts >= selectedDate && ts < nextDay;
        }).sort((a, b) => {
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
            return;
        }

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
            <span style="font-size:12px; background:rgba(139,92,246,0.12); color:#8b5cf6; padding:3px 10px; border-radius:8px; font-weight:700;">${dayDocs.length} VĐV</span>
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
        console.error('renderClbHistoryAttendance error:', e);
        container.innerHTML = '<div style="text-align:center; padding:15px; color:#ef4444;">Lỗi tải dữ liệu.</div>';
    }
};

// Hiện danh sách VĐV điểm danh hôm nay (tab CLB) + nút xác nhận HLV
window.renderClbTodayAttendance = async function () {
    const container = document.getElementById('clb-today-attendance');
    if (!container) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();
    const brId = currentBranchId || currentUserBranchId;

    try {
        const snap = await db.collection('clb_attendance')
            .where('branchId', '==', brId)
            .get();

        const todayDocs = snap.docs.filter(doc => {
            const ts = doc.data().timestamp?.toDate?.();
            return ts && ts >= today;
        }).sort((a, b) => {
            const tA = a.data().timestamp?.toDate?.()?.getTime() || 0;
            const tB = b.data().timestamp?.toDate?.()?.getTime() || 0;
            return tB - tA;
        });

        if (todayDocs.length === 0) {
            container.innerHTML = '';
            return;
        }

        // HLV chỉ thấy VĐV lớp mình phụ trách
        let filteredDocs = todayDocs;
        if (currentUserRole === 'TEACHER') {
            const cc = window._currentUserData?.coachClasses || [];
            filteredDocs = todayDocs.filter(d => cc.includes(d.data().classLevel));
        }

        if (filteredDocs.length === 0) {
            container.innerHTML = '';
            return;
        }

        // Lấy thông tin athleteNote song song (Promise.all)
        const athleteIds = [...new Set(filteredDocs.map(d => d.data().athleteId))];
        const noteMap = {};
        const noteDocs = await Promise.all(athleteIds.map(aid => db.collection('athletes').doc(aid).get()));
        noteDocs.forEach(aDoc => {
            if (aDoc.exists) noteMap[aDoc.id] = aDoc.data().athleteNote || '';
        });

        const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' };
        const SESSION_MINUTES = 90;

        let html = `<div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h4 style="margin:0; font-size:14px; color:var(--text-color);"><i class="fa-solid fa-clipboard-check" style="color:#10b981;"></i> Điểm danh hôm nay (${filteredDocs.length})</h4>
                <button onclick="renderClbTodayAttendance()" style="border:none; background:rgba(37,99,235,0.1); color:var(--primary); padding:4px 10px; border-radius:6px; font-size:11px; cursor:pointer;"><i class="fa-solid fa-refresh"></i> Làm mới</button>
            </div>`;

        filteredDocs.forEach(doc => {
            const d = doc.data();
            const ts = d.timestamp?.toDate ? d.timestamp.toDate() : null;
            const time = ts ? ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
            const diffMin = ts ? Math.floor((now - ts) / 60000) : 999;
            const isActive = diffMin < SESSION_MINUTES;
            const remaining = SESSION_MINUTES - diffMin;
            const lc = levelColor[d.classLevel] || '#6b7280';
            const note = noteMap[d.athleteId] || '';
            const confirmed = d.coachConfirmed || false;

            html += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border:1px solid ${isActive ? 'rgba(34,197,94,0.3)' : 'var(--border-color)'}; border-radius:8px; margin-bottom:5px; background:${isActive ? 'rgba(34,197,94,0.03)' : 'var(--card-bg)'}; ${!isActive ? 'opacity:0.6;' : ''}">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        ${isActive ? '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#16a34a; animation:pulse 1.5s infinite;"></span>' : ''}
                        <span style="background:${lc}; color:#fff; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:700;">${d.classLevel || '?'}</span>
                        <span style="font-weight:600; font-size:13px; color:var(--text-color);">${d.athleteName || 'VĐV'}</span>
                        <span style="font-size:11px; color:var(--text-muted);"><i class="fa-solid fa-clock"></i> ${time}</span>
                        ${isActive ? `<span style="font-size:11px; color:#16a34a; font-weight:600;">Còn ${remaining}p</span>` : '<span style="font-size:11px; color:var(--text-muted);">Xong</span>'}
                        ${confirmed ? '<span style="font-size:11px; color:#10b981; font-weight:600;"><i class="fa-solid fa-circle-check"></i> HLV đã xác nhận</span>' : ''}
                    </div>
                    ${note ? `<div style="font-size:11px; color:#10b981; margin-top:3px;"><i class="fa-solid fa-clipboard"></i> ${note}</div>` : ''}
                </div>
                ${(currentUserRole === 'TEACHER' || currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') && !confirmed ? `
                <button onclick="confirmAttendanceCoach('${doc.id}')" style="border:none; background:rgba(16,185,129,0.15); color:#10b981; padding:5px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; border:1px solid rgba(16,185,129,0.3);">
                    <i class="fa-solid fa-check"></i> Xác nhận
                </button>` : ''}
                ${diffMin <= 20 ? `
                <button onclick="cancelClbAttendance('${doc.id}', '${(d.athleteName || 'VĐV').replace(/'/g, "\\'")}')"
                    style="border:none; background:rgba(239,68,68,0.12); color:#ef4444; padding:5px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; border:1px solid rgba(239,68,68,0.25);">
                    <i class="fa-solid fa-xmark"></i> Huỷ (${20 - diffMin}p)
                </button>` : ''}
            </div>`;
        });

        html += '</div>';
        container.innerHTML = html;

        // Auto-refresh mỗi 60s
        clearTimeout(window._clbTodayTimer);
        window._clbTodayTimer = setTimeout(() => renderClbTodayAttendance(), 60000);
    } catch (e) {
        console.error('Lỗi render today attendance:', e);
    }
};

// HLV xác nhận điểm danh
window.confirmAttendanceCoach = async function (attendanceDocId) {
    try {
        await db.collection('clb_attendance').doc(attendanceDocId).update({
            coachConfirmed: true,
            coachConfirmedBy: currentUserId,
            coachConfirmedName: currentUserDisplayName || 'HLV',
            coachConfirmedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        renderClbTodayAttendance(); // Refresh
    } catch (e) {
        alert('Lỗi xác nhận: ' + e.message);
    }
};

// Huỷ buổi tập CLB (trong 20 phút)
window.cancelClbAttendance = async function (attDocId, athleteName) {
    if (!confirm(`⚠️ Huỷ buổi tập CLB cho "${athleteName}"?`)) return;
    try {
        const attDoc = await db.collection('clb_attendance').doc(attDocId).get();
        if (!attDoc.exists) return alert('Không tìm thấy bản ghi!');
        const attData = attDoc.data();

        await db.collection('clb_attendance').doc(attDocId).delete();

        if (attData.athleteId) {
            const athleteRef = db.collection('athletes').doc(attData.athleteId);
            const athleteDoc = await athleteRef.get();
            if (athleteDoc.exists && (athleteDoc.data().totalAttendance || 0) > 0) {
                await athleteRef.update({ totalAttendance: firebase.firestore.FieldValue.increment(-1) });
            }
        }

        alert(`✅ Đã huỷ buổi tập CLB cho "${athleteName}".`);
        renderClbTodayAttendance();
        renderLetanClbManageTable();
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};


window.showTodayAttendance = async function () {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        let query = db.collection('attendance')
            .where('branchId', '==', currentBranchId);

        if (currentUserRole === 'TEACHER') {
            query = db.collection('attendance')
                .where('branchId', '==', currentBranchId)
                .where('teacherId', '==', currentUserId);
        }

        const snap = await query.get();
        const todayRecords = [];
        snap.docs.forEach(d => {
            const data = d.data();
            const ca = data.createdAt;
            if (ca) {
                const dt = ca.toDate ? ca.toDate() : new Date(ca);
                if (dt >= todayStart) {
                    todayRecords.push({ ...data, time: dt });
                }
            }
        });
        todayRecords.sort((a, b) => b.time - a.time);

        if (todayRecords.length === 0) {
            alert('📋 Chưa có HV nào điểm danh hôm nay.');
            return;
        }

        let overlay = document.getElementById('attendance-today-overlay');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'attendance-today-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:16px;';

        let listHtml = '';
        todayRecords.forEach(r => {
            const timeStr = r.time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const teacherLabel = currentUserRole !== 'TEACHER' ? `<div style="font-size:10px; color:#3b82f6;">GV: ${r.teacherName || 'N/A'}</div>` : '';
            listHtml += `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:var(--bg-color); border-radius:8px; margin-bottom:6px; border:1px solid var(--border-color);">
                    <div style="flex:1;">
                        <div style="font-weight:600; color:var(--text-color); font-size:13px;">${r.studentName || 'N/A'}</div>
                        ${teacherLabel}
                        <div style="font-size:10px; color:var(--text-muted);">Điểm danh bởi: ${r.checkedByName || 'N/A'}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; color:var(--primary); font-size:14px;">Buổi ${r.sessionNumber || '?'}</div>
                        <div style="font-size:10px; color:var(--text-muted);">${timeStr}</div>
                    </div>
                </div>`;
        });

        const dateStr = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        overlay.innerHTML = `
            <div style="background:var(--card-bg); border-radius:16px; padding:20px; max-width:450px; width:100%; max-height:80vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 style="margin:0; font-size:16px; color:var(--text-color);">📋 Điểm danh hôm nay (${todayRecords.length})</h3>
                    <button onclick="document.getElementById('attendance-today-overlay').remove()" style="border:none; background:none; font-size:20px; cursor:pointer; color:var(--text-muted);">✕</button>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">${dateStr}</div>
                ${listHtml}
            </div>`;

        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    } catch (e) {
        alert('❌ Lỗi: ' + e.message);
    }
};
