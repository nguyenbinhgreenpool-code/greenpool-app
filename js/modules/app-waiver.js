// ===== GreenPool App — Waiver / Cam kết miễn trừ (v11.0) =====
// Cam kết miễn trừ trách nhiệm cho môn Lặn

// ===================== CAM KẾT MIỄN TRỪ TRÁCH NHIỆM (WAIVER) ===================== //

var WAIVER_CONTENT = `
<h3 style="text-align:center; color:#0891b2; margin:0 0 6px; font-size:15px;">BẢN CAM KẾT CHẤP NHẬN RỦI RO<br>VÀ XÁC NHẬN QUYỀN HÌNH ẢNH</h3>
<p style="text-align:center; font-size:12px; color:var(--text-muted); margin-bottom:16px;">(Dành cho Học viên tham gia hoạt động tại CLB Lặn Thăng Long)</p>
<div style="font-size:13px; line-height:1.7; color:var(--text-color);">
<h4 style="color:#0891b2; margin:14px 0 8px;">I. CAM KẾT VỀ SỨC KHỎE VÀ QUẢN LÝ RỦI RO</h4>
<p><strong>1. Nhận thức rủi ro:</strong> Tôi hiểu rằng lặn (bao gồm lặn tự do và lặn khí tài) là môn thể thao tiềm ẩn rủi ro đặc thù như: chấn thương áp suất tai/phổi, ngất xỉu do thiếu oxy (blackout), hoặc các tai nạn dưới nước khác. Tôi tự nguyện chấp nhận các rủi ro này.</p>
<p><strong>2. Tình trạng sức khỏe:</strong> Tôi xác nhận mình không có tiền sử bệnh tim mạch, hô hấp nghiêm trọng, động kinh hoặc các bệnh lý khác mà bác sĩ khuyến cáo không được lặn. Tôi cam kết không sử dụng rượu bia hoặc chất kích thích trước và trong khi tham gia buổi học.</p>
<p><strong>3. Tuân thủ an toàn:</strong> Tôi cam kết tuân thủ tuyệt đối các quy tắc an toàn và hướng dẫn của Huấn luyện viên. Tôi hiểu rằng bất kỳ hành vi vi phạm kỷ luật nào gây nguy hiểm cho bản thân và người khác sẽ dẫn đến việc đình chỉ hoạt động ngay lập tức.</p>
<p><strong>4. Miễn trừ trách nhiệm:</strong> Tôi và người đại diện hợp pháp của tôi đồng ý miễn trừ toàn bộ trách nhiệm pháp lý đối với CLB Lặn Thăng Long và đội ngũ huấn luyện viên trong trường hợp xảy ra sự cố, thương tích hoặc mất mát tài sản cá nhân phát sinh từ việc tham gia hoạt động, trừ trường hợp lỗi cố ý từ phía câu lạc bộ.</p>

<h4 style="color:#0891b2; margin:14px 0 8px;">II. PHÓ THÁC VÀ CHO PHÉP SỬ DỤNG HÌNH ẢNH</h4>
<p><strong>1. Ghi hình:</strong> Tôi đồng ý cho phép CLB Lặn Thăng Long ghi hình, chụp ảnh và ghi âm trong suốt quá trình tôi tham gia các buổi học (dưới nước và trên cạn).</p>
<p><strong>2. Mục đích sử dụng:</strong> Tôi chấp thuận để câu lạc bộ sử dụng các tư liệu hình ảnh/video có mặt tôi vào các mục đích:</p>
<ul style="margin:4px 0 8px 16px;">
<li>Phân tích kỹ thuật để cải thiện kỹ năng cho cá nhân tôi và học viên khác.</li>
<li>Làm tư liệu giảng dạy và đào tạo.</li>
<li>Truyền thông và quảng bá trên các nền tảng mạng xã hội (Facebook, TikTok, YouTube, Website...) của câu lạc bộ.</li>
</ul>
<p><strong>3. Quyền sở hữu:</strong> Tôi xác nhận các hình ảnh và video này thuộc bản quyền của câu lạc bộ. Tôi từ bỏ quyền yêu cầu thù lao hoặc kiểm duyệt hình ảnh trước khi đăng tải, miễn là các hình ảnh đó không vi phạm thuần phong mỹ tục hoặc làm tổn hại đến danh dự cá nhân.</p>

<h4 style="color:#0891b2; margin:14px 0 8px;">III. ĐỐI VỚI TRẺ EM (DƯỚI 18 TUỔI)</h4>
<p>Nếu người tham gia là trẻ em, phụ huynh/người giám hộ ký cam kết này thay mặt và chịu trách nhiệm hoàn toàn.</p>
<p><strong>Tôi đã đọc, hiểu rõ và hoàn toàn đồng ý với tất cả các nội dung nêu trên.</strong></p>
</div>`;

