// ทดสอบการวิเคราะห์ละเอียดจากเครื่องซ้อม (ข้อมูลสังเคราะห์ที่จำลองลักษณะวงสวิงแบบ pull-slice ไม่ใช่ไฟล์จริงของผู้ใช้)
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSuspect, shapeOf, shapeTerm, shapeTh, clubMetrics, driverPotential, compareLast, launchReport, groupOf } from '../js/launchreport.js';
import { launchIssues, clubStats } from '../js/launch.js';

const MPH = 0.44704, YD = 0.9144;
// ช็อตในหน่วย SI แบบที่ sessionShots คืนมา
const shot = (raw, i, o) => ({
  raw, clubId: null, date: '2026-08-28', sid: 's2', cs: 98 * MPH, bs: 130 * MPH, sf: 1.34, la: 16, ld: -4, spin: 4500,
  carry: (190 + (i % 7)) * YD, cdev: -8 * YD, total: 205 * YD, aa: 4, path: -11, face: -3, f2p: 7.5 + (i % 3) / 10, ...o,
});
const driver = (n, o = {}) => Array.from({ length: n }, (_, i) => shot('ไดรเวอร์', i, o));
const iron7 = (n, o = {}) => Array.from({ length: n }, (_, i) => shot('เหล็ก 7', i, {
  cs: 80 * MPH, bs: 106 * MPH, sf: 1.32, la: 18, ld: -0.5, spin: 6500, carry: (150 + (i % 5)) * YD, cdev: 2 * YD, aa: -3.5, path: -2, face: -1, f2p: 0.5, ...o,
}));

test('ช็อตที่น่าจะจดผิดไม้: เหล็กที่ความเร็วหัวไม้เท่าไดรเวอร์ไม่นำมาคิด', () => {
  const mislabeled = Array.from({ length: 6 }, (_, i) => shot('เหล็ก 5', i, { carry: null }));
  const real5 = Array.from({ length: 4 }, (_, i) => shot('เหล็ก 5', i, { cs: 86 * MPH, bs: 112 * MPH, sf: 1.3, carry: 160 * YD }));
  const { keep, suspects } = splitSuspect([...driver(8), ...mislabeled, ...real5, ...iron7(6)]);
  assert.deepEqual(suspects.map((s) => [s.label, s.n, s.of]), [['เหล็ก 5', 6, 10]]);
  assert.equal(keep.length, 8 + 4 + 6);
  assert.ok(Math.abs(suspects[0].cs / MPH - 98) < 0.5);
  // ไม่มีไดรเวอร์พอเทียบ → ไม่ตัดอะไร
  assert.equal(splitSuspect([...driver(3), ...mislabeled]).suspects.length, 0);
  // ช็อตที่ตีพลาด (Smash < 1) ไม่นับเป็นจดผิดไม้
  assert.equal(splitSuspect([...driver(8), shot('เหล็ก 7', 0, { sf: 0.8 })]).suspects.length, 0);
});

test('ลักษณะลูก: ทิศออกตัวกับการโค้ง และชื่อสากลตามมือที่ถนัด', () => {
  const sh = shapeOf({ ld: -4, f2p: 8 });
  assert.deepEqual(sh, { start: 'L', curve: 'RR' });
  assert.equal(shapeTerm(sh, 'right'), 'Pull-slice');
  assert.equal(shapeTerm(sh, 'left'), 'Push-hook', 'ถนัดซ้ายสลับด้าน');
  assert.equal(shapeTh(sh), 'ออกซ้าย แล้วโค้งขวามาก');
  assert.equal(shapeTerm({ start: 'C', curve: 'C' }), 'Straight');
  assert.equal(shapeTerm({ start: 'C', curve: 'R' }), 'Fade');
  assert.equal(shapeTerm({ start: 'R', curve: 'C' }), 'Push');
  assert.equal(shapeOf({ ld: null, f2p: 2 }), null);
});

test('ตัวเลขเทียบเป้าตามประเภทไม้: ไดรเวอร์ต้องตีขึ้น เหล็กต้องตีกดลง', () => {
  const [d] = clubStats(driver(10));
  const m = Object.fromEntries(clubMetrics(d).map((x) => [x.k, x.status]));
  assert.equal(groupOf(d), 'driver');
  assert.deepEqual([m.sf, m.f2p, m.path, m.spin, m.aa], ['far', 'far', 'far', 'far', 'ok']);
  const [i7] = clubStats(iron7(8, { aa: 3 }));
  assert.equal(groupOf(i7), 'midIron');
  const mi = Object.fromEntries(clubMetrics(i7).map((x) => [x.k, x.status]));
  assert.equal(mi.aa, 'far', 'เหล็กตีขึ้น +3° ผิด');
  assert.equal(mi.f2p, 'ok');
  assert.equal(groupOf({ label: 'เหล็ก 4', category: null }), 'longIron');
  assert.equal(groupOf({ label: 'PW', category: 'wedge' }), 'wedge');
});

