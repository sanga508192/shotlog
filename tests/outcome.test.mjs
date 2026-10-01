// ทดสอบผลช็อตตามจริง: เข้าป่า ลงน้ำ OB ลูกหาย เล่นไม่ได้ · ตีใหม่จากจุดเดิม · ผลต่อสถิติ
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIES, START_LIES, OUTCOMES, PUTT_OUTCOMES, PENALTY_ENDS, RELIEFS, TROUBLE_ENDS, PENALTY_REASONS } from '../js/constants.js';
import { suggestShotType } from '../js/logic.js';
import { holeSG } from '../js/sg.js';
import { shotPath } from '../js/shotgeo.js';
import { holeFacts, teeAnalysis } from '../js/coach.js';

test('ตัวเลือกผลช็อต: มีชื่อทุกค่า ลงน้ำ/OB/หาย/เล่นไม่ได้ ไม่ใช่จุดที่ตีต่อ และมีวิธีตีต่อที่ถูกต้อง', () => {
  for (const o of OUTCOMES) assert.ok(LIES.some((l) => l.v === o.v), o.v);
  for (const v of PUTT_OUTCOMES) assert.ok(OUTCOMES.some((o) => o.v === v));
  for (const [k, pe] of Object.entries(PENALTY_ENDS)) {
    assert.ok(!START_LIES.some((l) => l.v === k), `${k} ไม่ใช่จุดที่ตีต่อ`);
    assert.ok(PENALTY_REASONS.some((r) => r.v === pe.reason));
    assert.ok(pe.reliefs.length && pe.reliefs.every((r) => RELIEFS.some((x) => x.v === r)));
    assert.ok(TROUBLE_ENDS.includes(k));
  }
  assert.ok(START_LIES.some((l) => l.v === 'trees'), 'ตีออกจากป่าได้');
  assert.equal(RELIEFS.find((r) => r.v === 'local').strokes, 2, 'กติกาท้องถิ่นดรอปข้างหน้า +2');
  assert.deepEqual(PENALTY_ENDS.ob.reliefs[0], 'rehit', 'OB ค่าเริ่มต้นตามกติกา: ตีใหม่จากจุดเดิม');
});

test('ประเภทช็อตถัดไป: เข้าป่า → แก้สถานการณ์ · OB แล้วตีใหม่จากแท่นที → ทีออฟ', () => {
  assert.equal(suggestShotType({ seq: 2, prev: { shot_type: 'tee', end_lie: 'trees' } }), 'recovery');
  assert.equal(suggestShotType({ seq: 2, prev: { shot_type: 'tee', end_lie: 'ob' }, rehit: true }), 'tee');
  assert.equal(suggestShotType({ seq: 2, prev: { shot_type: 'tee', end_lie: 'water' } }), 'approach', 'ดรอปแล้วตีเข้ากรีน');
});

const hole = (o = {}) => ({ id: 'h', number: 1, par: 4, status: 'done', finish: 'holed', distance: 380, distance_unit: 'yd', ...o });
const shot = (seq, o = {}) => ({ id: `s${seq}`, sequence: seq, counted: true, ...o });

test('Strokes Gained: OB แล้วทีออฟใหม่ ใช้ระยะหลุมของช็อตใหม่ · ตีออกจากป่าใช้ตารางแก้สถานการณ์', () => {
  const shots = [
    shot(1, { start_lie: 'tee', end_lie: 'ob', shot_type: 'tee', distance_after: 120 }),   // ระยะเหลือที่พิมพ์ไว้ต้องไม่ถูกใช้กับทีใหม่
    shot(2, { start_lie: 'tee', end_lie: 'trees', shot_type: 'tee' }),
    shot(3, { start_lie: 'trees', distance_before: 150, end_lie: 'fairway', shot_type: 'recovery' }),
    shot(4, { start_lie: 'fairway', distance_before: 60, end_lie: 'green' }),
    shot(5, { start_lie: 'green', distance_before: 3, shot_type: 'putt', holed: true, end_lie: 'holed' }),
  ];
  const pens = [{ related_shot_id_optional: 's1', strokes: 1, reason: 'ob_lost', relief: 'rehit', auto: true }];
  const r = holeSG(hole(), shots, pens);
  assert.equal(r.complete, true);
  const sg = Object.fromEntries(r.shots.map((x) => [x.shot.id, x.sg]));
  assert.ok(Math.abs(sg.s1 - -2) < 1e-9, 'ทีออฟ OB เสีย 2 สโตรกพอดี (ตีใหม่จากที่เดิม + ลูกโทษ)');
  assert.ok(sg.s2 < -0.4, 'ทีออฟเข้าป่าเสียสโตรก');
  // ลงน้ำแล้วดรอป: ช็อตถัดไปไม่ใช้ "น้ำ" เป็นจุดที่ตี
  const water = holeSG(hole(), [
    shot(1, { start_lie: 'tee', end_lie: 'water' }),
    shot(2, { distance_before: 140, end_lie: 'green' }),
  ], [{ related_shot_id_optional: 's1', strokes: 1 }]);
  assert.equal(water.shots[1].sg, null, 'ไม่รู้ว่าดรอปที่ไหน ต้องระบุจุดที่ตี');
});

test('ตำแหน่ง: ตีใหม่จากจุดเดิม ใช้จุดตีเดิม (ทีใหม่ = แท่นที)', () => {
  const tee = { lat: 14.5, lon: 101.4 };
  const shots = [shot(1, { land: { lat: 14.5017, lon: 101.4005 } }), shot(2), shot(3, { gps: { lat: 14.5018, lon: 101.4, acc: 5 } })];
  const p = shotPath(shots, tee, [{ related_shot_id_optional: 's1', relief: 'rehit' }]);
  assert.deepEqual(p[1].start, tee);
  assert.ok(p[1].dist > 150, 'ทีใหม่มีระยะถึงช็อตถัดไป');
  const drop = shotPath(shots, tee, [{ related_shot_id_optional: 's1', relief: 'drop' }]);
  assert.equal(drop[1].start, null, 'ดรอป: ไม่รู้จุดที่ตีถ้าไม่มี GPS');
});

test('โค้ชทีออฟ: นับว่าทีออฟพลาดหนักไปจบที่ไหน และไม่นับว่าลงแฟร์เวย์', () => {
  const mk = (end, pen = 0) => {
    const h = hole({ id: `h-${end}-${pen}` });
    const shots = [
      shot(1, { id: `${h.id}1`, shot_type: 'tee', start_lie: 'tee', end_lie: end }),
      shot(2, { id: `${h.id}2`, shot_type: 'approach', end_lie: 'green' }),
      shot(3, { id: `${h.id}3`, shot_type: 'putt', end_lie: 'holed', holed: true }),
    ];
    return holeFacts(h, shots, pen ? [{ related_shot_id_optional: `${h.id}1`, strokes: pen }] : []);
  };
  const facts = [mk('trees'), mk('trees'), mk('water', 1), mk('ob', 1), mk('lost', 2), mk('fairway'), mk('rough')];
  assert.equal(facts[0].fir, false, 'เข้าป่าไม่ใช่ลงแฟร์เวย์');
  assert.equal(facts[2].fir, false);
  const t = teeAnalysis(facts, {});
  assert.ok(t.find.includes('ทีออฟที่พลาดหนัก: ต้นไม้/ป่า 2 · ลงน้ำ 1 · OB 1 · ลูกหาย 1'), t.find.join('\n'));
  assert.equal(t.byResult.trouble.n, 5);
});
