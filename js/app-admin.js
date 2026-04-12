// ===== GreenPool App — Admin Module (v7.0) =====

function renderDashboard() {
    // Gọi auto-repair riêng biệt (debounced, chỉ 1 lần mỗi phiên)
    autoRepairQueue();

    const elStudents = document.getElementById('total-students');
    const elTeachers = document.getElementById('total-teachers');
    const elSales = document.getElementById('total-sales');
    const elNewToday = document.getElementById('total-new-today');

    if (elStudents) elStudents.textContent = localState.students.length;
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

    // Đếm HV điểm danh hôm nay theo cơ sở
    const elAttToday = document.getElementById('total-attendance-today');
    if (elAttToday && currentBranchId) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        db.collection('attendance')
            .where('branchId', '==', currentBranchId)
            .get().then(snap => {
                let count = 0;
                snap.docs.forEach(d => {
                    const ca = d.data().createdAt;
                    if (ca) {
                        const dt = ca.toDate ? ca.toDate() : new Date(ca);
                        if (dt >= todayStart) count++;
                    }
                });
                elAttToday.textContent = count;
            }).catch(e => { console.error('Attendance query error:', e); elAttToday.textContent = '—'; });
    }

    // Render Queue
    const qContainer = document.getElementById('teachers-queue');
    if (!qContainer) return;

    qContainer.innerHTML = '';
    if (localState.fixedOrder.length === 0) {
        qContainer.innerHTML = '<span class="text-muted">Hàng chờ trống...</span>';
        const sugId = document.getElementById('sale-suggested-teacher-id');
        const sugName = document.getElementById('sale-suggested-teacher');
        const btnConfirm = document.getElementById('btn-sale-confirm');
        if (sugId) sugId.value = '';
        if (sugName) sugName.innerHTML = '<span style="color:var(--danger)">Trống (Không thể phân bổ)</span>';
        if (btnConfirm) btnConfirm.disabled = true;
        return;
    }

    const ci = localState.currentIndex || 0;
    let suggestedDone = false;
    let visibleCount = 0;
    // Tạo bản copy debt để mô phỏng tiêu nợ theo thứ tự hiển thị
    const runningDebt = { ...localState.debtMap };

    // Hiển thị theo thứ tự từ currentIndex đi vòng
    for (let i = 0; i < localState.fixedOrder.length; i++) {
        const realIdx = (ci + i) % localState.fixedOrder.length;
        const teacherId = localState.fixedOrder[realIdx];
        const teacher = localState.teachers.find(t => t.id === teacherId);
        if (!teacher) continue;
        if (teacher.queuePaused) continue;

        // Số thứ tự cố định của slot này (lấy từ fixedSlotNumbers)
        const slotNum = localState.fixedSlotNumbers[realIdx] || (realIdx + 1);

        // Mô phỏng nợ theo SLOT INDEX (mỗi slot có nợ riêng)
        const slotKey = 's' + realIdx;
        const slotDebt = localState.debtMap[slotKey] || 0;
        const hasDebt = slotDebt > 0;

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

        // Auto-propose Top 1 (GV đầu tiên không có debt) vào Form Sale
        if (isCurrentTurn && !suggestedDone) {
            suggestedDone = true;
            const sugId = document.getElementById('sale-suggested-teacher-id');
            const sugName = document.getElementById('sale-suggested-teacher');
            const btnConfirm = document.getElementById('btn-sale-confirm');
            if (sugId) sugId.value = teacherId;
            const numSugLabel = `#${slotNum} `;
            if (sugName) sugName.innerHTML = `<span style="color:var(--primary)"><i class="fa-solid fa-person-swimming"></i> ${numSugLabel}${teacher.name}</span>`;
            if (btnConfirm) btnConfirm.disabled = false;
        }

        const numLabel = `<span style="font-weight:700; color:var(--primary); font-size:11px;">#${slotNum}</span> `;

        node.innerHTML = `
            <div class="t-name">${numLabel}${teacher.name}</div>
            ${hasDebt ? `<div style="font-size:10px; color:#ef4444; font-weight:600; margin-top:2px;">Nợ ${slotDebt} vòng</div>` : ''}
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
        const nextVisibleIdx = localState.fixedOrder.slice(realIdx + 1).findIndex(id => {
            const t = localState.teachers.find(tt => tt.id === id);
            return t && !t.queuePaused;
        });
        if (nextVisibleIdx !== -1) {
            const arrow = document.createElement('i');
            arrow.className = 'fa-solid fa-arrow-right';
            qContainer.appendChild(arrow);
        }
    }

    // Admin: thêm nút "Đẩy lên Top 1" cho GV cuối cùng trong hàng đợi
    if (currentUserRole === 'ADMIN' && qContainer.children.length > 0) {
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

    // Nếu chưa suggest được GV nào (tất cả debt) → normalize debt và chọn lại
    if (!suggestedDone) {
        // Kiểm tra và auto-normalize nếu tất cả active slots đều nợ
        const activeSlotKeys = [];
        for (let i = 0; i < localState.fixedOrder.length; i++) {
            const tid = localState.fixedOrder[i];
            const t = localState.teachers.find(tt => tt.id === tid);
            if (t && !t.queuePaused) {
                activeSlotKeys.push('s' + i);
            }
        }
        if (activeSlotKeys.length > 0) {
            const debtVals = activeSlotKeys.map(sk => localState.debtMap[sk] || 0);
            const allInDebt = debtVals.every(v => v > 0);
            if (allInDebt) {
                const minD = Math.min(...debtVals);
                activeSlotKeys.forEach(sk => {
                    localState.debtMap[sk] = (localState.debtMap[sk] || 0) - minD;
                    if (localState.debtMap[sk] <= 0) delete localState.debtMap[sk];
                });
                // Lưu vào Firestore
                if (currentBranchId) {
                    db.collection('queues').doc(currentBranchId).update({ debtMap: localState.debtMap })
                        .catch(e => console.error('Normalize debt error:', e));
                }
                // Re-render sau khi normalize
                renderDashboard();
                return;
            }
        }
        // Fallback: nếu vẫn không chọn được → hiện thông báo
        const sugId = document.getElementById('sale-suggested-teacher-id');
        const sugName = document.getElementById('sale-suggested-teacher');
        const btnConfirm = document.getElementById('btn-sale-confirm');
        if (sugId) sugId.value = '';
        if (sugName) sugName.innerHTML = '<span style="color:var(--danger)">Tất cả GV đang nợ vòng</span>';
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
    renderLivePool();
}

// ===================== BIỂU ĐỒ TREND HỢP ĐỒNG ===================== //
let _newContractsChartInstance = null;
window.renderNewContractsChart = function () {
    const canvas = document.getElementById('newContractsChart');
    if (!canvas) return;

    const daysStr = document.getElementById('trend-days-select')?.value || '7';
    const numDays = parseInt(daysStr, 10);
    const students = localState.students || [];

    // Tạo mảng N ngày gần nhất
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateLabels = [];
    const counts = [];
    const dateKeys = [];

    for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        const key = d.getTime();
        dateLabels.push(dateStr);
        dateKeys.push(key);
        counts.push(0);
    }

    // Lọc và đếm học viên mới trong khoảng thời gian
    const cutoffDate = new Date(today);
    cutoffDate.setDate(cutoffDate.getDate() - (numDays - 1));

    students.forEach(st => {
        // Lấy ngày tạo (createdAt)
        const ts = st.createdAt?.toDate ? st.createdAt.toDate().getTime() : (st.createdAt || 0);
        if (!ts) return;
        const crDate = new Date(ts);
        crDate.setHours(0, 0, 0, 0);

        if (crDate.getTime() >= cutoffDate.getTime() && crDate.getTime() <= today.getTime()) {
            const idx = dateKeys.indexOf(crDate.getTime());
            if (idx !== -1) {
                counts[idx]++;
            }
        }
    });

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
                pointRadius: 4,
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
                        font: { family: 'Inter', size: 11 },
                        maxRotation: 45,
                        minRotation: 0
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
// renderTeacherStudents + teacherSearchQuery + teacherFilterMode → đã chuyển sang app-teacher.js




// ===================== ADMIN USERS MANAGEMENT ===================== //
let adminUsersUnsub = null;

function loadAdminUsers() {
    if (adminUsersUnsub) adminUsersUnsub();
    adminUsersUnsub = db.collection('users').where('role', '==', 'PENDING').onSnapshot(snap => {
        const list = document.getElementById('admin-users-list');
        if (!list) return;
        list.innerHTML = '';

        // Build branch options HTML
        const branchOpts = localState.branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

        snap.docs.forEach(doc => {
            const u = doc.data();

            const currentBranchId = u.branchId || localState.branches[0].id; // Mặc định cơ sở đầu tiên nếu chưa có

            // NẾU LÀ MANAGER THÌ CHỈ THẤY USER ĐĂNG KÝ VÀO CƠ SỞ CỦA MÌNH
            if (currentUserRole === 'MANAGER' && currentBranchId !== currentUserId) {
                // Sửa thành currentBranchId của manager
                const managerBranchId = FIXED_BRANCHES.find(b => b.id === localState.currentUser?.branchId)?.id || currentUserBranchId;
                if (currentBranchId !== managerBranchId) return;
            }

            const isPending = true;

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
                                <option value="KETOAN" ${u.role === 'KETOAN' ? 'selected' : ''}>💰 Kế Toán</option>
                                <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>👑 Admin</option>
                            </select>
                            
                            <select id="branch-select-${doc.id}" class="modern-select" style="padding: 6px 12px; width: 150px; height: 36px; border-radius: 6px; font-size: 13px;">
                                ${userBranchOpts}
                            </select>

                            <button class="btn btn-sm btn-primary" onclick="updateUserRole('${doc.id}')" style="height: 36px;">Cấp quyền</button>
                            <button class="btn btn-sm" onclick="rejectPendingUser('${doc.id}', '${u.name.replace(/'/g, "\\'")}')" style="height: 36px; background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.3);"><i class="fa-solid fa-xmark"></i> Từ chối</button>
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
        const branchLetans = {};
        FIXED_BRANCHES.forEach(b => { branchTeachers[b.id] = ''; branchSales[b.id] = ''; branchManagers[b.id] = ''; branchLetans[b.id] = ''; });

        snap.docs.forEach(doc => {
            const u = doc.data();
            if (u.role === 'TEACHER' && u.branchId && statsCounter[u.branchId]) {
                statsCounter[u.branchId].teacher++;
                const currentType = u.teacherType || 'Chính';
                branchTeachers[u.branchId] += `
                    <div class="student-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border: 1px solid ${u.queuePaused ? '#f59e0b' : 'var(--border-color)'}; border-radius: 8px; flex-wrap: wrap; gap: 10px; ${u.queuePaused ? 'opacity: 0.7; background: rgba(245,158,11,0.05);' : ''}">
                        <div>
                            <div style="font-weight: 600; font-size: 15px;">${u.queuePaused ? '⏸️' : '🟢'} ${u.name} ${u.isCoach ? '<span style="background:#f59e0b; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:4px;">🏅 HLV</span>' : ''} ${u.canDive ? '<span style="background:#06b6d4; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; margin-left:4px;">🤿 Lặn</span>' : ''}</div>
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
                            <button class="btn btn-sm" onclick="toggleCanDive('${doc.id}', ${u.canDive ? 'true' : 'false'})" style="height: 34px; font-size: 12px; white-space: nowrap; background: ${u.canDive ? 'rgba(6,182,212,0.15)' : 'rgba(107,114,128,0.1)'}; color: ${u.canDive ? '#0891b2' : '#6b7280'}; border: 1px solid ${u.canDive ? 'rgba(6,182,212,0.3)' : 'rgba(107,114,128,0.25)'};"><i class="fa-solid fa-water"></i> ${u.canDive ? '🤿 Lặn' : 'Lặn'}</button>
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
            } else if (u.role === 'LETAN' && u.branchId) {
                branchLetans[u.branchId] = (branchLetans[u.branchId] || '') + `
                    <div class="student-card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border: 1px solid var(--border-color); border-radius: 8px;">
                        <div>
                            <div style="font-weight: 600; font-size: 15px;"><i class="fa-solid fa-clipboard-user" style="color: #10b981;"></i> ${u.name}</div>
                            <div style="font-size: 12px; color: var(--text-muted);">${u.email || ''}</div>
                        </div>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <button class="btn btn-sm" onclick="renameUser('${doc.id}', '${u.name.replace(/'/g, "\\\\'")}')" style="height: 34px; font-size: 12px; white-space: nowrap; background: rgba(37,99,235,0.1); color: var(--primary); border: 1px solid rgba(37,99,235,0.25);"><i class="fa-solid fa-pen"></i> Sửa tên</button>
                            <button class="btn btn-sm" onclick="fireUser('${doc.id}', '${u.name.replace(/'/g, "\\\\'")}', '')" style="height: 34px; font-size: 12px; white-space: nowrap; background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);"><i class="fa-solid fa-lock"></i> Khoá TK</button>
                        </div>
                    </div>
                `;
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
                const lCards = branchLetans[branchId] || '';
                if (!tCards && !sCards && !mCards && !lCards) return;

                allStaffHtml += `<div style="margin-bottom: 20px; padding: 16px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--card-bg);">`;
                allStaffHtml += `<div style="font-size: 16px; font-weight: 700; color: var(--primary); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--border-color);">📍 ${branch.name}</div>`;
                if (tCards) allStaffHtml += '<div style="font-size:13px; font-weight:600; color:var(--primary); margin-bottom:8px;"><i class="fa-solid fa-person-swimming"></i> Giáo viên</div>' + tCards;
                if (sCards) allStaffHtml += '<div style="font-size:13px; font-weight:600; color:var(--warning); margin-top:15px; margin-bottom:8px;"><i class="fa-solid fa-briefcase"></i> Sale</div>' + sCards;
                if (mCards) allStaffHtml += '<div style="font-size:13px; font-weight:600; color:var(--secondary); margin-top:15px; margin-bottom:8px;"><i class="fa-solid fa-building"></i> Quản lý</div>' + mCards;
                if (lCards) allStaffHtml += '<div style="font-size:13px; font-weight:600; color:#10b981; margin-top:15px; margin-bottom:8px;"><i class="fa-solid fa-clipboard-user"></i> Lễ Tân</div>' + lCards;
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
        await db.collection('users').doc(userId).update({ teacherType: newType });

        // Cập nhật fixedOrder: điều chỉnh số slot (giữ vị trí cố định)
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let fo = doc.data().fixedOrder || [];
                    let ci = doc.data().currentIndex || 0;
                    const currentCount = fo.filter(id => id === userId).length;
                    const targetCount = newType === 'CTV' ? 1 : 2;

                    if (currentCount > targetCount) {
                        // CTV: xóa slot thừa (giữ slot đầu tiên)
                        let removed = 0;
                        for (let i = fo.length - 1; i >= 0; i--) {
                            if (fo[i] === userId && removed < currentCount - targetCount) {
                                fo.splice(i, 1);
                                if (ci > i) ci = Math.max(0, ci - 1);
                                removed++;
                            }
                        }
                    } else if (currentCount < targetCount) {
                        // Chính: thêm slot cách xa
                        const firstIdx = fo.indexOf(userId);
                        let insertPos = firstIdx + Math.floor(fo.length / 2);
                        if (insertPos >= fo.length) insertPos = fo.length;
                        if (insertPos > 0 && fo[insertPos - 1] === userId) insertPos++;
                        fo.splice(insertPos, 0, userId);
                    }
                    if (ci >= fo.length) ci = 0;
                    transaction.update(qDoc, { fixedOrder: fo, currentIndex: ci });
                }
            });
        }

        alert(`Đã cập nhật Giáo viên thành loại "${newType}" thành công! Hàng đợi đã được điều chỉnh.`);
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

