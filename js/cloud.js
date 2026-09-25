// ติดต่อ Supabase ด้วย fetch ตรง ๆ (ไม่พึ่งไลบรารี เพื่อให้แอปทั้งก้อนเก็บในเครื่องได้)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as st from './state.js';

export const enabled = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const session = () => st.meta('session');

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.msg || body?.message || body?.error_description || body?.error || `HTTP ${status}`);
    this.status = status;
    this.code = body?.code || body?.error_code || null;
  }
}

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${await accessToken()}`;
  const res = await fetch(SUPABASE_URL.replace(/\/$/, '') + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

function toSession(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at ?? Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    user: { id: d.user.id, email: d.user.email },
  };
}

export async function saveSession(s) {
  await st.commit([s ? { store: 'meta', put: { key: 'session', value: s } } : { store: 'meta', del: 'session' }], { raw: true });
}

let refreshing = null;
async function accessToken() {
  const s = session();
  if (!s) throw new ApiError(401, { code: 'no_session', message: 'ยังไม่ได้เข้าสู่ระบบ' });
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  refreshing ??= (async () => {
    try {
      const d = await req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: s.refresh_token } });
      const ns = toSession(d);
      await saveSession(ns);
      return ns;
    } catch (err) {
      // refresh token หมดอายุหรือถูกยกเลิก → ต้องเข้าสู่ระบบใหม่ (ข้อมูลในเครื่องยังอยู่)
      if (err.status === 400 || err.status === 401) {
        await saveSession(null);
        throw new ApiError(401, { code: 'session_expired', message: 'หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่' });
      }
      throw err;
    } finally {
      refreshing = null;
    }
  })();
  return (await refreshing).access_token;
}

// ส่งรหัส 6 หลักทางอีเมล (ใช้รหัสแทนลิงก์ เพราะลิงก์จะเปิดในเบราว์เซอร์ ไม่ใช่ในแอปที่ติดตั้งบน iPhone)
export const sendCode = (email) =>
  req('/auth/v1/otp', { method: 'POST', auth: false, body: { email, create_user: true } });

export async function verifyCode(email, token) {
  return toSession(await req('/auth/v1/verify', { method: 'POST', auth: false, body: { type: 'email', email, token } }));
}

export async function signOut() {
  try { await req('/auth/v1/logout', { method: 'POST' }); } catch { /* ออฟไลน์ก็ออกจากระบบในเครื่องได้ */ }
  await saveSession(null);
}

export const push = (items) => req('/rest/v1/rpc/push_records', { method: 'POST', body: { items } });
export const pull = (cursor, limit) =>
  req(`/rest/v1/records?select=store,id,data,deleted,rev,seq&seq=gt.${Number(cursor) || 0}&order=seq.asc&limit=${limit}`);
export const canSync = () => req('/rest/v1/rpc/can_sync', { method: 'POST', body: {} });
export const deleteAccount = () => req('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} });

// ---------- สมาชิก ----------

export async function entitlement() {
  const rows = await req('/rest/v1/entitlements?select=plan,status,current_period_end,prepaid_until,source,cancel_at_period_end');
  return rows?.[0] ?? null;
}

// action: 'checkout' (plan: monthly | yearly | promptpay_year) หรือ 'portal' → คืน { url }
export async function billing(action, extra = {}) {
  const appUrl = globalThis.location ? location.origin + location.pathname : undefined;
  return req('/functions/v1/billing', { method: 'POST', body: { action, app_url: appUrl, ...extra } });
}
