'use strict';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };

(async () => {
  const ctx0 = makeContext(new Host());
  const S = ctx0.__x.SHEETS;
  const db = new MemoryDb(S);
  const H = ctx0.makeHash_;
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: pw, 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y' });
  [mem('admin', H('adminpw1'), '도협회', '도협회'), mem('cc', H('ccpw1234'), '춘천시지회', '지회'),
   mem('wj', 'plain1234', '원주시지회', '지회'), mem('off', H('x'), '속초시지회', '지회')].forEach(m => db.insert('회원정보', m));
  db.t['회원정보'][3].사용여부 = 'N';
  const call = (fn, ...a) => handle(db, { fn, args: a });

  // 로그인
  let r = await call('login', 'cc', 'wrong');
  ok('틀린 비번 거부', !r.ok && /맞지 않/.test(r.error), r);
  r = await call('login', 'off', 'x'); ok('중지 계정 거부', !r.ok && /중지/.test(r.error), r);
  r = await call('login', 'wj', 'plain1234'); ok('평문 비번 로그인+자동 암호화', r.ok && /^sha256\$/.test(db.t['회원정보'][2].비밀번호), r);
  const adm = (await call('login', 'admin', 'adminpw1')).data;
  const cc = (await call('login', 'cc', 'ccpw1234')).data;
  ok('토큰 발급', adm && cc && adm.token && cc.user.chapter === '춘천시지회');
  for (let i = 0; i < 5; i++) await call('login', 'cc', 'bad');
  r = await call('login', 'cc', 'ccpw1234'); ok('연속 실패 잠금', !r.ok && /제한/.test(r.error), r);
  db.fails = {};

  // 세션
  r = await call('getInitData', 'nope'); ok('가짜 토큰 AUTH', !r.ok && r.code === 'AUTH', r);
  r = await call('getInitData', cc.token); ok('초기 데이터', r.ok, r);

  // 강좌/명단/출석
  r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '초급 1기', 시작일: '2026-03-04', 종료일: '2026-06-24', 총회차: 4, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 75 });
  ok('강좌 저장', r.ok, r);
  const id = r.data.course.강좌ID;
  r = await call('addParticipants', cc.token, id, ['가', '나', '다', '라'].map(n => ({ 이름: n, 연락처: '010-0000-0000' })));
  ok('명단 추가', r.ok, r);
  const pids = r.data.detail.participants.map(p => p.참여자ID);
  for (let s = 1; s <= 4; s++) {
    r = await call('saveAttendance', cc.token, id, s, pids.filter((_, i) => i < 3 || s === 1), '2026-03-0' + s);
    ok('출석 ' + s, r.ok, r);
  }
  r = await call('getCourseDetail', cc.token, id);
  ok('상세 명단 4명', r.ok && r.data.participants.length === 4, r);
  ok('수료 3명', r.data.result && r.data.result.수료인원 === 3 || JSON.stringify(r.data).indexOf('"수료인원":3') > 0, Object.keys(r.data));
  ok('DB에 출석 16줄', db.t['출석기록'].length === 16, db.t['출석기록'].length);
  ok('최종실적 1줄', db.t['최종실적'].length === 1, db.t['최종실적']);

  // 같은 줄 재저장 시 줄 수 불변
  await call('saveAttendance', cc.token, id, 2, pids, '2026-03-02');
  ok('재저장해도 출석 줄 수 동일', db.t['출석기록'].length === 16, db.t['출석기록'].length);

  // 도협회: 이름 가림
  r = await call('getCourseDetail', adm.token, id);
  ok('도협회에는 수강생 이름 숨김', JSON.stringify(r).indexOf('010-0000') < 0 && !/"이름":"가"/.test(JSON.stringify(r)), r);

  // 다른 지회 접근 거부
  const wj = (await call('login', 'wj', 'plain1234')).data;
  r = await call('getCourseDetail', wj.token, id); ok('다른 지회 접근 거부', !r.ok, r);

  // 수료증
  r = await call('getCertInfo', cc.token, id); ok('수료증 정보', r.ok && r.data.people.length === 3, r);
  r = await call('saveCertSetting', cc.token, id, Object.assign({}, r.data.setting, { 성명: '홍길동' })); ok('서식 저장', r.ok && r.data.saved, r);
  r = await call('issueCerts', cc.token, id, pids.slice(0, 2), '2026-07-01');
  ok('번호 001,002', r.ok && r.data.certs.map(c => c.번호).join() === '춘천-초급-2026-001,춘천-초급-2026-002', r);
  r = await call('issueCerts', cc.token, id, pids.slice(1, 3), '2026-07-05');
  ok('재발급 같은 번호 + 새 003', r.ok && r.data.issuedNow === 1 && r.data.certs[1].번호.endsWith('003'), r);
  r = await call('issueCerts', cc.token, id, [pids[3]], ''); ok('미수료 발급 거부', !r.ok, r);
  r = await call('listCerts', cc.token); ok('대장 3건', r.ok && r.data.length === 3, r);
  ok('발급 DB 3줄', db.t['수료증발급'].length === 3);

  // 보고
  r = await call('submitReport', cc.token, 2026, '상반기', '춘천시지회'); ok('보고 제출', r.ok, r);
  r = await call('approveReport', adm.token, '춘천시지회', 2026, '상반기'); ok('승인', r.ok, r);
  r = await call('getStats', adm.token, 2026, ''); ok('통계', r.ok, r);
  r = await call('searchAll', cc.token, '가', {}); ok('검색', r.ok, r);

  // 읽는 표 제한: 강좌 하나만 읽는지
  db.calls.length = 0;
  await call('saveAttendance', cc.token, id, 3, pids, '2026-03-03');
  const pc = db.calls.find(c => c.name === '참여자명단');
  ok('명단은 강좌 하나만 읽음', pc && pc.filter && pc.filter.강좌ID === id, db.calls);

  // 쓰기 잠금
  db.locks.main = { owner: 'x', until: Date.now() + 60000 };
  const t0 = Date.now();
  r = await call('saveAttendance', cc.token, id, 3, pids, '2026-03-03');
  ok('저장 중이면 BUSY', !r.ok && r.code === 'BUSY' && Date.now() - t0 > 8000, r);
  delete db.locks.main;
  r = await call('getInitData', cc.token); ok('읽기는 잠금과 무관', r.ok);

  // 로그아웃
  await call('logout', cc.token);
  r = await call('getInitData', cc.token); ok('로그아웃 후 거부', !r.ok && r.code === 'AUTH');

  // 실패 시 아무것도 저장 안 됨
  const before = JSON.stringify(db.t);
  r = await call('addParticipants', wj.token, id, [{ 이름: '해킹' }]); ok('타 지회 명단추가 거부', !r.ok);
  ok('거부 시 DB 변화 없음(로그 제외)', JSON.stringify(Object.assign({}, db.t, { 작업로그: 0 })) === JSON.stringify(Object.assign({}, JSON.parse(before), { 작업로그: 0 })));

  console.log(`통과 ${pass} / 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