// Toggle quyền Dạy Lặn cho GV
window.toggleCanDive = async function (userId, currentlyCanDive) {
    const action = currentlyCanDive ? 'TẮT' : 'BẬT';
    if (!confirm(`🤿 ${action} quyền dạy Lặn cho giáo viên này?`)) return;
    try {
        await db.collection('users').doc(userId).update({ canDive: !currentlyCanDive });
        alert(`✅ Đã ${action} quyền dạy Lặn!`);
        loadAdminUsers();
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

window.fireUser = async function (userId, userName, branchId) {
    if (!confirm(`⚠️ XÁC NHẬN CHO NGHỈ VIỆC: Bạn chắc chắn muốn vô hiệu hóa tài khoản "${userName}"? Người này sẽ không thể đăng nhập được nữa và phải đăng ký tài khoản mới.`)) return;

    try {
        await db.collection('users').doc(userId).update({ role: 'FIRED' });

        // Xóa khỏi fixedOrder và debtMap
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let fo = doc.data().fixedOrder || [];
                    let ci = doc.data().currentIndex || 0;
                    let dm = doc.data().debtMap || {};
                    fo = fo.filter(id => id !== userId);
                    delete dm[userId];
                    if (ci >= fo.length) ci = 0;
                    transaction.update(qDoc, { fixedOrder: fo, currentIndex: ci, debtMap: dm });
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
    if (!confirm(`⏸️ Xác nhận TẠM DỮNG "${userName}" khỏi hàng đợi nhận học viên?\n\nGiáo viên sẽ không nhận học viên mới cho đến khi bạn cho phép quay lại.`)) return;
    try {
        await db.collection('users').doc(userId).update({ queuePaused: true });

        // Xóa khỏi fixedOrder
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let fo = doc.data().fixedOrder || [];
                    let ci = doc.data().currentIndex || 0;
                    fo = fo.filter(id => id !== userId);
                    if (ci >= fo.length) ci = 0;
                    transaction.update(qDoc, { fixedOrder: fo, currentIndex: ci });
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

        // 2. ĐẶT currentIndex = vị trí GV trong fixedOrder + xóa debt
        const userDoc = await db.collection('users').doc(teacherId).get();
        const branchId = userDoc.data()?.branchId;
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (!doc.exists) return;
                let fo = doc.data().fixedOrder || [];
                let dm = doc.data().debtMap || {};
                const idx = fo.indexOf(teacherId);
                // Xóa debt của GV
                delete dm[teacherId];
                if (idx !== -1) {
                    // Đặt currentIndex = vị trí của GV
                    transaction.update(qDoc, { currentIndex: idx, debtMap: dm });
                } else {
                    // GV chưa có trong fixedOrder → thêm vào đầu
                    fo.unshift(teacherId);
                    transaction.update(qDoc, { fixedOrder: fo, currentIndex: 0, debtMap: dm });
                }
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
        if (currentUserRole === 'MANAGER') {
            const managerBranchId = FIXED_BRANCHES.find(b => b.id === localState.currentUser?.branchId)?.id || currentUserBranchId;
            if (newBranchId !== managerBranchId) {
                return alert('❌ Quản lý chỉ được phép duyệt nhân sự cho cơ sở của mình!');
            }
            if (newRole === 'ADMIN' || newRole === 'MANAGER') {
                return alert('❌ Quản lý không có quyền tạo tài khoản Admin hoặc Quản lý khác!');
            }
        }

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

        // NẾU DUYỆT LÀ GIÁO VIÊN -> TỰ ĐỘNG ĐẨY VÀO QUEUE MẶC ĐỊNH LÀ CTV
        if (newRole === 'TEACHER') {
            let userData = (await db.collection('users').doc(userId).get()).data();
            let teacherType = userData?.teacherType;
            if (!teacherType) {
                teacherType = 'CTV';
                await db.collection('users').doc(userId).update({ teacherType: 'CTV' });
            }
            await pushTeacherToQueue(userId, teacherType, newBranchId);
        }

        alert('✅ Đã duyệt tài khoản thành công!');
    } catch (e) {
        alert('Lỗi cập nhật: ' + e.message);
    }
};

// Từ chối / Xoá tài khoản chờ duyệt
window.rejectPendingUser = async function (userId, userName) {
    if (!confirm(`❌ Từ chối và XOÁ tài khoản "${userName}"?\n\nTài khoản này sẽ bị xoá vĩnh viễn khỏi hệ thống.`)) return;
    try {
        await db.collection('users').doc(userId).delete();
        alert(`✅ Đã từ chối và xoá tài khoản "${userName}"!`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
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
        // Manager CÓ THỂ xem approval section (sẽ lọc ở hàm hiển thị sau)
        if (approvalSection) approvalSection.style.display = 'block';

        // Áp dụng bộ lọc thời gian cho students
        const filteredStudents = filterByDate(studentsData);

        let allTeachers = usersData.filter(u => u.role === 'TEACHER');
        let allSales = usersData.filter(u => u.role === 'SALE');
        allTeachers.forEach(t => { t.studentCount = filteredStudents.filter(s => s.assignedTeacherId === t.id).length; });

        let fullHtml = renderDateFilterBar();

        // ======= TỪNG CƠ SỞ =======
        let displayBranches = FIXED_BRANCHES;
        if (currentUserRole === 'MANAGER') {
            displayBranches = FIXED_BRANCHES.filter(b => b.id === currentUserBranchId);
        }

        displayBranches.forEach(branch => {
            const bT = allTeachers.filter(t => t.branchId === branch.id).sort((a, b) => b.studentCount - a.studentCount);
            const bS = allSales.filter(s => s.branchId === branch.id);
            const bStd = filteredStudents.filter(s => s.branchId === branch.id);
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
            if ((currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') && bPen.length > 0) {
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

        // 4. BẢNG DANH SÁCH HỌC VIÊN (PHÂN TRANG)
        const allStudentsTbody = document.getElementById('admin-all-students-tbody');
        if (allStudentsTbody && !window._adminStudentsLoaded) {
            // Chỉ load khi user mở bảng này lần đầu (lazy load)
            allStudentsTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px;">
                <button onclick="loadAdminStudentsData()" style="padding:10px 24px; border-radius:8px; border:none; background:var(--primary); color:#fff; font-weight:600; cursor:pointer; font-size:13px;">
                    <i class="fa-solid fa-download"></i> Tải danh sách HV
                </button>
                <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">Bấm để tải dữ liệu (tối ưu cho hệ thống lớn)</div>
            </td></tr>`;

            // Populate branch filter dropdown
            const bFilter = document.getElementById('admin-student-branch-filter');
            if (bFilter && bFilter.options.length <= 1) {
                FIXED_BRANCHES.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.id;
                    opt.textContent = b.name;
                    bFilter.appendChild(opt);
                });
            }
            // MANAGER: chỉ xem cơ sở của mình
            if (bFilter && currentUserRole === 'MANAGER' && currentBranchId) {
                bFilter.value = currentBranchId;
                bFilter.disabled = true;
                bFilter.style.opacity = '0.7';
            }
        }
    }
}
// Load dữ liệu HV cho bảng Admin (lazy + phân trang)
let _adminStudentsCache = [];
window._adminStudentsPage = 0;
const ADMIN_PAGE_SIZE = 50;

window.loadAdminStudentsData = async function () {
    const tbody = document.getElementById('admin-all-students-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>`;

    try {
        const branchVal = document.getElementById('admin-student-branch-filter')?.value || '';
        let query = db.collection('students');

        if (branchVal) {
            query = db.collection('students').where('branchId', '==', branchVal);
        } else if (currentUserRole === 'MANAGER' && currentBranchId) {
            query = db.collection('students').where('branchId', '==', currentBranchId);
        }

        const snap = await query.get();
        // Load users for name lookup
        const usersSnap = await db.collection('users').get();
        const usersMap = {};
        usersSnap.docs.forEach(d => { usersMap[d.id] = d.data(); });

        _adminStudentsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort client-side: mới nhất lên đầu
        _adminStudentsCache.sort((a, b) => {
            const dA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt || 0);
            const dB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt || 0);
            return dB - dA;
        });

        window._adminStudentsPage = 0;
        window._adminStudentsLoaded = true;

        renderAdminStudentsPage(usersMap);

        const countEl = document.getElementById('admin-student-count');
        if (countEl) countEl.textContent = `Tổng: ${_adminStudentsCache.length} HV`;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#ef4444;">Lỗi: ${e.message}</td></tr>`;
    }
};

window.renderAdminStudentsPage = function(usersMap) {
    const tbody = document.getElementById('admin-all-students-tbody');
    if (!tbody) return;

    const searchVal = (document.getElementById('admin-student-search')?.value || '').trim().toLowerCase();
    let filtered = _adminStudentsCache;
    if (searchVal) {
        filtered = filtered.filter(s =>
            (s.name + ' ' + (s.phone || '') + ' ' + (s.contractNumber || '')).toLowerCase().includes(searchVal)
        );
    }

    const start = 0;
    const end = (window._adminStudentsPage + 1) * ADMIN_PAGE_SIZE;
    const pageData = filtered.slice(start, end);
    const hasMore = end < filtered.length;

    let html = '';
    pageData.forEach(stu => {
        const branchName = FIXED_BRANCHES.find(b => b.id === stu.branchId)?.name || 'N/A';
        const teacherUser = usersMap ? usersMap[stu.assignedTeacherId] : null;
        const teacherName = teacherUser ? (teacherUser.role === 'FIRED' ? teacherUser.name + ' (nghỉ)' : teacherUser.name) : '<span class="text-muted">Chưa gán</span>';
        const creatorUser = usersMap ? usersMap[stu.creatorId] : null;
        const creatorName = creatorUser ? creatorUser.name : (stu.source === 'Self' ? '<span class="badge badge-self">GV Tự Tuyển</span>' : '<span class="text-muted">Không rõ</span>');
        const total = stu.totalSessions || 10;
        const percent = Math.min((stu.sessions / total) * 100, 100);
        const isDone = stu.sessions >= total;
        const progressColor = isDone ? 'var(--danger)' : 'var(--primary)';

        html += `<tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 12px 15px;">
                <div style="font-weight: 600; color: var(--text-color);">${stu.name}</div>
                ${stu.phone ? `<div style="font-size: 12px; color: var(--text-muted);">${stu.phone}</div>` : ''}
            </td>
            <td style="padding: 12px 15px; font-size: 14px; color: var(--text-color);">${branchName}</td>
            <td style="padding: 12px 15px; font-size: 13px; color: #8b5cf6; font-weight:500;">${stu.contractNumber || '<span class="text-muted">—</span>'}</td>
            <td style="padding: 12px 15px; font-size: 13px;">
                <span style="background:rgba(59,130,246,0.1); color:#3b82f6; padding:2px 8px; border-radius:12px; font-weight:500; font-size:12px;">${stu.curriculum || 'Bơi Ếch'}</span>
                <span style="font-size:11px; color:var(--text-muted); margin-left:4px;">${stu.ageCategory === 'Người lớn' ? '👤' : '👶'}</span>
            </td>
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
        </tr>`;
    });

    if (hasMore) {
        html += `<tr><td colspan="7" style="text-align:center; padding:12px;">
            <button onclick="window._adminStudentsPage++; renderAdminStudentsPage(window._adminUsersMap);" style="padding:8px 20px; border-radius:8px; border:1px solid var(--primary); background:transparent; color:var(--primary); font-weight:600; cursor:pointer; font-size:12px;">
                <i class="fa-solid fa-chevron-down"></i> Xem thêm (còn ${filtered.length - end} HV)
            </button>
        </td></tr>`;
    }

    tbody.innerHTML = html || `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Không tìm thấy HV.</td></tr>`;
    window._adminUsersMap = usersMap;

    const countEl = document.getElementById('admin-student-count');
    if (countEl) countEl.textContent = `Hiện ${pageData.length}/${filtered.length} HV`;
}

// Lọc bảng HV Admin (tìm kiếm + đổi cơ sở → reload)
window.filterAdminStudents = function () {
    if (window._adminStudentsLoaded) {
        // Nếu đổi cơ sở → reload từ đầu
        const branchVal = document.getElementById('admin-student-branch-filter')?.value || '';
        if (window._lastAdminBranch !== undefined && window._lastAdminBranch !== branchVal) {
            window._adminStudentsLoaded = false;
            window._adminStudentsPage = 0;
            loadAdminStudentsData();
        } else {
            window._adminStudentsPage = 0;
            renderAdminStudentsPage(window._adminUsersMap);
        }
        window._lastAdminBranch = branchVal;
    } else {
        loadAdminStudentsData();
    }
};

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

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải...</td></tr>';

    try {
        const branchVal = branchFilter?.value || '';
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
                <span style="background:rgba(59,130,246,0.1); color:#3b82f6; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:600;">Lớp ${a.athleteClass || a.classLevel || 'N/A'}</span>
            </td>
            <td style="padding:12px 15px; color:var(--text-muted); font-size:13px;">${pkg}</td>
            <td style="padding:12px 15px; color:var(--text-muted); font-size:13px;">${activatedStr}</td>
            <td style="padding:12px 15px; color:var(--text-muted); font-size:13px;">${expStr}</td>
            <td style="padding:12px 15px;">
                <span style="font-size:12px; padding:3px 10px; border-radius:12px; background:${statusColor}15; color:${statusColor}; font-weight:600;">${statusLabel}</span>
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
        const sales = usersSnap.docs.filter(d => usersMap[d.id].role === 'SALE')
            .map(d => ({ id: d.id, name: usersMap[d.id].name }));

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
        const [athleteSnap, usersSnap] = await Promise.all([
            db.collection('athletes').get(),
            db.collection('users').get()
        ]);

        // Tạo map tên → userId (ưu tiên SALE)
        const nameToId = {};
        usersSnap.docs.forEach(d => {
            const u = d.data();
            const name = (u.name || '').trim().toLowerCase();
            if (name) {
                // Nếu đã có Admin, ưu tiên ghi đè bằng Sale
                if (!nameToId[name] || u.role === 'SALE') {
                    nameToId[name] = { id: d.id, name: u.name, role: u.role };
                }
            }
        });

        let fixed = 0, skipped = 0, noMatch = 0;
        const batch_size = 500;
        let updates = [];

        athleteSnap.docs.forEach(doc => {
            const a = doc.data();
            const creatorName = (a.creatorName || '').trim().toLowerCase();
            if (!creatorName) { skipped++; return; }

            const match = nameToId[creatorName];
            if (!match) { noMatch++; return; }

            // Chỉ update nếu creatorId hiện tại KHÁC với userId đúng
            if (a.creatorId !== match.id) {
                updates.push({ docId: doc.id, newCreatorId: match.id, athleteName: a.name, saleName: match.name });
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
            'Ếch Trẻ em': 750000, 'Bơi Ếch': 750000,
            'Sải Trẻ em': 900000, 'Bơi Sải': 900000,
            'Ếch Vip Trẻ em': 1312000, 'Ếch Vip': 1312000,
            'Sải Vip Trẻ em': 1487500, 'Sải Vip': 1487500,
            'Ếch Người lớn': 900000,
            'Sải Người lớn': 1050000,
            'Ếch Vip Người lớn': 1487500,
            'Sải Vip Người lớn': 1662000,
            'Bơi Ngửa': 1050000,
            'Bơi Bướm': 1650000,
            'PT': 200000, // tính theo buổi
            'Dolphin 1': 0, 'Dolphin 2': 0, 'Lặn Tiên cá': 0, 'Trải nghiệm Tiên cá': 0 // Anh cập nhật giá sau
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
                </tr>`;
            });

            grandTotal += teacherTotal;
            html += `<tr style="background:rgba(16,185,129,0.08); font-weight:700;">
                <td colspan="8" style="padding:8px; text-align:right; color:var(--text-color);">💰 Tổng tiền công ${sub.teacherName}:</td>
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
        'Ếch Trẻ em': 750000, 'Bơi Ếch': 750000,
        'Sải Trẻ em': 900000, 'Bơi Sải': 900000,
        'Ếch Vip Trẻ em': 1312000, 'Ếch Vip': 1312000,
        'Sải Vip Trẻ em': 1487500, 'Sải Vip': 1487500,
        'Ếch Người lớn': 900000, 'Sải Người lớn': 1050000,
        'Ếch Vip Người lớn': 1487500, 'Sải Vip Người lớn': 1662000,
        'Bơi Ngửa': 1050000, 'Bơi Bướm': 1650000, 'PT': 200000,
        'Dolphin 1': 0, 'Dolphin 2': 0, 'Lặn Tiên cá': 0, 'Trải nghiệm Tiên cá': 0
    };
    const cur = s.curriculum || 'Bơi Ếch';
    const age = s.ageCategory || 'Trẻ em';
    if (cur === 'PT') return (s.sessions || 0) * 200000;
    return MAP[cur + ' ' + age] || MAP[cur] || 0;
}

function buildSalaryRows(submissions) {
    const rows = [['STT', 'Giáo viên', 'Cơ sở', 'Họ tên HV', 'SĐT', 'Số HĐ', 'Kiểu bơi', 'Buổi', 'Độ tuổi', 'Sale', 'Thành tiền']];
    let idx = 0;
    submissions.forEach(sub => {
        const branchName = FIXED_BRANCHES.find(b => b.id === sub.branchId)?.name || sub.branchId;
        (sub.students || []).forEach(s => {
            idx++;
            const price = salaryPrice(s);
            rows.push([idx, sub.teacherName, branchName, s.name, s.phone || '', s.contractNumber || '', s.curriculum || 'Bơi Ếch', `${s.sessions}/${s.totalSessions}`, s.ageCategory === 'Người lớn' ? 'Người lớn' : 'Trẻ em', s.creatorName || s.saleName || '', price]);
        });
        const total = (sub.students || []).reduce((sum, s) => sum + salaryPrice(s), 0);
        rows.push(['', '', '', '', '', '', '', '', '', `Tổng ${sub.teacherName}:`, total]);
    });
    const grandTotal = submissions.reduce((sum, sub) => sum + (sub.students || []).reduce((s2, s) => s2 + salaryPrice(s), 0), 0);
    rows.push(['', '', '', '', '', '', '', '', '', 'TỔNG CỘNG:', grandTotal]);
    return rows;
}

window.exportTeacherSalary = function (idx) {
    const subs = window._financeSubmissions;
    if (!subs || !subs[idx]) return alert('Không tìm thấy dữ liệu!');
    const sub = subs[idx];
    const rows = buildSalaryRows([sub]);
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

// GV: Chốt lương tháng hiện tại
window.submitSalary = async function () {
    if (!currentUserId) return;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;

    try {
        // Kiểm tra đã chốt tháng này chưa
        const existCheck = await db.collection('salary_submissions')
            .where('teacherId', '==', currentUserId)
            .where('month', '==', month)
            .where('branchId', '==', currentBranchId)
            .get();
        if (!existCheck.empty) {
            alert(`❌ Bạn đã chốt lương ${monthLabel} rồi!\n\nMỗi tháng chỉ được chốt 1 lần.`);
            return;
        }

        // Lấy danh sách HV của GV này
        const studSnap = await db.collection('students')
            .where('assignedTeacherId', '==', currentUserId)
            .where('branchId', '==', currentBranchId)
            .get();

        // Lấy danh sách HV đã chốt ở tháng trước (tránh trùng)
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
        // - Gói thường: đủ buổi + ≥7 buổi
        // - Gói PT: đã dạy ≥ 50% khóa, chốt theo buổi đã ĐD (trừ buổi đã chốt)
        const eligible = [];
        const notEligible = [];
        const ptRemaining = []; // HV PT còn buổi chưa chốt
        studSnap.docs.forEach(doc => {
            const s = doc.data();
            const sessions = s.sessions || 0;
            const total = s.totalSessions || 10;
            const cur = s.curriculum || 'Bơi Ếch';

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
                // Gói thường: >= 7 buổi + hoàn thành tiến trình
                if (alreadySubmittedIds.has(doc.id)) return;
                const min7 = sessions >= 7;

                if (min7) {
                    eligible.push({ studentId: doc.id, ...s });
                } else {
                    notEligible.push({ name: s.name, reasons: [`dưới 7 buổi (${sessions}/${total})`] });
                }
            }
        });

        if (eligible.length === 0) {
            let msg = `❌ Không có HV nào đủ điều kiện chốt lương ${monthLabel}.\n\n`;
            msg += `Điều kiện:\n  • Gói thường: Tối thiểu 7 buổi\n  • Gói PT: Đã dạy ≥ 50% khóa\n\n`;
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
                salaryConfirmedBy: currentUserId
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
