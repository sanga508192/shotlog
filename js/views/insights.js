import * as st from '../state.js';
import { esc, header, fmtDate, toast } from '../ui.js';
import { DIMENSIONS } from '../constants.js';
import { summarize, pct, practiceSuggestion } from '../logic.js';

const open = new Set();   // หัวข้อที่เปิดดูช็อตต้นทาง

function dimLabel(dim) {
  if (dim === 'unspecified') return 'ประเมินแล้ว';
  return `ระบุ${DIMENSIONS.find((d) => d.key === dim).th}`;
}

function shotLink(id) {
  const s = st.S.shots.get(id);
  const h = s && st.S.holes.get(s.hole_id);
  const r = s && st.S.rounds.get(s.round_id);
  if (!s || !h || !r) return '';
  return `<li><a href="#/round/${r.id}/hole/${h.number}">${esc(fmtDate(r.played_at))} · ${esc(r.course_name_snapshot)} · หลุม ${h.number} ช็อต ${s.sequence}${s.note ? ` — “${esc(s.note)}”` : ''}</a></li>`;
}

export function topicCard(t, { withSources = true } = {}) {
  const isOpen = open.has(t.key);
  return `<div class="topic${t.priority ? ' pri' : ''}">
    <div class="row between"><div><span class="rank">${t.rank}</span> <strong>${esc(t.label)}</strong></div>
      <button type="button" class="star${t.priority ? ' on' : ''}" data-act="priority" data-key="${esc(t.key)}" title="ตั้งเป็นเรื่องสำคัญ" aria-pressed="${t.priority}">${t.priority ? '★' : '☆'}</button></div>
    <div class="small">พบ <b>${t.count}</b> ครั้ง จาก ${t.denom} ช็อตที่${dimLabel(t.dim)} (${pct(t.count, t.denom)})
      ${t.unknown ? `· <span class="muted">ยังไม่ระบุ ${t.unknown}</span>` : ''} · ${t.round_count} รอบ</div>
    <div class="row gap">
      ${withSources ? `<button type="button" class="mini" data-act="sources" data-key="${esc(t.key)}">${isOpen ? 'ซ่อน' : 'ดู'}ช็อตต้นทาง</button>` : ''}
      <a class="mini primary" href="#/practice/new?t=${encodeURIComponent(t.key)}">ฝึกเรื่องนี้</a>
    </div>
    ${isOpen ? `<ul class="sources">${t.shot_ids.map(shotLink).join('')}</ul>` : ''}
  </div>`;
}

