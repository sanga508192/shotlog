// ทดสอบ supabase/schema.sql บน Postgres จำลอง: สิทธิ์ RLS, rev/conflict, การลบบัญชี
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeDb, addUser, asUser } from './helpers/pg.mjs';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

const push = async (db, uid, items) =>
  (await asUser(db, uid, 'select public.push_records($1::jsonb) as r', [JSON.stringify(items)])).rows[0].r;

test('schema รันซ้ำได้ และ push/อ่านเฉพาะข้อมูลตัวเอง', async () => {
  const db = await makeDb();
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await addUser(db, A);
  await addUser(db, B);

  const r1 = await push(db, A, [{ store: 'rounds', id: 'r1', base_rev: null, data: { id: 'r1', note: '2 คันธง' } }]);
  assert.equal(r1[0].status, 'ok');
  assert.equal(r1[0].rev, 1);

  const mine = await asUser(db, A, 'select id, data from public.records');
  assert.equal(mine.rows.length, 1);
  assert.equal(mine.rows[0].data.note, '2 คันธง');
  const theirs = await asUser(db, B, 'select id from public.records');
  assert.equal(theirs.rows.length, 0, 'B ต้องไม่เห็นข้อมูลของ A');
  const anon = await asUser(db, null, 'select id from public.records').catch((e) => e);
  assert.ok(anon instanceof Error || anon.rows.length === 0, 'anon ต้องอ่านไม่ได้');
});

test('เขียนตรงเข้าตารางไม่ได้ ต้องผ่าน push_records', async () => {
  const db = await makeDb();
  await addUser(db, A);
  await assert.rejects(asUser(db, A,
    `insert into public.records (store, id, data) values ('rounds', 'x', '{}')`), /permission denied/);
  await push(db, A, [{ store: 'rounds', id: 'r1', base_rev: null, data: { id: 'r1' } }]);
  await assert.rejects(asUser(db, A, `update public.records set data = '{}'`), /permission denied/);
  await assert.rejects(asUser(db, A, `delete from public.records`), /permission denied/);
  await assert.rejects(asUser(db, A, `update public.app_config set value = 'true'`), /permission denied/);
});

test('base_rev ไม่ตรง → conflict ไม่เขียนทับ; ตรง → rev เพิ่ม', async () => {
  const db = await makeDb();
  await addUser(db, A);
  await push(db, A, [{ store: 'shots', id: 's1', base_rev: null, data: { id: 's1', note: 'เดิม' } }]);
  const ok = await push(db, A, [{ store: 'shots', id: 's1', base_rev: 1, data: { id: 's1', note: 'แก้จากเครื่อง 1' } }]);
  assert.deepEqual([ok[0].status, ok[0].rev], ['ok', 2]);
  const clash = await push(db, A, [{ store: 'shots', id: 's1', base_rev: 1, data: { id: 's1', note: 'แก้จากเครื่อง 2' } }]);
  assert.equal(clash[0].status, 'conflict');
  assert.equal(clash[0].rev, 2);
  assert.equal(clash[0].data.note, 'แก้จากเครื่อง 1');
  const now = await asUser(db, A, `select data->>'note' as n from public.records where id = 's1'`);
  assert.equal(now.rows[0].n, 'แก้จากเครื่อง 1');
  // รายการใหม่ (base null) ที่ชนกับของเดิมก็ต้องเป็น conflict
  const dup = await push(db, A, [{ store: 'shots', id: 's1', base_rev: null, data: { id: 's1' } }]);
  assert.equal(dup[0].status, 'conflict');
});

test('ลบเป็น tombstone และ seq เพิ่มสำหรับการดึงข้อมูลต่อ', async () => {
  const db = await makeDb();
  await addUser(db, A);
  const a = await push(db, A, [{ store: 'holes', id: 'h1', base_rev: null, data: { id: 'h1' } }]);
  const d = await push(db, A, [{ store: 'holes', id: 'h1', base_rev: 1, deleted: true }]);
  assert.equal(d[0].status, 'ok');
  assert.ok(d[0].seq > a[0].seq);
  const row = (await asUser(db, A, `select deleted, data from public.records where id = 'h1'`)).rows[0];
  assert.deepEqual([row.deleted, row.data], [true, null]);
});

test('ตรวจข้อมูลไม่ถูกต้อง', async () => {
  const db = await makeDb();
  await addUser(db, A);
  await assert.rejects(push(db, A, [{ store: 'hack', id: 'x', base_rev: null, data: {} }]), /check constraint/);
  await assert.rejects(push(db, A, [{ store: 'rounds', id: 'x', base_rev: null, data: 'str' }]), /invalid data/);
  await assert.rejects(push(db, null, [{ store: 'rounds', id: 'x', data: {} }]), /permission denied|not authenticated/);
});

test('ปิด open_beta แล้วต้องมีสิทธิ์สมาชิกจึงซิงก์ได้', async () => {
  const db = await makeDb();
  await db.exec(`update public.app_config set value = '0' where key = 'trial_days'`);
  await addUser(db, A);
  await db.exec(`update public.app_config set value = 'false' where key = 'open_beta'`);
  await assert.rejects(push(db, A, [{ store: 'rounds', id: 'r', base_rev: null, data: { id: 'r' } }]), /subscription required/);
  await db.query(`insert into public.entitlements (user_id, plan, status, current_period_end) values ($1, 'plus', 'active', now() + interval '30 days')`, [A]);
  const ok = await push(db, A, [{ store: 'rounds', id: 'r', base_rev: null, data: { id: 'r' } }]);
  assert.equal(ok[0].status, 'ok');
  await db.query(`update public.entitlements set current_period_end = now() - interval '1 day' where user_id = $1`, [A]);
  await assert.rejects(push(db, A, [{ store: 'rounds', id: 'r', base_rev: 1, data: { id: 'r' } }]), /subscription required/);
  // สมาชิกหมดอายุยังอ่านข้อมูลตัวเองได้ เพื่อส่งออกเก็บไว้
  assert.equal((await asUser(db, A, 'select id from public.records')).rows.length, 1);
});

test('ลบบัญชีลบข้อมูลบนคลาวด์ทั้งหมดของผู้ใช้คนนั้นเท่านั้น', async () => {
  const db = await makeDb();
  await addUser(db, A);
  await addUser(db, B);
  await push(db, A, [{ store: 'rounds', id: 'r', base_rev: null, data: { id: 'r' } }]);
  await push(db, B, [{ store: 'rounds', id: 'r', base_rev: null, data: { id: 'r' } }]);
  await asUser(db, A, 'select public.delete_my_account()');
  const users = (await db.query('select id from auth.users')).rows.map((r) => r.id);
  assert.deepEqual(users, [B]);
  const rows = (await db.query('select owner_id from public.records')).rows;
  assert.deepEqual(rows.map((r) => r.owner_id), [B]);
});
