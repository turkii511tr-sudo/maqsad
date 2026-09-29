// اختبار محرك واتساب v4 بسيناريوهات حقيقية — بدون لمس قاعدة البيانات الحية
import { makeDb, makeFetch, loadFunction, sign } from "./harness.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const FN = new URL("../functions/wa-webhook/index.ts", import.meta.url).pathname;
// رخصة فال سارية لسنة (بتوقيت الرياض) — اختبارات فال تغيّرها حسب الحالة
const riyadh = (d = 0) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const FAL_OK = riyadh(365);
const seed = {
  app_secrets: [
    { key: "WEBHOOK_SECRET", value: "wk" }, { key: "OPENAI_API_KEY", value: "sk-test" },
    { key: "TELEGRAM_BOT_TOKEN", value: "123:abc" }, { key: "META_APP_SECRET", value: "appsecret" },
    { key: "META_VERIFY_TOKEN", value: "vtok" },
  ],
  offices: [
    { id: "o1", name: "مكتب الأفق العقاري", license_no: "1200012345", wa_provider: "ultramsg",
      wa_instance: "instance190700", wa_instance_key: "190700", wa_token: "t", active: true,
      debounce_seconds: 0, msg_quota: 15, telegram_chat_id: "-100", fal_status: "verified", fal_expires_on: FAL_OK },
    { id: "o2", name: "مكتب الواحة", license_no: "1200099999", wa_provider: "cloud",
      wa_instance: "109876543210", wa_instance_key: "109876543210", wa_token: "EAAG", active: true,
      debounce_seconds: 0, msg_quota: 15, telegram_chat_id: "-200", fal_status: "verified", fal_expires_on: FAL_OK },
  ],
};

let aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(["✓", name]); }
  catch (e) { results.push(["✗", name, e.message]); }
}

function setup() {
  const { T, client } = makeDb(seed);
  const f = makeFetch(() => aiNext);
  return { T, client, f };
}
const ultra = (from, body, id) => new Request("https://x/wa-webhook?k=wk", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ instanceId: "instance190700", data: { from: from + "@c.us", body, id: id ?? crypto.randomUUID(), type: "chat", pushname: "أبو فهد" } }),
});
const sent = (f, host) => f.calls.filter((c) => c.url.includes(host));
const waSent = (f) => [...sent(f, "ultramsg"), ...sent(f, "graph.facebook.com")];
const waText = (c) => c.body?.body ?? c.body?.text?.body ?? "";

// ---------- UltraMsg ----------
await test("رابط بلا مفتاح سري يُرفض", async () => {
  const { client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  const r = await handler(new Request("https://x/wa-webhook?k=bad", { method: "POST", body: "{}" }));
  assert.equal(r.status, 403);
});

await test("أول رد يحمل الإفصاح، والثاني لا", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000001", "السلام عليكم"));
  const first = waText(waSent(f)[0]);
  assert.ok(first.includes("المساعد الآلي في مكتب الأفق العقاري"), "no disclosure: " + first);
  assert.ok(first.includes("«توقف»"));
  const c = T.customers[0];
  assert.ok(c.disclosed_at, "disclosed_at not set");
  await handler(ultra("966500000001", "ابي شقة"));
  const second = waText(waSent(f)[1]);
  assert.ok(!second.includes("المساعد الآلي"), "disclosure repeated");
});

await test("«توقف» يوقف البوت ويسجّل الطلب ويُنبّه المكتب", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000002", "مرحبا"));
  await handler(ultra("966500000002", "توقف"));
  const c = T.customers[0];
  assert.equal(c.opted_out, true); assert.equal(c.mode, "manual");
  assert.ok(waText(waSent(f).at(-1)).includes("أوقفنا الرسائل الآلية"));
  assert.equal(T.privacy_requests.filter((p) => p.kind === "opt_out").length, 1);
  assert.ok(sent(f, "telegram").some((t) => t.body.text.includes("أوقف الرسائل الآلية")));
  // بعد الإيقاف: لا رد آلي، فقط تنبيه
  const before = waSent(f).length;
  c.manual_pinged_at = null;
  await handler(ultra("966500000002", "متى تفتحون؟"));
  assert.equal(waSent(f).length, before, "bot replied after opt-out");
  assert.ok(sent(f, "telegram").some((t) => t.body.text.includes("أوقف الرسائل الآلية راسل")));
  // «ابدأ» يعيده
  await handler(ultra("966500000002", "ابدأ"));
  assert.equal(c.opted_out, false); assert.equal(c.mode, "auto");
  assert.ok(waText(waSent(f).at(-1)).includes("أهلاً بك من جديد"));
});

await test("«وقف» وحدها لا تُعتبر إيقافاً (تعني الأوقاف)", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000003", "وقف"));
  assert.equal(T.customers[0].opted_out, false);
  assert.ok(sent(f, "openai").length === 1, "should go to AI");
});

await test("إيقاف ضمن عدة رسائل متتالية يُلتقط", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  // نحاكي تجميع رسالتين في نفس الدفعة
  T.customers.push({ id: "c9", office_id: "o1", wa_id: "966500000009@c.us", phone: "966500000009", mode: "auto",
    msg_count: 2, buffer: "السلام عليكم", recent_ids: [], locked_until: null, opted_out: false, disclosed_at: "x" });
  await handler(ultra("966500000009", "إيقاف الرسائل"));
  assert.equal(T.customers.find((c) => c.id === "c9").opted_out, true);
});

await test("«احذف بياناتي» يمسح العميل ومحادثته ويحفظ إثباتاً بلا رقم خام", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000004", "ابي فيلا في الملقا"));
  assert.equal(T.customers.length, 1); assert.ok(T.messages.length >= 2);
  await handler(ultra("966500000004", "لو سمحت احذف بياناتي"));
  assert.equal(T.customers.length, 0, "customer not deleted");
  assert.equal(T.messages.length, 0, "messages not deleted");
  const pr = T.privacy_requests.find((p) => p.kind === "delete_customer");
  assert.ok(pr && pr.status === "done" && pr.detail.last4 === "0004");
  assert.ok(!JSON.stringify(pr).includes("966500000004"), "raw phone stored");
  assert.ok(waText(waSent(f).at(-1)).includes("تم حذف بياناتك"));
  assert.ok(sent(f, "telegram").some((t) => t.body.text.includes("طلب حذف بياناته")));
});

await test("طلب موظف من أول رسالة = تحويل + إفصاح مختصر", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000005", "ابي موظف"));
  const t = waText(waSent(f)[0]);
  assert.ok(t.includes("حوّلنا طلبك"));
  assert.ok(t.includes("لإيقاف الرسائل") && !t.includes("تبي موظف؟"), t);
  assert.equal(T.customers[0].mode, "manual");
});

