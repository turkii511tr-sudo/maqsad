// اختبار متابعة رخص فال: مراحل التنبيه، الإرسال مرة وحدة لكل مرحلة، الاستدراك، التجربة، وملخص المشغّل
import { makeDb, makeFetch, loadFunction } from "./harness.mjs";
import assert from "node:assert/strict";

const FN = new URL("../functions/fal-check/index.ts", import.meta.url).pathname;
const results = [];
async function test(name, fn) { try { await fn(); results.push(["✓", name]); } catch (e) { results.push(["✗", name, e.message]); } }

const TODAY = "2026-09-23";
const plus = (n) => new Date(Date.parse(TODAY + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const seed = () => ({
  app_secrets: [{ key: "WEBHOOK_SECRET", value: "wk" }, { key: "TELEGRAM_BOT_TOKEN", value: "1:abc" }, { key: "OPERATOR_TG_CHAT", value: "777" }],
  offices: [
    { id: "o1", name: "مكتب شهر", active: true, telegram_chat_id: "-101", fal_status: "verified", fal_expires_on: plus(30), fal_reminded: null, created_at: "2026-01-01" },
    { id: "o2", name: "مكتب أسبوع", active: true, telegram_chat_id: "-102", fal_status: "verified", fal_expires_on: plus(5), fal_reminded: 30, created_at: "2026-01-02" },
    { id: "o3", name: "مكتب اليوم", active: true, telegram_chat_id: "-103", fal_status: "verified", fal_expires_on: plus(0), fal_reminded: 7, created_at: "2026-01-03" },
    { id: "o4", name: "مكتب انتهت", active: true, telegram_chat_id: null, fal_status: "verified", fal_expires_on: plus(-2), fal_reminded: 1, created_at: "2026-01-04" },
    { id: "o5", name: "مكتب بعيد", active: true, telegram_chat_id: "-105", fal_status: "verified", fal_expires_on: plus(90), fal_reminded: null, created_at: "2026-01-05" },
    { id: "o6", name: "مكتب موقوف", active: false, telegram_chat_id: "-106", fal_status: "verified", fal_expires_on: plus(3), fal_reminded: null, created_at: "2026-01-06" },
    { id: "o7", name: "مكتب ما تحقق", active: true, telegram_chat_id: "-107", fal_status: "pending", fal_expires_on: null, fal_reminded: null, created_at: "2026-01-07" },
    { id: "o8", name: "مكتب نُبّه من قبل", active: true, telegram_chat_id: "-108", fal_status: "verified", fal_expires_on: plus(20), fal_reminded: 30, created_at: "2026-01-08" },
  ],
  staff: [],
  events: [{ id: 900, office_id: "o7", kind: "fal_blocked", level: "warn", created_at: new Date(Date.now() - 3600e3).toISOString(), detail: {} },
           { id: 901, office_id: "o5", kind: "fal_blocked", level: "warn", created_at: new Date(Date.now() - 3 * 864e5).toISOString(), detail: {} }],
});
async function boot(mut) {
  const d = seed(); if (mut) mut(d);
  const db = makeDb(d);
  const f = makeFetch({});
  const { handler, mod } = await loadFunction(FN, db.client, f);
  return { T: db.T, f, h: handler, mod };
}
const tgCalls = (f) => f.calls.filter((c) => c.url.includes("api.telegram.org"));
const run = (h, qs) => h(new Request("https://x/fal-check?k=wk&today=" + TODAY + "&" + (qs ?? ""), { method: "POST" })).then((r) => r.json());

await test("بلا المفتاح السري: مرفوض", async () => {
  const { h } = await boot();
  const r = await h(new Request("https://x/fal-check?k=nope", { method: "POST" }));
  assert.equal(r.status, 403);
});

await test("المراحل: ٣٠ · ٧ · آخر يوم · انتهت", async () => {
  const { mod } = await boot();
  assert.equal(mod.stageOf(31), null); assert.equal(mod.stageOf(30), 30); assert.equal(mod.stageOf(8), 30);
  assert.equal(mod.stageOf(7), 7); assert.equal(mod.stageOf(2), 7); assert.equal(mod.stageOf(1), 1);
  assert.equal(mod.stageOf(0), 1); assert.equal(mod.stageOf(-1), -1);
  assert.equal(mod.inDays(0), "اليوم"); assert.equal(mod.inDays(1), "بكرة"); assert.equal(mod.inDays(2), "بعد يومين");
  assert.equal(mod.inDays(5), "بعد 5 أيام"); assert.equal(mod.inDays(30), "بعد 30 يوماً");
  assert.equal(mod.arDate("2027-03-15"), "15 مارس 2027");
});

await test("كل مكتب يوصله تنبيه مرحلته مرة وحدة، والمنتهية تقول إن العرض وقف", async () => {
  const { T, f, h } = await boot();
  const r = await run(h);
  assert.deepEqual(r.sent.sort(), ["مكتب أسبوع", "مكتب اليوم", "مكتب انتهت", "مكتب شهر"].sort());
  const byChat = Object.fromEntries(tgCalls(f).map((c) => [c.body.chat_id, c.body.text]));
  assert.match(byChat["-101"], /تنتهي بعد 30 يوماً \(23 أكتوبر 2026\)/);
  assert.match(byChat["-102"], /تنتهي بعد 5 أيام/);
  assert.match(byChat["-103"], /تنتهي اليوم/);
  assert.equal(byChat["-105"], undefined, "far office notified");
  assert.equal(byChat["-106"], undefined, "inactive office notified");
  assert.equal(byChat["-107"], undefined, "pending office got expiry reminder");
  assert.equal(byChat["-108"], undefined, "same stage repeated");
  const st = Object.fromEntries(T.offices.map((o) => [o.id, o.fal_reminded]));
  assert.equal(st.o1, 30); assert.equal(st.o2, 7); assert.equal(st.o3, 1); assert.equal(st.o4, -1); assert.equal(st.o8, 30);
  const ev4 = T.events.find((e) => e.kind === "fal_reminder" && e.office_id === "o4");
  assert.equal(ev4.detail.delivered, false); assert.equal(ev4.level, "warn");
  // المشغّل: ملخص فيه المنتهية بلا مجموعة، والمكتب اللي راسله عملاء وهو متوقف (آخر ٢٤ ساعة فقط)
  const op = byChat["777"];
  assert.ok(op, "operator summary missing");
  assert.match(op, /مكتب انتهت: انتهت .*كلّمهم/);
  assert.match(op, /مكتب ما تحقق/);
  assert.ok(!op.includes("مكتب بعيد"), "old blocked event included");
  assert.deepEqual(r.blocked, ["مكتب ما تحقق"]);
});

await test("التشغيل الثاني في نفس اليوم ما يكرر شي", async () => {
  const { f, h } = await boot((d) => { d.events = []; });
  await run(h);
  const n = tgCalls(f).length;
  const r = await run(h);
  assert.equal(r.sent.length, 0);
  assert.equal(tgCalls(f).length, n, "second run sent messages");
});

await test("يوم فات: التنبيه يُستدرك بالمرحلة الأقرب، ولا يرسل المراحل الفائتة كلها", async () => {
  const { T, f, h } = await boot((d) => {
    d.offices = [{ id: "x", name: "مكتب فاته", active: true, telegram_chat_id: "-1", fal_status: "verified",
      fal_expires_on: plus(3), fal_reminded: null, created_at: "2026-01-01" }];
    d.events = [];
  });
  await run(h);
  const msgs = tgCalls(f).filter((c) => c.body.chat_id === "-1");
  assert.equal(msgs.length, 1); assert.match(msgs[0].body.text, /بعد 3 أيام/);
  assert.equal(T.offices[0].fal_reminded, 7);
});

await test("التجديد (تحقق جديد يصفّر التنبيه) يرجّع التنبيهات للمرحلة الجديدة", async () => {
  const { T, f, h } = await boot((d) => {
    d.offices = [{ id: "x", name: "مكتب جدّد", active: true, telegram_chat_id: "-1", fal_status: "verified",
      fal_expires_on: plus(400), fal_reminded: null, created_at: "2026-01-01" }];
    d.events = [];
  });
  const r = await run(h);
  assert.equal(r.sent.length, 0); assert.equal(tgCalls(f).length, 0, "nothing to report should stay silent");
  assert.equal(T.offices[0].fal_reminded, null);
});

await test("التجربة: ترجع النصوص بلا إرسال ولا تغيير", async () => {
  const { T, f, h } = await boot();
  const r = await run(h, "dry=1");
  assert.equal(r.dry, true);
  assert.equal(tgCalls(f).length, 0);
  assert.ok(r.texts["مكتب شهر"].includes("مكتب شهر"));
  assert.match(r.texts["مكتب انتهت"], /وقف عرض العقارات/);
  assert.match(r.operator, /تجربة بلا إرسال/);
  assert.equal(T.offices.find((o) => o.id === "o1").fal_reminded, null);
  assert.equal(T.events.filter((e) => e.kind === "fal_reminder").length, 0);
});

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
