// ===== GreenPool App — Core Module (v7.0) =====
// State, Firebase, Utils, Notifications, Listeners

// ===================== STATE KHAI BÁO & FIREBASE ===================== //
// 'db' đã được khởi tạo ở index.html thông qua Firebase CDN
var auth = null;
var currentBranchId = null;
var currentUserId = null;
var currentUserRole = null;
var currentUserBranchId = null;
var currentUserDisplayName = null;
var isLoginMode = true;

var localState = {
    branches: [],
    teachers: [], // Các giáo viên thuộc cơ sở hiện tại (Lấy từ Users)
    sales: [],    // Các Sale thuộc cơ sở hiện tại (Lấy từ Users)
    students: [], // Các học viên thuộc cơ sở
    queue: [],        // Compat alias → fixedOrder
    fixedOrder: [],   // Thứ tự cố định GV (không đổi)
    currentIndex: 0,  // Con trỏ: vị trí GV đang là Top 1
    debtMap: {},      // {teacherId: soVongNo} — ngoại lệ
    queueNumberMap: {}, // {teacherId: sốTT} — số thứ tự vĩnh viễn
    fixedSlotNumbers: [], // [sốTT] — số thứ tự cố định cho mỗi slot (song song fixedOrder)
    testingMap: {},   // {teacherId: timestamp} GV đang bận test
    queueLoaded: false,
    firedUsers: []
};

// Môn Lặn: danh sách curriculum và số buổi
const DIVING_CURRICULUMS = {
    'Dolphin 1': 4,
    'Dolphin 2': 4,
    'Lặn Tiên cá': 4,
    'Trải nghiệm Tiên cá': 1
};
function isDivingCurriculum(cur) {
    return !!DIVING_CURRICULUMS[cur];
}

// ===================== BỘ LỌC THỜI GIAN ===================== //
var dateFilterMode = 'all'; // 'all' | 'today' | '7d' | '30d' | 'custom'
var dateFilterFrom = null;
var dateFilterTo = null;

// Lọc danh sách theo thời gian đăng ký (createdAt)
function filterByDate(items) {
    if (dateFilterMode === 'all') return items;
    const now = new Date();
    let from, to;

    if (dateFilterMode === 'today') {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 00:00 hôm nay
        to = new Date(from.getTime() + 24 * 60 * 60 * 1000); // 00:00 ngày mai
    } else if (dateFilterMode === '7d') {
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        to = now;
    } else if (dateFilterMode === '30d') {
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        to = now;
    } else if (dateFilterMode === 'custom') {
        from = dateFilterFrom ? new Date(dateFilterFrom) : new Date(0);
        to = dateFilterTo ? new Date(new Date(dateFilterTo).getTime() + 24 * 60 * 60 * 1000) : now;
    } else {
        return items;
    }

    return items.filter(item => {
        if (!item.createdAt) return false;
        const d = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        return d >= from && d <= to;
    });
}

// Chuyển đổi bộ lọc thời gian
window.setDateFilter = function (mode) {
    dateFilterMode = mode;
    // Cập nhật UI buttons
    document.querySelectorAll('.date-filter-btn').forEach(btn => {
        const isAct = btn.getAttribute('data-date') === mode;
        btn.style.background = isAct ? 'var(--primary)' : 'transparent';
        btn.style.color = isAct ? '#fff' : 'var(--text-muted)';
        btn.style.borderColor = isAct ? 'var(--primary)' : 'var(--border-color)';
    });
    // Hiện/ẩn ô custom date
    document.querySelectorAll('.custom-date-range').forEach(el => {
        el.style.display = mode === 'custom' ? 'flex' : 'none';
    });
    if (mode !== 'custom') {
        updateAllUI();
    }
};

window.applyCustomDateFilter = function () {
    const fromEl = document.getElementById('date-filter-from');
    const toEl = document.getElementById('date-filter-to');
    dateFilterFrom = fromEl?.value || null;
    dateFilterTo = toEl?.value || null;
    updateAllUI();
};

// Render thanh bộ lọc thời gian (dùng chung cho nhiều tab)
function renderDateFilterBar() {
    const today = new Date().toISOString().split('T')[0];
    return `
        <div style="margin-bottom: 12px;">
            <div style="display: flex; gap: 5px; flex-wrap: wrap; align-items: center;">
                <span style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-right: 4px;"><i class="fa-regular fa-calendar"></i> Thời gian:</span>
                <button class="date-filter-btn" data-date="all" onclick="setDateFilter('all')" style="padding: 4px 10px; border-radius: 16px; border: 1px solid var(--primary); background: var(--primary); color: #fff; font-size: 11px; font-weight: 600; cursor: pointer;">Tất cả</button>
                <button class="date-filter-btn" data-date="today" onclick="setDateFilter('today')" style="padding: 4px 10px; border-radius: 16px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); font-size: 11px; font-weight: 600; cursor: pointer;">Hôm nay</button>
                <button class="date-filter-btn" data-date="7d" onclick="setDateFilter('7d')" style="padding: 4px 10px; border-radius: 16px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); font-size: 11px; font-weight: 600; cursor: pointer;">7 ngày</button>
                <button class="date-filter-btn" data-date="30d" onclick="setDateFilter('30d')" style="padding: 4px 10px; border-radius: 16px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); font-size: 11px; font-weight: 600; cursor: pointer;">30 ngày</button>
                <button class="date-filter-btn" data-date="custom" onclick="setDateFilter('custom')" style="padding: 4px 10px; border-radius: 16px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); font-size: 11px; font-weight: 600; cursor: pointer;">Tùy chọn</button>
            </div>
            <div class="custom-date-range" style="display: none; gap: 8px; margin-top: 8px; align-items: center; flex-wrap: wrap;">
                <input type="date" id="date-filter-from" value="${today}" style="padding: 5px 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--card-bg); color: var(--text-color); font-size: 12px;">
                <span style="font-size: 12px; color: var(--text-muted);">→</span>
                <input type="date" id="date-filter-to" value="${today}" style="padding: 5px 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--card-bg); color: var(--text-color); font-size: 12px;">
                <button onclick="applyCustomDateFilter()" class="btn btn-sm" style="padding: 5px 12px; font-size: 11px; border-radius: 8px; background: var(--primary); color: #fff; border: none; cursor: pointer;">Áp dụng</button>
            </div>
        </div>
    `;
}

// Các hàm Unsubscribe (Để dọn dẹp realtime listener khi chuyển branch)
var unsubs = [];

// ===================== GOOGLE SHEET AUTO SYNC ===================== //
// Dán URL Web App từ Google Apps Script vào đây sau khi deploy
const GOOGLE_SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzzIll0r2UNbW_-zawsbxORoVrpH8PE8j3TjwPRtiVBR849Tg97aAXXK8wvCjLr6IEALQ/exec';
const GOOGLE_CLB_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyg85vttXlgX6Ijz45ygqBb9DaQ8IYvcya3mhyTC438BJoPWIg5jtc4sHGYkvFzOP0yzg/exec';

async function syncToGoogleSheet(data) {
    if (!GOOGLE_SHEET_WEBAPP_URL) return;
    try {
        console.log('📊 Sheet sync: sending data...', data.action, data.name || data.contractNumber || '');
        await fetch(GOOGLE_SHEET_WEBAPP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(data)
        });
        console.log('✅ Sheet sync: sent OK (no-cors, no response check)');
    } catch (e) {
        console.error('❌ Sheet sync error:', e);
    }
}

// Auto sync 1 dòng VĐV CLB lên Google Sheet
async function syncClbRowToSheet(data) {
    if (!GOOGLE_CLB_SHEET_URL) return;
    try {
        fetch(GOOGLE_CLB_SHEET_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(data)
        });
    } catch (e) { console.warn('CLB Sheet sync error:', e); }
}

// Đồng bộ từng cơ sở vào tab riêng trong Google Sheet
var _isSyncing = false;
var _syncAbort = false;

window.stopSyncSheet = function () {
    if (_isSyncing) {
        _syncAbort = true;
        alert('⏹️ Đang dừng đồng bộ... Chờ chút để hoàn tất.');
    }
};

