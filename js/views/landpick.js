// ปักจุดที่ลูกไปจบบนแผนที่หลุม: ใช้ตอนจดช็อต และตอนจดลูกโทษ (ลูกลงน้ำ/ออก OB ที่ไม่ได้เดินไปถึง)
// ช็อตที่เดินไปยืนที่ลูกได้ GPS ของช็อตถัดไปแม่นกว่าการแตะภาพดาวเทียม จึงไม่ต้องปักทุกช็อต
import { esc } from '../ui.js';
import { TileMap } from '../map.js';
import { distM, bearing, fmtDist, holeReady, HAZARD_KINDS } from '../holemap.js';
import { cleanLand, landInfo, landText } from '../shotgeo.js';
import { pinHtml } from './map.js';

export { landInfo, landText } from '../shotgeo.js';

const SIDE_TH = { left: 'ซ้าย', right: 'ขวา' };

// pins = หมุดหลุม (courseHoles) · start = จุดตี (อาจไม่รู้) · others = [{ seq, at, pen }] จุดของช็อตอื่นในหลุม
// onSave(point | null) เรียกเมื่อกดบันทึก (null = ลบจุด)
export function openLandPicker({ pins, n, seq, start = null, value = null, others = [], unit = 'yd', teeShot = false, onSave }) {
  if (!holeReady(pins)) return false;
  document.getElementById('land-pick')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'land-pick';
  wrap.className = 'map-screen land-pick';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', `ปักจุดที่ลูกไปจบ ช็อต ${seq}`);
  wrap.innerHTML = `<div class="map-view" id="lp-map"></div>
    <div class="map-top">
      <button type="button" class="map-round" data-lp="close" aria-label="ปิด">‹</button>
      <div class="map-title"><b>จุดที่ลูกไปจบ · ช็อต ${seq}</b><span>หลุม ${n}${start ? '' : ' · ไม่รู้จุดตี จึงยังไม่มีระยะ'}</span></div>
    </div>
    <div class="map-bottom" id="lp-panel"></div>`;
  document.body.appendChild(wrap);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  let point = value ? { lat: value.lat, lon: value.lon } : null;
  const panel = wrap.querySelector('#lp-panel');
  const paint = () => {
    const info = landInfo(start, point, pins.green, teeShot);
    panel.innerHTML = `${point ? `<p class="lp-read">${esc(landText(info, unit)) || 'ปักจุดแล้ว'}</p>` : ''}
      <p class="map-hint">${point ? 'ลากหมุดลูกเพื่อปรับ หรือแตะจุดใหม่' : 'แตะตรงที่ลูก<b>หยุด ลงน้ำ หรือออกนอกเขต</b>'} · ถ่างนิ้วเพื่อซูม</p>
      <div class="map-tools">
        ${value ? '<button type="button" class="map-pill" data-lp="clear">ลบจุด</button>' : ''}
        <button type="button" class="map-pill" data-lp="close">ยกเลิก</button>
        <button type="button" class="map-pill primary" data-lp="save"${point ? '' : ' disabled'}>บันทึกจุด</button>
      </div>`;
  };

  const overlay = () => {
    const lines = [], out = [];
    out.push({ id: 'tee', at: pins.tee, html: pinHtml.tee, cls: 'pin-tee' });
    out.push({ id: 'green', at: pins.green, html: pinHtml.green, cls: 'pin-green' });
    (pins.hazards || []).forEach((z, i) => out.push({ id: `hz${i}`, at: z, html: `<span class="mp-hz">${HAZARD_KINDS.find((k) => k.v === z.kind)?.icon ?? '📌'}</span>`, cls: 'pin-hz' }));
    for (const o of others) out.push({ id: `o${o.seq}-${o.kind}`, at: o.at, html: `<span class="mp-shot${o.pen ? ' pen' : ''}">${o.seq}</span>`, cls: 'pin-shot' });
    if (start) out.push({ id: 'start', at: start, html: `<span class="mp-shot start">${seq}</span>`, cls: 'pin-shot' });
    if (point) {
      if (start) lines.push({ a: start, b: point, cls: 'tm-line', label: `${fmtDist(distM(start, point), unit)}` });
      out.push({
        id: 'ball', at: point, html: '<span class="mp-ball" aria-label="จุดที่ลูกไปจบ"></span>', cls: 'pin-ball', drag: true,
        onDrag: (p) => { point = p; map._renderOverlay(); },
        onDrop: (p) => { point = p; map._renderOverlay(); paint(); },
      });
    }
    return { lines, pins: out };
  };

  const map = new TileMap(wrap.querySelector('#lp-map'), { onTap: (p) => { point = p; map._renderOverlay(); paint(); } });
  map.setOverlay(overlay);
  map.fit([start ?? pins.tee, pins.green, point], { bearing: bearing(pins.tee, pins.green), pad: { top: 90, bottom: 200, left: 40, right: 40 } });
  paint();

  const close = () => {
    map.destroy();
    wrap.remove();
    document.body.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  wrap.addEventListener('click', (e) => {
    const act = e.target.closest('[data-lp]')?.dataset.lp;
    if (act === 'close') close();
    else if (act === 'clear') { close(); onSave(null); }
    else if (act === 'save' && point) { const p = cleanLand(point); close(); onSave(p); }
  });
  wrap.querySelector('[data-lp="close"]').focus();
  return true;
}

export const sideTh = (v) => SIDE_TH[v] ?? '';
