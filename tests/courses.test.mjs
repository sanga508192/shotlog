// ทดสอบพิกัด/ระยะทางของสนาม และความถูกต้องของสกอร์การ์ดที่เตรียมไว้
import test from 'node:test';
import assert from 'node:assert/strict';
import { CURATED_COURSES, distanceKm, sortByDistance, fmtKm, prefillFromScorecard, teeTotal } from '../js/courses.js';
import { SCORECARDS } from '../js/scorecards.js';

const KHON_KAEN_CITY = { lat: 16.4322, lon: 102.8236 };   // ศาลากลางขอนแก่น (โดยประมาณ)
const KORAT_CITY = { lat: 14.9799, lon: 102.0978 };

test('ระยะทางเส้นตรงถูกต้องตามสูตร', () => {
  // กรุงเทพ–เชียงใหม่ ราว 580 กม. (เส้นตรง)
  const d = distanceKm({ lat: 13.7563, lon: 100.5018 }, { lat: 18.7883, lon: 98.9853 });
  assert.ok(d > 570 && d < 595, `${d}`);
  assert.equal(distanceKm(KORAT_CITY, KORAT_CITY), 0);
});

test('อยู่ในเมืองขอนแก่น → สนามขอนแก่นขึ้นก่อน ใกล้สุดอันดับแรก', () => {
  const list = sortByDistance(CURATED_COURSES, KHON_KAEN_CITY);
  assert.deepEqual(list.slice(0, 3).map((c) => c.province), ['ขอนแก่น', 'ขอนแก่น', 'ขอนแก่น']);
  assert.equal(list[0].id, 'dancoon', 'คลับเฮาส์แดนคูน 12.1 กม. ใกล้กว่าสิงห์ปาร์ค 12.3 กม.');
  for (let i = 1; i < list.length; i++) {
    if (list[i].km == null) continue;
    assert.ok(list[i].km >= list[i - 1].km, 'ต้องเรียงจากใกล้ไปไกล');
  }
  const firstNoGeo = list.findIndex((c) => c.km == null);
  assert.ok(list.slice(firstNoGeo).every((c) => c.km == null), 'สนามที่ยังไม่มีพิกัดอยู่ท้ายทั้งหมด');
  assert.equal(fmtKm(list.at(-1)), 'ยังไม่มีพิกัด');
});

test('อยู่ในเมืองโคราช → สนามโคราชขึ้นก่อน และพิกัดโดยประมาณมีเครื่องหมาย ~', () => {
  const list = sortByDistance(CURATED_COURSES, KORAT_CITY);
  assert.deepEqual(list.slice(0, 3).map((c) => c.province), ['นครราชสีมา', 'นครราชสีมา', 'นครราชสีมา']);
  const ubon = list.find((c) => c.id === 'ubonrat-dam');
  assert.match(fmtKm(ubon), /^~/);
});

test('สกอร์การ์ดทุกสนาม: 18 หลุม พาร์ 72 HC 1–18 ไม่ซ้ำ (ว่างได้ถ้าการ์ดไม่ชัด) ระยะเป็นตัวเลขหรือว่าง', () => {
  const ids = Object.keys(SCORECARDS);
  assert.deepEqual(ids.sort(), ['dancoon', 'kabinburi-sport-club', 'kirimaya', 'panorama', 'rancho-charnvee', 'singha-park-khon-kaen', 'tiger-golf', 'ubonrat-dam']);
  for (const [id, sc] of Object.entries(SCORECARDS)) {
    assert.ok(CURATED_COURSES.some((c) => c.id === id), `${id} ต้องอยู่ในรายชื่อสนาม`);
    assert.equal(sc.par.length, 18, id);
    assert.equal(sc.par.reduce((a, b) => a + b, 0), 72, id);
    assert.equal(sc.hc.length, 18, `${id} HC`);
    const known = sc.hc.filter((v) => v != null);
    assert.ok(known.every((v) => Number.isInteger(v) && v >= 1 && v <= 18) && new Set(known).size === known.length, `${id} HC ซ้ำหรือผิดช่วง`);
    if (!sc.note?.includes('HC')) assert.equal(known.length, 18, `${id} HC ว่างต้องมีหมายเหตุ`);
    if (sc.hc_ladies) assert.deepEqual([...sc.hc_ladies].sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1));
    assert.ok(sc.tees.length >= 2 && sc.sources.length, id);
    for (const t of sc.tees) if (t.rating) assert.ok(t.rating.cr >= 50 && t.rating.cr <= 90 && t.rating.slope >= 55 && t.rating.slope <= 155, `${id} ${t.id} rating`);
    for (const t of sc.tees) {
      assert.equal(t.yards.length, 18, `${id} ${t.id}`);
      t.yards.forEach((y, i) => {
        if (y == null) return;
        const p = sc.par[i];
        assert.ok(y > 50 && y < 700, `${id} ${t.id} หลุม ${i + 1}: ${y}`);
        if (p === 3) assert.ok(y <= 260, `${id} ${t.id} หลุม ${i + 1} พาร์ 3 ยาว ${y}`);
      });
    }
    // แท่นที่อยู่หน้ากว่าต้องสั้นกว่าหรือเท่ากับแท่นหลังในแต่ละหลุม
    for (let k = 1; k < sc.tees.length; k++) {
      sc.tees[k].yards.forEach((y, i) => {
        const back = sc.tees[k - 1].yards[i];
        if (y != null && back != null) assert.ok(y <= back, `${id} หลุม ${i + 1}: ${sc.tees[k].id} ${y} > ${sc.tees[k - 1].id} ${back}`);
      });
    }
  }
});

