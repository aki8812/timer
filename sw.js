const CACHE_NAME = 'stopwatch-timer-v1';
const ASSETS = [
    './index.html',
    './style.css',
    './script.js',
    './timer-worker.js',
    './manifest.json',
    './favicon.ico',
    './icon/icon-512x512.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=Roboto+Mono:wght@300;400;500&display=swap'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
