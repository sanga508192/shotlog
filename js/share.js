// สร้างรูปสกอร์การ์ด (PNG) แล้วแชร์ผ่านเมนูแชร์ของมือถือ หรือดาวน์โหลดถ้าแชร์ไฟล์ไม่ได้
import { SCORE_KINDS, fmtOver } from './group.js';

const C = {
  bg: '#ffffff', ink: '#16241c', muted: '#6b7a71', line: '#d5ddd7',
  brand: '#1f6f4a', brandSoft: '#e6f2ea', head: '#16241c', headInk: '#ffffff',
  sub: '#dff3e6', total: '#16241c', totalInk: '#ffffff', alt: '#f4f7f5',
  hio: '#d7263d', eagle: '#f2b705', birdie: '#d7263d', par: '#1d5fd1', double: '#8a6f00', mess: '#6b7a71',
};
const FONT = '"IBM Plex Sans Thai", "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif';

export function drawScorecard({ round, grid, gameLines = [] }) {
  const ps = grid.players;
  const colW = [56, 48, ...(grid.rows.some((r) => Number.isInteger(r.hc)) ? [44] : [])];
  const hasHc = colW.length === 3;
  const pw = Math.max(96, Math.min(140, Math.floor(560 / Math.max(ps.length, 1))));
  const W = colW.reduce((a, b) => a + b, 0) + pw * ps.length + 32;
  const rowH = 34;
  const lines = [];   // [{ type, ... }]
  lines.push({ type: 'head' });
  for (const r of grid.rows) {
    lines.push({ type: 'hole', r });
    if (r.number === 9 && grid.rows.length > 9) lines.push({ type: 'sub', label: '9แรก', part: grid.front });
    if (r.number === 18 && grid.rows.length > 18) lines.push({ type: 'sub', label: '9หลัง', part: grid.back });
  }
  if (grid.rows.length > 9 && grid.rows.length <= 18) lines.push({ type: 'sub', label: '9หลัง', part: grid.back });
  lines.push({ type: 'total', label: 'รวม', part: grid.total });
  const countsH = (SCORE_KINDS.length + 1) * 30 + 16;
  const gamesH = gameLines.length ? 34 + gameLines.length * 26 : 0;
  const H = 96 + lines.length * rowH + 12 + countsH + gamesH + 40;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const g = canvas.getContext('2d');
  g.scale(scale, scale);
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'middle';

  const text = (s, x, y, { size = 16, weight = 400, color = C.ink, align = 'center' } = {}) => {
    g.font = `${weight} ${size}px ${FONT}`;
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(String(s), x, y);
  };

  // หัวกระดาษ
  g.fillStyle = C.brand;
  g.beginPath();
  if (g.roundRect) g.roundRect(16, 16, 60, 60, 12); else g.rect(16, 16, 60, 60);
  g.fill();
  text('⛳', 46, 47, { size: 30 });
  text(round.course_name_snapshot, 90, 36, { size: 22, weight: 700, align: 'left' });
  text(`${round.played_at} · ${round.province_snapshot || ''}${round.tee_name ? ` · แท่น ${round.tee_name}` : ''}`, 90, 64, { size: 15, color: C.muted, align: 'left' });

  let y = 96;
  const x0 = 16;
  const cols = [...colW, ...ps.map(() => pw)];
  const colX = [x0];
  for (let i = 1; i < cols.length; i++) colX[i] = colX[i - 1] + cols[i - 1];
  const cx = (i) => colX[i] + cols[i] / 2;
  const pStart = colW.length;

  for (const [i, l] of lines.entries()) {
    const fill = l.type === 'head' ? C.head : l.type === 'total' ? C.total : l.type === 'sub' ? C.sub : (i % 2 ? C.alt : C.bg);
    g.fillStyle = fill;
    g.fillRect(x0, y, W - 32, rowH);
    const ink = l.type === 'head' || l.type === 'total' ? C.headInk : C.ink;
    if (l.type === 'head') {
      text('H', cx(0), y + rowH / 2, { weight: 700, color: ink });
      text('P', cx(1), y + rowH / 2, { weight: 700, color: ink });
      if (hasHc) text('HC', cx(2), y + rowH / 2, { size: 13, weight: 700, color: ink });
      ps.forEach((p, k) => text(p.name.length > 9 ? `${p.name.slice(0, 8)}…` : p.name, cx(pStart + k), y + rowH / 2, { weight: 700, color: ink }));
    } else if (l.type === 'hole') {
      const r = l.r;
      text(r.number, cx(0), y + rowH / 2, { weight: 600 });
      text(r.par ?? '–', cx(1), y + rowH / 2, { weight: 600 });
      if (hasHc) text(r.hc ?? '', cx(2), y + rowH / 2, { size: 13, color: C.muted });
      ps.forEach((p, k) => {
        const c = r.cells[p.id];
        if (!c) return;
        const x = cx(pStart + k), yy = y + rowH / 2;
        if (c.kind === 'hio') {
          g.fillStyle = C.hio; g.fillRect(colX[pStart + k] + 1, y + 1, pw - 2, rowH - 2);
          text(c.strokes, x, yy, { size: 18, weight: 700, color: '#fff' });
        } else if (c.kind === 'eagle' || c.kind === 'albatross') {
          g.strokeStyle = C.eagle; g.lineWidth = 2; g.beginPath(); g.arc(x, yy, 13, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.arc(x, yy, 9, 0, Math.PI * 2); g.stroke();
          text(c.strokes, x, yy, { size: 17, weight: 700 });
        } else if (c.kind === 'birdie') {
          g.strokeStyle = C.birdie; g.lineWidth = 2; g.beginPath(); g.arc(x, yy, 13, 0, Math.PI * 2); g.stroke();
          text(c.strokes, x, yy, { size: 17, weight: 700, color: C.birdie });
        } else {
          const color = c.kind === 'par' ? C.par : c.kind === 'double' ? C.double : c.kind === 'mess' ? C.mess : c.final ? C.ink : C.muted;
          text(c.strokes, x, yy, { size: 17, weight: c.kind === 'par' ? 700 : 400, color });
        }
      });
    } else {
      text(l.label, colX[0] + 6, y + rowH / 2, { weight: 700, color: ink, align: 'left' });
      text(l.part.par || '', cx(1), y + rowH / 2, { weight: 700, color: ink });
      ps.forEach((p, k) => {
        const b = l.part.byPlayer[p.id];
        text(`${b.strokes}`, cx(pStart + k) - 14, y + rowH / 2, { weight: 700, color: ink });
        text(fmtOver(b.over), cx(pStart + k) + 22, y + rowH / 2, { size: 13, weight: 600, color: l.type === 'total' ? '#9fe0b8' : C.brand });
      });
    }
    g.strokeStyle = C.line; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y + rowH); g.lineTo(W - 16, y + rowH); g.stroke();
    y += rowH;
  }

  // ตารางนับประเภทสกอร์
  y += 12;
  const kindColor = { hio: C.hio, eagle: '#9a7400', albatross: '#9a7400', birdie: C.birdie, par: C.par, double: C.double, mess: C.mess };
  g.fillStyle = C.brandSoft; g.fillRect(x0, y, W - 32, 30);
  ps.forEach((p, k) => text(p.name.length > 9 ? `${p.name.slice(0, 8)}…` : p.name, cx(pStart + k), y + 15, { size: 14, weight: 700 }));
  y += 30;
  for (const kd of SCORE_KINDS) {
    text(kd.th, colX[0] + 6, y + 15, { size: 14, weight: 600, color: kindColor[kd.v] || C.ink, align: 'left' });
    ps.forEach((p, k) => { const n = grid.counts[p.id][kd.v]; if (n) text(n, cx(pStart + k), y + 15, { size: 15, weight: 600 }); });
    g.strokeStyle = C.line; g.beginPath(); g.moveTo(x0, y + 30); g.lineTo(W - 16, y + 30); g.stroke();
    y += 30;
  }

  if (gameLines.length) {
    y += 16;
    text('เกม', x0, y + 8, { size: 16, weight: 700, align: 'left', color: C.brand });
    y += 18;
    for (const line of gameLines) { text(line, x0, y + 13, { size: 14, align: 'left' }); y += 26; }
  }

  const stamp = new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  text(`ShotLog · ${stamp}`, W - 16, H - 18, { size: 12, color: C.muted, align: 'right' });
  return canvas;
}

export async function shareScorecard(data) {
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = drawScorecard(data);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const name = `scorecard-${data.round.played_at}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `สกอร์การ์ด ${data.round.course_name_snapshot}` });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