await test("عميل مؤهل: يعرض العقارات ويتوقف ويُنبّه", async () => {
  const { T, client, f } = setup();
  T.__matches = [{ title: "شقة النرجس A12", district: "النرجس", rooms: 3, price: 55000,
    ad_license_no: "7200034512", grade: "تطابق قوي", score: 80 }];
  const { handler } = await loadFunction(FN, client, f);
  aiNext = { reply: "تمام", status: "مؤهل", mode: "آلي", deal_type: "إيجار", property_type: "شقة",
    location: "النرجس", budget: "60000", budget_period: "سنوي", summary: "يبي شقة إيجار بالنرجس" };
  await handler(ultra("966500000006", "ابي شقة ايجار بالنرجس ميزانيتي ٦٠ الف سنوي"));
  aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
  const t = waText(waSent(f)[0]);
  assert.ok(t.includes("شقة النرجس A12") && t.includes("ترخيص إعلان 7200034512"), t);
  const c = T.customers[0];
  assert.equal(c.status, "qualified"); assert.equal(c.mode, "manual");
  assert.ok(sent(f, "telegram").some((x) => x.body.text.includes("عميل مؤهل")));
});

await test("رد فارغ من الذكاء = السؤال الناقص التالي، لا سؤال عام", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  aiNext = { reply: "", status: "استفسار عام", mode: "آلي", deal_type: "إيجار", property_type: "شقة", summary: "x" };
  await handler(ultra("966500000010", "ابي شقة ايجار"));
  aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
  const t = waText(waSent(f)[0]);
  assert.ok(t.startsWith("أي حي تفضّل؟"), t);
  assert.ok(T.events.some((e) => e.kind === "ai_empty_reply"));
});

await test("اكتمال البيانات = مؤهل حتى لو أخطأ النموذج في الحكم", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  aiNext = { reply: "هلا والله، كم غرفة تحتاج؟", status: "استفسار عام", mode: "آلي", deal_type: "شراء",
    property_type: "فيلا", location: "الملقا", budget: "3000000", summary: "فيلا للبيع بالملقا" };
  await handler(ultra("966500000011", "ابي فيلا للبيع في الملقا ميزانيتي ٣ مليون"));
  aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
  const c = T.customers[0];
  assert.equal(c.status, "qualified");
  assert.equal(c.mode, "manual");
  // الرد يحمل سؤالاً فيُستبدل بعبارة الاكتمال
  assert.ok(waText(waSent(f)[0]).startsWith("الله يعطيك العافية"));
});

await test("مالك يعرض عقاره = تحويل للوسيط وتنبيه فرصة مخزون", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  aiNext = { reply: "أبشر", status: "استفسار عام", mode: "آلي", deal_type: "عرض عقار",
    property_type: "شقة", location: "العارض", budget: "", summary: "مالك يعرض شقة" };
  await handler(ultra("966500000012", "عندي شقة بالعارض ابي اعرضها عندكم"));
  aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
  const c = T.customers[0];
  assert.equal(c.mode, "manual"); assert.equal(c.status, "inquiry");
  assert.ok(waText(waSent(f)[0]).includes("وصل عرضك"));
  assert.ok(sent(f, "telegram").some((x) => x.body.text.includes("مالك يعرض عقاره")));
});

await test("رسالة مكررة من المزوّد لا تُعالج مرتين", async () => {
  const { client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000007", "مرحبا", "same-id"));
  await handler(ultra("966500000007", "مرحبا", "same-id"));
  assert.equal(sent(f, "openai").length, 1);
});

// ---------- واتساب الرسمي ----------
const meta = (payload, secret = "appsecret") => {
  const body = JSON.stringify(payload);
  return new Request("https://x/wa-webhook", { method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(secret, body) }, body });
};
const metaMsg = (from, msg, pnid = "109876543210") => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: "966500009999" },
    contacts: [{ wa_id: from, profile: { name: "سارة" } }],
    messages: [{ from, id: "wamid." + crypto.randomUUID(), timestamp: "1", ...msg }] } }] }],
});

await test("ميتا: تحقق الرابط بالرمز الصحيح فقط", async () => {
  const { client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  const ok = await handler(new Request("https://x/wa-webhook?hub.mode=subscribe&hub.verify_token=vtok&hub.challenge=12345"));
  assert.equal(ok.status, 200); assert.equal(await ok.text(), "12345");
  const bad = await handler(new Request("https://x/wa-webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1"));
  assert.equal(bad.status, 403);
});

await test("ميتا: توقيع خاطئ يُرفض", async () => {
  const { client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  const r = await handler(meta(metaMsg("966511111111", { type: "text", text: { body: "هلا" } }), "wrong"));
  assert.equal(r.status, 403);
  assert.equal(sent(f, "openai").length, 0);
});

await test("ميتا: رسالة نصية تُعالج في الخلفية ويُرد عليها عبر Graph API", async () => {
  const { T, client, f } = setup();
  const { handler, pending } = await loadFunction(FN, client, f);
  const r = await handler(meta(metaMsg("966511111111", { type: "text", text: { body: "ابي شقة" } })));
  assert.equal(r.status, 200);
  await Promise.all(pending);
  const g = sent(f, "graph.facebook.com/v21.0/109876543210/messages");
  assert.equal(g.length, 1, "no graph send");
  assert.equal(g[0].body.to, "966511111111");
  assert.ok(g[0].body.text.body.includes("المساعد الآلي في مكتب الواحة"));
  assert.equal(T.customers[0].name, "سارة");
});

await test("ميتا: رسالة صوتية = تنبيه واحد فقط خلال ٣٠ دقيقة", async () => {
  const { client, f } = setup();
  const { handler, pending } = await loadFunction(FN, client, f);
  await handler(meta(metaMsg("966522222222", { type: "audio", audio: { id: "a1" } })));
  await Promise.all(pending);
  await handler(meta(metaMsg("966522222222", { type: "image", image: { id: "i1" } })));
  await Promise.all(pending);
  const g = sent(f, "graph.facebook.com").filter((c) => c.body.text.body.includes("أفهم الرسائل المكتوبة"));
  assert.equal(g.length, 1);
});

await test("ميتا: رد الموظف من جواله يُسكت البوت لهذا العميل", async () => {
  const { T, client, f } = setup();
  const { handler, pending } = await loadFunction(FN, client, f);
  await handler(meta(metaMsg("966533333333", { type: "text", text: { body: "مرحبا" } })));
  await Promise.all(pending);
  assert.equal(T.customers[0].mode, "auto");
  await handler(meta({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "smb_message_echoes",
    value: { metadata: { phone_number_id: "109876543210" },
      message_echoes: [{ from: "966500009999", to: "966533333333", id: "e1", type: "text", text: { body: "هلا، معك سعد" } }] } }] }] }));
  await Promise.all(pending);
  assert.equal(T.customers[0].mode, "manual");
});

