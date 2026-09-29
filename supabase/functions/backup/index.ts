// مقصد — النسخة الاحتياطية اليومية (v3.3، مع تحقق ذاتي من قابلية الاستعادة)
// v3.3: سجل التحقق من رخص فال (fal_checks) ضمن النسخة — صورها تبقى في مخزنها الخاص
// v3.2: النسخ المأخوذة قبل عزل المفاتيح (قبل ٢٢ سبتمبر ٢٠٢٦) تُحذف — كانت تحمل مفاتيح الربط ·
//       عدّاد الاستهلاك اليومي (usage_daily) ضمن النسخة
// v3: التنبيه يذهب لمشغّل المنصة فقط (لا لأي مكتب)، وجداول الموقع ضمن النسخة،
//     ومفاتيح الربط (app_secrets وتوكنات واتساب المكاتب) خارج النسخة حتى لا تُحفظ بيانات دخول في ملفات التخزين
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// أعمدة بيانات دخول لا تدخل النسخة أبداً (تُعاد تعبئتها من الإعدادات عند الاستعادة)
const STRIP: Record<string, string[]> = { offices: ["wa_token", "tg_link_code"] };

const TABLES = [
  "offices", "staff", "customers", "messages", "properties",
  "events", "app_pages", "login_audit",
  "signup_requests", "contact_messages", "privacy_requests", "usage_daily", "fal_checks",
];

async function secrets() {
  const { data } = await db.from("app_secrets").select("key,value");
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}

async function operatorChat(s: Record<string, string>): Promise<string | null> {
  if (s.OPERATOR_TG_CHAT) return s.OPERATOR_TG_CHAT;
  const { data } = await db.from("staff").select("offices(telegram_chat_id)")
    .eq("role", "super_admin").eq("active", true).limit(1).maybeSingle();
  return (data as any)?.offices?.telegram_chat_id ?? null;
}

async function notify(text: string) {
  try {
    const s = await secrets();
    const tok = s.TELEGRAM_BOT_TOKEN;
    if (!tok || !tok.includes(":")) return;
    const chat = await operatorChat(s);
    if (!chat) return;
    await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
    });
  } catch { /* التنبيه لا يُفشل النسخة */ }
}

async function dumpTable(t: string) {
  const rows: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(t).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`${t}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    if (rows.length > 200000) break;
  }
  return rows;
}

// أول يوم صارت فيه النسخ بلا مفاتيح (v3.1). أي نسخة قبله تُحذف مهما كان تاريخها
const CLEAN_SINCE = "2026-09-22";

async function prune() {
  const { data } = await db.storage.from("backups").list("daily", { limit: 400 });
  if (!data) return 0;
  const keep = new Set<string>();
  const names = data.map((f: any) => f.name)
    .filter((n: string) => n.endsWith(".json") && n.slice(0, 10) >= CLEAN_SINCE).sort().reverse();
  const withKeys = data.map((f: any) => f.name)
    .filter((n: string) => n.endsWith(".json") && n.slice(0, 10) < CLEAN_SINCE);
  names.slice(0, 30).forEach((n: string) => keep.add(n));
  names.filter((n: string) => /-01\.json$/.test(n)).slice(0, 12)
    .forEach((n: string) => keep.add(n));
  const drop = [...names.filter((n: string) => !keep.has(n)), ...withKeys].map((n: string) => `daily/${n}`);
  if (drop.length) await db.storage.from("backups").remove(drop);
  return drop.length;
}

// النسخة غير المختبرة ليست نسخة: ننزّلها ونتحقق منها فعلاً
async function verify(path: string, counts: Record<string, number>) {
  const { data, error } = await db.storage.from("backups").download(path);
  if (error || !data) throw new Error(`التحقق: تعذّر تنزيل النسخة — ${error?.message}`);
  const parsed = JSON.parse(await data.text());
  if (parsed.maqsad_backup !== 1) throw new Error("التحقق: ملف غير صالح");
  for (const t of TABLES) {
    const got = Array.isArray(parsed.data?.[t]) ? parsed.data[t].length : -1;
    if (got !== counts[t]) {
      throw new Error(`التحقق: جدول ${t} متوقع ${counts[t]} ووجد ${got}`);
    }
  }
  // عيّنة حقيقية: أول مكتب لابد أن يحمل معرّفاً واسماً
  const o = parsed.data.offices?.[0];
  if (counts.offices > 0 && (!o?.id || !o?.name)) throw new Error("التحقق: بيانات المكاتب ناقصة");
  return true;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const s = await secrets();
  if (url.searchParams.get("k") !== s.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const { data: run } = await db.from("backup_runs")
    .insert({ started_at: new Date().toISOString() }).select("id").single();
  const runId = run!.id;

  try {
    const dump: Record<string, any[]> = {};
    const counts: Record<string, number> = {};
    for (const t of TABLES) {
      const rows = await dumpTable(t);
      dump[t] = STRIP[t]
        ? rows.map((r) => { const o = { ...r }; for (const k of STRIP[t]) delete o[k]; return o; })
        : rows;
      counts[t] = dump[t].length;
    }

    const payload = JSON.stringify({
      maqsad_backup: 1,
      taken_at: new Date().toISOString(),
      project: "dindcejhsaxqwdkxtkcy",
      counts,
      data: dump,
    });
    const bytes = new TextEncoder().encode(payload);

    const day = new Date().toISOString().slice(0, 10);
    const path = `daily/${day}.json`;
    const up = await db.storage.from("backups").upload(path, bytes, {
      contentType: "application/json", upsert: true,
    });
    if (up.error) throw new Error(`الرفع: ${up.error.message}`);

    await verify(path, counts);
    const pruned = await prune();

    await db.from("backup_runs").update({
      finished_at: new Date().toISOString(),
      ok: true, path, bytes: bytes.length, row_counts: counts,
    }).eq("id", runId);

    const kb = (bytes.length / 1024).toFixed(0);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    await notify(
      `✅ نسخة احتياطية ناجحة ومُتحقّق منها — ${day}\n` +
      `الحجم: ${kb} كيلوبايت · السجلات: ${total}\n` +
      `مكاتب ${counts.offices} · عملاء ${counts.customers} · رسائل ${counts.messages} · عقارات ${counts.properties}` +
      (pruned ? `\nنظّفت ${pruned} نسخة قديمة` : ""),
    );

    return Response.json({ ok: true, path, bytes: bytes.length, counts, verified: true, pruned });
  } catch (e) {
    const msg = String(e);
    await db.from("backup_runs").update({
      finished_at: new Date().toISOString(), ok: false, error: msg,
    }).eq("id", runId);
    await notify(`🔴 فشلت النسخة الاحتياطية\n${msg.slice(0, 300)}`);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
