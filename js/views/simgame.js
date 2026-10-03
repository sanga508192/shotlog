// หน้าเกมออกรอบจำลอง: เลือกสนามและ 9 หลุม → ตีตามไม้/เป้าทีละช็อต → ติ๊กช็อตที่ผ่าน → บันทึกผล
import * as st from '../state.js';
import { esc, header, toast, fmtDate } from '../ui.js';
import { courseHoles, distM, toUnit, unitTh, scorecardLength } from '../holemap.js';
import { hazardsAlong } from '../strategy.js';
import { buildGame, passText, DEFAULT_NINE } from '../simgame.js';
import { drillHistory } from '../coach.js';
import { clubRows } from './map.js';
import { missSide } from './holeplan.js';

const DRILL_ID = 'strategy-range-round';
const G = { course: null, nine: 'front', done: new Set() };

// สนามที่เล่นบ่อย (มีระยะครบอย่างน้อย 9 หลุม จากหมุดหรือสกอร์การ์ด)
function courseHolesList(courseId) {
  const sc = st.scorecard(courseId);
  const pins = courseHoles(courseId);
  const n = sc?.par?.length || 18;
  return Array.from({ length: n }, (_, i) => {
    const num = i + 1;
    const p = pins[num];
    const par = sc?.par?.[i] ?? null;
    const scl = scorecardLength(sc, num, null);
    const lengthM = p?.tee && p?.green ? distM(p.tee, p.green) : scl ? scl.value * (scl.unit === 'yd' ? 0.9144 : 1) : null;
    return { n: num, par, lengthM, hazards: hazardsAlong(p) };
  });
}
function playedCourses() {
  const count = new Map();
  for (const r of st.rounds()) if (r.course_id) count.set(r.course_id, (count.get(r.course_id) || 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]).map(([id]) => id)
    .filter((id) => courseHolesList(id).filter((h) => h.par && h.lengthM).length >= 9).slice(0, 5);
}

