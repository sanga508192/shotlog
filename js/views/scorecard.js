// สกอร์การ์ดของรอบ: ตารางก๊วน หลุมที่ยังไม่จบ จบรอบ ลบรอบ
import * as st from '../state.js';
import { esc, header, toast, fmtDate } from '../ui.js';
import { roundScore, fmtToPar, holeScore } from '../logic.js';
import { groupTableHtml, countsTableHtml, gridOf, shotLogging, myName, renameMe, NAME_MAX } from './group.js';
import { playersOf, openHoles, fmtRanges, ME } from '../group.js';
import { deleteRound } from './main.js';
import { liveCardHtml, liveActions } from './live.js';

export function scorecardView([roundId], ctx) {
  const round = st.S.rounds.get(roundId);
  if (!round) return { html: `${header('ไม่พบรอบ')}<div class="page"><p>ไม่พบรอบนี้</p></div>` };
  const holes = st.holesOf(roundId);
  const total = roundScore(holes, st.shotsOf, st.penaltiesOf);
  const incomplete = holes.filter((h) => h.status !== 'done').length;
  const logShots = shotLogging(round);
  const grid = gridOf(round);
  const games = Array.isArray(round.games) ? round.games : [];
  const myFlags = logShots ? holes.map((h) => {
    const shots = st.shotsOf(h.id);
    const f = [];
    if (h.status === 'incomplete') f.push('จดไม่ครบ');
    if (h.finish === 'picked_up') f.push('ยกลูก');
    const un = shots.filter((s) => s.assessment == null).length;
    if (un) f.push(`ไม่ประเมิน ${un}`);
    return f.length ? `หลุม ${h.number}: ${f.join(', ')}` : null;
  }).filter(Boolean) : [];
  const noPar = holes.filter((h) => h.par == null).length;
  // ระหว่างเล่น: บอกเฉพาะหลุมที่จดแล้วแต่ยังไม่จบ (ไม่นับหลุมที่กำลังเล่น) · จบรอบแล้ว: บอกหลุมที่ยังไม่มีสกอร์ด้วย
  const playing = round.status === 'playing';
  const open = grid.players.map((p) => {
    const o = openHoles(grid, p.id);
    return { p, pending: o.pending.filter((h) => !playing || h.n !== round.current_hole), missing: playing ? [] : o.missing };
  }).filter((x) => x.pending.length || x.missing.length);
  const myPending = open.find((x) => x.p.id === ME)?.pending ?? [];
  const openHtml = open.length ? `<div class="card warn open-holes">
      <b>⚠️ สกอร์รวมยังไม่ครบทุกหลุม</b>
      <p class="small">ตัวเลขจางในตาราง = หลุมที่จดแล้วแต่ยังไม่กดจบหลุม จึงยังไม่นับในรวม · สกอร์รวมที่ยังไม่ครบมีเครื่องหมาย *</p>
      ${open.map((x) => `<div class="open-row"><b>${esc(x.p.name)}</b>
        ${x.pending.length ? `<span class="small">ยังไม่จบ</span>${x.pending.map((h) => `<a class="mini" href="#/round/${roundId}/hole/${h.n}">หลุม ${h.n} · จดไว้ ${h.strokes} ›</a>`).join('')}` : ''}
        ${x.missing.length ? `<span class="small">ยังไม่มีสกอร์ หลุม ${fmtRanges(x.missing)}</span><a class="mini" href="#/round/${roundId}/hole/${x.missing[0]}">ไปกรอก ›</a>` : ''}
      </div>`).join('')}
      ${myPending.length ? `<button type="button" class="btn primary block" data-act="confirmPending">✓ ใช้สกอร์ที่จดไว้ จบหลุม ${fmtRanges(myPending.map((h) => h.n))}</button>` : ''}
    </div>` : '';
  return {
    html: `${header('สกอร์การ์ด', { back: '#/', sub: `${esc(round.course_name_snapshot)} · ${esc(fmtDate(round.played_at))}${round.tee_name ? ` · แท่น ${esc(round.tee_name)}` : ''}` })}
    <div class="page">
      ${logShots && playersOf(round).length === 1 ? `<div class="card totals">
        <div>ตี <b>${total.strokes}</b> + ปรับ <b>${total.penalties}</b> = <b class="big-num">${total.total}</b></div>
        <div class="small muted">เทียบพาร์ ${fmtToPar(total.toPar)} (นับเฉพาะ ${total.holesForPar} หลุมที่จบและมีพาร์)</div>
      </div>` : ''}
      ${round.status !== 'playing' ? `<div><span class="badge ${round.status === 'complete' ? 'good' : 'bad'}">${round.status === 'complete' ? 'จบรอบ' : 'จบรอบ (จดไม่ครบ)'}</span></div>` : ''}
      ${openHtml}
      ${grid.players.some((p) => p.id === ME && p.name === 'ฉัน') ? `<form class="card name-card" data-submit="setName">
        <b>ชื่อของคุณในสกอร์การ์ดยังเป็น “ฉัน”</b>
        <div class="row gap"><input class="input" name="myname" maxlength="${NAME_MAX}" required placeholder="ชื่อหรือชื่อเล่น" value="${myName() === 'ฉัน' ? '' : esc(myName())}"><button class="btn primary">บันทึก</button></div>
        <p class="note">ใช้ในรูปที่แชร์และรอบต่อ ๆ ไป รอบเก่าที่ใช้ “ฉัน” เปลี่ยนตามด้วย · แก้ภายหลังได้ที่ ตั้งค่า</p>
      </form>` : ''}
      ${groupTableHtml(round, grid)}
      <p class="note">แตะแถวเพื่อไปหลุมนั้น${noPar ? ` · ยังไม่มีพาร์ ${noPar} หลุม (<a href="#/round/${roundId}/pars">กรอกพาร์/HC</a>)` : ''}</p>
      ${countsTableHtml(grid)}
      <div class="action-grid">
        <a class="btn primary" href="#/round/${roundId}/share">📤 แชร์รูปสกอร์การ์ด</a>
        ${games.length ? `<a class="btn" href="#/round/${roundId}/games">🎲 ผลเกม (${games.length})</a>` : ''}
        ${logShots && round.status !== 'playing' ? `<a class="btn" href="#/round/${roundId}/recap">📋 สรุปหลังรอบ</a>` : ''}
        ${logShots ? `<a class="btn" href="#/round/${roundId}/plan">🧭 แผนเกม</a>` : ''}
        <a class="btn" href="#/round/${roundId}/setup">👥 ผู้เล่น / เกม</a>
        <a class="btn" href="#/round/${roundId}/pars">⛳ พาร์ / HC</a>
        ${logShots ? `<a class="btn" href="#/round/${roundId}/summary">📊 สรุปการเล่นของฉัน</a>` : ''}
      </div>
      ${round.status === 'playing' || round.live_token ? liveCardHtml(round) : ''}
      ${myFlags.length ? `<details class="card small"><summary>ข้อมูลรายช็อตของฉันที่ยังไม่ครบ (${myFlags.length})</summary><ul>${myFlags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}
      ${round.status === 'playing' ? `
        <button type="button" class="btn primary block" data-act="finishRound">จบรอบ${incomplete ? ` (${incomplete} หลุมยังไม่จบ)` : ''}</button>`
    : '<button type="button" class="btn block" data-act="reopenRound">กลับไปจดต่อ</button>'}
      <button type="button" class="btn danger block" data-act="deleteRound">ลบรอบนี้</button>
    </div>`,
    actions: {
      ...liveActions(ctx, roundId),
      goHole: (el) => ctx.go(`#/round/${roundId}/hole/${el.dataset.n}`),
      setName: async (form) => {
        if (await renameMe(form.myname.value, roundId)) toast('เปลี่ยนชื่อแล้ว');
        ctx.rerender();
      },
      confirmPending: async () => {
        const ids = new Set(myPending.map((h) => h.n));
        const ops = st.holesOf(roundId).filter((h) => ids.has(h.number) && h.status === 'playing')
          .map((h) => st.patchOp('holes', h.id, { status: 'done', finish: 'holed' }));
        if (ops.length) await st.commit(ops);
        toast(`จบหลุม ${fmtRanges([...ids])} ด้วยสกอร์ที่จดไว้แล้ว`);
        ctx.rerender();
      },
      finishRound: async () => {
        // หลุมที่จดแล้วแต่ลืมกดจบ: ถามครั้งเดียวว่าใช้สกอร์ที่จดไว้เลยไหม
        const pend = logShots ? st.holesOf(roundId).filter((h) => h.status === 'playing' && st.shotsOf(h.id).length) : [];
        if (pend.length) {
          const list = pend.map((h) => `หลุม ${h.number} (${holeScore(h, st.shotsOf(h.id), st.penaltiesOf(h.id)).total})`).join(', ');
          if (!confirm(`${list} ยังไม่ได้กดจบหลุม\nใช้สกอร์ที่จดไว้เป็นสกอร์สุดท้ายเลยไหม?\n(ยกเลิก = กลับไปแก้ก่อน)`)) return;
          await st.commit(pend.map((h) => st.patchOp('holes', h.id, { status: 'done', finish: 'holed' })));
        }
        const left = st.holesOf(roundId).filter((h) => h.status !== 'done').length;
        let status = 'complete';
        if (left) {
          if (!confirm(`ยังมี ${left} หลุมที่ไม่ได้จบ จะบันทึกรอบนี้เป็น “จบรอบ (จดไม่ครบ)” ต่อหรือไม่?`)) return;
          status = 'incomplete';
        }
        await st.patch('rounds', roundId, { status, finished_at: st.nowIso() });
        toast('บันทึกการจบรอบแล้ว');
        // จดรายช็อต: ไปหน้าสรุปหลังรอบเลย
        if (logShots) ctx.go(`#/round/${roundId}/recap`);
        else ctx.rerender();
      },
      reopenRound: async () => {
        await st.patch('rounds', roundId, { status: 'playing' });
        ctx.go(`#/round/${roundId}/hole/${round.current_hole || 1}`);
      },
      deleteRound: async () => {
        await deleteRound(roundId, { after: () => { if (location.hash.includes(roundId)) ctx.go('#/'); else ctx.rerender(); } });
      },
    },
  };
}
