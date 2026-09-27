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

// ---------- พิกัดสนาม (สำหรับเรียงตามระยะทาง) ----------
// approx = ใช้ตำแหน่งใกล้เคียง (เช่น ตัวเขื่อน) ยังไม่ใช่ตัวสนาม ผู้ใช้บันทึกตำแหน่งจริงเองได้ในแอป
// พิกัดจาก OpenStreetMap © OpenStreetMap contributors (ODbL)
export const COURSE_GEO = {
  'chulabhorn-dam': { lat: 16.53627, lon: 101.65004, approx: true, source: 'Wikipedia (ตำแหน่งเขื่อน)' },
  'singha-park-khon-kaen': { lat: 16.32145, lon: 102.82335, source: 'OpenStreetMap' },
  'ubonrat-dam': { lat: 16.77539, lon: 102.61833, approx: true, source: 'Wikipedia (ตำแหน่งเขื่อน)' },
  'dancoon': { lat: 16.48768, lon: 102.72348, source: 'แผนที่บนเว็บไซต์ ททท.' },
  'rancho-charnvee': { lat: 14.63661, lon: 101.46385, source: 'OpenStreetMap' },
  'kirimaya': { lat: 14.51484, lon: 101.43109, source: 'OpenStreetMap (ตำแหน่งรีสอร์ท)' },
  'panorama': { lat: 14.91351, lon: 101.61656, source: 'แผนที่บนเว็บไซต์สนาม' },
  'victory-park': { lat: 17.77943, lon: 102.82401, source: 'OpenStreetMap' },
  'sirindhorn-dam': { lat: 15.19582, lon: 105.41848, source: 'OpenStreetMap' },
};
for (const c of CURATED_COURSES) c.geo = COURSE_GEO[c.id] ?? null;

// ระยะทางเส้นตรงบนผิวโลก (กม.)
export function distanceKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ใกล้สุดขึ้นก่อน สนามที่ยังไม่มีพิกัดอยู่ท้ายรายการ
export function sortByDistance(courses, origin) {
  return courses
    .map((c) => ({ ...c, km: c.geo ? distanceKm(origin, c.geo) : null }))
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.display_name_th.localeCompare(b.display_name_th, 'th'));
}

export function fmtKm(c) {
  if (c.km == null) return 'ยังไม่มีพิกัด';
  const n = c.km < 10 ? c.km.toFixed(1) : Math.round(c.km).toLocaleString('th-TH');
  return `${c.geo?.approx ? '~' : ''}${n} กม.`;
}

// ---------- สกอร์การ์ดที่เตรียมไว้ ----------

// พาร์/HC/ระยะรายหลุมตามแท่นที่เลือก ค่าที่ผู้ใช้เคยแก้เอง (userCard) มาก่อนค่าจากแหล่งข้อมูล
export function prefillFromScorecard(sc, teeId, userCard = null) {
  const out = { pars: {}, hc: {}, dist: {} };
  if (sc) {
    const tee = sc.tees.find((t) => t.id === teeId) ?? null;
    sc.par.forEach((p, i) => { out.pars[i + 1] = p; });
    sc.hc.forEach((h, i) => { out.hc[i + 1] = h; });
    if (tee) tee.yards.forEach((y, i) => { if (y != null) out.dist[i + 1] = y; });
  }
  for (const [n, v] of Object.entries(userCard?.pars || {})) if (v) out.pars[n] = v;
  for (const [n, v] of Object.entries(userCard?.hc || {})) if (v) out.hc[n] = v;
  return out;
}

export const teeTotal = (tee) => (tee.yards.every((y) => y != null) ? tee.yards.reduce((a, b) => a + b, 0) : null);
