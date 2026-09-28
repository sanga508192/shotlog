// ข้อมูลจากเครื่องซ้อม (launch monitor) เช่น Garmin Approach R10: อ่านไฟล์ CSV → วิเคราะห์ระยะไม้ ความสม่ำเสมอ ทิศทาง → เลือกแบบฝึก
// เก็บเป็นบันทึกซ้อมชนิด kind: 'launch' (ซิงก์ไปกับบัญชีเหมือนบันทึกซ้อมอื่น) · หน่วยภายใน: ระยะเมตร ความเร็ว m/s มุมองศา
// ไฟล์ของ Garmin Golf: หัวคอลัมน์เป็นภาษาของเครื่อง หน่วยตามที่ตั้งในแอป (บางรุ่นมีแถวหน่วยใต้หัวคอลัมน์) ลำดับคอลัมน์เหมือนกันทุกภาษา
// ไฟล์รุ่นใหม่ (ปี 2026) แทรกคอลัมน์ "แบรนด์/รุ่น" หลังชื่อไม้ และเพิ่มคอลัมน์เป้าหมาย/จังหวะสวิงต่อท้าย
// บางช็อตไม่มีระยะลอย (เครื่องวัดไม่ได้) แต่ยังมีความเร็ว หน้าไม้ แนวสวิง → ใช้วิเคราะห์วงสวิงได้ ไม่นับในระยะ

const YD = 0.9144;
export const DIST_UNITS = [{ v: 'yd', th: 'หลา', f: YD }, { v: 'm', th: 'เมตร', f: 1 }];
export const SPEED_UNITS = [{ v: 'mph', th: 'mph', f: 0.44704 }, { v: 'kmh', th: 'km/h', f: 1 / 3.6 }, { v: 'ms', th: 'm/s', f: 1 }];
const factor = (list, v) => list.find((u) => u.v === v)?.f ?? 1;

// pos = ลำดับคอลัมน์ในไฟล์ Garmin (เริ่ม 0) ใช้เมื่ออ่านหัวคอลัมน์ไม่ออก (เช่น ภาษาที่ยังไม่รู้จัก)
export const METRICS = [
  { k: 'date', th: 'วันเวลา', pos: 0, text: true, names: ['Date', 'Datum', 'Fecha', 'Data', 'วันที่'] },
  { k: 'club', th: 'ไม้', pos: 3, text: true, names: ['Club Type', 'Schlägerart', 'Tipo de palo', 'Type club', 'Tipo di bastone', 'Type de club', 'ประเภทไม้'] },
  { k: 'clubName', th: 'ชื่อไม้', pos: 2, text: true, names: ['Club Name', 'Schlägername', 'Nombre del palo', 'Clubnaam', 'ชื่อไม้'] },
  { k: 'cs', th: 'ความเร็วหัวไม้', pos: 4, unit: 'speed', names: ['Club Speed', 'Schl.gsch.', 'Schlägergeschwindigkeit', 'Vel. palo', 'Clubsnelh.', 'ไม้เร็ว', 'ความเร็วไม้', 'ความเร็วหัวไม้'] },
  { k: 'aa', th: 'มุมเข้าปะทะ', pos: 5, names: ['Attack Angle', 'Anstellwinkel', 'Ángulo de ataque', 'Aanvalshoek', 'มุมเข้าลูก'] },
  { k: 'path', th: 'แนวสวิง', pos: 6, names: ['Club Path', 'Schwungbahn', 'Línea cabeza del palo', 'Clubtraject', 'เส้นทางของไม้'] },
  { k: 'face', th: 'หน้าไม้', pos: 7, names: ['Club Face', 'Schlagfläche', 'Cara del palo', 'Slagvlak van de club', 'หน้าไม้กอล์ฟ'] },
  { k: 'f2p', th: 'หน้าไม้เทียบแนวสวิง', pos: 8, names: ['Face to Path', 'Schlagflächenstellung', 'Cara a línea', 'Slagvlak t.o.v. traject', 'หน้ากับเส้นทาง'] },
  { k: 'bs', th: 'ความเร็วลูก', pos: 9, unit: 'speed', names: ['Ball Speed', 'Ballgeschwindigkeit', 'Velocidad de la pelota', 'Balsnelheid', 'ความเร็วลูก'] },
  { k: 'sf', th: 'Smash Factor', pos: 10, names: ['Smash Factor', 'Smash-Faktor', 'Calidad del impacto', 'Smashfactor', 'ปัจจัยการชนกระทบ'] },
  { k: 'la', th: 'มุมออกตัว', pos: 11, names: ['Launch Angle', 'Abflugwinkel', 'Ángulo de lanzamiento', 'Slaghoek', 'มุมเปิด'] },
  { k: 'ld', th: 'ทิศออกตัว', pos: 12, names: ['Launch Direction', 'Abflugrichtung', 'Dirección de lanzamiento', 'Slagrichting', 'ทิศทางการเปิด'] },
  { k: 'spin', th: 'สปิน', pos: 15, names: ['Spin Rate', 'Drehrate', 'Velocidad de rotación', 'Spinsnelheid', 'อัตราการหมุน'] },
  { k: 'carry', th: 'ระยะลอย', pos: 19, unit: 'dist', names: ['Carry Distance', 'Carry-Distanz', 'Dist.vuelo', 'Carry-afstand', 'Distanza di volo', 'ระยะทางในการใช้'] },
  { k: 'cdev', th: 'เบี่ยงซ้าย/ขวาที่จุดตก', pos: 21, unit: 'dist', names: ['Carry Deviation Distance', 'Carry-Abweichungsdistanz', 'Distancia de desviación de vuelo', 'Carry-afwijkingsafstand', 'การใช้การเบี่ยงเบนระยะทาง'] },
  { k: 'total', th: 'ระยะรวม', pos: 22, unit: 'dist', names: ['Total Distance', 'Gesamtstrecke', 'Distancia total', 'Totale afstand', 'ระยะทางทั้งหมด'] },
];

