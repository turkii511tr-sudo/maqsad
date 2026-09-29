// اختبار الواجهة v15: الدخول برسالة واتساب يرسلها الموظف، ثم البصمة، والرمز الاحتياطي، و«أجهزتي»
// التشغيل: node app/tests/v15.test.js [مجلد اللقطات]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const OUT = process.argv[2] || '/tmp/v15-shots';
fs.mkdirSync(OUT, { recursive: true });
const APP = 'file://' + path.join(__dirname, '..', 'dist', 'app.html');
const inDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const OFFICE = { id: 'o1', name: 'مكتب الأفق العقاري', code: 'OFFICE_01', license_no: '1200012345', msg_quota: 15,
  wa_number: '966501112345', wa_provider: 'ultramsg', fal: { state: 'ok', expires_on: inDays(200), days_left: 200 },
  onboarded: true, onboarding: {}, fal_request: null, terms: { version: '2026-09-26', ok: true, at: null } };
const STATUS = { can_edit: false, is_super: false, whatsapp: true, wa_number: '966501112345', my_phone: '966500000001',
  my_role: 'owner', errors: [], notify: { telegram: true, push: true, tg_linked: true, push_key: null, devices: 0, my_devices: 0, can_edit: true } };

function makeApi(opts = {}) {
  const calls = [];
  let polls = 0;
  const keys = [{ id: 'k1', label: 'آيفون', created_at: new Date(Date.now() - 3 * 864e5).toISOString(), last_used_at: new Date().toISOString(), rp_id: 'x' }];
  const reply = (a, b) => {
    calls.push(b);
    switch (a) {
      case 'login_start':
        if (b.phone === '0555555555') return [404, { error: 'not_registered' }];
        return [200, { id: 'L1', poll: 'P1', wa: '966599999999', text: 'دخول مقصد ٤٨٢١', ttl: 300 }];
      case 'login_poll': polls++; return [200, polls < 2 ? { state: 'waiting' } : { ok: true, token: 'T', staff: { name: 'أبو فيصل', role: 'owner' } }];
      case 'verify_otp': return b.code === '123456' ? [200, { ok: true, token: 'T', staff: { name: 'أبو فيصل', role: 'owner' } }] : [400, { error: 'wrong_code' }];
      case 'admin_tg_code': return [200, { ok: true }];
      case 'pk_reg_options': return [200, { cid: 'C1', challenge: 'AAAA', timeout: 1000, rp: { id: 'localhost', name: 'مقصد' },
        user: { id: 'czE', name: '0500000001', displayName: 'أبو فيصل — مكتب الأفق' }, exclude: [] }];
      case 'pk_reg_verify': return [200, { ok: true }];
      case 'pk_login_options': return [200, { cid: 'C2', challenge: 'BBBB', rpId: 'localhost', timeout: 1000 }];
      case 'pk_login_verify': return opts.pkFail ? [401, { error: 'ما قدرنا نتحقق من البصمة. ادخل عن طريق واتساب.' }]
        : [200, { ok: true, token: 'T', staff: { name: 'أبو فيصل', role: 'owner' } }];
      case 'pk_list': return [200, { passkeys: opts.noKeys ? [] : keys }];
      case 'pk_delete': keys.splice(0, 1); return [200, { ok: true }];
      case 'logout': return [200, { ok: true }];
      case 'bootstrap': return [200, { staff: { name: 'أبو فيصل', role: 'owner' }, is_super: false, office: OFFICE,
        leads: [], properties: [], status: STATUS, offices: null, signups_new: null }];
      case 'month_stats': return [200, { month: '2026-09', stats: {} }];
      case 'settings_status': return [200, STATUS];
      case 'staff_list': return [200, { staff: [] }];
      default: return [200, { ok: true }];
    }
  };
  return { calls, reply, polls: () => polls };
}

// بصمة وهمية: تكفي لاختبار الواجهة (التحقق الحقيقي مختبر في الخادم)
const FAKE_PK = () => {
  const buf = (s) => new TextEncoder().encode(s).buffer;
  window.PublicKeyCredential = function () {};
  window.__pk = [];
  navigator.credentials.create = async (o) => { window.__pk.push(['create', o.publicKey.rp.id, o.publicKey.authenticatorSelection.userVerification]);
    return { rawId: buf('cred'), response: { clientDataJSON: buf('cd'), attestationObject: buf('att'), getTransports: () => ['internal'] } }; };
  navigator.credentials.get = async (o) => { window.__pk.push(['get', o.publicKey.rpId, o.publicKey.userVerification]);
    return { rawId: buf('cred'), response: { clientDataJSON: buf('cd'), authenticatorData: buf('ad'), signature: buf('sig'), userHandle: buf('s1') } }; };
};

