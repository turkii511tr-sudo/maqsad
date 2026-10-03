/* ==========================================================================
   مقصد — منطق الواجهة
   ========================================================================== */
(function () {
"use strict";

// التشغيل في فرانكفورت، نفس منطقة قاعدة البيانات
var API = "https://dindcejhsaxqwdkxtkcy.supabase.co/functions/v1/api?forceFunctionRegion=eu-central-1";
var TOKEN_KEY = "maqsad_token";

/* ---------- الحالة ---------- */
var S = {
  token: "", me: null, isSuper: false,
  offices: [], curOffice: null, editOffice: null,
  leads: [], props: [], status: null, team: [],
  leadFilter: "all", leadQuery: "",
  stockFilter: "all", stockQuery: "", stockCity: "",
  signups: [], signupFilter: "new", signupsNew: 0,
  pre: null, booted: false,
  month: {}, monthSel: "cur", usage: {}, usageSel: "cur",
  // لوحة المدير: «platform» = لوحة المنصة، «office» = داخل مكتب
  mode: "office", own: null, pstatus: null, officeFilter: "all", officeQuery: "",
};

/* ---------- أدوات ---------- */
function $(s, root) { return (root || document).querySelector(s); }
function el(tag, cls, html) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function esc(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function money(n) {
  var v = Number(n);
  if (!isFinite(v) || v <= 0) return "—";
  return v.toLocaleString("en-US");
}
function digits(s) { return String(s == null ? "" : s).replace(/\D/g, ""); }

/* ---------- أرقام الجوال: نفس قواعد الخادم ---------- */
function normPhone(v) {
  var d = String(v == null ? "" : v)
    .replace(/[٠-٩]/g, function (x) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(x)); })
    .replace(/[۰-۹]/g, function (x) { return String("۰۱۲۳۴۵۶۷۸۹".indexOf(x)); })
    .replace(/\D/g, "");
  if (d.indexOf("00") === 0) d = d.slice(2);
  if (/^05\d{8}$/.test(d)) d = "966" + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = "966" + d;
  return d.replace(/^0+/, "");
}
function phoneIssue(p) {
  if (!p) return "اكتب رقم الجوال";
  if (/^9665\d{8}$/.test(p)) return null;
  if (p.indexOf("966") === 0) return "رقم جوال سعودي غير صحيح — لازم يبدأ بـ 05 ويتكون من ١٠ أرقام";
  return /^\d{10,15}$/.test(p) ? null : "رقم غير صحيح — اكتبه كاملاً مثل 05XXXXXXXX";
}
// 966501114567 ← «050 111 4567»، وغير السعودي يظهر بمفتاحه الدولي
function fmtPhone(p) {
  p = String(p || "");
  if (/^9665\d{8}$/.test(p)) { var l = "0" + p.slice(3); return l.slice(0, 3) + " " + l.slice(3, 6) + " " + l.slice(6); }
  return p ? "+" + p : "";
}
function waLink(p) { return "https://wa.me/" + encodeURIComponent(p); }

function ago(iso) {
  if (!iso) return "—";
  var ms = Date.now() - new Date(iso).getTime();
  var m = Math.floor(ms / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return "قبل " + m + " دقيقة";
  var h = Math.floor(m / 60);
  if (h < 24) return "قبل " + h + " ساعة";
  var d = Math.floor(h / 24);
  if (d === 1) return "أمس";
  if (d < 30) return "قبل " + d + " يوم";
  return new Date(iso).toLocaleDateString("ar-SA");
}
function daysTo(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr + "T00:00:00");
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}
function svg(paths, extra) {
  return '<svg viewBox="0 0 24 24" ' + (extra || "") + '>' + paths + "</svg>";
}
var ICON = {
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  home: '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5a2 2 0 0 0-1.8-1H7.3a2 2 0 0 0-1.8 1Z"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3M16 6l3 3M19 3l2 2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chev: '<path d="m14 6-6 6 6 6"/>',
  wa: '<path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20.5l1.8-5.2A8.5 8.5 0 1 1 21 11.5Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  tg: '<path d="m21.5 4.5-3.2 15.1c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9-8.2c.4-.4-.1-.6-.6-.2L5.9 13.2 1.1 11.7c-1-.3-1-1 .2-1.5L20.1 3c.9-.3 1.6.2 1.4 1.5Z"/>',
};

/* ---------- نتيجة الاتصال وسبب التسليم وحالة العقار ---------- */
var CALLABLE = ["qualified", "human", "quota", "owner_offer", "ai_error"];
var HANDOFF = {
  qualified: "عميل مؤهل", human: "طلب موظف أو معاينة", quota: "المحادثة ما تقدّمت",
  owner_offer: "مالك يعرض عقاره", ai_error: "تعذّر فهمه آلياً", taken: "استلمتها بنفسك",
};
var OUTCOME_ORDER = ["no_answer", "contacted", "viewing", "deal", "lost"];
var OUTCOME = {               // [الزر في بطاقة العميل، الشارة، لونها]
  no_answer: ["ما رد", "ما رد", "warn"],
  contacted: ["تواصلت معه", "تواصلت", "brand"],
  viewing:   ["رتّبت معاينة", "معاينة", "ok"],
  deal:      ["تمت الصفقة", "صفقة", "ok"],
  lost:      ["مو جاد", "مو جاد", "mute"],
};
var PSTATE = { available: "متاح", reserved: "محجوز", rented: "مؤجّر", sold: "مباع", closed: "مغلق" };

function handoffOf(l) {
  return l.handoff_reason || (l.status === "qualified" && l.mode === "manual" ? "qualified" : null);
}
function outcomeTag(l) {
  var o = OUTCOME[l.outcome];
  return o ? '<span class="tag ' + o[2] + '">' + o[1] + "</span>" : "";
}
// الشهر بتوقيت الرياض: «YYYY-MM»، و-1 للشهر الماضي
function riyadhMonth(delta) {
  var d = new Date(Date.now() + 3 * 3600e3);
  var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1 + (delta || 0);
  while (m < 1) { m += 12; y--; }
  return y + "-" + (m < 10 ? "0" : "") + m;
}
// المدة بالعربي: ثانية، ثانيتين، ٣–١٠ ثوانٍ، ١١+ ثانية … وكذا الدقائق والساعات والأيام
function dur(secs) {
  if (secs == null || !isFinite(secs) || secs < 0) return null;
  var f = function (n, one, two, few, many) {
    return n === 1 ? one : n === 2 ? two : n <= 10 ? n + " " + few : n + " " + many;
  };
  if (secs < 60) return f(Math.min(59, Math.max(1, Math.round(secs))), "ثانية", "ثانيتين", "ثوانٍ", "ثانية");
  if (secs < 3600) return f(Math.min(59, Math.round(secs / 60)), "دقيقة", "دقيقتين", "دقائق", "دقيقة");
  if (secs < 86400) return f(Math.min(23, Math.round(secs / 3600)), "ساعة", "ساعتين", "ساعات", "ساعة");
  return f(Math.round(secs / 86400), "يوم", "يومين", "أيام", "يوماً");
}
function n0(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : 0; }

/* ---------- رخصة فال ---------- */
// الاستعلام العام للهيئة العامة للعقار: بحث برقم رخصة الوسيط، يعرض بيانات الترخيص وحالته
var REGA_QUERY = "https://eservicesredp.rega.gov.sa/auth/queries/Brokerage";
var FAL_STATE = {            // [الشارة، لونها]
  ok: ["فال سارية", "ok"], expired: ["فال منتهية", "danger"],
  pending: ["فال بانتظار التحقق", "warn"], rejected: ["فال غير معتمدة", "danger"],
};
function falOf(o) { return (o && o.fal) || { state: "pending" }; }
function falSoon(f) { return f.state === "ok" && f.days_left != null && f.days_left <= 30; }
function inDaysAr(n) {
  return n === 0 ? "اليوم" : n === 1 ? "بكرة" : n === 2 ? "بعد يومين"
    : n <= 10 ? "بعد " + n + " أيام" : "بعد " + n + " يوماً";
}
function falTag(f) {
  f = f || { state: "pending" };
  if (falSoon(f)) return '<span class="tag warn">فال تنتهي ' + inDaysAr(f.days_left) + "</span>";
  var t = FAL_STATE[f.state] || FAL_STATE.pending;
  return '<span class="tag ' + t[1] + '">' + t[0] + "</span>";
}
// التاريخ ميلادي وهجري (أم القرى): الهيئة قد تعرض أياً منهما
function gDate(d) {
  try {
    return new Date(d + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory",
      { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  } catch (e) { return d; }
}
function hDate(d) {
  try {
    return new Date(d + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-islamic-umalqura",
      { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  } catch (e) { return ""; }
}
function riyadhDay() { return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); }

/* ---------- الاتصال بالخادم ---------- */
var NO_OID = ["verify_otp", "redeem", "ping", "login_start", "login_poll", "admin_tg_code",
              "pk_login_options", "pk_login_verify", "pk_reg_options", "pk_reg_verify", "pk_list", "pk_delete", "staff_code",
              "offices_list", "office_save", "backups_status",
              "signup_list", "signup_update",
              "fal_get", "fal_verify", "fal_reject", "fal_proof",
              "admin_log", "platform_save", "signup_proof", "fal_request_close"];

var PUBLIC_ACTIONS = ["verify_otp", "redeem", "login_start", "login_poll", "pk_login_options", "pk_login_verify", "admin_tg_code"];
function call(body, retried) {
  if (S.curOffice && NO_OID.indexOf(body.action) === -1) body.office_id = S.curOffice;

  // نتيجة نداء الفتح الواحد تُستهلك بدل نداءات إضافية
  if (S.pre) {
    if (body.action === "leads" && S.pre.leads && (!body.filter || body.filter === "all")) {
      var a = { leads: S.pre.leads }; S.pre.leads = null; return Promise.resolve(a);
    }
    if (body.action === "properties" && S.pre.properties) {
      var b = { properties: S.pre.properties }; S.pre.properties = null; return Promise.resolve(b);
    }
    if (body.action === "settings_status" && S.pre.status) {
      var c = S.pre.status; S.pre.status = null; return Promise.resolve(c);
    }
  }

  var headers = { "Content-Type": "application/json" };
  if (S.token) headers.Authorization = "Bearer " + S.token;

  return fetch(API, { method: "POST", headers: headers, body: JSON.stringify(body) })
    .then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        // نداءات الدخول نفسها: 401 = فشل التحقق، مو انتهاء جلسة
        if (r.status === 401 && PUBLIC_ACTIONS.indexOf(body.action) > -1) throw new Error(j.error || "تعذّر الدخول");
        if (r.status === 401) {
          if (!retried) {
            return new Promise(function (res) { setTimeout(res, 700); })
              .then(function () { return call(body, true); });
          }
          logout();
          throw new Error("انتهت الجلسة، سجّل دخولك من جديد");
        }
        if (!r.ok) throw new Error(j.error || "تعذّر تنفيذ الطلب");
        return j;
      });
    });
}

function note(host, text, kind) {
  var n = $(host);
  if (!n) return;
  if (!text) { n.innerHTML = ""; return; }
  n.innerHTML = '<div class="msg ' + kind + '">' +
    svg(kind === "ok" ? ICON.check : ICON.alert) + "<span>" + esc(text) + "</span></div>";
}

function state(icon, title, body, action) {
  return '<div class="state"><div class="ic">' + svg(icon) + "</div>" +
    "<b>" + esc(title) + "</b><p>" + esc(body) + "</p>" + (action || "") + "</div>";
}
function skeleton(n) {
  var h = '<div class="rows">';
  for (var i = 0; i < (n || 4); i++) h += '<div class="skel skel-row"></div>';
  return h + "</div>";
}

/* ==========================================================================
   الدخول
   ========================================================================== */
// ثلاث طرق: البصمة (بلا رقم) · رسالة واتساب يرسلها الموظف بنفسه (مجانية) · رمز لمرة وحدة من فريق مقصد
var PK_KEY = "maqsad_pk", PK_SKIP = "maqsad_pk_skip";
var LG = { id: null, poll: null, timer: null, until: 0, busy: false };

function pkLsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function pkLsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

function pkSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create && window.isSecureContext);
}
function deviceLabel() {
  var u = navigator.userAgent || "";
  return /iPhone/.test(u) ? "آيفون" : /iPad/.test(u) ? "آيباد" : /Android/.test(u) ? "أندرويد"
    : /Macintosh/.test(u) ? "ماك" : /Windows/.test(u) ? "ويندوز" : "جهاز";
}
function b64uToBuf(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  var bin = atob(s), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function bufToB64u(b) {
  var a = new Uint8Array(b), s = "";
  for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function authPanel(id) {
  ["authPhone", "authWait", "authCode", "authPk"].forEach(function (x) { $("#" + x).hidden = x !== id; });
  $("#btnHaveCode").hidden = id !== "authPhone";
}
function paintAuthPhone() {
  var can = pkSupported(), mine = pkLsGet(PK_KEY) === "1";
  $("#btnPk").hidden = !(can && mine);
  $("#pkOr").hidden = !(can && mine);
  $("#btnPkLink").hidden = !(can && !mine);
  $("#btnWa").className = "btn " + (can && mine ? "ghost wa-ghost" : "wa");
}
function stopLoginWait() { clearInterval(LG.timer); LG.timer = null; LG.id = null; LG.poll = null; }

function saveToken(tok) {
  S.token = tok;
  try { localStorage.setItem(TOKEN_KEY, S.token); } catch (e) {}
}
// بعد الدخول برسالة أو رمز: نعرض تفعيل البصمة مرة (إلا إذا أجّلها خلال آخر ٣٠ يوم)
function afterLogin(r, method) {
  saveToken(r.token);
  stopLoginWait();
  var skipped = Number(pkLsGet(PK_SKIP) || 0);
  if (method !== "passkey" && pkSupported() && pkLsGet(PK_KEY) !== "1" && Date.now() - skipped > 30 * 864e5) {
    note("#authMsg", "", ""); authPanel("authPk");
    return Promise.resolve();
  }
  return load();
}

function loginErr(e) {
  var m = e.message;
  return m === "not_registered" ? "هذا الرقم غير مسجّل في مقصد. تأكد من الرقم، أو اطلب من صاحب المكتب يضيفك."
    : m === "no_channel" ? "الدخول بالواتساب مو متاح لحسابك حالياً (واتساب مكتبك غير مربوط). اطلب رمز دخول من فريق مقصد."
    : m;
}

function startWaLogin(btn) {
  if (!$("#ph").value.trim()) { note("#authMsg", "اكتب رقم جوالك أول", "err"); $("#ph").focus(); return; }
  btn.disabled = true; note("#authMsg", "", "");
  call({ action: "login_start", phone: $("#ph").value, device: deviceLabel() })
    .then(function (r) {
      LG.id = r.id; LG.poll = r.poll; LG.until = Date.now() + (r.ttl || 300) * 1000;
      $("#waText").textContent = r.text;
      $("#btnOpenWa").href = "https://wa.me/" + r.wa + "?text=" + encodeURIComponent(r.text);
      $("#waTo").innerHTML = 'ترسلها لرقم مقصد <bdi class="ltr num">' + esc(fmtPhone(r.wa)) + "</bdi> من نفس جوالك اللي كتبت رقمه";
      $("#waitLbl").textContent = "بانتظار رسالتك… ارجع هنا بعد ما ترسلها";
      $("#waitState").className = "wait-state";
      authPanel("authWait");
      clearInterval(LG.timer);
      LG.timer = setInterval(pollLogin, 2000);
    })
    .catch(function (e) { note("#authMsg", loginErr(e), "err"); })
    .then(function () { btn.disabled = false; });
}

function waitEnded(text) {
  stopLoginWait();
  $("#waitLbl").textContent = text;
  $("#waitState").className = "wait-state off";
}
function pollLogin() {
  if (!LG.id || LG.busy) return;
  if (Date.now() > LG.until + 15000) { waitEnded("انتهت المدة (٥ دقائق). ارجع وابدأ من جديد."); return; }
  LG.busy = true;
  call({ action: "login_poll", id: LG.id, poll: LG.poll })
    .then(function (r) {
      if (r.token) return afterLogin(r, "whatsapp");
      if (r.state === "expired") waitEnded("انتهت المدة (٥ دقائق). ارجع وابدأ من جديد.");
      else if (r.state === "used") waitEnded("هذا الطلب استُخدم. ارجع وابدأ من جديد.");
    })
    .catch(function () { /* نعيد المحاولة في الدورة الجاية */ })
    .then(function () { LG.busy = false; });
}

function pkLogin(btn) {
  if (!pkSupported()) return;
  btn.disabled = true; note("#authMsg", "", "");
  call({ action: "pk_login_options" })
    .then(function (o) {
      return navigator.credentials.get({ publicKey: {
        challenge: b64uToBuf(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: "required", allowCredentials: [],
      } }).then(function (c) {
        var r = c.response;
        return call({ action: "pk_login_verify", cid: o.cid, id: bufToB64u(c.rawId),
          clientDataJSON: bufToB64u(r.clientDataJSON), authenticatorData: bufToB64u(r.authenticatorData),
          signature: bufToB64u(r.signature), userHandle: r.userHandle ? bufToB64u(r.userHandle) : null });
      });
    })
    .then(function (r) { pkLsSet(PK_KEY, "1"); return afterLogin(r, "passkey"); })
    .catch(function (e) {
      if (e && e.name === "NotAllowedError") note("#authMsg", "ما تمت البصمة. جرّب مرة ثانية، أو ادخل عن طريق واتساب.", "err");
      else note("#authMsg", (e && e.message) || "تعذّر الدخول بالبصمة", "err");
    })
    .then(function () { btn.disabled = false; });
}

// تفعيل البصمة على هذا الجهاز (بعد الدخول)
function pkEnroll() {
  return call({ action: "pk_reg_options" }).then(function (o) {
    return navigator.credentials.create({ publicKey: {
      challenge: b64uToBuf(o.challenge), rp: o.rp,
      user: { id: b64uToBuf(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", requireResidentKey: true, userVerification: "required" },
      attestation: "none", timeout: o.timeout,
      excludeCredentials: (o.exclude || []).map(function (id) { return { type: "public-key", id: b64uToBuf(id) }; }),
    } }).then(function (c) {
      var r = c.response;
      return call({ action: "pk_reg_verify", cid: o.cid, id: bufToB64u(c.rawId),
        clientDataJSON: bufToB64u(r.clientDataJSON), attestationObject: bufToB64u(r.attestationObject),
        transports: r.getTransports ? r.getTransports() : null, label: deviceLabel() });
    });
  }).then(function () { pkLsSet(PK_KEY, "1"); pkLsSet(PK_SKIP, null); });
}
function pkErr(e) {
  return e && e.name === "InvalidStateError" ? "البصمة مفعّلة على هذا الجهاز من قبل."
    : e && e.name === "NotAllowedError" ? "ما تمت البصمة — جرّب مرة ثانية."
    : (e && e.message) || "تعذّر تفعيل البصمة";
}

// «الدخول بالبصمة» في الإعدادات: أجهزتي، تفعيل هذا الجهاز، والخروج من كل الأجهزة
function renderPk() {
  var hosts = ["#pkBox", "#pkBox2"].map(function (h) { return $(h); }).filter(Boolean);
  if (!hosts.length || !S.token) return;
  call({ action: "pk_list" }).then(function (r) {
    var list = r.passkeys || [];
    var mine = pkLsGet(PK_KEY) === "1";
    var h = '<h4 class="sub">الدخول بالبصمة</h4>' +
      '<p class="hint tight">الأجهزة اللي تقدر تدخل منها ببصمتك بدون رسالة واتساب.</p>' +
      (list.length ? '<div class="pk-list">' + list.map(function (k) {
        return '<div class="pk-row"><div><b>' + esc(k.label || "جهاز") + "</b>" +
          '<span class="s">أُضيف ' + esc(ago(k.created_at)) + (k.last_used_at ? " · آخر دخول " + esc(ago(k.last_used_at)) : "") + "</span></div>" +
          '<button class="btn ghost sm danger" type="button" data-pkdel="' + esc(k.id) + '">حذف</button></div>';
      }).join("") + "</div>" : '<p class="hint">ما فيه أجهزة مفعّلة بعد.</p>') +
      '<div class="btnrow" style="margin-top:12px">' +
        (pkSupported() && !mine ? '<button class="btn" type="button" data-pkadd="1">فعّل البصمة على هذا الجهاز</button>' : "") +
        '<button class="btn ghost" type="button" data-pkall="1">خروج من كل الأجهزة</button>' +
      "</div><div data-pkmsg></div>";
    hosts.forEach(function (host) {
      host.innerHTML = h;
      var msg = host.querySelector("[data-pkmsg]");
      var say = function (t, k) { msg.innerHTML = t ? '<div class="msg ' + k + '"><span>' + esc(t) + "</span></div>" : ""; };
      var add = host.querySelector("[data-pkadd]");
      if (add) add.onclick = function () {
        add.disabled = true; say("", "");
        pkEnroll().then(function () { renderPk(); }).catch(function (e) { say(pkErr(e), "err"); add.disabled = false; });
      };
      host.querySelector("[data-pkall]").onclick = function () {
        if (!confirm("تطلع من مقصد في كل أجهزتك (وهذا الجهاز معها)؟ ترجع برسالة واتساب أو ببصمتك.")) return;
        call({ action: "logout", all: true }).catch(function () {}).then(logout);
      };
      var dels = host.querySelectorAll("[data-pkdel]");
      for (var i = 0; i < dels.length; i++) {
        (function (b) {
          b.onclick = function () {
            if (!confirm("تحذف هذا الجهاز من الدخول بالبصمة؟")) return;
            b.disabled = true;
            call({ action: "pk_delete", id: b.dataset.pkdel }).then(function () {
              // إذا حذف كل الأجهزة، نشيل علامة «هذا الجهاز مفعّل»
              if (list.length === 1) pkLsSet(PK_KEY, null);
              renderPk();
            }).catch(function (e) { say(e.message, "err"); b.disabled = false; });
          };
        })(dels[i]);
      }
    });
  }).catch(function () { /* القسم اختياري */ });
}

// رمز دخول لمرة وحدة لموظف علق (مشغّل المنصة فقط): يعطيه له بالتلفون بعد ما يتأكد منه
function issueStaffCode(st, btn) {
  if (!confirm("تصدر رمز دخول لمرة وحدة لـ«" + st.name + "»؟\nأعطه الرمز بنفسك بعد ما تتأكد إنه هو (مكالمة من رقمه).")) return;
  btn.disabled = true;
  call({ action: "staff_code", id: st.id }).then(function (r) {
    openSheet("رمز دخول لـ" + r.name,
      '<p class="hint tight">صالح ' + r.minutes + ' دقيقة ولمرة وحدة. يفتح التطبيق، يكتب رقمه <bdi class="ltr num">' + esc(fmtPhone(r.phone)) +
        '</bdi>، ويضغط «عندي رمز دخول من فريق مقصد».</p>' +
      '<div class="code-big num">' + esc(r.code) + "</div>" +
      '<button class="btn" id="codeDone" type="button">تم</button>');
    $("#codeDone").onclick = closeSheet;
  }).catch(function (e) { alert(e.message); }).then(function () { btn.disabled = false; });
}

function logout() {
  // الخروج يوقف إشعارات هذا الجهاز أيضاً
  if (NT.sub) { try { NT.sub.unsubscribe(); } catch (e) {} NT.sub = null; }
  clearTimeout(NT.tgPoll); NT.tgPoll = null;
  S.token = ""; S.me = null; S.booted = false; S.pre = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  stopLoginWait();
  $("#app").hidden = true; $("#auth").hidden = false;
  note("#authMsg", "", "");
  paintAuthPhone(); authPanel("authPhone");
}

/* ==========================================================================
   الإقلاع
   ========================================================================== */
function boot() {
  var qt = new URLSearchParams(location.search).get("t");
  var chain = Promise.resolve();

  if (qt) {
    history.replaceState({}, "", location.pathname);
    chain = call({ action: "redeem", t: qt })
      .then(function (r) {
        S.token = r.token;
        try { localStorage.setItem(TOKEN_KEY, S.token); } catch (e) {}
      })
      .catch(function (e) { note("#authMsg", e.message, "err"); throw e; });
  } else {
    try { S.token = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { S.token = ""; }
  }

  return chain.then(function () {
    if (!S.token) return;
    return load();
  }).catch(function () { /* تُعرض شاشة الدخول */ });
}

function load() {
  return call({ action: "bootstrap" }).then(function (r) {
    S.pre = r;
    S.me = r; S.isSuper = !!r.is_super;
    S.offices = r.offices || [];
    S.leads = r.leads || [];
    S.team = r.team || [];
    S.props = r.properties || [];
    S.status = r.status || null;
    S.signupsNew = r.signups_new || 0;
    S.pre.leads = null; S.pre.properties = null; S.pre.status = null;

    S.own = r.office; S.pstatus = S.status;
    $("#auth").hidden = true; $("#app").hidden = false;
    $("#dataBlock").hidden = !(S.isSuper || (r.staff && r.staff.role === "owner"));

    if (S.isSuper) {
      // المدير يفتح على لوحة المنصة، ويدخل أي مكتب منها
      S.curOffice = null;
      setMode("platform");
      renderHome(); renderOffices(); renderPlatform();
      loadBackups(); loadSignups(); loadUsage(); loadAdminLog();
      show("s-home");
    } else {
      setMode("office");
      renderToday();
      renderLeads();
      renderStock();
      renderSettings();
      show("s-today");
      if (termsPending()) openTerms(maybeOnboard); else maybeOnboard();
    }
    renderPk();
    S.booted = true;
    // الجهاز مفعّل من قبل (بعد خروج ودخول مثلاً): نعيد تسجيله بصمت
    ntProbe().then(function () {
      renderNotify();
      if (NT.sub && NT.swPush) {
        var j = NT.sub.toJSON ? NT.sub.toJSON() : {};
        if (j.keys) call({ action: "push_subscribe", sub: { endpoint: NT.sub.endpoint, keys: j.keys }, device: deviceName() })
          .catch(function () {});
      }
    });
  });
}

// «أبو فيصل» و«أم خالد» تبقى كاملة
function firstName(n) {
  var w = String(n || "").trim().split(/\s+/);
  return /^(أبو|ابو|أم|ام|بن|آل)$/.test(w[0]) && w[1] ? w[0] + " " + w[1] : w[0];
}
function paintHeader() {
  var o = S.me.office, st = S.me.staff;
  if (S.isSuper && S.mode === "platform") {
    $("#topOffice").textContent = "منصة مقصد";
    $("#topStaff").textContent = st.name + " · مدير المنصة";
    var hr = new Date().getHours();
    $("#homeGreet").textContent = (hr < 12 ? "صباح الخير" : "مساء الخير") + "، " + firstName(st.name);
    $("#homeDate").textContent = new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" });
    return;
  }
  $("#topOffice").textContent = o.name;
  $("#topStaff").textContent = st.name + " · " +
    (st.role === "super_admin" ? "مشغّل المنصة" : st.role === "owner" ? "صاحب المكتب" : "وسيط");
  $("#officeCode").textContent = o.code || "";
  var hour = new Date().getHours();
  var g = hour < 12 ? "صباح الخير" : hour < 17 ? "مساء الخير" : "مساء الخير";
  var w = String(st.name || "").trim().split(/\s+/);
  // «أبو فيصل» و«أم خالد» تبقى كاملة
  var first = /^(أبو|ابو|أم|ام|بن|آل)$/.test(w[0]) && w[1] ? w[0] + " " + w[1] : w[0];
  $("#greet").textContent = g + "، " + first;
  $("#todayDate").textContent = new Date().toLocaleDateString("ar-SA",
    { weekday: "long", day: "numeric", month: "long" });
}

/* ==========================================================================
   شاشة اليوم
   ========================================================================== */
function isQualified(l) { return l.status === "qualified"; }
// ينتظر اتصالك: سلّمه المساعد للمكتب، وما سُجّلت له نتيجة (أو سُجّل «ما رد» فيُعاد الاتصال)
function needsCall(l) {
  return l.mode === "manual" && !l.opted_out && CALLABLE.indexOf(handoffOf(l)) > -1 &&
    (!l.outcome || l.outcome === "no_answer");
}
function licenseBlocked(p) { return !p.listable && p.state === "available"; }

// رخصة فال في «يحتاج انتباهك»: للمكتب حالة رخصته، ولمشغّل المنصة كل المكاتب اللي تحتاج تحقق
function falItems() {
  var out = [];
  if (S.isSuper && S.mode === "platform") {
    var need = S.offices.filter(function (o) {
      var f = falOf(o);
      return o.active !== false && (f.state !== "ok" || falSoon(f));
    });
    if (need.length) {
      var stopped = need.filter(function (o) { var s = falOf(o).state; return s === "pending" || s === "rejected"; }).length;
      out.push({
        kind: stopped ? "hot" : "warn", icon: ICON.alert,
        title: need.length === 1 ? "مكتب يحتاج تحقق من رخصة فال" : need.length + " مكاتب تحتاج تحقق من رخصة فال",
        body: need.slice(0, 3).map(function (o) { return o.name; }).join("، ") + (need.length > 3 ? "…" : ""),
        why: "المكاتب ← تعديل ← رخصة فال",
        go: function () { show("s-offices"); },
      });
    }
    return out;
  }
  var f = falOf(S.me.office);
  var owner = S.me.staff && S.me.staff.role === "owner";
  var toSet = function () { show("s-set"); };
  if (f.state === "pending") {
    out.push({ kind: "hot", icon: ICON.alert, title: "المساعد الآلي متوقف",
      body: "بانتظار تحقق مقصد من رخصة فال — ما يرد على العملاء قبلها",
      why: owner ? "ارفع صورة الرخصة من الإعدادات" : "صاحب المكتب يرفع صورة الرخصة من الإعدادات", go: toSet });
  } else if (f.state === "rejected") {
    out.push({ kind: "hot", icon: ICON.alert, title: "رخصة فال غير معتمدة",
      body: f.note || "المساعد الآلي متوقف", why: "صحّح السبب وأرسل شهادة فال سارية لمقصد", go: toSet });
  } else if (f.state === "expired") {
    out.push({ kind: "hot", icon: ICON.alert, title: "رخصة فال منتهية",
      body: "المساعد يستقبل الطلبات لكن ما يعرض عقاراتك",
      why: "جدّدها وارفع الرخصة الجديدة من الإعدادات", go: toSet });
  } else if (falSoon(f)) {
    out.push({ kind: "warn", icon: ICON.clock, title: "رخصة فال تنتهي " + inDaysAr(f.days_left),
      body: gDate(f.expires_on), why: "جدّدها قبل ما يوقف عرض العقارات", go: toSet });
  }
  return out;
}

/* ==========================================================================
   التنبيهات: تيليجرام و/أو إشعارات الجوال — المكتب يختار
   ========================================================================== */
var NT = { sub: null, sw: null, swPush: null, tgPoll: null, busy: false };

function nt() { return (S.status && S.status.notify) || null; }
// هل يوصل المكتب أي تنبيه فعلاً؟ (قناة مختارة + جاهزة)
function ntReady(n) {
  return !!n && ((n.telegram && n.tg_linked) || (n.push && n.devices > 0));
}
function notifyItems() {
  var n = nt();
  if (!n || ntReady(n)) return [];
  return [{
    kind: "hot", icon: ICON.bell, title: "التنبيهات ما تشتغل",
    body: "ما راح يوصلك العميل الجاهز لحظة ما يكتمل طلبه",
    why: "الإعدادات ← التنبيهات: فعّلها على جوالك أو اربط تيليجرام",
    go: function () { show("s-set"); var b = $("#notifyBlock"); if (b) b.scrollIntoView({ block: "start" }); },
  }];
}

var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
var isStandalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
function b64uToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  var bin = atob(s), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bufToB64u(buf) {
  var b = new Uint8Array(buf), s = "";
  for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deviceName() {
  var u = navigator.userAgent;
  return /iPhone/.test(u) ? "آيفون" : /iPad/.test(u) ? "آيباد" : /Android/.test(u) ? "أندرويد"
    : /Mac/.test(u) ? "ماك" : /Windows/.test(u) ? "ويندوز" : "جهاز";
}

// حالة هذا الجهاز: هل عامل الخدمة يدعم الإشعارات، وهل الجهاز مشترك
function ntProbe() {
  if (!pushSupported()) return Promise.resolve();
  return navigator.serviceWorker.getRegistration().then(function (reg) {
    NT.sw = reg || null;
    if (!reg) { NT.swPush = false; return; }
    return new Promise(function (res) {
      // عامل الخدمة القديم ما يرد: الإشعارات تحتاج تحديث التطبيق
      var done = false, t = setTimeout(function () { if (!done) { done = true; NT.swPush = false; res(); } }, 1500);
      var ch = new MessageChannel();
      ch.port1.onmessage = function (e) {
        if (done) return; done = true; clearTimeout(t);
        NT.swPush = !!(e.data && e.data.push); res();
      };
      var w = reg.active || reg.waiting || reg.installing;
      if (!w) { done = true; clearTimeout(t); NT.swPush = false; res(); return; }
      try { w.postMessage({ type: "maqsad-ping" }, [ch.port2]); } catch (x) { done = true; clearTimeout(t); NT.swPush = false; res(); }
    }).then(function () {
      return reg.pushManager.getSubscription().then(function (sub) { NT.sub = sub; });
    });
  }).catch(function () { NT.swPush = false; });
}

function pushState() {
  if (!pushSupported()) return isIOS && !isStandalone ? "ios_home" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (NT.swPush === false) return "update";
  if (NT.sub) return "on";
  return "off";
}

function renderNotify() {
  var host = $("#notifyCard");
  if (!host) return;
  var n = nt();
  if (!n) { host.innerHTML = '<p class="hint">جاري التحميل…</p>'; return; }
  var ps = pushState();
  var owner = !!n.can_edit;
  var sw = function (id, on, label) {
    return '<label class="nt-sw' + (owner ? "" : " ro") + '"><input type="checkbox" id="' + id + '"' +
      (on ? " checked" : "") + (owner ? "" : " disabled") + '><span class="nt-track" aria-hidden="true"></span>' +
      '<span class="vh">' + esc(label) + "</span></label>";
  };

  // ١) إشعارات الجوال
  var pLine, pBtns = "";
  if (ps === "on") {
    pLine = '<span class="tag ok">مفعّلة على هذا الجوال</span>';
    pBtns = '<button class="btn ghost sm" id="ntPushTest" type="button">إرسال تجربة</button>' +
            '<button class="btn ghost sm" id="ntPushOff" type="button">إيقاف على جوالي</button>';
  } else if (ps === "off") {
    pLine = '<span class="tag mute">غير مفعّلة على هذا الجوال</span>';
    pBtns = '<button class="btn sm" id="ntPushOn" type="button">' + svg(ICON.bell) + "فعّل على هذا الجوال</button>";
  } else if (ps === "ios_home") {
    pLine = '<span class="nt-help">في الآيفون: أضف مقصد للشاشة الرئيسية أولاً — من زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»، وافتحه من الأيقونة وفعّل الإشعارات من هنا.</span>';
  } else if (ps === "denied") {
    pLine = '<span class="nt-help">الإشعارات مقفولة لمقصد في هذا الجوال. افتح إعدادات الجوال ← الإشعارات ← مقصد، وفعّلها، ثم ارجع هنا.</span>';
  } else if (ps === "update") {
    pLine = '<span class="nt-help">تحتاج نسخة أحدث من التطبيق: سكّر مقصد وافتحه من جديد. إذا ما ظهر زر التفعيل، الميزة توصلك مع التحديث القادم.</span>';
  } else {
    pLine = '<span class="nt-help">هذا المتصفح ما يدعم الإشعارات. افتح مقصد من Chrome في الأندرويد أو من أيقونة الشاشة الرئيسية في الآيفون.</span>';
  }
  var others = n.devices - (ps === "on" ? 1 : 0);
  var pMeta = n.devices ? "مفعّلة على " + (n.devices === 1 ? "جوال واحد" : n.devices === 2 ? "جوالين" : n.devices + " أجوال") + " في المكتب"
    : "ما فيه أي جوال مفعّل بعد";

  // ٢) تيليجرام
  var tLine, tBtns = "";
  if (n.tg_linked) {
    tLine = '<span class="tag ok">مربوط</span>';
    tBtns = '<button class="btn ghost sm" id="ntTgTest" type="button">إرسال تجربة</button>' +
            (owner ? '<button class="btn ghost sm" id="ntTgOff" type="button">فك الربط</button>' : "");
  } else if (owner) {
    tLine = '<span class="tag mute">غير مربوط</span>';
    tBtns = '<button class="btn sm" id="ntTgGroup" type="button">' + svg(ICON.tg) + "ربط بمجموعة المكتب</button>" +
            '<button class="btn ghost sm" id="ntTgMe" type="button">ربط بمحادثتي</button>';
  } else {
    tLine = '<span class="nt-help">غير مربوط. صاحب المكتب يربطه من إعداداته بضغطة زر.</span>';
  }

  host.innerHTML =
    '<div class="nt-ch' + (n.push ? "" : " is-off") + '">' +
      '<div class="nt-hd"><span class="nt-ic">' + svg(ICON.phone) + '</span>' +
        '<div class="nt-t"><b>إشعارات الجوال</b><small>من تطبيق مقصد نفسه، مثل أي تطبيق</small></div>' +
        sw("ntPush", n.push, "إرسال التنبيهات على الجوال") + "</div>" +
      (n.push ? '<div class="nt-bd">' + pLine + '<p class="nt-meta">' + esc(pMeta) + "</p>" +
        (pBtns ? '<div class="btnrow nt-btns">' + pBtns + "</div>" : "") + "</div>" : "") +
    "</div>" +
    '<div class="nt-ch' + (n.telegram ? "" : " is-off") + '">' +
      '<div class="nt-hd"><span class="nt-ic">' + svg(ICON.tg) + '</span>' +
        '<div class="nt-t"><b>تيليجرام</b><small>في مجموعة المكتب أو محادثتك الخاصة</small></div>' +
        sw("ntTg", n.telegram, "إرسال التنبيهات على تيليجرام") + "</div>" +
      (n.telegram ? '<div class="nt-bd">' + tLine +
        (tBtns ? '<div class="btnrow nt-btns">' + tBtns + "</div>" : "") +
        '<div id="ntTgWait"></div></div>' : "") +
    "</div>" +
    '<div id="ntMsg"></div>';

  var on = function (id, fn) { var b = $("#" + id); if (b) b.onclick = fn; };
  var chg = function (id, fn) { var b = $("#" + id); if (b) b.onchange = fn; };
  chg("ntPush", function () { ntSavePrefs(this); });
  chg("ntTg", function () { ntSavePrefs(this); });
  on("ntPushOn", function () { ntPushEnable(this); });
  on("ntPushOff", function () { ntPushDisable(this); });
  on("ntPushTest", function () { ntPushTest(this); });
  on("ntTgGroup", function () { ntTgLink(this, "group"); });
  on("ntTgMe", function () { ntTgLink(this, "private"); });
  on("ntTgTest", function () { ntTgTest(this); });
  on("ntTgOff", function () { ntTgUnlink(this); });
}

function ntApply(notify) {
  if (!S.status) S.status = {};
  if (notify) S.status.notify = notify;
  renderNotify(); renderToday();
}
function ntRefresh() {
  return call({ action: "settings_status" }).then(function (r) { S.status = r; renderSettings(); renderToday(); });
}

function ntSavePrefs(box) {
  var n = nt();
  var push = $("#ntPush").checked, tg = $("#ntTg").checked;
  if (!push && !tg) {
    box.checked = true;
    note("#ntMsg", "لازم طريقة وحدة على الأقل، وإلا ما يوصلك العميل الجاهز", "err");
    return;
  }
  box.disabled = true;
  call({ action: "notify_save", push: push, telegram: tg }).then(function (r) {
    ntApply(r.notify);
    note("#ntMsg", "تم الحفظ", "ok");
  }).catch(function (e) {
    box.checked = !box.checked; box.disabled = false;
    note("#ntMsg", e.message, "err");
  });
}

function ntPushEnable(btn) {
  var n = nt();
  if (!n || !n.push_key) { note("#ntMsg", "تعذّر التفعيل — حدّث الصفحة وحاول مرة ثانية", "err"); return; }
  btn.disabled = true;
  Notification.requestPermission().then(function (perm) {
    if (perm !== "granted") throw new Error(perm === "denied"
      ? "رفضت الإذن. تقدر تفعّله من إعدادات الجوال ← الإشعارات ← مقصد"
      : "ما تم التفعيل — اضغط «سماح» لما يسألك الجوال");
    return navigator.serviceWorker.ready;
  }).then(function (reg) {
    return reg.pushManager.getSubscription().then(function (old) {
      return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(n.push_key) });
    });
  }).then(function (sub) {
    NT.sub = sub;
    var j = sub.toJSON ? sub.toJSON() : {};
    var keys = j.keys || { p256dh: bufToB64u(sub.getKey("p256dh")), auth: bufToB64u(sub.getKey("auth")) };
    return call({ action: "push_subscribe", sub: { endpoint: sub.endpoint, keys: keys }, device: deviceName() });
  }).then(function () {
    return call({ action: "push_test", endpoint: NT.sub.endpoint }).catch(function () {});
  }).then(function () {
    return ntRefresh();
  }).then(function () {
    note("#ntMsg", "تم التفعيل. أرسلنا لك إشعار تجربة الحين", "ok");
  }).catch(function (e) {
    btn.disabled = false;
    note("#ntMsg", e.message || "تعذّر التفعيل", "err");
    renderNotify();
  });
}

function ntPushDisable(btn) {
  btn.disabled = true;
  var sub = NT.sub, ep = sub && sub.endpoint;
  (sub ? sub.unsubscribe().catch(function () {}) : Promise.resolve()).then(function () {
    NT.sub = null;
    return ep ? call({ action: "push_unsubscribe", endpoint: ep }) : null;
  }).then(ntRefresh).then(function () {
    note("#ntMsg", "أوقفنا الإشعارات على هذا الجوال", "ok");
  }).catch(function (e) { btn.disabled = false; note("#ntMsg", e.message, "err"); });
}

function ntPushTest(btn) {
  if (!NT.sub) return;
  btn.disabled = true;
  call({ action: "push_test", endpoint: NT.sub.endpoint }).then(function () {
    note("#ntMsg", "أرسلنا إشعار تجربة — يوصلك خلال ثواني", "ok");
  }).catch(function (e) { note("#ntMsg", e.message, "err"); })
    .then(function () { btn.disabled = false; });
}

// ربط تيليجرام: نفتح البوت برابط فيه رمز لمرة وحدة، وننتظر الربط هنا
function ntTgLink(btn, kind) {
  var win = null;
  try { win = window.open("about:blank", "_blank"); } catch (e) {}
  btn.disabled = true;
  call({ action: "tg_link" }).then(function (r) {
    var url = kind === "group" ? r.group : r.private;
    if (win) { try { win.location.href = url; } catch (e) { win = null; } }
    if (!win) location.href = url;
    var wait = $("#ntTgWait");
    if (wait) wait.innerHTML = '<div class="nt-wait">' +
      (kind === "group"
        ? "<b>في تيليجرام:</b> اختر مجموعة المكتب ← «إضافة» ← «ابدأ». إذا ما عندكم مجموعة، أنشئ وحدة وضف فيها الموظفين أول."
        : "<b>في تيليجرام:</b> اضغط «ابدأ» (Start) أسفل المحادثة.") +
      '<span class="nt-dots">بانتظار الربط</span></div>';
    ntTgPoll(0);
  }).catch(function (e) {
    if (win) try { win.close(); } catch (x) {}
    btn.disabled = false; note("#ntMsg", e.message, "err");
  });
}
function ntTgPoll(i) {
  clearTimeout(NT.tgPoll);
  if (i > 60) {                              // ٣ دقائق
    var w = $("#ntTgWait");
    if (w) w.innerHTML = '<p class="hint">ما تم الربط بعد. اضغط زر الربط مرة ثانية إذا سكّرت تيليجرام قبل «ابدأ».</p>';
    renderNotifyButtonsEnabled();
    return;
  }
  NT.tgPoll = setTimeout(function () {
    call({ action: "tg_status" }).then(function (r) {
      if (r.linked) {
        return ntRefresh().then(function () { note("#ntMsg", "تم ربط تيليجرام. من الحين توصلك التنبيهات هناك", "ok"); });
      }
      ntTgPoll(i + 1);
    }).catch(function () { ntTgPoll(i + 1); });
  }, 3000);
}
function renderNotifyButtonsEnabled() {
  ["ntTgGroup", "ntTgMe"].forEach(function (id) { var b = $("#" + id); if (b) b.disabled = false; });
}
// نرجع للتطبيق من تيليجرام: نفحص فوراً بدل انتظار الدورة
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && NT.tgPoll) ntTgPoll(0);
});

function ntTgTest(btn) {
  btn.disabled = true;
  call({ action: "tg_test" }).then(function () {
    note("#ntMsg", "أرسلنا رسالة تجربة على تيليجرام", "ok");
  }).catch(function (e) { note("#ntMsg", e.message, "err"); })
    .then(function () { btn.disabled = false; });
}
function ntTgUnlink(btn) {
  if (!confirm("فك ربط تيليجرام؟ التنبيهات بتوصل على الجوال فقط.")) return;
  btn.disabled = true;
  call({ action: "tg_unlink" }).then(ntRefresh).then(function () {
    note("#ntMsg", "فكّينا ربط تيليجرام", "ok");
  }).catch(function (e) { btn.disabled = false; note("#ntMsg", e.message, "err"); });
}

// فتح التطبيق من إشعار: عامل الخدمة يرسل الرابط
if ("serviceWorker" in navigator) {
  try {
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "maqsad-open" && S.booted) { load(); show("s-today"); }
    });
  } catch (e) {}
}

function renderToday() {
  var q = S.leads.filter(isQualified).length;
  var waiting = S.leads.filter(needsCall).length;
  var listable = S.props.filter(function (p) { return p.listable; }).length;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var newToday = S.leads.filter(function (l) {
    return l.last_message_at && new Date(l.last_message_at) >= today;
  }).length;

  $("#todayStats").innerHTML =
    stat(waiting, "ينتظر اتصالك", waiting ? "hot" : "mute") +
    stat(q, "عميل مؤهل", q ? "ok" : "mute") +
    stat(newToday, "نشاط اليوم", newToday ? "br" : "mute") +
    stat(listable, "عقار للعرض", listable ? "br" : "mute");

  // رخصة فال أولاً: إذا المساعد متوقف ما فيه شي أهم منها
  var items = falItems().concat(notifyItems());

  S.leads.filter(needsCall)
    .sort(function (a, b) {
      return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
    })
    .slice(0, 6)
    .forEach(function (l) {
      var want = [l.deal_type, l.property_type, l.location].filter(Boolean).join(" · ");
      var retry = l.outcome === "no_answer";
      items.push({
        kind: retry ? "warn" : "hot", icon: retry ? ICON.clock : ICON.flame,
        title: l.name || l.phone,
        body: want || "طلب بلا تفاصيل",
        why: [retry ? "ما رد — جرّب مرة ثانية" : HANDOFF[handoffOf(l)],
              l.budget ? money(l.budget) + " ريال " + (l.budget_period || "") : null,
              "آخر رسالة " + ago(l.last_message_at)].filter(Boolean).join(" · "),
        go: function () { openLead(l.id); },
      });
    });

  // تذكير خطوات البداية لين يخلّصها صاحب المكتب
  items = onboardItems().concat(items);

  S.props.forEach(function (p) {
    var d = daysTo(p.ad_license_expiry);
    if (d !== null && d >= 0 && d <= 7) {
      items.push({
        kind: "warn", icon: ICON.clock, title: "ترخيص إعلان على وشك الانتهاء",
        body: p.title + " — " + p.district,
        why: d === 0 ? "ينتهي اليوم" : "يتبقّى " + d + " يوم",
        go: function () { openProp(p.id); },
      });
    }
  });

  // المحجوب بسبب العقار نفسه (ترخيص إعلانه): حجب رخصة فال للمكتب كله له بطاقته فوق
  var blocked = S.props.filter(licenseBlocked).filter(function (p) { return !/فال/.test(p.block_reason || ""); });
  if (blocked.length) {
    items.push({
      kind: "warn", icon: ICON.home,
      title: blocked.length + " عقار محجوب عن العرض",
      body: "لا يعرضها البوت على العملاء",
      why: blocked[0].block_reason || "غير متاح",
      go: function () { S.stockFilter = "blocked"; syncChips("#stockChips", "blocked"); renderStock(); show("s-stock"); },
    });
  }

  $("#navDot").hidden = waiting === 0;

  paintAttn($("#attnList"), items, "ما فيه عميل ينتظر ولا تنبيه مفتوح. البوت يشتغل ويجمع لك الطلبات.");
  loadGap(); renderMonth();
}

function paintAttn(host, items, calm) {
  if (!items.length) {
    host.className = "";
    host.innerHTML = state(ICON.check, "كل شي تمام", calm);
    return;
  }
  host.innerHTML = "";
  host.className = items.length > 2 ? "attn-grid" : "";
  items.slice(0, 10).forEach(function (it) {
    var b = el("button", "attn " + it.kind,
      '<div class="ic">' + svg(it.icon) + "</div>" +
      '<div class="body"><b>' + esc(it.title) + "</b>" +
      "<span>" + esc(it.body) + "</span>" +
      '<span class="why">' + esc(it.why) + "</span></div>" +
      '<div style="align-self:center;color:var(--ink-3)">' + svg(ICON.chev, 'width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"') + "</div>");
    b.onclick = it.go;
    host.appendChild(b);
  });
}

/* ---------- أداء المكتب: هذا الشهر / الشهر الماضي ---------- */
function monthKeySel() { return S.monthSel === "prev" ? riyadhMonth(-1) : riyadhMonth(0); }

function renderMonth(force) {
  var host = $("#monthCard");
  if (!host) return;
  var key = monthKeySel();
  var cached = S.month[key];
  if (cached && !force) { host.innerHTML = monthHtml(cached, key); return; }
  if (!cached) host.innerHTML = '<div class="skel" style="height:132px"></div>';
  call({ action: "month_stats", month: key }).then(function (r) {
    S.month[key] = r.stats || {};
    if (monthKeySel() === key) host.innerHTML = monthHtml(S.month[key], key);
  }).catch(function (e) {
    host.innerHTML = '<p class="hint">' + esc(e.message) + "</p>";
  });
}

function monthHtml(st, key) {
  if (!n0(st.new_customers) && !n0(st.inbound_msgs)) {
    return state(ICON.chat, key === riyadhMonth(0) ? "ما فيه نشاط هذا الشهر بعد" : "ما فيه نشاط في هذا الشهر",
      "أول ما يراسل عميل رقم المكتب، تبدأ الأرقام تظهر هنا.");
  }
  var h = st.handoffs || {}, o = st.outcomes || {};
  var handed = CALLABLE.reduce(function (a, k) { return a + n0(h[k]); }, 0);
  var recorded = OUTCOME_ORDER.filter(function (k) { return n0(o[k]); });
  var facts = [];
  var fr = dur(st.first_reply_median_s);
  if (fr) facts.push(["سرعة رد المساعد", "عادةً خلال " + fr]);
  if (n0(st.offhours_new)) facts.push(["بدأوا خارج الدوام", n0(st.offhours_new) + " من العملاء الجدد (١٠ الليل – ٩ الصبح)"]);
  var cb = dur(st.callback_median_s);
  if (cb) facts.push(["اتصالكم بعد التسليم", "عادةً خلال " + cb]);
  if (recorded.length) {
    facts.push(["نتائج الاتصال", recorded.map(function (k) { return OUTCOME[k][1] + " " + n0(o[k]); }).join(" · ")]);
  }
  var top = (st.top_districts || []).filter(function (x) { return x && x.d; });
  if (top.length) facts.push(["أكثر الأحياء طلباً", top.map(function (x) { return x.d + " (" + n0(x.n) + ")"; }).join("، ")]);

  return '<div class="stats">' +
      stat(n0(st.new_customers), "عميل جديد", n0(st.new_customers) ? "br" : "mute") +
      stat(handed, "سلّمهم المساعد لك", handed ? "hot" : "mute") +
      stat(n0(o.viewing), "معاينة", n0(o.viewing) ? "ok" : "mute") +
      stat(n0(o.deal), "صفقة", n0(o.deal) ? "ok" : "mute") +
    "</div>" +
    (facts.length ? '<div class="card flat"><dl class="dl">' + facts.map(function (f) {
      return "<div><dt>" + esc(f[0]) + "</dt><dd>" + esc(f[1]) + "</dd></div>";
    }).join("") + "</dl></div>" : "") +
    (handed && !recorded.length
      ? '<p class="hint">سجّلوا نتيجة كل اتصال من بطاقة العميل، عشان تظهر المعاينات والصفقات هنا وفي ملخص الشهر.</p>'
      : '<p class="hint">نفس الأرقام توصل مجموعة المكتب على تيليجرام أول كل شهر.</p>');
}

function stat(v, k, tone) {
  return '<div class="stat"><div class="v ' + tone + ' num">' + v + "</div>" +
    '<div class="k">' + esc(k) + "</div></div>";
}

