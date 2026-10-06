// ส่วนแสดงผลของหน้าจดช็อต: การ์ดช็อต ฟอร์มจดช็อต ปุ่มผลช็อต ปุ่มปักจุด และสโตรกปรับ
import * as st from '../state.js';
import { esc, chips } from '../ui.js';
import {
  SHOT_TYPES, ASSESSMENTS, CONTACTS, DIRECTIONS, DISTANCE_RESULTS, TARGET_RESULTS,
  LIES, START_LIES, TARGETS, MEASURE_METHODS, UNITS, PENALTY_REASONS, label,
  OUTCOMES, PUTT_OUTCOMES, PENALTY_ENDS, RELIEFS,
} from '../constants.js';
import { toUnit, unitTh } from '../holemap.js';
import { landOf } from '../shotgeo.js';
import { d } from './shotdraft.js';

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
  return '';   // ไม่ประเมินก็ได้ ไม่ต้องแสดงป้ายให้รก
}

export function shotCard(s, editingId, gpsM = null, unit = 'm') {
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
  const v = d.F[field];
  return `<input class="input" type="number" inputmode="decimal" step="any" min="0" placeholder="${ph}" value="${v ?? ''}" data-input="num" data-field="${field}">`;
}

// land = { can, text } ปุ่มปักจุดที่ลูกไปจบ (null = สนามนี้ยังไม่มีแผนที่)
const LAND_WHAT = { water: 'ลงน้ำ', ob: 'ออก OB', lost: 'น่าจะหาย', unplayable: 'ไปหยุด', trees: 'เข้าป่า' };
export function landButton(land) {
  if (!land || d.F.shot_type === 'putt') return '';
  const what = LAND_WHAT[d.F.end_lie];
  if (!land.can) return `<a class="btn block land-btn" href="${land.setup}">📍 วางหมุดแท่นทีและกรีนหลุมนี้ก่อน เพื่อปักจุดที่ลูกไปจบ</a>`;
  if (d.F.land) return `<button type="button" class="btn block land-btn on" data-act="land">📍 จุดที่ลูกไปจบ: ${esc(land.text || 'ปักแล้ว')} <small>แตะเพื่อแก้</small></button>`;
  if (what) return `<button type="button" class="btn block land-btn suggest" data-act="land">📍 ปักจุดที่ลูก${what} <small>แนะนำ · แตะบนแผนที่ แอปจะรู้ระยะและทิศจริง</small></button>`;
  return '<button type="button" class="btn block land-btn" data-act="land">📍 ปักจุดที่ลูกไปจบ <small>ไม่บังคับ · แตะบนแผนที่ หรือใช้ GPS ตรงที่ยืน</small></button>';
}

// ลูกไปจบที่ไหน (แตะครั้งเดียว) · ไปทางไหน · ลงน้ำ/OB/หาย: ตีต่อแบบไหน แล้วบันทึกสโตรกปรับให้เอง
function outcomeHtml() {
  const putt = d.F.shot_type === 'putt';
  const opts = putt ? OUTCOMES.filter((o) => PUTT_OUTCOMES.includes(o.v)) : OUTCOMES;
  const pe = PENALTY_ENDS[d.F.end_lie];
  const rOpts = pe ? RELIEFS.filter((r) => pe.reliefs.includes(r.v)) : [];
  const cur = rOpts.find((r) => r.v === d.relief) ?? rOpts[0];
  return `<div class="lbl">ลูกไปจบที่ไหน</div>${chips('set', 'end_lie', opts, d.F.end_lie, { cls: 'outcomes' })}
    ${showDirHere() ? `<div class="lbl">ไปทางไหน</div>${chips('set', 'direction', DIRECTIONS, d.F.direction)}` : ''}
    ${pe ? `<div class="pen-auto">
      <div class="lbl">ตีต่อจาก</div>${chips('relief', 'relief', rOpts.map((r) => ({ v: r.v, th: `${r.th} +${r.strokes}` })), cur.v)}
      <p class="note">บันทึกสโตรกปรับ +${cur.strokes} (${esc(label(PENALTY_REASONS, pe.reason))}) ให้เองตอนกดบันทึกช็อต</p>
    </div>` : ''}`;
}
const showDirHere = () => d.F.shot_type !== 'putt' && !!d.F.end_lie && !['green', 'holed', 'fairway'].includes(d.F.end_lie);

