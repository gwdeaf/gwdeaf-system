-- 39. 강의확인서 흐름: 강사 제출 → 학교 서명 링크 → 학교 서명 (알림·배지)
-- 이 파일 전체를 한 번 Run 하세요. 여러 번 실행해도 괜찮습니다.

-- ① 새 칸
alter table "강의확인서" add column if not exists "제출일시" text;
alter table "강의확인서" add column if not exists "학교토큰해시" text;
alter table "강의확인서" add column if not exists "학교토큰" text;
alter table "강의확인서" add column if not exists "링크발송일시" text;
alter table "강의확인서" add column if not exists "담당확인일시" text;
create index if not exists "강의확인서_학교토큰해시_idx" on "강의확인서" ("학교토큰해시");

-- ② 강좌의 지회 id 찾기 (강좌정보.지회명 ↔ chapters.name, 띄어쓰기 무시)
create or replace function _edu_course_ch(p_id text) returns bigint
language sql stable security definer set search_path = public as $$
  select c.id from "강좌정보" k join chapters c on replace(c.name, ' ', '') = replace(k."지회명", ' ', '')
   where k."강좌ID" = p_id limit 1
$$;

-- ③ 슬랙 알림: 강사가 제출했을 때 · 학교가 서명했을 때
create or replace function _slack_edu_confirm() returns trigger
language plpgsql security definer set search_path = public as $$
declare ch bigint; nm text;
begin
  if coalesce(new."제출일시", '') = '' then return new; end if;
  ch := _edu_course_ch(new."강좌ID"); if ch is null then return new; end if;
  select "강좌명" into nm from "강좌정보" where "강좌ID" = new."강좌ID" limit 1;
  if coalesce(new."기관서명", '') <> '' and (tg_op = 'INSERT' or coalesce(old."기관서명", '') = '') then
    perform _slack_send(ch, _slack_staff(ch, 'edu'), 'edu', ':white_check_mark: *강의확인서 학교 서명 완료*  ' || coalesce(nm, '') || E'\n강좌 화면에서 출력할 수 있어요.');
  elsif tg_op = 'INSERT' or coalesce(old."제출일시", '') = '' then
    perform _slack_send(ch, _slack_staff(ch, 'edu'), 'edu', ':books: *강의확인서 제출*  ' || coalesce(nm, '') || E'\n강좌 화면에서 학교 서명 링크를 보내 주세요.');
  end if;
  return new;
exception when others then return new;   -- 알림 실패는 저장을 막지 않음
end $$;
drop trigger if exists slack_edu_confirm on "강의확인서";
create trigger slack_edu_confirm after insert or update on "강의확인서"
  for each row execute function _slack_edu_confirm();

-- ④ 배지 숫자: 내 지회에서 '링크 보내기' + '학교 서명 완료(아직 안 본 것)'
create or replace function edu_confirm_badge() returns int
language plpgsql stable security definer set search_path = public as $$
declare m staff_access;
begin
  m := me();
  if m.id is null or not _notice_aud_ok(m, 'edu') then return 0; end if;
  return (select count(*)::int from "강의확인서" f
           where coalesce(f."제출일시", '') <> ''
             and _edu_course_ch(f."강좌ID") = m.chapter_id
             and exists (select 1 from "강좌정보" k where k."강좌ID" = f."강좌ID" and coalesce(k."상태", '') <> '삭제')
             and ((coalesce(f."기관서명", '') = '' and coalesce(f."링크발송일시", '') = '')
               or (coalesce(f."기관서명", '') <> '' and coalesce(f."담당확인일시", '') = '')));
end $$;
revoke all on function edu_confirm_badge() from public, anon;
grant execute on function edu_confirm_badge() to authenticated;
revoke all on function _edu_course_ch(text) from public, anon, authenticated;
revoke all on function _slack_edu_confirm() from public, anon, authenticated;

-- 확인: 아래가 0 이상 숫자로 나오면 정상
select edu_confirm_badge() as "배지_확인";
