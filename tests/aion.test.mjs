// นำเข้าช็อตที่จดด้วยเสียงผ่าน AION: แปลงไม้ ต่อท้ายช็อตเดิม สโตรกปรับอัตโนมัติ จบหลุม ระยะ และข้ามหลุมที่ไม่มี
import test from 'node:test';
import assert from 'node:assert/strict';
import { clubIdFor, planImport, groupByDay, entryText, toRoundUnit } from '../js/aion.js';

const clubs = [
  { id: 'cD', label: 'D', category: 'driver', in_bag: true },
  { id: 'c3w', label: '3W', category: 'wood', in_bag: true },
  { id: 'c4h', label: '4H', category: 'hybrid', in_bag: true },
  { id: 'c7', label: 'I7', category: 'iron', in_bag: true },
  { id: 'c7old', label: '7i', category: 'iron', in_bag: false },
  { id: 'cPW', label: 'PW', category: 'wedge', in_bag: true },
  { id: 'cAW', label: 'AW', category: 'wedge', in_bag: true },
  { id: 'cPT', label: 'PT', category: 'putter', in_bag: true },
];

test('แปลงรหัสไม้ของ AION เป็นไม้ในกระเป๋า', () => {
  assert.equal(clubIdFor('D', clubs), 'cD');
  assert.equal(clubIdFor('I7', clubs), 'c7'); // ไม้ในกระเป๋าก่อนไม้ที่เอาออกแล้ว
  assert.equal(clubIdFor('I7', [{ id: 'x', label: '7i', category: 'iron', in_bag: true }]), 'x');
  assert.equal(clubIdFor('GW', clubs), 'cAW'); // GW ↔ AW
  assert.equal(clubIdFor('PT', [{ id: 'p', label: 'Putter', category: 'putter', in_bag: true }]), 'p');
  assert.equal(clubIdFor('D', [{ id: 'big', label: 'Big Bertha', category: 'driver', in_bag: true }]), 'big'); // ชื่อไม่ตรง → ใช้ประเภท
  assert.equal(clubIdFor('LW', clubs), null);
  assert.equal(clubIdFor('', clubs), null);
});

const round = { id: 'R', distance_unit: 'yd', current_hole: 1, status: 'playing' };
const holes = [
  { id: 'H1', round_id: 'R', number: 1, par: null, distance: null, status: 'playing' },
  { id: 'H2', round_id: 'R', number: 2, par: 4, distance: 380, distance_unit: 'yd', status: 'playing' },
];
let n = 0;
const uid = () => `id${++n}`;
const shot = (id, hole, seq, data, voice = '') => ({ id, kind: 'shot', hole, seq, played_on: '2026-11-28', data, voice, status: 'new' });

