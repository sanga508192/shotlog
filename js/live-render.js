// สร้างหน้าสกอร์สดจากข้อมูลบอร์ด (ใช้ใน live.html) · แยกออกมาเพื่อทดสอบได้
// ข้อมูลบอร์ดมาจากเครื่องของผู้ใช้คนอื่น และหน้านี้อยู่โดเมนเดียวกับแอป → ห้ามใส่ค่าดิบลงหน้า:
// ตัวเลขทุกตัวผ่าน int() ข้อความทุกตัวผ่าน esc() รูปทรงข้อมูลที่ผิดถูกข้ามโดยไม่ทำให้หน้าพัง

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
const text = (v, max = 80) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : '');
const signed = (v) => { const n = int(v); return n == null ? '' : n === 0 ? 'E' : n > 0 ? `+${n}` : String(n); };
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

export function ago(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '–';
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 60 ? 'เมื่อสักครู่' : s < 3600 ? `${Math.round(s / 60)} นาทีที่แล้ว` : `${Math.round(s / 3600)} ชั่วโมงที่แล้ว`;
}

const cls = (strokes, par) => (strokes == null || par == null ? '' : strokes <= par - 2 ? 'eagle' : strokes === par - 1 ? 'birdie'
  : strokes === par ? 'par' : strokes === par + 1 ? 'bogey' : 'double');

// b = { data, updated_at } จาก get_board → { sub, title, html }
export function boardView(b, now = Date.now()) {
  const d = obj(obj(b).data);
  const holes = arr(d.holes).slice(0, 36).map((h) => ({ n: int(obj(h).n), par: int(obj(h).par) }));
  const players = arr(d.players).slice(0, 12).map(obj)
    .map((p) => ({ name: text(p.name, 40), total: int(p.total), thru: int(p.thru), over: int(p.over), scores: arr(p.scores).map(int) }))
    .sort((a, c) => (a.over ?? 999) - (c.over ?? 999) || (a.total ?? 0) - (c.total ?? 0));
  const course = text(d.course);
  const leader = players.map((p, i) => `<div class="lv-row${i === 0 ? ' lead' : ''}">
      <span class="lv-rank">${i + 1}</span><b class="lv-name">${esc(p.name)}</b>
      <span class="lv-thru">${p.thru ? `${p.thru} หลุม` : 'ยังไม่เริ่ม'}</span>
      <span class="lv-over">${signed(p.over)}</span><span class="lv-total">${p.total ?? '–'}</span></div>`).join('');
  const table = holes.length ? `<div class="lv-scroll"><table class="lv-table">
      <thead><tr><th>หลุม</th>${holes.map((h) => `<th>${h.n ?? ''}</th>`).join('')}<th>รวม</th></tr>
      <tr class="par"><th>พาร์</th>${holes.map((h) => `<td>${h.par ?? ''}</td>`).join('')}<td>${holes.reduce((a, h) => a + (h.par || 0), 0) || ''}</td></tr></thead>
      <tbody>${players.map((p) => `<tr><th>${esc(p.name)}</th>${holes.map((h, i) => {
    const s = p.scores[i] ?? null;
    return `<td class="${cls(s, h.par)}">${s ?? ''}</td>`;
  }).join('')}<td><b>${p.total ?? ''}</b></td></tr>`).join('')}</tbody></table></div>` : '';
  const games = arr(d.games).slice(0, 10).map(obj).map((g) => `<div class="card lv-game"><b>${esc(text(g.title))}</b>
      ${arr(g.items).slice(0, 12).map(obj).map((it) => `<div class="row between"><span>${esc(text(it.name, 40))}</span><b>${esc(text(it.value, 20))}</b></div>`).join('')}</div>`).join('');
  return {
    sub: [course, d.tee ? `แท่น${text(d.tee, 20)}` : '', text(d.date, 20)].filter(Boolean).join(' · '),
    title: `สกอร์สด · ${course || 'ShotLog'}`,
    html: `<div class="card lv-board">${leader || '<p class="muted">ยังไม่มีสกอร์</p>'}</div>
    ${table}${games}
    <p class="note">อัปเดตล่าสุด ${esc(ago(obj(b).updated_at, now))} · หน้านี้โหลดใหม่เองทุก 20 วินาที</p>
    <p class="note">จดด้วย <a href="./">ShotLog</a> — แอปจดกอล์ฟรายช็อตและสกอร์ก๊วน</p>`,
  };
}
