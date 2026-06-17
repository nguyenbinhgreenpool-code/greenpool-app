const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

const GP_BASE = 'https://quanly.greenpool.vn/api';
const ADMIN_PHONE = '0332143334';
const ADMIN_PASSWORD = '123456a@';

async function main() {
    console.log('🔍 Tìm HĐ A3101...');
    const snap = await db.collection('students')
        .where('contractNumber', '==', 'A3101')
        .get();

    if (snap.empty) { console.log('❌ Không tìm thấy!'); return; }

    const doc = snap.docs[0];
    const d = doc.data();
    console.log(`✅ Tìm thấy: ${d.name} (${d.phone}), branch: ${d.branchId}`);

    // 1. Sửa branchId → Thuỵ Khuê
    await doc.ref.update({
        branchId: 'branch_thuy_khue',
        gpSynced: false,
        gpSubscribeId: admin.firestore.FieldValue.delete(),
        gpPersonId: admin.firestore.FieldValue.delete(),
        gpNote: admin.firestore.FieldValue.delete()
    });
    console.log('✅ Đã sửa branchId → branch_thuy_khue');

    // 2. Login GP
    const loginRes = await fetch(`${GP_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD })
    });
    const loginData = await loginRes.json();
    const token = loginData?.authorisation?.token;
    if (!token) { console.log('❌ GP login failed'); return; }
    console.log('✅ GP login OK');

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    // 3. Tìm/tạo person
    const phone = d.phone;
    const name = d.name;
    let personId = null;

    const searchRes = await fetch(`${GP_BASE}/admin/person?filter[phone]=${phone}&size=10`, { method: 'GET', headers });
    const searchData = await searchRes.json();
    const persons = searchData?.data || [];
    if (persons.length > 0) {
        const match = persons.find(p => (p.fullname || '').toUpperCase() === name.toUpperCase());
        personId = match ? match.id : persons[0].id;
        console.log(`✅ Person found: #${personId}`);
    } else {
        const createRes = await fetch(`${GP_BASE}/admin/person`, {
            method: 'POST', headers,
            body: JSON.stringify({ fullname: name.toUpperCase(), phone, gender: d.gender === 'Nữ' ? 2 : 1, address: 'Hà Nội' })
        });
        const createData = await createRes.json();
        personId = createData?.id || createData?.data?.id;
        console.log(`✅ Person created: #${personId}`);
    }

    if (!personId) { console.log('❌ No personId'); return; }

    // 4. Tạo subscribe - Thuỵ Khuê site 3, Sải Người lớn = 726
    const packageId = d.ageCategory === 'Trẻ em' ? 731 : 726; // Sải Trẻ em : Sải Người lớn
    const subRes = await fetch(`${GP_BASE}/admin/subscribe`, {
        method: 'POST', headers,
        body: JSON.stringify({
            subscribe: { package_id: packageId, contract: 'A3101', start_date: new Date().toISOString().split('T')[0], active_type: 'FUTURE', person_id: personId, site_id: 3 },
            payment: { total_amount: 0, remain_amount: 0, site_id: 3, pay_method: 'cash', pay_amount: 0, person_id: personId }
        })
    });
    const subData = await subRes.json();
    const subId = subData?.id || subData?.data?.id || subData?.subscribe?.id;

    if (subId) {
        await doc.ref.update({
            gpSynced: true,
            gpSubscribeId: subId,
            gpPersonId: personId,
            gpSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
            gpNote: 'Resync thủ công → Thuỵ Khuê'
        });
        console.log(`🎉 DONE! GP Subscribe #${subId} tại Thuỵ Khuê!`);
    } else {
        console.log('❌ Subscribe failed:', JSON.stringify(subData).substring(0, 300));
    }

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
