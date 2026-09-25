// รายชื่อสนามเริ่มต้นภาคอีสาน ตรวจชื่อและจังหวัด ณ 25 ก.ย. 2569
// ยังไม่มีพาร์/ระยะ/แท่นที/Rating รายสนาม ห้ามเติมจากสนามอื่นหรือคาดเดา

export const ISAN_PROVINCES = [
  'กาฬสินธุ์', 'ขอนแก่น', 'ชัยภูมิ', 'นครพนม', 'นครราชสีมา', 'บึงกาฬ', 'บุรีรัมย์',
  'มหาสารคาม', 'มุกดาหาร', 'ยโสธร', 'ร้อยเอ็ด', 'เลย', 'ศรีสะเกษ', 'สกลนคร',
  'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุบลราชธานี',
];

export const PROVINCE_ALIASES = {
  'กาฬสินธุ์': ['Kalasin'],
  'ขอนแก่น': ['Khon Kaen'],
  'ชัยภูมิ': ['Chaiyaphum'],
  'นครพนม': ['Nakhon Phanom'],
  'นครราชสีมา': ['โคราช', 'Korat', 'Nakhon Ratchasima'],
  'บึงกาฬ': ['Bueng Kan'],
  'บุรีรัมย์': ['Buriram'],
  'มหาสารคาม': ['Maha Sarakham'],
  'มุกดาหาร': ['Mukdahan'],
  'ยโสธร': ['Yasothon'],
  'ร้อยเอ็ด': ['Roi Et'],
  'เลย': ['Loei'],
  'ศรีสะเกษ': ['Si Sa Ket', 'Sisaket'],
  'สกลนคร': ['Sakon Nakhon'],
  'สุรินทร์': ['Surin'],
  'หนองคาย': ['Nong Khai'],
  'หนองบัวลำภู': ['Nong Bua Lamphu'],
  'อำนาจเจริญ': ['Amnat Charoen'],
  'อุดรธานี': ['อุดร', 'Udon Thani', 'Udon'],
  'อุบลราชธานี': ['อุบล', 'Ubon Ratchathani', 'Ubon'],
};

const CHECKED_AT = '2026-09-25';

function curated(id, th, en, province, aliases, sources) {
  return {
    id,
    display_name_th: th,
    name_en: en,
    aliases,
    province,
    region: 'northeast',
    source_urls: sources,
    checked_at: CHECKED_AT,
    origin: 'curated',
    scorecard_status: 'none',
  };
}

export const CURATED_COURSES = [
  curated('chulabhorn-dam', 'สนามกอล์ฟเขื่อนจุฬาภรณ์', 'Chulabhorn Dam Golf Course', 'ชัยภูมิ',
    ['เขื่อนจุฬาภรณ์'], ['https://khunsaicholvilla.egat.co.th/clbdam/index.php/golf-course']),
  curated('singha-park-khon-kaen', 'สิงห์ปาร์ค ขอนแก่น กอล์ฟคลับ', 'Singha Park Khon Kaen Golf Club', 'ขอนแก่น',
    ['สิงห์ปาร์ค', 'Singha Park'], ['https://www.singhapark-khonkaen.com/']),
  curated('ubonrat-dam', 'สนามกอล์ฟเขื่อนอุบลรัตน์', 'Ubonrat Dam Golf Course', 'ขอนแก่น',
    ['เขื่อนอุบลรัตน์'], ['https://khunsaicholvilla.egat.co.th/urdam/index.php/golf-course']),
  curated('dancoon', 'แดนคูน กอล์ฟคลับ', 'Dancoon Golf Club', 'ขอนแก่น',
    ['แดนคูน'], ['https://www.thailandtravel.or.jp/dancoon-golf-club/']),
  curated('rancho-charnvee', 'แรนโช ชาญวีร์', 'Rancho Charnvee Resort & Country Club', 'นครราชสีมา',
    ['ชาญวีร์', 'Charnvee'], ['https://www.charnveeresortkhaoyai.com/contact/', 'https://www.charnveeresortkhaoyai.com/golf-club/']),
  curated('kirimaya', 'คีรีมายา กอล์ฟ รีสอร์ท แอนด์ สปา', 'Kirimaya Golf Resort & Spa', 'นครราชสีมา',
    ['คีรีมายา'], ['https://www.kirimaya.com/', 'https://www.kirimaya.com/contact/']),
  curated('panorama', 'พานอรามา กอล์ฟ แอนด์ คันทรี คลับ', 'Panorama Golf and Country Club', 'นครราชสีมา',
    ['พานอรามา'], ['https://www.panoramacountryclub.net/']),
  curated('royal-creek', 'รอยัลครีก กอล์ฟคลับ แอนด์ รีสอร์ท', 'Royal Creek Golf Club and Resort', 'อุดรธานี',
    ['รอยัลครีก'], ['https://royalcreekgolfthai.wordpress.com/contact/']),
  curated('victory-park', 'วิคตอรี่ พาร์ค กอล์ฟ แอนด์ คันทรี คลับ', 'Victory Park Golf & Country Club', 'หนองคาย',
    ['วิคตอรี่ พาร์ค'], ['https://www.thailandtravel.or.jp/victory-park-golf-and-country-club/']),
  curated('sirindhorn-dam', 'สนามกอล์ฟเขื่อนสิรินธร', 'Sirindhorn Dam Golf Course', 'อุบลราชธานี',
    ['เขื่อนสิรินธร'], ['https://khunsaicholvilla.egat.co.th/srddam/index.php/golf-course']),
];

export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\-_.,&'’()/]+/g, '');
}

function haystack(course) {
  return [
    course.display_name_th,
    course.name_en,
    ...(course.aliases || []),
    course.province,
    ...(PROVINCE_ALIASES[course.province] || []),
  ].map(normalizeText).filter(Boolean);
}

export function sortCourses(courses) {
  return [...courses].sort((a, b) =>
    a.province.localeCompare(b.province, 'th') ||
    a.display_name_th.localeCompare(b.display_name_th, 'th'));
}

export function searchCourses(courses, { q = '', province = '', favoritesOnly = false, favorites = new Set() } = {}) {
  const nq = normalizeText(q);
  return sortCourses(courses.filter((c) =>
    (!province || c.province === province) &&
    (!favoritesOnly || favorites.has(c.id)) &&
    (!nq || haystack(c).some((h) => h.includes(nq)))));
}

// สนามชื่อ (ไทย/อังกฤษ/ชื่อเรียก) และจังหวัดตรงกับรายการเดิม → ใช้รายการเดิม
export function findDuplicateCourse(courses, name, province) {
  const nn = normalizeText(name);
  if (!nn) return null;
  return courses.find((c) =>
    c.province === String(province).trim() &&
    [c.display_name_th, c.name_en, ...(c.aliases || [])].map(normalizeText).includes(nn)) || null;
}
