// مقصد — واجهة المنصة (v14)
// v14: عملاء سابقون يطابقون العقار (للمكتب نفسه فقط، آخر ٣٠ يوماً، بلا إرسال آلي) · موافقة صاحب المكتب على
//      الشروط واتفاقية معالجة البيانات من داخل التطبيق (النسخة والتاريخ ومن وافق)
// v13: لوحة المدير — جلسة المدير ٧ أيام، سجل لكل تعديل يسويه المدير، نموذج الذكاء والصوتيات من اللوحة.
//      رخصة فال: صورة الرخصة من طلب الانضمام تنتقل للمكتب، والمكتب يطلب التعديل بصورة (المدير وحده يعدّل).
//      خطوات أول دخول للمكتب (onboarding) · إضافة العقار تقبل ترخيص الإعلان من الخطوات
// v12: التنبيهات — المكتب يختار تيليجرام أو إشعارات الجوال أو الاثنين. ربط تيليجرام بضغطة زر (رابط البوت
//      برمز لمرة وحدة بدل كتابة رقم المحادثة)، وتفعيل إشعارات الجوال لكل جهاز مع تجربة فورية
// v11: رخصة فال — المشغّل يتحقق يدوياً من استعلام الهيئة (الحالة + الاسم + تاريخ الانتهاء) ويرفق صورة النتيجة،
//      وما يشتغل المساعد لعملاء المكتب إلا بعد «تم التحقق». تغيير رقم الرخصة يرجّعها «بانتظار التحقق»،
//      ونفس الرخصة ما تُعتمد لمكتبين. كل تحقق أو رفض محفوظ في سجل مع صورته
// v10: حماية أرقام الموظفين — فحص صيغة الجوال، تصحيح الرقم، حذف من لم يدخل أبداً (ومن دخل يُوقف فقط)،
//      وتسجيل آخر دخول لكل موظف
// v9: نتيجة الاتصال لكل عميل · سبب التسليم · ملخص الشهر للمكتب · استهلاك وتكلفة كل مكتب للمشغّل ·
//     تسجيل رموز الدخول المرسلة · حالات العقار (محجوز/مؤجّر/مباع) تُحفظ صح
// v8: رموز الدخول بقالب «مصادقة» من رقم المنصة الرسمي · تصدير كامل بالصفحات · إيقاف المكتب يُحترم
//     (لا تعيد التعديلات تفعيله، ويقفل دخول موظفيه) · إيقاف/تفعيل الموظفين · لا يُكشف اسم الموظف
//     عند طلب الرمز · رسالة الاختبار لمشغّل المنصة فقط · رابط ميتا مثبّت على فرانكفورت
import { createClient } from "jsr:@supabase/supabase-js@2";
import { alertOffice, pushOffice, telegramSend, vapidGenerate, vapidPublic, PUSH_HOST } from "./notify.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BASE_ALLOWED = ["https://maqsad-sa.netlify.app"];
const FN_BASE = "https://dindcejhsaxqwdkxtkcy.supabase.co/functions/v1";
// تشغيل الدوال في فرانكفورت (نفس منطقة قاعدة البيانات) — للأداء ولتبقى المعالجة في منطقة واحدة
const PIN = "?forceFunctionRegion=eu-central-1";

class SecretsDown extends Error {}

let sc: { v: Record<string, string>; at: number } | null = null;
async function secrets() {
  if (sc && Date.now() - sc.at < 30000) return sc.v;
  for (let i = 0; i < 3; i++) {
    const { data, error } = await db.from("app_secrets").select("key,value");
    if (!error && data && data.length) {
      sc = { v: Object.fromEntries(data.map((r: any) => [r.key, r.value])), at: Date.now() };
      return sc.v;
    }
    await new Promise((r) => setTimeout(r, 120 * (i + 1)));
  }
  if (sc) return sc.v;
  throw new SecretsDown("secrets_unavailable");
}

// النطاقات المسموحة: الأساسية + ما يُضاف لاحقاً في المفاتيح (ALLOWED_ORIGINS مفصولة بفواصل)
async function corsFor(req: Request) {
  let extra: string[] = [];
  try {
    const s = await secrets();
    extra = String(s.ALLOWED_ORIGINS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  } catch { /* نكمل بالأساسية */ }
  const allowed = [...BASE_ALLOWED, ...extra];
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(o) ? o : allowed[0],
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function sha(text: string) {
  const s = await secrets();
  const pepper = s.WEBHOOK_SECRET;
  if (!pepper) throw new SecretsDown("pepper_missing");
  const buf = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(text + "|" + pepper));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendWhatsApp(office: any, to: string, body: string) {
  try {
    if (!office?.wa_token || !office?.wa_instance) return false;
    if (office.wa_provider === "cloud") {
      const r = await fetch(`https://graph.facebook.com/v21.0/${office.wa_instance}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${office.wa_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
      });
      return r.ok;
    }
    const r = await fetch(`https://api.ultramsg.com/${office.wa_instance}/messages/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: office.wa_token, to: to + "@c.us", body }),
    });
    if (!r.ok) return false;
    const t = await r.text();
    return !t.includes("error");
  } catch { return false; }
}

// رمز الدخول: من رقم المنصة الرسمي بقالب «مصادقة» معتمد من ميتا إن كان مضبوطاً (يصل في أي وقت)،
// وإلا من رقم المكتب نفسه كرسالة عادية (تصل مع ميتا فقط داخل نافذة الـ٢٤ ساعة)
async function sendLoginCode(office: any, phone: string, code: string) {
  const s = await secrets();
  if (isSet(s.PLATFORM_WA_PHONE_ID) && isSet(s.PLATFORM_WA_TOKEN) && isSet(s.OTP_TEMPLATE)) {
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${s.PLATFORM_WA_PHONE_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.PLATFORM_WA_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp", to: phone, type: "template",
          template: {
            name: s.OTP_TEMPLATE, language: { code: s.OTP_TEMPLATE_LANG || "ar" },
            components: [
              { type: "body", parameters: [{ type: "text", text: code }] },
              { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
            ],
          },
        }),
      });
      if (r.ok) { await bump(office?.id, { p_otp_platform: 1 }); return { ok: true, via: "platform" }; }
      await db.from("events").insert({ office_id: office?.id ?? null, level: "error", kind: "otp_template_failed",
        detail: { status: r.status, error: (await r.text()).slice(0, 300), to_last4: phone.slice(-4) } });
    } catch (e) {
      await db.from("events").insert({ office_id: office?.id ?? null, level: "error", kind: "otp_template_failed",
        detail: { error: String(e).slice(0, 300), to_last4: phone.slice(-4) } });
    }
  }
  const ok = await sendWhatsApp(office, phone, `رمز الدخول إلى مقصد: ${code}\nصالح ٥ دقائق. لا تشاركه مع أحد.`);
  if (ok) await bump(office?.id, { p_otp_office: 1 });
  return { ok, via: "office" };
}

// قراءة كاملة بصفحات من ١٠٠٠ صف (حد الخادم للطلب الواحد)
async function readAll(build: () => any, cap: number) {
  const out: any[] = [];
  for (let from = 0; out.length < cap; from += 1000) {
    const { data, error } = await build().range(from, Math.min(from + 999, cap - 1));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function tellOperator(text: string) {
  try {
    const s = await secrets();
    const token = s.TELEGRAM_BOT_TOKEN;
    let chat = s.OPERATOR_TG_CHAT ?? null;
    if (!chat) {
      const { data } = await db.from("staff").select("offices(telegram_chat_id)")
        .eq("role", "super_admin").eq("active", true).limit(1).maybeSingle();
      chat = (data as any)?.offices?.telegram_chat_id ?? null;
    }
    if (!token || !token.includes(":") || !chat) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
  } catch { /* التنبيه ليس شرطاً */ }
}

// توحيد الأرقام: أرقام عربية/فارسية ← إنجليزية، و05… أو 5… السعودية ← 9665…
const norm = (p: string) => {
  let d = String(p ?? "")
    .replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x)))
    .replace(/[۰-۹]/g, (x) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(x)))
    .replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^05\d{8}$/.test(d)) d = "966" + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = "966" + d;
  return d.replace(/^0+/, "");
};
// جوال سعودي: 9665 + ٨ أرقام. غير السعودي يُقبل إذا كان ١٠–١٥ رقماً ولا يبدأ بـ966
const phoneProblem = (p: string) =>
  /^9665\d{8}$/.test(p) ? null
  : p.startsWith("966") ? "رقم جوال سعودي غير صحيح — لازم يبدأ بـ 05 ويتكون من ١٠ أرقام"
  : /^\d{10,15}$/.test(p) ? null : "رقم غير صحيح — اكتبه كاملاً مثل 05XXXXXXXX";
const last4 = (p: string) => String(p ?? "").slice(-4);

const ipOf = (req: Request) =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;

async function audit(phone: string, ok: boolean, reason: string, req: Request, staffId?: string) {
  await db.from("login_audit").insert({ phone, ok, reason, ip: ipOf(req), staff_id: staffId ?? null });
}

// جلسة المدير أقصر: حسابه يتحكم في كل المكاتب
const SUPER_DAYS = 7, STAFF_DAYS = 30;
async function newSession(staffId: string, role?: string) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const days = role === "super_admin" ? SUPER_DAYS : STAFF_DAYS;
  await db.from("sessions").insert({
    token_hash: await sha(token), staff_id: staffId, kind: "session",
    expires_at: new Date(Date.now() + days * 864e5).toISOString(),
  });
  return token;
}

