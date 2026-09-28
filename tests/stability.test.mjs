// ทดสอบกลไกกันพัง: ไฟล์ออฟไลน์ครบ ฐานข้อมูลหลุดแล้วต่อใหม่ เครือข่ายค้าง การเตือนสำรองข้อมูล
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as st from '../js/state.js';
import * as db from '../js/db.js';
import * as cloud from '../js/cloud.js';
import { logError, recentErrors } from '../js/errors.js';
import { backupWarn } from '../js/views/main.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function listFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

test('ไฟล์แอปทุกไฟล์อยู่ในรายการเก็บออฟไลน์ของ service worker และทุกรายการมีไฟล์จริง', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const a of assets) assert.ok(existsSync(join(ROOT, a)), `ไม่มีไฟล์ ${a}`);
  const needed = [
    ...listFiles(join(ROOT, 'js')).map((p) => p.slice(ROOT.length).replace(/\\/g, '/').replace(/^\//, '')),
    ...listFiles(join(ROOT, 'fonts')).filter((p) => p.endsWith('.woff2')).map((p) => p.slice(ROOT.length).replace(/\\/g, '/').replace(/^\//, '')),
    'index.html', 'css/app.css', 'manifest.webmanifest',
  ];
  const missing = needed.filter((f) => !assets.includes(f));
  assert.deepEqual(missing, [], 'ต้องเพิ่มใน ASSETS ของ sw.js ไม่งั้นเปิดออฟไลน์แล้วพัง');
});

test('การเชื่อมต่อฐานข้อมูลหลุด (แบบ iPhone) → เปิดใหม่แล้วบันทึกต่อได้ ข้อมูลไม่หาย', async () => {
  await st.load();
  await st.put('practice', { id: 'p1', date: '2026-09-27', topic: 'ก่อนหลุด' });
  (await db.open()).close();   // จำลองระบบปิดการเชื่อมต่อทิ้ง
  await st.put('practice', { id: 'p2', date: '2026-09-27', topic: 'หลังหลุด' });
  await db.close();
  await st.load();
  assert.deepEqual([...st.S.practice.keys()].sort(), ['p1', 'p2']);
});

test('ข้อผิดพลาดอื่นที่ไม่ใช่การเชื่อมต่อหลุด ไม่ลองซ้ำและไม่กลืนหาย', async () => {
  await assert.rejects(db.write([{ store: 'no-such-store', put: { id: 1 } }]), (err) => !db.isConnectionLost(err));
});

test('เครือข่ายค้าง → หมดเวลาและถือว่าออฟไลน์ ไม่ค้างตลอดไป', async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; cloud._setTimeoutMs(20000); });
  globalThis.fetch = (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  cloud._setTimeoutMs(50);
  await st.commit([{ store: 'meta', put: { key: 'session', value: { access_token: 't', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600, user: { id: 'u' } } } }], { raw: true });
  const t0 = Date.now();
  await assert.rejects(cloud.pull(0, 10), (err) => err instanceof TypeError);
  assert.ok(Date.now() - t0 < 2000);
  await st.commit([{ store: 'meta', del: 'session' }], { raw: true });
});

test('เตือนสำรองข้อมูลเมื่อไม่ได้ส่งออกเกิน 30 วัน (ไม่ได้ใช้คลาวด์ และมีอย่างน้อย 3 รอบ)', () => {
  const now = Date.parse('2026-09-27T00:00:00Z');
  assert.equal(backupWarn(2, null, now), '', 'ยังมีข้อมูลน้อย');
  assert.match(backupWarn(5, null, now), /ยังไม่เคยสำรองข้อมูล/);
  assert.match(backupWarn(5, '2026-08-01T00:00:00Z', now), /ไม่ได้สำรองข้อมูลมา 57 วัน/);
  assert.equal(backupWarn(5, '2026-09-20T00:00:00Z', now), '');
});

test('บันทึกข้อผิดพลาดได้แม้ไม่มี localStorage และแจ้งการเปลี่ยนแปลงให้หน้าต่างอื่น', async () => {
  const item = logError('ทดสอบ', new Error('บางอย่างพัง'));
  assert.equal(item.msg, 'บางอย่างพัง');
  assert.ok(Array.isArray(recentErrors()));
  let n = 0;
  st.hooks.changed = () => { n++; };
  await st.put('practice', { id: 'p3', date: '2026-09-27', topic: 'x' });
  st.hooks.changed = null;
  assert.equal(n, 1);
});

