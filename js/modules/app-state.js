// ===== GreenPool App — State & Config (v11.0) =====
// Biến toàn cục, cấu hình hệ thống
// Load FIRST — tất cả modules khác phụ thuộc file này

// ===================== STATE KHAI BÁO & FIREBASE ===================== //
// 'db' đã được khởi tạo ở index.html thông qua Firebase CDN
var auth = null;
var currentBranchId = null;
var currentUserId = null;
var currentUserRole = null;
var currentUserBranchId = null;
var currentUserDisplayName = null;
var isLoginMode = true;
var isSuperAdmin = false;
var SUPER_ADMIN_EMAIL = 'nguyenbinhgreenpool@gmail.com';

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

// ===================== GREENPOOL API SYNC ===================== //
var GP_API = {
    baseUrl: 'https://quanly.greenpool.vn/api',
    phone: '0332143334',
    password: '123456a@',
    token: null,
    tokenExpiry: 0,
    // Mapping curriculum App → package_id, THEO TỪNG SITE
    packageMap: {
        // Site 1 - 24 Nguyễn Cơ Thạch
        1: {
            'Ếch Trẻ em': 503, 'Ếch Người lớn': 502,
            'Sải Trẻ em': 505, 'Sải Người lớn': 504,
            'Ếch Vip Trẻ em': 510, 'Ếch Vip Người lớn': 509,
            'Sải Vip Trẻ em': 512, 'Sải Vip Người lớn': 511,
            'PT': 508
        },
        // Site 2 - Cung TTDN Mỹ Đình
        2: {
            'Ếch Trẻ em': 532, 'Ếch Người lớn': 531,
            'Sải Trẻ em': 669, 'Sải Người lớn': 670,
            'Ếch Vip Trẻ em': 563, 'Ếch Vip Người lớn': 562,
            'Sải Vip Trẻ em': 565, 'Sải Vip Người lớn': 564,
            'Dolphin 1': 696, 'Dolphin 2': 697,
            'Basic Mermaid': 698, 'Trải nghiệm Tiên cá': 698,
            'Trải nghiệm lặn': 695,
            'PT': 489, 'Bơi Ngửa': 531, 'Bơi Bướm': 531
        },
        // Site 3 - 20 Thuỵ Khuê (learn-to-swim packages)
        3: {
            'Ếch Trẻ em': 730, 'Ếch Người lớn': 725,
            'Sải Trẻ em': 731, 'Sải Người lớn': 726,
            'Ếch Vip Trẻ em': 739, 'Ếch Vip Người lớn': 737,
            'Sải Vip Trẻ em': 740, 'Sải Vip Người lớn': 738,
            'Bơi Ngửa': 732, 'Bơi Bướm': 733
        },
        // Site 4 - Hoàng Mai
        4: {
            'Ếch Trẻ em': 428, 'Ếch Người lớn': 429,
            'Sải Trẻ em': 431, 'Sải Người lớn': 432,
            'Bơi Bướm': 434,
            'PT': 420
        },
        // Site 5 - Thanh Trì
        5: {
            'Ếch Trẻ em': 550, 'Ếch Người lớn': 549,
            'Sải Trẻ em': 552, 'Sải Người lớn': 551,
            'Ếch Vip Trẻ em': 590, 'Ếch Vip Người lớn': 588,
            'Sải Vip Trẻ em': 591, 'Sải Vip Người lớn': 589,
            'Bơi Ngửa': 553, 'Bơi Bướm': 555,
            'PT': 702
        }
    },
    // Cache sale mapping (phone → greenpool user_id)
    saleCache: {},
    // Mapping App branchId → GP site_id
    siteMap: {
        'branch_nguyen_co_thach': 1,   // 24 Nguyễn Cơ Thạch
        'branch_cung_ttdn': 2,         // Cung TTDN Mỹ Đình
        'branch_thuy_khue': 3,         // 20 Thuỵ Khuê
        'branch_hoang_mai': 4,         // Hoàng Mai
        'branch_thanh_tri': 5           // Thanh Trì
    }
};

// Cập nhật giao diện — debounce timer
var _uiTimer = null;

// Danh sách 5 cơ sở cố định
var FIXED_BRANCHES = [
    { id: "branch_thuy_khue", name: "20 Thuỵ Khuê" },
    { id: "branch_nguyen_co_thach", name: "24 Nguyễn Cơ Thạch" },
    { id: "branch_cung_ttdn", name: "Cung TTDN" },
    { id: "branch_hoang_mai", name: "Hoàng Mai" },
    { id: "branch_thanh_tri", name: "Thanh Trì" }
];

// Helper: lấy danh sách Admin/Manager IDs (cache trong session, tránh query lặp)
var _adminIdsCache = null;
var _managerIdsCache = {};
