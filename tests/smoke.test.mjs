// ทดสอบความทนทาน: เปิดทุกหน้าของแอปด้วยข้อมูลแปลก ๆ (รอบเสีย หลุมไม่มีพาร์ ค่าตั้งผิด ฯลฯ) ต้องไม่พัง
// และวัดความเร็วเมื่อมีข้อมูลมาก
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../js/state.js';
import * as db from '../js/db.js';
import { homeView, historyView, coursesView, newRoundView } from '../js/views/main.js';
import { holeView, scorecardView } from '../js/views/round.js';
import { summaryView, practiceView, practiceNewView } from '../js/views/insights.js';
import { settingsView } from '../js/views/settings.js';
import { accountView } from '../js/views/account.js';
import { setupView, gamesView, parsView, scorecardData } from '../js/views/group.js';
import { scanView } from '../js/views/scan.js';
import { shareView } from '../js/views/share.js';
import { coachView } from '../js/views/coach.js';
import { mapView } from '../js/views/map.js';
import { drillsView } from '../js/views/drills.js';
import { launchView } from '../js/views/launch.js';
import { gamePlanView } from '../js/views/gameplan.js';
import { recapView } from '../js/views/recap.js';

const ctx = { rerender() {}, go() {} };

async function fresh() {
  await db.close();
  await new Promise((res, rej) => { const r = indexedDB.deleteDatabase('shotlog'); r.onsuccess = res; r.onerror = rej; });
  await st.load();
}

let n = 0;
const id = (p) => `${p}-${++n}`;

