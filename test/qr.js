'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x).slice(0, 400)); } };
const day = d => { const t = new Date(Date.now() + d * 86400000 + 9 * 3600000); return t.toISOString().slice(0, 10); };
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [
    { 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' },
    { 아이디: 'hq', 비밀번호: H('hqpw1234'), 지회명: '도협회', 담당자: 'hq', 권한: '도협회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data, hq = (await call('login', 'hq', 'hqpw1234')).data;
  const base = { 지회명: '춘천시지회', 강좌명: 'QR강좌', 시작일: day(-3), 종료일: day(30), 총회차: 3, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료집계: 'Y' };
  let r = await call('saveCourse', cc.token, base); const id = r.data.course.강좌ID;
  await call('addParticipants', cc.token, id, [{ 이름: '가나다', 연락처: '010-1234-5678' }, { 이름: '무연락', 연락처: '' }, { 이름: '동명', 연락처: '010-1111-2222' }, { 이름: '동명', 연락처: '010-3333-4444' }]);
  r = await call('getQr', cc.token, id); ok('처음엔 QR 없음', r.ok && !r.data.link.있음 && r.data.지금회차 === 1, r);
  r = await call('getQr', hq.token, id); ok('도협회는 지회 QR 못 봄', !r.ok, r);
  r = await call('saveQr', cc.token, id, {}); ok('QR 만들기', r.ok && r.data.link.active && /^[0-9a-f]{40}$/.test(r.data.link.token), r);
  const tok = r.data.link.token;
  r = await call('attendInfo', tok); ok('출석 화면 정보', r.ok && r.data.강좌명 === 'QR강좌' && r.data.회차 === 1 && r.data.열림 && !JSON.stringify(r.data).includes('가나다'), r);
  r = await call('attendInfo', 'b'.repeat(40)); ok('잘못된 링크', !r.ok && r.code === 'LINK', r);
  const dev = n => 'device-' + String(n).padStart(20, '0');
  r = await call('attendSubmit', tok, { 이름: '가나다', 뒤4자리: '5678', 기기: 'x' }); ok('기기 표시 형식 검사', !r.ok, r);
  r = await call('attendSubmit', tok, { 이름: '가나다', 뒤4자리: '0000', 기기: dev(1) }); ok('뒤4자리 틀리면 불일치', r.ok && r.data.done === false && r.data.남은횟수 === 4, r);
  r = await call('attendSubmit', tok, { 이름: '가나다', 뒤4자리: '56', 기기: dev(1) }); ok('4자리 아니면 거절', !r.ok, r);
  r = await call('attendSubmit', tok, { 이름: '가 나 다', 뒤4자리: '5678', 기기: dev(1) }); ok('공백 무시하고 출석', r.ok && r.data.done && r.data.이름 === '가나다' && r.data.회차 === 1, r);
  r = await call('attendSubmit', tok, { 이름: '무연락', 뒤4자리: '', 기기: dev(1) }); ok('같은 휴대폰 두 번째 사람은 거절', !r.ok && /이미/.test(r.error), r);
  r = await call('attendSubmit', tok, { 이름: '무연락', 뒤4자리: '', 기기: dev(2) }); ok('연락처 없는 사람은 이름만으로 출석', r.ok && r.data.done, r);
  r = await call('attendSubmit', tok, { 이름: '동명', 뒤4자리: '', 기기: dev(3) }); ok('동명이인은 뒤4자리 필요', r.ok && r.data.done === false, r);
  r = await call('attendSubmit', tok, { 이름: '동명', 뒤4자리: '4444', 기기: dev(3) }); ok('동명이인 뒤4자리로 구분', r.ok && r.data.done, r);
  r = await call('attendSubmit', tok, { 이름: '가나다', 뒤4자리: '5678', 기기: dev(4) }); ok('이미 출석한 사람은 중복 처리 없이 안내', r.ok && r.data.done && r.data.이미, r);
  r = await call('getCourseDetail', cc.token, id);
  const att = r.data.attendance; const pid = n => r.data.participants.find(p => p.이름 === n && (n !== '동명' || p.연락처.endsWith('4444'))).참여자ID;
  ok('출석부에 O 반영', att[pid('가나다')][1] === 'O' && att[pid('무연락')][1] === 'O' && att[pid('동명')][1] === 'O', att);
  const other = r.data.participants.find(p => p.이름 === '동명' && p.연락처.endsWith('2222')).참여자ID;
  ok('안 찍은 사람은 X', att[other][1] === 'X', att[other]);
  r = await call('getQr', cc.token, id); ok('이번 회차 QR 출석 수', r.data.지금회차QR수 === 4 - 0 - 0 && r.data.지금회차 === 1 || r.data.지금회차QR수 >= 3, r.data);
  // 실패 5회 제한
  for (let i = 0; i < 5; i++) await call('attendSubmit', tok, { 이름: '없는사람', 뒤4자리: '1111', 기기: dev(9) });
  r = await call('attendSubmit', tok, { 이름: '동명', 뒤4자리: '2222', 기기: dev(9) }); ok('5번 틀리면 그 휴대폰 잠김', !r.ok && /실패/.test(r.error), r);
  // 강사가 수동으로 출석 (QR 안 찍은 사람 포함)
  const ids = r0 => r0.data.participants.map(p => p.참여자ID);
  r = await call('saveAttendance', cc.token, id, 1, ids(await call('getCourseDetail', cc.token, id)), ''); ok('강사는 앱에서 수동 출석 가능', r.ok, r);
  r = await call('getCourseDetail', cc.token, id); ok('수동 저장 반영', r.data.attendance[other][1] === 'O', r.data.attendance[other]);
  // 다음 회차: 오늘 수업일로 저장된 1회차가 있으므로 같은 날은 계속 1회차
  r = await call('attendInfo', tok); ok('같은 날엔 같은 회차', r.data.회차 === 1, r.data);
  // 닫기 / 교체
  r = await call('saveQr', cc.token, id, { 사용: false }); ok('QR 닫기', r.ok && !r.data.link.active, r);
  r = await call('attendInfo', tok); ok('닫힌 QR 차단', !r.ok && r.code === 'LINK', r);
  r = await call('saveQr', cc.token, id, { 새토큰: true }); ok('QR 새로 만들기', r.ok && r.data.link.active && r.data.link.token !== tok, r);
  const t2 = r.data.link.token;
  r = await call('attendInfo', tok); ok('옛 QR 차단', !r.ok, r);
  // 강사 링크로는 QR 출석 못 함
  const tl = (await call('createTeacherLink', cc.token, id)).data.token;
  r = await call('attendInfo', tl); ok('강사 링크로 QR 출석 불가', !r.ok, r);
  // 기간 밖 강좌
  r = await call('saveCourse', cc.token, Object.assign({}, base, { 강좌명: '지난강좌', 시작일: day(-60), 종료일: day(-40) })); const old = r.data.course.강좌ID;
  const ot = (await call('saveQr', cc.token, old, {})).data.link.token;
  r = await call('attendInfo', ot); ok('기간 밖이면 닫힘 표시', r.ok && r.data.열림 === false, r);
  r = await call('attendSubmit', ot, { 이름: '가나다', 뒤4자리: '', 기기: dev(5) }); ok('기간 밖 출석 거절', !r.ok, r);
  // 인원수 강좌
  r = await call('saveCourse', cc.token, Object.assign({}, base, { 강좌명: '인원강좌', 인원만입력: 'Y', 수료집계: 'N' }));
  r = await call('getQr', cc.token, r.data.course.강좌ID); ok('인원수 강좌는 QR 불가', !r.ok, r);
  console.log(`QR 출석 통과 ${pass} / 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(1); });
