// สกอร์ก๊วนและเกมในก๊วน (คำนวณล้วน ๆ ทดสอบด้วย node:test ได้)
// แต้มในเกมเป็นแต้มได้/เสียรวมกันเป็นศูนย์ ไม่ใช่จำนวนเงิน
import { holeScore } from './logic.js';

export const ME = 'me';
export const MAX_PLAYERS = 6;

export const SCORE_KINDS = [
  { v: 'mess', th: 'เละ' },
  { v: 'double', th: 'ดับเบิ้ล' },
  { v: 'bogey', th: 'โบกี้' },
  { v: 'par', th: 'พาร์' },
  { v: 'birdie', th: 'เบอร์ดี้' },
  { v: 'eagle', th: 'อีเกิ้ล' },
  { v: 'albatross', th: 'อัลบาทรอส' },
  { v: 'hio', th: 'โฮลอินวัน' },
];

export const GAME_TYPES = [
  { v: 'skin', th: 'Skin', desc: 'หลุมไหนมีคนตีน้อยที่สุดคนเดียว ได้ 1 สกิน (เสมอ = ทบไปหลุมถัดไปได้)' },
  { v: 'match', th: 'Matchplay ทุกคู่', desc: 'แข่งรายหลุมทุกคู่ในก๊วน ชนะหลุมได้ 1 แต้มจากคู่นั้น' },
  { v: 'team', th: 'ทีม 2 ต่อ 2', desc: 'เทียบสกอร์ดีที่สุดของแต่ละทีมรายหลุม (เลือกนับผลรวมทีมเพิ่มได้)' },
  { v: 'stableford', th: 'Stableford', desc: 'แต้มตามสกอร์เทียบพาร์: พาร์ 2 เบอร์ดี้ 3 โบกี้ 1 ดับเบิ้ลขึ้นไป 0' },
  { v: 'stroke', th: 'สโตรกรวม', desc: 'จัดอันดับสกอร์รวม ทั้งแบบไม่หักและหักแต้มต่อ' },
];

// ข้อมูลผู้เล่นที่เสีย (ไม่ใช่รายการ หรือไม่มีรหัส) ถือว่าเล่นคนเดียว ไม่ทำให้หน้าพัง
export function playersOf(round, myName = 'ฉัน') {
  const list = Array.isArray(round?.players) ? round.players.filter((p) => p && p.id != null) : [];
  return list.length ? list.map((p) => ({ ...p, name: String(p.name ?? '') })) : [{ id: ME, name: myName, handicap: null }];
}

export function playerName(round, pid, myName) {
  return playersOf(round, myName).find((p) => p.id === pid)?.name ?? '?';
}

// สกอร์ของผู้เล่นในหลุม: ตัวเราที่จดรายช็อตใช้ผลจากช็อต (นับเมื่อจบหลุม) นอกนั้นใช้เลขที่กรอก
export function playerHoleScore(hole, pid, shots = [], penalties = []) {
  if (pid === ME && (shots.length || penalties.length)) {
    const s = holeScore(hole, shots, penalties);
    return { strokes: s.total, final: hole.status === 'done', source: 'shots' };
  }
  const v = hole.group_scores?.[pid];
  return Number.isInteger(v) && v > 0 ? { strokes: v, final: true, source: 'quick' } : null;
}

