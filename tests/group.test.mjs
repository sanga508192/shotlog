// ทดสอบสกอร์ก๊วนและเกม (js/group.js) รวมถึงตัวอย่างจากภาพสกอร์การ์ด DogFight ที่ผู้ใช้ส่งมา
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ME, scoreGrid, classify, strokesReceived, skinGame, matchGame, teamGame, stablefordGame, strokeGame,
  pointsSummary, playerHoleScore,
} from '../js/group.js';

const holesFrom = (pars, scores, hc = []) => pars.map((par, i) => ({
  id: `h${i + 1}`, number: i + 1, par, hc_index: hc[i] ?? null, status: 'playing',
  group_scores: Object.fromEntries(Object.entries(scores).map(([pid, arr]) => [pid, arr[i] ?? null])),
}));
const roundWith = (players) => ({ id: 'r', players });

// ภาพ: ทริปเปิ้ลณัฐพาร์ 3 ทุกหลุมพาร์ 3 เล่นหลุม 3–8
const PLAYERS = [{ id: 'biw', name: 'Biw' }, { id: 'oun', name: 'พี่อ้วน' }, { id: 'mgr', name: 'ผจก.' }];
const IMG = {
  biw: [null, null, 5, 4, 4, 5, 4, 3],
  oun: [null, null, 6, 5, 4, 6, 4, 5],
  mgr: [null, null, 5, 4, 3, 4, 1, 4],
};
const imgGrid = () => scoreGrid(roundWith(PLAYERS), holesFrom(Array(18).fill(3), IMG));

test('ตัวอย่างจากภาพ: รวม 9 แรกและ "เกิน" ตรงกับ DogFight', () => {
  const g = imgGrid();
  assert.equal(g.front.par, 27);
  assert.deepEqual(['biw', 'oun', 'mgr'].map((p) => g.front.byPlayer[p].strokes), [25, 30, 21]);
  assert.deepEqual(['biw', 'oun', 'mgr'].map((p) => g.front.byPlayer[p].over), [7, 12, 3]);
  assert.deepEqual(['biw', 'oun', 'mgr'].map((p) => g.back.byPlayer[p].strokes), [0, 0, 0]);
  assert.deepEqual(['biw', 'oun', 'mgr'].map((p) => g.total.byPlayer[p].over), [7, 12, 3]);
  assert.equal(g.total.par, 54);
});

test('ตัวอย่างจากภาพ: นับเละ/ดับเบิ้ล/โบกี้/พาร์/โฮลอินวัน ตรงกับตารางล่าง', () => {
  const { counts } = imgGrid();
  const pick = (c) => [c.mess, c.double, c.bogey, c.par, c.birdie, c.eagle, c.albatross, c.hio];
  assert.deepEqual(pick(counts.biw), [0, 2, 3, 1, 0, 0, 0, 0]);
  assert.deepEqual(pick(counts.oun), [2, 2, 2, 0, 0, 0, 0, 0]);
  assert.deepEqual(pick(counts.mgr), [0, 1, 3, 1, 0, 0, 0, 1], 'โฮลอินวันพาร์ 3 นับเป็น HIO ไม่ใช่อีเกิ้ล');
});

test('ประเภทสกอร์', () => {
  assert.deepEqual([classify(1, 3), classify(2, 5), classify(3, 5), classify(3, 4), classify(4, 4), classify(8, 4), classify(4, null)],
    ['hio', 'albatross', 'eagle', 'birdie', 'par', 'mess', null]);
});

test('ตัวเราที่จดรายช็อต: ใช้ผลจากช็อต (รวมสโตรกปรับ) และนับเมื่อจบหลุมแล้ว', () => {
  const hole = { id: 'h1', number: 1, par: 4, status: 'playing', group_scores: { me: 9 } };
  const shots = [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, sequence: n, counted: true }));
  assert.deepEqual(playerHoleScore(hole, ME, shots, [{ strokes: 1 }]), { strokes: 6, final: false, source: 'shots' });
  assert.equal(playerHoleScore({ ...hole, status: 'done' }, ME, shots, []).final, true);
  assert.deepEqual(playerHoleScore(hole, ME, [], []), { strokes: 9, final: true, source: 'quick' });
  assert.equal(playerHoleScore(hole, 'x', [], []), null);
});