await test("ميتا: فشل تسليم يُسجّل كخطأ، ورقم غير معروف يُسجّل كتحذير", async () => {
  const { T, client, f } = setup();
  const { handler, pending } = await loadFunction(FN, client, f);
  await handler(meta({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages",
    value: { metadata: { phone_number_id: "109876543210" },
      statuses: [{ status: "failed", errors: [{ code: 131047, title: "Re-engagement message" }] }] } }] }] }));
  await handler(meta(metaMsg("966544444444", { type: "text", text: { body: "هلا" } }, "999")));
  await Promise.all(pending);
  assert.ok(T.events.some((e) => e.kind === "whatsapp_delivery_failed" && e.detail.code === 131047));
  assert.ok(T.events.some((e) => e.kind === "unknown_cloud_number"));
});


// ---------- v4.3 ----------
await test("تعذّر الذكاء = تسليم فوري للمكتب + تنبيه + عدّ الرسالة", async () => {
  const { T, client, f } = setup();
  T.app_secrets = T.app_secrets.map((r) => r.key === "OPENAI_API_KEY" ? { ...r, value: "SET_ME" } : r);
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000020", "ابي شقة للايجار"));
  const c = T.customers[0];
  assert.equal(c.mode, "manual"); assert.equal(c.msg_count, 1);
  const t = waText(waSent(f)[0]);
  assert.ok(t.includes("جاري مراجعته") && t.includes("لإيقاف الرسائل"), t);
  assert.ok(sent(f, "telegram").some((x) => x.body.text.includes("ما قدر يفهم")));
  assert.ok(T.events.some((e) => e.kind === "ai_failed"));
});

await test("«لا تحذف بياناتي» لا تحذف شيئاً", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000021", "السلام عليكم"));
  await handler(ultra("966500000021", "لا تحذف بياناتي، ابي اكمل الطلب"));
  assert.equal(T.customers.length, 1);
  assert.equal(T.privacy_requests.filter((r) => r.kind === "delete_customer").length, 0);
  await handler(ultra("966500000021", "ما ابي تمسح رقمي"));
  assert.equal(T.customers.length, 1);
  await handler(ultra("966500000021", "احذف بياناتي"));
  assert.equal(T.customers.length, 0);
});

await test("إيجار بلا فترة ميزانية = لا يكتمل، ويُسأل سنوي ولا شهري", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  aiNext = { reply: "", status: "مؤهل", mode: "آلي", deal_type: "إيجار", property_type: "شقة",
    location: "النرجس", budget: "60000", budget_period: "", summary: "شقة إيجار بالنرجس" };
  await handler(ultra("966500000022", "ابي شقة ايجار بالنرجس ميزانيتي ٦٠ الف"));
  aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
  const c = T.customers[0];
  assert.equal(c.status, "inquiry"); assert.equal(c.mode, "auto");
  assert.ok(waText(waSent(f)[0]).startsWith("الميزانية هذي سنوي ولا شهري؟"), waText(waSent(f)[0]));
  assert.ok(!sent(f, "telegram").some((x) => x.body.text.includes("عميل مؤهل")));
});

await test("ميتا: أول رد على صورة يحمل الإفصاح", async () => {
  const { client, f } = setup();
  const { handler, pending } = await loadFunction(FN, client, f);
  await handler(meta(metaMsg("966555555555", { type: "image", image: { id: "i9" } })));
  await Promise.all(pending);
  const g = sent(f, "graph.facebook.com").map((c) => c.body.text.body);
  assert.equal(g.length, 1);
  assert.ok(g[0].includes("أفهم الرسائل المكتوبة") && g[0].includes("المساعد الآلي في مكتب الواحة"), g[0]);
});


// ---------- v4.4 ----------
const qualifyAI = { reply: "تمام", status: "مؤهل", mode: "آلي", deal_type: "إيجار", property_type: "شقة",
  location: "النرجس", budget: "60000", budget_period: "سنوي", summary: "يبي شقة إيجار بالنرجس" };
const resetAI = () => { aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" }; };

await test("التسليم يسجّل السبب والوقت، ويُعدّ استهلاك الذكاء والرسائل", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  aiNext = qualifyAI;
  await handler(ultra("966500000030", "ابي شقة ايجار بالنرجس ميزانيتي ٦٠ الف سنوي"));
  resetAI();
  const c = T.customers[0];
  assert.equal(c.handoff_reason, "qualified"); assert.ok(c.handed_at); assert.equal(c.outcome, null);
  const ai = T.__usage.find((u) => u.p_ai_calls === 1);
  assert.deepEqual(ai, { p_office: "o1", p_ai_calls: 1, p_in: 1200, p_cached: 1024, p_out: 80 });
  assert.ok(T.__usage.some((u) => u.p_wa_out === 1 && u.p_office === "o1"));
  assert.ok(sent(f, "telegram").some((x) => x.body.text.includes("سجّل النتيجة")));
});

await test("أسباب التسليم: موظف · حد الرسائل · مالك يعرض · تعذّر الذكاء", async () => {
  let { T, client, f } = setup();
  let { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000031", "ابي اكلم موظف"));
  assert.equal(T.customers[0].handoff_reason, "human");

  ({ T, client, f } = setup());
  T.offices[0].msg_quota = 1;
  ({ handler } = await loadFunction(FN, client, f));
  await handler(ultra("966500000032", "السلام عليكم"));
  await handler(ultra("966500000032", "عندكم شقق؟"));
  assert.equal(T.customers[0].handoff_reason, "quota");

  ({ T, client, f } = setup());
  ({ handler } = await loadFunction(FN, client, f));
  aiNext = { reply: "أبشر", status: "استفسار عام", mode: "آلي", deal_type: "عرض عقار", property_type: "فيلا", location: "الملقا", summary: "مالك يعرض فيلا" };
  await handler(ultra("966500000033", "عندي فيلا ابي اعرضها عندكم"));
  resetAI();
  assert.equal(T.customers[0].handoff_reason, "owner_offer");

  ({ T, client, f } = setup());
  T.app_secrets = T.app_secrets.map((r) => r.key === "OPENAI_API_KEY" ? { ...r, value: "SET_ME" } : r);
  ({ handler } = await loadFunction(FN, client, f));
  await handler(ultra("966500000034", "ابي شقة"));
  assert.equal(T.customers[0].handoff_reason, "ai_error");
  assert.ok(T.__usage.some((u) => u.p_ai_errors === 1));
});

await test("عميل رجع للبوت وتأهل من جديد = نتيجة الاتصال القديمة تتصفّر", async () => {
  const { T, client, f } = setup();
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000035", "السلام عليكم"));
  const c = T.customers[0];
  Object.assign(c, { outcome: "lost", outcome_at: new Date().toISOString(), first_outcome_at: new Date().toISOString(), outcome_by: "s1" });
  aiNext = qualifyAI;
  await handler(ultra("966500000035", "ابي شقة ايجار بالنرجس ميزانيتي ٦٠ الف سنوي"));
  resetAI();
  assert.equal(c.handoff_reason, "qualified");
  assert.equal(c.outcome, null); assert.equal(c.first_outcome_at, null); assert.equal(c.outcome_by, null);
});

await test("ميتا: رد الموظف من جوال المكتب على عميل ينتظر = «تواصلت» تلقائياً", async () => {
  const { T, client, f } = setup();
  const { handler, pending } = await loadFunction(FN, client, f);
  aiNext = qualifyAI;
  await handler(meta(metaMsg("966577777777", { type: "text", text: { body: "ابي شقة ايجار بالنرجس ب٦٠ الف سنوي" } })));
  await Promise.all(pending);
  resetAI();
  const c = T.customers[0];
  assert.equal(c.handoff_reason, "qualified"); assert.equal(c.outcome, null);
  const echo = (to) => meta({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "smb_message_echoes",
    value: { metadata: { phone_number_id: "109876543210" },
      message_echoes: [{ from: "966500009999", to, id: crypto.randomUUID(), type: "text", text: { body: "هلا، معك سعد من المكتب" } }] } }] }] });
  await handler(echo("966577777777"));
  await Promise.all(pending);
  assert.equal(c.outcome, "contacted"); assert.ok(c.first_outcome_at);
  assert.ok(T.events.some((e) => e.kind === "outcome_auto"));
  // رد ثانٍ لا يغيّر نتيجة مسجّلة
  c.outcome = "viewing";
  await handler(echo("966577777777"));
  await Promise.all(pending);
  assert.equal(c.outcome, "viewing");
});

