// مقصد — فحص سلامة صفحة الواجهة قبل أن يفتحها أحد
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const { data: sec } = await db.from("app_secrets").select("value").eq("key", "WEBHOOK_SECRET").single();
  if (url.searchParams.get("k") !== sec?.value) return new Response("forbidden", { status: 403 });

  const { data } = await db.from("app_pages").select("html").eq("slug", "app").single();
  const html = data?.html ?? "";
  const out: Record<string, unknown> = { bytes: html.length };

  // 1) وسوم السكربت متوازنة؟
  const opens = (html.match(/<script\b[^>]*>/g) ?? []).length;
  const closes = (html.match(/<\/script>/g) ?? []).length;
  out.script_tags = { opens, closes, balanced: opens === closes };

  // 2) هل كل كتلة جافاسكربت سليمة نحوياً؟
  const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const errors: string[] = [];
  blocks.forEach((code, i) => {
    if (!code.trim()) return;
    try { new Function(code); }
    catch (e) { errors.push(`block ${i}: ${String(e)}`); }
  });
  out.js_blocks = blocks.length;
  out.js_errors = errors;
  out.js_ok = errors.length === 0;

  // 3) العناصر التي يعتمد عليها الكود موجودة؟
  const needed = [
    "offsave", "offnew", "offtitle", "offlist", "offmsg", "ocount",
    "stsave", "stafflist", "stmsg", "st-name", "st-phone", "st-role",
    "bkstatus", "bknow", "tab-offices", "s-offices", "cfgcard",
    "o-name", "o-code", "o-lic", "o-inst", "o-tok", "o-num", "o-tg", "o-quota",
    "g-openai", "g-tg", "g-tgchat", "g-inst", "g-watok", "g-wanum", "g-myph", "g-quota",
    "savecfg", "testwa", "cfgmsg", "status", "leads", "login", "shell",
  ];
  out.missing_ids = needed.filter((id) => !html.includes(`id="${id}"`));

  // 4) تعريفات مكررة لنفس الدالة؟
  const fns = [...html.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
  const dup: string[] = [];
  const seen = new Set<string>();
  for (const f of fns) { if (seen.has(f)) dup.push(f); else seen.add(f); }
  out.duplicate_functions = [...new Set(dup)];

  out.verdict = out.js_ok && (out.missing_ids as string[]).length === 0 &&
    (out.script_tags as any).balanced ? "PASS" : "FAIL";

  return Response.json(out);
});
