// ===== GreenPool App — Queue Management (v11.0) =====
// Hàng đợi nhận học viên, phân bổ GV

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

async function pushTeacherToQueue(teacherId, type, targetBranchId = currentBranchId) {
    if (!targetBranchId) return;
    const qDoc = db.collection('queues').doc(targetBranchId);
    const slots = type === 'Chính' ? 2 : 1;
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(qDoc);
            let queue = doc.exists ? (doc.data().queue || []) : [];
            // Không thêm nếu đã có đủ slot
            const currentCount = queue.filter(id => id === teacherId).length;
            if (currentCount >= slots) return;
            // Thêm slot còn thiếu vào cuối
            for (let i = currentCount; i < slots; i++) {
                queue.push(teacherId);
            }
            if (doc.exists) {
                transaction.update(qDoc, { queue });
            } else {
                transaction.set(qDoc, { queue, debtMap: {}, testingMap: {} });
            }
        });
    } catch (e) { console.error(e); }
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
        const maxKeep = Math.max((localState.queue?.length || 10) * 5 + 10, 60);
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

window.showQueueHistory = async function () {
    if (!currentBranchId) return alert('Chưa chọn cơ sở!');
    const brName = FIXED_BRANCHES.find(b => b.id === currentBranchId)?.name || currentBranchId;

    try {
        const maxShow = Math.max((localState.queue?.length || 10) * 5 + 10, 60);
        const snap = await db.collection('queue_logs')
            .where('branchId', '==', currentBranchId)
            .orderBy('createdAt', 'desc')
            .limit(maxShow)
            .get();

        if (snap.empty) {
            alert('Chưa có lịch sử chuyển turn nào cho cơ sở này.\n\n(Lịch sử sẽ được ghi từ bây giờ trở đi)');
            return;
        }

        // Group by roundNumber
        const rounds = {};
        const oldLogs = [];
        snap.docs.forEach(doc => {
            const d = doc.data();
            d._id = doc.id;
            if (d.roundNumber && d.roundNumber > 0) {
                if (!rounds[d.roundNumber]) rounds[d.roundNumber] = [];
                rounds[d.roundNumber].push(d);
            } else {
                oldLogs.push(d);
            }
        });

        const roundKeys = Object.keys(rounds).map(Number).sort((a, b) => b - a);
        const qDoc = await db.collection('queues').doc(currentBranchId).get();
        const currentRound = qDoc.exists ? (qDoc.data().roundNumber || 1) : 1;

        let content = '';

        roundKeys.forEach(rn => {
            const entries = rounds[rn];
            entries.sort((a, b) => {
                const tA = a.createdAt?.toDate?.()?.getTime() || 0;
                const tB = b.createdAt?.toDate?.()?.getTime() || 0;
                return tA - tB;
            });

            const isCurrent = rn === currentRound;
            const roundLabel = isCurrent ? `🔄 Vòng Turn ${String(rn).padStart(2, '0')} (đang diễn ra)` : `✅ Vòng Turn ${String(rn).padStart(2, '0')}`;
            const headerBg = isCurrent ? 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(6,182,212,0.1))' : 'rgba(255,255,255,0.03)';
            const headerBorder = isCurrent ? 'var(--primary)' : 'var(--border-color)';

            content += '<div style="margin-bottom:16px; border:1px solid ' + headerBorder + '; border-radius:12px; overflow:hidden;">';
            content += '<div style="padding:12px 16px; background:' + headerBg + '; border-bottom:1px solid var(--border-color);"><span style="font-weight:700; font-size:14px; color:var(--text-color);">' + roundLabel + '</span></div>';
            content += '<div style="padding:8px 0;">';

            let orderInRound = 0;

            entries.forEach(d => {
                const time = d.createdAt?.toDate?.()?.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) || '';
                const date = d.createdAt?.toDate?.()?.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) || '';

                const skipped = d.skippedSlots || [];
                skipped.forEach(sk => {
                    orderInRound++;
                    let skipReason = '', skipIcon = '⏭️';
                    if (sk.reason === 'debt') {
                        skipReason = 'qua lượt vì bị trừ nợ 1 lượt (nợ còn ' + (sk.debtAfter || 0) + ')';
                        skipIcon = '💳';
                    } else if (sk.reason === 'paused') {
                        skipReason = 'qua lượt vì đang tạm dừng';
                        skipIcon = '⏸️';
                    } else if (sk.reason === 'not_found') {
                        skipReason = 'qua lượt vì GV không tải được (lỗi hệ thống)';
                        skipIcon = '❓';
                    } else if (sk.reason === 'mismatch_skip') {
                        skipReason = 'qua lượt do lệch dữ liệu (UI/Queue không đồng bộ)';
                        skipIcon = '⚠️';
                    } else {
                        skipReason = 'qua lượt';
                    }
                    content += '<div style="padding:7px 16px; display:flex; align-items:center; gap:8px; border-bottom:1px solid rgba(255,255,255,0.03); flex-wrap:wrap;">'
                        + '<span style="font-size:11px; color:var(--text-muted); min-width:70px;">' + date + ' ' + time + '</span>'
                        + '<span style="background:rgba(107,114,128,0.15); color:#9ca3af; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; min-width:32px; text-align:center;">TT ' + orderInRound + '</span>'
                        + '<span style="font-size:12px; color:#ef4444; font-weight:600;">' + skipIcon + ' ' + (sk.teacherName || '?') + '</span>'
                        + '<span style="font-size:12px; color:var(--text-muted);">→ ' + skipReason + '</span>'
                        + '</div>';
                });

                // Chỉ đếm TT cho turn thực (contract, cut_turn, penalty) — KHÔNG đếm ngoại lệ & batch
                const isException = d.action === 'contract_exception';
                const isBatch = d.action === 'contract_batch';
                const isDiving = d.action === 'contract_diving';
                const isRewind = d.action === 'rewind';
                
                if (!isException && !isBatch && !isDiving && !isRewind) {
                    orderInRound++;
                }

                let color = '#3b82f6', actionIcon = '📝', actionText = '';
                let orderLabel = '', orderBg = 'rgba(107,114,128,0.15)';
                
                if (d.action === 'contract') {
                    color = '#3b82f6'; actionIcon = '📝';
                    actionText = 'qua lượt vì nhận HĐ mới "' + (d.contractNumber || '') + '" — HV "' + (d.studentName || '?') + '"';
                    orderLabel = 'TT ' + orderInRound;
                } else if (isBatch) {
                    color = '#06b6d4'; actionIcon = '📦';
                    actionText = 'nhận HĐ cùng lượt "' + (d.contractNumber || '') + '" — HV "' + (d.studentName || '?') + '" (chưa chuyển turn)';
                    orderLabel = '—';
                    orderBg = 'rgba(6,182,212,0.1)';
                } else if (isException) {
                    color = '#f59e0b'; actionIcon = '✨';
                    actionText = 'nhận HĐ ngoại lệ "' + (d.contractNumber || '') + '" — HV "' + (d.studentName || '?') + '" → ghi nợ 1 lượt';
                    orderLabel = 'NL';
                    orderBg = 'rgba(245,158,11,0.12)';
                } else if (d.action === 'cut_turn') {
                    color = '#8b5cf6'; actionIcon = '✂️';
                    actionText = 'bị cắt lượt bởi ' + (d.performedByName || 'Admin');
                    orderLabel = 'TT ' + orderInRound;
                } else if (d.action === 'penalty') {
                    color = '#ef4444'; actionIcon = '⚠️';
                    actionText = 'bị phạt mất lượt';
                    orderLabel = 'TT ' + orderInRound;
                } else if (isRewind) {
                    color = '#10b981'; actionIcon = '⏪';
                    actionText = 'được đẩy lên Top 1';
                    orderLabel = '↩';
                    orderBg = 'rgba(16,185,129,0.1)';
                } else {
                    actionText = d.detail || d.action;
                    orderLabel = 'TT ' + orderInRound;
                }

                content += '<div style="padding:8px 16px; display:flex; align-items:center; gap:8px; border-bottom:1px solid rgba(255,255,255,0.03); flex-wrap:wrap;">'
                    + '<span style="font-size:11px; color:var(--text-muted); min-width:70px;">' + date + ' ' + time + '</span>'
                    + '<span style="background:' + orderBg + '; color:#9ca3af; font-size:11px; font-weight:700; padding:2px 8px; border-radius:4px; min-width:32px; text-align:center;">' + orderLabel + '</span>'
                    + '<span style="font-size:13px; font-weight:600; color:' + color + ';">' + actionIcon + ' ' + (d.teacherName || '?') + '</span>'
                    + '<span style="font-size:12px; color:var(--text-color);">→ ' + actionText + '</span>'
                    + '</div>';
            });

            content += '</div></div>';
        });

        // Log cũ (không có roundNumber)
        if (oldLogs.length > 0) {
            content += '<div style="margin-bottom:16px; border:1px solid var(--border-color); border-radius:12px; overflow:hidden; opacity:0.6;">';
            content += '<div style="padding:12px 16px; background:rgba(255,255,255,0.03); border-bottom:1px solid var(--border-color);"><span style="font-weight:700; font-size:14px; color:var(--text-muted);">📁 Lịch sử cũ (trước khi cập nhật)</span></div>';
            content += '<div style="padding:8px 0;">';
            oldLogs.forEach(d => {
                const time = d.createdAt?.toDate?.()?.toLocaleString('vi-VN') || '—';
                content += '<div style="padding:6px 16px; font-size:12px; color:var(--text-muted); border-bottom:1px solid rgba(255,255,255,0.03);">' + time + ' — ' + (d.detail || d.action || '—') + '</div>';
            });
            content += '</div></div>';
        }

        let modal = document.getElementById('queue-history-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'queue-history-modal';
            document.body.appendChild(modal);
        }
        modal.innerHTML = '<div style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;" onclick="if(event.target===this) this.remove();">'
            + '<div style="background:var(--card-bg); border-radius:16px; max-width:800px; width:100%; max-height:85vh; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.4); display:flex; flex-direction:column;">'
            + '<div style="padding:16px 20px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">'
            + '<div><h3 style="margin:0; font-size:16px; color:var(--text-color);">📋 Lịch sử Turn — ' + brName + '</h3>'
            + '<p style="margin:4px 0 0; font-size:12px; color:var(--text-muted);">Vòng hiện tại: ' + currentRound + ' | ' + snap.size + ' bản ghi</p></div>'
            + '<button onclick="document.getElementById(\'queue-history-modal\').remove()" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-muted); padding:4px 8px;">✕</button>'
            + '</div>'
            + '<div style="overflow-y:auto; flex:1; padding:16px;">' + (content || '<div style="text-align:center; padding:30px; color:var(--text-muted);">Không có dữ liệu</div>') + '</div>'
            + '</div></div>';
    } catch (e) {
        if (e.message?.includes('index')) {
            alert('⚠️ Cần tạo Firestore Index cho queue_logs.\n\nCollection: queue_logs\nFields: branchId ASC, createdAt DESC');
        } else {
            alert('Lỗi: ' + e.message);
        }
    }
};


