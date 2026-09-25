// ทดสอบตรรกะรับเหตุการณ์จาก Stripe (supabase/functions/_shared/billing.js) ด้วย deps จำลอง
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleStripeEvent, checkoutParams, entitlementFromSubscription, extendPrepaid, subscriptionPeriodEnd, subscriptionTrialEnd,
} from '../supabase/functions/_shared/billing.js';

const DAY = 86400000;
const NOW = Date.parse('2026-10-01T00:00:00Z');
const U = 'user-1';

function fakeDeps({ subs = {}, entitlement = null, failSave = 0 } = {}) {
  const d = {
    events: new Set(), ents: new Map(entitlement ? [[U, entitlement]] : []), customers: new Map(), subs, failSave,
    now: () => NOW,
    markEvent: async (k) => (d.events.has(k) ? false : (d.events.add(k), true)),
    unmarkEvent: async (k) => { d.events.delete(k); },
    getSubscription: async (id) => d.subs[id],
    getEntitlement: async (uid) => d.ents.get(uid) ?? null,
    saveEntitlement: async (row) => {
      if (d.failSave > 0) { d.failSave--; throw new Error('db down'); }
      d.ents.set(row.user_id, row);
    },
    saveCustomer: async (uid, c) => { d.customers.set(uid, c); },
    userForCustomer: async (c) => [...d.customers].find(([, v]) => v === c)?.[0] ?? null,
  };
  return d;
}

const sub = (over = {}) => ({
  id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, metadata: { user_id: U },
  items: { data: [{ current_period_end: (NOW + 30 * DAY) / 1000, price: { recurring: { interval: 'month' } } }] },
  ...over,
});
const ev = (id, type, object) => ({ id, type, data: { object } });
const promptpaySession = (id = 'cs_pp', over = {}) => ({
  id, mode: 'payment', payment_status: 'paid', customer: 'cus_1', client_reference_id: U,
  metadata: { user_id: U, kind: 'promptpay_year' }, ...over,
});

test('สมัครตัดบัตรรายเดือนสำเร็จ → active จนถึงสิ้นรอบ', async () => {
  const d = fakeDeps({ subs: { sub_1: sub() } });
  await handleStripeEvent(ev('evt_1', 'checkout.session.completed',
    { id: 'cs_1', mode: 'subscription', subscription: 'sub_1', customer: 'cus_1', metadata: { user_id: U } }), d);
  const e = d.ents.get(U);
  assert.deepEqual([e.plan, e.status, e.source, e.stripe_subscription_id], ['monthly', 'active', 'stripe_subscription', 'sub_1']);
  assert.equal(e.current_period_end, new Date(NOW + 30 * DAY).toISOString());
  assert.equal(d.customers.get(U), 'cus_1');
});

test('เหตุการณ์ซ้ำจาก Stripe ไม่ประมวลผลซ้ำ', async () => {
  const d = fakeDeps();
  const e = ev('evt_pp', 'checkout.session.completed', promptpaySession());
  await handleStripeEvent(e, d);
  const first = d.ents.get(U).prepaid_until;
  assert.deepEqual(await handleStripeEvent(e, d), { duplicate: true });
  assert.equal(d.ents.get(U).prepaid_until, first);
});

test('PromptPay รายปี: ได้ 365 วัน, ต่ออายุก่อนหมดไม่เสียวันที่เหลือ', async () => {
  const d = fakeDeps();
  await handleStripeEvent(ev('evt_a', 'checkout.session.completed', promptpaySession('cs_a')), d);
  assert.equal(d.ents.get(U).prepaid_until, new Date(NOW + 365 * DAY).toISOString());
  assert.equal(d.ents.get(U).source, 'promptpay');
  await handleStripeEvent(ev('evt_b', 'checkout.session.completed', promptpaySession('cs_b')), d);
  assert.equal(d.ents.get(U).prepaid_until, new Date(NOW + 730 * DAY).toISOString());
});

test('PromptPay ที่ยังไม่ชำระ รอเหตุการณ์ async_payment_succeeded และไม่ต่ออายุซ้ำจาก session เดียวกัน', async () => {
  const d = fakeDeps();
  const r = await handleStripeEvent(ev('evt_c', 'checkout.session.completed', promptpaySession('cs_c', { payment_status: 'unpaid' })), d);
  assert.deepEqual(r, { pending: true });
  assert.equal(d.ents.get(U), undefined);
  await handleStripeEvent(ev('evt_d', 'checkout.session.async_payment_succeeded', promptpaySession('cs_c')), d);
  await handleStripeEvent(ev('evt_e', 'checkout.session.async_payment_succeeded', promptpaySession('cs_c')), d);
  assert.equal(d.ents.get(U).prepaid_until, new Date(NOW + 365 * DAY).toISOString());
});

