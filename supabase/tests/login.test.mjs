// اختبار الدخول v15: رسالة «دخول مقصد» من جوال الموظف (رقم المكتب أو رقم المنصة) ← جلسة، ثم البصمة (WebAuthn)
// بتوقيعات حقيقية (ES256)، والرموز الاحتياطية. بلا لمس القاعدة الحية.
import { makeDb, makeFetch, loadFunction, sign } from "./harness.mjs";
import { createHash, webcrypto } from "node:crypto";
import assert from "node:assert/strict";

const API = new URL("../functions/api/index.ts", import.meta.url).pathname;
const WA = new URL("../functions/wa-webhook/index.ts", import.meta.url).pathname;
const H = (t) => createHash("sha256").update(t + "|wk").digest("hex");
const future = new Date(Date.now() + 864e5).toISOString();
const ORIGIN = "https://maqsad-sa.netlify.app", RP = "maqsad-sa.netlify.app";

function seed(mut) {
  const d = {
    app_secrets: [{ key: "WEBHOOK_SECRET", value: "wk" }, { key: "TELEGRAM_BOT_TOKEN", value: "1:abc" },
      { key: "META_APP_SECRET", value: "appsecret" }, { key: "OPERATOR_TG_CHAT", value: "777" }],
    offices: [
      { id: "o1", name: "مكتب الأفق", code: "UFQ", wa_provider: "ultramsg", wa_instance: "instance190700", wa_instance_key: "190700",
        wa_token: "t", wa_number: "966511111111", active: true, debounce_seconds: 0, msg_quota: 15, fal_status: "verified", fal_expires_on: "2099-01-01" },
      { id: "o2", name: "مكتب الواحة", code: "WAH", wa_provider: "cloud", wa_instance: "109876543210", wa_instance_key: "109876543210",
        wa_token: "EAAG", wa_number: "966522222222", active: true, debounce_seconds: 0, msg_quota: 15, fal_status: "verified", fal_expires_on: "2099-01-01" },
    ],
    staff: [
      { id: "s1", office_id: "o1", name: "صاحب", phone: "966500000001", role: "owner", active: true },
      { id: "s2", office_id: "o1", name: "وسيط", phone: "966500000002", role: "agent", active: true },
      { id: "s4", office_id: "o2", name: "وسيط الواحة", phone: "966500000004", role: "agent", active: true },
      { id: "sa", office_id: "o1", name: "المشغّل", phone: "966500000009", role: "super_admin", active: true },
    ],
    sessions: ["s1", "s2", "sa"].map((id) => ({ token_hash: H("tok-" + id), staff_id: id, kind: "session", expires_at: future })),
    otps: [], login_audit: [], events: [], login_requests: [], passkeys: [], auth_challenges: [], push_subs: [],
  };
  if (mut) mut(d);
  return d;
}

const results = [];
async function test(name, fn) { try { await fn(); results.push(["✓", name]); } catch (e) { results.push(["✗", name, e.stack?.split("\n").slice(0, 3).join(" | ")]); } }

async function boot(mut) {
  const db = makeDb(seed(mut)); const f = makeFetch({});
  // الدالتان على نفس القاعدة؛ دالة الاستقبال تُحمّل أخيراً لأن الخلفية (waitUntil) تُسجّل لآخر دالة محمّلة
  const api = await loadFunction(API, db.client, f);
  const wa = await loadFunction(WA, db.client, f);
  const call = (body, tok, origin = ORIGIN) => api.handler(new Request("https://x/api", { method: "POST",
    headers: { "content-type": "application/json", ...(tok ? { authorization: "Bearer " + tok } : {}), ...(origin ? { origin } : {}) },
    body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
  const ultra = (from, body) => wa.handler(new Request("https://x/wa-webhook?k=wk", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instanceId: "instance190700", data: { from: from + "@c.us", body, id: crypto.randomUUID(), type: "chat", pushname: "x" } }) }));
  const meta = async (from, body, pnid) => {
    const payload = { object: "whatsapp_business_account", entry: [{ id: "W", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { phone_number_id: pnid },
      messages: [{ from, id: "wamid." + crypto.randomUUID(), timestamp: "1", type: "text", text: { body } }] } }] }] };
    const raw = JSON.stringify(payload);
    const r = await wa.handler(new Request("https://x/wa-webhook", { method: "POST",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign("appsecret", raw) }, body: raw }));
    await Promise.all(wa.pending);
    return r;
  };
  return { T: db.T, f, call, ultra, meta };
}
const toLatin = (s) => s.replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x)));
const sentText = (c) => c.body?.body ?? c.body?.text?.body ?? c.body?.text ?? "";

