// اختبار ملخص الشهر: النص، الإرسال مرة وحدة، التخطي، ملخص المشغّل، والمدد بالعربي
import { makeDb, makeFetch, loadFunction } from "./harness.mjs";
import assert from "node:assert/strict";

const FN = new URL("../functions/monthly-report/index.ts", import.meta.url).pathname;
const results = [];
async function test(name, fn) { try { await fn(); results.push(["✓", name]); } catch (e) { results.push(["✗", name, e.message]); } }

const STATS = {
  new_customers: 42, inbound_msgs: 380, bot_replies: 350, first_reply_median_s: 11, offhours_new: 15,
  handoffs: { qualified: 18, human: 4, owner_offer: 2, taken: 3 },
  outcomes: { contacted: 6, viewing: 5, deal: 2, no_answer: 3, lost: 2 },
  callback_median_s: 3 * 3600, waiting_now: 4,
  top_districts: [{ d: "النرجس", n: 9 }, { d: "الملقا", n: 6 }, { d: "الياسمين", n: 4 }],
  opted_out: 1, deleted: 0,
};
const seed = () => ({
  app_secrets: [{ key: "WEBHOOK_SECRET", value: "wk" }, { key: "TELEGRAM_BOT_TOKEN", value: "1:abc" }, { key: "OPERATOR_TG_CHAT", value: "777" }],
  offices: [
    { id: "o1", name: "مكتب الأفق", code: "UFQ", active: true, telegram_chat_id: "-100", created_at: "2026-01-01" },
    { id: "o2", name: "مكتب هادئ", code: "HDA", active: true, telegram_chat_id: "-200", created_at: "2026-01-02" },
    { id: "o3", name: "مكتب موقوف", code: "OFF", active: false, telegram_chat_id: "-300", created_at: "2026-01-03" },
    { id: "o4", name: "مكتب بلا مجموعة", code: "NTG", active: true, telegram_chat_id: null, created_at: "2026-01-04" },
  ],
  staff: [], events: [],
});
async function boot() {
  const db = makeDb(seed());
  db.T.__month_stats_fn = (a) => a.p_office === "o2" ? { new_customers: 0, inbound_msgs: 0 } : STATS;
  db.T.__platform_usage = [
    { id: "o1", name: "مكتب الأفق", active: true, new_customers: 42, qualified: 18, deals: 2, ai_in: 2000000, ai_cached: 1000000, ai_out: 200000, otp_platform: 20 },
    { id: "o2", name: "مكتب هادئ", active: true, new_customers: 0, qualified: 0, deals: 0 },
  ];
  const f = makeFetch({});
  const { handler, mod } = await loadFunction(FN, db.client, f);
  return { T: db.T, f, h: handler, mod };
}
const tgCalls = (f) => f.calls.filter((c) => c.url.includes("api.telegram.org"));
const run = (h, qs) => h(new Request("https://x/monthly-report?k=wk&" + qs, { method: "POST" })).then((r) => r.json());

await test("بلا المفتاح الصحيح مرفوض", async () => {
  const { h } = await boot();
  const r = await h(new Request("https://x/monthly-report?k=bad", { method: "POST" }));
  assert.equal(r.status, 403);
});

await test("وضع المعاينة: نص الملخص كامل وصحيح، وبلا أي إرسال", async () => {
  const { f, h } = await boot();
  const r = await run(h, "dry=1&month=2026-09");
  assert.equal(r.month, "2026-09"); assert.equal(tgCalls(f).length, 0);
  const t = r.texts["مكتب الأفق"];
  for (const want of ["📊 ملخص سبتمبر 2026 — مكتب الأفق", "عملاء جدد: 42", "بين ١٠ الليل و٩ الصبح: 15",
    "يرد عادةً خلال 11 ثانية", "سلّمهم المساعد لكم: 24 (مؤهل 18 · طلب موظف 4 · مالك يعرض عقاره 2)",
    "تواصلتوا: 6 · رتّبتوا معاينة: 5 · تمت الصفقة: 2 · ما ردوا: 3 · مو جادين: 2",
    "تتصلون عادةً خلال 3 ساعات", "ينتظرون اتصالكم الحين: 4", "النرجس (9) · الملقا (6) · الياسمين (4)",
    "أوقفوا الرسائل الآلية: 1"]) assert.ok(t.includes(want), "missing: " + want + "\n---\n" + t);
  assert.ok(!t.includes("طلبوا حذف"), "zero lines should be hidden");
  assert.ok(!/9665\d{8}/.test(t), "phone number leaked");
  assert.ok(r.skipped.some((x) => x.name === "مكتب هادئ" && x.why === "بلا نشاط"));
  assert.ok(r.skipped.some((x) => x.name === "مكتب موقوف" && x.why === "موقوف"));
  assert.ok(r.operator.includes("الإجمالي: 42 عميل · 18 مؤهل · 2 صفقة"), r.operator);
});

