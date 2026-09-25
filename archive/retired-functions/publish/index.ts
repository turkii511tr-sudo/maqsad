// مقصد — ينشر الواجهة كملف ثابت حتى يعرضها المتصفح كصفحة لا كنص
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const { data: sec } = await db.from("app_secrets").select("value")
    .eq("key", "WEBHOOK_SECRET").single();
  if (url.searchParams.get("k") !== sec?.value) {
    return new Response("forbidden", { status: 403 });
  }

  const { data: page } = await db.from("app_pages").select("html")
    .eq("slug", "app").single();
  if (!page?.html) return Response.json({ error: "no page" }, { status: 404 });

  const buckets = await db.storage.listBuckets();
  if (!(buckets.data ?? []).some((b: any) => b.name === "site")) {
    await db.storage.createBucket("site", { public: true });
  }

  const bytes = new TextEncoder().encode(page.html);
  const up = await db.storage.from("site").upload("index.html", bytes, {
    contentType: "text/html; charset=utf-8",
    cacheControl: "60",
    upsert: true,
  });
  if (up.error) return Response.json({ error: up.error.message }, { status: 500 });

  const { data: pub } = db.storage.from("site").getPublicUrl("index.html");
  return Response.json({ ok: true, bytes: bytes.length, url: pub.publicUrl });
});
