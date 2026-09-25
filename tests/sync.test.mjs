// ทดสอบการซิงก์ของจริง: state.js + sync.js บน IndexedDB จำลอง คุยกับ schema.sql บน Postgres จำลอง
// "เปลี่ยนเครื่อง" = ลบฐานข้อมูลในเครื่องแล้วโหลดใหม่ ส่วน "อีกเครื่องแก้" = ส่งตรงเข้าเซิร์ฟเวอร์
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDb, addUser, fakeApi, asUser } from './helpers/pg.mjs';
import * as st from '../js/state.js';
import * as db from '../js/db.js';
import * as sync from '../js/sync.js';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
let uid = A;

async function freshDevice() {
  await db.close();
  await new Promise((res, rej) => {
    const r = indexedDB.deleteDatabase('shotlog');
    r.onsuccess = res; r.onerror = rej;
  });
  await st.load();
}

async function serverRow(pg, store, id) {
  return (await asUser(pg, uid, 'select data, deleted, rev::int as rev from public.records where store = $1 and id = $2', [store, id])).rows[0];
}

async function makeRound() {
  const round = { id: 'r1', played_at: '2026-09-25', course_id: 'kirimaya', course_name_snapshot: 'คีรีมายา', province_snapshot: 'นครราชสีมา', status: 'playing', hole_count: 1 };
  const hole = { id: 'h1', round_id: 'r1', number: 1, par: 4, status: 'playing' };
  const club = st.bagClubs().find((c) => c.label === 'SW');
  const shot = { id: 's1', round_id: 'r1', hole_id: 'h1', sequence: 1, club_id: club.id, shot_type: 'chip', assessment: 'needs_work', contact: 'fat', raw_distance_text: '2 คันธง', counted: true };
  await st.commit([{ store: 'rounds', put: round }, { store: 'holes', put: hole }, { store: 'shots', put: shot }]);
}

