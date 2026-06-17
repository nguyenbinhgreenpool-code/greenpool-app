const firebase = require('firebase/compat/app');
require('firebase/compat/auth');
require('firebase/compat/firestore');

const firebaseConfig = {
    apiKey: "AIzaSyDLDbXD4ac9zJZ3nm6DRFt09W2iMlDczp4",
    authDomain: "thang-long-swimming-club.firebaseapp.com",
    projectId: "thang-long-swimming-club",
    storageBucket: "thang-long-swimming-club.firebasestorage.app",
    messagingSenderId: "254618493495",
    appId: "1:254618493495:web:492ecaced0f0397bfc15b2"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

const BRANCHES = [
    { id: 'cung_ttdn', name: 'Cung TTDN' },
    { id: 'my_dinh', name: 'Mỹ Đình' },
    { id: 'thanh_tri', name: 'Thanh Trì' },
    { id: 'lien_ninh', name: 'Liên Ninh' }
];

async function checkQueues() {
    try {
        // Login as admin
        await auth.signInWithEmailAndPassword('nguyenbinhgreenpool@gmail.com', '12345678');
        console.log('✅ Đã đăng nhập admin\n');

        // Lấy tên GV
        const usersSnap = await db.collection('users').where('role', '==', 'TEACHER').get();
        const teacherMap = {};
        usersSnap.forEach(doc => {
            teacherMap[doc.id] = doc.data().name || doc.id;
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

            console.log('='.repeat(60));
            console.log(`📍 ${branch.name} | Vòng: ${roundNumber} | Turns: ${turnsInRound}/${queue.length}`);
            console.log('='.repeat(60));

            // Hiển thị queue
            console.log(`\n🔄 Queue (${queue.length} slots):`);
            queue.forEach((id, idx) => {
                const name = teacherMap[id] || id.substring(0, 8);
                const debt = debtMap[id] || 0;
                const testing = testingMap[id];
                let status = '';
                if (debt > 0) status += ` ⚠️ NỢ=${debt}`;
                if (testing) {
                    const ts = testing.toDate ? testing.toDate() : new Date(testing);
                    const mins = Math.round((Date.now() - ts.getTime()) / 60000);
                    status += ` 🧪 Test ${mins}p`;
                }
                const marker = idx === 0 ? '→ ' : '  ';
                console.log(`  ${marker}[${idx}] ${name}${status}`);
            });

            // Hiển thị debtMap
            const debtEntries = Object.entries(debtMap).filter(([, v]) => v > 0);
            if (debtEntries.length > 0) {
                console.log(`\n💳 DebtMap (GV đang bị nợ):`);
                debtEntries.forEach(([id, val]) => {
                    console.log(`  ⚠️ ${teacherMap[id] || id}: NỢ ${val} lượt`);
                });
            } else {
                console.log(`\n💳 DebtMap: ✅ Trống (không ai bị nợ)`);
            }

            // Kiểm tra GV trùng slot
            const countById = {};
            queue.forEach(id => countById[id] = (countById[id] || 0) + 1);
            const duplicates = Object.entries(countById).filter(([, c]) => c > 2);
            if (duplicates.length > 0) {
                console.log(`\n🔴 GV có QUÁ NHIỀU slot (>2):`);
                duplicates.forEach(([id, c]) => {
                    console.log(`  ❌ ${teacherMap[id] || id}: ${c} slots (tối đa 2!)`);
                });
            }

            // Kiểm tra testingMap hết hạn
            if (Object.keys(testingMap).length > 0) {
                console.log(`\n🧪 TestingMap:`);
                Object.entries(testingMap).forEach(([id, ts]) => {
                    const d = ts.toDate ? ts.toDate() : new Date(ts);
                    const mins = Math.round((Date.now() - d.getTime()) / 60000);
                    const expired = mins >= 15 ? '✅ Hết hạn' : `⏳ Còn ${15 - mins}p`;
                    console.log(`  ${teacherMap[id] || id}: ${expired} (${mins}p trước)`);
                });
            }

            console.log('');
        }

        process.exit(0);
    } catch (e) {
        console.error('❌ Lỗi:', e.message);
        process.exit(1);
    }
}

checkQueues();