test('แต้มต่อตามดัชนีความยากหลุม', () => {
  assert.equal(strokesReceived(5, 5), 1);
  assert.equal(strokesReceived(5, 6), 0);
  assert.equal(strokesReceived(20, 1), 2);
  assert.equal(strokesReceived(20, 3), 1);
  assert.equal(strokesReceived(0, 1), 0);
  assert.equal(strokesReceived(10, null), 0);
});

test('Skin: เสมอทบไปหลุมถัดไป แต้มได้/เสียรวมเป็นศูนย์', () => {
  const grid = scoreGrid(roundWith([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]),
    holesFrom([4, 4, 4, 4], { a: [4, 4, 3, 5], b: [4, 5, 4, 4], c: [5, 4, 5, 5] }));
  const r = skinGame({ type: 'skin', point: 1 }, grid);
  // หลุม1 เสมอ a,b → ทบ, หลุม2 เสมอ a,c → ทบ, หลุม3 a ได้ 3 สกิน, หลุม4 b ได้ 1
  assert.deepEqual(r.skins, { a: 3, b: 1, c: 0 });
  assert.deepEqual(r.points, { a: 3 * 2 - 1, b: 1 * 2 - 3, c: -4 });
  assert.equal(Object.values(r.points).reduce((x, y) => x + y, 0), 0);
  const noCarry = skinGame({ type: 'skin', carry: false }, grid);
  assert.deepEqual(noCarry.skins, { a: 1, b: 1, c: 0 });
});

test('Skin: หลุมที่ยังกรอกไม่ครบทุกคนไม่นับ', () => {
  const grid = scoreGrid(roundWith([{ id: 'a' }, { id: 'b' }]), holesFrom([4, 4], { a: [3, 3], b: [4, null] }));
  const r = skinGame({ type: 'skin' }, grid);
  assert.equal(r.holesCounted, 1);
  assert.deepEqual(r.skins, { a: 1, b: 0 });
});

test('Matchplay ทุกคู่ พร้อมแต้มต่อส่วนต่างตามหลุม HC', () => {
  const players = [{ id: 'a', name: 'A', handicap: 10 }, { id: 'b', name: 'B', handicap: 12 }];
  // B ได้ 2 สโตรกที่หลุม HC 1 และ 2
  const grid = scoreGrid(roundWith(players), holesFrom([4, 4, 4], { a: [4, 4, 4], b: [5, 4, 5] }, [1, 2, 3]));
  const r = matchGame({ type: 'match', point: 1 }, grid);
  const pair = r.pairs[0];
  // หลุม1: 4 vs 5-1=4 เสมอ, หลุม2: 4 vs 4-1=3 B ชนะ, หลุม3: 4 vs 5 A ชนะ
  assert.deepEqual([pair.wonA, pair.wonB, pair.halved, pair.strokesTo, pair.strokes], [1, 1, 1, 'b', 2]);
  assert.deepEqual(r.points, { a: 0, b: 0 });
  const gross = matchGame({ type: 'match', use_handicap: false }, grid);
  assert.deepEqual(gross.points, { a: 2, b: -2 });
});

test('ทีม 2 ต่อ 2: สกอร์ดีที่สุดของทีม และนับผลรวมทีมเพิ่มได้', () => {
  const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id }));
  const grid = scoreGrid(roundWith(players), holesFrom([4, 4], { a: [3, 5], b: [6, 5], c: [4, 4], d: [4, 4] }));
  const game = { type: 'team', teams: [['a', 'b'], ['c', 'd']] };
  const r = teamGame(game, grid);
  // หลุม1: best 3 vs 4 → ทีม A, หลุม2: 5 vs 4 → ทีม B
  assert.deepEqual(r.won, [1, 1]);
  assert.deepEqual(r.points, { a: 0, b: 0, c: 0, d: 0 });
  const withTotal = teamGame({ ...game, team_total: true }, grid);
  // ผลรวม หลุม1: 9 vs 8 → B, หลุม2: 10 vs 8 → B
  assert.deepEqual(withTotal.points, { a: -2, b: -2, c: 2, d: 2 });
  assert.match(teamGame({ type: 'team', teams: [['a']] }, grid).warnings[0], /จัดทีม/);
});

