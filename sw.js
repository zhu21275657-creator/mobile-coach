const CACHE = "koukou-mobile-v2";
const ASSETS = ["./", "./index.html", "./styles.css?v=2", "./app.js?v=2", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => event.respondWith(caches.match(event.request).then((saved) => saved || fetch(event.request))));
