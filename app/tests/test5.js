// اختبار واجهة التنبيهات: تيليجرام و/أو إشعارات الجوال، وتبسيط إعدادات المكتب
const { chromium } = require('playwright');
const path = require('path');
const OFFICE = { id:'o1', name:'مكتب الأفق العقاري', code:'OFFICE_01', license_no:'1200012345', msg_quota:15, debounce_seconds:7,
  wa_number:'966501112345', wa_provider:'cloud', fal:{ state:'ok', expires_on:'2027-06-01', days_left:250 }, onboarded:true };
const KEY = 'BA_mkw8nP3zReJdGrcs3R782nEcDbqRtm77Ozzzy6fCgMy0sPbG8XKJCl18EJnzLao60_gtbJtDBeG_WEW8nDb0';
const R = {}; const fails = []; const errs = [];
const check = (n, c, x) => { R[n] = !!c; if (!c) fails.push(n + (x ? ' — ' + x : '')); };

(async () => {
  const b = await chromium.launch({ args:['--no-sandbox'] });
  async function open(role, notify, opts = {}) {
    let st = { ...notify };
    const calls = [];
    const status = () => ({ can_edit:false, is_super:false, office_name:OFFICE.name, whatsapp:true, wa_number:OFFICE.wa_number,
      wa_provider:'cloud', msg_quota:15, my_phone:'966500000001', my_role:role, errors:[], notify:{ ...st } });
    const ctx = await b.newContext({ viewport:{ width: opts.width || 390, height:880 } });
    await ctx.addInitScript(({ sub, perm }) => {
      try { localStorage.setItem('maqsad_token','T'); } catch(e){}
      // جوال يدعم الإشعارات وعامل الخدمة الجديد
      window.__subscribed = sub;
      const fakeSub = () => ({ endpoint:'https://fcm.googleapis.com/fcm/send/dev-test',
        toJSON(){ return { endpoint:this.endpoint, keys:{ p256dh:'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth:'BTBZMqHH6r4Tts7J_aSIgg' } }; },
        unsubscribe(){ window.__subscribed = false; return Promise.resolve(true); } });
      const reg = { active:{ postMessage(m, ports){ setTimeout(() => ports[0].postMessage({ type:'maqsad-pong', push:true }), 10); } },
        pushManager:{ getSubscription(){ return Promise.resolve(window.__subscribed ? fakeSub() : null); },
          subscribe(o){ window.__appKeyLen = o.applicationServerKey.length; window.__subscribed = true; return Promise.resolve(fakeSub()); } } };
      Object.defineProperty(navigator, 'serviceWorker', { value:{ getRegistration(){ return Promise.resolve(reg); }, ready:Promise.resolve(reg),
        register(){ return Promise.resolve(reg); }, addEventListener(){} } });
      window.PushManager = function(){};
      window.Notification = { permission: perm, requestPermission(){ return Promise.resolve('granted'); } };
      window.open = (u) => { window.__opened = (window.__opened || []).concat([u]); return { location:{ set href(v){ window.__opened.push(v); } }, close(){} }; };
    }, { sub: !!opts.subscribed, perm: opts.perm || 'default' });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(role + ' PAGEERROR: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push(role + ' CONSOLE: ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
    await p.route('**/functions/v1/api*', async route => {
      const body = JSON.parse(route.request().postData() || '{}'); calls.push(body);
      let res = { ok:true }, code = 200;
      switch (body.action) {
        case 'bootstrap': res = { staff:{ name:'أبو فيصل', role, phone:'966500000001' }, is_super:false, office:OFFICE, leads:[], properties:[], status:status(), offices:null }; break;
        case 'settings_status': res = status(); break;
        case 'notify_save': st.telegram = body.telegram; st.push = body.push; res = { ok:true, notify:{ ...st } }; break;
        case 'tg_link': res = { ok:true, code:'ABCDEFGH2345', private:'https://t.me/Maqsad_saBot?start=ABCDEFGH2345', group:'https://t.me/Maqsad_saBot?startgroup=ABCDEFGH2345' }; break;
        case 'tg_status': { const n = calls.filter(c => c.action === 'tg_status').length; if (n >= 2) st.tg_linked = true; res = { linked: st.tg_linked }; break; }
        case 'push_subscribe': st.devices = (st.devices || 0) + (st.my_devices ? 0 : 1); st.my_devices = 1; break;
        case 'push_unsubscribe': st.devices = Math.max(0, st.devices - 1); st.my_devices = 0; break;
        case 'tg_unlink': st.tg_linked = false; st.telegram = false; st.push = true; break;
      }
      await route.fulfill({ status:code, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(res) });
    });
    await p.goto('file://' + path.join(__dirname, '..', 'dist', 'app.html'));
    await p.waitForSelector('#app:not([hidden])'); await p.waitForTimeout(600);
    return { ctx, p, calls, st };
  }
  const OUT = process.argv[2] || '/tmp';
  const base = { telegram:true, push:true, tg_linked:false, push_key:KEY, devices:0, my_devices:0, can_edit:true };

  { // صاحب مكتب جديد: لا تيليجرام ولا جوال
    const { ctx, p, calls } = await open('owner', base);
    check('greetFullKunya', (await p.$eval('#greet', n => n.textContent)).includes('أبو فيصل'));
    const attn = await p.$$eval('#attnList .attn', ns => ns.map(n => n.textContent));
    check('todayNudge', attn.some(t => t.includes('التنبيهات ما تشتغل')), attn.join('|'));
    await p.click('.nav button[data-screen="s-set"]'); await p.waitForTimeout(250);
    const order = await p.$$eval('#s-set .block:not([hidden]) > h3', ns => ns.map(n => n.textContent.trim()));
    check('settingsOrder', order[0] === 'التنبيهات' && order[1] === 'مكتبي', order.join(','));
    check('sysHiddenForOwner', await p.$eval('#sysBlock', n => n.hidden));
    const info = await p.$eval('#officeInfo', n => n.textContent);
    check('noTechRows', !info.includes('مهلة تجميع') && !info.includes('مزود الواتساب') && info.includes('المساعد الآلي') && info.includes('يعمل'), info);
    check('twoSwitches', (await p.$$('#notifyCard .nt-sw input:not([disabled])')).length === 2);
    await p.screenshot({ path: OUT + '/nt-owner-empty.png', fullPage:true });
    // تفعيل الجوال
    await p.click('#ntPushOn'); await p.waitForTimeout(500);
    check('subscribeSent', calls.some(c => c.action === 'push_subscribe' && c.sub.keys.p256dh.length === 87 && c.device));
    check('testAfterSubscribe', calls.some(c => c.action === 'push_test' && c.endpoint.includes('dev-test')));
    check('appKey65', (await p.evaluate(() => window.__appKeyLen)) === 65);
    const card = await p.$eval('#notifyCard', n => n.textContent);
    check('pushOnShown', card.includes('مفعّلة على هذا الجوال') && card.includes('جوال واحد'), card);
    check('nudgeGone', !(await p.$$eval('#attnList .attn', ns => ns.map(n => n.textContent))).some(t => t.includes('التنبيهات ما تشتغل')));
    // ما يقدر يطفّي القناتين
    await p.click('#ntTg'); await p.waitForTimeout(250);
    check('tgOff', calls.some(c => c.action === 'notify_save' && c.telegram === false && c.push === true));
    await p.click('#ntPush'); await p.waitForTimeout(250);
    check('cantDisableBoth', !calls.some(c => c.action === 'notify_save' && !c.telegram && !c.push) &&
      (await p.$eval('#ntPush', n => n.checked)) && (await p.$eval('#ntMsg', n => n.textContent)).includes('وحدة على الأقل'));
    await p.click('#ntTg'); await p.waitForTimeout(250);
    // ربط تيليجرام بمجموعة
    await p.click('#ntTgGroup'); await p.waitForTimeout(300);
    const opened = await p.evaluate(() => window.__opened);
    check('openedGroupLink', opened && opened.includes('https://t.me/Maqsad_saBot?startgroup=ABCDEFGH2345'), JSON.stringify(opened));
    check('waitingHelp', (await p.$eval('#notifyCard', n => n.textContent)).includes('بانتظار الربط'));
    await p.screenshot({ path: OUT + '/nt-owner-waiting.png', fullPage:true });
    await p.waitForTimeout(7000);
    const card2 = await p.$eval('#notifyCard', n => n.textContent);
    check('linkedAfterPoll', card2.includes('مربوط') && card2.includes('فك الربط'), card2);
    await p.screenshot({ path: OUT + '/nt-owner-both.png', fullPage:true });
    // الخروج يوقف الجهاز
    await p.click('#btnLogout'); await p.waitForTimeout(300);
    check('logoutUnsub', (await p.evaluate(() => window.__subscribed)) === false);
    await ctx.close();
  }
  { // وسيط: يفعّل جواله فقط، وما يغيّر القنوات ولا يربط تيليجرام
    const { ctx, p } = await open('agent', { ...base, can_edit:false, tg_linked:true, devices:2 }, { subscribed:true });
    await p.click('.nav button[data-screen="s-set"]'); await p.waitForTimeout(300);
    check('agentSwitchesLocked', (await p.$$('#notifyCard .nt-sw input[disabled]')).length === 2);
    const t = await p.$eval('#notifyCard', n => n.textContent);
    check('agentNoUnlink', !t.includes('فك الربط') && t.includes('إرسال تجربة'), t);
    check('agentSeesOn', t.includes('مفعّلة على هذا الجوال'), t);
    await p.screenshot({ path: OUT + '/nt-agent.png', fullPage:true });
    await ctx.close();
  }
  { // الإشعارات مقفولة من إعدادات الجوال
    const { ctx, p } = await open('owner', base, { perm:'denied' });
    await p.click('.nav button[data-screen="s-set"]'); await p.waitForTimeout(300);
    check('deniedHelp', (await p.$eval('#notifyCard', n => n.textContent)).includes('مقفولة'));
    await ctx.close();
  }
  { // سطح المكتب: شكل البطاقة
    const { ctx, p } = await open('owner', { ...base, tg_linked:true, devices:3 }, { width:1280, subscribed:true });
    await p.click('.nav button[data-screen="s-set"]'); await p.waitForTimeout(300);
    const sw = await p.$eval('body', n => n.scrollWidth);
    check('noHScroll', sw <= 1280, String(sw));
    await p.screenshot({ path: OUT + '/nt-desktop.png' });
    await ctx.close();
  }
  await b.close();
  const n = Object.keys(R).length, ok = Object.values(R).filter(Boolean).length;
  if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
  if (fails.length) console.log('FAIL:\n' + fails.join('\n'));
  console.log(`${ok}/${n} checks passed`);
  process.exit(ok === n && !errs.length ? 0 : 1);
})();
