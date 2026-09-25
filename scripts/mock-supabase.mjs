// Supabase จำลองสำหรับพัฒนา/ทดสอบบนเครื่อง: ใช้ schema.sql จริงบน PGlite
// เลียนแบบเฉพาะ endpoint ที่แอปใช้ รหัส OTP คือ 123456 เสมอ
// ใช้: node scripts/mock-supabase.mjs แล้วตั้ง js/config.js เป็น http://localhost:54321 และ key ใดก็ได้
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { makeDb, asUser } from '../tests/helpers/pg.mjs';
import { handleStripeEvent, checkoutParams, isActiveSubscription, subscriptionTrialEnd } from '../supabase/functions/_shared/billing.js';

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

// ---------- Stripe จำลอง (หน้าชำระเงินและหน้าจัดการการสมัครแบบง่าย) ----------
const sessions = new Map();   // session id → { params, userId }
const subs = {};              // subscription id → object แบบ Stripe
const customers = new Map();  // user id → customer id
const DAY = 86400000;
const html = (body) => ({ status: 200, type: 'text/html; charset=utf-8', raw: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font:16px sans-serif;padding:16px;max-width:480px;margin:auto">${body}</body>` });
const redirect = (to) => ({ status: 302, headers: { Location: to }, body: null });

const sql = (q, p = []) => db.query(q, p).then((r) => r.rows);
const deps = {
  now: () => Date.now(),
  markEvent: async (id, type) => (await sql('insert into public.stripe_events (id, type) values ($1, $2) on conflict do nothing returning id', [id, type])).length > 0,
  unmarkEvent: (id) => sql('delete from public.stripe_events where id = $1', [id]),
  getSubscription: async (id) => subs[id],
  getEntitlement: async (uid) => (await sql('select * from public.entitlements where user_id = $1', [uid]))[0] ?? null,
  saveEntitlement: async (r) => sql(`insert into public.entitlements (user_id, plan, status, current_period_end, source, stripe_subscription_id, cancel_at_period_end, prepaid_until, updated_at)
      values ($1, $2, $3, $4, $5, $6, coalesce($7, false), $8, now())
      on conflict (user_id) do update set plan = excluded.plan, status = excluded.status, current_period_end = excluded.current_period_end,
        source = excluded.source, stripe_subscription_id = excluded.stripe_subscription_id, cancel_at_period_end = excluded.cancel_at_period_end,
        prepaid_until = excluded.prepaid_until, updated_at = now()`,
    [r.user_id, r.plan, r.status, r.current_period_end, r.source ?? null, r.stripe_subscription_id ?? null, r.cancel_at_period_end ?? false, r.prepaid_until ?? null]),
  saveCustomer: (uid, c) => sql('insert into public.billing_customers (user_id, stripe_customer_id) values ($1, $2) on conflict do nothing', [uid, c]),
  userForCustomer: async (c) => (await sql('select user_id from public.billing_customers where stripe_customer_id = $1', [c]))[0]?.user_id ?? null,
};
const event = (type, object) => handleStripeEvent({ id: `evt_${randomUUID()}`, type, data: { object } }, deps);

async function mockBilling(uid, body) {
  const ent = await deps.getEntitlement(uid);
  if (body.action === 'checkout') {
    if (body.plan !== 'promptpay_year' && isActiveSubscription(ent, Date.now())) return { status: 409, body: { error: 'already_subscribed' } };
    if (!customers.has(uid)) customers.set(uid, `cus_${uid.slice(0, 8)}`);
    const params = checkoutParams(body.plan, {
      userId: uid, customerId: customers.get(uid), appUrl: body.app_url || 'http://127.0.0.1:5173/',
      prices: { monthly: 'price_m', yearly: 'price_y' }, yearlyPrice: { currency: 'thb', unit_amount: 59000, product: 'prod' },
      trialEnd: body.plan === 'promptpay_year' ? null : subscriptionTrialEnd(ent, Date.now()),
    });
    const id = `cs_${randomUUID().slice(0, 8)}`;
    sessions.set(id, { params, userId: uid, plan: body.plan });
    return { status: 200, body: { url: `http://localhost:${PORT}/__mock/checkout?s=${id}` } };
  }
  if (body.action === 'portal') {
    if (!customers.has(uid)) return { status: 404, body: { error: 'no_customer' } };
    return { status: 200, body: { url: `http://localhost:${PORT}/__mock/portal?u=${uid}&r=${encodeURIComponent((body.app_url || '') + '#/account')}` } };
  }
  return { status: 400, body: { error: 'unknown_action' } };
}

async function mockPages(url) {
  const s = sessions.get(url.searchParams.get('s'));
  if (url.pathname === '/__mock/checkout') {
    if (!s) return html('ไม่พบ session');
    const trial = s.params.subscription_data?.trial_end;
    return html(`<h2>Stripe จำลอง</h2><p>แผน: <b>${s.plan}</b> (${s.params.mode})</p>
      ${trial ? `<p>เริ่มตัดเงิน: ${new Date(trial * 1000).toLocaleDateString('th-TH')}</p>` : ''}
      <p><a id="pay" href="/__mock/pay?s=${url.searchParams.get('s')}">✅ ชำระเงินสำเร็จ (จำลอง)</a></p>
      <p><a id="cancel" href="${s.params.cancel_url}">❌ ยกเลิก กลับไปแอป</a></p>`);
  }
  if (url.pathname === '/__mock/pay') {
    if (!s) return html('ไม่พบ session');
    const cus = s.params.customer;
    if (s.params.mode === 'subscription') {
      const id = `sub_${randomUUID().slice(0, 8)}`;
      const trialEnd = s.params.subscription_data.trial_end;
      const interval = s.plan === 'yearly' ? 'year' : 'month';
      const end = trialEnd ? trialEnd * 1000 : Date.now() + (interval === 'year' ? 365 : 30) * DAY;
      subs[id] = { id, customer: cus, status: trialEnd ? 'trialing' : 'active', cancel_at_period_end: false, metadata: { user_id: s.userId },
        items: { data: [{ current_period_end: Math.floor(end / 1000), price: { recurring: { interval } } }] } };
      await event('checkout.session.completed', { id: `cs_${id}`, mode: 'subscription', subscription: id, customer: cus, metadata: s.params.metadata, client_reference_id: s.userId });
    } else {
      await event('checkout.session.completed', { id: url.searchParams.get('s'), mode: 'payment', payment_status: 'paid', customer: cus, metadata: s.params.metadata, client_reference_id: s.userId });
    }
    return redirect(s.params.success_url);
  }
  if (url.pathname === '/__mock/portal') {
    const uid = url.searchParams.get('u');
    const mine = Object.values(subs).filter((x) => x.metadata.user_id === uid && x.status !== 'canceled');
    return html(`<h2>จัดการการสมัคร (จำลอง)</h2>${mine.map((x) => `<p>${x.id} · ${x.status} · ต่ออายุ: ${x.cancel_at_period_end ? 'ปิด' : 'เปิด'}
      <a id="toggle" href="/__mock/toggle?id=${x.id}&r=${encodeURIComponent(url.searchParams.get('r'))}">${x.cancel_at_period_end ? 'ต่ออายุอีกครั้ง' : 'ยกเลิกการต่ออายุ'}</a></p>`).join('') || '<p>ไม่มีการสมัครที่ใช้งานอยู่</p>'}
      <p><a id="back" href="${url.searchParams.get('r')}">กลับไปแอป</a></p>`);
  }
  if (url.pathname === '/__mock/toggle') {
    const x = subs[url.searchParams.get('id')];
    x.cancel_at_period_end = !x.cancel_at_period_end;
    await event('customer.subscription.updated', { id: x.id });
    return redirect(url.searchParams.get('r'));
  }
  return null;
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
    if (p === '/functions/v1/billing') return await mockBilling(uid, body);
    if (p === '/rest/v1/entitlements') {
      const r = await asUser(db, uid, 'select plan, status, current_period_end, prepaid_until, source, cancel_at_period_end from public.entitlements');
      return { status: 200, body: r.rows };
    }
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
    else if (url.pathname.startsWith('/__mock/')) out = (await mockPages(url)) ?? { status: 404, body: { message: 'not found' } };
    else out = await handle(req, body, url);
  } catch (e) {
    out = { status: 500, body: { message: e.message } };
  }
  console.log(req.method, url.pathname, out.status);
  res.writeHead(out.status, { 'Content-Type': out.type || 'application/json', ...(out.headers || {}) });
  res.end(out.raw ?? (out.body == null ? '' : JSON.stringify(out.body)));
}).listen(PORT, () => console.log(`mock supabase: http://localhost:${PORT}`));
