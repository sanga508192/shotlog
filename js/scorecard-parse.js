// แปลงข้อความที่ OCR อ่านได้จากรูปสกอร์การ์ด เป็นพาร์ / HC / ระยะแต่ละแท่นที
// อ่านไม่ได้หรือไม่แน่ใจ = null ให้ผู้ใช้เติมเองในหน้าตรวจสอบ ไม่เดาค่า

const TEES = [
  { re: /black|ดำ|tips?|championship|champ/, name: 'ดำ', color: '#1b1b1b' },
  { re: /gold|ทอง/, name: 'ทอง', color: '#c9a227' },
  { re: /blue|น้ำเงิน|ฟ้า/, name: 'น้ำเงิน', color: '#1d4ed8' },
  { re: /white|ขาว|regular|men/, name: 'ขาว', color: '#ffffff' },
  { re: /yellow|เหลือง/, name: 'เหลือง', color: '#f2c200' },
  { re: /green|เขียว/, name: 'เขียว', color: '#1f8a55' },
  { re: /silver|เงิน/, name: 'เงิน', color: '#9aa4ad' },
  { re: /red|แดง|lad(y|ies)|women|forward/, name: 'แดง', color: '#d7263d' },
];
const PAR_LABEL = /par|พาร์/;
const HCP_LABEL = /h\s*\.?\s*c\s*p?|hdcp|handicap|index|s\s*\.?\s*i\b|stroke|แต้มต่อ/;
const LADIES = /lad(y|ies)|women|หญิง/;
const HOLE_LABEL = /hole|หลุม/;

// ตัวอักษรที่ OCR มักอ่านสลับกับตัวเลข แก้เฉพาะในคำที่เป็นตัวเลขเกือบทั้งหมด
function cleanToken(tok) {
  // แก้เฉพาะคำที่มีตัวเลขอย่างน้อย 1 ตัว และที่เหลือเป็นตัวอักษรที่หน้าตาคล้ายตัวเลขเท่านั้น (ไม่แตะคำอย่าง OUT, IN)
  if (!/\d/.test(tok) || !/^[\doOQDlI|!sSBzZ]+$/.test(tok)) return tok;
  return tok.replace(/[oOQD]/g, '0').replace(/[lI|!]/g, '1').replace(/[sS]/g, '5').replace(/[B]/g, '8').replace(/[zZ]/g, '2');
}

export function tokenizeLine(line) {
  const parts = line.replace(/[,]/g, '').split(/[\s|:;_\[\]()]+/).filter(Boolean).map(cleanToken);
  const nums = [];
  const words = [];
  for (const p of parts) {
    if (/^\d{1,4}$/.test(p)) nums.push(Number(p));
    else if (!nums.length) words.push(p.toLowerCase());
  }
  return { label: words.join(' '), nums };
}

const isSeq = (a) => a.length >= 7 && a.every((v, i) => i === 0 || v === a[i - 1] + 1) && (a[0] === 1 || a[0] === 10);

function classify({ label, nums }) {
  if (nums.length < 7) return null;
  if (HOLE_LABEL.test(label) || isSeq(nums)) {
    const seq = nums.filter((v) => v >= 1 && v <= 18);
    if (isSeq(seq)) return { type: 'hole', start: seq[0], vals: seq };
  }
  const small = nums.filter((v) => v < 20);            // ตัดยอดรวมพาร์ (36/72)
  if (PAR_LABEL.test(label) || (small.every((v) => v >= 3 && v <= 6) && nums.length - small.length <= 3 && small.length >= 7)) {
    if (small.length >= 7 && small.every((v) => v >= 2 && v <= 7)) return { type: 'par', vals: small };
  }
  if (HCP_LABEL.test(label) || (nums.every((v) => v >= 1 && v <= 18) && new Set(nums).size >= nums.length - 1)) {
    const hc = nums.filter((v) => v >= 1 && v <= 18);
    if (hc.length >= 7) return { type: LADIES.test(label) ? 'hc_ladies' : 'hc', vals: hc };
  }
  const yards = nums.filter((v) => v <= 800);          // ตัดยอดรวม OUT/IN/TOTAL
  if (yards.length >= 7 && yards.filter((v) => v >= 50).length >= yards.length - 1) {
    const tee = TEES.find((t) => t.re.test(label));
    return { type: 'tee', vals: yards, tee: tee ?? null, label };
  }
  return null;
}

