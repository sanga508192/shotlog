// ทดสอบหลุมที่จดไว้แต่ลืมกดจบ: จบให้อัตโนมัติเมื่อเริ่มหลุมถัดไป · ยอดครึ่งรอบมี * · เตือนก่อนแชร์และปุ่มจบหลุม
// (กรณีจริง 23 ต.ค. 2569: บ.บิว หลุม 2 และ 15 ค้าง ยอดรวมในรูปเป็น 83* แทน 92)
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../js/state.js';
import { holesToAutoFinish } from '../js/logic.js';
import { groupTableHtml, gridOf, openList, finishHoles } from '../js/views/group.js';

const H = (number, status = 'done', shots = true) => ({ number, status, shots });
const has = (h) => h.shots;
const nums = (list) => list.map((h) => h.number);

test('เริ่มหลุมใหม่: จบทุกหลุมก่อนหน้าที่จดไว้แต่ยังไม่จบ ไม่ใช่แค่หลุมล่าสุด', () => {
  const holes = [H(1), H(2, 'playing'), H(3), H(4, 'playing'), H(5, 'playing', false), H(6, 'playing', false)];
  assert.deepEqual(nums(holesToAutoFinish(holes, 6, 4, has)), [2, 4], 'หลุมที่ยังไม่มีช็อตไม่แตะ');
  assert.deepEqual(nums(holesToAutoFinish(holes, 5, 4, has)), [2, 4]);
});

test('เริ่มกลางสนาม (หลุม 10): เล่นหลุม 18 แล้ววนมาหลุม 1 → จบหลุม 18 · จดย้อนหลังหลุมที่ข้ามไม่จบหลุมที่กำลังเล่น', () => {
  const back9 = Array.from({ length: 18 }, (_, i) => H(i + 1, i + 1 === 18 ? 'playing' : i + 1 >= 10 ? 'done' : 'playing', i + 1 >= 10));
  assert.deepEqual(nums(holesToAutoFinish(back9, 1, 18, has)), [18]);
  // กำลังเล่นหลุม 7 (ยังไม่จบ) แล้วย้อนไปจดหลุม 5 ที่ลืมจด → หลุม 7 ยังเล่นต่อได้
  const mid = [H(4), H(5, 'playing', false), H(6), H(7, 'playing'), H(8, 'playing', false)];
  assert.deepEqual(nums(holesToAutoFinish(mid, 5, 7, has)), []);
});

async function seed() {
  await st.load();
  const rid = 'r-pend';
  const ops = [{ store: 'rounds', put: { id: rid, played_at: '2026-10-23', course_name_snapshot: 'เสือปาร์ค', status: 'complete', hole_count: 18, current_hole: 18, shot_logging: true,
    players: [{ id: 'me', name: 'บ.บิว' }, { id: 'p1', name: 'พี่รัน' }] } }];
  const pars = [5, 4, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 3, 4, 5, 4, 4];
  const mine = [8, 5, 6, 4, 5, 4, 5, 5, 4, 7, 5, 5, 5, 4, 4, 6, 6, 4];
  pars.forEach((par, i) => {
    const n = i + 1, hid = `${rid}-h${n}`, pend = n === 2 || n === 15;
    ops.push({ store: 'holes', put: { id: hid, round_id: rid, number: n, par, status: pend ? 'playing' : 'done', finish: pend ? null : 'holed', group_scores: { p1: par + 1 } } });
    for (let k = 1; k <= mine[i]; k++) ops.push({ store: 'shots', put: { id: `${hid}-${k}`, round_id: rid, hole_id: hid, sequence: k, counted: true } });
  });
  await st.commit(ops);
  return rid;
}

test('ยอด OUT/IN ที่ไม่ครบมี * · เตือนหลุมค้าง · จบหลุมด้วยสกอร์ที่จดไว้แล้วได้ 92', async () => {
  const rid = await seed();
  let round = st.S.rounds.get(rid);
  let grid = gridOf(round);
  assert.deepEqual([grid.front.byPlayer.me.strokes, grid.back.byPlayer.me.strokes, grid.total.byPlayer.me.strokes], [41, 42, 83]);
  const html = groupTableHtml(round, grid);
  assert.ok(html.includes('41<sup>*</sup>') && html.includes('42<sup>*</sup>') && html.includes('83<sup>*</sup>'), 'OUT/IN/รวม ที่ไม่ครบมี *');
  assert.ok(!html.includes('45<sup>*</sup>'), 'พี่รันครบทุกหลุม ไม่มี *');

  const open = openList(round, grid);
  assert.deepEqual(open.map((x) => [x.p.id, x.pending.map((h) => [h.n, h.strokes])]), [['me', [[2, 5], [15, 4]]]]);

  assert.equal(await finishHoles(rid, [2, 15]), 2);
  round = st.S.rounds.get(rid);
  grid = gridOf(round);
  assert.equal(grid.total.byPlayer.me.strokes, 92);
  assert.deepEqual(openList(round, grid), []);
  assert.ok(!groupTableHtml(round, grid).includes('<sup>*</sup>'));
});
