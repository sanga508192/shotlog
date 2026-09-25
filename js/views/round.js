import * as st from '../state.js';
import { esc, header, chips, toast, fmtDate } from '../ui.js';
import {
  SHOT_TYPES, ASSESSMENTS, CONTACTS, DIRECTIONS, DISTANCE_RESULTS, TARGET_RESULTS,
  LIES, START_LIES, TARGETS, MEASURE_METHODS, UNITS, PENALTY_REASONS, HOLE_FINISH, HOLE_STATUS, label,
} from '../constants.js';
import { holeScore, roundScore, fmtToPar, suggestShotType, shiftForInsert, resequence } from '../logic.js';

// ---------- สถานะฟอร์มจดช็อต (อยู่ข้ามการ render) ----------

let F = null;        // ร่างช็อต
let mode = 'new';    // new | edit | insert
let typeTouched = false;
let details = false;
let saving = false;
let pen = null;      // ร่างสโตรกปรับ

function blankShot(round, hole, seq, prev) {
  const sug = suggestShotType({ seq, prev, clubCategory: null });
  return {
    id: st.uid(), round_id: round.id, hole_id: hole.id, sequence: seq,
    club_id: null, shot_type: sug, assessment: null,
    contact: null, direction: null, distance_result: null, target_result: null,
    start_lie: seq === 1 ? 'tee' : (prev?.end_lie && prev.end_lie !== 'holed' ? prev.end_lie : null),
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

function shotCard(s, editingId) {
  const c = st.club(s.club_id);
  const { bits, lie, dist } = shotSummary(s);
  return `<div class="shot${s.id === editingId ? ' editing' : ''}${s.counted === false ? ' void' : ''}">
    <button type="button" class="shot-main" data-act="edit" data-id="${s.id}">
      <span class="seq">${s.sequence}</span>
      <span class="shot-body">
        <span><strong>${esc(c?.label ?? 'ไม่ระบุไม้')}</strong> · ${esc(label(SHOT_TYPES, s.shot_type))} ${assessBadge(s.assessment)}
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

function shotForm(bag, phrases) {
  const showSymptoms = F.assessment === 'needs_work' || details;
  const title = mode === 'edit' ? `แก้ไขช็อตที่ ${F.sequence}` : mode === 'insert' ? `แทรกช็อตที่ ${F.sequence}` : `ช็อตที่ ${F.sequence}`;
  const clubOpts = bag.map((c) => ({ v: c.id, th: c.label }));
  return `<section class="card entry" id="entry">
    <div class="row between"><h3>${title}</h3>${mode !== 'new' ? '<button type="button" class="mini" data-act="cancel">ยกเลิก</button>' : ''}</div>
    <div class="lbl">ไม้</div>${chips('set', 'club_id', clubOpts, F.club_id, { cls: 'clubs' })}
    <div class="lbl">ประเภท ${typeTouched ? '' : '<span class="muted small">(ระบบเสนอ แตะเพื่อแก้)</span>'}</div>${chips('set', 'shot_type', SHOT_TYPES, F.shot_type)}
    <div class="lbl">ประเมินช็อต</div>
    <div class="assess">
      ${ASSESSMENTS.map((a) => `<button type="button" class="big-choice ${a.v}${F.assessment === a.v ? ' on' : ''}" data-act="assess" data-v="${a.v}">${a.th}</button>`).join('')}
      <button type="button" class="big-choice none${F.assessment == null ? ' on' : ''}" data-act="assess" data-v="">ยังไม่ประเมิน</button>
    </div>
    ${showSymptoms ? `<div class="symptoms">
      <div class="lbl">การสัมผัสลูก</div>${chips('set', 'contact', CONTACTS, F.contact)}
      <div class="lbl">ทิศทาง</div>${chips('set', 'direction', DIRECTIONS, F.direction)}
      <div class="lbl">ระยะเทียบเป้า</div>${chips('set', 'distance_result', DISTANCE_RESULTS, F.distance_result)}
      <div class="lbl">ผลเทียบเป้าหมาย</div>${chips('set', 'target_result', TARGET_RESULTS, F.target_result)}
    </div>` : ''}
    <button type="button" class="linklike" data-act="details">${details ? '▴ ซ่อนรายละเอียด' : '▾ รายละเอียดเพิ่ม (ระยะ จุดเริ่ม/จบ ข้อความ)'}</button>
    ${details ? `<div class="details">
      <div class="lbl">จุดเริ่มต้น</div>${chips('set', 'start_lie', START_LIES, F.start_lie)}
      <div class="lbl">จุดจบ</div>${chips('set', 'end_lie', LIES, F.end_lie)}
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
    <label class="check"><input type="checkbox" data-change="holed" ${F.holed ? 'checked' : ''}> ลูกลงหลุมจากช็อตนี้</label>
    <button type="button" class="btn primary big block" data-act="save" id="save-btn">${mode === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึกช็อต'}</button>
  </section>`;
}

function penaltySection(hole, shots) {
  const list = st.penaltiesOf(hole.id);
  const rows = list.map((p) => `<div class="pen">
      <span>+${p.strokes} ปรับ · ${esc(label(PENALTY_REASONS, p.reason))}${p.related_shot_id_optional ? ` · หลังช็อต ${shots.find((s) => s.id === p.related_shot_id_optional)?.sequence ?? '?'}` : ''}${p.note ? ` · ${esc(p.note)}` : ''}</span>
      <button type="button" class="mini danger" data-act="penDel" data-id="${p.id}">ลบ</button></div>`).join('');
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

  const html = `${header(`หลุม ${num} / ${holes.length}`, {
    back: `#/round/${roundId}/card`,
    sub: `<span id="round-course">${esc(round.course_name_snapshot)}</span> · <span id="round-province">${esc(round.province_snapshot)}</span>`,
  })}
  <div class="page">
    <div class="card hole-head">
      <div class="row between">
        <div class="par-pick"><span class="lbl inline">พาร์</span>${chips('par', 'par', parOpts, hole.par, { cls: 'tight inline' })}${hole.par == null ? '<span class="muted small">ยังไม่ระบุ</span>' : ''}</div>
        <a class="mini" href="#/round/${roundId}/card">สกอร์การ์ด</a>
      </div>
      <div class="score-line">ตี <b>${sc.strokes}</b> + ปรับ <b>${sc.penalties}</b> = <b>${sc.total}</b>
        ${sc.par != null ? `<span class="topar">(${fmtToPar(sc.toPar)})</span>` : ''}
        ${sc.notCounted ? `<span class="muted small">· ไม่นับ ${sc.notCounted} ช็อต</span>` : ''}
        <span class="badge ${hole.status === 'done' ? 'good' : hole.status === 'incomplete' ? 'bad' : 'none'}">${esc(label(HOLE_STATUS, hole.status))}${hole.finish ? ` · ${esc(label(HOLE_FINISH, hole.finish))}` : ''}</span>
      </div>
    </div>

    <div class="shots">${shots.length ? shots.map((s) => shotCard(s, mode === 'edit' ? F.id : null)).join('') : '<p class="muted center">ยังไม่มีช็อต</p>'}</div>
    ${penaltySection(hole, shots)}

    ${shotForm(bag, phrases)}

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

    <nav class="row between hole-nav">
      ${prevN ? `<a class="btn" href="#/round/${roundId}/hole/${prevN}">‹ หลุม ${prevN}</a>` : '<span></span>'}
      ${nextN ? `<a class="btn primary" href="#/round/${roundId}/hole/${nextN}">หลุม ${nextN} ›</a>` : `<a class="btn primary" href="#/round/${roundId}/card">สกอร์การ์ด ›</a>`}
    </nav>
  </div>`;

  const refresh = () => ctx.rerender();

  async function saveHole(patch) {
    await st.put('holes', { ...hole, ...patch });
  }

  return {
    html,
    actions: {
      set: (el) => {
        const { field, v } = el.dataset;
        F[field] = field === 'distance_unit' ? v : (F[field] === v ? null : v);
        if (field === 'club_id' && !typeTouched) {
          const prev = shots.filter((s) => s.sequence < F.sequence && s.id !== F.id).at(-1) ?? null;
          F.shot_type = suggestShotType({ seq: F.sequence, prev, clubCategory: st.club(F.club_id)?.category });
        }
        if (field === 'shot_type') typeTouched = true;
        if (field === 'end_lie') F.holed = F.end_lie === 'holed';
        refresh();
      },
      assess: (el) => {
        const v = el.dataset.v || null;
        F.assessment = F.assessment === v ? null : v;
        refresh();
      },
      details: () => { details = !details; refresh(); },
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
          ops.push({ store: 'shots', put: shot });
          let holedMsg = false;
          if (shot.holed && hole.status === 'playing') {
            ops.push({ store: 'holes', put: { ...hole, status: 'done', finish: 'holed' } });
            holedMsg = true;
          }
          ops.push({ store: 'rounds', put: { ...round, current_hole: num } });
          await st.commit(ops);
          const wasEdit = mode === 'edit';
          resetDraft(round, st.S.holes.get(hole.id));
          refresh();
          if (holedMsg && nextN) toast('ลงหลุม — บันทึกในเครื่องแล้ว', { label: `ไปหลุม ${nextN}`, run: () => ctx.go(`#/round/${roundId}/hole/${nextN}`) });
          else toast(wasEdit ? 'แก้ไขแล้ว — บันทึกในเครื่องแล้ว' : 'บันทึกในเครื่องแล้ว');
        } finally {
          saving = false;
        }
      },
      remove: async (el) => {
        const s = st.S.shots.get(el.dataset.id);
        if (!s) return;
        const before = st.shotsOf(hole.id);
        const holeBefore = { ...hole };
        const rest = resequence(before.filter((x) => x.id !== s.id));
        const ops = [{ store: 'shots', del: s.id }, ...rest.map((x) => ({ store: 'shots', put: x }))];
        const pensLinked = st.penaltiesOf(hole.id).filter((p) => p.related_shot_id_optional === s.id);
        for (const p of pensLinked) ops.push({ store: 'penalties', put: { ...p, related_shot_id_optional: null } });
        if (s.holed && hole.finish === 'holed') ops.push({ store: 'holes', put: { ...hole, status: 'playing', finish: null } });
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
        await saveHole({ par: hole.par === v ? null : v });
        refresh();
      },
      finish: async (el) => {
        const v = el.dataset.v;
        if (v === 'holed' && !shots.some((s) => s.holed)) {
          if (!confirm('ยังไม่มีช็อตที่ระบุว่าลงหลุม บันทึกว่าจบหลุมแบบลงหลุมหรือไม่?')) return;
        }
        await saveHole(v === 'incomplete'
          ? { status: 'incomplete', finish: null }
          : { status: 'done', finish: v });
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
        await st.put('penalties', { ...pen, hole_id: hole.id, round_id: roundId, note: pen.note.trim(), created_at: st.nowIso() });
        pen = null;
        refresh();
        toast('บันทึกสโตรกปรับแล้ว');
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
  const rows = holes.map((h) => {
    const shots = st.shotsOf(h.id);
    const sc = holeScore(h, shots, st.penaltiesOf(h.id));
    const flags = [];
    if (h.par == null) flags.push('ไม่มีพาร์');
    if (h.status === 'playing') flags.push(shots.length ? 'ยังไม่จบ' : 'ยังไม่เล่น');
    if (h.status === 'incomplete') flags.push('จดไม่ครบ');
    if (h.finish === 'picked_up') flags.push('ยกลูก');
    const un = shots.filter((s) => s.assessment == null).length;
    if (un) flags.push(`ไม่ประเมิน ${un}`);
    return `<tr data-act="goHole" data-n="${h.number}" class="${flags.length ? 'flag' : ''}">
      <td>${h.number}</td><td>${h.par ?? '–'}</td><td>${sc.strokes || ''}</td><td>${sc.penalties || ''}</td>
      <td><b>${sc.started ? sc.total : ''}</b></td><td>${sc.started ? fmtToPar(sc.toPar) : ''}</td>
      <td class="small">${esc(flags.join(' · '))}</td></tr>`;
  }).join('');
  const incomplete = holes.filter((h) => h.status !== 'done').length;
  return {
    html: `${header('สกอร์การ์ด', { back: '#/', sub: `${esc(round.course_name_snapshot)} · ${esc(round.province_snapshot)} · ${esc(fmtDate(round.played_at))}${round.tee_name ? ` · แท่น ${esc(round.tee_name)}` : ''}` })}
    <div class="page">
      <div class="card totals">
        <div>ตี <b>${total.strokes}</b> + ปรับ <b>${total.penalties}</b> = <b class="big-num">${total.total}</b></div>
        <div class="small muted">เทียบพาร์ ${fmtToPar(total.toPar)} (นับเฉพาะ ${total.holesForPar} หลุมที่จบและมีพาร์)</div>
        ${round.status !== 'playing' ? `<div><span class="badge ${round.status === 'complete' ? 'good' : 'bad'}">${round.status === 'complete' ? 'จบรอบ' : 'จบรอบ (จดไม่ครบ)'}</span></div>` : ''}
      </div>
      <div class="table-wrap"><table class="card-table">
        <thead><tr><th>หลุม</th><th>พาร์</th><th>ตี</th><th>ปรับ</th><th>รวม</th><th>+/-</th><th>สถานะ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="note">แตะแถวเพื่อกลับไปแก้ไขหลุมนั้น</p>
      <a class="btn block" href="#/round/${roundId}/summary">📊 สรุปการเล่นรอบนี้</a>
      ${round.status === 'playing' ? `
        <button type="button" class="btn primary block" data-act="finishRound">จบรอบ${incomplete ? ` (${incomplete} หลุมยังไม่จบ)` : ''}</button>`
    : '<button type="button" class="btn block" data-act="reopenRound">กลับไปจดต่อ</button>'}
      <button type="button" class="btn danger block" data-act="deleteRound">ลบรอบนี้</button>
    </div>`,
    actions: {
      goHole: (el) => ctx.go(`#/round/${roundId}/hole/${el.dataset.n}`),
      finishRound: async () => {
        let status = 'complete';
        if (incomplete) {
          if (!confirm(`ยังมี ${incomplete} หลุมที่ไม่ได้จบ จะบันทึกรอบนี้เป็น “จบรอบ (จดไม่ครบ)” ต่อหรือไม่?`)) return;
          status = 'incomplete';
        }
        await st.put('rounds', { ...round, status, finished_at: st.nowIso() });
        toast('บันทึกการจบรอบแล้ว');
        ctx.rerender();
      },
      reopenRound: async () => {
        await st.put('rounds', { ...round, status: 'playing' });
        ctx.go(`#/round/${roundId}/hole/${round.current_hole || 1}`);
      },
      deleteRound: async () => {
        if (!confirm('ลบรอบนี้และช็อตทั้งหมดในรอบ? ถ้ายังไม่ได้ส่งออกไฟล์สำรอง จะกู้คืนไม่ได้')) return;
        const ops = [{ store: 'rounds', del: roundId }];
        for (const h of holes) {
          ops.push({ store: 'holes', del: h.id });
          for (const s of st.shotsOf(h.id)) ops.push({ store: 'shots', del: s.id });
          for (const p of st.penaltiesOf(h.id)) ops.push({ store: 'penalties', del: p.id });
        }
        await st.commit(ops);
        toast('ลบรอบแล้ว');
        ctx.go('#/');
      },
    },
  };
}
