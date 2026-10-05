// ทดสอบสรุปหลังรอบ: เทียบค่าเฉลี่ยรอบก่อน งบเป้า ทีออฟตามแผน และแบบฝึกที่แนะนำ
import test from 'node:test';
import assert from 'node:assert/strict';
import { roundRecap, MIN_HOLES } from '../js/recap.js';
import { goalOf } from '../js/coach.js';

// หลุมพาร์ 4 ที่จบแล้ว: ทีออฟ (ไม้ club) → [ลูกโทษ] → เข้ากรีน → พัต putts ครั้ง
function hole(roundId, n, { club = 'D', fairway = true, pen = 0, putts = 2 } = {}) {
  const id = `${roundId}-h${n}`;
  const shots = [
    { id: `${id}-1`, sequence: 1, shot_type: 'tee', club_id: club, start_lie: 'tee', end_lie: pen ? 'water' : fairway ? 'fairway' : 'rough', counted: true },
    { id: `${id}-2`, sequence: 2, shot_type: 'approach', club_id: 'I7', end_lie: 'green', counted: true },
  ];
  for (let k = 0; k < putts; k++) shots.push({ id: `${id}-p${k}`, sequence: 3 + k, shot_type: 'putt', start_lie: 'green', end_lie: k === putts - 1 ? 'holed' : 'green', holed: k === putts - 1, counted: true });
  const pens = pen ? [{ id: `${id}-pen`, strokes: pen, related_shot_id_optional: `${id}-1` }] : [];
  return { h: { id, round_id: roundId, number: n, par: 4, status: 'done', finish: 'holed' }, shots, pens };
}

function world(spec) {
  const rounds = [], holes = new Map(), shots = new Map(), pens = new Map();
  for (const [r, list] of spec) {
    rounds.push(r);
    holes.set(r.id, list.map((x) => x.h));
    for (const x of list) { shots.set(x.h.id, x.shots); pens.set(x.h.id, x.pens); }
  }
  return { rounds, holesOf: (id) => holes.get(id) ?? [], shotsOf: (id) => shots.get(id) ?? [], penaltiesOf: (id) => pens.get(id) ?? [] };
}

const R = (id, date, extra = {}) => ({ id, played_at: date, status: 'complete', shot_logging: true, ...extra });
const nine = (rid, f) => Array.from({ length: 9 }, (_, i) => hole(rid, i + 1, f(i + 1)));

test('สรุปหลังรอบ: ลูกโทษเกินงบเป้ามากสุด → แนะนำซ้อมทีออฟ · พัตดีกว่าค่าเฉลี่ย · หลุมที่เสียมากพร้อมที่มา', () => {
  const cur = R('now', '2026-10-05');
  const w = world([
    // ใหม่สุดก่อน เหมือน st.rounds()
    [cur, nine('now', (n) => (n === 3 || n === 7 ? { pen: n === 3 ? 2 : 1, fairway: false, club: 'D' } : { club: '3W', putts: n === 5 ? 1 : 2 }))],
    [R('old1', '2026-09-20'), nine('old1', (n) => ({ putts: n % 3 === 0 ? 3 : 2, fairway: n % 2 === 0 }))],
    [R('old2', '2026-09-10'), nine('old2', (n) => ({ putts: n % 3 === 0 ? 3 : 2, fairway: n % 2 === 1 }))],
    [R('later', '2026-10-20'), nine('later', () => ({ pen: 2 }))],   // รอบหลังจากนี้ ไม่นับเป็นค่าเฉลี่ย
  ]);
  const r = roundRecap({ round: cur, ...w, goal: goalOf('90'), planOf: () => '3W' });
  assert.equal(r.enough, true);
  assert.equal(r.n, 9);
  assert.equal(r.baseRounds, 2, 'ไม่นับรอบที่เล่นหลังจากนี้');
  assert.equal(r.worst.k, 'pen');
  assert.equal(r.worst.now, 3, 'ลูกโทษ +2 (OB กติกาท้องถิ่น) และ +1');
  assert.equal(r.practice.k, 'pen');
  assert.deepEqual(r.practice.drills, ['tee-gate', 'tee-club-test']);
  assert.equal(r.best.k, 'putt', 'ไม่มี 3-พัต ขณะที่ปกติมี 3 ครั้งต่อ 9 หลุม');
  assert.equal(r.stats.putts.now, 17);
  assert.equal(r.stats.three.avg, 3);
  // ทีออฟ: ตามแผน (3W) 7 หลุมไม่มีลูกโทษ · ไม่ตามแผน (D) 2 หลุม ลูกโทษ 2
  assert.deepEqual([r.tee.follow.n, r.tee.follow.pen, r.tee.other.n, r.tee.other.pen], [7, 0, 2, 2]);
  assert.deepEqual(r.blow.map((b) => [b.n, b.over]), [[3, 2]], 'นับเฉพาะดับเบิ้ลขึ้นไป');
  assert.ok(r.blow[0].why.includes('ลูกโทษ'));
});

test('สรุปหลังรอบ: ข้อมูลไม่พอ · ไม่มีรอบก่อนหน้า = ไม่เทียบค่าเฉลี่ย · ทุกอย่างในงบ = ไม่มีเรื่องที่ต้องซ้อม', () => {
  const few = R('few', '2026-10-05');
  const w1 = world([[few, nine('few', () => ({})).slice(0, MIN_HOLES - 1)]]);
  assert.deepEqual(roundRecap({ round: few, ...w1, goal: goalOf('90') }), { enough: false, n: MIN_HOLES - 1 });

  const solo = R('solo', '2026-10-05');
  const w2 = world([[solo, nine('solo', () => ({}))]]);
  const r = roundRecap({ round: solo, ...w2, goal: goalOf('90') });
  assert.equal(r.hasBase, false);
  assert.equal(r.avgOver, null);
  assert.equal(r.best, null);
  assert.equal(r.worst, null, 'พาร์ทุกหลุม');
  assert.equal(r.practice, null);
  assert.equal(r.tee.planned, 0, 'ไม่มีแผน');
});
