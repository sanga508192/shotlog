// หน้าแผนที่หลุม: ภาพดาวเทียมหมุนให้แท่นทีอยู่ล่าง กรีนอยู่บน · แตะ/ลากจุดเป้าดูระยะ · ระยะจาก GPS ถึงกรีน
// หลุมที่ยังไม่มีหมุด: แตะวางแท่นทีและกลางกรีน (ทำครั้งเดียวต่อสนาม ทำจากบ้านได้ ซิงก์ไปกับบัญชี)
import * as st from '../state.js';
import { esc, toast } from '../ui.js';
import { TileMap } from '../map.js';
import {
  courseHoles, holeReady, setHolePoint, distM, bearing, destination, fmtDist, unitTh, scorecardLength, YD, isEstimated,
  HAZARD_KINDS, MAX_HAZARDS, addHazard, setHazard, crowdOf, confirmedPoint, courseHoleNo,
} from '../holemap.js';
import { courseSize } from './group.js';
import { refreshPins, scheduleShare, shareable, sharing } from '../community.js';
import * as cloud from '../cloud.js';
import { logError } from '../errors.js';
import { watchPosition, lastPosition, getPosition } from '../geo.js';
import { clubDistances, suggestClub, GPS_MAX_ACC } from '../coach.js';
import { launchCarryRows } from '../launch.js';
import { shotPath, offLine } from '../shotgeo.js';
import { courseTiles, downloadTiles, dropMissingZooms } from '../tiles.js';
import { maxZoomAt } from '../map.js';
import { teePlanFor } from './holeplan.js';
import { keepAwake } from '../display.js';

// สถานะที่อยู่ข้ามการเปลี่ยนหลุม (ของสนามที่เปิดอยู่)
// edit = กดแก้หมุดเอง (อยู่จนกดเสร็จ) · editHole = หลุมที่กำลังวางหมุดใหม่ (อยู่โหมดวางจนออกจากหลุมนั้น)
const M = { courseId: null, edit: false, editHole: null, placing: null, targets: {}, openKey: null };
const NEAR_M = 800;          // อยู่ใกล้กรีนกว่านี้ วัดระยะจากตัวผู้เล่นแทนแท่นที
const AT_TEE_M = 35;         // ยืนห่างแท่นทีหลุมถัดไปไม่เกินนี้ = ถึงหลุมถัดไปแล้ว
const CLOSER_M = 20;         // และต้องใกล้แท่นทีหลุมถัดไปมากกว่ากรีนหลุมนี้อย่างน้อยเท่านี้ (บางสนามแท่นทีอยู่ติดกรีนหลุมก่อน)
const FRESH_MS = 20000;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ระยะไม้จริงของผู้ใช้: จาก GPS ในสนามก่อน ไม้ที่ยังไม่มีข้อมูล GPS ใช้ระยะลอยจากเครื่องซ้อม (src: 'sim')
export function clubRows() {
  const gps = clubDistances({
    rounds: st.rounds(), holesOf: st.holesOf, shotsOf: st.shotsOf, penaltiesOf: st.penaltiesOf, clubOf: st.club,
    teeOf: (r, h) => confirmedPoint(courseHoles(r.course_id)[courseHoleNo(h)], 'tee'),
  });
  const have = new Set(gps.filter((r) => r.n >= 3).map((r) => r.club_id));
  const sim = launchCarryRows([...st.S.practice.values()], st.club).filter((r) => !have.has(r.clubId));
  return [...gps, ...sim];
}

export const pinHtml = {
  tee: '<span class="mp mp-tee" aria-label="แท่นที"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11M9 14h6l-1 3h-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="3.5" r="2.5" fill="currentColor"/></svg></span>',
  green: '<span class="mp mp-green" aria-label="กรีน"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 20V4l9 4-9 4" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="8" cy="20.5" rx="5" ry="1.5" fill="currentColor"/></svg></span>',
  target: '<span class="mp-target" aria-label="จุดเป้า"></span>',
  edge: '<span class="mp-edge" aria-hidden="true"></span>',
  me: '<span class="mp-me" aria-label="ตำแหน่งของคุณ"></span>',
};

