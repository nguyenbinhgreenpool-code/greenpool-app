// ============================================================
// HƯỚNG DẪN: Dán code này vào Google Apps Script của Google Sheet
// ============================================================
// 1. Mở Google Sheet "Backup HV Bơi lội"
// 2. Vào Tiện ích mở rộng → Apps Script
// 3. Xoá hết code cũ → dán code này vào → Lưu
// 4. Bấm "Triển khai" → "Quản lý triển khai" → Chỉnh sửa → Phiên bản mới → Triển khai
// ============================================================

// ========== ĐỌC DATA TỪ SHEET (doGet - JSONP) ==========
function doGet(e) {
    try {
        const callback = (e && e.parameter && e.parameter.callback) || 'handleSheetData';
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheets = ss.getSheets();
        const result = [];

        sheets.forEach(sheet => {
            const name = sheet.getName();
            if (name === 'HocVien' || name === 'Template') return;
            const lastRow = sheet.getLastRow();
            if (lastRow <= 1) return;
            const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
            data.forEach(row => {
                const contractNumber = (row[4] || '').toString().trim();
                const studentName = (row[3] || '').toString().trim();
                const sessions = parseInt(row[10]) || 0;
                if (contractNumber) {
                    result.push({ contract: contractNumber, name: studentName, sessions: sessions, branch: name });
                }
            });
        });

        // Trả về JSONP (bypass CORS)
        return ContentService.createTextOutput(
            callback + '(' + JSON.stringify({ status: 'ok', data: result }) + ')'
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
    } catch (err) {
        const callback = (e && e.parameter && e.parameter.callback) || 'handleSheetData';
        return ContentService.createTextOutput(
            callback + '(' + JSON.stringify({ status: 'error', message: err.toString() }) + ')'
        ).setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
}

function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const ss = SpreadsheetApp.getActiveSpreadsheet();

        // ========== ĐỌC SỐ BUỔI (readSessions) ==========
        if (data.action === 'readSessions') {
            const sheets = ss.getSheets();
            const result = [];
            sheets.forEach(sheet => {
                const name = sheet.getName();
                if (name === 'HocVien' || name === 'Template') return;
                const lastRow = sheet.getLastRow();
                if (lastRow <= 1) return;
                const rows = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
                rows.forEach(row => {
                    const contractNumber = (row[4] || '').toString().trim();
                    const studentName = (row[3] || '').toString().trim();
                    const sessions = parseInt(row[10]) || 0;
                    if (contractNumber) {
                        result.push({ contract: contractNumber, name: studentName, sessions: sessions, branch: name });
                    }
                });
            });
            return ContentService.createTextOutput(
                JSON.stringify({ status: 'ok', data: result })
            ).setMimeType(ContentService.MimeType.JSON);
        }

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

        // ========== ĐIỂM DANH (markAttendance) ==========
        if (data.action === 'markAttendance') {
            let sheet = ss.getSheetByName(data.branchName);
            if (sheet) {
                const lastRow = sheet.getLastRow();
                if (lastRow > 1) {
                    // Tìm HV theo Số HĐ (cột 5)
                    const contractCol = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
                    const searchContract = (data.contractNumber || '').toString().trim();
                    for (let i = 0; i < contractCol.length; i++) {
                        const rowContract = (contractCol[i][0] || '').toString().trim();
                        if (searchContract && rowContract === searchContract) {
                            const row = i + 2;
                            // Cột điểm danh: cột 12 (L) + sessionNumber - 1
                            // Buổi 1 → cột 12 (L), Buổi 2 → cột 13 (M), ...
                            const col = 11 + (parseInt(data.sessionNumber) || 1);
                            if (data.date) {
                                sheet.getRange(row, col).setValue(data.date);
                            } else {
                                // date rỗng = huỷ buổi → xoá
                                sheet.getRange(row, col).clearContent();
                            }
                            break;
                        }
                    }
                }
            }
            return ContentService.createTextOutput(
                JSON.stringify({ status: 'ok' })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        // ========== ĐỒNG BỘ ĐIỂM DANH HÀNG LOẠT (syncAttendanceBulk) ==========
        if (data.action === 'syncAttendanceBulk') {
            let sheet = ss.getSheetByName(data.branchName);
            if (sheet) {
                const lastRow = sheet.getLastRow();
                if (lastRow > 1) {
                    const contractCol = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
                    const searchContract = (data.contractNumber || '').toString().trim();
                    for (let i = 0; i < contractCol.length; i++) {
                        const rowContract = (contractCol[i][0] || '').toString().trim();
                        if (searchContract && rowContract === searchContract) {
                            const row = i + 2;
                            const dates = data.dates || [];
                            // Ghi lại tất cả cột điểm danh (từ cột 12 trở đi)
                            for (let j = 0; j < dates.length; j++) {
                                const col = 12 + j; // Buổi 1 = cột 12, Buổi 2 = cột 13...
                                if (dates[j]) {
                                    sheet.getRange(row, col).setValue(dates[j]);
                                } else {
                                    sheet.getRange(row, col).clearContent();
                                }
                            }
                            break;
                        }
                    }
                }
            }
            return ContentService.createTextOutput(
                JSON.stringify({ status: 'ok' })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        // ========== CẬP NHẬT HỌC VIÊN (updateOrInsert) ==========
        if (data.action === 'updateOrInsert' && data.data) {
            const d = data.data;
            const branchName = d.branchName || '';
            let found = false;

            // Tìm ĐÚNG tab cơ sở trước
            let targetSheet = branchName ? ss.getSheetByName(branchName) : null;

            if (targetSheet) {
                // Chỉ tìm trong tab đúng cơ sở
                const lastRow = targetSheet.getLastRow();
                if (lastRow > 1) {
                    const contractCol = targetSheet.getRange(2, 5, lastRow - 1, 1).getValues();
                    const nameCol = targetSheet.getRange(2, 4, lastRow - 1, 1).getValues();
                    const searchContract = (d.contractNumber || '').toString().trim();
                    const searchName = (d.name || '').toString().trim().toLowerCase();
                    for (let i = 0; i < contractCol.length; i++) {
                        const rowContract = (contractCol[i][0] || '').toString().trim();
                        const rowName = (nameCol[i][0] || '').toString().trim().toLowerCase();
                        // Ưu tiên tìm theo Số HĐ, fallback theo Tên
                        if ((searchContract && rowContract === searchContract) || (!searchContract && searchName && rowName === searchName)) {
                            const row = i + 2;
                            targetSheet.getRange(row, 2).setValue(new Date().toLocaleString('vi-VN'));
                            targetSheet.getRange(row, 4).setValue(d.name || '');
                            targetSheet.getRange(row, 5).setValue(d.contractNumber || '');
                            targetSheet.getRange(row, 6).setValue(d.phone || '');
                            targetSheet.getRange(row, 7).setValue(d.swimType || d.curriculum || '');
                            targetSheet.getRange(row, 8).setValue(d.ageGroup || d.ageCategory || '');
                            targetSheet.getRange(row, 9).setValue(d.teacherName || '');
                            targetSheet.getRange(row, 10).setValue(d.saleName || '');
                            targetSheet.getRange(row, 11).setValue(d.sessions || 0);
                            targetSheet.getRange(row, 1, 1, 11).setBackground('#fef9c3');
                            found = true;
                            break;
                        }
                    }
                }
                // Nếu không tìm thấy trong tab đúng → thêm dòng mới vào tab đó
                if (!found) {
                    targetSheet.appendRow([
                        '', new Date().toLocaleString('vi-VN'),
                        d.contractDate || '', d.name || '', d.contractNumber || '',
                        d.phone || '', d.swimType || d.curriculum || '',
                        d.ageGroup || d.ageCategory || '', d.teacherName || '',
                        d.saleName || '', d.sessions || 0
                    ]);
                    targetSheet.getRange(targetSheet.getLastRow(), 1, 1, 11).setBackground('#e0f2fe');
                    found = true;
                }
            } else {
                // Fallback: không có branchName → tìm tất cả tab (giữ tương thích cũ)
                const sheets = ss.getSheets();
                for (let s = 0; s < sheets.length; s++) {
                    const sheet = sheets[s];
                    const sheetName = sheet.getName();
                    if (sheetName === 'HocVien' || sheetName === 'Template') continue;
                    if (!sheetName.startsWith('CLB_')) {
                        const lastRow = sheet.getLastRow();
                        if (lastRow <= 1) continue;
                        const contractCol = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
                        const searchContract = (d.contractNumber || '').toString().trim();
                        for (let i = 0; i < contractCol.length; i++) {
                            const rowContract = (contractCol[i][0] || '').toString().trim();
                            if (searchContract && rowContract === searchContract) {
                                const row = i + 2;
                                sheet.getRange(row, 2).setValue(new Date().toLocaleString('vi-VN'));
                                sheet.getRange(row, 4).setValue(d.name || '');
                                sheet.getRange(row, 5).setValue(d.contractNumber || '');
                                sheet.getRange(row, 6).setValue(d.phone || '');
                                sheet.getRange(row, 7).setValue(d.swimType || d.curriculum || '');
                                sheet.getRange(row, 8).setValue(d.ageGroup || d.ageCategory || '');
                                sheet.getRange(row, 9).setValue(d.teacherName || '');
                                sheet.getRange(row, 10).setValue(d.saleName || '');
                                sheet.getRange(row, 11).setValue(d.sessions || 0);
                                sheet.getRange(row, 1, 1, 11).setBackground('#fef9c3');
                                found = true;
                                break;
                            }
                        }
                        if (found) break;
                    }
                }
            }
            return ContentService.createTextOutput(
                JSON.stringify({ status: found ? 'updated' : 'not_found' })
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

        // ========== CẬP NHẬT VĐV CLB (updateClbRow) ==========
        if (data.action === 'updateClbRow') {
            let sheet = ss.getSheetByName(data.branchName);
            if (sheet) {
                const lastRow = sheet.getLastRow();
                let found = false;
                if (lastRow > 1) {
                    // Lấy cả cột Tên (3) và Số HĐ (5) để tìm
                    const nameCol = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
                    const contractCol = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
                    
                    // Ưu tiên tìm theo TÊN trước (chính xác hơn)
                    const searchName = (data.oldName || data.name || '').toString().trim().toLowerCase();
                    for (let i = 0; i < nameCol.length; i++) {
                        const rowName = (nameCol[i][0] || '').toString().trim().toLowerCase();
                        if (searchName && rowName === searchName) {
                            const row = i + 2;
                            sheet.getRange(row, 2).setValue(new Date().toLocaleString('vi-VN'));
                            sheet.getRange(row, 3).setValue(data.name || '');
                            sheet.getRange(row, 4).setValue(data.phone || '');
                            sheet.getRange(row, 5).setValue(data.contractNumber || '');
                            sheet.getRange(row, 6).setValue(data.athleteClass || '');
                            sheet.getRange(row, 7).setValue(data.pkg || '');
                            sheet.getRange(row, 8).setValue(data.activatedAt || '');
                            sheet.getRange(row, 9).setValue(data.expiresAt || '');
                            sheet.getRange(row, 1, 1, 10).setBackground('#fef9c3');
                            found = true;
                            break;
                        }
                    }
                    
                    // Fallback: tìm theo Số HĐ cũ
                    if (!found && data.oldContractNumber) {
                        for (let i = 0; i < contractCol.length; i++) {
                            if (contractCol[i][0] == data.oldContractNumber) {
                                const row = i + 2;
                                sheet.getRange(row, 2).setValue(new Date().toLocaleString('vi-VN'));
                                sheet.getRange(row, 3).setValue(data.name || '');
                                sheet.getRange(row, 4).setValue(data.phone || '');
                                sheet.getRange(row, 5).setValue(data.contractNumber || '');
                                sheet.getRange(row, 6).setValue(data.athleteClass || '');
                                sheet.getRange(row, 7).setValue(data.pkg || '');
                                sheet.getRange(row, 8).setValue(data.activatedAt || '');
                                sheet.getRange(row, 9).setValue(data.expiresAt || '');
                                sheet.getRange(row, 1, 1, 10).setBackground('#fef9c3');
                                found = true;
                                break;
                            }
                        }
                    }
                }
                if (!found) {
                    sheet.appendRow([
                        lastRow, new Date().toLocaleString('vi-VN'),
                        data.name || '', data.phone || '', data.contractNumber || '',
                        data.athleteClass || '', data.pkg || '', data.activatedAt || '',
                        data.expiresAt || '', '(Sửa)'
                    ]);
                }
            }
            return ContentService.createTextOutput(
                JSON.stringify({ status: 'updated' })
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

        // Nếu action không khớp các handler trên → chỉ xử lý addRow fallback
        // Bỏ qua các action CLB không xác định (tránh tạo tab nhầm)
        if (data.action && data.action !== 'addRow') {
            return ContentService.createTextOutput(
                JSON.stringify({ status: 'unknown_action', action: data.action })
            ).setMimeType(ContentService.MimeType.JSON);
        }

        // Fallback: ghi vào tab HocVien cũ (chỉ cho addRow hoặc không có action)
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
