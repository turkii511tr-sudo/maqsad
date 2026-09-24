// مقصد — يسلّم HTML الواجهة من قاعدة البيانات (مصدر الحقيقة الوحيد)
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-store",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const { data } = await db.from("app_pages").select("html").eq("slug", "app").single();
  const html = data?.html ?? "<h1>not found</h1>";

  const h: Record<string, string> = { ...cors, "Content-Type": "text/html; charset=utf-8" };
  if (url.searchParams.get("dl") === "1") {
    h["Content-Disposition"] = 'attachment; filename="index.html"';
  }
  return new Response(html, { headers: h });
});
