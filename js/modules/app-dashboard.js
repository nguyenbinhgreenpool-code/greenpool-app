// ===== GreenPool App — Dashboard & Live Pool (v11.0) =====
// Bảng điều khiển, thống kê, HV đang bơi

// ============ ĐANG HỌC TẠI BỂ (LIVE POOL) ============ //
async function renderLivePool() {
    const container = document.getElementById('live-pool-board');
    if (!container || !currentBranchId) return;

    try {
        const now = new Date();
        const sixtyMinAgo = new Date(now.getTime() - 60 * 60 * 1000);

        const snap = await db.collection('attendance')
            .where('branchId', '==', currentBranchId)
            .where('createdAt', '>=', sixtyMinAgo)
            .get();

        // Filter trong JS để tránh cần composite index
        const activeRecords = [];
        snap.forEach(doc => {
            const d = doc.data();
            const time = d.createdAt?.toDate();
            if (time && time >= sixtyMinAgo) {
                activeRecords.push({
                    studentId: d.studentId || '',
                    studentName: d.studentName || '?',
                    teacherId: d.teacherId,
                    teacherName: d.teacherName || '?',
                    time: time
                });
            }
        });

        // Chỉ giữ bản ghi mới nhất của mỗi HV (tránh trùng)
        const latestByStudent = {};
        activeRecords.forEach(r => {
            const key = r.studentName;
            if (!latestByStudent[key] || r.time > latestByStudent[key].time) {
                latestByStudent[key] = r;
            }
        });
        const uniqueRecords = Object.values(latestByStudent);

        // SALE: chỉ hiện HV mình tạo
        let filteredRecords = uniqueRecords;
        if (currentUserRole === 'SALE') {
            const myStudentIds = new Set((localState.students || []).map(s => s.id));
            filteredRecords = uniqueRecords.filter(r => myStudentIds.has(r.studentId));
        }

        if (filteredRecords.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">
                <i class="fa-solid fa-water" style="font-size:24px; display:block; margin-bottom:8px; opacity:0.3;"></i>
                ${currentUserRole === 'SALE' ? 'Không có HV của bạn đang học tại bể' : 'Hiện tại không có học viên nào đang học tại bể'}
            </div>`;
            return;
        }

        // Gom theo GV
        const byTeacher = {};
        filteredRecords.forEach(r => {
            if (!byTeacher[r.teacherId]) {
                byTeacher[r.teacherId] = { name: r.teacherName, students: [] };
            }
            const remaining = Math.max(0, Math.ceil((r.time.getTime() + 60 * 60 * 1000 - now.getTime()) / 60000));
            byTeacher[r.teacherId].students.push({
                name: r.studentName,
                studentId: r.studentId,
                remaining: remaining
            });
        });

        const totalActive = filteredRecords.length;
        let html = `<div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; padding:10px 14px; background:rgba(6,182,212,0.08); border-radius:10px; border:1px solid rgba(6,182,212,0.2);">
            <div style="font-size:28px; font-weight:700; color:#06b6d4;">${totalActive}</div>
            <div>
                <div style="font-weight:600; font-size:14px; color:var(--text-color);">học viên đang tại bể</div>
                <div style="font-size:11px; color:var(--text-muted);">Cập nhật: ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
        </div>`;

        // Dùng localState thay vì query từng student doc (tiết kiệm reads!)
        const studentSaleMap = {};
        const allStudents = localState.students || [];
        const studentIds = [...new Set(filteredRecords.map(r => r.studentId).filter(Boolean))];
        studentIds.forEach(sid => {
            const stu = allStudents.find(s => s.id === sid);
            if (stu) {
                let saleName = stu.creatorName || '';
                if (!saleName && stu.creatorId) {
                    const allUsers = [...(localState.teachers || []), ...(localState.sales || []), ...(localState.firedUsers || [])];
                    const u = allUsers.find(x => x.id === stu.creatorId);
                    if (u) saleName = u.name || '';
                }
                if (saleName) studentSaleMap[sid] = saleName;
            }
        });

        html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">`;
        Object.keys(byTeacher).forEach(tid => {
            const t = byTeacher[tid];
            html += `<div style="padding:12px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-weight:600; font-size:13px; color:var(--primary);"><i class="fa-solid fa-person-swimming"></i> ${t.name}</span>
                    <span style="background:rgba(6,182,212,0.15); color:#06b6d4; font-weight:700; font-size:12px; padding:2px 8px; border-radius:10px;">${t.students.length}</span>
                </div>`;
            t.students.forEach(s => {
                const saleName = studentSaleMap[s.studentId] || '';
                html += `<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0; border-bottom:1px dashed var(--border-color);">
                    <span>${s.name}${saleName ? ` <span style="font-size:10px; color:#f59e0b; font-weight:500;">(${saleName})</span>` : ''}</span>
                    <span style="color:var(--text-muted); font-size:11px;">⏳ ${s.remaining}p</span>
                </div>`;
            });
            html += `</div>`;
        });
        html += `</div>`;

        container.innerHTML = html;
    } catch (e) {
        console.error('renderLivePool error:', e);
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Không tải được dữ liệu</div>`;
    }
}

// Auto-refresh live pool mỗi 3 phút — CHỈ ADMIN + MANAGER + SALE
// Lễ tân không có tab Tổng quan nên không bị ảnh hưởng
const _livePoolRoles = ['ADMIN', 'MANAGER', 'SALE'];
setTimeout(() => {
    if (document.getElementById('live-pool-board') && _livePoolRoles.includes(currentUserRole)) renderLivePool();
}, 5000);
setInterval(() => {
    const board = document.getElementById('live-pool-board');
    if (!board) return;
    if (document.hidden) return;
    if (!_livePoolRoles.includes(currentUserRole)) return;
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset.tab !== 'dashboard') return;
    renderLivePool();
}, 180000); // 180s = 3 phút

// ===== AUDIT: Đối chiếu toàn bộ sessions vs attendance (chi tiết) =====
window.auditSessionData = async function () {
    try {
        const [stuSnap, attSnap, usersSnap] = await Promise.all([
            db.collection('students').get(),
            db.collection('attendance').get(),
            db.collection('users').get()
        ]);
        const teacherNames = {};
        usersSnap.forEach(doc => { teacherNames[doc.id] = doc.data().name || ''; });

        const attCount = {};
        attSnap.forEach(doc => {
            const sid = doc.data().studentId;
            attCount[sid] = (attCount[sid] || 0) + 1;
        });

        // Phân tích chi tiết
        let matched = 0, oldStudents = 0, realErrors = 0;
        const errorDetails = [];

        stuSnap.forEach(doc => {
            const s = doc.data();
            const sessions = s.sessions || 0;
            const attRecords = attCount[doc.id] || 0;
            const gv = teacherNames[s.assignedTeacherId] || 'Chưa gán';

            if (sessions === attRecords) {
                matched++;
            } else if (sessions > attRecords) {
                // HV cũ: sessions từ increment, không có attendance → OK
                oldStudents++;
            } else {
                // attendance > sessions → LỖI THỰC SỰ
                realErrors++;
                errorDetails.push({
                    name: s.name,
                    gv: gv,
                    sessions: sessions,
                    attendance: attRecords,
                    diff: attRecords - sessions
                });
            }
        });

        // Tạo báo cáo
        let report = `📊 KIỂM TRA DỮ LIỆU\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `📦 Tổng HV: ${stuSnap.size}\n`;
        report += `✅ Khớp: ${matched}\n`;
        report += `⚪ HV cũ (sessions>attendance, OK): ${oldStudents}\n`;
        report += `❌ Lỗi thực (attendance>sessions): ${realErrors}\n\n`;

        if (realErrors > 0) {
            report += `CHI TIẾT LỖI:\n`;
            errorDetails.sort((a, b) => b.diff - a.diff);
            errorDetails.forEach((d, i) => {
                report += `${i + 1}. "${d.name}" (GV: ${d.gv}) - sessions=${d.sessions}, điểm danh=${d.attendance}, thiếu ${d.diff} buổi\n`;
            });
        } else {
            report += `✅ KHÔNG CÓ LỖI!`;
        }

        // Log to console
        console.log('📊 AUDIT REPORT:', report);
        console.log('📊 ERRORS:', errorDetails);

        // Show alert
        let alertMsg = `📊 Tổng: ${stuSnap.size} | ✅ Khớp: ${matched} | ⚪ HV cũ OK: ${oldStudents} | ❌ Lỗi: ${realErrors}\n`;
        if (realErrors > 0) {
            alertMsg += `\nHV cần sửa (attendance > sessions):\n`;
            errorDetails.slice(0, 20).forEach((d, i) => {
                alertMsg += `${i + 1}. "${d.name}" (${d.gv}) ${d.sessions}→${d.attendance}\n`;
            });
            if (errorDetails.length > 20) alertMsg += `... và ${errorDetails.length - 20} HV khác`;
        } else {
            alertMsg += `\n✅ Không có lỗi thực sự! HV cũ (sessions>att) là bình thường.`;
        }
        alert(alertMsg);
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