// คอลัมน์ที่เก็บต่อช็อต (ลำดับคงที่ เก็บเป็นอาร์เรย์เพื่อให้บันทึกเล็ก)
export const SHOT_COLS = ['club', 'cs', 'bs', 'sf', 'la', 'ld', 'spin', 'carry', 'cdev', 'total', 'aa', 'path', 'face', 'f2p'];
export const MAX_SHOTS_PER_RECORD = 400;

const norm = (s) => String(s ?? '').normalize('NFC').replace(/[​-‍﻿]/g, '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '');

// ---------- อ่าน CSV ----------

function detectDelimiter(line) {
  const count = (ch) => { let n = 0, q = false; for (const c of line) { if (c === '"') q = !q; else if (!q && c === ch) n++; } return n; };
  return [',', ';', '\t'].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = detectDelimiter(first);
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return { delim, rows };
}

// ตัวเลขจากไฟล์ (จุลภาคคั่นหลักพันได้) · ทศนิยมแบบจุลภาคแปลงตอนอ่านไฟล์ที่คั่นด้วย ; หรือ tab
export function num(v) {
  const s = String(v ?? '').trim().replace(/\s/g, '');
  if (!s) return null;
  const n = Number(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s);
  return Number.isFinite(n) ? n : null;
}

// แถวหน่วย (เช่น [mph] [yds]) ใต้หัวคอลัมน์ ถ้ามี
function unitRow(row) {
  const cells = row.filter((v) => v.trim());
  return cells.length >= 3 && cells.filter((v) => /^\[.*\]$/.test(v.trim())).length / cells.length >= 0.6;
}
function unitsFromRow(row, cols) {
  const tok = (k) => (cols[k] != null ? String(row[cols[k]] ?? '').toLowerCase() : '');
  const d = tok('carry'), s = tok('bs') || tok('cs');
  return {
    dist: /yd|yard|หลา/.test(d) ? 'yd' : /\[(m|meters?|metres?|ม\.?|เมตร)\]/.test(d) ? 'm' : null,
    speed: /mph|ไมล์/.test(s) ? 'mph' : /km|กม/.test(s) ? 'kmh' : /m\/s|mps|ม\.\/ว/.test(s) ? 'ms' : null,
  };
}

const hasShotCols = (cols) => (cols.club != null || cols.clubName != null) && (cols.carry != null || cols.bs != null);

// จับคู่คอลัมน์: ตามชื่อก่อน ถ้าหาไม้/ระยะไม่เจอ ใช้ลำดับมาตรฐานของ Garmin
// (ไฟล์รุ่นใหม่มีคอลัมน์ "แบรนด์/รุ่น" แทรกที่ลำดับ 3 → คอลัมน์ถัดจากนั้นเลื่อนไป 1)
export function mapColumns(header) {
  const cols = {};
  const names = header.map(norm);
  for (const m of METRICS) {
    const i = names.findIndex((h) => m.names.some((n) => norm(n) === h));
    if (i >= 0) cols[m.k] = i;
  }
  let byPosition = false;
  if (!hasShotCols(cols) && header.length >= 23) {
    byPosition = true;
    const shift = header.length >= 38 ? 1 : 0;
    for (const m of METRICS) if (cols[m.k] == null) cols[m.k] = m.pos + (m.pos >= 3 ? shift : 0);
  }
  return { cols, byPosition };
}

// เดาหน่วยความเร็วจากความสัมพันธ์ระหว่างความเร็วลูกกับระยะลอย (ระยะลอยเป็นเมตร ≈ 2.2–3.8 เท่าของความเร็วลูกเป็น m/s)
export function guessUnits(rows, cols) {
  const pairs = rows.map((r) => [num(r[cols.carry]), num(r[cols.bs])]).filter(([c, b]) => c > 20 && b > 5);
  if (!pairs.length) return { dist: 'yd', speed: 'mph' };
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const ratio = med(pairs.map(([c, b]) => c / b));
  let best = null;
  for (const sp of SPEED_UNITS) {
    for (const d of DIST_UNITS) {
      const r = (ratio * d.f) / sp.f;
      const score = Math.abs(Math.log(r / 2.9));
      if (!best || score < best.score) best = { score, dist: d.v, speed: sp.v };
    }
  }
  // หลากับเมตรต่างกันแค่ 9% แยกจากฟิสิกส์ไม่ชัด → ใช้คู่ที่แอปมักตั้งด้วยกัน (mph↔หลา, km/h หรือ m/s↔เมตร)
  return { dist: best.speed === 'mph' ? 'yd' : 'm', speed: best.speed };
}

// วันที่ในไฟล์: 2023-11-26…, 26.11.23…, 11/26/23 หรือ 28/08/26…, ปี พ.ศ. → คืน YYYY-MM-DD หรือ null
// order: ลำดับของ a/b/yy ('dmy' | 'mdy') ตัดสินทั้งไฟล์ (ดู dateOrder) ถ้าไม่ระบุดูจากตัวเลขเอง
export function parseDate(v, order = null) {
  const s = String(v ?? '').trim();
  let y, mo, d, m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) {
    const a = +m[1], b = +m[2];
    const dmy = order ? order === 'dmy' : a > 12;
    [mo, d] = dmy ? [b, a] : [a, b];
    y = +m[3];
  } else return null;
  if (y < 100) y += 2000;
  if (y > 2400) y -= 543;
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2015 && y <= 2100)) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ลำดับวัน/เดือนของวันที่แบบ a/b/yy ทั้งไฟล์: มีตัวแรก > 12 = วัน/เดือน · ตัวที่สอง > 12 = เดือน/วัน
// ตัดสินไม่ได้: หัวคอลัมน์ภาษาอังกฤษ = เดือน/วัน (แบบสหรัฐ) ภาษาอื่น (รวมไทย) = วัน/เดือน
export function dateOrder(values, english) {
  for (const v of values) {
    const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\//);
    if (!m) continue;
    if (+m[1] > 12) return 'dmy';
    if (+m[2] > 12) return 'mdy';
  }
  return english ? 'mdy' : 'dmy';
}

