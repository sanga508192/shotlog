// ทดสอบแผนทีออฟรายหลุม: เลือกไม้ จุดเล็ง และคำเตือนจากจุดอันตราย
import test from 'node:test';
import assert from 'node:assert/strict';
import { teePlan, hazardsAlong, hazardRisk } from '../js/strategy.js';
import { destination } from '../js/holemap.js';

const YD = 0.9144;
const row = (label, category, yd, spread = 12) => ({ club_id: label, label, category, median: yd * YD, p25: (yd - spread) * YD, p75: (yd + spread) * YD, n: 10 });
const BAG = [row('D', 'driver', 230), row('3W', 'wood', 205), row('5H', 'hybrid', 185), row('I7', 'iron', 150), row('PW', 'wedge', 110)];

test('ไดรเวอร์ไกลกว่าไม้ 3 นิดเดียว → ทีออฟด้วยไม้ 3 (กรณีของผู้ใช้: 192 กับ 189 หลา)', () => {
  const tp = teePlan({ par: 4, lengthM: 380 * YD, clubs: [row('D', 'driver', 192), row('3W', 'wood', 189), row('I7', 'iron', 140)] });
  assert.equal(tp.club.label, '3W');
  assert.match(tp.why, /แค่ 3 หลา/);
  assert.ok(Math.abs(tp.remain / YD - 191) < 1.5, 'เหลือถึงกรีน');
});

test('น้ำขวางในช่วงระยะไดรเวอร์ → วางลูกด้วยไม้ที่สั้นกว่า · น้ำไกลเกินถึงไม่ต้องเปลี่ยน', () => {
  const water = { kind: 'water', along: 225 * YD, off: 0 };
  const tp = teePlan({ par: 4, lengthM: 400 * YD, clubs: BAG, hazards: [water] });
  assert.equal(tp.club.label, '5H', 'ไม้ 3 ก็ถึงน้ำได้ (ปกติถึง 217 หลา) ไฮบริดวางลูกก่อน');
  assert.match(tp.why, /น้ำขวางที่ 225 หลา .* 5H วางลูกก่อนถึง/);
  const far = teePlan({ par: 4, lengthM: 400 * YD, clubs: BAG, hazards: [{ ...water, along: 300 * YD }] });
  assert.equal(far.club.label, 'D');
  assert.equal(hazardRisk({ kind: 'water', along: 100 * YD, off: 0 }, BAG[0]), null);
});

test('จุดเล็ง: เผื่อฝั่งที่พลาดบ่อย ยกเว้นอีกฝั่งมีอันตราย · น้ำฝั่งที่พลาดบ่อยถูกเตือน', () => {
  const plain = teePlan({ par: 4, lengthM: 400 * YD, clubs: BAG, missSide: 'right' });
  assert.match(plain.aim, /ตั้งทีฝั่งขวาของแท่น เล็งขอบซ้าย/);
  const leftWater = teePlan({ par: 4, lengthM: 400 * YD, clubs: BAG, missSide: 'right', hazards: [{ kind: 'water', along: 225 * YD, off: -30 * YD }] });
  assert.match(leftWater.aim, /กลางแฟร์เวย์ \(ฝั่งซ้ายมีอันตราย/);
  const rightWater = teePlan({ par: 4, lengthM: 400 * YD, clubs: BAG, missSide: 'right', hazards: [{ kind: 'water', along: 235 * YD, off: 30 * YD }] });
  assert.equal(rightWater.club.label, '3W', 'น้ำฝั่งที่พลาดบ่อยในระยะไดรเวอร์');
  assert.match(rightWater.why, /ฝั่งที่คุณพลาดบ่อย/);
});

test('ประวัติหลุม: ไดรเวอร์โดนลูกโทษหลุมนี้ซ้ำ → เปลี่ยนไม้ · พาร์ 3 เลือกไม้ระยะใกล้สุด · ไม่มีข้อมูลไม่แนะนำ', () => {
  const tp = teePlan({ par: 4, lengthM: 400 * YD, clubs: BAG, history: { n: 3, pen: 2, penDriver: 2 } });
  assert.equal(tp.club.label, '3W');
  assert.ok(tp.notes.some((n) => n.includes('โดนลูกโทษ 2 ครั้ง')));
  const p3 = teePlan({ par: 3, lengthM: 155 * YD, clubs: BAG, missSide: 'left' });
  assert.equal(p3.club.label, 'I7');
  assert.match(p3.aim, /เยื้องขวา/);
  assert.equal(teePlan({ par: 4, lengthM: 300, clubs: [] }), null);
  assert.equal(teePlan({ par: null, clubs: BAG }), null);
});

test('อันตรายของหลุมเทียบแนวแท่นที→กรีน', () => {
  const tee = { lat: 14.5, lon: 101.4 };
  const green = destination(tee, 0, 380 * YD);
  const z = { ...destination(destination(tee, 0, 220 * YD), 90, 25 * YD), kind: 'water' };
  const [h] = hazardsAlong({ tee, green, hazards: [z] });
  assert.ok(Math.abs(h.along / YD - 220) < 2 && Math.abs(h.off / YD - 25) < 1);
  assert.deepEqual(hazardsAlong({ tee, green: null, hazards: [z] }), []);
});

test('ฝั่งที่พลาด = ฝั่งที่ลูกไปจบ: ออกซ้ายแล้วโค้งขวาแต่ยังจบซ้าย → เล็งเผื่อขวา (ไม่อ้างว่าลูกโค้งซ้าย)', async () => {
  const { simCue } = await import('../js/coach.js');
  const curve = { k: 'curve', dir: 'right', detail: ['Face to Path +7.9°'] };
  const pullSlice = { side: 'left', missL: 0.28, missR: 0.03, curve: 'right' };
  const c = simCue([curve], pullSlice);
  assert.match(c.text, /ตั้งทีฝั่งซ้าย.*เล็งไปขอบขวา.*เผื่อลูกที่มักไปจบทางซ้าย/);
  assert.match(c.why, /หลุดแฟร์เวย์ทางซ้าย 28%/);
  assert.match(simCue([curve]).text, /ตั้งทีฝั่งขวา/, 'ไม่มีข้อมูลจุดตก ใช้ทิศที่โค้ง');
  const tp = teePlan({ par: 4, lengthM: 400 * YD, clubs: BAG, missSide: 'left' });
  assert.match(tp.aim, /เผื่อลูกที่มักไปจบทางซ้าย/);
  assert.ok(!/โค้ง/.test(tp.aim));
});
