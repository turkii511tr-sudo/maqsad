// مقصد — عامل الخدمة: يجعل التطبيق قابلاً للتثبيت ويفتح فوراً، ويستقبل إشعارات الجوال
const SHELL = "maqsad-shell-v3";
const FILES = ["/", "/index.html", "/manifest.webmanifest",
               "/icon-192.png", "/icon-512.png", "/icon-maskable-192.png", "/icon-maskable-512.png",
               "/apple-touch-icon.png", "/badge-96.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // لا نتدخّل إطلاقاً في نداءات المنصة أو جلب الواجهة
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match("/index.html"))),
  );
});

// ===== إشعارات الجوال =====
// التطبيق يسأل: هل هذي النسخة تستقبل الإشعارات؟
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "maqsad-ping" && e.ports && e.ports[0]) {
    e.ports[0].postMessage({ type: "maqsad-pong", push: true, v: 3 });
  }
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  const title = d.title || "مقصد";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    dir: "rtl", lang: "ar",
    icon: "/icon-192.png", badge: "/badge-96.png",
    tag: d.tag || undefined, renotify: !!d.tag,
    vibrate: [120, 60, 120],
    data: { url: d.url || "/" },
  }));
});

// الضغط على الإشعار: نفتح مقصد (أو نرجع له إذا كان مفتوح) على شاشة «اليوم»
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
      for (const w of ws) {
        if (w.url.startsWith(self.location.origin)) {
          w.postMessage({ type: "maqsad-open", url });
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