test('Stableford และสโตรกรวม (หักแต้มต่อ)', () => {
  const players = [{ id: 'a', handicap: 0 }, { id: 'b', handicap: 18 }];
  const grid = scoreGrid(roundWith(players), holesFrom([4, 3], { a: [3, 6], b: [5, 4] }, [1, 2]));
  const s = stablefordGame({ type: 'stableford' }, grid);
  // a: เบอร์ดี้ 3 + ทริปเปิ้ล 0 = 3, b: net 4 พาร์ 2 + net 3 พาร์ 2 = 4
  assert.deepEqual(s.totals, { a: 3, b: 4 });
  assert.deepEqual(s.ranking.map((x) => x.id), ['b', 'a']);
  const st = strokeGame({ type: 'stroke' }, grid);
  assert.deepEqual([st.gross.a, st.gross.b, st.net.a, st.net.b], [9, 9, 9, 7]);
});

test('เตือนเมื่อใช้แต้มต่อแต่ยังไม่มี HC รายหลุม และสรุปแต้มรวมทุกเกม', () => {
  const players = [{ id: 'a', handicap: 0 }, { id: 'b', handicap: 5 }];
  const grid = scoreGrid(roundWith(players), holesFrom([4], { a: [4], b: [5] }));
  assert.match(matchGame({ type: 'match' }, grid).warnings[0], /HC/);
  const total = pointsSummary([{ type: 'skin' }, { type: 'match' }, { type: 'stableford' }], grid);
  assert.deepEqual(total, { a: 2, b: -2 });
});

// ภาพจากผู้ใช้ 30 ก.ย. 2569: หลุม 1 และ 3 ของ "ฉัน" จดรายช็อตแต่ลืมกดจบหลุม อ้วนกรอกแค่ 2 หลุม
test('สกอร์รวมที่ยังไม่ครบ: บอกหลุมที่ยังไม่จบ/ไม่มีสกอร์ และไม่ให้คนที่กรอก 2 หลุมได้อันดับ 1', async () => {
  const { openHoles, openNote, standings, fmtRanges } = await import('../js/group.js');
  const pars = [4, 4, 5, 4, 3, 4, 5, 3, 4, 4, 5, 4, 3, 4, 4, 4, 3, 5];
  const mine = [5, 5, 5, 5, 3, 4, 6, 4, 5, 5, 6, 4, 2, 4, 5, 5, 3, 6];
  const holes = pars.map((par, i) => ({
    id: `u${i + 1}`, number: i + 1, par, status: i === 0 || i === 2 ? 'playing' : 'done',
    group_scores: i === 0 ? { oun: 5 } : i === 4 ? { oun: 3 } : {},
  }));
  const shotsOf = (hid) => Array.from({ length: mine[Number(hid.slice(1)) - 1] }, (_, k) => ({ id: `${hid}s${k}`, sequence: k + 1 }));
  const g = scoreGrid(roundWith([{ id: ME, name: 'ฉัน' }, { id: 'oun', name: 'อ้วน' }]), holes, shotsOf);
  assert.equal(g.total.byPlayer[ME].strokes, 72, 'รวมเฉพาะ 16 หลุมที่จบ');
  assert.equal(g.total.byPlayer[ME].over, 9);
  assert.deepEqual(openHoles(g, ME).pending, [{ n: 1, strokes: 5 }, { n: 3, strokes: 5 }]);
  assert.equal(openHoles(g, 'oun').missing.length, 16);
  assert.equal(fmtRanges([2, 3, 4, 6, 7, 18]), '2–4, 6–7, 18');
  assert.equal(openNote(g), '* รวมเฉพาะหลุมที่จบแล้ว — ฉัน: หลุม 1, 3 ยังไม่จบ · อ้วน: ไม่มีสกอร์หลุม 2–4, 6–18');
  const s = standings(g);
  assert.deepEqual(s.map((x) => [x.pl.name, x.rank]), [['ฉัน', 1], ['อ้วน', null]], 'อ้วนกรอก 2 หลุม ไม่จัดอันดับ');
  // จบหลุม 1 และ 3 แล้ว รวมเป็น 82 ครบ 18 หลุม
  const done = holes.map((h) => ({ ...h, status: 'done' }));
  const g2 = scoreGrid(roundWith([{ id: ME, name: 'ฉัน' }]), done, shotsOf);
  assert.equal(g2.total.byPlayer[ME].strokes, 82);
  assert.equal(openNote(g2), '');
});
