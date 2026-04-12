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

        // ========== XOÁ TAB (clearBranch) ==========
        if (data.action === 'clearBranch') {
            let sheet = ss.getSheetByName(data.branchName);
            if (sheet) {
                const lastRow = sheet.getLastRow();
                if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
            }
            return ContentService.createTextOutput(
                JSON.stringify({ status: 'cleared' })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        // ========== GHI HỌC VIÊN CƠ BẢN (addRow) ==========
        if (data.action === 'addRow') {
            let sheet = ss.getSheetByName(data.branchName);
            if (!sheet) {
                sheet = ss.insertSheet(data.branchName);
                sheet.appendRow([
                    'STT', 'TG Đồng bộ', 'Ngày HĐ', 'Họ tên', 'Số HĐ', 'SĐT',
                    'Gói bơi', 'NL/TE', 'Giáo viên', 'Sale', 'Số buổi'
                ]);
                const headerRange = sheet.getRange(1, 1, 1, 11);
                headerRange.setFontWeight('bold');
                headerRange.setBackground('#4285f4');
                headerRange.setFontColor('white');
                sheet.setFrozenRows(1);
            }
            sheet.appendRow([
                data.stt || '',
                data.syncTime || '',
                data.createdAt || '',
                data.name || '',
                data.contractNumber || '',
                data.phone || '',
                data.curriculum || '',
                data.ageCategory || '',
                data.teacherName || '',
                data.saleName || '',
                data.sessions || ''
            ]);
            return ContentService.createTextOutput(
                JSON.stringify({ status: 'ok' })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        // ========== GHI VĐV CLB KID TL (addClbRow) ==========
        if (data.action === 'addClbRow') {
            let sheet = ss.getSheetByName(data.branchName);
            if (!sheet) {
                sheet = ss.insertSheet(data.branchName);
                sheet.appendRow([
                    'STT', 'TG Đồng bộ', 'Họ tên', 'SĐT', 'Số HĐ',
                    'Lớp', 'Gói', 'Ngày KH', 'HSD', 'Sale'
                ]);
                const headerRange = sheet.getRange(1, 1, 1, 10);
                headerRange.setFontWeight('bold');
                headerRange.setBackground('#8b5cf6');
                headerRange.setFontColor('white');
                sheet.setFrozenRows(1);
            }
            sheet.appendRow([
                data.stt || '',
                data.syncTime || '',
                data.name || '',
                data.phone || '',
                data.contractNumber || '',
                data.athleteClass || '',
                data.pkg || '',
                data.activatedAt || '',
                data.expiresAt || '',
                data.saleName || ''
            ]);
            return ContentService.createTextOutput(
                JSON.stringify({ status: 'ok' })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        // ========== GIA HẠN VĐV CLB (renewClb) ==========
        if (data.action === 'renewClb') {
            // Tìm sheet CLB của cơ sở
            let sheet = ss.getSheetByName(data.branchName);
            if (sheet) {
                const lastRow = sheet.getLastRow();
                let found = false;
                // Tìm dòng có số HĐ cũ (cột 5 = Số HĐ)
                if (lastRow > 1) {
                    const contractCol = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
                    for (let i = 0; i < contractCol.length; i++) {
                        if (contractCol[i][0] == data.oldContract) {
                            const row = i + 2;
                            // Cập nhật: Số HĐ, Gói, Ngày KH, HSD
                            sheet.getRange(row, 2).setValue(new Date().toLocaleString('vi-VN')); // TG Đồng bộ
                            sheet.getRange(row, 5).setValue(data.newContract || '');
                            sheet.getRange(row, 7).setValue(data.package || '');
                            sheet.getRange(row, 8).setValue(data.activatedAt || '');
                            sheet.getRange(row, 9).setValue(data.expiresAt || '');
                            // Highlight dòng đã gia hạn
                            sheet.getRange(row, 1, 1, 10).setBackground('#f0fdf4');
                            found = true;
                            break;
                        }
                    }
                }
                if (!found) {
                    // Không tìm thấy HĐ cũ → ghi log dòng mới
                    sheet.appendRow([
                        lastRow, new Date().toLocaleString('vi-VN'),
                        data.name || '', '', data.newContract || '',
                        '', data.package || '', data.activatedAt || '',
                        data.expiresAt || '', '(Gia hạn)'
                    ]);
                }
            }
            return ContentService.createTextOutput(
                JSON.stringify({ status: 'renewed' })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        // ========== XOÁ KIỂU CŨ (clear) ==========
        if (data.action === 'clear') {
            let sheet = ss.getSheetByName('HocVien');
            if (sheet) {
                const lastRow = sheet.getLastRow();
                if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
            }
            return ContentService.createTextOutput(
                JSON.stringify({ status: 'cleared' })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        // Fallback: ghi vào tab HocVien cũ
        let sheet = ss.getSheetByName('HocVien');
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
