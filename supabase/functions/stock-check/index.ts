// مقصد — تأكيد توفّر العقارات (v1)
// يومياً ٩:٣٠ الصبح بتوقيت الرياض:
//  • العقار المتاح اللي ما أُكّد له توفّر ٧ أيام: تذكير لصاحب المكتب «هل ما زالت هذه العقارات متاحة؟»
//    على قنوات المكتب (تيليجرام و/أو إشعارات الجوال) — والرد من التطبيق: «ما زال متاح» / «تم تأجيره» / «تم بيعه».
//  • التذكير الثاني والأخير بعد ٦ أيام من الأول، ويقول إن العرض يوقف غداً.
//  • عند ١٤ يوماً بلا تأكيد (وبعد وصول تذكير فعلي للمكتب): العقار يصير «غير مؤكَّد» فيختفي من البوت،
//    ويوصل المكتب إشعار، ويرجعه بضغطة «ما زال متاح». المكتب اللي ما وصله أي تذكير ما يُوقف له شي.
// المعاملات: k (المفتاح السري) · dry=1 (يرجع النصوص بلا إرسال ولا حفظ) · now=ISO (للاختبار)
import { createClient } from "jsr:@supabase/supabase-js@2";
import { alertOffice } from "./notify.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

export const REMIND_AFTER_DAYS = 7;   // أول تذكير
export const REMIND_EVERY_DAYS = 6;   // الفاصل بين التذكير الأول والأخير
export const PAUSE_AFTER_DAYS = 14;   // الإيقاف
const MAX_LISTED = 8;

export const ageDays = (iso: string, nowMs: number) => Math.floor((nowMs - Date.parse(iso)) / 864e5);

const lineOf = (p: any, final: boolean) =>
  `${final ? "⚠️" : "•"} ${p.title} — ${p.district}${p.city ? "، " + p.city : ""}`;

function listBlock(ps: any[], finalIds: Set<string>) {
  const shown = ps.slice(0, MAX_LISTED).map((p) => lineOf(p, finalIds.has(p.id)));
  if (ps.length > MAX_LISTED) shown.push(`… و${ps.length - MAX_LISTED} عقارات أخرى`);
  return shown.join("\n");
}

export function reminderText(office: { name: string }, ps: any[], finalIds: Set<string>) {
  const L = [`🏠 هل ما زالت هذه العقارات متاحة؟ — ${office.name}`, "", listBlock(ps, finalIds), "",
    "افتح مقصد ← المخزون ← «بانتظار التأكيد»، واضغط على كل عقار: «ما زال متاح» أو «تم تأجيره» أو «تم بيعه».",
    "حتى لا يعرض البوت للعملاء عقاراً انتهى."];
  if (finalIds.size) L.push("", `⚠️ العقارات اللي عليها علامة تحذير هذا تذكيرها الأخير — لو ما أُكّدت يوقف البوت عرضها بكرة.`);
  L.push("", "— مقصد");
  return L.join("\n");
}

export function pausedText(office: { name: string }, ps: any[]) {
  return [`⏸️ أوقف البوت عرض ${ps.length === 1 ? "عقار لأنه ما أُكّد" : ps.length + " عقارات لأنها ما أُكّدت"} منذ أسبوعين — ${office.name}`, "",
    listBlock(ps, new Set()), "",
    "ما انحذفت: افتح مقصد ← المخزون ← «بانتظار التأكيد»، واضغط «ما زال متاح» ويرجع العرض فوراً.", "", "— مقصد"].join("\n");
}

async function secrets(): Promise<Record<string, string>> {
  const { data } = await db.from("app_secrets").select("key,value");
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const s = await secrets();
  if (!s.WEBHOOK_SECRET || url.searchParams.get("k") !== s.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const dry = url.searchParams.get("dry") === "1";
  const qn = Date.parse(url.searchParams.get("now") ?? "");
  const nowMs = Number.isFinite(qn) ? qn : Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const cutoff = new Date(nowMs - REMIND_AFTER_DAYS * 864e5).toISOString();

  const { data: stale } = await db.from("properties")
    .select("id,office_id,title,district,city,confirmed_at,remind_count,remind_sent_at")
    .eq("state", "available").lte("confirmed_at", cutoff).order("confirmed_at");
  const byOffice = new Map<string, any[]>();
  for (const p of (stale ?? []) as any[]) {
    if (!byOffice.has(p.office_id)) byOffice.set(p.office_id, []);
    byOffice.get(p.office_id)!.push(p);
  }
  if (!byOffice.size) return Response.json({ ok: true, dry, reminded: [], paused: [] });

  const { data: offices } = await db.from("offices")
    .select("id,name,active,telegram_chat_id,notify_telegram,notify_push").in("id", [...byOffice.keys()]);

  const reminded: string[] = [], unreachable: string[] = [], paused: string[] = [], texts: Record<string, string> = {};
  for (const o of (offices ?? []) as any[]) {
    if (!o.active) continue;
    const mine = byOffice.get(o.id) ?? [];

    // ١) الإيقاف: ١٤ يوماً بلا تأكيد + وصله تذكير فعلي مرة على الأقل
    const toPause = mine.filter((p) => ageDays(p.confirmed_at, nowMs) >= PAUSE_AFTER_DAYS && (p.remind_count ?? 0) >= 1);
    const pauseIds = new Set(toPause.map((p) => p.id));

    // ٢) التذكير: ٧ أيام بلا تأكيد، وما وصله تذكير خلال آخر ٦ أيام
    const toRemind = mine.filter((p) => !pauseIds.has(p.id) && (!p.remind_sent_at ||
      ageDays(p.remind_sent_at, nowMs) >= REMIND_EVERY_DAYS));

    if (toPause.length) {
      const text = pausedText(o, toPause);
      if (dry) texts[o.name + " (إيقاف)"] = text;
      else {
        await db.from("properties").update({ state: "unconfirmed" }).in("id", [...pauseIds]).eq("office_id", o.id);
        const delivered = (await alertOffice(db, s, o, text, "stock")).delivered;
        await db.from("events").insert({ office_id: o.id, level: delivered ? "info" : "warn", kind: "stock_paused",
          detail: { n: toPause.length, ids: [...pauseIds].slice(0, 50), delivered } });
      }
      paused.push(o.name);
    }

    if (toRemind.length) {
      // «الأخير» = أُرسل له تذكير قبل، والتذكير القادم يسبق الإيقاف بيوم
      const finalIds = new Set(toRemind.filter((p) => (p.remind_count ?? 0) >= 1).map((p) => p.id));
      const text = reminderText(o, toRemind, finalIds);
      if (dry) texts[o.name] = text;
      else {
        const delivered = (await alertOffice(db, s, o, text, "stock")).delivered;
        // العدّاد يزيد فقط إذا وصل التذكير فعلاً: مكتب بلا قناة تنبيه ما يُوقف له شي
        if (delivered) {
          for (const p of toRemind) {
            await db.from("properties").update({ remind_count: (p.remind_count ?? 0) + 1, remind_sent_at: nowIso })
              .eq("id", p.id).eq("office_id", o.id);
          }
        }
        await db.from("events").insert({ office_id: o.id, level: delivered ? "info" : "warn", kind: "stock_reminder",
          detail: { n: toRemind.length, final: finalIds.size, delivered } });
        if (!delivered) { unreachable.push(o.name); continue; }
      }
      reminded.push(o.name);
    }
  }
  return Response.json({ ok: true, dry, reminded, unreachable, paused, ...(dry ? { texts } : {}) });
});
