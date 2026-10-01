// ทดสอบการส่งรายงานข้อผิดพลาด/ความเห็น: ส่งเฉพาะเมื่อเปิดเอง ไม่ส่งซ้ำ ไม่มีรหัสรอบในหน้าที่ส่ง
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../js/state.js';
import { pageName, sendError, sendFeedback, initReports, _reset } from '../js/reports.js';
import { logError } from '../js/errors.js';

// ใน Node ไม่มี localStorage (ที่เก็บข้อผิดพลาดในเครื่อง) ใช้แบบในหน่วยความจำแทน
if (!globalThis.localStorage) {
  const m = new Map();
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), body: JSON.parse(opts.body), auth: !!opts.headers.Authorization });
  return new Response('true', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

test('ชื่อหน้าที่ส่ง: ตัดรหัสรอบและค่าใน query ออก', () => {
  assert.equal(pageName('#/round/7b1f0c2e-8d4a-4e5b-9c1d-2f3a4b5c6d7e/hole/3?x=1'), '#/round/:id/hole/3');
  assert.equal(pageName('#/map/kirimaya/5?r=abc123def456ghi'), '#/map/kirimaya/5');
  assert.equal(pageName('#/coach'), '#/coach');
});

test('รายงานข้อผิดพลาด: ปิดอยู่ไม่ส่ง · เปิดแล้วส่งครั้งเดียวต่อข้อผิดพลาด · ไม่เข้าสู่ระบบส่งแบบไม่ระบุบัญชี', async () => {
  await st.load();
  _reset();
  calls.length = 0;
  const item = { where: 'render #/coach', msg: 'x is undefined', stack: 'at a.js:1' };
  assert.equal(await sendError(item), false);
  assert.equal(calls.length, 0, 'ยังไม่ได้เปิด');
  await st.setSetting('report_errors', true);
  assert.equal(await sendError(item), true);
  assert.equal(await sendError(item), false, 'ข้อผิดพลาดเดิมไม่ส่งซ้ำ');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/send_report$/);
  assert.equal(calls[0].auth, false);
  assert.equal(calls[0].body.kind, 'error');
  assert.equal(calls[0].body.message, 'render #/coach: x is undefined');
  assert.ok(!('round' in calls[0].body) && !('email' in calls[0].body));

  // ต่อกับ logError: ข้อผิดพลาดใหม่ถูกส่งเอง
  initReports();
  logError('action save', new Error('boom'));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.at(-1).body.message, 'action save: boom');

  await sendFeedback('  ปุ่มพัตดีมาก  ', { contact: ' line:me ', withErrors: true });
  const fb = calls.at(-1).body;
  assert.deepEqual([fb.kind, fb.message, fb.contact], ['feedback', 'ปุ่มพัตดีมาก', 'line:me']);
  assert.match(fb.detail, /action save: boom/);
  await st.setSetting('report_errors', false);
});
