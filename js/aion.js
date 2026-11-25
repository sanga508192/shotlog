// ช็อตที่จดด้วยเสียงผ่าน AION (ผู้ช่วยส่วนตัวของผู้ใช้) → แปลงเป็นข้อมูลของแอป
// ไฟล์นี้ไม่แตะฐานข้อมูลและไม่เรียกเน็ต (ทดสอบได้ตรง ๆ) ส่วนหน้าจอและการดึงข้อมูลอยู่ใน views/aion.js
import { PENALTY_ENDS, RELIEFS, LIES, SHOT_TYPES, DIRECTIONS, CONTACTS, label } from './constants.js';

const YD = 0.9144;
const VALID = {
  shot_type: new Set(SHOT_TYPES.map((o) => o.v)),
  end_lie: new Set(LIES.map((o) => o.v)),
  direction: new Set(DIRECTIONS.map((o) => o.v)),
  contact: new Set(CONTACTS.map((o) => o.v)),
};
const ok = (field, v) => (VALID[field].has(v) ? v : null);
const pos = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/** แปลงระยะเป็นหน่วยของรอบ */
export function toRoundUnit(v, from, to) {
  if (v == null) return null;
  if (from === to || !from) return Math.round(v);
  return Math.round(from === 'yd' ? v * YD : v / YD);
}

// ---------- ไม้: รหัสจาก AION (D 3W 5W 7W 2H–6H I3–I9 PW GW AW SW LW PT) → ไม้ในกระเป๋า ----------
const norm = (s) => String(s ?? '').toUpperCase().replace(/[\s\-_.]/g, '');
function aliases(code) {
  const c = norm(code);
  const out = [c];
  let m;
  if (c === 'D') out.push('DR', 'DRIVER', '1W', 'W1');
  else if (c === 'PT') out.push('P', 'PUTTER', 'PUTT');
  else if ((m = /^I(\d)$/.exec(c))) out.push(`${m[1]}I`, m[1], `IRON${m[1]}`, `${m[1]}IRON`);
  else if ((m = /^(\d)W$/.exec(c))) out.push(`W${m[1]}`, `${m[1]}WOOD`);
  else if ((m = /^(\d)H$/.exec(c))) out.push(`H${m[1]}`, `${m[1]}HY`, `HY${m[1]}`, `${m[1]}U`);
  else if (c === 'GW') out.push('AW', 'G', 'GAP');
  else if (c === 'AW') out.push('GW', 'A');
  else if (c === 'SW') out.push('S', 'SAND');
  else if (c === 'LW') out.push('L', 'LOB');
  else if (c === 'PW') out.push('P W', 'PITCHING');
  return out;
}
const CATEGORY_OF = { D: 'driver', PT: 'putter' };

/** หาไม้ที่ตรงกับรหัสของ AION: ชื่อย่อตรงกันก่อน (ไม้ในกระเป๋าก่อน) แล้วค่อยเทียบประเภท · ไม่เจอ = null */
export function clubIdFor(code, clubs) {
  if (!code) return null;
  const list = [...clubs].sort((a, b) => Number(!!b.in_bag) - Number(!!a.in_bag));
  for (const a of aliases(code)) {
    const hit = list.find((c) => norm(c.label) === a);
    if (hit) return hit.id;
  }
  const cat = CATEGORY_OF[norm(code)];
  return cat ? list.find((c) => c.category === cat)?.id ?? null : null;
}