// Mở form ký waiver
window.openWaiverForm = function (studentId, studentName) {
    // Lấy thông tin HV
    const st = localState.students.find(s => s.id === studentId);
    const phone = st?.phone || '';
    const cccd = st?.cccd || '';

    let overlay = document.getElementById('waiver-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'waiver-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:9999; display:flex; align-items:center; justify-content:center; padding:12px;';

    overlay.innerHTML = `
    <div style="background:var(--card-bg); border-radius:16px; padding:20px; max-width:520px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.4);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-weight:700; font-size:15px; color:var(--text-color);">🤿 Cam kết cho: <span style="color:#0891b2;">${studentName}</span></span>
            <button onclick="document.getElementById('waiver-overlay').remove()" style="border:none; background:none; font-size:20px; cursor:pointer; color:var(--text-muted);">✕</button>
        </div>

        <!-- Thông tin cá nhân -->
        <div style="background:rgba(8,145,178,0.06); border:1px solid rgba(8,145,178,0.15); border-radius:10px; padding:12px; margin-bottom:12px;">
            <div style="font-size:12px; font-weight:600; color:#0891b2; margin-bottom:8px;">📋 Thông tin cá nhân</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <div>
                    <label style="font-size:11px; color:var(--text-muted);">Họ và tên</label>
                    <input id="waiver-fullname" value="${studentName}" style="width:100%; padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; font-size:13px; background:var(--card-bg); color:var(--text-color);" readonly>
                </div>
                <div>
                    <label style="font-size:11px; color:var(--text-muted);">SĐT</label>
                    <input id="waiver-phone" value="${phone}" style="width:100%; padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; font-size:13px; background:var(--card-bg); color:var(--text-color);" readonly>
                </div>
                <div>
                    <label style="font-size:11px; color:var(--text-muted);">Ngày sinh</label>
                    <input id="waiver-dob" type="date" style="width:100%; padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; font-size:13px; background:var(--card-bg); color:var(--text-color);">
                </div>
                <div>
                    <label style="font-size:11px; color:var(--text-muted);">CMND/CCCD</label>
                    <input id="waiver-cccd" value="${cccd}" placeholder="Nhập CCCD..." style="width:100%; padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; font-size:13px; background:var(--card-bg); color:var(--text-color);">
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
                <div>
                    <label style="font-size:11px; color:var(--text-muted);">👤 Người liên hệ khẩn cấp <span style="color:#ef4444;">*</span></label>
                    <input id="waiver-emergency-name" placeholder="Họ tên..." style="width:100%; padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; font-size:13px; background:var(--card-bg); color:var(--text-color);">
                </div>
                <div>
                    <label style="font-size:11px; color:var(--text-muted);">📞 SĐT khẩn cấp <span style="color:#ef4444;">*</span></label>
                    <input id="waiver-emergency-phone" placeholder="0xxx..." style="width:100%; padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; font-size:13px; background:var(--card-bg); color:var(--text-color);">
                </div>
            </div>
        </div>

        <!-- Nội dung cam kết -->
        <div style="max-height:250px; overflow-y:auto; border:1px solid var(--border-color); border-radius:10px; padding:14px; margin-bottom:12px; background:rgba(0,0,0,0.02); font-size:12px;">
            ${WAIVER_CONTENT}
        </div>

        <!-- Chữ ký -->
        <div style="margin-bottom:12px;">
            <div style="font-size:13px; font-weight:600; color:var(--text-color); margin-bottom:8px;">✍️ Chữ ký của bạn:</div>
            <canvas id="waiver-canvas" width="460" height="150" style="width:100%; height:150px; border:2px dashed var(--border-color); border-radius:10px; background:#fff; cursor:crosshair; touch-action:none;"></canvas>
            <div style="display:flex; justify-content:flex-end; margin-top:4px;">
                <button onclick="clearWaiverCanvas()" style="font-size:11px; border:none; background:none; color:#ef4444; cursor:pointer; text-decoration:underline;">Xóa chữ ký</button>
            </div>
        </div>

        <!-- Checkbox đồng ý -->
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <input type="checkbox" id="waiver-agree" style="width:18px; height:18px; cursor:pointer; accent-color:#0891b2;">
            <label for="waiver-agree" style="font-size:13px; color:var(--text-color); cursor:pointer; font-weight:500;">
                Tôi đã đọc, hiểu rõ và hoàn toàn đồng ý với tất cả các nội dung nêu trên
            </label>
        </div>

        <!-- Nút submit -->
        <button id="waiver-submit-btn" onclick="submitWaiver('${studentId}', '${studentName.replace(/'/g, "\\\\'")}')"
            style="width:100%; padding:12px; border-radius:10px; border:none; background:#0891b2; color:#fff; font-weight:700; font-size:14px; cursor:pointer; opacity:0.5;" disabled>
            🤿 Ký xác nhận cam kết
        </button>
    </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Setup canvas drawing
    setTimeout(() => initWaiverCanvas(), 100);

    // Enable button only when checkbox is checked
    const cb = document.getElementById('waiver-agree');
    const btn = document.getElementById('waiver-submit-btn');
    if (cb && btn) {
        cb.addEventListener('change', () => {
            btn.disabled = !cb.checked;
            btn.style.opacity = cb.checked ? '1' : '0.5';
        });
    }
};

var _waiverDrawing = false;
var _waiverCtx = null;
var _waiverHasDrawn = false;

function initWaiverCanvas() {
    const canvas = document.getElementById('waiver-canvas');
    if (!canvas) return;
    _waiverCtx = canvas.getContext('2d');
    _waiverCtx.strokeStyle = '#000';
    _waiverCtx.lineWidth = 2;
    _waiverCtx.lineCap = 'round';
    _waiverHasDrawn = false;

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    canvas.addEventListener('mousedown', (e) => { _waiverDrawing = true; const p = getPos(e); _waiverCtx.beginPath(); _waiverCtx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove', (e) => { if (!_waiverDrawing) return; const p = getPos(e); _waiverCtx.lineTo(p.x, p.y); _waiverCtx.stroke(); _waiverHasDrawn = true; });
    canvas.addEventListener('mouseup', () => { _waiverDrawing = false; });
    canvas.addEventListener('mouseleave', () => { _waiverDrawing = false; });

    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); _waiverDrawing = true; const p = getPos(e); _waiverCtx.beginPath(); _waiverCtx.moveTo(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!_waiverDrawing) return; const p = getPos(e); _waiverCtx.lineTo(p.x, p.y); _waiverCtx.stroke(); _waiverHasDrawn = true; }, { passive: false });
    canvas.addEventListener('touchend', () => { _waiverDrawing = false; });
}

window.clearWaiverCanvas = function () {
    const canvas = document.getElementById('waiver-canvas');
    if (canvas && _waiverCtx) {
        _waiverCtx.clearRect(0, 0, canvas.width, canvas.height);
        _waiverHasDrawn = false;
    }
};

window.submitWaiver = async function (studentId, studentName) {
    const cb = document.getElementById('waiver-agree');
    if (!cb || !cb.checked) return alert('⚠️ Bạn cần đồng ý các điều khoản!');
    if (!_waiverHasDrawn) return alert('⚠️ Vui lòng ký chữ ký trước khi gửi!');

    const emergencyName = document.getElementById('waiver-emergency-name')?.value?.trim();
    const emergencyPhone = document.getElementById('waiver-emergency-phone')?.value?.trim();
    if (!emergencyName || !emergencyPhone) return alert('⚠️ Vui lòng nhập đầy đủ thông tin người liên hệ khẩn cấp!');

    const canvas = document.getElementById('waiver-canvas');
    const signatureData = canvas.toDataURL('image/png');
    const dob = document.getElementById('waiver-dob')?.value || '';
    const cccd = document.getElementById('waiver-cccd')?.value?.trim() || '';

    try {
        await db.collection('students').doc(studentId).update({
            waiverSigned: true,
            waiverSignedAt: firebase.firestore.FieldValue.serverTimestamp(),
            waiverSignature: signatureData,
            emergencyContactName: emergencyName,
            emergencyContactPhone: emergencyPhone,
            dateOfBirth: dob,
            cccd: cccd
        });

        alert(`✅ Đã ký cam kết thành công!\n\nHV "${studentName}" giờ có thể tham gia lớp Lặn.`);
        document.getElementById('waiver-overlay')?.remove();

        // Reload kết quả tìm kiếm
        const searchInput = document.getElementById('customer-search') || document.getElementById('khachhang-search');
        if (searchInput && searchInput.value) searchStudentProgress(searchInput.value);
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Xem cam kết đã ký
window.viewSignedWaiver = async function (studentId, studentName) {
    try {
        const doc = await db.collection('students').doc(studentId).get();
        if (!doc.exists) return alert('Không tìm thấy học viên!');
        const data = doc.data();
        if (!data.waiverSigned) return alert('HV chưa ký cam kết!');

        const signedDate = data.waiverSignedAt?.toDate ? data.waiverSignedAt.toDate().toLocaleString('vi-VN') : 'Không rõ';
        const signatureImg = data.waiverSignature || '';

        let overlay = document.getElementById('waiver-view-overlay');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'waiver-view-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:9999; display:flex; align-items:center; justify-content:center; padding:12px;';

        overlay.innerHTML = `
        <div style="background:var(--card-bg); border-radius:16px; padding:20px; max-width:520px; width:100%; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.4);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-weight:700; font-size:15px; color:var(--text-color);">📋 Cam kết đã ký — <span style="color:#0891b2;">${studentName}</span></span>
                <button onclick="document.getElementById('waiver-view-overlay').remove()" style="border:none; background:none; font-size:20px; cursor:pointer; color:var(--text-muted);">✕</button>
            </div>
            <div style="padding:8px 12px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); border-radius:8px; margin-bottom:12px; font-size:12px; color:#059669; font-weight:600;">
                ✅ Đã ký lúc: ${signedDate}
            </div>
            <!-- Thông tin cá nhân -->
            <div style="background:rgba(8,145,178,0.06); border:1px solid rgba(8,145,178,0.15); border-radius:8px; padding:10px; margin-bottom:12px; font-size:12px;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                    ${data.dateOfBirth ? `<div>📅 Ngày sinh: <strong>${data.dateOfBirth}</strong></div>` : ''}
                    ${data.cccd ? `<div>🪪 CCCD: <strong>${data.cccd}</strong></div>` : ''}
                    ${data.emergencyContactName ? `<div>👤 LH khẩn cấp: <strong>${data.emergencyContactName}</strong></div>` : ''}
                    ${data.emergencyContactPhone ? `<div>📞 SĐT KC: <strong>${data.emergencyContactPhone}</strong></div>` : ''}
                </div>
            </div>
            <div style="max-height:200px; overflow-y:auto; border:1px solid var(--border-color); border-radius:10px; padding:14px; margin-bottom:12px; background:rgba(0,0,0,0.02); font-size:11px;">
                ${WAIVER_CONTENT}
            </div>
            <div style="border:1px solid var(--border-color); border-radius:10px; padding:12px; background:#fff; margin-bottom:12px;">
                <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:8px;">✍️ Chữ ký:</div>
                ${signatureImg ? `<img src="${signatureImg}" style="width:100%; max-height:150px; object-fit:contain; border-radius:6px;" alt="Chữ ký">` : '<div style="text-align:center; color:var(--text-muted); padding:20px;">Không có dữ liệu chữ ký</div>'}
            </div>
            <button onclick="exportWaiverPDF('${studentId}', '${studentName.replace(/'/g, "\\\\'")}')"
                style="width:100%; padding:10px; border-radius:10px; border:none; background:#2563eb; color:#fff; font-weight:600; font-size:13px; cursor:pointer;">
                📄 Xuất file in / lưu
            </button>
        </div>`;

        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    } catch (e) {
        alert('Lỗi: ' + e.message);
    }
};

// Xuất bản cam kết ra trang in (PDF)
window.exportWaiverPDF = async function (studentId, studentName) {
    try {
        const docSnap = await db.collection('students').doc(studentId).get();
        if (!docSnap.exists) return alert('Không tìm thấy HV!');
        const d = docSnap.data();
        const signedDate = d.waiverSignedAt?.toDate ? d.waiverSignedAt.toDate().toLocaleDateString('vi-VN') : '';
        const signedDateObj = d.waiverSignedAt?.toDate ? d.waiverSignedAt.toDate() : new Date();

        const printWin = window.open('', '_blank');
        printWin.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Cam kết - ${studentName}</title>
<style>
    @page { size: A4; margin: 20mm; }
    body { font-family: 'Times New Roman', serif; font-size: 14px; line-height: 1.8; color: #000; max-width: 700px; margin: 0 auto; padding: 20px; }
    h2 { text-align: center; font-size: 18px; margin-bottom: 4px; }
    h3 { text-align: center; font-size: 14px; font-weight: normal; font-style: italic; margin-bottom: 20px; }
    h4 { font-size: 15px; margin: 16px 0 8px; }
    .info-row { display: flex; gap: 20px; margin-bottom: 6px; }
    .info-row span { min-width: 200px; }
    .dot-line { border-bottom: 1px dotted #000; flex: 1; min-width: 100px; display: inline-block; }
    .sig-box { display: flex; justify-content: flex-end; margin-top: 30px; }
    .sig-area { text-align: center; width: 250px; }
    .sig-area img { max-height: 100px; }
    ul { margin: 4px 0 8px 20px; }
    @media print { body { padding: 0; } button { display: none !important; } }
</style></head><body>
<h2>BẢN CAM KẾT CHẤP NHẬN RỦI RO<br>VÀ XÁC NHẬN QUYỀN HÌNH ẢNH</h2>
<h3>(Dành cho Học viên tham gia hoạt động tại CLB Lặn Thăng Long)</h3>

<div class="info-row"><span>Tôi, (Họ và tên): <strong>${studentName}</strong></span></div>
<div class="info-row">
    <span>Ngày sinh: <strong>${d.dateOfBirth || '......./......./...........'}</strong></span>
    <span>CMND/CCCD: <strong>${d.cccd || '.................................'}</strong></span>
</div>
<div class="info-row">
    <span>Số điện thoại: <strong>${d.phone || '.................................'}</strong></span>
    <span>Email: .................................</span>
</div>
<div class="info-row">
    <span>Người liên hệ khẩn cấp: <strong>${d.emergencyContactName || '.........................'}</strong></span>
    <span>SĐT: <strong>${d.emergencyContactPhone || '.........................'}</strong></span>
</div>

<p>Bằng việc ký vào văn bản này, tôi tự nguyện đăng ký tham gia khóa học/hoạt động lặn và đồng ý với các điều khoản sau đây:</p>

<h4>I. CAM KẾT VỀ SỨC KHỎE VÀ QUẢN LÝ RỦI RO</h4>
<p><strong>Nhận thức rủi ro:</strong> Tôi hiểu rằng lặn (bao gồm lặn tự do và lặn khí tài) là môn thể thao tiềm ẩn rủi ro đặc thù như: chấn thương áp suất tai/phổi, ngất xỉu do thiếu oxy (blackout), hoặc các tai nạn dưới nước khác. Tôi tự nguyện chấp nhận các rủi ro này.</p>
<p><strong>Tình trạng sức khỏe:</strong> Tôi xác nhận mình không có tiền sử bệnh tim mạch, hô hấp nghiêm trọng, động kinh hoặc các bệnh lý khác mà bác sĩ khuyến cáo không được lặn. Tôi cam kết không sử dụng rượu bia hoặc chất kích thích trước và trong khi tham gia buổi học.</p>
<p><strong>Tuân thủ an toàn:</strong> Tôi cam kết tuân thủ tuyệt đối các quy tắc an toàn và hướng dẫn của Huấn luyện viên. Tôi hiểu rằng bất kỳ hành vi vi phạm kỷ luật nào gây nguy hiểm cho bản thân và người khác sẽ dẫn đến việc đình chỉ hoạt động ngay lập tức.</p>
<p><strong>Miễn trừ trách nhiệm:</strong> Tôi và người đại diện hợp pháp của tôi đồng ý miễn trừ toàn bộ trách nhiệm pháp lý đối với CLB Lặn Thăng Long và đội ngũ huấn luyện viên trong trường hợp xảy ra sự cố, thương tích hoặc mất mát tài sản cá nhân phát sinh từ việc tham gia hoạt động, trừ trường hợp lỗi cố ý từ phía câu lạc bộ.</p>

<h4>II. PHÓ THÁC VÀ CHO PHÉP SỬ DỤNG HÌNH ẢNH</h4>
<p><strong>Ghi hình:</strong> Tôi đồng ý cho phép CLB Lặn Thăng Long ghi hình, chụp ảnh và ghi âm trong suốt quá trình tôi tham gia các buổi học (dưới nước và trên cạn).</p>
<p><strong>Mục đích sử dụng:</strong> Tôi chấp thuận để câu lạc bộ sử dụng các tư liệu hình ảnh/video có mặt tôi vào các mục đích:</p>
<ul>
<li>Phân tích kỹ thuật để cải thiện kỹ năng cho cá nhân tôi và học viên khác.</li>
<li>Làm tư liệu giảng dạy và đào tạo.</li>
<li>Truyền thông và quảng bá trên các nền tảng mạng xã hội (Facebook, TikTok, YouTube, Website...) của câu lạc bộ.</li>
</ul>
<p><strong>Quyền sở hữu:</strong> Tôi xác nhận các hình ảnh và video này thuộc bản quyền của câu lạc bộ. Tôi từ bỏ quyền yêu cầu thù lao hoặc kiểm duyệt hình ảnh trước khi đăng tải, miễn là các hình ảnh đó không vi phạm thuần phong mỹ tục hoặc làm tổn hại đến danh dự cá nhân.</p>

<p><strong>Tôi đã đọc, hiểu rõ và hoàn toàn đồng ý với tất cả các nội dung nêu trên.</strong></p>

<div class="sig-box">
    <div class="sig-area">
        <p>Hà Nội, ngày ${signedDateObj.getDate()} tháng ${signedDateObj.getMonth()+1} năm ${signedDateObj.getFullYear()}</p>
        <p><strong>NGƯỜI LÀM CAM KẾT</strong></p>
        <p style="font-style:italic; font-size:12px;">(Ký và ghi rõ họ tên)</p>
        ${d.waiverSignature ? `<img src="${d.waiverSignature}" alt="Chữ ký">` : '<br><br><br>'}
        <p><strong>${studentName}</strong></p>
    </div>
</div>

<div style="text-align:center; margin-top:30px;">
    <button onclick="window.print()" style="padding:10px 30px; font-size:14px; background:#2563eb; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:600;">🖨️ In / Lưu PDF</button>
</div>
</body></html>`);
        printWin.document.close();
    } catch (e) {
        alert('Lỗi xuất: ' + e.message);
    }
};
