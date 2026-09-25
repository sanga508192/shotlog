-- ShotLog: ฐานข้อมูลคลาวด์บน Supabase (ขั้นที่ 1 — บัญชีผู้ใช้และสำรอง/ซิงก์)
-- วิธีใช้: Supabase Dashboard → SQL Editor → วางไฟล์นี้ทั้งไฟล์ → Run (รันซ้ำได้)
--
-- หลักการ
-- * แต่ละรายการของแอป (รอบ หลุม ช็อต ฯลฯ) เก็บเป็นหนึ่งแถว data เป็น JSON ตามที่แอปบันทึก
-- * ผู้ใช้อ่านได้เฉพาะแถวของตัวเอง (RLS) และเขียนได้ผ่านฟังก์ชัน push_records เท่านั้น
-- * rev เพิ่มทุกครั้งที่แก้ ถ้าเครื่องส่ง base_rev ไม่ตรงกับบนเซิร์ฟเวอร์ จะได้สถานะ conflict
--   แทนการเขียนทับเงียบ ๆ
-- * สิทธิ์ซิงก์ตรวจที่เซิร์ฟเวอร์ใน can_sync(): ช่วงทดลองเปิดให้ทุกคน (open_beta)
--   ขั้นที่ 2 จะปิด open_beta แล้วใช้ตาราง entitlements ที่อัปเดตจากระบบรับเงิน

create sequence if not exists public.records_seq;

create table if not exists public.records (
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store      text not null check (store in
               ('rounds','holes','shots','penalties','clubs','practice','userCourses','favorites','settings')),
  id         text not null check (length(id) between 1 and 200),
  data       jsonb,
  deleted    boolean not null default false,
  rev        bigint not null default 1,
  seq        bigint not null default nextval('public.records_seq'),
  updated_at timestamptz not null default now(),
  primary key (owner_id, store, id)
);
create index if not exists records_owner_seq on public.records (owner_id, seq);

alter table public.records enable row level security;
drop policy if exists "read own records" on public.records;
create policy "read own records" on public.records
  for select to authenticated using (owner_id = auth.uid());
revoke all on public.records from anon, authenticated;
grant select on public.records to authenticated;

-- สิทธิ์สมาชิก (ขั้นที่ 2 จะเขียนจาก webhook ของระบบรับเงินด้วย service role)
create table if not exists public.entitlements (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  plan               text not null,
  status             text not null,
  current_period_end timestamptz,
  updated_at         timestamptz not null default now()
);
alter table public.entitlements enable row level security;
drop policy if exists "read own entitlement" on public.entitlements;
create policy "read own entitlement" on public.entitlements
  for select to authenticated using (user_id = auth.uid());
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;

-- ค่าตั้งของระบบ ผู้ใช้อ่าน/เขียนตรงไม่ได้
create table if not exists public.app_config (
  key   text primary key,
  value jsonb not null
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
insert into public.app_config (key, value) values ('open_beta', 'true')
  on conflict (key) do nothing;

create or replace function public.can_sync()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    coalesce((select (value #>> '{}')::boolean from app_config where key = 'open_beta'), false)
    or exists (
      select 1 from entitlements e
      where e.user_id = auth.uid()
        and e.status in ('active', 'trialing')
        and (e.current_period_end is null or e.current_period_end > now())
    )
  );
$$;

-- items: [{ store, id, base_rev (null = รายการใหม่), deleted, data }]
-- คืน: [{ store, id, status: 'ok' | 'conflict', rev, seq, data?, deleted? }]
create or replace function public.push_records(items jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  it   jsonb;
  cur  records%rowtype;
  del  boolean;
  base bigint;
  res  jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not can_sync() then
    raise exception 'subscription required' using errcode = '42501';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 500 then
    raise exception 'items must be an array of at most 500' using errcode = '22023';
  end if;

  for it in select value from jsonb_array_elements(items) loop
    del  := coalesce((it ->> 'deleted')::boolean, false);
    base := (it ->> 'base_rev')::bigint;
    if not del and (jsonb_typeof(it -> 'data') <> 'object' or pg_column_size(it -> 'data') > 100000) then
      raise exception 'invalid data for %/%', it ->> 'store', it ->> 'id' using errcode = '22023';
    end if;

    select * into cur from records
      where owner_id = uid and store = it ->> 'store' and id = it ->> 'id'
      for update;

    if not found then
      insert into records (owner_id, store, id, data, deleted)
        values (uid, it ->> 'store', it ->> 'id', case when del then null else it -> 'data' end, del)
        returning * into cur;
    elsif cur.rev = base then
      update records
        set data = case when del then null else it -> 'data' end,
            deleted = del,
            rev = cur.rev + 1,
            seq = nextval('records_seq'),
            updated_at = now()
        where owner_id = uid and store = cur.store and id = cur.id
        returning * into cur;
    else
      res := res || jsonb_build_array(jsonb_build_object(
        'store', cur.store, 'id', cur.id, 'status', 'conflict',
        'rev', cur.rev, 'seq', cur.seq, 'data', cur.data, 'deleted', cur.deleted));
      continue;
    end if;

    res := res || jsonb_build_array(jsonb_build_object(
      'store', cur.store, 'id', cur.id, 'status', 'ok', 'rev', cur.rev, 'seq', cur.seq));
  end loop;
  return res;
end;
$$;

-- ลบบัญชีและข้อมูลทั้งหมดบนคลาวด์ (PDPA: ผู้ใช้ขอลบข้อมูลของตนได้)
create or replace function public.delete_my_account()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from records where owner_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.can_sync() from public, anon;
revoke all on function public.push_records(jsonb) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.can_sync() to authenticated;
grant execute on function public.push_records(jsonb) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
