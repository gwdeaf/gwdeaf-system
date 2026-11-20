'use strict';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { SupabaseDb } = require('../lib/db_supabase');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 500)); } };
(async () => {
  const real = !!process.env.SUPABASE_URL;
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = real ? new SupabaseDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : new MemoryDb(S);
  if (real) await db.applyOps(Object.keys(S).map(k => ({ k: 'truncate', t: S[k].name })));
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: H(pw), 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y', 최근접속: '', 인쇄설정: '' });
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('admin', 'adminpw1', '도협회', '도협회'), mem('cc', 'ccpw1234', '춘천시지회', '지회'), mem('wj', 'wjpw1234', '원주시지회', '지회')] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const adm = (await call('login', 'admin', 'adminpw1')).data, cc = (await call('login', 'cc', 'ccpw1234')).data, wj = (await call('login', 'wj', 'wjpw1234')).data;
  let r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '초급 1기', 시작일: '2027-01-05', 종료일: '2027-12-31', 총회차: 3, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50 });
  ok('강좌 저장', r.ok, r);
  const id = r.data.course.강좌ID;
  r = await call('addParticipants', cc.token, id, [{ 이름: '가', 연락처: '010-1111-2222', 비고: '메모' }, { 이름: '나' }, { 이름: '다' }]);
  const pids = r.data.detail.participants.map(p => p.참여자ID);

  // 링크 만들기 권한
  r = await call('createTeacherLink', adm.token, id); ok('도협회는 지회 강좌 링크 못 만듦', !r.ok && r.code === 'FORBIDDEN', r);
  r = await call('createTeacherLink', wj.token, id); ok('다른 지회도 못 만듦', !r.ok, r);
  r = await call('getTeacherLink', cc.token, id); ok('처음엔 링크 없음', r.ok && !r.data.active, r);
  r = await call('createTeacherLink', cc.token, id);
  ok('링크 생성', r.ok && r.data.active && /^[0-9a-f]{40}$/.test(r.data.token) && r.data.만료일 === '2028-01-14', r);
  const tok = r.data.token;
  r = await call('getTeacherLink', cc.token, id); ok('담당자는 링크를 다시 볼 수 있음', r.ok && r.data.token === tok);

  // DB 안전: 링크 글자 자체는 어디에도 평문으로 없음
  if (!real) {
    const dump = JSON.stringify(db.t);
    ok('DB에 링크 평문 없음', !dump.includes(tok), '');
    ok('강좌정보에 링크 없음', !JSON.stringify(db.t['강좌정보']).includes('토큰'));
  } else {
    const rows = await db.loadTable('강사링크'); ok('DB 링크 열 암호화', rows.length === 1 && String(rows[0].토큰).startsWith('enc:v1:') && !JSON.stringify(rows).includes(tok), rows);
  }

  // 강사 화면
  r = await call('tInfo', tok);
  ok('강사 정보', r.ok && r.data.participants.length === 3 && r.data.course.강좌명 === '초급 1기' && r.data.course.만료일 === '2028-01-14', r);
  ok('강사 링크에 수강생 정보(연락처·비고) 노출', /010-1111/.test(JSON.stringify(r.data)) && /메모/.test(JSON.stringify(r.data)), r.data);
  r = await call('tInfo', 'a'.repeat(40)); ok('틀린 링크 거부', !r.ok && r.code === 'LINK', r);
  r = await call('tInfo', 'abc'); ok('이상한 링크 거부', !r.ok && r.code === 'LINK', r);
  r = await call('tInfo', ''); ok('빈 링크 거부', !r.ok && r.code === 'LINK', r);

  r = await call('tSaveAttendance', tok, 1, [pids[0], pids[1]], '2027-01-05');
  ok('출석 저장', r.ok && r.data.attendance[pids[0]][1] === 'O' && r.data.attendance[pids[2]][1] === 'X' && r.data.dates[1] === '2027-01-05', r);
  r = await call('getCourseDetail', cc.token, id); ok('지회 화면에 반영', r.ok && r.data.participants.find(p => p.이름 === '가').출석횟수 === 1 && r.data.result.실인원 === 2, r.data && r.data.result);
  r = await call('tSaveAttendance', tok, 9, [], ''); ok('없는 회차 거부', !r.ok);
  r = await call('tSaveAttendance', tok, 1, ['nobody'], ''); ok('명단에 없는 사람 거부', !r.ok);
  const logs = JSON.stringify(await db.loadTable('작업로그')); ok('작업 기록에 강사링크 표시', logs.includes('강사링크'));

  r = await call('tSaveJournal', tok, 1, { 주제: '인사', 내용: '기본 인사' }); ok('일지 저장', r.ok && r.data.sessions[0].작성 && r.data.sessions[0].작성자 === '강사(링크)', r);
  r = await call('tGetJournal', tok); ok('일지 조회', r.ok && r.data.sessions[0].주제 === '인사', r);
  r = await call('tSaveTask', tok, { 과제명: '자기소개', 회차: 1, 마감일: '2027-01-12' }); ok('과제 추가', r.ok && r.data.tasks.length === 1, r);
  const tid = r.data.tasks[0].과제ID;
  r = await call('tSetSubmit', tok, tid, pids[0], true); ok('제출 체크', r.ok, r);
  r = await call('tGetTasks', tok); ok('과제 조회', r.ok && r.data.submits[tid].length === 1 && r.data.people.length === 3, r);
  r = await call('tSaveHeadcount', tok, 1, 5, ''); ok('이름 출석 강좌는 인원 입력 거부', !r.ok, r);

  // 다른 강좌 자료는 못 건드림
  r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '다른 강좌', 시작일: '2027-02-01', 종료일: '2027-12-31', 총회차: 2, 회당시간: 1, 수준: '중급', 교육구분: '내부', 주관: '지회', 수료기준: 50 });
  const id2 = r.data.course.강좌ID;
  r = await call('tInfo', tok); ok('링크 강좌는 그대로', r.ok && r.data.course.강좌명 === '초급 1기');
  r = await call('getCourseDetail', cc.token, id2); ok('다른 강좌에는 영향 없음', r.ok && r.data.participants.length === 0);

  // 새 링크를 만들면 이전 링크는 즉시 무효
  r = await call('createTeacherLink', cc.token, id); const tok2 = r.data.token; ok('새 링크', tok2 !== tok);
  r = await call('tInfo', tok); ok('이전 링크 무효', !r.ok && r.code === 'LINK', r);
  r = await call('tInfo', tok2); ok('새 링크 정상', r.ok);
  if (!real) ok('링크 줄은 강좌당 1줄', db.t['강사링크'].length === 1);
  // 끄기
  r = await call('revokeTeacherLink', cc.token, id); ok('끄기', r.ok && !r.data.active, r);
  r = await call('tInfo', tok2); ok('끈 링크 무효', !r.ok && r.code === 'LINK', r);
  r = await call('createTeacherLink', cc.token, id); const tok3 = r.data.token;
  r = await call('tInfo', tok3); ok('다시 켜면 정상', r.ok);

  // 보고 제출 후 출석 수정 잠김, 일지·과제는 가능
  r = await call('submitReport', cc.token, 2027, '상반기', '춘천시지회');
  if (r.ok) {
    r = await call('tSaveAttendance', tok3, 2, [pids[0]], ''); ok('보고 후 출석 잠김', !r.ok, r);
    r = await call('tSaveJournal', tok3, 2, { 주제: '복습' }); ok('보고 후에도 일지 가능', r.ok, r);
  }

  // 기간 만료 (강좌 종료일을 옛날로 바꾸면 14일 뒤 만료)
  r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '옛 강좌', 시작일: '2026-01-05', 종료일: '2026-02-28', 총회차: 2, 회당시간: 1, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50 });
  const old = r.data.course.강좌ID;
  r = await call('createTeacherLink', cc.token, old); const tokOld = r.data.token; ok('만료된 강좌 링크 표시', r.ok && r.data.만료됨, r);
  r = await call('tInfo', tokOld); ok('기간 지난 링크 거부', !r.ok && r.code === 'LINK' && /기간/.test(r.error), r);

  // 인원수만 입력 강좌
  r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '학교 특강', 시작일: '2027-08-01', 종료일: '2027-12-31', 총회차: 2, 회당시간: 1, 수준: '특강', 교육구분: '외부', 주관: '지회', 인원만입력: 'Y', 수료집계: 'N' });
  if (r.ok) {
    const hid = r.data.course.강좌ID;
    r = await call('createTeacherLink', cc.token, hid); const th = r.data.token;
    r = await call('tSaveHeadcount', th, 1, 12, '2027-03-02'); ok('인원수 강좌 입력', r.ok && r.data.headcounts[1] === 12 && r.data.course.인원만입력 === true, r);
    r = await call('tSaveAttendance', th, 1, [], ''); ok('인원수 강좌는 이름 출석 거부', !r.ok);
  } else console.log('인원수 강좌 저장 실패(시험 건너뜀):', r.error);
  console.log(`${real ? '실DB' : '가짜DB'} 강사링크 통과 ${pass} / 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
