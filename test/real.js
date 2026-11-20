'use strict';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-key-test-key-test-key-1234567890';
// 실제 Postgres(+PostgREST) 에 연결해 확인하는 시험. SUPABASE_URL / SUPABASE_SERVICE_KEY 필요.
const { handle, makeContext, Host } = require('../lib/runtime');
const { SupabaseDb } = require('../lib/db_supabase');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };
(async () => {
  const db = new SupabaseDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const S = makeContext(new Host()).__x.SHEETS;
  await db.applyOps(Object.keys(S).map(k => ({ k: 'truncate', t: S[k].name })));
  const H = makeContext(new Host()).makeHash_;
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: H(pw), 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y', 최근접속: '', 인쇄설정: '' });
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('admin', 'adminpw1', '도협회', '도협회'), mem('cc', 'ccpw1234', '춘천시지회', '지회')] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const adm = (await call('login', 'admin', 'adminpw1')).data, cc = (await call('login', 'cc', 'ccpw1234')).data;
  ok('로그인(실DB)', adm && cc && cc.token);
  let r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '초급 1기', 시작일: '2026-03-04', 종료일: '2026-06-24', 총회차: 4, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 75 });
  ok('강좌 저장', r.ok, r);
  const id = r.data.course.강좌ID;
  r = await call('addParticipants', cc.token, id, ['가', '나', '다', '라'].map(n => ({ 이름: n, 연락처: '010-1111-2222' })));
  ok('명단', r.ok, r);
  const pids = r.data.detail.participants.map(p => p.참여자ID);
  for (let s = 1; s <= 4; s++) { r = await call('saveAttendance', cc.token, id, s, pids.filter((_, i) => i < 3 || s === 1), '2026-03-0' + s); ok('출석' + s, r.ok, r); }
  await call('saveAttendance', cc.token, id, 2, pids, '2026-03-02');
  ok('출석 16줄', (await db.loadTable('출석기록')).length === 16);
  r = await call('getCertInfo', cc.token, id); ok('수료증 정보', r.ok && r.data.people.length === 3, r);
  await call('saveCertSetting', cc.token, id, r.data.setting);
  r = await call('issueCerts', cc.token, id, pids.slice(0, 2), '2026-07-01');
  ok('발급 001,002', r.ok && r.data.certs.map(c => c.번호).join() === '춘천-초급-2026-001,춘천-초급-2026-002', r);
  ok('발급 DB 2줄', (await db.loadTable('수료증발급')).length === 2);
  r = await call('getCourseDetail', adm.token, id);
  ok('도협회 이름 가림', !/"이름":"가"/.test(JSON.stringify(r)) && JSON.stringify(r).indexOf('010-1111') < 0);
  r = await call('listCourses', cc.token, {}); ok('목록', r.ok && r.data.length >= 1, r);
  // 원자성: 한 묶음 안에서 하나라도 틀리면 모두 취소
  const before = (await db.loadTable('회원정보')).length;
  let threw = false;
  try { await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('zz', 'x', 'a', '지회')] }, { k: 'insert', t: '강좌정보', v: [{ 연도: 'abc' }] }]); } catch (e) { threw = true; }
  ok('오류 시 전체 취소', threw && (await db.loadTable('회원정보')).length === before);
  // 잠금
  const a = await db.tryLock('t1', 'A', 5), b = await db.tryLock('t1', 'B', 5);
  ok('잠금 하나만 성공', a === true && b === false, [a, b]);
  await db.releaseLock('t1', 'A'); ok('해제 후 재획득', await db.tryLock('t1', 'B', 5));
  await db.releaseLock('t1', 'B');
  // 동시 저장 두 건: 번호가 겹치지 않아야 함
  const [x, y] = await Promise.all([call('issueCerts', cc.token, id, [pids[2]], '2026-07-02'), call('issueCerts', cc.token, id, [pids[0]], '2026-07-02')]);
  const nums = (await db.loadTable('수료증발급')).map(r => r.번호);
  ok('번호 중복 없음', new Set(nums).size === nums.length, nums);
  // 1000줄 넘는 표 읽기
  const big = []; for (let i = 0; i < 2300; i++) big.push({ 강좌ID: 'BIG', 참여자ID: 'P' + i, 회차: 1, 출석: 'Y', 기록일시: '', 기록자: '', 수업일: '' });
  await db.applyOps([{ k: 'insert', t: '출석기록', v: big }]);
  ok('2300줄+16 읽기', (await db.loadTable('출석기록')).length === 2316);
  ok('강좌별 필터', (await db.loadTable('출석기록', { 강좌ID: 'BIG' })).length === 2300);
  r = await call('logout', cc.token); r = await call('getInitData', cc.token); ok('로그아웃 후 거부', !r.ok && r.code === 'AUTH');
  console.log(`실DB 통과 ${pass} / 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
