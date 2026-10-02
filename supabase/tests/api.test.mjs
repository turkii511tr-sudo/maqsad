// اختبارات واجهة المنصة v9 — بقاعدة بيانات وهمية
import { makeDb, makeFetch, loadFunction } from "./harness.mjs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const FN = new URL("../functions/api/index.ts", import.meta.url).pathname;
const H = (t) => createHash("sha256").update(t + "|wk").digest("hex");
const future = new Date(Date.now() + 864e5).toISOString();
function seed() {
  const customers = [], messages = [];
  for (let i = 0; i < 2500; i++) customers.push({ id: "c" + i, office_id: "o1", name: "عميل " + i, phone: "9665" + String(i).padStart(8, "0"), created_at: new Date(1e12 + i).toISOString() });
  for (let i = 0; i < 2100; i++) messages.push({ id: i + 1, office_id: "o1", customer_id: "c" + (i % 50), direction: "in", body: "رسالة " + i, created_at: new Date(1e12 + i).toISOString() });
  return {
    app_secrets: [{ key: "WEBHOOK_SECRET", value: "wk" }, { key: "TELEGRAM_BOT_TOKEN", value: "1:abc" }],
    offices: [
      { id: "o1", name: "مكتب الأفق", code: "UFQ", license_no: "1100", wa_provider: "cloud", wa_instance: "111", wa_token: "EAA", wa_number: "966511111111", active: true, msg_quota: 15 },
      { id: "o2", name: "مكتب موقوف", code: "OFF", license_no: "2200", wa_provider: "cloud", wa_instance: "222", wa_token: "EAB", active: false, msg_quota: 15 },
    ],
    staff: [
      { id: "s1", office_id: "o1", name: "صاحب", phone: "966500000001", role: "owner", active: true },
      { id: "s2", office_id: "o1", name: "وسيط", phone: "966500000002", role: "agent", active: true },
      { id: "s3", office_id: "o2", name: "وسيط موقوف", phone: "966500000003", role: "agent", active: true },
      { id: "sa", office_id: "o1", name: "المشغّل", phone: "966500000009", role: "super_admin", active: true },
    ],
    sessions: ["s1", "s2", "s3", "sa"].map((id) => ({ token_hash: H("tok-" + id), staff_id: id, kind: "session", expires_at: future })),
    customers, messages, properties: [], otps: [], login_audit: [], events: [], privacy_requests: [],
  };
}
const results = [];
async function test(name, fn) { try { await fn(); results.push(["✓", name]); } catch (e) { results.push(["✗", name, e.message]); } }
const call = (h, body, tok) => h(new Request("https://x/api", { method: "POST",
  headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer tok-" + tok } : {}), origin: "https://maqsad-sa.netlify.app" },
  body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
async function boot(mut) {
  const d = seed(); if (mut) mut(d);
  const db = makeDb(d); const f = makeFetch({});
  const { handler } = await loadFunction(FN, db.client, f);
  return { T: db.T, f, h: handler };
}
const graph = (f) => f.calls.filter((c) => c.url.includes("graph.facebook.com"));

await test("v15 بداية الدخول بلا رقم المنصة: الرسالة لرقم المكتب، بلا اسم الموظف، وما يُرسل شي", async () => {
  const { T, f, h } = await boot();
  const r = await call(h, { action: "login_start", phone: "0500000002", device: "آيفون" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.wa, "966511111111");
  assert.match(r.body.text, /^دخول مقصد [٠-٩]{4}$/);
  assert.equal(r.body.name, undefined, "name leaked");
  assert.equal(f.calls.length, 0, "nothing should be sent");
  const lr = T.login_requests[0];
  assert.equal(lr.channel, "office"); assert.equal(lr.channel_office, "o1"); assert.equal(lr.device, "آيفون");
  assert.notEqual(lr.poll_hash, r.body.poll, "poll stored in clear");
});

await test("v15 بداية الدخول مع رقم المنصة: الرسالة لرقم المنصة", async () => {
  const { T, f, h } = await boot((d) => d.app_secrets.push(
    { key: "PLATFORM_WA_PHONE_ID", value: "999" }, { key: "PLATFORM_WA_TOKEN", value: "EAP" }, { key: "PLATFORM_WA_NUMBER", value: "966599999999" }));
  const r = await call(h, { action: "login_start", phone: "966500000001" });
  assert.equal(r.status, 200);
  assert.equal(r.body.wa, "966599999999");
  assert.equal(T.login_requests[0].channel, "platform");
  assert.equal(f.calls.length, 0);
});

await test("v15 رقم غير مسجّل، ومكتب بلا واتساب مربوط", async () => {
  const { h } = await boot((d) => { d.offices[0].wa_token = null; });
  assert.equal((await call(h, { action: "login_start", phone: "0555555555" })).body.error, "not_registered");
  const r = await call(h, { action: "login_start", phone: "0500000009" });
  assert.equal(r.status, 409); assert.equal(r.body.error, "no_channel"); assert.equal(r.body.super, undefined, "admin phone leaked");
});

await test("v15 إرسال الرموز القديم أُلغي", async () => {
  const { f, h } = await boot();
  const r = await call(h, { action: "request_otp", phone: "0500000002" });
  assert.equal(r.status, 410); assert.equal(f.calls.length, 0);
});

await test("مكتب موقوف: لا رمز دخول ولا جلسة لموظفيه", async () => {
  const { h } = await boot();
  const r = await call(h, { action: "login_start", phone: "966500000003" });
  assert.equal(r.status, 403);
  const b = await call(h, { action: "bootstrap" }, "s3");
  assert.equal(b.status, 401);
  const ok = await call(h, { action: "me" }, "s2");
  assert.equal(ok.status, 200);
});

await test("تعديل مكتب بدون حقل التفعيل لا يعيد تفعيله", async () => {
  const { T, h } = await boot();
  let r = await call(h, { action: "office_save", office: { id: "o2", name: "مكتب موقوف", code: "OFF", license_no: "2200" } }, "sa");
  assert.equal(r.status, 200);
  assert.equal(T.offices.find((o) => o.id === "o2").active, false);
  assert.equal(T.offices.find((o) => o.id === "o2").wa_provider, "cloud", "default provider should be cloud");
  r = await call(h, { action: "office_save", office: { id: "o2", name: "مكتب موقوف", code: "OFF", license_no: "2200", active: true } }, "sa");
  assert.equal(T.offices.find((o) => o.id === "o2").active, true);
});

await test("التصدير الكامل يتجاوز حد ١٠٠٠ صف", async () => {
  const { T, h } = await boot();
  const r = await call(h, { action: "export" }, "s1");
  assert.equal(r.status, 200);
  assert.equal(r.body.customers.length, 2500);
  assert.equal(r.body.messages.length, 2100);
  assert.equal(T.privacy_requests[0].detail.customers, 2500);
  const a = await call(h, { action: "export" }, "s2");
  assert.equal(a.status, 403);
});

await test("رسالة الاختبار لمشغّل المنصة فقط", async () => {
  const { h } = await boot();
  const a = await call(h, { action: "test_whatsapp", to: "0551234567" }, "s2");
  assert.equal(a.status, 403);
  const s = await call(h, { action: "test_whatsapp", to: "0551234567" }, "sa");
  assert.equal(s.status, 200); assert.equal(s.body.ok, true);
});

await test("إيقاف موظف ينهي جلساته، والتعديل اللاحق لا يعيد تفعيله", async () => {
  const { T, h } = await boot();
  let r = await call(h, { action: "staff_save", staff: { id: "s2", office_id: "o1", name: "وسيط", phone: "966500000002", role: "agent", active: false } }, "sa");
  assert.equal(r.status, 200);
  assert.equal(T.staff.find((x) => x.id === "s2").active, false);
  assert.equal(T.sessions.filter((x) => x.staff_id === "s2").length, 0);
  r = await call(h, { action: "staff_save", staff: { id: "s2", office_id: "o1", name: "وسيط معدّل", phone: "966500000002", role: "agent" } }, "sa");
  assert.equal(T.staff.find((x) => x.id === "s2").active, false);
});

await test("رابط ميتا مثبّت على فرانكفورت، وحالة قالب الدخول تظهر للمشغّل", async () => {
  const { h } = await boot();
  const r = await call(h, { action: "settings_status" }, "sa");
  assert.ok(r.body.meta_webhook.endsWith("/wa-webhook?forceFunctionRegion=eu-central-1"), r.body.meta_webhook);
  assert.equal(r.body.login_platform, false);
  const o = await call(h, { action: "settings_status" }, "s1");
  assert.equal(o.body.meta_webhook, undefined);
});

await test("الرقم بأي صيغة: ٠٥… و5… و00966… كلها تُفهم", async () => {
  const { T, h } = await boot();
  for (const [i, ph] of [["1", "٠٥٠٠٠٠٠٠٠١"], ["2", "500000002"], ["9", "00966500000009"]].entries()) {
    const r = await call(h, { action: "login_start", phone: ph[1] });
    assert.equal(r.status, 200, ph[1] + " → " + r.status);
  }
  assert.equal(T.login_requests.length, 3);
});

await test("مفاتيح قالب الدخول يحفظها المشغّل فقط", async () => {
  const { T, h } = await boot();
  const a = await call(h, { action: "save_settings", settings: { otp_template: "x" } }, "s1");
  assert.equal(a.status, 403);
  const s = await call(h, { action: "save_settings", settings: { platform_wa_phone_id: " 123 456 ", platform_wa_token: "EAZ", otp_template: "Maqsad_Login" } }, "sa");
  assert.equal(s.status, 200);
  const v = Object.fromEntries(T.app_secrets.map((x) => [x.key, x.value]));
  assert.equal(v.PLATFORM_WA_PHONE_ID, "123456"); assert.equal(v.OTP_TEMPLATE, "maqsad_login"); assert.equal(v.PLATFORM_WA_TOKEN, "EAZ");
});


// ===================== v9 =====================
const withLeads = (d) => {
  d.customers.push(
    { id: "L1", office_id: "o1", name: "أبو خالد", phone: "966511111111", status: "qualified", mode: "manual",
      handoff_reason: "qualified", handed_at: new Date(Date.now() - 3600e3).toISOString(), outcome: null },
    { id: "L2", office_id: "o1", name: "سلطان", phone: "966522222222", status: "inquiry", mode: "auto" },
    { id: "X9", office_id: "o2", name: "عميل مكتب آخر", phone: "966533333333", status: "qualified", mode: "manual" });
};

await test("نتيجة الاتصال: الوسيط يسجّلها، وأول وقت اتصال يبقى ثابتاً", async () => {
  const { T, h } = await boot(withLeads);
  let r = await call(h, { action: "lead_outcome", id: "L1", outcome: "no_answer" }, "s2");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = T.customers.find((x) => x.id === "L1");
  assert.equal(c.outcome, "no_answer"); assert.equal(c.outcome_by, "s2");
  const first = c.first_outcome_at; assert.ok(first);
  assert.equal(r.body.lead.outcome_by_name, "وسيط");
  await new Promise((res) => setTimeout(res, 5));
  r = await call(h, { action: "lead_outcome", id: "L1", outcome: "viewing" }, "s2");
  assert.equal(c.outcome, "viewing"); assert.equal(c.first_outcome_at, first, "first contact time changed");
  const ev = T.events.filter((e) => e.kind === "outcome_set");
  assert.equal(ev.length, 2); assert.equal(ev[1].detail.from, "no_answer"); assert.equal(ev[1].detail.to, "viewing");
  const l = await call(h, { action: "lead", id: "L1" }, "s1");
  assert.equal(l.body.lead.outcome_by_name, "وسيط");
});

await test("نتيجة الاتصال: قيمة غريبة مرفوضة، وعميل مكتب آخر غير موجود، والمسح يرجعه للانتظار", async () => {
  const { T, h } = await boot(withLeads);
  let r = await call(h, { action: "lead_outcome", id: "L1", outcome: "maybe" }, "s2");
  assert.equal(r.status, 400);
  r = await call(h, { action: "lead_outcome", id: "X9", outcome: "deal" }, "s2");
  assert.equal(r.status, 404);
  assert.equal(T.customers.find((x) => x.id === "X9").outcome, undefined);
  await call(h, { action: "lead_outcome", id: "L1", outcome: "deal" }, "s1");
  r = await call(h, { action: "lead_outcome", id: "L1", outcome: null }, "s1");
  assert.equal(r.status, 200);
  const c = T.customers.find((x) => x.id === "L1");
  assert.equal(c.outcome, null); assert.equal(c.outcome_by, null); assert.ok(c.first_outcome_at, "history of first contact kept");
});

await test("استلام محادثة من البوت يسجّل سبب التسليم «taken»", async () => {
  const { T, h } = await boot(withLeads);
  const r = await call(h, { action: "set_mode", id: "L2", mode: "manual" }, "s2");
  assert.equal(r.status, 200);
  const c = T.customers.find((x) => x.id === "L2");
  assert.equal(c.mode, "manual"); assert.equal(c.handoff_reason, "taken"); assert.ok(c.handed_at);
  // المسلَّم أصلاً لا يتغير سبب تسليمه
  await call(h, { action: "set_mode", id: "L1", mode: "manual" }, "s2");
  assert.equal(T.customers.find((x) => x.id === "L1").handoff_reason, "qualified");
});

await test("ملخص الشهر: حدود الشهر بتوقيت الرياض، وديسمبر ينتقل للسنة الجديدة", async () => {
  const { T, h } = await boot((d) => { d.__month_stats = { new_customers: 7 }; });
  T.__month_stats = { new_customers: 7 };
  let r = await call(h, { action: "month_stats", month: "2026-02" }, "s2");
  assert.equal(r.status, 200); assert.equal(r.body.month, "2026-02"); assert.equal(r.body.stats.new_customers, 7);
  let a = T.__statsCalls.at(-1);
  assert.equal(a.p_office, "o1"); assert.equal(a.p_from, "2026-02-01T00:00:00+03:00"); assert.equal(a.p_to, "2026-03-01T00:00:00+03:00");
  await call(h, { action: "month_stats", month: "2026-12" }, "s2");
  a = T.__statsCalls.at(-1);
  assert.equal(a.p_to, "2027-01-01T00:00:00+03:00");
  r = await call(h, { action: "month_stats", month: "../../etc" }, "s2");
  assert.match(r.body.month, /^\d{4}-\d{2}$/);
});

await test("استهلاك المنصة: للمشغّل فقط، والتكلفة محسوبة صح", async () => {
  const { T, h } = await boot();
  T.__platform_usage = [
    { id: "o1", name: "مكتب الأفق", active: true, ai_in: 1000000, ai_cached: 400000, ai_out: 100000, otp_platform: 10, otp_office: 2,
      ai_calls: 500, new_customers: 40, qualified: 12, deals: 3, inbound: 900, errors: 1 },
    { id: "o2", name: "مكتب موقوف", active: false, ai_in: 0, ai_cached: 0, ai_out: 0, otp_platform: 0, otp_office: 0,
      ai_calls: 0, new_customers: 0, qualified: 0, deals: 0, inbound: 0, errors: 0 },
  ];
  const a = await call(h, { action: "platform_usage" }, "s1");
  assert.equal(a.status, 403);
  const r = await call(h, { action: "platform_usage", month: "2026-09" }, "sa");
  assert.equal(r.status, 200);
  const u = T.__usageCalls.at(-1);
  assert.equal(u.p_from, "2026-09-01"); assert.equal(u.p_to, "2026-10-01");
  const o1 = r.body.rows[0];
  // (600k × 0.15 + 400k × 0.075 + 100k × 0.60) / 1M = 0.18 ، ورموز الدخول 10 × 0.018 = 0.18
  assert.equal(o1.cost_ai_usd, 0.18); assert.equal(o1.cost_otp_usd, 0.18); assert.equal(o1.cost_usd, 0.36);
  assert.equal(r.body.totals.cost_usd, 0.36); assert.equal(r.body.totals.otp, 12); assert.equal(r.body.totals.active, 1);
  assert.equal(r.body.prices.usd_sar, 3.75);
});

await test("الأسعار التقديرية يعدّلها المشغّل فقط، والقيم الغلط مرفوضة", async () => {
  const { T, h } = await boot();
  const a = await call(h, { action: "save_settings", settings: { price_ai_in: "0.2" } }, "s1");
  assert.equal(a.status, 403);
  const bad = await call(h, { action: "save_settings", settings: { price_otp: "مجاني" } }, "sa");
  assert.equal(bad.status, 400);
  const s = await call(h, { action: "save_settings", settings: { price_ai_in: "0,2", price_otp: "0.02" } }, "sa");
  assert.equal(s.status, 200);
  const v = Object.fromEntries(T.app_secrets.map((x) => [x.key, x.value]));
  assert.equal(v.PRICE_AI_IN, "0.2"); assert.equal(v.PRICE_OTP, "0.02"); assert.match(v.PRICES_UPDATED, /^\d{4}-\d{2}-\d{2}$/);
});

await test("v15 رقم المنصة يحفظه المشغّل ويُفحص", async () => {
  const { T, h } = await boot();
  assert.equal((await call(h, { action: "save_settings", settings: { platform_wa_number: "0599999999" } }, "s1")).status, 403);
  assert.equal((await call(h, { action: "save_settings", settings: { platform_wa_number: "0599" } }, "sa")).status, 400);
  const s = await call(h, { action: "save_settings", settings: { platform_wa_number: "0599999999" } }, "sa");
  assert.equal(s.status, 200);
  assert.equal(T.app_secrets.find((x) => x.key === "PLATFORM_WA_NUMBER").value, "966599999999");
});

await test("حالة العقار: مؤجّر ومباع ومحجوز تُحفظ، وأي قيمة ثانية ترجع «متاح»", async () => {
  const { T, h } = await boot();
  for (const st of ["rented", "sold", "reserved"]) {
    const r = await call(h, { action: "property_save", property: { title: "شقة " + st, city: "الرياض", district: "النرجس", state: st } }, "s2");
    assert.equal(r.status, 200); assert.equal(r.body.property.state, st);
  }
  const r = await call(h, { action: "property_save", property: { title: "شقة", city: "الرياض", district: "النرجس", state: "hacked" } }, "s2");
  assert.equal(r.body.property.state, "available");
});

await test("التصدير يحمل نتيجة الاتصال وسبب التسليم", async () => {
  const { h } = await boot(withLeads);
  await call(h, { action: "lead_outcome", id: "L1", outcome: "deal" }, "s2");
  const r = await call(h, { action: "export" }, "s1");
  const c = r.body.customers.find((x) => x.id === "L1");
  assert.equal(c.outcome, "deal"); assert.equal(c.handoff_reason, "qualified");
});


// ===== v10: حماية أرقام الموظفين =====
await test("رقم الموظف: الناقص أو السعودي الغلط مرفوض برسالة واضحة، والصحيح يُحفظ موحّداً", async () => {
  const { T, h } = await boot();
  let r = await call(h, { action: "staff_save", staff: { name: "ناقص", phone: "05011123", role: "agent" } }, "sa");
  assert.equal(r.status, 400); assert.match(r.body.error, /05/);
  r = await call(h, { action: "staff_save", staff: { name: "زايد", phone: "96650111234", role: "agent" } }, "sa");
  assert.equal(r.status, 400); assert.match(r.body.error, /سعودي/);
  r = await call(h, { action: "staff_save", staff: { name: "صح", phone: "٠٥٠١١١٢٣٤٥", role: "agent" } }, "sa");
  assert.equal(r.status, 200); assert.equal(r.body.staff.phone, "966501112345");
  r = await call(h, { action: "staff_save", staff: { name: "دولي", phone: "+44 7911 123456", role: "agent" } }, "sa");
  assert.equal(r.status, 200); assert.equal(r.body.staff.phone, "447911123456");
  assert.equal(T.staff.filter((x) => x.name === "ناقص" || x.name === "زايد").length, 0);
});

await test("تصحيح رقم موظف يُسجَّل (آخر ٤ أرقام فقط)، وحساب المشغّل ما يُعدّل من هنا", async () => {
  const { T, h } = await boot();
  let r = await call(h, { action: "staff_save", staff: { id: "s2", office_id: "o1", name: "وسيط", phone: "0501114567", role: "agent" } }, "sa");
  assert.equal(r.status, 200);
  assert.equal(T.staff.find((x) => x.id === "s2").phone, "966501114567");
  const ev = T.events.find((e) => e.kind === "staff_phone_changed");
  assert.ok(ev && ev.detail.from_last4 === "0002" && ev.detail.to_last4 === "4567", JSON.stringify(ev));
  assert.ok(!JSON.stringify(ev.detail).includes("966501114567"), "full number stored in event");
  r = await call(h, { action: "staff_save", staff: { id: "sa", office_id: "o1", name: "x", phone: "0500000009", role: "agent" } }, "sa");
  assert.equal(r.status, 403);
  assert.equal(T.staff.find((x) => x.id === "sa").role, "super_admin");
});

await test("حذف موظف ما دخل أبداً ينجح، ومن دخل يُرفض (يُوقف بدل الحذف)", async () => {
  const { T, h } = await boot((d) => {
    d.staff.push({ id: "s4", office_id: "o1", name: "رقم غلط", phone: "966501112345", role: "agent", active: true });
    // وصله رمز على الرقم الغلط لكنه ما دخل — هذا ما يمنع الحذف
    d.login_audit.push({ id: 9, phone: "966501112345", ok: true, reason: "otp_sent", staff_id: "s4" });
    d.staff.find((x) => x.id === "s1").last_login_at = "2026-09-20T10:00:00Z";
  });
  let r = await call(h, { action: "staff_delete", id: "s4" }, "s1");
  assert.equal(r.status, 403, "owner cannot delete");
  r = await call(h, { action: "staff_delete", id: "s4" }, "sa");
  assert.equal(r.status, 200);
  assert.equal(T.staff.find((x) => x.id === "s4"), undefined);
  const ev = T.events.find((e) => e.kind === "staff_deleted");
  assert.ok(ev && ev.detail.last4 === "2345" && ev.detail.name === "رقم غلط");
  r = await call(h, { action: "staff_delete", id: "s1" }, "sa");
  assert.equal(r.status, 409); assert.match(r.body.error, /أوقفه/);
  assert.ok(T.staff.find((x) => x.id === "s1"));
  r = await call(h, { action: "staff_delete", id: "sa" }, "sa");
  assert.equal(r.status, 403);
});

await test("موظف سجّل نتيجة اتصال أو له دخول ناجح في السجل ما يُحذف حتى لو ما عنده وقت دخول", async () => {
  const { T, h } = await boot((d) => {
    d.customers[0].outcome_by = "s2";
    d.login_audit.push({ id: 1, phone: "966500000001", ok: true, reason: "login_ok", staff_id: "s1" });
  });
  let r = await call(h, { action: "staff_delete", id: "s2" }, "sa");
  assert.equal(r.status, 409);
  r = await call(h, { action: "staff_delete", id: "s1" }, "sa");
  assert.equal(r.status, 409);
  assert.equal(T.staff.length, 4);
});

await test("v15 رمز المدير لمرة وحدة يدخّل الموظف ويسجّل وقت آخر دخول، وقائمة الموظفين تعرضه", async () => {
  const { T, f, h } = await boot();
  const c = await call(h, { action: "staff_code", id: "s2" }, "sa");
  assert.equal(c.status, 200); assert.match(c.body.code, /^\d{6}$/);
  assert.equal(f.calls.length, 0, "code is handed over by phone, not sent");
  const v = await call(h, { action: "verify_otp", phone: "0500000002", code: c.body.code });
  assert.equal(v.status, 200);
  assert.ok(T.staff.find((x) => x.id === "s2").last_login_at, "last_login_at not set");
  const l = await call(h, { action: "staff_list" }, "sa");
  const s2 = l.body.staff.find((x) => x.id === "s2");
  assert.ok(s2.last_login_at);
});

await test("رقم واتساب المكتب الغلط مرفوض عند حفظ المكتب", async () => {
  const { T, h } = await boot();
  const r = await call(h, { action: "office_save", office: { id: "o1", name: "مكتب الأفق", code: "UFQ", license_no: "1100", wa_number: "05011123" } }, "sa");
  assert.equal(r.status, 400); assert.match(r.body.error, /رقم واتساب المكتب/);
  const ok = await call(h, { action: "office_save", office: { id: "o1", name: "مكتب الأفق", code: "UFQ", license_no: "1100", wa_number: "0501114567" } }, "sa");
  assert.equal(ok.status, 200);
  assert.equal(T.offices.find((x) => x.id === "o1").wa_number, "966501114567");
});

// ===== v11: رخصة فال =====
const PNG = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3000, 7)]).toString("base64");
const JPG = "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 9)]).toString("base64");
const riyadh = (d = 0) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const OK_CHECKS = { active: true, name: true, expiry: true };
async function bootFal(mut) {
  const r = await boot(mut);
  const store = new Map();
  r.T.__store = store;
  globalThis.__db.storage = {
    from: (bucket) => ({
      upload: async (path, bytes, opts) => { store.set(bucket + "/" + path, { bytes, type: opts?.contentType }); return { error: null }; },
      createSignedUrl: async (path, secs) => store.has(bucket + "/" + path)
        ? { data: { signedUrl: `https://signed/${bucket}/${path}?e=${secs}` }, error: null }
        : { data: null, error: { message: "missing" } },
    }),
  };
  // مكتب الأفق فيه مجموعة تيليجرام، وعقار مرخّص إعلانه ساري
  const o1 = r.T.offices.find((o) => o.id === "o1"); o1.telegram_chat_id = "-100";
  r.T.properties.push({ id: "P1", office_id: "o1", title: "شقة", district: "النرجس", state: "available",
    ad_license_no: "7200000001", ad_license_expiry: riyadh(90) });
  return r;
}
const tgTo = (f, chat) => f.calls.filter((c) => c.url.includes("api.telegram.org") && c.body?.chat_id === chat);
const verifyBody = (extra = {}) => ({ action: "fal_verify", office_id: "o1", license_no: "1100",
  holder_name: "مؤسسة الأفق للعقار", expires_on: riyadh(200), checks: OK_CHECKS, image: PNG, ...extra });

await test("فال: المكتب الجديد «بانتظار التحقق»، وعقاراته محجوبة عن العرض بسببه", async () => {
  const { h } = await bootFal();
  const r = await call(h, { action: "bootstrap" }, "s1");
  assert.equal(r.body.office.fal.state, "pending");
  const p = r.body.properties.find((x) => x.id === "P1");
  assert.equal(p.listable, false); assert.match(p.block_reason, /فال/);
});

await test("فال: التحقق للمشغّل فقط، والثلاثة والتاريخ والصورة كلها شرط", async () => {
  const { T, h } = await bootFal();
  let r = await call(h, verifyBody(), "s1");
  assert.equal(r.status, 403);
  r = await call(h, verifyBody({ checks: { active: true, name: true } }), "sa");
  assert.equal(r.status, 400); assert.match(r.body.error, /الثلاثة/);
  r = await call(h, verifyBody({ expires_on: riyadh(-1) }), "sa");
  assert.equal(r.status, 400); assert.match(r.body.error, /منتهية/);
  r = await call(h, verifyBody({ expires_on: "2026-02-30" }), "sa");
  assert.equal(r.status, 400);
  r = await call(h, verifyBody({ expires_on: riyadh(6 * 366) }), "sa");
  assert.equal(r.status, 400); assert.match(r.body.error, /بعيد/);
  r = await call(h, verifyBody({ holder_name: " " }), "sa");
  assert.equal(r.status, 400);
  r = await call(h, verifyBody({ image: "data:image/png;base64," + Buffer.from("<svg onload=x>".repeat(200)).toString("base64") }), "sa");
  assert.equal(r.status, 400); assert.match(r.body.error, /مو صورة/);
  r = await call(h, verifyBody({ image: undefined }), "sa");
  assert.equal(r.status, 400);
  r = await call(h, verifyBody({ license_no: "9999" }), "sa");
  assert.equal(r.status, 409);
  assert.equal(T.offices.find((o) => o.id === "o1").fal_status, undefined, "status changed on failure");
  assert.equal(T.__store.size, 0, "proof stored on failure");
});

await test("فال: «تم التحقق» يحفظ التاريخ والاسم والصورة، ويسجّل من تحقق، ويشغّل عرض العقارات", async () => {
  const { T, f, h } = await bootFal();
  const exp = riyadh(200);
  const r = await call(h, verifyBody({ expires_on: exp, image: JPG }), "sa");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const o = T.offices.find((x) => x.id === "o1");
  assert.equal(o.fal_status, "verified"); assert.equal(o.fal_expires_on, exp);
  assert.equal(o.fal_holder_name, "مؤسسة الأفق للعقار"); assert.equal(o.fal_verified_by, "sa");
  assert.match(o.fal_proof_path, /^o1\/.+\.jpg$/);
  const saved = T.__store.get("fal-proofs/" + o.fal_proof_path);
  assert.ok(saved && saved.type === "image/jpeg" && saved.bytes.length > 3000);
  assert.equal(T.fal_checks.length, 1);
  assert.deepEqual(T.fal_checks[0].checks, OK_CHECKS); assert.equal(T.fal_checks[0].result, "verified");
  assert.ok(T.events.some((e) => e.kind === "fal_verified" && e.detail.expires_on === exp));
  assert.equal(r.body.fal.state, "ok"); assert.equal(r.body.fal.days_left, 200);
  assert.equal(r.body.offices.find((x) => x.id === "o1").fal.state, "ok");
  assert.equal(r.body.offices[0].fal_proof_path, undefined, "raw proof path leaked in list");
  const msg = tgTo(f, "-100");
  assert.equal(msg.length, 1); assert.match(msg[0].body.text, /تحققنا/);
  const b = await call(h, { action: "bootstrap" }, "s1");
  assert.equal(b.body.office.fal.state, "ok");
  assert.equal(b.body.properties.find((x) => x.id === "P1").listable, true);
});

await test("فال: نفس الرخصة ما تُعتمد لمكتبين (حتى لو كُتبت بأرقام عربية)", async () => {
  const { T, h } = await bootFal((d) => {
    d.offices.push({ id: "o3", name: "مكتب ثالث", code: "THR", license_no: "١١٠٠", active: true, msg_quota: 15 });
  });
  let r = await call(h, verifyBody(), "sa");
  assert.equal(r.status, 200);
  r = await call(h, verifyBody({ office_id: "o3", license_no: "١١٠٠" }), "sa");
  assert.equal(r.status, 409); assert.match(r.body.error, /مكتب الأفق/);
  assert.notEqual(T.offices.find((o) => o.id === "o3").fal_status, "verified");
});

await test("فال: تغيير رقم الرخصة يرجّعها «بانتظار التحقق»، ونفس الرقم بأرقام عربية ما يغيّر شي", async () => {
  const { T, h } = await bootFal();
  await call(h, verifyBody(), "sa");
  let r = await call(h, { action: "office_save", office: { id: "o1", name: "مكتب الأفق", code: "UFQ", license_no: "١١٠٠" } }, "sa");
  assert.equal(r.status, 200);
  const o = T.offices.find((x) => x.id === "o1");
  assert.equal(o.license_no, "1100"); assert.equal(o.fal_status, "verified");
  r = await call(h, { action: "office_save", office: { id: "o1", name: "مكتب الأفق", code: "UFQ", license_no: "1200" } }, "sa");
  assert.equal(o.fal_status, "pending"); assert.equal(o.fal_verified_at, null);
  const ev = T.events.find((e) => e.kind === "fal_reset");
  assert.ok(ev && ev.detail.from === "1100" && ev.detail.to === "1200");
  assert.equal(r.body.offices.find((x) => x.id === "o1").fal.state, "pending");
});

await test("فال: الرفض يحتاج سبب، يوقف المكتب، ويوصل السبب للمكتب", async () => {
  const { T, f, h } = await bootFal();
  await call(h, verifyBody(), "sa");
  let r = await call(h, { action: "fal_reject", office_id: "o1", note: "" }, "sa");
  assert.equal(r.status, 400);
  r = await call(h, { action: "fal_reject", office_id: "o1", note: "الرخصة موقوفة في الهيئة", image: PNG }, "s1");
  assert.equal(r.status, 403);
  r = await call(h, { action: "fal_reject", office_id: "o1", note: "الرخصة موقوفة في الهيئة", image: PNG }, "sa");
  assert.equal(r.status, 200);
  const o = T.offices.find((x) => x.id === "o1");
  assert.equal(o.fal_status, "rejected"); assert.equal(o.fal_verified_at, null); assert.match(o.fal_proof_path, /\.png$/);
  assert.equal(r.body.fal.state, "rejected"); assert.equal(r.body.fal.note, "الرخصة موقوفة في الهيئة");
  assert.equal(T.fal_checks.at(-1).result, "rejected");
  assert.match(tgTo(f, "-100").at(-1).body.text, /الرخصة موقوفة في الهيئة/);
  const b = await call(h, { action: "bootstrap" }, "s1");
  assert.equal(b.body.office.fal.state, "rejected");
  assert.equal(b.body.properties.find((x) => x.id === "P1").listable, false);
});

await test("فال: الرخصة المنتهية تحجب العرض، والصورة تُفتح برابط مؤقت للمشغّل فقط", async () => {
  const { T, h } = await bootFal();
  await call(h, verifyBody(), "sa");
  const o = T.offices.find((x) => x.id === "o1");
  o.fal_expires_on = riyadh(-3);        // مرّت الأيام ولا جدّد المكتب
  const b = await call(h, { action: "bootstrap" }, "s2");
  assert.equal(b.body.office.fal.state, "expired"); assert.equal(b.body.office.fal.days_left, -3);
  const p = b.body.properties.find((x) => x.id === "P1");
  assert.equal(p.listable, false); assert.match(p.block_reason, /منتهية/);
  let r = await call(h, { action: "fal_proof", office_id: "o1" }, "s1");
  assert.equal(r.status, 403);
  r = await call(h, { action: "fal_proof", office_id: "o1" }, "sa");
  assert.equal(r.status, 200); assert.match(r.body.url, /^https:\/\/signed\/fal-proofs\/o1\/.+\?e=300$/);
  r = await call(h, { action: "fal_proof", office_id: "o1", check_id: T.fal_checks[0].id }, "sa");
  assert.equal(r.status, 200);
  r = await call(h, { action: "fal_proof", office_id: "o1", check_id: 99999 }, "sa");
  assert.equal(r.status, 404);
  const g = await call(h, { action: "fal_get", office_id: "o1" }, "sa");
  assert.equal(g.body.history.length, 1); assert.equal(g.body.history[0].by, "المشغّل");
  assert.equal(g.body.history[0].has_proof, true); assert.equal(g.body.history[0].proof_path, undefined);
  assert.equal(g.body.license_no, "1100");
});

// ---------- التنبيهات ----------
const DEV = { endpoint: "https://fcm.googleapis.com/fcm/send/dev-s2",
  keys: { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" } };

await test("التنبيهات: الحالة تولّد مفتاح الإشعارات مرة وحدة وترجع العام فقط", async () => {
  const { T, h } = await boot();
  const r = await call(h, { action: "settings_status" }, "s2");
  assert.equal(r.status, 200);
  const n = r.body.notify;
  assert.equal(n.telegram, true); assert.equal(n.push, true); assert.equal(n.tg_linked, false);
  assert.equal(n.can_edit, false, "الوسيط ما يغيّر القنوات");
  assert.equal(n.push_key.length, 87);
  assert.ok(!JSON.stringify(r.body).includes('"d"'), "المفتاح الخاص تسرّب");
  const k = T.app_secrets.filter((x) => x.key === "VAPID_KEYS");
  assert.equal(k.length, 1);
  const r2 = await call(h, { action: "settings_status" }, "s1");
  assert.equal(r2.body.notify.push_key, n.push_key, "المفتاح تغيّر");
  assert.equal(r2.body.notify.can_edit, true);
});

await test("التنبيهات: صاحب المكتب يختار، ووحدة على الأقل، والوسيط ممنوع", async () => {
  const { T, h } = await boot();
  assert.equal((await call(h, { action: "notify_save", telegram: false, push: true }, "s2")).status, 403);
  assert.equal((await call(h, { action: "notify_save", telegram: false, push: false }, "s1")).status, 400);
  const r = await call(h, { action: "notify_save", telegram: false, push: true }, "s1");
  assert.equal(r.status, 200);
  assert.equal(T.offices[0].notify_telegram, false); assert.equal(T.offices[0].notify_push, true);
  assert.equal(r.body.notify.telegram, false);
});

await test("تيليجرام: رابط الربط برمز جديد كل مرة، والحالة، وفك الربط يشغّل الجوال", async () => {
  const { T, h } = await boot((d) => { d.offices[0].notify_telegram = false; });
  assert.equal((await call(h, { action: "tg_link" }, "s2")).status, 403);
  const a = await call(h, { action: "tg_link" }, "s1");
  const b = await call(h, { action: "tg_link" }, "s1");
  assert.match(a.body.code, /^[A-HJ-NP-Z2-9]{12}$/); assert.notEqual(a.body.code, b.body.code);
  assert.equal(b.body.private, "https://t.me/Maqsad_saBot?start=" + b.body.code);
  assert.equal(b.body.group, "https://t.me/Maqsad_saBot?startgroup=" + b.body.code);
  assert.equal(T.offices[0].tg_link_code, b.body.code); assert.equal(T.offices[0].notify_telegram, true);
  assert.deepEqual((await call(h, { action: "tg_status" }, "s2")).body, { linked: false, waiting: true });
  T.offices[0].telegram_chat_id = "-100777"; T.offices[0].tg_link_code = null;   // البوت ربط
  assert.equal((await call(h, { action: "tg_status" }, "s2")).body.linked, true);
  assert.equal((await call(h, { action: "tg_test" }, "s2")).status, 200);
  T.offices[0].notify_push = false;
  assert.equal((await call(h, { action: "tg_unlink" }, "s1")).status, 200);
  assert.equal(T.offices[0].telegram_chat_id, null); assert.equal(T.offices[0].notify_push, true);
  assert.equal((await call(h, { action: "tg_test" }, "s1")).status, 400);
});

await test("إشعارات الجوال: تفعيل الجهاز، رفض العناوين الغريبة، التجربة، والإيقاف عند الخروج", async () => {
  const { T, f, h } = await boot();
  assert.equal((await call(h, { action: "push_subscribe", sub: { ...DEV, endpoint: "https://evil.example/x" } }, "s2")).status, 400);
  assert.equal((await call(h, { action: "push_subscribe", sub: { ...DEV, keys: { p256dh: "x", auth: "y" } } }, "s2")).status, 400);
  assert.equal((await call(h, { action: "push_subscribe", sub: DEV, device: "Android" }, "s2")).status, 200);
  assert.equal((await call(h, { action: "push_subscribe", sub: DEV, device: "Android" }, "s2")).status, 200);
  assert.equal(T.push_subs.length, 1, "نفس الجهاز انضاف مرتين");
  assert.equal(T.push_subs[0].office_id, "o1"); assert.equal(T.push_subs[0].staff_id, "s2");
  await call(h, { action: "settings_status" }, "s2");                         // يولّد المفاتيح
  const t = await call(h, { action: "push_test", endpoint: DEV.endpoint }, "s2");
  assert.equal(t.status, 200, JSON.stringify(t.body));
  assert.equal(f.calls.filter((c) => c.url === DEV.endpoint).length, 1);
  assert.equal((await call(h, { action: "push_test", endpoint: DEV.endpoint }, "s1")).status, 404, "جوال غيره");
  const st = await call(h, { action: "settings_status" }, "s2");
  assert.equal(st.body.notify.devices, 1); assert.equal(st.body.notify.my_devices, 1);
  await call(h, { action: "logout", endpoint: DEV.endpoint }, "s2");
  assert.equal(T.push_subs.length, 0, "جهاز الموظف بقي بعد خروجه");
});

await test("إيقاف موظف يحذف أجهزته من التنبيهات", async () => {
  const { T, h } = await boot();
  await call(h, { action: "push_subscribe", sub: DEV }, "s2");
  const r = await call(h, { action: "staff_save", staff: { id: "s2", name: "وسيط", phone: "966500000002", role: "agent", active: false } }, "sa");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(T.push_subs.length, 0);
});

// ===== v13: لوحة المدير · طلب تعديل الرخصة · خطوات أول دخول =====
await test("v13: جلسة المدير تنتهي بعد ٧ أيام من إنشائها، وجلسة المكتب تبقى", async () => {
  const old = new Date(Date.now() - 8 * 864e5).toISOString();
  const { h } = await boot((d) => { for (const x of d.sessions) x.created_at = old; });
  assert.equal((await call(h, { action: "me" }, "sa")).status, 401);
  assert.equal((await call(h, { action: "me" }, "s1")).status, 200);
});

await test("v15: دخول المدير مدته ٧ أيام، والموظف ٩٠", async () => {
  const { T, h } = await boot((d) => { d.otps = [{ phone: "966500000009", code_hash: H("123456"),
    expires_at: future, attempts: 0 }, { phone: "966500000001", code_hash: H("654321"), expires_at: future, attempts: 0 }]; });
  const a = await call(h, { action: "verify_otp", phone: "0500000009", code: "123456" });
  const b = await call(h, { action: "verify_otp", phone: "0500000001", code: "654321" });
  assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(b.status, 200);
  const days = (id) => Math.round((new Date(T.sessions.filter((x) => x.staff_id === id).at(-1).expires_at) - Date.now()) / 864e5);
  assert.equal(days("sa"), 7); assert.equal(days("s1"), 90);
});

await test("v13: تعديل المدير يُسجّل (أسماء الحقول بلا قيم)، وتعديل المكتب لنفسه لا", async () => {
  const { T, h } = await boot();
  let r = await call(h, { action: "office_save", office: { id: "o1", name: "مكتب الأفق", code: "UFQ", license_no: "1100", wa_token: "SECRET-XYZ" } }, "sa");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const log = T.events.filter((e) => e.kind === "admin_action");
  assert.equal(log.length, 1);
  assert.equal(log[0].detail.label, "بيانات المكتب");
  assert.deepEqual(log[0].detail.fields, ["wa_token"], "بس الحقل اللي تغيّر فعلاً");
  assert.ok(!JSON.stringify(log[0]).includes("SECRET-XYZ"), "قيمة سرية في السجل");
  await call(h, { action: "notify_save", telegram: true, push: true }, "s1");
  assert.equal(T.events.filter((e) => e.kind === "admin_action").length, 1);
  r = await call(h, { action: "admin_log" }, "sa");
  assert.equal(r.body.log.length, 1);
  assert.equal((await call(h, { action: "admin_log" }, "s1")).status, 403);
});

await test("v13: إعدادات المنصة — نموذج الذكاء من قائمة محددة فقط", async () => {
  const { T, h } = await boot();
  assert.equal((await call(h, { action: "platform_save", ai_model: "gpt-9-evil" }, "sa")).status, 400);
  assert.equal((await call(h, { action: "platform_save", ai_model: "gpt-6-luna", ai_reasoning: "medium" }, "sa")).status, 200);
  assert.equal(T.app_secrets.find((x) => x.key === "AI_MODEL").value, "gpt-6-luna");
  assert.equal(T.app_secrets.find((x) => x.key === "AI_REASONING").value, "medium");
  assert.equal((await call(h, { action: "platform_save", ai_model: "gpt-4o-mini" }, "s1")).status, 403);
  const pl = T.events.filter((e) => e.kind === "admin_action").at(-1);
  assert.equal(pl.office_id, null); assert.equal(pl.detail.office, null);
  const st = await call(h, { action: "settings_status" }, "sa");
  assert.equal(st.body.ai_model, "gpt-6-luna");
});

await test("v13: تشغيل الصوتيات لمكتب من شاشة التعديل", async () => {
  const { T, h } = await boot((d) => d.app_secrets.push({ key: "VOICE_OFFICES", value: "OTHER" }));
  let r = await call(h, { action: "office_save", office: { id: "o1", name: "مكتب الأفق", code: "UFQ", license_no: "1100", voice: true } }, "sa");
  assert.equal(T.app_secrets.find((x) => x.key === "VOICE_OFFICES").value, "OTHER,UFQ");
  assert.equal(r.body.offices.find((o) => o.id === "o1").voice, true);
  r = await call(h, { action: "office_save", office: { id: "o1", name: "مكتب الأفق", code: "UFQ", license_no: "1100", voice: false } }, "sa");
  assert.equal(T.app_secrets.find((x) => x.key === "VOICE_OFFICES").value, "OTHER");
});

await test("v13: تحويل طلب انضمام لمكتب ينقل صورة الرخصة للمكتب", async () => {
  const { T, h } = await bootFal((d) => d.signup_requests = [{ id: 7, office_name: "مكتب جديد", contact_name: "خالد", phone: "966551234567",
    fal_license: "3300", status: "new", fal_proof_path: "signups/x.jpg", created_at: future }]);
  T.__store.set("fal-proofs/signups/x.jpg", {});
  const l = await call(h, { action: "signup_list" }, "sa");
  assert.equal(l.body.requests[0].has_proof, true); assert.equal(l.body.requests[0].fal_proof_path, undefined);
  const u = await call(h, { action: "signup_proof", signup_id: 7 }, "sa");
  assert.match(u.body.url, /signups\/x\.jpg/);
  const r = await call(h, { action: "office_save", office: { name: "مكتب جديد", code: "NEW", license_no: "3300", from_signup: 7 } }, "sa");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const o = T.offices.find((x) => x.code === "NEW");
  assert.equal(o.fal_signup_proof, "signups/x.jpg");
  assert.equal(r.body.offices.find((x) => x.code === "NEW").has_signup_proof, true);
  assert.equal((await call(h, { action: "signup_proof", signup_id: 7 }, "s1")).status, 403);
});

await test("v13: صاحب المكتب يطلب تعديل الرخصة بصورة، وما يقدر يغيّر الرقم بنفسه", async () => {
  const { T, h, f } = await bootFal();
  assert.equal((await call(h, { action: "office_save", office: { id: "o1", name: "x", code: "UFQ", license_no: "9999" } }, "s1")).status, 403);
  assert.equal((await call(h, { action: "fal_request", file: JPG, note: "جددت الرخصة" }, "s2")).status, 403);
  const r = await call(h, { action: "fal_request", file: JPG, note: "جددت الرخصة" }, "s1");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const o1 = T.offices.find((o) => o.id === "o1");
  assert.equal(o1.license_no, "1100");
  assert.match(o1.fal_request.path, /^requests\/o1\/.+\.jpg$/);
  assert.ok(f.calls.some((c) => c.url.includes("api.telegram.org") && /طلب تعديل رخصة/.test(c.body?.text || "")));
  const me = await call(h, { action: "me" }, "s1");
  assert.equal(me.body.office.fal_request.note, "جددت الرخصة");
  const lst = await call(h, { action: "offices_list" }, "sa");
  assert.equal(lst.body.offices.find((o) => o.id === "o1").fal_request.note, "جددت الرخصة");
  assert.equal((await call(h, { action: "signup_proof", office_id: "o1", kind: "request" }, "sa")).status, 200);
  await call(h, { action: "fal_request_close", office_id: "o1" }, "sa");
  assert.equal(T.offices.find((o) => o.id === "o1").fal_request, null);
});

await test("v13: خطوات أول دخول — تُحفظ الخطوات وينتهي بإنهائها", async () => {
  const { T, h } = await boot();
  let me = await call(h, { action: "me" }, "s1");
  assert.equal(me.body.office.onboarded, false);
  await call(h, { action: "onboarding_save", done: ["office", "notify", "hack"] }, "s1");
  const o1 = T.offices.find((o) => o.id === "o1");
  assert.deepEqual(Object.keys(o1.onboarding).sort(), ["notify", "office"]);
  assert.equal((await call(h, { action: "onboarding_save", finish: true }, "s2")).status, 403);
  await call(h, { action: "onboarding_save", finish: true }, "s1");
  me = await call(h, { action: "me" }, "s1");
  assert.equal(me.body.office.onboarded, true);
});

await test("v13: صاحب المكتب يضيف وسيط لمكتبه فقط، وما يرقّي أحد ولا يعدّل صاحب ثاني", async () => {
  const { T, h } = await boot();
  let r = await call(h, { action: "staff_save", staff: { name: "سعد", phone: "0551112222", role: "owner", office_id: "o2" } }, "s1");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const n = T.staff.find((x) => x.phone === "966551112222");
  assert.equal(n.role, "agent"); assert.equal(n.office_id, "o1");
  r = await call(h, { action: "staff_save", staff: { id: "s1", name: "صاحب", phone: "966500000001", role: "agent" } }, "s1");
  assert.equal(r.status, 403);
  r = await call(h, { action: "staff_save", staff: { id: "s3", name: "x", phone: "966500000003" } }, "s1");
  assert.equal(r.status, 403);
  r = await call(h, { action: "staff_save", staff: { id: n.id, name: "سعد", phone: "0551112222", active: false } }, "s1");
  assert.equal(r.status, 200); assert.equal(T.staff.find((x) => x.id === n.id).active, false);
  assert.equal((await call(h, { action: "staff_save", staff: { name: "x", phone: "0551113333" } }, "s2")).status, 403);
});

await test("v14: عقار جديد يرجّع عدد العملاء السابقين المطابقين، وقائمتهم للمكتب نفسه فقط", async () => {
  const { T, h } = await boot((d) => { d.offices[1].active = true; d.__custMatches = [{ id: "c1", name: "عميل 1", phone: "966500000011", score: 60 }]; });
  let r = await call(h, { action: "property_save", property: { title: "شقة", city: "الرياض", district: "النرجس", price: 42000, deal_type: "إيجار", property_type: "شقة" } }, "s2");
  assert.equal(r.status, 200); assert.equal(r.body.matches, 1);
  const pid = r.body.property.id;
  assert.equal(T.__custCalls[0].p_office, "o1"); assert.equal(T.__custCalls[0].p_days, 30);
  r = await call(h, { action: "prop_matches", id: pid }, "s2");
  assert.equal(r.status, 200); assert.equal(r.body.customers.length, 1); assert.equal(r.body.days, 30);
  assert.ok(T.events.some((e) => e.kind === "prop_matches" && e.detail.n === 1));
  // مكتب ثاني ما يشوف عقار غيره
  r = await call(h, { action: "prop_matches", id: pid }, "s3");
  assert.equal(r.status, 404);
  // تعديل عقار قائم ما يعيد البحث
  const before = T.__custCalls.length;
  r = await call(h, { action: "property_save", property: { id: pid, title: "شقة", district: "النرجس", price: 41000 } }, "s2");
  assert.equal(r.body.matches, 0); assert.equal(T.__custCalls.length, before);
});

await test("v14: موافقة صاحب المكتب على الشروط تُحفظ بالنسخة والتاريخ، والوسيط والمدير ما يوافقون عنه", async () => {
  const { T, h } = await boot();
  let me = await call(h, { action: "me" }, "s1");
  assert.equal(me.body.office.terms.ok, false);
  const v = me.body.office.terms.version;
  assert.equal((await call(h, { action: "terms_accept", version: v }, "s2")).status, 403);
  assert.equal((await call(h, { action: "terms_accept", version: v, office_id: "o1" }, "sa")).status, 403);
  assert.equal((await call(h, { action: "terms_accept", version: "old" }, "s1")).status, 409);
  const r = await call(h, { action: "terms_accept", version: v }, "s1");
  assert.equal(r.status, 200);
  const o1 = T.offices.find((o) => o.id === "o1");
  assert.equal(o1.terms_version, v); assert.equal(o1.terms_accepted_by, "s1"); assert.ok(o1.terms_accepted_at);
  me = await call(h, { action: "me" }, "s2");
  assert.equal(me.body.office.terms.ok, true);
  assert.ok(T.events.some((e) => e.kind === "terms_accepted" && e.detail.version === v));
});


await test("v16 العقار الجديد بلا مدينة يُرفض، وبمدينة يُحفظ، و«بيع» تُحفظ «شراء»، و«حي» تُشال", async () => {
  const { T, h } = await boot();
  let r = await call(h, { action: "property_save", property: { title: "فيلا", district: "حطين", price: 2e6, deal_type: "بيع", property_type: "فيلا" } }, "s2");
  assert.equal(r.status, 400); assert.equal(r.body.error, "المدينة مطلوبة");
  r = await call(h, { action: "property_save", property: { title: "فيلا", city: " الطائف ", district: "حي المنتزه", price: 2e6, deal_type: "بيع", property_type: "فيلا" } }, "s2");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = T.properties.at(-1);
  assert.equal(p.city, "الطائف"); assert.equal(p.district, "المنتزه"); assert.equal(p.deal_type, "شراء");
  // تعديل من نسخة تطبيق قديمة بلا مدينة: المدينة المحفوظة تبقى
  r = await call(h, { action: "property_save", property: { id: p.id, title: "فيلا", district: "المنتزه", price: 1.9e6, deal_type: "شراء", property_type: "فيلا" } }, "s2");
  assert.equal(r.status, 200); assert.equal(T.properties.at(-1).city, "الطائف");
});

await test("v16 تصحيح بيانات العميل: أي موظف، القيم تُتحقق، والتأهيل يُعاد حسابه بلا تسليم", async () => {
  const { T, h } = await boot((d) => Object.assign(d.customers[0], { deal_type: "إيجار", property_type: "شقة",
    location: "النرجس", budget: 45, budget_period: "سنوي", status: "qualified", mode: "auto" }));
  let r = await call(h, { action: "lead_update", id: "c0", fields: { budget: "٤٥٠٠٠", city: "الرياض" } }, "s2");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const c = T.customers.find((x) => x.id === "c0");
  assert.equal(c.budget, 45000); assert.equal(c.city, "الرياض"); assert.equal(c.status, "qualified"); assert.equal(c.mode, "auto");
  assert.ok(T.events.some((e) => e.kind === "lead_edited" && e.detail.fields.includes("budget")));
  r = await call(h, { action: "lead_update", id: "c0", fields: { deal_type: "hacked" } }, "s2");
  assert.equal(r.status, 400);
  r = await call(h, { action: "lead_update", id: "c0", fields: { budget: "" } }, "s2");
  assert.equal(c.budget, null); assert.equal(c.status, "inquiry");
  // عميل مكتب ثاني ما يُعدّل
  T.customers.push({ id: "x1", office_id: "o2", phone: "966511" });
  r = await call(h, { action: "lead_update", id: "x1", fields: { name: "س" } }, "s2");
  assert.equal(r.status, 404);
});

await test("v16 حذف العميل: صاحب المكتب فقط، يحذف المحادثة، ويبقى إثبات بلا رقم", async () => {
  const { T, h } = await boot();
  let r = await call(h, { action: "lead_delete", id: "c1" }, "s2");
  assert.equal(r.status, 403, "الوسيط حذف عميلاً");
  const before = T.messages.filter((m) => m.customer_id === "c1").length;
  assert.ok(before > 0);
  r = await call(h, { action: "lead_delete", id: "c1" }, "s1");
  assert.equal(r.status, 200);
  assert.ok(!T.customers.some((c) => c.id === "c1"));
  assert.equal(T.messages.filter((m) => m.customer_id === "c1").length, 0, "الرسائل بقيت يتيمة");
  const pr = T.privacy_requests.at(-1);
  assert.equal(pr.kind, "delete_customer"); assert.equal(pr.detail.via, "office_app");
  assert.ok(!JSON.stringify(pr).includes("966500000001".slice(0, 6) + "000001"), "رقم خام في الإثبات");
  r = await call(h, { action: "lead_delete", id: "c1" }, "s1");
  assert.equal(r.status, 404);
});

await test("v16 قائمة المكاتب: «واتساب مربوط» يحتاج رمز الوصول، والرمز ما يطلع للواجهة", async () => {
  const { h } = await boot((d) => { d.offices[1].wa_token = null; });
  const r = await call(h, { action: "offices_list" }, "sa");
  const [a, b] = r.body.offices;
  assert.equal(a.wa_linked, true); assert.equal(b.wa_linked, false);
  assert.ok(!JSON.stringify(r.body).includes("EAA"), "رمز الوصول طلع للواجهة");
});

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
