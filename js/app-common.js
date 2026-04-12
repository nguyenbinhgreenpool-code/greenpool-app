// ===== GreenPool App — Common Module (v7.0) =====
// Event Bindings, Auth, Login/Register

// ===================== LAZY LOAD ROLE SCRIPTS ===================== //
const _loadedScripts = {};
function loadRoleScripts(role) {
    const v = '7.0';
    const roleMap = {
        'ADMIN':     ['app-admin.js', 'app-sale.js', 'app-teacher.js', 'app-letan.js', 'app-clb.js', 'app-customer.js'],
        'MANAGER':   ['app-admin.js', 'app-sale.js', 'app-teacher.js', 'app-letan.js', 'app-clb.js'],
        'SALE':      ['app-sale.js'],
        'TEACHER':   ['app-teacher.js', 'app-clb.js'],
        'LETAN':     ['app-letan.js'],
        'KETOAN':    ['app-admin.js'],
        'KHACHHANG': ['app-customer.js']
    };
    const files = roleMap[role] || [];
    const promises = files.map(file => {
        if (_loadedScripts[file]) return _loadedScripts[file];
        const p = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'js/' + file + '?v=' + v;
            s.onload = resolve;
            s.onerror = () => { console.error('Failed to load:', file); resolve(); };
            document.body.appendChild(s);
        });
        _loadedScripts[file] = p;
        return p;
    });
    return Promise.all(promises);
}

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
                        // Số HĐ CLB (tuỳ chọn)
                        const contractInput = document.getElementById('auth-contract-number')?.value?.trim();

                        if (contractInput) {
                            // Có nhập số HĐ → validate và liên kết
                            const athleteSnap = await db.collection('athletes').where('contractNumber', '==', contractInput).get();
                            if (athleteSnap.empty) {
                                // Xoá tài khoản vừa tạo nếu HĐ sai
                                if (cred?.user) {
                                    await db.collection('users').doc(cred.user.uid).delete().catch(() => {});
                                    await cred.user.delete().catch(() => {});
                                }
                                window._isRegistering = false;
                                throw new Error(`Số hợp đồng "${contractInput}" không tồn tại trong hệ thống! Vui lòng kiểm tra lại hoặc bỏ trống để đăng ký không liên kết.`);
                            }
                            const athleteDoc = athleteSnap.docs[0];
                            const athleteData = athleteDoc.data();

                            // Lưu linked contract vào user doc
                            await db.collection('users').doc(cred.user.uid).update({
                                linkedAthleteIds: [athleteDoc.id],
                                linkedContracts: [{
                                    athleteId: athleteDoc.id,
                                    contractNumber: contractInput,
                                    athleteName: athleteData.name || '',
                                    linkedAt: new Date().toISOString()
                                }]
                            });

                            window._isRegistering = false;
                            alert(`✅ Đăng ký thành công!\n\nĐã liên kết HĐ: ${contractInput}\nVĐV: ${athleteData.name || 'N/A'}\n\nChào mừng bạn đến GreenPool.`);
                        } else {
                            // Không nhập HĐ → đăng ký bình thường, dùng tra cứu
                            window._isRegistering = false;
                            alert('✅ Đăng ký thành công!\n\nBạn có thể tra cứu tiến trình bằng tên hoặc số HĐ.\nNếu có HĐ CLB, bạn có thể liên kết sau trong mục "Thêm HĐ".');
                        }
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
                        // Lazy load role scripts trước khi init UI
                        await loadRoleScripts(currentUserRole);
                        applyRoleUI(currentUserRole);
                        initFixedBranches();
                        listenToNotifications();
                        requestNotificationPermission();
                        // Chạy cleanup video hết hạn sau khi auth xác nhận xong
                        if (currentUserRole === 'TEACHER' || currentUserRole === 'ADMIN') {
                            setTimeout(() => { if (typeof cleanupExpiredVideos === 'function') cleanupExpiredVideos(); }, 3000);
                        }
                    }
                    setupLogoutHeader(data.name, currentUserRole, data.avatarUrl);
                    currentUserDisplayName = data.name || 'Người dùng';
                    renderUserProfile(data);
                } else {
                    // userDoc null → retry 1 lần sau 2s (có thể do cache hết hạn)
                    console.warn('⚠️ userDoc not found, retrying in 2s...');
                    setTimeout(async () => {
                        try {
                            const retryDoc = await db.collection('users').doc(user.uid).get();
                            if (retryDoc.exists) {
                                console.log('✅ Retry success, reloading...');
                                window.location.reload();
                            } else {
                                console.error('❌ userDoc still not found after retry');
                                auth.signOut();
                            }
                        } catch (retryErr) {
                            console.warn('Retry also failed, keeping session:', retryErr);
                        }
                    }, 2000);
                }
            } catch (e) {
                console.error("Auth state error", e);
                // KHÔNG sign out khi lỗi — giữ phiên đăng nhập, thử lại sau 5s
                console.warn('⚠️ Giữ phiên đăng nhập, thử tải lại sau 5s...');
                setTimeout(async () => {
                    try {
                        const retryDoc = await db.collection('users').doc(user.uid).get();
                        if (retryDoc.exists) {
                            console.log('✅ Retry success, reloading...');
                            window.location.reload();
                        }
                    } catch (retryErr) {
                        console.warn('Retry failed, keeping session:', retryErr);
                    }
                }, 5000);
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
        document.body.classList.remove('role-admin', 'role-sale', 'role-teacher', 'role-manager', 'role-letan', 'role-ketoan');
        document.body.classList.add('role-' + role.toLowerCase());

        // Hide Admin + Letan + CLB + SaleStats tab default
        const adminTab = document.getElementById('nav-item-admin');
        const letanTab = document.getElementById('nav-item-letan');
        const clbTab = document.getElementById('nav-item-clb');
        const saleStatsTab = document.getElementById('nav-item-salestats');
        const financeTab = document.getElementById('nav-item-finance');
        if (adminTab) adminTab.style.display = 'none';
        if (letanTab) letanTab.style.display = 'none';
        if (clbTab) clbTab.style.display = 'none';
        if (saleStatsTab) saleStatsTab.style.display = 'none';
        if (financeTab) financeTab.style.display = 'none';

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
                if (typeof listenToAthletes === 'function') listenToAthletes();
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
            const salarySection = document.getElementById('teacher-salary-section');
            if (salarySection) salarySection.style.display = 'block';
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
            if (financeTab) financeTab.style.display = 'flex';
            const clbAdminActions = document.getElementById('clb-admin-actions');
            if (clbAdminActions) clbAdminActions.style.display = 'flex';
            const qDbg = document.getElementById('btn-queue-debug');
            if (qDbg) qDbg.style.display = 'inline-flex';
            const qHist = document.getElementById('btn-queue-history');
            if (qHist) qHist.style.display = 'inline-flex';
            document.querySelector('[data-tab="dashboard"]').click();
            if (typeof loadAdminUsers === 'function') loadAdminUsers();
            if (typeof loadAdminClbStudents === 'function') loadAdminClbStudents();
            if (typeof listenToAthletes === 'function') listenToAthletes();
            if (typeof renderLetanClbSection === 'function') renderLetanClbSection();
            if (typeof initFinanceFilters === 'function') initFinanceFilters();
        } else if (role === 'MANAGER') {
            // MANAGER: Xem tất cả tab + chỉnh sửa giống Admin nhưng chỉ cơ sở của mình
            if (adminTab) adminTab.style.display = 'flex';
            if (letanTab) letanTab.style.display = 'flex';
            if (clbTab) clbTab.style.display = 'flex';
            if (financeTab) financeTab.style.display = 'flex';
            if (saleStatsTab) saleStatsTab.style.display = 'flex';
            const qDbg2 = document.getElementById('btn-queue-debug');
            if (qDbg2) qDbg2.style.display = 'inline-flex';
            const qHist2 = document.getElementById('btn-queue-history');
            if (qHist2) qHist2.style.display = 'inline-flex';
            document.querySelector('[data-tab="dashboard"]').click();
            if (typeof loadAdminUsers === 'function') loadAdminUsers();
            if (typeof loadAdminClbStudents === 'function') loadAdminClbStudents();
            if (typeof listenToAthletes === 'function') listenToAthletes();
            if (typeof renderLetanClbSection === 'function') renderLetanClbSection();
            if (typeof initFinanceFilters === 'function') initFinanceFilters();

            // Chỉ ẩn phần duyệt TK + phân quyền đối với MANAGER khác cơ sở (ở bước js filter)
            // Bỏ ẩn CSS để render ra được
            // const style = document.createElement('style');
            // style.textContent = `
            //     .manager-branch #admin-approval-section,
            //     .manager-branch [onclick*="approveUser"],
            //     .manager-branch [onclick*="rejectUser"] { display: none !important; }
            // `;
            // document.head.appendChild(style);
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
            if (typeof renderLetanClbSection === 'function') renderLetanClbSection();
        } else if (role === 'KETOAN') {
            // KETOAN: Dashboard (giới hạn) + Finance + Admin (chỉ bảng HV)
            const sTab = document.querySelector('[data-tab="sale"]');
            if (sTab) sTab.style.display = 'none';
            const tTab = document.querySelector('[data-tab="teacher"]');
            if (tTab) tTab.style.display = 'none';
            const khTab = document.querySelector('[data-tab="khachhang"]');
            if (khTab) khTab.style.display = 'none';
            if (financeTab) financeTab.style.display = 'flex';
            if (adminTab) adminTab.style.display = 'flex';

            // Ẩn lượt chia + HV đang học tại bể trên Dashboard
            const queueSec = document.getElementById('dashboard-queue-section');
            if (queueSec) queueSec.style.display = 'none';
            const testQueueSec = document.getElementById('test-queue-section');
            if (testQueueSec) testQueueSec.style.display = 'none';
            const poolSec = document.getElementById('dashboard-pool-section');
            if (poolSec) poolSec.style.display = 'none';

            // Admin: chỉ hiện bảng Hệ Thống Quản Lý Học Viên
            const secApproval = document.getElementById('admin-sec-approval');
            if (secApproval) secApproval.style.display = 'none';
            const secStaff = document.getElementById('admin-sec-staff');
            if (secStaff) secStaff.style.display = 'none';
            const secStats = document.getElementById('admin-sec-stats');
            if (secStats) secStats.style.display = 'none';
            const secBranch = document.getElementById('admin-sec-branch-overview');
            if (secBranch) secBranch.style.display = 'none';
            // Ẩn nút đổi MK user
            const changePwBtn = document.getElementById('btn-admin-change-pw');
            if (changePwBtn) changePwBtn.style.display = 'none';

            document.querySelector('[data-tab="dashboard"]').click();
            if (typeof loadAdminUsers === 'function') loadAdminUsers();
            if (typeof initFinanceFilters === 'function') initFinanceFilters();
            if (typeof loadAdminClbStudents === 'function') loadAdminClbStudents();
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
            // Populate branch dropdown cho Khách
            if (typeof populateKhachhangBranches === 'function') populateKhachhangBranches();
            // Load HĐ đã liên kết
            if (typeof loadLinkedContracts === 'function') loadLinkedContracts();
        }
    }

    function setupLogoutHeader(name, role, avatarUrl) {
        const roleNames = {
            'ADMIN': '💎 Giám Đốc',
            'MANAGER': '🏢 Quản lý Cơ sở',
            'SALE': '💼 Chuyên viên Sale',
            'TEACHER': '🏊 Huấn luyện viên',
            'LETAN': '📋 Lễ tân',
            'KETOAN': '💰 Kế toán',
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
                if (typeof renderLetanManageTable === 'function') renderLetanManageTable();
            }
            if (li.getAttribute('data-tab') === 'clb') {
                if (typeof renderClbTable === 'function') renderClbTable();
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

    // Xử lý chuyển đổi curriculum (Bơi / Lặn / PT)
    window.handleCurriculumChange = function (idx, value) {
        const ptGroup = document.getElementById(`sale-pt-group-${idx}`);
        const diveGroup = document.getElementById(`sale-dive-teacher-group-${idx}`);
        if (ptGroup) ptGroup.style.display = value === 'PT' ? 'block' : 'none';
        if (diveGroup) {
            if (isDivingCurriculum(value)) {
                diveGroup.style.display = 'block';
                // Populate danh sách GV Lặn
                const sel = document.getElementById(`sale-dive-teacher-${idx}`);
                if (sel) {
                    sel.innerHTML = '';
                    const diveTeachers = localState.teachers.filter(t => t.canDive);
                    if (diveTeachers.length === 0) {
                        sel.innerHTML = '<option value="">Chưa có GV Lặn</option>';
                    } else {
                        diveTeachers.forEach(t => {
                            sel.innerHTML += `<option value="${t.id}">${t.name}</option>`;
                        });
                    }
                }
            } else {
                diveGroup.style.display = 'none';
            }
        }
    };

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
                    <label>Số Điện Thoại <span style="color:#ef4444">*</span></label>
                    <input type="tel" id="sale-student-phone-${i}" placeholder="Nhập số điện thoại...">
                </div>
                <div class="form-group">
                    <label>Số Hợp Đồng <span style="color:#ef4444">*</span></label>
                    <input type="text" id="sale-student-contract-${i}" placeholder="Ví dụ: HD00${i}...">
                </div>
                <div class="row-form">
                    <div class="form-group flex-1">
                        <label>Kiểu Bơi / Lặn <span style="color:#ef4444">*</span></label>
                        <select id="sale-student-curriculum-${i}" class="modern-select" onchange="handleCurriculumChange(${i}, this.value)">
                            <optgroup label="Bơi Ếch">
                                <option value="Ếch Trẻ em">Ếch Trẻ em</option>
                                <option value="Ếch Người lớn">Ếch Người lớn</option>
                            </optgroup>
                            <optgroup label="Bơi Sải">
                                <option value="Sải Trẻ em">Sải Trẻ em</option>
                                <option value="Sải Người lớn">Sải Người lớn</option>
                            </optgroup>
                            <optgroup label="Ếch Vip (15 buổi)">
                                <option value="Ếch Vip Trẻ em">Ếch Vip Trẻ em</option>
                                <option value="Ếch Vip Người lớn">Ếch Vip Người lớn</option>
                            </optgroup>
                            <optgroup label="Sải Vip (15 buổi)">
                                <option value="Sải Vip Trẻ em">Sải Vip Trẻ em</option>
                                <option value="Sải Vip Người lớn">Sải Vip Người lớn</option>
                            </optgroup>
                            <optgroup label="🤿 Lặn">
                                <option value="Dolphin 1">🤿 Dolphin 1 (4 buổi)</option>
                                <option value="Dolphin 2">🤿 Dolphin 2 (4 buổi)</option>
                                <option value="Lặn Tiên cá">🧜 Lặn Tiên cá (4 buổi)</option>
                                <option value="Trải nghiệm Tiên cá">🧜 Trải nghiệm Tiên cá (1 buổi)</option>
                            </optgroup>
                            <optgroup label="Khác">
                                <option value="Bơi Ngửa">Bơi Ngửa</option>
                                <option value="Bơi Bướm">Bơi Bướm</option>
                                <option value="PT">Khách PT (Cá nhân)</option>
                            </optgroup>
                        </select>
                    </div>
                    <div class="form-group" id="sale-pt-group-${i}" style="display: none; flex: 1;">
                        <label>Số buổi PT</label>
                        <input type="number" id="sale-student-pt-${i}" placeholder="Nhập số buổi..." min="1" value="10">
                    </div>
                    <div class="form-group" id="sale-dive-teacher-group-${i}" style="display: none; flex: 1;">
                        <label>GV Lặn <span style="color:#ef4444">*</span></label>
                        <select id="sale-dive-teacher-${i}" class="modern-select" style="border-color:#06b6d4; background:rgba(6,182,212,0.08); color:#0891b2;"></select>
                    </div>
                </div>
                <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px;">
                    <input type="checkbox" id="sale-student-test-${i}" style="width:16px; height:16px; cursor:pointer;">
                    <label for="sale-student-test-${i}" style="font-size:13px; color:var(--text-muted); cursor:pointer; margin:0;">🧪 Học viên test đăng ký</label>
                </div>
                <details style="margin-top: 6px;">
                    <summary style="font-size: 14px; color: var(--text-color); cursor: pointer; user-select: none; font-weight: 600;">
                        <i class="fa-solid fa-plus-circle"></i> Thông tin bổ sung
                    </summary>
                    <div style="margin-top: 8px;">
                        <div class="row-form">
                            <div class="form-group flex-1">
                                <label>Giới tính</label>
                                <select id="sale-student-gender-${i}" class="modern-select">
                                    <option value="Nam">Nam</option>
                                    <option value="Nữ">Nữ</option>
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
                    const rawCurriculum = document.getElementById('sale-student-curriculum-1')?.value || 'Ếch Trẻ em';
                    const { curriculum, ageCategory } = parseCurriculumValue(rawCurriculum);
                    const phone = document.getElementById('sale-student-phone-1')?.value || '';
                    const gender = document.getElementById('sale-student-gender-1')?.value || 'Nam';
                    const age = parseInt(document.getElementById('sale-student-age-1')?.value) || 0;
                    const ptSessions = document.getElementById('sale-student-pt-1')?.value || '10';
                    const teacherId = document.getElementById('select-teacher-view-self')?.value;
                    const selfRecruitReason = document.getElementById('self-recruit-reason')?.value || '';

                    if (!name) return alert('❌ Vui lòng nhập Tên học viên!');
                    if (!phone) return alert('❌ Vui lòng nhập Số điện thoại!');
                    if (!contractNumber) return alert('❌ Vui lòng nhập Số hợp đồng!');
                    if (!teacherId) return alert('❌ Chưa chọn Giáo viên tự tuyển!');
                    if (!selfRecruitReason) return alert('❌ Vui lòng chọn Lý do tự tuyển!');

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

                    const selfTotalSessions = (curriculum === 'Ếch Vip' || curriculum === 'Sải Vip') ? 15 : (curriculum === 'PT' ? (parseInt(ptSessions) || 10) : 10);
                    const isTestStudent = document.getElementById('sale-student-test-1')?.checked || false;
                    await db.collection('students').add({
                        name, phone, gender, ageCategory, age: age || 0, assignedTeacherId: teacherId,
                        contractNumber: contractNumber || 'Chưa có',
                        branchId: currentBranchId, sessions: 0,
                        totalSessions: selfTotalSessions,
                        curriculum: curriculum || 'Bơi Ếch', source: 'Self',
                        creatorId: currentUserId,
                        isTestStudent: isTestStudent,
                        selfRecruitReason: selfRecruitReason,
                        sheetSyncedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    // Auto sync lên Google Sheet
                    const tObjSelf = localState.teachers.find(t => t.id === teacherId);
                    const branchObjSelf = FIXED_BRANCHES.find(b => b.id === currentBranchId);
                    syncToGoogleSheet({
                        action: 'addRow',
                        branchName: branchObjSelf?.name || 'N/A',
                        stt: '',
                        syncTime: new Date().toLocaleString('vi-VN'),
                        createdAt: new Date().toLocaleDateString('vi-VN'),
                        name,
                        contractNumber: contractNumber || 'Chưa có',
                        phone: phone || '',
                        curriculum: curriculum || 'Bơi Ếch',
                        ageCategory: ageCategory || '',
                        teacherName: tObjSelf?.name || 'N/A',
                        saleName: currentUserDisplayName || 'Sale',
                        sessions: selfTotalSessions
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
                    const phoneVal = document.getElementById(`sale-student-phone-${i}`)?.value;
                    if (!name || !contract) {
                        showSaleTab(i);
                        return alert(`❌ HV ${i}: Vui lòng nhập đủ Tên và Số HĐ!`);
                    }
                    if (!phoneVal) {
                        showSaleTab(i);
                        return alert(`❌ HV ${i}: Vui lòng nhập Số điện thoại!`);
                    }
                }

                // Submit all students
                for (let i = 1; i <= count; i++) {
                    const name = document.getElementById(`sale-student-name-${i}`).value;
                    const phone = document.getElementById(`sale-student-phone-${i}`).value;
                    const gender = document.getElementById(`sale-student-gender-${i}`)?.value || 'Nam';
                    const age = parseInt(document.getElementById(`sale-student-age-${i}`)?.value) || 0;
                    const contractNumber = document.getElementById(`sale-student-contract-${i}`).value;
                    const rawCurriculum = document.getElementById(`sale-student-curriculum-${i}`).value;
                    const { curriculum, ageCategory } = parseCurriculumValue(rawCurriculum);
                    const ptSessions = document.getElementById(`sale-student-pt-${i}`)?.value || '10';

                    // Xác định teacherId theo loại curriculum
                    let finalTeacherId = teacherId;
                    let isDiving = false;
                    if (isDivingCurriculum(rawCurriculum)) {
                        const diveSel = document.getElementById(`sale-dive-teacher-${i}`);
                        finalTeacherId = diveSel?.value;
                        if (!finalTeacherId) return alert(`❌ HV ${i}: Vui lòng chọn GV Lặn!`);
                        isDiving = true;
                    }

                    const isFirstStudent = (i === 1);
                    const isTest = document.getElementById(`sale-student-test-${i}`)?.checked || false;
                    // Lặn: không theo queue (isDiving=true → truyền isException=true để skip queue, nhưng không ghi nợ)
                    const isExceptionForThisStudent = isDiving ? true : (isSaleExceptionMode && isFirstStudent);
                    await saleAssignStudent(name, phone, gender, ageCategory, contractNumber, finalTeacherId, curriculum, ptSessions, isExceptionForThisStudent, age, isTest, isDiving);
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
            // Thông báo Sale: GV đã chốt lương
            const stuDoc = await db.collection('students').doc(studentId).get();
            const stuData = stuDoc.exists ? stuDoc.data() : {};
            const saleUserId = stuData.creatorId || stuData.saleId;
            if (saleUserId && saleUserId !== currentUserId) {
                const teacherName = window._currentUserData?.name || 'GV';
                await sendNotification(saleUserId, 'salary', `💰 GV "${teacherName}" đã chốt lương cho HV "${studentName}". Vui lòng xác nhận.`);
            }
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
                // Re-render Finance tab khi chuyển CS
                if (typeof renderFinanceTab === 'function') renderFinanceTab();
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

