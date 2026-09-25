// ค่าจาก Supabase Dashboard → Project Settings → API
// anon key เป็นค่าสาธารณะ ใส่ในโค้ดได้ (สิทธิ์จริงคุมด้วย RLS ใน supabase/schema.sql)
// ห้ามใส่ service_role key ในไฟล์นี้
// ปล่อยว่างไว้ = ปิดบริการคลาวด์ แอปทำงานแบบเก็บในเครื่องอย่างเดียว
export const SUPABASE_URL = 'https://erycbfpvfhehhsskxtrf.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_aoOQe9Z0N_a6M_hzpOjNCg_yhPdNbyL';

// ระบบสมาชิก (ขั้นที่ 2): เปิดเมื่อ deploy Edge Functions และตั้งค่า Stripe แล้ว
export const BILLING_ENABLED = false;
// ราคาสำหรับแสดงในแอปเท่านั้น ราคาที่เก็บจริงมาจาก Stripe (แก้ใน Stripe แล้วต้องแก้ตรงนี้ให้ตรงกัน)
export const PRICE_TEXT = { monthly: '59 บาท/เดือน', yearly: '590 บาท/ปี' };
