// مقصد — متابعة رخص فال (v2)
// v2: التنبيه يوصل المكتب على قنواته المختارة (تيليجرام و/أو إشعارات الجوال)
// يومياً ٩ الصبح بتوقيت الرياض:
//  • ينبّه مجموعة المكتب (ونسخة لمشغّل المنصة) قبل انتهاء رخصة فال بـ٣٠ يوماً، ثم ٧ أيام، ثم آخر يوم،
//    ويوم انتهائها — وعندها يوقف المساعد عرض العقارات تلقائياً إلى أن يُتحقق من الرخصة المجددة.
//    كل مرحلة تُرسل مرة وحدة فقط، وإذا فات يوم تُستدرك في اليوم اللي بعده.
//  • يذكّر المشغّل بالمكاتب اللي راسلها عملاء خلال آخر ٢٤ ساعة والمساعد متوقف لأن رخصتها ما تحققت.
// المعاملات: k (المفتاح السري) · dry=1 (يرجع النصوص بلا إرسال ولا حفظ) · today=YYYY-MM-DD (للاختبار)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { alertOffice } from "./notify.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export const riyadhToday = (ms = Date.now()) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
export const arDate = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${dd} ${MONTHS[m - 1]} ${y}`;
};

// المرحلة: 30 · 7 · 1 (بكرة أو اليوم) · -1 (انتهت)
export function stageOf(days: number): number | null {
  if (days < 0) return -1;
  if (days <= 1) return 1;
  if (days <= 7) return 7;
  if (days <= 30) return 30;
  return null;
}

export const inDays = (n: number) =>
  n === 0 ? "اليوم" : n === 1 ? "بكرة" : n === 2 ? "بعد يومين" : n <= 10 ? `بعد ${n} أيام` : `بعد ${n} يوماً`;

export function reminderText(o: { name: string; fal_expires_on: string }, days: number) {
  if (days < 0) {
    return `⛔ انتهت رخصة فال لمكتب ${o.name} (${arDate(o.fal_expires_on)})\n\n` +
      `المساعد الآلي وقف عرض العقارات على العملاء تلقائياً، ويكمل استقبال طلباتهم وتحويلها لكم.\n\n` +
      `جدّدوا الرخصة من منصة الهيئة العامة للعقار، وأرسلوا صورة الشهادة الجديدة لمقصد — ` +
      `يرجع العرض بعد ما نتحقق منها.\n\n— مقصد`;
  }
  return `⏰ رخصة فال لمكتب ${o.name} تنتهي ${inDays(days)} (${arDate(o.fal_expires_on)})\n\n` +
    `جدّدوها من منصة الهيئة العامة للعقار، وأرسلوا صورة الشهادة الجديدة لمقصد.\n` +
    `إذا انتهت قبل التجديد، يوقف المساعد عرض العقارات على العملاء تلقائياً.\n\n— مقصد`;
}

async function secrets(): Promise<Record<string, string>> {
  const { data } = await db.from("app_secrets").select("key,value");
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}

async function operatorChat(s: Record<string, string>): Promise<string | null> {
  if (s.OPERATOR_TG_CHAT) return s.OPERATOR_TG_CHAT;
  const { data } = await db.from("staff").select("offices(telegram_chat_id)")
    .eq("role", "super_admin").eq("active", true).limit(1).maybeSingle();
  return (data as any)?.offices?.telegram_chat_id ?? null;
}

async function tg(token: string, chat: string, text: string) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const s = await secrets();
  if (!s.WEBHOOK_SECRET || url.searchParams.get("k") !== s.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const dry = url.searchParams.get("dry") === "1";
  const qd = url.searchParams.get("today") ?? "";
  const today = /^\d{4}-\d{2}-\d{2}$/.test(qd) ? qd : riyadhToday();
  const token = s.TELEGRAM_BOT_TOKEN ?? "";
  const canSend = token.includes(":");

  const { data: offices } = await db.from("offices")
    .select("id,name,code,active,telegram_chat_id,notify_telegram,notify_push,fal_status,fal_expires_on,fal_reminded")
    .order("created_at");

  const sent: string[] = [], lines: string[] = [], texts: Record<string, string> = {};
  for (const o of (offices ?? []) as any[]) {
    if (!o.active || o.fal_status !== "verified" || !o.fal_expires_on) continue;
    const days = daysBetween(today, o.fal_expires_on);
    const stage = stageOf(days);
    if (stage === null) continue;
    // كل مرحلة مرة وحدة: ما نعيد تنبيهاً أُرسل في نفس المرحلة أو أقرب منها
    if (o.fal_reminded !== null && o.fal_reminded !== undefined && stage >= o.fal_reminded) continue;
    const text = reminderText(o, days);
    const line = `• ${o.name}: ${days < 0 ? "انتهت" : "تنتهي " + inDays(days)} (${arDate(o.fal_expires_on)})`;
    if (dry) { texts[o.name] = text; lines.push(line); continue; }
    // على قنوات المكتب: تيليجرام و/أو إشعارات الجوال
    const delivered = (await alertOffice(db, s, o, text, "fal")).delivered;
    await db.from("offices").update({ fal_reminded: stage }).eq("id", o.id);
    await db.from("events").insert({ office_id: o.id, level: delivered ? "info" : "warn", kind: "fal_reminder",
      detail: { stage, days, expires_on: o.fal_expires_on, delivered } });
    lines.push(line + (delivered ? "" : " — ما وصل التنبيه للمكتب (لا تيليجرام ولا جوال)، كلّمهم"));
    sent.push(o.name);
  }

  // مكاتب راسلها عملاء والمساعد متوقف لأن رخصتها ما تحققت
  const { data: blocked } = await db.from("events").select("office_id")
    .eq("kind", "fal_blocked").gte("created_at", new Date(Date.now() - 864e5).toISOString());
  const blockedIds = new Set((blocked ?? []).map((e: any) => e.office_id));
  const blockedNames = ((offices ?? []) as any[])
    .filter((o) => blockedIds.has(o.id) && o.fal_status !== "verified").map((o) => o.name);

  let operator: string | null = null;
  if (lines.length || blockedNames.length || dry) {
    operator = [
      `🪪 رخص فال — ${arDate(today)}`,
      ...(lines.length ? ["", dry ? "تنبيهات الانتهاء (تجربة بلا إرسال):" : "تنبيهات الانتهاء المرسلة اليوم:", ...lines] : []),
      ...(blockedNames.length ? ["", "راسلها عملاء والمساعد متوقف لأن رخصتها ما تحققت:",
        ...blockedNames.map((n) => `• ${n}`), "افتح المكتب في التطبيق ← تعديل ← رخصة فال."] : []),
      ...(dry && !lines.length && !blockedNames.length ? ["", "ما فيه شي اليوم."] : []),
    ].join("\n");
    if (!dry && canSend) {
      const chat = await operatorChat(s);
      if (chat) await tg(token, chat, operator);
    }
  }

  return Response.json({ ok: true, today, dry, sent, blocked: blockedNames,
    ...(dry ? { texts, operator } : {}) });
});
