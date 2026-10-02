// سلوك موظف المبيعات في محرك واتساب (v5.2): الميزانية الغامضة، المخزون والمدينة، العميل الراجع، التسليم بالحالة
// السيناريو الأول مأخوذ من محادثة حقيقية (٢ أكتوبر ٢٠٢٦): «45» حُفظت 45 ريال سنوي وقيل للعميل ما فيه عقار،
// والمخزون فيه شقتان إيجار في النرجس بـ 42 و48 ألف.
import { makeDb, makeFetch, loadFunction } from "./harness.mjs";
import assert from "node:assert/strict";

const FN = new URL("../functions/wa-webhook/index.ts", import.meta.url).pathname;
const riyadh = (d = 0) => new Date(Date.now() + 3 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const STOCK = [
  { office_id: "o1", city: "الرياض", district: "النرجس", deal_type: "إيجار", property_type: "شقة", price: 42000 },
  { office_id: "o1", city: "الرياض", district: "النرجس", deal_type: "إيجار", property_type: "شقة", price: 48000 },
  { office_id: "o1", city: "الرياض", district: "حطين", deal_type: "بيع", property_type: "فيلا", price: 2350000 },
];
const seed = (stock = STOCK, fal = "verified") => ({
  app_secrets: [{ key: "WEBHOOK_SECRET", value: "wk" }, { key: "OPENAI_API_KEY", value: "sk-test" },
    { key: "TELEGRAM_BOT_TOKEN", value: "123:abc" }],
  offices: [{ id: "o1", name: "مكتب الأفق", license_no: "1200012345", wa_provider: "ultramsg",
    wa_instance: "instance190700", wa_instance_key: "190700", wa_token: "t", active: true,
    debounce_seconds: 0, msg_quota: 15, telegram_chat_id: "-100", fal_status: fal, fal_expires_on: riyadh(365) }],
  v_listable_properties: stock,
});

let aiNext = {};
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(["✓", name]); } catch (e) { results.push(["✗", name, e.message]); }
}
async function setup(stock, fal) {
  const { T, client } = makeDb(seed(stock, fal));
  const f = makeFetch(() => aiNext);
  const { handler } = await loadFunction(FN, client, f);
  return { T, f, handler };
}
const msg = (from, body) => new Request("https://x/wa-webhook?k=wk", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ instanceId: "instance190700", data: { from: from + "@c.us", body, id: crypto.randomUUID(), type: "chat", pushname: "Ai Agent" } }),
});
const waOut = (f) => f.calls.filter((c) => c.url.includes("ultramsg")).map((c) => c.body.body);
const tg = (f) => f.calls.filter((c) => c.url.includes("telegram")).map((c) => c.body.text);
const aiPrompt = (f, i = -1) => f.calls.filter((c) => c.url.includes("api.openai.com")).at(i).body.messages.at(-1).content;
const base = { status: "استفسار عام", mode: "آلي", summary: "يبحث عن شقة إيجار في النرجس",
  deal_type: "إيجار", property_type: "شقة", location: "النرجس" };

// ---------- الميزانية ----------
await test("«45» بلا ألف: ما تُحفظ 45 ريال، ويُسأل «تقصد 45 ألف ريال سنوياً؟» بلا تسليم", async () => {
  const { T, f, handler } = await setup();
  aiNext = { ...base, reply: "وصلتني ميزانيتك 45، تمام.", budget: "45", budget_period: "سنوي" };
  await handler(msg("966500000101", "45 سنوي"));
  const c = T.customers[0];
  assert.equal(c.budget ?? null, null, "حُفظت ميزانية غير مؤكدة");
  assert.equal(c.mode, "auto"); assert.equal(c.status, "inquiry");
  assert.ok(waOut(f)[0].startsWith("تقصد 45 ألف ريال سنوياً؟"), waOut(f)[0]);
  assert.ok(!tg(f).some((t) => t.includes("عميل مؤهل")), "سُلّم قبل التأكيد");
});

await test("الذكاء كبّر «45» إلى 45000 من عنده: يُطلب تأكيد أيضاً", async () => {
  const { T, f, handler } = await setup();
  aiNext = { ...base, reply: "تمام، 45 ألف.", budget: "45000", budget_period: "سنوي" };
  await handler(msg("966500000102", "45"));
  assert.equal(T.customers[0].budget ?? null, null);
  assert.ok(/تقصد 45 ألف/.test(waOut(f)[0]), waOut(f)[0]);
});