// ---------- ข้อความแสดงผล ----------
export function entryText(e, unit = 'yd') {
  const d = e.data || {};
  const u = (x) => (x === 'm' ? 'ม.' : 'หลา');
  if (e.kind === 'round') return `เริ่มรอบ ${d.course || ''}${d.tee ? ` · แท่นที ${d.tee}` : ''}`;
  if (e.kind === 'hole') return `หลุม ${e.hole}${pos(d.par) ? ` พาร์ ${d.par}` : ''}${pos(d.distance) ? ` · ${d.distance} ${u(d.unit)}` : ''}`;
  const bits = [`ช็อต ${e.seq ?? '?'}`];
  if (d.club) bits.push(String(d.club));
  if (ok('shot_type', d.shot_type)) bits.push(label(SHOT_TYPES, d.shot_type));
  if (ok('end_lie', d.end_lie)) bits.push(`→ ${label(LIES, d.end_lie)}`);
  if (ok('direction', d.direction)) bits.push(`(${label(DIRECTIONS, d.direction)})`);
  if (pos(d.carry)) bits.push(`ไป ~${toRoundUnit(pos(d.carry), d.unit, unit)} ${u(unit)}`);
  if (pos(d.remaining)) bits.push(`เหลือ ${toRoundUnit(pos(d.remaining), d.unit, unit)} ${u(unit)}`);
  if (d.note) bits.push(`· ${d.note}`);
  return bits.join(' ');
}

/** จัดกลุ่มตามวันที่เล่น (เก่าสุดก่อน) */
export function groupByDay(entries) {
  const m = new Map();
  for (const e of entries) {
    if (!m.has(e.played_on)) m.set(e.played_on, []);
    m.get(e.played_on).push(e);
  }
  return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([day, list]) => ({ day, course: [...list].reverse().find((e) => e.kind === 'round')?.data?.course ?? '', entries: list }));
}

/**
 * แผนนำเข้าเข้ารอบที่เลือก (ยังไม่เขียนอะไร)
 * in: { round, holes, shotsOf(holeId), clubs, entries, uid(), now }
 * out: { ops, importedIds, skipped: [{ e, why }], created: { shots, penalties }, holesBefore, roundBefore, summary }
 * กติกาเดียวกับหน้าจดช็อต: ช็อตต่อท้ายช็อตที่มีอยู่, ลงน้ำ/OB/หาย/เล่นไม่ได้ → สโตรกปรับอัตโนมัติ (วิธีตีต่อแบบแรก),
 * ลงหลุม → จบหลุม, ค่าที่ไม่รู้ = null
 */
