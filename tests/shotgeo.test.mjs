// ทดสอบตำแหน่งช็อต: จุดตี จุดที่ลูกไปจบ (GPS / หมุดที่ปัก) ระยะออกซ้ายขวา และการใช้ในโค้ชทีออฟ
import test from 'node:test';
import assert from 'node:assert/strict';
import { shotPath, shotDistances, offLine, sideOf, cleanLand, landOf, landInfo, landText } from '../js/shotgeo.js';
import { destination, YD } from '../js/holemap.js';
import { holeFacts, teeAnalysis, goalOf } from '../js/coach.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} ±${tol}`);
const tee = { lat: 14.5, lon: 101.4 };
const green = destination(tee, 0, 400 * YD);            // หลุมตรงขึ้นเหนือ 400 หลา
const at = (yd, rightYd = 0) => destination(destination(tee, 0, yd * YD), 90, rightYd * YD);

test('จุดที่ลูกไปจบ: หมุดที่ปักมาก่อน GPS ช็อตถัดไป · ช็อตที่โดนลูกโทษรู้จุดจบจากหมุดเท่านั้น', () => {
  const drop = at(190, 10);
  const shots = [
    { id: 'a', sequence: 1, land: { ...at(185, 25), via: 'map' } },   // ทีออฟลงน้ำ ปักจุดไว้
    { id: 'b', sequence: 2, gps: { ...drop, acc: 5 } },                // ตีจากจุดดรอป
    { id: 'c', sequence: 3, land: { ...at(330), via: 'map' } },        // ไม่มี GPS แต่ปักจุด
    { id: 'd', sequence: 4 },                                          // ไม่มี GPS → เริ่มจากจุดที่ช็อต 3 ไปจบ
  ];
  const pens = [{ related_shot_id_optional: 'a', strokes: 1 }];
  const p = shotPath(shots, tee, pens);
  near(p[0].dist / YD, Math.hypot(185, 25), 1);
  assert.equal(p[0].penalized, true);
  assert.equal(p[1].dist, null, 'ช็อต 3 ไม่มี GPS จึงไม่รู้ว่าช็อต 2 ไปจบตรงไหน');
  assert.equal(p[2].start, null);
  assert.deepEqual(p[2].end, landOf(shots[2]));
  assert.deepEqual(p[3].start, landOf(shots[2]), 'ช็อตถัดไปเริ่มจากจุดที่ปักไว้');
  // ช็อต 3 มี GPS → ช็อต 2 ได้ระยะ
  const withGps = shotPath([shots[0], shots[1], { ...shots[2], gps: { ...at(320, 12), acc: 4 } }], tee, pens);
  near(withGps[1].dist / YD, Math.hypot(320 - 190, 2), 1);
  assert.equal(p[3].end, null);
  // ไม่ปักจุดช็อตที่ลงน้ำ → ไม่รู้ระยะ (เดิมจะได้ระยะถึงจุดดรอปซึ่งผิด)
  const noLand = shotDistances([{ ...shots[0], land: null }, shots[1]], tee, pens);
  assert.equal(noLand.has('a'), false);
  // ไม่มีลูกโทษ → จุดจบคือจุดตีช็อตถัดไป
  near(shotDistances([{ id: 'x', sequence: 1 }, shots[1]], tee).get('x') / YD, Math.hypot(190, 10), 1);
  // หมุดเสียไม่นำมาใช้
  assert.equal(landOf({ land: { lat: 'x', lon: 1 } }), null);
  assert.equal(cleanLand({ lat: 200, lon: 1 }), null);
  assert.deepEqual(cleanLand({ lat: 14, lon: 101, extra: 1 }), { lat: 14, lon: 101, via: 'map' });
});

