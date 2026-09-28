// ทดสอบโค้ชพัฒนาเกม: การแยกที่มาของสโตรก สถิติหลัก เป้าหมาย และแผนซ้อม
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GOALS, goalOf, budgetOver, suggestGoal, holeFacts, shotArea, analyzeGame, buildPlan, drillHistory, drill, DRILLS,
} from '../js/coach.js';

let uid = 0;
const id = (p) => `${p}${++uid}`;

// สร้างหลุมจากรายการช็อตย่อ: [ประเภท, จุดจบ, ตัวเลือกอื่น]
function mkHole(roundId, number, par, spec, { pens = [], finish = 'holed' } = {}) {
  const hole = { id: id('h'), round_id: roundId, number, par, status: 'done', finish };
  const shots = spec.map(([type, end, extra = {}], i) => ({
    id: id('s'), hole_id: hole.id, round_id: roundId, sequence: i + 1, shot_type: type, end_lie: end,
    start_lie: i === 0 ? 'tee' : spec[i - 1][1], holed: end === 'holed', counted: true, ...extra,
  }));
  const penalties = pens.map(([shotIdx, strokes, reason]) => ({
    id: id('p'), hole_id: hole.id, round_id: roundId, strokes, reason, related_shot_id_optional: shots[shotIdx]?.id ?? null,
  }));
  return { hole, shots, penalties };
}

const leakSum = (f) => f.leak.pen + f.leak.long + f.leak.miss + f.leak.short + f.leak.putt - f.leak.save;

test('งบสโตรกของทุกเป้ารวมแล้วไม่เกินสกอร์เป้าหมาย และ GIR สอดคล้องกับจำนวนพลาดกรีน', () => {
  for (const g of GOALS) {
    assert.ok(72 + budgetOver(g) <= g.score + 0.001, `${g.v}: ${72 + budgetOver(g)}`);
    assert.equal(g.stats.gir, 18 - g.budget.miss, g.v);
    assert.equal(g.stats.pen, g.budget.pen, g.v);
  }
  assert.equal(goalOf('nope').v, '90');
});

test('แนะนำเป้าถัดไปที่ต่ำกว่าสกอร์เฉลี่ย', () => {
  assert.equal(suggestGoal(null), '100');
  assert.equal(suggestGoal(115), '110');
  assert.equal(suggestGoal(104.2), '100');
  assert.equal(suggestGoal(99.9), '90');
  assert.equal(suggestGoal(85), '80');
  assert.equal(suggestGoal(78), 'par');
});

test('ประเภทพื้นที่ของช็อต', () => {
  assert.equal(shotArea({ shot_type: 'putt' }), 'putt');
  assert.equal(shotArea({ shot_type: null, start_lie: 'green' }), 'putt');
  assert.equal(shotArea({ shot_type: 'chip' }), 'short');
  assert.equal(shotArea({ shot_type: 'bunker' }), 'short');
  assert.equal(shotArea({ shot_type: 'bunker', distance_before: 120 }), 'long', 'บังเกอร์แฟร์เวย์');
  assert.equal(shotArea({ shot_type: 'recovery' }), 'long');
  assert.equal(shotArea({ shot_type: null, start_lie: 'fringe' }), 'short');
});

