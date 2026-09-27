// ข้อมูลทั้งหมดโหลดเข้าหน่วยความจำตอนเปิดแอป แล้วเขียนผ่านลง IndexedDB ทุกครั้ง
import * as db from './db.js';
import { CURATED_COURSES } from './courses.js';
import { SCORECARDS } from './scorecards.js';
import { DEFAULT_CLUBS, DEFAULT_PHRASES } from './constants.js';
import { STORE_KEYS, DATA_STORES } from './logic.js';

export const S = {};
for (const name of db.STORE_NAMES) S[name] = new Map();

const keyOf = (store, obj) => obj[STORE_KEYS[store] || 'id'];

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export const nowIso = () => new Date().toISOString();

export function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- ดัชนีในหน่วยความจำ ----------
// หาหลุมของรอบ/ช็อตของหลุมโดยไม่ต้องไล่ข้อมูลทั้งหมดทุกครั้ง สร้างใหม่เมื่อข้อมูลเปลี่ยน (ดูจากเลขรุ่น)
let version = 0;
const indexes = new Map();
function groupIndex(store, field, sortFn) {
  const k = `${store}.${field}`;
  let e = indexes.get(k);
  if (!e || e.version !== version) {
    const m = new Map();
    for (const o of S[store].values()) {
      const key = o[field];
      let arr = m.get(key);
      if (!arr) m.set(key, (arr = []));
      arr.push(o);
    }
    if (sortFn) for (const arr of m.values()) arr.sort(sortFn);
    e = { version, m };
    indexes.set(k, e);
  }
  return e.m;
}
export const dataVersion = () => version;

export async function load() {
  for (const name of db.STORE_NAMES) {
    const all = await db.getAll(name);
    S[name] = new Map(all.map((o) => [keyOf(name, o), o]));
  }
  version++;
  const seed = [];
  if (!S.clubs.size) {
    DEFAULT_CLUBS.forEach(([lbl, cat], i) => seed.push({
      store: 'clubs',
      put: { id: uid(), label: lbl, category: cat, loft_optional: null, in_bag: true, order: i, updated_at: nowIso() },
    }));
  }
  if (!S.settings.has('distance_unit')) seed.push({ store: 'settings', put: { key: 'distance_unit', value: 'm' } });
  if (!S.settings.has('phrases')) seed.push({ store: 'settings', put: { key: 'phrases', value: DEFAULT_PHRASES } });
  if (!S.settings.has('priority_topics')) seed.push({ store: 'settings', put: { key: 'priority_topics', value: [] } });
  if (seed.length) await commit(seed);
}

// sync.js ต่อเข้ามาตรงนี้: outboxFor คืนรายการ outbox ที่ต้องเขียนใน transaction เดียวกัน
export const hooks = { outboxFor: null, afterCommit: null, changed: null };
const NO_STAMP = new Set(['settings', 'favorites', 'meta', 'outbox', 'syncrev', 'conflicts']);

// เขียนหลายรายการใน transaction เดียว แล้วค่อยอัปเดตหน่วยความจำเมื่อสำเร็จ
// raw: เขียนตามที่ได้รับ (ใช้ตอนรับข้อมูลจากคลาวด์) ไม่ประทับเวลาและไม่เข้าคิวซิงก์
export async function commit(ops, { raw = false } = {}) {
  let all = raw ? ops : ops.map((op) => {
    if (!('put' in op) || NO_STAMP.has(op.store)) return op;
    return { store: op.store, put: { ...op.put, updated_at: nowIso() } };
  });
  if (!raw && hooks.outboxFor) all = [...all, ...hooks.outboxFor(all)];
  await db.write(all);
  for (const op of all) {
    if ('put' in op) S[op.store].set(keyOf(op.store, op.put), op.put);
    else S[op.store].delete(op.del);
  }
  version++;
  hooks.changed?.();
  if (!raw) hooks.afterCommit?.();
}

export const put = (store, obj) => commit([{ store, put: obj }]);

