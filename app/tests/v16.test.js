// اختبار الواجهة v16: المدينة في العقار · تصحيح بيانات العميل وحذفه · حالة المكتب بسببها (بدل «يحتاج انتباه» العامة)
// التشغيل: python3 app/build.py && node app/tests/v16.test.js [مجلد اللقطات]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const OUT = process.argv[2] || '/tmp/v16-shots';
fs.mkdirSync(OUT, { recursive: true });
const APP = 'file://' + path.join(__dirname, '..', 'dist', 'app.html');
const inDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const OFFICE = { id: 'o1', name: 'مكتب الأفق العقاري', code: 'OFFICE_01', license_no: '1200012345', msg_quota: 40,
  wa_number: '966501112345', wa_provider: 'cloud', fal: { state: 'ok', expires_on: inDays(200), days_left: 200 },
  onboarded: true, onboarding: {}, fal_request: null, terms: { version: '2026-09-26', ok: true, at: inDays(-1) } };
const STATUS = { can_edit: false, is_super: false, whatsapp: true, wa_number: '966501112345', my_phone: '966500000001',
  my_role: 'owner', errors: [], notify: { telegram: true, push: true, tg_linked: true, push_key: null, devices: 0, my_devices: 0, can_edit: true } };
const PROPS = [
  { id: 'P1', title: 'شقة النرجس', deal_type: 'إيجار', property_type: 'شقة', city: 'الرياض', district: 'النرجس', price: 42000, rooms: 3,
    state: 'available', listable: true, ad_license_no: '7200034512', ad_license_expiry: inDays(90) },
  { id: 'P2', title: 'أرض المنتزه', deal_type: 'شراء', property_type: 'أرض', city: 'الطائف', district: 'المنتزه', price: 120000,
    state: 'available', listable: true, ad_license_no: '7200034513', ad_license_expiry: inDays(90) },
];
const LEAD = { id: 'c1', name: 'أبو فهد', phone: '966551112222', deal_type: 'إيجار', property_type: 'شقة', location: 'النرجس',
  budget: 45, budget_period: 'سنوي', status: 'qualified', mode: 'manual', handoff_reason: 'qualified', msg_count: 7 };
// مكاتب للمشغّل: شغّال لكن ما وافق على الشروط (كان يطلع «يحتاج انتباه») · رخصة مرفوضة على مزود انتقالي
const OFFICES = [
  { id: 'o1', name: 'مكتب الأفق', code: 'OFFICE_01', license_no: '1100', active: true, wa_linked: true, wa_provider: 'cloud',
    wa_number: '966501112345', leads: 6, props: 7, fal: { state: 'ok', expires_on: inDays(900), days_left: 900 }, terms_ok: false },
  { id: 'o2', name: 'مكتب الواحة', code: 'OFFICE_02', license_no: '2200', active: true, wa_linked: true, wa_provider: 'ultramsg',
    leads: 1, props: 1, fal: { state: 'rejected', note: 'صورة غير واضحة' }, terms_ok: false },
  { id: 'o3', name: 'مكتب موقوف', code: 'OFFICE_03', license_no: '3300', active: false, wa_linked: false, wa_provider: 'cloud',
    leads: 0, props: 0, fal: { state: 'pending' } },
];

function makeApi({ role = 'owner', props = PROPS, superAdmin = false } = {}) {
  const calls = [];
  const state = { props: JSON.parse(JSON.stringify(props)), lead: { ...LEAD }, leads: [{ ...LEAD }] };
  const reply = (a, b) => {
    calls.push(b);
    switch (a) {
      case 'bootstrap': return superAdmin
        ? { staff: { name: 'تركي', role: 'super_admin' }, is_super: true, office: OFFICE, leads: [], properties: [],
            status: { ...STATUS, is_super: true, can_edit: true }, offices: OFFICES, signups_new: 0 }
        : { staff: { name: 'أبو فيصل', role }, is_super: false, office: OFFICE, leads: state.leads, properties: state.props,
            status: { ...STATUS, my_role: role }, offices: null, signups_new: null };
      case 'offices_list': return { offices: OFFICES };
      case 'property_save': {
        const pr = { ...b.property, id: 'P' + (state.props.length + 1), listable: true };
        state.props.push(pr); return { ok: true, property: pr, matches: 0 };
      }
      case 'properties': return { properties: state.props };
      case 'lead': return { lead: state.lead, messages: [] };
      case 'lead_update': Object.assign(state.lead, b.fields, { budget: Number(b.fields.budget) || null }); return { ok: true, lead: state.lead };
      case 'lead_delete': state.leads = []; return { ok: true };
      case 'month_stats': return { month: '2026-10', stats: {} };
      case 'analytics': return { gap: [] };
      case 'staff_list': return { staff: [] };
      case 'settings_status': return STATUS;
      default: return { ok: true };
    }
  };
  return { calls, reply };
}

