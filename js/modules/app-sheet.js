// ===== GreenPool App — Google Sheet Sync (v11.0) =====
// Đồng bộ dữ liệu lên Google Sheet

// ===================== GOOGLE SHEET AUTO SYNC ===================== //
// Dán URL Web App từ Google Apps Script vào đây sau khi deploy
var GOOGLE_SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzen64O9Pz0B5CChZVKcKrdTXoNFIwx6h9f-ZW7upT1cHuPa-p7M9GREtyI6H1Fon85Sg/exec';
var GOOGLE_CLB_SHEET_URL = 'https://script.google.com/macros/s/AKfycbw7CKESPLtYiiU76fPOL8SZp5zYGirFaE0XQMgISqqrwgvTsgKkaOZEq5vlEC6nyP9DXg/exec';

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
