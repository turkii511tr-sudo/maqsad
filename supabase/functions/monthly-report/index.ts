// مقصد — ملخص الشهر (v1)
// أول كل شهر: كل مكتب يوصله ملخص أداء الشهر الماضي في مجموعة تيليجرام حقته، ومشغّل المنصة يوصله
// ملخص لكل المكاتب مع التكلفة التقديرية. أرقام مجمّعة فقط — بلا رقم جوال أو اسم أي عميل.
// المعاملات: k (المفتاح السري) · dry=1 (يرجع النصوص بلا إرسال) · month=YYYY-MM · office=<id> · force=1
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

async function secrets(): Promise<Record<string, string>> {
  const { data } = await db.from("app_secrets").select("key,value");
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}

// الشهر الماضي بتوقيت الرياض (UTC+3 ثابت)
export function previousMonth(nowMs = Date.now()) {
  const d = new Date(nowMs + 3 * 3600e3);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
export function monthRange(month: string) {
  const [y, mo] = month.split("-").map(Number);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  return { month, next, from: `${month}-01T00:00:00+03:00`, to: `${next}-01T00:00:00+03:00`,
           label: `${MONTHS[mo - 1]} ${y}` };
}

// المدة بالعربي: ١ ثانية، ثانيتين، ٣–١٠ ثوانٍ، ١١+ ثانية … وكذا الدقائق والساعات والأيام
const plural = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
export function dur(secs: number | null | undefined) {
  if (secs == null || !Number.isFinite(secs) || secs < 0) return null;
  if (secs < 60) return plural(Math.min(59, Math.max(1, Math.round(secs))), "ثانية", "ثانيتين", "ثوانٍ", "ثانية");
  if (secs < 3600) return plural(Math.min(59, Math.round(secs / 60)), "دقيقة", "دقيقتين", "دقائق", "دقيقة");
  if (secs < 86400) return plural(Math.min(23, Math.round(secs / 3600)), "ساعة", "ساعتين", "ساعات", "ساعة");
  return plural(Math.round(secs / 86400), "يوم", "يومين", "أيام", "يوماً");
}

const HANDOFF_LABEL: Record<string, string> = {
  qualified: "مؤهل", human: "طلب موظف", owner_offer: "مالك يعرض عقاره",
  quota: "طالت محادثته", ai_error: "تعذّر فهمه آلياً",
};
const OUTCOME_LABEL: [string, string][] = [
  ["contacted", "تواصلتوا"], ["viewing", "رتّبتوا معاينة"], ["deal", "تمت الصفقة"],
  ["no_answer", "ما ردوا"], ["lost", "مو جادين"],
];
const n0 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export function officeReport(office: { name: string }, label: string, st: any) {
  const L: string[] = [`📊 ملخص ${label} — ${office.name}`, ""];
  L.push(`👥 عملاء جدد: ${n0(st.new_customers)}`);
  if (n0(st.offhours_new)) L.push(`🌙 منهم بدأوا بين ١٠ الليل و٩ الصبح: ${n0(st.offhours_new)}`);
  const fr = dur(st.first_reply_median_s);
  if (fr) L.push(`⚡ المساعد يرد عادةً خلال ${fr}`);

  const h = st.handoffs ?? {};
  const parts = Object.keys(HANDOFF_LABEL).filter((k) => n0(h[k])).map((k) => `${HANDOFF_LABEL[k]} ${n0(h[k])}`);
  const handed = Object.keys(HANDOFF_LABEL).reduce((a, k) => a + n0(h[k]), 0);
  if (handed) L.push(`🎯 سلّمهم المساعد لكم: ${handed} (${parts.join(" · ")})`);

  L.push("");
  const o = st.outcomes ?? {};
  const recorded = OUTCOME_LABEL.filter(([k]) => n0(o[k]));
  if (recorded.length) {
    L.push("📞 نتائج الاتصال المسجّلة:");
    L.push(recorded.map(([k, t]) => `${t}: ${n0(o[k])}`).join(" · "));
    const cb = dur(st.callback_median_s);
    if (cb) L.push(`⏱️ تتصلون عادةً خلال ${cb} من التسليم`);
  } else if (handed) {
    L.push("📞 ما سُجّلت نتائج اتصال هذا الشهر. سجّلوها من بطاقة العميل في التطبيق عشان تعرفون كم صفقة جابها مقصد.");
  }
  if (n0(st.waiting_now)) L.push(`⏳ ينتظرون اتصالكم الحين: ${n0(st.waiting_now)}`);

  const top = (st.top_districts ?? []).filter((x: any) => x?.d);
  if (top.length) L.push(`📍 أكثر الأحياء طلباً: ${top.map((x: any) => `${x.d} (${n0(x.n)})`).join(" · ")}`);
  if (n0(st.opted_out)) L.push(`🔕 أوقفوا الرسائل الآلية: ${n0(st.opted_out)}`);
  if (n0(st.deleted)) L.push(`🗑️ طلبوا حذف بياناتهم: ${n0(st.deleted)}`);
  L.push("", "— مقصد");
  return L.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function costOf(row: any, s: Record<string, string>) {
  const p = (k: string, d: number) => { const v = Number(s[k]); return Number.isFinite(v) && v >= 0 ? v : d; };
  const uncached = Math.max(0, n0(row.ai_in) - n0(row.ai_cached));
  const ai = (uncached * p("PRICE_AI_IN", 0.15) + n0(row.ai_cached) * p("PRICE_AI_CACHED", 0.075) +
              n0(row.ai_out) * p("PRICE_AI_OUT", 0.6)) / 1e6;
  return ai + n0(row.otp_platform) * p("PRICE_OTP", 0.018);
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
  const force = url.searchParams.get("force") === "1";
  const qm = url.searchParams.get("month") ?? "";
  const r = monthRange(/^\d{4}-(0[1-9]|1[0-2])$/.test(qm) ? qm : previousMonth());
  const only = url.searchParams.get("office");
  const token = s.TELEGRAM_BOT_TOKEN ?? "";
  const canSend = token.includes(":");

  let q = db.from("offices").select("id,name,code,active,telegram_chat_id").order("created_at");
  if (only) q = q.eq("id", only);
  const { data: offices } = await q;

  const sent: string[] = [], skipped: { name: string; why: string }[] = [], texts: Record<string, string> = {};
  for (const o of (offices ?? []) as any[]) {
    if (!o.active) { skipped.push({ name: o.name, why: "موقوف" }); continue; }
    const { data: st, error } = await db.rpc("office_month_stats", { p_office: o.id, p_from: r.from, p_to: r.to });
    if (error || !st) { skipped.push({ name: o.name, why: "تعذّر الحساب" }); continue; }
    if (!n0(st.new_customers) && !n0(st.inbound_msgs)) { skipped.push({ name: o.name, why: "بلا نشاط" }); continue; }
    const text = officeReport(o, r.label, st);
    if (dry) { texts[o.name] = text; continue; }
    if (!o.telegram_chat_id) { skipped.push({ name: o.name, why: "بلا مجموعة تيليجرام" }); continue; }
    if (!force) {
      const { count } = await db.from("events").select("id", { count: "exact", head: true })
        .eq("office_id", o.id).eq("kind", "monthly_report_sent").contains("detail", { month: r.month });
      if ((count ?? 0) > 0) { skipped.push({ name: o.name, why: "أُرسل من قبل" }); continue; }
    }
    if (!canSend || !(await tg(token, o.telegram_chat_id, text))) {
      await db.from("events").insert({ office_id: o.id, level: "warn", kind: "monthly_report_failed", detail: { month: r.month } });
      skipped.push({ name: o.name, why: "تعذّر الإرسال" }); continue;
    }
    await db.from("events").insert({ office_id: o.id, level: "info", kind: "monthly_report_sent", detail: { month: r.month } });
    sent.push(o.name);
  }

  // ملخص المشغّل: كل المكاتب + التكلفة التقديرية
  let operator: string | null = null;
  if (!only) {
    const { data: usage } = await db.rpc("platform_usage", { p_from: `${r.month}-01`, p_to: `${r.next}-01` });
    const rows = ((usage as any[]) ?? []).filter((x) => x.active || n0(x.new_customers));
    const usd = (v: number) => `${v.toFixed(2)}$`;
    let tot = 0, cust = 0, qual = 0, deals = 0;
    const lines = rows.map((x) => {
      const c = costOf(x, s); tot += c; cust += n0(x.new_customers); qual += n0(x.qualified); deals += n0(x.deals);
      return `• ${x.name}: ${n0(x.new_customers)} عميل · ${n0(x.qualified)} مؤهل · ${n0(x.deals)} صفقة · ${usd(c)}`;
    });
    operator = [`📊 ملخص المنصة — ${r.label}`, "", ...(lines.length ? lines : ["لا توجد مكاتب نشطة."]), "",
      `الإجمالي: ${cust} عميل · ${qual} مؤهل · ${deals} صفقة`,
      `التكلفة التقديرية: ${usd(tot)} (${(tot * 3.75).toFixed(2)} ريال)` + (cust ? ` · ${usd(tot / cust)} للعميل` : ""),
      "", `وصل الملخص لـ ${sent.length} مكتب` +
        (skipped.length ? `\nلم يُرسل: ${skipped.map((x) => `${x.name} (${x.why})`).join("، ")}` : ""),
    ].join("\n");
    if (!dry && canSend) {
      const chat = await operatorChat(s);
      if (chat) await tg(token, chat, operator);
    }
  }

  return Response.json({ ok: true, month: r.month, dry, sent, skipped, ...(dry ? { texts, operator } : {}) });
});
