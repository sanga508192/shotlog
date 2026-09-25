// ค่าตัวเลือกทั้งหมดของแอป ค่าที่ไม่ได้เลือกเก็บเป็น null = "ยังไม่ระบุ" เสมอ

export const APP_VERSION = '0.2.0';
export const SCHEMA_VERSION = 1;
export const UNKNOWN_TH = 'ยังไม่ระบุ';

export const SHOT_TYPES = [
  { v: 'tee', th: 'ทีออฟ' },
  { v: 'approach', th: 'ตีเข้าหากรีน' },
  { v: 'chip', th: 'ชิพ' },
  { v: 'pitch', th: 'พิทช์' },
  { v: 'bunker', th: 'บังเกอร์' },
  { v: 'putt', th: 'พัต' },
  { v: 'recovery', th: 'แก้สถานการณ์' },
];

export const ASSESSMENTS = [
  { v: 'good', th: 'ดี' },
  { v: 'needs_work', th: 'ต้องปรับ' },
];

export const CONTACTS = [
  { v: 'good', th: 'สัมผัสดี' },
  { v: 'fat', th: 'ฉึก' },
  { v: 'thin', th: 'บาง' },
  { v: 'top', th: 'ท็อป' },
];

export const DIRECTIONS = [
  { v: 'left', th: 'ซ้าย' },
  { v: 'on_line', th: 'ตรงเป้า' },
  { v: 'right', th: 'ขวา' },
];

export const DISTANCE_RESULTS = [
  { v: 'short', th: 'สั้น' },
  { v: 'on_target', th: 'ตามเป้า' },
  { v: 'long', th: 'ยาว' },
];

export const TARGET_RESULTS = [
  { v: 'hit', th: 'เข้าเป้า' },
  { v: 'miss', th: 'ไม่เข้าเป้า' },
];

export const LIES = [
  { v: 'tee', th: 'แท่นที' },
  { v: 'fairway', th: 'แฟร์เวย์' },
  { v: 'rough', th: 'รัฟ' },
  { v: 'bunker', th: 'บังเกอร์' },
  { v: 'fringe', th: 'รอบกรีน' },
  { v: 'green', th: 'บนกรีน' },
  { v: 'holed', th: 'ลงหลุม' },
  { v: 'other', th: 'อื่น ๆ' },
];
export const START_LIES = LIES.filter((l) => l.v !== 'holed');

export const TARGETS = [
  { v: 'green', th: 'ขึ้นกรีน' },
  { v: 'position', th: 'วางตัว' },
  { v: 'close', th: 'ใกล้ธง' },
  { v: 'hole', th: 'ลงหลุม' },
  { v: 'custom', th: 'กำหนดเอง' },
];

export const MEASURE_METHODS = [
  { v: 'measured', th: 'วัด' },
  { v: 'estimated', th: 'ประมาณ' },
  { v: 'text', th: 'ข้อความ' },
];

export const UNITS = [
  { v: 'm', th: 'เมตร' },
  { v: 'yd', th: 'หลา' },
];

export const CLUB_CATEGORIES = [
  { v: 'driver', th: 'ไดรเวอร์' },
  { v: 'wood', th: 'แฟร์เวย์วูด' },
  { v: 'hybrid', th: 'ไฮบริด' },
  { v: 'iron', th: 'เหล็ก' },
  { v: 'wedge', th: 'เวดจ์' },
  { v: 'putter', th: 'พัตเตอร์' },
];

export const PENALTY_REASONS = [
  { v: 'ob_lost', th: 'OB / ลูกหาย' },
  { v: 'penalty_area', th: 'พื้นที่ลงโทษ / น้ำ' },
  { v: 'unplayable', th: 'ลูกเล่นไม่ได้' },
  { v: 'other', th: 'อื่น ๆ' },
];

export const HOLE_FINISH = [
  { v: 'holed', th: 'ลงหลุม' },
  { v: 'picked_up', th: 'ยกลูก / กิมมี่' },
];

export const HOLE_STATUS = [
  { v: 'playing', th: 'กำลังเล่น' },
  { v: 'done', th: 'จบหลุม' },
  { v: 'incomplete', th: 'จดไม่ครบ' },
];

export const ROUND_STATUS = [
  { v: 'playing', th: 'กำลังเล่น' },
  { v: 'complete', th: 'จบรอบ' },
  { v: 'incomplete', th: 'จบรอบ (จดไม่ครบ)' },
];

// มิติอาการที่ใช้สรุป ค่าใน bad คือค่าที่นับเป็นอาการ
export const DIMENSIONS = [
  { key: 'contact', th: 'การสัมผัสลูก', options: CONTACTS, bad: ['fat', 'thin', 'top'] },
  { key: 'direction', th: 'ทิศทาง', options: DIRECTIONS, bad: ['left', 'right'] },
  { key: 'distance_result', th: 'ระยะเทียบเป้า', options: DISTANCE_RESULTS, bad: ['short', 'long'] },
  { key: 'target_result', th: 'ผลเทียบเป้าหมาย', options: TARGET_RESULTS, bad: ['miss'] },
];

export const DEFAULT_CLUBS = [
  ['D', 'driver'], ['3W', 'wood'], ['5W', 'wood'], ['4H', 'hybrid'],
  ['I5', 'iron'], ['I6', 'iron'], ['I7', 'iron'], ['I8', 'iron'], ['I9', 'iron'],
  ['PW', 'wedge'], ['AW', 'wedge'], ['SW', 'wedge'], ['PT', 'putter'],
];

export const DEFAULT_PHRASES = [
  'ลูกออกขวาเยอะ',
  'ห่างหลุม 2 คันธง',
  'พัตไม่กริฟ',
  'ลมแรง',
  'ไลของลูกไม่ดี',
];

export function label(list, v) {
  if (v == null || v === '') return UNKNOWN_TH;
  const found = list.find((o) => o.v === v);
  return found ? found.th : String(v);
}