window.syncAllStudentsToSheet = async function () {
    if (!GOOGLE_SHEET_WEBAPP_URL) return alert('Chưa cấu hình Google Sheet URL!');
    if (_isSyncing) return alert('⏳ Đang đồng bộ, vui lòng chờ...\n\nBấm nút Dừng đồng bộ để huỷ.');

    // Cho chọn cơ sở
    let branchOptions = '0. TẤT CẢ cơ sở\n';
    FIXED_BRANCHES.forEach((b, i) => { branchOptions += `${i + 1}. ${b.name}\n`; });
    const choice = prompt(`📊 ĐỒNG BỘ HỌC VIÊN LÊN SHEET\n\nChọn cơ sở để đồng bộ (nhập số):\n${branchOptions}\n⚠️ Dữ liệu cũ của CS được chọn sẽ XOÁ rồi ghi lại.`);
    if (choice === null) return;
    const choiceNum = parseInt(choice);
    if (isNaN(choiceNum) || choiceNum < 0 || choiceNum > FIXED_BRANCHES.length) {
        return alert('Lựa chọn không hợp lệ!');
    }
    const selectedBranch = choiceNum === 0 ? null : FIXED_BRANCHES[choiceNum - 1];
    const confirmMsg = selectedBranch
        ? `Đồng bộ HV cơ sở "${selectedBranch.name}"?\n⚠️ Tab "${selectedBranch.name}" trên Sheet sẽ bị xoá và ghi lại.`
        : 'Đồng bộ TẤT CẢ cơ sở?\n⚠️ Tất cả tab HV trên Sheet sẽ bị xoá và ghi lại.';
    if (!confirm(confirmMsg)) return;

    _isSyncing = true;
    _syncAbort = false;
    try {
        const studentsSnap = await db.collection('students').get();
        const usersSnap = await db.collection('users').get();
        const usersMap = {};
        usersSnap.forEach(doc => { usersMap[doc.id] = doc.data(); });

        const branchStudents = {};
        FIXED_BRANCHES.forEach(b => { branchStudents[b.name] = []; });

        studentsSnap.docs.forEach(doc => {
            const s = doc.data();
            const branch = FIXED_BRANCHES.find(b => b.id === s.branchId);
            const branchName = branch?.name || 'Khác';
            // Nếu chọn 1 CS cụ thể → chỉ lấy HV của CS đó
            if (selectedBranch && branchName !== selectedBranch.name) return;
            if (!branchStudents[branchName]) branchStudents[branchName] = [];
            const teacher = usersMap[s.assignedTeacherId];
            const creator = usersMap[s.creatorId];
            branchStudents[branchName].push({
                _sortTs: s.createdAt?.toDate ? s.createdAt.toDate().getTime() : 0,
                syncTime: new Date().toLocaleString('vi-VN'),
                createdAt: s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('vi-VN') : '',
                name: s.name || '',
                contractNumber: s.contractNumber || '',
                phone: s.phone || '',
                curriculum: s.curriculum || 'Bơi Ếch',
                ageCategory: s.ageCategory || 'Trẻ em',
                teacherName: teacher?.name || 'N/A',
                saleName: creator?.name || (s.source === 'Self' ? 'GV Tự tuyển' : 'N/A'),
                sessions: s.totalSessions || 10
            });
        });

        // Sắp xếp theo ngày tạo HĐ
        for (const arr of Object.values(branchStudents)) {
            arr.sort((a, b) => a._sortTs - b._sortTs);
        }

        let totalCount = 0;
        for (const [branchName, students] of Object.entries(branchStudents)) {
            if (students.length === 0) continue;
            if (_syncAbort) { alert('⏹️ Đã dừng đồng bộ!'); break; }

            console.log(`🔄 Đang xoá tab ${branchName}...`);
            await fetch(GOOGLE_SHEET_WEBAPP_URL, {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'clearBranch', branchName: branchName })
            });
            await new Promise(r => setTimeout(r, 1500));

            for (let i = 0; i < students.length; i++) {
                if (_syncAbort) { alert('⏹️ Đã dừng đồng bộ!'); break; }
                const s = students[i];
                await fetch(GOOGLE_SHEET_WEBAPP_URL, {
                    method: 'POST', mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        action: 'addRow', branchName, stt: i + 1,
                        syncTime: s.syncTime, createdAt: s.createdAt,
                        name: s.name, contractNumber: s.contractNumber,
                        phone: s.phone, curriculum: s.curriculum,
                        ageCategory: s.ageCategory, teacherName: s.teacherName,
                        saleName: s.saleName, sessions: s.sessions
                    })
                });
                if ((i + 1) % 10 === 0) console.log(`Sync ${branchName}: ${i + 1}/${students.length}`);
                await new Promise(r => setTimeout(r, 250));
            }
            if (_syncAbort) break;
            totalCount += students.length;
        }

        if (!_syncAbort) alert(`✅ Đã đồng bộ ${totalCount} học viên${selectedBranch ? ' (' + selectedBranch.name + ')' : ''} lên Google Sheet!`);
    } catch (e) {
        alert('Lỗi đồng bộ: ' + e.message);
    } finally {
        _isSyncing = false;
        _syncAbort = false;
    }
};

// ========== ĐỒNG BỘ LỊCH SỬ ĐIỂM DANH LÊN GOOGLE SHEET ========== //
var _isAttSyncing = false;
var _attSyncAbort = false;

window.stopAttSync = function () {
    if (_isAttSyncing) { _attSyncAbort = true; alert('⏹️ Đang dừng...'); }
};

window.syncAttendanceToSheet = async function () {
    if (!GOOGLE_SHEET_WEBAPP_URL) return alert('Chưa cấu hình Google Sheet URL!');
    if (_isAttSyncing) return alert('⏳ Đang đồng bộ, vui lòng chờ...');

    // Cho chọn cơ sở
    let branchOptions = '0. TẤT CẢ cơ sở\n';
    FIXED_BRANCHES.forEach((b, i) => { branchOptions += `${i + 1}. ${b.name}\n`; });
    const choice = prompt(`📋 ĐỒNG BỘ ĐIỂM DANH LÊN SHEET\n\nChọn cơ sở (nhập số):\n${branchOptions}\n• Yêu cầu: ĐÃ đồng bộ danh sách HV trước`);
    if (choice === null) return;
    const choiceNum = parseInt(choice);
    if (isNaN(choiceNum) || choiceNum < 0 || choiceNum > FIXED_BRANCHES.length) {
        return alert('Lựa chọn không hợp lệ!');
    }
    const selectedBranch = choiceNum === 0 ? null : FIXED_BRANCHES[choiceNum - 1];

    _isAttSyncing = true;
    _attSyncAbort = false;
    try {
        // Lấy toàn bộ attendance records
        const attSnap = await db.collection('attendance').get();
        const studentsSnap = await db.collection('students').get();

        // Map studentId → contractNumber + branchName
        const studentMap = {};
        studentsSnap.docs.forEach(doc => {
            const s = doc.data();
            const branch = FIXED_BRANCHES.find(b => b.id === s.branchId);
            const branchName = branch?.name || 'Khác';
            // Nếu chọn 1 CS → chỉ lấy HV của CS đó
            if (selectedBranch && branchName !== selectedBranch.name) return;
            studentMap[doc.id] = {
                contractNumber: s.contractNumber || '',
                branchName: branchName,
                totalSessions: s.totalSessions || 10
            };
        });

        // Nhóm attendance theo studentId, sắp xếp theo thời gian
        const attByStudent = {};
        attSnap.docs.forEach(doc => {
            const a = doc.data();
            if (!a.studentId || !studentMap[a.studentId]) return;
            if (!attByStudent[a.studentId]) attByStudent[a.studentId] = [];
            const ts = a.createdAt?.toDate ? a.createdAt.toDate() : null;
            attByStudent[a.studentId].push({
                date: ts ? ts.toLocaleDateString('vi-VN') : 'N/A',
                ts: ts ? ts.getTime() : 0
            });
        });

        // Sắp xếp theo thời gian cho từng HV
        for (const arr of Object.values(attByStudent)) {
            arr.sort((a, b) => a.ts - b.ts);
        }

        // Tìm maxSessions theo từng branch (để tạo header đầy đủ)
        const branchMaxSessions = {};
        for (const [studentId, records] of Object.entries(attByStudent)) {
            const info = studentMap[studentId];
            if (!info || !info.contractNumber) continue;
            const br = info.branchName;
            const maxS = Math.max(records.length, info.totalSessions || 10);
            branchMaxSessions[br] = Math.max(branchMaxSessions[br] || 0, maxS);
        }

        // Xoá attendance headers cũ cho mỗi branch trước khi ghi lại
        for (const [brName, maxS] of Object.entries(branchMaxSessions)) {
            if (_attSyncAbort) break;
            await fetch(GOOGLE_SHEET_WEBAPP_URL, {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'clearAttendanceCols',
                    branchName: brName,
                    maxSessions: maxS
                })
            });
            await new Promise(r => setTimeout(r, 500));
        }

        // Ghi điểm danh từng HV
        let count = 0;
        const total = Object.keys(attByStudent).length;
        for (const [studentId, records] of Object.entries(attByStudent)) {
            if (_attSyncAbort) break;
            const info = studentMap[studentId];
            if (!info || !info.contractNumber) continue;

            await fetch(GOOGLE_SHEET_WEBAPP_URL, {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'syncAttendanceBulk',
                    branchName: info.branchName,
                    contractNumber: info.contractNumber,
                    dates: records.map(r => r.date)
                })
            });
            count++;
            if (count % 5 === 0) {
                console.log(`📋 Sync điểm danh: ${count}/${total}`);
                await new Promise(r => setTimeout(r, 300));
            }
        }

        if (!_attSyncAbort) alert(`✅ Đã đồng bộ điểm danh ${count} học viên${selectedBranch ? ' (' + selectedBranch.name + ')' : ''} lên Google Sheet!`);
    } catch (e) {
        alert('Lỗi đồng bộ điểm danh: ' + e.message);
    } finally {
        _isAttSyncing = false;
        _attSyncAbort = false;
    }
};

// ========== ĐỒNG BỘ VĐV CLB KID TL RA GOOGLE SHEET ========== //
var _isClbSyncing = false;
var _clbSyncAbort = false;

window.stopClbSync = function () {
    if (_isClbSyncing) {
        _clbSyncAbort = true;
        alert('⏹️ Đang dừng đồng bộ CLB...');
    }
};

