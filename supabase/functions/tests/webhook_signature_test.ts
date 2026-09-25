// ทดสอบบน Deno: ตรวจลายเซ็น webhook ของ Stripe แบบเดียวกับที่ stripe-webhook ใช้
// รัน: node_modules/.bin/deno test supabase/functions/tests
import Stripe from 'npm:stripe@17.7.0';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

const stripe = new Stripe('sk_test_dummy', { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();
const secret = 'whsec_test_secret';
const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } });

Deno.test('ลายเซ็นถูกต้อง → อ่านเหตุการณ์ได้', async () => {
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret, cryptoProvider: crypto });
  const event = await stripe.webhooks.constructEventAsync(payload, header, secret, undefined, crypto);
  assertEquals(event.id, 'evt_1');
});

Deno.test('secret ไม่ตรงหรือเนื้อหาถูกแก้ → ปฏิเสธ', async () => {
  const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret, cryptoProvider: crypto });
  await assertRejects(() => stripe.webhooks.constructEventAsync(payload, header, 'whsec_wrong', undefined, crypto));
  const tampered = payload.replace('cs_1', 'cs_hacked');
  await assertRejects(() => stripe.webhooks.constructEventAsync(tampered, header, secret, undefined, crypto));
});
