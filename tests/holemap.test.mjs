// ทดสอบแผนที่หลุม: ระยะ ทิศ พิกัดเมอร์เคเตอร์ ระยะช็อตจาก GPS และระยะไม้จริง
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { distM, bearing, destination, mercator, unmercator, toUnit, fmtDist, courseHoles, setHolePoint, holeReady, scorecardLength, YD } from '../js/holemap.js';
import { shotDistances, clubDistances } from '../js/coach.js';
import * as st from '../js/state.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} ≠ ${b} (±${tol})`);

test('ระยะและทิศบนผิวโลก', () => {
  const a = { lat: 14.5, lon: 101.4 };
  // 1 ฟิลิปดาละติจูด ≈ 30.87 ม. · ไปทางเหนือ 0.001° ≈ 111.2 ม.
  near(distM(a, { lat: 14.501, lon: 101.4 }), 111.2, 0.3, 'เหนือ 0.001°');
  near(bearing(a, { lat: 14.501, lon: 101.4 }), 0, 0.01, 'ทิศเหนือ');
  near(bearing(a, { lat: 14.5, lon: 101.401 }), 90, 0.01, 'ทิศตะวันออก');
  near(bearing(a, { lat: 14.499, lon: 101.4 }), 180, 0.01, 'ทิศใต้');
  // ไปทาง 37° 350 หลา แล้ววัดกลับต้องได้เท่าเดิม
  const b = destination(a, 37, 350 * YD);
  near(distM(a, b), 350 * YD, 0.01, 'ระยะไป-กลับ');
  near(bearing(a, b), 37, 0.001, 'ทิศไป-กลับ');
  assert.equal(distM(null, a), null);
});

test('เมอร์เคเตอร์แปลงไป-กลับได้ตรง และหน่วยระยะ', () => {
  const p = { lat: 16.4322, lon: 102.8236 };
  const q = unmercator(mercator(p));
  near(q.lat, p.lat, 1e-9);
  near(q.lon, p.lon, 1e-9);
  const m = mercator({ lat: 0, lon: 0 });
  assert.deepEqual([m.x, m.y], [0.5, 0.5]);
  near(toUnit(91.44, 'yd'), 100, 1e-9);
  assert.equal(fmtDist(91.44, 'yd'), '100');
  assert.equal(fmtDist(null, 'm'), '–');
});

test('หมุดสนาม: บันทึก อ่าน กรองค่าเสีย และระยะจากสกอร์การ์ด', async () => {
  await st.load();
  await setHolePoint('dancoon', 1, 'tee', { lat: 14.5, lon: 101.4 });
  assert.equal(holeReady(courseHoles('dancoon')[1]), false);
  await setHolePoint('dancoon', 1, 'green', { lat: 14.503, lon: 101.401 });
  assert.equal(holeReady(courseHoles('dancoon')[1]), true);
  await st.setSetting('course_holes:junk', { holes: { 1: { tee: { lat: 'x' } }, 2: null, 3: { green: { lat: 95, lon: 0 } } } });
  assert.deepEqual(courseHoles('junk'), {}, 'ค่าพิกัดเสียต้องไม่ถูกใช้');
  await setHolePoint('dancoon', 1, 'tee', null);
  assert.equal(courseHoles('dancoon')[1].tee, null);
  const sc = { unit: 'yd', tees: [{ id: 'blue', name: 'น้ำเงิน', yards: [400] }, { id: 'white', name: 'ขาว', yards: [380] }] };
  assert.deepEqual(scorecardLength(sc, 1, 'blue'), { value: 400, unit: 'yd', tee: 'น้ำเงิน' });
  assert.equal(scorecardLength(sc, 1, null).value, 380, 'ไม่ระบุแท่นใช้ขาว');
  assert.equal(scorecardLength(null, 1), null);
});

