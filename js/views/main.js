import * as st from '../state.js';
import { esc, header, fmtDate, toast, chips } from '../ui.js';
import { ISAN_PROVINCES, searchCourses, findDuplicateCourse } from '../courses.js';
import { UNITS, label, ROUND_STATUS } from '../constants.js';
import { roundScore, fmtToPar } from '../logic.js';
import { enabled as cloudEnabled, session as cloudSession } from '../cloud.js';

// ---------- หน้าแรก ----------

function roundCard(r, href) {
  const holes = st.holesOf(r.id);
  const sc = roundScore(holes, st.shotsOf, st.penaltiesOf);
  const done = holes.filter((h) => h.status === 'done').length;
  return `<a class="card link round-card" href="${href}">
    <div class="row between"><strong>${esc(r.course_name_snapshot)}</strong><span class="muted">${esc(fmtDate(r.played_at))}</span></div>
    <div class="row between muted small">
      <span>${esc(r.province_snapshot)} · จบ ${done}/${holes.length} หลุม</span>
      <span>${sc.total ? `${sc.total} (${fmtToPar(sc.toPar)})` : ''} ${r.status !== 'playing' ? `· ${esc(label(ROUND_STATUS, r.status))}` : ''}</span>
    </div>
  </a>`;
}

export function resumeHref(r) {
  const holes = st.holesOf(r.id);
  const n = r.current_hole || holes.find((h) => h.status === 'playing')?.number || 1;
  return `#/round/${r.id}/hole/${n}`;
}

