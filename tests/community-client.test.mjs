// ทดสอบฝั่งแอป: ลำดับความเชื่อถือของหมุด (ของเรา > ผู้เล่นคนอื่น > ประมาณ) หมุดที่จะแชร์ และข้อมูลสกอร์บอร์ดสด
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../js/state.js';
import { courseHoles, setHolePoint, crowdOf, isEstimated } from '../js/holemap.js';
import { myPins, shareable, cachedPins } from '../js/community.js';
import { boardData, newToken, liveUrl } from '../js/views/live.js';
import { ME } from '../js/group.js';

const setCrowd = (course, rows) => st.commit([{ store: 'meta', put: { key: `cpins:${course}`, value: { at: Date.now(), rows } } }], { raw: true });

test('หมุดจากผู้เล่นคนอื่น: แทนหมุดประมาณเมื่อเชื่อถือได้ และหมุดของเราชนะเสมอ', async () => {
  await st.load();
  const est = courseHoles('kirimaya')[1];
  assert.ok(isEstimated(est));
  // คนเดียวแตะบนแผนที่ → ยังใช้หมุดประมาณของแอป
  await setCrowd('kirimaya', [{ hole: 1, kind: 'tee', lat: 14.5, lon: 101.4, n: 1, gps: 0 }]);
  assert.deepEqual(courseHoles('kirimaya')[1].tee, est.tee);
  // 2 คน → ใช้ค่ากลาง
  await setCrowd('kirimaya', [
    { hole: 1, kind: 'tee', lat: 14.5, lon: 101.4, n: 2, gps: 0 },
    { hole: 1, kind: 'green', lat: 14.51, lon: 101.41, n: 1, gps: 1 },
    { hole: 1, kind: 'front', lat: 14.509, lon: 101.409, n: 1, gps: 0 },
  ]);
  let h = courseHoles('kirimaya')[1];
  assert.deepEqual([h.tee, h.green, h.front], [{ lat: 14.5, lon: 101.4 }, { lat: 14.51, lon: 101.41 }, { lat: 14.509, lon: 101.409 }]);
  assert.equal(isEstimated(h), false);
  assert.deepEqual(h.src, { tee: 'crowd', green: 'crowd' });
  assert.deepEqual(crowdOf(h), { n: 2, gps: 0 });
  assert.ok(isEstimated(courseHoles('kirimaya')[2]), 'หลุมอื่นยังเป็นค่าประมาณ');
  // สนามที่ไม่มีหมุดประมาณ: คนเดียวก็ใช้ได้
  await setCrowd('dancoon', [{ hole: 3, kind: 'green', lat: 16.48, lon: 102.72, n: 1, gps: 0 }]);
  assert.deepEqual(courseHoles('dancoon')[3].green, { lat: 16.48, lon: 102.72 });
  // หมุดของเราชนะ
  await setHolePoint('kirimaya', 1, 'tee', { lat: 14.6, lon: 101.5, via: 'gps', accuracy: 5 });
  h = courseHoles('kirimaya')[1];
  assert.deepEqual([h.tee, h.src.tee, h.src.green], [{ lat: 14.6, lon: 101.5 }, 'mine', 'crowd']);
  // ข้อมูลแคชเสีย → ไม่พัง
  await st.commit([{ store: 'meta', put: { key: 'cpins:kirimaya', value: 'garbage' } }], { raw: true });
  assert.deepEqual(cachedPins('kirimaya'), []);
  assert.ok(courseHoles('kirimaya')[1].tee);
});

test('หมุดที่จะแชร์: เฉพาะที่วางเอง จำว่าวางด้วย GPS หรือแผนที่ และเฉพาะสนามในรายชื่อ', async () => {
  await st.setSetting('course_holes:kirimaya', null);
  await setHolePoint('kirimaya', 2, 'green', { lat: 14.51, lon: 101.42 });
  await setHolePoint('kirimaya', 2, 'tee', { lat: 14.5, lon: 101.41, via: 'gps' });
  assert.deepEqual(myPins('kirimaya'), [
    { hole: 2, kind: 'tee', lat: 14.5, lon: 101.41, via: 'gps' },
    { hole: 2, kind: 'green', lat: 14.51, lon: 101.42, via: 'map' },
  ]);
  assert.equal(myPins('nope').length, 0);
  assert.equal(shareable('kirimaya'), true);
  assert.equal(shareable('uc123'), false);
});

test('สกอร์บอร์ดสด: สรุปสกอร์รายหลุมของทุกคน ไม่มีข้อมูลรายช็อต และรหัสลิงก์สุ่มยาวพอ', async () => {
  const round = {
    id: 'LR', course_name_snapshot: 'คีรีมายา', played_at: '2026-09-28', tee_name: 'ขาว', status: 'playing',
    players: [{ id: ME, name: 'ฉัน' }, { id: 'p2', name: 'ต้น' }],
  };
  await st.put('rounds', round);
  await st.put('holes', { id: 'LR1', round_id: 'LR', number: 1, par: 4, status: 'done', group_scores: { [ME]: 4, p2: 6 } });
  await st.put('holes', { id: 'LR2', round_id: 'LR', number: 2, par: 3, status: 'playing', group_scores: { [ME]: 2 } });
  const b = boardData(st.S.rounds.get('LR'));
  assert.equal(b.course, 'คีรีมายา');
  assert.deepEqual(b.holes, [{ n: 1, par: 4 }, { n: 2, par: 3 }]);
  assert.deepEqual(b.players.map((p) => [p.name, p.scores, p.total, p.thru, p.over]), [['ฉัน', [4, 2], 6, 2, -1], ['ต้น', [6, null], 6, 1, 2]]);
  assert.ok(!JSON.stringify(b).includes('gps'), 'ไม่มีตำแหน่ง');
  const t = newToken();
  assert.match(t, /^[A-Za-z0-9_-]{24}$/);
  assert.notEqual(t, newToken());
  assert.ok(liveUrl(t).endsWith(`live.html#${t}`));
});
