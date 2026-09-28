# เช็กลิสต์ก่อนเปิดให้คนทั่วไปใช้และเริ่มเก็บเงิน

ทำตามลำดับ แต่ละข้อบอกว่าใครทำ: **คุณ** = ต้องใช้บัญชี/เงิน/รหัสผ่านของคุณ · **Claude** = ส่งค่าที่ได้มาแล้วผมแก้โค้ดให้

## 0. อัปเดตฐานข้อมูลสำหรับฟีเจอร์ v0.14 (ทำได้เลย) — คุณ

แชร์หมุดสนามและสกอร์สดต้องใช้ตารางใหม่

1. เปิด Supabase Dashboard → โปรเจกต์ `erycbfpvfhehhsskxtrf` → **SQL Editor** → New query
2. วางเนื้อหาไฟล์ `supabase/schema.sql` ทั้งไฟล์ → กด **Run** (ไฟล์นี้รันซ้ำได้ ข้อมูลเดิมไม่หาย)
3. ต้องเห็น `Success. No rows returned`

## 1. ภาพดาวเทียมแบบใช้เชิงพาณิชย์ได้ (ArcGIS) — คุณ แล้ว Claude

> ✅ ทำแล้ว 28 ก.ย. 2569 — คีย์ "ShotLog satellite tiles" (Basemap styles service, Referrer: sanga508192.github.io และ localhost:5173) **หมดอายุ 28 ก.ย. 2570** ต้องสร้างคีย์ใหม่/ต่ออายุใน My portal → Content ก่อนวันนั้น แล้วเปลี่ยน `ESRI_API_KEY` · ถ้าย้ายไปโดเมนใหม่ต้องเพิ่ม Referrer ของโดเมนนั้นด้วย

บริการภาพที่แอปใช้ตอนนี้ไม่อนุญาตให้ใช้เชิงพาณิชย์ ต้องเปลี่ยนก่อนเก็บเงิน

1. สมัคร **ArcGIS Location Platform** ที่ developers.arcgis.com (ดูโควตาใช้ฟรีต่อเดือนและราคาส่วนเกินในหน้าราคา)
2. สร้าง **API key** (Developer credentials) ให้สิทธิ์เฉพาะ **Basemaps**
3. ตั้ง **Referrer** ให้ใช้ได้เฉพาะ `https://sanga508192.github.io/*` (และโดเมนใหม่ในข้อ 2 ถ้ามี) เพราะ key นี้อยู่ในโค้ดฝั่งผู้ใช้
4. ส่ง API key มาให้ผม → ผมใส่ที่ `ESRI_API_KEY` ใน `js/config.js` แอปจะเปลี่ยนไปใช้บริการแบบมีสิทธิ์และแสดง "Powered by Esri" เอง

## 2. โดเมนของตัวเอง (แนะนำ) — คุณ แล้ว Claude

1. ซื้อโดเมน เช่น จากผู้ให้บริการจดโดเมนทั่วไป
2. ที่ DNS ของโดเมน เพิ่ม `CNAME` ของซับโดเมน (เช่น `app`) ชี้ไป `sanga508192.github.io`
3. GitHub → repo `shotlog` → Settings → Pages → Custom domain ใส่โดเมน → รอเช็กผ่าน → เปิด **Enforce HTTPS**
4. Supabase → Authentication → URL Configuration → แก้ Site URL เป็นโดเมนใหม่
5. แจ้งผม → ผมแก้ `APP_URL`, ลิงก์ในเอกสาร และเตือนให้เพิ่มโดเมนใน Referrer ของ ArcGIS
หมายเหตุ: ผู้ใช้เดิมที่ติดตั้งจากที่อยู่เก่าจะมีข้อมูลในเครื่องแยกกัน ต้องเข้าสู่ระบบเพื่อดึงข้อมูลจากคลาวด์ (หรือส่งออก/นำเข้าไฟล์)

## 3. อีเมลส่งรหัสเข้าสู่ระบบ — คุณ

ตอนนี้ใช้ Gmail ส่วนตัว ส่งได้จำกัดและดูไม่น่าเชื่อถือ

1. สมัคร Resend (หรือผู้ให้บริการอื่นที่มี SMTP) → Domains → เพิ่มโดเมนจากข้อ 2
2. เพิ่ม DNS records ที่ Resend แสดง (SPF, DKIM) ที่ผู้ให้บริการโดเมน → รอสถานะ Verified
3. สร้าง API key ของ Resend
4. Supabase → Authentication → Emails → SMTP Settings:
   - Host `smtp.resend.com` · Port `465` · Username `resend` · Password = API key ของ Resend
   - Sender email เช่น `noreply@โดเมนของคุณ` · Sender name `ShotLog`
5. ทดสอบเข้าสู่ระบบด้วยอีเมลใหม่ 1 ครั้ง แล้วลบ app password ของ Gmail เดิมทิ้ง

## 4. นโยบายความเป็นส่วนตัวและข้อตกลง — คุณ แล้ว Claude

1. เปิด `docs/privacy-policy-draft.md` และ `docs/terms-draft.md` เติมข้อความใน [วงเล็บเหลี่ยม] (ชื่อผู้ให้บริการ อีเมลติดต่อ นโยบายคืนเงิน ฯลฯ)
2. ให้นักกฎหมาย PDPA ตรวจทาน (แนะนำ)
3. ส่งฉบับสุดท้ายให้ผม → ผมทำเป็นหน้า `privacy.html` และ `terms.html` ลิงก์จากหน้าเข้าสู่ระบบและหน้าตั้งค่า

## 5. เปิดรับชำระเงิน — คุณ แล้ว Claude

ทำตาม README หัวข้อ **สมาชิกและการชำระเงิน (Stripe)** ข้อ 2–9 (สมัคร Stripe, สร้างราคา, ตั้ง Secrets, deploy Edge Functions, ตั้ง webhook)
- ทดสอบใน Test mode ให้ผ่านก่อน แล้วค่อยสลับ Live mode
- ส่งสัญญาณให้ผม → ผมตั้ง `BILLING_ENABLED = true` และตรวจหน้าสมาชิกบนเว็บจริง
- วันเริ่มเก็บเงินจริง ปิดช่วงทดลองเปิด: `update app_config set value = 'false' where key = 'open_beta';`

## 6. ก่อนประกาศเปิดตัว — Claude

- ตรวจทุกหน้าบนมือถือจริง (iPhone Safari, Android Chrome) ทั้งออนไลน์และออฟไลน์
- ตรวจว่าไม่มีคีย์ลับในโค้ด (`service_role`, Stripe secret)
- เพิ่มเวอร์ชันและบันทึกการเปลี่ยนแปลง
