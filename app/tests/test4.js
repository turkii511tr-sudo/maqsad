// اختبار الواجهة v4: نتيجة الاتصال · «ينتظر اتصالك» بأسباب التسليم · أداء المكتب · الاستهلاك والتكلفة · حالات العقار
const { chromium } = require('playwright');
const path = require('path');
const OFFICE = { id:'o1', name:'مكتب الأفق العقاري', code:'OFFICE_01', license_no:'1200012345', msg_quota:15, debounce_seconds:7, wa_number:'966501112345', wa_provider:'cloud' };
const STATUS = { can_edit:true, is_super:true, office_name:OFFICE.name, whatsapp:true, wa_number:'966501112345', wa_provider:'cloud', msg_quota:15,
  my_phone:'966501116789', my_role:'super_admin', openai:true, telegram:true, meta:true, otp_platform:true, otp_template:'maqsad_login', platform_phone_id:'1',
  meta_webhook:'https://x/wa-webhook?forceFunctionRegion=eu-central-1', wa_instance:'111', telegram_chat_id:'-100', errors:[] };
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
const LEADS = () => [
  { id:'L1', name:'أبو خالد', phone:'966511111111', deal_type:'إيجار', property_type:'شقة', location:'النرجس', budget:60000, budget_period:'سنوي',
    status:'qualified', mode:'manual', handoff_reason:'qualified', handed_at:ago(30), outcome:null, last_message_at:ago(5) },
  { id:'L2', name:'سلطان', phone:'966522222222', deal_type:'شراء', property_type:'فيلا', location:'الملقا', status:'inquiry', mode:'manual',
    handoff_reason:'human', handed_at:ago(60), outcome:null, last_message_at:ago(20) },
  { id:'L3', name:'فهد', phone:'966533333333', deal_type:'إيجار', property_type:'شقة', location:'الياسمين', status:'qualified', mode:'manual',
    handoff_reason:'qualified', handed_at:ago(600), outcome:'viewing', outcome_at:ago(100), last_message_at:ago(300) },
  { id:'L4', name:'نورة', phone:'966544444444', deal_type:'إيجار', property_type:'دور', location:'العارض', status:'qualified', mode:'manual',
    handoff_reason:'qualified', handed_at:ago(900), outcome:'no_answer', outcome_at:ago(200), last_message_at:ago(400) },
  { id:'L5', name:'عميل أوقف', phone:'966555555555', status:'qualified', mode:'manual', handoff_reason:'qualified', opted_out:true, last_message_at:ago(50) },
  { id:'L6', name:'استلمه الوسيط', phone:'966566666666', status:'inquiry', mode:'manual', handoff_reason:'taken', last_message_at:ago(70) },
];
const PROPS = [
  { id:'P1', title:'شقة النرجس', district:'النرجس', rooms:3, price:55000, state:'available', listable:true },
  { id:'P2', title:'فيلا الملقا', district:'الملقا', rooms:5, price:2400000, state:'reserved', listable:false, block_reason:'غير متاح' },
  { id:'P3', title:'دور العارض', district:'العارض', rooms:4, price:70000, state:'available', listable:false, block_reason:'ترخيص الإعلان منتهٍ' },
];
const MONTH = { new_customers:42, inbound_msgs:380, first_reply_median_s:11, offhours_new:15,
  handoffs:{ qualified:18, human:4, owner_offer:2, taken:3 }, outcomes:{ contacted:6, viewing:5, deal:2, no_answer:3 },
  callback_median_s:3*3600, waiting_now:3, top_districts:[{ d:'النرجس', n:9 }, { d:'الملقا', n:6 }] };