// ===================== v4.5: رخصة فال =====================
const QUALIFY = { reply: "تمام", status: "مؤهل", mode: "آلي", deal_type: "إيجار", property_type: "شقة",
  location: "النرجس", budget: "60000", budget_period: "سنوي", summary: "يبي شقة إيجار بالنرجس" };
const MATCH = [{ title: "شقة النرجس A12", district: "النرجس", rooms: 3, price: 55000,
  ad_license_no: "7200034512", grade: "تطابق قوي", score: 80 }];
const tgOffice = (f, chat) => sent(f, "telegram").filter((x) => x.body.chat_id === chat);

await test("فال بانتظار التحقق: العميل ما يوصله رد ولا تُحفظ بياناته، والمكتب يُنبَّه مرة وحدة", async () => {
  const { T, client, f } = setup();
  T.offices[0].fal_status = "pending"; T.offices[0].fal_expires_on = null;
  const { handler } = await loadFunction(FN, client, f);
  const r = await (await handler(ultra("966500000031", "السلام عليكم ابي شقة"))).json();
  assert.equal(r.skipped, "fal_unverified");
  await handler(ultra("966500000032", "مرحبا"));
  assert.equal(waSent(f).length, 0, "bot replied");
  assert.equal(sent(f, "openai").length, 0, "AI called");
  assert.equal(T.customers.length, 0, "customer stored"); assert.equal(T.messages.length, 0);
  const n = tgOffice(f, "-100");
  assert.equal(n.length, 1, "office should be told once"); assert.match(n[0].body.text, /بانتظار تحقق مقصد/);
  assert.equal(T.events.filter((e) => e.kind === "fal_blocked").length, 1);
});

await test("فال مرفوضة: نفس الإيقاف، والتنبيه يقول إنها ما اعتُمدت", async () => {
  const { T, client, f } = setup();
  T.offices[0].fal_status = "rejected";
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000033", "ابي فيلا"));
  assert.equal(waSent(f).length, 0);
  assert.match(tgOffice(f, "-100")[0].body.text, /ما اعتُمدت/);
});

await test("فال بانتظار التحقق: موظف المكتب ومشغّل المنصة يجرّبون المساعد كامل", async () => {
  const { T, client, f } = setup();
  T.offices[0].fal_status = "pending"; T.offices[0].fal_expires_on = null;
  T.staff = [{ id: "s1", office_id: "o1", phone: "966500000041", role: "owner", active: true },
             { id: "sa", office_id: "o2", phone: "966500000049", role: "super_admin", active: true },
             { id: "s9", office_id: "o2", phone: "966500000042", role: "agent", active: true }];
  T.__matches = MATCH;
  const { handler } = await loadFunction(FN, client, f);
  aiNext = QUALIFY;
  await handler(ultra("966500000041", "ابي شقة ايجار بالنرجس ٦٠ الف سنوي"));
  const t = waText(waSent(f)[0]);
  assert.ok(t.includes("شقة النرجس A12"), "tester should see listings: " + t);
  const sys = sent(f, "openai")[0].body.messages[0].content;
  assert.ok(!sys.includes("1200012345"), "unverified license number given to the AI");
  await handler(ultra("966500000049", "ابي شقة ايجار بالنرجس ٦٠ الف سنوي"));
  assert.equal(waSent(f).length, 2, "operator should get a reply");
  // موظف مكتب ثاني ما يُعتبر مجرّباً هنا
  await handler(ultra("966500000042", "ابي شقة"));
  assert.equal(waSent(f).length, 2, "other office agent got a reply");
  aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
});

await test("فال منتهية: الطلب يُستقبل ويُسلَّم، بلا عرض عقارات وبلا ذكر رقم الرخصة", async () => {
  const { T, client, f } = setup();
  T.offices[0].fal_expires_on = riyadh(-1);
  T.__matches = MATCH;
  const { handler } = await loadFunction(FN, client, f);
  aiNext = QUALIFY;
  const r = await (await handler(ultra("966500000051", "ابي شقة ايجار بالنرجس ٦٠ الف سنوي"))).json();
  aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
  assert.equal(r.route, "qualified_fal_expired");
  const t = waText(waSent(f)[0]);
  assert.ok(!t.includes("شقة النرجس") && !t.includes("ترخيص إعلان"), "listing shown: " + t);
  assert.ok(t.includes("بالخيارات المناسبة لطلبك") && !t.includes("ما لقينا"), t);
  const c = T.customers[0];
  assert.equal(c.status, "qualified"); assert.equal(c.mode, "manual"); assert.equal(c.handoff_reason, "qualified");
  assert.ok(tgOffice(f, "-100").some((x) => /رخصة فال للمكتب منتهية/.test(x.body.text)));
  assert.ok(!sent(f, "openai")[0].body.messages[0].content.includes("1200012345"));
});

await test("فال سارية: رقم الرخصة يوصل للمساعد، واليوم الأخير للرخصة ما زال ساري", async () => {
  const { T, client, f } = setup();
  T.offices[0].fal_expires_on = riyadh(0);
  T.__matches = MATCH;
  const { handler } = await loadFunction(FN, client, f);
  aiNext = QUALIFY;
  const r = await (await handler(ultra("966500000052", "ابي شقة ايجار بالنرجس ٦٠ الف سنوي"))).json();
  aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
  assert.equal(r.route, "qualified_with_matches");
  assert.ok(sent(f, "openai")[0].body.messages[0].content.includes("رخصة فال 1200012345"));
});

await test("ميتا: مكتب بانتظار التحقق ما يرد حتى على الصور", async () => {
  const { T, client, f } = setup();
  T.offices[1].fal_status = "pending";
  const { handler, pending } = await loadFunction(FN, client, f);
  await handler(meta(metaMsg("966522222299", { type: "image", image: { id: "i9" } })));
  await handler(meta(metaMsg("966522222299", { type: "text", text: { body: "هلا" } })));
  await Promise.all(pending);
  assert.equal(sent(f, "graph.facebook.com").length, 0);
  assert.equal(T.customers.length, 0);
});

