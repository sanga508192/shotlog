// ทดสอบ Strokes Gained: ค่าคาดหมาย ผลรวมต่อหลุม ลูกโทษ ข้อมูลไม่ครบ และค่าต่อ 18 หลุม
import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedStrokes, holeSG, analyzeSG, SG_SHARE } from '../js/sg.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const shot = (seq, o) => ({ id: `s${seq}`, sequence: seq, distance_unit: 'm', ...o });
const hole = (o = {}) => ({ id: 'h1', number: 1, par: 4, status: 'done', distance: 400, distance_unit: 'yd', ...o });

test('ค่าคาดหมาย: ไกลขึ้นยากขึ้น รัฟ/ทรายยากกว่าแฟร์เวย์ และบนกรีนใช้ฟุต', () => {
  near(expectedStrokes('tee', 400), 3.99);
  assert.ok(expectedStrokes('fairway', 150) < expectedStrokes('fairway', 200));
  assert.ok(expectedStrokes('rough', 150) > expectedStrokes('fairway', 150));
  near(expectedStrokes('green', 10 / 3), 1.61, 1e-9);   // 10 ฟุต
  assert.ok(expectedStrokes('green', 1) < 1.1);
  assert.equal(expectedStrokes('nowhere', 100), null);
  assert.equal(expectedStrokes('fairway', NaN), null);
  assert.ok(expectedStrokes('tee', 700) > expectedStrokes('tee', 650), 'เลยตารางต้องต่อเส้นขึ้นไป');
});

test('ผลรวม SG ทั้งหลุม = ค่าคาดหมายจากแท่นที − สโตรกที่ใช้', () => {
  const shots = [
    shot(1, { start_lie: 'tee', end_lie: 'fairway', shot_type: 'tee' }),        // ใช้ระยะหลุมจากสกอร์การ์ด
    shot(2, { start_lie: 'fairway', distance_before: 137, end_lie: 'green' }),  // เมตร
    shot(3, { start_lie: 'green', distance_before: 6, end_lie: 'green', shot_type: 'putt' }),
    shot(4, { distance_before: 0.5, shot_type: 'putt', holed: true, end_lie: 'holed' }),
  ];
  const r = holeSG(hole(), shots, []);
  assert.equal(r.complete, true);
  near(r.shots.reduce((a, x) => a + x.sg, 0), expectedStrokes('tee', 400) - 4, 1e-9);
  assert.deepEqual(r.shots.map((x) => x.cat), ['tee', 'approach', 'putt', 'putt']);
});

test('ลูกโทษหัก SG จากช็อตที่ทำให้เกิด · ลูกโทษที่ไม่ระบุช็อตทำให้หลุมไม่นับ', () => {
  const shots = [
    shot(1, { start_lie: 'tee', end_lie: 'other' }),
    shot(2, { start_lie: 'tee', distance_before: 366, end_lie: 'fairway' }),
    shot(3, { start_lie: 'fairway', distance_before: 100, end_lie: 'green' }),
    shot(4, { start_lie: 'green', distance_before: 1, holed: true }),
  ];
  const r = holeSG(hole(), shots, [{ strokes: 1, related_shot_id_optional: 's1' }]);
  near(r.shots[0].sg, expectedStrokes('tee', 400) - expectedStrokes('tee', 366 / 0.9144) - 2, 1e-9);
  assert.ok(r.shots[0].sg < -1.9);
  assert.equal(holeSG(hole(), shots, [{ strokes: 1 }]).complete, false);
});

test('ข้อมูลไม่ครบ: ไม่รู้ระยะพัตแรก → หลุมไม่ครบ · หลุมยังไม่จบ → null', () => {
  const shots = [
    shot(1, { start_lie: 'tee', end_lie: 'green', distance_before: 150 }),
    shot(2, { shot_type: 'putt', end_lie: 'green' }),
    shot(3, { shot_type: 'putt', distance_before: 1, holed: true }),
  ];
  const r = holeSG(hole({ par: 3 }), shots, []);
  assert.equal(r.complete, false);
  assert.equal(r.shots[0].cat, 'approach', 'ทีออฟพาร์ 3 นับเป็นช็อตเข้ากรีน');
  assert.equal(holeSG(hole({ status: 'playing' }), shots, []), null);
  // กิมมี่นับเป็นอีก 1 สโตรก
  const g = holeSG(hole({ par: 3, finish: 'picked_up' }), [shot(1, { start_lie: 'tee', distance_before: 150, end_lie: 'green' })], []);
  assert.equal(g.complete, true);
  near(g.shots[0].sg, expectedStrokes('tee', 150 / 0.9144) - 1 - 1, 1e-9);
});

test('analyzeSG: ค่าต่อ 18 หลุมจากหลุมที่ครบ และเป้าแบ่งตามสัดส่วน', () => {
  const holes = Array.from({ length: 9 }, (_, i) => hole({ id: `h${i}`, number: i + 1 }));
  const play = [
    shot(1, { start_lie: 'tee', end_lie: 'fairway' }),
    shot(2, { start_lie: 'fairway', distance_before: 137, end_lie: 'green' }),
    shot(3, { start_lie: 'green', distance_before: 6, end_lie: 'green' }),
    shot(4, { start_lie: 'green', distance_before: 1, end_lie: 'green' }),
    shot(5, { start_lie: 'green', distance_before: 0.3, holed: true }),
  ];
  const r = analyzeSG({
    rounds: [{ id: 'r1', status: 'complete', played_at: '2026-09-01' }, { id: 'r2', status: 'playing' }],
    holesOf: (id) => (id === 'r1' ? holes : []),
    shotsOf: () => play,
    penaltiesOf: () => [],
  }, 89);
  assert.equal(r.holesComplete, 9);
  near(r.total, (expectedStrokes('tee', 400) - 5) * 18, 1e-9);
  const putt = r.cats.find((c) => c.k === 'putt');
  near(putt.target, -17 * SG_SHARE.putt, 1e-9);
  assert.ok(putt.yours < 0, '3-พัตทุกหลุมต้องติดลบ');
  near(Object.values(SG_SHARE).reduce((a, b) => a + b, 0), 1, 1e-9);
  assert.equal(r.worst.length, 5);
});
