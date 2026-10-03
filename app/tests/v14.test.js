// اختبار الواجهة v14: موافقة صاحب المكتب على اتفاقية معالجة البيانات · عملاء سابقون يطابقون عقاراً جديداً
// التشغيل: node app/tests/v14.test.js [مجلد اللقطات]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const OUT = process.argv[2] || '/tmp/v14-shots';
fs.mkdirSync(OUT, { recursive: true });
const APP = 'file://' + path.join(__dirname, '..', 'dist', 'app.html');
const iso = (d) => new Date(Date.now() - d * 864e5).toISOString();
const inDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const OFFICE = { id: 'o1', name: 'مكتب الأفق العقاري', code: 'OFFICE_01', license_no: '1200012345', msg_quota: 15,
  wa_number: '966501112345', wa_provider: 'ultramsg', fal: { state: 'ok', expires_on: inDays(200), days_left: 200 },
  onboarded: true, onboarding: {}, fal_request: null, terms: { version: '2026-09-26', ok: false, at: null } };
const STATUS = { can_edit: false, is_super: false, whatsapp: true, wa_number: '966501112345', my_phone: '966500000001',
  my_role: 'owner', errors: [], notify: { telegram: true, push: true, tg_linked: true, push_key: null, devices: 0, my_devices: 0, can_edit: true } };
const PROP = { id: 'P1', title: 'شقة النرجس', deal_type: 'إيجار', property_type: 'شقة', district: 'النرجس', price: 42000, rooms: 3,
  state: 'available', listable: true, ad_license_no: '7200034512', ad_license_expiry: inDays(90) };
const MATCHES = [
  { id: 'c1', name: 'أبو فهد', phone: '966551112222', location: 'النرجس، الربيع', budget: 3500, budget_period: 'شهري', rooms: 3, status: 'qualified', last_at: iso(2), score: 60 },
  { id: 'c2', name: null, phone: '966553334444', location: 'النرجس', budget: 40000, budget_period: 'سنوي', rooms: 2, status: 'inquiry', last_at: iso(9), score: 42 },
];

function makeApi({ role = 'owner', termsOk = false, licensed = true } = {}) {
  const calls = [];
  const office = JSON.parse(JSON.stringify(OFFICE)); office.terms.ok = termsOk;
  const props = [];
  const reply = (a, b) => {
    calls.push(b);
    switch (a) {
      case 'bootstrap': return { staff: { name: role === 'owner' ? 'أبو فيصل' : 'سعد', role }, is_super: false, office,
        leads: [], properties: props, status: { ...STATUS, my_role: role }, offices: null, signups_new: null };
      case 'terms_accept': office.terms = { version: b.version, ok: true, at: new Date().toISOString() }; return { ok: true, terms: office.terms };
      case 'property_save': {
        const pr = { ...PROP, ...b.property, id: 'P' + (props.length + 1), listable: licensed };
        if (!licensed) { pr.ad_license_no = null; pr.ad_license_expiry = null; }
        props.push(pr); return { ok: true, property: pr, matches: MATCHES.length };
      }
      case 'properties': return { properties: props };
      case 'prop_matches': return { property: licensed ? PROP : { ...PROP, ad_license_no: null, ad_license_expiry: null }, customers: MATCHES, days: 30 };
      case 'lead': return { lead: { id: b.id, name: 'أبو فهد', phone: '966551112222', status: 'qualified', mode: 'manual' }, messages: [] };
      case 'month_stats': return { month: '2026-09', stats: {} };
      case 'analytics': return { gap: [] };
      case 'staff_list': return { staff: [] };
      case 'settings_status': return STATUS;
      default: return { ok: true };
    }
  };
  return { calls, reply, office };
}

