// Strokes Gained: ช็อตนี้ทำให้ "จำนวนสโตรกที่ควรใช้จนจบหลุม" ลดลงเกินหรือไม่ถึง 1 สโตรก
// SG ของช็อต = ค่าคาดหมายก่อนตี − ค่าคาดหมายหลังตี − 1 − ลูกโทษจากช็อตนั้น
// ค่าคาดหมายเป็นค่าโดยประมาณของนักกอล์ฟแฮนดิแคป 0 (ปัดจากตัวเลขที่เผยแพร่ทั่วไป) ใช้เทียบหมวดกันเอง ไม่ใช่สถิติทางการ

const YD = 0.9144;

// [ระยะ, สโตรกที่ควรใช้จนจบหลุม] ระยะเป็นหลา ยกเว้นบนกรีนเป็นฟุต
const TABLE = {
  tee: [[100, 2.92], [150, 3.0], [200, 3.2], [250, 3.45], [300, 3.71], [350, 3.86], [400, 3.99], [450, 4.17], [500, 4.41], [550, 4.63], [600, 4.82], [650, 5.0]],
  fairway: [[5, 2.1], [10, 2.18], [20, 2.4], [40, 2.6], [60, 2.7], [80, 2.75], [100, 2.8], [120, 2.85], [140, 2.91], [160, 2.98], [180, 3.08], [200, 3.19], [220, 3.32], [240, 3.45], [260, 3.58], [300, 3.8], [400, 4.2], [600, 4.9]],
  rough: [[5, 2.2], [10, 2.35], [20, 2.59], [40, 2.78], [60, 2.91], [80, 2.96], [100, 3.02], [120, 3.08], [140, 3.15], [160, 3.23], [180, 3.31], [200, 3.42], [220, 3.53], [240, 3.64], [300, 3.9], [400, 4.3], [600, 5.0]],
  bunker: [[5, 2.35], [10, 2.43], [20, 2.53], [40, 2.82], [60, 3.15], [80, 3.24], [100, 3.23], [120, 3.21], [140, 3.22], [160, 3.28], [180, 3.4], [200, 3.55], [240, 3.84], [300, 4.1]],
  recovery: [[50, 3.5], [100, 3.6], [150, 3.75], [200, 3.87], [250, 4.0], [300, 4.2], [400, 4.5]],
  green: [[1, 1.0], [2, 1.01], [3, 1.04], [4, 1.13], [5, 1.23], [6, 1.34], [8, 1.5], [10, 1.61], [15, 1.78], [20, 1.87], [30, 1.98], [40, 2.06], [50, 2.14], [60, 2.21], [90, 2.4], [120, 2.55]],
};
const LIE_TABLE = { tee: 'tee', fairway: 'fairway', fringe: 'fairway', rough: 'rough', bunker: 'bunker', green: 'green', other: 'recovery' };

