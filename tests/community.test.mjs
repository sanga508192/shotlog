// ทดสอบ SQL ขั้นที่ 3 บน Postgres จำลอง: หมุดสนามที่แชร์ และสกอร์บอร์ดสด (สิทธิ์ ความเป็นเจ้าของ การหมดอายุ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeDb, addUser, asUser } from './helpers/pg.mjs';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const pins = (arr) => JSON.stringify(arr);

test('schema.sql รันซ้ำได้โดยไม่พัง', async () => {
  const db = await makeDb();
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
});

test('หมุดที่แชร์: แทนที่รายคน ค่ากลางรวม อ่านได้ทุกคน เขียนได้เฉพาะผู้ที่เข้าสู่ระบบ', async () => {
  const db = await makeDb();
  for (const u of [A, B, C]) await addUser(db, u);
  const share = (u, list, course = 'kirimaya') => asUser(db, u, 'select public.share_course_pins($1, $2::jsonb) as n', [course, pins(list)]);
  await share(A, [{ hole: 1, kind: 'tee', lat: 14.5, lon: 101.4, via: 'gps' }, { hole: 1, kind: 'green', lat: 14.51, lon: 101.41, via: 'map' }]);
  await share(B, [{ hole: 1, kind: 'tee', lat: 14.502, lon: 101.402, via: 'gps' }]);
  await share(C, [{ hole: 1, kind: 'tee', lat: 14.9, lon: 101.9, via: 'map' }]);   // คนเดียววางผิด ค่ากลางไม่เพี้ยน
  const read = async (u) => (await asUser(db, u, `select * from public.community_pins('kirimaya')`)).rows;
  const rows = await read(null);   // ไม่ได้เข้าสู่ระบบก็อ่านได้
  const tee = rows.find((r) => r.hole === 1 && r.kind === 'tee');
  assert.deepEqual([tee.lat, tee.lon, tee.n, tee.gps], [14.502, 101.402, 3, 2]);
  assert.equal(rows.find((r) => r.kind === 'green').n, 1);
  assert.deepEqual(await read(A), rows);

  // ส่งใหม่ = แทนที่ทั้งหมดของคนนั้นในสนามนั้น
  await share(A, [{ hole: 2, kind: 'green', lat: 14.52, lon: 101.42 }]);
  const after = await read(null);
  assert.equal(after.find((r) => r.hole === 1 && r.kind === 'tee').n, 2);
  assert.ok(!after.some((r) => r.hole === 1 && r.kind === 'green'));
  await share(A, []);
  assert.ok(!(await read(null)).some((r) => r.hole === 2));

  // ข้อมูลผิดรูปแบบถูกปฏิเสธทั้งชุด
  await assert.rejects(share(B, [{ hole: 1, kind: 'bunker', lat: 14.5, lon: 101.4 }]));
  await assert.rejects(share(B, [{ hole: 99, kind: 'tee', lat: 14.5, lon: 101.4 }]));
  await assert.rejects(share(B, [{ hole: 1, kind: 'tee', lat: 14.5, lon: 101.4 }], 'Bad Course!'));
  await assert.rejects(share(B, Array.from({ length: 109 }, () => ({ hole: 1, kind: 'tee', lat: 1, lon: 1 }))));
  assert.equal((await read(null)).find((r) => r.kind === 'tee').n, 2, 'ชุดที่ผิดไม่ลบของเดิม');

  // ไม่ได้เข้าสู่ระบบแชร์ไม่ได้ และไม่มีใครอ่านตารางดิบได้ (ไม่รู้ว่าใครวาง)
  await assert.rejects(share(null, [{ hole: 1, kind: 'tee', lat: 14.5, lon: 101.4 }]));
  await assert.rejects(asUser(db, A, 'select * from public.course_pins'));
  await assert.rejects(asUser(db, null, 'select * from public.course_pins'));

  await asUser(db, B, 'select public.unshare_all_pins()');
  assert.equal((await read(null)).find((r) => r.kind === 'tee').n, 1);
  // ลบบัญชี → หมุดที่แชร์หายด้วย
  await db.query('delete from auth.users where id = $1', [C]);
  assert.equal((await read(null)).length, 0);
});

test('สกอร์บอร์ดสด: เจ้าของเท่านั้นที่อัปเดตได้ ทุกคนที่มีลิงก์อ่านได้ หมดอายุแล้วหายไป', async () => {
  const db = await makeDb();
  await addUser(db, A);
  await addUser(db, B);
  const publish = (u, data, token = TOKEN) => asUser(db, u, 'select public.publish_board($1, $2::jsonb) as exp', [token, JSON.stringify(data)]);
  const get = async (token = TOKEN) => (await asUser(db, null, 'select public.get_board($1) as b', [token])).rows[0].b;

  await publish(A, { course: 'คีรีมายา', players: [{ name: 'ฉัน', total: 40 }] });
  assert.equal((await get()).data.course, 'คีรีมายา');
  await publish(A, { course: 'คีรีมายา', players: [{ name: 'ฉัน', total: 44 }] });
  assert.equal((await get()).data.players[0].total, 44);

  await assert.rejects(publish(B, { hacked: true }), /not your board/);
  assert.equal((await get()).data.hacked, undefined);
  await assert.rejects(publish(null, { x: 1 }));
  await assert.rejects(publish(A, { x: 1 }, 'short'), 'token สั้นเกินไป');
  await assert.rejects(publish(A, [1, 2]), 'ต้องเป็นอ็อบเจกต์');
  await assert.rejects(asUser(db, null, 'select * from public.live_boards'));

  // คนอื่นลบไม่ได้ เจ้าของลบได้
  await asUser(db, B, 'select public.unpublish_board($1)', [TOKEN]);
  assert.ok(await get());
  await asUser(db, A, 'select public.unpublish_board($1)', [TOKEN]);
  assert.equal(await get(), null);

  // หมดอายุ
  await publish(A, { v: 1 });
  await db.query(`update public.live_boards set expires_at = now() - interval '1 minute'`);
  assert.equal(await get(), null);

  // ไม่มีสิทธิ์สมาชิก (ปิดช่วงทดลองเปิด + ไม่มีสิทธิ์) → แชร์ไม่ได้
  await db.query(`update public.app_config set value = 'false' where key = 'open_beta'`);
  await db.query('delete from public.entitlements where user_id = $1', [B]);
  await assert.rejects(publish(B, { v: 1 }, 'ZZZZZZZZZZZZZZZZZZZZZZ'), /subscription required/);
  await publish(A, { v: 2 }, 'YYYYYYYYYYYYYYYYYYYYYY');   // A ยังอยู่ในช่วงทดลอง 30 วัน
});
