// اختبار الواجهة v3: تفعيل/إيقاف المكتب والموظفين · قالب رموز الدخول · رسالة طلب الرمز · الفرص الضائعة بلا تنبيهات
const { chromium } = require('playwright');
const path = require('path');
const OFFICE = { id:'o1', name:'مكتب الأفق العقاري', code:'OFFICE_01', license_no:'1200012345', msg_quota:15, debounce_seconds:7, wa_number:'966501112345', wa_provider:'cloud' };
const STATUS = { can_edit:true, is_super:true, office_name:OFFICE.name, whatsapp:true, wa_number:'966501112345', wa_provider:'cloud', msg_quota:15,
  my_phone:'966501116789', my_role:'super_admin', openai:true, telegram:true, meta:true, otp_platform:false, otp_template:'', platform_phone_id:'',
  meta_webhook:'https://dindcejhsaxqwdkxtkcy.supabase.co/functions/v1/wa-webhook?forceFunctionRegion=eu-central-1', wa_instance:'111', telegram_chat_id:'-100', errors:[] };
const OFFICES = [{ id:'o1', code:'OFFICE_01', name:OFFICE.name, license_no:'1200012345', wa_number:'966501112345', wa_provider:'cloud', wa_instance:'111', active:true, msg_quota:15, wa_linked:true, leads:0, props:0 }];
const DAY = 864e5, iso = (d) => new Date(Date.now() - d * DAY).toISOString();
const STAFF = [{ id:'s1', name:'صاحب', phone:'966500000001', role:'owner', active:true, last_login_at:iso(1), created_at:iso(9) },
  { id:'s2', name:'وسيط', phone:'966500000002', role:'agent', active:true, last_login_at:iso(0.1), created_at:iso(9) },
  { id:'s4', name:'رقم غلط', phone:'966501112345', role:'agent', active:true, last_login_at:null, created_at:iso(5) },
  { id:'sa', name:'المشغّل', phone:'966500000009', role:'super_admin', active:true, last_login_at:iso(0), created_at:iso(20) }];
