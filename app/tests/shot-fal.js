// اختبار الواجهة v5: رخصة فال — حالات المكاتب، لوحة التحقق للمشغّل، والتنبيه لصاحب المكتب
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');

const DAY = 864e5;
const riyadh = (d) => new Date(Date.now() + 3 * 3600e3 + d * DAY).toISOString().slice(0, 10);
const fal = (state, days) => ({ state, expires_on: days == null ? null : riyadh(days), days_left: days == null ? null : days,
  holder_name: state === 'pending' ? null : 'مؤسسة الأفق للعقار', verified_at: null, note: state === 'rejected' ? 'الاسم ما يطابق السجل التجاري' : null, has_proof: state !== 'pending' });
const OFFICE = (f) => ({ id:'o1', name:'مكتب الأفق العقاري', code:'OFFICE_01', license_no:'1200012345', msg_quota:15, debounce_seconds:7,
  wa_number:'966501112345', wa_provider:'cloud', fal: f });
const STATUS = { can_edit:true, is_super:true, whatsapp:true, wa_number:'966501112345', wa_provider:'cloud', msg_quota:15,
  my_phone:'966501116789', my_role:'super_admin', openai:true, telegram:true, meta:true, otp_platform:true, otp_template:'maqsad_login',
  platform_phone_id:'1', meta_webhook:'https://x/wa-webhook', wa_instance:'111', telegram_chat_id:'-100', errors:[] };
const OFFICES = () => [
  { id:'o1', code:'OFFICE_01', name:'مكتب الأفق العقاري', license_no:'1200012345', wa_number:'966501112345', wa_provider:'cloud', wa_instance:'111', active:true, msg_quota:15, wa_linked:true, leads:5, props:3, fal: fal('pending') },
  { id:'o2', code:'OFFICE_02', name:'مكتب الواحة', license_no:'1200099999', wa_provider:'cloud', active:true, msg_quota:15, wa_linked:false, leads:1, props:0, fal: fal('ok', 12) },
  { id:'o3', code:'OFFICE_03', name:'مكتب النخبة', license_no:'1100044444', wa_provider:'cloud', active:true, msg_quota:15, wa_linked:true, leads:0, props:2, fal: fal('expired', -4) },
  { id:'o4', code:'OFFICE_04', name:'مكتب الريادة', license_no:'1100055555', wa_provider:'cloud', active:true, msg_quota:15, wa_linked:true, leads:9, props:4, fal: fal('ok', 200) },
];
const PROPS = [
  { id:'P1', title:'شقة النرجس', district:'النرجس', rooms:3, price:55000, state:'available', listable:false, block_reason:'بانتظار التحقق من رخصة فال', ad_license_no:'7200000001', ad_license_expiry: riyadh(60) },
  { id:'P2', title:'دور العارض', district:'العارض', rooms:4, price:70000, state:'available', listable:false, block_reason:'ترخيص الإعلان منتهٍ' },
];

function makeReply(role, officeFal) {
  const calls = [];
  let offices = OFFICES();
  let hist = [];
  const reply = (action, body) => {
    calls.push(body);
    const isSuper = role === 'super_admin';
    switch (action) {
      case 'bootstrap': return { staff:{ name: isSuper ? 'تركي' : 'أبو فيصل', role, phone:'966501116789' }, is_super:isSuper, office:OFFICE(officeFal),
        leads:[], properties:PROPS, status: isSuper ? STATUS : { ...STATUS, is_super:false, my_role:role }, offices: isSuper ? offices : null, signups_new: 0 };
      case 'analytics': return { summary:{}, gap:[] };
      case 'month_stats': return { month:'2026-09', stats:{ new_customers:0 } };
      case 'signup_list': return { requests:[] };
      case 'backups_status': return { runs:[] };
      case 'platform_usage': return { month:'2026-09', rows:[], totals:{}, prices:{} };
      case 'staff_list': return { staff:[] };
      case 'fal_get': {
        const o = offices.find((x) => x.id === body.office_id);
        return { license_no:o.license_no, fal:o.fal, history: hist };
      }
      case 'fal_verify': {
        const o = offices.find((x) => x.id === body.office_id);
        o.fal = { state:'ok', expires_on: body.expires_on, days_left: 180, holder_name: body.holder_name, verified_at: new Date().toISOString(), note:null, has_proof:true };
        hist = [{ id: 7, result:'verified', license_no:o.license_no, holder_name: body.holder_name, expires_on: body.expires_on, note:null,
          checked_at: new Date().toISOString(), by:'تركي', has_proof:true },
          { id: 3, result:'rejected', license_no:'1200000000', note:'رقم الرخصة غلط', checked_at: new Date(Date.now() - 20 * DAY).toISOString(), by:'تركي', has_proof:false }];
        return { ok:true, fal:o.fal, offices };
      }
      case 'fal_proof': return { url:'about:blank#proof-' + (body.check_id || 'current') };
      default: return { ok:true };
    }
  };
  return { reply, calls };
}

