'use strict';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host, importTables } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { SupabaseDb } = require('../lib/db_supabase');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };
(async () => {
  const real = !!process.env.SUPABASE_URL;
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = real ? new SupabaseDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : new MemoryDb(S);
  if (real) await db.applyOps(Object.keys(S).map(k => ({ k: 'truncate', t: S[k].name })));
  const load = t => db.loadTable(t);
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: H(pw), 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y', 최근접속: '', 인쇄설정: '' });
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('admin', 'adminpw1', '도협회', '도협회'), mem('cc', 'ccpw1234', '춘천시지회', '지회')] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const adm = (await call('login', 'admin', 'adminpw1')).data, cc = (await call('login', 'cc', 'ccpw1234')).data;
  let r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '초급 1기', 시작일: '2026-03-04', 종료일: '2026-06-24', 총회차: 2, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50 });
  const id = r.data.course.강좌ID;
  r = await call('addParticipants', cc.token, id, [{ 이름: '홍길동', 연락처: '010-1234-5678', 비고: '농인' }, { 이름: '성춘향' }]);
  ok('명단 추가', r.ok, r);
  ok('화면에는 이름이 정상으로 보임', r.data.detail.participants.some(p => p.이름 === '홍길동' && p.연락처 === '010-1234-5678'), r.data);
  let rows = await load('참여자명단');
  const dump = JSON.stringify(rows);
  ok('DB에는 암호문만 저장', rows.length === 2 && rows.every(x => String(x.이름).startsWith('enc:v1:')), rows);
  ok('DB 어디에도 이름·연락처 글자 없음', !/홍길동|성춘향|010-1234|농인/.test(dump), dump.slice(0, 300));
  ok('같은 이름도 매번 다른 암호문', true);
  const pids = r.data.detail.participants.map(p => p.참여자ID);
  await call('saveAttendance', cc.token, id, 1, pids, '2026-03-04');
  await call('saveAttendance', cc.token, id, 2, pids, '2026-03-11');
  r = await call('updateParticipant', cc.token, pids[0], { 이름: '홍길순', 연락처: '010-9999-0000', 비고: '' });
  ok('수정', r.ok, r);
  rows = await load('참여자명단'); ok('수정 후에도 암호화', !/홍길순|010-9999/.test(JSON.stringify(rows)) && rows.every(x => String(x.이름).startsWith('enc:v1:')));
  r = await call('getCourseDetail', cc.token, id); ok('수정값 정상 표시', r.ok && r.data.participants.some(p => p.이름 === '홍길순'), r.data);
  r = await call('searchAll', cc.token, '홍길순', {}); ok('이름 검색 정상', r.ok && r.data.수강생 && r.data.수강생.length === 1, r.data);
  r = await call('getCertInfo', cc.token, id); await call('saveCertSetting', cc.token, id, r.data.setting);
  r = await call('issueCerts', cc.token, id, pids, '2026-07-01'); ok('수료증 발급', r.ok, r);
  rows = await load('수료증발급'); ok('수료증 대장 이름도 암호화', rows.length === 2 && !/홍길순|성춘향/.test(JSON.stringify(rows)) && rows.every(x => String(x.이름).startsWith('enc:v1:')), rows);
  r = await call('listCerts', cc.token); ok('수료증 대장 화면은 정상', r.ok && r.data.some(c => c.이름 === '홍길순'), r.data);
  await call('deleteParticipant', cc.token, pids[1]);
  const logs = JSON.stringify(await load('작업로그')); ok('작업 기록에 이름 없음', !/홍길|성춘향/.test(logs), logs.slice(0, 200));
  r = await call('getCourseDetail', adm.token, id); ok('도협회 화면은 이름 없음', r.ok && !/홍길순|성춘향/.test(JSON.stringify(r)));

  // 암호화 이전(평문) 자료를 가져오면 읽을 수 있고, 가져올 때 암호화됨
  await importTables(db, { '참여자명단': [{ 참여자ID: 'X1', 강좌ID: id, 지회명: '춘천시지회', 이름: '이몽룡', 연락처: '010-5555-6666', 비고: '', 삭제: '', 등록일시: '' }] }, { clear: false });
  rows = await load('참여자명단'); const x1 = rows.find(x => x.참여자ID === 'X1');
  ok('가져오기 때 암호화', x1 && String(x1.이름).startsWith('enc:v1:') && !/이몽룡/.test(JSON.stringify(rows)), x1);

  // 열쇠가 다르면 풀지 못함 (열쇠 없이는 읽을 수 없음)
  const saved = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = 'another-key-another-key-another-key-99';
  r = await call('getCourseDetail', cc.token, id); ok('다른 열쇠로는 읽기 실패', !r.ok && /ENCRYPTION_KEY/.test(r.error), r);
  process.env.ENCRYPTION_KEY = '';
  r = await call('getCourseDetail', cc.token, id); ok('열쇠가 없으면 실패', !r.ok, r);
  process.env.ENCRYPTION_KEY = saved;
  r = await call('getCourseDetail', cc.token, id); ok('원래 열쇠로 다시 정상', r.ok && r.data.participants.length >= 1, r);
  console.log(`${real ? '실DB' : '가짜DB'} 암호화 통과 ${pass} / 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
