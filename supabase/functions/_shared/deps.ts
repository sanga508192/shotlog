// การเชื่อมต่อ Stripe และฐานข้อมูลสำหรับ Edge Functions (Deno)
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing secret ${name}`);
  return v;
};

export const stripe = new Stripe(env('STRIPE_SECRET_KEY'), { httpClient: Stripe.createFetchHttpClient() });
export const cryptoProvider = Stripe.createSubtleCryptoProvider();
export const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
export const APP_URL = env('APP_URL');
export const PRICES = { monthly: env('STRIPE_PRICE_MONTHLY'), yearly: env('STRIPE_PRICE_YEARLY') };

function check<T>(res: { data: T; error: { code?: string; message: string } | null }): T {
  if (res.error) throw new Error(`${res.error.code ?? ''} ${res.error.message}`);
  return res.data;
}

export async function getEntitlement(userId: string) {
  return check(await admin.from('entitlements').select('*').eq('user_id', userId).maybeSingle());
}

export async function customerFor(userId: string): Promise<string | null> {
  const row = check(await admin.from('billing_customers').select('stripe_customer_id').eq('user_id', userId).maybeSingle());
  return row?.stripe_customer_id ?? null;
}

// deps สำหรับ handleStripeEvent (ดู _shared/billing.js)
export const webhookDeps = {
  now: () => Date.now(),
  async markEvent(id: string, type: string) {
    const { error } = await admin.from('stripe_events').insert({ id, type });
    if (!error) return true;
    if (error.code === '23505') return false;   // เคยประมวลผลแล้ว
    throw new Error(error.message);
  },
  async unmarkEvent(id: string) {
    check(await admin.from('stripe_events').delete().eq('id', id));
  },
  getSubscription: (id: string) => stripe.subscriptions.retrieve(id),
  getEntitlement,
  async saveEntitlement(row: Record<string, unknown>) {
    const { error } = await admin.from('entitlements').upsert(row);
    if (error?.code === '23503') { console.warn('user deleted, skip entitlement', row.user_id); return; }
    if (error) throw new Error(error.message);
  },
  async saveCustomer(userId: string, customerId: string) {
    const { error } = await admin.from('billing_customers').upsert({ user_id: userId, stripe_customer_id: customerId });
    if (error && error.code !== '23503') throw new Error(error.message);
  },
  async userForCustomer(customerId: string) {
    const row = check(await admin.from('billing_customers').select('user_id').eq('stripe_customer_id', customerId).maybeSingle());
    return row?.user_id ?? null;
  },
};
