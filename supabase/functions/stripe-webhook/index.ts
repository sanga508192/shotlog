// รับแจ้งเหตุการณ์จาก Stripe แล้วเปิด/ปิดสิทธิ์สมาชิก
// deploy แบบ --no-verify-jwt เพราะ Stripe ไม่มี JWT ของ Supabase (ตรวจลายเซ็น Stripe แทน)
import { stripe, cryptoProvider, webhookDeps } from '../_shared/deps.ts';
import { handleStripeEvent } from '../_shared/billing.js';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature ?? '', Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '', undefined, cryptoProvider,
    );
  } catch (err) {
    console.warn('invalid signature', (err as Error).message);
    return new Response('invalid signature', { status: 400 });
  }
  try {
    const result = await handleStripeEvent(event, webhookDeps);
    console.log(event.type, event.id, JSON.stringify(result));
    return Response.json({ received: true, result });
  } catch (err) {
    console.error(event.type, event.id, err);
    return new Response('processing failed', { status: 500 });   // Stripe จะส่งซ้ำ
  }
});
