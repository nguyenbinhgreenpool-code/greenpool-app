// ===== GreenPool App — Utils & Helpers (v11.0) =====
// Các hàm tiện ích dùng chung

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

// Clear old listeners
function clearListeners() {
    unsubs.forEach(unsub => unsub());
    unsubs = [];
    localState.teachers = [];
    localState.sales = [];
    localState.students = [];
    localState.archivedStudentCount = 0;
    localState.showArchived = false;
    localState.archivedStudents = [];
    localState.queue = [];
    localState.debtMap = {};
    localState.testingMap = {};
    localState.queueLoaded = false;
    localState.firedUsers = [];
}

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

// Format số tiền với dấu chấm ngàn