const KUFI = fs.readFileSync('/home/claude/maqsad-site/tools/readex-pro-arabic.woff2');
const NASKH = fs.readFileSync('/usr/share/fonts/truetype/freefont/FreeSerif.ttf');
const FONT_CSS = "@font-face{font-family:'IBM Plex Sans Arabic';font-weight:400 700;src:url(https://fonts.gstatic.com/k.woff2) format('woff2')}";

async function page(b, { role, officeFal, dark = false, width = 400 }) {
  const ctx = await b.newContext({ viewport:{ width, height: 900 }, colorScheme: dark ? 'dark' : 'light' });
  await ctx.addInitScript(() => { try { localStorage.setItem('maqsad_token','T'); } catch(e){} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const api = makeReply(role, officeFal);
  await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: FONT_CSS }));
  await p.route('**/fonts.gstatic.com/**', r => /k\.woff2/.test(r.request().url()) ? r.fulfill({ status: 200, contentType: 'font/woff2', body: KUFI }) : r.fulfill({ status: 200, contentType: 'font/ttf', body: NASKH }));
  await p.route('**/functions/v1/api*', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(api.reply(body.action, body)) });
  });
  await p.goto('file://' + path.join(__dirname, 'dist', 'app.html'));
  await p.waitForSelector('#app:not([hidden])'); await p.waitForTimeout(500);
  return { p, ctx, errors, calls: api.calls };
}

