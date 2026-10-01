// แผนที่ภาพดาวเทียมขนาดเล็ก เขียนเองเพื่อให้หมุนได้ (แท่นทีอยู่ล่าง กรีนอยู่บน) และเก็บภาพไว้ใช้ตอนสัญญาณอ่อน
// ภาพจาก Esri World Imagery ต้องแสดงเครดิตบนแผนที่เสมอ
import { mercator, unmercator, metersPerPixel } from './holemap.js';
import { ESRI_API_KEY } from './config.js';

// มี API key → ใช้บริการแบบมีสิทธิ์ของ ArcGIS Location Platform (ใช้เชิงพาณิชย์ได้ตามแพ็กเกจ)
// ไม่มี → บริการสาธารณะ (ใช้ทดลอง/ส่วนตัวเท่านั้น)
export const TILE_HOST = ESRI_API_KEY ? 'ibasemaps-api.arcgis.com' : 'server.arcgisonline.com';
export const tileUrl = (z, x, y) => (ESRI_API_KEY
  ? `https://${TILE_HOST}/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?token=${encodeURIComponent(ESRI_API_KEY)}`
  : `https://${TILE_HOST}/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`);
export const ATTRIBUTION = `${ESRI_API_KEY ? 'Powered by Esri · ' : ''}ภาพ © Esri, Maxar, Earthstar Geographics`;
const TS = 256;
const MAX_NATIVE = 19;   // ภาพละเอียดสุดที่ขอ เกินจากนี้ขยายภาพเดิม

