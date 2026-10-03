// أداة اختبار دوال مقصد محلياً: قاعدة بيانات وهمية في الذاكرة + fetch وهمي
// تحوّل ملف الدالة من TypeScript وتستبدل استيراد supabase بالنسخة الوهمية
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createHmac, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
// typescript من المشروع أو من التثبيت العام (npm i -g typescript)
const ts = (() => { try { return require("typescript"); } catch { return require(execSync("npm root -g").toString().trim() + "/typescript"); } })();

export function makeDb(seed) {
  const T = structuredClone(seed);
  for (const k of ["events", "messages", "privacy_requests", "customers", "signup_requests"]) T[k] ??= [];
  let seq = 1;
  const rpcs = {};

  class Q {
    constructor(table) { this.t = table; this.f = []; this.op = "select"; this.opts = {}; this.payload = null; this.one = null; }
    select(cols, opts) { if (this.op === "select") this.op = "select"; this.opts = opts ?? {}; this.cols = cols; return this; }
    insert(p) { this.op = "insert"; this.payload = p; return this; }
    update(p) { this.op = "update"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    upsert(p) { this.op = "upsert"; this.payload = p; return this; }
    eq(c, v) { this.f.push((r) => r[c] === v); return this; }
    neq(c, v) { this.f.push((r) => r[c] !== v); return this; }
    is(c, v) { this.f.push((r) => (r[c] ?? null) === v); return this; }
    gte(c, v) { this.f.push((r) => String(r[c]) >= String(v)); return this; }
    lte(c, v) { this.f.push((r) => String(r[c]) <= String(v)); return this; }
    in(c, vs) { this.f.push((r) => vs.includes(r[c])); return this; }
    // or("a.ilike.%x%,b.ilike.%y%") كما في PostgREST (ilike فقط)
    or(expr) {
      const parts = expr.split(",").map((p) => { const [c, op, ...v] = p.split("."); return { c, op, v: v.join(".") }; });
      this.f.push((r) => parts.some(({ c, op, v }) => op === "ilike" &&
        String(r[c] ?? "").toLowerCase().includes(v.replace(/^%|%$/g, "").toLowerCase())));
      return this;
    }
    contains(c, obj) {
      // مصفوفة: العمود يحتوي كل العناصر (مثل recent_ids @> '{id}') · كائن: مفاتيح JSON متطابقة
      this.f.push((r) => Array.isArray(obj)
        ? obj.every((x) => (r[c] ?? []).includes(x))
        : Object.entries(obj).every(([k, v]) => r[c]?.[k] === v));
      return this;
    }
    order() { return this; } limit() { return this; }
    range(a, b) { this.rng = [a, b]; return this; }
    maybeSingle() { this.one = "maybe"; return this; }
    single() { this.one = "single"; return this; }
    rows() { return (T[this.t] ??= []).filter((r) => this.f.every((fn) => fn(r))); }
    exec() {
      const tbl = (T[this.t] ??= []);
      if (this.op === "insert") {
        const arr = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({
          id: r.id ?? (["customers", "login_requests", "auth_challenges", "passkeys"].includes(this.t) ? randomUUID() : seq++),
          created_at: new Date().toISOString(), ...structuredClone(r),
        }));
        tbl.push(...arr);
        return this.pick(arr);
      }
      if (this.op === "update") {
        const hit = this.rows(); hit.forEach((r) => Object.assign(r, structuredClone(this.payload)));
        return this.pick(hit);
      }
      if (this.op === "delete") {
        const hit = new Set(this.rows());
        T[this.t] = tbl.filter((r) => !hit.has(r));
        if (this.t === "customers") {
          const ids = new Set([...hit].map((r) => r.id));
          T.messages = T.messages.filter((m) => !ids.has(m.customer_id)); // ON DELETE CASCADE
        }
        return { data: null, error: null };
      }
      if (this.op === "upsert") {
        const p = this.payload;
        const k = p.key !== undefined ? "key" : p.phone !== undefined ? "phone" : "id";
        const ex = tbl.find((r) => r[k] === p[k]);
        if (ex) Object.assign(ex, p); else tbl.push({ ...p });
        return { data: null, error: null };
      }
      let hit = this.rows();
      if (this.opts.head) return { data: null, count: hit.length, error: null };
      if (this.rng) hit = hit.slice(this.rng[0], this.rng[1] + 1);
      // تضمين المكتب عند select("*,offices(*)") كما يفعل PostgREST
      if (/offices\(/.test(this.cols ?? "")) hit = hit.map((r) => ({ ...r, offices: (T.offices ?? []).find((o) => o.id === r.office_id) ?? null }));
      return this.pick(hit);
    }
    pick(arr) {
      if (this.one === "single") return arr.length ? { data: arr[0], error: null } : { data: null, error: { message: "no rows" } };
      if (this.one === "maybe") return { data: arr[0] ?? null, error: null };
      return { data: arr, error: null };
    }
    then(res, rej) { try { res(this.exec()); } catch (e) { rej(e); } }
  }

  rpcs.ingest_message = (a) => {
    let c = T.customers.find((r) => r.office_id === a.p_office && r.wa_id === a.p_wa_id);
    if (!c) {
      c = { id: randomUUID(), office_id: a.p_office, wa_id: a.p_wa_id, phone: a.p_phone, name: a.p_name || null,
            status: "inquiry", mode: "auto", msg_count: 0, buffer: "", recent_ids: [], locked_until: null,
            opted_out: false, disclosed_at: null, created_at: new Date().toISOString() };
      T.customers.push(c);
    }
    if (c.recent_ids.includes(a.p_msg_id)) return [{ customer_id: c.id, owns_lock: false, is_duplicate: true }];
    c.buffer = c.buffer ? c.buffer + "\n" + a.p_body : a.p_body;
    c.recent_ids = [a.p_msg_id, ...c.recent_ids].slice(0, 20);
    c.last_message_at = new Date().toISOString();
    const free = !c.locked_until || c.locked_until < Date.now();
    if (free) c.locked_until = Date.now() + a.p_lock_sec * 1000;
    return [{ customer_id: c.id, owns_lock: free, is_duplicate: false }];
  };
  rpcs.finish_processing = (a) => { const c = T.customers.find((r) => r.id === a.p_customer); if (c) { c.buffer = ""; c.locked_until = null; } return null; };
  // نفس منطق finish_turn في القاعدة: يمسح ما عولج فقط ويعيد ما وصل أثناء المعالجة
  rpcs.finish_turn = (a) => {
    const c = T.customers.find((r) => r.id === a.p_customer);
    if (!c) return "";
    const b = c.buffer ?? "", k = a.p_consumed ?? "";
    if (k && b !== k && !b.startsWith(k + "\n")) { (T.__finishTurn ??= []).push({ consumed: k, left: "", foreign: true }); return ""; }
    const left = !k ? b : b === k ? "" : b.slice(k.length + 1);
    c.buffer = left;
    c.locked_until = left ? Date.now() + 90_000 : null;
    (T.__finishTurn ??= []).push({ consumed: k, left });
    return left;
  };
  rpcs.office_summary = () => ({});
  rpcs.demand_gap = () => (T.__gapCalls ??= []).push("v1") && (T.__gap ?? []);
  rpcs.demand_gap_v2 = () => {
    (T.__gapCalls ??= []).push("v2");
    if (T.__noGap2) throw Object.assign(new Error("function demand_gap_v2 does not exist"), { v2: true });
    return T.__gap2 ?? [];
  };
  rpcs.match_properties = (a) => { (T.__matchCalls ??= []).push({ fn: "v1", ...a }); return T.__matches ?? []; };
  rpcs.match_properties_v2 = (a) => {
    (T.__matchCalls ??= []).push({ fn: "v2", ...a });
    if (T.__noV2) throw Object.assign(new Error("function match_properties_v2 does not exist"), { v2: true });
    return T.__matches ?? [];
  };
  rpcs.match_customers = (a) => { (T.__custCalls ??= []).push(a); return (T.__custMatches ?? []).filter((c) => c.office_id === undefined || c.office_id === a.p_office); };
  // عدّادات الاستهلاك والإحصاءات: نسجّل النداء ونعيد ما يحدده الاختبار
  rpcs.bump_usage = (a) => { (T.__usage ??= []).push(a); return null; };
  rpcs.office_month_stats = (a) => { (T.__statsCalls ??= []).push(a); return T.__month_stats_fn ? T.__month_stats_fn(a) : (T.__month_stats ?? { new_customers: 0 }); };
  rpcs.platform_usage = (a) => { (T.__usageCalls ??= []).push(a); return T.__platform_usage ?? []; };

  return {
    T,
    client: {
      from: (t) => new Q(t),
      rpc: async (name, args) => {
        try { return { data: rpcs[name](args), error: null }; }
        catch (e) { if (e.v2) return { data: null, error: { message: e.message } }; throw e; }
      },
    },
  };
}

// opts.stt: رد تحويل الصوت (كائن، أو دالة ترجع كائناً أو Response) · opts.media: دالة (url, init) ترجع Response لروابط الملفات
export function makeFetch(ai, opts = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body)
      : init.body instanceof FormData
      ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : { name: v.name, size: v.size, type: v.type }]))
      : typeof init.body === "string" ? JSON.parse(init.body) : (init.body ?? null); // إشعار الجوال: بايتات مشفّرة
    calls.push({ url: u, body, headers: init.headers ?? {} });
    if (u.includes("api.openai.com/v1/audio/transcriptions")) {
      const r = typeof opts.stt === "function" ? opts.stt(body) : (opts.stt ?? { text: "ابي شقة للإيجار في النرجس" });
      return r instanceof Response ? r : new Response(JSON.stringify(r), { status: 200 });
    }
    if (opts.media) {
      const r = opts.media(u, init);
      if (r) return r;
    }
    if (u.includes("api.openai.com")) {
      const content = JSON.stringify(typeof ai === "function" ? ai(body) : ai);
      return new Response(JSON.stringify({ choices: [{ message: { content } }],
        usage: { prompt_tokens: 1200, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 1024 } } }), { status: 200 });
    }
    if (u.includes("api.ultramsg.com")) return new Response(JSON.stringify({ sent: "true" }), { status: 200 });
    if (u.includes("fcm.googleapis.com/fcm/send/gone")) return new Response("", { status: 410 });
    if (u.includes("fcm.googleapis.com")) return new Response("", { status: 201 });
    return new Response("{}", { status: 200 });
  };
  f.calls = calls;
  return f;
}

// يحمّل الدالة كوحدة ESM بعد استبدال supabase ويعيد معالج الطلبات
export async function loadFunction(tsPath, db, fetchImpl) {
  const src = readFileSync(tsPath, "utf8")
    .replace(/import \{ createClient \} from "jsr:@supabase\/supabase-js@2";/, "const createClient = () => globalThis.__db;")
    // الملف المشترك notify.ts يُدمج مكان استيراده (في النشر يُرفع بجانب الدالة)
    .replace(/import \{[^}]*\} from "\.\/notify\.ts";/, () =>
      readFileSync(new URL("../functions/_shared/notify.ts", import.meta.url), "utf8").replace(/^export /gm, ""));
  const out = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const dir = join(tmpdir(), "maqsad-fn-test");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `fn-${randomUUID()}.mjs`);
  writeFileSync(file, out);
  let handler = null;
  const pending = [];
  globalThis.__db = db;
  globalThis.fetch = fetchImpl;
  globalThis.Deno = { env: { get: () => "http://stub" }, serve: (fn) => { handler = fn; } };
  globalThis.EdgeRuntime = { waitUntil: (p) => pending.push(p) };
  const mod = await import(pathToFileURL(file).href);
  return { handler, pending, mod };
}

export const sign = (secret, body) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
