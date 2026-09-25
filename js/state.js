// ข้อมูลทั้งหมดโหลดเข้าหน่วยความจำตอนเปิดแอป แล้วเขียนผ่านลง IndexedDB ทุกครั้ง
import * as db from './db.js';
import { CURATED_COURSES } from './courses.js';
import { DEFAULT_CLUBS, DEFAULT_PHRASES } from './constants.js';
import { STORE_KEYS } from './logic.js';

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

export async function load() {
  for (const name of db.STORE_NAMES) {
    const all = await db.getAll(name);
    S[name] = new Map(all.map((o) => [keyOf(name, o), o]));
  }
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

// เขียนหลายรายการใน transaction เดียว แล้วค่อยอัปเดตหน่วยความจำเมื่อสำเร็จ
export async function commit(ops) {
  const stamped = ops.map((op) => {
    if (!('put' in op)) return op;
    const obj = op.store === 'settings' || op.store === 'favorites' ? op.put : { ...op.put, updated_at: nowIso() };
    return { store: op.store, put: obj };
  });
  await db.write(stamped);
  for (const op of stamped) {
    if ('put' in op) S[op.store].set(keyOf(op.store, op.put), op.put);
    else S[op.store].delete(op.del);
  }
}

export const put = (store, obj) => commit([{ store, put: obj }]);
export const del = (store, key) => commit([{ store, del: key }]);

export async function replaceAll(data) {
  await db.replaceAll(data);
  await load();
}

export function dumpAll() {
  const out = {};
  for (const name of db.STORE_NAMES) out[name] = [...S[name].values()];
  return out;
}

// ---------- ตัวเลือกข้อมูล ----------

export const setting = (key, fallback = null) => S.settings.get(key)?.value ?? fallback;
export const setSetting = (key, value) => put('settings', { key, value });

export const clubs = () => [...S.clubs.values()].sort((a, b) => a.order - b.order);
export const bagClubs = () => clubs().filter((c) => c.in_bag);
export const club = (id) => (id ? S.clubs.get(id) ?? null : null);

export const allCourses = () => [...CURATED_COURSES, ...S.userCourses.values()];
export const course = (id) => CURATED_COURSES.find((c) => c.id === id) ?? S.userCourses.get(id) ?? null;
export const favoriteSet = () => new Set(S.favorites.keys());

export const rounds = () => [...S.rounds.values()].sort((a, b) =>
  b.played_at.localeCompare(a.played_at) || (b.created_at || '').localeCompare(a.created_at || ''));
export const holesOf = (roundId) => [...S.holes.values()].filter((h) => h.round_id === roundId).sort((a, b) => a.number - b.number);
export const shotsOf = (holeId) => [...S.shots.values()].filter((s) => s.hole_id === holeId).sort((a, b) => a.sequence - b.sequence);
export const penaltiesOf = (holeId) => [...S.penalties.values()].filter((p) => p.hole_id === holeId);

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
    a.round.played_at.localeCompare(b.round.played_at) || a.hole.number - b.hole.number || a.shot.sequence - b.shot.sequence);
}