// จัดค่าลง 18 ช่อง: แถว 18 ค่า = ทั้งสนาม, แถว 9 ค่า = เก้าหน้าหรือเก้าหลัง
function place(target, vals, section) {
  if (vals.length >= 17) {
    vals.slice(0, 18).forEach((v, i) => { target[i] = v; });
    return 'full';
  }
  const off = section === 'back' ? 9 : 0;
  vals.slice(0, 9).forEach((v, i) => { target[off + i] = v; });
  return vals.length === 9 ? 'ok' : 'partial';
}

export function parseScorecardText(text) {
  const rows = String(text || '').split(/\r?\n/).map(tokenizeLine).map((r) => ({ ...r, cls: classify(r) })).filter((r) => r.cls);
  const out = { par: Array(18).fill(null), hc: Array(18).fill(null), hc_ladies: Array(18).fill(null), tees: [], unit: /\bmet(er|re)s?\b|เมตร/i.test(text) ? 'm' : 'yd', warnings: [] };
  let section = 'front';
  const seen = { par: 0, hc: 0, hc_ladies: 0 };
  const teeSeen = new Map();
  let unnamed = 0;
  let holeRowsSeen = false;

  for (const { cls } of rows) {
    if (cls.type === 'hole') {
      holeRowsSeen = true;
      section = cls.start >= 10 ? 'back' : 'front';
      continue;
    }
    // ไม่มีแถวเลขหลุม: แถวชนิดเดิมที่เจอครั้งที่สอง = เก้าหลัง
    const sec = (key) => (holeRowsSeen ? section : (seen[key] ?? teeSeen.get(key) ?? 0) >= 1 ? 'back' : 'front');
    if (cls.type === 'par' || cls.type === 'hc' || cls.type === 'hc_ladies') {
      const r = place(out[cls.type], cls.vals, cls.vals.length >= 17 ? null : sec(cls.type));
      if (r === 'partial') out.warnings.push(`แถว${cls.type === 'par' ? 'พาร์' : ' HC'} อ่านได้ไม่ครบ ${cls.vals.length} ค่า`);
      seen[cls.type]++;
    } else if (cls.type === 'tee') {
      const key = cls.tee ? cls.tee.name : `?${cls.label}`;
      let tee = out.tees.find((t) => t.key === key);
      if (!tee) {
        if (!cls.tee) unnamed++;
        tee = { key, name: cls.tee?.name ?? `แท่น ${unnamed}`, color: cls.tee?.color ?? '#9aa4ad', yards: Array(18).fill(null) };
        out.tees.push(tee);
      }
      const r = place(tee.yards, cls.vals, cls.vals.length >= 17 ? null : sec(key));
      if (r === 'partial') out.warnings.push(`แถวระยะ${tee.name} อ่านได้ไม่ครบ ${cls.vals.length} ค่า`);
      teeSeen.set(key, (teeSeen.get(key) ?? 0) + 1);
    }
  }
  const backFilled = [out.par, out.hc, ...out.tees.map((t) => t.yards)].some((a) => a.slice(9).some((v) => v != null));
  out.holes = backFilled ? 18 : 9;
  if (out.holes === 9) {
    out.par = out.par.slice(0, 9); out.hc = out.hc.slice(0, 9); out.hc_ladies = out.hc_ladies.slice(0, 9);
    out.tees.forEach((t) => { t.yards = t.yards.slice(0, 9); });
  }
  if (out.hc_ladies.every((v) => v == null)) delete out.hc_ladies;
  out.tees = out.tees.map(({ key, ...t }) => t);
  // เรียงแท่นจากยาวไปสั้น
  const len = (t) => t.yards.reduce((a, v) => a + (v || 0), 0);
  out.tees.sort((a, b) => len(b) - len(a));
  return out;
}

