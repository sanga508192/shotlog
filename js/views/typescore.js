// พิมพ์สกอร์ทั้งรอบ: พิมพ์ตัวเลขเรียงกัน (เช่น 5 4 5 6 3 …) แอปเติมทีละหลุม ดูตัวอย่างก่อนบันทึก
// ใช้ได้ทั้งของฉันและเพื่อนในก๊วน · หลุมที่ฉันจดรายช็อตไว้ไม่ถูกทับ
import * as st from '../state.js';
import { esc, header, toast } from '../ui.js';
import { ME, playersOf, parseScoreString, planTypedScores, classify, fmtOver } from '../group.js';
import { myName, shotLogging } from './group.js';

const KIND_CLASS = { hio: 'k-hio', albatross: 'k-eagle', eagle: 'k-eagle', birdie: 'k-birdie', par: 'k-par', bogey: '', double: 'k-double', mess: 'k-mess' };
const T = { roundId: null, pid: ME, text: '', start: null };

function firstEmpty(holes, pid) {
  const h = [...holes].sort((a, b) => a.number - b.number)
    .find((x) => !(pid === ME && st.shotsOf(x.id).length) && !Number.isInteger(x.group_scores?.[pid]));
  return h?.number ?? 1;
}

function previewHtml(plan, parsed) {
  if (parsed.error) return `<p class="card warn small">${esc(parsed.error)}</p>`;
  if (plan.error) return `<p class="card warn small">${esc(plan.error)}</p>`;
  if (!plan.rows.length) return '<p class="note">พิมพ์ตัวเลขด้านบน ตัวอย่างจะขึ้นตรงนี้</p>';
  const use = plan.rows.filter((r) => !r.skip);
  const strokes = use.reduce((a, r) => a + r.value, 0);
  const withPar = use.filter((r) => Number.isInteger(r.hole.par));
  const over = withPar.reduce((a, r) => a + r.value - r.hole.par, 0);
  const replaced = use.filter((r) => r.old != null && r.old !== r.value).length;
  const shots = plan.rows.filter((r) => r.skip === 'shots').length;
  const first = plan.rows[0].hole.number, last = plan.rows.at(-1).hole.number;
  const cell = (r) => {
    const kind = r.skip ? null : classify(r.value, r.hole.par);
    const v = r.skip === 'shots' ? `<span class="muted">${r.old ?? '·'}</span>` : r.skip ? `<span class="muted">${r.old ?? '–'}</span>`
      : `<span class="sc">${r.value}</span>`;
    return `<div class="ts-cell${r.skip ? ' skip' : ''}"><small>${r.hole.number}</small><span class="ts-v ${kind ? KIND_CLASS[kind] || '' : ''}">${v}</span>
      ${r.old != null && !r.skip && r.old !== r.value ? `<s class="ts-old">${r.old}</s>` : `<span class="ts-par">${r.hole.par ? `พ${r.hole.par}` : ''}</span>`}</div>`;
  };
  return `<div class="ts-grid">${plan.rows.map(cell).join('')}</div>
    <p class="ts-sum">หลุม ${first}–${last} · ใส่ <b>${use.length}</b> หลุม · รวม <b>${strokes}</b>${withPar.length ? ` (${fmtOver(over)})` : ''}
      ${replaced ? ` · <span class="bad-txt">ทับของเดิม ${replaced} หลุม</span>` : ''}${shots ? ` · ข้าม ${shots} หลุมที่จดรายช็อตไว้` : ''}</p>`;
}

