// ทดสอบตัววิเคราะห์ข้อความ OCR จากรูปสกอร์การ์ด
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScorecardText, validateCard, tokenizeLine } from '../js/scorecard-parse.js';
import { SCORECARDS } from '../js/scorecards.js';

const S = SCORECARDS['singha-park-khon-kaen'];
const front = (a) => a.slice(0, 9);
const back = (a) => a.slice(9);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const tee = (id) => S.tees.find((t) => t.id === id).yards;

test('การ์ดแบบแยกเก้าหน้า/เก้าหลัง มีแถวเลขหลุมและยอดรวม OUT/IN/TOT', () => {
  const text = [
    'SINGHA PARK KHON KAEN GOLF CLUB',
    `HOLE 1 2 3 4 5 6 7 8 9 OUT`,
    `BLACK ${front(tee('black')).join(' ')} ${sum(front(tee('black')))}`,
    `BLUE ${front(tee('blue')).join(' ')} ${sum(front(tee('blue')))}`,
    `WHITE ${front(tee('white')).join(' ')} ${sum(front(tee('white')))}`,
    `PAR ${front(S.par).join(' ')} 36`,
    `HCP ${front(S.hc).join(' ')}`,
    `RED ${front(tee('red')).join(' ')} ${sum(front(tee('red')))}`,
    `HOLE 10 11 12 13 14 15 16 17 18 IN TOT`,
    `BLACK ${back(tee('black')).join(' ')} ${sum(back(tee('black')))} 7502`,
    `BLUE ${back(tee('blue')).join(' ')} ${sum(back(tee('blue')))} 6840`,
    `WHITE ${back(tee('white')).join(' ')} ${sum(back(tee('white')))} 6211`,
    `PAR ${back(S.par).join(' ')} 36 72`,
    `HCP ${back(S.hc).join(' ')}`,
    `RED ${back(tee('red')).join(' ')} ${sum(back(tee('red')))} 5258`,
  ].join('\n');
  const c = parseScorecardText(text);
  assert.equal(c.holes, 18);
  assert.deepEqual(c.par, S.par);
  assert.deepEqual(c.hc, S.hc);
  assert.deepEqual(c.tees.map((t) => t.name), ['ดำ', 'น้ำเงิน', 'ขาว', 'แดง']);
  assert.deepEqual(c.tees[0].yards, tee('black'));
  assert.deepEqual(c.tees[3].yards, tee('red'));
  assert.equal(c.unit, 'yd');
  assert.equal(validateCard(c).count, 0);
});

test('การ์ดแถวยาว 18 หลุมในบรรทัดเดียว ไม่มีชื่อแท่น และมีตัวอักษรที่ OCR อ่านเพี้ยน', () => {
  const blue = tee('blue').map(String);
  blue[3] = '37S';   // S แทน 5
  blue[10] = '5OO';  // O แทน 0
  const text = [
    `Par ${S.par.join(' ')} 72`,
    `${blue.join(' ')} 6840`,
    `Handicap ${S.hc.join(' ')}`,
  ].join('\n');
  const c = parseScorecardText(text);
  assert.deepEqual(c.par, S.par);
  assert.deepEqual(c.hc, S.hc);
  assert.equal(c.tees.length, 1);
  assert.equal(c.tees[0].name, 'แท่น 1');
  assert.deepEqual(c.tees[0].yards, tee('blue'));
});

test('ไม่มีแถวเลขหลุม: แถวชนิดเดียวกันที่เจอครั้งที่สองเป็นเก้าหลัง', () => {
  const text = [
    `WHITE ${front(tee('white')).join(' ')}`,
    `PAR ${front(S.par).join(' ')}`,
    `WHITE ${back(tee('white')).join(' ')}`,
    `PAR ${back(S.par).join(' ')}`,
  ].join('\n');
  const c = parseScorecardText(text);
  assert.deepEqual(c.par, S.par);
  assert.deepEqual(c.tees[0].yards, tee('white'));
  assert.equal(c.hc.every((h) => h == null), true, 'ไม่มีแถว HC → ว่างให้ผู้ใช้กรอก ไม่เดา');
});

