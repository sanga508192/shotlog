import * as st from '../state.js';
import { unpublishLive } from './live.js';
import { esc, header, fmtDate, toast, chips } from '../ui.js';
import { CURATED_COURSES, ISAN_PROVINCES, searchCourses, findDuplicateCourse, sortByDistance, fmtKm, prefillFromScorecard, teeTotal, teeColor } from '../courses.js';
import { getPosition, lastPosition } from '../geo.js';
import { UNITS } from '../constants.js';
import { enabled as cloudEnabled, session as cloudSession } from '../cloud.js';
import { courseCard, rememberCourseCard, rememberFriends, friends, myName, gridOf } from './group.js';
import { ME, MAX_PLAYERS, playersOf, fmtOver } from '../group.js';
import { coachData, focusListHtml } from './coach.js';
import { courseHoles, holeReady, isEstimated } from '../holemap.js';

// ---------- หน้าแรก ----------

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function myTotals(r) {
  const t = gridOf(r).total.byPlayer[ME];
  return t && t.count ? t : null;
}

function roundRow(r, href, { deletable = false } = {}) {
  const [, m, d] = String(r.played_at || '').split('-').map(Number);
  const holes = st.holesOf(r.id);
  const t = myTotals(r);
  const players = playersOf(r).length;
  const row = `<a class="round-row" href="${href}">
    <div class="date"><b>${d || '–'}</b><small>${TH_MONTH[m - 1] ?? ''}</small></div>
    <div class="info"><b>${esc(r.course_name_snapshot)}</b>
      <small>${t ? `${t.count}/${holes.length} หลุม` : `${holes.length} หลุม`}${players > 1 ? ` · ${players} คน` : ''}${r.status === 'incomplete' ? ' · จดไม่ครบ' : ''}</small></div>
    ${t ? `<div class="score-pill">${t.strokes}<small>${fmtOver(t.over)}</small></div>` : ''}
  </a>`;
  if (!deletable) return row;
  return `<div class="row-del">${row}<button type="button" class="mini danger" data-act="delRound" data-id="${r.id}" aria-label="ลบรอบนี้">ลบ</button></div>`;
}

// ลบรอบพร้อมหลุม ช็อต และสโตรกปรับ ถามยืนยันก่อน และกดเลิกทำได้
export async function deleteRound(roundId, { after } = {}) {
  const round = st.S.rounds.get(roundId);
  if (!round) return false;
  const holes = st.holesOf(roundId);
  const shots = holes.flatMap((h) => st.shotsOf(h.id));
  const pens = holes.flatMap((h) => st.penaltiesOf(h.id));
  const scored = holes.filter((h) => Object.keys(h.group_scores || {}).length).length;
  const what = [shots.length && `${shots.length} ช็อต`, scored && `สกอร์ ${scored} หลุม`, pens.length && `สโตรกปรับ ${pens.length}`].filter(Boolean);
  const msg = `ลบรอบ ${round.course_name_snapshot} (${fmtDate(round.played_at)})?\n`
    + (what.length ? `ข้อมูลที่จะหาย: ${what.join(', ')}` : 'รอบนี้ยังไม่ได้จดอะไร');
  if (!confirm(msg)) return false;
  const ops = [
    { store: 'rounds', del: roundId },
    ...holes.map((h) => ({ store: 'holes', del: h.id })),
    ...shots.map((s) => ({ store: 'shots', del: s.id })),
    ...pens.map((p) => ({ store: 'penalties', del: p.id })),
  ];
  await st.commit(ops);
  if (round.live_token) unpublishLive(round.live_token);
  after?.();
  toast('ลบรอบแล้ว', {
    label: 'เลิกทำ',
    run: async () => {
      await st.commit([
        { store: 'rounds', put: round },
        ...holes.map((h) => ({ store: 'holes', put: h })),
        ...shots.map((s) => ({ store: 'shots', put: s })),
        ...pens.map((p) => ({ store: 'penalties', put: p })),
      ]);
      after?.();
      toast('กู้คืนรอบแล้ว');
    },
  });
  return true;
}