test('นำเข้า: หลุม 1 พาร์ 5 · ไดรเวอร์สไลซ์เข้าป่า · ลงน้ำ · พัต 2 ทีลง', () => {
  n = 0;
  const entries = [
    { id: 1, kind: 'round', hole: null, seq: null, played_on: '2026-11-28', data: { course: 'สิงห์ปาร์ค', tee: 'ขาว' }, voice: '' },
    { id: 2, kind: 'hole', hole: 1, seq: null, played_on: '2026-11-28', data: { par: 5, distance: 500, unit: 'yd' }, voice: '' },
    shot(3, 1, 1, { club: 'D', shot_type: 'tee', end_lie: 'trees', direction: 'right', contact: '', carry: 200, remaining: 0, unit: 'yd', holed: false, note: 'สไลซ์' }, 'ช็อต 1 ไดรเวอร์ สไลซ์เข้าป่าขวา 200 หลา'),
    shot(4, 1, 2, { club: 'I7', shot_type: 'recovery', end_lie: 'water', direction: '', contact: 'top', carry: 0, remaining: 0, unit: 'yd', holed: false, note: '' }),
    shot(5, 1, 3, { club: 'PW', shot_type: '', end_lie: 'green', direction: '', contact: '', carry: 0, remaining: 10, unit: 'm', holed: false, note: '' }, 'พิทช์ขึ้นกรีน เหลือ 10 เมตร'),
    shot(6, 1, 4, { club: 'PT', shot_type: '', end_lie: 'green', carry: 0, remaining: 0, unit: 'yd', holed: false, note: '' }, 'พัตสองทีลง'),
    shot(7, 1, 5, { club: 'PT', shot_type: 'putt', end_lie: 'holed', carry: 0, remaining: 0, unit: 'yd', holed: true, note: '' }, 'พัตสองทีลง'),
    shot(8, 9, 1, { club: 'D' }), // รอบนี้ไม่มีหลุม 9
  ];
  const p = planImport({ round, holes, shotsOf: () => [], clubs, entries, uid, now: 'T' });
  const shots = p.ops.filter((o) => o.store === 'shots').map((o) => o.put);
  assert.deepEqual(shots.map((s) => [s.sequence, s.club_id, s.shot_type, s.start_lie, s.end_lie, s.holed]), [
    [1, 'cD', 'tee', 'tee', 'trees', false],
    [2, 'c7', 'recovery', 'trees', 'water', false],
    [3, 'cPW', null, null, 'green', false], // หลังลงน้ำ = ดรอป → ไม่รู้จุดเริ่ม
    [4, 'cPT', 'putt', 'green', 'green', false],
    [5, 'cPT', 'putt', 'green', 'holed', true],
  ]);
  // ระยะ: ช็อตแรกเริ่มจากระยะหลุม 500 ไป 200 → เหลือ 300 · เหลือ 10 เมตร → 11 หลา
  assert.equal(shots[0].distance_before, 500);
  assert.equal(shots[0].distance_after, 300);
  assert.equal(shots[0].raw_distance_text, 'ไป ~200 หลา');
  assert.equal(shots[0].measurement_method, 'estimated');
  assert.equal(shots[2].distance_after, 11);
  assert.equal(shots[3].distance_before, 11);
  assert.equal(shots[4].distance_after, 0);
  // หมายเหตุ: คำบรรยาย + คำพูดต้นฉบับครั้งเดียวต่อประโยค
  assert.equal(shots[0].note, 'สไลซ์ · 🎙 ช็อต 1 ไดรเวอร์ สไลซ์เข้าป่าขวา 200 หลา');
  assert.equal(shots[3].note, '🎙 พัตสองทีลง');
  assert.equal(shots[4].note, '');
  assert.equal(shots[1].contact, 'top');
  assert.equal(shots[0].from_aion, 3);
  // ลงน้ำ → สโตรกปรับอัตโนมัติ 1 แบบดรอป
  const pens = p.ops.filter((o) => o.store === 'penalties').map((o) => o.put);
  assert.deepEqual(pens.map((x) => [x.related_shot_id_optional, x.reason, x.strokes, x.relief, x.auto]), [[shots[1].id, 'penalty_area', 1, 'drop', true]]);
  // หลุม: เติมพาร์/ระยะที่ยังไม่มี และจบหลุม · รอบ: หลุมปัจจุบัน
  const h1 = p.ops.find((o) => o.store === 'holes').put;
  assert.deepEqual([h1.par, h1.distance, h1.distance_unit, h1.status, h1.finish], [5, 500, 'yd', 'done', 'holed']);
  assert.equal(p.ops.find((o) => o.store === 'rounds').put.current_hole, 1);
  assert.deepEqual(p.holesBefore.map((h) => [h.id, h.par, h.status]), [['H1', null, 'playing']]);
  // หลุม 9 ไม่มี → ข้าม และไม่ยืนยันกับ AION
  assert.deepEqual(p.skipped.map((s) => s.why), ['รอบนี้ไม่มีหลุม 9']);
  assert.deepEqual(p.importedIds, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(p.summary, '5 ช็อต · สโตรกปรับ 1 · ข้าม 1');
});

test('นำเข้า: ต่อท้ายช็อตที่จดในแอปแล้ว ไม่ทับพาร์จากสกอร์การ์ด และ OB = ตีใหม่จากจุดเดิม', () => {
  n = 0;
  const existing = { H2: [{ id: 'old1', sequence: 1, start_lie: 'tee', end_lie: 'ob' }] };
  const entries = [
    { id: 10, kind: 'hole', hole: 2, seq: null, played_on: 'd', data: { par: 5, distance: 999, unit: 'yd' }, voice: '' },
    shot(11, 2, 1, { club: '3W', end_lie: 'fairway', carry: 0, remaining: 150, unit: 'yd' }),
    shot(12, 2, 2, { club: 'LW', end_lie: 'green' }),
  ];
  const p = planImport({ round, holes, shotsOf: (id) => existing[id] ?? [], clubs, entries, uid, now: 'T' });
  const shots = p.ops.filter((o) => o.store === 'shots').map((o) => o.put);
  assert.deepEqual(shots.map((s) => [s.sequence, s.start_lie, s.club_id]), [[2, 'tee', 'c3w'], [3, 'fairway', null]]);
  assert.equal(shots[0].distance_after, 150);
  assert.equal(shots[1].distance_before, 150);
  assert.match(shots[1].note, /ไม้ LW ไม่มีในกระเป๋า/);
  assert.equal(p.ops.some((o) => o.store === 'holes'), false); // หลุม 2 มีพาร์และระยะแล้ว ไม่แก้
});

test('รอบหน่วยเมตร: แปลงหลาเป็นเมตร · จัดกลุ่มตามวัน · ข้อความแสดงผล', () => {
  assert.equal(toRoundUnit(200, 'yd', 'm'), 183);
  assert.equal(toRoundUnit(100, 'm', 'yd'), 109);
  assert.equal(toRoundUnit(null, 'yd', 'm'), null);
  const g = groupByDay([
    { id: 2, played_on: '2026-11-29', kind: 'shot', data: {} },
    { id: 1, played_on: '2026-11-28', kind: 'round', data: { course: 'ปากช่อง' } },
  ]);
  assert.deepEqual(g.map((x) => [x.day, x.course, x.entries.length]), [['2026-11-28', 'ปากช่อง', 1], ['2026-11-29', '', 1]]);
  const line = entryText(shot(3, 1, 1, { club: 'D', shot_type: 'tee', end_lie: 'trees', direction: 'right', carry: 200, unit: 'yd', note: 'สไลซ์' }), 'm');
  assert.equal(line, 'ช็อต 1 D ทีออฟ → ต้นไม้/ป่า (ขวา) ไป ~183 ม. · สไลซ์');
  assert.doesNotMatch(entryText({ kind: 'shot', seq: null, data: { end_lie: 'lava' } }), /undefined|lava/);
});
