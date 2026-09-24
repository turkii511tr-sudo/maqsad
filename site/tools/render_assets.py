#!/usr/bin/env python3
"""يولّد صورة المشاركة (og.png) وكل الأيقونات من هوية «الختم الكوفي». يحتاج Playwright (يُشغَّل مرة عند تغيير الهوية).
كل ما في الصور هندسة مرسومة (الكوفي المربّع) — لا يعتمد على أي خط مثبّت في جهاز البناء.
العنوان والوصف يظهران تحت الصورة في واتساب وتويتر من وسوم الصفحة، فالصورة نفسها بلا نص عربي."""
import subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import art, sadu

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "src" / "assets" / "img"
PWA = ROOT.parent / "pwa"
IMG.mkdir(parents=True, exist_ok=True)
T = ROOT / "tools"

og = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
{sadu.css()}
*{{margin:0;box-sizing:border-box}}
html,body{{width:1200px;height:630px;overflow:hidden}}
body{{background:#17110E;color:#F3EDE2;position:relative}}
.fr{{position:absolute;left:0;right:0;height:22px;background:#17110E var(--sd-frieze) 50% 0/46px 22px repeat-x}}
.top{{top:0}} .bot{{bottom:0}}
.b-st{{position:absolute;left:110px;top:78px;width:372px;box-shadow:0 30px 50px -24px rgba(0,0,0,.9)}}
.b-st svg{{display:block;width:100%;height:auto}}
.b-wm{{position:absolute;right:110px;top:190px;width:520px;color:#F3EDE2}}
.b-wm svg{{display:block;width:100%;height:auto}}
.rule{{position:absolute;right:110px;top:410px;width:520px;height:4px;background:#A5231B}}
.url{{position:absolute;right:110px;top:446px;font:500 30px/1 "DejaVu Sans",sans-serif;letter-spacing:.06em;color:#D9A13B;direction:ltr}}
</style></head><body>
<div class="fr top"></div>
<div class="b-st">{art.stele()}</div>
<div class="b-wm">{art.wordmark()}</div>
<div class="rule"></div>
<div class="url">maqsadapp.com</div>
<div class="fr bot"></div>
</body></html>"""
(T / "og.html").write_text(og, encoding="utf-8")


def page(svg, n=512):
    return ("<!doctype html><html><head><style>*{margin:0}html,body{width:%dpx;height:%dpx;background:transparent}"
            "svg{width:%dpx;height:%dpx;display:block}</style></head><body>%s</body></html>") % (n, n, n, n, svg)


# الأيقونات: rx = تدوير الحواف للمتصفح؛ iOS وأندرويد يدوّرونها بنفسهم (مربّعة كاملة)
pages = {
    "icon.html": page(art.app_icon(512, rx=112)),
    "icon-sq.html": page(art.app_icon(512)),
    "icon-mask.html": page(art.app_icon(512, maskable=True)),
    "icon-fav.html": page(art.favicon_svg()),
    "icon-badge.html": page(art.badge_svg(512)),
}
for k, v in pages.items():
    (T / k).write_text(v, encoding="utf-8")

jobs = [  # (المقاس، الملف، المصدر، المجلدات)
    (512, "icon-512.png", "icon.html", [IMG, PWA]),
    (192, "icon-192.png", "icon.html", [PWA]),
    (512, "icon-maskable-512.png", "icon-mask.html", [PWA]),
    (192, "icon-maskable-192.png", "icon-mask.html", [PWA]),
    (180, "apple-touch-icon.png", "icon-sq.html", [IMG, PWA]),
    (32, "favicon-32.png", "icon-fav.html", [IMG, PWA]),
    (96, "badge-96.png", "icon-badge.html", [PWA]),
]
js = f"""
const {{ chromium }} = require('playwright');
(async () => {{
  const b = await chromium.launch({{ args: ['--no-sandbox'] }});
  let p = await b.newPage({{ viewport: {{ width: 1200, height: 630 }} }});
  await p.goto('file://{T / "og.html"}'); await p.waitForTimeout(300);
  await p.screenshot({{ path: '{IMG / "og.png"}' }});
  for (const [s, f, src, dirs] of {[[s, f, src, [str(d) for d in dirs]] for s, f, src, dirs in jobs]}) {{
    p = await b.newPage({{ viewport: {{ width: 512, height: 512 }}, deviceScaleFactor: s / 512 }});
    await p.goto('file://{T}/' + src);
    for (const d of dirs) await p.screenshot({{ path: d + '/' + f, omitBackground: true }});
  }}
  await b.close();
}})();
"""
subprocess.run(["node", "-e", js], check=True)
for d in (IMG, PWA):
    for f in sorted(d.glob("*.png")):
        print(d.name, f.name, f.stat().st_size)
