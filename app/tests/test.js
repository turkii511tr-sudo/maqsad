const { chromium } = require('playwright');
const path = require('path');

const OFFICE = { id:'o1', name:'مكتب الأفق العقاري', code:'OFFICE_01', license_no:'1200012345',
  msg_quota:15, debounce_seconds:7, wa_number:'966501112345', wa_provider:'ultramsg' };

const LEADS = [
  { id:'c1', name:'فهد بن سالم', phone:'966501116789', deal_type:'إيجار', property_type:'شقة',
    budget:45000, budget_period:'سنوي', location:'النرجس', rooms:3, status:'qualified',
    mode:'manual', summary:'يبحث عن شقة إيجار في النرجس ٣ غرف بميزانية ٤٥ ألف سنوي.',
    msg_count:4, last_message_at:new Date(Date.now()-35*60000).toISOString() },
  { id:'c2', name:'خالد الدوسري', phone:'966511111111', deal_type:'شراء', property_type:'فيلا',
    budget:1850000, budget_period:null, location:'حطين', rooms:5, status:'qualified',
    mode:'manual', summary:'يريد فيلا في حطين.', msg_count:7,
    last_message_at:new Date(Date.now()-3*3600000).toISOString() },
  { id:'c3', name:'أحمد', phone:'966522222222', deal_type:null, property_type:null,
    budget:null, location:null, rooms:null, status:'inquiry', mode:'auto',
    summary:'استفسار عام.', msg_count:1, last_message_at:new Date().toISOString() },
];

const today = new Date(); const soon = new Date(Date.now()+4*86400000);
const d = x => x.toISOString().slice(0,10);
const PROPS = [
  { id:'p1', title:'شقة النرجس A12', deal_type:'إيجار', property_type:'شقة', district:'النرجس',
    price:42000, rooms:3, state:'available', ad_license_no:'7200034512',
    ad_license_expiry:d(soon), listable:true, block_reason:null },
  { id:'p2', title:'فيلا حطين', deal_type:'شراء', property_type:'فيلا', district:'حطين',
    price:1850000, rooms:5, state:'available', ad_license_no:null,
    ad_license_expiry:null, listable:false, block_reason:'بدون رقم ترخيص إعلان' },
];

const STATUS = { can_edit:true, is_super:true, office_name:OFFICE.name, whatsapp:false,
  wa_number:'966501112345', msg_quota:15, my_phone:'966501116789', openai:true,
  telegram:false, wa_instance:'instance190700', wa_provider:'ultramsg', telegram_chat_id:'',
  errors:[{ kind:'whatsapp_send_failed', detail:{ error:'Wrong token.' }, created_at:new Date().toISOString() }] };

const OFFICES = [
  { id:'o1', code:'OFFICE_01', name:OFFICE.name, license_no:'1200012345', wa_number:'966501112345',
    wa_provider:'ultramsg', wa_instance:'instance190700', active:true, msg_quota:15,
    telegram_chat_id:'', wa_linked:true, leads:3, props:2 },
  { id:'o2', code:'OFFICE_02', name:'مكتب الواحة', license_no:'1200099999', wa_number:null,
    wa_provider:'ultramsg', wa_instance:null, active:true, msg_quota:15,
    telegram_chat_id:null, wa_linked:false, leads:0, props:0 },
];

function reply(action, body) {
  switch (action) {
    case 'bootstrap': return { staff:{name:'تركي',role:'super_admin',phone:'966501116789'},
      is_super:true, office:OFFICE, leads:LEADS, properties:PROPS, status:STATUS, offices:OFFICES };
    case 'leads': return { leads:LEADS };
    case 'properties': return { properties:PROPS };
    case 'settings_status': return STATUS;
    case 'analytics': return { summary:{}, gap:[{ location:'النرجس', property_type:'شقة', deal_type:'إيجار', misses:17 }] };
    case 'offices_list': return { offices:OFFICES };
    case 'backups_status': return { runs:[{ started_at:new Date().toISOString(), ok:true, bytes:46094 }] };
    case 'staff_list': return { staff:[{ id:'s1', name:'سعد', phone:'966500000002', role:'agent', active:true }] };
    case 'lead': return { lead:LEADS.find(l=>l.id===body.id), messages:[
      { direction:'in', body:'السلام عليكم أبي شقة إيجار في النرجس', created_at:new Date(Date.now()-40*60000).toISOString() },
      { direction:'out', body:'الله يعطيك العافية\n\n🏠 شقة النرجس A12\n💰 42,000 ريال', created_at:new Date(Date.now()-39*60000).toISOString() } ] };
    case 'set_mode': return { ok:true, mode:body.mode };
    case 'property_save': return { ok:true };
    case 'office_save': return { ok:true, offices:OFFICES };
    case 'save_settings': return { ok:true };
    case 'test_whatsapp': return { ok:false, to:'966501116789' };
    case 'logout': return { ok:true };
    default: return { ok:true };
  }
}