// แก้เฉพาะช่องที่เปลี่ยน ทับลงบนข้อมูลล่าสุดในเครื่อง
// กันการเขียนทับด้วยสำเนาเก่าที่หน้าจอถือไว้ (เช่น ซิงก์เพิ่งดึงการแก้จากอีกเครื่องมา)
export function patchOp(store, id, changes) {
  const cur = S[store].get(id);
  if (!cur) throw new Error('ไม่พบข้อมูลนี้แล้ว (อาจถูกลบจากอีกเครื่อง) ลองกลับหน้าแรก');
  return { store, put: { ...cur, ...changes } };
}
export const patch = (store, id, changes) => commit([patchOp(store, id, changes)]);
export const del = (store, key) => commit([{ store, del: key }]);

export async function replaceAll(data) {
  await db.replaceAll(data);
  await load();
}

// เฉพาะข้อมูลการเล่น ไม่รวม session หรือสถานะซิงก์
export function dumpAll() {
  const out = {};
  for (const name of DATA_STORES) out[name] = [...S[name].values()];
  return out;
}

export const meta = (key, fallback = null) => S.meta.get(key)?.value ?? fallback;

// ---------- ตัวเลือกข้อมูล ----------

export const setting = (key, fallback = null) => S.settings.get(key)?.value ?? fallback;
export const setSetting = (key, value) => put('settings', { key, value });

export const clubs = () => [...S.clubs.values()].sort((a, b) => a.order - b.order);
export const bagClubs = () => clubs().filter((c) => c.in_bag);
export const club = (id) => (id ? S.clubs.get(id) ?? null : null);

// ตำแหน่งสนามที่ผู้ใช้บันทึกเอง (ตอนอยู่ที่สนาม) ใช้แทนพิกัดโดยประมาณ
const withGeo = (c) => {
  const mine = S.settings.get(`course_geo:${c.id}`)?.value;
  return mine ? { ...c, geo: mine } : c;
};
export const allCourses = () => [...CURATED_COURSES.map(withGeo), ...S.userCourses.values()];
export const course = (id) => {
  const c = CURATED_COURSES.find((x) => x.id === id);
  return c ? withGeo(c) : S.userCourses.get(id) ?? null;
};
export const favoriteSet = () => new Set(S.favorites.keys());

// สกอร์การ์ดของสนาม: ที่ผู้ใช้ถ่าย/แก้เองมาก่อนข้อมูลที่เตรียมไว้
export const scorecard = (id) => S.settings.get(`course_scorecard:${id}`)?.value ?? S.userCourses.get(id)?.scorecard ?? SCORECARDS[id] ?? null;

// เรียงใหม่สุดก่อน ข้อมูลที่ไม่มีวันที่ (เช่น ไฟล์สำรองเสีย) ไม่ทำให้แอปพัง
export const rounds = () => [...S.rounds.values()].sort((a, b) =>
  String(b.played_at || '').localeCompare(String(a.played_at || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
const byNumber = (a, b) => (Number(a.number) || 0) - (Number(b.number) || 0);
const bySeq = (a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0);
export const holesOf = (roundId) => [...(groupIndex('holes', 'round_id', byNumber).get(roundId) ?? [])];
export const shotsOf = (holeId) => [...(groupIndex('shots', 'hole_id', bySeq).get(holeId) ?? [])];
export const penaltiesOf = (holeId) => [...(groupIndex('penalties', 'hole_id').get(holeId) ?? [])];

// แถวสำหรับสรุป: ช็อตพร้อมบริบทหลุม รอบ และไม้
export function shotRows(roundIds) {
  const set = roundIds ? new Set(roundIds) : null;
  const rows = [];
  for (const shot of S.shots.values()) {
    if (set && !set.has(shot.round_id)) continue;
    const hole = S.holes.get(shot.hole_id);
    const round = S.rounds.get(shot.round_id);
    if (!hole || !round) continue;
    rows.push({ shot, hole, round, club: club(shot.club_id) });
  }
  return rows.sort((a, b) =>
    String(a.round.played_at || '').localeCompare(String(b.round.played_at || '')) || byNumber(a.hole, b.hole) || bySeq(a.shot, b.shot));
}