export function shotForm(bag, phrases, gpsOn = false, land = null) {
  const showSymptoms = d.F.assessment === 'needs_work' || d.details;
  const title = d.mode === 'edit' ? `แก้ไขช็อตที่ ${d.F.sequence}` : d.mode === 'insert' ? `แทรกช็อตที่ ${d.F.sequence}` : `ช็อตที่ ${d.F.sequence}`;
  const clubOpts = bag.map((c) => ({ v: c.id, th: c.label }));
  return `<section class="card entry" id="entry">
    <div class="row between"><h3>${title}</h3>${d.mode !== 'new' ? '<button type="button" class="mini" data-act="cancel">ยกเลิก</button>' : '<button type="button" class="linklike" data-act="quickForm">‹ จดแบบเร็ว</button>'}</div>
    ${d.mode !== 'edit' ? `<label class="check gps-toggle"><input type="checkbox" data-change="gpsShots" ${gpsOn ? 'checked' : ''}> 📍 จับตำแหน่ง GPS ตอนบันทึก <span class="small muted" id="gps-state"></span></label>
    ${gpsOn ? '<p class="note">กดบันทึกขณะยืนที่จุดตี (ก่อนเดินไปลูกถัดไป)</p>' : ''}` : ''}
    <div class="lbl">ไม้${d.hint && d.F.club_id ? ` <span class="muted small">(แนะนำ: ${esc(d.hint)} · แตะเพื่อเปลี่ยน)</span>` : ''}</div>${chips('set', 'club_id', clubOpts, d.F.club_id, { cls: 'clubs' })}
    <div class="lbl">ประเภท ${d.typeTouched ? '' : '<span class="muted small">(ระบบเสนอ แตะเพื่อแก้)</span>'}</div>${chips('set', 'shot_type', SHOT_TYPES, d.F.shot_type)}
    ${outcomeHtml()}
    ${landButton(land)}
    <div class="lbl">ประเมินช็อต <span class="muted small">(ไม่บังคับ · แตะซ้ำเพื่อยกเลิก)</span></div>
    <div class="assess">
      ${ASSESSMENTS.map((a) => `<button type="button" class="big-choice ${a.v}${d.F.assessment === a.v ? ' on' : ''}" data-act="assess" data-v="${a.v}" aria-pressed="${d.F.assessment === a.v}">${a.th}</button>`).join('')}
    </div>
    ${showSymptoms ? `<div class="symptoms">
      <div class="lbl">การสัมผัสลูก</div>${chips('set', 'contact', CONTACTS, d.F.contact)}
      ${showDirHere() ? '' : `<div class="lbl">ทิศทาง</div>${chips('set', 'direction', DIRECTIONS, d.F.direction)}`}
      <div class="lbl">ระยะเทียบเป้า</div>${chips('set', 'distance_result', DISTANCE_RESULTS, d.F.distance_result)}
      <div class="lbl">ผลเทียบเป้าหมาย</div>${chips('set', 'target_result', TARGET_RESULTS, d.F.target_result)}
    </div>` : ''}
    <button type="button" class="linklike" data-act="details">${d.details ? '▴ ซ่อนรายละเอียด' : '▾ รายละเอียดเพิ่ม (จุดที่ตี ระยะ ข้อความ)'}</button>
    ${d.details ? `<div class="details">
      <div class="lbl">ตีจากตรงไหน</div>${chips('set', 'start_lie', START_LIES, d.F.start_lie)}
      <div class="lbl">ระยะก่อน → หลังตี</div>
      <div class="row gap">${numInput('distance_before', 'ก่อนตี')}${numInput('distance_after', 'เหลือหลังตี')}</div>
      ${chips('set', 'distance_unit', UNITS, d.F.distance_unit)}
      <div class="lbl">วิธีได้ระยะ</div>${chips('set', 'measurement_method', MEASURE_METHODS, d.F.measurement_method)}
      <label class="lbl">คำบอกระยะ (เก็บตามที่พิมพ์ ไม่แปลงหน่วย)<input class="input" value="${esc(d.F.raw_distance_text)}" placeholder="เช่น 2 คันธง" data-input="text" data-field="raw_distance_text"></label>
      <div class="lbl">เป้าหมายของช็อต</div>${chips('set', 'target', TARGETS, d.F.target)}
      ${d.F.target === 'custom' ? `<input class="input" value="${esc(d.F.target_text)}" placeholder="ระบุเป้าหมาย" data-input="text" data-field="target_text">` : ''}
      <label class="check"><input type="checkbox" data-change="counted" ${d.F.counted === false ? 'checked' : ''}> ไม่นับในสกอร์ (เช่น ลูกสำรองที่ไม่ได้ใช้)</label>
      ${d.F.counted === false ? `<input class="input" value="${esc(d.F.not_counted_reason)}" placeholder="เหตุผลที่ไม่นับ" data-input="text" data-field="not_counted_reason">` : ''}
    </div>` : ''}
    ${d.noteOpen || d.F.note ? `<div class="lbl">หมายเหตุ</div>
    <div class="chips phrases">${phrases.map((p) => `<button type="button" class="chip ghost" data-act="phrase" data-v="${esc(p)}">＋${esc(p)}</button>`).join('')}</div>
    <textarea class="input" rows="2" data-input="text" data-field="note" placeholder="คำที่ใช้จริง เช่น ลูกออกขวาเยอะ">${esc(d.F.note)}</textarea>`
    : '<button type="button" class="linklike" data-act="noteOpen">＋ หมายเหตุ</button>'}
    <div class="save-bar"><button type="button" class="btn primary big block" data-act="save" id="save-btn">${d.mode === 'edit' ? 'บันทึกการแก้ไข' : `บันทึกช็อตที่ ${d.F.sequence}`}</button></div>
  </section>`;
}

