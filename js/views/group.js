// หน้าจอก๊วน: ตั้งผู้เล่นและเกม, กรอกสกอร์รายหลุม, ตารางสกอร์การ์ด, ผลเกม, พาร์/HC ของสนาม
import * as st from '../state.js';
import { esc, header, chips, toast } from '../ui.js';
import {
  ME, MAX_PLAYERS, SCORE_KINDS, GAME_TYPES, playersOf, scoreGrid, computeGame, pointsSummary, fmtOver,
} from '../group.js';
import { shareScorecard } from '../share.js';

export const myName = () => st.setting('my_name', 'ฉัน');
export const shotLogging = (round) => round.shot_logging !== false;
export const isGroupRound = (round) => playersOf(round).length > 1 || !shotLogging(round);
export const gridOf = (round) => scoreGrid(round, st.holesOf(round.id), st.shotsOf, st.penaltiesOf, myName());

// ---------- พาร์/HC ที่จำไว้ของสนาม ----------

const cardKey = (courseId) => `course_card:${courseId}`;
export const courseCard = (courseId) => st.setting(cardKey(courseId), null);

export async function rememberCourseCard(courseId, holes) {
  const prev = courseCard(courseId) || { pars: {}, hc: {} };
  const next = { pars: { ...prev.pars }, hc: { ...prev.hc } };
  for (const h of holes) {
    if (Number.isInteger(h.par)) next.pars[h.number] = h.par;
    if (Number.isInteger(h.hc_index)) next.hc[h.number] = h.hc_index;
  }
  await st.setSetting(cardKey(courseId), next);
}

// ---------- เพื่อนที่เคยเล่นด้วย ----------

export const friends = () => st.setting('friends', []);

export async function rememberFriends(players) {
  const list = [...friends()];
  for (const p of players) {
    if (p.id === ME || !p.name) continue;
    const i = list.findIndex((f) => f.name === p.name);
    const entry = { name: p.name, handicap: p.handicap ?? null };
    if (i >= 0) list[i] = entry; else list.unshift(entry);
  }
  await st.setSetting('friends', list.slice(0, 30));
}

// ---------- กรอกสกอร์ก๊วนในหน้าหลุม ----------

export function groupEntryHtml(round, hole) {
  const players = playersOf(round, myName());
  const grid = gridOf(round);
  const shots = st.shotsOf(hole.id);
  const pens = st.penaltiesOf(hole.id);
  // 6 ค่าที่พบบ่อยตามพาร์ (พาร์ 3 เริ่มที่ 1 เผื่อโฮลอินวัน) ค่าอื่นกด "…"
  const first = Math.max(1, (hole.par || 4) - 2);
  const values = Array.from({ length: 6 }, (_, i) => ({ v: String(first + i), th: String(first + i) }));
  const rows = players.map((p) => {
    if (p.id === ME && (shots.length || pens.length)) {
      const total = shots.filter((s) => s.counted !== false).length + pens.reduce((a, x) => a + (Number(x.strokes) || 0), 0);
      return `<div class="gp-row"><div class="gp-name">${esc(p.name)}<span class="gp-total">จดรายช็อต</span></div>
        <div class="gp-auto"><b>${total}</b> <span class="muted small">จากช็อตที่จด${hole.status === 'done' ? '' : ' (ยังไม่จบหลุม)'}</span></div></div>`;
    }
    const cur = hole.group_scores?.[p.id];
    const outside = Number.isInteger(cur) && (cur < first || cur >= first + 6);
    const tot = grid.total.byPlayer[p.id];
    return `<div class="gp-row"><div class="gp-name">${esc(p.name)}${p.handicap ? ` <span class="muted small">HC ${esc(p.handicap)}</span>` : ''}
        ${tot.count ? `<span class="gp-total">รวม ${tot.strokes} (${fmtOver(tot.over)})</span>` : ''}</div>
      <div class="chips tight gp-chips">${values.map((o) => `<button type="button" class="chip${String(cur) === o.v ? ' on' : ''}${Number(o.v) === hole.par ? ' par' : ''}"
        data-act="gscore" data-pid="${esc(p.id)}" data-v="${o.v}" aria-pressed="${String(cur) === o.v}">${o.th}</button>`).join('')}
        <button type="button" class="chip ${outside ? 'on' : 'ghost'}" data-act="gmore" data-pid="${esc(p.id)}" aria-label="ค่าอื่น">${outside ? cur : '…'}</button></div></div>`;
  }).join('');
  return `<section class="card group-entry">
    <div class="row between"><h3>สกอร์ก๊วน</h3><a class="mini" href="#/round/${round.id}/setup">ผู้เล่น/เกม</a></div>
    ${rows}
  </section>`;
}

