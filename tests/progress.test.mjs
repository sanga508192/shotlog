// ทดสอบหน้าพัฒนาการ (สกอร์รายรอบ รายเดือน แต้มต่อ) และ "มีอะไรใหม่"
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRounds, rollingAvg, inRange, monthly, handicapSeries, change } from '../js/progress.js';
import { NEWS, LATEST, newer, unseen } from '../js/whatsnew.js';
import { APP_VERSION } from '../js/constants.js';

// รอบจดเร็ว: สกอร์ต่อหลุมจาก group_scores ของเรา
function quickRound(id, date, strokes, extra = {}) {
  const holes = strokes.map((s, i) => ({ id: `${id}-h${i + 1}`, round_id: id, number: i + 1, par: 4, hc_index: i + 1, status: 'done', group_scores: { me: s } }));
  return { r: { id, played_at: date, status: 'complete', shot_logging: false, course_name_snapshot: 'สนาม', ...extra }, holes };
}
function world(list) {
  const holes = new Map(list.map((x) => [x.r.id, x.holes]));
  return { rounds: list.map((x) => x.r), holesOf: (id) => holes.get(id) ?? [], shotsOf: () => [], penaltiesOf: () => [] };
}

test('สกอร์รายรอบ: เทียบ 18 หลุม เรียงเก่า→ใหม่ · ไม่นับรอบที่กำลังเล่นหรือน้อยกว่า 9 หลุม', () => {
  const w = world([
    quickRound('b', '2026-09-20', Array(18).fill(5)),
    quickRound('a', '2026-08-01', Array(9).fill(6)),
    quickRound('p', '2026-10-01', Array(18).fill(4), { status: 'playing' }),
    quickRound('s', '2026-10-02', Array(8).fill(4)),
  ]);
  const rs = scoreRounds(w);
  assert.deepEqual(rs.map((r) => [r.id, r.n, r.score18]), [['a', 9, 108], ['b', 18, 90]]);
});

test('ค่าเฉลี่ยเคลื่อนที่ ช่วงเวลา และการเปลี่ยนแปลง', () => {
  assert.deepEqual(rollingAvg([90, 92, 94, 96], 2), [90, 91, 93, 95]);
  const list = [{ date: '2025-09-01' }, { date: '2026-06-10' }, { date: '2026-09-30' }];
  assert.equal(inRange(list, '3m', '2026-10-05').length, 1);
  assert.equal(inRange(list, '12m', '2026-10-05').length, 2);
  assert.equal(inRange(list, 'all', '2026-10-05').length, 3);
  assert.equal(change([100, 98, 96, 94, 92, 90]), -6);
  assert.equal(change([100, 98]), null);
});

test('รายเดือน: ใหม่สุดก่อน · สถิติต่อ 18 หลุมเมื่อมีหลุมจดรายช็อตพอ', () => {
  const f = (putts, pen, gir, fir) => ({ putts, gir, fir, leak: { pen } });
  const m = monthly([
    { date: '2026-09-02', score18: 96, facts: [] },
    { date: '2026-09-20', score18: 90, facts: Array.from({ length: 18 }, (_, i) => f(2, i < 2 ? 1 : 0, i < 6, i % 2 === 0)) },
    { date: '2026-10-01', score18: 88, facts: Array.from({ length: 4 }, () => f(2, 0, true, true)) },
  ]);
  assert.deepEqual(m.map((x) => [x.month, x.rounds, x.avg, x.best]), [['2026-10', 1, 88, 88], ['2026-09', 2, 93, 90]]);
  assert.equal(m[0].putts, null, 'น้อยกว่า 9 หลุม ยังไม่สรุป');
  assert.deepEqual([m[1].putts, m[1].pen, m[1].gir, m[1].fir], [36, 2, 6, 50]);
});

test('แต้มต่อหลังแต่ละรอบ: เริ่มมีค่าเมื่อครบ 3 รอบที่มี Course Rating/Slope', () => {
  const hr = (date, s, courseId = 'c') => ({ courseId, teeId: null, date, holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, hc: i + 1, strokes: s })) });
  const rating = { cr: 72, slope: 113 };
  const series = handicapSeries([hr('2026-08-01', 5), hr('2026-08-10', 5, 'none'), hr('2026-08-20', 5), hr('2026-09-01', 5)], (c) => (c === 'none' ? null : rating));
  // สกอร์ 90 · CR 72 Slope 113 → differential 18 · 3 รอบ: ดีสุด 1 ค่า −2 = 16
  assert.deepEqual(series, [{ date: '2026-09-01', index: 16, diff: 18 }]);
});

test('มีอะไรใหม่: รุ่นล่าสุดตรงกับรุ่นแอป · เทียบรุ่น · รุ่นที่ยังไม่เห็น', () => {
  assert.equal(LATEST, APP_VERSION, 'อัปเดตรุ่นแอปแล้วต้องเพิ่มรายการใน js/whatsnew.js');
  assert.ok(NEWS.every((n, i) => i === 0 || newer(NEWS[i - 1].v, n.v)), 'เรียงใหม่สุดก่อน');
  assert.equal(newer('0.10.0', '0.9.9'), true);
  assert.equal(newer('0.28.0', '0.28.0'), false);
  assert.equal(newer('0.28.0', null), true);
  assert.deepEqual(unseen('0.27.0').map((n) => n.v), NEWS.filter((n) => newer(n.v, '0.27.0')).map((n) => n.v));
  assert.deepEqual(unseen(LATEST), []);
});
