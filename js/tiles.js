// เก็บภาพดาวเทียมของสนามไว้ก่อนออกรอบ (ในสนามสัญญาณมักอ่อน): เฉพาะพื้นที่รอบแต่ละหลุม ระดับซูมที่แผนที่หลุมใช้
// ภาพเก็บใน cache เดียวกับที่ service worker ใช้ ('shotlog-tiles') แผนที่หลุมจึงเปิดได้แม้ไม่มีเน็ต
import { mercator, distM } from './holemap.js';
import { tileUrl, maxZoomAt, setMaxZoomAt } from './map.js';

export const TILE_CACHE = 'shotlog-tiles';
export const PREFETCH_ZOOMS = [16, 17, 18, 19];
export const MAX_TILES = 1500;          // ต่อสนาม (cache ทั้งหมดเก็บได้ราว 3,000 ภาพ)
const EARTH = 40075016.686;

// รายการภาพที่ต้องใช้: กรอบรอบหมุดของแต่ละหลุม (แท่นที กรีน ขอบกรีน จุดอันตราย) เผื่อขอบ padM เมตร
// ไม่มีหมุดเลย → วงรอบตำแหน่งสนาม (center) รัศมี radiusM · ภาพเกิน MAX_TILES → ตัดระดับซูมละเอียดสุดออก
export function courseTiles(holes, { center = null, zooms = PREFETCH_ZOOMS, padM = 70, radiusM = 900, maxZoom = () => 19 } = {}) {
  const boxes = [];
  for (const h of Object.values(holes || {})) {
    const pts = [h?.tee, h?.green, h?.front, h?.back, ...(h?.hazards || [])].filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (pts.length) boxes.push({ pts, pad: padM });
  }
  if (!boxes.length && center) boxes.push({ pts: [center], pad: radiusM });
  if (!boxes.length) return [];
  let zs = [...zooms];
  for (;;) {
    const seen = new Set();
    const out = [];
    for (const { pts, pad } of boxes) {
      const ms = pts.map(mercator);
      const lat = pts[0].lat;
      const p = pad / (EARTH * Math.cos((lat * Math.PI) / 180));
      const x0 = Math.min(...ms.map((m) => m.x)) - p, x1 = Math.max(...ms.map((m) => m.x)) + p;
      const y0 = Math.min(...ms.map((m) => m.y)) - p, y1 = Math.max(...ms.map((m) => m.y)) + p;
      for (const z of zs) {
        if (z > maxZoom(pts[0])) continue;
        const n = 2 ** z;
        for (let x = Math.floor(x0 * n); x <= Math.floor(x1 * n); x++) {
          for (let y = Math.floor(y0 * n); y <= Math.floor(y1 * n); y++) {
            const k = `${z}/${x}/${y}`;
            if (!seen.has(k)) { seen.add(k); out.push({ z, x, y }); }
          }
        }
      }
    }
    if (out.length <= MAX_TILES || zs.length <= 1) return out;
    zs = zs.slice(0, -1);
  }
}

// ระยะห่างจากหลุมไกลสุด (ใช้บอกขนาดพื้นที่)
export function courseSpan(holes) {
  const pts = Object.values(holes || {}).flatMap((h) => [h?.tee, h?.green]).filter(Boolean);
  let max = 0;
  for (const a of pts) for (const b of pts) max = Math.max(max, distM(a, b));
  return max;
}

// บางพื้นที่ Esri ไม่มีภาพระดับละเอียดสุด (ตอบ 404) → ลองภาพแรกของแต่ละระดับจากละเอียดไปหยาบ ตัดระดับที่ไม่มีออก
// และจำไว้ให้แผนที่หลุมไม่ต้องขอภาพระดับนั้นอีก · center = จุดที่ใช้จำ (เช่น กรีนหลุมแรก)
export async function dropMissingZooms(tiles, center, { fetchFn = (u) => fetch(u, { mode: 'cors' }) } = {}) {
  const zs = [...new Set(tiles.map((t) => t.z))].sort((a, b) => b - a);
  let keep = tiles;
  for (const z of zs.slice(0, -1)) {
    const t = keep.find((x) => x.z === z);
    let status = 0;
    try { status = (await fetchFn(tileUrl(t.z, t.x, t.y))).status; } catch { return keep; }   // เน็ตมีปัญหา ไม่ตัดอะไร
    if (status !== 404) break;
    keep = keep.filter((x) => x.z !== z);
    if (center) setMaxZoomAt(center, z - 1);
  }
  return keep;
}

// โหลดภาพที่ยังไม่มีใน cache ทีละ 6 ภาพ · onProgress(done, total) · คืน { total, fetched, cached, failed, missing }
export async function downloadTiles(tiles, { onProgress = () => {}, signal } = {}) {
  const cache = await caches.open(TILE_CACHE);
  const viaSw = !!globalThis.navigator?.serviceWorker?.controller;
  const stat = { total: tiles.length, fetched: 0, cached: 0, failed: 0, missing: 0 };
  let i = 0, done = 0;
  const worker = async () => {
    while (i < tiles.length) {
      if (signal?.aborted) return;
      const { z, x, y } = tiles[i++];
      const url = tileUrl(z, x, y);
      try {
        if (await cache.match(url)) stat.cached++;
        else {
          const res = await fetch(url, { mode: 'cors', signal });
          if (res.status === 404) stat.missing++;   // ไม่มีภาพตรงนี้ (เช่น ขอบพื้นที่) ไม่ใช่ความผิดพลาด
          else if (!res.ok) stat.failed++;
          else {
            if (!viaSw) await cache.put(url, res.clone());   // มี service worker → มันเก็บให้แล้ว
            await res.arrayBuffer();
            stat.fetched++;
          }
        }
      } catch {
        if (signal?.aborted) return;
        stat.failed++;
      }
      onProgress(++done, tiles.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return stat;
}

export { maxZoomAt };