// ใช้ใน actions ของหน้าหลุม
export async function setGroupScore(round, hole, pid, value) {
  const scores = { ...(hole.group_scores || {}) };
  if (value == null || scores[pid] === value) delete scores[pid]; else scores[pid] = value;
  const next = { ...hole, group_scores: scores };
  if (!shotLogging(round)) {
    const all = playersOf(round).every((p) => Number.isInteger(scores[p.id]));
    next.status = all ? 'done' : 'playing';
  }
  await st.commit([{ store: 'holes', put: next }, { store: 'rounds', put: { ...round, current_hole: hole.number } }]);
  return next;
}

// ---------- ตารางสกอร์การ์ด ----------

const KIND_CLASS = { hio: 'k-hio', albatross: 'k-eagle', eagle: 'k-eagle', birdie: 'k-birdie', par: 'k-par', bogey: '', double: 'k-double', mess: 'k-mess' };

export function groupTableHtml(round, grid) {
  const ps = grid.players;
  const hasHc = grid.rows.some((r) => Number.isInteger(r.hc));
  const head = `<tr><th>H</th><th>P</th>${hasHc ? '<th>HC</th>' : ''}${ps.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr>`;
  const cell = (c) => {
    if (!c) return '<td></td>';
    return `<td class="${c.final ? KIND_CLASS[c.kind] || '' : 'k-pending'}"><span class="sc">${c.strokes}</span></td>`;
  };
  const sub = (label, part, cls) => `<tr class="${cls}"><td>${label}</td><td>${part.par || ''}</td>${hasHc ? '<td></td>' : ''}${ps.map((p) => `<td>${part.byPlayer[p.id].strokes}</td>`).join('')}</tr>
    <tr class="${cls} over"><td>เกิน</td><td></td>${hasHc ? '<td></td>' : ''}${ps.map((p) => `<td>${fmtOver(part.byPlayer[p.id].over)}</td>`).join('')}</tr>`;
  const body = [];
  for (const r of grid.rows) {
    body.push(`<tr data-act="goHole" data-n="${r.number}"><td>${r.number}</td><td>${r.par ?? '–'}</td>${hasHc ? `<td class="muted">${r.hc ?? ''}</td>` : ''}${ps.map((p) => cell(r.cells[p.id])).join('')}</tr>`);
    if (r.number === 9 && grid.rows.length > 9) body.push(sub('9แรก', grid.front, 'sub'));
    if (r.number === 18 && grid.rows.length > 18) body.push(sub('9หลัง', grid.back, 'sub'));
  }
  if (grid.rows.length > 9) {
    if (grid.rows.length <= 18) body.push(sub('9หลัง', grid.back, 'sub'));
  }
  body.push(sub('รวม', grid.total, 'total'));
  return `<div class="table-wrap"><table class="card-table gtable">${head}${body.join('')}</table></div>`;
}

export function countsTableHtml(grid) {
  const ps = grid.players;
  return `<div class="table-wrap"><table class="card-table gtable counts">
    <tr><th></th>${ps.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr>
    ${SCORE_KINDS.map((k) => `<tr><td class="${KIND_CLASS[k.v] || ''}">${k.th}</td>${ps.map((p) => `<td>${grid.counts[p.id][k.v] || ''}</td>`).join('')}</tr>`).join('')}
  </table></div>`;
}