function tallyTable(title, list) {
  return `<h2>${title}</h2><div class="table-wrap"><table class="card-table">
    <thead><tr><th></th><th>ช็อต</th><th>ต้องปรับ</th><th>ประเมินแล้ว</th><th>อัตรา</th><th>ยังไม่ประเมิน</th></tr></thead>
    <tbody>${list.map((g) => `<tr><td>${esc(g.label)}</td><td>${g.total}</td><td>${g.needs}</td><td>${g.assessed}</td><td>${pct(g.needs, g.assessed)}</td><td>${g.unassessed || ''}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

export function priorityAction(ctx) {
  return async (el) => {
    const key = el.dataset.key;
    const cur = new Set(st.setting('priority_topics', []));
    if (cur.has(key)) cur.delete(key); else cur.add(key);
    await st.setSetting('priority_topics', [...cur]);
    ctx.rerender();
  };
}

export function summaryView([roundId], ctx) {
  const round = roundId ? st.S.rounds.get(roundId) : null;
  const rows = st.shotRows(round ? [round.id] : null);
  const holes = round ? st.holesOf(round.id) : [...st.S.holes.values()];
  const sm = summarize(rows, holes, st.setting('priority_topics', []));
  const m = sm.missing;
  const back = round ? `#/round/${round.id}/card` : '#/';
  const title = round ? 'สรุปรอบนี้' : 'สรุปทุกรอบ';
  const sub = round ? `${esc(round.course_name_snapshot)} · ${esc(fmtDate(round.played_at))}` : '';
  if (!rows.length) {
    return { html: `${header(title, { back, sub })}<div class="page"><p class="muted">ยังไม่มีช็อตที่จดไว้</p></div>` };
  }
  const missingItems = [
    [m.unassessed.length, 'ช็อตที่ยังไม่ประเมิน'],
    [m.noClub.length, 'ช็อตที่ยังไม่ระบุไม้'],
    [m.noType.length, 'ช็อตที่ยังไม่ระบุประเภท'],
    [m.puttNoStart.length, 'พัตที่ยังไม่ระบุจุดเริ่มต้น'],
    [m.puttNoDistance.length, 'พัตที่ยังไม่มีระยะ'],
    [m.holesNoPar.length, 'หลุมที่ยังไม่มีพาร์'],
    [m.holesNotDone.length, 'หลุมที่ยังไม่จบ/จดไม่ครบ'],
  ].filter(([n]) => n);
  const p = sm.putting;
  return {
    html: `${header(title, { back, sub })}<div class="page">
      ${round ? '<a class="mini" href="#/summary">ดูสรุปทุกรอบ ›</a>' : ''}
      <div class="card stats-row">
        <div><b>${sm.shotCount}</b><span>ช็อต</span></div>
        <div><b>${sm.roundCount}</b><span>รอบ</span></div>
        <div><b>${pct(sm.overall.needs, sm.overall.assessed)}</b><span>ต้องปรับ (${sm.overall.needs}/${sm.overall.assessed})</span></div>
        <div><b>${sm.overall.unassessed}</b><span>ยังไม่ประเมิน</span></div>
      </div>

      <h2>หัวข้อที่พบบ่อย</h2>
      <p class="note">เรียงจากจำนวนครั้ง นับเท่ากันได้ลำดับเท่ากัน · ★ = เรื่องที่คุณตั้งว่าสำคัญ · ช็อตเดียวอาจมีหลายอาการ จึงไม่บวกรวมเป็นจำนวนช็อตเสีย · ไม่ประเมินจำนวนสโตรกที่เสีย</p>
      ${sm.topics.length ? sm.topics.map((t) => topicCard(t)).join('') : '<p class="muted">ยังไม่พบอาการที่ระบุไว้</p>'}
      ${sm.shotCount < 30 ? `<p class="note warn">ข้อมูล ${sm.shotCount} ช็อต ใช้ชี้เรื่องที่ควรทบทวนได้ แต่ยังไม่พอสรุปว่าเป็นจุดอ่อนประจำ</p>` : ''}

      ${tallyTable('แยกตามประเภทช็อต', sm.byType)}
      ${tallyTable('แยกตามไม้', sm.byClub)}

      <h2>พัต</h2>
      <div class="card small">
        จดเป็นพัต ${p.logged} ครั้ง · ยืนยันว่าเริ่มบนกรีน <b>${p.onGreen}</b> · นอกกรีน ${p.offGreen} · ยังไม่ระบุจุดเริ่ม ${p.unknownStart}<br>
        พัตลงจริง ${p.holed} ครั้ง (ไม่รวมยกลูก/กิมมี่)
      </div>

      ${missingItems.length ? `<h2>ข้อมูลที่ควรเติม</h2><ul class="card small">${missingItems.map(([n, t]) => `<li>${t}: <b>${n}</b></li>`).join('')}</ul>
        <p class="note">ข้อมูลที่ยังไม่กรอกแสดงแยกไว้ และไม่นับว่าไม่พลาด</p>` : ''}
    </div>`,
    actions: {
      sources: (el) => {
        const k = el.dataset.key;
        if (open.has(k)) open.delete(k); else open.add(k);
        ctx.rerender();
      },
      priority: priorityAction(ctx),
    },
  };
}

// ---------- ฝึกซ้อม ----------

export function practiceView(_p, ctx) {
  const sm = summarize(st.shotRows(null), [...st.S.holes.values()], st.setting('priority_topics', []));
  const sessions = [...st.S.practice.values()].sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || '').localeCompare(a.created_at || ''));
  const byTopic = new Map();
  for (const s of sessions) {
    if (!byTopic.has(s.topic)) byTopic.set(s.topic, []);
    byTopic.get(s.topic).push(s);
  }
  return {
    html: `${header('ฝึกซ้อม')}<div class="page">
      <h2>เรื่องที่เสนอจากการออกรอบ</h2>
      ${sm.topics.length ? `<p class="note">จาก ${sm.shotCount} ช็อต ${sm.roundCount} รอบ — คุณเลือกเองว่าจะฝึกเรื่องใด</p>${sm.topics.slice(0, 5).map((t) => topicCard(t, { withSources: false })).join('')}`
    : '<p class="muted">ยังไม่มีอาการที่จดไว้จากการออกรอบ</p>'}
      <a class="btn primary block" href="#/practice/new">＋ บันทึกการซ้อม</a>
      <h2>บันทึกการซ้อม</h2>
      <p class="note">ผลซ้อมเก็บแยกจากรอบเล่นจริง ไม่ปนกับสถิติออกรอบ</p>
      ${byTopic.size ? [...byTopic].map(([topic, list]) => `<div class="card">
        <h3>${esc(topic)}</h3>
        ${list.map((s) => `<div class="practice-row">
          <div><b>${s.successes ?? '–'}/${s.attempts ?? '–'}</b> ${s.attempts ? `(${pct(s.successes, s.attempts)})` : ''} <span class="muted small">${esc(fmtDate(s.date))}</span></div>
          <div class="small muted">${esc([st.club(s.club_id_optional)?.label, s.drill_context, s.target_definition].filter(Boolean).join(' · '))}</div>
          ${s.note ? `<div class="small quote">“${esc(s.note)}”</div>` : ''}
          <button type="button" class="mini danger" data-act="del" data-id="${s.id}">ลบ</button>
        </div>`).join('')}
      </div>`).join('') : '<p class="muted">ยังไม่มีบันทึกการซ้อม</p>'}
    </div>`,
    actions: {
      priority: priorityAction(ctx),
      del: async (el) => {
        const s = st.S.practice.get(el.dataset.id);
        await st.del('practice', el.dataset.id);
        ctx.rerender();
        toast('ลบบันทึกซ้อมแล้ว', { label: 'เลิกทำ', run: async () => { await st.put('practice', s); ctx.rerender(); } });
      },
    },
  };
}

