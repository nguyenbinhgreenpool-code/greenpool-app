const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: "thang-long-swimming-club" });
const db = getFirestore();

const BRANCHES = [
    { id: 'cung_ttdn', name: 'Cung TTDN' },
    { id: 'my_dinh', name: 'Mỹ Đình' },
    { id: 'thanh_tri', name: 'Thanh Trì' },
    { id: 'lien_ninh', name: 'Liên Ninh' }
];

async function checkQueues() {
    try {
        // Lấy tên GV
        const usersSnap = await db.collection('users').where('role', '==', 'TEACHER').get();
        const teacherMap = {};
        usersSnap.forEach(doc => {
            const d = doc.data();
            teacherMap[doc.id] = { name: d.name || doc.id, type: d.teacherType || 'Chính', paused: d.queuePaused || false, busy: d.isBusy || false };
        });

        for (const branch of BRANCHES) {
            const doc = await db.collection('queues').doc(branch.id).get();
            if (!doc.exists) {
                console.log(`📍 ${branch.name}: Không có dữ liệu queue\n`);
                continue;
            }

            const data = doc.data();
            const queue = data.queue || [];
            const debtMap = data.debtMap || {};
            const testingMap = data.testingMap || {};
            const roundNumber = data.roundNumber || 1;
            const turnsInRound = data.turnsInRound || 0;
            const testCurrentIndex = data.testCurrentIndex;

            console.log('='.repeat(60));
            console.log(`📍 ${branch.name} | Vòng: ${roundNumber} | Turns: ${turnsInRound}/${queue.length}`);
            if (testCurrentIndex !== undefined) console.log(`   testCurrentIndex: ${testCurrentIndex} (field thừa từ bug trước)`);
            console.log('='.repeat(60));

            // Hiển thị queue
            console.log(`\n🔄 Queue (${queue.length} slots):`);
            queue.forEach((id, idx) => {
                const info = teacherMap[id] || { name: id.substring(0, 8), type: '?', paused: false };
                const debt = debtMap[id] || 0;
                const testing = testingMap[id];
                let status = `(${info.type})`;
                if (info.paused) status += ' ⏸️PAUSED';
                if (info.busy) status += ' 🔴BUSY';
                if (debt > 0) status += ` ⚠️NỢ=${debt}`;
                if (testing) {
                    const ts = testing.toDate ? testing.toDate() : new Date(testing);
                    const mins = Math.round((Date.now() - ts.getTime()) / 60000);
                    status += ` 🧪Test(${mins}p)`;
                }
                const marker = idx === 0 ? '→ ' : '  ';
                console.log(`  ${marker}[${idx}] ${info.name} ${status}`);
            });

            // DebtMap
            const debtEntries = Object.entries(debtMap).filter(([, v]) => v > 0);
            if (debtEntries.length > 0) {
                console.log(`\n💳 DebtMap — GV ĐANG BỊ NỢ:`);
                debtEntries.forEach(([id, val]) => {
                    const info = teacherMap[id] || { name: id };
                    console.log(`  ⚠️ ${info.name}: NỢ ${val} lượt → sẽ bị đẩy xuống cuối ${val} lần!`);
                });
            } else {
                console.log(`\n💳 DebtMap: ✅ Trống`);
            }

            // GV có quá nhiều slot
            const countById = {};
            queue.forEach(id => countById[id] = (countById[id] || 0) + 1);
            Object.entries(countById).forEach(([id, c]) => {
                const info = teacherMap[id] || { name: id, type: '?' };
                const expected = info.type === 'CTV' ? 1 : 2;
                if (c !== expected) {
                    console.log(`\n🔴 SLOT SAI: ${info.name} (${info.type}) có ${c} slots, cần ${expected}!`);
                }
            });

            // GV paused nhưng vẫn trong queue
            queue.forEach(id => {
                const info = teacherMap[id];
                if (info && info.paused) {
                    console.log(`\n🔴 GV PAUSED VẪN TRONG QUEUE: ${info.name}`);
                }
            });

            console.log('\n');
        }

        process.exit(0);
    } catch (e) {
        console.error('❌ Lỗi:', e.message);
        process.exit(1);
    }
}

checkQueues();