test('ซิงก์ครบวงจร', async (t) => {
  const pg = await makeDb();
  await addUser(pg, A);
  await addUser(pg, B);
  sync._setApi({ ready: () => true, ...fakeApi(pg, () => uid) });
  t.after(() => sync._stop());

  await t.test('เครื่อง 1: จดก่อนเข้าสู่ระบบ แล้วผูกบัญชี → ส่งขึ้นทั้งหมด', async () => {
    await freshDevice();
    await makeRound();
    assert.equal(st.S.outbox.size, 0, 'ยังไม่ผูกบัญชี ไม่ต้องมีคิว');
    await sync.link(A);
    assert.equal(st.S.outbox.size, 0);
    assert.equal(sync.status().phase, 'ok');
    const row = await serverRow(pg, 'shots', 's1');
    assert.equal(row.data.raw_distance_text, '2 คันธง');
    const clubs = (await asUser(pg, A, `select count(*)::int as n from public.records where store = 'clubs'`)).rows[0].n;
    assert.equal(clubs, 13);
  });

  await t.test('แก้หลังผูกบัญชี → เข้าคิว แล้วขึ้นคลาวด์เป็น rev 2', async () => {
    await st.put('shots', { ...st.S.shots.get('s1'), note: 'ฉึกอีกแล้ว' });
    assert.equal(st.S.outbox.size, 1);
    assert.equal(sync.status().pending, 1);
    await sync.syncNow();
    assert.equal(st.S.outbox.size, 0);
    const row = await serverRow(pg, 'shots', 's1');
    assert.deepEqual([row.rev, row.data.note], [2, 'ฉึกอีกแล้ว']);
  });

  await t.test('ส่งออกไฟล์สำรองไม่มี session หรือสถานะซิงก์', async () => {
    await st.commit([{ store: 'meta', put: { key: 'session', value: { access_token: 'secret' } } }], { raw: true });
    const dump = st.dumpAll();
    assert.ok(!('meta' in dump) && !('outbox' in dump));
    assert.ok(!JSON.stringify(dump).includes('secret'));
  });

  await t.test('เครื่อง 2 (ใหม่): ผูกบัญชีเดิม → ได้ข้อมูลครบ ไม่มีไม้ซ้ำ', async () => {
    await freshDevice();
    assert.equal(st.S.clubs.size, 13, 'เครื่องใหม่มีไม้ตั้งต้นของตัวเอง');
    await sync.link(A);
    assert.equal(st.S.shots.get('s1').note, 'ฉึกอีกแล้ว');
    assert.equal(st.S.rounds.get('r1').course_name_snapshot, 'คีรีมายา');
    assert.equal(st.S.clubs.size, 13, 'ไม้ตั้งต้นของเครื่องใหม่ต้องไม่ถูกส่งขึ้นซ้ำ');
    assert.equal(st.S.conflicts.size, 0);
    assert.equal(st.S.outbox.size, 0);
    const clubs = (await asUser(pg, A, `select count(*)::int as n from public.records where store = 'clubs' and not deleted`)).rows[0].n;
    assert.equal(clubs, 13);
  });

  await t.test('แก้ชนกัน: ไม่เขียนทับเงียบ ๆ และให้ผู้ใช้เลือก', async () => {
    // เครื่องนี้แก้ตอนออฟไลน์
    sync._setApi({ ready: () => false, ...fakeApi(pg, () => uid) });
    await st.put('shots', { ...st.S.shots.get('s1'), note: 'จากเครื่อง 2' });
    // อีกเครื่องแก้และซิงก์ไปก่อน
    const other = { ...st.S.shots.get('s1'), note: 'จากเครื่อง 1' };
    await fakeApi(pg, () => uid).push([{ store: 'shots', id: 's1', base_rev: 2, data: other }]);
    sync._setApi({ ready: () => true, ...fakeApi(pg, () => uid) });
    await sync.syncNow();

    assert.equal(st.S.conflicts.size, 1);
    assert.equal(sync.status().conflicts, 1);
    assert.equal(st.S.shots.get('s1').note, 'จากเครื่อง 2', 'ของในเครื่องต้องยังอยู่');
    assert.equal((await serverRow(pg, 'shots', 's1')).data.note, 'จากเครื่อง 1', 'ของบนคลาวด์ต้องยังอยู่');

    await sync.resolveConflict('shots|s1', 'local');
    await sync.syncNow();
    assert.equal(st.S.conflicts.size, 0);
    const row = await serverRow(pg, 'shots', 's1');
    assert.deepEqual([row.rev, row.data.note], [4, 'จากเครื่อง 2']);
  });

  await t.test('เลือกใช้ของคลาวด์', async () => {
    sync._setApi({ ready: () => false, ...fakeApi(pg, () => uid) });
    await st.put('holes', { ...st.S.holes.get('h1'), par: 5 });
    const cloudHole = { ...st.S.holes.get('h1'), par: 3 };
    const base = (await serverRow(pg, 'holes', 'h1')).rev;
    await fakeApi(pg, () => uid).push([{ store: 'holes', id: 'h1', base_rev: base, data: cloudHole }]);
    sync._setApi({ ready: () => true, ...fakeApi(pg, () => uid) });
    await sync.syncNow();
    assert.equal(st.S.conflicts.size, 1);
    await sync.resolveConflict('holes|h1', 'server');
    await sync.syncNow();
    assert.equal(st.S.holes.get('h1').par, 3);
    assert.equal(st.S.outbox.size, 0);
    assert.equal(st.S.conflicts.size, 0);
  });

  await t.test('ลบในเครื่อง → ลบบนคลาวด์ และเครื่องอื่นลบตาม', async () => {
    await st.del('shots', 's1');
    await sync.syncNow();
    assert.equal((await serverRow(pg, 'shots', 's1')).deleted, true);
    await freshDevice();
    await sync.link(A);
    assert.equal(st.S.shots.has('s1'), false);
    assert.equal(st.S.holes.has('h1'), true);
  });

  await t.test('เครื่องที่ผูกกับบัญชีหนึ่ง จะผูกกับอีกบัญชีต้องลบข้อมูลในเครื่องก่อน', async () => {
    uid = B;
    await assert.rejects(sync.link(B), /OTHER_OWNER/);
    await sync.wipeLocal();
    await sync.link(B);
    assert.equal(st.S.rounds.size, 0, 'บัญชี B ต้องไม่เห็นข้อมูลของ A');
    uid = A;
  });

  await t.test('ผู้ฟังสถานะที่สมัครใหม่ระหว่างแจ้ง (หน้าจอ render ใหม่) ต้องไม่วนไม่รู้จบ', async () => {
    let calls = 0;
    let off = null;
    const listen = () => { calls++; off?.(); off = sync.onStatus(listen); };
    off = sync.onStatus(listen);
    await sync.syncNow();
    off();
    assert.ok(calls < 10, `เรียก ${calls} ครั้ง`);
  });

  await t.test('ไม่มีสิทธิ์สมาชิก → สถานะ needs_plan และข้อมูลยังรออยู่ในคิว', async () => {
    await freshDevice();
    await sync.link(A);
    await pg.exec(`update public.app_config set value = 'false' where key = 'open_beta'`);
    await st.put('rounds', { ...st.S.rounds.get('r1'), note: 'หลังหมดสิทธิ์' });
    const forbidden = { ...fakeApi(pg, () => uid) };
    const push = forbidden.push;
    forbidden.push = (items) => push(items).catch((e) => { throw Object.assign(new Error(e.message), { status: 403, code: '42501' }); });
    sync._setApi({ ready: () => true, ...forbidden });
    await sync.syncNow().catch(() => {});
    assert.equal(sync.status().phase, 'needs_plan');
    assert.equal(st.S.outbox.size, 1);
    assert.equal(st.S.rounds.get('r1').note, 'หลังหมดสิทธิ์');
  });
});
