#!/usr/bin/env python3
"""بناء موقع مقصد.

  python3 build.py            ← يبني dist/ (للنشر على Netlify) و preview/ (للمعاينة)

يقرأ site.config.json، ويجمّع الأجزاء المشتركة، ويعبّئ القيم، ويولّد ملفات Netlify
(_headers و _redirects) وخريطة الموقع، ويطبع تنبيهاً لكل قيمة ناقصة.
"""
import hashlib, html, json, re, shutil, sys
from pathlib import Path

import art
import fonts_src

ROOT = Path(__file__).resolve().parent
SRC, DIST, PREV = ROOT / "src", ROOT / "dist", ROOT / "preview"
MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
PAGES = ["index.html", "privacy.html", "terms.html", "refund.html", "contact.html", "404.html"]
PIN = "?forceFunctionRegion=eu-central-1"


def load_cfg():
    cfg = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
    warn = []
    for k, label in [("legal_name", "الاسم النظامي للمنشأة"), ("cr_number", "رقم السجل التجاري"),
                     ("address", "العنوان الوطني"), ("email", "بريد التواصل"), ("site_url", "رابط الموقع النهائي")]:
        if not str(cfg.get(k, "")).strip():
            warn.append(f"ناقص: {label} ({k})")
    return cfg, warn


def ar_date(iso):
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{art.ar(d)} {MONTHS[m - 1]} {art.ar(y)}"


def front(text):
    m = re.match(r"\s*<!--page\n(.*?)\n-->\n", text, re.S)
    meta = {}
    for line in m.group(1).splitlines():
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip()
    return meta, text[m.end():]


def render(tpl, ctx):
    def cond(m):
        neg, key, body = m.group(1) == "ifnot", m.group(2), m.group(3)
        return body if bool(ctx.get(key)) != neg else ""
    for _ in range(3):
        tpl = re.sub(r"<!--(if|ifnot):(\w+)-->(.*?)<!--/\1:\2-->", cond, tpl, flags=re.S)
    tpl = re.sub(r"\{\{icon:(\w+)\}\}", lambda m: art.icon(m.group(1)), tpl)

    def var(m):
        k = m.group(1)
        if k not in ctx:
            raise KeyError(f"متغير غير معرّف: {k}")
        return str(ctx[k])
    return re.sub(r"\{\{(\w+)\}\}", var, tpl)


def short_hash(b):
    return hashlib.sha256(b).hexdigest()[:10]


def headers_file(api_origin):
    csp = "; ".join([
        "default-src 'self'", "script-src 'self'", "style-src 'self'", "font-src 'self'",
        "img-src 'self' data:", f"connect-src {api_origin}", "form-action 'self'", "base-uri 'self'",
        "frame-ancestors 'none'", "object-src 'none'", "manifest-src 'self'", "upgrade-insecure-requests",
    ])
    return f"""/*
  Content-Security-Policy: {csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Cross-Origin-Opener-Policy: same-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/gf/*
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *

/*.png
  Cache-Control: public, max-age=604800

/favicon.svg
  Cache-Control: public, max-age=604800
"""


