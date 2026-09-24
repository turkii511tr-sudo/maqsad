// خادم محلي يحاكي Netlify: المسارات النظيفة، وصفحة 404
const http = require("http"), fs = require("fs"), path = require("path");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".png": "image/png", ".txt": "text/plain", ".xml": "application/xml", ".woff2": "font/woff2" };
// نطبّق ترويسات _headers (ومنها CSP) كما يفعل Netlify، لنكشف أي مخالفة للسياسة أثناء الاختبار
function netlifyHeaders(root) {
  const f = path.join(root, "_headers");
  if (!fs.existsSync(f)) return {};
  const out = {}; let cur = null;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) { cur = line.trim(); out[cur] = {}; continue; }
    const i = line.indexOf(":"); out[cur][line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  // محلياً على http: نحذف upgrade-insecure-requests فقط (الإنتاج على https)
  for (const k in out) if (out[k]["Content-Security-Policy"]) out[k]["Content-Security-Policy"] = out[k]["Content-Security-Policy"].replace("; upgrade-insecure-requests", "");
  return out;
}
module.exports = function serve(root, port) {
  const H = netlifyHeaders(root);
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      let u = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
      if (u.endsWith("/")) u += "index.html";
      let f = path.join(root, u);
      if (!fs.existsSync(f) && fs.existsSync(f + ".html")) f += ".html";
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404, { ...(H["/*"] || {}), "Content-Type": TYPES[".html"] });
        return res.end(fs.readFileSync(path.join(root, "404.html")));
      }
      res.writeHead(200, { ...(H["/*"] || {}), "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
      res.end(fs.readFileSync(f));
    }).listen(port, () => ok(s));
  });
};
