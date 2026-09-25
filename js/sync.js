// ซิงก์ข้อมูลในเครื่องกับคลาวด์: จดลงเครื่องก่อนเสมอ แล้วส่งขึ้นเมื่อมีสัญญาณ
// ข้อมูลที่แก้ชนกันจะไม่ถูกเขียนทับเงียบ ๆ แต่เก็บไว้ให้ผู้ใช้เลือก
import * as st from './state.js';
import * as cloud from './cloud.js';
import { DATA_STORES, STORE_KEYS, sameData } from './logic.js';

const PAGE = 500;
const PUSH_BATCH = 200;
const LOCAL_ONLY_SETTINGS = new Set(['last_export_at']);
const SYNCED = new Set(DATA_STORES);

let api = {
  ready: () => cloud.enabled() && !!cloud.session(),
  push: cloud.push,
  pull: cloud.pull,
};
export function _setApi(a) { api = a; }
export function _stop() { clearTimeout(timer); }

const keyOf = (store, id) => `${store}|${id}`;
const idOf = (op) => ('put' in op ? op.put[STORE_KEYS[op.store] || 'id'] : op.del);
const metaOp = (key, value) => ({ store: 'meta', put: { key, value } });
let tokenN = 0;
const token = () => `${Date.now().toString(36)}-${++tokenN}`;
const outboxOp = (store, id) => ({ store: 'outbox', put: { key: keyOf(store, id), store, id, t: token() } });

export const syncable = (store, id) => SYNCED.has(store) && !(store === 'settings' && LOCAL_ONLY_SETTINGS.has(id));
const linked = () => !!st.meta('linked_owner');

// ---------- สถานะสำหรับแสดงผล ----------

let phase = 'idle';   // idle | syncing | ok | offline | needs_plan | signed_out | error
let lastError = null;
const listeners = new Set();
export const onStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function status() {
  return {
    active: api.ready() && linked(),
    phase,
    error: lastError,
    pending: st.S.outbox.size,
    conflicts: st.S.conflicts.size,
    lastSync: st.meta('last_sync'),
  };
}
function setPhase(p, err = null) {
  phase = p;
  lastError = err;
  const s = status();
  // คัดลอกก่อน: ผู้ฟังอาจ render ใหม่แล้วสมัครฟังใหม่ระหว่างวนลูป
  for (const fn of [...listeners]) fn(s);
}

// ---------- ต่อเข้ากับการบันทึกของแอป ----------

st.hooks.outboxFor = (ops) => {
  if (!linked()) return [];
  return ops.filter((op) => syncable(op.store, idOf(op))).map((op) => outboxOp(op.store, idOf(op)));
};
st.hooks.afterCommit = () => { if (linked()) { setPhase(phase); schedule(); } };

// ---------- ดึงจากคลาวด์ ----------

function sameAsServer(local, row) {
  return row.deleted ? local == null : local != null && sameData(local, row.data);
}

function applyServerOps(row, key) {
  const ops = [
    row.deleted ? { store: row.store, del: row.id } : { store: row.store, put: row.data },
    { store: 'syncrev', put: { key, rev: row.rev } },
  ];
  if (st.S.outbox.has(key)) ops.push({ store: 'outbox', del: key });
  if (st.S.conflicts.has(key)) ops.push({ store: 'conflicts', del: key });
  return ops;
}

function conflictOp(row, key) {
  return {
    store: 'conflicts',
    put: {
      key, store: row.store, id: row.id,
      server_rev: row.rev, server_data: row.deleted ? null : row.data, server_deleted: !!row.deleted, at: st.nowIso(),
    },
  };
}

async function pull() {
  let cursor = st.meta('pull_cursor', 0);
  const seenStores = new Set();
  for (;;) {
    const rows = await api.pull(cursor, PAGE);
    const ops = [];
    for (const row of rows) {
      cursor = Math.max(cursor, Number(row.seq));
      if (!syncable(row.store, row.id)) continue;
      if (!row.deleted) seenStores.add(row.store);
      const key = keyOf(row.store, row.id);
      if (row.rev <= (st.S.syncrev.get(key)?.rev ?? 0)) continue;   // ของที่เครื่องนี้ส่งขึ้นไปเอง
      const local = st.S[row.store].get(row.id) ?? null;
      const pending = st.S.outbox.has(key);
      const neverSynced = local != null && !st.S.syncrev.has(key);
      if ((pending || neverSynced) && !sameAsServer(local, row)) {
        // ค่าตั้งพื้นฐานของเครื่องใหม่ไม่ควรกลายเป็นข้อมูลชนกัน → ใช้ของบนคลาวด์
        if (row.store === 'settings' && !st.S.syncrev.has(key)) {
          ops.push(...applyServerOps(row, key));
        } else {
          ops.push(conflictOp(row, key));
          if (!pending) ops.push(outboxOp(row.store, row.id));
        }
        continue;
      }
      ops.push(...applyServerOps(row, key));
    }
    ops.push(metaOp('pull_cursor', cursor));
    await st.commit(ops, { raw: true });
    if (rows.length < PAGE) break;
  }
  return seenStores;
}

// ---------- ส่งขึ้นคลาวด์ ----------