def build(mode, cfg):
    out = DIST if mode == "dist" else PREV
    if out.exists():
        shutil.rmtree(out)
    (out / "assets").mkdir(parents=True)

    css = (SRC / "assets" / "site.css").read_text(encoding="utf-8")
    js = (SRC / "assets" / "site.js").read_text(encoding="utf-8")
    fonts_css = fonts_src.css("/gf/")
    site_url = cfg.get("site_url", "").rstrip("/")
    api = cfg["api_base"].rstrip("/")
    owner = cfg.get("legal_name") or cfg["brand"]

    base_ctx = {
        "brand": cfg["brand"],
        "owner_name": html.escape(owner),
        "legal_name": html.escape(cfg.get("legal_name", "")),
        "cr_number": html.escape(cfg.get("cr_number", "")),
        "vat_number": html.escape(cfg.get("vat_number", "")),
        "address": html.escape(cfg.get("address", "")),
        "email": html.escape(cfg.get("email", "")),
        "app_url": html.escape(cfg["app_url"]),
        "jurisdiction_city": html.escape(cfg.get("jurisdiction_city") or "الرياض"),
        "effective_date_ar": ar_date(cfg["effective_date"]),
        "refund_days_ar": art.ar(cfg.get("refund_days", 14)),
        "year_ar": art.ar(cfg["effective_date"][:4]),
        "phase_early": cfg.get("launch_phase", "early") == "early",
        "phase_live": cfg.get("launch_phase") == "live",
        "mono": art.monogram(), "wordmark": art.wordmark(), "heromap": art.plan_svg(cls="plan"), "seal": art.SEAL, "hand": art.HAND,
        "plan404": art.plan_svg(cls="plan404", missing=211, pick=False),
        # تثبيت المعالجة في فرانكفورت (نفس منطقة قاعدة البيانات) كما تنص سياسة الخصوصية
        "join_endpoint": f"{api}/join{PIN}" if mode == "dist" else "",
        "contact_endpoint": f"{api}/contact{PIN}" if mode == "dist" else "",
    }

    if mode == "dist":
        ch, jh, fh = (short_hash(x.encode()) for x in (css, js, fonts_css))
        (out / "assets" / f"site.{ch}.css").write_text(css, encoding="utf-8")
        (out / "assets" / f"site.{jh}.js").write_text(js, encoding="utf-8")
        (out / "assets" / f"fonts.{fh}.css").write_text(fonts_css, encoding="utf-8")
    partials = {n: (SRC / "partials" / f"{n}.html").read_text(encoding="utf-8")
                for n in ("head", "header", "footer", "scripts")}

    for name in PAGES:
        meta, body = front((SRC / "pages" / name).read_text(encoding="utf-8"))
        is404 = name == "404.html"
        b = "/" if (is404 and mode == "dist") else ""
        home = meta.get("home", "")
        if is404:
            home = "/" if mode == "dist" else "index.html"
        ctx = dict(base_ctx)
        ctx.update({
            "title": html.escape(meta["title"]), "description": html.escape(meta["description"]),
            "og_title": html.escape(meta.get("og_title", meta["title"])), "home": home,
            "robots": meta.get("robots", "index,follow") if mode == "dist" else "noindex,nofollow",
        })
        if mode == "dist":
            canon = f"{site_url}{'' if meta['path'] == '/' else meta['path']}" if site_url else ""
            ctx["canonical"] = f'<link rel="canonical" href="{canon or "/"}">\n' if site_url and not is404 else ""
            img = f"{site_url}/og.png" if site_url else f"{b}og.png"
            ctx["og_extra"] = (f'<meta property="og:url" content="{canon}">\n' if canon and not is404 else "") + \
                f'<meta property="og:image" content="{img}">\n<meta property="og:image:width" content="1200">\n' \
                f'<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="مقصد — مساعد واتساب لمكاتب العقار">\n'
            pre = "".join(f'<link rel="preload" href="{f[3].replace(fonts_src.G, "/gf/")}" as="font" type="font/woff2" crossorigin>\n'
                          for f in fonts_src.FACES if f[:3] in fonts_src.PRELOAD)
            ctx["font_tags"] = pre.rstrip("\n")
            ctx["style_tags"] = (f'<link rel="stylesheet" href="{b}assets/fonts.{fh}.css">\n'
                                 f'<link rel="stylesheet" href="{b}assets/site.{ch}.css">')
            ctx["script_tags"] = f'<script src="{b}assets/site.{jh}.js" defer></script>'
            ctx["jsonld"] = ""
            if site_url and name == "index.html":
                ld = {"@context": "https://schema.org", "@type": "Organization", "name": cfg["brand"],
                      "url": site_url, "logo": f"{site_url}/apple-touch-icon.png"}
                if cfg.get("legal_name"):
                    ld["legalName"] = cfg["legal_name"]
                if cfg.get("email"):
                    ld["email"] = cfg["email"]
                ctx["jsonld"] = '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>\n"
        else:
            ctx["canonical"] = ""
            ctx["og_extra"] = ""
            ctx["font_tags"] = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
                                '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                                f'<link rel="stylesheet" href="{fonts_src.GOOGLE_CSS}">')
            ctx["style_tags"] = f"<style>\n{css}</style>"
            ctx["script_tags"] = f"<script>\n{js}</script>"
            ctx["jsonld"] = ""
        doc = partials["head"] + partials["header"] + body + partials["footer"] + partials["scripts"]
        # روابط الصفحات الداخلية في التذييل والترويسة: مطلقة في صفحة 404 (تُعرض على أي مسار)
        page = render(doc, ctx)
        if b == "/":
            page = re.sub(r'href="((?:privacy|terms|refund|contact|index)\.html[^"]*)"', r'href="/\1"', page)
            page = page.replace('href="favicon.svg"', 'href="/favicon.svg"').replace('href="favicon-32.png"', 'href="/favicon-32.png"') \
                       .replace('href="apple-touch-icon.png"', 'href="/apple-touch-icon.png"')
        if mode == "preview":
            # المعاينة تُنشر كصفحة على claude.ai: بلا أيقونات خارجية، والرئيسية على «./»
            page = re.sub(r'<link rel="(?:icon|apple-touch-icon)"[^>]*>\n', "", page)
            page = page.replace('href="index.html#', 'href="./#').replace('href="index.html"', 'href="./"')
        if mode == "preview" and name == "index.html":
            # المنصة تضيف هيكل الصفحة بنفسها، فنرسل المحتوى فقط، ونحمل الاتجاه في غلاف
            page = page.replace(f"<title>{ctx['title']}</title>", "<title>موقع مقصد</title>", 1)
            page = re.sub(r"^<!doctype html>\s*<html[^>]*>\s*<head>\s*", "", page, flags=re.I)
            page = re.sub(r'<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*', "", page)
            page = page.replace("</head>\n<body>\n", '<div dir="rtl" lang="ar">\n', 1).replace("</body>\n</html>\n", "</div>\n")
        (out / name).write_text(page, encoding="utf-8")

    # الصور والأيقونات
    img = SRC / "assets" / "img"
    for f in ("og.png", "favicon-32.png", "apple-touch-icon.png", "icon-512.png"):
        if (img / f).exists():
            shutil.copy(img / f, out / f)
    (out / "favicon.svg").write_text(art.FAVICON, encoding="utf-8")

    if mode == "dist":
        m = re.match(r"(https://[^/]+)", api)
        (out / "_headers").write_text(headers_file(m.group(1)), encoding="utf-8")
        (out / "_redirects").write_text(
            "# الخطوط تُمرَّر من Google عبر نطاق الموقع نفسه — متصفح الزائر لا يتصل بطرف ثالث\n"
            "/gf/*  https://fonts.gstatic.com/s/:splat  200\n", encoding="utf-8")
        robots = "User-agent: *\nAllow: /\n"
        if site_url:
            robots += f"\nSitemap: {site_url}/sitemap.xml\n"
            urls = "".join(f"  <url><loc>{site_url}{p}</loc><lastmod>{cfg['effective_date']}</lastmod></url>\n"
                           for p in ("/", "/privacy", "/terms", "/refund", "/contact"))
            (out / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n'
                                             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                             f"{urls}</urlset>\n", encoding="utf-8")
        (out / "robots.txt").write_text(robots, encoding="utf-8")
    return out


if __name__ == "__main__":
    cfg, warn = load_cfg()
    for mode in ("dist", "preview"):
        o = build(mode, cfg)
        size = sum(p.stat().st_size for p in o.rglob("*") if p.is_file())
        print(f"✓ {mode}: {o.relative_to(ROOT)} ({size // 1024} KB)")
    for w in warn:
        print("⚠", w)
    left = [str(p) for p in DIST.rglob("*.html") if "{{" in p.read_text(encoding="utf-8")]
    if left:
        sys.exit("✗ بقيت متغيرات بلا قيمة في: " + ", ".join(left))
