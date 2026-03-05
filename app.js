// ===================== STATE KHAI BÁO & FIREBASE ===================== //
// 'db' đã được khởi tạo ở index.html thông qua Firebase CDN
let auth = null;
let currentBranchId = null;
let currentUserId = null;
let currentUserRole = null;
let currentUserBranchId = null;
let currentUserDisplayName = null;
let isLoginMode = true;

let localState = {
    branches: [],
    teachers: [], // Các giáo viên thuộc cơ sở hiện tại (Lấy từ Users)
    sales: [],    // Các Sale thuộc cơ sở hiện tại (Lấy từ Users)
    students: [], // Các học viên thuộc cơ sở
    queue: [],    // Mảng chứa ID Giáo viên xếp hàng (Turn tickets)
    testingMap: {}, // Map chứa {teacherId: timestamp} GV đang bận test
    queueLoaded: false, // Cờ đánh dấu đã tải xong hàng đợi từ Firebase
    firedUsers: []
};

// Các hàm Unsubscribe (Để dọn dẹp realtime listener khi chuyển branch)
let unsubs = [];

// ===================== GOOGLE SHEET AUTO SYNC ===================== //
// Dán URL Web App từ Google Apps Script vào đây sau khi deploy
const GOOGLE_SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxe3dV3bdHpTElbvlg-ZLTbvO_Er6cwk4OI_7hEfqShUY8ahv76vh7tNvbjoVEkJbeWyg/exec';