// ---------- التنبيهات: تيليجرام و/أو الجوال ----------
async function vapid() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const j = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const raw = Buffer.from(await crypto.subtle.exportKey("raw", kp.publicKey)).toString("base64url");
  return JSON.stringify({ pub: raw, jwk: { kty: j.kty, crv: j.crv, d: j.d, x: j.x, y: j.y } });
}
const DEVICE = { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" };
async function notifySetup(prefs) {
  const x = setup();
  x.T.app_secrets.push({ key: "VAPID_KEYS", value: await vapid() });
  x.T.push_subs = [
    { id: 1, office_id: "o1", staff_id: "s1", endpoint: "https://fcm.googleapis.com/fcm/send/dev1", ...DEVICE, fails: 0 },
    { id: 2, office_id: "o1", staff_id: "s2", endpoint: "https://fcm.googleapis.com/fcm/send/gone", ...DEVICE, fails: 0 },
    { id: 3, office_id: "o2", staff_id: "s9", endpoint: "https://fcm.googleapis.com/fcm/send/other", ...DEVICE, fails: 0 },
  ];
  Object.assign(x.T.offices[0], prefs);
  x.T.__matches = MATCH;
  return x;
}
async function qualify(x, phone) {
  const { handler, pending } = await loadFunction(FN, x.client, x.f);
  aiNext = QUALIFY;
  const r = await (await handler(ultra(phone, "ابي شقة ايجار بالنرجس ٦٠ الف سنوي"))).json();
  await Promise.all(pending);
  aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
  return r;
}

await test("تنبيه عميل مؤهل: يوصل تيليجرام وأجهزة المكتب نفسه فقط، ويحذف الجهاز الملغي", async () => {
  const x = await notifySetup({});
  const r = await qualify(x, "966500000071");
  assert.equal(r.route, "qualified_with_matches");
  assert.equal(sent(x.f, "api.telegram.org").length, 1);
  const pushes = sent(x.f, "fcm.googleapis.com").map((c) => c.url);
  assert.deepEqual(pushes.sort(), ["https://fcm.googleapis.com/fcm/send/dev1", "https://fcm.googleapis.com/fcm/send/gone"]);
  assert.ok(x.T.push_subs.every((p) => p.id !== 2), "الجهاز الملغي (410) ما انحذف");
  assert.ok(x.T.push_subs.find((p) => p.id === 1).last_ok_at);
});

await test("المكتب اختار الجوال فقط: لا تيليجرام", async () => {
  const x = await notifySetup({ notify_telegram: false });
  await qualify(x, "966500000072");
  assert.equal(sent(x.f, "api.telegram.org").length, 0);
  assert.ok(sent(x.f, "fcm.googleapis.com").length >= 1);
});

await test("المكتب اختار تيليجرام فقط: لا إشعار جوال", async () => {
  const x = await notifySetup({ notify_push: false });
  await qualify(x, "966500000073");
  assert.equal(sent(x.f, "api.telegram.org").length, 1);
  assert.equal(sent(x.f, "fcm.googleapis.com").length, 0);
});

await test("بلا مفاتيح إشعارات: تيليجرام يشتغل عادي", async () => {
  const x = setup(); x.T.__matches = MATCH;
  x.T.push_subs = [{ id: 1, office_id: "o1", endpoint: "https://fcm.googleapis.com/fcm/send/dev1", ...DEVICE, fails: 0 }];
  await qualify(x, "966500000074");
  assert.equal(sent(x.f, "api.telegram.org").length, 1);
  assert.equal(sent(x.f, "fcm.googleapis.com").length, 0);
});

// ---------- رسائل تصل أثناء المعالجة (C1) ----------
// محاكاة واقعية: العميل يرسل رسالة جديدة بينما الذكاء يفكر في رسالته السابقة
function raceSetup(phone, injectOn) {
  const { T, client } = makeDb(seed);
  let n = 0;
  const f = makeFetch((body) => {
    n++;
    const extra = injectOn(n);
    if (extra) client.rpc("ingest_message", {
      p_office: "o1", p_wa_id: phone + "@c.us", p_phone: phone, p_name: "",
      p_msg_id: crypto.randomUUID(), p_body: extra, p_lock_sec: 90,
    });
    return { reply: `رد رقم ${n}`, status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
  });
  return { T, client, f, aiCalls: () => n };
}
const aiUserText = (f, i) => sent(f, "api.openai.com")[i].body.messages.at(-1).content;

await test("رسالة تصل أثناء تفكير الذكاء لا تضيع: يُرد عليها في دورة ثانية", async () => {
  const x = raceSetup("966500000081", (n) => n === 1 ? "بالنرجس ٣ غرف ميزانيتي ٤٠ الف" : null);
  const { handler } = await loadFunction(FN, x.client, x.f);
  await handler(ultra("966500000081", "ابي شقة للإيجار"));
  assert.equal(x.aiCalls(), 2, "الذكاء لم يُسأل عن الرسالة الثانية");
  assert.ok(aiUserText(x.f, 0).includes("ابي شقة للإيجار"));
  assert.ok(aiUserText(x.f, 1).includes("بالنرجس ٣ غرف"), "الدورة الثانية لم تحمل الرسالة الجديدة");
  assert.ok(!aiUserText(x.f, 1).includes("ابي شقة للإيجار"), "الدورة الثانية أعادت الرسالة الأولى");
  assert.equal(waSent(x.f).length, 2, "المتوقع ردّان");
  const c = x.T.customers[0];
  assert.equal(c.buffer, ""); assert.equal(c.locked_until, null);
  assert.equal(x.T.messages.filter((m) => m.direction === "in").length, 1, "رسالة الحقن تُحفظ عبر مسار الاستقبال لا هنا");
});

await test("بلا رسائل جديدة: دورة واحدة فقط ويُفك القفل", async () => {
  const x = raceSetup("966500000082", () => null);
  const { handler } = await loadFunction(FN, x.client, x.f);
  await handler(ultra("966500000082", "السلام عليكم"));
  assert.equal(x.aiCalls(), 1);
  assert.equal(x.T.__finishTurn.length, 1);
  assert.equal(x.T.__finishTurn[0].left, "");
  assert.equal(x.T.customers[0].locked_until, null);
});

await test("رسائل متواصلة بلا توقف: لا حلقة لا نهائية، والنص الأخير يبقى للرسالة القادمة", async () => {
  const x = raceSetup("966500000083", (n) => `رسالة إضافية ${n}`);
  const { handler } = await loadFunction(FN, x.client, x.f);
  await handler(ultra("966500000083", "مرحبا"));
  assert.equal(x.aiCalls(), 4, "الحد الأقصى ٤ دورات");
  const c = x.T.customers[0];
  assert.equal(c.locked_until, null, "القفل لازم يُفك بعد الحد");
  assert.equal(c.buffer, "رسالة إضافية 4", "آخر نص لم يُرد عليه يبقى في المخزن");
  assert.ok(x.T.events.some((e) => e.kind === "turn_rounds_exceeded"));
});

await test("لو تعطلت finish_turn: يُفك القفل بالطريقة القديمة ولا يعلق العميل", async () => {
  const x = raceSetup("966500000084", () => null);
  const rpc = x.client.rpc;
  x.client.rpc = async (name, args) => name === "finish_turn" ? { data: null, error: { message: "missing function" } } : rpc(name, args);
  const { handler } = await loadFunction(FN, x.client, x.f);
  await handler(ultra("966500000084", "السلام عليكم"));
  const c = x.T.customers[0];
  assert.equal(c.locked_until, null); assert.equal(c.buffer, "");
  assert.ok(x.T.events.some((e) => e.kind === "finish_turn_failed"));
});

await test("رسالة تصل أثناء تسليم العميل للموظف: البوت يبقى صامتاً في الدورة الثانية", async () => {
  const x = raceSetup("966500000085", (n) => n === 1 ? "ابي اكلم موظف" : null);
  const { handler } = await loadFunction(FN, x.client, x.f);
  await handler(ultra("966500000085", "ابي فيلا للشراء"));
  // الدورة الثانية تكشف طلب الموظف بالكلمات قبل الذكاء: تحويل بلا سؤال ثانٍ للذكاء
  assert.equal(x.aiCalls(), 1);
  const c = x.T.customers[0];
  assert.equal(c.mode, "manual"); assert.equal(c.handoff_reason, "human");
  assert.equal(c.buffer, ""); assert.equal(c.locked_until, null);
});

await test("معالج قديم ينهي متأخراً: لا يمسح رسالة أحدث عالجها غيره", async () => {
  const { T, client } = makeDb(seed);
  T.customers.push({ id: "c-late", office_id: "o1", wa_id: "x", phone: "x", buffer: "رسالة أحدث", locked_until: 123, recent_ids: [] });
  const { data } = await client.rpc("finish_turn", { p_customer: "c-late", p_consumed: "رسالة قديمة" });
  assert.equal(data, "");
  assert.equal(T.customers[0].buffer, "رسالة أحدث");
  assert.equal(T.customers[0].locked_until, 123, "القفل ليس له");
});

// ---------- الرسائل الصوتية (v4.8) ----------
const OGG = new Uint8Array(4000).fill(7);
const voiceSetup = ({ stt, officeFal, media, enabled = "UFQ,WHA" } = {}) => {
  const s = structuredClone(seed);
  s.app_secrets.push({ key: "VOICE_OFFICES", value: enabled });
  s.offices[0].code = "UFQ"; s.offices[1].code = "WHA";
  if (officeFal) Object.assign(s.offices[0], officeFal);
  const { T, client } = makeDb(s);
  const f = makeFetch(() => aiNext, {
    stt: stt ?? { text: "ابي شقة للإيجار في النرجس", usage: { type: "duration", seconds: 7 } },
    media: media ?? ((u) => u.startsWith("https://cdn.voice.test/")
      ? new Response(OGG, { status: 200, headers: { "content-type": "audio/ogg" } }) : null),
  });
  return { T, client, f };
};
const ptt = (from, id, media = "https://cdn.voice.test/v1.ogg") => new Request("https://x/wa-webhook?k=wk", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ instanceId: "instance190700", data: { from: from + "@c.us", body: "", id: id ?? crypto.randomUUID(), type: "ptt", media, pushname: "أبو فهد" } }),
});
const sttCalls = (f) => sent(f, "audio/transcriptions");
const chatCalls = (f) => sent(f, "chat/completions");
const voiceKey = (office, waId) => createHash("sha256").update(`voice|${office}|${waId}|wk`).digest("hex");

