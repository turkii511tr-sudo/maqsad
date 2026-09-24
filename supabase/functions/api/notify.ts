// تنبيهات المكتب: تيليجرام و/أو إشعارات الجوال (Web Push) حسب اختيار المكتب
// إشعارات الجوال بلا أي حزمة خارجية: تشفير RFC 8291 (aes128gcm) وتوقيع VAPID (RFC 8292) بمكتبة التشفير المدمجة
// ملف مشترك: يُنسخ مع كل دالة تحتاجه (wa-webhook · api · fal-check) باسم notify.ts

const te = new TextEncoder();
const b64u = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const cat = (...a: Uint8Array[]) => {
  const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of a) { o.set(x, i); i += x.length; }
  return o;
};
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as BufferSource));
}

// مفاتيح VAPID: تُولَّد مرة وحدة وتُحفظ في مفاتيح المنصة (لا تظهر لأحد، والعام منها فقط يُرسل للتطبيق)
export async function vapidGenerate() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk: any = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return JSON.stringify({ pub: b64u(raw), jwk: { kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y } });
}
export function vapidPublic(s: Record<string, string>): string | null {
  try { return JSON.parse(s.VAPID_KEYS ?? "").pub ?? null; } catch { return null; }
}

async function vapidHeader(endpoint: string, keys: any, subject: string) {
  const aud = new URL(endpoint).origin;
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", { ...keys.jwk, ext: true }, { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(head + "." + body)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.pub}`;
}

// fixed: للاختبار فقط (متجه الاختبار في RFC 8291) — في التشغيل مفتاح مؤقت وملح عشوائي لكل رسالة
export async function encryptPush(p256dh: string, auth: string, payload: Uint8Array,
  fixed?: { priv: CryptoKey; pub: Uint8Array; salt: Uint8Array }) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const eph: any = fixed ? { privateKey: fixed.priv }
    : await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = fixed ? fixed.pub : new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as any, eph.privateKey, 256));
  const ikm = await hmac(await hmac(secret, shared), cat(te.encode("WebPush: info\0"), ua, asPub, new Uint8Array([1])));
  const salt = fixed ? fixed.salt : crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, cat(payload, new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, ct);
}

// خدمات الإشعارات المعروفة فقط — الخادم ما يرسل لأي عنوان يكتبه المستخدم
export const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

export type PushMsg = { title: string; body: string; url?: string; tag?: string };

// نص تنبيه تيليجرام ← إشعار قصير: السطر الأول عنوان، والباقي بلا الروابط
export function pushFromText(text: string, tag?: string): PushMsg {
  const lines = String(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const title = (lines.shift() ?? "مقصد").slice(0, 80);
  const body = lines.filter((l) => !/^🔗|^— مقصد$/.test(l)).join("\n").slice(0, 240);
  return { title, body, url: "/", tag };
}

async function sendOne(db: any, sub: any, keys: any, subject: string, msg: PushMsg) {
  try {
    const r = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(sub.endpoint, keys, subject),
        "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
        TTL: "86400", Urgency: "high",
      },
      body: await encryptPush(sub.p256dh, sub.auth, te.encode(JSON.stringify(msg))),
    });
    // الجهاز ألغى الاشتراك أو انتهى: نحذفه
    if (r.status === 404 || r.status === 410) { await db.from("push_subs").delete().eq("id", sub.id); return "gone"; }
    if (r.ok) { await db.from("push_subs").update({ fails: 0, last_ok_at: new Date().toISOString() }).eq("id", sub.id); return "ok"; }
    const fails = (sub.fails ?? 0) + 1;
    if (fails >= 10) await db.from("push_subs").delete().eq("id", sub.id);
    else await db.from("push_subs").update({ fails }).eq("id", sub.id);
    return "fail";
  } catch { return "fail"; }
}

// يرسل لكل أجهزة المكتب (أو لجهاز واحد عند التجربة)
export async function pushOffice(db: any, s: Record<string, string>, officeId: string, msg: PushMsg,
  only?: { endpoint?: string; staff_id?: string }) {
  let keys: any = null;
  try { keys = JSON.parse(s.VAPID_KEYS ?? ""); } catch { /* ما فيه مفاتيح بعد */ }
  if (!keys?.pub || !keys?.jwk) return { sent: 0, gone: 0, failed: 0, devices: 0 };
  let q = db.from("push_subs").select("id,endpoint,p256dh,auth,fails").eq("office_id", officeId);
  if (only?.endpoint) q = q.eq("endpoint", only.endpoint);
  if (only?.staff_id) q = q.eq("staff_id", only.staff_id);
  const { data } = await q;
  const subs = (data ?? []) as any[];
  const res = await Promise.all(subs.map((x) => sendOne(db, x, keys, s.VAPID_SUBJECT || "https://maqsadapp.com", msg)));
  return {
    sent: res.filter((x) => x === "ok").length, gone: res.filter((x) => x === "gone").length,
    failed: res.filter((x) => x === "fail").length, devices: subs.length,
  };
}

export async function telegramSend(token: string | undefined, chat: string | null | undefined, text: string) {
  if (!token || !token.includes(":") || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    return r.ok;
  } catch { return false; }
}

// تنبيه المكتب على القنوات اللي اختارها: تيليجرام (إذا مربوط) و/أو الجوال (إذا فيه أجهزة مفعّلة)
export async function alertOffice(db: any, s: Record<string, string>, office: any, text: string, tag?: string) {
  const wantTg = office?.notify_telegram !== false, wantPush = office?.notify_push !== false;
  const [telegram, push] = await Promise.all([
    wantTg ? telegramSend(s.TELEGRAM_BOT_TOKEN, office?.telegram_chat_id, text) : Promise.resolve(false),
    wantPush && office?.id ? pushOffice(db, s, office.id, pushFromText(text, tag))
      : Promise.resolve({ sent: 0, gone: 0, failed: 0, devices: 0 }),
  ]);
  return { telegram, push: push.sent, delivered: telegram || push.sent > 0 };
}
