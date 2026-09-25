// ทดสอบตามเกณฑ์ตรวจรับในร่างโครงการ ข้อ 9 และ 11.4
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  holeScore, roundScore, fmtToPar, summarize, suggestShotType, shiftForInsert, resequence,
  buildExport, parseImport, toCSV, rankTopics, practiceSuggestion,
} from '../js/logic.js';
import { CURATED_COURSES, searchCourses, findDuplicateCourse } from '../js/courses.js';

const round = { id: 'r1', played_at: '2026-09-25' };
const hole = { id: 'h1', round_id: 'r1', number: 1, par: 4, status: 'done' };
const D = { id: 'cD', label: 'D', category: 'driver' };
const I6 = { id: 'cI6', label: 'I6', category: 'iron' };
const SW = { id: 'cSW', label: 'SW', category: 'wedge' };
const PT = { id: 'cPT', label: 'PT', category: 'putter' };

// ตัวอย่างหลุมพาร์ 4 จากข้อ 4
const example = [
  { club: D, shot_type: 'tee', assessment: 'needs_work', direction: 'right', note: 'ลูกออกขวาเยอะ' },
  { club: I6, shot_type: 'approach', assessment: 'good', end_lie: 'fringe' },
  { club: SW, shot_type: 'chip', assessment: 'needs_work', contact: 'fat' },
  { club: SW, shot_type: 'chip', assessment: 'needs_work', target_result: 'miss', raw_distance_text: '2 คันธง' },
  { club: PT, shot_type: 'putt', assessment: null, note: 'พัตไม่กริฟ' },
  { club: PT, shot_type: 'putt', assessment: 'good', holed: true, end_lie: 'holed' },
].map((s, i) => ({
  id: `s${i + 1}`, round_id: 'r1', hole_id: 'h1', sequence: i + 1, club_id: s.club.id,
  contact: null, direction: null, distance_result: null, target_result: null, start_lie: null, counted: true, ...s,
  club: undefined,
}));
const rows = example.map((shot, i) => ({ shot, hole, round, club: [D, I6, SW, SW, PT, PT][i] }));

test('พาร์ 4 ตี 6 ไม่มีปรับ = 6 (+2); เพิ่มปรับ 1 = 7 (+3) ช็อตตีเท่าเดิม', () => {
  const a = holeScore(hole, example, []);
  assert.equal(a.total, 6);
  assert.equal(fmtToPar(a.toPar), '+2');
  const b = holeScore(hole, example, [{ strokes: 1 }]);
  assert.equal(b.total, 7);
  assert.equal(fmtToPar(b.toPar), '+3');
  assert.equal(b.strokes, 6);
  assert.equal(b.penalties, 1);
});

test('ช็อตที่ไม่นับ (เช่นลูกสำรอง) ไม่รวมสกอร์', () => {
  const shots = [...example, { id: 'x', counted: false, not_counted_reason: 'ลูกสำรอง' }];
  const s = holeScore(hole, shots, []);
  assert.equal(s.total, 6);
  assert.equal(s.notCounted, 1);
});

test('ไม่มีพาร์ → ไม่แสดงเทียบพาร์; รอบนับเทียบพาร์เฉพาะหลุมที่จบและมีพาร์', () => {
  assert.equal(holeScore({ ...hole, par: null }, example, []).toPar, null);
  const holes = [hole, { id: 'h2', number: 2, par: null, status: 'done' }, { id: 'h3', number: 3, par: 3, status: 'playing' }];
  const shotsOf = (id) => (id === 'h1' ? example : id === 'h2' ? example.slice(0, 4) : example.slice(0, 2));
  const r = roundScore(holes, shotsOf, () => []);
  assert.equal(r.total, 12);
  assert.equal(r.toPar, 2);
  assert.equal(r.holesForPar, 1);
});

test('อัตราต้องปรับไม่รวมช็อตที่ยังไม่ประเมินในตัวหาร และแสดงจำนวนที่ยังไม่ประเมิน', () => {
  const sm = summarize(rows, [hole]);
  assert.equal(sm.overall.assessed, 5);
  assert.equal(sm.overall.needs, 3);
  assert.equal(sm.overall.unassessed, 1);
  const putt = sm.byType.find((g) => g.key === 'putt');
  assert.equal(putt.assessed, 1);
  assert.equal(putt.needs, 0);
  assert.equal(putt.unassessed, 1);
});

test('หัวข้อจากตัวอย่าง: SW ชิพ ฉึก 1/1 (ยังไม่ระบุ 1), ไม่เข้าเป้า 1/1, Driver ออกขวา 1/1', () => {
  const { topics } = summarize(rows, [hole]);
  const fat = topics.find((t) => t.club_id === 'cSW' && t.value === 'fat');
  assert.deepEqual([fat.count, fat.denom, fat.unknown], [1, 1, 1]);
  assert.deepEqual(fat.shot_ids, ['s3']);
  const miss = topics.find((t) => t.club_id === 'cSW' && t.value === 'miss');
  assert.deepEqual([miss.count, miss.denom], [1, 1]);
  const right = topics.find((t) => t.club_id === 'cD' && t.value === 'right');
  assert.equal(right.label, 'D ทีออฟ — ขวา');
  // พัต “ไม่กริฟ” ยังไม่ประเมิน → ไม่ถูกจัดเป็นอาการ
  assert.ok(!topics.some((t) => t.shot_type === 'putt'));
  // จำนวนเท่ากันได้ลำดับเท่ากัน
  assert.ok(topics.every((t) => t.rank === 1));
});

