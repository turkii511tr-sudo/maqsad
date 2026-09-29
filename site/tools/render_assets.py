#!/usr/bin/env python3
"""يولّد صورة المشاركة (og.png) وكل الأيقونات من هوية «الدبوس». يحتاج Playwright (يُشغَّل مرة عند تغيير الهوية).
كل ما في الصور هندسة مرسومة — لا يعتمد على أي خط مثبّت في جهاز البناء.
العنوان والوصف يظهران تحت الصورة في واتساب وتويتر من وسوم الصفحة، فالصورة نفسها بلا نص عربي."""
import subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import art

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "src" / "assets" / "img"
PWA = ROOT.parent / "pwa"
IMG.mkdir(parents=True, exist_ok=True)
T = ROOT / "tools"

og = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
*{{margin:0;box-sizing:border-box}}
html,body{{width:1200px;height:630px;overflow:hidden}}
body{{background:{art.NAVY};color:{art.MIST};position:relative;
  background-image:radial-gradient(rgba(243,246,249,.07) 1.2px,transparent 1.6px);background-size:26px 26px}}
.bar{{position:absolute;left:0;right:0;bottom:0;height:10px;background:{art.AMBER}}}
.map{{position:absolute;left:96px;top:64px;width:392px;height:502px;border-radius:28px;overflow:hidden;background:#173753;
  border:2px solid #28496B;color:#1F4466;box-shadow:0 40px 60px -30px rgba(0,0,0,.7)}}
.map svg{{display:block;width:100%;height:100%}}
.map .pl-num,.map .pl-lbl{{fill:#93A7BC;font:12px "DejaVu Sans",sans-serif}}
.map .pl-lbl{{font-size:0}}
.map .pl-pick{{fill:rgba(233,162,59,.16);stroke:{art.AMBER};stroke-width:1.6}}
.pl-pin-ring{{fill:none;stroke:{art.MIST}}} .pl-pin-tail{{fill:{art.MIST}}} .pl-pin-shadow{{fill:{art.AMBER}}}
.lk{{position:absolute;right:104px;top:176px;display:flex;align-items:center;gap:18px;color:{art.MIST}}}
.lk .mono{{width:150px;height:150px;overflow:visible}}
.lk .wm{{width:430px;height:auto}}
.rule{{position:absolute;right:104px;top:392px;width:598px;height:4px;border-radius:4px;background:#28496B}}
.url{{position:absolute;right:104px;top:432px;font:500 30px/1 "DejaVu Sans",sans-serif;letter-spacing:.06em;color:{art.AMBER};direction:ltr}}
</style></head><body>
<div class="map">{art.plan_svg(cls="plan")}</div>
<div class="lk">{art.monogram()}{art.wordmark()}</div>
<div class="rule"></div>
<div class="url">maqsadapp.com</div>
<div class="bar"></div>
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
