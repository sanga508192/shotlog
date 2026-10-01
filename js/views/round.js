import * as st from '../state.js';
import { esc, header, chips, toast, fmtDate } from '../ui.js';
import {
  SHOT_TYPES, ASSESSMENTS, CONTACTS, DIRECTIONS, DISTANCE_RESULTS, TARGET_RESULTS,
  LIES, START_LIES, TARGETS, MEASURE_METHODS, UNITS, PENALTY_REASONS, HOLE_FINISH, HOLE_STATUS, label,
  OUTCOMES, PUTT_OUTCOMES, PENALTY_ENDS, RELIEFS,
} from '../constants.js';
import { holeScore, roundScore, fmtToPar, suggestShotType, shiftForInsert, resequence } from '../logic.js';
import {
  groupEntryHtml, setGroupScore, groupTableHtml, countsTableHtml, gridOf, isGroupRound, shotLogging,
  rememberCourseCard,
} from './group.js';
import { playersOf, openHoles, fmtRanges, ME } from '../group.js';
import { deleteRound } from './main.js';
import { liveCardHtml, liveActions } from './live.js';
import { watchPosition, lastPosition } from '../geo.js';
import { courseHoles, distM, toUnit, unitTh, confirmedPoint, holeReady, setHolePoint } from '../holemap.js';
import { GPS_MAX_ACC, suggestClub } from '../coach.js';
import { clubRows } from './map.js';
import { shotPath, landOf } from '../shotgeo.js';
import { openLandPicker, landInfo, landText, sideTh } from './landpick.js';

// ---------- สถานะฟอร์มจดช็อต (อยู่ข้ามการ render) ----------

let F = null;        // ร่างช็อต
let mode = 'new';    // new | edit | insert
let typeTouched = false;
let details = false;
let saving = false;
let pen = null;      // ร่างสโตรกปรับ
let relief = null;   // ช็อตที่ลูกลงน้ำ/OB/หาย/เล่นไม่ได้: ตีต่อแบบไหน (RELIEFS)
let hint = '';           // เหตุผลของไม้ที่แนะนำ (แสดงอย่างเดียว ไม่บันทึก)
let suggestedFor = null; // ร่างที่แนะนำไม้ไปแล้ว
let suggestedAt = null;  // ตำแหน่งตอนแนะนำ (เดินไปที่ลูกแล้ว → แนะนำใหม่ ถ้าผู้ใช้ยังไม่ได้เลือกเอง)
let clubTouched = false; // ผู้ใช้เลือกไม้เอง → ไม่แนะนำทับ
let draftType = null;    // ประเภทช็อตที่ระบบเสนอตอนสร้างร่าง (ใช้คืนค่าเมื่อไม่มีไม้แนะนำ)
let puttDist = null;     // ระยะพัตแรกของปุ่มจบหลุมด้วยพัต