// ---------- จดเร็ว: ไม้ (แนะนำไว้ให้) → ทิศ (ถ้าไม่ตรง) → แตะว่าลูกไปจบที่ไหน = บันทึกทันที ----------
// เรียงผลที่เกิดบ่อยของช็อตแต่ละแบบไว้ก่อน
const QUICK_ORDER = {
  tee: ['fairway', 'rough', 'trees', 'bunker', 'green', 'fringe', 'water', 'ob', 'lost', 'unplayable', 'holed'],
  approach: ['green', 'fringe', 'bunker', 'rough', 'fairway', 'trees', 'water', 'ob', 'lost', 'unplayable', 'holed'],
  short: ['green', 'holed', 'fringe', 'bunker', 'rough', 'fairway', 'trees', 'water', 'ob', 'lost', 'unplayable'],
  putt: ['holed', 'green', 'fringe'],
};
const QUICK_DIRS = [{ v: 'left', th: '← ซ้าย' }, { v: 'on_line', th: 'ตรง' }, { v: 'right', th: 'ขวา →' }];
const MISS_ENDS = new Set(['rough', 'trees', 'bunker', 'water', 'ob', 'lost', 'unplayable']);
const kindOf = (t) => (t === 'putt' ? 'putt' : t === 'tee' || t === 'recovery' ? 'tee' : t === 'approach' ? 'approach' : 'short');

