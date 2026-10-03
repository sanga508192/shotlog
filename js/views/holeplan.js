// แผนทีออฟของหลุม (แสดงตอนเริ่มหลุมและในแผนที่หลุม) · คิดในเครื่องจากข้อมูลของผู้เล่น
import * as st from '../state.js';
import { esc } from '../ui.js';
import { courseHoles, distM, toUnit, unitTh } from '../holemap.js';
import { teePlan, hazardsAlong } from '../strategy.js';
import { clubRows } from './map.js';
import { simData } from './coach.js';

// ทีออฟหลุมนี้ในรอบก่อน ๆ ของสนามเดียวกัน: จำนวน · โดนลูกโทษ · โดนลูกโทษตอนใช้ไดรเวอร์
function holeHistory(courseId, n, exceptRound) {
  const out = { n: 0, pen: 0, penDriver: 0 };
  for (const r of st.rounds()) {
    if (r.course_id !== courseId || r.id === exceptRound || r.shot_logging === false) continue;
    const h = st.holesOf(r.id).find((x) => x.number === n);
    const s1 = h ? st.shotsOf(h.id).find((s) => s.sequence === 1 && s.counted !== false) : null;
    if (!s1) continue;
    out.n++;
    if (st.penaltiesOf(h.id).some((p) => p.related_shot_id_optional === s1.id)) {
      out.pen++;
      if (st.club(s1.club_id)?.category === 'driver') out.penDriver++;
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

export function teePlanFor(round, hole, unit = 'yd') {
  if (!Number.isInteger(hole.par)) return null;
  const pins = round.course_id ? courseHoles(round.course_id)[hole.number] : null;
  const lengthM = pins?.tee && pins?.green ? distM(pins.tee, pins.green)
    : Number(hole.distance) > 0 ? Number(hole.distance) * (hole.distance_unit === 'yd' ? 0.9144 : 1) : null;
  const fmt = (m) => `${Math.round(toUnit(m, unit))} ${unitTh(unit)}`;
  return teePlan({
    par: hole.par, lengthM, hazards: hazardsAlong(pins), history: round.course_id ? holeHistory(round.course_id, hole.number, round.id) : null,
    clubs: clubRows(), missSide: missSide(), fmt,
  });
}

export const planClubId = (tp) => tp?.club?.club_id ?? tp?.club?.clubId ?? null;

export function teePlanHtml(tp, unit = 'yd') {
  if (!tp) return '';
  const fmt = (m) => `${Math.round(toUnit(m, unit))} ${unitTh(unit)}`;
  return `<section class="card tee-plan">
    <b>🧭 แผนทีออฟหลุมนี้</b>
    <div class="tp-row"><span>ไม้</span><b>${esc(tp.club.label)}</b>${tp.why ? `<small>${esc(tp.why)}</small>` : ''}</div>
    <div class="tp-row"><span>เล็ง</span><b>${esc(tp.aim)}</b></div>
    ${tp.remain != null ? `<div class="tp-row"><span>ต่อไป</span><b>เหลือถึงกรีนราว ${esc(fmt(tp.remain))}</b></div>` : ''}
    ${tp.notes.length ? `<ul class="find">${tp.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <p class="note">คิดจากระยะไม้จริง ลูกที่คุณพลาดบ่อย จุดอันตรายที่ปักในแผนที่ และประวัติหลุมนี้ · เลือกไม้ตามแผนให้แล้วในฟอร์มด้านล่าง</p>
  </section>`;
}