window.syncClbToSheet = async function () {
    if (!GOOGLE_CLB_SHEET_URL) return alert('Chưa cấu hình Google CLB Sheet URL!');
    if (_isClbSyncing) return alert('⏳ Đang đồng bộ CLB, vui lòng chờ...');
    if (!confirm('🏅 Đồng bộ VĐV CLB lên Google Sheet?\n\nMỗi cơ sở = 1 tab riêng.\n⚠️ Dữ liệu cũ sẽ được XOÁ rồi ghi lại từ đầu.')) return;

    _isClbSyncing = true;
    _clbSyncAbort = false;
    try {
        const athleteSnap = await db.collection('athletes').get();
        const usersSnap = await db.collection('users').get();
        const usersMap = {};
        usersSnap.forEach(doc => { usersMap[doc.id] = doc.data(); });

        const branchAthletes = {};
        FIXED_BRANCHES.forEach(b => { branchAthletes[b.name] = []; });

        athleteSnap.docs.forEach(doc => {
            const a = doc.data();
            const branch = FIXED_BRANCHES.find(b => b.id === a.branchId);
            const branchName = branch?.name || 'Khác';
            if (!branchAthletes[branchName]) branchAthletes[branchName] = [];

            const expDate = a.expiresAt?.toDate ? a.expiresAt.toDate() : null;
            const activatedDate = a.activatedAt?.toDate ? a.activatedAt.toDate() : null;

            branchAthletes[branchName].push({
                _sortTs: a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0,
                syncTime: new Date().toLocaleString('vi-VN'),
                name: a.name || '',
                phone: a.phone || '',
                contractNumber: a.contractNumber || '',
                athleteClass: a.athleteClass || a.classLevel || '',
                pkg: `${a.sessionsPerWeek || 3} buổi/tuần × ${a.contractMonths || 3} tháng`,
                activatedAt: activatedDate ? activatedDate.toLocaleDateString('vi-VN') : 'Chưa KH',
                expiresAt: expDate ? expDate.toLocaleDateString('vi-VN') : 'N/A',
                saleName: a.creatorName || usersMap[a.creatorId]?.name || 'N/A'
            });
        });

        // Sắp xếp theo ngày tạo
        for (const arr of Object.values(branchAthletes)) {
            arr.sort((a, b) => a._sortTs - b._sortTs);
        }

        let totalCount = 0;
        for (const [branchName, athletes] of Object.entries(branchAthletes)) {
            if (athletes.length === 0) continue;
            if (_clbSyncAbort) { alert('⏹️ Đã dừng đồng bộ CLB!'); break; }

            const tabName = 'CLB_' + branchName;

            // Xoá tab cũ
            await fetch(GOOGLE_CLB_SHEET_URL, {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'clearBranch', branchName: tabName })
            });
            await new Promise(r => setTimeout(r, 1500));

            for (let i = 0; i < athletes.length; i++) {
                if (_clbSyncAbort) { alert('⏹️ Đã dừng đồng bộ CLB!'); break; }
                const a = athletes[i];
                await fetch(GOOGLE_CLB_SHEET_URL, {
                    method: 'POST', mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        action: 'addClbRow', branchName: tabName, stt: i + 1,
                        syncTime: a.syncTime, name: a.name, phone: a.phone,
                        contractNumber: a.contractNumber, athleteClass: a.athleteClass,
                        pkg: a.pkg, activatedAt: a.activatedAt,
                        expiresAt: a.expiresAt, saleName: a.saleName
                    })
                });
                if ((i + 1) % 10 === 0) console.log(`Sync CLB ${branchName}: ${i + 1}/${athletes.length}`);
                await new Promise(r => setTimeout(r, 250));
            }
            if (_clbSyncAbort) break;
            totalCount += athletes.length;
        }

        if (!_clbSyncAbort) alert(`✅ Đã đồng bộ ${totalCount} VĐV CLB lên Google Sheet!`);
    } catch (e) {
        alert('Lỗi đồng bộ CLB: ' + e.message);
    } finally {
        _isClbSyncing = false;
        _clbSyncAbort = false;
    }
};

// ===================== ADMIN COLLAPSE TOGGLE ===================== //
window.toggleAdminSection = function (headerEl) {
    const body = headerEl.parentElement.querySelector('.admin-collapse-body');
    const arrow = headerEl.querySelector('.collapse-arrow');
    if (!body) return;
    if (body.style.display === 'none') {
        body.style.display = 'block';
        arrow.style.transform = 'rotate(0deg)';
    } else {
        body.style.display = 'none';
        arrow.style.transform = 'rotate(-90deg)';
    }
};

// ===================== UTILS ===================== //
function showLoading(show) { /* có thể thêm UX loading */ }

// Tách giá trị dropdown "Kiểu Bơi" thành curriculum + ageCategory
function parseCurriculumValue(raw) {
    const map = {
        'Ếch Trẻ em':       { curriculum: 'Bơi Ếch', ageCategory: 'Trẻ em' },
        'Ếch Người lớn':    { curriculum: 'Bơi Ếch', ageCategory: 'Người lớn' },
        'Sải Trẻ em':       { curriculum: 'Bơi Sải', ageCategory: 'Trẻ em' },
        'Sải Người lớn':    { curriculum: 'Bơi Sải', ageCategory: 'Người lớn' },
        'Ếch Vip Trẻ em':   { curriculum: 'Ếch Vip', ageCategory: 'Trẻ em' },
        'Ếch Vip Người lớn':{ curriculum: 'Ếch Vip', ageCategory: 'Người lớn' },
        'Sải Vip Trẻ em':   { curriculum: 'Sải Vip', ageCategory: 'Trẻ em' },
        'Sải Vip Người lớn':{ curriculum: 'Sải Vip', ageCategory: 'Người lớn' },
        'Bơi Ngửa':         { curriculum: 'Bơi Ngửa', ageCategory: '' },
        'Bơi Bướm':         { curriculum: 'Bơi Bướm', ageCategory: '' },
        'PT':               { curriculum: 'PT', ageCategory: '' },
        'Dolphin 1':        { curriculum: 'Dolphin 1', ageCategory: '' },
        'Dolphin 2':        { curriculum: 'Dolphin 2', ageCategory: '' },
        'Lặn Tiên cá':      { curriculum: 'Lặn Tiên cá', ageCategory: '' },
        'Trải nghiệm Tiên cá': { curriculum: 'Trải nghiệm Tiên cá', ageCategory: '' },
    };
    return map[raw] || { curriculum: raw, ageCategory: '' };
}

// Cập nhật Select box Các giáo viên cho mục đích hiển thị
function updateTeacherSelects() {
    // 1. Cập nhật thẻ Gợi ý Sale (Lấy top 1)
    updateSaleSuggestedTeacher();

    // 2. Teacher tab
    const viewSelect = document.getElementById('select-teacher-view');
    if (viewSelect) {
        const currVal = viewSelect.value;
        viewSelect.innerHTML = '<option value="">-- Chọn Giáo viên xem --</option>';
        localState.teachers.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            viewSelect.appendChild(opt);
        });
        if (currVal && localState.teachers.find(t => t.id === currVal)) {
            viewSelect.value = currVal;
        } else if (localState.teachers.length > 0) {
            viewSelect.value = localState.teachers[0].id;
        }
    }

    // 3. Sale tab - Self Recruit
    const selfSelect = document.getElementById('select-teacher-view-self');
    if (selfSelect) {
        const currSelfVal = selfSelect.value;
        selfSelect.innerHTML = '<option value="">-- Chọn đích danh Giáo viên --</option>';
        localState.teachers.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            selfSelect.appendChild(opt);
        });
        if (currSelfVal && localState.teachers.find(t => t.id === currSelfVal)) {
            selfSelect.value = currSelfVal;
        }
    }
}