function loadGap() {
  call({ action: "analytics" }).then(function (r) {
    // لكل حي (ونوع الطلب والعقار في النسخة الجديدة): كم طلب (demand)، وكم عقار متاح (supply)،
    // وكم منها في حدود ميزانية الطالبين (supply_fit). النسخة القديمة ما فيها supply_fit
    var gap = (r.gap || []).filter(function (g) {
      var have = g.supply_fit != null ? g.supply_fit : g.supply;
      return (g.demand || 0) > (have || 0);
    });
    if (!gap.length) { $("#gapBlock").hidden = true; return; }
    $("#gapBlock").hidden = false;
    $("#gapList").innerHTML = gap.slice(0, 5).map(function (g) {
      var what = [g.property_type, g.deal_type].filter(Boolean).join(" ");
      var sub = !g.supply ? "لا يوجد عقار متاح في مخزونك هنا"
        : g.supply_fit == null ? "عندك " + g.supply + " عقار فقط في هذا الحي"
        : g.supply_fit === 0 ? "عندك " + g.supply + " عقار هنا، لكن فوق ميزانيتهم"
        : "عندك " + g.supply_fit + " فقط في حدود ميزانيتهم";
      if (g.budget) sub = "ميزانيتهم حوالي " + money(g.budget) + " ريال" + (g.deal_type === "إيجار" ? " سنوي" : "") + " · " + sub;
      return '<div class="row static"><div class="main">' +
        '<span class="t">' + esc((g.district || "حي غير محدد") + (what ? " · " + what : "")) + "</span>" +
        '<span class="s">' + esc(sub) + "</span></div>" +
        '<div class="end"><span class="tag warn num">' + g.demand + " طلب</span></div></div>";
    }).join("");
  }).catch(function () { $("#gapBlock").hidden = true; });
}

/* ==========================================================================
   العملاء
   ========================================================================== */
// الوسيط المسؤول عن العميل (يختاره صاحب المكتب)
function myId() { return (S.me && S.me.staff && S.me.staff.id) || ""; }
function teamName(id) {
  var t = S.team.filter(function (x) { return x.id === id; })[0];
  return t ? t.name : "";
}
function firstName(n) {
  var w = String(n || "").trim().split(/\s+/);
  return /^(أبو|ابو|أم|ام)$/.test(w[0]) && w[1] ? w[0] + " " + w[1] : w[0] || "";
}
function assignTag(l) {
  if (!l.assigned_to) return "";
  if (l.assigned_to === myId()) return '<span class="tag brand">لك</span>';
  var n = firstName(teamName(l.assigned_to));
  return n ? '<span class="tag mute">' + esc(n) + "</span>" : "";
}

function leadMatches(l) {
  if (S.leadFilter === "mine" && l.assigned_to !== myId()) return false;
  if (S.leadFilter === "waiting" && !needsCall(l)) return false;
  if (S.leadFilter === "qualified" && l.status !== "qualified") return false;
  if (S.leadFilter === "manual" && l.mode !== "manual") return false;
  if (S.leadFilter === "auto" && l.mode !== "auto") return false;
  var q = S.leadQuery.trim();
  if (!q) return true;
  var hay = [l.name, l.phone, l.location, l.property_type, l.deal_type, l.summary].join(" ").toLowerCase();
  return hay.indexOf(q.toLowerCase()) !== -1;
}

// الجهاز فيه آخر ١٠٠ عميل فقط؛ البحث يسأل الخادم عن الأقدم ويضيفهم للنتيجة
var LEADS_PAGE = 100;
function leadPool() {
  if (!S.leadHits || !S.leadQuery.trim()) return S.leads;
  var seen = {};
  S.leads.forEach(function (l) { seen[l.id] = 1; });
  return S.leads.concat(S.leadHits.filter(function (l) { return !seen[l.id]; }));
}
function searchOlderLeads() {
  clearTimeout(S.leadSearchT);
  var q = S.leadQuery.trim();
  S.leadHits = null;
  if (q.length < 2 || S.leads.length < LEADS_PAGE) return;
  S.leadSearchT = setTimeout(function () {
    call({ action: "leads", q: q }).then(function (r) {
      if (S.leadQuery.trim() !== q) return;
      S.leadHits = r.leads || [];
      renderLeads();
    }).catch(function () {});
  }, 350);
}

function renderLeads() {
  var list = leadPool().filter(leadMatches);
  $("#leadsCount").textContent = S.leadQuery.trim() && S.leadHits
    ? list.length + " نتيجة"
    : list.length + " من " + S.leads.length;

  if (!S.leads.length) {
    $("#leadsWrap").innerHTML = state(ICON.chat, "ما وصل عميل بعد",
      "أول ما يراسل عميل رقم المكتب على واتساب، بيظهر هنا بكامل طلبه.");
    return;
  }
  if (!list.length) {
    $("#leadsWrap").innerHTML = state(ICON.inbox, "ما فيه نتائج",
      "جرّب كلمة بحث أخرى أو أزل الفلتر.");
    return;
  }

  var wrap = el("div", "rows");
  list.forEach(function (l) {
    var want = [l.deal_type, l.property_type, l.location].filter(Boolean).join(" · ") || "طلب بلا تفاصيل";
    var money_ = l.budget ? money(l.budget) + " ريال" : "";
    var tag = l.status === "qualified"
      ? '<span class="tag ok">مؤهل</span>'
      : '<span class="tag mute">استفسار</span>';
    var mode = l.opted_out ? '<span class="tag mute">أوقف الرسائل</span>'
      : l.mode === "manual" ? '<span class="tag hot">معك</span>' : "";

    var row = el("button", "row",
      '<div class="main"><span class="t">' + esc(l.name || l.phone) + "</span>" +
      '<span class="s">' + esc(want) + (money_ ? " · " + money_ : "") + "</span></div>" +
      '<div class="end">' + assignTag(l) + outcomeTag(l) + mode + tag +
      svg(ICON.chev, 'class="chev"') + "</div>");
    row.onclick = function () { openLead(l.id); };
    wrap.appendChild(row);
  });
  $("#leadsWrap").innerHTML = "";
  $("#leadsWrap").appendChild(wrap);
}

function journey(lead, msgs) {
  var showed = (msgs || []).some(function (m) {
    return m.direction === "out" && m.body && m.body.indexOf("🏠") !== -1;
  });
  var stages = [
    { k: "جديد", done: true },
    { k: "مؤهل", done: lead.status === "qualified" },
    { k: "عُرضت عقارات", done: showed },
    { k: "مع الوسيط", done: lead.mode === "manual" },
  ];
  var lastDone = -1;
  stages.forEach(function (s, i) { if (s.done) lastDone = i; });

  var h = '<div class="track">';
  stages.forEach(function (s, i) {
    if (i) h += '<div class="bar' + (i <= lastDone ? " done" : "") + '"></div>';
    var cls = i < lastDone ? "done" : i === lastDone ? "now" : "";
    h += '<div class="st ' + cls + '"><span class="pt"></span><span class="lb">' + s.k + "</span></div>";
  });
  return h + "</div>";
}

function outcomeNote(l) {
  if (!l.outcome) return "بعد ما تتصل بالعميل اختر النتيجة — تظهر في «أداء المكتب» وملخص الشهر.";
  return "سجّلها " + (l.outcome_by_name || "النظام تلقائياً لما رد الموظف من جوال المكتب") + " " + ago(l.outcome_at) +
    ". اضغطها مرة ثانية لإلغائها.";
}

function assignNote(l) {
  if (!l.assigned_to) return "ما فيه وسيط مسؤول — التنبيه يوصل للمكتب كله.";
  if (l.assigned_to === myId()) return "هذا العميل مسؤوليتك.";
  return "المسؤول: " + (l.assigned_name || teamName(l.assigned_to) || "موظف");
}
// صاحب المكتب يختار الوسيط، والباقين يشوفون الاسم فقط. مكتب بموظف واحد: ما تظهر
function assignCard(l) {
  if (S.team.length < 2 && !l.assigned_to) return "";
  var pick = canDeleteLead()
    ? '<select id="leadAssign" class="input" aria-label="الوسيط المسؤول"><option value="">بدون</option>' +
      S.team.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === l.assigned_to ? " selected" : "") + ">" + esc(t.name) + "</option>";
      }).join("") + "</select>"
    : "";
  return '<div class="card" style="margin:14px 0"><h3>الوسيط المسؤول</h3>' + pick +
    '<p class="hint" id="assignNote">' + esc(assignNote(l)) + "</p></div>";
}

function openLead(id) {
  openSheet("جاري التحميل…", skeleton(3));
  call({ action: "lead", id: id }).then(function (r) {
    var l = r.lead, msgs = r.messages || [];
    var wa = "https://wa.me/" + digits(l.phone);

    var rows = [
      ["الجوال", l.phone],
      ["نوع الطلب", l.deal_type],
      ["نوع العقار", l.property_type],
      ["المدينة", l.city],
      ["الحي", l.location],
      ["الميزانية", l.budget ? money(l.budget) + " ريال " + (l.budget_period || "") : null],
      ["عدد الغرف", l.rooms],
      ["موعد المعاينة", l.appointment],
      ["عدد الرسائل", l.msg_count],
      ["آخر نشاط", ago(l.last_message_at)],
    ].filter(function (p) { return p[1] != null && p[1] !== ""; });

    var html =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
        (l.status === "qualified" ? '<span class="tag ok">عميل مؤهل</span>' : '<span class="tag mute">استفسار عام</span>') +
        (l.mode === "manual"
          ? '<span class="tag hot">مُسلَّم لك' + (handoffOf(l) && handoffOf(l) !== "qualified" ? " (" + HANDOFF[handoffOf(l)] + ")" : "") + " — البوت صامت</span>"
          : '<span class="tag brand">البوت يتابعه</span>') +
        (l.opted_out ? '<span class="tag danger">أوقف الرسائل الآلية</span>' : "") +
      "</div>" +
      journey(l, msgs) +
      '<div class="card outcome" style="margin:14px 0"><h3>نتيجة الاتصال</h3>' +
        '<div class="chips wrap" id="outcomeChips">' + OUTCOME_ORDER.map(function (k) {
          return '<button class="chip" type="button" data-o="' + k + '" aria-pressed="' +
            (l.outcome === k ? "true" : "false") + '">' + OUTCOME[k][0] + "</button>";
        }).join("") + "</div>" +
        '<p class="hint" id="outcomeNote">' + esc(outcomeNote(l)) + "</p>" +
      "</div>" +
      assignCard(l) +
      (l.summary ? '<div class="card" style="margin:14px 0"><h3>ملخص الذكاء الاصطناعي</h3><p style="font-size:14px;line-height:1.8;color:var(--ink-2)">' + esc(l.summary) + "</p></div>" : "") +
      '<div class="card" style="margin-bottom:14px" id="leadReq"><div class="card-hd"><h3>طلب العميل</h3>' +
        '<button type="button" class="linkbtn" id="leadEdit">تصحيح البيانات</button></div><dl class="dl">' +
        rows.map(function (p) {
          return "<div><dt>" + esc(p[0]) + '</dt><dd class="num">' + esc(p[1]) + "</dd></div>";
        }).join("") +
      "</dl></div>" +
      (msgs.length ? '<div class="card" style="margin-bottom:14px"><h3>آخر المحادثة</h3><div class="chat">' +
        msgs.slice(-6).map(function (m) {
          return '<div class="bub ' + (m.direction === "in" ? "in" : "out") + '">' + esc(m.body) +
            '<span class="tm">' + ago(m.created_at) + "</span></div>";
        }).join("") + "</div></div>" : "") +
      '<div class="btnrow">' +
        '<a class="btn wa" href="' + wa + '" target="_blank" rel="noopener">' +
          svg(ICON.wa) + " افتح واتساب</a>" +
        '<button class="btn ghost" id="toggleMode"' +
          (l.opted_out ? ' disabled title="العميل كتب «توقف» — لا يعود للبوت إلا إذا كتب «ابدأ»"' : "") + ">" +
          (l.mode === "manual" ? "أعده للبوت" : "استلم المحادثة") + "</button>" +
      "</div><div id=\"leadMsg\"></div>" +
      (canDeleteLead() ? '<div class="lead-del"><button type="button" class="btn danger sm" id="leadDel">حذف العميل</button></div>' : "");

    openSheet(l.name || l.phone, html);

    var chips = document.querySelectorAll("#outcomeChips .chip");
    for (var ci = 0; ci < chips.length; ci++) {
      (function (btn) {
        btn.onclick = function () {
          var pick = btn.dataset.o === l.outcome ? null : btn.dataset.o;   // الضغط على المختارة يلغيها
          for (var j = 0; j < chips.length; j++) chips[j].disabled = true;
          call({ action: "lead_outcome", id: l.id, outcome: pick }).then(function (r) {
            var nl = r.lead || {};
            l.outcome = nl.outcome || null; l.outcome_at = nl.outcome_at || null;
            l.outcome_by_name = nl.outcome_by_name || null;
            var i = S.leads.findIndex(function (x) { return x.id === l.id; });
            if (i > -1) { S.leads[i].outcome = l.outcome; S.leads[i].outcome_at = l.outcome_at; }
            for (var j = 0; j < chips.length; j++) {
              chips[j].setAttribute("aria-pressed", chips[j].dataset.o === l.outcome ? "true" : "false");
            }
            $("#outcomeNote").textContent = outcomeNote(l);
            S.month = {};
            renderLeads(); renderToday();
          }).catch(function (e) { note("#leadMsg", e.message, "err"); })
            .then(function () { for (var j = 0; j < chips.length; j++) chips[j].disabled = false; });
        };
      })(chips[ci]);
    }

    if ($("#leadAssign")) $("#leadAssign").onchange = function () {
      var sel = this, prev = l.assigned_to || "";
      sel.disabled = true;
      call({ action: "lead_assign", id: l.id, staff_id: sel.value || null }).then(function (r) {
        l.assigned_to = sel.value || null; l.assigned_name = r.assigned_name || null;
        var i = S.leads.findIndex(function (x) { return x.id === l.id; });
        if (i > -1) S.leads[i].assigned_to = l.assigned_to;
        $("#assignNote").textContent = assignNote(l);
        renderLeads(); renderToday();
      }).catch(function (e) { sel.value = prev; note("#leadMsg", e.message, "err"); })
        .then(function () { sel.disabled = false; });
    };

    $("#leadEdit").onclick = function () { openLeadEdit(l); };
    if ($("#leadDel")) $("#leadDel").onclick = function () { askLeadDelete(l); };

    $("#toggleMode").onclick = function () {
      var b = this; b.disabled = true;
      var next = l.mode === "manual" ? "auto" : "manual";
      call({ action: "set_mode", id: l.id, mode: next })
        .then(function () {
          var i = S.leads.findIndex(function (x) { return x.id === l.id; });
          if (i > -1) S.leads[i].mode = next;
          renderLeads(); renderToday();
          closeSheet();
        })
        .catch(function (e) { note("#leadMsg", e.message, "err"); b.disabled = false; });
    };
  }).catch(function (e) {
    openSheet("خطأ", state(ICON.alert, "تعذّر فتح العميل", e.message));
  });
}


/* ---------- تصحيح بيانات العميل وحذفه ---------- */
function canDeleteLead() { return S.isSuper || isOwnerMe(); }

// تصحيح ما سجّله المساعد: اختياري، والحفظ ما يرسل للعميل شيئاً ولا يسلّمه
function openLeadEdit(l) {
  var opt = function (val, list, empty) {
    return '<option value="">' + empty + "</option>" + list.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === val ? " selected" : "") + ">" + esc(o) + "</option>";
    }).join("");
  };
  var f = function (id, label, val, extra) {
    return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" class="input" value="' +
      esc(val == null ? "" : val) + '"' + (extra || "") + "></div>";
  };
  $("#leadReq").innerHTML = '<h3>تصحيح بيانات العميل</h3>' +
    '<p class="hint" style="margin-bottom:12px">عدّل اللي سجّله المساعد غلط فقط. الحفظ ما يرسل للعميل أي رسالة.</p>' +
    f("leName", "الاسم", l.name) +
    '<div class="grid2">' +
      '<div class="field"><label for="leDeal">نوع الطلب</label><select id="leDeal" class="input">' + opt(l.deal_type, ["إيجار", "شراء", "عرض عقار"], "—") + "</select></div>" +
      '<div class="field"><label for="leType">نوع العقار</label><select id="leType" class="input">' + opt(l.property_type, ["شقة", "فيلا", "دور", "أرض", "محل"], "—") + "</select></div>" +
    "</div>" +
    '<div class="grid2">' + f("leCity", "المدينة", l.city, ' list="cityList" autocomplete="off"') + f("leLoc", "الحي", l.location) + "</div>" + cityOptions() +
    '<div class="grid2">' +
      f("leBudget", "الميزانية بالريال", l.budget, ' inputmode="numeric" dir="ltr"') +
      '<div class="field"><label for="lePer">فترة الميزانية</label><select id="lePer" class="input">' + opt(l.budget_period, ["سنوي", "شهري"], "—") + "</select></div>" +
    "</div>" +
    '<p class="hint" id="leBudgetHint"></p>' +
    f("leRooms", "عدد الغرف", l.rooms, ' type="number" inputmode="numeric"') +
    '<div class="btnrow"><button class="btn" id="leSave">احفظ التصحيح</button><button class="btn ghost" id="leCancel">إلغاء</button></div>' +
    '<div id="leMsg"></div>';
  var hint = function () {
    var n = Number(digits(latinDigits($("#leBudget").value)));
    $("#leBudgetHint").textContent = n ? money(n) + " ريال" : "";
  };
  $("#leBudget").oninput = hint; hint();
  $("#leCancel").onclick = function () { openLead(l.id); };
  $("#leSave").onclick = function () {
    var b = this; b.disabled = true; note("#leMsg", "", "");
    call({ action: "lead_update", id: l.id, fields: {
      name: $("#leName").value, deal_type: $("#leDeal").value, property_type: $("#leType").value,
      city: $("#leCity").value, location: $("#leLoc").value, budget: digits(latinDigits($("#leBudget").value)),
      budget_period: $("#lePer").value, rooms: $("#leRooms").value,
    } }).then(function (r) {
      var i = S.leads.findIndex(function (x) { return x.id === l.id; });
      if (i > -1 && r.lead) S.leads[i] = Object.assign({}, S.leads[i], r.lead);
      renderLeads(); renderToday();
      openLead(l.id);
    }).catch(function (e) { note("#leMsg", e.message, "err"); b.disabled = false; });
  };
}

// حذف نهائي بتأكيد واضح داخل البطاقة (حذف / إلغاء)
function askLeadDelete(l) {
  var host = document.querySelector(".lead-del");
  host.innerHTML = '<div class="card confirm-del">' +
    "<h3>هل أنت متأكد من حذف هذا العميل؟</h3>" +
    '<p class="hint">يُحذف طلبه ومحادثته من مقصد نهائياً، وما يمكن استرجاعها. محادثته في واتساب نفسه ما تتأثر. ' +
    "وإذا راسلكم مرة ثانية يبدأ كعميل جديد بلا بيانات سابقة.</p>" +
    '<div class="btnrow"><button class="btn danger-solid" id="delYes">حذف</button>' +
    '<button class="btn ghost" id="delNo">إلغاء</button></div><div id="delMsg"></div></div>';
  try { host.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
  $("#delNo").onclick = function () { openLead(l.id); };
  $("#delYes").onclick = function () {
    var b = this; b.disabled = true;
    call({ action: "lead_delete", id: l.id }).then(function () {
      S.leads = S.leads.filter(function (x) { return x.id !== l.id; });
      S.month = {};
      renderLeads(); renderToday();
      closeSheet();
    }).catch(function (e) { note("#delMsg", e.message, "err"); b.disabled = false; });
  };
}

/* ==========================================================================
   العقارات
   ========================================================================== */
// المدن: نفس اسم الحي موجود في أكثر من مدينة (المنتزه في الرياض والطائف)، فالمدينة جزء من العقار
var CITIES = ["الرياض", "جدة", "مكة المكرمة", "المدينة المنورة", "الدمام", "الخبر", "الظهران", "الطائف", "بريدة",
  "عنيزة", "تبوك", "أبها", "خميس مشيط", "حائل", "الأحساء", "الجبيل", "نجران", "جازان", "ينبع", "القطيف"];
function propCities() {
  var seen = {};
  S.props.forEach(function (p) { if (p.city) seen[p.city] = 1; });
  return Object.keys(seen);
}
function cityOptions() {
  var all = propCities();
  CITIES.forEach(function (c) { if (all.indexOf(c) < 0) all.push(c); });
  return '<datalist id="cityList">' + all.map(function (c) { return '<option value="' + esc(c) + '">'; }).join("") + "</datalist>";
}
// مدينة افتراضية للعقار الجديد: إذا كل عقارات المكتب في مدينة وحدة
function defaultCity() { var c = propCities(); return c.length === 1 ? c[0] : ""; }

function propMatches(p) {
  if (S.stockCity && p.city !== S.stockCity) return false;
  if (S.stockFilter === "listable" && !p.listable) return false;
  if (S.stockFilter === "blocked" && !licenseBlocked(p)) return false;
  var q = S.stockQuery.trim();
  if (!q) return true;
  return [p.title, p.district, p.city, p.property_type].join(" ").toLowerCase()
    .indexOf(q.toLowerCase()) !== -1;
}

function renderStock() {
  var cities = propCities();
  var cf = $("#stockCity");
  if (cf) {
    if (cities.length > 1) {
      if (cities.indexOf(S.stockCity) < 0) S.stockCity = "";
      cf.innerHTML = '<option value="">كل المدن</option>' + cities.map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === S.stockCity ? " selected" : "") + ">" + esc(c) + "</option>";
      }).join("");
      cf.hidden = false;
    } else { cf.hidden = true; S.stockCity = ""; }
  }
  var list = S.props.filter(propMatches);
  var ok = S.props.filter(function (p) { return p.listable; }).length;
  $("#stockCount").textContent = ok + " من " + S.props.length + " قابل للعرض";

  if (!S.props.length) {
    $("#stockWrap").innerHTML = state(ICON.home, "المخزون فارغ",
      "أضف عقاراتك ليعرضها البوت على العملاء المؤهلين. بدون مخزون، البوت يجمع الطلبات فقط.");
    return;
  }
  if (!list.length) {
    $("#stockWrap").innerHTML = state(ICON.inbox, "ما فيه نتائج", "جرّب بحثاً آخر أو أزل الفلتر.");
    return;
  }

  var wrap = el("div", "rows");
  list.forEach(function (p) {
    var sub = [[p.district, cities.length > 1 ? p.city : null].filter(Boolean).join("، "),
      p.deal_type === "إيجار" ? "إيجار" : "بيع", p.rooms ? p.rooms + " غرف" : null].concat(pdBrief(p), [money(p.price) + " ريال"])
      .filter(Boolean).join(" · ");
    var tag = p.listable ? '<span class="tag ok">للعرض</span>'
      : p.state !== "available" ? '<span class="tag mute">' + esc(PSTATE[p.state] || p.state) + "</span>"
      : '<span class="tag danger">محجوب</span>';
    var why = p.listable || p.state !== "available" ? "" : " — " + esc(p.block_reason || "");
    var row = el("button", "row",
      '<div class="main"><span class="t">' + esc(p.title) + "</span>" +
      '<span class="s num">' + esc(sub) + why + "</span></div>" +
      '<div class="end">' + tag + svg(ICON.chev, 'class="chev"') + "</div>");
    row.onclick = function () { openProp(p.id); };
    wrap.appendChild(row);
  });
  $("#stockWrap").innerHTML = "";
  $("#stockWrap").appendChild(wrap);
}

function openProp(id) {
  var p = id ? S.props.filter(function (x) { return x.id === id; })[0] : null;
  var v = p || { deal_type: "إيجار", property_type: "شقة", state: "available" };

  var sel = function (name, val, opts) {
    return opts.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === val ? " selected" : "") + ">" + esc(o) + "</option>";
    }).join("");
  };

  openSheet(p ? "تعديل العقار" : "عقار جديد",
    (p ? '<button class="btn ghost" type="button" id="pMatches" style="margin-bottom:14px">' + svg(ICON.inbox) +
      " عملاء سابقون يطابقون هذا العقار</button>" : "") +
    '<div class="field"><label for="pTitle">اسم العقار</label>' +
      '<input id="pTitle" class="input" value="' + esc(v.title || "") + '" placeholder="شقة النرجس A12"></div>' +
    '<div class="grid2">' +
      '<div class="field"><label for="pDeal">نوع الطلب</label><select id="pDeal" class="input">' +
        // «بيع» قديمة = «شراء»؛ بدونها يتحول العقار لإيجار بالغلط عند الحفظ
        sel("deal", v.deal_type === "بيع" ? "شراء" : v.deal_type, ["إيجار", "شراء"]) + "</select></div>" +
      '<div class="field"><label for="pType">نوع العقار</label><select id="pType" class="input">' +
        sel("type", v.property_type, ["شقة", "فيلا", "دور", "أرض", "محل"]) + "</select></div>" +
    "</div>" +
    '<div class="grid2">' +
      '<div class="field"><label for="pCity">المدينة</label>' +
        '<input id="pCity" class="input" list="cityList" autocomplete="off" value="' + esc(v.city || (p ? "" : defaultCity())) + '" placeholder="الرياض"></div>' +
      '<div class="field"><label for="pDistrict">الحي</label>' +
        '<input id="pDistrict" class="input" value="' + esc(v.district || "") + '" placeholder="النرجس"></div>' +
    "</div>" + cityOptions() +
    '<div class="field"><label for="pRooms">عدد الغرف</label>' +
      '<input id="pRooms" class="input" type="number" inputmode="numeric" value="' + esc(v.rooms || "") + '"></div>' +
    '<div class="grid2">' +
      '<div class="field"><label for="pPrice">السعر بالريال (الإيجار سنوي)</label>' +
        '<input id="pPrice" class="input" type="number" inputmode="numeric" value="' + esc(v.price || "") + '"></div>' +
      '<div class="field"><label for="pState">الحالة</label><select id="pState" class="input">' +
        ["available", "reserved", "rented", "sold"].concat(v.state === "closed" ? ["closed"] : [])
          .map(function (k) {
            return '<option value="' + k + '"' + (v.state === k ? " selected" : "") + ">" + PSTATE[k] + "</option>";
          }).join("") +
      "</select></div>" +
    "</div>" +
    '<div class="grid2">' +
      '<div class="field"><label for="pLic">رقم ترخيص الإعلان</label>' +
        '<input id="pLic" class="input ltr" value="' + esc(v.ad_license_no || "") + '" placeholder="7200034512"></div>' +
      '<div class="field"><label for="pExp">انتهاء الترخيص</label>' +
        '<input id="pExp" class="input" type="date" value="' + esc(v.ad_license_expiry || "") + '"></div>' +
    "</div>" +
    '<p class="hint" style="margin-bottom:14px">بدون رقم ترخيص ساري لن يعرض البوت هذا العقار على أي عميل — حمايةً لك نظامياً.</p>' +
    '<div class="field"><span class="flabel">تفاصيل العقار <span class="opt">(اختياري — يستفيد منها البوت في ردوده)</span></span>' +
    '<div id="pdBox" class="pd-edit"></div></div>' +
    '<button class="btn" id="pSave">' + (p ? "حفظ التعديلات" : "أضف العقار") + "</button>" +
    '<div id="pMsg"></div>');

  if (p) $("#pMatches").onclick = function () { openPropMatches(p); };
  var det = JSON.parse(JSON.stringify(v.details || {}));
  var pdPaint = function () {
    $("#pdBox").innerHTML = pdHtml(det, $("#pType").value, $("#pDeal").value);
    pdWire($("#pdBox"), det, $("#pType").value, $("#pDeal").value);
  };
  $("#pType").onchange = pdPaint; $("#pDeal").onchange = pdPaint;
  pdPaint();
  $("#pSave").onclick = function () {
    var b = this;
    if (!$("#pCity").value.trim()) { note("#pMsg", "اكتب المدينة — نفس اسم الحي موجود في أكثر من مدينة.", "err"); return; }
    b.disabled = true; note("#pMsg", "", "");
    call({
      action: "property_save",
      property: {
        id: p ? p.id : undefined,
        title: $("#pTitle").value, deal_type: $("#pDeal").value,
        property_type: $("#pType").value, district: $("#pDistrict").value, city: $("#pCity").value.trim(),
        price: $("#pPrice").value, rooms: $("#pRooms").value,
        state: $("#pState").value, ad_license_no: $("#pLic").value,
        ad_license_expiry: $("#pExp").value,
        details: pdClean(det, $("#pType").value, $("#pDeal").value),
      },
    }).then(function () {
      return call({ action: "properties" });
    }).then(function (r) {
      S.props = r.properties || [];
      renderStock(); renderToday(); closeSheet();
    }).catch(function (e) { note("#pMsg", e.message, "err"); b.disabled = false; });
  };
}

