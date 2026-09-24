const { chromium } = require("playwright");
const path = require("path");
const serve = require("./serve");
(async () => {
  const srv = await serve(path.join(__dirname, "..", "dist"), 4174);
  const b = await chromium.launch({ args: ["--no-sandbox"] });
  const w = +(process.argv[2] || 1440);
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.route("**/gf/**", (r) => /Iw1ZEzMhQ\.woff2$/.test(r.request().url())
    ? r.fulfill({ status: 200, contentType: "font/woff2", body: require("fs").readFileSync(path.join(__dirname, "..", "tools", "readex-pro-arabic.woff2")) })
    : r.abort());
  await p.goto("http://localhost:4174/");
  await p.waitForTimeout(900);
  const sel = (process.argv[3] || ".hero-copy,.art,.art-in,.phone,.hand,.lead,.plan").split(",");
  for (const s of sel) {
    const r = await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), gtr: cs.gridTemplateRows, gtc: cs.gridTemplateColumns, disp: cs.display }; }, s);
    console.log(s, JSON.stringify(r));
  }
  await b.close(); srv.close();
})();