export function quickPad(bag, shots, gpsOn = false) {
  const putt = d.F.shot_type === 'putt';
  const opts = QUICK_ORDER[kindOf(d.F.shot_type)].map((v) => OUTCOMES.find((o) => o.v === v)).filter(Boolean);
  const last = shots.at(-1);
  const lastClub = last ? st.club(last.club_id)?.label : null;
  // ถามต่อเรื่องช็อตที่เพิ่งตี (ไม่บังคับ ไม่ถามพัต): พลาดแต่ยังไม่บอกทิศ → ซ้ายหรือขวา · ยังไม่ประเมิน → ดีไหม
  const live = last && last.counted !== false && last.shot_type !== 'putt';
  const askDir = live && last.direction == null && MISS_ENDS.has(last.end_lie);
  const askGood = live && last.assessment == null;
  // เดินไปถึงลูกแล้วปักจุดด้วย GPS (ไม่บังคับ) · ลูกที่ลงหลุมไม่ต้อง
  const askLand = live && !landOf(last) && last.end_lie !== 'holed';
  const ask = askDir || askGood || askLand ? `<div class="qp-last">
      <span class="small">ช็อต ${last.sequence}${lastClub ? ` ${esc(lastClub)}` : ''} → ${esc(label(LIES, last.end_lie) || 'ไม่ระบุ')}</span>
      ${askLand ? `<button type="button" class="mini qp-land" data-act="qland" data-id="${last.id}">📍 ถึงลูกแล้ว · ปักจุดที่ยืน</button>` : ''}
      ${askDir ? `<span class="row gap">${[['left', '← ซ้าย'], ['right', 'ขวา →']].map(([v, th]) => `<button type="button" class="mini" data-act="qdir" data-id="${last.id}" data-v="${v}">${th}</button>`).join('')}</span>` : ''}
      ${askGood ? `<span class="row gap"><button type="button" class="mini" data-act="qassess" data-id="${last.id}" data-v="good">👍 ดี</button><button type="button" class="mini" data-act="qassess" data-id="${last.id}" data-v="needs_work">👎 ต้องปรับ</button></span>` : ''}
    </div>` : '';
  const clubName = st.club(d.F.club_id)?.label;
  return `<section class="card entry quick" id="entry">
    ${ask}
    <div class="row between qp-head"><h3>ช็อตที่ ${d.F.sequence}</h3>
      <select class="input qp-type" data-change="qtype" aria-label="ประเภทช็อต">${SHOT_TYPES.map((t) => `<option value="${t.v}"${t.v === d.F.shot_type ? ' selected' : ''}>${esc(t.th)}</option>`).join('')}</select></div>
    ${d.hint && clubName ? `<p class="small muted qp-hint">แนะนำ ${esc(clubName)} · ${esc(d.hint)}</p>` : ''}
    ${chips('set', 'club_id', bag.map((c) => ({ v: c.id, th: c.label })), d.F.club_id, { cls: 'clubs qp-clubs' })}
    ${putt ? '' : `<div class="lbl">ทิศ <span class="muted small">(ถ้าไม่ตรง)</span></div>${chips('set', 'direction', QUICK_DIRS, d.F.direction, { cls: 'qp-dir' })}`}
    <div class="lbl">ลูกไปจบที่ไหน <span class="muted small">แตะแล้วบันทึกเลย</span></div>
    <div class="qp-out">${opts.map((o) => `<button type="button" class="qp-btn${PENALTY_ENDS[o.v] ? ' pen' : ''}${o.v === 'holed' ? ' holed' : ''}${o.v === 'fairway' || o.v === 'green' ? ' good' : ''}" data-act="qout" data-v="${o.v}">${esc(o.th)}${PENALTY_ENDS[o.v] ? ' <small>+1</small>' : ''}</button>`).join('')}</div>
    <div class="row between qp-foot">
      <label class="check small"><input type="checkbox" data-change="gpsShots" ${gpsOn ? 'checked' : ''}> 📍 GPS <span class="muted" id="gps-state"></span></label>
      <button type="button" class="linklike" data-act="fullForm">จดแบบละเอียด ›</button>
    </div>
  </section>`;
}

// หลุมจบแล้ว (แบบจดเร็ว): สกอร์ + ปุ่มไปหลุมถัดไป
export function holeDoneHtml(num, sc, next, ext = null) {
  const toPar = sc.par != null && sc.toPar != null ? ` (${sc.toPar === 0 ? 'พาร์' : `${sc.toPar > 0 ? '+' : ''}${sc.toPar}`})` : '';
  return `<section class="card hole-done">
    <b>⛳ หลุม ${num} จบแล้ว · สกอร์ ${sc.total}${toPar}</b>
    <a class="btn primary big block" href="${next.href}">${esc(next.th)} ›</a>
    ${ext ? `<button type="button" class="btn block extend-btn" data-act="extend"><b>🔁 ${esc(ext.th)}</b><small>${esc(ext.sub)}</small></button>` : ''}
    <p class="note">จดผิด แตะช็อตด้านล่างเพื่อแก้ · จดเพิ่ม กด “เปิดหลุมนี้อีกครั้ง” ท้ายหน้า</p>
  </section>`;
}

