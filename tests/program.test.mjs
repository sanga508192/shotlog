// ทดสอบโปรแกรมโค้ชในแอป: แบ่งเวลาซ้อมตามสโตรกที่เสีย · ซ้อม 3 ครั้งต่อสัปดาห์ · เกมออกรอบจำลอง
import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceSplit, weekSessions, WEEK_MINUTES } from '../js/coach.js';
import { buildGame, passText, DEFAULT_NINE } from '../js/simgame.js';

const YD = 0.9144;
const sum = (rows) => rows.reduce((a, r) => a + r.pct, 0);

test('แบ่งเวลาซ้อม: รวม 100% · ทุกหมวดอย่างน้อย 15% · หมวดที่เสียมากได้เวลามากสุด', () => {
  const sg = { holesComplete: 18, cats: [{ k: 'tee', diff: -3 }, { k: 'approach', diff: -1 }, { k: 'short', diff: 0.5 }, { k: 'putt', diff: -0.5 }] };
  const a = practiceSplit({ sg });
  assert.equal(a.basis, 'sg');
  assert.equal(sum(a.rows), 100);
  assert.ok(a.rows.every((r) => r.pct >= 15));
  assert.equal([...a.rows].sort((x, y) => y.pct - x.pct)[0].k, 'tee');
  assert.equal(a.rows.reduce((t, r) => t + r.minutes, 0), WEEK_MINUTES);
  // ไม่มี SG ใช้ที่มาของสโตรก · ลูกโทษกับช็อตยาวรวมเป็นทีออฟ
  const b = practiceSplit({ leaks: [{ k: 'pen', gap: 2 }, { k: 'long', gap: 1 }, { k: 'putt', gap: 1 }] });
  assert.equal(b.basis, 'leaks');
  assert.ok(b.rows.find((r) => r.k === 'tee').pct > b.rows.find((r) => r.k === 'putt').pct);
  // ไม่มีข้อมูลเลย → เท่ากัน · มีแต่เครื่องซ้อม → เพิ่มน้ำหนักทีออฟ
  assert.deepEqual(practiceSplit({}).rows.map((r) => r.pct), [25, 25, 25, 25]);
  const c = practiceSplit({ simLong: true });
  assert.equal(c.basis, 'sim');
  assert.equal(c.rows[0].pct, 55);
  const s = weekSessions(c, { hasSim: true });
  assert.equal(s.length, 3);
  assert.match(s[0].text, /แผนแก้ไข/);
  assert.equal(s[1].link, '#/sim-game');
});

const row = (label, category, yd) => ({ club_id: label, label, category, median: yd * YD, p25: (yd - 10) * YD, p75: (yd + 10) * YD, n: 10 });
const BAG = [row('D', 'driver', 192), row('3W', 'wood', 189), row('5H', 'hybrid', 175), row('I7', 'iron', 140), row('PW', 'wedge', 110), row('SW', 'wedge', 85)];

test('เกมออกรอบจำลอง: ทุกหลุมมีทีออฟและช็อตจนเหลือไม่เกิน 30 หลา · พาร์ 5 มีวางลูก · ไม่มีระยะไม้ไม่สร้างเกม', () => {
  const game = buildGame({ holes: DEFAULT_NINE, clubs: BAG, missSide: 'right' });
  assert.equal(game.length, 9);
  assert.equal(game[0].shots[0].club.label, '3W', 'ใช้แผนทีออฟ: ไดรเวอร์ไกลกว่าไม้ 3 นิดเดียว');
  assert.match(game[0].shots[0].aim, /ตั้งทีฝั่งขวา/);
  const p3 = game.find((h) => h.par === 3);
  assert.equal(p3.shots.length, 1);
  assert.ok(Math.abs(p3.shots[0].target - p3.lengthM) < 1e-6);
  const p5 = game.find((h) => h.par === 5);
  assert.ok(p5.shots.some((s) => s.kind === 'layup'));
  for (const h of game) {
    const reach = h.shots.reduce((a, s, i) => a + (s.target ?? (h.shots[i].club.total ?? h.shots[i].club.median)), 0);
    assert.ok(h.lengthM - reach <= 30 * YD + 1, `หลุม ${h.n} เหลือ ${(h.lengthM - reach) / YD}`);
  }
  assert.match(passText(game[0].shots[0], (m) => `${Math.round(m / YD)} หลา`), /^ลงแฟร์เวย์: เบี่ยงไม่เกิน 18 หลา/);
  assert.equal(p3.shots[0].club.label, '5H', 'ไม้ที่ระยะใกล้ 160 หลาที่สุด');
  assert.match(passText(p3.shots[0], (m) => `${Math.round(m / YD)} หลา`), /ไม่เกิน 13 หลา และเบี่ยงไม่เกิน 15 หลา/);
  assert.deepEqual(buildGame({ holes: DEFAULT_NINE, clubs: [] }), []);
});

test('เกม/แผนทีออฟ: ไม่มีไม้ที่ระยะใกล้เคียง → บอกระยะที่ต้องการแทนการเดาไม้ (มีแค่ระยะไดรเวอร์กับไม้ 3)', async () => {
  const { clubFor } = await import('../js/strategy.js');
  const two = [row('D', 'driver', 192), row('3W', 'wood', 189)];
  const game = buildGame({ holes: DEFAULT_NINE, clubs: two });
  const shortApproach = game.flatMap((h) => h.shots).find((s) => s.kind === 'approach' && s.target < 160 * YD);
  assert.equal(shortApproach.club.generic, true, 'ไม่มีไม้ไหนใกล้ระยะนี้');
  assert.match(shortApproach.club.label, /^ไม้ที่ได้ระยะ \d+ หลา$/);
  assert.ok(game.every((h) => h.shots.slice(1).every((s) => s.club.label !== 'D')), 'ช็อตที่สองไม่ใช้ไดรเวอร์');
  assert.ok(game.every((h) => h.shots.every((s) => s.club.label !== '3W' || s.kind !== 'approach' || Math.abs(s.target - s.club.median) <= Math.max(12, s.target * 0.12))));
  assert.equal(clubFor(150 * YD, BAG).label, 'I7');
  assert.equal(clubFor(60 * YD, two).category, 'wedge');
});
