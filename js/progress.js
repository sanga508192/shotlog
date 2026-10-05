// พัฒนาการ (คำนวณล้วน ๆ): สกอร์รายรอบ ค่าเฉลี่ยเคลื่อนที่ สรุปรายเดือน และแต้มต่อ (WHS โดยประมาณ) หลังแต่ละรอบ
import { holeFacts } from './coach.js';
import { playerHoleScore, ME } from './group.js';
import { differential, indexFrom, validRating } from './handicap.js';

const byDate = (a, b) => String(a.played_at || '').localeCompare(String(b.played_at || '')) || String(a.created_at || '').localeCompare(String(b.created_at || ''));

// รอบที่จบแล้ว มีสกอร์ของเราอย่างน้อย 9 หลุมที่รู้พาร์ (รวมรอบจดเร็ว/ก๊วน) เรียงเก่า→ใหม่
// score18 = สกอร์เทียบ 18 หลุมพาร์ 72 · facts = หลุมที่จดรายช็อตครบ (ใช้คิดสถิติ)
export function scoreRounds({ rounds, holesOf, shotsOf, penaltiesOf }) {
  const out = [];
  for (const r of rounds.filter((x) => x.status !== 'playing').sort(byDate)) {
    let n = 0, over = 0;
    const facts = [];
    for (const h of holesOf(r.id)) {
      const sc = playerHoleScore(h, ME, shotsOf(h.id), penaltiesOf(h.id));
      if (!sc?.final || !Number.isInteger(h.par)) continue;
      n++;
      over += sc.strokes - h.par;
      if (r.shot_logging !== false) {
        const f = holeFacts(h, shotsOf(h.id), penaltiesOf(h.id));
        if (f) facts.push(f);
      }
    }
    if (n < 9) continue;
    out.push({ id: r.id, date: String(r.played_at || '').slice(0, 10), course: r.course_name_snapshot || '', n, over, score18: 72 + (over * 18) / n, facts });
  }
  return out;
}

// ค่าเฉลี่ยของ k ค่าล่าสุดจนถึงแต่ละจุด
export function rollingAvg(values, k = 5) {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - k + 1), i + 1);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
}

// ช่วงเวลา: '3m' | '12m' | 'all' · today = 'YYYY-MM-DD'
export function inRange(list, range, today) {
  if (range === 'all') return list;
  const months = range === '3m' ? 3 : 12;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  const from = d.toISOString().slice(0, 10);
  return list.filter((x) => x.date >= from);
}

// สรุปรายเดือน (ใหม่สุดก่อน): จำนวนรอบ สกอร์เฉลี่ย ดีสุด และสถิติต่อ 18 หลุมจากหลุมที่จดรายช็อต
export function monthly(list) {
  const m = new Map();
  for (const r of list) {
    const k = r.date.slice(0, 7);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m].sort((a, b) => b[0].localeCompare(a[0])).map(([month, rs]) => {
    const facts = rs.flatMap((r) => r.facts);
    const per18 = (fn) => (facts.length >= 9 ? (facts.reduce((a, f) => a + fn(f), 0) * 18) / facts.length : null);
    const firK = facts.filter((f) => f.fir != null);
    return {
      month, rounds: rs.length,
      avg: rs.reduce((a, r) => a + r.score18, 0) / rs.length,
      best: Math.min(...rs.map((r) => r.score18)),
      holes: facts.length,
      putts: per18((f) => f.putts),
      pen: per18((f) => f.leak.pen),
      gir: per18((f) => (f.gir ? 1 : 0)),
      fir: firK.length >= 4 ? (firK.filter((f) => f.fir).length / firK.length) * 100 : null,
    };
  });
}

// แต้มต่อหลังแต่ละรอบ 18 หลุมที่มี Course Rating/Slope (ต้องมีอย่างน้อย 3 รอบจึงเริ่มมีค่า)
// rounds = [{ courseId, teeId, date, holes: [{ par, hc, strokes }] }] เรียงเก่า→ใหม่
export function handicapSeries(rounds, ratingOf, prior = null) {
  const diffs = [], out = [];
  for (const r of rounds) {
    if (r.holes.length !== 18) continue;
    const rating = validRating(ratingOf(r.courseId, r.teeId));
    const d = rating ? differential(r.holes, rating, prior) : null;
    if (!d) continue;
    diffs.push(d.diff);
    const index = indexFrom(diffs);
    if (index != null) out.push({ date: String(r.date || '').slice(0, 10), index, diff: d.diff });
  }
  return out;
}

// เปลี่ยนไปเท่าไร: ค่าเฉลี่ย 3 รอบแรกเทียบ 3 รอบล่าสุดในช่วง (ต้องมีอย่างน้อย 6 รอบ)
export function change(values) {
  if (values.length < 6) return null;
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return avg(values.slice(-3)) - avg(values.slice(0, 3));
}
