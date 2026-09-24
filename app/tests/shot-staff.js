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

const fs = require('fs');
const KUFI = fs.readFileSync('/home/claude/maqsad-site/tools/readex-pro-arabic.woff2');
const NASKH = fs.readFileSync('/usr/share/fonts/truetype/freefont/FreeSerif.ttf');
const FONT_CSS = "@font-face{font-family:'Reem Kufi';font-weight:400 700;src:url(https://fonts.gstatic.com/k.woff2) format('woff2')}" +
  "@font-face{font-family:'Markazi Text';font-weight:400 700;src:url(https://fonts.gstatic.com/n.ttf) format('truetype')}";
(async () => {
  const OUT = process.argv[2];
  const b = await chromium.launch({ args:['--no-sandbox'] });
  for (const dark of [false, true]) {
    const ctx = await b.newContext({ viewport:{ width:400, height:860 }, colorScheme: dark ? 'dark' : 'light' });
    await ctx.addInitScript(() => { try { localStorage.setItem('maqsad_token','T'); } catch(e){} });
    const p = await ctx.newPage();
    await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: FONT_CSS }));
    await p.route('**/fonts.gstatic.com/**', r => /k\.woff2/.test(r.request().url()) ? r.fulfill({ status: 200, contentType: 'font/woff2', body: KUFI }) : r.fulfill({ status: 200, contentType: 'font/ttf', body: NASKH }));
    await p.route('**/functions/v1/api*', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(reply(body.action, body, 'super_admin')) });
    });
    await p.goto('file://' + path.join(__dirname, 'dist', 'app.html'));
    await p.waitForSelector('#app:not([hidden])'); await p.waitForTimeout(600);
    await p.click('.nav button[data-screen="s-offices"]'); await p.waitForTimeout(300);
    await p.click('#officesList .row .btn:has-text("تعديل")');
    await p.waitForSelector('#sheet.on'); await p.waitForTimeout(600);
    await p.$eval('#staffList', n => n.scrollIntoView());
    await p.waitForTimeout(200);
    await p.screenshot({ path: OUT + '/staff-list' + (dark ? '-dark' : '') + '.png' });
    await p.click('#staffList [data-act="s2"]').catch(()=>{}); await p.waitForTimeout(400);
    const add = await p.$('#stName');
    if (!add) { const btn = await p.$('button:has-text("أضف")'); if (btn) await btn.click(); await p.waitForTimeout(300); }
    await p.fill('#stName', 'سالم'); await p.fill('#stPhone', '٠٥٠١١١٤٥٦٧'); await p.click('#stNext'); await p.waitForTimeout(300);
    await p.$eval('.review', n => n.scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(200);
    await p.screenshot({ path: OUT + '/staff-review' + (dark ? '-dark' : '') + '.png' });
    await ctx.close();
  }
  await b.close();
})();
