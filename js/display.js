// การแสดงผลระหว่างออกรอบ: จอไม่ดับเอง (Wake Lock) และโหมดแดดจ้า (ตัวใหญ่ สีตัดกันชัด)
// จอไม่ดับใช้เฉพาะหน้าที่ใช้ตอนเล่น (หน้าหลุม แผนที่หลุม) ออกจากหน้าเหล่านี้แล้วปล่อยให้จอดับตามปกติ
import * as st from './state.js';

let lock = null;
let want = false;
let releaseTimer = null;

export const wakeSupported = () => !!globalThis.navigator?.wakeLock;
export const keepAwakeOn = () => st.setting('keep_awake', true) !== false;

async function acquire() {
  if (!want || lock || !wakeSupported() || globalThis.document?.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
    if (!want) { lock.release().catch(() => {}); lock = null; }
  } catch {
    lock = null;   // แบตต่ำ/โหมดประหยัดพลังงาน หรือเบราว์เซอร์ไม่อนุญาต: ใช้งานต่อได้ตามปกติ
  }
}

// สลับแอปกลับมา: เบราว์เซอร์ปล่อย lock ไปแล้ว ขอใหม่
globalThis.document?.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') acquire(); });

// on = หน้านี้อยากให้จอติดค้าง · หน้าจอวาดใหม่บ่อย (unmount → mount) จึงรอสักครู่ก่อนปล่อยจริง
export function keepAwake(on) {
  clearTimeout(releaseTimer);
  if (on && keepAwakeOn()) {
    want = true;
    acquire();
    return;
  }
  want = false;
  releaseTimer = setTimeout(() => {
    if (want) return;
    lock?.release().catch(() => {});
    lock = null;
  }, 1500);
}

export const sunOn = () => st.setting('sun_mode', false) === true;
export function applySun() {
  const el = globalThis.document?.documentElement;
  if (!el) return;
  if (sunOn()) el.dataset.sun = '1';
  else delete el.dataset.sun;
}
export async function toggleSun() {
  await st.setSetting('sun_mode', !sunOn());
  applySun();
  return sunOn();
}
