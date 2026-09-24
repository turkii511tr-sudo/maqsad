// مقصد — استقبال طلبات الانضمام من الموقع (v1.1)
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
  if (fal_license && (fal_license.length < 4 || fal_license.length > 20)) {
    errors.fal_license = "رقم رخصة فال أرقام فقط";
  }
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

  const { data: row, error } = await db.from("signup_requests").insert({
    office_name, contact_name, phone, city, fal_license, agents, note, ip_hash,
  }).select("id").single();
  if (error) {
    await db.from("events").insert({ level: "error", kind: "signup_insert_failed",
      detail: { error: error.message } });
    return json({ error: "تعذّر حفظ الطلب الآن، حاول بعد دقيقة" }, 500);
  }

  await db.from("events").insert({ level: "info", kind: "signup_request", detail: { id: row.id } });

  await tell(
    `🆕 طلب انضمام من موقع مقصد\n\n` +
    `🏢 ${office_name}\n👤 ${contact_name}\n📱 ${phone}\n` +
    `📍 ${city ?? "—"}\n🪪 فال: ${fal_license ?? "لم يُذكر"}\n👥 الوسطاء: ${agents ?? "—"}\n` +
    (note ? `📝 ${note}\n` : "") +
    `\n🔗 https://wa.me/${phone}\n\nتجده في منصة مقصد ← المكاتب ← طلبات الانضمام.`,
  );

  return json({ ok: true });
});