async function push() {
  const entries = [...st.S.outbox.values()].filter((e) => !st.S.conflicts.has(e.key));
  for (let i = 0; i < entries.length; i += PUSH_BATCH) {
    const batch = [];
    const drop = [];
    for (const e of entries.slice(i, i + PUSH_BATCH)) {
      const rec = st.S[e.store].get(e.id) ?? null;
      const base = st.S.syncrev.get(e.key)?.rev ?? null;
      if (!rec && base == null) { drop.push(e); continue; }   // สร้างแล้วลบก่อนเคยขึ้นคลาวด์
      batch.push({ e, rec, item: { store: e.store, id: e.id, base_rev: base, deleted: !rec, data: rec } });
    }
    const ops = drop.filter((e) => st.S.outbox.get(e.key)?.t === e.t).map((e) => ({ store: 'outbox', del: e.key }));
    if (batch.length) {
      const results = await api.push(batch.map((b) => b.item));
      const byKey = new Map(batch.map((b) => [b.e.key, b]));
      for (const r of results) {
        const key = keyOf(r.store, r.id);
        const b = byKey.get(key);
        if (!b) continue;
        const unchanged = st.S.outbox.get(key)?.t === b.e.t;   // ระหว่างส่ง ผู้ใช้ไม่ได้แก้ซ้ำ
        if (r.status === 'ok' || sameAsServer(b.rec, r)) {
          ops.push({ store: 'syncrev', put: { key, rev: r.rev } });
          if (unchanged) ops.push({ store: 'outbox', del: key });
        } else {
          ops.push(conflictOp(r, key));
        }
      }
    }
    if (ops.length) await st.commit(ops, { raw: true });
  }
}

// ---------- ควบคุมรอบการซิงก์ ----------

let timer = null;
let running = null;
let again = false;

export function schedule(delay = 1500) {
  if (!api.ready() || !linked()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow().catch(() => {}); }, delay);
}

export function syncNow() {
  if (!api.ready() || !linked()) return Promise.resolve(status());
  if (running) { again = true; return running; }
  running = (async () => {
    setPhase('syncing');
    try {
      await pull();
      await push();
      await st.commit([metaOp('last_sync', st.nowIso())], { raw: true });
      setPhase('ok');
    } catch (err) {
      if (err.status === 403 || err.code === '42501') setPhase('needs_plan', err);
      else if (err.status === 401) setPhase('signed_out', err);
      else if (err instanceof TypeError || globalThis.navigator?.onLine === false) setPhase('offline', err);
      else setPhase('error', err);
      throw err;
    } finally {
      running = null;
      if (again) { again = false; schedule(300); }
    }
    return status();
  })();
  return running;
}

// ---------- ผูกเครื่องกับบัญชี ----------

export const linkedOwner = () => st.meta('linked_owner');

// เครื่องนี้เคยผูกกับบัญชีอื่น → ต้องลบข้อมูลในเครื่องก่อน (ผู้ใช้ยืนยันในหน้าบัญชี)
export async function wipeLocal() {
  const session = st.meta('session');
  await st.replaceAll({});
  if (session) await st.commit([metaOp('session', session)], { raw: true });
  setPhase('idle');
}

export async function link(userId) {
  const owner = linkedOwner();
  if (owner && owner !== userId) throw new Error('OTHER_OWNER');
  if (!owner) {
    await st.commit([metaOp('linked_owner', userId), metaOp('pull_cursor', 0)], { raw: true });
    const serverStores = await pull();
    const ops = [];
    // บัญชีมีกระเป๋าไม้อยู่แล้ว → ไม่ส่งไม้ตั้งต้นที่ยังไม่เคยใช้ของเครื่องนี้ขึ้นไปซ้ำ
    if (serverStores.has('clubs')) {
      const used = new Set([...st.S.shots.values()].map((s) => s.club_id));
      for (const c of st.S.clubs.values()) {
        const key = keyOf('clubs', c.id);
        if (!st.S.syncrev.has(key) && !st.S.conflicts.has(key) && !used.has(c.id)) ops.push({ store: 'clubs', del: c.id });
      }
    }
    const dropped = new Set(ops.map((o) => o.del));
    for (const store of DATA_STORES) {
      for (const [id] of st.S[store]) {
        const key = keyOf(store, id);
        if (!syncable(store, id) || (store === 'clubs' && dropped.has(id))) continue;
        if (!st.S.syncrev.has(key) && !st.S.outbox.has(key)) ops.push(outboxOp(store, id));
      }
    }
    await st.commit(ops, { raw: true });
  }
  return syncNow();
}

// เลิกผูกกับคลาวด์แต่เก็บข้อมูลการเล่นไว้ในเครื่อง (เช่น หลังลบบัญชี)
export async function detachKeepData() {
  clearTimeout(timer);
  const ops = ['linked_owner', 'pull_cursor', 'last_sync', 'session'].map((key) => ({ store: 'meta', del: key }));
  for (const s of ['outbox', 'syncrev', 'conflicts']) for (const key of st.S[s].keys()) ops.push({ store: s, del: key });
  await st.commit(ops, { raw: true });
  setPhase('idle');
}

// ---------- แก้ข้อมูลที่ชนกัน ----------

export async function resolveConflict(key, choice) {
  const c = st.S.conflicts.get(key);
  if (!c) return;
  const ops = [{ store: 'conflicts', del: key }, { store: 'syncrev', put: { key, rev: c.server_rev } }];
  if (choice === 'local') {
    // ส่งของเครื่องนี้ทับ โดยอ้าง rev ของคลาวด์ที่เห็นแล้ว (ถ้าคลาวด์เปลี่ยนอีกจะชนใหม่)
    ops.push(outboxOp(c.store, c.id));
  } else {
    ops.push(c.server_deleted ? { store: c.store, del: c.id } : { store: c.store, put: c.server_data });
    ops.push({ store: 'outbox', del: key });
  }
  await st.commit(ops, { raw: true });
  setPhase(phase);
  schedule(200);
}
