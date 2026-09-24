// لقطات الموقع بأحجام وثيمات مختلفة + فحص التمرير الأفقي
const { chromium } = require("playwright");
const path = require("path");
const serve = require("./serve");
const routeFonts = require("./fonts");
const OUT = process.argv[2] || "/tmp/shots";
const only = process.argv[3] || "";
(async () => {
  const srv = await serve(path.join(__dirname, "..", "dist"), 4173);
  const b = await chromium.launch({ args: ["--no-sandbox"] });
  const sizes = [
    { tag: "d", w: 1440, h: 900 }, { tag: "l", w: 1280, h: 800 },
    { tag: "t", w: 820, h: 1180 }, { tag: "m", w: 390, h: 844 },
  ];
  const pages = [["index", "/"], ["privacy", "/privacy"], ["terms", "/terms"], ["refund", "/refund"], ["contact", "/contact"], ["404", "/nope/x"]];
  for (const [name, url] of pages) {
    if (only && !only.split(",").includes(name)) continue;
    for (const s of sizes) {
      for (const scheme of ["light", "dark"]) {
        if (name !== "index" && scheme === "dark" && s.tag !== "m") continue;
        const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, colorScheme: scheme, deviceScaleFactor: 1 });
        const p = await ctx.newPage();
        const errs = [];
        p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
        p.on("console", (m) => { if (m.type() === "error" && !/gf\//.test(m.text()) && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
        await routeFonts(p);
        await p.goto("http://localhost:4173" + url, { waitUntil: "load" });
        await p.waitForTimeout(1200);
        const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth,
          wide: [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.left < -1; })
            .filter((e) => !e.closest(".plan,.tbl,.hp,.skip,svg")).slice(0, 5).map((e) => e.tagName + "." + e.className) }));
        const file = path.join(OUT, `${name}-${s.tag}-${scheme}.png`);
        await p.screenshot({ path: file, fullPage: true });
        console.log(`${name} ${s.tag} ${scheme}: scrollW=${ov.sw} innerW=${ov.iw}${ov.sw > ov.iw ? "  ✗ HSCROLL" : ""}${ov.wide.length ? "  outside: " + ov.wide.join(" | ") : ""}${errs.length ? "  ERR: " + errs.join(" ; ") : ""}`);
        await ctx.close();
      }
    }
  }
  await b.close(); srv.close();
})();
