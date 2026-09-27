// สร้างรูปสกอร์การ์ด (PNG) แบบแนวนอนหรือแนวตั้ง แล้วแชร์ผ่านเมนูแชร์ของมือถือ หรือบันทึกเป็นไฟล์
import { SCORE_KINDS, fmtOver } from './group.js';

export const LAYOUTS = [
  { v: 'landscape', th: 'แนวนอน' },
  { v: 'portrait', th: 'แนวตั้ง' },
];

const C = {
  bg: '#ffffff', page: '#eef3ef', ink: '#16241c', muted: '#6b7a71', faint: '#a3aea8',
  line: '#d9e2dc', grid: '#e7ede9', alt: '#f6f9f7', sumBg: '#edf3ef',
  brand: '#13693f', brand2: '#1f8a55', deep: '#0b3f26', brandSoft: '#e2f1e8', head: '#16241c',
  red: '#d7263d', redSoft: '#fde6e9', blue: '#1d5fd1', gold: '#c99700', goldInk: '#8a6f00', goldSoft: '#fbf1d8',
  bogey: '#8c9a92', mess: '#5d6a63', graySoft: '#edf0ee',
};
const FONT = '"IBM Plex Sans Thai", "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif';
const SCALE = 2;
const AVATAR = ['#13693f', '#1d5fd1', '#c2410c', '#7c3aed', '#b45309', '#0e7490'];
const KINDS_BEST_FIRST = [...SCORE_KINDS].reverse();
const SAMPLE = { hio: 1, albatross: 2, eagle: 3, birdie: 3, par: 4, bogey: 5, double: 6, mess: 8 };
const TONE = {
  pos: [C.brandSoft, C.brand], neg: [C.redSoft, C.red], zero: [C.graySoft, C.muted],
  lead: [C.goldSoft, C.goldInk], plain: [C.graySoft, C.ink],
};

// ---------- เครื่องมือวาด ----------

function pen(g) {
  const font = (size, weight) => { g.font = `${weight} ${size}px ${FONT}`; };
  const width = (s, size = 16, weight = 400) => { font(size, weight); return g.measureText(String(s)).width; };
  // ย่อตัวอักษรลงได้ถึง 3/4 ถ้ายังยาวเกินค่อยตัดท้ายด้วย …
  const fit = (s, maxW, size, weight) => {
    const min = Math.round(size * 0.75);
    let z = size;
    while (z > min && width(s, z, weight) > maxW) z -= 1;
    if (width(s, z, weight) <= maxW) return [s, z];
    let t = s;
    while (t.length > 1 && width(`${t}…`, z, weight) > maxW) t = t.slice(0, -1);
    return [`${t}…`, z];
  };
  const text = (s, x, y, { size = 16, weight = 400, color = C.ink, align = 'center', maxW = 0 } = {}) => {
    let str = String(s), z = size;
    if (maxW) [str, z] = fit(str, maxW, size, weight);
    font(z, weight);
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(str, x, y);
  };
  const box = (x, y, w, h, r, fill, stroke) => {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  };
  const line = (x1, y1, x2, y2, color = C.grid, w = 1) => {
    g.strokeStyle = color; g.lineWidth = w;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  };
  const fill = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  return { g, text, width, box, line, fill };
}

// ใช้วัดขนาดตัวอักษรก่อนรู้ขนาดรูปจริง
const measurer = () => pen(document.createElement('canvas').getContext('2d'));

function newCanvas(W, H) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * SCALE);
  canvas.height = Math.round(H * SCALE);
  const g = canvas.getContext('2d');
  g.scale(SCALE, SCALE);
  g.textBaseline = 'middle';
  return { canvas, p: pen(g) };
}

// เครื่องหมายแบบสกอร์การ์ดกอล์ฟ: วงกลม = ต่ำกว่าพาร์ สี่เหลี่ยม = เกินพาร์ คืนสีตัวเลขที่เหมาะกับพื้น
function mark(p, kind, x, y, r) {
  const { g } = p;
  const ring = (rad) => { g.strokeStyle = kind === 'birdie' ? C.red : C.gold; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.stroke(); };
  const sq = (half, color) => { g.strokeStyle = color; g.lineWidth = 1.6; g.strokeRect(x - half, y - half, half * 2, half * 2); };
  switch (kind) {
    case 'hio': g.fillStyle = C.red; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); return '#ffffff';
    case 'albatross':
    case 'eagle': ring(r); ring(r - 4.5); return C.ink;
    case 'birdie': ring(r); return C.red;
    case 'par': return C.blue;
    case 'bogey': sq(r - 2, C.bogey); return C.ink;
    case 'double': sq(r - 1.5, C.goldInk); sq(r - 5.5, C.goldInk); return C.ink;
    case 'mess': p.fill(x - (r - 1.5), y - (r - 1.5), (r - 1.5) * 2, (r - 1.5) * 2, C.mess); return '#ffffff';
    default: return C.ink;
  }
}

