// ทดสอบแฮนดิแคปโดยประมาณ (สูตร WHS) อุปสรรค/ขอบกรีนบนแผนที่ และไม้แนะนำ
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { indexFrom, differential, estimateHandicap, strokesReceived, validRating } from '../js/handicap.js';
import { courseHoles, setHolePoint, addHazard, setHazard, MAX_HAZARDS } from '../js/holemap.js';
import { suggestClub } from '../js/coach.js';
import * as st from '../js/state.js';

const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];   // พาร์ 72
const card = (strokes) => PARS.map((par, i) => ({ par, hc: i + 1, strokes: strokes(par, i) }));

test('differential: สูตร WHS และจำกัดสกอร์หลุมที่พัง', () => {
  // เล่นโบกี้ทุกหลุม = 90 · CR 72 Slope 113 → 18.0
  assert.equal(differential(card((p) => p + 1), { cr: 72, slope: 113 }).diff, 18);
  // Slope 130 ทำให้ differential ต่ำลง
  assert.equal(differential(card((p) => p + 1), { cr: 72, slope: 130 }).diff, Math.round((113 / 130) * 18 * 10) / 10);
  // หลุมที่ได้ 12 ถูกจำกัดที่ พาร์ + 5 เมื่อยังไม่มีแต้มต่อ
  const blow = card((p, i) => (i === 0 ? 12 : p + 1));
  assert.equal(differential(blow, { cr: 72, slope: 113 }).ags, 90 - 5 + 9);
  // มีแต้มต่อ 18: net double bogey = พาร์ + 2 + 1
  assert.equal(differential(blow, { cr: 72, slope: 113 }, 18).ags, 90 - 5 + 7);
  assert.equal(differential(card((p) => p).slice(0, 9), { cr: 72, slope: 113 }), null, 'ต้องครบ 18 หลุม');
  assert.equal(differential(card((p) => p), { cr: 72, slope: 300 }), null, 'Slope ผิดช่วง');
});

test('ดัชนี: ใช้ค่าที่ดีที่สุดตามจำนวนรอบ ตัดทศนิยม 1 ตำแหน่ง', () => {
  assert.equal(indexFrom([20, 18]), null);
  assert.equal(indexFrom([20, 18, 25]), 16);                 // 3 รอบ: ต่ำสุด − 2
  assert.equal(indexFrom([20, 18, 25, 22, 19, 21]), 17.5);   // 6 รอบ: เฉลี่ย 2 ต่ำสุด − 1
  const twenty = Array.from({ length: 25 }, (_, i) => 10 + i);   // ใช้ 20 รอบล่าสุด (15..34) → 8 ต่ำสุด 15..22
  assert.equal(indexFrom(twenty), 18.5);
  assert.equal(indexFrom([80, 80, 80]), 54, 'สูงสุด 54');
  assert.equal(strokesReceived(20, 1), 2);
  assert.equal(strokesReceived(20, 3), 1);
  assert.equal(strokesReceived(20, null), 1);
  assert.deepEqual(validRating({ cr: '71.8', slope: '128' }), { cr: 71.8, slope: 128 });
});

test('estimateHandicap: รอบที่ไม่มี CR/Slope ถูกรวมเป็นรายการที่ต้องกรอก', () => {
  const rounds = [
    { courseId: 'a', teeId: 'white', name: 'A', holes: card((p) => p + 1) },
    { courseId: 'a', teeId: 'white', name: 'A', holes: card((p) => p + 2) },
    { courseId: 'b', teeId: null, name: 'B', holes: card((p) => p + 1) },
    { courseId: 'b', teeId: null, name: 'B', holes: card((p) => p + 1) },
    { courseId: 'a', teeId: 'white', name: 'A', holes: card((p) => p).slice(0, 9) },
  ];
  const ratings = { 'a|white': { cr: 72, slope: 113 } };
  const r = estimateHandicap(rounds, (c, t) => ratings[`${c}|${t}`] ?? null);
  assert.equal(r.used.length, 2);
  assert.equal(r.index, null);
  assert.deepEqual(r.missing.map((m) => [m.courseId, m.count]), [['b', 2]]);
  ratings['b|null'] = { cr: 70, slope: 120 };
  // 4 รอบ: differential 18.0, 36.0, 18.8, 18.8 → ต่ำสุด 18.0 − 1
  assert.equal(estimateHandicap(rounds, (c, t) => ratings[`${c}|${t}`] ?? null).index, 17);
});

test('ขอบกรีนและอุปสรรค: วาง ย้าย ลบ จำกัดจำนวน และข้อมูลเสียถูกข้าม', async () => {
  await st.load();
  const c = 'dancoon';
  await setHolePoint(c, 3, 'tee', { lat: 16.48, lon: 102.72 });
  await setHolePoint(c, 3, 'green', { lat: 16.483, lon: 102.721 });
  await setHolePoint(c, 3, 'front', { lat: 16.4829, lon: 102.7209 });
  await addHazard(c, 3, { lat: 16.481, lon: 102.7205 }, 'water');
  await addHazard(c, 3, { lat: 16.482, lon: 102.7207 }, 'bunker');
  let h = courseHoles(c)[3];
  assert.ok(h.front && !h.back);
  assert.deepEqual(h.hazards.map((z) => z.kind), ['water', 'bunker']);
  await setHazard(c, 3, 0, { lat: 16.4811, lon: 102.7206 });
  await setHazard(c, 3, 1, null);
  h = courseHoles(c)[3];
  assert.deepEqual(h.hazards.map((z) => [z.kind, z.lat]), [['water', 16.4811]]);
  await assert.rejects(() => addHazard(c, 3, { lat: 16.48, lon: 102.72 }, 'lava'));
  for (let i = 1; i < MAX_HAZARDS; i++) await addHazard(c, 3, { lat: 16.48, lon: 102.72 }, 'other');
  await assert.rejects(() => addHazard(c, 3, { lat: 16.48, lon: 102.72 }, 'other'));
  await st.setSetting('course_holes:dancoon', { holes: { 3: { tee: { lat: 16.48, lon: 102.72 }, hazards: [null, { lat: 'x' }, { lat: 16.48, lon: 102.72, kind: 'lava' }, { lat: 16.48, lon: 102.72, kind: 'water' }] } } });
  assert.deepEqual(courseHoles(c)[3].hazards.map((z) => z.kind), ['water']);
});

test('ไม้แนะนำ: เลือกไม้ที่ระยะกลางใกล้สุด และไม่เดาเมื่อห่างเกิน', () => {
  const rows = [
    { label: '7i', category: 'iron', median: 135, n: 5 },
    { label: '6i', category: 'iron', median: 145, n: 2 },
    { label: '8i', category: 'iron', median: 125, n: 4 },
    { label: 'D', category: 'driver', median: 210, n: 6 },
  ];
  assert.equal(suggestClub(131, rows).label, '7i');
  assert.equal(suggestClub(146, rows).label, '7i', 'ไม้ที่ข้อมูลไม่ถึง 3 ครั้งไม่นับ');
  assert.equal(suggestClub(175, rows), null);
  assert.equal(suggestClub(NaN, rows), null);
});
