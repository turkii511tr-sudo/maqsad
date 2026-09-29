// اختبار النسخة الاحتياطية v3.2: لا مفاتيح داخل الملف، تحقق ذاتي، تنظيف النسخ القديمة، والتنبيه للمشغّل فقط
import { makeDb, makeFetch, loadFunction } from "./harness.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗", m); } };

function withStorage(db, { failUpload = false, files = [] } = {}) {
  const store = new Map(files.map((n) => [`daily/${n}`, "{}"]));
  db.client.storage = {
    from: () => ({
      upload: async (path, bytes) => {
        if (failUpload) return { error: { message: "quota" } };
        store.set(path, new TextDecoder().decode(bytes)); return { error: null };
      },
      download: async (path) => store.has(path)
        ? { data: new Blob([store.get(path)]), error: null } : { data: null, error: { message: "missing" } },
      list: async (prefix) => ({ data: [...store.keys()].filter((k) => k.startsWith(prefix + "/")).map((k) => ({ name: k.slice(prefix.length + 1) })) }),
      remove: async (paths) => { paths.forEach((p) => store.delete(p)); return { error: null }; },
    }),
  };
  return store;
}

const seed = () => ({
  app_secrets: [
    { key: "WEBHOOK_SECRET", value: "s3" }, { key: "TELEGRAM_BOT_TOKEN", value: "1:abc" },
    { key: "OPERATOR_TG_CHAT", value: "777" }, { key: "OPENAI_API_KEY", value: "sk-secret" },
  ],
  offices: [
    { id: 1, code: "a", name: "مكتب أ", wa_token: "TOKEN-A", tg_link_code: "LINK-A", telegram_chat_id: "111", active: true },
    { id: 2, code: "b", name: "مكتب ب", wa_token: "TOKEN-B", tg_link_code: null, telegram_chat_id: "222", active: true },
  ],
  staff: [{ id: 1, office_id: 1, name: "تركي", phone: "966500000001", role: "super_admin", active: true }],
  customers: [{ id: "c1", office_id: 1, phone: "966500000009", name: "عميل" }],
  messages: [{ id: 1, customer_id: "c1", body: "هلا" }, { id: 2, customer_id: "c1", body: "أبي شقة" }],
  properties: [], events: [], app_pages: [{ slug: "app", html: "<p>" }], login_audit: [],
  signup_requests: [], contact_messages: [{ id: 1, name: "سعد" }], privacy_requests: [], backup_runs: [],
});