function scoreCell(p, c, x, y, r, size) {
  if (!c) return;
  if (!c.final) { p.text(c.strokes, x, y + 1, { size, color: C.faint }); return; }
  const ink = mark(p, c.kind, x, y, r);
  p.text(c.strokes, x, y + 1, { size, weight: c.kind && c.kind !== 'bogey' ? 700 : 600, color: ink });
}

function avatar(p, name, i, x, y, r) {
  p.g.fillStyle = AVATAR[i % AVATAR.length];
  p.g.beginPath(); p.g.arc(x, y, r, 0, Math.PI * 2); p.g.fill();
  const first = [...String(name).trim()].find((ch) => /[\p{L}\p{N}]/u.test(ch) && !/[ัิ-ฺเ-๎]/.test(ch)) || '?';
  p.text(first.toUpperCase(), x, y + 1, { size: Math.round(r * 1.05), weight: 700, color: '#ffffff' });
}

// ไอคอนธงบนกรีน
function flag(g, x, y, r) {
  const px = x - r * 0.18;
  g.fillStyle = C.deep;
  g.beginPath(); g.ellipse(x, y + r * 0.5, r * 0.46, r * 0.13, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = C.head; g.lineWidth = Math.max(1.5, r * 0.08); g.lineCap = 'round';
  g.beginPath(); g.moveTo(px, y + r * 0.5); g.lineTo(px, y - r * 0.58); g.stroke();
  g.fillStyle = C.red;
  g.beginPath(); g.moveTo(px, y - r * 0.58); g.lineTo(px + r * 0.62, y - r * 0.38); g.lineTo(px, y - r * 0.16); g.closePath(); g.fill();
}

const thaiDate = (iso) => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!y) return '';
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
};

const shortName = (s, n = 9) => ([...s].length > n ? `${[...s].slice(0, n - 1).join('')}…` : s);

// ตัวเลขเด่นมุมขวาของหัวรูป
function headline(grid) {
  const ps = grid.players;
  const t = grid.total;
  if (ps.length === 1) {
    const b = t.byPlayer[ps[0].id];
    if (b.count) return { label: 'สกอร์รวม', big: b.strokes, small: b.over != null ? fmtOver(b.over) : '' };
  } else if (ps.every((pl) => t.byPlayer[pl.id].count === grid.rows.length && grid.rows.length)) {
    const best = Math.min(...ps.map((pl) => t.byPlayer[pl.id].strokes));
    const names = ps.filter((pl) => t.byPlayer[pl.id].strokes === best).map((pl) => shortName(pl.name, 8));
    return { label: 'ต่ำสุดในก๊วน', big: best, small: names.join(', ') };
  }
  return t.par ? { label: `${grid.rows.length} หลุม`, big: t.par, small: 'พาร์' } : null;
}

