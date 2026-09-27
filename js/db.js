// IndexedDB แบบบาง ๆ ทุกการเขียนรอให้ transaction สำเร็จก่อนคืนค่า
const DB_NAME = 'shotlog';
const DB_VERSION = 2;

const SCHEMA = {
  rounds: { keyPath: 'id' },
  holes: { keyPath: 'id', indexes: ['round_id'] },
  shots: { keyPath: 'id', indexes: ['hole_id', 'round_id'] },
  penalties: { keyPath: 'id', indexes: ['hole_id', 'round_id'] },
  clubs: { keyPath: 'id' },
  practice: { keyPath: 'id' },
  userCourses: { keyPath: 'id' },
  favorites: { keyPath: 'course_id' },
  settings: { keyPath: 'key' },
  // ระบบซิงก์ (ไม่รวมในไฟล์สำรอง)
  meta: { keyPath: 'key' },       // session, linked_owner, pull_cursor, last_sync
  outbox: { keyPath: 'key' },     // รายการที่แก้ในเครื่องแต่ยังไม่ขึ้นคลาวด์
  syncrev: { keyPath: 'key' },    // rev ล่าสุดบนคลาวด์ที่เครื่องนี้รู้จัก
  conflicts: { keyPath: 'key' },  // รายการที่แก้ชนกัน รอผู้ใช้เลือก
};

let dbPromise;
export const events = { blocked: null };
const OPEN_TIMEOUT_MS = 15000;

export function open() {
  if (dbPromise) return dbPromise;
  const p = new Promise((resolve, reject) => {
    let blocked = false;
    // บาง iPhone เปิดฐานข้อมูลค้างไม่ตอบ: ถ้าไม่ได้รอแท็บอื่นอยู่ ให้แจ้งแทนที่จะค้างตลอดไป
    const timer = setTimeout(() => { if (!blocked) reject(new Error('เปิดฐานข้อมูลในเครื่องไม่ทัน')); }, OPEN_TIMEOUT_MS);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(SCHEMA)) {
        if (db.objectStoreNames.contains(name)) continue;
        const os = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const idx of def.indexes || []) os.createIndex(idx, idx);
      }
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      // แท็บอื่นเปิดรุ่นใหม่กว่า: ปิดตัวเองเพื่อไม่ขวางการอัปเกรด
      db.onversionchange = () => { db.close(); globalThis.location?.reload(); };
      // Safari ปิดการเชื่อมต่อเองเมื่อแอปอยู่เบื้องหลังนาน → ครั้งหน้าเปิดใหม่
      db.onclose = () => { if (dbPromise === p) dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { clearTimeout(timer); reject(req.error); };
    // แอปรุ่นเก่ายังเปิดอยู่ในแท็บอื่น: ไม่ใช่ข้อผิดพลาด คำขอจะรอจนแท็บนั้นปิดแล้วทำต่อเอง
    req.onblocked = () => { blocked = true; events.blocked?.(); };
  });
  dbPromise = p;
  p.catch(() => { if (dbPromise === p) dbPromise = null; });   // เปิดไม่สำเร็จ ครั้งหน้าลองใหม่
  return p;
}

// การเชื่อมต่อหลุด (iOS: "Connection to Indexed Database server lost") → เปิดใหม่แล้วลองอีกครั้งเดียว
// ปลอดภัยเพราะ transaction ที่ล้มไม่มีอะไรถูกบันทึก และการเขียนซ้ำได้ผลเท่าเดิม
const LOST = new Set(['InvalidStateError', 'UnknownError', 'TransactionInactiveError']);
export const isConnectionLost = (err) => LOST.has(err?.name) || /connection|closing|closed/i.test(err?.message || '');

async function withRetry(fn) {
  try {
    return await fn(await open());
  } catch (err) {
    if (!isConnectionLost(err)) throw err;
    dbPromise = null;
    return fn(await open());
  }
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('บันทึกไม่สำเร็จ'));
  });
}

export function getAll(store) {
  return withRetry((db) => new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

// ops: [{ store, put: obj } | { store, del: key }] ใน transaction เดียว
export async function write(ops) {
  if (!ops.length) return;
  const stores = [...new Set(ops.map((o) => o.store))];
  return withRetry((db) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const op of ops) {
      const os = tx.objectStore(op.store);
      if ('put' in op) os.put(op.put);
      else os.delete(op.del);
    }
    return done(tx);
  });
}

export function replaceAll(data) {
  const stores = Object.keys(SCHEMA);
  return withRetry((db) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const s of stores) {
      const os = tx.objectStore(s);
      os.clear();
      for (const item of data[s] || []) os.put(item);
    }
    return done(tx);
  });
}

export const STORE_NAMES = Object.keys(SCHEMA);

// สำหรับทดสอบ: ปิดการเชื่อมต่อ เพื่อลบหรือเปิดฐานข้อมูลใหม่ได้
export async function close() {
  if (!dbPromise) return;
  const db = await dbPromise.catch(() => null);
  db?.close();
  dbPromise = null;
}
