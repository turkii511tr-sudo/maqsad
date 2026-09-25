// اختبار بوت تيليجرام: ربط تنبيهات المشغّل بمحادثته الخاصة، وربط المكاتب كما كان
import { makeDb, makeFetch, loadFunction } from "./harness.mjs";
import assert from "node:assert/strict";

const FN = new URL("../functions/tg/index.ts", import.meta.url).pathname;
const results = [];
async function test(name, fn) { try { await fn(); results.push(["✓", name]); } catch (e) { results.push(["✗", name, e.message]); } }

const HOUR = 3600 * 1000;
const seed = (opCode) => ({
  app_secrets: [
    { key: "WEBHOOK_SECRET", value: "wk" }, { key: "TELEGRAM_BOT_TOKEN", value: "1:abc" },
    ...(opCode ? [{ key: "OPERATOR_LINK_CODE", value: opCode }] : []),
  ],
  offices: [{ id: "o1", name: "مكتب الأفق", code: "UFQ", tg_link_code: "OFFICE7CODE", telegram_chat_id: "-100", notify_telegram: false }],
  staff: [], events: [],
});
async function boot(opCode) {
  const db = makeDb(seed(opCode));
  const f = makeFetch({});
  const { handler } = await loadFunction(FN, db.client, f);
  return { T: db.T, f, h: handler };
}
const tgTexts = (f) => f.calls.filter((c) => c.url.includes("api.telegram.org")).map((c) => c.body.text);
const secret = (T, k) => T.app_secrets.find((r) => r.key === k)?.value;
const send = (h, text, chat = { id: 5551, type: "private", first_name: "تركي" }, k = "wk") =>
  h(new Request("https://x/tg?k=" + k, { method: "POST", body: JSON.stringify({ message: { chat, text } }) }))
    .then(async (r) => ({ status: r.status, body: r.status === 200 ? await r.json() : null }));

await test("رمز المشغّل في محادثة خاصة يربط OPERATOR_TG_CHAT ويحذف الرمز ويسجّل حدثاً", async () => {
  const { T, f, h } = await boot("OPAB12CD34|" + (Date.now() + HOUR));
  const r = await send(h, "/start OPAB12CD34");
  assert.equal(r.body.operator, "linked");
  assert.equal(secret(T, "OPERATOR_TG_CHAT"), "5551");
  assert.equal(secret(T, "OPERATOR_LINK_CODE"), undefined);
  assert.ok(T.events.some((e) => e.kind === "operator_telegram_linked" && e.office_id === null));
  assert.ok(tgTexts(f).some((t) => t.includes("تم ربط تنبيهات المنصة")));
  assert.equal(T.offices[0].telegram_chat_id, "-100", "مجموعة المكتب ما تتغير");
});

await test("الرمز يُقبل بحروف صغيرة (البوت يحوّله لكبيرة)", async () => {
  const { T, h } = await boot("OPAB12CD34|" + (Date.now() + HOUR));
  const r = await send(h, "/start opab12cd34");
  assert.equal(r.body.operator, "linked");
  assert.equal(secret(T, "OPERATOR_TG_CHAT"), "5551");
});

await test("رمز المشغّل داخل مجموعة يُرفض ويبقى الرمز صالحاً", async () => {
  const { T, f, h } = await boot("OPAB12CD34|" + (Date.now() + HOUR));
  const r = await send(h, "/start@Maqsad_saBot OPAB12CD34", { id: -100999, type: "supergroup", title: "مجموعة" });
  assert.equal(r.body.operator, "not_private");
  assert.equal(secret(T, "OPERATOR_TG_CHAT"), undefined);
  assert.ok(secret(T, "OPERATOR_LINK_CODE"));
  assert.ok(tgTexts(f).some((t) => t.includes("لمحادثتك الخاصة")));
});

await test("رمز المشغّل المنتهي يُرفض ويُحذف", async () => {
  const { T, f, h } = await boot("OPAB12CD34|" + (Date.now() - 1000));
  const r = await send(h, "/start OPAB12CD34");
  assert.equal(r.body.operator, "expired");
  assert.equal(secret(T, "OPERATOR_TG_CHAT"), undefined);
  assert.equal(secret(T, "OPERATOR_LINK_CODE"), undefined);
  assert.ok(tgTexts(f).some((t) => t.includes("انتهى")));
});

await test("ربط المكتب يعمل كما كان، ولا يلمس محادثة المشغّل", async () => {
  const { T, h } = await boot("OPAB12CD34|" + (Date.now() + HOUR));
  const r = await send(h, "/start OFFICE7CODE", { id: -100777, type: "group", title: "مجموعة المكتب" });
  assert.equal(r.body.linked, "o1");
  assert.equal(T.offices[0].telegram_chat_id, "-100777");
  assert.equal(T.offices[0].tg_link_code, null);
  assert.equal(secret(T, "OPERATOR_TG_CHAT"), undefined);
  assert.ok(secret(T, "OPERATOR_LINK_CODE"), "رمز المشغّل يبقى");
});

await test("بدون رمز مشغّل محفوظ: رمز غير معروف يرد «الرابط انتهى» كما كان", async () => {
  const { T, f, h } = await boot(null);
  const r = await send(h, "/start ZZZZ9999");
  assert.equal(r.body.bad_code, true);
  assert.equal(secret(T, "OPERATOR_TG_CHAT"), undefined);
  assert.ok(tgTexts(f).some((t) => t.includes("الرابط انتهى")));
});

await test("رابط بلا السر الصحيح يُرفض 403", async () => {
  const { T, h } = await boot("OPAB12CD34|" + (Date.now() + HOUR));
  const r = await send(h, "/start OPAB12CD34", undefined, "wrong");
  assert.equal(r.status, 403);
  assert.equal(secret(T, "OPERATOR_TG_CHAT"), undefined);
});

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
