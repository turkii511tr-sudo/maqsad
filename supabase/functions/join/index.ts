// مقصد — استقبال طلبات الانضمام من الموقع والتطبيق (v1.2)
// v1.2: رقم رخصة فال وصورتها (صورة أو PDF) إلزامية — تُحفظ في مخزن خاص ولا يفتحها إلا المدير
// نموذج عام: بلا جلسة، بحماية من الإغراق (فخ للبرامج الآلية + حد لكل عنوان + منع التكرار)
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });

let sc: { v: Record<string, string>; at: number } | null = null;
async function secrets() {
  if (sc && Date.now() - sc.at < 60_000) return sc.v;
  const { data } = await db.from("app_secrets").select("key,value");
  sc = { v: Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value])), at: Date.now() };
  return sc.v;
}

async function hashIp(ip: string) {
  const s = await secrets();
  const buf = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(ip + "|" + (s.WEBHOOK_SECRET ?? "")));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// الأرقام العربية والفارسية ← إنجليزية
const toLatin = (v: unknown) =>
  String(v ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

function saudiMobile(v: unknown): string | null {
  let d = toLatin(v).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("05") && d.length === 10) d = "966" + d.slice(1);
  if (d.startsWith("5") && d.length === 9) d = "966" + d;
  return /^9665\d{8}$/.test(d) ? d : null;
}