/* ==========================================================================
   المكاتب — مشغّل المنصة
   ========================================================================== */
// حالة المكتب كما يعيشها عميله: هل المساعد يرد ويعرض فعلاً؟
// blockers = شي يوقف الخدمة أو ينتظر إجراء من المدير (هذي فقط «يحتاج إجراء») ·
// notes = تذكير ما يوقف الخدمة (شروط ما انقبلت، فال قربت تنتهي، مزود انتقالي)
function officeStatus(o) {
  if (o.active === false) return { key: "off", label: "موقوف", cls: "mute", blockers: [], notes: [] };
  var f = falOf(o), blockers = [], notes = [];
  if (f.state === "pending") blockers.push("رخصة فال بانتظار تحققك — المساعد ما يرد على عملائه");
  else if (f.state === "rejected") blockers.push("رخصة فال مرفوضة — المساعد ما يرد على عملائه");
  else if (f.state === "expired") blockers.push("رخصة فال منتهية — ما تُعرض عقاراته");
  if (!o.wa_linked) blockers.push("واتساب غير مربوط — ما توصله رسائل العملاء");
  if (o.fal_request) blockers.push("طلب تعديل رخصة ينتظرك");
  if (falSoon(f)) notes.push("فال تنتهي " + inDaysAr(f.days_left));
  if (o.terms_ok === false) notes.push("صاحب المكتب ما وافق على الشروط بعد");
  if (o.wa_provider === "ultramsg") notes.push("على مزوّد واتساب انتقالي");
  return blockers.length
    ? { key: "attn", label: "يحتاج إجراء", cls: "hot", blockers: blockers, notes: notes }
    : { key: "on", label: "شغّال", cls: "ok", blockers: blockers, notes: notes };
}
// للنقطة في القائمة والفلتر: الأسباب اللي توقف الخدمة فقط
function officeIssues(o) { return officeStatus(o).blockers; }

function officeMatches(o) {
  var f = S.officeFilter;
  if (f === "attn" && !officeIssues(o).length) return false;
  if (f === "on" && o.active === false) return false;
  if (f === "off" && o.active !== false) return false;
  var q = (S.officeQuery || "").trim().toLowerCase();
  if (!q) return true;
  return [o.name, o.code, o.license_no].some(function (v) { return String(v || "").toLowerCase().indexOf(q) > -1; });
}

function renderOffices() {
  if (!S.isSuper) return;
  var active = S.offices.filter(function (o) { return o.active !== false; }).length;
  var attn = S.offices.filter(function (o) { return officeIssues(o).length; }).length;
  $("#officesCount").textContent = S.offices.length + " مكتب · " + (active - attn) + " شغّال" +
    (attn ? " · " + attn + " يحتاج إجراء" : "");
  $("#navOfficesDot").hidden = attn === 0;

  var host = $("#officesList");
  var list = S.offices.filter(officeMatches);
  if (!S.offices.length) { host.innerHTML = state(ICON.home, "لا يوجد مكتب", "أضف أول مكتب لتبدأ."); return; }
  if (!list.length) { host.innerHTML = state(ICON.home, "ما فيه نتائج", "غيّر البحث أو الفلتر."); return; }
  host.innerHTML = "";
  list.forEach(function (o) {
    var st = officeStatus(o);
    var sub = (o.leads || 0) + " عميل · " + (o.props || 0) + " عقار" + (o.wa_number ? ' · <span class="ltr num">' + esc(fmtPhone(o.wa_number)) + "</span>" : "");
    var tags = '<span class="tag ' + st.cls + '">' + st.label + "</span>" +
      (o.voice ? '<span class="tag brand">الصوتيات</span>' : "");
    // السبب مكتوب بدل «يحتاج انتباه» العامة
    var why = st.blockers.map(function (t) { return '<span class="s why hot">' + esc(t) + "</span>"; }).join("") +
      (st.notes.length ? '<span class="s why">' + esc(st.notes.join(" · ")) + "</span>" : "");
    var row = el("div", "row static office-row" + (st.key === "attn" ? " needs" : ""),
      '<div class="main"><span class="t">' + esc(o.name) + "</span>" +
      '<span class="s fal-line">' + tags + "</span>" + why +
      '<span class="s">' + sub + "</span>" +
      '<span class="s mute-s">' + esc(o.code) + " · فال " + '<span class="ltr num">' + esc(o.license_no || "—") + "</span></span></div>");
    var end = el("div", "end");
    var bOpen = el("button", "btn sm", "ادخل");
    var bEdit = el("button", "btn ghost sm", "تعديل");
    bOpen.title = "افتح عملاء المكتب وعقاراته وإعداداته";
    bOpen.onclick = function () { switchOffice(o, bOpen); };
    bEdit.onclick = function () { openOffice(o); };
    end.appendChild(bOpen); end.appendChild(bEdit);
    row.appendChild(end);
    host.appendChild(row);
  });
}

/* ==========================================================================
   لوحة المنصة — للمدير فقط
   ========================================================================== */
function setMode(m) {
  S.mode = m;
  var tabs = document.querySelectorAll(".nav button[data-mode]");
  for (var i = 0; i < tabs.length; i++) tabs[i].hidden = tabs[i].dataset.mode !== m;
  var inside = S.isSuper && m === "office";
  $("#inOffice").hidden = !inside;
  if (inside) $("#inOfficeName").textContent = S.me.office.name;
  document.body.classList.toggle("in-office", inside);
  document.body.classList.toggle("platform", m === "platform");
  paintHeader();
}

function exitOffice() {
  S.curOffice = null; S.pre = null; S.month = {};
  S.me.office = S.own; S.leads = []; S.team = []; S.props = []; S.status = S.pstatus;
  closeSheet();
  setMode("platform");
  renderHome(); renderOffices();
  show("s-home");
  loadAdminLog();
}

function refreshPlatform() {
  return Promise.all([call({ action: "offices_list" }), call({ action: "settings_status" })]).then(function (r) {
    S.offices = r[0].offices || S.offices;
    if (!S.curOffice) { S.pstatus = r[1]; }
    renderOffices(); renderPlatform(); renderHome();
  });
}

var MODEL_AR = { "gpt-6-luna": "GPT-6 Luna", "gpt-4o-mini": "GPT-4o mini" };

function renderHome() {
  if (!S.isSuper) return;
  paintHeader();
  var ps = S.pstatus || {};
  var act = S.offices.filter(function (o) { return o.active !== false; });
  var u = S.usage[riyadhMonth(0)];
  var t = (u && u.totals) || null;
  $("#homeStats").innerHTML =
    stat(act.length, "مكتب شغّال", act.length ? "br" : "mute") +
    stat(S.signupsNew || 0, "طلب انضمام جديد", S.signupsNew ? "hot" : "mute") +
    stat(t ? n0(t.new_customers) : "…", "عميل جديد هالشهر", t && n0(t.new_customers) ? "ok" : "mute") +
    stat(t ? sar(t.cost_usd) : "…", "تكلفة الشهر (ريال)", "mute");

  var items = [];
  S.offices.forEach(function (o) {
    if (o.active === false) return;
    var f = falOf(o);
    if (o.fal_request) items.push({ kind: "hot", icon: ICON.inbox, title: "طلب تعديل رخصة: " + o.name,
      body: o.fal_request.note || "صاحب المكتب رفع رخصة جديدة", why: "طابقها مع استعلام الهيئة ← تعديل المكتب",
      go: function () { openOffice(o); } });
    if (f.state === "pending" || f.state === "rejected" || f.state === "expired") {
      items.push({ kind: f.state === "expired" ? "warn" : "hot", icon: ICON.alert,
        title: o.name + ": " + (FAL_STATE[f.state] || FAL_STATE.pending)[0],
        body: f.state === "expired" ? "المساعد يستقبل الطلبات بلا عرض عقارات" : "المساعد ما يرد على عملاء المكتب",
        why: "تعديل المكتب ← رخصة فال", go: function () { openOffice(o); } });
    } else if (falSoon(f)) {
      items.push({ kind: "warn", icon: ICON.clock, title: o.name + ": فال تنتهي " + inDaysAr(f.days_left),
        body: "ذكّر المكتب يجدّد ويرسل الرخصة الجديدة", why: "تعديل المكتب ← رخصة فال", go: function () { openOffice(o); } });
    }
    if (!o.wa_linked) items.push({ kind: "warn", icon: ICON.wa, title: o.name + ": واتساب غير مربوط",
      body: "المساعد ما يستقبل رسائل عملاء هالمكتب", why: "تعديل المكتب ← ربط الواتساب", go: function () { openOffice(o); } });
  });
  if (S.signupsNew > 0) items.unshift({ kind: "", icon: ICON.inbox,
    title: S.signupsNew + (S.signupsNew === 1 ? " طلب انضمام جديد" : " طلبات انضمام جديدة"),
    body: "مكاتب تنتظر تواصلك، ومعها صورة رخصة فال", why: "الطلبات", go: function () { show("s-signups"); } });
  if (!ps.openai) items.unshift({ kind: "hot", icon: ICON.key, title: "مفتاح الذكاء الاصطناعي ناقص",
    body: "المساعد ما يقدر يفهم رسائل العملاء", why: "المنصة ← الربط والمفاتيح", go: function () { show("s-platform"); } });
  if (!ps.telegram) items.push({ kind: "warn", icon: ICON.tg, title: "بوت تيليجرام غير مضبوط",
    body: "ما توصل تنبيهات تيليجرام للمكاتب ولا لك", why: "المنصة ← الربط والمفاتيح", go: function () { show("s-platform"); } });
  else if (ps.operator_tg === false) items.push({ kind: "warn", icon: ICON.tg, title: "تنبيهات المنصة ما توصلك",
    body: "اربط محادثتك الخاصة في بوت تيليجرام عشان يوصلك كل طلب انضمام وكل عطل", why: "يحتاج رابط ربط لمرة وحدة من بوت مقصد",
    go: function () { show("s-platform"); } });
  paintAttn($("#homeAttn"), items, "كل المكاتب شغّالة وما فيه طلب ينتظرك.");
  $("#navHomeDot").hidden = !items.some(function (x) { return x.kind === "hot"; });

  var dot = function (ok, label, okText, badText) {
    return "<div><dt>" + esc(label) + "</dt><dd>" + (ok ? '<span class="tag ok">' + esc(okText || "جاهز") + "</span>"
      : '<span class="tag danger">' + esc(badText || "ناقص") + "</span>") + "</dd></div>";
  };
  $("#homeServices").innerHTML =
    dot(ps.openai, "فهم الرسائل", MODEL_AR[ps.ai_model] || ps.ai_model || "جاهز") +
    dot(ps.telegram, "تيليجرام") +
    dot(ps.meta, "واتساب الرسمي (ميتا)", "مربوط", "غير مربوط") +
    dot(ps.login_platform, "الدخول عبر رقم المنصة", "جاهز", "عبر رقم المكتب");
}

function renderPlatform() {
  if (!S.isSuper) return;
  var s = S.pstatus || {};
  $("#aiModel").value = s.ai_model || "gpt-4o-mini";
  $("#aiEffort").value = s.ai_reasoning || "low";
  var mark = function (id, ok) {
    var n = $(id); n.value = "";
    n.placeholder = ok ? "••••••  محفوظ ✓  (اتركه فارغاً لعدم التغيير)" : "غير مضبوط — الصق القيمة";
  };
  mark("#kOpenai", s.openai); mark("#kTg", s.telegram); mark("#kMetaSecret", s.meta);
  $("#kMetaVerify").value = "";
  $("#kMetaVerify").placeholder = s.meta ? "محفوظ ✓ (اتركه فارغاً لعدم التغيير)" : "اختر أي كلمة سرية";
  $("#kHook").value = s.meta_webhook || "";
  mark("#kPlatTok", s.platform_token);
  $("#kPlatId").value = s.platform_phone_id || "";
  $("#kPlatNum").value = s.platform_number ? fmtPhone(s.platform_number) : "";
}

function saveAi(b) {
  b.disabled = true; note("#aiMsg", "", "");
  call({ action: "platform_save", ai_model: $("#aiModel").value, ai_reasoning: $("#aiEffort").value })
    .then(function () { note("#aiMsg", "حُفظ — يطبّق على الرسائل الجاية مباشرة", "ok"); return refreshPlatform(); })
    .then(function () { loadAdminLog(); })
    .catch(function (e) { note("#aiMsg", e.message, "err"); })
    .then(function () { b.disabled = false; });
}

// أسماء الحقول في السجل بالعربي
var FIELD_AR = {
  name: "الاسم", code: "الرمز", license_no: "رقم الرخصة", wa_provider: "مزوّد واتساب", wa_instance: "معرّف واتساب",
  wa_token: "توكن واتساب", wa_number: "رقم واتساب", telegram_chat_id: "تيليجرام", msg_quota: "حد الحماية اليومي",
  active: "التفعيل", voice: "الصوتيات", from_signup: "من طلب انضمام", phone: "الجوال", role: "الدور",
  title: "اسم العقار", price: "السعر", district: "الحي", rooms: "الغرف", state: "الحالة", deal_type: "نوع الطلب",
  property_type: "نوع العقار", ad_license_no: "ترخيص الإعلان", ad_license_expiry: "انتهاء الترخيص",
  openai_key: "مفتاح OpenAI", telegram_token: "توكن البوت", meta_app_secret: "مفتاح ميتا", meta_verify_token: "رمز تحقق ميتا",
  platform_wa_phone_id: "معرّف رقم المنصة", platform_wa_token: "توكن رقم المنصة", platform_wa_number: "رقم المنصة", otp_template: "قالب الدخول",
  price_ai_in: "الأسعار", price_ai_cached: "الأسعار", price_ai_out: "الأسعار", price_otp: "الأسعار", my_phone: "رقمي",
};

function loadAdminLog() {
  if (!S.isSuper) return Promise.resolve();
  return call({ action: "admin_log", limit: 40 }).then(function (r) {
    var log = r.log || [], host = $("#adminLog");
    if (!log.length) { host.innerHTML = '<p class="hint">ما فيه تعديلات مسجّلة بعد.</p>'; return; }
    host.innerHTML = '<ul class="alog">' + log.map(function (x) {
      var d = x.detail || {};
      var seen = {}, fields = (d.fields || []).map(function (k) { return FIELD_AR[k] || null; })
        .filter(function (v) { if (!v || seen[v]) return false; seen[v] = 1; return true; }).slice(0, 4);
      return "<li><b>" + esc(d.label || d.action) + "</b>" +
        (d.what ? " · " + esc(d.what) : "") + (d.office ? " · " + esc(d.office) : "") +
        (fields.length ? '<span class="f">' + esc(fields.join("، ")) + "</span>" : "") +
        '<span class="w">' + esc(d.by || "") + " · " + esc(ago(x.created_at)) + "</span></li>";
    }).join("") + "</ul>";
  }).catch(function (e) { $("#adminLog").innerHTML = '<p class="hint">' + esc(e.message) + "</p>"; });
}

// رابط موقّع لملف خاص (صورة رخصة): يُفتح في نافذة جديدة تُحجز قبل الطلب عشان ما يمنعها المتصفح
function openSigned(body, btn) {
  var w = null;
  try { w = window.open("", "_blank"); } catch (e) { w = null; }
  if (btn) btn.disabled = true;
  return call(body).then(function (r) {
    if (w) w.location.href = r.url; else location.href = r.url;
  }).catch(function (e) {
    if (w) try { w.close(); } catch (x) {}
    alert(e.message);
  }).then(function () { if (btn) btn.disabled = false; });
}

/* ---------- الاستهلاك والتكلفة — مشغّل المنصة ---------- */
function usageKeySel() { return S.usageSel === "prev" ? riyadhMonth(-1) : riyadhMonth(0); }
function sar(usd) { return (n0(usd) * 3.75).toFixed(2); }

function loadUsage(force) {
  if (!S.isSuper) return;
  var host = $("#usageBody");
  var key = usageKeySel();
  if (S.usage[key] && !force) { renderUsage(S.usage[key]); return; }
  if (!S.usage[key]) host.innerHTML = '<div class="skel" style="height:160px"></div>';
  call({ action: "platform_usage", month: key }).then(function (r) {
    S.usage[key] = r;
    if (usageKeySel() === key) renderUsage(r);
    if (S.mode === "platform" && key === riyadhMonth(0)) renderHome();
  }).catch(function (e) { host.innerHTML = '<p class="hint">' + esc(e.message) + "</p>"; });
}

function renderUsage(r) {
  var t = r.totals || {}, pr = r.prices || {}, rows = r.rows || [];
  var perCust = n0(t.new_customers) ? sar(n0(t.cost_usd) / n0(t.new_customers)) + " ريال" : "—";
  var head = ["المكتب", "عملاء جدد", "مؤهل", "صفقات", "ردود ذكاء", "رموز دخول", "أعطال", "التكلفة (ريال)"];
  var num = function (v) { return '<td class="n">' + n0(v).toLocaleString("en-US") + "</td>"; };
  var html =
    '<div class="stats">' +
      stat(sar(t.cost_usd), "التكلفة التقديرية (ريال)", n0(t.cost_usd) ? "br" : "mute") +
      stat(perCust, "تكلفة العميل الواحد", "mute") +
      stat(n0(t.ai_calls), "ردود الذكاء الاصطناعي", n0(t.ai_calls) ? "br" : "mute") +
      stat(n0(t.otp), "رموز دخول", n0(t.otp) ? "br" : "mute") +
    "</div>" +
    '<div class="tbl" role="region" aria-label="الاستهلاك لكل مكتب" tabindex="0"><table><thead><tr>' +
      head.map(function (x, i) { return "<th" + (i ? ' class="n"' : "") + ">" + x + "</th>"; }).join("") +
    "</tr></thead><tbody>" +
      (rows.length ? rows.map(function (o) {
        return "<tr><td>" + esc(o.name) + (o.active ? "" : ' <span class="tag mute">موقوف</span>') + "</td>" +
          num(o.new_customers) + num(o.qualified) + num(o.deals) + num(o.ai_calls) +
          num(n0(o.otp_platform) + n0(o.otp_office)) + num(o.errors) +
          '<td class="n">' + sar(o.cost_usd) + "</td></tr>";
      }).join("") : '<tr><td colspan="8">لا توجد مكاتب</td></tr>') +
    "</tbody><tfoot><tr><td>الإجمالي</td>" + num(t.new_customers) + num(t.qualified) + num(t.deals) +
      num(t.ai_calls) + num(t.otp) + num(t.errors) + '<td class="n">' + sar(t.cost_usd) + "</td></tr></tfoot></table></div>" +
    '<p class="hint">تقديرية بأسعار ' + esc(pr.updated || "—") + ": الذكاء الاصطناعي " + pr.ai_in + "$ لكل مليون وحدة إدخال (" +
      pr.ai_cached + "$ للمكرر) و" + pr.ai_out + "$ لكل مليون وحدة إخراج، ورمز الدخول " + pr.otp +
      "$ للرسالة من رقم المنصة. ردود واتساب على العملاء مجانية لأن العميل هو اللي بدأ المحادثة.</p>" +
    '<details class="prices"><summary>تعديل الأسعار</summary><div class="grid2">' +
      priceField("prIn", "إدخال الذكاء ($ لكل مليون)", pr.ai_in) +
      priceField("prCached", "إدخال مكرر ($ لكل مليون)", pr.ai_cached) +
      priceField("prOut", "إخراج الذكاء ($ لكل مليون)", pr.ai_out) +
      priceField("prOtp", "رمز الدخول ($ للرسالة)", pr.otp) +
    '</div><button class="btn ghost" id="btnSavePrices" type="button">حفظ الأسعار</button><div id="pricesMsg"></div></details>';
  $("#usageBody").innerHTML = html;
  $("#btnSavePrices").onclick = function () {
    var b = this; b.disabled = true; note("#pricesMsg", "", "");
    call({ action: "save_settings", settings: {
      price_ai_in: $("#prIn").value, price_ai_cached: $("#prCached").value,
      price_ai_out: $("#prOut").value, price_otp: $("#prOtp").value,
    } }).then(function () {
      S.usage = {}; loadUsage(true);
    }).catch(function (e) { note("#pricesMsg", e.message, "err"); b.disabled = false; });
  };
}
function priceField(id, label, v) {
  return '<div class="field"><label for="' + id + '">' + label + '</label>' +
    '<input id="' + id + '" class="input ltr" inputmode="decimal" value="' + esc(v == null ? "" : v) + '"></div>';
}

function switchOffice(o, btn) {
  btn.disabled = true; btn.textContent = "…";
  S.curOffice = o.id; S.pre = null; S.month = {};
  Promise.all([
    call({ action: "leads" }),
    call({ action: "properties" }),
    call({ action: "settings_status" }),
  ]).then(function (res) {
    S.leads = res[0].leads || [];
    S.team = res[0].team || [];
    S.props = res[1].properties || [];
    S.status = res[2];
    S.me.office = { id: o.id, name: o.name, code: o.code, license_no: o.license_no,
                    msg_quota: o.msg_quota, wa_number: o.wa_number, wa_provider: o.wa_provider, fal: o.fal };
    setMode("office");
    renderToday(); renderLeads(); renderStock(); renderSettings();
    show("s-today");
  }).catch(function (e) {
    S.curOffice = null;
    alert(e.message);
  }).then(function () {
    btn.disabled = false; btn.textContent = "ادخل";
  });
}