// รอบรายช็อตปกติ + รอบก๊วนทุกเกม + รอบเสียหลายแบบ
async function seedWeird() {
  const clubs = st.bagClubs();
  const ops = [];
  const round = (extra) => {
    const r = { id: id('r'), played_at: '2026-09-20', course_id: 'kirimaya', course_name_snapshot: 'คีรีมายา', province_snapshot: 'นครราชสีมา', status: 'complete', hole_count: 18, current_hole: 1, created_at: st.nowIso(), ...extra };
    ops.push({ store: 'rounds', put: r });
    return r;
  };
  const hole = (r, number, extra = {}) => {
    const h = { id: id('h'), round_id: r.id, number, par: [4, 4, 3, 5][number % 4], hc_index: ((number * 7) % 18) + 1, status: 'done', finish: 'holed', ...extra };
    ops.push({ store: 'holes', put: h });
    return h;
  };
  const shot = (r, h, seq, extra = {}) => ops.push({ store: 'shots', put: { id: id('s'), round_id: r.id, hole_id: h.id, sequence: seq, counted: true, ...extra } });

  // 1) รอบรายช็อตคนเดียว 18 หลุม
  const a = round({ shot_logging: true });
  for (let i = 1; i <= 18; i++) {
    const h = hole(a, i);
    shot(a, h, 1, { shot_type: 'tee', club_id: clubs[0].id, start_lie: 'tee', end_lie: i % 3 ? 'fairway' : 'rough', direction: 'right', contact: 'top' });
    shot(a, h, 2, { shot_type: 'approach', club_id: clubs[6].id, end_lie: i % 2 ? 'green' : 'fringe', distance_result: 'short' });
    if (i % 2 === 0) shot(a, h, 3, { shot_type: 'chip', end_lie: 'green' });
    shot(a, h, 9, { shot_type: 'putt', start_lie: 'green', end_lie: 'green', distance_before: 8, distance_unit: 'm', distance_result: 'short' });
    shot(a, h, 10, { shot_type: 'putt', start_lie: 'green', end_lie: 'holed', holed: true });
    if (i === 5) ops.push({ store: 'penalties', put: { id: id('p'), round_id: a.id, hole_id: h.id, strokes: 1, reason: 'ob_lost', related_shot_id_optional: null } });
  }
  // 2) รอบก๊วนจดเร็ว 4 คน ทุกเกม
  const players = [{ id: 'me', name: 'ฉัน', handicap: 12 }, { id: 'p1', name: 'Tom', handicap: 5 }, { id: 'p2', name: 'เอก', handicap: null }, { id: 'p3', name: '', handicap: 'abc' }];
  const b = round({
    shot_logging: false, players, games: [
      { id: 'g1', type: 'skin', players: [], use_handicap: true, carry: true, point: 1 },
      { id: 'g2', type: 'match', players: ['me', 'p1'], use_handicap: true },
      { id: 'g3', type: 'team', players: ['me', 'p1', 'p2', 'p3'], teams: [['me', 'p1'], ['p2', 'p3']] },
      { id: 'g4', type: 'team', players: ['me'], teams: [['me'], []] },
      { id: 'g5', type: 'stableford' },
      { id: 'g6', type: 'stroke', use_handicap: false },
      { id: 'g7', type: 'unknown-game' },
    ],
  });
  for (let i = 1; i <= 18; i++) hole(b, i, { group_scores: { me: 4 + (i % 3), p1: 4, p2: i === 3 ? 1 : 6, p3: i % 5 ? 5 : undefined } });
  // 3) รอบ 9 หลุมที่กำลังเล่น ไม่มีพาร์เลย
  const c = round({ status: 'playing', hole_count: 9, shot_logging: true, current_hole: 4 });
  for (let i = 1; i <= 9; i++) hole(c, i, { par: null, hc_index: null, status: i < 4 ? 'done' : 'playing', finish: null });
  // 4) รอบเสีย: ไม่มีหลุม ไม่มีวันที่ ไม่มีชื่อสนาม สนามที่ไม่รู้จัก ผู้เล่นว่าง
  const broken = round({ played_at: undefined, course_name_snapshot: undefined, course_id: 'no-such-course', players: [], games: null, hole_count: 18 });
  const junk = round({ players: 'abc', games: 'x', shot_logging: false });
  hole(junk, 1, { group_scores: { a: 4, me: 'x' } });
  // 5) หลุมเสีย: ช็อตอ้างไม้ที่ถูกลบ ค่าประเภทแปลก ลำดับซ้ำ ลูกโทษไม่มีจำนวน
  const d = round({ shot_logging: true, played_at: '2026-09-21' });
  const h = hole(d, 1, { par: 4 });
  hole(d, 2, { par: 'x', number: 2 });
  shot(d, h, 1, { shot_type: 'weird', club_id: 'deleted-club', end_lie: 'lava', contact: 'odd' });
  shot(d, h, 1, { shot_type: null, start_lie: 'green', end_lie: 'holed', holed: true });
  ops.push({ store: 'penalties', put: { id: id('p'), round_id: d.id, hole_id: h.id, strokes: null, reason: null } });
  // 6) ข้อมูลอื่น ๆ
  ops.push({ store: 'practice', put: { id: id('pr'), date: '2026-09-22', topic: 'x', drill_id: 'no-such-drill', attempts: 10, successes: 12 } });
  ops.push({ store: 'practice', put: { id: id('pr'), date: undefined, topic: undefined, attempts: null } });
  ops.push({ store: 'userCourses', put: { id: 'uc1', display_name_th: 'สนามของฉัน', province: 'ขอนแก่น', origin: 'user', scorecard: { par: [4, 4, 3], hc: [1, 2, 3], tees: [{ id: 't1', name: 'ขาว', yards: [300, null, 150] }], unit: 'm', sources: [], checked_at: '2026-09-27' } } });
  ops.push({ store: 'settings', put: { key: 'share_layout', value: 'diagonal' } });
  ops.push({ store: 'settings', put: { key: 'course_holes:dancoon', value: { holes: { 1: { tee: { lat: 16.48, lon: 102.72 }, green: { lat: 16.483, lon: 102.721 }, front: { lat: 16.4829, lon: 102.7209 }, back: 'bad', hazards: [{ lat: 16.481, lon: 102.7205, kind: 'water' }, { kind: 'bunker' }, 7] }, 2: { tee: { lat: 'bad' } }, x: 5 } } } });
  ops.push({ store: 'settings', put: { key: 'course_holes:kirimaya', value: 'garbage' } });
  ops.push({ store: 'settings', put: { key: 'coach_goal', value: 'nope' } });
  ops.push({ store: 'practice', put: { id: 'L1', kind: 'launch', launch: { shots: 'bad' } } });
  ops.push({ store: 'practice', put: { id: 'L2', kind: 'launch', date: 7, launch: { clubs: 5, sig: {}, shots: [null, [1, 2], ['7 Iron', 'x', null, null, null, null, null, 140]] } } });
  ops.push({ store: 'practice', put: { id: 'L3', kind: 'launch', date: '2026-09-01', launch: { cols: 'x', clubs: { 'Driver': 'nope' }, shots: Array.from({ length: 12 }, (_, i) => ['Driver', 45, 65, 1.44, 11, 3, 3500, 200 + i, 15, 215, -3, -2, 2, 5]) } } });
  ops.push({ store: 'settings', put: { key: 'launch_period', value: 'weird' } });
  ops.push({ store: 'settings', put: { key: 'launch_club', value: 42 } });
  ops.push({ store: 'settings', put: { key: 'speed_unit', value: 'warp' } });
  ops.push({ store: 'settings', put: { key: 'course_rating:dancoon:white', value: { cr: 'x', slope: 999 } } });
  ops.push({ store: 'settings', put: { key: 'course_rating:kirimaya:default', value: 'garbage' } });
  ops.push({ store: 'settings', put: { key: 'map_auto_hole', value: 'maybe' } });
  ops.push({ store: 'settings', put: { key: 'my_handicap', value: 'abc' } });
  ops.push({ store: 'settings', put: { key: 'drill_clips', value: { 'putt-circle': [null, { url: 'javascript:x' }, { url: 'https://youtu.be/dQw4w9WgXcQ', title: '<b>x</b>' }, { url: 'https://tiktok.com/@a/video/1' }], 'short-landing': 7 } } });
  ops.push({ store: 'settings', put: { key: 'priority_topics', value: null } });
  ops.push({ store: 'settings', put: { key: 'friends', value: [{ name: 'Tom' }, null, 'bad'] } });
  await st.commit(ops);
  return { a, b, c, broken, d, junk };
}

