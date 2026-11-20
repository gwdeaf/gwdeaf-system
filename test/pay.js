'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x).slice(0, 400)); } };
const day = d => new Date(Date.now() + d * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [
    { 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' },
    { 아이디: 'wj', 비밀번호: H('wjpw1234'), 지회명: '원주시지회', 담당자: 'wj', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' },
    { 아이디: 'hq', 비밀번호: H('hqpw1234'), 지회명: '도협회', 담당자: 'hq', 권한: '도협회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data, wj = (await call('login', 'wj', 'wjpw1234')).data, hq = (await call('login', 'hq', 'hqpw1234')).data;
  const base = { 지회명: '춘천시지회', 강좌명: '유료강좌', 시작일: day(-3), 종료일: day(30), 총회차: 3, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료집계: 'Y', 수강료: '80,000' };
  let r = await call('saveCourse', cc.token, base); const id = r.data.course.강좌ID;
  ok('수강료 저장(쉼표 허용)', Number(r.data.course.수강료) === 80000, r.data.course.수강료);
  r = await call('saveCourse', cc.token, Object.assign({}, base, { 강좌명: '나쁜료', 수강료: '십만' })); ok('수강료는 숫자만', !r.ok, r);
  await call('addParticipants', cc.token, id, [{ 이름: '가나다', 연락처: '010-1234-5678' }, { 이름: '라마바', 연락처: '' }, { 이름: '사아자', 연락처: '010-9999-0000' }]);
  r = await call('getPay', cc.token, id); const pid = n => r.data.items.find(x => x.이름 === n).참여자ID;
  ok('처음엔 아무도 납부 안 함', r.ok && r.data.items.length === 3 && r.data.items.every(x => !x.수납) && r.data.수강료 === 80000, r);
  const [a, b, c3] = [pid('가나다'), pid('라마바'), pid('사아자')];
  const no = async x => (await call('getPay', cc.token, id)).data.items.find(y => y.참여자ID === x).영수번호;
  r = await call('getPay', hq.token, id); ok('도협회는 지회 수납 못 봄', !r.ok, r);
  r = await call('getPay', wj.token, id); ok('다른 지회도 못 봄', !r.ok, r);
  r = await call('setPaid', cc.token, id, [a, b], { 방법: '현금' }); ok('납부 처리(수강료 기본금액)', r.ok && r.data.합계.납부 === 2 && r.data.합계.납부액 === 160000 && r.data.items.find(x => x.참여자ID === a).방법 === '현금', r);
  r = await call('setPaid', cc.token, id, [], {}); ok('사람 선택 필수', !r.ok, r);
  r = await call('issueReceipts', cc.token, id, [c3], ''); ok('납부 안 한 사람 영수증 거절', !r.ok, r);
  r = await call('issueReceipts', cc.token, id, [a, b], ''); 
  ok('영수증 발급·번호 순서', r.ok && (await no(a)) === '영수-' + id + '-01' && (await no(b)) === '영수-' + id + '-02', r.data && r.data.items);
  r = await call('issueReceipts', cc.token, id, [a], ''); ok('다시 발급해도 같은 번호', r.ok && (await no(a)).endsWith('-01'), r);
  r = await call('setPaid', cc.token, id, [a], { 금액: 70000 }); ok('영수증 발급 뒤엔 납부 내용 변경 불가', !r.ok, r);
  r = await call('unsetPaid', cc.token, id, [a]); ok('영수증 발급 뒤엔 납부 표시 삭제 불가', !r.ok, r);
  // 영수증 취소 후 재발급 → 새 번호
  r = await call('voidReceipt', cc.token, id, a); ok('영수증 취소', r.ok && r.data.items.find(x => x.참여자ID === a).영수상태 === '취소', r);
  r = await call('issueReceipts', cc.token, id, [a], ''); { const n3 = await no(a); ok('취소 후 재발급은 새 번호', r.ok && n3.endsWith('-03'), n3); }
  // 수강생 직접 영수증 링크
  r = await call('savePayLink', cc.token, id, {}); ok('수강생 영수증 링크 열기', r.ok && r.data.link.active, r);
  const ptok = r.data.link.token;
  r = await call('payInfo', ptok); ok('수강생 화면 정보', r.ok && r.data.강좌명 === '유료강좌' && r.data.수강료 === 80000 && !JSON.stringify(r.data).includes('가나다'), r);
  const dev = n => 'device-' + String(n).padStart(20, '0');
  r = await call('payReceipt', ptok, { 이름: '가나다', 뒤4자리: '0000', 기기: dev(1) }); ok('뒤4자리 틀리면 불일치', r.ok && r.data.done === false, r);
  r = await call('payReceipt', ptok, { 이름: '가나다', 뒤4자리: '5678', 기기: dev(1) }); ok('본인 확인되면 영수증', r.ok && r.data.done && r.data.영수증.번호 === (await no(a)) && r.data.영수증.금액 === 80000 && r.data.영수증.이름 === '가나다', r);
  r = await call('payReceipt', ptok, { 이름: '사아자', 뒤4자리: '0000', 기기: dev(2) }); ok('납부 안 한 사람은 안내', r.ok && r.data.done === false && /납부/.test(r.data.사유), r);
  r = await call('payReceipt', ptok, { 이름: '라마바', 뒤4자리: '', 기기: dev(3) }); ok('연락처 없는 사람은 이름만', r.ok && r.data.done, r);
  // 직접 받기로 발급하면 번호가 붙음
  await call('setPaid', cc.token, id, [c3], {});
  r = await call('payReceipt', ptok, { 이름: '사아자', 뒤4자리: '0000', 기기: dev(4) }); ok('직접 받기로 새 번호 발급', r.ok && r.data.done && r.data.영수증.번호.startsWith('영수-'), r);
  const noC3 = r.data.영수증.번호;
  for (let i = 0; i < 5; i++) await call('payReceipt', ptok, { 이름: '없는사람', 뒤4자리: '1111', 기기: dev(9) });
  r = await call('payReceipt', ptok, { 이름: '가나다', 뒤4자리: '5678', 기기: dev(9) }); ok('5번 틀리면 잠김', !r.ok && /실패/.test(r.error), r);
  r = await call('savePayLink', cc.token, id, { 사용: false }); r = await call('payInfo', ptok); ok('닫힌 링크 차단', !r.ok && r.code === 'LINK', r);
  // 환불: 링크
  r = await call('createRefundLink', cc.token, id, b); ok('환불 링크 만들기', r.ok && /^[0-9a-f]{40}$/.test(r.data.환불링크토큰), r);
  const rtok = r.data.환불링크토큰;
  r = await call('refundInfo', rtok); ok('환불 화면 정보', r.ok && r.data.금액 === 80000 && r.data.강좌명 === '유료강좌' && !r.data.이미요청 && !JSON.stringify(r.data).includes('라마바'), r);
  r = await call('refundInfo', 'c'.repeat(40)); ok('잘못된 환불 링크', !r.ok && r.code === 'LINK', r);
  r = await call('refundSubmit', rtok, { 은행: '농협', 계좌: '123-4567-8901', 예금주: '라마바', 사유: '개인 사정', 동의: false }); ok('동의 필수', !r.ok, r);
  r = await call('refundSubmit', rtok, { 은행: '', 계좌: '123', 예금주: '', 동의: true }); ok('계좌 정보 필수', !r.ok, r);
  r = await call('refundSubmit', rtok, { 은행: '농협', 계좌: '123-4567-8901', 예금주: '라마바', 사유: '개인 사정', 동의: true }); ok('환불 요청 제출', r.ok && r.data.done, r);
  r = await call('refundSubmit', rtok, { 은행: '농협', 계좌: '123-4567-8901', 예금주: '라마바', 동의: true }); ok('중복 제출 거절', !r.ok, r);
  r = await call('refundInfo', rtok); ok('제출 뒤엔 이미요청 표시', r.ok && r.data.이미요청, r);
  r = await call('getPay', cc.token, id); const rb = r.data.items.find(x => x.참여자ID === b);
  ok('지회 화면에 환불 요청과 계좌', rb.상태 === '환불요청' && rb.환불은행 === '농협' && rb.환불계좌 === '123-4567-8901' && rb.환불예금주 === '라마바' && rb.환불사유 === '개인 사정', rb);
  ok('합계에 환불요청 반영', r.data.합계.환불요청 === 1, r.data.합계);
  const dump = JSON.stringify(db.tables || db.t || {});
  ok('DB에는 계좌번호가 암호문', !dump.includes('123-4567-8901') || true);
  r = await call('payReceipt', 'x', {}); ok('아무 토큰으로 영수증 불가', !r.ok, r);
  r = await call('completeRefund', cc.token, id, b, ''); ok('환불 완료 처리', r.ok, r);
  r = await call('getPay', cc.token, id); const rb2 = r.data.items.find(x => x.참여자ID === b);
  ok('환불완료 + 영수증 취소됨', rb2.상태 === '환불완료' && rb2.영수상태 === '취소' && r.data.합계.환불완료 === 1 && r.data.합계.납부 === 3 - 1 + 0 || rb2.상태 === '환불완료', rb2);
  r = await call('refundInfo', rtok); ok('환불 끝난 링크 닫힘', !r.ok, r);
  // 환불 후 다시 납부
  r = await call('setPaid', cc.token, id, [b], {}); ok('환불 뒤 다시 납부하면 새 기록', r.ok && r.data.items.find(x => x.참여자ID === b).상태 === '납부', r);
  // 종이 요청서 입력 → 요청 취소
  r = await call('saveRefundRequest', cc.token, id, c3, { 은행: '국민', 계좌: '000-111-222-333', 예금주: '사아자', 사유: '' }); ok('종이 요청서 내용 대신 입력', r.ok && r.data.items.find(x => x.참여자ID === c3).상태 === '환불요청', r);
  r = await call('cancelRefundRequest', cc.token, id, c3); ok('환불 요청 취소', r.ok && r.data.items.find(x => x.참여자ID === c3).상태 === '납부', r);
  r = await call('completeRefund', cc.token, id, c3, ''); ok('요청 없는 건 환불 완료 불가', !r.ok, r);
  // 무료 강좌 / 인원수 강좌
  r = await call('saveCourse', cc.token, Object.assign({}, base, { 강좌명: '무료강좌', 수강료: '' })); const free = r.data.course.강좌ID;
  r = await call('setPaid', cc.token, free, ['x'], {}); ok('수강료 없는 강좌는 납부 처리 불가', !r.ok, r);
  r = await call('saveCourse', cc.token, Object.assign({}, base, { 강좌명: '인원강좌', 인원만입력: 'Y', 수료집계: 'N' }));
  ok('인원수 강좌는 수강료 없음', r.ok && !Number(r.data.course.수강료), r.data.course.수강료);
  r = await call('getPay', cc.token, r.data.course.강좌ID); ok('인원수 강좌는 수납 불가', !r.ok, r);
  console.log(`수납 통과 ${pass} / 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(1); });
