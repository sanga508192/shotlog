// ทดสอบการวิเคราะห์ทีออฟ/ไดรเวอร์: จากรอบในสนาม จากเครื่องซ้อม และการใส่เข้าแผนซ้อม
import test from 'node:test';
import assert from 'node:assert/strict';
import { holeFacts, teeAnalysis, buildPlan, analyzeGame, goalOf, drill } from '../js/coach.js';
import { driverProfile, FAIRWAY_HALF } from '../js/launch.js';

let uid = 0;
const id = (p) => `${p}${++uid}`;
const CLUBS = { D: { id: 'D', label: 'Driver', category: 'driver' }, '3W': { id: '3W', label: '3W', category: 'wood' }, I7: { id: 'I7', label: 'I7', category: 'iron' } };
const clubOf = (cid) => CLUBS[cid] ?? null;

function mkHole(par, spec, pens = []) {
  const hole = { id: id('h'), number: 1, par, status: 'done', finish: 'holed' };
  const shots = spec.map(([type, end, extra = {}], i) => ({
    id: id('s'), hole_id: hole.id, sequence: i + 1, shot_type: type, end_lie: end,
    start_lie: i === 0 ? 'tee' : spec[i - 1][1], holed: end === 'holed', counted: true, ...extra,
  }));
  const penalties = pens.map(([i, strokes, reason]) => ({ id: id('p'), hole_id: hole.id, strokes, reason, related_shot_id_optional: shots[i].id }));
  return { hole, shots, penalties };
}
const facts = (holes) => holes.map((h) => holeFacts(h.hole, h.shots, h.penalties));

// ไดรเวอร์พลาดขวาบ่อย บางครั้ง OB · 3W ลงแฟร์เวย์
function teeHoles() {
  const H = {
    dFw: () => mkHole(4, [['tee', 'fairway', { club_id: 'D' }], ['approach', 'green'], ['putt', 'green'], ['putt', 'holed']]),
    dRight: () => mkHole(4, [['tee', 'rough', { club_id: 'D', direction: 'right' }], ['approach', 'fringe'], ['chip', 'green'], ['putt', 'green'], ['putt', 'holed']]),
    dOb: () => mkHole(4, [['tee', 'other', { club_id: 'D', direction: 'right' }], ['tee', 'fairway', { club_id: 'D' }], ['approach', 'green'], ['putt', 'green'], ['putt', 'holed']], [[0, 2, 'ob_lost']]),
    w3: () => mkHole(4, [['tee', 'fairway', { club_id: '3W' }], ['approach', 'fringe'], ['chip', 'green'], ['putt', 'holed']]),
    p3: () => mkHole(3, [['tee', 'green', { club_id: 'I7' }], ['putt', 'green'], ['putt', 'holed']]),
  };
  return [...Array(3).fill('dFw'), ...Array(5).fill('dRight'), ...Array(2).fill('dOb'), ...Array(4).fill('w3'), ...Array(4).fill('p3')].map((k) => H[k]());
}

