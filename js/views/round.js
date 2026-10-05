// หน้าหลุม: จดรายช็อต ลูกโทษ จบหลุม (ร่างช็อตอยู่ใน shotdraft.js ส่วนแสดงผลอยู่ใน shotform.js)
import * as st from '../state.js';
import { esc, header, chips, toast } from '../ui.js';
import { LIES, HOLE_FINISH, HOLE_STATUS, label, PENALTY_ENDS, RELIEFS } from '../constants.js';
import { holeScore, fmtToPar, suggestShotType, shiftForInsert, resequence } from '../logic.js';
import { groupEntryHtml, setGroupScore, isGroupRound, shotLogging, rememberCourseCard } from './group.js';
import { watchPosition, lastPosition } from '../geo.js';
import { courseHoles, distM, toUnit, unitTh, confirmedPoint, holeReady, setHolePoint } from '../holemap.js';
import { GPS_MAX_ACC, suggestClub } from '../coach.js';
import { clubRows } from './map.js';
import { shotPath, landOf } from '../shotgeo.js';
import { openLandPicker, landInfo, landText, sideTh } from './landpick.js';
import { teePlanFor, teePlanHtml, planClubId } from './holeplan.js';
import { d, blankShot, resetDraft, reliefOf, rehitAfter, usualClub } from './shotdraft.js';
import { shotCard, shotForm, penaltySection, puttCard, quickPad, holeDoneHtml, LAND_REASONS } from './shotform.js';

export { scorecardView } from './scorecard.js';

