// หน้าโค้ชพัฒนาเกม: เป้าหมาย → สโตรกหายไปไหน → จุดที่ควรแก้ → โฟกัสรอบหน้า → แผนซ้อม
import * as st from '../state.js';
import { esc, header, fmtDate, toast } from '../ui.js';
import { GOALS, analyzeGame, budgetOver, fmtSigned, clubDistances } from '../coach.js';
import { courseHoles, toUnit, unitTh } from '../holemap.js';
import { drillCard, clipActions } from './drills.js';
import { analyzeSG } from '../sg.js';
import { estimateHandicap, ratingKey, validRating } from '../handicap.js';
import { ME, playerHoleScore } from '../group.js';

export function coachData(goalV = st.setting('coach_goal', null)) {
  return analyzeGame({
    rounds: st.rounds(), holesOf: st.holesOf, shotsOf: st.shotsOf, penaltiesOf: st.penaltiesOf,
    clubLabel: (id) => st.club(id)?.label ?? null, practice: [...st.S.practice.values()],
  }, goalV);
}

const f1 = (x) => (x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ''));
const CONF = {
  good: ['ข้อมูลดี', 'ok'], fair: ['ข้อมูลพอใช้', 'near'], low: ['ข้อมูลเบื้องต้น', 'far'], none: ['ข้อมูลยังไม่พอ', 'far'],
};

