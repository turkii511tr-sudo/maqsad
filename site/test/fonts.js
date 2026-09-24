// خطوط بديلة للاختبار المحلي فقط: بيئة الاختبار لا تصل لـ Google Fonts،
// فنخدم ملفات قريبة الشكل مكان خطّي الموقع (بلكس ← Readex Pro، وأميري ← FreeSerif)
const fs = require("fs"), path = require("path");
const SANS = fs.readFileSync(path.join(__dirname, "..", "tools", "readex-pro-arabic.woff2"));
let NASKH = null;
try { NASKH = fs.readFileSync("/usr/share/fonts/truetype/freefont/FreeSerif.ttf"); } catch (e) {}
module.exports = async function routeFonts(p) {
  await p.route("**/gf/**", (r) => {
    const u = r.request().url();
    if (/ibmplexsansarabic\/.*CRXMR5Kw\.woff2$|ibmplexsansarabic\/.*43PWrfQ\.woff2$/.test(u)) return r.fulfill({ status: 200, contentType: "font/woff2", body: SANS });
    if (NASKH && /amiri\/.*(7w|Gw)\.woff2$/.test(u)) return r.fulfill({ status: 200, contentType: "font/ttf", body: NASKH });
    return r.fulfill({ status: 404, body: "" });
  });
};