// ---------- ผลเกม ----------

const nameOf = (grid, id) => grid.players.find((p) => p.id === id)?.name ?? '?';
const signed = (n) => (n > 0 ? `+${n}` : String(n));

export function gameTitle(game) {
  const t = GAME_TYPES.find((x) => x.v === game.type)?.th ?? game.type;
  const opts = [];
  if (game.use_handicap === false) opts.push('ไม่ใช้แต้มต่อ');
  if (game.type === 'skin' && game.carry === false) opts.push('ไม่ทบ');
  if (game.type === 'team' && game.team_total) opts.push('+ผลรวมทีม');
  if (Number(game.point) > 1) opts.push(`แต้มละ ${game.point}`);
  return opts.length ? `${t} (${opts.join(', ')})` : t;
}

export function gameResultHtml(game, grid) {
  const r = computeGame(game, grid);
  const warn = (r.warnings || []).map((w) => `<p class="note warn">${esc(w)}</p>`).join('');
  let body = '';
  if (game.type === 'skin') {
    body = `<table class="card-table gtable"><tr><th></th><th>สกิน</th><th>แต้ม</th></tr>
      ${r.ids.map((id) => `<tr><td>${esc(nameOf(grid, id))}</td><td>${r.skins[id]}</td><td><b>${signed(r.points[id])}</b></td></tr>`).join('')}</table>
      ${r.carriedOver ? `<p class="note">ทบค้างอยู่ ${r.carriedOver} สกิน</p>` : ''}
      <p class="small muted">${r.log.map((l) => `H${l.number}: ${l.winner ? `${esc(nameOf(grid, l.winner))} ${l.skins > 1 ? `(${l.skins})` : ''}` : 'เสมอ'}`).join(' · ')}</p>`;
  } else if (game.type === 'match') {
    body = r.pairs.map((p) => {
      const diff = p.wonA - p.wonB;
      const lead = diff === 0 ? 'เสมอ' : `${esc(nameOf(grid, diff > 0 ? p.a : p.b))} นำ ${Math.abs(diff)}`;
      return `<div class="pair"><b>${esc(nameOf(grid, p.a))}</b> ${p.wonA} – ${p.wonB} <b>${esc(nameOf(grid, p.b))}</b>
        <span class="muted small">(เสมอ ${p.halved}) · ${lead}${p.strokesTo ? ` · ต่อ ${esc(nameOf(grid, p.strokesTo))} ${p.strokes}` : ''}</span></div>`;
    }).join('') + `<p class="small">แต้มรวม: ${r.ids.map((id) => `${esc(nameOf(grid, id))} <b>${signed(r.points[id])}</b>`).join(' · ')}</p>`;
  } else if (game.type === 'team') {
    const tn = (t) => (r.teams[t] || []).map((id) => nameOf(grid, id)).join('+');
    body = r.teams.length === 2 && r.teams.every((t) => t.length)
      ? `<div class="pair"><b>${esc(tn(0))}</b> ${r.won[0]} – ${r.won[1]} <b>${esc(tn(1))}</b> <span class="muted small">(ชนะหลุม)</span></div>
        <p class="small">แต้มรวม: ${r.ids.map((id) => `${esc(nameOf(grid, id))} <b>${signed(r.points[id])}</b>`).join(' · ')}</p>` : '';
  } else if (game.type === 'stableford') {
    body = `<table class="card-table gtable"><tr><th>#</th><th></th><th>แต้ม</th><th>หลุม</th></tr>
      ${r.ranking.map(({ id, rank }) => `<tr><td>${rank}</td><td>${esc(nameOf(grid, id))}</td><td><b>${r.totals[id]}</b></td><td>${r.holesCounted[id]}</td></tr>`).join('')}</table>`;
  } else if (game.type === 'stroke') {
    body = `<table class="card-table gtable"><tr><th>#</th><th></th><th>รวม</th><th>สุทธิ</th><th>หลุม</th></tr>
      ${r.ranking.map(({ id, rank }) => `<tr><td>${rank}</td><td>${esc(nameOf(grid, id))}</td><td>${r.gross[id]}</td><td><b>${r.net[id]}</b></td><td>${r.holesCounted[id]}</td></tr>`).join('')}</table>`;
  }
  const counted = r.holesCounted != null && typeof r.holesCounted === 'number' ? `<span class="muted small">นับ ${r.holesCounted} หลุมที่กรอกครบ</span>` : '';
  return `<div class="card game"><div class="row between"><h3>${esc(gameTitle(game))}</h3>${counted}</div>${warn}${body}</div>`;
}