function openOffice(o, prefill) {
  var v = o || Object.assign({ msg_quota: 35, wa_provider: "cloud" }, prefill || {});
  openSheet(o ? "تعديل: " + o.name : "مكتب جديد",
    '<div class="field"><label for="oName">اسم المكتب</label>' +
      '<input id="oName" class="input" value="' + esc(v.name || "") + '" placeholder="مكتب الأفق العقاري"></div>' +
    '<div class="grid2">' +
      '<div class="field"><label for="oCode">رمز المكتب</label>' +
        '<input id="oCode" class="input ltr" value="' + esc(v.code || "") + '" placeholder="OFFICE_02"></div>' +
      '<div class="field"><label for="oLic">رقم رخصة فال</label>' +
        '<input id="oLic" class="input ltr" value="' + esc(v.license_no || "") + '" placeholder="1200012345"></div>' +
    "</div>" +
    '<div class="field"><label for="oProv">مزوّد واتساب</label><select id="oProv" class="input">' +
      '<option value="cloud"' + (v.wa_provider === "cloud" ? " selected" : "") + ">واتساب الرسمي من ميتا</option>" +
      // المزوّد الانتقالي مخفي للمكاتب الجديدة (الإطلاق على واتساب الرسمي فقط)، ويبقى لمكتب مربوط عليه حالياً
      // حتى لا يتحول بالغلط عند حفظ أي تعديل
      (o && v.wa_provider === "ultramsg"
        ? '<option value="ultramsg" selected>UltraMsg — انتقالي (انقله لواتساب الرسمي)</option>' : "") +
    "</select></div>" +
    '<div class="grid2">' +
      '<div class="field"><label for="oInst" id="oInstLbl"></label>' +
        '<input id="oInst" class="input ltr" value="' + esc(v.wa_instance || "") + '"></div>' +
      '<div class="field"><label for="oTok" id="oTokLbl"></label>' +
        '<input id="oTok" class="input ltr" type="password" autocomplete="off" placeholder="' +
        (o ? "اتركه فارغاً لعدم التغيير" : "") + '"></div>' +
    "</div>" +
    '<div class="grid2">' +
      '<div class="field"><label for="oNum">رقم واتساب المكتب</label>' +
        '<input id="oNum" class="input ltr" type="tel" inputmode="tel" value="' + esc(v.wa_number ? fmtPhone(v.wa_number) : "") + '">' +
        '<p class="hint" id="oNumHint"></p></div>' +
      '<div class="field"><label for="oQuota">حد الحماية اليومي</label>' +
        '<input id="oQuota" class="input" type="number" inputmode="numeric" value="' + esc(v.msg_quota || 35) + '">' +
        '<p class="hint">أقصى ردود آلية لنفس العميل خلال ٢٤ ساعة (أقله ٣٥). مو معيار التسليم: المساعد يسلّم لما يكتمل الطلب أو يحتاج العميل موظف.</p></div>' +
    "</div>" +
    '<div class="field"><label for="oTg">معرّف محادثة تيليجرام</label>' +
      '<input id="oTg" class="input ltr" value="' + esc(v.telegram_chat_id || "") + '" placeholder="-100..."></div>' +
    '<label class="toggle" for="oVoice"><input id="oVoice" type="checkbox"' + (v.voice ? " checked" : "") + '>' +
      "<span>تحويل الرسائل الصوتية لنص — المساعد يفهم صوتيات العملاء (تكلفة بسيطة لكل دقيقة).</span></label>" +
    '<label class="toggle" for="oActive"><input id="oActive" type="checkbox"' + (v.active === false ? "" : " checked") + '>' +
      "<span>المكتب فعّال — البوت يرد على رقمه، وموظفوه يقدرون يدخلون. أزل العلامة لإيقافه.</span></label>" +
    '<div class="btnrow"><button class="btn" id="oSave">' + (o ? "حفظ" : "أضف المكتب") + "</button>" +
      (o ? '<button class="btn ghost" id="oTest" type="button">رسالة اختبار لجوالي</button>' : "") + "</div>" +
    '<div id="oMsg"></div>' +
    (o ? "" : '<p class="hint">بعد الإضافة: افتح المكتب من «تعديل» وتحقق من رخصة فال — المساعد ما يرد على عملائه قبلها.</p>') +
    (o ? '<div class="block" style="margin-top:22px" id="falBlock"><h3>رخصة فال</h3>' +
         '<div id="falFiles"></div><div id="falBody"><div class="skel skel-row"></div></div></div>' : "") +
    (o ? '<div class="block" style="margin-top:22px" id="staffBlock"><h3>موظفو المكتب</h3>' +
         '<div class="rows" id="staffList"><div class="skel skel-row"></div></div>' +
         '<div id="staffForm" class="staff-form"></div></div>' : ""));

  var numHint = function () {
    var p = normPhone($("#oNum").value), h = $("#oNumHint");
    if (!$("#oNum").value.trim()) { h.className = "hint"; h.textContent = "الرقم اللي يراسله العملاء."; return; }
    var bad = phoneIssue(p);
    h.className = "hint " + (bad ? "warn" : "good");
    h.innerHTML = bad ? esc(bad)
      : '<span class="ltr num">' + esc(fmtPhone(p)) + '</span> · <a href="' + waLink(p) +
        '" target="_blank" rel="noopener">تأكد منه في واتساب</a>';
  };
  numHint();
  $("#oNum").oninput = numHint;

  var provLabels = function () {
    var cloud = $("#oProv").value === "cloud";
    $("#oInstLbl").textContent = cloud ? "معرّف رقم الهاتف (Phone number ID)" : "معرّف UltraMsg";
    $("#oTokLbl").textContent = cloud ? "رمز الوصول (Access token)" : "توكن UltraMsg";
    $("#oInst").placeholder = cloud ? "109876543210987" : "instance190700";
  };
  provLabels();
  $("#oProv").onchange = provLabels;

  $("#oSave").onclick = function () {
    var b = this; note("#oMsg", "", "");
    if ($("#oNum").value.trim()) {
      var numBad = phoneIssue(normPhone($("#oNum").value));
      if (numBad) { note("#oMsg", "رقم واتساب المكتب: " + numBad, "err"); $("#oNum").focus(); return; }
    }
    b.disabled = true;
    call({
      action: "office_save",
      office: {
        id: o ? o.id : undefined,
        name: $("#oName").value, code: $("#oCode").value, license_no: $("#oLic").value,
        wa_provider: $("#oProv").value,
        wa_instance: $("#oInst").value, wa_token: $("#oTok").value,
        wa_number: normPhone($("#oNum").value), telegram_chat_id: $("#oTg").value,
        msg_quota: $("#oQuota").value,
        active: $("#oActive").checked,
        voice: $("#oVoice").checked,
        from_signup: v.from_signup || undefined,
      },
    }).then(function (r) {
      S.offices = r.offices || S.offices;
      // من طلب انضمام: صاحب الطلب يصير صاحب المكتب ويقدر يدخل برقمه مباشرة
      if (!o && v.from_signup && r.office && v.owner_phone) {
        return call({ action: "staff_save", staff: {
          office_id: r.office.id, name: v.owner_name, phone: v.owner_phone, role: "owner" } })
          .catch(function (e) { alert("أُنشئ المكتب، لكن تعذّر إضافة صاحبه: " + e.message); })
          .then(function () { loadSignups(); });
      }
    }).then(function () {
      renderOffices(); renderHome(); loadAdminLog(); closeSheet();
    }).catch(function (e) { note("#oMsg", e.message, "err"); b.disabled = false; });
  };

  if ($("#oTest")) $("#oTest").onclick = function () {
    var b = this; b.disabled = true; note("#oMsg", "جاري الإرسال…", "ok");
    call({ action: "test_whatsapp", office_id: o.id })
      .then(function (r) { note("#oMsg", r.ok ? "وصلت رسالة الاختبار لجوالك من رقم المكتب" : "ما وصلت — راجع بيانات ربط الواتساب", r.ok ? "ok" : "err"); })
      .catch(function (e) { note("#oMsg", e.message, "err"); })
      .then(function () { b.disabled = false; });
  };

  if (o) { falFiles(o); falPanel(o); staffPanel(o); }
}

// ملفات الرخصة اللي رفعها المكتب: صورة التسجيل، وطلب التعديل (ينتظر المدير)
function falFiles(o) {
  var h = $("#falFiles");
  if (!h) return;
  var parts = [];
  if (o.fal_request) {
    parts.push('<div class="msg warn falreq">' + svg(ICON.inbox) + "<span><b>طلب تعديل من المكتب</b> " +
      esc(ago(o.fal_request.at)) + (o.fal_request.by ? " · " + esc(o.fal_request.by) : "") +
      (o.fal_request.note ? "<br>" + esc(o.fal_request.note) : "") +
      '<br>افتح الرخصة الجديدة، غيّر الرقم فوق إذا تغيّر، وتحقق منها من الهيئة، ثم أغلق الطلب.</span></div>' +
      '<div class="btnrow"><button class="btn ghost sm" type="button" id="frSee">الرخصة الجديدة</button>' +
      '<button class="btn ghost sm" type="button" id="frClose">تم — أغلق الطلب</button></div>');
  }
  if (o.has_signup_proof) {
    parts.push('<div class="btnrow"><button class="btn ghost sm" type="button" id="fsSee">صورة الرخصة من التسجيل</button></div>');
  }
  h.innerHTML = parts.join("");
  if ($("#frSee")) $("#frSee").onclick = function () { openSigned({ action: "signup_proof", office_id: o.id, kind: "request" }, this); };
  if ($("#fsSee")) $("#fsSee").onclick = function () { openSigned({ action: "signup_proof", office_id: o.id }, this); };
  if ($("#frClose")) $("#frClose").onclick = function () {
    var b = this; b.disabled = true;
    call({ action: "fal_request_close", office_id: o.id }).then(function (r) {
      S.offices = r.offices || S.offices; o.fal_request = null; falFiles(o); renderOffices(); renderHome(); loadAdminLog();
    }).catch(function (e) { alert(e.message); b.disabled = false; });
  };
}

