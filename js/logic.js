// ฟังก์ชันคำนวณล้วน ๆ (ไม่แตะ DOM/IndexedDB) เพื่อทดสอบด้วย node:test ได้
import { DIMENSIONS, SHOT_TYPES, SCHEMA_VERSION, label } from './constants.js';

// ---------- สกอร์ ----------

export function isCounted(shot) {
  return shot.counted !== false;
}

// สกอร์หลุม = สโตรกที่ตีซึ่งนับ + สโตรกปรับ แสดงสองส่วนแยกกัน
export function holeScore(hole, shots, penalties) {
  const strokes = shots.filter(isCounted).length;
  const pen = penalties.reduce((a, p) => a + (Number(p.strokes) || 0), 0);
  const total = strokes + pen;
  const par = Number.isInteger(hole.par) && hole.par > 0 ? hole.par : null;
  const started = shots.length > 0 || penalties.length > 0;
  return {
    strokes,
    penalties: pen,
    total,
    par,
    toPar: par != null && started ? total - par : null,
    notCounted: shots.length - strokes,
    started,
  };
}

// รวมทั้งรอบ ส่วนเทียบพาร์นับเฉพาะหลุมที่จบแล้วและมีพาร์
export function roundScore(holes, shotsOf, penaltiesOf) {
  let strokes = 0, penalties = 0, parSum = 0, totalForPar = 0, holesForPar = 0;
  for (const h of holes) {
    const s = holeScore(h, shotsOf(h.id), penaltiesOf(h.id));
    strokes += s.strokes;
    penalties += s.penalties;
    if (s.par != null && h.status === 'done' && s.started) {
      parSum += s.par;
      totalForPar += s.total;
      holesForPar += 1;
    }
  }
  return {
    strokes,
    penalties,
    total: strokes + penalties,
    toPar: holesForPar ? totalForPar - parSum : null,
    holesForPar,
  };
}

export function fmtToPar(n) {
  if (n == null) return '–';
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : String(n);
}

// ---------- ข้อเสนอประเภทช็อต (ผู้ใช้แก้ได้เสมอ) ----------

export function suggestShotType({ seq, prev, clubCategory }) {
  if (clubCategory === 'putter') return 'putt';
  if (seq === 1) return 'tee';
  if (!prev) return null;
  if (prev.end_lie === 'green') return 'putt';
  if (prev.end_lie === 'bunker') return 'bunker';
  if (prev.end_lie === 'fringe') return 'chip';
  if (prev.shot_type === 'putt') return 'putt';
  if (prev.shot_type === 'tee') return 'approach';
  if (prev.shot_type === 'chip' || prev.shot_type === 'pitch') return prev.shot_type;
  return 'approach';
}

// ---------- ลำดับช็อต ----------

// คืนลำดับใหม่หลังแทรกที่ตำแหน่ง at (1-based) หรือหลังลบ
export function resequence(shots) {
  return [...shots]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s, i) => (s.sequence === i + 1 ? s : { ...s, sequence: i + 1 }));
}

export function shiftForInsert(shots, at) {
  return shots.map((s) => (s.sequence >= at ? { ...s, sequence: s.sequence + 1 } : s));
}

// ---------- สรุปเพื่อฝึกซ้อม ----------
// rows: [{ shot, hole, round, club }] ช็อตหนึ่งอาจมีหลายอาการ จึงไม่บวกอาการเป็นจำนวนช็อตเสีย

function tally(rows) {
  const t = { total: rows.length, assessed: 0, good: 0, needs: 0, unassessed: 0 };
  for (const { shot } of rows) {
    if (shot.assessment === 'good') { t.assessed++; t.good++; }
    else if (shot.assessment === 'needs_work') { t.assessed++; t.needs++; }
    else t.unassessed++;
  }
  t.rate = t.assessed ? t.needs / t.assessed : null;
  return t;
}

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

export function topicKey(t) {
  return [t.shot_type ?? '-', t.club_id ?? '-', t.dim, t.value].join('|');
}

export function buildTopics(rows) {
  const topics = [];
  const groups = groupBy(rows, (r) => `${r.shot.shot_type ?? '-'}|${r.shot.club_id ?? '-'}`);
  for (const g of groups.values()) {
    const { shot_type = null, club_id = null } = g[0].shot;
    const clubLabel = g[0].club?.label ?? null;
    const base = { shot_type: shot_type ?? null, club_id: club_id ?? null, club_label: clubLabel, group_total: g.length };
    for (const dim of DIMENSIONS) {
      const filled = g.filter((r) => r.shot[dim.key] != null);
      for (const value of dim.bad) {
        const hits = filled.filter((r) => r.shot[dim.key] === value);
        if (!hits.length) continue;
        topics.push(finishTopic({
          ...base, dim: dim.key, value,
          count: hits.length, denom: filled.length, unknown: g.length - filled.length, hits,
        }));
      }
    }
    // ต้องปรับ แต่ยังไม่ระบุอาการในมิติใดเลย
    const assessed = g.filter((r) => r.shot.assessment != null);
    const vague = assessed.filter((r) => r.shot.assessment === 'needs_work' &&
      !DIMENSIONS.some((d) => d.bad.includes(r.shot[d.key])));
    if (vague.length) {
      topics.push(finishTopic({
        ...base, dim: 'unspecified', value: 'needs_work',
        count: vague.length, denom: assessed.length, unknown: g.length - assessed.length, hits: vague,
      }));
    }
  }
  return rankTopics(topics);
}

