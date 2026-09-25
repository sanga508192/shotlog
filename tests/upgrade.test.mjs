// อัปเดตจากแอปรุ่นแรก (ฐานข้อมูลรุ่น 1): ข้อมูลเดิมต้องอยู่ครบ
// และถ้ารุ่นเก่ายังเปิดค้างในอีกแท็บ ต้องรอให้ปิดแล้วทำต่อ ไม่ใช่ล้มเหลวถาวร
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../js/db.js';
import * as st from '../js/state.js';

const V1_STORES = {
  rounds: 'id', holes: 'id', shots: 'id', penalties: 'id', clubs: 'id',
  practice: 'id', userCourses: 'id', favorites: 'course_id', settings: 'key',
};

function openV1WithData() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('shotlog', 1);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of Object.entries(V1_STORES)) req.result.createObjectStore(name, { keyPath });
    };
    req.onsuccess = () => {
      const conn = req.result;   // รุ่นเก่าไม่มี onversionchange จึงไม่ปิดตัวเอง
      const tx = conn.transaction(['rounds', 'shots'], 'readwrite');
      tx.objectStore('rounds').put({ id: 'old-round', played_at: '2026-09-20', course_name_snapshot: 'เขื่อนสิรินธร' });
      tx.objectStore('shots').put({ id: 'old-shot', round_id: 'old-round', hole_id: 'h', sequence: 1, raw_distance_text: '2 คันธง' });
      tx.oncomplete = () => resolve(conn);
    };
    req.onerror = () => reject(req.error);
  });
}

test('รุ่นเก่าเปิดค้างอยู่: แจ้งให้ปิด แล้วอัปเกรดต่อเองโดยข้อมูลไม่หาย', async () => {
  const oldTab = await openV1WithData();
  let blocked = 0;
  db.events.blocked = () => { blocked++; };

  let loaded = false;
  const loading = st.load().then(() => { loaded = true; });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(blocked, 1, 'ต้องแจ้งว่าถูกแท็บอื่นขวาง');
  assert.equal(loaded, false, 'ต้องรอ ไม่ใช่ล้มเหลว');

  oldTab.close();   // ผู้ใช้ปิดแท็บรุ่นเก่า
  await loading;
  assert.equal(st.S.rounds.get('old-round').course_name_snapshot, 'เขื่อนสิรินธร');
  assert.equal(st.S.shots.get('old-shot').raw_distance_text, '2 คันธง');
  assert.equal(st.S.clubs.size, 13, 'สร้างกระเป๋าไม้ตั้งต้นให้');
  assert.ok(st.S.outbox && st.S.meta, 'มีคลังข้อมูลของระบบซิงก์แล้ว');
});