/* ---------- رخصة فال: تحقق يدوي من استعلام الهيئة — مشغّل المنصة ---------- */
// الصورة تُصغَّر في الجهاز قبل الرفع (أطول ضلع ٢٠٠٠ بكسل، JPG) — لقطة الشاشة تبقى مقروءة وخفيفة
function shrinkImage(file) {
  return new Promise(function (res, rej) {
    if (!file || !/^image\//.test(file.type || "")) { rej(new Error("اختر صورة (لقطة شاشة PNG أو JPG)")); return; }
    var fr = new FileReader();
    fr.onerror = function () { rej(new Error("تعذّرت قراءة الصورة")); };
    fr.onload = function () {
      var im = new Image();
      im.onerror = function () { rej(new Error("الملف مو صورة صالحة")); };
      im.onload = function () {
        var k = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.naturalWidth * k));
        c.height = Math.max(1, Math.round(im.naturalHeight * k));
        var g = c.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(im, 0, 0, c.width, c.height);
        var q = 0.88, out = c.toDataURL("image/jpeg", q);
        while (out.length > 2.6e6 && q > 0.5) { q -= 0.12; out = c.toDataURL("image/jpeg", q); }
        res(out);
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function falPanel(o) {
  var data = null, shot = null, renewing = false;

  function load() {
    return call({ action: "fal_get", office_id: o.id }).then(function (r) { data = r; paint(); });
  }

  // الحالة الآن بجملة وحدة: وش يصير لعملاء المكتب
  function nowLine(f) {
    if (f.state === "ok") {
      return "متحقق منها. تنتهي " + gDate(f.expires_on) + " (" + hDate(f.expires_on) + ")" +
        (f.days_left <= 30 ? " — " + inDaysAr(f.days_left) + "." : ".");
    }
    if (f.state === "expired") {
      return "انتهت " + gDate(f.expires_on) + ". المساعد يستقبل الطلبات بلا عرض عقارات لين تتحقق من الرخصة المجددة.";
    }
    if (f.state === "rejected") {
      return "غير معتمدة: " + (f.note || "—") + ". المساعد متوقف لعملاء المكتب.";
    }
    return "المساعد متوقف لعملاء هذا المكتب لين تتحقق من رخصته. يرد بس على أرقام موظفيه ورقمك — للتجربة.";
  }

  function paint() {
    var f = data.fal, h = $("#falBody");
    if (!h) return;
    var showForm = f.state !== "ok" || renewing;
    h.innerHTML =
      '<div class="fal-now">' + falTag(f) + "<p>" + esc(nowLine(f)) + "</p>" +
        (f.state === "ok" && !renewing
          ? '<div class="btn-row">' +
              (f.has_proof ? '<button class="btn ghost sm" type="button" id="falSee">صورة التحقق</button>' : "") +
              '<button class="btn ghost sm" type="button" id="falRenew">تحقق من تجديد</button></div>'
          : "") +
      "</div>" +
      (showForm ? form(data.license_no) : "") +
      '<div id="falMsg"></div>' +
      history();

    if ($("#falSee")) $("#falSee").onclick = function () { openProof(null, this); };
    if ($("#falRenew")) $("#falRenew").onclick = function () { renewing = true; shot = null; paint(); };
    var hs = h.querySelectorAll("[data-proof]");
    for (var i = 0; i < hs.length; i++) {
      (function (b) { b.onclick = function () { openProof(b.getAttribute("data-proof"), b); }; })(hs[i]);
    }
    if (showForm) wire();
  }

  function form(lic) {
    return '<ol class="fal-steps">' +
      "<li><b>افتح استعلام الهيئة العامة للعقار وابحث برقم الرخصة</b>" +
        '<div class="fal-lic"><span class="ltr num" id="falLicNo">' + esc(lic) + "</span>" +
          '<button class="btn ghost sm" type="button" id="falCopy">انسخ الرقم</button></div>' +
        '<a class="btn ghost" href="' + REGA_QUERY + '" target="_blank" rel="noopener">افتح استعلام الهيئة</a>' +
        '<p class="hint">اختر «رقم ترخيص الوسيط العقاري»، والصق الرقم، ثم صوّر شاشة النتيجة كاملة.</p></li>' +
      "<li><b>سجّل اللي يظهر في الهيئة</b>" +
        '<div class="field"><label for="falName">اسم صاحب الرخصة كما في الهيئة</label>' +
          '<input id="falName" class="input" autocomplete="off" value="' + esc(data.fal.holder_name || "") + '"></div>' +
        '<div class="field"><label for="falExp">تاريخ انتهاء الرخصة</label>' +
          '<input id="falExp" class="input ltr" type="date" min="' + riyadhDay() + '">' +
          '<p class="hint" id="falExpHint">إذا الهيئة تعرضه هجري، اختر اليوم اللي يقابله — يظهر لك هنا بالهجري للمطابقة.</p></div>' +
        '<div class="field"><span class="flabel">صورة نتيجة الاستعلام</span>' +
          '<input id="falImg" class="vh" type="file" accept="image/*">' +
          '<div class="fal-pickrow"><label class="btn ghost fal-pick" for="falImg" id="falPick">اختر لقطة الشاشة</label></div>' +
          '<div class="fal-prev" id="falPrev"></div></div></li>' +
      "<li><b>تأكد من الثلاثة</b>" +
        '<label class="toggle" for="falC1"><input id="falC1" type="checkbox"><span>حالة الرخصة في الهيئة «سارية»</span></label>' +
        '<label class="toggle" for="falC2"><input id="falC2" type="checkbox"><span>الاسم يطابق السجل التجاري للمكتب</span></label>' +
        '<label class="toggle" for="falC3"><input id="falC3" type="checkbox"><span>تاريخ الانتهاء اللي سجّلته نفس اللي في الهيئة</span></label></li>' +
    "</ol>" +
    '<div class="btn-row"><button class="btn" type="button" id="falOk" disabled>تم التحقق</button>' +
      '<button class="btn ghost" type="button" id="falNo">رفض</button>' +
      (renewing ? '<button class="btn ghost" type="button" id="falCancel">إلغاء</button>' : "") + "</div>" +
    '<div class="fal-rej" id="falRej" hidden>' +
      '<div class="field"><label for="falWhy">سبب الرفض — يوصل لمجموعة المكتب</label>' +
        '<textarea id="falWhy" class="input" rows="2" maxlength="300" placeholder="مثال: الرخصة موقوفة في الهيئة، أو الاسم ما يطابق السجل التجاري"></textarea></div>' +
      '<button class="btn danger" type="button" id="falRejOk">تأكيد الرفض — يوقف المساعد لعملاء المكتب</button></div>';
  }

  function ready() {
    var exp = $("#falExp").value;
    return $("#falName").value.trim().length >= 3 && !!exp && exp >= riyadhDay() && !!shot &&
      $("#falC1").checked && $("#falC2").checked && $("#falC3").checked;
  }

  function wire() {
    var sync = function () { $("#falOk").disabled = !ready(); };
    $("#falCopy").onclick = function () { copyText(data.license_no, this); };
    $("#falName").oninput = sync;
    ["#falC1", "#falC2", "#falC3"].forEach(function (id) { $(id).onchange = sync; });
    $("#falExp").oninput = $("#falExp").onchange = function () {
      var v = this.value, hh = $("#falExpHint");
      if (!v) { hh.className = "hint"; hh.textContent = "إذا الهيئة تعرضه هجري، اختر اليوم اللي يقابله — يظهر لك هنا بالهجري للمطابقة."; }
      else if (v < riyadhDay()) { hh.className = "hint warn"; hh.textContent = "التاريخ فات — الرخصة منتهية وما تُعتمد. اطلب من المكتب يجدّدها."; }
      else { hh.className = "hint good"; hh.textContent = "يوافق " + hDate(v) + " — طابقه مع الهيئة."; }
      sync();
    };
    $("#falImg").onchange = function () {
      var file = this.files && this.files[0];
      shot = null; $("#falPrev").innerHTML = ""; $("#falPick").textContent = "اختر لقطة الشاشة"; sync();
      if (!file) return;
      note("#falMsg", "", "");
      shrinkImage(file).then(function (d) {
        shot = d;
        $("#falPrev").innerHTML = '<img alt="صورة نتيجة الاستعلام" src="' + d + '">';
        $("#falPick").textContent = "غيّر الصورة";
        sync();
      }).catch(function (e) { note("#falMsg", e.message, "err"); });
    };
    if ($("#falCancel")) $("#falCancel").onclick = function () { renewing = false; shot = null; paint(); };
    $("#falNo").onclick = function () { $("#falRej").hidden = false; $("#falWhy").focus(); };
    $("#falOk").onclick = function () {
      var b = this; if (!ready()) return;
      b.disabled = true; note("#falMsg", "", "");
      call({ action: "fal_verify", office_id: o.id, license_no: data.license_no,
        holder_name: $("#falName").value, expires_on: $("#falExp").value, image: shot,
        checks: { active: $("#falC1").checked, name: $("#falC2").checked, expiry: $("#falC3").checked } })
        .then(function (r) { done(r, "تم التحقق — المساعد صار يرد على عملاء المكتب ويعرض عقاراته المرخّصة"); })
        .catch(function (e) { note("#falMsg", e.message, "err"); b.disabled = false; });
    };
    $("#falRejOk").onclick = function () {
      var b = this, why = $("#falWhy").value.trim();
      if (why.length < 3) { note("#falMsg", "اكتب السبب — يوصل للمكتب عشان يعرف وش يصلّح", "err"); $("#falWhy").focus(); return; }
      b.disabled = true; note("#falMsg", "", "");
      call({ action: "fal_reject", office_id: o.id, note: why, image: shot || undefined })
        .then(function (r) { done(r, "انحفظ الرفض ووصل السبب لمجموعة المكتب — المساعد متوقف لعملائه"); })
        .catch(function (e) { note("#falMsg", e.message, "err"); b.disabled = false; });
    };
  }

  function done(r, msg) {
    S.offices = r.offices || S.offices;
    o.fal = r.fal;
    if (S.me && S.me.office && S.me.office.id === o.id) { S.me.office.fal = r.fal; renderSettings(); }
    renewing = false; shot = null;
    renderOffices(); renderToday();
    load().then(function () { note("#falMsg", msg, "ok"); });
  }

  function history() {
    var hs = (data.history || []);
    if (!hs.length) return "";
    return '<h4 class="sub fal-hist-h">سجل التحقق</h4><div class="rows fal-hist">' + hs.map(function (x) {
      var when = gDate(new Date(new Date(x.checked_at).getTime() + 3 * 3600e3).toISOString().slice(0, 10));
      var detail = x.result === "verified"
        ? "تنتهي " + gDate(x.expires_on) + (x.holder_name ? " · " + x.holder_name : "")
        : (x.note || "");
      return '<div class="row static"><div class="main">' +
        '<span class="t">' + (x.result === "verified" ? '<span class="tag ok">تحقق</span> ' : '<span class="tag danger">رفض</span> ') +
          esc(when) + "</span>" +
        '<span class="s">' + esc(detail) + (x.by ? " · بواسطة " + esc(x.by) : "") +
          (x.license_no !== data.license_no ? ' · رقم سابق <span class="ltr num">' + esc(x.license_no) + "</span>" : "") + "</span></div>" +
        (x.has_proof ? '<div class="end"><button class="btn ghost sm" type="button" data-proof="' + esc(x.id) + '">الصورة</button></div>' : "") +
        "</div>";
    }).join("") + "</div>";
  }

  // الصورة من المخزن الخاص برابط مؤقت ٥ دقائق — النافذة تُفتح فوراً عشان ما يمنعها المتصفح
  function openProof(checkId, btn) {
    var w = null;
    try { w = window.open("", "_blank"); } catch (e) { w = null; }
    btn.disabled = true;
    var body = { action: "fal_proof", office_id: o.id };
    if (checkId) body.check_id = Number(checkId);
    call(body).then(function (r) {
      if (w) { w.location.href = r.url; return; }
      $("#falMsg").innerHTML = '<p class="hint"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">افتح صورة التحقق</a></p>';
    }).catch(function (e) {
      if (w) try { w.close(); } catch (x) {}
      note("#falMsg", e.message, "err");
    }).then(function () { btn.disabled = false; });
  }

  load().catch(function (e) { var h = $("#falBody"); if (h) h.innerHTML = '<p class="hint">' + esc(e.message) + "</p>"; });
}

/* ---------- موظفو المكتب: إضافة وتعديل بمراجعة للرقم، وحذف من لم يدخل أبداً ---------- */
var ROLE_LABEL = { owner: "صاحب المكتب", agent: "وسيط", super_admin: "مشغّل المنصة" };
// «يومين» · «٥ أيام» · «١٢ يوماً»
function daysText(iso) {
  var n = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));
  return n === 1 ? "يوم" : n === 2 ? "يومين" : n <= 10 ? n + " أيام" : n + " يوماً";
}

function staffPanel(o) {
  var staff = [];
  // كل الطلبات هنا تخص هذا المكتب، مهما كان المكتب المفتوح في التطبيق
  var run = function (body) {
    var keep = S.curOffice; S.curOffice = o.id;
    return call(body).then(function (r) { S.curOffice = keep; return r; },
                           function (e) { S.curOffice = keep; throw e; });
  };

  function load() {
    return run({ action: "staff_list" }).then(function (r) { staff = r.staff || []; list(); });
  }

  function list() {
    var h = $("#staffList");
    if (!h) return;
    if (!staff.length) {
      h.innerHTML = '<div class="row static"><div class="main"><span class="s">لا يوجد موظفون بعد</span></div></div>';
      return;
    }
    h.innerHTML = staff.map(function (s) {
      var never = !s.last_login_at;
      var stale = never && s.created_at && Date.now() - new Date(s.created_at).getTime() > 2 * 864e5;
      var seen = never
        ? '<span class="tag ' + (stale ? "warn" : "mute") + '">' +
            (stale ? "ما دخل من " + daysText(s.created_at) + " — تأكد من رقمه" : "ما دخل التطبيق بعد") + "</span>"
        : '<span class="s">آخر دخول ' + esc(ago(s.last_login_at)) + "</span>";
      var btns = s.role === "super_admin" ? "" :
        '<div class="end">' +
          (S.isSuper && s.active ? '<button class="btn ghost sm" type="button" data-code="' + esc(s.id) + '">رمز دخول</button>' : "") +
          '<button class="btn ghost sm" type="button" data-edit="' + esc(s.id) + '">تعديل</button>' +
          (never
            ? '<button class="btn ghost sm danger" type="button" data-del="' + esc(s.id) + '">حذف</button>'
            : '<button class="btn ghost sm" type="button" data-act="' + esc(s.id) + '">' + (s.active ? "إيقاف" : "تفعيل") + "</button>") +
        "</div>";
      return '<div class="row static"><div class="main">' +
        '<span class="t">' + esc(s.name) + "</span>" +
        '<span class="s"><span class="ltr num">' + esc(fmtPhone(s.phone)) + "</span> · " + (ROLE_LABEL[s.role] || "وسيط") +
          (s.active ? "" : " · موقوف") + "</span>" + seen + "</div>" + btns + "</div>";
    }).join("");

    staff.forEach(function (s) {
      var bE = h.querySelector('[data-edit="' + s.id + '"]');
      var bD = h.querySelector('[data-del="' + s.id + '"]');
      var bA = h.querySelector('[data-act="' + s.id + '"]');
      var bC = h.querySelector('[data-code="' + s.id + '"]');
      if (bC) bC.onclick = function () { issueStaffCode(s, bC); };
      if (bE) bE.onclick = function () { form(s); $("#staffForm").scrollIntoView({ behavior: "smooth", block: "center" }); };
      if (bD) bD.onclick = function () {
        if (!confirm("حذف «" + s.name + "» (" + fmtPhone(s.phone) + ")؟\nما دخل التطبيق ولا مرة، فالحذف ما يأثر على أي بيانات.")) return;
        bD.disabled = true;
        run({ action: "staff_delete", id: s.id }).then(load).then(function () {
          note("#stMsg", "انحذف «" + s.name + "»", "ok");
        }).catch(function (e) { alert(e.message); bD.disabled = false; });
      };
      if (bA) bA.onclick = function () {
        bA.disabled = true;
        run({ action: "staff_save", staff: { id: s.id, office_id: o.id, name: s.name, phone: s.phone,
          role: s.role, active: !s.active } }).then(load)
          .catch(function (e) { alert(e.message); bA.disabled = false; });
      };
    });
  }

  // نموذج الإضافة أو التعديل
  function form(editing, draft) {
    var d = draft || (editing ? { name: editing.name, phone: fmtPhone(editing.phone), role: editing.role } : { name: "", phone: "", role: "agent" });
    $("#staffForm").innerHTML =
      '<h4 class="sub">' + (editing ? "تعديل: " + esc(editing.name) : "إضافة موظف") + "</h4>" +
      '<div class="grid2">' +
        '<div class="field"><label for="stName">الاسم</label><input id="stName" class="input" value="' + esc(d.name) + '"></div>' +
        '<div class="field"><label for="stPhone">جواله (واتساب)</label>' +
          '<input id="stPhone" class="input ltr" type="tel" inputmode="tel" placeholder="05XXXXXXXX" value="' + esc(d.phone) + '">' +
          '<p class="hint" id="stPhoneHint"></p></div>' +
      "</div>" +
      '<div class="field"><label for="stRole">الدور</label><select id="stRole" class="input">' +
        '<option value="owner"' + (d.role === "owner" ? " selected" : "") + ">صاحب المكتب</option>" +
        '<option value="agent"' + (d.role !== "owner" ? " selected" : "") + ">وسيط</option></select></div>" +
      '<div class="btn-row"><button class="btn" id="stNext" type="button">' + (editing ? "حفظ التعديل" : "راجع الرقم وأضف") + "</button>" +
        (editing ? '<button class="btn ghost" id="stCancel" type="button">إلغاء</button>' : "") + "</div>" +
      '<div id="stMsg"></div>';

    var hint = function () {
      var raw = $("#stPhone").value, p = normPhone(raw), hh = $("#stPhoneHint");
      if (!raw.trim()) { hh.className = "hint"; hh.textContent = "يدخل التطبيق بهذا الرقم، ويوصله عليه رمز الدخول."; return; }
      var bad = phoneIssue(p);
      hh.className = "hint " + (bad ? "warn" : "good");
      hh.innerHTML = bad ? esc(bad) : '<span class="ltr num">' + esc(fmtPhone(p)) + "</span>";
    };
    hint();
    $("#stPhone").oninput = hint;
    if (editing) $("#stCancel").onclick = function () { form(null); };

    $("#stNext").onclick = function () {
      note("#stMsg", "", "");
      var name = $("#stName").value.trim(), role = $("#stRole").value, phone = normPhone($("#stPhone").value);
      if (!name) { note("#stMsg", "اكتب اسم الموظف", "err"); $("#stName").focus(); return; }
      var bad = phoneIssue(phone);
      if (bad) { note("#stMsg", bad, "err"); $("#stPhone").focus(); return; }
      var twin = staff.filter(function (x) { return x.phone === phone && (!editing || x.id !== editing.id); })[0];
      if (twin) { note("#stMsg", "هذا الرقم مسجّل لـ «" + twin.name + "» في نفس المكتب", "err"); return; }
      var next = { name: name, phone: phone, role: role };
      // تعديل الاسم أو الدور فقط: ما يحتاج مراجعة للرقم
      if (editing && phone === editing.phone) { save(editing, next, this); return; }
      review(editing, next);
    };
  }

  // شاشة المراجعة: الرقم كبير + فتحه في واتساب بدون إرسال + تأكيد صريح
  function review(editing, d) {
    var intl = !/^9665\d{8}$/.test(d.phone);
    $("#staffForm").innerHTML =
      '<div class="review">' +
        '<p class="review-k">' + (editing ? "راجع الرقم الجديد قبل الحفظ" : "راجع الرقم قبل الإضافة") + "</p>" +
        '<div class="review-num ltr num">' + esc(fmtPhone(d.phone)) + "</div>" +
        '<p class="review-who">' + esc(d.name) + " · " + ROLE_LABEL[d.role] + " · " + esc(o.name) + "</p>" +
        (editing ? '<p class="hint">الرقم الحالي: <span class="ltr num">' + esc(fmtPhone(editing.phone)) + "</span></p>" : "") +
        (intl ? '<p class="hint warn">رقم غير سعودي — تأكد إن هذا مقصود.</p>' : "") +
        '<a class="btn ghost" href="' + waLink(d.phone) + '" target="_blank" rel="noopener">افتح الرقم في واتساب</a>' +
        '<p class="hint">يفتح المحادثة بس: تشوف صورة صاحب الرقم واسمه. ما تنرسل أي رسالة إلا إذا كتبت أنت.</p>' +
        '<label class="toggle" for="stSure"><input id="stSure" type="checkbox"><span>تأكدت إن هذا رقم «' + esc(d.name) + '» الصحيح</span></label>' +
        '<div class="btn-row"><button class="btn" id="stConfirm" type="button" disabled>' + (editing ? "تأكيد وحفظ" : "تأكيد وإضافة") + "</button>" +
          '<button class="btn ghost" id="stBack" type="button">رجوع للتعديل</button></div>' +
        '<div id="stMsg"></div>' +
      "</div>";
    $("#stSure").onchange = function () { $("#stConfirm").disabled = !this.checked; };
    $("#stBack").onclick = function () { form(editing, { name: d.name, phone: fmtPhone(d.phone), role: d.role }); };
    $("#stConfirm").onclick = function () { save(editing, d, this); };
  }

  function save(editing, d, btn) {
    btn.disabled = true; note("#stMsg", "", "");
    var body = { name: d.name, phone: d.phone, role: d.role, office_id: o.id };
    if (editing) body.id = editing.id;
    run({ action: "staff_save", staff: body }).then(function () {
      return load();
    }).then(function () {
      form(null);
      note("#stMsg", editing ? "انحفظ التعديل" : "أُضيف «" + d.name + "» — يدخل التطبيق برقمه", "ok");
    }).catch(function (e) { note("#stMsg", e.message, "err"); btn.disabled = false; });
  }

  form(null);
  load().catch(function (e) { $("#staffList").innerHTML = '<p class="hint">' + esc(e.message) + "</p>"; });
}

/* ==========================================================================
   طلبات الانضمام من الموقع — مشغّل المنصة
   ========================================================================== */
var SIGNUP_STATE = {
  new: ["جديد", "hot"], contacted: ["تم التواصل", "brand"],
  converted: ["صار مكتباً", "ok"], rejected: ["مستبعد", "mute"],
};

function loadSignups() {
  if (!S.isSuper) return Promise.resolve();
  return call({ action: "signup_list" }).then(function (r) {
    S.signups = r.requests || [];
    S.signupsNew = S.signups.filter(function (x) { return x.status === "new"; }).length;
    $("#navSignDot").hidden = S.signupsNew === 0;
    $("#signupsCount").textContent = S.signups.length ? S.signups.length + " طلب" : "";
    renderSignups();
    if (S.mode === "platform") renderHome();
  }).catch(function (e) {
    $("#signupList").innerHTML = '<p class="hint">' + esc(e.message) + "</p>";
  });
}

function renderSignups() {
  var host = $("#signupList");
  if (!host) return;
  var list = S.signups.filter(function (x) { return x.status === S.signupFilter; });
  if (!list.length) {
    host.innerHTML = state(ICON.inbox,
      S.signupFilter === "new" ? "ما فيه طلبات جديدة" : "القائمة فارغة",
      "طلبات نموذج الموقع تظهر هنا، وتصلك نسخة منها على تيليجرام لحظة وصولها.");
    return;
  }
  host.innerHTML = "";
  list.forEach(function (x) {
    var st = SIGNUP_STATE[x.status] || ["—", "mute"];
    var local = "0" + String(x.phone).slice(3);
    var card = el("div", "req",
      '<div class="top"><div><b>' + esc(x.office_name) + "</b>" +
        "<span>" + esc(x.contact_name) + " · " + ago(x.created_at) + "</span></div>" +
        '<span class="tag ' + st[1] + '">' + st[0] + "</span></div>" +
      '<div class="facts">' +
        '<span class="ltr num">' + esc(local) + "</span>" +
        (x.city ? "<span>" + esc(x.city) + "</span>" : "") +
        "<span>فال: " + (x.fal_license ? '<span class="num">' + esc(x.fal_license) + "</span>" : "لم يُذكر") + "</span>" +
        (x.has_proof ? '<span class="tag ok">صورة الرخصة مرفقة</span>' : '<span class="tag warn">بلا صورة رخصة</span>') +
        (x.agents ? "<span>الوسطاء: " + esc(x.agents) + "</span>" : "") +
      "</div>" +
      (x.note ? '<div class="note">' + esc(x.note) + "</div>" : ""));
    var row = el("div", "btnrow");
    var wa = el("a", "btn wa sm", svg(ICON.wa) + " واتساب");
    wa.href = "https://wa.me/" + digits(x.phone); wa.target = "_blank"; wa.rel = "noopener";
    row.appendChild(wa);
    var mk = function (label, cls, fn) {
      var b = el("button", "btn sm " + cls, label); b.type = "button"; b.onclick = fn; row.appendChild(b); return b;
    };
    if (x.has_proof) mk("صورة الرخصة", "ghost", function () { openSigned({ action: "signup_proof", signup_id: x.id }, this); });
    if (x.status !== "converted") {
      mk("أنشئ المكتب", "", function () {
        openOffice(null, {
          name: x.office_name, license_no: x.fal_license || "", wa_number: x.phone,
          from_signup: x.id, owner_name: x.contact_name, owner_phone: x.phone,
        });
      });
    }
    if (x.status === "new") mk("تم التواصل", "ghost", function () { setSignup(x, "contacted", this); });
    if (x.status !== "rejected" && x.status !== "converted") {
      mk("استبعاد", "ghost", function () { setSignup(x, "rejected", this); });
    }
    if (x.status === "rejected") mk("إرجاع", "ghost", function () { setSignup(x, "new", this); });
    card.appendChild(row);
    host.appendChild(card);
  });
}

function setSignup(x, status, btn) {
  btn.disabled = true;
  call({ action: "signup_update", id: x.id, status: status })
    .then(function () { x.status = status; return loadSignups(); })
    .then(function () { renderToday(); })
    .catch(function (e) { alert(e.message); btn.disabled = false; });
}

/* ==========================================================================
   بيانات المكتب: تصدير وطلب حذف
   ========================================================================== */
function copyText(text, btn) {
  var done = function () {
    var t = btn.textContent; btn.textContent = "نُسخ ✓";
    setTimeout(function () { btn.textContent = t; }, 1600);
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      return;
    }
  } catch (e) { /* نكمل بالطريقة البديلة */ }
  fallbackCopy(text); done();
}
function fallbackCopy(text) {
  var t = document.createElement("textarea");
  t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
  document.body.appendChild(t); t.select();
  try { document.execCommand("copy"); } catch (e) { /* لا شيء */ }
  t.remove();
}

// خلية آمنة لـ Excel: تمنع تنفيذ صيغ مدسوسة داخل رسائل العملاء
function cell(v) {
  var t = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function toCsv(head, rows) {
  return "\uFEFF" + [head.map(cell).join(",")]
    .concat(rows.map(function (r) { return r.map(cell).join(","); })).join("\r\n");
}
function saveFile(name, text, type) {
  var blob = new Blob([text], { type: type });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}
var dateOnly = function (iso) { return iso ? String(iso).slice(0, 10) : ""; };

function exportData(kind, btn) {
  btn.disabled = true; note("#dataMsg", "", "");
  call({ action: "export" }).then(function (r) {
    var code = (r.office && r.office.code) || "office";
    var day = new Date().toISOString().slice(0, 10);
    if (kind === "customers") {
      saveFile("maqsad-customers-" + code + "-" + day + ".csv", toCsv(
        ["الاسم", "الجوال", "نوع الطلب", "نوع العقار", "الحي", "الميزانية", "الفترة", "الغرف",
         "موعد المعاينة", "الحالة", "المحادثة", "سبب التسليم", "نتيجة الاتصال", "تاريخ النتيجة",
         "أوقف الرسائل", "الملخص", "أول تواصل", "آخر نشاط"],
        (r.customers || []).map(function (c) {
          return [c.name, c.phone, c.deal_type, c.property_type, c.location, c.budget, c.budget_period,
            c.rooms, c.appointment, c.status === "qualified" ? "مؤهل" : "استفسار",
            c.mode === "manual" ? "مع الوسيط" : "البوت", HANDOFF[c.handoff_reason] || "",
            OUTCOME[c.outcome] ? OUTCOME[c.outcome][0] : "", dateOnly(c.outcome_at),
            c.opted_out ? "نعم" : "لا",
            c.summary, dateOnly(c.created_at), dateOnly(c.last_message_at)];
        })), "text/csv;charset=utf-8");
      note("#dataMsg", "نُزّل ملف العملاء (" + (r.customers || []).length + " عميل)", "ok");
    } else if (kind === "properties") {
      saveFile("maqsad-properties-" + code + "-" + day + ".csv", toCsv(
        ["العقار", "نوع الطلب", "نوع العقار", "المدينة", "الحي", "السعر", "الغرف", "الحالة",
         "رقم ترخيص الإعلان", "انتهاء الترخيص", "ملاحظات", "تاريخ الإضافة"],
        (r.properties || []).map(function (p) {
          return [p.title, p.deal_type, p.property_type, p.city, p.district, p.price, p.rooms,
            PSTATE[p.state] || p.state,
            p.ad_license_no, p.ad_license_expiry, p.notes, dateOnly(p.created_at)];
        })), "text/csv;charset=utf-8");
      note("#dataMsg", "نُزّل ملف العقارات (" + (r.properties || []).length + " عقار)", "ok");
    } else {
      saveFile("maqsad-backup-" + code + "-" + day + ".json", JSON.stringify(r, null, 2), "application/json");
      note("#dataMsg", "نُزّلت النسخة الكاملة (" + (r.messages || []).length + " رسالة)", "ok");
    }
  }).catch(function (e) { note("#dataMsg", e.message, "err"); })
    .then(function () { btn.disabled = false; });
}

function requestDeletion() {
  openSheet("طلب حذف حساب المكتب",
    '<p class="lead">عند تنفيذ الطلب نحذف عملاءك ومحادثاتهم وعقاراتك وحسابات موظفيك من مقصد نهائياً، ' +
    "ويتوقف البوت عن الرد على رقم مكتبك.</p>" +
    '<div class="card" style="margin-bottom:14px"><dl class="dl">' +
      "<div><dt>المهلة</dt><dd>خلال ٣٠ يوماً كحد أقصى</dd></div>" +
      "<div><dt>قبل الحذف</dt><dd>نرسل لك نسخة كاملة من بياناتك</dd></div>" +
      "<div><dt>النسخ الاحتياطية</dt><dd>تُمسح تلقائياً خلال ١٢ شهراً</dd></div>" +
    "</dl></div>" +
    '<div class="field"><label for="delReason">سبب الطلب (اختياري)</label>' +
      '<textarea id="delReason" class="input" rows="3" maxlength="300"></textarea></div>' +
    '<button class="btn danger" id="delConfirm" type="button">أؤكد طلب الحذف</button>' +
    '<div id="delMsg"></div>');
  $("#delConfirm").onclick = function () {
    var b = this; b.disabled = true;
    call({ action: "delete_account_request", reason: $("#delReason").value })
      .then(function (r) {
        $("#sheetBody").innerHTML = state(ICON.check,
          r.already ? "طلبك مسجّل من قبل" : "وصل طلبك",
          "نتواصل معك قبل التنفيذ، ونرسل لك نسخة من بياناتك.");
      })
      .catch(function (e) { note("#delMsg", e.message, "err"); b.disabled = false; });
  };
}

function loadBackups() {
  call({ action: "backups_status" }).then(function (r) {
    var runs = r.runs || [];
    if (!runs.length) {
      $("#backupList").innerHTML = '<p class="hint">لم تُؤخذ نسخة بعد. النسخة التالية ٣ فجراً.</p>';
      return;
    }
    $("#backupList").innerHTML = '<dl class="dl">' + runs.slice(0, 5).map(function (x) {
      var d = new Date(x.started_at);
      var when = d.toLocaleDateString("ar-SA") + " " +
        d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
      return "<div><dt>" + esc(when) + "</dt><dd>" +
        (x.ok ? '<span class="tag ok">✓ ' + Math.round((x.bytes || 0) / 1024) + " ك.ب</span>"
              : '<span class="tag danger">فشلت</span>') + "</dd></div>";
    }).join("") + "</dl>" +
    '<p class="hint" style="margin-top:10px">نسخة يومية ٣ فجراً · يُتحقق منها بعد كل رفع · تُحفظ ٣٠ يوماً + أول كل شهر لسنة.</p>';
  }).catch(function (e) {
    $("#backupList").innerHTML = '<p class="hint">' + esc(e.message) + "</p>";
  });
}

/* ==========================================================================
   الإعدادات
   ========================================================================== */
function renderSettings() {
  var s = S.status || {}, o = S.me.office;

  var dot = function (ok, label, hint) {
    return "<div><dt>" + esc(label) + "</dt><dd>" +
      (ok ? '<span class="tag ok">جاهز</span>'
          : '<span class="tag danger">' + esc(hint || "ناقص") + "</span>") + "</dd></div>";
  };
  var fal = falOf(o);
  var falHint = { pending: "بانتظار التحقق", rejected: "غير معتمدة", expired: "منتهية" }[fal.state];
  $("#sysStatus").innerHTML = '<dl class="dl">' +
    dot(fal.state === "ok", "رخصة فال", falHint) +
    (S.isSuper ? dot(s.openai, "فهم الرسائل") : "") +
    dot(s.whatsapp, "إرسال واتساب") +
    (S.isSuper ? dot(s.telegram, "تنبيهات تيليجرام") : "") +
    (S.isSuper ? dot(s.meta, "واتساب الرسمي (ميتا)", "غير مربوط") : "") +
    (S.isSuper ? dot(s.login_platform, "الدخول عبر رقم المنصة", "جاهز", "عبر رقم المكتب") : "") +
    dot(!!s.my_phone, "رقمك للدخول") +
    "</dl>" +
    ((s.errors && s.errors.length)
      ? '<div class="msg err" style="margin-top:12px">' + svg(ICON.alert) +
        "<span>" + esc(String((s.errors[0].detail && s.errors[0].detail.error) || s.errors[0].kind).slice(0, 140)) +
        "</span></div>"
      : "");

  // حالة المساعد بكلمة وحدة يفهمها صاحب المكتب
  var bot = fal.state === "ok" ? '<span class="tag ok">يعمل</span>'
    : fal.state === "expired" ? '<span class="tag warn">يعمل بدون عرض عقارات</span>'
    : '<span class="tag danger">متوقف</span>';
  $("#officeInfo").innerHTML = [
    ["اسم المكتب", o.name],
    ["المساعد الآلي", null, bot],
    ["رخصة فال", o.license_no],
    ["حالة الرخصة", null, falTag(fal)],
    fal.expires_on && (fal.state === "ok" || fal.state === "expired")
      ? [fal.state === "ok" ? "تنتهي" : "انتهت", gDate(fal.expires_on) + " — " + hDate(fal.expires_on)] : null,
    ["رقم الواتساب", o.wa_number || "—"],
    // تفاصيل تقنية: لمشغّل المنصة فقط
    S.isSuper ? ["مزود الواتساب", o.wa_provider === "cloud" ? "واتساب الرسمي" : "UltraMsg"] : null,
    S.isSuper ? ["حد الحماية اليومي لكل عميل", o.msg_quota] : null,
    S.isSuper ? ["مهلة تجميع الرسائل", (o.debounce_seconds || 7) + " ثوانٍ"] : null,
  ].filter(Boolean).map(function (p) {
    return "<div><dt>" + esc(p[0]) + '</dt><dd class="num">' + (p[2] || esc(p[1])) + "</dd></div>";
  }).join("");
  // ماذا يعني وضع الرخصة للمكتب، وما المطلوب منه
  var falNote = {
    pending: "المساعد الآلي ما يرد على عملائك لين تتحقق مقصد من رخصة فال. ارفع صورة شهادة فال من الزر تحت، " +
      "وتقدر أنت وموظفينك تجرّبون المساعد من أرقامكم المسجّلة قبل التفعيل.",
    rejected: "ما اعتُمدت رخصة فال" + (fal.note ? ": " + fal.note : "") + ". المساعد متوقف لين تصحّح السبب وترفع شهادة سارية من الزر تحت.",
    expired: "رخصة فال منتهية: المساعد يستقبل طلبات العملاء ويحوّلها لكم، لكن ما يعرض أي عقار. " +
      "جدّدها من منصة الهيئة وارفع الشهادة الجديدة من الزر تحت.",
  }[fal.state] || (falSoon(fal) ? "رخصة فال تنتهي " + inDaysAr(fal.days_left) +
      ". جدّدها وارفع الشهادة الجديدة من الزر تحت — إذا انتهت يوقف المساعد عرض العقارات تلقائياً." : "");
  var fh = $("#falNote");
  fh.hidden = !falNote;
  fh.textContent = falNote;
  fh.className = "hint " + (fal.state === "ok" ? "warn" : "fal-alert");

  $("#myPhone").value = s.my_phone || "";
  $("#sysBlock").hidden = !S.isSuper;
  renderNotify();

  renderFalRequest();
}

function refreshStatus() {
  return call({ action: "settings_status" }).then(function (r) {
    S.status = r; renderSettings(); renderToday();
  });
}

/* ==========================================================================
   اللوح المنزلق
   ========================================================================== */
function openSheet(title, html) {
  homeNotify();
  $("#sheetClose").onclick = closeSheet; $("#scrim").onclick = closeSheet;
  $("#sheetTitle").textContent = title;
  $("#sheetBody").innerHTML = html;
  $("#sheetBody").scrollTop = 0;
  $("#scrim").classList.add("on");
  $("#sheet").classList.add("on");
  document.body.style.overflow = "hidden";
}
// بطاقة التنبيهات قد تنتقل لخطوات أول دخول: ترجع لمكانها في الإعدادات
function homeNotify() {
  var c = $("#notifyCard"), home = $("#notifyBlock");
  if (c && home && !home.contains(c)) home.appendChild(c);
}
function closeSheet() {
  homeNotify();
  $("#scrim").classList.remove("on");
  $("#sheet").classList.remove("on");
  document.body.style.overflow = "";
}

/* ==========================================================================
   التنقل
   ========================================================================== */
var PLATFORM_SCREENS = ["s-home", "s-offices", "s-signups", "s-platform"];
function show(id) {
  if (PLATFORM_SCREENS.indexOf(id) > -1 && !S.isSuper) return;
  var secs = document.querySelectorAll(".screen");
  for (var i = 0; i < secs.length; i++) secs[i].classList.toggle("on", secs[i].id === id);
  var tabs = document.querySelectorAll(".nav button");
  for (var j = 0; j < tabs.length; j++) {
    tabs[j].setAttribute("aria-selected", tabs[j].dataset.screen === id ? "true" : "false");
  }
  window.scrollTo(0, 0);
}
function syncChips(host, val) {
  var cs = document.querySelectorAll(host + " .chip");
  for (var i = 0; i < cs.length; i++) {
    cs[i].setAttribute("aria-pressed", cs[i].dataset.f === val ? "true" : "false");
  }
}

/* ==========================================================================
   الربط
   ========================================================================== */
function bind() {
  paintAuthPhone();
  $("#btnWa").onclick = function () { startWaLogin(this); };
  $("#ph").onkeydown = function (e) { if (e.key === "Enter") $("#btnWa").click(); };
  $("#btnPk").onclick = function () { pkLogin(this); };
  $("#btnPkLink").onclick = function () { pkLogin(this); };
  $("#btnWaBack").onclick = function () { stopLoginWait(); note("#authMsg", "", ""); authPanel("authPhone"); };
  $("#btnOpenWa").onclick = function () { setTimeout(pollLogin, 3000); };
  document.addEventListener("visibilitychange", function () { if (!document.hidden && LG.id) pollLogin(); });
  $("#btnHaveCode").onclick = function () { note("#authMsg", "", ""); authPanel("authCode"); $("#cd").focus(); };
  $("#btnBack").onclick = function () { note("#authMsg", "", ""); authPanel("authPhone"); };
  $("#cd").onkeydown = function (e) { if (e.key === "Enter") $("#btnVerify").click(); };
  $("#btnVerify").onclick = function () {
    var b = this;
    if (!$("#ph").value.trim()) { authPanel("authPhone"); note("#authMsg", "اكتب رقم جوالك أول، وبعدها اضغط «عندي رمز»", "err"); return; }
    b.disabled = true; note("#authMsg", "", "");
    call({ action: "verify_otp", phone: $("#ph").value, code: $("#cd").value })
      .then(function (r) { return afterLogin(r, "code"); })
      .catch(function (e) {
        var m = e.message === "wrong_code" ? "الرمز غير صحيح، تأكد وحاول مرة أخرى."
          : e.message === "expired" ? "انتهت صلاحية الرمز، اطلب رمزاً جديداً."
          : e.message === "no_code" ? "ما فيه رمز لهذا الرقم. تأكد من الرقم، أو اطلب رمز من فريق مقصد."
          : e.message === "too_many" ? "محاولات كثيرة، اطلب رمزاً جديداً." : e.message;
        note("#authMsg", m, "err");
      })
      .then(function () { b.disabled = false; });
  };
  $("#btnTgCode").onclick = function () {
    var b = this;
    if (!$("#ph").value.trim()) { authPanel("authPhone"); note("#authMsg", "اكتب رقم جوالك أول", "err"); return; }
    b.disabled = true;
    call({ action: "admin_tg_code", phone: $("#ph").value })
      .then(function () { note("#authMsg", "إذا الرقم رقم مشغّل المنصة، وصلك الرمز في تيليجرام.", "ok"); $("#cd").focus(); })
      .catch(function (e) { note("#authMsg", e.message, "err"); })
      .then(function () { setTimeout(function () { b.disabled = false; }, 45000); });
  };
  $("#btnPkEnroll").onclick = function () {
    var b = this; b.disabled = true; note("#authMsg", "", "");
    pkEnroll().then(function () { return load(); })
      .catch(function (e) { note("#authMsg", pkErr(e), "err"); })
      .then(function () { b.disabled = false; });
  };
  $("#btnPkSkip").onclick = function () { pkLsSet(PK_SKIP, String(Date.now())); load(); };

  var tabs = document.querySelectorAll(".nav button");
  for (var i = 0; i < tabs.length; i++) {
    (function (t) { t.onclick = function () { show(t.dataset.screen); }; })(tabs[i]);
  }

  $("#btnRefresh").onclick = function () {
    var b = this; b.disabled = true;
    if (S.isSuper && S.mode === "platform") {
      S.usage = {};
      Promise.all([refreshPlatform(), loadSignups(), loadAdminLog()]).then(function () { loadUsage(true); loadBackups(); })
        .catch(function () {}).then(function () { b.disabled = false; });
      return;
    }
    S.pre = null; S.month = {}; S.usage = {};
    Promise.all([
      call({ action: "leads" }), call({ action: "properties" }), call({ action: "settings_status" }),
    ]).then(function (r) {
      S.leads = r[0].leads || []; S.team = r[0].team || S.team; S.props = r[1].properties || []; S.status = r[2];
      renderToday(); renderLeads(); renderStock(); renderSettings();
    }).catch(function () {}).then(function () { b.disabled = false; });
  };

  var mc = document.querySelectorAll("#monthChips .chip");
  for (var mi = 0; mi < mc.length; mi++) {
    (function (c) {
      c.onclick = function () {
        S.monthSel = c.dataset.m;
        var cs = document.querySelectorAll("#monthChips .chip");
        for (var k = 0; k < cs.length; k++) cs[k].setAttribute("aria-pressed", cs[k] === c ? "true" : "false");
        renderMonth();
      };
    })(mc[mi]);
  }
  var uc = document.querySelectorAll("#usageChips .chip");
  for (var ui = 0; ui < uc.length; ui++) {
    (function (c) {
      c.onclick = function () {
        S.usageSel = c.dataset.m;
        var cs = document.querySelectorAll("#usageChips .chip");
        for (var k = 0; k < cs.length; k++) cs[k].setAttribute("aria-pressed", cs[k] === c ? "true" : "false");
        loadUsage();
      };
    })(uc[ui]);
  }

  $("#leadSearch").oninput = function () { S.leadQuery = this.value; searchOlderLeads(); renderLeads(); };
  $("#stockSearch").oninput = function () { S.stockQuery = this.value; renderStock(); };
  $("#stockCity").onchange = function () { S.stockCity = this.value; renderStock(); };

  var lc = document.querySelectorAll("#leadChips .chip");
  for (var a = 0; a < lc.length; a++) {
    (function (c) {
      c.onclick = function () { S.leadFilter = c.dataset.f; syncChips("#leadChips", c.dataset.f); renderLeads(); };
    })(lc[a]);
  }
  var sc = document.querySelectorAll("#stockChips .chip");
  for (var d = 0; d < sc.length; d++) {
    (function (c) {
      c.onclick = function () { S.stockFilter = c.dataset.f; syncChips("#stockChips", c.dataset.f); renderStock(); };
    })(sc[d]);
  }

  $("#btnNewProp").onclick = function () { openPropWizard(); };
  $("#btnNewOffice").onclick = function () { openOffice(null); };
  $("#sheetClose").onclick = closeSheet;
  $("#scrim").onclick = closeSheet;
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });

  $("#btnSaveMe").onclick = function () {
    var b = this; b.disabled = true; note("#meMsg", "", "");
    call({ action: "save_settings", settings: { my_phone: $("#myPhone").value } })
      .then(function () { note("#meMsg", "حُفظ رقمك", "ok"); return refreshStatus(); })
      .catch(function (e) { note("#meMsg", e.message, "err"); })
      .then(function () { b.disabled = false; });
  };

  $("#btnSaveKeys").onclick = function () {
    var b = this; b.disabled = true; note("#keysMsg", "", "");
    var val = function (id) { return $(id).value.trim(); };
    call({
      action: "save_settings",
      settings: {
        openai_key: val("#kOpenai"), telegram_token: val("#kTg"),
        meta_app_secret: val("#kMetaSecret"), meta_verify_token: val("#kMetaVerify"),
        platform_wa_phone_id: val("#kPlatId"), platform_wa_token: val("#kPlatTok"), platform_wa_number: val("#kPlatNum"),
      },
    }).then(function () {
      note("#keysMsg", "حُفظت المفاتيح", "ok");
      return refreshPlatform();
    }).catch(function (e) { note("#keysMsg", e.message, "err"); })
      .then(function () { b.disabled = false; });
  };

  $("#btnCopyHook").onclick = function () { copyText($("#kHook").value, this); };

  var sg = document.querySelectorAll("#signupChips .chip");
  for (var g = 0; g < sg.length; g++) {
    (function (c) {
      c.onclick = function () { S.signupFilter = c.dataset.f; syncChips("#signupChips", c.dataset.f); renderSignups(); };
    })(sg[g]);
  }

  $("#btnExpCustomers").onclick = function () { exportData("customers", this); };
  $("#btnExpProps").onclick = function () { exportData("properties", this); };
  $("#btnExpJson").onclick = function () { exportData("json", this); };
  $("#btnDeleteAcct").onclick = function () { requestDeletion(); };

  $("#btnLogout").onclick = $("#btnLogout2").onclick = function () {
    call({ action: "logout", endpoint: NT.sub ? NT.sub.endpoint : null }).catch(function () {}).then(logout);
  };
  $("#btnExitOffice").onclick = exitOffice;
  $("#btnSaveAi").onclick = function () { saveAi(this); };
  $("#officeSearch").oninput = function () { S.officeQuery = this.value; renderOffices(); };
  var oc = document.querySelectorAll("#officeChips .chip");
  for (var oi = 0; oi < oc.length; oi++) {
    (function (c) {
      c.onclick = function () { S.officeFilter = c.dataset.f; syncChips("#officeChips", c.dataset.f); renderOffices(); };
    })(oc[oi]);
  }
  $("#btnSignup").onclick = function () { openSignup(); };
}