await test("صوتية: تتحول نصاً ويرد عليها البوت، ويُحفظ النص بعلامة 🎤", async () => {
  const { T, client, f } = voiceSetup();
  const { handler } = await loadFunction(FN, client, f);
  const r = await handler(ptt("966500000071"));
  assert.equal(r.status, 200);
  const st = sttCalls(f);
  assert.equal(st.length, 1, "no transcription call");
  assert.equal(st[0].body.model, "gpt-transcribe");
  assert.equal(st[0].body.language, "ar");
  assert.equal(st[0].body.file.name, "voice.ogg");
  assert.ok(st[0].body.prompt.includes("النرجس"));
  assert.ok(String(st[0].headers.Authorization).includes("sk-test"));
  assert.equal(T.messages.find((m) => m.direction === "in").body, "🎤 ابي شقة للإيجار في النرجس");
  assert.equal(chatCalls(f).length, 1, "AI not asked");
  assert.ok(chatCalls(f)[0].body.messages.at(-1).content.includes("🎤 ابي شقة للإيجار"));
  assert.ok(chatCalls(f)[0].body.messages[0].content.includes("نص محوّل آلياً من رسالة صوتية"));
  assert.equal(waSent(f).length, 1, "no reply");
  const ev = T.events.find((e) => e.kind === "voice_ok");
  assert.equal(ev.detail.sec, 7);
  assert.equal(ev.detail.k, voiceKey("o1", "966500000071@c.us"));
});

await test("صوتية لمكتب ما فُعّلت له الميزة: تُتجاهل كما كان", async () => {
  const { T, client, f } = voiceSetup({ enabled: "OTHER" });
  const { handler } = await loadFunction(FN, client, f);
  const r = await (await handler(ptt("966500000072"))).json();
  assert.equal(r.skipped, "not a customer text message");
  assert.equal(sttCalls(f).length, 0);
  assert.equal(waSent(f).length, 0);
  assert.equal(T.customers.length, 0);
});

await test("فشل التحويل: رد لطيف يطلب الكتابة، مرة وحدة كل ٣٠ دقيقة", async () => {
  const { T, client, f } = voiceSetup({ stt: () => new Response("err", { status: 500 }) });
  const { handler } = await loadFunction(FN, client, f);
  await handler(ptt("966500000073"));
  await handler(ptt("966500000073"));
  const nudges = waSent(f).filter((c) => waText(c).includes("ما قدرت أسمعها"));
  assert.equal(nudges.length, 1);
  assert.ok(waText(nudges[0]).includes("المساعد الآلي"), "أول رد بلا إفصاح");
  const fails = T.events.filter((e) => e.kind === "voice_failed");
  assert.equal(fails.length, 2);
  assert.ok(fails[0].detail.reason.startsWith("stt 500"), fails[0].detail.reason);
  assert.equal(chatCalls(f).length, 0);
});

