// วิเคราะห์ละเอียดจากเครื่องซ้อม: ช็อตที่น่าจะจดผิดไม้ · ลักษณะลูกรายไม้ · ตัวเลขเทียบเป้าตามประเภทไม้
// · ระยะไดรเวอร์ที่ได้คืนได้ · เทียบกับครั้งก่อน · สรุปสิ่งที่สำคัญที่สุด
// เป้าหมายเป็นช่วงโดยประมาณสำหรับนักกอล์ฟสมัครเล่น (อ้างอิงช่วงที่ผู้ผลิตเครื่องวัดเผยแพร่ทั่วไป) ไม่ใช่ค่าตายตัว
import { clubStats, clubKind, launchSessions, splitSuspect } from './launch.js';

export { splitSuspect };

const MPH = 0.44704;
const YD = 0.9144;
const keyOf = (s, clubOf) => (s.clubId && clubOf(s.clubId) ? s.clubId : `raw:${s.raw}`);

// ---------- ลักษณะลูก ----------
// ทิศออกตัว (Launch Direction) และการโค้ง (Face to Path): บวก = ขวา ทั้งสองค่า (ตามที่เครื่องรายงาน)
export function shapeOf(s) {
  if (s?.ld == null || s?.f2p == null) return null;
  const start = s.ld <= -2 ? 'L' : s.ld >= 2 ? 'R' : 'C';
  const curve = s.f2p <= -6 ? 'LL' : s.f2p <= -2 ? 'L' : s.f2p < 2 ? 'C' : s.f2p < 6 ? 'R' : 'RR';
  return { start, curve };
}
const START_TH = { L: 'ออกซ้าย', C: 'ออกตรง', R: 'ออกขวา' };
const CURVE_TH = { LL: 'โค้งซ้ายมาก', L: 'โค้งซ้าย', C: 'ไม่โค้ง', R: 'โค้งขวา', RR: 'โค้งขวามาก' };
// ชื่อสากล (ถนัดซ้ายสลับซ้าย/ขวา): ออกซ้ายแล้วโค้งขวามาก ของคนถนัดขวา = Pull-slice
export function shapeTerm({ start, curve }, hand = 'right') {
  const flip = (x) => (hand === 'left' ? x.replace(/L/g, 'x').replace(/R/g, 'L').replace(/x/g, 'R') : x);
  const sw = { L: 'Pull', C: '', R: 'Push' }[flip(start)];
  const cw = { LL: 'hook', L: 'draw', C: '', R: 'fade', RR: 'slice' }[flip(curve)];
  if (!sw && !cw) return 'Straight';
  if (!sw) return cw[0].toUpperCase() + cw.slice(1);
  return cw ? `${sw}-${cw}` : sw;
}
export const shapeTh = (sh) => (sh.start === 'C' && sh.curve === 'C' ? 'ตรง' : `${START_TH[sh.start]}${sh.curve === 'C' ? '' : ` แล้ว${CURVE_TH[sh.curve]}`}`);

