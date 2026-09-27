// เตรียมรูปสกอร์การ์ดก่อน OCR และประกอบตารางจากตำแหน่งคำที่อ่านได้
// ทุกฟังก์ชันเป็นโค้ดล้วน ทำงานได้ทั้งในเบราว์เซอร์และ Node (ทดสอบได้)

// ---------- ปรับรูป: ขาวดำแบบปรับตามแสงแต่ละจุด แล้วลบเส้นตาราง ----------

export function toGray(rgba, n) {
  const g = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  return g;
}

// เทียบแต่ละจุดกับค่าเฉลี่ยรอบข้าง (ทนแสงไม่สม่ำเสมอในรูปถ่าย) → 1 = หมึก
export function binarize(gray, w, h, radius = 16, bias = 12) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      const mean = s / ((x1 - x0) * (y1 - y0));
      bin[y * w + x] = gray[y * w + x] < mean - bias ? 1 : 0;
    }
  }
  return bin;
}

// ลบเส้นแนวนอน/แนวตั้งที่ยาวกว่าตัวอักษรมาก (เส้นตาราง) ตัวเลขไม่มีเส้นยาวขนาดนั้น
export function removeLines(bin, w, h, minH = Math.max(60, Math.round(w * 0.06)), minV = Math.max(45, Math.round(h * 0.06))) {
  const kill = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x <= w; x++) {
      if (x < w && bin[y * w + x]) { run++; continue; }
      if (run >= minH) for (let k = x - run; k < x; k++) kill[y * w + k] = 1;
      run = 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y <= h; y++) {
      if (y < h && bin[y * w + x]) { run++; continue; }
      if (run >= minV) for (let k = y - run; k < y; k++) kill[k * w + x] = 1;
      run = 0;
    }
  }
  for (let i = 0; i < w * h; i++) if (kill[i]) bin[i] = 0;
  return bin;
}

// ตัวอักษรในแถวหัวตารางสีเข้ม (ตัวหนังสือขาวบนพื้นดำ) กลับสีเป็นหมึกดำ
export function fixInverted(bin, gray, w, h) {
  const band = 8;
  for (let y0 = 0; y0 < h; y0 += band) {
    for (let x0 = 0; x0 < w; x0 += band * 8) {
      let dark = 0, cnt = 0;
      for (let y = y0; y < Math.min(h, y0 + band); y++) {
        for (let x = x0; x < Math.min(w, x0 + band * 8); x++) { cnt++; if (gray[y * w + x] < 90) dark++; }
      }
      if (dark / cnt > 0.6) {
        for (let y = y0; y < Math.min(h, y0 + band); y++) {
          for (let x = x0; x < Math.min(w, x0 + band * 8); x++) bin[y * w + x] = gray[y * w + x] > 150 ? 1 : 0;
        }
      }
    }
  }
  return bin;
}

export function preprocess(rgba, w, h) {
  const gray = toGray(rgba, w * h);
  const bin = binarize(gray, w, h);
  fixInverted(bin, gray, w, h);
  removeLines(bin, w, h);
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) out[i] = bin[i] ? 0 : 255;
  return out;   // grayscale 0 = หมึก
}

// ---------- ประกอบตารางจากคำที่ OCR อ่านได้ (ผลแบบ TSV ของ Tesseract) ----------

export function wordsFromTsv(tsv) {
  const words = [];
  for (const line of String(tsv).split('\n').slice(1)) {
    const c = line.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const text = c[11].trim();
    if (!text) continue;
    const left = +c[6], top = +c[7], width = +c[8], height = +c[9];
    words.push({ text, x: left + width / 2, y: top + height / 2, left, right: left + width, h: height, conf: +c[10] });
  }
  return words;
}