export function typeScoreView([roundId], ctx) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}<div class="page"><p>ไม่พบรอบนี้</p></div>` };
  const holes = st.holesOf(roundId);
  const players = playersOf(round, myName());
  if (T.roundId !== roundId) Object.assign(T, { roundId, pid: ME, text: '', start: null });
  if (!players.some((p) => p.id === T.pid)) T.pid = players[0].id;
  if (T.start == null || !holes.some((h) => h.number === T.start)) T.start = firstEmpty(holes, T.pid);
  const name = players.find((p) => p.id === T.pid)?.name ?? '';
  const compute = () => {
    const parsed = parseScoreString(T.text);
    const plan = parsed.error ? { rows: [], error: null } : planTypedScores({ holes, start: T.start, values: parsed.values, pid: T.pid, shotsOf: st.shotsOf, penaltiesOf: st.penaltiesOf });
    return { parsed, plan };
  };
  const { parsed, plan } = compute();
  const canSave = (p, pl) => !p.error && !pl.error && pl.rows.some((r) => !r.skip);

  return {
    html: `${header('พิมพ์สกอร์ทั้งรอบ', { back: `#/round/${roundId}/card`, sub: esc(round.course_name_snapshot) })}
    <div class="page type-score">
      ${players.length > 1 ? `<div class="chips">${players.map((p) => `<button type="button" class="chip${p.id === T.pid ? ' on' : ''}" data-act="pick" data-pid="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>` : ''}
      <label class="lbl">สกอร์ของ ${esc(name)} เรียงตามหลุม
        <textarea class="input ts-input" rows="2" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="เช่น 5 4 5 6 3 4 6 5 4" data-input="text">${esc(T.text)}</textarea></label>
      <div class="row gap ts-start"><span class="small muted">เริ่มที่หลุม</span>
        <select class="input" data-change="start" aria-label="เริ่มที่หลุม">${[...holes].sort((a, b) => a.number - b.number).map((h) => `<option value="${h.number}"${h.number === T.start ? ' selected' : ''}>${h.number}</option>`).join('')}</select></div>
      <div id="ts-preview">${previewHtml(plan, parsed)}</div>
      <button type="button" class="btn primary big block" data-act="save" id="ts-save" ${canSave(parsed, plan) ? '' : 'disabled'}>บันทึกสกอร์</button>
      <details class="card small"><summary>วิธีพิมพ์</summary>
        <ul class="find">
          <li>เว้นวรรคระหว่างหลุม: <b>5 4 5 6 3</b> หรือใช้จุลภาค</li>
          <li>ทุกหลุมต่ำกว่า 10 พิมพ์ติดกันได้: <b>54563</b> หรือเป็นชุด <b>545 634 654</b></li>
          <li>สกอร์ 10 ขึ้นไปเว้นวรรคแยก: <b>5 10 4</b> · พิมพ์ <b>-</b> เพื่อข้ามหลุมนั้น (คงค่าเดิม)</li>
          <li>เลขไทยก็ได้ · หลุมที่${shotLogging(round) ? 'คุณจดรายช็อตไว้แล้วจะไม่ถูกทับ' : 'มีสกอร์อยู่แล้วจะถูกทับ (ดูตัวขีดฆ่าในตัวอย่าง)'}</li>
        </ul>
      </details>
    </div>`,
    actions: {
      pick: (el) => { T.pid = el.dataset.pid; T.start = null; ctx.rerender(); },
      start: (el) => { T.start = Number(el.value); ctx.rerender(); },
      // พิมพ์: อัปเดตตัวอย่างโดยไม่วาดหน้าใหม่ (คีย์บอร์ดไม่หุบ)
      text: (el) => {
        T.text = el.value;
        const c = compute();
        document.getElementById('ts-preview').innerHTML = previewHtml(c.plan, c.parsed);
        document.getElementById('ts-save').disabled = !canSave(c.parsed, c.plan);
      },
      save: async (el) => {
        if (el.disabled) return;
        const c = compute();
        if (!canSave(c.parsed, c.plan)) return;
        el.disabled = true;
        const rows = c.plan.rows.filter((r) => !r.skip);
        const before = rows.map((r) => ({ ...st.S.holes.get(r.hole.id) }));
        const quick = !shotLogging(round);
        const ops = rows.map((r) => {
          const h = st.S.holes.get(r.hole.id);
          const scores = { ...(h.group_scores || {}), [T.pid]: r.value };
          const changes = { group_scores: scores };
          // จดเร็ว: หลุมจบเมื่อทุกคนมีสกอร์ · รายช็อต: สกอร์ของฉันที่พิมพ์ = จบหลุมนั้น
          if (quick) changes.status = players.every((p) => Number.isInteger(scores[p.id])) ? 'done' : 'playing';
          else if (T.pid === ME) Object.assign(changes, { status: 'done', finish: 'holed' });
          return st.patchOp('holes', h.id, changes);
        });
        await st.commit(ops);
        const who = players.find((p) => p.id === T.pid)?.name ?? '';
        T.text = '';
        T.start = null;
        toast(`ใส่สกอร์ ${who} ${rows.length} หลุมแล้ว`, { label: 'เลิกทำ', run: async () => { await st.commit(before.map((h) => ({ store: 'holes', put: h }))); ctx.go(`#/round/${roundId}/card`); } });
        ctx.go(`#/round/${roundId}/card`);
      },
    },
  };
}