function liveCard(r) {
  const holes = st.holesOf(r.id);
  const t = myTotals(r);
  const players = playersOf(r).length;
  return `<div class="live-card">
    <a class="live-main" href="${resumeHref(r)}">
      <div class="live-badge">● กำลังเล่น · ${esc(fmtDate(r.played_at))}</div>
      <div class="live-course">${esc(r.course_name_snapshot)}</div>
      <div class="live-meta">หลุม ${r.current_hole || 1}/${holes.length}${players > 1 ? ` · ${players} คน` : ''}${t ? ` · ${t.strokes} (${fmtOver(t.over)})` : ''}</div>
    </a>
    <div class="live-side">
      <a class="live-go" href="${resumeHref(r)}">จดต่อ ›</a>
      <button type="button" class="mini danger" data-act="delRound" data-id="${r.id}" aria-label="ลบรอบนี้">ลบ</button>
    </div>
  </div>`;
}

export function resumeHref(r) {
  const holes = st.holesOf(r.id);
  const n = r.current_hole || holes.find((h) => h.status === 'playing')?.number || 1;
  return `#/round/${r.id}/hole/${n}`;
}

// ยังไม่ได้เข้าสู่ระบบคลาวด์ และไม่ได้ส่งออกไฟล์สำรองเกิน 30 วัน (มีอย่างน้อย 3 รอบ) → เตือน
// เบราว์เซอร์บางแบบลบข้อมูลเว็บเองเมื่อพื้นที่เต็มหรือไม่ได้เปิดนาน
export function backupWarn(roundCount, lastExport, now = Date.now()) {
  if (cloudSession() || roundCount < 3) return '';
  const days = lastExport ? (now - Date.parse(lastExport)) / 86400000 : Infinity;
  if (days < 30) return '';
  return `<div class="card warn small backup-warn"><b>💾 ${lastExport ? `ไม่ได้สำรองข้อมูลมา ${Math.floor(days)} วัน` : 'ยังไม่เคยสำรองข้อมูล'}</b>
    <span>ข้อมูล ${roundCount} รอบอยู่ในเครื่องนี้เท่านั้น ถ้ามือถือหายหรือล้างเบราว์เซอร์ ข้อมูลจะหายด้วย</span>
    <div class="row gap">${cloudEnabled() ? '<a class="mini primary" href="#/account">สำรองอัตโนมัติบนคลาวด์</a>' : ''}<a class="mini" href="#/settings">ส่งออกไฟล์สำรอง</a></div></div>`;
}

// ปุ่มไปแผนที่หลุม: บอกว่าวางหมุดครบกี่หลุมแล้ว
function mapSetupLink(courseId, sc) {
  const holes = courseHoles(courseId);
  const total = sc?.par?.length || 18;
  const ready = Object.values(holes).filter(holeReady).length;
  const est = Object.values(holes).filter((h) => holeReady(h) && isEstimated(h)).length;
  const first = Array.from({ length: total }, (_, i) => i + 1).find((k) => !holeReady(holes[k])) ?? 1;
  const status = !ready ? 'ยังไม่มี · แตะวางหมุดแท่นทีและกรีน (ทำจากบ้านได้)'
    : est ? `มีหมุด ${ready}/${total} หลุม · ${est} หลุมเป็นค่าประมาณจากภาพดาวเทียม ตรวจในสนามก่อนเชื่อ`
      : `วางหมุดแล้ว ${ready}/${total} หลุม${ready < total ? ' · แตะเพื่อวางต่อ' : ' · ดูระยะบนภาพดาวเทียม'}`;
  return `<a class="card map-card" href="#/map/${encodeURIComponent(courseId)}/${first}${ready < total ? '?edit=1' : ''}">
    <span class="map-card-ico" aria-hidden="true">🗺</span>
    <span><b>แผนที่หลุม</b><small>${status}</small></span>
  </a>`;
}

