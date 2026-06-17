const fetch = require('node-fetch');
const GP = 'https://quanly.greenpool.vn/api';
async function main() {
    const login = await fetch(`${GP}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ phone: '0332143334', password: '123456a@' })
    });
    const token = (await login.json())?.authorisation?.token;
    const h = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    const siteNames = { 1: 'NCT', 2: 'CTT', 3: 'TK', 4: 'HM', 5: 'TT' };
    const allUsers = [];
    for (let page = 1; page <= 10; page++) {
        const r = await fetch(`${GP}/admin/user?page=${page}&size=100`, { headers: h });
        const users = (await r.json())?.data || [];
        allUsers.push(...users);
        if (users.length < 100) break;
    }

    console.log('=== TẤT CẢ SALE TRÊN GP (có thể login) ===\n');
    const sales = allUsers.filter(u => u.fullname && (u.fullname.includes('SALE') || u.fullname.includes('Sale')));
    
    for (const site of [1, 2, 3, 4, 5]) {
        const siteSales = sales.filter(u => u.site_id === site);
        console.log(`\n--- ${siteNames[site]} (site ${site}) ---`);
        for (const s of siteSales) {
            // Test login
            const lr = await fetch(`${GP}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ phone: s.phone, password: '123456789' })
            });
            const ld = await lr.json();
            const ok = ld?.authorisation?.token ? '✅' : '❌';
            console.log(`  ${ok} #${s.id} | ${s.fullname} | ${s.phone} | active:${s.active}`);
        }
        if (siteSales.length === 0) console.log('  (Không có Sale)');
    }

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