export function planImport({ round, holes, shotsOf, clubs, entries, uid, now }) {
  const unit = round.distance_unit === 'yd' ? 'yd' : 'm';
  const byNo = new Map(holes.map((h) => [Number(h.number), h]));
  const state = new Map();   // holeId → { next, prev, hole(แก้แล้ว), remaining }
  const holeOf = (h) => {
    if (!state.has(h.id)) {
      const list = shotsOf(h.id);
      state.set(h.id, { next: list.length + 1, prev: list.at(-1) ?? null, hole: { ...h }, changed: false, remaining: null });
    }
    return state.get(h.id);
  };
  const ops = [];
  const importedIds = [];
  const skipped = [];
  const created = { shots: [], penalties: [] };
  const voiced = new Set();
  let lastHole = null;

  for (const e of [...entries].sort((a, b) => a.id - b.id)) {
    const d = e.data || {};
    if (e.kind === 'round') { importedIds.push(e.id); continue; }
    const h = byNo.get(Number(e.hole));
    if (!h) { skipped.push({ e, why: `รอบนี้ไม่มีหลุม ${e.hole}` }); continue; }
    const hs = holeOf(h);
    if (e.kind === 'hole') {
      // เติมพาร์/ระยะเฉพาะหลุมที่ยังไม่มี (ไม่ทับค่าจากสกอร์การ์ด)
      if (hs.hole.par == null && pos(d.par)) { hs.hole.par = Number(d.par); hs.changed = true; }
      if (hs.hole.distance == null && pos(d.distance)) {
        hs.hole.distance = Math.round(Number(d.distance));
        hs.hole.distance_unit = d.unit === 'm' ? 'm' : 'yd';
        hs.changed = true;
      }
      importedIds.push(e.id);
      lastHole = h.number;
      continue;
    }
    // ---- ช็อต ----
    const prev = hs.prev;
    const seq = hs.next++;
    let end_lie = ok('end_lie', d.end_lie);
    const holed = d.holed === true || end_lie === 'holed';
    if (holed) end_lie = 'holed';
    const club_id = clubIdFor(d.club, clubs);
    const isPutter = club_id && clubs.find((c) => c.id === club_id)?.category === 'putter';
    const shot_type = ok('shot_type', d.shot_type) ?? (seq === 1 && (hs.hole.par ?? 4) >= 4 ? 'tee' : isPutter ? 'putt' : null);
    // จุดเริ่ม: ช็อตแรก = แท่นที · ต่อจากลูกที่ลงน้ำ/OB = ตามวิธีตีต่อแบบแรก (ตีใหม่จากจุดเดิม หรือดรอป = ไม่รู้)
    let start_lie = null;
    if (seq === 1) start_lie = 'tee';
    else if (prev && PENALTY_ENDS[prev.end_lie]) start_lie = PENALTY_ENDS[prev.end_lie].reliefs[0] === 'rehit' ? prev.start_lie ?? null : null;
    else if (prev && prev.end_lie !== 'holed') start_lie = prev.end_lie ?? null;
    // ระยะ: ก่อนตี = ระยะหลุม (ช็อตแรก) หรือ "เหลือ" ของช็อตก่อน · หลังตี = "เหลือ" หรือ ก่อนตี − ระยะที่ไป
    const holeDist = seq === 1 && pos(hs.hole.distance) ? toRoundUnit(Number(hs.hole.distance), hs.hole.distance_unit || 'yd', unit) : null;
    const distance_before = holeDist ?? hs.remaining ?? null;
    const carry = toRoundUnit(pos(d.carry), d.unit, unit);
    const remaining = toRoundUnit(pos(d.remaining), d.unit, unit);
    const distance_after = holed ? 0 : remaining ?? (distance_before != null && carry != null ? Math.max(0, distance_before - carry) : null);
    hs.remaining = distance_after;
    const noteBits = [];
    if (d.note) noteBits.push(String(d.note));
    if (d.club && !club_id) noteBits.push(`ไม้ ${d.club} ไม่มีในกระเป๋า`);
    if (e.voice && !voiced.has(e.voice)) { noteBits.push(`🎙 ${e.voice}`); voiced.add(e.voice); }
    const shot = {
      id: uid(), round_id: round.id, hole_id: h.id, sequence: seq,
      club_id, shot_type, assessment: null,
      contact: ok('contact', d.contact), direction: ok('direction', d.direction), distance_result: null, target_result: null,
      start_lie, end_lie, distance_before, distance_after,
      distance_unit: unit, measurement_method: distance_before != null || distance_after != null ? 'estimated' : null,
      raw_distance_text: carry != null ? `ไป ~${carry} ${unit === 'yd' ? 'หลา' : 'ม.'}` : '',
      target: null, target_text: '', note: noteBits.join(' · ').slice(0, 500), holed, counted: true, not_counted_reason: '',
      created_at: now, from_aion: e.id,
    };
    ops.push({ store: 'shots', put: shot });
    created.shots.push(shot.id);
    const pe = PENALTY_ENDS[end_lie];
    if (pe) {
      const r = RELIEFS.find((x) => x.v === pe.reliefs[0]);
      const p = { id: uid(), hole_id: h.id, round_id: round.id, related_shot_id_optional: shot.id, note: '', created_at: now, reason: pe.reason, strokes: r.strokes, relief: r.v, auto: true };
      ops.push({ store: 'penalties', put: p });
      created.penalties.push(p.id);
    }
    if (holed && hs.hole.status === 'playing') { hs.hole.status = 'done'; hs.hole.finish = 'holed'; hs.changed = true; }
    hs.prev = shot;
    importedIds.push(e.id);
    lastHole = h.number;
  }

  const holesBefore = [];
  for (const [id, hs] of state) {
    if (!hs.changed) continue;
    holesBefore.push(holes.find((h) => h.id === id));
    ops.push({ store: 'holes', put: hs.hole });
  }
  const roundBefore = { ...round };
  if (lastHole != null) ops.push({ store: 'rounds', put: { ...round, current_hole: lastHole } });
  const n = created.shots.length;
  const summary = `${n} ช็อต${created.penalties.length ? ` · สโตรกปรับ ${created.penalties.length}` : ''}${skipped.length ? ` · ข้าม ${skipped.length}` : ''}`;
  return { ops, importedIds, skipped, created, holesBefore, roundBefore, summary };
}
