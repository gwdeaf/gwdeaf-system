'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 600)); } };
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_, db = new MemoryDb(S);
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: H(pw), 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y', 최근접속: '', 인쇄설정: '' });
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('cc', 'ccpw1234', '춘천시지회', '지회'), mem('wj', 'wjpw1234', '원주시지회', '지회')] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data, wj = (await call('login', 'wj', 'wjpw1234')).data;
  const mk = async (name, lv) => (await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: name, 시작일: '2026-11-02', 종료일: '2026-12-28', 총회차: 4, 회당시간: 2, 수준: lv, 교육구분: '내부', 주관: '지회', 수료집계: 'Y', 수료기준: 50, 강사: '김강사, 이강사' })).data.course.강좌ID;
  const a = await mk('가반', '초급'), b = await mk('나반', '중급');
  // 5. 회차별 시간이 실적 강의시간에 반영
  const pids = (await call('addParticipants', cc.token, a, [{ 이름: '가' }, { 이름: '나' }])).data.detail.participants.map(p => p.참여자ID);
  for (let i = 1; i <= 4; i++) await call('saveAttendance', cc.token, a, i, pids, ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'][i - 1]);
  let r = await call('savePlan', cc.token, a, [{ 회차: 1, 강사: '이강사', 시작시간: '19:00', 종료시간: '22:00' }]);
  ok('계획 저장', r.ok, r);
  r = await call('getCourseDetail', cc.token, a);
  ok('총강의시간 = 3 + 2×3 = 9', Number(r.data.result && r.data.result.총강의시간) === 9, r.data.result);
  r = await call('getPlan', cc.token, a); ok('메인강사 = 김강사', r.data.메인강사 === '김강사', r.data);
  r = await call('getStats', cc.token, 2026); ok('통계 월상세', r.ok && r.data.월상세 && Object.keys(r.data.월상세).length > 0, r.ok ? Object.keys(r.data) : r);
  // 1·2. QR 출석 현황
  r = await call('getAttendNow', cc.token, a, 1); ok('getAttendNow', r.ok && Array.isArray(r.data.출석) && r.data.출석.length === 2, r);
  r = await call('getAttendNow', wj.token, a, 1); ok('다른 지회 getAttendNow 거절', !r.ok);
  // 7. 접수 항목: 10개까지, 같은 지회 기본값·불러오기
  const ten = Array.from({ length: 10 }, (_, i) => ({ 라벨: '항목' + (i + 1), 유형: '글' }));
  r = await call('saveApplyLink', cc.token, a, { 사용: true, 항목: { 추가: ten } }); ok('항목 10개 저장', r.ok && r.data.link.항목.추가.length === 10, r);
  r = await call('saveApplyLink', cc.token, a, { 사용: true, 항목: { 추가: ten.concat([{ 라벨: '열하나' }]) } }); ok('11개는 거절', !r.ok);
  r = await call('getApply', cc.token, b); ok('나반에서 가반 항목 불러오기 목록', r.ok && r.data.지회항목.length === 1 && r.data.지회항목[0].강좌명 === '가반', r.data && r.data.지회항목);
  r = await call('saveApplyLink', cc.token, b, { 사용: true }); ok('새 접수는 지회 최근 항목 자동', r.ok && r.data.link.항목.추가.length === 10, r.data && r.data.link);
  // 9~11. 수료증 번호 방식 · 삭제
  r = await call('getCertInfo', cc.token, a); ok('기본 앞부분 = 춘천-초급', r.data.setting.번호접두어 === '춘천-초급', r.data && r.data.setting);
  r = await call('saveCertSetting', cc.token, a, Object.assign({}, r.data.setting, { 번호접두어: '춘천', 번호연도: '자동', 성명: '홍길동' }));
  r = await call('issueCerts', cc.token, a, pids, '2026-12-28', {}); ok('발급 2건', r.ok && r.data.certs.map(x => x.번호).join() === '춘천-2026-001,춘천-2026-002', r.data && r.data.certs);
  r = await call('getCertInfo', cc.token, b); ok('다른 수준 강좌도 지회 최근 방식 따름(연간 연속)', r.data.setting.번호접두어 === '춘천' && r.data.nextNo === 3 && r.data.setting.성명 === '홍길동', r.data);
  r = await call('listCerts', cc.token); ok('대장 2건', r.data.length === 2);
  r = await call('deleteCert', wj.token, '춘천-2026-002'); ok('다른 지회 삭제 불가', !r.ok);
  r = await call('deleteCert', cc.token, '춘천-2026-002'); ok('삭제', r.ok && r.data.length === 1, r);
  r = await call('getCertInfo', cc.token, a); ok('지운 사람은 다시 발급 가능', r.data.people.filter(p => !p.번호).length === 1 && r.data.nextNo === 2, r.data);
  console.log(`11가지 통과 ${pass} / 실패 ${fail}`); process.exit(fail ? 1 : 0);
})();