export function homeView() {
  const all = st.rounds();
  const playing = all.filter((r) => r.status === 'playing');
  const past = all.filter((r) => r.status !== 'playing').slice(0, 5);
  const lastExport = st.setting('last_export_at');
  return {
    html: `<div class="page">
      <header class="hero"><div class="row between"><h1>ShotLog</h1><a href="#/account" class="sync-pill" data-sync hidden></a></div><p class="muted">จดรายช็อต ดูรูปแบบที่พลาด เลือกเรื่องซ้อม</p></header>
      <a class="btn primary big block" href="#/courses">＋ เริ่มรอบใหม่</a>
      ${playing.length ? `<h2>รอบที่ยังเล่นค้าง</h2>${playing.map((r) => roundCard(r, resumeHref(r))).join('')}` : ''}
      <nav class="grid${cloudEnabled() ? '4' : '3'}">
        <a class="tile" href="#/summary"><span>📊</span>สรุปการเล่น</a>
        <a class="tile" href="#/practice"><span>🎯</span>ฝึกซ้อม</a>
        ${cloudEnabled() ? '<a class="tile" href="#/account"><span>☁️</span>บัญชี / สำรอง</a>' : ''}
        <a class="tile" href="#/settings"><span>⚙️</span>ตั้งค่า</a>
      </nav>
      <h2>รอบล่าสุด</h2>
      ${past.length ? past.map((r) => roundCard(r, `#/round/${r.id}/card`)).join('') : '<p class="muted">ยังไม่มีรอบที่จบ</p>'}
      ${all.length > 5 ? '<a class="btn block" href="#/history">ดูประวัติทั้งหมด</a>' : ''}
      ${cloudSession() ? '' : `<p class="note">ข้อมูลเก็บในเครื่องนี้เท่านั้น ${lastExport ? `· สำรองล่าสุด ${esc(fmtDate(lastExport))}` : '· ยังไม่เคยส่งออกไฟล์สำรอง'} — <a href="#/settings">ส่งออก/กู้คืน</a>${cloudEnabled() ? ' หรือ <a href="#/account">สำรองบนคลาวด์</a>' : ''}</p>`}
    </div>`,
  };
}

export function historyView() {
  const all = st.rounds();
  return {
    html: `${header('ประวัติการออกรอบ')}<div class="page">
      ${all.length ? all.map((r) => roundCard(r, r.status === 'playing' ? resumeHref(r) : `#/round/${r.id}/card`)).join('') : '<p class="muted">ยังไม่มีข้อมูล</p>'}
    </div>`,
  };
}

// ---------- เลือกสนาม ----------

const pick = { q: '', province: '', favOnly: false, adding: false };

function courseListHtml() {
  const favs = st.favoriteSet();
  const list = searchCourses(st.allCourses(), { q: pick.q, province: pick.province, favoritesOnly: pick.favOnly, favorites: favs });
  if (!list.length) {
    return `<p class="muted center">ไม่พบสนาม${pick.q ? ` “${esc(pick.q)}”` : ''} — <button type="button" class="linklike" data-act="showAdd">เพิ่มสนามเอง</button></p>`;
  }
  return list.map((c) => `<div class="course">
      <button type="button" class="course-main" data-act="pick" data-id="${esc(c.id)}">
        <strong>${esc(c.display_name_th)}</strong>
        <span class="small muted">${esc(c.name_en || '')}</span>
        <span class="small"><span class="tag">${esc(c.province)}</span>${c.origin === 'user' ? '<span class="tag user">เพิ่มเอง</span>' : ''}</span>
      </button>
      <button type="button" class="star${favs.has(c.id) ? ' on' : ''}" data-act="fav" data-id="${esc(c.id)}" aria-label="สนามโปรด" aria-pressed="${favs.has(c.id)}">${favs.has(c.id) ? '★' : '☆'}</button>
    </div>`).join('');
}

export function coursesView(_p, ctx) {
  const provinces = [...new Set(st.allCourses().map((c) => c.province))].sort((a, b) => a.localeCompare(b, 'th'));
  const refreshList = () => { document.getElementById('course-list').innerHTML = courseListHtml(); };
  return {
    html: `${header('เลือกสนาม', { sub: 'ภาคอีสาน · ค้นหาชื่อไทย/อังกฤษหรือจังหวัด' })}<div class="page">
      <input class="input" type="search" placeholder="ค้นหา เช่น โคราช, Royal, เขื่อน" value="${esc(pick.q)}" data-input="q" aria-label="ค้นหาสนาม">
      <div class="row gap">
        <select class="input" data-change="province" aria-label="กรองจังหวัด">
          <option value="">ทุกจังหวัด</option>
          ${provinces.map((p) => `<option value="${esc(p)}"${p === pick.province ? ' selected' : ''}>${esc(p)}</option>`).join('')}
        </select>
        <button type="button" class="chip${pick.favOnly ? ' on' : ''}" data-act="favOnly" aria-pressed="${pick.favOnly}">★ สนามโปรด</button>
      </div>
      <div id="course-list">${courseListHtml()}</div>
      ${pick.adding ? `<form class="card" data-submit="addCourse">
        <h3>เพิ่มสนามเอง</h3>
        <label>ชื่อสนาม<input class="input" name="name" required value="${esc(pick.q)}"></label>
        <label>ชื่ออังกฤษ (ถ้ามี)<input class="input" name="name_en"></label>
        <label>จังหวัด<input class="input" name="province" list="prov" required value="${esc(pick.province)}"></label>
        <datalist id="prov">${ISAN_PROVINCES.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
        <div class="row gap"><button class="btn primary">เพิ่มและเลือก</button><button type="button" class="btn" data-act="hideAdd">ยกเลิก</button></div>
      </form>` : '<button type="button" class="btn block" data-act="showAdd">＋ ไม่พบสนาม? เพิ่มสนามเอง</button>'}
      <p class="note">รายชื่อเริ่มต้น 10 สนาม ตรวจชื่อและจังหวัด ณ 25 ก.ย. 2569 ไม่ได้ยืนยันเวลาเปิดบริการหรือราคา ยังไม่มีข้อมูลพาร์รายหลุม</p>
    </div>`,
    actions: {
      q: (el) => { pick.q = el.value; refreshList(); },
      province: (el) => { pick.province = el.value; refreshList(); },
      favOnly: () => { pick.favOnly = !pick.favOnly; ctx.rerender(); },
      fav: async (el) => {
        const id = el.dataset.id;
        if (st.S.favorites.has(id)) await st.del('favorites', id);
        else await st.put('favorites', { course_id: id, created_at: st.nowIso() });
        refreshList();
      },
      pick: (el) => ctx.go(`#/new/${encodeURIComponent(el.dataset.id)}`),
      showAdd: () => { pick.adding = true; ctx.rerender(); },
      hideAdd: () => { pick.adding = false; ctx.rerender(); },
      addCourse: async (form) => {
        const name = form.name.value.trim();
        const province = form.province.value.trim();
        if (!name || !province) return;
        const dup = findDuplicateCourse(st.allCourses(), name, province);
        let id;
        if (dup) {
          id = dup.id;
          toast('มีสนามนี้อยู่แล้ว ใช้รายการเดิม');
        } else {
          id = `user-${st.uid()}`;
          await st.put('userCourses', {
            id, display_name_th: name, name_en: form.name_en.value.trim(), aliases: [], province,
            region: ISAN_PROVINCES.includes(province) ? 'northeast' : 'other',
            source_urls: [], checked_at: null, origin: 'user', scorecard_status: 'none', created_at: st.nowIso(),
          });
        }
        pick.adding = false;
        ctx.go(`#/new/${encodeURIComponent(id)}`);
      },
    },
  };
}

// ---------- ตั้งค่ารอบใหม่ ----------

let nr = null;

