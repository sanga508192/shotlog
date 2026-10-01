// ทดสอบการเลือกภาพดาวเทียมที่ต้องเก็บไว้ก่อนออกรอบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { courseTiles, MAX_TILES, PREFETCH_ZOOMS } from '../js/tiles.js';
import { COURSE_HOLES } from '../js/holedata.js';
import { mercator } from '../js/holemap.js';

const pinsOf = (id) => Object.fromEntries(Object.entries(COURSE_HOLES[id].holes).map(([n, h]) => [n, { tee: { lat: h.tee[0], lon: h.tee[1] }, green: { lat: h.green[0], lon: h.green[1] } }]));
const tileOf = (p, z) => { const m = mercator(p); return `${z}/${Math.floor(m.x * 2 ** z)}/${Math.floor(m.y * 2 ** z)}`; };

test('เก็บแผนที่สนาม: ครอบทุกแท่นทีและกรีน ทุกระดับซูม ไม่เกินจำนวนที่กำหนด', () => {
  const holes = pinsOf('kirimaya');
  const tiles = courseTiles(holes);
  const keys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`));
  assert.equal(keys.size, tiles.length, 'ไม่ซ้ำ');
  assert.ok(tiles.length > 100 && tiles.length <= MAX_TILES, `${tiles.length} ภาพ`);
  for (const h of Object.values(holes)) {
    for (const z of PREFETCH_ZOOMS) {
      assert.ok(keys.has(tileOf(h.tee, z)), `แท่นที z${z}`);
      assert.ok(keys.has(tileOf(h.green, z)), `กรีน z${z}`);
    }
  }
});

test('เก็บแผนที่สนาม: พื้นที่ที่ไม่มีภาพละเอียดสุดไม่โหลด · ไม่มีหมุดใช้ตำแหน่งสนาม · ไม่มีอะไรเลยได้รายการว่าง', () => {
  const holes = pinsOf('kirimaya');
  assert.ok(courseTiles(holes, { maxZoom: () => 18 }).every((t) => t.z <= 18));
  const around = courseTiles({}, { center: { lat: 14.5, lon: 101.4 } });
  assert.ok(around.length > 10 && around.length <= MAX_TILES);
  assert.ok(new Set(around.map((t) => `${t.z}/${t.x}/${t.y}`)).has(tileOf({ lat: 14.5, lon: 101.4 }, 17)));
  assert.deepEqual(courseTiles({}), []);
  assert.deepEqual(courseTiles({ 1: { tee: { lat: 'x' } } }), []);
});

test('เก็บแผนที่สนาม: ระดับซูมที่ Esri ไม่มีภาพ (404) ถูกตัดออกก่อนโหลด · เน็ตมีปัญหาไม่ตัดอะไร', async () => {
  const { dropMissingZooms } = await import('../js/tiles.js');
  const tiles = courseTiles(pinsOf('kirimaya'));
  const no19 = await dropMissingZooms(tiles, null, { fetchFn: async (u) => ({ status: /tile\/19\//.test(u) ? 404 : 200 }) });
  assert.ok(no19.length < tiles.length && no19.every((t) => t.z <= 18));
  assert.deepEqual([...new Set(no19.map((t) => t.z))].sort(), [16, 17, 18]);
  const offline = await dropMissingZooms(tiles, null, { fetchFn: async () => { throw new TypeError('offline'); } });
  assert.equal(offline.length, tiles.length);
  const all = await dropMissingZooms(tiles, null, { fetchFn: async () => ({ status: 200 }) });
  assert.equal(all.length, tiles.length);
});