// ช็อตซ้ำ: ค่าวงสวิงเหมือนกันทุกตัวจนถึงทศนิยมท้าย (เป็นไปไม่ได้ตามธรรมชาติ) พบในไฟล์จริง
// บางครั้งสำเนามีระยะลอย อีกสำเนาไม่มี → เก็บสำเนาที่มีระยะลอยไว้สำเนาเดียว
const shotKey = (row, cols) => ['cs', 'bs', 'sf', 'la', 'ld', 'spin', 'f2p', 'path', 'face'].map((k) => (cols[k] == null ? '' : String(row[cols[k]] ?? '').trim())).join('|');

// อ่านไฟล์ทั้งไฟล์ → ข้อมูลสำหรับหน้าตรวจก่อนบันทึก
export function readLaunchFile(text) {
  const { delim, rows: raw } = parseCsv(text);
  // ไฟล์ที่คั่นด้วย ; หรือ tab (เช่น ภาษาเยอรมัน/ดัตช์) ใช้จุลภาคเป็นทศนิยม
  const rows = delim === ',' ? raw : raw.map((r) => r.map((v) => (/^\s*-?\d+,\d+\s*$/.test(v) ? v.replace(',', '.') : v)));
  if (rows.length < 2) throw new Error('ไฟล์ว่างหรือไม่ใช่ CSV');
  const header = rows[0];
  const { cols, byPosition } = mapColumns(header);
  if (!hasShotCols(cols)) throw new Error('ไม่พบคอลัมน์ไม้หรือระยะในไฟล์นี้ (ต้องเป็นไฟล์ CSV ที่ส่งออกจาก Garmin Golf)');
  let body = rows.slice(1);
  let units = null;
  if (body.length && unitRow(body[0])) { units = unitsFromRow(body[0], cols); body = body.slice(1); }
  const carryOf = (r) => (cols.carry == null ? null : num(r[cols.carry]));
  const bsOf = (r) => (cols.bs == null ? null : num(r[cols.bs]));
  body = body.filter((r) => carryOf(r) > 0 || bsOf(r) > 0);
  const seen = new Map();
  const kept = [];
  let dupes = 0;
  for (const r of body) {
    if (!(bsOf(r) > 0)) { kept.push(r); continue; }
    const k = `${rawClub(r, cols)}|${shotKey(r, cols)}`;
    const i = seen.get(k);
    const a = i == null ? null : carryOf(kept[i]), b = carryOf(r);
    // ซ้ำเมื่อค่าวงสวิงเหมือนกัน และระยะลอยเท่ากันหรือมีสำเนาหนึ่งไม่มีระยะ
    if (i == null || (a > 0 && b > 0 && a !== b)) { if (i == null) seen.set(k, kept.length); kept.push(r); continue; }
    dupes++;
    if (!(a > 0) && b > 0) kept[i] = r;
  }
  body = kept;
  if (!body.length) throw new Error('ไม่พบช็อตในไฟล์นี้');
  const guess = guessUnits(body, cols);
  const english = header.some((h) => /^(date|club type|carry distance)$/i.test(String(h).trim()));
  const order = dateOrder(body.map((r) => r[cols.date]), english);
  const dates = body.map((r) => parseDate(r[cols.date], order)).filter(Boolean).sort();
  return {
    header, cols, byPosition, rows: body, dupes,
    noCarry: body.filter((r) => !(carryOf(r) > 0)).length,
    units: { dist: units?.dist ?? guess.dist, speed: units?.speed ?? guess.speed, fromFile: !!(units?.dist || units?.speed) },
    date: dates[0] ?? null,
  };
}