export function practiceNewView([query], ctx) {
  const params = new URLSearchParams(query || '');
  const key = params.get('t');
  let topic = null;
  if (key) topic = summarize(st.shotRows(null), [], []).topics.find((t) => t.key === key) ?? null;
  const sug = topic ? practiceSuggestion(topic) : null;
  const bag = st.bagClubs();
  return {
    html: `${header('บันทึกการซ้อม', { back: '#/practice' })}<div class="page">
      ${topic ? `<div class="card small">มาจากหัวข้อ: <b>${esc(topic.label)}</b><br>พบ ${topic.count} ครั้ง จาก ${topic.denom} ช็อตที่ระบุ · ${topic.round_count} รอบ</div>` : ''}
      <form class="card" data-submit="save">
        <label>หัวข้อซ้อม<input class="input" name="topic" required value="${esc(sug?.topic ?? '')}" placeholder="เช่น ชิพ: ความสม่ำเสมอในการสัมผัสลูก"></label>
        <label>ไม้ (ไม่บังคับ)<select class="input" name="club"><option value="">ไม่ระบุ</option>
          ${bag.map((c) => `<option value="${c.id}"${c.id === topic?.club_id ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
        <label>สถานการณ์ที่ซ้อม<input class="input" name="context" placeholder="เช่น ชิพจากรัฟ ระยะ 15 ม."></label>
        <label>เกณฑ์สำเร็จ / เป้าหมาย<input class="input" name="target" value="${esc(sug?.metric ?? '')}" placeholder="กำหนดเอง เช่น หยุดในวงรัศมี 1 คันธง"></label>
        <div class="row gap">
          <label>จำนวนลูก<input class="input" type="number" inputmode="numeric" min="0" name="attempts" placeholder="เช่น 10"></label>
          <label>สำเร็จ<input class="input" type="number" inputmode="numeric" min="0" name="successes"></label>
        </div>
        <label>วันที่<input class="input" type="date" name="date" value="${st.todayLocal()}"></label>
        <label>หมายเหตุ<textarea class="input" name="note" rows="2"></textarea></label>
        <button class="btn primary big block">บันทึกผลซ้อม</button>
      </form>
    </div>`,
    actions: {
      save: async (form) => {
        const num = (v) => (v === '' ? null : Math.max(0, parseInt(v, 10)));
        const attempts = num(form.attempts.value);
        const successes = num(form.successes.value);
        if (attempts != null && successes != null && successes > attempts) {
          toast('จำนวนที่สำเร็จมากกว่าจำนวนลูก');
          return;
        }
        const btn = form.querySelector('button');
        if (btn.disabled) return;
        btn.disabled = true;
        await st.put('practice', {
          id: st.uid(), date: form.date.value || st.todayLocal(), topic: form.topic.value.trim(),
          source_topic_key: topic?.key ?? null, club_id_optional: form.club.value || null,
          drill_context: form.context.value.trim(), target_definition: form.target.value.trim(),
          attempts, successes, note: form.note.value.trim(), created_at: st.nowIso(),
        });
        toast('บันทึกผลซ้อมแล้ว');
        ctx.go('#/practice');
      },
    },
  };
}