test('พัตบนกรีนนับจากจุดเริ่มต้น ไม่ใช่ชื่อไม้; พัตลงไม่รวมยกลูก', () => {
  const p = summarize(rows, [hole]).putting;
  assert.equal(p.logged, 2);
  assert.equal(p.onGreen, 0);
  assert.equal(p.unknownStart, 2);
  assert.equal(p.holed, 1);
});

test('หัวข้อที่ผู้ใช้ตั้งเป็นสำคัญขึ้นก่อน', () => {
  const ts = [{ key: 'a', count: 5, label: 'a' }, { key: 'b', count: 1, label: 'b' }];
  const r = rankTopics(ts, ['b']);
  assert.equal(r[0].key, 'b');
  assert.ok(r[0].priority);
});

test('ข้อเสนอประเภทช็อต', () => {
  assert.equal(suggestShotType({ seq: 1 }), 'tee');
  assert.equal(suggestShotType({ seq: 2, prev: { shot_type: 'tee' } }), 'approach');
  assert.equal(suggestShotType({ seq: 3, prev: { end_lie: 'green' } }), 'putt');
  assert.equal(suggestShotType({ seq: 3, prev: { end_lie: 'bunker' } }), 'bunker');
  assert.equal(suggestShotType({ seq: 3, prev: {}, clubCategory: 'putter' }), 'putt');
});

test('แทรกและลบช็อตแล้วลำดับถูกต้อง', () => {
  const s = [1, 2, 3].map((n) => ({ id: `x${n}`, sequence: n }));
  assert.deepEqual(shiftForInsert(s, 2).map((x) => x.sequence), [1, 3, 4]);
  assert.deepEqual(resequence([s[0], s[2]]).map((x) => x.sequence), [1, 2]);
});

test('“2 คันธง” คงเดิมหลังส่งออกและกู้คืน JSON', () => {
  const data = { shots: example, rounds: [round], holes: [hole], settings: [{ key: 'distance_unit', value: 'm' }] };
  const text = JSON.stringify(buildExport(data, '2026-09-25T00:00:00Z'));
  const back = parseImport(text);
  assert.equal(back.shots.find((s) => s.id === 's4').raw_distance_text, '2 คันธง');
  assert.equal(back.shots.find((s) => s.id === 's5').assessment, null);
  assert.deepEqual(back.practice, []);
});

test('กู้คืนปฏิเสธไฟล์ที่ไม่ใช่ของ ShotLog', () => {
  assert.throws(() => parseImport('{"app":"other","data":{}}'), /ShotLog/);
  assert.throws(() => parseImport('not json'), /JSON/);
  assert.throws(() => parseImport('{"app":"ShotLog","schema_version":1,"data":{"shots":[{}]}}'), /id/);
});

test('CSV escape และกันสูตร', () => {
  const csv = toCSV(['a', 'b'], [['x, "y"', '=SUM(1)'], [-2, null]]);
  assert.equal(csv, 'a,b\r\n"x, ""y""",\'=SUM(1)\r\n-2,');
});

test('ค้นหา “โคราช” พบสนามนครราชสีมา และ “Royal” พบ Royal Creek', () => {
  const korat = searchCourses(CURATED_COURSES, { q: 'โคราช' });
  assert.equal(korat.length, 3);
  assert.ok(korat.every((c) => c.province === 'นครราชสีมา'));
  const royal = searchCourses(CURATED_COURSES, { q: 'Royal' });
  assert.deepEqual(royal.map((c) => c.id), ['royal-creek']);
});

test('กรองจังหวัดแสดงเฉพาะจังหวัดนั้น; กรองสนามโปรด', () => {
  const kk = searchCourses(CURATED_COURSES, { province: 'ขอนแก่น' });
  assert.equal(kk.length, 3);
  assert.ok(kk.every((c) => c.province === 'ขอนแก่น'));
  const fav = searchCourses(CURATED_COURSES, { favoritesOnly: true, favorites: new Set(['kirimaya']) });
  assert.deepEqual(fav.map((c) => c.id), ['kirimaya']);
});

test('เพิ่มสนามเองที่ชื่อและจังหวัดซ้ำ → ใช้รายการเดิม', () => {
  assert.equal(findDuplicateCourse(CURATED_COURSES, 'royal creek golf club and resort', 'อุดรธานี')?.id, 'royal-creek');
  assert.equal(findDuplicateCourse(CURATED_COURSES, 'รอยัลครีก', 'อุดรธานี')?.id, 'royal-creek');
  assert.equal(findDuplicateCourse(CURATED_COURSES, 'รอยัลครีก', 'ขอนแก่น'), null);
});

test('รายชื่อเริ่มต้น 10 สนาม 6 จังหวัด ไม่มีพาร์ที่เดาไว้', () => {
  assert.equal(CURATED_COURSES.length, 10);
  assert.equal(new Set(CURATED_COURSES.map((c) => c.province)).size, 6);
  assert.ok(CURATED_COURSES.every((c) => c.scorecard_status === 'none' && c.origin === 'curated'));
});

test('ข้อเสนอหัวข้อซ้อมตามอาการ', () => {
  const t = { dim: 'contact', shot_type: 'chip', club_label: 'SW' };
  assert.match(practiceSuggestion(t).topic, /SW ชิพ: ความสม่ำเสมอ/);
});
