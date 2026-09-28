// เก็บไฟล์แอปทั้งหมดไว้ในเครื่อง เพื่อเปิดใช้ได้เมื่อไม่มีสัญญาณ
// เปลี่ยน VERSION ทุกครั้งที่แก้ไฟล์ในรายการ เพื่อให้เครื่องผู้ใช้ได้รุ่นใหม่
const VERSION = 'shotlog-v0.15.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/plex-thai-thai-400.woff2',
  './fonts/plex-thai-latin-400.woff2',
  './fonts/plex-thai-thai-500.woff2',
  './fonts/plex-thai-latin-500.woff2',
  './fonts/plex-thai-thai-600.woff2',
  './fonts/plex-thai-latin-600.woff2',
  './fonts/plex-thai-thai-700.woff2',
  './fonts/plex-thai-latin-700.woff2',
  './js/app.js',
  './js/cloud.js',
  './js/config.js',
  './js/sync.js',
  './js/views/account.js',
  './js/group.js',
  './js/share.js',
  './js/views/group.js',
  './js/geo.js',
  './js/scorecards.js',
  './js/scorecard-parse.js',
  './js/scorecard-ocr.js',
  './js/views/scan.js',
  './js/views/share.js',
  './js/views/cropper.js',
  './js/holemap.js',
  './js/holedata.js',
  './js/clips.js',
  './js/sg.js',
  './js/handicap.js',
  './js/community.js',
  './js/views/live.js',
  './js/launch.js',
  './js/views/launch.js',
  './js/live-view.js',
  './js/views/drills.js',
  './js/map.js',
  './js/views/map.js',
  './js/coach.js',
  './js/views/coach.js',
  './js/errors.js',
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
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== TILE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// ตอนพัฒนาบนเครื่อง ใช้ไฟล์ล่าสุดจากเซิร์ฟเวอร์ก่อน (เว็บจริงยังเปิดจากแคชเพื่อใช้ออฟไลน์)
const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);

// ภาพดาวเทียมของแผนที่หลุม: ใช้ภาพที่เคยโหลดก่อน (เปิดในสนามที่สัญญาณอ่อนได้) เก็บไม่เกินราว 3,000 ภาพ
const TILE_CACHE = 'shotlog-tiles';
const TILE_HOSTS = ['server.arcgisonline.com', 'ibasemaps-api.arcgis.com'];
const TILE_MAX = 3000;
let tilePuts = 0;

async function tileFetch(req) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    if (++tilePuts % 100 === 0) {
      const keys = await cache.keys();
      if (keys.length > TILE_MAX) await Promise.all(keys.slice(0, keys.length - TILE_MAX + 300).map((k) => cache.delete(k)));
    }
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method === 'GET' && TILE_HOSTS.includes(url.hostname) && url.pathname.includes('/World_Imagery/')) {
    event.respondWith(tileFetch(req));
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (DEV) {
      try { return await fetch(req, { cache: 'no-store' }); } catch { /* ออฟไลน์ → ใช้แคช */ }
    }
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
