// Reset roundNumber và turnsInRound cho tất cả cơ sở
// Chạy 1 lần: node reset_round.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const BRANCHES = [
    "branch_thuy_khue",
    "branch_nguyen_co_thach", 
    "branch_cung_ttdn",
    "branch_hoang_mai",
    "branch_thanh_tri"
];

async function resetRounds() {
    for (const branchId of BRANCHES) {
        const qDoc = db.collection('queues').doc(branchId);
        const snap = await qDoc.get();
        if (snap.exists) {
            const data = snap.data();
            const queue = data.queue || [];
            const oldRound = data.roundNumber || 0;
            
            console.log(`\n=== ${branchId} ===`);
            console.log(`  Queue: ${queue.length} slots`);
            console.log(`  Old roundNumber: ${oldRound}`);
            console.log(`  DebtMap:`, data.debtMap || {});
            
            await qDoc.update({
                roundNumber: 1,
                turnsInRound: 0
            });
            
            console.log(`  ✅ Reset → roundNumber: 1, turnsInRound: 0`);
        } else {
            console.log(`\n=== ${branchId} === (không có queue)`);
        }
    }
    
    // Xóa queue_logs cũ (dữ liệu roundNumber sai)
    console.log('\n=== Xóa queue_logs cũ (roundNumber sai) ===');
    for (const branchId of BRANCHES) {
        const logsSnap = await db.collection('queue_logs')
            .where('branchId', '==', branchId)
            .get();
        
        if (!logsSnap.empty) {
            const batchSize = 500;
            const docs = logsSnap.docs;
            for (let i = 0; i < docs.length; i += batchSize) {
                const batch = db.batch();
                docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
            console.log(`  ${branchId}: xóa ${docs.length} logs cũ`);
        }
    }
    
    console.log('\n✅ Done! Tất cả cơ sở đã reset về Vòng 1.');
    process.exit(0);
}

resetRounds().catch(e => { console.error(e); process.exit(1); });