export function holeView([roundId, numStr], ctx) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}<div class="page"><p>ไม่พบรอบนี้</p></div>` };
  const holes = st.holesOf(roundId);
  const num = Number(numStr);
  const hole = holes.find((h) => h.number === num);
  if (!hole) return { html: `${header('ไม่พบหลุม', { back: `#/round/${roundId}/card` })}` };
  const shots = st.shotsOf(hole.id);
  if (!d.F || d.F.hole_id !== hole.id) { resetDraft(round, hole); d.pen = null; }
  if (d.mode === 'new') d.F.sequence = shots.length + 1;
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
  // แผนทีออฟ: แสดงตอนเริ่มหลุม (ยังไม่มีช็อต)
  const tp = shots.length === 0 && hole.status === 'playing' ? teePlanFor(round, hole, unit) : null;
  // ระยะช็อตที่บันทึกถาวรใช้หมุดแท่นทีที่ยืนยันแล้วเท่านั้น (หมุดประมาณอาจผิดตำแหน่ง)
  const path = logShots ? shotPath(shots, confirmedPoint(pins, 'tee'), penalties) : [];
  const gpsDist = new Map(path.filter((x) => x.dist != null).map((x) => [x.shot.id, x.dist]));
  const canLand = !!round.course_id && holeReady(pins);
  const teeShotOf = (seq) => seq === 1 && (hole.par ?? 4) >= 4;
  // จุดตีของช็อตที่กำลังจด: แก้ไข = จากเส้นทางเดิม · ใหม่ = GPS ตอนนี้ (ถ้าเปิด) / แท่นที / จุดที่ลูกช็อตก่อนไปจบ
  function draftStart() {
    const teePt = pins?.tee ?? null;   // แสดงผลอย่างเดียว ใช้หมุดประมาณได้
    const view = shotPath(shots, teePt, penalties);
    if (d.mode === 'edit') return view.find((x) => x.shot.id === d.F.id)?.start ?? null;
    if (gpsOn) { const pos = lastPosition(20000); if (pos && pos.accuracy <= GPS_MAX_ACC) return { lat: pos.lat, lon: pos.lon }; }
    if (d.F.sequence === 1) return teePt;
    const prev = view.filter((x) => x.shot.sequence < d.F.sequence).at(-1);
    return prev && !prev.penalized ? landOf(prev.shot) : null;
  }
  const landSetup = round.course_id ? `#/map/${encodeURIComponent(round.course_id)}/${num}?r=${encodeURIComponent(roundId)}&edit=1` : null;
  const landBtn = !logShots || !round.course_id ? null
    : { can: canLand, setup: landSetup, text: d.F.land ? landText(landInfo(draftStart(), d.F.land, pins?.green, teeShotOf(d.F.sequence)), unit) : '' };
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
    const r = RELIEFS.find((x) => x.v === d.relief && pe.reliefs.includes(x.v)) ?? RELIEFS.find((x) => x.v === pe.reliefs[0]);
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
    const planned = planClubId(tp);
    if (d.F.sequence === 1 && planned && bag.some((c) => c.id === planned)) return { club: planned, type: 'tee', why: 'ตามแผนทีออฟหลุมนี้' };
    if (d.F.sequence === 1 && (hole.par ?? 4) >= 4) {
      const id = usualClub((s, h) => s.sequence === 1 && (h.par ?? 0) >= 4);
      return id ? { club: id, type: 'tee', why: 'ไม้ทีออฟที่คุณใช้บ่อย' } : null;
    }
    const green = pins?.green ?? null;
    let dist = null;
    if (pos && green) dist = distM(pos, green);
    else if (d.F.sequence === 1 && pins?.tee && green) dist = distM(pins.tee, green);
    else if (d.F.sequence === 1 && Number(hole.distance) > 0) dist = Number(hole.distance) * (hole.distance_unit === 'yd' ? 0.9144 : 1);
    if (dist == null) return null;
    if (dist <= 15) {
      const putter = bag.find((c) => c.category === 'putter');
      return { club: putter?.id ?? null, type: 'putt', why: `ห่างกลางกรีน ${fmtD(dist)}` };
    }
    if (dist <= 40) return { club: usualClub((s) => s.shot_type === 'chip' || s.shot_type === 'pitch'), type: 'chip', why: `ห่างกลางกรีน ${fmtD(dist)}` };
    const c = suggestClub(dist, clubRows());
    const id = c?.club_id ?? c?.clubId ?? null;
    return id && bag.some((x) => x.id === id) ? { club: id, type: d.F.sequence === 1 ? 'tee' : 'approach', why: `ระยะถึงกรีน ${fmtD(dist)}` } : null;
  }
  const pristine = () => !d.clubTouched && !d.typeTouched && d.F.end_lie == null && d.F.assessment == null && !d.F.note;
  const freshPos = () => { const p = lastPosition(20000); return p && p.accuracy <= GPS_MAX_ACC ? p : null; };
  // แนะนำใหม่เมื่อยังไม่เคยแนะนำร่างนี้ หรือเดินไปแล้วเกิน 15 ม. (บันทึกช็อตที่แท่นทีแล้วเดินไปที่ลูก)
  const moved = (pos) => !!pos && (!d.suggestedAt || distM(pos, d.suggestedAt) > 15);
  if (logShots && d.mode === 'new' && pristine()) {
    const pos = gpsOn ? freshPos() : null;
    const needsPos = d.F.sequence !== 1;
    if ((d.suggestedFor !== d.F.id && (!needsPos || pos)) || (d.suggestedFor === d.F.id && needsPos && moved(pos))) {
      const s = clubSuggestion(pos);
      d.F.club_id = s?.club ?? (d.F.shot_type === 'putt' ? d.F.club_id : null);   // ไม่มีคำแนะนำ: พัตยังใช้พัตเตอร์เดิม
      d.F.shot_type = s?.type ?? d.draftType;
      d.hint = s?.club ? s.why : '';
      d.suggestedFor = d.F.id;
      d.suggestedAt = pos ? { lat: pos.lat, lon: pos.lon } : null;
    }
  }

  function pickLand({ seq, start, value, exceptId, onSave }) {
    openLandPicker({ pins, n: num, seq, start, value, others: othersFor(exceptId), unit, teeShot: teeShotOf(seq), onSave });
  }

  // จดเร็ว (ค่าเริ่มต้น) สำหรับช็อตใหม่ · แก้/แทรกช็อตใช้แบบละเอียดเสมอ
  const quick = logShots && d.mode === 'new' && st.setting('shot_form', 'quick') !== 'full';
  const lastShot = shots.at(-1);
  const onGreen = !!lastShot && !lastShot.holed && (lastShot.shot_type === 'putt' || ['green', 'fringe'].includes(lastShot.end_lie));
  const next = nextN ? { href: `#/round/${roundId}/hole/${nextN}`, th: `ไปหลุม ${nextN}` } : { href: `#/round/${roundId}/card`, th: 'ดูสกอร์การ์ด' };
  let entryHtml = '';
  if (quick) {
    entryHtml = hole.status === 'done' ? holeDoneHtml(num, sc, next)
      : `${onGreen ? puttCard(unit) : ''}${quickPad(bag, shots, gpsOn)}`;
  } else if (logShots) {
    entryHtml = `${hole.status === 'playing' && shots.length && d.mode === 'new' && !shots.some((s) => s.holed) ? puttCard(unit) : ''}${shotForm(bag, phrases, gpsOn, landBtn)}`;
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

    ${teePlanHtml(tp, unit)}

    ${group && !logShots ? groupEntryHtml(round, hole) : ''}

    ${logShots ? `${entryHtml}
    ${shots.length ? '<div class="lbl">ช็อตในหลุมนี้ <span class="muted small">แตะเพื่อแก้</span></div>' : ''}
    <div class="shots">${shots.map((s) => shotCard(s, d.mode === 'edit' ? d.F.id : null, gpsDist.get(s.id) ?? null, unit)).join('')}</div>
    ${penaltySection(hole, shots, canLand)}
    ${group ? groupEntryHtml(round, hole) : ''}

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

  // บันทึกช็อตในร่าง · quick = มาจากปุ่มผลช็อตของแบบจดเร็ว (บอกผลสั้น ๆ พร้อมเลิกทำ)
  async function saveShot(quick = false) {
    if (d.saving) return;  // กันแตะบันทึกรัว ๆ
    d.saving = true;
    const btn = document.getElementById('save-btn');
    if (btn) btn.disabled = true;
    try {
      const shot = { ...d.F, note: d.F.note.trim(), raw_distance_text: (d.F.raw_distance_text || '').trim() };
      if (shot.holed) shot.end_lie = 'holed';
      if (shot.counted !== false) shot.not_counted_reason = '';
      const current = st.shotsOf(hole.id).filter((s) => s.id !== shot.id);
      const ops = [];
      if (d.mode === 'insert') {
        for (const s of shiftForInsert(current, shot.sequence)) {
          if (s.sequence !== st.S.shots.get(s.id).sequence) ops.push({ store: 'shots', put: s });
        }
      } else if (d.mode === 'new') {
        shot.sequence = current.length + 1;
      }
      if (!shot.created_at) shot.created_at = st.nowIso();
      let gpsNote = '';
      if (gpsOn && d.mode !== 'edit') {
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
      const holeBefore = { ...st.S.holes.get(hole.id) };
      let prevBefore = null;
      if (d.mode === 'new' && !current.length) {
        const prevNum = st.S.rounds.get(roundId)?.current_hole;
        const ph = prevNum && prevNum !== num ? st.holesOf(roundId).find((h) => h.number === prevNum) : null;
        if (ph && ph.status === 'playing' && st.shotsOf(ph.id).length) {
          prevBefore = { ...ph };
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
      const wasEdit = d.mode === 'edit';
      const wasNew = d.mode === 'new';
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
      // จดเร็ว: บอกสั้น ๆ ว่าบันทึกอะไรไป และเลิกทำได้ทันทีถ้าแตะผิด
      if (quick && wasNew) {
        const club = st.club(shot.club_id)?.label;
        const bits = [`ช็อต ${shot.sequence}${club ? ` ${club}` : ''} → ${label(LIES, shot.end_lie)}`];
        if (auto.added) bits.push(`+${auto.added.strokes} สโตรกปรับ (${RELIEFS.find((r) => r.v === auto.added.relief)?.th ?? ''})`);
        if (holedMsg) bits.push(`จบหลุม สกอร์ ${holeScore(st.S.holes.get(hole.id), st.shotsOf(hole.id), st.penaltiesOf(hole.id)).total}`);
        if (autoDone) bits.push(`หลุม ${autoDone.n} จบให้อัตโนมัติ (${autoDone.total})`);
        const newPens = auto.ops.filter((o) => o.put).map((o) => o.put.id);   // ช็อตใหม่ = สโตรกปรับที่เพิ่งสร้างทั้งหมด
        toast(`${bits.join(' · ')}${gpsNote}`, {
          label: 'เลิกทำ',
          run: async () => {
            await st.commit([{ store: 'shots', del: shot.id }, ...newPens.map((id) => ({ store: 'penalties', del: id })),
              { store: 'holes', put: holeBefore }, ...(prevBefore ? [{ store: 'holes', put: prevBefore }] : [])]);
            resetDraft(round, holeBefore);
            ctx.go(`#/round/${roundId}/hole/${num}`);
          },
        });
        return;
      }
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
      d.saving = false;
    }
  }

  let stopGps = null;
  return {
    html,
    mount(el) {
      if (!gpsOn) return;
      const state = el.querySelector('#gps-state');
      stopGps = watchPosition((pos) => {
        if (state) state.textContent = pos.accuracy <= GPS_MAX_ACC ? `(±${Math.round(pos.accuracy)} ม.)` : `(ยังไม่แม่น ±${Math.round(pos.accuracy)} ม.)`;
        if (logShots && d.mode === 'new' && pristine() && pos.accuracy <= GPS_MAX_ACC && (d.suggestedFor !== d.F.id || (d.F.sequence !== 1 && moved(pos)))) refresh();
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
        // ไม้: แตะไม้ที่เลือกอยู่ (เช่น ไม้ที่แนะนำ) = ยืนยัน ไม่ใช่ยกเลิก · ช่องอื่นแตะซ้ำเพื่อยกเลิก
        d.F[field] = field === 'distance_unit' || field === 'club_id' ? v : (d.F[field] === v ? null : v);
        if (field === 'club_id') { d.hint = ''; d.clubTouched = true; }
        if (field === 'club_id' && !d.typeTouched) {
          const prev = shots.filter((s) => s.sequence < d.F.sequence && s.id !== d.F.id).at(-1) ?? null;
          d.F.shot_type = suggestShotType({ seq: d.F.sequence, prev, clubCategory: st.club(d.F.club_id)?.category, rehit: rehitAfter(hole.id, prev) });
        }
        if (field === 'shot_type') d.typeTouched = true;
        if (field === 'end_lie') {
          d.F.holed = d.F.end_lie === 'holed';
          const pe = PENALTY_ENDS[d.F.end_lie];
          if (pe) {
            if (!pe.reliefs.includes(d.relief)) d.relief = pe.reliefs[0];
            if (d.F.assessment == null) d.F.assessment = 'needs_work';   // ลูกโทษคือช็อตที่ต้องปรับเสมอ
          } else d.relief = null;
        }
        refresh();
      },
      assess: (el) => {
        const v = el.dataset.v || null;
        d.F.assessment = d.F.assessment === v ? null : v;
        refresh();
      },
      details: () => { d.details = !d.details; refresh(); },
      relief: (el) => { d.relief = el.dataset.v; refresh(); },
      puttPick: (el) => { const v = Number(el.dataset.v); d.puttDist = d.puttDist === v ? null : v; refresh(); },
      noteOpen: () => { d.noteOpen = true; refresh(); document.querySelector('textarea[data-field="note"]')?.focus(); },
      // จบหลุมด้วยพัต N ครั้ง: ช็อตก่อนหน้าที่ยังไม่ระบุจุดจบ = บนกรีน · พัตแรกเก็บ GPS (บอกว่าช็อตก่อนหยุดตรงไหน)
      puttFinish: async (el) => {
        if (d.saving) return;
        d.saving = true;
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
              ...(k === 0 && d.puttDist != null ? { distance_before: d.puttDist, measurement_method: 'estimated' } : {}),
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
          d.saving = false;
        }
      },
      // ปักจุดที่ลูกไปจบ: เติมทิศให้ถ้ายังไม่ได้เลือก (ต้องรู้จุดตีจริงและกรีนที่ยืนยันแล้ว)
      land: () => {
        const start = draftStart();
        const draftId = d.F.id;
        pickLand({
          seq: d.F.sequence, start, value: d.F.land, exceptId: d.F.id,
          onSave: (p) => {
            if (!d.F || d.F.id !== draftId) return;
            d.F.land = p ? { ...p, at: st.nowIso() } : null;
            let msg = p ? 'ปักจุดแล้ว — กดบันทึกช็อตเพื่อเก็บ' : 'ลบจุดแล้ว';
            const green = confirmedPoint(pins, 'green');
            // จุดตีที่เป็นหมุดแท่นทีประมาณ ไม่ใช้เติมข้อมูลที่บันทึกถาวร
            const estTee = start && pins?.tee && !confirmedPoint(pins, 'tee') && start.lat === pins.tee.lat && start.lon === pins.tee.lon;
            if (p && green && start && !estTee && d.F.direction == null) {
              const side = landInfo(start, p, green, teeShotOf(d.F.sequence))?.side;
              if (side === 'left' || side === 'right') {
                d.F.direction = side;
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
        d.F[el.dataset.field] = Number.isFinite(n) ? n : null;
      },
      text: (el) => { d.F[el.dataset.field] = el.value; },
      phrase: (el) => {
        const p = el.dataset.v;
        d.F.note = d.F.note ? `${d.F.note} ${p}` : p;
        const ta = document.querySelector('textarea[data-field="note"]');
        if (ta) ta.value = d.F.note;
      },
      counted: (el) => { d.F.counted = !el.checked; refresh(); },
      holed: (el) => {
        d.F.holed = el.checked;
        if (d.F.holed) d.F.end_lie = 'holed';
        else if (d.F.end_lie === 'holed') d.F.end_lie = null;
        refresh();
      },
      cancel: () => { resetDraft(round, hole); refresh(); },
      edit: (el) => {
        const s = st.S.shots.get(el.dataset.id);
        if (!s) return;
        d.F = { ...s };
        d.mode = 'edit';
        d.typeTouched = true;
        d.details = true;
        d.relief = reliefOf(hole.id, s.id);
        refresh();
        document.getElementById('entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      insert: (el) => {
        resetDraft(round, hole, Number(el.dataset.seq));
        refresh();
        document.getElementById('entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      save: () => saveShot(),
      // จดเร็ว: แตะผลช็อต = บันทึกเลย · ลงน้ำ/OB/หาย ใช้วิธีตีต่อที่พบบ่อยที่สุด (แก้ได้ที่ช็อตนั้น)
      qout: async (el) => {
        if (d.saving) return;
        const v = el.dataset.v;
        d.F.end_lie = v;
        d.F.holed = v === 'holed';
        const pe = PENALTY_ENDS[v];
        if (pe) {
          if (!pe.reliefs.includes(d.relief)) d.relief = pe.reliefs[0];
          if (d.F.assessment == null) d.F.assessment = 'needs_work';
        } else d.relief = null;
        await saveShot(true);
      },
      qtype: (el) => {
        d.F.shot_type = el.value;
        d.typeTouched = true;
        if (el.value === 'putt' && !d.clubTouched) d.F.club_id = bag.find((c) => c.category === 'putter')?.id ?? d.F.club_id;
        refresh();
      },
      qassess: async (el) => {
        const s = st.S.shots.get(el.dataset.id);
        if (!s) return;
        await st.patch('shots', s.id, { assessment: el.dataset.v });
        refresh();
        toast(`ช็อต ${s.sequence}: ${el.dataset.v === 'good' ? 'ดี' : 'ต้องปรับ'}`);
      },
      qdir: async (el) => {
        const s = st.S.shots.get(el.dataset.id);
        if (!s) return;
        await st.patch('shots', s.id, { direction: el.dataset.v });
        refresh();
        toast(`ช็อต ${s.sequence}: ไป${el.dataset.v === 'left' ? 'ซ้าย' : 'ขวา'}`);
      },
      fullForm: async () => { await st.setSetting('shot_form', 'full'); refresh(); },
      quickForm: async () => { await st.setSetting('shot_form', 'quick'); refresh(); },
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
        if (d.F.id === s.id) resetDraft(round, hole);
        refresh();
        toast(`ลบช็อตที่ ${s.sequence} แล้ว`, {
          label: 'เลิกทำ',
          run: async () => {
            await st.commit([
              ...before.map((x) => ({ store: 'shots', put: x })),
              ...pensLinked.map((p) => ({ store: 'penalties', put: p })),
              { store: 'holes', put: holeBefore },
            ]);
            if (d.mode === 'new') resetDraft(round, holeBefore);
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
      penOpen: () => { d.pen = { id: st.uid(), strokes: 1, reason: null, related_shot_id_optional: null, note: '' }; refresh(); },
      penClose: () => { d.pen = null; refresh(); },
      penSet: (el) => {
        const { field, v } = el.dataset;
        d.pen[field] = field === 'strokes' ? Number(v) : (d.pen[field] === v ? null : v);
        refresh();
      },
      penShot: (el) => { d.pen.related_shot_id_optional = el.value || null; },
      penNote: (el) => { d.pen.note = el.value; },
      penSave: async (el) => {
        if (el.disabled) return;
        el.disabled = true;
        const saved = { ...d.pen, hole_id: hole.id, round_id: roundId, note: d.pen.note.trim(), created_at: st.nowIso() };
        await st.put('penalties', saved);
        d.pen = null;
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