test('อ่านได้ไม่ครบ → เว้นว่างและเตือน ไม่เลื่อนเดาค่า', () => {
  const text = `PAR ${front(S.par).slice(0, 8).join(' ')}\nHCP ${front(S.hc).join(' ')}`;
  const c = parseScorecardText(text);
  assert.equal(c.holes, 9);
  assert.equal(c.par[8], null);
  assert.match(c.warnings.join(), /ไม่ครบ/);
  assert.ok(validateCard(c).issues['par:8']);
});

test('สนาม 9 หลุม และหน่วยเมตร', () => {
  const c = parseScorecardText('Distances in meters\nHOLE 1 2 3 4 5 6 7 8 9\nPAR 4 4 3 5 4 3 4 5 4 36\nMEN 320 300 140 450 310 150 330 470 360 2830\nS.I. 3 7 9 1 5 8 4 2 6');
  assert.equal(c.holes, 9);
  assert.equal(c.unit, 'm');
  assert.deepEqual(c.par, [4, 4, 3, 5, 4, 3, 4, 5, 4]);
  assert.deepEqual(c.hc, [3, 7, 9, 1, 5, 8, 4, 2, 6]);
  assert.equal(c.tees[0].yards[3], 450);
});

test('ตรวจก่อนบันทึก: จับ HC ซ้ำ พาร์ผิด ระยะพาร์ 3 ยาวเกิน', () => {
  const card = { unit: 'yd', par: [...S.par], hc: [...S.hc], tees: [{ name: 'ขาว', yards: [...tee('white')] }] };
  card.hc[1] = 7;          // ซ้ำกับหลุม 1
  card.par[2] = 9;
  card.tees[0].yards[4] = 420;   // หลุม 5 พาร์ 3
  const v = validateCard(card);
  assert.ok(v.issues['hc:0'] && v.issues['hc:1']);
  assert.ok(v.issues['par:2']);
  assert.ok(v.issues['tee0:4']);
  assert.equal(v.teeTotals[0], null === 1 ? 0 : v.teeTotals[0]);
});

test('แยกคำนำหน้าแถวกับตัวเลข', () => {
  assert.deepEqual(tokenizeLine('Blue | 436 | 324 | 559'), { label: 'blue', nums: [436, 324, 559] });
  assert.deepEqual(tokenizeLine('H.C. 7 15 3'), { label: 'h.c.', nums: [7, 15, 3] });
});

// ---------- จัดตามคอลัมน์จากตำแหน่งคำ (ไม่ต้องใช้ Tesseract จริง) ----------
import { gridFromWords, wordsFromTsv } from '../js/scorecard-ocr.js';
import { cardFromGrid } from '../js/scorecard-parse.js';

// สร้างคำพร้อมตำแหน่งเหมือนผลจาก Tesseract: คอลัมน์หลุมห่างกัน 80px เริ่มที่ x=200
const W = (text, col, row, conf = 95) => ({ text, x: 200 + col * 80, y: 100 + row * 50, left: 180 + col * 80, right: 220 + col * 80, h: 30, conf });
function words(rows) {
  const out = [];
  rows.forEach(([label, cells], r) => {
    out.push({ text: label, x: 80, y: 100 + r * 50, left: 40, right: 120, h: 30, conf: 95 });
    cells.forEach((c, i) => { if (c != null) out.push(W(String(c), i, r, typeof c === 'string' && c.startsWith('~') ? 40 : 95)); });
  });
  return out.map((w) => ({ ...w, text: String(w.text).replace(/^~/, '') }));
}

