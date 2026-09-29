// اختبار الواجهة v13: لوحة المدير · الدخول لمكتب والرجوع · خطوات أول دخول · إضافة عقار بخطوات ·
// طلب تعديل رخصة فال · التسجيل من شاشة الدخول
// التشغيل: node app/tests/admin.test.js [مجلد اللقطات]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const OUT = process.argv[2] || '/tmp/admin-shots';
fs.mkdirSync(OUT, { recursive: true });
const APP = 'file://' + path.join(__dirname, '..', 'dist', 'app.html');
const DAY = 864e5;
const riyadh = (d) => new Date(Date.now() + 3 * 3600e3 + d * DAY).toISOString().slice(0, 10);
const iso = (d) => new Date(Date.now() - d * DAY).toISOString();
const fal = (state, days) => ({ state, expires_on: days == null ? null : riyadh(days), days_left: days == null ? null : days,
  holder_name: null, note: null, has_proof: state === 'ok' });

const OFFICES = () => [
  { id: 'o1', code: 'OFFICE_01', name: 'مكتب الأفق العقاري', license_no: '1200012345', wa_number: '966501112345', wa_provider: 'ultramsg',
    wa_instance: '111', active: true, msg_quota: 15, wa_linked: true, leads: 12, props: 6, fal: fal('pending'), voice: true,
    has_signup_proof: true, fal_request: null },
  { id: 'o2', code: 'OFFICE_02', name: 'مكتب الواحة', license_no: '1100099999', wa_provider: 'cloud', active: true, msg_quota: 15,
    wa_linked: false, leads: 1, props: 1, fal: fal('ok', 12), voice: false, has_signup_proof: false,
    fal_request: { note: 'جددت الرخصة لسنة', at: iso(0.2), by: 'أبو خالد' } },
  { id: 'o3', code: 'OFFICE_03', name: 'مكتب النخبة', license_no: '1100044444', wa_provider: 'cloud', active: false, msg_quota: 15,
    wa_linked: true, leads: 0, props: 2, fal: fal('ok', 200), voice: false },
];
const PSTATUS = { can_edit: true, is_super: true, whatsapp: true, wa_number: '966501112345', wa_provider: 'ultramsg', msg_quota: 15,
  my_phone: '966500000009', my_role: 'super_admin', openai: true, telegram: true, meta: false, otp_platform: false,
  otp_template: '', platform_phone_id: '', meta_webhook: 'https://x/wa-webhook', wa_instance: '111', telegram_chat_id: '-100',
  ai_model: 'gpt-6-luna', ai_reasoning: 'low', operator_tg: true, errors: [],
  notify: { telegram: true, push: true, tg_linked: true, push_key: null, devices: 0, my_devices: 0, can_edit: true } };
const OWNER_OFFICE = { id: 'o1', name: 'مكتب الأفق العقاري', code: 'OFFICE_01', license_no: '1200012345', msg_quota: 15,
  wa_number: '966501112345', wa_provider: 'ultramsg', fal: fal('pending'), onboarded: false, onboarding: {}, fal_request: null };
const OWNER_STATUS = { can_edit: false, is_super: false, whatsapp: true, wa_number: '966501112345', my_phone: '966500000001',
  my_role: 'owner', errors: [],
  notify: { telegram: true, push: true, tg_linked: false, push_key: 'BAAA', devices: 0, my_devices: 0, can_edit: true } };