// ---------- เก็บแผนที่สนามไว้ใช้ตอนไม่มีสัญญาณ (สถานะเก็บในเครื่องนี้เท่านั้น) ----------
const offKey = (id) => `shotlog_offline:${id}`;
export function offlineInfo(courseId) {
  try { return JSON.parse(globalThis.localStorage?.getItem(offKey(courseId)) || 'null'); } catch { return null; }
}
export function offlineTiles(courseId) {
  const c = st.course(courseId);
  return courseTiles(courseHoles(courseId), { center: c?.geo && !c.geo.approx ? c.geo : null, maxZoom: maxZoomAt });
}
export function offlineButton(courseId, cls = 'btn block offline-btn') {
  const n = offlineTiles(courseId).length;
  if (!n) return '';
  const info = offlineInfo(courseId);
  const mb = Math.max(1, Math.round((n * 25) / 1024));
  return `<button type="button" class="${cls}" data-act="offlineMap" data-course="${esc(courseId)}">⬇️ ${info ? 'เก็บแผนที่ใหม่' : 'เก็บแผนที่สนามไว้ใช้ตอนไม่มีสัญญาณ'} <small>${info ? `เก็บไว้แล้ว ${new Date(info.at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · ` : ''}~${mb} MB · ${n} ภาพ</small></button>`;
}
export async function saveCourseOffline(courseId, btn) {
  if (btn.dataset.busy) return;
  const tiles = offlineTiles(courseId);
  if (!tiles.length) { toast('ยังไม่มีหมุดหรือตำแหน่งของสนามนี้ วางหมุดแท่นทีและกรีนก่อน'); return; }
  if (globalThis.navigator?.onLine === false) { toast('ต้องต่ออินเทอร์เน็ตก่อน (แนะนำ Wi-Fi)'); return; }
  btn.dataset.busy = '1';
  const label = btn.innerHTML;
  try {
    btn.textContent = '⬇️ กำลังตรวจภาพของพื้นที่นี้…';
    const h = Object.values(courseHoles(courseId)).find((x) => x?.green || x?.tee);
    const list = await dropMissingZooms(tiles, h?.green ?? h?.tee ?? st.course(courseId)?.geo ?? null);
    const r = await downloadTiles(list, { onProgress: (d, t) => { btn.textContent = `⬇️ กำลังเก็บแผนที่ ${Math.round((d / t) * 100)}%`; } });
    const ok = r.total - r.failed - r.missing;
    try { globalThis.localStorage?.setItem(offKey(courseId), JSON.stringify({ at: new Date().toISOString(), tiles: ok })); } catch { /* ไม่เป็นไร */ }
    btn.textContent = r.failed ? `เก็บได้ ${ok}/${r.total} ภาพ` : '✓ เก็บแผนที่แล้ว ใช้ได้แม้ไม่มีสัญญาณ';
    toast(r.failed ? `เก็บได้ ${ok}/${r.total} ภาพ บางภาพโหลดไม่ได้ ลองอีกครั้งตอนเน็ตดี` : `เก็บแผนที่สนามนี้แล้ว ${r.total} ภาพ`);
  } catch (err) {
    logError('offline map', err);
    btn.innerHTML = label;
    toast('เก็บแผนที่ไม่สำเร็จ ลองใหม่อีกครั้ง');
  } finally {
    delete btn.dataset.busy;
  }
}

const hzKind = (z) => HAZARD_KINDS.find((k) => k.v === z.kind);
const hazardHtml = (z, dist) => `<span class="mp-hz" aria-label="${esc(hzKind(z)?.th ?? '')}">${hzKind(z)?.icon ?? '📌'}${dist ? `<b>${dist}</b>` : ''}</span>`;

export function mapView([courseId, numStr, query], ctx) {
  const course = st.course(courseId);
  const params = new URLSearchParams(query || '');
  const round = params.get('r') ? st.S.rounds.get(params.get('r')) : null;
  if (M.courseId !== courseId) Object.assign(M, { courseId, edit: false, editHole: null, placing: null, targets: {} });
  const openKey = `${courseId}|${query || ''}`;
  if (M.openKey !== openKey) { M.openKey = openKey; if (params.get('edit') === '1') M.edit = true; }

  const sc = st.scorecard(courseId);
  const roundHoles = round ? st.holesOf(round.id) : [];
  const count = roundHoles.length || courseSize(courseId);
  const n = clamp(Number(numStr) || 1, 1, count);
  // หลุมจริงของสนาม: เปิดจากรอบที่เล่นวน หลุมในรอบเลขเกินจำนวนหลุมของสนามคือหลุมเดิมของสนาม
  const pnOf = (k) => courseHoleNo(roundHoles.find((h) => h.number === k)) ?? k;
  const pn = pnOf(n);
  const par = roundHoles.find((h) => h.number === n)?.par ?? sc?.par?.[n - 1] ?? null;
  const rq = round ? `?r=${encodeURIComponent(round.id)}` : '';
  const hrefHole = (k) => `#/map/${encodeURIComponent(courseId)}/${k}${rq}`;
  const back = round ? `#/round/${round.id}/hole/${n}` : `#/new/${encodeURIComponent(courseId)}`;

  // หลุมที่ยังไม่มีหมุดเข้าโหมดวางหมุด และอยู่โหมดนี้ต่อจนออกจากหลุมนี้ (ลากปรับหมุดได้หลังวางครบ)
  if (!holeReady(courseHoles(courseId)[pn])) M.editHole = n;
  else if (M.editHole !== n) M.editHole = null;
  if (M.hole !== n) { M.hole = n; M.placing = null; }   // เปลี่ยนหลุม: เริ่มเลือกหมุดที่จะวางใหม่

  let map = null;
  let gps = null;
  const rows = clubRows();
  const driver = rows.find((r) => r.category === 'driver' && r.n >= 3);
  const driverM = () => (driver ? driver.median : 230 * YD);   // ยังไม่มีข้อมูลใช้ 230 หลา
  let gpsErr = null;
  let stopGps = null;
  let root = null;

  const H = () => courseHoles(courseId)[pn] || {};
  const unit = () => st.setting('map_unit', 'yd');
  const editing = () => M.edit || M.editHole === n || !holeReady(H());

  function target() {
    const h = H();
    if (!holeReady(h)) return null;
    if (M.targets[n] !== undefined) return M.targets[n];
    const len = distM(h.tee, h.green);
    // พาร์ 3 หรือหลุมสั้น: ไม่ตั้งจุดเป้า (แตะแผนที่เพื่อวางเองได้)
    if ((par != null && par <= 3) || (par == null && len < 230 * YD)) return null;
    return destination(h.tee, bearing(h.tee, h.green), Math.min(driverM(), len * 0.62));
  }

  const gpsUsable = () => gps && Date.now() - gps.at < FRESH_MS && gps.accuracy <= 30;
  function start() {
    const h = H();
    if (gpsUsable() && h.green && distM(gps, h.green) <= NEAR_M) return { at: gps, me: true };
    return { at: h.tee, me: false };
  }

  function fitHole() {
    const h = H();
    if (!map || !h.tee || !h.green) return;
    map.fit([h.tee, h.green, target()], { bearing: bearing(h.tee, h.green), pad: { top: 170, bottom: editing() ? 310 : 230, left: 40, right: 40 } });
  }

  function initialView() {
    const h = H();
    if (holeReady(h)) { fitHole(); return; }
    const all = courseHoles(courseId);
    const near = h.tee || h.green || all[pn - 1]?.green || all[pn - 1]?.tee || all[pn + 1]?.tee;
    if (near) { map.setView({ center: near, zoom: 17.3, bearing: 0 }); return; }
    const pos = lastPosition(10 * 60 * 1000);
    const geo = course?.geo && !course.geo.approx ? course.geo : null;
    if (geo) map.setView({ center: geo, zoom: 16, bearing: 0 });
    else if (pos) map.setView({ center: pos, zoom: 17, bearing: 0 });
    else if (course?.geo) map.setView({ center: course.geo, zoom: 14, bearing: 0 });
    else map.setView({ center: { lat: 15.2, lon: 102.5 }, zoom: 7, bearing: 0 });
  }

  function overlay() {
    const h = H();
    const u = unit();
    const ed = editing();
    const lines = [], pins = [], circles = [];
    if (gps && Date.now() - gps.at < 60000) {
      circles.push({ at: gps, m: gps.accuracy, cls: 'tm-acc' });
      pins.push({ id: 'me', at: gps, html: pinHtml.me, cls: 'pin-me' });
    }
    if (holeReady(h) && !ed) {
      teeHistory().pts.forEach((p, i) => pins.push({ id: `hist${i}`, at: p.at, html: `<span class="mp-hist${p.pen ? ' pen' : ''}"></span>`, cls: 'pin-hist' }));
      for (const x of trail()) {
        if (x.start && x.end) lines.push({ a: x.start, b: x.end, cls: 'tm-shot' });
        if (x.end) pins.push({ id: `shot${x.shot.id}`, at: x.end, html: `<span class="mp-shot${x.penalized ? ' pen' : ''}">${x.shot.sequence}</span>`, cls: 'pin-shot' });
      }
      const s = start();
      const t = target();
      const label = (a, b) => `${fmtDist(distM(a, b), u)}`;
      if (t) {
        lines.push({ a: s.at, b: t, cls: 'tm-line', label: label(s.at, t) });
        lines.push({ a: t, b: h.green, cls: 'tm-line', label: label(t, h.green) });
      } else {
        lines.push({ a: s.at, b: h.green, cls: 'tm-line', label: label(s.at, h.green) });
      }
      pins.push({ id: 'tee', at: h.tee, html: pinHtml.tee, cls: 'pin-tee' });
      pins.push({ id: 'green', at: h.green, html: pinHtml.green, cls: 'pin-green' });
      for (const e of ['front', 'back']) if (h[e]) pins.push({ id: e, at: h[e], html: pinHtml.edge, cls: 'pin-edge' });
      (h.hazards || []).forEach((z, i) => pins.push({ id: `hz${i}`, at: z, html: hazardHtml(z, fmtDist(distM(s.at, z), u)), cls: 'pin-hz' }));
      if (t) {
        pins.push({
          id: 'target', at: t, html: pinHtml.target, cls: 'pin-target', drag: true,
          onDrag: (p) => { M.targets[n] = p; map._renderOverlay(); },
          onDrop: (p) => { M.targets[n] = p; map._renderOverlay(); const c = root?.querySelector('#map-club'); if (c) c.innerHTML = clubNote(); },
        });
      }
    } else {
      if (h.tee && h.green) lines.push({ a: h.tee, b: h.green, cls: 'tm-line edit', label: fmtDist(distM(h.tee, h.green), u) });
      for (const which of ['tee', 'green', 'front', 'back']) {
        if (!h[which]) continue;
        const edge = which === 'front' || which === 'back';
        pins.push({
          id: `${which}-edit`, at: h[which], html: edge ? pinHtml.edge : pinHtml[which], cls: `pin-${edge ? 'edge' : which}${M.placing === which ? ' placing' : ''}`, drag: true,
          onDrag: () => {},
          onDrop: async (p) => { await setHolePoint(courseId, pn, which, p); shareLater(); refresh(); },
        });
      }
      (h.hazards || []).forEach((z, i) => pins.push({
        id: `hz${i}-edit`, at: z, html: hazardHtml(z, ''), cls: 'pin-hz', drag: true,
        onDrag: () => {},
        onDrop: async (p) => { await setHazard(courseId, pn, i, p); refresh(); },
      }));
    }
    return { lines, pins, circles };
  }

  function gpsCard() {
    const h = H();
    const u = unit();
    if (gpsErr && !gps) return `<span class="muted">📍 ${esc(gpsErr)}</span>`;
    if (!gps) return '<span class="muted">📍 กำลังหาตำแหน่ง…</span>';
    const acc = `±${Math.round(gps.accuracy)} ม.`;
    if (editing()) return `📍 ตำแหน่งคุณ ${acc}`;
    if (!h.green) return `📍 ${acc}`;
    const d = distM(gps, h.green);
    if (d > 2000) return `<span class="muted">📍 อยู่ห่างหลุมนี้ ${(d / 1000).toFixed(1)} กม.</span>`;
    if (h.front || h.back) {
      const part = (p, th) => (p ? `<span>${th} <b>${fmtDist(distM(gps, p), u)}</b></span>` : '');
      return `📍 ${part(h.front, 'หน้า')}<span>กลาง <b>${fmtDist(d, u)}</b></span>${part(h.back, 'หลัง')} ${unitTh(u)} <small>${acc}</small>`;
    }
    return `📍 ถึงกลางกรีน <b>${fmtDist(d, u)}</b> ${unitTh(u)} <small>${acc}</small>`;
  }

  // ช็อตของรอบนี้ในหลุมนี้ (ไม่รวมพัต) · หมุดประมาณใช้แสดงผลได้
  // คำนวณครั้งเดียวต่อการเปิดหลุม (overlay วาดใหม่ทุกครั้งที่เลื่อนแผนที่)
  let trailCache = null;
  let histCache = null;
  const trail = () => (trailCache ??= calcTrail());
  const teeHistory = () => (histCache ??= calcHistory());
  function calcTrail() {
    const rh = roundHoles.find((x) => x.number === n);
    if (!rh) return [];
    return shotPath(st.shotsOf(rh.id), H().tee, st.penaltiesOf(rh.id)).filter((x) => x.shot.shot_type !== 'putt');
  }

  // ทีออฟหลุมนี้จากรอบก่อน ๆ ในสนามเดียวกัน: จำนวน ลูกโทษ และจุดที่ลูกไปจบ (ถ้ารู้)
  function calcHistory() {
    const out = { n: 0, pen: 0, pts: [] };
    for (const r of st.rounds()) {
      if (r.course_id !== courseId || r.id === round?.id || r.shot_logging === false) continue;
      for (const rh of st.holesOf(r.id).filter((x) => courseHoleNo(x) === pn)) {
        const first = shotPath(st.shotsOf(rh.id), H().tee, st.penaltiesOf(rh.id))[0];
        if (!first || first.shot.sequence !== 1) continue;
        out.n++;
        if (first.penalized) out.pen++;
        if (first.end) out.pts.push({ at: first.end, pen: first.penalized });
      }
    }
    out.pts = out.pts.slice(-30);
    return out;
  }

  // น้ำที่อยู่ในช่วงระยะไดรเวอร์ของผู้เล่น (วัดจากแท่นที ตามหมุดน้ำที่วางไว้)
  function hazardNote() {
    const h = H();
    if (!holeReady(h) || !driver?.p25 || !driver?.p75 || start().me) return '';
    const u = unit();
    const risky = (h.hazards || []).filter((z) => z.kind === 'water')
      .map((z) => ({ d: distM(h.tee, z), line: offLine(h.tee, h.green, z) }))
      .filter((x) => x.line && x.line.along > 0 && x.d >= driver.p25 - 15 && x.d <= driver.p75 + 15)
      .sort((a, b) => a.d - b.d);
    if (!risky.length) return '';
    return `<p class="map-warn">💧 น้ำที่ ${fmtDist(risky[0].d, u)} ${unitTh(u)} อยู่ในช่วงระยะ ${esc(driver.label)} ของคุณ (${fmtDist(driver.p25, u)}–${fmtDist(driver.p75, u)}) เลือกไม้ให้ไม่ถึงหรือข้ามได้แน่นอน</p>`;
  }

  // แผนทีออฟของหลุมนี้แบบบรรทัดเดียว (เต็ม ๆ อยู่ในหน้าจดช็อต)
  function planLine() {
    if (start().me) return '';
    const tp = teePlanFor(round ?? { id: null, course_id: courseId }, { number: n, par, distance: null }, unit());
    return tp ? `<p class="map-club">🧭 <b>${esc(tp.club.label)}</b> · ${esc(tp.aim)}</p>` : '';
  }

  function historyNote() {
    const t = teeHistory();
    if (!t.n) return '';
    return `<p class="map-club">ทีออฟหลุมนี้ที่ผ่านมา ${t.n} ครั้ง${t.pen ? ` · ลูกโทษ <b class="pen">${t.pen}</b>` : ''}${t.pts.length ? ' · จุดขาว = ลูกไปจบ (แดง = โดนลูกโทษ)' : ''}</p>`;
  }

  function title() {
    const h = H();
    const u = unit();
    const len = holeReady(h) ? distM(h.tee, h.green) : null;
    return `หลุม ${n}${pn !== n ? ` (หลุม ${pn} ของสนาม)` : ''}${par ? ` · พาร์ ${par}` : ''}${len ? ` · ${fmtDist(len, u)} ${unitTh(u)}` : ''}`;
  }

  // ไม้แนะนำสำหรับช็อตถัดไป: จากจุดเริ่ม (ตัวผู้เล่น/แท่นที) ถึงจุดเป้า หรือถึงกลางกรีนถ้าไม่มีจุดเป้า
  function clubNote() {
    const h = H();
    if (!holeReady(h) || !rows.length) return '';
    const t = target();
    const d = distM(start().at, t ?? h.green);
    const c = suggestClub(d, rows);
    if (!c) return '';
    const u = unit();
    return `<p class="map-club">🏌️ ${t ? 'ถึงจุดเป้า' : 'ถึงกลางกรีน'} ${fmtDist(d, u)} ${unitTh(u)} → <b>${esc(c.label)}</b> <small>${c.src === 'sim' ? 'ระยะลอยจากเครื่องซ้อม' : 'ระยะกลางของคุณ'} ${fmtDist(c.median, u)}</small></p>`;
  }

  // หมุดจากผู้เล่นคนอื่น (ค่ากลาง) · หมุดเริ่มต้นที่ยังไม่มีใครตรวจ: เตือนทุกครั้ง
  function estNote() {
    const h = H();
    const crowd = crowdOf(h);
    if (!isEstimated(h)) {
      return crowd ? `<p class="map-crowd">👥 หมุดจากผู้เล่น ${crowd.n} คน${crowd.gps ? ` (วางในสนาม ${crowd.gps} คน)` : ''} — ถ้าไม่ตรงกด ✏️ แก้หมุด</p>` : '';
    }
    return `<p class="map-est">⚠️ หมุด${h.est.tee && h.est.green ? '' : h.est.tee ? 'แท่นที' : 'กรีน'}ประมาณจากภาพดาวเทียม (ความมั่นใจ${h.conf === 'mid' ? 'ปานกลาง' : 'ต่ำ'}) ยังไม่ได้ตรวจในสนาม — ถ้าไม่ตรงกด ✏️ แก้หมุด</p>`;
  }

  function panel() {
    const h = H();
    const u = unit();
    if (!editing()) {
      const s = holeReady(h) ? start() : null;
      return `<div class="map-nav">
          ${n > 1 ? `<a class="map-round" href="${hrefHole(n - 1)}" aria-label="หลุมก่อนหน้า">‹</a>` : '<span class="map-round off">‹</span>'}
          <div class="map-hole"><small>หลุม</small><b>${n}</b></div>
          ${n < count ? `<a class="map-round" href="${hrefHole(n + 1)}" aria-label="หลุมถัดไป">›</a>` : '<span class="map-round off">›</span>'}
        </div>
        ${estNote()}
        ${planLine()}
        <div id="map-club">${clubNote()}</div>
        ${hazardNote()}
        ${historyNote()}
        <p class="map-hint">${s?.me ? 'วัดจากตำแหน่งของคุณ' : 'วัดจากแท่นที'} · แตะแผนที่หรือลากจุดเหลืองเพื่อดูระยะ</p>
        <div class="map-tools">
          <button type="button" class="map-pill" data-act="recenter">⤢ ทั้งหลุม</button>
          <button type="button" class="map-pill" data-act="edit">✏️ แก้หมุด</button>
          ${offlineInfo(courseId) ? '' : '<button type="button" class="map-pill" data-act="offlineMap" data-course="' + esc(courseId) + '">⬇️ เก็บแผนที่</button>'}
        </div>`;
    }
    const len = holeReady(h) ? distM(h.tee, h.green) : null;
    const scl = scorecardLength(sc, n, round?.tee_id);
    const scInUnit = scl ? Math.round(scl.unit === u ? scl.value : scl.unit === 'yd' ? scl.value * YD : scl.value / YD) : null;
    const hz = HAZARD_KINDS.find((k) => M.placing === `hz:${k.v}`);
    const hint = M.placing === 'tee' ? `แตะบนแผนที่ตรง<b>แท่นที</b>ที่คุณใช้ของหลุม ${n}`
      : M.placing === 'green' ? `แตะบนแผนที่ตรง<b>กลางกรีน</b>หลุม ${n}`
        : M.placing === 'front' ? 'แตะที่<b>ขอบหน้ากรีน</b> (ฝั่งที่ตีเข้ามา)'
          : M.placing === 'back' ? 'แตะที่<b>ขอบหลังกรีน</b>'
            : hz ? `แตะจุดที่อยากรู้ระยะของ<b>${hz.th}</b> เช่น ขอบที่ต้องตีข้าม`
              : 'ลากหมุดเพื่อปรับให้ตรง หรือเลือกหมุดที่จะวางใหม่';
    const hzList = h.hazards?.length
      ? `<div class="map-hz-list">${h.hazards.map((z, i) => `<button type="button" class="map-pill" data-act="delHz" data-i="${i}" aria-label="ลบ${esc(hzKind(z)?.th)}">${hzKind(z)?.icon} ลบ</button>`).join('')}</div>` : '';
    return `<div class="map-steps">
        <button type="button" class="map-step${M.placing === 'tee' ? ' on' : ''}${h.tee ? ' done' : ''}" data-act="place" data-v="tee">🏌️ แท่นที${h.tee ? ' ✓' : ''}</button>
        <button type="button" class="map-step${M.placing === 'green' ? ' on' : ''}${h.green ? ' done' : ''}" data-act="place" data-v="green">⛳ กลางกรีน${h.green ? ' ✓' : ''}</button>
      </div>
      ${holeReady(h) ? `<div class="map-steps more">
        <button type="button" class="map-step small${M.placing === 'front' ? ' on' : ''}${h.front ? ' done' : ''}" data-act="place" data-v="front">หน้ากรีน${h.front ? ' ✓' : ''}</button>
        <button type="button" class="map-step small${M.placing === 'back' ? ' on' : ''}${h.back ? ' done' : ''}" data-act="place" data-v="back">หลังกรีน${h.back ? ' ✓' : ''}</button>
        ${(h.hazards?.length ?? 0) < MAX_HAZARDS ? HAZARD_KINDS.map((k) => `<button type="button" class="map-step small${M.placing === `hz:${k.v}` ? ' on' : ''}" data-act="place" data-v="hz:${k.v}">＋${k.icon} ${k.th}</button>`).join('') : ''}
      </div>${hzList}` : ''}
      ${estNote()}
      ${shareable(courseId) ? `<label class="map-share"><input type="checkbox" data-change="sharePins"${sharing() ? ' checked' : ''}> แชร์หมุดที่ฉันวางให้ผู้เล่นคนอื่น <small>(ไม่ระบุตัวตน)</small></label>` : ''}
      <p class="map-hint">${hint} · ลาก/ถ่างนิ้วเพื่อหาหลุม</p>
      ${len ? `<p class="map-check">วัดจากหมุด <b>${fmtDist(len, u)}</b> ${unitTh(u)}${scInUnit ? ` · สกอร์การ์ด${scl.tee ? ` (${esc(scl.tee)})` : ''} ${scInUnit} ${unitTh(u)}` : ''}</p>` : ''}
      <div class="map-tools">
        <button type="button" class="map-pill" data-act="gpsHere"${M.placing ? '' : ' disabled'}>📍 ใช้ตำแหน่งฉันตอนนี้</button>
        ${holeReady(h) ? '<button type="button" class="map-pill primary" data-act="done">เสร็จ</button>' : ''}
        ${n < count ? `<a class="map-pill" href="${hrefHole(n + 1)}">หลุม ${n + 1} ›</a>` : ''}
      </div>`;
  }

  const shareLater = () => scheduleShare(courseId, () => refresh());

  function refresh() {
    if (!root) return;
    root.querySelector('.map-screen')?.classList.toggle('editing', editing());
    root.querySelector('#map-title').textContent = title();
    root.querySelector('#map-panel').innerHTML = panel();
    root.querySelector('#map-gps').innerHTML = gpsCard();
    root.querySelector('#map-unit').textContent = unit() === 'yd' ? 'หลา' : 'ม.';
    map?._renderOverlay();
  }

  async function onTap(p) {
    if (editing()) {
      if (!M.placing) return;
      const which = M.placing;
      if (which.startsWith('hz:')) {
        await addHazard(courseId, pn, p, which.slice(3));
        M.placing = null;
        refresh();
        return;
      }
      await setHolePoint(courseId, pn, which, p);
      shareLater();
      if (which === 'front' || which === 'back') { M.placing = null; refresh(); return; }
      const h = H();
      M.placing = which === 'tee' && !h.green ? 'green' : null;
      if (holeReady(h) && which === 'green') fitHole();
      refresh();
      return;
    }
    M.targets[n] = p;
    refresh();
  }

  // ยืนที่แท่นทีหลุมถัดไป (ใกล้กว่ากรีนหลุมนี้ชัดเจน) → เปิดหลุมถัดไปให้เอง (ปิดได้ในค่าตั้ง)
  let advanced = false;
  let wasAway = false;   // เปิดหน้านี้ขณะยืนที่แท่นทีถัดไปอยู่แล้ว = ตั้งใจดูหลุมนี้ ไม่ต้องพาไปต่อ
  function autoAdvance() {
    if (advanced || editing() || n >= count || !gpsUsable() || st.setting('map_auto_hole', true) === false) return;
    const next = courseHoles(courseId)[pnOf(n + 1)];
    const h = H();
    const dTee = next?.tee ? distM(gps, next.tee) : Infinity;
    if (dTee > AT_TEE_M + 30) wasAway = true;
    if (dTee > AT_TEE_M || !wasAway) return;
    if (h.green && distM(gps, h.green) < dTee + CLOSER_M) return;
    advanced = true;
    toast(`ถึงแท่นทีหลุม ${n + 1} แล้ว เปิดหลุม ${n + 1} ให้`);
    ctx.go(hrefHole(n + 1));
  }

  return {
    html: `<div class="map-screen${editing() ? ' editing' : ''}">
      <div id="hole-map" class="map-view"></div>
      <div class="map-top">
        <a class="map-round" href="${back}" aria-label="กลับ">‹</a>
        <div class="map-title"><b>${esc(course?.display_name_th || round?.course_name_snapshot || 'สนาม')}</b><span id="map-title">${esc(title())}</span></div>
        <button type="button" class="map-round unit" id="map-unit" data-act="unit" aria-label="เปลี่ยนหน่วยระยะ">${unit() === 'yd' ? 'หลา' : 'ม.'}</button>
      </div>
      <div class="map-gps" id="map-gps">${gpsCard()}</div>
      <div class="map-bottom" id="map-panel">${panel()}</div>
    </div>`,
    mount(el) {
      root = el;
      keepAwake(round?.status === 'playing');
      if (editing() && !M.placing) { const h = H(); M.placing = !h.tee ? 'tee' : !h.green ? 'green' : null; refresh(); }
      map = new TileMap(el.querySelector('#hole-map'), { onTap: (p) => { onTap(p).catch((e) => toast(e.message)); } });
      map.setOverlay(overlay);
      initialView();
      refreshPins(courseId).then((changed) => {
        if (!changed || !root) return;
        const was = holeReady(H());
        refresh();
        if (!was && holeReady(H())) fitHole();
      }).catch((err) => logError('community pins', err));
      shareLater();   // หมุดที่แก้ตอนออฟไลน์ ส่งตอนมีเน็ต
      stopGps = watchPosition((pos) => {
        const first = !gps;
        gps = pos;
        gpsErr = null;
        root.querySelector('#map-gps').innerHTML = gpsCard();
        // หลุมที่ยังไม่มีหมุดและไม่รู้ตำแหน่งสนาม: พาไปที่ตัวผู้ใช้
        if (first && !holeReady(H()) && map.zoom < 12) map.setView({ center: pos, zoom: 17 });
        map._renderOverlay();
        if (first && !editing()) root.querySelector('#map-panel').innerHTML = panel();
        else if (!editing()) { const c = root.querySelector('#map-club'); if (c) c.innerHTML = clubNote(); }
        autoAdvance();
      }, (err) => {
        gpsErr = err.code === 1 ? 'เปิดสิทธิ์ตำแหน่งเพื่อดูระยะจากตัวคุณ' : 'ยังหาตำแหน่งไม่ได้';
        root.querySelector('#map-gps').innerHTML = gpsCard();
      });
    },
    unmount() { stopGps?.(); map?.destroy(); root = null; keepAwake(false); },
    actions: {
      unit: async () => { await st.setSetting('map_unit', unit() === 'yd' ? 'm' : 'yd'); refresh(); },
      recenter: () => fitHole(),
      offlineMap: (el) => saveCourseOffline(courseId, el),
      edit: () => { M.edit = true; M.placing = null; refresh(); },
      done: () => { M.edit = false; M.editHole = null; M.placing = null; fitHole(); refresh(); toast('บันทึกหมุดแล้ว'); },
      place: (el) => { M.placing = M.placing === el.dataset.v ? null : el.dataset.v; refresh(); },
      delHz: async (el) => { await setHazard(courseId, pn, Number(el.dataset.i), null); refresh(); },
      sharePins: async (el) => {
        if (el.checked && !cloud.session()) {
          el.checked = false;
          toast('เข้าสู่ระบบก่อน แล้วค่อยเปิดแชร์หมุด (เมนู ฉัน → บัญชี)');
          return;
        }
        await st.setSetting('share_pins', el.checked);
        if (el.checked) { shareLater(); toast('จะแชร์หมุดที่คุณวางเองในสนามนี้และสนามอื่นในรายชื่อ'); }
        else toast('ปิดการแชร์แล้ว ลบหมุดที่เคยแชร์ได้ในหน้าตั้งค่า');
      },
      gpsHere: async (el) => {
        if (!M.placing) return;
        el.disabled = true;
        try {
          const pos = (gps && Date.now() - gps.at < 15000) ? gps : await getPosition({ highAccuracy: true, maxAge: 5000, timeout: 20000 });
          if (pos.accuracy > GPS_MAX_ACC && !confirm(`ตำแหน่งตอนนี้คลาดเคลื่อนได้ ±${Math.round(pos.accuracy)} เมตร ใช้เลยหรือไม่? (รอสักครู่ในที่โล่งจะแม่นขึ้น)`)) return;
          await onTap({ ...pos, via: 'gps' });
        } finally {
          el.disabled = false;
        }
      },
    },
  };
}
