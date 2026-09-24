// مقصد — ربط تيليجرام (v3)
// v3: الربط بضغطة من التطبيق (رابط البوت فيه رمز لمرة وحدة، للمحادثة الخاصة أو للمجموعة)،
//     والربط يشغّل تنبيهات تيليجرام للمكتب تلقائياً
// v2: يقبل صيغ القروبات والمحادثات الخاصة
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function secrets() {
  const { data } = await db.from("app_secrets").select("key,value");
  return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
}

async function reply(token: string, chatId: number | string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch { /* تجاهل */ }
}

const HELP =
  "أهلاً بك في مقصد.\n\n" +
  "لربط تنبيهات مكتبك هنا: افتح تطبيق مقصد ← الإعدادات ← التنبيهات ← «ربط تيليجرام»، " +
  "واضغط الزر. الربط يتم تلقائياً.";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const s = await secrets();
  if (url.searchParams.get("k") !== s.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const token = s.TELEGRAM_BOT_TOKEN;
  let u: any = {};
  try { u = await req.json(); } catch { return Response.json({ ok: true }); }

  const m = u?.message;
  if (!m) return Response.json({ ok: true });

  const chatId = m.chat?.id;
  const chatTitle = m.chat?.title ?? m.chat?.first_name ?? "";
  const text = String(m.text ?? m.caption ?? "").trim();
  if (!chatId || !text) return Response.json({ ok: true });

  // يقبل: "ربط CODE" · "/link CODE" · "/link@Maqsad_saBot CODE" · "/start CODE" · "/start@Maqsad_saBot CODE" (رابط المجموعة)
  const mt = text.match(
    /^(?:\/start|\/link|\/ربط|ربط)(?:@[A-Za-z0-9_]+)?[\s:]+([A-Za-z0-9]{4,32})\s*$/i,
  );

  if (!mt) {
    if (/^(?:\/start|\/help|\/link|ربط)(?:@[A-Za-z0-9_]+)?\s*$/i.test(text)) {
      await reply(token, chatId, HELP);
    }
    return Response.json({ ok: true, ignored: true });
  }

  const code = mt[1].toUpperCase();
  const { data: office } = await db.from("offices")
    .select("id,name,tg_link_code").eq("tg_link_code", code).maybeSingle();

  if (!office) {
    await reply(token, chatId,
      "الرابط انتهى أو استُخدم من قبل.\nمن تطبيق مقصد اضغط «ربط تيليجرام» مرة ثانية.");
    return Response.json({ ok: true, bad_code: true });
  }

  const { error } = await db.from("offices")
    .update({ telegram_chat_id: String(chatId), tg_link_code: null, notify_telegram: true })
    .eq("id", office.id).eq("tg_link_code", code);

  if (error) {
    await reply(token, chatId, "تعذّر الربط، حاول مرة أخرى.");
    return Response.json({ ok: true, error: error.message });
  }

  await db.from("events").insert({
    office_id: office.id, kind: "telegram_linked", level: "info",
    detail: { chat_id: String(chatId), chat: chatTitle },
  });

  await reply(token, chatId,
    `✅ تم الربط بنجاح\n\nالمكتب: ${office.name}\n\n` +
    `من الآن توصلك هنا تنبيهات العملاء الجاهزين، ومن يطلب وسيطاً بشرياً، ` +
    `ومن يراسلك بعد تسليم محادثته — فوراً.`);

  return Response.json({ ok: true, linked: office.id });
});
