// สร้างหน้าชำระเงิน (Checkout) และหน้าจัดการการสมัคร (Customer Portal) ให้ผู้ใช้ที่เข้าสู่ระบบแล้ว
// deploy แบบ --no-verify-jwt แล้วตรวจ token เองกับ Supabase Auth
import type Stripe from 'npm:stripe@17.7.0';
import { stripe, admin, APP_URL, PRICES, getEntitlement, customerFor } from '../_shared/deps.ts';
import { checkoutParams, isActiveSubscription, subscriptionTrialEnd, PLANS } from '../_shared/billing.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

// ให้กลับมาที่หน้าที่เรียกได้ เฉพาะเว็บจริงหรือเครื่องที่ใช้พัฒนา
function returnUrl(requested: unknown) {
  if (typeof requested !== 'string') return APP_URL;
  try {
    const u = new URL(requested);
    const allowed = [new URL(APP_URL).origin, 'http://localhost:5173', 'http://127.0.0.1:5173'];
    return allowed.includes(u.origin) ? u.origin + u.pathname : APP_URL;
  } catch {
    return APP_URL;
  }
}

async function ensureCustomer(user: { id: string; email?: string }) {
  const existing = await customerFor(user.id);
  if (existing) return existing;
  const customer = await stripe.customers.create(
    { email: user.email, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` },   // กดรัว ๆ ไม่ได้ลูกค้าซ้ำ
  );
  const { error } = await admin.from('billing_customers').upsert({ user_id: user.id, stripe_customer_id: customer.id });
  if (error) throw new Error(error.message);
  return customer.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ error: 'unauthorized' }, 401);
    const user = data.user;
    const body = await req.json().catch(() => ({}));
    const appUrl = returnUrl(body.app_url);

    if (body.action === 'checkout') {
      if (!PLANS.includes(body.plan)) return json({ error: 'unknown_plan' }, 400);
      const ent = await getEntitlement(user.id);
      if (body.plan !== 'promptpay_year' && isActiveSubscription(ent, Date.now())) {
        return json({ error: 'already_subscribed' }, 409);
      }
      const customerId = await ensureCustomer(user);
      const yearlyPrice = body.plan === 'promptpay_year' ? await stripe.prices.retrieve(PRICES.yearly) : null;
      const trialEnd = body.plan === 'promptpay_year' ? null : subscriptionTrialEnd(ent, Date.now());
      const session = await stripe.checkout.sessions.create(
        checkoutParams(body.plan, { userId: user.id, customerId, appUrl, prices: PRICES, yearlyPrice, trialEnd }) as Stripe.Checkout.SessionCreateParams,
      );
      return json({ url: session.url });
    }

    if (body.action === 'portal') {
      const customerId = await customerFor(user.id);
      if (!customerId) return json({ error: 'no_customer' }, 404);
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId, return_url: `${appUrl}#/account`, locale: 'th',
      });
      return json({ url: session.url });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: 'server_error', message: (err as Error).message }, 500);
  }
});
