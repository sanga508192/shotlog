// หน้าเครื่องซ้อม (launch monitor): นำเข้าไฟล์ CSV จาก Garmin Golf (Approach R10) → ตรวจก่อนบันทึก → วิเคราะห์และเลือกแบบฝึก
// อ่านไฟล์ในเครื่องเท่านั้น ไม่ส่งไฟล์ไปที่ไหน (ผลที่บันทึกแล้วซิงก์ไปกับบัญชีเหมือนบันทึกซ้อมอื่น)
import * as st from '../state.js';
import { esc, header, toast, fmtDate } from '../ui.js';
import {
  readLaunchFile, rawClub, guessClub, toShots, buildRecords, isLaunch, sessionShots, clubStats, launchIssues, clubTrend, sessionKey, sessionDate,
  DIST_UNITS, SPEED_UNITS, METRICS, num, inBetweenFor,
} from '../launch.js';
import { drill, drillHistory } from '../coach.js';
import { drillCard, clipActions } from './drills.js';
import { toUnit, unitTh } from '../holemap.js';

const MAX_FILE = 5 * 1024 * 1024;
let IMP = null;   // ไฟล์ที่กำลังตรวจก่อนบันทึก (อยู่ในหน่วยความจำจนบันทึกหรือยกเลิก)

const PERIODS = [{ v: 'last', th: 'ครั้งล่าสุด' }, { v: '30', th: '30 วัน' }, { v: 'all', th: 'ทั้งหมด' }];