// ---------- رسالة واتساب من الموظف ----------
await test("رسالة الدخول على رقم المكتب: تتأكد، ويرد بتأكيد، وما تدخل مسار العملاء، والتطبيق ياخذ جلسته مرة وحدة", async () => {
  const { T, f, call, ultra } = await boot();
  const s = await call({ action: "login_start", phone: "0500000002", device: "آيفون" });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  let p = await call({ action: "login_poll", id: s.body.id, poll: s.body.poll });
  assert.equal(p.body.state, "waiting");
  await ultra("966500000002", s.body.text);
  assert.ok(T.login_requests[0].verified_at, "not verified");
  assert.equal((T.customers ?? []).length, 0, "login message became a customer");
  const reply = f.calls.filter((c) => c.url.includes("ultramsg")).map(sentText).join("\n");
  assert.match(reply, /تم تسجيل دخولك إلى مقصد من آيفون/); assert.match(reply, /إلغاء الدخول/);
  p = await call({ action: "login_poll", id: s.body.id, poll: s.body.poll });
  assert.equal(p.status, 200); assert.ok(p.body.token);
  assert.equal(p.body.staff.role, "agent");
  const me = await call({ action: "me" }, p.body.token);
  assert.equal(me.status, 200);
  const again = await call({ action: "login_poll", id: s.body.id, poll: s.body.poll });
  assert.equal(again.body.state, "used"); assert.equal(again.body.token, undefined);
  assert.equal((await call({ action: "login_poll", id: s.body.id, poll: "wrong" })).status, 404);
  assert.ok(T.login_audit.some((a) => a.reason === "login_ok_whatsapp"));
});

await test("الرسالة من رقم ثاني، أو برقم غلط، أو بعد انتهاء المدة: ما تدخّل أحد", async () => {
  const { T, f, call, ultra } = await boot();
  const s = await call({ action: "login_start", phone: "0500000002" });
  const n = toLatin(s.body.text.split(" ").at(-1));
  await ultra("966500000001", s.body.text);                      // جوال شخص ثاني يرسل نفس النص
  await ultra("966500000002", "دخول مقصد " + (n === "1234" ? "4321" : "1234"));
  assert.equal(T.login_requests[0].verified_at ?? null, null);
  assert.match(f.calls.map(sentText).join("\n"), /ما تطابق طلب دخول قائم/);
  T.login_requests[0].expires_at = new Date(Date.now() - 1000).toISOString();
  await ultra("966500000002", s.body.text);
  assert.equal(T.login_requests[0].verified_at ?? null, null);
  assert.equal((await call({ action: "login_poll", id: s.body.id, poll: s.body.poll })).body.state, "expired");
});

await test("رقم غير مسجّل يرسل «دخول مقصد»: رد تعريفي فقط", async () => {
  const { f, ultra, T } = await boot();
  const r = await ultra("966533333333", "دخول مقصد ١٢٣٤");
  assert.equal((await r.json()).login, "unregistered");
  assert.match(f.calls.map(sentText).join("\n"), /غير مسجّل في مقصد/);
  assert.equal((T.customers ?? []).length, 0);
});

await test("موظف مكتب ثاني ما يدخل عن طريق رقم مكتب غير مكتبه", async () => {
  const { T, call, ultra } = await boot();
  const s = await call({ action: "login_start", phone: "0500000004" });   // وسيط الواحة ← رقم الواحة
  assert.equal(s.body.wa, "966522222222");
  await ultra("966500000004", s.body.text);                               // لكنه أرسلها لرقم الأفق
  assert.equal(T.login_requests[0].verified_at ?? null, null);
});