export function gamesView([roundId], ctx) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}` };
  const grid = gridOf(round);
  const games = round.games || [];
  const total = pointsSummary(games, grid);
  const hasPointGames = games.some((g) => ['skin', 'match', 'team'].includes(g.type));
  return {
    html: `${header('ผลเกม', { back: `#/round/${roundId}/card`, sub: esc(round.course_name_snapshot) })}<div class="page">
      ${games.length ? '' : '<p class="muted">ยังไม่ได้ตั้งเกม</p>'}
      ${hasPointGames ? `<div class="card"><h3>แต้มได้/เสียรวมทุกเกม</h3>
        <div class="points-list">${[...grid.players].sort((a, b) => (total[b.id] || 0) - (total[a.id] || 0)).map((p) => {
          const v = total[p.id] || 0;
          return `<div class="pt"><span>${esc(p.name)}</span><b class="${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${signed(v)}</b></div>`;
        }).join('')}</div>
        <p class="note">แต้มได้/เสียรวมกันเป็นศูนย์ ก๊วนตกลงกันเองว่าแต้มหนึ่งมีค่าเท่าไร</p></div>` : ''}
      ${games.map((g) => gameResultHtml(g, grid)).join('')}
      <a class="btn block" href="#/round/${roundId}/setup">ตั้งค่าผู้เล่นและเกม</a>
    </div>`,
  };
}

// ---------- ตั้งค่าผู้เล่นและเกม ----------

let draftGame = null;

