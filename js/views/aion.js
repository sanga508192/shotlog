// หน้า "รับช็อตจาก AION": ดึงช็อตที่ผู้ใช้พูดให้ AION จดระหว่างออกรอบ ให้ตรวจแล้วกดนำเข้ารอบที่เลือก
import * as st from '../state.js';
import { esc, header, toast, fmtDate } from '../ui.js';
import { planImport, groupByDay, entryText } from '../aion.js';

// การเชื่อมต่อเก็บใน meta = อยู่ในเครื่องนี้เท่านั้น ไม่ซิงก์ขึ้นคลาวด์ และไม่อยู่ในไฟล์สำรอง
const META_KEY = 'aion_golf';
export const aionConfig = () => {
  const c = st.meta(META_KEY, null);
  return c && typeof c.url === 'string' && typeof c.key === 'string' ? c : null;
};
const saveConfig = (cfg) => st.commit([{ store: 'meta', put: { key: META_KEY, value: cfg } }]);
const dropConfig = () => st.commit([{ store: 'meta', del: META_KEY }]);

async function call(cfg, method, body) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try {
    const url = method === 'GET' ? `${cfg.url}${cfg.url.includes('?') ? '&' : '?'}golf=pending` : cfg.url;
    const res = await fetch(url, {
      method, signal: ac.signal,
      headers: { 'x-golf-key': cfg.key, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `เซิร์ฟเวอร์ตอบ ${res.status}`);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('เชื่อมต่อนานเกินไป (เน็ตช้าหรือไม่มีสัญญาณ)');
    if (err instanceof TypeError) throw new Error('เชื่อมต่อไม่ได้ (ไม่มีเน็ต หรือที่อยู่ผิด)');
    throw err;
  } finally {
    clearTimeout(t);
  }
}
const ack = (cfg, ids, status) => (ids.length ? call(cfg, 'POST', { ids, status }) : Promise.resolve({ updated: 0 }));

// รายการที่นำเข้าไปแล้วแต่แจ้ง AION ไม่ทัน (เช่น เน็ตหลุด) = มีช็อตในเครื่องที่อ้าง id นี้อยู่แล้ว → ไม่โชว์ซ้ำ
const importedHere = () => new Set([...st.S.shots.values()].map((s) => s.from_aion).filter(Boolean));

// ---------- ข้อมูลที่ดึงมา (อยู่ข้ามการวาดหน้า) ----------
const v = { entries: null, loading: false, error: '', errAt: 0, at: 0, target: {}, setup: false };
// ดึงไม่สำเร็จ → ไม่ลองใหม่เองถี่ ๆ (ผู้ใช้กด "ดึงใหม่" เอง หรือรอ 1 นาที)
const coolingDown = () => !!v.error && Date.now() - v.errAt < 60000;

async function load(cfg, rerender) {
  if (v.loading) return;
  v.loading = true;
  v.error = '';
  rerender?.();
  try {
    const all = (await call(cfg, 'GET')).entries ?? [];
    const done = importedHere();
    // วันไหนช็อตทุกช็อตอยู่ในเครื่องแล้ว ถือว่าทั้งวันนำเข้าแล้ว (รวมรายการเริ่มรอบ/หลุมของวันนั้น)
    const doneDays = new Set(groupByDay(all)
      .filter((g) => g.entries.some((e) => e.kind === 'shot') && g.entries.every((e) => e.kind !== 'shot' || done.has(e.id)))
      .map((g) => g.day));
    const isDone = (e) => done.has(e.id) || doneDays.has(e.played_on);
    const dup = all.filter(isDone).map((e) => e.id);
    v.entries = all.filter((e) => !isDone(e));
    v.at = Date.now();
    if (dup.length) ack(cfg, dup, 'imported').catch(() => {});
  } catch (err) {
    v.error = err.message || String(err);
    v.errAt = Date.now();
  } finally {
    v.loading = false;
    rerender?.();
  }
}

// รอบที่น่าจะใช่: รอบที่กำลังเล่นของวันนั้น → รอบใด ๆ ของวันนั้น → รอบที่กำลังเล่น
function roundsFor(day) {
  const all = st.rounds();
  const sameDay = all.filter((r) => r.played_at === day);
  const playing = all.filter((r) => r.status === 'playing' && r.played_at !== day);
  return [...sameDay.sort((a, b) => Number(b.status === 'playing') - Number(a.status === 'playing')), ...playing];
}

// ---------- การ์ดบนหน้าแรก ----------
export const aionHomeSlot = () => (aionConfig() ? '<div data-aion-slot></div>' : '');
export function fillAionSlot(root) {
  const slot = root?.querySelector?.('[data-aion-slot]');
  const cfg = aionConfig();
  if (!slot || !cfg) return;
  const paint = () => {
    const n = (v.entries ?? []).filter((e) => e.kind === 'shot').length;
    slot.innerHTML = n ? `<a class="card aion-card" href="#/aion"><b>🎙 AION จดไว้ ${n} ช็อต</b><span>ตรวจแล้วกดนำเข้ารอบ ›</span></a>` : '';
  };
  if (v.entries && Date.now() - v.at < 60000) { paint(); return; }
  if (!navigator.onLine || coolingDown()) return;
  load(cfg).then(paint).catch(() => {});
}

// ---------- หน้า ----------
export function aionView(_p, ctx) {
  const cfg = aionConfig();
  const showSetup = !cfg || v.setup;
  const groups = groupByDay(v.entries ?? []);

  const setupHtml = `<section class="card">
    <b>เชื่อมกับ AION</b>
    <p class="small">AION คือผู้ช่วยเสียงบน iPhone ของคุณ ระหว่างออกรอบพูดสั่งได้ เช่น "ช็อต 1 ไดรเวอร์ เข้าป่าขวา 200 หลา" แล้วมานำเข้าช็อตที่นี่</p>
    <form data-submit="saveCfg" class="stack">
      <label class="lbl">ที่อยู่ของ AION<input class="input" name="url" inputmode="url" autocomplete="off" placeholder="https://….supabase.co/functions/v1/aion" value="${esc(cfg?.url ?? '')}"></label>
      <label class="lbl">รหัสกอล์ฟ (GOLF_KEY)<input class="input" name="key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="วางรหัสที่ได้จากผู้ตั้งค่า AION" value=""></label>
      <p class="note">รหัสเก็บในเครื่องนี้เท่านั้น ไม่ซิงก์ขึ้นคลาวด์และไม่อยู่ในไฟล์สำรอง · รหัสนี้ใช้ได้แค่ดึงช็อตกอล์ฟ คุยกับ AION ไม่ได้</p>
      <div class="row gap"><button class="btn primary">บันทึกและทดสอบ</button>
        ${cfg ? '<button type="button" class="btn" data-act="cancelSetup">ยกเลิก</button><button type="button" class="btn danger" data-act="unlink">เลิกเชื่อม</button>' : ''}</div>
    </form>
  </section>`;

  const dayHtml = (g) => {
    const opts = roundsFor(g.day);
    const pick = v.target[g.day] && st.S.rounds.has(v.target[g.day]) ? v.target[g.day] : opts[0]?.id ?? '';
    v.target[g.day] = pick;
    const unit = st.S.rounds.get(pick)?.distance_unit === 'm' ? 'm' : 'yd';
    const shots = g.entries.filter((e) => e.kind === 'shot').length;
    const lines = g.entries.map((e) => `<li class="${e.kind === 'shot' ? '' : 'muted'}">${e.kind === 'shot' ? `<b>หลุม ${esc(e.hole)}</b> ` : ''}${esc(entryText(e, unit))}</li>`).join('');
    return `<section class="card">
      <div class="row between"><b>${esc(fmtDate(g.day))}${g.course ? ` · ${esc(g.course)}` : ''}</b><span class="small muted">${shots} ช็อต</span></div>
      <ol class="aion-list small">${lines}</ol>
      ${opts.length ? `<label class="lbl">นำเข้ารอบ
        <select class="input" data-change="target" data-day="${esc(g.day)}">
          ${opts.map((r) => `<option value="${esc(r.id)}"${r.id === pick ? ' selected' : ''}>${esc(fmtDate(r.played_at))} · ${esc(r.course_name_snapshot || 'ไม่มีชื่อสนาม')}${r.status === 'playing' ? ' (กำลังเล่น)' : ''}</option>`).join('')}
        </select></label>
        <div class="row gap"><button type="button" class="btn primary" data-act="import" data-day="${esc(g.day)}">นำเข้า ${shots} ช็อต</button>
          <button type="button" class="btn danger" data-act="discard" data-day="${esc(g.day)}">ลบทิ้ง</button></div>
        <p class="note">ช็อตจะต่อท้ายช็อตที่จดไว้แล้วในแต่ละหลุม ตรวจแล้วแก้ในหน้าหลุมได้ตามปกติ</p>`
    : `<p class="note">ยังไม่มีรอบของวันนี้ในแอป เริ่มรอบที่สนามนั้นก่อน (เลือกสนามและแท่นที) แล้วกลับมานำเข้า</p>
        <div class="row gap"><a class="btn primary" href="#/courses">เริ่มรอบ</a>
          <button type="button" class="btn danger" data-act="discard" data-day="${esc(g.day)}">ลบทิ้ง</button></div>`}
    </section>`;
  };

  const listHtml = v.loading && !v.entries ? '<div class="empty">กำลังดึงช็อตจาก AION…</div>'
    : v.error ? `<div class="card warn small">${esc(v.error)}</div>`
      : !groups.length ? '<div class="empty"><span class="em">🎙</span>ยังไม่มีช็อตใหม่จาก AION<br><span class="small">ระหว่างออกรอบ เรียก "ไอออนกอล์ฟ" แล้วพูดทีละช็อต</span></div>'
        : groups.map(dayHtml).join('');

  return {
    html: `${header('รับช็อตจาก AION')}<div class="page">
      ${showSetup ? setupHtml : `<div class="row between"><span class="small muted">${v.at ? `ดึงล่าสุด ${new Date(v.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        <span class="row gap"><button type="button" class="mini" data-act="refresh"${v.loading ? ' disabled' : ''}>${v.loading ? 'กำลังดึง…' : 'ดึงใหม่'}</button>
        <button type="button" class="mini" data-act="editSetup">ตั้งค่า</button></span></div>${listHtml}`}
    </div>`,
    // วาดหน้าใหม่ก็เรียก mount อีก → ดึงอัตโนมัติเฉพาะครั้งแรก ถ้าพลาดให้ผู้ใช้กด "ดึงใหม่" เอง (กันวนดึงไม่หยุด)
    mount: () => { if (cfg && !v.setup && v.entries === null && !v.loading && !v.error) load(cfg, ctx.rerender); },
    actions: {
      saveCfg: async (form) => {
        const url = String(form.elements.namedItem('url')?.value || '').trim();
        const key = String(form.elements.namedItem('key')?.value || '').trim() || cfg?.key || '';
        if (!/^https:\/\/[^/]+\/functions\/v1\/[\w-]+$/.test(url)) { toast('ที่อยู่ต้องเป็นแบบ https://….supabase.co/functions/v1/ชื่อ'); return; }
        if (key.length < 16) { toast('รหัสสั้นเกินไป ตรวจว่าวางครบไหม'); return; }
        try {
          await call({ url, key }, 'GET');
        } catch (err) {
          toast(`ทดสอบไม่ผ่าน: ${err.message}`);
          return;
        }
        await saveConfig({ url, key });
        v.setup = false;
        toast('เชื่อมกับ AION แล้ว');
        await load({ url, key }, ctx.rerender);
      },
      editSetup: () => { v.setup = true; ctx.rerender(); },
      cancelSetup: () => { v.setup = false; ctx.rerender(); },
      unlink: async () => {
        if (!confirm('เลิกเชื่อมกับ AION? (ช็อตที่นำเข้าแล้วยังอยู่ในแอป)')) return;
        await dropConfig();
        Object.assign(v, { entries: null, error: '', setup: false });
        ctx.rerender();
      },
      refresh: () => load(cfg, ctx.rerender),
      target: (el) => { v.target[el.dataset.day] = el.value; ctx.rerender(); },
      discard: async (el) => {
        const g = groups.find((x) => x.day === el.dataset.day);
        if (!g || !confirm(`ลบช็อตจาก AION ของวันที่ ${fmtDate(g.day)} ทิ้ง ${g.entries.length} รายการ? (ไม่กระทบรอบในแอป)`)) return;
        await ack(cfg, g.entries.map((e) => e.id), 'deleted');
        toast('ลบทิ้งแล้ว');
        await load(cfg, ctx.rerender);
      },
      import: async (el) => {
        const g = groups.find((x) => x.day === el.dataset.day);
        const round = st.S.rounds.get(v.target[el.dataset.day]);
        if (!g || !round) { toast('เลือกรอบก่อน'); return; }
        el.disabled = true;
        const plan = planImport({
          round, holes: st.holesOf(round.id), shotsOf: st.shotsOf, clubs: st.clubs(), entries: g.entries, uid: st.uid, now: st.nowIso(),
        });
        if (!plan.created.shots.length && !plan.importedIds.length) { toast(plan.skipped[0]?.why ?? 'ไม่มีอะไรให้นำเข้า'); el.disabled = false; return; }
        await st.commit(plan.ops);
        let acked = true;
        try { await ack(cfg, plan.importedIds, 'imported'); } catch { acked = false; }
        const undo = async () => {
          await st.commit([
            ...plan.created.shots.map((id) => ({ store: 'shots', del: id })),
            ...plan.created.penalties.map((id) => ({ store: 'penalties', del: id })),
            ...plan.holesBefore.map((h) => ({ store: 'holes', put: h })),
            { store: 'rounds', put: plan.roundBefore },
          ]);
          await ack(cfg, plan.importedIds, 'new').catch(() => {});
          await load(cfg, ctx.rerender);
          toast('เลิกนำเข้าแล้ว');
        };
        toast(`นำเข้า ${plan.summary}${acked ? '' : ' · แจ้ง AION ไม่สำเร็จ (ไม่เป็นไร แอปกันนำเข้าซ้ำให้)'}`, { label: 'เลิกทำ', run: undo });
        if (plan.skipped.length) setTimeout(() => toast(`ข้าม ${plan.skipped.length} รายการ: ${plan.skipped[0].why}`), 4500);
        v.entries = (v.entries ?? []).filter((e) => !plan.importedIds.includes(e.id));
        ctx.rerender();
      },
    },
  };
}
