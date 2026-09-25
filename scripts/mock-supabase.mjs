// Supabase จำลองสำหรับพัฒนา/ทดสอบบนเครื่อง: ใช้ schema.sql จริงบน PGlite
// เลียนแบบเฉพาะ endpoint ที่แอปใช้ รหัส OTP คือ 123456 เสมอ
// ใช้: node scripts/mock-supabase.mjs แล้วตั้ง js/config.js เป็น http://localhost:54321 และ key ใดก็ได้
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { makeDb, asUser } from '../tests/helpers/pg.mjs';

const PORT = Number(process.env.PORT) || 54321;
const db = await makeDb();
const users = new Map();    // email → id
const tokens = new Map();   // token → user id

function issue(uid, email) {
  const access = `at-${randomUUID()}`;
  const refresh = `rt-${randomUUID()}`;
  tokens.set(access, uid);
  tokens.set(refresh, uid);
  return { access_token: access, refresh_token: refresh, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email } };
}

const pgError = (e) => ({ status: e.code === '42501' ? 403 : e.code === '28000' ? 401 : 400, body: { code: e.code, message: e.message } });

async function handle(req, body, url) {
  const auth = req.headers.authorization?.replace(/^Bearer /, '');
  const uid = tokens.get(auth) ?? null;
  const p = url.pathname;
  if (p === '/auth/v1/otp') return { status: 200, body: {} };
  if (p === '/auth/v1/verify') {
    if (body.token !== '123456') return { status: 403, body: { error_code: 'otp_expired', msg: 'Token has expired or is invalid' } };
    let id = users.get(body.email);
    if (!id) {
      id = randomUUID();
      users.set(body.email, id);
      await db.query('insert into auth.users (id, email) values ($1, $2)', [id, body.email]);
    }
    return { status: 200, body: issue(id, body.email) };
  }
  if (p === '/auth/v1/token') {
    const id = tokens.get(body.refresh_token);
    if (!id) return { status: 400, body: { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' } };
    const email = [...users].find(([, v]) => v === id)?.[0];
    return { status: 200, body: issue(id, email) };
  }
  if (p === '/auth/v1/logout') { tokens.delete(auth); return { status: 204, body: null }; }
  if (!uid) return { status: 401, body: { message: 'JWT expired or missing' } };
  try {
    if (p === '/rest/v1/rpc/push_records') {
      const r = await asUser(db, uid, 'select public.push_records($1::jsonb) as r', [JSON.stringify(body.items)]);
      return { status: 200, body: r.rows[0].r };
    }
    if (p === '/rest/v1/rpc/can_sync') return { status: 200, body: (await asUser(db, uid, 'select public.can_sync() as r')).rows[0].r };
    if (p === '/rest/v1/rpc/delete_my_account') { await asUser(db, uid, 'select public.delete_my_account()'); return { status: 204, body: null }; }
    if (p === '/rest/v1/records') {
      const gt = Number(url.searchParams.get('seq')?.replace('gt.', '')) || 0;
      const limit = Number(url.searchParams.get('limit')) || 1000;
      const r = await asUser(db, uid, 'select store, id, data, deleted, rev::int as rev, seq::int as seq from public.records where seq > $1 order by seq limit $2', [gt, limit]);
      return { status: 200, body: r.rows };
    }
  } catch (e) {
    return pgError(e);
  }
  return { status: 404, body: { message: `not mocked: ${p}` } };
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const url = new URL(req.url, 'http://x');
  let out;
  try {
    const body = raw ? JSON.parse(raw) : {};
    // สำหรับทดสอบ: รัน SQL ตรง (เช่น จำลองอีกเครื่องแก้ข้อมูล หรือปิด open_beta)
    if (url.pathname === '/__admin/sql') out = { status: 200, body: (await db.query(body.sql, body.params || [])).rows };
    else out = await handle(req, body, url);
  } catch (e) {
    out = { status: 500, body: { message: e.message } };
  }
  console.log(req.method, url.pathname, out.status);
  res.writeHead(out.status, { 'Content-Type': 'application/json' });
  res.end(out.body == null ? '' : JSON.stringify(out.body));
}).listen(PORT, () => console.log(`mock supabase: http://localhost:${PORT}`));