test('ทดลองฟรีอยู่แล้วจ่าย PromptPay → ปีที่จ่ายเริ่มนับต่อจากวันทดลองหมด', async () => {
  const trial = { user_id: U, plan: 'trial', status: 'trialing', source: 'trial', current_period_end: new Date(NOW + 10 * DAY).toISOString() };
  const d = fakeDeps({ entitlement: trial });
  await handleStripeEvent(ev('evt_f', 'checkout.session.completed', promptpaySession('cs_f')), d);
  const e = d.ents.get(U);
  assert.equal(e.current_period_end, trial.current_period_end);
  assert.equal(e.prepaid_until, new Date(NOW + 375 * DAY).toISOString());
});

test('สมัครตัดบัตรระหว่างทดลอง/มี PromptPay เหลือ → เริ่มตัดเงินเมื่อสิทธิ์เดิมหมด', () => {
  const trial = { source: 'trial', status: 'trialing', current_period_end: new Date(NOW + 10 * DAY).toISOString() };
  assert.equal(subscriptionTrialEnd(trial, NOW), (NOW + 10 * DAY) / 1000);
  assert.equal(subscriptionTrialEnd({ ...trial, prepaid_until: new Date(NOW + 200 * DAY).toISOString() }, NOW), (NOW + 200 * DAY) / 1000);
  assert.equal(subscriptionTrialEnd({ ...trial, current_period_end: new Date(NOW + DAY).toISOString() }, NOW), null, 'เหลือไม่ถึง 48 ชม. ตัดเลย');
  assert.equal(subscriptionTrialEnd({ source: 'trial', status: 'trialing', current_period_end: new Date(NOW - DAY).toISOString() }, NOW), null);
  assert.equal(subscriptionTrialEnd(null, NOW), null);
  const p = checkoutParams('yearly', { userId: U, customerId: 'c', appUrl: 'https://a/', prices: { yearly: 'py' }, trialEnd: 123 });
  assert.equal(p.subscription_data.trial_end, 123);
  assert.equal(checkoutParams('yearly', { userId: U, customerId: 'c', appUrl: 'https://a/', prices: { yearly: 'py' } }).subscription_data.trial_end, undefined);
});

test('ยกเลิกตอนสิ้นรอบ → ยัง active แต่ cancel_at_period_end; ถูกลบ → canceled', async () => {
  const d = fakeDeps({ subs: { sub_1: sub({ cancel_at_period_end: true }) } });
  await handleStripeEvent(ev('evt_g', 'customer.subscription.updated', { id: 'sub_1' }), d);
  assert.deepEqual([d.ents.get(U).status, d.ents.get(U).cancel_at_period_end], ['active', true]);
  d.subs.sub_1 = sub({ status: 'canceled' });
  await handleStripeEvent(ev('evt_h', 'customer.subscription.deleted', { id: 'sub_1' }), d);
  assert.equal(d.ents.get(U).status, 'canceled');
});

test('ยกเลิกการสมัครแล้วแต่เคยจ่าย PromptPay ไว้ → prepaid_until ยังอยู่', async () => {
  const d = fakeDeps({ subs: { sub_1: sub({ status: 'canceled' }) },
    entitlement: { user_id: U, plan: 'monthly', status: 'active', source: 'stripe_subscription', stripe_subscription_id: 'sub_1', prepaid_until: new Date(NOW + 100 * DAY).toISOString() } });
  await handleStripeEvent(ev('evt_i', 'customer.subscription.deleted', { id: 'sub_1' }), d);
  assert.equal(d.ents.get(U).status, 'canceled');
  assert.equal(d.ents.get(U).prepaid_until, new Date(NOW + 100 * DAY).toISOString());
});

test('เหตุการณ์มาไม่เรียง: ใช้สถานะล่าสุดที่ดึงจาก Stripe ไม่ใช่ข้อมูลในเหตุการณ์', async () => {
  const d = fakeDeps({ subs: { sub_1: sub({ status: 'canceled' }) } });
  // เหตุการณ์ "created" ที่มาถึงช้า มีข้อมูลเก่าว่า active แต่ Stripe บอกว่าถูกยกเลิกแล้ว
  await handleStripeEvent(ev('evt_j', 'customer.subscription.created', { id: 'sub_1', status: 'active' }), d);
  assert.equal(d.ents.get(U).status, 'canceled');
});