test('ช่องที่อ่านไม่ได้เว้นว่างในตำแหน่งเดิม ไม่เลื่อนค่า', () => {
  const g = gridFromWords(words([
    ['HOLE', [1, 2, 3, 4, 5, 6, 7, 8, 9, 'OUT']],
    ['BLUE', [436, 324, null, 375, 180, 402, 578, 212, 474]],
    ['PAR', [4, 4, 5, 4, 3, 4, 5, 3, 4, 36]],
  ]));
  const c = cardFromGrid(g);
  assert.deepEqual(c.tees[0].yards, [436, 324, null, 375, 180, 402, 578, 212, 474]);
  assert.deepEqual(c.par, [4, 4, 5, 4, 3, 4, 5, 3, 4]);
});

test('ยอด OUT บนการ์ด: ขาดช่องเดียว → คำนวณให้และทำเครื่องหมาย, รวมไม่ตรง → เตือน', () => {
  const g = gridFromWords(words([
    ['HOLE', [1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ['BLUE', [436, 324, null, 375, 180, 402, 578, 212, 474, 3540]],
    ['WHITE', [386, 302, 529, 347, 149, 379, 529, 175, 445, 3999]],
  ]));
  const c = cardFromGrid(g);
  const blue = c.tees.findIndex((t) => t.name === 'น้ำเงิน');
  assert.equal(c.tees[blue].yards[2], 559);
  assert.equal(c.flags[`tee${blue}:2`], 'derived');
  const white = c.tees.findIndex((t) => t.name === 'ขาว');
  assert.equal(c.flags[`tee${white}:0`], 'sum');
  assert.match(c.warnings.join(), /3999/);
});

test('ค่านอกช่วงเป็นไปไม่ได้ → เว้นว่าง, เศษเส้นตารางไม่กลายเป็นเลข 1, ค่าไม่มั่นใจถูกทำเครื่องหมาย', () => {
  const g = gridFromWords(words([
    ['HOLE', [1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ['RED', ['|309', 1240, 465, 325, 129, '~294', 431, 148, 347]],
  ]));
  const c = cardFromGrid(g);
  assert.equal(c.tees[0].yards[0], 309, '"|309" ต้องไม่เป็น 1309');
  assert.equal(c.tees[0].yards[1], null, '1240 เกินช่วงระยะ → ว่าง');
  assert.equal(c.flags['tee0:5'], 'low');
});

test('อ่านผล TSV ของ Tesseract', () => {
  const tsv = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'
    + '5\t1\t1\t1\t1\t1\t100\t50\t40\t30\t91.5\t436\n4\t1\t1\t1\t1\t0\t0\t0\t0\t0\t-1\t\n';
  assert.deepEqual(wordsFromTsv(tsv), [{ text: '436', x: 120, y: 65, left: 100, right: 140, h: 30, conf: 91.5 }]);
});

test('รวมผลจาก 2 รูป (เก้าหน้า + เก้าหลัง)', async () => {
  const { mergeCards } = await import('../js/scorecard-parse.js');
  const f = { holes: 18, unit: 'yd', par: [...S.par.slice(0, 9), ...Array(9).fill(null)], hc: Array(18).fill(null), tees: [{ name: 'ขาว', color: '#fff', yards: [...tee('white').slice(0, 9), ...Array(9).fill(null)] }], flags: { 'tee0:2': 'low' }, warnings: [] };
  const b = { holes: 18, unit: 'yd', par: [...Array(9).fill(null), ...S.par.slice(9)], hc: [...S.hc], tees: [{ name: 'แดง', color: '#d00', yards: [...tee('red')] }, { name: 'ขาว', color: '#fff', yards: [...Array(9).fill(null), ...tee('white').slice(9)] }], flags: { 'tee1:12': 'derived' }, warnings: ['x'] };
  const m = mergeCards(f, b);
  assert.deepEqual(m.par, S.par);
  assert.deepEqual(m.hc, S.hc);
  assert.deepEqual(m.tees.find((t) => t.name === 'ขาว').yards, tee('white'));
  assert.deepEqual(m.tees.find((t) => t.name === 'แดง').yards, tee('red'));
  assert.equal(m.flags['tee0:2'], 'low');
  assert.equal(m.flags['tee0:12'], 'derived', 'เครื่องหมายต้องย้ายตามตำแหน่งแท่นที่รวมแล้ว');
});