async function syncToGoogleSheet(data) {
    if (!GOOGLE_SHEET_WEBAPP_URL) return;
    try {
        fetch(GOOGLE_SHEET_WEBAPP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) { console.warn('Sheet sync error:', e); }
}

// Đồng bộ tất cả HV lên Sheet (xoá cũ trước rồi ghi lại)
let _isSyncing = false;
window.syncAllStudentsToSheet = async function () {
    if (!GOOGLE_SHEET_WEBAPP_URL) return alert('Chưa cấu hình Google Sheet URL!');
    if (_isSyncing) return alert('⏳ Đang đồng bộ, vui lòng chờ...');
    if (!confirm('📊 Đồng bộ TẤT CẢ học viên lên Google Sheet?\n\n⚠️ Sheet sẽ được XOÁ SẠCH rồi ghi lại từ đầu để tránh trùng.')) return;

    _isSyncing = true;
    try {
        // Gửi lệnh xoá sheet trước
        await fetch(GOOGLE_SHEET_WEBAPP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'clear' })
        });
        await new Promise(r => setTimeout(r, 1000));

        const studentsSnap = await db.collection('students').get();
        const usersSnap = await db.collection('users').get();
        const usersMap = {};
        usersSnap.forEach(doc => { usersMap[doc.id] = doc.data(); });

        let count = 0;
        const total = studentsSnap.size;

        for (const doc of studentsSnap.docs) {
            const s = doc.data();
            const teacher = usersMap[s.assignedTeacherId];
            const creator = usersMap[s.creatorId];
            const branch = FIXED_BRANCHES.find(b => b.id === s.branchId);

            await fetch(GOOGLE_SHEET_WEBAPP_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: s.name || '',
                    phone: s.phone || '',
                    contractNumber: s.contractNumber || '',
                    curriculum: s.curriculum || '',
                    teacherName: teacher?.name || 'N/A',
                    saleName: creator?.name || (s.source === 'Self' ? 'GV Tự tuyển' : 'N/A'),
                    branchName: branch?.name || 'N/A'
                })
            });

            count++;
            if (count % 10 === 0) console.log(`Sync: ${count}/${total}`);
            await new Promise(r => setTimeout(r, 300));
        }

        alert(`✅ Đã đồng bộ ${count} học viên lên Google Sheet!`);
    } catch (e) {
        alert('Lỗi đồng bộ: ' + e.message);
    } finally {
        _isSyncing = false;
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
            .orderBy('createdAt', 'desc')
            .get();

        // Đã filter timestamp ở Firestore, chỉ cần map
        const activeRecords = [];
        snap.forEach(doc => {
            const d = doc.data();
            const time = d.createdAt?.toDate();
            if (time) {
                activeRecords.push({
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

        html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">`;
        Object.keys(byTeacher).forEach(tid => {
            const t = byTeacher[tid];
            html += `<div style="padding:12px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-weight:600; font-size:13px; color:var(--primary);"><i class="fa-solid fa-person-swimming"></i> ${t.name}</span>
                    <span style="background:rgba(6,182,212,0.15); color:#06b6d4; font-weight:700; font-size:12px; padding:2px 8px; border-radius:10px;">${t.students.length}</span>
                </div>`;
            t.students.forEach(s => {
                html += `<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0; border-bottom:1px dashed var(--border-color);">
                    <span>${s.name}</span>
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

// Auto-refresh live pool mỗi 60 giây
setInterval(() => { if (document.getElementById('live-pool-board')) renderLivePool(); }, 60000);

// Debounce auto-repair để tránh gọi lại liên tục khi queue thay đổi
let _autoRepairTimer = null;
let _autoRepairDone = false;

function autoRepairQueue() {
    if (_autoRepairDone || !localState.queueLoaded || localState.teachers.length === 0) return;
    if (_autoRepairTimer) clearTimeout(_autoRepairTimer);
    _autoRepairTimer = setTimeout(() => {
        _autoRepairDone = true; // Chỉ chạy 1 lần duy nhất mỗi phiên
        const teacherIds = new Set(localState.teachers.map(t => t.id));

        // 1. Thêm GV thiếu vào queue (bỏ qua GV bị tạm dừng)
        const missingTeachers = localState.teachers.filter(t => !localState.queue.includes(t.id) && !t.queuePaused);
        if (missingTeachers.length > 0) {
            missingTeachers.forEach(t => {
                pushTeacherToQueue(t.id, t.teacherType || 'Chính', currentBranchId);
            });
        }

        // 1b. GV Chính cần 2 lượt nhưng chỉ có 1 → tự động thêm lượt thứ 2
        localState.teachers.forEach(t => {
            if (t.queuePaused) return;
            const type = t.teacherType || 'Chính';
            if (type === 'Chính') {
                const count = localState.queue.filter(id => id === t.id).length;
                if (count === 1) {
                    console.warn('Auto-restoring 2nd turn for GV Chính:', t.name);
                    const qDoc = db.collection('queues').doc(currentBranchId);
                    db.runTransaction(async (transaction) => {
                        const doc = await transaction.get(qDoc);
                        if (doc.exists) {
                            let turns = doc.data().turns || [];
                            const currentCount = turns.filter(id => id === t.id).length;
                            if (currentCount === 1) {
                                const insertPos = Math.floor(turns.length / 2);
                                turns.splice(insertPos, 0, t.id);
                                transaction.update(qDoc, { turns });
                            }
                        }
                    }).catch(e => console.error('Restore 2nd turn error:', e));
                }
            }
        });

        // 2. Xóa ID "mồ côi" trong queue (GV đã bị xóa/đuổi nhưng ID còn kẹt trong queue)
        const orphanIds = localState.queue.filter(id => !teacherIds.has(id));
        if (orphanIds.length > 0) {
            const uniqueOrphans = [...new Set(orphanIds)];
            console.warn('Auto-cleaning orphan queue IDs:', uniqueOrphans);
            const qDoc = db.collection('queues').doc(currentBranchId);
            db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let turns = doc.data().turns || [];
                    turns = turns.filter(id => teacherIds.has(id));
                    transaction.update(qDoc, { turns });
                }
            }).catch(e => console.error('Cleanup orphan error:', e));
        }
    }, 2000); // Debounce 2 giây
}

function renderDashboard() {
    // Gọi auto-repair riêng biệt (debounced, chỉ 1 lần mỗi phiên)
    autoRepairQueue();

    const elStudents = document.getElementById('total-students');
    const elTeachers = document.getElementById('total-teachers');
    const elSales = document.getElementById('total-sales');

    if (elStudents) elStudents.textContent = localState.students.length;
    if (elTeachers) elTeachers.textContent = localState.teachers.length;
    if (elSales) elSales.textContent = localState.sales.length;

    // Render Queue
    const qContainer = document.getElementById('teachers-queue');
    if (!qContainer) return;

    qContainer.innerHTML = '';
    if (localState.queue.length === 0) {
        qContainer.innerHTML = '<span class="text-muted">Hàng chờ trống...</span>';
        // Reset suggested
        const sugId = document.getElementById('sale-suggested-teacher-id');
        const sugName = document.getElementById('sale-suggested-teacher');
        const btnConfirm = document.getElementById('btn-sale-confirm');
        if (sugId) sugId.value = '';
        if (sugName) sugName.innerHTML = '<span style="color:var(--danger)">Trống (Không thể phân bổ)</span>';
        if (btnConfirm) btnConfirm.disabled = true;
        return;
    }

    let activeIndex = 0; // Đếm vị trí thực trong queue (bỏ qua paused)
    let suggestedDone = false; // Chỉ suggest GV ở vị trí đầu tiên

    localState.queue.forEach((teacherId, index) => {
        const teacher = localState.teachers.find(t => t.id === teacherId);
        if (!teacher) return;
        if (teacher.queuePaused) return;
        // Skip teachers đang nợ lượt (ngoại lệ)
        if ((localState.skipList || []).includes(teacherId)) return;

        const currentActiveIndex = activeIndex;
        activeIndex++;

        const node = document.createElement('div');
        const testStartTime = localState.testingMap[teacherId];
        const now = Date.now();
        let isTesting = false;
        let remainingMin = 0;
        if (testStartTime) {
            const startMs = testStartTime.toDate ? testStartTime.toDate().getTime() : testStartTime;
            const elapsed = now - startMs;
            if (elapsed < 15 * 60 * 1000) {
                isTesting = true;
                remainingMin = Math.ceil((15 * 60 * 1000 - elapsed) / 60000);
            } else {
                db.collection('queues').doc(currentBranchId).update({
                    [`testingMap.${teacherId}`]: firebase.firestore.FieldValue.delete()
                }).catch(e => console.error('Auto-clean test error:', e));
            }
        }
        const isFirstSlot = (currentActiveIndex === 0);
        node.className = `teacher-node ${isFirstSlot ? 'current-turn' : ''}`;
        if (isTesting) node.style.border = '2px solid #f59e0b';

        // Auto-propose Top 1 vào Form Sale (chỉ lần đầu)
        if (isFirstSlot && !suggestedDone) {
            suggestedDone = true;
            const sugId = document.getElementById('sale-suggested-teacher-id');
            const sugName = document.getElementById('sale-suggested-teacher');
            const btnConfirm = document.getElementById('btn-sale-confirm');
            if (sugId) sugId.value = teacherId;
            if (sugName) sugName.innerHTML = `<span style="color:var(--primary)"><i class="fa-solid fa-person-swimming"></i> ${teacher.name}</span>`;
            if (btnConfirm) btnConfirm.disabled = false;
        }

        node.innerHTML = `
            <div class="t-name">${teacher.name}</div>
            ${isTesting ? `<div style="font-size:10px; color:#f59e0b; font-weight:600; margin-top:2px;">🧪 Test (${remainingMin}p)</div>` : ''}
            ${currentUserRole !== 'TEACHER' ? `
            <button class="btn btn-sm btn-danger mt-10" onclick="cutQueueTurn(${index})" style="margin-top:8px; width:100%; border-radius:4px; padding:4px;">
                <i class="fa-solid fa-scissors"></i> Cắt lượt
            </button>
            ${isTesting ? `<button class="btn btn-sm mt-10" onclick="finishTest('${teacherId}')" style="margin-top:4px; width:100%; border-radius:4px; padding:4px; background:rgba(16,185,129,0.15); color:#059669; border:1px solid rgba(16,185,129,0.3);"><i class="fa-solid fa-check"></i> Xong test</button>` : ''}
            ` : ''}
        `;
        qContainer.appendChild(node);

        // Arrow giữa các node hiển thị
        const nextVisible = localState.queue.slice(index + 1).find(id => {
            const t = localState.teachers.find(tt => tt.id === id);
            return t && !t.queuePaused;
        });
        if (nextVisible) {
            const arrow = document.createElement('i');
            arrow.className = 'fa-solid fa-arrow-right';
            qContainer.appendChild(arrow);
        }
    });

    // Render Hàng Đợi Test
    const testSection = document.getElementById('test-queue-section');
    const testContainer = document.getElementById('test-queue-display');
    if (testSection && testContainer) {
        const now = Date.now();
        const activeTests = [];
        for (const [tid, ts] of Object.entries(localState.testingMap)) {
            const startMs = ts.toDate ? ts.toDate().getTime() : ts;
            const elapsed = now - startMs;
            if (elapsed < 15 * 60 * 1000) {
                const teacher = localState.teachers.find(t => t.id === tid);
                if (teacher) {
                    const remainMs = 15 * 60 * 1000 - elapsed;
                    const mins = Math.floor(remainMs / 60000);
                    const secs = Math.floor((remainMs % 60000) / 1000);
                    const pct = Math.round((elapsed / (15 * 60 * 1000)) * 100);
                    activeTests.push({ teacher, tid, mins, secs, pct });
                }
            }
        }
        if (activeTests.length > 0) {
            testSection.style.display = 'block';
            testContainer.innerHTML = '';
            activeTests.forEach(({ teacher, tid, mins, secs, pct }) => {
                const node = document.createElement('div');
                node.className = 'teacher-node';
                node.style.border = '2px solid #f59e0b';
                node.style.position = 'relative';
                node.innerHTML = `
                    <div class="t-name">${teacher.name}</div>
                    <div style="font-size: 18px; font-weight: 700; color: #f59e0b; margin-top: 4px;">
                        ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}
                    </div>
                    <div style="width: 100%; height: 4px; background: rgba(0,0,0,0.1); border-radius: 2px; margin-top: 6px; overflow: hidden;">
                        <div style="width: ${pct}%; height: 100%; background: #f59e0b; transition: width 1s;"></div>
                    </div>
                    ${currentUserRole !== 'TEACHER' ? `
                    <button class="btn btn-sm" onclick="finishTest('${tid}')" style="margin-top:6px; width:100%; border-radius:4px; padding:4px; background:rgba(16,185,129,0.15); color:#059669; border:1px solid rgba(16,185,129,0.3); font-size:11px;">
                        <i class="fa-solid fa-check"></i> Xong test
                    </button>` : ''}
                `;
                testContainer.appendChild(node);
            });
        } else {
            testSection.style.display = 'none';
            testContainer.innerHTML = '';
        }
    }

    // Render demographics analysis
    renderDemographics();
    renderLivePool();
}

// ===================== PHÂN TÍCH NHÂN KHẨU HỌC VIÊN ===================== //
function renderDemographics() {
    const container = document.getElementById('demographics-analysis');
    if (!container) return;

    const students = localState.students || [];
    if (students.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-chart-bar" style="font-size:24px; margin-bottom:8px; display:block;"></i>Chưa có dữ liệu học viên để phân tích.</div>';
        return;
    }

    // Phân nhóm tuổi
    const ageGroups = { '3-6': 0, '7-10': 0, '11-15': 0, '16-25': 0, '26-40': 0, '41+': 0, 'Chưa rõ': 0 };
    const ageLabels = { '3-6': '🧒 Mầm non', '7-10': '👦 Tiểu học', '11-15': '🧑 THCS', '16-25': '🏊 Thanh niên', '26-40': '💼 Trưởng thành', '41+': '🌟 Trung niên+', 'Chưa rõ': '❓ Chưa rõ' };
    const ageColors = { '3-6': '#f472b6', '7-10': '#60a5fa', '11-15': '#34d399', '16-25': '#fbbf24', '26-40': '#a78bfa', '41+': '#fb923c', 'Chưa rõ': '#94a3b8' };

    // Gender count
    let maleCount = 0, femaleCount = 0;

    // Swim style breakdown
    const swimStyles = {};
    const swimIcons = { 'Bơi Ếch': '🐸', 'Bơi Sải': '🏊', 'Bơi Ngửa': '🔄', 'Bơi Bướm': '🦋', 'PT': '💪', 'Ếch Vip': '🐸⭐', 'Sải Vip': '🏊⭐' };

    students.forEach(s => {
        // Age grouping
        const age = s.age || 0;
        if (age >= 3 && age <= 6) ageGroups['3-6']++;
        else if (age >= 7 && age <= 10) ageGroups['7-10']++;
        else if (age >= 11 && age <= 15) ageGroups['11-15']++;
        else if (age >= 16 && age <= 25) ageGroups['16-25']++;
        else if (age >= 26 && age <= 40) ageGroups['26-40']++;
        else if (age > 40) ageGroups['41+']++;
        else ageGroups['Chưa rõ']++;

        // Gender
        if (s.gender === 'Nam') maleCount++;
        else femaleCount++;

        // Swim style
        const style = s.curriculum || 'Bơi Ếch';
        if (!swimStyles[style]) swimStyles[style] = { male: 0, female: 0, ageGroups: {} };
        if (s.gender === 'Nam') swimStyles[style].male++; else swimStyles[style].female++;

        // Age in swim style
        let ag = 'Chưa rõ';
        if (age >= 3 && age <= 10) ag = '3-10';
        else if (age >= 11 && age <= 15) ag = '11-15';
        else if (age >= 16) ag = '16+';
        swimStyles[style].ageGroups[ag] = (swimStyles[style].ageGroups[ag] || 0) + 1;
    });

    const maxAgeCount = Math.max(...Object.values(ageGroups));
    let html = '';

    // ---- Card 1: Phân bổ lứa tuổi (bar chart) ----
    html += `<div style="background:var(--card-bg); border-radius:12px; border:1px solid var(--border-color); padding:16px;">`;
    html += `<div style="font-weight:700; font-size:15px; margin-bottom:12px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-cake-candles" style="color:var(--primary);"></i> Phân Bổ Lứa Tuổi</div>`;
    html += `<div style="display:flex; flex-direction:column; gap:8px;">`;
    Object.keys(ageGroups).forEach(key => {
        if (ageGroups[key] === 0 && key === 'Chưa rõ') return;
        const pct = maxAgeCount > 0 ? (ageGroups[key] / maxAgeCount * 100) : 0;
        const isMax = ageGroups[key] === maxAgeCount && maxAgeCount > 0;
        html += `<div style="display:flex; align-items:center; gap:8px;">`;
        html += `<div style="width:90px; font-size:12px; font-weight:500; white-space:nowrap;">${ageLabels[key]}</div>`;
        html += `<div style="flex:1; height:22px; background:rgba(0,0,0,0.04); border-radius:6px; overflow:hidden; position:relative;">`;
        html += `<div style="height:100%; width:${pct}%; background:${ageColors[key]}; border-radius:6px; transition:width 0.5s ease; ${isMax ? 'box-shadow:0 0 8px ' + ageColors[key] + '80;' : ''}"></div>`;
        html += `</div>`;
        html += `<div style="width:35px; text-align:right; font-size:13px; font-weight:700; color:${isMax ? ageColors[key] : 'var(--text-color)'};">${ageGroups[key]}</div>`;
        html += `</div>`;
    });
    html += `</div>`;

    // Nhóm tuổi đông nhất
    const topAge = Object.entries(ageGroups).filter(([k]) => k !== 'Chưa rõ').sort((a, b) => b[1] - a[1])[0];
    if (topAge && topAge[1] > 0) {
        html += `<div style="margin-top:12px; padding:10px; background:linear-gradient(135deg, ${ageColors[topAge[0]]}15, ${ageColors[topAge[0]]}08); border-radius:8px; border:1px solid ${ageColors[topAge[0]]}30; font-size:13px;">`;
        html += `<b style="color:${ageColors[topAge[0]]};">🏆 Lứa tuổi đông nhất:</b> ${ageLabels[topAge[0]]} — <b>${topAge[1]}</b> học viên (${(topAge[1] / students.length * 100).toFixed(0)}%)`;
        html += `</div>`;
    }
    html += `</div>`;

    // ---- Card 2: Giới tính ----
    const malePct = students.length > 0 ? (maleCount / students.length * 100).toFixed(0) : 0;
    const femalePct = students.length > 0 ? (femaleCount / students.length * 100).toFixed(0) : 0;
    html += `<div style="background:var(--card-bg); border-radius:12px; border:1px solid var(--border-color); padding:16px;">`;
    html += `<div style="font-weight:700; font-size:15px; margin-bottom:12px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-venus-mars" style="color:#8b5cf6;"></i> Tỷ Lệ Giới Tính</div>`;
    html += `<div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">`;
    html += `<div style="flex:1; text-align:center;"><div style="font-size:28px; font-weight:800; color:#3b82f6;">${maleCount}</div><div style="font-size:12px; color:var(--text-muted);">👦 Nam (${malePct}%)</div></div>`;
    html += `<div style="width:1px; height:40px; background:var(--border-color);"></div>`;
    html += `<div style="flex:1; text-align:center;"><div style="font-size:28px; font-weight:800; color:#ec4899;">${femaleCount}</div><div style="font-size:12px; color:var(--text-muted);">👧 Nữ (${femalePct}%)</div></div>`;
    html += `</div>`;
    html += `<div style="height:10px; background:rgba(0,0,0,0.04); border-radius:5px; overflow:hidden; display:flex;">`;
    html += `<div style="width:${malePct}%; background:linear-gradient(90deg, #3b82f6, #60a5fa); border-radius:5px 0 0 5px;"></div>`;
    html += `<div style="width:${femalePct}%; background:linear-gradient(90deg, #ec4899, #f472b6); border-radius:0 5px 5px 0;"></div>`;
    html += `</div></div>`;

    // ---- Card 3: Kiểu bơi × Tuổi × Giới tính ----
    html += `<div style="background:var(--card-bg); border-radius:12px; border:1px solid var(--border-color); padding:16px;">`;
    html += `<div style="font-weight:700; font-size:15px; margin-bottom:12px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-water" style="color:#06b6d4;"></i> Kiểu Bơi × Lứa Tuổi × Giới Tính</div>`;
    const sortedStyles = Object.entries(swimStyles).sort((a, b) => (b[1].male + b[1].female) - (a[1].male + a[1].female));
    sortedStyles.forEach(([style, data]) => {
        const total = data.male + data.female;
        const icon = swimIcons[style] || '🏊';
        html += `<div style="margin-bottom:12px; padding:12px; background:rgba(6,182,212,0.03); border-radius:8px; border:1px solid rgba(6,182,212,0.12);">`;
        html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">`;
        html += `<span style="font-weight:600; font-size:14px;">${icon} ${style}</span>`;
        html += `<span style="font-weight:700; color:#06b6d4; font-size:16px;">${total} HV</span>`;
        html += `</div>`;
        // Gender breakdown
        html += `<div style="display:flex; gap:10px; font-size:12px; margin-bottom:6px;">`;
        html += `<span style="color:#3b82f6;">👦 Nam: <b>${data.male}</b></span>`;
        html += `<span style="color:#ec4899;">👧 Nữ: <b>${data.female}</b></span>`;
        html += `</div>`;
        // Age breakdown
        html += `<div style="display:flex; gap:6px; flex-wrap:wrap;">`;
        Object.entries(data.ageGroups).sort((a, b) => b[1] - a[1]).forEach(([ag, cnt]) => {
            const label = ag === '3-10' ? '🧒 3-10t' : ag === '11-15' ? '🧑 11-15t' : ag === '16+' ? '🏊 16+' : '❓';
            html += `<span style="padding:3px 8px; background:rgba(6,182,212,0.08); border-radius:12px; font-size:11px; font-weight:600;">${label}: ${cnt}</span>`;
        });
        html += `</div></div>`;
    });
    html += `</div>`;

    container.innerHTML = html;
}
let teacherSearchQuery = '';
let teacherFilterMode = 'all';

function renderTeacherStudents() {
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
            if (nameEl) nameEl.textContent = selectedTeacher.name || '';
            if (emailEl) emailEl.textContent = selectedTeacher.email || '';
            if (detailsEl) {
                let badges = '';
                const branchName = FIXED_BRANCHES.find(b => b.id === selectedTeacher.branchId)?.name || '';
                if (branchName) badges += `<span style="background:rgba(37,99,235,0.1); color:var(--primary); padding:3px 8px; border-radius:12px;">📍 ${branchName}</span>`;
                badges += `<span style="background:rgba(37,99,235,0.1); color:var(--primary); padding:3px 8px; border-radius:12px;">🎫 ${selectedTeacher.teacherType || 'Chính'}</span>`;
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

    const allStudents = localState.students.filter(s => s.assignedTeacherId === teacherId);

    // Thống kê nhanh
    const totalCount = allStudents.length;
    const activeCount = allStudents.filter(s => s.sessions < (s.totalSessions || 10)).length;
    const doneCount = allStudents.filter(s => s.sessions >= (s.totalSessions || 10)).length;

    if (statsBox) {
        statsBox.innerHTML = `
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
        const canConfirmSalary = (maxSteps > 0 ? currentStep >= maxSteps : true) && st.sessions >= 7;
        const isSalaryConfirmed = st.salaryConfirmed || false;

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
                    ${canConfirmSalary && !isSalaryConfirmed ? `
                    <button class="btn btn-sm" onclick="event.stopPropagation(); confirmSalary('${st.id}', '${st.name}')" style="background: rgba(16,185,129,0.15); color: #059669; font-size: 12px; padding: 5px 12px; border: 1px solid rgba(16,185,129,0.3); font-weight: 600;">
                        <i class="fa-solid fa-money-check-dollar"></i> Chốt Lương
                    </button>
                    ` : ''}
                    ${isSalaryConfirmed ? `
                    <span style="font-size: 12px; color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-circle-check"></i> Đã chốt lương
                    </span>
                    ` : ''}
                </div>
                ` : ''}

                ${(currentUserRole === 'TEACHER' || currentUserRole === 'ADMIN') ? `
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
                    ${currentUserRole === 'ADMIN' ? `
                    <button class="btn btn-sm" onclick="event.stopPropagation(); deleteStudent('${st.id}', '${st.name.replace(/'/g, "\'")}'  , '${st.assignedTeacherId || ''}')" style="background: rgba(239,68,68,0.1); color: #ef4444; font-size: 12px; padding: 5px 12px; border: 1px solid rgba(239,68,68,0.25);">
                        <i class="fa-solid fa-trash"></i> Xóa HV
                    </button>
                    ` : ''}
                </div>
                ` : ''}
            </div>
        `;
    });
    list.innerHTML = htmlParts;
}
// Bổ sung/sửa thông tin HV
window.editStudentInfo = async function (studentId) {
    const st = localState.students.find(s => s.id === studentId);
    if (!st) return alert('Không tìm thấy học viên!');

    const isAdmin = currentUserRole === 'ADMIN';
    const isSale = currentUserRole === 'SALE';
    const updates = {};

    // 1. Tên HV - chỉ Admin
    if (isAdmin) {
        const name = prompt(`📝 Tên hiện tại: ${st.name}\nNhập tên mới (bỏ trống = giữ nguyên):`, st.name || '');
        if (name === null) return;
        if (name.trim() && name.trim() !== st.name) updates.name = name.trim();
    }

    // 2. Số HĐ - chỉ Admin
    if (isAdmin) {
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

    // 5. Kiểu bơi - Admin + Sale
    if (isAdmin || isSale) {
        const curTypes = ['Bơi Ếch', 'Bơi Sải', 'Ếch Vip', 'Sải Vip', 'Bơi Ngửa', 'Bơi Bướm', 'PT'];
        const curriculum = prompt(`🏊 Kiểu bơi hiện tại: ${st.curriculum || 'Bơi Ếch'}\nChọn: ${curTypes.join(' / ')}\n(bỏ trống = giữ nguyên):`, st.curriculum || 'Bơi Ếch');
        if (curriculum === null) return;
        if (curriculum.trim() && curTypes.includes(curriculum.trim())) updates.curriculum = curriculum.trim();
    }

    // 6. Nhóm tuổi - Admin + Sale
    if (isAdmin || isSale) {
        const ageCategory = prompt(`👶 Nhóm tuổi hiện tại: ${st.ageCategory || 'Trẻ em'}\nNhập: Trẻ em / Người lớn (bỏ trống = giữ nguyên):`, st.ageCategory || 'Trẻ em');
        if (ageCategory === null) return;
        if (ageCategory.trim() && (ageCategory.trim() === 'Trẻ em' || ageCategory.trim() === 'Người lớn')) updates.ageCategory = ageCategory.trim();
    }

    // 7. Số tuổi - tất cả
    const ageStr = prompt(`🎂 Số tuổi hiện tại: ${st.age || 'Chưa có'}\nNhập số tuổi (bỏ trống = giữ nguyên):`, st.age || '');
    if (ageStr === null) return;
    if (ageStr.trim() && parseInt(ageStr)) updates.age = parseInt(ageStr);

    // 8. Tổng số buổi + Số buổi đã học - chỉ Admin
    if (isAdmin) {
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
                    .orderBy('createdAt', 'desc')
                    .limit(diff)
                    .get();
                const batch = db.batch();
                attSnap.forEach(doc => batch.delete(doc.ref));
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

        alert('✅ Đã cập nhật thông tin!' + (updates.sessions !== undefined && updates.sessions < (st.sessions || 0) ? `\n📋 Đã xoá ${(st.sessions || 0) - updates.sessions} bản ghi điểm danh gần nhất.` : ''));
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

        // Gửi thông báo cho GV nhận
        await db.collection('notifications').add({
            toUserId: newTeacher.id,
            type: 'transfer',
            message: `🔄 Bạn nhận chuyển nhượng HV "${studentName}" từ ${fromName}. Số buổi và tiến trình giữ nguyên.`,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert(`✅ Đã chuyển nhượng "${studentName}" cho ${newTeacher.name} thành công!`);
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
        if (file.size > 50 * 1024 * 1024) {
            alert('❌ Video quá lớn! Tối đa 50MB.\nGợi ý: Quay video 30-60 giây, chất lượng 720p.');
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
async function cleanupExpiredVideos() {
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
}
// Cleanup video hết hạn sẽ được gọi sau khi auth hoàn tất (xem onAuthStateChanged)

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
            .where('createdAt', '>=', twentyMinAgo)
            .orderBy('createdAt', 'desc')
            .get();
        attSnap.forEach(doc => {
            const d = doc.data();
            const t = d.createdAt?.toDate();
            if (t) {
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
        const canCancel = recent && !isDone;
        const cancelRemain = canCancel ? Math.max(0, Math.ceil((recent.time.getTime() + 20 * 60 * 1000 - now.getTime()) / 60000)) : 0;

        return `
        <div style="padding: 14px; background: var(--card-bg); border: 1px solid ${isDone ? 'rgba(239,68,68,0.2)' : 'var(--border-color)'}; border-radius: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="font-weight: 600; font-size: 15px;">${st.name}</span>
                        <span style="font-size: 11px; color: #f59e0b; font-weight: 500;">${curType}</span>
                        ${st.transferredFrom ? '<span style="font-size: 10px; background: rgba(245,158,11,0.15); color: #d97706; padding: 1px 5px; border-radius: 8px;">🔄 CN</span>' : ''}
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">
                        <i class="fa-solid fa-person-swimming"></i> GV: <strong style="color: var(--primary);">${teacherName}</strong>
                        ${st.phone ? ` · <i class="fa-solid fa-phone"></i> ${st.phone}` : ''}
                    </div>
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

    if (!confirm(`✅ Điểm danh: ${studentName}\n\nBuổi ${currentSessions + 1} / ${totalSessions}\nGiáo viên: ${teacherName}\n\nXác nhận?`)) return;

    try {
        // Tăng số buổi
        await db.collection('students').doc(studentId).update({
            sessions: firebase.firestore.FieldValue.increment(1)
        });

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

        // Gửi thông báo cho GV xác nhận
        await sendNotification(teacherId, 'attendance', `📋 Lễ tân điểm danh HV "${studentName}" (buổi ${currentSessions + 1}/${totalSessions}). Vui lòng xác nhận.`);

        alert(`✅ Đã điểm danh "${studentName}" — Buổi ${currentSessions + 1}/${totalSessions}`);

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
                    <div style="text-align:right;">
                        <div style="font-weight:700; font-size:14px; color:${isDone ? '#ef4444' : 'var(--primary)'};">${cur}/${total}</div>
                        <div style="width:60px; height:4px; background:rgba(0,0,0,0.1); border-radius:2px; overflow:hidden; margin-top:2px;">
                            <div style="width:${pct}%; height:100%; background:${isDone ? '#ef4444' : '#3b82f6'};"></div>
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

function renderSaleStats() {
    const statsBox = document.getElementById('sale-personal-stats');
    const listBox = document.getElementById('sale-contracts-list');
    if (!statsBox || !listBox) return;
    if (currentUserRole !== 'SALE' && currentUserRole !== 'ADMIN') {
        statsBox.innerHTML = '';
        listBox.innerHTML = '';
        return;
    }

    // Lọc học viên do Sale hiện tại tạo (cả Sale và Tự tuyển)
    const saleId = currentUserRole === 'ADMIN' ? null : currentUserId;
    const myStudents = saleId
        ? localState.students.filter(s => s.creatorId === saleId)
        : localState.students; // Admin thấy tất cả

    const totalContracts = myStudents.length;
    const activeCount = myStudents.filter(s => (s.sessions || 0) < (s.totalSessions || 10)).length;
    const doneCount = myStudents.filter(s => (s.sessions || 0) >= (s.totalSessions || 10)).length;
    const saleContracts = myStudents.filter(s => s.source === 'Sale').length;
    const selfContracts = myStudents.filter(s => s.source === 'Self').length;

    // Render 5 ô thống kê
    statsBox.innerHTML = `
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
    `;

    // Áp dụng bộ lọc + tìm kiếm
    const searchText = (document.getElementById('sale-search-student')?.value || '').trim().toLowerCase();
    let filtered = myStudents;

    // Lọc theo trạng thái
    if (saleFilterMode === 'active') {
        filtered = filtered.filter(s => (s.sessions || 0) < (s.totalSessions || 10));
    } else if (saleFilterMode === 'done') {
        filtered = filtered.filter(s => (s.sessions || 0) >= (s.totalSessions || 10));
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

// Cập nhật giao diện toàn diện
function updateAllUI() {
    updateTeacherSelects();
    renderDashboard();
    renderTeacherStudents();
    renderSaleStats();
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
    localState.testingMap = {};
    localState.queueLoaded = false;
    localState.firedUsers = [];
}

// Lắng nghe dữ liệu Cơ Sở hiện tại
function listenToBranchData(branchId) {
    clearListeners();
    currentBranchId = branchId;
    listenToAthletes(); // Reload CLB athletes for the selected branch

    // 1. Lắng nghe Giáo viên (Từ Collection users)
    const u1 = db.collection('users').where('role', '==', 'TEACHER').where('branchId', '==', branchId)
        .onSnapshot(snap => {
            localState.teachers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateAllUI();
        });

    // 2. Lắng nghe Học viên
    const u2 = db.collection('students').where('branchId', '==', branchId)
        .onSnapshot(snap => {
            localState.students = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sắp xếp theo thứ tự điền HĐ (cũ nhất trước)
            localState.students.sort((a, b) => {
                const tA = a.createdAt?.toDate?.() || a.createdAt || 0;
                const tB = b.createdAt?.toDate?.() || b.createdAt || 0;
                return tA - tB;
            });
            updateAllUI(); // Render lại list học viên và card count
        });

    // 3. Lắng nghe Queue
    const u3 = db.collection('queues').doc(branchId)
        .onSnapshot(doc => {
            localState.queueLoaded = true;
            if (doc.exists) {
                localState.queue = doc.data().turns || [];
                localState.skipList = doc.data().skipList || [];
                localState.testingMap = doc.data().testingMap || {};
            } else {
                localState.queue = [];
                localState.skipList = [];
                localState.testingMap = {};
            }
            renderDashboard(); // Queue layout
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

    // Tính toán số vé dựa trên loại GV
    const tickets = type === 'Chính' ? 2 : 1;

    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(qDoc);
            let currentTurns = [];
            if (doc.exists) {
                currentTurns = doc.data().turns || [];
            }
            // Check nếu giáo viên đã có trong queue rồi thì KHÔNG add thêm nữa
            if (currentTurns.includes(teacherId)) return;

            // Vé 1: thêm cuối queue
            currentTurns.push(teacherId);

            // Vé 2 (nếu GV Chính): xen vào giữa queue, cách vé 1 càng xa càng tốt
            if (tickets === 2 && currentTurns.length > 1) {
                const insertPos = Math.floor(currentTurns.length / 2);
                currentTurns.splice(insertPos, 0, teacherId);
            } else if (tickets === 2) {
                currentTurns.push(teacherId);
            }

            if (doc.exists) {
                transaction.update(qDoc, { turns: currentTurns });
            } else {
                transaction.set(qDoc, { turns: currentTurns });
            }
        });
    } catch (e) { console.error(e); }
}

// Function để xử lý bỏ qua các giáo viên đang bị phạt rớt lượt (trong skipList)
function processSkipList(turns, skipList) {
    let loops = 0;
    while (turns.length > 0 && loops < turns.length) {
        const top = turns[0];
        const idx = skipList.indexOf(top);
        if (idx !== -1) {
            skipList.splice(idx, 1);
            turns.push(turns.shift());
            loops++;
        } else {
            break;
        }
    }
}

// ===================== HỆ THỐNG THÔNG BÁO ===================== //

// Gửi thông báo cho user
async function sendNotification(toUserId, type, message) {
    try {
        await db.collection('notifications').add({
            toUserId,
            type, // 'contract', 'contract_exception', 'penalty'
            message,
            fromUserId: currentUserId,
            fromUserName: currentUserDisplayName || 'Hệ thống',
            branchId: currentBranchId,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.error('Lỗi gửi thông báo:', e);
    }
}

// Listener thông báo real-time
let notifUnsub = null;
let notifData = [];
let shownNotifIds = new Set(); // Track đã hiện push notification chưa

// Xin quyền browser notification
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
            console.log('Notification permission:', perm);
        });
    }
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

function listenToNotifications() {
    if (notifUnsub) notifUnsub();
    if (!currentUserId) return;

    notifUnsub = db.collection('notifications')
        .where('toUserId', '==', currentUserId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .onSnapshot(snap => {
            const prevIds = new Set(notifData.map(n => n.id));
            notifData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort client-side (mới nhất trước)
            notifData.sort((a, b) => {
                const ta = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : a.createdAt) : 0;
                const tb = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : b.createdAt) : 0;
                return tb - ta;
            });

            // Push notification cho thông báo MỚI (chưa đọc, chưa hiện)
            notifData.forEach(n => {
                if (!n.read && !shownNotifIds.has(n.id) && prevIds.size > 0) {
                    // Chỉ push khi không phải lần load đầu (prevIds.size > 0)
                    const title = n.type === 'penalty' ? '⚠️ Phạt Mất Lượt!'
                        : n.type === 'contract_exception' ? '✨ Hợp đồng Ngoại lệ'
                            : n.type === 'transfer' ? '🔄 Chuyển nhượng HV'
                                : n.type === 'test_kick' ? '🧪 Giao Test Khách'
                                    : n.type === 'attendance' ? '📋 Điểm danh HV'
                                        : '📝 Học viên Mới!';
                    showBrowserNotification(title, n.message, n.id);
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
        const typeIcon = n.type === 'penalty' ? '⚠️' : n.type === 'contract_exception' ? '✨' : '📝';
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
window.saleAssignStudent = async function (name, phone, gender, ageCategory, contractNumber, teacherId, curriculum, ptSessions, isException = false, age = 0, isTestStudent = false) {
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

        await db.collection('students').add({
            name, phone, gender, ageCategory, age: age || 0,
            assignedTeacherId: teacherId,
            contractNumber: contractNumber || 'Chưa có',
            branchId: currentBranchId,
            sessions: 0,
            totalSessions: (curriculum === 'Ếch Vip' || curriculum === 'Sải Vip') ? 15 : (curriculum === 'PT' ? (parseInt(ptSessions) || 10) : 10),
            curriculum: curriculum || 'Bơi Ếch',
            source: 'Sale',
            creatorId: currentUserId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            isTestStudent: isTestStudent || false,
            ...(isUpgrade ? { isUpgrade: true, upgradeFromStudentId: upgradeFromId } : {})
        });

        // Auto sync lên Google Sheet
        const tObjSync = localState.teachers.find(t => t.id === teacherId);
        const branchObj = FIXED_BRANCHES.find(b => b.id === currentBranchId);
        syncToGoogleSheet({
            name, phone,
            contractNumber: contractNumber || 'Chưa có',
            curriculum: curriculum || 'Bơi Ếch',
            teacherName: tObjSync?.name || 'N/A',
            saleName: currentUserDisplayName || 'Sale',
            branchName: branchObj?.name || 'N/A'
        });

        const qDoc = db.collection('queues').doc(currentBranchId);

        // LOGIC HÀNG CHỜ MỚI (V4.14) - Sử dụng Skip List (Ghi Nợ Lượt)
        if (!isException) {
            // Nút 1: Xác nhận bình thường -> Cắt Top 1 đẩy xuống đáy
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let turns = doc.data().turns || [];
                    let skipList = doc.data().skipList || [];
                    if (turns.length > 0) {
                        const first = turns.shift(); // Lấy thằng Top 1 ra
                        turns.push(first);
                        processSkipList(turns, skipList); // Xử lý nếu thằng tiếp theo đang nợ lượt
                        transaction.update(qDoc, { turns, skipList });
                    }
                }
            });
            alert('Đã gán Học viên thành công! Lượt của Giáo viên Top 1 đã bị cắt xuống cuối hàng.');
            // Gửi thông báo cho GV
            sendNotification(teacherId, 'contract', `📝 ${currentUserDisplayName || 'Sale'} vừa gán học viên "${name}" cho bạn (HĐ: ${contractNumber || 'Chưa có'}, ${curriculum || 'Bơi Ếch'}).`);
            // Gửi thông báo cho Quản lý cơ sở và Admin
            try {
                const mgrSnap = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', currentBranchId).get();
                mgrSnap.forEach(doc => sendNotification(doc.id, 'contract', `📋 HĐ mới: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ếch'})`));
            } catch (e) { console.error('Manager notify error:', e); }
            try {
                const adminSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
                adminSnap.forEach(doc => {
                    if (doc.id !== currentUserId) sendNotification(doc.id, 'contract', `📋 HĐ mới: Sale "${currentUserDisplayName || 'Sale'}" → GV "${tObj.name}" | HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ếch'}) - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`);
                });
            } catch (e) { console.error('Admin notify error:', e); }
        } else {
            // Nút 2: Ngoại Lệ -> Đưa Giáo viên được nhận Học viên vào sổ Nợ (skipList). Giữ nguyên vị trí ban đầu của họ.
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let turns = doc.data().turns || [];
                    let skipList = doc.data().skipList || [];
                    // Đưa vào danh sách nợ mất lượt
                    skipList.push(teacherId);
                    processSkipList(turns, skipList); // Đề phòng họ đang dứng đúng Top 1 mà bị ăn Ngoại lệ
                    transaction.update(qDoc, { turns, skipList });
                }
            });
            alert('Đã gán HĐ NGOẠI LỆ thành công! Giáo viên nhận HĐ đã bị lưu sổ vòng kế tiếp CẮT 1 LƯỢT. Giáo viên Top 1 hiện tại được bảo lưu vé.');
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
        console.error(e);
        alert('Lỗi phân bổ: ' + e);
    }
}

// Cắt lượt (Admin): Đẩy vé tại vị trí bất kỳ xuống cuối
window.cutQueueTurn = async function (indexTarget, skipConfirm = false) {
    if (!currentBranchId) return;
    if (!skipConfirm && !confirm('Bạn muốn cắt vé này và đẩy xuống cuối chóp?')) return;

    const qDoc = db.collection('queues').doc(currentBranchId);
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(qDoc);
            if (doc.exists) {
                let turns = doc.data().turns || [];
                let skipList = doc.data().skipList || [];
                if (indexTarget >= 0 && indexTarget < turns.length) {
                    const cutTicket = turns.splice(indexTarget, 1)[0];
                    turns.push(cutTicket);
                    if (indexTarget === 0) {
                        processSkipList(turns, skipList);
                    }
                    transaction.update(qDoc, { turns, skipList });
                }
            }
        });
    } catch (e) { console.error(e); }
};

// Phạt Mất Lượt - Hàm global gọi từ onclick
window.saleSkipTurn = async function () {
    console.log('saleSkipTurn called', { currentBranchId, queueLen: localState.queue.length });
    if (!currentBranchId) return alert('Chưa chọn Cơ sở!');
    if (localState.queue.length === 0) return alert('Hàng chờ trống!');
    const reason = prompt('PHẠT MẤT LƯỢT: Nhập lý do (tối đa 20 ký tự):');
    if (reason === null) return; // Cancelled
    const trimmedReason = (reason || 'Không rõ').substring(0, 20);

    // Lấy thông tin GV bị phạt TRƯỚC khi cắt queue
    const penalizedTeacherId = localState.queue[0];
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

        alert('Phạt mất lượt thành công! Giáo viên đã bị đẩy xuống cuối hàng chờ.');
    } catch (e) {
        console.error('saleSkipTurn error:', e);
        alert('Lỗi: ' + e.message);
    }
};

// Kích Test - giao test cho GV đầu hàng chưa bận test
window.saleTestKick = async function () {
    if (!currentBranchId) return alert('Chưa chọn Cơ sở!');
    if (localState.queue.length === 0) return alert('Hàng chờ trống!');

    const now = Date.now();

    // Tìm GV đầu tiên trong queue KHÔNG bị tạm dừng VÀ KHÔNG đang test (chưa hết 15p)
    const activeQueue = localState.queue.filter(id => {
        const t = localState.teachers.find(tt => tt.id === id);
        return t && !t.queuePaused;
    });

    const availableForTest = activeQueue.find(id => {
        const ts = localState.testingMap[id];
        if (!ts) return true; // Chưa test
        const startMs = ts.toDate ? ts.toDate().getTime() : ts;
        return (now - startMs) >= 15 * 60 * 1000; // Test đã hết hạn
    });

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

// ===================== EVENT BINDINGS (FORM) ===================== //

document.addEventListener('DOMContentLoaded', () => {

    // ===================== AUTHENTICATION LOGIC ===================== //
    auth = firebase.auth();
    // Giữ phiên đăng nhập ngay cả khi đóng trình duyệt
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e => console.warn('Persistence error:', e));
    const authUi = document.getElementById('auth-ui');
    const mainAppUi = document.getElementById('main-app-ui');
    const pendingUi = document.getElementById('pending-ui');
    const authForm = document.getElementById('auth-form');

    // Toggle Login/Register được handle bởi window.toggleLoginMode phía dưới

    // Toggle Mật Khẩu (Show/Hide)
    const togglePassword = document.getElementById('toggle-password-visibility');
    const passwordInput = document.getElementById('auth-password');
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            togglePassword.className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
        });
    }

    const toggleConfirmPassword = document.getElementById('toggle-confirm-password-visibility');
    const confirmPasswordInput = document.getElementById('auth-confirm-password');
    if (toggleConfirmPassword && confirmPasswordInput) {
        toggleConfirmPassword.addEventListener('click', () => {
            const type = confirmPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            confirmPasswordInput.setAttribute('type', type);
            toggleConfirmPassword.className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
        });
    }

    // Modal Quên mật khẩu
    const forgotLink = document.getElementById('auth-forgot-password-link');
    const forgotModal = document.getElementById('forgot-password-modal');
    const closeForgotModal = document.getElementById('close-forgot-modal');
    const btnSendReset = document.getElementById('btn-send-reset-email');

    if (forgotLink && forgotModal) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('forgot-email').value = document.getElementById('auth-email').value; // copy qua
            forgotModal.style.display = 'flex';
        });

        closeForgotModal.addEventListener('click', () => {
            forgotModal.style.display = 'none';
        });

        btnSendReset.addEventListener('click', async () => {
            const email = document.getElementById('forgot-email').value;
            if (!email) return alert('Vui lòng nhập định dạng email hợp lệ!');

            btnSendReset.disabled = true;
            btnSendReset.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';

            try {
                await auth.sendPasswordResetEmail(email);
                alert('Hệ thống đã gửi liên kết đặt lại mật khẩu vào hòm thư nội bộ của bạn. Vui lòng kiểm tra (Kể cả hộp thư rác).');
                forgotModal.style.display = 'none';
            } catch (err) {
                alert('Lỗi: ' + err.message);
            } finally {
                btnSendReset.disabled = false;
                btnSendReset.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi liên kết đặt lại';
            }
        });
    }

    // Submit Auth Form
    const btnAuthSubmit = document.getElementById('btn-auth-submit');
    if (btnAuthSubmit) {
        btnAuthSubmit.addEventListener('click', async (e) => {
            e.preventDefault();

            const emailInput = document.getElementById('auth-email');
            const passwordInput = document.getElementById('auth-password');
            const nameInput = document.getElementById('auth-name');
            const errorMsg = document.getElementById('auth-error-msg');

            // Validation thủ công
            if (!emailInput.value || !passwordInput.value) {
                authForm.reportValidity(); // Ép HTML5 hiên popup đỏ
                return;
            }
            if (!isLoginMode && !nameInput.value) {
                errorMsg.style.display = 'block';
                errorMsg.textContent = 'Lỗi: Vui lòng nhập Họ và Tên!';
                return;
            }

            const email = emailInput.value;
            const password = passwordInput.value;
            const name = nameInput.value;

            errorMsg.style.display = 'none';
            btnAuthSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
            btnAuthSubmit.disabled = true;

            try {
                if (isLoginMode) {
                    await auth.signInWithEmailAndPassword(email, password);
                } else {
                    const confirmPasswordInput = document.getElementById('auth-confirm-password');
                    if (!name) throw new Error('Vui lòng nhập Họ và Tên!');
                    if (password !== confirmPasswordInput.value) {
                        throw new Error('Mật khẩu xác nhận không khớp!');
                    }

                    // Đánh cờ để ngăn onAuthStateChanged xử lý trong lúc đăng ký
                    window._isRegistering = true;

                    let cred;
                    try {
                        cred = await auth.createUserWithEmailAndPassword(email, password);
                    } catch (regErr) {
                        if (regErr.code === 'auth/email-already-in-use') {
                            // TK Auth cũ còn tồn tại (data Firestore đã bị xóa)
                            // Thử đăng nhập bằng mật khẩu mới nhập
                            try {
                                cred = await auth.signInWithEmailAndPassword(email, password);
                                // Kiểm tra nếu Firestore doc đã bị xóa → tạo lại
                                const existDoc = await db.collection('users').doc(cred.user.uid).get();
                                if (!existDoc.exists) {
                                    await db.collection('users').doc(cred.user.uid).set({
                                        email: email,
                                        name: name,
                                        role: 'PENDING',
                                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                                    });
                                }
                            } catch (signInErr) {
                                window._isRegistering = false;
                                throw new Error('Email này đã được đăng ký trước đó. Vui lòng bấm "Quên mật khẩu" để lấy lại hoặc liên hệ Admin.');
                            }
                        } else {
                            window._isRegistering = false;
                            throw regErr;
                        }
                    }

                    // Check nếu đăng ký là khách hàng
                    const isCustomer = document.getElementById('auth-is-customer')?.checked;
                    const assignedRole = isCustomer ? 'KHACHHANG' : 'PENDING';

                    // Nếu là tạo mới (không phải recover), tạo Firestore doc
                    const existingDoc = await db.collection('users').doc(cred.user.uid).get();
                    if (!existingDoc.exists) {
                        await db.collection('users').doc(cred.user.uid).set({
                            email: email,
                            name: name,
                            role: assignedRole,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }

                    if (isCustomer) {
                        // Khách hàng: không cần duyệt, vào app luôn
                        window._isRegistering = false;
                        alert('✅ Đăng ký thành công! Chào mừng bạn đến GreenPool.');
                        window.location.reload();
                    } else {
                        // NV: Đăng ký xong -> Đăng xuất ngay để chờ duyệt
                        await auth.signOut();
                        window._isRegistering = false;
                        alert('✅ Đăng ký tài khoản thành công! Vui lòng báo Admin phê duyệt trước khi Đăng nhập.');
                        document.getElementById('auth-name').value = '';
                        const toggleLnk = document.getElementById('auth-toggle-link');
                        if (toggleLnk) toggleLnk.click();
                    }
                }
            } catch (err) {
                window._isRegistering = false;
                errorMsg.style.display = 'block';
                errorMsg.textContent = 'Lỗi: ' + err.message;
            } finally {
                window._isRegistering = false;
                btnAuthSubmit.innerHTML = isLoginMode ? 'Đăng Nhập' : 'Đăng Ký';
                btnAuthSubmit.disabled = false;
            }
        });
    }

    // Logout Pending
    const btnPendingLogout = document.getElementById('btn-pending-logout');
    if (btnPendingLogout) btnPendingLogout.addEventListener('click', () => auth.signOut());

    // Listen to Auth State
    auth.onAuthStateChanged(async (user) => {
        // Bỏ qua nếu đang trong quá trình đăng ký (tránh race condition)
        if (window._isRegistering) return;
        if (user) {
            currentUserId = user.uid;
            // Fetch role
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    const data = userDoc.data();
                    currentUserRole = data.role || 'PENDING';
                    currentUserBranchId = data.branchId || null;
                    window._currentUserData = data; // Store for CLB coachClasses
                    if (currentUserRole === 'FIRED') {
                        // Tài khoản đã bị đuổi việc
                        alert('Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên. Vui lòng liên hệ Ban quản lý để biết thêm chi tiết.');
                        auth.signOut();
                        return;
                    } else if (currentUserRole === 'PENDING') {
                        authUi.style.display = 'none';
                        mainAppUi.style.display = 'none';
                        pendingUi.style.display = 'flex';
                    } else {
                        // LETAN: cho phép đăng nhập nhiều thiết bị
                        authUi.style.display = 'none';
                        pendingUi.style.display = 'none';
                        mainAppUi.style.display = 'flex';
                        applyRoleUI(currentUserRole);
                        initFixedBranches();
                        listenToNotifications();
                        requestNotificationPermission();
                        // Chạy cleanup video hết hạn sau khi auth xác nhận xong
                        if (currentUserRole === 'TEACHER' || currentUserRole === 'ADMIN') {
                            setTimeout(() => cleanupExpiredVideos(), 3000);
                        }
                    }
                    setupLogoutHeader(data.name, currentUserRole, data.avatarUrl);
                    currentUserDisplayName = data.name || 'Người dùng';
                    renderUserProfile(data);
                } else {
                    // Mất doc -> Đá ra
                    auth.signOut();
                }
            } catch (e) {
                console.error("Auth state error", e);
                // CHỈ sign out nếu lỗi không phải do mạng
                if (e.code === 'unavailable' || e.message?.includes('offline') || e.message?.includes('network') || e.message?.includes('Failed to get document')) {
                    console.warn('Network error - giữ phiên đăng nhập, không sign out.');
                } else {
                    auth.signOut();
                }
            }
        } else {
            currentUserId = null;
            currentUserRole = null;
            currentUserBranchId = null;
            currentUserDisplayName = null;
            authUi.style.display = 'flex';
            mainAppUi.style.display = 'none';
            pendingUi.style.display = 'none';
            clearListeners(); // Dọn dẹp listener Firebase cũ
            const infoBox = document.getElementById('user-profile-info');
            if (infoBox) infoBox.style.display = 'none';
        }
    });

    function applyRoleUI(role) {
        const tabs = document.querySelectorAll('.nav-links li');
        tabs.forEach(t => t.style.display = 'flex'); // Reset all

        // Gán class role vào body để CSS có thể ẩn/hiện phần tử theo quyền
        document.body.classList.remove('role-admin', 'role-sale', 'role-teacher', 'role-manager', 'role-letan');
        document.body.classList.add('role-' + role.toLowerCase());

        // Hide Admin + Letan + CLB + SaleStats tab default
        const adminTab = document.getElementById('nav-item-admin');
        const letanTab = document.getElementById('nav-item-letan');
        const clbTab = document.getElementById('nav-item-clb');
        const saleStatsTab = document.getElementById('nav-item-salestats');
        if (adminTab) adminTab.style.display = 'none';
        if (letanTab) letanTab.style.display = 'none';
        if (clbTab) clbTab.style.display = 'none';
        if (saleStatsTab) saleStatsTab.style.display = 'none';

        if (role === 'SALE') {
            const tTab = document.querySelector('[data-tab="teacher"]');
            if (tTab) tTab.style.display = 'none';
            const khTab = document.querySelector('[data-tab="khachhang"]');
            if (khTab) khTab.style.display = 'none';
            if (saleStatsTab) saleStatsTab.style.display = 'flex';
            document.querySelector('[data-tab="sale"]').click();
        } else if (role === 'TEACHER') {
            const sTab = document.querySelector('[data-tab="sale"]');
            if (sTab) sTab.style.display = 'none';
            const khTab = document.querySelector('[data-tab="khachhang"]');
            if (khTab) khTab.style.display = 'none';

            // Ẩn quyền chọn Giáo viên khác, giáo viên chỉ xem được của chính mình
            const tControl = document.querySelector('.teacher-view-controls');
            if (tControl) tControl.style.display = 'none';

            document.querySelector('[data-tab="teacher"]').click();

            // HLV: hiện tab CLB nếu isCoach
            if (window._currentUserData?.isCoach) {
                if (clbTab) clbTab.style.display = 'flex';
                listenToAthletes();
                // Ẩn form nhập VĐV cho HLV (chỉ Sale/Admin nhập)
                const clbAddSec = document.getElementById('clb-add-section');
                if (clbAddSec) clbAddSec.style.display = 'none';
            }

            // Ẩn ô tổng HV cơ sở cho GV
            const statTotal = document.getElementById('stat-total-students');
            if (statTotal) statTotal.style.display = 'none';
            // Hiện nút Báo bận cho GV
            const busySection = document.getElementById('teacher-busy-section');
            if (busySection) busySection.style.display = 'block';
            // Lắng nghe trạng thái bận
            db.collection('users').doc(currentUserId).onSnapshot(doc => {
                if (!doc.exists) return;
                const isBusy = doc.data().isBusy || false;
                const statusText = document.getElementById('busy-status-text');
                const btn = document.getElementById('btn-toggle-busy');
                if (statusText) statusText.innerHTML = isBusy ? '🔴 Đang báo bận — Không có ở bể' : '🟢 Đang sẵn sàng dạy';
                if (btn) {
                    btn.innerHTML = isBusy ? '✅ Có mặt lại' : '⏸️ Báo bận';
                    btn.style.background = isBusy ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)';
                    btn.style.color = isBusy ? '#16a34a' : '#d97706';
                    btn.style.borderColor = isBusy ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)';
                }
                if (busySection) {
                    busySection.querySelector('div').style.borderColor = isBusy ? 'rgba(239,68,68,0.4)' : 'var(--border-color)';
                    busySection.querySelector('div').style.background = isBusy ? 'rgba(239,68,68,0.03)' : 'var(--card-bg)';
                }
            });
        } else if (role === 'ADMIN') {
            if (adminTab) adminTab.style.display = 'flex';
            if (letanTab) letanTab.style.display = 'flex';
            if (clbTab) clbTab.style.display = 'flex';
            if (saleStatsTab) saleStatsTab.style.display = 'flex';
            const clbAdminActions = document.getElementById('clb-admin-actions');
            if (clbAdminActions) clbAdminActions.style.display = 'flex';
            document.querySelector('[data-tab="dashboard"]').click();
            loadAdminUsers();
            listenToAthletes();
            renderLetanClbSection();
        } else if (role === 'MANAGER') {
            // MANAGER: Xem tất cả tab + chỉnh sửa giống Admin nhưng chỉ cơ sở của mình
            if (adminTab) adminTab.style.display = 'flex';
            if (letanTab) letanTab.style.display = 'flex';
            if (clbTab) clbTab.style.display = 'flex';
            document.querySelector('[data-tab="dashboard"]').click();
            loadAdminUsers();
            listenToAthletes();
            renderLetanClbSection();

            // Chỉ ẩn phần duyệt TK + phân quyền (chỉ Admin mới được)
            const style = document.createElement('style');
            style.textContent = `
                .manager-branch #admin-approval-section,
                .manager-branch [onclick*="approveUser"],
                .manager-branch [onclick*="rejectUser"] { display: none !important; }
            `;
            document.head.appendChild(style);
            document.body.classList.add('manager-branch');
        } else if (role === 'LETAN') {
            // LETAN: CHỈ xem tab Lễ Tân, ẩn tất cả tab khác
            const dTab = document.querySelector('[data-tab="dashboard"]');
            if (dTab) dTab.style.display = 'none';
            const sTab = document.querySelector('[data-tab="sale"]');
            if (sTab) sTab.style.display = 'none';
            const tTab = document.querySelector('[data-tab="teacher"]');
            if (tTab) tTab.style.display = 'none';
            const setTab = document.querySelector('[data-tab="settings"]');
            if (setTab) setTab.style.display = 'none';
            const tracuuTab = document.querySelector('[data-tab="khachhang"]');
            if (tracuuTab) tracuuTab.style.display = 'none';
            if (letanTab) letanTab.style.display = 'flex';
            document.querySelector('[data-tab="letan"]').click();
            renderLetanClbSection();
        } else if (role === 'KHACHHANG') {
            // KHACHHANG: chỉ xem Tra cứu tiến trình
            const dTab = document.querySelector('[data-tab="dashboard"]');
            if (dTab) dTab.style.display = 'none';
            const sTab = document.querySelector('[data-tab="sale"]');
            if (sTab) sTab.style.display = 'none';
            const tTab = document.querySelector('[data-tab="teacher"]');
            if (tTab) tTab.style.display = 'none';
            const setTab = document.querySelector('[data-tab="settings"]');
            if (setTab) setTab.style.display = 'none';
            const khTab = document.querySelector('[data-tab="khachhang"]');
            if (khTab) khTab.style.display = 'flex';
            document.querySelector('[data-tab="khachhang"]').click();
        }
    }

    function setupLogoutHeader(name, role, avatarUrl) {
        const roleNames = {
            'ADMIN': '💎 Giám Đốc',
            'MANAGER': '🏢 Quản lý Cơ sở',
            'SALE': '💼 Chuyên viên Sale',
            'TEACHER': '🏊 Huấn luyện viên',
            'LETAN': '📋 Lễ tân',
            'KHACHHANG': '👤 Khách hàng'
        };
        const displayRole = roleNames[role] || 'Học viên';

        const nameEl = document.getElementById('current-user-name');
        const roleEl = document.getElementById('current-user-role');
        const infoBox = document.getElementById('user-profile-info');
        const btnLogout = document.getElementById('btn-header-logout');
        const avatarEl = document.getElementById('current-user-avatar');

        if (nameEl) nameEl.textContent = name || 'Trống';
        if (roleEl) roleEl.textContent = displayRole;
        if (infoBox) infoBox.style.display = 'block';

        // Render avatar in header
        if (avatarEl) {
            if (avatarUrl) {
                avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                const initial = (name || 'U').charAt(0).toUpperCase();
                avatarEl.innerHTML = `<span style="font-size:16px;font-weight:700;">${initial}</span>`;
            }
        }

        if (btnLogout && !btnLogout.hasAttribute('data-bound')) {
            btnLogout.addEventListener('click', () => {
                auth.signOut();
            });
            btnLogout.setAttribute('data-bound', 'true');
        }
    }

    // ===================== APP EVENT BINDINGS ===================== //

    // Lắng nghe Tab
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => {
            document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.getElementById(`tab-${li.getAttribute('data-tab')}`).classList.add('active');
            // Load bảng quản lý khi mở tab Lễ Tân
            if (li.getAttribute('data-tab') === 'letan') {
                renderLetanManageTable();
            }
            if (li.getAttribute('data-tab') === 'clb') {
                renderClbTable();
            }
        });
    });

    let isSaleExceptionMode = false;

    // Ngoại lệ Toggle
    const toggleSaleException = document.getElementById('toggle-sale-exception');
    if (toggleSaleException) {
        toggleSaleException.addEventListener('change', (e) => {
            isSaleExceptionMode = e.target.checked;
            const normalView = document.getElementById('sale-normal-teacher-view');
            const exceptionView = document.getElementById('sale-exception-teacher-view');
            const btnConfirm = document.getElementById('btn-sale-confirm');
            const btnSkip = document.getElementById('btn-sale-skip');

            if (isSaleExceptionMode) {
                if (normalView) normalView.style.display = 'none';
                if (exceptionView) {
                    exceptionView.style.display = 'block';
                    exceptionView.innerHTML = '<select id="sale-exception-select" class="modern-select" style="border-color: #f59e0b; background-color: #fef3c7; color: #b45309;"></select>';
                    const sel = document.getElementById('sale-exception-select');
                    localState.teachers.forEach(t => {
                        const opt = document.createElement('option');
                        opt.value = t.id;
                        opt.textContent = t.name;
                        sel.appendChild(opt);
                    });
                }
                if (btnConfirm) btnConfirm.innerHTML = '<i class="fa-solid fa-star"></i> Xác nhận HĐ Ngoại Lệ';
                if (btnSkip) btnSkip.style.display = 'none'; // Ẩn nút phạt vì ngoại lệ không liên quan đến phạt Queue
            } else {
                if (normalView) normalView.style.display = 'block';
                if (exceptionView) exceptionView.style.display = 'none';
                if (btnConfirm) btnConfirm.innerHTML = '<i class="fa-solid fa-check"></i> Xác nhận Hợp Đồng';
                if (btnSkip) btnSkip.style.display = 'block';
            }
        });
    }

    // Toggle PT sessions - Sale (bỏ static binding, dùng dynamic trong generateSaleStudentForms)

    // Toggle PT sessions - Teacher
    const teacherCurriculum = document.getElementById('teacher-student-curriculum');
    const teacherPtGroup = document.getElementById('teacher-pt-sessions-group');
    if (teacherCurriculum && teacherPtGroup) {
        teacherCurriculum.addEventListener('change', (e) => {
            teacherPtGroup.style.display = e.target.value === 'PT' ? 'block' : 'none';
        });
    }

    // ============ GENERATE DYNAMIC SALE STUDENT FORMS ============ //
    window.generateSaleStudentForms = function (count) {
        const container = document.getElementById('sale-students-container');
        if (!container) return;
        const n = parseInt(count) || 1;

        let html = '';
        if (n > 1) {
            html += `<div style="display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap;">`;
            for (let i = 1; i <= n; i++) {
                html += `<button type="button" onclick="showSaleTab(${i})" id="sale-tab-btn-${i}"
                    style="padding: 6px 14px; border-radius: 8px; border: 1px solid ${i === 1 ? 'var(--primary)' : 'var(--border-color)'};
                    background: ${i === 1 ? 'var(--primary)' : 'transparent'}; color: ${i === 1 ? '#fff' : 'var(--text-muted)'};
                    font-size: 12px; font-weight: 600; cursor: pointer;">HV ${i}</button>`;
            }
            html += `</div>`;
        }

        for (let i = 1; i <= n; i++) {
            html += `
            <div class="sale-student-block" id="sale-block-${i}" style="display: ${i === 1 ? 'block' : 'none'}; ${n > 1 ? 'padding: 12px; border: 1px solid var(--border-color); border-radius: 10px; margin-bottom: 8px;' : ''}">
                ${n > 1 ? `<div style="font-size: 13px; font-weight: 600; color: var(--primary); margin-bottom: 8px;"><i class="fa-solid fa-user"></i> Học viên ${i}</div>` : ''}
                <div class="form-group">
                    <label>Tên Học Viên <span style="color:#ef4444">*</span></label>
                    <input type="text" id="sale-student-name-${i}" placeholder="Nhập tên học viên...">
                </div>
                <div class="form-group">
                    <label>Số Hợp Đồng <span style="color:#ef4444">*</span></label>
                    <input type="text" id="sale-student-contract-${i}" placeholder="Ví dụ: HD00${i}...">
                </div>
                <div class="row-form">
                    <div class="form-group flex-1">
                        <label>Kiểu Bơi <span style="color:#ef4444">*</span></label>
                        <select id="sale-student-curriculum-${i}" class="modern-select" onchange="document.getElementById('sale-pt-group-${i}').style.display = this.value === 'PT' ? 'block' : 'none'">
                            <option value="Bơi Ếch">Bơi Ếch</option>
                            <option value="Bơi Sải">Bơi Sải</option>
                            <option value="Ếch Vip">Ếch Vip (15 buổi)</option>
                            <option value="Sải Vip">Sải Vip (15 buổi)</option>
                            <option value="Bơi Ngửa">Bơi Ngửa</option>
                            <option value="Bơi Bướm">Bơi Bướm</option>
                            <option value="PT">Khách PT (Cá nhân)</option>
                        </select>
                    </div>
                    <div class="form-group" id="sale-pt-group-${i}" style="display: none; flex: 1;">
                        <label>Số buổi PT</label>
                        <input type="number" id="sale-student-pt-${i}" placeholder="Nhập số buổi..." min="1" value="10">
                    </div>
                </div>
                <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" id="sale-student-test-${i}" style="width:16px; height:16px; cursor:pointer;">
                    <label for="sale-student-test-${i}" style="font-size:13px; color:var(--text-muted); cursor:pointer; margin:0;">🧪 Học viên test đăng ký</label>
                </div>
                <details style="margin-top: 6px;">
                    <summary style="font-size: 12px; color: var(--text-muted); cursor: pointer; user-select: none;">
                        <i class="fa-solid fa-plus-circle"></i> Thông tin bổ sung (không bắt buộc)
                    </summary>
                    <div style="margin-top: 8px;">
                        <div class="row-form">
                            <div class="form-group flex-1">
                                <label>Số Điện Thoại</label>
                                <input type="tel" id="sale-student-phone-${i}" placeholder="Nhập số điện thoại...">
                            </div>
                            <div class="form-group flex-1">
                                <label>Giới tính</label>
                                <select id="sale-student-gender-${i}" class="modern-select">
                                    <option value="Nam">Nam</option>
                                    <option value="Nữ">Nữ</option>
                                </select>
                            </div>
                        </div>
                        <div class="row-form">
                            <div class="form-group flex-1">
                                <label>Nhóm tuổi</label>
                                <select id="sale-student-age-group-${i}" class="modern-select">
                                    <option value="Trẻ em">Trẻ em</option>
                                    <option value="Người lớn">Người lớn</option>
                                </select>
                            </div>
                            <div class="form-group" style="width:80px;">
                                <label>Số tuổi</label>
                                <input type="number" id="sale-student-age-${i}" placeholder="VD: 8" min="1" max="80" class="modern-select" style="padding:8px 10px;">
                            </div>
                        </div>
                    </div>
                </details>
            </div>`;
        }
        container.innerHTML = html;
    };

    window.showSaleTab = function (idx) {
        document.querySelectorAll('.sale-student-block').forEach(b => b.style.display = 'none');
        document.querySelectorAll('[id^="sale-tab-btn-"]').forEach(btn => {
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-muted)';
            btn.style.borderColor = 'var(--border-color)';
        });
        const block = document.getElementById(`sale-block-${idx}`);
        const btn = document.getElementById(`sale-tab-btn-${idx}`);
        if (block) block.style.display = 'block';
        if (btn) { btn.style.background = 'var(--primary)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--primary)'; }
    };

    // Init default 1 form
    generateSaleStudentForms(1);

    // ============ SWITCH FORM MODE (Sale / Tự Tuyển) ============ //
    let currentFormMode = 'sale';
    window.switchFormMode = function (mode) {
        currentFormMode = mode;
        const btnSale = document.getElementById('form-mode-sale');
        const btnSelf = document.getElementById('form-mode-self');
        const saleSection = document.getElementById('sale-teacher-section');
        const selfSection = document.getElementById('self-teacher-section');
        const countSection = document.getElementById('sale-contract-count-section');
        const penaltyBtns = document.getElementById('sale-penalty-buttons');

        if (mode === 'sale') {
            if (btnSale) { btnSale.style.background = 'var(--primary)'; btnSale.style.color = '#fff'; }
            if (btnSelf) { btnSelf.style.background = 'transparent'; btnSelf.style.color = 'var(--text-muted)'; }
            if (saleSection) saleSection.style.display = '';
            if (selfSection) selfSection.style.display = 'none';
            if (countSection) countSection.style.display = '';
            if (penaltyBtns) penaltyBtns.style.display = 'flex';
        } else {
            if (btnSelf) { btnSelf.style.background = 'var(--secondary)'; btnSelf.style.color = '#fff'; }
            if (btnSale) { btnSale.style.background = 'transparent'; btnSale.style.color = 'var(--text-muted)'; }
            if (saleSection) saleSection.style.display = 'none';
            if (selfSection) selfSection.style.display = '';
            if (countSection) countSection.style.display = 'none';
            if (penaltyBtns) penaltyBtns.style.display = 'none';
            // Reset to 1 form in self mode
            document.getElementById('sale-contract-count').value = '1';
            generateSaleStudentForms(1);
        }
    };

    // Gán học viên từ Sale hoặc Tự Tuyển (UNIFIED HANDLER)
    const formSaleAdd = document.getElementById('form-sale-add');
    if (formSaleAdd) {
        formSaleAdd.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                // === CHẾ ĐỘ TỰ TUYỂN ===
                if (currentFormMode === 'self') {
                    const name = document.getElementById('sale-student-name-1')?.value;
                    const contractNumber = document.getElementById('sale-student-contract-1')?.value || '';
                    const curriculum = document.getElementById('sale-student-curriculum-1')?.value || 'Bơi Ếch';
                    const phone = document.getElementById('sale-student-phone-1')?.value || '';
                    const gender = document.getElementById('sale-student-gender-1')?.value || 'Nam';
                    const ageCategory = document.getElementById('sale-student-age-group-1')?.value || 'Trẻ em';
                    const age = parseInt(document.getElementById('sale-student-age-1')?.value) || 0;
                    const ptSessions = document.getElementById('sale-student-pt-1')?.value || '10';
                    const teacherId = document.getElementById('select-teacher-view-self')?.value;

                    if (!name) return alert('❌ Vui lòng nhập Tên học viên!');
                    if (!contractNumber) return alert('❌ Vui lòng nhập Số hợp đồng!');
                    if (!teacherId) return alert('❌ Chưa chọn Giáo viên tự tuyển!');

                    // Kiểm tra trùng số hợp đồng (client-side filter)
                    if (contractNumber) {
                        const allBranch = await db.collection('students')
                            .where('branchId', '==', currentBranchId)
                            .get();
                        const dup = allBranch.docs.find(doc => doc.data().contractNumber === contractNumber);
                        if (dup) {
                            return alert(`Số hợp đồng "${contractNumber}" đã tồn tại! Vui lòng kiểm tra lại.`);
                        }
                    }

                    const isTestStudent = document.getElementById('sale-student-test-1')?.checked || false;
                    await db.collection('students').add({
                        name, phone, gender, ageCategory, age: age || 0, assignedTeacherId: teacherId,
                        contractNumber: contractNumber || 'Chưa có',
                        branchId: currentBranchId, sessions: 0,
                        totalSessions: (curriculum === 'Ếch Vip' || curriculum === 'Sải Vip') ? 15 : (curriculum === 'PT' ? (parseInt(ptSessions) || 10) : 10),
                        curriculum: curriculum || 'Bơi Ếch', source: 'Self',
                        creatorId: currentUserId,
                        isTestStudent: isTestStudent,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // Auto sync lên Google Sheet
                    const tObjSelf = localState.teachers.find(t => t.id === teacherId);
                    const branchObjSelf = FIXED_BRANCHES.find(b => b.id === currentBranchId);
                    syncToGoogleSheet({
                        name, phone,
                        contractNumber: contractNumber || 'Chưa có',
                        curriculum: curriculum || 'Bơi Ếch',
                        teacherName: tObjSelf?.name || 'N/A',
                        saleName: currentUserDisplayName || 'Sale',
                        branchName: branchObjSelf?.name || 'N/A'
                    });

                    alert('✅ Thêm học viên tự tuyển thành công!');

                    // Gửi thông báo cho GV được gán (nếu khác người tạo)
                    if (teacherId !== currentUserId) {
                        sendNotification(teacherId, 'contract', `📝 ${currentUserDisplayName || 'Nhân viên'} vừa thêm HV tự tuyển "${name}" cho bạn (HĐ: ${contractNumber || 'Chưa có'}, ${curriculum || 'Bơi Ếch'}).`);
                    }
                    // Gửi thông báo cho Quản lý cơ sở
                    try {
                        const mgrSelfSnap = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', currentBranchId).get();
                        mgrSelfSnap.forEach(doc => sendNotification(doc.id, 'contract', `📋 HĐ tự tuyển: "${currentUserDisplayName || 'GV'}" → HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ếch'})`));
                    } catch (e) { console.error('Manager notify self error:', e); }
                    // Gửi thông báo cho Admin
                    try {
                        const adminSelfSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
                        adminSelfSnap.forEach(doc => {
                            if (doc.id !== currentUserId) sendNotification(doc.id, 'contract', `📋 HĐ tự tuyển: "${currentUserDisplayName || 'GV'}" → HV "${name}" (HĐ: ${contractNumber || 'N/A'}, ${curriculum || 'Bơi Ếch'}) - CS: ${FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || ''}`);
                        });
                    } catch (e) { console.error('Admin notify self error:', e); }

                    generateSaleStudentForms(1);
                    return;
                }

                // === CHẾ ĐỘ SALE ===
                const count = parseInt(document.getElementById('sale-contract-count')?.value) || 1;

                let teacherId;
                if (isSaleExceptionMode) {
                    const exSel = document.getElementById('sale-exception-select');
                    if (exSel) teacherId = exSel.value;
                } else {
                    teacherId = document.getElementById('sale-suggested-teacher-id')?.value;
                }
                if (!teacherId) return alert('Hệ thống chưa xác định được Giáo viên!');

                // Validate all forms
                for (let i = 1; i <= count; i++) {
                    const name = document.getElementById(`sale-student-name-${i}`)?.value;
                    const contract = document.getElementById(`sale-student-contract-${i}`)?.value;
                    if (!name || !contract) {
                        showSaleTab(i);
                        return alert(`❌ HV ${i}: Vui lòng nhập đủ Tên và Số HĐ!`);
                    }
                }

                // Submit all students
                for (let i = 1; i <= count; i++) {
                    const name = document.getElementById(`sale-student-name-${i}`).value;
                    const phone = document.getElementById(`sale-student-phone-${i}`).value;
                    const gender = document.getElementById(`sale-student-gender-${i}`).value;
                    const age = parseInt(document.getElementById(`sale-student-age-${i}`).value) || 0;
                    const ageCategory = document.getElementById(`sale-student-age-group-${i}`).value;
                    const contractNumber = document.getElementById(`sale-student-contract-${i}`).value;
                    const curriculum = document.getElementById(`sale-student-curriculum-${i}`).value;
                    const ptSessions = document.getElementById(`sale-student-pt-${i}`)?.value || '10';

                    const isFirstStudent = (i === 1);
                    const isTest = document.getElementById(`sale-student-test-${i}`)?.checked || false;
                    await saleAssignStudent(name, phone, gender, ageCategory, contractNumber, teacherId, curriculum, ptSessions, isSaleExceptionMode && isFirstStudent, age, isTest);
                }

                alert(`✅ Đã gán ${count} học viên thành công!`);
                generateSaleStudentForms(1);
                document.getElementById('sale-contract-count').value = '1';

                if (isSaleExceptionMode) {
                    toggleSaleException.checked = false;
                    toggleSaleException.dispatchEvent(new Event('change'));
                }
                renderDashboard();
            } catch (submitErr) {
                console.error('SUBMIT ERROR:', submitErr);
                alert('❌ Lỗi xác nhận HĐ: ' + submitErr.message);
            }
        });
    }

    // Điểm danh Buổi học
    window.incrementSession = async function (studentId, currentSessions, totalSessions = 10) {
        if (currentSessions < totalSessions) {
            await db.collection('students').doc(studentId).update({
                sessions: currentSessions + 1
            });
        }
    };

    // Chốt lương cho học viên đủ điều kiện
    window.confirmSalary = async function (studentId, studentName) {
        if (!confirm(`Xác nhận CHỐT LƯƠNG cho học viên "${studentName}"? Hành động này không thể hoàn tác.`)) return;
        try {
            await db.collection('students').doc(studentId).update({
                salaryConfirmed: true,
                salaryConfirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
                salaryConfirmedBy: currentUserId
            });
            alert(`Đã chốt lương cho "${studentName}" thành công!`);
        } catch (e) {
            console.error(e);
            alert('Lỗi: ' + e.message);
        }
    };

    // Mở Modal Giáo Án Của Học Viên
    window.openCurriculumModal = function (id, name, type, currentStep) {
        const modal = document.getElementById('curriculum-modal');
        if (!modal) return;

        document.getElementById('curriculum-student-id').value = id;
        document.getElementById('curriculum-type').value = type;
        document.getElementById('curriculum-student-info').textContent = `Học viên: ${name} (${type})`;

        const stepsContainer = document.getElementById('curriculum-steps');
        stepsContainer.innerHTML = '';

        let steps = [];
        if (type === 'Bơi Ếch') {
            steps = ['Làm quen nước', 'Đạp chân ếch', 'Chân kết hợp thở', 'Tay ếch kết hợp thở', 'Chân tay kết hợp thở', 'Hoàn thiện'];
        } else if (type === 'Bơi Sải') {
            steps = ['Chân sải', 'Chân kết hợp thở', 'Tay sải', 'Tay kết hợp thở', 'Chân tay kết hợp thở', 'Hoàn thiện'];
        }

        steps.forEach((stepName, i) => {
            const stepNum = i + 1;
            const isChecked = stepNum <= currentStep;
            stepsContainer.innerHTML += `
                <div style="display: flex; align-items: center; gap: 10px; padding: 12px; background: ${isChecked ? 'rgba(16,185,129,0.1)' : '#f8fafc'}; border: 1px solid ${isChecked ? '#10b981' : '#e2e8f0'}; border-radius: 6px;">
                    <input type="radio" name="curriculum-step-radio" id="step-${stepNum}" value="${stepNum}" ${stepNum == currentStep ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                    <label for="step-${stepNum}" style="margin: 0; cursor: pointer; color: ${isChecked ? '#059669' : '#475569'}; font-weight: ${isChecked ? '600' : '400'}; flex-grow: 1;">
                        Bước ${stepNum}: ${stepName}
                        ${isChecked ? ' <i class="fa-solid fa-circle-check" style="color: #10b981; margin-left: 5px;"></i>' : ''}
                    </label>
                </div>
            `;
        });

        modal.style.display = 'flex';
    };

    // Đóng Modal Giáo Án
    const closeBtn = document.getElementById('close-curriculum-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('curriculum-modal').style.display = 'none';
        });
    }

    // Lưu Tiến Trình Giáo Án
    const saveCurriculumBtn = document.getElementById('btn-save-curriculum');
    if (saveCurriculumBtn) {
        saveCurriculumBtn.addEventListener('click', async () => {
            const id = document.getElementById('curriculum-student-id').value;
            const checkedRadio = document.querySelector('input[name="curriculum-step-radio"]:checked');
            if (!checkedRadio) {
                // Nếu User không chọn nút nào cả (chưa có bước nào trong quá khứ)
                return alert('Vui lòng tích chọn Bước giáo án hiện tại!');
            }

            saveCurriculumBtn.disabled = true;
            saveCurriculumBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

            const step = parseInt(checkedRadio.value);
            try {
                await db.collection('students').doc(id).update({
                    currentStep: step
                });
                document.getElementById('curriculum-modal').style.display = 'none';
            } catch (e) {
                console.error(e);
                alert("Lỗi lưu tiến trình: " + e.message);
            } finally {
                saveCurriculumBtn.disabled = false;
                saveCurriculumBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lưu Tiến Trình';
            }
        });
    }

    // Bỏ qua Thêm/Xóa Giáo Viên vì hiện tại quản lý qua Users Đăng Ký

    // Lắng nghe khi select Teacher View đổi -> render lại list
    const btnSelectTeacherView = document.getElementById('select-teacher-view');
    if (btnSelectTeacherView) {
        btnSelectTeacherView.addEventListener('change', renderTeacherStudents);
    }

    // Tìm kiếm học viên
    const searchInput = document.getElementById('teacher-search-student');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            teacherSearchQuery = e.target.value;
            renderTeacherStudents();
        });
    }

    // Lọc trạng thái (Tất cả / Đang học / Hoàn thành)
    document.querySelectorAll('.teacher-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.teacher-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            teacherFilterMode = btn.getAttribute('data-filter');
            renderTeacherStudents();
        });
    });

    // Lắng nghe chuyển đổi cơ sở
    const branchSel = document.getElementById('global-branch-select');
    if (branchSel) {
        branchSel.addEventListener('change', (e) => {
            if (e.target.value) {
                listenToBranchData(e.target.value);
            }
        });
    }

    // Toggle Theme
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            let isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            isDark = !isDark;

            if (isDark) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('greenpool-theme', 'dark');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('greenpool-theme', 'light');
            }
            updateThemeToggleUI(isDark);
        });
    }

}); // Đóng DOMContentLoaded 