export const LAND_REASONS = ['ob_lost', 'penalty_area', 'unplayable'];

export function penaltySection(hole, shots, canLand = false) {
  const list = st.penaltiesOf(hole.id);
  const rows = list.map((p) => {
    const s = shots.find((x) => x.id === p.related_shot_id_optional);
    const ask = canLand && s && !landOf(s) && LAND_REASONS.includes(p.reason);
    return `<div class="pen">
      <span>+${p.strokes} ปรับ · ${esc(label(PENALTY_REASONS, p.reason))}${p.related_shot_id_optional ? ` · หลังช็อต ${s?.sequence ?? '?'}${s && landOf(s) ? ' 📌' : ''}` : ''}${p.relief ? ` · ${esc(RELIEFS.find((r) => r.v === p.relief)?.th ?? '')}` : ''}${p.note ? ` · ${esc(p.note)}` : ''}${p.auto ? ' <small class="muted">(จากผลช็อต)</small>' : ''}</span>
      <span class="row gap">${ask ? `<button type="button" class="mini" data-act="penLand" data-shot="${s.id}">📍 ปักจุดที่ลูกไป</button>` : ''}<button type="button" class="mini danger" data-act="penDel" data-id="${p.id}">ลบ</button></span></div>`;
  }).join('');
  if (!d.pen) return `${rows}<button type="button" class="btn block" data-act="penOpen">＋ สโตรกปรับ</button>`;
  return `${rows}<div class="card">
    <h3>เพิ่มสโตรกปรับ</h3>
    <div class="lbl">จำนวน</div>${chips('penSet', 'strokes', [{ v: 1, th: '1' }, { v: 2, th: '2' }], d.pen.strokes)}
    <div class="lbl">เหตุ</div>${chips('penSet', 'reason', PENALTY_REASONS, d.pen.reason)}
    <label class="lbl">เกี่ยวกับช็อต (ไม่บังคับ)
      <select class="input" data-change="penShot"><option value="">ไม่ระบุ</option>
        ${shots.map((s) => `<option value="${s.id}"${s.id === d.pen.related_shot_id_optional ? ' selected' : ''}>ช็อต ${s.sequence}</option>`).join('')}
      </select></label>
    <input class="input" placeholder="หมายเหตุ" value="${esc(d.pen.note)}" data-input="penNote">
    <div class="row gap"><button type="button" class="btn primary" data-act="penSave">บันทึกสโตรกปรับ</button><button type="button" class="btn" data-act="penClose">ยกเลิก</button></div>
  </div>`;
}

// จบหลุมด้วยพัต: เลือกระยะพัตแรก (ไม่บังคับ แต่ทำให้คิด Strokes Gained ได้) แล้วกดจำนวนพัต
const PUTT_DISTS = [1, 2, 3, 5, 8, 12, 20];
export function puttCard(unit) {
  const u = unit === 'yd' ? 'หลา' : 'ม.';
  return `<section class="card putt-quick">
    <div class="row between"><b>⛳ จบหลุมด้วยพัต</b><span class="small muted">เพิ่มพัตและจบหลุมในแตะเดียว</span></div>
    <div class="lbl">ระยะพัตแรก <span class="muted small">(ไม่บังคับ · ใส่แล้วแอปคิด Strokes Gained ได้)</span></div>
    <div class="chips tight putt-dists">${PUTT_DISTS.map((v) => `<button type="button" class="chip${d.puttDist === v ? ' on' : ''}" data-act="puttPick" data-v="${v}" aria-pressed="${d.puttDist === v}">${v === 20 ? '20+' : v} ${u}</button>`).join('')}</div>
    <div class="putt-btns">${[1, 2, 3, 4].map((n) => `<button type="button" class="btn${n === 2 ? ' primary' : ''}" data-act="puttFinish" data-n="${n}">${n} พัต</button>`).join('')}</div>
  </section>`;
}
