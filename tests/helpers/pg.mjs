// ฐานข้อมูล Postgres จำลอง (PGlite) พร้อมโครง auth ของ Supabase แบบย่อ สำหรับทดสอบ supabase/schema.sql
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const AUTH_STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`;

export async function makeDb() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(await readFile(new URL('../../supabase/schema.sql', import.meta.url), 'utf8'));
  return db;
}

export async function addUser(db, id, email = `${id.slice(0, 4)}@example.com`) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
}

// รันคำสั่งในบทบาท authenticated เหมือนคำขอผ่าน PostgREST ของผู้ใช้คนนั้น
export async function asUser(db, uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await tx.exec(uid ? 'set local role authenticated' : 'set local role anon');
    return tx.query(sql, params);
  });
}

// API ที่ sync.js ใช้ ต่อกับฐานข้อมูลจำลองแทน Supabase จริง
export function fakeApi(db, getUid) {
  return {
    async push(items) {
      const r = await asUser(db, getUid(), 'select public.push_records($1::jsonb) as res', [JSON.stringify(items)]);
      return r.rows[0].res;
    },
    async pull(cursor, limit) {
      const r = await asUser(db, getUid(),
        'select store, id, data, deleted, rev::int as rev, seq::int as seq from public.records where seq > $1 order by seq limit $2',
        [cursor, limit]);
      return r.rows;
    },
  };
}
