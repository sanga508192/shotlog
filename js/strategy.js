// แผนทีออฟรายหลุม: เลือกไม้และจุดเล็งจากระยะไม้จริง ลูกที่พลาดบ่อย จุดอันตรายของหลุม และประวัติหลุมนี้
// หลักคิดแบบโค้ช: เล่นด้วยลูกที่มีจริงวันนี้ ไม่ใช่ลูกที่อยากได้ · ไม้ที่ไกลกว่าแค่นิดเดียวไม่คุ้มความเสี่ยง
import { offLine } from './shotgeo.js';

const YD = 0.9144;
const DANGER = new Set(['water', 'other']);   // น้ำ และจุดอื่น (เช่น OB ที่ผู้ใช้ปักไว้) · บังเกอร์ไม่ถือว่าเสียสโตรกแน่นอน
const opposite = (side) => (side === 'right' ? 'left' : 'right');
const TH = { left: 'ซ้าย', right: 'ขวา' };

// อันตรายเทียบไม้: ลูกตกในช่วงระยะปกติของไม้นี้ และอยู่ฝั่งที่พลาดบ่อยหรือขวางแนว
export function hazardRisk(h, club, missSide) {
  if (!club || h.along == null) return null;
  const lo = (club.p25 ?? club.median * 0.94) - 12, hi = (club.p75 ?? club.median * 1.05) + 12;
  if (h.along < lo || h.along > hi) return null;
  const across = Math.abs(h.off) < 15;
  const side = h.off > 0 ? 'right' : 'left';
  if (across) return { kind: 'carry', h };
  if (missSide && side === missSide) return { kind: 'miss', h };
  return null;
}