test('ทีออฟในสนาม: ลงแฟร์เวย์ ฝั่งที่พลาด ลูกโทษ แยกตามไม้ และผลต่อสกอร์', () => {
  const t = teeAnalysis(facts(teeHoles()), { clubOf, goal: goalOf('90') });
  assert.equal(t.n, 14, 'นับเฉพาะพาร์ 4–5');
  assert.equal(t.enough, true);
  assert.equal(Math.round(t.fir), 50, '7 จาก 14');
  assert.deepEqual({ v: t.dir.v, n: t.dir.n }, { v: 'right', n: 7 });
  assert.deepEqual(t.spread, { n: 14, fw: 7, left: 0, right: 7, unk: 0 });
  assert.equal(t.penHoles, 2);
  assert.equal(t.penPerRound, 4, 'ลูกโทษ 4 สโตรกใน 18 หลุม');
  const drv = t.byClub.find((c) => c.id === 'D');
  assert.deepEqual([drv.n, Math.round(drv.fir), drv.pen], [10, 30, 2]);
  assert.equal(t.alt.id, '3W', '3W ตรงกว่าไดรเวอร์ชัดเจน');
  // หลุมลงแฟร์เวย์เฉลี่ย (0×3 + 0×4)/7 = 0 · พลาด (1×5 + 3×2)/7 = 1.57
  assert.ok(Math.abs(t.missCost - 11 / 7) < 1e-9);
  assert.ok(Math.abs(t.cost - 11) < 1e-9, 'เสีย 11 สโตรกใน 18 หลุมเทียบหลุมที่ลงแฟร์เวย์');
  assert.ok(t.gap >= 0.5 && t.problem);
  assert.match(t.cue.text, /3W แทนไดรเวอร์/, 'ไดรเวอร์โดนลูกโทษบ่อย → ใช้ไม้ที่ตรงกว่าในหลุมเสี่ยง');
  assert.equal(t.cue.k, 'tee');
  assert.match(t.cue2.text, /^หลุมที่ยังใช้ไดรเวอร์: ตั้งทีฝั่งขวา/, 'หลุมที่ยังใช้ไดรเวอร์ก็เล็งเผื่อฝั่งที่พลาด');
  assert.deepEqual(t.drills, ['driver-curve', 'tee-club-test', 'tee-gate']);
  assert.ok(t.find.some((x) => x.includes('พลาดไปทางขวา')));
});

test('ทีออฟ: ไม่มีไม้ที่ตรงกว่า → โฟกัสตั้งทีฝั่งที่พลาดแล้วเล็งอีกฝั่ง · ข้อมูลน้อยไม่สรุป', () => {
  const holes = teeHoles().filter((h) => h.shots[0].club_id !== '3W');
  const t = teeAnalysis(facts(holes), { clubOf, goal: goalOf('90') });
  assert.equal(t.alt, null);
  assert.match(t.cue.text, /ตั้งทีฝั่งขวา.*ขอบซ้าย/);
  assert.equal(t.cue.src, undefined, 'มาจากข้อมูลในสนาม');
  assert.equal(t.cue2, null);
  const few = teeAnalysis(facts(holes.slice(0, 4)), { clubOf, goal: goalOf('90') });
  assert.equal(few.enough, false);
  assert.equal(few.gap, null);
  assert.equal(few.problem, false);
  // ไม่ระบุทิศ → แนะนำให้จดทิศ
  const noDir = teeHoles().map((h) => { h.shots[0].direction = null; return h; });
  assert.ok(teeAnalysis(facts(noDir), { clubOf }).hints.some((x) => x.includes('ระบุทิศ')));
});

// ช็อตจากเครื่องซ้อม: สไลซ์แบบในไฟล์จริงของผู้ใช้ (Face to Path ≈ +7° แนวสวิง ≈ −11°)
const r10 = (n, f) => Array.from({ length: n }, (_, i) => ({
  raw: 'Driver', clubId: 'D', cs: 41, bs: 55 + i / 10, sf: 1.34, la: 12, ld: -3, spin: 4576, carry: 175 + (i % 7), total: 188,
  cdev: f(i), aa: 4.3, path: -10.8, face: -3.4, f2p: 7.4 + (i % 3) / 10,
}));

test('ไดรเวอร์จากเครื่องซ้อม: ลงแฟร์เวย์สมมติ 40 หลา ฝั่งที่หลุด และลักษณะลูก', () => {
  // 10 ลูก: 5 ลูกในแฟร์เวย์ 4 ลูกหลุดขวา 1 ลูกหลุดซ้าย
  const dev = [0, 5, -8, 12, 15, 30, 35, 28, 40, -25];
  const d = driverProfile(r10(10, (i) => dev[i]), clubOf);
  assert.equal(d.fw, 0.5);
  assert.equal(d.missR, 0.4);
  assert.equal(d.missL, 0.1);
  assert.equal(d.side, 'right');
  assert.equal(d.curve, 'right');
  assert.equal(d.shape, 'สไลซ์/เฟด');
  assert.equal(d.outIn, 'ตัดจากนอกเข้าใน');
  assert.ok(Math.abs(FAIRWAY_HALF - 18.288) < 1e-9);
  const lefty = driverProfile(r10(10, (i) => dev[i]), clubOf, { hand: 'left' });
  assert.equal(lefty.shape, 'ฮุก/ดรอว์');
  assert.equal(lefty.outIn, 'ตีจากในออกนอก');
  assert.equal(driverProfile(r10(4, () => 0), clubOf), null, 'น้อยกว่า 5 ลูกไม่สรุป');
  assert.equal(driverProfile([], clubOf), null);
});

