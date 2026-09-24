// اختبارات الموقع الوظيفية: النماذج (بنقطة إرسال وهمية)، والسياسة الأمنية، والروابط، والمعاينة
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const serve = require("./serve");
const routeFonts = require("./fonts");
const DIST = path.join(__dirname, "..", "dist");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };

(async () => {
  const srv = await serve(DIST, 4180);
  const b = await chromium.launch({ args: ["--no-sandbox"] });
  const page = async (url, opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: opts.w || 1280, height: 900 } });
    const p = await ctx.newPage();
    p.errors = [];
    p.on("pageerror", (e) => p.errors.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) p.errors.push(m.text()); });
    await p.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
    await routeFonts(p);
    p.sent = [];
    if (opts.api) await p.route("https://dindcejhsaxqwdkxtkcy.supabase.co/functions/v1/**", async (r) => {
      const body = JSON.parse(r.request().postData() || "{}");
      p.sent.push({ url: r.request().url(), body });
      const [status, json] = opts.api(body, p.sent.length);
      if (status === 0) return r.abort();
      await r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(json) });
    });
    await p.goto("http://localhost:4180" + url, { waitUntil: "load" });
    p.ctx = ctx;
    p.csp = () => p.evaluate(() => window.__csp);
    return p;
  };

  console.log("الصفحة الرئيسية");
  {
    const p = await page("/");
    await p.waitForTimeout(400);
    const v = await p.csp();
    ok(p.errors.length === 0 && v.length === 0, "بلا أخطاء ولا مخالفات CSP" + (p.errors.length || v.length ? " — " + p.errors.concat(v).join(" | ") : ""));
    ok(await p.title() === "مقصد | مساعد واتساب يؤهّل عملاء مكتبك العقاري", "العنوان");
    ok(await p.$eval("html", (h) => h.lang === "ar" && h.dir === "rtl"), "lang=ar dir=rtl");
    const h1 = await p.$$eval("h1", (x) => x.length);
    ok(h1 === 1, "عنوان رئيسي واحد");
    const ids = await p.$$eval("[id]", (xs) => xs.map((x) => x.id));
    ok(new Set(ids).size === ids.length, "لا تكرار في المعرّفات");
    const anchors = await p.$$eval("a[href^='#']", (as) => as.map((a) => a.getAttribute("href")).filter((h) => h.length > 1));
    const missing = [];
    for (const a of anchors) if (!(await p.$(a))) missing.push(a);
    ok(missing.length === 0, "كل روابط الأقسام لها هدف" + (missing.length ? " — " + missing.join(",") : ""));
    const imgsNoAlt = await p.$$eval("img:not([alt])", (x) => x.length);
    ok(imgsNoAlt === 0, "لا صور بلا نص بديل");
    const labels = await p.$$eval("#joinForm input:not([type=checkbox]):not(#jWebsite), #joinForm select, #joinForm textarea", (els) => els.every((e) => document.querySelector(`label[for="${e.id}"]`)));
    ok(labels, "كل حقل له label");
    const app = await p.$eval(".top-cta .quiet", (a) => a.href);
    ok(app === "https://maqsad-sa.netlify.app/", "رابط دخول المكاتب");
    await p.ctx.close();
  }

  console.log("نموذج الانضمام");
  {
    const p = await page("/", { api: (b, n) => n === 1 ? [422, { error: "راجع الحقول المظللة", fields: { fal_license: "رقم رخصة فال أرقام فقط" } }] : [200, { ok: true }] });
    await p.click("#jSubmit");
    const errs = await p.$$eval("#joinForm .ferr", (x) => x.map((e) => e.textContent));
    ok(errs.length === 4 && p.sent.length === 0, "تحقق محلي: ٤ أخطاء ولا إرسال (" + errs.length + ")");
    ok(await p.evaluate(() => document.activeElement.id) === "jOffice", "التركيز ينتقل لأول حقل خاطئ");
    await p.click("#jSubmit");
    ok(await p.$("#jMsg") && /راجع/.test(await p.$eval("#jMsg", (m) => m.textContent)), "رسالة النموذج تبقى بعد محاولة ثانية");
    await p.fill("#jOffice", "  مكتب   النخبة  ");
    await p.fill("#jName", "خالد");
    await p.fill("#jPhone", "٠٥٥ ١٢٣ ٤٥٦٧");
    await p.fill("#jCity", "الرياض");
    await p.fill("#jFal", "١١٠٠٢٢٣٣");
    await p.selectOption("#jAgents", "2-5");
    await p.fill("#jNote", "إيجار شمال الرياض");
    await p.check("#jConsent");
    await p.waitForTimeout(2600);
    await p.click("#jSubmit");
    await p.waitForTimeout(400);
    ok(p.sent.length === 1, "أُرسل الطلب");
    const s = p.sent[0].body;
    ok(s.office_name === "مكتب النخبة" && s.phone === "٠٥٥ ١٢٣ ٤٥٦٧" && s.fal_license === "11002233" && s.agents === "2-5" && s.consent === true && s.website === "", "حقول الإرسال (تنظيف المسافات وتحويل أرقام فال)");
    ok(s.t >= 2500, "وقت التعبئة يتجاوز فخ البرامج (" + s.t + "ms)");
    ok(p.sent[0].url.endsWith("/functions/v1/join?forceFunctionRegion=eu-central-1"), "الطلب يُعالَج في فرانكفورت (تثبيت المنطقة)");
    ok(await p.$eval("#jFal", (e) => e.closest(".field").classList.contains("bad")), "خطأ الخادم يظهر على الحقل نفسه");
    await p.fill("#jFal", "11002233");
    await p.click("#jSubmit");
    await p.waitForSelector("#joinDone:not([hidden])");
    const done = await p.$eval("#joinDone", (d) => d.textContent);
    ok(/وصل طلبك/.test(done) && /0551234567/.test(done), "رسالة النجاح برقمه المحلي");
    ok(await p.$eval("#joinForm", (f) => f.hidden), "النموذج يختفي بعد النجاح");
    ok(p.errors.length === 0, "بلا أخطاء" + (p.errors.length ? " — " + p.errors.join(" | ") : ""));
    await p.ctx.close();
  }
  {
    const p = await page("/", { api: () => [200, { ok: true, duplicate: true }] });
    await p.fill("#jOffice", "مكتب"); await p.fill("#jName", "خالد"); await p.fill("#jPhone", "0551234567"); await p.check("#jConsent");
    await p.waitForTimeout(2600); await p.click("#jSubmit");
    await p.waitForSelector("#joinDone:not([hidden])");
    ok(/وصلنا من قبل/.test(await p.$eval("#joinDone", (d) => d.textContent)), "طلب مكرر: رسالة مناسبة");
    await p.ctx.close();
  }
  {
    const p = await page("/", { api: () => [429, { error: "وصلتنا عدة طلبات من نفس الجهاز اليوم." }] });
    await p.fill("#jOffice", "مكتب"); await p.fill("#jName", "خالد"); await p.fill("#jPhone", "0551234567"); await p.check("#jConsent");
    await p.click("#jSubmit"); await p.waitForTimeout(400);
    ok(/عدة طلبات/.test(await p.$eval("#jMsg", (m) => m.textContent)) && !(await p.$eval("#jSubmit", (b) => b.disabled)), "حد الطلبات: رسالة الخادم والزر يرجع");
    await p.ctx.close();
  }
  {
    const p = await page("/", { api: () => [0] });
    await p.fill("#jOffice", "مكتب"); await p.fill("#jName", "خالد"); await p.fill("#jPhone", "0551234567"); await p.check("#jConsent");
    await p.click("#jSubmit"); await p.waitForTimeout(400);
    ok(/بالإنترنت/.test(await p.$eval("#jMsg", (m) => m.textContent)), "انقطاع الشبكة: رسالة واضحة");
    await p.ctx.close();
  }

  console.log("نموذج راسلنا");
  {
    const p = await page("/contact", { api: () => [200, { ok: true }] });
    ok(p.errors.length === 0, "صفحة راسلنا بلا أخطاء" + (p.errors.length ? " — " + p.errors.join(" | ") : ""));
    await p.click("#contactForm [type=submit]");
    const errs = await p.$$eval("#contactForm .ferr", (x) => x.length);
    ok(errs === 5 && p.sent.length === 0, "تحقق محلي: ٥ أخطاء (" + errs + ")");
    await p.fill("#cName", "سعد"); await p.fill("#cEmail", "Saad@Example.com"); await p.selectOption("#cTopic", "privacy");
    await p.fill("#cMessage", "أبي نسخة من بياناتي اللي عندكم"); await p.check("#cConsent");
    await p.waitForTimeout(2600);
    await p.click("#contactForm [type=submit]");
    await p.waitForSelector("#contactDone:not([hidden])");
    const s = p.sent[0].body;
    ok(p.sent[0].url.endsWith("/contact?forceFunctionRegion=eu-central-1") && s.email === "saad@example.com" && s.topic === "privacy" && s.phone === "", "حقول رسالة التواصل");
    ok(/٣٠ يوماً/.test(await p.$eval("#contactDone", (d) => d.textContent)), "طلب خصوصية: يذكر مهلة ٣٠ يوماً");
    await p.ctx.close();
  }

  console.log("الصفحات الأخرى");
  for (const [u, t] of [["/privacy", "سياسة الخصوصية"], ["/terms", "الشروط والأحكام"], ["/refund", "سياسة الاسترجاع والإلغاء"], ["/nope/deep/path", "القطعة ٤٠٤"]]) {
    const p = await page(u);
    const h = await p.$eval("h1", (e) => e.textContent);
    const css = await p.evaluate(() => [...document.styleSheets].some((s) => { try { return s.cssRules.length > 50; } catch (e) { return false; } }));
    const v = await p.csp();
    ok(h.includes(t) && css && p.errors.length === 0 && v.length === 0, `${u}: العنوان والتنسيق يعملان بلا مخالفات` + (p.errors.length || v.length ? " — " + p.errors.concat(v).join(" | ") : ""));
    if (u === "/privacy") {
      const toc = await p.$$eval(".toc a", (as) => as.every((a) => document.querySelector(a.getAttribute("href"))));
      ok(toc, "فهرس الخصوصية: كل الروابط لها أقسام");
    }
    await p.ctx.close();
  }

  // الروابط الداخلية في كل الصفحات تشير لملفات موجودة
  const htmls = fs.readdirSync(DIST).filter((f) => f.endsWith(".html"));
  const broken = [];
  for (const f of htmls) {
    const src = fs.readFileSync(path.join(DIST, f), "utf8");
    for (const m of src.matchAll(/(?:href|src)="([^"#:]+?)(?:#[^"]*)?"/g)) {
      const u = m[1].replace(/^\//, "");
      if (!u || u.startsWith("gf/")) continue;
      if (!fs.existsSync(path.join(DIST, u))) broken.push(f + " → " + m[1]);
    }
  }
  ok(broken.length === 0, "لا روابط داخلية مكسورة" + (broken.length ? " — " + broken.join(", ") : ""));

  // نسخة المعاينة: الإرسال معطّل برسالة واضحة
  const psrv = await serve(path.join(__dirname, "..", "preview"), 4181);
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await p.goto("http://localhost:4181/index.html");
    await p.fill("#jOffice", "مكتب"); await p.fill("#jName", "خالد"); await p.fill("#jPhone", "0551234567"); await p.check("#jConsent");
    await p.click("#jSubmit"); await p.waitForTimeout(300);
    ok(/معاينة/.test(await p.$eval("#jMsg", (m) => m.textContent)), "المعاينة: لا إرسال فعلي");
    await ctx.close();
  }
  psrv.close();

  await b.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
