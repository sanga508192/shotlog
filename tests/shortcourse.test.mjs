// ทดสอบสนามเล็ก (เช่น 8 หรือ 9 หลุม): จำนวนหลุมของสนาม เล่นวน 2 รอบ แบ่งครึ่งรอบ และการนับในส่วนวิเคราะห์
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../js/state.js';
import { courseHoleNo, loopHoleNo } from '../js/holemap.js';
import { scoreGrid, halfOf, halfLabels } from '../js/group.js';
import { scoredEnough } from '../js/coach.js';
import { courseSize, setCourseSize, extendInfo, extendRound } from '../js/views/group.js';
import { newRoundView } from '../js/views/main.js';

test('หลุมจริงของสนาม: รอบที่สองของสนาม 8 หลุม หลุม 9 = หลุม 1', () => {
  assert.equal(loopHoleNo(9, 8), 1);
  assert.equal(loopHoleNo(16, 8), 8);
  assert.equal(loopHoleNo(8, 8), 8);
  assert.equal(loopHoleNo(12, 18), 12);
  assert.equal(courseHoleNo({ number: 10, course_hole: 1 }), 1);
  assert.equal(courseHoleNo({ number: 10 }), 10);
  assert.equal(courseHoleNo({ number: 3, course_hole: 'x' }), 3);
});

test('แบ่งครึ่งรอบ: ปกติที่หลุม 9 · สนาม 8 หลุมเล่นวน แบ่งที่หลุม 8', () => {
  assert.equal(halfOf({}, 18), 9);
  assert.equal(halfOf({ course_size: 8 }, 16), 8);
  assert.equal(halfOf({ course_size: 8 }, 8), 9, 'เล่นรอบเดียว ไม่ต้องแบ่ง');
  assert.deepEqual(halfLabels(8), ['รอบแรก', 'รอบหลัง']);
  const round = { id: 'r', course_size: 8, shot_logging: false, players: [{ id: 'me', name: 'ฉัน' }] };
  const holes = Array.from({ length: 16 }, (_, i) => ({ id: `h${i + 1}`, number: i + 1, par: 4, status: 'done', group_scores: { me: i < 8 ? 4 : 5 } }));
  const g = scoreGrid(round, holes, () => [], () => [], 'ฉัน');
  assert.equal(g.half, 8);
  assert.deepEqual([g.front.byPlayer.me.strokes, g.back.byPlayer.me.strokes, g.total.byPlayer.me.strokes], [32, 40, 72]);
});

test('ส่วนวิเคราะห์นับรอบสั้นที่เล่นครบ (8 หลุม) แต่ไม่นับรอบที่เล่นไม่ครบ', () => {
  assert.equal(scoredEnough(8, 8), true);
  assert.equal(scoredEnough(8, 18), false);
  assert.equal(scoredEnough(9, 18), true);
  assert.equal(scoredEnough(5, 5), false, 'สั้นเกินไป');
});

test('สนาม 8 หลุม: ตั้งจำนวนหลุม · เริ่มรอบ 16 หลุมเล่นวน ใช้พาร์/HC ของหลุมจริง', async () => {
  await st.load();
  assert.equal(courseSize('kirimaya'), 18);
  await st.put('userCourses', {
    id: 'u8', display_name_th: 'สนามแปดหลุม', province: 'ขอนแก่น', origin: 'user', created_at: st.nowIso(),
    scorecard: { par: [4, 3, 5, 4, 4, 3, 4, 5], hc: [3, 7, 1, 5, 2, 8, 4, 6], tees: [{ id: 't1', name: 'ขาว', yards: [350, 150, 480, 360, 340, 140, 330, 500] }], unit: 'yd', sources: [], checked_at: '2026-10-06' },
  });
  assert.equal(courseSize('u8'), 8, 'ดูจากสกอร์การ์ดที่สั้นกว่า 18');
  assert.equal(await setCourseSize('u8', 99), false);
  assert.equal(await setCourseSize('kirimaya', 9), true);
  assert.equal(courseSize('kirimaya'), 9, 'สนามในรายชื่อเก็บในค่าตั้ง');
  await setCourseSize('kirimaya', 18);

  let went = null;
  const ctx = { rerender() {}, go(h) { went = h; } };
  let v = newRoundView(['u8'], ctx);
  assert.match(v.html, /สนามนี้มี <b>8 หลุม<\/b>/);
  assert.match(v.html, /8 หลุม \(1 รอบสนาม\)/);
  assert.match(v.html, /16 หลุม \(เล่น 2 รอบ\)/);
  v.actions.holes({ dataset: { v: '16' } });
  v = newRoundView(['u8'], ctx);
  assert.match(v.html, /หลุม 9–16 คือหลุม 1–8 ของสนามวนอีกรอบ/);
  await v.actions.start({ disabled: false });
  const rid = went.match(/round\/([^/]+)\/hole/)[1];
  const round = st.S.rounds.get(rid);
  assert.equal(round.hole_count, 16);
  assert.equal(round.course_size, 8);
  const holes = st.holesOf(rid);
  assert.equal(holes.length, 16);
  const h9 = holes.find((h) => h.number === 9), h16 = holes.find((h) => h.number === 16);
  assert.deepEqual([h9.course_hole, h9.par, h9.hc_index], [1, 4, 3]);
  assert.deepEqual([h16.course_hole, h16.par], [8, 5]);
  assert.equal(holes.find((h) => h.number === 3).course_hole, 3, 'รอบแรกเลขตรงกับหลุมจริง');
});

