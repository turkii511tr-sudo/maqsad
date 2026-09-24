// تشفير إشعارات الجوال: مطابقة متجه الاختبار الرسمي في RFC 8291 + فك تشفير كامل + توقيع VAPID
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const ts = require("/home/claude/.npm-global/lib/node_modules/typescript");
const src = readFileSync(new URL("../functions/_shared/notify.ts", import.meta.url), "utf8");
mkdirSync("/tmp/claude-fn-test", { recursive: true });
const f = "/tmp/claude-fn-test/notify-" + Date.now() + ".mjs";
writeFileSync(f, ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const N = await import(pathToFileURL(f).href);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ " + m); } };
const u = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const subtle = globalThis.crypto.subtle;
const privFrom = async (d, pub, usage, alg) => subtle.importKey("jwk",
  { kty: "EC", crv: "P-256", d, x: b64u(u(pub).subarray(1, 33)), y: b64u(u(pub).subarray(33, 65)), ext: true }, alg, false, usage);

// RFC 8291 — Appendix A
const V = {
  plain: "When I grow up, I want to be a watermelon",
  asPub: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPriv: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPub: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPriv: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};
console.log("إشعارات الجوال");
const asPriv = await privFrom(V.asPriv, V.asPub, ["deriveBits"], { name: "ECDH", namedCurve: "P-256" });
const out = await N.encryptPush(V.uaPub, V.auth, new TextEncoder().encode(V.plain), { priv: asPriv, pub: new Uint8Array(u(V.asPub)), salt: new Uint8Array(u(V.salt)) });
ok(b64u(out) === V.body, "يطابق متجه الاختبار الرسمي RFC 8291 حرفاً بحرف");

// فك تشفير رسالة عشوائية بمفتاح الجهاز (مثل ما يسوي المتصفح)
async function decrypt(body, uaPriv, uaPub, auth) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const pk = await privFrom(uaPriv, uaPub, ["deriveBits"], { name: "ECDH", namedCurve: "P-256" });
  const asKey = await subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: asKey }, pk, 256));
  const H = async (k, d) => new Uint8Array(await subtle.sign("HMAC", await subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), d));
  const cat = (...a) => Buffer.concat(a.map((x) => Buffer.from(x)));
  const ikm = await H(await H(u(auth), shared), cat(Buffer.from("WebPush: info\0"), u(uaPub), asPub, [1]));
  const prk = await H(salt, ikm);
  const cek = (await H(prk, cat(Buffer.from("Content-Encoding: aes128gcm\0"), [1]))).slice(0, 16);
  const nonce = (await H(prk, cat(Buffer.from("Content-Encoding: nonce\0"), [1]))).slice(0, 12);
  const k = await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const pt = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, ct));
  return new TextDecoder().decode(pt.subarray(0, pt.lastIndexOf(2)));
}
const msg = JSON.stringify({ title: "🎯 عميل مؤهل — جاهز للإغلاق", body: "فيلا في النرجس" });
const rnd = await N.encryptPush(V.uaPub, V.auth, new TextEncoder().encode(msg));
ok(await decrypt(Buffer.from(rnd), V.uaPriv, V.uaPub, V.auth) === msg, "الجهاز يفك رسالة عشوائية بالعربي");
const rnd2 = await N.encryptPush(V.uaPub, V.auth, new TextEncoder().encode(msg));
ok(b64u(rnd) !== b64u(rnd2), "كل رسالة بمفتاح مؤقت وملح جديد");

// VAPID: توقيع JWT صالح بالمفتاح العام
const keys = JSON.parse(await N.vapidGenerate());
ok(u(keys.pub).length === 65 && u(keys.pub)[0] === 4, "المفتاح العام ٦٥ بايت (صيغة المتصفح)");
ok(N.vapidPublic({ VAPID_KEYS: JSON.stringify(keys) }) === keys.pub && N.vapidPublic({}) === null, "قراءة المفتاح العام فقط");
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response("", { status: 201 }); };
const upd = [];
const db = { from: () => ({ select() { return this; }, eq() { return this; }, update(p) { upd.push(p); return this; }, delete() { return this; },
  then(r) { r({ data: [{ id: 1, endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: V.uaPub, auth: V.auth, fails: 0 }], error: null }); } }) };
const r = await N.pushOffice(db, { VAPID_KEYS: JSON.stringify(keys) }, "o1", { title: "t", body: "b" });
ok(r.sent === 1 && calls.length === 1, "أرسل للجهاز");
const h = calls[0].init.headers;
ok(h["Content-Encoding"] === "aes128gcm" && h.TTL === "86400" && h.Urgency === "high", "رؤوس الإشعار صحيحة");
const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h.Authorization);
ok(!!m && m[4] === keys.pub, "رأس VAPID فيه المفتاح العام");
const claims = JSON.parse(Buffer.from(u(m[2])).toString());
ok(claims.aud === "https://fcm.googleapis.com" && claims.exp > Date.now() / 1000 && claims.sub === "https://maqsadapp.com", "الجمهور والانتهاء والجهة صحيحة");
const pubKey = await subtle.importKey("raw", u(keys.pub), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
ok(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, u(m[3]), new TextEncoder().encode(m[1] + "." + m[2])), "توقيع VAPID يتحقق بالمفتاح العام");
ok(await N.pushOffice(db, {}, "o1", { title: "t", body: "b" }).then((x) => x.sent === 0), "بلا مفاتيح: لا إرسال");

// عنوان الجهاز المسموح
ok(N.PUSH_HOST.test("https://fcm.googleapis.com/fcm/send/x") && N.PUSH_HOST.test("https://web.push.apple.com/QJ") &&
   N.PUSH_HOST.test("https://updates.push.services.mozilla.com/wpush/v2/x"), "خدمات الإشعارات الحقيقية مقبولة");
ok(!N.PUSH_HOST.test("https://evil.com/fcm.googleapis.com/") && !N.PUSH_HOST.test("http://fcm.googleapis.com/x") &&
   !N.PUSH_HOST.test("https://fcm.googleapis.com.evil.com/x"), "أي عنوان آخر مرفوض");

// نص تيليجرام ← إشعار
const p = N.pushFromText("🎯 عميل مؤهل — جاهز للإغلاق\n\n👤 أحمد\n📱 9665\n\n🔗 https://wa.me/9665", "lead");
ok(p.title === "🎯 عميل مؤهل — جاهز للإغلاق" && p.body === "👤 أحمد\n📱 9665" && p.tag === "lead", "العنوان من السطر الأول وبلا روابط");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