(async () => {
  const OUT = process.argv[2];
  const b = await chromium.launch({ args:['--no-sandbox'] });
  const results = [];
  const check = async (name, fn) => { try { await fn(); results.push('✓ ' + name); } catch (e) { results.push('✗ ' + name + ' — ' + e.message); } };

  for (const dark of [false, true]) {
    const sfx = dark ? '-dark' : '';
    const { p, ctx, errors, calls } = await page(b, { role:'super_admin', officeFal: fal('pending'), dark });
    await check('المشغّل: «يحتاج انتباهك» فيها المكاتب اللي تحتاج تحقق' + sfx, async () => {
      const t = await p.textContent('#attnList');
      assert.match(t, /3 مكاتب تحتاج تحقق من رخصة فال/);
      assert.match(t, /مكتب الأفق العقاري، مكتب الواحة، مكتب النخبة/);
      assert.ok(!/مكتب الريادة/.test(t));
    });
    await p.screenshot({ path: OUT + '/fal-today-super' + sfx + '.png' });
    await p.click('.nav button[data-screen="s-offices"]'); await p.waitForTimeout(300);
    await check('قائمة المكاتب: شارة فال لكل مكتب' + sfx, async () => {
      const t = await p.textContent('#officesList');
      for (const w of ['فال بانتظار التحقق', 'فال تنتهي بعد 12 يوماً', 'فال منتهية', 'فال سارية']) assert.ok(t.includes(w), w);
    });
    await p.$eval('#officesList', n => n.scrollIntoView());
    await p.screenshot({ path: OUT + '/fal-offices' + sfx + '.png' });

    await p.click('#officesList .row:first-child .btn:has-text("تعديل")');
    await p.waitForSelector('#sheet.on'); await p.waitForSelector('.fal-steps');
    await p.$eval('#falBlock', n => n.scrollIntoView());
    await p.waitForTimeout(200);
    await p.screenshot({ path: OUT + '/fal-form-empty' + sfx + '.png' });
    await check('لوحة التحقق: الزر مقفول لين تكتمل الشروط' + sfx, async () => {
      assert.equal(await p.isDisabled('#falOk'), true);
      assert.equal(await p.getAttribute('a[href*="eservicesredp.rega.gov.sa"]', 'target'), '_blank');
      assert.equal((await p.textContent('#falLicNo')).trim(), '1200012345');
      await p.fill('#falName', 'مؤسسة الأفق للعقار');
      await p.fill('#falExp', riyadh(-2));
      assert.match(await p.textContent('#falExpHint'), /فات/);
      await p.fill('#falExp', riyadh(180));
      assert.match(await p.textContent('#falExpHint'), /يوافق .*هـ/);
      await p.setInputFiles('#falImg', { name:'rega.png', mimeType:'image/png', buffer: fs.readFileSync(path.join(__dirname, 'shot-auth.png')) });
      await p.waitForSelector('#falPrev img');
      await p.check('#falC1'); await p.check('#falC2');
      assert.equal(await p.isDisabled('#falOk'), true, 'enabled with 2 checks');
      await p.check('#falC3');
      assert.equal(await p.isDisabled('#falOk'), false, 'still disabled with everything filled');
    });
    await p.$eval('.fal-steps li:nth-child(2)', n => n.scrollIntoView({ block:'start' }));
    await p.waitForTimeout(200);
    await p.screenshot({ path: OUT + '/fal-form-filled' + sfx + '.png' });
    await check('«تم التحقق» يرسل الاسم والتاريخ والصورة المصغّرة والثلاثة' + sfx, async () => {
      await p.click('#falOk');
      await p.waitForSelector('#falMsg .msg.ok');
      const v = calls.find((c) => c.action === 'fal_verify');
      assert.ok(v, 'no verify call');
      assert.equal(v.office_id, 'o1'); assert.equal(v.license_no, '1200012345'); assert.equal(v.expires_on, riyadh(180));
      assert.deepEqual(v.checks, { active:true, name:true, expiry:true });
      assert.match(v.image, /^data:image\/jpeg;base64,/);
      assert.ok(v.image.length < 2.7e6);
      const now = await p.textContent('.fal-now');
      assert.match(now, /فال سارية/); assert.match(now, /متحقق منها/);
      assert.ok(!(await p.$('.fal-steps')), 'form still shown after verify');
      const hist = await p.textContent('#falBody');
      assert.match(hist, /سجل التحقق/); assert.match(hist, /رقم سابق/);
      const row = await p.textContent('#officesList .row:first-child');
      assert.match(row, /فال سارية/);
    });
    await p.$eval('.fal-now', n => n.scrollIntoView({ block:'start' }));
    await p.waitForTimeout(200);
    await p.screenshot({ path: OUT + '/fal-verified' + sfx + '.png' });
    await check('لا أخطاء في الصفحة' + sfx, async () => assert.deepEqual(errors, []));
    await ctx.close();
  }

  // صاحب المكتب: المساعد متوقف بانتظار التحقق
  {
    const { p, ctx, errors } = await page(b, { role:'owner', officeFal: fal('pending') });
    await check('صاحب المكتب (بانتظار التحقق): أول بطاقة «المساعد الآلي متوقف»', async () => {
      const first = await p.textContent('#attnList .attn:first-child');
      assert.match(first, /المساعد الآلي متوقف/); assert.match(first, /أرسل صورة شهادة فال لمقصد/);
      const t = await p.textContent('#attnList');
      assert.match(t, /1 عقار محجوب عن العرض/, 'property-level block should still show');
    });
    await p.screenshot({ path: OUT + '/fal-today-owner-pending.png' });
    await p.click('.nav button[data-screen="s-set"]'); await p.waitForTimeout(300);
    await check('الإعدادات: حالة الرخصة وشرح المطلوب', async () => {
      assert.match(await p.textContent('#sysStatus'), /رخصة فال.*بانتظار التحقق/);
      assert.match(await p.textContent('#officeInfo'), /فال بانتظار التحقق/);
      assert.equal(await p.isVisible('#falNote'), true);
      assert.match(await p.textContent('#falNote'), /تجرّبون المساعد/);
    });
    await p.$eval('#officeInfo', n => n.scrollIntoView({ block:'start' }));
    await p.screenshot({ path: OUT + '/fal-settings-owner-pending.png' });
    await check('لا أخطاء (صاحب المكتب)', async () => assert.deepEqual(errors, []));
    await ctx.close();
  }

  // وسيط: الرخصة منتهية، ثم رخصة سارية تنتهي قريب
  for (const [f, name, re] of [[fal('expired', -4), 'expired', /رخصة فال منتهية/], [fal('ok', 9), 'soon', /رخصة فال تنتهي بعد 9 أيام/], [fal('rejected'), 'rejected', /غير معتمدة/]]) {
    const { p, ctx, errors } = await page(b, { role:'agent', officeFal: f });
    await check('الوسيط (' + name + '): البطاقة الصحيحة أولاً', async () => {
      assert.match(await p.textContent('#attnList .attn:first-child'), re);
    });
    await p.click('.nav button[data-screen="s-set"]'); await p.waitForTimeout(250);
    await check('الوسيط (' + name + '): الإعدادات تشرح', async () => {
      const t = await p.textContent('#officeInfo');
      if (name !== 'rejected') assert.match(t, /هـ/, 'hijri date missing');
      assert.equal(await p.isVisible('#falNote'), true);
    });
    if (name === 'expired') { await p.$eval('#officeInfo', n => n.scrollIntoView({ block:'start' })); await p.screenshot({ path: OUT + '/fal-settings-expired.png' }); }
    await check('لا أخطاء (' + name + ')', async () => assert.deepEqual(errors, []));
    await ctx.close();
  }

  // عرض سطح المكتب: لوحة التحقق في اللوح الجانبي
  {
    const { p, ctx } = await page(b, { role:'super_admin', officeFal: fal('pending'), width: 1280 });
    await p.click('.nav button[data-screen="s-offices"]'); await p.waitForTimeout(300);
    await p.click('#officesList .row:nth-child(3) .btn:has-text("تعديل")');
    await p.waitForSelector('#sheet.on'); await p.waitForSelector('.fal-now');
    await p.$eval('#falBlock', n => n.scrollIntoView());
    await p.waitForTimeout(250);
    await check('سطح المكتب: مكتب منتهي يعرض النموذج مع شرح الانتهاء', async () => {
      assert.match(await p.textContent('.fal-now'), /انتهت/);
      assert.ok(await p.$('.fal-steps'));
    });
    await p.screenshot({ path: OUT + '/fal-desktop-expired.png' });
    await ctx.close();
  }

  await b.close();
  console.log(results.join('\n'));
  const failed = results.filter((r) => r.startsWith('✗')).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
