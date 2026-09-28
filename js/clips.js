// คลิปสอนของแบบฝึก: ปุ่มค้นหาใน YouTube (ลิงก์ค้นหาไม่มีวันเสีย) และคลิปที่ผู้ใช้เก็บไว้เอง
// คลิปที่เก็บอยู่ในค่าตั้ง drill_clips = { [รหัสแบบฝึก]: [{ url, title, embed, added_at }] } ซิงก์ไปกับบัญชี
import * as st from './state.js';

export const CLIPS_KEY = 'drill_clips';
export const MAX_CLIPS = 5;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];

// เวลาเริ่มในลิงก์: "90" "90s" "1m30s" "1h2m3s" → วินาที
export function parseStart(t) {
  if (!t) return 0;
  const s = String(t).trim();
  if (/^\d+s?$/.test(s)) return parseInt(s, 10);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

// ลิงก์ที่วางมา (หรือข้อความแชร์ที่มีลิงก์อยู่ข้างใน) → คลิป YouTube หรือลิงก์ทั่วไป · ไม่ใช่ http(s) → null
export function parseClip(input) {
  const raw = String(input ?? '').trim();
  const found = raw.match(/https?:\/\/[^\s<>"']+/i)?.[0]
    ?? (/^((www|m)\.)?(youtube\.com|youtu\.be)\//i.test(raw) ? `https://${raw.split(/\s/)[0]}` : null);
  if (!found) return null;
  let u;
  try { u = new URL(found); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  if (YT_HOSTS.includes(host)) {
    const id = host === 'youtu.be' ? u.pathname.split('/')[1]
      : u.pathname === '/watch' ? u.searchParams.get('v')
        : u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/)?.[1];
    if (id && YT_ID.test(id)) {
      const start = parseStart(u.searchParams.get('t') || u.searchParams.get('start'));
      return { kind: 'youtube', id, start, host: 'youtube.com', url: `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}` };
    }
  }
  return { kind: 'link', url: u.href, host };
}

export const searchUrl = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
export const embedUrl = (c) => `https://www.youtube-nocookie.com/embed/${c.id}?rel=0&playsinline=1&autoplay=1${c.start ? `&start=${c.start}` : ''}`;
export const thumbUrl = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

function stored() {
  const v = st.setting(CLIPS_KEY, null);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

// คลิปของแบบฝึกนี้ ตรวจลิงก์ใหม่ทุกครั้ง ข้อมูลที่เสียถูกข้ามไป
export function clipsOf(drillId) {
  const list = stored()[drillId];
  if (!Array.isArray(list)) return [];
  return list.flatMap((c) => {
    const p = parseClip(c?.url);
    if (!p) return [];
    return [{ ...p, title: typeof c.title === 'string' ? c.title.slice(0, 150) : '', embed: c.embed !== false, added_at: c.added_at ?? null }];
  }).slice(0, MAX_CLIPS);
}

const toStore = (c) => ({ url: c.url, title: c.title || '', embed: c.embed !== false, added_at: c.added_at ?? null });

export async function addClip(drillId, clip, { title = '', embed = true } = {}) {
  const list = clipsOf(drillId);
  if (list.some((c) => c.url === clip.url)) return 'dup';
  if (list.length >= MAX_CLIPS) return 'full';
  list.push({ ...clip, title: String(title).trim().slice(0, 150), embed, added_at: st.nowIso() });
  await st.setSetting(CLIPS_KEY, { ...stored(), [drillId]: list.map(toStore) });
  return 'ok';
}

export async function removeClip(drillId, url) {
  const list = clipsOf(drillId).filter((c) => c.url !== url);
  const all = { ...stored() };
  if (list.length) all[drillId] = list.map(toStore);
  else delete all[drillId];
  await st.setSetting(CLIPS_KEY, all);
}

// ชื่อคลิปจาก YouTube (oEmbed) · 401 = เจ้าของปิดการเล่นนอก YouTube → เปิดในแอป YouTube แทน
export async function fetchMeta(clip, { timeoutMs = 6000 } = {}) {
  if (clip.kind !== 'youtube') return { title: '', embed: false };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(clip.url)}`, { signal: ctl.signal });
    if (!r.ok) return { title: '', embed: r.status !== 401 };
    const j = await r.json();
    return { title: typeof j?.title === 'string' ? j.title : '', embed: true };
  } catch {
    return { title: '', embed: true };
  } finally {
    clearTimeout(timer);
  }
}