async function session(req: Request) {
  const raw = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!raw) return null;
  const { data: s } = await db.from("sessions").select("staff_id,expires_at,kind,created_at")
    .eq("token_hash", await sha(raw)).maybeSingle();
  // تذكرة الدخول لا تصلح كجلسة — تُستبدل فقط
  if (!s || s.kind !== "session" || new Date(s.expires_at) < new Date()) return null;
  const { data: st } = await db.from("staff").select("*,offices(*)")
    .eq("id", s.staff_id).eq("active", true).maybeSingle();
  if (!st) return null;
  const isSuper = st.role === "super_admin";
  if (!isSuper && (st as any).offices?.active === false) return null;
  // جلسات المدير القديمة (قبل تقصير المدة) تنتهي بعد ٧ أيام من إنشائها
  if (isSuper && s.created_at && Date.now() - new Date(s.created_at).getTime() > SUPER_DAYS * 864e5) return null;
  return { staff: st, office: (st as any).offices, isSuper };
}

// ===== رخصة فال =====
// اليوم بتوقيت الرياض (UTC+3 ثابت): الرخصة سارية حتى نهاية يوم انتهائها
const riyadhToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) &&
  new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const arDate = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };
// أرقام عربية ← إنجليزية، بلا مسافات: نفس الرخصة تُكتب بأكثر من شكل
const licenseKey = (v: unknown) => String(v ?? "")
  .replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x)))
  .replace(/[۰-۹]/g, (x) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(x)))
  .replace(/\s+/g, "").trim();

// الحالة الفعلية: ok (متحقق منها وسارية) · expired (انتهت) · pending (بانتظار التحقق) · rejected (غير معتمدة)
function falInfo(o: any) {
  const status = ["verified", "rejected"].includes(o?.fal_status) ? o.fal_status : "pending";
  const exp = o?.fal_expires_on ?? null;
  const days = exp ? daysBetween(riyadhToday(), exp) : null;
  return {
    state: status === "verified" ? (days !== null && days >= 0 ? "ok" : "expired") : status,
    expires_on: exp, days_left: days,
    holder_name: o?.fal_holder_name ?? null,
    verified_at: o?.fal_verified_at ?? null,
    note: status === "rejected" ? (o?.fal_note ?? null) : null,
    has_proof: !!o?.fal_proof_path,
  };
}
const FAL_BLOCK: Record<string, string> = {
  pending: "بانتظار التحقق من رخصة فال", rejected: "رخصة فال للمكتب غير معتمدة", expired: "رخصة فال للمكتب منتهية",
};

// صورة نتيجة الاستعلام: PNG أو JPG أو WEBP حقيقية (تُفحص بصمة الملف لا اسمه)، بحد ٣ ميجابايت
const FAL_BUCKET = "fal-proofs";
type Img = { bytes: Uint8Array; mime: string; ext: string };
function parseImage(v: unknown): Img | { error: string } {
  const m = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(v ?? ""));
  if (!m) return { error: "أرفق صورة نتيجة الاستعلام من موقع الهيئة" };
  let bin = "";
  try { bin = atob(m[1].replace(/\s/g, "")); } catch { return { error: "الصورة تالفة — جرّب صورة ثانية" }; }
  if (bin.length > 3 * 1024 * 1024) return { error: "الصورة كبيرة — الحد ٣ ميجابايت" };
  if (bin.length < 1024) return { error: "الصورة صغيرة جداً — صوّر نتيجة الاستعلام كاملة" };
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const png = bytes[0] === 0x89 && bin.slice(1, 4) === "PNG";
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bin.slice(0, 4) === "RIFF" && bin.slice(8, 12) === "WEBP";
  if (!png && !jpg && !webp) return { error: "الملف مو صورة — أرفق لقطة شاشة PNG أو JPG" };
  return png ? { bytes, mime: "image/png", ext: "png" }
    : jpg ? { bytes, mime: "image/jpeg", ext: "jpg" } : { bytes, mime: "image/webp", ext: "webp" };
}
// ملف رخصة فال من صاحب المكتب: صورة أو PDF، بحد ٣ ميجابايت
function parseUpload(v: unknown): Img | { error: string } {
  const pdf = /^data:application\/pdf;base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(v ?? ""));
  if (!pdf) {
    const r = parseImage(v);
    return "error" in r ? { error: "أرفق صورة رخصة فال (صورة أو PDF)" } : r;
  }
  let bin = "";
  try { bin = atob(pdf[1].replace(/\s/g, "")); } catch { return { error: "الملف تالف — جرّب ملف ثاني" }; }
  if (bin.length > 3 * 1024 * 1024) return { error: "الملف كبير — الحد ٣ ميجابايت" };
  if (bin.slice(0, 5) !== "%PDF-") return { error: "الملف مو PDF صالح" };
  return { bytes: Uint8Array.from(bin, (ch) => ch.charCodeAt(0)), mime: "application/pdf", ext: "pdf" };
}
async function putFile(prefix: string, f: Img) {
  const path = `${prefix}/${new Date().toISOString().replace(/[:.]/g, "-")}.${f.ext}`;
  try {
    const { error } = await db.storage.from(FAL_BUCKET).upload(path, f.bytes, { contentType: f.mime, upsert: false });
    return error ? null : path;
  } catch { return null; }
}
async function putProof(officeId: string, img: Img) {
  const path = `${officeId}/${new Date().toISOString().replace(/[:.]/g, "-")}.${img.ext}`;
  try {
    const { error } = await db.storage.from(FAL_BUCKET).upload(path, img.bytes, { contentType: img.mime, upsert: false });
    return error ? null : path;
  } catch { return null; }
}

// تنبيه المكتب على قنواته (تيليجرام و/أو الجوال) — ليس شرطاً لنجاح العملية
async function tellOffice(office: any, text: string) {
  try { await alertOffice(db, await secrets(), office, text); } catch { /* التنبيه ليس شرطاً */ }
}

// مفاتيح إشعارات الجوال: تُولَّد تلقائياً أول مرة (مرة وحدة للمنصة كلها)
async function ensureVapid() {
  let s = await secrets();
  if (vapidPublic(s)) return s;
  await db.from("app_secrets").upsert({ key: "VAPID_KEYS", value: await vapidGenerate(), updated_at: new Date().toISOString() },
    { onConflict: "key", ignoreDuplicates: true });
  sc = null;
  s = await secrets();
  return s;
}

// حالة التنبيهات للمكتب: القنوات المختارة، هل تيليجرام مربوط، وكم جهاز مفعّل
async function notifyInfo(ctx: any, office: any) {
  const s = await ensureVapid();
  const { data } = await db.from("push_subs").select("staff_id").eq("office_id", office.id);
  const subs = (data ?? []) as any[];
  return {
    telegram: office.notify_telegram !== false,
    push: office.notify_push !== false,
    tg_linked: !!office.telegram_chat_id,
    push_key: vapidPublic(s),
    devices: subs.length,
    my_devices: subs.filter((x) => x.staff_id === ctx.staff.id).length,
    can_edit: ctx.isSuper || ctx.staff.role === "owner",
  };
}
const botName = (s: Record<string, string>) => (s.TELEGRAM_BOT_USERNAME || "Maqsad_saBot").replace(/^@/, "");
const b64uOk = (v: unknown, len: number) => typeof v === "string" && v.length === len && /^[A-Za-z0-9_-]+$/.test(v);

function decorate(rows: any[], office?: any) {
  const today = new Date().toISOString().slice(0, 10);
  // المكتب نفسه: إذا رخصة فال غير سارية، المساعد ما يعرض أي عقار
  const officeBlock = FAL_BLOCK[falInfo(office).state] ?? null;
  return (rows ?? []).map((p: any) => {
    const own = !p.ad_license_no ? "بدون رقم ترخيص إعلان"
      : (!p.ad_license_expiry || p.ad_license_expiry < today) ? "ترخيص الإعلان منتهٍ"
      : p.state !== "available" ? "غير متاح" : null;
    return { ...p, listable: !own && !officeBlock, block_reason: own ?? officeBlock };
  });
}

const isSet = (v: string | undefined) =>
  !!v && v !== "SET_ME" && v !== "SET_ME_AFTER_ROTATION";

// عدّاد الاستهلاك اليومي لكل مكتب — أرقام فقط، ولا يوقف أي عملية إذا فشل
async function bump(officeId: string | null | undefined, f: Record<string, number>) {
  if (!officeId) return;
  try { await db.rpc("bump_usage", { p_office: officeId, ...f }); } catch { /* العدّاد ليس شرطاً */ }
}

const OUTCOMES = ["no_answer", "contacted", "viewing", "deal", "lost"];
const PROP_STATES = ["available", "reserved", "rented", "sold", "closed"];
const LEAD_COLS = "id,name,phone,deal_type,property_type,budget,budget_period,location,rooms,status,mode," +
  "summary,msg_count,last_message_at,opted_out,handoff_reason,handed_at,outcome,outcome_at";

// الشهر بتوقيت الرياض (UTC+3 ثابت، بلا توقيت صيفي): «YYYY-MM» ← بدايته وبداية الشهر اللي بعده
function monthRange(m?: string) {
  let month = String(m ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    month = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7);
  }
  const [y, mo] = month.split("-").map(Number);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  return { month, next, from: `${month}-01T00:00:00+03:00`, to: `${next}-01T00:00:00+03:00` };
}
const num0 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

