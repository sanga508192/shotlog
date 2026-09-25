// ตรรกะการชำระเงินล้วน ๆ ใช้ร่วมกันใน Edge Functions (Deno) และชุดทดสอบ (Node)
// ไม่เรียก Stripe หรือฐานข้อมูลเอง ส่วนนั้นส่งเข้ามาผ่าน deps

export const PLANS = ['monthly', 'yearly', 'promptpay_year'];
export const PREPAID_DAYS = 365;
const DAY = 24 * 60 * 60 * 1000;

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const ms = (v) => (v == null ? null : new Date(v).getTime());

// Stripe ย้าย current_period_end ไปไว้ที่ subscription item ใน API รุ่นใหม่ จึงรองรับทั้งสองแบบ
export function subscriptionPeriodEnd(sub) {
  if (sub.current_period_end) return sub.current_period_end * 1000;
  const ends = (sub.items?.data || []).map((i) => i.current_period_end).filter(Boolean);
  return ends.length ? Math.max(...ends) * 1000 : null;
}

export function mapSubscriptionStatus(s) {
  if (s === 'active' || s === 'trialing' || s === 'past_due' || s === 'incomplete') return s;
  return 'canceled';   // canceled, unpaid, incomplete_expired, paused
}

export function entitlementFromSubscription(sub) {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  return {
    plan: interval === 'year' ? 'yearly' : 'monthly',
    status: mapSubscriptionStatus(sub.status),
    current_period_end: iso(subscriptionPeriodEnd(sub)),
    source: 'stripe_subscription',
    stripe_subscription_id: sub.id,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end || sub.cancel_at),
  };
}

// วันที่สิทธิ์ปัจจุบัน (ทดลองฟรีหรือจ่ายล่วงหน้า) หมด ถ้ายังไม่หมด
export function currentAccessEnd(e, now) {
  const ends = [];
  if (e?.source === 'trial' && e.status === 'trialing' && ms(e.current_period_end) > now) ends.push(ms(e.current_period_end));
  if (ms(e?.prepaid_until) > now) ends.push(ms(e.prepaid_until));
  return ends.length ? Math.max(...ends) : null;
}

// จ่ายล่วงหน้าต่อจากวันที่สิทธิ์ปัจจุบันหมด (ต่ออายุก่อนหมดหรือจ่ายระหว่างทดลอง ไม่เสียวันที่เหลือ)
export function extendPrepaid(existing, now, days = PREPAID_DAYS) {
  const start = currentAccessEnd(existing, now) ?? now;
  return iso(start + days * DAY);
}

// สมัครตัดบัตรระหว่างที่ยังมีสิทธิ์อยู่ → เริ่มตัดเงินเมื่อสิทธิ์เดิมหมด
// Stripe ต้องการ trial_end อย่างน้อย 48 ชั่วโมงข้างหน้า และไม่เกิน 730 วัน
export function subscriptionTrialEnd(existing, now) {
  const end = currentAccessEnd(existing, now);
  if (!end || end < now + 2 * DAY) return null;
  return Math.floor(Math.min(end, now + 730 * DAY) / 1000);
}

export function isActiveSubscription(e, now) {
  return Boolean(e && e.source === 'stripe_subscription'
    && ['active', 'trialing', 'past_due'].includes(e.status)
    && (!e.current_period_end || ms(e.current_period_end) > now));
}

// ---------- สร้างหน้าชำระเงิน ----------

/**
 * @param {string} plan
 * @param {{ userId: string, customerId: string, appUrl: string, prices: Record<string, string>,
 *           yearlyPrice?: any, trialEnd?: number | null }} ctx
 */
