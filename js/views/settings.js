import * as st from '../state.js';
import { esc, header, chips, toast, download, fmtDate } from '../ui.js';
import { CLUB_CATEGORIES, UNITS, APP_VERSION } from '../constants.js';
import { buildExport, parseImport, toCSV } from '../logic.js';
import * as cloud from '../cloud.js';
import { linkedOwner, restoreBackup } from '../sync.js';
import { friends } from './group.js';
import { recentErrors, clearErrors } from '../errors.js';
import * as sync from '../sync.js';
import { stopSharing } from '../community.js';

const stamp = () => st.todayLocal();

function shotsCsv() {
  const header = ['round_id', 'played_at', 'course_id', 'course_name', 'province', 'tee_name', 'round_status',
    'hole_number', 'par', 'hole_status', 'hole_finish', 'shot_sequence', 'club', 'shot_type', 'assessment',
    'contact', 'direction', 'distance_result', 'target_result', 'start_lie', 'end_lie',
    'distance_before', 'distance_after', 'distance_unit', 'measurement_method', 'raw_distance_text',
    'target', 'target_text', 'note', 'holed', 'counted', 'not_counted_reason', 'shot_id'];
  const rows = st.shotRows(null).map(({ shot: s, hole: h, round: r, club: c }) => [
    r.id, r.played_at, r.course_id, r.course_name_snapshot, r.province_snapshot, r.tee_name, r.status,
    h.number, h.par, h.status, h.finish, s.sequence, c?.label, s.shot_type, s.assessment,
    s.contact, s.direction, s.distance_result, s.target_result, s.start_lie, s.end_lie,
    s.distance_before, s.distance_after, s.distance_unit, s.measurement_method, s.raw_distance_text,
    s.target, s.target_text, s.note, s.holed, s.counted !== false, s.not_counted_reason, s.id]);
  return toCSV(header, rows);
}

function penaltiesCsv() {
  const header = ['round_id', 'played_at', 'course_name', 'hole_number', 'strokes', 'reason', 'related_shot_sequence', 'note'];
  const rows = [...st.S.penalties.values()].map((p) => {
    const h = st.S.holes.get(p.hole_id);
    const r = st.S.rounds.get(p.round_id);
    return [r?.id, r?.played_at, r?.course_name_snapshot, h?.number, p.strokes, p.reason,
      st.S.shots.get(p.related_shot_id_optional)?.sequence, p.note];
  });
  return toCSV(header, rows);
}

function practiceCsv() {
  const header = ['date', 'topic', 'club', 'drill_context', 'target_definition', 'attempts', 'successes', 'note'];
  const rows = [...st.S.practice.values()].map((p) => [p.date, p.topic, st.club(p.club_id_optional)?.label,
    p.drill_context, p.target_definition, p.attempts, p.successes, p.note]);
  return toCSV(header, rows);
}

// สรุปสภาพแอปสำหรับแจ้งปัญหา (ไม่มีอีเมลหรือเนื้อหาข้อมูลการเล่น)
async function diagnostics() {
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => null);
  const mb = (n) => (n == null ? '?' : `${(n / 1048576).toFixed(1)} MB`);
  const s = sync.status();
  const lines = [
    `ShotLog ${APP_VERSION} · ${new Date().toISOString()}`,
    `เครื่อง: ${navigator.userAgent}`,
    `หน้าจอ: ${screen.width}x${screen.height} @${devicePixelRatio} · ${matchMedia('(display-mode: standalone)').matches ? 'ติดตั้งเป็นแอป' : 'เปิดในเบราว์เซอร์'} · ${navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์'}`,
    `ไฟล์แอป: ${navigator.serviceWorker?.controller ? 'ใช้แคช' : 'ไม่มีแคช'} · พื้นที่ ${mb(est?.usage)} / ${mb(est?.quota)} · เก็บถาวร ${persisted ? 'ใช่' : 'ไม่'}`,
    `ข้อมูล: ${st.S.rounds.size} รอบ, ${st.S.holes.size} หลุม, ${st.S.shots.size} ช็อต, ${st.S.practice.size} ซ้อม`,
    `ซิงก์: ${cloud.session() ? 'เข้าสู่ระบบ' : 'ไม่ได้เข้าสู่ระบบ'} · ${s.phase} · ค้างส่ง ${s.pending} · ชนกัน ${s.conflicts} · ล่าสุด ${s.lastSync || '-'}${st.meta('link_pending') ? ' · ผูกไม่เสร็จ' : ''}`,
  ];
  const errs = recentErrors();
  lines.push(errs.length ? `ข้อผิดพลาดล่าสุด ${errs.length} รายการ:` : 'ไม่มีข้อผิดพลาดที่บันทึกไว้');
  for (const e of errs.slice(0, 8)) lines.push(`- ${e.t} [${e.where}] ${e.msg}${e.stack ? ` @ ${e.stack}` : ''}`);
  return lines.join('\n');
}

