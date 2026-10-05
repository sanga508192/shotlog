// หน้าสรุปหลังจบรอบ: เทียบรอบนี้กับค่าเฉลี่ยของตัวเองและเป้า แล้วบอกว่าสัปดาห์นี้ซ้อมอะไร
import * as st from '../state.js';
import { esc, header, fmtDate } from '../ui.js';
import { goalOf, drill, fmtSigned } from '../coach.js';
import { roundRecap, MIN_HOLES } from '../recap.js';
import { teePlanFor, planClubId, missSide } from './holeplan.js';
import { clubRows } from './map.js';

const f1 = (x) => (x == null ? '–' : Number.isInteger(x) ? String(x) : x.toFixed(1));
// ดีขึ้น/แย่ลงเทียบค่าเฉลี่ย (lowBetter = ยิ่งน้อยยิ่งดี)
function vsAvg(now, avg, lowBetter = true, tol = 0.5, fmt = f1) {
  if (avg == null) return '';
  const d = now - avg;
  if (Math.abs(d) < tol) return '<small class="muted">เท่าค่าเฉลี่ย</small>';
  const good = lowBetter ? d < 0 : d > 0;
  return `<small class="${good ? 'up' : 'down'}">${good ? '▲ ดีกว่า' : '▼ แย่กว่า'}ค่าเฉลี่ย ${fmt(Math.abs(d))}</small>`;
}
const pct = (x) => `${Math.round(x)}%`;
const strokes = (x) => `${f1(Math.round(x * 10) / 10)} สโตรก`;