const USAGE = { month:'2026-09', prices:{ ai_in:0.15, ai_cached:0.075, ai_out:0.6, otp:0.018, updated:'2026-09-23', usd_sar:3.75 },
  rows:[ { id:'o1', name:'مكتب الأفق العقاري', active:true, new_customers:40, qualified:12, deals:3, ai_calls:500, otp_platform:10, otp_office:2, errors:1, cost_usd:0.36 },
         { id:'o2', name:'مكتب موقوف', active:false, new_customers:0, qualified:0, deals:0, ai_calls:0, otp_platform:0, otp_office:0, errors:0, cost_usd:0 } ],
  totals:{ offices:2, active:1, new_customers:40, qualified:12, deals:3, inbound:900, ai_calls:500, otp:12, errors:1, cost_usd:0.36 } };

let leads = LEADS();
const calls = [];
function reply(action, body, role) {
  calls.push(body);
  const isSuper = role === 'super_admin';
  switch (action) {
    case 'bootstrap': return { staff:{ name:'تركي', role, phone:'966501116789' }, is_super:isSuper, office:OFFICE, leads, properties:PROPS,
      status: isSuper ? STATUS : { ...STATUS, is_super:false, my_role:role }, offices: isSuper ? [{ id:'o1', code:'OFFICE_01', name:OFFICE.name, active:true, wa_linked:true, leads:6, props:3 }] : null, signups_new:0 };
    case 'analytics': return { summary:{}, gap:[] };
    case 'month_stats': return { month: body.month, stats: body.month === monthKey(-1) ? { new_customers:0, inbound_msgs:0 } : MONTH };
    case 'lead': { const l = leads.find(x => x.id === body.id); return { lead:{ ...l, outcome_by_name: l.outcome ? 'وسيط' : null }, messages:[] }; }
    case 'lead_outcome': { const l = leads.find(x => x.id === body.id); l.outcome = body.outcome; l.outcome_at = body.outcome ? new Date().toISOString() : null;
      return { ok:true, lead:{ ...l, outcome_by_name: body.outcome ? 'تركي' : null } }; }
    case 'platform_usage': return USAGE;
    case 'signup_list': return { requests:[] };
    case 'backups_status': return { runs:[] };
    case 'settings_status': return STATUS;
    default: return { ok:true };
  }
}
function monthKey(delta) {
  const d = new Date(Date.now() + 3 * 3600e3); let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1 + delta;
  while (m < 1) { m += 12; y--; } return y + '-' + String(m).padStart(2, '0');
}
const R = {}; const errs = []; const fails = [];
const check = (name, cond, extra) => { R[name] = !!cond; if (!cond) fails.push(name + (extra ? ' — ' + extra : '')); };
(async () => {
  const b = await chromium.launch({ args:['--no-sandbox'] });
  async function open(role, width = 400, scheme = 'light') {
    leads = LEADS();
    const ctx = await b.newContext({ viewport:{ width, height:880 }, colorScheme: scheme });
    await ctx.addInitScript(() => { try { localStorage.setItem('maqsad_token','T'); } catch(e){} });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(role + ' PAGEERROR: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push(role + ' CONSOLE: ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
    await p.route('**/functions/v1/api*', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(reply(body.action, body, role)) });
    });
    await p.goto('file://' + path.join(__dirname, '..', 'dist', 'app.html'));
    await p.waitForSelector('#app:not([hidden])'); await p.waitForTimeout(700);
    return { ctx, p };
  }

  { // وسيط على الجوال
    const { ctx, p } = await open('agent');
    const waitingStat = await p.$eval('#todayStats .stat', n => n.textContent);
    check('waitingCount3', /^3/.test(waitingStat.trim()), waitingStat);           // L1 مؤهل + L2 طلب موظف + L4 ما رد
    const attn = await p.$$eval('#attnList .attn', ns => ns.map(n => n.textContent));
    check('humanHandoffShown', attn.some(t => t.includes('سلطان') && t.includes('طلب موظف')));
    check('noAnswerRetry', attn.some(t => t.includes('نورة') && t.includes('ما رد — جرّب مرة ثانية')));
    check('viewingNotWaiting', !attn.some(t => t.includes('فهد')));
    check('optedOutNotWaiting', !attn.some(t => t.includes('عميل أوقف')));
    check('takenNotWaiting', !attn.some(t => t.includes('استلمه الوسيط')));
    check('reservedNotBlocked', attn.some(t => t.includes('1 عقار محجوب')), attn.join(' | '));
    // أداء المكتب
    const card = await p.$eval('#monthCard', n => n.textContent);
    for (const w of ['42', 'عميل جديد', 'سلّمهم المساعد لك', 'معاينة', 'صفقة', 'عادةً خلال 11 ثانية', 'عادةً خلال 3 ساعات',
      '15 من العملاء الجدد', 'تواصلت 6', 'النرجس (9)']) check('month:' + w, card.includes(w), card);
    const tiles = await p.$$eval('#monthCard .stat .v', ns => ns.map(n => n.textContent));
    check('monthTiles', JSON.stringify(tiles) === JSON.stringify(['42', '24', '5', '2']), JSON.stringify(tiles));
    calls.length = 0;
    await p.click('#monthChips .chip[data-m="prev"]'); await p.waitForTimeout(400);
    const ms = calls.find(c => c.action === 'month_stats');
    check('prevMonthKey', ms && ms.month === monthKey(-1), JSON.stringify(ms));
    check('prevEmptyState', (await p.$eval('#monthCard', n => n.textContent)).includes('ما فيه نشاط في هذا الشهر'));
    await p.click('#monthChips .chip[data-m="cur"]'); await p.waitForTimeout(200);
    // بطاقة العميل: تسجيل النتيجة
    await p.click('.nav button[data-screen="s-leads"]'); await p.waitForTimeout(200);
    await p.click('#leadChips .chip[data-f="waiting"]'); await p.waitForTimeout(150);
    const waitingRows = await p.$$eval('#leadsWrap .row .t', ns => ns.map(n => n.textContent));
    check('waitingFilter', JSON.stringify(waitingRows.sort()) === JSON.stringify(['أبو خالد', 'سلطان', 'نورة'].sort()), JSON.stringify(waitingRows));
    await p.click('#leadChips .chip[data-f="all"]'); await p.waitForTimeout(150);
    const tags = await p.$$eval('#leadsWrap .row', ns => ns.map(n => n.textContent));
    check('outcomeTagsInList', tags.some(t => t.includes('فهد') && t.includes('معاينة')) && tags.some(t => t.includes('نورة') && t.includes('ما رد')));
    await p.click('#leadsWrap .row:has-text("أبو خالد")');
    await p.waitForSelector('#outcomeChips'); await p.waitForTimeout(200);
    check('sheetHandoffTag', (await p.$eval('#sheetBody', n => n.textContent)).includes('مُسلَّم لك — البوت صامت'));
    check('fiveOutcomes', (await p.$$eval('#outcomeChips .chip', ns => ns.map(n => n.textContent))).join('|') === 'ما رد|تواصلت معه|رتّبت معاينة|تمت الصفقة|مو جاد');
    calls.length = 0;
    await p.click('#outcomeChips .chip[data-o="viewing"]'); await p.waitForTimeout(400);
    const lo = calls.find(c => c.action === 'lead_outcome');
    check('outcomeSent', lo && lo.id === 'L1' && lo.outcome === 'viewing', JSON.stringify(lo));
    check('chipPressed', await p.$eval('#outcomeChips .chip[data-o="viewing"]', n => n.getAttribute('aria-pressed') === 'true'));
    check('noteUpdated', (await p.textContent('#outcomeNote')).includes('سجّلها تركي'));
    check('monthRefetchAfterOutcome', calls.some(c => c.action === 'month_stats'));
    const w2 = await p.$eval('#todayStats .stat', n => n.textContent);
    check('waitingDropsTo2', /^2/.test(w2.trim()), w2);
    calls.length = 0;
    await p.click('#outcomeChips .chip[data-o="viewing"]'); await p.waitForTimeout(400);
    const lo2 = calls.find(c => c.action === 'lead_outcome');
    check('toggleClears', lo2 && lo2.outcome === null, JSON.stringify(lo2));
    check('waitingBackTo3', /^3/.test((await p.$eval('#todayStats .stat', n => n.textContent)).trim()));
    await p.click('#sheetClose'); await p.waitForTimeout(200);
    // العقارات
    await p.click('.nav button[data-screen="s-stock"]'); await p.waitForTimeout(200);
    const stock = await p.$$eval('#stockWrap .row', ns => ns.map(n => n.textContent));
    check('reservedTag', stock.some(t => t.includes('فيلا الملقا') && t.includes('محجوز') && !t.includes('غير متاح')), stock.join(' | '));
    check('licenseBlockedTag', stock.some(t => t.includes('دور العارض') && t.includes('محجوب') && t.includes('منتهٍ')));
    await p.click('#stockWrap .row:has-text("فيلا الملقا")'); await p.waitForTimeout(250);
    const opts = await p.$$eval('#pState option', ns => ns.map(n => n.value + ':' + n.textContent + (n.selected ? '*' : '')));
    check('stateOptions', opts.join('|') === 'available:متاح|reserved:محجوز*|rented:مؤجّر|sold:مباع', opts.join('|'));
    await p.click('#sheetClose'); await p.waitForTimeout(150);
    check('agentNoUsage', !(await p.$('#usageBody .tbl')));
    R.hScrollMobile = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await p.click('.nav button[data-screen="s-today"]'); await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(__dirname, 'shot4-today-mobile.png'), fullPage: true });
    await ctx.close();
  }

  { // المشغّل: الاستهلاك والتكلفة
    for (const [w, scheme] of [[400, 'light'], [1280, 'dark']]) {
      const { ctx, p } = await open('super_admin', w, scheme);
      await p.click('.nav button[data-screen="s-offices"]'); await p.waitForTimeout(400);
      const body = await p.$eval('#usageBody', n => n.textContent);
      check('usage@' + w + ':totalSar', body.includes('1.35'), body.slice(0, 300));          // 0.36$ × 3.75
      check('usage@' + w + ':perCustomer', body.includes('0.03 ريال'), body.slice(0, 300));   // 1.35 / 40
      const rows = await p.$$eval('#usageBody tbody tr', ns => ns.map(n => n.textContent));
      check('usage@' + w + ':rows', rows.length === 2 && rows[1].includes('موقوف'));
      const foot = await p.$eval('#usageBody tfoot', n => n.textContent);
      check('usage@' + w + ':foot', foot.includes('الإجمالي') && foot.includes('500') && foot.includes('12'));
      check('usage@' + w + ':note', body.includes('ردود واتساب على العملاء مجانية'));
      if (w === 400) {
        R.hScrollOffices = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        await p.click('details.prices summary'); await p.fill('#prIn', '0.2');
        calls.length = 0;
        await p.click('#btnSavePrices'); await p.waitForTimeout(400);
        const sv = calls.find(c => c.action === 'save_settings');
        check('pricesSaved', sv && sv.settings.price_ai_in === '0.2' && sv.settings.price_otp === '0.018', JSON.stringify(sv));
        check('usageReloaded', calls.some(c => c.action === 'platform_usage'));
        calls.length = 0;
        await p.click('#usageChips .chip[data-m="prev"]'); await p.waitForTimeout(300);
        const pu = calls.find(c => c.action === 'platform_usage');
        check('usagePrevMonth', pu && pu.month === monthKey(-1));
      }
      await p.screenshot({ path: path.join(__dirname, 'shot4-offices-' + (w === 400 ? 'mobile' : 'desktop-dark') + '.png'), fullPage: true });
      await ctx.close();
    }
  }
  await b.close();
  check('noHScrollMobile', !R.hScrollMobile); check('noHScrollOffices', !R.hScrollOffices);
  check('noErrors', errs.length === 0, errs.join(' | '));
  const total = Object.keys(R).length;
  console.log(fails.length ? 'FAILED:\n  ' + fails.join('\n  ') : 'all good');
  console.log(`${total - fails.length}/${total} checks passed`);
  process.exit(fails.length ? 1 : 0);
})();
