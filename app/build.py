#!/usr/bin/env python3
"""مقصد — يدمج المصادر في ملف واحد جاهز للنشر."""
import pathlib, re, sys, json

root = pathlib.Path(__file__).parent
src  = root / "src"
dist = root / "dist"
dist.mkdir(exist_ok=True)

html = (src / "index.html").read_text(encoding="utf-8")
css  = (src / "app.css").read_text(encoding="utf-8")
js   = (src / "app.js").read_text(encoding="utf-8")

# لا تصغير: الملف المنشور يبقى قابلاً لاستخراج مصادره حرفياً
CSS_A, CSS_B = "/*==MAQSAD:CSS:START==*/", "/*==MAQSAD:CSS:END==*/"
JS_A,  JS_B  = "/*==MAQSAD:JS:START==*/",  "/*==MAQSAD:JS:END==*/"
css_min = CSS_A + "\n" + css + "\n" + CSS_B
js_out  = JS_A + "\n" + js + "\n" + JS_B

for needle, payload in (("/*__CSS__*/", css_min), ("/*__JS__*/", js_out)):
    if needle not in html:
        sys.exit(f"العلامة {needle} غير موجودة في index.html")
    html = html.replace(needle, payload)

# فحوص سلامة قبل النشر
problems = []
if "</script>" in js:
    problems.append("app.js يحتوي </script> — سيكسر الصفحة")
for tag in ("<html", "</html>", "<body", "</body>"):
    if html.count(tag) != 1:
        problems.append(f"وسم {tag} مكرر أو مفقود")
if html.count("<script") != html.count("</script>"):
    problems.append("وسوم script غير متوازنة")
if problems:
    sys.exit("فشل البناء:\n- " + "\n- ".join(problems))

out = dist / "app.html"
out.write_text(html, encoding="utf-8")
# التحقق من إمكانية استرجاع المصادر من الملف المنشور
back_css = html.split(CSS_A)[1].split(CSS_B)[0].strip("\n")
back_js  = html.split(JS_A)[1].split(JS_B)[0].strip("\n")
assert back_css == css.strip("\n"), "استرجاع CSS غير مطابق"
assert back_js == js.strip("\n"),  "استرجاع JS غير مطابق"

print(json.dumps({
    "out": str(out), "bytes": len(html.encode()),
    "css": len(css), "js": len(js), "roundtrip": "ok",
}, ensure_ascii=False))