const SIGNUPS = [
  { id: 7, office_name: 'مكتب الديرة', contact_name: 'فهد', phone: '966551234567', city: 'الرياض', fal_license: '1100777777',
    agents: '2-5', note: null, status: 'new', created_at: iso(0.1), has_proof: true },
  { id: 6, office_name: 'مكتب قديم', contact_name: 'سالم', phone: '966551234568', city: 'جدة', fal_license: null,
    agents: null, note: null, status: 'new', created_at: iso(3), has_proof: false },
];
const USAGE = { totals: { new_customers: 48, qualified: 19, deals: 3, ai_calls: 410, otp: 12, errors: 0, cost_usd: 1.37 },
  prices: { ai_in: 0.1, ai_cached: 0.01, ai_out: 0.5, otp: 0.0107, updated: '2026-09-25' },
  rows: OFFICES().map((o) => ({ name: o.name, active: o.active, new_customers: 10, qualified: 4, deals: 1, ai_calls: 90, otp_platform: 2, otp_office: 1, errors: 0, cost_usd: 0.4 })) };
const LOG = [
  { id: 3, office_id: 'o1', created_at: iso(0.01), detail: { by: 'تركي', action: 'office_save', label: 'بيانات المكتب', fields: ['wa_token', 'voice'], office: 'مكتب الأفق العقاري' } },
  { id: 2, office_id: null, created_at: iso(0.5), detail: { by: 'تركي', action: 'platform_save', label: 'إعدادات المنصة', fields: [], office: null } },
];

function makeApi(role) {
  const calls = [];
  const state = { office: JSON.parse(JSON.stringify(OWNER_OFFICE)), props: [], staff: [] };
  const reply = (a, b) => {
    calls.push(b);
    const sup = role === 'super';
    switch (a) {
      case 'bootstrap':
        return sup
          ? { staff: { name: 'تركي', role: 'super_admin' }, is_super: true, office: { ...OWNER_OFFICE, onboarded: true },
              leads: [], properties: [], status: PSTATUS, offices: OFFICES(), signups_new: 2 }
          : { staff: { name: 'أبو فيصل', role: 'owner' }, is_super: false, office: state.office, leads: [], properties: state.props,
              status: OWNER_STATUS, offices: null, signups_new: null };
      case 'offices_list': return { offices: OFFICES() };
      case 'settings_status': return sup ? PSTATUS : OWNER_STATUS;
      case 'signup_list': return { requests: SIGNUPS };
      case 'platform_usage': return USAGE;
      case 'backups_status': return { runs: [{ started_at: iso(0.3), ok: true, bytes: 204800 }] };
      case 'admin_log': return { log: LOG };
      case 'leads': return { leads: [] };
      case 'properties': return { properties: state.props };
      case 'month_stats': return { month: '2026-09', stats: {} };
      case 'analytics': return { gap: [] };
      case 'fal_get': return { license_no: '1100099999', fal: fal('ok', 12), history: [] };
      case 'staff_list': return { staff: state.staff };
      case 'staff_save': state.staff.push({ id: 'n' + state.staff.length, ...b.staff, active: true }); return { ok: true };
      case 'onboarding_save': {
        for (const k of b.done || []) state.office.onboarding[k] = new Date().toISOString();
        if (b.finish) state.office.onboarded = true;
        return { ok: true, onboarding: state.office.onboarding, onboarded: state.office.onboarded };
      }
      case 'property_save': state.props.push({ id: 'P' + state.props.length, ...b.property, listable: !!b.property.ad_license_no }); return { ok: true };
      case 'fal_request': return { ok: true };
      case 'platform_save': return { ok: true };
      default: return { ok: true };
    }
  };
  return { calls, state, reply };
}

