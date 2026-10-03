// โค้ชพัฒนาเกม: แยกว่าสโตรกเกินพาร์มาจากไหน เทียบกับ "งบสโตรก" ของเป้าหมาย แล้วเสนอโฟกัสรอบหน้าและแผนซ้อม
// คำนวณล้วน ๆ จากข้อมูลที่จดในเครื่อง (ไม่ใช้ AI ภายนอก) ทดสอบด้วย node:test ได้
import { ME, playerHoleScore } from './group.js';
import { shotPath, shotDistances, offLine, sideOf, landOf } from './shotgeo.js';
import { TROUBLE_ENDS } from './constants.js';

export { GPS_MAX_ACC, shotDistances } from './shotgeo.js';

// ---------- เป้าหมาย ----------
// งบสโตรกเกินพาร์ต่อ 18 หลุม (พาร์ 72) แบ่งตามที่มา — รวมกันแล้วไม่เกินสกอร์เป้าหมาย
// เป็นค่าวางแผนโดยประมาณสำหรับนักกอล์ฟสมัครเล่น ไม่ใช่สถิติมาตรฐาน
export const GOALS = [
  {
    v: '110', th: 'ต่ำกว่า 110', score: 109,
    budget: { pen: 5, long: 7, miss: 16, short: 4, putt: 5, save: 1 },
    stats: { fir: 25, gir: 2, putts: 40, three: 5, scramble: 8, pen: 5, blow: 10 },
  },
  {
    v: '100', th: 'ต่ำกว่า 100', score: 99,
    budget: { pen: 3, long: 4, miss: 15, short: 2, putt: 3, save: 2 },
    stats: { fir: 35, gir: 3, putts: 37, three: 3, scramble: 15, pen: 3, blow: 6 },
  },
  {
    v: '90', th: 'ต่ำกว่า 90', score: 89,
    budget: { pen: 2, long: 2, miss: 12, short: 1, putt: 2, save: 3 },
    stats: { fir: 45, gir: 6, putts: 35, three: 2, scramble: 25, pen: 2, blow: 3 },
  },
  {
    v: '80', th: 'ต่ำกว่า 80', score: 79,
    budget: { pen: 1, long: 1, miss: 8, short: 0.5, putt: 1, save: 4.5 },
    stats: { fir: 55, gir: 10, putts: 33, three: 1, scramble: 40, pen: 1, blow: 1 },
  },
  {
    v: 'par', th: 'เล่นพาร์', score: 72,
    budget: { pen: 0.5, long: 0.5, miss: 6, short: 0.3, putt: 0.5, save: 7.8 },
    stats: { fir: 65, gir: 12, putts: 29, three: 0.5, scramble: 55, pen: 0.5, blow: 0 },
  },
];

export const goalOf = (v) => GOALS.find((g) => g.v === v) ?? GOALS[2];
export const budgetOver = (goal) => ['pen', 'long', 'miss', 'short', 'putt'].reduce((a, k) => a + goal.budget[k], 0) - goal.budget.save;

// เป้าถัดไปที่ต่ำกว่าค่าเฉลี่ยปัจจุบัน
export function suggestGoal(avgScore) {
  if (avgScore == null) return '100';
  if (avgScore >= 110) return '110';
  if (avgScore >= 100) return '100';
  if (avgScore >= 90) return '90';
  if (avgScore >= 80) return '80';
  return 'par';
}

// ---------- ที่มาของสโตรก ----------

export const LEAKS = [
  { k: 'pen', th: 'ลูกโทษ', sub: 'OB ลูกหาย ลงน้ำ ลูกเล่นไม่ได้', icon: '🚫' },
  { k: 'long', th: 'ช็อตยาวเกินจำนวน', sub: 'ต้องตีช็อตยาวมากกว่าปกติก่อนถึงกรีน เช่น ท็อป ฉึก ติดต้นไม้ต้องตีออก', icon: '🏌️' },
  { k: 'miss', th: 'พลาดกรีน', sub: 'ช็อตเข้ากรีนไม่ขึ้น ต้องชิพ/พิทช์/บังเกอร์เพิ่ม 1 ครั้ง', icon: '🎯' },
  { k: 'short', th: 'ลูกสั้นไม่จบในครั้งเดียว', sub: 'ชิพ/พิทช์/บังเกอร์ครั้งที่ 2 ขึ้นไปในหลุมเดียวกัน', icon: '⛳' },
  { k: 'putt', th: 'พัตเกิน 2 ครั้ง', sub: 'สโตรกจาก 3-พัตขึ้นไป', icon: '🟢' },
];
export const SAVE = { k: 'save', th: 'สโตรกที่ได้คืน', sub: '1-พัต ชิพลง หรือถึงกรีนเร็วกว่าปกติ', icon: '✨' };

// พื้นที่ของช็อต: ช็อตยาว (ทีออฟ/เข้ากรีน/แก้สถานการณ์) · ลูกสั้นรอบกรีน · พัต
export function shotArea(s) {
  const t = s.shot_type;
  if (t === 'putt' || (!t && s.start_lie === 'green')) return 'putt';
  if (t === 'chip' || t === 'pitch') return 'short';
  if (t === 'bunker') return Number(s.distance_before) > 50 ? 'long' : 'short';
  if (!t && s.start_lie === 'fringe') return 'short';
  return 'long';
}

// ข้อเท็จจริงของหลุมที่จดรายช็อต คืน null ถ้าข้อมูลไม่พอ (ไม่มีพาร์ ยังไม่จบ ไม่รู้ว่าจบอย่างไร)
export function holeFacts(hole, shots, pens) {
  const par = Number.isInteger(hole.par) && hole.par > 0 ? hole.par : null;
  const list = shots.filter((s) => s.counted !== false).sort((a, b) => a.sequence - b.sequence);
  if (!par || hole.status !== 'done' || !list.length) return null;
  const areas = list.map(shotArea);
  const P = areas.filter((a) => a === 'putt').length;
  if (!P && !list.some((s) => s.holed) && hole.finish !== 'picked_up') return null;
  const L = areas.filter((a) => a === 'long').length;
  const S = areas.filter((a) => a === 'short').length;
  const pen = pens.reduce((a, p) => a + (Number(p.strokes) || 0), 0);
  const total = list.length + pen;
  const reg = par - 2;
  const firstPutt = areas.indexOf('putt');
  const gir = (firstPutt >= 0 ? firstPutt : list.length) + pen <= reg;

  let fir = null;
  if (par >= 4) {
    const tee = list[0];
    const end = tee.end_lie ?? list[1]?.start_lie ?? null;
    if (pens.some((p) => p.related_shot_id_optional === tee.id)) fir = false;
    else if (end === 'fairway') fir = true;
    else if (end === 'rough' || end === 'bunker' || TROUBLE_ENDS.includes(end)) fir = false;
  }
  const longExtra = L - reg;
  return {
    hole, par, total, over: total - par, putts: P, gir, fir,
    upDown: gir ? null : total <= par,
    shots: list, areas, pens,
    leak: {
      pen,
      long: Math.max(0, longExtra),
      miss: S > 0 ? 1 : 0,
      short: Math.max(0, S - 1),
      putt: Math.max(0, P - 2),
      save: Math.max(0, -longExtra) + Math.max(0, 2 - P),
    },
  };
}

// ---------- ช่วยคำนวณ ----------

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const per18 = (sum, n) => (n ? (sum * 18) / n : null);
const share = (n, d) => (d ? n / d : null);
const pctTxt = (x) => `${Math.round(x * 100)}%`;
const toMeters = (v, unit) => (v == null || v === '' ? null : Number(v) * (unit === 'yd' ? 0.9144 : 1));

