// ===== GreenPool App — Auth & Profile (v11.0) =====
// Đăng nhập, hồ sơ người dùng, dark mode

// ===================== DARK/LIGHT MODE LOGIC ===================== //
var themeToggleBtn = document.getElementById('theme-toggle-btn'); // This declaration is now redundant but kept as per instruction to only make specified changes.

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

// Admin đổi mật khẩu user
window.adminResetUserPassword = async function () {
    if (!isSuperAdmin) return alert('⚠️ Chỉ Admin chính mới có quyền đổi mật khẩu người dùng!');
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

// KHÔNG CHẠY KHỞI TẠO CƠ SỞ Ở ĐÂY NỮA MÀ CHỜ AUTH DUYỆT XONG MỚI CHẠY (initFixedBranches trong auth.onAuthStateChanged)

// ===================== AUTHENTICATION LOGIC (inside DOMContentLoaded) ===================== //
// Helper ẩn splash screen