async function page(b, { w = 390, h = 844, dark = false, role = 'super', auth = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? 'dark' : 'light', locale: 'ar-SA' });
  if (!auth) await ctx.addInitScript(() => { try { localStorage.setItem('maqsad_token', 'T'); } catch (e) {} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const api = makeApi(role);
  await p.route('**/functions/v1/api*', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(api.reply(body.action, body)) });
  });
  const joins = [];
  await p.route('**/functions/v1/join*', async (route) => {
    joins.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await p.goto(APP);
  if (!auth) { await p.waitForSelector('#app:not([hidden])'); await p.waitForTimeout(400); }
  return { p, api, errors, joins, ctx };
}
const visibleTabs = (p) => p.$$eval('.nav button', (bs) => bs.filter((b) => !b.hidden).map((b) => b.dataset.screen));
const shot = (p, n, full) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: !!full });
const results = [];
async function test(name, fn) { try { await fn(); results.push(['✓', name]); } catch (e) { results.push(['✗', name, e.message.split('\n')[0]]); } }

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  await test('المدير يفتح على لوحة المنصة (مو واجهة مكتب)', async () => {
    const { p, errors, ctx } = await page(b);
    assert.deepEqual(await visibleTabs(p), ['s-home', 's-offices', 's-signups', 's-platform']);
    assert.equal(await p.$eval('#s-home', (n) => n.classList.contains('on')), true);
    assert.equal(await p.textContent('#topOffice'), 'منصة مقصد');
    const attn = await p.textContent('#homeAttn');
    assert.match(attn, /طلبات انضمام جديدة/); assert.match(attn, /طلب تعديل رخصة: مكتب الواحة/);
    assert.match(attn, /مكتب الأفق العقاري: فال بانتظار التحقق/); assert.match(attn, /مكتب الواحة: واتساب غير مربوط/);
    assert.doesNotMatch(attn, /مكتب النخبة/, 'المكتب الموقوف ما يظهر في التنبيهات');
    assert.match(await p.textContent('#homeStats'), /48/);
    assert.match(await p.textContent('#homeServices'), /GPT-6 Luna/);
    assert.equal(await p.isHidden('#inOffice'), true);
    await shot(p, 'home-m', true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('المكاتب: بحث وفلتر «يحتاج انتباه»، والدخول لمكتب ثم الرجوع', async () => {
    const { p, api, errors, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-offices"]');
    assert.equal(await p.$$eval('#officesList .row', (r) => r.length), 3);
    await p.click('#officeChips .chip[data-f="attn"]');
    assert.equal(await p.$$eval('#officesList .row', (r) => r.length), 2);
    await p.click('#officeChips .chip[data-f="all"]');
    await p.fill('#officeSearch', 'النخبة');
    assert.equal(await p.$$eval('#officesList .row', (r) => r.length), 1);
    await p.fill('#officeSearch', '');
    await shot(p, 'offices-m', true);
    await p.click('#officesList .row:first-child .btn:has-text("ادخل")');
    await p.waitForTimeout(300);
    assert.deepEqual(await visibleTabs(p), ['s-today', 's-leads', 's-stock', 's-set']);
    assert.equal(await p.isVisible('#inOffice'), true);
    assert.match(await p.textContent('#inOfficeName'), /مكتب الأفق/);
    assert.ok(api.calls.some((c) => c.action === 'leads' && c.office_id === 'o1'), 'طلبات المكتب تروح بمعرّفه');
    await shot(p, 'inside-office-m');
    await p.click('#btnExitOffice');
    await p.waitForTimeout(200);
    assert.deepEqual(await visibleTabs(p), ['s-home', 's-offices', 's-signups', 's-platform']);
    assert.equal(await p.isHidden('#inOffice'), true);
    const n = api.calls.length;
    await p.click('#btnRefresh'); await p.waitForTimeout(200);
    assert.ok(api.calls.slice(n).every((c) => !c.office_id), 'بعد الرجوع ما يُرسل معرّف مكتب');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('تعديل المكتب: الصوتيات، رسالة اختبار، طلب تعديل الرخصة وصورة التسجيل', async () => {
    const { p, api, errors, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-offices"]');
    await p.click('#officesList .row:nth-child(2) .btn:has-text("تعديل")');
    await p.waitForTimeout(300);
    assert.match(await p.textContent('#falFiles'), /جددت الرخصة لسنة/);
    assert.equal(await p.isChecked('#oVoice'), false);
    await p.check('#oVoice');
    await shot(p, 'office-sheet-m');
    await p.click('#oSave'); await p.waitForTimeout(200);
    const save = api.calls.find((c) => c.action === 'office_save');
    assert.equal(save.office.voice, true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('الطلبات: صورة الرخصة ظاهرة، وإعدادات المنصة (النموذج والسجل)', async () => {
    const { p, api, errors, ctx } = await page(b);
    await p.click('.nav button[data-screen="s-signups"]');
    assert.match(await p.textContent('#signupList'), /صورة الرخصة مرفقة/);
    assert.match(await p.textContent('#signupList'), /بلا صورة رخصة/);
    assert.equal(await p.$$eval('#signupList .btn:has-text("صورة الرخصة")', (x) => x.length), 1);
    await shot(p, 'signups-m', true);
    await p.click('.nav button[data-screen="s-platform"]');
    assert.equal(await p.inputValue('#aiModel'), 'gpt-6-luna');
    await p.selectOption('#aiEffort', 'medium');
    await p.click('#btnSaveAi'); await p.waitForTimeout(200);
    assert.ok(api.calls.some((c) => c.action === 'platform_save' && c.ai_reasoning === 'medium' && !c.office_id));
    assert.match(await p.textContent('#adminLog'), /توكن واتساب، الصوتيات/);
    assert.equal(await p.$('#kInst'), null, 'حقول المكتب الواحد طلعت من مفاتيح المنصة');
    await shot(p, 'platform-m', true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('الكمبيوتر + الوضع الداكن: الرئيسية والمكاتب', async () => {
    const { p, errors, ctx } = await page(b, { w: 1280, h: 900, dark: true });
    await shot(p, 'home-d-dark', true);
    await p.click('.nav button[data-screen="s-offices"]');
    await shot(p, 'offices-d-dark', true);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(over <= 0, 'تمرير أفقي');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('صاحب المكتب: خطوات أول دخول تنفتح، وتكمل للنهاية', async () => {
    const { p, api, errors, ctx } = await page(b, { role: 'owner' });
    assert.deepEqual(await visibleTabs(p), ['s-today', 's-leads', 's-stock', 's-set']);
    assert.equal(await p.isVisible('#sheet.on'), true);
    assert.match(await p.textContent("#ob"), /هلا أبو فيصل/);
    await shot(p, 'ob-0-m');
    await p.click('#obGo');
    assert.match(await p.textContent('#ob'), /بيانات مكتبك/);
    await shot(p, 'ob-1-m');
    await p.click('#obNext'); await p.waitForTimeout(150);
    assert.ok(await p.$('#obNotify #notifyCard'), 'بطاقة التنبيهات داخل الخطوة');
    await shot(p, 'ob-2-m');
    await p.click('#obNext'); await p.waitForTimeout(150);
    assert.ok(await p.$('#notifyBlock #notifyCard'), 'البطاقة رجعت لمكانها');
    await p.click('#obProp');
    // إضافة عقار بخطوات من داخل الترحيب
    await p.click('.wz-choice[data-v="إيجار"]'); await p.click('.wz-choice[data-v="شقة"]');
    await shot(p, 'prop-1-m');
    await p.click('#wzNext'); await p.fill('#wzDistrict', 'النرجس'); await p.fill('#wzRooms', '3');
    await p.click('#wzNext'); await p.fill('#wzPrice', '٤٥٠٠٠');
    assert.match(await p.textContent('#wzPriceHint'), /45,000 ريال سنوياً/);
    await p.click('#wzNext');
    assert.match(await p.textContent('#wzNext'), /بدون ترخيص/);
    await shot(p, 'prop-4-m');
    await p.fill('#wzLic', '7200034512'); await p.fill('#wzExp', riyadh(90));
    await p.click('#wzNext');
    assert.match(await p.textContent('#wz'), /شقة النرجس/);
    await shot(p, 'prop-5-m');
    await p.click('#wzNext'); await p.waitForTimeout(250);
    const ps = api.calls.find((c) => c.action === 'property_save');
    assert.equal(ps.property.price, '45000'); assert.equal(ps.property.title, 'شقة النرجس'); assert.equal(ps.property.deal_type, 'إيجار');
    assert.match(await p.textContent('#ob'), /أضف وسطاء مكتبك/);
    await p.fill('#obTName', 'سعد'); await p.fill('#obTPhone', '0551112222'); await p.click('#obTAdd'); await p.waitForTimeout(200);
    assert.match(await p.textContent('#obTeam'), /سعد/);
    await shot(p, 'ob-4-m');
    await p.click('#obNext'); await p.waitForTimeout(150);
    assert.match(await p.textContent('#ob'), /مكتبك جاهز/);
    await p.click('#obEnd'); await p.waitForTimeout(200);
    assert.ok(api.calls.some((c) => c.action === 'onboarding_save' && c.finish === true));
    assert.equal(await p.isVisible('#sheet.on'), false);
    assert.doesNotMatch(await p.textContent('#attnList'), /كمّل تجهيز مكتبك/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('صاحب المكتب: «لاحقاً» يقفل الترحيب ويبقى تذكير في «اليوم»، والرخصة للقراءة مع طلب تعديل', async () => {
    const { p, api, errors, ctx } = await page(b, { role: 'owner' });
    await p.click('#obLater'); await p.waitForTimeout(100);
    assert.match(await p.textContent('#attnList'), /كمّل تجهيز مكتبك/);
    await shot(p, 'today-owner-m');
    await p.click('.nav button[data-screen="s-set"]');
    assert.equal(await p.$('#oLic'), null);
    await p.click('#btnFalReq');
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(10, 0)]);
    await p.setInputFiles('#frFile', { name: 'fal.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(3000, 1)]) });
    await p.waitForTimeout(150);
    await p.fill('#frNote', 'جددت الرخصة');
    await shot(p, 'fal-request-m');
    await p.click('#frSend'); await p.waitForTimeout(1200);
    const fr = api.calls.find((c) => c.action === 'fal_request');
    assert.match(fr.file, /^data:application\/pdf;base64,/); assert.equal(fr.note, 'جددت الرخصة');
    assert.match(await p.textContent('#falReqBox'), /أرسلت طلب تعديل الرخصة/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await test('شاشة الدخول: «سجّل مكتبك» يرسل الطلب مع صورة الرخصة', async () => {
    const { p, joins, errors, ctx } = await page(b, { auth: true });
    await p.waitForSelector('#auth:not([hidden])');
    await shot(p, 'auth-m');
    await p.click('#btnSignup');
    await p.fill('#suOffice', 'مكتب الديرة'); await p.fill('#suName', 'فهد'); await p.fill('#suPhone', '0551234567');
    await p.fill('#suFal', '١١٠٠٧٧٧٧٧٧');
    await p.click('#suSend');
    assert.match(await p.textContent('#suMsg'), /ارفع صورة رخصة فال/);
    await p.setInputFiles('#suFile', { name: 'fal.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(3000, 1)]) });
    await p.check('#suConsent');
    await p.waitForTimeout(2600);
    await shot(p, 'signup-m', true);
    await p.click('#suSend'); await p.waitForTimeout(300);
    assert.equal(joins.length, 1);
    assert.equal(joins[0].v, 2); assert.equal(joins[0].fal_license, '1100777777'); assert.equal(joins[0].phone, '966551234567');
    assert.match(joins[0].fal_file, /^data:application\/pdf/);
    assert.match(await p.textContent('#sheetBody'), /وصل طلبك/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await b.close();
  for (const r of results) console.log(r.join('  '));
  const failed = results.filter((r) => r[0] === '✗').length;
  console.log(`\n${results.length - failed}/${results.length} passed · لقطات: ${OUT}`);
  process.exit(failed ? 1 : 0);
})();
