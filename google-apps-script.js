// ============================================================
// HƯỚNG DẪN: Dán code này vào Google Apps Script của Google Sheet
// ============================================================
// 1. Mở Google Sheet "Backup HV Bơi lội"
// 2. Vào Tiện ích mở rộng → Apps Script
// 3. Xoá hết code cũ → dán code này vào → Lưu
// 4. Bấm "Triển khai" → "Quản lý triển khai" → Chỉnh sửa → Phiên bản mới → Triển khai
// ============================================================

function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        let sheet = ss.getSheetByName('HocVien');

        // Tạo sheet + header nếu chưa có
        if (!sheet) {
            sheet = ss.insertSheet('HocVien');
            sheet.appendRow([
                'Thời gian', 'Họ tên HV', 'SĐT', 'Số HĐ',
                'Kiểu bơi', 'Giáo viên', 'Sale', 'Cơ sở'
            ]);
            const headerRange = sheet.getRange(1, 1, 1, 8);
            headerRange.setFontWeight('bold');
            headerRange.setBackground('#4285f4');
            headerRange.setFontColor('white');
            sheet.setFrozenRows(1);
        }

        // Lệnh XOÁ SẠCH (giữ header)
        if (data.action === 'clear') {
            const lastRow = sheet.getLastRow();
            if (lastRow > 1) {
                sheet.deleteRows(2, lastRow - 1);
            }
            return ContentService.createTextOutput(
                JSON.stringify({ status: 'cleared' })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        // Ghi dòng mới
        sheet.appendRow([
            new Date().toLocaleString('vi-VN'),
            data.name || '',
            data.phone || '',
            data.contractNumber || '',
            data.curriculum || '',
            data.teacherName || '',
            data.saleName || '',
            data.branchName || ''
        ]);

        return ContentService.createTextOutput(
            JSON.stringify({ status: 'ok' })
        ).setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        return ContentService.createTextOutput(
            JSON.stringify({ status: 'error', message: err.toString() })
        ).setMimeType(ContentService.MimeType.JSON);
    }
}