export function classify(strokes, par) {
  if (!Number.isInteger(strokes) || !Number.isInteger(par)) return null;
  if (strokes === 1) return 'hio';
  const d = strokes - par;
  if (d <= -3) return 'albatross';
  if (d === -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  if (d === 2) return 'double';
  return 'mess';
}

// ตาราง: แถวหลุม × คอลัมน์ผู้เล่น พร้อมรวม 9 แรก / 9 หลัง / ทั้งหมด และจำนวนแต่ละประเภท
// "เกิน" นับเฉพาะหลุมที่มีสกอร์ครบแล้วของคนนั้น
export function scoreGrid(round, holes, shotsOf = () => [], penaltiesOf = () => [], myName) {
  const players = playersOf(round, myName);
  const rows = holes.map((h) => {
    const cells = {};
    for (const p of players) {
      const sc = playerHoleScore(h, p.id, shotsOf(h.id), penaltiesOf(h.id));
      cells[p.id] = sc ? { ...sc, kind: sc.final ? classify(sc.strokes, h.par) : null } : null;
    }
    return { hole: h, number: h.number, par: h.par ?? null, hc: h.hc_index ?? null, cells };
  });
  const part = (filter) => {
    const out = { par: 0, byPlayer: {} };
    const rs = rows.filter(filter);
    out.par = rs.reduce((a, r) => a + (r.par || 0), 0);
    out.holes = rs.length;
    for (const p of players) {
      let strokes = 0, count = 0, over = 0, withPar = 0;
      for (const r of rs) {
        const c = r.cells[p.id];
        if (!c?.final) continue;
        strokes += c.strokes;
        count++;
        if (r.par) { over += c.strokes - r.par; withPar++; }
      }
      out.byPlayer[p.id] = { strokes, count, over: withPar ? over : null, unknownPar: count - withPar };
    }
    return out;
  };
  const counts = {};
  for (const p of players) {
    counts[p.id] = Object.fromEntries(SCORE_KINDS.map((k) => [k.v, 0]));
    for (const r of rows) {
      const k = r.cells[p.id]?.kind;
      if (k) counts[p.id][k]++;
    }
  }
  return {
    players,
    rows,
    front: part((r) => r.number <= 9),
    back: part((r) => r.number >= 10 && r.number <= 18),
    total: part(() => true),
    counts,
  };
}

// ---------- แต้มต่อ ----------

// จำนวนสโตรกที่ได้รับในหลุมที่มีดัชนีความยาก si (1 = ยากสุด) จากแต้มต่อ allowance
export function strokesReceived(allowance, si, holeCount = 18) {
  if (!allowance || allowance <= 0 || !Number.isInteger(si) || si < 1) return 0;
  return Math.floor(allowance / holeCount) + (si <= allowance % holeCount ? 1 : 0);
}

const hcpOf = (players, pid) => Math.max(0, Math.round(Number(players.find((p) => p.id === pid)?.handicap) || 0));

// ---------- เกม ----------

function gameContext(game, grid) {
  const all = grid.players.map((p) => p.id);
  const ids = (game.players?.length ? game.players : all).filter((id) => all.includes(id));
  const point = Number(game.point) > 0 ? Number(game.point) : 1;
  const useHc = game.use_handicap !== false;
  const warnings = [];
  // หลุมที่นับได้ = ผู้เล่นในเกมมีสกอร์ครบทุกคน
  const holes = grid.rows.filter((r) => ids.every((id) => r.cells[id]?.final));
  if (useHc && ids.some((id) => hcpOf(grid.players, id) > 0) && holes.some((r) => !Number.isInteger(r.hc))) {
    warnings.push('บางหลุมยังไม่ได้กรอก HC (ดัชนีความยาก) จึงไม่ได้ให้แต้มต่อในหลุมนั้น');
  }
  return { ids, point, useHc, holes, warnings };
}

const net = (row, pid, allowance) => row.cells[pid].strokes - strokesReceived(allowance, row.hc);

function relativeAllowances(ids, players, useHc) {
  if (!useHc) return Object.fromEntries(ids.map((id) => [id, 0]));
  const min = Math.min(...ids.map((id) => hcpOf(players, id)));
  return Object.fromEntries(ids.map((id) => [id, hcpOf(players, id) - min]));
}

function zeroPoints(ids) {
  return Object.fromEntries(ids.map((id) => [id, 0]));
}

export function skinGame(game, grid) {
  const { ids, point, useHc, holes, warnings } = gameContext(game, grid);
  const allow = relativeAllowances(ids, grid.players, useHc);
  const points = zeroPoints(ids);
  const skins = zeroPoints(ids);
  const log = [];
  let carried = 0;
  for (const r of holes) {
    const nets = ids.map((id) => [id, net(r, id, allow[id])]);
    const best = Math.min(...nets.map(([, n]) => n));
    const winners = nets.filter(([, n]) => n === best).map(([id]) => id);
    if (winners.length === 1) {
      const won = 1 + carried;
      const w = winners[0];
      skins[w] += won;
      for (const id of ids) points[id] += id === w ? won * point * (ids.length - 1) : -won * point;
      log.push({ number: r.number, winner: w, skins: won });
      carried = 0;
    } else {
      if (game.carry !== false) carried++;
      log.push({ number: r.number, winner: null, tied: winners, carried: game.carry !== false ? carried : 0 });
    }
  }
  return { ids, skins, points, log, carriedOver: carried, holesCounted: holes.length, warnings };
}

export function matchGame(game, grid) {
  const { ids, point, useHc, holes, warnings } = gameContext(game, grid);
  const points = zeroPoints(ids);
  const pairs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      const diff = useHc ? hcpOf(grid.players, a) - hcpOf(grid.players, b) : 0;
      // คนที่แฮนดิแคปสูงกว่าได้แต้มต่อเท่ากับส่วนต่าง
      const allowA = diff > 0 ? diff : 0;
      const allowB = diff < 0 ? -diff : 0;
      let wa = 0, wb = 0, halved = 0;
      const log = [];
      for (const r of holes) {
        const na = net(r, a, allowA), nb = net(r, b, allowB);
        const res = na < nb ? a : nb < na ? b : null;
        if (res === a) wa++; else if (res === b) wb++; else halved++;
        log.push({ number: r.number, winner: res });
      }
      points[a] += (wa - wb) * point;
      points[b] += (wb - wa) * point;
      pairs.push({ a, b, wonA: wa, wonB: wb, halved, strokesTo: allowA ? a : allowB ? b : null, strokes: Math.max(allowA, allowB), log });
    }
  }
  return { ids, points, pairs, holesCounted: holes.length, warnings };
}