// Admin: Đẩy GV cuối hàng lên Top 1 (hoàn tác cắt lượt nhầm)
window.rewindQueueToLast = async function () {
    if (!currentBranchId) return;
    const queue = localState.queue || [];
    if (queue.length <= 1) return;
    const lastTeacherId = queue[queue.length - 1];
    const lastTeacher = localState.teachers.find(t => t.id === lastTeacherId);
    if (!confirm(`⬆️ Đẩy "${lastTeacher?.name || 'GV'}" lên Top 1?`)) return;
    try {
        const qDoc = db.collection('queues').doc(currentBranchId);
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(qDoc);
            if (doc.exists) {
                let q = doc.data().queue || [];
                if (q.length > 1) {
                    q.unshift(q.pop()); // cuối lên đầu
                    transaction.update(qDoc, { queue: q });
                }
            }
        });
        logQueueAction({
            action: 'rewind',
            teacherId: lastTeacherId,
            teacherName: lastTeacher?.name || '',
            detail: `Đẩy "${lastTeacher?.name || 'GV'}" lên Top 1`
        });
    } catch (e) { console.error(e); }
};

// Cắt lượt (Admin): Top 1 xuống cuối, resolveDebtAtFront
window.cutQueueTurn = async function (unused, skipConfirm = false) {
    if (!currentBranchId) return;
    if (!skipConfirm && !confirm('Bạn muốn cắt lượt GV hiện tại và chuyển sang GV tiếp theo?')) return;
    const qDoc = db.collection('queues').doc(currentBranchId);
    let _cutTeacherId = '', _cutTeacherName = '', _cutRound = 1;
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(qDoc);
            if (doc.exists) {
                let queue = doc.data().queue || [];
                let dm = doc.data().debtMap || {};
                let roundNum = doc.data().roundNumber || 1;
                let turnsInRound = doc.data().turnsInRound || 0;
                _cutRound = roundNum;
                if (queue.length > 0) {
                    const totalSlots = queue.length;
                    _cutTeacherId = queue[0];
                    const teacher = localState.teachers.find(t => t.id === _cutTeacherId);
                    _cutTeacherName = teacher?.name || '';
                    queue.push(queue.shift()); // Top 1 xuống cuối
                    turnsInRound++; // cắt lượt = 1 turn
                    const result = resolveDebtAtFront(queue, dm);
                    turnsInRound += result.skipped.length;
                    // Check hoàn thành vòng
                    if (turnsInRound >= totalSlots) {
                        roundNum++;
                        turnsInRound = turnsInRound - totalSlots;
                    }
                    _cutRound = roundNum;
                    transaction.update(qDoc, { queue: result.queue, debtMap: result.debtMap, roundNumber: roundNum, turnsInRound });
                }
            }
        });
        if (!skipConfirm) {
            logQueueAction({
                action: 'cut_turn',
                teacherId: _cutTeacherId,
                teacherName: _cutTeacherName,
                detail: `Admin cắt lượt GV "${_cutTeacherName}"`,
                roundNumber: _cutRound
            });
        }
    } catch (e) { console.error(e); }
};