// ตรวจความถูกต้องสำหรับหน้าตรวจสอบก่อนบันทึก
export function validateCard(card) {
  const n = card.par.length;
  const issues = {};   // key "field:index" → ข้อความ
  const add = (k, msg) => { issues[k] = msg; };
  card.par.forEach((p, i) => {
    if (p == null) add(`par:${i}`, 'ยังไม่มีพาร์');
    else if (p < 3 || p > 6) add(`par:${i}`, 'พาร์ควรเป็น 3–6');
  });
  const hcCount = new Map();
  card.hc.forEach((h) => { if (h != null) hcCount.set(h, (hcCount.get(h) || 0) + 1); });
  card.hc.forEach((h, i) => {
    if (h == null) return;
    if (h < 1 || h > 18) add(`hc:${i}`, 'HC ควรเป็น 1–18');
    else if (hcCount.get(h) > 1) add(`hc:${i}`, `HC ${h} ซ้ำ`);
  });
  card.tees.forEach((t, ti) => {
    t.yards.forEach((y, i) => {
      if (y == null) return;
      const p = card.par[i];
      if (y < 50 || y > 700) add(`tee${ti}:${i}`, 'ระยะผิดปกติ');
      else if (p === 3 && y > 280) add(`tee${ti}:${i}`, 'ยาวเกินไปสำหรับพาร์ 3');
      else if (p === 5 && y < 330 && card.unit !== 'm') add(`tee${ti}:${i}`, 'สั้นเกินไปสำหรับพาร์ 5');
    });
  });
  const sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
  const parTotal = sum(card.par);
  return {
    issues,
    count: Object.keys(issues).length,
    parTotal,
    parFront: sum(card.par.slice(0, 9)),
    parBack: n > 9 ? sum(card.par.slice(9)) : null,
    hcMissing: card.hc.filter((h) => h == null).length,
    teeTotals: card.tees.map((t) => (t.yards.every((y) => y != null) ? sum(t.yards) : null)),
    complete: card.par.every((p) => p != null),
  };
}

// ---------- จากตารางที่จัดตามคอลัมน์แล้ว (ดู scorecard-ocr.js gridFromWords) ----------
// rows: [{ label, start: 1 | 10, vals: [9 ค่า หรือ null] }] ช่องที่อ่านไม่ได้เป็น null อยู่ในตำแหน่งเดิม ไม่เลื่อน

function classifyGridRow({ label, vals }) {
  const v = vals.filter((x) => x != null);
  if (v.length < 4) return null;
  const tee = TEES.find((t) => t.re.test(label));
  if (PAR_LABEL.test(label) || (!tee && !HCP_LABEL.test(label) && v.every((x) => x >= 3 && x <= 6))) return v.every((x) => x >= 2 && x <= 7) ? 'par' : null;
  if (HCP_LABEL.test(label) || (!tee && v.every((x) => x >= 1 && x <= 18) && v.some((x) => x < 3 || x > 6))) {
    return v.every((x) => x >= 1 && x <= 18) ? (LADIES.test(label) ? 'hc_ladies' : 'hc') : null;
  }
  if (v.filter((x) => x >= 50 && x <= 800).length >= v.length - 1) return 'tee';
  return null;
}

const RANGE = { par: [3, 6], hc: [1, 18], hc_ladies: [1, 18], tee: [50, 800] };
const LOW_CONF = 60;