function updateSaleSuggestedTeacher() {
    const suggestedDiv = document.getElementById('sale-suggested-teacher');
    const suggestedInput = document.getElementById('sale-suggested-teacher-id');
    const btnConfirm = document.getElementById('btn-sale-confirm');

    if (!suggestedDiv || !suggestedInput) return;

    if (localState.queue.length === 0) {
        suggestedDiv.textContent = 'Hàng chờ trống. Cần thêm Giáo viên!';
        suggestedInput.value = '';
        if (btnConfirm) btnConfirm.disabled = true;
        return;
    }

    // Tìm GV hợp lệ đầu tiên trong queue (bỏ qua ID không tồn tại)
    let topTeacher = null;
    for (const tid of localState.queue) {
        const found = localState.teachers.find(t => t.id === tid);
        if (found) { topTeacher = found; break; }
    }

    if (topTeacher) {
        suggestedDiv.innerHTML = `<span style="color:var(--primary)"><i class="fa-solid fa-person-swimming"></i> ${topTeacher.name}</span>`;
        suggestedInput.value = topTeacher.id;
        if (btnConfirm) btnConfirm.disabled = false;
    } else {
        suggestedDiv.textContent = 'Hàng chờ trống hoặc đang tải dữ liệu...';
        suggestedInput.value = '';
        if (btnConfirm) btnConfirm.disabled = true;
    }
}

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

        if (uniqueRecords.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">
                <i class="fa-solid fa-water" style="font-size:24px; display:block; margin-bottom:8px; opacity:0.3;"></i>
                Hiện tại không có học viên nào đang học tại bể
            </div>`;
            return;
        }

        // Gom theo GV
        const byTeacher = {};
        uniqueRecords.forEach(r => {
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

        const totalActive = uniqueRecords.length;
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
        const studentIds = [...new Set(uniqueRecords.map(r => r.studentId).filter(Boolean))];
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

// Auto-refresh live pool mỗi 120 giây (tiết kiệm reads)
// Gọi 1 lần sau 5s khi app load, sau đó mỗi 120s
setTimeout(() => { if (document.getElementById('live-pool-board')) renderLivePool(); }, 5000);
setInterval(() => { if (document.getElementById('live-pool-board')) renderLivePool(); }, 120000);

// Debounce auto-repair để tránh gọi lại liên tục khi queue thay đổi
var _autoRepairTimer = null;
var _autoRepairDone = false;

function autoRepairQueue() {
    if (_autoRepairDone || !localState.queueLoaded || localState.teachers.length === 0) return;
    if (_autoRepairTimer) clearTimeout(_autoRepairTimer);
    _autoRepairTimer = setTimeout(() => {
        _autoRepairDone = true;
        const teacherIds = new Set(localState.teachers.map(t => t.id));

        // 1. Thêm GV thiếu vào fixedOrder
        const missingTeachers = localState.teachers.filter(t => !(localState.fixedOrder || []).includes(t.id) && !t.queuePaused);
        if (missingTeachers.length > 0) {
            missingTeachers.forEach(t => {
                pushTeacherToQueue(t.id, t.teacherType || 'Chính', currentBranchId);
            });
        }

        // 1b. GV Chính cần 2 slot nhưng chỉ có 1 → thêm slot thứ 2 cách xa
        localState.teachers.forEach(t => {
            if (t.queuePaused) return;
            const type = t.teacherType || 'Chính';
            if (type === 'Chính') {
                const count = localState.fixedOrder.filter(id => id === t.id).length;
                if (count === 1) {
                    console.warn('Auto-restoring 2nd slot for GV Chính:', t.name);
                    const qDoc = db.collection('queues').doc(currentBranchId);
                    db.runTransaction(async (transaction) => {
                        const doc = await transaction.get(qDoc);
                        if (doc.exists) {
                            let fo = doc.data().fixedOrder || [];
                            const cnt = fo.filter(id => id === t.id).length;
                            if (cnt === 1) {
                                const firstIdx = fo.indexOf(t.id);
                                let ci = doc.data().currentIndex || 0;
                                let insertPos = firstIdx + Math.floor(fo.length / 2);
                                if (insertPos >= fo.length) insertPos = fo.length;
                                // Tránh liền nhau
                                if (insertPos > 0 && fo[insertPos - 1] === t.id) insertPos++;
                                if (insertPos < fo.length && fo[insertPos] === t.id) insertPos++;
                                fo.splice(insertPos, 0, t.id);
                                // Adjust currentIndex nếu insert trước vị trí hiện tại
                                if (insertPos <= ci) ci++;
                                console.warn('⚠️ Auto-repair: thêm slot 2 cho', t.name, 'tại vị trí', insertPos, '→ fixedOrder length:', fo.length, 'CI:', ci);
                                transaction.update(qDoc, { fixedOrder: fo, currentIndex: ci });
                            }
                        }
                    }).catch(e => console.error('Restore 2nd slot error:', e));
                }
            }
        });

        // 2. Xóa ID "mồ côi" (GV đã xóa/đuổi nhưng ID còn kẹt)
        const orphanIds = localState.fixedOrder.filter(id => !teacherIds.has(id));
        if (orphanIds.length > 0) {
            const uniqueOrphans = [...new Set(orphanIds)];
            console.warn('Auto-cleaning orphan fixedOrder IDs:', uniqueOrphans);
            const qDoc = db.collection('queues').doc(currentBranchId);
            db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let fo = doc.data().fixedOrder || [];
                    let ci = doc.data().currentIndex || 0;
                    // Lưu GV hiện tại trước khi xoá orphan
                    const currentTeacherId = fo[ci] || null;
                    fo = fo.filter(id => teacherIds.has(id));
                    if (fo.length === 0) {
                        ci = 0;
                    } else if (currentTeacherId && fo.includes(currentTeacherId)) {
                        // Tìm lại vị trí GV hiện tại sau khi xoá orphan
                        ci = fo.indexOf(currentTeacherId);
                    } else {
                        // GV hiện tại cũng bị xoá → giữ index hợp lệ
                        if (ci >= fo.length) ci = 0;
                    }
                    transaction.update(qDoc, { fixedOrder: fo, currentIndex: ci });
                }
            }).catch(e => console.error('Cleanup orphan error:', e));
        }
    }, 2000); // Debounce 2 giây
}

// Cập nhật giao diện toàn diện (gọi từ listeners, cần typeof guard vì role modules có thể chưa load)
function updateAllUI() {
    updateTeacherSelects();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderTeacherStudents === 'function') renderTeacherStudents();
    if (typeof renderSaleStats === 'function') renderSaleStats();
    if (typeof renderLetanManageTable === 'function') renderLetanManageTable();
    if (typeof renderLetanClbManageTable === 'function') renderLetanClbManageTable();
}


// ===================== REALTIME FIREBASE LISTENERS ===================== //

// Clear old listeners
function clearListeners() {
    unsubs.forEach(unsub => unsub());
    unsubs = [];
    localState.teachers = [];
    localState.sales = [];
    localState.students = [];
    localState.queue = [];
    localState.fixedOrder = [];
    localState.currentIndex = 0;
    localState.debtMap = {};
    localState.queueNumberMap = {};
    localState.testingMap = {};
    localState.queueLoaded = false;
    localState.firedUsers = [];
}

// Lắng nghe dữ liệu Cơ Sở hiện tại
function listenToBranchData(branchId) {
    clearListeners();
    currentBranchId = branchId;
    if (typeof listenToAthletes === 'function') listenToAthletes(); // Reload CLB athletes for the selected branch

    // 1. Lắng nghe Giáo viên (Từ Collection users)
    const u1 = db.collection('users').where('role', '==', 'TEACHER').where('branchId', '==', branchId)
        .onSnapshot(snap => {
            localState.teachers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateAllUI();
        });

    // 2. Lắng nghe Học viên — lọc theo role để tiết kiệm reads
    let studentsQuery;
    if (currentUserRole === 'TEACHER') {
        studentsQuery = db.collection('students')
            .where('assignedTeacherId', '==', currentUserId);
    } else if (currentUserRole === 'SALE') {
        studentsQuery = db.collection('students')
            .where('creatorId', '==', currentUserId);
    } else {
        studentsQuery = db.collection('students')
            .where('branchId', '==', branchId);
    }
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

    // 3. Lắng nghe Queue
    const u3 = db.collection('queues').doc(branchId)
        .onSnapshot(doc => {
            localState.queueLoaded = true;
            if (doc.exists) {
                const d = doc.data();
                // Hỗ trợ backward compat: nếu chưa migrate → dùng turns
                localState.fixedOrder = d.fixedOrder || d.turns || [];
                localState.currentIndex = d.currentIndex || 0;
                localState.debtMap = d.debtMap || {};
                localState.queueNumberMap = d.queueNumberMap || {};
                localState.fixedSlotNumbers = d.fixedSlotNumbers || [];
                localState.queue = localState.fixedOrder; // Compat alias
                localState.testingMap = d.testingMap || {};
                // Auto-migrate: nếu có turns mà chưa có fixedOrder → lưu fixedOrder
                if (!d.fixedOrder && d.turns && d.turns.length > 0) {
                    db.collection('queues').doc(branchId).update({
                        fixedOrder: d.turns,
                        currentIndex: 0,
                        debtMap: {}
                    }).catch(e => console.error('Auto-migrate queue error:', e));
                }
                // Auto-assign số thứ tự cho GV chưa có
                const fo = localState.fixedOrder;
                const numMap = { ...(d.queueNumberMap || {}) };
                let nextNum = d.nextQueueNumber || 1;
                let needsUpdate = false;
                const uniqueIds = [...new Set(fo)];
                uniqueIds.forEach(tid => {
                    if (!numMap[tid]) {
                        numMap[tid] = nextNum;
                        nextNum++;
                        needsUpdate = true;
                    }
                });

                // Auto-migrate: tạo fixedSlotNumbers nếu chưa có hoặc bị lệch
                let slotNums = d.fixedSlotNumbers || [];
                if (slotNums.length !== fo.length) {
                    // Gán số cố định cho mỗi slot (1, 2, 3, ... theo thứ tự fixedOrder)
                    slotNums = fo.map((_, idx) => idx + 1);
                    localState.fixedSlotNumbers = slotNums;
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    localState.queueNumberMap = numMap;
                    db.collection('queues').doc(branchId).update({
                        queueNumberMap: numMap,
                        nextQueueNumber: nextNum,
                        fixedSlotNumbers: slotNums
                    }).catch(e => console.error('Auto-assign queue numbers error:', e));
                }

                // Auto-migrate: xóa debtMap cũ dùng teacherId (không có prefix 's'), chuyển sang slot-based
                const dm = { ...localState.debtMap };
                const oldTeacherKeys = Object.keys(dm).filter(k => !k.startsWith('s'));
                if (oldTeacherKeys.length > 0) {
                    oldTeacherKeys.forEach(k => delete dm[k]);
                    localState.debtMap = dm;
                    db.collection('queues').doc(branchId).update({ debtMap: dm })
                        .catch(e => console.error('Migrate old debtMap error:', e));
                    console.log('🔄 Auto-migrated old teacherId-based debtMap keys');
                }

                // Auto-normalize debt: nếu TẤT CẢ active slots đều nợ → trừ nợ min
                const activeSlotKeys = [];
                for (let k = 0; k < fo.length; k++) {
                    const tid = fo[k];
                    const t = localState.teachers.find(tt => tt.id === tid);
                    if (t && !t.queuePaused) activeSlotKeys.push('s' + k);
                }
                if (activeSlotKeys.length > 0 && Object.keys(dm).length > 0) {
                    const debtValues = activeSlotKeys.map(sk => dm[sk] || 0);
                    const allHaveDebt = debtValues.every(v => v > 0);
                    if (allHaveDebt) {
                        const minDebt = Math.min(...debtValues);
                        const newDm = { ...dm };
                        activeSlotKeys.forEach(sk => {
                            newDm[sk] = (newDm[sk] || 0) - minDebt;
                            if (newDm[sk] <= 0) delete newDm[sk];
                        });
                        localState.debtMap = newDm;
                        db.collection('queues').doc(branchId).update({ debtMap: newDm })
                            .catch(e => console.error('Auto-normalize debt error:', e));
                        console.log(`🔄 Auto-normalize: tất cả slots đều nợ ≥ ${minDebt} → đã trừ ${minDebt} cho tất cả.`);
                    }
                }
            } else {
                localState.fixedOrder = [];
                localState.currentIndex = 0;
                localState.debtMap = {};
                localState.queueNumberMap = {};
                localState.fixedSlotNumbers = [];
                localState.queue = [];
                localState.testingMap = {};
            }
            if (typeof renderDashboard === 'function') renderDashboard();
        });

    // 4. Lắng nghe Sale (Từ Collection users)
    const u4 = db.collection('users').where('role', '==', 'SALE').where('branchId', '==', branchId)
        .onSnapshot(snap => {
            localState.sales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderDashboard();
        });

    // 5. Lắng nghe GV/Sale đã bị đuổi việc (giữ tên để lookup)
    const u5 = db.collection('users').where('role', '==', 'FIRED').where('branchId', '==', branchId)
        .onSnapshot(snap => {
            localState.firedUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateAllUI();
        });

    unsubs.push(u1, u2, u3, u4, u5);
}

// ===================== CORE LOGIC & ACTIONS ===================== //

// Hàm tự động nhét GV mới vào cuối Queue (Phụ thuộc vào Type)
async function pushTeacherToQueue(teacherId, type, targetBranchId = currentBranchId) {
    if (!targetBranchId) return;
    const qDoc = db.collection('queues').doc(targetBranchId);
    const slots = type === 'Chính' ? 2 : 1;

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(qDoc);
            let fo = [];
            let ci = 0;
            let dm = {};
            if (doc.exists) {
                fo = doc.data().fixedOrder || doc.data().turns || [];
                ci = doc.data().currentIndex || 0;
                dm = doc.data().debtMap || {};
            }
            if (fo.includes(teacherId)) return;

            // GV mới: nợ lượt = 0, giữ nguyên nợ của GV khác
            dm[teacherId] = 0;

            // Gán số thứ tự vĩnh viễn cho GV mới
            let numMap = doc.exists ? (doc.data().queueNumberMap || {}) : {};
            let nextNum = doc.exists ? (doc.data().nextQueueNumber || 1) : 1;
            if (!numMap[teacherId]) {
                numMap[teacherId] = nextNum;
                nextNum++;
            }

            // Lấy fixedSlotNumbers hiện tại
            let slotNums = doc.exists ? (doc.data().fixedSlotNumbers || []) : [];
            // Đảm bảo slotNums đồng bộ với fo trước khi thêm
            while (slotNums.length < fo.length) slotNums.push(slotNums.length + 1);
            let nextSlotNum = slotNums.length > 0 ? Math.max(...slotNums) + 1 : 1;

            // Slot 1: cuối fixedOrder
            fo.push(teacherId);
            slotNums.push(nextSlotNum);
            nextSlotNum++;

            // Slot 2 (GV Chính): xen vào cách xa slot 1
            if (slots === 2 && fo.length > 1) {
                const firstIdx = fo.length - 1; // vừa push
                let insertPos = firstIdx - Math.floor(fo.length / 2);
                if (insertPos < 0) insertPos = 0;
                // Tránh liền nhau
                if (insertPos > 0 && fo[insertPos - 1] === teacherId) insertPos = Math.max(0, insertPos - 1);
                if (insertPos < fo.length && fo[insertPos] === teacherId) insertPos++;
                fo.splice(insertPos, 0, teacherId);
                slotNums.splice(insertPos, 0, nextSlotNum);
                nextSlotNum++;
                // Fix: nếu splice trước currentIndex → tăng ci để giữ đúng lượt GV khác
                if (insertPos <= ci) ci++;
            } else if (slots === 2) {
                fo.push(teacherId);
                slotNums.push(nextSlotNum);
                nextSlotNum++;
            }

            if (doc.exists) {
                transaction.update(qDoc, { fixedOrder: fo, currentIndex: ci, debtMap: dm, queueNumberMap: numMap, nextQueueNumber: nextNum, fixedSlotNumbers: slotNums });
            } else {
                transaction.set(qDoc, { fixedOrder: fo, currentIndex: ci, debtMap: dm, queueNumberMap: numMap, nextQueueNumber: nextNum, fixedSlotNumbers: slotNums, testingMap: {} });
            }
        });
    } catch (e) { console.error(e); }
}

// Tìm vị trí GV tiếp theo có thể nhận HĐ (bỏ qua paused, debt)
// Nếu GV có debt > 0: giảm debt 1, skip qua
function getNextActiveIndex(fixedOrder, currentIdx, debtMap, teachers, slotNumbers) {
    const len = fixedOrder.length;
    if (len === 0) return { nextIndex: 0, updatedDebt: {}, skippedSlots: [] };
    const updatedDebt = { ...debtMap };
    const skippedSlots = [];
    const sns = slotNumbers || [];

    // Bước 1: Tìm slot THỰC SỰ nhận HV (bỏ qua debt + paused từ currentIdx)
    let actualReceiver = currentIdx;
    for (let i = 0; i < len; i++) {
        const tid = fixedOrder[actualReceiver];
        const teacher = teachers.find(t => t.id === tid);
        if (!teacher || teacher.queuePaused) {
            // Paused/không tồn tại → skip, không ghi (vì GV không active)
            actualReceiver = (actualReceiver + 1) % len;
            continue;
        }
        const sk = 's' + actualReceiver;
        if ((updatedDebt[sk] || 0) > 0) {
            const debtBefore = updatedDebt[sk];
            updatedDebt[sk]--;
            if (updatedDebt[sk] <= 0) delete updatedDebt[sk];
            skippedSlots.push({
                slotIndex: actualReceiver,
                teacherId: tid,
                teacherName: teacher.name || '?',
                slotNumber: sns[actualReceiver] || (actualReceiver + 1),
                reason: 'debt',
                debtBefore: debtBefore,
                debtAfter: updatedDebt[sk] || 0
            });
            actualReceiver = (actualReceiver + 1) % len;
            continue;
        }
        break;
    }

    // Bước 2: Tìm slot TIẾP THEO sau slot nhận (KHÔNG tiêu nợ)
    let checked = 0;
    let idx = (actualReceiver + 1) % len;
    while (checked < len) {
        const tid = fixedOrder[idx];
        const teacher = teachers.find(t => t.id === tid);
        if (!teacher || teacher.queuePaused) {
            idx = (idx + 1) % len;
            checked++;
            continue;
        }
        return { nextIndex: idx, updatedDebt, skippedSlots, receiverIndex: actualReceiver };
    }
    return { nextIndex: (actualReceiver + 1) % len, updatedDebt, skippedSlots, receiverIndex: actualReceiver };
}

// ===================== QUEUE ACTION LOG ===================== //
// Ghi log thay đổi turn — giữ 5 vòng turn gần nhất
async function logQueueAction(params) {
    const brId = params.branchId || currentBranchId;
    try {
        await db.collection('queue_logs').add({
            branchId: brId,
            action: params.action || 'unknown',
            fromIndex: params.fromIndex ?? null,
            toIndex: params.toIndex ?? null,
            teacherId: params.teacherId || null,
            teacherName: params.teacherName || null,
            studentName: params.studentName || null,
            contractNumber: params.contractNumber || null,
            detail: params.detail || '',
            performedBy: currentUserId,
            performedByName: currentUserDisplayName || window._currentUserData?.name || 'Hệ thống',
            debtSnapshot: params.debtSnapshot || null,
            skippedSlots: params.skippedSlots || [],
            slotNumber: params.slotNumber || 0,
            roundNumber: params.roundNumber || 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Auto-cleanup: giữ tối đa 5 vòng turn
        const maxKeep = Math.max((localState.fixedOrder?.length || 10) * 5 + 10, 60);
        const allLogs = await db.collection('queue_logs')
            .where('branchId', '==', brId)
            .orderBy('createdAt', 'desc')
            .get();
        if (allLogs.size > maxKeep) {
            const toDelete = allLogs.docs.slice(maxKeep);
            const batch = db.batch();
            toDelete.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`🧹 Queue log cleanup: xóa ${toDelete.length} log cũ (giữ ${maxKeep})`);
        }
    } catch (e) { console.warn('Queue log error:', e); }
}

// ===================== HỆ THỐNG THÔNG BÁO ===================== //

// Gửi thông báo cho user
async function sendNotification(toUserId, type, message) {
    if (!toUserId) { console.warn('sendNotification: toUserId is empty!'); return; }
    try {
        const ref = await db.collection('notifications').add({
            toUserId,
            type, // 'contract', 'contract_exception', 'penalty'
            message,
            fromUserId: currentUserId,
            fromUserName: currentUserDisplayName || 'Hệ thống',
            branchId: currentBranchId,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log(`🔔 Notification sent → ${toUserId} (type: ${type}, id: ${ref.id})`);
    } catch (e) {
        console.error('Lỗi gửi thông báo:', e);
    }
}

// Listener thông báo real-time
var notifUnsub = null;
var notifData = [];
var shownNotifIds = new Set(); // Track đã hiện push notification chưa

// Xin quyền + đăng ký FCM token cho push notifications
async function requestNotificationPermission() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.warn('Browser không hỗ trợ Notification hoặc ServiceWorker');
        return;
    }
    try {
        // Nếu chưa hỏi quyền lần nào hoặc đã từ chối, hiện banner nhắc
        if (Notification.permission === 'default') {
            showNotifPermissionBanner();
        }
        if (Notification.permission !== 'granted') {
            const perm = await Notification.requestPermission();
            console.log('Notification permission:', perm);
            if (perm !== 'granted') {
                showNotifPermissionBanner();
                return;
            }
            hideNotifPermissionBanner();
        }
        if (!currentUserId) return;

        // Lấy FCM token — đăng ký SW trước, rồi mới init messaging
        let swReg;
        try {
            swReg = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
        } catch (swErr) {
            console.warn('ServiceWorker registration failed:', swErr);
            return;
        }
        const messaging = firebase.messaging();
        let token = null;
        try {
            token = await messaging.getToken({ vapidKey: 'BJ0lg_355URnJMi7X3LZH4erZJTK2ZRYyco1QX_OnNTa_q9YF6wBLy1MlslCCurQRp22KR_qGLdxPRJbC4QxhRo', serviceWorkerRegistration: swReg });
        } catch (e1) {
            console.warn('FCM getToken failed:', e1);
        }
        if (!token) {
            console.warn('Không lấy được FCM token');
            return;
        }
        console.log('✅ FCM token:', token.substring(0, 20) + '...');

        // Lưu token vào user document (hỗ trợ nhiều thiết bị)
        const userRef = db.collection('users').doc(currentUserId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return;

        const existingTokens = userDoc.data().fcmTokens || [];
        if (!existingTokens.includes(token)) {
            existingTokens.push(token);
            await userRef.update({ fcmTokens: existingTokens });
            console.log('✅ FCM token saved!');
        }

        // Lắng nghe foreground messages (khi app đang mở)
        messaging.onMessage((payload) => {
            console.log('Foreground FCM:', payload);
            const title = payload.notification?.title || '🔔 GreenPool';
            const body = payload.notification?.body || '';
            showBrowserNotification(title, body, 'fcm-' + Date.now());
            showToastNotification(title, body);
        });
    } catch (e) {
        console.warn('FCM setup error:', e);
    }
}

// Banner nhắc bật thông báo
function showNotifPermissionBanner() {
    if (document.getElementById('notif-perm-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'notif-perm-banner';
    banner.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:99998; background:linear-gradient(135deg, #1e40af, #3b82f6); color:#fff; padding:14px 20px; border-radius:14px; box-shadow:0 8px 32px rgba(0,0,0,0.3); display:flex; align-items:center; gap:12px; max-width:400px; width:90%;';
    banner.innerHTML = `
        <div style="font-size:24px;">🔔</div>
        <div style="flex:1;">
            <div style="font-weight:700; font-size:14px;">Bật thông báo</div>
            <div style="font-size:12px; opacity:0.9;">Nhận thông báo HĐ mới, điểm danh, phạt... ngay trên điện thoại</div>
        </div>
        <button onclick="requestNotificationPermission(); this.closest('#notif-perm-banner').remove();" style="border:none; background:rgba(255,255,255,0.2); color:#fff; padding:8px 16px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap;">Bật ngay</button>
        <button onclick="this.closest('#notif-perm-banner').remove()" style="border:none; background:none; color:rgba(255,255,255,0.6); font-size:18px; cursor:pointer;">&times;</button>
    `;
    document.body.appendChild(banner);
}
function hideNotifPermissionBanner() {
    document.getElementById('notif-perm-banner')?.remove();
}

// Hiện browser push notification
function showBrowserNotification(title, body, tag) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        const notif = new Notification(title, {
            body: body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: tag || 'greenpool-notif',
            vibrate: [200, 100, 200],
            requireInteraction: true
        });
        notif.onclick = () => {
            window.focus();
            notif.close();
        };
    } catch (e) {
        // Fallback cho mobile: dùng service worker registration
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, {
                    body: body,
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: tag || 'greenpool-notif',
                    vibrate: [200, 100, 200],
                    requireInteraction: true
                });
            });
        }
    }
}

// Toast notification popup — hiện rõ trên màn hình
// Phát tiếng chuông thông báo bằng Web Audio API
function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Nốt 1
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = 830; // Nốt cao
        gain1.gain.setValueAtTime(0.3, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.3);

        // Nốt 2 (cao hơn)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = 1046; // Nốt cao hơn
        gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.15);
        osc2.stop(ctx.currentTime + 0.5);

        // Nốt 3 (cao nhất)
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.value = 1318;
        gain3.gain.setValueAtTime(0.25, ctx.currentTime + 0.3);
        gain3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(ctx.currentTime + 0.3);
        osc3.stop(ctx.currentTime + 0.7);

        // Tự đóng sau 1s
        setTimeout(() => ctx.close(), 1000);
    } catch (e) { console.warn('Sound error:', e); }

    // Rung điện thoại
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }
}

function showToastNotification(title, body) {
    // Phát chuông + rung
    playNotificationSound();
    // Tạo container nếu chưa có
    let container = document.getElementById('toast-notif-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-notif-container';
        container.style.cssText = 'position:fixed; top:20px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:8px; pointer-events:none; max-width:360px;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = 'pointer-events:auto; background:var(--card-bg, #1e293b); border:1px solid var(--primary, #2563eb); border-radius:12px; padding:14px 18px; box-shadow:0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(37,99,235,0.3); animation:slideInRight 0.3s ease; cursor:pointer; max-width:100%;';
    toast.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:10px;">
            <div style="font-size:20px; flex-shrink:0;">🔔</div>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:13px; color:var(--primary, #3b82f6); margin-bottom:3px;">${title}</div>
                <div style="font-size:12px; color:var(--text-color, #e2e8f0); line-height:1.4; word-break:break-word;">${body.length > 120 ? body.substring(0, 120) + '...' : body}</div>
            </div>
            <div style="font-size:14px; color:var(--text-muted, #64748b); cursor:pointer; flex-shrink:0;" onclick="this.closest('div[style]').remove()">&times;</div>
        </div>
    `;
    toast.onclick = () => toast.remove();
    container.appendChild(toast);

    // Inject animation nếu chưa có
    if (!document.getElementById('toast-anim-style')) {
        const style = document.createElement('style');
        style.id = 'toast-anim-style';
        style.textContent = `@keyframes slideInRight { from { transform: translateX(100%); opacity:0; } to { transform: translateX(0); opacity:1; } } @keyframes fadeOut { from { opacity:1; } to { opacity:0; transform:translateY(-10px); } }`;
        document.head.appendChild(style);
    }

    // Tự ẩn sau 6 giây
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 6000);
}

