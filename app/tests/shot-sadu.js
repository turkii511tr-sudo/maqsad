// لقطات الواجهة بهوية السدو (بخطوط بديلة محلية لأن الشبكة هنا لا تصل لـ Google)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const T = require('./test-data.js');
const OUT = process.argv[2] || '/tmp/app-shots';
fs.mkdirSync(OUT, { recursive: true });
const KUFI = fs.readFileSync('/home/claude/maqsad-site/tools/readex-pro-arabic.woff2');
const NASKH = fs.readFileSync('/usr/share/fonts/truetype/freefont/FreeSerif.ttf');
const FONT_CSS = "@font-face{font-family:'Reem Kufi';font-weight:400 700;src:url(https://fonts.gstatic.com/k.woff2) format('woff2')}" +
  "@font-face{font-family:'Markazi Text';font-weight:400 700;src:url(https://fonts.gstatic.com/n.ttf) format('truetype')}";
async function fonts(p) {
  await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: FONT_CSS }));
  await p.route('**/fonts.gstatic.com/**', r => /k\.woff2/.test(r.request().url())
    ? r.fulfill({ status: 200, contentType: 'font/woff2', body: KUFI })
    : r.fulfill({ status: 200, contentType: 'font/ttf', body: NASKH }));
}
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const shots = [
    { tag: 'auth-m', w: 390, h: 844, auth: true },
    { tag: 'auth-m-dark', w: 390, h: 844, auth: true, dark: true },
    { tag: 'today-m', w: 390, h: 844 },
    { tag: 'today-m-dark', w: 390, h: 844, dark: true },
    { tag: 'today-d', w: 1280, h: 860 },
    { tag: 'leads-m', w: 390, h: 844, tab: 's-leads' },
    { tag: 'lead-sheet-m', w: 390, h: 844, tab: 's-leads', open: '#leadsWrap .row' },
    { tag: 'stock-m', w: 390, h: 844, tab: 's-stock' },
    { tag: 'set-m', w: 390, h: 1600, tab: 's-set' },
    { tag: 'offices-d', w: 1280, h: 1400, tab: 's-offices' },
  ];
  for (const s of shots) {
    const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, colorScheme: s.dark ? 'dark' : 'light' });
    if (!s.auth) await ctx.addInitScript(() => { try { localStorage.setItem('maqsad_token', 'T'); } catch (e) {} });
    const p = await ctx.newPage();
    await fonts(p);
    await p.route('**/functions/v1/api*', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(T.reply(body.action, body)) });
    });
    await p.goto('file://' + path.join(__dirname, 'dist', 'app.html'));
    if (s.auth) { await p.waitForSelector('#auth'); await p.waitForTimeout(500); }
    else {
      await p.waitForSelector('#app:not([hidden])'); await p.waitForTimeout(500);
      if (s.tab) { await p.click(`.nav button[data-screen="${s.tab}"]`); await p.waitForTimeout(400); }
      if (s.open) { await p.click(s.open); await p.waitForTimeout(700); }
    }
    await p.screenshot({ path: path.join(OUT, s.tag + '.png'), fullPage: !s.open });
    console.log(s.tag);
    await ctx.close();
  }
  await b.close();
})();