function sessions() {
  return [...st.S.practice.values()].filter(isLaunch)
    .sort((a, b) => sessionDate(b).localeCompare(sessionDate(a)) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

// บันทึกหลายส่วนของไฟล์เดียวกัน (sig เดียวกัน) รวมเป็นครั้งเดียว
function groupSessions(list) {
  const m = new Map();
  for (const p of list) {
    const k = sessionKey(p);
    if (!m.has(k)) m.set(k, { key: k, date: sessionDate(p), file: typeof p.launch.file === 'string' ? p.launch.file : '', records: [], shots: 0 });
    const g = m.get(k);
    g.records.push(p);
    g.shots += sessionShots(p).length;
  }
  return [...m.values()];
}

function periodFilter(list, period) {
  if (period === 'all' || !list.length) return list;
  if (period === 'last') {
    const k = sessionKey(list[0]);
    return list.filter((p) => sessionKey(p) === k);
  }
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return list.filter((p) => sessionDate(p) >= from);
}

const clubOf = (id) => st.club(id);

export function launchView(_p, ctx) {
  const du = st.setting('map_unit', 'yd');
  const su = SPEED_UNITS.some((u) => u.v === st.setting('speed_unit', 'mph')) ? st.setting('speed_unit', 'mph') : 'mph';
  const hand = st.setting('hand', 'right') === 'left' ? 'left' : 'right';
  const period = PERIODS.some((x) => x.v === st.setting('launch_period', 'all')) ? st.setting('launch_period', 'all') : 'all';
  const dist = (m) => (m == null ? '–' : String(Math.round(toUnit(m, du))));
  const fmt = (m) => `${dist(m)} ${unitTh(du)}`;
  const sFactor = SPEED_UNITS.find((u) => u.v === su)?.f ?? 1;
  const spd = (ms) => (ms == null ? '–' : String(Math.round(ms / sFactor)));
  const deg = (x) => (x == null ? '–' : `${x > 0 ? '+' : ''}${x.toFixed(1)}°`);

  const all = sessions();
  const groups = groupSessions(all);
  const chosen = periodFilter(all, period);
  const shots = chosen.flatMap(sessionShots);
  const stats = clubStats(shots, clubOf);
  const issues = launchIssues(stats, { hand, fmt, inBetween: inBetweenFor(st.bagClubs()) });
  const practice = [...st.S.practice.values()];

  // ---------- ตรวจไฟล์ก่อนบันทึก ----------
  function importHtml() {
    if (!IMP) return '';
    const { parsed, units, clubMap, file } = IMP;
    const counts = new Map();
    for (const r of parsed.rows) {
      const raw = rawClub(r, parsed.cols);
      if (!counts.has(raw)) counts.set(raw, { n: 0, carry: [] });
      const x = counts.get(raw);
      x.n++;
      const c = parsed.cols.carry == null ? null : num(r[parsed.cols.carry]);
      if (c > 0) x.carry.push(c);
    }
    const unitTxt = DIST_UNITS.find((u) => u.v === units.dist)?.th;
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const bag = st.bagClubs().filter((c) => c.category !== 'putter');
    const found = METRICS.filter((m) => !m.text && parsed.cols[m.k] != null && parsed.rows.some((r) => num(r[parsed.cols[m.k]]) != null));
    const kept = [...counts.entries()].filter(([raw]) => clubMap[raw] !== '').reduce((a, [, v]) => a + v.n, 0);
    return `<div class="card lm-imp">
      <div class="row between"><b>ตรวจข้อมูลก่อนบันทึก</b><span class="small muted">${esc(file)}</span></div>
      ${parsed.noCarry || parsed.dupes ? `<p class="note">${[parsed.noCarry ? `${parsed.noCarry} ช็อตไม่มีระยะลอย (เครื่องวัดไม่ได้) ใช้วิเคราะห์วงสวิงแต่ไม่นับในระยะ` : '', parsed.dupes ? `ข้าม ${parsed.dupes} ช็อตที่ซ้ำกันในไฟล์` : ''].filter(Boolean).join(' · ')}</p>` : ''}
      ${parsed.byPosition ? '<p class="card warn small">อ่านชื่อคอลัมน์ในไฟล์ไม่ออก (อาจเป็นภาษาที่แอปยังไม่รู้จัก) จึงจับคู่ตามลำดับคอลัมน์มาตรฐานของ Garmin ตรวจระยะลอยด้านล่างว่าสมเหตุสมผลก่อนบันทึก</p>' : ''}
      <label>วันที่ซ้อม<input class="input" type="date" value="${esc(IMP.date)}" data-change="impDate"></label>
      ${IMP.fileDate && parsed.date && IMP.fileDate !== parsed.date ? `<p class="note">ใช้วันที่ซ้อมจากในไฟล์ (${esc(fmtDate(parsed.date))}) · วันที่ในชื่อไฟล์ (${esc(fmtDate(IMP.fileDate))}) คือวันที่ส่งออกจากแอป Garmin</p>` : ''}
      <div class="lbl">หน่วยในไฟล์ <span class="small muted">(ตามที่ตั้งในแอป Garmin Golf${units.fromFile ? ' · อ่านจากไฟล์' : ' · เดาจากตัวเลข ตรวจอีกครั้ง'})</span></div>
      <div class="chips">${DIST_UNITS.map((u) => `<button type="button" class="chip${units.dist === u.v ? ' on' : ''}" data-act="impDist" data-v="${u.v}">${u.th}</button>`).join('')}
        ${SPEED_UNITS.map((u) => `<button type="button" class="chip${units.speed === u.v ? ' on' : ''}" data-act="impSpeed" data-v="${u.v}">${u.th}</button>`).join('')}</div>
      <div class="lbl">ไม้ในไฟล์ → ไม้ในกระเป๋า</div>
      <table class="lm-map"><thead><tr><th>ในไฟล์</th><th>ลูก</th><th>ระยะลอยกลาง</th><th>ไม้ของฉัน</th></tr></thead><tbody>
        ${[...counts.entries()].map(([raw, v]) => `<tr><td>${esc(raw)}</td><td>${v.n}</td><td>${med(v.carry) == null ? '–' : `${Math.round(med(v.carry))} ${unitTxt}`}</td>
          <td><select class="input" data-change="impClub" data-raw="${esc(raw)}">
            <option value="-"${clubMap[raw] == null ? ' selected' : ''}>ยังไม่ผูก (นำเข้าตามชื่อในไฟล์)</option>
            ${bag.map((c) => `<option value="${c.id}"${clubMap[raw] === c.id ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}
            <option value=""${clubMap[raw] === '' ? ' selected' : ''}>ไม่นำเข้า</option>
          </select></td></tr>`).join('')}
      </tbody></table>
      <p class="note">ค่าที่พบในไฟล์: ${found.map((m) => esc(m.th)).join(' · ') || '–'}</p>
      <div class="row gap"><button type="button" class="btn primary" data-act="impSave"${kept ? '' : ' disabled'}>บันทึก ${kept} ช็อต</button>
        <button type="button" class="btn" data-act="impCancel">ยกเลิก</button></div>
    </div>`;
  }

  // ---------- ผลวิเคราะห์ ----------
  function clubRows() {
    const shown = stats;
    if (!shown.length) return '';
    const top = Math.max(1, ...shown.filter((s) => s.carry != null).map((s) => s.p75 ?? s.carry)) * 1.06;
    const pct = (m) => `${((m / top) * 100).toFixed(1)}%`;
    return `<div class="card club-dist lm-clubs">
      ${shown.map((s) => `<div class="cd-row${s.nCarry < 3 ? ' few' : ''}">
        <b class="cd-club">${esc(s.label)}${s.clubId ? '' : ' <small class="muted">(ไม่ได้ผูก)</small>'}</b>
        ${s.carry != null ? `<div class="cd-bar" aria-hidden="true"><span style="left:${pct(s.p25 ?? s.carry)};width:${pct(Math.max((s.p75 ?? s.carry) - (s.p25 ?? s.carry), top * 0.01))}"></span><i style="left:${pct(s.carry)}"></i></div>
        <span class="cd-num"><b>${dist(s.carry)}</b> <small>${dist(s.p25)}–${dist(s.p75)} · ${s.nCarry}${s.nCarry < s.n ? `/${s.n}` : ''} ลูก</small></span>`
    : `<div></div><span class="cd-num"><small>ไม่มีระยะลอย · ${s.n} ลูก</small></span>`}
        <div class="lm-sub">${[
    s.total != null ? `รวม ${dist(s.total)}` : '',
    s.side != null ? `เบี่ยง${s.side > 0 ? 'ขวา' : 'ซ้าย'} ${dist(Math.abs(s.side))}` : '',
    s.sf != null ? `Smash ${s.sf.toFixed(2)}` : '',
    s.f2p != null ? `F2P ${deg(s.f2p)}` : '',
    s.cs != null ? `หัวไม้ ${spd(s.cs)}` : '',
    s.mishit >= 0.15 ? `<span class="bad">พลาด ${Math.round(s.mishit * 100)}%</span>` : '',
  ].filter(Boolean).join(' · ')}</div>
      </div>`).join('')}
      <p class="note">ระยะลอย (${unitTh(du)}) ค่ากลางและช่วงปกติ (25–75%) ไม่นับช็อตพลาด · “12/20 ลูก” = มีระยะลอย 12 จาก 20 ลูก · ความเร็ว ${esc(SPEED_UNITS.find((u) => u.v === su)?.th)} · F2P = หน้าไม้เทียบแนวสวิง (บวก = ลูกโค้งขวา)</p>
    </div>`;
  }

  const plotClubs = stats.filter((s) => s.nCarry >= 5 && s.carry != null);
  const selKey = plotClubs.some((s) => s.key === st.setting('launch_club', null)) ? st.setting('launch_club', null) : plotClubs[0]?.key;
  const sel = plotClubs.find((s) => s.key === selKey);

  function scatter() {
    if (!sel) return '';
    const pts = shots.filter((s) => (s.clubId && clubOf(s.clubId) ? s.clubId : `raw:${s.raw}`) === sel.key && s.cdev != null && s.carry != null);
    if (pts.length < 3) return '';
    const W = 320, H = 220, pad = 26;
    const maxSide = Math.max(10, ...pts.map((p) => Math.abs(p.cdev))) * 1.1;
    const lo = Math.min(...pts.map((p) => p.carry)) * 0.95, hi = Math.max(...pts.map((p) => p.carry)) * 1.03;
    const x = (v) => W / 2 + (v / maxSide) * (W / 2 - pad);
    const y = (v) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - 2 * pad);
    return `<svg class="lm-scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="จุดตกของลูก ${esc(sel.label)} ${pts.length} ลูก">
      <line x1="${W / 2}" x2="${W / 2}" y1="${pad / 2}" y2="${H - pad}" class="lm-axis"/>
      <line x1="${pad}" x2="${W - pad}" y1="${y(sel.carry).toFixed(1)}" y2="${y(sel.carry).toFixed(1)}" class="lm-med"/>
      <text x="${W - pad}" y="${(y(sel.carry) - 4).toFixed(1)}" text-anchor="end">กลาง ${dist(sel.carry)}</text>
      ${pts.map((p) => `<circle cx="${x(p.cdev).toFixed(1)}" cy="${y(p.carry).toFixed(1)}" r="4"/>`).join('')}
      <text x="${pad}" y="${H - 6}">ซ้าย ${dist(maxSide)}</text><text x="${W - pad}" y="${H - 6}" text-anchor="end">ขวา ${dist(maxSide)}</text>
    </svg>`;
  }

  function trend() {
    if (!sel) return '';
    const t = clubTrend(all, sel.key, clubOf).slice(-6);
    if (t.length < 2) return '<p class="note">ซ้อมกับไม้นี้อีกครั้งเพื่อดูพัฒนาการ</p>';
    return `<table class="lm-trend"><thead><tr><th>วันที่</th><th>ระยะลอย</th><th>ช่วงปกติ</th><th>เบี่ยงเฉลี่ย</th><th>Smash</th></tr></thead><tbody>
      ${t.map(({ date, s }) => `<tr><td>${esc(fmtDate(date))}</td><td><b>${dist(s.carry)}</b></td><td>${dist((s.p75 ?? 0) - (s.p25 ?? 0))}</td><td>${s.sideAbs == null ? '–' : dist(s.sideAbs)}</td><td>${s.sf == null ? '–' : s.sf.toFixed(2)}</td></tr>`).join('')}
    </tbody></table>`;
  }

  const recDrills = [...new Set(issues.slice(0, 3).flatMap((i) => i.drills))].map(drill).filter(Boolean).slice(0, 3);
  const misAll = shots.length ? stats.reduce((a, s) => a + (s.n - s.good), 0) / Math.max(1, stats.reduce((a, s) => a + s.n, 0)) : 0;

  const howTo = `<details class="card small lm-how"${all.length ? '' : ' open'}><summary><b>วิธีส่งออกไฟล์จาก Garmin Golf</b></summary>
    <ol><li>เปิดแอป Garmin Golf → เมนู <b>เพิ่มเติม (More)</b> → <b>Golf Sim sessions</b> (เซสชันเครื่องซ้อม)</li>
      <li>เลือกเซสชันที่ต้องการ → แตะไอคอน<b>แชร์/ส่งออก</b>ข้างจำนวนช็อต</li>
      <li>เลือก <b>บันทึกลงไฟล์ (Save to Files)</b> หรือส่งเข้าอีเมล/LINE ของตัวเอง แล้วกลับมากด “นำเข้าไฟล์” ที่นี่</li></ol>
    <p class="note">รองรับไฟล์ CSV ภาษาไทย อังกฤษ เยอรมัน สเปน ดัตช์ ภาษาอื่นแอปจับคู่ตามลำดับคอลัมน์ของ Garmin ให้ตรวจก่อนบันทึก · ไฟล์อ่านในเครื่องเท่านั้น</p>
  </details>`;

  return {
    html: `${header('เครื่องซ้อม', { back: '#/practice', sub: 'Garmin Approach R10 และเครื่องที่ส่งออกไฟล์แบบเดียวกัน' })}
    <div class="page lm">
      <label class="btn primary block file-btn">📥 นำเข้าไฟล์ CSV จาก Garmin Golf<input type="file" accept=".csv,text/csv,text/plain,text/comma-separated-values" data-change="file" hidden></label>
      ${importHtml()}
      ${howTo}
      ${all.length ? `
      <div class="row between wrap">
        <div class="chips">${PERIODS.map((p) => `<button type="button" class="chip${p.v === period ? ' on' : ''}" data-act="period" data-v="${p.v}">${p.th}</button>`).join('')}</div>
        <div class="chips">
          <button type="button" class="chip${hand === 'right' ? ' on' : ''}" data-act="hand" data-v="right">ถนัดขวา</button>
          <button type="button" class="chip${hand === 'left' ? ' on' : ''}" data-act="hand" data-v="left">ถนัดซ้าย</button>
          ${SPEED_UNITS.map((u) => `<button type="button" class="chip${su === u.v ? ' on' : ''}" data-act="speed" data-v="${u.v}">${u.th}</button>`).join('')}
        </div>
      </div>
      <p class="note">${chosen.length ? `${groupSessions(chosen).length} ครั้ง · ${shots.length} ช็อต · ช็อตพลาด ${Math.round(misAll * 100)}%` : 'ไม่มีการซ้อมในช่วงนี้'}</p>

      <h2>ควรแก้อะไรก่อน</h2>
      ${issues.length ? issues.slice(0, 4).map((i, n) => `<div class="card focus${n === 0 ? ' first' : ''}">
        <div><span class="rank">${n + 1}</span> <b>${esc(i.th)}</b></div>
        <ul class="find">${i.detail.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      </div>`).join('') : `<div class="card ok small">${shots.length < 10 ? 'ต้องมีอย่างน้อย 10 ช็อตในช่วงที่เลือก' : 'ไม่พบจุดที่ต้องแก้เด่นชัด ลองตั้งเป้าที่ยากขึ้นด้วยแบบฝึกคุมระยะ'}</div>`}

      ${recDrills.length ? `<h2>แบบฝึกที่แนะนำ</h2>
      <div class="drills">${recDrills.map((d) => drillCard(d, { history: drillHistory(practice, d.id) })).join('')}</div>` : ''}

      <h2>ระยะไม้และความสม่ำเสมอ</h2>
      ${clubRows()}

      ${plotClubs.length ? `<h2>จุดตกของลูก</h2>
      <div class="chips">${plotClubs.map((s) => `<button type="button" class="chip${s.key === selKey ? ' on' : ''}" data-act="club" data-v="${esc(s.key)}">${esc(s.label)}</button>`).join('')}</div>
      <div class="card">${scatter()}${trend()}</div>` : ''}

      <h2>เซสชันที่นำเข้า</h2>
      ${groups.map((g) => `<div class="card lm-session row between">
        <div><b>${esc(fmtDate(g.date))}</b> <span class="small muted">${g.shots} ช็อต${g.file ? ` · ${esc(g.file)}` : ''}</span></div>
        <button type="button" class="mini danger" data-act="delSession" data-k="${esc(g.key)}">ลบ</button>
      </div>`).join('')}` : ''}
    </div>`,
    actions: {
      ...clipActions(),
      file: async (el) => {
        const f = el.files?.[0];
        el.value = '';
        if (!f) return;
        if (f.size > MAX_FILE) { toast('ไฟล์ใหญ่เกิน 5 MB'); return; }
        let parsed;
        try { parsed = readLaunchFile(await f.text()); } catch (err) { toast(err.message || 'อ่านไฟล์ไม่ได้'); return; }
        const bag = st.bagClubs().filter((c) => c.category !== 'putter');
        const clubMap = {};
        for (const r of parsed.rows) {
          const raw = rawClub(r, parsed.cols);
          if (!(raw in clubMap)) clubMap[raw] = guessClub(raw, bag);
        }
        const fileDate = f.name.match(/(20\d{2})-(\d{2})-(\d{2})/)?.[0] ?? null;
        IMP = { file: f.name, parsed, units: { ...parsed.units }, clubMap, fileDate, date: parsed.date || fileDate || st.todayLocal() };
        ctx.rerender();
      },
      impDate: (el) => { if (IMP) IMP.date = el.value || st.todayLocal(); },
      impDist: (el) => { if (IMP) { IMP.units.dist = el.dataset.v; ctx.rerender(); } },
      impSpeed: (el) => { if (IMP) { IMP.units.speed = el.dataset.v; ctx.rerender(); } },
      impClub: (el) => { if (IMP) { IMP.clubMap[el.dataset.raw] = el.value === '-' ? null : el.value; ctx.rerender(); } },
      impCancel: () => { IMP = null; ctx.rerender(); },
      impSave: async (el) => {
        if (!IMP || el.disabled) return;
        const shotsIn = toShots(IMP.parsed, IMP.units, IMP.clubMap);
        if (!shotsIn.length) { toast('ไม่มีช็อตที่จะบันทึก'); return; }
        const recs = buildRecords({ shots: shotsIn, clubMap: IMP.clubMap, date: IMP.date, file: IMP.file, uid: st.uid, now: st.nowIso() });
        if (all.some((p) => sessionKey(p) === recs[0].launch.sig)) { toast('นำเข้าไฟล์นี้ไปแล้ว'); return; }
        el.disabled = true;
        await st.commit(recs.map((r) => ({ store: 'practice', put: r })));
        IMP = null;
        toast(`บันทึก ${shotsIn.length} ช็อตแล้ว`);
        ctx.rerender();
      },
      period: async (el) => { await st.setSetting('launch_period', el.dataset.v); ctx.rerender(); },
      hand: async (el) => { await st.setSetting('hand', el.dataset.v); ctx.rerender(); },
      speed: async (el) => { await st.setSetting('speed_unit', el.dataset.v); ctx.rerender(); },
      club: async (el) => { await st.setSetting('launch_club', el.dataset.v); ctx.rerender(); },
      delSession: async (el) => {
        const recs = all.filter((p) => sessionKey(p) === el.dataset.k);
        if (!recs.length || !confirm(`ลบเซสชันนี้ (${recs.reduce((a, p) => a + sessionShots(p).length, 0)} ช็อต)?`)) return;
        await st.commit(recs.map((p) => ({ store: 'practice', del: p.id })));
        ctx.rerender();
        toast('ลบเซสชันแล้ว', { label: 'เลิกทำ', run: async () => { await st.commit(recs.map((p) => ({ store: 'practice', put: p }))); ctx.rerender(); } });
      },
    },
  };
}