test('ระยะช็อตจาก GPS: จากจุดตีถึงจุดตีช็อตถัดไป ช็อตแรกใช้หมุดแท่นทีแทนได้', () => {
  const tee = { lat: 14.5, lon: 101.4 };
  const p2 = destination(tee, 10, 230 * YD);
  const p3 = destination(p2, 10, 150 * YD);
  const shots = [
    { id: 's1', sequence: 1 },   // ลืมเปิด GPS ตอนทีออฟ → ใช้หมุดแท่นที
    { id: 's2', sequence: 2, gps: { ...p2, acc: 6 } },
    { id: 's3', sequence: 3, gps: { ...p3, acc: 60 } },   // ไม่แม่น ไม่นำมาคิด
    { id: 's4', sequence: 4, gps: { ...destination(p3, 10, 5), acc: 5 } },
    { id: 'x', sequence: 5, counted: false, gps: { ...p3, acc: 5 } },
  ];
  const d = shotDistances(shots, tee);
  near(d.get('s1'), 230 * YD, 0.01);
  assert.equal(d.has('s2'), false, 'ช็อตถัดไปไม่แม่น');
  assert.equal(d.has('s3'), false);
  assert.equal(d.size, 1);
  assert.equal(shotDistances(shots, null).size, 0, 'ไม่มีหมุดแท่นทีและไม่มี GPS ช็อตแรก');
});

test('ระยะไม้จริง: ใช้เฉพาะช็อตเต็มที่สัมผัสดี เรียงตามกระเป๋า', () => {
  const clubs = { D: { id: 'D', label: 'D', category: 'driver', order: 0 }, I7: { id: 'I7', label: 'I7', category: 'iron', order: 6 }, PT: { id: 'PT', label: 'PT', category: 'putter', order: 12 } };
  const tee = { lat: 14.5, lon: 101.4 };
  const holes = [], shots = new Map(), pens = new Map();
  const mk = (i, driveYd, contact = 'good', pen = false) => {
    const h = { id: `h${i}`, number: i, round_id: 'r' };
    holes.push(h);
    const p2 = destination(tee, 0, driveYd * YD);
    const p3 = destination(p2, 0, 150 * YD);
    shots.set(h.id, [
      { id: `a${i}`, sequence: 1, club_id: 'D', shot_type: 'tee', contact, gps: { ...tee, acc: 5 } },
      { id: `b${i}`, sequence: 2, club_id: 'I7', shot_type: 'approach', gps: { ...p2, acc: 5 } },
      { id: `c${i}`, sequence: 3, club_id: 'PT', shot_type: 'putt', gps: { ...p3, acc: 5 } },
      { id: `d${i}`, sequence: 4, club_id: 'PT', shot_type: 'putt', gps: { ...destination(p3, 0, 3), acc: 5 } },
    ]);
    pens.set(h.id, pen ? [{ related_shot_id_optional: `a${i}`, strokes: 1 }] : []);
  };
  mk(1, 220); mk(2, 240); mk(3, 230); mk(4, 120, 'top'); mk(5, 260, 'good', true);
  const rows = clubDistances({
    rounds: [{ id: 'r', shot_logging: true }], holesOf: () => holes, shotsOf: (id) => shots.get(id), penaltiesOf: (id) => pens.get(id), clubOf: (id) => clubs[id],
  });
  assert.deepEqual(rows.map((r) => r.label), ['D', 'I7'], 'ไม่รวมพัตเตอร์');
  const d = rows[0];
  assert.equal(d.n, 3, 'ไม่นับช็อตท็อปและช็อตที่โดนลูกโทษ');
  near(d.median / YD, 230, 0.5);
  near(d.p25 / YD, 225, 0.5);
  near(d.p75 / YD, 235, 0.5);
  assert.equal(rows[1].n, 5);
  near(rows[1].median / YD, 150, 0.5);
});

test('ระยะไม้ที่ไม่สมเหตุสมผล (ไดรเวอร์ 100 หลาในสนามพาร์ 3) = น่าจะจดไม้ผิด ไม่นำไปแนะนำ', async () => {
  const { clubSuspect } = await import('../js/coach.js');
  assert.equal(clubSuspect('driver', 102 * YD), true);
  assert.equal(clubSuspect('driver', 200 * YD), false);
  assert.equal(clubSuspect('wedge', 100 * YD), false);
  assert.equal(clubSuspect('iron', 30), true);
  assert.equal(clubSuspect('putter', 3), false, 'ไม่ตรวจพัตเตอร์');
  const clubs = { D: { id: 'D', label: 'D', category: 'driver', order: 0 } };
  const tee = { lat: 14.5, lon: 101.4 };
  const holes = [], shots = new Map();
  for (let i = 1; i <= 4; i++) {
    holes.push({ id: `p${i}`, number: i, round_id: 'r3' });
    const g = destination(tee, 0, (95 + i * 3) * YD);
    shots.set(`p${i}`, [
      { id: `p${i}a`, sequence: 1, club_id: 'D', shot_type: 'tee', gps: { ...tee, acc: 5 } },
      { id: `p${i}b`, sequence: 2, club_id: null, shot_type: 'putt', gps: { ...g, acc: 5 } },
    ]);
  }
  const [d] = clubDistances({
    rounds: [{ id: 'r3', played_at: '2026-10-05', shot_logging: true }], holesOf: () => holes, shotsOf: (id) => shots.get(id), penaltiesOf: () => [], clubOf: (id) => clubs[id],
  });
  assert.equal(d.suspect, true);
  assert.equal(d.refs.length, 4);
  assert.deepEqual(d.refs.map((x) => x.hole), [1, 2, 3, 4]);
});

