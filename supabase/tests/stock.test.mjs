// اختبار تأكيد توفّر العقارات (stock-check): التذكير بعد ٧ أيام، الأخير بعد ٦ أيام، الإيقاف عند ١٤ يوماً،
// وأن مكتباً لا يصله تنبيه ما يُوقف له شي، وأن التجربة (dry) لا تغيّر شيئاً
import { makeDb, makeFetch, loadFunction } from "./harness.mjs";
import assert from "node:assert/strict";

const FN = new URL("../functions/stock-check/index.ts", import.meta.url).pathname;
const results = [];
async function test(name, fn) { try { await fn(); results.push(["✓", name]); } catch (e) { results.push(["✗", name, e.message]); } }

const NOW = Date.parse("2026-10-10T06:30:00Z");
const ago = (d) => new Date(NOW - d * 864e5 - 60_000).toISOString();
const seed = () => ({
  app_secrets: [{ key: "WEBHOOK_SECRET", value: "wk" }, { key: "TELEGRAM_BOT_TOKEN", value: "1:abc" }],
  offices: [
    { id: "o1", name: "مكتب الأفق", active: true, telegram_chat_id: "-101" },
    { id: "o2", name: "مكتب بلا قناة", active: true, telegram_chat_id: null, notify_push: false },
    { id: "o3", name: "مكتب موقوف", active: false, telegram_chat_id: "-103" },
  ],
  properties: [
    { id: "fresh", office_id: "o1", title: "جديدة", district: "النرجس", city: "الرياض", state: "available", confirmed_at: ago(3), remind_count: 0, remind_sent_at: null },
    { id: "w1", office_id: "o1", title: "شقة النرجس", district: "النرجس", city: "الرياض", state: "available", confirmed_at: ago(7), remind_count: 0, remind_sent_at: null },
    { id: "w2", office_id: "o1", title: "فيلا الملقا", district: "الملقا", city: "الرياض", state: "available", confirmed_at: ago(13), remind_count: 1, remind_sent_at: ago(6) },
    { id: "w3", office_id: "o1", title: "دور العارض", district: "العارض", city: "الرياض", state: "available", confirmed_at: ago(10), remind_count: 1, remind_sent_at: ago(3) },
    { id: "p1", office_id: "o1", title: "محل الياسمين", district: "الياسمين", city: "الرياض", state: "available", confirmed_at: ago(14), remind_count: 2, remind_sent_at: ago(1) },
    { id: "rent", office_id: "o1", title: "مؤجّرة", district: "حطين", city: "الرياض", state: "rented", confirmed_at: ago(40), remind_count: 0 },
    { id: "n1", office_id: "o2", title: "عقار بلا قناة", district: "الصحافة", city: "الرياض", state: "available", confirmed_at: ago(20), remind_count: 0, remind_sent_at: null },
    { id: "off", office_id: "o3", title: "مكتب موقوف", district: "الصحافة", city: "الرياض", state: "available", confirmed_at: ago(20), remind_count: 0 },
  ],
  events: [], staff: [],
});
async function boot(mut) {
  const d = seed(); if (mut) mut(d);
  const db = makeDb(d); const f = makeFetch({});
  const { handler, mod } = await loadFunction(FN, db.client, f);
  return { T: db.T, f, h: handler, mod };
}
const tgCalls = (f) => f.calls.filter((c) => c.url.includes("api.telegram.org"));
const run = (h, qs) => h(new Request("https://x/stock-check?k=wk&now=" + new Date(NOW).toISOString() + "&" + (qs ?? ""))).then((r) => r.json());
const st = (T, id) => T.properties.find((p) => p.id === id);

await test("بلا المفتاح السري: مرفوض", async () => {
  const { h } = await boot();
  assert.equal((await h(new Request("https://x/stock-check?k=nope"))).status, 403);
});

