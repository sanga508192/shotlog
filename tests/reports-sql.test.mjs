// ทดสอบ SQL ขั้นที่ 4 บน Postgres จำลอง: รายงานข้อผิดพลาดและความเห็น (ส่งได้ อ่านไม่ได้ กันส่งรัว)
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, addUser, asUser } from './helpers/pg.mjs';

const A = '11111111-1111-1111-1111-111111111111';
const send = (db, uid, args) => asUser(db, uid,
  'select public.send_report($1, $2, $3, $4, $5, $6, $7) as ok',
  [args.kind, args.message, args.detail ?? null, args.page ?? null, args.app_version ?? null, args.device ?? null, args.contact ?? null]);

test('รายงาน: ส่งได้ทั้งคนที่เข้าสู่ระบบและไม่ได้เข้า แต่ไม่มีใครอ่านผ่าน API ได้', async () => {
  const db = await makeDb();
  await addUser(db, A);
  assert.equal((await send(db, null, { kind: 'feedback', message: '  ปุ่มพัตดีมาก  ', contact: ' ' })).rows[0].ok, true);
  assert.equal((await send(db, A, { kind: 'error', message: 'render #/coach: x is undefined', detail: 'at a.js:1', page: '#/coach', app_version: '0.20.0', device: 'iPhone' })).rows[0].ok, true);
  const rows = (await db.query('select kind, owner_id, message, contact, page from public.app_reports order by id')).rows;
  assert.deepEqual(rows.map((r) => [r.kind, r.owner_id, r.message, r.contact]), [['feedback', null, 'ปุ่มพัตดีมาก', null], ['error', A, 'render #/coach: x is undefined', null]]);
  for (const uid of [null, A]) {
    await assert.rejects(() => asUser(db, uid, 'select * from public.app_reports'), /permission denied/);
    await assert.rejects(() => asUser(db, uid, "insert into public.app_reports (kind, message) values ('error', 'x')"), /permission denied/);
  }
});

test('รายงาน: ข้อมูลผิดถูกปฏิเสธ ข้อความยาวถูกตัด และส่งรัวเกิน 20 ครั้งต่อชั่วโมงไม่บันทึก', async () => {
  const db = await makeDb();
  await addUser(db, A);
  await assert.rejects(() => send(db, A, { kind: 'spam', message: 'x' }), /invalid kind/);
  await assert.rejects(() => send(db, A, { kind: 'error', message: '   ' }), /empty message/);
  await send(db, A, { kind: 'error', message: 'ก'.repeat(5000), device: 'd'.repeat(500) });
  const r = (await db.query('select length(message) as m, length(device) as d from public.app_reports')).rows[0];
  assert.deepEqual([r.m, r.d], [2000, 200]);
  const oks = [];
  for (let i = 0; i < 21; i++) oks.push((await send(db, A, { kind: 'error', message: `e${i}` })).rows[0].ok);
  assert.equal(oks.filter(Boolean).length, 19, 'รวมรายการแรกแล้วครบ 20 ต่อชั่วโมง');
  assert.equal((await db.query('select count(*)::int as n from public.app_reports')).rows[0].n, 20);
});