test('ระยะออกจากแนว: ขวาเป็นบวก ซ้ายเป็นลบ · ทิศที่แนะนำใช้เกณฑ์ตามประเภทช็อต', () => {
  near(offLine(tee, green, at(200, 20)).off / YD, 20, 0.5);
  near(offLine(tee, green, at(200, -30)).off / YD, -30, 0.5);
  near(offLine(tee, green, at(200, 20)).along / YD, 200, 1);
  assert.equal(offLine(tee, green, null), null);
  assert.equal(sideOf(20, true), 'right');
  assert.equal(sideOf(-16, true), 'left');
  assert.equal(sideOf(10, true), null, 'ทีออฟเบี่ยง 10 ม. ยังไม่ชัด');
  assert.equal(sideOf(5, true), 'on_line');
  assert.equal(sideOf(9, false), 'right', 'ช็อตเข้ากรีนเกณฑ์แคบกว่า');
  const info = landInfo(tee, at(185, 25), green, true);
  near(info.dist / YD, Math.hypot(185, 25), 1);
  assert.equal(info.side, 'right');
  assert.equal(landText(info, 'yd'), `${Math.round(Math.hypot(185, 25))} หลา · ออกขวา 25 · เหลือถึงกรีน ${Math.round(Math.hypot(215, 25))}`);
  assert.match(landText(landInfo(null, at(100), green), 'm'), /^เหลือถึงกรีน/, 'ไม่รู้จุดตี ไม่แสดงระยะช็อต');
});

// หลุมพาร์ 4 ที่ทีออฟลงน้ำ: ปักจุดแล้วแยกได้ว่าลูกตรงแต่ไม่ข้าม หรือลูกเลี้ยว
function waterHole(landYd, rightYd, { pen = true, direction = null } = {}) {
  const hole = { id: `h${landYd}${rightYd}${pen}`, par: 4, status: 'done', finish: 'holed' };
  const spec = pen
    ? [['tee', 'other', { club_id: 'D', land: at(landYd, rightYd), direction }], ['approach', 'green', { gps: { ...at(205), acc: 5 } }], ['putt', 'green'], ['putt', 'holed']]
    : [['tee', 'rough', { club_id: 'D', direction }], ['approach', 'green', { gps: { ...at(landYd, rightYd), acc: 5 } }], ['putt', 'green'], ['putt', 'holed']];
  const shots = spec.map(([type, end, extra], i) => ({ id: `${hole.id}-${i}`, sequence: i + 1, shot_type: type, end_lie: end, start_lie: i ? spec[i - 1][1] : 'tee', holed: end === 'holed', counted: true, ...extra }));
  const pens = pen ? [{ related_shot_id_optional: shots[0].id, strokes: 1, reason: 'penalty_area' }] : [];
  return Object.assign(holeFacts(hole, shots, pens), { pins: { tee, green } });
}

test('โค้ชทีออฟ: ลูกโทษเพราะระยะไม่พอข้าม vs ลูกเลี้ยว และทิศจากจุดที่ลูกไปจบ', () => {
  const clubOf = (id) => (id === 'D' ? { id: 'D', label: 'Driver', category: 'driver' } : null);
  const facts = [
    waterHole(185, 3), waterHole(190, -5), waterHole(188, 0),   // ตรงแต่ไม่ข้ามน้ำ
    waterHole(230, 45),                                          // เลี้ยวขวาลงน้ำ
    waterHole(240, 30, { pen: false }), waterHole(235, 28, { pen: false }), waterHole(245, 5, { pen: false }),
  ];
  const t = teeAnalysis(facts, { clubOf, goal: goalOf('90'), fmt: (m) => `${Math.round(m / YD)} หลา` });
  assert.equal(t.penStraight, 3);
  assert.equal(t.penCurved, 1);
  assert.equal(t.placed, 7);
  assert.match(t.cue.text, /ระยะที่ต้องข้าม/, 'ลูกตรงแต่ลงน้ำบ่อย → วางแผนระยะข้ามอุปสรรค');
  assert.ok(t.drills.includes('tee-club-test'));
  assert.ok(t.find.some((x) => x.includes('ลูกตรงแต่ลงอุปสรรค') && x.includes('3') && x.includes('ลูกเลี้ยวออกทิศ 1')));
  assert.ok(t.find.some((x) => /เบี่ยงจากแนวไปกรีนเฉลี่ย \d+ หลา/.test(x)));
  // ทิศที่ผู้ใช้เลือกเองมาก่อนทิศจากแผนที่
  const tagged = teeAnalysis([waterHole(240, 30, { pen: false, direction: 'left' })], { clubOf });
  assert.equal(tagged.spread.left, 1);
  assert.equal(tagged.spread.right, 0);
  // ไม่มีหมุดหลุม → ไม่คำนวณจากตำแหน่ง
  const noPins = teeAnalysis(facts.map((f) => ({ ...f, pins: null })), { clubOf });
  assert.equal(noPins.placed, 0);
  assert.equal(noPins.penStraight + noPins.penCurved, 0);
  assert.ok(noPins.hints.some((x) => x.includes('ปักจุดที่ลูกไป')));
});
