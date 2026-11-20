'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host, purgeMedia } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x).slice(0, 400)); } };
const day = d => { const t = new Date(Date.now() + d * 86400000 + 9 * 3600000); return t.toISOString().slice(0, 10); };
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [
    { 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data;
  const base = { 지회명: '춘천시지회', 강좌명: '항목강좌', 시작일: day(-3), 종료일: day(30), 총회차: 3, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료집계: 'Y' };
  let r = await call('saveCourse', cc.token, base); const id = r.data.course.강좌ID;
  // 5. 접수 항목
  r = await call('saveApplyLink', cc.token, id, { 항목: { 주소: false, 전달할말: true, 전달할말라벨: '문의', 추가: [
    { 라벨: '청각장애 여부', 유형: '선택', 필수: true, 선택지: ['청각장애인', '비장애인'] }, { 라벨: '수어 경험', 유형: '글', 필수: false }] } });
  ok('항목 저장', r.ok && r.data.link.항목.추가.length === 2 && !r.data.link.항목.주소, r);
  const tok = r.data.link.token;
  r = await call('applyInfo', tok); ok('신청 화면에 항목', r.ok && r.data.항목.추가[0].id === 'x1' && r.data.항목.전달할말라벨 === '문의' && r.data.포스터 === '', r);
  r = await call('applySubmit', tok, { 이름: '가나', 연락처: '010-1000-2000', 동의: true }); ok('필수 항목 비면 거절', !r.ok && /청각장애 여부/.test(r.error), r);
  r = await call('applySubmit', tok, { 이름: '가나', 연락처: '010-1000-2000', 동의: true, 답변: { x1: '외계인' } }); ok('목록 밖 선택 거절', !r.ok, r);
  r = await call('applySubmit', tok, { 이름: '가나', 연락처: '010-1000-2000', 동의: true, 주소: '꺼진 주소', 답변: { x1: '청각장애인', x2: '1년' } }); ok('접수', r.ok && r.data.done, r);
  r = await call('getApply', cc.token, id); const it = r.data.items[0];
  ok('답변 저장', JSON.parse(it.답변).length === 2 && JSON.parse(it.답변)[0].값 === '청각장애인', it);
  ok('꺼진 주소는 저장 안 함', it.주소 === '', it);
  r = await call('saveApplyLink', cc.token, id, { 항목: { 추가: [{ 라벨: 'x', 유형: '선택', 선택지: ['하나'] }] } }); ok('선택지 2개 미만 거절', !r.ok, r);
  r = await call('saveApplyLink', cc.token, id, { 마감일: '' }); ok('항목을 안 보내면 유지', r.ok && r.data.link.항목.추가.length === 2, r);
  // 6. 상태 조회
  r = await call('applyStatus', tok, { 이름: '가나', 연락처: '01010002000' }); ok('상태 조회(대기)', r.ok && r.data.결과.length === 1 && r.data.결과[0].상태 === '대기' && !JSON.stringify(r.data).includes('1000'), r);
  r = await call('applyStatus', tok, { 이름: '가나', 연락처: '010-9999-9999' }); ok('연락처 틀리면 없음', r.ok && r.data.결과.length === 0, r);
  r = await call('applyStatus', tok, { 이름: '', 연락처: '010-1000-2000' }); ok('이름 필수', !r.ok, r);
  r = await call('applyStatus', 'c'.repeat(40), { 이름: '가나', 연락처: '010-1000-2000' }); ok('잘못된 링크', !r.ok && r.code === 'LINK', r);
  const aid = (await call('getApply', cc.token, id)).data.items[0].접수ID;
  await call('decideApply', cc.token, id, [aid], '승인');
  r = await call('applyStatus', tok, { 이름: '가 나', 연락처: '010-1000-2000' }); ok('승인 상태 보임', r.ok && r.data.결과[0].상태 === '승인' && /확정/.test(r.data.결과[0].안내), r);
  // 묶음 링크로도 조회
  r = await call('saveApplyGroup', cc.token, { 제목: '묶음', 강좌IDs: [id] }); const gt = r.data.groups[0].token;
  r = await call('applyStatus', gt, { 이름: '가나', 연락처: '010-1000-2000' }); ok('묶음 링크로 조회', r.ok && r.data.결과.length === 1, r);
  // 9. 포스터 이미지
  const jpg = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
  r = await call('savePosterImg', cc.token, id, 'data:image/png;base64,AAAA'); ok('JPEG 아니면 거절', !r.ok, r);
  r = await call('savePosterImg', cc.token, id, 'data:image/jpeg;base64,' + 'A'.repeat(460000)); ok('너무 크면 거절', !r.ok, r);
  r = await call('savePosterImg', cc.token, id, jpg); ok('포스터 저장 + 삭제 예정일', r.ok && r.data.포스터.있음 && r.data.포스터.삭제예정일 === (() => { const d = new Date(day(30) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 14); return d.toISOString().slice(0, 10); })(), r);
  r = await call('applyInfo', tok); ok('접수 화면에 포스터', r.ok && r.data.포스터 === jpg, r);
  r = await call('getPosterImg', cc.token, id); ok('담당자 미리보기', r.ok && r.data.이미지 === jpg, r);
  r = await call('deletePosterImg', cc.token, id); ok('포스터 삭제', r.ok && !r.data.포스터.있음, r);
  // 자동 삭제: 끝난 지 14일 넘은 강좌
  r = await call('saveCourse', cc.token, Object.assign({}, base, { 강좌명: '옛강좌', 시작일: day(-80), 종료일: day(-40) }));
  if (!r.ok) console.log('옛강좌 생성 실패(날짜 제한)', r.error);
  const old = r.ok ? r.data.course.강좌ID : null;
  if (old) {
    await db.applyOps([{ k: 'insert', t: '접수포스터', v: [{ 강좌ID: old, 이미지: jpg, 올린일시: '2026-01-01 00:00:00' }, { 강좌ID: id, 이미지: jpg, 올린일시: '2026-01-01 00:00:00' }] }]);
    const n = await purgeMedia(db);
    const left = (await db.loadTable('접수포스터')).map(x => String(x.강좌ID));
    ok('기간 지난 포스터만 자동 삭제', left.length === 1 && left[0] === id, left);
  }
  // 7. 수강생 서명
  r = await call('addParticipants', cc.token, id, [{ 이름: '서명이', 연락처: '010-1234-5678' }]);
  r = await call('saveQr', cc.token, id, {}); const qt = r.data.link.token;
  const png = 'data:image/png;base64,' + 'A'.repeat(1200);
  r = await call('attendSubmit', qt, { 이름: '서명이', 뒤4자리: '5678', 기기: 'device-' + '1'.repeat(20), 서명: 'data:image/png;base64,AAA' }); ok('빈 서명 거절', !r.ok, r);
  r = await call('attendSubmit', qt, { 이름: '서명이', 뒤4자리: '5678', 기기: 'device-' + '1'.repeat(20), 서명: png }); ok('서명과 함께 출석', r.ok && r.data.done, r);
  r = await call('getSigns', cc.token, id); const pid = Object.keys(r.data.서명)[0];
  ok('서명 조회', r.ok && pid && Object.values(r.data.서명[pid])[0] === png, r);
  r = await call('deleteJournalMedia', cc.token, id); ok('사진·서명 삭제에 수강생 서명 포함', r.ok && Object.keys((await call('getSigns', cc.token, id)).data.서명).length === 0, r);
  // 8. 직통번호
  r = await call('saveMyContact', cc.token, '033-111-2222', '033-333-4444', '033-555-6666'); ok('직통번호 저장', r.ok && r.data.직통번호 === '033-555-6666', r);
  r = await call('getInitData', cc.token); ok('초기 데이터에 직통번호', r.ok && r.data.myDirect === '033-555-6666', r.data && r.data.myDirect);
  r = await call('saveMyContact', cc.token, '033-111-2222', '033-333-4444'); ok('안 보내면 유지', r.ok && r.data.직통번호 === '033-555-6666', r);
  console.log('접수 항목·상태·포스터·서명 통과', pass, '/ 실패', fail); process.exit(fail ? 1 : 0);
})();
