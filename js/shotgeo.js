// ตำแหน่งช็อตบนพื้น: จุดตี และจุดที่ลูกไปจบ
// จุดตี = GPS ตอนบันทึกช็อต (ยืนที่ลูก) · ช็อตแรกใช้หมุดแท่นทีแทนได้ · ไม่มี GPS ใช้จุดที่ลูกช็อตก่อนไปจบ
// จุดจบ = หมุดที่ผู้ใช้ปักบนแผนที่ (shot.land) ก่อน · ไม่มีใช้จุดตีของช็อตถัดไป
// ช็อตที่โดนลูกโทษ: ช็อตถัดไปตีจากจุดดรอปหรือแท่นทีใหม่ จึงรู้จุดจบได้จากหมุดที่ปักเท่านั้น
import { distM, bearing, fmtDist, unitTh } from './holemap.js';

export const GPS_MAX_ACC = 25;   // เมตร: ตำแหน่งคลาดเคลื่อนเกินนี้ไม่นำมาคิด

const valid = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
export const gpsOf = (s) => (valid(s?.gps) && (s.gps.acc ?? 0) <= GPS_MAX_ACC ? { lat: s.gps.lat, lon: s.gps.lon } : null);
export const landOf = (s) => (valid(s?.land) ? { lat: s.land.lat, lon: s.land.lon } : null);
export const cleanLand = (p) => (valid(p) ? { lat: p.lat, lon: p.lon, via: 'map' } : null);

// เส้นทางของทุกช็อตในหลุม (เรียงตามลำดับ เฉพาะช็อตที่นับ) → [{ shot, start, end, penalized, dist }]
export function shotPath(shots, teePin = null, pens = []) {
  const list = shots.filter((s) => s.counted !== false).sort((a, b) => a.sequence - b.sequence);
  const penalized = new Set(pens.map((p) => p.related_shot_id_optional).filter(Boolean));
  const tee = valid(teePin) ? { lat: teePin.lat, lon: teePin.lon } : null;
  const start = list.map((s, i) => gpsOf(s)
    ?? (i === 0 ? tee : !penalized.has(list[i - 1].id) ? landOf(list[i - 1]) : null));
  return list.map((s, i) => {
    const pen = penalized.has(s.id);
    const end = landOf(s) ?? (i < list.length - 1 && !pen ? start[i + 1] : null);
    const a = start[i];
    return { shot: s, start: a, end, penalized: pen, dist: a && end ? distM(a, end) : null };
  });
}

// ระยะของแต่ละช็อต (เมตร) เฉพาะที่รู้ทั้งจุดตีและจุดจบ
export function shotDistances(shots, teePin = null, pens = []) {
  const out = new Map();
  for (const x of shotPath(shots, teePin, pens)) if (x.dist != null) out.set(x.shot.id, x.dist);
  return out;
}

// ระยะออกจากแนว a→b ของจุด p (เมตร): บวก = ขวา ลบ = ซ้าย (มองจาก a ไป b) · along = ระยะตามแนว
export function offLine(a, b, p) {
  if (!valid(a) || !valid(b) || !valid(p)) return null;
  const d = distM(a, p);
  if (d < 0.5) return { off: 0, along: 0 };
  const t = ((bearing(a, p) - bearing(a, b)) * Math.PI) / 180;
  return { off: d * Math.sin(t), along: d * Math.cos(t) };
}

// ทิศที่ลูกไปเทียบแนวจุดตี→กลางกรีน: ทีออฟพาร์ 4–5 ใช้เกณฑ์กว้างกว่า (แฟร์เวย์กว้าง และแนวเล็งอาจไม่ตรงกรีน)
export const offLimit = (teeShot) => (teeShot ? 15 : 8);
export function sideOf(off, teeShot = false) {
  if (off == null) return null;
  const lim = offLimit(teeShot);
  if (Math.abs(off) >= lim) return off > 0 ? 'right' : 'left';
  return Math.abs(off) <= lim / 2 ? 'on_line' : null;
}

// สรุปจุดที่ลูกไปจบ: ระยะจากจุดตี เหลือถึงกลางกรีน และออกจากแนวจุดตี→กลางกรีน
export function landInfo(start, land, green, teeShot = false) {
  if (!land) return null;
  const line = start && green ? offLine(start, green, land) : null;
  return {
    dist: start ? distM(start, land) : null,
    left: green ? distM(land, green) : null,
    off: line?.off ?? null,
    side: line ? sideOf(line.off, teeShot) : null,
  };
}

export function landText(info, unit) {
  if (!info) return '';
  const u = unitTh(unit);
  return [
    info.dist != null ? `${fmtDist(info.dist, unit)} ${u}` : '',
    info.off != null && Math.abs(info.off) >= 3 ? `ออก${info.off > 0 ? 'ขวา' : 'ซ้าย'} ${fmtDist(Math.abs(info.off), unit)}` : info.off != null ? 'ตรงแนว' : '',
    info.left != null ? `เหลือถึงกรีน ${fmtDist(info.left, unit)}` : '',
  ].filter(Boolean).join(' · ');
}
