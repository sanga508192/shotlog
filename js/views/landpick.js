// ปักจุดที่ลูกไปจบบนแผนที่หลุม: ใช้ตอนจดช็อต และตอนจดลูกโทษ (ลูกลงน้ำ/ออก OB ที่ไม่ได้เดินไปถึง)
// สองแบบ: แตะบนภาพดาวเทียม หรือเดินไปยืนที่ลูกแล้วใช้ GPS (เห็นตำแหน่งและวงความคลาดเคลื่อนบนแผนที่ก่อนยืนยัน)
import { esc } from '../ui.js';
import { TileMap } from '../map.js';
import { distM, bearing, fmtDist, holeReady, HAZARD_KINDS } from '../holemap.js';
import { cleanLand, landInfo, landText, GPS_MAX_ACC } from '../shotgeo.js';
import { watchPosition } from '../geo.js';
import { pinHtml } from './map.js';

export { landInfo, landText } from '../shotgeo.js';

const SIDE_TH = { left: 'ซ้าย', right: 'ขวา' };
const FAR_M = 1500;   // ตำแหน่งห่างหลุมเกินนี้ = ยังไม่ได้อยู่ที่สนาม ไม่ใช้

// คุณภาพ GPS สำหรับปักจุดลูก (เมตร)
export function gpsQuality(acc) {
  if (acc == null) return { ok: false, tone: 'wait', th: 'กำลังหาตำแหน่ง…' };
  if (acc <= 8) return { ok: true, tone: 'good', th: `แม่นดี ±${Math.round(acc)} ม.` };
  if (acc <= 15) return { ok: true, tone: 'fair', th: `พอใช้ ±${Math.round(acc)} ม. · รออีกนิดจะแม่นขึ้น` };
  if (acc <= GPS_MAX_ACC) return { ok: true, tone: 'poor', th: `คลาดเคลื่อนมาก ±${Math.round(acc)} ม. · ดูบนแผนที่ก่อนยืนยัน` };
  return { ok: false, tone: 'bad', th: `ยังไม่แม่น ±${Math.round(acc)} ม. · รอในที่โล่งสักครู่` };
}

