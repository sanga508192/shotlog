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

-- ให้สิทธิ์แบบระบุเองทั้งหมด จึงใช้ได้แม้ปิด "Automatically expose new tables" ตอนสร้างโปรเจกต์
grant usage on schema public to authenticated;

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
-- ขั้นที่ 2: current_period_end = สิทธิ์จากการทดลอง/สมัครตัดบัตร, prepaid_until = สิทธิ์ที่จ่ายล่วงหน้า (PromptPay)
alter table public.entitlements add column if not exists source text;   -- trial | stripe_subscription | promptpay | manual
alter table public.entitlements add column if not exists stripe_subscription_id text;
alter table public.entitlements add column if not exists cancel_at_period_end boolean not null default false;
alter table public.entitlements add column if not exists prepaid_until timestamptz;
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
        and (
          (e.status in ('active', 'trialing') and (e.current_period_end is null or e.current_period_end > now()))
          or e.prepaid_until > now()
        )
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
  -- สมัครแบบตัดบัตรอัตโนมัติอยู่ → ต้องยกเลิกก่อน ไม่งั้น Stripe จะตัดเงินต่อทั้งที่ไม่มีบัญชีแล้ว
  if exists (
    select 1 from entitlements
    where user_id = auth.uid() and source = 'stripe_subscription'
      and status in ('active', 'trialing', 'past_due') and not cancel_at_period_end
  ) then
    raise exception 'active subscription' using errcode = 'P0001', hint = 'cancel_subscription_first';
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

-- ============================================================
-- ขั้นที่ 2: สมาชิกและการชำระเงิน (Stripe)
-- ตารางเหล่านี้เขียนได้เฉพาะ Edge Function ที่ใช้ service role เท่านั้น
-- ============================================================


create table if not exists public.billing_customers (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);
alter table public.billing_customers enable row level security;
revoke all on public.billing_customers from anon, authenticated;

-- กันประมวลผล webhook ซ้ำ (Stripe ส่งซ้ำได้)
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

insert into public.app_config (key, value) values ('trial_days', '30')
  on conflict (key) do nothing;

