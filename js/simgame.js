// เกมออกรอบจำลอง (ซ้อมกับเครื่องหรือในสนามไดรฟ์): 9 หลุมจากสนามจริงที่เล่นบ่อย หรือสนามมาตรฐาน
// ทุกช็อตบอกไม้ เป้า และเกณฑ์ผ่าน · เปลี่ยนไม้และเป้าทุกลูกเหมือนออกรอบ (ฝึกให้วงสวิงที่แก้แล้วใช้ได้จริงในสนาม)
// ลูกสั้นในระยะ 30 หลาซ้อมแยกที่กรีนซ้อม
import { teePlan, clubFor } from './strategy.js';

const YD = 0.9144;
// สนามมาตรฐานเมื่อยังไม่มีสนามที่มีระยะครบ (หลา)
export const DEFAULT_NINE = [[4, 380], [4, 360], [3, 160], [5, 510], [4, 400], [4, 340], [3, 175], [4, 390], [5, 530]]
  .map(([par, yd], i) => ({ n: i + 1, par, lengthM: yd * YD, hazards: [] }));
// เบี่ยงจากแนวเป้าไม่เกินนี้ (หลา) = ผ่าน · ระยะลอยห่างเป้าไม่เกิน 8% (ช็อตเข้ากรีน)
const SIDE = { driver: 20, wood: 18, hybrid: 15, iron: 10, wedge: 7 };
const sideOfClub = (c) => (SIDE[c.category] ?? 10) * YD;

export function buildGame({ holes, clubs, missSide = null, fmt = (m) => `${Math.round(m / YD)} หลา` }) {
  const rows = clubs.filter((c) => c.n >= 3 && c.category !== 'putter' && c.median > 0).sort((a, b) => b.median - a.median);
  if (!rows.length || !holes?.length) return [];
  // ช็อตที่สองเป็นต้นไปไม่ใช้ไดรเวอร์ (ตีจากพื้น)
  const ground = rows.filter((r) => r.category !== 'driver');
  const fairwayClub = ground[0] ?? rows[0];
  return holes.map((h) => {
    if (!h.lengthM || !Number.isInteger(h.par)) return null;
    const tp = teePlan({ par: h.par, lengthM: h.lengthM, hazards: h.hazards ?? [], clubs: rows, missSide, fmt });
    if (!tp) return null;
    const shots = [];
    if (h.par === 3) {
      shots.push({ kind: 'tee', club: tp.club, target: h.lengthM, aim: tp.aim, side: sideOfClub(tp.club) });
    } else {
      shots.push({ kind: 'tee', club: tp.club, target: null, aim: tp.aim, side: sideOfClub(tp.club) });
      let left = h.lengthM - (tp.club.total ?? tp.club.median);
      for (let guard = 0; left > 30 * YD && guard < 3; guard++) {
        const layup = left > fairwayClub.median + 25 * YD;
        const c = layup ? fairwayClub : clubFor(left, ground, fmt);
        const target = layup ? c.median : left;
        shots.push({ kind: layup ? 'layup' : 'approach', club: c, target, aim: layup ? 'กลางแฟร์เวย์' : 'กลางกรีน', side: sideOfClub(c) });
        left -= layup ? (c.total ?? c.median) : left;
      }
    }
    return { n: h.n, par: h.par, lengthM: h.lengthM, shots, note: tp.notes[0] ?? null };
  }).filter(Boolean);
}

// เกณฑ์ผ่านของช็อตเป็นข้อความ
export function passText(shot, fmt) {
  const side = `เบี่ยงไม่เกิน ${fmt(shot.side)}`;
  if (shot.target == null) return `ลงแฟร์เวย์: ${side}`;
  return `ระยะลอยห่าง ${fmt(shot.target)} ไม่เกิน ${fmt(shot.target * 0.08)} และ${side}`;
}