/* ==========================================================================
   خطوات منبثقة: أدوات مشتركة (أول دخول · إضافة عقار · التسجيل)
   ========================================================================== */
function stepHead(i, n, title, sub) {
  var dots = "";
  for (var k = 0; k < n; k++) dots += '<i class="' + (k < i ? "done" : k === i ? "on" : "") + '"></i>';
  return '<div class="wz-head"><div class="wz-bar" aria-hidden="true">' + dots + "</div>" +
    '<span class="wz-n">خطوة ' + (i + 1).toLocaleString("ar-SA") + " من " + n.toLocaleString("ar-SA") + "</span>" +
    "<h4>" + esc(title) + "</h4>" + (sub ? '<p class="hint tight">' + esc(sub) + "</p>" : "") + "</div>";
}
function choiceGrid(name, opts, val) {
  return '<div class="wz-choices" role="radiogroup">' + opts.map(function (o) {
    return '<button type="button" class="wz-choice" role="radio" data-name="' + name + '" data-v="' + esc(o[0]) + '" aria-checked="' +
      (o[0] === val ? "true" : "false") + '">' + (o[2] ? svg(o[2]) : "") + "<span>" + esc(o[1]) + "</span></button>";
  }).join("") + "</div>";
}
function wireChoices(root, onPick) {
  var bs = root.querySelectorAll(".wz-choice");
  for (var i = 0; i < bs.length; i++) {
    (function (b) {
      b.onclick = function () {
        var sib = root.querySelectorAll('.wz-choice[data-name="' + b.dataset.name + '"]');
        for (var k = 0; k < sib.length; k++) sib[k].setAttribute("aria-checked", sib[k] === b ? "true" : "false");
        onPick(b.dataset.name, b.dataset.v);
      };
    })(bs[i]);
  }
}
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

var PICON = {
  apt: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/>',
  villa: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  floor: '<path d="M3 20h18M5 20V9h14v11"/><path d="M5 14h14"/>',
  land: '<path d="M3 17 9 7l4 6 3-4 5 8z"/>',
  shop: '<path d="M4 9h16l-1-5H5z"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.3-8.3M16 6l3 3"/>',
  tag: '<path d="M20.6 13.4 12 22l-9-9V4h9l8.6 8.6a1 1 0 0 1 0 .8Z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
};

/* ---------- تفاصيل العقار الاختيارية (دورات المياه، العمر، المرافق…) ---------- */
// كلها اختيارية، وغير المعبّأ = «غير معروف» (البوت يقول «أتأكد من المكتب»، ما يقول «لا»).
// t: step = عدّاد +/− · num = رقم يكتبه · pick = اختيار واحد (اضغط مرة ثانية للإلغاء) · flag = «موجود».
// ty = أنواع العقار المنطبقة · deal = نوع الطلب المنطبق. المفاتيح والقيم نفسها في api (PROP_DETAIL_SPEC)
// وفي البوت (DETAIL_SPEC)؛ اختبار api.test.mjs يقارن المفاتيح.
var PD_RES = ["شقة", "فيلا", "دور"], PD_BLD = PD_RES.concat(["محل"]);
var PD_GROUPS = [
  { id: "space", t: "المساحات والغرف", f: [
    { k: "area", l: "المساحة (م²)", t: "num", max: 1000000, min: 1 },
    { k: "baths", l: "دورات المياه", t: "step", max: 20, ty: PD_BLD },
    { k: "halls", l: "الصالات", t: "step", max: 10, ty: PD_RES },
    { k: "majlis", l: "المجالس", t: "step", max: 10, ty: PD_RES },
    { k: "floors", l: "عدد الأدوار", t: "step", max: 10, min: 1, ty: ["فيلا"] },
    { k: "floor_no", l: "رقم الدور", t: "pick", ty: ["شقة"], o: ["أرضي", "الأول", "الثاني", "الثالث", "الرابع", "الخامس فأعلى"] },
    { k: "kitchen", l: "المطبخ", t: "pick", ty: PD_RES, o: ["راكب", "غير راكب"] },
  ] },
  { id: "cond", t: "الحالة والتجهيز", f: [
    { k: "age", l: "عمر العقار", t: "pick", ty: PD_BLD, o: ["جديد", "أقل من ٥ سنوات", "٥–١٠ سنوات", "١٠–٢٠ سنة", "أكثر من ٢٠ سنة"] },
    { k: "furnished", l: "الفرش", t: "pick", ty: PD_RES, o: ["مؤثث", "مؤثث جزئياً", "غير مؤثث"] },
    { k: "finish", l: "التشطيب", t: "pick", ty: PD_BLD, o: ["ديلوكس", "عادي", "عظم"] },
    { k: "ac", l: "المكيفات", t: "pick", ty: PD_BLD, o: ["راكب سبليت", "راكب مركزي", "راكب شباك", "غير راكب"] },
  ] },
  { id: "amen", t: "المرافق", f: [
    { k: "parking", l: "مواقف السيارات", t: "step", max: 20, ty: PD_BLD },
    { k: "elevator", l: "مصعد", t: "flag", ty: PD_RES },
    { k: "garden", l: "حوش أو حديقة", t: "flag", ty: ["فيلا", "دور"] },
    { k: "pool", l: "مسبح", t: "flag", ty: ["فيلا"] },
    { k: "annex", l: "ملحق", t: "flag", ty: ["فيلا", "دور"] },
    { k: "roof", l: "سطح", t: "flag", ty: PD_RES },
    { k: "maid_room", l: "غرفة خادمة", t: "flag", ty: PD_RES },
    { k: "driver_room", l: "غرفة سائق", t: "flag", ty: ["فيلا", "دور"] },
    { k: "security", l: "كاميرات أو أمن", t: "flag", ty: PD_BLD },
    { k: "own_meters", l: "عدادات كهرباء وماء مستقلة", t: "flag", ty: PD_BLD },
  ] },
  { id: "site", t: "الواجهة والشارع", f: [
    { k: "facade", l: "اتجاه الواجهة", t: "pick", o: ["شمال", "جنوب", "شرق", "غرب", "شمال شرق", "شمال غرب", "جنوب شرق", "جنوب غرب"] },
    { k: "street_width", l: "عرض الشارع (م)", t: "num", max: 200, min: 1 },
    { k: "corner", l: "زاوية", t: "flag" },
  ] },
  { id: "rent", t: "شروط الإيجار", f: [
    { k: "pay_period", l: "طريقة الدفع", t: "pick", deal: "إيجار", o: ["سنوي", "نصف سنوي", "ربع سنوي", "شهري"] },
    { k: "lease_min", l: "أقل مدة للإيجار", t: "pick", deal: "إيجار", o: ["٦ أشهر", "سنة", "سنتين فأكثر"] },
    { k: "tenants", l: "المستأجرون", t: "pick", deal: "إيجار", ty: PD_RES, o: ["عوائل فقط", "عزاب فقط", "عوائل وعزاب"] },
    { k: "utilities", l: "الإيجار شامل الكهرباء والماء", t: "flag", deal: "إيجار", ty: PD_BLD },
  ] },
  { id: "sale", t: "بيانات البيع", f: [
    { k: "deed", l: "نوع الصك", t: "pick", deal: "شراء", o: ["صك إلكتروني", "صك ورقي", "قيد التحويل"] },
    { k: "mortgaged", l: "العقار مرهون", t: "flag", deal: "شراء" },
    { k: "negotiable", l: "السعر قابل للتفاوض", t: "flag", deal: "شراء" },
  ] },
];
function pdDeal(deal) { return deal === "بيع" ? "شراء" : deal; }
function pdFields(g, ty, deal) {
  return g.f.filter(function (f) {
    return (!f.ty || f.ty.indexOf(ty) > -1) && (!f.deal || f.deal === pdDeal(deal));
  });
}
// نفس فحص الخادم (cleanDetails في api): منطبق + قيمة صالحة فقط
function pdClean(det, ty, deal) {
  var out = {};
  det = det || {};
  PD_GROUPS.forEach(function (g) {
    pdFields(g, ty, deal).forEach(function (f) {
      var v = det[f.k];
      if (f.t === "flag") { if (v === true) out[f.k] = true; }
      else if (f.t === "pick") { if (f.o.indexOf(v) > -1) out[f.k] = v; }
      else {
        var n = Math.round(Number(latinDigits(v)));
        var lo = f.min || 0;
        if (v !== "" && v != null && isFinite(n) && n >= lo && n <= f.max) out[f.k] = n;
      }
    });
  });
  return out;
}
function pdCount(det, ty, deal) { return Object.keys(pdClean(det, ty, deal)).length; }
function pdHtml(det, ty, deal) {
  var clean = pdClean(det, ty, deal), first = true;
  return PD_GROUPS.map(function (g) {
    var fs = pdFields(g, ty, deal);
    if (!fs.length) return "";
    var steps = fs.filter(function (f) { return f.t !== "flag"; });
    var flags = fs.filter(function (f) { return f.t === "flag"; });
    var n = fs.filter(function (f) { return clean[f.k] != null; }).length;
    var body = steps.map(function (f) {
      var v = det[f.k];
      if (f.t === "step") {
        return '<div class="pd-f pd-row"><span class="pd-l">' + esc(f.l) + "</span>" +
          '<div class="pd-step"><button type="button" data-pd="' + f.k + '" data-d="-1" aria-label="أنقص ' + esc(f.l) + '">−</button>' +
          '<output data-out="' + f.k + '" class="num">' + (clean[f.k] != null ? clean[f.k] : "—") + "</output>" +
          '<button type="button" data-pd="' + f.k + '" data-d="1" aria-label="زد ' + esc(f.l) + '">+</button></div></div>';
      }
      if (f.t === "num") {
        return '<div class="pd-f pd-row"><label class="pd-l" for="pd_' + f.k + '">' + esc(f.l) + "</label>" +
          '<input id="pd_' + f.k + '" class="input ltr pd-num" inputmode="numeric" data-pd="' + f.k + '" value="' + esc(v == null ? "" : v) + '"></div>';
      }
      return '<div class="pd-f"><span class="pd-l">' + esc(f.l) + '</span><div class="chips wrap">' +
        f.o.map(function (o) {
          return '<button type="button" class="chip" data-pd="' + f.k + '" data-v="' + esc(o) + '" aria-pressed="' + (v === o) + '">' + esc(o) + "</button>";
        }).join("") + "</div></div>";
    }).join("") + (flags.length ? '<div class="pd-f"><span class="pd-l">يتوفر فيه</span><div class="chips wrap">' +
      flags.map(function (f) {
        return '<button type="button" class="chip" data-pd="' + f.k + '" data-flag="1" aria-pressed="' + (det[f.k] === true) + '">' + esc(f.l) + "</button>";
      }).join("") + "</div></div>" : "");
    var open = first ? " open" : "";
    first = false;
    return '<details class="pd-grp" data-grp="' + g.id + '"' + open + "><summary><span>" + esc(g.t) + "</span>" +
      '<b class="pd-n num"' + (n ? "" : " hidden") + ">" + n + "</b></summary>" + body + "</details>";
  }).join("");
}
// يربط الأزرار والحقول بكائن det (يتعدل مباشرة) ويحدّث الشاشة بلا إعادة رسم (تبقى الأقسام المفتوحة مفتوحة)
function pdWire(root, det, ty, deal, onChange) {
  var spec = {};
  PD_GROUPS.forEach(function (g) { g.f.forEach(function (f) { spec[f.k] = f; }); });
  function sync() {
    var clean = pdClean(det, ty, deal);
    var bs = root.querySelectorAll("button[data-pd]");
    for (var i = 0; i < bs.length; i++) {
      var k = bs[i].getAttribute("data-pd");
      if (bs[i].hasAttribute("data-flag")) bs[i].setAttribute("aria-pressed", String(det[k] === true));
      else if (bs[i].hasAttribute("data-v")) bs[i].setAttribute("aria-pressed", String(det[k] === bs[i].getAttribute("data-v")));
    }
    var os = root.querySelectorAll("output[data-out]");
    for (var j = 0; j < os.length; j++) {
      var v = clean[os[j].getAttribute("data-out")];
      os[j].textContent = v != null ? v : "—";
    }
    var gs = root.querySelectorAll("details[data-grp]");
    for (var q = 0; q < gs.length; q++) {
      var g = PD_GROUPS.filter(function (x) { return x.id === gs[q].getAttribute("data-grp"); })[0];
      var n = pdFields(g, ty, deal).filter(function (f) { return clean[f.k] != null; }).length;
      var b = gs[q].querySelector(".pd-n");
      b.textContent = n; b.hidden = n === 0;
    }
    if (onChange) onChange(Object.keys(clean).length);
  }
  root.onclick = function (e) {
    var b = e.target.closest ? e.target.closest("button[data-pd]") : null;
    if (!b || !root.contains(b)) return;
    var k = b.getAttribute("data-pd"), f = spec[k];
    if (b.hasAttribute("data-d")) {
      var lo = f.min || 1, cur = det[k], next;
      if (cur == null) next = b.getAttribute("data-d") === "1" ? lo : null;
      else next = Number(cur) + Number(b.getAttribute("data-d"));
      if (next == null || next < lo) delete det[k]; else det[k] = Math.min(next, f.max);
    } else if (b.hasAttribute("data-flag")) {
      if (det[k] === true) delete det[k]; else det[k] = true;
    } else {
      var v = b.getAttribute("data-v");
      if (det[k] === v) delete det[k]; else det[k] = v;
    }
    sync();
  };
  root.oninput = function (e) {
    var t = e.target;
    if (!t || t.tagName !== "INPUT" || !t.hasAttribute("data-pd")) return;
    if (t.value.trim() === "") delete det[t.getAttribute("data-pd")]; else det[t.getAttribute("data-pd")] = t.value;
    sync();
  };
}
// تفاصيل آخر عقار مثله (نفس النوع ونفس الطلب) — يوفّر التعبئة لمن عنده وحدات متشابهة
function pdLastLike(ty, deal) {
  var hit = (S.props || []).filter(function (p) {
    return p.property_type === ty && pdDeal(p.deal_type) === pdDeal(deal) && p.details && Object.keys(p.details).length;
  })[0];
  return hit ? pdClean(hit.details, ty, deal) : null;
}
// سطر مختصر في قائمة المخزون
function pdBrief(p) {
  var d = p.details || {}, out = [];
  if (d.baths) out.push(d.baths + " دورة مياه");
  if (d.area) out.push(d.area + " م²");
  return out;
}

/* ---------- إضافة عقار بخطوات ---------- */
var PROP_DRAFT = "maqsad_prop_draft";
function openPropWizard(done) {
  var d = lsGet(PROP_DRAFT) || { deal_type: "", property_type: "", city: defaultCity(), district: "", rooms: "", title: "", price: "",
    ad_license_no: "", ad_license_expiry: "", details: {}, step: 0 };
  if (d.city == null) d.city = defaultCity();   // مسودة محفوظة قبل حقل المدينة
  if (!d.details) d.details = {};                // مسودة محفوظة قبل التفاصيل
  var N = 6;
  openSheet("عقار جديد", '<div id="wz"></div>');
  var save = function () { lsSet(PROP_DRAFT, d); };
  var host = function () { return $("#wz"); };
  var isLand = function () { return d.property_type === "أرض" || d.property_type === "محل"; };
  var autoTitle = function () { return [d.property_type, d.district].filter(Boolean).join(" "); };

  function nav(backOk, nextLabel, nextOk) {
    return '<div class="wz-nav">' +
      '<button class="btn" type="button" id="wzNext"' + (nextOk ? "" : " disabled") + ">" + esc(nextLabel || "التالي") + "</button>" +
      (backOk ? '<button class="btn ghost" type="button" id="wzBack">رجوع</button>' : "") + "</div>" + '<div id="wzMsg"></div>';
  }
  function go(i) { d.step = i; save(); paint(); $("#sheetBody").scrollTop = 0; }

  function paint() {
    var h = host();
    if (!h) return;
    var i = d.step || 0;
    if (i === 0) {
      h.innerHTML = stepHead(0, N, "وش نوع العقار؟", "اختر نوع العرض ونوع العقار.") +
        '<span class="flabel">العرض</span>' +
        choiceGrid("deal", [["إيجار", "للإيجار", PICON.key], ["شراء", "للبيع", PICON.tag]], d.deal_type) +
        '<span class="flabel">العقار</span>' +
        choiceGrid("type", [["شقة", "شقة", PICON.apt], ["فيلا", "فيلا", PICON.villa], ["دور", "دور", PICON.floor],
          ["أرض", "أرض", PICON.land], ["محل", "محل", PICON.shop]], d.property_type) +
        nav(false, "التالي", d.deal_type && d.property_type);
      wireChoices(h, function (n, v) {
        if (n === "deal") d.deal_type = v; else d.property_type = v;
        save(); $("#wzNext").disabled = !(d.deal_type && d.property_type);
      });
    } else if (i === 1) {
      h.innerHTML = stepHead(1, N, "وين موقعه؟", "المدينة والحي — اكتبه مثل ما يكتبه الناس.") +
        '<div class="field"><label for="wzCity">المدينة</label>' +
          '<input id="wzCity" class="input" list="cityList" autocomplete="off" placeholder="الرياض" value="' + esc(d.city) + '">' +
          '<p class="hint">مطلوبة: نفس اسم الحي موجود في أكثر من مدينة.</p></div>' + cityOptions() +
        '<div class="field"><label for="wzDistrict">الحي</label>' +
          '<input id="wzDistrict" class="input" autocomplete="off" placeholder="النرجس" value="' + esc(d.district) + '"></div>' +
        (isLand() ? "" : '<div class="field"><label for="wzRooms">عدد الغرف <span class="opt">(اختياري)</span></label>' +
          '<input id="wzRooms" class="input" type="number" inputmode="numeric" min="0" max="30" value="' + esc(d.rooms) + '"></div>') +
        '<div class="field"><label for="wzTitle">اسم مختصر تعرفه أنت <span class="opt">(اختياري)</span></label>' +
          '<input id="wzTitle" class="input" placeholder="' + esc(autoTitle() || "شقة النرجس A12") + '" value="' + esc(d.title) + '">' +
          '<p class="hint">ما يشوفه العميل — بس عشان تميّز العقار في قائمتك.</p></div>' +
        nav(true, "التالي", d.district.trim().length > 1 && d.city.trim().length > 1);
      var locOk = function () { $("#wzNext").disabled = d.district.trim().length < 2 || d.city.trim().length < 2; };
      $("#wzCity").oninput = function () { d.city = this.value; save(); locOk(); };
      $("#wzDistrict").oninput = function () { d.district = this.value; save(); locOk();
        $("#wzTitle").placeholder = autoTitle() || "شقة النرجس A12"; };
      if ($("#wzRooms")) $("#wzRooms").oninput = function () { d.rooms = this.value; save(); };
      $("#wzTitle").oninput = function () { d.title = this.value; save(); };
      (d.city ? $("#wzDistrict") : $("#wzCity")).focus();
    } else if (i === 2) {
      var rent = d.deal_type === "إيجار";
      h.innerHTML = stepHead(2, N, "كم السعر؟", rent ? "الإيجار السنوي بالريال." : "سعر البيع بالريال.") +
        '<div class="field"><label for="wzPrice">' + (rent ? "الإيجار السنوي" : "سعر البيع") + '</label>' +
          '<input id="wzPrice" class="input ltr" inputmode="numeric" placeholder="' + (rent ? "45000" : "1200000") + '" value="' + esc(d.price) + '">' +
          '<p class="hint" id="wzPriceHint"></p></div>' +
        nav(true, "التالي", Number(digits(d.price)) > 0);
      var hint = function () {
        var n = Number(digits(latinDigits(d.price)));
        $("#wzPriceHint").textContent = n > 0 ? money(n) + " ريال" + (rent ? " سنوياً" : "") : "اكتب الرقم بدون فواصل";
        $("#wzNext").disabled = !(n > 0);
      };
      $("#wzPrice").oninput = function () { d.price = this.value; save(); hint(); };
      hint(); $("#wzPrice").focus();
    } else if (i === 3) {
      h.innerHTML = stepHead(3, N, "ترخيص الإعلان", "رقم ترخيص الإعلان من منصة الهيئة العامة للعقار وتاريخ انتهائه.") +
        '<div class="field"><label for="wzLic">رقم ترخيص الإعلان</label>' +
          '<input id="wzLic" class="input ltr" inputmode="numeric" placeholder="7200034512" value="' + esc(d.ad_license_no) + '"></div>' +
        '<div class="field"><label for="wzExp">ينتهي في</label>' +
          '<input id="wzExp" class="input ltr" type="date" min="' + riyadhDay() + '" value="' + esc(d.ad_license_expiry) + '"></div>' +
        '<p class="hint warn" id="wzLicHint"></p>' +
        nav(true, "التالي", true);
      var lh = function () {
        var ok = digits(latinDigits(d.ad_license_no)).length >= 4 && d.ad_license_expiry;
        $("#wzLicHint").textContent = ok ? "" : "تقدر تكمل بدونه، بس المساعد ما يعرض العقار على أي عميل لين تضيف ترخيص ساري — حماية لك نظامياً.";
        $("#wzNext").textContent = ok ? "التالي" : "أكمل بدون ترخيص الحين";
      };
      $("#wzLic").oninput = function () { d.ad_license_no = this.value; save(); lh(); };
      $("#wzExp").oninput = function () { d.ad_license_expiry = this.value; save(); lh(); };
      lh();
    } else if (i === 4) {
      var like = pdLastLike(d.property_type, d.deal_type);
      h.innerHTML = stepHead(4, N, "تفاصيل العقار", "كلها اختيارية — كل ما عبّيت أكثر، البوت يجاوب العملاء بدقة أكثر.") +
        (like ? '<button class="btn ghost sm" type="button" id="pdCopy" style="margin-bottom:12px">انسخ تفاصيل آخر عقار مثله</button>' : "") +
        '<div id="pdBox">' + pdHtml(d.details, d.property_type, d.deal_type) + "</div>" +
        nav(true, "تخطي", true);
      var pdNext = function (n) { $("#wzNext").textContent = n ? "التالي" : "تخطي"; };
      pdWire($("#pdBox"), d.details, d.property_type, d.deal_type, function (n) { save(); pdNext(n); });
      pdNext(pdCount(d.details, d.property_type, d.deal_type));
      if (like) $("#pdCopy").onclick = function () { d.details = like; save(); paint(); };
    } else {
      var row = function (k, v, step) {
        return "<div><dt>" + esc(k) + "</dt><dd>" + esc(v || "—") +
          ' <button type="button" class="linkbtn" data-go="' + step + '">تعديل</button></dd></div>';
      };
      var n = Number(digits(latinDigits(d.price)));
      var pdN = pdCount(d.details, d.property_type, d.deal_type);
      h.innerHTML = stepHead(5, N, "راجع قبل الحفظ") +
        '<div class="card"><dl class="dl">' +
          row("العرض", d.deal_type === "إيجار" ? "للإيجار" : "للبيع", 0) + row("العقار", d.property_type, 0) +
          row("المدينة", d.city, 1) + row("الحي", d.district, 1) + (isLand() ? "" : row("الغرف", d.rooms, 1)) +
          row("الاسم", d.title || autoTitle(), 1) +
          row("السعر", n ? money(n) + " ريال" + (d.deal_type === "إيجار" ? " سنوياً" : "") : "", 2) +
          row("ترخيص الإعلان", d.ad_license_no ? d.ad_license_no + (d.ad_license_expiry ? " — ينتهي " + gDate(d.ad_license_expiry) : "") : "بدون — ما يُعرض", 3) +
          row("التفاصيل", pdN ? pdN + " تفصيل" : "بدون", 4) +
        "</dl></div>" + nav(true, "احفظ العقار", true);
      var gs = h.querySelectorAll("[data-go]");
      for (var g = 0; g < gs.length; g++) (function (b) { b.onclick = function () { go(Number(b.dataset.go)); }; })(gs[g]);
    }
    if ($("#wzBack")) $("#wzBack").onclick = function () { go(i - 1); };
    $("#wzNext").onclick = function () { if (i < N - 1) go(i + 1); else submit(this); };
  }

  function submit(b) {
    b.disabled = true; note("#wzMsg", "", "");
    var saved = null;
    call({ action: "property_save", property: {
      title: (d.title || autoTitle()).trim(), deal_type: d.deal_type, property_type: d.property_type,
      city: d.city.trim(), district: d.district.trim(), rooms: isLand() ? "" : d.rooms, price: digits(latinDigits(d.price)), state: "available",
      ad_license_no: digits(latinDigits(d.ad_license_no)), ad_license_expiry: d.ad_license_expiry,
      details: pdClean(d.details, d.property_type, d.deal_type),
    } }).then(function (sr) { saved = sr; return call({ action: "properties" }); }).then(function (r) {
      lsSet(PROP_DRAFT, null);
      S.props = r.properties || [];
      renderStock(); renderToday();
      if (done) done();
      else if (saved && saved.matches > 0 && saved.property) openMatchesPrompt(saved.property, saved.matches);
      else closeSheet();
    }).catch(function (e) { note("#wzMsg", e.message, "err"); b.disabled = false; });
  }
  paint();
}
function latinDigits(v) {
  return String(v == null ? "" : v).replace(/[٠-٩]/g, function (x) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(x)); })
    .replace(/[۰-۹]/g, function (x) { return String("۰۱۲۳۴۵۶۷۸۹".indexOf(x)); });
}