function headerBand(p, W, h, { round, grid }, { compact = false } = {}) {
  const { g } = p;
  const grad = g.createLinearGradient(0, 0, W, h);
  grad.addColorStop(0, C.deep);
  grad.addColorStop(1, C.brand2);
  p.fill(0, 0, W, h, grad);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.beginPath(); g.arc(W - h * 0.4, -h * 0.15, h * 0.95, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(W - h * 1.6, h * 1.25, h * 0.6, 0, Math.PI * 2); g.fill();

  const pad = compact ? 16 : 28;
  const lr = compact ? 22 : 30;
  const lx = pad + lr, ly = h / 2;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(lx, ly, lr, 0, Math.PI * 2); g.fill();
  flag(g, lx, ly, lr);

  let reserve = 0;
  const hl = !compact && headline(grid);
  if (hl) {
    const bigW = p.width(hl.big, 46, 700);
    const smallW = hl.small ? p.width(hl.small, 17, 600) + 10 : 0;
    reserve = Math.max(bigW + smallW, p.width(hl.label, 14, 600)) + 24;
    p.text(hl.label, W - pad, ly - 26, { size: 14, weight: 600, color: 'rgba(255,255,255,0.75)', align: 'right' });
    p.text(hl.big, W - pad, ly + 10, { size: 46, weight: 700, color: '#ffffff', align: 'right' });
    if (hl.small) p.text(hl.small, W - pad - bigW - 10, ly + 16, { size: 17, weight: 600, color: 'rgba(255,255,255,0.85)', align: 'right' });
  }
  const tx = lx + lr + (compact ? 12 : 18);
  const maxW = W - tx - pad - reserve;
  const sub = [
    thaiDate(round.played_at), round.province_snapshot,
    round.tee_name ? `แท่น${round.tee_name}` : '', grid.players.length > 1 ? `${grid.players.length} คน` : '',
  ].filter(Boolean).join(' · ');
  p.text(round.course_name_snapshot || 'สกอร์การ์ด', tx, ly - (compact ? 11 : 15), { size: compact ? 20 : 30, weight: 700, color: '#ffffff', align: 'left', maxW });
  p.text(sub, tx, ly + (compact ? 14 : 20), { size: compact ? 13 : 17, color: 'rgba(255,255,255,0.85)', align: 'left', maxW });
}

function footer(p, W, y, pad) {
  const stamp = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  p.text('ShotLog', pad, y, { size: 15, weight: 700, color: C.brand, align: 'left' });
  p.text(stamp, W - pad, y, { size: 12, color: C.muted, align: 'right' });
}

// ---------- เกม (ชิปผลของแต่ละคน ตัดขึ้นบรรทัดใหม่ตามความกว้าง) ----------

function layoutGames(p, games, width) {
  const inner = width - 36;
  const items = [];
  let h = 0;
  for (const gm of games) {
    const chips = [];
    let x = 0, row = 0;
    for (const it of gm.items) {
      const label = `${it.name} ${it.value}`;
      const w = Math.min(inner, p.width(label, 14, 600) + 26);
      if (x > 0 && x + w > inner) { x = 0; row++; }
      chips.push({ ...it, label, dx: x, row, w });
      x += w + 8;
    }
    const gh = 28 + (row + 1) * 38;
    items.push({ title: gm.title, chips, dy: h });
    h += gh + 4;
  }
  return { items, h: 50 + h + 8 };
}

function drawGames(p, lay, x0, y0, w) {
  p.box(x0, y0, w, lay.h, 14, C.bg, C.line);
  p.text('เกมในก๊วน', x0 + 18, y0 + 26, { size: 16, weight: 700, color: C.brand, align: 'left' });
  for (const gm of lay.items) {
    const gy = y0 + 50 + gm.dy;
    p.text(gm.title, x0 + 18, gy + 10, { size: 14, weight: 700, align: 'left', maxW: w - 36 });
    for (const ch of gm.chips) {
      const cx = x0 + 18 + ch.dx, cy = gy + 26 + ch.row * 38;
      const [bg, ink] = TONE[ch.tone] || TONE.plain;
      p.box(cx, cy, ch.w, 30, 15, bg);
      p.text(ch.label, cx + ch.w / 2, cy + 16, { size: 14, weight: 600, color: ink, maxW: ch.w - 16 });
    }
  }
}

const kindsIn = (grid) => KINDS_BEST_FIRST.filter((k) => grid.players.some((pl) => grid.counts[pl.id][k.v] > 0));

function kindIcon(p, k, x, y) {
  const ink = mark(p, k.v, x, y, 11);
  p.text(SAMPLE[k.v], x, y + 1, { size: 12, weight: 700, color: ink });
}

// ---------- แนวนอน: หลุมเป็นคอลัมน์ ผู้เล่นเป็นแถว เหมือนสกอร์การ์ดจริง ----------

function drawLandscape({ round, grid, games = [] }) {
  const ps = grid.players;
  const rows = grid.rows;
  const front = rows.filter((r) => r.number <= 9);
  const back = rows.filter((r) => r.number > 9);
  const split = front.length > 0 && back.length > 0;
  const hasHc = rows.some((r) => Number.isInteger(r.hc));
  const dist = (r) => (Number(r.hole?.distance) > 0 ? Number(r.hole.distance) : null);
  const hasDist = rows.some(dist);
  const unit = rows.find(dist)?.hole.distance_unit === 'm' ? 'เมตร' : 'หลา';
  const sumDist = (rs) => (rs.length && rs.every(dist) ? rs.reduce((a, r) => a + dist(r), 0) : '');

  const PAD = 28;
  const cols = [{ type: 'label', w: 190 }];
  const addHoles = (rs) => rs.forEach((r) => cols.push({ type: 'hole', w: 50, r }));
  if (split) {
    addHoles(front);
    cols.push({ type: 'sum', w: 64, label: 'OUT', part: grid.front, rs: front });
    addHoles(back);
    cols.push({ type: 'sum', w: 64, label: 'IN', part: grid.back, rs: back });
  } else {
    addHoles(rows);
  }
  cols.push({ type: 'tot', w: 76, label: 'รวม', part: grid.total, rs: rows });
  cols.push({ type: 'diff', w: 72, label: '+/−' });
  let cx = PAD;
  for (const c of cols) { c.x = cx; c.mid = cx + c.w / 2; cx += c.w; }
  const TW = cx - PAD;
  const W = TW + PAD * 2;

  const HEAD_H = 42, DIST_H = 28, PAR_H = 36, HC_H = 28, P_H = ps.length <= 2 ? 60 : 52;
  const HEADER_H = 128;
  const tableY = HEADER_H + 24;
  const tableH = HEAD_H + (hasDist ? DIST_H : 0) + PAR_H + (hasHc ? HC_H : 0) + ps.length * P_H;

  // แผงล่าง: สรุปจำนวนสกอร์แต่ละแบบ + ผลเกม (วางข้างกันถ้ากว้างพอ)
  const m = measurer();
  const kinds = kindsIn(grid);
  let countsW = kinds.length ? (games.length ? 190 + kinds.length * 72 : TW) : 0;
  const countsH = kinds.length ? 50 + 50 + ps.length * 36 + 8 : 0;
  let gamesW = games.length ? TW - (countsW ? countsW + 20 : 0) : 0;
  let stacked = false;
  if (games.length && countsW && gamesW < 380) { stacked = true; gamesW = TW; countsW = TW; }
  const gl = games.length ? layoutGames(m, games, gamesW) : null;
  const bottomY = tableY + tableH + 22;
  const bottomH = stacked ? countsH + 20 + gl.h : Math.max(countsH, gl?.h ?? 0);
  const footY = bottomY + bottomH + (bottomH ? 26 : 8);
  const H = footY + 22;

  const { canvas, p } = newCanvas(W, H);
  const { g } = p;
  p.fill(0, 0, W, H, C.page);
  headerBand(p, W, HEADER_H, { round, grid });

  // ตาราง
  g.save();
  p.box(PAD, tableY, TW, tableH, 16, C.bg);
  g.clip();
  const band = (y, h, base, { sum = C.sumBg, tot = C.deep } = {}) => {
    p.fill(PAD, y, TW, h, base);
    for (const c of cols) {
      if (c.type === 'sum') p.fill(c.x, y, c.w, h, sum);
      if (c.type === 'tot') p.fill(c.x, y, c.w, h, tot);
    }
  };
  let y = tableY;
  band(y, HEAD_H, C.head, { sum: C.head, tot: '#0a2e1c' });
  for (const c of cols) {
    const my = y + HEAD_H / 2 + 1;
    if (c.type === 'label') p.text('หลุม', c.x + 18, my, { size: 15, weight: 700, color: '#ffffff', align: 'left' });
    else if (c.type === 'hole') p.text(c.r.number, c.mid, my, { size: 16, weight: 700, color: '#ffffff' });
    else p.text(c.label, c.mid, my, { size: 14, weight: 700, color: c.type === 'diff' ? 'rgba(255,255,255,0.8)' : '#ffffff' });
  }
  y += HEAD_H;

  if (hasDist) {
    band(y, DIST_H, C.bg);
    for (const c of cols) {
      const my = y + DIST_H / 2 + 1;
      if (c.type === 'label') p.text(`ระยะ (${unit})`, c.x + 18, my, { size: 13, color: C.muted, align: 'left' });
      else if (c.type === 'hole') p.text(dist(c.r) ?? '', c.mid, my, { size: 13, color: C.muted });
      else if (c.type === 'sum') p.text(sumDist(c.rs), c.mid, my, { size: 13, weight: 600, color: C.muted });
      else if (c.type === 'tot') p.text(sumDist(c.rs), c.mid, my, { size: 13, weight: 600, color: 'rgba(255,255,255,0.8)' });
    }
    p.line(PAD, y + DIST_H, PAD + TW, y + DIST_H);
    y += DIST_H;
  }

  band(y, PAR_H, C.brandSoft, { sum: '#d3e9da' });
  for (const c of cols) {
    const my = y + PAR_H / 2 + 1;
    if (c.type === 'label') p.text('พาร์', c.x + 18, my, { size: 15, weight: 700, color: C.brand, align: 'left' });
    else if (c.type === 'hole') p.text(c.r.par ?? '–', c.mid, my, { size: 16, weight: 700, color: C.brand });
    else if (c.type === 'sum') p.text(c.part.par || '', c.mid, my, { size: 16, weight: 700, color: C.brand });
    else if (c.type === 'tot') p.text(c.part.par || '', c.mid, my, { size: 17, weight: 700, color: '#ffffff' });
  }
  y += PAR_H;

  if (hasHc) {
    band(y, HC_H, C.bg);
    for (const c of cols) {
      const my = y + HC_H / 2 + 1;
      if (c.type === 'label') p.text('HC (ความยาก)', c.x + 18, my, { size: 13, color: C.muted, align: 'left' });
      else if (c.type === 'hole') p.text(c.r.hc ?? '', c.mid, my, { size: 13, color: C.muted });
    }
    p.line(PAD, y + HC_H, PAD + TW, y + HC_H, C.line);
    y += HC_H;
  }

  ps.forEach((pl, i) => {
    band(y, P_H, i % 2 ? C.alt : C.bg);
    const my = y + P_H / 2;
    const hc = Number(pl.handicap) > 0 ? `HC ${pl.handicap}` : '';
    for (const c of cols) {
      if (c.type === 'label') {
        const ar = ps.length <= 2 ? 17 : 15;
        avatar(p, pl.name, i, c.x + 16 + ar, my, ar);
        const nx = c.x + 16 + ar * 2 + 10, maxW = c.x + c.w - nx - 10;
        p.text(pl.name, nx, hc ? my - 8 : my + 1, { size: 17, weight: 700, align: 'left', maxW });
        if (hc) p.text(hc, nx, my + 13, { size: 12, color: C.muted, align: 'left' });
      } else if (c.type === 'hole') {
        scoreCell(p, c.r.cells[pl.id], c.mid, my, 15, 17);
      } else if (c.type === 'sum' || c.type === 'tot') {
        const b = c.part.byPlayer[pl.id];
        p.text(b.count ? b.strokes : '–', c.mid, my + 1, {
          size: c.type === 'tot' ? 21 : 17, weight: 700, color: c.type === 'tot' ? '#ffffff' : C.ink,
        });
      } else if (c.type === 'diff') {
        const over = grid.total.byPlayer[pl.id].over;
        if (over == null) { p.text('–', c.mid, my + 1, { color: C.faint }); continue; }
        const [bg, ink] = over < 0 ? [C.redSoft, C.red] : over === 0 ? ['#e4ecfb', C.blue] : [C.graySoft, C.ink];
        p.box(c.mid - 26, my - 14, 52, 28, 14, bg);
        p.text(fmtOver(over), c.mid, my + 1, { size: 15, weight: 700, color: ink });
      }
    }
    if (i < ps.length - 1) p.line(PAD, y + P_H, PAD + TW, y + P_H);
    y += P_H;
  });

  const bodyY = tableY + HEAD_H;
  for (const c of cols.slice(1)) {
    const strong = c.type !== 'hole' || cols[cols.indexOf(c) - 1].type !== 'hole';
    p.line(c.x, bodyY, c.x, tableY + tableH, strong ? C.line : C.grid);
  }
  g.restore();
  p.box(PAD, tableY, TW, tableH, 16, null, C.line);

  // สรุปสกอร์
  if (kinds.length) {
    const x0 = PAD, y0 = bottomY;
    p.box(x0, y0, countsW, countsH, 14, C.bg, C.line);
    p.text('สรุปสกอร์', x0 + 18, y0 + 26, { size: 16, weight: 700, color: C.brand, align: 'left' });
    const kw = (countsW - 190) / kinds.length;
    const kx = (j) => x0 + 190 + kw * j + kw / 2;
    kinds.forEach((k, j) => {
      kindIcon(p, k, kx(j), y0 + 62);
      p.text(k.th, kx(j), y0 + 88, { size: 12, weight: 600, color: C.muted, maxW: kw - 6 });
    });
    let ry = y0 + 100;
    ps.forEach((pl, i) => {
      p.line(x0 + 12, ry, x0 + countsW - 12, ry);
      avatar(p, pl.name, i, x0 + 18 + 11, ry + 18, 11);
      p.text(pl.name, x0 + 48, ry + 19, { size: 15, weight: 600, align: 'left', maxW: 190 - 58 });
      kinds.forEach((k, j) => {
        const n = grid.counts[pl.id][k.v];
        p.text(n || '·', kx(j), ry + 19, { size: 16, weight: n ? 700 : 400, color: n ? C.ink : C.faint });
      });
      ry += 36;
    });
  }
  if (gl) {
    const gx = stacked || !countsW ? PAD : PAD + countsW + 20;
    const gy = stacked ? bottomY + countsH + 20 : bottomY;
    drawGames(p, gl, gx, gy, gamesW);
  }
  footer(p, W, footY, PAD);
  return canvas;
}

// ---------- แนวตั้ง: หลุมเป็นแถว ผู้เล่นเป็นคอลัมน์ ----------

function drawPortrait({ round, grid, games = [] }) {
  const ps = grid.players;
  const hasHc = grid.rows.some((r) => Number.isInteger(r.hc));
  const PAD = 16;
  const colW = [54, 46, ...(hasHc ? [42] : [])];
  const fixed = colW.reduce((a, b) => a + b, 0);
  let pw = Math.max(92, Math.min(136, Math.floor(560 / Math.max(ps.length, 1))));
  if (fixed + pw * ps.length + PAD * 2 < 380) pw = Math.floor((380 - PAD * 2 - fixed) / ps.length);
  const TW = fixed + pw * ps.length;
  const W = TW + PAD * 2;
  const rowH = 36;

  const lines = [{ type: 'head' }];
  for (const r of grid.rows) {
    lines.push({ type: 'hole', r });
    if (r.number === 9 && grid.rows.some((x) => x.number > 9)) lines.push({ type: 'sub', label: '9 แรก', part: grid.front });
  }
  if (grid.rows.some((x) => x.number > 9) && grid.rows.some((x) => x.number <= 9)) lines.push({ type: 'sub', label: '9 หลัง', part: grid.back });
  lines.push({ type: 'total', label: 'รวม', part: grid.total });

  const m = measurer();
  const kinds = kindsIn(grid);
  const countsH = kinds.length ? 50 + 34 + kinds.length * 34 + 8 : 0;
  const gl = games.length ? layoutGames(m, games, TW) : null;
  const HEADER_H = 96;
  const tableY = HEADER_H + 16;
  const tableH = lines.length * rowH;
  let y2 = tableY + tableH + 16;
  const countsY = y2;
  if (countsH) y2 += countsH + 16;
  const gamesY = y2;
  if (gl) y2 += gl.h + 16;
  const footY = y2 + 8;
  const H = footY + 20;

  const { canvas, p } = newCanvas(W, H);
  const { g } = p;
  p.fill(0, 0, W, H, C.page);
  headerBand(p, W, HEADER_H, { round, grid }, { compact: true });

  const cols = [...colW, ...ps.map(() => pw)];
  const colX = [PAD];
  for (let i = 1; i < cols.length; i++) colX[i] = colX[i - 1] + cols[i - 1];
  const cx = (i) => colX[i] + cols[i] / 2;
  const pStart = colW.length;

  g.save();
  p.box(PAD, tableY, TW, tableH, 14, C.bg);
  g.clip();
  let y = tableY;
  lines.forEach((l, i) => {
    const my = y + rowH / 2 + 1;
    if (l.type === 'head') {
      p.fill(PAD, y, TW, rowH, C.head);
      p.text('หลุม', cx(0), my, { size: 13, weight: 700, color: '#ffffff' });
      p.text('พาร์', cx(1), my, { size: 13, weight: 700, color: '#ffffff' });
      if (hasHc) p.text('HC', cx(2), my, { size: 13, weight: 700, color: '#ffffff' });
      ps.forEach((pl, k) => p.text(pl.name, cx(pStart + k), my, { size: 15, weight: 700, color: '#ffffff', maxW: pw - 12 }));
    } else if (l.type === 'hole') {
      const r = l.r;
      p.fill(PAD, y, TW, rowH, i % 2 ? C.bg : C.alt);
      p.fill(colX[1], y, cols[1], rowH, C.brandSoft);
      p.text(r.number, cx(0), my, { size: 15, weight: 700 });
      p.text(r.par ?? '–', cx(1), my, { size: 15, weight: 700, color: C.brand });
      if (hasHc) p.text(r.hc ?? '', cx(2), my, { size: 13, color: C.muted });
      ps.forEach((pl, k) => scoreCell(p, r.cells[pl.id], cx(pStart + k), y + rowH / 2, 14, 16));
      p.line(PAD, y + rowH, PAD + TW, y + rowH);
    } else {
      const dark = l.type === 'total';
      p.fill(PAD, y, TW, rowH, dark ? C.deep : C.sumBg);
      p.text(l.label, colX[0] + 10, my, { size: 14, weight: 700, color: dark ? '#ffffff' : C.ink, align: 'left' });
      p.text(l.part.par || '', cx(1), my, { size: 15, weight: 700, color: dark ? '#ffffff' : C.brand });
      ps.forEach((pl, k) => {
        const b = l.part.byPlayer[pl.id];
        const x = cx(pStart + k);
        p.text(b.count ? b.strokes : '–', x - 12, my, { size: dark ? 18 : 16, weight: 700, color: dark ? '#ffffff' : C.ink });
        if (b.over != null) p.text(fmtOver(b.over), x + 20, my, { size: 13, weight: 700, color: dark ? '#9fe0b8' : C.brand });
      });
      p.line(PAD, y + rowH, PAD + TW, y + rowH, C.line);
    }
    y += rowH;
  });
  for (let i = 1; i < cols.length; i++) p.line(colX[i], tableY + rowH, colX[i], tableY + tableH, i >= pStart ? C.line : C.grid);
  g.restore();
  p.box(PAD, tableY, TW, tableH, 14, null, C.line);

  if (kinds.length) {
    p.box(PAD, countsY, TW, countsH, 14, C.bg, C.line);
    p.text('สรุปสกอร์', PAD + 16, countsY + 26, { size: 16, weight: 700, color: C.brand, align: 'left' });
    let ry = countsY + 50;
    ps.forEach((pl, k) => p.text(shortName(pl.name), cx(pStart + k), ry + 17, { size: 13, weight: 700, color: C.muted, maxW: pw - 10 }));
    ry += 34;
    for (const k of kinds) {
      p.line(PAD + 10, ry, PAD + TW - 10, ry);
      kindIcon(p, k, PAD + 28, ry + 17);
      p.text(k.th, PAD + 48, ry + 18, { size: 14, weight: 600, align: 'left', maxW: colX[pStart] - PAD - 52 });
      ps.forEach((pl, j) => {
        const n = grid.counts[pl.id][k.v];
        p.text(n || '·', cx(pStart + j), ry + 18, { size: 16, weight: n ? 700 : 400, color: n ? C.ink : C.faint });
      });
      ry += 34;
    }
  }
  if (gl) drawGames(p, gl, PAD, gamesY, TW);
  footer(p, W, footY, PAD);
  return canvas;
}

// ---------- ส่งออก ----------

export function drawScorecard(data, layout = 'landscape') {
  return layout === 'portrait' ? drawPortrait(data) : drawLandscape(data);
}

async function fontsReady() {
  try {
    await Promise.all([400, 600, 700].map((w) => document.fonts?.load(`${w} 16px "IBM Plex Sans Thai"`, 'กข 0123')));
    await document.fonts?.ready;
  } catch { /* ใช้ฟอนต์สำรองของเครื่อง */ }
}

export async function renderScorecard(data, layout) {
  await fontsReady();
  const canvas = drawScorecard(data, layout);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  return { blob, width: canvas.width, height: canvas.height };
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// แชร์ไฟล์ผ่านเมนูของเครื่อง ถ้าเครื่องไม่รองรับจะบันทึกเป็นไฟล์แทน
export async function shareBlob(blob, name, title) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  saveBlob(blob, name);
  return 'downloaded';
}