await test("رقم المنصة الرسمي: الدخول من ميتا، والرد من رقم المنصة، وأي رسالة ثانية لها رد تعريفي مرة وحدة", async () => {
  const { T, f, call, meta } = await boot((d) => d.app_secrets.push(
    { key: "PLATFORM_WA_PHONE_ID", value: "555" }, { key: "PLATFORM_WA_TOKEN", value: "EAP" }, { key: "PLATFORM_WA_NUMBER", value: "966599999999" }));
  const s = await call({ action: "login_start", phone: "0500000009" });
  assert.equal(s.body.wa, "966599999999");
  await meta("966500000009", s.body.text, "555");
  assert.ok(T.login_requests[0].verified_at);
  const g = f.calls.filter((c) => c.url.includes("graph.facebook.com"));
  assert.ok(g[0].url.includes("/555/messages")); assert.equal(g[0].headers.Authorization, "Bearer EAP");
  const p = await call({ action: "login_poll", id: s.body.id, poll: s.body.poll });
  assert.ok(p.body.token);
  await meta("966544444444", "السلام عليكم", "555");
  await meta("966544444444", "ابي شقة", "555");
  const info = f.calls.filter((c) => /لتسجيل الدخول إلى التطبيق فقط/.test(sentText(c)));
  assert.equal(info.length, 1);
  assert.equal((T.customers ?? []).length, 0, "platform number must not create customers");
});

await test("رسالة الدخول على رقم المنصة لطلب بدأ من رقم المكتب ما تمشي", async () => {
  const { T, call, meta, ultra } = await boot((d) => d.app_secrets.push({ key: "PLATFORM_WA_PHONE_ID", value: "555" }, { key: "PLATFORM_WA_TOKEN", value: "EAP" }));
  const s = await call({ action: "login_start", phone: "0500000002" });  // رقم المنصة ناقص ← قناة المكتب
  assert.equal(s.body.wa, "966511111111");
  await meta("966500000002", s.body.text, "555");
  assert.equal(T.login_requests[0].verified_at ?? null, null);
  await ultra("966500000002", s.body.text);
  assert.ok(T.login_requests[0].verified_at);
});

await test("«إلغاء الدخول» يخرج كل أجهزته ويحذف البصمات الجديدة فقط", async () => {
  const { T, ultra } = await boot((d) => {
    d.passkeys.push({ id: "old", staff_id: "s2", cred_id: "A", created_at: new Date(Date.now() - 5 * 864e5).toISOString() },
                    { id: "new", staff_id: "s2", cred_id: "B", created_at: new Date().toISOString() });
  });
  await ultra("966500000002", "إلغاء الدخول");
  assert.equal(T.sessions.filter((x) => x.staff_id === "s2").length, 0);
  assert.equal(T.sessions.filter((x) => x.staff_id === "s1").length, 1);
  assert.deepEqual(T.passkeys.map((x) => x.id), ["old"]);
});

// ---------- البصمة: مفتاح ES256 حقيقي ----------
function cborEnc(v) {
  const head = (major, n) => n < 24 ? [major << 5 | n] : n < 256 ? [major << 5 | 24, n] : [major << 5 | 25, n >> 8, n & 255];
  if (typeof v === "number") return Buffer.from(v >= 0 ? head(0, v) : head(1, -1 - v));
  if (typeof v === "string") { const b = Buffer.from(v); return Buffer.concat([Buffer.from(head(3, b.length)), b]); }
  if (v instanceof Uint8Array) return Buffer.concat([Buffer.from(head(2, v.length)), Buffer.from(v)]);
  const entries = v instanceof Map ? [...v] : Object.entries(v);
  return Buffer.concat([Buffer.from(head(5, entries.length)), ...entries.flatMap(([k, x]) => [cborEnc(k), cborEnc(x)])]);
}
const b64u = (b) => Buffer.from(b).toString("base64url");
const rpHash = () => createHash("sha256").update(RP).digest();
function rawToDer(raw) {
  const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.subarray(i); if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]); return Buffer.concat([Buffer.from([2, b.length]), b]); };
  const r = int(Buffer.from(raw.subarray(0, 32))), s = int(Buffer.from(raw.subarray(32)));
  return Buffer.concat([Buffer.from([0x30, r.length + s.length]), r, s]);
}
async function device() {
  const kp = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", kp.publicKey);
  const credId = webcrypto.getRandomValues(new Uint8Array(16));
  let count = 0;
  return {
    credId: b64u(credId),
    create(opts, { flags = 0x45, origin = ORIGIN } = {}) {
      const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]);
      const cnt = Buffer.alloc(4); cnt.writeUInt32BE(count);
      const auth = Buffer.concat([rpHash(), Buffer.from([flags]), cnt, Buffer.alloc(16), Buffer.from([0, credId.length]), credId, cborEnc(cose)]);
      return { id: b64u(credId), clientDataJSON: b64u(Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: opts.challenge, origin }))),
        attestationObject: b64u(cborEnc({ fmt: "none", attStmt: {}, authData: new Uint8Array(auth) })), transports: ["internal"], label: "آيفون" };
    },
    async get(opts, userId, { flags = 0x05, origin = ORIGIN, bump = 1, userHandle } = {}) {
      count += bump;
      const cnt = Buffer.alloc(4); cnt.writeUInt32BE(count);
      const auth = Buffer.concat([rpHash(), Buffer.from([flags]), cnt]);
      const cd = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: opts.challenge, origin }));
      const data = Buffer.concat([auth, createHash("sha256").update(cd).digest()]);
      const sig = new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, data));
      return { cid: opts.cid, id: b64u(credId), clientDataJSON: b64u(cd), authenticatorData: b64u(auth),
        signature: b64u(rawToDer(sig)), userHandle: b64u(Buffer.from(userHandle ?? userId)) };
    },
  };
}

