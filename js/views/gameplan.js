// แผนเกมทั้งรอบ: ไม้และจุดเล็งทีออฟทุกหลุมในหน้าเดียว ดูตอนวอร์มอัพก่อนออกรอบ · คิดในเครื่องจากข้อมูลของผู้เล่น
import * as st from '../state.js';
import { esc, header, fmtDate } from '../ui.js';
import { toUnit, unitTh } from '../holemap.js';
import { teePlanFor, missSide, srcTag } from './holeplan.js';
import { clubRows } from './map.js';
import { goalOf } from '../coach.js';

const TH = { left: 'ซ้าย', right: 'ขวา' };

export function gamePlanView([roundId]) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}<div class="page"><p>ไม่พบรอบนี้</p></div>` };
  const unit = round.distance_unit === 'yd' ? 'yd' : 'm';
  const fmt = (m) => `${Math.round(toUnit(m, unit))} ${unitTh(unit)}`;
  const holes = st.holesOf(roundId);
  const pre = { clubs: clubRows(), miss: missSide() };
  const plans = holes.map((h) => ({ h, tp: teePlanFor(round, h, unit, pre) }));
  const have = plans.filter((x) => x.tp);

  // ไม้ทีออฟที่ใช้ทั้งรอบ
  const byClub = new Map();
  for (const { tp } of have) byClub.set(tp.club.label, (byClub.get(tp.club.label) || 0) + 1);
  const clubLine = [...byClub].sort((a, b) => b[1] - a[1]).map(([c, k]) => `${esc(c)} ${k} หลุม`).join(' · ');
  const danger = have.filter((x) => x.tp.notes.length).map((x) => x.h.number);
  // เหตุผลที่ซ้ำหลายหลุม (เช่น ไดรเวอร์ไกลกว่าไม้ 3 นิดเดียว) บอกครั้งเดียวในสรุป
  const whyCount = new Map();
  for (const { tp } of have) if (tp.why) whyCount.set(tp.why, (whyCount.get(tp.why) || 0) + 1);
  const commonWhy = [...whyCount].filter(([w, k]) => k >= 3 && w !== 'ไม้ทีออฟปกติ').sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const miss = pre.miss;
  const goal = goalOf(st.setting('coach_goal', null));
  const scale = holes.length / 18;
  const budget = (k) => { const v = goal.budget[k] * scale; return v < 1 ? 'ไม่เกิน 1' : `ไม่เกิน ${Math.round(v)}`; };

  const row = ({ h, tp }) => {
    const len = tp?.lengthM ?? (Number(h.distance) > 0 ? Number(h.distance) * (h.distance_unit === 'yd' ? 0.9144 : 1) : null);
    return `<a class="gp-hole${tp?.notes.length ? ' warn' : ''}" href="#/round/${encodeURIComponent(roundId)}/hole/${h.number}">
      <span class="gp-n"><b>${h.number}</b><small>พาร์ ${h.par ?? '–'}</small>${len ? `<small>${esc(fmt(len))}</small>` : ''}</span>
      <span class="gp-body">${tp ? `<b>${esc(tp.club.label)} ${srcTag(tp.club)}</b>
        <small>🎯 ${esc(tp.aim)}</small>
        ${tp.why && tp.why !== 'ไม้ทีออฟปกติ' && tp.why !== commonWhy ? `<small class="muted">${esc(tp.why)}</small>` : ''}
        ${tp.notes.map((n) => `<small class="gp-note">⚠️ ${esc(n)}</small>`).join('')}`
    : `<small class="muted">${Number.isInteger(h.par) ? 'ยังไม่มีระยะไม้พอวางแผน' : 'ยังไม่มีพาร์'}</small>`}</span>
    </a>`;
  };

  return {
    html: `${header('แผนเกม', { back: `#/round/${roundId}/card`, sub: `${esc(round.course_name_snapshot)} · ${esc(fmtDate(round.played_at))}${round.tee_name ? ` · แท่น ${esc(round.tee_name)}` : ''}` })}
    <div class="page game-plan">
      ${have.length ? `<section class="card gp-sum">
        <b>🧭 ก่อนออกรอบ</b>
        <div class="tp-row"><span>ทีออฟ</span><b>${clubLine}</b>${commonWhy ? `<small>${esc(commonWhy)}</small>` : ''}</div>
        <div class="tp-row"><span>เล็ง</span><b>${miss ? `ลูกคุณมักไปจบทาง${TH[miss]} → ตั้งทีฝั่ง${TH[miss]} เล็งขอบ${TH[miss === 'left' ? 'right' : 'left']}ของแฟร์เวย์` : 'กลางแฟร์เวย์'}</b>${miss ? '' : '<small>ยังไม่รู้ฝั่งที่พลาดบ่อย · จดทิศของทีออฟที่พลาด แอปจะเรียนรู้เอง</small>'}</div>
        ${danger.length ? `<div class="tp-row"><span>ระวัง</span><b>หลุม ${danger.join(', ')}</b><small>มีน้ำ/จุดอันตรายในระยะ หรือเคยโดนลูกโทษ</small></div>` : ''}
        <div class="tp-row"><span>เป้า</span><b>${esc(goal.th)}: ลูกโทษ${budget('pen')} · 3-พัต${budget('putt')} สโตรก</b><small>หลุมยาก เล่นเพื่อโบกี้ เจอปัญหาออกทางที่ปลอดภัยก่อน</small></div>
      </section>` : `<div class="card warn small">ยังไม่มีระยะไม้ของคุณ จึงยังวางแผนไม้ไม่ได้ · จดช็อตพร้อม GPS ในสนาม หรือ<a href="#/launch">นำเข้าไฟล์จากเครื่องซ้อม</a> แล้วกลับมาดูใหม่</div>`}
      <div class="gp-list">${plans.map(row).join('')}</div>
      <p class="note">ป้าย <b>สนาม</b> = ระยะจริงจาก GPS ตอนออกรอบ · <b>เครื่องซ้อม</b> = ระยะลอยจากการซ้อม (ใช้กับไม้ที่ยังจดในสนามไม่ถึง 3 ช็อต) · แตะหลุมเพื่อไปหน้าจดของหลุมนั้น · ในหน้าหลุม แอปเลือกไม้ตามแผนไว้ให้แล้ว · แผนเปลี่ยนตามระยะไม้ ลูกที่พลาดบ่อย และหมุดจุดอันตรายที่ปักในแผนที่</p>
    </div>`,
  };
}
