// اختبارات دالتي الموقع: الانضمام وراسلنا
import { makeDb, makeFetch, loadFunction } from "./harness.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };
const seed = () => ({
  app_secrets: [{ key: "WEBHOOK_SECRET", value: "s3" }, { key: "TELEGRAM_BOT_TOKEN", value: "1:abc" }, { key: "OPERATOR_TG_CHAT", value: "999" }],
  staff: [], offices: [], contact_messages: [], signup_requests: [], events: [],
});
const post = (h, b, ip = "1.2.3.4") => h(new Request("http://x/contact", { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(b) }));

console.log("contact");
{
  const db = makeDb(seed()); const f = makeFetch({});
  const { handler } = await loadFunction(new URL("../functions/contact/index.ts", import.meta.url).pathname, db.client, f);
  const good = { name: "سعد", phone: "٠٥٥١٢٣٤٥٦٧", email: "", topic: "privacy", message: "أبي أعرف وش البيانات اللي عندكم عني", consent: true, website: "", t: 6000 };

  let r = await handler(new Request("http://x/contact", { method: "GET" }));
  ok(r.status === 405, "GET مرفوض");
  r = await handler(new Request("http://x/contact", { method: "OPTIONS" }));
  ok(r.headers.get("access-control-allow-origin") === "*", "CORS مفتوح للموقع");

  r = await post(handler, { ...good, website: "http://spam" });
  ok(r.status === 200 && db.T.contact_messages.length === 0, "فخ البرامج: نجاح صامت بلا حفظ");
  r = await post(handler, { ...good, t: 900 });
  ok(r.status === 200 && db.T.contact_messages.length === 0, "إرسال أسرع من اللازم: نجاح صامت بلا حفظ");

  r = await post(handler, { ...good, name: "س", phone: "", email: "", topic: "x", message: "قصير", consent: false });
  let j = await r.json();
  ok(r.status === 422 && j.fields.name && j.fields.phone && j.fields.topic && j.fields.message && j.fields.consent, "كل أخطاء الحقول بالعربي");
  r = await post(handler, { ...good, phone: "12345" });
  j = await r.json();
  ok(r.status === 422 && /05/.test(j.fields.phone), "جوال غير سعودي");
  r = await post(handler, { ...good, phone: "", email: "bad@" });
  j = await r.json();
  ok(r.status === 422 && j.fields.email, "بريد غير صحيح");

  r = await post(handler, good);
  j = await r.json();
  const row = db.T.contact_messages[0];
  ok(r.status === 200 && j.ok && row && row.phone === "966551234567" && row.topic === "privacy", "حفظ الرسالة وتوحيد الرقم");
  ok(row.ip_hash && row.ip_hash.length === 64 && !JSON.stringify(row).includes("1.2.3.4"), "بصمة IP فقط، لا العنوان");
  const tg = f.calls.find((c) => c.url.includes("api.telegram.org"));
  ok(tg && tg.body.chat_id === "999" && /٣٠ يوماً/.test(tg.body.text) && /wa\.me\/966551234567/.test(tg.body.text), "تنبيه المشغّل بطلب الخصوصية");
  ok(db.T.events.some((e) => e.kind === "contact_message"), "حدث مسجّل");

  r = await post(handler, { ...good, topic: "general", phone: "", email: "Me@Example.com", message: "سؤال\n\n\n\nعن الأسعار<script>" });
  ok(r.status === 200 && db.T.contact_messages[1].email === "me@example.com" && !/\n{3}/.test(db.T.contact_messages[1].message), "بريد فقط + تنظيف الأسطر");

  for (let i = 0; i < 3; i++) await post(handler, { ...good, topic: "general" });
  r = await post(handler, { ...good, topic: "general" });
  ok(r.status === 429, "حد ٥ رسائل لكل جهاز يومياً");
  r = await post(handler, { ...good, topic: "general" }, "9.9.9.9");
  ok(r.status === 200, "جهاز آخر يقدر يرسل");
}

console.log("join (v1.2)");
{
  const db = makeDb(seed()); const f = makeFetch({});
  const store = new Map();
  db.client.storage = { from: (bucket) => ({ upload: async (path, bytes, opts) => { store.set(bucket + "/" + path, opts?.contentType); return { error: null }; } }) };
  const { handler } = await loadFunction(new URL("../functions/join/index.ts", import.meta.url).pathname, db.client, f);
  const JPG = "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 9)]).toString("base64");
  const PDF = "data:application/pdf;base64," + Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(3000, 1)]).toString("base64");
  const good = { office_name: "مكتب تجربة", contact_name: "خالد", phone: "0551234567", city: "الرياض", fal_license: "١١٠٠٢٢٣٣", agents: "2-5", note: "", consent: true, website: "", t: 5000, fal_file: JPG, v: 2 };
  let r = await post(handler, good);
  const row = db.T.signup_requests[0];
  ok(r.status === 200 && row?.fal_license === "11002233", "طلب انضمام يُحفظ وتتحول أرقام فال");
  ok(/^signups\/.+\.jpg$/.test(row?.fal_proof_path || "") && store.get("fal-proofs/" + row.fal_proof_path) === "image/jpeg", "صورة الرخصة تُحفظ في المخزن الخاص");
  r = await post(handler, { ...good, phone: "0551230000", fal_file: undefined });
  let j = await r.json();
  ok(r.status === 422 && j.fields?.fal_file, "بدون صورة الرخصة يُرفض");
  r = await post(handler, { ...good, phone: "0551230000", fal_license: "" });
  j = await r.json();
  ok(r.status === 422 && j.fields?.fal_license, "بدون رقم الرخصة يُرفض");
  r = await post(handler, { ...good, phone: "0551230000", fal_file: "data:image/png;base64," + Buffer.from("<html>" + "x".repeat(2000)).toString("base64") });
  j = await r.json();
  ok(r.status === 422 && j.fields?.fal_file, "ملف مو صورة (ولو اسمه صورة) يُرفض");
  const { v, fal_file, ...legacyForm } = good;
  r = await post(handler, { ...legacyForm, phone: "0551230002", fal_license: "" });
  ok(r.status === 200 && db.T.signup_requests.at(-1).fal_proof_path === null, "نموذج الموقع القديم يشتغل لين يُرفع الجديد");
  r = await post(handler, { ...good, phone: "0551230001", fal_file: PDF });
  ok(r.status === 200 && /\.pdf$/.test(db.T.signup_requests.at(-1).fal_proof_path), "ملف PDF مقبول");
  r = await post(handler, good);
  j = await r.json();
  ok(j.duplicate === true && db.T.signup_requests.length === 3, "نفس الرقم خلال يوم = مكرر");
  for (let i = 0; i < 2; i++) await post(handler, { ...good, phone: "055123456" + i });
  r = await post(handler, { ...good, phone: "0559999999" });
  j = await r.json();
  ok(r.status === 429 && /راسلنا/.test(j.error), "رسالة الحد تحيل لصفحة راسلنا");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
