'use strict';
// 링크 미리보기(카카오톡 등) — 링크 종류별 제목과 화면 파일
//  file: edu 안 화면 파일 / t1·t2: 미리보기 이미지 큰 글씨 두 줄 / title: 미리보기 제목
//  table·hash·col: 토큰으로 강좌(지회)를 찾는 곳 (토큰해시 = sha256(접두어|토큰))
module.exports = {
  a: { file: 'apply.html',   t1: '수어교육', t2: '수강 신청',   title: '수어교육 수강 신청', table: '접수링크',   col: '토큰해시',     pre: 'apply-link|' },
  g: { file: 'group.html',   t1: '수어교육', t2: '수강 신청',   title: '수어교육 수강 신청', table: '접수묶음',   col: '토큰해시',     pre: 'group-link|' },
  t: { file: 'teacher.html', t1: '수어교육', t2: '강사 페이지', title: '수어교육 강사 페이지', table: '강사링크', col: '토큰해시',     pre: 'teacher-link|' },
  s: { file: 'survey.html',  t1: '수어교육', t2: '만족도 조사', title: '수어교육 만족도 조사', table: '만족도조사', col: '토큰해시',   pre: 'survey-link|' },
  r: { file: 'result.html',  t1: '수어교육', t2: '조사 결과',   title: '수어교육 만족도 조사 결과', table: '만족도조사', col: '결과토큰해시', pre: 'survey-result|' },
  q: { file: 'attend.html',  t1: '수어교육', t2: '출석',       title: '수어교육 출석', table: '수강생링크', col: '토큰해시', pre: 'stu-link|' },
  p: { file: 'receipt.html', t1: '수어교육', t2: '수강료 영수증', title: '수어교육 수강료 영수증' },
  x: { file: 'refund.html',  t1: '수어교육', t2: '환불 신청',   title: '수어교육 수강료 환불 신청' },
  f: { file: 'fee.html',     t1: '수어교육', t2: '수강료 납부', title: '수어교육 수강료 납부 확인' },
  home: { t1: '업무 시스템', t2: '', title: '강원특별자치도농아인협회 업무 시스템' },
};