function routesFor(ids) {
  const list = [
    ['home', () => homeView([], ctx)],
    ['history', () => historyView([], ctx)],
    ['courses', () => coursesView([], ctx)],
    ['new curated', () => newRoundView(['kirimaya'], ctx)],
    ['new user course', () => newRoundView(['uc1'], ctx)],
    ['new unknown', () => newRoundView(['nope'], ctx)],
    ['summary all', () => summaryView([], ctx)],
    ['coach', () => coachView([], ctx)],
    ['practice', () => practiceView([], ctx)],
    ['drills', () => drillsView([], ctx)],
    ['launch', () => launchView([], ctx)],
    ['practice new', () => practiceNewView([''], ctx)],
    ['practice new drill', () => practiceNewView(['d=putt-circle'], ctx)],
    ['practice new bad', () => practiceNewView(['t=a|b|c&d=zzz'], ctx)],
    ['settings', () => settingsView([], ctx)],
    ['account', () => accountView([''], ctx)],
    ['scan new', () => scanView([undefined], ctx)],
    ['scan curated', () => scanView(['kirimaya'], ctx)],
    ['scan unknown', () => scanView(['nope'], ctx)],
    ['map curated no pins', () => mapView(['kirimaya', '1', ''], ctx)],
    ['map with pins', () => mapView(['dancoon', '2', ''], ctx)],
    ['map edit', () => mapView(['dancoon', '1', 'edit=1'], ctx)],
    ['map unknown course', () => mapView(['nope', '99', 'r=missing'], ctx)],
    ['map user course', () => mapView(['uc1', '3', ''], ctx)],
  ];
  for (const [name, r] of Object.entries(ids)) {
    const rid = r.id;
    list.push(
      [`${name} card`, () => scorecardView([rid], ctx)],
      [`${name} setup`, () => setupView([rid], ctx)],
      [`${name} games`, () => gamesView([rid], ctx)],
      [`${name} pars`, () => parsView([rid], ctx)],
      [`${name} summary`, () => summaryView([rid], ctx)],
      [`${name} share`, () => shareView([rid], ctx)],
      [`${name} plan`, () => gamePlanView([rid], ctx)],
      [`${name} recap`, () => recapView([rid], ctx)],
      [`${name} map`, () => mapView([r.course_id || 'x', '1', `r=${rid}`], ctx)],
      [`${name} share data`, () => ({ html: JSON.stringify(Object.keys(scorecardData(st.S.rounds.get(rid)))) })],
    );
    for (const num of ['1', '2', '9', '18', '19', '0']) list.push([`${name} hole ${num}`, () => holeView([rid, num], ctx)]);
  }
  for (const v of ['card', 'setup', 'games', 'pars', 'share', 'plan', 'recap']) {
    list.push([`missing round ${v}`, () => ({ card: scorecardView, setup: setupView, games: gamesView, pars: parsView, share: shareView, plan: gamePlanView, recap: recapView }[v])(['missing'], ctx)]);
  }
  list.push(['missing round hole', () => holeView(['missing', '1'], ctx)]);
  return list;
}

