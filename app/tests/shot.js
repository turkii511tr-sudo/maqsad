const { chromium } = require('playwright');
const path = require('path');
const T = require('./test-data.js');
(async () => {
  const b = await chromium.launch({ args:['--no-sandbox'] });
  for (const vp of [{w:400,h:900,tag:'today-mobile',dark:false},{w:1180,h:840,tag:'today-desktop',dark:false}]) {
    const ctx = await b.newContext({ viewport:{width:vp.w,height:vp.h}, colorScheme: vp.dark?'dark':'light' });
    await ctx.addInitScript(() => { try{localStorage.setItem('maqsad_token','T');}catch(e){} });
    const p = await ctx.newPage();
    await p.route('**/functions/v1/api*', async route => {
      const body = JSON.parse(route.request().postData()||'{}');
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(T.reply(body.action,body))});
    });
    await p.goto('file://'+path.join(__dirname,'..','dist','app.html'));
    await p.waitForSelector('#app:not([hidden])');
    await p.waitForTimeout(600);
    await p.screenshot({ path:`s-${vp.tag}.png` });
    await ctx.close();
  }
  await b.close();
})();
