// supabase/schema.sql 을 Code.gs 의 시트 열 이름에서 만들어 줍니다. (node tools/gen_schema.js)
const fs = require('fs'), path = require('path'), vm = require('vm');
const { NUMERIC } = require('../lib/schema');
const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src + '\n;this.S = SHEETS;', ctx);
const defs = Object.keys(ctx.S).map(k => ctx.S[k]);
const names = defs.map(d => d.name);
const q = s => '"' + s + '"';
const out = [];
out.push(`-- 강원 수어교육 관리 시스템: Supabase 표 만들기 (자동 생성)
-- 사용법: Supabase 화면 왼쪽 [SQL Editor] → New query → 이 내용을 모두 붙여 넣고 Run
-- 여러 번 실행해도 기존 자료는 지워지지 않습니다. 기능이 추가되어 업그레이드할 때도 이 파일을 다시 실행하면 됩니다.
`);
defs.forEach(d => {
  out.push(`create table if not exists public.${q(d.name)} (`);
  out.push('  id bigint generated always as identity primary key,');
  out.push(d.headers.map(h => `  ${q(h)} ${NUMERIC.has(h) ? 'numeric' : 'text'}`).join(',\n'));
  out.push(');');
  d.headers.forEach(h => out.push(`alter table public.${q(d.name)} add column if not exists ${q(h)} ${NUMERIC.has(h) ? 'numeric' : 'text'};`));   // 나중에 열이 늘어도 이 파일을 다시 실행하면 반영됨
  out.push(`alter table public.${q(d.name)} enable row level security;`);
});
out.push(`
-- 자주 찾는 열에 색인 (속도)
create index if not exists idx_part_course on public."참여자명단" ("강좌ID");
create index if not exists idx_att_course on public."출석기록" ("강좌ID");
create index if not exists idx_course_chapter on public."강좌정보" ("지회명");
create index if not exists idx_certs_chapter on public."수료증발급" ("지회명");
create index if not exists idx_journal_course on public."교육일지" ("강좌ID");
create index if not exists idx_tasks_course on public."과제" ("강좌ID");
create index if not exists idx_submits_course on public."과제제출" ("강좌ID");

-- 도협회 ↔ 지회 파일 저장소 (비공개, 파일당 20MB)
insert into storage.buckets (id, name, public, file_size_limit)
  values ('hq-files', 'hq-files', false, 20971520)
  on conflict (id) do update set public = false, file_size_limit = 20971520;

-- 로그인 상태 · 로그인 실패 횟수 · 저장 잠금 (앱이 내부적으로 씁니다)
create table if not exists public.app_sessions (
  token text primary key, member_id text not null, expires_at timestamptz not null);
create table if not exists public.app_login_fail (
  key text primary key, n int not null default 0, until_at timestamptz not null);
create table if not exists public.app_locks (
  name text primary key, owner text not null, until_at timestamptz not null);
alter table public.app_sessions enable row level security;
alter table public.app_login_fail enable row level security;
alter table public.app_locks enable row level security;

-- 여러 줄을 한 번에 저장하는 함수 (모두 성공하거나 모두 취소됩니다)
create or replace function public.apply_ops(ops jsonb) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  o jsonb; tbl text; kind text; cols text; ncols text[]; v jsonb;
  allowed text[] := array[${names.map(n => `'${n}'`).join(', ')}];
begin
  for o in select value from jsonb_array_elements(ops) loop
    tbl := o->>'t'; kind := o->>'k';
    if tbl is null or not (tbl = any(allowed)) then
      raise exception 'invalid table: %', tbl;
    end if;
    -- 숫자 칸에 빈 글자("")가 들어오면 빈 칸(null)으로 바꿔서 저장 (오류 방지)
    if kind in ('insert', 'update') then
      select coalesce(array_agg(column_name::text), '{}') into ncols from information_schema.columns
        where table_schema = 'public' and table_name = tbl and data_type = 'numeric';
      v := o->'v';
      if jsonb_typeof(v) = 'array' then
        select coalesce(jsonb_agg(e - (select coalesce(array_agg(k), '{}') from unnest(ncols) k where e->>k = '')), '[]'::jsonb)
          into v from jsonb_array_elements(v) e;
      elsif jsonb_typeof(v) = 'object' then
        v := v - (select coalesce(array_agg(k), '{}') from unnest(ncols) k where v->>k = '');
      end if;
      o := jsonb_set(o, '{v}', v);
    end if;
    if kind = 'truncate' then
      execute format('truncate table public.%I restart identity', tbl);
    elsif kind = 'insert' then
      select string_agg(format('%I', column_name), ', ' order by ordinal_position) into cols
        from information_schema.columns
        where table_schema = 'public' and table_name = tbl and column_name <> 'id';
      execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
        tbl, cols, cols, tbl) using o->'v';
    elsif kind = 'update' then
      if o ? 'c' then
        select string_agg(format('%I', x), ', ') into cols from jsonb_array_elements_text(o->'c') x;
      else
        select string_agg(format('%I', column_name), ', ' order by ordinal_position) into cols
          from information_schema.columns
          where table_schema = 'public' and table_name = tbl and column_name <> 'id';
      end if;
      execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id = $2',
        tbl, cols, cols, tbl) using o->'v', (o->>'id')::bigint;
    elsif kind = 'delete' then
      execute format('delete from public.%I where id = any($1)', tbl)
        using (select array_agg(x::bigint) from jsonb_array_elements_text(o->'ids') x);
    else
      raise exception 'invalid op: %', kind;
    end if;
  end loop;
end
$fn$;

-- 동시에 저장해도 자료가 꼬이지 않게 하는 잠금 (한 번에 한 사람씩)
create or replace function public.try_lock(p_name text, p_owner text, p_seconds int) returns boolean
language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  insert into public.app_locks (name, owner, until_at)
    values (p_name, p_owner, now() + make_interval(secs => p_seconds))
  on conflict (name) do update set owner = excluded.owner, until_at = excluded.until_at
    where public.app_locks.until_at < now();
  get diagnostics n = row_count;
  return n > 0;
end
$fn$;

create or replace function public.release_lock(p_name text, p_owner text) returns void
language sql security definer set search_path = public as $fn$
  delete from public.app_locks where name = p_name and owner = p_owner;
$fn$;

-- 보안: 브라우저(익명 사용자)는 이 표와 함수에 접근할 수 없고, 서버(service_role)만 쓸 수 있습니다.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on function public.apply_ops(jsonb) from public, anon, authenticated;
revoke execute on function public.try_lock(text, text, int) from public, anon, authenticated;
revoke execute on function public.release_lock(text, text) from public, anon, authenticated;
grant execute on function public.apply_ops(jsonb) to service_role;
grant execute on function public.try_lock(text, text, int) to service_role;
grant execute on function public.release_lock(text, text) to service_role;
grant all on all tables in schema public to service_role;

notify pgrst, 'reload schema';
`);
fs.writeFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), out.join('\n'));
console.log('supabase/schema.sql 생성 완료');