const text = (v: unknown, max: number) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// ملف رخصة فال: صورة (PNG/JPG/WEBP) أو PDF حقيقي — تُفحص بصمة الملف لا اسمه — بحد ٣ ميجابايت
const BUCKET = "fal-proofs";
type Up = { bytes: Uint8Array; mime: string; ext: string };
function parseUpload(v: unknown): Up | null {
  const m = /^data:([a-z]+\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(v ?? ""));
  if (!m) return null;
  let bin = "";
  try { bin = atob(m[2].replace(/\s/g, "")); } catch { return null; }
  if (bin.length < 1024 || bin.length > 3 * 1024 * 1024) return null;
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  if (bin.slice(0, 5) === "%PDF-") return { bytes, mime: "application/pdf", ext: "pdf" };
  if (bytes[0] === 0x89 && bin.slice(1, 4) === "PNG") return { bytes, mime: "image/png", ext: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { bytes, mime: "image/jpeg", ext: "jpg" };
  if (bin.slice(0, 4) === "RIFF" && bin.slice(8, 12) === "WEBP") return { bytes, mime: "image/webp", ext: "webp" };
  return null;
}

const AGENTS = ["1", "2-5", "6-15", "16+"];

async function operatorChat(): Promise<string | null> {
  const s = await secrets();
  if (s.OPERATOR_TG_CHAT) return s.OPERATOR_TG_CHAT;
  const { data } = await db.from("staff").select("offices(telegram_chat_id)")
    .eq("role", "super_admin").eq("active", true).limit(1).maybeSingle();
  return (data as any)?.offices?.telegram_chat_id ?? null;
}

async function tell(textMsg: string) {
  const s = await secrets();
  const token = s.TELEGRAM_BOT_TOKEN;
  const chat = await operatorChat();
  if (!token || !token.includes(":") || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: textMsg, disable_web_page_preview: true }),
    });
  } catch { /* التنبيه ليس شرطاً لنجاح الطلب */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let b: any;
  try { b = await req.json(); } catch { return json({ error: "صيغة الطلب غير صحيحة" }, 400); }

  // فخ البرامج الآلية: حقل مخفي يجب أن يبقى فارغاً، ونموذج يُعبّأ في أقل من ثانيتين ونصف مريب
  const elapsed = Number(b.t ?? 0);
  if (text(b.website, 200) !== "" || !Number.isFinite(elapsed) || elapsed < 2500) {
    return json({ ok: true });
  }

  const errors: Record<string, string> = {};
  // النماذج الجديدة (v=2) ترسل صورة الرخصة إلزامياً. نموذج الموقع القديم (بلا v) يُقبل بدونها
  // لين يُرفع الموقع الجديد، وبعدها يُحذف هذا الاستثناء
  const legacy = b.v === undefined && b.fal_file === undefined;
  const office_name = text(b.office_name, 120);
  const contact_name = text(b.contact_name, 80);
  const phone = saudiMobile(b.phone);
  const city = text(b.city, 40) || null;
  const falRaw = toLatin(b.fal_license).replace(/\D/g, "");
  const fal_license = falRaw || null;
  const agents = AGENTS.includes(String(b.agents)) ? String(b.agents) : null;
  const note = text(b.note, 500) || null;

  if (office_name.length < 2) errors.office_name = "اكتب اسم المكتب";
  if (contact_name.length < 2) errors.contact_name = "اكتب اسمك";
  if (!phone) errors.phone = "اكتب رقم جوال سعودي يبدأ بـ 05";
  if (!fal_license && !legacy) errors.fal_license = "اكتب رقم رخصة فال";
  else if (fal_license && (fal_license.length < 4 || fal_license.length > 20)) errors.fal_license = "رقم رخصة فال أرقام فقط";
  const upload = legacy ? null : parseUpload(b.fal_file);
  if (!legacy && !upload) errors.fal_file = b.fal_file ? "الملف لازم يكون صورة أو PDF، وحجمه أقل من ٣ ميجابايت" : "أرفق صورة رخصة فال";
  if (b.consent !== true) errors.consent = "الموافقة على سياسة الخصوصية مطلوبة لإرسال الطلب";
  if (Object.keys(errors).length) return json({ error: "راجع الحقول المظللة", fields: errors }, 422);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ip_hash = await hashIp(ip);
  const since = new Date(Date.now() - 864e5).toISOString();

  const { count: fromIp } = await db.from("signup_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ip_hash).gte("created_at", since);
  if ((fromIp ?? 0) >= 5) {
    return json({ error: "وصلتنا عدة طلبات من نفس الجهاز اليوم. حاول بكرة، أو راسلنا من صفحة «راسلنا»." }, 429);
  }

  // نفس الرقم خلال ٢٤ ساعة = طلب مكرر؛ نرد بنجاح بلا تسجيل ثانٍ
  const { count: samePhone } = await db.from("signup_requests")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone!).gte("created_at", since);
  if ((samePhone ?? 0) > 0) return json({ ok: true, duplicate: true });

  // الملف يُحفظ قبل الطلب: إذا فشل الحفظ نرجع خطأ بدل طلب بلا رخصة
  const fal_proof_path = upload
    ? `signups/${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}.${upload.ext}` : null;
  const { error: upErr } = upload
    ? await db.storage.from(BUCKET).upload(fal_proof_path!, upload.bytes, { contentType: upload.mime, upsert: false })
    : { error: null };
  if (upErr) {
    await db.from("events").insert({ level: "error", kind: "signup_upload_failed", detail: { error: upErr.message } });
    return json({ error: "تعذّر رفع صورة الرخصة الآن، حاول بعد دقيقة" }, 500);
  }

  const { data: row, error } = await db.from("signup_requests").insert({
    office_name, contact_name, phone, city, fal_license, agents, note, ip_hash, fal_proof_path,
  }).select("id").single();
  if (error) {
    await db.from("events").insert({ level: "error", kind: "signup_insert_failed",
      detail: { error: error.message } });
    return json({ error: "تعذّر حفظ الطلب الآن، حاول بعد دقيقة" }, 500);
  }

  await db.from("events").insert({ level: "info", kind: "signup_request", detail: { id: row.id } });

  await tell(
    `🆕 طلب انضمام لمقصد\n\n` +
    `🏢 ${office_name}\n👤 ${contact_name}\n📱 ${phone}\n` +
    `📍 ${city ?? "—"}\n🪪 فال: ${fal_license ?? "لم يُذكر"}${fal_proof_path ? " (صورة الرخصة مرفقة في المنصة)" : ""}\n👥 الوسطاء: ${agents ?? "—"}\n` +
    (note ? `📝 ${note}\n` : "") +
    `\n🔗 https://wa.me/${phone}\n\nتجده في منصة مقصد ← طلبات الانضمام.`,
  );

  return json({ ok: true });
});
