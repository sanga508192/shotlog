// ทดสอบบั๊กที่พบจากการตรวจ 28 ก.ย. 2569 ไม่ให้กลับมาอีก
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardView, ago } from '../js/live-render.js';
import * as st from '../js/state.js';
import { courseHoles, confirmedPoint, setHolePoint } from '../js/holemap.js';

test('สกอร์สด: ข้อมูลบอร์ดที่เป็นอันตรายไม่กลายเป็น HTML (กัน XSS บนโดเมนของแอป)', () => {
  const bad = '<img src=x onerror=alert(1)>';
  const v = boardView({
    updated_at: bad,
    data: {
      course: bad, tee: bad, date: bad,
      holes: [{ n: bad, par: bad }, { n: 2, par: '"><script>x</script>' }, null, 'x'],
      players: [{ name: bad, total: bad, thru: bad, over: bad, scores: [bad, 4, { a: 1 }] }, null, 5],
      games: [{ title: bad, items: [{ name: bad, value: bad }, null] }, null, 'x'],
    },
  });
  // sub/title ถูกใส่ด้วย textContent/document.title (เป็นข้อความเสมอ) ส่วน html ต้องไม่มีแท็กจากข้อมูล
  assert.ok(!/<(img|script|svg|iframe)/i.test(v.html), v.html.slice(0, 300));
  assert.ok(!/"\s*on\w+=/i.test(v.html), 'ไม่มี attribute ที่ถูกแทรก');
  assert.ok(!v.html.includes('<img'));
  assert.ok(!v.html.includes('<script'));
  assert.ok(v.html.includes('&lt;img'), 'ชื่อที่เป็นข้อความยังแสดงได้ (แบบปลอดภัย)');
});

test('สกอร์สด: ข้อมูลรูปทรงผิดหรือว่างไม่ทำให้หน้าพัง และบอร์ดปกติแสดงถูก', () => {
  for (const b of [null, undefined, 5, 'x', {}, { data: null }, { data: [] }, { data: { players: 'x', holes: 7, games: {} } }]) {
    assert.doesNotThrow(() => boardView(b));
  }
  const v = boardView({
    updated_at: '2026-09-28T10:00:00Z',
    data: { course: 'คีรีมายา', tee: 'ขาว', date: '2026-09-28', holes: [{ n: 1, par: 4 }, { n: 2, par: 3 }], players: [{ name: 'ต้น', scores: [6, null], total: 6, thru: 1, over: 2 }, { name: 'ฉัน', scores: [3, 3], total: 6, thru: 2, over: -1 }] },
  }, Date.parse('2026-09-28T10:05:00Z'));
  assert.equal(v.sub, 'คีรีมายา · แท่นขาว · 2026-09-28');
  assert.ok(v.html.indexOf('ฉัน') < v.html.indexOf('ต้น'), 'เรียงตามสกอร์เทียบพาร์');
  assert.ok(v.html.includes('class="birdie">3<'));
  assert.ok(v.html.includes('5 นาทีที่แล้ว'));
  assert.equal(ago('ไม่ใช่เวลา'), '–');
});

test('หมุดประมาณไม่ถูกใช้คำนวณข้อมูลที่บันทึกถาวร (ระยะช็อต ระยะไม้)', async () => {
  await st.load();
  await st.setSetting('course_holes:kirimaya', null);
  const est = courseHoles('kirimaya')[1];
  assert.ok(est.tee && est.green);
  assert.equal(confirmedPoint(est, 'green'), null, 'กรีนประมาณ');
  assert.equal(confirmedPoint(est, 'tee'), null, 'แท่นทีประมาณ');
  await setHolePoint('kirimaya', 1, 'green', { lat: 14.5104, lon: 101.4309 });
  const h = courseHoles('kirimaya')[1];
  assert.deepEqual(confirmedPoint(h, 'green'), { lat: 14.5104, lon: 101.4309 }, 'กรีนที่วางเองใช้ได้');
  assert.equal(confirmedPoint(h, 'tee'), null, 'แท่นทียังเป็นค่าประมาณ');
  assert.equal(confirmedPoint(null, 'tee'), null);
});

test('ซิงก์: บันทึกเครื่องซ้อมขนาดใหญ่ถูกแบ่งส่งทีละไม่เกิน ~400 KB · ดึงข้อมูลหมดเวลาแล้วลดขนาดหน้าเอง', async () => {
  const sync = await import('../js/sync.js');
  const sent = [];
  let failBig = true;
  sync._setApi({
    ready: () => true,
    push: async (items) => { sent.push(JSON.stringify(items).length); return items.map((it) => ({ store: it.store, id: it.id, status: 'ok', rev: 1, seq: 1 })); },
    pull: async (_cursor, limit) => {
      if (failBig && limit > 100) throw Object.assign(new TypeError('เครือข่ายช้าเกินไป'), { timeout: true });
      return [];
    },
  });
  await st.commit([{ store: 'meta', put: { key: 'linked_owner', value: 'u1' } }], { raw: true });
  const shots = Array.from({ length: 400 }, (_, i) => ['ไดรเวอร์', 41.5, 55.3 + i / 1000, 1.34, 12.4, -3.2, 4576, 175.9, -6.4, 188.4, 4.3, -11.8, -2.6, 7.9]);
  await st.commit(Array.from({ length: 30 }, (_, i) => ({ store: 'practice', put: { id: `big${i}`, kind: 'launch', date: '2026-09-28', launch: { v: 1, sig: `s${i}`, shots } } })));
  // ดึงหน้าใหญ่หมดเวลา → ครั้งถัดไปขอหน้าเล็กลง จนสำเร็จ
  let ok = false;
  for (let i = 0; i < 6 && !ok; i++) {
    try { await sync.syncNow(); ok = true; } catch (err) { assert.ok(err.timeout); }
  }
  assert.ok(ok, 'ซิงก์สำเร็จหลังลดขนาดหน้า');
  assert.ok(sync._pageSize() <= 200);
  assert.ok(sent.length >= 3, `ส่ง ${sent.length} ครั้ง`);
  assert.ok(sent.every((n) => n <= 420 * 1024), `ขนาดต่อครั้ง ${sent.map((n) => Math.round(n / 1024)).join(', ')} KB`);
  assert.equal(st.S.outbox.size, 0, 'ส่งครบทุกรายการ');
  failBig = false;
  sync._stop();
});
