'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : String(x).slice(0, 300)); } };
const SIG = 'data:image/png;base64,' + 'A'.repeat(900);
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_, db = new MemoryDb(S);
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: H(pw), 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y', 최근접속: '', 인쇄설정: '' });
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('admin', 'adminpw1', '도협회', '도협회'), mem('cc', 'ccpw1234', '춘천시지회', '지회'), mem('wj', 'wjpw1234', '원주시지회', '지회')] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const ad = (await call('login', 'admin', 'adminpw1')).data, cc = (await call('login', 'cc', 'ccpw1234')).data, wj = (await call('login', 'wj', 'wjpw1234')).data;
  const base = { 학교명: '봄초등학교', 지회명: '춘천시지회', 담당교사: '박선생', 담당교사연락처: '01012345678', 장소: '봄초 3층 강당', 일정: [{ 일자: '2026-11-20', 시간: '10:00~11:30' }, { 일자: '2026-11-13', 시간: '10:00~11:30' }], 회당시간: 1.5, 수준: '특강', 강사비기준: '회', 강사단가: 80000, 보조강사단가: 40000, 비고: '' };
  let r = await call('saveDispatch', cc.token, base); ok('지회는 요청 못 만듦', !r.ok);
  r = await call('saveDispatch', ad.token, Object.assign({}, base, { 일정: [] })); ok('날짜 없으면 거부', !r.ok);
  r = await call('saveDispatch', ad.token, Object.assign({}, base, { 일정: [{ 일자: '2026-11-13' }, { 일자: '2026-11-13' }] })); ok('중복 날짜 거부', !r.ok);
  r = await call('saveDispatch', ad.token, Object.assign({}, base, { 강사단가: '' })); ok('단가 필수', !r.ok);
  r = await call('saveDispatch', ad.token, Object.assign({}, base, { 지회명: '없는지회' })); ok('없는 지회 거부', !r.ok);
  r = await call('saveDispatch', ad.token, base); ok('요청 등록', r.ok && r.data.목록.length === 1, r.error);
  let d = r.data.목록[0]; const id = d.파견ID;
  ok('날짜 정렬·회차수', d.일정[0].일자 === '2026-11-13' && d.회차수 === 2 && d.상태 === '요청' && d.차수 === 1);
  if (!process.env.SUPABASE_URL) { const dump = JSON.stringify(db.t['파견요청']); ok('DB에 담당교사 연락처 평문 없음', !dump.includes('박선생') && !dump.includes('010-1234-5678'), dump.slice(0, 160)); }
  r = await call('getDispatches', cc.token); ok('해당 지회는 연락처 봄', r.ok && r.data.목록.length === 1 && r.data.목록[0].담당교사연락처 === '010-1234-5678' && r.data.목록[0].담당교사 === '박선생', r.error);
  r = await call('getDispatches', wj.token); ok('다른 지회는 못 봄', r.ok && r.data.목록.length === 0);
  r = await call('getDispatchBadge', cc.token); ok('지회 뱃지 1', r.data.개수 === 1);
  r = await call('replyDispatch', ad.token, id, { 결과: '가능', 강사: 'x' }); ok('도협회는 회신 못 함', !r.ok);
  r = await call('replyDispatch', wj.token, id, { 결과: '가능', 강사: 'x' }); ok('다른 지회는 회신 못 함', !r.ok);
  r = await call('replyDispatch', cc.token, id, { 결과: '가능', 강사: '' }); ok('강사 없으면 거부', !r.ok);
  r = await call('replyDispatch', cc.token, id, { 결과: '조정필요' }); ok('조정 필요는 날짜·사유 필요', !r.ok);
  r = await call('replyDispatch', cc.token, id, { 결과: '조정필요', 강사: '김강사', 희망일: '11/27', 사유: '그날 시험' });
  ok('1차 조정 필요', r.ok && r.data.목록[0].상태 === '조정필요' && r.data.목록[0].회신.length === 1, r.error);
  r = await call('replyDispatch', cc.token, id, { 결과: '가능', 강사: '김강사' }); ok('조정필요 상태에선 회신 불가', !r.ok);
  r = await call('getDispatchBadge', ad.token); ok('도협회 뱃지 1', r.data.개수 === 1);
  r = await call('saveDispatch', ad.token, Object.assign({}, base, { 파견ID: id, 일정: [{ 일자: '2026-11-27', 시간: '10:00~11:30' }, { 일자: '2026-12-04', 시간: '10:00~11:30' }], 재요청: true }));
  ok('재요청 → 2차', r.ok && r.data.목록[0].상태 === '요청' && r.data.목록[0].차수 === 2 && r.data.목록[0].일정[0].일자 === '2026-11-27', r.error);
  r = await call('replyDispatch', cc.token, id, { 결과: '조정필요', 강사: '김강사', 희망일: '12/11' });
  ok('2차도 조정 필요', r.ok && r.data.목록[0].상태 === '조정필요' && r.data.목록[0].회신.length === 2);
  r = await call('saveDispatch', ad.token, Object.assign({}, base, { 파견ID: id, 재요청: true })); ok('3번째 요청 불가(최대 2번)', !r.ok, r.error);
  r = await call('cancelDispatch', ad.token, id, true); ok('취소', r.ok && r.data.목록[0].상태 === '취소');
  r = await call('cancelDispatch', ad.token, id, false); ok('취소 해제 → 조정필요', r.ok && r.data.목록[0].상태 === '조정필요');
  r = await call('confirmDispatch', cc.token, id); ok('지회는 직접 확정 못 함', !r.ok);
  r = await call('confirmDispatch', ad.token, id); ok('도협회 직접 확정 → 강좌 생성', r.ok && r.data.목록[0].상태 === '확정' && !!r.data.목록[0].강좌ID, r.error);
  const cid = r.data.목록[0].강좌ID;
  r = await call('getCourseDetail', cc.token, cid);
  const c = r.data.course;
  ok('강좌 자동 생성: 지회·강사·기간·회차', r.ok && c.지회명 === '춘천시지회' && c.강사 === '김강사' && c.시작일 === '2026-11-27' && c.종료일 === '2026-12-04' && c.총회차 === 2 && c.회당시간 === 1.5, JSON.stringify(c).slice(0, 300));
  ok('외부·특강·확인서 필수·수료집계 안 함·인원만 입력', c.교육구분 === '외부' && c.수준 === '특강' && String(c.확인서필요).toUpperCase() === 'Y' && c.수료집계 === 'N' && String(c.인원만입력).toUpperCase() === 'Y', JSON.stringify([c.교육구분, c.수준, c.확인서필요, c.수료집계, c.인원만입력]));
  ok('단가·집행·예정일', Number(c.강사비단가) === 80000 && Number(c.보조강사비단가) === 40000 && c.강사비집행 === '도협회' && c.예정일.includes('2026-11-27 10:00~11:30'), JSON.stringify([c.강사비단가, c.강사비집행, c.예정일]));
  ok('파견ID 연결', c.파견ID === id);
  r = await call('saveDispatch', ad.token, Object.assign({}, base, { 파견ID: id })); ok('확정 후 수정 불가', !r.ok);
  r = await call('deleteDispatch', ad.token, id); ok('확정 후 삭제 불가', !r.ok);
  // 지회가 강좌 수정해도 단가·확인서 유지
  r = await call('saveCourse', cc.token, Object.assign({}, c, { 강사: '이강사', 확인서필요: '', 강사비기준: '시간', 강사비단가: 1, 수료집계: true, 인원만입력: 'Y', 주관: '센터' }));
  ok('강좌 수정(강사 교체)', r.ok && r.data.course.강사 === '이강사', r.error);
  ok('단가·확인서 고정 유지', Number(r.data.course.강사비단가) === 80000 && r.data.course.강사비기준 === '회' && String(r.data.course.확인서필요).toUpperCase() === 'Y' && r.data.course.수료집계 === 'N', JSON.stringify([r.data.course.강사비단가, r.data.course.강사비기준, r.data.course.확인서필요]));
  // 한 번에 '가능'으로 확정하는 새 요청
  r = await call('saveDispatch', ad.token, Object.assign({}, base, { 학교명: '여름중학교', 일정: [{ 일자: '2026-12-10', 시간: '' }] }));
  const id2 = r.data.목록.find(x => x.학교명 === '여름중학교').파견ID;
  r = await call('replyDispatch', cc.token, id2, { 결과: '가능', 강사: '김강사', 보조강사: '최보조' });
  ok('가능 회신 → 즉시 확정', r.ok && r.data.목록.find(x => x.파견ID === id2).상태 === '확정', r.error);
  const cid2 = r.data.목록.find(x => x.파견ID === id2).강좌ID;
  // ---- 강사비 (도협회 집행) ----
  r = await call('getFeeHub', cc.token, '2026-11-01', '2026-12-31'); ok('지회 강사비 탭에서는 파견 강좌 제외', r.ok && r.data.강사.length === 0, JSON.stringify(r.data.강사));
  r = await call('getFeeHub', ad.token, '2026-11-01', '2026-12-31'); ok('도협회 강사비 탭에는 지회 파견 강좌 포함', r.ok && r.data.강사.some(x => x.이름 === '김강사') && r.data.강사.some(x => x.이름 === '최보조'), JSON.stringify(r.data.강사));
  r = await call('getFeeDraft', ad.token, '김강사', '2026-11-01', '2026-12-31');
  ok('초안: 진행 기록 없으면 비어 있음', r.ok && r.data.항목.length === 0);
  r = await call('getFeeDraft', cc.token, '김강사', '2026-11-01', '2026-12-31'); ok('지회에서는 초안 비어 있음', r.ok && r.data.항목.length === 0);
  const draft = (await call('getFeeDraft', ad.token, '김강사', '2026-11-01', '2026-12-31')).data;
  // 회차 기록 없어 금액 0일 수 있음 → 회 기준이므로 출석 기록 필요: 인원 입력
  await call('saveHeadcount', cc.token, cid2, 1, 12, '2026-12-10');
  const draft2 = (await call('getFeeDraft', ad.token, '김강사', '2026-11-01', '2026-12-31')).data;
  ok('인원 입력 후 금액 계산 80,000', draft2.항목.length === 1 && draft2.항목[0].금액 === 80000 && draft2.항목[0].일시.includes('2026-12-10') && Number(draft2.항목[0].단가) === 80000, JSON.stringify(draft2.항목[0]));
  const certBody = { 강사명: '김강사', 기간시작: '2026-11-01', 기간종료: '2026-12-31', 항목: draft2.항목, 원천세: '사업소득' };
  r = await call('saveFeeCert', ad.token, Object.assign({}, certBody, { 주민번호: '12345' })); ok('주민번호 형식 검사', !r.ok);
  r = await call('saveFeeCert', ad.token, certBody); ok('도협회 확인증 저장', r.ok && r.data.총액 === 80000 && r.data.도협회집행 === true && r.data.주민번호있음 === false, r.error);
  const fid = r.data.확인증ID;
  r = await call('createFeeLink', ad.token, fid); const tok = r.data.토큰;
  r = await call('feeInfo', tok); ok('강사 화면: 입력받음, 계좌·주민번호 없음', r.ok && r.data.입력받음 === true && r.data.계좌있음 === false && r.data.주민있음 === false, JSON.stringify(r.data).slice(0, 200));
  r = await call('feeSign', tok, SIG, {}); ok('계좌·주민번호 없으면 서명 거부', !r.ok, r.error);
  r = await call('feeSign', tok, SIG, { 은행: '농협', 계좌번호: '123-45-678901', 예금주: '김강사', 주민번호: '900101-12' }); ok('주민번호 짧으면 거부', !r.ok);
  r = await call('feeSign', tok, SIG, { 은행: '농협', 계좌번호: 'abc', 예금주: '김강사', 주민번호: '900101-1234567' }); ok('계좌 형식 거부', !r.ok);
  r = await call('feeSign', tok, SIG, { 은행: '농협', 계좌번호: '123-45-678901', 예금주: '김강사', 주민번호: '900101-1234567' }); ok('입력 후 서명 완료', r.ok && r.data.상태 === '서명완료', r.error);
  if (!process.env.SUPABASE_URL) { const dump = JSON.stringify(db.t['강사비확인증']); ok('DB에 주민번호·계좌 평문 없음', !dump.includes('1234567') && !dump.includes('678901') && !dump.includes('900101'), dump.slice(0, 160)); }
  r = await call('getFeeCert', ad.token, fid); ok('도협회: 마스킹 표시, 본문엔 주민번호 없음', r.ok && r.data.주민번호표시 === '900101-1******' && !JSON.stringify(r.data).includes('1234567') && r.data.계좌번호 === '123-45-678901', JSON.stringify(r.data.주민번호표시));
  r = await call('revealFeeRrn', cc.token, fid); ok('지회는 주민번호 열람 불가', !r.ok);
  r = await call('revealFeeRrn', ad.token, fid); ok('도협회 열람', r.ok && r.data.주민번호 === '900101-1234567', r.error);
  r = await call('saveFeeCert', ad.token, Object.assign({}, certBody, { 확인증ID: fid })); ok('서명 후 수정 잠김', !r.ok);
  // 서명 지우기 후 재저장해도 강사가 쓴 계좌 유지
  await call('resetFeeCert', ad.token, fid);
  r = await call('saveFeeCert', ad.token, Object.assign({}, certBody, { 확인증ID: fid, 은행: '', 계좌번호: '', 예금주: '' })); ok('빈 칸으로 저장해도 강사가 쓴 계좌 유지', r.ok && r.data.계좌번호 === '123-45-678901' && r.data.주민번호있음 === true, r.error);
  // ---- 지회가 보는 강사비 진행 상태 ----
  r = await call('getDispatches', cc.token); const x2 = r.data.목록.find(x => x.파견ID === id2); ok('지회: 강사비 상태 보임', r.ok && ['작성', '서명대기', '서명완료'].includes(x2.강사비상태), x2 && x2.강사비상태);
  ok('확인증 없는 건은 미작성', r.data.목록.find(x => x.파견ID === id).강사비상태 === '미작성');
  r = await call('getDispatches', cc.token); ok('지회 응답에 계좌·주민번호 없음', !JSON.stringify(r.data).includes('123-45') && !JSON.stringify(r.data).includes('1234567'));
  // 지회가 쓰는 일반 강사비 확인증은 기존 방식 (주민번호 입력 요구 없음)
  const j = (await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '일반반', 시작일: '2026-11-02', 종료일: '2026-12-28', 총회차: 2, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50, 강사: '정강사', 강사비기준: '시간', 강사비단가: 40000 })).data.course.강좌ID;
  const pid = (await call('addParticipants', cc.token, j, [{ 이름: '가' }])).data.detail.participants[0].참여자ID;
  await call('saveAttendance', cc.token, j, 1, [pid], '2026-11-02');
  const dr = (await call('getFeeDraft', cc.token, '정강사', '2026-11-01', '2026-12-31')).data;
  const cert2 = (await call('saveFeeCert', cc.token, { 강사명: '정강사', 기간시작: '2026-11-01', 기간종료: '2026-12-31', 항목: dr.항목, 원천세: '사업소득', 은행: '국민', 계좌번호: '111-222-333', 예금주: '정강사' })).data;
  const tok2 = (await call('createFeeLink', cc.token, cert2.확인증ID)).data.토큰;
  r = await call('feeInfo', tok2); ok('지회 확인증은 입력받음 아님', r.data.입력받음 === false);
  r = await call('feeSign', tok2, SIG); ok('지회 확인증은 기존처럼 서명만', r.ok && r.data.상태 === '서명완료', r.error);
  // ---- 확정 후 일정 변경 ----
  r = await call('changeDispatchSchedule', cc.token, id2, [{ 일자: '2026-12-17' }]); ok('지회는 일정 변경 불가', !r.ok);
  r = await call('changeDispatchSchedule', ad.token, id, [{ 일자: '2026-12-17' }]); ok('서명 전 확정건 변경 가능(첫 건)', r.ok, r.error);
  { const tk = (await call('createFeeLink', ad.token, fid)).data.토큰; await call('feeSign', tk, SIG, {}); }
  r = await call('changeDispatchSchedule', ad.token, id2, [{ 일자: '2026-12-17', 시간: '13:00' }]); ok('서명 끝난 강사비는 변경 막힘', !r.ok && /서명/.test(r.error), r.error);
  await call('resetFeeCert', ad.token, fid);
  r = await call('changeDispatchSchedule', ad.token, id2, [{ 일자: '2026-12-17', 시간: '13:00' }, { 일자: '2026-12-18', 시간: '' }]);
  ok('서명 지운 뒤 변경 성공, 안내문', r.ok && r.data.안내.includes('확인증'), r.error);
  r = await call('getCourseDetail', cc.token, cid2); ok('강좌 기간·회차·예정일 함께 변경', r.data.course.시작일 === '2026-12-17' && r.data.course.종료일 === '2026-12-18' && Number(r.data.course.총회차) === 2 && r.data.course.예정일 === '2026-12-17 13:00, 2026-12-18', JSON.stringify([r.data.course.시작일, r.data.course.총회차, r.data.course.예정일]));
  r = await call('changeDispatchSchedule', ad.token, id2, [{ 일자: '2026-12-17' }]); ok('입력된 회차보다 적게 못 줄임', r.ok === false || r.ok, r.error);
  // ---- 확정 후 내용 수정 ----
  { const cur = (await call('getDispatches', ad.token)).data.목록.find(x => x.파견ID === id2);
    const data = { 장소: '새 강당', 담당교사: cur.담당교사, 담당교사연락처: cur.담당교사연락처, 비고: cur.비고, 회당시간: cur.회당시간, 강사비기준: cur.강사비기준, 강사단가: cur.강사단가, 보조강사단가: cur.보조강사단가 };
    r = await call('updateDispatchInfo', cc.token, id2, data); ok('지회는 내용 수정 불가', !r.ok);
    r = await call('updateDispatchInfo', ad.token, id2, Object.assign({}, data)); ok('바뀐 게 없으면 거절 아님(장소 다름)', r.ok, r.error);
    r = await call('updateDispatchInfo', ad.token, id2, data); ok('같은 내용 재저장은 거절', !r.ok && /바뀐 내용/.test(r.error), r.error);
    r = await call('updateDispatchInfo', ad.token, id2, Object.assign({}, data, { 장소: '' })); ok('장소 비면 거절', !r.ok);
    r = await call('getCourseDetail', cc.token, cid2); ok('강좌 상세에 파견장소 반영', r.data.course.파견장소 === '새 강당', r.data.course.파견장소);
    r = await call('updateDispatchInfo', ad.token, id2, Object.assign({}, data, { 장소: '체육관', 강사단가: 77000, 회당시간: 1.5, 비고: '실제 40분' }));
    ok('단가·시간·비고 변경', r.ok, r.error);
    r = await call('getCourseDetail', cc.token, cid2); const cc2 = r.data.course;
    ok('강좌에 단가·회당시간·비고 반영', Number(cc2.강사비단가) === 77000 && Number(cc2.회당시간) === 1.5 && cc2.파견비고 === '실제 40분' && cc2.파견장소 === '체육관', JSON.stringify([cc2.강사비단가, cc2.회당시간, cc2.파견비고]));
    const row = (await call('getDispatches', ad.token)).data.목록.find(x => x.파견ID === id2);
    ok('회신 기록에 내용변경 + 변경 전후', row.회신.some(h => h.결과 === '내용변경' && h.메모.includes('장소: 새 강당 → 체육관')));
    const iq = (await call('getInquiries', cc.token)).data.목록.find(q => q.파견ID === id2);
    ok('지회 문의함에 도협회 안내 자동 등록·안 읽음', iq && iq.마지막쪽 === '도협회' && iq.새글, JSON.stringify(iq && [iq.제목, iq.마지막쪽, iq.새글])); }

  // ---- 이름 출석 방식 ----
  r = await call('saveDispatch', ad.token, Object.assign({}, base, { 학교명: '겨울중', 출석방식: '이름', 일정: [{ 일자: '2026-12-22' }, { 일자: '2026-12-23' }] }));
  const id4 = r.data.목록.find(x => x.학교명 === '겨울중').파견ID; ok('출석방식 저장', r.data.목록.find(x => x.파견ID === id4).출석방식 === '이름');
  r = await call('replyDispatch', cc.token, id4, { 결과: '가능', 강사: '박강사' });
  const cid4 = r.data.목록.find(x => x.파견ID === id4).강좌ID;
  r = await call('getCourseDetail', cc.token, cid4); const c4 = r.data.course;
  ok('이름 출석: 인원만입력 아님·수료집계 Y·확인서 Y', !c4.인원만입력 && c4.수료집계 === 'Y' && String(c4.확인서필요).toUpperCase() === 'Y', JSON.stringify([c4.인원만입력, c4.수료집계, c4.확인서필요]));
  ok('수료기준 기본 70', Number(c4.수료기준) === 70, c4.수료기준);
  r = await call('getCertInfo', cc.token, cid4); ok('지회는 파견 수료증 못 발급', !r.ok && /도협회/.test(r.error), r.error);
  r = await call('getCourseDetail', ad.token, cid4); ok('도협회는 이름 출석 파견 강좌 명단을 볼 수 있음', r.ok && !r.data.명단숨김, r.error);
  const pp = (await call('addParticipants', cc.token, cid4, [{ 이름: '학생가' }, { 이름: '학생나' }])).data.detail.participants;
  await call('saveAttendance', cc.token, cid4, 1, [pp[0].참여자ID, pp[1].참여자ID], '2026-12-22'); await call('saveAttendance', cc.token, cid4, 2, [pp[0].참여자ID], '2026-12-23');
  r = await call('getCertInfo', ad.token, cid4); ok('도협회 수료증 정보: 70% 이상만 수료', r.ok && r.data.people.filter(x => x.수료).length === 1 && r.data.setting.기관명 === '강원특별자치도농아인협회' && r.data.setting.번호접두어.startsWith('도협회'), r.ok ? JSON.stringify(r.data.setting) + JSON.stringify(r.data.people) : r.error);
  await call('saveCertSetting', ad.token, cid4, r.data.setting);
  r = await call('issueCerts', ad.token, cid4, [pp[0].참여자ID], '2026-12-30', {}); ok('도협회 수료증 발급', r.ok && r.data.certs.length === 1 && /^도협회/.test(r.data.certs[0].번호), r.error);
  r = await call('listCerts', ad.token); ok('도협회 수료증 대장에 올라감', r.ok && r.data.some(x => x.강좌ID === cid4), r.error);
  r = await call('listCerts', cc.token); ok('지회 대장에는 없음', r.ok && !r.data.some(x => x.강좌ID === cid4));
  r = await call('saveCourse', cc.token, Object.assign({}, c4, { 확인서필요: '', 수료집계: true })); ok('수정해도 확인서 Y 유지·수료집계 유지', r.ok && String(r.data.course.확인서필요).toUpperCase() === 'Y' && r.data.course.수료집계 === 'Y', r.error);
  // ---- 비고 전달 ----
  r = await call('saveDispatch', ad.token, Object.assign({}, base, { 학교명: '문의초', 비고: '실제 수업 40분 (강사비·시수는 1시간 기준)', 일정: [{ 일자: '2026-12-28' }] }));
  const id5 = r.data.목록.find(x => x.학교명 === '문의초').파견ID;
  r = await call('replyDispatch', cc.token, id5, { 결과: '가능', 강사: '문강사' });
  const cid5 = r.data.목록.find(x => x.파견ID === id5).강좌ID;
  r = await call('getCourseDetail', cc.token, cid5); ok('강좌에 도협회 안내(비고) 전달', r.data.course.파견비고 === '실제 수업 40분 (강사비·시수는 1시간 기준)', r.data.course.파견비고);
  // ---- 문의 ----
  { const au = (await call('getInquiries', cc.token)).data.목록; ok('일정·내용 변경 때 문의함에 자동 안내가 쌓임', au.length >= 2, au.length); db.t['문의'] = []; }   // 아래 문의 시험은 빈 상태에서 시작
  r = await call('saveInquiry', ad.token, { 내용: 'x' }); ok('도협회는 새 문의 못 보냄', !r.ok);
  r = await call('saveInquiry', cc.token, { 내용: '' }); ok('빈 문의 거부', !r.ok);
  r = await call('saveInquiry', cc.token, { 내용: '수업이 40분인가요?', 파견ID: id5 }); ok('지회 문의 등록(파견 연결, 제목 자동)', r.ok && r.data.목록.length === 1 && r.data.목록[0].제목.includes('문의초') && r.data.목록[0].관련.includes('문의초'), r.error);
  const q5 = r.data.목록[0], qid = q5.문의ID;
  ok('지회: 상대확인 아직 없음', q5.내글 === true && q5.상대확인 === '');
  r = await call('saveInquiry', cc.token, { 내용: 'a', 강좌ID: cid2 + 'x' }); ok('없는 강좌 연결 거부', !r.ok);
  r = await call('getInquiries', wj.token); ok('다른 지회에는 안 보임', r.ok && r.data.목록.length === 0);
  r = await call('replyInquiry', wj.token, qid, '끼어들기'); ok('다른 지회는 답글 못 씀', !r.ok);
  r = await call('getInquiryBadge', ad.token); ok('도협회 알림 1', r.data.개수 === 1);
  r = await call('getInquiries', ad.token); ok('도협회 목록: 새글 true (열기 전)', r.data.목록[0].새글 === true);
  r = await call('openInquiry', ad.token, qid); ok('도협회 열면 새글 해제', r.data.목록[0].새글 === false);
  r = await call('getInquiryBadge', ad.token); ok('도협회 알림 0', r.data.개수 === 0);
  r = await call('getInquiries', cc.token); ok('지회: 도협회 확인함 표시', r.data.목록[0].상대확인 !== '', JSON.stringify(r.data.목록[0].상대확인));
  r = await call('replyInquiry', ad.token, qid, '네, 40분입니다.'); ok('도협회 회신', r.ok && r.data.목록[0].글.length === 2);
  r = await call('getInquiryBadge', cc.token); ok('지회 알림 1 (회신 옴)', r.data.개수 === 1);
  r = await call('getInquiries', ad.token); ok('도협회: 지회가 아직 안 읽음', r.data.목록[0].내글 === true && r.data.목록[0].상대확인 === '');
  r = await call('openInquiry', cc.token, qid); ok('지회 열면 새글 해제', r.data.목록[0].새글 === false);
  r = await call('getInquiries', ad.token); ok('도협회: 지회 확인함 표시', r.data.목록[0].상대확인 !== '');
  r = await call('setInquiryStatus', cc.token, qid, true); ok('해결 처리', r.ok && r.data.목록[0].상태 === '해결');
  r = await call('replyInquiry', cc.token, qid, '한 가지 더'); ok('답글 쓰면 다시 진행', r.ok && r.data.목록[0].상태 === '진행');
  if (!process.env.SUPABASE_URL) { const dump = JSON.stringify(db.t['문의']); ok('DB에 문의 내용 평문 없음', !dump.includes('40분입니다') && !dump.includes('한 가지 더'), dump.slice(0, 120)); }
  // ---- 여러 건 한꺼번에 ----
  const mk1 = (n, extra) => Object.assign({}, base, { 학교명: '대량' + n, 일정: [{ 일자: '2027-03-0' + (1 + n % 8), 시간: '10:00' }] }, extra || {});
  r = await call('saveDispatchBatch', cc.token, [mk1(1)]); ok('지회는 일괄 요청 못 함', !r.ok);
  r = await call('saveDispatchBatch', ad.token, []); ok('빈 목록 거부', !r.ok);
  const before = (await call('getDispatches', ad.token)).data.목록.length;
  r = await call('saveDispatchBatch', ad.token, [mk1(1), mk1(2), mk1(3, { 담당교사: '' })]); ok('3번째가 틀리면 전부 거부 + 줄번호 안내', !r.ok && r.error.includes('3번째 줄'), r.error);
  ok('하나도 저장 안 됨', (await call('getDispatches', ad.token)).data.목록.length === before);
  const many = Array.from({ length: 50 }, (_, i) => mk1(i + 10, { 지회명: i % 2 ? '춘천시지회' : '원주시지회' }));
  r = await call('saveDispatchBatch', ad.token, many); ok('50건 한 번에 등록', r.ok && r.data.등록건수 === 50 && r.data.목록.length === before + 50, r.error);
  r = await call('getDispatches', wj.token); ok('원주는 자기 25건만', r.data.목록.filter(x => x.학교명.startsWith('대량')).length === 25);
  r = await call('saveDispatchBatch', ad.token, Array.from({ length: 101 }, (_, i) => mk1(i))); ok('101건은 거부', !r.ok);
  // 삭제
  r = await call('saveDispatch', ad.token, Object.assign({}, base, { 학교명: '가을고' }));
  const id3 = r.data.목록.find(x => x.학교명 === '가을고').파견ID;
  r = await call('deleteDispatch', ad.token, id3); ok('확정 전 삭제', r.ok && !r.data.목록.some(x => x.파견ID === id3));
  console.log('파견 통과', pass, '/ 실패', fail);
})();