async function page(b, opts = {}, view = { w: 390, h: 844, dark: false }) {
  const ctx = await b.newContext({ viewport: { width: view.w, height: view.h }, colorScheme: view.dark ? 'dark' : 'light', locale: 'ar-SA' });
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
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png') });
const results = [];
async function test(name, fn) { try { await fn(); results.push(['✓', name]); } catch (e) { results.push(['✗', name, e.message.split('\n')[0]]); } }

async function addProp(p) {
  await p.click('.nav button[data-screen="s-stock"]');
  await p.click('#btnNewProp');
  await p.click('[data-name="deal"][data-v="إيجار"]'); await p.click('[data-name="type"][data-v="شقة"]'); await p.click('#wzNext');
  await p.fill('#wzCity', 'الرياض');
  await p.fill('#wzDistrict', 'النرجس');
  await p.fill('#wzRooms', '3');
  await p.click('#wzNext');
  await p.fill('#wzPrice', '42000'); await p.click('#wzNext');
  const lic = await p.$('#wzLic'); if (lic) { await p.fill('#wzLic', '7200034512'); }
  const exp = await p.$('#wzExp'); if (exp) { await p.fill('#wzExp', inDays(90)); }
  await p.click('#wzNext');
  await p.click('#wzNext');   // تفاصيل العقار (تخطي)
  await p.click('#wzNext');
}

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  await test('صاحب المكتب يطلع له طلب الموافقة، والزر ما يشتغل قبل الصح، وتُرسل النسخة', async () => {
    const { p, api, errors, ctx } = await page(b);
    assert.equal(await p.isVisible('#sheet.on'), true);
    const tb = await p.textContent('#sheetBody');
    assert.match(tb, /لك وحدك/);
    assert.doesNotMatch(tb, /ألمانيا|أمريكا|حادثة|نظاماً/);
    assert.equal(await p.$$eval('.terms-pts li', (x) => x.length), 3);
    assert.equal(await p.isDisabled('#tOk'), true);
    await shot(p, 'terms-m');
    await p.check('#tAgree');
    await p.click('#tOk');
    await p.waitForTimeout(200);
    const c = api.calls.find((x) => x.action === 'terms_accept');
    assert.ok(c && c.version === '2026-09-26');
    assert.equal(await p.isVisible('#sheet.on'), false);
    assert.doesNotMatch(await p.textContent('#s-today'), /اتفاقية معالجة البيانات/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('«لاحقاً» يقفل الطلب ويبقى تنبيه في «اليوم»', async () => {
    const { p, ctx } = await page(b);
    await p.click('#tLater');
    assert.match(await p.textContent('#s-today'), /وافق على اتفاقية معالجة البيانات/);
    await ctx.close();
  });

  await test('الوسيط ما يطلع له طلب الموافقة', async () => {
    const { p, ctx } = await page(b, { role: 'agent' });
    assert.equal(await p.isVisible('#sheet.on'), false);
    await ctx.close();
  });

  await test('عقار جديد: «عندك ٢ عملاء سابقين» ← القائمة بأزرار اتصال وواتساب ورسالة فيها ترخيص الإعلان', async () => {
    const { p, api, errors, ctx } = await page(b, { termsOk: true });
    await addProp(p);
    await p.waitForSelector('#mcShow');
    assert.match(await p.textContent('.matches-cta'), /2/);
    await shot(p, 'matches-prompt-m');
    await p.click('#mcShow');
    await p.waitForSelector('.pm-row');
    assert.equal(await p.$$eval('.pm-row', (r) => r.length), 2);
    const wa = await p.getAttribute('.pm-row a.wa', 'href');
    assert.ok(wa.startsWith('https://wa.me/966551112222?text='), wa);
    const txt = decodeURIComponent(wa.split('text=')[1]);
    assert.match(txt, /هلا أبو فهد/); assert.match(txt, /42,000 ريال سنوياً/); assert.match(txt, /ترخيص الإعلان: 7200034512/);
    assert.equal(await p.getAttribute('.pm-row a[href^="tel:"]', 'href'), 'tel:+966551112222');
    assert.ok(api.calls.some((x) => x.action === 'prop_matches'));
    await shot(p, 'matches-list-m');
    await p.click('.pm-row [data-lead="c1"]');
    await p.waitForTimeout(300);
    assert.equal(await p.textContent('#sheetTitle'), 'أبو فهد');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('عقار بلا ترخيص إعلان: تحذير، ورابط واتساب بلا تفاصيل العقار', async () => {
    const { p, ctx } = await page(b, { termsOk: true, licensed: false });
    await addProp(p);
    await p.click('#mcShow');
    await p.waitForSelector('.pm-row');
    assert.match(await p.textContent('#sheetBody'), /بلا ترخيص إعلان/);
    const wa = await p.getAttribute('.pm-row a.wa', 'href');
    assert.equal(wa, 'https://wa.me/966551112222');
    await ctx.close();
  });

  await test('لقطات: القائمة بالداكن وسطح المكتب', async () => {
    const { p, ctx } = await page(b, { termsOk: true }, { w: 1280, h: 860, dark: true });
    await addProp(p);
    await p.click('#mcShow'); await p.waitForSelector('.pm-row');
    await shot(p, 'matches-list-desk-dark');
    await ctx.close();
  });

  await b.close();
  for (const r of results) console.log(r.join('  '));
  const failed = results.filter((r) => r[0] === '✗').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