await test("تعدّى الحد اليومي: يُسلَّم لموظف بلا تحويل، ولا يُقال للعميل «وصلت الحد»", async () => {
  const { T, client, f } = voiceSetup();
  const k = voiceKey("o1", "966500000074@c.us");
  for (let i = 0; i < 15; i++) {
    T.events.push({ id: 900 + i, office_id: "o1", kind: "voice_ok", level: "info", detail: { k, sec: 5 }, created_at: new Date().toISOString() });
  }
  const { handler } = await loadFunction(FN, client, f);
  await handler(ptt("966500000074"));
  assert.equal(sttCalls(f).length, 0, "حوّل صوتية فوق الحد");
  const reply = waText(waSent(f).at(-1));
  assert.ok(reply.includes("حوّلنا طلبك للمستشار"), reply);
  assert.ok(!reply.includes("الحد"), "العميل عرف بالحد");
  assert.equal(T.customers[0].mode, "manual");
  assert.equal(T.customers[0].handoff_reason, "human");
  assert.ok(sent(f, "telegram").some((t) => t.body.text.includes("فوق الحد")), "المكتب ما تنبّه");
  assert.ok(T.events.some((e) => e.kind === "voice_limit" && e.detail.scope === "customer"));
  assert.equal(chatCalls(f).length, 0);
});

await test("تعدّى المكتب دقائق الشهر: التسليم لموظف بنفس الطريقة", async () => {
  const { T, client, f } = voiceSetup();
  T.events.push({ id: 950, office_id: "o1", kind: "voice_ok", level: "info", detail: { k: "someone", sec: 600 * 60 }, created_at: new Date().toISOString() });
  const { handler } = await loadFunction(FN, client, f);
  await handler(ptt("966500000075"));
  assert.equal(sttCalls(f).length, 0);
  assert.ok(T.events.some((e) => e.kind === "voice_limit" && e.detail.scope === "office"));
  assert.equal(T.customers[0].mode, "manual");
});

await test("نفس الصوتية وصلت مرتين: تحويل واحد ورد واحد", async () => {
  const { client, f } = voiceSetup();
  const { handler } = await loadFunction(FN, client, f);
  await handler(ptt("966500000076", "dup-1"));
  await handler(ptt("966500000076", "dup-1"));
  assert.equal(sttCalls(f).length, 1);
  assert.equal(waSent(f).length, 1);
});

await test("«توقف» بالصوت تنفَّذ مثل الكتابة", async () => {
  const { T, client, f } = voiceSetup({ stt: { text: "توقف" } });
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000077", "السلام عليكم"));
  await handler(ptt("966500000077"));
  assert.equal(T.customers[0].opted_out, true);
  assert.ok(waText(waSent(f).at(-1)).includes("أوقفنا الرسائل الآلية"));
  assert.equal(T.events.find((e) => e.kind === "voice_ok").detail.sec, 2, "تقدير المدة من الحجم");
});

await test("مكتب فال غير متحقق: صوتية عميل عادي لا تُحوّل ولا يُرد عليها", async () => {
  const { T, client, f } = voiceSetup({ officeFal: { fal_status: "pending", fal_expires_on: null } });
  const { handler } = await loadFunction(FN, client, f);
  const r = await (await handler(ptt("966500000078"))).json();
  assert.equal(r.skipped, "fal_unverified");
  assert.equal(sttCalls(f).length, 0);
  assert.equal(waSent(f).length, 0);
  assert.ok(T.events.some((e) => e.kind === "fal_blocked"));
});

await test("مكتب فال غير متحقق: صوتية موظف المكتب تتحول للتجربة", async () => {
  const { T, client, f } = voiceSetup({ officeFal: { fal_status: "pending", fal_expires_on: null } });
  T.staff = [{ id: "s1", office_id: "o1", phone: "966500000079", role: "owner", active: true }];
  const { handler } = await loadFunction(FN, client, f);
  await handler(ptt("966500000079"));
  assert.equal(sttCalls(f).length, 1);
  assert.equal(waSent(f).length, 1);
});

await test("ميتا: الصوتية تُجلب من ميتا بالتوكن وتتحول وتُعالج", async () => {
  const { T, client, f } = voiceSetup({ media: (u) => {
    if (u === "https://graph.facebook.com/v21.0/aud-1") {
      return new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1",
        mime_type: "audio/ogg; codecs=opus", file_size: 4000 }), { status: 200 });
    }
    if (u.startsWith("https://lookaside.fbsbx.com/")) {
      return new Response(OGG, { status: 200, headers: { "content-type": "audio/ogg; codecs=opus" } });
    }
    return null;
  } });
  const { handler, pending } = await loadFunction(FN, client, f);
  await handler(meta(metaMsg("966544444444", { type: "audio", audio: { id: "aud-1", mime_type: "audio/ogg; codecs=opus", voice: true } })));
  await Promise.all(pending);
  assert.equal(f.calls.find((c) => c.url === "https://graph.facebook.com/v21.0/aud-1").headers.Authorization, "Bearer EAAG");
  assert.equal(f.calls.find((c) => c.url.startsWith("https://lookaside.fbsbx.com/")).headers.Authorization, "Bearer EAAG");
  assert.equal(sttCalls(f).length, 1);
  assert.equal(sttCalls(f)[0].body.file.name, "voice.ogg");
  assert.equal(T.messages.find((m) => m.direction === "in").body, "🎤 ابي شقة للإيجار في النرجس");
  assert.equal(sent(f, "graph.facebook.com/v21.0/109876543210/messages").length, 1);
});

await test("ميتا: ملف صوتي كبير لا يُرسل للتحويل، ويُطلب من العميل الكتابة", async () => {
  const { T, client, f } = voiceSetup({ media: (u) => u === "https://graph.facebook.com/v21.0/aud-big"
    ? new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/x", mime_type: "audio/ogg", file_size: 5_000_000 }), { status: 200 })
    : null });
  const { handler, pending } = await loadFunction(FN, client, f);
  await handler(meta(metaMsg("966555555555", { type: "audio", audio: { id: "aud-big" } })));
  await Promise.all(pending);
  assert.equal(sttCalls(f).length, 0);
  assert.equal(T.events.find((e) => e.kind === "voice_failed").detail.reason, "too_large");
  assert.ok(sent(f, "graph.facebook.com/v21.0/109876543210/messages").some((c) => c.body.text.body.includes("ما قدرت أسمعها")));
});

// ---------- نموذج الذكاء (v4.9) ----------
const modelSetup = (extra = [], failModel = null) => {
  const s = structuredClone(seed);
  s.app_secrets.push(...extra);
  const { T, client } = makeDb(s);
  const base = makeFetch(() => aiNext);
  const f = async (u, init = {}) => {
    if (failModel && String(u).includes("chat/completions") && JSON.parse(init.body).model === failModel) {
      base.calls.push({ url: String(u), body: JSON.parse(init.body) });
      return new Response("model down", { status: 500 });
    }
    return base(u, init);
  };
  f.calls = base.calls;
  return { T, client, f };
};

await test("AI_MODEL=gpt-6-luna: يُرسل بإعدادات نماذج التفكير (بلا max_tokens ولا temperature)", async () => {
  const { client, f } = modelSetup([{ key: "AI_MODEL", value: "gpt-6-luna" }]);
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000091", "ابي شقة"));
  const c = sent(f, "chat/completions")[0].body;
  assert.equal(c.model, "gpt-6-luna");
  assert.equal(c.max_completion_tokens, 1500);
  assert.equal(c.reasoning_effort, "low");
  assert.equal(c.max_tokens, undefined);
  assert.equal(c.temperature, undefined);
  assert.equal(c.response_format.type, "json_object");
});