// ไม้ที่ใช้บ่อยที่สุดในช็อตแบบนี้ (รอบที่จดรายช็อต 15 รอบล่าสุด) เฉพาะไม้ที่ยังอยู่ในกระเป๋า
function usualClub(pick) {
  const inBag = new Set(st.bagClubs().map((c) => c.id));
  const count = new Map();
  for (const r of st.rounds().filter((x) => x.shot_logging !== false).slice(0, 15)) {
    for (const h of st.holesOf(r.id)) {
      for (const s of st.shotsOf(h.id)) {
        if (s.club_id && inBag.has(s.club_id) && pick(s, h)) count.set(s.club_id, (count.get(s.club_id) || 0) + 1);
      }
    }
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// วิธีตีต่อที่เก็บไว้กับสโตรกปรับอัตโนมัติของช็อตนั้น
const reliefOf = (holeId, shotId) => st.penaltiesOf(holeId).find((p) => p.related_shot_id_optional === shotId && p.auto)?.relief ?? null;
const rehitAfter = (holeId, prev) => !!prev && !!PENALTY_ENDS[prev.end_lie] && reliefOf(holeId, prev.id) === 'rehit';

// ช็อตถัดไปตีจากไหน: ตีใหม่จากจุดเดิม = จุดเริ่มเดิม · ดรอปหลังลงน้ำ/OB = ยังไม่รู้ (เลือกเองในรายละเอียด)
function nextStart(prev, rehit) {
  if (!prev || prev.end_lie === 'holed') return null;
  if (PENALTY_ENDS[prev.end_lie]) return rehit ? prev.start_lie ?? null : null;
  return prev.end_lie ?? null;
}

function blankShot(round, hole, seq, prev) {
  const rehit = rehitAfter(hole.id, prev);
  const sug = suggestShotType({ seq, prev, clubCategory: null, rehit });
  return {
    id: st.uid(), round_id: round.id, hole_id: hole.id, sequence: seq,
    club_id: rehit ? prev.club_id ?? null : null, shot_type: sug, assessment: null,
    contact: null, direction: null, distance_result: null, target_result: null,
    start_lie: seq === 1 ? 'tee' : nextStart(prev, rehit),
    end_lie: null, distance_before: null, distance_after: null,
    distance_unit: round.distance_unit, measurement_method: null, raw_distance_text: '',
    target: null, target_text: '', note: '', holed: false, counted: true, not_counted_reason: '',
  };
}

function resetDraft(round, hole, at = null) {
  const shots = st.shotsOf(hole.id);
  const seq = at ?? shots.length + 1;
  const prev = shots.filter((s) => s.sequence < seq).at(-1) ?? null;
  F = blankShot(round, hole, seq, prev);
  mode = at ? 'insert' : 'new';
  typeTouched = false;
  details = false;
  relief = null;
  hint = '';
  suggestedFor = null;
  suggestedAt = null;
  clubTouched = false;
  draftType = F.shot_type;
  puttDist = null;
}

function shotSummary(s) {
  const bits = [];
  for (const [list, key] of [[CONTACTS, 'contact'], [DIRECTIONS, 'direction'], [DISTANCE_RESULTS, 'distance_result'], [TARGET_RESULTS, 'target_result']]) {
    if (s[key]) bits.push(label(list, s[key]));
  }
  const lie = s.start_lie || s.end_lie ? `${label(LIES, s.start_lie)} → ${label(LIES, s.end_lie)}` : '';
  const dist = [s.distance_before, s.distance_after].some((v) => v != null)
    ? `${s.distance_before ?? '?'}→${s.distance_after ?? '?'} ${label(UNITS, s.distance_unit)}` : '';
  return { bits, lie, dist };
}

function assessBadge(a) {
  if (a === 'good') return '<span class="badge good">ดี</span>';
  if (a === 'needs_work') return '<span class="badge bad">ต้องปรับ</span>';
  return '<span class="badge none">ยังไม่ประเมิน</span>';
}

function shotCard(s, editingId, gpsM = null, unit = 'm') {
  const c = st.club(s.club_id);
  const { bits, lie, dist } = shotSummary(s);
  // พัตไม่แสดงระยะ GPS (คลาดเคลื่อนหลายเมตร มากกว่าระยะพัต) · 📌 = ปักจุดที่ลูกไปจบบนแผนที่
  const pin = landOf(s) ? '📌' : '📍';
  const gpsTxt = s.shot_type === 'putt' ? '' : gpsM != null ? `${pin} ${Math.round(toUnit(gpsM, unit))} ${unitTh(unit)}` : s.gps || s.land ? pin : '';
  return `<div class="shot${s.id === editingId ? ' editing' : ''}${s.counted === false ? ' void' : ''}">
    <button type="button" class="shot-main" data-act="edit" data-id="${s.id}">
      <span class="seq">${s.sequence}</span>
      <span class="shot-body">
        <span><strong>${esc(c?.label ?? 'ไม่ระบุไม้')}</strong> · ${esc(label(SHOT_TYPES, s.shot_type))} ${assessBadge(s.assessment)}${gpsTxt ? ` <span class="gps-dist" title="ระยะช็อตจาก GPS หรือจุดที่ปักบนแผนที่">${gpsTxt}</span>` : ''}
          ${s.holed ? '<span class="badge good">ลงหลุม</span>' : ''}${s.counted === false ? '<span class="badge none">ไม่นับ</span>' : ''}</span>
        ${bits.length ? `<span class="small">${esc(bits.join(' · '))}</span>` : ''}
        ${lie || dist || s.raw_distance_text ? `<span class="small muted">${esc([lie, dist, s.raw_distance_text].filter(Boolean).join(' · '))}</span>` : ''}
        ${s.note ? `<span class="small quote">“${esc(s.note)}”</span>` : ''}
      </span>
    </button>
    <div class="shot-tools">
      <button type="button" class="mini" data-act="insert" data-seq="${s.sequence}" title="แทรกช็อตที่ลืมจดก่อนช็อตนี้">แทรก</button>
      <button type="button" class="mini danger" data-act="remove" data-id="${s.id}">ลบ</button>
    </div>
  </div>`;
}

function numInput(field, ph) {
  const v = F[field];
  return `<input class="input" type="number" inputmode="decimal" step="any" min="0" placeholder="${ph}" value="${v ?? ''}" data-input="num" data-field="${field}">`;
}

// land = { can, text } ปุ่มปักจุดที่ลูกไปจบ (null = สนามนี้ยังไม่มีแผนที่)
const LAND_WHAT = { water: 'ลงน้ำ', ob: 'ออก OB', lost: 'น่าจะหาย', unplayable: 'ไปหยุด', trees: 'เข้าป่า' };
function landButton(land) {
  if (!land || F.shot_type === 'putt') return '';
  const what = LAND_WHAT[F.end_lie];
  if (!land.can) return `<a class="btn block land-btn" href="${land.setup}">📍 วางหมุดแท่นทีและกรีนหลุมนี้ก่อน เพื่อปักจุดที่ลูกไปจบ</a>`;
  if (F.land) return `<button type="button" class="btn block land-btn on" data-act="land">📍 จุดที่ลูกไปจบ: ${esc(land.text || 'ปักแล้ว')} <small>แตะเพื่อแก้</small></button>`;
  if (what) return `<button type="button" class="btn block land-btn suggest" data-act="land">📍 ปักจุดที่ลูก${what} <small>แนะนำ · แตะบนแผนที่ แอปจะรู้ระยะและทิศจริง</small></button>`;
  return '<button type="button" class="btn block land-btn" data-act="land">📍 ปักจุดที่ลูกไปจบบนแผนที่ <small>ไม่บังคับ · ใช้เมื่ออยากรู้ระยะ หรือไม่ได้เปิด GPS</small></button>';
}

// ลูกไปจบที่ไหน (แตะครั้งเดียว) · ไปทางไหน · ลงน้ำ/OB/หาย: ตีต่อแบบไหน แล้วบันทึกสโตรกปรับให้เอง
function outcomeHtml() {
  const putt = F.shot_type === 'putt';
  const opts = putt ? OUTCOMES.filter((o) => PUTT_OUTCOMES.includes(o.v)) : OUTCOMES;
  const pe = PENALTY_ENDS[F.end_lie];
  const rOpts = pe ? RELIEFS.filter((r) => pe.reliefs.includes(r.v)) : [];
  const cur = rOpts.find((r) => r.v === relief) ?? rOpts[0];
  return `<div class="lbl">ลูกไปจบที่ไหน</div>${chips('set', 'end_lie', opts, F.end_lie, { cls: 'outcomes' })}
    ${showDirHere() ? `<div class="lbl">ไปทางไหน</div>${chips('set', 'direction', DIRECTIONS, F.direction)}` : ''}
    ${pe ? `<div class="pen-auto">
      <div class="lbl">ตีต่อจาก</div>${chips('relief', 'relief', rOpts.map((r) => ({ v: r.v, th: `${r.th} +${r.strokes}` })), cur.v)}
      <p class="note">บันทึกสโตรกปรับ +${cur.strokes} (${esc(label(PENALTY_REASONS, pe.reason))}) ให้เองตอนกดบันทึกช็อต</p>
    </div>` : ''}`;
}
const showDirHere = () => F.shot_type !== 'putt' && !!F.end_lie && !['green', 'holed', 'fairway'].includes(F.end_lie);

function shotForm(bag, phrases, gpsOn = false, land = null) {
  const showSymptoms = F.assessment === 'needs_work' || details;
  const title = mode === 'edit' ? `แก้ไขช็อตที่ ${F.sequence}` : mode === 'insert' ? `แทรกช็อตที่ ${F.sequence}` : `ช็อตที่ ${F.sequence}`;
  const clubOpts = bag.map((c) => ({ v: c.id, th: c.label }));
  return `<section class="card entry" id="entry">
    <div class="row between"><h3>${title}</h3>${mode !== 'new' ? '<button type="button" class="mini" data-act="cancel">ยกเลิก</button>' : ''}</div>
    ${mode !== 'edit' ? `<label class="check gps-toggle"><input type="checkbox" data-change="gpsShots" ${gpsOn ? 'checked' : ''}> 📍 จับตำแหน่ง GPS ตอนบันทึก <span class="small muted" id="gps-state"></span></label>
    ${gpsOn ? '<p class="note">บันทึกช็อตขณะยืนอยู่ที่จุดตี (ก่อนหรือหลังตีก็ได้ ก่อนเดินไปลูกถัดไป) แอปจะคำนวณระยะแต่ละช็อตให้</p>' : ''}` : ''}
    <div class="lbl">ไม้${hint && F.club_id ? ` <span class="muted small">(แนะนำ: ${esc(hint)} · แตะเพื่อเปลี่ยน)</span>` : ''}</div>${chips('set', 'club_id', clubOpts, F.club_id, { cls: 'clubs' })}
    <div class="lbl">ประเภท ${typeTouched ? '' : '<span class="muted small">(ระบบเสนอ แตะเพื่อแก้)</span>'}</div>${chips('set', 'shot_type', SHOT_TYPES, F.shot_type)}
    ${outcomeHtml()}
    ${landButton(land)}
    <div class="lbl">ประเมินช็อต</div>
    <div class="assess">
      ${ASSESSMENTS.map((a) => `<button type="button" class="big-choice ${a.v}${F.assessment === a.v ? ' on' : ''}" data-act="assess" data-v="${a.v}">${a.th}</button>`).join('')}
      <button type="button" class="big-choice none${F.assessment == null ? ' on' : ''}" data-act="assess" data-v="">ยังไม่ประเมิน</button>
    </div>
    ${showSymptoms ? `<div class="symptoms">
      <div class="lbl">การสัมผัสลูก</div>${chips('set', 'contact', CONTACTS, F.contact)}
      ${showDirHere() ? '' : `<div class="lbl">ทิศทาง</div>${chips('set', 'direction', DIRECTIONS, F.direction)}`}
      <div class="lbl">ระยะเทียบเป้า</div>${chips('set', 'distance_result', DISTANCE_RESULTS, F.distance_result)}
      <div class="lbl">ผลเทียบเป้าหมาย</div>${chips('set', 'target_result', TARGET_RESULTS, F.target_result)}
    </div>` : ''}
    <button type="button" class="linklike" data-act="details">${details ? '▴ ซ่อนรายละเอียด' : '▾ รายละเอียดเพิ่ม (จุดที่ตี ระยะ ข้อความ)'}</button>
    ${details ? `<div class="details">
      <div class="lbl">ตีจากตรงไหน</div>${chips('set', 'start_lie', START_LIES, F.start_lie)}
      <div class="lbl">ระยะก่อน → หลังตี</div>
      <div class="row gap">${numInput('distance_before', 'ก่อนตี')}${numInput('distance_after', 'เหลือหลังตี')}</div>
      ${chips('set', 'distance_unit', UNITS, F.distance_unit)}
      <div class="lbl">วิธีได้ระยะ</div>${chips('set', 'measurement_method', MEASURE_METHODS, F.measurement_method)}
      <label class="lbl">คำบอกระยะ (เก็บตามที่พิมพ์ ไม่แปลงหน่วย)<input class="input" value="${esc(F.raw_distance_text)}" placeholder="เช่น 2 คันธง" data-input="text" data-field="raw_distance_text"></label>
      <div class="lbl">เป้าหมายของช็อต</div>${chips('set', 'target', TARGETS, F.target)}
      ${F.target === 'custom' ? `<input class="input" value="${esc(F.target_text)}" placeholder="ระบุเป้าหมาย" data-input="text" data-field="target_text">` : ''}
      <label class="check"><input type="checkbox" data-change="counted" ${F.counted === false ? 'checked' : ''}> ไม่นับในสกอร์ (เช่น ลูกสำรองที่ไม่ได้ใช้)</label>
      ${F.counted === false ? `<input class="input" value="${esc(F.not_counted_reason)}" placeholder="เหตุผลที่ไม่นับ" data-input="text" data-field="not_counted_reason">` : ''}
    </div>` : ''}
    <div class="lbl">หมายเหตุ</div>
    <div class="chips phrases">${phrases.map((p) => `<button type="button" class="chip ghost" data-act="phrase" data-v="${esc(p)}">＋${esc(p)}</button>`).join('')}</div>
    <textarea class="input" rows="2" data-input="text" data-field="note" placeholder="คำที่ใช้จริง เช่น ลูกออกขวาเยอะ">${esc(F.note)}</textarea>
    <button type="button" class="btn primary big block" data-act="save" id="save-btn">${mode === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึกช็อต'}</button>
  </section>`;
}

const LAND_REASONS = ['ob_lost', 'penalty_area', 'unplayable'];

function penaltySection(hole, shots, canLand = false) {
  const list = st.penaltiesOf(hole.id);
  const rows = list.map((p) => {
    const s = shots.find((x) => x.id === p.related_shot_id_optional);
    const ask = canLand && s && !landOf(s) && LAND_REASONS.includes(p.reason);
    return `<div class="pen">
      <span>+${p.strokes} ปรับ · ${esc(label(PENALTY_REASONS, p.reason))}${p.related_shot_id_optional ? ` · หลังช็อต ${s?.sequence ?? '?'}${s && landOf(s) ? ' 📌' : ''}` : ''}${p.relief ? ` · ${esc(RELIEFS.find((r) => r.v === p.relief)?.th ?? '')}` : ''}${p.note ? ` · ${esc(p.note)}` : ''}${p.auto ? ' <small class="muted">(จากผลช็อต)</small>' : ''}</span>
      <span class="row gap">${ask ? `<button type="button" class="mini" data-act="penLand" data-shot="${s.id}">📍 ปักจุดที่ลูกไป</button>` : ''}<button type="button" class="mini danger" data-act="penDel" data-id="${p.id}">ลบ</button></span></div>`;
  }).join('');
  if (!pen) return `${rows}<button type="button" class="btn block" data-act="penOpen">＋ สโตรกปรับ</button>`;
  return `${rows}<div class="card">
    <h3>เพิ่มสโตรกปรับ</h3>
    <div class="lbl">จำนวน</div>${chips('penSet', 'strokes', [{ v: 1, th: '1' }, { v: 2, th: '2' }], pen.strokes)}
    <div class="lbl">เหตุ</div>${chips('penSet', 'reason', PENALTY_REASONS, pen.reason)}
    <label class="lbl">เกี่ยวกับช็อต (ไม่บังคับ)
      <select class="input" data-change="penShot"><option value="">ไม่ระบุ</option>
        ${shots.map((s) => `<option value="${s.id}"${s.id === pen.related_shot_id_optional ? ' selected' : ''}>ช็อต ${s.sequence}</option>`).join('')}
      </select></label>
    <input class="input" placeholder="หมายเหตุ" value="${esc(pen.note)}" data-input="penNote">
    <div class="row gap"><button type="button" class="btn primary" data-act="penSave">บันทึกสโตรกปรับ</button><button type="button" class="btn" data-act="penClose">ยกเลิก</button></div>
  </div>`;
}

export function holeView([roundId, numStr], ctx) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}<div class="page"><p>ไม่พบรอบนี้</p></div>` };
  const holes = st.holesOf(roundId);
  const num = Number(numStr);
  const hole = holes.find((h) => h.number === num);
  if (!hole) return { html: `${header('ไม่พบหลุม', { back: `#/round/${roundId}/card` })}` };
  const shots = st.shotsOf(hole.id);
  if (!F || F.hole_id !== hole.id) { resetDraft(round, hole); pen = null; }
  if (mode === 'new') F.sequence = shots.length + 1;
  const penalties = st.penaltiesOf(hole.id);
  const sc = holeScore(hole, shots, penalties);
  const bag = st.bagClubs();
  const phrases = st.setting('phrases', []);
  const prevN = num > 1 ? num - 1 : null;
  const nextN = num < holes.length ? num + 1 : null;
  const parOpts = [3, 4, 5, 6].map((p) => ({ v: p, th: String(p) }));
  const logShots = shotLogging(round);
  const group = isGroupRound(round);
  const gpsOn = logShots && st.setting('gps_shots', false);
  const pins = round.course_id ? courseHoles(round.course_id)[num] : null;
  const unit = round.distance_unit === 'yd' ? 'yd' : 'm';
  // ระยะช็อตที่บันทึกถาวรใช้หมุดแท่นทีที่ยืนยันแล้วเท่านั้น (หมุดประมาณอาจผิดตำแหน่ง)
  const path = logShots ? shotPath(shots, confirmedPoint(pins, 'tee'), penalties) : [];
  const gpsDist = new Map(path.filter((x) => x.dist != null).map((x) => [x.shot.id, x.dist]));
  const canLand = !!round.course_id && holeReady(pins);
  const teeShotOf = (seq) => seq === 1 && (hole.par ?? 4) >= 4;
  // จุดตีของช็อตที่กำลังจด: แก้ไข = จากเส้นทางเดิม · ใหม่ = GPS ตอนนี้ (ถ้าเปิด) / แท่นที / จุดที่ลูกช็อตก่อนไปจบ
  function draftStart() {
    const teePt = pins?.tee ?? null;   // แสดงผลอย่างเดียว ใช้หมุดประมาณได้
    const view = shotPath(shots, teePt, penalties);
    if (mode === 'edit') return view.find((x) => x.shot.id === F.id)?.start ?? null;
    if (gpsOn) { const pos = lastPosition(20000); if (pos && pos.accuracy <= GPS_MAX_ACC) return { lat: pos.lat, lon: pos.lon }; }
    if (F.sequence === 1) return teePt;
    const prev = view.filter((x) => x.shot.sequence < F.sequence).at(-1);
    return prev && !prev.penalized ? landOf(prev.shot) : null;
  }
  const landSetup = round.course_id ? `#/map/${encodeURIComponent(round.course_id)}/${num}?r=${encodeURIComponent(roundId)}&edit=1` : null;
  const landBtn = !logShots || !round.course_id ? null
    : { can: canLand, setup: landSetup, text: F.land ? landText(landInfo(draftStart(), F.land, pins?.green, teeShotOf(F.sequence)), unit) : '' };
  // จุดของช็อตอื่นในหลุม (ให้เห็นบริบทบนแผนที่)
  const othersFor = (exceptId) => path.filter((x) => x.shot.id !== exceptId).flatMap((x) => [
    x.start && x.shot.sequence > 1 ? { seq: x.shot.sequence, kind: 's', at: x.start, pen: false } : null,
    landOf(x.shot) ? { seq: x.shot.sequence, kind: 'e', at: landOf(x.shot), pen: x.penalized } : null,
  ]).filter(Boolean);
  // สโตรกปรับอัตโนมัติของช็อตที่ลูกลงน้ำ/OB/หาย/เล่นไม่ได้ · ถ้าผู้ใช้เพิ่มสโตรกปรับของช็อตนี้เองแล้ว ไม่เพิ่มซ้ำ
  // ผลช็อตเปลี่ยนเป็นอย่างอื่น (หรือไม่นับช็อต) → ลบเฉพาะที่แอปเพิ่มให้
  function autoPenaltyOps(shot) {
    const ops = [];
    const linked = st.penaltiesOf(hole.id).filter((p) => p.related_shot_id_optional === shot.id);
    const auto = linked.filter((p) => p.auto);
    const pe = shot.counted === false ? null : PENALTY_ENDS[shot.end_lie];
    if (!pe) {
      for (const p of auto) ops.push({ store: 'penalties', del: p.id });
      return { ops, added: null };
    }
    const r = RELIEFS.find((x) => x.v === relief && pe.reliefs.includes(x.v)) ?? RELIEFS.find((x) => x.v === pe.reliefs[0]);
    const rec = { reason: pe.reason, strokes: r.strokes, relief: r.v, auto: true };
    if (auto.length) {
      ops.push(st.patchOp('penalties', auto[0].id, rec));
      for (const p of auto.slice(1)) ops.push({ store: 'penalties', del: p.id });
    } else if (!linked.length) {
      ops.push({ store: 'penalties', put: { id: st.uid(), hole_id: hole.id, round_id: roundId, related_shot_id_optional: shot.id, note: '', created_at: st.nowIso(), ...rec } });
    } else return { ops, added: null };
    return { ops, added: rec };
  }

  // ไม้แนะนำของช็อตใหม่: ทีออฟพาร์ 4–5 = ไม้ทีออฟที่ใช้บ่อย · ช็อตอื่นใช้ระยะถึงกลางกรีน (GPS หรือแท่นที→กรีน)
  // ใกล้กรีนมาก → พัตเตอร์ · ใกล้กรีน → ชิพ · ไกลกว่านั้น → ไม้ที่ระยะจริงใกล้ที่สุด (ระยะ GPS ก่อน แล้วค่อยระยะเครื่องซ้อม)
  function clubSuggestion(pos) {
    const fmtD = (m) => `${Math.round(toUnit(m, unit))} ${unitTh(unit)}`;
    if (F.sequence === 1 && (hole.par ?? 4) >= 4) {
      const id = usualClub((s, h) => s.sequence === 1 && (h.par ?? 0) >= 4);
      return id ? { club: id, type: 'tee', why: 'ไม้ทีออฟที่คุณใช้บ่อย' } : null;
    }
    const green = pins?.green ?? null;
    let d = null;
    if (pos && green) d = distM(pos, green);
    else if (F.sequence === 1 && pins?.tee && green) d = distM(pins.tee, green);
    else if (F.sequence === 1 && Number(hole.distance) > 0) d = Number(hole.distance) * (hole.distance_unit === 'yd' ? 0.9144 : 1);
    if (d == null) return null;
    if (d <= 15) {
      const putter = bag.find((c) => c.category === 'putter');
      return { club: putter?.id ?? null, type: 'putt', why: `ห่างกลางกรีน ${fmtD(d)}` };
    }
    if (d <= 40) return { club: usualClub((s) => s.shot_type === 'chip' || s.shot_type === 'pitch'), type: 'chip', why: `ห่างกลางกรีน ${fmtD(d)}` };
    const c = suggestClub(d, clubRows());
    const id = c?.club_id ?? c?.clubId ?? null;
    return id && bag.some((x) => x.id === id) ? { club: id, type: F.sequence === 1 ? 'tee' : 'approach', why: `ระยะถึงกรีน ${fmtD(d)}` } : null;
  }
  const pristine = () => !clubTouched && !typeTouched && F.end_lie == null && F.assessment == null && !F.note;
  const freshPos = () => { const p = lastPosition(20000); return p && p.accuracy <= GPS_MAX_ACC ? p : null; };
  // แนะนำใหม่เมื่อยังไม่เคยแนะนำร่างนี้ หรือเดินไปแล้วเกิน 15 ม. (บันทึกช็อตที่แท่นทีแล้วเดินไปที่ลูก)
  const moved = (pos) => !!pos && (!suggestedAt || distM(pos, suggestedAt) > 15);
  if (logShots && mode === 'new' && pristine()) {
    const pos = gpsOn ? freshPos() : null;
    const needsPos = F.sequence !== 1;
    if ((suggestedFor !== F.id && (!needsPos || pos)) || (suggestedFor === F.id && needsPos && moved(pos))) {
      const s = clubSuggestion(pos);
      F.club_id = s?.club ?? null;
      F.shot_type = s?.type ?? draftType;
      hint = s?.club ? s.why : '';
      suggestedFor = F.id;
      suggestedAt = pos ? { lat: pos.lat, lon: pos.lon } : null;
    }
  }

  function pickLand({ seq, start, value, exceptId, onSave }) {
    openLandPicker({ pins, n: num, seq, start, value, others: othersFor(exceptId), unit, teeShot: teeShotOf(seq), onSave });
  }

  const html = `${header(`หลุม ${num} / ${holes.length}`, {
    back: `#/round/${roundId}/card`,
    sub: `<span id="round-course">${esc(round.course_name_snapshot)}</span> · <span id="round-province">${esc(round.province_snapshot)}</span>`,
  })}
  <div class="page">
    <div class="card hole-head">
      <div class="hole-num"><span>หลุม</span><b>${num}</b><small>/ ${holes.length}</small></div>
      <div class="hole-meta">
        <div class="par-pick"><span class="lbl inline">พาร์</span>${chips('par', 'par', parOpts, hole.par, { cls: 'tight inline' })}</div>
        ${round.course_id ? `<a class="mini map-link" href="#/map/${encodeURIComponent(round.course_id)}/${num}?r=${encodeURIComponent(roundId)}">🗺 แผนที่หลุม</a>` : ''}
        ${hole.hc_index || hole.distance ? `<div class="small muted">${[hole.distance ? `${hole.distance} ${hole.distance_unit === 'yd' ? 'หลา' : 'ม.'}${round.tee_name ? ` · แท่น${esc(round.tee_name)}` : ''}` : '', hole.hc_index ? `HC ${hole.hc_index}` : ''].filter(Boolean).join(' · ')}</div>` : ''}
        ${logShots ? `<div class="score-line">ตี <b>${sc.strokes}</b> + ปรับ <b>${sc.penalties}</b> = <b>${sc.total}</b>
          ${sc.par != null && hole.status === 'done' ? `<span class="topar">(${fmtToPar(sc.toPar)})</span>` : ''}
          ${sc.notCounted ? `<span class="muted small">· ไม่นับ ${sc.notCounted} ช็อต</span>` : ''}
          <span class="badge ${hole.status === 'done' ? 'good' : hole.status === 'incomplete' ? 'bad' : 'none'}">${esc(label(HOLE_STATUS, hole.status))}${hole.finish ? ` · ${esc(label(HOLE_FINISH, hole.finish))}` : ''}</span>
        </div>` : ''}
      </div>
    </div>

    ${logShots && hole.status === 'playing' && shots.length && (round.status !== 'playing' || (round.current_hole && round.current_hole !== num)) ? `<div class="card warn pending-hole">
      <b>⚠️ หลุมนี้ยังไม่จบ</b>
      <span class="small">สกอร์ที่จดไว้ <b>${sc.total}</b> ยังไม่นับในสกอร์รวม · ถ้าลืมจดพัตสุดท้าย ให้จดช็อตเพิ่มด้านล่างก่อน</span>
      <div class="row gap wrap">
        <button type="button" class="btn primary" data-act="finish" data-v="holed" data-sure="1" data-back="1">⛳ ลงหลุมแล้ว · ${sc.total}</button>
        <button type="button" class="btn" data-act="finish" data-v="picked_up" data-sure="1" data-back="1">ยกลูก / กิมมี่</button>
      </div>
    </div>` : ''}

    ${group ? groupEntryHtml(round, hole) : ''}

    ${logShots ? `<div class="shots">${shots.length ? shots.map((s) => shotCard(s, mode === 'edit' ? F.id : null, gpsDist.get(s.id) ?? null, unit)).join('') : '<p class="muted center">ยังไม่มีช็อต</p>'}</div>
    ${penaltySection(hole, shots, canLand)}

    ${hole.status === 'playing' && shots.length && mode === 'new' && !shots.some((s) => s.holed) ? `<section class="card putt-quick">
      <div class="row between"><b>⛳ จบหลุมด้วยพัต</b><span class="small muted">เพิ่มพัตและจบหลุมในแตะเดียว</span></div>
      <div class="putt-btns">${[1, 2, 3, 4].map((n) => `<button type="button" class="btn${n === 2 ? ' primary' : ''}" data-act="puttFinish" data-n="${n}">${n} พัต</button>`).join('')}</div>
      <label class="small muted putt-dist">ระยะพัตแรก (ไม่บังคับ)
        <input class="input" type="number" inputmode="decimal" step="any" min="0" placeholder="${unit === 'yd' ? 'หลา' : 'เมตร'}" value="${puttDist ?? ''}" data-input="puttDist"></label>
    </section>` : ''}

    ${shotForm(bag, phrases, gpsOn, landBtn)}

    <section class="card">
      <h3>จบหลุม</h3>
      <div class="row gap wrap">
        ${hole.status === 'playing' ? `
          <button type="button" class="btn" data-act="finish" data-v="holed">ลงหลุมแล้ว</button>
          <button type="button" class="btn" data-act="finish" data-v="picked_up">ยกลูก / กิมมี่</button>
          <button type="button" class="btn" data-act="finish" data-v="incomplete">จดไม่ครบ</button>`
    : '<button type="button" class="btn" data-act="reopen">เปิดหลุมนี้อีกครั้ง</button>'}
      </div>
      <p class="note">ยกลูก/กิมมี่ แยกจากการพัตลงจริง และไม่นับเป็นพัตลงในสถิติ</p>
    </section>
    ` : ''}
    <nav class="hole-bar" aria-label="เปลี่ยนหลุม">
      ${prevN ? `<a class="btn" href="#/round/${roundId}/hole/${prevN}">‹ หลุม ${prevN}</a>` : '<span></span>'}
      <a class="btn mid" href="#/round/${roundId}/card" aria-label="สกอร์การ์ด">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>สกอร์การ์ด</a>
      ${nextN ? `<a class="btn primary" href="#/round/${roundId}/hole/${nextN}">หลุม ${nextN} ›</a>` : `<a class="btn primary" href="#/round/${roundId}/card">จบ ›</a>`}
    </nav>
  </div>`;

  const refresh = () => ctx.rerender();

  const saveHole = (changes) => st.patch('holes', hole.id, changes);

  let stopGps = null;
  return {
    html,
    mount(el) {
      if (!gpsOn) return;
      const state = el.querySelector('#gps-state');
      stopGps = watchPosition((pos) => {
        if (state) state.textContent = pos.accuracy <= GPS_MAX_ACC ? `(±${Math.round(pos.accuracy)} ม.)` : `(ยังไม่แม่น ±${Math.round(pos.accuracy)} ม.)`;
        if (logShots && mode === 'new' && pristine() && pos.accuracy <= GPS_MAX_ACC && (suggestedFor !== F.id || (F.sequence !== 1 && moved(pos)))) refresh();
      }, (err) => { if (state) state.textContent = `(${err.message})`; });
    },
    unmount() { stopGps?.(); },
    actions: {
      gpsShots: async (el) => {
        await st.setSetting('gps_shots', el.checked);
        refresh();
      },
      set: (el) => {
        const { field, v } = el.dataset;
        F[field] = field === 'distance_unit' ? v : (F[field] === v ? null : v);
        if (field === 'club_id') { hint = ''; clubTouched = true; }
        if (field === 'club_id' && !typeTouched) {
          const prev = shots.filter((s) => s.sequence < F.sequence && s.id !== F.id).at(-1) ?? null;
          F.shot_type = suggestShotType({ seq: F.sequence, prev, clubCategory: st.club(F.club_id)?.category, rehit: rehitAfter(hole.id, prev) });
        }
        if (field === 'shot_type') typeTouched = true;
        if (field === 'end_lie') {
          F.holed = F.end_lie === 'holed';
          const pe = PENALTY_ENDS[F.end_lie];
          if (pe) {
            if (!pe.reliefs.includes(relief)) relief = pe.reliefs[0];
            if (F.assessment == null) F.assessment = 'needs_work';   // ลูกโทษคือช็อตที่ต้องปรับเสมอ
          } else relief = null;
        }
        refresh();
      },
      assess: (el) => {
        const v = el.dataset.v || null;
        F.assessment = F.assessment === v ? null : v;
        refresh();
      },
      details: () => { details = !details; refresh(); },
      relief: (el) => { relief = el.dataset.v; refresh(); },
      puttDist: (el) => { const n = Number(el.value); puttDist = el.value.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null; },
      // จบหลุมด้วยพัต N ครั้ง: ช็อตก่อนหน้าที่ยังไม่ระบุจุดจบ = บนกรีน · พัตแรกเก็บ GPS (บอกว่าช็อตก่อนหยุดตรงไหน)
      puttFinish: async (el) => {
        if (saving) return;
        saving = true;
        try {
          const n = Number(el.dataset.n);
          const cur = st.shotsOf(hole.id);
          const holeBefore = { ...st.S.holes.get(hole.id) };
          const last = cur.at(-1);
          const putter = st.bagClubs().find((c) => c.category === 'putter') ?? null;
          const pos = gpsOn ? freshPos() : null;
          const now = st.nowIso();
          const ops = [];
          const lastBefore = last ? { ...last } : null;
          if (last && last.end_lie == null && last.shot_type !== 'putt') ops.push(st.patchOp('shots', last.id, { end_lie: 'green' }));
          const added = [];
          for (let k = 0; k < n; k++) {
            const fin = k === n - 1;
            const s = {
              ...blankShot(round, hole, cur.length + k + 1, null), club_id: putter?.id ?? null, shot_type: 'putt',
              start_lie: 'green', end_lie: fin ? 'holed' : 'green', holed: fin, created_at: now,
              ...(k === 0 && puttDist != null ? { distance_before: puttDist, measurement_method: 'estimated' } : {}),
              ...(k === 0 && pos ? { gps: { lat: pos.lat, lon: pos.lon, acc: Math.round(pos.accuracy), at: now } } : {}),
            };
            added.push(s);
            ops.push({ store: 'shots', put: s });
          }
          ops.push(st.patchOp('holes', hole.id, { status: 'done', finish: 'holed' }));
          ops.push(st.patchOp('rounds', roundId, { current_hole: num }));
          await st.commit(ops);
          const total = holeScore(st.S.holes.get(hole.id), st.shotsOf(hole.id), st.penaltiesOf(hole.id)).total;
          resetDraft(round, st.S.holes.get(hole.id));
          const undo = async () => {
            await st.commit([...added.map((s) => ({ store: 'shots', del: s.id })), { store: 'holes', put: holeBefore }, ...(lastBefore ? [{ store: 'shots', put: lastBefore }] : [])]);
            ctx.go(`#/round/${roundId}/hole/${num}`);
          };
          toast(`หลุม ${num} จบ · ${n} พัต · สกอร์ ${total}`, { label: 'เลิกทำ', run: undo });
          if (nextN) ctx.go(`#/round/${roundId}/hole/${nextN}`);
          else ctx.go(`#/round/${roundId}/card`);
        } finally {
          saving = false;
        }
      },
      // ปักจุดที่ลูกไปจบ: เติมทิศให้ถ้ายังไม่ได้เลือก (ต้องรู้จุดตีจริงและกรีนที่ยืนยันแล้ว)
      land: () => {
        const start = draftStart();
        const draftId = F.id;
        pickLand({
          seq: F.sequence, start, value: F.land, exceptId: F.id,
          onSave: (p) => {
            if (!F || F.id !== draftId) return;
            F.land = p ? { ...p, at: st.nowIso() } : null;
            let msg = p ? 'ปักจุดแล้ว — กดบันทึกช็อตเพื่อเก็บ' : 'ลบจุดแล้ว';
            const green = confirmedPoint(pins, 'green');
            // จุดตีที่เป็นหมุดแท่นทีประมาณ ไม่ใช้เติมข้อมูลที่บันทึกถาวร
            const estTee = start && pins?.tee && !confirmedPoint(pins, 'tee') && start.lat === pins.tee.lat && start.lon === pins.tee.lon;
            if (p && green && start && !estTee && F.direction == null) {
              const side = landInfo(start, p, green, teeShotOf(F.sequence))?.side;
              if (side === 'left' || side === 'right') {
                F.direction = side;
                msg = `ปักจุดแล้ว · ตั้งทิศเป็น${sideTh(side)}ให้ (แก้ได้) — กดบันทึกช็อตเพื่อเก็บ`;
              }
            }
            refresh();
            toast(msg);
          },
        });
      },
      penLand: (el) => {
        const s = st.S.shots.get(el.dataset.shot);
        if (!s) return;
        const x = shotPath(st.shotsOf(hole.id), pins?.tee ?? null, st.penaltiesOf(hole.id)).find((y) => y.shot.id === s.id);
        pickLand({
          seq: s.sequence, start: x?.start ?? null, value: s.land, exceptId: s.id,
          onSave: async (p) => {
            await st.patch('shots', s.id, { land: p ? { ...p, at: st.nowIso() } : null });
            refresh();
            toast(p ? `ปักจุดที่ลูกช็อต ${s.sequence} ไปแล้ว` : 'ลบจุดแล้ว');
          },
        });
      },
      num: (el) => {
        const raw = el.value.trim();
        const n = raw === '' ? null : Number(raw);
        F[el.dataset.field] = Number.isFinite(n) ? n : null;
      },
      text: (el) => { F[el.dataset.field] = el.value; },
      phrase: (el) => {
        const p = el.dataset.v;
        F.note = F.note ? `${F.note} ${p}` : p;
        const ta = document.querySelector('textarea[data-field="note"]');
        if (ta) ta.value = F.note;
      },
      counted: (el) => { F.counted = !el.checked; refresh(); },
      holed: (el) => {
        F.holed = el.checked;
        if (F.holed) F.end_lie = 'holed';
        else if (F.end_lie === 'holed') F.end_lie = null;
        refresh();
      },
      cancel: () => { resetDraft(round, hole); refresh(); },
      edit: (el) => {
        const s = st.S.shots.get(el.dataset.id);
        if (!s) return;
        F = { ...s };
        mode = 'edit';
        typeTouched = true;
        details = true;
        relief = reliefOf(hole.id, s.id);
        refresh();
        document.getElementById('entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      insert: (el) => {
        resetDraft(round, hole, Number(el.dataset.seq));
        refresh();
        document.getElementById('entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      save: async () => {
        if (saving) return;  // กันแตะบันทึกรัว ๆ
        saving = true;
        document.getElementById('save-btn').disabled = true;
        try {
          const shot = { ...F, note: F.note.trim(), raw_distance_text: (F.raw_distance_text || '').trim() };
          if (shot.holed) shot.end_lie = 'holed';
          if (shot.counted !== false) shot.not_counted_reason = '';
          const current = st.shotsOf(hole.id).filter((s) => s.id !== shot.id);
          const ops = [];
          if (mode === 'insert') {
            for (const s of shiftForInsert(current, shot.sequence)) {
              if (s.sequence !== st.S.shots.get(s.id).sequence) ops.push({ store: 'shots', put: s });
            }
          } else if (mode === 'new') {
            shot.sequence = current.length + 1;
          }
          if (!shot.created_at) shot.created_at = st.nowIso();
          let gpsNote = '';
          if (gpsOn && mode !== 'edit') {
            const pos = lastPosition(20000);
            if (pos && pos.accuracy <= GPS_MAX_ACC) {
              shot.gps = { lat: pos.lat, lon: pos.lon, acc: Math.round(pos.accuracy), at: st.nowIso() };
              // เติมระยะถึงกรีนจากหมุดที่ยืนยันแล้วเท่านั้น (หมุดประมาณอาจผิดหลุม จะกลายเป็นข้อมูลผิดถาวร)
              const green = confirmedPoint(pins, 'green');
              if (green && shot.shot_type !== 'putt' && shot.distance_before == null) {
                shot.distance_before = Math.round(toUnit(distM(pos, green), shot.distance_unit === 'yd' ? 'yd' : 'm'));
                shot.measurement_method = shot.measurement_method ?? 'gps';
              }
            } else {
              gpsNote = pos ? ` · GPS ยังไม่แม่น (±${Math.round(pos.accuracy)} ม.) ไม่ได้เก็บตำแหน่ง` : ' · ยังไม่ได้ตำแหน่ง GPS';
            }
          }
          let autoDone = null;
          if (mode === 'new' && !current.length) {
            const prevNum = st.S.rounds.get(roundId)?.current_hole;
            const ph = prevNum && prevNum !== num ? st.holesOf(roundId).find((h) => h.number === prevNum) : null;
            if (ph && ph.status === 'playing' && st.shotsOf(ph.id).length) {
              ops.push(st.patchOp('holes', ph.id, { status: 'done', finish: 'holed' }));
              autoDone = { n: ph.number, total: holeScore(ph, st.shotsOf(ph.id), st.penaltiesOf(ph.id)).total };
            }
          }
          ops.push({ store: 'shots', put: shot });
          const auto = autoPenaltyOps(shot);
          ops.push(...auto.ops);
          let holedMsg = false;
          if (shot.holed && st.S.holes.get(hole.id)?.status === 'playing') {
            ops.push(st.patchOp('holes', hole.id, { status: 'done', finish: 'holed' }));
            holedMsg = true;
          }
          ops.push(st.patchOp('rounds', roundId, { current_hole: num }));
          await st.commit(ops);
          const wasEdit = mode === 'edit';
          if (!wasEdit && shot.sequence === 1 && shot.gps && shot.gps.acc <= 12 && round.course_id) {
            const p = courseHoles(round.course_id)[num];
            const near = !p?.tee || distM(p.tee, shot.gps) <= 80;
            if (p?.src?.tee !== 'mine' && near) {
              await setHolePoint(round.course_id, num, 'tee', { lat: shot.gps.lat, lon: shot.gps.lon, via: 'gps' });
              gpsNote += ' · ปักหมุดแท่นทีจาก GPS แล้ว';
            }
          }
          resetDraft(round, st.S.holes.get(hole.id));
          refresh();
          if (holedMsg && nextN) toast('ลงหลุม — บันทึกในเครื่องแล้ว', { label: `ไปหลุม ${nextN}`, run: () => ctx.go(`#/round/${roundId}/hole/${nextN}`) });
          else if (auto.added) {
            const msg = `บันทึกแล้ว · ${label(LIES, shot.end_lie)} +${auto.added.strokes} สโตรกปรับ${autoDone ? ` · หลุม ${autoDone.n} จบให้อัตโนมัติ (${autoDone.total})` : ''}${gpsNote}`;
            // ลูกที่เดินไปไม่ถึง ชวนปักจุดบนแผนที่ (ปุ่มเดียวกับแถวสโตรกปรับ)
            if (canLand && !landOf(shot)) toast(msg, { label: '📍 ปักจุด', run: () => document.querySelector(`[data-act="penLand"][data-shot="${shot.id}"]`)?.click() });
            else toast(msg);
          } else if (autoDone) {
            toast(`บันทึกแล้ว · หลุม ${autoDone.n} ที่จดไว้จบให้อัตโนมัติ (${autoDone.total})${gpsNote}`, { label: `ดูหลุม ${autoDone.n}`, run: () => ctx.go(`#/round/${roundId}/hole/${autoDone.n}`) });
          } else toast(wasEdit ? 'แก้ไขแล้ว — บันทึกในเครื่องแล้ว' : `บันทึกในเครื่องแล้ว${gpsNote}`);
        } finally {
          saving = false;
        }
      },
      remove: async (el) => {
        const s = st.S.shots.get(el.dataset.id);
        if (!s) return;
        const before = st.shotsOf(hole.id);
        const holeBefore = { ...st.S.holes.get(hole.id) };
        const rest = resequence(before.filter((x) => x.id !== s.id));
        const ops = [{ store: 'shots', del: s.id }, ...rest.map((x) => ({ store: 'shots', put: x }))];
        const pensLinked = st.penaltiesOf(hole.id).filter((p) => p.related_shot_id_optional === s.id);
        for (const p of pensLinked) ops.push(p.auto ? { store: 'penalties', del: p.id } : { store: 'penalties', put: { ...p, related_shot_id_optional: null } });
        if (s.holed && holeBefore.finish === 'holed') ops.push(st.patchOp('holes', hole.id, { status: 'playing', finish: null }));
        await st.commit(ops);
        if (F.id === s.id) resetDraft(round, hole);
        refresh();
        toast(`ลบช็อตที่ ${s.sequence} แล้ว`, {
          label: 'เลิกทำ',
          run: async () => {
            await st.commit([
              ...before.map((x) => ({ store: 'shots', put: x })),
              ...pensLinked.map((p) => ({ store: 'penalties', put: p })),
              { store: 'holes', put: holeBefore },
            ]);
            if (mode === 'new') resetDraft(round, holeBefore);
            refresh();
          },
        });
      },
      par: async (el) => {
        const v = Number(el.dataset.v);
        await saveHole({ par: st.S.holes.get(hole.id)?.par === v ? null : v });
        await rememberCourseCard(round.course_id, st.holesOf(roundId));
        refresh();
      },
      gscore: async (el) => {
        await setGroupScore(round, st.S.holes.get(hole.id), el.dataset.pid, Number(el.dataset.v));
        refresh();
      },
      gmore: async (el) => {
        const raw = prompt('จำนวนสโตรก');
        const n = Math.round(Number(raw));
        if (!raw || !Number.isInteger(n) || n < 1 || n > 30) return;
        await setGroupScore(round, st.S.holes.get(hole.id), el.dataset.pid, n);
        refresh();
      },
      finish: async (el) => {
        const v = el.dataset.v;
        if (v === 'holed' && !el.dataset.sure && !shots.some((s) => s.holed)) {
          if (!confirm('ยังไม่มีช็อตที่ระบุว่าลงหลุม บันทึกว่าจบหลุมแบบลงหลุมหรือไม่?')) return;
        }
        await saveHole(v === 'incomplete'
          ? { status: 'incomplete', finish: null }
          : { status: 'done', finish: v });
        // มาจบหลุมที่ค้างไว้: กลับไปหลุมที่กำลังเล่น หรือสกอร์การ์ดถ้าจบรอบแล้ว
        if (el.dataset.back) {
          const r = st.S.rounds.get(roundId);
          const cur = r?.status === 'playing' ? r.current_hole : null;
          toast(`หลุม ${num} จบแล้ว · นับในสกอร์รวมแล้ว`);
          ctx.go(cur && cur !== num ? `#/round/${roundId}/hole/${cur}` : `#/round/${roundId}/card`);
          return;
        }
        if (nextN) ctx.go(`#/round/${roundId}/hole/${nextN}`);
        else ctx.go(`#/round/${roundId}/card`);
      },
      reopen: async () => { await saveHole({ status: 'playing', finish: null }); refresh(); },
      penOpen: () => { pen = { id: st.uid(), strokes: 1, reason: null, related_shot_id_optional: null, note: '' }; refresh(); },
      penClose: () => { pen = null; refresh(); },
      penSet: (el) => {
        const { field, v } = el.dataset;
        pen[field] = field === 'strokes' ? Number(v) : (pen[field] === v ? null : v);
        refresh();
      },
      penShot: (el) => { pen.related_shot_id_optional = el.value || null; },
      penNote: (el) => { pen.note = el.value; },
      penSave: async (el) => {
        if (el.disabled) return;
        el.disabled = true;
        const saved = { ...pen, hole_id: hole.id, round_id: roundId, note: pen.note.trim(), created_at: st.nowIso() };
        await st.put('penalties', saved);
        pen = null;
        refresh();
        const s = saved.related_shot_id_optional ? st.S.shots.get(saved.related_shot_id_optional) : null;
        if (canLand && s && !landOf(s) && LAND_REASONS.includes(saved.reason)) {
          toast('บันทึกสโตรกปรับแล้ว · ปักจุดที่ลูกไปบนแผนที่ด้วย จะรู้ว่าพลาดเพราะระยะหรือเพราะทิศ', {
            label: '📍 ปักจุด', run: () => document.querySelector(`[data-act="penLand"][data-shot="${s.id}"]`)?.click(),
          });
        } else toast('บันทึกสโตรกปรับแล้ว');
      },
      penDel: async (el) => {
        const p = st.S.penalties.get(el.dataset.id);
        await st.del('penalties', el.dataset.id);
        refresh();
        toast('ลบสโตรกปรับแล้ว', { label: 'เลิกทำ', run: async () => { await st.put('penalties', p); refresh(); } });
      },
    },
  };
}

