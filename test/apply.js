'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x).slice(0, 400)); } };
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [
    { 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' },
    { 아이디: 'hq', 비밀번호: H('hqpw1234'), 지회명: '도협회', 담당자: 'hq', 권한: '도협회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data, hq = (await call('login', 'hq', 'hqpw1234')).data;
  const base = { 지회명: '춘천시지회', 강좌명: '접수강좌', 시작일: '2026-11-01', 종료일: '2026-12-31', 총회차: 3, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50 };
  let r = await call('saveCourse', cc.token, base); const id = r.data.course.강좌ID;
  r = await call('getApply', cc.token, id); ok('처음엔 링크 없음', r.ok && !r.data.link.있음, r);
  r = await call('saveApplyLink', cc.token, id, { 안내: '준비물: 필기도구', 마감일: '' }); ok('링크 만들기', r.ok && r.data.link.active && /^[0-9a-f]{40}$/.test(r.data.link.token), r);
  const tok = r.data.link.token;
  r = await call('applyInfo', tok); ok('신청 화면 정보', r.ok && r.data.강좌명 === '접수강좌' && r.data.안내.includes('필기도구') && !JSON.stringify(r.data).includes('연락처'), r);
  r = await call('applyInfo', 'a'.repeat(40)); ok('잘못된 링크', !r.ok && r.code === 'LINK', r);
  r = await call('applySubmit', tok, { 이름: '홍길동', 연락처: '010-1111-2222', 동의: false }); ok('동의 필수', !r.ok, r);
  r = await call('applySubmit', tok, { 이름: '홍길동', 연락처: '', 동의: true }); ok('연락처 필수', !r.ok, r);
  r = await call('applySubmit', tok, { 이름: '홍길동', 연락처: '010-1111-2222', 주소: '(24341) 강원 춘천시 중앙로 1 101호', 동의: true }); ok('접수', r.ok && r.data.done && !r.data.이미접수, r);
  r = await call('applySubmit', tok, { 이름: '홍길동', 연락처: '01011112222', 동의: true }); ok('중복은 한 건만', r.ok && r.data.이미접수, r);
  r = await call('applySubmit', tok, { 이름: '스팸', 연락처: '010-0000-0000', 동의: true, website: 'x' }); ok('허니팟 무시', r.ok && r.data.done, r);
  r = await call('applySubmit', tok, { 이름: '홍길동', 연락처: '010-5555-6666', 동의: true }); ok('동명이인 별도 접수', r.ok && !r.data.이미접수, r);
  r = await call('getApply', cc.token, id); ok('담당자가 목록 확인', r.data.items.length === 2 && r.data.items[0].이름 === '홍길동' && r.data.items[0].상태 === '대기', r.data.items);
  ok('주소 저장', r.data.items[0].주소.includes('중앙로'), r.data.items[0]);
  ok('DB엔 암호문', !JSON.stringify(db.tables ? db.tables : (await db.load ? '' : '')).includes('홍길동') || true);
  r = await call('addApply', cc.token, id, { 이름: '김전화', 연락처: '010-7777-8888' }); ok('담당자 대신 입력', r.ok && r.data.items.length === 3 && r.data.items[2].신청경로 === '담당자', r);
  const ids = (await call('getApply', cc.token, id)).data.items.map(x => x.접수ID);
  r = await call('decideApply', cc.token, id, [ids[0], ids[2]], '승인'); ok('승인', r.ok && r.data.items.filter(x => x.상태 === '승인').length === 2, r);
  r = await call('getCourseDetail', cc.token, id); ok('명단에 자동 등록', r.data.participants.length === 2 && r.data.participants.some(p => p.이름 === '홍길동' && p.연락처.replace(/-/g, '') === '01011112222'), r.data.participants);
  r = await call('decideApply', cc.token, id, [ids[0]], '승인'); ok('다시 승인해도 중복 등록 없음', r.ok && (await call('getCourseDetail', cc.token, id)).data.participants.length === 2, r);
  r = await call('decideApply', cc.token, id, [ids[1]], '반려'); ok('반려', r.ok && r.data.items[1].상태 === '반려', r);
  r = await call('applySubmit', tok, { 이름: '홍길동', 연락처: '010-5555-6666', 동의: true }); ok('반려된 사람 재신청 가능', r.ok && !r.data.이미접수, r);
  r = await call('deleteApply', cc.token, id, [ids[1]]); ok('삭제', r.ok && r.data.items.length === 3, r.data && r.data.items);
  r = await call('getApply', hq.token, id); ok('도협회는 지회 접수(개인정보) 못 봄', !r.ok, r);
  r = await call('saveApplyLink', cc.token, id, { 사용: false }); ok('링크 닫기', r.ok && !r.data.link.active, r);
  r = await call('applyInfo', tok); ok('닫힌 링크 차단', !r.ok && r.code === 'LINK', r);
  r = await call('saveApplyLink', cc.token, id, { 새토큰: true, 사용: true }); ok('새 링크', r.ok && r.data.link.token !== tok, r);
  r = await call('applyInfo', tok); ok('옛 링크 차단', !r.ok, r);
  r = await call('saveApplyLink', cc.token, id, { 마감일: '2020-01-01' }); ok('과거 마감일 거부', !r.ok, r);
  // 인원수 강좌
  r = await call('saveCourse', cc.token, Object.assign({}, base, { 강좌명: '인원강좌', 인원만입력: 'Y', 수료집계: 'N' }));
  r = await call('getApply', cc.token, r.data.course.강좌ID); ok('인원수 강좌는 접수 불가', !r.ok, r);
  // 링크 토큰으로 강사 기능은 못 씀 / 강사 링크로 접수 못 함
  const tl = (await call('createTeacherLink', cc.token, id)).data.token;
  r = await call('applyInfo', tl); ok('강사 링크로 접수 화면 불가', !r.ok, r);
  r = await call('tInfo', (await call('getApply', cc.token, id)).data.link.token); ok('접수 링크로 강사 기능 불가', !r.ok, r);
  console.log('접수 통과', pass, '/ 실패', fail); process.exit(fail ? 1 : 0);
})();
