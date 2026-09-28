// ทดสอบการรวมผลเครื่องซ้อมเข้ากับแผนซ้อมและหน้าโค้ช
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, simCue, analyzeGame, goalOf } from '../js/coach.js';
import { simSummary, compareDistances, launchMetrics, clubStats, sessionShots } from '../js/launch.js';

const BAG = [{ id: 'd', label: 'D', category: 'driver' }, { id: 'i7', label: 'I7', category: 'iron' }];
const clubOf = (id) => BAG.find((c) => c.id === id) ?? null;
// SHOT_COLS: club, cs, bs, sf, la, ld, spin, carry, cdev, total, aa, path, face, f2p
const shot = (club, i, f2p, carry) => [club, 40, 50 + i / 10, 1.35, 15, -3, 4500, carry + (i % 5), 5, carry + 10, 2, -10, -3, f2p + (i % 3) / 10];
const session = (date, sig, f2p, n = 12) => ({
  id: sig, kind: 'launch', date,
  launch: { sig, clubs: { '7 Iron': 'i7', Driver: 'd' }, shots: [...Array.from({ length: n }, (_, i) => shot('7 Iron', i, f2p, 137)), ...Array.from({ length: n }, (_, i) => shot('Driver', i + 50, f2p, 175))] },
});

const curve = { k: 'curve', dir: 'right', th: 'ลูกโค้งขวา (สไลซ์/เฟด)', detail: ['Face to Path เฉลี่ย +7.4°'], drills: ['sim-face-path'] };
const driverIssue = { k: 'driver', th: 'ไดรเวอร์สปินสูง', detail: ['สปิน 4576'], drills: ['sim-driver-launch', 'sim-face-path'] };
const focus = [{ th: 'พัตเกิน 2 ครั้ง', drills: ['putt-ladder', 'putt-circle'] }, { th: 'พลาดกรีน', drills: ['approach-ladder'] }];

test('แผนซ้อม: รวมแบบฝึกจากเครื่องซ้อมเป็นแบบฝึกที่ 2 และบอกที่มา', () => {
  const g = goalOf('90');
  const courseOnly = buildPlan(focus, g, []);
  assert.deepEqual(courseOnly.items.map((d) => d.id), ['putt-ladder', 'putt-circle', 'approach-ladder']);
  const both = buildPlan(focus, g, [], [curve, driverIssue]);
  assert.deepEqual(both.items.map((d) => d.id), ['putt-ladder', 'sim-face-path', 'putt-circle', 'approach-ladder']);
  assert.deepEqual(both.items.map((d) => d.fromSim), [false, true, false, false]);
  assert.deepEqual(both.basis, ['พัตเกิน 2 ครั้ง', 'พลาดกรีน', 'ลูกโค้งขวา (สไลซ์/เฟด) (จากเครื่องซ้อม)']);
  // ไม่มีข้อมูลออกรอบ: เครื่องซ้อมนำ แล้วเติมแผนเริ่มต้น
  const simOnly = buildPlan([], g, [], [curve, driverIssue]);
  assert.deepEqual(simOnly.items.map((d) => d.id), ['sim-face-path', 'sim-driver-launch', 'putt-ladder', 'short-updown']);
  assert.equal(buildPlan([], g, []).items[0].id, 'putt-ladder');
  // แบบฝึกที่ไม่มีในคลังถูกข้าม
  assert.ok(buildPlan([], g, [], [{ th: 'x', drills: ['no-such-drill'] }]).items.every((d) => d.id));
});

test('โฟกัสรอบหน้าจากเครื่องซ้อม: ลูกโค้งขวาตั้งทีฝั่งขวาเล็งซ้าย · ลูกโค้งซ้ายกลับกัน', () => {
  assert.match(simCue([curve]).text, /ฝั่งขวา.*ขอบซ้าย/);
  assert.match(simCue([{ ...curve, dir: 'left' }]).text, /ฝั่งซ้าย.*ขอบขวา/);
  assert.equal(simCue([driverIssue]), null);
  assert.equal(simCue(), null);
  const a = analyzeGame({ rounds: [], holesOf: () => [], shotsOf: () => [], penaltiesOf: () => [], simIssues: [curve] }, '90');
  assert.equal(a.cues.at(-1).src, 'sim');
  assert.equal(a.plan.items[0].id, 'sim-face-path');
});

test('สรุปเครื่องซ้อม: ใช้เฉพาะ 60 วันล่าสุด และติดตามค่าของปัญหาอันดับ 1 รายครั้ง', () => {
  assert.equal(simSummary([], clubOf, { today: '2026-09-28' }), null);
  const old = simSummary([session('2026-05-01', 's0', 8)], clubOf, { today: '2026-09-28' });
  assert.equal(old.stale, true);
  assert.equal(old.lastDate, '2026-05-01');
  const s = simSummary([session('2026-05-01', 's0', 12), session('2026-08-28', 's1', 9), session('2026-09-20', 's2', 6)], clubOf, { today: '2026-09-28' });
  assert.equal(s.stale, false);
  assert.equal(s.sessions, 2, 'ไม่นับเซสชันที่เก่ากว่า 60 วัน');
  assert.equal(s.top.k, 'curve');
  assert.deepEqual(s.history.map((x) => x.date), ['2026-08-28', '2026-09-20']);
  assert.ok(s.history[0].value > s.history[1].value, 'Face to Path ลดลง');
  const m = launchMetrics(clubStats(sessionShots(session('2026-09-20', 's2', 6)), clubOf));
  assert.ok(Math.abs(m.f2p - 6.1) < 0.2 && m.mishit === 0);
});

test('เทียบระยะในสนามกับเครื่องซ้อม', () => {
  const gps = [{ club_id: 'i7', label: 'I7', median: 125, n: 5 }, { club_id: 'd', label: 'D', median: 180, n: 2 }, { club_id: 'i9', label: 'I9', median: 100, n: 4 }];
  const sim = [{ clubId: 'i7', median: 130, total: 140 }, { clubId: 'd', median: 175, total: 190 }];
  const c = compareDistances(gps, sim);
  assert.deepEqual(c.rows.map((r) => [r.label, r.course, r.sim, r.diff]), [['I7', 125, 140, -15]], 'ต้องมี GPS ≥ 3 ครั้งและข้อมูลเครื่องซ้อม');
  assert.ok(Math.abs(c.avgPct + 15 / 140) < 1e-9);
  assert.equal(compareDistances([], sim).avgPct, null);
});
