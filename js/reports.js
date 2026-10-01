// ส่งรายงานข้อผิดพลาด (เฉพาะเมื่อผู้ใช้เปิดเอง) และความเห็นของผู้ทดลองใช้ ไปที่ตาราง app_reports (schema.sql ขั้นที่ 4)
// ไม่ส่งข้อมูลรอบ สกอร์ ตำแหน่ง หรืออีเมล: ส่งเฉพาะข้อความผิดพลาด หน้าที่เกิด (ตัดรหัสออก) รุ่นแอป และรุ่นเบราว์เซอร์
import * as st from './state.js';
import * as cloud from './cloud.js';
import { APP_VERSION } from './constants.js';
import { setReporter, recentErrors } from './errors.js';

const MAX_PER_SESSION = 10;
const seen = new Set();
let sent = 0;

export const reportingOn = () => st.setting('report_errors', false) === true;

// "#/round/9f3c…/hole/3?r=…" → "#/round/:id/hole/3" (ไม่ส่งรหัสรอบหรือค่าใน query)
export function pageName(hash = globalThis.location?.hash || '') {
  return String(hash).split('?')[0].split('/')
    .map((s) => (s.length >= 12 && /^[\w-]+$/.test(s) && /\d/.test(s) ? ':id' : s))
    .join('/').slice(0, 120);
}

const device = () => String(globalThis.navigator?.userAgent || '').slice(0, 200);

async function post(body) {
  try {
    return await cloud.sendReport(body, !!cloud.session());
  } catch (err) {
    // โทเคนหมดอายุ/ออกจากระบบแล้ว → ส่งแบบไม่ระบุบัญชี
    if (cloud.session() && err?.status === 401) return cloud.sendReport(body, false);
    throw err;
  }
}

// ข้อผิดพลาดเดียวกันส่งครั้งเดียวต่อการเปิดแอป และไม่เกิน 10 รายการ
export async function sendError(item) {
  if (!cloud.enabled() || !reportingOn() || sent >= MAX_PER_SESSION || !item?.msg) return false;
  const key = `${item.where}|${item.msg}`;
  if (seen.has(key)) return false;
  seen.add(key);
  sent++;
  try {
    await post({ kind: 'error', message: `${item.where}: ${item.msg}`.slice(0, 2000), detail: item.stack || null, page: pageName(), app_version: APP_VERSION, device: device() });
    return true;
  } catch {
    return false;   // ส่งไม่ได้ก็ไม่เป็นไร ยังเก็บในเครื่องอยู่
  }
}

export async function sendFeedback(text, { contact = '', withErrors = false } = {}) {
  const detail = withErrors ? recentErrors().slice(0, 5).map((e) => `${e.t} ${e.where}: ${e.msg}`).join('\n').slice(0, 2000) || null : null;
  return post({
    kind: 'feedback', message: String(text).trim().slice(0, 2000), detail, page: pageName(),
    app_version: APP_VERSION, device: device(), contact: String(contact).trim().slice(0, 120) || null,
  });
}

export function initReports() {
  setReporter((item) => { sendError(item); });
}

export function _reset() { seen.clear(); sent = 0; }