test('หน้าจอถือสำเนาเก่าอยู่ แล้วซิงก์ดึงการแก้จากอีกเครื่องมา → กดบันทึกต้องไม่ทับการแก้นั้น', async () => {
  const { setGroupScore, parsView } = await import('../js/views/group.js');
  const round = { id: 'rs', played_at: '2026-09-27', course_id: 'x', course_name_snapshot: 'x', status: 'playing', shot_logging: false, players: [{ id: 'me', name: 'ฉัน' }, { id: 'p1', name: 'Tom' }], games: [] };
  const hole = { id: 'hs1', round_id: 'rs', number: 1, par: 4, hc_index: null, status: 'playing', group_scores: {} };
  await st.commit([{ store: 'rounds', put: round }, { store: 'holes', put: hole }]);
  const view = parsView(['rs'], { rerender() {}, go() {} });   // หน้าจอเปิดค้างไว้
  const staleRound = st.S.rounds.get('rs');
  const staleHole = st.S.holes.get('hs1');
  // อีกเครื่องเพิ่มเกมและใส่ HC (ซิงก์เขียนตรงเข้าเครื่อง)
  await st.commit([
    { store: 'rounds', put: { ...round, games: [{ id: 'g1', type: 'skin' }] } },
    { store: 'holes', put: { ...hole, hc_index: 7 } },
  ], { raw: true });
  await setGroupScore(staleRound, staleHole, 'me', 5);
  await view.actions.par({ dataset: { field: '1', v: '5' } });
  const r = st.S.rounds.get('rs'), h = st.S.holes.get('hs1');
  assert.equal(r.games.length, 1, 'เกมที่อีกเครื่องเพิ่มต้องยังอยู่');
  assert.equal(h.hc_index, 7, 'HC ที่อีกเครื่องใส่ต้องยังอยู่');
  assert.equal(h.group_scores.me, 5);
  assert.equal(h.par, 5);
  // ข้อมูลถูกลบจากอีกเครื่องแล้ว → แจ้งผิดพลาด ไม่สร้างข้อมูลที่ลบแล้วกลับขึ้นมา
  await st.commit([{ store: 'holes', del: 'hs1' }], { raw: true });
  await assert.rejects(setGroupScore(staleRound, staleHole, 'me', 4), /ไม่พบข้อมูลนี้แล้ว/);
  assert.equal(st.S.holes.has('hs1'), false);
});

test('ตำแหน่งรูปก๊วน: เต็มกรอบเป็นค่าเริ่มต้น เลื่อนได้ไม่หลุดขอบ ย่อได้จนเห็นทั้งรูป', async () => {
  const { photoPlacement, MAX_ZOOM } = await import('../js/share.js');
  // รูป 4:3 ในกรอบกว้าง 1000 สูง 450
  const d = photoPlacement(4000, 3000, 1000, 450);
  assert.deepEqual([d.w, d.h, d.x, d.y, d.fits], [1000, 750, 0, -150, true], 'เต็มกรอบ ตรงกลาง');
  const top = photoPlacement(4000, 3000, 1000, 450, { cy: 0 });
  assert.equal(top.y, 0, 'ลากขึ้นสุดชนขอบบน ไม่มีช่องว่าง');
  assert.equal(top.cy, 0.3, 'เก็บจุดกลางจริงหลังชนขอบ');
  const bottom = photoPlacement(4000, 3000, 1000, 450, { cy: 5 });
  assert.equal(bottom.y, 450 - 750, 'ชนขอบล่าง');
  const fit = photoPlacement(4000, 3000, 1000, 450, { zoom: 0.01 });
  assert.deepEqual([fit.zoom, fit.w, fit.h, fit.x, fit.y, fit.fits], [0.6, 600, 450, 200, 0, false], 'ย่อได้ต่ำสุดแค่เห็นทั้งรูป');
  const big = photoPlacement(4000, 3000, 1000, 450, { zoom: 99, cx: 0.9, cy: 0.9 });
  assert.equal(big.zoom, MAX_ZOOM);
  assert.ok(big.x <= 0 && big.x >= 1000 - big.w && big.y <= 0 && big.y >= 450 - big.h, 'ขยายแล้วยังไม่หลุดขอบ');
});