test('แยกที่มาของสโตรกในแต่ละหลุมได้ผลรวมเท่ากับสกอร์เทียบพาร์พอดี', () => {
  const cases = [
    // พาร์ปกติ: ออกแฟร์เวย์ ออนกรีน 2 พัต
    [4, [['tee', 'fairway'], ['approach', 'green'], ['putt', 'green'], ['putt', 'holed']], {}, { over: 0, gir: true, fir: true }],
    // อัพแอนด์ดาวน์
    [4, [['tee', 'rough'], ['approach', 'fringe'], ['chip', 'green'], ['putt', 'holed']], {}, { over: 0, gir: false, fir: false, upDown: true, miss: 1, save: 1 }],
    // พาร์ 5 ออนสอง แล้ว 3 พัต
    [5, [['tee', 'fairway'], ['approach', 'green'], ['putt', 'green'], ['putt', 'green'], ['putt', 'holed']], {}, { over: 0, gir: true, putt: 1, save: 1 }],
    // พาร์ 3 ติด OB ทีใหม่
    [3, [['tee', 'other'], ['tee', 'green'], ['putt', 'green'], ['putt', 'holed']], { pens: [[0, 1, 'ob_lost']] }, { over: 2, gir: false, fir: null, pen: 1, long: 1 }],
    // ชิพลงเบอร์ดี้
    [4, [['tee', 'fairway'], ['approach', 'fringe'], ['chip', 'holed']], {}, { over: -1, gir: false, upDown: true, miss: 1, save: 2 }],
    // ชิพสองครั้ง
    [4, [['tee', 'fairway'], ['approach', 'rough'], ['pitch', 'rough'], ['chip', 'green'], ['putt', 'green'], ['putt', 'holed']], {}, { over: 2, miss: 1, short: 1 }],
    // ทีออฟโดนลงน้ำ = ไม่ออกแฟร์เวย์ แม้จุดจบระบุแฟร์เวย์หลังดรอป
    [4, [['tee', 'fairway'], ['approach', 'green'], ['putt', 'green'], ['putt', 'holed']], { pens: [[0, 1, 'penalty_area']] }, { over: 1, fir: false, gir: false, pen: 1 }],
  ];
  for (const [par, spec, opt, want] of cases) {
    const { hole, shots, penalties } = mkHole('r', 1, par, spec, opt);
    const f = holeFacts(hole, shots, penalties);
    assert.ok(f, JSON.stringify(spec));
    assert.equal(leakSum(f), f.over, `ผลรวมต้องเท่ากับ ${f.over}: ${JSON.stringify(f.leak)}`);
    for (const [k, v] of Object.entries(want)) {
      const got = k in f.leak ? f.leak[k] : f[k];
      assert.equal(got, v, `${k} ใน ${JSON.stringify(spec)}`);
    }
  }
});

test('หลุมที่ข้อมูลไม่พอไม่นำมาวิเคราะห์', () => {
  const noEnd = mkHole('r', 1, 4, [['tee', 'fairway'], ['approach', 'green']]);
  assert.equal(holeFacts(noEnd.hole, noEnd.shots, noEnd.penalties), null, 'ไม่มีพัตและไม่ลงหลุม');
  const noPar = mkHole('r', 1, null, [['tee', 'fairway'], ['putt', 'holed']]);
  assert.equal(holeFacts(noPar.hole, noPar.shots, []), null);
  const playing = mkHole('r', 1, 4, [['tee', 'fairway'], ['putt', 'holed']]);
  assert.equal(holeFacts({ ...playing.hole, status: 'playing' }, playing.shots, []), null);
  // ยกลูก (กิมมี่) นับได้แม้ไม่มีช็อตที่ลงหลุม
  const gimme = mkHole('r', 1, 4, [['tee', 'fairway'], ['approach', 'green'], ['putt', 'green']], { finish: 'picked_up' });
  assert.ok(holeFacts(gimme.hole, gimme.shots, []));
  // ช็อตที่ไม่นับไม่รวมในสกอร์
  const nc = mkHole('r', 1, 4, [['tee', 'fairway'], ['approach', 'green'], ['putt', 'green'], ['putt', 'holed']]);
  nc.shots.push({ ...nc.shots[0], id: 'x', sequence: 5, counted: false });
  assert.equal(holeFacts(nc.hole, nc.shots, []).total, 4);
});

