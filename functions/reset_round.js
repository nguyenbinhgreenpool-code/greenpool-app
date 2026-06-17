// Reset roundNumber và turnsInRound + xoá queue_logs cũ
// Chạy: cd functions && node reset_round.js

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

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
            console.log(`  DebtMap:`, JSON.stringify(data.debtMap || {}));

            await qDoc.update({
                roundNumber: 1,
                turnsInRound: 0
            });

            console.log(`  ✅ Reset → roundNumber: 1, turnsInRound: 0`);
        } else {
            console.log(`\n=== ${branchId} === (không có queue)`);
        }
    }

    // Xóa queue_logs cũ
    console.log('\n=== Xóa queue_logs cũ ===');
    for (const branchId of BRANCHES) {
        const logsSnap = await db.collection('queue_logs')
            .where('branchId', '==', branchId)
            .get();

        if (!logsSnap.empty) {
            const docs = logsSnap.docs;
            for (let i = 0; i < docs.length; i += 500) {
                const batch = db.batch();
                docs.slice(i, i + 500).forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
            console.log(`  ${branchId}: xóa ${docs.length} logs cũ`);
        } else {
            console.log(`  ${branchId}: không có logs`);
        }
    }

    console.log('\n✅ Done!');
    process.exit(0);
}

resetRounds().catch(e => { console.error(e); process.exit(1); });