/* ---------- اتفاقية معالجة البيانات: موافقة صاحب المكتب مرة لكل نسخة ---------- */
var TERMS_URL = "https://maqsadapp.com/terms.html#dpa";
function termsPending() {
  return isOwnerMe() && !!(S.me && S.me.office && S.me.office.terms) && !S.me.office.terms.ok;
}
function openTerms(after) {
  var t = S.me.office.terms;
  openSheet("أهلاً بك في مقصد",
    '<p class="hint tight">كلمة سريعة عن بيانات عملائك قبل ما تبدأ:</p>' +
    '<ul class="terms-pts">' +
      "<li><b>بياناتهم لك وحدك.</b> ما نبيعها ولا نشاركها مع أحد.</li>" +
      "<li><b>نستخدمها عشان نخدمك:</b> المساعد يرد على عملائك ويرتّب طلباتهم لك.</li>" +
      "<li><b>محفوظة بأمان</b>، وأي عميل يطلب حذف بياناته تنحذف مباشرة.</li>" +
    "</ul>" +
    '<p class="hint">التفاصيل كاملة في <a href="' + TERMS_URL + '" target="_blank" rel="noopener">اتفاقية معالجة البيانات</a>.</p>' +
    '<label class="toggle" for="tAgree" style="margin:14px 0"><input id="tAgree" type="checkbox"><span>أوافق على الشروط واتفاقية معالجة البيانات</span></label>' +
    '<button class="btn" id="tOk" type="button" disabled>ابدأ</button>' +
    '<button class="btn ghost" id="tLater" type="button" style="margin-top:8px">لاحقاً</button><div id="tMsg"></div>');
  var later = function () { closeSheet(); renderToday(); };
  $("#sheetClose").onclick = later; $("#scrim").onclick = later; $("#tLater").onclick = later;
  $("#tAgree").onchange = function () { $("#tOk").disabled = !this.checked; };
  $("#tOk").onclick = function () {
    var b = this; b.disabled = true; note("#tMsg", "", "");
    call({ action: "terms_accept", version: t.version }).then(function (r) {
      S.me.office.terms = r.terms; closeSheet(); renderToday();
      if (after) after();
    }).catch(function (e) { note("#tMsg", e.message, "err"); b.disabled = false; });
  };
}

/* ---------- عملاء سابقون يطابقون العقار (المكتب يتواصل بنفسه، مقصد ما يرسل شي) ---------- */
function openMatchesPrompt(prop, n) {
  openSheet("تمت إضافة العقار",
    '<div class="matches-cta"><b class="num">' + n + "</b>" +
      "<p>" + (n === 1 ? "عميل سابق طلب" : "عملاء سابقين طلبوا") + " شي يطابق هذا العقار في آخر ٣٠ يوم</p></div>" +
    '<button class="btn" id="mcShow" type="button">اعرضهم</button>' +
    '<button class="btn ghost" id="mcLater" type="button" style="margin-top:8px">لاحقاً</button>');
  $("#mcShow").onclick = function () { openPropMatches(prop); };
  $("#mcLater").onclick = closeSheet;
}
function matchWaText(c, p) {
  var office = (S.me && S.me.office && S.me.office.name) || "المكتب";
  var nm = c.name ? " " + firstName(c.name) : "";
  var rent = p.deal_type === "إيجار";
  return "هلا" + nm + "، معك " + office + ". نزل عندنا " + p.property_type + (rent ? " للإيجار" : " للبيع") +
    " في " + p.district + (p.rooms ? " (" + [p.rooms + " غرف"].concat(pdBrief(p)).join("، ") + ")" : "") + " بـ " + money(p.price) + " ريال" + (rent ? " سنوياً" : "") +
    "، قريب من طلبك. يناسبك أرسل لك التفاصيل؟" + (p.ad_license_no ? "\nرقم ترخيص الإعلان: " + p.ad_license_no : "");
}
function openPropMatches(p) {
  openSheet("عملاء يطابقون العقار", skeleton(3));
  call({ action: "prop_matches", id: p.id }).then(function (r) {
    var list = r.customers || [], pr = r.property || p;
    if (!pr.details && p.details) pr = Object.assign({}, pr, { details: p.details });
    var licensed = !!pr.ad_license_no && (!pr.ad_license_expiry || pr.ad_license_expiry >= new Date().toISOString().slice(0, 10));
    var head = '<p class="hint tight">طلبات عملاء مكتبك في آخر <span class="num">' + (r.days || 30) + "</span> يوم تطابق «" +
      esc(pr.title) + "»: نفس نوع الطلب والعقار والحي، والسعر ضمن ميزانيتهم.</p>";
    if (!list.length) {
      openSheet("عملاء يطابقون العقار", head +
        state(ICON.inbox, "ما فيه عميل مطابق الحين", "لما يطلب عميل شي يشبه هذا العقار بيطلع هنا."));
      return;
    }
    var rows = list.map(function (c) {
      var sub = [c.location, c.budget ? money(c.budget) + " ريال" + (c.budget_period ? " " + c.budget_period : "") : null,
        c.rooms ? c.rooms + " غرف" : null, ago(c.last_at)].filter(Boolean).join(" · ");
      var wa = "https://wa.me/" + digits(c.phone) + (licensed ? "?text=" + encodeURIComponent(matchWaText(c, pr)) : "");
      return '<div class="pm-row"><div class="main"><b>' + esc(c.name || "عميل") + "</b>" +
          (c.status === "qualified" ? '<span class="tag ok">مؤهل</span>' : "") +
          '<span class="s num">' + esc(sub) + "</span></div>" +
        '<div class="btnrow">' +
          '<a class="btn sm ghost" href="tel:+' + digits(c.phone) + '">' + svg(ICON.phone) + " اتصال</a>" +
          '<a class="btn sm wa" href="' + wa + '" target="_blank" rel="noopener">' + svg(ICON.wa) + " واتساب</a>" +
          '<button class="btn sm ghost" type="button" data-lead="' + esc(c.id) + '">البطاقة</button>' +
        "</div></div>";
    }).join("");
    openSheet("عملاء يطابقون العقار (" + list.length + ")", head +
      (licensed ? "" : '<p class="msg warn">هذا العقار بلا ترخيص إعلان ساري — اتصل بالعميل واسأله عن طلبه، ولا ترسل تفاصيل العقار قبل ترخيصه.</p>') +
      '<div class="pm-list">' + rows + "</div>" +
      '<p class="hint">مقصد ما يرسل لهم أي شي. تواصل فقط مع اللي طلبه ما زال قائم، وإذا قال ما يبي سجّل نتيجته «ما تمت» عشان ما يطلع لك مرة ثانية.</p>');
    var bs = document.querySelectorAll(".pm-row [data-lead]");
    for (var i = 0; i < bs.length; i++) bs[i].onclick = function () { openLead(this.getAttribute("data-lead")); };
  }).catch(function (e) {
    openSheet("عملاء يطابقون العقار", '<div id="pmMsg"></div>'); note("#pmMsg", e.message, "err");
  });
}

/* ---------- أول دخول لصاحب المكتب ---------- */
var OB = [
  { k: "office", t: "بيانات مكتبك" },
  { k: "notify", t: "وين يوصلك العميل الجاهز" },
  { k: "property", t: "أضف أول عقار" },
  { k: "team", t: "أضف وسطاء مكتبك" },
];
function isOwnerMe() { return !!(S.me && S.me.staff && S.me.staff.role === "owner"); }
function obDone(k) { return !!((S.me.office.onboarding || {})[k]); }
function obLeft() { return OB.filter(function (x) { return !obDone(x.k); }).length; }

function maybeOnboard() {
  if (!isOwnerMe() || S.me.office.onboarded) return;
  var later = null;
  try { later = sessionStorage.getItem("maqsad_ob_later"); } catch (e) {}
  if (!later) openOnboard(-1);
}
function onboardItems() {
  if (termsPending()) return [{ kind: "warn", icon: ICON.check, title: "وافق على اتفاقية معالجة البيانات",
    body: "مطلوبة من صاحب المكتب قبل تشغيل المساعد لعملائك — دقيقة وحدة",
    go: function () { openTerms(); } }];
  if (!isOwnerMe() || S.me.office.onboarded) return [];
  var left = obLeft();
  return [{ kind: "", icon: ICON.check, title: "كمّل تجهيز مكتبك",
    body: left ? "باقي " + left + " من " + OB.length + " خطوات — دقيقتين" : "خلّصت الخطوات، اضغط «إنهاء»",
    why: OB.map(function (x) { return (obDone(x.k) ? "✓ " : "") + x.t; }).join(" · "),
    go: function () { openOnboard(-1); } }];
}
function obMark(k, finish) {
  var body = { action: "onboarding_save", done: k ? [k] : [] };
  if (finish) body.finish = true;
  return call(body).then(function (r) {
    S.me.office.onboarding = r.onboarding; S.me.office.onboarded = r.onboarded;
    renderToday();
  });
}

function openOnboard(start) {
  openSheet("تجهيز مكتبك", '<div id="ob"></div>');
  var leave = function () {
    try { sessionStorage.setItem("maqsad_ob_later", "1"); } catch (e) {}
    closeSheet(); renderToday();
  };
  $("#sheetClose").onclick = leave; $("#scrim").onclick = leave;

  function nextUndone(from) {
    for (var k = from; k < OB.length; k++) if (!obDone(OB[k].k)) return k;
    return OB.length;
  }
  function paint(i) {
    homeNotify();
    var h = $("#ob"), o = S.me.office, name = firstName(S.me.staff.name);
    $("#sheetBody").scrollTop = 0;
    if (i < 0) {
      h.innerHTML = '<div class="ob-hi"><h4>هلا ' + esc(name) + '، خلنا نجهّز مكتبك</h4>' +
        '<p>أربع خطوات قصيرة، وبعدها المساعد يستقبل عملاءك ويوصلك الجاهز منهم.</p>' +
        '<ol class="ob-list">' + OB.map(function (x) {
          return '<li class="' + (obDone(x.k) ? "done" : "") + '">' + (obDone(x.k) ? svg(ICON.check) : "") + "<span>" + esc(x.t) + "</span></li>";
        }).join("") + "</ol></div>" +
        '<div class="wz-nav"><button class="btn" type="button" id="obGo">' + (obLeft() < OB.length ? "كمّل" : "ابدأ") + "</button>" +
        '<button class="btn ghost" type="button" id="obLater">لاحقاً</button></div>';
      $("#obGo").onclick = function () { paint(nextUndone(0)); };
      $("#obLater").onclick = leave;
      return;
    }
    if (i >= OB.length) {
      h.innerHTML = '<div class="ob-hi"><h4>مكتبك جاهز</h4><p>' +
        (falOf(o).state === "ok" ? "المساعد يشتغل الحين ويستقبل عملاءك."
          : "باقي خطوة وحدة علينا: نتحقق من رخصة فال، وبعدها يبدأ المساعد يرد على عملاءك. نبلغك أول ما نخلّص.") +
        "</p></div>" + '<div class="wz-nav"><button class="btn" type="button" id="obEnd">تمام</button></div><div id="obMsg"></div>';
      $("#obEnd").onclick = function () {
        var b = this; b.disabled = true;
        obMark(null, true).then(leave).catch(function (e) { note("#obMsg", e.message, "err"); b.disabled = false; });
      };
      return;
    }
    var step = OB[i], head = stepHead(i, OB.length, step.t);
    var navH = function (label) {
      return '<div class="wz-nav"><button class="btn" type="button" id="obNext">' + esc(label || "التالي") + "</button>" +
        '<button class="btn ghost" type="button" id="obSkip">تخطّ</button></div><div id="obMsg"></div>';
    };
    var next = function (b) {
      if (b) b.disabled = true;
      obMark(step.k).then(function () { paint(i + 1); })
        .catch(function (e) { note("#obMsg", e.message, "err"); if (b) b.disabled = false; });
    };
    if (step.k === "office") {
      var f = falOf(o);
      h.innerHTML = head +
        '<div class="card"><dl class="dl">' +
          "<div><dt>اسم المكتب</dt><dd>" + esc(o.name) + "</dd></div>" +
          '<div><dt>رخصة فال</dt><dd class="num">' + esc(o.license_no || "—") + "</dd></div>" +
          "<div><dt>حالتها</dt><dd>" + falTag(f) + "</dd></div>" +
          '<div><dt>رقم واتساب المكتب</dt><dd class="num">' + esc(o.wa_number ? fmtPhone(o.wa_number) : "نربطه لك") + "</dd></div>" +
        "</dl></div>" +
        '<p class="hint">هذي البيانات تضبطها مقصد بعد التحقق من الرخصة. فيها خطأ أو تجددت رخصتك؟ ' +
        '<button type="button" class="linkbtn" id="obFix">اطلب تعديل</button></p>' + navH("صحيحة، التالي");
      $("#obFix").onclick = function () { openFalRequest(function () { openOnboard(0); }); };
    } else if (step.k === "notify") {
      h.innerHTML = head + '<p class="hint tight">أول ما يكتمل طلب عميل نرسله لك فوراً. اختر طريقة وحدة أو الاثنين.</p>' +
        '<div id="obNotify"></div>' + navH();
      var card = $("#notifyCard");
      if (card) { $("#obNotify").appendChild(card); renderNotify(); }
    } else if (step.k === "property") {
      h.innerHTML = head + '<p class="hint tight">المساعد يعرض على العملاء العقارات المتاحة عندك اللي عندها ترخيص إعلان ساري.</p>' +
        (S.props.length ? '<p class="msg ok">' + svg(ICON.check) + "<span>عندك " + S.props.length + " عقار مضاف.</span></p>" : "") +
        '<div class="wz-nav"><button class="btn" type="button" id="obProp">أضف عقار</button>' +
        (S.props.length ? '<button class="btn ghost" type="button" id="obNext">التالي</button>' : "") +
        '<button class="btn ghost" type="button" id="obSkip">تخطّ</button></div><div id="obMsg"></div>';
      $("#obProp").onclick = function () {
        openPropWizard(function () {
          obMark("property").then(function () { openOnboard(nextUndone(i + 1)); })
            .catch(function () { openOnboard(i + 1); });
        });
      };
    } else if (step.k === "team") {
      h.innerHTML = head + '<p class="hint tight">كل وسيط يدخل التطبيق برقم جواله، ويشوف العملاء ويسجّل نتيجة اتصاله.</p>' +
        '<div class="rows" id="obTeam"><div class="skel skel-row"></div></div>' +
        '<div class="grid2"><div class="field"><label for="obTName">اسم الوسيط</label><input id="obTName" class="input" autocomplete="off"></div>' +
        '<div class="field"><label for="obTPhone">جواله</label><input id="obTPhone" class="input ltr" type="tel" inputmode="tel" placeholder="05XXXXXXXX">' +
        '<p class="hint" id="obTHint"></p></div></div>' +
        '<button class="btn ghost" type="button" id="obTAdd">أضف الوسيط</button>' + navH("خلصت، التالي");
      var loadTeam = function () {
        return call({ action: "staff_list" }).then(function (r) {
          var list = (r.staff || []).filter(function (x) { return x.role === "agent" && x.active !== false; });
          $("#obTeam").innerHTML = list.length ? list.map(function (x) {
            return '<div class="row static"><div class="main"><span class="t">' + esc(x.name) + '</span><span class="s ltr num">' +
              esc(fmtPhone(x.phone)) + "</span></div></div>";
          }).join("") : '<p class="hint">ما أضفت وسطاء بعد. إذا تشتغل لحالك، تخطّ الخطوة.</p>';
        }).catch(function () { $("#obTeam").innerHTML = ""; });
      };
      loadTeam();
      $("#obTPhone").oninput = function () {
        var p = normPhone(this.value), bad = this.value.trim() ? phoneIssue(p) : null;
        $("#obTHint").className = "hint " + (bad ? "warn" : this.value.trim() ? "good" : "");
        $("#obTHint").textContent = bad || (this.value.trim() ? fmtPhone(p) : "");
      };
      $("#obTAdd").onclick = function () {
        var b = this, p = normPhone($("#obTPhone").value), bad = phoneIssue(p);
        if (!$("#obTName").value.trim()) { note("#obMsg", "اكتب اسم الوسيط", "err"); return; }
        if (bad) { note("#obMsg", bad, "err"); return; }
        b.disabled = true; note("#obMsg", "", "");
        call({ action: "staff_save", staff: { name: $("#obTName").value.trim(), phone: p, role: "agent" } }).then(function () {
          $("#obTName").value = ""; $("#obTPhone").value = ""; $("#obTHint").textContent = "";
          note("#obMsg", "أضفناه. يدخل برقم جواله ويوصله رمز الدخول على الواتساب.", "ok");
          return loadTeam();
        }).catch(function (e) { note("#obMsg", e.message, "err"); }).then(function () { b.disabled = false; });
      };
    }
    if ($("#obNext")) $("#obNext").onclick = function () { next(this); };
    if ($("#obSkip")) $("#obSkip").onclick = function () { paint(i + 1); };
  }
  paint(start);
}

/* ---------- رخصة فال: صاحب المكتب يطلب التعديل، ومقصد تعدّل ---------- */
function renderFalRequest() {
  var h = $("#falReqBox");
  if (!h) return;
  var o = S.me.office;
  if (!isOwnerMe()) { h.innerHTML = ""; return; }
  h.innerHTML = o.fal_request
    ? '<div class="msg ok">' + svg(ICON.clock) + "<span>أرسلت طلب تعديل الرخصة " + esc(ago(o.fal_request.at)) +
      ". نراجعه ونبلغك أول ما نخلّص.</span></div>"
    : '<button class="btn ghost" type="button" id="btnFalReq">' + (falOf(o).state === "ok" ? "تجددت رخصتك؟ اطلب تعديل" : "ارفع صورة رخصة فال") + "</button>" +
      '<p class="hint">رقم الرخصة وبياناتها تعدّلها مقصد بعد التحقق من الهيئة — عشان ما يشتغل أي مكتب بلا ترخيص.</p>';
  if ($("#btnFalReq")) $("#btnFalReq").onclick = function () { openFalRequest(); };
}

function readUpload(file) {
  if (!file) return Promise.reject(new Error("اختر صورة الرخصة أو ملف PDF"));
  if (file.type === "application/pdf") {
    if (file.size > 3 * 1024 * 1024) return Promise.reject(new Error("الملف كبير — الحد ٣ ميجابايت. صوّر الرخصة بدل الـ PDF"));
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error("تعذّرت قراءة الملف")); };
      fr.readAsDataURL(file);
    });
  }
  return shrinkImage(file);
}

function openFalRequest(after) {
  openSheet("طلب تعديل رخصة فال",
    '<p class="lead">ارفع صورة شهادة رخصة فال الجديدة (أو ملف PDF). نطابقها مع استعلام الهيئة العامة للعقار، ونعدّل بيانات مكتبك.</p>' +
    '<div class="field"><span class="flabel">صورة الرخصة</span>' +
      '<input id="frFile" class="vh" type="file" accept="image/*,application/pdf">' +
      '<div class="fal-pickrow"><label class="btn ghost fal-pick" for="frFile" id="frPick">اختر الصورة أو الملف</label></div>' +
      '<p class="hint" id="frName"></p></div>' +
    '<div class="field"><label for="frNote">وش تغيّر؟ <span class="opt">(اختياري)</span></label>' +
      '<textarea id="frNote" class="input" rows="2" maxlength="300" placeholder="مثلاً: جددت الرخصة لسنة"></textarea></div>' +
    '<button class="btn" type="button" id="frSend" disabled>أرسل الطلب</button><div id="frMsg"></div>');
  var data = null;
  $("#frFile").onchange = function () {
    var f = this.files && this.files[0];
    $("#frName").textContent = f ? f.name : "";
    $("#frSend").disabled = true; note("#frMsg", "", "");
    readUpload(f).then(function (u) { data = u; $("#frSend").disabled = false; $("#frPick").textContent = "غيّر الملف"; })
      .catch(function (e) { data = null; note("#frMsg", e.message, "err"); });
  };
  $("#frSend").onclick = function () {
    var b = this; b.disabled = true; note("#frMsg", "جاري الإرسال…", "ok");
    call({ action: "fal_request", file: data, note: $("#frNote").value }).then(function () {
      S.me.office.fal_request = { at: new Date().toISOString(), note: $("#frNote").value || null };
      renderFalRequest();
      note("#frMsg", "وصل طلبك. نراجعه ونبلغك.", "ok");
      setTimeout(function () { if (after) after(); else closeSheet(); }, 900);
    }).catch(function (e) { note("#frMsg", e.message, "err"); b.disabled = false; });
  };
}

/* ---------- «سجّل مكتبك» من شاشة الدخول ---------- */
var JOIN_API = "https://dindcejhsaxqwdkxtkcy.supabase.co/functions/v1/join?forceFunctionRegion=eu-central-1";
function openSignup() {
  var started = Date.now(), file = null;
  openSheet("سجّل مكتبك في مقصد",
    '<p class="lead">عبّ البيانات وارفع صورة رخصة فال. نراجع طلبك ونتواصل معك على الواتساب لترتيب التشغيل.</p>' +
    '<div class="field"><label for="suOffice">اسم المكتب</label><input id="suOffice" class="input" maxlength="120" autocomplete="organization"></div>' +
    '<div class="field"><label for="suName">اسمك</label><input id="suName" class="input" maxlength="80" autocomplete="name"></div>' +
    '<div class="grid2"><div class="field"><label for="suPhone">جوال الواتساب</label>' +
      '<input id="suPhone" class="input ltr" type="tel" inputmode="tel" placeholder="05XXXXXXXX" autocomplete="tel"></div>' +
      '<div class="field"><label for="suCity">المدينة</label><input id="suCity" class="input" maxlength="40" placeholder="الرياض"></div></div>' +
    '<div class="field"><label for="suFal">رقم رخصة فال</label><input id="suFal" class="input ltr" inputmode="numeric" maxlength="20"></div>' +
    '<div class="field"><span class="flabel">صورة رخصة فال</span>' +
      '<input id="suFile" class="vh" type="file" accept="image/*,application/pdf">' +
      '<div class="fal-pickrow"><label class="btn ghost fal-pick" for="suFile" id="suPick">اختر صورة الرخصة أو PDF</label></div>' +
      '<p class="hint" id="suFileName">نتحقق منها من الهيئة العامة للعقار قبل التشغيل.</p></div>' +
    '<div class="field"><label for="suAgents">عدد الوسطاء</label><select id="suAgents" class="input">' +
      '<option value="">اختر</option><option value="1">وحدي</option><option value="2-5">٢ إلى ٥</option>' +
      '<option value="6-15">٦ إلى ١٥</option><option value="16+">أكثر من ١٥</option></select></div>' +
    '<div class="hp" aria-hidden="true"><input id="suWeb" tabindex="-1" autocomplete="off"></div>' +
    '<label class="toggle" for="suConsent"><input id="suConsent" type="checkbox"><span>أوافق على ' +
      '<a href="https://maqsadapp.com/privacy.html" target="_blank" rel="noopener">سياسة الخصوصية</a>، وعلى تواصلكم معي على الواتساب بخصوص الطلب.</span></label>' +
    '<button class="btn" type="button" id="suSend">أرسل الطلب</button><div id="suMsg"></div>');
  $("#suFile").onchange = function () {
    var f = this.files && this.files[0];
    file = null; note("#suMsg", "", "");
    if (!f) return;
    $("#suFileName").textContent = f.name;
    readUpload(f).then(function (u) { file = u; $("#suPick").textContent = "غيّر الملف"; })
      .catch(function (e) { note("#suMsg", e.message, "err"); });
  };
  $("#suSend").onclick = function () {
    var b = this, v = function (id) { return $(id).value.trim(); };
    var phone = normPhone(v("#suPhone")), fal = digits(latinDigits(v("#suFal")));
    var err = v("#suOffice").length < 2 ? "اكتب اسم المكتب" : v("#suName").length < 2 ? "اكتب اسمك"
      : !/^9665\d{8}$/.test(phone) ? "اكتب رقم جوال سعودي يبدأ بـ 05" : fal.length < 4 ? "اكتب رقم رخصة فال"
      : !file ? "ارفع صورة رخصة فال" : !$("#suConsent").checked ? "الموافقة على سياسة الخصوصية مطلوبة" : null;
    if (err) { note("#suMsg", err, "err"); return; }
    b.disabled = true; b.textContent = "جاري الإرسال…"; note("#suMsg", "", "");
    fetch(JOIN_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      v: 2, office_name: v("#suOffice"), contact_name: v("#suName"), phone: phone, city: v("#suCity"),
      fal_license: fal, fal_file: file, agents: $("#suAgents").value, consent: true, website: v("#suWeb"),
      t: Date.now() - started,
    }) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.j.ok) {
          var f = res.j.fields ? Object.keys(res.j.fields).map(function (k) { return res.j.fields[k]; })[0] : null;
          throw new Error(f || res.j.error || "تعذّر الإرسال الآن، حاول بعد دقيقة");
        }
        $("#sheetBody").innerHTML = '<div class="ob-hi"><h4>' + (res.j.duplicate ? "طلبك وصلنا من قبل" : "وصل طلبك") + "</h4>" +
          "<p>نراجع بيانات مكتبك ورخصة فال، ونتواصل معك على الواتساب على الرقم <bdi class=\"ltr num\">" + esc(fmtPhone(phone)) + "</bdi>" +
          ". بعد التفعيل تدخل التطبيق بنفس الرقم.</p></div>" +
          '<button class="btn" type="button" id="suOk">تمام</button>';
        $("#suOk").onclick = closeSheet;
      }).catch(function (e) {
        note("#suMsg", e.message === "Failed to fetch" ? "ما قدرنا نوصل للخادم. تأكد من الإنترنت وحاول مرة ثانية." : e.message, "err");
        b.disabled = false; b.textContent = "أرسل الطلب";
      });
  };
}

/* ---------- إزالة أي شارة يحقنها المستضيف ---------- */
(function sweep() {
  function kill() {
    try {
      var all = document.querySelectorAll("body > a, body > div, [id*='netlify' i], [class*='netlify' i]");
      for (var i = 0; i < all.length; i++) {
        var n = all[i];
        if (n.id === "app" || n.id === "auth" || n.id === "sheet" || n.id === "scrim") continue;
        var t = (n.textContent || "").trim().toLowerCase();
        var href = (n.getAttribute && n.getAttribute("href")) || "";
        if (t === "powered by netlify" || /netlify/i.test(href) || /netlify/i.test(n.id || "")) n.remove();
      }
    } catch (e) {}
  }
  kill();
  var c = 0, iv = setInterval(function () { kill(); if (++c > 20) clearInterval(iv); }, 500);
  try { new MutationObserver(kill).observe(document.body, { childList: true }); } catch (e) {}
})();

bind();
boot();

})();