// รอบจำลอง 18 หลุมของนักกอล์ฟระดับ 80 กลาง ๆ
function sampleRound(roundId, date) {
  const T = {
    par: () => [4, [['tee', 'fairway', { club_id: 'D' }], ['approach', 'green'], ['putt', 'green'], ['putt', 'holed']]],
    miss: () => [4, [['tee', 'rough', { club_id: 'D', direction: 'right' }], ['approach', 'fringe', { distance_result: 'short', direction: 'right' }], ['chip', 'green'], ['putt', 'green'], ['putt', 'holed']]],
    three: () => [4, [['tee', 'fairway', { club_id: '3W' }], ['approach', 'green'], ['putt', 'green', { distance_result: 'short', distance_before: 12, distance_unit: 'm' }], ['putt', 'green'], ['putt', 'holed']]],
    ob: () => [3, [['tee', 'other', { club_id: 'I7' }], ['tee', 'green', { club_id: 'I7' }], ['putt', 'green'], ['putt', 'holed']], { pens: [[0, 1, 'ob_lost']] }],
    save: () => [5, [['tee', 'fairway', { club_id: 'D' }], ['approach', 'fairway'], ['approach', 'fringe'], ['chip', 'green'], ['putt', 'holed']]],
  };
  const order = [...Array(4).fill('par'), ...Array(6).fill('miss'), ...Array(4).fill('three'), ...Array(2).fill('ob'), ...Array(2).fill('save')];
  const holes = order.map((k, i) => {
    const [par, spec, opt] = T[k]();
    return mkHole(roundId, i + 1, par, spec, opt);
  });
  return { round: { id: roundId, played_at: date, status: 'complete', shot_logging: true, course_name_snapshot: 'ทดสอบ' }, holes };
}

function dataset(extraRounds = []) {
  const all = [sampleRound('r1', '2026-09-01'), ...extraRounds];
  const holesBy = new Map(), shotsBy = new Map(), pensBy = new Map();
  for (const { round, holes } of all) {
    holesBy.set(round.id, holes.map((h) => h.hole));
    for (const h of holes) { shotsBy.set(h.hole.id, h.shots); pensBy.set(h.hole.id, h.penalties); }
  }
  return {
    rounds: all.map((x) => x.round),
    holesOf: (rid) => holesBy.get(rid) ?? [],
    shotsOf: (hid) => shotsBy.get(hid) ?? [],
    penaltiesOf: (hid) => pensBy.get(hid) ?? [],
    clubLabel: (cid) => ({ D: 'Driver', '3W': '3W', I7: 'I7' }[cid] ?? null),
    clubOf: (cid) => ({ D: { id: 'D', label: 'Driver', category: 'driver' }, '3W': { id: '3W', label: '3W', category: 'wood' }, I7: { id: 'I7', label: 'I7', category: 'iron' } }[cid] ?? null),
  };
}

test('วิเคราะห์ทั้งรอบ: สโตรกเกินพาร์ต่อ 18 หลุม สถิติหลัก และลำดับจุดที่ควรแก้', () => {
  const a = analyzeGame(dataset(), '90');
  assert.equal(a.shot.holes, 18);
  const L = Object.fromEntries(a.leaks.map((l) => [l.k, l.yours]));
  assert.deepEqual(L, { pen: 2, long: 2, miss: 8, short: 0, putt: 4, save: 2 });
  assert.equal(a.shot.overShots, 14);
  assert.equal(a.avgScore, 86);
  const S = Object.fromEntries(a.stats.map((s) => [s.k, s.yours]));
  assert.equal(S.fir, 62.5);
  assert.equal(S.gir, 8);
  assert.equal(S.putts, 38);
  assert.equal(S.three, 4);
  assert.equal(S.scramble, 20);
  assert.equal(S.pen, 2);
  // เป้าต่ำกว่า 90: พัตเกิน 2 เกินงบ 2 สโตรก ได้คืนน้อยกว่างบ 1 สโตรก
  assert.deepEqual(a.ranked.map((l) => [l.k, l.gap]), [['putt', 2], ['save', 1]]);
  assert.equal(a.focus[0].k, 'putt');
  assert.match(a.focus[0].cue.text, /เลยหลุม/, 'พัตที่ไม่ลงออกสั้นเป็นส่วนใหญ่');
  assert.ok(a.focus[0].find.some((x) => x.includes('6 ม.ขึ้นไป')));
  assert.ok(a.cues.length >= 2 && a.cues.length <= 3);
  assert.deepEqual(a.plan.items.map((d) => d.id), ['putt-ladder', 'putt-circle', 'short-updown']);
  assert.deepEqual(a.plan.basis, ['พัตเกิน 2 ครั้ง', 'สโตรกที่ได้คืน']);
});