test('เล่นต่ออีกรอบสนาม: 8 → 16 หลุม ใช้พาร์/HC ของหลุมจริง และเลิกทำได้ · รอบ 9 หลุมของสนาม 18 หลุม → เพิ่ม 9 หลุมหลัง', async () => {
  let went = null;
  const ctx = { rerender() {}, go(h) { went = h; } };
  let v = newRoundView(['u8'], ctx);
  v.actions.holes({ dataset: { v: '8' } });
  v = newRoundView(['u8'], ctx);
  await v.actions.start({ disabled: false });
  const rid = went.match(/round\/([^/]+)\/hole/)[1];
  const info = extendInfo(st.S.rounds.get(rid));
  assert.equal(info.th, 'เล่นต่ออีกรอบสนาม (+8 หลุม)');
  // หลุม 3 ของรอบแรกแก้พาร์เป็น 4 ระหว่างเล่น → รอบที่สองใช้ค่าที่แก้
  const h3 = st.holesOf(rid).find((h) => h.number === 3);
  await st.patch('holes', h3.id, { par: 4 });
  const r = await extendRound(rid);
  assert.equal(r.first, 9);
  const round = st.S.rounds.get(rid);
  assert.deepEqual([round.hole_count, round.course_size, round.status], [16, 8, 'playing']);
  const holes = st.holesOf(rid);
  assert.equal(holes.length, 16);
  const h11 = holes.find((h) => h.number === 11);
  assert.deepEqual([h11.course_hole, h11.par, h11.hc_index], [3, 4, 1]);
  assert.equal(holes.find((h) => h.number === 2).course_hole, 2, 'หลุมรอบแรกบอกหลุมจริงด้วย');
  assert.equal(extendInfo(round).th, 'เล่นต่ออีกรอบสนาม (+8 หลุม)', 'เล่นต่อรอบที่ 3 ได้');
  await r.undo();
  assert.equal(st.holesOf(rid).length, 8);
  assert.equal(st.S.rounds.get(rid).hole_count, 8);

  // สนาม 18 หลุม เล่น 9 หลุม
  await st.put('userCourses', {
    id: 'u18', display_name_th: 'สนามสิบแปด', province: 'ขอนแก่น', origin: 'user', created_at: st.nowIso(),
    scorecard: { par: [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4, 3, 5, 4, 4], hc: Array.from({ length: 18 }, (_, i) => i + 1), tees: [], unit: 'yd', sources: [], checked_at: '2026-10-06' },
  });
  v = newRoundView(['u18'], ctx);
  v.actions.holes({ dataset: { v: '9' } });
  v = newRoundView(['u18'], ctx);
  await v.actions.start({ disabled: false });
  const rid9 = went.match(/round\/([^/]+)\/hole/)[1];
  assert.equal(extendInfo(st.S.rounds.get(rid9)).th, 'เล่นต่อ 9 หลุมหลัง (+9 หลุม)');
  await extendRound(rid9);
  const back = st.holesOf(rid9);
  assert.equal(back.length, 18);
  const h11b = back.find((h) => h.number === 11);
  assert.deepEqual([h11b.par, h11b.hc_index, h11b.course_hole], [5, 11, undefined]);
  assert.equal(st.S.rounds.get(rid9).course_size, undefined);
  assert.equal(extendInfo(st.S.rounds.get(rid9)), null, 'ครบ 18 หลุมแล้ว');
});