export function shapeSummary(shots) {
  const list = shots.map(shapeOf).filter(Boolean);
  if (list.length < 5) return null;
  const counts = new Map();
  for (const sh of list) {
    const k = `${sh.start}|${sh.curve}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const [topK, topN] = [...counts].sort((a, b) => b[1] - a[1])[0];
  const [start, curve] = topK.split('|');
  // ตรงพอใช้ = ออกตรงและโค้งไม่มาก
  const good = list.filter((x) => x.start === 'C' && ['L', 'C', 'R'].includes(x.curve)).length;
  const right = list.filter((x) => x.curve === 'R' || x.curve === 'RR').length;
  const left = list.filter((x) => x.curve === 'L' || x.curve === 'LL').length;
  return { n: list.length, top: { start, curve }, topPct: topN / list.length, goodPct: good / list.length, rightPct: right / list.length, leftPct: left / list.length };
}

// ---------- เป้าหมายตามประเภทไม้ ----------
// sf = [ดี, พอใช้] · ช่วงอื่น = [ต่ำสุด, สูงสุด]
export const TARGETS = {
  driver: { th: 'ไดรเวอร์', sf: [1.44, 1.4], la: [11, 16], spin: [2000, 3000], aa: [-1, 5] },
  wood: { th: 'แฟร์เวย์วูด', sf: [1.42, 1.38], la: [10, 15], spin: [3000, 4500], aa: [-4, 1] },
  hybrid: { th: 'ไฮบริด', sf: [1.38, 1.34], la: [11, 17], spin: [3500, 5500], aa: [-4, 0] },
  longIron: { th: 'เหล็กยาว', sf: [1.34, 1.3], la: [11, 17], spin: [4000, 6000], aa: [-5, -1] },
  midIron: { th: 'เหล็กกลาง', sf: [1.32, 1.28], la: [14, 21], spin: [5500, 7500], aa: [-6, -2] },
  shortIron: { th: 'เหล็กสั้น', sf: [1.28, 1.24], la: [18, 26], spin: [7000, 9000], aa: [-6, -2] },
  wedge: { th: 'เวดจ์', sf: [1.22, 1.15], la: [24, 34], spin: [8000, 10500], aa: [-7, -3] },
};
export function groupOf(stat) {
  const k = clubKind(stat.label) ?? clubKind(stat.key?.startsWith('raw:') ? stat.key.slice(4) : '');
  const cat = stat.category ?? k?.cat;
  if (cat === 'iron') {
    const n = k?.n ?? null;
    return n == null ? 'midIron' : n <= 5 ? 'longIron' : n <= 7 ? 'midIron' : 'shortIron';
  }
  return TARGETS[cat] ? cat : null;
}

const fmtDeg = (x) => `${x > 0 ? '+' : ''}${x.toFixed(1)}°`;
const inRange = (v, [lo, hi], slack) => (v >= lo && v <= hi ? 'ok' : v >= lo - slack && v <= hi + slack ? 'near' : 'far');

// ตัวเลขหลักของไม้เทียบเป้า: status ok | near | far
export function clubMetrics(stat) {
  const g = groupOf(stat);
  const t = TARGETS[g];
  const out = [];
  if (stat.sf != null && t) out.push({ k: 'sf', th: 'Smash Factor', value: stat.sf.toFixed(2), goal: `≥ ${t.sf[0].toFixed(2)}`, status: stat.sf >= t.sf[0] ? 'ok' : stat.sf >= t.sf[1] ? 'near' : 'far' });
  if (stat.f2p != null && stat.f2pN >= 3) out.push({ k: 'f2p', th: 'หน้าไม้เทียบแนวสวิง', value: fmtDeg(stat.f2p), goal: '−2° ถึง +2°', status: Math.abs(stat.f2p) <= 2 ? 'ok' : Math.abs(stat.f2p) <= 4 ? 'near' : 'far' });
  if (stat.path != null) out.push({ k: 'path', th: 'แนวสวิง', value: fmtDeg(stat.path), goal: '−3° ถึง +3°', status: Math.abs(stat.path) <= 3 ? 'ok' : Math.abs(stat.path) <= 6 ? 'near' : 'far' });
  if (stat.ld != null) out.push({ k: 'ld', th: 'ทิศออกตัว', value: fmtDeg(stat.ld), goal: '−2° ถึง +2°', status: Math.abs(stat.ld) <= 2 ? 'ok' : Math.abs(stat.ld) <= 4 ? 'near' : 'far' });
  if (stat.la != null && t) out.push({ k: 'la', th: 'มุมยิง', value: `${stat.la.toFixed(1)}°`, goal: `${t.la[0]}–${t.la[1]}°`, status: inRange(stat.la, t.la, 2) });
  if (stat.spin != null && t) out.push({ k: 'spin', th: 'สปิน', value: Math.round(stat.spin).toLocaleString('en-US'), goal: `${t.spin[0].toLocaleString('en-US')}–${t.spin[1].toLocaleString('en-US')}`, status: inRange(stat.spin, t.spin, 600) });
  if (stat.aa != null && t) out.push({ k: 'aa', th: 'มุมเข้าหาลูก', value: fmtDeg(stat.aa), goal: `${fmtDeg(t.aa[0])} ถึง ${fmtDeg(t.aa[1])}`, status: inRange(stat.aa, t.aa, 1.5) });
  if (stat.carry && stat.p25 != null && stat.nCarry >= 5) {
    const w = (stat.p75 - stat.p25) / stat.carry;
    const lim = g === 'driver' || g === 'wood' ? [0.08, 0.12] : [0.06, 0.1];
    out.push({ k: 'window', th: 'ระยะสม่ำเสมอ', value: `±${Math.round(w * 50)}%`, goal: `±${Math.round(lim[0] * 50)}%`, status: w <= lim[0] ? 'ok' : w <= lim[1] ? 'near' : 'far' });
  }
  return out;
}

// ---------- ระยะไดรเวอร์ที่ได้คืนได้ ----------
// ไดรเวอร์ที่มุมยิงและสปินเหมาะสม ลอยได้ราว 1.6 หลาต่อความเร็วลูก 1 mph (ค่าประมาณ) · ตีกลางหน้าไม้ Smash ราว 1.44
export function driverPotential(stat) {
  if (!stat || stat.cs == null || stat.bs == null || stat.carry == null) return null;
  const k = 1.6 * YD;   // เมตรต่อ mph
  const now = stat.carry;
  const atLaunch = k * (stat.bs / MPH);
  const atStrike = k * ((stat.cs / MPH) * 1.44);
  const launchGain = Math.max(0, atLaunch - now);
  const strikeGain = Math.max(0, atStrike - Math.max(now, atLaunch));
  return { now, launchGain, strikeGain, total: launchGain + strikeGain, potential: now + launchGain + strikeGain };
}

// ---------- เทียบกับครั้งก่อน ----------
// ครั้งล่าสุดเทียบครั้งก่อนหน้า (ไม้เดียวกัน) · เฉพาะการเปลี่ยนที่ชัดเจน
export function compareLast(practice, clubOf = () => null) {
  const ss = launchSessions(practice);
  if (ss.length < 2) return null;
  const [prev, last] = ss.slice(-2);
  const statsOf = (s) => clubStats(splitSuspect(s.shots, clubOf).keep, clubOf);
  const a = new Map(statsOf(prev).map((x) => [x.key, x]));
  const rows = [];
  for (const b of statsOf(last)) {
    const p = a.get(b.key);
    if (!p || p.good < 3 || b.good < 3) continue;
    const d = (k) => (p[k] != null && b[k] != null ? b[k] - p[k] : null);
    rows.push({
      key: b.key, label: b.label, group: groupOf(b),
      carry: p.nCarry >= 3 && b.nCarry >= 3 ? d('carry') : null, carryFrom: p.carry, carryTo: b.carry,
      sf: d('sf'), sfFrom: p.sf, sfTo: b.sf, f2p: d('f2p'), f2pFrom: p.f2p, f2pTo: b.f2p, path: d('path'), pathFrom: p.path, pathTo: b.path,
      spin: d('spin'), spinFrom: p.spin, spinTo: b.spin, sideAbs: d('sideAbs'), sideFrom: p.sideAbs, sideTo: b.sideAbs,
    });
  }
  return { from: prev.date, to: last.date, rows };
}

// ---------- สรุปทั้งหมด ----------
const LONG = new Set(['driver', 'wood', 'hybrid', 'longIron']);
export function launchReport(shots, clubOf = () => null, { hand = 'right', practice = null, fmt = (m) => `${Math.round(m / YD)} หลา` } = {}) {
  const { keep, suspects, odd } = splitSuspect(shots, clubOf);
  const stats = clubStats(keep, clubOf);
  const clubs = stats.filter((s) => s.n >= 5).map((s) => {
    const mine = keep.filter((x) => keyOf(x, clubOf) === s.key && !(x.sf != null && x.sf < 1.0));
    return { stat: s, group: groupOf(s), shape: shapeSummary(mine), metrics: clubMetrics(s), bestWorst: bestWorst(mine) };
  });
  const headline = [];

  // 1) ลักษณะลูกหลักของไม้ยาวและไม้สั้น และต้นเหตุ
  const side = (list) => {
    const xs = list.filter((c) => c.shape && c.stat.f2pN >= 3);
    const n = xs.reduce((a, c) => a + c.shape.n, 0);
    if (n < 8) return null;
    const w = (k) => xs.reduce((a, c) => a + (c.stat[k] ?? 0) * c.shape.n, 0) / n;
    const right = xs.reduce((a, c) => a + c.shape.rightPct * c.shape.n, 0) / n;
    const left = xs.reduce((a, c) => a + c.shape.leftPct * c.shape.n, 0) / n;
    const top = [...xs].sort((a, b) => b.shape.n - a.shape.n)[0].shape.top;
    return { labels: xs.map((c) => c.stat.label), n, f2p: w('f2p'), path: w('path'), ld: w('ld'), right, left, top };
  };
  const long = side(clubs.filter((c) => LONG.has(c.group)));
  const short = side(clubs.filter((c) => c.group && !LONG.has(c.group)));
  for (const [name, s] of [['ไม้ยาว', long], ['เหล็กกลาง–สั้นและเวดจ์', short]]) {
    if (!s) continue;
    const bend = s.right >= 0.6 ? 'ขวา' : s.left >= 0.6 ? 'ซ้าย' : null;
    if (!bend) {
      headline.push({ k: 'shape', tone: 'ok', text: `${name} (${s.labels.join(', ')}): ไม่โค้งไปทางใดทางหนึ่งชัด · หน้าไม้เทียบแนวสวิงเฉลี่ย ${fmtDeg(s.f2p)}` });
      continue;
    }
    const pct = Math.round((bend === 'ขวา' ? s.right : s.left) * 100);
    const term = shapeTerm(s.top, hand);
    const outIn = s.path <= -3 ? (hand === 'right' ? 'ตัดจากนอกเข้าใน' : 'ตีจากในออกนอก') : s.path >= 3 ? (hand === 'right' ? 'ตีจากในออกนอก' : 'ตัดจากนอกเข้าใน') : null;
    const cause = outIn
      ? `ต้นเหตุหลักคือแนวสวิง${outIn} (${fmtDeg(s.path)}) หน้าไม้จึงเปิดเทียบแนวสวิง ${fmtDeg(s.f2p)} — แก้ที่แนวสวิงก่อน ไม่ใช่กริปหรือการเล็ง`
      : `แนวสวิงตรงดี (${fmtDeg(s.path)}) แต่หน้าไม้${s.f2p > 0 ? 'เปิด' : 'ปิด'}เทียบแนวสวิง ${fmtDeg(s.f2p)} — แก้ที่กริปและการหมุนหน้าไม้`;
    headline.push({ k: 'shape', tone: 'far', text: `${name} (${s.labels.join(', ')}): ลูกโค้ง${bend} ${pct}% ส่วนใหญ่${shapeTh(s.top)} (${term}) · ${cause}` });
  }
  if (long && short && Math.abs(long.f2p) >= 4 && Math.abs(short.f2p) <= 2.5) {
    headline.push({ k: 'shape-split', tone: 'near', text: `เหล็กสั้นตรงกว่าไม้ยาวมาก (F2P ${fmtDeg(short.f2p)} เทียบ ${fmtDeg(long.f2p)}) แปลว่าวงสวิงเต็มของไม้ยาวคือจุดที่เพี้ยน` });
  }

  // 2) ระยะไดรเวอร์ที่ได้คืนได้
  const drv = clubs.find((c) => c.group === 'driver')?.stat;
  const pot = driverPotential(drv);
  if (pot && pot.total >= 5 * YD) {
    const bits = [pot.strikeGain >= 3 * YD ? `ตีกลางหน้าไม้ (Smash ${drv.sf.toFixed(2)} → 1.44) +${fmt(pot.strikeGain)}` : '',
      pot.launchGain >= 3 * YD ? `มุมยิงและสปินที่เหมาะสม (สปินตอนนี้ ${Math.round(drv.spin).toLocaleString('en-US')}) +${fmt(pot.launchGain)}` : ''].filter(Boolean);
    headline.push({ k: 'potential', tone: 'near', text: `ไดรเวอร์ได้ระยะลอยเพิ่มได้ราว ${fmt(pot.total)} (${fmt(pot.now)} → ${fmt(pot.potential)}): ${bits.join(' · ')} · ค่าประมาณจากความเร็วหัวไม้เดิม` });
  }

  // 3) เปลี่ยนไปมากจากครั้งก่อน
  const cmp = practice ? compareLast(practice, clubOf) : null;
  if (cmp) {
    const big = cmp.rows.filter((r) => r.carry != null && Math.abs(r.carry) >= 8 * YD).sort((a, b) => Math.abs(b.carry) - Math.abs(a.carry))[0];
    if (big) {
      const why = [big.sf != null && Math.abs(big.sf) >= 0.03 ? `Smash ${big.sfFrom.toFixed(2)} → ${big.sfTo.toFixed(2)}` : '',
        big.path != null && Math.abs(big.path) >= 2 ? `แนวสวิง ${fmtDeg(big.pathFrom)} → ${fmtDeg(big.pathTo)}` : ''].filter(Boolean);
      headline.push({ k: 'change', tone: big.carry < 0 ? 'far' : 'ok', text: `${big.label} ${big.carry < 0 ? 'ไกลน้อยลง' : 'ไกลขึ้น'} ${fmt(Math.abs(big.carry))} จากครั้งก่อน (${fmt(big.carryFrom)} → ${fmt(big.carryTo)})${why.length ? ` · ${why.join(' · ')}` : ''}` });
    }
  }

  // 4) ไดรเวอร์กับไม้ 3 ระยะเท่ากัน = ไดรเวอร์ยังไม่ได้ระยะที่ควรได้
  const w3 = clubs.find((c) => c.group === 'wood')?.stat;
  if (drv?.carry && w3?.carry && drv.carry - w3.carry < 8 * YD) {
    headline.push({ k: 'gap', tone: 'near', text: `ไดรเวอร์ (${fmt(drv.carry)}) ไกลกว่า ${w3.label} (${fmt(w3.carry)}) แค่ ${fmt(Math.max(0, drv.carry - w3.carry))} ปกติควรห่างราว 15–25 หลา — ไดรเวอร์ยังได้ระยะไม่เต็ม` });
  }

  return { suspects, odd, stats, clubs, headline, compare: cmp, potential: pot };
}

// ---------- ช็อตดีที่สุดเทียบช็อตที่เสียระยะมากที่สุด ----------
// ให้เห็นด้วยตัวเลขจริงว่าลูกที่ดีกับลูกที่พลาดต่างกันตรงไหน · ไม่นับลูกพลาดหนักหรือวัดผิด
// (Smash < 1.0 หรือระยะลอยต่ำกว่า 60% ของค่ากลาง แบบเดียวกับที่ใช้คิดสถิติ) จะได้ลูกพลาดแบบที่เกิดจริงบ่อย ๆ
export function bestWorst(shots) {
  const withCarry = shots.filter((s) => s.carry != null);
  const sortedC = withCarry.map((s) => s.carry).sort((a, b) => a - b);
  const m = sortedC.length ? (sortedC[Math.floor((sortedC.length - 1) / 2)] + sortedC[Math.ceil((sortedC.length - 1) / 2)]) / 2 : null;
  const xs = withCarry.filter((s) => !(s.sf != null && s.sf < 1.0) && s.carry >= 0.6 * m);
  if (xs.length < 5) return null;
  const sorted = [...xs].sort((a, b) => b.carry - a.carry);
  const best = sorted[0];
  const worst = sorted.at(-1);
  if (best.carry - worst.carry < 10 * YD) return null;
  return { best, worst };
}

// ---------- แผนแก้วงสวิงทีละขั้น ----------
// เรียงจากต้นเหตุ: แนวสวิง → หน้าไม้ → ไดรเวอร์โดนกลางหน้าไม้/สปิน → เหล็กตีกดลง → ระยะสม่ำเสมอ (ทำพร้อมกันไม่เกิน 3 ขั้น)
// เป้าแต่ละขั้นเลื่อนทีละนิดจากค่าครั้งก่อน (แก้แนวสวิงทีละ 3–4° ทำได้จริงกว่ากระโดดไป 0° ทันที)
// ไม่ต้องเก็บสถานะ: เป้าของครั้งล่าสุดคิดจากค่าครั้งก่อน → บอกได้ว่าผ่านหรือยัง · เป้าครั้งหน้าคิดจากค่าล่าสุด
const IRONS = new Set(['longIron', 'midIron', 'shortIron']);
const wavg = (list, k, w = 'good') => {
  const xs = list.filter((s) => s[k] != null && s[w] > 0);
  const n = xs.reduce((a, s) => a + s[w], 0);
  return n >= 5 ? xs.reduce((a, s) => a + s[k] * s[w], 0) / n : null;
};
const driverOf = (stats) => stats.find((s) => groupOf(s) === 'driver' && s.good >= 5) ?? null;
const METRIC_OF = {
  path: (stats) => wavg(stats.filter((s) => LONG.has(groupOf(s))), 'path'),
  f2p: (stats) => wavg(stats.filter((s) => s.f2pN >= 3 && groupOf(s) !== 'wedge'), 'f2p', 'f2pN'),
  sf: (stats) => driverOf(stats)?.sf ?? null,
  spin: (stats) => driverOf(stats)?.spin ?? null,
  aaIron: (stats) => wavg(stats.filter((s) => IRONS.has(groupOf(s))), 'aa'),
};
const STEP = {
  path: { next: (v) => Math.sign(v) * Math.max(3, Math.round(Math.abs(v)) - 4), meets: (v, t) => Math.abs(v) <= Math.abs(t) + 0.05, fmt: fmtDeg, goal: '−3° ถึง +3°' },
  f2p: { next: (v) => Math.sign(v) * Math.max(2, Math.round(Math.abs(v)) - 2), meets: (v, t) => Math.abs(v) <= Math.abs(t) + 0.05, fmt: fmtDeg, goal: '−2° ถึง +2°' },
  sf: { next: (v) => Math.min(1.44, Math.round((v + 0.04) * 100) / 100), meets: (v, t) => v >= t - 0.005, fmt: (v) => v.toFixed(2), goal: '1.44 ขึ้นไป' },
  spin: { next: (v) => Math.max(3000, Math.round((v - 600) / 100) * 100), meets: (v, t) => v <= t + 50, fmt: (v) => Math.round(v).toLocaleString('en-US'), goal: '2,000–3,000' },
  aaIron: { next: (v) => (v > 1 ? -1 : -2), meets: (v, t) => v <= t + 0.05, fmt: fmtDeg, goal: '−2° ถึง −5°' },
};

// คำแนะนำเขียนสำหรับคนถนัดขวา · ถนัดซ้ายสลับซ้าย/ขวา
const swapLR = (t) => t.replace(/ซ้าย/g, '\u0000').replace(/ขวา/g, 'ซ้าย').replace(/\u0000/g, 'ขวา').replace('1 นาฬิกา', '11 นาฬิกา');

export function fixPlan(report, { hand = 'right', practice = [], clubOf = () => null } = {}) {
  const stats = report.stats;
  const sessions = launchSessions(practice).map((s) => ({ date: s.date, stats: clubStats(splitSuspect(s.shots, clubOf).keep, clubOf) }));
  const track = (k, th) => {
    const hist = sessions.map((s) => ({ date: s.date, value: METRIC_OF[k](s.stats) })).filter((x) => x.value != null).slice(-4);
    const now = METRIC_OF[k](stats);
    const prev = hist.length >= 2 ? hist.at(-2) : null;
    const last = hist.at(-1);
    const target = prev ? STEP[k].next(prev.value) : null;
    return {
      k, th, now, history: hist, fmt: STEP[k].fmt, goal: STEP[k].goal,
      next: now == null ? null : STEP[k].next(now),
      passed: prev && last ? STEP[k].meets(last.value, target) : null, lastTarget: target,
    };
  };
  const cue = (list) => (hand === 'left' ? list.map(swapLR) : list);
  const steps = [];

  // 1) แนวสวิงของไม้ยาว (ต้นเหตุ) · หน้าไม้ปิดกับเป้าอยู่แล้ว → ห้ามแก้ด้วยกริป strong (ลูกจะออกซ้ายมากขึ้น)
  const path = METRIC_OF.path(stats);
  const longStats = stats.filter((s) => LONG.has(groupOf(s)));
  const face = wavg(longStats, 'face');
  const ldLong = wavg(longStats, 'ld');
  if (path != null && Math.abs(path) >= 4) {
    const cut = (path < 0) === (hand === 'right');
    const long = report.clubs.filter((c) => LONG.has(c.group) && c.shape);
    const nShape = long.reduce((a, c) => a + c.shape.n, 0);
    const bend = nShape ? Math.round((long.reduce((a, c) => a + (cut ? c.shape.rightPct : c.shape.leftPct) * c.shape.n, 0) / nShape) * 100) : null;
    const curveTh = (hand === 'right') === cut ? 'ขวา' : 'ซ้าย';
    // หน้าไม้ปิดกับเป้าจนลูกออกซ้ายจริง (ไม่ใช่แค่นิดหน่อย)
    const closedToTarget = cut && face != null && ldLong != null && (hand === 'right' ? face <= -1.5 && ldLong <= -2 : face >= 1.5 && ldLong >= 2);
    steps.push({
      k: 'path', title: cut ? 'แก้แนวสวิงที่ตัดลูก (ต้นเหตุของลูกโค้งและสปินสูง)' : 'แก้แนวสวิงที่ตีออกด้านนอกมากเกิน (ต้นเหตุของลูกฮุก)',
      why: [
        `แนวสวิงไม้ยาวเฉลี่ย ${fmtDeg(path)}${bend != null ? ` ลูกจึงโค้ง${curveTh} ${bend}%` : ''} พอแนวสวิงดีขึ้น หน้าไม้เทียบแนวสวิงและสปินไดรเวอร์จะลดตามเอง แก้ข้อนี้ก่อนข้ออื่น`,
        closedToTarget ? `หน้าไม้ปิดกับเป้าอยู่แล้ว (${fmtDeg(face)} ลูกจึงออกซ้าย) ตอนนี้ยังไม่ควรปรับกริปให้ strong ขึ้น เพราะลูกจะออกซ้ายมากขึ้นอีก` : '',
      ].filter(Boolean).join(' · '),
      cues: cue(cut ? [
        'ตั้งท่า: ไหล่และเท้าขนานแนวเป้า (คนที่ตัดลูกมักเปิดไหล่ไปทางซ้ายโดยไม่รู้ตัว)',
        'ลงสวิง: เริ่มที่สะโพกซ้ายก่อน ให้แขนตกลงมาด้านใน ข้อศอกขวาชิดลำตัว ไม่ใช้ไหล่ขวาเหวี่ยงออก',
        'ความรู้สึก: ส่งหัวไม้ออกไปทางขวาของเป้า (ทิศ 1 นาฬิกา) แล้วปล่อยให้แขนหมุนข้ามหลังโดนลูก',
      ] : [
        'ตั้งท่า: ไม่ยืนปิดเกินไป (เท้าขวาไม่ถอยหลังมาก) ไหล่ขนานแนวเป้า',
        'ลงสวิง: หมุนลำตัวต่อเนื่องจนจบ ไม่ค้างสะโพกให้แขนวิ่งออกไปทางขวาอย่างเดียว',
        'ความรู้สึก: ส่งหัวไม้ไปทางซ้ายของเป้ามากขึ้น (ทิศ 11 นาฬิกา)',
      ]),
      club: 'เริ่มด้วยเหล็ก 7 สวิง 70% ผ่านแล้วไล่ไปเหล็ก 5 ไม้ 3 และไดรเวอร์',
      drill: cut ? 'sim-path-in' : 'sim-face-path', balls: 20, metric: track('path', 'แนวสวิง (Club Path) ไม้ยาว'),
    });
  }

  // 1b) แนวสวิงดีแล้วแต่หน้าไม้เปิด/ปิดเทียบแนวสวิง → คุมหน้าไม้ด้วยกริปและข้อมือ
  const f2p = METRIC_OF.f2p(stats);
  if (!steps.length && f2p != null && Math.abs(f2p) >= 4) {
    const open = (f2p > 0) === (hand === 'right');
    steps.push({
      k: 'face', title: open ? 'คุมหน้าไม้ไม่ให้เปิด (ลูกโค้งออก)' : 'คุมหน้าไม้ไม่ให้ปิดเร็ว (ลูกโค้งเข้า)',
      why: `แนวสวิงตรงดี (${fmtDeg(path ?? 0)}) แต่หน้าไม้${open ? 'เปิด' : 'ปิด'}เทียบแนวสวิง ${fmtDeg(f2p)} ต้นเหตุอยู่ที่กริปและการหมุนหน้าไม้`,
      cues: cue(open ? [
        'กริปมือซ้ายให้เห็นข้อนิ้ว 2–3 ข้อ (strong ขึ้นเล็กน้อย)',
        'จับไม้เบาลง (ราว 5 จาก 10) ให้ข้อมือหมุนหน้าไม้กลับมาได้ทัน',
        'บนสุดของแบ็คสวิง หลังมือซ้ายแบนราบ ไม่พับหงาย',
      ] : [
        'กริปมือซ้ายให้เห็นข้อนิ้ว 1–2 ข้อ (ไม่ strong เกิน)',
        'หมุนลำตัวต่อเนื่องผ่านลูก ไม่หยุดลำตัวแล้วสะบัดมือ',
        'บนสุดของแบ็คสวิง หลังมือซ้ายแบนราบ ไม่งอเข้า',
      ]),
      club: 'เหล็ก 7 แล้วค่อยไม้ยาว', drill: 'sim-face-path', balls: 20, metric: track('f2p', 'หน้าไม้เทียบแนวสวิง'),
    });
  }

  // 2) ไดรเวอร์: โดนกลางหน้าไม้ และสปิน (ตีขึ้นอยู่แล้วไม่ต้องตีเสยเพิ่ม)
  const drv = driverOf(stats);
  if (drv) {
    const lowSf = drv.sf != null && drv.sf < TARGETS.driver.sf[1];
    const down = drv.aa != null && drv.aa < -1.5;
    const highSpin = drv.spin != null && drv.spin > 3300 && !down;
    if (lowSf || highSpin) {
      const gain = report.potential?.strikeGain;
      steps.push({
        k: 'strike', title: highSpin ? 'ไดรเวอร์โดนกลางหน้าไม้ ลดสปิน ลูกไม่โด่ง' : 'ไดรเวอร์โดนกลางหน้าไม้',
        why: [
          drv.aa != null && drv.aa >= 0 ? `ไดรเวอร์ตีขึ้นอยู่แล้ว (มุมเข้าหาลูก ${fmtDeg(drv.aa)}) ดีแล้ว ไม่ต้องตีเสยเพิ่ม` : '',
          highSpin ? `ลูกโด่งเพราะสปิน ${Math.round(drv.spin).toLocaleString('en-US')} รอบ/นาที (เป้า 2,000–3,000) จากการโดนต่ำบนหน้าไม้และการตัดลูก` : '',
          lowSf ? `Smash ${drv.sf.toFixed(2)} (เป้า 1.44)${gain ? ` ตีกลางหน้าไม้ได้ระยะเพิ่มราว ${Math.round(gain / YD)} หลา` : ''}` : '',
        ].filter(Boolean).join(' · '),
        cues: [
          'ตั้งทีให้ครึ่งลูกอยู่เหนือหัวไม้ วางลูกตรงส้นเท้าหน้า ให้โดนกลาง–ค่อนบนของหน้าไม้ (โดนต่ำ = สปินเพิ่ม)',
          'สวิง 80% และจังหวะเท่าเดิมทุกลูก ความเร็วลดนิดเดียวแต่โดนกลางบ่อยขึ้น ได้ระยะมากกว่า',
          'ดูรอยบนหน้าไม้ทุกลูก: โดนปลาย → ยืนใกล้ขึ้น · โดนโคน → ยืนห่างขึ้น · โดนต่ำ → ตั้งทีสูงขึ้น',
        ],
        club: 'ไดรเวอร์', drill: highSpin ? 'sim-driver-spin' : 'driver-strike', balls: 15,
        metric: lowSf ? track('sf', 'Smash Factor ไดรเวอร์') : track('spin', 'สปินไดรเวอร์ (รอบ/นาที)'),
        metric2: lowSf && highSpin ? track('spin', 'สปินไดรเวอร์ (รอบ/นาที)') : null,
      });
    } else if (down) {
      steps.push({
        k: 'launch', title: 'ไดรเวอร์ตีขึ้น', why: `มุมเข้าหาลูก ${fmtDeg(drv.aa)} (ตีกดลง) ไดรเวอร์ควรตีขึ้น 0° ขึ้นไป`,
        cues: ['ตั้งทีสูงขึ้น วางลูกตรงส้นเท้าหน้า', 'เอียงไหล่ข้างหลังต่ำลงเล็กน้อยตอนตั้งท่า', 'ปล่อยให้หัวไม้ผ่านจุดต่ำสุดก่อนโดนลูก'],
        club: 'ไดรเวอร์', drill: 'sim-driver-launch', balls: 15, metric: null,
      });
    }
  }

  // 3) เหล็กตีกดลง (ตรงข้ามกับไดรเวอร์)
  const aaIron = METRIC_OF.aaIron(stats);
  if (aaIron != null && aaIron > -1) {
    steps.push({
      k: 'iron', title: 'เหล็กตีกดลง (ไม่ช้อนลูก)',
      why: `เหล็กของคุณมุมเข้าหาลูกเฉลี่ย ${fmtDeg(aaIron)} (ตีขึ้น) เหล็กควรตีกดลง −2° ถึง −5° ลูกจะโดนก่อนดิน ระยะสม่ำเสมอ — ตรงข้ามกับไดรเวอร์ที่ควรตีขึ้น`,
      cues: ['ลูกอยู่กลางเท้า น้ำหนักเท้าหน้าราว 60% ตั้งแต่ตั้งท่า', 'มือนำหน้าหัวไม้ตอนปะทะ ไม่สะบัดข้อมือช้อนลูกให้ลอย (ลอฟต์ของไม้ทำให้ลูกลอยเอง)', 'จบสวิงด้วยน้ำหนักบนเท้าหน้า'],
      club: 'เหล็ก 7 แล้วไล่ไปเหล็กยาว', drill: 'sim-iron-down', balls: 15, metric: track('aaIron', 'มุมเข้าหาลูกของเหล็ก'),
    });
  }

  // 4) ระยะเหล็กไม่สม่ำเสมอ (ถ้ายังมีที่ว่าง)
  const loose = report.clubs.filter((c) => IRONS.has(c.group) && c.metrics.some((m) => m.k === 'window' && m.status === 'far'));
  if (steps.length < 3 && loose.length) {
    steps.push({
      k: 'window', title: 'คุมระยะเหล็กให้สม่ำเสมอ', why: `${loose.map((c) => c.stat.label).join(', ')} ระยะลอยกระจายกว้าง ช็อตเข้ากรีนจึงสั้น/ยาวบ่อย`,
      cues: ['สวิงความเร็วเดิมทุกลูก (80–90%) ไม่ฝืนตีให้ไกล', 'ทำรูทีนเดิมก่อนตีทุกลูก'],
      club: loose[0].stat.label, drill: 'sim-carry-window', balls: 10, metric: null,
    });
  }

  const shown = steps.slice(0, 3);
  const session = shown.length ? [
    { th: 'วอร์มอัพ', balls: 10, text: 'เวดจ์/เหล็กสั้น ครึ่งวงสวิง จับจังหวะ' },
    ...shown.map((s, i) => ({ th: `ขั้นที่ ${i + 1}: ${s.title}`, balls: s.balls, text: s.club })),
    { th: 'ปิดท้าย', balls: 5, text: 'ไดรเวอร์ทีละลูก รูทีนเต็มเหมือนออกรอบ ดูว่าตัวเลขยังอยู่ไหม' },
  ] : [];
  return { steps: shown, later: steps.slice(3), session };
}

// ---------- สรุปเป็นข้อความ (คัดลอกไปดูตอนซ้อม) ----------
export function planText(report, plan, { fmt = (m) => `${Math.round(m / YD)} หลา`, drillName = (id) => id, date = '' } = {}) {
  const L = [];
  L.push(`ShotLog · สรุปจากเครื่องซ้อม${date ? ` ${date}` : ''}`);
  if (report.headline.length) {
    L.push('', '📊 สรุป');
    for (const h of report.headline) L.push(`• ${h.text}`);
  }
  const bw = report.clubs.find((c) => c.group === 'driver' && c.bestWorst)?.bestWorst;
  if (bw) {
    const row = (s) => `${fmt(s.carry)} · Smash ${s.sf?.toFixed(2) ?? '–'} · สปิน ${s.spin == null ? '–' : Math.round(s.spin).toLocaleString('en-US')} · F2P ${s.f2p == null ? '–' : fmtDeg(s.f2p)}`;
    L.push('', '📈 ไดรเวอร์: ลูกดีที่สุด vs ลูกที่เสียระยะมากที่สุด', `• ดีที่สุด: ${row(bw.best)}`, `• เสียมากที่สุด: ${row(bw.worst)}`);
  }
  if (plan.steps.length) {
    L.push('', '🏌️ แผนแก้ไข (ทำตามลำดับ)');
    plan.steps.forEach((s, i) => {
      L.push(`${i + 1}. ${s.title}`, `   ทำไม: ${s.why}`);
      for (const c of s.cues) L.push(`   – ${c}`);
      L.push(`   แบบฝึก: ${drillName(s.drill)} · ${s.balls} ลูก · ${s.club}`);
      if (s.metric?.next != null) L.push(`   เป้าครั้งหน้า: ${s.metric.th} ${s.metric.fmt(s.metric.next)} (ตอนนี้ ${s.metric.fmt(s.metric.now)} · เป้าสุดท้าย ${s.metric.goal})`);
    });
    L.push('', '⏱ ซ้อมครั้งหน้า');
    for (const x of plan.session) L.push(`• ${x.th} — ${x.balls} ลูก · ${x.text}`);
  }
  return L.join('\n');
}
