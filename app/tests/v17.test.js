// اختبار الواجهة v17: الوسيط المسؤول عن العميل · فلتر «عملائي» · البحث في العملاء الأقدم
// التشغيل: python3 app/build.py && node app/tests/v17.test.js [مجلد اللقطات]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const OUT = process.argv[2] || '/tmp/v17-shots';
fs.mkdirSync(OUT, { recursive: true });
const APP = 'file://' + path.join(__dirname, '..', 'dist', 'app.html');
const inDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const OFFICE = { id: 'o1', name: 'مكتب الأفق العقاري', code: 'OFFICE_01', license_no: '1200012345', msg_quota: 40,
  wa_number: '966501112345', wa_provider: 'cloud', fal: { state: 'ok', expires_on: inDays(200), days_left: 200 },
  onboarded: true, onboarding: {}, fal_request: null, terms: { version: '2026-09-26', ok: true, at: inDays(-1) } };
const STATUS = { can_edit: false, is_super: false, whatsapp: true, wa_number: '966501112345', my_phone: '966500000002',
  my_role: 'agent', errors: [], notify: { telegram: true, push: true, tg_linked: true, push_key: null, devices: 0, my_devices: 0, can_edit: false } };
const TEAM = [{ id: 's1', name: 'أبو فيصل' }, { id: 's2', name: 'سعد الحربي' }];
const LEADS = [
  { id: 'c1', name: 'عميل لي', phone: '966551110001', deal_type: 'إيجار', property_type: 'شقة', location: 'النرجس',
    status: 'qualified', mode: 'auto', assigned_to: 's2', msg_count: 3 },
  { id: 'c2', name: 'عميل للمدير', phone: '966551110002', deal_type: 'شراء', property_type: 'فيلا', location: 'الملقا',
    status: 'inquiry', mode: 'auto', assigned_to: 's1', msg_count: 2 },
  { id: 'c3', name: 'عميل بلا وسيط', phone: '966551110003', deal_type: 'إيجار', property_type: 'دور', location: 'العارض',
    status: 'inquiry', mode: 'auto', assigned_to: null, msg_count: 1 },
];

function makeApi({ me = { id: 's2', name: 'سعد الحربي', role: 'agent' } } = {}) {
  const calls = [];
  const state = { leads: JSON.parse(JSON.stringify(LEADS)) };
  const reply = (a, b) => {
    calls.push(b);
    switch (a) {
      case 'bootstrap': return { staff: me, is_super: false, office: OFFICE, leads: state.leads, team: TEAM,
        properties: [], status: { ...STATUS, my_role: me.role }, offices: null, signups_new: null };
      case 'lead': return { lead: { ...state.leads.find((l) => l.id === b.id) }, messages: [] };
      case 'lead_assign': {
        const l = state.leads.find((x) => x.id === b.id); l.assigned_to = b.staff_id;
        return { ok: true, lead: l, assigned_name: (TEAM.find((t) => t.id === b.staff_id) || {}).name || null };
      }
      case 'month_stats': return { month: '2026-10', stats: {} };
      case 'analytics': return { gap: [] };
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

  await test('الوسيط: «عملائي» يعرض عملاءه فقط، وعليهم «لك»، والباقين باسم الوسيط', async () => {
    const { p, errors, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-leads"]');
    const all = await p.textContent('#s-leads');
    assert.match(all, /لك/, 'علامة «لك» ما ظهرت');
    assert.match(all, /أبو فيصل/, 'اسم الوسيط الثاني ما ظهر');
    await p.click('#leadChips [data-f="mine"]');
    const t = await p.textContent('#s-leads');
    assert.match(t, /عميل لي/, 'عميله ما ظهر في «عملائي»');
    assert.doesNotMatch(t, /عميل للمدير|عميل بلا وسيط/, '«عملائي» فيه عملاء غيره');
    await shot(p, 'mine');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('الوسيط يشوف اسم المسؤول في بطاقة العميل بلا قائمة اختيار', async () => {
    const { p, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-leads"]');
    await p.click('#s-leads .row >> text=عميل للمدير');
    await p.waitForSelector('#assignNote');
    assert.equal(await p.$('#leadAssign'), null, 'الوسيط يقدر يغيّر المسؤول');
    assert.match(await p.textContent('#assignNote'), /أبو فيصل/);
    await ctx.close();
  });

  await test('صاحب المكتب يختار الوسيط من البطاقة ويوصل الطلب للخادم', async () => {
    const { p, api, errors, ctx } = await page(b, { me: { id: 's1', name: 'أبو فيصل', role: 'owner' } });
    await p.click('.nav button[data-screen="s-leads"]');
    await p.click('#s-leads .row >> text=عميل بلا وسيط');
    await p.waitForSelector('#leadAssign');
    await p.selectOption('#leadAssign', 's2');
    await p.waitForTimeout(300);
    const c = api.calls.find((x) => x.action === 'lead_assign');
    assert.equal(c.id, 'c3'); assert.equal(c.staff_id, 's2');
    assert.match(await p.textContent('#assignNote'), /سعد الحربي/);
    await shot(p, 'assign');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await b.close();
  for (const r of results) console.log(r.join('  '));
  const bad = results.filter((r) => r[0] === '✗').length;
  console.log(`\n${results.length - bad}/${results.length} passed`);
  process.exit(bad ? 1 : 0);
})();