// Phạt Mất Lượt
window.saleSkipTurn = async function () {
    if (!currentBranchId) return alert('Chưa chọn Cơ sở!');
    if (localState.queue.length === 0) return alert('Hàng chờ trống!');
    const reason = prompt('PHẠT MẤT LƯỢT: Nhập lý do (tối đa 20 ký tự):');
    if (reason === null) return;
    const trimmedReason = (reason || 'Không rõ').substring(0, 20);
    const penalizedTeacherId = localState.queue[0];
    const penalizedTeacher = localState.teachers.find(t => t.id === penalizedTeacherId);
    const penalizedTeacherName = penalizedTeacher ? penalizedTeacher.name : 'Không rõ';
    try {
        await cutQueueTurn(0, true);
        if (penalizedTeacherId) {
            await sendNotification(penalizedTeacherId, 'penalty', `⚠️ ${currentUserDisplayName || 'Sale'} đã PHẠT MẤT LƯỢT của bạn! Lý do: "${trimmedReason}". Bạn đã bị đẩy xuống cuối hàng đợi.`);
        }
        await db.collection('penalties').add({
            teacherId: penalizedTeacherId,
            teacherName: penalizedTeacherName,
            saleId: currentUserId,
            saleName: currentUserDisplayName || 'Sale',
            reason: trimmedReason,
            branchId: currentBranchId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        logQueueAction({
            action: 'penalty',
            teacherId: penalizedTeacherId,
            teacherName: penalizedTeacherName,
            detail: `Phạt mất lượt GV "${penalizedTeacherName}". Lý do: "${trimmedReason}"`
        });
        alert('Phạt mất lượt thành công!');
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

    // Tìm GV đầu tiên trong queue KHÔNG đang test (luôn ưu tiên top 1)
    let availableForTest = null;
    for (let i = 0; i < localState.queue.length; i++) {
        const id = localState.queue[i];
        const t = localState.teachers.find(tt => tt.id === id);
        if (!t || t.queuePaused) continue;
        const ts = localState.testingMap[id];
        if (!ts) { availableForTest = id; break; }
        const startMs = ts.toDate ? ts.toDate().getTime() : ts;
        if ((now - startMs) >= 15 * 60 * 1000) { availableForTest = id; break; }
    }

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