test('มีแต่เครื่องซ้อม: ไดรเวอร์หลุดแฟร์เวย์บ่อย → เป็นปัญหา โฟกัสรอบหน้ามาจากเครื่องซ้อม', () => {
  const d = driverProfile(r10(10, (i) => [0, 5, -8, 12, 15, 30, 35, 28, 40, -25][i]), clubOf);
  const t = teeAnalysis([], { clubOf, driver: d });
  assert.equal(t.enough, false);
  assert.equal(t.problem, true);
  assert.equal(t.missSide, 'right');
  assert.equal(t.cue.src, 'sim');
  assert.match(t.cue.why, /เครื่องซ้อม: ไดรเวอร์หลุดแฟร์เวย์ทางขวา 40%/, 'อ้างฝั่งที่ลูกไปจบ ไม่ใช่ทิศที่โค้ง');
  assert.deepEqual(t.drills, ['driver-curve', 'sim-driver-window', 'driver-strike', 'tee-gate'], 'Smash 1.34 ต่ำกว่าเกณฑ์ไดรเวอร์');
  const good = driverProfile(r10(10, () => 3).map((s) => ({ ...s, f2p: 0.5, path: 1, sf: 1.46 })), clubOf);
  assert.equal(teeAnalysis([], { clubOf, driver: good }).problem, false);

  // ในหน้าโค้ช: โฟกัสรอบหน้าและแผนซ้อมมีเรื่องไดรเวอร์
  const a = analyzeGame({ rounds: [], holesOf: () => [], shotsOf: () => [], penaltiesOf: () => [], simDriver: d }, '90');
  assert.equal(a.cues.length, 1);
  assert.equal(a.cues[0].k, 'tee');
  assert.ok(a.plan.items.some((x) => x.area === 'ทีออฟ' || x.id.startsWith('sim-driver')));
  assert.ok(a.plan.basis.includes('ทีออฟ/ไดรเวอร์'));
});

test('แผนซ้อม: ทีออฟเป็นปัญหาแต่ไม่ติดอันดับ → แทนแบบฝึกสุดท้ายด้วยแบบฝึกไดรเวอร์ 1 อย่าง', () => {
  const g = goalOf('90');
  const focus = [{ th: 'พัตเกิน 2 ครั้ง', drills: ['putt-ladder', 'putt-circle'] }, { th: 'พลาดกรีน', drills: ['approach-ladder', 'approach-center'] }];
  const tee = { problem: true, drills: ['driver-curve', 'tee-gate'] };
  const p = buildPlan(focus, g, [], [], tee);
  assert.deepEqual(p.items.map((x) => x.id), ['putt-ladder', 'putt-circle', 'approach-ladder', 'driver-curve']);
  assert.deepEqual(p.basis, ['พัตเกิน 2 ครั้ง', 'พลาดกรีน', 'ทีออฟ/ไดรเวอร์']);
  // มีแบบฝึกทีออฟอยู่แล้ว → ไม่เพิ่มซ้ำ
  const withTee = buildPlan([{ th: 'ทีออฟ / ไดรเวอร์', drills: ['tee-gate', 'driver-strike'] }, ...focus], g, [], [], tee);
  assert.equal(withTee.items.filter((x) => x.area === 'ทีออฟ').length, 2);
  assert.ok(!withTee.basis.includes('ทีออฟ/ไดรเวอร์'));
  // ไม่เป็นปัญหา → แผนเดิม
  assert.deepEqual(buildPlan(focus, g, [], [], { problem: false, drills: ['driver-curve'] }).items.map((x) => x.id), ['putt-ladder', 'putt-circle', 'approach-ladder', 'approach-center']);
  for (const x of ['driver-curve', 'driver-strike', 'sim-driver-window']) assert.ok(drill(x), x);
});