test('ระยะรวมตรงกับยอดรวมของแหล่งข้อมูล', () => {
  const tee = (id, t) => SCORECARDS[id].tees.find((x) => x.id === t);
  assert.equal(teeTotal(tee('singha-park-khon-kaen', 'black')), 7502, 'ตรงกับเว็บไซต์สนาม');
  assert.equal(teeTotal(tee('rancho-charnvee', 'blue')), 7131);
  assert.equal(teeTotal(tee('dancoon', 'blue')), 6949);
  assert.equal(teeTotal(tee('kirimaya', 'black')), null, 'มีหลุมที่เว้นไว้ → ไม่แสดงยอดรวม');
  // กบินทร์บุรี สปอร์ตคลับ: ยอดรวมตรงกับที่พิมพ์บนสกอร์การ์ดทุกแท่น
  assert.deepEqual(SCORECARDS['kabinburi-sport-club'].tees.map((t) => teeTotal(t)), [8075, 7504, 7158, 6652, 6241, 5829]);
  // แดนคูน: ยอดรวมตรงกับการ์ด (แท่นเหลืองการ์ดพิมพ์ 6,467 ผิด รายหลุมรวมได้ 6,473)
  assert.deepEqual(SCORECARDS.dancoon.tees.map((t) => teeTotal(t)), [6949, 6473, 5982, 5545]);
  // ไทเกอร์ กองบิน 1: 9 แรกแท่นน้ำเงิน + 9 หลังแท่นขาว = 6,415 · แดง 5,476 · Rating 18 หลุมจาก 9 หลุม 2 ชุด
  assert.deepEqual(SCORECARDS['tiger-golf'].tees.map((t) => [teeTotal(t), t.rating.cr, t.rating.slope]), [[6415, 71.1, 130], [5476, 71.6, 122]]);
});

test('เติมพาร์/HC/ระยะตามแท่นที่เลือก และค่าที่ผู้ใช้แก้เองมาก่อน', () => {
  const sc = SCORECARDS['singha-park-khon-kaen'];
  const p = prefillFromScorecard(sc, 'white', null);
  assert.deepEqual([p.pars[1], p.hc[1], p.dist[1]], [4, 7, 386]);
  assert.deepEqual([p.pars[18], p.hc[18], p.dist[18]], [5, 4, 503]);
  const mine = prefillFromScorecard(sc, 'white', { pars: { 1: 5 }, hc: { 2: 99 } });
  assert.equal(mine.pars[1], 5, 'ผู้ใช้แก้พาร์หลุม 1 เป็น 5');
  assert.equal(mine.hc[2], 99);
  const kb = prefillFromScorecard(SCORECARDS.kirimaya, 'black');
  assert.equal(kb.dist[6], undefined, 'หลุมที่ข้อมูลไม่แน่ใจต้องไม่มีระยะ');
  assert.deepEqual(prefillFromScorecard(null, null, { pars: { 3: 3 } }).pars, { 3: 3 });
});