await test("سؤال التأكيد من الذكاء نفسه يُقبل كما هو", async () => {
  const { f, handler } = await setup();
  aiNext = { ...base, reply: "تقصد 45 ألف ريال بالسنة؟", budget: "45", budget_period: "سنوي" };
  await handler(msg("966500000103", "ميزانيتي 45"));
  assert.ok(waOut(f)[0].startsWith("تقصد 45 ألف ريال بالسنة؟"));
});

await test("بعد «إيه» على سؤال التأكيد: تُحفظ 45000 ويتأهل وتُطابق شقق النرجس بفترة الميزانية والمدينة", async () => {
  const { T, f, handler } = await setup();
  aiNext = { ...base, reply: "تقصد 45 ألف ريال سنوياً؟", budget: "45", budget_period: "سنوي" };
  await handler(msg("966500000104", "45 سنوي"));
  T.__matches = [{ title: "شقة النرجس A12", city: "الرياض", district: "النرجس", rooms: 3, price: 42000,
    ad_license_no: "7200034512", score: 90, grade: "تطابق تام" }];
  aiNext = { ...base, reply: "أبشر", budget: "45000", budget_period: "سنوي", status: "مؤهل" };
  await handler(msg("966500000104", "ايه"));
  const c = T.customers[0];
  assert.equal(c.budget, 45000); assert.equal(c.status, "qualified"); assert.equal(c.handoff_reason, "qualified");
  assert.equal(c.city, "الرياض", "مكتب بمدينة واحدة: المدينة تُعرف تلقائياً");
  const call = T.__matchCalls.at(-1);
  assert.equal(call.fn, "v2"); assert.equal(call.p_period, "سنوي"); assert.equal(call.p_city, "الرياض");
  assert.ok(waOut(f).at(-1).includes("النرجس، الرياض"));
  // سؤال التأكيد السابق وصل للذكاء ضمن آخر المحادثة
  assert.ok(aiPrompt(f).includes("المساعد: تقصد 45 ألف ريال سنوياً؟"));
});

await test("«45 ألف» و«4.5 مليون» تُفهم مباشرة بلا تأكيد", async () => {
  let { T, f, handler } = await setup();
  aiNext = { ...base, reply: "تمام", budget: "45 ألف", budget_period: "سنوي" };
  await handler(msg("966500000105", "حدود 45 ألف بالسنة"));
  assert.equal(T.customers[0].budget, 45000);
  ({ T, f, handler } = await setup());
  aiNext = { ...base, deal_type: "شراء", property_type: "فيلا", location: "حطين", reply: "تمام", budget: "4.5 مليون" };
  await handler(msg("966500000106", "فيلا بحطين حدود 4.5 مليون"));
  assert.equal(T.customers[0].budget, 4500000);
});

await test("شراء بـ «2.6»: يُسأل «تقصد 2.6 مليون؟»", async () => {
  const { T, f, handler } = await setup();
  aiNext = { ...base, deal_type: "شراء", property_type: "فيلا", location: "حطين", reply: "تمام", budget: "2.6" };
  await handler(msg("966500000107", "2.6"));
  assert.equal(T.customers[0].budget ?? null, null);
  assert.ok(waOut(f)[0].startsWith("تقصد 2.6 مليون ريال؟"), waOut(f)[0]);
});

// ---------- المخزون والمدينة ----------
await test("«وش الأحياء عندكم»: الذكاء يستلم الأحياء ونطاق الأسعار من المخزون المرخّص", async () => {
  const { f, handler } = await setup();
  aiNext = { reply: "عندنا شقق إيجار في النرجس من 42 إلى 48 ألف. أي حي يناسبك؟", status: "استفسار عام", mode: "آلي" };
  await handler(msg("966500000110", "الاحياء الي عندك وش"));
  const p = aiPrompt(f);
  assert.ok(p.includes("إيجار · شقة: النرجس: 2 (42 ألف إلى 48 ألف سنوي)"), p.slice(0, 400));
  assert.ok(p.includes("شراء · فيلا: حطين"), "«بيع» يظهر للذكاء كـ«شراء»");
  assert.ok(p.includes("نطاق المكتب: مدينة واحدة: الرياض"));
  assert.ok(!p.includes("A12"), "اسم عقار بعينه وصل للذكاء");
});