async function statusFor(ctx: any, office: any, oid: string) {
  const s = await secrets();
  const { data: errs } = await db.from("events").select("kind,detail,created_at")
    .eq("office_id", oid).eq("level", "error").order("id", { ascending: false }).limit(5);
  const base: Record<string, unknown> = {
    can_edit: ctx.isSuper, is_super: ctx.isSuper,
    office_name: office.name,
    whatsapp: isSet(office.wa_token),
    wa_number: office.wa_number,
    wa_provider: office.wa_provider,
    msg_quota: office.msg_quota,
    my_phone: ctx.staff.phone,
    my_role: ctx.staff.role,
    errors: ctx.isSuper ? (errs ?? []) : [],
    notify: await notifyInfo(ctx, office),
  };
  if (ctx.isSuper) {
    base.openai = isSet(s.OPENAI_API_KEY);
    base.telegram = isSet(s.TELEGRAM_BOT_TOKEN) && String(s.TELEGRAM_BOT_TOKEN).includes(":");
    base.meta = isSet(s.META_APP_SECRET) && isSet(s.META_VERIFY_TOKEN);
    base.meta_webhook = `${FN_BASE}/wa-webhook${PIN}`;
    base.otp_platform = isSet(s.PLATFORM_WA_PHONE_ID) && isSet(s.PLATFORM_WA_TOKEN) && isSet(s.OTP_TEMPLATE);
    base.otp_template = isSet(s.OTP_TEMPLATE) ? s.OTP_TEMPLATE : "";
    base.platform_phone_id = isSet(s.PLATFORM_WA_PHONE_ID) ? s.PLATFORM_WA_PHONE_ID : "";
    base.wa_instance = office.wa_instance;
    base.telegram_chat_id = office.telegram_chat_id;
    base.ai_model = s.AI_MODEL || "gpt-4o-mini";
    base.ai_reasoning = s.AI_REASONING || "low";
    base.operator_tg = isSet(s.OPERATOR_TG_CHAT);
  }
  return base;
}

// المكاتب المفعّل لها تحويل الصوتيات لنص: رموز مفصولة بفواصل، أو * للكل
function voiceSet(s: Record<string, string>) {
  return new Set(String(s.VOICE_OFFICES ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean));
}

// نسخة الشروط واتفاقية معالجة البيانات الحالية — تغييرها يطلب من كل مكتب الموافقة من جديد
const TERMS_VERSION = "2026-09-26";

async function officesFor() {
  const { data } = await db.from("offices")
    .select("id,code,name,license_no,wa_number,wa_provider,wa_instance,active,msg_quota,telegram_chat_id," +
            "fal_status,fal_expires_on,fal_holder_name,fal_verified_at,fal_note,fal_proof_path," +
            "fal_signup_proof,fal_request,onboarded_at,created_at,terms_version,terms_accepted_at")
    .order("created_at");
  const voice = voiceSet(await secrets());
  return Promise.all((data ?? []).map(async (o: any) => {
    const { count: leads } = await db.from("customers")
      .select("id", { count: "exact", head: true }).eq("office_id", o.id);
    const { count: props } = await db.from("properties")
      .select("id", { count: "exact", head: true }).eq("office_id", o.id);
    const { fal_status, fal_expires_on, fal_holder_name, fal_verified_at, fal_note, fal_proof_path,
            fal_signup_proof, fal_request, ...rest } = o;
    return {
      ...rest, wa_linked: !!o.wa_instance, leads, props, fal: falInfo(o),
      voice: voice.has("*") || voice.has(String(o.code).toUpperCase()),
      has_signup_proof: !!fal_signup_proof,
      fal_request: fal_request ? { note: fal_request.note ?? null, at: fal_request.at, by: fal_request.by ?? null } : null,
      terms_ok: o.terms_version === TERMS_VERSION,
    };
  }));
}

Deno.serve(async (req) => {
  const CORS = await corsFor(req);
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s, headers: { ...CORS, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    return await handle(req, json);
  } catch (e) {
    const down = e instanceof SecretsDown;
    return json({ error: down ? "النظام مشغول لحظياً، أعد المحاولة" : "خطأ غير متوقع" }, 503);
  }
});