const CONFUSE = /^[\doOQDlI|!sSBzZ]+$/;
const cleanNum = (t) => {
  // เศษเส้นตารางที่ติดหัว/ท้ายตัวเลข เช่น "|375" ให้ตัดทิ้ง ไม่อ่านเป็นเลข 1
  const s = t.replace(/^[|!\[\]()'"`.,:;]+|[|!\[\]()'"`.,:;]+$/g, '').replace(/[^\w|!]/g, '');
  if (!/\d/.test(s) || !CONFUSE.test(s)) return null;
  const d = s.replace(/[oOQD]/g, '0').replace(/[lI|!]/g, '1').replace(/[sS]/g, '5').replace(/B/g, '8').replace(/[zZ]/g, '2');
  return /^\d{1,4}$/.test(d) ? Number(d) : d.length === 6 ? d : null;   // 6 หลัก = ตัวเลข 2 ช่องติดกัน
};

function groupRows(words) {
  const hs = words.map((w) => w.h).sort((a, b) => a - b);
  const medH = hs[Math.floor(hs.length / 2)] || 20;
  const sorted = [...words].sort((a, b) => a.y - b.y);
  const rows = [];
  for (const w of sorted) {
    const r = rows.at(-1);
    if (r && Math.abs(w.y - r.y) < medH * 0.6) { r.words.push(w); r.y = (r.y * (r.words.length - 1) + w.y) / r.words.length; } else rows.push({ y: w.y, words: [w] });
  }
  rows.forEach((r) => r.words.sort((a, b) => a.x - b.x));
  return { rows, medH };
}

// แถวหัวตาราง "HOLE 1 2 … 9" → หาตำแหน่งแนวตั้งของแต่ละหลุม (ใช้เส้นตรงจากเลขที่อ่านได้ เติมเลขที่อ่านไม่ได้)
function headerColumns(row) {
  const pts = [];
  for (const w of row.words) {
    const n = cleanNum(w.text);
    if (typeof n === 'number' && n >= 1 && n <= 18) pts.push({ n, x: w.x });
  }
  if (pts.length < 5) return null;
  const start = pts.filter((p) => p.n <= 9).length >= pts.length / 2 ? 1 : 10;
  const good = pts.filter((p) => p.n >= start && p.n < start + 9);
  if (good.length < 5) return null;
  // ถดถอยเชิงเส้น x = a + b * n
  const mx = good.reduce((s, p) => s + p.n, 0) / good.length;
  const my = good.reduce((s, p) => s + p.x, 0) / good.length;
  const b = good.reduce((s, p) => s + (p.n - mx) * (p.x - my), 0) / good.reduce((s, p) => s + (p.n - mx) ** 2, 0);
  if (!(b > 0)) return null;
  const a = my - b * mx;
  return { start, xs: Array.from({ length: 9 }, (_, i) => a + b * (start + i)), step: b };
}

export function gridFromWords(words) {
  const { rows } = groupRows(words);
  const out = [];
  let cols = null;
  for (const r of rows) {
    const hdr = headerColumns(r);
    const label = r.words.filter((w) => cleanNum(w.text) == null).map((w) => w.text.toLowerCase()).join(' ');
    if (hdr && (/hole|หลุม/.test(label) || hdr.start)) {
      // แถวที่เป็นลำดับเลขหลุมจริง (ไม่ใช่แถว HC ที่บังเอิญมีเลข 1–9)
      const nums = r.words.map((w) => cleanNum(w.text)).filter((n) => typeof n === 'number');
      const inc = nums.filter((n, i) => i === 0 || n > nums[i - 1]).length;
      if (/hole|หลุม/.test(label) || inc >= nums.length - 1) { cols = hdr; continue; }
    }
    if (!cols) continue;
    const vals = Array(9).fill(null);
    const conf = Array(9).fill(null);
    let total = null;
    const left = r.words.find((w) => cleanNum(w.text) == null);
    for (const w of r.words) {
      const n = cleanNum(w.text);
      if (n == null) continue;
      const k = (w.x - cols.xs[0]) / cols.step;
      if (typeof n === 'string') {           // 6 หลักติดกัน → แบ่งลง 2 ช่องที่คร่อมอยู่
        const k0 = Math.round(k - 0.5);
        if (k0 >= 0 && k0 < 8 && Math.abs(k - (k0 + 0.5)) < 0.35) {
          vals[k0] = +n.slice(0, 3); vals[k0 + 1] = +n.slice(3);
          conf[k0] = conf[k0 + 1] = Math.min(w.conf, 50);   // แบ่งเองจึงนับว่าไม่มั่นใจ
        }
        continue;
      }
      const i = Math.round(k);
      if (i === 9 && Math.abs(k - i) < 0.45 && total == null) total = n;   // ยอด OUT / IN ที่พิมพ์บนการ์ด
      else if (i >= 0 && i < 9 && Math.abs(k - i) < 0.38 && vals[i] == null) { vals[i] = n; conf[i] = w.conf; }
    }
    if (vals.filter((v) => v != null).length < 4) continue;
    out.push({ label: left ? label : '', start: cols.start, vals, conf, total });
  }
  return out;
}