await test("البصمة: تفعيل ثم دخول بلا رقم، والعدّاد يتحدث", async () => {
  const { T, call } = await boot();
  const dev = await device();
  const o = await call({ action: "pk_reg_options" }, "tok-s2");
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.equal(o.body.rp.id, RP);
  assert.equal(Buffer.from(o.body.user.id, "base64url").toString(), "s2");
  assert.equal(o.body.user.name, "0500000002");
  const r = await call({ action: "pk_reg_verify", cid: o.body.cid, ...dev.create(o.body) }, "tok-s2");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(T.passkeys.length, 1); assert.equal(T.passkeys[0].alg, -7); assert.equal(T.passkeys[0].label, "آيفون");
  const lo = await call({ action: "pk_login_options" });
  assert.equal(lo.body.rpId, RP);
  const lv = await call({ action: "pk_login_verify", ...(await dev.get(lo.body, "s2")) });
  assert.equal(lv.status, 200, JSON.stringify(lv.body)); assert.ok(lv.body.token);
  assert.equal(lv.body.staff.name, "وسيط");
  assert.equal(T.passkeys[0].sign_count, 1); assert.ok(T.passkeys[0].last_used_at);
  const list = await call({ action: "pk_list" }, "tok-s2");
  assert.equal(list.body.passkeys.length, 1);
  assert.equal((await call({ action: "pk_list" }, "tok-s1")).body.passkeys.length, 0);
  // التحدي يُستخدم مرة وحدة
  const replay = await call({ action: "pk_login_verify", ...(await dev.get(lo.body, "s2")) });
  assert.equal(replay.status, 401);
});

