// เก็บไฟล์แอปทั้งหมดไว้ในเครื่อง เพื่อเปิดใช้ได้เมื่อไม่มีสัญญาณ
// เปลี่ยน VERSION ทุกครั้งที่แก้ไฟล์ในรายการ เพื่อให้เครื่องผู้ใช้ได้รุ่นใหม่
const VERSION = 'shotlog-v0.2.0-1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/cloud.js',
  './js/config.js',
  './js/sync.js',
  './js/views/account.js',
  './js/constants.js',
  './js/courses.js',
  './js/db.js',
  './js/logic.js',
  './js/state.js',
  './js/ui.js',
  './js/views/main.js',
  './js/views/round.js',
  './js/views/insights.js',
  './js/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') return cache.match('./index.html');
      throw err;
    }
  })());
});
