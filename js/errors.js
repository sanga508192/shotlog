// เก็บข้อผิดพลาดล่าสุดไว้ในเครื่องเพื่อดูในหน้าตั้งค่าเวลาแจ้งปัญหา (ไม่ส่งไปที่ใด)
const KEY = 'shotlog_errors';
const MAX = 20;

function read() {
  try { return JSON.parse(globalThis.localStorage?.getItem(KEY) || '[]'); } catch { return []; }
}

export function logError(where, err) {
  const item = {
    t: new Date().toISOString(),
    where: String(where).slice(0, 80),
    msg: String(err?.message || err || 'ไม่ทราบสาเหตุ').slice(0, 300),
    stack: String(err?.stack || '').split('\n').slice(1, 4).map((s) => s.trim()).join(' | ').slice(0, 400),
  };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify([item, ...read()].slice(0, MAX)));
  } catch { /* พื้นที่เต็มหรือถูกปิดไว้ ไม่เป็นไร */ }
  console.error(where, err);
  return item;
}

export const recentErrors = () => read();

export function clearErrors() {
  try { globalThis.localStorage?.removeItem(KEY); } catch { /* ไม่เป็นไร */ }
}