// clubs = แถวระยะไม้ (median/p25/p75 เป็นเมตร, category) · hazards = [{ kind, along, off }] เทียบแนวแท่นที→กรีน
// history = { n, pen } ทีออฟหลุมนี้ในรอบก่อน ๆ · missSide = 'left' | 'right' | null (ลูกที่พลาดบ่อยของผู้เล่น)
export function teePlan({ par, lengthM = null, hazards = [], history = null, clubs = [], missSide = null, fmt = (m) => `${Math.round(m / YD)} หลา` }) {
  if (!Number.isInteger(par)) return null;
  const rows = clubs.filter((c) => c.n >= 3 && c.category !== 'putter' && c.median > 0).sort((a, b) => b.median - a.median);
  if (!rows.length) return null;
  const notes = [];

  if (par === 3) {
    if (!lengthM) return null;
    const c = rows.reduce((best, r) => (Math.abs(r.median - lengthM) < Math.abs(best.median - lengthM) ? r : best), rows[0]);
    const aim = missSide ? `กลางกรีน เยื้อง${TH[opposite(missSide)]}เล็กน้อย (ลูกคุณมักไป${TH[missSide]})` : 'กลางกรีน ไม่เล็งธง';
    for (const h of hazards) if (DANGER.has(h.kind) && Math.abs(h.along - lengthM) < 30) notes.push(`${h.kind === 'water' ? 'น้ำ' : 'จุดอันตราย'}ฝั่ง${TH[h.off > 0 ? 'right' : 'left']}ของกรีน — พลาดไปอีกฝั่งดีกว่า`);
    return { club: c, aim, notes, remain: null, why: `ระยะ ${fmt(lengthM)} · ${c.label} ปกติ ${fmt(c.median)}` };
  }

  const drv = rows.find((r) => r.category === 'driver') ?? null;
  const alt = rows.find((r) => r.category === 'wood') ?? rows.find((r) => r.category === 'hybrid') ?? rows.find((r) => r.category !== 'driver') ?? null;
  const danger = hazards.filter((h) => DANGER.has(h.kind));
  const risk = (club) => danger.map((h) => hazardRisk(h, club, missSide)).filter(Boolean);
  let pick = drv ?? alt;
  let why = drv ? 'ไม้ทีออฟปกติ' : '';
  if (drv && alt && alt !== drv) {
    const gap = drv.median - alt.median;
    const rd = risk(drv);
    // ไม้ที่ยาวที่สุดที่ไม่ถึงจุดอันตราย (อย่างน้อย 120 หลา) ใช้วางลูก
    const safe = rd.length ? rows.find((r) => r !== drv && r.median >= 120 * YD && !risk(r).length) : null;
    if (gap < 10) {
      pick = alt;
      why = `ไดรเวอร์ไกลกว่า ${alt.label} แค่ ${fmt(Math.max(0, gap))} ใช้ ${alt.label} คุมทิศง่ายกว่า`;
    } else if (history && history.n >= 2 && history.pen >= 2 && history.penDriver >= 2) {
      pick = alt;
      why = `ทีออฟหลุมนี้ด้วยไดรเวอร์โดนลูกโทษ ${history.penDriver} จาก ${history.n} ครั้ง`;
    } else if (safe) {
      pick = safe;
      const h = rd[0].h;
      why = rd[0].kind === 'carry'
        ? `${h.kind === 'water' ? 'น้ำ' : 'จุดอันตราย'}ขวางที่ ${fmt(h.along)} อยู่ในช่วงระยะไดรเวอร์ (${fmt(drv.p25 ?? drv.median)}–${fmt(drv.p75 ?? drv.median)}) ${safe.label} วางลูกก่อนถึง`
        : `${h.kind === 'water' ? 'น้ำ' : 'จุดอันตราย'}ฝั่ง${TH[missSide]}ที่ ${fmt(h.along)} ตรงกับระยะไดรเวอร์และฝั่งที่คุณพลาดบ่อย ${safe.label} ไม่ถึง`;
    } else if (lengthM && lengthM < drv.median + 60 && alt.median + 50 < lengthM) {
      pick = alt;
      why = `หลุมสั้น (${fmt(lengthM)}) ${alt.label} ก็เหลือระยะเข้ากรีนสั้นพอ`;
    }
  }
  for (const r of risk(pick)) {
    const h = r.h;
    notes.push(r.kind === 'carry'
      ? `${h.kind === 'water' ? 'น้ำ' : 'จุดอันตราย'}ขวางที่ ${fmt(h.along)} ต้องลอยข้ามให้ได้แน่นอน`
      : `ฝั่ง${TH[missSide]}มี${h.kind === 'water' ? 'น้ำ' : 'จุดอันตราย'}ที่ ${fmt(h.along)} — ฝั่งที่คุณพลาดบ่อย`);
  }
  // จุดเล็ง: เผื่อฝั่งที่พลาดบ่อย ถ้าอีกฝั่งมีอันตรายในช่วงระยะ ให้เล็งกลาง
  let aim = 'กลางแฟร์เวย์';
  if (missSide) {
    const other = opposite(missSide);
    const otherDanger = danger.some((h) => (h.off > 0 ? 'right' : 'left') === other && Math.abs(h.off) >= 15 && hazardRisk({ ...h, off: 0 }, pick, null));
    aim = otherDanger
      ? `กลางแฟร์เวย์ (ฝั่ง${TH[other]}มีอันตราย อย่าเล็งเผื่อมากเกิน)`
      : `ตั้งทีฝั่ง${TH[missSide]}ของแท่น เล็งขอบ${TH[other]}ของแฟร์เวย์ ให้ลูกที่โค้ง${TH[missSide]}กลับเข้ากลาง`;
  }
  if (history?.n >= 2 && history.pen) notes.push(`ทีออฟหลุมนี้ที่ผ่านมา ${history.n} ครั้ง โดนลูกโทษ ${history.pen} ครั้ง`);
  const remain = lengthM ? Math.max(0, lengthM - (pick.total ?? pick.median)) : null;
  return { club: pick, aim, notes, remain, why };
}

// อันตรายของหลุมเทียบแนวแท่นที→กรีน (along = ระยะจากแท่นที, off = ออกซ้าย(−)/ขวา(+))
export function hazardsAlong(pins) {
  if (!pins?.tee || !pins?.green) return [];
  return (pins.hazards || []).map((z) => {
    const o = offLine(pins.tee, pins.green, z);
    return o ? { kind: z.kind, along: o.along, off: o.off } : null;
  }).filter(Boolean);
}