export function settingsView(_p, ctx) {
  const clubs = st.clubs();
  const used = new Set([...st.S.shots.values()].map((s) => s.club_id));
  const counts = `${st.S.rounds.size} รอบ · ${st.S.shots.size} ช็อต · ${st.S.practice.size} บันทึกซ้อม · ${st.S.userCourses.size} สนามที่เพิ่มเอง`;
  const lastExport = st.setting('last_export_at');
  const bom = '﻿';   // ให้ Excel อ่านภาษาไทยถูก

  const saveClub = async (id, patch) => { await st.put('clubs', { ...st.S.clubs.get(id), ...patch }); };

  return {
    html: `${header('ตั้งค่า')}<div class="page">
      <h2>ข้อมูลของฉัน</h2>
      <div class="player-row">
        <input class="input" value="${esc(st.setting('my_name', 'ฉัน'))}" data-change="myName" aria-label="ชื่อของฉัน" placeholder="ชื่อที่แสดงในสกอร์การ์ด">
        <input class="input hc" type="number" inputmode="numeric" min="0" max="54" placeholder="HC" value="${st.setting('my_handicap', '') ?? ''}" data-change="myHc" aria-label="แต้มต่อของฉัน">
      </div>
      <p class="note">ชื่อและแต้มต่อ (HC) ใช้ในสกอร์การ์ดก๊วนและเกม เริ่มใช้กับรอบใหม่</p>

      <h2>เพื่อนในก๊วน</h2>
      ${friends().length ? `<div class="players-edit">${friends().map((f, i) => `<div class="player-row">
          <input class="input" value="${esc(f.name)}" data-change="fName" data-i="${i}" aria-label="ชื่อเพื่อน">
          <input class="input hc" type="number" inputmode="numeric" min="0" max="54" placeholder="HC" value="${f.handicap ?? ''}" data-change="fHc" data-i="${i}" aria-label="แต้มต่อ">
          <button type="button" class="mini danger" data-act="fDel" data-i="${i}" aria-label="ลบ">✕</button></div>`).join('')}</div>`
    : '<p class="muted small">เพื่อนที่เพิ่มในรอบจะถูกจำไว้ที่นี่ เลือกได้เร็วในรอบถัดไป</p>'}

      <h2>กระเป๋าไม้</h2>
      <p class="note">ไม้ที่ติ๊ก “ในกระเป๋า” จะแสดงในแถวเลือกไม้ตอนจด เรียงตามลำดับนี้</p>
      <div class="clubs-edit">
        ${clubs.map((c, i) => `<div class="club-row${c.in_bag ? '' : ' off'}">
          <input type="checkbox" ${c.in_bag ? 'checked' : ''} data-change="inBag" data-id="${c.id}" aria-label="ในกระเป๋า">
          <input class="input lbl-in" value="${esc(c.label)}" data-change="clubLabel" data-id="${c.id}" aria-label="ชื่อย่อ">
          <select class="input" data-change="clubCat" data-id="${c.id}" aria-label="ประเภท">
            ${CLUB_CATEGORIES.map((o) => `<option value="${o.v}"${o.v === c.category ? ' selected' : ''}>${o.th}</option>`).join('')}</select>
          <input class="input loft" type="number" inputmode="decimal" placeholder="องศา" value="${c.loft_optional ?? ''}" data-change="clubLoft" data-id="${c.id}" aria-label="องศา">
          <button type="button" class="mini" data-act="move" data-id="${c.id}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="เลื่อนขึ้น">↑</button>
          <button type="button" class="mini danger" data-act="delClub" data-id="${c.id}" ${used.has(c.id) ? 'disabled title="มีช็อตที่ใช้ไม้นี้ ให้เอาออกจากกระเป๋าแทน"' : ''} aria-label="ลบ">✕</button>
        </div>`).join('')}
      </div>
      <button type="button" class="btn block" data-act="addClub">＋ เพิ่มไม้</button>

      <h2>หน่วยระยะเริ่มต้น</h2>
      ${chips('unit', 'unit', UNITS, st.setting('distance_unit', 'm'))}

      <h2>แผนที่หลุม</h2>
      <label class="card row gap toggle-row"><input type="checkbox" ${st.setting('map_auto_hole', true) === false ? '' : 'checked'} data-change="autoHole">
        <span>เปลี่ยนหลุมให้เองเมื่อเดินถึงแท่นทีหลุมถัดไป <small class="muted">(ใช้ GPS และหมุดแท่นที)</small></span></label>
      <label class="card row gap toggle-row"><input type="checkbox" ${st.setting('share_pins', false) === true ? 'checked' : ''} data-change="sharePins">
        <span>แชร์หมุดแท่นที/กรีนที่ฉันวางเองให้ผู้เล่นคนอื่น <small class="muted">(ไม่ระบุตัวตน · เฉพาะสนามในรายชื่อ · ต้องเข้าสู่ระบบ · ปิดแล้วลบหมุดที่เคยแชร์ทั้งหมด)</small></span></label>

      <h2>คำที่ใช้บ่อย (ปุ่มเติมหมายเหตุ)</h2>
      <textarea class="input" rows="5" data-change="phrases" placeholder="หนึ่งบรรทัดต่อหนึ่งคำ">${esc(st.setting('phrases', []).join('\n'))}</textarea>

      <h2>สำรองและกู้คืนข้อมูล</h2>
      ${cloud.enabled() ? `<a class="btn block" href="#/account">☁️ ${cloud.session() ? 'บัญชีและการซิงก์' : 'เข้าสู่ระบบเพื่อสำรองบนคลาวด์'}</a>` : ''}
      <div class="card small">${counts}<br>${lastExport ? `ส่งออกไฟล์สำรองล่าสุด ${esc(fmtDate(lastExport))}` : 'ยังไม่เคยส่งออกไฟล์สำรอง'}<br><span id="persist" class="muted"></span></div>
      <button type="button" class="btn primary block" data-act="exportJson">ส่งออกไฟล์สำรอง (JSON)</button>
      <div class="row gap">
        <button type="button" class="btn" data-act="csvShots">CSV ช็อต</button>
        <button type="button" class="btn" data-act="csvPen">CSV สโตรกปรับ</button>
        <button type="button" class="btn" data-act="csvPractice">CSV ซ้อม</button>
      </div>
      <label class="btn block file-btn">กู้คืนจากไฟล์ JSON…<input type="file" accept="application/json,.json" data-change="importJson" hidden></label>
      <p class="note">การกู้คืนจะแทนที่ข้อมูลทั้งหมดในเครื่องนี้ด้วยข้อมูลในไฟล์</p>

      <h2>แก้ปัญหาแอป</h2>
      <button type="button" class="btn block" data-act="hardRefresh">🔄 โหลดแอปรุ่นล่าสุดใหม่ (ข้อมูลไม่หาย)</button>
      <p class="note">ใช้เมื่อแอปค้างอยู่รุ่นเก่าหรือแสดงผลแปลก ๆ จะล้างเฉพาะไฟล์ของแอปที่เก็บไว้ ไม่ลบรอบหรือช็อตที่จด</p>
      <details class="card small diag"><summary>ข้อมูลสำหรับแจ้งปัญหา</summary>
        <pre id="diag-text">กำลังรวบรวม…</pre>
        <div class="row gap"><button type="button" class="mini" data-act="copyDiag">คัดลอก</button>
          <button type="button" class="mini" data-act="clearErr">ล้างรายการข้อผิดพลาด</button></div>
        <p class="note">ไม่มีอีเมลหรือข้อมูลการเล่นในนี้ คัดลอกส่งให้ผู้พัฒนาได้</p>
      </details>

      <p class="note center">ShotLog รุ่น ${APP_VERSION} · ข้อมูลเก็บในเครื่องนี้เท่านั้น</p>
    </div>`,
    mount: () => {
      diagnostics().then((text) => {
        const el = document.getElementById('diag-text');
        if (el) el.textContent = text;
      }).catch(() => {});
      navigator.storage?.persisted?.().then((p) => {
        const el = document.getElementById('persist');
        if (el) el.textContent = p ? 'เบราว์เซอร์ตั้งให้เก็บข้อมูลถาวรแล้ว' : 'เบราว์เซอร์อาจล้างข้อมูลเมื่อพื้นที่เต็ม — ควรส่งออกไฟล์สำรองเป็นระยะ';
      }).catch(() => {});
    },
    actions: {
      hardRefresh: async () => {
        if (!confirm('โหลดไฟล์แอปรุ่นล่าสุดจากอินเทอร์เน็ตใหม่ทั้งหมด?\nรอบ ช็อต และการตั้งค่าที่จดไว้ยังอยู่ครบ (ต้องมีสัญญาณ)')) return;
        if (!navigator.onLine) { toast('ต้องต่ออินเทอร์เน็ตก่อน'); return; }
        const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
        await Promise.all(regs.map((r) => r.unregister()));
        if (globalThis.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
        location.reload();
      },
      copyDiag: async () => {
        const text = document.getElementById('diag-text')?.textContent || '';
        try { await navigator.clipboard.writeText(text); toast('คัดลอกแล้ว'); } catch { toast('คัดลอกไม่ได้ กดค้างที่ข้อความเพื่อเลือกแทน'); }
      },
      clearErr: () => { clearErrors(); ctx.rerender(); toast('ล้างรายการแล้ว'); },
      inBag: async (el) => { await saveClub(el.dataset.id, { in_bag: el.checked }); ctx.rerender(); },
      clubLabel: async (el) => {
        const v = el.value.trim();
        if (!v) { el.value = st.S.clubs.get(el.dataset.id).label; return; }
        await saveClub(el.dataset.id, { label: v });
      },
      clubCat: async (el) => { await saveClub(el.dataset.id, { category: el.value }); },
      clubLoft: async (el) => {
        const n = el.value === '' ? null : Number(el.value);
        await saveClub(el.dataset.id, { loft_optional: Number.isFinite(n) ? n : null });
      },
      move: async (el) => {
        const list = st.clubs();
        const i = list.findIndex((c) => c.id === el.dataset.id);
        const j = i + Number(el.dataset.dir);
        if (i < 0 || j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        await st.commit(list.map((c, k) => ({ store: 'clubs', put: { ...c, order: k } })));
        ctx.rerender();
      },
      delClub: async (el) => {
        if (el.disabled) return;
        await st.del('clubs', el.dataset.id);
        ctx.rerender();
      },
      addClub: async () => {
        const order = Math.max(-1, ...st.clubs().map((c) => c.order)) + 1;
        await st.put('clubs', { id: st.uid(), label: 'ใหม่', category: 'iron', loft_optional: null, in_bag: true, order });
        ctx.rerender();
      },
      unit: async (el) => { await st.setSetting('distance_unit', el.dataset.v); ctx.rerender(); },
      sharePins: async (el) => {
        if (el.checked && !cloud.session()) {
          el.checked = false;
          toast('เข้าสู่ระบบก่อน แล้วค่อยเปิดแชร์หมุด');
          return;
        }
        await st.setSetting('share_pins', el.checked);
        if (el.checked) {
          toast('เปิดแชร์หมุดแล้ว หมุดจะส่งตอนเปิดแผนที่หลุมของสนามนั้น');
        } else {
          try {
            await stopSharing();
            toast('ปิดแชร์และลบหมุดที่เคยแชร์แล้ว');
          } catch (err) {
            await st.setSetting('share_pins', true);
            el.checked = true;
            toast(`ลบหมุดที่แชร์ไม่สำเร็จ (${err instanceof TypeError ? 'ไม่มีสัญญาณ' : err.message}) ลองปิดอีกครั้งเมื่อมีเน็ต`);
          }
        }
      },
      autoHole: async (el) => { await st.setSetting('map_auto_hole', el.checked); toast(el.checked ? 'เปิดการเปลี่ยนหลุมอัตโนมัติ' : 'ปิดการเปลี่ยนหลุมอัตโนมัติ'); },
      myName: async (el) => {
        const v = el.value.trim();
        if (v) await st.setSetting('my_name', v); else ctx.rerender();
      },
      myHc: async (el) => {
        const n = el.value === '' ? null : Math.max(0, Math.min(54, Math.round(Number(el.value))));
        await st.setSetting('my_handicap', Number.isFinite(n) ? n : null);
      },
      fName: async (el) => {
        const list = [...friends()];
        const v = el.value.trim();
        if (!v) { ctx.rerender(); return; }
        list[Number(el.dataset.i)] = { ...list[Number(el.dataset.i)], name: v };
        await st.setSetting('friends', list);
      },
      fHc: async (el) => {
        const list = [...friends()];
        const n = el.value === '' ? null : Math.max(0, Math.min(54, Math.round(Number(el.value))));
        list[Number(el.dataset.i)] = { ...list[Number(el.dataset.i)], handicap: Number.isFinite(n) ? n : null };
        await st.setSetting('friends', list);
      },
      fDel: async (el) => {
        const list = [...friends()];
        list.splice(Number(el.dataset.i), 1);
        await st.setSetting('friends', list);
        ctx.rerender();
      },
      phrases: async (el) => {
        await st.setSetting('phrases', el.value.split('\n').map((s) => s.trim()).filter(Boolean));
        toast('บันทึกคำที่ใช้บ่อยแล้ว');
      },
      exportJson: async () => {
        const data = buildExport(st.dumpAll());
        download(`shotlog-backup-${stamp()}.json`, JSON.stringify(data, null, 1), 'application/json');
        await st.setSetting('last_export_at', st.nowIso());
        ctx.rerender();
      },
      csvShots: () => download(`shotlog-shots-${stamp()}.csv`, bom + shotsCsv(), 'text/csv;charset=utf-8'),
      csvPen: () => download(`shotlog-penalties-${stamp()}.csv`, bom + penaltiesCsv(), 'text/csv;charset=utf-8'),
      csvPractice: () => download(`shotlog-practice-${stamp()}.csv`, bom + practiceCsv(), 'text/csv;charset=utf-8'),
      importJson: async (el) => {
        const file = el.files?.[0];
        el.value = '';
        if (!file) return;
        if (linkedOwner()) {
          toast('เครื่องนี้ผูกกับบัญชีคลาวด์อยู่ ออกจากระบบแบบลบข้อมูลในเครื่องก่อน แล้วค่อยกู้คืนจากไฟล์');
          return;
        }
        let data;
        try {
          data = parseImport(await file.text());
        } catch (err) {
          toast(err.message);
          return;
        }
        const merge = linkedOwner() ? '\nเครื่องนี้ซิงก์กับคลาวด์อยู่: ข้อมูลในไฟล์จะรวมกับข้อมูลบนคลาวด์ ถ้าแก้ต่างกันแอปจะให้เลือก' : '';
        const msg = `กู้คืนจากไฟล์: ${data.rounds.length} รอบ, ${data.shots.length} ช็อต, ${data.practice.length} บันทึกซ้อม\nข้อมูลปัจจุบันในเครื่องจะถูกแทนที่ทั้งหมด${merge}\nดำเนินการต่อ?`;
        if (!confirm(msg)) return;
        await restoreBackup(data);
        toast('กู้คืนข้อมูลแล้ว');
        ctx.rerender();
      },
    },
  };
}
