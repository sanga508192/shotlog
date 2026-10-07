// แผนทีออฟของหลุม (แสดงตอนเริ่มหลุมและในแผนที่หลุม) · คิดในเครื่องจากข้อมูลของผู้เล่น
import * as st from '../state.js';
import { esc } from '../ui.js';
import { courseHoles, distM, toUnit, unitTh, courseHoleNo } from '../holemap.js';
import { teePlan, hazardsAlong } from '../strategy.js';
import { clubRows } from './map.js';
import { simData } from './coach.js';

// ทีออฟหลุมนี้ในรอบก่อน ๆ ของสนามเดียวกัน: จำนวน · โดนลูกโทษ · โดนลูกโทษตอนใช้ไดรเวอร์
function holeHistory(courseId, n, exceptRound) {
  const out = { n: 0, pen: 0, penDriver: 0 };
  for (const r of st.rounds()) {
    if (r.course_id !== courseId || r.id === exceptRound || r.shot_logging === false) continue;
    for (const h of st.holesOf(r.id).filter((x) => courseHoleNo(x) === n)) {
      const s1 = st.shotsOf(h.id).find((s) => s.sequence === 1 && s.counted !== false);
      if (!s1) continue;
      out.n++;
      if (st.penaltiesOf(h.id).some((p) => p.related_shot_id_optional === s1.id)) {
        out.pen++;
        if (st.club(s1.club_id)?.category === 'driver') out.penDriver++;
      }
    }
  }
  return out;
}

// ลูกที่พลาดบ่อย: ทิศของทีออฟพาร์ 4–5 ที่จดในสนาม (อย่างน้อย 6 ครั้ง ฝั่งเดียว 60% ขึ้นไป) ไม่งั้นใช้ไดรเวอร์จากเครื่องซ้อม
export function missSide() {
  let l = 0, r = 0;
  for (const rd of st.rounds().filter((x) => x.shot_logging !== false).slice(0, 15)) {
    for (const h of st.holesOf(rd.id)) {
      if ((h.par ?? 0) < 4) continue;
      const s1 = st.shotsOf(h.id).find((s) => s.sequence === 1);
      if (s1?.direction === 'left') l++;
      else if (s1?.direction === 'right') r++;
    }
  }
  if (l + r >= 6 && Math.max(l, r) / (l + r) >= 0.6) return r > l ? 'right' : 'left';
  const sim = simData();
  return sim && !sim.stale ? sim.driver?.side ?? null : null;
}

// pre = { clubs, miss } คิดไว้แล้ว (หน้าแผนทั้งรอบเรียก 18 หลุม ไม่ต้องคิดระยะไม้ใหม่ทุกหลุม) · คืนระยะหลุม lengthM ด้วย
export function teePlanFor(round, hole, unit = 'yd', pre = {}) {
  if (!Number.isInteger(hole.par)) return null;
  const pins = round.course_id ? courseHoles(round.course_id)[courseHoleNo(hole)] : null;
  const lengthM = pins?.tee && pins?.green ? distM(pins.tee, pins.green)
    : Number(hole.distance) > 0 ? Number(hole.distance) * (hole.distance_unit === 'yd' ? 0.9144 : 1) : null;
  const fmt = (m) => `${Math.round(toUnit(m, unit))} ${unitTh(unit)}`;
  const tp = teePlan({
    par: hole.par, lengthM, hazards: hazardsAlong(pins), history: round.course_id ? holeHistory(round.course_id, courseHoleNo(hole), round.id) : null,
    clubs: pre.clubs ?? clubRows(), missSide: 'miss' in pre ? pre.miss : missSide(), fmt,
  });
  return tp ? { ...tp, lengthM } : null;
}

export const planClubId = (tp) => tp?.club?.club_id ?? tp?.club?.clubId ?? null;

// ที่มาของระยะไม้: GPS ในสนาม (ระยะรวมที่ลูกไปหยุด) หรือเครื่องซ้อม (ระยะลอย) · ไม่มีข้อมูลจริง = ไม่มีป้าย
export const srcOf = (row) => (!row || row.generic ? null : row.src === 'sim' ? 'sim' : 'gps');
export const SRC_TH = { gps: 'สนาม', sim: 'เครื่องซ้อม' };
export const SRC_HINT = { gps: 'ระยะจริงจาก GPS ตอนออกรอบ', sim: 'ระยะลอยจากเครื่องซ้อม' };
export function srcTag(row) {
  const s = srcOf(row);
  return s ? `<span class="src-tag ${s}" title="${SRC_HINT[s]}">${SRC_TH[s]}</span>` : '';
}

export function teePlanHtml(tp, unit = 'yd', roundId = null) {
  if (!tp) return '';
  const fmt = (m) => `${Math.round(toUnit(m, unit))} ${unitTh(unit)}`;
  return `<section class="card tee-plan">
    <b>🧭 แผนทีออฟหลุมนี้</b>
    <div class="tp-row"><span>ไม้</span><b>${esc(tp.club.label)} ${srcTag(tp.club)}</b>${tp.why ? `<small>${esc(tp.why)}</small>` : ''}</div>
    ${tp.used?.length ? `<div class="tp-row"><span>ระยะ</span><b class="tp-used">${tp.used.map((r) => `${esc(r.label)} ${esc(fmt(r.median))} ${srcTag(r)}`).join(' · ')}</b>
      <small>สนาม = ระยะจริงจาก GPS ตอนออกรอบ · เครื่องซ้อม = ระยะลอยจากการซ้อม (ไม้ที่ยังจดในสนามไม่ถึง 3 ช็อต)</small></div>` : ''}
    <div class="tp-row"><span>เล็ง</span><b>${esc(tp.aim)}</b></div>
    ${tp.remain != null ? `<div class="tp-row"><span>ต่อไป</span><b>เหลือถึงกรีนราว ${esc(fmt(tp.remain))}</b></div>` : ''}
    ${tp.notes.length ? `<ul class="find">${tp.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <p class="note">คิดจากระยะไม้จริง ลูกที่คุณพลาดบ่อย จุดอันตรายที่ปักในแผนที่ และประวัติหลุมนี้ · เลือกไม้ตามแผนให้แล้วในช่องจดด้านล่าง${roundId ? ` · <a href="#/round/${encodeURIComponent(roundId)}/plan">ดูแผนทั้งรอบ ›</a>` : ''}</p>
  </section>`;
}
