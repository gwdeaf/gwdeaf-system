-- 40. 공지 읽음 표시: 공지를 펼쳐 읽으면 빨간 숫자가 사라짐
-- 이 파일 전체를 한 번 Run 하세요. 여러 번 실행해도 괜찮습니다.

create table if not exists notice_reads (
  email     text   not null,
  notice_id bigint not null references notices(id) on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (email, notice_id)
);
alter table notice_reads enable row level security;   -- 화면에서 직접 못 읽음 (아래 함수로만)

-- 내가 읽은 공지 번호들
create or replace function notice_read_ids() returns bigint[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(notice_id), '{}') from notice_reads where email = lower((me()).email)
$$;

-- 읽음 표시
create or replace function notice_mark_read(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare m staff_access;
begin
  m := me(); if m.id is null or coalesce(m.email, '') = '' then return; end if;
  insert into notice_reads(email, notice_id) values (lower(m.email), p_id) on conflict do nothing;
end $$;

revoke all on function notice_read_ids() from public, anon;
revoke all on function notice_mark_read(bigint) from public, anon;
grant execute on function notice_read_ids() to authenticated;
grant execute on function notice_mark_read(bigint) to authenticated;