function finishTopic(t) {
  const { hits, ...rest } = t;
  const topic = {
    ...rest,
    shot_ids: hits.map((r) => r.shot.id),
    round_count: new Set(hits.map((r) => r.round?.id)).size,
  };
  topic.key = topicKey(topic);
  topic.label = topicLabel(topic);
  return topic;
}

export function topicLabel(t) {
  const who = [t.club_label ?? 'ไม่ระบุไม้', label(SHOT_TYPES, t.shot_type)].join(' ');
  if (t.dim === 'unspecified') return `${who} — ต้องปรับ (ยังไม่ระบุอาการ)`;
  const dim = DIMENSIONS.find((d) => d.key === t.dim);
  return `${who} — ${label(dim.options, t.value)}`;
}

// เรียงตามจำนวนครั้ง นับเท่ากันได้ลำดับเท่ากัน
export function rankTopics(topics, priorityKeys = []) {
  const pri = new Set(priorityKeys);
  const sorted = [...topics].sort((a, b) =>
    (pri.has(b.key) - pri.has(a.key)) || (b.count - a.count) || a.label.localeCompare(b.label, 'th'));
  let rank = 0, prevCount = null, prevPri = null;
  sorted.forEach((t, i) => {
    const p = pri.has(t.key);
    if (t.count !== prevCount || p !== prevPri) rank = i + 1;
    t.rank = rank;
    t.priority = p;
    prevCount = t.count;
    prevPri = p;
  });
  return sorted;
}

export function puttingStats(rows) {
  const putts = rows.filter((r) => r.shot.shot_type === 'putt');
  return {
    logged: putts.length,
    onGreen: putts.filter((r) => r.shot.start_lie === 'green').length,
    offGreen: putts.filter((r) => r.shot.start_lie && r.shot.start_lie !== 'green').length,
    unknownStart: putts.filter((r) => !r.shot.start_lie).length,
    holed: putts.filter((r) => r.shot.holed === true).length,
  };
}

export function missingData(rows, holes) {
  const list = (pred) => rows.filter(pred).map((r) => r.shot.id);
  return {
    unassessed: list((r) => r.shot.assessment == null),
    noClub: list((r) => r.shot.club_id == null),
    puttNoStart: list((r) => r.shot.shot_type === 'putt' && !r.shot.start_lie),
    puttNoDistance: list((r) => r.shot.shot_type === 'putt' && r.shot.distance_before == null && !r.shot.raw_distance_text),
    noType: list((r) => r.shot.shot_type == null),
    holesNoPar: holes.filter((h) => h.par == null).map((h) => h.id),
    holesNotDone: holes.filter((h) => h.status !== 'done').map((h) => h.id),
  };
}

export function summarize(rows, holes, priorityKeys = []) {
  const byType = [...groupBy(rows, (r) => r.shot.shot_type ?? null)]
    .map(([k, g]) => ({ key: k, label: label(SHOT_TYPES, k), ...tally(g) }))
    .sort((a, b) => b.total - a.total);
  const byClub = [...groupBy(rows, (r) => r.shot.club_id ?? null)]
    .map(([k, g]) => ({ key: k, label: g[0].club?.label ?? 'ไม่ระบุไม้', ...tally(g) }))
    .sort((a, b) => b.total - a.total);
  return {
    shotCount: rows.length,
    roundCount: new Set(rows.map((r) => r.round?.id)).size,
    overall: tally(rows),
    byType,
    byClub,
    topics: rankTopics(buildTopics(rows), priorityKeys),
    putting: puttingStats(rows),
    missing: missingData(rows, holes),
  };
}