export function setupView([roundId], ctx) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}` };
  const players = playersOf(round, myName());
  const games = round.games || [];
  const used = new Set(players.map((p) => p.name));
  const friendChips = friends().filter((f) => !used.has(f.name)).slice(0, 12);
  const savePlayers = async (list) => {
    await st.put('rounds', { ...round, players: list });
    await rememberFriends(list);
    ctx.rerender();
  };
  const gameForm = draftGame ? (() => {
    const g = draftGame;
    const type = GAME_TYPES.find((t) => t.v === g.type);
    const teamOf = (id) => (g.teams?.[0]?.includes(id) ? 'A' : g.teams?.[1]?.includes(id) ? 'B' : null);
    return `<div class="card">
      <h3>เพิ่มเกม</h3>
      ${chips('gtype', 'type', GAME_TYPES.map((t) => ({ v: t.v, th: t.th })), g.type)}
      <p class="note">${esc(type.desc)}</p>
      <div class="lbl">ผู้เล่นในเกม</div>
      <div class="chips">${players.map((p) => `<button type="button" class="chip${g.players.includes(p.id) ? ' on' : ''}" data-act="gplayer" data-pid="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>
      ${g.type === 'team' ? `<div class="lbl">จัดทีม (แตะเพื่อสลับ A / B)</div>
        <div class="chips">${players.filter((p) => g.players.includes(p.id)).map((p) => `<button type="button" class="chip team-${teamOf(p.id) || 'none'}" data-act="gteam" data-pid="${esc(p.id)}">${esc(p.name)} · ${teamOf(p.id) || '–'}</button>`).join('')}</div>
        <label class="check"><input type="checkbox" data-change="gopt" data-field="team_total" ${g.team_total ? 'checked' : ''}> นับผลรวมทีมเป็นอีก 1 แต้มต่อหลุม</label>` : ''}
      ${g.type === 'skin' ? `<label class="check"><input type="checkbox" data-change="gopt" data-field="carry" ${g.carry !== false ? 'checked' : ''}> เสมอแล้วทบไปหลุมถัดไป</label>` : ''}
      <label class="check"><input type="checkbox" data-change="gopt" data-field="use_handicap" ${g.use_handicap !== false ? 'checked' : ''}> ใช้แต้มต่อ (HC ของผู้เล่น + HC รายหลุม)</label>
      ${['skin', 'match', 'team'].includes(g.type) ? `<label class="lbl">แต้มต่อหน่วย<input class="input" type="number" min="1" inputmode="numeric" value="${esc(g.point || 1)}" data-input="gpoint"></label>` : ''}
      <div class="row gap"><button type="button" class="btn primary" data-act="gsave">เพิ่มเกมนี้</button><button type="button" class="btn" data-act="gcancel">ยกเลิก</button></div>
    </div>`;
  })() : '<button type="button" class="btn block" data-act="gnew">＋ เพิ่มเกม</button>';

  return {
    html: `${header('ผู้เล่นและเกม', { back: `#/round/${roundId}/card`, sub: esc(round.course_name_snapshot) })}<div class="page">
      <h2>ผู้เล่นในก๊วน (${players.length}/${MAX_PLAYERS})</h2>
      <div class="players-edit">
        ${players.map((p) => `<div class="player-row">
          <input class="input" value="${esc(p.name)}" data-change="pname" data-pid="${esc(p.id)}" aria-label="ชื่อ" ${p.id === ME ? 'title="ชื่อของคุณ"' : ''}>
          <input class="input hc" type="number" inputmode="numeric" min="0" max="54" placeholder="HC" value="${p.handicap ?? ''}" data-change="phc" data-pid="${esc(p.id)}" aria-label="แต้มต่อ">
          ${p.id === ME ? '<span class="tag">ฉัน</span>' : `<button type="button" class="mini danger" data-act="premove" data-pid="${esc(p.id)}" aria-label="เอาออก">✕</button>`}
        </div>`).join('')}
      </div>
      ${players.length < MAX_PLAYERS ? `<form class="row gap" data-submit="padd"><input class="input" name="name" placeholder="ชื่อเพื่อน" required><button class="btn">เพิ่ม</button></form>
        ${friendChips.length ? `<div class="chips">${friendChips.map((f) => `<button type="button" class="chip ghost" data-act="pfriend" data-name="${esc(f.name)}">＋${esc(f.name)}</button>`).join('')}</div>` : ''}` : ''}
      <label class="check"><input type="checkbox" data-change="shotlog" ${shotLogging(round) ? 'checked' : ''}> จดรายช็อตของฉันด้วย (ปิดไว้ = จดแค่สกอร์รวมต่อหลุมแบบเร็ว)</label>
      <p class="note">HC = แต้มต่อของผู้เล่นแต่ละคน ใช้คู่กับ HC รายหลุมของสนาม (<a href="#/round/${roundId}/pars">แก้พาร์/HC</a>)</p>

      <h2>เกมในก๊วน</h2>
      ${games.map((g) => `<div class="card row between"><div><b>${esc(gameTitle(g))}</b><div class="small muted">${g.players?.length ? g.players.map((id) => esc(players.find((p) => p.id === id)?.name ?? '?')).join(', ') : 'ทุกคน'}</div></div>
        <button type="button" class="mini danger" data-act="gdel" data-id="${esc(g.id)}">ลบ</button></div>`).join('')}
      ${gameForm}
      ${games.length ? `<a class="btn block primary" href="#/round/${roundId}/games">ดูผลเกม</a>` : ''}
      <a class="btn block" href="#/round/${roundId}/hole/${round.current_hole || 1}">กลับไปจดสกอร์</a>
    </div>`,
    actions: {
      pname: async (el) => {
        const name = el.value.trim();
        if (!name) { ctx.rerender(); return; }
        if (el.dataset.pid === ME) await st.setSetting('my_name', name);
        await savePlayers(players.map((p) => (p.id === el.dataset.pid ? { ...p, name } : p)));
      },
      phc: async (el) => {
        const v = el.value === '' ? null : Math.max(0, Math.min(54, Math.round(Number(el.value))));
        if (el.dataset.pid === ME) await st.setSetting('my_handicap', v);
        await savePlayers(players.map((p) => (p.id === el.dataset.pid ? { ...p, handicap: Number.isFinite(v) ? v : null } : p)));
      },
      premove: async (el) => {
        const p = players.find((x) => x.id === el.dataset.pid);
        const hasScores = st.holesOf(roundId).some((h) => h.group_scores?.[p.id] != null);
        if (hasScores && !confirm(`เอา ${p.name} ออกจากก๊วน? สกอร์ที่กรอกไว้ของคนนี้จะไม่แสดง`)) return;
        await savePlayers(players.filter((x) => x.id !== p.id));
      },
      padd: async (form) => {
        const name = form.name.value.trim();
        if (!name || players.length >= MAX_PLAYERS) return;
        if (players.some((p) => p.name === name)) { toast('มีชื่อนี้ในก๊วนแล้ว'); return; }
        const f = friends().find((x) => x.name === name);
        await savePlayers([...players, { id: `p-${st.uid().slice(0, 8)}`, name, handicap: f?.handicap ?? null }]);
      },
      pfriend: async (el) => {
        if (players.length >= MAX_PLAYERS) return;
        const f = friends().find((x) => x.name === el.dataset.name);
        await savePlayers([...players, { id: `p-${st.uid().slice(0, 8)}`, name: f.name, handicap: f.handicap ?? null }]);
      },
      shotlog: async (el) => { await st.put('rounds', { ...round, shot_logging: el.checked, players }); ctx.rerender(); },
      gnew: () => { draftGame = { id: `g-${st.uid().slice(0, 8)}`, type: 'skin', players: players.map((p) => p.id), use_handicap: true, carry: true, point: 1, teams: [[], []] }; ctx.rerender(); },
      gcancel: () => { draftGame = null; ctx.rerender(); },
      gtype: (el) => { draftGame.type = el.dataset.v; ctx.rerender(); },
      gplayer: (el) => {
        const id = el.dataset.pid;
        draftGame.players = draftGame.players.includes(id) ? draftGame.players.filter((x) => x !== id) : [...draftGame.players, id];
        draftGame.teams = draftGame.teams.map((t) => t.filter((x) => draftGame.players.includes(x)));
        ctx.rerender();
      },
      gteam: (el) => {
        const id = el.dataset.pid;
        const [a, b] = draftGame.teams;
        if (a.includes(id)) draftGame.teams = [a.filter((x) => x !== id), [...b, id]];
        else if (b.includes(id)) draftGame.teams = [a, b.filter((x) => x !== id)];
        else draftGame.teams = [[...a, id], b];
        ctx.rerender();
      },
      gopt: (el) => { draftGame[el.dataset.field] = el.checked; },
      gpoint: (el) => { draftGame.point = Math.max(1, Math.round(Number(el.value)) || 1); },
      gsave: async () => {
        const g = { ...draftGame };
        if (g.players.length < 2) { toast('เกมต้องมีผู้เล่นอย่างน้อย 2 คน'); return; }
        if (g.type === 'team' && (g.teams[0].length < 1 || g.teams[1].length < 1)) { toast('จัดผู้เล่นให้ครบทั้งทีม A และ B'); return; }
        if (g.type !== 'team') delete g.teams;
        if (g.players.length === players.length) delete g.players;   // ทุกคน (รวมคนที่เพิ่มทีหลัง)
        await st.put('rounds', { ...round, players, games: [...games, g] });
        draftGame = null;
        toast('เพิ่มเกมแล้ว');
        ctx.rerender();
      },
      gdel: async (el) => {
        if (!confirm('ลบเกมนี้?')) return;
        await st.put('rounds', { ...round, games: games.filter((g) => g.id !== el.dataset.id) });
        ctx.rerender();
      },
    },
  };
}

// ---------- พาร์และ HC รายหลุม ----------

export function parsView([roundId], ctx) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}` };
  const holes = st.holesOf(roundId);
  const parOpts = [3, 4, 5, 6].map((p) => ({ v: p, th: String(p) }));
  const hcList = holes.map((h) => h.hc_index).filter(Number.isInteger);
  const dupHc = hcList.filter((v, i) => hcList.indexOf(v) !== i);
  const save = async (list) => {
    await st.commit(list.map((h) => ({ store: 'holes', put: h })));
    await rememberCourseCard(round.course_id, st.holesOf(roundId));
    ctx.rerender();
  };
  return {
    html: `${header('พาร์และ HC รายหลุม', { back: `#/round/${roundId}/card`, sub: esc(round.course_name_snapshot) })}<div class="page">
      <p class="note">ค่าที่กรอกจะจำไว้เป็นของสนามนี้ รอบหน้าเลือกสนามเดิมจะเติมให้เอง · HC = ดัชนีความยากหลุม 1 (ยากสุด) ถึง ${holes.length > 9 ? 18 : 9} จากสกอร์การ์ดสนาม</p>
      <div class="row gap wrap"><span class="lbl inline">ตั้งทุกหลุม:</span>
        ${[3, 4, 5].map((p) => `<button type="button" class="mini" data-act="allpar" data-v="${p}">พาร์ ${p}</button>`).join('')}</div>
      ${dupHc.length ? `<p class="note warn">HC ซ้ำกัน: ${[...new Set(dupHc)].join(', ')}</p>` : ''}
      <div class="par-grid">${holes.map((h) => `<div class="par-cell"><span>หลุม ${h.number}</span>
        ${chips('par', String(h.number), parOpts, h.par, { cls: 'tight' })}
        <input class="input hc" type="number" inputmode="numeric" min="1" max="18" placeholder="HC" value="${h.hc_index ?? ''}" data-change="hc" data-n="${h.number}" aria-label="HC หลุม ${h.number}">
      </div>`).join('')}</div>
      <a class="btn block primary" href="#/round/${roundId}/card">เสร็จ</a>
    </div>`,
    actions: {
      par: async (el) => {
        const h = holes.find((x) => x.number === Number(el.dataset.field));
        const v = Number(el.dataset.v);
        await save([{ ...h, par: h.par === v ? null : v }]);
      },
      allpar: async (el) => {
        const v = Number(el.dataset.v);
        if (holes.some((h) => h.par != null && h.par !== v) && !confirm(`ตั้งพาร์ ${v} ทุกหลุม (ทับค่าเดิม)?`)) return;
        await save(holes.map((h) => ({ ...h, par: v })));
      },
      hc: async (el) => {
        const h = holes.find((x) => x.number === Number(el.dataset.n));
        const n = el.value === '' ? null : Math.round(Number(el.value));
        await save([{ ...h, hc_index: Number.isInteger(n) && n >= 1 && n <= 18 ? n : null }]);
      },
    },
  };
}

// ---------- ปุ่มแชร์ ----------

export async function shareRoundImage(round) {
  const grid = gridOf(round);
  const games = round.games || [];
  const gameLines = games.map((g) => {
    const r = computeGame(g, grid);
    const nm = (id) => grid.players.find((p) => p.id === id)?.name ?? '?';
    if (['skin', 'match', 'team'].includes(g.type)) return `${gameTitle(g)}: ${r.ids.map((id) => `${nm(id)} ${signed(r.points[id])}`).join('  ')}`;
    if (g.type === 'stableford') return `${gameTitle(g)}: ${r.ranking.map(({ id }) => `${nm(id)} ${r.totals[id]}`).join('  ')}`;
    return `${gameTitle(g)}: ${r.ranking.map(({ id }) => `${nm(id)} ${r.net[id]}`).join('  ')}`;
  });
  return shareScorecard({ round, grid, gameLines });
}