export function cardFromGrid(rows, { unit = 'yd' } = {}) {
  const out = { par: Array(18).fill(null), hc: Array(18).fill(null), hc_ladies: Array(18).fill(null), tees: [], unit, warnings: [] };
  const flags = { par: Array(18).fill(null), hc: Array(18).fill(null), hc_ladies: Array(18).fill(null) };
  let unnamed = 0;
  for (const r of rows) {
    const type = classifyGridRow(r);
    if (!type) continue;
    const off = r.start >= 10 ? 9 : 0;
    const [lo, hi] = RANGE[type];
    // ค่านอกช่วงที่เป็นไปได้ = อ่านผิดแน่นอน → เว้นว่างให้ผู้ใช้กรอก
    const vals = r.vals.map((x) => (x != null && x >= lo && x <= hi ? x : null));
    const fl = vals.map((x, i) => (x != null && r.conf?.[i] != null && r.conf[i] < LOW_CONF ? 'low' : null));
    // เทียบกับยอดรวมที่พิมพ์บนการ์ด (แถวพาร์และระยะ)
    if (r.total != null && type !== 'hc' && type !== 'hc_ladies') {
      const known = vals.filter((x) => x != null);
      const sum = known.reduce((a, b) => a + b, 0);
      if (known.length === 9 && sum !== r.total) {
        fl.forEach((_, i) => { fl[i] = fl[i] ?? 'sum'; });
        out.warnings.push(`แถว${type === 'par' ? 'พาร์' : `ระยะ${r.label ? ` ${r.label}` : ''}`} หลุม ${off + 1}–${off + 9} รวมได้ ${sum} แต่บนการ์ดพิมพ์ ${r.total}`);
      } else if (known.length === 8) {
        const i = vals.findIndex((x) => x == null);
        const d = r.total - sum;
        if (d >= lo && d <= hi) { vals[i] = d; fl[i] = 'derived'; }
      }
    }
    const put = (arr, farr) => vals.forEach((x, i) => { if (x != null && arr[off + i] == null) { arr[off + i] = x; farr[off + i] = fl[i]; } });
    if (type === 'tee') {
      const t = TEES.find((x) => x.re.test(r.label));
      const key = t ? t.name : `?${r.label}`;
      let tee = out.tees.find((x) => x.key === key);
      if (!tee) {
        if (!t) unnamed++;
        tee = { key, name: t?.name ?? `แท่น ${unnamed}`, color: t?.color ?? '#9aa4ad', yards: Array(18).fill(null), flags: Array(18).fill(null) };
        out.tees.push(tee);
      }
      put(tee.yards, tee.flags);
    } else put(out[type], flags[type]);
  }
  const backFilled = [out.par, out.hc, ...out.tees.map((t) => t.yards)].some((a) => a.slice(9).some((v) => v != null));
  out.holes = backFilled ? 18 : 9;
  if (out.holes === 9) {
    out.par = out.par.slice(0, 9); out.hc = out.hc.slice(0, 9); out.hc_ladies = out.hc_ladies.slice(0, 9);
    out.tees.forEach((t) => { t.yards = t.yards.slice(0, 9); });
  }
  if (out.hc_ladies.every((v) => v == null)) delete out.hc_ladies;
  const len = (t) => t.yards.reduce((a, v) => a + (v || 0), 0);
  out.tees.sort((a, b) => len(b) - len(a));
  // เครื่องหมายต่อช่อง ใช้คีย์เดียวกับ validateCard: par:i, hc:i, tee{n}:i
  out.flags = {};
  const n = out.holes;
  flags.par.slice(0, n).forEach((f, i) => { if (f) out.flags[`par:${i}`] = f; });
  flags.hc.slice(0, n).forEach((f, i) => { if (f) out.flags[`hc:${i}`] = f; });
  out.tees.forEach((t, ti) => t.flags.slice(0, n).forEach((f, i) => { if (f) out.flags[`tee${ti}:${i}`] = f; }));
  out.tees = out.tees.map(({ key, flags: _f, ...t }) => t);
  const blanks = out.par.filter((v) => v == null).length + out.hc.filter((v) => v == null).length;
  if (blanks) out.warnings.push(`มีช่องที่อ่านไม่ได้ ${blanks} ช่องในแถวพาร์/HC`);
  return out;
}

// เลือกผลที่อ่านได้ครบกว่าระหว่างสองวิธี
export function filledCount(card) {
  const n = (a) => a.filter((v) => v != null).length;
  return n(card.par) * 3 + n(card.hc) * 2 + card.tees.reduce((s, t) => s + n(t.yards), 0);
}

// รวมผลจากหลายรูป (เช่น ด้านเก้าหน้า + ด้านเก้าหลัง): เติมช่องที่ยังว่าง ไม่ทับค่าที่มีแล้ว
export function mergeCards(a, b) {
  if (!a) return b;
  if (!b) return a;
  const holes = Math.max(a.holes, b.holes);
  const pad = (arr) => [...arr, ...Array(holes - arr.length).fill(null)];
  const out = { ...a, holes, par: pad(a.par), hc: pad(a.hc), tees: a.tees.map((t) => ({ ...t, yards: pad(t.yards) })), flags: { ...a.flags }, warnings: [...a.warnings, ...b.warnings] };
  const fill = (dst, src, key) => src.forEach((v, i) => { if (v != null && dst[i] == null) { dst[i] = v; if (b.flags?.[`${key}:${i}`]) out.flags[`${key}:${i}`] = b.flags[`${key}:${i}`]; } });
  fill(out.par, b.par, 'par');
  fill(out.hc, b.hc, 'hc');
  b.tees.forEach((t, bi) => {
    let ti = out.tees.findIndex((x) => x.name === t.name);
    if (ti < 0) { out.tees.push({ ...t, yards: Array(holes).fill(null) }); ti = out.tees.length - 1; }
    t.yards.forEach((v, i) => {
      if (v != null && out.tees[ti].yards[i] == null) {
        out.tees[ti].yards[i] = v;
        if (b.flags?.[`tee${bi}:${i}`]) out.flags[`tee${ti}:${i}`] = b.flags[`tee${bi}:${i}`];
      }
    });
  });
  return out;
}
