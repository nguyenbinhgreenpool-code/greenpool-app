// ===== GreenPool App — Admin Management (v11.0) =====
// Quản lý tài khoản, nhân sự, tổng quan chi tiết
// Extracted from app.js — Admin Users, Staff Stats, Detailed Overview, Admin Students


// ===================== ADMIN USERS MANAGEMENT ===================== //
var adminUsersUnsub = null;

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

            var currentBranchId = u.branchId || (localState.branches.length > 0 ? localState.branches[0].id : FIXED_BRANCHES[0]?.id || ''); // Mặc định cơ sở đầu tiên nếu chưa có

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
                            <select id="role-select-${doc.id}" class="modern-select" style="padding: 6px 12px; width: 140px; height: 36px; border-radius: 6px; font-size: 13px;" onchange="var bs=document.getElementById('branch-select-${doc.id}'); var cb=document.getElementById('chief-cb-${doc.id}'); if(bs) bs.style.display=this.value==='VIEWER'?'none':''; if(cb) cb.style.display=this.value==='KETOAN'?'flex':'none';">
                                <option value="PENDING" ${u.role === 'PENDING' ? 'selected' : ''}>⏳ Chờ duyệt</option>
                                <option value="SALE" ${u.role === 'SALE' ? 'selected' : ''}>💼 Sale</option>
                                <option value="TEACHER" ${u.role === 'TEACHER' ? 'selected' : ''}>🏊 Giáo Viên</option>
                                <option value="MANAGER" ${u.role === 'MANAGER' ? 'selected' : ''}>🏢 Quản Lý CS</option>
                                <option value="LETAN" ${u.role === 'LETAN' ? 'selected' : ''}>📋 Lễ Tân</option>
                                <option value="KETOAN" ${u.role === 'KETOAN' ? 'selected' : ''}>💰 Kế Toán</option>
                                <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>👑 Admin</option>
                                <option value="VIEWER" ${u.role === 'VIEWER' ? 'selected' : ''}>👁️ Giám sát</option>
                            </select>
                            
                            <label id="chief-cb-${doc.id}" style="display:${u.role === 'KETOAN' ? 'flex' : 'none'}; align-items:center; gap:5px; font-size:12px; color:var(--text-muted); cursor:pointer; white-space:nowrap;">
                                <input type="checkbox" id="chief-check-${doc.id}" ${u.isChiefAccountant ? 'checked' : ''} style="accent-color:#ec4899;"> KT Trưởng
                            </label>

                            <select id="branch-select-${doc.id}" class="modern-select" style="padding: 6px 12px; width: 150px; height: 36px; border-radius: 6px; font-size: 13px; ${u.role === 'VIEWER' ? 'display:none;' : ''}">
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

    // loadAdminStaffStats + loadAdminDetailedOverview → lazy-load khi bấm tab Admin
    loadAllStaff();
}

// Danh sách tất cả nhân viên đã duyệt
var _allStaffDocs = [];
var allStaffUnsub = null;
function loadAllStaff() {
    // Data cập nhật từ loadAdminStaffStats() qua biến _allStaffDocs
    // Không cần listener riêng nữa
    if (_allStaffDocs.length > 0) renderAllStaffList();
}

var ROLE_LABELS = {
    'ADMIN': '👑 Admin',
    'MANAGER': '🏢 Quản lý',
    'SALE': '💼 Sale',
    'TEACHER': '🏊 Giáo viên',
    'LETAN': '📋 Lễ tân',
    'KETOAN': '💰 Kế toán',
    'VIEWER': '👁️ Giám sát',
    'FIRED': '🚫 Đã nghỉ'
};

var ROLE_COLORS = {
    'ADMIN': '#8b5cf6',
    'MANAGER': '#0891b2',
    'SALE': '#f59e0b',
    'TEACHER': '#3b82f6',
    'LETAN': '#10b981',
    'KETOAN': '#ec4899',
    'VIEWER': '#6366f1',
    'FIRED': '#6b7280'
};

