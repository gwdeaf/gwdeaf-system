'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x).slice(0, 500)); } };
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = new MemoryDb(S);
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: H(pw), 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y', 최근접속: '', 인쇄설정: '' });
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('hq', 'hqpw1234', '도협회', '도협회'), mem('cc', 'ccpw1234', '춘천시지회', '지회')] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data, hq = (await call('login', 'hq', 'hqpw1234')).data;
  const base = { 지회명: '춘천시지회', 강좌명: '점수강좌', 시작일: '2026-11-01', 종료일: '2026-12-31', 총회차: 4, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 60,
    강사: '김강사', 보조강사: '이보조', 강사비기준: '시간', 강사비단가: '50,000', 보조강사비단가: 30000, 수료배점: { 출석: 50, 과제: 30, 기타: 20 }, 기타항목명: '태도' };
  // 3. 보조강사 / 2. 강사비 / 5. 배점
  let r = await call('saveCourse', cc.token, base); ok('강좌 등록', r.ok, r);
  const c = r.data.course, id = c.강좌ID;
  ok('보조강사·강사비 저장', c.보조강사 === '이보조' && c.강사비기준 === '시간' && Number(c.강사비단가) === 50000 && Number(c.보조강사비단가) === 30000, c);
  ok('배점 저장', c.수료배점 === '출석:50,과제:30,기타:20' && c.기타항목명 === '태도', c);
  r = await call('saveCourse', cc.token, Object.assign({}, base, { 강좌명: 'x', 수료배점: { 출석: 50, 과제: 30 } })); ok('배점 합 100 아니면 거부', !r.ok, r);
  r = await call('saveCourse', cc.token, Object.assign({}, base, { 강좌명: 'y', 강사비기준: '' })); ok('단가만 있고 기준 없으면 거부', !r.ok, r);
  r = await call('saveFeeTax', cc.token, id, { 강사세율: '3.3', 보조세율: '8.8' }); ok('원천세 선택 저장', r.ok && r.data.course.강사세율 === '3.3' && r.data.course.보조세율 === '8.8', r);
  r = await call('saveFeeTax', cc.token, id, { 강사세율: '99' }); ok('이상한 세율은 비움', r.ok && r.data.course.강사세율 === '', r);
  // 성별 + 참여자
  r = await call('addParticipants', cc.token, id, [{ 이름: '가가', 연락처: '010-1111-2222', 성별: '여' }, { 이름: '나나', 성별: '남' }]); ok('성별 포함 등록', r.ok && r.data.detail.participants.some(p => p.성별 === '여'), r);
  const pids = r.data.detail.participants.map(p => p.참여자ID), P1 = pids[0], P2 = pids[1];
  // 출석: 가가 4회 전부, 나나 1회
  for (let s = 1; s <= 4; s++) await call('saveAttendance', cc.token, id, s, [P1].concat(s === 1 ? [P2] : []), '2026-11-0' + s);
  r = await call('getCourseDetail', cc.token, id); let pa = r.data.participants.find(p => p.참여자ID === P1), pb = r.data.participants.find(p => p.참여자ID === P2);
  ok('출석만(50%) → 총점 50, 미수료', pa.총점 === 50 && !pa.수료, pa);
  r = await call('saveScores', cc.token, id, P1, { 과제: 80, 기타: 70 }); pa = r.data.participants.find(p => p.참여자ID === P1);
  ok('점수 입력 → 총점 50+24+14=88 수료', r.ok && pa.총점 === 88 && pa.수료 && pa.점수.과제 === 80, pa);
  pb = r.data.participants.find(p => p.참여자ID === P2); ok('나나 총점 12.5 미수료', pb.총점 === 12.5 && !pb.수료, pb);
  r = await call('saveScores', cc.token, id, P1, { 과제: 120 }); ok('점수 범위 검사', !r.ok, r);
  r = await call('setCompletion', cc.token, id, P2, 'Y'); ok('수료 직접 선택', r.ok && r.data.participants.find(p => p.참여자ID === P2).수료, r);
  // 6. 강사 링크
  const tok = (await call('createTeacherLink', cc.token, id)).data.token;
  r = await call('tInfo', tok); ok('링크에 전화·성별·점수·배점·보조강사', r.ok && r.data.participants[0].연락처 && r.data.participants.some(p => p.성별 === '여') && r.data.course.수료배점.출석 === 50 && r.data.course.보조강사 === '이보조', r);
  r = await call('tSaveScores', tok, P2, { 과제: 100 }); ok('링크에서 점수 기록', r.ok && r.data.participants.find(p => p.참여자ID === P2).점수.과제 === 100, r);
  r = await call('tSetCompletion', tok, P2, 'N'); ok('링크에서 미수료 선택', r.ok && !r.data.participants.find(p => p.참여자ID === P2).수료, r);
  r = await call('tSetCompletion', tok, P2, ''); ok('자동으로 되돌림', r.ok && r.data.participants.find(p => p.참여자ID === P2).수료확정 === '', r);
  // 4. 일지 참가인원
  r = await call('saveJournal', cc.token, id, 1, { 수업일: '2026-11-01', 주제: '인사', 내용: '연습', 참가인원: 7 }); ok('참가인원 저장', r.ok && r.data.sessions[0].참가인원 === 7 && r.data.sessions[0].출석수 === 2, r.data && r.data.sessions[0]);
  ok('보조강사 일지에 표시', r.data.course.보조강사 === '이보조', r.data.course);
  r = await call('getJournal', cc.token, id); ok('미입력은 자동값 사용 가능', r.data.sessions[1].참가인원 === '' && r.data.sessions[1].출석수 === 1, r.data.sessions[1]);
  r = await call('saveJournal', cc.token, id, 2, { 수업일: '2026-11-02', 주제: 'a', 참가인원: -3 }); ok('참가인원 음수 거부', !r.ok, r);
  await call('setCompletion', cc.token, id, P2, 'Y');
  // 7. 수료번호 수기
  r = await call('saveCertSetting', cc.token, id, { 제목: '수료증', 번호접두어: '춘천', 번호연도: '자동', 자리수: 3, 문구: '위 사람은 ...', 기관명: '문화원', 직위: '원장', 성명: '홍' });
  ok('서식 저장', r.ok, r);
  r = await call('getCertInfo', cc.token, id); ok('다음 번호 제안', r.data.nextNo === 1, r.data.nextNo);
  r = await call('issueCerts', cc.token, id, [P1, P2], '2026-12-31', { [P1]: '8', [P2]: '7' }); if (!r.ok) console.log('ISSUE ERR', r.error); ok('수기 번호 발급', r.ok && r.data.certs.find(x => x.참여자ID === P1).번호 === '춘천-2026-008' && r.data.certs.find(x => x.참여자ID === P2).번호 === '춘천-2026-007', r.data && r.data.certs);
  r = await call('listCerts', cc.token); ok('대장은 번호 순서(7→8)', r.ok && r.data[0].번호.endsWith('007') && r.data[1].번호.endsWith('008'), r.data);
  r = await call('saveScores', cc.token, id, P2, { 과제: 90 });
  // 중복 번호
  r = await call('saveCourse', cc.token, Object.assign({}, base, { 강좌명: '두번째' })); const id2 = r.data.course.강좌ID;
  r = await call('addParticipants', cc.token, id2, [{ 이름: '다다' }]); const Q1 = r.data.detail.participants[0].참여자ID;
  await call('setCompletion', cc.token, id2, Q1, 'Y');
  await call('saveCertSetting', cc.token, id2, { 제목: '수료증', 번호접두어: '춘천', 번호연도: '자동', 자리수: 3, 문구: 'x', 기관명: '', 직위: '', 성명: '' });
  r = await call('issueCerts', cc.token, id2, [Q1], '2026-12-31', { [Q1]: '8' }); ok('중복 번호 거부', !r.ok && /중복|사용/.test(r.error), r);
  r = await call('issueCerts', cc.token, id2, [Q1], '2026-12-31', {}); ok('번호 비우면 자동(009)', r.ok && r.data.certs[0].번호 === '춘천-2026-009', r.data && r.data.certs);
  // 8. 직인
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  r = await call('saveSeal', cc.token, '지회', png); ok('지회 직인 저장', r.ok && r.data.지회 === png && r.data.센터 === '', r);
  r = await call('saveSeal', cc.token, '센터', png); ok('센터 직인 저장', r.ok && r.data.센터 === png, r);
  r = await call('saveSeal', cc.token, '지회', 'data:text/html;base64,AAAA'); ok('이미지 아니면 거부', !r.ok, r);
  r = await call('getSeals', hq.token); ok('다른 지회 직인은 안 보임', r.ok && r.data.지회 === '', r);
  r = await call('deleteSeal', cc.token, '센터'); ok('직인 삭제', r.ok && r.data.센터 === '' && r.data.지회 === png, r);
  // 9. 만족도
  r = await call('getSurvey', cc.token, id); ok('처음엔 없음', r.ok && !r.data.link.있음 && r.data.결과.응답수 === 0, r);
  r = await call('saveSurveyLink', cc.token, id, { 안내: '솔직하게 답해 주세요' }); ok('조사 링크', r.ok && r.data.link.active, r);
  const st = r.data.link.token;
  r = await call('surveyInfo', st); ok('조사 화면 정보', r.ok && r.data.문항.length === 5 && r.data.강좌명 === '점수강좌', r);
  r = await call('surveySubmit', st, { q1: 5, q2: 4, q3: 3, q4: 4, q5: 5, 의견: '좋았어요' }); ok('응답 제출', r.ok, r);
  r = await call('surveySubmit', st, { q1: 4, q2: 4, q3: 4, q4: 4, q5: 4 }); ok('응답 2', r.ok, r);
  r = await call('surveySubmit', st, { q1: 4, q2: 4, q3: 4, q4: 4 }); ok('빠진 문항 거부', !r.ok, r);
  r = await call('surveySubmit', st, { q1: 9, q2: 4, q3: 4, q4: 4, q5: 4 }); ok('범위 밖 점수 거부', !r.ok, r);
  r = await call('surveySubmit', st, { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, website: 'bot' }); ok('허니팟 무시(저장 안 됨)', r.ok, r);
  r = await call('getSurvey', cc.token, id); ok('통계', r.data.결과.응답수 === 2 && r.data.결과.문항[0].평균 === 4.5 && r.data.결과.문항[0].분포[4] === 1 && r.data.결과.의견.length === 1 && r.data.결과.전체평균 === 4.1, r.data.결과);
  r = await call('resultInfo', st); ok('조사 링크로 결과는 못 봄', !r.ok, r);
  r = await call('saveSurveyResultLink', cc.token, id, {}); ok('강사 결과 링크', r.ok && r.data.resultLink.active, r);
  const rt = r.data.resultLink.token;
  r = await call('resultInfo', rt); ok('강사가 결과 보기', r.ok && r.data.결과.응답수 === 2 && r.data.강사 === '김강사' && r.data.보조강사 === '이보조', r);
  r = await call('surveySubmit', rt, { q1: 5, q2: 5, q3: 5, q4: 5, q5: 5 }); ok('결과 링크로 응답 불가', !r.ok, r);
  r = await call('tInfo', rt); ok('결과 링크로 강사 기능 불가', !r.ok, r);
  r = await call('saveSurveyResultLink', cc.token, id, { 사용: false }); r = await call('resultInfo', rt); ok('결과 링크 끄기', !r.ok, r);
  r = await call('saveSurveyLink', cc.token, id, { 사용: false }); r = await call('surveyInfo', st); ok('조사 닫기', !r.ok, r);
  r = await call('getSurvey', hq.token, id); ok('도협회도 지회 만족도 통계 조회 가능', r.ok, r);
  console.log('9건 통과', pass, '/ 실패', fail); process.exit(fail ? 1 : 0);
})();