// ชื่อไม้ในไฟล์ (Club Type ก่อน ถ้าว่างใช้ Club Name)
export const rawClub = (row, cols) => String((cols.club != null ? row[cols.club] : '') || (cols.clubName != null ? row[cols.clubName] : '') || '').trim() || '?';

// ---------- จับคู่ไม้ในไฟล์กับไม้ในกระเป๋า ----------

const WEDGE = {
  pw: 'p', pitching: 'p', พิทช: 'p', พิชชิ่ง: 'p', gw: 'g', aw: 'g', gap: 'g', approach: 'g', แก๊ป: 'g', แกป: 'g', แก็ป: 'g',
  sw: 's', sand: 's', แซนด: 's', lw: 'l', lob: 'l', ลอบ: 'l', ล็อบ: 'l',
};

// ไม้จากชื่อ: { cat, n?, w? } cat = driver | wood | hybrid | iron | wedge | putter
export function clubKind(name) {
  const s = String(name ?? '').toLowerCase().normalize('NFC');
  if (/putter|พัตเตอร์|^pt$/.test(s)) return { cat: 'putter' };
  if (/driver|ไดร|^d$|^dr$/.test(s)) return { cat: 'driver' };
  for (const [k, w] of Object.entries(WEDGE)) {
    if (new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(s) || (k.length > 2 && s.includes(k))) return { cat: 'wedge', w };
  }
  const n = s.match(/\d+/)?.[0];
  if (/wood|holz|madera|hout|หัวไม้|^ไม้\s*\d+$|^\d+\s*w$/.test(s)) return { cat: n === '1' ? 'driver' : 'wood', n: n ? +n : null };
  if (/hybrid|híbrido|hibrido|ไฮบริด|^\d+\s*h$|^h\s*\d+$/.test(s)) return { cat: 'hybrid', n: n ? +n : null };
  if (/iron|eisen|hierro|ijzer|เหล็ก|^\d+\s*i$|^i\s*\d+$/.test(s)) return { cat: 'iron', n: n ? +n : null };
  if (/wedge|เวดจ์/.test(s)) return { cat: 'wedge', w: null };
  return null;
}

// ไม้ในกระเป๋าที่ตรงกับชื่อในไฟล์ (null = ให้ผู้ใช้เลือกเอง)
export function guessClub(raw, bag) {
  const k = clubKind(raw);
  if (!k) return null;
  const cands = bag.filter((c) => c.category === k.cat || (k.cat === 'driver' && c.category === 'driver'));
  const kinds = cands.map((c) => ({ c, kk: clubKind(c.label) ?? { cat: c.category } }));
  if (k.cat === 'driver' || k.cat === 'putter') return cands[0]?.id ?? null;
  if (k.cat === 'wedge') return kinds.find(({ kk }) => kk.cat === 'wedge' && kk.w && kk.w === k.w)?.c.id ?? null;
  return kinds.find(({ kk }) => kk.n != null && kk.n === k.n)?.c.id ?? null;
}

