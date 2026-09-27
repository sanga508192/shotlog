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

function curated(id, th, en, province, aliases, sources, checkedAt = CHECKED_AT) {
  return {
    id,
    display_name_th: th,
    name_en: en,
    aliases,
    province,
    region: 'northeast',
    source_urls: sources,
    checked_at: checkedAt,
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
  // ---- นครราชสีมา เพิ่ม 27 ก.ย. 2569 (ตรวจชื่อ/อำเภอจาก GolfLux และเว็บไซต์สนาม) ----
  // ชื่อที่เคยใช้/ชื่อเดิม ใส่ไว้ในชื่อเรียกเพื่อค้นหาได้ (เช่น รุคส์ โคราช, เขาใหญ่ กอล์ฟ คลับ ที่อยู่เดียวกัน)
  curated('korat-country-club', 'โคราช คันทรีคลับ กอล์ฟ แอนด์ รีสอร์ท', 'Korat Country Club Golf & Resort', 'นครราชสีมา',
    ['รุคส์ โคราช', 'Rooks Korat Country Club', 'ปักธงชัย'], ['https://www.koratgolf.com/', 'https://www.golflux.com/course/korat-country-club-golf-resort/'], '2026-09-27'),
  curated('khao-yai-country-club', 'เขาใหญ่ คันทรีคลับ', 'Khao Yai Country Club', 'นครราชสีมา',
    ['เขาใหญ่ กอล์ฟ คลับ', 'Khao Yai Golf Club', 'KYC', 'หมูสี'], ['https://www.golflux.com/course/khaoyai-golf-club/', 'https://www.golfdigg.com/en/courses/khao-yai-country-club'], '2026-09-27'),
  curated('mountain-creek', 'เมาน์เท่น ครีก กอล์ฟ รีสอร์ท แอนด์ เรสซิเดนซ์', 'Mountain Creek Golf Resort & Residences', 'นครราชสีมา',
    ['เมาน์เท่นครีก'], ['https://mountaincreekthailand.com/en/attraction.php', 'https://www.golflux.com/destination/nakhon-ratchasima-golf-courses/'], '2026-09-27'),
  curated('suranaree', 'สุรนารี กอล์ฟ คลับ', 'Suranaree Golf Club', 'นครราชสีมา',
    ['สุรนารี'], ['https://www.golflux.com/course/suranaree-golf-club/'], '2026-09-27'),
  curated('tiger-golf', 'ไทเกอร์ กอล์ฟ คลับ', 'Tiger Golf Club', 'นครราชสีมา',
    ['ไทเกอร์'], ['https://www.golflux.com/destination/nakhon-ratchasima-golf-courses/'], '2026-09-27'),
  curated('my-ozone', 'มาย โอโซน กอล์ฟ คลับ', 'My Ozone Golf Club', 'นครราชสีมา',
    ['มายโอโซน', 'โอโซน', 'วังไทร'], ['https://www.golflux.com/destination/nakhon-ratchasima-golf-courses/'], '2026-09-27'),
  curated('jungle-golf', 'จังเกิ้ล กอล์ฟ คลับ', 'Jungle Golf Club', 'นครราชสีมา',
    ['จังเกิ้ล'], ['https://www.golflux.com/destination/nakhon-ratchasima-golf-courses/'], '2026-09-27'),
  curated('friendship-meadows', 'เฟรนด์ชิพ เมโดวส์ คันทรีคลับ', 'Friendship Meadows Country Club', 'นครราชสีมา',
    ['เฟรนด์ชิพ'], ['https://www.golflux.com/destination/nakhon-ratchasima-golf-courses/'], '2026-09-27'),
  curated('crystal-lake', 'คริสตัล เลค กอล์ฟ คลับ', 'Crystal Lake Golf Club', 'นครราชสีมา',
    ['คริสตัลเลค'], ['https://www.golflux.com/course/crystal-lake-golf-club/'], '2026-09-27'),
  curated('seoul-siam', 'โซล สยาม รีสอร์ท คันทรีคลับ', 'Seoul Siam Resort Country Club', 'นครราชสีมา',
    ['ปากช่อง ไฮแลนด์', 'Pakchong Highland'], ['https://www.golflux.com/destination/nakhon-ratchasima-golf-courses/'], '2026-09-27'),
  curated('bonanza', 'โบนันซ่า กอล์ฟ แอนด์ คันทรีคลับ', 'Bonanza Golf & Country Club', 'นครราชสีมา',
    ['โบนันซ่า', 'ขนงพระ'], ['https://www.golflux.com/destination/nakhon-ratchasima-golf-courses/'], '2026-09-27'),
  curated('toscana-valley', 'ทอสคาน่า วัลเลย์ คันทรีคลับ', 'Toscana Valley Country Club', 'นครราชสีมา',
    ['ทอสคาน่า', 'Toskana', 'โป่งตาลอง'], ['https://www.golflux.com/destination/nakhon-ratchasima-golf-courses/'], '2026-09-27'),
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
    String(a.province || '').localeCompare(String(b.province || ''), 'th') ||
    String(a.display_name_th || '').localeCompare(String(b.display_name_th || ''), 'th'));
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
  'mountain-creek': { lat: 14.82843, lon: 101.60340, source: 'OpenStreetMap' },
  'bonanza': { lat: 14.59297, lon: 101.43526, source: 'OpenStreetMap' },
  'toscana-valley': { lat: 14.51758, lon: 101.50741, source: 'OpenStreetMap' },
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
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || String(a.display_name_th || '').localeCompare(String(b.display_name_th || ''), 'th'));
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

// สีจุดของแท่นที: ใช้สีที่บันทึกไว้ ถ้าไม่มี (เช่น สนามจากรูปสกอร์การ์ด) เดาจากชื่อแท่น
const TEE_COLORS = [
  [/ดำ|black/i, '#1b1b1b'], [/ทอง|gold/i, '#c99700'], [/น้ำเงิน|ฟ้า|blue/i, '#1d5fd1'], [/ขาว|white/i, '#ffffff'],
  [/แดง|red/i, '#d7263d'], [/เหลือง|yellow/i, '#f2c200'], [/เขียว|green/i, '#1f8a55'], [/ส้ม|orange/i, '#f08a24'],
  [/เงิน|silver/i, '#b8c0c8'], [/ชมพู|pink/i, '#e56b9f'],
];
export function teeColor(t) {
  if (typeof t?.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(t.color)) return t.color;
  return TEE_COLORS.find(([re]) => re.test(String(t?.name || '')))?.[1] ?? '#9aa7a0';
}
