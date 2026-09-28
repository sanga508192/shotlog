// ตำแหน่งปัจจุบันจาก GPS ของเครื่อง ใช้คำนวณในเครื่องเท่านั้น ไม่ส่งไปไหน
// (ตำแหน่งตีช็อตที่ผู้ใช้เปิดให้จับ เก็บไว้กับข้อมูลช็อตของผู้ใช้เอง)
let last = null;

export function lastPosition(maxAgeMs = 10 * 60 * 1000) {
  return last && Date.now() - last.at < maxAgeMs ? last : null;
}

const fromCoords = (p) => ({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() });

function errorOf(err) {
  const msg = err.code === 1 ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง เปิดได้ที่การตั้งค่าของเบราว์เซอร์'
    : err.code === 3 ? 'หาตำแหน่งไม่ทัน ลองใหม่ในที่โล่ง'
      : 'หาตำแหน่งไม่ได้';
  return Object.assign(new Error(msg), { code: err.code });
}

export function getPosition({ timeout = 12000, highAccuracy = false, maxAge = 5 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('เครื่องนี้ไม่รองรับการระบุตำแหน่ง')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { last = fromCoords(p); resolve(last); },
      (err) => reject(errorOf(err)),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: maxAge },
    );
  });
}

// ติดตามตำแหน่งต่อเนื่องแบบละเอียด ใช้ร่วมกันหลายหน้า และปิด GPS เองเมื่อไม่มีหน้าไหนใช้ (ประหยัดแบต)
const watchers = new Set();
let watchId = null;
let stopTimer = null;

export function watchPosition(onPos, onError) {
  if (!globalThis.navigator?.geolocation) {
    onError?.(new Error('เครื่องนี้ไม่รองรับการระบุตำแหน่ง'));
    return () => {};
  }
  const w = { onPos, onError };
  watchers.add(w);
  if (last && Date.now() - last.at < 15000) onPos(last);
  if (watchId == null) {
    watchId = navigator.geolocation.watchPosition(
      (p) => { last = fromCoords(p); for (const x of [...watchers]) x.onPos(last); },
      (err) => { const e = errorOf(err); for (const x of [...watchers]) x.onError?.(e); },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 },
    );
  }
  clearTimeout(stopTimer);
  return () => {
    watchers.delete(w);
    // หน้าจอวาดใหม่ทุกครั้งที่แตะ: รอสักครู่ก่อนปิด GPS จะได้ไม่ต้องเริ่มหาตำแหน่งใหม่ทุกครั้ง
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => {
      if (!watchers.size && watchId != null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    }, 15000);
  };
}