await test("مكتب رخصته منتهية: لا مخزون للذكاء (لا أحياء ولا أسعار)", async () => {
  const { T, f, handler } = await setup();
  T.offices[0].fal_expires_on = riyadh(-3);
  aiNext = { reply: "أبشر", status: "استفسار عام", mode: "آلي" };
  await handler(msg("966500000111", "وش المتوفر"));
  assert.ok(aiPrompt(f).includes("مخزون المكتب:\nغير متاح حالياً"));
});

await test("مكتب بأكثر من مدينة: المدينة شرط للتأهيل، ثم تمر للمطابقة", async () => {
  const stock = [...STOCK, { office_id: "o1", city: "الطائف", district: "المنتزه", deal_type: "إيجار", property_type: "شقة", price: 30000 }];
  const { T, f, handler } = await setup(stock);
  aiNext = { ...base, reply: "تمام", budget: "45000", budget_period: "سنوي", status: "مؤهل" };
  await handler(msg("966500000112", "شقة ايجار بالنرجس 45000 سنوي"));
  let c = T.customers[0];
  assert.equal(c.status, "inquiry", "تأهل بدون مدينة"); assert.equal(c.mode, "auto");
  assert.ok(aiPrompt(f).includes("أكثر من مدينة: الرياض، الطائف"));
  aiNext = { ...base, reply: "تمام", budget: "45000", budget_period: "سنوي", city: "الرياض", status: "مؤهل" };
  await handler(msg("966500000112", "الرياض"));
  c = T.customers[0];
  assert.equal(c.status, "qualified"); assert.equal(T.__matchCalls.at(-1).p_city, "الرياض");
});

await test("المطابقة الجديدة غير منشورة بعد: يرجع للقديمة ويسجل تحذيراً", async () => {
  const { T, handler } = await setup();
  T.__noV2 = true;
  aiNext = { ...base, reply: "تمام", budget: "45000", budget_period: "سنوي", status: "مؤهل" };
  await handler(msg("966500000113", "شقة ايجار النرجس 45000 سنوي"));
  assert.equal(T.__matchCalls.at(-1).fn, "v1");
  assert.ok(T.events.some((e) => e.kind === "match_v2_failed"));
  assert.equal(T.customers[0].handoff_reason, "qualified");
});

// ---------- العميل الراجع ----------
await test("عميل سُلّم بطلب مكتمل ثم رجع للبوت وكتب «ابي شقة»: يُسأل عن نفس الطلب بدل تكرار رسالة التسليم", async () => {
  const { T, f, handler } = await setup();
  T.customers.push({ id: "r1", office_id: "o1", wa_id: "966500000120@c.us", phone: "966500000120", mode: "auto",
    status: "qualified", deal_type: "إيجار", property_type: "شقة", location: "النرجس", city: "الرياض",
    budget: 45000, budget_period: "سنوي", handed_at: new Date().toISOString(), handoff_reason: "qualified",
    msg_count: 8, buffer: "", recent_ids: [], opted_out: false, disclosed_at: "x" });
  aiNext = { ...base, reply: "حياك الله من جديد", budget: "45000", budget_period: "سنوي", status: "مؤهل" };
  await handler(msg("966500000120", "ابي شقة"));
  const c = T.customers.find((x) => x.id === "r1");
  assert.ok(aiPrompt(f).includes("طلب سابق مكتمل سُلّم للمستشار: إيجار · شقة · الرياض · النرجس · 45 ألف سنوي"));
  assert.equal(c.mode, "auto", "سُلّم من جديد بلا تأكيد");
  assert.ok(waOut(f)[0].startsWith("تقصد نفس طلبك السابق"), waOut(f)[0]);
  assert.ok(!waOut(f)[0].includes("وصلتني طلباتك كاملة"));
  // أكّد: يُسلّم مع المطابقة
  aiNext = { ...base, reply: "أبشر", budget: "45000", budget_period: "سنوي", status: "مؤهل", same_request: "نعم" };
  await handler(msg("966500000120", "ايه نفسه"));
  assert.equal(c.mode, "manual"); assert.equal(c.handoff_reason, "qualified");
});

await test("العميل الراجع غيّر الميزانية: يُسلّم بالطلب المحدّث مباشرة", async () => {
  const { T, handler } = await setup();
  T.customers.push({ id: "r2", office_id: "o1", wa_id: "966500000121@c.us", phone: "966500000121", mode: "auto",
    status: "qualified", deal_type: "إيجار", property_type: "شقة", location: "النرجس", city: "الرياض",
    budget: 45000, budget_period: "سنوي", handed_at: new Date().toISOString(), handoff_reason: "qualified",
    msg_count: 8, buffer: "", recent_ids: [], opted_out: false, disclosed_at: "x" });
  aiNext = { ...base, reply: "تمام", budget: "60000", budget_period: "سنوي", status: "مؤهل" };
  await handler(msg("966500000121", "صارت ميزانيتي 60 ألف"));
  const c = T.customers.find((x) => x.id === "r2");
  assert.equal(c.budget, 60000); assert.equal(c.mode, "manual");
});

