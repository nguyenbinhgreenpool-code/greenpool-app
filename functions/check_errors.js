const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  projectId: "thang-long-swimming-club" // Tên project lấy từ log deploy
});

const db = getFirestore();

async function checkErrors() {
  try {
    const today = new Date('2026-06-04T00:00:00+07:00'); // Đầu ngày hôm nay
    
    const snap = await db.collection('notifications')
      .where('type', '==', 'gp_sync_error')
      .where('createdAt', '>=', today)
      .get();
      
    const uniqueErrors = new Set();
    const errorDetails = [];

    snap.forEach(doc => {
        const data = doc.data();
        const msg = data.message;
        // Lọc các thông báo trùng lặp (vì 1 lỗi có thể gửi cho nhiều Admin)
        if (!uniqueErrors.has(msg)) {
            uniqueErrors.add(msg);
            errorDetails.push(msg);
        }
    });

    console.log(`=== TỔNG SỐ LỖI ĐỒNG BỘ GP HÔM NAY (04/06/2026): ${errorDetails.length} ===\n`);
    errorDetails.forEach((msg, idx) => {
        console.log(`[Lỗi ${idx + 1}]:\n${msg}\n`);
    });

  } catch (error) {
    console.error("Error querying firestore:", error);
  }
}

checkErrors();
