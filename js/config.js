// ค่าจาก Supabase Dashboard → Project Settings → API
// anon key เป็นค่าสาธารณะ ใส่ในโค้ดได้ (สิทธิ์จริงคุมด้วย RLS ใน supabase/schema.sql)
// ห้ามใส่ service_role key ในไฟล์นี้
// ปล่อยว่างไว้ = ปิดบริการคลาวด์ แอปทำงานแบบเก็บในเครื่องอย่างเดียว
export const SUPABASE_URL = 'https://erycbfpvfhehhsskxtrf.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_aoOQe9Z0N_a6M_hzpOjNCg_yhPdNbyL';

// ภาพดาวเทียมของแผนที่หลุม: ใส่ API key ของ ArcGIS Location Platform ก่อนเปิดให้คนทั่วไปใช้/เก็บเงิน
// (ปล่อยว่าง = ใช้บริการสาธารณะของ Esri ซึ่งไม่อนุญาตให้ใช้เชิงพาณิชย์)
// key นี้อยู่ในโค้ดฝั่งเครื่องผู้ใช้ จึงต้องจำกัดใน ArcGIS: สิทธิ์เฉพาะ Basemaps และ Referrer เฉพาะโดเมนของแอป
// คีย์ "ShotLog satellite tiles" (สิทธิ์ Basemap styles service, Referrer: sanga508192.github.io, localhost:5173) หมดอายุ 28 ก.ย. 2570
export const ESRI_API_KEY = 'AAPTaqoVJ-vWeI55ff3HQhvLGAw..yq-XBLSgyu9ssoM5tZhbdj67bXBLiEAvzKv21O5xoDr9mjn4V4oIeWkf6rVSvAp-maJHkBSwVvC9Nuv0w4UkFgRUXQKTfAceXMCtOiX5Ck508_-RWMG8SWHoTgh43BZ5QfFyDnkr9RYG5sVcjINAgP8BF3IPsz6sAO92bo29bjY6NDl1mdtF8zoWh-O91zptN1N2riocuGBe1Tlo3wQqFhe5J4umPbwxn6Jcd3noCtFYRvwGHWdPow..AT1_dRPQRkox';

// ระบบสมาชิก (ขั้นที่ 2): เปิดเมื่อ deploy Edge Functions และตั้งค่า Stripe แล้ว
export const BILLING_ENABLED = false;
// ราคาสำหรับแสดงในแอปเท่านั้น ราคาที่เก็บจริงมาจาก Stripe (แก้ใน Stripe แล้วต้องแก้ตรงนี้ให้ตรงกัน)
export const PRICE_TEXT = { monthly: '59 บาท/เดือน', yearly: '590 บาท/ปี' };