// ---------- التسليم بالحالة ----------
await test("طلب معاينة قبل اكتمال الطلب: يُسلّم للوسيط مع تنبيه «يطلب معاينة»", async () => {
  const { T, f, handler } = await setup();
  aiNext = { reply: "أبشر، المستشار بيتواصل معك لتأكيد الموعد.", status: "استفسار عام", mode: "آلي",
    deal_type: "إيجار", property_type: "شقة", appointment: "بكرة العصر" };
  await handler(msg("966500000130", "ابي اشوف الشقة بكرة العصر"));
  assert.equal(T.customers[0].mode, "manual"); assert.equal(T.customers[0].handoff_reason, "human");
  assert.ok(tg(f).some((t) => t.includes("عميل يطلب معاينة")));
});

await test("محادثة بلا أي معلومة جديدة ٦ ردود متتالية: تُسلّم (وليس بعدد الرسائل الكلي)", async () => {
  const { T, f, handler } = await setup();
  aiNext = { reply: "حياك الله، وش تبحث عنه؟", status: "استفسار عام", mode: "آلي" };
  for (let i = 0; i < 5; i++) await handler(msg("966500000131", "هلا " + i));
  assert.equal(T.customers[0].mode, "auto"); assert.equal(T.customers[0].stale_turns, 5);
  await handler(msg("966500000131", "هلا"));
  assert.equal(T.customers[0].mode, "manual"); assert.equal(T.customers[0].handoff_reason, "quota");
  assert.ok(tg(f).some((t) => t.includes("محادثة ما تتقدم")));
});

await test("رد يضيف معلومة يصفّر عدّاد عدم التقدم", async () => {
  const { T, handler } = await setup();
  aiNext = { reply: "حياك الله", status: "استفسار عام", mode: "آلي" };
  for (let i = 0; i < 4; i++) await handler(msg("966500000132", "هلا " + i));
  aiNext = { reply: "أي حي؟", status: "استفسار عام", mode: "آلي", deal_type: "إيجار" };
  await handler(msg("966500000132", "ايجار"));
  assert.equal(T.customers[0].stale_turns, 0);
});

await test("آخر المحادثة يصل للذكاء بلا سطر الإفصاح، ومخفي الأسماء", async () => {
  const { f, handler } = await setup();
  aiNext = { reply: "هلا، تبي إيجار ولا شراء؟", status: "استفسار عام", mode: "آلي" };
  await handler(msg("966500000133", "السلام عليكم"));
  await handler(msg("966500000133", "ايجار"));
  const p = aiPrompt(f);
  assert.ok(p.includes("العميل: السلام عليكم") && p.includes("المساعد: هلا، تبي إيجار ولا شراء؟"));
  assert.ok(!p.includes("المساعد الآلي في"), "الإفصاح وصل للذكاء");
});

await test("قاعدة لم تُطبّق migration 10 بعد: حفظ العميل يكمل بدون الأعمدة الجديدة ويسجل خطأ", async () => {
  const { T, client } = makeDb(seed());
  const from = client.from;
  // نحاكي قاعدة ما فيها عمودا city و stale_turns
  client.from = (t) => {
    const q = from(t);
    if (t !== "customers") return q;
    const upd = q.update.bind(q);
    q.update = (p) => ("city" in p || "stale_turns" in p)
      ? { eq: async () => ({ data: null, error: { message: 'column "city" does not exist' } }) }
      : upd(p);
    return q;
  };
  const f = makeFetch(() => aiNext);
  const { handler } = await loadFunction(FN, client, f);
  aiNext = { reply: "أي حي؟", status: "استفسار عام", mode: "آلي", deal_type: "إيجار" };
  await handler(msg("966500000134", "ايجار"));
  assert.equal(T.customers[0].deal_type, "إيجار", "ضاع حفظ الطلب");
  assert.ok(T.events.some((e) => e.kind === "customer_save_failed"));
});

for (const r of results) console.log(r.join("  "));
const bad = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - bad}/${results.length} passed`);
if (bad) process.exit(1);
