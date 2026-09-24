// اختبار الواجهة v2: طلبات الانضمام · تصدير البيانات · طلب الحذف · مزوّد واتساب · الفرص الضائعة
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OFFICE = { id:'o1', name:'مكتب الأفق العقاري', code:'OFFICE_01', license_no:'1200012345',
  msg_quota:15, debounce_seconds:7, wa_number:'966501112345', wa_provider:'ultramsg' };
const iso = (ms) => new Date(Date.now() - ms).toISOString();
const LEADS = [
  { id:'c1', name:'فهد بن سالم', phone:'966501116789', deal_type:'إيجار', property_type:'شقة',
    budget:45000, budget_period:'سنوي', location:'النرجس', rooms:3, status:'qualified', mode:'manual',
    summary:'يبحث عن شقة إيجار في النرجس.', msg_count:4, last_message_at:iso(35*60000), opted_out:false },
  { id:'c2', name:'=HYPERLINK("x")', phone:'966511111111', deal_type:'شراء', property_type:'فيلا',
    budget:1850000, location:'حطين', rooms:5, status:'qualified', mode:'manual',
    summary:'فيلا, حطين "عاجل"', msg_count:7, last_message_at:iso(3*3600000), opted_out:true },
  { id:'c3', name:'أحمد', phone:'966522222222', status:'inquiry', mode:'auto', summary:'استفسار عام.',
    msg_count:1, last_message_at:iso(0), opted_out:false },
];
const soon = new Date(Date.now()+4*86400000).toISOString().slice(0,10);
const PROPS = [
  { id:'p1', title:'شقة النرجس A12', deal_type:'إيجار', property_type:'شقة', city:'الرياض', district:'النرجس',
    price:42000, rooms:3, state:'available', ad_license_no:'7200034512', ad_license_expiry:soon,
    listable:true, block_reason:null, created_at:iso(86400000) },
];
const STATUS = { can_edit:true, is_super:true, office_name:OFFICE.name, whatsapp:true, wa_number:'966501112345',
  wa_provider:'ultramsg', msg_quota:15, my_phone:'966501116789', my_role:'super_admin', openai:true,
  telegram:true, meta:false, meta_webhook:'https://dindcejhsaxqwdkxtkcy.supabase.co/functions/v1/wa-webhook',
  wa_instance:'instance190700', telegram_chat_id:'-100', errors:[] };
const OFFICES = [
  { id:'o1', code:'OFFICE_01', name:OFFICE.name, license_no:'1200012345', wa_number:'966501112345',
    wa_provider:'ultramsg', wa_instance:'instance190700', active:true, msg_quota:15, wa_linked:true, leads:3, props:1 },
];
let SIGNUPS;
const calls = [];

function reply(action, body, role) {
  calls.push(body);
  const isSuper = role === 'super_admin';
  switch (action) {
    case 'bootstrap': return { staff:{ name: isSuper ? 'تركي' : 'سعد', role, phone:'966501116789' },
      is_super:isSuper, office:OFFICE, leads:LEADS, properties:PROPS,
      status: isSuper ? STATUS : { ...STATUS, is_super:false, my_role:role },
      offices: isSuper ? OFFICES : null, signups_new: isSuper ? SIGNUPS.filter(x=>x.status==='new').length : null };
    case 'analytics': return { summary:{}, gap:[
      { district:'النرجس', demand:17, supply:1 }, { district:'العارض', demand:6, supply:0 },
      { district:'حطين', demand:2, supply:5 } ] };
    case 'signup_list': return { requests:SIGNUPS };
    case 'signup_update': { const x = SIGNUPS.find(s=>s.id===body.id); x.status = body.status; return { ok:true, request:x }; }
    case 'backups_status': return { runs:[] };
    case 'staff_list': return { staff:[] };
    case 'office_save': return { ok:true, office:{ id:'o9', name:body.office.name, code:body.office.code }, offices:OFFICES };
    case 'staff_save': return { ok:true, staff:{ id:'s9' } };
    case 'lead': return { lead:LEADS.find(l=>l.id===body.id), messages:[] };
    case 'export': return { exported_at:new Date().toISOString(), office:{ name:OFFICE.name, code:OFFICE.code },
      customers:LEADS.map(l=>({ ...l, created_at:iso(86400000) })), properties:PROPS, staff:[], messages:[{ customer_id:'c1', direction:'in', body:'هلا', created_at:iso(0) }] };
    case 'delete_account_request': return { ok:true };
    case 'settings_status': return STATUS;
    default: return { ok:true };
  }
}

