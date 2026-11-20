-- 강원 수어교육 관리 시스템: Supabase 표 만들기 (자동 생성)
-- 사용법: Supabase 화면 왼쪽 [SQL Editor] → New query → 이 내용을 모두 붙여 넣고 Run
-- 여러 번 실행해도 기존 자료는 지워지지 않습니다. 기능이 추가되어 업그레이드할 때도 이 파일을 다시 실행하면 됩니다.

create table if not exists public."회원정보" (
  id bigint generated always as identity primary key,
  "아이디" text,
  "비밀번호" text,
  "지회명" text,
  "담당자" text,
  "권한" text,
  "사용여부" text,
  "최근접속" text,
  "인쇄설정" text,
  "연락처" text,
  "센터연락처" text,
  "직통번호" text
);
alter table public."회원정보" add column if not exists "아이디" text;
alter table public."회원정보" add column if not exists "비밀번호" text;
alter table public."회원정보" add column if not exists "지회명" text;
alter table public."회원정보" add column if not exists "담당자" text;
alter table public."회원정보" add column if not exists "권한" text;
alter table public."회원정보" add column if not exists "사용여부" text;
alter table public."회원정보" add column if not exists "최근접속" text;
alter table public."회원정보" add column if not exists "인쇄설정" text;
alter table public."회원정보" add column if not exists "연락처" text;
alter table public."회원정보" add column if not exists "센터연락처" text;
alter table public."회원정보" add column if not exists "직통번호" text;
alter table public."회원정보" enable row level security;
create table if not exists public."강좌정보" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "지회명" text,
  "연도" numeric,
  "반기" text,
  "강좌명" text,
  "주관" text,
  "교육구분" text,
  "수준" text,
  "기관명" text,
  "시작일" text,
  "종료일" text,
  "총회차" numeric,
  "회당시간" numeric,
  "강사" text,
  "교재" text,
  "수료기준" numeric,
  "수료집계" text,
  "인원만입력" text,
  "상태" text,
  "등록일시" text,
  "수정일시" text,
  "확인서필요" text,
  "확인서수령" text,
  "확인서수령일" text,
  "링크만료일" text,
  "보조강사" text,
  "강사비기준" text,
  "강사비단가" text,
  "보조강사비단가" text,
  "강사세율" text,
  "보조세율" text,
  "수료배점" text,
  "기타항목명" text,
  "종료처리일" text,
  "파견ID" text,
  "강사비집행" text,
  "예정일" text,
  "파견비고" text,
  "파견장소" text,
  "수강료" numeric,
  "요일시간" text,
  "장소" text,
  "모집인원" text,
  "접수시작" text,
  "접수마감" text
);
alter table public."강좌정보" add column if not exists "강좌ID" text;
alter table public."강좌정보" add column if not exists "지회명" text;
alter table public."강좌정보" add column if not exists "연도" numeric;
alter table public."강좌정보" add column if not exists "반기" text;
alter table public."강좌정보" add column if not exists "강좌명" text;
alter table public."강좌정보" add column if not exists "주관" text;
alter table public."강좌정보" add column if not exists "교육구분" text;
alter table public."강좌정보" add column if not exists "수준" text;
alter table public."강좌정보" add column if not exists "기관명" text;
alter table public."강좌정보" add column if not exists "시작일" text;
alter table public."강좌정보" add column if not exists "종료일" text;
alter table public."강좌정보" add column if not exists "총회차" numeric;
alter table public."강좌정보" add column if not exists "회당시간" numeric;
alter table public."강좌정보" add column if not exists "강사" text;
alter table public."강좌정보" add column if not exists "교재" text;
alter table public."강좌정보" add column if not exists "수료기준" numeric;
alter table public."강좌정보" add column if not exists "수료집계" text;
alter table public."강좌정보" add column if not exists "인원만입력" text;
alter table public."강좌정보" add column if not exists "상태" text;
alter table public."강좌정보" add column if not exists "등록일시" text;
alter table public."강좌정보" add column if not exists "수정일시" text;
alter table public."강좌정보" add column if not exists "확인서필요" text;
alter table public."강좌정보" add column if not exists "확인서수령" text;
alter table public."강좌정보" add column if not exists "확인서수령일" text;
alter table public."강좌정보" add column if not exists "링크만료일" text;
alter table public."강좌정보" add column if not exists "보조강사" text;
alter table public."강좌정보" add column if not exists "강사비기준" text;
alter table public."강좌정보" add column if not exists "강사비단가" text;
alter table public."강좌정보" add column if not exists "보조강사비단가" text;
alter table public."강좌정보" add column if not exists "강사세율" text;
alter table public."강좌정보" add column if not exists "보조세율" text;
alter table public."강좌정보" add column if not exists "수료배점" text;
alter table public."강좌정보" add column if not exists "기타항목명" text;
alter table public."강좌정보" add column if not exists "종료처리일" text;
alter table public."강좌정보" add column if not exists "파견ID" text;
alter table public."강좌정보" add column if not exists "강사비집행" text;
alter table public."강좌정보" add column if not exists "예정일" text;
alter table public."강좌정보" add column if not exists "파견비고" text;
alter table public."강좌정보" add column if not exists "파견장소" text;
alter table public."강좌정보" add column if not exists "수강료" numeric;
alter table public."강좌정보" add column if not exists "요일시간" text;
alter table public."강좌정보" add column if not exists "장소" text;
alter table public."강좌정보" add column if not exists "모집인원" text;
alter table public."강좌정보" add column if not exists "접수시작" text;
alter table public."강좌정보" add column if not exists "접수마감" text;
alter table public."강좌정보" enable row level security;
create table if not exists public."참여자명단" (
  id bigint generated always as identity primary key,
  "참여자ID" text,
  "강좌ID" text,
  "지회명" text,
  "이름" text,
  "연락처" text,
  "비고" text,
  "삭제" text,
  "등록일시" text,
  "수료확정" text,
  "성별" text,
  "점수" text
);
alter table public."참여자명단" add column if not exists "참여자ID" text;
alter table public."참여자명단" add column if not exists "강좌ID" text;
alter table public."참여자명단" add column if not exists "지회명" text;
alter table public."참여자명단" add column if not exists "이름" text;
alter table public."참여자명단" add column if not exists "연락처" text;
alter table public."참여자명단" add column if not exists "비고" text;
alter table public."참여자명단" add column if not exists "삭제" text;
alter table public."참여자명단" add column if not exists "등록일시" text;
alter table public."참여자명단" add column if not exists "수료확정" text;
alter table public."참여자명단" add column if not exists "성별" text;
alter table public."참여자명단" add column if not exists "점수" text;
alter table public."참여자명단" enable row level security;
create table if not exists public."회차강사" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "회차" numeric,
  "강사" text,
  "시작시간" text,
  "종료시간" text
);
alter table public."회차강사" add column if not exists "강좌ID" text;
alter table public."회차강사" add column if not exists "회차" numeric;
alter table public."회차강사" add column if not exists "강사" text;
alter table public."회차강사" add column if not exists "시작시간" text;
alter table public."회차강사" add column if not exists "종료시간" text;
alter table public."회차강사" enable row level security;
create table if not exists public."출석기록" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "참여자ID" text,
  "회차" numeric,
  "출석" text,
  "기록일시" text,
  "기록자" text,
  "수업일" text
);
alter table public."출석기록" add column if not exists "강좌ID" text;
alter table public."출석기록" add column if not exists "참여자ID" text;
alter table public."출석기록" add column if not exists "회차" numeric;
alter table public."출석기록" add column if not exists "출석" text;
alter table public."출석기록" add column if not exists "기록일시" text;
alter table public."출석기록" add column if not exists "기록자" text;
alter table public."출석기록" add column if not exists "수업일" text;
alter table public."출석기록" enable row level security;
create table if not exists public."최종실적" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "지회명" text,
  "연도" numeric,
  "반기" text,
  "강좌명" text,
  "주관" text,
  "교육구분" text,
  "수준" text,
  "기관명" text,
  "기간" text,
  "강사" text,
  "교재" text,
  "총회차" numeric,
  "진행회차" numeric,
  "회당시간" numeric,
  "총강의시간" numeric,
  "등록인원" numeric,
  "실인원" numeric,
  "연인원" numeric,
  "수료인원" numeric,
  "수료율" numeric,
  "수료집계" text,
  "계산일시" text
);
alter table public."최종실적" add column if not exists "강좌ID" text;
alter table public."최종실적" add column if not exists "지회명" text;
alter table public."최종실적" add column if not exists "연도" numeric;
alter table public."최종실적" add column if not exists "반기" text;
alter table public."최종실적" add column if not exists "강좌명" text;
alter table public."최종실적" add column if not exists "주관" text;
alter table public."최종실적" add column if not exists "교육구분" text;
alter table public."최종실적" add column if not exists "수준" text;
alter table public."최종실적" add column if not exists "기관명" text;
alter table public."최종실적" add column if not exists "기간" text;
alter table public."최종실적" add column if not exists "강사" text;
alter table public."최종실적" add column if not exists "교재" text;
alter table public."최종실적" add column if not exists "총회차" numeric;
alter table public."최종실적" add column if not exists "진행회차" numeric;
alter table public."최종실적" add column if not exists "회당시간" numeric;
alter table public."최종실적" add column if not exists "총강의시간" numeric;
alter table public."최종실적" add column if not exists "등록인원" numeric;
alter table public."최종실적" add column if not exists "실인원" numeric;
alter table public."최종실적" add column if not exists "연인원" numeric;
alter table public."최종실적" add column if not exists "수료인원" numeric;
alter table public."최종실적" add column if not exists "수료율" numeric;
alter table public."최종실적" add column if not exists "수료집계" text;
alter table public."최종실적" add column if not exists "계산일시" text;
alter table public."최종실적" enable row level security;
create table if not exists public."보고현황" (
  id bigint generated always as identity primary key,
  "지회명" text,
  "연도" numeric,
  "반기" text,
  "상태" text,
  "강좌수" numeric,
  "실인원" numeric,
  "연인원" numeric,
  "수료인원" numeric,
  "총강의시간" numeric,
  "제출일시" text,
  "제출자" text,
  "처리일시" text,
  "처리자" text,
  "반려사유" text
);
alter table public."보고현황" add column if not exists "지회명" text;
alter table public."보고현황" add column if not exists "연도" numeric;
alter table public."보고현황" add column if not exists "반기" text;
alter table public."보고현황" add column if not exists "상태" text;
alter table public."보고현황" add column if not exists "강좌수" numeric;
alter table public."보고현황" add column if not exists "실인원" numeric;
alter table public."보고현황" add column if not exists "연인원" numeric;
alter table public."보고현황" add column if not exists "수료인원" numeric;
alter table public."보고현황" add column if not exists "총강의시간" numeric;
alter table public."보고현황" add column if not exists "제출일시" text;
alter table public."보고현황" add column if not exists "제출자" text;
alter table public."보고현황" add column if not exists "처리일시" text;
alter table public."보고현황" add column if not exists "처리자" text;
alter table public."보고현황" add column if not exists "반려사유" text;
alter table public."보고현황" enable row level security;
create table if not exists public."수료증서식" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "지회명" text,
  "제목" text,
  "번호접두어" text,
  "번호연도" text,
  "자리수" numeric,
  "문구" text,
  "기관명" text,
  "직위" text,
  "성명" text,
  "수정일시" text
);
alter table public."수료증서식" add column if not exists "강좌ID" text;
alter table public."수료증서식" add column if not exists "지회명" text;
alter table public."수료증서식" add column if not exists "제목" text;
alter table public."수료증서식" add column if not exists "번호접두어" text;
alter table public."수료증서식" add column if not exists "번호연도" text;
alter table public."수료증서식" add column if not exists "자리수" numeric;
alter table public."수료증서식" add column if not exists "문구" text;
alter table public."수료증서식" add column if not exists "기관명" text;
alter table public."수료증서식" add column if not exists "직위" text;
alter table public."수료증서식" add column if not exists "성명" text;
alter table public."수료증서식" add column if not exists "수정일시" text;
alter table public."수료증서식" enable row level security;
create table if not exists public."강의확인서" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "내용" text,
  "강사서명" text,
  "강사서명일시" text,
  "기관소속" text,
  "기관담당자" text,
  "기관서명" text,
  "기관서명일시" text,
  "수정자" text,
  "수정일시" text
);
alter table public."강의확인서" add column if not exists "강좌ID" text;
alter table public."강의확인서" add column if not exists "내용" text;
alter table public."강의확인서" add column if not exists "강사서명" text;
alter table public."강의확인서" add column if not exists "강사서명일시" text;
alter table public."강의확인서" add column if not exists "기관소속" text;
alter table public."강의확인서" add column if not exists "기관담당자" text;
alter table public."강의확인서" add column if not exists "기관서명" text;
alter table public."강의확인서" add column if not exists "기관서명일시" text;
alter table public."강의확인서" add column if not exists "수정자" text;
alter table public."강의확인서" add column if not exists "수정일시" text;
alter table public."강의확인서" enable row level security;
create table if not exists public."파견요청" (
  id bigint generated always as identity primary key,
  "파견ID" text,
  "학교명" text,
  "지회명" text,
  "담당교사" text,
  "담당교사연락처" text,
  "장소" text,
  "일정" text,
  "회당시간" numeric,
  "회차수" text,
  "수준" text,
  "출석방식" text,
  "강사비기준" text,
  "강사단가" text,
  "보조강사단가" text,
  "비고" text,
  "상태" text,
  "차수" text,
  "회신" text,
  "강좌ID" text,
  "만든이" text,
  "만든일시" text,
  "수정일시" text
);
alter table public."파견요청" add column if not exists "파견ID" text;
alter table public."파견요청" add column if not exists "학교명" text;
alter table public."파견요청" add column if not exists "지회명" text;
alter table public."파견요청" add column if not exists "담당교사" text;
alter table public."파견요청" add column if not exists "담당교사연락처" text;
alter table public."파견요청" add column if not exists "장소" text;
alter table public."파견요청" add column if not exists "일정" text;
alter table public."파견요청" add column if not exists "회당시간" numeric;
alter table public."파견요청" add column if not exists "회차수" text;
alter table public."파견요청" add column if not exists "수준" text;
alter table public."파견요청" add column if not exists "출석방식" text;
alter table public."파견요청" add column if not exists "강사비기준" text;
alter table public."파견요청" add column if not exists "강사단가" text;
alter table public."파견요청" add column if not exists "보조강사단가" text;
alter table public."파견요청" add column if not exists "비고" text;
alter table public."파견요청" add column if not exists "상태" text;
alter table public."파견요청" add column if not exists "차수" text;
alter table public."파견요청" add column if not exists "회신" text;
alter table public."파견요청" add column if not exists "강좌ID" text;
alter table public."파견요청" add column if not exists "만든이" text;
alter table public."파견요청" add column if not exists "만든일시" text;
alter table public."파견요청" add column if not exists "수정일시" text;
alter table public."파견요청" enable row level security;
create table if not exists public."문의" (
  id bigint generated always as identity primary key,
  "문의ID" text,
  "지회명" text,
  "제목" text,
  "강좌ID" text,
  "파견ID" text,
  "상태" text,
  "글" text,
  "지회확인" text,
  "도협회확인" text,
  "마지막쪽" text,
  "마지막일시" text,
  "만든일시" text,
  "수정일시" text
);
alter table public."문의" add column if not exists "문의ID" text;
alter table public."문의" add column if not exists "지회명" text;
alter table public."문의" add column if not exists "제목" text;
alter table public."문의" add column if not exists "강좌ID" text;
alter table public."문의" add column if not exists "파견ID" text;
alter table public."문의" add column if not exists "상태" text;
alter table public."문의" add column if not exists "글" text;
alter table public."문의" add column if not exists "지회확인" text;
alter table public."문의" add column if not exists "도협회확인" text;
alter table public."문의" add column if not exists "마지막쪽" text;
alter table public."문의" add column if not exists "마지막일시" text;
alter table public."문의" add column if not exists "만든일시" text;
alter table public."문의" add column if not exists "수정일시" text;
alter table public."문의" enable row level security;
create table if not exists public."공지사항" (
  id bigint generated always as identity primary key,
  "공지ID" text,
  "제목" text,
  "내용" text,
  "대상" text,
  "시작일" text,
  "종료일" text,
  "상태" text,
  "등록자" text,
  "등록일시" text,
  "수정일시" text
);
alter table public."공지사항" add column if not exists "공지ID" text;
alter table public."공지사항" add column if not exists "제목" text;
alter table public."공지사항" add column if not exists "내용" text;
alter table public."공지사항" add column if not exists "대상" text;
alter table public."공지사항" add column if not exists "시작일" text;
alter table public."공지사항" add column if not exists "종료일" text;
alter table public."공지사항" add column if not exists "상태" text;
alter table public."공지사항" add column if not exists "등록자" text;
alter table public."공지사항" add column if not exists "등록일시" text;
alter table public."공지사항" add column if not exists "수정일시" text;
alter table public."공지사항" enable row level security;
create table if not exists public."자료요청" (
  id bigint generated always as identity primary key,
  "요청ID" text,
  "제목" text,
  "설명" text,
  "마감일" text,
  "대상" text,
  "상태" text,
  "등록자" text,
  "등록일시" text
);
alter table public."자료요청" add column if not exists "요청ID" text;
alter table public."자료요청" add column if not exists "제목" text;
alter table public."자료요청" add column if not exists "설명" text;
alter table public."자료요청" add column if not exists "마감일" text;
alter table public."자료요청" add column if not exists "대상" text;
alter table public."자료요청" add column if not exists "상태" text;
alter table public."자료요청" add column if not exists "등록자" text;
alter table public."자료요청" add column if not exists "등록일시" text;
alter table public."자료요청" enable row level security;
create table if not exists public."자료파일" (
  id bigint generated always as identity primary key,
  "파일ID" text,
  "요청ID" text,
  "구분" text,
  "지회명" text,
  "파일명" text,
  "경로" text,
  "크기" numeric,
  "상태" text,
  "올린이" text,
  "올린일시" text
);
alter table public."자료파일" add column if not exists "파일ID" text;
alter table public."자료파일" add column if not exists "요청ID" text;
alter table public."자료파일" add column if not exists "구분" text;
alter table public."자료파일" add column if not exists "지회명" text;
alter table public."자료파일" add column if not exists "파일명" text;
alter table public."자료파일" add column if not exists "경로" text;
alter table public."자료파일" add column if not exists "크기" numeric;
alter table public."자료파일" add column if not exists "상태" text;
alter table public."자료파일" add column if not exists "올린이" text;
alter table public."자료파일" add column if not exists "올린일시" text;
alter table public."자료파일" enable row level security;
create table if not exists public."자료회신" (
  id bigint generated always as identity primary key,
  "요청ID" text,
  "지회명" text,
  "메모" text,
  "상태" text,
  "제출일시" text,
  "반려사유" text,
  "확인일시" text,
  "수정일시" text
);
alter table public."자료회신" add column if not exists "요청ID" text;
alter table public."자료회신" add column if not exists "지회명" text;
alter table public."자료회신" add column if not exists "메모" text;
alter table public."자료회신" add column if not exists "상태" text;
alter table public."자료회신" add column if not exists "제출일시" text;
alter table public."자료회신" add column if not exists "반려사유" text;
alter table public."자료회신" add column if not exists "확인일시" text;
alter table public."자료회신" add column if not exists "수정일시" text;
alter table public."자료회신" enable row level security;
create table if not exists public."강사링크" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "토큰해시" text,
  "토큰" text,
  "만든이" text,
  "만든일시" text,
  "사용" text
);
alter table public."강사링크" add column if not exists "강좌ID" text;
alter table public."강사링크" add column if not exists "토큰해시" text;
alter table public."강사링크" add column if not exists "토큰" text;
alter table public."강사링크" add column if not exists "만든이" text;
alter table public."강사링크" add column if not exists "만든일시" text;
alter table public."강사링크" add column if not exists "사용" text;
alter table public."강사링크" enable row level security;
create table if not exists public."교육일지사진" (
  id bigint generated always as identity primary key,
  "사진ID" text,
  "강좌ID" text,
  "회차" numeric,
  "올린이" text,
  "올린일시" text
);
alter table public."교육일지사진" add column if not exists "사진ID" text;
alter table public."교육일지사진" add column if not exists "강좌ID" text;
alter table public."교육일지사진" add column if not exists "회차" numeric;
alter table public."교육일지사진" add column if not exists "올린이" text;
alter table public."교육일지사진" add column if not exists "올린일시" text;
alter table public."교육일지사진" enable row level security;
create table if not exists public."직인" (
  id bigint generated always as identity primary key,
  "지회명" text,
  "종류" text,
  "이미지" text,
  "수정일시" text
);
alter table public."직인" add column if not exists "지회명" text;
alter table public."직인" add column if not exists "종류" text;
alter table public."직인" add column if not exists "이미지" text;
alter table public."직인" add column if not exists "수정일시" text;
alter table public."직인" enable row level security;
create table if not exists public."만족도조사" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "토큰해시" text,
  "토큰" text,
  "사용" text,
  "마감일" text,
  "안내" text,
  "결과토큰해시" text,
  "결과토큰" text,
  "결과사용" text,
  "만든일시" text,
  "문항" text
);
alter table public."만족도조사" add column if not exists "강좌ID" text;
alter table public."만족도조사" add column if not exists "토큰해시" text;
alter table public."만족도조사" add column if not exists "토큰" text;
alter table public."만족도조사" add column if not exists "사용" text;
alter table public."만족도조사" add column if not exists "마감일" text;
alter table public."만족도조사" add column if not exists "안내" text;
alter table public."만족도조사" add column if not exists "결과토큰해시" text;
alter table public."만족도조사" add column if not exists "결과토큰" text;
alter table public."만족도조사" add column if not exists "결과사용" text;
alter table public."만족도조사" add column if not exists "만든일시" text;
alter table public."만족도조사" add column if not exists "문항" text;
alter table public."만족도조사" enable row level security;
create table if not exists public."만족도응답" (
  id bigint generated always as identity primary key,
  "응답ID" text,
  "강좌ID" text,
  "Q1" text,
  "Q2" text,
  "Q3" text,
  "Q4" text,
  "Q5" text,
  "의견" text,
  "제출일시" text,
  "Q6" text,
  "Q7" text,
  "Q8" text,
  "Q9" text,
  "Q10" text
);
alter table public."만족도응답" add column if not exists "응답ID" text;
alter table public."만족도응답" add column if not exists "강좌ID" text;
alter table public."만족도응답" add column if not exists "Q1" text;
alter table public."만족도응답" add column if not exists "Q2" text;
alter table public."만족도응답" add column if not exists "Q3" text;
alter table public."만족도응답" add column if not exists "Q4" text;
alter table public."만족도응답" add column if not exists "Q5" text;
alter table public."만족도응답" add column if not exists "의견" text;
alter table public."만족도응답" add column if not exists "제출일시" text;
alter table public."만족도응답" add column if not exists "Q6" text;
alter table public."만족도응답" add column if not exists "Q7" text;
alter table public."만족도응답" add column if not exists "Q8" text;
alter table public."만족도응답" add column if not exists "Q9" text;
alter table public."만족도응답" add column if not exists "Q10" text;
alter table public."만족도응답" enable row level security;
create table if not exists public."접수링크" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "토큰해시" text,
  "토큰" text,
  "사용" text,
  "마감일" text,
  "안내" text,
  "만든일시" text,
  "항목" text
);
alter table public."접수링크" add column if not exists "강좌ID" text;
alter table public."접수링크" add column if not exists "토큰해시" text;
alter table public."접수링크" add column if not exists "토큰" text;
alter table public."접수링크" add column if not exists "사용" text;
alter table public."접수링크" add column if not exists "마감일" text;
alter table public."접수링크" add column if not exists "안내" text;
alter table public."접수링크" add column if not exists "만든일시" text;
alter table public."접수링크" add column if not exists "항목" text;
alter table public."접수링크" enable row level security;
create table if not exists public."접수포스터" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "이미지" text,
  "올린일시" text
);
alter table public."접수포스터" add column if not exists "강좌ID" text;
alter table public."접수포스터" add column if not exists "이미지" text;
alter table public."접수포스터" add column if not exists "올린일시" text;
alter table public."접수포스터" enable row level security;
create table if not exists public."출석서명" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "회차" numeric,
  "참여자ID" text,
  "서명" text,
  "일시" text
);
alter table public."출석서명" add column if not exists "강좌ID" text;
alter table public."출석서명" add column if not exists "회차" numeric;
alter table public."출석서명" add column if not exists "참여자ID" text;
alter table public."출석서명" add column if not exists "서명" text;
alter table public."출석서명" add column if not exists "일시" text;
alter table public."출석서명" enable row level security;
create table if not exists public."수강생링크" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "종류" text,
  "토큰해시" text,
  "토큰" text,
  "사용" text,
  "만든일시" text
);
alter table public."수강생링크" add column if not exists "강좌ID" text;
alter table public."수강생링크" add column if not exists "종류" text;
alter table public."수강생링크" add column if not exists "토큰해시" text;
alter table public."수강생링크" add column if not exists "토큰" text;
alter table public."수강생링크" add column if not exists "사용" text;
alter table public."수강생링크" add column if not exists "만든일시" text;
alter table public."수강생링크" enable row level security;
create table if not exists public."QR출석기록" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "회차" numeric,
  "기기" text,
  "참여자ID" text,
  "결과" text,
  "일시" text
);
alter table public."QR출석기록" add column if not exists "강좌ID" text;
alter table public."QR출석기록" add column if not exists "회차" numeric;
alter table public."QR출석기록" add column if not exists "기기" text;
alter table public."QR출석기록" add column if not exists "참여자ID" text;
alter table public."QR출석기록" add column if not exists "결과" text;
alter table public."QR출석기록" add column if not exists "일시" text;
alter table public."QR출석기록" enable row level security;
create table if not exists public."수납" (
  id bigint generated always as identity primary key,
  "수납ID" text,
  "강좌ID" text,
  "지회명" text,
  "참여자ID" text,
  "금액" numeric,
  "납부일" text,
  "방법" text,
  "상태" text,
  "영수번호" text,
  "영수일" text,
  "영수상태" text,
  "환불요청일시" text,
  "환불사유" text,
  "환불은행" text,
  "환불계좌" text,
  "환불예금주" text,
  "환불일" text,
  "환불토큰해시" text,
  "환불토큰" text,
  "만든일시" text,
  "수정일시" text
);
alter table public."수납" add column if not exists "수납ID" text;
alter table public."수납" add column if not exists "강좌ID" text;
alter table public."수납" add column if not exists "지회명" text;
alter table public."수납" add column if not exists "참여자ID" text;
alter table public."수납" add column if not exists "금액" numeric;
alter table public."수납" add column if not exists "납부일" text;
alter table public."수납" add column if not exists "방법" text;
alter table public."수납" add column if not exists "상태" text;
alter table public."수납" add column if not exists "영수번호" text;
alter table public."수납" add column if not exists "영수일" text;
alter table public."수납" add column if not exists "영수상태" text;
alter table public."수납" add column if not exists "환불요청일시" text;
alter table public."수납" add column if not exists "환불사유" text;
alter table public."수납" add column if not exists "환불은행" text;
alter table public."수납" add column if not exists "환불계좌" text;
alter table public."수납" add column if not exists "환불예금주" text;
alter table public."수납" add column if not exists "환불일" text;
alter table public."수납" add column if not exists "환불토큰해시" text;
alter table public."수납" add column if not exists "환불토큰" text;
alter table public."수납" add column if not exists "만든일시" text;
alter table public."수납" add column if not exists "수정일시" text;
alter table public."수납" enable row level security;
create table if not exists public."접수묶음" (
  id bigint generated always as identity primary key,
  "묶음ID" text,
  "지회명" text,
  "제목" text,
  "강좌IDs" text,
  "토큰해시" text,
  "토큰" text,
  "사용" text,
  "마감일" text,
  "안내" text,
  "만든일시" text
);
alter table public."접수묶음" add column if not exists "묶음ID" text;
alter table public."접수묶음" add column if not exists "지회명" text;
alter table public."접수묶음" add column if not exists "제목" text;
alter table public."접수묶음" add column if not exists "강좌IDs" text;
alter table public."접수묶음" add column if not exists "토큰해시" text;
alter table public."접수묶음" add column if not exists "토큰" text;
alter table public."접수묶음" add column if not exists "사용" text;
alter table public."접수묶음" add column if not exists "마감일" text;
alter table public."접수묶음" add column if not exists "안내" text;
alter table public."접수묶음" add column if not exists "만든일시" text;
alter table public."접수묶음" enable row level security;
create table if not exists public."강사비확인증" (
  id bigint generated always as identity primary key,
  "확인증ID" text,
  "지회명" text,
  "강사명" text,
  "연락처" text,
  "은행" text,
  "계좌번호" text,
  "예금주" text,
  "기간시작" text,
  "기간종료" text,
  "항목" text,
  "총액" text,
  "원천세" text,
  "소득세" text,
  "지방소득세" text,
  "실지급액" text,
  "상태" text,
  "토큰해시" text,
  "토큰" text,
  "서명" text,
  "서명일시" text,
  "비고" text,
  "만든일시" text,
  "수정일시" text,
  "주민번호" text
);
alter table public."강사비확인증" add column if not exists "확인증ID" text;
alter table public."강사비확인증" add column if not exists "지회명" text;
alter table public."강사비확인증" add column if not exists "강사명" text;
alter table public."강사비확인증" add column if not exists "연락처" text;
alter table public."강사비확인증" add column if not exists "은행" text;
alter table public."강사비확인증" add column if not exists "계좌번호" text;
alter table public."강사비확인증" add column if not exists "예금주" text;
alter table public."강사비확인증" add column if not exists "기간시작" text;
alter table public."강사비확인증" add column if not exists "기간종료" text;
alter table public."강사비확인증" add column if not exists "항목" text;
alter table public."강사비확인증" add column if not exists "총액" text;
alter table public."강사비확인증" add column if not exists "원천세" text;
alter table public."강사비확인증" add column if not exists "소득세" text;
alter table public."강사비확인증" add column if not exists "지방소득세" text;
alter table public."강사비확인증" add column if not exists "실지급액" text;
alter table public."강사비확인증" add column if not exists "상태" text;
alter table public."강사비확인증" add column if not exists "토큰해시" text;
alter table public."강사비확인증" add column if not exists "토큰" text;
alter table public."강사비확인증" add column if not exists "서명" text;
alter table public."강사비확인증" add column if not exists "서명일시" text;
alter table public."강사비확인증" add column if not exists "비고" text;
alter table public."강사비확인증" add column if not exists "만든일시" text;
alter table public."강사비확인증" add column if not exists "수정일시" text;
alter table public."강사비확인증" add column if not exists "주민번호" text;
alter table public."강사비확인증" enable row level security;
create table if not exists public."강사정보" (
  id bigint generated always as identity primary key,
  "지회명" text,
  "강사명" text,
  "연락처" text,
  "은행" text,
  "계좌번호" text,
  "예금주" text,
  "원천세" text
);
alter table public."강사정보" add column if not exists "지회명" text;
alter table public."강사정보" add column if not exists "강사명" text;
alter table public."강사정보" add column if not exists "연락처" text;
alter table public."강사정보" add column if not exists "은행" text;
alter table public."강사정보" add column if not exists "계좌번호" text;
alter table public."강사정보" add column if not exists "예금주" text;
alter table public."강사정보" add column if not exists "원천세" text;
alter table public."강사정보" enable row level security;
create table if not exists public."접수신청" (
  id bigint generated always as identity primary key,
  "접수ID" text,
  "강좌ID" text,
  "이름" text,
  "연락처" text,
  "비고" text,
  "상태" text,
  "신청일시" text,
  "처리일시" text,
  "신청경로" text,
  "주소" text,
  "답변" text
);
alter table public."접수신청" add column if not exists "접수ID" text;
alter table public."접수신청" add column if not exists "강좌ID" text;
alter table public."접수신청" add column if not exists "이름" text;
alter table public."접수신청" add column if not exists "연락처" text;
alter table public."접수신청" add column if not exists "비고" text;
alter table public."접수신청" add column if not exists "상태" text;
alter table public."접수신청" add column if not exists "신청일시" text;
alter table public."접수신청" add column if not exists "처리일시" text;
alter table public."접수신청" add column if not exists "신청경로" text;
alter table public."접수신청" add column if not exists "주소" text;
alter table public."접수신청" add column if not exists "답변" text;
alter table public."접수신청" enable row level security;
create table if not exists public."교육일지사진자료" (
  id bigint generated always as identity primary key,
  "사진ID" text,
  "강좌ID" text,
  "회차" numeric,
  "사진" text
);
alter table public."교육일지사진자료" add column if not exists "사진ID" text;
alter table public."교육일지사진자료" add column if not exists "강좌ID" text;
alter table public."교육일지사진자료" add column if not exists "회차" numeric;
alter table public."교육일지사진자료" add column if not exists "사진" text;
alter table public."교육일지사진자료" enable row level security;
create table if not exists public."교육일지" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "회차" numeric,
  "수업일" text,
  "주제" text,
  "내용" text,
  "과제" text,
  "특이사항" text,
  "작성자" text,
  "수정일시" text,
  "작성자서명" text,
  "참가인원" text
);
alter table public."교육일지" add column if not exists "강좌ID" text;
alter table public."교육일지" add column if not exists "회차" numeric;
alter table public."교육일지" add column if not exists "수업일" text;
alter table public."교육일지" add column if not exists "주제" text;
alter table public."교육일지" add column if not exists "내용" text;
alter table public."교육일지" add column if not exists "과제" text;
alter table public."교육일지" add column if not exists "특이사항" text;
alter table public."교육일지" add column if not exists "작성자" text;
alter table public."교육일지" add column if not exists "수정일시" text;
alter table public."교육일지" add column if not exists "작성자서명" text;
alter table public."교육일지" add column if not exists "참가인원" text;
alter table public."교육일지" enable row level security;
create table if not exists public."과제" (
  id bigint generated always as identity primary key,
  "과제ID" text,
  "강좌ID" text,
  "과제명" text,
  "회차" numeric,
  "마감일" text,
  "설명" text,
  "등록일시" text
);
alter table public."과제" add column if not exists "과제ID" text;
alter table public."과제" add column if not exists "강좌ID" text;
alter table public."과제" add column if not exists "과제명" text;
alter table public."과제" add column if not exists "회차" numeric;
alter table public."과제" add column if not exists "마감일" text;
alter table public."과제" add column if not exists "설명" text;
alter table public."과제" add column if not exists "등록일시" text;
alter table public."과제" enable row level security;
create table if not exists public."과제제출" (
  id bigint generated always as identity primary key,
  "강좌ID" text,
  "과제ID" text,
  "참여자ID" text,
  "제출" text,
  "기록일시" text,
  "기록자" text
);
alter table public."과제제출" add column if not exists "강좌ID" text;
alter table public."과제제출" add column if not exists "과제ID" text;
alter table public."과제제출" add column if not exists "참여자ID" text;
alter table public."과제제출" add column if not exists "제출" text;
alter table public."과제제출" add column if not exists "기록일시" text;
alter table public."과제제출" add column if not exists "기록자" text;
alter table public."과제제출" enable row level security;
create table if not exists public."수료증발급" (
  id bigint generated always as identity primary key,
  "번호" text,
  "강좌ID" text,
  "지회명" text,
  "참여자ID" text,
  "이름" text,
  "발급일" text,
  "발급자" text,
  "발급일시" text
);
alter table public."수료증발급" add column if not exists "번호" text;
alter table public."수료증발급" add column if not exists "강좌ID" text;
alter table public."수료증발급" add column if not exists "지회명" text;
alter table public."수료증발급" add column if not exists "참여자ID" text;
alter table public."수료증발급" add column if not exists "이름" text;
alter table public."수료증발급" add column if not exists "발급일" text;
alter table public."수료증발급" add column if not exists "발급자" text;
alter table public."수료증발급" add column if not exists "발급일시" text;
alter table public."수료증발급" enable row level security;
create table if not exists public."작업로그" (
  id bigint generated always as identity primary key,
  "일시" text,
  "아이디" text,
  "작업" text,
  "내용" text
);
alter table public."작업로그" add column if not exists "일시" text;
alter table public."작업로그" add column if not exists "아이디" text;
alter table public."작업로그" add column if not exists "작업" text;
alter table public."작업로그" add column if not exists "내용" text;
alter table public."작업로그" enable row level security;

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
  allowed text[] := array['회원정보', '강좌정보', '참여자명단', '회차강사', '출석기록', '최종실적', '보고현황', '수료증서식', '강의확인서', '파견요청', '문의', '공지사항', '자료요청', '자료파일', '자료회신', '강사링크', '교육일지사진', '직인', '만족도조사', '만족도응답', '접수링크', '접수포스터', '출석서명', '수강생링크', 'QR출석기록', '수납', '접수묶음', '강사비확인증', '강사정보', '접수신청', '교육일지사진자료', '교육일지', '과제', '과제제출', '수료증발급', '작업로그'];
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
