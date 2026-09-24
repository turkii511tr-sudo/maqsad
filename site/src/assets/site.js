/* مقصد — سكربت الموقع: الترويسة، ونموذج الانضمام، ونموذج التواصل، وفهرس الصفحات القانونية.
   بلا مكتبات ولا تتبّع ولا ملفات تعريف ارتباط. */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ---------- الترويسة: خط سفلي بعد بدء التمرير ---------- */
  var top = $("#top");
  if (top) {
    var onScroll = function () { top.classList.toggle("stuck", window.scrollY > 4); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- أدوات ---------- */
  var AR = "٠١٢٣٤٥٦٧٨٩", FA = "۰۱۲۳۴۵۶۷۸۹";
  function latin(v) {
    return String(v == null ? "" : v)
      .replace(/[٠-٩]/g, function (d) { return String(AR.indexOf(d)); })
      .replace(/[۰-۹]/g, function (d) { return String(FA.indexOf(d)); });
  }
  function saudiMobile(v) {
    var d = latin(v).replace(/\D/g, "");
    if (d.indexOf("00") === 0) d = d.slice(2);
    if (d.indexOf("05") === 0 && d.length === 10) d = "966" + d.slice(1);
    if (d.indexOf("5") === 0 && d.length === 9) d = "966" + d;
    return /^9665\d{8}$/.test(d) ? d : null;
  }
  function clean(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
  function val(form, name) {
    var el = form.elements[name];
    return el ? (el.type === "checkbox" ? el.checked : el.value) : "";
  }

  function fieldBox(form, name) {
    var el = form.elements[name];
    if (!el) return null;
    return el.type === "checkbox" ? el.closest(".check") : el.closest(".field");
  }
  function clearErrors(form) {
    var bad = form.querySelectorAll(".bad");
    for (var i = 0; i < bad.length; i++) bad[i].classList.remove("bad");
    var errs = form.querySelectorAll(".ferr");
    for (var j = 0; j < errs.length; j++) errs[j].remove();
    var inv = form.querySelectorAll("[aria-invalid]");
    for (var k = 0; k < inv.length; k++) inv[k].removeAttribute("aria-invalid");
  }
  function showErrors(form, errors) {
    var first = null;
    Object.keys(errors).forEach(function (name) {
      var box = fieldBox(form, name), el = form.elements[name];
      if (!box || !el) return;
      box.classList.add("bad");
      el.setAttribute("aria-invalid", "true");
      var p = document.createElement("p");
      p.className = "ferr";
      p.id = (el.id || name) + "Err";
      p.textContent = errors[name];
      if (el.type === "checkbox") box.insertAdjacentElement("afterend", p); else box.appendChild(p);
      var d = (el.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
      if (d.indexOf(p.id) < 0) d.push(p.id);
      el.setAttribute("aria-describedby", d.join(" "));
      if (!first) first = el;
    });
    if (first) first.focus();
  }
  function say(el, text, kind) {
    el.textContent = text || "";
    el.className = "form-msg" + (kind ? " " + kind : "");
  }

  /* ---------- ربط نموذج بنقطة الإرسال ---------- */
  function wire(form, opts) {
    var started = Date.now();
    var btn = form.querySelector("[type=submit]");
    var msg = form.querySelector(".form-msg");
    var label = btn.textContent;
    var busy = false;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
      clearErrors(form);
      say(msg, "");
      var data = opts.collect(form);
      var errors = opts.validate(data);
      if (Object.keys(errors).length) {
        showErrors(form, errors);
        say(msg, "راجع الحقول المظللة بالأحمر.", "err");
        return;
      }
      var endpoint = form.getAttribute("data-endpoint");
      if (!endpoint) {
        say(msg, "هذي نسخة معاينة — الإرسال يشتغل في الموقع المنشور.", "ok");
        return;
      }
      data.t = Date.now() - started;
      busy = true;
      btn.disabled = true;
      btn.textContent = "جاري الإرسال…";
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(function (r) {
        return r.json().catch(function () { return {}; })
          .then(function (j) { return { status: r.status, body: j || {} }; });
      }).then(function (res) {
        if (res.status === 200 && res.body.ok) { opts.done(res.body, data); return; }
        if (res.status === 422 && res.body.fields) showErrors(form, res.body.fields);
        say(msg, res.body.error || "تعذّر الإرسال الآن. حاول بعد دقيقة.", "err");
      }).catch(function () {
        say(msg, "ما قدرنا نوصل للخادم. تأكد من اتصالك بالإنترنت وحاول مرة ثانية.", "err");
      }).then(function () {
        busy = false;
        btn.disabled = false;
        btn.textContent = label;
      });
    });
  }

  function finish(form, done, title, text) {
    form.hidden = true;
    done.querySelector("h3").textContent = title;
    done.querySelector("p").textContent = text;
    done.hidden = false;
    done.focus();
  }

  /* ---------- نموذج الانضمام ---------- */
  var join = $("#joinForm");
  if (join) {
    wire(join, {
      collect: function (f) {
        return {
          office_name: clean(val(f, "office_name")),
          contact_name: clean(val(f, "contact_name")),
          phone: clean(val(f, "phone")),
          city: clean(val(f, "city")),
          fal_license: latin(val(f, "fal_license")).replace(/\D/g, ""),
          agents: val(f, "agents"),
          note: clean(val(f, "note")),
          consent: val(f, "consent") === true,
          website: val(f, "website"),
        };
      },
      validate: function (d) {
        var e = {};
        if (d.office_name.length < 2) e.office_name = "اكتب اسم المكتب";
        if (d.contact_name.length < 2) e.contact_name = "اكتب اسمك";
        if (!saudiMobile(d.phone)) e.phone = "اكتب رقم جوال سعودي يبدأ بـ 05";
        if (d.fal_license && (d.fal_license.length < 4 || d.fal_license.length > 20)) e.fal_license = "رقم رخصة فال من ٤ إلى ٢٠ رقماً";
        if (!d.consent) e.consent = "الموافقة على سياسة الخصوصية مطلوبة لإرسال الطلب";
        return e;
      },
      done: function (r, d) {
        var local = "0" + saudiMobile(d.phone).slice(3);
        finish(join, $("#joinDone"),
          r.duplicate ? "طلبك وصلنا من قبل" : "وصل طلبك",
          r.duplicate
            ? "ما يحتاج ترسله مرة ثانية — بنتواصل معك على الواتساب على الرقم " + local + "."
            : "بنتواصل معك على الواتساب على الرقم " + local + ". إذا كان الرقم غلط، عبّ النموذج من جديد.");
      },
    });
  }

  /* ---------- نموذج التواصل ---------- */
  var contact = $("#contactForm");
  if (contact) {
    wire(contact, {
      collect: function (f) {
        return {
          name: clean(val(f, "name")),
          phone: clean(val(f, "phone")),
          email: clean(val(f, "email")).toLowerCase(),
          topic: val(f, "topic"),
          message: String(val(f, "message") || "").trim(),
          consent: val(f, "consent") === true,
          website: val(f, "website"),
        };
      },
      validate: function (d) {
        var e = {};
        if (d.name.length < 2) e.name = "اكتب اسمك";
        if (!d.phone && !d.email) e.phone = "اكتب جوالك أو بريدك عشان نقدر نرد عليك";
        if (d.phone && !saudiMobile(d.phone)) e.phone = "اكتب رقم جوال سعودي يبدأ بـ 05";
        if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) e.email = "البريد غير صحيح";
        if (!d.topic) e.topic = "اختر موضوع الرسالة";
        if (d.message.length < 10) e.message = "اكتب رسالتك (١٠ أحرف على الأقل)";
        if (!d.consent) e.consent = "الموافقة على سياسة الخصوصية مطلوبة للإرسال";
        return e;
      },
      done: function (r, d) {
        var privacy = d.topic === "privacy";
        finish(contact, $("#contactDone"), "وصلت رسالتك",
          privacy
            ? "سجّلنا طلبك الخاص ببياناتك، ونرد عليك خلال ٣٠ يوماً كحد أقصى — وغالباً أسرع بكثير."
            : "نرد عليك " + (d.phone ? "على الواتساب" : "على بريدك") + " في أقرب وقت.");
      },
    });
  }

  /* ---------- فهرس الصفحات القانونية: إبراز القسم الحالي ---------- */
  var toc = document.querySelectorAll(".toc a[href^='#']");
  if (toc.length && "IntersectionObserver" in window) {
    var map = {};
    for (var i = 0; i < toc.length; i++) map[toc[i].getAttribute("href").slice(1)] = toc[i];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        for (var k in map) map[k].removeAttribute("aria-current");
        var a = map[en.target.id];
        if (a) a.setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }
})();