export function recapView([roundId]) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}<div class="page"><p>ไม่พบรอบนี้</p></div>` };
  const goal = goalOf(st.setting('coach_goal', null));
  const unit = round.distance_unit === 'yd' ? 'yd' : 'm';
  const pre = { clubs: clubRows(), miss: missSide() };
  const r = roundRecap({
    round, rounds: st.rounds(), holesOf: st.holesOf, shotsOf: st.shotsOf, penaltiesOf: st.penaltiesOf, goal,
    planOf: (h) => planClubId(teePlanFor(round, h, unit, pre)),
  });
  const head = header('สรุปหลังรอบ', { back: `#/round/${roundId}/card`, sub: `${esc(round.course_name_snapshot)} · ${esc(fmtDate(round.played_at))}` });
  if (!r.enough) {
    return {
      html: `${head}<div class="page"><div class="card warn">ข้อมูลรายช็อตยังไม่พอสรุป: จดครบและจบหลุมแล้ว ${r.n} หลุม (ต้องอย่างน้อย ${MIN_HOLES} หลุมที่มีพาร์)
        <div class="row gap"><a class="btn" href="#/round/${roundId}/card">กลับสกอร์การ์ด</a></div></div></div>`,
    };
  }

  const scoreTxt = `${r.over > 0 ? '+' : ''}${r.over === 0 ? 'อีเวนพาร์' : r.over}`;
  const leakRow = (l) => {
    const bad = l.now - l.target >= 0.5;
    return `<tr class="${bad ? 'bad' : ''}"><td>${l.icon} ${esc(l.th)}</td><td><b>${f1(l.now)}</b></td><td>${f1(l.avg)}</td><td>${f1(l.target)}</td></tr>`;
  };
  const s = r.stats;
  const t = r.tee;
  const firTxt = (g) => (g.firOf ? `แฟร์เวย์ ${g.fir}/${g.firOf}` : '');
  const teeHtml = t.planned >= 3 ? `<h2>ทีออฟตามแผน</h2>
    <div class="card recap-tee">
      <div class="tp-row"><span>ตามแผน</span><b>${t.follow.n} หลุม</b><small>${[t.follow.pen ? `ลูกโทษ ${t.follow.pen}` : 'ไม่มีลูกโทษ', firTxt(t.follow), t.follow.n ? `เฉลี่ย ${fmtSigned(t.follow.over / t.follow.n)}` : ''].filter(Boolean).join(' · ')}</small></div>
      <div class="tp-row"><span>ไม่ตามแผน</span><b>${t.other.n} หลุม</b><small>${[t.other.pen ? `ลูกโทษ ${t.other.pen}` : 'ไม่มีลูกโทษ', firTxt(t.other), t.other.n ? `เฉลี่ย ${fmtSigned(t.other.over / t.other.n)}` : ''].filter(Boolean).join(' · ')}</small></div>
      <p class="note">แผนคิดจากข้อมูลตอนนี้ (ระยะไม้ ฝั่งที่พลาดบ่อย หมุดจุดอันตราย) · ${t.other.pen > t.follow.pen ? 'หลุมที่ไม่ทำตามแผนเสียลูกโทษมากกว่า ลองยึดแผนในรอบหน้า' : t.follow.n >= t.other.n ? 'ทำตามแผนได้ดี' : 'รอบหน้าลองทำตามแผนให้มากขึ้น แล้วเทียบผลกัน'}</p>
    </div>` : '';
  const drills = (r.practice?.drills ?? []).map(drill).filter(Boolean);

  return {
    html: `${head}
    <div class="page recap">
      <section class="card recap-score">
        <div><span class="small muted">${r.n} หลุมที่ข้อมูลครบ</span><b class="big-num">${scoreTxt}</b></div>
        <div>${r.avgOver != null ? vsAvg(r.over, r.avgOver, true, 1, strokes) : '<small class="muted">ยังไม่มีรอบก่อนหน้าพอเทียบ</small>'}
          <small class="muted">เป้า ${esc(goal.th)}</small></div>
      </section>

      ${r.worst || r.best ? `<section class="card recap-key">
        ${r.worst ? `<p>🔻 <b>เสียมากสุด: ${esc(r.worst.th)}</b> ${f1(r.worst.now)} สโตรก (งบเป้า ${f1(r.worst.target)}${r.worst.avg != null ? ` · ปกติคุณ ${f1(r.worst.avg)}` : ''})</p>` : '<p>✅ <b>ทุกเรื่องอยู่ในงบของเป้า</b></p>'}
        ${r.best ? `<p>🔺 <b>ดีขึ้น: ${esc(r.best.th)}</b> ${f1(r.best.now)} สโตรก (ปกติคุณ ${f1(r.best.avg)})</p>` : ''}
      </section>` : ''}

      <h2>สโตรกที่เสียไปอยู่ตรงไหน</h2>
      <div class="table-wrap"><table class="card-table recap-table">
        <thead><tr><th></th><th>รอบนี้</th><th>ปกติคุณ</th><th>งบเป้า</th></tr></thead>
        <tbody>${r.leaks.map(leakRow).join('')}
          <tr class="save"><td>✨ ได้คืน</td><td><b>${f1(r.save.now)}</b></td><td>${f1(r.save.avg)}</td><td></td></tr></tbody>
      </table></div>
      <p class="note">ปกติคุณ = ค่าเฉลี่ย ${r.hasBase ? `${r.baseRounds} รอบก่อนหน้า` : '(ยังไม่มีรอบก่อนหน้าพอ)'} ปรับเป็น ${r.n} หลุมเท่ารอบนี้ · งบเป้า = จำนวนที่ยอมเสียได้ถ้าจะทำสกอร์${esc(goal.th)}</p>

      <div class="recap-stats">
        <div><span>แฟร์เวย์</span><b>${s.fir.of ? `${s.fir.hit}/${s.fir.of}` : '–'}</b>${s.fir.of && s.fir.avgPct != null ? vsAvg((s.fir.hit / s.fir.of) * 100, s.fir.avgPct * 100, false, 5, pct) : ''}</div>
        <div><span>ออนกรีน</span><b>${s.gir.now}</b>${vsAvg(s.gir.now, s.gir.avg, false)}</div>
        <div><span>พัต</span><b>${s.putts.now}</b>${vsAvg(s.putts.now, s.putts.avg)}</div>
        <div><span>3-พัต</span><b>${s.three.now}</b>${vsAvg(s.three.now, s.three.avg)}</div>
        <div><span>ลูกโทษ</span><b>${s.pen.now}</b>${vsAvg(s.pen.now, s.pen.avg)}</div>
      </div>

      ${teeHtml}

      ${r.blow.length ? `<h2>หลุมที่เสียมาก</h2>
      <div class="card">${r.blow.map((b) => `<a class="recap-blow" href="#/round/${roundId}/hole/${b.n}"><b>หลุม ${b.n}</b> <span class="badge bad">+${b.over}</span> <small>${esc(b.why.join(' · ') || 'ตีเกินพาร์')}</small></a>`).join('')}</div>` : ''}

      <h2>สัปดาห์นี้ซ้อมอะไร</h2>
      <div class="card recap-practice">
        ${r.practice ? `<b>${esc(r.practice.th)}</b>
          ${drills.map((d) => `<a class="recap-drill" href="#/practice/new?d=${encodeURIComponent(d.id)}"><span><b>${esc(d.name)}</b><small>${esc(d.why)}</small></span><small>${d.minutes} นาที ›</small></a>`).join('')}`
    : '<b>รอบนี้ไม่มีเรื่องไหนเสียเกินงบของเป้า</b><small>ซ้อมตามแผนสัปดาห์เดิมต่อไป</small>'}
        <a class="btn block" href="#/coach">ดูแผนซ้อมทั้งสัปดาห์ (หน้าพัฒนา)</a>
      </div>

      <div class="action-grid">
        <a class="btn primary" href="#/round/${roundId}/share">📤 แชร์รูปสกอร์การ์ด</a>
        <a class="btn" href="#/round/${roundId}/card">กลับสกอร์การ์ด</a>
      </div>
    </div>`,
  };
}
