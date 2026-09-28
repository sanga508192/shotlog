// ทดสอบการนำเข้าไฟล์เครื่องซ้อม (Garmin R10) และการวิเคราะห์: หลายภาษา หน่วย แถวหน่วย ไฟล์เสีย การจับคู่ไม้ ปัญหาที่ตรวจพบ
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv, num, parseDate, readLaunchFile, clubKind, guessClub, toShots, buildRecords, signature, sessionShots,
  clubStats, launchIssues, launchCarryRows, gapping, MAX_SHOTS_PER_RECORD, rawClub,
} from '../js/launch.js';
import { DRILLS } from '../js/coach.js';

const EN = 'Date,Player,Club Name,Club Type,Club Speed,Attack Angle,Club Path,Club Face,Face to Path,Ball Speed,Smash Factor,Launch Angle,Launch Direction,Backspin,Sidespin,Spin Rate,Spin Rate Type,Spin Axis,Apex Height,Carry Distance,Carry Deviation Angle,Carry Deviation Distance,Total Distance,Total Deviation Angle,Total Deviation Distance,Note,Tag,Air Density,Temperature,Air Pressure,Relative Humidity';
const DE = 'Datum;Spieler;Schlägername;Schlägerart;Schl.gsch.;Anstellwinkel;Schwungbahn;Schlagfläche;Schlagflächenstellung;Ballgeschwindigkeit;Smash Factor;Abflugwinkel;Abflugrichtung;Backspin;Sidespin;Drehrate;Drehratentyp;Drehachse;Höhe des Scheitelpunkts;Carry-Distanz;Carry-Abweichungswinkel;Carry-Abweichungsdistanz;Gesamtstrecke;Gesamtabweichungswinkel;Gesamtabweichungsdistanz;Notiz;Markierung;Luftdichte;Temperatur;Luftdruck;Relative Luftfeuchtigkeit';

// แถวข้อมูลตามลำดับคอลัมน์ของ Garmin
function row(o, sep = ',') {
  const v = [o.date ?? '11/26/25 12:38:50', 'Me', '', o.club, o.cs, o.aa ?? 0, o.path ?? 0, o.face ?? 0, o.f2p ?? 0, o.bs, o.sf, o.la ?? 15, o.ld ?? 0,
    o.spin ?? 5000, 0, o.spin ?? 5000, 'Calculated', 0, 20, o.carry, 0, o.cdev ?? 0, o.total ?? o.carry + 8, 0, 0, '', '', 1.2, 30, 101, 70];
  return v.map((x) => (sep === ';' && typeof x === 'number' ? String(x).replace('.', ',') : x)).join(sep);
}
const csv = (head, rows, sep = ',') => [head, ...rows.map((r) => row(r, sep))].join('\r\n');

const iron7 = (i, extra = {}) => ({ club: '7 Iron', cs: 80, bs: 108, sf: 1.35, carry: 150 + (i % 5) - 2, cdev: (i % 3) - 1, f2p: 4 + (i % 2), path: -3, face: 1, ld: 0.5, ...extra });
const driver = (i, extra = {}) => ({ club: 'Driver', cs: 100, bs: 145, sf: 1.45, carry: 230 + (i % 4), cdev: 12, f2p: 5, aa: -3, spin: 3800, la: 11, ...extra });

const BAG = [
  { id: 'd', label: 'D', category: 'driver' }, { id: 'w3', label: '3W', category: 'wood' }, { id: 'w5', label: '5W', category: 'wood' },
  { id: 'h4', label: '4H', category: 'hybrid' }, { id: 'i5', label: 'I5', category: 'iron' }, { id: 'i7', label: 'I7', category: 'iron' },
  { id: 'i9', label: 'I9', category: 'iron' }, { id: 'pw', label: 'PW', category: 'wedge' }, { id: 'aw', label: 'AW', category: 'wedge' },
  { id: 'sw', label: 'SW', category: 'wedge' }, { id: 'pt', label: 'PT', category: 'putter' },
];
const clubOf = (id) => BAG.find((c) => c.id === id) ?? null;