await test("بدون AI_MODEL: يبقى gpt-4o-mini بإعداداته القديمة", async () => {
  const { client, f } = modelSetup();
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000092", "ابي شقة"));
  const c = sent(f, "chat/completions")[0].body;
  assert.equal(c.model, "gpt-4o-mini"); assert.equal(c.max_tokens, 800); assert.equal(c.temperature, 0.2);
});

await test("النموذج الجديد تعطّل: يرجع تلقائياً لـ gpt-4o-mini ويرد على العميل بلا تسليم", async () => {
  const { T, client, f } = modelSetup([{ key: "AI_MODEL", value: "gpt-6-luna" }], "gpt-6-luna");
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000093", "ابي شقة"));
  const calls = sent(f, "chat/completions").map((c) => c.body.model);
  assert.deepEqual(calls, ["gpt-6-luna", "gpt-4o-mini"]);
  assert.equal(T.customers[0].mode, "auto", "سُلّم لموظف بدل الرجوع للنموذج القديم");
  assert.ok(T.events.some((e) => e.kind === "ai_fallback" && e.detail.model === "gpt-6-luna"));
  assert.equal(waSent(f).length, 1);
});

await test("ميزانية بأرقام عربية وفواصل («٤٠٬٠٠٠») تُحفظ 40000", async () => {
  const { T, client, f } = modelSetup();
  aiNext = { reply: "سنوي ولا شهري؟", deal_type: "إيجار", property_type: "شقة", location: "النرجس",
    budget: "٤٠٬٠٠٠ ريال", status: "استفسار عام", mode: "آلي", summary: "شقة بالنرجس" };
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000094", "ابي شقة بالنرجس ميزانيتي ٤٠ الف"));
  assert.equal(T.customers[0].budget, 40000);
  aiNext = { reply: "هلا فيك، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي", summary: "عميل جديد" };
});

// ---------- v5.0: تقليل ما يطلع للذكاء الاصطناعي ----------
await test("الاسم والجوال والهوية والإيميل ما توصل للذكاء، وترجع القيم الحقيقية للعميل وللقاعدة", async () => {
  const { T, client } = makeDb(seed);
  const f = makeFetch(() => ({
    reply: "هلا أبو {{اسم1}}، وش تبي إيجار ولا شراء؟", name: "أبو {{اسم1}}",
    summary: "أبو {{اسم1}} أرسل جوال {{جوال1}}", status: "استفسار عام", mode: "آلي",
  }));
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000301", "معك أبو فهد جوالي 0551234567 وهويتي 1087654321 ايميلي fahad.q@outlook.com ابي شقة ميزانيتي 500000 ريال"));
  const ai = sent(f, "api.openai.com")[0].body;
  const all = ai.messages.map((m) => m.content).join("\n");
  for (const secret of ["فهد", "0551234567", "1087654321", "fahad.q@outlook.com", "966500000301"]) {
    assert.ok(!all.includes(secret), "leaked to AI: " + secret);
  }
  assert.ok(all.includes("أبو {{اسم1}}") && all.includes("{{جوال1}}") && all.includes("{{هوية1}}"), all);
  assert.ok(all.includes("500000 ريال"), "budget must stay visible");
  assert.ok(all.includes("مخاطبة العميل: [مذكر]"));
  assert.equal(ai.store, false);
  const out = waText(waSent(f)[0]);
  assert.ok(out.startsWith("هلا أبو فهد، وش تبي"), out);
  assert.equal(T.customers[0].name, "أبو فهد");
  assert.ok(T.customers[0].summary.includes("0551234567"), T.customers[0].summary);
});

await test("رمز مجهول أو محرّف من الذكاء ما يوصل للعميل", async () => {
  const { client } = makeDb(seed);
  const f = makeFetch(() => ({ reply: "هلا {{اسم7}}، تبي إيجار ولا شراء؟ {{ جوال 9 }}", status: "استفسار عام", mode: "آلي" }));
  const { handler } = await loadFunction(FN, client, f);
  await handler(ultra("966500000302", "السلام عليكم"));
  const out = waText(waSent(f)[0]);
  assert.ok(!out.includes("{{") && !out.includes("}}"), out);
  assert.ok(out.startsWith("هلا، تبي إيجار ولا شراء؟"), out);
});

await test("الاسم المخزّن والملخص السابق يُخفون قبل الإرسال، والعميلة تُخاطب بالمؤنث", async () => {
  const { T, client } = makeDb(seed);
  const f = makeFetch(() => aiNext);
  const { handler, mod } = await loadFunction(FN, client, f);
  const v = mod.__test.newVault();
  const u = mod.__test.aiUserPrompt({ name: "نورة القحطاني", summary: "نورة القحطاني تبحث عن شقة، جوالها 0551112222",
    buffer: "اسمي نورة ابي شقة", mode: "auto" }, v, "Noura");
  assert.ok(!/نورة|القحطاني|0551112222|Noura/.test(u), u);
  assert.ok(u.includes("مخاطبة العميل: [مؤنث]"));
  assert.ok(u.includes("الاسم: [{{اسم1}} {{اسم2}}]"), u);
  assert.equal(mod.__test.unmask(v, "هلا {{اسم1}}"), "هلا نورة");
});

await test("أرقام المبالغ والمساحات ما تُخفى، وأرقام الجوال بأي صيغة تُخفى", async () => {
  const { client } = makeDb(seed);
  const { mod } = await loadFunction(FN, client, makeFetch(() => aiNext));
  const { maskText, newVault } = mod.__test;
  const m = (t) => maskText(newVault(), t, []);
  assert.equal(m("ميزانيتي 1500000 ريال"), "ميزانيتي 1500000 ريال");
  assert.equal(m("الميزانية 500000000"), "الميزانية 500000000");
  assert.equal(m("ارض 900 متر بـ 3,500,000"), "ارض 900 متر بـ 3,500,000");
  assert.equal(m("٤ غرف بـ ٤٠ الف"), "٤ غرف بـ ٤٠ الف");
  assert.equal(m("كلمني 0551234567"), "كلمني {{جوال1}}");
  assert.equal(m("كلمني +966 55 123 4567"), "كلمني {{جوال1}}");
  assert.equal(m("كلمني ٠٥٥١٢٣٤٥٦٧"), "كلمني {{جوال1}}");
  assert.equal(m("الثابت 0114567890"), "الثابت {{رقم1}}");
  assert.equal(m("اقامتي 2456789012"), "اقامتي {{هوية1}}");
  assert.equal(m("SA0380000000608010167519 حسابي"), "{{آيبان1}} حسابي");
  assert.equal(m("هل معك شقق بالياسمين"), "هل معك شقق بالياسمين");
});

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
