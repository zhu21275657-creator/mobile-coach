const CACHE = "koukou-mobile-v4";
const ASSETS = ["./", "./index.html", "./styles.css?v=3", "./app.js?v=3", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => event.respondWith(caches.match(event.request).then((saved) => saved || fetch(event.request))));
