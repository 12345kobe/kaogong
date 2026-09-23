/* 考公工作台 Service Worker：网络优先（network-first）
 * 目的：破解主屏 PWA 的 HTTP 缓存死锁——每次打开都强制向服务器要最新版，
 * 断网时才回退到缓存。上线新版本后用户下次打开即自动生效，无需手动刷新。
 * 注意：发新版时须同步修改下方 CACHE 版本号与 index.html 内 ?v= 版本。
 */
const CACHE = "kaogong-v20260923m";

self.addEventListener("install", function (e) {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return; // 字体等第三方资源交给浏览器自身缓存
  e.respondWith((async function () {
    try {
      const fresh = await fetch(req, { cache: "no-cache" });
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone()).catch(function () {});
      return fresh;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: req.mode === "navigate" });
      if (hit) return hit;
      if (req.mode === "navigate") {
        const idx = await caches.match("./index.html");
        if (idx) return idx;
      }
      throw err;
    }
  })());
});
