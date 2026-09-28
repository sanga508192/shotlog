// แผนที่หลุม: คณิตศาสตร์พิกัด (ระยะ ทิศ เมอร์เคเตอร์) และข้อมูลหมุดแท่นที/กรีนของแต่ละสนาม
// คำนวณล้วน ๆ ทดสอบด้วย node:test ได้ ข้อมูลหมุดเก็บในค่าตั้ง course_holes:<id> (ซิงก์ไปกับบัญชี)
import * as st from './state.js';

const R = 6371008.8;   // รัศมีโลกเฉลี่ย (เมตร)
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export const YD = 0.9144;

// ระยะตามผิวโลก (เมตร)
export function distM(a, b) {
  if (!a || !b) return null;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ทิศจาก a ไป b (องศา 0 = เหนือ ตามเข็มนาฬิกา)
export function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// จุดที่ห่างจาก a ไป m เมตร ตามทิศ brg
export function destination(a, brg, m) {
  const d = m / R, t = rad(brg), p1 = rad(a.lat), l1 = rad(a.lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lon: ((deg(l2) + 540) % 360) - 180 };
}

// พิกัดเว็บเมอร์เคเตอร์ 0–1 (คูณ 256·2^z ได้พิกเซลที่ระดับซูม z)
export function mercator({ lat, lon }) {
  const s = Math.sin(rad(Math.max(-85.0511, Math.min(85.0511, lat))));
  return { x: (lon + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
}
export function unmercator({ x, y }) {
  return { lat: deg(Math.atan(Math.sinh(Math.PI * (1 - 2 * y)))), lon: x * 360 - 180 };
}
// เมตรต่อพิกเซลที่ละติจูดและระดับซูมนี้
export const metersPerPixel = (lat, zoom) => (2 * Math.PI * R * Math.cos(rad(lat))) / (256 * 2 ** zoom);

export const toUnit = (m, unit) => (m == null ? null : unit === 'yd' ? m / YD : m);
export const unitTh = (unit) => (unit === 'yd' ? 'หลา' : 'ม.');
export const fmtDist = (m, unit) => (m == null ? '–' : String(Math.round(toUnit(m, unit))));

// ---------- หมุดของสนาม ----------

export const holesKey = (courseId) => `course_holes:${courseId}`;
const valid = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

// { [เลขหลุม]: { tee, green } } เฉพาะหมุดที่ถูกต้อง
export function courseHoles(courseId) {
  const raw = st.setting(holesKey(courseId), null)?.holes;
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [n, h] of Object.entries(raw)) {
    const tee = valid(h?.tee) ? { lat: h.tee.lat, lon: h.tee.lon } : null;
    const green = valid(h?.green) ? { lat: h.green.lat, lon: h.green.lon } : null;
    if (tee || green) out[n] = { tee, green };
  }
  return out;
}

export const holeReady = (h) => !!(h?.tee && h?.green);

export async function setHolePoint(courseId, n, which, point) {
  const cur = st.setting(holesKey(courseId), null);
  const holes = { ...(cur?.holes || {}) };
  const h = { ...(holes[n] || {}) };
  if (point) h[which] = { lat: Math.round(point.lat * 1e7) / 1e7, lon: Math.round(point.lon * 1e7) / 1e7 };
  else delete h[which];
  holes[n] = h;
  await st.setSetting(holesKey(courseId), { holes, updated_at: st.nowIso() });
}

// ระยะหลุมจากสกอร์การ์ดของแท่นที่ใช้ (ไว้เทียบกับที่วัดจากหมุด)
export function scorecardLength(sc, n, teeId) {
  if (!sc?.tees?.length) return null;
  const tee = sc.tees.find((t) => t.id === teeId) ?? sc.tees.find((t) => t.id === 'white') ?? sc.tees[0];
  const y = tee?.yards?.[n - 1];
  if (!Number.isFinite(y)) return null;
  return { value: y, unit: sc.unit === 'm' ? 'm' : 'yd', tee: tee.name };
}
