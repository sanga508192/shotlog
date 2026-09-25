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

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
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
      // แท็บอื่นเปิดรุ่นใหม่กว่า: ปิดตัวเองเพื่อไม่ขวางการอัปเกรด
      req.result.onversionchange = () => { req.result.close(); globalThis.location?.reload(); };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('ฐานข้อมูลถูกเปิดค้างในแท็บอื่น'));
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('บันทึกไม่สำเร็จ'));
  });
}

export async function getAll(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ops: [{ store, put: obj } | { store, del: key }] ใน transaction เดียว
export async function write(ops) {
  if (!ops.length) return;
  const db = await open();
  const stores = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(stores, 'readwrite');
  for (const op of ops) {
    const os = tx.objectStore(op.store);
    if ('put' in op) os.put(op.put);
    else os.delete(op.del);
  }
  return done(tx);
}

export async function replaceAll(data) {
  const db = await open();
  const stores = Object.keys(SCHEMA);
  const tx = db.transaction(stores, 'readwrite');
  for (const s of stores) {
    const os = tx.objectStore(s);
    os.clear();
    for (const item of data[s] || []) os.put(item);
  }
  return done(tx);
}

export const STORE_NAMES = Object.keys(SCHEMA);

// สำหรับทดสอบ: ปิดการเชื่อมต่อ เพื่อลบหรือเปิดฐานข้อมูลใหม่ได้
export async function close() {
  if (!dbPromise) return;
  const db = await dbPromise.catch(() => null);
  db?.close();
  dbPromise = null;
}
