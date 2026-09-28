// หมุดสนามจากผู้เล่นคนอื่น (เซิร์ฟเวอร์รวมเป็นค่ากลาง ไม่บอกว่าใครวาง) และการแชร์หมุดของเรา
// ใช้เฉพาะสนามในรายชื่อของแอป (รหัสสนามตรงกันทุกเครื่อง) · แชร์เฉพาะหมุดที่ผู้ใช้วางเอง เมื่อเปิดแชร์ไว้เท่านั้น
import * as st from './state.js';
import * as cloud from './cloud.js';
import { CURATED_COURSES } from './courses.js';
import { logError } from './errors.js';

const TTL = 12 * 3600 * 1000;
const KINDS = ['tee', 'green', 'front', 'back'];
const cacheKey = (id) => `cpins:${id}`;
const sentKey = (id) => `cpins_sent:${id}`;
const valid = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

export const shareable = (courseId) => CURATED_COURSES.some((c) => c.id === courseId);
export const sharing = () => st.setting('share_pins', false) === true;

// ค่ากลางที่เก็บไว้ในเครื่อง: [{ hole, kind, lat, lon, n, gps }]
export function cachedPins(courseId) {
  const rows = st.meta(cacheKey(courseId))?.rows;
  return Array.isArray(rows) ? rows : [];
}

const saveMeta = (key, value) => st.commit([{ store: 'meta', put: { key, value } }], { raw: true });

// ดึงค่ากลางใหม่ถ้าของเดิมเก่ากว่า 12 ชม. · คืน true ถ้าข้อมูลเปลี่ยน · ออฟไลน์หรือเซิร์ฟเวอร์ยังไม่รองรับ = ใช้ของเดิม
export async function refreshPins(courseId, { force = false } = {}) {
  if (!cloud.enabled() || !shareable(courseId)) return false;
  if (globalThis.navigator?.onLine === false) return false;
  const cur = st.meta(cacheKey(courseId));
  if (!force && cur && Date.now() - cur.at < TTL) return false;
  let rows;
  try {
    rows = await cloud.communityPins(courseId);
  } catch (err) {
    if (err?.status === 404) return false;   // เซิร์ฟเวอร์ยังไม่ได้อัปเดตฐานข้อมูล (ยังไม่มีฟังก์ชันนี้)
    throw err;
  }
  const clean = (Array.isArray(rows) ? rows : [])
    .filter((r) => valid(r) && Number.isInteger(r.hole) && r.hole >= 1 && r.hole <= 27 && KINDS.includes(r.kind))
    .map((r) => ({ hole: r.hole, kind: r.kind, lat: r.lat, lon: r.lon, n: Math.max(1, r.n | 0), gps: Math.max(0, r.gps | 0) }));
  const changed = JSON.stringify(clean) !== JSON.stringify(cur?.rows ?? []);
  await saveMeta(cacheKey(courseId), { at: Date.now(), rows: clean });
  return changed;
}

// หมุดที่ผู้ใช้วางเองในสนามนี้ (ไม่รวมหมุดประมาณของแอปหรือของคนอื่น)
export function myPins(courseId) {
  const raw = st.setting(`course_holes:${courseId}`, null)?.holes;
  const out = [];
  if (!raw || typeof raw !== 'object') return out;
  for (const [n, h] of Object.entries(raw)) {
    const hole = Number(n);
    if (!Number.isInteger(hole) || hole < 1 || hole > 27) continue;
    for (const kind of KINDS) {
      const p = h?.[kind];
      if (valid(p)) out.push({ hole, kind, lat: p.lat, lon: p.lon, via: p.via === 'gps' ? 'gps' : 'map' });
    }
  }
  return out;
}

// ส่งหมุดของเราขึ้นไป (แทนที่ของเดิมของเราในสนามนี้) เฉพาะเมื่อเปลี่ยนจากที่ส่งครั้งก่อน
export async function shareMine(courseId) {
  if (!sharing() || !shareable(courseId) || !cloud.enabled() || !cloud.session()) return false;
  const pins = myPins(courseId);
  const sig = JSON.stringify(pins);
  if (st.meta(sentKey(courseId)) === sig) return false;
  await cloud.sharePins(courseId, pins);
  await saveMeta(sentKey(courseId), sig);
  await refreshPins(courseId, { force: true }).catch(() => {});
  return true;
}

const timers = new Map();
export function scheduleShare(courseId, onDone) {
  if (!sharing() || !shareable(courseId)) return;
  clearTimeout(timers.get(courseId));
  timers.set(courseId, setTimeout(() => {
    timers.delete(courseId);
    shareMine(courseId).then((sent) => sent && onDone?.()).catch((err) => logError('share pins', err));
  }, 3000));
}

// เลิกแชร์: ลบหมุดทั้งหมดของเราบนเซิร์ฟเวอร์ แล้วล้างสถานะที่เคยส่ง
export async function stopSharing() {
  if (cloud.enabled() && cloud.session()) await cloud.unshareAllPins();
  const ops = [...st.S.meta.keys()].filter((k) => String(k).startsWith('cpins_sent:')).map((k) => ({ store: 'meta', del: k }));
  if (ops.length) await st.commit(ops, { raw: true });
}