test('ระยะไดรเวอร์ที่ได้คืน: จากการตีกลางหน้าไม้และมุมยิง/สปิน · ไดรเวอร์ที่ดีอยู่แล้วไม่มีระยะให้ได้คืน', () => {
  const [d] = clubStats(driver(10));
  const p = driverPotential(d);
  assert.ok(p.launchGain / YD > 10 && p.launchGain / YD < 25, `มุมยิง/สปิน ${p.launchGain / YD}`);
  assert.ok(p.strikeGain / YD > 10 && p.strikeGain / YD < 25, `กลางหน้าไม้ ${p.strikeGain / YD}`);
  const [good] = clubStats(driver(10, { sf: 1.45, bs: 142 * MPH, carry: 228 * YD, spin: 2600 }));
  assert.ok(driverPotential(good).total / YD < 5);
  assert.equal(driverPotential(null), null);
});

test('เทียบครั้งก่อน และสรุป: pull-slice ของไม้ยาว เหล็กสั้นตรงกว่า ไดรเวอร์ไกลลดลง', () => {
  const rec = (sig, date, shots) => ({ id: sig, kind: 'launch', date, launch: { v: 1, sig, cols: ['club', 'cs', 'bs', 'sf', 'la', 'ld', 'spin', 'carry', 'cdev', 'total', 'aa', 'path', 'face', 'f2p'],
    shots: shots.map((s) => [s.raw, s.cs, s.bs, s.sf, s.la, s.ld, s.spin, s.carry, s.cdev, s.total, s.aa, s.path, s.face, s.f2p]) } });
  const before = rec('a', '2025-09-23', [...driver(10, { sf: 1.42, bs: 141 * MPH, carry: 230 * YD, path: -7.5, f2p: 5 }), ...iron7(8)]);
  const after = rec('b', '2026-08-28', [...driver(12), ...iron7(8)]);
  const cmp = compareLast([before, after]);
  const d = cmp.rows.find((r) => r.label === 'ไดรเวอร์');
  assert.ok(d.carry / YD < -35, `${d.carry / YD}`);
  assert.ok(d.sf < -0.07 && d.path < -3);

  const rep = launchReport([...driver(12), ...iron7(8)], () => null, { practice: [before, after] });
  const texts = rep.headline.map((h) => h.text).join('\n');
  assert.match(texts, /ไม้ยาว \(ไดรเวอร์\): ลูกโค้งขวา 100% ส่วนใหญ่ออกซ้าย แล้วโค้งขวามาก \(Pull-slice\)/);
  assert.match(texts, /แนวสวิงตัดจากนอกเข้าใน/);
  assert.match(texts, /เหล็กสั้นตรงกว่าไม้ยาวมาก/);
  assert.match(texts, /ไดรเวอร์ได้ระยะลอยเพิ่มได้ราว/);
  assert.match(texts, /ไดรเวอร์ ไกลน้อยลง \d+ หลา จากครั้งก่อน/);
});

test('ข้อควรแก้: ออกซ้ายแล้วโค้งขวาเป็นข้อเดียว ไม่แยกเป็น "ลูกออกซ้าย" อีกข้อ', () => {
  const issues = launchIssues(clubStats([...driver(12), ...iron7(8, { ld: -4, f2p: 6, path: -9 })]));
  assert.ok(issues.some((i) => i.k === 'curve'));
  assert.ok(!issues.some((i) => i.k === 'start'), issues.map((i) => i.k).join(','));
  assert.ok(issues.find((i) => i.k === 'curve').detail.some((x) => x.includes('อาการเดียวกัน')));
  // ออกขวาเฉย ๆ ไม่โค้ง → ยังเป็นข้อลูกออกตัว
  const push = launchIssues(clubStats(iron7(12, { ld: 4, f2p: 0.5, path: 3 })));
  assert.ok(push.some((i) => i.k === 'start'));
});

