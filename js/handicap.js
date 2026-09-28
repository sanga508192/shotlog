// แฮนดิแคปโดยประมาณตามสูตร World Handicap System (WHS) — ไม่ใช่แฮนดิแคปทางการ
// Score Differential = (113 ÷ Slope) × (สกอร์ปรับแล้ว − Course Rating) · ดัชนี = ค่าเฉลี่ยของ differential ที่ดีที่สุดตามจำนวนรอบ (สูงสุด 20 รอบล่าสุด)
// สกอร์ปรับแล้ว: แต่ละหลุมไม่เกิน net double bogey (พาร์ + 2 + สโตรกที่ได้) ถ้ายังไม่มีแต้มต่อใช้พาร์ + 5

export const ratingKey = (courseId, teeId) => `course_rating:${courseId}:${teeId || 'default'}`;

export function validRating(r) {
  const cr = Number(r?.cr), slope = Number(r?.slope);
  return Number.isFinite(cr) && cr >= 50 && cr <= 90 && Number.isFinite(slope) && slope >= 55 && slope <= 155 ? { cr, slope } : null;
}

// จำนวนรอบ → [ใช้กี่ค่าที่ดีที่สุด, ปรับเพิ่ม]
const TABLE = { 3: [1, -2], 4: [1, -1], 5: [1, 0], 6: [2, -1], 7: [2, 0], 8: [2, 0], 9: [3, 0], 10: [3, 0], 11: [3, 0], 12: [4, 0], 13: [4, 0], 14: [4, 0], 15: [5, 0], 16: [5, 0], 17: [6, 0], 18: [6, 0], 19: [7, 0] };

export function indexFrom(diffs) {
  const d = diffs.slice(-20);
  if (d.length < 3) return null;
  const [k, adj] = TABLE[d.length] ?? [8, 0];
  const best = [...d].sort((a, b) => a - b).slice(0, k);
  const v = best.reduce((a, b) => a + b, 0) / k + adj;
  return Math.min(54, Math.trunc(v * 10) / 10);
}

// สโตรกที่ได้ในหลุมนั้นตาม HC ของหลุม (ถ้าไม่รู้ HC ของหลุม เฉลี่ยให้ทุกหลุม)
export function strokesReceived(courseHc, hcIndex) {
  const ch = Math.max(0, Math.round(courseHc));
  const base = Math.floor(ch / 18), extra = ch % 18;
  if (!Number.isInteger(hcIndex)) return Math.round(ch / 18);
  return base + (hcIndex <= extra ? 1 : 0);
}

// holes: [{ par, hc, strokes }] ครบ 18 หลุม · priorIndex = แต้มต่อเดิม (null = ยังไม่มี)
export function differential(holes, rating, priorIndex = null) {
  const r = validRating(rating);
  if (!r || holes.length !== 18 || holes.some((h) => !Number.isInteger(h.par) || !Number.isFinite(h.strokes))) return null;
  const par = holes.reduce((a, h) => a + h.par, 0);
  const courseHc = priorIndex == null ? null : priorIndex * (r.slope / 113) + (r.cr - par);
  const ags = holes.reduce((a, h) => {
    const cap = courseHc == null ? h.par + 5 : h.par + 2 + strokesReceived(courseHc, h.hc);
    return a + Math.min(h.strokes, cap);
  }, 0);
  return { ags, par, diff: Math.round(((113 / r.slope) * (ags - r.cr)) * 10) / 10 };
}

// rounds: [{ id, courseId, teeId, date, holes }] เรียงเก่า→ใหม่ · ratingOf(courseId, teeId) → { cr, slope } | null
export function estimateHandicap(rounds, ratingOf, priorIndex = null) {
  const used = [], missing = new Map();
  for (const r of rounds) {
    if (r.holes.length !== 18) continue;
    const rating = validRating(ratingOf(r.courseId, r.teeId));
    if (!rating) {
      const k = `${r.courseId}|${r.teeId || ''}`;
      if (!missing.has(k)) missing.set(k, { courseId: r.courseId, teeId: r.teeId, name: r.name, tee: r.tee, count: 0 });
      missing.get(k).count++;
      continue;
    }
    const d = differential(r.holes, rating, priorIndex);
    if (d) used.push({ ...r, ...d, ...rating });
  }
  return { index: indexFrom(used.map((u) => u.diff)), used: used.slice(-20), missing: [...missing.values()] };
}
