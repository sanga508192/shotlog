// ตำแหน่งปัจจุบันจาก GPS ของเครื่อง ใช้คำนวณในเครื่องเท่านั้น ไม่เก็บและไม่ส่งไปไหน
let last = null;

export function lastPosition(maxAgeMs = 10 * 60 * 1000) {
  return last && Date.now() - last.at < maxAgeMs ? last : null;
}

export function getPosition({ timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('เครื่องนี้ไม่รองรับการระบุตำแหน่ง')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        last = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() };
        resolve(last);
      },
      (err) => {
        const msg = err.code === 1 ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง เปิดได้ที่การตั้งค่าของเบราว์เซอร์'
          : err.code === 3 ? 'หาตำแหน่งไม่ทัน ลองใหม่ในที่โล่ง'
            : 'หาตำแหน่งไม่ได้';
        reject(new Error(msg));
      },
      { enableHighAccuracy: false, timeout, maximumAge: 5 * 60 * 1000 },
    );
  });
}
