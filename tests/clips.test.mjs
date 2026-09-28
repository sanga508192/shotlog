// ทดสอบคลิปสอน: อ่านลิงก์หลายรูปแบบ กันลิงก์อันตราย เก็บ/ลบ และข้อมูลเสียไม่ทำให้พัง
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as st from '../js/state.js';
import { parseClip, parseStart, clipsOf, addClip, removeClip, embedUrl, searchUrl, MAX_CLIPS, CLIPS_KEY } from '../js/clips.js';
import { DRILLS } from '../js/coach.js';

test('อ่านลิงก์ YouTube ได้ทุกรูปแบบ', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}&feature=share`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `youtu.be/${id}`,
    `ดูคลิปนี้สิ https://youtu.be/${id} ดีมาก`,
  ]) {
    const c = parseClip(u);
    assert.equal(c?.kind, 'youtube', u);
    assert.equal(c.id, id, u);
    assert.equal(c.url, `https://www.youtube.com/watch?v=${id}`, u);
  }
  const t = parseClip(`https://youtu.be/${id}?t=95`);
  assert.equal(t.start, 95);
  assert.equal(t.url, `https://www.youtube.com/watch?v=${id}&t=95s`);
  assert.match(embedUrl(t), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*start=95/);
  assert.equal(parseStart('1m30s'), 90);
  assert.equal(parseStart('1h2m3s'), 3723);
  assert.equal(parseStart('45s'), 45);
  assert.equal(parseStart('abc'), 0);
});

test('ลิงก์อื่นเก็บเป็นลิงก์เปิดนอกแอป ลิงก์อันตรายหรือไม่ใช่ลิงก์ถูกปฏิเสธ', () => {
  const tk = parseClip('https://www.tiktok.com/@coach/video/123');
  assert.deepEqual([tk.kind, tk.host], ['link', 'tiktok.com']);
  assert.equal(parseClip('https://www.youtube.com/@somechannel').kind, 'link', 'ช่อง YouTube ไม่ใช่คลิป');
  assert.equal(parseClip('https://youtu.be/short')?.kind, 'link', 'รหัสคลิปผิดรูปแบบ');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ไม่ใช่ลิงก์', '', null, undefined, 42]) {
    assert.equal(parseClip(bad), null, String(bad));
  }
  assert.equal(searchUrl('สอน พัตต์'), 'https://www.youtube.com/results?search_query=%E0%B8%AA%E0%B8%AD%E0%B8%99%20%E0%B8%9E%E0%B8%B1%E0%B8%95%E0%B8%95%E0%B9%8C');
});

test('ทุกแบบฝึกมีคำค้นคลิปทั้งไทยและอังกฤษ', () => {
  for (const d of DRILLS) {
    assert.ok(d.video?.th && d.video?.en, d.id);
  }
});

test('เก็บ/ลบคลิป กันซ้ำ จำกัดจำนวน และข้อมูลเสียถูกข้าม', async () => {
  await st.load();
  const yt = (n) => parseClip(`https://youtu.be/${String(n).padStart(11, 'a')}`);
  assert.equal(await addClip('putt-circle', yt(1), { title: 'พัตสั้น' }), 'ok');
  assert.equal(await addClip('putt-circle', yt(1)), 'dup');
  assert.deepEqual(clipsOf('putt-circle').map((c) => [c.title, c.embed]), [['พัตสั้น', true]]);
  for (let i = 2; i <= MAX_CLIPS; i++) assert.equal(await addClip('putt-circle', yt(i)), 'ok');
  assert.equal(await addClip('putt-circle', yt(99)), 'full');
  await removeClip('putt-circle', yt(1).url);
  assert.equal(clipsOf('putt-circle').length, MAX_CLIPS - 1);
  assert.equal(clipsOf('tee-gate').length, 0, 'แบบฝึกอื่นไม่เกี่ยว');
  // ข้อมูลเสียจากเครื่องอื่นหรือไฟล์นำเข้า
  await st.setSetting(CLIPS_KEY, { 'putt-circle': [null, 'x', { url: 'javascript:alert(1)' }, { url: yt(7).url, title: 5, embed: false }], 'tee-gate': 'bad' });
  assert.deepEqual(clipsOf('putt-circle').map((c) => [c.id, c.title, c.embed]), [[yt(7).id, '', false]]);
  assert.deepEqual(clipsOf('tee-gate'), []);
  await st.setSetting(CLIPS_KEY, ['not', 'an', 'object']);
  assert.deepEqual(clipsOf('putt-circle'), []);
  assert.equal(await addClip('putt-circle', yt(8)), 'ok', 'เขียนทับข้อมูลเสียได้');
  await removeClip('putt-circle', yt(8).url);
  assert.deepEqual(st.setting(CLIPS_KEY, null), {}, 'ลบคลิปสุดท้ายแล้วไม่เหลือรายการว่าง');
});