await test("التذكير: المتاح ٧ أيام+ فقط، وبلا الجديد والمؤجّر، ومرة وحدة كل ٦ أيام", async () => {
  const { T, f, h } = await boot();
  const r = await run(h);
  assert.deepEqual(r.reminded, ["مكتب الأفق"]);
  const msg = tgCalls(f).find((c) => c.body.chat_id === "-101" && /هل ما زالت/.test(c.body.text)).body.text;
  assert.match(msg, /هل ما زالت هذه العقارات متاحة/);
  assert.match(msg, /شقة النرجس/); assert.match(msg, /فيلا الملقا/);
  assert.doesNotMatch(msg, /جديدة/); assert.doesNotMatch(msg, /مؤجّرة/);
  assert.doesNotMatch(msg, /دور العارض/, "ذُكّر قبل ٣ أيام");
  assert.match(msg, /⚠️ فيلا الملقا/, "التذكير الأخير يحمل تحذيراً");
  assert.match(msg, /ما أُكّدت يوقف البوت عرضها بكرة/);
  assert.equal(st(T, "w1").remind_count, 1); assert.equal(st(T, "w2").remind_count, 2);
  assert.equal(st(T, "w3").remind_count, 1);
  // تشغيل ثاني في نفس اليوم: لا تكرار
  const f2 = tgCalls(f).length;
  await run(h);
  assert.equal(tgCalls(f).length, f2, "duplicate reminder");
});

await test("الإيقاف: ١٤ يوماً بعد تذكير فعلي → «غير مؤكَّد» + إشعار، والباقي ما يُمس", async () => {
  const { T, f, h } = await boot();
  const r = await run(h);
  assert.deepEqual(r.paused, ["مكتب الأفق"]);
  assert.equal(st(T, "p1").state, "unconfirmed");
  for (const id of ["fresh", "w1", "w2", "w3"]) assert.equal(st(T, id).state, "available", id);
  assert.equal(st(T, "rent").state, "rented");
  assert.ok(tgCalls(f).some((c) => /أوقف البوت عرض عقار/.test(c.body.text) && /محل الياسمين/.test(c.body.text)));
  assert.ok(T.events.some((e) => e.kind === "stock_paused" && e.office_id === "o1" && e.detail.delivered));
});

await test("مكتب لا يصله تنبيه: ما يزيد العدّاد وما يُوقف له عقار، ويُسجَّل تحذير", async () => {
  const { T, h } = await boot();
  await run(h);
  assert.equal(st(T, "n1").state, "available"); assert.equal(st(T, "n1").remind_count, 0);
  assert.ok(T.events.some((e) => e.kind === "stock_reminder" && e.office_id === "o2" && e.level === "warn" && e.detail.delivered === false));
});

await test("المكتب الموقوف ما يوصله شي", async () => {
  const { T, f, h } = await boot();
  await run(h);
  assert.ok(!tgCalls(f).some((c) => c.body.chat_id === "-103"));
  assert.equal(st(T, "off").remind_count, 0);
});

await test("تجربة dry=1: نصوص بلا إرسال ولا تغيير", async () => {
  const { T, f, h } = await boot();
  const r = await run(h, "dry=1");
  assert.ok(r.texts["مكتب الأفق"]); assert.ok(r.texts["مكتب الأفق (إيقاف)"]);
  assert.equal(tgCalls(f).length, 0);
  assert.equal(st(T, "p1").state, "available"); assert.equal(st(T, "w1").remind_count, 0);
  assert.equal(T.events.length, 0);
});

await test("قائمة طويلة: تُقصّ على ٨ مع «… وN عقارات أخرى»", async () => {
  const { mod } = await boot();
  const ps = Array.from({ length: 11 }, (_, i) => ({ id: "x" + i, title: "عقار " + i, district: "ح", city: "الرياض" }));
  const t = mod.reminderText({ name: "م" }, ps, new Set());
  assert.match(t, /و3 عقارات أخرى/); assert.doesNotMatch(t, /عقار 10/);
});

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