async function page(b, opts = {}, view = { w: 390, h: 844, dark: false }) {
  const ctx = await b.newContext({ viewport: { width: view.w, height: view.h }, colorScheme: view.dark ? 'dark' : 'light', locale: 'ar-SA' });
  await ctx.addInitScript(FAKE_PK);
  if (opts.pkFlag) await ctx.addInitScript(() => { try { localStorage.setItem('maqsad_pk', '1'); } catch (e) {} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p.route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'wa' }));
  const api = makeApi(opts);
  await p.route('**/functions/v1/api*', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const [status, json] = api.reply(body.action, body);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  });
  await p.goto(APP);
  await p.waitForSelector('#auth:not([hidden])');
  return { p, api, errors, ctx };
}
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png') });
const results = [];
async function test(name, fn) { try { await fn(); results.push(['✓', name]); } catch (e) { results.push(['✗', name, e.message]); } }

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  await test('الشاشة الأولى: رقم الجوال وزر واتساب، ورابط البصمة لأن الجهاز يدعمها وما فُعّلت', async () => {
    const { p, errors, ctx } = await page(b);
    assert.equal(await p.isVisible('#btnWa'), true);
    assert.equal(await p.isVisible('#btnPk'), false);
    assert.equal(await p.isVisible('#btnPkLink'), true);
    assert.equal(await p.isVisible('#btnHaveCode'), true);
    assert.doesNotMatch(await p.textContent('#auth'), /أرسل رمز الدخول/);
    await shot(p, 'login-m');
    assert.deepEqual(errors, []); await ctx.close();
  });

  await test('واتساب: رسالة جاهزة ورابط واتساب، ينتظر، يدخل تلقائياً، ثم عرض البصمة', async () => {
    const { p, api, errors, ctx } = await page(b);
    await p.fill('#ph', '0500000001');
    await p.click('#btnWa');
    await p.waitForSelector('#authWait:not([hidden])');
    assert.equal(await p.textContent('#waText'), 'دخول مقصد ٤٨٢١');
    const href = await p.getAttribute('#btnOpenWa', 'href');
    assert.equal(href, 'https://wa.me/966599999999?text=' + encodeURIComponent('دخول مقصد ٤٨٢١'));
    assert.match(await p.textContent('#waTo'), /0599999999|059/);
    const st = api.calls.find((c) => c.action === 'login_start');
    assert.ok(st.device, 'device label');
    await shot(p, 'login-wait-m');
    await p.waitForSelector('#authPk:not([hidden])', { timeout: 8000 });
    assert.ok(api.polls() >= 2);
    await shot(p, 'login-pk-offer-m');
    await p.click('#btnPkSkip');
    await p.waitForSelector('#app:not([hidden])');
    assert.ok(await p.evaluate(() => localStorage.getItem('maqsad_pk_skip')));
    assert.deepEqual(errors, []); await ctx.close();
  });

  await test('تفعيل البصمة بعد الدخول: تطلب تحقق المستخدم وتُرسل للخادم، وبعدها زر البصمة هو الأول', async () => {
    const { p, api, errors, ctx } = await page(b);
    await p.fill('#ph', '0500000001');
    await p.click('#btnWa');
    await p.waitForSelector('#authPk:not([hidden])', { timeout: 8000 });
    await p.click('#btnPkEnroll');
    await p.waitForSelector('#app:not([hidden])');
    const v = api.calls.find((c) => c.action === 'pk_reg_verify');
    assert.ok(v && v.cid === 'C1' && v.attestationObject && v.clientDataJSON && v.label, JSON.stringify(v));
    assert.deepEqual(v.transports, ['internal']);
    const pk = await p.evaluate(() => window.__pk);
    assert.deepEqual(pk[0], ['create', 'localhost', 'required']);
    assert.equal(await p.evaluate(() => localStorage.getItem('maqsad_pk')), '1');
    // الخروج ← الشاشة الأولى تعرض البصمة أول
    await p.evaluate(() => { document.querySelector('#btnLogout').click(); });
    await p.waitForSelector('#auth:not([hidden])');
    assert.equal(await p.isVisible('#btnPk'), true);
    assert.equal(await p.isVisible('#btnPkLink'), false);
    const lo = api.calls.find((c) => c.action === 'logout');
    assert.equal(lo.all, undefined, 'logout must be this device only');
    assert.deepEqual(errors, []); await ctx.close();
  });

  await test('الدخول بالبصمة بلا رقم، ورفض البصمة يعطي رسالة واضحة (مو «انتهت الجلسة»)', async () => {
    let { p, api, errors, ctx } = await page(b, { pkFlag: true });
    await shot(p, 'login-pk-m');
    await p.click('#btnPk');
    await p.waitForSelector('#app:not([hidden])');
    const v = api.calls.find((c) => c.action === 'pk_login_verify');
    assert.ok(v.cid === 'C2' && v.signature && v.authenticatorData && v.userHandle);
    assert.deepEqual(await p.evaluate(() => window.__pk[0]), ['get', 'localhost', 'required']);
    assert.equal(api.calls.some((c) => c.action === 'login_start'), false);
    assert.deepEqual(errors, []); await ctx.close();
    ({ p, api, errors, ctx } = await page(b, { pkFlag: true, pkFail: true }));
    await p.click('#btnPk');
    await p.waitForSelector('#authMsg .msg');
    assert.match(await p.textContent('#authMsg'), /ما قدرنا نتحقق من البصمة/);
    assert.doesNotMatch(await p.textContent('#authMsg'), /انتهت الجلسة/);
    assert.equal(await p.isVisible('#auth'), true);
    await ctx.close();
  });

  await test('رقم غير مسجّل، والرمز الاحتياطي، ورمز تيليجرام للمشغّل', async () => {
    const { p, api, errors, ctx } = await page(b);
    await p.fill('#ph', '0555555555');
    await p.click('#btnWa');
    await p.waitForSelector('#authMsg .msg');
    assert.match(await p.textContent('#authMsg'), /غير مسجّل/);
    await p.fill('#ph', '0500000001');
    await p.click('#btnHaveCode');
    assert.equal(await p.isVisible('#authCode'), true);
    await shot(p, 'login-code-m');
    await p.click('#btnTgCode');
    assert.ok(api.calls.some((c) => c.action === 'admin_tg_code' && c.phone === '0500000001'));
    await p.fill('#cd', '000000'); await p.click('#btnVerify');
    await p.waitForSelector('#authMsg .msg.err');
    assert.match(await p.textContent('#authMsg'), /غير صحيح/);
    await p.fill('#cd', '123456'); await p.click('#btnVerify');
    await p.waitForSelector('#authPk:not([hidden])');
    assert.deepEqual(errors, []); await ctx.close();
  });

  await test('الإعدادات: «الدخول بالبصمة» تعرض الأجهزة، والحذف، والخروج من كل الأجهزة', async () => {
    const { p, api, errors, ctx } = await page(b, { pkFlag: true });
    await p.click('#btnPk');
    await p.waitForSelector('#app:not([hidden])');
    await p.click('.nav button[data-screen="s-set"]');
    await p.waitForSelector('#pkBox .pk-row');
    assert.match(await p.textContent('#pkBox'), /آيفون/);
    assert.equal(await p.$('#pkBox [data-pkadd]'), null, 'this device already enrolled');
    await p.locator('#pkBox').scrollIntoViewIfNeeded();
    await shot(p, 'settings-pk-m');
    p.once('dialog', (d) => d.accept());
    await p.click('#pkBox [data-pkdel]');
    await p.waitForFunction(() => !document.querySelector('#pkBox .pk-row'));
    assert.ok(api.calls.some((c) => c.action === 'pk_delete' && c.id === 'k1'));
    assert.equal(await p.evaluate(() => localStorage.getItem('maqsad_pk')), null);
    p.once('dialog', (d) => d.accept());
    await p.click('#pkBox [data-pkall]');
    await p.waitForSelector('#auth:not([hidden])');
    assert.ok(api.calls.some((c) => c.action === 'logout' && c.all === true));
    assert.deepEqual(errors, []); await ctx.close();
  });

  await test('الوضع الداكن: شاشة الانتظار مقروءة', async () => {
    const { p, errors, ctx } = await page(b, {}, { w: 390, h: 844, dark: true });
    await p.fill('#ph', '0500000001');
    await p.click('#btnWa');
    await p.waitForSelector('#authWait:not([hidden])');
    await shot(p, 'login-wait-dark');
    assert.deepEqual(errors, []); await ctx.close();
  });

  await b.close();
  for (const r of results) console.log(r.join('  '));
  const failed = results.filter((r) => r[0] === '✗').length;
  console.log(`\n${results.length - failed}/${results.length} passed · لقطات: ${OUT}`);
  process.exit(failed ? 1 : 0);
})();