test('อ่าน CSV: เครื่องหมายคำพูด, CRLF, BOM, ตัวคั่น , ; tab และตัวเลขทศนิยมจุลภาค', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, ""y""",2\r\n').rows, [['a', 'b'], ['x, "y"', '2']]);
  assert.equal(parseCsv('a;b\n1;2').delim, ';');
  assert.equal(parseCsv('a\tb\n1\t2').delim, '\t');
  assert.equal(num('1,234'), 1234);
  assert.equal(num('4,863.5'), 4863.5);
  assert.equal(num('-3.5'), -3.5);
  assert.equal(num(''), null);
  assert.equal(num('abc'), null);
});

test('วันที่หลายรูปแบบ รวมปี พ.ศ.', () => {
  assert.equal(parseDate('2025-11-26 12:00'), '2025-11-26');
  assert.equal(parseDate('26.11.25 12:38:50'), '2025-11-26');
  assert.equal(parseDate('11/26/25 12:38'), '2025-11-26');
  assert.equal(parseDate('26/11/2568'), '2025-11-26');
  assert.equal(parseDate('ไม่ใช่วันที่'), null);
});

test('ไฟล์ภาษาอังกฤษ mph/หลา: จับคู่ตามชื่อ เดาหน่วยถูก และแปลงเป็นเมตร/m/s', () => {
  const p = readLaunchFile(csv(EN, Array.from({ length: 6 }, (_, i) => iron7(i))));
  assert.equal(p.byPosition, false);
  assert.deepEqual([p.units.dist, p.units.speed, p.units.fromFile], ['yd', 'mph', false]);
  assert.equal(p.date, '2025-11-26');
  assert.equal(rawClub(p.rows[0], p.cols), '7 Iron');
  const shots = toShots(p, p.units, { '7 Iron': 'i7' });
  assert.equal(shots.length, 6);
  assert.equal(shots[0][7], Math.round(148 * 0.9144 * 10) / 10, 'ระยะลอยเป็นเมตร');
  assert.equal(shots[0][2], Math.round(108 * 0.44704 * 10) / 10, 'ความเร็วลูกเป็น m/s');
});

test('แถวหน่วยใต้หัวคอลัมน์ ใช้หน่วยจากไฟล์', () => {
  const units = EN.split(',').map((h) => (/Speed/.test(h) ? '[mph]' : /Distance|Height/.test(h) ? '[yds]' : /Angle|Path|Face|Direction|Axis/.test(h) ? '[deg]' : ''));
  const text = [EN, units.join(','), ...Array.from({ length: 4 }, (_, i) => row(iron7(i)))].join('\n');
  const p = readLaunchFile(text);
  assert.equal(p.rows.length, 4, 'แถวหน่วยไม่นับเป็นช็อต');
  assert.deepEqual([p.units.dist, p.units.speed, p.units.fromFile], ['yd', 'mph', true]);
});

test('ไฟล์ภาษาเยอรมัน ; และทศนิยมจุลภาค km/h/เมตร', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ club: 'Eisen 7', cs: 129, bs: 175, sf: 1.35, carry: 137 + i, date: '26.11.25 12:38:50' }));
  const p = readLaunchFile(csv(DE, rows, ';'));
  assert.equal(p.byPosition, false);
  assert.deepEqual([p.units.dist, p.units.speed], ['m', 'kmh']);
  const shots = toShots(p, p.units, { 'Eisen 7': 'i7' });
  assert.equal(shots[0][7], 137);
  assert.equal(shots[0][2], Math.round((175 / 3.6) * 10) / 10);
});

test('หัวคอลัมน์ภาษาที่ไม่รู้จัก: จับคู่ตามลำดับคอลัมน์มาตรฐาน · ไฟล์อื่นถูกปฏิเสธ', () => {
  const head = EN.split(',').map((_, i) => `คอลัมน์${i}`).join(',');
  const p = readLaunchFile(csv(head, Array.from({ length: 5 }, (_, i) => iron7(i))));
  assert.equal(p.byPosition, true);
  assert.equal(rawClub(p.rows[0], p.cols), '7 Iron');
  assert.equal(num(p.rows[0][p.cols.carry]), 148);
  assert.throws(() => readLaunchFile('name,score\nA,5\nB,6'), /ไม่พบคอลัมน์/);
  assert.throws(() => readLaunchFile(''), /ว่าง/);
});

test('จับคู่ชื่อไม้ในไฟล์กับไม้ในกระเป๋า', () => {
  const g = (raw) => guessClub(raw, BAG);
  assert.deepEqual(['Driver', '3 Wood', '4 Hybrid', '7 Iron', 'Eisen 7', 'Hierro 9', 'เหล็ก 5', 'Pitching Wedge', 'Gap Wedge', 'Sand Wedge'].map(g),
    ['d', 'w3', 'h4', 'i7', 'i7', 'i9', 'i5', 'pw', 'aw', 'sw']);
  assert.equal(g('Lob Wedge'), null, 'ไม่มีไม้นี้ในกระเป๋า ให้ผู้ใช้เลือกเอง');
  assert.equal(g('6 Iron'), null);
  assert.equal(g('???'), null);
  assert.deepEqual(clubKind('PT'), { cat: 'putter' });
});

test('บันทึก: แบ่งไม่เกิน 400 ช็อตต่อรายการ ขนาดเล็กพอสำหรับคลาวด์ ลายเซ็นคงที่ และไม้ที่เลือกไม่นำเข้าถูกข้าม', () => {
  // ช็อตจริงไม่มีค่าซ้ำกันทุกตัว → ให้ความเร็วลูกต่างกันทุกลูก (ไม่งั้นถูกนับเป็นช็อตซ้ำ)
  const rows = Array.from({ length: 900 }, (_, i) => ({ ...(i % 10 === 0 ? { ...iron7(i), club: 'Putter' } : iron7(i)), bs: 100 + i / 100 }));
  const p = readLaunchFile(csv(EN, rows));
  const map = { '7 Iron': 'i7', Putter: '' };
  const shots = toShots(p, p.units, map);
  assert.equal(shots.length, 810);
  let n = 0;
  const recs = buildRecords({ shots, clubMap: map, date: '2025-11-26', file: 'a.csv', uid: () => `id${n++}`, now: 'now' });
  assert.equal(recs.length, Math.ceil(810 / MAX_SHOTS_PER_RECORD));
  assert.deepEqual(recs.map((r) => r.launch.part), [[1, 3], [2, 3], [3, 3]]);
  assert.ok(recs.every((r) => r.kind === 'launch' && r.launch.sig === recs[0].launch.sig));
  assert.ok(JSON.stringify(recs[0]).length < 60000, `ขนาด ${JSON.stringify(recs[0]).length}`);
  assert.equal(signature(toShots(p, p.units, map)), recs[0].launch.sig);
  assert.equal(recs.reduce((a, r) => a + sessionShots(r).length, 0), 810);
});

test('ข้อมูลเสียจากเครื่องอื่นไม่ทำให้พัง', () => {
  assert.deepEqual(sessionShots(null), []);
  assert.deepEqual(sessionShots({ kind: 'launch', launch: { shots: 'x' } }), []);
  const s = sessionShots({ kind: 'launch', date: '2025-01-01', launch: { clubs: 5, shots: [null, [1, 2], ['7 Iron', 'x', null, null, null, null, null, 140], ['7 Iron', 1, 1, 1, 1, 1, 1, 9999]] } });
  assert.deepEqual(s.map((x) => [x.raw, x.carry, x.clubId, x.cs]), [['7 Iron', 140, null, null]]);
});

function shotsFrom(rows, map = { Driver: 'd', '7 Iron': 'i7', '9 Iron': 'i9', 'Pitching Wedge': 'pw' }) {
  const p = readLaunchFile(csv(EN, rows));
  const recs = buildRecords({ shots: toShots(p, p.units, map), clubMap: map, date: '2025-11-26', file: 'x', uid: () => 'r', now: 'n' });
  return recs.flatMap(sessionShots);
}

test('สถิติรายไม้: ช็อตพลาดไม่นับในระยะ และจับเป็นอัตราพลาด', () => {
  const rows = [...Array.from({ length: 10 }, (_, i) => iron7(i)), iron7(0, { carry: 60, sf: 0.9 }), iron7(1, { carry: 70 })];
  const st = clubStats(shotsFrom(rows), clubOf);
  const i7 = st.find((s) => s.clubId === 'i7');
  assert.equal(i7.n, 12);
  assert.equal(i7.good, 10);
  assert.ok(Math.abs(i7.carry - 150 * 0.9144) < 2);
  assert.ok(Math.abs(i7.mishit - 2 / 12) < 1e-9);
});

test('ตรวจพบปัญหา: ลูกโค้งขวา (ถนัดขวา=สไลซ์ ถนัดซ้าย=ฮุก) ไดรเวอร์ตีกดลง และช่องว่างระยะ', () => {
  const rows = [
    ...Array.from({ length: 8 }, (_, i) => iron7(i)),
    ...Array.from({ length: 6 }, (_, i) => driver(i)),
    ...Array.from({ length: 5 }, (_, i) => ({ club: 'Pitching Wedge', cs: 70, bs: 85, sf: 1.22, carry: 100 + i, f2p: 0.5 })),
  ];
  const stats = clubStats(shotsFrom(rows), clubOf);
  const right = launchIssues(stats, { hand: 'right' });
  const curve = right.find((x) => x.k === 'curve');
  assert.ok(curve && /ขวา/.test(curve.th) && /สไลซ์/.test(curve.th), curve?.th);
  assert.ok(/ฮุก/.test(launchIssues(stats, { hand: 'left' }).find((x) => x.k === 'curve').th));
  assert.ok(right.some((x) => x.k === 'driver'));
  const gaps = gapping(stats);
  assert.ok(gaps.some((g) => g.type === 'gap' && g.a.clubId === 'd' && g.b.clubId === 'i7'), 'ไดรเวอร์ถึงเหล็ก 7 ห่างมาก');
  assert.ok(right.some((x) => x.k === 'gapping'));
  // มีไม้อื่นในกระเป๋าระหว่างไดรเวอร์กับเหล็ก 7 (แค่ไม่ได้ตีครั้งนี้) → ไม่ใช่ช่องว่าง
  const order = BAG.map((c) => c.id);
  const inBetween = (a, b) => Math.abs(order.indexOf(a.clubId) - order.indexOf(b.clubId)) > 1;
  assert.ok(!gapping(stats, { inBetween }).some((g) => g.a.clubId === 'd' && g.b.clubId === 'i7'));
  // แบบฝึกที่แนะนำต้องมีอยู่ในคลังทุกอัน
  for (const i of right) for (const id of i.drills) assert.ok(DRILLS.some((d) => d.id === id), id);
  assert.deepEqual(launchIssues(stats.slice(0, 0)), [], 'ข้อมูลน้อยไม่วิเคราะห์');
});

test('ระยะลอยจากเครื่องซ้อมสำหรับแนะนำไม้: เฉพาะไม้ที่ผูกแล้ว และมีช็อตดีอย่างน้อย 5 ลูก', () => {
  const map = { '7 Iron': 'i7', '9 Iron': null };
  const rows = [...Array.from({ length: 6 }, (_, i) => iron7(i)), ...Array.from({ length: 6 }, (_, i) => ({ ...iron7(i), club: '9 Iron', carry: 130 }))];
  const p = readLaunchFile(csv(EN, rows));
  const recs = buildRecords({ shots: toShots(p, p.units, map), clubMap: map, date: '2025-11-26', file: 'x', uid: () => 'r', now: 'n' });
  const out = launchCarryRows([...recs, { kind: 'drill' }, { kind: 'launch', launch: {} }], clubOf);
  assert.deepEqual(out.map((r) => [r.clubId, r.src, r.n]), [['i7', 'sim', 6]]);
});

// ---------- ไฟล์ภาษาไทยรุ่นใหม่ (โครงสร้างจากไฟล์จริงของผู้ใช้ 28 ก.ย. 2569) ----------
const TH = 'วันที่,ผู้เล่น,ชื่อไม้,แบรนด์/รุ่น,ประเภทไม้,ไม้เร็ว,มุมเข้าลูก,เส้นทางของไม้,หน้าไม้กอล์ฟ,หน้ากับเส้นทาง,ความเร็วลูก,ปัจจัยการชนกระทบ,มุมเปิด,ทิศทางการเปิด,Backspin,Sidespin,อัตราการหมุน,ประเภทอัตราการหมุน,แกนการหมุน,ความสูงของเอเพ็กซ์,ระยะทางในการใช้,การใช้มุมเบี่ยงเบน,การใช้การเบี่ยงเบนระยะทาง,ระยะทางทั้งหมด,มุมเบี่ยงเบนรวม,ระยะทางเบี่ยงเบนทั้งหมด,ระยะรวมเป้าหมาย,ระยะก่อนลูกตกเป้าหมาย,หมายเหตุ,แท็ก,ความหนาแน่นของอากาศ,อุณหภูมิ,ความกดอากาศ,ความชื้นสัมพัทธ์,ความยาวแบ็คสโตรก,เวลาแบ็คสวิงเป้าหมาย,เวลาดาวน์สวิงเป้าหมาย,ความยาวฟอร์เวิร์ดสโตรก,เวลาแบ็คสวิง,เวลาดาวน์สวิง,เทมโปเป้าหมาย,เทมโปการสวิง';
const TH_UNITS = ',,,,,[mph],[deg],[deg],[deg],[deg],[mph],,[deg],[deg],[rpm],[rpm],[rpm],,[deg],[ม.],[หลา],[deg],[หลา],[หลา],[deg],[หลา],[หลา],[หลา],,,[g/L],[deg C],[kPa],[%],[นิ้ว],[sec],[sec],[นิ้ว],[sec],[sec],,';
// แถวตามลำดับคอลัมน์รุ่นใหม่ (มี แบรนด์/รุ่น ที่ลำดับ 3) · carry = null → ช่องระยะว่างแบบไฟล์จริง
function thRow(o) {
  const c = o.carry == null ? '' : o.carry;
  return [o.date ?? '28/08/26 17:10:49', 'Sanga', '', o.brand ?? '', o.club, o.cs, o.aa ?? 2, o.path ?? -11, o.face ?? -3, o.f2p ?? 8, o.bs, o.sf, o.la ?? 15, o.ld ?? -4,
    4000, -300, o.spin ?? 4500, 'วัด', 2, 25, c, o.carry == null ? '' : -3, o.carry == null ? '' : (o.cdev ?? -10), o.carry == null ? '' : c + 12, '', '', '', '', '', '',
    1.12, 29.44, 98.31, 61, '', '', '', '', 1.1, 0.15, '', 7].join(',');
}

test('ไฟล์ภาษาไทยรุ่นใหม่: หัวคอลัมน์ไทย คอลัมน์แบรนด์แทรก แถวหน่วยไทย วันที่ วัน/เดือน/ปี', () => {
  const rows = [
    thRow({ club: 'ไดรเวอร์', brand: 'titleist', cs: 93, bs: 119.3, sf: 1.28, carry: 177 }),
    thRow({ club: 'ไม้ 3', cs: 91, bs: 125.4, sf: 1.37, carry: 187.6, date: '05/09/26 17:20:00' }),
    thRow({ club: 'เหล็ก 5', cs: 85.2, bs: 115.3, sf: 1.35, carry: null }),
  ];
  const p = readLaunchFile([TH, TH_UNITS, ...rows].join('\n'));
  assert.equal(p.byPosition, false, 'จับคู่ด้วยชื่อภาษาไทย');
  assert.equal(p.cols.club, 4);
  assert.equal(p.cols.carry, 20);
  assert.deepEqual([p.units.dist, p.units.speed, p.units.fromFile], ['yd', 'mph', true]);
  assert.equal(p.rows.length, 3, 'ช็อตที่ไม่มีระยะลอยยังเก็บไว้');
  assert.equal(p.noCarry, 1);
  assert.equal(p.date, '2026-08-28', '28/08/26 = 28 ส.ค. และ 05/09/26 = 5 ก.ย. (วัน/เดือน ทั้งไฟล์)');
  assert.deepEqual([...new Set(p.rows.map((r) => rawClub(r, p.cols)))], ['ไดรเวอร์', 'ไม้ 3', 'เหล็ก 5']);
  assert.deepEqual(['ไดรเวอร์', 'ไม้ 3', 'เหล็ก 5', 'เหล็ก 3'].map((c) => guessClub(c, BAG)), ['d', 'w3', 'i5', null]);
  const shots = toShots(p, p.units, { 'ไดรเวอร์': 'd', 'ไม้ 3': 'w3', 'เหล็ก 5': 'i5' });
  assert.equal(shots.length, 3);
  assert.equal(shots[2][7], null, 'ไม่มีระยะลอย');
  assert.ok(shots[2][2] > 0 && shots[2][13] != null, 'แต่มีความเร็วลูกและ Face to Path');
});

test('วันที่ทั้งไฟล์: ตัดสินลำดับวัน/เดือนจากทุกแถว', async () => {
  const { dateOrder } = await import('../js/launch.js');
  assert.equal(dateOrder(['05/09/26', '28/08/26'], true), 'dmy');
  assert.equal(dateOrder(['09/05/26', '08/28/26'], false), 'mdy');
  assert.equal(dateOrder(['05/09/26'], true), 'mdy', 'ตัดสินไม่ได้ + ภาษาอังกฤษ = เดือน/วัน');
  assert.equal(dateOrder(['05/09/26'], false), 'dmy');
  assert.equal(parseDate('05/09/26', 'dmy'), '2026-09-05');
  assert.equal(parseDate('05/09/26', 'mdy'), '2026-05-09');
});

test('ช็อตซ้ำที่สำเนาหนึ่งไม่มีระยะลอย: เก็บสำเนาที่มีระยะไว้สำเนาเดียว', () => {
  const same = { club: 'เหล็ก 4', cs: 83.14692197566214, bs: 97.19488359641073, sf: 1.1689534776147283, spin: 2555.02 };
  const p = readLaunchFile([TH, TH_UNITS, thRow({ ...same, carry: 159.38 }), thRow({ ...same, carry: 140 * 0 || null }), thRow({ ...same, cs: 88.1, carry: 168 })].join('\n'));
  assert.equal(p.dupes, 1);
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows.map((r) => num(r[p.cols.carry])), [159.38, 168]);
  // สำเนาที่ไม่มีระยะมาก่อน → แทนด้วยสำเนาที่มีระยะ
  const q = readLaunchFile([TH, TH_UNITS, thRow({ ...same, carry: null }), thRow({ ...same, carry: 159.38 })].join('\n'));
  assert.deepEqual(q.rows.map((r) => num(r[q.cols.carry])), [159.38]);
});

test('ภาษาที่ไม่รู้จักแบบรุ่นใหม่ (42 คอลัมน์): ลำดับคอลัมน์เลื่อนไป 1 หลังคอลัมน์แบรนด์', () => {
  const head = TH.split(',').map((_, i) => `col${i}`).join(',');
  const p = readLaunchFile([head, thRow({ club: 'ไม้ 3', cs: 91, bs: 125, sf: 1.37, carry: 188 })].join('\n'));
  assert.equal(p.byPosition, true);
  assert.equal(p.cols.club, 4);
  assert.equal(num(p.rows[0][p.cols.carry]), 188);
  assert.equal(num(p.rows[0][p.cols.bs]), 125);
});

test('สถิติ: ช็อตไม่มีระยะลอยนับในวงสวิง ไม่นับในระยะ · ลูกโค้งบอกแนวสวิงตัดจากนอกเข้าใน', () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => thRow({ club: 'ไม้ 3', cs: 91, bs: 125 + i, sf: 1.37, carry: 185 + i })),
    ...Array.from({ length: 8 }, (_, i) => thRow({ club: 'เหล็ก 5', cs: 95, bs: 130 + i, sf: 1.36, carry: null })),
  ];
  const p = readLaunchFile([TH, TH_UNITS, ...rows].join('\n'));
  const map = { 'ไม้ 3': 'w3', 'เหล็ก 5': 'i5' };
  const recs = buildRecords({ shots: toShots(p, p.units, map), clubMap: map, date: '2026-08-28', file: 'x', uid: () => 'r', now: 'n' });
  const stats = clubStats(recs.flatMap(sessionShots), clubOf);
  const i5 = stats.find((s) => s.clubId === 'i5');
  assert.deepEqual([i5.n, i5.nCarry, i5.carry], [8, 0, null]);
  assert.ok(i5.f2p > 7 && i5.sf > 1.3, 'ค่าวงสวิงจากช็อตที่ไม่มีระยะ');
  assert.equal(stats.at(-1).clubId, 'i5', 'ไม้ที่ไม่มีระยะอยู่ท้ายตาราง');
  const curve = launchIssues(stats, { hand: 'right' }).find((x) => x.k === 'curve');
  assert.ok(curve.detail.some((d) => /ตัดจากนอกเข้าใน/.test(d)), curve.detail.join(' | '));
  assert.ok(launchIssues(stats, { hand: 'left' }).find((x) => x.k === 'curve').detail.some((d) => /ในออกนอก/.test(d)));
  assert.deepEqual(launchCarryRows(recs, clubOf).map((r) => r.clubId), ['w3'], 'ไม่มีระยะ = ไม่ใช้แนะนำไม้');
});