// ===================== KHỞI TẠO CƠ SỞ (BRANCH_LOGIC) ===================== //

// Danh sách 5 cơ sở cố định
let FIXED_BRANCHES = [
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
    if (currentUserRole === 'ADMIN') {
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

    // Nếu không phải ADMIN thì Disable tính năng chọn cơ sở luôn để giao diện là tĩnh
    if (currentUserRole !== 'ADMIN') {
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

// ===================== KHÁCH HÀNG - TRA CỨU TIẾN TRÌNH ===================== //
let _khSearchTimeout = null;
window.searchStudentProgress = function (query) {
    const container = document.getElementById('khachhang-results');
    if (!container) return;

    if (!query || query.trim().length < 2) {
        container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">
            <i class="fa-solid fa-search" style="font-size: 28px; display: block; margin-bottom: 10px;"></i>
            Nhập tên hoặc số hợp đồng để tra cứu
        </div>`;
        return;
    }

    clearTimeout(_khSearchTimeout);
    _khSearchTimeout = setTimeout(async () => {
        container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 20px;"></i> Đang tìm...
        </div>`;

        try {
            // Chỉ query HV thuộc các cơ sở đang hoạt động thay vì toàn bộ
            const branchIds = FIXED_BRANCHES.filter(b => !b.paused).map(b => b.id);
            let allDocs = [];
            // Firestore 'in' chỉ hỗ trợ tối đa 10 giá trị
            for (let bi = 0; bi < branchIds.length; bi += 10) {
                const chunk = branchIds.slice(bi, bi + 10);
                const partSnap = await db.collection('students').where('branchId', 'in', chunk).get();
                allDocs = allDocs.concat(partSnap.docs);
            }
            const q = query.trim().toLowerCase();
            const results = allDocs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(s => s.name.toLowerCase().includes(q) || (s.contractNumber && s.contractNumber.toLowerCase().includes(q)));

            if (results.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">
                    <i class="fa-solid fa-user-slash" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>
                    Không tìm thấy học viên "${query}"
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
                    .orderBy('createdAt', 'desc')
                    .get();
                attSnap.docs.forEach(d => {
                    const data = d.data();
                    if (!attendanceMap[data.studentId]) attendanceMap[data.studentId] = [];
                    attendanceMap[data.studentId].push(data);
                });
            } catch (e) { console.warn('Attendance query:', e); }

            container.innerHTML = results.map(st => {
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
                            <div style="margin-top:8px; font-size:11px; color:var(--text-muted); font-style:italic;">
                                📝 Tiến trình học sẽ được cập nhật trong phiên bản tiếp theo
                            </div>
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

// ===================== ADMIN USERS MANAGEMENT ===================== //
let adminUsersUnsub = null;

function loadAdminUsers() {
    if (adminUsersUnsub) adminUsersUnsub();
    adminUsersUnsub = db.collection('users').orderBy('createdAt', 'desc').onSnapshot(snap => {
        const list = document.getElementById('admin-users-list');
        if (!list) return;
        list.innerHTML = '';

        // Build branch options HTML
        const branchOpts = localState.branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

        snap.docs.forEach(doc => {
            const u = doc.data();
            // LỌC CHỈ RENDER NHỮNG TÀI KHOẢN CHƯA CẤP QUYỀN
            if (u.role !== 'PENDING') return;

            const isPending = true;
            // Determine current branch for the select
            const currentBranchId = u.branchId || localState.branches[0].id; // Mặc định cơ sở đầu tiên nếu chưa có

            // Re-build select HTML with selected state specifically for this user
            const userBranchOpts = localState.branches.map(b =>
                `<option value="${b.id}" ${b.id === currentBranchId ? 'selected' : ''}>${b.name}</option>`
            ).join('');

            const html = `
                <div class="student-card" style="border: 1px solid ${isPending ? 'var(--warning)' : 'var(--border-color)'}; margin-bottom: 10px;">
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <div style="font-weight: 600; font-size: 16px;">${u.name}</div>
                            <div style="font-size: 13px; color: var(--text-muted);">${u.email}</div>
                        </div>
                        <div style="display:flex; gap:10px; align-items:center; flex-wrap: wrap;">
                            <select id="role-select-${doc.id}" class="modern-select" style="padding: 6px 12px; width: 140px; height: 36px; border-radius: 6px; font-size: 13px;">
                                <option value="PENDING" ${u.role === 'PENDING' ? 'selected' : ''}>⏳ Chờ duyệt</option>
                                <option value="SALE" ${u.role === 'SALE' ? 'selected' : ''}>💼 Sale</option>
                                <option value="TEACHER" ${u.role === 'TEACHER' ? 'selected' : ''}>🏊 Giáo Viên</option>
                                <option value="MANAGER" ${u.role === 'MANAGER' ? 'selected' : ''}>🏢 Quản Lý CS</option>
                                <option value="LETAN" ${u.role === 'LETAN' ? 'selected' : ''}>📋 Lễ Tân</option>
                                <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>👑 Admin</option>
                            </select>
                            
                            <select id="branch-select-${doc.id}" class="modern-select" style="padding: 6px 12px; width: 150px; height: 36px; border-radius: 6px; font-size: 13px;">
                                ${userBranchOpts}
                            </select>

                            <button class="btn btn-sm btn-primary" onclick="updateUserRole('${doc.id}')" style="height: 36px;">Cấp quyền</button>
                        </div>
                    </div>
                </div>
            `;
            list.innerHTML += html;
        });

        // Nếu không có ai cần duyệt
        if (list.innerHTML === '') {
            list.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">Không có tài khoản nào đang chờ duyệt.</div>`;
        }
    });

    // Sau khi nạp Users Pending, cũng chạy luôn nạp Thống Kê
    loadAdminStaffStats();
    loadAdminDetailedOverview();
}

let adminStatsUnsub = null;
function loadAdminStaffStats() {
    if (adminStatsUnsub) adminStatsUnsub();
    adminStatsUnsub = db.collection('users').onSnapshot(async snap => {
        const statsArea = document.getElementById('admin-staff-stats');
        const teacherTypeList = document.getElementById('admin-teacher-type-list');
        if (!statsArea) return;

        let statsCounter = {}; // Format: { "xadan": { teacher: 2, sale: 1 } }
        FIXED_BRANCHES.forEach(b => {
            statsCounter[b.id] = { name: b.name, teacher: 0, sale: 0 };
        });

        // Group staff by branch
        const branchTeachers = {};
        const branchSales = {};
        const branchManagers = {};
        FIXED_BRANCHES.forEach(b => { branchTeachers[b.id] = ''; branchSales[b.id] = ''; branchManagers[b.id] = ''; });

        snap.docs.forEach(doc => {
            const u = doc.data();
            if (u.role === 'TEACHER' && u.branchId && statsCounter[u.branchId]) {
                statsCounter[u.branchId].teacher++;
                const currentType = u.teacherType || 'Chính';
                branchTeachers[u.branchId] += `
                    <div class="student-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border: 1px solid ${u.queuePaused ? '#f59e0b' : 'var(--border-color)'}; border-radius: 8px; flex-wrap: wrap; gap: 10px; ${u.queuePaused ? 'opacity: 0.7; background: rgba(245,158,11,0.05);' : ''}">
                        <div>
                            <div style="font-weight: 600; font-size: 15px;">${u.queuePaused ? '⏸️' : '🟢'} ${u.name} ${u.isCoach ? '<span style="background:#f59e0b; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:4px;">🏅 HLV</span>' : ''}</div>
                            <div style="font-size: 12px; color: var(--text-muted);">${u.email || ''} ${u.queuePaused ? '<span style="color:#f59e0b; font-weight:600;">• TẠM DỪNG HÀNG ĐỢI</span>' : ''}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <select id="teacher-type-${doc.id}" class="modern-select" style="padding: 5px 10px; width: 110px; height: 34px; border-radius: 6px; font-size: 13px; border-color: ${currentType === 'CTV' ? '#f59e0b' : 'var(--primary)'}; background: ${currentType === 'CTV' ? '#fef3c7' : 'rgba(37,99,235,0.05)'}; color: ${currentType === 'CTV' ? '#b45309' : 'var(--primary)'}; font-weight: 600;">
                                <option value="Chính" ${currentType === 'Chính' ? 'selected' : ''}>🎫 Chính</option>
                                <option value="CTV" ${currentType === 'CTV' ? 'selected' : ''}>🌟 CTV</option>
                            </select>
                            <button class="btn btn-sm btn-primary" onclick="updateTeacherType('${doc.id}', '${u.branchId}')" style="height: 34px; font-size: 12px; white-space: nowrap;"><i class="fa-solid fa-floppy-disk"></i> Lưu</button>
                            ${u.queuePaused
                        ? `<button class="btn btn-sm" onclick="resumeTeacher('${doc.id}', '${u.name}', '${u.branchId}')" style="height: 34px; font-size: 12px; white-space: nowrap; background: rgba(34,197,94,0.1); color: #16a34a; border: 1px solid rgba(34,197,94,0.3);"><i class="fa-solid fa-play"></i> Cho vào HĐ</button>`
                        : `<button class="btn btn-sm" onclick="pauseTeacher('${doc.id}', '${u.name}', '${u.branchId}')" style="height: 34px; font-size: 12px; white-space: nowrap; background: rgba(245,158,11,0.1); color: #d97706; border: 1px solid rgba(245,158,11,0.3);"><i class="fa-solid fa-pause"></i> Tạm dừng</button>`
                    }
                            <button class="btn btn-sm" onclick="fireUser('${doc.id}', '${u.name.replace(/'/g, "\\\\'")}', '${u.branchId}')" style="height: 34px; font-size: 12px; white-space: nowrap; background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);"><i class="fa-solid fa-user-xmark"></i> Nghỉ việc</button>
                            <button class="btn btn-sm" onclick="renameUser('${doc.id}', '${u.name.replace(/'/g, "\\'")}')"
                                style="height: 34px; font-size: 12px; white-space: nowrap; background: rgba(37,99,235,0.1); color: var(--primary); border: 1px solid rgba(37,99,235,0.25);"><i class="fa-solid fa-pen"></i> Sửa tên</button>
                            <button class="btn btn-sm" onclick="toggleCoach('${doc.id}', ${u.isCoach ? 'true' : 'false'})" style="height: 34px; font-size: 12px; white-space: nowrap; background: ${u.isCoach ? 'rgba(245,158,11,0.15)' : 'rgba(107,114,128,0.1)'}; color: ${u.isCoach ? '#d97706' : '#6b7280'}; border: 1px solid ${u.isCoach ? 'rgba(245,158,11,0.3)' : 'rgba(107,114,128,0.25)'};"><i class="fa-solid fa-medal"></i> ${u.isCoach ? '🏅 ' + (u.coachClasses || []).join(',') : 'HLV'}</button>
                        </div>
                    </div>
                `;
            } else if (u.role === 'SALE' && u.branchId && statsCounter[u.branchId]) {
                statsCounter[u.branchId].sale++;
                branchSales[u.branchId] += `
                    <div class="student-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border: 1px solid var(--border-color); border-radius: 8px;">
                        <div>
                            <div style="font-weight: 600; font-size: 15px;"><i class="fa-solid fa-briefcase" style="color: var(--warning);"></i> ${u.name}</div>
                            <div style="font-size: 12px; color: var(--text-muted);">${u.email || ''}</div>
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button class="btn btn-sm" onclick="fireUser('${doc.id}', '${u.name.replace(/'/g, "\\\\'")}', '')" style="height: 34px; font-size: 12px; white-space: nowrap; background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);"><i class="fa-solid fa-user-xmark"></i> Nghỉ việc</button>
                        <button class="btn btn-sm" onclick="renameUser('${doc.id}', '${u.name.replace(/'/g, "\\\\'")}')\" style="height: 34px; font-size: 12px; white-space: nowrap; background: rgba(37,99,235,0.1); color: var(--primary); border: 1px solid rgba(37,99,235,0.25);"><i class="fa-solid fa-pen"></i> Sửa tên</button>
                        </div>
                    </div>
                `;
            } else if (u.role === 'MANAGER') {
                if (u.branchId) {
                    const branchName = FIXED_BRANCHES.find(b => b.id === u.branchId)?.name || 'Chưa rõ';
                    branchManagers[u.branchId] = (branchManagers[u.branchId] || '') + `
                        <div class="student-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border: 1px solid var(--border-color); border-radius: 8px;">
                            <div>
                                <div style="font-weight: 600; font-size: 15px;"><i class="fa-solid fa-building" style="color: var(--secondary);"></i> ${u.name}</div>
                                <div style="font-size: 12px; color: var(--text-muted);">${u.email || ''} • ${branchName}</div>
                            </div>
                            <button class="btn btn-sm" onclick="fireUser('${doc.id}', '${u.name}', '')" style="height: 34px; font-size: 12px; white-space: nowrap; background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);"><i class="fa-solid fa-lock"></i> Khoá TK</button>
                        </div>
                    `;
                }
            }
        });

        // Render bảng thống kê cơ sở (kèm HV + test student)
        const allStudentsSnap = await db.collection('students').get();
        const branchStudentCount = {};
        const branchTestCount = {};
        FIXED_BRANCHES.forEach(b => { branchStudentCount[b.id] = 0; branchTestCount[b.id] = 0; });
        allStudentsSnap.forEach(doc => {
            const d = doc.data();
            if (d.branchId && branchStudentCount[d.branchId] !== undefined) {
                branchStudentCount[d.branchId]++;
                if (d.isTestStudent) branchTestCount[d.branchId]++;
            }
        });

        // Lọc cơ sở cho MANAGER (chỉ xem cơ sở mình)
        const isManager = currentUserRole === 'MANAGER';
        const branchesToShow = isManager
            ? FIXED_BRANCHES.filter(b => b.id === currentBranchId)
            : FIXED_BRANCHES;

        statsArea.innerHTML = '';
        branchesToShow.forEach(branch => {
            const branchId = branch.id;
            const stat = statsCounter[branchId];
            const stuCount = branchStudentCount[branchId] || 0;
            const testCount = branchTestCount[branchId] || 0;
            const card = `
                  <div class="stat-card student-card" style="padding: 15px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--card-bg);">
                      <div class="stat-title" style="font-size: 15px; font-weight: 600; color: var(--text-color);">${stat.name}</div>
                      <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 14px;">
                           <span style="color: var(--text-muted);"><i class="fa-solid fa-person-swimming" style="color: var(--primary);"></i> Giáo viên:</span>
                           <span style="font-weight: 600;">${stat.teacher}</span>
                      </div>
                      <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 14px;">
                           <span style="color: var(--text-muted);"><i class="fa-solid fa-briefcase" style="color: var(--warning);"></i> Sale:</span>
                           <span style="font-weight: 600;">${stat.sale}</span>
                      </div>
                      <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 14px;">
                           <span style="color: var(--text-muted);"><i class="fa-solid fa-users" style="color: #3b82f6;"></i> Tổng HV:</span>
                           <span style="font-weight: 600;">${stuCount}</span>
                      </div>
                      <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 14px;">
                           <span style="color: var(--text-muted);">🧪 HV test đăng ký:</span>
                           <span style="font-weight: 600; color: #8b5cf6;">${testCount}</span>
                      </div>
                  </div>
             `;
            statsArea.innerHTML += card;
        });

        // Render bảng quản lý nhân sự — chia theo cơ sở
        if (teacherTypeList) {
            let allStaffHtml = '';
            branchesToShow.forEach(branch => {
                const branchId = branch.id;
                const tCards = branchTeachers[branchId] || '';
                const sCards = branchSales[branchId] || '';
                const mCards = branchManagers[branchId] || '';
                if (!tCards && !sCards && !mCards) return;

                allStaffHtml += `<div style="margin-bottom: 20px; padding: 16px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--card-bg);">`;
                allStaffHtml += `<div style="font-size: 16px; font-weight: 700; color: var(--primary); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border-color);">📍 ${branch.name}</div>`;
                if (tCards) allStaffHtml += '<div style="font-size:13px; font-weight:600; color:var(--primary); margin-bottom:8px;"><i class="fa-solid fa-person-swimming"></i> Giáo viên</div>' + tCards;
                if (sCards) allStaffHtml += '<div style="font-size:13px; font-weight:600; color:var(--warning); margin-top:15px; margin-bottom:8px;"><i class="fa-solid fa-briefcase"></i> Sale</div>' + sCards;
                if (mCards) allStaffHtml += '<div style="font-size:13px; font-weight:600; color:var(--secondary); margin-top:15px; margin-bottom:8px;"><i class="fa-solid fa-building"></i> Quản lý</div>' + mCards;
                allStaffHtml += `</div>`;
            });
            teacherTypeList.innerHTML = allStaffHtml || '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Chưa có nhân sự nào được duyệt.</div>';
        }
    });
}

// Admin đổi Loại Giáo Viên (Chính <-> CTV)
window.updateTeacherType = async function (userId, branchId) {
    const sel = document.getElementById(`teacher-type-${userId}`);
    if (!sel) return;
    const newType = sel.value;

    try {
        // Cập nhật trường teacherType trong Firestore
        await db.collection('users').doc(userId).update({ teacherType: newType });

        // Cập nhật Queue: Xóa vé cũ rồi thêm vé mới với số lượng đúng
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let turns = doc.data().turns || [];
                    // Xóa tất cả vé cũ của GV này
                    turns = turns.filter(id => id !== userId);
                    // Thêm lại vé mới đúng số lượng (Chính = 2, CTV = 1)
                    const ticketCount = newType === 'CTV' ? 1 : 2;
                    // Vé 1: cuối queue
                    turns.push(userId);
                    // Vé 2 (nếu Chính): xen vào giữa, tránh liền nhau
                    if (ticketCount === 2 && turns.length > 1) {
                        const insertPos = Math.floor(turns.length / 2);
                        turns.splice(insertPos, 0, userId);
                    }
                    transaction.update(qDoc, { turns });
                }
            });
        }

        alert(`Đã cập nhật Giáo viên thành loại "${newType}" thành công! Hàng đợi đã được điều chỉnh lại số vé.`);
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

// Admin sửa tên GV/Sale
// Toggle trạng thái Báo bận cho GV
window.toggleTeacherBusy = async function () {
    if (!currentUserId) return;
    try {
        const doc = await db.collection('users').doc(currentUserId).get();
        const currentBusy = doc.exists ? (doc.data().isBusy || false) : false;
        const newBusy = !currentBusy;
        await db.collection('users').doc(currentUserId).update({ isBusy: newBusy });
        if (newBusy) {
            alert('⏸️ Đã báo bận — Lễ tân sẽ không điểm danh HV cho bạn khi bạn không ở bể.\n\n(Không ảnh hưởng đến lượt nhận hợp đồng)');
        } else {
            alert('✅ Đã có mặt lại — Sẵn sàng dạy bình thường!');
        }
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

window.renameUser = async function (userId, currentName) {
    const newName = prompt(`✏️ Sửa tên cho "${currentName}":\n(Tối đa 30 ký tự)`, currentName);
    if (newName === null) return;
    const trimmed = newName.trim().substring(0, 30);
    if (!trimmed) return alert('Tên không được để trống!');
    if (trimmed === currentName) return alert('Tên không thay đổi.');

    try {
        await db.collection('users').doc(userId).update({ name: trimmed });
        alert(`✅ Đã đổi tên thành "${trimmed}"!`);
        loadAdminUsers();
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Admin đuổi việc nhân viên (GV hoặc Sale)
// Toggle HLV cho GV
window.toggleCoach = async function (userId, currentlyCoach) {
    const ALL_CLB_CLASSES = ['Mầm', 'D1', 'D2', 'C', 'B', 'A'];

    if (currentlyCoach) {
        // Đã là HLV → cho phép sửa lớp hoặc tắt
        const userDoc = await db.collection('users').doc(userId).get();
        const currentClasses = userDoc.data()?.coachClasses || [];

        const action = prompt(
            `🏅 HLV đang phụ trách: ${currentClasses.join(', ') || 'Chưa có lớp'}\n\n` +
            `📝 Nhập lớp mới (cách nhau bằng dấu phẩy):\nCác lớp: ${ALL_CLB_CLASSES.join(', ')}\n\n` +
            `Hoặc nhập "TẮT" để tắt quyền HLV.`,
            currentClasses.join(',')
        );
        if (action === null) return; // Cancel

        if (action.trim().toUpperCase() === 'TẮT' || action.trim().toUpperCase() === 'TAT') {
            if (!confirm('Tắt quyền HLV cho giáo viên này?')) return;
            await db.collection('users').doc(userId).update({ isCoach: false, coachClasses: [] });
            alert('✅ Đã tắt HLV!');
        } else {
            const classes = action.split(',').map(c => c.trim()).filter(c => ALL_CLB_CLASSES.includes(c));
            if (classes.length === 0) return alert('⚠️ Không có lớp hợp lệ! Các lớp: ' + ALL_CLB_CLASSES.join(', '));
            await db.collection('users').doc(userId).update({ coachClasses: classes });
            alert(`✅ Đã cập nhật lớp HLV: ${classes.join(', ')}`);
        }
    } else {
        const classStr = prompt(
            `🏅 BẬT HLV — Chọn lớp phụ trách (cách nhau bằng dấu phẩy):\n\nCác lớp: ${ALL_CLB_CLASSES.join(', ')}\nVD: Mầm,D1,D2`,
            'Mầm,D1'
        );
        if (!classStr) return;
        const classes = classStr.split(',').map(c => c.trim()).filter(c => ALL_CLB_CLASSES.includes(c));
        if (classes.length === 0) return alert('⚠️ Không có lớp hợp lệ! Các lớp: ' + ALL_CLB_CLASSES.join(', '));
        await db.collection('users').doc(userId).update({ isCoach: true, coachClasses: classes });
        alert(`✅ Đã bật HLV — Lớp: ${classes.join(', ')}`);
    }
    loadAdminUsers();
};

window.fireUser = async function (userId, userName, branchId) {
    if (!confirm(`⚠️ XÁC NHẬN CHO NGHỈ VIỆC: Bạn chắc chắn muốn vô hiệu hóa tài khoản "${userName}"? Người này sẽ không thể đăng nhập được nữa và phải đăng ký tài khoản mới.`)) return;

    try {
        // Đổi role thành FIRED
        await db.collection('users').doc(userId).update({ role: 'FIRED' });

        // Xóa khỏi Queue nếu là Giáo viên
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let turns = doc.data().turns || [];
                    turns = turns.filter(id => id !== userId);
                    let skipList = doc.data().skipList || [];
                    skipList = skipList.filter(id => id !== userId);
                    transaction.update(qDoc, { turns, skipList });
                }
            });
        }

        alert(`Đã cho "${userName}" nghỉ việc thành công! Tài khoản đã bị vô hiệu hóa và xóa khỏi hàng đợi.`);
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

// Admin tạm dừng GV khỏi hàng đợi
window.pauseTeacher = async function (userId, userName, branchId) {
    if (!confirm(`⏸️ Xác nhận TẠM DỪNG "${userName}" khỏi hàng đợi nhận học viên?\n\nGiáo viên sẽ không nhận học viên mới cho đến khi bạn cho phép quay lại.`)) return;
    try {
        // Đánh dấu tạm dừng
        await db.collection('users').doc(userId).update({ queuePaused: true });

        // Xóa khỏi queue
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let turns = doc.data().turns || [];
                    turns = turns.filter(id => id !== userId);
                    transaction.update(qDoc, { turns });
                }
            });
        }
        alert(`⏸️ Đã tạm dừng "${userName}" khỏi hàng đợi. Bấm "Cho vào HĐ" để cho GV quay lại.`);
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

// Admin cho GV quay lại hàng đợi (xếp cuối)
window.resumeTeacher = async function (userId, userName, branchId) {
    if (!confirm(`▶️ Xác nhận cho "${userName}" QUAY LẠI hàng đợi nhận học viên?\n\nGiáo viên sẽ được xếp VÀO CUỐI hàng đợi.`)) return;
    try {
        // Bỏ cờ tạm dừng
        await db.collection('users').doc(userId).update({ queuePaused: false });

        // Lấy loại GV để push đúng số vé
        const userDoc = await db.collection('users').doc(userId).get();
        const teacherType = userDoc.data()?.teacherType || 'Chính';

        // Push vào cuối queue
        await pushTeacherToQueue(userId, teacherType, branchId);

        alert(`▶️ "${userName}" đã quay lại hàng đợi! Đã xếp vào cuối với ${teacherType === 'Chính' ? '2 vé' : '1 vé'}.`);
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

// Admin đẩy GV lên đầu hàng đợi (bù phạt oan)
window.boostTeacher = async function (teacherId, teacherName) {
    if (!confirm(`⬆️ Xác nhận ƯU TIÊN cho "${teacherName}"?\n\nSẽ xóa 1 lần phạt gần nhất và đẩy GV lên đầu hàng đợi.`)) return;

    try {
        // 1. XÓA PENALTY TRƯỚC
        const penSnap = await db.collection('penalties')
            .where('teacherId', '==', teacherId)
            .get();
        console.log('Penalties found for', teacherName, ':', penSnap.size);
        if (!penSnap.empty) {
            const sorted = penSnap.docs.sort((a, b) => {
                const ta = a.data().createdAt?.toMillis?.() || a.data().createdAt?.seconds || 0;
                const tb = b.data().createdAt?.toMillis?.() || b.data().createdAt?.seconds || 0;
                return tb - ta;
            });
            console.log('Deleting penalty doc:', sorted[0].id);
            await sorted[0].ref.delete();
            console.log('Penalty deleted successfully');
        } else {
            console.log('No penalties to delete for', teacherName);
        }

        // 2. ĐẨY LÊN ĐẦU HÀNG ĐỢI
        const userDoc = await db.collection('users').doc(teacherId).get();
        const branchId = userDoc.data()?.branchId;
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (!doc.exists) return;
                let turns = doc.data().turns || [];
                const idx = turns.indexOf(teacherId);
                if (idx === -1) {
                    turns.unshift(teacherId);
                } else if (idx > 0) {
                    turns.splice(idx, 1);
                    turns.unshift(teacherId);
                }
                transaction.update(qDoc, { turns });
            });
        }

        alert(`⬆️ Đã xóa 1 lần phạt và đẩy "${teacherName}" lên đầu hàng đợi!`);
    } catch (e) {
        console.error('boostTeacher error:', e);
        alert('Lỗi: ' + e.message);
    }
};

// Admin: Xóa toàn bộ phạt của 1 cơ sở
window.clearBranchPenalties = async function (branchId, branchName) {
    if (!confirm('Xóa TẤT CẢ lịch sử phạt của "' + (branchName || branchId) + '"?\n\nHành động này không thể hoàn tác!')) return;
    try {
        const snap = await db.collection('penalties').where('branchId', '==', branchId).get();
        const batch = db.batch();
        snap.docs.forEach(function (doc) { batch.delete(doc.ref); });
        await batch.commit();
        alert('Đã xóa ' + snap.size + ' bản ghi phạt.');
    } catch (e) {
        console.error(e);
        alert('Lỗi: ' + e.message);
    }
};

window.updateUserRole = async function (userId) {
    const roleSel = document.getElementById(`role-select-${userId}`);
    const branchSel = document.getElementById(`branch-select-${userId}`);

    if (!roleSel || !branchSel) return;

    const newRole = roleSel.value;
    const newBranchId = branchSel.value;

    try {
        // Kiểm tra LETAN: mỗi cơ sở chỉ được 1 tài khoản Lễ Tân
        if (newRole === 'LETAN') {
            const existingLetan = await db.collection('users')
                .where('role', '==', 'LETAN')
                .where('branchId', '==', newBranchId)
                .get();
            if (!existingLetan.empty) {
                const existing = existingLetan.docs[0].data();
                return alert(`❌ Cơ sở này đã có Lễ Tân: "${existing.name}"!\nMỗi cơ sở chỉ được 1 tài khoản Lễ Tân.`);
            }
        }

        await db.collection('users').doc(userId).update({
            role: newRole,
            branchId: newBranchId
        });

        // NẾU DUYỆT LÀ GIÁO VIÊN -> TỰ ĐỘNG ĐẨY VÀO QUEUE
        if (newRole === 'TEACHER') {
            const teacherType = (await db.collection('users').doc(userId).get()).data()?.teacherType || 'Chính';
            await pushTeacherToQueue(userId, teacherType, newBranchId);
        }

    } catch (e) {
        alert('Lỗi cập nhật: ' + e.message);
    }
};

// ===================== ADMIN DETAILED OVERVIEW ===================== //
let adminDetailedUnsubUsers = null;
let adminDetailedUnsubStudents = null;
let adminDetailedUnsubPenalties = null;

function loadAdminDetailedOverview() {
    if (adminDetailedUnsubUsers) adminDetailedUnsubUsers();
    if (adminDetailedUnsubStudents) adminDetailedUnsubStudents();
    if (adminDetailedUnsubPenalties) adminDetailedUnsubPenalties();

    const overviewContainer = document.getElementById('admin-branch-overview');
    if (!overviewContainer) return;

    let usersData = [];
    let studentsData = [];
    let penaltiesData = [];

    adminDetailedUnsubUsers = db.collection('users').onSnapshot(snapUsers => {
        usersData = snapUsers.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processOverview();
    });

    adminDetailedUnsubStudents = db.collection('students').onSnapshot(snapStudents => {
        studentsData = snapStudents.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processOverview();
    });

    adminDetailedUnsubPenalties = db.collection('penalties').onSnapshot(snapPenalties => {
        penaltiesData = snapPenalties.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processOverview();
    });

    function processOverview() {
        if (!overviewContainer) return;

        const isManager = currentUserRole === 'MANAGER';
        const approvalSection = document.getElementById('admin-approval-section');
        if (approvalSection) approvalSection.style.display = isManager ? 'none' : '';

        let allTeachers = usersData.filter(u => u.role === 'TEACHER');
        let allSales = usersData.filter(u => u.role === 'SALE');
        allTeachers.forEach(t => { t.studentCount = studentsData.filter(s => s.assignedTeacherId === t.id).length; });

        let fullHtml = '';

        // ======= TỪNG CƠ SỞ =======
        FIXED_BRANCHES.forEach(branch => {
            const bT = allTeachers.filter(t => t.branchId === branch.id).sort((a, b) => b.studentCount - a.studentCount);
            const bS = allSales.filter(s => s.branchId === branch.id);
            const bStd = studentsData.filter(s => s.branchId === branch.id);
            const bPen = penaltiesData.filter(p => p.branchId === branch.id);
            const bSelf = bStd.filter(s => s.source === 'Self');

            fullHtml += `<div style="background:var(--card-bg); border-radius:12px; border:1px solid var(--border-color); overflow:hidden;">`;
            fullHtml += `<div style="padding:14px 18px; background:linear-gradient(135deg, var(--primary), #1e40af); color:white; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">`;
            fullHtml += `<b style="font-size:16px;"><i class="fa-solid fa-location-dot"></i> ${branch.name}</b>`;
            fullHtml += `<div style="display:flex; gap:12px; font-size:13px;"><span><i class="fa-solid fa-person-swimming"></i> ${bT.length} GV</span><span><i class="fa-solid fa-briefcase"></i> ${bS.length} Sale</span><span><i class="fa-solid fa-users"></i> ${bStd.length} HV</span></div>`;
            fullHtml += `</div><div style="padding:16px;">`;

            // GV
            fullHtml += `<div style="font-weight:600; font-size:14px; margin-bottom:8px; color:var(--primary);"><i class="fa-solid fa-person-swimming"></i> Giáo Viên</div>`;
            if (bT.length === 0) { fullHtml += `<div style="color:var(--text-muted); font-size:13px; padding:6px 0;">Chưa có GV.</div>`; }
            else { bT.forEach(t => { fullHtml += `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-color); font-size:13px;"><span style="font-weight:500;">${t.name}</span><span style="font-weight:700; color:var(--primary);">${t.studentCount} HV</span></div>`; }); }

            // Sale
            fullHtml += `<div style="font-weight:600; font-size:14px; margin:14px 0 8px; color:var(--warning);"><i class="fa-solid fa-briefcase"></i> Sale</div>`;
            if (bS.length === 0) { fullHtml += `<div style="color:var(--text-muted); font-size:13px; padding:6px 0;">Chưa có Sale.</div>`; }
            else { bS.forEach(sale => { const sc = bStd.filter(s => s.creatorId === sale.id).length; fullHtml += `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-color); font-size:13px;"><span style="font-weight:500;">${sale.name}</span><span style="font-weight:700; color:var(--warning);">${sc} HĐ</span></div>`; }); }

            // Phạt + Tự tuyển grid
            fullHtml += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:14px;">`;
            // Phạt
            fullHtml += `<div style="background:rgba(239,68,68,0.03); border-radius:8px; padding:10px; border:1px solid rgba(239,68,68,0.15);">`;
            fullHtml += `<div style="font-weight:600; font-size:12px; color:var(--danger); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;"><span><i class="fa-solid fa-ban"></i> Phạt Mất Lượt</span>`;
            if (currentUserRole === 'ADMIN' && bPen.length > 0) {
                fullHtml += `<button onclick="clearBranchPenalties('${branch.id}','${branch.name.replace(/'/g, "\\\\'")}')" style="padding:2px 6px; font-size:9px; border-radius:4px; border:1px solid rgba(239,68,68,0.3); background:rgba(239,68,68,0.08); color:var(--danger); cursor:pointer;" title="Xóa tất cả phạt cơ sở này"><i class="fa-solid fa-trash"></i> Xóa hết</button>`;
            }
            fullHtml += `</div>`;
            if (bPen.length === 0) { fullHtml += `<div style="color:var(--text-muted); font-size:12px;">Chưa có</div>`; }
            else {
                const pc = {}; const lastReasons = {};
                bPen.forEach(p => {
                    if (!pc[p.teacherId]) { pc[p.teacherId] = { name: p.teacherName || '?', count: 0 }; lastReasons[p.teacherId] = []; }
                    pc[p.teacherId].count++;
                    if (p.reason) lastReasons[p.teacherId].push(p.reason);
                });
                Object.keys(pc).sort((a, b) => pc[b].count - pc[a].count).forEach(tid => {
                    const reasons = lastReasons[tid];
                    const reasonText = reasons.length > 0 ? reasons[reasons.length - 1] : '';
                    fullHtml += `<div style="padding:3px 0; border-bottom:1px dashed rgba(239,68,68,0.1);">`;
                    fullHtml += `<div style="display:flex; justify-content:space-between; font-size:12px;"><span>${pc[tid].name}</span><span style="color:var(--danger); font-weight:700;">${pc[tid].count} lần`;
                    if (currentUserRole === 'ADMIN') { fullHtml += ` <button onclick="boostTeacher('${tid}','${pc[tid].name.replace(/'/g, "\\\\'")}')" style="padding:1px 5px; font-size:10px; border-radius:4px; border:1px solid rgba(34,197,94,0.4); background:rgba(34,197,94,0.1); color:#16a34a; cursor:pointer;" title="Ưu tiên"><i class="fa-solid fa-arrow-up"></i></button>`; }
                    fullHtml += `</span></div>`;
                    if (reasonText) { fullHtml += `<div style="font-size:10px; color:var(--text-muted); margin-top:1px;">💬 ${reasonText}</div>`; }
                    fullHtml += `</div>`;
                });
            }
            fullHtml += `</div>`;
            // Tự tuyển
            fullHtml += `<div style="background:rgba(16,185,129,0.03); border-radius:8px; padding:10px; border:1px solid rgba(16,185,129,0.15);">`;
            fullHtml += `<div style="font-weight:600; font-size:12px; color:var(--secondary); margin-bottom:6px;"><i class="fa-solid fa-user-plus"></i> GV Tự Tuyển</div>`;
            if (bSelf.length === 0) { fullHtml += `<div style="color:var(--text-muted); font-size:12px;">Chưa có</div>`; }
            else {
                const sc2 = {}; bSelf.forEach(s => { const tid = s.assignedTeacherId; if (!sc2[tid]) { const tu = usersData.find(u => u.id === tid); sc2[tid] = { name: tu ? tu.name : '?', count: 0 }; } sc2[tid].count++; });
                Object.keys(sc2).sort((a, b) => sc2[b].count - sc2[a].count).forEach(tid => {
                    fullHtml += `<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0;"><span>${sc2[tid].name}</span><span style="color:var(--secondary); font-weight:700;">${sc2[tid].count} HĐ</span></div>`;
                });
            }
            fullHtml += `</div></div>`;

            // Phân tích cơ sở
            if (bT.length >= 2) {
                const diff = bT[0].studentCount - bT[bT.length - 1].studentCount;
                if (diff > 2) {
                    fullHtml += `<div style="margin-top:12px; padding:10px; background:rgba(255,69,58,0.05); border-left:3px solid var(--danger); border-radius:6px; font-size:12px;"><b style="color:var(--danger);">⚠️ Chênh lệch ${diff} HV:</b> ${bT[0].name} (${bT[0].studentCount}) vs ${bT[bT.length - 1].name} (${bT[bT.length - 1].studentCount})</div>`;
                } else {
                    fullHtml += `<div style="margin-top:12px; padding:10px; background:rgba(34,197,94,0.05); border-left:3px solid var(--secondary); border-radius:6px; font-size:12px; color:var(--secondary);"><i class="fa-solid fa-check-circle"></i> Phân bổ cân bằng</div>`;
                }
            }
            fullHtml += `</div></div>`;
        });

        // ======= TOÀN HỆ THỐNG =======
        const totalStd = studentsData.length, totalPen = penaltiesData.length, totalSelf = studentsData.filter(s => s.source === 'Self').length;
        fullHtml += `<div style="background:var(--card-bg); border-radius:12px; border:1px solid var(--border-color); overflow:hidden;">`;
        fullHtml += `<div style="padding:14px 18px; background:linear-gradient(135deg, #059669, #047857); color:white;"><b style="font-size:16px;"><i class="fa-solid fa-chart-line"></i> Phân Tích Toàn Hệ Thống</b></div>`;
        fullHtml += `<div style="padding:16px; font-size:13px;">`;
        fullHtml += `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(100px, 1fr)); gap:10px; margin-bottom:14px;">`;
        fullHtml += `<div style="text-align:center; padding:10px; background:rgba(37,99,235,0.05); border-radius:8px;"><div style="font-size:24px; font-weight:700; color:var(--primary);">${totalStd}</div><div style="font-size:11px; color:var(--text-muted);">Tổng HV</div></div>`;
        fullHtml += `<div style="text-align:center; padding:10px; background:rgba(239,68,68,0.05); border-radius:8px;"><div style="font-size:24px; font-weight:700; color:var(--danger);">${totalPen}</div><div style="font-size:11px; color:var(--text-muted);">Tổng Phạt</div></div>`;
        fullHtml += `<div style="text-align:center; padding:10px; background:rgba(16,185,129,0.05); border-radius:8px;"><div style="font-size:24px; font-weight:700; color:var(--secondary);">${totalSelf}</div><div style="font-size:11px; color:var(--text-muted);">Tự Tuyển</div></div>`;
        fullHtml += `<div style="text-align:center; padding:10px; background:rgba(245,158,11,0.05); border-radius:8px;"><div style="font-size:24px; font-weight:700; color:var(--warning);">${allTeachers.length}</div><div style="font-size:11px; color:var(--text-muted);">Tổng GV</div></div>`;
        fullHtml += `</div>`;

        let hasWarn = false;
        FIXED_BRANCHES.forEach(branch => {
            const bT2 = allTeachers.filter(t => t.branchId === branch.id).sort((a, b) => b.studentCount - a.studentCount);
            if (bT2.length >= 2) {
                const diff = bT2[0].studentCount - bT2[bT2.length - 1].studentCount;
                if (diff > 2) {
                    hasWarn = true;
                    fullHtml += `<div style="padding:10px; margin-bottom:8px; background:rgba(255,69,58,0.05); border-left:3px solid var(--danger); border-radius:6px;"><b style="color:var(--danger);">⚠️ ${branch.name}:</b> Chênh ${diff} HV (${bT2[0].name}: ${bT2[0].studentCount} vs ${bT2[bT2.length - 1].name}: ${bT2[bT2.length - 1].studentCount})</div>`;
                }
            }
        });
        if (!hasWarn) { fullHtml += `<div style="text-align:center; color:var(--secondary); padding:10px;"><i class="fa-solid fa-check-circle" style="font-size:20px;"></i><br>Tất cả cơ sở đang phân bổ cân bằng ✅</div>`; }
        fullHtml += `</div></div>`;

        overviewContainer.innerHTML = fullHtml;

        // 4. BẢNG DANH SÁCH TẤT CẢ HỌC VIÊN
        const allStudentsTbody = document.getElementById('admin-all-students-tbody');
        if (allStudentsTbody) {
            let stuHtml = '';

            // Sắp xếp sinh viên mới nhất lên đầu
            const sortedStudents = [...studentsData].sort((a, b) => {
                const dateA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : a.createdAt) : 0;
                const dateB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : b.createdAt) : 0;
                return dateB - dateA;
            });

            sortedStudents.forEach(stu => {
                const branchName = FIXED_BRANCHES.find(b => b.id === stu.branchId)?.name || 'N/A';
                // Tra cứu từ toàn bộ usersData (bao gồm FIRED)
                const teacherUser = usersData.find(u => u.id === stu.assignedTeacherId);
                const teacherName = teacherUser ? (teacherUser.role === 'FIRED' ? teacherUser.name + ' (nghỉ)' : teacherUser.name) : '<span class="text-muted">Chưa gán</span>';
                const creatorUser = usersData.find(u => u.id === stu.creatorId);
                const creatorName = creatorUser ? creatorUser.name : (stu.source === 'Self' ? '<span class="badge badge-self">GV Tự Tuyển</span>' : '<span class="text-muted">Không rõ</span>');

                const total = stu.totalSessions || 10;
                const percent = Math.min((stu.sessions / total) * 100, 100);
                const isDone = stu.sessions >= total;
                const progressColor = isDone ? 'var(--danger)' : 'var(--primary)';

                stuHtml += `
                    <tr style="border-bottom: 1px solid var(--border-color); hover:background: var(--bg-color);">
                        <td style="padding: 12px 15px;">
                            <div style="font-weight: 600; color: var(--text-color);">${stu.name}</div>
                            ${stu.phone ? `<div style="font-size: 12px; color: var(--text-muted);">${stu.phone}</div>` : ''}
                        </td>
                        <td style="padding: 12px 15px; font-size: 14px; color: var(--text-color);">${branchName}</td>
                        <td style="padding: 12px 15px; font-size: 14px; color: var(--text-color); font-weight: 500;">${teacherName}</td>
                        <td style="padding: 12px 15px; font-size: 14px; color: var(--text-color);">${creatorName}
                            <button onclick="changeSaleForStudent('${stu.id}')" style="margin-left:6px; padding:2px 6px; border:none; background:rgba(59,130,246,0.1); color:#3b82f6; border-radius:4px; cursor:pointer; font-size:11px;" title="Đổi Sale"><i class="fa-solid fa-right-left"></i></button>
                        </td>
                        <td style="padding: 12px 15px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div style="flex-grow: 1; height: 6px; background: rgba(0,0,0,0.1); border-radius: 3px; overflow: hidden; min-width: 60px;">
                                    <div style="width: ${percent}%; height: 100%; background: ${progressColor};"></div>
                                </div>
                                <span style="font-size: 12px; font-weight: bold; color: ${isDone ? 'var(--danger)' : 'var(--text-color)'}; margin-right: 15px">${stu.sessions}/${total}</span>
                            </div>
                        </td>
                    </tr>
                `;
            });
            allStudentsTbody.innerHTML = stuHtml || `<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">Hệ thống chưa ghi nhận học viên nào.</td></tr>`;
        }
    }
}

// ============ ĐỔI SALE QUẢN LÝ HỢP ĐỒNG ============ //
// Đổi Sale cho HĐ học viên thường
window.changeSaleForStudent = async function (studentId) {
    if (currentUserRole !== 'ADMIN') return alert('⚠️ Chỉ Admin được đổi Sale!');
    try {
        const stuDoc = await db.collection('students').doc(studentId).get();
        if (!stuDoc.exists) return alert('Không tìm thấy học viên!');
        const stu = stuDoc.data();

        // Load danh sách Sale + Admin
        const usersSnap = await db.collection('users').get();
        const sales = usersSnap.docs.filter(d => {
            const r = d.data().role;
            return r === 'SALE' || r === 'ADMIN';
        }).map(d => ({ id: d.id, name: d.data().name }));

        const list = sales.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
        const pick = prompt(`🔄 Đổi Sale cho HV "${stu.name}"\n\nChọn Sale mới (nhập số):\n${list}`);
        if (!pick) return;
        const idx = parseInt(pick) - 1;
        if (idx < 0 || idx >= sales.length) return alert('Số không hợp lệ!');
        const newSale = sales[idx];

        await db.collection('students').doc(studentId).update({
            creatorId: newSale.id,
            saleId: newSale.id
        });
        alert(`✅ Đã chuyển HĐ "${stu.name}" → Sale "${newSale.name}"!`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Đổi Sale cho VĐV CLB
window.changeSaleForAthlete = async function (athleteId) {
    if (currentUserRole !== 'ADMIN') return alert('⚠️ Chỉ Admin được đổi Sale!');
    try {
        const athDoc = await db.collection('athletes').doc(athleteId).get();
        if (!athDoc.exists) return alert('Không tìm thấy VĐV!');
        const ath = athDoc.data();

        const usersSnap = await db.collection('users').get();
        const sales = usersSnap.docs.filter(d => {
            const r = d.data().role;
            return r === 'SALE' || r === 'ADMIN';
        }).map(d => ({ id: d.id, name: d.data().name }));

        const list = sales.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
        const pick = prompt(`🔄 Đổi Sale cho VĐV CLB "${ath.name}"\n\nChọn Sale mới (nhập số):\n${list}`);
        if (!pick) return;
        const idx = parseInt(pick) - 1;
        if (idx < 0 || idx >= sales.length) return alert('Số không hợp lệ!');
        const newSale = sales[idx];

        await db.collection('athletes').doc(athleteId).update({
            creatorId: newSale.id,
            creatorName: newSale.name
        });
        alert(`✅ Đã chuyển VĐV CLB "${ath.name}" → Sale "${newSale.name}"!`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

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
    const saleName = document.getElementById('clb-sale')?.value;

    if (!name) return alert('⚠️ Vui lòng nhập tên VĐV!');

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
            creatorId: currentUserId,
            creatorName: saleName || window._currentUserData?.name || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('✅ Đã thêm VĐV CLB mới!');
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

    if (!name) return alert('⚠️ Vui lòng nhập tên VĐV!');

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
                        const oldContracts = ex.contractHistory || [];
                        oldContracts.push({ contractNumber: ex.contractNumber, months: ex.contractMonths, sessions: ex.sessionsPerWeek, expiredAt: ex.expiresAt, classLevel: ex.classLevel });
                        await db.collection('athletes').doc(existDoc.id).update({
                            contractNumber: newContract,
                            contractMonths,
                            sessionsPerWeek,
                            classLevel,
                            isExpired: false,
                            isFrozen: false,
                            activatedAt: null,
                            expiresAt: null,
                            contractHistory: oldContracts
                        });
                        alert(`✅ Đã kích hoạt lại HĐ mới "${newContract}" cho ${ex.name}!\nHĐ cũ "${ex.contractNumber}" đã lưu lại.\nTổng buổi đã học vẫn giữ: ${ex.totalAttendance || 0}`);
                        document.getElementById('sale-clb-name').value = '';
                        document.getElementById('sale-clb-phone').value = '';
                        document.getElementById('sale-clb-contract').value = '';
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
            activatedAt: null,
            expiresAt: null,
            isExpired: false,
            totalAttendance: 0,
            creatorId: currentUserId,
            creatorName: window._currentUserData?.name || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('✅ Đã thêm VĐV CLB mới!');
        document.getElementById('sale-clb-name').value = '';
        document.getElementById('sale-clb-phone').value = '';
        document.getElementById('sale-clb-contract').value = '';
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
                    opt.value = u.name;
                    opt.textContent = u.name;
                    saleSelect.appendChild(opt);
                }
            });
        });
    }

    clbAthleteUnsub = query.onSnapshot(snap => {
        clbAthletesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Auto-expire kiểm tra
        const now = new Date();
        clbAthletesCache.forEach(a => {
            if (!a.isExpired && a.expiresAt) {
                const exp = a.expiresAt.toDate ? a.expiresAt.toDate() : new Date(a.expiresAt);
                if (now > exp) {
                    db.collection('athletes').doc(a.id).update({ isExpired: true });
                }
            }
        });

        renderClbTable();
    });
}

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
                <div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:10px; padding:12px; text-align:center;">
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
                <div style="background:${levelColor[l]}15; border:1px solid ${levelColor[l]}40; border-radius:10px; padding:12px; text-align:center;">
                    <div style="font-size:22px; font-weight:700; color:${levelColor[l]};">${classCounts[l]}</div>
                    <div style="font-size:11px; color:var(--text-muted);">Lớp ${l}</div>
                </div>`;
        });
        // Today attendance count
        const today = new Date(); today.setHours(0, 0, 0, 0);
        db.collection('clb_attendance').where('timestamp', '>=', today).get().then(snap => {
            let todayCount = snap.size;
            if (currentUserRole === 'TEACHER') {
                const cc = window._currentUserData?.coachClasses || [];
                todayCount = snap.docs.filter(d => cc.includes(d.data().classLevel)).length;
            }
            const todayEl = document.getElementById('clb-today-count');
            if (todayEl) todayEl.textContent = todayCount;
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

    let html = '';
    filtered.forEach(a => {
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
    tbody.innerHTML = html;
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

        const updates = {
            name: name.trim() || a.name,
            phone: phone.trim(),
            gender: gender.trim() || 'Nam',
            classLevel: ALL_CLB.includes(classLevel.trim()) ? classLevel.trim() : a.classLevel,
            contractNumber: contractNumber.trim() || 'Chưa có',
            sessionsPerWeek: parseInt(sessionsPerWeek) || a.sessionsPerWeek,
            contractMonths: parseInt(contractMonths) || a.contractMonths
        };

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
                <input type="text" id="letan-clb-search" placeholder="Tìm tên VĐV CLB..." 
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
    const athletes = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.name.toLowerCase().includes(q) || (a.phone || '').includes(q));

    if (athletes.length === 0) {
        resultsDiv.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-muted);">Không tìm thấy VĐV</div>';
        return;
    }

    resultsDiv.innerHTML = athletes.map(a => {
        const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' }[a.classLevel] || '#6b7280';
        const isExpired = a.isExpired || (a.expiresAt && (a.expiresAt.toDate ? a.expiresAt.toDate() : new Date(a.expiresAt)) < new Date());
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border:1px solid var(--border-color); border-radius:10px; margin-bottom:8px; background:var(--card-bg);">
                <div>
                    <div style="font-weight:600;">${a.name} <span style="background:${levelColor}; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">${a.classLevel}</span></div>
                    <div style="font-size:12px; color:var(--text-muted);">${a.phone || ''} • ${a.sessionsPerWeek} buổi/tuần • ${a.contractMonths}T ${isExpired ? '• <span style="color:#ef4444;font-weight:600;">HẾT HẠN</span>' : ''}</div>
                </div>
                <button class="btn btn-sm btn-primary" onclick="markClbAttendance('${a.id}')" style="font-size:12px; padding:6px 14px; white-space:nowrap;" ${isExpired ? 'disabled style="opacity:0.5;"' : ''}>
                    <i class="fa-solid fa-check"></i> Điểm danh
                </button>
            </div>
        `;
    }).join('');
};

