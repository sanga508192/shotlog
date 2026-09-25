import * as st from '../state.js';
import { esc, header, chips, toast, download, fmtDate } from '../ui.js';
import { CLUB_CATEGORIES, UNITS, APP_VERSION } from '../constants.js';
import { buildExport, parseImport, toCSV } from '../logic.js';

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

export function settingsView(_p, ctx) {
  const clubs = st.clubs();
  const used = new Set([...st.S.shots.values()].map((s) => s.club_id));
  const counts = `${st.S.rounds.size} รอบ · ${st.S.shots.size} ช็อต · ${st.S.practice.size} บันทึกซ้อม · ${st.S.userCourses.size} สนามที่เพิ่มเอง`;
  const lastExport = st.setting('last_export_at');
  const bom = '﻿';   // ให้ Excel อ่านภาษาไทยถูก

  const saveClub = async (id, patch) => { await st.put('clubs', { ...st.S.clubs.get(id), ...patch }); };

  return {
    html: `${header('ตั้งค่า')}<div class="page">
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

      <h2>คำที่ใช้บ่อย (ปุ่มเติมหมายเหตุ)</h2>
      <textarea class="input" rows="5" data-change="phrases" placeholder="หนึ่งบรรทัดต่อหนึ่งคำ">${esc(st.setting('phrases', []).join('\n'))}</textarea>

      <h2>สำรองและกู้คืนข้อมูล</h2>
      <div class="card small">${counts}<br>${lastExport ? `ส่งออกไฟล์สำรองล่าสุด ${esc(fmtDate(lastExport))}` : 'ยังไม่เคยส่งออกไฟล์สำรอง'}<br><span id="persist" class="muted"></span></div>
      <button type="button" class="btn primary block" data-act="exportJson">ส่งออกไฟล์สำรอง (JSON)</button>
      <div class="row gap">
        <button type="button" class="btn" data-act="csvShots">CSV ช็อต</button>
        <button type="button" class="btn" data-act="csvPen">CSV สโตรกปรับ</button>
        <button type="button" class="btn" data-act="csvPractice">CSV ซ้อม</button>
      </div>
      <label class="btn block file-btn">กู้คืนจากไฟล์ JSON…<input type="file" accept="application/json,.json" data-change="importJson" hidden></label>
      <p class="note">การกู้คืนจะแทนที่ข้อมูลทั้งหมดในเครื่องนี้ด้วยข้อมูลในไฟล์</p>

      <p class="note center">ShotLog รุ่น ${APP_VERSION} · ข้อมูลเก็บในเครื่องนี้เท่านั้น</p>
    </div>`,
    mount: () => {
      navigator.storage?.persisted?.().then((p) => {
        const el = document.getElementById('persist');
        if (el) el.textContent = p ? 'เบราว์เซอร์ตั้งให้เก็บข้อมูลถาวรแล้ว' : 'เบราว์เซอร์อาจล้างข้อมูลเมื่อพื้นที่เต็ม — ควรส่งออกไฟล์สำรองเป็นระยะ';
      }).catch(() => {});
    },
    actions: {
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
        let data;
        try {
          data = parseImport(await file.text());
        } catch (err) {
          toast(err.message);
          return;
        }
        const msg = `กู้คืนจากไฟล์: ${data.rounds.length} รอบ, ${data.shots.length} ช็อต, ${data.practice.length} บันทึกซ้อม\nข้อมูลปัจจุบันในเครื่องจะถูกแทนที่ทั้งหมด ดำเนินการต่อ?`;
        if (!confirm(msg)) return;
        await st.replaceAll(data);
        toast('กู้คืนข้อมูลแล้ว');
        ctx.rerender();
      },
    },
  };
}
