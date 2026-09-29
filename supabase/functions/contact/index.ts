// مقصد — رسائل «راسلنا» من الموقع (v1)
// نموذج عام: بلا جلسة، بحماية من الإغراق (فخ للبرامج الآلية + حد لكل جهاز)، وتنبيه فوري لمشغّل المنصة
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

// سطر واحد: بلا رموز تحكم ولا أقواس وسوم، ومسافات موحّدة
const line = (v: unknown, max: number) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// نص الرسالة: نحفظ الأسطر، ونحذف رموز التحكم فقط
const body = (v: unknown, max: number) =>
  String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

const TOPICS: Record<string, string> = {
  general: "استفسار عام",
  support: "دعم فني لمكتب مشترك",
  billing: "الاشتراك والفوترة",
  privacy: "طلب يخص البيانات الشخصية",
  complaint: "شكوى أو ملاحظة",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  } catch { /* التنبيه ليس شرطاً لحفظ الرسالة */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let b: any;
  try { b = await req.json(); } catch { return json({ error: "صيغة الطلب غير صحيحة" }, 400); }

  // فخ البرامج الآلية: حقل مخفي يجب أن يبقى فارغاً، ونموذج يُرسل في أقل من ثانيتين ونصف مريب
  const elapsed = Number(b.t ?? 0);
  if (line(b.website, 200) !== "" || !Number.isFinite(elapsed) || elapsed < 2500) {
    return json({ ok: true });
  }

  const errors: Record<string, string> = {};
  const name = line(b.name, 80);
  const phoneRaw = line(b.phone, 30);
  const phone = phoneRaw ? saudiMobile(phoneRaw) : null;
  const email = line(b.email, 120).toLowerCase() || null;
  const topic = String(b.topic ?? "");
  const message = body(b.message, 1500);

  if (name.length < 2) errors.name = "اكتب اسمك";
  if (!phoneRaw && !email) errors.phone = "اكتب جوالك أو بريدك عشان نقدر نرد عليك";
  else if (phoneRaw && !phone) errors.phone = "اكتب رقم جوال سعودي يبدأ بـ 05";
  if (email && !EMAIL_RE.test(email)) errors.email = "البريد غير صحيح";
  if (!TOPICS[topic]) errors.topic = "اختر موضوع الرسالة";
  if (message.length < 10) errors.message = "اكتب رسالتك (١٠ أحرف على الأقل)";
  if (b.consent !== true) errors.consent = "الموافقة على سياسة الخصوصية مطلوبة للإرسال";
  if (Object.keys(errors).length) return json({ error: "راجع الحقول المظللة", fields: errors }, 422);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ip_hash = await hashIp(ip);
  const since = new Date(Date.now() - 864e5).toISOString();

  const { count: fromIp } = await db.from("contact_messages")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ip_hash).gte("created_at", since);
  if ((fromIp ?? 0) >= 5) {
    return json({ error: "وصلتنا عدة رسائل من نفس الجهاز اليوم. حاول بكرة، أو اكتب لنا من جهاز ثاني." }, 429);
  }

  const { data: row, error } = await db.from("contact_messages").insert({
    name, phone, email: email || null, topic, message, ip_hash,
  }).select("id").single();
  if (error) {
    await db.from("events").insert({ level: "error", kind: "contact_insert_failed",
      detail: { error: error.message } });
    return json({ error: "تعذّر حفظ الرسالة الآن، حاول بعد دقيقة" }, 500);
  }

  await db.from("events").insert({ level: "info", kind: "contact_message", detail: { id: row.id, topic } });

  const head = topic === "privacy"
    ? "🔐 طلب يخص البيانات الشخصية — الرد خلال ٣٠ يوماً نظاماً"
    : "✉️ رسالة من موقع مقصد";
  await tell(
    `${head}\n\n📌 ${TOPICS[topic]}\n👤 ${name}\n` +
    (phone ? `📱 ${phone}\n🔗 https://wa.me/${phone}\n` : "") +
    (email ? `📧 ${email}\n` : "") +
    `\n${message}\n\n#رسالة_${row.id}`,
  );

  return json({ ok: true });
});