-- ผู้ใช้ใหม่ได้ทดลองใช้ฟรีทันทีตามจำนวนวันใน app_config.trial_days
create or replace function public.start_trial()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  days int := coalesce((select (value #>> '{}')::int from app_config where key = 'trial_days'), 0);
begin
  if days > 0 then
    insert into entitlements (user_id, plan, status, current_period_end, source)
      values (new.id, 'trial', 'trialing', now() + make_interval(days => days), 'trial')
      on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.start_trial() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_trial on auth.users;
create trigger on_auth_user_created_trial
  after insert on auth.users
  for each row execute function public.start_trial();

-- ผู้ใช้ที่สมัครก่อนมีระบบทดลอง ได้ทดลองนับจากวันที่รันไฟล์นี้ครั้งแรก
insert into public.entitlements (user_id, plan, status, current_period_end, source)
  select u.id, 'trial', 'trialing',
         now() + make_interval(days => coalesce((select (value #>> '{}')::int from public.app_config where key = 'trial_days'), 30)),
         'trial'
  from auth.users u
  on conflict (user_id) do nothing;

-- Edge Functions ใช้ service role อ่าน/เขียนสิทธิ์สมาชิก (ให้แบบระบุเอง เผื่อปิด auto-expose ไว้)
grant usage on schema public to service_role;
grant select, insert, update, delete on public.entitlements, public.billing_customers, public.stripe_events to service_role;
grant select on public.app_config to service_role;

-- ============================================================
-- ขั้นที่ 3: หมุดสนามที่ผู้ใช้เลือกแชร์ (ไม่ระบุตัวตน) และสกอร์บอร์ดสดให้เพื่อนดู
-- ============================================================

-- หมุดแท่นที/กรีน/ขอบกรีนของสนามในรายชื่อของแอป เก็บแยกรายคน คนอื่นเห็นเฉพาะค่ากลางรวม
create table if not exists public.course_pins (
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id  text not null check (course_id ~ '^[a-z0-9-]{1,80}$'),
  hole       int  not null check (hole between 1 and 27),
  kind       text not null check (kind in ('tee', 'green', 'front', 'back')),
  lat        double precision not null check (lat between -90 and 90),
  lon        double precision not null check (lon between -180 and 180),
  via        text check (via in ('gps', 'map')),
  updated_at timestamptz not null default now(),
  primary key (owner_id, course_id, hole, kind)
);
alter table public.course_pins enable row level security;
revoke all on public.course_pins from anon, authenticated;

-- แทนที่หมุดทั้งหมดของผู้ใช้ในสนามนี้ (ส่ง [] = เลิกแชร์สนามนี้)
create or replace function public.share_course_pins(course text, pins jsonb)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p   jsonb;
  n   int := 0;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(pins) <> 'array' or jsonb_array_length(pins) > 108 then
    raise exception 'pins must be an array of at most 108' using errcode = '22023';
  end if;
  delete from course_pins where owner_id = uid and course_id = course;
  for p in select value from jsonb_array_elements(pins) loop
    insert into course_pins (owner_id, course_id, hole, kind, lat, lon, via)
      values (uid, course, (p ->> 'hole')::int, p ->> 'kind', (p ->> 'lat')::float8, (p ->> 'lon')::float8, p ->> 'via')
      on conflict (owner_id, course_id, hole, kind) do update
        set lat = excluded.lat, lon = excluded.lon, via = excluded.via, updated_at = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.unshare_all_pins()
returns void
language sql security definer
set search_path = public
as $$
  delete from course_pins where owner_id = auth.uid();
$$;

-- ค่ากลางของหมุดจากทุกคนที่แชร์ (ไม่บอกว่าใครวาง) อ่านได้แม้ไม่ได้เข้าสู่ระบบ
create or replace function public.community_pins(course text)
returns table (hole int, kind text, lat double precision, lon double precision, n int, gps int)
language sql stable security definer
set search_path = public
as $$
  select c.hole, c.kind,
         percentile_cont(0.5) within group (order by c.lat),
         percentile_cont(0.5) within group (order by c.lon),
         count(*)::int,
         (count(*) filter (where c.via = 'gps'))::int
  from course_pins c
  where c.course_id = course
  group by c.hole, c.kind
  order by c.hole, c.kind;
$$;

-- สกอร์บอร์ดสด: เจ้าของรอบส่งสรุปสกอร์ขึ้นมา คนที่มีลิงก์ (token สุ่ม) เปิดดูได้โดยไม่ต้องมีบัญชี
-- หมดอายุ 2 วันหลังอัปเดตครั้งล่าสุด · เป็นฟีเจอร์แชร์ จึงต้องมีสิทธิ์สมาชิก (can_sync)
create table if not exists public.live_boards (
  token      text primary key check (token ~ '^[A-Za-z0-9_-]{20,64}$'),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 days'
);
alter table public.live_boards enable row level security;
revoke all on public.live_boards from anon, authenticated;

create or replace function public.publish_board(board text, payload jsonb)
returns timestamptz
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  exp timestamptz := now() + interval '2 days';
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not can_sync() then
    raise exception 'subscription required' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) <> 'object' or pg_column_size(payload) > 60000 then
    raise exception 'invalid board' using errcode = '22023';
  end if;
  delete from live_boards where expires_at < now();
  insert into live_boards (token, owner_id, data, updated_at, expires_at)
    values (board, uid, payload, now(), exp)
    on conflict (token) do update
      set data = excluded.data, updated_at = now(), expires_at = exp
      where live_boards.owner_id = uid;
  if not found then
    raise exception 'not your board' using errcode = '42501';
  end if;
  return exp;
end;
$$;

create or replace function public.get_board(board text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('data', b.data, 'updated_at', b.updated_at)
  from live_boards b
  where b.token = board and b.expires_at > now();
$$;

create or replace function public.unpublish_board(board text)
returns void
language sql security definer
set search_path = public
as $$
  delete from live_boards where token = board and owner_id = auth.uid();
$$;

revoke all on function public.share_course_pins(text, jsonb) from public, anon;
revoke all on function public.unshare_all_pins() from public, anon;
revoke all on function public.community_pins(text) from public;
revoke all on function public.publish_board(text, jsonb) from public, anon;
revoke all on function public.get_board(text) from public;
revoke all on function public.unpublish_board(text) from public, anon;
grant execute on function public.share_course_pins(text, jsonb) to authenticated;
grant execute on function public.unshare_all_pins() to authenticated;
grant execute on function public.publish_board(text, jsonb) to authenticated;
grant execute on function public.unpublish_board(text) to authenticated;
grant execute on function public.community_pins(text) to anon, authenticated;
grant execute on function public.get_board(text) to anon, authenticated;
