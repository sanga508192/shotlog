// หน้าพัฒนาการ: กราฟสกอร์ (รายรอบ + ค่าเฉลี่ย 5 รอบ) แต้มต่อหลังแต่ละรอบ และตารางรายเดือน
import * as st from '../state.js';
import { esc, header, fmtDate } from '../ui.js';
import { goalOf } from '../coach.js';
import { scoreRounds, rollingAvg, inRange, monthly, handicapSeries, change } from '../progress.js';
import { handicapRounds, ratingOf, priorIndex } from './coach.js';

const RANGES = [{ v: '3m', th: '3 เดือน' }, { v: '12m', th: '12 เดือน' }, { v: 'all', th: 'ทั้งหมด' }];
const f1 = (x) => (x == null ? '–' : x.toFixed(1));
const monthTh = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
const t = (d) => Date.parse(`${d}T00:00:00Z`);

// กราฟเส้นตามเวลา: points = จุดรายรอบ · line = เส้นค่าเฉลี่ย · goal = เส้นเป้า (ไม่บังคับ) · ค่าน้อยอยู่ล่าง
function timeChart({ points, line = null, goal = null, goalTh = '', label, fmt = f1 }) {
  if (points.length < 2) return '';
  const W = 340, H = 170, L = 34, R = 12, T = 14, B = 26;
  const ts = points.map((p) => t(p.date));
  let t0 = Math.min(...ts), t1 = Math.max(...ts);
  if (t1 === t0) { t0 -= 86400000; t1 += 86400000; }
  const vs = [...points.map((p) => p.v), ...(goal != null ? [goal] : [])];
  const lo = Math.floor(Math.min(...vs) - 1), hi = Math.ceil(Math.max(...vs) + 1);
  const x = (d) => L + ((t(d) - t0) * (W - L - R)) / (t1 - t0);
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  // เส้นแบ่งเดือน (เว้นถ้ามากเกิน)
  const ticks = [];
  const d = new Date(t0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.getTime() <= t1) { ticks.push(d.toISOString().slice(0, 10)); d.setUTCMonth(d.getUTCMonth() + 1); }
  const step = Math.ceil(ticks.length / 6) || 1;
  const gy = goal != null ? y(goal).toFixed(1) : null;
  return `<svg class="trend prog-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${ticks.filter((_, i) => i % step === 0).map((m) => `<line x1="${x(m).toFixed(1)}" x2="${x(m).toFixed(1)}" y1="${T}" y2="${H - B}" class="grid"/><text x="${x(m).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(monthTh(m.slice(0, 7)))}</text>`).join('')}
    ${gy ? `<line x1="${L}" x2="${W - R}" y1="${gy}" y2="${gy}" class="goal-line"/><text x="${W - R}" y="${Number(gy) - 4}" class="goal-txt" text-anchor="end">${esc(goalTh)}</text>` : ''}
    <text x="${L - 6}" y="${y(hi) + 4}" text-anchor="end">${hi}</text>
    <text x="${L - 6}" y="${y(lo) + 4}" text-anchor="end">${lo}</text>
    ${line ? `<polyline points="${line.map((p) => `${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}" class="score-line"/>` : ''}
    ${points.map((p, i) => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${i === points.length - 1 ? 4.5 : 3}" class="${p.hit ? 'hit' : ''}${line ? ' dot' : ''}"><title>${esc(fmtDate(p.date))}${p.title ? ` ${esc(p.title)}` : ''}: ${esc(fmt(p.v))}</title></circle>`).join('')}
  </svg>`;
}

export function progressView(_p, ctx) {
  let range = st.setting('progress_range', '12m');
  if (!RANGES.some((r) => r.v === range)) range = '12m';
  const today = st.todayLocal();
  const all = scoreRounds({ rounds: st.rounds(), holesOf: st.holesOf, shotsOf: st.shotsOf, penaltiesOf: st.penaltiesOf });
  const list = inRange(all, range, today);
  const goal = goalOf(st.setting('coach_goal', null));
  const scores = list.map((r) => r.score18);
  const avg5 = rollingAvg(scores, 5);
  const delta = change(scores);
  const hcp = inRange(handicapSeries(handicapRounds(), ratingOf, priorIndex()), range, today);
  const months = monthly(list);

  const scoreHtml = list.length >= 2 ? `
    ${timeChart({
    points: list.map((r) => ({ date: r.date, v: r.score18, hit: r.score18 <= goal.score, title: r.course })),
    line: list.map((r, i) => ({ date: r.date, v: avg5[i] })), goal: goal.score, goalTh: `เป้า ${goal.score}`,
    label: `กราฟสกอร์ ${list.length} รอบ เทียบเป้า ${goal.score}`,
  })}
    <p class="note">จุด = สกอร์แต่ละรอบ (เทียบ 18 หลุม พาร์ 72) · เส้น = ค่าเฉลี่ย 5 รอบล่าสุด · ยิ่งต่ำยิ่งดี · จุดสีเขียว = ถึงเป้า</p>`
    : `<div class="card small">${all.length ? 'ช่วงนี้มีรอบไม่ถึง 2 รอบ ลองเลือก "ทั้งหมด"' : 'ยังไม่มีรอบที่จบ (ต้องมีสกอร์อย่างน้อย 9 หลุมที่รู้พาร์ หรือครบทุกหลุมของรอบสั้น)'}</div>`;

  const hcpHtml = hcp.length >= 2 ? `${timeChart({
    points: hcp.map((h) => ({ date: h.date, v: h.index })), line: hcp.map((h) => ({ date: h.date, v: h.index })),
    label: `แต้มต่อโดยประมาณ ${hcp.length} ครั้ง`,
  })}
    <p class="note">ล่าสุด <b>${hcp.at(-1).index.toFixed(1)}</b>${hcp.length >= 2 ? ` (เริ่มช่วงนี้ ${hcp[0].index.toFixed(1)})` : ''} · คำนวณตามสูตร WHS จากรอบ 18 หลุมที่มี Course Rating/Slope · ไม่ใช่แฮนดิแคปทางการ</p>`
    : `<div class="card small">ต้องมีรอบ 18 หลุมที่ใส่ Course Rating และ Slope อย่างน้อย 3–4 รอบ กราฟแต้มต่อจึงขึ้น · <a href="#/coach">ใส่ค่าสนามที่หน้าพัฒนา ›</a></div>`;

  const monthRows = months.map((m) => `<tr>
    <td>${esc(monthTh(m.month))}</td><td>${m.rounds}</td><td><b>${f1(m.avg)}</b></td><td>${f1(m.best)}</td>
    <td>${f1(m.putts)}</td><td>${f1(m.pen)}</td><td>${m.fir == null ? '–' : `${Math.round(m.fir)}%`}</td><td>${f1(m.gir)}</td></tr>`).join('');

  return {
    html: `${header('พัฒนาการ', { back: '#/coach', sub: 'สกอร์ แต้มต่อ และสถิติรายเดือน' })}
    <div class="page progress">
      <div class="chips">${RANGES.map((r) => `<button type="button" class="chip${r.v === range ? ' on' : ''}" data-act="range" data-v="${r.v}">${r.th}</button>`).join('')}</div>
      ${list.length ? `<div class="stat-strip">
        <div><b>${list.length}</b><span>รอบ</span></div>
        <div><b>${f1(scores.reduce((a, b) => a + b, 0) / scores.length)}</b><span>สกอร์เฉลี่ย</span></div>
        <div><b>${f1(Math.min(...scores))}</b><span>ดีสุด</span></div>
        <div><b class="${delta == null ? '' : delta < 0 ? 'good' : delta > 0 ? 'bad' : ''}">${delta == null ? '–' : `${delta < 0 ? '↓' : delta > 0 ? '↑' : '→'} ${f1(Math.abs(delta))}`}</b><span>${delta == null ? 'ต้องมี 6 รอบ' : '3 รอบแรก→ล่าสุด'}</span></div>
      </div>` : ''}

      <h2>สกอร์</h2>
      ${scoreHtml}

      <h2>แต้มต่อ (โดยประมาณ)</h2>
      ${hcpHtml}

      <h2>รายเดือน</h2>
      ${months.length ? `<div class="table-wrap"><table class="card-table prog-table">
        <thead><tr><th>เดือน</th><th>รอบ</th><th>เฉลี่ย</th><th>ดีสุด</th><th>พัต</th><th>ลูกโทษ</th><th>แฟร์เวย์</th><th>GIR</th></tr></thead>
        <tbody>${monthRows}</tbody></table></div>
      <p class="note">สกอร์เทียบ 18 หลุม · พัต ลูกโทษ GIR = ต่อ 18 หลุม คิดจากหลุมที่จดรายช็อตครบ (ต้องมีอย่างน้อย 9 หลุมในเดือนนั้น) · ช่อง "–" = ข้อมูลยังไม่พอ</p>`
    : '<div class="card small">ยังไม่มีข้อมูลรายเดือน</div>'}
    </div>`,
    actions: {
      range: async (el) => { await st.setSetting('progress_range', el.dataset.v); ctx.rerender(); },
    },
  };
}