test('หมุดเริ่มต้นของคีรีมายา: ครบ 18 หลุม เป็นค่าประมาณ และผู้ใช้แก้ทับได้ทีละหมุด', async () => {
  const { COURSE_HOLES } = await import('../js/holedata.js');
  const { isEstimated } = await import('../js/holemap.js');
  const base = COURSE_HOLES.kirimaya.holes;
  assert.equal(Object.keys(base).length, 18);
  for (const [n, h] of Object.entries(base)) {
    const L = distM({ lat: h.tee[0], lon: h.tee[1] }, { lat: h.green[0], lon: h.green[1] }) / YD;
    assert.ok(L > 100 && L < 600, `หลุม ${n} ยาว ${Math.round(L)} หลา`);
    assert.ok(['mid', 'low'].includes(h.conf));
  }
  await st.setSetting('course_holes:kirimaya', null);
  const h1 = courseHoles('kirimaya')[1];
  assert.ok(holeReady(h1) && isEstimated(h1));
  const g = { lat: 14.5104, lon: 101.4309 };
  await setHolePoint('kirimaya', 1, 'green', g);
  const h1b = courseHoles('kirimaya')[1];
  assert.deepEqual([h1b.green, h1b.est.green, h1b.est.tee], [g, false, true], 'แก้กรีนแล้ว แท่นทียังเป็นค่าประมาณ');
  await setHolePoint('kirimaya', 1, 'tee', { lat: 14.5117, lon: 101.4332 });
  assert.equal(isEstimated(courseHoles('kirimaya')[1]), false);
  assert.ok(isEstimated(courseHoles('kirimaya')[2]), 'หลุมอื่นยังเป็นค่าประมาณ');
});

test('หมุดเริ่มต้นทุกสนาม: ครบ 18 หลุม และระยะสอดคล้องกับสกอร์การ์ด', async () => {
  const { COURSE_HOLES } = await import('../js/holedata.js');
  const { SCORECARDS } = await import('../js/scorecards.js');
  for (const [id, c] of Object.entries(COURSE_HOLES)) {
    assert.ok(c.source && c.checked_at, `${id} ต้องมีแหล่งที่มา`);
    assert.equal(Object.keys(c.holes).length, 18, id);
    const sc = SCORECARDS[id];
    for (const [n, h] of Object.entries(c.holes)) {
      assert.ok(['mid', 'low'].includes(h.conf), `${id} ${n}`);
      const L = distM({ lat: h.tee[0], lon: h.tee[1] }, { lat: h.green[0], lon: h.green[1] }) / YD;
      const ys = (sc?.tees ?? []).map((t) => t.yards?.[n - 1]).filter(Number.isFinite);
      if (!ys.length) continue;
      const longest = Math.max(...ys), shortest = Math.min(...ys);
      // หมุดแท่นทีอาจเป็นแท่นไหนก็ได้ · เส้นตรงสั้นกว่าระยะในการ์ดได้ถ้าหลุมหักศอก แต่ไม่ควรยาวเกิน
      if (sc.par[n - 1] === 3) assert.ok(L > shortest * 0.85 && L < longest * 1.15, `${id} หลุม ${n} (พาร์ 3) ${Math.round(L)} หลา เทียบ ${shortest}–${longest}`);
      else assert.ok(L > longest * 0.5 && L < longest * 1.1, `${id} หลุม ${n} ${Math.round(L)} หลา เทียบ ${longest}`);
    }
  }
});