test('การสมัครเก่าถูกยกเลิกหลังสมัครใหม่แล้ว ไม่ทำให้สิทธิ์ของอันใหม่หาย', async () => {
  const d = fakeDeps({ subs: { sub_old: sub({ id: 'sub_old', status: 'canceled' }) },
    entitlement: { user_id: U, plan: 'yearly', status: 'active', source: 'stripe_subscription', stripe_subscription_id: 'sub_new', current_period_end: new Date(NOW + 300 * DAY).toISOString() } });
  const r = await handleStripeEvent(ev('evt_k', 'customer.subscription.deleted', { id: 'sub_old' }), d);
  assert.deepEqual(r, { ignored: 'stale_subscription' });
  assert.equal(d.ents.get(U).stripe_subscription_id, 'sub_new');
});

test('หา user จาก customer เมื่อ subscription ไม่มี metadata', async () => {
  const d = fakeDeps({ subs: { sub_1: sub({ metadata: {} }) } });
  d.customers.set(U, 'cus_1');
  await handleStripeEvent(ev('evt_l', 'customer.subscription.updated', { id: 'sub_1' }), d);
  assert.equal(d.ents.get(U).status, 'active');
});

test('บันทึกไม่สำเร็จ → ยกเลิกการจำเหตุการณ์ Stripe ส่งซ้ำแล้วได้สิทธิ์ครบ', async () => {
  const d = fakeDeps({ failSave: 1 });
  const e = ev('evt_m', 'checkout.session.completed', promptpaySession('cs_m'));
  await assert.rejects(handleStripeEvent(e, d), /db down/);
  assert.equal(d.events.size, 0, 'ต้องไม่จำทั้ง event และ session');
  await handleStripeEvent(e, d);
  assert.equal(d.ents.get(U).prepaid_until, new Date(NOW + 365 * DAY).toISOString());
});

test('เหตุการณ์อื่นไม่สนใจ', async () => {
  const d = fakeDeps();
  assert.deepEqual(await handleStripeEvent(ev('evt_n', 'invoice.created', {}), d), { ignored: 'invoice.created' });
  assert.equal(d.events.size, 0);
});

test('รองรับ current_period_end ทั้งแบบ Stripe API เก่าและใหม่ และรายปี', () => {
  assert.equal(subscriptionPeriodEnd({ current_period_end: 100 }), 100000);
  assert.equal(subscriptionPeriodEnd({ items: { data: [{ current_period_end: 50 }, { current_period_end: 70 }] } }), 70000);
  const y = entitlementFromSubscription(sub({ items: { data: [{ current_period_end: 1, price: { recurring: { interval: 'year' } } }] } }));
  assert.equal(y.plan, 'yearly');
  assert.equal(entitlementFromSubscription(sub({ status: 'unpaid' })).status, 'canceled');
  assert.equal(extendPrepaid({ prepaid_until: new Date(NOW - DAY).toISOString() }, NOW, 1), new Date(NOW + DAY).toISOString());
});

test('หน้าชำระเงิน: บัตรเป็นแบบสมัครสมาชิก, PromptPay จ่ายครั้งเดียวราคาเท่ารายปี', () => {
  const ctx = { userId: U, customerId: 'cus_1', appUrl: 'https://x.github.io/shotlog/', prices: { monthly: 'price_m', yearly: 'price_y' },
    yearlyPrice: { currency: 'thb', unit_amount: 59000, product: 'prod_1' } };
  const m = checkoutParams('monthly', ctx);
  assert.deepEqual([m.mode, m.line_items[0].price, m.payment_method_types[0]], ['subscription', 'price_m', 'card']);
  assert.equal(m.subscription_data.metadata.user_id, U);
  assert.equal(m.success_url, 'https://x.github.io/shotlog/#/account?paid=1');
  const p = checkoutParams('promptpay_year', ctx);
  assert.deepEqual([p.mode, p.payment_method_types[0], p.line_items[0].price_data.unit_amount], ['payment', 'promptpay', 59000]);
  assert.equal(p.metadata.kind, 'promptpay_year');
  assert.throws(() => checkoutParams('lifetime', ctx), /unknown plan/);
});
