# مصدر الخطوط: روابط woff2 الرسمية من Google Fonts (تُمرَّر عبر Netlify من نفس النطاق)
AR = ("U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, "
      "U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E, "
      "U+10EC2-10EC4, U+10EFC-10EFF, U+1EE00-1EE03, U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, U+1EE27, "
      "U+1EE29-1EE32, U+1EE34-1EE37, U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, "
      "U+1EE51-1EE52, U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, "
      "U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, U+1EE8B-1EE9B, "
      "U+1EEA1-1EEA3, U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1")
LA = ("U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, "
      "U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD")
G = "https://fonts.gstatic.com/s/"
FACES = [  # (subset, family, weight, url) — «بلكس» للعناوين والنص والأزرار
    ("arabic", "IBM Plex Sans Arabic", "400", G + "ibmplexsansarabic/v15/Qw3CZRtWPQCuHme67tEYUIx3Kh0PHR9N6Ys43PWrfQ.woff2"),
    ("latin",  "IBM Plex Sans Arabic", "400", G + "ibmplexsansarabic/v15/Qw3CZRtWPQCuHme67tEYUIx3Kh0PHR9N6Ys93PU.woff2"),
    ("arabic", "IBM Plex Sans Arabic", "500", G + "ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPO_-CRXMR5Kw.woff2"),
    ("latin",  "IBM Plex Sans Arabic", "500", G + "ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPO_-CUXMQ.woff2"),
    ("arabic", "IBM Plex Sans Arabic", "600", G + "ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPi-OCRXMR5Kw.woff2"),
    ("latin",  "IBM Plex Sans Arabic", "600", G + "ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPi-OCUXMQ.woff2"),
    ("arabic", "IBM Plex Sans Arabic", "700", G + "ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YOG-eCRXMR5Kw.woff2"),
    ("latin",  "IBM Plex Sans Arabic", "700", G + "ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YOG-eCUXMQ.woff2"),
]
# تُحمَّل مبكراً: خط النص العادي ووزن العناوين (أول ما يظهر في الصفحة)
PRELOAD = [("arabic", "IBM Plex Sans Arabic", "400"), ("arabic", "IBM Plex Sans Arabic", "700")]
GOOGLE_CSS = ("https://fonts.googleapis.com/css2?"
              "family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap")

def css(prefix="/gf/"):
    out = ["/* خطوط مقصد — تُحمَّل من نطاق الموقع نفسه (بلا طلبات لطرف ثالث من متصفح الزائر) */"]
    for sub, fam, w, url in FACES:
        out.append("@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:swap;"
                   "src:url(%s) format('woff2');unicode-range:%s}" % (fam, w, url.replace(G, prefix), AR if sub == "arabic" else LA))
    return "\n".join(out) + "\n"

if __name__ == "__main__":
    import hashlib
    order = sorted(FACES, key=lambda f: (f[1], f[2], f[0]))
    print(hashlib.md5("|".join(f[3] for f in order).encode()).hexdigest())
    print(hashlib.md5(AR.encode()).hexdigest(), hashlib.md5(LA.encode()).hexdigest())