await test("الإرسال الفعلي: مرة وحدة لكل مكتب، والتكرار يُتخطى إلا بالإجبار", async () => {
  const { T, f, h } = await boot();
  let r = await run(h, "month=2026-09");
  assert.deepEqual(r.sent, ["مكتب الأفق"]);
  const toOffice = tgCalls(f).filter((c) => c.body.chat_id === "-100");
  assert.equal(toOffice.length, 1); assert.ok(toOffice[0].body.text.startsWith("📊 ملخص سبتمبر 2026"));
  assert.ok(r.skipped.some((x) => x.name === "مكتب بلا مجموعة" && x.why === "بلا مجموعة تيليجرام"));
  assert.equal(T.events.filter((e) => e.kind === "monthly_report_sent").length, 1);
  const op = tgCalls(f).filter((c) => c.body.chat_id === "777");
  assert.equal(op.length, 1);
  // (1M × 0.15 + 1M × 0.075 + 200k × 0.60) / 1M = 0.345 ، ورموز الدخول 20 × 0.018 = 0.36 → 0.705
  assert.ok(op[0].body.text.includes("التكلفة التقديرية: 0.70$") || op[0].body.text.includes("التكلفة التقديرية: 0.71$"), op[0].body.text);
  r = await run(h, "month=2026-09");
  assert.deepEqual(r.sent, []);
  assert.ok(r.skipped.some((x) => x.name === "مكتب الأفق" && x.why === "أُرسل من قبل"));
  r = await run(h, "month=2026-09&force=1");
  assert.deepEqual(r.sent, ["مكتب الأفق"]);
});

await test("المدد بالعربي والشهر الماضي بتوقيت الرياض", async () => {
  const { mod } = await boot();
  const { dur, previousMonth, monthRange } = mod;
  assert.equal(dur(1), "ثانية"); assert.equal(dur(2), "ثانيتين"); assert.equal(dur(7), "7 ثوانٍ");
  assert.equal(dur(45), "45 ثانية"); assert.equal(dur(59.7), "59 ثانية"); assert.equal(dur(90), "دقيقتين");
  assert.equal(dur(10 * 60), "10 دقائق"); assert.equal(dur(3 * 3600), "3 ساعات"); assert.equal(dur(36 * 3600), "يومين");
  assert.equal(dur(null), null);
  assert.equal(previousMonth(Date.parse("2026-01-15T12:00:00Z")), "2025-12");
  // ٢٢:٠٠ بتوقيت غرينتش يوم ٣٠ سبتمبر = ١ أكتوبر الساعة ١ فجراً في الرياض
  assert.equal(previousMonth(Date.parse("2026-09-30T22:00:00Z")), "2026-09");
  assert.equal(monthRange("2026-12").to, "2027-01-01T00:00:00+03:00");
});

await test("مكتب بلا نتائج اتصال مسجّلة: تذكير بتسجيلها بدل الأرقام", async () => {
  const { mod } = await boot();
  const t = mod.officeReport({ name: "مكتب" }, "سبتمبر 2026", { new_customers: 3, handoffs: { qualified: 2 }, outcomes: {} });
  assert.ok(t.includes("ما سُجّلت نتائج اتصال"), t);
  assert.ok(!t.includes("تتصلون عادةً"));
});

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