// ---------- สร้างบันทึก ----------

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

// แถวในไฟล์ → ช็อตในหน่วยภายใน · clubMap: ชื่อในไฟล์ → id ไม้ ('' = ไม่นำเข้า)
export function toShots(parsed, units, clubMap) {
  const df = factor(DIST_UNITS, units.dist), sf = factor(SPEED_UNITS, units.speed);
  const g = (row, k) => (parsed.cols[k] == null ? null : num(row[parsed.cols[k]]));
  const out = [];
  for (const row of parsed.rows) {
    const raw = rawClub(row, parsed.cols);
    if (clubMap[raw] === '') continue;
    const carry = g(row, 'carry');
    const bs = g(row, 'bs');
    if (!(carry > 0) && !(bs > 0)) continue;
    const dist = (k) => { const v = g(row, k); return v == null ? null : r1(v * df); };
    const speed = (k) => { const v = g(row, k); return v == null || v <= 0 ? null : r1(v * sf); };
    const spin = g(row, 'spin');
    const has = carry > 0;
    out.push([raw, speed('cs'), speed('bs'), r2(g(row, 'sf')), r1(g(row, 'la')), r1(g(row, 'ld')), spin == null ? null : Math.round(spin),
      has ? dist('carry') : null, has ? dist('cdev') : null, has ? dist('total') : null, r1(g(row, 'aa')), r1(g(row, 'path')), r1(g(row, 'face')), r1(g(row, 'f2p'))]);
  }
  return out;
}

// ลายเซ็นของไฟล์ ใช้กันนำเข้าไฟล์เดิมซ้ำ
export const signature = (shots) => `${shots.length}|${shots.slice(0, 3).map((s) => s.slice(1, 10).join(',')).join(';')}|${Math.round(shots.reduce((a, s) => a + (s[7] || 0), 0))}`;

// บันทึกซ้อม 1 รายการต่อไม่เกิน 400 ช็อต (ขนาดต่อรายการของคลาวด์จำกัด)
export function buildRecords({ shots, clubMap, date, file, source = 'garmin-r10', uid, now }) {
  const sig = signature(shots);
  const clubs = {};
  for (const s of shots) clubs[s[0]] = clubMap[s[0]] || null;
  const parts = Math.max(1, Math.ceil(shots.length / MAX_SHOTS_PER_RECORD));
  return Array.from({ length: parts }, (_, i) => ({
    id: uid(), kind: 'launch', source, date, topic: 'เครื่องซ้อม (Garmin R10)',
    drill_id: null, club_id_optional: null, attempts: null, successes: null, drill_context: '', target_definition: '', note: '',
    launch: { v: 1, file: file || '', sig, part: parts > 1 ? [i + 1, parts] : null, cols: SHOT_COLS, clubs, shots: shots.slice(i * MAX_SHOTS_PER_RECORD, (i + 1) * MAX_SHOTS_PER_RECORD) },
    created_at: now,
  }));
}

// ---------- อ่านบันทึก (ข้อมูลเสียถูกข้าม) ----------

export const isLaunch = (p) => p?.kind === 'launch' && Array.isArray(p?.launch?.shots);
// รหัสเซสชัน (ส่วนต่าง ๆ ของไฟล์เดียวกันใช้ลายเซ็นเดียวกัน) และวันที่แบบข้อความเสมอ
export const sessionKey = (p) => (typeof p?.launch?.sig === 'string' && p.launch.sig ? p.launch.sig : String(p?.id));
export const sessionDate = (p) => (typeof p?.date === 'string' ? p.date : '');

