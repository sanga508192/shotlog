// ทดสอบส่วนสมาชิกใน supabase/schema.sql: ทดลองใช้ฟรี สิทธิ์หมดอายุ การลบบัญชีขณะสมัครอยู่ และสิทธิ์ตาราง billing
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeDb, addUser, asUser } from './helpers/pg.mjs';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const closeBeta = (db) => db.exec(`update public.app_config set value = 'false' where key = 'open_beta'`);
const push = (db, uid) => asUser(db, uid, 'select public.push_records($1::jsonb) as r',
  [JSON.stringify([{ store: 'rounds', id: 'r', base_rev: null, data: { id: 'r' } }])]);

test('ผู้ใช้ใหม่ได้ทดลองใช้ 30 วันอัตโนมัติ และซิงก์ได้แม้ปิดช่วง beta', async () => {
  const db = await makeDb();
  await closeBeta(db);
  await addUser(db, A);
  const e = (await asUser(db, A, `select plan, status, source, extract(day from current_period_end - now())::int as days from public.entitlements`)).rows[0];
  assert.deepEqual([e.plan, e.status, e.source], ['trial', 'trialing', 'trial']);
  assert.ok(e.days >= 29 && e.days <= 30, `เหลือ ${e.days} วัน`);
  assert.equal((await push(db, A)).rows[0].r[0].status, 'ok');
});

test('ทดลองหมดอายุ → ซิงก์ไม่ได้ แต่ยังอ่านข้อมูลตัวเองได้', async () => {
  const db = await makeDb();
  await closeBeta(db);
  await addUser(db, A);
  await push(db, A);
  await db.query(`update public.entitlements set current_period_end = now() - interval '1 minute' where user_id = $1`, [A]);
  await assert.rejects(push(db, A), /subscription required/);
  assert.equal((await asUser(db, A, 'select id from public.records')).rows.length, 1);
});

test('ปรับจำนวนวันทดลองได้ และตั้ง 0 = ไม่มีทดลอง', async () => {
  const db = await makeDb();
  await db.exec(`update public.app_config set value = '0' where key = 'trial_days'`);
  await addUser(db, A);
  assert.equal((await db.query('select count(*)::int as n from public.entitlements')).rows[0].n, 0);
  await db.exec(`update public.app_config set value = '14' where key = 'trial_days'`);
  await addUser(db, B);
  const d = (await db.query(`select extract(day from current_period_end - now())::int as d from public.entitlements where user_id = $1`, [B])).rows[0].d;
  assert.ok(d >= 13 && d <= 14);
});

test('รันไฟล์ซ้ำ: ผู้ใช้เดิมที่ยังไม่มีสิทธิ์ได้ทดลอง ส่วนสมาชิกที่จ่ายแล้วไม่ถูกทับ', async () => {
  const db = await makeDb();
  await db.exec(`update public.app_config set value = '0' where key = 'trial_days'`);
  await addUser(db, A);   // สมัครก่อนมีระบบทดลอง
  await addUser(db, B);
  await db.query(`insert into public.entitlements (user_id, plan, status, current_period_end, source) values ($1, 'yearly', 'active', now() + interval '200 days', 'promptpay')`, [B]);
  await db.exec(`update public.app_config set value = '30' where key = 'trial_days'`);
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  const rows = (await db.query('select user_id, source from public.entitlements order by user_id')).rows;
  assert.deepEqual(rows.map((r) => r.source), ['trial', 'promptpay']);
});

test('ผู้ใช้อ่านสิทธิ์ตัวเองได้ แต่แก้เองหรืออ่านตาราง billing ไม่ได้', async () => {
  const db = await makeDb();
  await addUser(db, A);
  await addUser(db, B);
  assert.equal((await asUser(db, A, 'select user_id from public.entitlements')).rows.length, 1, 'เห็นเฉพาะของตัวเอง');
  await assert.rejects(asUser(db, A, `update public.entitlements set current_period_end = now() + interval '99 years'`), /permission denied/);
  await assert.rejects(asUser(db, A, `insert into public.entitlements (user_id, plan, status) values ('${A}', 'x', 'active')`), /permission denied/);
  await assert.rejects(asUser(db, A, 'select * from public.billing_customers'), /permission denied/);
  await assert.rejects(asUser(db, A, 'select * from public.stripe_events'), /permission denied/);
  await assert.rejects(asUser(db, A, 'select public.start_trial()'), /permission denied|trigger/);
});

test('ลบบัญชีไม่ได้ถ้ายังสมัครแบบตัดบัตรอยู่ แต่ลบได้หลังตั้งยกเลิกแล้ว', async () => {
  const db = await makeDb();
  await addUser(db, A);
  await db.query(`update public.entitlements set plan = 'monthly', status = 'active', source = 'stripe_subscription',
    current_period_end = now() + interval '20 days' where user_id = $1`, [A]);
  await assert.rejects(asUser(db, A, 'select public.delete_my_account()'), /active subscription/);
  await db.query('update public.entitlements set cancel_at_period_end = true where user_id = $1', [A]);
  await asUser(db, A, 'select public.delete_my_account()');
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, 0);
});

test('จ่ายแบบ PromptPay แล้วลบบัญชีได้ทันที (ไม่มีการตัดเงินอัตโนมัติ)', async () => {
  const db = await makeDb();
  await addUser(db, A);
  await db.query(`update public.entitlements set plan = 'yearly', status = 'active', source = 'promptpay' where user_id = $1`, [A]);
  await asUser(db, A, 'select public.delete_my_account()');
  assert.equal((await db.query('select count(*)::int as n from public.entitlements')).rows[0].n, 0);
});

test('จ่าย PromptPay ล่วงหน้า (prepaid_until) ซิงก์ได้แม้การสมัครตัดบัตรถูกยกเลิกแล้ว', async () => {
  const db = await makeDb();
  await closeBeta(db);
  await db.exec(`update public.app_config set value = '0' where key = 'trial_days'`);
  await addUser(db, A);
  await db.query(`insert into public.entitlements (user_id, plan, status, current_period_end, source, prepaid_until)
    values ($1, 'monthly', 'canceled', now() - interval '1 day', 'stripe_subscription', now() + interval '100 days')`, [A]);
  assert.equal((await push(db, A)).rows[0].r[0].status, 'ok');
  await db.query(`update public.entitlements set prepaid_until = now() - interval '1 second' where user_id = $1`, [A]);
  await assert.rejects(push(db, A), /subscription required/);
});

test('service role (Edge Function) เขียนตาราง billing ได้', async () => {
  const db = await makeDb();
  await addUser(db, A);
  await db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    await tx.query(`insert into public.stripe_events (id, type) values ('evt_1', 'checkout.session.completed')`);
    await tx.query(`insert into public.billing_customers (user_id, stripe_customer_id) values ($1, 'cus_1')`, [A]);
    await tx.query(`update public.entitlements set prepaid_until = now() + interval '365 days', source = 'promptpay' where user_id = $1`, [A]);
    const r = await tx.query('select source from public.entitlements where user_id = $1', [A]);
    assert.equal(r.rows[0].source, 'promptpay');
  });
});