function trendChart(rounds, goalScore) {
  const pts = rounds.slice(-20);
  if (pts.length < 2) return '';
  const W = 320, H = 130, L = 30, R = 10, T = 12, B = 22;
  const ys = [...pts.map((p) => p.score18), goalScore];
  const lo = Math.floor(Math.min(...ys) - 2), hi = Math.ceil(Math.max(...ys) + 2);
  const x = (i) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.score18).toFixed(1)}`).join(' ');
  const gy = y(goalScore).toFixed(1);
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟสกอร์ ${pts.length} รอบล่าสุด เทียบเป้า ${goalScore}">
    <line x1="${L}" x2="${W - R}" y1="${gy}" y2="${gy}" class="goal-line"/>
    <text x="${W - R}" y="${Number(gy) - 4}" class="goal-txt" text-anchor="end">เป้า ${goalScore}</text>
    <text x="${L - 6}" y="${y(hi) + 4}" text-anchor="end">${hi}</text>
    <text x="${L - 6}" y="${y(lo) + 4}" text-anchor="end">${lo}</text>
    <polyline points="${line}" class="score-line"/>
    ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.score18).toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 3}" class="${p.score18 <= goalScore ? 'hit' : ''}"><title>${esc(fmtDate(p.date))} ${esc(p.course)}: ${f1(p.score18)}</title></circle>`).join('')}
    <text x="${L}" y="${H - 5}">${esc(fmtDate(pts[0].date))}</text>
    <text x="${W - R}" y="${H - 5}" text-anchor="end">${esc(fmtDate(pts.at(-1).date))}</text>
  </svg>`;
}

function leakRows(a) {
  const max = Math.max(...a.leaks.map((l) => Math.max(l.yours ?? 0, l.target)), 1);
  return a.leaks.map((l) => {
    const isSave = l.k === 'save';
    const status = l.gap == null ? '' : l.gap > 0.25 ? 'far' : l.gap > -0.25 ? 'near' : 'ok';
    return `<div class="leak ${status}${isSave ? ' save' : ''}">
      <div class="leak-head"><span class="leak-name">${l.icon} ${esc(l.th)}</span>
        <span class="leak-num"><b>${isSave ? '−' : ''}${f1(l.yours)}</b> <small>งบ ${isSave ? '−' : ''}${f1(l.target)}</small></span></div>
      <div class="leak-bar" aria-hidden="true"><span style="width:${Math.min(100, ((l.yours ?? 0) / max) * 100).toFixed(1)}%"></span>
        <i style="left:${Math.min(100, (l.target / max) * 100).toFixed(1)}%"></i></div>
      <div class="leak-sub">${esc(l.sub)}</div>
    </div>`;
  }).join('');
}

function statTiles(a) {
  return a.stats.map((s) => {
    const v = s.yours == null ? '–' : s.unit === '%' ? `${Math.round(s.yours)}%` : f1(s.yours);
    const t = `${s.better === 'high' ? '≥' : '≤'} ${s.target}${s.unit === '%' ? '%' : ''}`;
    return `<div class="stat-tile ${s.status || 'none'}"><span class="st-name">${esc(s.th)}</span>
      <b>${v}</b><span class="st-goal">เป้า ${t}${s.unit === '/18' ? ' ต่อรอบ' : ''}</span></div>`;
  }).join('');
}

// ระยะไม้จริงจาก GPS: แท่งแสดงช่วงปกติ (25–75%) และขีดคือระยะกลาง
export function clubDistanceHtml() {
  const rows = clubDistances({
    rounds: st.rounds(), holesOf: st.holesOf, shotsOf: st.shotsOf, penaltiesOf: st.penaltiesOf, clubOf: st.club,
    teeOf: (r, h) => courseHoles(r.course_id)[h.number]?.tee ?? null,
  });
  if (!rows.length) {
    return `<div class="card small">เปิด <b>📍 จับตำแหน่ง GPS ตอนบันทึก</b> ในหน้าจดช็อต แล้วบันทึกช็อตขณะยืนที่จุดตี
      แอปจะรู้ระยะจริงของแต่ละไม้ (นับเฉพาะทีออฟและช็อตเข้ากรีนที่สัมผัสดี)</div>`;
  }
  const unit = st.setting('map_unit', 'yd');
  const u = (m) => Math.round(toUnit(m, unit));
  const top = Math.max(...rows.map((r) => r.p75)) * 1.08;
  const pct = (m) => `${((m / top) * 100).toFixed(1)}%`;
  return `<div class="card club-dist">
    ${rows.map((r) => `<div class="cd-row${r.n < 3 ? ' few' : ''}">
      <b class="cd-club">${esc(r.label)}</b>
      <div class="cd-bar" aria-hidden="true"><span style="left:${pct(r.p25)};width:${pct(Math.max(r.p75 - r.p25, top * 0.01))}"></span><i style="left:${pct(r.median)}"></i></div>
      <span class="cd-num"><b>${u(r.median)}</b> <small>${u(r.p25)}–${u(r.p75)} · ${r.n} ครั้ง</small></span>
    </div>`).join('')}
    <p class="note">ระยะกลาง (${unitTh(unit)}) และช่วงปกติจากช็อตที่จับ GPS · นับเฉพาะทีออฟและช็อตเข้ากรีนที่สัมผัสดี ไม่รวมช็อตที่โดนลูกโทษ · ไม้ที่จางยังมีข้อมูลไม่ถึง 3 ครั้ง</p>
  </div>`;
}

// Strokes Gained ต่อ 18 หลุม เทียบค่าที่นักกอล์ฟระดับเป้าหมายมักเสีย
export function sgHtml(goal) {
  const r = analyzeSG({ rounds: st.rounds(), holesOf: st.holesOf, shotsOf: st.shotsOf, penaltiesOf: st.penaltiesOf }, goal.score);
  if (r.holesComplete < 9) {
    return `<div class="card small">ต้องมีหลุมที่ข้อมูลครบอย่างน้อย 9 หลุม (ตอนนี้ ${r.holesComplete}${r.holesLogged ? ` จาก ${r.holesLogged} หลุมที่จดรายช็อต` : ''})
      <ul class="find"><li>ทุกช็อตมี <b>ระยะก่อนตี</b> — เปิด 📍 GPS ตอนบันทึก และวางหมุดกรีนในแผนที่หลุม แอปเติมให้เอง</li>
      <li>จด <b>ระยะพัตแรก</b> (ช่อง "ก่อนตี" ของพัต) และจุดจบของแต่ละช็อต</li>
      <li>ลูกโทษให้ระบุว่าเกิดหลังช็อตไหน</li></ul>
      Strokes Gained บอกได้ชัดว่าเสียสโตรกตรงไหนเทียบนักกอล์ฟเก่ง ๆ แม้สกอร์รวมจะเท่ากัน</div>`;
  }
  const max = Math.max(1, ...r.cats.map((c) => Math.abs(c.yours)), ...r.cats.map((c) => Math.abs(c.target)));
  const w = (v) => `${Math.min(50, (Math.abs(v) / max) * 50).toFixed(1)}%`;
  const rows = r.cats.map((c) => {
    const tone = c.diff >= 0.3 ? 'ok' : c.diff > -0.7 ? 'near' : 'far';
    return `<div class="sg-row ${tone}">
      <div class="leak-head"><span class="leak-name">${c.icon} ${esc(c.th)}</span>
        <span class="leak-num"><b>${fmtSigned(c.yours)}</b> <small>ระดับเป้า ${fmtSigned(c.target)}</small></span></div>
      <div class="sg-bar" aria-hidden="true"><span class="${c.yours < 0 ? 'neg' : 'pos'}" style="width:${w(c.yours)}"></span><i style="${c.target < 0 ? 'right' : 'left'}:${(50 - Math.min(50, (Math.abs(c.target) / max) * 50)).toFixed(1)}%"></i></div>
      <div class="leak-sub">${esc(c.sub)} · ${c.shots} ช็อต</div>
    </div>`;
  }).join('');
  const worst = r.worst.filter((x) => x.sg <= -0.8).slice(0, 3);
  return `<div class="card leaks">${rows}
    <div class="leak-total">รวม <b>${fmtSigned(r.total)}</b> สโตรก/18 หลุม <small>ระดับเป้า ${fmtSigned(-Math.max(0, goal.score - 72))}</small></div>
    ${worst.length ? `<div class="sg-worst"><b>ช็อตที่เสียมากที่สุด</b>${worst.map((x) => `<a href="#/round/${encodeURIComponent(x.roundId)}/hole/${x.hole.number}">หลุม ${x.hole.number} ช็อตที่ ${x.shot.sequence} <b>${fmtSigned(x.sg)}</b></a>`).join('')}</div>` : ''}
  </div>
  <p class="note">เทียบกับนักกอล์ฟแฮนดิแคป 0 (ค่าโดยประมาณ) · ติดลบ = เสียสโตรก · "ระดับเป้า" คือที่นักกอล์ฟ${esc(goal.th)}มักเสียในหมวดนั้น · จาก ${r.holesComplete} หลุมที่ข้อมูลครบ</p>`;
}

// รอบ 18 หลุมที่มีสกอร์ของเราครบ เรียงเก่า→ใหม่
function handicapRounds() {
  return st.rounds().filter((r) => r.status !== 'playing')
    .sort((a, b) => String(a.played_at || '').localeCompare(String(b.played_at || '')) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .map((r) => {
      const holes = [];
      for (const h of st.holesOf(r.id)) {
        const sc = playerHoleScore(h, ME, st.shotsOf(h.id), st.penaltiesOf(h.id));
        if (sc?.final && Number.isInteger(h.par)) holes.push({ par: h.par, hc: h.hc_index ?? null, strokes: sc.strokes });
      }
      return { id: r.id, courseId: r.course_id, teeId: r.tee_id ?? null, name: r.course_name_snapshot, tee: r.tee_name, date: r.played_at, holes };
    });
}

export function handicapHtml() {
  const prior = Number.isFinite(Number(st.setting('my_handicap', null))) && st.setting('my_handicap', null) !== null ? Number(st.setting('my_handicap')) : null;
  const r = estimateHandicap(handicapRounds(), (c, t) => st.setting(ratingKey(c, t), null), prior);
  const forms = r.missing.slice(0, 4).map((m) => `<form class="rating-form" data-submit="rating" data-course="${esc(m.courseId)}" data-tee="${esc(m.teeId ?? '')}">
      <span><b>${esc(m.name || 'สนาม')}</b>${m.tee ? ` · แท่น${esc(m.tee)}` : ''} <small class="muted">${m.count} รอบ</small></span>
      <input class="input" name="cr" type="number" inputmode="decimal" step="0.1" min="50" max="90" placeholder="Course Rating เช่น 71.8" required aria-label="Course Rating">
      <input class="input" name="slope" type="number" inputmode="numeric" min="55" max="155" placeholder="Slope เช่น 128" required aria-label="Slope">
      <button class="mini primary">บันทึก</button>
    </form>`).join('');
  const head = r.index != null
    ? `<div class="hcp-head"><b>${r.index.toFixed(1)}</b><span>จาก ${r.used.length} รอบ 18 หลุมล่าสุด<br><small class="muted">รอบดีสุด: ${r.used.slice().sort((a, b) => a.diff - b.diff).slice(0, 3).map((u) => u.diff.toFixed(1)).join(', ')}</small></span>
        <button type="button" class="mini" data-act="useHcp" data-v="${Math.round(r.index)}">ใช้ ${Math.round(r.index)} เป็นแต้มต่อของฉัน</button></div>`
    : `<p class="small">ต้องมีรอบ 18 หลุมที่ใส่ Course Rating/Slope อย่างน้อย 3 รอบ (ตอนนี้ ${r.used.length} รอบ)</p>`;
  return `<div class="card hcp">${head}
    ${forms ? `<p class="small">ใส่ <b>Course Rating</b> และ <b>Slope</b> ของแท่นที่เล่น (มักพิมพ์ในสกอร์การ์ด) ใส่ครั้งเดียวใช้กับทุกรอบของสนาม/แท่นนั้น</p>${forms}` : ''}
    <p class="note">คำนวณตามสูตร World Handicap System จากสกอร์ที่จด · ไม่ใช่แฮนดิแคปทางการ (ต้องลงทะเบียนกับสมาคมกอล์ฟ) · รอบ 9 หลุมยังไม่นับ</p>
  </div>`;
}

export function focusListHtml(cues) {
  return `<ol class="cues">${cues.map((c) => `<li><b>${esc(c.text)}</b><span>${esc(c.why)}</span></li>`).join('')}</ol>`;
}

export function coachView(_p, ctx) {
  const chosen = st.setting('coach_goal', null);
  const a = coachData(chosen);
  const g = a.goal;
  const hasScores = a.scoreRounds.length > 0;
  const shotOk = a.shot.holes >= 9;
  const need = a.avgScore != null ? a.avgScore - g.score : null;
  const [confTxt, confCls] = CONF[a.shot.confidence];
  return {
    html: `${header('พัฒนาเกม', { sub: 'วิเคราะห์จากรอบที่คุณจด · คำนวณในเครื่อง' })}
    <div class="page coach">
      <section>
        <div class="lbl">เป้าหมายของคุณ${chosen ? '' : ' <span class="muted small">(แนะนำจากสกอร์เฉลี่ย แตะเพื่อเปลี่ยน)</span>'}</div>
        <div class="chips goal-pick">${GOALS.map((x) => `<button type="button" class="chip${x.v === g.v ? ' on' : ''}" data-act="goal" data-v="${x.v}" aria-pressed="${x.v === g.v}">${esc(x.th)}</button>`).join('')}</div>
      </section>

      <section class="card coach-hero">
        ${hasScores ? `<div class="hero-nums">
          <div><span>สกอร์เฉลี่ย</span><b>${f1(a.avgScore)}</b><small>${a.recentCount} รอบล่าสุด</small></div>
          <div><span>ดีที่สุด</span><b>${f1(a.best)}</b><small>เทียบ 18 หลุม</small></div>
          <div><span>แนวโน้ม</span><b class="${a.trend == null ? '' : a.trend < 0 ? 'good' : a.trend > 0 ? 'bad' : ''}">${a.trend == null ? '–' : `${a.trend < 0 ? '↓' : a.trend > 0 ? '↑' : '→'} ${f1(Math.abs(a.trend))}`}</b><small>${a.trend == null ? 'ต้องมี 6 รอบขึ้นไป' : 'เทียบ 5 รอบก่อน'}</small></div>
        </div>
        <div class="goal-gap ${need <= 0 ? 'ok' : ''}">${need <= 0
    ? `✓ เฉลี่ยถึงเป้า${esc(g.th)}แล้ว ลองตั้งเป้าถัดไป`
    : `เป้า${esc(g.th)} ต้องลดอีก <b>${f1(need)}</b> สโตรกต่อรอบ`}</div>
        ${trendChart(a.scoreRounds, g.score)}
        <div class="par-types">${a.byPar.filter((p) => p.n).map((p) => `<span>พาร์ ${p.par} <b>${fmtSigned(p.avgOver)}</b></span>`).join('')}</div>
        <p class="note">สกอร์เทียบ 18 หลุม พาร์ 72 · รวมรอบจดเร็วและรอบก๊วน (ใช้สกอร์ของคุณ)</p>`
    : `<p><b>ยังไม่มีรอบที่จบ</b></p><p class="small">เล่นให้จบอย่างน้อย 9 หลุมที่มีพาร์ แล้วกลับมาดูหน้านี้ ระหว่างนี้ดูแผนซ้อมเริ่มต้นด้านล่างได้</p>`}
      </section>

      <h2>สโตรกหายไปไหน <span class="badge ${confCls}">${confTxt}</span></h2>
      ${shotOk ? `<p class="note">เฉลี่ยต่อ 18 หลุม จาก ${a.shot.holes} หลุมที่จดรายช็อต (${a.shot.rounds} รอบล่าสุด) · ขีดดำ = งบของเป้า${esc(g.th)}</p>
      <div class="card leaks">${leakRows(a)}
        <div class="leak-total">รวมเกินพาร์ <b>${fmtSigned(a.shot.overShots)}</b> <small>งบ ${fmtSigned(budgetOver(g))}</small></div>
      </div>`
    : `<div class="card warn small">ต้องมีหลุมที่จดแบบ <b>🎯 รายช็อต</b> จนจบหลุมอย่างน้อย 9 หลุม (ตอนนี้ ${a.shot.holes} หลุม)
        แอปจะแยกให้เห็นว่าเสียสโตรกจากลูกโทษ ช็อตยาว พลาดกรีน ลูกสั้น หรือพัต<br>
        เคล็ดลับ: ระบุ <b>ประเภทช็อต</b> และ <b>จุดจบ</b> (แฟร์เวย์/รัฟ/บนกรีน) ทุกช็อต ใช้เวลาไม่กี่วินาที</div>`}

      ${shotOk ? `<h2>จุดที่ควรแก้ก่อน</h2>
      ${a.focus.length ? a.focus.map((f, i) => `<div class="card focus ${i === 0 ? 'first' : ''}">
        <div class="row between"><div><span class="rank">${i + 1}</span> <b>${f.icon} ${esc(f.th)}</b></div>
          <span class="gain">ได้คืน ~${f1(f.gap)}/รอบ</span></div>
        <div class="small muted">คุณ ${f.k === 'save' ? 'ได้คืน' : 'เสีย'} ${f1(f.yours)} สโตรก/รอบ · งบของเป้า ${f1(f.target)}</div>
        ${f.find.length ? `<ul class="find">${f.find.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </div>`).join('')
    : `<div class="card ok small">ทุกหมวดอยู่ในงบของเป้า${esc(g.th)}แล้ว ลองเลือกเป้าที่ยากขึ้นด้านบน</div>`}` : ''}

      ${a.cues.length ? `<h2>โฟกัสรอบหน้า</h2>
      <div class="card">${focusListHtml(a.cues)}<p class="note">แสดงในหน้าเริ่มรอบใหม่ด้วย</p></div>` : ''}

      ${shotOk || a.stats.some((s) => s.yours != null) ? `<h2>สถิติหลักเทียบเป้า</h2>
      <div class="stat-grid">${statTiles(a)}</div>` : ''}

      <h2>Strokes Gained <span class="badge ok">รายหมวด</span></h2>
      ${sgHtml(g)}

      <h2>แฮนดิแคปโดยประมาณ <span class="badge ok">WHS</span></h2>
      ${handicapHtml()}

      <h2>ระยะไม้จริงของคุณ <span class="badge ok">GPS</span></h2>
      ${clubDistanceHtml()}

      <h2 id="plan">แผนซ้อมสัปดาห์นี้</h2>
      <p class="note">${a.plan.basis.length ? `เน้น: ${esc(a.plan.basis.join(' และ '))} · ` : 'แผนเริ่มต้นตามเป้า · '}ซ้อม 2–3 ครั้งต่อสัปดาห์ ครั้งละราว ${a.plan.minutes} นาที · บันทึกผลทุกครั้งเพื่อดูพัฒนาการ</p>
      <div class="drills">${a.plan.items.map((d) => drillCard(d, { history: d.history })).join('')}</div>

      <div class="card small coach-foot">
        <p>งบสโตรกและเป้าสถิติเป็นค่าประมาณเพื่อวางแผนสำหรับนักกอล์ฟสมัครเล่น ไม่ใช่มาตรฐานตายตัว · ยิ่งจดรายช็อตครบ ผลยิ่งแม่น</p>
        <div class="row gap"><a class="mini" href="#/drills">แบบฝึกทั้งหมด + คลิปสอน ›</a><a class="mini" href="#/summary">สถิติรายช็อตละเอียด ›</a><a class="mini" href="#/practice">ประวัติการซ้อม ›</a></div>
      </div>
    </div>`,
    actions: {
      ...clipActions(),
      rating: async (form) => {
        const v = validRating({ cr: form.cr.value, slope: form.slope.value });
        if (!v) { toast('Course Rating ต้องอยู่ระหว่าง 50–90 และ Slope 55–155'); return; }
        await st.setSetting(ratingKey(form.dataset.course, form.dataset.tee || null), v);
        toast('บันทึกแล้ว');
        ctx.rerender();
      },
      useHcp: async (el) => {
        await st.setSetting('my_handicap', Number(el.dataset.v));
        toast(`ตั้งแต้มต่อของฉันเป็น ${el.dataset.v} แล้ว (ใช้ในเกมก๊วน)`);
        ctx.rerender();
      },
      goal: async (el) => {
        await st.setSetting('coach_goal', el.dataset.v);
        ctx.rerender();
      },
    },
  };
}