export function sessionShots(p) {
  if (!isLaunch(p)) return [];
  const cols = Array.isArray(p.launch.cols) ? p.launch.cols : SHOT_COLS;
  const clubs = p.launch.clubs && typeof p.launch.clubs === 'object' ? p.launch.clubs : {};
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
  const out = [];
  for (const s of p.launch.shots) {
    if (!Array.isArray(s)) continue;
    const v = (k) => { const x = s[idx[k]]; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
    const raw = String(s[idx.club] ?? '?');
    const c = v('carry');
    const carry = c != null && c > 0 && c <= 450 ? c : null;
    if (carry == null && !(v('bs') > 5)) continue;   // ไม่มีระยะลอย ต้องมีความเร็วลูกที่เป็นไปได้
    out.push({ raw, clubId: typeof clubs[raw] === 'string' ? clubs[raw] : null, date: sessionDate(p), sid: sessionKey(p),
      cs: v('cs'), bs: v('bs'), sf: v('sf'), la: v('la'), ld: v('ld'), spin: v('spin'), carry, cdev: carry == null ? null : v('cdev'), total: carry == null ? null : v('total'),
      aa: v('aa'), path: v('path'), face: v('face'), f2p: v('f2p') });
  }
  return out;
}

// ---------- วิเคราะห์ ----------

const quant = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = p * (s.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const med = (arr) => quant(arr, 0.5);
const vals = (shots, k) => shots.map((s) => s[k]).filter((x) => x != null);
const sd = (arr) => {
  if (arr.length < 2) return null;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
};

// Smash Factor ที่ถือว่าตีโดนดีของแต่ละประเภทไม้ (ค่าประมาณสำหรับนักกอล์ฟสมัครเล่น)
export const SMASH_OK = { driver: 1.42, wood: 1.38, hybrid: 1.35, iron: 1.28, wedge: 1.18 };

// สถิติรายไม้ · clubOf(id) → { label, category } · ช็อตพลาด (Smash ต่ำกว่า 1.0 หรือระยะลอยต่ำกว่า 60% ของค่ากลาง) ไม่นับ
// ระยะคิดจากช็อตที่มีระยะลอย (nCarry) · ค่าวงสวิง (หน้าไม้ แนวสวิง Smash) คิดจากทุกช็อตที่ไม่พลาด (good)
export function clubStats(shots, clubOf = () => null) {
  const groups = new Map();
  for (const s of shots) {
    const key = s.clubId && clubOf(s.clubId) ? s.clubId : `raw:${s.raw}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const out = [];
  for (const [key, list] of groups) {
    const c = key.startsWith('raw:') ? null : clubOf(key);
    const cat = c?.category ?? clubKind(list[0].raw)?.cat ?? null;
    if (cat === 'putter') continue;
    const withCarry = list.filter((s) => s.carry != null);
    const m0 = med(vals(withCarry, 'carry'));
    const mis = (s) => (s.sf != null && s.sf < 1.0) || (s.carry != null && withCarry.length >= 5 && s.carry < 0.6 * m0);
    const good = list.filter((s) => !mis(s));
    const use = good.length ? good : list;
    const useCarry = use.filter((s) => s.carry != null);
    const carry = vals(useCarry, 'carry');
    const cdev = vals(useCarry, 'cdev');
    out.push({
      key, clubId: c ? key : null, label: c?.label ?? list[0].raw, category: cat, order: c?.order ?? 99,
      n: list.length, good: good.length, nCarry: carry.length, mishit: (list.length - good.length) / list.length,
      carry: med(carry), p25: quant(carry, 0.25), p75: quant(carry, 0.75), total: med(vals(useCarry, 'total')),
      side: med(cdev), sideAbs: med(cdev.map(Math.abs)), sideSd: sd(cdev),
      right: cdev.length ? cdev.filter((x) => x > 0).length / cdev.length : null,
      bs: med(vals(use, 'bs')), cs: med(vals(use, 'cs')), sf: med(vals(use, 'sf')), la: med(vals(use, 'la')), spin: med(vals(use, 'spin')),
      aa: med(vals(use, 'aa')), path: med(vals(use, 'path')), face: med(vals(use, 'face')), ld: med(vals(use, 'ld')),
      f2p: med(vals(use, 'f2p')), f2pPos: vals(use, 'f2p').length ? vals(use, 'f2p').filter((x) => x > 0).length / vals(use, 'f2p').length : null,
      f2pN: vals(use, 'f2p').length,
    });
  }
  return out.sort((a, b) => (b.carry ?? -1) - (a.carry ?? -1) || a.order - b.order);
}

// ช่องว่าง/ซ้อนกันของระยะลอยระหว่างไม้ที่อยู่ติดกัน (ไม้ที่ตีอย่างน้อย 3 ลูก)
// inBetween(a, b) = มีไม้อื่นในกระเป๋าที่อยู่ระหว่างสองไม้นี้ (แค่ไม่ได้ตีครั้งนี้) → ไม่ถือเป็นช่องว่าง
export function gapping(stats, { big = 18, small = 5, inBetween = () => false } = {}) {
  const list = stats.filter((s) => s.nCarry >= 3 && s.carry != null);
  const out = [];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    const gap = a.carry - b.carry;
    if (gap > big) { if (!inBetween(a, b)) out.push({ type: 'gap', a, b, gap }); }
    else if (gap < small) out.push({ type: 'overlap', a, b, gap });
  }
  return out;
}

const fmtDeg = (x) => `${x > 0 ? '+' : ''}${x.toFixed(1)}°`;

// ปัญหาที่ควรแก้ก่อน เรียงตามความรุนแรง · hand: 'right' | 'left' · fmt(m) แสดงระยะในหน่วยผู้ใช้
export function launchIssues(stats, { hand = 'right', fmt = (m) => `${Math.round(m)} ม.`, inBetween } = {}) {
  const issues = [];
  const all = stats.reduce((a, s) => a + s.n, 0);
  if (all < 10) return issues;
  const add = (x) => issues.push(x);

  // ตีไม่โดนกลางหน้าไม้
  const mis = stats.reduce((a, s) => a + (s.n - s.good), 0) / all;
  const lowSmash = stats.filter((s) => s.sf != null && SMASH_OK[s.category] && s.good >= 3 && s.sf < SMASH_OK[s.category] - 0.04);
  if (mis >= 0.15 || lowSmash.length) {
    add({
      k: 'contact', sev: mis * 10 + lowSmash.length, th: 'การสัมผัสลูก (ตีไม่โดนกลางหน้าไม้)',
      detail: [mis >= 0.15 ? `ช็อตพลาด ${Math.round(mis * 100)}% ของทั้งหมด` : '', ...lowSmash.slice(0, 3).map((s) => `${s.label} Smash ${s.sf.toFixed(2)} (เกณฑ์ ≥ ${SMASH_OK[s.category].toFixed(2)})`)].filter(Boolean),
      drills: ['sim-smash', 'contact-line'],
    });
  }

  // ลูกโค้ง: Face to Path บวก = โค้งขวา ลบ = โค้งซ้าย
  const f2p = stats.filter((s) => s.f2pN >= 3 && s.category !== 'wedge');
  const n2 = f2p.reduce((a, s) => a + s.f2pN, 0);
  if (n2 >= 8) {
    const m = f2p.reduce((a, s) => a + s.f2p * s.f2pN, 0) / n2;
    const pos = f2p.reduce((a, s) => a + s.f2pPos * s.f2pN, 0) / n2;
    if (Math.abs(m) >= 2.5 && (m > 0 ? pos >= 0.65 : pos <= 0.35)) {
      const right = m > 0;
      const name = right === (hand === 'right') ? 'สไลซ์/เฟด' : 'ฮุก/ดรอว์';
      const withPath = f2p.filter((s) => s.path != null);
      const np = withPath.reduce((a, s) => a + s.f2pN, 0);
      const path = np ? withPath.reduce((a, s) => a + s.path * s.f2pN, 0) / np : null;
      // แนวสวิงลบ = ตัดจากขวาไปซ้าย: ถนัดขวาคือ "นอกเข้าใน" ถนัดซ้ายคือ "ในออกนอก"
      const outIn = path != null && Math.abs(path) >= 3 ? ((path < 0) === (hand === 'right') ? 'ตัดจากนอกเข้าใน' : 'ตีจากในออกนอก') : null;
      add({
        k: 'curve', sev: Math.abs(m), th: `ลูกโค้ง${right ? 'ขวา' : 'ซ้าย'} (${name})`,
        detail: [`Face to Path เฉลี่ย ${fmtDeg(m)} · ${Math.round((right ? pos : 1 - pos) * 100)}% ของช็อตโค้ง${right ? 'ขวา' : 'ซ้าย'}`,
          outIn ? `แนวสวิง (Club Path) เฉลี่ย ${fmtDeg(path)} — ${outIn} เป็นสาเหตุหลัก` : '', 'เป้าหมาย: −2° ถึง +2°'].filter(Boolean),
        drills: ['sim-face-path'],
      });
    }
  }

  // ลูกออกตัวไม่ตรงเป้า (มาจากหน้าไม้ตอนปะทะเป็นหลัก)
  const ld = stats.filter((s) => s.ld != null && s.good >= 3);
  const nl = ld.reduce((a, s) => a + s.good, 0);
  if (nl >= 8) {
    const m = ld.reduce((a, s) => a + s.ld * s.good, 0) / nl;
    if (Math.abs(m) >= 2.5) {
      add({ k: 'start', sev: Math.abs(m) * 0.8, th: `ลูกออกตัว${m > 0 ? 'ขวา' : 'ซ้าย'}ของเป้าเป็นประจำ`, detail: [`ทิศออกตัวเฉลี่ย ${fmtDeg(m)} (หน้าไม้ตอนปะทะ${m > 0 ? 'เปิด' : 'ปิด'})`], drills: ['sim-start-line', 'tee-gate'] });
    }
  }

  // ไดรเวอร์ตีกดลง สปินสูง
  const d = stats.find((s) => s.category === 'driver' && s.good >= 3);
  if (d && ((d.aa != null && d.aa < -1.5) || (d.spin != null && d.spin > 3300))) {
    const down = d.aa != null && d.aa < -1.5;
    add({
      k: 'driver', sev: Math.max(0, -(d.aa ?? 0)) + Math.max(0, ((d.spin ?? 0) - 3000) / 400), th: down ? 'ไดรเวอร์ตีกดลง เสียระยะ' : 'ไดรเวอร์สปินสูง เสียระยะ',
      detail: [d.aa != null ? `Attack Angle ${fmtDeg(d.aa)} (เป้าหมาย ≥ 0°)` : '', d.spin != null ? `สปิน ${Math.round(d.spin)} รอบ/นาที (เป้าหมาย 2,000–3,000)` : '',
        !down && d.f2p != null && Math.abs(d.f2p) >= 3 ? 'สปินสูงแม้ตีขึ้น มักมาจากหน้าไม้ไม่ตรงแนวสวิง (ดูข้อลูกโค้ง) หรือโดนต่ำบนหน้าไม้' : ''].filter(Boolean),
      drills: down ? ['sim-driver-launch'] : ['sim-driver-launch', 'sim-face-path'],
    });
  }

  // ทิศทางกระจาย
  const wide = stats.filter((s) => s.nCarry >= 4 && s.sideAbs != null && s.carry && (s.sideAbs / s.carry > (s.category === 'driver' || s.category === 'wood' ? 0.1 : 0.08)));
  if (wide.length) {
    add({
      k: 'dispersion', sev: 1.5 + wide.length * 0.5, th: 'ทิศทางกระจายกว้าง',
      detail: wide.slice(0, 3).map((s) => `${s.label} เบี่ยงเฉลี่ย ${fmt(s.sideAbs)} จากแนวเป้า (ระยะลอย ${fmt(s.carry)})`),
      drills: ['approach-center', 'tee-gate'],
    });
  }

  // ระยะไม่สม่ำเสมอ
  const loose = stats.filter((s) => s.nCarry >= 5 && ['iron', 'wedge', 'hybrid'].includes(s.category) && s.carry && (s.p75 - s.p25) / s.carry > 0.08);
  if (loose.length) {
    add({
      k: 'distance', sev: 1 + loose.length * 0.5, th: 'ระยะลอยไม่สม่ำเสมอ',
      detail: loose.slice(0, 3).map((s) => `${s.label} ระยะปกติ ${fmt(s.p25)}–${fmt(s.p75)} (ห่างกัน ${fmt(s.p75 - s.p25)})`),
      drills: ['sim-carry-window', 'approach-ladder'],
    });
  }

  // ช่องว่างระยะระหว่างไม้
  const gaps = gapping(stats, { inBetween });
  if (gaps.length) {
    add({
      k: 'gapping', sev: 0.8 + gaps.length * 0.3, th: 'ช่องว่างระยะระหว่างไม้',
      detail: gaps.slice(0, 3).map((g) => (g.type === 'gap' ? `${g.a.label} → ${g.b.label} ห่าง ${fmt(g.gap)} (ระยะตรงกลางไม่มีไม้)` : `${g.a.label} กับ ${g.b.label} ระยะใกล้กันมาก (${fmt(Math.max(0, g.gap))})`)),
      drills: ['sim-carry-window'],
    });
  }
  return issues.sort((a, b) => b.sev - a.sev);
}

// ระยะลอยจากเครื่องซ้อมต่อไม้ (ไม้ที่ผูกกับไม้ในกระเป๋า มีช็อตดีอย่างน้อย 5 ลูก) ใช้แนะนำไม้เมื่อยังไม่มีข้อมูล GPS
export function launchCarryRows(practice, clubOf) {
  const shots = practice.filter(isLaunch).flatMap(sessionShots).filter((s) => s.clubId);
  return clubStats(shots, clubOf).filter((s) => s.clubId && s.nCarry >= 5)
    .map((s) => ({ clubId: s.clubId, label: s.label, category: s.category, median: s.carry, p25: s.p25, p75: s.p75, n: s.nCarry, src: 'sim' }));
}

// ค่ากลางของไม้ในแต่ละครั้งที่ซ้อม (เก่า→ใหม่) สำหรับดูพัฒนาการ
export function clubTrend(sessions, key, clubOf) {
  const bySession = new Map();
  for (const p of sessions) {
    const shots = sessionShots(p);
    const sid = sessionKey(p);
    if (!bySession.has(sid)) bySession.set(sid, { date: sessionDate(p), shots: [] });
    bySession.get(sid).shots.push(...shots);
  }
  return [...bySession.values()].sort((a, b) => a.date.localeCompare(b.date))
    .map((x) => ({ date: x.date, s: clubStats(x.shots, clubOf).find((c) => c.key === key) }))
    .filter((x) => x.s && x.s.nCarry >= 3);
}