(async () => {
  const b = await chromium.launch({ args:['--no-sandbox'] });
  const errs = []; const R = {};

  async function open(vp, role) {
    SIGNUPS = [
      { id:7, office_name:'مكتب ركن الشمال', contact_name:'فهد القحطاني', phone:'966555000111', city:'الرياض',
        fal_license:'1100012345', agents:'2-5', note:'نبي نجرب قبل رمضان', status:'new', created_at:iso(20*60000) },
      { id:6, office_name:'مكتب الديرة', contact_name:'ناصر', phone:'966555000222', city:'جدة',
        fal_license:null, agents:'1', note:null, status:'contacted', created_at:iso(2*86400000) },
    ];
    const ctx = await b.newContext({ viewport:{ width:vp.w, height:vp.h }, acceptDownloads:true });
    await ctx.addInitScript(() => { try { localStorage.setItem('maqsad_token','TESTTOKEN'); } catch(e){} });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(vp.tag + '/' + role + ' PAGEERROR: ' + e.message));
    p.on('console', m => { if (m.type()==='error') errs.push(vp.tag + '/' + role + ' CONSOLE: ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.route('**/functions/v1/api*', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'},
        body: JSON.stringify(reply(body.action, body, role)) });
    });
    await p.goto('file://' + path.join(__dirname, 'dist', 'app.html'));
    await p.waitForSelector('#app:not([hidden])', { timeout:10000 });
    await p.waitForTimeout(600);
    return { ctx, p };
  }

  for (const vp of [{ w:400, h:840, tag:'mobile' }, { w:1280, h:900, tag:'desktop' }]) {
    const { ctx, p } = await open(vp, 'super_admin');
    const r = {};
    // اليوم: الفرص الضائعة تعرض الأحياء التي الطلب فيها أكبر من المعروض فقط
    r.gapShown = await p.$eval('#gapBlock', n => !n.hidden);
    r.gapRows = await p.$$eval('#gapList .row', n => n.map(x => x.querySelector('.t').textContent));
    r.signupAttn = await p.$$eval('#attnList .attn b', n => n.some(x => x.textContent.includes('طلب انضمام')));
    r.officesDot = await p.$eval('#navOfficesDot', n => !n.hidden);

    // العملاء: من أوقف الرسائل
    await p.click('.nav button[data-screen="s-leads"]');
    r.optedTag = await p.$$eval('#leadsWrap .row', n => n.some(x => x.textContent.includes('أوقف الرسائل')));
    await p.click('#leadsWrap .row:nth-child(2)');
    await p.waitForSelector('#sheet.on'); await p.waitForTimeout(300);
    r.toggleDisabled = await p.$eval('#toggleMode', n => n.disabled);
    await p.click('#sheetClose'); await p.waitForTimeout(300);

    // المكاتب: طلبات الانضمام
    await p.click('.nav button[data-screen="s-offices"]');
    r.signupCards = await p.$$eval('#signupList .req', n => n.length);
    r.signupHasFal = (await p.textContent('#signupList')).includes('1100012345');
    await p.click('#signupChips .chip[data-f="contacted"]');
    r.contactedCards = await p.$$eval('#signupList .req', n => n.length);
    await p.click('#signupChips .chip[data-f="new"]');
    // أنشئ المكتب من الطلب
    await p.click('#signupList .req .btn:has-text("أنشئ المكتب")');
    await p.waitForSelector('#sheet.on'); await p.waitForTimeout(300);
    r.prefillName = await p.$eval('#oName', n => n.value);
    r.prefillLic = await p.$eval('#oLic', n => n.value);
    r.providerDefault = await p.$eval('#oProv', n => n.value);
    r.instLabelCloud = await p.textContent('#oInstLbl');
    await p.selectOption('#oProv', 'ultramsg');
    r.instLabelUltra = await p.textContent('#oInstLbl');
    await p.selectOption('#oProv', 'cloud');
    await p.fill('#oCode', 'OFFICE_09');
    calls.length = 0;
    await p.click('#oSave'); await p.waitForTimeout(600);
    const saved = calls.find(c => c.action === 'office_save');
    const staff = calls.find(c => c.action === 'staff_save');
    r.saveSentProvider = saved && saved.office.wa_provider;
    r.saveSentFromSignup = saved && saved.office.from_signup;
    r.ownerAdded = !!(staff && staff.staff.role === 'owner' && staff.staff.phone === '966555000111' && staff.staff.office_id === 'o9');
    // تم التواصل / استبعاد
    await p.click('#signupChips .chip[data-f="contacted"]');
    const before = await p.$$eval('#signupList .req', n => n.length);
    await p.click('#signupList .req .btn:has-text("استبعاد")'); await p.waitForTimeout(400);
    r.rejectMoved = (await p.$$eval('#signupList .req', n => n.length)) === before - 1;

    // الإعدادات: ميتا + بيانات المكتب
    await p.click('.nav button[data-screen="s-set"]');
    r.metaRow = (await p.textContent('#sysStatus')).includes('واتساب الرسمي');
    r.hookUrl = await p.$eval('#kHook', n => n.value);
    r.dataBlock = await p.$eval('#dataBlock', n => !n.hidden);
    calls.length = 0;
    await p.fill('#kMetaSecret', 'appsecret123'); await p.fill('#kMetaVerify', 'maqsad-verify');
    await p.click('#btnSaveKeys'); await p.waitForTimeout(400);
    const ss = calls.find(c => c.action === 'save_settings');
    r.metaSaved = !!(ss && ss.settings.meta_app_secret === 'appsecret123' && ss.settings.meta_verify_token === 'maqsad-verify');

    // تصدير العملاء إلى Excel
    const [dl] = await Promise.all([ p.waitForEvent('download'), p.click('#btnExpCustomers') ]);
    const fp = await dl.path(); const csv = fs.readFileSync(fp, 'utf8');
    r.csvName = dl.suggestedFilename();
    r.csvBom = csv.charCodeAt(0) === 0xFEFF;
    r.csvHeader = csv.slice(1).split('\r\n')[0];
    r.csvFormulaSafe = csv.includes(`"'=HYPERLINK(""x"")"`);
    r.csvQuoted = csv.includes('"فيلا, حطين ""عاجل"""');
    r.csvRows = csv.trim().split('\r\n').length - 1;
    const [dl2] = await Promise.all([ p.waitForEvent('download'), p.click('#btnExpJson') ]);
    r.jsonOk = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8')).messages.length === 1;

    // طلب حذف الحساب
    await p.click('#btnDeleteAcct');
    await p.waitForSelector('#sheet.on'); await p.waitForTimeout(300);
    await p.fill('#delReason', 'ننقل لنظام آخر');
    await p.click('#delConfirm'); await p.waitForTimeout(400);
    r.deleteDone = (await p.textContent('#sheetBody')).includes('وصل طلبك');
    await p.click('#sheetClose'); await p.waitForTimeout(250);

    r.hScroll = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await p.click('.nav button[data-screen="s-offices"]'); await p.waitForTimeout(250);
    await p.screenshot({ path:`shot2-offices-${vp.tag}.png`, fullPage:true });
    await p.click('.nav button[data-screen="s-set"]'); await p.waitForTimeout(250);
    await p.screenshot({ path:`shot2-settings-${vp.tag}.png`, fullPage:true });
    R[vp.tag] = r;
    await ctx.close();
  }

  // الوسيط: لا يرى بيانات المكتب ولا المكاتب
  { const { ctx, p } = await open({ w:400, h:840, tag:'agent' }, 'agent');
    await p.click('.nav button[data-screen="s-set"]');
    R.agent = { dataBlock: await p.$eval('#dataBlock', n => !n.hidden), officesTab: await p.$eval('#navOffices', n => !n.hidden),
      keys: await p.$eval('#keysBlock', n => !n.hidden) };
    await ctx.close(); }
  // صاحب المكتب: يرى بيانات مكتبه فقط
  { const { ctx, p } = await open({ w:400, h:840, tag:'owner' }, 'owner');
    R.owner = { dataBlock: await p.$eval('#dataBlock', n => !n.hidden), officesTab: await p.$eval('#navOffices', n => !n.hidden) };
    await ctx.close(); }

  console.log(JSON.stringify({ R, errs }, null, 1));
  await b.close();
})();
