// Fix Thuy Khue students whose sessions were wrongly reset
// Find students at branch_thuy_khue where sessions < what they should be

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function findAffected() {
    // Get all Thuy Khue students
    const snap = await db.collection('students')
        .where('branchId', '==', 'branch_thuy_khue')
        .get();

    // Get attendance counts
    const attSnap = await db.collection('attendance').get();
    const attCount = {};
    attSnap.forEach(doc => {
        const sid = doc.data().studentId;
        attCount[sid] = (attCount[sid] || 0) + 1;
    });

    console.log(`\n📋 Thuỵ Khuê: ${snap.size} HV\n`);
    
    const affected = [];
    snap.forEach(doc => {
        const s = doc.data();
        const sessions = s.sessions || 0;
        const total = s.totalSessions || 10;
        const att = attCount[doc.id] || 0;

        // HV bị reset: sessions = attendance count, nhưng nên là nhiều hơn
        // Dấu hiệu: sessions == att VÀ sessions < totalSessions VÀ att < totalSessions
        // Hoặc: sessions khác với số đã chỉnh tay
        console.log(`  ${s.name} | HĐ: ${s.contractNumber || '?'} | sessions: ${sessions}/${total} | att records: ${att} | ${sessions === att ? '⚠️ KHỚP ATT' : sessions > att ? '✅ Tay>att' : '🔴 Tay<att'}`);
        
        if (sessions === att && sessions < total) {
            affected.push({ id: doc.id, name: s.name, contract: s.contractNumber, sessions, total, att });
        }
    });

    console.log(`\n⚠️ HV có thể bị reset (sessions == attendance < total): ${affected.length}`);
    affected.forEach(a => {
        console.log(`  • ${a.name} (${a.contract}): ${a.sessions}/${a.total} att=${a.att}`);
    });
}

findAffected().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
