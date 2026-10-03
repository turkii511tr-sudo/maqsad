// اختبار الواجهة v19: تفاصيل العقار الاختيارية — قوائم وعدّادات في معالج الإضافة وفي شاشة التعديل
// التشغيل: python3 app/build.py && node app/tests/v19.test.js [مجلد اللقطات]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const OUT = process.argv[2] || '/tmp/v19-shots';
fs.mkdirSync(OUT, { recursive: true });
const APP = 'file://' + path.join(__dirname, '..', 'dist', 'app.html');
const inDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const OFFICE = { id: 'o1', name: 'مكتب الأفق العقاري', code: 'OFFICE_01', license_no: '1200012345', msg_quota: 40,
  wa_number: '966501112345', wa_provider: 'cloud', fal: { state: 'ok', expires_on: inDays(200), days_left: 200 },
  onboarded: true, onboarding: {}, fal_request: null, terms: { version: '2026-09-26', ok: true, at: inDays(-1) } };
const STATUS = { can_edit: true, is_super: false, whatsapp: true, wa_number: '966501112345', my_phone: '966500000001',
  my_role: 'owner', errors: [], notify: { telegram: true, push: true, tg_linked: true, push_key: null, devices: 0, my_devices: 0, can_edit: true } };
const PROP = { id: 'p1', title: 'شقة النرجس A12', deal_type: 'إيجار', property_type: 'شقة', city: 'الرياض', district: 'النرجس',
  price: 45000, rooms: 3, state: 'available', ad_license_no: '7200034512', ad_license_expiry: inDays(90), listable: true,
  details: { baths: 2, area: 120, furnished: 'مؤثث', elevator: true } };

