// اختبار الواجهة v18: تأكيد توفّر العقارات · زر «تم تأجيره/تم بيعه» · «ما زال متاح» · فلتر «بانتظار التأكيد»
// التشغيل: python3 app/build.py && node app/tests/v18.test.js [مجلد اللقطات]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const OUT = process.argv[2] || '/tmp/v18-shots';
fs.mkdirSync(OUT, { recursive: true });
const APP = 'file://' + path.join(__dirname, '..', 'dist', 'app.html');
const inDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const agoIso = (d) => new Date(Date.now() - d * 864e5).toISOString();
const OFFICE = { id: 'o1', name: 'مكتب الأفق العقاري', code: 'OFFICE_01', license_no: '1200012345', msg_quota: 40,
  wa_number: '966501112345', wa_provider: 'cloud', fal: { state: 'ok', expires_on: inDays(200), days_left: 200 },
  onboarded: true, onboarding: {}, fal_request: null, terms: { version: '2026-09-26', ok: true, at: inDays(-1) } };
const STATUS = { can_edit: false, is_super: false, whatsapp: true, wa_number: '966501112345', my_phone: '966500000002',
  my_role: 'agent', errors: [], notify: { telegram: true, push: true, tg_linked: true, push_key: null, devices: 0, my_devices: 0, can_edit: false } };
const prop = (id, title, over) => Object.assign({ id, title, deal_type: 'إيجار', property_type: 'شقة', district: 'النرجس', city: 'الرياض',
  price: 42000, rooms: 3, state: 'available', ad_license_no: '7200034512', ad_license_expiry: inDays(90),
  confirmed_at: agoIso(1), listable: true, block_reason: null }, over || {});
const PROPS = [
  prop('p1', 'شقة قديمة', { confirmed_at: agoIso(9) }),
  prop('p2', 'فيلا للبيع', { deal_type: 'شراء', property_type: 'فيلا', confirmed_at: agoIso(2) }),
  prop('p3', 'دور أوقفه البوت', { state: 'unconfirmed', confirmed_at: agoIso(15), listable: false, block_reason: 'غير متاح' }),
  prop('p4', 'شقة مؤجّرة', { state: 'rented', listable: false, block_reason: 'غير متاح' }),
];

function makeApi() {
  const calls = [];
  const props = JSON.parse(JSON.stringify(PROPS));
  const reply = (a, b) => {
    calls.push(b);
    switch (a) {
      case 'bootstrap': return { staff: { id: 's2', name: 'سعد', role: 'agent' }, is_super: false, office: OFFICE, leads: [], team: [],
        properties: props, status: STATUS, offices: null, signups_new: null };
      case 'properties': return { properties: props };
      case 'prop_mark': {
        const p = props.find((x) => x.id === b.id);
        if (b.to === 'confirm') { p.confirmed_at = new Date().toISOString(); if (p.state === 'unconfirmed') p.state = 'available'; }
        else p.state = b.to;
        p.listable = p.state === 'available'; p.block_reason = p.listable ? null : 'غير متاح';
        return { ok: true, properties: [p] };
      }
      case 'month_stats': return { month: '2026-10', stats: {} };
      case 'analytics': return { gap: [] };
      case 'settings_status': return STATUS;
      default: return { ok: true };
    }
  };
  return { calls, reply, props };
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
  await p.click('.nav button[data-screen="s-stock"]');
  return { p, api, errors, ctx };
}
const rowOf = (p, title) => p.locator('#stockWrap .prow', { hasText: title });
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true });
const results = [];
async function test(name, fn) { try { await fn(); results.push(['✓', name]); } catch (e) { results.push(['✗', name, e.message.split('\n')[0]]); } }

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  await test('كل عقار نشط فيه زر «تم تأجيره»، والبيع «تم بيعه»، و«ما زال متاح» للقديم فقط', async () => {
    const { p, errors, ctx } = await page(b);
    assert.match(await rowOf(p, 'شقة قديمة').textContent(), /ما زال متاح[\s\S]*تم تأجيره/);
    const fresh = await rowOf(p, 'فيلا للبيع').textContent();
    assert.match(fresh, /تم بيعه/); assert.doesNotMatch(fresh, /ما زال متاح/, 'العقار الجديد ما يحتاج تأكيد');
    assert.match(await rowOf(p, 'شقة مؤجّرة').textContent(), /إعادة للمتاح/);
    await shot(p, 'stock');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('ضغطة «تم تأجيره» تُرسل prop_mark وتخفي العقار من «للعرض»، و«إعادة للمتاح» ترجعه', async () => {
    const { p, api, ctx } = await page(b);
    await rowOf(p, 'شقة قديمة').getByRole('button', { name: 'تم تأجيره' }).click();
    await p.waitForTimeout(300);
    const c = api.calls.find((x) => x.action === 'prop_mark');
    assert.equal(c.id, 'p1'); assert.equal(c.to, 'rented');
    assert.match(await rowOf(p, 'شقة قديمة').textContent(), /مؤجّر[\s\S]*إعادة للمتاح/);
    await rowOf(p, 'شقة قديمة').getByRole('button', { name: 'إعادة للمتاح' }).click();
    await p.waitForTimeout(300);
    assert.equal(api.calls.filter((x) => x.action === 'prop_mark').pop().to, 'available');
    assert.match(await rowOf(p, 'شقة قديمة').textContent(), /للعرض/);
    await ctx.close();
  });

  await test('فلتر «بانتظار التأكيد»: القديم وغير المؤكَّد فقط، و«ما زال متاح» يرجع غير المؤكَّد للعرض', async () => {
    const { p, api, errors, ctx } = await page(b);
    await p.click('#stockChips [data-f="confirm"]');
    const t = await p.textContent('#stockWrap');
    assert.match(t, /شقة قديمة/); assert.match(t, /دور أوقفه البوت/); assert.match(t, /غير مؤكَّد/);
    assert.doesNotMatch(t, /فيلا للبيع|شقة مؤجّرة/);
    await shot(p, 'confirm');
    await rowOf(p, 'دور أوقفه البوت').getByRole('button', { name: 'ما زال متاح' }).click();
    await p.waitForTimeout(300);
    assert.equal(api.calls.filter((x) => x.action === 'prop_mark').pop().to, 'confirm');
    assert.doesNotMatch(await p.textContent('#stockWrap'), /دور أوقفه البوت/, 'بعد التأكيد يطلع من «بانتظار التأكيد»');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('شاشة «اليوم» تنبّه: عقارات بانتظار التأكيد، وتفتح الفلتر', async () => {
    const { p, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-today"]');
    const card = p.locator('#attnList .attn', { hasText: 'بانتظار تأكيد توفّره' });
    assert.match(await card.textContent(), /2 عقار/);
    assert.match(await card.textContent(), /1 منها أوقفها البوت/);
    await card.click();
    assert.equal(await p.getAttribute('#stockChips [data-f="confirm"]', 'aria-pressed'), 'true');
    await ctx.close();
  });

  await b.close();
  for (const r of results) console.log(r.join('  '));
  const bad = results.filter((r) => r[0] === '✗').length;
  console.log(`\n${results.length - bad}/${results.length} passed`);
  process.exit(bad ? 1 : 0);
})();