function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (x <= x1) {
      const [x0, y0] = pts[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  const [xa, ya] = pts.at(-2), [xb, yb] = pts.at(-1);
  return yb + ((yb - ya) * (x - xb)) / (xb - xa);
}

// สโตรกที่ควรใช้จนจบหลุม จากจุดที่ลูกอยู่ (ระยะเป็นหลา)
export function expectedStrokes(lie, yards) {
  const t = TABLE[LIE_TABLE[lie]];
  if (!t || !Number.isFinite(yards) || yards < 0) return null;
  return interp(t, lie === 'green' ? yards * 3 : yards);
}

export const SG_CATS = [
  { k: 'tee', th: 'ทีออฟ', sub: 'ช็อตแรกของหลุมพาร์ 4–5', icon: '🏌️' },
  { k: 'approach', th: 'ช็อตเข้ากรีน', sub: 'ช็อตที่ห่างหลุมเกิน 100 หลา รวมทีออฟพาร์ 3', icon: '🎯' },
  { k: 'short', th: 'ลูกสั้น', sub: 'ภายใน 100 หลา ที่ยังไม่ถึงกรีน', icon: '⛳' },
  { k: 'putt', th: 'พัต', sub: 'ทุกสโตรกบนกรีน', icon: '🟢' },
];

// สัดส่วนสโตรกที่นักกอล์ฟระดับต่าง ๆ เสียเทียบแฮนดิแคป 0 ในแต่ละหมวด (ค่าวางแผนโดยประมาณ:
// งานวิจัยสถิติกอล์ฟพบว่าช็อตนอก 100 หลาเป็นที่มาของความต่างราวสองในสาม)
export const SG_SHARE = { tee: 0.25, approach: 0.4, short: 0.18, putt: 0.17 };

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const toYd = (v, unit) => { const n = num(v); return n == null ? null : unit === 'yd' ? n : n / YD; };

function category(state, par) {
  if (state.lie === 'green') return 'putt';
  if (state.lie === 'tee' && par >= 4) return 'tee';
  return state.yd > 100 ? 'approach' : 'short';
}

// SG รายช็อตของหลุมที่จบแล้ว คืน null ถ้าหลุมยังไม่จบ · complete = ทุกช็อตมีข้อมูลพอ
export function holeSG(hole, shots, pens) {
  const par = Number.isInteger(hole.par) ? hole.par : null;
  const list = shots.filter((s) => s.counted !== false).sort((a, b) => a.sequence - b.sequence);
  if (!par || hole.status !== 'done' || !list.length) return null;
  const unit = (s) => (s.distance_unit === 'yd' ? 'yd' : 'm');
  const before = list.map((s, i) => {
    const prev = list[i - 1];
    const lie = s.start_lie ?? (i === 0 ? 'tee' : prev?.end_lie && prev.end_lie !== 'holed' ? prev.end_lie : null)
      ?? (s.shot_type === 'putt' ? 'green' : s.shot_type === 'bunker' ? 'bunker' : null);
    let yd = toYd(s.distance_before, unit(s));
    if (yd == null && prev) yd = toYd(prev.distance_after, unit(prev));
    if (yd == null && i === 0 && lie === 'tee') yd = toYd(hole.distance, hole.distance_unit === 'yd' ? 'yd' : 'm');
    return lie && yd != null ? { lie, yd } : null;
  });
  const penOf = (id) => pens.filter((p) => p.related_shot_id_optional === id).reduce((a, p) => a + (Number(p.strokes) || 0), 0);
  const loose = pens.filter((p) => !list.some((s) => s.id === p.related_shot_id_optional)).reduce((a, p) => a + (Number(p.strokes) || 0), 0);
  const out = [];
  list.forEach((s, i) => {
    const b = before[i];
    const last = i === list.length - 1;
    let after = null;
    if (!last) after = before[i + 1] ? expectedStrokes(before[i + 1].lie, before[i + 1].yd) : null;
    else if (s.holed || s.end_lie === 'holed') after = 0;
    else if (hole.finish === 'picked_up') after = 1;   // กิมมี่ นับเป็นอีก 1 สโตรก
    const eb = b ? expectedStrokes(b.lie, b.yd) : null;
    out.push({ shot: s, cat: b ? category(b, par) : null, sg: eb != null && after != null ? eb - after - 1 - penOf(s.id) : null });
  });
  return { hole, shots: out, loosePen: loose, complete: loose === 0 && out.every((x) => x.sg != null) };
}

// รวม SG ต่อ 18 หลุม จากหลุมที่ข้อมูลครบ พร้อมค่าที่คาดสำหรับเป้าหมาย
export function analyzeSG({ rounds, holesOf, shotsOf, penaltiesOf }, goalScore, { maxRounds = 10 } = {}) {
  const ids = rounds.filter((r) => r.status !== 'playing' && r.shot_logging !== false)
    .sort((a, b) => String(a.played_at || '').localeCompare(String(b.played_at || '')) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .map((r) => r.id).slice(-maxRounds);
  let logged = 0, complete = 0;
  const sum = { tee: 0, approach: 0, short: 0, putt: 0 };
  const count = { tee: 0, approach: 0, short: 0, putt: 0 };
  const worst = [];
  for (const id of ids) {
    for (const h of holesOf(id)) {
      const shots = shotsOf(h.id);
      if (!shots.length) continue;
      logged++;
      const r = holeSG(h, shots, penaltiesOf(h.id));
      if (!r?.complete) continue;
      complete++;
      for (const x of r.shots) {
        sum[x.cat] += x.sg; count[x.cat]++;
        worst.push({ ...x, hole: h, roundId: id });
      }
    }
  }
  const gap = Math.max(0, (goalScore ?? 72) - 72);
  const cats = SG_CATS.map((c) => ({
    ...c,
    yours: complete ? (sum[c.k] * 18) / complete : null,
    target: -gap * SG_SHARE[c.k],
    shots: count[c.k],
  })).map((c) => ({ ...c, diff: c.yours == null ? null : c.yours - c.target }));
  const total = complete ? cats.reduce((a, c) => a + c.yours, 0) : null;
  worst.sort((a, b) => a.sg - b.sg);
  return { cats, total, holesComplete: complete, holesLogged: logged, worst: worst.slice(0, 5) };
}