function listenToNotifications() {
    if (notifUnsub) notifUnsub();
    if (!currentUserId) return;

    notifUnsub = db.collection('notifications')
        .where('toUserId', '==', currentUserId)
        .onSnapshot(snap => {
            console.log('🔔 Notification listener: received', snap.docs.length, 'notifications');
            const prevIds = new Set(notifData.map(n => n.id));
            notifData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort in JS thay vì orderBy trong Firestore (tránh composite index)
            notifData.sort((a, b) => {
                const tA = a.createdAt?.toDate?.()?.getTime() || 0;
                const tB = b.createdAt?.toDate?.()?.getTime() || 0;
                return tB - tA;
            });

            // Auto-cleanup: xóa notifications đã đọc quá 7 ngày
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const oldRead = notifData.filter(n => {
                if (!n.read) return false;
                const t = n.createdAt?.toDate?.();
                return t && t < weekAgo;
            });
            if (oldRead.length > 0) {
                const batch = db.batch();
                oldRead.forEach(n => batch.delete(db.collection('notifications').doc(n.id)));
                batch.commit().then(() => console.log(`🧹 Đã xóa ${oldRead.length} thông báo cũ`)).catch(() => {});
            }

            notifData = notifData.slice(0, 50);

            // Push notification cho thông báo MỚI (chưa đọc, chưa hiện)
            notifData.forEach(n => {
                if (!n.read && !shownNotifIds.has(n.id) && prevIds.size > 0) {
                    // Chỉ push khi không phải lần load đầu (prevIds.size > 0)
                    const title = n.type === 'penalty' ? '⚠️ Phạt Mất Lượt!'
                        : n.type === 'contract_exception' ? '✨ Hợp đồng Ngoại lệ'
                            : n.type === 'transfer' ? '🔄 Chuyển nhượng HV'
                                : n.type === 'test_kick' ? '🧪 Giao Test Khách'
                                    : n.type === 'attendance' ? '📋 Điểm danh HV'
                                        : n.type === 'salary' ? '💰 Chốt lương'
                                            : n.type === 'completion' ? '🎉 Hoàn thành khóa'
                                                : '📝 Học viên Mới!';
                    showBrowserNotification(title, n.message, n.id);
                    showToastNotification(title, n.message);
                }
                shownNotifIds.add(n.id);
            });

            renderNotificationBadge();
            renderNotificationPanel();
        }, err => {
            console.error('Notification listener error:', err);
        });
}

function renderNotificationBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const unread = notifData.filter(n => !n.read).length;
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
}

function renderNotificationPanel() {
    const panel = document.getElementById('notif-list');
    if (!panel) return;

    if (notifData.length === 0) {
        panel.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fa-solid fa-bell-slash" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>Chưa có thông báo nào</div>';
        return;
    }

    let html = '';
    notifData.forEach(n => {
        const isUnread = !n.read;
        let timeStr = '';
        if (n.createdAt) {
            const d = n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt);
            timeStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }
        const typeIcon = n.type === 'penalty' ? '⚠️' : n.type === 'contract_exception' ? '✨' : n.type === 'salary' ? '💰' : n.type === 'completion' ? '🎉' : '📝';
        const bgColor = isUnread ? 'rgba(37,99,235,0.06)' : 'transparent';
        const borderLeft = isUnread ? '3px solid var(--primary)' : '3px solid transparent';

        html += `
            <div onclick="markNotifRead('${n.id}')" style="padding: 10px 12px; border-bottom: 1px solid var(--border-color); background: ${bgColor}; border-left: ${borderLeft}; cursor: pointer; transition: all 0.2s;">
                <div style="font-size: 13px; color: var(--text-color); line-height: 1.4;">${n.message}</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                    <i class="fa-regular fa-clock"></i> ${timeStr}
                    ${isUnread ? '<span style="color: var(--primary); font-weight: 600; margin-left: 8px;">● Mới</span>' : ''}
                </div>
            </div>
        `;
    });
    panel.innerHTML = html;
}

// Đánh dấu đã đọc
window.markNotifRead = async function (notifId) {
    try {
        await db.collection('notifications').doc(notifId).update({ read: true });
    } catch (e) { console.error(e); }
};

// Đánh dấu tất cả đã đọc
window.markAllNotifsRead = async function () {
    const unread = notifData.filter(n => !n.read);
    const batch = db.batch();
    unread.forEach(n => {
        batch.update(db.collection('notifications').doc(n.id), { read: true });
    });
    try { await batch.commit(); } catch (e) { console.error(e); }
};

// Đóng panel khi bấm ra ngoài
document.addEventListener('click', function (e) {
    const panel = document.getElementById('notif-panel');
    const bell = document.getElementById('notif-bell-btn');
    if (!panel || !bell) return;
    if (!panel.contains(e.target) && !bell.contains(e.target)) {
        panel.classList.remove('show');
    }
});

// Xử lý Hợp đồng do Sale Gán (Có Nút 1 và Nút 2 Ngoại Lệ)

// ===================== KHỞI TẠO CƠ SỞ (BRANCH_LOGIC) ===================== //