export function checkoutParams(plan, { userId, customerId, appUrl, prices, yearlyPrice = null, trialEnd = null }) {
  if (!PLANS.includes(plan)) throw new Error(`unknown plan: ${plan}`);
  const base = {
    customer: customerId,
    client_reference_id: userId,
    locale: 'th',
    success_url: `${appUrl}#/account?paid=1`,
    cancel_url: `${appUrl}#/account`,
    metadata: { user_id: userId, kind: plan },
  };
  if (plan === 'promptpay_year') {
    // ใช้ราคาเดียวกับรายปีแบบตัดบัตร แต่จ่ายครั้งเดียว (PromptPay ตัดอัตโนมัติไม่ได้)
    return {
      ...base,
      mode: 'payment',
      payment_method_types: ['promptpay'],
      line_items: [{
        quantity: 1,
        price_data: { currency: yearlyPrice.currency, unit_amount: yearlyPrice.unit_amount, product: yearlyPrice.product },
      }],
      payment_intent_data: { metadata: { user_id: userId, kind: plan } },
    };
  }
  return {
    ...base,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: prices[plan], quantity: 1 }],
    subscription_data: { metadata: { user_id: userId }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
    allow_promotion_codes: true,
  };
}

// ---------- รับเหตุการณ์จาก Stripe ----------
// deps: markEvent(key, type) → true ถ้าเพิ่งเห็นครั้งแรก, unmarkEvent(key),
//       getSubscription(id), getEntitlement(userId), saveEntitlement(row),
//       saveCustomer(userId, customerId), userForCustomer(customerId), now()

export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

async function upsert(deps, userId, patch) {
  const existing = await deps.getEntitlement(userId);
  const row = {
    plan: 'yearly',
    status: 'none',
    current_period_end: null,
    ...existing,
    ...patch,
    user_id: userId,
    updated_at: iso(deps.now()),
  };
  await deps.saveEntitlement(row);
  return row;
}

async function applySubscription(deps, subId, fallbackUserId) {
  // ดึงสถานะล่าสุดจาก Stripe เสมอ กันเหตุการณ์มาไม่เรียงลำดับแล้วทับสถานะใหม่ด้วยของเก่า
  const sub = await deps.getSubscription(subId);
  const userId = sub.metadata?.user_id || fallbackUserId || await deps.userForCustomer(sub.customer);
  if (!userId) return { ignored: 'no_user' };
  const existing = await deps.getEntitlement(userId);
  // การสมัครเก่าที่ถูกแทนด้วยการสมัครใหม่แล้ว ไม่ควรลบสิทธิ์ของอันใหม่
  if (existing?.stripe_subscription_id && existing.stripe_subscription_id !== sub.id
    && isActiveSubscription(existing, deps.now()) && mapSubscriptionStatus(sub.status) === 'canceled') {
    return { ignored: 'stale_subscription' };
  }
  const row = await upsert(deps, userId, entitlementFromSubscription(sub));
  return { userId, status: row.status };
}

export async function handleStripeEvent(event, deps) {
  if (!HANDLED_EVENTS.includes(event.type)) return { ignored: event.type };
  if (!(await deps.markEvent(event.id, event.type))) return { duplicate: true };
  const marked = [event.id];
  try {
    const obj = event.data.object;
    if (event.type.startsWith('checkout.session.')) {
      const userId = obj.metadata?.user_id || obj.client_reference_id;
      if (!userId) return { ignored: 'no_user' };
      if (obj.customer) await deps.saveCustomer(userId, obj.customer);
      if (obj.mode === 'payment' && obj.metadata?.kind === 'promptpay_year') {
        if (obj.payment_status !== 'paid') return { pending: true };   // รอ async_payment_succeeded
        // กันต่ออายุซ้ำจาก session เดียวกัน (completed + async_succeeded)
        if (!(await deps.markEvent(`session:${obj.id}`, 'prepaid'))) return { duplicate: true };
        marked.push(`session:${obj.id}`);
        const existing = await deps.getEntitlement(userId);
        const row = await upsert(deps, userId, {
          prepaid_until: extendPrepaid(existing, deps.now()),
          ...(isActiveSubscription(existing, deps.now()) ? {} : { plan: 'yearly', source: 'promptpay' }),
        });
        return { userId, prepaid_until: row.prepaid_until };
      }
      if (obj.mode === 'subscription' && obj.subscription) return applySubscription(deps, obj.subscription, userId);
      return { ignored: 'checkout_mode' };
    }
    return applySubscription(deps, obj.id, null);
  } catch (err) {
    for (const key of marked) await deps.unmarkEvent(key);   // ให้ Stripe ส่งซ้ำแล้วลองใหม่ได้ครบ
    throw err;
  }
}
