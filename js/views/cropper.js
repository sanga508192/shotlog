// หน้าปรับตำแหน่งรูปก๊วน: ลากเพื่อเลื่อน ถ่างสองนิ้ว/แถบเลื่อน/ล้อเมาส์เพื่อซูม
// ใช้สูตรตำแหน่งเดียวกับตอนวาดรูปสกอร์การ์ด ที่เห็นในกรอบนี้คือที่จะออกในรูปจริง
import { photoPlacement, MAX_ZOOM } from '../share.js';

// crop: { cx, cy, zoom } · aspect: กว้าง/สูง ของกรอบรูปในสกอร์การ์ด · onDone(crop)
export function openCropper({ url, iw, ih, aspect, crop, onDone }) {
  document.getElementById('cropper')?.remove();
  let cur = { cx: crop?.cx ?? 0.5, cy: crop?.cy ?? 0.5, zoom: crop?.zoom ?? 1 };
  const wrap = document.createElement('div');
  wrap.id = 'cropper';
  wrap.className = 'cropper';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', 'ปรับตำแหน่งรูปก๊วน');
  wrap.innerHTML = `<div class="cropper-panel">
      <div class="cropper-head"><b>ปรับตำแหน่งรูปก๊วน</b><span>ลากรูปเพื่อเลื่อน · ถ่างสองนิ้วหรือใช้แถบด้านล่างเพื่อซูม</span></div>
      <div class="crop-frame" style="aspect-ratio:${Number(aspect) || 4 / 3}">
        <img class="crop-bg" src="${url}" alt="" aria-hidden="true">
        <img class="crop-img" src="${url}" alt="รูปก๊วน" draggable="false">
      </div>
      <div class="zoom-row">
        <button type="button" class="zoom-btn" data-z="out" aria-label="ย่อ">−</button>
        <input type="range" min="0" max="1000" step="1" aria-label="ซูม">
        <button type="button" class="zoom-btn" data-z="in" aria-label="ขยาย">＋</button>
      </div>
      <div class="crop-quick">
        <button type="button" class="mini" data-q="fit">🖼 เห็นทั้งรูป</button>
        <button type="button" class="mini" data-q="fill">⛶ เต็มกรอบ</button>
      </div>
      <div class="cropper-btns">
        <button type="button" class="btn" data-q="cancel">ยกเลิก</button>
        <button type="button" class="btn primary" data-q="done">ใช้ตำแหน่งนี้</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const frame = wrap.querySelector('.crop-frame');
  const img = wrap.querySelector('.crop-img');
  const range = wrap.querySelector('input[type="range"]');
  const size = () => frame.getBoundingClientRect();

  // แถบซูมเป็นสเกลลอการิทึม จากเห็นทั้งรูปจนถึงขยายสุด
  const zoomToT = (z, min) => Math.log(z / min) / Math.log(MAX_ZOOM / min);
  const tToZoom = (t, min) => min * (MAX_ZOOM / min) ** t;

  function apply() {
    const { width: W, height: H } = size();
    if (!W || !H) return;
    const pl = photoPlacement(iw, ih, W, H, cur);
    cur = { cx: pl.cx, cy: pl.cy, zoom: pl.zoom };
    Object.assign(img.style, { left: `${pl.x}px`, top: `${pl.y}px`, width: `${pl.w}px`, height: `${pl.h}px` });
    range.value = String(Math.round(zoomToT(pl.zoom, pl.minZoom) * 1000));
    frame.classList.toggle('fits', pl.fits);
  }
  const minZoom = () => { const { width: W, height: H } = size(); return photoPlacement(iw, ih, W || 1, H || 1).minZoom; };

  // ลากและถ่างนิ้ว
  const pts = new Map();
  let pinch = null;
  frame.addEventListener('pointerdown', (e) => {
    frame.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = null;
  });
  frame.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { width: W, height: H } = size();
    const pl = photoPlacement(iw, ih, W, H, cur);
    if (pts.size === 1) {
      cur.cx -= (e.clientX - prev.x) / pl.w;
      cur.cy -= (e.clientY - prev.y) / pl.h;
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) cur.zoom *= d / pinch;
      pinch = d;
    }
    apply();
  });
  const release = (e) => { pts.delete(e.pointerId); pinch = null; };
  frame.addEventListener('pointerup', release);
  frame.addEventListener('pointercancel', release);
  frame.addEventListener('wheel', (e) => {
    e.preventDefault();
    cur.zoom *= Math.exp(-e.deltaY * 0.0015);
    apply();
  }, { passive: false });

  range.addEventListener('input', () => { cur.zoom = tToZoom(Number(range.value) / 1000, minZoom()); apply(); });
  wrap.querySelector('[data-z="in"]').addEventListener('click', () => { cur.zoom *= 1.15; apply(); });
  wrap.querySelector('[data-z="out"]').addEventListener('click', () => { cur.zoom /= 1.15; apply(); });

  function close() {
    wrap.remove();
    document.body.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', apply);
  }
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', apply);

  wrap.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]')?.dataset.q;
    if (q === 'fit') { cur = { cx: 0.5, cy: 0.5, zoom: minZoom() }; apply(); }
    else if (q === 'fill') { cur = { cx: 0.5, cy: 0.5, zoom: 1 }; apply(); }
    else if (q === 'cancel') close();
    else if (q === 'done') { close(); onDone?.({ ...cur }); }
  });

  if (img.complete) apply(); else img.addEventListener('load', apply, { once: true });
  requestAnimationFrame(apply);
  wrap.querySelector('[data-q="done"]').focus();
}