const calls = [];
function reply(action, body, role) {
  calls.push(body);
  const isSuper = role === 'super_admin';
  switch (action) {
    case 'bootstrap': return { staff:{ name:'تركي', role, phone:'966501116789' }, is_super:isSuper, office:OFFICE, leads:[], properties:[],
      status: isSuper ? STATUS : { ...STATUS, is_super:false, my_role:role }, offices: isSuper ? OFFICES : null, signups_new: isSuper ? 0 : null };
    case 'analytics': return { summary:{}, gap:[{ district:'النرجس', demand:9, supply:1 }] };
    case 'signup_list': return { requests:[] };
    case 'backups_status': return { runs:[] };
    case 'staff_list': return { staff:STAFF };
    case 'office_save': return { ok:true, office:{ id:'o1' }, offices:OFFICES };
    case 'staff_save': return { ok:true, staff:{ id:body.staff.id } };
    case 'settings_status': return STATUS;
    case 'request_otp': return { ok:true, delivered:true };
    default: return { ok:true };
  }
}
(async () => {
  const b = await chromium.launch({ args:['--no-sandbox'] });
  const R = {}; const errs = [];
  async function open(role, token = true) {
    const ctx = await b.newContext({ viewport:{ width:400, height:860 } });
    if (token) await ctx.addInitScript(() => { try { localStorage.setItem('maqsad_token','T'); } catch(e){} });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(role + ' PAGEERROR: ' + e.message));
    p.on('dialog', d => d.accept());
    await p.route('**/functions/v1/api*', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      R.apiUrl = route.request().url();
      await route.fulfill({ status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(reply(body.action, body, role)) });
    });
    await p.goto('file://' + path.join(__dirname, '..', 'dist', 'app.html'));
    return { ctx, p };
  }
  { // المشغّل
    const { ctx, p } = await open('super_admin');
    await p.waitForSelector('#app:not([hidden])'); await p.waitForTimeout(600);
    R.apiPinned = /forceFunctionRegion=eu-central-1$/.test(R.apiUrl);
    R.otpDot = (await p.textContent('#sysStatus')).includes('رموز الدخول');
    await p.click('.nav button[data-screen="s-offices"]'); await p.waitForTimeout(300);
    await p.click('#officesList .row .btn:has-text("تعديل")');
    await p.waitForSelector('#sheet.on'); await p.waitForTimeout(500);
    R.activeChecked = await p.$eval('#oActive', n => n.checked);
    R.staffButtons = await p.$$eval('#staffList [data-act], #staffList [data-del]', n => n.map(x => x.textContent));
    R.neverTag = await p.$eval('#staffList', n => /ما دخل من 5 أيام/.test(n.textContent) && /تأكد من رقمه/.test(n.textContent));
    R.phonesFormatted = await p.$eval('#staffList', n => n.textContent.includes('050 111 2345'));
    R.officeNumHint = await p.$eval('#oNumHint', n => n.textContent.includes('050 111 2345') && !!n.querySelector('a[href="https://wa.me/966501112345"]'));
    calls.length = 0;
    await p.click('#staffList [data-act="s2"]'); await p.waitForTimeout(500);
    const ss = calls.find(c => c.action === 'staff_save');
    R.suspendSent = ss && ss.staff.active === false && ss.staff.phone === '966500000002' && ss.staff.role === 'agent';
    // رقم ناقص: يتوقف قبل أي طلب
    calls.length = 0;
    await p.fill('#stName', 'سالم'); await p.fill('#stPhone', '05011123');
    R.liveWarn = await p.$eval('#stPhoneHint', n => n.classList.contains('warn'));
    await p.click('#stNext'); await p.waitForTimeout(200);
    R.shortBlocked = !calls.some(c => c.action === 'staff_save') && /05/.test(await p.textContent('#stMsg'));
    // رقم موظف موجود في نفس المكتب
    await p.fill('#stPhone', '0500000001'); await p.click('#stNext'); await p.waitForTimeout(200);
    R.dupBlocked = (await p.textContent('#stMsg')).includes('«صاحب»') && !calls.some(c => c.action === 'staff_save');
    // رقم صحيح: شاشة مراجعة، زر واتساب، والتأكيد مقفل لين يأشّر
    await p.fill('#stPhone', '٠٥٠١١١٤٥٦٧'); await p.click('#stNext'); await p.waitForTimeout(200);
    R.reviewNum = await p.textContent('.review-num');
    R.waHref = await p.$eval('.review a.btn', n => n.getAttribute('href') + '|' + n.target);
    R.confirmLocked = await p.$eval('#stConfirm', n => n.disabled);
    R.noSaveBeforeConfirm = !calls.some(c => c.action === 'staff_save');
    await p.click('#stBack'); await p.waitForTimeout(150);
    R.backKeepsDraft = (await p.$eval('#stName', n => n.value)) === 'سالم' && (await p.$eval('#stPhone', n => n.value)) === '050 111 4567';
    await p.click('#stNext'); await p.waitForTimeout(150);
    await p.check('#stSure'); await p.click('#stConfirm'); await p.waitForTimeout(400);
    const add = calls.find(c => c.action === 'staff_save');
    R.addSent = add && add.staff.phone === '966501114567' && add.staff.name === 'سالم' && add.staff.role === 'agent' && !add.staff.id;
    R.addedMsg = (await p.textContent('#stMsg')).includes('أُضيف');
    // تعديل الاسم فقط: يحفظ مباشرة بلا مراجعة
    calls.length = 0;
    await p.click('#staffList [data-edit="s2"]'); await p.waitForTimeout(150);
    R.editTitle = await p.textContent('#staffForm h4');
    await p.fill('#stName', 'وسيط معدّل'); await p.click('#stNext'); await p.waitForTimeout(400);
    const ed = calls.find(c => c.action === 'staff_save');
    R.editNameDirect = ed && ed.staff.id === 's2' && ed.staff.name === 'وسيط معدّل' && ed.staff.phone === '966500000002';
    // تعديل الرقم: يمر بالمراجعة ويعرض الرقم الحالي
    calls.length = 0;
    await p.click('#staffList [data-edit="s1"]'); await p.waitForTimeout(150);
    await p.fill('#stPhone', '0551112222'); await p.click('#stNext'); await p.waitForTimeout(150);
    R.editReview = (await p.textContent('.review')).includes('050 000 0001') && !calls.some(c => c.action === 'staff_save');
    await p.check('#stSure'); await p.click('#stConfirm'); await p.waitForTimeout(400);
    const ep = calls.find(c => c.action === 'staff_save');
    R.editPhoneSent = ep && ep.staff.id === 's1' && ep.staff.phone === '966551112222';
    // حذف من لم يدخل أبداً
    calls.length = 0;
    await p.click('#staffList [data-del="s4"]'); await p.waitForTimeout(400);
    const dl = calls.find(c => c.action === 'staff_delete');
    R.deleteSent = dl && dl.id === 's4';
    // رقم مكتب غلط ما ينرسل
    calls.length = 0;
    await p.fill('#oNum', '0540'); await p.click('#oSave'); await p.waitForTimeout(200);
    R.officeBadBlocked = !calls.some(c => c.action === 'office_save') && (await p.textContent('#oMsg')).includes('رقم واتساب المكتب');
    await p.fill('#oNum', '050 111 2345');
    await p.waitForSelector('#oActive'); await p.uncheck('#oActive');
    calls.length = 0;
    await p.click('#oSave'); await p.waitForTimeout(500);
    const os = calls.find(c => c.action === 'office_save');
    R.officeInactiveSent = os && os.office.active === false && os.office.wa_number === '966501112345';
    await p.click('.nav button[data-screen="s-set"]'); await p.waitForTimeout(300);
    R.hook = await p.$eval('#kHook', n => n.value);
    await p.fill('#kPlatId', '123456789'); await p.fill('#kPlatTok', 'EAAX'); await p.fill('#kOtpTpl', 'maqsad_login');
    calls.length = 0;
    await p.click('#btnSaveKeys'); await p.waitForTimeout(400);
    const sv = calls.find(c => c.action === 'save_settings');
    R.otpSaved = sv && sv.settings.platform_wa_phone_id === '123456789' && sv.settings.platform_wa_token === 'EAAX' && sv.settings.otp_template === 'maqsad_login';
    R.hScroll = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await ctx.close();
  }
  { // صاحب مكتب بلا تنبيهات: الفرص الضائعة تظهر
    const { ctx, p } = await open('owner');
    await p.waitForSelector('#app:not([hidden])'); await p.waitForTimeout(800);
    R.gapWithoutAlerts = await p.$eval('#gapBlock', n => !n.hidden);
    await ctx.close();
  }
  { // شاشة الدخول
    const { ctx, p } = await open('agent', false);
    await p.waitForSelector('#auth:not([hidden]), #authPhone'); await p.waitForTimeout(300);
    R.placeholder = await p.$eval('#ph', n => n.placeholder);
    await p.fill('#ph', '0500000002'); await p.click('#btnSend'); await p.waitForTimeout(400);
    R.otpMsg = await p.textContent('#authMsg');
    await ctx.close();
  }
  console.log(JSON.stringify({ R, errs }, null, 1));
  await b.close();
})();