test('เป้าต่างกันให้จุดที่ควรแก้ต่างกัน และถึงเป้าแล้วไม่มีเรื่องที่ต้องแก้', () => {
  const a80 = analyzeGame(dataset(), '80');
  assert.equal(a80.ranked[0].k, 'putt');
  assert.ok(a80.ranked.some((l) => l.k === 'pen'), 'เป้าต่ำกว่า 80 ลูกโทษ 2 เกินงบ 1');
  const a110 = analyzeGame(dataset(), '110');
  assert.equal(a110.ranked.length, 0);
  assert.ok(a110.plan.items.length >= 3, 'ไม่มีเรื่องเร่งด่วนก็ยังมีแผนเริ่มต้น');
});

test('ปัญหาช็อตเข้ากรีนพลาดสั้น → เสนอเลือกไม้ยาวขึ้น', () => {
  const a = analyzeGame(dataset(), 'par');
  const miss = a.focus.find((f) => f.k === 'miss');
  assert.ok(miss, JSON.stringify(a.ranked.map((l) => l.k)));
  assert.match(miss.cue.text, /ยาวขึ้น 1 เบอร์/);
  assert.ok(miss.find.some((x) => x.includes('ขวา')), 'พลาดขวาทุกครั้ง');
});

test('ลูกโทษจากทีออฟ → เสนอไม้ทีออฟที่ออกแฟร์เวย์บ่อยกว่า', () => {
  // เพิ่มรอบที่ติด OB จากไดรเวอร์บ่อย ๆ แต่ 3W ออกแฟร์เวย์ดี
  const r2 = { round: { id: 'r2', played_at: '2026-09-02', status: 'complete', shot_logging: true, course_name_snapshot: 'ทดสอบ' }, holes: [] };
  for (let i = 0; i < 18; i++) {
    const obHole = i % 3 === 0;
    const club = obHole || i % 3 === 1 ? 'D' : '3W';
    const spec = obHole
      ? [['tee', 'other', { club_id: club }], ['tee', 'fairway', { club_id: club }], ['approach', 'green'], ['putt', 'green'], ['putt', 'holed']]
      : [['tee', club === '3W' ? 'fairway' : 'rough', { club_id: club }], ['approach', 'green'], ['putt', 'green'], ['putt', 'holed']];
    r2.holes.push(mkHole('r2', i + 1, 4, spec, obHole ? { pens: [[0, 2, 'ob_lost']] } : {}));
  }
  const a = analyzeGame(dataset([r2]), '80');
  // ลูกโทษทั้งหมดมาจากทีออฟ → รวมเป็นเรื่อง "ทีออฟ / ไดรเวอร์" เรื่องเดียว
  assert.equal(a.focus.find((f) => f.k === 'pen'), undefined, 'ไม่แสดงลูกโทษซ้ำ');
  const tee = a.focus.find((f) => f.k === 'tee');
  assert.ok(tee);
  assert.equal(a.focus[0].k, 'tee', 'เสียมากที่สุด');
  assert.match(tee.cue.text, /3W แทนไดรเวอร์/);
  assert.ok(tee.find.some((x) => x.includes('OB/ลูกหาย')), 'เก็บสาเหตุของลูกโทษไว้');
  assert.ok(tee.find.some((x) => /^ไดรเวอร์ \d+ หลุม ลงแฟร์เวย์/.test(x)));
  assert.ok(a.plan.items.some((d) => d.id === 'tee-club-test'));
  assert.match(a.cues[1].text, /^หลุมที่ยังใช้ไดรเวอร์/, 'โฟกัสรอบหน้าบอกทั้งไม้ที่ควรใช้และวิธีเล็ง');

  // ไม่ส่งข้อมูลไม้ (มีแค่ชื่อ) ยังวิเคราะห์ได้ เพียงแต่แยกไดรเวอร์ไม่ได้ → เหลือเรื่องลูกโทษตามเดิม
  const { clubOf, ...noCat } = dataset([r2]);
  assert.ok(clubOf);
  const b = analyzeGame(noCat, '80');
  assert.ok(b.focus.some((f) => f.k === 'tee' || f.k === 'pen'));
});

