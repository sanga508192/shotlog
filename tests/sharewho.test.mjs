// ทดสอบรูปสกอร์การ์ดแบบเลือกคนที่แสดง และการเปลี่ยนชื่อของฉันย้อนไปรอบเก่า
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../js/state.js';
import { scorecardData, renameMe, myName } from '../js/views/group.js';

async function seed() {
  await st.load();
  const ops = [];
  const round = (id, players, extra = {}) => {
    ops.push({ store: 'rounds', put: { id, played_at: '2026-10-01', course_name_snapshot: 'สนาม', status: 'complete', hole_count: 9, current_hole: 1, shot_logging: false, players, ...extra } });
    for (let n = 1; n <= 9; n++) {
      ops.push({ store: 'holes', put: { id: `${id}-h${n}`, round_id: id, number: n, par: 4, status: 'done', finish: 'holed', group_scores: { me: 5, p1: 4, p2: 6 } } });
    }
  };
  round('g', [{ id: 'me', name: 'ฉัน' }, { id: 'p1', name: 'Tom' }, { id: 'p2', name: 'เอก' }], {
    games: [{ id: 'all', type: 'skin', players: [] }, { id: 'pair', type: 'match', players: ['me', 'p1'] }, { id: 'stroke', type: 'stroke', players: ['me', 'p1', 'p2'] }],
  });
  round('old', [{ id: 'me', name: 'ฉัน' }, { id: 'p1', name: 'Tom' }]);
  round('nick', [{ id: 'me', name: 'บิ๊ก' }, { id: 'p1', name: 'Tom' }]);
  await st.commit(ops);
}

test('เลือกคนที่แสดงในรูป: เฉพาะของฉัน ไม่มีเกมที่มีคนที่ซ่อน · ทั้งก๊วนเหมือนเดิม', async () => {
  await seed();
  const r = st.S.rounds.get('g');
  const all = scorecardData(r);
  assert.deepEqual(all.grid.players.map((p) => p.id), ['me', 'p1', 'p2']);
  assert.equal(all.games.length, 3);

  const me = scorecardData(r, { show: ['me'] });
  assert.deepEqual(me.grid.players.map((p) => p.id), ['me']);
  assert.equal(me.games.length, 0, 'ทุกเกมมีคนอื่นอยู่');
  assert.equal(me.grid.total.byPlayer.me.strokes, 45, 'สกอร์ของฉันยังครบ');

  const pair = scorecardData(r, { show: ['me', 'p1'] });
  assert.deepEqual(pair.games.map((g) => g.title), ['Matchplay ทุกคู่'], 'เหลือเกมที่มีแค่คนที่แสดง');
  assert.ok(pair.games[0].items.every((i) => i.name !== 'เอก'));

  assert.equal(scorecardData(r, { show: [] }).grid.players.length, 3, 'ไม่เลือกใครเลย = แสดงทุกคน');
  assert.equal(scorecardData(r, { show: ['ghost'] }).grid.players.length, 3);
});

test('เปลี่ยนชื่อของฉัน: รอบเก่าที่ใช้ "ฉัน" เปลี่ยนตาม รอบที่ตั้งชื่อเล่นไว้ไม่แตะ ชื่อว่างไม่บันทึก', async () => {
  assert.equal(await renameMe('   '), false);
  assert.equal(myName(), 'ฉัน');
  assert.equal(await renameMe('  สง่า  '), true);
  assert.equal(myName(), 'สง่า');
  const meIn = (id) => st.S.rounds.get(id).players.find((p) => p.id === 'me').name;
  assert.equal(meIn('g'), 'สง่า');
  assert.equal(meIn('old'), 'สง่า');
  assert.equal(meIn('nick'), 'บิ๊ก');
  assert.equal(st.S.rounds.get('g').players.find((p) => p.id === 'p1').name, 'Tom', 'ชื่อเพื่อนไม่เปลี่ยน');
  // เปลี่ยนอีกครั้ง: ตามจากชื่อปัจจุบัน และเปลี่ยนรอบที่สั่งเฉพาะได้
  await renameMe('Sanga', 'nick');
  assert.deepEqual(['g', 'old', 'nick'].map(meIn), ['Sanga', 'Sanga', 'Sanga']);
  assert.equal((await renameMe('x'.repeat(50))) && myName().length, 30);
});