// หัวข้อซ้อมที่เสนอตามอาการ (ผู้ใช้กำหนดจำนวนลูกและเกณฑ์สำเร็จเอง)
export function practiceSuggestion(t) {
  const club = t.club_label ? `${t.club_label} ` : '';
  const type = label(SHOT_TYPES, t.shot_type);
  switch (t.dim) {
    case 'contact':
      return { topic: `${club}${type}: ความสม่ำเสมอในการสัมผัสลูก`, metric: 'จำนวนลูกที่สัมผัสดี / จำนวนลูกที่ซ้อม (จดอาการอื่นในหมายเหตุ)' };
    case 'target_result':
      return { topic: `${club}${type}: เข้าพื้นที่เป้าหมายที่เลือก`, metric: 'จำนวนลูกเข้าเป้า / จำนวนลูก (ระบุระยะเริ่มและขนาดเป้า)' };
    case 'direction':
      return { topic: `${club}${type}: ควบคุมทิศทางเทียบแนวเป้า`, metric: 'จำนวนลูกตรงเป้า / จำนวนลูก (จดซ้าย/ขวาในหมายเหตุ)' };
    case 'distance_result':
      return t.shot_type === 'putt'
        ? { topic: `${club}พัต: ควบคุมระยะพัต`, metric: 'จำนวนลูกเข้าเกณฑ์ที่ตั้ง / จำนวนลูก (ระบุระยะเริ่มและระยะที่เหลือ)' }
        : { topic: `${club}${type}: ควบคุมระยะ`, metric: 'จำนวนลูกเข้าช่วงระยะที่ตั้ง / จำนวนลูก' };
    default:
      return { topic: `${club}${type}: ทบทวนช็อตที่ต้องปรับ`, metric: 'จำนวนลูกที่ผ่านเกณฑ์ที่ตั้ง / จำนวนลูก' };
  }
}

export function pct(n, d) {
  if (!d) return '–';
  return `${Math.round((n / d) * 100)}%`;
}

// ---------- ส่งออก / กู้คืน ----------

export const DATA_STORES = ['rounds', 'holes', 'shots', 'penalties', 'clubs', 'practice', 'userCourses', 'favorites', 'settings'];
export const STORE_KEYS = {
  favorites: 'course_id', settings: 'key', meta: 'key', outbox: 'key', syncrev: 'key', conflicts: 'key',
};

// เปรียบเทียบข้อมูลโดยไม่สนลำดับคีย์ (jsonb บนเซิร์ฟเวอร์เรียงคีย์ใหม่)
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}
export const sameData = (a, b) => stableStringify(a) === stableStringify(b);

export function buildExport(data, now = new Date().toISOString()) {
  const out = {};
  for (const s of DATA_STORES) out[s] = data[s] ? [...data[s]] : [];
  return { app: 'ShotLog', schema_version: SCHEMA_VERSION, exported_at: now, data: out };
}

export function parseImport(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('ไฟล์ไม่ใช่ JSON ที่อ่านได้'); }
  if (!obj || obj.app !== 'ShotLog' || typeof obj.data !== 'object') throw new Error('ไม่ใช่ไฟล์สำรองของ ShotLog');
  if (!(obj.schema_version <= SCHEMA_VERSION)) throw new Error(`ไฟล์รุ่นข้อมูล ${obj.schema_version} ใหม่กว่าแอปนี้`);
  const data = {};
  for (const s of DATA_STORES) {
    const arr = obj.data[s] ?? [];
    if (!Array.isArray(arr)) throw new Error(`ข้อมูล ${s} ไม่ถูกต้อง`);
    const key = STORE_KEYS[s] || 'id';
    for (const item of arr) {
      if (!item || typeof item !== 'object' || item[key] == null) throw new Error(`รายการใน ${s} ไม่มี ${key}`);
    }
    data[s] = arr;
  }
  return data;
}

// ---------- CSV ----------

function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  // กันสูตรใน Excel สำหรับข้อความที่ขึ้นต้นด้วยอักขระพิเศษ
  if (typeof v === 'string' && /^[=+\-@]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(header, rows) {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// ---------- สถานะสมาชิก (แสดงผลเท่านั้น สิทธิ์จริงตรวจที่เซิร์ฟเวอร์) ----------

const DAY_MS = 24 * 60 * 60 * 1000;

export function accessSummary(e, now = Date.now()) {
  if (!e) return { kind: 'none', active: false };
  const t = (v) => (v ? Date.parse(v) : null);
  const periodEnd = t(e.current_period_end);
  const prepaid = t(e.prepaid_until);
  const prepaidAlive = prepaid && prepaid > now ? prepaid : null;
  const periodAlive = ['active', 'trialing', 'past_due'].includes(e.status) && (!periodEnd || periodEnd > now);
  const days = (until) => (until ? Math.max(0, Math.ceil((until - now) / DAY_MS)) : null);

  if (e.source === 'stripe_subscription' && periodAlive) {
    const until = Math.max(periodEnd || 0, prepaidAlive || 0) || null;
    return {
      kind: 'subscription', plan: e.plan, active: e.status !== 'past_due' || !!prepaidAlive,
      pastDue: e.status === 'past_due', renews: !e.cancel_at_period_end, periodEnd, until, daysLeft: days(until),
    };
  }
  if (e.source === 'trial' && periodAlive && !(prepaidAlive && prepaidAlive > periodEnd)) {
    return { kind: 'trial', active: true, until: periodEnd, daysLeft: days(periodEnd), prepaidAfter: prepaidAlive };
  }
  if (prepaidAlive) return { kind: 'prepaid', active: true, until: prepaidAlive, daysLeft: days(prepaidAlive) };
  return {
    kind: e.source === 'trial' ? 'trial_expired' : 'expired',
    active: false,
    until: Math.max(periodEnd || 0, prepaid || 0) || null,
  };
}
