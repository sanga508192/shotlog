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
  assert.equal(list[0].id, 'singha-park-khon-kaen');
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

test('สกอร์การ์ดทุกสนาม: 18 หลุม พาร์ 72 HC 1–18 ไม่ซ้ำ ระยะเป็นตัวเลขหรือว่าง', () => {
  const ids = Object.keys(SCORECARDS);
  assert.deepEqual(ids.sort(), ['dancoon', 'kirimaya', 'panorama', 'rancho-charnvee', 'singha-park-khon-kaen', 'ubonrat-dam']);
  for (const [id, sc] of Object.entries(SCORECARDS)) {
    assert.ok(CURATED_COURSES.some((c) => c.id === id), `${id} ต้องอยู่ในรายชื่อสนาม`);
    assert.equal(sc.par.length, 18, id);
    assert.equal(sc.par.reduce((a, b) => a + b, 0), 72, id);
    assert.deepEqual([...sc.hc].sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1), `${id} HC`);
    if (sc.hc_ladies) assert.deepEqual([...sc.hc_ladies].sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1));
    assert.ok(sc.tees.length >= 3 && sc.sources.length, id);
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