test('ทุกหน้าเปิดได้เมื่อฐานข้อมูลว่าง', async () => {
  await fresh();
  for (const [name, fn] of routesFor({})) {
    const out = fn();
    assert.equal(typeof out.html, 'string', name);
  }
});

test('ทุกหน้าเปิดได้กับข้อมูลเสียหรือแปลก ๆ โดยไม่พัง', async () => {
  await fresh();
  const ids = await seedWeird();
  const failures = [];
  for (const [name, fn] of routesFor(ids)) {
    try {
      const out = fn();
      assert.equal(typeof out.html, 'string');
      assert.ok(!/undefined|NaN|\[object Object\]/.test(out.html.replace(/data-[a-z-]+="[^"]*"/g, '')), `${name}: มีคำว่า undefined/NaN/[object Object] ในหน้า`);
    } catch (err) {
      failures.push(`${name}: ${err.message.split('\n')[0]}`);
    }
  }
  assert.deepEqual(failures, []);
});

async function seedRounds(count) {
  await fresh();
  const ops = [];
  for (let r = 0; r < count; r++) {
    const rid = `R${r}`;
    ops.push({ store: 'rounds', put: { id: rid, played_at: `2026-${String(1 + (r % 9)).padStart(2, '0')}-${String(1 + (r % 27)).padStart(2, '0')}`, course_id: 'kirimaya', course_name_snapshot: 'คีรีมายา', status: 'complete', shot_logging: true, created_at: st.nowIso() } });
    for (let i = 1; i <= 18; i++) {
      const hid = `${rid}-H${i}`;
      ops.push({ store: 'holes', put: { id: hid, round_id: rid, number: i, par: 4, hc_index: i, status: 'done', finish: 'holed' } });
      ['tee', 'approach', 'chip', 'putt', 'putt'].forEach((t, k) => ops.push({ store: 'shots', put: {
        id: `${hid}-S${k}`, round_id: rid, hole_id: hid, sequence: k + 1, shot_type: t, counted: true,
        end_lie: k === 4 ? 'holed' : t === 'putt' || t === 'chip' ? 'green' : 'fairway', holed: k === 4,
      } }));
    }
  }
  await st.commit(ops);
}

// เวลาที่ใช้ (ค่ากลางจาก 3 ครั้ง หลังอุ่นเครื่อง) ของหน้าที่หนักที่สุด
function timeHeavyPages() {
  const run = () => {
    const t0 = performance.now();
    homeView([], ctx); coachView([], ctx); historyView([], ctx); holeView(['R3', '5'], ctx);
    return performance.now() - t0;
  };
  run();
  return [run(), run(), run()].sort((a, b) => a - b)[1];
}

test('ข้อมูลมาก: เวลาเพิ่มตามจำนวนรอบแบบเส้นตรง ไม่พุ่งเป็นกำลังสอง (150 รอบ รายช็อต)', async () => {
  await seedRounds(30);
  const small = timeHeavyPages();
  await seedRounds(150);
  const big = timeHeavyPages();
  // ข้อมูล 5 เท่า: แบบเส้นตรงใช้เวลาราว 5 เท่า แบบเดิมที่ไล่ข้อมูลทั้งหมดทุกหลุมใช้ราว 25 เท่า
  assert.ok(big / Math.max(small, 1) < 12, `30 รอบ ${small.toFixed(0)} ms → 150 รอบ ${big.toFixed(0)} ms`);
  assert.ok(big < 1500, `150 รอบ ${big.toFixed(0)} ms`);
});