await test("البصمة: التوقيع الغلط، والنطاق الغريب، وبدون تحقق المستخدم، والعدّاد الراجع — كلها مرفوضة", async () => {
  const { T, call } = await boot();
  const dev = await device();
  const o = await call({ action: "pk_reg_options" }, "tok-s2");
  assert.equal((await call({ action: "pk_reg_verify", cid: o.body.cid, ...dev.create(o.body, { flags: 0x41 }) }, "tok-s2")).status, 400, "no UV");
  const o2 = await call({ action: "pk_reg_options" }, "tok-s2");
  assert.equal((await call({ action: "pk_reg_verify", cid: o2.body.cid, ...dev.create(o2.body, { origin: "https://evil.example" }) }, "tok-s2")).status, 400, "origin");
  assert.equal((await call({ action: "pk_reg_options" }, "tok-s2", "https://evil.example")).status, 400);
  const o3 = await call({ action: "pk_reg_options" }, "tok-s2");
  assert.equal((await call({ action: "pk_reg_verify", cid: o3.body.cid, ...dev.create(o3.body) }, "tok-s2")).status, 200);

  let lo = await call({ action: "pk_login_options" });
  const a = await dev.get(lo.body, "s2");
  const bad = Buffer.from(a.signature, "base64url"); bad[bad.length - 1] ^= 1;
  assert.equal((await call({ action: "pk_login_verify", ...a, signature: b64u(bad) })).status, 401, "bad sig");
  lo = await call({ action: "pk_login_options" });
  assert.equal((await call({ action: "pk_login_verify", ...(await dev.get(lo.body, "s2", { flags: 0x01 })) })).status, 401, "no UV");
  lo = await call({ action: "pk_login_options" });
  assert.equal((await call({ action: "pk_login_verify", ...(await dev.get(lo.body, "s2", { userHandle: "s1" })) })).status, 401, "user handle");
  lo = await call({ action: "pk_login_options" });
  assert.equal((await call({ action: "pk_login_verify", ...(await dev.get(lo.body, "s2")) })).status, 200);
  lo = await call({ action: "pk_login_options" });
  assert.equal((await call({ action: "pk_login_verify", ...(await dev.get(lo.body, "s2", { bump: -2 })) })).status, 401, "counter");
  assert.ok(T.events.some((e) => e.kind === "passkey_counter"));
  // موظف موقوف ما يدخل بالبصمة
  T.staff.find((x) => x.id === "s2").active = false;
  lo = await call({ action: "pk_login_options" });
  assert.equal((await call({ action: "pk_login_verify", ...(await dev.get(lo.body, "s2", { bump: 5 })) })).status, 403);
});

await test("البصمة: حذف جهاز من أجهزتي (جهازه فقط)", async () => {
  const { T, call } = await boot((d) => d.passkeys.push({ id: "p1", staff_id: "s2", cred_id: "X" }, { id: "p2", staff_id: "s1", cred_id: "Y" }));
  await call({ action: "pk_delete", id: "p2" }, "tok-s2");
  assert.equal(T.passkeys.length, 2);
  await call({ action: "pk_delete", id: "p1" }, "tok-s2");
  assert.deepEqual(T.passkeys.map((x) => x.id), ["p2"]);
});

// ---------- الاحتياط ----------
await test("رمز المدير: للمدير فقط، يُكتب بأرقام عربية، ولمرة وحدة", async () => {
  const { f, call } = await boot();
  assert.equal((await call({ action: "staff_code", id: "s2" }, "tok-s1")).status, 403);
  const c = await call({ action: "staff_code", id: "s2" }, "tok-sa");
  assert.equal(c.status, 200); assert.equal(f.calls.length, 0);
  const ar = c.body.code.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
  const v = await call({ action: "verify_otp", phone: "٠٥٠٠٠٠٠٠٠٢", code: ar });
  assert.equal(v.status, 200, JSON.stringify(v.body)); assert.ok(v.body.token);
  assert.equal((await call({ action: "verify_otp", phone: "0500000002", code: c.body.code })).status, 400);
});

await test("رمز تيليجرام: يوصل للمدير فقط، والرد واحد لأي رقم", async () => {
  const { f, call } = await boot();
  const x = await call({ action: "admin_tg_code", phone: "0500000002" });
  assert.equal(x.status, 200); assert.equal(f.calls.length, 0);
  const a = await call({ action: "admin_tg_code", phone: "0500000009" });
  assert.deepEqual(a.body, x.body);
  const tg = f.calls.filter((c) => c.url.includes("api.telegram.org"));
  assert.equal(tg.length, 1); assert.equal(tg[0].body.chat_id, "777");
  const code = /(\d{6})/.exec(tg[0].body.text)[1];
  assert.equal((await call({ action: "verify_otp", phone: "0500000009", code })).status, 200);
});

await test("الخروج: من هذا الجهاز فقط، أو من كل الأجهزة", async () => {
  const { T, call } = await boot((d) => d.sessions.push({ token_hash: H("tok-s2b"), staff_id: "s2", kind: "session", expires_at: future }));
  await call({ action: "logout" }, "tok-s2");
  assert.equal((await call({ action: "me" }, "tok-s2b")).status, 200);
  assert.equal(T.sessions.filter((x) => x.staff_id === "s2").length, 1);
  await call({ action: "logout", all: true }, "tok-s2b");
  assert.equal(T.sessions.filter((x) => x.staff_id === "s2").length, 0);
});

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "✗").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
