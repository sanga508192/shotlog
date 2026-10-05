// สรุปหลังจบรอบ (คำนวณล้วน ๆ): รอบนี้เสียสโตรกตรงไหน เทียบค่าเฉลี่ยของตัวเองและงบของเป้า
// ทำตามแผนทีออฟได้แค่ไหน · หลุมที่เสียมาก · สัปดาห์นี้ควรซ้อมอะไร
import { holeFacts, LEAKS } from './coach.js';

// แบบฝึกสำหรับเรื่องที่เสียมากที่สุดของรอบ (ชุดเดียวกับแผนซ้อมในหน้าพัฒนา)
export const RECAP_DRILLS = {
  pen: ['tee-gate', 'tee-club-test'],
  long: ['contact-half', 'tee-gate'],
  miss: ['approach-ladder', 'approach-center'],
  short: ['short-landing', 'short-updown'],
  putt: ['putt-ladder', 'putt-circle'],
};
export const RECAP_AREA = { pen: 'ทีออฟให้อยู่ในเกม (ลดลูกโทษ)', long: 'การสัมผัสลูกของช็อตยาว', miss: 'ช็อตเข้ากรีน', short: 'ลูกสั้นรอบกรีน', putt: 'พัต' };
export const MIN_HOLES = 6;

const sum = (fs, fn) => fs.reduce((a, f) => a + fn(f), 0);

// rounds = ทุกรอบ เรียงใหม่สุดก่อน (st.rounds()) · planOf(hole) = รหัสไม้ตามแผนทีออฟของหลุม (null = ไม่มีแผน)
export function roundRecap({ round, rounds, holesOf, shotsOf, penaltiesOf, goal, planOf = () => null, baseRounds = 10 }) {
  const factsOf = (r) => holesOf(r.id).map((h) => holeFacts(h, shotsOf(h.id), penaltiesOf(h.id))).filter(Boolean);
  const mine = factsOf(round);
  const n = mine.length;
  if (n < MIN_HOLES) return { enough: false, n };

  // ค่าเฉลี่ยจากรอบก่อนหน้าที่จดรายช็อต (ไม่นับรอบนี้และรอบที่เล่นหลังจากนี้) ปรับเป็นจำนวนหลุมเท่ารอบนี้
  const day = String(round.played_at || '9999');
  const before = rounds.filter((r) => r.id !== round.id && r.status !== 'playing' && r.shot_logging !== false && String(r.played_at || '') <= day).slice(0, baseRounds);
  const base = before.flatMap(factsOf);
  const hasBase = base.length >= 9;
  const scaled = (fn) => (hasBase ? (sum(base, fn) / base.length) * n : null);

  const leaks = LEAKS.map((d) => ({
    k: d.k, th: d.th, icon: d.icon,
    now: sum(mine, (f) => f.leak[d.k]),
    avg: scaled((f) => f.leak[d.k]),
    target: (goal.budget[d.k] * n) / 18,
  }));
  const save = { now: sum(mine, (f) => f.leak.save), avg: scaled((f) => f.leak.save) };

  const firK = mine.filter((f) => f.fir != null);
  const baseFir = base.filter((f) => f.fir != null);
  const stats = {
    fir: { hit: firK.filter((f) => f.fir).length, of: firK.length, avgPct: hasBase && baseFir.length >= 4 ? baseFir.filter((f) => f.fir).length / baseFir.length : null },
    gir: { now: mine.filter((f) => f.gir).length, avg: scaled((f) => (f.gir ? 1 : 0)) },
    putts: { now: sum(mine, (f) => f.putts), avg: scaled((f) => f.putts) },
    three: { now: mine.filter((f) => f.putts >= 3).length, avg: scaled((f) => (f.putts >= 3 ? 1 : 0)) },
    pen: { now: sum(mine, (f) => f.leak.pen), avg: scaled((f) => f.leak.pen) },
  };

  // เรื่องที่เสียเกินงบของเป้ามากที่สุด และเรื่องที่ดีขึ้นจากค่าเฉลี่ยชัดที่สุด
  const worst = [...leaks].map((l) => ({ ...l, gap: l.now - l.target })).filter((l) => l.gap >= 0.5).sort((a, b) => b.gap - a.gap)[0] ?? null;
  const best = hasBase ? [...leaks].map((l) => ({ ...l, gain: l.avg - l.now })).filter((l) => l.gain >= 1).sort((a, b) => b.gain - a.gain)[0] ?? null : null;

  // ทีออฟตามแผน vs ไม่ตามแผน (เฉพาะหลุมที่มีแผนและรู้ไม้ช็อตแรก)
  const grp = () => ({ n: 0, pen: 0, fir: 0, firOf: 0, over: 0 });
  const tee = { follow: grp(), other: grp() };
  for (const f of mine) {
    const plan = planOf(f.hole);
    const s1 = f.shots[0];
    if (!plan || !s1?.club_id) continue;
    const g = s1.club_id === plan ? tee.follow : tee.other;
    g.n++;
    g.over += f.over;
    if (f.pens.some((p) => p.related_shot_id_optional === s1.id)) g.pen++;
    if (f.fir != null) { g.firOf++; if (f.fir) g.fir++; }
  }
  tee.planned = tee.follow.n + tee.other.n;

  // หลุมที่เสียมาก (ดับเบิ้ลขึ้นไป) พร้อมที่มา
  const blow = mine.filter((f) => f.over >= 2).sort((a, b) => b.over - a.over || a.hole.number - b.hole.number).slice(0, 3)
    .map((f) => ({ n: f.hole.number, over: f.over, why: LEAKS.filter((d) => f.leak[d.k] > 0).map((d) => d.th) }));

  const over = sum(mine, (f) => f.over);
  return {
    enough: true, n, over, avgOver: scaled((f) => f.over), hasBase, baseRounds: before.length,
    leaks, save, stats, worst, best, tee, blow,
    practice: worst ? { k: worst.k, th: RECAP_AREA[worst.k], drills: RECAP_DRILLS[worst.k] } : null,
  };
}
