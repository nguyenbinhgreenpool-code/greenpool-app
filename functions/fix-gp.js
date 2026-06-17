// Script scan ALL sites tìm HĐ sai + fix 1 cái test
const GP_BASE = "https://quanly.greenpool.vn/api";
const SITES = [
    { id: 1, phone: '0865028566', pass: '123456789', label: 'NCT' },
    { id: 2, phone: '0769101101', pass: '123456789', label: 'CTT' },
    { id: 3, phone: '0334019412', pass: '123456789', label: 'TK' },
    { id: 4, phone: '0326324642', pass: '123456789', label: 'HM' },
    { id: 5, phone: '0934654683', pass: '123456789', label: 'TT' }
];

async function gpLogin(phone, pass) {
    const res = await fetch(`${GP_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ phone, password: pass })
    });
    const data = await res.json();
    return data?.authorisation?.token;
}

async function main() {
    console.log('🔍 Scan tất cả 5 cơ sở tìm HĐ sai...\n');
    
    const allBuggy = [];
    
    for (const site of SITES) {
        const token = await gpLogin(site.phone, site.pass);
        if (!token) { console.log(`❌ ${site.label}: Login fail`); continue; }
        
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };
        
        // Lấy 30 subscribe mới nhất của site này
        const listRes = await fetch(`${GP_BASE}/admin/subscribe?size=30&sort=-id`, { method: 'GET', headers });
        const listData = await listRes.json();
        const subs = listData?.data || [];
        
        let buggyCount = 0;
        for (const s of subs) {
            const detRes = await fetch(`${GP_BASE}/admin/subscribe/${s.id}`, { method: 'GET', headers });
            if (!detRes.ok) continue;
            const det = await detRes.json();
            const payment = det.payment || {};
            const gpSub = det.subscribe || det;
            const pkg = gpSub.package || {};
            
            const remain = parseInt(payment.remain_amount) || 0;
            const discountValue = payment.discount_value || '';
            const discountAmount = parseInt(payment.discount_amount) || 0;
            const total = parseInt(payment.total_amount) || 0;
            const pay = parseInt(payment.pay_amount) || 0;
            const pkgPrice = parseInt(pkg.price) || 0;
            
            // Buggy: có discount code nhưng discount_amount = 0 và remain > 0
            const isBuggy = remain > 0 && discountValue && discountAmount === 0;
            
            // Cũng check: remain > 0 nói chung (có thể sai)
            if (remain > 0) {
                const marker = isBuggy ? '🔴 BUGGY' : '⚠️ HAS_REMAIN';
                console.log(`${marker} [${site.label}] #${s.id} | HĐ: ${gpSub.contract} | ${gpSub.person?.fullname || '?'}`);
                console.log(`    Gói: ${pkg.name} (${pkgPrice.toLocaleString()}đ) | total=${total.toLocaleString()}, pay=${pay.toLocaleString()}, remain=${remain.toLocaleString()}`);
                if (discountValue) console.log(`    Mã: ${discountValue} (giảm ${discountAmount.toLocaleString()}đ)`);
                console.log('');
                
                if (isBuggy) {
                    buggyCount++;
                    allBuggy.push({
                        site: site.label,
                        siteId: site.id,
                        subId: s.id,
                        contract: gpSub.contract,
                        name: gpSub.person?.fullname || '?',
                        pkgPrice,
                        remain,
                        discountValue,
                        correctTotal: pkgPrice - remain,
                        person_id: gpSub.person_id,
                        package_id: gpSub.package_id,
                        site_id: gpSub.site_id,
                        support_user_id: gpSub.support_user_id || payment.support_user_id || '',
                        start_date: gpSub.start_date,
                        note: gpSub.note || '',
                        pay_method: payment.pay_method || 'cash',
                        mkt_source: payment.mkt_source || '',
                        token // save token for later use
                    });
                }
            }
        }
        console.log(`[${site.label}] Scanned ${subs.length} subscribes, ${buggyCount} buggy\n`);
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Tổng HĐ buggy: ${allBuggy.length}`);
    
    if (allBuggy.length === 0) {
        console.log('✅ Không tìm thấy HĐ sai!');
        return;
    }
    
    // === FIX 1 CÁI ĐẦU TIÊN ===
    const fix = allBuggy[0];
    console.log(`\n🔧 TEST FIX: ${fix.name} (HĐ: ${fix.contract}) — ${fix.site}`);
    console.log(`   Gói: ${fix.pkgPrice.toLocaleString()}đ, mã ${fix.discountValue} giảm ${fix.remain.toLocaleString()}đ`);
    console.log(`   → Giá đúng: ${fix.correctTotal.toLocaleString()}đ`);
    
    const headers = { 'Authorization': `Bearer ${fix.token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };
    
    // DELETE
    console.log(`\n   DELETE #${fix.subId}...`);
    const delRes = await fetch(`${GP_BASE}/admin/subscribe/${fix.subId}`, { method: 'DELETE', headers });
    const delText = await delRes.text();
    console.log(`   DELETE: ${delRes.status} ${delRes.ok ? '✅' : '❌'} ${delText.substring(0, 200)}`);
    
    if (!delRes.ok) { console.error('   ❌ Delete failed!'); return; }
    
    // Tìm Sale user
    let saleToken = fix.token;
    if (fix.support_user_id) {
        try {
            const userRes = await fetch(`${GP_BASE}/admin/user/${fix.support_user_id}`, { method: 'GET', headers });
            if (userRes.ok) {
                const userData = await userRes.json();
                const salePhone = userData.phone || '';
                console.log(`   Sale: ${userData.fullname || userData.name} (${salePhone})`);
                if (salePhone) {
                    const st = await gpLogin(salePhone, '123456789');
                    if (st) { saleToken = st; console.log('   ✅ Sale login OK'); }
                    else console.warn('   ⚠️ Sale login fail, using site token');
                }
            }
        } catch(e) { console.warn(`   Sale lookup fail: ${e.message}`); }
    }
    
    // CREATE
    const saleHeaders = { 'Authorization': `Bearer ${saleToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };
    const payload = {
        subscribe: {
            person_id: fix.person_id, package_id: fix.package_id,
            site_id: fix.site_id, contract: fix.contract,
            start_date: fix.start_date, active_type: 'FUTURE',
            support_user_id: fix.support_user_id, note: fix.note
        },
        payment: {
            total_amount: fix.correctTotal, pay_amount: fix.correctTotal,
            remain_amount: 0, site_id: fix.site_id,
            person_id: fix.person_id, pay_method: fix.pay_method,
            support_user_id: fix.support_user_id, mkt_source: fix.mkt_source
        }
    };
    
    console.log(`\n   CREATE bằng Sale token...`);
    const createRes = await fetch(`${GP_BASE}/admin/subscribe`, {
        method: 'POST', headers: saleHeaders,
        body: JSON.stringify(payload)
    });
    const createText = await createRes.text();
    console.log(`   CREATE: ${createRes.status} ${createRes.ok ? '✅' : '❌'}`);
    console.log(`   Response: ${createText.substring(0, 500)}`);
    
    if (createRes.ok) {
        let d; try { d = JSON.parse(createText); } catch(e) {}
        const newId = d?.id || d?.subscribe?.id || d?.data?.id;
        console.log(`\n🎉 THÀNH CÔNG! #${fix.subId} → #${newId}`);
    }
}

main().catch(e => console.error(e));