export function newRoundView([courseId], ctx) {
  const c = st.course(courseId);
  if (!c) return { html: `${header('ไม่พบสนาม', { back: '#/courses' })}<div class="page"><p>ไม่พบสนามนี้</p></div>` };
  if (!nr || nr.courseId !== courseId) {
    nr = { courseId, date: st.todayLocal(), holes: 18, custom: '', tee: '', unit: st.setting('distance_unit', 'm'), note: '', pars: {} };
  }
  const count = nr.holes === 'custom' ? Math.min(36, Math.max(1, parseInt(nr.custom, 10) || 0)) : nr.holes;
  const parOpts = [{ v: '3', th: '3' }, { v: '4', th: '4' }, { v: '5', th: '5' }, { v: '6', th: '6' }];
  return {
    html: `${header('เริ่มรอบใหม่', { back: '#/courses' })}<div class="page">
      <div class="card">
        <div class="small muted">สนามที่เลือก</div>
        <div class="course-picked" id="picked-name">${esc(c.display_name_th)}</div>
        <div><span class="tag" id="picked-province">${esc(c.province)}</span>${c.origin === 'user' ? '<span class="tag user">เพิ่มเอง</span>' : ''}</div>
      </div>
      <div class="card warn small">ยังไม่มีข้อมูลสกอร์การ์ดของสนามนี้ — กรอกพาร์เองด้านล่าง หรือระหว่างเล่นในหน้าบันทึกหลุม (ไม่กรอกก็ได้ ระบบจะแสดงว่า “ยังไม่ระบุ”)</div>
      <label>วันที่<input class="input" type="date" value="${esc(nr.date)}" data-input="date"></label>
      <div class="field"><div class="lbl">จำนวนหลุม</div>
        ${chips('holes', 'holes', [{ v: 9, th: '9 หลุม' }, { v: 18, th: '18 หลุม' }, { v: 'custom', th: 'กำหนดเอง' }], nr.holes)}
        ${nr.holes === 'custom' ? `<input class="input" type="number" min="1" max="36" inputmode="numeric" placeholder="จำนวนหลุม" value="${esc(nr.custom)}" data-change="custom">` : ''}
      </div>
      <label>ชุดแท่นที (ถ้าทราบ)<input class="input" value="${esc(nr.tee)}" placeholder="เช่น ขาว, ฟ้า" data-input="tee"></label>
      <div class="field"><div class="lbl">หน่วยระยะ</div>${chips('unit', 'unit', UNITS, nr.unit)}</div>
      <details class="card"><summary>กรอกพาร์รายหลุม (ไม่บังคับ)</summary>
        <div class="par-grid">${Array.from({ length: count }, (_, i) => i + 1).map((n) => `<div class="par-cell"><span>หลุม ${n}</span>
          ${chips('par', String(n), parOpts, nr.pars[n] ? String(nr.pars[n]) : null, { cls: 'tight' })}</div>`).join('')}
        </div>
      </details>
      <label>หมายเหตุ<textarea class="input" rows="2" data-input="note">${esc(nr.note)}</textarea></label>
      <button type="button" class="btn primary big block" data-act="start" ${count ? '' : 'disabled'}>เริ่มรอบ ${count ? `(${count} หลุม)` : ''}</button>
    </div>`,
    actions: {
      date: (el) => { nr.date = el.value; },
      tee: (el) => { nr.tee = el.value; },
      note: (el) => { nr.note = el.value; },
      custom: (el) => { nr.custom = el.value; ctx.rerender(); },
      holes: (el) => { const v = el.dataset.v; nr.holes = v === 'custom' ? 'custom' : Number(v); ctx.rerender(); },
      unit: (el) => { nr.unit = el.dataset.v; ctx.rerender(); },
      par: (el) => {
        const n = el.dataset.field, v = Number(el.dataset.v);
        nr.pars[n] = nr.pars[n] === v ? undefined : v;
        ctx.rerender();
      },
      start: async (el) => {
        if (el.disabled || !count) return;
        el.disabled = true;
        const roundId = st.uid();
        const round = {
          id: roundId, played_at: nr.date || st.todayLocal(), course_id: c.id,
          course_name_snapshot: c.display_name_th, province_snapshot: c.province,
          tee_name: nr.tee.trim() || null, distance_unit: nr.unit, hole_count: count,
          status: 'playing', note: nr.note.trim(), current_hole: 1, created_at: st.nowIso(),
        };
        const ops = [{ store: 'rounds', put: round }];
        for (let n = 1; n <= count; n++) {
          ops.push({ store: 'holes', put: {
            id: st.uid(), round_id: roundId, number: n, par: nr.pars[n] ?? null, distance: null,
            status: 'playing', finish: null, logging_complete: false, note: '',
          } });
        }
        await st.commit(ops);
        nr = null;
        ctx.go(`#/round/${roundId}/hole/1`);
      },
    },
  };
}