(async () => {
  const b = await chromium.launch({ args:['--no-sandbox'] });
  const results = {};
  const errs = [];

  for (const vp of [{w:400,h:840,tag:'mobile'},{w:1280,h:900,tag:'desktop'}]) {
    const ctx = await b.newContext({ viewport:{ width:vp.w, height:vp.h } });
    await ctx.addInitScript(() => { try { localStorage.setItem('maqsad_token','TESTTOKEN'); } catch(e){} });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(vp.tag + ' PAGEERROR: ' + e.message));
    p.on('console', m => { if (m.type()==='error') errs.push(vp.tag + ' CONSOLE: ' + m.text()); });

    await p.route('**/functions/v1/api*', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status:200, contentType:'application/json',
        headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(reply(body.action, body)) });
    });

    await p.goto('file://' + path.join(__dirname, 'dist', 'app.html'));
    await p.waitForSelector('#app:not([hidden])', { timeout:10000 });
    await p.waitForTimeout(500);

    const r = {};
    r.greeting   = await p.textContent('#greet');
    r.office     = await p.textContent('#topOffice');
    r.attnCount  = await p.$$eval('#attnList .attn', n => n.length);
    r.navDot     = await p.$eval('#navDot', n => !n.hidden);
    r.officesTab = await p.$eval('#navOffices', n => !n.hidden);
    r.gapShown   = await p.$eval('#gapBlock', n => !n.hidden);

    // العملاء
    await p.click('.nav button[data-screen="s-leads"]');
    r.leadRows = await p.$$eval('#leadsWrap .row', n => n.length);
    await p.click('#leadChips .chip[data-f="qualified"]');
    r.leadRowsQualified = await p.$$eval('#leadsWrap .row', n => n.length);
    await p.fill('#leadSearch', 'حطين');
    r.leadRowsSearch = await p.$$eval('#leadsWrap .row', n => n.length);
    await p.fill('#leadSearch', '');
    await p.click('#leadChips .chip[data-f="all"]');

    // فتح عميل
    await p.click('#leadsWrap .row');
    await p.waitForSelector('#sheet.on', { timeout:5000 });
    await p.waitForTimeout(350);
    r.sheetTitle  = await p.textContent('#sheetTitle');
    r.journey     = await p.$$eval('#sheetBody .track .st', n => n.length);
    r.bubbles     = await p.$$eval('#sheetBody .bub', n => n.length);
    r.hasWaBtn    = await p.$$eval('#sheetBody .btn.wa', n => n.length) === 1;
    await p.click('#sheetClose');
    await p.waitForTimeout(300);

    // العقارات
    await p.click('.nav button[data-screen="s-stock"]');
    r.propRows = await p.$$eval('#stockWrap .row', n => n.length);
    await p.click('#btnNewProp');
    await p.waitForSelector('#sheet.on');
    await p.waitForTimeout(300);
    r.propFormFields = await p.$$eval('#sheetBody .input', n => n.length);
    await p.click('#sheetClose');
    await p.waitForTimeout(300);

    // المكاتب
    await p.click('.nav button[data-screen="s-offices"]');
    r.officeRows = await p.$$eval('#officesList .row', n => n.length);
    r.backups = (await p.textContent('#backupList')).includes('ك.ب');

    // الإعدادات
    await p.click('.nav button[data-screen="s-set"]');
    r.statusRows = await p.$$eval('#sysStatus .dl div', n => n.length);
    r.keysShown  = await p.$eval('#keysBlock', n => !n.hidden);
    r.savedHint  = await p.$eval('#kOpenai', n => n.placeholder);

    // انزلاق أفقي؟
    r.hScroll = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

    await p.screenshot({ path:`shot-${vp.tag}.png`, fullPage:false });
    results[vp.tag] = r;
    await ctx.close();
  }

  // شاشة الدخول بلا رمز
  const ctx2 = await b.newContext({ viewport:{ width:400, height:840 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errs.push('auth PAGEERROR: ' + e.message));
  await p2.goto('file://' + path.join(__dirname, 'dist', 'app.html'));
  await p2.waitForTimeout(600);
  results.auth = {
    authVisible: await p2.$eval('#auth', n => !n.hidden),
    appHidden:   await p2.$eval('#app', n => n.hidden),
    hasPhone:    await p2.$$eval('#ph', n => n.length) === 1,
  };
  await p2.screenshot({ path:'shot-auth.png' });

  console.log(JSON.stringify({ results, errors: errs }, null, 1));
  await b.close();
})();
