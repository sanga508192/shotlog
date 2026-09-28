// หน้าดูสกอร์สด (live.html) สำหรับคนที่ได้ลิงก์ ไม่ต้องลงแอปหรือเข้าสู่ระบบ · โหลดใหม่ทุก 20 วินาทีขณะเปิดดู
// อ่านอย่างเดียวผ่านฟังก์ชัน get_board บนเซิร์ฟเวอร์ ไม่แตะข้อมูลของแอปในเครื่อง
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const REFRESH_MS = 20000;
const token = decodeURIComponent(location.hash.slice(1));
const root = document.getElementById('live');
const sub = document.getElementById('live-sub');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = (n) => (n == null ? '' : n === 0 ? 'E' : n > 0 ? `+${n}` : String(n));
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

function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? 'เมื่อสักครู่' : s < 3600 ? `${Math.round(s / 60)} นาทีที่แล้ว` : `${Math.round(s / 3600)} ชั่วโมงที่แล้ว`;
}

const cls = (strokes, par) => (strokes == null || !par ? '' : strokes <= par - 2 ? 'eagle' : strokes === par - 1 ? 'birdie' : strokes === par ? 'par' : strokes === par + 1 ? 'bogey' : 'double');

function render(b) {
  const d = b.data || {};
  const holes = Array.isArray(d.holes) ? d.holes : [];
  const players = (Array.isArray(d.players) ? d.players : []).slice().sort((a, b2) => (a.over ?? 999) - (b2.over ?? 999) || (a.total ?? 0) - (b2.total ?? 0));
  sub.textContent = [d.course, d.tee ? `แท่น${d.tee}` : '', d.date].filter(Boolean).join(' · ');
  document.title = `สกอร์สด · ${d.course || 'ShotLog'}`;
  const leader = players.map((p, i) => `<div class="lv-row${i === 0 ? ' lead' : ''}">
      <span class="lv-rank">${i + 1}</span><b class="lv-name">${esc(p.name)}</b>
      <span class="lv-thru">${p.thru ? `${p.thru} หลุม` : 'ยังไม่เริ่ม'}</span>
      <span class="lv-over">${esc(signed(p.over))}</span><span class="lv-total">${p.total || '–'}</span></div>`).join('');
  const table = holes.length ? `<div class="lv-scroll"><table class="lv-table">
      <thead><tr><th>หลุม</th>${holes.map((h) => `<th>${h.n}</th>`).join('')}<th>รวม</th></tr>
      <tr class="par"><th>พาร์</th>${holes.map((h) => `<td>${h.par ?? ''}</td>`).join('')}<td>${holes.reduce((a, h) => a + (h.par || 0), 0) || ''}</td></tr></thead>
      <tbody>${players.map((p) => `<tr><th>${esc(p.name)}</th>${holes.map((h, i) => {
    const s = Array.isArray(p.scores) ? p.scores[i] : null;
    return `<td class="${cls(s, h.par)}">${s ?? ''}</td>`;
  }).join('')}<td><b>${p.total || ''}</b></td></tr>`).join('')}</tbody></table></div>` : '';
  const games = (Array.isArray(d.games) ? d.games : []).map((g) => `<div class="card lv-game"><b>${esc(g.title)}</b>
      ${(Array.isArray(g.items) ? g.items : []).map((it) => `<div class="row between"><span>${esc(it.name)}</span><b>${esc(it.value)}</b></div>`).join('')}</div>`).join('');
  root.innerHTML = `<div class="card lv-board">${leader || '<p class="muted">ยังไม่มีสกอร์</p>'}</div>
    ${table}${games}
    <p class="note">อัปเดตล่าสุด ${esc(ago(b.updated_at))} · หน้านี้โหลดใหม่เองทุก 20 วินาที</p>
    <p class="note">จดด้วย <a href="./">ShotLog</a> — แอปจดกอล์ฟรายช็อตและสกอร์ก๊วน</p>`;
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