// pins = หมุดหลุม (courseHoles) · start = จุดตี (อาจไม่รู้) · others = [{ seq, at, pen }] จุดของช็อตอื่นในหลุม
// gps = เริ่มด้วยตำแหน่งที่ยืนอยู่ (ไม่ต้องมีหมุดหลุมก็ใช้ได้) · onSave(point | null) เรียกเมื่อกดบันทึก (null = ลบจุด)
export function openLandPicker({ pins, n, seq, start = null, value = null, others = [], unit = 'yd', teeShot = false, gps = false, onSave }) {
  const ready = holeReady(pins);
  if (!ready && !gps) return false;
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
  let follow = gps;          // จุดลูกตามตำแหน่ง GPS จนกว่าผู้ใช้จะแตะ/ลากเอง
  let pos = null;            // ตำแหน่งล่าสุด { lat, lon, accuracy }
  let fitted = false;
  let stopGps = null;
  const anchor = pins?.green ?? pins?.tee ?? start ?? null;
  const tooFar = () => !!pos && !!anchor && distM(pos, anchor) > FAR_M;

  const panel = wrap.querySelector('#lp-panel');
  const paint = () => {
    const info = landInfo(start, point, pins?.green ?? null, teeShot);
    const q = gpsQuality(pos?.accuracy);
    const far = tooFar();
    const gpsLine = follow ? `<p class="lp-gps ${far ? 'bad' : q.tone}">📍 ${far ? `ตำแหน่งตอนนี้ห่างหลุมนี้ ${(distM(pos, anchor) / 1000).toFixed(1)} กม. — ยังไม่ได้อยู่ที่สนาม?` : esc(q.th)}</p>` : '';
    const canSave = !!point && (!follow || (q.ok && !far));
    panel.innerHTML = `${gpsLine}${point && !(follow && far) ? `<p class="lp-read">${esc(landText(info, unit)) || 'ปักจุดแล้ว'}</p>` : ''}
      <p class="map-hint">${follow ? 'ยืนข้างลูกแล้วกด<b>ยืนยันจุดนี้</b> · จุดเพี้ยน แตะหรือลากหมุดลูกเพื่อแก้'
    : point ? 'ลากหมุดลูกเพื่อปรับ หรือแตะจุดใหม่' : 'แตะตรงที่ลูก<b>หยุด ลงน้ำ หรือออกนอกเขต</b>'} · ถ่างนิ้วเพื่อซูม</p>
      <div class="map-tools">
        ${follow ? '' : '<button type="button" class="map-pill" data-lp="gps">📍 ใช้ตำแหน่งที่ยืน</button>'}
        ${value ? '<button type="button" class="map-pill" data-lp="clear">ลบจุด</button>' : ''}
        <button type="button" class="map-pill" data-lp="close">ยกเลิก</button>
        <button type="button" class="map-pill primary" data-lp="save"${canSave ? '' : ' disabled'}>${follow ? 'ยืนยันจุดนี้' : 'บันทึกจุด'}</button>
      </div>`;
  };

  const overlay = () => {
    const lines = [], out = [], circles = [];
    if (pins?.tee) out.push({ id: 'tee', at: pins.tee, html: pinHtml.tee, cls: 'pin-tee' });
    if (pins?.green) out.push({ id: 'green', at: pins.green, html: pinHtml.green, cls: 'pin-green' });
    (pins?.hazards || []).forEach((z, i) => out.push({ id: `hz${i}`, at: z, html: `<span class="mp-hz">${HAZARD_KINDS.find((k) => k.v === z.kind)?.icon ?? '📌'}</span>`, cls: 'pin-hz' }));
    for (const o of others) out.push({ id: `o${o.seq}-${o.kind}`, at: o.at, html: `<span class="mp-shot${o.pen ? ' pen' : ''}">${o.seq}</span>`, cls: 'pin-shot' });
    if (start) out.push({ id: 'start', at: start, html: `<span class="mp-shot start">${seq}</span>`, cls: 'pin-shot' });
    if (pos && !tooFar()) {
      circles.push({ at: pos, m: pos.accuracy, cls: 'tm-acc' });
      out.push({ id: 'me', at: pos, html: pinHtml.me, cls: 'pin-me' });
    }
    if (point) {
      if (start) lines.push({ a: start, b: point, cls: 'tm-line', label: `${fmtDist(distM(start, point), unit)}` });
      out.push({
        id: 'ball', at: point, html: '<span class="mp-ball" aria-label="จุดที่ลูกไปจบ"></span>', cls: 'pin-ball', drag: true,
        onDrag: (p) => { follow = false; point = p; map._renderOverlay(); },
        onDrop: (p) => { follow = false; point = p; map._renderOverlay(); paint(); },
      });
    }
    return { lines, pins: out, circles };
  };

  const map = new TileMap(wrap.querySelector('#lp-map'), { onTap: (p) => { follow = false; point = p; map._renderOverlay(); paint(); } });
  map.setOverlay(overlay);
  const fitTo = () => {
    const bear = ready ? bearing(pins.tee, pins.green) : 0;
    const pts = [start ?? pins?.tee, pins?.green, point].filter(Boolean);
    if (pts.length > 1) map.fit(pts, { bearing: bear, pad: { top: 90, bottom: 230, left: 40, right: 40 } });
    else if (pts.length === 1) map.setView({ center: pts[0], zoom: 18, bearing: bear });
  };
  fitTo();
  paint();

  const startGps = () => {
    if (stopGps) return;
    stopGps = watchPosition((p) => {
      pos = { lat: p.lat, lon: p.lon, accuracy: p.accuracy };
      if (follow && !tooFar()) {
        point = { lat: p.lat, lon: p.lon };
        // ซูมครั้งแรกที่ได้ตำแหน่ง ให้เห็นจุดตี ลูก และกรีนพร้อมกัน
        if (!fitted) { fitted = true; fitTo(); }
      }
      map._renderOverlay();
      paint();
    }, (err) => {
      panel.querySelector('.lp-gps')?.replaceWith(Object.assign(document.createElement('p'), { className: 'lp-gps bad', textContent: `📍 ${err.message}` }));
    });
  };
  if (gps) startGps();

  const close = () => {
    stopGps?.();
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
    else if (act === 'gps') {
      follow = true;
      fitted = false;
      if (pos && !tooFar()) { point = { lat: pos.lat, lon: pos.lon }; fitted = true; fitTo(); }
      startGps();
      map._renderOverlay();
      paint();
    } else if (act === 'save' && point) {
      const p = follow ? cleanLand(point, 'gps', pos?.accuracy) : cleanLand(point);
      close();
      onSave(p);
    }
  });
  wrap.querySelector('[data-lp="close"]').focus();
  return true;
}

export const sideTh = (v) => SIDE_TH[v] ?? '';