function countBy(items, fn) {
  const m = new Map();
  for (const it of items) {
    const k = fn(it);
    if (k == null) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

// ---------- วิเคราะห์ ----------

export const STAT_DEFS = [
  { k: 'fir', th: 'ทีออฟออกแฟร์เวย์', unit: '%', better: 'high', hint: 'หลุมพาร์ 4–5' },
  { k: 'gir', th: 'ออนกรีนตามพาร์', unit: '/18', better: 'high', hint: 'GIR' },
  { k: 'putts', th: 'จำนวนพัต', unit: '/18', better: 'low' },
  { k: 'three', th: '3-พัต', unit: '/18', better: 'low' },
  { k: 'scramble', th: 'เก็บพาร์หลังพลาดกรีน', unit: '%', better: 'high', hint: 'อัพแอนด์ดาวน์' },
  { k: 'pen', th: 'ลูกโทษ', unit: '/18', better: 'low' },
  { k: 'blow', th: 'หลุมดับเบิ้ลขึ้นไป', unit: '/18', better: 'low' },
];

// simIssues = ปัญหาจากเครื่องซ้อม (launch.js simSummary().issues) ใช้ร่วมจัดแผนซ้อมและโฟกัสรอบหน้า
// simDriver = ไดรเวอร์จากเครื่องซ้อม (launch.js driverProfile) ใช้ร่วมกับทีออฟในสนาม
// pinsOf(round, hole) → { tee, green } หมุดที่ยืนยันแล้ว ใช้หาทิศและจุดตกของทีออฟ · fmt(m) แสดงระยะในหน่วยผู้ใช้
export function analyzeGame({ rounds, holesOf, shotsOf, penaltiesOf, clubLabel = () => null, clubOf = null, practice = [], simIssues = [], simDriver = null, pinsOf = () => null, fmt }, goalV) {
  const clubInfo = clubOf ?? ((id) => (clubLabel(id) ? { id, label: clubLabel(id), category: null } : null));
  const finished = rounds.filter((r) => r.status !== 'playing')
    .sort((a, b) => String(a.played_at || '').localeCompare(String(b.played_at || '')) || String(a.created_at || '').localeCompare(String(b.created_at || '')));

  // ระดับสกอร์: ทุกรอบที่มีสกอร์ของเราอย่างน้อย 9 หลุมที่รู้พาร์ (รวมโหมดจดเร็ว)
  const scoreRounds = [];
  for (const r of finished) {
    const holes = [];
    for (const h of holesOf(r.id)) {
      const sc = playerHoleScore(h, ME, shotsOf(h.id), penaltiesOf(h.id));
      if (!sc?.final || !Number.isInteger(h.par)) continue;
      holes.push({ par: h.par, hc: h.hc_index ?? null, over: sc.strokes - h.par });
    }
    if (holes.length < 9) continue;
    const over = holes.reduce((a, x) => a + x.over, 0);
    scoreRounds.push({
      id: r.id, date: r.played_at, course: r.course_name_snapshot, holes,
      n: holes.length, over, score18: 72 + (over * 18) / holes.length,
    });
  }
  const recent = scoreRounds.slice(-10);
  const avgScore = avg(recent.map((x) => x.score18));
  const goal = goalOf(goalV || suggestGoal(avgScore));
  const last5 = scoreRounds.slice(-5), prev5 = scoreRounds.slice(-10, -5);
  const trend = last5.length >= 3 && prev5.length >= 3 ? avg(last5.map((x) => x.score18)) - avg(prev5.map((x) => x.score18)) : null;
  const recentHoles = recent.flatMap((x) => x.holes);
  const byPar = [3, 4, 5].map((p) => {
    const hs = recentHoles.filter((h) => h.par === p);
    return { par: p, n: hs.length, avgOver: avg(hs.map((h) => h.over)) };
  });
  const blowCount = recentHoles.filter((h) => h.over >= 2).length;
  const hard = recentHoles.filter((h) => h.hc != null && h.hc <= 6);
  const easy = recentHoles.filter((h) => h.hc != null && h.hc > 6);

  // ระดับช็อต: 10 รอบล่าสุดที่จดรายช็อต
  const shotRounds = finished.filter((r) => r.shot_logging !== false).slice(-10);
  const shotRoundIds = shotRounds.map((r) => r.id);
  const facts = [];
  let holesLogged = 0;
  for (const r of shotRounds) {
    for (const h of holesOf(r.id)) {
      const shots = shotsOf(h.id);
      if (!shots.length) continue;
      holesLogged++;
      const f = holeFacts(h, shots, penaltiesOf(h.id));
      if (f) facts.push(Object.assign(f, { pins: pinsOf(r, h) ?? null }));
    }
  }
  const n = facts.length;
  const sum = (k) => facts.reduce((a, f) => a + f.leak[k], 0);
  const leaks = [...LEAKS, SAVE].map((d) => {
    const yours = per18(sum(d.k), n);
    const target = goal.budget[d.k];
    const gap = yours == null ? null : d.k === 'save' ? target - yours : yours - target;
    return { ...d, yours, target, gap };
  });
  const ranked = leaks.filter((l) => l.gap != null && l.gap >= 0.5).sort((a, b) => b.gap - a.gap);
  const overShots = per18(facts.reduce((a, f) => a + f.over, 0), n);

  const firKnown = facts.filter((f) => f.fir != null);
  const missed = facts.filter((f) => !f.gir);
  const stats = {
    fir: firKnown.length >= 4 ? share(firKnown.filter((f) => f.fir).length, firKnown.length) * 100 : null,
    gir: n ? per18(facts.filter((f) => f.gir).length, n) : null,
    putts: n ? per18(facts.reduce((a, f) => a + f.putts, 0), n) : null,
    three: n ? per18(facts.filter((f) => f.putts >= 3).length, n) : null,
    scramble: missed.length >= 4 ? share(missed.filter((f) => f.upDown).length, missed.length) * 100 : null,
    pen: n ? per18(sum('pen'), n) : null,
    blow: recentHoles.length ? per18(blowCount, recentHoles.length) : null,
  };
  const statRows = STAT_DEFS.map((d) => {
    const yours = stats[d.k];
    const target = goal.stats[d.k];
    let status = null;
    if (yours != null) {
      const diff = d.better === 'high' ? yours - target : target - yours;
      const tol = d.unit === '%' ? 5 : 1;
      status = diff >= 0 ? 'ok' : diff >= -tol ? 'near' : 'far';
    }
    return { ...d, yours, target, status };
  });

  const ctx = { facts, clubLabel, goal, stats };
  let pool = ranked.map((l) => ({ ...l, ...diagnose(l.k, ctx) }));
  // ทีออฟ/ไดรเวอร์เป็นอีกมุมของสโตรกที่หาย: ถ้าเสียมากพอให้ขึ้นเป็นจุดที่ควรแก้ด้วย
  // ลูกโทษส่วนใหญ่มาจากทีออฟ → รวมเป็นเรื่องเดียวกัน ไม่แสดงซ้ำ
  const tee = teeAnalysis(facts, { clubOf: clubInfo, goal, driver: simDriver, ...(fmt ? { fmt } : {}) });
  if (tee.enough && tee.gap >= 0.5) {
    const pen = pool.find((l) => l.k === 'pen');
    const merge = pen && tee.penStrokes >= 0.6 * sum('pen');
    if (merge) pool = pool.filter((l) => l !== pen);
    pool.push({
      k: 'tee', th: 'ทีออฟ / ไดรเวอร์', icon: '🏌️', yours: tee.fir, target: goal.stats.fir,
      gap: Math.max(tee.gap, merge ? pen.gap : 0), cue: tee.cue, drills: tee.drills,
      find: [...(merge ? pen.find.filter((x) => x.startsWith('สาเหตุ')) : []), ...tee.find.filter((x) => !/^(ทีออฟลงแฟร์เวย์|หลุมที่ทีออฟพลาด)/.test(x))],
      line: `ทีออฟลงแฟร์เวย์ ${tee.fir == null ? '–' : `${Math.round(tee.fir)}%`} (เป้า ${goal.stats.fir}%)${tee.missCost > 0 ? ` · หลุมที่ทีออฟพลาดเสียเพิ่มเฉลี่ย ${tee.missCost.toFixed(1)} สโตรก` : ''}`,
    });
    pool.sort((a, b) => b.gap - a.gap);
  }
  const focus = pool.slice(0, 3);
  const teeFocused = focus.some((f) => f.k === 'tee');
  const cues = focus.map((f) => f.cue).filter(Boolean);
  // ใช้ไม้อื่นในหลุมเสี่ยงแล้ว หลุมที่ยังใช้ไดรเวอร์ก็ให้เล็งเผื่อฝั่งที่พลาดด้วย
  if (teeFocused && tee.cue2) cues.splice(cues.indexOf(tee.cue) + 1, 0, tee.cue2);
  if (stats.blow != null && stats.blow > goal.stats.blow + 1 && cues.length < 3) {
    const hardAvg = hard.length >= 6 ? avg(hard.map((h) => h.over)) : null;
    const easyAvg = easy.length >= 6 ? avg(easy.map((h) => h.over)) : null;
    cues.push({
      text: 'หลุมยาก (HC 1–6) เล่นเพื่อโบกี้ ไม่ต้องฝืนพาร์ เจอปัญหาให้ออกทางที่ปลอดภัยก่อน',
      why: hardAvg != null && easyAvg != null
        ? `หลุมยากคุณเฉลี่ย ${fmtSigned(hardAvg)} หลุมอื่น ${fmtSigned(easyAvg)} · ดับเบิ้ลขึ้นไป ${stats.blow.toFixed(1)} หลุม/รอบ`
        : `ดับเบิ้ลขึ้นไป ${stats.blow.toFixed(1)} หลุม/รอบ (เป้า ${goal.stats.blow})`,
    });
  }

  if (!teeFocused && tee.problem && tee.cue && cues.length < 3) cues.push(tee.cue);
  else if (!teeFocused) {
    const sc = simCue(simIssues, simDriver);
    if (sc && cues.length < 3) cues.push(sc);
  }

  const plan = buildPlan(focus, goal, practice, simIssues, tee);
  const confidence = n >= 54 ? 'good' : n >= 18 ? 'fair' : n >= 9 ? 'low' : 'none';
  return {
    goal, avgScore, best: recent.length ? Math.min(...recent.map((x) => x.score18)) : null, trend,
    scoreRounds, recentCount: recent.length, byPar,
    shot: { holes: n, holesLogged, rounds: shotRoundIds.length, overShots, confidence },
    leaks, ranked, stats: statRows, focus, cues: cues.slice(0, 3), plan, tee,
  };
}

export const fmtSigned = (x, d = 1) => (x == null ? '–' : `${x > 0 ? '+' : ''}${x.toFixed(d)}`);

// ---------- วินิจฉัยสาเหตุจากแท็กที่จด ----------

function faults(shots) {
  const m = countBy(shots, (s) => (['fat', 'thin', 'top'].includes(s.contact) ? s.contact : null));
  const th = { fat: 'ฉึก', thin: 'บาง', top: 'ท็อป' };
  const known = shots.filter((s) => s.contact != null).length;
  return { m, known, text: [...m].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${th[k]} ${c}`).join(' · ') };
}

// ฝั่งที่พลาดบ่อย ต้องมีอย่างน้อย 4 ครั้งและเกิน 60%
function side(shots, key, a, b) {
  const na = shots.filter((s) => s[key] === a).length;
  const nb = shots.filter((s) => s[key] === b).length;
  const t = na + nb;
  if (t < 4) return null;
  if (na / t >= 0.6) return { v: a, rate: na / t, n: t };
  if (nb / t >= 0.6) return { v: b, rate: nb / t, n: t };
  return { v: null, n: t };
}

function diagnose(k, { facts, clubLabel, stats }) {
  const find = [];
  let cue = null;
  let drills = [];
  if (k === 'pen') {
    const pens = facts.flatMap((f) => f.pens.map((p) => ({ p, f })));
    const reasons = countBy(pens, ({ p }) => p.reason);
    const th = { ob_lost: 'OB/ลูกหาย', penalty_area: 'น้ำ/พื้นที่ลงโทษ', unplayable: 'ลูกเล่นไม่ได้', other: 'อื่น ๆ' };
    if (reasons.size) find.push(`สาเหตุ: ${[...reasons].sort((a, b) => b[1] - a[1]).map(([r, c]) => `${th[r] || r} ${c}`).join(' · ')}`);
    const linked = pens.map(({ p, f }) => f.shots.find((s) => s.id === p.related_shot_id_optional)).filter(Boolean);
    const teeShots = linked.filter((s) => s.sequence === 1);
    if (linked.length >= 3) find.push(`${pctTxt(teeShots.length / linked.length)} เกิดจากช็อตทีออฟ`);
    const penClub = [...countBy(teeShots, (s) => s.club_id)].sort((a, b) => b[1] - a[1])[0];
    if (penClub && penClub[1] >= 2) find.push(`ทีออฟที่โดนลูกโทษส่วนใหญ่ใช้ ${clubLabel(penClub[0]) || 'ไม้ที่ไม่ระบุ'} (${penClub[1]} ครั้ง)`);
    const alt = bestTeeClub(facts, clubLabel, penClub?.[0]);
    cue = alt
      ? { text: `หลุมที่มี OB/น้ำ ทีออฟด้วย ${alt.label} แล้วเล็งฝั่งที่ปลอดภัย`, why: `${alt.label} ออกแฟร์เวย์ ${pctTxt(alt.rate)} (${alt.n} หลุม)` }
      : { text: 'หลุมที่มี OB/น้ำ เลือกไม้ที่มั่นใจที่สุด ไม่ต้องไกลที่สุด และเล็งฝั่งที่ปลอดภัย', why: 'ลูกโทษแต่ละครั้งเสียอย่างน้อย 1 สโตรกทันที' };
    drills = ['tee-gate', 'tee-club-test', 'strategy-range-round'];
  } else if (k === 'long') {
    const long = facts.flatMap((f) => f.shots.filter((s, i) => f.areas[i] === 'long'));
    const fl = faults(long);
    if (fl.m.size) find.push(`ช็อตยาวที่สัมผัสไม่ดี: ${fl.text} (จาก ${fl.known} ช็อตที่ระบุการสัมผัส)`);
    const rec = long.filter((s) => s.shot_type === 'recovery').length;
    if (rec) find.push(`ต้องตีแก้สถานการณ์ ${per18(rec, facts.length).toFixed(1)} ครั้ง/รอบ`);
    if (stats.fir != null) find.push(`ทีออฟออกแฟร์เวย์ ${Math.round(stats.fir)}%`);
    const topFault = [...fl.m].sort((a, b) => b[1] - a[1])[0];
    cue = rec >= 2
      ? { text: 'ติดปัญหา: เอาลูกกลับแฟร์เวย์ก่อน อย่าเสี่ยงช็อตฮีโร่ผ่านต้นไม้', why: `ช็อตแก้สถานการณ์ ${rec} ครั้งในข้อมูลที่ใช้` }
      : topFault && topFault[1] >= 3
        ? { text: 'ช็อตยาวจากรัฟหรือไลไม่ดี เลือกไม้ที่ตีโดนง่าย (ไฮบริด/เหล็กสั้น) และสวิง 3/4', why: `พบ ${fl.text}` }
        : { text: 'ช็อตยาว: เลือกไม้ที่ตีโดนแน่นอน มากกว่าไม้ที่ไกลที่สุด', why: 'ลดช็อตเสียเปล่าก่อนถึงกรีน' };
    drills = topFault && topFault[1] >= 3 ? ['contact-line', 'contact-half', 'tee-gate'] : ['tee-gate', 'contact-half', 'contact-line'];
  } else if (k === 'miss') {
    // ช็อตเข้ากรีน = ช็อตยาวลูกสุดท้ายของหลุม
    const appr = facts.map((f) => {
      const i = f.areas.lastIndexOf('long');
      return i >= 0 ? { s: f.shots[i], gir: f.gir } : null;
    }).filter(Boolean);
    const miss = appr.filter((a) => !a.gir).map((a) => a.s);
    const dist = side(miss, 'distance_result', 'short', 'long');
    const dir = side(miss, 'direction', 'left', 'right');
    if (dist?.v) find.push(`ช็อตเข้ากรีนที่พลาด ออก${dist.v === 'short' ? 'สั้น' : 'ยาว'} ${pctTxt(dist.rate)} (${dist.n} ครั้งที่ระบุระยะ)`);
    if (dir?.v) find.push(`พลาดไปทาง${dir.v === 'left' ? 'ซ้าย' : 'ขวา'} ${pctTxt(dir.rate)} (${dir.n} ครั้งที่ระบุทิศ)`);
    const lieRate = (lie) => {
      const xs = appr.filter((a) => a.s.start_lie === lie);
      return xs.length >= 4 ? { rate: share(xs.filter((a) => a.gir).length, xs.length), n: xs.length } : null;
    };
    const fw = lieRate('fairway'), rough = lieRate('rough');
    if (fw && rough) find.push(`ออนกรีนจากแฟร์เวย์ ${pctTxt(fw.rate)} · จากรัฟ ${pctTxt(rough.rate)}`);
    const fl = faults(miss);
    if (fl.m.size) find.push(`ช็อตที่พลาดกรีน สัมผัสไม่ดี: ${fl.text}`);
    if (dist?.v === 'short') cue = { text: 'ช็อตเข้ากรีน เลือกไม้ยาวขึ้น 1 เบอร์ แล้วสวิงสบาย ๆ', why: `พลาดสั้น ${pctTxt(dist.rate)}` };
    else if (dist?.v === 'long') cue = { text: 'ช็อตเข้ากรีน เล็งกลางกรีนและเผื่อระยะให้สั้นลง', why: `พลาดยาว ${pctTxt(dist.rate)}` };
    else if (dir?.v) cue = { text: `เล็งกลางกรีนเยื้องไปทาง${dir.v === 'right' ? 'ซ้าย' : 'ขวา'} ไม่เล็งธง`, why: `พลาดออก${dir.v === 'left' ? 'ซ้าย' : 'ขวา'} ${pctTxt(dir.rate)}` };
    else cue = { text: 'ช็อตเข้ากรีน เล็งกลางกรีน ไม่เล็งธง', why: 'ขึ้นกรีนได้บ่อยขึ้นแม้จะไกลธงกว่า' };
    drills = ['approach-ladder', 'approach-center'];
  } else if (k === 'short') {
    const short = facts.flatMap((f) => f.shots.filter((s, i) => f.areas[i] === 'short'));
    const notOn = short.filter((s) => s.end_lie && !['green', 'holed'].includes(s.end_lie));
    if (short.length) find.push(`ลูกสั้นที่ไม่ขึ้นกรีน ${notOn.length} จาก ${short.filter((s) => s.end_lie).length} ครั้งที่ระบุจุดจบ`);
    const fl = faults(short);
    if (fl.m.size) find.push(`สัมผัสไม่ดี: ${fl.text}`);
    const bunkerMulti = facts.filter((f) => f.shots.filter((s) => s.shot_type === 'bunker').length >= 2).length;
    if (bunkerMulti) find.push(`หลุมที่ต้องตีบังเกอร์ 2 ครั้งขึ้นไป: ${bunkerMulti} หลุม`);
    cue = bunkerMulti >= 2
      ? { text: 'บังเกอร์ข้างกรีน: เป้าหมายแรกคือออกให้ได้ในครั้งเดียว ไม่ต้องใกล้ธง', why: `ติดบังเกอร์ซ้ำ ${bunkerMulti} หลุม` }
      : { text: 'รอบกรีน เลือกช็อตที่ง่ายสุด: พัตได้ให้พัต กลิ้งได้อย่าลอย', why: 'ลดโอกาสชิพครั้งที่สอง' };
    drills = bunkerMulti >= 2 ? ['bunker-line', 'short-landing', 'short-updown'] : ['short-landing', 'short-updown', 'bunker-line'];
  } else if (k === 'putt') {
    const first = facts.map((f) => {
      const i = f.areas.indexOf('putt');
      return i >= 0 ? { s: f.shots[i], putts: f.putts } : null;
    }).filter(Boolean);
    const withDist = first.map((x) => ({ ...x, m: toMeters(x.s.distance_before, x.s.distance_unit) })).filter((x) => x.m != null);
    const far = withDist.filter((x) => x.m >= 6);
    if (far.length >= 4) find.push(`พัตแรกไกล 6 ม.ขึ้นไป: 3-พัต ${pctTxt(share(far.filter((x) => x.putts >= 3).length, far.length))} (${far.length} หลุม)`);
    const three = facts.filter((f) => f.putts >= 3).length;
    find.push(`3-พัต ${three} ครั้ง ใน ${facts.length} หลุม`);
    const putts = facts.flatMap((f) => f.shots.filter((s, i) => f.areas[i] === 'putt' && !s.holed));
    const lag = side(putts, 'distance_result', 'short', 'long');
    if (lag?.v) find.push(`พัตที่ไม่ลง ออก${lag.v === 'short' ? 'สั้น' : 'ยาว'} ${pctTxt(lag.rate)}`);
    cue = lag?.v === 'short'
      ? { text: 'พัตไกล: ให้ลูกเลยหลุมไป 30–50 ซม.', why: `พัตที่ไม่ลงออกสั้น ${pctTxt(lag.rate)}` }
      : { text: 'พัตแรกเน้นระยะ ให้เหลือไม่เกิน 1 เมตร ไม่ต้องหวังลง', why: `3-พัต ${per18(three, facts.length).toFixed(1)} ครั้ง/รอบ` };
    drills = ['putt-ladder', 'putt-circle'];
  } else if (k === 'save') {
    if (stats.scramble != null) find.push(`เก็บพาร์หลังพลาดกรีนได้ ${Math.round(stats.scramble)}%`);
    const one = facts.filter((f) => f.putts === 1).length;
    find.push(`1-พัต ${per18(one, facts.length).toFixed(1)} ครั้ง/รอบ`);
    cue = { text: 'พัต 1–2 เมตรทำรูทีนเดิมทุกครั้ง แล้วพัตให้มั่นใจ', why: 'พัตสั้นที่ลงคือสโตรกที่ได้คืน' };
    drills = ['putt-circle', 'short-updown'];
  }
  return { find, cue, drills };
}

// ไม้ทีออฟที่ออกแฟร์เวย์บ่อยที่สุด (อย่างน้อย 4 หลุม) ที่ไม่ใช่ไม้ที่ทำลูกโทษ
function bestTeeClub(facts, clubLabel, avoid) {
  const by = new Map();
  for (const f of facts) {
    if (f.fir == null || !f.shots[0].club_id) continue;
    const id = f.shots[0].club_id;
    const x = by.get(id) || { hit: 0, n: 0 };
    x.n++; if (f.fir) x.hit++;
    by.set(id, x);
  }
  const best = [...by].filter(([id, x]) => id !== avoid && x.n >= 4)
    .map(([id, x]) => ({ id, label: clubLabel(id), rate: x.hit / x.n, n: x.n }))
    .sort((a, b) => b.rate - a.rate)[0];
  return best && best.label && best.rate >= 0.4 ? best : null;
}

// ---------- ทีออฟ / ไดรเวอร์ ----------
// ลูกไดรเวอร์ที่พลาดกระจายไปอยู่หลายหมวดด้านบน (ลูกโทษ ช็อตยาวเกิน พลาดกรีนเพราะตีจากรัฟ) จึงรวมดูที่นี่อีกมุมหนึ่ง
// ช็อตแรกของหลุมพาร์ 4–5: ลงแฟร์เวย์ไหม พลาดฝั่งไหน โดนลูกโทษหรือต้องตีออกไหม ไม้ไหนตรงกว่า
// ผลต่อสกอร์ = หลุมที่ทีออฟพลาดเสียมากกว่าหลุมที่ลงแฟร์เวย์เฉลี่ยเท่าไร (เทียบในข้อมูลของคุณเอง)
// driver = ไดรเวอร์จากเครื่องซ้อม (launch.js driverProfile) · null = ไม่มี
export const TEE_MIN = 6;

// เบี่ยงจากแนวแท่นที→กลางกรีนเกินนี้ถือว่า "ลูกเลี้ยวออกทิศ" (ไม่ใช่ลูกตรงที่ระยะไม่พอข้ามอุปสรรค)
const CURVED_M = 20;

export function teeAnalysis(facts, { clubOf = () => null, goal = goalOf('90'), driver = null, fmt = (m) => `${Math.round(m)} ม.` } = {}) {
  const tees = facts.filter((f) => f.par >= 4).map((f) => {
    const s = f.shots[0];
    const pen = f.pens.filter((p) => p.related_shot_id_optional === s.id).reduce((a, p) => a + (Number(p.strokes) || 0), 0);
    const trouble = pen > 0 || TROUBLE_ENDS.includes(s.end_lie) || f.shots[1]?.shot_type === 'recovery';
    const p0 = shotPath(f.shots, f.pins?.tee ?? null, f.pens)[0];
    const line = p0?.start && p0.end && f.pins?.green ? offLine(p0.start, f.pins.green, p0.end) : null;
    const mapSide = line ? sideOf(line.off, true) : null;
    const direction = s.direction ?? (mapSide === 'left' || mapSide === 'right' ? mapSide : null);
    return { s, pen, trouble, fir: f.fir, over: f.over, club: s.club_id ? clubOf(s.club_id) : null, direction, off: line?.off ?? null, landed: !!landOf(s) };
  });
  const n = tees.length;
  const enough = n >= TEE_MIN;
  const perRound = (x) => per18(x, facts.length) ?? 0;
  const known = tees.filter((t) => t.fir != null);
  const fir = known.length >= 4 ? share(known.filter((t) => t.fir).length, known.length) * 100 : null;
  const penStrokes = tees.reduce((a, t) => a + t.pen, 0);
  const penHoles = tees.filter((t) => t.pen > 0).length;
  const out = tees.filter((t) => t.trouble && !t.pen).length;
  const misses = tees.filter((t) => t.fir === false || t.trouble);
  const dir = side(misses, 'direction', 'left', 'right');
  const fl = faults(tees.map((t) => t.s));
  const badContact = [...fl.m.values()].reduce((a, c) => a + c, 0);
  const spread = {
    n: known.length,
    fw: known.filter((t) => t.fir).length,
    left: misses.filter((t) => t.direction === 'left').length,
    right: misses.filter((t) => t.direction === 'right').length,
  };
  spread.unk = misses.length - spread.left - spread.right;

  // สกอร์เฉลี่ยเทียบพาร์ตามผลทีออฟ
  const grp = (xs) => ({ n: xs.length, avg: avg(xs.map((t) => t.over)) });
  const byResult = {
    fw: grp(tees.filter((t) => t.fir === true && !t.trouble)),
    rough: grp(tees.filter((t) => t.fir === false && !t.trouble)),
    trouble: grp(tees.filter((t) => t.trouble)),
  };
  const fwAvg = byResult.fw.n >= 3 ? byResult.fw.avg : null;
  const missCost = fwAvg != null && misses.length >= 3 ? avg(misses.map((t) => t.over)) - fwAvg : null;
  const cost = missCost != null ? Math.max(0, perRound(misses.reduce((a, t) => a + t.over - fwAvg, 0))) : null;

  // แยกตามไม้ทีออฟ
  const m = new Map();
  for (const t of tees) {
    const key = t.club?.id ?? '';
    if (!m.has(key)) m.set(key, { id: key || null, label: t.club?.label ?? 'ไม่ระบุไม้', category: t.club?.category ?? null, list: [] });
    m.get(key).list.push(t);
  }
  const byClub = [...m.values()].map(({ list, ...c }) => {
    const k = list.filter((t) => t.fir != null);
    return {
      ...c, n: list.length, fir: k.length ? share(k.filter((t) => t.fir).length, k.length) * 100 : null,
      pen: list.filter((t) => t.pen > 0).length, trouble: list.filter((t) => t.trouble).length, avgOver: avg(list.map((t) => t.over)),
    };
  }).sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.n - a.n);
  const drv = byClub.find((c) => c.category === 'driver' && c.n >= 3 && c.fir != null) ?? null;
  const alt = drv
    ? byClub.filter((c) => c.id && c.category !== 'driver' && c.n >= 3 && c.fir != null && c.fir >= drv.fir + 15).sort((a, b) => b.fir - a.fir)[0] ?? null
    : null;

  // สโตรกที่ได้คืนต่อรอบ ถ้าลงแฟร์เวย์ได้ตามเป้า หรือลูกโทษจากทีออฟลดลงเหลือเท่างบ
  const firGap = fir != null ? goal.stats.fir - fir : 0;
  const saveFir = firGap > 0 && missCost > 0 ? (firGap / 100) * perRound(n) * missCost : 0;
  const savePen = Math.max(0, perRound(penStrokes) - goal.budget.pen);
  const gap = enough ? Math.max(saveFir, savePen) : null;
  const simBad = !!driver && ((driver.fw != null && driver.fw < 0.6) || (driver.f2p != null && Math.abs(driver.f2p) >= 4) || (driver.mishit ?? 0) >= 0.15);
  const missSide = dir?.v ?? driver?.side ?? null;
  const problem = (gap != null && gap >= 0.5) || simBad;

  const placed = tees.filter((t) => t.off != null);
  const avgOff = placed.length >= 3 ? avg(placed.map((t) => Math.abs(t.off))) : null;
  const penPlaced = tees.filter((t) => t.pen > 0 && t.landed && t.off != null);
  const penStraight = penPlaced.filter((t) => Math.abs(t.off) < CURVED_M).length;
  const penCurved = penPlaced.length - penStraight;

  const pct = (x) => `${Math.round(x)}%`;
  const th = (v) => (v === 'left' ? 'ซ้าย' : 'ขวา');
  const find = [];
  if (fir != null) find.push(`ทีออฟลงแฟร์เวย์ ${pct(fir)} (เป้า ${goal.stats.fir}%) จาก ${known.length} หลุมพาร์ 4–5`);
  if (drv) find.push(`ไดรเวอร์ ${drv.n} หลุม ลงแฟร์เวย์ ${pct(drv.fir)}${drv.pen ? ` · โดนลูกโทษ ${drv.pen} หลุม` : ''}`);
  if (alt) find.push(`${alt.label} ลงแฟร์เวย์ ${pct(alt.fir)} (${alt.n} หลุม) ตรงกว่าไดรเวอร์`);
  if (dir?.v) find.push(`ทีออฟที่พลาดไปทาง${th(dir.v)} ${pctTxt(dir.rate)} (${dir.n} ครั้งที่ระบุทิศ)`);
  if (penHoles) find.push(`ทีออฟโดนลูกโทษ (OB/น้ำ) ${penHoles} หลุม = ${perRound(penStrokes).toFixed(1)} สโตรก/รอบ`);
  if (penPlaced.length) find.push(`ทีออฟที่โดนลูกโทษ (จากจุดที่ปักบนแผนที่): ลูกตรงแต่ลงอุปสรรค (ระยะไม่พอข้าม/เลยไป) ${penStraight} · ลูกเลี้ยวออกทิศ ${penCurved}`);
  if (avgOff != null) find.push(`จุดที่ทีออฟไปจบ ${placed.length} หลุม: เบี่ยงจากแนวไปกรีนเฉลี่ย ${fmt(avgOff)}`);
  const END_TH = { trees: 'ต้นไม้/ป่า', water: 'ลงน้ำ', ob: 'OB', lost: 'ลูกหาย', unplayable: 'เล่นไม่ได้' };
  const ends = Object.entries(END_TH).map(([k, label]) => [label, tees.filter((t) => t.s.end_lie === k).length]).filter(([, c]) => c);
  if (ends.length) find.push(`ทีออฟที่พลาดหนัก: ${ends.map(([label, c]) => `${label} ${c}`).join(' · ')}`);
  else if (out) find.push(`ทีออฟลงพื้นที่ยากจนต้องตีออก ${out} หลุม`);
  if (fl.m.size) find.push(`ทีออฟที่สัมผัสไม่ดี: ${fl.text}`);
  if (missCost != null && missCost > 0) find.push(`หลุมที่ทีออฟพลาดเสียมากกว่าหลุมที่ลงแฟร์เวย์เฉลี่ย ${missCost.toFixed(1)} สโตรก`);
  if (driver) {
    const bits = [
      driver.fw != null ? `ลงแฟร์เวย์กว้าง 40 หลา ${pctTxt(driver.fw)}` : '',
      driver.shape ? `ลูก${driver.shape} (Face to Path ${driver.f2p > 0 ? '+' : ''}${driver.f2p.toFixed(1)}°)` : '',
      driver.outIn ? `วงสวิง${driver.outIn}` : '',
    ].filter(Boolean);
    if (bits.length) find.push(`เครื่องซ้อม: ไดรเวอร์${bits.join(' · ')}`);
  }

  // ข้อมูลที่ควรจดเพิ่ม
  const hints = [];
  if (n && tees.filter((t) => !t.club).length > n * 0.3) hints.push('ระบุไม้ที่ใช้ทีออฟ เพื่อเทียบไดรเวอร์กับไม้อื่น');
  if (n && known.length < n * 0.7) hints.push('ระบุจุดจบของทีออฟ (แฟร์เวย์/รัฟ/บังเกอร์) ทุกหลุม');
  if (misses.length >= 3 && spread.unk > misses.length / 2) hints.push('ทีออฟที่พลาดแฟร์เวย์ ระบุทิศ (ซ้าย/ขวา) หรือปักจุดที่ลูกไปจบบนแผนที่ แอปจะบอกได้ว่าควรเล็งอย่างไร');
  if (penHoles && penPlaced.length < penHoles) hints.push('ทีออฟที่ลงน้ำ/OB ปักจุดที่ลูกไปบนแผนที่ด้วย จะรู้ว่าพลาดเพราะระยะหรือเพราะลูกเลี้ยว');

  let sideCue = null;
  if (missSide) {
    const r = missSide === 'right';
    // อ้างฝั่งที่ลูกไปจบจริงบนเครื่องซ้อม (ลูกออกซ้ายแล้วโค้งขวาอาจยังจบซ้าย จึงไม่อ้างทิศที่โค้ง)
    const out = driver?.side === 'left' ? driver.missL : driver?.side === 'right' ? driver.missR : null;
    const simWhy = driver?.side ? `เครื่องซ้อม: ไดรเวอร์หลุดแฟร์เวย์ทาง${th(driver.side)}${out != null ? ` ${pctTxt(out)}` : 'บ่อย'}` : '';
    sideCue = {
      text: `ทีออฟ: ตั้งทีฝั่ง${r ? 'ขวา' : 'ซ้าย'}ของแท่น แล้วเล็งไปขอบ${r ? 'ซ้าย' : 'ขวา'}ของแฟร์เวย์`,
      why: [dir?.v ? `ทีออฟที่พลาดไปทาง${th(dir.v)} ${pctTxt(dir.rate)}` : '', driver?.side === missSide ? simWhy : ''].filter(Boolean).join(' · '),
      ...(dir?.v ? {} : { src: 'sim' }),
    };
  }
  let cue = null;
  let cue2 = null;
  if (alt && (drv.pen >= 2 || alt.fir - drv.fir >= 20)) {
    cue = { text: `หลุมแคบหรือมี OB/น้ำ ทีออฟด้วย ${alt.label} แทนไดรเวอร์`, why: `${alt.label} ลงแฟร์เวย์ ${pct(alt.fir)} · ไดรเวอร์ ${pct(drv.fir)}` };
    if (sideCue) cue2 = { ...sideCue, text: `หลุมที่ยังใช้ไดรเวอร์: ${sideCue.text.replace(/^ทีออฟ: /, '')}` };
  } else if (penStraight >= 2 && penStraight >= penCurved) {
    cue = { text: 'หลุมที่มีน้ำหรืออุปสรรคขวาง ดูระยะที่ต้องข้ามบนแผนที่ก่อนตี ถ้าไม่ถึงแน่ ๆ ให้วางลูกก่อนอุปสรรค', why: `ทีออฟลงอุปสรรคทั้งที่ลูกตรง ${penStraight} ครั้ง` };
    if (sideCue) cue2 = sideCue;
  } else if (sideCue) {
    cue = sideCue;
  } else if (badContact >= 3) {
    cue = { text: 'ทีออฟ: ตั้งทีสูงพอ (ครึ่งลูกเหนือหัวไม้) สวิง 80% เน้นโดนกลางหน้าไม้', why: `ทีออฟที่สัมผัสไม่ดี: ${fl.text}` };
  } else if (fir != null && fir < goal.stats.fir) {
    cue = { text: 'ทีออฟ: สวิง 80% ที่คุมได้ ลงแฟร์เวย์สำคัญกว่าระยะ', why: `ทีออฟลงแฟร์เวย์ ${pct(fir)} (เป้า ${goal.stats.fir}%)` };
  }
  if (cue) cue.k = 'tee';
  if (cue2) cue2.k = 'tee';

  const drills = [];
  if (missSide) drills.push('driver-curve');
  if (badContact >= 3 || (driver && ((driver.mishit ?? 0) >= 0.15 || (driver.sf != null && driver.sf < 1.38)))) drills.push('driver-strike');
  if (alt || penHoles >= 2 || penStraight >= 2) drills.push('tee-club-test');
  drills.push('tee-gate');
  if (driver) drills.splice(1, 0, 'sim-driver-window');

  return {
    n, enough, fir, known: known.length, penHoles, penStrokes, penPerRound: perRound(penStrokes), out, dir, spread, placed: placed.length, avgOff, penStraight, penCurved,
    faults: fl, byResult, missCost, cost, byClub, drv, alt, driver, missSide, gap, problem, find, hints, cue, cue2, drills: [...new Set(drills)],
  };
}

// ---------- แบบฝึก ----------
// video = คำค้นคลิปสอนใน YouTube (ภาษาไทย / อังกฤษ)

export const DRILLS = [
  {
    id: 'tee-gate', area: 'ทีออฟ', name: 'ประตูแฟร์เวย์', minutes: 15, attempts: 10,
    why: 'ทีออฟให้อยู่ในเกม ลดลูกโทษจาก OB และน้ำ',
    steps: ['เลือกเป้าในสนามซ้อม 2 จุดห่างกันราว 30 หลา สมมติเป็นขอบแฟร์เวย์', 'ตีไม้ทีออฟ 10 ลูก ทำรูทีนเต็มทุกลูกเหมือนออกรอบจริง', 'นับลูกที่หยุดอยู่ระหว่างเป้าทั้งสอง'],
    pass: 'ผ่าน 6/10 แล้วลองแคบลงเหลือ 25 หลา',
    video: { th: 'สอนกอล์ฟ ไดรเวอร์ ตีให้ตรง ลงแฟร์เวย์', en: 'driver accuracy drill fairway golf' },
  },
  {
    id: 'tee-club-test', area: 'ทีออฟ', name: 'เทียบไม้ทีออฟ', minutes: 15, attempts: 10,
    why: 'หาไม้ทีออฟที่ตรงที่สุดไว้ใช้หลุมแคบหรือหลุมที่มี OB',
    steps: ['ใช้ประตูแฟร์เวย์กว้าง 30 หลา', 'ตีไดรเวอร์ 5 ลูก แล้วเปลี่ยนเป็นแฟร์เวย์วูดหรือไฮบริดอีก 5 ลูก', 'จดว่าไม้ไหนเข้าประตูมากกว่า (บันทึกผลรวมทั้ง 10 ลูก)'],
    pass: 'ใช้ไม้ที่เข้าประตูมากกว่าเป็นไม้ทีออฟหลุมเสี่ยง',
    video: { th: 'กอล์ฟ ทีออฟ ไฮบริด แทน ไดรเวอร์ หลุมแคบ', en: 'when to hit hybrid instead of driver off the tee' },
  },
  {
    id: 'contact-line', area: 'การสัมผัสลูก', name: 'เส้นบนพื้น', minutes: 15, attempts: 10,
    why: 'แก้ฉึก/ท็อป ให้หน้าไม้โดนลูกก่อนแล้วค่อยกินดิน',
    steps: ['ขีดเส้นบนพื้นหรือโรยทรายเป็นเส้น (บนแม็ตวางผ้าขนหนูหลังลูกห่าง 1 ฝ่ามือ)', 'วางลูกบนเส้น ใช้เหล็ก 7 สวิงครึ่งวง', 'ลูกที่ผ่าน = รอยไม้เริ่มหน้าเส้น หรือไม่โดนผ้า'],
    pass: 'ผ่าน 8/10 แล้วขยายเป็นสวิง 3/4',
    video: { th: 'สอนกอล์ฟ แก้ตีฉึก ตีท็อป เหล็ก', en: 'golf line drill low point ball first contact irons' },
  },
  {
    id: 'contact-half', area: 'การสัมผัสลูก', name: 'ครึ่งวงสวิงจับจังหวะ', minutes: 10, attempts: 10,
    why: 'สวิงสั้นลงช่วยให้สัมผัสลูกสม่ำเสมอ ก่อนค่อยเพิ่มความแรง',
    steps: ['ใช้เหล็ก 8 สวิงแค่ระดับสะโพกถึงสะโพก', 'ตี 10 ลูก เน้นจบสวิงนิ่งจนลูกตก', 'นับลูกที่สัมผัสดี (เสียงแน่น ลูกออกตรงเป้า)'],
    pass: 'ผ่าน 8/10',
    video: { th: 'สอนกอล์ฟ สวิงครึ่งวง ฝึกจังหวะ', en: 'half swing drill golf ball striking' },
  },
  {
    id: 'approach-ladder', area: 'ช็อตเข้ากรีน', name: 'บันไดระยะ', minutes: 20, attempts: 9,
    why: 'คุมระยะช็อตเข้ากรีน ลดการตีสั้นหรือยาวเกิน',
    steps: ['เลือกเป้า 3 ระยะ เช่น 100 / 120 / 140 หลา', 'ตีเป้าละ 3 ลูก วนจากใกล้ไปไกล เลือกไม้ใหม่ทุกลูก', 'ลูกที่ผ่าน = ตกห่างเป้าไม่เกิน 10 หลา'],
    pass: 'ผ่าน 6/9',
    video: { th: 'สอนกอล์ฟ คุมระยะ เหล็ก เวดจ์', en: 'golf distance control drill irons wedges' },
  },
  {
    id: 'approach-center', area: 'ช็อตเข้ากรีน', name: 'เล็งกลางกรีน', minutes: 15, attempts: 10,
    why: 'ออนกรีนบ่อยขึ้นด้วยการเล็งจุดที่ปลอดภัยที่สุด',
    steps: ['สมมติกรีนกว้างราว 25 หลารอบเป้า (หรือใช้กรีนในสนามซ้อม)', 'ตีเหล็กที่ใช้บ่อย 10 ลูก ทำรูทีนเต็มทุกลูก', 'นับลูกที่ตกในพื้นที่กรีน'],
    pass: 'ผ่าน 5/10 แล้วลดพื้นที่ลง',
    video: { th: 'กอล์ฟ ช็อตเข้ากรีน เล็งกลางกรีน วางแผน', en: 'aim at the center of the green course management' },
  },
  {
    id: 'short-landing', area: 'ลูกสั้น', name: 'จุดตกลูกชิพ', minutes: 15, attempts: 10,
    why: 'ชิพให้ขึ้นกรีนและหยุดใกล้หลุมในครั้งเดียว',
    steps: ['วางผ้าขนหนูบนกรีน ห่างขอบกรีนเข้าไป 1 ก้าว', 'ชิพจากนอกกรีน 10 ลูก ให้ตกบนผ้าแล้วกลิ้งไปหาหลุม', 'ลูกที่ผ่าน = หยุดห่างหลุมไม่เกิน 1 คันธง (ราว 2 ม.)'],
    pass: 'ผ่าน 5/10',
    video: { th: 'สอนกอล์ฟ ชิพ จุดตกลูก', en: 'chipping landing spot drill golf' },
  },
  {
    id: 'short-updown', area: 'ลูกสั้น', name: 'อัพแอนด์ดาวน์ 9 ลูก', minutes: 20, attempts: 9,
    why: 'ฝึกเก็บพาร์หลังพลาดกรีน ชิพแล้วพัตจบในลูกเดียวกัน',
    steps: ['วางลูก 9 จุดรอบกรีน ไลต่างกัน (แฟร์เวย์ รัฟ ลงเนิน ขึ้นเนิน)', 'แต่ละลูกชิพแล้วพัตจนลง', 'ลูกที่ผ่าน = จบใน 2 สโตรก'],
    pass: 'ผ่าน 3/9 (เป้าต่ำกว่า 90) · 5/9 (เป้าต่ำกว่า 80)',
    video: { th: 'สอนกอล์ฟ ชิพ อัพแอนด์ดาวน์ ลูกสั้น', en: 'up and down short game practice drill' },
  },
  {
    id: 'bunker-line', area: 'บังเกอร์', name: 'เส้นในทราย', minutes: 10, attempts: 10,
    why: 'ออกจากบังเกอร์ข้างกรีนได้ในครั้งเดียว',
    steps: ['ขีดเส้นในทรายตั้งฉากกับเป้า', 'ซ้อมสวิงให้หน้าไม้กระทบทรายหลังเส้นราว 5 ซม. จนทำได้สม่ำเสมอ', 'วางลูกหน้าเส้น 5 ซม. ตี 10 ลูก นับลูกที่ขึ้นกรีน'],
    pass: 'ผ่าน 7/10',
    video: { th: 'สอนกอล์ฟ ตีบังเกอร์ ข้างกรีน', en: 'greenside bunker line in the sand drill' },
  },
  {
    id: 'putt-ladder', area: 'พัตระยะไกล', name: 'บันไดพัตไกล', minutes: 15, attempts: 9,
    why: 'ลด 3-พัต ด้วยการคุมระยะพัตแรก',
    steps: ['วางทีเป้า 3 ระยะ: 6, 9 และ 12 เมตร', 'พัตระยะละ 3 ลูก', 'ลูกที่ผ่าน = หยุดในวงรัศมี 1 เมตรรอบหลุม'],
    pass: 'ผ่าน 6/9',
    video: { th: 'สอนกอล์ฟ พัตต์ระยะไกล คุมน้ำหนัก', en: 'lag putting ladder drill distance control' },
  },
  {
    id: 'putt-circle', area: 'พัตสั้น', name: 'วงกลม 1 เมตร', minutes: 10, attempts: 8,
    why: 'พัตสั้นต้องลง ช่วยเก็บพาร์และปิดหลุม',
    steps: ['วางลูก 8 ลูกรอบหลุมห่าง 1 เมตร เหมือนหน้าปัดนาฬิกา', 'พัตให้ครบทุกลูก ทำรูทีนเดิมทุกครั้ง', 'ผ่านแล้วถอยไปเป็น 1.5 เมตร'],
    pass: 'ผ่าน 7/8',
    video: { th: 'สอนกอล์ฟ พัตต์ระยะสั้น 1 เมตร', en: 'circle drill short putts golf' },
  },
  {
    id: 'strategy-range-round', area: 'วางแผนเกม', name: 'ออกรอบจำลองในสนามซ้อม', minutes: 20, attempts: 9,
    why: 'ฝึกเลือกไม้และเล็งเป้าเหมือนออกรอบจริง ไม่ใช่ตีไม้เดิมซ้ำ ๆ',
    steps: ['นึกภาพ 9 หลุมที่คุ้นเคย ทีออฟด้วยไม้ที่ตั้งใจใช้จริง', 'ช็อตต่อไปเปลี่ยนไม้ตามระยะที่เหลือ ทำรูทีนเต็มทุกลูก', 'นับหลุมที่ทีออฟเข้าแฟร์เวย์ที่สมมติไว้'],
    pass: 'ถึงเป้าแฟร์เวย์ของระดับเป้าหมาย',
    video: { th: 'กอล์ฟ ซ้อมไดร์ฟ แบบออกรอบจำลอง', en: 'play the course on the driving range practice' },
  },
  // ---- ซ้อมกับเครื่องวัด (launch monitor เช่น Garmin R10): เกณฑ์ผ่านอ่านจากตัวเลขบนจอได้ทันที ----
  {
    id: 'sim-smash', area: 'เครื่องซ้อม', name: 'ตีกลางหน้าไม้ (Smash Factor)', minutes: 15, attempts: 10,
    why: 'ตีโดนกลางหน้าไม้ ลูกออกเร็วขึ้นและได้ระยะเพิ่มโดยไม่ต้องสวิงแรงขึ้น',
    steps: ['ใช้เหล็ก 7 สวิงราว 80% ของแรงปกติ', 'ดูค่า Smash Factor ทุกลูกบนจอ', 'นับลูกที่ถึงเกณฑ์: เหล็ก ≥ 1.30 · ไฮบริด ≥ 1.35 · ไดรเวอร์ ≥ 1.42'],
    pass: 'ผ่าน 7/10 แล้วค่อยเพิ่มความเร็ววงสวิง',
    video: { th: 'สอนกอล์ฟ ตีให้โดนกลางหน้าไม้ smash factor', en: 'smash factor drill center contact launch monitor' },
  },
  {
    id: 'sim-face-path', area: 'เครื่องซ้อม', name: 'หน้าไม้เทียบแนวสวิง (Face to Path)', minutes: 15, attempts: 10,
    why: 'Face to Path คือสาเหตุหลักที่ลูกโค้ง ค่าบวกลูกโค้งขวา ค่าลบลูกโค้งซ้าย',
    steps: ['ใช้เหล็ก 7 ตั้งเป้าตรงหน้า', 'ลูกโค้งขวา: วางขวดน้ำหรือหัวไม้นอกลูกเล็กน้อย ฝึกสวิงเข้าจากด้านในแล้วปล่อยให้หน้าไม้ปิดตามธรรมชาติ · ลูกโค้งซ้าย: ทำกลับกัน', 'นับลูกที่ Face to Path อยู่ระหว่าง −2° ถึง +2°'],
    pass: 'ผ่าน 6/10',
    video: { th: 'แก้ลูกสไลซ์ face to path club path', en: 'face to path drill fix slice launch monitor' },
  },
  {
    id: 'sim-start-line', area: 'เครื่องซ้อม', name: 'ออกตัวตรงเป้า (Launch Direction)', minutes: 10, attempts: 10,
    why: 'ทิศที่ลูกออกตัวมาจากหน้าไม้ตอนปะทะเป็นหลัก ถ้าออกซ้าย/ขวาเป็นประจำ ให้แก้การจัดแนวและกริป',
    steps: ['วางไม้ชี้เป้าบนพื้น 2 อัน เป็นแนวเท้าและแนวลูก', 'ตีเหล็กที่ใช้บ่อย 10 ลูก ดูค่า Launch Direction', 'นับลูกที่ออกตัวไม่เกิน ±2°'],
    pass: 'ผ่าน 6/10',
    video: { th: 'กอล์ฟ จัดแนว ตีลูกออกตรงเป้า alignment', en: 'start line drill alignment launch direction golf' },
  },
  {
    id: 'sim-carry-window', area: 'เครื่องซ้อม', name: 'คุมระยะลอยในกรอบ ±5 หลา', minutes: 20, attempts: 9,
    why: 'ช็อตเข้ากรีนต้องการระยะลอยที่คาดได้ ไม่ใช่ระยะไกลสุด',
    steps: ['เลือก 3 ไม้ ตั้งเป้าระยะลอยตามระยะกลางของแต่ละไม้ในหน้าเครื่องซ้อม', 'ตีไม้ละ 3 ลูก สลับไม้ทุกลูก ทำรูทีนเต็มทุกลูก', 'นับลูกที่ระยะลอยห่างเป้าไม่เกิน 5 หลา (5 ม.)'],
    pass: 'ผ่าน 6/9',
    video: { th: 'สอนกอล์ฟ คุมระยะ เหล็ก carry', en: 'carry distance control drill launch monitor' },
  },
  {
    id: 'sim-driver-launch', area: 'เครื่องซ้อม', name: 'ไดรเวอร์ตีขึ้น (Attack Angle)', minutes: 15, attempts: 10,
    why: 'ไดรเวอร์ที่ตีกดลงทำให้สปินสูงและลูกไม่ไป ตีขึ้นเล็กน้อยได้ระยะเพิ่มทันที',
    steps: ['ตั้งทีให้ครึ่งลูกอยู่เหนือหัวไม้ วางลูกตรงส้นเท้าหน้า', 'เอียงไหล่ข้างหลังต่ำลงเล็กน้อยตอนตั้งท่า', 'นับลูกที่ Attack Angle ≥ 0° และสปิน 2,000–3,000 รอบ/นาที'],
    pass: 'ผ่าน 5/10',
    video: { th: 'สอนกอล์ฟ ไดรเวอร์ ตีขึ้น attack angle', en: 'driver attack angle hit up drill' },
  },
  // ---- ไดรเวอร์ ----
  {
    id: 'driver-curve', area: 'ทีออฟ', name: 'แก้ลูกโค้งไดรเวอร์', minutes: 15, attempts: 10,
    why: 'ลูกไดรเวอร์โค้งออกขวา (สไลซ์) หรือซ้าย (ฮุก) เป็นสาเหตุหลักที่ทีออฟหลุดแฟร์เวย์และโดน OB',
    steps: [
      'วางไม้ชี้เป้าบนพื้นชี้ไปที่เป้า ตั้งเท้าและไหล่ให้ขนานกับไม้ (คนที่สไลซ์มักยืนเปิดไปทางซ้ายโดยไม่รู้ตัว)',
      'ลูกโค้งขวา: วางคัฟเวอร์หัวไม้ห่างลูกออกไปด้านนอกราว 1 ฝ่ามือ เยื้องไปข้างหน้าเล็กน้อย ฝึกสวิงเข้าจากด้านในให้ไม่โดนคัฟเวอร์ และหมุนกริปให้ strong ขึ้นเล็กน้อย · ลูกโค้งซ้าย: วางคัฟเวอร์ด้านในแทน',
      'ตีไดรเวอร์ 10 ลูก สวิง 80% นับลูกที่โค้งน้อยจนยังอยู่ในแฟร์เวย์กว้าง 30 หลา',
    ],
    pass: 'ผ่าน 6/10 แล้วค่อยเพิ่มแรงสวิง',
    video: { th: 'สอนกอล์ฟ แก้สไลซ์ ไดรเวอร์', en: 'fix driver slice drill headcover' },
  },
  {
    id: 'driver-strike', area: 'ทีออฟ', name: 'ไดรเวอร์โดนกลางหน้าไม้', minutes: 10, attempts: 10,
    why: 'ลูกที่โดนปลาย โคน หรือต่ำบนหน้าไม้ทำให้ลูกเบี้ยว สปินสูง และเสียระยะ แม้วงสวิงจะดี',
    steps: [
      'พ่นสเปรย์แป้งระงับกลิ่นเท้า หรือขีดปากกาไวท์บอร์ดบนหน้าไม้ไดรเวอร์',
      'ตั้งทีให้ครึ่งลูกอยู่เหนือหัวไม้ ตี 10 ลูก สวิง 80% ดูรอยบนหน้าไม้ทุกลูกแล้วเช็ดออก',
      'นับลูกที่รอยอยู่กลางหน้าไม้ ในวงกว้างราวขนาดลูกกอล์ฟ (โดนปลายไม้ให้ยืนใกล้ขึ้น โดนโคนให้ยืนห่างขึ้น)',
    ],
    pass: 'ผ่าน 6/10',
    video: { th: 'สอนกอล์ฟ ไดรเวอร์ ตีให้โดนกลางหน้าไม้', en: 'driver center strike drill foot spray' },
  },
  {
    id: 'sim-driver-window', area: 'เครื่องซ้อม', name: 'ไดรเวอร์ลงแฟร์เวย์บนเครื่อง', minutes: 15, attempts: 10,
    why: 'วัดผลจริงว่าไดรเวอร์ลงแฟร์เวย์กี่ลูก ด้วยตัวเลขที่ไม่หลอกตา',
    steps: [
      'ตั้งเป้าตรงหน้า ดูค่า Carry Deviation (ระยะเบี่ยงจากแนวเป้า) ทุกลูก',
      'ตีไดรเวอร์ 10 ลูก ทำรูทีนเต็มทุกลูก สวิงแรงเท่าที่คุมได้',
      'นับลูกที่เบี่ยงไม่เกิน 20 หลา (18 ม.) และระยะลอยไม่ต่ำกว่าระยะปกติของคุณเกิน 10%',
    ],
    pass: 'ผ่าน 6/10 แล้วลดกรอบเหลือ 15 หลา',
    video: { th: 'ซ้อมไดรเวอร์ ให้ตรง ลงแฟร์เวย์', en: 'driver dispersion practice launch monitor' },
  },
  {
    id: 'sim-driver-spin', area: 'เครื่องซ้อม', name: 'ไดรเวอร์ลดสปิน (ลูกโด่ง)', minutes: 15, attempts: 10,
    why: 'ตีขึ้นอยู่แล้วแต่ลูกยังโด่งและไม่ไป = สปินสูงเกิน มักมาจากโดนต่ำบนหน้าไม้และการตัดลูก ไม่ใช่การตีกด',
    steps: [
      'ตั้งทีให้สูงขึ้น (ครึ่งลูกเหนือหัวไม้) วางลูกตรงส้นเท้าหน้า ให้โดนกลาง–ค่อนบนของหน้าไม้',
      'พ่นสเปรย์แป้งหรือขีดปากกาบนหน้าไม้ สวิง 80% ดูรอยทุกลูก (รอยต่ำ = สปินขึ้น)',
      'ดูค่า Spin Rate และ Launch Angle บนจอ นับลูกที่สปิน 2,000–3,000 และมุมยิง 11–16°',
    ],
    pass: 'ผ่าน 5/10',
    video: { th: 'ไดรเวอร์ สปินสูง ลูกโด่ง ลดสปิน', en: 'reduce driver spin ballooning drill' },
  },
  {
    id: 'sim-path-in', area: 'เครื่องซ้อม', name: 'แนวสวิงจากด้านใน (Club Path)', minutes: 20, attempts: 10,
    why: 'แนวสวิงตัดจากนอกเข้าใน (Club Path ติดลบมาก) ทำให้ลูกออกซ้ายแล้วโค้งขวา และทำให้ไดรเวอร์สปินสูงเสียระยะ เป็นต้นเหตุ ไม่ใช่การเล็ง',
    steps: [
      'วางไม้ชี้เป้าบนพื้นขนานแนวเป้าที่ปลายเท้า อีกอันวางผ่านหน้าลูกเฉียงไปทางขวาของเป้าราว 10° (แนวที่อยากให้หัวไม้วิ่งผ่าน) · ถนัดซ้ายสลับซ้าย/ขวาทั้งหมด',
      'วางคัฟเวอร์หัวไม้นอกลูกห่าง 1 ฝ่ามือ เริ่มด้วยเหล็ก 7 สวิง 70%: ลงสวิงด้วยสะโพกก่อน ข้อศอกขวาชิดลำตัว ส่งหัวไม้ออกไปตามไม้ที่เฉียง (รู้สึกเหมือนตีไปทางขวาของเป้า)',
      'ดูค่า Club Path บนจอทุกลูก นับลูกที่ถึงเป้าของขั้นนี้ในแผนแก้วงสวิง ผ่านแล้วค่อยเปลี่ยนเป็นไม้ที่ยาวขึ้นทีละเบอร์',
    ],
    pass: 'ผ่าน 7/10 ตามเป้าในแผน แล้วเลื่อนไปเป้าขั้นถัดไป',
    video: { th: 'แก้สไลซ์ แนวสวิง ตัดจากนอกเข้าใน', en: 'fix out to in swing path drill' },
  },
  {
    id: 'sim-iron-down', area: 'เครื่องซ้อม', name: 'เหล็กตีกดลง (Attack Angle)', minutes: 15, attempts: 10,
    why: 'เหล็กต้องตีกดลงให้โดนลูกก่อนดิน (Attack Angle ติดลบ) จะได้สปินและระยะที่แน่นอน ตีช้อนขึ้นทำให้ท็อป/ฉึกและระยะไม่สม่ำเสมอ',
    steps: [
      'วางลูกกลางเท้า (เหล็ก 7) ตั้งท่าให้น้ำหนักอยู่เท้าหน้าราว 60% มือเยื้องหน้าลูกเล็กน้อย',
      'วางผ้าขนหนูหลังลูก 1 ฝ่ามือ สวิง 3/4 ให้หัวไม้ไม่โดนผ้า และจบสวิงด้วยน้ำหนักบนเท้าหน้า',
      'ดูค่า Attack Angle บนจอทุกลูก นับลูกที่ติดลบอย่างน้อย −2° และ Smash ไม่ต่ำกว่า 1.28',
    ],
    pass: 'ผ่าน 7/10',
    video: { th: 'ตีเหล็ก กดลง โดนลูกก่อนดิน', en: 'iron ball first contact attack angle drill' },
  },
];
export const drill = (id) => DRILLS.find((d) => d.id === id) ?? null;

// ผลซ้อมล่าสุดของแบบฝึก (ใหม่สุดก่อน)
export function drillHistory(practice, id, limit = 3) {
  return practice.filter((p) => p.drill_id === id && p.attempts)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, limit);
}

// ---------- แบ่งเวลาซ้อมตามสโตรกที่เสีย ----------
// ใช้ Strokes Gained ถ้ามีหลุมข้อมูลครบอย่างน้อย 9 หลุม ไม่งั้นใช้ที่มาของสโตรกเทียบงบของเป้า
// ทุกหมวดได้อย่างน้อย 15% (รักษาฝีมือ) ที่เหลือ 40% แบ่งตามสโตรกที่เสียเกินเป้า · เครื่องซ้อมมีปัญหาไม้ยาว → เพิ่มน้ำหนักทีออฟ
export const PRACTICE_AREAS = [
  { k: 'tee', th: 'ทีออฟและไม้ยาว', icon: '🏌️' },
  { k: 'approach', th: 'ช็อตเข้ากรีน', icon: '🎯' },
  { k: 'short', th: 'ลูกสั้นรอบกรีน', icon: '⛳' },
  { k: 'putt', th: 'พัต', icon: '🟢' },
];
export const WEEK_MINUTES = 135;   // 3 ครั้ง × 45 นาที

export function practiceSplit({ leaks = [], tee = null, sg = null, simLong = false } = {}) {
  const lost = { tee: 0, approach: 0, short: 0, putt: 0 };
  let basis = 'none';
  if (sg?.holesComplete >= 9) {
    for (const c of sg.cats) lost[c.k] = Math.max(0, -(c.diff ?? 0));
    basis = 'sg';
  } else {
    const gap = (k) => Math.max(0, leaks.find((l) => l.k === k)?.gap ?? 0);
    lost.tee = Math.max(gap('pen') + gap('long'), tee?.enough ? Math.max(0, tee.gap ?? 0) : 0);
    lost.approach = gap('miss');
    lost.short = gap('short') + gap('save') * 0.5;
    lost.putt = gap('putt');
    if (Object.values(lost).some((v) => v > 0)) basis = 'leaks';
  }
  if (simLong) {
    lost.tee += 0.75;
    if (basis === 'none') basis = 'sim';
  }
  const total = Object.values(lost).reduce((a, b) => a + b, 0);
  const rows = PRACTICE_AREAS.map((a) => ({ ...a, lost: lost[a.k], pct: Math.round((total > 0 ? 0.15 + 0.4 * (lost[a.k] / total) : 0.25) * 20) * 5 }));
  const diff = 100 - rows.reduce((a, r) => a + r.pct, 0);
  if (diff) rows.reduce((m, r) => (r.pct > m.pct ? r : m)).pct += diff;
  return { basis, rows: rows.map((r) => ({ ...r, minutes: Math.round(((r.pct / 100) * WEEK_MINUTES) / 5) * 5 })) };
}

// ซ้อม 3 ครั้งต่อสัปดาห์: แก้จุดหลัก → ใช้ในสถานการณ์จริง → ลูกสั้นและพัต
export function weekSessions(split, { hasSim = false } = {}) {
  const top = [...split.rows].filter((r) => r.k === 'tee' || r.k === 'approach').sort((a, b) => b.pct - a.pct)[0];
  return [
    { th: 'ครั้งที่ 1 · แก้จุดหลัก', where: hasSim ? 'เครื่องซ้อม' : 'สนามไดรฟ์', text: hasSim ? 'ทำตามแผนแก้ไขในหน้าเครื่องซ้อม (ขั้นที่ 1–3)' : `${top.th}: แบบฝึกในแผนด้านล่าง`, how: 'สวิงช้า 50–70% ดูผลทุกลูก' },
    { th: 'ครั้งที่ 2 · ใช้ให้ได้ในสนาม', where: hasSim ? 'เครื่องซ้อมหรือสนามไดรฟ์' : 'สนามไดรฟ์', text: 'เกมออกรอบจำลอง: เปลี่ยนไม้และเป้าทุกลูก ทำรูทีนเต็ม', how: 'ดูตัวเลขทุก 3 ลูก', link: '#/sim-game' },
    { th: 'ครั้งที่ 3 · ลูกสั้นและพัต', where: 'กรีนซ้อม', text: 'ชิพ/พิทช์ให้ขึ้นกรีนครั้งเดียว · พัต 1–2 เมตร · พัตไกลคุมน้ำหนัก', how: 'นับลูกผ่านเกณฑ์ บันทึกผลทุกครั้ง' },
  ];
}

export const PRACTICE_PRINCIPLES = [
  'ซ้อมสั้นบ่อยดีกว่ายาวครั้งเดียว: 3 ครั้งต่อสัปดาห์ ครั้งละราว 45 นาที',
  'ตอนแก้วงสวิงใหม่ ดูตัวเลขทุกลูก พอเริ่มทำได้ให้ดูทุก 3 ลูก ร่างกายจะจำความรู้สึกเอง (ดูทุกลูกตลอดไป จะทำได้แค่ตอนมีเครื่อง)',
  'คิดถึงสิ่งที่อยู่นอกตัวขณะสวิง เช่น "ส่งหัวไม้ไปทาง 1 นาฬิกา" "อย่าให้โดนคัฟเวอร์" ได้ผลกว่าคิดถึงข้อศอกหรือไหล่',
  'ท้ายการซ้อมทุกครั้ง เปลี่ยนไม้และเป้าทุกลูกเหมือนออกรอบ ตีลูกเดิมซ้ำ ๆ ทำให้เก่งแค่ในสนามซ้อม',
  'แก้วงสวิงที่ฝังมานานควรมีคนดู: ถ่ายวิดีโอด้านหน้าและด้านหลังแนวเป้า หรือเรียนกับโปร 1–2 ครั้ง (เครื่องวัดเห็นไม้กับลูก แต่ไม่เห็นร่างกาย)',
];

const STARTER = {
  110: ['contact-half', 'putt-ladder', 'short-landing'],
  100: ['putt-ladder', 'short-landing', 'contact-line'],
  90: ['putt-ladder', 'short-updown', 'approach-ladder'],
  80: ['approach-ladder', 'short-updown', 'putt-circle'],
  par: ['approach-center', 'short-updown', 'putt-circle'],
};

// โฟกัสรอบหน้าจากเครื่องซ้อม: ลูกโค้งเป็นประจำ → วางแผนทีออฟเผื่อทิศที่ลูกโค้ง (แก้วงสวิงใช้เวลา แต่เล่นรอบนี้ให้ดีได้เลย)
// driver = ไดรเวอร์จากเครื่องซ้อม: ใช้ฝั่งที่ลูกไปจบจริงก่อน (ออกซ้ายแล้วโค้งขวาอาจยังจบซ้าย) ไม่มีจึงใช้ทิศที่ลูกโค้ง
export function simCue(simIssues = [], driver = null) {
  const land = driver?.side === 'left' || driver?.side === 'right' ? driver.side : null;
  if (land) {
    const r = land === 'right';
    const out = r ? driver.missR : driver.missL;
    return {
      text: `ทีออฟ: ตั้งทีฝั่ง${r ? 'ขวา' : 'ซ้าย'}ของแท่น แล้วเล็งไปขอบ${r ? 'ซ้าย' : 'ขวา'}ของแฟร์เวย์ เผื่อลูกที่มักไปจบทาง${r ? 'ขวา' : 'ซ้าย'}`,
      why: `จากเครื่องซ้อม: ไดรเวอร์หลุดแฟร์เวย์ทาง${r ? 'ขวา' : 'ซ้าย'}${out != null ? ` ${pctTxt(out)}` : ''}`,
      src: 'sim',
    };
  }
  const c = simIssues.find((i) => i.k === 'curve' && i.dir);
  if (!c) return null;
  const r = c.dir === 'right';
  return {
    text: `ทีออฟ: ตั้งทีฝั่ง${r ? 'ขวา' : 'ซ้าย'}ของแท่น แล้วเล็งไปขอบ${r ? 'ซ้าย' : 'ขวา'}ของแฟร์เวย์ ให้ลูกโค้งกลับเข้ากลาง`,
    why: `จากเครื่องซ้อม: ${c.detail[0]}`,
    src: 'sim',
  };
}

// แผนซ้อมสัปดาห์: เรื่องอันดับ 1 จากการออกรอบสองแบบฝึก อันดับ 2 หนึ่งแบบฝึก พัตสั้นเป็นประจำ
// มีผลจากเครื่องซ้อม → แทรกแบบฝึกของปัญหาอันดับ 1 จากเครื่องซ้อมเป็นแบบฝึกที่ 2 (ไม่มีข้อมูลออกรอบ → ใช้เครื่องซ้อมนำ)
// ทีออฟ/ไดรเวอร์เป็นปัญหา (tee.problem) แต่ยังไม่มีแบบฝึกทีออฟ → ใส่แทนแบบฝึกสุดท้าย 1 อย่าง
const isTeeDrill = (id) => drill(id)?.area === 'ทีออฟ' || /^sim-driver-/.test(id);
export function buildPlan(focus, goal, practice = [], sim = [], tee = null) {
  const d = (i, j) => focus[i]?.drills[j];
  const s = (i, j) => sim[i]?.drills?.[j];
  let ids;
  let basis;
  if (focus.length) {
    ids = sim.length
      ? [d(0, 0), s(0, 0), d(0, 1), d(1, 0), 'putt-circle', s(1, 0), d(0, 2), d(2, 0)]
      : [d(0, 0), d(0, 1), d(1, 0), 'putt-circle', d(0, 2), d(1, 1), d(2, 0), d(2, 1)];
    basis = focus.slice(0, 2).map((f) => f.th);
  } else if (sim.length) {
    ids = [s(0, 0), s(0, 1), s(1, 0), ...(STARTER[goal.v] ?? STARTER[90])];
    basis = [];
  } else {
    ids = STARTER[goal.v] ?? STARTER[90];
    basis = [];
  }
  if (sim.length) basis.push(`${sim[0].th} (จากเครื่องซ้อม)`);
  const fromCourse = new Set(focus.flatMap((f) => f.drills));
  let picked = [...new Set(ids.filter(Boolean))].filter((id) => drill(id)).slice(0, 4);
  const teeAdd = tee?.problem && !picked.some(isTeeDrill) ? tee.drills?.find((id) => drill(id)) : null;
  if (teeAdd) {
    picked = [...picked.slice(0, 3), teeAdd];
    basis.push('ทีออฟ/ไดรเวอร์');
  }
  const items = picked
    .map((id) => ({ ...drill(id), history: drillHistory(practice, id), fromSim: !fromCourse.has(id) && id !== teeAdd && sim.some((x) => x.drills?.includes(id)) }));
  return { items, minutes: items.reduce((a, x) => a + x.minutes, 0), basis };
}

// ---------- ระยะไม้จริงจาก GPS ----------
// ระยะช็อต = จากจุดตีถึงจุดที่ลูกไปจบ (หมุดที่ปักบนแผนที่ หรือจุดตีช็อตถัดไปจาก GPS) ดู shotgeo.js
// ไม้ที่ระยะกลางใกล้ระยะที่ต้องการที่สุด (ต้องมีข้อมูลอย่างน้อย 3 ครั้ง และต่างไม่เกิน 12% หรือ 12 ม.)
export function suggestClub(meters, rows) {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  let best = null;
  for (const r of rows) {
    if (r.n < 3 || r.category === 'putter') continue;
    const diff = Math.abs(r.median - meters);
    if (diff <= Math.max(12, meters * 0.12) && (!best || diff < best.diff)) best = { ...r, diff };
  }
  return best;
}

// ควอนไทล์แบบเฉลี่ยระหว่างสองค่าที่ใกล้ที่สุด
const quant = (arr, p) => {
  const i = p * (arr.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return arr[lo] + (arr[hi] - arr[lo]) * (i - lo);
};

// ระยะของแต่ละไม้จากช็อตเต็ม (ทีออฟ/เข้ากรีน) ที่สัมผัสไม่พลาด ไม่โดนลูกโทษ ไม่ออกนอกเขต
export function clubDistances({ rounds, holesOf, shotsOf, penaltiesOf, clubOf, teeOf = () => null }) {
  const by = new Map();
  for (const r of rounds) {
    if (r.shot_logging === false) continue;
    for (const h of holesOf(r.id)) {
      const shots = shotsOf(h.id);
      if (shots.length < 2) continue;
      const pens = penaltiesOf(h.id);
      const penalized = new Set(pens.map((p) => p.related_shot_id_optional).filter(Boolean));
      for (const [id, d] of shotDistances(shots, teeOf(r, h), pens)) {
        const s = shots.find((x) => x.id === id);
        const club = clubOf(s.club_id);
        if (!club || club.category === 'putter' || !['tee', 'approach'].includes(s.shot_type)) continue;
        if (['top', 'fat'].includes(s.contact) || penalized.has(id) || TROUBLE_ENDS.includes(s.end_lie)) continue;
        if (d < 20 || d > 400) continue;
        if (!by.has(club.id)) by.set(club.id, { club, ds: [] });
        by.get(club.id).ds.push(d);
      }
    }
  }
  return [...by.values()].map(({ club, ds }) => {
    ds.sort((a, b) => a - b);
    return { club_id: club.id, label: club.label, category: club.category, order: club.order ?? 0, n: ds.length, median: quant(ds, 0.5), p25: quant(ds, 0.25), p75: quant(ds, 0.75), max: ds.at(-1) };
  }).sort((a, b) => a.order - b.order);
}