export function teamGame(game, grid) {
  const ctx = gameContext(game, grid);
  const teams = (game.teams || []).map((t) => t.filter((id) => ctx.ids.includes(id)));
  if (teams.length !== 2 || teams.some((t) => !t.length)) {
    return { ids: ctx.ids, points: zeroPoints(ctx.ids), teams, log: [], holesCounted: 0, warnings: ['ยังจัดทีมไม่ครบ 2 ทีม'] };
  }
  const ids = teams.flat();
  const { point, useHc, warnings } = ctx;
  const holes = grid.rows.filter((r) => ids.every((id) => r.cells[id]?.final));
  const allow = relativeAllowances(ids, grid.players, useHc);
  const points = zeroPoints(ids);
  const won = [0, 0];
  const log = [];
  const award = (t, n) => {
    for (const id of teams[t]) points[id] += n * point;
    for (const id of teams[1 - t]) points[id] -= n * point;
  };
  for (const r of holes) {
    const nets = teams.map((t) => t.map((id) => net(r, id, allow[id])));
    const best = nets.map((n) => Math.min(...n));
    const entry = { number: r.number, best: null, total: null };
    if (best[0] !== best[1]) { const t = best[0] < best[1] ? 0 : 1; award(t, 1); won[t]++; entry.best = t; }
    if (game.team_total) {
      const sum = nets.map((n) => n.reduce((a, x) => a + x, 0));
      if (sum[0] !== sum[1]) { const t = sum[0] < sum[1] ? 0 : 1; award(t, 1); entry.total = t; }
    }
    log.push(entry);
  }
  return { ids, teams, points, won, log, holesCounted: holes.length, warnings };
}

export function stablefordGame(game, grid) {
  const { ids, useHc, warnings } = gameContext(game, grid);
  const totals = zeroPoints(ids);
  const holesCounted = zeroPoints(ids);
  for (const r of grid.rows) {
    if (!Number.isInteger(r.par)) continue;
    for (const id of ids) {
      const c = r.cells[id];
      if (!c?.final) continue;
      const n = c.strokes - (useHc ? strokesReceived(hcpOf(grid.players, id), r.hc) : 0);
      totals[id] += Math.max(0, 2 + r.par - n);
      holesCounted[id]++;
    }
  }
  return { ids, totals, holesCounted, ranking: rank(ids, (id) => -totals[id]), warnings };
}

export function strokeGame(game, grid) {
  const { ids, useHc, warnings } = gameContext(game, grid);
  const gross = zeroPoints(ids), netTotal = zeroPoints(ids), holesCounted = zeroPoints(ids);
  for (const r of grid.rows) {
    for (const id of ids) {
      const c = r.cells[id];
      if (!c?.final) continue;
      gross[id] += c.strokes;
      netTotal[id] += c.strokes - (useHc ? strokesReceived(hcpOf(grid.players, id), r.hc) : 0);
      holesCounted[id]++;
    }
  }
  return { ids, gross, net: netTotal, holesCounted, ranking: rank(ids, (id) => netTotal[id]), warnings };
}

// อันดับ: ค่าน้อยดีกว่า เท่ากันได้อันดับเท่ากัน
function rank(ids, score) {
  const sorted = [...ids].sort((a, b) => score(a) - score(b));
  let r = 0;
  return sorted.map((id, i) => {
    if (i === 0 || score(id) !== score(sorted[i - 1])) r = i + 1;
    return { id, rank: r };
  });
}

export function computeGame(game, grid) {
  switch (game.type) {
    case 'skin': return skinGame(game, grid);
    case 'match': return matchGame(game, grid);
    case 'team': return teamGame(game, grid);
    case 'stableford': return stablefordGame(game, grid);
    case 'stroke': return strokeGame(game, grid);
    default: return { ids: [], warnings: [`ไม่รู้จักเกม ${game.type}`] };
  }
}

// รวมแต้มได้/เสียจากทุกเกมที่เป็นแต้มแลกกัน (Skin, Matchplay, ทีม)
export function pointsSummary(games, grid) {
  const total = Object.fromEntries(grid.players.map((p) => [p.id, 0]));
  for (const g of games) {
    if (!['skin', 'match', 'team'].includes(g.type)) continue;
    const r = computeGame(g, grid);
    for (const [id, v] of Object.entries(r.points || {})) total[id] = (total[id] || 0) + v;
  }
  return total;
}

export function fmtOver(n) {
  if (n == null) return '–';
  return n > 0 ? `+${n}` : String(n);
}