test('ไดรเวอร์ตีขึ้นอยู่แล้วแต่ลูกโด่ง: ไม่แนะนำให้ตีเสยเพิ่ม · บอกว่าโด่งเพราะสปิน', () => {
  const issues = launchIssues(clubStats(driver(12)));   // มุมเข้าหาลูก +4° สปิน 4,500 แนวสวิง −11°
  const d = issues.find((i) => i.k === 'driver');
  assert.equal(d.th, 'ไดรเวอร์สปินสูง ลูกโด่ง เสียระยะ');
  assert.ok(!d.drills.includes('sim-driver-launch'), d.drills.join(','));
  assert.deepEqual(d.drills, ['sim-path-in', 'sim-driver-spin', 'driver-strike']);
  assert.ok(d.detail[0].includes('ตีขึ้นอยู่แล้ว'));
  // ตีกดลงจริง → ยังแนะนำให้ตีขึ้น
  const down = launchIssues(clubStats(driver(12, { aa: -3, path: 0, f2p: 0.5 }))).find((i) => i.k === 'driver');
  assert.deepEqual(down.drills, ['sim-driver-launch']);
});

test('แผนแก้ไข: เรียงจากต้นเหตุ เป้าเลื่อนทีละขั้น และบอกว่าผ่านเป้าครั้งก่อนไหม', async () => {
  const { fixPlan, planText, bestWorst } = await import('../js/launchreport.js');
  const rec = (sig, date, shots) => ({ id: sig, kind: 'launch', date, launch: { v: 1, sig, cols: ['club', 'cs', 'bs', 'sf', 'la', 'ld', 'spin', 'carry', 'cdev', 'total', 'aa', 'path', 'face', 'f2p'],
    shots: shots.map((s) => [s.raw, s.cs, s.bs, s.sf, s.la, s.ld, s.spin, s.carry, s.cdev, s.total, s.aa, s.path, s.face, s.f2p]) } });
  const irons = iron7(8, { aa: 2.5 });   // เหล็กตีขึ้น
  const before = rec('a', '2026-08-01', [...driver(10, { path: -12 }), ...irons]);
  const after = rec('b', '2026-08-28', [...driver(10, { path: -7.5 }), ...irons]);
  const shots = [...driver(10, { path: -7.5 }), ...irons];
  const rep = launchReport(shots, () => null, { practice: [before, after] });
  const plan = fixPlan(rep, { practice: [before, after] });
  assert.deepEqual(plan.steps.map((s) => s.k), ['path', 'strike', 'iron']);
  const p = plan.steps[0].metric;
  assert.equal(p.lastTarget, -8, 'เป้าครั้งนี้คิดจากครั้งก่อน (−12 → −8)');
  assert.equal(p.passed, true, 'แนวสวิงลดเหลือ −7.5 ผ่านเป้า −8');
  assert.equal(p.next, -4, 'เป้าครั้งหน้าเลื่อนอีก 4°');
  assert.ok(plan.steps[0].why.includes('ปิดกับเป้า'), 'หน้าไม้ปิดและลูกออกซ้ายจริง → เตือนไม่ให้แก้ด้วยกริป strong');
  assert.ok(plan.steps[1].why.includes('ตีขึ้นอยู่แล้ว'));
  assert.equal(plan.steps[1].drill, 'sim-driver-spin');
  assert.ok(plan.steps[2].why.includes('ตรงข้ามกับไดรเวอร์'));
  assert.equal(plan.session.reduce((a, x) => a + x.balls, 0), 10 + 20 + 15 + 15 + 5);
  // ถนัดซ้าย: สลับซ้าย/ขวาในคำแนะนำ
  const lefty = fixPlan(launchReport(driver(10, { path: 9, face: 3, ld: 4, f2p: -7 }), () => null, { hand: 'left' }), { hand: 'left' });
  assert.ok(lefty.steps[0].cues.some((c) => c.includes('ทิศ 11 นาฬิกา')));
  // ข้อความสำหรับคัดลอก
  const text = planText(rep, plan, { drillName: (id) => id });
  assert.match(text, /📊 สรุป/);
  assert.match(text, /🏌️ แผนแก้ไข/);
  assert.match(text, /เป้าครั้งหน้า: แนวสวิง/);
  // ลูกดีสุด/เสียมากสุด ไม่เลือกลูกที่วัดผิด (ระยะต่ำกว่า 60% ของค่ากลาง)
  const spread = Array.from({ length: 8 }, (_, i) => shot('ไดรเวอร์', i, { carry: (170 + i * 8) * YD }));
  const bw = bestWorst([...spread, shot('ไดรเวอร์', 0, { carry: 80 * YD, sf: 1.37 })]);
  assert.equal(Math.round(bw.best.carry / YD), 226);
  assert.equal(Math.round(bw.worst.carry / YD), 170, 'ไม่ใช่ลูก 80 หลาที่น่าจะวัดผิด');
  assert.equal(bestWorst(driver(8)), null, 'ระยะต่างกันไม่ถึง 10 หลา ไม่ต้องเทียบ');
});