async function handle(req: Request, json: (b: unknown, s?: number) => Response) {
  let b: any = {};
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const action = String(b.action ?? "");

  if (action === "ping") return json({ ok: true, t: Date.now() });

  // استبدال تذكرة الدخول بجلسة — مرة واحدة فقط
  if (action === "redeem") {
    const raw = String(b.t ?? "").trim();
    if (!raw) return json({ error: "no_token" }, 400);
    const h = await sha(raw);
    const { data: m } = await db.from("sessions")
      .select("staff_id,expires_at,kind,used_at").eq("token_hash", h).maybeSingle();
    if (!m || m.kind !== "magic" || m.used_at || new Date(m.expires_at) < new Date()) {
      await audit("-", false, "magic_invalid", req);
      return json({ error: "رابط الدخول منتهٍ أو مستخدم من قبل. سجّل دخولك برقم جوالك." }, 401);
    }
    // استهلاك ذرّي: أول طلب يفوز، والبقية تُرفض
    const { data: won } = await db.from("sessions")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", h).is("used_at", null).select("staff_id").maybeSingle();
    if (!won) return json({ error: "رابط الدخول مستخدم من قبل" }, 401);

    const { data: st } = await db.from("staff").select("*")
      .eq("id", m.staff_id).eq("active", true).maybeSingle();
    if (!st) return json({ error: "الحساب موقوف" }, 403);

    const token = await newSession(st.id, st.role);
    await db.from("staff").update({ last_login_at: new Date().toISOString() }).eq("id", st.id);
    await audit(st.phone, true, "magic_redeemed", req, st.id);
    return json({ ok: true, token, staff: { name: st.name, role: st.role } });
  }

  if (action === "request_otp") {
    const phone = norm(b.phone);
    if (phone.length < 9) return json({ error: "رقم غير صالح" }, 400);
    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await db.from("login_audit").select("id", { count: "exact", head: true })
      .eq("phone", phone).eq("reason", "otp_sent").gte("created_at", since);
    if ((count ?? 0) >= 10) {
      await audit(phone, false, "otp_daily_cap", req);
      return json({ error: "تجاوزت عدد محاولات الدخول اليوم. حاول بعد ٢٤ ساعة" }, 429);
    }
    const { data: st } = await db.from("staff").select("*,offices(*)")
      .eq("phone", phone).eq("active", true).maybeSingle();
    if (!st) {
      await audit(phone, false, "not_registered", req);
      return json({ error: "not_registered" }, 404);
    }
    if (st.role !== "super_admin" && (st as any).offices?.active === false) {
      await audit(phone, false, "office_inactive", req, st.id);
      return json({ error: "حساب المكتب موقوف حالياً. تواصل مع مقصد." }, 403);
    }
    const { data: prev } = await db.from("otps").select("sent_at").eq("phone", phone).maybeSingle();
    if (prev && Date.now() - new Date(prev.sent_at).getTime() < 45000) {
      return json({ error: "too_soon" }, 429);
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await db.from("otps").upsert({
      phone, code_hash: await sha(code),
      expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
      attempts: 0, sent_at: new Date().toISOString(),
    });
    const res = await sendLoginCode((st as any).offices, phone, code);
    await audit(phone, res.ok, "otp_sent", req, st.id);
    if (!res.ok) {
      await db.from("events").insert({ office_id: (st as any).offices?.id ?? null, level: "error",
        kind: "otp_not_delivered", detail: { to_last4: phone.slice(-4), via: res.via } });
    }
    // لا نعيد اسم الموظف: من يعرف رقماً لا يحصل على اسم صاحبه
    return json({ ok: true, delivered: res.ok });
  }

  if (action === "verify_otp") {
    const phone = norm(b.phone);
    const { data: o } = await db.from("otps").select("*").eq("phone", phone).maybeSingle();
    if (!o) return json({ error: "no_code" }, 400);
    if (new Date(o.expires_at) < new Date()) return json({ error: "expired" }, 400);
    if (o.attempts >= 5) {
      await audit(phone, false, "otp_locked", req);
      return json({ error: "too_many" }, 429);
    }
    if (await sha(String(b.code ?? "")) !== o.code_hash) {
      await db.from("otps").update({ attempts: o.attempts + 1 }).eq("phone", phone);
      await audit(phone, false, "wrong_code", req);
      return json({ error: "wrong_code" }, 400);
    }
    const { data: st } = await db.from("staff").select("*")
      .eq("phone", phone).eq("active", true).single();
    const token = await newSession(st.id, st.role);
    await db.from("staff").update({ last_login_at: new Date().toISOString() }).eq("id", st.id);
    await db.from("otps").delete().eq("phone", phone);
    await audit(phone, true, "login_ok", req, st.id);
    return json({ ok: true, token, staff: { name: st.name, role: st.role } });
  }

  const ctx = await session(req);
  if (!ctx) return json({ error: "unauthorized" }, 401);
  const isSuper = ctx.isSuper;
  const isOwner = ctx.staff.role === "owner" || isSuper;

  let oid = ctx.office.id;
  let office: any = ctx.office;
  if (isSuper && b.office_id && b.office_id !== oid) {
    const { data: o } = await db.from("offices").select("*").eq("id", b.office_id).maybeSingle();
    if (!o) return json({ error: "مكتب غير موجود" }, 404);
    oid = o.id; office = o;
  }

  const meBlock = () => ({
    staff: { name: ctx.staff.name, role: ctx.staff.role, phone: ctx.staff.phone },
    is_super: isSuper,
    office: {
      id: office.id, name: office.name, code: office.code, license_no: office.license_no,
      msg_quota: office.msg_quota, debounce_seconds: office.debounce_seconds,
      wa_number: office.wa_number, wa_provider: office.wa_provider,
      fal: falInfo(office),
      onboarded: !!office.onboarded_at, onboarding: office.onboarding ?? {},
      fal_request: office.fal_request ? { at: office.fal_request.at, note: office.fal_request.note ?? null } : null,
      terms: { version: TERMS_VERSION, ok: office.terms_version === TERMS_VERSION, at: office.terms_accepted_at ?? null },
    },
  });

  // كل الإجراءات؛ وتعديلات المدير تُسجّل بعد نجاحها (مع الحقول اللي تغيّرت فعلاً إن عُرفت)
  let changed: string[] | null = null;
  const act = async (): Promise<Response> => {
  switch (action) {
    case "bootstrap": {
      const [leads, props, status, offices, signups] = await Promise.all([
        db.from("customers")
          .select(LEAD_COLS)
          .eq("office_id", oid)
          .order("last_message_at", { ascending: false, nullsFirst: false }).limit(100),
        db.from("properties").select("*").eq("office_id", oid)
          .order("created_at", { ascending: false }),
        statusFor(ctx, office, oid),
        isSuper ? officesFor() : Promise.resolve(null),
        isSuper
          ? db.from("signup_requests").select("id", { count: "exact", head: true }).eq("status", "new")
          : Promise.resolve({ count: null }),
      ]);
      return json({
        ...meBlock(),
        leads: leads.data ?? [],
        properties: decorate(props.data ?? [], office),
        status, offices,
        signups_new: (signups as any).count ?? null,
      });
    }

    case "me":
      return json(meBlock());

    case "offices_list": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      return json({ offices: await officesFor() });
    }

    case "office_save": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      const o = b.office ?? {};
      const row: Record<string, unknown> = {
        name: String(o.name ?? "").trim(),
        code: String(o.code ?? "").trim().toUpperCase(),
        license_no: licenseKey(o.license_no),
        wa_provider: o.wa_provider === "ultramsg" ? "ultramsg" : "cloud",
        msg_quota: Number(o.msg_quota) || 15,
        debounce_seconds: Number(o.debounce_seconds) || 7,
      };
      // الإيقاف لا يُلغى إلا صراحةً: التعديل بدون الحقل يبقي الحالة كما هي
      if (typeof o.active === "boolean") row.active = o.active;
      else if (!o.id) row.active = true;
      if (o.wa_instance) row.wa_instance = String(o.wa_instance).trim();
      if (o.wa_token) row.wa_token = String(o.wa_token).trim();
      if (o.wa_number) {
        row.wa_number = norm(String(o.wa_number));
        const bad = phoneProblem(String(row.wa_number));
        if (bad) return json({ error: "رقم واتساب المكتب: " + bad }, 400);
      }
      if (o.telegram_chat_id !== undefined) row.telegram_chat_id = String(o.telegram_chat_id).trim();
      if (!row.name || !row.code || !row.license_no) {
        return json({ error: "الاسم والرمز ورقم رخصة فال مطلوبة" }, 400);
      }
      // رقم رخصة جديد = تحقق جديد: التحقق السابق كان لرقم ثاني
      let falReset: { from: string; to: string } | null = null;
      if (o.id) {
        const { data: cur } = await db.from("offices").select("*").eq("id", o.id).maybeSingle();
        if (cur) {
          changed = Object.keys(row).filter((k) => k !== "wa_token" && k in cur && String(cur[k] ?? "") !== String(row[k] ?? ""));
          if (row.wa_token && row.wa_token !== cur.wa_token) changed.push("wa_token");
          if (typeof o.voice === "boolean") {
            const vs = voiceSet(await secrets());
            if (!vs.has("*") && vs.has(String(row.code)) !== o.voice) changed.push("voice");
          }
        }
        if (cur && licenseKey(cur.license_no) !== row.license_no) {
          Object.assign(row, { fal_status: "pending", fal_verified_at: null, fal_verified_by: null,
            fal_note: null, fal_reminded: null });
          if (cur.fal_status !== "pending") falReset = { from: String(cur.license_no), to: String(row.license_no) };
        }
      }
      const res = o.id
        ? await db.from("offices").update(row).eq("id", o.id).select("id,name,code").maybeSingle()
        : await db.from("offices").insert(row).select("id,name,code").maybeSingle();
      if (res.error) return json({ error: res.error.message }, 400);
      await db.from("events").insert({ office_id: res.data!.id, kind: "office_saved",
        detail: { by: ctx.staff.name, active: row.active ?? null } });
      if (falReset) {
        await db.from("events").insert({ office_id: res.data!.id, level: "warn", kind: "fal_reset",
          detail: { by: ctx.staff.name, ...falReset } });
      }
      if (o.from_signup) {
        const { data: sr } = await db.from("signup_requests")
          .update({ status: "converted", updated_at: new Date().toISOString() })
          .eq("id", Number(o.from_signup)).select("fal_proof_path").maybeSingle();
        // صورة الرخصة اللي رفعها صاحب الطلب تنتقل للمكتب: يطابقها المدير مع استعلام الهيئة
        if (sr?.fal_proof_path) {
          await db.from("offices").update({ fal_signup_proof: sr.fal_proof_path }).eq("id", res.data!.id);
        }
      }
      if (typeof o.voice === "boolean") {
        const s = await secrets();
        const set = voiceSet(s);
        const code = String(row.code);
        if (!set.has("*")) {
          if (o.voice) set.add(code); else set.delete(code);
          await db.from("app_secrets").upsert({ key: "VOICE_OFFICES", value: [...set].join(","),
            updated_at: new Date().toISOString() });
          sc = null;
        }
      }
      return json({ ok: true, office: res.data, offices: await officesFor() });
    }

    case "staff_list": {
      const { data } = await db.from("staff")
        .select("id,name,phone,role,active,last_login_at,created_at").eq("office_id", oid).order("created_at");
      return json({ staff: data ?? [] });
    }

    case "staff_save": {
      // صاحب المكتب يضيف وسطاء مكتبه ويعدّلهم ويوقفهم فقط — ما يغيّر الأدوار ولا يلمس مكتب ثاني
      if (!isSuper && ctx.staff.role !== "owner") return json({ error: "forbidden" }, 403);
      const st = b.staff ?? {};
      if (!isSuper) { st.role = "agent"; st.office_id = oid; }
      const phone = norm(String(st.phone ?? ""));
      const bad = phoneProblem(phone);
      if (bad) return json({ error: bad }, 400);
      const role = ["owner", "agent"].includes(st.role) ? st.role : "agent";
      let before: any = null;
      if (st.id) {
        const { data: cur } = await db.from("staff").select("id,phone,role,office_id").eq("id", st.id).maybeSingle();
        if (!cur) return json({ error: "الموظف غير موجود" }, 404);
        if (cur.role === "super_admin") return json({ error: "حساب مشغّل المنصة لا يُعدّل من هنا" }, 403);
        if (!isSuper && (cur.office_id !== oid || cur.role !== "agent")) {
          return json({ error: "تقدر تعدّل وسطاء مكتبك فقط" }, 403);
        }
        before = { phone: String(cur.phone) };   // نسخة، لا مرجع للصف
      }
      const row: Record<string, unknown> = {
        office_id: st.office_id ?? oid,
        name: String(st.name ?? "").trim() || "بدون اسم",
        phone, role,
      };
      if (typeof st.active === "boolean") row.active = st.active;
      else if (!st.id) row.active = true;
      const res = st.id
        ? await db.from("staff").update(row).eq("id", st.id).select("id,name,phone,role,active").maybeSingle()
        : await db.from("staff").insert(row).select("id,name,phone,role,active").maybeSingle();
      if (res.error) {
        const m = res.error.message.includes("staff_phone_key")
          ? "هذا الرقم مسجّل مسبقاً لموظف آخر" : res.error.message;
        return json({ error: m }, 400);
      }
      if (row.active === false) {
        await db.from("sessions").delete().eq("staff_id", res.data!.id);
        await db.from("push_subs").delete().eq("staff_id", res.data!.id);   // جواله ما عاد يستقبل تنبيهات المكتب
      }
      if (before && before.phone !== phone) {
        await db.from("events").insert({ office_id: row.office_id, kind: "staff_phone_changed",
          detail: { by: ctx.staff.name, staff: res.data!.id, from_last4: last4(before.phone), to_last4: last4(phone) } });
      }
      return json({ ok: true, staff: res.data });
    }

    // ===== حذف موظف: فقط إذا ما دخل ولا مرة (رقم انكتب غلط) — ومن دخل يُوقف ولا يُحذف =====
    case "staff_delete": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      const { data: s } = await db.from("staff").select("id,office_id,name,phone,role,last_login_at")
        .eq("id", String(b.id ?? "")).maybeSingle();
      if (!s) return json({ error: "الموظف غير موجود" }, 404);
      if (s.role === "super_admin") return json({ error: "حساب مشغّل المنصة لا يُحذف" }, 403);
      const [{ count: outs }, { count: reqs }, { count: logins }] = await Promise.all([
        db.from("customers").select("id", { count: "exact", head: true }).eq("outcome_by", s.id),
        db.from("privacy_requests").select("id", { count: "exact", head: true }).eq("staff_id", s.id),
        db.from("login_audit").select("id", { count: "exact", head: true }).eq("staff_id", s.id)
          .in("reason", ["login_ok", "magic_redeemed"]),
      ]);
      if (s.last_login_at || (outs ?? 0) > 0 || (reqs ?? 0) > 0 || (logins ?? 0) > 0) {
        return json({ error: "هذا الموظف دخل التطبيق من قبل — أوقفه بدل الحذف عشان تبقى سجلاته" }, 409);
      }
      const { error } = await db.from("staff").delete().eq("id", s.id);
      if (error) return json({ error: "تعذّر الحذف" }, 400);
      await db.from("events").insert({ office_id: s.office_id, kind: "staff_deleted",
        detail: { by: ctx.staff.name, name: s.name, last4: last4(s.phone) } });
      return json({ ok: true });
    }

    // ===== رخصة فال: التحقق اليدوي من استعلام الهيئة — مشغّل المنصة فقط =====
    case "fal_get": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      const { data: hist } = await db.from("fal_checks")
        .select("id,result,license_no,holder_name,expires_on,note,proof_path,checked_by,checked_at")
        .eq("office_id", oid).order("checked_at", { ascending: false }).limit(10);
      const who = [...new Set((hist ?? []).map((h: any) => h.checked_by).filter(Boolean))];
      const names: Record<string, string> = {};
      if (who.length) {
        const { data: st } = await db.from("staff").select("id,name").in("id", who);
        for (const s of st ?? []) names[s.id] = s.name;
      }
      return json({
        license_no: office.license_no, fal: falInfo(office),
        history: (hist ?? []).map((h: any) => ({
          id: h.id, result: h.result, license_no: h.license_no, holder_name: h.holder_name,
          expires_on: h.expires_on, note: h.note, checked_at: h.checked_at,
          by: names[h.checked_by] ?? null, has_proof: !!h.proof_path,
        })),
      });
    }

    // «تم التحقق»: المشغّل فتح استعلام الهيئة وتأكد من ثلاثة: الرخصة سارية، الاسم يطابق السجل التجاري، تاريخ الانتهاء
    case "fal_verify": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      if (licenseKey(b.license_no) !== licenseKey(office.license_no)) {
        return json({ error: "رقم الرخصة تغيّر من وقت ما فتحت الصفحة — سكّرها وافتحها من جديد" }, 409);
      }
      const holder = String(b.holder_name ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
      if (holder.length < 3) return json({ error: "اكتب اسم صاحب الرخصة كما يظهر في الهيئة" }, 400);
      const exp = String(b.expires_on ?? "").trim();
      if (!isDate(exp)) return json({ error: "اكتب تاريخ انتهاء الرخصة كما يظهر في الهيئة" }, 400);
      const today = riyadhToday();
      if (exp < today) {
        return json({ error: "تاريخ الانتهاء فات — الرخصة منتهية وما تُعتمد. اطلب من المكتب يجدّدها أول" }, 400);
      }
      if (daysBetween(today, exp) > 5 * 366) return json({ error: "تاريخ الانتهاء بعيد جداً — تأكد منه" }, 400);
      const c = b.checks ?? {};
      if (!(c.active === true && c.name === true && c.expiry === true)) {
        return json({ error: "تأكد من الثلاثة كلها قبل «تم التحقق»" }, 400);
      }
      const img = parseImage(b.image);
      if ("error" in img) return json({ error: img.error }, 400);
      // منع التكرار: نفس الرخصة ما تُعتمد لمكتبين
      const { data: twins } = await db.from("offices").select("id,name,license_no").eq("fal_status", "verified");
      const twin = (twins ?? []).find((x: any) => x.id !== oid && licenseKey(x.license_no) === licenseKey(office.license_no));
      if (twin) return json({ error: `رخصة فال هذي معتمدة لمكتب ثاني: ${twin.name}` }, 409);

      const path = await putProof(oid, img);
      if (!path) return json({ error: "تعذّر حفظ الصورة — حاول مرة ثانية" }, 500);
      const now = new Date().toISOString();
      const patch = {
        fal_status: "verified", fal_expires_on: exp, fal_holder_name: holder, fal_proof_path: path,
        fal_verified_at: now, fal_verified_by: ctx.staff.id, fal_note: null, fal_reminded: null,
      };
      const { error } = await db.from("offices").update(patch).eq("id", oid);
      if (error) return json({ error: "تعذّر الحفظ" }, 400);
      await db.from("fal_checks").insert({
        office_id: oid, license_no: office.license_no, result: "verified", holder_name: holder,
        expires_on: exp, proof_path: path, checks: { active: true, name: true, expiry: true },
        checked_by: ctx.staff.id,
      });
      await db.from("events").insert({ office_id: oid, kind: "fal_verified",
        detail: { by: ctx.staff.name, expires_on: exp } });
      await tellOffice(office,
        `✅ تحققنا من رخصة فال لمكتب ${office.name}\n\n` +
        `المساعد الآلي صار يرد على عملائكم ويعرض عقاراتكم اللي تراخيص إعلانها سارية.\n` +
        `الرخصة تنتهي ${arDate(exp)}، ونذكّركم قبلها بشهر.\n\n— مقصد`);
      return json({ ok: true, fal: falInfo({ ...office, ...patch }), offices: await officesFor() });
    }

    // رفض أو إيقاف: الرخصة ما تطابق، أو موقوفة في الهيئة — المساعد يتوقف لعملاء المكتب
    case "fal_reject": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      const why = String(b.note ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
      if (why.length < 3) return json({ error: "اكتب السبب — يوصل للمكتب عشان يعرف وش يصلّح" }, 400);
      let path: string | null = null;
      if (b.image) {
        const img = parseImage(b.image);
        if ("error" in img) return json({ error: img.error }, 400);
        path = await putProof(oid, img);
        if (!path) return json({ error: "تعذّر حفظ الصورة — حاول مرة ثانية" }, 500);
      }
      const patch = { fal_status: "rejected", fal_note: why, fal_proof_path: path,
        fal_verified_at: null, fal_verified_by: null, fal_reminded: null };
      const { error } = await db.from("offices").update(patch).eq("id", oid);
      if (error) return json({ error: "تعذّر الحفظ" }, 400);
      await db.from("fal_checks").insert({
        office_id: oid, license_no: office.license_no, result: "rejected", note: why,
        proof_path: path, checked_by: ctx.staff.id,
      });
      await db.from("events").insert({ office_id: oid, level: "warn", kind: "fal_rejected",
        detail: { by: ctx.staff.name, note: why } });
      await tellOffice(office,
        `⛔ ما قدرنا نعتمد رخصة فال لمكتب ${office.name}\n\nالسبب: ${why}\n\n` +
        `المساعد الآلي متوقف عن الرد على العملاء لين نتحقق من الرخصة. ` +
        `ارفعوا صورة شهادة فال سارية باسم المكتب من تطبيق مقصد ← الإعدادات ← مكتبي.\n\n— مقصد`);
      return json({ ok: true, fal: falInfo({ ...office, ...patch }), offices: await officesFor() });
    }

    // عرض صورة التحقق: رابط مؤقت ٥ دقائق من المخزن الخاص
    case "fal_proof": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      let path: string | null = office.fal_proof_path ?? null;
      if (b.check_id !== undefined && b.check_id !== null) {
        const { data: h } = await db.from("fal_checks").select("proof_path")
          .eq("office_id", oid).eq("id", Number(b.check_id)).maybeSingle();
        path = h?.proof_path ?? null;
      }
      if (!path) return json({ error: "ما فيه صورة محفوظة" }, 404);
      const { data, error } = await db.storage.from(FAL_BUCKET).createSignedUrl(path, 300);
      if (error || !data?.signedUrl) return json({ error: "تعذّر فتح الصورة" }, 500);
      return json({ url: data.signedUrl });
    }

    // ===== لوحة المدير =====
    case "admin_log": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      const { data } = await db.from("events").select("id,office_id,detail,created_at")
        .eq("kind", "admin_action").order("id", { ascending: false }).limit(Math.min(Number(b.limit) || 60, 200));
      return json({ log: data ?? [] });
    }

    case "platform_save": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      const MODELS = ["gpt-6-luna", "gpt-4o-mini"], EFFORT = ["low", "medium", "high"];
      const put = async (k: string, v: string) =>
        await db.from("app_secrets").upsert({ key: k, value: v, updated_at: new Date().toISOString() });
      if (b.ai_model !== undefined) {
        if (!MODELS.includes(String(b.ai_model))) return json({ error: "نموذج غير معروف" }, 400);
        await put("AI_MODEL", String(b.ai_model));
      }
      if (b.ai_reasoning !== undefined) {
        if (!EFFORT.includes(String(b.ai_reasoning))) return json({ error: "مستوى غير معروف" }, 400);
        await put("AI_REASONING", String(b.ai_reasoning));
      }
      sc = null;
      return json({ ok: true });
    }

    // صورة رخصة فال المرفوعة مع طلب الانضمام، أو المرفوعة مع طلب تعديل من المكتب
    case "signup_proof": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      let path: string | null = null;
      if (b.signup_id !== undefined) {
        const { data } = await db.from("signup_requests").select("fal_proof_path").eq("id", Number(b.signup_id)).maybeSingle();
        path = data?.fal_proof_path ?? null;
      } else if (b.kind === "request") {
        path = office.fal_request?.path ?? null;
      } else {
        path = office.fal_signup_proof ?? null;
      }
      if (!path) return json({ error: "ما فيه ملف مرفوع" }, 404);
      const { data, error } = await db.storage.from(FAL_BUCKET).createSignedUrl(path, 300);
      if (error || !data?.signedUrl) return json({ error: "تعذّر فتح الملف" }, 500);
      return json({ url: data.signedUrl, pdf: /\.pdf$/i.test(path) });
    }

    // صاحب المكتب يطلب تعديل رخصته: يرفع الرخصة الجديدة، والمدير وحده يعدّل الرقم ويعتمد
    case "fal_request": {
      if (!isOwner) return json({ error: "طلب التعديل لصاحب المكتب فقط" }, 403);
      const file = parseUpload(b.file);
      if ("error" in file) return json({ error: file.error }, 400);
      const path = await putFile(`requests/${oid}`, file);
      if (!path) return json({ error: "تعذّر حفظ الملف، حاول مرة ثانية" }, 500);
      const note = String(b.note ?? "").replace(/[<>]/g, " ").trim().slice(0, 300) || null;
      await db.from("offices").update({ fal_request: { path, note, at: new Date().toISOString(), by: ctx.staff.name } })
        .eq("id", oid);
      await db.from("events").insert({ office_id: oid, kind: "fal_change_requested", detail: { by: ctx.staff.name } });
      await tellOperator(`🪪 طلب تعديل رخصة فال\n\n🏢 ${office.name}\n👤 ${ctx.staff.name}` +
        (note ? `\n📝 ${note}` : "") + `\n\nتجده في منصة مقصد ← المكاتب ← ${office.name} ← رخصة فال.`);
      return json({ ok: true });
    }

    case "fal_request_close": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      await db.from("offices").update({ fal_request: null }).eq("id", oid);
      return json({ ok: true, offices: await officesFor() });
    }

    // ===== موافقة صاحب المكتب على الشروط واتفاقية معالجة البيانات =====
    // صاحب المكتب نفسه فقط (المدير ما يوافق نيابة عنه)؛ يُحفظ رقم النسخة والتاريخ ومن وافق
    case "terms_accept": {
      if (ctx.staff.role !== "owner") return json({ error: "الموافقة لصاحب المكتب فقط" }, 403);
      if (b.version !== TERMS_VERSION) return json({ error: "نسخة الشروط تغيّرت، حدّث الصفحة" }, 409);
      const at = new Date().toISOString();
      await db.from("offices").update({ terms_version: TERMS_VERSION, terms_accepted_at: at, terms_accepted_by: ctx.staff.id })
        .eq("id", oid);
      await db.from("events").insert({ office_id: oid, kind: "terms_accepted",
        detail: { by: ctx.staff.name, staff: ctx.staff.id, version: TERMS_VERSION } });
      return json({ ok: true, terms: { version: TERMS_VERSION, ok: true, at } });
    }

    // خطوات أول دخول: الخطوات المنجزة، وإنهاؤها أو تخطيها
    case "onboarding_save": {
      if (!isOwner) return json({ error: "forbidden" }, 403);
      const STEPS = ["office", "notify", "property", "team"];
      const cur = (office.onboarding ?? {}) as Record<string, string>;
      const next: Record<string, string> = { ...cur };
      for (const k of Array.isArray(b.done) ? b.done : []) if (STEPS.includes(k)) next[k] = new Date().toISOString();
      const patch: Record<string, unknown> = { onboarding: next };
      if (b.finish === true) patch.onboarded_at = new Date().toISOString();
      await db.from("offices").update(patch).eq("id", oid);
      return json({ ok: true, onboarding: next, onboarded: b.finish === true || !!office.onboarded_at });
    }

    case "backups_status": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      const { data } = await db.from("backup_runs")
        .select("started_at,ok,bytes,path,error,row_counts")
        .order("id", { ascending: false }).limit(7);
      return json({ runs: data ?? [] });
    }

    // ===== طلبات الانضمام من الموقع =====
    case "signup_list": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      const { data } = await db.from("signup_requests")
        .select("id,office_name,contact_name,phone,city,fal_license,agents,note,status,created_at,fal_proof_path")
        .order("created_at", { ascending: false }).limit(100);
      return json({ requests: (data ?? []).map(({ fal_proof_path, ...r }: any) => ({ ...r, has_proof: !!fal_proof_path })) });
    }

    case "signup_update": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      const status = ["new", "contacted", "converted", "rejected"].includes(b.status) ? b.status : null;
      if (!status) return json({ error: "حالة غير صحيحة" }, 400);
      const { data, error } = await db.from("signup_requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", Number(b.id)).select("id,status").maybeSingle();
      if (error || !data) return json({ error: "الطلب غير موجود" }, 404);
      return json({ ok: true, request: data });
    }

    // ===== بيانات المكتب: تصدير كامل (حق نظامي لصاحب البيانات) =====
    case "export": {
      if (!isOwner) return json({ error: "التصدير متاح لصاحب المكتب فقط" }, 403);
      const [cust, props, staff, msgs] = await Promise.all([
        readAll(() => db.from("customers")
          .select("id,name,phone,deal_type,property_type,budget,budget_period,location,rooms,appointment,status,mode,summary,msg_count,opted_out,handoff_reason,handed_at,outcome,outcome_at,created_at,last_message_at")
          .eq("office_id", oid).order("created_at").order("id"), 50000),
        readAll(() => db.from("properties")
          .select("id,title,deal_type,property_type,city,district,price,rooms,state,ad_license_no,ad_license_expiry,notes,created_at")
          .eq("office_id", oid).order("created_at").order("id"), 50000),
        readAll(() => db.from("staff").select("name,phone,role,active,created_at")
          .eq("office_id", oid).order("created_at"), 5000),
        readAll(() => db.from("messages").select("id,customer_id,direction,body,created_at")
          .eq("office_id", oid).order("created_at").order("id"), 300000),
      ]);
      await db.from("privacy_requests").insert({
        office_id: oid, staff_id: ctx.staff.id, kind: "export", status: "done",
        closed_at: new Date().toISOString(),
        detail: { customers: cust.length, messages: msgs.length },
      });
      return json({
        exported_at: new Date().toISOString(),
        office: { name: office.name, code: office.code, license_no: office.license_no },
        customers: cust, properties: props, staff, messages: msgs,
      });
    }

    // ===== طلب حذف حساب المكتب: يُنفّذ يدوياً خلال ٣٠ يوماً =====
    case "delete_account_request": {
      if (!isOwner) return json({ error: "طلب حذف الحساب لصاحب المكتب فقط" }, 403);
      const { data: open } = await db.from("privacy_requests").select("id,created_at")
        .eq("office_id", oid).eq("kind", "delete_account").eq("status", "open").maybeSingle();
      if (open) return json({ ok: true, already: true, since: open.created_at });
      const reason = String(b.reason ?? "").slice(0, 300);
      await db.from("privacy_requests").insert({
        office_id: oid, staff_id: ctx.staff.id, kind: "delete_account", status: "open",
        detail: { by: ctx.staff.name, reason },
      });
      await tellOperator(
        `⚠️ طلب حذف حساب مكتب\n\n🏢 ${office.name} (${office.code})\n👤 ${ctx.staff.name}\n` +
        (reason ? `📝 ${reason}\n` : "") +
        `\nالمهلة النظامية: ٣٠ يوماً. نزّل نسخة من بياناته له قبل الحذف.`);
      return json({ ok: true });
    }

    case "leads": {
      let q = db.from("customers")
        .select(LEAD_COLS)
        .eq("office_id", oid).order("last_message_at", { ascending: false, nullsFirst: false }).limit(100);
      if (b.filter === "qualified") q = q.eq("status", "qualified");
      if (b.filter === "manual") q = q.eq("mode", "manual");
      if (b.filter === "auto") q = q.eq("mode", "auto");
      const { data } = await q;
      return json({ leads: data ?? [] });
    }

    case "lead": {
      const { data: c } = await db.from("customers").select("*")
        .eq("office_id", oid).eq("id", b.id).maybeSingle();
      if (!c) return json({ error: "not_found" }, 404);
      const { data: msgs } = await db.from("messages")
        .select("direction,body,created_at").eq("customer_id", c.id)
        .order("created_at", { ascending: false }).limit(20);
      let outcome_by_name: string | null = null;
      if (c.outcome_by) {
        const { data: who } = await db.from("staff").select("name").eq("id", c.outcome_by).maybeSingle();
        outcome_by_name = who?.name ?? null;
      }
      return json({ lead: { ...c, outcome_by_name }, messages: (msgs ?? []).reverse() });
    }

    case "set_mode": {
      const mode = b.mode === "manual" ? "manual" : "auto";
      const { data: cur } = await db.from("customers").select("id,opted_out,mode")
        .eq("office_id", oid).eq("id", b.id).maybeSingle();
      if (!cur) return json({ error: "not_found" }, 404);
      if (mode === "auto" && cur.opted_out) {
        return json({ error: "العميل طلب إيقاف الرسائل الآلية — لا يمكن إعادته للبوت إلا إذا كتب «ابدأ»" }, 409);
      }
      const patch: Record<string, unknown> = { mode };
      // الوسيط استلم محادثة كانت مع البوت: يتابعها بنفسه، فلا تظهر في «ينتظر اتصالك»
      if (mode === "manual" && cur.mode !== "manual") {
        patch.handoff_reason = "taken"; patch.handed_at = new Date().toISOString();
      }
      const { data } = await db.from("customers").update(patch)
        .eq("office_id", oid).eq("id", b.id).select("id,mode").maybeSingle();
      await db.from("events").insert({ office_id: oid, kind: "mode_changed",
        detail: { by: ctx.staff.name, customer: b.id, mode } });
      return json({ ok: true, mode: data?.mode ?? mode });
    }

    case "properties": {
      const { data } = await db.from("properties").select("*")
        .eq("office_id", oid).order("created_at", { ascending: false });
      return json({ properties: decorate(data ?? [], office) });
    }

    case "property_save": {
      const p = b.property ?? {};
      const row = {
        office_id: oid,
        title: String(p.title ?? "").trim(),
        deal_type: p.deal_type ?? "إيجار",
        property_type: p.property_type ?? "شقة",
        district: String(p.district ?? "").trim(),
        price: Number(p.price) || 0,
        rooms: p.rooms ? Number(p.rooms) : null,
        state: PROP_STATES.includes(p.state) ? p.state : "available",
        ad_license_no: p.ad_license_no ? String(p.ad_license_no).trim() : null,
        ad_license_expiry: p.ad_license_expiry || null,
      };
      if (!row.title || !row.district) return json({ error: "الاسم والحي مطلوبان" }, 400);
      const res = p.id
        ? await db.from("properties").update(row).eq("office_id", oid).eq("id", p.id).select().maybeSingle()
        : await db.from("properties").insert(row).select().maybeSingle();
      if (res.error) return json({ error: res.error.message }, 400);
      // عقار جديد: كم عميل سابق يطابقه (المكتب يشوفهم ويقرر بنفسه)
      let matches = 0;
      if (!p.id && res.data?.id) {
        const { data: m } = await db.rpc("match_customers", { p_office: oid, p_property: res.data.id, p_days: 30, p_limit: 50 });
        matches = (m ?? []).length;
      }
      return json({ ok: true, property: res.data, matches });
    }

    // ===== عملاء سابقون يطابقون عقاراً: طلبات عملاء المكتب نفسه في آخر ٣٠ يوماً =====
    // لا إرسال آلي: المكتب يتصل أو يراسل بنفسه. يُستبعد من كتب «توقف» ومن أُغلق طلبه
    case "prop_matches": {
      const { data: prop } = await db.from("properties").select("id,title,deal_type,property_type,district,price,rooms,ad_license_no,ad_license_expiry")
        .eq("office_id", oid).eq("id", b.id).maybeSingle();
      if (!prop) return json({ error: "not_found" }, 404);
      const { data, error } = await db.rpc("match_customers", { p_office: oid, p_property: prop.id, p_days: 30, p_limit: 30 });
      if (error) return json({ error: "تعذّر البحث الآن" }, 500);
      await db.from("events").insert({ office_id: oid, kind: "prop_matches",
        detail: { by: ctx.staff.name, property: prop.id, n: (data ?? []).length } });
      return json({ property: prop, customers: data ?? [], days: 30 });
    }

    // ===== نتيجة الاتصال: يسجّلها أي موظف في المكتب =====
    case "lead_outcome": {
      const outcome = b.outcome === null ? null : String(b.outcome ?? "");
      if (outcome !== null && !OUTCOMES.includes(outcome)) return json({ error: "نتيجة غير معروفة" }, 400);
      const { data: cur } = await db.from("customers").select("id,first_outcome_at,outcome")
        .eq("office_id", oid).eq("id", b.id).maybeSingle();
      if (!cur) return json({ error: "not_found" }, 404);
      const prev = cur.outcome ?? null;
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = outcome === null
        ? { outcome: null, outcome_at: null, outcome_by: null }
        : { outcome, outcome_at: now, outcome_by: ctx.staff.id, first_outcome_at: cur.first_outcome_at ?? now };
      const { data, error } = await db.from("customers").update(patch)
        .eq("office_id", oid).eq("id", b.id).select(LEAD_COLS).maybeSingle();
      if (error || !data) return json({ error: "تعذّر الحفظ" }, 400);
      await db.from("events").insert({ office_id: oid, kind: "outcome_set",
        detail: { by: ctx.staff.name, customer: b.id, from: prev, to: outcome } });
      return json({ ok: true, lead: { ...data, outcome_by_name: outcome ? ctx.staff.name : null } });
    }

    // ===== ملخص الشهر للمكتب (نفس أرقام رسالة أول الشهر) =====
    case "month_stats": {
      const r = monthRange(b.month);
      const { data, error } = await db.rpc("office_month_stats", { p_office: oid, p_from: r.from, p_to: r.to });
      if (error) return json({ error: "تعذّر حساب الملخص" }, 500);
      return json({ month: r.month, stats: data ?? {} });
    }

    // ===== استهلاك المنصة وتكلفتها لكل مكتب — للمشغّل فقط =====
    case "platform_usage": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      const r = monthRange(b.month);
      const { data, error } = await db.rpc("platform_usage", { p_from: `${r.month}-01`, p_to: `${r.next}-01` });
      if (error) return json({ error: "تعذّر حساب الاستهلاك" }, 500);
      const s = await secrets();
      const pr = {
        ai_in: num0(s.PRICE_AI_IN ?? 0.15), ai_cached: num0(s.PRICE_AI_CACHED ?? 0.075),
        ai_out: num0(s.PRICE_AI_OUT ?? 0.6), otp: num0(s.PRICE_OTP ?? 0.018),
        updated: s.PRICES_UPDATED ?? null, usd_sar: 3.75,
      };
      const rows = ((data as any[]) ?? []).map((o) => {
        const uncached = Math.max(0, num0(o.ai_in) - num0(o.ai_cached));
        const ai = (uncached * pr.ai_in + num0(o.ai_cached) * pr.ai_cached + num0(o.ai_out) * pr.ai_out) / 1e6;
        const otp = num0(o.otp_platform) * pr.otp;
        return { ...o, cost_ai_usd: +ai.toFixed(4), cost_otp_usd: +otp.toFixed(4), cost_usd: +(ai + otp).toFixed(4) };
      });
      const sum = (k: string) => rows.reduce((a, o: any) => a + num0(o[k]), 0);
      const totals = {
        offices: rows.length, active: rows.filter((o: any) => o.active).length,
        new_customers: sum("new_customers"), qualified: sum("qualified"), deals: sum("deals"),
        inbound: sum("inbound"), ai_calls: sum("ai_calls"), otp: sum("otp_platform") + sum("otp_office"),
        errors: sum("errors"), cost_usd: +sum("cost_usd").toFixed(4),
      };
      return json({ month: r.month, rows, totals, prices: pr });
    }

    case "analytics": {
      const { data: sum } = await db.rpc("office_summary", { p_office: oid, p_days: 30 });
      const { data: gap } = await db.rpc("demand_gap", { p_office: oid, p_days: 30 });
      return json({ summary: sum, gap: gap ?? [] });
    }

    case "settings_status":
      return json(await statusFor(ctx, office, oid));

    case "save_settings": {
      const s = b.settings ?? {};
      if (!isSuper) {
        if (s.openai_key || s.telegram_token || s.wa_token || s.wa_instance || s.wa_number ||
            s.meta_app_secret || s.meta_verify_token || s.platform_wa_phone_id || s.platform_wa_token ||
            s.otp_template || s.otp_template_lang ||
            s.price_ai_in || s.price_ai_cached || s.price_ai_out || s.price_otp) {
          return json({ error: "إعدادات الربط يضبطها مشغّل المنصة فقط" }, 403);
        }
        if (s.my_phone) {
          const p = norm(String(s.my_phone));
          if (p.length >= 9) await db.from("staff").update({ phone: p }).eq("id", ctx.staff.id);
        }
        return json({ ok: true, scope: "self" });
      }
      if (s.telegram_token && !String(s.telegram_token).includes(":")) {
        return json({ error: "توكن البوت غير صحيح — الصحيح يشبه 8123456789:AAH... وليس رقم المجموعة" }, 400);
      }
      const put = async (k: string, v: string) => {
        await db.from("app_secrets").upsert({ key: k, value: v.trim(), updated_at: new Date().toISOString() });
      };
      if (s.openai_key) await put("OPENAI_API_KEY", String(s.openai_key));
      if (s.telegram_token) await put("TELEGRAM_BOT_TOKEN", String(s.telegram_token));
      if (s.meta_app_secret) await put("META_APP_SECRET", String(s.meta_app_secret));
      if (s.meta_verify_token) await put("META_VERIFY_TOKEN", String(s.meta_verify_token));
      if (s.platform_wa_phone_id) await put("PLATFORM_WA_PHONE_ID", String(s.platform_wa_phone_id).replace(/\D/g, ""));
      if (s.platform_wa_token) await put("PLATFORM_WA_TOKEN", String(s.platform_wa_token));
      if (s.otp_template) await put("OTP_TEMPLATE", String(s.otp_template).trim().toLowerCase());
      if (s.otp_template_lang) await put("OTP_TEMPLATE_LANG", String(s.otp_template_lang).trim());
      // الأسعار التقديرية بالدولار (لكل مليون وحدة للذكاء، ولكل رسالة لرمز الدخول)
      let priced = false;
      for (const [k, key] of [["price_ai_in", "PRICE_AI_IN"], ["price_ai_cached", "PRICE_AI_CACHED"],
                              ["price_ai_out", "PRICE_AI_OUT"], ["price_otp", "PRICE_OTP"]] as const) {
        if (s[k] === undefined || s[k] === "") continue;
        const v = Number(String(s[k]).replace(",", "."));
        if (!Number.isFinite(v) || v < 0 || v > 1000) return json({ error: "سعر غير صحيح" }, 400);
        await put(key, String(v)); priced = true;
      }
      if (priced) await put("PRICES_UPDATED", new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10));

      const off: Record<string, unknown> = {};
      if (s.wa_instance) off.wa_instance = String(s.wa_instance).trim();
      if (s.wa_token) off.wa_token = String(s.wa_token).trim();
      if (s.wa_number) off.wa_number = norm(String(s.wa_number));
      if (s.telegram_chat_id !== undefined && String(s.telegram_chat_id).trim() !== "") {
        off.telegram_chat_id = String(s.telegram_chat_id).trim();
      }
      if (s.msg_quota) off.msg_quota = Number(s.msg_quota);
      if (Object.keys(off).length) await db.from("offices").update(off).eq("id", oid);

      if (s.my_phone) {
        const p = norm(String(s.my_phone));
        if (p.length >= 9) await db.from("staff").update({ phone: p }).eq("id", ctx.staff.id);
      }
      sc = null;
      await db.from("events").insert({ office_id: oid, kind: "settings_saved",
        detail: { by: ctx.staff.name } });
      return json({ ok: true, scope: "platform" });
    }

    case "test_whatsapp": {
      if (!isSuper) return json({ error: "forbidden" }, 403);
      const to = norm(String(b.to ?? ctx.staff.phone ?? ""));
      if (to.length < 9) return json({ error: "لا يوجد رقم للاختبار" }, 400);
      const { data: off } = await db.from("offices").select("*").eq("id", oid).single();
      const ok = await sendWhatsApp(off, to, "رسالة اختبار من مقصد — الربط يعمل ✅");
      return json({ ok, to });
    }

    case "logout":
      await db.from("sessions").delete().eq("staff_id", ctx.staff.id);
      await db.from("push_subs").delete().eq("staff_id", ctx.staff.id);
      return json({ ok: true });

    // ===== التنبيهات =====
    // صاحب المكتب يختار القنوات: تيليجرام، الجوال، أو الاثنين (وحدة على الأقل)
    case "notify_save": {
      if (!isOwner) return json({ error: "اختيار طريقة التنبيهات لصاحب المكتب" }, 403);
      const tg = b.telegram === true, push = b.push === true;
      if (!tg && !push) return json({ error: "اختر طريقة وحدة على الأقل، وإلا ما يوصلك العميل الجاهز" }, 400);
      await db.from("offices").update({ notify_telegram: tg, notify_push: push }).eq("id", oid);
      await db.from("events").insert({ office_id: oid, kind: "notify_saved", detail: { by: ctx.staff.name, telegram: tg, push } });
      const { data: fresh } = await db.from("offices").select("*").eq("id", oid).single();
      return json({ ok: true, notify: await notifyInfo(ctx, fresh) });
    }

    // ربط تيليجرام بضغطة: رمز لمرة وحدة داخل رابط البوت، والبوت يربط المحادثة أو المجموعة اللي فتحته
    case "tg_link": {
      if (!isOwner) return json({ error: "ربط تيليجرام لصاحب المكتب" }, 403);
      // حروف كبيرة وأرقام فقط (بوت الربط يقرأ الرمز بالحروف الكبيرة)، بلا الأحرف المتشابهة O/0 و I/1
      const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const rnd = crypto.getRandomValues(new Uint8Array(12));
      const code = Array.from(rnd, (x) => abc[x % abc.length]).join("");
      await db.from("offices").update({ tg_link_code: code, notify_telegram: true }).eq("id", oid);
      const bot = botName(await secrets());
      return json({ ok: true, bot, code,
        private: `https://t.me/${bot}?start=${code}`, group: `https://t.me/${bot}?startgroup=${code}` });
    }
    case "tg_status": {
      const { data: o } = await db.from("offices").select("telegram_chat_id,tg_link_code").eq("id", oid).single();
      return json({ linked: !!o?.telegram_chat_id, waiting: !!o?.tg_link_code });
    }
    case "tg_unlink": {
      if (!isOwner) return json({ error: "فك الربط لصاحب المكتب" }, 403);
      const { data: o } = await db.from("offices").select("notify_push").eq("id", oid).single();
      // ما نترك المكتب بلا أي قناة: إذا تيليجرام كان الوحيد، نشغّل الجوال
      await db.from("offices").update({ telegram_chat_id: null, tg_link_code: null,
        notify_telegram: false, notify_push: true }).eq("id", oid);
      await db.from("events").insert({ office_id: oid, kind: "telegram_unlinked", detail: { by: ctx.staff.name, push_was: o?.notify_push ?? null } });
      return json({ ok: true });
    }
    case "tg_test": {
      const { data: o } = await db.from("offices").select("telegram_chat_id").eq("id", oid).single();
      if (!o?.telegram_chat_id) return json({ error: "تيليجرام غير مربوط" }, 400);
      const ok = await telegramSend((await secrets()).TELEGRAM_BOT_TOKEN, o.telegram_chat_id,
        "✅ تجربة من مقصد\n\nتنبيهات العملاء توصل هنا.");
      return ok ? json({ ok: true }) : json({ error: "ما وصلت الرسالة — تأكد أن البوت ما زال في المجموعة" }, 502);
    }

    // إشعارات الجوال: كل جهاز يفعّلها لنفسه (أي موظف نشط)
    case "push_subscribe": {
      const sub = b.sub ?? {};
      const endpoint = String(sub.endpoint ?? "");
      if (!PUSH_HOST.test(endpoint) || endpoint.length > 1000) return json({ error: "جهاز غير مدعوم" }, 400);
      if (!b64uOk(sub.keys?.p256dh, 87) || !b64uOk(sub.keys?.auth, 22)) return json({ error: "بيانات الجهاز ناقصة" }, 400);
      const { count } = await db.from("push_subs").select("id", { count: "exact", head: true }).eq("office_id", oid);
      await db.from("push_subs").delete().eq("endpoint", endpoint);
      if ((count ?? 0) >= 40) return json({ error: "وصل المكتب للحد الأعلى من الأجوال المفعّلة" }, 400);
      const { error } = await db.from("push_subs").insert({ office_id: oid, staff_id: ctx.staff.id, endpoint,
        p256dh: sub.keys.p256dh, auth: sub.keys.auth, device: String(b.device ?? "").slice(0, 60) || null });
      if (error) return json({ error: "تعذّر التفعيل" }, 400);
      return json({ ok: true });
    }
    case "push_unsubscribe": {
      await db.from("push_subs").delete().eq("endpoint", String(b.endpoint ?? "")).eq("staff_id", ctx.staff.id);
      return json({ ok: true });
    }
    case "push_test": {
      const endpoint = String(b.endpoint ?? "");
      if (!endpoint) return json({ error: "فعّل الإشعارات على هذا الجوال أولاً" }, 400);
      const r = await pushOffice(db, await ensureVapid(), oid, { title: "✅ إشعارات مقصد شغّالة",
        body: "كذا يوصلك العميل الجاهز أول ما يكتمل طلبه.", url: "/", tag: "test" }, { endpoint, staff_id: ctx.staff.id });
      if (!r.devices) return json({ error: "هذا الجوال غير مفعّل — فعّله مرة ثانية" }, 404);
      return r.sent ? json({ ok: true }) : json({ error: "ما وصل الإشعار — فعّله مرة ثانية" }, 502);
    }
  }

  return json({ error: "unknown action" }, 400);
  };
  const res = await act();
  if (isSuper && res.status < 400 && ADMIN_LOGGED.has(action)) {
    try { await logAdmin(ctx, action, b, oid, office, changed); } catch { /* السجل ليس شرطاً لنجاح العملية */ }
  }
  return res;
}

