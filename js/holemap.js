// แผนที่หลุม: คณิตศาสตร์พิกัด (ระยะ ทิศ เมอร์เคเตอร์) และข้อมูลหมุดแท่นที/กรีนของแต่ละสนาม
// คำนวณล้วน ๆ ทดสอบด้วย node:test ได้ ข้อมูลหมุดเก็บในค่าตั้ง course_holes:<id> (ซิงก์ไปกับบัญชี)
import * as st from './state.js';
import { COURSE_HOLES } from './holedata.js';
import { cachedPins } from './community.js';

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

export const HAZARD_KINDS = [
  { v: 'water', th: 'น้ำ', icon: '💧' },
  { v: 'bunker', th: 'บังเกอร์', icon: '🏖️' },
  { v: 'other', th: 'จุดอื่น', icon: '📌' },
];
export const MAX_HAZARDS = 6;
const clean = (p) => ({ lat: p.lat, lon: p.lon });
const validHazard = (z) => valid(z) && HAZARD_KINDS.some((k) => k.v === z.kind);

// { [เลขหลุม]: { tee, green, front, back, hazards, est, conf, src, crowd } } เฉพาะหมุดที่ถูกต้อง
// front/back = ขอบหน้า/หลังกรีน · hazards = [{ lat, lon, kind }] (ผู้ใช้วางเองเท่านั้น)
// ลำดับความเชื่อถือ: หมุดที่เราวางเอง > ค่ากลางจากผู้เล่นคนอื่น > หมุดประมาณของแอป
// src.tee/src.green = 'mine' | 'crowd' | 'app' · crowd.tee/crowd.green = { n, gps } จำนวนผู้เล่นที่วาง
const blank = () => ({ tee: null, green: null, front: null, back: null, hazards: [], est: { tee: false, green: false }, conf: null, src: {}, crowd: {} });
// หมุดที่ผู้ใช้วางเองมาก่อนเสมอ หมุดไหนยังไม่วางใช้หมุดเริ่มต้นของแอป (est = เป็นค่าประมาณ)
export function courseHoles(courseId) {
  const out = {};
  const base = COURSE_HOLES[courseId]?.holes ?? {};
  for (const [n, h] of Object.entries(base)) {
    out[n] = {
      tee: { lat: h.tee[0], lon: h.tee[1] }, green: { lat: h.green[0], lon: h.green[1] },
      front: null, back: null, hazards: [], est: { tee: true, green: true }, conf: h.conf,
      src: { tee: 'app', green: 'app' }, crowd: {},
    };
  }
  // ค่ากลางจากผู้เล่นคนอื่น: ใช้แทนหมุดประมาณเมื่อมีอย่างน้อย 2 คน หรือมีคนวางด้วย GPS ในสนาม
  for (const r of cachedPins(courseId)) {
    const cur = out[r.hole] ?? blank();
    const trusted = r.n >= 2 || r.gps >= 1;
    if (r.kind === 'tee' || r.kind === 'green') {
      if (cur[r.kind] && !trusted) continue;
      cur[r.kind] = clean(r);
      cur.est = { ...cur.est, [r.kind]: false };
      cur.src = { ...cur.src, [r.kind]: 'crowd' };
      cur.crowd = { ...cur.crowd, [r.kind]: { n: r.n, gps: r.gps } };
    } else if (!cur[r.kind]) {
      cur[r.kind] = clean(r);
    }
    out[r.hole] = cur;
  }
  const raw = st.setting(holesKey(courseId), null)?.holes;
  if (!raw || typeof raw !== 'object') return out;
  for (const [n, h] of Object.entries(raw)) {
    const cur = out[n] ?? blank();
    for (const which of ['tee', 'green']) {
      if (valid(h?.[which])) {
        cur[which] = clean(h[which]);
        cur.est = { ...cur.est, [which]: false };
        cur.src = { ...cur.src, [which]: 'mine' };
      }
    }
    for (const which of ['front', 'back']) if (valid(h?.[which])) cur[which] = clean(h[which]);
    if (Array.isArray(h?.hazards)) {
      cur.hazards = h.hazards.filter(validHazard)
        .slice(0, MAX_HAZARDS).map((z) => ({ ...clean(z), kind: z.kind }));
    }
    if (cur.tee || cur.green) out[n] = cur;
  }
  return out;
}

