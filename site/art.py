# رسومات الموقع المولّدة: المخطط (كروكي الأراضي)، هوية «الدبوس»، الأيقونات
AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")

def ar(v):
    return str(v).translate(AR_DIGITS)

def _plots(x, y, w, h, cols, rows):
    pw, ph = w / cols, h / rows
    for r in range(rows):
        for c in range(cols):
            yield (x + c * pw, y + r * ph, pw, ph)

def plan_svg(cls="plan", missing=None, pick=True):
    """مخطط أراضٍ مبسّط: بلوكات وقطع مرقّمة وشوارع بعروضها، مع سهم الشمال ومقياس الرسم.
    missing: رقم قطعة تُرسم منقّطة فارغة (لصفحة 404)."""
    W, H = 600, 560
    out = [f'<svg class="{cls}" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">']
    lines, nums, extra = [], [], []
    blocks = [
        # x, y, w, h, cols, rows, first number, special
        (64, 24, 218, 220, 4, 2, 101, None),
        (326, 24, 254, 220, 3, 2, 109, None),
        (64, 288, 218, 240, 3, 2, 201, "mosque"),
        (326, 288, 254, 240, 2, 2, 209, "park"),
    ]
    pick_center = None
    for bx, by, bw, bh, cols, rows, first, special in blocks:
        lines.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" stroke-width="1.6"/>')
        if special == "park":
            pw = 110
            extra.append(f'<rect x="{bx}" y="{by}" width="{pw}" height="{bh}" stroke-width="1" stroke-dasharray="3 4"/>')
            for i in range(5):
                for j in range(6):
                    cx, cy = bx + 18 + i * 19, by + 22 + j * 38 + (9 if i % 2 else 0)
                    extra.append(f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="3.2" stroke-width=".9"/>')
            nums.append(f'<text class="pl-lbl" x="{bx + pw / 2:.0f}" y="{by + bh / 2 + 4:.0f}" text-anchor="middle" direction="rtl">حديقة</text>')
            plots = list(_plots(bx + pw, by, bw - pw, bh, cols, rows))
        else:
            plots = list(_plots(bx, by, bw, bh, cols, rows))
        n = first
        for i, (px, py, pw_, ph_) in enumerate(plots):
            lines.append(f'<rect x="{px:.1f}" y="{py:.1f}" width="{pw_:.1f}" height="{ph_:.1f}"/>')
            cx, cy = px + pw_ / 2, py + ph_ / 2
            if special == "mosque" and i == 0:
                nums.append(f'<text class="pl-lbl" x="{cx:.0f}" y="{cy + 4:.0f}" text-anchor="middle" direction="rtl">مسجد</text>')
                continue
            if missing and n == missing:
                extra.append(f'<rect class="pl-miss" x="{px + 5:.1f}" y="{py + 5:.1f}" width="{pw_ - 10:.1f}" height="{ph_ - 10:.1f}" rx="3"/>')
                nums.append(f'<text class="pl-404" x="{cx:.0f}" y="{cy + 5:.0f}" text-anchor="middle">404</text>')
                n += 1
                continue
            if pick and first == 101 and i == 5:
                extra.append(f'<rect class="pl-pick" x="{px + 3:.1f}" y="{py + 3:.1f}" width="{pw_ - 6:.1f}" height="{ph_ - 6:.1f}" rx="3"/>')
                pick_center = (cx, cy - 8)
                nums.append(f'<text class="pl-num" x="{cx:.0f}" y="{py + ph_ - 12:.0f}" text-anchor="middle">{n}</text>')
            else:
                nums.append(f'<text class="pl-num" x="{cx:.0f}" y="{cy + 4:.0f}" text-anchor="middle">{n}</text>')
            n += 1
    # الشوارع وعروضها
    nums.append('<text class="pl-lbl" x="304" y="140" text-anchor="middle" direction="rtl" transform="rotate(-90 304 140)">شارع ٢٠ م</text>')
    nums.append('<text class="pl-lbl" x="304" y="410" text-anchor="middle" direction="rtl" transform="rotate(-90 304 410)">شارع ٢٠ م</text>')
    nums.append('<text class="pl-lbl" x="173" y="270" text-anchor="middle" direction="rtl">شارع ١٥ م</text>')
    nums.append('<text class="pl-lbl" x="453" y="270" text-anchor="middle" direction="rtl">شارع ١٥ م</text>')
    # سهم الشمال
    extra.append('<g transform="translate(34 40)"><circle r="17" stroke-width="1"/><path d="M0 -12 L6 6 L0 2 L-6 6 Z" fill="currentColor" stroke="none"/></g>')
    nums.append('<text class="pl-lbl" x="34" y="78" text-anchor="middle" direction="rtl">شمال</text>')
    # مقياس الرسم
    extra.append('<g transform="translate(64 546)"><path d="M0 0H100M0 -4V4M50 -3V3M100 -4V4" stroke-width="1.2"/></g>')
    nums.append('<text class="pl-num" x="64" y="541" text-anchor="middle">0</text>')
    nums.append('<text class="pl-num" x="114" y="541" text-anchor="middle">25</text>')
    nums.append('<text class="pl-num" x="170" y="541" text-anchor="middle">50m</text>')
    out.append('<g fill="none" stroke="currentColor" stroke-width="1">' + "".join(lines) + "".join(extra) + '</g>')
    out.append('<g>' + "".join(nums) + '</g>')
    if pick_center:
        # دبوس الهوية: سنّه على وسط القطعة المختارة
        x, y = pick_center
        out.append(f'<g class="pl-pin" transform="translate({x - 30:.1f} {y + 8 - 54.6:.1f}) scale(.6)">'
                   '<ellipse class="pl-pin-shadow" cx="50" cy="94" rx="11" ry="3.2"/>'
                   '<circle class="pl-pin-ring" cx="50" cy="37" r="19.5" stroke-width="14"/>'
                   '<path class="pl-pin-tail" d="M43 52 L57 52 L51.6 87 Q50 91.5 48.4 87 Z"/></g>')
    out.append('</svg>')
    return "".join(out)

# ---------- الهوية: «الدبوس» ----------
# حرف الميم (أول حرف من «مقصد») مرسوم كدبوس خريطة مغروس في وجهته، وتحته ظل الوصول بلون العنبر.
# الكلمة مرسومة بخط واحد مستدير، ونقطتا القاف بالعنبر. كله هندسة — لا يعتمد على أي ملف خط.
from pathlib import Path as _P
_BRAND = _P(__file__).resolve().parent / "src" / "brand"
NAVY, NAVY_DEEP, AMBER, MIST, SOFT, MIST_DARK = "#102A43", "#0B1D2F", "#E9A23B", "#F3F6F9", "#DCE4EE", "#EAF0F6"


def _pin_body(ink, dot, shadow=True):
    """الدبوس داخل مربع ١٠٠×١٠٠: حلقة الميم، والسن، وظل الوصول"""
    sh = f'<ellipse cx="50" cy="94" rx="11" ry="3.2" fill="{dot}"/>' if shadow else ""
    return (f'<circle cx="50" cy="37" r="19.5" fill="none" stroke="{ink}" stroke-width="14"/>'
            f'<path d="M43 52 L57 52 L51.6 87 Q50 91.5 48.4 87 Z" fill="{ink}"/>{sh}')


def monogram(cls="mono", ink="currentColor", dot=AMBER, xmlns=False):
    """الرمز وحده (الدبوس) بلون النص — للترويسة والتذييل وشاشة التطبيق"""
    ns = ' xmlns="http://www.w3.org/2000/svg"' if xmlns else ""
    return (f'<svg{ns} class="{cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">'
            + _pin_body(ink, dot) + "</svg>")


def wordmark(cls="wm", ink="currentColor", dot=AMBER, xmlns=False):
    """كلمة «مقصد» بخط واحد مستدير (٢٢٢×٦٦)"""
    ns = ' xmlns="http://www.w3.org/2000/svg"' if xmlns else ""
    return (f'<svg{ns} class="{cls}" viewBox="56 18 222 66" aria-hidden="true" focusable="false">'
            f'<g fill="none" stroke="{ink}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">'
            '<circle cx="262" cy="58" r="11"/><path d="M258 69 L240 69"/><circle cx="229" cy="57" r="11"/><path d="M232 69 L205 69"/>'
            '<path d="M205 69 L205 60 Q205 47 190 47 L168 47 Q156 47 156 58 Q156 69 168 69 L205 69"/>'
            '<path d="M168 69 L140 69 L140 59 M140 69 L112 69"/><path d="M112 69 L96 40"/><path d="M112 69 L74 69 Q66 69 66 61"/></g>'
            f'<g fill="{dot}"><circle cx="223" cy="29" r="5.5"/><circle cx="237" cy="29" r="5.5"/></g></svg>')


def app_icon(size=512, rx=0, maskable=False, xmlns=True):
    """أيقونة التطبيق: دبوس أبيض على الكحلي. maskable: أصغر ليبقى داخل الدائرة الآمنة (٨٠٪) في أندرويد"""
    ns = " xmlns='http://www.w3.org/2000/svg'" if xmlns else ""
    s = 0.56 if maskable else 0.72
    off = 50 * (1 - s)
    r = f" rx='{rx * 100 / size:.1f}'" if rx else ""
    return (f"<svg{ns} viewBox='0 0 100 100' width='{size}' height='{size}'>"
            f"<rect width='100' height='100'{r} fill='{NAVY}'/>"
            f"<g transform='translate({off:.2f} {off + 1.5:.2f}) scale({s})'>" + _pin_body("#FFFFFF", AMBER).replace('"', "'") + "</g></svg>")


def badge_svg(size=96, xmlns=True):
    """شارة شريط الإشعارات في أندرويد: الدبوس بالأبيض على شفاف (بلا ظل)"""
    ns = " xmlns='http://www.w3.org/2000/svg'" if xmlns else ""
    return (f"<svg{ns} viewBox='0 0 100 100' width='{size}' height='{size}'>"
            "<g transform='translate(8 6) scale(.84)'>" + _pin_body("#FFFFFF", "#FFFFFF", shadow=False).replace('"', "'") + "</g></svg>")


def favicon_svg(xmlns=True):
    """أيقونة المتصفح: الدبوس على الكحلي بحواف مدوّرة، والحلقة أسمك قليلاً لتبقى واضحة في ١٦–٣٢ بكسل"""
    ns = " xmlns='http://www.w3.org/2000/svg'" if xmlns else ""
    return (f"<svg{ns} viewBox='0 0 100 100' width='32' height='32'><rect width='100' height='100' rx='22' fill='{NAVY}'/>"
            "<g transform='translate(12 10) scale(.76)'>"
            f"<circle cx='50' cy='37' r='20' fill='none' stroke='#FFFFFF' stroke-width='17'/>"
            f"<path d='M41 52 L59 52 L52 89 Q50 93 48 89 Z' fill='#FFFFFF'/>"
            f"<ellipse cx='50' cy='95' rx='13' ry='4' fill='{AMBER}'/></g></svg>")


FAVICON = favicon_svg()


def lockup(cls="lockup", ink="currentColor", dot=AMBER):
    """الرمز والكلمة معاً (للصور)"""
    return (f'<span class="{cls}">' + monogram("mono", ink, dot) + wordmark("wm", ink, dot) + "</span>")


def outline_line(key, cls="ol"):
    """سطر عنوان محوّل لمسارات (لصورة المشاركة) — من src/brand/og-lines.json"""
    import json
    L = json.loads((_BRAND / "og-lines.json").read_text(encoding="utf-8"))[key]
    paths = "".join(f'<path transform="translate({x},{-dy}) scale(1,-1)" d="{d}"/>' for x, dy, d in L["glyphs"] if d)
    return (f'<svg class="{cls}" viewBox="-60 -820 {L["advance"] + 120} 1040" aria-hidden="true">'
            f'<g fill="currentColor">{paths}</g></svg>'), L["advance"]


SEAL = ('<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">'
        '<circle class="s-fill" cx="50" cy="50" r="46"/>'
        '<circle class="s-ring" cx="50" cy="50" r="46" stroke-width="2.6"/>'
        '<circle class="s-ring" cx="50" cy="50" r="40.5" stroke-width="1.1" stroke-dasharray="1.6 3.2"/>'
        '<circle class="s-ring" cx="50" cy="50" r="34" stroke-width="1.3"/>'
        '<text x="50" y="47" text-anchor="middle" dominant-baseline="central" direction="rtl" font-size="17">مؤهَّل</text>'
        '<text x="50" y="66" text-anchor="middle" dominant-baseline="central" direction="rtl" font-size="8" font-weight="500">مقصد</text>'
        '</svg>')


HAND = ('<svg viewBox="0 0 34 30" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">'
        '<path d="M31 3C21 3 11 8 7 22" stroke-dasharray="3 3.2"/><path d="M2.5 17.5 6.6 23.6 12.4 19.6"/></svg>')

_I = {
    "phone": '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    "bell": '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    "chat": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
    "home": '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',
    "map": '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/>',
    "tag": '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    "team": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "x": '<path d="M18 6 6 18M6 6l12 12"/>',
    "id": '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M15 10h3M15 14h3M6 17c.5-1.5 2-2 3-2s2.5.5 3 2"/>',
    "megaphone": '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    "wa": '<path d="M21 12a9 9 0 0 1-13.4 7.9L3 21l1.2-4.5A9 9 0 1 1 21 12z"/><path d="m8.5 12 2.3 2.3 4.7-4.6"/>',
    "lock": '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    "stop": '<circle cx="12" cy="12" r="9"/><path d="M9 9h6v6H9z"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    "hand": '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    "count": '<path d="M4 6h16M4 12h10M4 18h6"/><circle cx="18" cy="17" r="3"/>',
    "flame": '<path d="M12 22c4 0 7-2.7 7-6.8 0-3.4-2.3-6-4.1-8.1-.6 2-1.8 3.2-3 3.2.3-3.3-1.2-6.4-3.4-8.3C8.9 6 5 8.6 5 15.2 5 19.3 8 22 12 22z"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "shield": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    "mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    "arrow": '<path d="M19 12H5M11 18l-6-6 6-6"/>',
}

def icon(name, cls="ic"):
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{_I[name]}</svg>'
