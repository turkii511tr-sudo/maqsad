// اختبار محرك واتساب v4 بسيناريوهات حقيقية — بدون لمس قاعدة البيانات الحية
import { makeDb, makeFetch, loadFunction, sign } from "./harness.mjs";
import assert from "node:assert/strict";

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

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