test('รอบจดเร็วนับเฉพาะสกอร์ ไม่นำมาแยกรายช็อต และรอบที่กำลังเล่นไม่นับ', () => {
  const quick = { round: { id: 'q1', played_at: '2026-09-10', status: 'complete', shot_logging: false, course_name_snapshot: 'จดเร็ว' }, holes: [] };
  for (let i = 0; i < 18; i++) {
    quick.holes.push({ hole: { id: id('qh'), round_id: 'q1', number: i + 1, par: 4, status: 'done', group_scores: { me: i < 10 ? 5 : 6 } }, shots: [], penalties: [] });
  }
  const playing = sampleRound('p1', '2026-09-20');
  playing.round.status = 'playing';
  const a = analyzeGame(dataset([quick, playing]), '90');
  assert.equal(a.scoreRounds.length, 2);
  assert.equal(a.avgScore, (86 + 98) / 2);
  assert.equal(a.shot.holes, 18, 'รอบจดเร็วและรอบที่กำลังเล่นไม่เข้าการแยกรายช็อต');
  const blow = a.stats.find((s) => s.k === 'blow').yours;
  assert.equal(blow, ((2 + 8) * 18) / 36, 'ดับเบิ้ลขึ้นไป: 2 หลุมจากรอบรายช็อต + 8 หลุมจากรอบจดเร็ว');
});

test('ไม่มีข้อมูลเลยก็ยังได้แผนเริ่มต้นตามเป้า', () => {
  const a = analyzeGame({ rounds: [], holesOf: () => [], shotsOf: () => [], penaltiesOf: () => [] }, null);
  assert.equal(a.goal.v, '100');
  assert.equal(a.avgScore, null);
  assert.equal(a.shot.confidence, 'none');
  assert.equal(a.focus.length, 0);
  assert.equal(a.plan.items.length, 3);
});

test('ประวัติแบบฝึก: เฉพาะที่มีจำนวนลูก เรียงใหม่สุดก่อน', () => {
  const practice = [
    { drill_id: 'putt-circle', date: '2026-09-01', attempts: 8, successes: 5 },
    { drill_id: 'putt-circle', date: '2026-09-05', attempts: 8, successes: 7 },
    { drill_id: 'putt-circle', date: '2026-09-03', attempts: null },
    { drill_id: 'putt-ladder', date: '2026-09-06', attempts: 9, successes: 4 },
  ];
  assert.deepEqual(drillHistory(practice, 'putt-circle').map((p) => p.successes), [7, 5]);
  const plan = buildPlan([], goalOf('80'), practice);
  assert.equal(plan.items.find((d) => d.id === 'putt-circle').history.length, 2);
});

test('รหัสแบบฝึกทุกตัวที่อ้างถึงในโค้ชมีอยู่จริง และแบบฝึกมีข้อมูลครบ', () => {
  const src = readFileSync(new URL('../js/coach.js', import.meta.url), 'utf8');
  const ids = new Set([...src.matchAll(/'([a-z]+(?:-[a-z]+)+)'/g)].map((m) => m[1]));
  for (const x of ids) assert.ok(drill(x), `ไม่พบแบบฝึก ${x}`);
  for (const d of DRILLS) {
    assert.ok(d.name && d.why && d.pass && d.area, d.id);
    assert.ok(d.steps.length >= 3 && d.attempts > 0 && d.minutes > 0, d.id);
  }
  assert.equal(new Set(DRILLS.map((d) => d.id)).size, DRILLS.length);
});