async function page(b, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-SA' });
  await ctx.addInitScript(() => { try { localStorage.setItem('maqsad_token', 'T'); } catch (e) {} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const api = makeApi(opts);
  await p.route('**/functions/v1/api*', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(api.reply(body.action, body)) });
  });
  await p.goto(APP);
  await p.waitForSelector('#app:not([hidden])'); await p.waitForTimeout(400);
  return { p, api, errors, ctx };
}
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true });
const results = [];
async function test(name, fn) { try { await fn(); results.push(['✓', name]); } catch (e) { results.push(['✗', name, e.message.split('\n')[0]]); } }

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  await test('عقار جديد: المدينة مطلوبة في الخطوات وتُرسل مع العقار', async () => {
    const { p, api, errors, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-stock"]');
    await p.click('#btnNewProp');
    await p.click('[data-name="deal"][data-v="إيجار"]'); await p.click('[data-name="type"][data-v="شقة"]'); await p.click('#wzNext');
    // المكتب في مدينتين: ما فيه مدينة افتراضية، والزر مقفل بدونها
    assert.equal(await p.inputValue('#wzCity'), '');
    await p.fill('#wzDistrict', 'المنتزه');
    assert.equal(await p.isDisabled('#wzNext'), true, 'التالي مفتوح بلا مدينة');
    await p.fill('#wzCity', 'الطائف');
    assert.equal(await p.isDisabled('#wzNext'), false);
    await shot(p, 'wizard-city');
    await p.click('#wzNext');
    await p.fill('#wzPrice', '30000'); await p.click('#wzNext');
    await p.fill('#wzLic', '7200034599'); await p.fill('#wzExp', inDays(60)); await p.click('#wzNext');
    await p.click('#wzNext');   // تفاصيل العقار (تخطي)
    assert.match(await p.textContent('#wz'), /الطائف/);
    await p.click('#wzNext');
    await p.waitForTimeout(300);
    const c = api.calls.find((x) => x.action === 'property_save');
    assert.equal(c.property.city, 'الطائف'); assert.equal(c.property.district, 'المنتزه');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('مكتب بمدينة وحدة: المدينة تتعبّى تلقائياً · القائمة فيها فلتر مدن لما تكون أكثر من وحدة', async () => {
    let { p, ctx } = await page(b, { props: [PROPS[0]] });
    await p.click('.nav button[data-screen="s-stock"]');
    assert.equal(await p.isHidden('#stockCity'), true);
    await p.click('#btnNewProp');
    await p.click('[data-name="deal"][data-v="إيجار"]'); await p.click('[data-name="type"][data-v="شقة"]'); await p.click('#wzNext');
    assert.equal(await p.inputValue('#wzCity'), 'الرياض');
    await ctx.close();
    ({ p, ctx } = await page(b));
    await p.click('.nav button[data-screen="s-stock"]');
    assert.equal(await p.isVisible('#stockCity'), true);
    await p.selectOption('#stockCity', 'الطائف');
    const t = await p.textContent('#stockWrap');
    assert.match(t, /المنتزه، الطائف/); assert.doesNotMatch(t, /النرجس/);
    await shot(p, 'stock-city');
    await ctx.close();
  });

  await test('تعديل عقار: المدينة ظاهرة وتُرسل، وما يُحفظ بلا مدينة', async () => {
    const { p, api, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-stock"]');
    await p.click('#stockWrap .row');
    assert.equal(await p.inputValue('#pCity'), 'الرياض');
    await p.fill('#pCity', '');
    await p.click('#pSave');
    assert.match(await p.textContent('#pMsg'), /اكتب المدينة/);
    assert.ok(!api.calls.some((x) => x.action === 'property_save'));
    await p.fill('#pCity', 'الرياض'); await p.click('#pSave'); await p.waitForTimeout(200);
    assert.equal(api.calls.find((x) => x.action === 'property_save').property.city, 'الرياض');
    await ctx.close();
  });

  await test('بطاقة العميل: تصحيح الميزانية 45 ← 45000 والمدينة، بلا إلزام', async () => {
    const { p, api, errors, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-leads"]');
    await p.click('#s-leads .row');
    await p.waitForSelector('#leadEdit');
    await p.click('#leadEdit');
    assert.equal(await p.inputValue('#leBudget'), '45');
    await p.fill('#leBudget', '45000'); await p.fill('#leCity', 'الرياض');
    assert.match(await p.textContent('#leBudgetHint'), /45,000|٤٥٬٠٠٠/);
    await shot(p, 'lead-edit');
    await p.click('#leSave'); await p.waitForTimeout(300);
    const c = api.calls.find((x) => x.action === 'lead_update');
    assert.equal(c.fields.budget, '45000'); assert.equal(c.fields.city, 'الرياض'); assert.equal(c.fields.deal_type, 'إيجار');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('حذف العميل: تأكيد واضح (حذف/إلغاء)، الإلغاء ما يحذف، والحذف يشيله من القائمة', async () => {
    const { p, api, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-leads"]');
    await p.click('#s-leads .row');
    await p.click('#leadDel');
    assert.match(await p.textContent('.confirm-del'), /هل أنت متأكد من حذف هذا العميل؟/);
    assert.equal(await p.textContent('#delYes'), 'حذف'); assert.equal(await p.textContent('#delNo'), 'إلغاء');
    await shot(p, 'lead-delete');
    await p.click('#delNo'); await p.waitForTimeout(200);
    assert.ok(!api.calls.some((x) => x.action === 'lead_delete'), 'الإلغاء حذف');
    await p.click('#leadDel'); await p.click('#delYes'); await p.waitForTimeout(300);
    assert.equal(api.calls.filter((x) => x.action === 'lead_delete').length, 1);
    assert.equal(await p.isVisible('#sheet.on'), false);
    await ctx.close();
  });

  await test('الوسيط ما يشوف زر حذف العميل', async () => {
    const { p, ctx } = await page(b, { role: 'agent' });
    await p.click('.nav button[data-screen="s-leads"]');
    await p.click('#s-leads .row');
    await p.waitForSelector('#leadEdit');
    assert.equal(await p.$('#leadDel'), null);
    await ctx.close();
  });

  await test('المكاتب: الشروط وحدها ما تخلي المكتب «يحتاج إجراء»، والسبب مكتوب، والمزود الانتقالي ما يُعرض لمكتب جديد', async () => {
    const { p, errors, ctx } = await page(b, { superAdmin: true });
    await p.click('.nav button[data-screen="s-offices"]');
    const rows = await p.$$eval('#officesList .office-row', (r) => r.map((x) => ({ t: x.textContent, needs: x.classList.contains('needs') })));
    assert.equal(rows[0].needs, false); assert.match(rows[0].t, /شغّال/); assert.match(rows[0].t, /ما وافق على الشروط/);
    assert.equal(rows[1].needs, true); assert.match(rows[1].t, /رخصة فال مرفوضة — المساعد ما يرد/);
    assert.match(rows[2].t, /موقوف/);
    assert.match(await p.textContent('#officesCount'), /1 شغّال · 1 يحتاج إجراء/);
    await p.click('#officeChips [data-f="attn"]');
    assert.equal(await p.$$eval('#officesList .office-row', (r) => r.length), 1);
    await shot(p, 'offices');
    await p.click('#officeChips [data-f="all"]');
    await p.click('#btnNewOffice').catch(() => {});
    const opts = await p.$$eval('#oProv option', (o) => o.map((x) => x.value)).catch(() => null);
    if (opts) assert.deepEqual(opts, ['cloud'], 'المزود الانتقالي معروض لمكتب جديد');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await b.close();
  for (const r of results) console.log(r.join('  '));
  const bad = results.filter((r) => r[0] === '✗').length;
  console.log(`\n${results.length - bad}/${results.length} passed · لقطات: ${OUT}`);
  process.exit(bad ? 1 : 0);
})();