// ===== سجل تعديلات المدير =====
// يُحفظ من غيّر ماذا وفي أي مكتب — أسماء الحقول فقط، بلا قيم (ما نحفظ مفاتيح أو أرقام في السجل)
const ADMIN_LOGGED = new Set([
  "office_save", "staff_save", "staff_delete", "fal_verify", "fal_reject", "fal_request_close",
  "signup_update", "save_settings", "platform_save", "property_save", "lead_outcome", "set_mode",
  "notify_save", "tg_unlink",
]);
const ACTION_AR: Record<string, string> = {
  office_save: "بيانات المكتب", staff_save: "موظف", staff_delete: "حذف موظف",
  fal_verify: "اعتماد رخصة فال", fal_reject: "رفض رخصة فال", fal_request_close: "طلب تعديل الرخصة",
  signup_update: "طلب انضمام", save_settings: "إعدادات الربط", platform_save: "إعدادات المنصة",
  property_save: "عقار", lead_outcome: "نتيجة اتصال", set_mode: "وضع محادثة",
  notify_save: "التنبيهات", tg_unlink: "فصل تيليجرام",
};
// إعدادات تخص المنصة كلها (مو مكتب بعينه)
const PLATFORM_ACTIONS = new Set(["platform_save", "signup_update"]);
async function logAdmin(ctx: any, action: string, b: any, oid: string, office: any, changed: string[] | null) {
  const filled = (o: any) => o && typeof o === "object" ? Object.keys(o).filter((k) => o[k] !== "" && o[k] != null) : [];
  // تعديل مكتب: الحقول اللي تغيّرت فعلاً · إعدادات الربط: المفاتيح اللي انكتبت · غيرها: اسم العنصر بدل الحقول
  const fields = (changed ?? (action === "save_settings" ? filled(b.settings) : action === "office_save" ? filled(b.office) : []))
    .filter((k) => k !== "id" && k !== "office_id").slice(0, 20);
  const platformWide = PLATFORM_ACTIONS.has(action) ||
    (action === "save_settings" && !b.office_id && !filled(b.settings).some((k) => ["wa_instance", "wa_token", "wa_number", "msg_quota", "telegram_chat_id"].includes(k)));
  const target = action === "office_save" ? (b.office?.id ?? null) : platformWide ? null : oid;
  await db.from("events").insert({
    office_id: target, kind: "admin_action",
    detail: {
      by: ctx.staff.name, action, label: ACTION_AR[action] ?? action, fields,
      office: action === "office_save" ? String(b.office?.name ?? "") : target ? office?.name ?? null : null,
      what: action === "property_save" ? String(b.property?.title ?? "") || null
        : action === "staff_save" ? String(b.staff?.name ?? "") || null : null,
      ref: b.id ?? b.lead_id ?? b.property?.id ?? b.staff?.id ?? null,
    },
  });
}