export const isEstimated = (h) => !!(h?.est?.tee || h?.est?.green);
// หมุดที่ไม่ใช่ค่าประมาณจากภาพดาวเทียม ใช้คำนวณข้อมูลที่บันทึกถาวร (ระยะช็อต ระยะไม้) · ค่าประมาณอาจผิดทั้งหลุม
export const confirmedPoint = (h, which) => (h?.[which] && !h.est?.[which] ? h[which] : null);
// หมุดจากผู้เล่นคนอื่นที่ใช้อยู่ในหลุมนี้ (ไม่นับหมุดที่เราวางเอง) → { n, gps } ของหมุดที่มีคนวางมากสุด
export function crowdOf(h) {
  const list = ['tee', 'green'].filter((k) => h?.src?.[k] === 'crowd').map((k) => h.crowd[k]);
  return list.length ? list.reduce((a, b) => (b.n > a.n ? b : a)) : null;
}
export const holesSource = (courseId) => COURSE_HOLES[courseId]?.source ?? null;

export const holeReady = (h) => !!(h?.tee && h?.green);

const round7 = (p) => ({ lat: Math.round(p.lat * 1e7) / 1e7, lon: Math.round(p.lon * 1e7) / 1e7 });

async function updateHole(courseId, n, fn) {
  const cur = st.setting(holesKey(courseId), null);
  const holes = { ...(cur?.holes || {}) };
  holes[n] = fn({ ...(holes[n] || {}) });
  await st.setSetting(holesKey(courseId), { holes, updated_at: st.nowIso() });
}

// which: tee | green | front | back
export async function setHolePoint(courseId, n, which, point) {
  await updateHole(courseId, n, (h) => {
    // via: 'gps' = ยืนวางในสนามจริง (เชื่อถือได้มากกว่าแตะบนแผนที่) ใช้ตอนแชร์หมุด
    if (point) h[which] = { ...round7(point), ...(point.via === 'gps' ? { via: 'gps' } : {}) };
    else delete h[which];
    return h;
  });
}

export async function addHazard(courseId, n, point, kind) {
  if (!HAZARD_KINDS.some((k) => k.v === kind)) throw new Error('ชนิดอุปสรรคไม่ถูกต้อง');
  await updateHole(courseId, n, (h) => {
    const list = Array.isArray(h.hazards) ? h.hazards.filter(validHazard) : [];
    if (list.length >= MAX_HAZARDS) throw new Error(`วางอุปสรรคได้สูงสุด ${MAX_HAZARDS} จุดต่อหลุม`);
    return { ...h, hazards: [...list, { ...round7(point), kind }] };
  });
}

// ย้ายหรือลบอุปสรรคตามลำดับ (point = null คือลบ)
export async function setHazard(courseId, n, index, point) {
  await updateHole(courseId, n, (h) => {
    const list = Array.isArray(h.hazards) ? h.hazards.filter(validHazard) : [];
    if (!list[index]) return h;
    if (point) list[index] = { ...list[index], ...round7(point) };
    else list.splice(index, 1);
    return { ...h, hazards: list };
  });
}

// ระยะหลุมจากสกอร์การ์ดของแท่นที่ใช้ (ไว้เทียบกับที่วัดจากหมุด)
export function scorecardLength(sc, n, teeId) {
  if (!sc?.tees?.length) return null;
  const tee = sc.tees.find((t) => t.id === teeId) ?? sc.tees.find((t) => t.id === 'white') ?? sc.tees[0];
  const y = tee?.yards?.[n - 1];
  if (!Number.isFinite(y)) return null;
  return { value: y, unit: sc.unit === 'm' ? 'm' : 'yd', tee: tee.name };
}