window.renderAllStaffList = function () {
    const list = document.getElementById('admin-all-staff-list');
    const countEl = document.getElementById('admin-all-staff-count');
    if (!list) return;

    const roleFilter = document.getElementById('admin-all-staff-role-filter')?.value || '';
    const search = (document.getElementById('admin-all-staff-search')?.value || '').toLowerCase().trim();

    let filtered = _allStaffDocs.filter(doc => {
        const u = doc.data();
        if (roleFilter && u.role !== roleFilter) return false;
        if (search) {
            const name = (u.name || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            if (!name.includes(search) && !email.includes(search)) return false;
        }
        return true;
    });

    // Sort: ADMIN first, then by name
    const roleOrder = ['ADMIN', 'VIEWER', 'MANAGER', 'KETOAN', 'SALE', 'TEACHER', 'LETAN', 'FIRED'];
    filtered.sort((a, b) => {
        const ra = roleOrder.indexOf(a.data().role);
        const rb = roleOrder.indexOf(b.data().role);
        if (ra !== rb) return ra - rb;
        return (a.data().name || '').localeCompare(b.data().name || '');
    });

    if (countEl) countEl.textContent = `${filtered.length} tài khoản`;

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Không tìm thấy tài khoản nào.</div>`;
        return;
    }

    const branchMap = {};
    FIXED_BRANCHES.forEach(b => { branchMap[b.id] = b.name; });

    list.innerHTML = filtered.map(doc => {
        const u = doc.data();
        const roleLabel = ROLE_LABELS[u.role] || u.role;
        const roleColor = ROLE_COLORS[u.role] || '#6b7280';
        const branchName = branchMap[u.branchId] || 'Chưa gán';
        const isSelf = doc.id === currentUserId;
        const canEdit = isSuperAdmin && !isSelf;

        // Branch options for edit
        const branchOpts = localState.branches.map(b =>
            `<option value="${b.id}" ${b.id === u.branchId ? 'selected' : ''}>${b.name}</option>`
        ).join('');

        return `<div style="display:flex; align-items:center; gap:12px; padding:12px 16px; background:var(--card-bg); border:1px solid ${isSelf ? 'rgba(139,92,246,0.3)' : 'var(--border-color)'}; border-radius:10px; flex-wrap:wrap; ${isSelf ? 'box-shadow:0 0 0 1px rgba(139,92,246,0.15);' : ''}">
            <div style="flex:1; min-width:160px;">
                <div style="font-weight:600; font-size:14px; color:var(--text-color);">${u.name || 'N/A'} ${isSelf ? '<span style="font-size:10px; color:#8b5cf6;">(Bạn)</span>' : ''}</div>
                <div style="font-size:11px; color:var(--text-muted);">${u.email || ''}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span style="font-size:11px; padding:3px 10px; border-radius:20px; font-weight:600; background:${roleColor}15; color:${roleColor}; border:1px solid ${roleColor}30;">${roleLabel}</span>
                ${u.role === 'KETOAN' && u.isChiefAccountant ? '<span style="font-size:10px; padding:2px 8px; border-radius:12px; font-weight:600; background:rgba(236,72,153,0.15); color:#ec4899; border:1px solid rgba(236,72,153,0.3);">KT Trưởng</span>' : ''}
                ${u.role !== 'VIEWER' && !(u.role === 'KETOAN' && u.isChiefAccountant) ? `<span style="font-size:11px; color:var(--text-muted);">${branchName}</span>` : ''}
                ${canEdit ? `
                <select id="staff-role-${doc.id}" style="padding:4px 8px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color); font-size:11px;">
                    <option value="SALE" ${u.role === 'SALE' ? 'selected' : ''}>💼 Sale</option>
                    <option value="TEACHER" ${u.role === 'TEACHER' ? 'selected' : ''}>🏊 GV</option>
                    <option value="MANAGER" ${u.role === 'MANAGER' ? 'selected' : ''}>🏢 QL</option>
                    <option value="LETAN" ${u.role === 'LETAN' ? 'selected' : ''}>📋 Lễ tân</option>
                    <option value="KETOAN" ${u.role === 'KETOAN' ? 'selected' : ''}>💰 KT</option>
                    <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>👑 Admin</option>
                    <option value="VIEWER" ${u.role === 'VIEWER' ? 'selected' : ''}>👁️ Giám sát</option>
                    <option value="FIRED" ${u.role === 'FIRED' ? 'selected' : ''}>🚫 Nghỉ</option>
                </select>
                <select id="staff-branch-${doc.id}" style="padding:4px 8px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color); font-size:11px; ${u.role === 'VIEWER' ? 'display:none;' : ''}">
                    ${branchOpts}
                </select>
                <button onclick="updateStaffRole('${doc.id}', '${u.name?.replace(/'/g, "\\\\'") || ''}')" style="padding:4px 10px; border-radius:6px; border:1px solid rgba(59,130,246,0.3); background:rgba(59,130,246,0.1); color:#3b82f6; font-size:11px; font-weight:600; cursor:pointer;">Lưu</button>
                ` : ''}
            </div>
        </div>`;
    }).join('');
};

window.updateStaffRole = async function (userId, userName) {
    if (!isSuperAdmin) return alert('⚠️ Chỉ Admin chính mới có quyền thay đổi!');
    const newRole = document.getElementById(`staff-role-${userId}`)?.value;
    const newBranch = document.getElementById(`staff-branch-${userId}`)?.value;
    if (!newRole) return;
    const branchLabel = FIXED_BRANCHES.find(b => b.id === newBranch)?.name || newBranch;
    const confirmMsg = newRole === 'VIEWER' 
        ? `Cập nhật "${userName}":\n→ Vai trò: ${ROLE_LABELS[newRole] || newRole}\n→ Xem tất cả cơ sở`
        : `Cập nhật "${userName}":\n→ Vai trò: ${ROLE_LABELS[newRole] || newRole}\n→ Cơ sở: ${branchLabel}`;
    if (!confirm(confirmMsg)) return;
    try {
        const updateData = { role: newRole, branchId: newRole === 'VIEWER' ? '' : (newBranch || '') };
        // Không cần isChiefAccountant cho staff list vì đã xử lý ở approval
        await db.collection('users').doc(userId).update(updateData);
        alert(`✅ Đã cập nhật quyền cho "${userName}"!`);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

var adminStatsUnsub = null;
function loadAdminStaffStats() {
    if (adminStatsUnsub) adminStatsUnsub();

    // MANAGER: chỉ load users cơ sở mình. ADMIN: load tất cả.
    let usersQuery;
    if (currentUserRole === 'MANAGER') {
        usersQuery = db.collection('users').where('branchId', '==', currentUserBranchId || currentBranchId);
    } else {
        usersQuery = db.collection('users');
    }

    adminStatsUnsub = usersQuery.onSnapshot(async snap => {
        // Feed data cho Danh sách Tài khoản (gộp listener)
        _allStaffDocs = snap.docs.filter(doc => doc.data().role !== 'PENDING');
        renderAllStaffList();
        // Feed data cho Admin Detailed Overview
        if (typeof window._updateDetailedOverviewUsers === 'function') {
            window._updateDetailedOverviewUsers(snap.docs);
        }

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
                            <button class="btn btn-sm" onclick="toggleCoach('${doc.id}', ${u.isCoach ? 'true' : 'false'})" style="height: 34px; font-size: 12px; white-space: nowrap; background: ${u.isCoach ? 'rgba(245,158,11,0.15)' : 'rgba(107,114,128,0.1)'}; color: ${u.isCoach ? '#d97706' : '#6b7280'}; border: 1px solid ${u.isCoach ? 'rgba(245,158,11,0.3)' : 'rgba(107,114,128,0.25)'};">${u.isCoach ? '<i class="fa-solid fa-medal"></i> 🏅 ' + (u.coachClasses || []).join(',') : '<i class="fa-solid fa-medal"></i> HLV'}</button>
                            <button class="btn btn-sm" onclick="toggleCanDive('${doc.id}', ${u.canDive ? 'true' : 'false'})" style="height: 34px; font-size: 12px; white-space: nowrap; background: ${u.canDive ? 'rgba(6,182,212,0.15)' : 'rgba(107,114,128,0.1)'}; color: ${u.canDive ? '#0891b2' : '#6b7280'}; border: 1px solid ${u.canDive ? 'rgba(6,182,212,0.3)' : 'rgba(107,114,128,0.25)'};">${u.canDive ? '<i class="fa-solid fa-water"></i> 🤿 Lặn' : '<i class="fa-solid fa-water"></i> Lặn'}</button>
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
                        <button class="btn btn-sm" onclick="renameUser('${doc.id}', '${u.name.replace(/'/g, "\\\\'")}')" style="height: 34px; font-size: 12px; white-space: nowrap; background: rgba(37,99,235,0.1); color: var(--primary); border: 1px solid rgba(37,99,235,0.25);"><i class="fa-solid fa-pen"></i> Sửa tên</button>
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
                            <button class="btn btn-sm" onclick="fireUser('${doc.id}', '${u.name.replace(/'/g, "\\\\'")}')" style="height: 34px; font-size: 12px; white-space: nowrap; background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);"><i class="fa-solid fa-lock"></i> Khoá TK</button>
                        </div>
                    </div>
                `;
            }
        });

        // Render bảng thống kê cơ sở (kèm HV + test student)
        // MANAGER: dùng localState (0 reads). ADMIN: count() per branch (tiết kiệm ~3900 reads).
        const branchStudentCount = {};
        const branchTestCount = {};
        FIXED_BRANCHES.forEach(b => { branchStudentCount[b.id] = 0; branchTestCount[b.id] = 0; });

        if (currentUserRole === 'MANAGER') {
            // Manager: dùng localState.students (đã có sẵn, 0 reads)
            (localState.students || []).forEach(s => {
                const bid = s.branchId || currentBranchId;
                if (branchStudentCount[bid] !== undefined) {
                    branchStudentCount[bid]++;
                    if (s.isTestStudent) branchTestCount[bid]++;
                }
            });
        } else {
            // Admin: count() per branch — cache 5 phút (~8 reads thay vì 3933)
            const now = Date.now();
            if (!window._adminStudentCountCache || now - window._adminStudentCountCache.ts > 300000) {
                try {
                    const countPromises = FIXED_BRANCHES.map(async b => {
                        const snap = await db.collection('students')
                            .where('branchId', '==', b.id)
                            .where('isFullyCompleted', '!=', true)
                            .get();
                        return { branchId: b.id, count: snap.size };
                    });
                    const results = await Promise.all(countPromises);
                    const cached = { ts: now, counts: {} };
                    results.forEach(r => { cached.counts[r.branchId] = r.count; });
                    window._adminStudentCountCache = cached;
                } catch(e) { console.warn('Admin student count:', e); }
            }
            if (window._adminStudentCountCache) {
                Object.entries(window._adminStudentCountCache.counts).forEach(([bid, cnt]) => {
                    if (branchStudentCount[bid] !== undefined) {
                        branchStudentCount[bid] = cnt;
                    }
                });
            }
        }

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

        // Cập nhật queue: điều chỉnh số slot
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let queue = doc.data().queue || [];
                    const currentCount = queue.filter(id => id === userId).length;
                    const targetCount = newType === 'CTV' ? 1 : 2;
                    if (currentCount > targetCount) {
                        let removed = 0;
                        for (let i = queue.length - 1; i >= 0; i--) {
                            if (queue[i] === userId && removed < currentCount - targetCount) {
                                queue.splice(i, 1);
                                removed++;
                            }
                        }
                    } else if (currentCount < targetCount) {
                        for (let i = currentCount; i < targetCount; i++) {
                            queue.push(userId);
                        }
                    }
                    transaction.update(qDoc, { queue });
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
// Toggle HLV cho GV — hỗ trợ format Lớp-Ca (VD: B-Ca1, A-Ca2)
window.toggleCoach = async function (userId, currentlyCoach) {
    const ALL_CLB_CLASSES = ['Mầm', 'D1', 'D2', 'C', 'B', 'A'];
    const ALL_SHIFTS = ['Ca1', 'Ca2', 'Ca3', 'Ca4', 'Ca5'];

    function parseClassEntry(entry) {
        const trimmed = entry.trim();
        if (trimmed.includes('-Ca')) {
            const idx = trimmed.lastIndexOf('-Ca');
            const cls = trimmed.substring(0, idx);
            const shift = trimmed.substring(idx + 1);
            if (ALL_CLB_CLASSES.includes(cls) && ALL_SHIFTS.includes(shift)) return trimmed;
        }
        if (ALL_CLB_CLASSES.includes(trimmed)) return trimmed;
        return null;
    }

    if (currentlyCoach) {
        const userDoc = await db.collection('users').doc(userId).get();
        const currentClasses = userDoc.data()?.coachClasses || [];

        const action = prompt(
            `🏅 HLV đang phụ trách: ${currentClasses.join(', ') || 'Chưa có lớp'}\n\n` +
            `📝 Nhập lớp (cách nhau bằng dấu phẩy):\n` +
            `Lớp: ${ALL_CLB_CLASSES.join(', ')}\n` +
            `Thêm Ca: -Ca1, -Ca2, -Ca3...\n\n` +
            `VD: B-Ca1, A-Ca2, Mầm-Ca3\n` +
            `Nhập "TẮT" để tắt HLV.`,
            currentClasses.join(',')
        );
        if (action === null) return;

        if (action.trim().toUpperCase() === 'TẮT' || action.trim().toUpperCase() === 'TAT') {
            if (!confirm('Tắt quyền HLV cho giáo viên này?')) return;
            await db.collection('users').doc(userId).update({ isCoach: false, coachClasses: [] });
            alert('✅ Đã tắt HLV!');
        } else {
            const classes = action.split(',').map(c => parseClassEntry(c)).filter(Boolean);
            if (classes.length === 0) return alert('⚠️ Không có lớp hợp lệ!\nVD: B-Ca1, A-Ca2, Mầm\nCác lớp: ' + ALL_CLB_CLASSES.join(', '));
            await db.collection('users').doc(userId).update({ coachClasses: classes });
            alert(`✅ Đã cập nhật lớp HLV: ${classes.join(', ')}`);
        }
    } else {
        const classStr = prompt(
            `🏅 BẬT HLV — Chọn lớp phụ trách:\n\n` +
            `Lớp: ${ALL_CLB_CLASSES.join(', ')}\n` +
            `Thêm Ca: -Ca1, -Ca2...\n\n` +
            `VD: B-Ca1, A-Ca2, Mầm-Ca3`,
            'Mầm-Ca1,D1-Ca1'
        );
        if (!classStr) return;
        const classes = classStr.split(',').map(c => parseClassEntry(c)).filter(Boolean);
        if (classes.length === 0) return alert('⚠️ Không có lớp hợp lệ!\nVD: B-Ca1, A-Ca2, Mầm\nCác lớp: ' + ALL_CLB_CLASSES.join(', '));
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

        // Xóa khỏi queue và debtMap
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let queue = doc.data().queue || [];
                    let dm = doc.data().debtMap || {};
                    queue = queue.filter(id => id !== userId);
                    delete dm[userId];
                    transaction.update(qDoc, { queue, debtMap: dm });
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
    if (currentUserRole === 'ADMIN' && !isSuperAdmin) return alert('⚠️ Chỉ Admin chính mới có quyền tạm dừng GV!');
    if (!confirm(`⏸️ Xác nhận TẠM DỪNG "${userName}" khỏi hàng đợi nhận học viên?\n\nGiáo viên sẽ không nhận học viên mới cho đến khi bạn cho phép quay lại.`)) return;
    try {
        await db.collection('users').doc(userId).update({ queuePaused: true });

        // Xóa khỏi queue và debtMap
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (doc.exists) {
                    let queue = doc.data().queue || [];
                    let dm = doc.data().debtMap || {};
                    queue = queue.filter(id => id !== userId);
                    delete dm[userId];
                    transaction.update(qDoc, { queue, debtMap: dm });
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
    if (currentUserRole === 'ADMIN' && !isSuperAdmin) return alert('⚠️ Chỉ Admin chính mới có quyền ưu tiên GV!');
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

        // 2. Đẩy GV lên đầu queue + xóa debt
        const userDoc = await db.collection('users').doc(teacherId).get();
        const branchId = userDoc.data()?.branchId;
        if (branchId) {
            const qDoc = db.collection('queues').doc(branchId);
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(qDoc);
                if (!doc.exists) return;
                let queue = doc.data().queue || [];
                let dm = doc.data().debtMap || {};
                delete dm[teacherId];
                // Remove teacher from current position and put at front
                queue = queue.filter(id => id !== teacherId);
                queue.unshift(teacherId);
                transaction.update(qDoc, { queue, debtMap: dm });
            });
        }

        alert(`⬆️ Đã xóa 1 lần phạt và đẩy "${teacherName}" lên đầu hàng đợi!`);
    } catch (e) {
        console.error('boostTeacher error:', e);
        alert('Lỗi: ' + e.message);
    }
};

