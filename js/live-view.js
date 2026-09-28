// หน้าดูสกอร์สด (live.html) สำหรับคนที่ได้ลิงก์ ไม่ต้องลงแอปหรือเข้าสู่ระบบ · โหลดใหม่ทุก 20 วินาทีขณะเปิดดู
// อ่านอย่างเดียวผ่านฟังก์ชัน get_board บนเซิร์ฟเวอร์ ไม่แตะข้อมูลของแอปในเครื่อง · การสร้างหน้าอยู่ใน live-render.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { boardView } from './live-render.js';

const REFRESH_MS = 20000;
const token = (() => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; } })();
const root = document.getElementById('live');
const sub = document.getElementById('live-sub');
let last = null;

async function fetchBoard() {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/get_board`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ board: token }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;   // ไม่มีบอร์ดนี้แล้ว = null (บางเซิร์ฟเวอร์ตอบว่างเปล่า)
}

function render(b) {
  const v = boardView(b);
  sub.textContent = v.sub;
  document.title = v.title;
  root.innerHTML = v.html;
}

async function load() {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    sub.textContent = 'ลิงก์ไม่ถูกต้อง';
    root.innerHTML = '<div class="card warn">ลิงก์นี้ไม่ถูกต้อง ขอลิงก์ใหม่จากเพื่อนที่จดสกอร์</div>';
    return;
  }
  try {
    const b = await fetchBoard();
    if (!b) {
      sub.textContent = 'ลิงก์หมดอายุ';
      root.innerHTML = '<div class="card warn">สกอร์สดนี้หมดอายุหรือถูกปิดแล้ว</div>';
      return;
    }
    last = b;
    render(b);
  } catch {
    if (last) render(last);
    else root.innerHTML = '<div class="card warn">โหลดไม่สำเร็จ ตรวจสัญญาณอินเทอร์เน็ตแล้วลองใหม่</div>';
  }
}

load();
setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