// บางพื้นที่ (เช่น ต่างจังหวัด) Esri ไม่มีภาพระดับละเอียดสุด จะส่งภาพเทา "Map data not yet available" มาแทน
// ตรวจภาพแบบนี้แล้วลดระดับลง (ขยายภาพระดับที่มีแทน) และจำไว้ตามพื้นที่
const areaKey = (p) => `tm_max:${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
function rememberedMax(p) {
  try { const v = Number(globalThis.localStorage?.getItem(areaKey(p))); return v >= 10 && v <= MAX_NATIVE ? v : MAX_NATIVE; } catch { return MAX_NATIVE; }
}
// ระดับซูมละเอียดสุดที่มีภาพจริงในพื้นที่นี้ (จำจากครั้งก่อนที่เจอภาพเทา)
export const maxZoomAt = (p) => rememberedMax(p);
export const setMaxZoomAt = (p, z) => rememberMax(p, z);
function rememberMax(p, z) {
  try { globalThis.localStorage?.setItem(areaKey(p), String(z)); } catch { /* ไม่เป็นไร */ }
}
export function isPlaceholder(img) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    let sum = 0, sum2 = 0, sat = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      sum += l; sum2 += l * l;
      sat += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    }
    const n = d.length / 4, mean = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    return mean > 175 && sd < 14 && sat / n < 10;
  } catch { return false; }
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class TileMap {
  constructor(el, { minZoom = 4, maxZoom = 21, onTap = null, onView = null } = {}) {
    this.el = el;
    el.classList.add('tm');
    el.innerHTML = `<div class="tm-layer"></div><div class="tm-layer"></div><svg class="tm-svg" aria-hidden="true"></svg><div class="tm-pins"></div><div class="tm-attr">${ATTRIBUTION}</div>`;
    this.layers = [...el.querySelectorAll('.tm-layer')].map((node) => ({ node, tz: null, origin: null, tiles: new Map() }));
    this.svg = el.querySelector('.tm-svg');
    this.pinsEl = el.querySelector('.tm-pins');
    this.center = { lat: 15, lon: 102 };
    this.zoom = 6;
    this.maxNative = MAX_NATIVE;
    this.bearing = 0;
    Object.assign(this, { minZoom, maxZoom, onTap, onView });
    this.overlay = () => ({});
    this.pins = new Map();
    this._bind();
    this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.render()) : null;
    this.ro?.observe(el);
  }

  destroy() {
    this.ro?.disconnect();
    this.destroyed = true;
  }

  size() { return { w: this.el.clientWidth, h: this.el.clientHeight }; }

  _world(p, zoom = this.zoom) {
    const m = mercator(p);
    const s = TS * 2 ** zoom;
    return { x: m.x * s, y: m.y * s };
  }

  // พิกัด → ตำแหน่งบนจอ (หมุนตาม bearing ให้ทิศนั้นชี้ขึ้น)
  project(p) {
    const { w, h } = this.size();
    const a = this._world(p), c = this._world(this.center);
    const dx = a.x - c.x, dy = a.y - c.y;
    const t = (-this.bearing * Math.PI) / 180;
    return { x: w / 2 + dx * Math.cos(t) - dy * Math.sin(t), y: h / 2 + dx * Math.sin(t) + dy * Math.cos(t) };
  }

  unproject(x, y) {
    const { w, h } = this.size();
    const t = (this.bearing * Math.PI) / 180;
    const sx = x - w / 2, sy = y - h / 2;
    const c = this._world(this.center);
    const s = TS * 2 ** this.zoom;
    return unmercator({
      x: (c.x + sx * Math.cos(t) - sy * Math.sin(t)) / s,
      y: (c.y + sx * Math.sin(t) + sy * Math.cos(t)) / s,
    });
  }

  metersToPx(m) { return m / metersPerPixel(this.center.lat, this.zoom); }

  setView({ center = this.center, zoom = this.zoom, bearing = this.bearing } = {}) {
    this.center = center;
    this.maxNative = rememberedMax(center);
    this.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.bearing = bearing;
    this.render();
  }

  // ให้ทุกจุดอยู่ในจอ โดยหมุนให้ทิศ bearing ชี้ขึ้น เว้นขอบตาม pad
  fit(points, { bearing = this.bearing, pad = {}, maxZoom = 19.5 } = {}) {
    const pts = points.filter(Boolean);
    if (!pts.length) return;
    const { w, h } = this.size();
    const P = { top: 40, bottom: 40, left: 30, right: 30, ...pad };
    const t = (-bearing * Math.PI) / 180;
    const rot = pts.map((p) => {
      const m = mercator(p);
      const x = m.x * TS, y = m.y * TS;
      return { x: x * Math.cos(t) - y * Math.sin(t), y: x * Math.sin(t) + y * Math.cos(t) };
    });
    const xs = rot.map((r) => r.x), ys = rot.map((r) => r.y);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    const aw = Math.max(40, w - P.left - P.right), ah = Math.max(40, h - P.top - P.bottom);
    const zoom = clamp(Math.log2(Math.min(aw / Math.max(bw, 1e-9), ah / Math.max(bh, 1e-9))), this.minZoom, maxZoom);
    const k = 2 ** zoom;
    // จุดกลางกรอบ (หมุนแล้ว) → เลื่อนตามขอบที่ไม่เท่ากัน → หมุนกลับเป็นพิกัดจริง
    const rx = ((Math.min(...xs) + Math.max(...xs)) / 2) * k - (P.left - P.right) / 2;
    const ry = ((Math.min(...ys) + Math.max(...ys)) / 2) * k - (P.top - P.bottom) / 2;
    const u = -t;
    const cx = rx * Math.cos(u) - ry * Math.sin(u), cy = rx * Math.sin(u) + ry * Math.cos(u);
    this.bearing = bearing;
    this.zoom = zoom;
    this.center = unmercator({ x: cx / (TS * k), y: cy / (TS * k) });
    this.maxNative = rememberedMax(this.center);
    this.render();
  }

  // ---------- วาด ----------

  _layerTransform(layer) {
    const { w, h } = this.size();
    const s = TS * 2 ** layer.tz;
    const cm = mercator(this.center);
    const cx = cm.x * s, cy = cm.y * s;
    const scale = 2 ** (this.zoom - layer.tz);
    layer.node.style.transform = `translate(${w / 2}px, ${h / 2}px) rotate(${-this.bearing}deg) scale(${scale}) translate(${layer.origin.x * TS - cx}px, ${layer.origin.y * TS - cy}px)`;
    return { cx, cy, scale };
  }

  render() {
    if (this.destroyed) return;
    const { w, h } = this.size();
    if (!w || !h) return;
    const tz = clamp(Math.round(this.zoom), 0, this.maxNative);
    let [front, back] = this.layers;
    if (front.tz !== tz) {
      // ภาพระดับเดิมยังแสดงอยู่ด้านหลังจนภาพใหม่โหลดเสร็จ ไม่กระพริบ
      if (back.tz !== tz) {
        for (const img of back.tiles.values()) img.remove();
        back.tiles.clear();
        const cm = mercator(this.center);
        back.tz = tz;
        back.origin = { x: Math.floor(cm.x * 2 ** tz), y: Math.floor(cm.y * 2 ** tz) };
      }
      this.layers = [back, front];
      [front, back] = this.layers;
      front.node.style.zIndex = '1';
      back.node.style.zIndex = '0';
    }
    const { cx, cy, scale } = this._layerTransform(front);
    if (back.tz != null) this._layerTransform(back);
    const n = 2 ** tz;
    const r = Math.hypot(w, h) / 2 / scale + TS / 2;
    const need = new Set();
    let pending = 0;
    for (let ty = Math.max(0, Math.floor((cy - r) / TS)); ty <= Math.min(n - 1, Math.floor((cy + r) / TS)); ty++) {
      for (let tx = Math.floor((cx - r) / TS); tx <= Math.floor((cx + r) / TS); tx++) {
        const key = `${tx}/${ty}`;
        need.add(key);
        let img = front.tiles.get(key);
        if (!img) {
          img = new Image();
          img.className = 'tm-tile';
          img.alt = '';
          img.draggable = false;
          img.crossOrigin = 'anonymous';
          img.style.left = `${(tx - front.origin.x) * TS}px`;
          img.style.top = `${(ty - front.origin.y) * TS}px`;
          img.onload = () => {
            if (tz > 12 && isPlaceholder(img)) { this._lowerMax(tz); return; }
            img.classList.add('on');
            this._maybeDropBack();
          };
          img.onerror = () => { img.classList.add('err'); this._maybeDropBack(); };
          img.src = tileUrl(tz, ((tx % n) + n) % n, ty);
          front.node.appendChild(img);
          front.tiles.set(key, img);
        }
        if (!img.classList.contains('on') && !img.classList.contains('err')) pending++;
      }
    }
    for (const [k, img] of front.tiles) if (!need.has(k)) { img.remove(); front.tiles.delete(k); }
    if (!pending) this._maybeDropBack();
    this._renderOverlay();
    this.onView?.(this);
  }

  _lowerMax(tz) {
    if (this.maxNative < tz) return;
    this.maxNative = tz - 1;
    rememberMax(this.center, this.maxNative);
    this.render();
  }

  _maybeDropBack() {
    const [front, back] = this.layers;
    if (back.tz == null) return;
    for (const img of front.tiles.values()) if (!img.classList.contains('on') && !img.classList.contains('err')) return;
    for (const img of back.tiles.values()) img.remove();
    back.tiles.clear();
    back.tz = null;
  }

  // overlay(): { lines: [{ a, b, cls, label }], circles: [{ at, m, cls }], pins: [{ id, at, html, cls, drag, onDrag, onDrop }] }
  setOverlay(fn) { this.overlay = fn; this._renderOverlay(); }

  _renderOverlay() {
    const { w, h } = this.size();
    if (!w || !h) return;
    const o = this.overlay(this) || {};
    let svg = '';
    const labels = [];
    for (const c of o.circles || []) {
      const p = this.project(c.at);
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${Math.max(4, this.metersToPx(c.m)).toFixed(1)}" class="${c.cls || ''}"/>`;
    }
    for (const l of o.lines || []) {
      const a = this.project(l.a), b = this.project(l.b);
      svg += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="${l.cls || ''}"/>`;
      if (l.label) labels.push({ id: `lbl-${labels.length}`, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, html: `<span class="tm-lbl">${l.label}</span>`, cls: 'tm-label' });
    }
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.innerHTML = svg;
    const seen = new Set();
    const place = (id, x, y, html, cls, pin) => {
      seen.add(id);
      let node = this.pins.get(id);
      if (!node) {
        node = document.createElement('div');
        this.pinsEl.appendChild(node);
        this.pins.set(id, node);
        if (pin?.drag) this._bindPinDrag(node, id);
      }
      node._pin = pin;
      if (node._html !== html) { node.innerHTML = html; node._html = html; }
      node.className = `tm-pin ${cls || ''}${pin?.drag ? ' drag' : ''}`;
      node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    };
    for (const pin of o.pins || []) {
      const p = this.project(pin.at);
      place(pin.id, p.x, p.y, pin.html || '', pin.cls, pin);
    }
    for (const l of labels) place(l.id, l.x, l.y, l.html, l.cls, null);
    for (const [id, node] of this.pins) if (!seen.has(id)) { node.remove(); this.pins.delete(id); }
  }

  // ---------- สัมผัส ----------

  _local(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ขยับเนื้อแผนที่ตามนิ้ว (dx, dy บนจอ)
  panBy(dx, dy) {
    const { w, h } = this.size();
    this.center = this.unproject(w / 2 - dx, h / 2 - dy);
    this.render();
  }

  zoomAround(pt, dz) {
    const before = this.unproject(pt.x, pt.y);
    this.zoom = clamp(this.zoom + dz, this.minZoom, this.maxZoom);
    const after = this.project(before);
    this.panBy(pt.x - after.x, pt.y - after.y);
  }

  _bind() {
    const el = this.el;
    const pts = new Map();
    let pinch = null, tap = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.tm-pin.drag') || e.target.closest('button, a')) return;
      try { el.setPointerCapture?.(e.pointerId); } catch { /* ไม่เป็นไร */ }
      pts.set(e.pointerId, this._local(e));
      pinch = null;
      tap = pts.size === 1 ? { ...this._local(e), t: Date.now(), moved: 0 } : null;
    });
    el.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const cur = this._local(e);
      pts.set(e.pointerId, cur);
      if (pts.size === 1) {
        this.panBy(cur.x - prev.x, cur.y - prev.y);
        if (tap) tap.moved += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (pinch && d > 0 && pinch.d > 0) {
          this.panBy(mid.x - pinch.mid.x, mid.y - pinch.mid.y);
          this.zoomAround(mid, Math.log2(d / pinch.d));
        }
        pinch = { d, mid };
        tap = null;
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size && tap && tap.moved < 8 && Date.now() - tap.t < 600 && e.type === 'pointerup') {
        const p = this._local(e);
        this.onTap?.(this.unproject(p.x, p.y));
      }
      if (!pts.size) tap = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAround(this._local(e), -e.deltaY * 0.002);
    }, { passive: false });
    el.addEventListener('dblclick', (e) => { e.preventDefault(); this.zoomAround(this._local(e), 1); });
  }

  // หมุดที่ลากได้ (จุดเป้า / หมุดตอนแก้): ส่งพิกัดใหม่ระหว่างลากและตอนปล่อย
  _bindPinDrag(node) {
    let off = null;
    node.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      try { node.setPointerCapture?.(e.pointerId); } catch { /* ไม่เป็นไร */ }
      const p = this._local(e);
      const at = this.project(node._pin.at);
      off = { x: at.x - p.x, y: at.y - p.y };
      node.classList.add('dragging');
    });
    node.addEventListener('pointermove', (e) => {
      if (!off) return;
      const p = this._local(e);
      node._pin.onDrag?.(this.unproject(p.x + off.x, p.y + off.y));
    });
    const drop = (e) => {
      if (!off) return;
      const p = this._local(e);
      const target = this.unproject(p.x + off.x, p.y + off.y);
      off = null;
      node.classList.remove('dragging');
      node._pin.onDrop?.(target);
    };
    node.addEventListener('pointerup', drop);
    node.addEventListener('pointercancel', drop);
  }
}