// Admin: Xóa 1 nợ lượt cho 1 GV (không đổi vị trí trong hàng đợi)
window.clearTeacherDebt = async function (teacherId, teacherName) {
    if (!confirm(`🔄 Xóa 1 nợ lượt cho "${teacherName}"?\n\nGV giữ nguyên vị trí trong hàng đợi.`)) return;
    try {
        const userDoc = await db.collection('users').doc(teacherId).get();
        const branchId = userDoc.data()?.branchId;
        if (!branchId) return alert('Không tìm thấy chi nhánh GV!');

        const qDoc = db.collection('queues').doc(branchId);
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(qDoc);
            if (!doc.exists) return;
            let dm = doc.data().debtMap || {};
            if ((dm[teacherId] || 0) > 0) {
                dm[teacherId]--;
                if (dm[teacherId] <= 0) delete dm[teacherId];
                transaction.update(qDoc, { debtMap: dm });
            }
        });

        alert(`✅ Đã xóa 1 nợ lượt cho "${teacherName}"!`);
    } catch (e) {
        console.error('clearTeacherDebt error:', e);
        alert('Lỗi: ' + e.message);
    }
};

// Admin: Xóa toàn bộ phạt của 1 cơ sở
window.clearBranchPenalties = async function (branchId, branchName) {
    if (currentUserRole === 'ADMIN' && !isSuperAdmin) return alert('⚠️ Chỉ Admin chính mới có quyền xóa phạt!');
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
    if (currentUserRole === 'ADMIN' && !isSuperAdmin) return alert('⚠️ Chỉ Admin chính mới có quyền cập nhật quyền người dùng!');
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

        const isChief = newRole === 'KETOAN' && document.getElementById(`chief-check-${userId}`)?.checked;

        await db.collection('users').doc(userId).update({
            role: newRole,
            branchId: newRole === 'VIEWER' ? '' : newBranchId,
            isChiefAccountant: isChief
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
var adminDetailedUnsubUsers = null;
var adminDetailedUnsubStudents = null;
var adminDetailedUnsubPenalties = null;

// Helper: build trend chart HTML (day/week/month) for items with date field
function buildTrendChart(items, dateExtractor, chartId, color, label) {
    const now = new Date();

    function buildBars(buckets, labelFn, maxW) {
        const maxVal = Math.max(...Object.values(buckets), 1);
        const keys = Object.keys(buckets).sort();
        let html = `<div style="display:flex; align-items:flex-end; gap:3px; height:80px; padding:4px 0; overflow-x:auto;">`;
        keys.forEach(k => {
            const c = buckets[k];
            const pct = Math.max((c / maxVal) * 100, 3);
            const lbl = labelFn(k);
            const isLast = k === keys[keys.length - 1];
            html += `<div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:${maxW}px;">`;
            html += `<div style="font-size:9px; font-weight:600; color:${c > 0 ? color : 'var(--text-muted)'}; margin-bottom:2px;">${c > 0 ? c : ''}</div>`;
            html += `<div style="width:100%; max-width:${maxW - 4}px; height:${pct}%; background:${isLast ? color : color + '50'}; border-radius:3px 3px 0 0; min-height:3px;"></div>`;
            html += `<div style="font-size:8px; color:${isLast ? color : 'var(--text-muted)'}; margin-top:2px; font-weight:${isLast ? '700' : '400'}; white-space:nowrap;">${lbl}</div>`;
            html += `</div>`;
        });
        html += `</div>`;
        return html;
    }

    // --- Day buckets (14 days) ---
    const dayBuckets = {};
    for (let d = 13; d >= 0; d--) {
        const dt = new Date(now); dt.setDate(dt.getDate() - d);
        dayBuckets[dt.toISOString().split('T')[0]] = 0;
    }
    items.forEach(item => {
        const dt = dateExtractor(item);
        if (dt) { const k = dt.toISOString().split('T')[0]; if (dayBuckets[k] !== undefined) dayBuckets[k]++; }
    });
    const dayHtml = buildBars(dayBuckets, k => k.slice(5), 28);

    // --- Week buckets (8 weeks) ---
    const weekBuckets = {};
    for (let w = 7; w >= 0; w--) {
        const dt = new Date(now); dt.setDate(dt.getDate() - w * 7);
        const mon = new Date(dt); mon.setDate(mon.getDate() - mon.getDay() + 1);
        const k = mon.toISOString().split('T')[0];
        weekBuckets[k] = 0;
    }
    items.forEach(item => {
        const dt = dateExtractor(item);
        if (dt) {
            const mon = new Date(dt); mon.setDate(mon.getDate() - mon.getDay() + 1);
            const k = mon.toISOString().split('T')[0];
            if (weekBuckets[k] !== undefined) weekBuckets[k]++;
        }
    });
    const weekHtml = buildBars(weekBuckets, k => { const d = new Date(k); return `${d.getDate()}/${d.getMonth()+1}`; }, 48);

    // --- Month buckets (6 months) ---
    const monthBuckets = {};
    for (let m = 5; m >= 0; m--) {
        const dt = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const k = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
        monthBuckets[k] = 0;
    }
    items.forEach(item => {
        const dt = dateExtractor(item);
        if (dt) {
            const k = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
            if (monthBuckets[k] !== undefined) monthBuckets[k]++;
        }
    });
    const monthHtml = buildBars(monthBuckets, k => { const [y, m] = k.split('-'); return `T${parseInt(m)}`; }, 60);

    // Toggle buttons + chart panels
    const btnStyle = (active) => `padding:4px 12px; border-radius:6px; border:1px solid ${active ? color + '50' : 'var(--border-color)'}; background:${active ? color + '15' : 'transparent'}; color:${active ? color : 'var(--text-muted)'}; font-size:11px; font-weight:600; cursor:pointer;`;

    let html = `<div style="margin-top:12px;">`;
    html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">`;
    html += `<div style="font-weight:600; color:var(--text-color);"><i class="fa-solid fa-chart-bar" style="color:${color};"></i> ${label}</div>`;
    html += `<div style="display:flex; gap:4px;">`;
    html += `<button onclick="switchTrend('${chartId}','day')" id="${chartId}-btn-day" style="${btnStyle(true)}">14 ngày</button>`;
    html += `<button onclick="switchTrend('${chartId}','week')" id="${chartId}-btn-week" style="${btnStyle(false)}">8 tuần</button>`;
    html += `<button onclick="switchTrend('${chartId}','month')" id="${chartId}-btn-month" style="${btnStyle(false)}">6 tháng</button>`;
    html += `</div></div>`;
    html += `<div id="${chartId}-day">${dayHtml}</div>`;
    html += `<div id="${chartId}-week" style="display:none;">${weekHtml}</div>`;
    html += `<div id="${chartId}-month" style="display:none;">${monthHtml}</div>`;
    html += `</div>`;
    return html;
}

window.switchTrend = function (chartId, mode) {
    ['day', 'week', 'month'].forEach(m => {
        const panel = document.getElementById(`${chartId}-${m}`);
        const btn = document.getElementById(`${chartId}-btn-${m}`);
        if (panel) panel.style.display = m === mode ? 'block' : 'none';
        if (btn) {
            btn.style.background = m === mode ? 'rgba(100,100,100,0.15)' : 'transparent';
            btn.style.fontWeight = m === mode ? '700' : '500';
            btn.style.borderColor = m === mode ? 'var(--text-muted)' : 'var(--border-color)';
            btn.style.color = m === mode ? 'var(--text-color)' : 'var(--text-muted)';
        }
    });
};

function loadAdminDetailedOverview() {
    if (adminDetailedUnsubUsers) adminDetailedUnsubUsers();
    if (adminDetailedUnsubStudents) adminDetailedUnsubStudents();
    if (adminDetailedUnsubPenalties) adminDetailedUnsubPenalties();

    const overviewContainer = document.getElementById('admin-branch-overview');
    if (!overviewContainer) return;

    let usersData = [];
    let studentsData = [];
    let penaltiesData = [];
    let clbAthletesData = [];

    // Dùng chung data users từ _allStaffDocs (loadAdminStaffStats listener)
    // Cập nhật thông qua hàm global
    window._updateDetailedOverviewUsers = function(docs) {
        usersData = docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processOverview();
    };
    // Trigger initial nếu đã có data
    if (_allStaffDocs.length > 0) {
        usersData = _allStaffDocs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // MANAGER: dùng localState (đã có data branch, 0 reads thêm)
    // ADMIN: dùng get() 1 lần (không real-time, phải refresh để cập nhật)
    if (currentUserRole === 'MANAGER') {
        // Manager chỉ cần cơ sở của mình — lấy từ localState
        studentsData = (localState.allStudents || localState.students || []).map(s => ({ ...s }));
        penaltiesData = []; // Sẽ load 1 lần bên dưới
        clbAthletesData = (clbAthletesCache || []).map(a => ({ ...a }));

        // Chỉ load penalties của cơ sở mình (1 lần, nhẹ)
        db.collection('penalties').where('branchId', '==', currentUserBranchId || currentBranchId).get().then(snap => {
            penaltiesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            processOverview();
        }).catch(e => console.warn('Manager penalties load:', e));

        processOverview();
    } else {
        // ADMIN: get() 1 lần, cache 10 phút (tránh load lại 3933 HV mỗi lần mở tab)
        const _ovNow = Date.now();
        if (window._adminOverviewCache && _ovNow - window._adminOverviewCache.ts < 600000) {
            studentsData = window._adminOverviewCache.students;
            penaltiesData = window._adminOverviewCache.penalties;
            clbAthletesData = window._adminOverviewCache.athletes;
            processOverview();
        } else {
            // Load students — TẤT CẢ (cần cho phân tích chi tiết)
            db.collection('students').get().then(snap => {
                studentsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                _cacheOverview();
                processOverview();
            }).catch(e => console.warn('Admin students load:', e));

            // Load penalties
            db.collection('penalties').get().then(snap => {
                penaltiesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                _cacheOverview();
                processOverview();
            }).catch(e => console.warn('Admin penalties load:', e));

            // Load athletes
            db.collection('athletes').get().then(snap => {
                clbAthletesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                _cacheOverview();
                processOverview();
            }).catch(e => console.warn('Admin athletes load:', e));
        }
        function _cacheOverview() {
            window._adminOverviewCache = {
                ts: Date.now(), students: studentsData,
                penalties: penaltiesData, athletes: clbAthletesData
            };
        }

    } // end else ADMIN

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
                    if (currentUserRole === 'ADMIN' || currentUserRole === 'MANAGER') { fullHtml += ` <button onclick="boostTeacher('${tid}','${pc[tid].name.replace(/'/g, "\\\\'")}')" style="padding:1px 5px; font-size:10px; border-radius:4px; border:1px solid rgba(34,197,94,0.4); background:rgba(34,197,94,0.1); color:#16a34a; cursor:pointer;" title="Ưu tiên"><i class="fa-solid fa-arrow-up"></i></button> <button onclick="clearTeacherDebt('${tid}','${pc[tid].name.replace(/'/g, "\\\\'")}')" style="padding:1px 5px; font-size:10px; border-radius:4px; border:1px solid rgba(59,130,246,0.4); background:rgba(59,130,246,0.1); color:#3b82f6; cursor:pointer;" title="Xóa nợ lượt"><i class="fa-solid fa-eraser"></i></button>`; }
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

        // Trend HV toàn hệ thống
        const hvDateExtractor = (s) => {
            if (s.createdAt?.toDate) return s.createdAt.toDate();
            if (s.assignedAt?.toDate) return s.assignedAt.toDate();
            return null;
        };
        fullHtml += buildTrendChart(studentsData, hvDateExtractor, 'trend-hv', '#2563eb', 'Trend HV mới toàn hệ thống');

        fullHtml += `</div></div>`;

        // ======= THỐNG KÊ CLB TL KID =======
        if (clbAthletesData.length > 0) {
            const now = new Date();
            const clbActive = clbAthletesData.filter(a => {
                if (a.status === 'frozen') return false;
                if (!a.expiryDate) return true;
                const exp = a.expiryDate.toDate ? a.expiryDate.toDate() : new Date(a.expiryDate);
                return exp >= now;
            });

            fullHtml += `<div style="background:var(--card-bg); border-radius:12px; border:1px solid var(--border-color); overflow:hidden; margin-top:16px;">`;
            fullHtml += `<div style="padding:14px 18px; background:linear-gradient(135deg, #f59e0b, #d97706); color:white;"><b style="font-size:16px;"><i class="fa-solid fa-medal"></i> Thống Kê CLB TL KID</b></div>`;
            fullHtml += `<div style="padding:16px; font-size:13px;">`;

            // Tổng quan - chỉ hiện đang hoạt động
            fullHtml += `<div style="text-align:center; padding:14px; background:rgba(16,185,129,0.05); border-radius:10px; margin-bottom:14px;">`;
            fullHtml += `<div style="font-size:32px; font-weight:700; color:#10b981;">${clbActive.length}</div>`;
            fullHtml += `<div style="font-size:12px; color:var(--text-muted);">VĐV đang hoạt động</div>`;
            fullHtml += `</div>`;

            // Theo cơ sở
            fullHtml += `<div style="margin-bottom:14px;">`;
            FIXED_BRANCHES.forEach(branch => {
                const brClb = clbAthletesData.filter(a => a.branchId === branch.id);
                const brActive = brClb.filter(a => {
                    if (a.status === 'frozen') return false;
                    if (!a.expiryDate) return true;
                    const exp = a.expiryDate.toDate ? a.expiryDate.toDate() : new Date(a.expiryDate);
                    return exp >= now;
                });
                if (brClb.length > 0) {
                    fullHtml += `<div style="display:flex; justify-content:space-between; padding:6px 10px; background:rgba(245,158,11,0.03); border-radius:6px; margin-bottom:4px;">`;
                    fullHtml += `<span style="font-weight:600;">${branch.name}</span>`;
                    fullHtml += `<span><span style="color:#10b981; font-weight:600;">${brActive.length}</span> / ${brClb.length} VĐV</span>`;
                    fullHtml += `</div>`;
                }
            });
            fullHtml += `</div>`;

            // Trend CLB dùng helper
            const clbDateExtractor = (a) => {
                if (a.createdAt?.toDate) return a.createdAt.toDate();
                if (a.activateDate) {
                    if (a.activateDate.toDate) return a.activateDate.toDate();
                    return new Date(a.activateDate);
                }
                return null;
            };
            fullHtml += buildTrendChart(clbAthletesData, clbDateExtractor, 'trend-clb', '#f59e0b', 'Trend đăng ký VĐV CLB');

            fullHtml += `</div></div>`;
        }

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
var _adminStudentsCache = [];
window._adminStudentsPage = 0;
var ADMIN_PAGE_SIZE = 50;

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

// ============================================================
// ADMIN TOOLS — Backup, Restore, Repair, Health check
// ============================================================

window.repairAllSessions = async function () {
    if (!confirm('🔧 Kiểm tra và sửa toàn bộ HV:\n\n1. Sessions bị lệch → đếm lại attendance (CHỈ KHI có attendance)\n2. Attendance hiện sai GV (do chuyển nhượng) → cập nhật đúng\n\n⚠️ Không reset HV đã chốt lương hoặc chưa có attendance.')) return;
    try {
        const [stuSnap, attSnap, usersSnap] = await Promise.all([
            db.collection('students').get(),
            db.collection('attendance').get(),
            db.collection('users').get()
        ]);

        const teacherNames = {};
        usersSnap.forEach(doc => { teacherNames[doc.id] = doc.data().name || ''; });

        const attCount = {};
        const attByStudent = {};
        attSnap.forEach(doc => {
            const d = doc.data();
            const sid = d.studentId;
            attCount[sid] = (attCount[sid] || 0) + 1;
            if (!attByStudent[sid]) attByStudent[sid] = [];
            attByStudent[sid].push({ ref: doc.ref, teacherId: d.teacherId, teacherName: d.teacherName });
        });

        let fixedSessions = 0, fixedAtt = 0, skipped = 0;
        const sessionFixes = [], attFixes = [];

        const sessionBatch = db.batch();
        stuSnap.forEach(doc => {
            const s = doc.data();
            const actual = attCount[doc.id] || 0;
            const current = s.sessions || 0;
            
            // BỎ QUA THUỴ KHUÊ: điểm danh nhập sau, sessions đã chỉnh tay → không sửa
            if (s.branchId === 'branch_thuy_khue') {
                skipped++;
                return;
            }
            
            // AN TOÀN: CHỈ TĂNG sessions, KHÔNG BAO GIỜ GIẢM
            // (HV cũ có sessions từ increment, không có attendance records)
            if (actual > current) {
                sessionFixes.push(`• "${s.name}": ${current} → ${actual} buổi`);
                sessionBatch.update(doc.ref, { sessions: actual });
                fixedSessions++;
            } else if (actual < current) {
                skipped++;
            }
        });
        if (fixedSessions > 0) await sessionBatch.commit();

        const attBatches = [];
        let currentBatch = db.batch();
        let batchCount = 0;

        stuSnap.forEach(doc => {
            const s = doc.data();
            const correctTeacherId = s.assignedTeacherId;
            const correctTeacherName = teacherNames[correctTeacherId] || '';
            if (!correctTeacherId || !attByStudent[doc.id]) return;

            attByStudent[doc.id].forEach(att => {
                if (att.teacherId !== correctTeacherId) {
                    currentBatch.update(att.ref, {
                        teacherId: correctTeacherId,
                        teacherName: correctTeacherName
                    });
                    batchCount++;
                    fixedAtt++;
                    if (batchCount >= 490) {
                        attBatches.push(currentBatch);
                        currentBatch = db.batch();
                        batchCount = 0;
                    }
                }
            });

            if (fixedAtt > 0 && attFixes.length < 15) {
                const wrongCount = attByStudent[doc.id].filter(a => a.teacherId !== correctTeacherId).length;
                if (wrongCount > 0) attFixes.push(`• "${s.name}": ${wrongCount} records → GV ${correctTeacherName}`);
            }
        });
        if (batchCount > 0) attBatches.push(currentBatch);
        for (const b of attBatches) await b.commit();

        if (fixedSessions === 0 && fixedAtt === 0) {
            alert(`✅ Tất cả dữ liệu đều chính xác. Không cần sửa!\n(${skipped} HV cũ không có attendance đã bỏ qua)`);
            return;
        }

        let msg = `🔧 Đã sửa xong!\n\n`;
        if (fixedSessions > 0) msg += `📊 Sessions lệch: ${fixedSessions} HV\n${sessionFixes.slice(0, 10).join('\n')}\n\n`;
        if (fixedAtt > 0) msg += `📋 Attendance sai GV: ${fixedAtt} records\n${attFixes.join('\n')}\n\n`;
        if (skipped > 0) msg += `⏭️ Bỏ qua ${skipped} HV cũ (không có attendance)`;
        alert(msg);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// ===== BACKUP DỮ LIỆU HỌC VIÊN =====

window.backupStudentData = async function () {
    if (!confirm('💾 BACKUP DỮ LIỆU HỌC VIÊN\n\nSẽ lưu toàn bộ dữ liệu HV vào:\n1. Firestore (collection backup)\n2. File JSON (tải về máy)\n\nTiếp tục?')) return;

    try {
        alert('⏳ Đang backup... Vui lòng đợi.');
        const stuSnap = await db.collection('students').get();
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
        const backupName = `backup_students_${dateStr}_${timeStr}`;

        // 1. Lưu vào Firestore
        const batches = [];
        let batch = db.batch();
        let count = 0;
        const allData = [];

        stuSnap.forEach(doc => {
            const data = doc.data();
            allData.push({ id: doc.id, ...data });

            batch.set(db.collection(backupName).doc(doc.id), data);
            count++;
            if (count % 490 === 0) {
                batches.push(batch);
                batch = db.batch();
            }
        });
        if (count % 490 !== 0) batches.push(batch);

        for (const b of batches) await b.commit();

        // 2. Lưu metadata
        await db.collection('backups').doc(backupName).set({
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            totalStudents: allData.length,
            collectionName: backupName,
            note: `Backup ${allData.length} HV lúc ${now.toLocaleString('vi-VN')}`
        });

        // 3. Tải file JSON
        const json = JSON.stringify(allData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${backupName}.json`;
        a.click();
        URL.revokeObjectURL(url);

        alert(`✅ BACKUP THÀNH CÔNG!\n\n📦 Firestore: ${backupName}\n📄 File JSON: đã tải về máy\n👤 Tổng: ${allData.length} HV\n\n⚠️ Để khôi phục, dùng nút "Restore Backup"`);
    } catch (e) {
        alert('❌ Lỗi backup: ' + e.message);
    }
};

// ===== RESTORE TỪ BACKUP =====

window.restoreFromBackup = async function () {
    try {
        // Lấy danh sách backup
        const backupsSnap = await db.collection('backups').orderBy('createdAt', 'desc').limit(10).get();
        if (backupsSnap.empty) {
            alert('⚠️ Chưa có bản backup nào!');
            return;
        }

        let list = '📦 CHỌN BẢN BACKUP:\n\n';
        const backups = [];
        backupsSnap.forEach((doc, i) => {
            const d = doc.data();
            backups.push({ id: doc.id, ...d });
            list += `${backups.length}. ${d.note || doc.id} (${d.totalStudents} HV)\n`;
        });

        const choice = prompt(list + '\nNhập số (1-' + backups.length + '):');
        if (!choice) return;
        const idx = parseInt(choice) - 1;
        if (idx < 0 || idx >= backups.length) { alert('Số không hợp lệ!'); return; }

        const selected = backups[idx];
        if (!confirm(`⚠️ KHÔI PHỤC TỪ:\n${selected.note}\n\nSẽ GHI ĐÈ toàn bộ sessions của ${selected.totalStudents} HV!\n\nChắc chắn?`)) return;

        alert('⏳ Đang khôi phục... Vui lòng đợi.');
        const backupSnap = await db.collection(selected.collectionName).get();

        const batches = [];
        let batch = db.batch();
        let count = 0;
        let restored = 0;

        backupSnap.forEach(doc => {
            const backupData = doc.data();
            const ref = db.collection('students').doc(doc.id);
            // Chỉ restore sessions (không ghi đè toàn bộ)
            batch.update(ref, { sessions: backupData.sessions || 0 });
            count++;
            restored++;
            if (count % 490 === 0) {
                batches.push(batch);
                batch = db.batch();
            }
        });
        if (count % 490 !== 0) batches.push(batch);

        for (const b of batches) await b.commit();

        alert(`✅ KHÔI PHỤC THÀNH CÔNG!\n\n🔄 Đã restore sessions cho ${restored} HV\nTừ: ${selected.note}`);
        location.reload();
    } catch (e) {
        alert('❌ Lỗi restore: ' + e.message);
    }
};

// ===== KHÔI PHỤC: Dùng Google Sheet + max sessionNumber attendance =====

window.restoreWronglyResetStudents = async function () {
    if (!confirm('🚨 KHÔI PHỤC SỐ BUỔI HỌC\n\nNguồn khôi phục:\n1. Google Sheet (cột Số buổi)\n2. Attendance records (sessionNumber cao nhất có ngày)\n3. Chốt lương (tối thiểu 7)\n\n→ Lấy giá trị LỚN NHẤT. Tiếp tục?')) return;

    try {
        // 1. Đọc data từ CSV file (user upload)
        let sheetData = [];
        try {
            sheetData = await new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv';
                input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) { resolve([]); return; }
                    const text = await file.text();
                    const lines = text.split('\n').filter(l => l.trim());
                    const result = [];
                    for (let i = 1; i < lines.length; i++) {
                        // Parse CSV (handle commas in quotes)
                        const cols = [];
                        let current = '';
                        let inQuotes = false;
                        for (const ch of lines[i]) {
                            if (ch === '"') { inQuotes = !inQuotes; }
                            else if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = ''; }
                            else { current += ch; }
                        }
                        cols.push(current.trim());

                        const contract = (cols[4] || '').trim();
                        const name = (cols[3] || '').trim();

                        // ĐẾM SỐ CỘT CÓ NGÀY sau cột 10 (Số buổi)
                        // Cột 11+ là các ngày điểm danh thực tế
                        let dateCount = 0;
                        for (let c = 11; c < cols.length; c++) {
                            const val = (cols[c] || '').trim();
                            if (val && val.match(/\d+\/\d+/)) {
                                dateCount++;
                            }
                        }

                        // Nếu không có cột ngày → sessions = 0 (chưa điểm danh trong Sheet)
                        const sessions = dateCount;

                        if (contract) {
                            result.push({ contract, name, sessions, dateCount, branch: file.name });
                        }
                    }
                    console.log('CSV parsed:', result.length, 'records. Sample:', result.slice(0, 5));
                    resolve(result);
                };
                input.oncancel = () => resolve([]);
                alert('📁 Chọn file CSV từ Google Sheet.\n\nĐẾM SỐ CỘT NGÀY (không dùng cột Số buổi)\n\nCách tải: Mở Sheet → Tệp → Tải xuống → CSV');
                input.click();
            });
        } catch (sheetErr) {
            console.warn('CSV read error:', sheetErr);
        }

        if (sheetData.length === 0) {
            if (!confirm('⚠️ Không có dữ liệu Sheet.\n\nTiếp tục khôi phục chỉ từ Attendance records?')) return;
        }        // 2. Đọc students + attendance từ Firestore
        const [stuSnap, attSnap] = await Promise.all([
            db.collection('students').get(),
            db.collection('attendance').get()
        ]);

        // 3. Tìm max sessionNumber cho mỗi student (chỉ tính buổi có ngày)
        const maxSessionByStudent = {};
        const attCountByStudent = {};
        attSnap.forEach(doc => {
            const d = doc.data();
            const sid = d.studentId;
            const sNum = d.sessionNumber || 0;
            const hasDate = !!d.createdAt;

            // Đếm tổng attendance records
            attCountByStudent[sid] = (attCountByStudent[sid] || 0) + 1;

            // Lấy sessionNumber cao nhất (ưu tiên buổi có ngày)
            if (!maxSessionByStudent[sid] || sNum > maxSessionByStudent[sid]) {
                maxSessionByStudent[sid] = sNum;
            }
        });

        // 4. Map Sheet: contractNumber → sessions
        const sheetMap = {};
        sheetData.forEach(item => {
            const key = item.contract;
            if (!sheetMap[key] || item.sessions > sheetMap[key].sessions) {
                sheetMap[key] = item;
            }
        });

        alert(`✅ Đọc xong!\n• Sheet: ${sheetData.length} records\n• Attendance: ${attSnap.size} records\n\nĐang so sánh...`);

        // 5. So sánh và tạo danh sách cần sửa
        const batches = [];
        let currentBatch = db.batch();
        let batchCount = 0;
        let fixed = 0;
        const fixes = [];

        stuSnap.forEach(doc => {
            const s = doc.data();
            
            // BỎ QUA THUỴ KHUÊ: điểm danh nhập sau, sessions đã chỉnh tay → không sửa
            if (s.branchId === 'branch_thuy_khue') return;
            
            const contract = (s.contractNumber || '').trim();
            const currentSessions = s.sessions || 0;
            const total = s.totalSessions || 10;
            const sheetRecord = sheetMap[contract];
            const maxSN = maxSessionByStudent[doc.id] || 0;
            const attCount = attCountByStudent[doc.id] || 0;

            let correctSessions = currentSessions;
            let source = '';

            // Tính từ attendance
            let attEstimate = Math.max(maxSN, attCount);

            if (sheetRecord) {
                // CÓ TRONG SHEET → lấy MAX giữa Sheet dates và attendance
                correctSessions = Math.max(sheetRecord.sessions, attEstimate);
                source = `Sheet=${sheetRecord.sessions}dates, att=${attEstimate}`;
            } else if (maxSN === 0 && attCount === 0) {
                // KHÔNG CÓ SHEET + KHÔNG CÓ ATTENDANCE → chưa học = 0
                if (currentSessions > 0) {
                    correctSessions = 0;
                    source = 'Không att, không Sheet → 0';
                }
            } else {
                // KHÔNG CÓ SHEET nhưng CÓ ATTENDANCE
                if ((s.salaryConfirmed || s.salarySubmittedMonth) && attEstimate < 7) {
                    attEstimate = 7;
                }
                correctSessions = attEstimate;
                source = `maxBuổi=${maxSN}, att=${attCount}`;
            }

            // ĐÃ CHỐT LƯƠNG + KHÔNG CÓ ATTENDANCE → đã học xong = totalSessions
            if ((s.salaryConfirmed || s.salarySubmittedMonth) && attEstimate === 0) {
                if (correctSessions < total) {
                    correctSessions = total;
                    source += ' + CHỐT LƯƠNG+0att→full';
                }
            }

            // Giới hạn không vượt totalSessions
            correctSessions = Math.min(correctSessions, total);

            // Cần sửa? (CẢ TĂNG VÀ GIẢM nếu có Sheet data)
            if (correctSessions !== currentSessions) {
                fixes.push(`• "${s.name}" (${contract}): ${currentSessions} → ${correctSessions} [${source}]`);
                currentBatch.update(doc.ref, { sessions: correctSessions });
                batchCount++;
                fixed++;

                if (batchCount >= 490) {
                    batches.push(currentBatch);
                    currentBatch = db.batch();
                    batchCount = 0;
                }
            }
        });

        if (fixed === 0) {
            alert(`✅ Không có HV nào cần khôi phục!\n\nĐã kiểm tra ${stuSnap.size} HV.`);
            return;
        }

        // Preview
        let preview = `🚨 SẼ KHÔI PHỤC ${fixed} HV:\n\n`;
        preview += fixes.slice(0, 20).join('\n');
        if (fixes.length > 20) preview += `\n... và ${fixes.length - 20} HV khác`;
        preview += '\n\nBẤM OK ĐỂ ÁP DỤNG';

        if (!confirm(preview)) {
            alert('❌ Đã huỷ.');
            return;
        }

        if (batchCount > 0) batches.push(currentBatch);
        for (const b of batches) await b.commit();

        alert(`✅ Đã khôi phục ${fixed} HV thành công!`);
        console.log('RESTORE FULL LIST:', fixes);
    } catch (e) {
        console.error('Restore error:', e);
        alert('Lỗi: ' + e.message);
    }
};

// ===== AUDIT: Đối chiếu toàn bộ sessions vs attendance (chi tiết) =====

window.reportDataHealth = async function () {
    try {
        const [stuSnap, attSnap, usersSnap] = await Promise.all([
            db.collection('students').get(),
            db.collection('attendance').get(),
            db.collection('users').get()
        ]);
        const teacherNames = {};
        usersSnap.forEach(doc => { teacherNames[doc.id] = doc.data().name || ''; });

        const attCount = {}, attByStudent = {};
        attSnap.forEach(doc => {
            const d = doc.data(); const sid = d.studentId;
            attCount[sid] = (attCount[sid] || 0) + 1;
            if (!attByStudent[sid]) attByStudent[sid] = [];
            attByStudent[sid].push({ teacherId: d.teacherId, teacherName: d.teacherName });
        });

        let report = `📊 BÁO CÁO SỨC KHỎE DỮ LIỆU\n`;
        report += `━━━━━━━━━━━━━━━━━━\n`;
        report += `📦 Tổng HV: ${stuSnap.size}\n`;
        report += `📋 Tổng records điểm danh: ${attSnap.size}\n\n`;

        let sessErr = 0, attErr = 0;
        let sessList = [], attList = [];

        stuSnap.forEach(doc => {
            const s = doc.data();
            const actual = attCount[doc.id] || 0;
            const current = s.sessions || 0;
            if (actual !== current) {
                sessList.push(`  • "${s.name}": hiện ${current}, thực tế ${actual} buổi`);
                sessErr++;
            }
            const tid = s.assignedTeacherId;
            if (tid && attByStudent[doc.id]) {
                const wrong = attByStudent[doc.id].filter(a => a.teacherId !== tid);
                if (wrong.length > 0) {
                    const wrongGVs = [...new Set(wrong.map(r => r.teacherName))].join(', ');
                    attList.push(`  • "${s.name}": GV đúng = ${teacherNames[tid]}, ${wrong.length}/${attByStudent[doc.id].length} records đang ghi sai (${wrongGVs})`);
                    attErr++;
                }
            }
        });

        if (sessErr === 0 && attErr === 0) {
            report += '✅ TẤT CẢ DỮ LIỆU CHÍNH XÁC!\nKhông có lỗi nào.';
        } else {
            if (sessErr > 0) {
                report += `❌ Sessions lệch: ${sessErr} HV\n${sessList.join('\n')}\n\n`;
            }
            if (attErr > 0) {
                report += `❌ Attendance sai GV: ${attErr} HV\n${attList.join('\n')}`;
            }
            report += `\n\n→ Bấm nút 🔧 Sửa để tự động sửa.`;
        }
        alert(report);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