window.markClbAttendance = async function (athleteId) {
    try {
        const doc = await db.collection('athletes').doc(athleteId).get();
        if (!doc.exists) return alert('Không tìm thấy VĐV!');
        const a = doc.data();

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
        // Check đã điểm danh hôm nay chưa
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayAttendance = await db.collection('clb_attendance')
            .where('athleteId', '==', athleteId)
            .where('timestamp', '>=', today)
            .get();
        if (todayAttendance.size >= 1) {
            if (!confirm(`⚠️ VĐV "${a.name}" đã điểm danh hôm nay rồi (${todayAttendance.size} lần).\n\nXác nhận điểm danh lần ${todayAttendance.size + 1}?`)) return;
        }

        // Check quá buổi/tuần
        const now = new Date();
        const startOfWeek = new Date(now);
        const day = startOfWeek.getDay();
        startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1)); // Monday
        startOfWeek.setHours(0, 0, 0, 0);

        const weekAttendance = await db.collection('clb_attendance')
            .where('athleteId', '==', athleteId)
            .where('timestamp', '>=', startOfWeek)
            .get();

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

        await db.collection('athletes').doc(athleteId).update(updates);

        // Lưu attendance record
        await db.collection('clb_attendance').add({
            athleteId,
            athleteName: a.name,
            branchId: currentBranchId || currentUserBranchId,
            classLevel: a.classLevel,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            markedBy: currentUserId
        });

        alert(`✅ Điểm danh thành công: ${a.name} (Buổi ${(a.totalAttendance || 0) + 1})`);
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
            .where('timestamp', '>=', today)
            .orderBy('timestamp', 'desc')
            .get();

        if (snap.empty) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Chưa có điểm danh CLB hôm nay.</div>';
            return;
        }

        const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' };
        const SESSION_MINUTES = 90;

        // Chia thành đang tập và đã kết thúc
        const active = [];
        const ended = [];
        snap.docs.forEach(doc => {
            const d = doc.data();
            const ts = d.timestamp?.toDate ? d.timestamp.toDate() : null;
            const diffMin = ts ? Math.floor((now - ts) / 60000) : 999;
            const isActive = diffMin < SESSION_MINUTES;
            const remaining = SESSION_MINUTES - diffMin;
            const entry = { ...d, ts, diffMin, isActive, remaining };
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
                html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border:1px solid rgba(34,197,94,0.4); border-radius:8px; margin-bottom:6px; background:rgba(34,197,94,0.05);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#16a34a; animation:pulse 1.5s infinite;"></span>
                        <span style="background:${lc}; color:#fff; padding:2px 8px; border-radius:5px; font-size:11px; font-weight:700;">${d.classLevel || '?'}</span>
                        <div style="font-weight:600; font-size:14px; color:var(--text-color);">${d.athleteName || 'VĐV'}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-size:12px; color:#16a34a; font-weight:600;">Còn ${d.remaining} phút</span>
                        <span style="font-size:12px; color:var(--text-muted);"><i class="fa-solid fa-clock" style="margin-right:3px;"></i>${time}</span>
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