console.log("backup");
{
  const db = makeDb(seed());
  // ساعة وهمية: اليوم ١٥ فبراير ٢٠٢٧. نسخ يومية نظيفة من ٢٢ سبتمبر ٢٠٢٦ إلى أمس،
  // ونسخ قديمة فيها مفاتيح (قبل ٢٢ سبتمبر) يجب أن تُحذف كلها حتى لو كانت نسخ أول الشهر
  const RealDate = Date, FAKE_NOW = RealDate.parse("2027-02-15T12:00:00Z");
  globalThis.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [FAKE_NOW])); }
    static now() { return FAKE_NOW; }
  };
  const files = [];
  for (let t = RealDate.parse("2026-09-22T00:00:00Z"); t < FAKE_NOW - 864e5; t += 864e5) {
    files.push(new RealDate(t).toISOString().slice(0, 10) + ".json");
  }
  for (let d = 15; d <= 21; d++) files.push(`2026-09-${d}.json`);
  files.push("2026-09-01.json", "2026-08-01.json");
  const store = withStorage(db, { files });
  const f = makeFetch({});
  const { handler } = await loadFunction(new URL("../functions/backup/index.ts", import.meta.url).pathname, db.client, f);

  let r = await handler(new Request("http://x/backup?k=wrong", { method: "POST" }));
  ok(r.status === 403, "رابط بلا المفتاح الصحيح مرفوض");
  ok(db.T.backup_runs.length === 0, "لا يُسجّل تشغيل عند الرفض");

  r = await handler(new Request("http://x/backup?k=s3", { method: "POST" }));
  const j = await r.json();
  ok(r.status === 200 && j.ok && j.verified, "النسخة نجحت وتحقق منها بعد الرفع");
  const raw = store.get(j.path);
  const saved = JSON.parse(raw);
  ok(!raw.includes("TOKEN-A") && !raw.includes("TOKEN-B") && !raw.includes("LINK-A"), "توكنات واتساب ورموز ربط تيليجرام ليست في الملف");
  ok(!raw.includes("sk-secret") && !("app_secrets" in saved.data), "مفاتيح المنصة (app_secrets) ليست في الملف");
  ok(saved.data.offices.length === 2 && saved.data.offices[0].name === "مكتب أ" && !("wa_token" in saved.data.offices[0]), "المكاتب محفوظة بأسمائها بدون أعمدة الدخول");
  ok(db.T.offices[0].wa_token === "TOKEN-A", "الحذف من النسخة فقط، الجدول الأصلي سليم");
  ok(saved.counts.messages === 2 && saved.counts.contact_messages === 1 && saved.data.customers[0].phone === "966500000009", "العدّ مطابق وبيانات العملاء والموقع موجودة");
  const run = db.T.backup_runs[0];
  ok(run.ok === true && run.bytes > 0 && run.row_counts.offices === 2, "سجل التشغيل محدّث");
  const tg = f.calls.filter((c) => c.url.includes("api.telegram.org"));
  ok(tg.length === 1 && tg[0].body.chat_id === "777" && /✅/.test(tg[0].body.text), "تنبيه واحد لمشغّل المنصة فقط");
  const left = [...store.keys()].filter((k) => k.startsWith("daily/")).map((k) => k.slice(6)).sort();
  const monthly = left.filter((n) => /-01\.json$/.test(n));
  ok(!left.some((n) => n < "2026-09-22"), "كل النسخ القديمة اللي فيها مفاتيح انحذفت (حتى نسخ أول الشهر)");
  ok(j.path === "daily/2027-02-15.json" && left.includes("2027-02-15.json"), "نسخة اليوم محفوظة");
  ok(left.length === 30 + 4 && ["2026-10-01.json", "2026-11-01.json", "2026-12-01.json", "2027-01-01.json"].every((m) => monthly.includes(m))
    && !left.includes("2026-12-15.json") && left.includes("2027-01-17.json"),
    `التنظيف: آخر ٣٠ نسخة + أول كل شهر (${left.length} ملف، ${j.pruned} حُذف)`);
  globalThis.Date = RealDate;
}
{
  const db = makeDb(seed());
  withStorage(db, { failUpload: true });
  const f = makeFetch({});
  const { handler } = await loadFunction(new URL("../functions/backup/index.ts", import.meta.url).pathname, db.client, f);
  const r = await handler(new Request("http://x/backup?k=s3", { method: "POST" }));
  const j = await r.json();
  const tg = f.calls.filter((c) => c.url.includes("api.telegram.org"));
  ok(r.status === 500 && !j.ok && db.T.backup_runs[0].ok === false, "فشل الرفع يُسجَّل فشلاً");
  ok(tg.length === 1 && /🔴/.test(tg[0].body.text), "تنبيه فشل للمشغّل");
}
{
  const s = seed(); s.app_secrets = s.app_secrets.filter((x) => x.key !== "OPERATOR_TG_CHAT");
  const db = makeDb(s);
  withStorage(db);
  const f = makeFetch({});
  const { handler } = await loadFunction(new URL("../functions/backup/index.ts", import.meta.url).pathname, db.client, f);
  await handler(new Request("http://x/backup?k=s3", { method: "POST" }));
  const tg = f.calls.filter((c) => c.url.includes("api.telegram.org"));
  ok(tg.length === 1 && tg[0].body.chat_id === "111", "بدون OPERATOR_TG_CHAT: يروح لمجموعة مكتب المشغّل لا لغيره");
}
console.log(`\n${pass} نجح · ${fail} فشل`);
process.exit(fail ? 1 : 0);