// Danh sách 5 cơ sở cố định
var FIXED_BRANCHES = [
    { id: "branch_thuy_khue", name: "20 Thuỵ Khuê" },
    { id: "branch_nguyen_co_thach", name: "24 Nguyễn Cơ Thạch" },
    { id: "branch_cung_ttdn", name: "Cung TTDN" },
    { id: "branch_hoang_mai", name: "Hoàng Mai" },
    { id: "branch_thanh_tri", name: "Thanh Trì" }
];

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
    if (currentUserRole === 'ADMIN' || currentUserRole === 'KETOAN') {
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

    // Nếu không phải ADMIN/KETOAN thì Disable tính năng chọn cơ sở luôn để giao diện là tĩnh
    if (currentUserRole !== 'ADMIN' && currentUserRole !== 'KETOAN') {
        branchSelect.disabled = true;
    } else {
        branchSelect.disabled = false;
    }

    const targetId = localState.branches[0].id; // Lấy cơ sở đầu tiên trong mảng đã lọc làm gốc
    branchSelect.value = targetId;
    listenToBranchData(targetId);

    // Ẩn/hiện phần quản lý cơ sở theo quyền (chỉ ADMIN thấy)
    const branchSection = document.getElementById('settings-branch-section');
    if (branchSection) branchSection.style.display = currentUserRole === 'ADMIN' ? 'block' : 'none';
    const addForm = document.getElementById('settings-add-branch-form');
    if (addForm) addForm.style.display = currentUserRole === 'ADMIN' ? 'block' : 'none';

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
        const pauseBtn = currentUserRole === 'ADMIN' ? (isPaused
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

// ===================== AVATAR / HỒ SƠ NGƯỜI DÙNG ===================== //

// Xử lý upload ảnh đại diện
window.handleAvatarUpload = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Vui lòng chọn file ảnh!'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Ảnh quá lớn! Tối đa 5MB.'); return; }

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = async function () {
            // Nén ảnh xuống 150x150
            const canvas = document.createElement('canvas');
            const size = 150;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            // Crop hình vuông từ tâm
            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

            const base64 = canvas.toDataURL('image/jpeg', 0.7);

            try {
                await db.collection('users').doc(currentUserId).update({ avatarUrl: base64 });
                renderAvatarDisplay(base64);
                alert('✅ Đã cập nhật ảnh đại diện!');
            } catch (err) {
                console.error(err);
                alert('Lỗi: ' + err.message);
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

// Render ảnh đại diện vào vòng tròn (cả profile và header)
function renderAvatarDisplay(avatarUrl) {
    const el = document.getElementById('user-avatar-display');
    const headerEl = document.getElementById('current-user-avatar');
    if (el) {
        if (avatarUrl) {
            el.innerHTML = `<img src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            const initial = (currentUserDisplayName || 'U').charAt(0).toUpperCase();
            el.innerHTML = initial;
        }
    }
    if (headerEl) {
        if (avatarUrl) {
            headerEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            const initial = (currentUserDisplayName || 'U').charAt(0).toUpperCase();
            headerEl.innerHTML = `<span style="font-size:16px;font-weight:700;">${initial}</span>`;
        }
    }
}

// Render hồ sơ người dùng trong tab Cài đặt
function renderUserProfile(data) {
    const roleNames = {
        'ADMIN': '💎 Giám Đốc',
        'MANAGER': '🏢 Quản lý Cơ sở',
        'SALE': '💼 Chuyên viên Sale',
        'TEACHER': '🏊 Huấn luyện viên'
    };
    const nameEl = document.getElementById('user-profile-name');
    const roleEl = document.getElementById('user-profile-role');
    const branchEl = document.getElementById('user-profile-branch');

    if (nameEl) nameEl.textContent = data.name || 'Chưa đặt tên';
    if (roleEl) roleEl.textContent = roleNames[data.role] || data.role || '';
    if (branchEl) {
        const branch = FIXED_BRANCHES.find(b => b.id === data.branchId);
        branchEl.textContent = branch ? `📍 ${branch.name}` : '';
    }
    renderAvatarDisplay(data.avatarUrl || '');

    // Load thông tin bổ sung vào form
    const phoneEl = document.getElementById('profile-phone');
    const qualEl = document.getElementById('profile-qualification');
    const expEl = document.getElementById('profile-experience');
    if (phoneEl) phoneEl.value = data.phone || '';
    if (qualEl) qualEl.value = data.qualification || '';
    if (expEl) expEl.value = data.experience || '';
}

// Lưu thông tin hồ sơ bổ sung
window.saveProfileInfo = async function () {
    const phone = document.getElementById('profile-phone')?.value?.trim() || '';
    const qualification = document.getElementById('profile-qualification')?.value?.trim() || '';
    const experience = document.getElementById('profile-experience')?.value?.trim() || '';

    try {
        await db.collection('users').doc(currentUserId).update({
            phone,
            qualification,
            experience
        });
        alert('✅ Đã cập nhật hồ sơ thành công!');
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

// Đổi mật khẩu
window.changePassword = async function () {
    const currentPw = document.getElementById('current-password')?.value || '';
    const newPw = document.getElementById('new-password')?.value || '';
    const confirmPw = document.getElementById('confirm-password')?.value || '';

    if (!currentPw) { alert('Vui lòng nhập mật khẩu hiện tại!'); return; }
    if (!newPw) { alert('Vui lòng nhập mật khẩu mới!'); return; }
    if (newPw.length < 6) { alert('Mật khẩu mới phải có ít nhất 6 ký tự!'); return; }
    if (newPw !== confirmPw) { alert('❌ Mật khẩu mới không khớp! Vui lòng nhập lại.'); return; }
    if (newPw === currentPw) { alert('Mật khẩu mới phải khác mật khẩu hiện tại!'); return; }

    try {
        const user = auth.currentUser;
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPw);
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPw);

        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';

        alert('✅ Đã đổi mật khẩu thành công!');
    } catch (e) {
        console.error(e);
        if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
            alert('❌ Mật khẩu hiện tại không đúng!');
        } else if (e.code === 'auth/weak-password') {
            alert('❌ Mật khẩu mới quá yếu! Cần ít nhất 6 ký tự.');
        } else {
            alert('Lỗi: ' + e.message);
        }
    }
};

// KHÔNG CHẠY KHỞI TẠO CƠ SỞ Ở ĐÂY NỮA MÀ CHỜ AUTH DUYỆT XONG MỚI CHẠY (initFixedBranches trong auth.onAuthStateChanged)

// ===================== DARK/LIGHT MODE LOGIC ===================== //
const themeToggleBtn = document.getElementById('theme-toggle-btn'); // This declaration is now redundant but kept as per instruction to only make specified changes.

function initThemeMode() {
    const savedTheme = localStorage.getItem('greenpool-theme');
    // Nếu có chọn Dark, hoặc tự hệ điều hành đang là Dark
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeToggleUI(true);
    }
}

function updateThemeToggleUI(isDark) {
    if (!themeToggleBtn) return;
    if (isDark) {
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        themeToggleBtn.classList.add('dark-active');
    } else {
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        themeToggleBtn.classList.remove('dark-active');
    }
}

// Chạy cấu hình CSS Mode lần đầu load web
initThemeMode();

window.toggleLoginMode = function () {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-register-fields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('btn-auth-submit').textContent = isLoginMode ? 'Đăng Nhập' : 'Đăng Ký';
    document.getElementById('auth-toggle-text').textContent = isLoginMode ? 'Chưa có tài khoản?' : 'Đã có tài khoản?';
    const toggleLink = document.getElementById('auth-toggle-link');
    if (toggleLink) toggleLink.textContent = isLoginMode ? 'Đăng ký ngay' : 'Đăng nhập';
    const errorMsg = document.getElementById('auth-error-msg');
    if (errorMsg) errorMsg.style.display = 'none';
    const custCheckbox = document.getElementById('auth-customer-checkbox');
    if (custCheckbox) custCheckbox.style.display = isLoginMode ? 'none' : 'block';
};

// Quên mật khẩu
window.forgotPassword = function () {
    const email = (document.getElementById('auth-email')?.value || '').trim();
    if (!email) {
        alert('⚠️ Vui lòng nhập email vào ô Email trước rồi bấm "Quên mật khẩu".');
        return;
    }
    firebase.auth().sendPasswordResetEmail(email)
        .then(() => {
            alert(`✅ Đã gửi email đặt lại mật khẩu đến:\n📧 ${email}\n\nVui lòng kiểm tra hộp thư (kể cả thư mục Spam).`);
        })
        .catch(err => {
            if (err.code === 'auth/user-not-found') {
                alert('❌ Email này chưa được đăng ký trong hệ thống.');
            } else if (err.code === 'auth/invalid-email') {
                alert('❌ Email không hợp lệ.');
            } else {
                alert('❌ Lỗi: ' + err.message);
            }
        });
};

// Admin đổi mật khẩu user
window.adminResetUserPassword = async function () {
    if (currentUserRole !== 'ADMIN') return alert('⚠️ Chỉ Admin được đổi mật khẩu!');
    const email = prompt('📧 Nhập email tài khoản cần đổi mật khẩu:');
    if (!email) return;
    const newPassword = prompt(`🔑 Nhập mật khẩu mới cho ${email}:\n(Tối thiểu 6 ký tự)`);
    if (!newPassword) return;
    if (newPassword.length < 6) return alert('❌ Mật khẩu phải ít nhất 6 ký tự!');

    if (!confirm(`Xác nhận đổi mật khẩu cho:\n📧 ${email}\n🔑 Mật khẩu mới: ${newPassword}`)) return;

    try {
        const resetFn = firebase.functions().httpsCallable('adminResetPassword');
        const result = await resetFn({ email, newPassword });
        alert(`✅ ${result.data.message}`);
    } catch (err) {
        alert('❌ Lỗi: ' + (err.message || err));
    }
};

// ===================== CAM KẾT MIỄN TRỪ TRÁCH NHIỆM (WAIVER) ===================== //

const WAIVER_CONTENT = `
<h3 style="text-align:center; color:#0891b2; margin:0 0 12px;">🤿 CAM KẾT MIỄN TRỪ TRÁCH NHIỆM</h3>
<p style="text-align:center; font-size:12px; color:var(--text-muted); margin-bottom:16px;">Chương trình Lặn - Trung tâm Bơi Thăng Long</p>
<div style="font-size:13px; line-height:1.7; color:var(--text-color);">
<p>Tôi, người ký tên dưới đây, xác nhận và đồng ý với các điều khoản sau:</p>
<p><strong>1. Nhận thức rủi ro:</strong> Tôi hiểu rằng hoạt động lặn (bao gồm Dolphin, Lặn Tiên cá) là môn thể thao dưới nước có yếu tố rủi ro cao hơn các hoạt động bơi lội thông thường, bao gồm nhưng không giới hạn: nguy cơ đuối nước, chấn thương, tai nạn trong môi trường nước sâu.</p>
<p><strong>2. Tình trạng sức khỏe:</strong> Tôi cam kết rằng bản thân (hoặc người được đại diện) đủ sức khỏe để tham gia hoạt động lặn. Tôi không mắc các bệnh lý tim mạch, hô hấp, động kinh, hoặc các bệnh lý khác có thể gây nguy hiểm khi hoạt động dưới nước. Nếu có bất kỳ vấn đề sức khỏe nào, tôi đã thông báo cho Trung tâm trước khi đăng ký.</p>
<p><strong>3. Tuân thủ hướng dẫn:</strong> Tôi cam kết tuân thủ mọi hướng dẫn, quy định an toàn của Giáo viên và Trung tâm trong suốt quá trình học lặn. Tôi sẽ không tự ý thực hiện các hoạt động lặn ngoài sự giám sát của Giáo viên.</p>
<p><strong>4. Miễn trừ trách nhiệm:</strong> Tôi tự nguyện miễn trừ Trung tâm Bơi Thăng Long, Giáo viên, và các nhân viên liên quan khỏi mọi trách nhiệm pháp lý đối với các chấn thương, thiệt hại, hoặc tổn thất phát sinh trong quá trình tham gia hoạt động lặn, trừ trường hợp do lỗi cố ý hoặc sơ suất nghiêm trọng của Trung tâm.</p>
<p><strong>5. Đối với trẻ em (dưới 18 tuổi):</strong> Nếu người tham gia là trẻ em, phụ huynh/người giám hộ ký cam kết này thay mặt và chịu trách nhiệm hoàn toàn.</p>
<p><strong>6. Xác nhận:</strong> Tôi đã đọc, hiểu rõ và tự nguyện ký vào bản cam kết này.</p>
</div>`;

// Mở form ký waiver
window.openWaiverForm = function (studentId, studentName) {
    let overlay = document.getElementById('waiver-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'waiver-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:9999; display:flex; align-items:center; justify-content:center; padding:12px;';

    overlay.innerHTML = `
    <div style="background:var(--card-bg); border-radius:16px; padding:20px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.4);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-weight:700; font-size:15px; color:var(--text-color);">📋 Cam kết cho: <span style="color:#0891b2;">${studentName}</span></span>
            <button onclick="document.getElementById('waiver-overlay').remove()" style="border:none; background:none; font-size:20px; cursor:pointer; color:var(--text-muted);">✕</button>
        </div>
        <div style="max-height:300px; overflow-y:auto; border:1px solid var(--border-color); border-radius:10px; padding:16px; margin-bottom:16px; background:rgba(0,0,0,0.02);">
            ${WAIVER_CONTENT}
        </div>
        <div style="margin-bottom:12px;">
            <div style="font-size:13px; font-weight:600; color:var(--text-color); margin-bottom:8px;">✍️ Chữ ký của bạn:</div>
            <canvas id="waiver-canvas" width="460" height="150" style="width:100%; height:150px; border:2px dashed var(--border-color); border-radius:10px; background:#fff; cursor:crosshair; touch-action:none;"></canvas>
            <div style="display:flex; justify-content:flex-end; margin-top:4px;">
                <button onclick="clearWaiverCanvas()" style="font-size:11px; border:none; background:none; color:#ef4444; cursor:pointer; text-decoration:underline;">Xóa chữ ký</button>
            </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <input type="checkbox" id="waiver-agree" style="width:18px; height:18px; cursor:pointer; accent-color:#0891b2;">
            <label for="waiver-agree" style="font-size:13px; color:var(--text-color); cursor:pointer; font-weight:500;">
                Tôi đã đọc, hiểu rõ và đồng ý với các điều khoản trên
            </label>
        </div>
        <button id="waiver-submit-btn" onclick="submitWaiver('${studentId}', '${studentName.replace(/'/g, "\\\\'")}')"
            style="width:100%; padding:12px; border-radius:10px; border:none; background:#0891b2; color:#fff; font-weight:700; font-size:14px; cursor:pointer; opacity:0.5;" disabled>
            🤿 Ký xác nhận cam kết
        </button>
    </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Setup canvas drawing
    setTimeout(() => initWaiverCanvas(), 100);

    // Enable button only when checkbox is checked
    const cb = document.getElementById('waiver-agree');
    const btn = document.getElementById('waiver-submit-btn');
    if (cb && btn) {
        cb.addEventListener('change', () => {
            btn.disabled = !cb.checked;
            btn.style.opacity = cb.checked ? '1' : '0.5';
        });
    }
};

var _waiverDrawing = false;
var _waiverCtx = null;
var _waiverHasDrawn = false;

function initWaiverCanvas() {
    const canvas = document.getElementById('waiver-canvas');
    if (!canvas) return;
    _waiverCtx = canvas.getContext('2d');
    _waiverCtx.strokeStyle = '#000';
    _waiverCtx.lineWidth = 2;
    _waiverCtx.lineCap = 'round';
    _waiverHasDrawn = false;

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    canvas.addEventListener('mousedown', (e) => { _waiverDrawing = true; const p = getPos(e); _waiverCtx.beginPath(); _waiverCtx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove', (e) => { if (!_waiverDrawing) return; const p = getPos(e); _waiverCtx.lineTo(p.x, p.y); _waiverCtx.stroke(); _waiverHasDrawn = true; });
    canvas.addEventListener('mouseup', () => { _waiverDrawing = false; });
    canvas.addEventListener('mouseleave', () => { _waiverDrawing = false; });

    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); _waiverDrawing = true; const p = getPos(e); _waiverCtx.beginPath(); _waiverCtx.moveTo(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!_waiverDrawing) return; const p = getPos(e); _waiverCtx.lineTo(p.x, p.y); _waiverCtx.stroke(); _waiverHasDrawn = true; }, { passive: false });
    canvas.addEventListener('touchend', () => { _waiverDrawing = false; });
}

window.clearWaiverCanvas = function () {
    const canvas = document.getElementById('waiver-canvas');
    if (canvas && _waiverCtx) {
        _waiverCtx.clearRect(0, 0, canvas.width, canvas.height);
        _waiverHasDrawn = false;
    }
};

window.submitWaiver = async function (studentId, studentName) {
    const cb = document.getElementById('waiver-agree');
    if (!cb || !cb.checked) return alert('⚠️ Bạn cần đồng ý các điều khoản!');
    if (!_waiverHasDrawn) return alert('⚠️ Vui lòng ký chữ ký trước khi gửi!');

    const canvas = document.getElementById('waiver-canvas');
    const signatureData = canvas.toDataURL('image/png');

    try {
        await db.collection('students').doc(studentId).update({
            waiverSigned: true,
            waiverSignedAt: firebase.firestore.FieldValue.serverTimestamp(),
            waiverSignature: signatureData
        });

        alert(`✅ Đã ký cam kết miễn trừ trách nhiệm thành công!\n\nHV "${studentName}" giờ có thể tham gia lớp Lặn.`);
        document.getElementById('waiver-overlay')?.remove();

        // Reload kết quả tìm kiếm
        const searchInput = document.getElementById('customer-search') || document.getElementById('khachhang-search');
        if (searchInput && searchInput.value) searchStudentProgress(searchInput.value);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Xem cam kết đã ký
window.viewSignedWaiver = async function (studentId, studentName) {
    try {
        const doc = await db.collection('students').doc(studentId).get();
        if (!doc.exists) return alert('Không tìm thấy học viên!');
        const data = doc.data();
        if (!data.waiverSigned) return alert('HV chưa ký cam kết!');

        const signedDate = data.waiverSignedAt?.toDate ? data.waiverSignedAt.toDate().toLocaleString('vi-VN') : 'Không rõ';
        const signatureImg = data.waiverSignature || '';

        let overlay = document.getElementById('waiver-view-overlay');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'waiver-view-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:9999; display:flex; align-items:center; justify-content:center; padding:12px;';

        overlay.innerHTML = `
        <div style="background:var(--card-bg); border-radius:16px; padding:20px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.4);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-weight:700; font-size:15px; color:var(--text-color);">📋 Cam kết đã ký — <span style="color:#0891b2;">${studentName}</span></span>
                <button onclick="document.getElementById('waiver-view-overlay').remove()" style="border:none; background:none; font-size:20px; cursor:pointer; color:var(--text-muted);">✕</button>
            </div>
            <div style="padding:8px 12px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); border-radius:8px; margin-bottom:12px; font-size:12px; color:#059669; font-weight:600;">
                ✅ Đã ký lúc: ${signedDate}
            </div>
            <div style="max-height:250px; overflow-y:auto; border:1px solid var(--border-color); border-radius:10px; padding:14px; margin-bottom:16px; background:rgba(0,0,0,0.02); font-size:12px;">
                ${WAIVER_CONTENT}
            </div>
            <div style="border:1px solid var(--border-color); border-radius:10px; padding:12px; background:#fff;">
                <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:8px;">✍️ Chữ ký:</div>
                ${signatureImg ? `<img src="${signatureImg}" style="width:100%; max-height:150px; object-fit:contain; border-radius:6px;" alt="Chữ ký">` : '<div style="text-align:center; color:var(--text-muted); padding:20px;">Không có dữ liệu chữ ký</div>'}
            </div>
        </div>`;

        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