function makeApi() {
  const calls = [];
  const state = { props: [JSON.parse(JSON.stringify(PROP))] };
  const reply = (a, b) => {
    calls.push(b);
    switch (a) {
      case 'bootstrap': return { staff: { id: 's1', name: 'صاحب', role: 'owner' }, is_super: false, office: OFFICE, leads: [], team: [],
        properties: state.props, status: STATUS, offices: null, signups_new: null };
      case 'properties': return { properties: state.props };
      case 'property_save': return { ok: true, property: { id: 'p2' }, matches: 0 };
      case 'month_stats': return { month: '2026-10', stats: {} };
      case 'analytics': return { gap: [] };
      case 'settings_status': return STATUS;
      default: return { ok: true };
    }
  };
  return { calls, reply };
}
async function page(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ar-SA' });
  await ctx.addInitScript(() => { try { localStorage.setItem('maqsad_token', 'T'); } catch (e) {} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const api = makeApi();
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

async function toDetails(p, deal, type) {
  await p.click('.nav button[data-screen="s-stock"]');
  await p.click('#btnNewProp');
  await p.click(`[data-name="deal"][data-v="${deal}"]`); await p.click(`[data-name="type"][data-v="${type}"]`); await p.click('#wzNext');
  await p.fill('#wzCity', 'الرياض'); await p.fill('#wzDistrict', 'النرجس'); await p.click('#wzNext');
  await p.fill('#wzPrice', '45000'); await p.click('#wzNext');
  await p.click('#wzNext');   // الترخيص (بدونه)
}

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  await test('قائمة المخزون تعرض دورات المياه والمساحة بجانب الغرف', async () => {
    const { p, errors, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-stock"]');
    const t = await p.textContent('#stockWrap');
    assert.match(t, /3 غرف · 2 دورة مياه · 120 م²/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('المعالج: شقة إيجار تظهر لها أقسام الشقة وشروط الإيجار، بلا بيانات البيع ولا المسبح', async () => {
    const { p, errors, ctx } = await page(b);
    await toDetails(p, 'إيجار', 'شقة');
    const names = await p.$$eval('.pd-grp summary span', (x) => x.map((e) => e.textContent));
    assert.deepEqual(names, ['المساحات والغرف', 'الحالة والتجهيز', 'المرافق', 'الواجهة والشارع', 'شروط الإيجار']);
    assert.equal(await p.$('[data-pd="pool"]'), null); assert.equal(await p.$('[data-pd="deed"]'), null);
    assert.ok(await p.$('[data-pd="floor_no"]'), 'رقم الدور للشقة');
    assert.equal(await p.getAttribute('details[data-grp="space"]', 'open') !== null, true, 'أول قسم مفتوح');
    assert.equal(await p.textContent('#wzNext'), 'تخطي');
    await shot(p, 'details-apt');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('فيلا للبيع: المسبح وبيانات البيع تظهر، وشروط الإيجار لا', async () => {
    const { p, ctx } = await page(b);
    await toDetails(p, 'شراء', 'فيلا');
    assert.ok(await p.$('[data-pd="pool"]')); assert.ok(await p.$('[data-pd="deed"]')); assert.ok(await p.$('[data-pd="floors"]'));
    assert.equal(await p.$('[data-pd="pay_period"]'), null);
    await ctx.close();
  });

  await test('أرض: بلا دورات مياه ولا غرف، وفيها المساحة والواجهة والشارع', async () => {
    const { p, ctx } = await page(b);
    await toDetails(p, 'شراء', 'أرض');
    assert.equal(await p.$('[data-pd="baths"]'), null);
    assert.ok(await p.$('[data-pd="area"]')); assert.ok(await p.$('[data-pd="facade"]')); assert.ok(await p.$('[data-pd="street_width"]'));
    await ctx.close();
  });

  await test('العدّاد والاختيار والمرافق والمساحة: تتعبّى وتُلغى وتُرسل نظيفة', async () => {
    const { p, api, errors, ctx } = await page(b);
    await toDetails(p, 'إيجار', 'شقة');
    const plus = '[data-pd="baths"][data-d="1"]', minus = '[data-pd="baths"][data-d="-1"]';
    assert.equal(await p.textContent('[data-out="baths"]'), '—');
    await p.click(plus); await p.click(plus); await p.click(plus);
    assert.equal(await p.textContent('[data-out="baths"]'), '3');
    await p.click(minus); assert.equal(await p.textContent('[data-out="baths"]'), '2');
    await p.click(minus); await p.click(minus);
    assert.equal(await p.textContent('[data-out="baths"]'), '—', 'ينزل لـ «غير معروف»');
    await p.click(plus); await p.click(plus);
    await p.fill('#pd_area', '135');
    await p.click('[data-pd="floor_no"][data-v="الثاني"]');
    await p.click('[data-pd="floor_no"][data-v="الثاني"]');            // مرة ثانية = إلغاء
    await p.click('[data-pd="floor_no"][data-v="الثالث"]');
    assert.equal(await p.getAttribute('[data-pd="floor_no"][data-v="الثالث"]', 'aria-pressed'), 'true');
    assert.equal(await p.getAttribute('[data-pd="floor_no"][data-v="الثاني"]', 'aria-pressed'), 'false');
    await p.click('summary:has-text("المرافق")'); await p.click('[data-pd="elevator"]');
    await p.click('summary:has-text("شروط الإيجار")'); await p.click('[data-pd="pay_period"][data-v="نصف سنوي"]');
    assert.match(await p.textContent('details[data-grp="space"] .pd-n'), /3/, 'عدّاد القسم');
    await shot(p, 'details-filled');
    await p.click('#wzNext');                                                // مراجعة
    await p.click('#wzNext'); await p.waitForTimeout(300);                    // حفظ
    const ps = api.calls.find((c) => c.action === 'property_save');
    assert.deepEqual(ps.property.details, { area: 135, baths: 2, floor_no: 'الثالث', elevator: true, pay_period: 'نصف سنوي' });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('تغيير النوع بعد التعبئة: ما ينطبق ما يُرسل (مسبح فيلا ← شقة)', async () => {
    const { p, api, ctx } = await page(b);
    await toDetails(p, 'شراء', 'فيلا');
    await p.click('summary:has-text("المرافق")'); await p.click('[data-pd="pool"]');
    await p.click('#wzNext');                                                // مراجعة
    await p.click('button[data-go="0"]');                                    // تعديل النوع
    await p.click('[data-name="type"][data-v="شقة"]');
    await p.click('#wzNext'); await p.click('#wzNext'); await p.click('#wzNext'); await p.click('#wzNext'); await p.click('#wzNext');
    await p.click('#wzNext'); await p.waitForTimeout(300);
    const ps = api.calls.find((c) => c.action === 'property_save');
    assert.deepEqual(ps.property.details, {});
    await ctx.close();
  });

  await test('«انسخ تفاصيل آخر عقار مثله» يعبّي من عقار سابق بنفس النوع والطلب', async () => {
    const { p, api, ctx } = await page(b);
    await toDetails(p, 'إيجار', 'شقة');
    assert.ok(await p.$('#pdCopy'), 'زر النسخ');
    await p.click('#pdCopy');
    assert.equal(await p.textContent('[data-out="baths"]'), '2');
    assert.equal(await p.inputValue('#pd_area'), '120');
    await p.click('#wzNext'); await p.click('#wzNext'); await p.waitForTimeout(300);
    const ps = api.calls.find((c) => c.action === 'property_save');
    assert.deepEqual(ps.property.details, { baths: 2, area: 120, furnished: 'مؤثث', elevator: true });
    await ctx.close();
  });

  await test('فيلا للبيع ما يظهر لها زر النسخ (ما فيه عقار مثلها)', async () => {
    const { p, ctx } = await page(b);
    await toDetails(p, 'شراء', 'فيلا');
    assert.equal(await p.$('#pdCopy'), null);
    await ctx.close();
  });

  await test('شاشة التعديل: التفاصيل المحفوظة معبّأة، والتعديل يرسلها، وتغيير النوع يعيد رسم الأقسام', async () => {
    const { p, api, errors, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-stock"]');
    await p.click('#stockWrap .row');
    await p.waitForSelector('#pdBox .pd-grp');
    assert.equal(await p.textContent('#pdBox [data-out="baths"]'), '2');
    assert.equal(await p.inputValue('#pdBox #pd_area'), '120');
    assert.equal(await p.getAttribute('#pdBox [data-pd="furnished"][data-v="مؤثث"]', 'aria-pressed'), 'true');
    await shot(p, 'details-edit');
    await p.click('#pdBox [data-pd="baths"][data-d="1"]');
    await p.click('#pSave'); await p.waitForTimeout(300);
    const ps = api.calls.find((c) => c.action === 'property_save');
    assert.equal(ps.property.id, 'p1');
    assert.deepEqual(ps.property.details, { baths: 3, area: 120, furnished: 'مؤثث', elevator: true });
    // نوع جديد
    await p.click('#stockWrap .row');
    await p.waitForSelector('#pdBox .pd-grp');
    await p.selectOption('#pType', 'أرض');
    assert.equal(await p.$('#pdBox [data-pd="baths"]'), null, 'دورات المياه ما تنطبق على الأرض');
    assert.ok(await p.$('#pdBox [data-pd="street_width"]'));
    await p.click('#pSave'); await p.waitForTimeout(300);
    const last = api.calls.filter((c) => c.action === 'property_save').pop();
    assert.deepEqual(last.property.details, { area: 120 });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await b.close();
  for (const r of results) console.log(r.join('  '));
  const bad = results.filter((r) => r[0] === '✗').length;
  console.log(`\n${results.length - bad}/${results.length} passed`);
  process.exit(bad ? 1 : 0);
})();