// ---------- สกอร์การ์ด ----------

export function scorecardView([roundId], ctx) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}<div class="page"><p>ไม่พบรอบนี้</p></div>` };
  const holes = st.holesOf(roundId);
  const total = roundScore(holes, st.shotsOf, st.penaltiesOf);
  const incomplete = holes.filter((h) => h.status !== 'done').length;
  const logShots = shotLogging(round);
  const grid = gridOf(round);
  const games = Array.isArray(round.games) ? round.games : [];
  const myFlags = logShots ? holes.map((h) => {
    const shots = st.shotsOf(h.id);
    const f = [];
    if (h.status === 'incomplete') f.push('จดไม่ครบ');
    if (h.finish === 'picked_up') f.push('ยกลูก');
    const un = shots.filter((s) => s.assessment == null).length;
    if (un) f.push(`ไม่ประเมิน ${un}`);
    return f.length ? `หลุม ${h.number}: ${f.join(', ')}` : null;
  }).filter(Boolean) : [];
  const noPar = holes.filter((h) => h.par == null).length;
  // ระหว่างเล่น: บอกเฉพาะหลุมที่จดแล้วแต่ยังไม่จบ (ไม่นับหลุมที่กำลังเล่น) · จบรอบแล้ว: บอกหลุมที่ยังไม่มีสกอร์ด้วย
  const playing = round.status === 'playing';
  const open = grid.players.map((p) => {
    const o = openHoles(grid, p.id);
    return { p, pending: o.pending.filter((h) => !playing || h.n !== round.current_hole), missing: playing ? [] : o.missing };
  }).filter((x) => x.pending.length || x.missing.length);
  const myPending = open.find((x) => x.p.id === ME)?.pending ?? [];
  const openHtml = open.length ? `<div class="card warn open-holes">
      <b>⚠️ สกอร์รวมยังไม่ครบทุกหลุม</b>
      <p class="small">ตัวเลขจางในตาราง = หลุมที่จดแล้วแต่ยังไม่กดจบหลุม จึงยังไม่นับในรวม · สกอร์รวมที่ยังไม่ครบมีเครื่องหมาย *</p>
      ${open.map((x) => `<div class="open-row"><b>${esc(x.p.name)}</b>
        ${x.pending.length ? `<span class="small">ยังไม่จบ</span>${x.pending.map((h) => `<a class="mini" href="#/round/${roundId}/hole/${h.n}">หลุม ${h.n} · จดไว้ ${h.strokes} ›</a>`).join('')}` : ''}
        ${x.missing.length ? `<span class="small">ยังไม่มีสกอร์ หลุม ${fmtRanges(x.missing)}</span><a class="mini" href="#/round/${roundId}/hole/${x.missing[0]}">ไปกรอก ›</a>` : ''}
      </div>`).join('')}
      ${myPending.length ? `<button type="button" class="btn primary block" data-act="confirmPending">✓ ใช้สกอร์ที่จดไว้ จบหลุม ${fmtRanges(myPending.map((h) => h.n))}</button>` : ''}
    </div>` : '';
  return {
    html: `${header('สกอร์การ์ด', { back: '#/', sub: `${esc(round.course_name_snapshot)} · ${esc(fmtDate(round.played_at))}${round.tee_name ? ` · แท่น ${esc(round.tee_name)}` : ''}` })}
    <div class="page">
      ${logShots && playersOf(round).length === 1 ? `<div class="card totals">
        <div>ตี <b>${total.strokes}</b> + ปรับ <b>${total.penalties}</b> = <b class="big-num">${total.total}</b></div>
        <div class="small muted">เทียบพาร์ ${fmtToPar(total.toPar)} (นับเฉพาะ ${total.holesForPar} หลุมที่จบและมีพาร์)</div>
      </div>` : ''}
      ${round.status !== 'playing' ? `<div><span class="badge ${round.status === 'complete' ? 'good' : 'bad'}">${round.status === 'complete' ? 'จบรอบ' : 'จบรอบ (จดไม่ครบ)'}</span></div>` : ''}
      ${openHtml}
      ${groupTableHtml(round, grid)}
      <p class="note">แตะแถวเพื่อไปหลุมนั้น${noPar ? ` · ยังไม่มีพาร์ ${noPar} หลุม (<a href="#/round/${roundId}/pars">กรอกพาร์/HC</a>)` : ''}</p>
      ${countsTableHtml(grid)}
      <div class="action-grid">
        <a class="btn primary" href="#/round/${roundId}/share">📤 แชร์รูปสกอร์การ์ด</a>
        ${games.length ? `<a class="btn" href="#/round/${roundId}/games">🎲 ผลเกม (${games.length})</a>` : ''}
        <a class="btn" href="#/round/${roundId}/setup">👥 ผู้เล่น / เกม</a>
        <a class="btn" href="#/round/${roundId}/pars">⛳ พาร์ / HC</a>
        ${logShots ? `<a class="btn" href="#/round/${roundId}/summary">📊 สรุปการเล่นของฉัน</a>` : ''}
      </div>
      ${round.status === 'playing' || round.live_token ? liveCardHtml(round) : ''}
      ${myFlags.length ? `<details class="card small"><summary>ข้อมูลรายช็อตของฉันที่ยังไม่ครบ (${myFlags.length})</summary><ul>${myFlags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}
      ${round.status === 'playing' ? `
        <button type="button" class="btn primary block" data-act="finishRound">จบรอบ${incomplete ? ` (${incomplete} หลุมยังไม่จบ)` : ''}</button>`
    : '<button type="button" class="btn block" data-act="reopenRound">กลับไปจดต่อ</button>'}
      <button type="button" class="btn danger block" data-act="deleteRound">ลบรอบนี้</button>
    </div>`,
    actions: {
      ...liveActions(ctx, roundId),
      goHole: (el) => ctx.go(`#/round/${roundId}/hole/${el.dataset.n}`),
      confirmPending: async () => {
        const ids = new Set(myPending.map((h) => h.n));
        const ops = st.holesOf(roundId).filter((h) => ids.has(h.number) && h.status === 'playing')
          .map((h) => st.patchOp('holes', h.id, { status: 'done', finish: 'holed' }));
        if (ops.length) await st.commit(ops);
        toast(`จบหลุม ${fmtRanges([...ids])} ด้วยสกอร์ที่จดไว้แล้ว`);
        ctx.rerender();
      },
      finishRound: async () => {
        // หลุมที่จดแล้วแต่ลืมกดจบ: ถามครั้งเดียวว่าใช้สกอร์ที่จดไว้เลยไหม
        const pend = logShots ? st.holesOf(roundId).filter((h) => h.status === 'playing' && st.shotsOf(h.id).length) : [];
        if (pend.length) {
          const list = pend.map((h) => `หลุม ${h.number} (${holeScore(h, st.shotsOf(h.id), st.penaltiesOf(h.id)).total})`).join(', ');
          if (!confirm(`${list} ยังไม่ได้กดจบหลุม\nใช้สกอร์ที่จดไว้เป็นสกอร์สุดท้ายเลยไหม?\n(ยกเลิก = กลับไปแก้ก่อน)`)) return;
          await st.commit(pend.map((h) => st.patchOp('holes', h.id, { status: 'done', finish: 'holed' })));
        }
        const left = st.holesOf(roundId).filter((h) => h.status !== 'done').length;
        let status = 'complete';
        if (left) {
          if (!confirm(`ยังมี ${left} หลุมที่ไม่ได้จบ จะบันทึกรอบนี้เป็น “จบรอบ (จดไม่ครบ)” ต่อหรือไม่?`)) return;
          status = 'incomplete';
        }
        await st.patch('rounds', roundId, { status, finished_at: st.nowIso() });
        toast('บันทึกการจบรอบแล้ว');
        ctx.rerender();
      },
      reopenRound: async () => {
        await st.patch('rounds', roundId, { status: 'playing' });
        ctx.go(`#/round/${roundId}/hole/${round.current_hole || 1}`);
      },
      deleteRound: async () => {
        await deleteRound(roundId, { after: () => { if (location.hash.includes(roundId)) ctx.go('#/'); else ctx.rerender(); } });
      },
    },
  };
}
