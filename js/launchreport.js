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
    return { stat: s, group: groupOf(s), shape: shapeSummary(mine), metrics: clubMetrics(s) };
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