// การ์ดสั้น ๆ พาไปหน้าพัฒนาเกม
function coachTeaser() {
  const a = coachData();
  const top = a.focus[0];
  if (top) {
    return `<a class="card coach-link" href="#/coach"><b>🎯 จุดที่ควรแก้ก่อน: ${esc(top.th)}</b>
      <span>${top.k === 'save' ? `ได้คืนแค่ ${top.yours.toFixed(1)} สโตรก/รอบ (เป้า${esc(a.goal.th)} ควรได้ ${top.target})`
    : `เสีย ${top.yours.toFixed(1)} สโตรก/รอบ (เป้า${esc(a.goal.th)} ควรไม่เกิน ${top.target})`} · ดูแผนพัฒนา ›</span></a>`;
  }
  if (!a.scoreRounds.length) return '';
  return `<a class="card coach-link" href="#/coach"><b>📈 พัฒนาเกม</b><span>สกอร์เฉลี่ย ${a.avgScore.toFixed(1)} · เป้า${esc(a.goal.th)} · ดูแผนซ้อม ›</span></a>`;
}

export function homeView(_p, ctx) {
  const all = st.rounds();
  const playing = all.filter((r) => r.status === 'playing');
  const past = all.filter((r) => r.status !== 'playing');
  const lastExport = st.setting('last_export_at');
  const name = myName();
  const hour = new Date().getHours();
  const hello = hour < 11 ? 'อรุณสวัสดิ์' : hour < 17 ? 'สวัสดี' : 'สวัสดีตอนเย็น';
  const totals = past.map(myTotals).filter((t) => t && t.count >= 9);
  const best = totals.length ? Math.min(...totals.map((t) => t.over ?? Infinity)) : null;
  return {
    html: `<div class="page">
      <header class="home-top">
        <div><div class="eyebrow">${hello}${name !== 'ฉัน' ? ` ${esc(name)}` : ''} 👋</div><h1>ShotLog</h1></div>
        <a href="#/account" class="sync-pill" data-sync hidden></a>
      </header>
      ${playing.map(liveCard).join('')}
      <a class="hero-cta" href="#/courses">
        <div><b>เริ่มรอบใหม่</b><span>เลือกสนาม ชวนก๊วน แล้วจดได้เลย</span></div>
        <span class="hero-icon" aria-hidden="true">⛳</span>
      </a>
      ${all.length ? `<div class="stat-strip">
        <div><b>${all.length}</b><span>รอบทั้งหมด</span></div>
        <div><b>${best != null && Number.isFinite(best) ? fmtOver(best) : '–'}</b><span>ดีสุด (9 หลุมขึ้นไป)</span></div>
        <div><b>${st.S.shots.size}</b><span>ช็อตที่จด</span></div>
      </div>` : ''}
      ${coachTeaser()}
      <div class="row between"><h2>รอบล่าสุด</h2>${all.length ? '<a class="mini" href="#/history">ดูทั้งหมด / ลบ</a>' : ''}</div>
      ${past.length ? past.slice(0, 5).map((r) => roundRow(r, `#/round/${r.id}/card`)).join('')
    : '<div class="empty"><span class="em">🏌️</span>ยังไม่มีรอบที่จบ<br><span class="small">กด "เริ่มรอบใหม่" ด้านบนเพื่อเริ่มจดรอบแรก</span></div>'}
      ${backupWarn(past.length, lastExport)}
      ${cloudSession() ? '' : `<p class="note center">ข้อมูลเก็บในเครื่องนี้ ${lastExport ? `· สำรองล่าสุด ${esc(fmtDate(lastExport))}` : ''} ·
        ${cloudEnabled() ? '<a href="#/account">สำรองบนคลาวด์</a>' : '<a href="#/settings">ส่งออกไฟล์สำรอง</a>'}</p>`}
    </div>`,
    actions: {
      delRound: (el) => deleteRound(el.dataset.id, { after: () => ctx.rerender() }),
    },
  };
}

let historyEdit = false;

export function historyView(_p, ctx) {
  const all = st.rounds();
  return {
    html: `${header('ประวัติการออกรอบ')}<div class="page">
      ${all.length ? `<div class="row between"><span class="muted small">${all.length} รอบ</span>
        <button type="button" class="mini${historyEdit ? ' primary' : ''}" data-act="toggleEdit">${historyEdit ? 'เสร็จ' : 'เลือกลบ'}</button></div>` : ''}
      ${all.length ? all.map((r) => roundRow(r, r.status === 'playing' ? resumeHref(r) : `#/round/${r.id}/card`, { deletable: historyEdit })).join('')
    : '<div class="empty">ยังไม่มีข้อมูล</div>'}
    </div>`,
    actions: {
      toggleEdit: () => { historyEdit = !historyEdit; ctx.rerender(); },
      delRound: (el) => deleteRound(el.dataset.id, { after: () => ctx.rerender() }),
    },
  };
}

// ---------- เลือกสนาม ----------

const pick = { q: '', province: '', favOnly: false, adding: false, near: false, locating: false };

function courseListHtml() {
  const favs = st.favoriteSet();
  let list = searchCourses(st.allCourses(), { q: pick.q, province: pick.province, favoritesOnly: pick.favOnly, favorites: favs });
  const here = pick.near ? lastPosition(60 * 60 * 1000) : null;
  if (here) list = sortByDistance(list, here);
  if (!list.length) {
    return `<p class="muted center">ไม่พบสนาม${pick.q ? ` “${esc(pick.q)}”` : ''} — <button type="button" class="linklike" data-act="showAdd">เพิ่มสนามเอง</button></p>`;
  }
  return list.map((c) => `<div class="course">
      <button type="button" class="course-main" data-act="pick" data-id="${esc(c.id)}">
        <strong>${esc(c.display_name_th)}</strong>
        <span class="small muted">${esc(c.name_en || '')}</span>
        <span class="small"><span class="tag">${esc(c.province)}</span>${c.origin === 'user' ? '<span class="tag user">เพิ่มเอง</span>' : ''}${st.scorecard(c.id) ? '<span class="tag">มีสกอร์การ์ด</span>' : ''}</span>
        ${here ? `<span class="km${c.km == null ? ' none' : ''}">📍 ${esc(fmtKm(c))}</span>` : ''}
      </button>
      <button type="button" class="star${favs.has(c.id) ? ' on' : ''}" data-act="fav" data-id="${esc(c.id)}" aria-label="สนามโปรด" aria-pressed="${favs.has(c.id)}">${favs.has(c.id) ? '★' : '☆'}</button>
    </div>`).join('');
}

export function coursesView(_p, ctx) {
  const provinces = [...new Set(st.allCourses().map((c) => c.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  const refreshList = () => { document.getElementById('course-list').innerHTML = courseListHtml(); };
  const locate = async () => {
    pick.locating = true;
    ctx.rerender();
    try {
      await getPosition();
      pick.near = true;
      await st.setSetting('near_me', true);
    } catch (err) {
      pick.near = false;
      await st.setSetting('near_me', false);   // ไม่ให้พยายามซ้ำทุกครั้งที่เปิดหน้า
      toast(err.message);
    } finally {
      pick.locating = false;
      if (location.hash === '#/courses') ctx.rerender();
    }
  };
  // เคยเปิด "ใกล้ฉัน" ไว้ → หาตำแหน่งให้อัตโนมัติ
  if (st.setting('near_me', false) && !pick.locating && !lastPosition(60 * 60 * 1000)) setTimeout(locate, 0);
  else if (st.setting('near_me', false) && lastPosition(60 * 60 * 1000)) pick.near = true;
  return {
    html: `${header('เลือกสนาม', { sub: 'ค้นหาชื่อไทย/อังกฤษหรือจังหวัด' })}<div class="page">
      <input class="input" type="search" placeholder="ค้นหา เช่น โคราช, Royal, เขื่อน" value="${esc(pick.q)}" data-input="q" aria-label="ค้นหาสนาม">
      <div class="row gap">
        <select class="input" data-change="province" aria-label="กรองจังหวัด">
          <option value="">ทุกจังหวัด</option>
          ${provinces.map((p) => `<option value="${esc(p)}"${p === pick.province ? ' selected' : ''}>${esc(p)}</option>`).join('')}
        </select>
        <button type="button" class="chip${pick.favOnly ? ' on' : ''}" data-act="favOnly" aria-pressed="${pick.favOnly}">★ โปรด</button>
        <button type="button" class="chip${pick.near ? ' on' : ''}" data-act="nearMe" aria-pressed="${pick.near}" ${pick.locating ? 'disabled' : ''}>${pick.locating ? '⏳ หาตำแหน่ง…' : '📍 ใกล้ฉัน'}</button>
      </div>
      <div id="course-list">${courseListHtml()}</div>
      ${pick.adding ? `<form class="card" data-submit="addCourse">
        <h3>เพิ่มสนามเอง</h3>
        <label>ชื่อสนาม<input class="input" name="name" required value="${esc(pick.q)}"></label>
        <label>ชื่ออังกฤษ (ถ้ามี)<input class="input" name="name_en"></label>
        <label>จังหวัด<input class="input" name="province" list="prov" required value="${esc(pick.province)}"></label>
        <datalist id="prov">${ISAN_PROVINCES.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
        <label class="check"><input type="checkbox" name="here"> 📍 ใช้ตำแหน่งปัจจุบันเป็นตำแหน่งสนาม (ติ๊กเมื่ออยู่ที่สนาม)</label>
        <div class="row gap"><button class="btn primary">เพิ่มและเลือก</button><button type="button" class="btn" data-act="hideAdd">ยกเลิก</button></div>
      </form>` : `<div class="add-course">
        <a class="btn block primary" href="#/scan">📷 เพิ่มสนามจากรูปสกอร์การ์ด</a>
        <button type="button" class="btn block" data-act="showAdd">＋ เพิ่มสนามเอง (ชื่ออย่างเดียว)</button>
      </div>`}
      <p class="note">รายชื่อเตรียมไว้ ${CURATED_COURSES.length} สนาม ตรวจชื่อและจังหวัด ณ ก.ย. 2569 (ยังไม่ครบทุกสนาม เพิ่มเองได้) ไม่ได้ยืนยันเวลาเปิดบริการหรือราคา · ระยะทางเป็นเส้นตรง ตำแหน่งของคุณใช้ในเครื่องเท่านั้น · พิกัดบางส่วน © OpenStreetMap contributors</p>
    </div>`,
    actions: {
      q: (el) => { pick.q = el.value; refreshList(); },
      province: (el) => { pick.province = el.value; refreshList(); },
      favOnly: () => { pick.favOnly = !pick.favOnly; ctx.rerender(); },
      nearMe: async () => {
        if (pick.near) {
          pick.near = false;
          await st.setSetting('near_me', false);
          ctx.rerender();
        } else {
          await locate();
        }
      },
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
        let geo = null;
        if (form.here.checked) {
          try {
            const p = await getPosition();
            geo = { lat: p.lat, lon: p.lon, source: 'ตำแหน่งที่ผู้ใช้บันทึก' };
          } catch (err) {
            toast(`${err.message} — เพิ่มสนามโดยไม่มีตำแหน่ง`);
          }
        }
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
            source_urls: [], checked_at: null, origin: 'user', scorecard_status: 'none', created_at: st.nowIso(), geo,
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
  const sc = st.scorecard(courseId);
  if (!nr || nr.courseId !== courseId) {
    const card = courseCard(courseId);
    const pre = prefillFromScorecard(sc, null, card);
    nr = {
      courseId, date: st.todayLocal(), holes: sc?.par.length === 9 ? 9 : 18, custom: '', tee: '', teeId: null, unit: st.setting('distance_unit', 'm'), note: '',
      pars: pre.pars, hc: pre.hc, dist: {}, fromCard: !!card,
      mates: [], mateName: '', shotLogging: st.setting('default_shot_logging', true),
    };
  }
  const needsGeo = !c.geo || c.geo.approx;
  const known = friends().filter((f) => !nr.mates.some((m) => m.name === f.name)).slice(0, 12);
  const parsSet = Object.values(nr.pars).filter(Boolean).length;
  const count = nr.holes === 'custom' ? Math.min(36, Math.max(1, parseInt(nr.custom, 10) || 0)) : nr.holes;
  const parOpts = [{ v: '3', th: '3' }, { v: '4', th: '4' }, { v: '5', th: '5' }, { v: '6', th: '6' }];
  const { cues } = coachData();
  return {
    html: `${header('เริ่มรอบใหม่', { back: '#/courses' })}<div class="page">
      <div class="card">
        <div class="small muted">⛳ สนามที่เลือก <a class="mini" style="float:right" href="#/courses">เปลี่ยน</a></div>
        <div class="course-picked" id="picked-name">${esc(c.display_name_th)}</div>
        <div><span class="tag" id="picked-province">${esc(c.province)}</span>${c.origin === 'user' ? '<span class="tag user">เพิ่มเอง</span>' : ''}</div>
      </div>
      ${sc ? `<div class="card">
        <div class="row between"><b>📋 สกอร์การ์ดของสนามนี้</b><span class="small muted">พาร์ ${sc.par.reduce((a, b) => a + (b || 0), 0)} · ${sc.par.length} หลุม</span></div>
        <div class="lbl">เลือกแท่นที (เติมระยะรายหลุมให้)</div>
        <div class="chips tees">${sc.tees.map((t) => `<button type="button" class="chip tee${nr.teeId === t.id ? ' on' : ''}" data-act="pickTee" data-v="${t.id}">
          <i style="background:${teeColor(t)}"></i>${esc(t.name)}${teeTotal(t) ? ` <small>${teeTotal(t).toLocaleString('th-TH')}</small>` : ''}</button>`).join('')}</div>
        <details class="small muted"><summary>ที่มาของข้อมูล</summary>
          <ul>${sc.sources.map((x) => `<li>${esc(x)}</li>`).join('')}<li>ตรวจ ณ ${esc(sc.checked_at)} · หน่วย${sc.unit === 'm' ? 'เมตร' : 'หลา'}</li></ul>
          ${sc.note ? `<p>${esc(sc.note)}</p>` : ''}
          ${sc.origin === 'user' ? '' : '<p>ข้อมูลจากฐานข้อมูลออนไลน์ อาจต่างจากสกอร์การ์ดล่าสุดของสนาม แก้พาร์/HC ในรอบได้ แอปจะจำค่าของคุณแทน</p>'}
        </details>
        <a class="mini" href="#/scan/${encodeURIComponent(courseId)}">📷 ${sc.origin === 'user' ? 'แก้ / ถ่ายสกอร์การ์ดใหม่' : 'ถ่ายสกอร์การ์ดจริงของสนามมาแทน'}</a>
      </div>` : `${nr.fromCard ? `<div class="card ok small">✓ ใช้พาร์/HC ที่คุณเคยกรอกไว้ของสนามนี้ (${parsSet} หลุม) แก้ได้ด้านล่าง</div>`
    : '<div class="card warn small">ยังไม่มีสกอร์การ์ดของสนามนี้</div>'}
      <a class="btn block" href="#/scan/${encodeURIComponent(courseId)}">📷 ถ่ายรูปสกอร์การ์ดเพื่อเติมพาร์ / HC / ระยะ</a>`}
      ${needsGeo ? `<button type="button" class="linklike small" data-act="saveGeo">📍 ${c.geo ? 'ตำแหน่งสนามนี้เป็นค่าโดยประมาณ' : 'ยังไม่มีตำแหน่งสนามนี้'} — กดบันทึกตำแหน่งตอนอยู่ที่สนาม</button>` : ''}

      ${mapSetupLink(courseId, sc)}
      ${cues.length ? `<details class="card focus-card" open><summary>🎯 โฟกัสรอบนี้</summary>${focusListHtml(cues)}<a class="mini" href="#/coach">ดูที่มาและแผนซ้อม ›</a></details>` : ''}

      <h2>ใครเล่นด้วย</h2>
      <div class="chips">
        <span class="chip on static">${esc(myName())}${myName() === 'ฉัน' ? '' : ' (ฉัน)'}</span>
        ${nr.mates.map((m, i) => `<button type="button" class="chip on" data-act="mateDel" data-i="${i}" title="แตะเพื่อเอาออก">${esc(m.name)} ✕</button>`).join('')}
      </div>
      ${nr.mates.length + 1 < MAX_PLAYERS ? `<div class="row gap"><input class="input" placeholder="พิมพ์ชื่อเพื่อน" value="${esc(nr.mateName)}" data-input="mateName" data-enter="mateAdd"><button type="button" class="btn" data-act="mateAdd">เพิ่ม</button></div>
        ${known.length ? `<div class="chips">${known.map((f) => `<button type="button" class="chip ghost" data-act="mateKnown" data-name="${esc(f.name)}">＋${esc(f.name)}</button>`).join('')}</div>` : ''}` : ''}
      <p class="note">ตั้งเกม (Skin, Matchplay, ทีม ฯลฯ) และแต้มต่อได้หลังเริ่มรอบ</p>

      <h2>วิธีจดของฉัน</h2>
      <div class="mode-pick">
        <button type="button" class="${nr.shotLogging ? '' : 'on'}" data-act="mode" data-v="quick"><b>⚡ จดเร็ว</b><span>แตะสกอร์ทุกคนหลุมละครั้ง แบบสกอร์การ์ด</span></button>
        <button type="button" class="${nr.shotLogging ? 'on' : ''}" data-act="mode" data-v="shots"><b>🎯 รายช็อต</b><span>จดไม้และผลทุกช็อต ดูว่าควรซ้อมอะไร</span></button>
      </div>
      <h2>รายละเอียดรอบ</h2>
      <label>วันที่<input class="input" type="date" value="${esc(nr.date)}" data-input="date"></label>
      <div class="field"><div class="lbl">จำนวนหลุม</div>
        ${chips('holes', 'holes', [{ v: 9, th: '9 หลุม' }, { v: 18, th: '18 หลุม' }, { v: 'custom', th: 'กำหนดเอง' }], nr.holes)}
        ${nr.holes === 'custom' ? `<input class="input" type="number" min="1" max="36" inputmode="numeric" placeholder="จำนวนหลุม" value="${esc(nr.custom)}" data-change="custom">` : ''}
      </div>
      <label>ชุดแท่นที (ถ้าทราบ)<input class="input" value="${esc(nr.tee)}" placeholder="เช่น ขาว, ฟ้า" data-input="tee"></label>
      <div class="field"><div class="lbl">หน่วยระยะ</div>${chips('unit', 'unit', UNITS, nr.unit)}</div>
      <details class="card"${nr.fromCard ? '' : ''}><summary>พาร์รายหลุม ${parsSet ? `(${parsSet}/${count})` : '(ไม่บังคับ)'}</summary>
        <div class="row gap wrap"><span class="lbl inline">ตั้งทุกหลุม:</span>${[3, 4, 5].map((v) => `<button type="button" class="mini" data-act="allpar" data-v="${v}">พาร์ ${v}</button>`).join('')}</div>
        <div class="par-grid">${Array.from({ length: count }, (_, i) => i + 1).map((n) => `<div class="par-cell"><span>หลุม ${n}</span>
          ${chips('par', String(n), parOpts, nr.pars[n] ? String(nr.pars[n]) : null, { cls: 'tight' })}</div>`).join('')}
        </div>
      </details>
      <label>หมายเหตุ<textarea class="input" rows="2" data-input="note">${esc(nr.note)}</textarea></label>
      <button type="button" class="btn primary big block" data-act="start" ${count ? '' : 'disabled'}>เริ่มรอบ ${count ? `(${count} หลุม)` : ''}</button>
    </div>`,
    actions: {
      date: (el) => { nr.date = el.value; },
      mateName: (el) => { nr.mateName = el.value; },
      mateAdd: () => {
        const name = nr.mateName.trim();
        if (!name || name === myName() || nr.mates.some((m) => m.name === name)) { nr.mateName = ''; ctx.rerender(); return; }
        const f = friends().find((x) => x.name === name);
        nr.mates.push({ name, handicap: f?.handicap ?? null });
        nr.mateName = '';
        ctx.rerender();
      },
      mateKnown: (el) => {
        const f = friends().find((x) => x.name === el.dataset.name);
        if (f && nr.mates.length + 1 < MAX_PLAYERS) nr.mates.push({ name: f.name, handicap: f.handicap ?? null });
        ctx.rerender();
      },
      mateDel: (el) => { nr.mates.splice(Number(el.dataset.i), 1); ctx.rerender(); },
      mode: (el) => { nr.shotLogging = el.dataset.v === 'shots'; ctx.rerender(); },
      pickTee: (el) => {
        const t = sc.tees.find((x) => x.id === el.dataset.v);
        if (nr.teeId === t.id) { nr.teeId = null; nr.dist = {}; nr.tee = ''; }
        else {
          const pre = prefillFromScorecard(sc, t.id, courseCard(courseId));
          Object.assign(nr, { teeId: t.id, tee: t.name, pars: pre.pars, hc: pre.hc, dist: pre.dist });
        }
        ctx.rerender();
      },
      saveGeo: async () => {
        try {
          const p = await getPosition();
          const geo = { lat: p.lat, lon: p.lon, source: 'ตำแหน่งที่ผู้ใช้บันทึก' };
          if (c.origin === 'user') await st.put('userCourses', { ...st.S.userCourses.get(c.id), geo });
          else await st.setSetting(`course_geo:${c.id}`, geo);
          toast('บันทึกตำแหน่งสนามแล้ว ใช้เรียง "ใกล้ฉัน" ครั้งต่อไป');
          ctx.rerender();
        } catch (err) {
          toast(err.message);
        }
      },
      allpar: (el) => {
        const v = Number(el.dataset.v);
        for (let n = 1; n <= count; n++) nr.pars[n] = v;
        ctx.rerender();
      },
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
          tee_name: nr.tee.trim() || null, tee_id: nr.teeId, distance_unit: nr.unit, hole_count: count,
          status: 'playing', note: nr.note.trim(), current_hole: 1, created_at: st.nowIso(),
          shot_logging: nr.shotLogging,
          players: [
            { id: ME, name: myName(), handicap: st.setting('my_handicap', null) },
            ...nr.mates.map((m) => ({ id: `p-${st.uid().slice(0, 8)}`, name: m.name, handicap: m.handicap })),
          ],
          games: [],
        };
        const ops = [{ store: 'rounds', put: round }];
        for (let n = 1; n <= count; n++) {
          ops.push({ store: 'holes', put: {
            id: st.uid(), round_id: roundId, number: n, par: nr.pars[n] ?? null, hc_index: nr.hc[n] ?? null,
            distance: nr.dist[n] ?? null, distance_unit: nr.dist[n] != null ? (sc?.unit === 'm' ? 'm' : 'yd') : null,
            status: 'playing', finish: null, logging_complete: false, note: '',
          } });
        }
        await st.commit(ops);
        await st.setSetting('default_shot_logging', nr.shotLogging);
        await rememberFriends(round.players);
        // สนามที่มีสกอร์การ์ดอยู่แล้ว จำเฉพาะค่าที่ผู้ใช้แก้เองในรอบ (ผ่านหน้าพาร์/HC)
        if (!sc && Object.values(nr.pars).some(Boolean)) await rememberCourseCard(c.id, st.holesOf(roundId));
        nr = null;
        ctx.go(`#/round/${roundId}/hole/1`);
      },
    },
  };
}