export function simGameView(_p, ctx) {
  const unit = st.setting('map_unit', 'yd');
  const fmt = (m) => `${Math.round(toUnit(m, unit))} ${unitTh(unit)}`;
  const courses = playedCourses();
  if (G.course !== 'default' && !courses.includes(G.course)) G.course = courses[0] ?? 'default';
  const all = G.course === 'default' ? DEFAULT_NINE : courseHolesList(G.course);
  const nine = G.course === 'default' ? all : G.nine === 'back' ? all.slice(9, 18) : all.slice(0, 9);
  const game = buildGame({ holes: nine, clubs: clubRows(), missSide: missSide(), fmt });
  const total = game.reduce((a, h) => a + h.shots.length, 0);
  const passed = () => G.done.size;
  const hist = drillHistory([...st.S.practice.values()], DRILL_ID, 5);
  const name = (id) => st.course(id)?.display_name_th || st.rounds().find((r) => r.course_id === id)?.course_name_snapshot || id;
  const kindTh = { tee: 'ทีออฟ', layup: 'วางลูก', approach: 'เข้ากรีน' };

  return {
    html: `${header('เกมออกรอบจำลอง', { back: '#/coach', sub: 'ซ้อมแบบออกรอบ: เปลี่ยนไม้และเป้าทุกลูก' })}
    <div class="page sim-game">
      <p class="note">ตีตามลำดับทีละช็อต ทำรูทีนเต็มทุกลูก ไม่ตีซ้ำ แล้วติ๊กช็อตที่ผ่านเกณฑ์ (ดูตัวเลขบนเครื่องซ้อม หรือกะด้วยตาในสนามไดรฟ์) · ลูกสั้นในระยะ 30 หลาซ้อมแยกที่กรีนซ้อม</p>
      <div class="chips">${courses.map((id) => `<button type="button" class="chip${G.course === id ? ' on' : ''}" data-act="course" data-v="${esc(id)}">${esc(name(id))}</button>`).join('')}
        <button type="button" class="chip${G.course === 'default' ? ' on' : ''}" data-act="course" data-v="default">สนามมาตรฐาน</button></div>
      ${G.course !== 'default' && all.length > 9 ? `<div class="chips">${[['front', '9 หลุมแรก'], ['back', '9 หลุมหลัง']].map(([v, th]) => `<button type="button" class="chip${G.nine === v ? ' on' : ''}" data-act="nine" data-v="${v}">${th}</button>`).join('')}</div>` : ''}
      ${!game.length ? `<div class="card warn small">ยังไม่มีระยะไม้ของคุณ จดช็อตพร้อม GPS ในสนาม หรือ<a href="#/launch">นำเข้าไฟล์จากเครื่องซ้อม</a>ก่อน แอปจะเลือกไม้ให้ตามระยะจริง</div>` : ''}
      ${game.map((h) => `<div class="card sg-hole">
        <div class="row between"><b>หลุม ${h.n} · พาร์ ${h.par}</b><span class="small muted">${fmt(h.lengthM)}</span></div>
        ${h.shots.map((s, i) => {
    const k = `${h.n}:${i}`;
    return `<label class="sg-shot"><input type="checkbox" data-change="shot" data-k="${k}" ${G.done.has(k) ? 'checked' : ''}>
          <span><b>${kindTh[s.kind]} ${esc(s.club.label)}${s.target && !s.club.generic ? ` · ${fmt(s.target)}` : ''}</b>เล็ง${esc(s.aim)}<small>ผ่าน: ${esc(passText(s, fmt))}</small></span></label>`;
  }).join('')}
        ${h.note ? `<p class="small muted">⚠️ ${esc(h.note)}</p>` : ''}
      </div>`).join('')}
      ${game.length ? `<div class="card small">${hist.length ? `<b>ผลครั้งก่อน ๆ</b><div class="drill-hist">${hist.map((x) => `<span>${esc(fmtDate(x.date))} <b>${x.successes}/${x.attempts}</b></span>`).join('')}</div>` : ''}
        <p class="note">ทำเกมนี้สัปดาห์ละครั้ง ดูว่าสัดส่วนช็อตที่ผ่านเพิ่มขึ้นไหม · ไม้และเป้าคิดจากระยะไม้จริงและแผนทีออฟของแต่ละหลุม · "ไม้ที่ได้ระยะ…" = ยังไม่มีระยะจริงของไม้ที่ใกล้เคียง เลือกไม้เองตามระยะนั้น</p></div>
      <div class="sg-score"><b id="sg-score">ผ่าน ${passed()}/${total} ช็อต</b><button type="button" class="btn primary" data-act="saveGame">บันทึกผลเกม</button></div>` : ''}
    </div>`,
    actions: {
      course: (el) => { G.course = el.dataset.v; G.done.clear(); ctx.rerender(); },
      nine: (el) => { G.nine = el.dataset.v; G.done.clear(); ctx.rerender(); },
      shot: (el) => {
        if (el.checked) G.done.add(el.dataset.k); else G.done.delete(el.dataset.k);
        const s = document.getElementById('sg-score');
        if (s) s.textContent = `ผ่าน ${passed()}/${total} ช็อต`;
      },
      saveGame: async (el) => {
        if (el.disabled || !total) return;
        el.disabled = true;
        const where = G.course === 'default' ? 'สนามมาตรฐาน' : `${name(G.course)} ${G.nine === 'back' ? '9 หลุมหลัง' : '9 หลุมแรก'}`;
        await st.put('practice', {
          id: st.uid(), date: st.todayLocal(), topic: `เกมออกรอบจำลอง · ${where}`, source_topic_key: null, drill_id: DRILL_ID,
          club_id_optional: null, drill_context: where, target_definition: 'ช็อตผ่านเกณฑ์ระยะและทิศ', attempts: total, successes: passed(), note: '', created_at: st.nowIso(),
        });
        G.done.clear();
        toast('บันทึกผลเกมแล้ว');
        ctx.rerender();
      },
    },
  };
}
