// ============================================================
// MODULE: CLB KID - Quản lý VĐV CLB Thăng Long
// Tách từ app.js ngày 2026-05-09
// Functions: 42 functions (syncClbSheet, renderClbTable, addAthlete,
//   markClbAttendance, listenToAthletes, etc.)
// Dependencies (global từ app.js):
//   db, localState, firebase, currentUserId, currentUserRole,
//   currentUserDisplayName, currentBranchId, FIXED_BRANCHES,
//   sendNotification, isDivingCurriculum, renderDashboard,
//   GOOGLE_CLB_SHEET_URL
// ============================================================

// ===================== NOTE ===================== //
// syncClbRowToSheet, syncAllStudentsToSheet, syncAttendanceToSheet,
// syncClbToSheet, toggleAdminSection, showLoading, parseCurriculumValue,
// updateTeacherSelects, updateSaleSuggestedTeacher, renderLivePool,
// autoRepairQueue — đã chuyển sang app-core.js (app.min.js)
// ================================================= //

window.renderDashboard = function() {
    autoRepairQueue();

    const elStudents = document.getElementById('total-students');
    const elTeachers = document.getElementById('total-teachers');
    const elSales = document.getElementById('total-sales');
    const elNewToday = document.getElementById('total-new-today');

    if (elStudents) elStudents.textContent = localState.students.length + (localState.archivedStudentCount || 0);
    if (elTeachers) elTeachers.textContent = localState.teachers.length;
    if (elSales) elSales.textContent = localState.sales.length;

    // Đếm HV mới hôm nay
    if (elNewToday) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayCount = localState.students.filter(s => {
            if (!s.createdAt) return false;
            const d = s.createdAt.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
            return d >= todayStart;
        }).length;
        elNewToday.textContent = todayCount;
    }

    // Đếm HV điểm danh hôm nay theo cơ sở (cache 60 giây + server-side filter)
    const elAttToday = document.getElementById('total-attendance-today');
    if (elAttToday && currentBranchId) {
        const now = Date.now();
        const cacheKey = `_attCache_${currentBranchId}`;
        const cached = window[cacheKey];
        if (cached && (now - cached.time) < 60000) {
            elAttToday.textContent = cached.count;
        } else {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            db.collection('attendance')
                .where('branchId', '==', currentBranchId)
                .where('createdAt', '>=', todayStart)
                .get().then(snap => {
                    const count = snap.size;
                    window[cacheKey] = { count, time: Date.now() };
                    elAttToday.textContent = count;
                }).catch(e => { console.error('Attendance query error:', e); elAttToday.textContent = '—'; });
        }
    }

    // Render Queue
    const qContainer = document.getElementById('teachers-queue');
    if (!qContainer) return;

    qContainer.innerHTML = '';
    if (localState.queue.length === 0) {
        qContainer.innerHTML = '<span class="text-muted">Hàng chờ trống...</span>';
        const sugId = document.getElementById('sale-suggested-teacher-id');
        const sugName = document.getElementById('sale-suggested-teacher');
        const btnConfirm = document.getElementById('btn-sale-confirm');
        if (sugId) sugId.value = '';
        if (sugName) sugName.innerHTML = '<span style="color:var(--danger)">Trống (Không thể phân bổ)</span>';
        if (btnConfirm) btnConfirm.disabled = true;
        return;
    }

    let suggestedDone = false;
    let visibleCount = 0;

    // FIFO: hiển thị queue theo thứ tự, index 0 = Top 1
    for (let i = 0; i < localState.queue.length; i++) {
        const teacherId = localState.queue[i];
        const teacher = localState.teachers.find(t => t.id === teacherId);
        if (!teacher) continue;
        if (teacher.queuePaused) continue;

        // Nợ theo teacherId
        const teacherDebt = localState.debtMap[teacherId] || 0;
        const hasDebt = teacherDebt > 0;

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

        const isCurrentTurn = (!suggestedDone && !hasDebt);
        node.className = `teacher-node ${isCurrentTurn ? 'current-turn' : ''}`;
        if (isTesting) node.style.border = '2px solid #f59e0b';
        if (hasDebt) node.style.opacity = '0.5';

        // Auto-propose Top 1 vào Form Sale
        const exToggle = document.getElementById('toggle-sale-exception');
        const isExMode = exToggle && exToggle.checked;
        if (isCurrentTurn && !suggestedDone) {
            suggestedDone = true;
            if (!isExMode) {
                const sugId = document.getElementById('sale-suggested-teacher-id');
                const sugName = document.getElementById('sale-suggested-teacher');
                const btnConfirm = document.getElementById('btn-sale-confirm');
                if (sugId) sugId.value = teacherId;
                if (sugName) sugName.innerHTML = `<span style="color:var(--primary)"><i class="fa-solid fa-person-swimming"></i> ${teacher.name}</span>`;
                if (btnConfirm) btnConfirm.disabled = false;
            }
        }

        node.innerHTML = `
            <div class="t-name">${teacher.name}</div>
            ${hasDebt ? `<div style="font-size:10px; color:#ef4444; font-weight:600; margin-top:2px;">Nợ ${teacherDebt} lượt ${(currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') ? `<button onclick="event.stopPropagation(); clearTeacherDebt('${teacherId}','${teacher.name.replace(/'/g, "\\\\'")}')" style="font-size:9px; padding:1px 5px; border-radius:3px; border:1px solid rgba(59,130,246,0.4); background:rgba(59,130,246,0.1); color:#3b82f6; cursor:pointer; margin-left:4px;" title="Xóa nợ"><i class="fa-solid fa-eraser"></i></button>` : ''}</div>` : ''}
            ${isTesting ? `<div style="font-size:10px; color:#f59e0b; font-weight:600; margin-top:2px;">🧪 Test (${remainingMin}p)</div>` : ''}
            ${(currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') ? `
            <button class="btn btn-sm btn-danger mt-10" onclick="cutQueueTurn()" style="margin-top:8px; width:100%; border-radius:4px; padding:4px;">
                <i class="fa-solid fa-scissors"></i> Cắt lượt
            </button>
            ${isTesting ? `<button class="btn btn-sm mt-10" onclick="finishTest('${teacherId}')" style="margin-top:4px; width:100%; border-radius:4px; padding:4px; background:rgba(16,185,129,0.15); color:#059669; border:1px solid rgba(16,185,129,0.3);"><i class="fa-solid fa-check"></i> Xong test</button>` : ''}
            ` : (currentUserRole !== 'TEACHER' && isTesting ? `<button class="btn btn-sm mt-10" onclick="finishTest('${teacherId}')" style="margin-top:4px; width:100%; border-radius:4px; padding:4px; background:rgba(16,185,129,0.15); color:#059669; border:1px solid rgba(16,185,129,0.3);"><i class="fa-solid fa-check"></i> Xong test</button>` : '')}
        `;
        qContainer.appendChild(node);
        visibleCount++;

        // Arrow giữa các node
        if (i < localState.queue.length - 1) {
            const nextHasVisible = localState.queue.slice(i + 1).some(id => {
                const t = localState.teachers.find(tt => tt.id === id);
                return t && !t.queuePaused;
            });
            if (nextHasVisible) {
                const arrow = document.createElement('i');
                arrow.className = 'fa-solid fa-arrow-right';
                qContainer.appendChild(arrow);
            }
        }
    }

    // Admin: nút "Đẩy lên Top 1"
    if ((currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') && qContainer.children.length > 0) {
        const lastNode = qContainer.querySelectorAll('.teacher-node');
        if (lastNode.length > 1) {
            const last = lastNode[lastNode.length - 1];
            const rewindBtn = document.createElement('button');
            rewindBtn.className = 'btn btn-sm';
            rewindBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i> Đẩy lên Top 1';
            rewindBtn.style.cssText = 'margin-top:6px; width:100%; border-radius:4px; padding:4px; background:rgba(16,185,129,0.15); color:#059669; border:1px solid rgba(16,185,129,0.3); font-size:11px; cursor:pointer;';
            rewindBtn.onclick = () => rewindQueueToLast();
            last.appendChild(rewindBtn);
        }
    }

    // Nếu chưa suggest được GV nào (tất cả đều nợ) → normalize
    if (!suggestedDone) {
        const activeTeachers = localState.queue.filter(id => {
            const t = localState.teachers.find(tt => tt.id === id);
            return t && !t.queuePaused;
        });
        const uniqueActive = [...new Set(activeTeachers)];
        if (uniqueActive.length > 0) {
            const debtVals = uniqueActive.map(tid => localState.debtMap[tid] || 0);
            const allInDebt = debtVals.every(v => v > 0);
            if (allInDebt) {
                const minD = Math.min(...debtVals);
                uniqueActive.forEach(tid => {
                    localState.debtMap[tid] = (localState.debtMap[tid] || 0) - minD;
                    if (localState.debtMap[tid] <= 0) delete localState.debtMap[tid];
                });
                if (currentBranchId) {
                    db.collection('queues').doc(currentBranchId).update({ debtMap: localState.debtMap })
                        .catch(e => console.error('Normalize debt error:', e));
                }
                renderDashboard();
                return;
            }
        }
        const sugId = document.getElementById('sale-suggested-teacher-id');
        const sugName = document.getElementById('sale-suggested-teacher');
        const btnConfirm = document.getElementById('btn-sale-confirm');
        if (sugId) sugId.value = '';
        if (sugName) sugName.innerHTML = '<span style="color:var(--danger)">Tất cả GV đang nợ lượt</span>';
        if (btnConfirm) btnConfirm.disabled = true;
    }

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

    // Render demographics analysis & Trend Chart
    renderDemographics();
    renderNewContractsChart();
    // renderLivePool() — ĐÃ TÁCH RA, chạy riêng bằng setInterval 120s trong app-core.js
};

// ===================== BIỂU ĐỒ TREND HỢP ĐỒNG ===================== //
let _newContractsChartInstance = null;
window.renderNewContractsChart = function () {
    const canvas = document.getElementById('newContractsChart');
    if (!canvas) return;

    const selectEl = document.getElementById('trend-days-select');
    const daysStr = selectEl?.value || '7';
    const customRangeEl = document.getElementById('trend-custom-range');
    const badgeEl = document.getElementById('trend-total-badge');
    const students = localState.students || [];

    // Show/hide custom date range
    if (customRangeEl) {
        customRangeEl.style.display = daysStr === 'custom' ? 'flex' : 'none';
    }

    // Set default custom dates if empty
    if (daysStr === 'custom') {
        const fromEl = document.getElementById('trend-date-from');
        const toEl = document.getElementById('trend-date-to');
        if (fromEl && !fromEl.value) {
            const d = new Date(); d.setDate(d.getDate() - 7);
            fromEl.value = d.toISOString().split('T')[0];
        }
        if (toEl && !toEl.value) {
            toEl.value = new Date().toISOString().split('T')[0];
        }
    }

    // Calculate date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate, endDate, numDays;

    if (daysStr === 'custom') {
        const fromVal = document.getElementById('trend-date-from')?.value;
        const toVal = document.getElementById('trend-date-to')?.value;
        if (!fromVal || !toVal) return;
        startDate = new Date(fromVal);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(toVal);
        endDate.setHours(23, 59, 59, 999);
        numDays = Math.max(1, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
    } else {
        numDays = parseInt(daysStr, 10);
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - (numDays - 1));
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
    }

    // Build date buckets
    const dateLabels = [];
    const counts = [];
    const dateKeys = [];

    for (let i = 0; i < numDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        const key = new Date(d); key.setHours(0, 0, 0, 0);
        dateLabels.push(dateStr);
        dateKeys.push(key.getTime());
        counts.push(0);
    }

    // Count students per day
    let totalInRange = 0;
    students.forEach(st => {
        const ts = st.createdAt?.toDate ? st.createdAt.toDate().getTime() : (st.createdAt || 0);
        if (!ts) return;
        const crDate = new Date(ts);
        crDate.setHours(0, 0, 0, 0);

        if (crDate.getTime() >= startDate.getTime() && crDate.getTime() <= endDate.getTime()) {
            const idx = dateKeys.indexOf(crDate.getTime());
            if (idx !== -1) {
                counts[idx]++;
            }
            totalInRange++;
        }
    });

    // Render total badge
    if (badgeEl) {
        const periodLabel = daysStr === 'custom'
            ? `${document.getElementById('trend-date-from')?.value || ''} → ${document.getElementById('trend-date-to')?.value || ''}`
            : `${numDays} ngày qua`;
        const avgPerDay = numDays > 0 ? (totalInRange / numDays).toFixed(1) : 0;

        badgeEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); border-radius: 10px;">
                <i class="fa-solid fa-file-contract" style="color: #10b981;"></i>
                <span style="font-size: 13px; font-weight: 700; color: #10b981;">${totalInRange}</span>
                <span style="font-size: 12px; color: var(--text-muted);">hợp đồng</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 10px;">
                <i class="fa-solid fa-calculator" style="color: #3b82f6;"></i>
                <span style="font-size: 13px; font-weight: 700; color: #3b82f6;">~${avgPerDay}</span>
                <span style="font-size: 12px; color: var(--text-muted);">HĐ/ngày</span>
            </div>
            <span style="font-size: 11px; color: var(--text-muted);">${periodLabel}</span>
        `;
    }

    if (_newContractsChartInstance) {
        _newContractsChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    _newContractsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dateLabels,
            datasets: [{
                label: 'Hợp đồng mới',
                data: counts,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: numDays > 20 ? 2 : 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 10,
                    titleFont: { size: 13, family: 'Inter' },
                    bodyFont: { size: 14, family: 'Inter', weight: 'bold' },
                    displayColors: false,
                    callbacks: {
                        label: function (context) {
                            return context.parsed.y + ' hợp đồng';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        precision: 0,
                        color: 'rgba(156, 163, 175, 0.8)',
                        font: { family: 'Inter', size: 11 }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        borderDash: [5, 5]
                    },
                    border: { display: false }
                },
                x: {
                    ticks: {
                        color: 'rgba(156, 163, 175, 0.8)',
                        font: { family: 'Inter', size: numDays > 20 ? 9 : 11 },
                        maxRotation: 45,
                        minRotation: 0,
                        autoSkip: numDays > 14,
                        maxTicksLimit: 15
                    },
                    grid: { display: false },
                    border: { display: false }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
        }
    });
}

// ===================== PHÂN TÍCH NHÂN KHẨU HỌC VIÊN ===================== //
function renderDemographics() {
    const container = document.getElementById('demographics-analysis');
    if (!container) return;

    const students = localState.allStudents || localState.students || [];
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
// ==================== TEACHER MODULE - ĐÃ TÁCH RA js/teacher.js ====================
// Code gốc backup tại: app.js.backup_20250415 (dòng 1821~2604)
// ==================================================================================


// ==================== LETAN MODULE - ĐÃ TÁCH RA js/letan.js ====================
// Code gốc backup tại: app.js.backup_20250415 (dòng 1826~2561)
// ================================================================================

// Thống kê cá nhân Sale
var saleFilterMode = saleFilterMode || 'all';

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

async function renderSaleClbList() {
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

    // Query điểm danh hôm nay
    let todayAttMap = {};
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const branchId = currentBranchId || currentUserBranchId;
        if (branchId) {
            const todaySnap = await db.collection('clb_attendance')
                .where('branchId', '==', branchId)
                .where('timestamp', '>=', today)
                .get();
            todaySnap.forEach(d => {
                const data = d.data();
                const aid = data.athleteId;
                if (!todayAttMap[aid]) todayAttMap[aid] = { count: 0, latest: 0 };
                todayAttMap[aid].count++;
                const ts = data.timestamp?.toDate?.()?.getTime() || 0;
                if (ts > todayAttMap[aid].latest) todayAttMap[aid].latest = ts;
            });
        }
    } catch (e) { console.warn('Today att query:', e); }

    // Build coachMap: key → [{ name }] để auto-resolve HLV (hỗ trợ Lớp-Ca)
    let coachMap = {};
    try {
        const branchId = currentBranchId || currentUserBranchId;
        const coachDocs = (localState.teachers || []).filter(u => u.isCoach && u.branchId === branchId);
        coachDocs.forEach(u => {
            (u.coachClasses || []).forEach(cl => {
                // cl có thể là 'B' hoặc 'B-Ca1'
                if (!coachMap[cl]) coachMap[cl] = [];
                coachMap[cl].push({ id: u.id, name: u.name || 'HLV' });
                // Cũng map theo classLevel để fallback
                if (cl.includes('-Ca')) {
                    const baseClass = cl.substring(0, cl.lastIndexOf('-Ca'));
                    if (!coachMap[baseClass]) coachMap[baseClass] = [];
                    coachMap[baseClass].push({ id: u.id, name: u.name || 'HLV' });
                }
            });
        });
    } catch (e) { console.warn('Coach map error:', e); }

    const now = new Date();
    let html = '';
    filtered.forEach(a => {
        // Auto-resolve HLV: match theo Lớp-Ca trước, rồi fallback Lớp
        let resolvedCoach = a.coachName || '';
        if (!resolvedCoach) {
            const cls = a.classLevel || a.athleteClass || '';
            const shift = a.clbShift || '';
            const shiftKey = shift ? `${cls}-Ca${shift}` : cls;
            let coaches = coachMap[shiftKey] || [];
            if (coaches.length === 0 && shift) coaches = coachMap[cls] || [];
            if (coaches.length === 1) {
                resolvedCoach = coaches[0].name;
            }
        }
        a._resolvedCoach = resolvedCoach;
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

        // Tính số ngày còn lại
        let remainDays = '';
        if (expDate && !isExpired && !isFrozen && activatedDate) {
            const diff = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
            remainDays = `(còn ${diff} ngày)`;
        }
        const totalAtt = a.totalAttendance || 0;
        const combo = a.comboType || '';
        const gender = a.gender || '';

        // Trạng thái điểm danh hôm nay
        let todayBadge = '';
        const cAtt = todayAttMap[a.id];
        if (cAtt) {
            const elapsed = now.getTime() - cAtt.latest;
            if (elapsed < 90 * 60 * 1000) {
                const rMin = Math.ceil((90 * 60 * 1000 - elapsed) / 60000);
                todayBadge = `<div style="font-size:12px; color:#3b82f6; font-weight:600; margin-top:4px;">🏊 Đang tập luyện (còn ${rMin}p)</div>`;
            } else {
                todayBadge = `<div style="font-size:12px; color:#10b981; font-weight:600; margin-top:4px;">✅ Đã điểm danh hôm nay (${cAtt.count} lần)</div>`;
            }
        } else {
            todayBadge = `<div style="font-size:12px; color:var(--text-muted); margin-top:4px;">⭕ Chưa điểm danh hôm nay</div>`;
        }

        html += `<div style="padding:12px 14px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:10px; border-left:3px solid ${statusColor};">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <div style="font-weight:600; font-size:14px; color:var(--text-color);">🏅 ${a.name || 'N/A'} ${gender ? `<span style="font-size:11px; color:var(--text-muted); font-weight:400;">(${gender})</span>` : ''}</div>
                <span style="font-size:11px; padding:2px 8px; border-radius:12px; background:${statusColor}15; color:${statusColor}; font-weight:600;">${statusLabel}</span>
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">
                ${a.phone ? `${a.phone} • ` : ''}${a.sessionsPerWeek || 3} buổi/tuần • ${a.contractMonths || 3}T
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:4px 12px; font-size:12px; color:var(--text-muted);">
                <span>🏋️ Đã tập: <strong style="color:var(--primary);">${totalAtt} buổi</strong></span>
                <span>📅 KH: <strong>${activatedStr}</strong></span>
                <span>🔴 HH: <strong>${expStr}</strong> <em style="color:#f59e0b;">${remainDays}</em></span>
            </div>
            ${combo ? `<div style="margin-top:4px; font-size:11px;"><span style="padding:2px 8px; border-radius:10px; background:rgba(16,185,129,0.1); color:#10b981; font-weight:600;">🟢 ${combo}</span></div>` : ''}
            ${a.contractNumber ? `<div style="margin-top:4px; font-size:11px; color:var(--text-muted);">📋 HĐ: ${a.contractNumber}</div>` : ''}
            <div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:6px; font-size:11px;">
                <span style="padding:2px 8px; border-radius:10px; background:rgba(245,158,11,0.1); color:#d97706; font-weight:600;">📚 Lớp: ${a.classLevel || a.athleteClass || 'N/A'}${a.clbShift ? ' (Ca ' + a.clbShift + ')' : ''}</span>
                <span style="padding:2px 8px; border-radius:10px; background:rgba(139,92,246,0.1); color:${a._resolvedCoach ? '#8b5cf6' : '#ef4444'}; font-weight:600;">👨‍🏫 HLV: ${a._resolvedCoach || 'Chưa phân'}</span>
            </div>
            <div style="margin-top:6px; padding:6px 10px; background:${a.athleteNote ? 'rgba(59,130,246,0.06)' : 'rgba(239,68,68,0.04)'}; border-radius:6px; border:1px solid ${a.athleteNote ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)'}; font-size:12px; cursor:pointer;" onclick="editClbPoolPlan('${a.id}', '${(a.name || '').replace(/'/g, "\\'")}')">
                🏊 <strong>PA vào bể:</strong> ${a.athleteNote ? `<span style="color:#3b82f6;">${a.athleteNote}</span>` : '<span style="color:#ef4444; font-style:italic;">⚠️ Chưa nhập — bấm để thêm</span>'}
            </div>
            <div style="margin-top:6px; display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap;">
                <button onclick="showClbAttHistory('${a.id}', this)" class="btn btn-sm" style="background:rgba(139,92,246,0.1); color:#8b5cf6; font-size:11px; padding:4px 10px; border:1px solid rgba(139,92,246,0.25);">
                    <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử ĐD
                </button>
                <button onclick="editClbPoolPlan('${a.id}', '${(a.name || '').replace(/'/g, "\\'")}')" class="btn btn-sm" style="background:rgba(59,130,246,0.1); color:#3b82f6; font-size:11px; padding:4px 10px; border:1px solid rgba(59,130,246,0.25);">
                    <i class="fa-solid fa-water"></i> PA vào bể
                </button>
                ${isExpired ? `<button class="btn btn-sm" onclick="renewClbContract('${a.id}', '${(a.name || '').replace(/'/g, "\\\\'")}')" style="background:rgba(16,185,129,0.12); color:#059669; font-size:11px; padding:4px 10px; border:1px solid rgba(16,185,129,0.3); font-weight:600;">
                    <i class="fa-solid fa-arrow-rotate-right"></i> Gia hạn
                </button>` : ''}
            </div>
            <div id="clb-att-history-${a.id}" style="display:none; margin-top:6px;"></div>
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

// ===== SỬA PHƯƠNG ÁN VÀO BỂ (CLB) =====
window.editClbPoolPlan = async function (athleteId, athleteName) {
    try {
        const doc = await db.collection('athletes').doc(athleteId).get();
        if (!doc.exists) return alert('Không tìm thấy VĐV!');
        const data = doc.data();
        const current = data.athleteNote || '';
        const newPlan = prompt(
            `🏊 PHƯƠNG ÁN VÀO BỂ\nVĐV: ${athleteName}\n\nNhập phương án (VD: T2-T4-T6 17h30, Bể A...):\n\n(Bỏ trống để xóa)`,
            current
        );
        if (newPlan === null) return;
        await db.collection('athletes').doc(athleteId).update({
            athleteNote: newPlan.trim()
        });
        alert(`✅ Đã cập nhật PA vào bể cho "${athleteName}"${newPlan.trim() ? '\n🏊 ' + newPlan.trim() : '\n(Đã xóa)'}`);
    } catch (e) {
        alert('❌ Lỗi: ' + e.message);
    }
};

// ===================== GIA HẠN HỢP ĐỒNG CLB ===================== //
window.renewClbContract = async function (athleteId, athleteName) {
    const athlete = _saleClbData.find(a => a.id === athleteId);
    if (!athlete) return alert('Không tìm thấy VĐV!');

    const oldContract = athlete.contractNumber || 'Chưa có';
    const oldSessions = athlete.sessionsPerWeek || 3;
    const oldMonths = athlete.contractMonths || 3;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

    const todayStr = new Date().toISOString().split('T')[0];
    const iS = 'width:100%; padding:8px 12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color); font-size:13px; margin-bottom:10px;';

    overlay.innerHTML = `
        <div style="background:var(--card-bg); border-radius:16px; padding:24px; width:100%; max-width:380px; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 4px; font-size:16px; color:var(--text-color);"><i class="fa-solid fa-rotate-right" style="color:#10b981;"></i> Gia Hạn HĐ CLB</h3>
            <p style="margin:0 0 14px; font-size:13px; color:var(--text-muted);">VĐV: <strong>${athleteName}</strong></p>
            
            <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">📋 Số hợp đồng mới:</label>
            <input type="text" id="sale-renew-contract" value="" placeholder="Nhập số HĐ mới" style="${iS}">
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div>
                    <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">📦 Số buổi/tuần:</label>
                    <select id="sale-renew-sessions" style="${iS}">
                        <option value="2" ${oldSessions == 2 ? 'selected' : ''}>2 buổi/tuần</option>
                        <option value="3" ${oldSessions == 3 ? 'selected' : ''}>3 buổi/tuần</option>
                        <option value="4" ${oldSessions == 4 ? 'selected' : ''}>4 buổi/tuần</option>
                        <option value="5" ${oldSessions == 5 ? 'selected' : ''}>5 buổi/tuần</option>
                    </select>
                </div>
                <div>
                    <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">📅 Số tháng:</label>
                    <select id="sale-renew-months" style="${iS}">
                        <option value="1" ${oldMonths == 1 ? 'selected' : ''}>1 tháng</option>
                        <option value="3" ${oldMonths == 3 ? 'selected' : ''}>3 tháng</option>
                        <option value="6" ${oldMonths == 6 ? 'selected' : ''}>6 tháng</option>
                        <option value="12" ${oldMonths == 12 ? 'selected' : ''}>12 tháng</option>
                    </select>
                </div>
            </div>

            <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">📅 Ngày kích hoạt:</label>
            <input type="date" id="sale-renew-activate" value="${todayStr}" style="${iS}">
            
            <div style="background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.15); border-radius:8px; padding:8px 10px; margin-bottom:14px; font-size:11px; color:var(--text-muted);">
                <i class="fa-solid fa-circle-info" style="color:#f59e0b;"></i> HĐ cũ: <strong>${oldContract}</strong> · ${oldSessions}b/tuần × ${oldMonths} tháng<br>
                <i class="fa-solid fa-shield-halved" style="color:#10b981;"></i> Lịch sử điểm danh cũ được <strong>giữ nguyên</strong>
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button id="sale-renew-cancel" style="padding:8px 20px; border-radius:8px; border:1px solid var(--border-color); background:transparent; color:var(--text-muted); font-size:13px; cursor:pointer;">Huỷ</button>
                <button id="sale-renew-confirm" style="padding:8px 20px; border-radius:8px; border:none; background:#10b981; color:#fff; font-size:13px; font-weight:600; cursor:pointer;">
                    <i class="fa-solid fa-check"></i> Gia hạn
                </button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('#sale-renew-cancel').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#sale-renew-confirm').onclick = async () => {
        const newContract = (document.getElementById('sale-renew-contract')?.value || '').trim();
        const newSessions = parseInt(document.getElementById('sale-renew-sessions')?.value) || 3;
        const newMonths = parseInt(document.getElementById('sale-renew-months')?.value) || 3;
        const activateVal = document.getElementById('sale-renew-activate')?.value;

        if (!newContract) return alert('Vui lòng nhập số hợp đồng!');
        if (!activateVal) return alert('Vui lòng chọn ngày kích hoạt!');

        const newActivatedAt = new Date(activateVal);
        // Tự tính HSD = ngày kích hoạt + số tháng
        const newExpiresAt = new Date(newActivatedAt);
        newExpiresAt.setMonth(newExpiresAt.getMonth() + newMonths);
        newExpiresAt.setDate(newExpiresAt.getDate() - 1); // HSD = kích hoạt + N tháng - 1 ngày
        newExpiresAt.setHours(23, 59, 59, 999);

        try {
            const brId = currentBranchId || currentUserBranchId;
            const renewData = {
                contractNumber: newContract,
                sessionsPerWeek: newSessions,
                contractMonths: newMonths,
                activatedAt: firebase.firestore.Timestamp.fromDate(newActivatedAt),
                expiresAt: firebase.firestore.Timestamp.fromDate(newExpiresAt),
                expiryDate: firebase.firestore.Timestamp.fromDate(newExpiresAt),
                isExpired: false,
                isFrozen: false,
                status: 'active',
                renewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                previousContractNumber: oldContract,
                renewCount: firebase.firestore.FieldValue.increment(1),
                bonusDays: 0
            };
            const results = await Promise.allSettled([
                db.collection('athletes').doc(athleteId).update(renewData),
                db.collection('clb_athletes').doc(athleteId).update(renewData)
            ]);
            if (!results.some(r => r.status === 'fulfilled')) throw new Error('Không tìm thấy VĐV!');

            // Sync lên Google Sheet
            const branchObj = FIXED_BRANCHES.find(b => b.id === brId);
            syncClbRowToSheet({
                action: 'renewClbRow',
                branchName: 'CLB_' + (branchObj?.name || 'N/A'),
                name: athleteName,
                oldContract: oldContract,
                newContract: newContract,
                activatedAt: newActivatedAt.toLocaleDateString('vi-VN'),
                expiresAt: newExpiresAt.toLocaleDateString('vi-VN'),
                pkg: `${newSessions}b/tuần × ${newMonths} tháng`
            });

            overlay.remove();
            alert(`✅ Gia hạn thành công!\n\n"${athleteName}"\n📋 HĐ: ${newContract}\n📦 ${newSessions}b/tuần × ${newMonths} tháng\n📅 KH: ${newActivatedAt.toLocaleDateString('vi-VN')}\n📅 HSD: ${newExpiresAt.toLocaleDateString('vi-VN')}`);
            loadSaleClbData();
        } catch (e) {
            console.error('Renew CLB contract error:', e);
            alert('❌ Lỗi gia hạn: ' + e.message);
        }
    };
};

// ===================== CLB ADMIN + CORE ===================== //

// ============ BẢNG VĐV CLB KID TL TRONG ADMIN ============ //
let _adminClbData = [];
window.loadAdminClbStudents = async function () {
    const tbody = document.getElementById('admin-clb-students-tbody');
    const countEl = document.getElementById('admin-clb-count');
    const branchFilter = document.getElementById('admin-clb-branch-filter');
    if (!tbody) return;

    // Populate branch dropdown
    if (branchFilter && branchFilter.options.length <= 1) {
        FIXED_BRANCHES.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id; opt.textContent = b.name;
            branchFilter.appendChild(opt);
        });
    }
    // MANAGER: chỉ xem cơ sở của mình
    if (branchFilter && currentUserRole === 'MANAGER' && currentBranchId) {
        branchFilter.value = currentBranchId;
        branchFilter.disabled = true;
        branchFilter.style.opacity = '0.7';
    }

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>';

    try {
        let branchVal = branchFilter?.value || '';
        // MANAGER: bắt buộc chỉ load cơ sở mình
        if (currentUserRole === 'MANAGER' && currentBranchId) branchVal = currentBranchId;
        let query = db.collection('athletes');
        if (branchVal) query = query.where('branchId', '==', branchVal);
        const snap = await query.get();
        _adminClbData = [];
        snap.forEach(doc => { _adminClbData.push({ id: doc.id, ...doc.data() }); });
        renderAdminClbTable();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#ef4444;">Lỗi: ${e.message}</td></tr>`;
    }
};

function renderAdminClbTable() {
    const tbody = document.getElementById('admin-clb-students-tbody');
    const countEl = document.getElementById('admin-clb-count');
    if (!tbody) return;

    const searchVal = (document.getElementById('admin-clb-search')?.value || '').toLowerCase().trim();
    let filtered = _adminClbData;
    if (searchVal) {
        filtered = filtered.filter(a =>
            (a.name || '').toLowerCase().includes(searchVal) ||
            (a.phone || '').includes(searchVal) ||
            (a.contractNumber || '').toLowerCase().includes(searchVal)
        );
    }

    if (countEl) countEl.textContent = `${filtered.length} VĐV`;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">Không tìm thấy VĐV nào.</td></tr>';
        return;
    }

    const now = new Date();
    let html = '';
    filtered.forEach(a => {
        const branchName = FIXED_BRANCHES.find(b => b.id === a.branchId)?.name || 'N/A';
        const expDate = a.expiresAt?.toDate ? a.expiresAt.toDate() : null;
        const isFrozen = a.isFrozen;
        const isExpired = a.isExpired || (expDate && expDate <= now && !isFrozen);
        const notActive = !a.activatedAt && !isFrozen && !isExpired;

        let statusLabel, statusColor;
        if (isFrozen) { statusLabel = '❄️ Bảo lưu'; statusColor = '#6366f1'; }
        else if (isExpired) { statusLabel = '⛔ Hết hạn'; statusColor = '#ef4444'; }
        else if (notActive) { statusLabel = '⏳ Chưa KH'; statusColor = '#6b7280'; }
        else { statusLabel = '✅ Hoạt động'; statusColor = '#10b981'; }

        const expStr = expDate ? expDate.toLocaleDateString('vi-VN') : 'N/A';
        const activatedDate = a.activatedAt?.toDate ? a.activatedAt.toDate() : null;
        const activatedStr = activatedDate ? activatedDate.toLocaleDateString('vi-VN') : 'Chưa KH';
        const pkg = `${a.sessionsPerWeek || 3}b/tuần × ${a.contractMonths || 3}th`;

        html += `<tr style="border-bottom:1px solid var(--border-color);">
            <td style="padding:12px 15px;">
                <div style="font-weight:600; color:var(--text-color);">🏅 ${a.name || 'N/A'}</div>
                <div style="font-size:12px; color:var(--text-muted);">${a.phone || ''}</div>
            </td>
            <td style="padding:12px 15px; color:var(--text-muted); font-size:13px;">${branchName}</td>
            <td style="padding:12px 15px; color:var(--text-muted); font-size:13px;">${a.contractNumber || 'N/A'}</td>
            <td style="padding:12px 15px; font-size:13px;">
                <span style="background:rgba(59,130,246,0.1); color:#3b82f6; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:600;">Lớp ${a.athleteClass || a.classLevel || 'N/A'}${a.clbShift ? ' (Ca ' + a.clbShift + ')' : ''}</span>
            </td>
            <td style="padding:12px 15px; color:var(--text-muted); font-size:13px;">${pkg}</td>
            <td style="padding:12px 15px; color:var(--text-muted); font-size:13px;">${activatedStr}</td>
            <td style="padding:12px 15px; color:var(--text-muted); font-size:13px;">${expStr}</td>
            <td style="padding:12px 15px;">
                <span style="font-size:12px; padding:3px 10px; border-radius:12px; background:${statusColor}15; color:${statusColor}; font-weight:600;">${statusLabel}</span>
                ${isExpired ? `<button onclick="renewClbAthlete('${a.id}', '${(a.name || '').replace(/'/g, "\\\\'")}')" 
                    style="margin-left:6px; padding:3px 10px; border-radius:8px; border:1px solid rgba(16,185,129,0.3); background:rgba(16,185,129,0.1); color:#10b981; font-size:11px; font-weight:600; cursor:pointer;">
                    <i class="fa-solid fa-rotate-right"></i> Gia hạn
                </button>` : ''}
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

window.filterAdminClbStudents = function () {
    const branchVal = document.getElementById('admin-clb-branch-filter')?.value || '';
    if (window._lastAdminClbBranch !== undefined && window._lastAdminClbBranch !== branchVal) {
        loadAdminClbStudents();
    } else {
        renderAdminClbTable();
    }
    window._lastAdminClbBranch = branchVal;
};

// ============ GIA HẠN VĐV CLB ============ //
window.renewClbAthlete = async function (athleteId, athleteName) {
    if (currentUserRole !== 'ADMIN' && currentUserRole !== 'MANAGER') return alert('⚠️ Chỉ Admin/Quản lý được gia hạn!');

    // Lấy thông tin VĐV hiện tại
    const athlete = _adminClbData.find(a => a.id === athleteId) || {};
    const oldContract = athlete.contractNumber || '';
    const oldSessions = athlete.sessionsPerWeek || 3;
    const oldMonths = athlete.contractMonths || 3;

    // Tạo modal
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

    // Default: số tháng cũ tính từ hôm nay
    const defaultDate = new Date();
    defaultDate.setMonth(defaultDate.getMonth() + oldMonths);
    defaultDate.setDate(defaultDate.getDate() - 1); // HSD = kích hoạt + N tháng - 1 ngày
    const defaultStr = defaultDate.toISOString().split('T')[0];
    const inputStyle = 'width:100%; padding:8px 12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color); font-size:13px; margin-bottom:10px;';

    overlay.innerHTML = `
        <div style="background:var(--card-bg); border-radius:16px; padding:24px; width:100%; max-width:380px; box-shadow:0 20px 60px rgba(0,0,0,0.3); max-height:90vh; overflow-y:auto;">
            <h3 style="margin:0 0 4px; font-size:16px; color:var(--text-color);"><i class="fa-solid fa-rotate-right" style="color:#10b981;"></i> Gia Hạn HĐ CLB</h3>
            <p style="margin:0 0 14px; font-size:13px; color:var(--text-muted);">VĐV: <strong>${athleteName}</strong></p>
            
            <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">📋 Số hợp đồng mới:</label>
            <input type="text" id="renew-contract-input" value="${oldContract}" placeholder="Nhập số HĐ mới" style="${inputStyle}">
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div>
                    <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">📦 Số buổi/tuần:</label>
                    <select id="renew-sessions-input" style="${inputStyle}">
                        <option value="2" ${oldSessions == 2 ? 'selected' : ''}>2 buổi/tuần</option>
                        <option value="3" ${oldSessions == 3 ? 'selected' : ''}>3 buổi/tuần</option>
                        <option value="4" ${oldSessions == 4 ? 'selected' : ''}>4 buổi/tuần</option>
                        <option value="5" ${oldSessions == 5 ? 'selected' : ''}>5 buổi/tuần</option>
                    </select>
                </div>
                <div>
                    <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">📅 Số tháng:</label>
                    <select id="renew-months-input" style="${inputStyle}">
                        <option value="1" ${oldMonths == 1 ? 'selected' : ''}>1 tháng</option>
                        <option value="3" ${oldMonths == 3 ? 'selected' : ''}>3 tháng</option>
                        <option value="6" ${oldMonths == 6 ? 'selected' : ''}>6 tháng</option>
                        <option value="12" ${oldMonths == 12 ? 'selected' : ''}>12 tháng</option>
                    </select>
                </div>
            </div>

            <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">📅 Gia hạn đến ngày:</label>
            <input type="date" id="renew-date-input" value="${defaultStr}" style="${inputStyle}">
            <div style="display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap;">
                <button onclick="document.getElementById('renew-date-input').valueAsDate = (() => { const d = new Date(); d.setMonth(d.getMonth()+1); return d; })()" 
                    style="padding:4px 10px; border-radius:6px; border:1px solid var(--border-color); background:transparent; color:var(--text-muted); font-size:11px; cursor:pointer;">+1 tháng</button>
                <button onclick="document.getElementById('renew-date-input').valueAsDate = (() => { const d = new Date(); d.setMonth(d.getMonth()+3); return d; })()" 
                    style="padding:4px 10px; border-radius:6px; border:1px solid var(--border-color); background:transparent; color:var(--text-muted); font-size:11px; cursor:pointer;">+3 tháng</button>
                <button onclick="document.getElementById('renew-date-input').valueAsDate = (() => { const d = new Date(); d.setMonth(d.getMonth()+6); return d; })()" 
                    style="padding:4px 10px; border-radius:6px; border:1px solid var(--border-color); background:transparent; color:var(--text-muted); font-size:11px; cursor:pointer;">+6 tháng</button>
                <button onclick="document.getElementById('renew-date-input').valueAsDate = (() => { const d = new Date(); d.setFullYear(d.getFullYear()+1); return d; })()" 
                    style="padding:4px 10px; border-radius:6px; border:1px solid var(--border-color); background:transparent; color:var(--text-muted); font-size:11px; cursor:pointer;">+1 năm</button>
            </div>
            
            <div style="background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.15); border-radius:8px; padding:8px 10px; margin-bottom:14px; font-size:11px; color:var(--text-muted);">
                <i class="fa-solid fa-circle-info" style="color:#f59e0b;"></i> HĐ cũ: <strong>${oldContract}</strong> · ${oldSessions}b/tuần × ${oldMonths} tháng
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button id="renew-cancel-btn" style="padding:8px 20px; border-radius:8px; border:1px solid var(--border-color); background:transparent; color:var(--text-muted); font-size:13px; cursor:pointer;">Huỷ</button>
                <button id="renew-confirm-btn" style="padding:8px 20px; border-radius:8px; border:none; background:#10b981; color:#fff; font-size:13px; font-weight:600; cursor:pointer;">
                    <i class="fa-solid fa-check"></i> Gia hạn
                </button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#renew-cancel-btn').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#renew-confirm-btn').onclick = async () => {
        const dateVal = document.getElementById('renew-date-input')?.value;
        const newContract = (document.getElementById('renew-contract-input')?.value || '').trim();
        const newSessions = parseInt(document.getElementById('renew-sessions-input')?.value) || 3;
        const newMonths = parseInt(document.getElementById('renew-months-input')?.value) || 3;

        if (!dateVal) return alert('Vui lòng chọn ngày!');
        if (!newContract) return alert('Vui lòng nhập số hợp đồng!');

        const newExpiry = new Date(dateVal);
        newExpiry.setHours(23, 59, 59, 999);

        if (newExpiry <= new Date()) return alert('Ngày gia hạn phải sau hôm nay!');

        try {
            const renewData = {
                contractNumber: newContract,
                sessionsPerWeek: newSessions,
                contractMonths: newMonths,
                expiryDate: firebase.firestore.Timestamp.fromDate(newExpiry),
                expiresAt: firebase.firestore.Timestamp.fromDate(newExpiry),
                activatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active',
                isFrozen: false,
                isExpired: false,
                renewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                renewedBy: currentUserId,
                previousContractNumber: oldContract,
                renewCount: firebase.firestore.FieldValue.increment(1),
                bonusDays: 0
            };
            // Update cả 2 collection
            const results = await Promise.allSettled([
                db.collection('athletes').doc(athleteId).update(renewData),
                db.collection('clb_athletes').doc(athleteId).update(renewData)
            ]);
            const anyOk = results.some(r => r.status === 'fulfilled');
            if (!anyOk) throw new Error('Không tìm thấy VĐV trong hệ thống!');

            // Sync lên Google Sheet
            const brId = athlete.branchId || currentBranchId;
            const branchObj = FIXED_BRANCHES.find(b => b.id === brId);
            syncClbRowToSheet({
                action: 'renewClbRow',
                branchName: 'CLB_' + (branchObj?.name || 'N/A'),
                name: athleteName,
                oldContract: oldContract,
                newContract: newContract,
                activatedAt: new Date().toLocaleDateString('vi-VN'),
                expiresAt: newExpiry.toLocaleDateString('vi-VN'),
                pkg: `${newSessions}b/tuần × ${newMonths} tháng`
            });

            overlay.remove();
            alert(`✅ Đã gia hạn VĐV "${athleteName}"!\n\n📋 HĐ: ${newContract}\n📦 ${newSessions}b/tuần × ${newMonths} tháng\n📅 HSD: ${newExpiry.toLocaleDateString('vi-VN')}`);
            loadAdminClbStudents();
        } catch (e) {
            console.error('Renew error:', e);
            alert('❌ Lỗi gia hạn: ' + e.message);
        }
    };
};

// ============ ĐỔI SALE QUẢN LÝ HỢP ĐỒNG ============ //
// Đổi Sale cho HĐ học viên thường
window.changeSaleForStudent = async function (studentId) {
    if (currentUserRole !== 'ADMIN' && currentUserRole !== 'MANAGER') return alert('⚠️ Chỉ Admin/Quản lý được đổi Sale!');
    try {
        const stuDoc = await db.collection('students').doc(studentId).get();
        if (!stuDoc.exists) return alert('Không tìm thấy học viên!');
        const stu = stuDoc.data();

        // Load danh sách Sale + Admin
        const usersSnap = await db.collection('users').get();
        const sales = usersSnap.docs.filter(d => {
            const u = d.data();
            return (u.role === 'SALE' || u.role === 'ADMIN') && (!u.branchId || u.branchId === currentBranchId);
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
    if (currentUserRole !== 'ADMIN' && currentUserRole !== 'MANAGER') return alert('⚠️ Chỉ Admin/Quản lý được đổi Sale!');
    try {
        const athDoc = await db.collection('athletes').doc(athleteId).get();
        if (!athDoc.exists) return alert('Không tìm thấy VĐV!');
        const ath = athDoc.data();

        const usersSnap = await db.collection('users').get();
        const sales = usersSnap.docs.filter(d => {
            const u = d.data();
            return (u.role === 'SALE' || u.role === 'ADMIN') && (!u.branchId || u.branchId === currentBranchId);
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

// Chuyển hàng loạt VĐV CLB từ Admin về 1 Sale
window.bulkTransferClbToSale = async function () {
    if (currentUserRole !== 'ADMIN') return alert('⚠️ Chỉ Admin!');
    try {
        // Load tất cả users
        const usersSnap = await db.collection('users').get();
        const usersMap = {};
        usersSnap.docs.forEach(d => { usersMap[d.id] = d.data(); });

        // Tìm VĐV CLB có creatorId = Admin
        const branchId = currentBranchId || currentUserBranchId;
        const athSnap = await db.collection('athletes').where('branchId', '==', branchId).get();
        const adminAthletes = athSnap.docs.filter(d => {
            const cid = d.data().creatorId;
            return cid && usersMap[cid] && usersMap[cid].role === 'ADMIN';
        });

        if (adminAthletes.length === 0) {
            return alert('✅ Không còn VĐV nào thuộc Admin! Tất cả đã về đúng Sale.');
        }

        // Danh sách Sale
        const sales = usersSnap.docs.filter(d => {
            const u = usersMap[d.id];
            return u.role === 'SALE' && (!u.branchId || u.branchId === currentBranchId);
        }).map(d => ({ id: d.id, name: usersMap[d.id].name }));

        if (sales.length === 0) return alert('Không có Sale nào!');

        const list = sales.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
        const pick = prompt(`📋 Có ${adminAthletes.length} VĐV CLB đang thuộc Admin.\n\nChọn Sale để chuyển TẤT CẢ (nhập số):\n${list}\n\n⚠️ Nhập 0 để huỷ`);
        if (!pick || pick === '0') return;
        const idx = parseInt(pick) - 1;
        if (idx < 0 || idx >= sales.length) return alert('Số không hợp lệ!');
        const targetSale = sales[idx];

        if (!confirm(`⚠️ Chuyển ${adminAthletes.length} VĐV CLB → Sale "${targetSale.name}"?\n\nThao tác không thể hoàn tác!`)) return;

        // Batch update
        for (let i = 0; i < adminAthletes.length; i += 500) {
            const batch = db.batch();
            adminAthletes.slice(i, i + 500).forEach(doc => {
                batch.update(db.collection('athletes').doc(doc.id), {
                    creatorId: targetSale.id,
                    creatorName: targetSale.name
                });
            });
            await batch.commit();
        }

        alert(`✅ Đã chuyển ${adminAthletes.length} VĐV CLB → Sale "${targetSale.name}"!`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// ===================== MIGRATION: Fix VĐV CLB creatorId ===================== //
// Auto-fix: so khớp creatorName → userId, chạy tự động
window.migrateClbCreatorIds = async function () {
    if (currentUserRole !== 'ADMIN') return;

    try {
        // Dùng cache thay vì query lại Firestore (tiết kiệm reads!)
        const athleteDocs = clbAthletesCache || [];
        if (athleteDocs.length === 0) return;
        // Dùng localState thay vì db.collection('users').get() (tiết kiệm ~100 reads)
        const allUsers = [...(localState.teachers || []), ...(localState.sales || []), ...(localState.firedUsers || [])];

        // Tạo map tên → userId (ưu tiên SALE)
        const nameToId = {};
        allUsers.forEach(u => {
            const name = (u.name || '').trim().toLowerCase();
            if (name) {
                // Nếu đã có Admin, ưu tiên ghi đè bằng Sale
                if (!nameToId[name] || u.role === 'SALE') {
                    nameToId[name] = { id: u.id, name: u.name, role: u.role };
                }
            }
        });

        let fixed = 0, skipped = 0, noMatch = 0;
        const batch_size = 500;
        let updates = [];

        athleteDocs.forEach(a => {
            const creatorName = (a.creatorName || '').trim().toLowerCase();
            if (!creatorName) { skipped++; return; }

            const match = nameToId[creatorName];
            if (!match) { noMatch++; return; }

            // Chỉ update nếu creatorId hiện tại KHÁC với userId đúng
            if (a.creatorId !== match.id) {
                updates.push({ docId: a.id, newCreatorId: match.id, athleteName: a.name, saleName: match.name });
                fixed++;
            } else {
                skipped++;
            }
        });

        if (updates.length === 0) {
            console.log('✅ Auto-fix CLB: Tất cả VĐV đã có creatorId đúng.');
            return;
        }

        for (let i = 0; i < updates.length; i += batch_size) {
            const batch = db.batch();
            const chunk = updates.slice(i, i + batch_size);
            chunk.forEach(u => {
                batch.update(db.collection('athletes').doc(u.docId), { creatorId: u.newCreatorId });
            });
            await batch.commit();
        }

        console.warn(`✅ Auto-fix CLB: Đã sửa ${fixed} VĐV! Skipped: ${skipped}, No match: ${noMatch}`);
        console.log('Migration details:', updates);
    } catch (e) {
        alert('Lỗi migration: ' + e.message);
    }
};

// ===================== CLB TL KID ===================== //
const CLB_LEVELS = ['Mầm', 'D1', 'D2', 'C', 'B', 'A'];
let clbAthletesCache = [];
let clbAthleteUnsub = null;

// Populate dropdown lớp CLB — hỗ trợ format Lớp-Ca (VD: B-Ca1)
window.populateClbClassDropdowns = async function () {
    const brId = currentBranchId || currentUserBranchId;
    if (!brId) return;

    // Lấy danh sách HLV của cơ sở
    let coachEntries = []; // [{ classLevel, shift, coachId, coachName }]
    try {
        const coachDocs = (localState.teachers || []).filter(u => u.isCoach && u.branchId === brId);
        coachDocs.forEach(u => {
            (u.coachClasses || []).forEach(cl => {
                let classLevel = cl, shift = '';
                if (cl.includes('-Ca')) {
                    const idx = cl.lastIndexOf('-Ca');
                    classLevel = cl.substring(0, idx);
                    shift = cl.substring(idx + 1); // 'Ca1', 'Ca2'...
                }
                coachEntries.push({ classLevel, shift, coachId: u.id, coachName: u.name || 'HLV', raw: cl });
            });
        });
    } catch (e) { console.warn('populateClbClassDropdowns error:', e); }

    // Group by classLevel+shift → [coaches]
    let groupMap = {}; // key='B-Ca1' or 'B' → [{ coachId, coachName }]
    coachEntries.forEach(e => {
        const key = e.shift ? `${e.classLevel}-${e.shift}` : e.classLevel;
        if (!groupMap[key]) groupMap[key] = { classLevel: e.classLevel, shift: e.shift, coaches: [] };
        groupMap[key].coaches.push({ id: e.coachId, name: e.coachName });
    });

    // Build options
    const CLB_LEVELS_ALL = ['Mầm', 'D1', 'D2', 'C', 'B', 'A'];
    const ALL_SHIFTS = ['', 'Ca1', 'Ca2', 'Ca3', 'Ca4', 'Ca5'];
    let optionsHtml = '';

    CLB_LEVELS_ALL.forEach(l => {
        // Collect all shift variants for this level
        let levelEntries = Object.entries(groupMap).filter(([k, v]) => v.classLevel === l);

        if (levelEntries.length === 0) {
            // No coach assigned — show plain level
            optionsHtml += `<option value="${l}">Lớp ${l}</option>`;
        } else {
            levelEntries.sort((a, b) => (a[1].shift || '').localeCompare(b[1].shift || ''));
            levelEntries.forEach(([key, info]) => {
                const shiftLabel = info.shift ? ' ' + info.shift : '';
                const coaches = info.coaches;
                if (coaches.length > 1) {
                    coaches.forEach(c => {
                        optionsHtml += `<option value="${l}${info.shift ? '-' + info.shift : ''}::${c.id}::${c.name}">Lớp ${l}${shiftLabel} (${c.name})</option>`;
                    });
                } else if (coaches.length === 1) {
                    optionsHtml += `<option value="${l}${info.shift ? '-' + info.shift : ''}::${coaches[0].id}::${coaches[0].name}">Lớp ${l}${shiftLabel} (${coaches[0].name})</option>`;
                }
            });
            // Check if level without shift exists separately
            if (!groupMap[l]) {
                optionsHtml += `<option value="${l}">Lớp ${l} (Chưa phân ca)</option>`;
            }
        }
    });

    // Apply cho cả 2 dropdown
    document.querySelectorAll('.clb-class-dynamic').forEach(sel => {
        const prevVal = sel.value;
        sel.innerHTML = optionsHtml;
        if (prevVal && sel.querySelector(`option[value="${prevVal}"]`)) sel.value = prevVal;
    });
};

// Helper: parse class dropdown value → { classLevel, clbShift, coachId, coachName }
function parseClbClassValue(val) {
    if (!val) return { classLevel: 'Mầm', clbShift: '', coachId: '', coachName: '' };
    let mainPart = val, coachId = '', coachName = '';
    if (val.includes('::')) {
        const parts = val.split('::');
        mainPart = parts[0];
        coachId = parts[1] || '';
        coachName = parts[2] || '';
    }
    let classLevel = mainPart, clbShift = '';
    if (mainPart.includes('-Ca')) {
        const idx = mainPart.lastIndexOf('-Ca');
        classLevel = mainPart.substring(0, idx);
        const shiftPart = mainPart.substring(idx + 1); // 'Ca1'
        clbShift = shiftPart.replace('Ca', ''); // '1'
    }
    return { classLevel, clbShift, coachId, coachName };
}

// Thêm VĐV mới
window.addAthlete = async function () {
    const name = document.getElementById('clb-name')?.value.trim();
    const phone = document.getElementById('clb-phone')?.value.trim();
    const gender = document.getElementById('clb-gender')?.value;
    const contractNumber = document.getElementById('clb-contract')?.value.trim();
    const classRaw = document.getElementById('clb-class')?.value;
    const { classLevel, clbShift: parsedShift, coachId, coachName } = parseClbClassValue(classRaw);
    const manualShift = document.getElementById('clb-shift')?.value || '';
    const clbShift = parsedShift || manualShift;
    const sessionsPerWeek = parseInt(document.getElementById('clb-sessions-week')?.value) || 3;
    const contractMonths = parseInt(document.getElementById('clb-contract-months')?.value) || 3;
    const activateDateStr = document.getElementById('clb-activate-date')?.value;
    const saleEl = document.getElementById('clb-sale');
    const selectedSaleId = saleEl?.value || '';
    const saleName = selectedSaleId ? (saleEl.options[saleEl.selectedIndex]?.textContent || '') : '';

    if (!name) return alert('⚠️ Vui lòng nhập tên VĐV!');
    if (!phone) return alert('⚠️ Vui lòng nhập số điện thoại VĐV!');

    // Parse ngày đăng ký
    let activatedAt = null, expiresAt = null;
    if (activateDateStr) {
        activatedAt = new Date(activateDateStr);
        expiresAt = new Date(activatedAt);
        expiresAt.setMonth(expiresAt.getMonth() + contractMonths);
        expiresAt.setDate(expiresAt.getDate() - 1); // HSD = kích hoạt + N tháng - 1 ngày
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
                            contractHistory: oldContracts,
                            bonusDays: 0
                        });
                        // Auto sync CLB gia hạn lên Google Sheet
                        const brNameSync1 = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'N/A';
                        syncClbRowToSheet({
                            action: 'addClbRow', branchName: 'CLB_' + brNameSync1, stt: '',
                            syncTime: new Date().toLocaleString('vi-VN'),
                            name: ex.name, phone: phone || '',
                            contractNumber: newContract,
                            athleteClass: classLevel || ex.classLevel || '',
                            pkg: `${sessionsPerWeek || ex.sessionsPerWeek || 3} buổi/tuần × ${contractMonths || ex.contractMonths || 3} tháng`,
                            activatedAt: activatedAt ? activatedAt.toLocaleDateString('vi-VN') : 'Chưa KH',
                            expiresAt: expiresAt ? expiresAt.toLocaleDateString('vi-VN') : 'N/A',
                            saleName: saleName || window._currentUserData?.name || 'N/A'
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

        // Kiểm tra trùng số hợp đồng (cả HV + VĐV CLB cùng cơ sở)
        if (contractNumber) {
            const dupMsg = await checkDuplicateContract(contractNumber, currentBranchId || currentUserBranchId);
            if (dupMsg) return alert(dupMsg);
        }

        await db.collection('athletes').add({
            name, phone: phone || '', gender: gender || 'Nam',
            contractNumber: contractNumber || 'Chưa có',
            classLevel,
            clbShift: clbShift || '',
            branchId: currentBranchId || currentUserBranchId,
            sessionsPerWeek,
            contractMonths,
            activatedAt: activatedAt || null,
            expiresAt: expiresAt || null,
            isExpired: false,
            totalAttendance: 0,
            creatorId: selectedSaleId || currentUserId,
            creatorName: saleName || window._currentUserData?.name || '',
            ...(coachId ? { assignedCoachId: coachId, assignedCoachName: coachName } : {}),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Auto sync VĐV CLB mới lên Google Sheet
        const brNameSync2 = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'N/A';
        syncClbRowToSheet({
            action: 'addClbRow', branchName: 'CLB_' + brNameSync2, stt: '',
            syncTime: new Date().toLocaleString('vi-VN'),
            name: name, phone: phone || '',
            contractNumber: contractNumber || 'Chưa có',
            athleteClass: classLevel || '',
            pkg: `${sessionsPerWeek || 3} buổi/tuần × ${contractMonths || 3} tháng`,
            activatedAt: activatedAt ? activatedAt.toLocaleDateString('vi-VN') : 'Chưa KH',
            expiresAt: expiresAt ? expiresAt.toLocaleDateString('vi-VN') : 'N/A',
            saleName: saleName || window._currentUserData?.name || 'N/A'
        });
        alert('✅ Đã thêm VĐV CLB mới!');
        // Thông báo Admin + Manager
        const brName = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'cơ sở';
        const coachInfo = coachName ? ` | GV: ${coachName}` : '';
        try {
            const admSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
            const clbAdmP = []; admSnap.forEach(doc => { if (doc.id !== currentUserId) clbAdmP.push(sendNotification(doc.id, 'contract', `🏊 VĐV CLB mới: "${name}" (HĐ: ${contractNumber || 'N/A'}, Lớp ${classLevel}${coachInfo}) tại ${brName} — bởi ${currentUserDisplayName || 'Admin'}`)); }); await Promise.all(clbAdmP);
        } catch (e) { /* skip */ }
        try {
            const mgrSnap = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', (currentBranchId || currentUserBranchId)).get();
            const clbMgrP = []; mgrSnap.forEach(doc => { if (doc.id !== currentUserId) clbMgrP.push(sendNotification(doc.id, 'contract', `🏊 VĐV CLB mới: "${name}" (HĐ: ${contractNumber || 'N/A'}, Lớp ${classLevel}${coachInfo}) tại ${brName} — bởi ${currentUserDisplayName || 'Sale'}`)); }); await Promise.all(clbMgrP);
        } catch (e) { /* skip */ }
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
    const classRaw = document.getElementById('sale-clb-class')?.value;
    const { classLevel, clbShift: parsedShift, coachId, coachName } = parseClbClassValue(classRaw);
    const manualShift = document.getElementById('sale-clb-shift')?.value || '';
    const clbShift = parsedShift || manualShift;
    const sessionsPerWeek = parseInt(document.getElementById('sale-clb-sessions')?.value) || 2;
    const contractMonths = parseInt(document.getElementById('sale-clb-months')?.value) || 1;
    const athleteNote = document.getElementById('sale-clb-note')?.value.trim() || '';
    const activateDateVal = document.getElementById('sale-clb-activate-date')?.value; // YYYY-MM-DD

    // Parse ngày kích hoạt
    let activatedAt = null;
    let expiresAt = null;
    if (activateDateVal) {
        activatedAt = new Date(activateDateVal);
        expiresAt = new Date(activateDateVal);
        expiresAt.setMonth(expiresAt.getMonth() + contractMonths);
        expiresAt.setDate(expiresAt.getDate() - 1); // HSD = kích hoạt + N tháng - 1 ngày
    }

    if (!name) return alert('⚠️ Vui lòng nhập họ tên VĐV!');
    if (!contractNumber) return alert('⚠️ Vui lòng nhập số hợp đồng!');
    if (!phone) return alert('⚠️ Vui lòng nhập số điện thoại VĐV!');

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
                        // Dùng ngày kích hoạt từ form nếu có, hoặc hỏi
                        let newActivatedAt = activatedAt;
                        let newExpiresAt = expiresAt;
                        if (!newActivatedAt) {
                            const activateDateStr = prompt(`📅 Nhập ngày kích hoạt HĐ mới (DD/MM/YYYY):\n\nVí dụ: 15/03/2026\nĐể trống = kích hoạt khi điểm danh buổi đầu.`);
                            if (activateDateStr && activateDateStr.trim()) {
                                const parts = activateDateStr.trim().split('/');
                                if (parts.length === 3) {
                                    const d = parseInt(parts[0]), m = parseInt(parts[1]) - 1, y = parseInt(parts[2]);
                                    newActivatedAt = new Date(y, m, d);
                                    newExpiresAt = new Date(y, m + (contractMonths || ex.contractMonths || 1), d);
                                }
                            }
                        }
                        const oldContracts = ex.contractHistory || [];
                        oldContracts.push({ contractNumber: ex.contractNumber, months: ex.contractMonths, sessions: ex.sessionsPerWeek, expiredAt: ex.expiresAt, classLevel: ex.classLevel });
                        const updateData = {
                            contractNumber: newContract,
                            contractMonths,
                            sessionsPerWeek,
                            classLevel,
                            isExpired: false,
                            isFrozen: false,
                            activatedAt: newActivatedAt || null,
                            expiresAt: newExpiresAt || null,
                            contractHistory: oldContracts,
                            bonusDays: 0
                        };
                        await db.collection('athletes').doc(existDoc.id).update(updateData);
                        // Auto sync CLB gia hạn lên Google Sheet (Sale tab)
                        const brNameSync3 = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'N/A';
                        syncClbRowToSheet({
                            action: 'addClbRow', branchName: 'CLB_' + brNameSync3, stt: '',
                            syncTime: new Date().toLocaleString('vi-VN'),
                            name: ex.name, phone: phone || '',
                            contractNumber: newContract,
                            athleteClass: classLevel || ex.classLevel || '',
                            pkg: `${sessionsPerWeek || ex.sessionsPerWeek || 3} buổi/tuần × ${contractMonths || ex.contractMonths || 3} tháng`,
                            activatedAt: newActivatedAt ? newActivatedAt.toLocaleDateString('vi-VN') : 'Chưa KH',
                            expiresAt: newExpiresAt ? newExpiresAt.toLocaleDateString('vi-VN') : 'N/A',
                            saleName: window._currentUserData?.name || 'N/A'
                        });
                        const activateMsg = newActivatedAt
                            ? `Kích hoạt: ${newActivatedAt.toLocaleDateString('vi-VN')} → Hết hạn: ${newExpiresAt.toLocaleDateString('vi-VN')}`
                            : 'Sẽ kích hoạt khi điểm danh buổi đầu';
                        alert(`✅ Đã gia hạn HĐ mới "${newContract}" cho ${ex.name}!\n${activateMsg}\nHĐ cũ "${ex.contractNumber}" đã lưu lại.\nTổng buổi đã học vẫn giữ: ${ex.totalAttendance || 0}`);
                        document.getElementById('sale-clb-name').value = '';
                        document.getElementById('sale-clb-phone').value = '';
                        document.getElementById('sale-clb-contract').value = '';
                        if (document.getElementById('sale-clb-activate-date')) document.getElementById('sale-clb-activate-date').value = '';
                        return;
                    } else return;
                } else {
                    alert(`⚠️ VĐV "${ex.name}" (SĐT: ${phone}) đã tồn tại và đang hoạt động!\nHĐ: ${ex.contractNumber} | Lớp: ${ex.classLevel}`);
                    return;
                }
            }
        }

        // Kiểm tra trùng số hợp đồng (cả HV + VĐV CLB cùng cơ sở)
        if (contractNumber) {
            const dupMsg = await checkDuplicateContract(contractNumber, currentBranchId || currentUserBranchId);
            if (dupMsg) return alert(dupMsg);
        }

        await db.collection('athletes').add({
            name, phone: phone || '', gender: gender || 'Nam',
            contractNumber: contractNumber || 'Chưa có',
            classLevel,
            clbShift: clbShift || '',
            branchId: currentBranchId || currentUserBranchId,
            sessionsPerWeek,
            contractMonths,
            activatedAt: activatedAt || null,
            expiresAt: expiresAt || null,
            isExpired: false,
            totalAttendance: 0,
            creatorId: currentUserId,
            creatorName: window._currentUserData?.name || '',
            athleteNote: athleteNote,
            ...(coachId ? { assignedCoachId: coachId, assignedCoachName: coachName } : {}),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Auto sync VĐV CLB mới lên Google Sheet (Sale tab)
        const brNameSync4 = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'N/A';
        syncClbRowToSheet({
            action: 'addClbRow', branchName: 'CLB_' + brNameSync4, stt: '',
            syncTime: new Date().toLocaleString('vi-VN'),
            name: name, phone: phone || '',
            contractNumber: contractNumber || 'Chưa có',
            athleteClass: classLevel || '',
            pkg: `${sessionsPerWeek || 3} buổi/tuần × ${contractMonths || 3} tháng`,
            activatedAt: activatedAt ? activatedAt.toLocaleDateString('vi-VN') : 'Chưa KH',
            expiresAt: expiresAt ? expiresAt.toLocaleDateString('vi-VN') : 'N/A',
            saleName: window._currentUserData?.name || 'N/A'
        });
        const activateMsg = activatedAt
            ? `Kích hoạt: ${activatedAt.toLocaleDateString('vi-VN')} → Hết hạn: ${expiresAt.toLocaleDateString('vi-VN')}`
            : 'Sẽ kích hoạt khi điểm danh buổi đầu';
        alert(`✅ Đã thêm VĐV CLB mới!\n${activateMsg}`);
        // Thông báo Admin + Manager
        const brName2 = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'cơ sở';
        const coachInfo2 = coachName ? ` | GV: ${coachName}` : '';
        try {
            const admSnap2 = await db.collection('users').where('role', '==', 'ADMIN').get();
            const clbAdmP2 = []; admSnap2.forEach(doc => { if (doc.id !== currentUserId) clbAdmP2.push(sendNotification(doc.id, 'contract', `🏊 VĐV CLB mới: "${name}" (HĐ: ${contractNumber || 'N/A'}, Lớp ${classLevel}${coachInfo2}) tại ${brName2} — bởi ${currentUserDisplayName || 'Sale'}`)); }); await Promise.all(clbAdmP2);
        } catch (e) { /* skip */ }
        try {
            const mgrSnap2 = await db.collection('users').where('role', '==', 'MANAGER').where('branchId', '==', (currentBranchId || currentUserBranchId)).get();
            const clbMgrP2 = []; mgrSnap2.forEach(doc => { if (doc.id !== currentUserId) clbMgrP2.push(sendNotification(doc.id, 'contract', `🏊 VĐV CLB mới: "${name}" (HĐ: ${contractNumber || 'N/A'}, Lớp ${classLevel}${coachInfo2}) tại ${brName2} — bởi ${currentUserDisplayName || 'Sale'}`)); }); await Promise.all(clbMgrP2);
        } catch (e) { /* skip */ }
        document.getElementById('sale-clb-name').value = '';
        document.getElementById('sale-clb-phone').value = '';
        document.getElementById('sale-clb-contract').value = '';
        if (document.getElementById('sale-clb-note')) document.getElementById('sale-clb-note').value = '';
        if (document.getElementById('sale-clb-activate-date')) document.getElementById('sale-clb-activate-date').value = '';
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};
window.listenToAthletes = function() {
    if (clbAthleteUnsub) clbAthleteUnsub();
    let query = db.collection('athletes');

    // Tất cả role đều lọc theo cơ sở
    const branchForFilter = currentBranchId || currentUserBranchId;
    if (branchForFilter) {
        query = query.where('branchId', '==', branchForFilter);
    }

    // Load danh sách Sale vào dropdown (dùng localState thay vì query Firestore)
    const saleSelect = document.getElementById('clb-sale');
    if (saleSelect) {
        // Xóa options cũ (giữ option đầu "-- Sale quản lý --")
        while (saleSelect.options.length > 1) saleSelect.remove(1);
        const allUsers = [...(localState.teachers || []), ...(localState.sales || []), ...(localState.firedUsers || [])];
        allUsers.forEach(u => {
            if ((u.role === 'SALE' || u.role === 'ADMIN') && (!u.branchId || u.branchId === currentBranchId)) {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = u.name;
                saleSelect.appendChild(opt);
            }
        });
    }

    let _clbFixedIds = new Set(); // Track VĐV đã auto-fix → không fix lại
    let _clbMigrated = false; // Migration chỉ chạy 1 lần

    clbAthleteUnsub = query.onSnapshot(snap => {
        clbAthletesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Auto-expire kiểm tra — CHỈ ADMIN chạy để tránh cascade writes
        if (currentUserRole === 'ADMIN') {
        const now = new Date();
        clbAthletesCache.forEach(a => {
            if (_clbFixedIds.has(a.id)) return; // Đã fix rồi → skip

            let exp = null;
            if (a.expiresAt) {
                exp = a.expiresAt.toDate ? a.expiresAt.toDate() : new Date(a.expiresAt);
                if (isNaN(exp.getTime())) exp = null;
            }
            // Nếu expiresAt null/sai nhưng có activatedAt → tự tính lại
            if (!exp && a.activatedAt) {
                const act = a.activatedAt.toDate ? a.activatedAt.toDate() : new Date(a.activatedAt);
                if (!isNaN(act.getTime())) {
                    exp = new Date(act);
                    exp.setMonth(exp.getMonth() + (a.contractMonths || 1));
                    console.log(`🔧 [CLB] Auto-fix expiresAt cho ${a.name}`);
                    db.collection('athletes').doc(a.id).update({ expiresAt: exp });
                    _clbFixedIds.add(a.id); // Đánh dấu đã fix
                }
            }
            if (exp) {
                const expEndOfDay = new Date(exp);
                expEndOfDay.setHours(23, 59, 59, 999);
                if (a.isExpired && now <= expEndOfDay) {
                    db.collection('athletes').doc(a.id).update({ isExpired: false });
                    a.isExpired = false;
                    _clbFixedIds.add(a.id);
                } else if (!a.isExpired && now > expEndOfDay) {
                    db.collection('athletes').doc(a.id).update({ isExpired: true });
                    _clbFixedIds.add(a.id);
                }
            }
        });
        } // end ADMIN-only auto-expire

        renderClbTable();
        populateClbClassDropdowns();
        // Migration chỉ chạy 1 LẦN DUY NHẤT per session
        if (!_clbMigrated && (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER')) {
            _clbMigrated = true;
            migrateClbCreatorIds();
        }
    });
};

// Xuất Excel (CSV) danh sách VĐV CLB theo lớp đang filter
window.exportClbExcel = function () {
    const filterClass = document.getElementById('clb-filter-class')?.value || '';
    let data = clbAthletesCache.filter(a => !a.isExpired);
    if (filterClass) data = data.filter(a => a.classLevel === filterClass);

    if (data.length === 0) return alert('⚠️ Không có VĐV nào để xuất!');

    // Sort theo lớp → tên
    const classOrder = { 'Mầm': 0, 'D1': 1, 'D2': 2, 'C': 3, 'B': 4, 'A': 5 };
    data.sort((a, b) => (classOrder[a.classLevel] || 0) - (classOrder[b.classLevel] || 0) || a.name.localeCompare(b.name, 'vi'));

    const rows = [['STT', 'Họ và tên', 'Số hợp đồng', 'Loại hợp đồng', 'Ngày kích hoạt', 'Lớp tập luyện', 'Giáo viên phụ trách', 'SĐT', 'Trạng thái']];

    data.forEach((a, i) => {
        const contractType = `${a.contractMonths || '?'} tháng ${a.sessionsPerWeek || '?'} buổi/tuần`;
        let activatedDate = '—';
        if (a.activatedAt) {
            const d = a.activatedAt.toDate ? a.activatedAt.toDate() : new Date(a.activatedAt);
            activatedDate = d.toLocaleDateString('vi-VN');
        }
        const status = a.isFrozen ? 'Bảo lưu' : 'Đang học';
        const coachName = a.assignedCoachName || '';
        rows.push([i + 1, a.name, a.contractNumber || '', contractType, activatedDate, a.classLevel || '', coachName, a.phone || '', status]);
    });

    const brName = FIXED_BRANCHES.find(b => b.id === (currentBranchId || currentUserBranchId))?.name || 'CS';
    const fileName = filterClass ? `VDV_CLB_Lop_${filterClass}_${brName}.xlsx` : `VDV_CLB_TatCa_${brName}.xlsx`;
    downloadXLSX(rows, fileName, 'Danh sách VĐV');
};

// ===== AUTO-FIX CA CHO VĐV ĐÃ GÁN HLV NHƯNG CHƯA CÓ clbShift =====
window.autoFixShift = async function (classLevel, coachId, autoShift) {
    if (currentUserRole !== 'ADMIN' && currentUserRole !== 'MANAGER') return alert('⚠️ Chỉ Admin/Quản lý!');

    // Tìm VĐV đã gán HLV này nhưng chưa có Ca
    const targets = clbAthletesCache.filter(a =>
        a.classLevel === classLevel && a.assignedCoachId === coachId && !a.isExpired &&
        (!a.clbShift || a.clbShift === '')
    );

    if (targets.length === 0) return alert('Không có VĐV nào cần fix!');

    if (!autoShift) {
        autoShift = prompt(`Nhập số Ca cho ${targets.length} VĐV Lớp ${classLevel}:\n(VD: 1, 2, 3...)`);
        if (!autoShift) return;
    }

    const coachName = targets[0].assignedCoachName || targets[0].coachName || 'HLV';
    if (!confirm(`🔧 Gán Ca ${autoShift} cho ${targets.length} VĐV Lớp ${classLevel} (HLV: ${coachName})?`)) return;

    let count = 0;
    for (let i = 0; i < targets.length; i += 500) {
        const batch = db.batch();
        targets.slice(i, i + 500).forEach(a => {
            batch.update(db.collection('athletes').doc(a.id), { clbShift: autoShift });
            count++;
        });
        await batch.commit();
    }

    alert(`✅ Đã gán Ca ${autoShift} cho ${count} VĐV Lớp ${classLevel} (${coachName})!`);
};

// ===== GÁN HLV HÀNG LOẠT CHO VĐV CHƯA GÁN =====
window.bulkAssignCoach = async function (classLevel) {
    if (currentUserRole !== 'ADMIN' && currentUserRole !== 'MANAGER') return alert('⚠️ Chỉ Admin/Quản lý!');

    const brId = currentBranchId || currentUserBranchId;
    if (!brId) return;

    // Tìm HLV phụ trách lớp này — kèm Ca (dùng localState)
    const coachDocs = (localState.teachers || []).filter(u => u.isCoach && u.branchId === brId);
    console.log(`[bulkAssign] brId=${brId}, classLevel=${classLevel}, totalCoaches=${coachDocs.length}`);
    let entries = []; // [{ coachId, coachName, shift, label }]
    coachDocs.forEach(u => {
        console.log(`[bulkAssign] Coach ${u.name}: coachClasses=`, u.coachClasses);
        (u.coachClasses || []).forEach(cl => {
            let base = cl, shift = '';
            if (cl.includes('-Ca')) {
                const dashIdx = cl.lastIndexOf('-Ca');
                base = cl.substring(0, dashIdx);
                shift = cl.substring(dashIdx + 3); // skip '-Ca', get '1','2'...
            }
            if (base === classLevel) {
                const label = shift ? `${u.name || 'HLV'} (Ca ${shift})` : (u.name || 'HLV');
                entries.push({ coachId: u.id, coachName: u.name || 'HLV', shift, label });
            }
        });
    });

    if (entries.length === 0) return alert(`⚠️ Chưa có HLV nào phụ trách Lớp ${classLevel}!\nVào Quản lý nhân sự → bấm HLV để gán lớp trước.\n\n(Debug: ${coachDocs.length} HLV tại branchId=${brId})`);

    // Hiện danh sách HLV+Ca cho chọn
    let list = entries.map((c, i) => `${i + 1}. ${c.label}`).join('\n');
    const pick = prompt(
        `🏅 GÁN HLV CHO VĐV LỚP ${classLevel} CHƯA CÓ GV\n\n` +
        `Chọn HLV + Ca (nhập số):\n${list}\n\n` +
        `Tất cả VĐV Lớp ${classLevel} chưa gán sẽ được chuyển.`
    );
    if (!pick) return;
    const idx = parseInt(pick) - 1;
    if (isNaN(idx) || idx < 0 || idx >= entries.length) return alert('Lựa chọn không hợp lệ!');
    const target = entries[idx];

    // Tìm VĐV chưa gán
    const unassigned = clbAthletesCache.filter(a => a.classLevel === classLevel && !a.assignedCoachId && !a.isExpired);
    if (unassigned.length === 0) return alert('Không có VĐV nào cần gán!');

    const shiftText = target.shift ? ` + Ca ${target.shift}` : '';
    if (!confirm(`✅ Gán ${unassigned.length} VĐV Lớp ${classLevel} → HLV "${target.coachName}"${shiftText}?\n\nThao tác này sẽ cập nhật tất cả VĐV chưa gán GV.`)) return;

    // Batch update
    let count = 0;
    for (let i = 0; i < unassigned.length; i += 500) {
        const batch = db.batch();
        unassigned.slice(i, i + 500).forEach(a => {
            const updateData = {
                assignedCoachId: target.coachId,
                assignedCoachName: target.coachName,
                coachName: target.coachName
            };
            if (target.shift) updateData.clbShift = target.shift;
            batch.update(db.collection('athletes').doc(a.id), updateData);
            count++;
        });
        await batch.commit();
    }

    alert(`✅ Đã gán ${count} VĐV Lớp ${classLevel} → HLV "${target.coachName}"${shiftText}!`);
};

// ===== CHUYỂN CẢ LỚP/CA TỪ GV NÀY SANG GV KHÁC =====
window.transferCoachClass = async function () {
    if (currentUserRole !== 'ADMIN' && currentUserRole !== 'MANAGER') return alert('⚠️ Chỉ Admin/Quản lý!');

    const brId = currentBranchId || currentUserBranchId;
    if (!brId) return alert('⚠️ Chưa chọn cơ sở!');

    // Bước 1: Tìm tất cả HLV tại cơ sở (dùng localState)
    const coachDocs = (localState.teachers || []).filter(u => u.isCoach && u.branchId === brId);
    if (coachDocs.length === 0) return alert('⚠️ Chưa có HLV nào tại cơ sở này!');

    // Tạo danh sách HLV kèm số VĐV đang phụ trách
    const coaches = [];
    coachDocs.forEach(u => {
        const athleteCount = (clbAthletesCache || []).filter(a => a.assignedCoachId === u.id && !a.isExpired).length;
        if (athleteCount > 0) {
            coaches.push({ id: u.id, name: u.name || 'HLV', classes: u.coachClasses || [], athleteCount });
        }
    });

    if (coaches.length === 0) return alert('⚠️ Chưa có HLV nào đang phụ trách VĐV!');

    // Bước 2: Chọn GV nguồn (chuyển TỪ)
    let sourceList = coaches.map((c, i) => `${i + 1}. ${c.name} (${c.athleteCount} VĐV)`).join('\n');
    const srcPick = prompt(`🔄 CHUYỂN LỚP GIÁO VIÊN\n\nBước 1/3: Chọn GV NGUỒN (chuyển TỪ):\n\n${sourceList}`);
    if (!srcPick) return;
    const srcIdx = parseInt(srcPick) - 1;
    if (isNaN(srcIdx) || srcIdx < 0 || srcIdx >= coaches.length) return alert('Lựa chọn không hợp lệ!');
    const sourceCoach = coaches[srcIdx];

    // Bước 3: Chọn lớp/ca cần chuyển
    const sourceAthletes = (clbAthletesCache || []).filter(a => a.assignedCoachId === sourceCoach.id && !a.isExpired);
    
    // Nhóm theo lớp + ca
    const groups = {};
    sourceAthletes.forEach(a => {
        const key = a.clbShift ? `${a.classLevel}-Ca${a.clbShift}` : a.classLevel;
        if (!groups[key]) groups[key] = { classLevel: a.classLevel, shift: a.clbShift || '', athletes: [], label: a.clbShift ? `Lớp ${a.classLevel} Ca ${a.clbShift}` : `Lớp ${a.classLevel}` };
        groups[key].athletes.push(a);
    });
    const groupKeys = Object.keys(groups);

    let groupList = groupKeys.map((k, i) => `${i + 1}. ${groups[k].label} (${groups[k].athletes.length} VĐV)`).join('\n');
    groupList += `\n0. TẤT CẢ (${sourceAthletes.length} VĐV)`;

    const grpPick = prompt(`🔄 CHUYỂN LỚP GIÁO VIÊN\n\nGV nguồn: ${sourceCoach.name}\n\nBước 2/3: Chọn lớp/ca cần chuyển:\n\n${groupList}`);
    if (grpPick === null) return;
    const grpIdx = parseInt(grpPick);

    let athletesToTransfer = [];
    let transferLabel = '';
    if (grpIdx === 0) {
        athletesToTransfer = sourceAthletes;
        transferLabel = `TẤT CẢ (${sourceAthletes.length} VĐV)`;
    } else if (grpIdx >= 1 && grpIdx <= groupKeys.length) {
        const grp = groups[groupKeys[grpIdx - 1]];
        athletesToTransfer = grp.athletes;
        transferLabel = `${grp.label} (${grp.athletes.length} VĐV)`;
    } else {
        return alert('Lựa chọn không hợp lệ!');
    }

    if (athletesToTransfer.length === 0) return alert('Không có VĐV nào để chuyển!');

    // Bước 4: Chọn GV đích (chuyển SANG)
    const allCoaches = [];
    coachSnap.docs.forEach(doc => {
        const u = doc.data();
        if (doc.id !== sourceCoach.id) {
            const cnt = (clbAthletesCache || []).filter(a => a.assignedCoachId === doc.id && !a.isExpired).length;
            allCoaches.push({ id: doc.id, name: u.name || 'HLV', classes: u.coachClasses || [], athleteCount: cnt });
        }
    });

    if (allCoaches.length === 0) return alert('⚠️ Không có GV nào khác để chuyển!');

    let targetList = allCoaches.map((c, i) => `${i + 1}. ${c.name} (đang có ${c.athleteCount} VĐV)`).join('\n');
    const tgtPick = prompt(`🔄 CHUYỂN LỚP GIÁO VIÊN\n\nGV nguồn: ${sourceCoach.name}\nChuyển: ${transferLabel}\n\nBước 3/3: Chọn GV ĐÍCH (chuyển SANG):\n\n${targetList}`);
    if (!tgtPick) return;
    const tgtIdx = parseInt(tgtPick) - 1;
    if (isNaN(tgtIdx) || tgtIdx < 0 || tgtIdx >= allCoaches.length) return alert('Lựa chọn không hợp lệ!');
    const targetCoach = allCoaches[tgtIdx];

    // Xác nhận
    const nameList = athletesToTransfer.slice(0, 10).map(a => `  • ${a.name}`).join('\n');
    const moreText = athletesToTransfer.length > 10 ? `\n  ... và ${athletesToTransfer.length - 10} VĐV nữa` : '';
    if (!confirm(`🔄 XÁC NHẬN CHUYỂN LỚP\n\nTừ: ${sourceCoach.name}\nSang: ${targetCoach.name}\nSố VĐV: ${athletesToTransfer.length}\n\n• Xóa lớp/ca khỏi cài đặt HLV "${sourceCoach.name}"\n• Thêm lớp/ca vào cài đặt HLV "${targetCoach.name}"\n\nDanh sách:\n${nameList}${moreText}\n\nBấm OK để chuyển.`)) return;

    // Xác định classKey cần chuyển (e.g. "B-Ca1" hoặc "B")
    let transferClassKeys = [];
    if (grpIdx === 0) {
        // Tất cả → lấy tất cả class keys từ groups
        groupKeys.forEach(k => {
            const g = groups[k];
            const ck = g.shift ? `${g.classLevel}-Ca${g.shift}` : g.classLevel;
            transferClassKeys.push(ck);
        });
    } else {
        const grp = groups[groupKeys[grpIdx - 1]];
        const ck = grp.shift ? `${grp.classLevel}-Ca${grp.shift}` : grp.classLevel;
        transferClassKeys.push(ck);
    }

    // Thực hiện batch update VĐV
    let count = 0;
    for (let i = 0; i < athletesToTransfer.length; i += 500) {
        const batch = db.batch();
        athletesToTransfer.slice(i, i + 500).forEach(a => {
            batch.update(db.collection('athletes').doc(a.id), {
                assignedCoachId: targetCoach.id,
                assignedCoachName: targetCoach.name,
                coachName: targetCoach.name
            });
            count++;
        });
        await batch.commit();
    }

    // Cập nhật cài đặt HLV: xóa lớp GV cũ, thêm lớp GV mới
    try {
        // Xóa lớp/ca khỏi GV cũ
        const srcDoc = await db.collection('users').doc(sourceCoach.id).get();
        if (srcDoc.exists) {
            let srcClasses = srcDoc.data().coachClasses || [];
            transferClassKeys.forEach(ck => {
                srcClasses = srcClasses.filter(c => c !== ck);
            });
            await db.collection('users').doc(sourceCoach.id).update({ coachClasses: srcClasses });
        }

        // Thêm lớp/ca cho GV mới (nếu chưa có)
        const tgtDoc = await db.collection('users').doc(targetCoach.id).get();
        if (tgtDoc.exists) {
            let tgtClasses = tgtDoc.data().coachClasses || [];
            transferClassKeys.forEach(ck => {
                if (!tgtClasses.includes(ck)) tgtClasses.push(ck);
            });
            await db.collection('users').doc(targetCoach.id).update({ coachClasses: tgtClasses, isCoach: true });
        }
    } catch (e) { console.error('Lỗi cập nhật coachClasses:', e); }

    alert(`✅ Đã chuyển ${count} VĐV từ "${sourceCoach.name}" sang "${targetCoach.name}"!\n\n📋 Cài đặt HLV:\n• ${sourceCoach.name}: đã xóa lớp ${transferClassKeys.join(', ')}\n• ${targetCoach.name}: đã thêm lớp ${transferClassKeys.join(', ')}`);
    renderClbTable();
};

// Render bảng VĐV
window.renderClbTable = async function () {
    const tbody = document.getElementById('clb-athletes-tbody');
    if (!tbody) return;

    // --- STATS ---
    const statsContainer = document.getElementById('clb-stats-container');
    if (statsContainer) {
        // Helper: extract base class from 'B-Ca1' → 'B'
        function getBaseClass(cl) {
            if (cl.includes('-Ca')) return cl.substring(0, cl.lastIndexOf('-Ca'));
            return cl;
        }

        let baseData = clbAthletesCache;
        if (currentUserRole === 'TEACHER') {
            // HLV chỉ thấy VĐV được gán cho mình
            baseData = baseData.filter(a => a.assignedCoachId === currentUserId);
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
                <div onclick="document.getElementById('clb-filter-class').value=''; renderClbTable();"
                    style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:10px; padding:12px; text-align:center; cursor:pointer; transition:transform 0.15s;"
                    onmouseenter="this.style.transform='scale(1.05)';"
                    onmouseleave="this.style.transform='scale(1)';">
                    <div style="font-size:22px; font-weight:700; color:var(--primary);">${active.length}</div>
                    <div style="font-size:11px; color:var(--text-muted);">Tổng VĐV</div>
                </div>`;
        }
        // Build coachMap: key → [{ id, name, shift }] — hỗ trợ Lớp-Ca
        let coachMap = {};
        try {
            const brId = currentBranchId || currentUserBranchId;
            // Dùng localState thay vì query Firestore
            const coachDocs = (localState.teachers || []).filter(u => u.isCoach && u.branchId === brId);
            coachDocs.forEach(u => {
                (u.coachClasses || []).forEach(cl => {
                    const baseClass = getBaseClass(cl);
                    let shift = '';
                    if (cl.includes('-Ca')) shift = cl.substring(cl.lastIndexOf('-Ca') + 3);
                    const entry = { id: u.id, name: u.name || 'HLV', shift };
                    // Map exact key (e.g., 'B-Ca1')
                    if (!coachMap[cl]) coachMap[cl] = [];
                    coachMap[cl].push(entry);
                    // Also map base class (e.g., 'B') for fallback
                    if (cl !== baseClass) {
                        if (!coachMap[baseClass]) coachMap[baseClass] = [];
                        coachMap[baseClass].push(entry);
                    }
                });
            });
        } catch (e) { console.warn('Coach map error:', e); }

        CLB_LEVELS.forEach(l => {
            if (currentUserRole === 'TEACHER') {
                const cc = window._currentUserData?.coachClasses || [];
                const ccBases = cc.map(c => getBaseClass(c));
                if (!ccBases.includes(l)) return;
            }
            const coaches = coachMap[l] || [];
            const hasMultiCoach = coaches.length > 1;

            if (hasMultiCoach) {
                // Tách card cho từng Ca/GV — đếm theo coachId + clbShift
                coaches.forEach(coach => {
                    let coachCount;
                    if (coach.shift) {
                        // Đếm VĐV gán cho HLV này VÀ đúng Ca
                        coachCount = active.filter(a => a.classLevel === l && a.assignedCoachId === coach.id && a.clbShift === coach.shift).length;
                    } else {
                        // Không có Ca → đếm theo coachId
                        coachCount = active.filter(a => a.classLevel === l && a.assignedCoachId === coach.id).length;
                    }
                    const shiftLabel = coach.shift ? ` (Ca ${coach.shift})` : '';
                    const filterShift = coach.shift ? `window._clbFilterShift='${coach.shift}';` : '';
                    statsHtml += `
                    <div onclick="${filterShift} window._clbFilterCoachId='${coach.id}'; document.getElementById('clb-filter-class').value='${l}'; renderClbTable(); document.getElementById('clb-athletes-tbody')?.scrollIntoView({behavior:'smooth'});"
                        style="background:${levelColor[l]}15; border:1px solid ${levelColor[l]}40; border-radius:10px; padding:12px; text-align:center; cursor:pointer; transition:transform 0.15s, box-shadow 0.15s;"
                        onmouseenter="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px ${levelColor[l]}30';"
                        onmouseleave="this.style.transform='scale(1)'; this.style.boxShadow='none';">
                        <div style="font-size:22px; font-weight:700; color:${levelColor[l]};">${coachCount}</div>
                        <div style="font-size:11px; color:var(--text-muted);">Lớp ${l}${shiftLabel}</div>
                        <div style="font-size:10px; color:${levelColor[l]}; font-weight:600; margin-top:2px;">🏅 ${coach.name}</div>
                    </div>`;
                });
                // Card cho VĐV chưa gán Ca — tách theo HLV đã gán
                const allShifts = coaches.filter(c => c.shift).map(c => c.shift);
                const noShiftAthletes = allShifts.length > 0
                    ? active.filter(a => a.classLevel === l && (!a.clbShift || !allShifts.includes(a.clbShift)))
                    : active.filter(a => a.classLevel === l && !a.assignedCoachId);

                if (noShiftAthletes.length > 0) {
                    // Tách VĐV chưa gán Ca theo từng coach đã gán
                    const coachGroups = {};
                    let noCoachCount = 0;
                    noShiftAthletes.forEach(a => {
                        if (a.assignedCoachId) {
                            if (!coachGroups[a.assignedCoachId]) coachGroups[a.assignedCoachId] = { name: a.assignedCoachName || a.coachName || 'HLV', count: 0 };
                            coachGroups[a.assignedCoachId].count++;
                        } else {
                            noCoachCount++;
                        }
                    });

                    // Card cho từng HLV đã gán nhưng chưa có Ca → bấm auto-fix
                    Object.keys(coachGroups).forEach(cId => {
                        const g = coachGroups[cId];
                        // Tìm Ca mà HLV này dạy cho lớp l
                        const matchCoach = coaches.find(c => c.id === cId && c.shift);
                        const autoShift = matchCoach ? matchCoach.shift : '';
                        const shiftHint = autoShift ? `→ Ca ${autoShift}` : '';
                        statsHtml += `
                        <div onclick="window._clbFilterCoachId='${cId}'; window._clbFilterShift=''; document.getElementById('clb-filter-class').value='${l}'; renderClbTable(); document.getElementById('clb-athletes-tbody')?.scrollIntoView({behavior:'smooth'});"
                            style="background:rgba(245,158,11,0.08); border:1px dashed rgba(245,158,11,0.4); border-radius:10px; padding:12px; text-align:center; cursor:pointer;">
                            <div style="font-size:22px; font-weight:700; color:#d97706;">${g.count}</div>
                            <div style="font-size:11px; color:var(--text-muted);">Lớp ${l} ${shiftHint}</div>
                            <div style="font-size:10px; color:#d97706; font-weight:600; margin-top:2px;">🔧 ${g.name}</div>
                        </div>`;
                    });

                    // Card cho VĐV chưa gán cả GV lẫn Ca
                    if (noCoachCount > 0) {
                        statsHtml += `
                        <div onclick="bulkAssignCoach('${l}')"
                            style="background:rgba(107,114,128,0.08); border:1px dashed rgba(107,114,128,0.3); border-radius:10px; padding:12px; text-align:center; cursor:pointer;">
                            <div style="font-size:22px; font-weight:700; color:#6b7280;">${noCoachCount}</div>
                            <div style="font-size:11px; color:var(--text-muted);">Lớp ${l}</div>
                            <div style="font-size:10px; color:#ef4444; font-weight:600; margin-top:2px;">⚠️ Chưa gán GV+Ca</div>
                        </div>`;
                    }
                }
            } else {
                // Lớp chỉ có 1 GV hoặc chưa gán → hiện bình thường
                const shiftLabel = coaches.length === 1 && coaches[0].shift ? ` (Ca ${coaches[0].shift})` : '';
                const coachLabel = coaches.length === 1 ? `<div style="font-size:10px; color:${levelColor[l]}; font-weight:600; margin-top:2px;">🏅 ${coaches[0].name}${shiftLabel}</div>` : '';
                statsHtml += `
                <div onclick="window._clbFilterCoachId=''; window._clbFilterShift=''; document.getElementById('clb-filter-class').value='${l}'; renderClbTable(); document.getElementById('clb-athletes-tbody')?.scrollIntoView({behavior:'smooth'});"
                    style="background:${levelColor[l]}15; border:1px solid ${levelColor[l]}40; border-radius:10px; padding:12px; text-align:center; cursor:pointer; transition:transform 0.15s, box-shadow 0.15s;"
                    onmouseenter="this.style.transform='scale(1.05)'; this.style.boxShadow='0 4px 12px ${levelColor[l]}30';"
                    onmouseleave="this.style.transform='scale(1)'; this.style.boxShadow='none';">
                    <div style="font-size:22px; font-weight:700; color:${levelColor[l]};">${classCounts[l]}</div>
                    <div style="font-size:11px; color:var(--text-muted);">Lớp ${l}</div>
                    ${coachLabel}
                </div>`;
            }
        });
        // Today attendance count — filter theo cơ sở hiện tại (cache 60s)
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const brId = currentBranchId || currentUserBranchId;
        const _now = Date.now();
        if (!window._clbAttCache || _now - window._clbAttCache.ts > 60000 || window._clbAttCache.brId !== brId) {
            db.collection('clb_attendance')
                .where('branchId', '==', brId)
                .where('timestamp', '>=', today)
                .get().then(snap => {
                    window._clbAttCache = { ts: _now, brId, size: snap.size, docs: snap.docs };
                    let todayCount = snap.size;
                    const shiftMap = {};
                    snap.docs.forEach(d => {
                        const dd = d.data();
                        const sh = dd.clbShift || dd.shift || '';
                        if (sh) shiftMap[sh] = (shiftMap[sh] || 0) + 1;
                    });
                    if (currentUserRole === 'TEACHER') {
                        const myIds = new Set(clbAthletesCache.filter(a => a.assignedCoachId === currentUserId).map(a => a.id));
                        todayCount = snap.docs.filter(d => myIds.has(d.data().athleteId)).length;
                    }
                    const todayEl = document.getElementById('clb-today-count');
                    if (todayEl) todayEl.textContent = todayCount;
                    const bkEl = document.getElementById('clb-today-shift-breakdown');
                    if (bkEl) {
                        const sKeys = Object.keys(shiftMap).sort((a, b) => Number(a) - Number(b));
                        bkEl.innerHTML = sKeys.map(s => `<span style="background:rgba(245,158,11,0.15); color:#b45309; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700;">Ca ${s}: ${shiftMap[s]}</span>`).join('');
                    }
                }).catch(() => {});
        } else {
            // Dùng cache
            const snap = window._clbAttCache;
            let todayCount = snap.size;
            const shiftMap = {};
            snap.docs.forEach(d => {
                const dd = d.data();
                const sh = dd.clbShift || dd.shift || '';
                if (sh) shiftMap[sh] = (shiftMap[sh] || 0) + 1;
            });
            if (currentUserRole === 'TEACHER') {
                const myIds = new Set(clbAthletesCache.filter(a => a.assignedCoachId === currentUserId).map(a => a.id));
                todayCount = snap.docs.filter(d => myIds.has(d.data().athleteId)).length;
            }
            const todayEl = document.getElementById('clb-today-count');
            if (todayEl) todayEl.textContent = todayCount;
            const bkEl = document.getElementById('clb-today-shift-breakdown');
            if (bkEl) {
                const sKeys = Object.keys(shiftMap).sort((a, b) => Number(a) - Number(b));
                bkEl.innerHTML = sKeys.map(s => `<span style="background:rgba(245,158,11,0.15); color:#b45309; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700;">Ca ${s}: ${shiftMap[s]}</span>`).join('');
            }
        }
        statsHtml += `
            <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.3); border-radius:10px; padding:12px; text-align:center;">
                <div style="font-size:22px; font-weight:700; color:#10b981;" id="clb-today-count">...</div>
                <div style="font-size:11px; color:var(--text-muted);">Điểm danh hôm nay</div>
                <div id="clb-today-shift-breakdown" style="display:flex; gap:4px; justify-content:center; flex-wrap:wrap; margin-top:6px;"></div>
            </div>`;
        if (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') {
            statsHtml += `
            <div onclick="transferCoachClass()" style="background:rgba(139,92,246,0.08); border:1px solid rgba(139,92,246,0.3); border-radius:10px; padding:12px; text-align:center; cursor:pointer; transition:transform 0.15s;"
                onmouseenter="this.style.transform='scale(1.05)'" onmouseleave="this.style.transform='scale(1)'">
                <div style="font-size:22px;">🔄</div>
                <div style="font-size:11px; color:#8b5cf6; font-weight:600;">Chuyển lớp GV</div>
            </div>`;
        }
        statsContainer.innerHTML = statsHtml;
    }

    // --- FILTER ---
    const filterClass = document.getElementById('clb-filter-class')?.value || '';
    const filterStatus = document.getElementById('clb-filter-status')?.value || 'active';
    const search = (document.getElementById('clb-search')?.value || '').trim().toLowerCase();

    // Reset trang khi filter/search thay đổi
    const filterKey = `${filterClass}|${filterStatus}|${search}`;
    if (window._clbLastFilterKey !== filterKey) {
        window._clbCurrentPage = 1;
        window._clbLastFilterKey = filterKey;
    }

    // HLV chỉ thấy VĐV được gán cho mình
    let filtered = clbAthletesCache;
    if (currentUserRole === 'TEACHER') {
        filtered = filtered.filter(a => a.assignedCoachId === currentUserId);
    }

    if (filterClass) filtered = filtered.filter(a => a.classLevel === filterClass);
    if (filterStatus === 'active') filtered = filtered.filter(a => !a.isExpired && !a.isFrozen);
    else if (filterStatus === 'frozen') filtered = filtered.filter(a => a.isFrozen);
    else if (filterStatus === 'expired') filtered = filtered.filter(a => a.isExpired);
    if (search) filtered = filtered.filter(a => a.name.toLowerCase().includes(search) || (a.phone || '').includes(search) || (a.contractNumber || '').toLowerCase().includes(search));

    // Filter theo GV (khi bấm card tách lớp)
    const coachFilter = window._clbFilterCoachId || '';
    if (coachFilter === '__unassigned__') {
        filtered = filtered.filter(a => !a.assignedCoachId);
    } else if (coachFilter) {
        filtered = filtered.filter(a => a.assignedCoachId === coachFilter);
    }
    // Filter theo Ca (khi bấm card ca)
    const shiftFilter = window._clbFilterShift || '';
    if (shiftFilter) {
        filtered = filtered.filter(a => a.clbShift === shiftFilter);
    }
    // Reset filters khi đổi lớp
    if (!filterClass) { window._clbFilterCoachId = ''; window._clbFilterShift = ''; }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">Không có VĐV nào.</td></tr>`;
        return;
    }

    // Sắp xếp theo ngày thêm (mới nhất trước)
    filtered.sort((a, b) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt || 0);
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt || 0);
        return tB - tA;
    });

    // Pagination: hiện 10 VĐV mỗi lần
    const PAGE_SIZE = 10;
    const currentPage = window._clbCurrentPage || 1;
    const showCount = currentPage * PAGE_SIZE;
    const visibleItems = filtered.slice(0, showCount);
    const hasMore = filtered.length > showCount;

    let html = '';
    visibleItems.forEach(a => {
        const levelIdx = CLB_LEVELS.indexOf(a.classLevel);
        const canPromote = levelIdx < CLB_LEVELS.length - 1 && !a.isExpired && !a.isFrozen;
        const nextLevel = canPromote ? CLB_LEVELS[levelIdx + 1] : null;
        const canDemote = levelIdx > 0 && !a.isExpired && !a.isFrozen;
        const prevLevel = canDemote ? CLB_LEVELS[levelIdx - 1] : null;

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
        if (canDemote) {
            actionsHtml += `<button class="btn btn-sm" onclick="demoteAthlete('${a.id}', '${a.classLevel}')" style="font-size:11px; padding:4px 8px; background:rgba(245,158,11,0.1); color:#d97706; border:1px solid rgba(245,158,11,0.3);"><i class="fa-solid fa-arrow-down"></i> ${prevLevel}</button>`;
        }
        if (canPromote) {
            actionsHtml += `<button class="btn btn-sm" onclick="promoteAthlete('${a.id}', '${a.classLevel}')" style="font-size:11px; padding:4px 8px; background:rgba(16,185,129,0.1); color:#10b981; border:1px solid rgba(16,185,129,0.3);"><i class="fa-solid fa-arrow-up"></i> ${nextLevel}</button>`;
        }
        if (!a.isExpired && !a.isFrozen && a.activatedAt && (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER')) {
            actionsHtml += ` <button class="btn btn-sm" onclick="extendAthlete('${a.id}')" style="font-size:11px; padding:4px 8px; background:rgba(245,158,11,0.1); color:#d97706; border:1px solid rgba(245,158,11,0.3);"><i class="fa-solid fa-calendar-plus"></i></button>`;
            actionsHtml += ` <button class="btn btn-sm" onclick="freezeAthlete('${a.id}')" style="font-size:11px; padding:4px 8px; background:rgba(99,102,241,0.1); color:#6366f1; border:1px solid rgba(99,102,241,0.3);"><i class="fa-solid fa-pause"></i> BL</button>`;
        }
        if (a.isFrozen && (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER')) {
            actionsHtml += ` <button class="btn btn-sm" onclick="unfreezeAthlete('${a.id}')" style="font-size:11px; padding:4px 8px; background:rgba(34,197,94,0.1); color:#16a34a; border:1px solid rgba(34,197,94,0.3);"><i class="fa-solid fa-play"></i> Mở BL</button>`;
        }
        if (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') {
            actionsHtml += ` <button class="btn btn-sm" onclick="editAthlete('${a.id}')" style="font-size:11px; padding:4px 8px; background:rgba(59,130,246,0.1); color:#3b82f6; border:1px solid rgba(59,130,246,0.3);"><i class="fa-solid fa-pen"></i></button>`;
            actionsHtml += ` <button class="btn btn-sm" onclick="deleteAthlete('${a.id}', '${a.name.replace(/'/g, "\\\\'")}')" style="font-size:11px; padding:4px 8px; background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.3);"><i class="fa-solid fa-trash"></i></button>`;
            actionsHtml += ` <button class="btn btn-sm" onclick="assignCoachToAthlete('${a.id}', '${a.name.replace(/'/g, "\\\\'")}', '${a.classLevel}')" style="font-size:11px; padding:4px 8px; background:rgba(139,92,246,0.1); color:#8b5cf6; border:1px solid rgba(139,92,246,0.3);" title="Gán GV"><i class="fa-solid fa-user-tag"></i> ${a.assignedCoachName || ''}</button>`;
        }

        html += `
            <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:12px 15px;">
                    <div style="font-weight:600; color:var(--text-color);">${a.name} <span style="font-size:11px; color:var(--text-muted);">(${a.gender || 'N/A'})</span></div>
                    ${a.phone ? `<div style="font-size:12px; color:var(--text-muted);">${a.phone}</div>` : ''}
                    ${a.contractNumber ? `<div style="font-size:11px; color:var(--text-muted);">HĐ: ${a.contractNumber}</div>` : ''}
                    <div style="font-size:11px; color:var(--primary); font-weight:600;">Đã học: ${a.totalAttendance || 0} buổi</div>
                    ${a.creatorName ? `<div style="font-size:11px; color:var(--text-muted);"><i class="fa-solid fa-user-tag"></i> Sale: ${a.creatorName} ${(currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') ? `<button onclick="changeSaleForAthlete('${a.id}')" style="margin-left:4px; padding:1px 5px; border:none; background:rgba(59,130,246,0.1); color:#3b82f6; border-radius:3px; cursor:pointer; font-size:10px;" title="Đổi Sale"><i class="fa-solid fa-right-left"></i></button>` : ''}</div>` : ''}
                    <div style="margin-top:4px;">
                        ${(currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER')
                ? `<textarea id="note-${a.id}" placeholder="📝 Phương án vào bể..." onblur="saveAthleteNote('${a.id}', this.value)" style="width:100%; min-height:28px; max-height:60px; padding:4px 6px; font-size:11px; border:1px solid var(--border-color); border-radius:5px; background:var(--card-bg); color:var(--text-color); resize:vertical; box-sizing:border-box;">${(a.athleteNote || '').replace(/</g, '&lt;')}</textarea>`
                : (a.athleteNote ? `<div style="font-size:11px; color:#10b981; padding:4px 6px; background:rgba(16,185,129,0.05); border-radius:5px; border:1px solid rgba(16,185,129,0.15);"><i class="fa-solid fa-clipboard"></i> ${(a.athleteNote || '').replace(/</g, '&lt;')}</div>` : `<div style="font-size:11px; color:var(--text-muted); padding:4px 6px;">— Chưa có ghi chú</div>`)
            }
                    </div>
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

    // Nút "Xem thêm" hoặc "Đã hiện hết"
    if (hasMore) {
        html += `<tr><td colspan="6" style="text-align:center; padding:12px;">
            <button onclick="window._clbCurrentPage = ${currentPage + 1}; renderClbTable();"
                style="padding:8px 24px; border-radius:8px; border:1px solid var(--primary); background:rgba(37,99,235,0.1); color:var(--primary); font-weight:600; cursor:pointer; font-size:13px;">
                <i class="fa-solid fa-chevron-down"></i> Xem thêm (${Math.min(filtered.length - showCount, PAGE_SIZE)} VĐV nữa)
            </button>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Đang hiện ${showCount}/${filtered.length} VĐV</div>
        </td></tr>`;
    } else if (filtered.length > PAGE_SIZE) {
        html += `<tr><td colspan="6" style="text-align:center; padding:8px; font-size:12px; color:var(--text-muted);">
            Đã hiện tất cả ${filtered.length} VĐV
        </td></tr>`;
    }

    tbody.innerHTML = html;

    // Set max-height cho bảng có scroll
    const tableWrapper = tbody.closest('.table-responsive') || tbody.closest('div');
    if (tableWrapper) {
        tableWrapper.style.maxHeight = '600px';
        tableWrapper.style.overflowY = 'auto';
    }
    renderClbTodayAttendance(); // Hiện danh sách điểm danh hôm nay
};

// Lưu ghi chú VĐV CLB (phương án vào bể)
window.saveAthleteNote = async function (athleteId, note) {
    try {
        await db.collection('athletes').doc(athleteId).update({ athleteNote: note.trim() });
    } catch (e) {
        console.error('Lỗi lưu ghi chú VĐV:', e);
    }
};

// Chuyển cấp VĐV
// Gán GV cho VĐV CLB — hỗ trợ Lớp-Ca
window.assignCoachToAthlete = async function (athleteId, athleteName, classLevel) {
    try {
        const brId = currentBranchId || currentUserBranchId;
        const coachDocs = (localState.teachers || []).filter(u => u.isCoach && u.branchId === brId);
        const entries = [];
        coachDocs.forEach(u => {
            (u.coachClasses || []).forEach(cl => {
                let base = cl, shift = '';
                if (cl.includes('-Ca')) {
                    const idx = cl.lastIndexOf('-Ca');
                    base = cl.substring(0, idx);
                    shift = cl.substring(idx + 3); // '1','2'...
                }
                if (base === classLevel) {
                    const label = shift ? `${u.name || 'HLV'} (Ca ${shift})` : (u.name || 'HLV');
                    entries.push({ id: u.id, name: u.name || 'HLV', shift, label });
                }
            });
        });

        if (entries.length === 0) {
            alert(`⚠️ Chưa có HLV nào phụ trách Lớp ${classLevel}!\n\nVào Quản lý Nhân sự → bấm nút HLV để gán lớp cho GV.`);
            return;
        }

        let options = entries.map((c, i) => `${i + 1}. ${c.label}`).join('\n');
        options += `\n0. Bỏ gán GV`;
        const choice = prompt(`🏅 Gán GV cho "${athleteName}" (Lớp ${classLevel})\n\nChọn GV + Ca:\n${options}`);
        if (choice === null) return;

        const idx = parseInt(choice);
        if (idx === 0) {
            await db.collection('athletes').doc(athleteId).update({
                assignedCoachId: firebase.firestore.FieldValue.delete(),
                assignedCoachName: firebase.firestore.FieldValue.delete(),
                coachName: firebase.firestore.FieldValue.delete()
            });
            alert(`✅ Đã bỏ gán GV cho "${athleteName}"`);
        } else if (idx >= 1 && idx <= entries.length) {
            const target = entries[idx - 1];
            const updateData = {
                assignedCoachId: target.id,
                assignedCoachName: target.name,
                coachName: target.name
            };
            if (target.shift) updateData.clbShift = target.shift;
            await db.collection('athletes').doc(athleteId).update(updateData);
            const shiftText = target.shift ? ` (Ca ${target.shift})` : '';
            alert(`✅ Đã gán "${athleteName}" cho HLV ${target.name}${shiftText}`);
        } else {
            alert('Lựa chọn không hợp lệ!');
            return;
        }
        renderClbTable();
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

window.promoteAthlete = async function (athleteId, currentLevel) {
    const idx = CLB_LEVELS.indexOf(currentLevel);
    if (idx >= CLB_LEVELS.length - 1) return alert('VĐV đã ở cấp cao nhất (A)!');
    const nextLevel = CLB_LEVELS[idx + 1];
    if (!confirm(`⬆️ Chuyển VĐV lên lớp ${nextLevel}?`)) return;
    await db.collection('athletes').doc(athleteId).update({ classLevel: nextLevel });
    alert(`✅ Đã chuyển lên lớp ${nextLevel}!`);
};

// Chuyển cấp VĐV xuống
window.demoteAthlete = async function (athleteId, currentLevel) {
    const idx = CLB_LEVELS.indexOf(currentLevel);
    if (idx <= 0) return alert('VĐV đã ở cấp thấp nhất (Mầm)!');
    const prevLevel = CLB_LEVELS[idx - 1];
    if (!confirm(`⬇️ Chuyển VĐV xuống lớp ${prevLevel}?`)) return;
    await db.collection('athletes').doc(athleteId).update({ classLevel: prevLevel });
    alert(`✅ Đã chuyển xuống lớp ${prevLevel}!`);
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
            const oldBonus = d.bonusDays || 0;
            batch.update(doc.ref, { expiresAt: exp, bonusDays: oldBonus + days });
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
        const oldBonus = d.bonusDays || 0;
        await db.collection('athletes').doc(athleteId).update({ expiresAt: exp, bonusDays: oldBonus + days });
        alert(`✅ Đã gia hạn ${days} ngày cho ${d.name}! Hạn mới: ${exp.toLocaleDateString('vi-VN')}\n📊 Tổng ngày gia hạn: ${oldBonus + days} ngày`);
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
        const oldBonus = d.bonusDays || 0;

        await db.collection('athletes').doc(athleteId).update({
            isFrozen: false,
            frozenAt: null,
            frozenUntil: null,
            expiresAt: exp,
            isExpired: false,
            bonusDays: oldBonus + 30
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

        // Cho Admin sửa ngày kích hoạt
        const currentActivated = a.activatedAt?.toDate ? a.activatedAt.toDate() : null;
        const currentDateStr = currentActivated
            ? `${currentActivated.getFullYear()}-${String(currentActivated.getMonth() + 1).padStart(2, '0')}-${String(currentActivated.getDate()).padStart(2, '0')}`
            : '';
        const newDateStr = prompt(`Ngày kích hoạt (YYYY-MM-DD):`, currentDateStr);
        if (newDateStr === null) return;

        const updates = {
            name: name.trim() || a.name,
            phone: phone.trim(),
            gender: gender.trim() || 'Nam',
            classLevel: ALL_CLB.includes(classLevel.trim()) ? classLevel.trim() : a.classLevel,
            contractNumber: contractNumber.trim() || 'Chưa có',
            sessionsPerWeek: parseInt(sessionsPerWeek) || a.sessionsPerWeek,
            contractMonths: parseInt(contractMonths) || a.contractMonths
        };

        // Cập nhật ngày kích hoạt + tự tính ngày hết hạn (giữ bonusDays)
        if (newDateStr.trim()) {
            const newDate = new Date(newDateStr.trim());
            if (!isNaN(newDate.getTime())) {
                updates.activatedAt = newDate;
                const months = parseInt(contractMonths) || a.contractMonths || 3;
                const bonus = a.bonusDays || 0;
                const expires = new Date(newDate);
                expires.setMonth(expires.getMonth() + months);
                expires.setDate(expires.getDate() - 1); // HSD = kích hoạt + N tháng - 1 ngày
                if (bonus > 0) {
                    expires.setDate(expires.getDate() + bonus); // Cộng lại ngày gia hạn
                }
                updates.expiresAt = expires;
                updates.isExpired = expires < new Date();
                if (bonus > 0) {
                    alert(`ℹ️ VĐV có ${bonus} ngày gia hạn → đã tự cộng lại vào HSD mới.`);
                }
            }
        }

        await db.collection('athletes').doc(athleteId).update(updates);

        // Auto sync sửa VĐV CLB lên Google Sheet
        try {
            const brNameSync = FIXED_BRANCHES.find(b => b.id === (a.branchId || currentBranchId || currentUserBranchId))?.name || 'N/A';
            const expDate = updates.expiresAt || (a.expiresAt?.toDate ? a.expiresAt.toDate() : null);
            const actDate = updates.activatedAt || (a.activatedAt?.toDate ? a.activatedAt.toDate() : null);
            syncClbRowToSheet({
                action: 'updateClbRow',
                branchName: 'CLB_' + brNameSync,
                oldName: a.name,
                oldContractNumber: a.contractNumber || '',
                name: updates.name || a.name,
                phone: updates.phone !== undefined ? updates.phone : (a.phone || ''),
                contractNumber: updates.contractNumber || a.contractNumber || '',
                athleteClass: updates.classLevel || a.classLevel || '',
                pkg: `${updates.sessionsPerWeek || a.sessionsPerWeek || 3} buổi/tuần × ${updates.contractMonths || a.contractMonths || 3} tháng`,
                activatedAt: actDate ? (actDate instanceof Date ? actDate.toLocaleDateString('vi-VN') : '') : 'Chưa KH',
                expiresAt: expDate ? (expDate instanceof Date ? expDate.toLocaleDateString('vi-VN') : '') : 'N/A'
            });
        } catch (syncErr) { console.warn('CLB Sheet sync edit:', syncErr); }

        alert(`✅ Đã cập nhật thông tin ${updates.name}!\n📤 Đã đồng bộ lên Sheet.`);
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
                    expiresAt = new Date(y, m + contractMonths, d - 1); // HSD = kích hoạt + N tháng - 1 ngày
                }
            }

            try {
                // Kiểm tra trùng số hợp đồng
                if (contractNumber && contractNumber !== 'Chưa có') {
                    const dupMsg = await checkDuplicateContract(contractNumber, brId);
                    if (dupMsg) { errors.push(`Dòng ${i + 2}: ${dupMsg}`); continue; }
                }

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
        const _expDate = a.expiresAt && (a.expiresAt.toDate ? a.expiresAt.toDate() : new Date(a.expiresAt));
        const _endOfExpDay = _expDate ? new Date(_expDate.getFullYear(), _expDate.getMonth(), _expDate.getDate(), 23, 59, 59) : null;
        const isExpired = a.isExpired || (_endOfExpDay && new Date() > _endOfExpDay);

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

        const shiftBadge = a.clbShift ? ` <span style="background:rgba(245,158,11,0.15); color:#d97706; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;">Ca ${a.clbShift}</span>` : '';
        const coachBadge = (a.assignedCoachName || a.coachName) ? ` <span style="background:rgba(139,92,246,0.1); color:#8b5cf6; padding:2px 6px; border-radius:4px; font-size:11px;">👨‍🏫 ${a.assignedCoachName || a.coachName}</span>` : '';

        return `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:12px 15px; border:1px solid var(--border-color); border-radius:10px; margin-bottom:8px; background:var(--card-bg);">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600;">${a.name} ${a.creatorName ? `<span style="font-size:11px; color:#8b5cf6; font-weight:500;">(${a.creatorName})</span>` : ''} <span style="background:${levelColor}; color:#fff; padding:2px 6px; border-radius:4px; font-size:11px;">${a.classLevel}</span>${shiftBadge}${coachBadge}</div>
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
                <button class="btn btn-sm btn-primary clb-att-btn" id="clb-att-btn-${a.id}" onclick="markClbAttendance('${a.id}')" style="font-size:12px; padding:6px 14px; white-space:nowrap; flex-shrink:0; margin-left:8px;" ${isExpired ? 'disabled style="opacity:0.5;"' : ''}>
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
    // Chặn bấm trùng — lock + cooldown 5s theo athleteId
    if (!window._attLock) window._attLock = {};
    const lockTime = window._attLock[athleteId];
    if (lockTime && (Date.now() - lockTime) < 5000) return; // Cooldown 5s
    window._attLock[athleteId] = Date.now();

    // Disable button ngay
    const btn = document.getElementById('clb-att-btn-' + athleteId);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...'; }

    try {
        // Chạy song song 3 queries để tăng tốc
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const now = new Date();
        const startOfWeek = new Date(now);
        const day = startOfWeek.getDay();
        startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
        startOfWeek.setHours(0, 0, 0, 0);

        let docSnap, todayAttendance, weekAttendance;
        try {
            [docSnap, todayAttendance, weekAttendance] = await Promise.all([
                db.collection('athletes').doc(athleteId).get(),
                db.collection('clb_attendance').where('athleteId', '==', athleteId).where('timestamp', '>=', today).get(),
                db.collection('clb_attendance').where('athleteId', '==', athleteId).where('timestamp', '>=', startOfWeek).get()
            ]);
        } catch (queryErr) {
            console.warn('Composite index missing, falling back:', queryErr.message);
            // Fallback: chỉ query athlete + lọc client-side
            docSnap = await db.collection('athletes').doc(athleteId).get();
            const allAtt = await db.collection('clb_attendance').where('athleteId', '==', athleteId).orderBy('timestamp', 'desc').limit(20).get();
            const todayDocs = allAtt.docs.filter(d => {
                const ts = d.data().timestamp?.toDate?.();
                return ts && ts >= today;
            });
            const weekDocs = allAtt.docs.filter(d => {
                const ts = d.data().timestamp?.toDate?.();
                return ts && ts >= startOfWeek;
            });
            todayAttendance = { size: todayDocs.length, docs: todayDocs };
            weekAttendance = { size: weekDocs.length, docs: weekDocs };
        }

        if (!docSnap.exists) return alert('Không tìm thấy VĐV!');
        const a = docSnap.data();

        // Check hết hạn
        if (a.isExpired) return alert('❌ HĐ đã hết hạn!');
        if (a.isFrozen) return alert('⏸ VĐV đang bảo lưu, không thể điểm danh!');
        if (a.expiresAt) {
            const exp = a.expiresAt.toDate ? a.expiresAt.toDate() : new Date(a.expiresAt);
            const endOfExpDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate(), 23, 59, 59);
            if (new Date() > endOfExpDay) {
                await db.collection('athletes').doc(athleteId).update({ isExpired: true });
                return alert('❌ HĐ đã hết hạn!');
            }
        }

        // Check đã điểm danh hôm nay — tối đa 2 lần/ngày
        if (todayAttendance.size >= 2) {
            return alert(`❌ VĐV "${a.name}" đã điểm danh đủ 2 lần hôm nay. Không thể điểm danh thêm!`);
        }

        // Check khoảng cách 30 phút giữa 2 lần điểm danh
        if (todayAttendance.size >= 1) {
            const lastRecord = todayAttendance.docs
                .map(d => d.data().timestamp?.toDate?.())
                .filter(Boolean)
                .sort((a, b) => b - a)[0];
            if (lastRecord) {
                const diffMinutes = (new Date() - lastRecord) / 60000;
                if (diffMinutes < 30) {
                    const remaining = Math.ceil(30 - diffMinutes);
                    return alert(`⏳ VĐV "${a.name}" đã điểm danh lần 1 lúc ${lastRecord.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})}.\n\nCần chờ thêm ${remaining} phút nữa mới được điểm danh lần 2.`);
                }
            }
            if (!confirm(`⚠️ VĐV "${a.name}" đã điểm danh 1 lần hôm nay.\n\nXác nhận điểm danh lần 2?`)) return;
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
            expDate.setDate(expDate.getDate() - 1); // HSD = kích hoạt + N tháng - 1 ngày
            updates.expiresAt = expDate;
            alert(`🎯 Kích hoạt HĐ! Hết hạn: ${expDate.toLocaleDateString('vi-VN')}`);

            // Đồng bộ ngày kích hoạt + HSD về Google Sheet
            try {
                const branchObj = FIXED_BRANCHES.find(b => b.id === (a.branchId || currentBranchId || currentUserBranchId));
                const tabName = 'CLB_' + (branchObj?.name || 'Khác');
                syncClbRowToSheet({
                    action: 'updateClbRow',
                    branchName: tabName,
                    oldName: a.name,
                    name: a.name,
                    phone: a.phone || '',
                    contractNumber: a.contractNumber || '',
                    athleteClass: a.athleteClass || a.classLevel || '',
                    pkg: `${a.sessionsPerWeek || 3} buổi/tuần × ${a.contractMonths || 3} tháng`,
                    activatedAt: new Date().toLocaleDateString('vi-VN'),
                    expiresAt: expDate.toLocaleDateString('vi-VN')
                });
                console.log(`📊 [Sheet] Đồng bộ kích hoạt CLB: ${a.name} | KH: ${new Date().toLocaleDateString('vi-VN')} | HSD: ${expDate.toLocaleDateString('vi-VN')}`);
            } catch (sheetErr) { console.warn('[Sheet] Lỗi sync kích hoạt CLB:', sheetErr); }
        }

        // Re-check ngay trước khi ghi để chặn race condition (nhiều tab/người bấm cùng lúc)
        try {
            const recheck = await db.collection('clb_attendance')
                .where('athleteId', '==', athleteId)
                .where('timestamp', '>=', today)
                .get();
            if (recheck.size >= 2) {
                return alert(`❌ VĐV "${a.name}" đã đủ 2 lần điểm danh!`);
            }
            if (recheck.size >= 1 && todayAttendance.size === 0) {
                return alert(`⚠️ VĐV "${a.name}" vừa được điểm danh bởi người khác!`);
            }
        } catch (recheckErr) {
            console.warn('Re-check skipped (index?):', recheckErr.message);
        }

        await Promise.all([
            db.collection('athletes').doc(athleteId).update(updates),
            db.collection('clb_attendance').add({
                athleteId,
                athleteName: a.name,
                branchId: currentBranchId || currentUserBranchId,
                classLevel: a.classLevel,
                clbShift: a.clbShift || '',
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
            const khP = [];
            khSnap.docs.forEach(doc => {
                khP.push(sendNotification(doc.id, 'clb_attendance', `🏊 VĐV "${a.name}" đã điểm danh buổi ${(a.totalAttendance || 0) + 1} tại ${brName} (${a.classLevel || 'CLB'}).`));
            });
            await Promise.all(khP);
        } catch (e) { console.warn('KH notify error:', e); }

        searchClbForAttendance(); // Refresh
        renderLetanClbManageTable(); // Refresh management table
    } catch (e) {
        alert('Lỗi điểm danh: ' + e.message);
    } finally {
        // Giữ lock thêm 5s sau khi xong (cooldown) rồi xóa
        setTimeout(() => { delete window._attLock?.[athleteId]; }, 5000);
        // Refresh list + re-enable button
        try { searchClbForAttendance(); } catch(e) {}
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

        // === THỐNG KÊ THEO CA ===
        const shiftCounts = {};
        let noShift = 0;
        todayDocs.forEach(doc => {
            const d = doc.data();
            const shift = d.clbShift || d.shift;
            if (shift) {
                shiftCounts[shift] = (shiftCounts[shift] || 0) + 1;
            } else {
                noShift++;
            }
        });
        const shiftKeys = Object.keys(shiftCounts).sort((a, b) => Number(a) - Number(b));
        if (shiftKeys.length > 0 || noShift > 0) {
            html += `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; padding:10px 14px; background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.2); border-radius:10px;">`;
            html += `<div style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#d97706;"><i class="fa-solid fa-clock"></i> Tổng theo ca:</div>`;
            shiftKeys.forEach(sk => {
                html += `<div style="background:rgba(245,158,11,0.15); color:#b45309; padding:4px 12px; border-radius:6px; font-size:13px; font-weight:700;">Ca ${sk}: <span style="color:#d97706;">${shiftCounts[sk]}</span></div>`;
            });
            if (noShift > 0) {
                html += `<div style="background:rgba(107,114,128,0.1); color:#6b7280; padding:4px 12px; border-radius:6px; font-size:13px; font-weight:700;">Chưa có ca: <span>${noShift}</span></div>`;
            }
            html += `<div style="margin-left:auto; background:rgba(37,99,235,0.1); color:var(--primary); padding:4px 12px; border-radius:6px; font-size:13px; font-weight:700;">Tổng: <span>${todayDocs.length}</span></div>`;
            html += `</div>`;
        }

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
            container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;"><i class="fa-solid fa-calendar-xmark" style="font-size:20px; display:block; margin-bottom:6px; opacity:0.3;"></i>Không có VĐV điểm danh ngày <b>' + dateLabel + '</b></div>';
            return;
        }

        const byClass = {};
        dayDocs.forEach(doc => {
            const d = doc.data();
            const cl = d.classLevel || '?';
            if (!byClass[cl]) byClass[cl] = [];
            byClass[cl].push(d);
        });

        const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' };

        let html = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
            '<span style="font-size:13px; font-weight:600; color:var(--text-color);">📅 ' + dateLabel + '</span>' +
            '<span style="font-size:12px; background:rgba(139,92,246,0.12); color:#8b5cf6; padding:3px 10px; border-radius:8px; font-weight:700;">' + dayDocs.length + ' VĐV</span>' +
            '</div>';

        Object.keys(byClass).sort().forEach(cl => {
            const students = byClass[cl];
            const lc = levelColor[cl] || '#6b7280';
            html += '<div style="margin-bottom:8px;">' +
                '<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">' +
                '<span style="background:' + lc + '; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700;">Lớp ' + cl + '</span>' +
                '<span style="font-size:11px; color:var(--text-muted);">' + students.length + ' VĐV</span>' +
                '</div>';
            students.forEach(d => {
                const ts = d.timestamp?.toDate ? d.timestamp.toDate() : null;
                const time = ts ? ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
                const confirmed = d.coachConfirmed ? '<span style="font-size:10px; color:#10b981;"><i class="fa-solid fa-circle-check"></i> ' + (d.coachConfirmedName || 'HLV') + '</span>' : '<span style="font-size:10px; color:var(--text-muted);">Chưa XN</span>';
                html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 8px; border-bottom:1px dashed var(--border-color); font-size:12px;">' +
                    '<span style="font-weight:500;">' + (d.athleteName || 'VĐV') + '</span>' +
                    '<div style="display:flex; gap:10px; align-items:center;">' +
                    '<span style="color:var(--text-muted);"><i class="fa-solid fa-clock"></i> ' + time + '</span>' +
                    confirmed +
                    '</div></div>';
            });
            html += '</div>';
        });

        container.innerHTML = html;
    } catch (e) {
        console.error('renderClbHistoryAttendance error:', e);
        container.innerHTML = '<div style="text-align:center; padding:15px; color:#ef4444;">Lỗi tải dữ liệu.</div>';
    }
};

// Hiện danh sách VĐV điểm danh hôm nay (tab CLB) + nút xác nhận HLV — nhóm theo CA
window.renderClbTodayAttendance = async function () {
    const container = document.getElementById('clb-today-attendance');
    console.log('[CLB-DEBUG] renderClbTodayAttendance called, container:', !!container, 'role:', currentUserRole);
    if (!container) return;

    // Lưu scroll position và trạng thái mở rộng trước khi re-render
    const scrollPos = window.scrollY;
    const openSections = [];
    document.querySelectorAll('[id^="clb-shift-sec-"]').forEach(el => {
        if (el.style.display !== 'none') openSections.push(el.id);
    });

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

        // HLV thấy VĐV được gán cho mình HOẶC thuộc lớp mình dạy
        let filteredDocs = todayDocs;
        if (currentUserRole === 'TEACHER') {
            const cc = (window._currentUserData?.coachClasses || []).map(c => c.includes('-Ca') ? c.substring(0, c.lastIndexOf('-Ca')) : c);
            const myAthleteIds = new Set(clbAthletesCache.filter(a => a.assignedCoachId === currentUserId || cc.includes(a.classLevel)).map(a => a.id));
            filteredDocs = todayDocs.filter(d => myAthleteIds.has(d.data().athleteId) || cc.includes(d.data().classLevel));
            console.log('[CLB-DEBUG] TEACHER:', currentUserId, 'coachClasses:', cc, 'cacheSize:', clbAthletesCache.length, 'todayDocs:', todayDocs.length, 'filtered:', filteredDocs.length, 'myAthleteIds:', myAthleteIds.size);
        }

        if (filteredDocs.length === 0) {
            if (currentUserRole === 'TEACHER') {
                container.innerHTML = '<div style="padding:12px; text-align:center; color:#f59e0b; font-size:12px;">[DEBUG] Không tìm thấy VĐV: role=' + currentUserRole + ', coachClasses=' + JSON.stringify(window._currentUserData?.coachClasses) + ', cache=' + clbAthletesCache.length + ', todayDocs=' + todayDocs.length + ', branchId=' + brId + '</div>';
            } else {
                container.innerHTML = '';
            }
            return;
        }

        // Lấy thông tin athleteNote song song
        const athleteIds = [...new Set(filteredDocs.map(d => d.data().athleteId))];
        const noteMap = {};
        const shiftMap = {};
        const noteDocs = await Promise.all(athleteIds.map(aid => db.collection('athletes').doc(aid).get()));
        noteDocs.forEach(aDoc => {
            if (aDoc.exists) {
                const ad = aDoc.data();
                noteMap[aDoc.id] = ad.athleteNote || '';
                shiftMap[aDoc.id] = { shift: ad.clbShift || '', coach: ad.assignedCoachName || ad.coachName || '' };
            }
        });

        const levelColor = { 'Mầm': '#ec4899', 'D1': '#3b82f6', 'D2': '#8b5cf6', 'C': '#f59e0b', 'B': '#ef4444', 'A': '#10b981' };
        const SESSION_MINUTES = 90;

        // Định nghĩa ca
        const SHIFTS = {
            '1': { label: 'Ca 1', time: '7:00 – 9:00', from: 7, to: 9 },
            '2': { label: 'Ca 2', time: '17:00 – 19:00', from: 17, to: 19 },
            '3': { label: 'Ca 3', time: '18:30 – 20:30', from: 18.5, to: 20.5 },
        };

        // Xác định ca hiện tại theo giờ
        const currentHour = now.getHours() + now.getMinutes() / 60;
        let currentShift = '';
        for (const [sk, sv] of Object.entries(SHIFTS)) {
            if (currentHour >= sv.from - 0.5 && currentHour <= sv.to + 0.5) {
                currentShift = sk;
            }
        }

        // Nhóm theo ca
        const shiftGroups = {};
        const noShiftGroup = [];
        filteredDocs.forEach(doc => {
            const d = doc.data();
            const athleteShift = (shiftMap[d.athleteId]?.shift || d.clbShift || '').toString();
            if (athleteShift && SHIFTS[athleteShift]) {
                if (!shiftGroups[athleteShift]) shiftGroups[athleteShift] = [];
                shiftGroups[athleteShift].push(doc);
            } else {
                noShiftGroup.push(doc);
            }
        });

        const shiftOrder = Object.keys(SHIFTS).sort((a, b) => Number(a) - Number(b));

        let html = '<div style="background:var(--card-bg); border:1px solid var(--border-color); border-radius:12px; padding:14px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
            '<h4 style="margin:0; font-size:14px; color:var(--text-color);"><i class="fa-solid fa-clipboard-check" style="color:#10b981;"></i> Điểm danh hôm nay (' + filteredDocs.length + ')</h4>' +
            '<button onclick="renderClbTodayAttendance()" style="border:none; background:rgba(37,99,235,0.1); color:var(--primary); padding:4px 10px; border-radius:6px; font-size:11px; cursor:pointer;"><i class="fa-solid fa-refresh"></i> Làm mới</button>' +
            '</div>';

        // Thanh tổng kết ca (chỉ hiển thị, không click)
        html += '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">';
        shiftOrder.forEach(sk => {
            const cnt = (shiftGroups[sk] || []).length;
            const isCur = sk === currentShift;
            html += '<div style="user-select:none; background:' + (isCur ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.1)') + '; color:#b45309; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:700; ' + (isCur ? 'border:2px solid #f59e0b;' : 'border:1px solid rgba(245,158,11,0.2);') + '">' +
                SHIFTS[sk].label + ': <span style="color:#d97706; font-size:14px;">' + cnt + '</span> ' +
                '<span style="font-size:10px; font-weight:500; color:#92400e;">(' + SHIFTS[sk].time + ')</span>' +
                (isCur ? ' <span style="font-size:10px; color:#059669; font-weight:600;">← đang diễn ra</span>' : '') +
                '</div>';
        });
        if (noShiftGroup.length > 0) {
            html += '<div style="user-select:none; background:rgba(107,114,128,0.1); color:#6b7280; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:700; border:1px solid rgba(107,114,128,0.2);">Chưa có ca: <span style="font-size:14px;">' + noShiftGroup.length + '</span></div>';
        }
        html += '</div>';

        // Helper render 1 entry
        const renderEntry = (doc) => {
            const d = doc.data();
            const ts = d.timestamp?.toDate ? d.timestamp.toDate() : null;
            const time = ts ? ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
            const diffMin = ts ? Math.floor((now - ts) / 60000) : 999;
            const isActive = diffMin < SESSION_MINUTES;
            const remaining = SESSION_MINUTES - diffMin;
            const lc = levelColor[d.classLevel] || '#6b7280';
            const note = noteMap[d.athleteId] || '';
            const aInfo = shiftMap[d.athleteId] || {};
            const confirmed = d.coachConfirmed || false;
            const eName = (d.athleteName || 'VĐV').replace(/'/g, "\\'");

            let row = '<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border:1px solid ' + (isActive ? 'rgba(34,197,94,0.3)' : 'var(--border-color)') + '; border-radius:8px; margin-bottom:5px; background:' + (isActive ? 'rgba(34,197,94,0.03)' : 'var(--card-bg)') + '; ' + (!isActive ? 'opacity:0.6;' : '') + '">';
            row += '<div style="flex:1;"><div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">';
            if (isActive) row += '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#16a34a; animation:pulse 1.5s infinite;"></span>';
            row += '<span style="background:' + lc + '; color:#fff; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:700;">' + (d.classLevel || '?') + '</span>';
            row += '<span style="font-weight:600; font-size:13px; color:var(--text-color);">' + (d.athleteName || 'VĐV') + '</span>';
            row += '<span style="font-size:11px; color:var(--text-muted);"><i class="fa-solid fa-clock"></i> ' + time + '</span>';
            row += isActive ? '<span style="font-size:11px; color:#16a34a; font-weight:600;">Còn ' + remaining + 'p</span>' : '<span style="font-size:11px; color:var(--text-muted);">Xong</span>';
            if (aInfo.coach) row += '<span style="font-size:10px; color:#8b5cf6;">👨‍🏫 ' + aInfo.coach + '</span>';
            if (confirmed) row += '<span style="font-size:11px; color:#10b981; font-weight:600;"><i class="fa-solid fa-circle-check"></i> HLV đã xác nhận</span>';
            row += '</div>';
            if (note) row += '<div style="font-size:11px; color:#10b981; margin-top:3px;"><i class="fa-solid fa-clipboard"></i> ' + note + '</div>';
            row += '</div>';
            if ((currentUserRole === 'TEACHER' || currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') && !confirmed) {
                row += '<button onclick="confirmAttendanceCoach(\'' + doc.id + '\')" style="border:none; background:rgba(16,185,129,0.15); color:#10b981; padding:5px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; border:1px solid rgba(16,185,129,0.3);"><i class="fa-solid fa-check"></i> Xác nhận</button>';
            }
            if (diffMin <= 20) {
                row += '<button onclick="cancelClbAttendance(\'' + doc.id + '\', \'' + eName + '\')" style="border:none; background:rgba(239,68,68,0.12); color:#ef4444; padding:5px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; border:1px solid rgba(239,68,68,0.25);"><i class="fa-solid fa-xmark"></i> Huỷ (' + (20 - diffMin) + 'p)</button>';
            }
            row += '</div>';
            return row;
        };

        // Render từng ca
        shiftOrder.forEach(sk => {
            const entries = shiftGroups[sk] || [];
            if (entries.length === 0) return;
            const isCur = sk === currentShift;
            const shiftDef = SHIFTS[sk];
            html += '<div id="clb-shift-sec-' + sk + '" style="display:block; margin-bottom:12px; border:1px solid ' + (isCur ? 'rgba(245,158,11,0.4)' : 'var(--border-color)') + '; border-radius:10px; overflow:hidden;">' +
                '<div style="padding:8px 14px; background:' + (isCur ? 'rgba(245,158,11,0.12)' : 'rgba(0,0,0,0.02)') + '; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">' +
                '<span style="font-weight:700; font-size:13px; color:' + (isCur ? '#d97706' : 'var(--text-color)') + ';">' + (isCur ? '🟢' : '🕐') + ' ' + shiftDef.label + ' (' + shiftDef.time + ')</span>' +
                '<span style="font-size:12px; font-weight:700; color:' + (isCur ? '#d97706' : 'var(--text-muted)') + ';">' + entries.length + ' VĐV</span>' +
                '</div><div style="padding:8px;">' + entries.map(doc => renderEntry(doc)).join('') + '</div></div>';
        });

        // Nhóm chưa có ca
        if (noShiftGroup.length > 0) {
            html += '<div id="clb-shift-sec-none" style="display:block; margin-bottom:12px; border:1px solid var(--border-color); border-radius:10px; overflow:hidden;">' +
                '<div style="padding:8px 14px; background:rgba(0,0,0,0.02); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">' +
                '<span style="font-weight:700; font-size:13px; color:var(--text-muted);">❓ Chưa phân ca</span>' +
                '<span style="font-size:12px; font-weight:700; color:var(--text-muted);">' + noShiftGroup.length + ' VĐV</span>' +
                '</div><div style="padding:8px;">' + noShiftGroup.map(doc => renderEntry(doc)).join('') + '</div></div>';
        }

        html += '</div>';
        container.innerHTML = html;

        // Khôi phục trạng thái mở rộng
        openSections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });

        // Khôi phục scroll position sau khi render
        setTimeout(() => window.scrollTo(0, scrollPos), 0);

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
