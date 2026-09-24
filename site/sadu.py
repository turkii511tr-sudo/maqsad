# الزخارف: إفريز كوفي — كلمة «مقصد» بالكوفي المربّع مكرّرة بين خطّين، مثل الكتابات على جدران العمارة الإسلامية.
# (اسم الملف باقٍ من هوية السدو القديمة حتى لا تتغير الاستيرادات؛ لا شي فيه من النسيج الآن)
from urllib.parse import quote
import art

INK = {"W": art.WOOL, "S": art.SAFFRON, "R": art.RED, "N": art.NIGHT}


def _frieze(gap=4):
    """صف واحد من الإفريز: خط زعفران، فراغ، الكلمة (٧ صفوف)، فراغ، خط زعفران"""
    word = [r.replace("#", "W").replace("o", "S").replace("r", "R") for r in art.WORD]
    w = len(word[0]) + gap
    pad = "." * gap
    rows = ["S" * w, "." * w]
    rows += [pad[: gap // 2] + r + pad[gap // 2:] for r in word]
    rows += ["." * w, "S" * w]
    return rows


# (عرض الخانة، ارتفاعها، الصفوف) — الحرف "." شفاف
CHARTS = {
    "frieze": (2, 2, _frieze()),        # إفريز الصفحات والفواصل
}


def size(name):
    cw, ch, rows = CHARTS[name]
    return len(rows[0]) * cw, len(rows) * ch


def tile_svg(name, xmlns=True):
    """SVG لخانة الزخرفة: مستطيل لكل تتابع من نفس اللون في الصف"""
    cw, ch, rows = CHARTS[name]
    w, h = size(name)
    rects = []
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            k = row[x]
            e = x
            while e < len(row) and row[e] == k:
                e += 1
            if k != ".":
                rects.append(f"<rect fill='{INK[k]}' x='{x * cw}' y='{y * ch}' width='{(e - x) * cw}' height='{ch}'/>")
            x = e
    ns = " xmlns='http://www.w3.org/2000/svg'" if xmlns else ""
    return f"<svg{ns} width='{w}' height='{h}' viewBox='0 0 {w} {h}' shape-rendering='crispEdges'>{''.join(rects)}</svg>"


def data_uri(svg):
    return "url(\"data:image/svg+xml," + quote(svg, safe=" '=/:,;()-.").replace(" ", "%20") + "\")"


def css(names=None):
    """متغيرات CSS: خلفية كل زخرفة ومقاساتها — تُضاف في أول ملف التنسيق"""
    out = ["/* الزخارف — إفريز كوفي مولَّد من sadu.py (لا يُعدَّل يدوياً) */", ":root{"]
    for name in (names or CHARTS):
        w, h = size(name)
        out.append(f"  --sd-{name}:{data_uri(tile_svg(name))};")
        out.append(f"  --sd-{name}-w:{w}px; --sd-{name}-h:{h}px;")
    out.append("}")
    return "\n".join(out) + "\n\n"


if __name__ == "__main__":
    for n in CHARTS:
        print(n, size(n))
        for r in CHARTS[n][2]:
            print("   ", r)
