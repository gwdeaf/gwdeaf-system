'use strict';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-key-test-key-test-key-1234567890';
// 교육일지 · 과제 제출 · 수료 직접 체크 시험 (가짜 DB, 또는 실제 DB: REAL=1)
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { SupabaseDb } = require('../lib/db_supabase');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 500)); } };
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const real = !!process.env.SUPABASE_URL;
  const db = real ? new SupabaseDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : new MemoryDb(S);
  if (real) await db.applyOps(Object.keys(S).map(k => ({ k: 'truncate', t: S[k].name })));
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: H(pw), 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y', 최근접속: '', 인쇄설정: '' });
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('admin', 'adminpw1', '도협회', '도협회'), mem('cc', 'ccpw1234', '춘천시지회', '지회'), mem('wj', 'wjpw1234', '원주시지회', '지회')] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const adm = (await call('login', 'admin', 'adminpw1')).data, cc = (await call('login', 'cc', 'ccpw1234')).data, wj = (await call('login', 'wj', 'wjpw1234')).data;

  let r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '초급 1기', 시작일: '2026-03-04', 종료일: '2026-06-24', 총회차: 4, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 75 });
  const id = r.data.course.강좌ID;
  r = await call('addParticipants', cc.token, id, ['가', '나', '다', '라'].map(n => ({ 이름: n })));
  const pids = r.data.detail.participants.map(p => p.참여자ID);
  for (let s = 1; s <= 4; s++) await call('saveAttendance', cc.token, id, s, pids.filter((_, i) => i < 2 || (i === 2 && s <= 2) || s === 1), '2026-03-0' + s);
  // 가,나: 4/4  다: 2/4(50%)  라: 1/4

  // ---- 교육일지
  r = await call('getJournal', cc.token, id);
  ok('일지 4회차 목록', r.ok && r.data.sessions.length === 4 && r.data.sessions.every(s => !s.작성) && r.data.sessions[0].수업일 === '2026-03-01', r);
  r = await call('saveJournal', cc.token, id, 2, { 주제: '인사 표현', 내용: '기본 인사 수어 연습', 과제: '인사 영상 찍기', 특이사항: '', 수업일: '2026-03-02' });
  ok('일지 저장', r.ok && r.data.sessions[1].작성 && r.data.sessions[1].주제 === '인사 표현' && r.data.sessions[1].작성자 === 'cc', r);
  r = await call('saveJournal', cc.token, id, 2, { 주제: '인사 표현(수정)', 내용: '수정' });
  ok('일지 수정 시 한 줄만 유지', r.ok && r.data.sessions[1].주제 === '인사 표현(수정)' && r.data.sessions[1].과제 === '', r);
  if (!real) ok('일지 DB 1줄', db.t['교육일지'].length === 1, db.t['교육일지']);
  r = await call('saveJournal', cc.token, id, 9, { 주제: 'x' }); ok('없는 회차 거부', !r.ok, r);
  r = await call('saveJournal', cc.token, id, 1, {}); ok('빈 일지 거부', !r.ok, r);
  r = await call('saveJournal', cc.token, id, 1, { 내용: 'a'.repeat(3001) }); ok('너무 긴 내용 거부', !r.ok, r);
  r = await call('getJournal', adm.token, id); ok('도협회는 지회 일지 못 봄', !r.ok && r.code === 'FORBIDDEN', r);
  r = await call('getJournal', wj.token, id); ok('다른 지회 못 봄', !r.ok, r);

  // ---- 과제
  r = await call('saveTask', cc.token, id, { 과제명: '인사 영상', 회차: 2, 마감일: '2026-03-09', 설명: '30초' });
  ok('과제 추가', r.ok && r.data.tasks.length === 1 && r.data.people.length === 4, r);
  const t1 = r.data.tasks[0].과제ID;
  r = await call('saveTask', cc.token, id, { 과제명: '자기소개', 회차: '' });
  ok('과제 2개', r.ok && r.data.tasks.length === 2, r);
  const t2 = r.data.tasks.find(t => t.과제명 === '자기소개').과제ID;
  r = await call('saveTask', cc.token, id, { 과제ID: t2, 과제명: '자기소개 영상', 회차: 4 });
  ok('과제 수정', r.ok && r.data.tasks.length === 2 && r.data.tasks.some(t => t.과제명 === '자기소개 영상' && t.회차 === 4), r);
  r = await call('saveTask', cc.token, id, { 과제명: '' }); ok('이름 없는 과제 거부', !r.ok);
  r = await call('setSubmit', cc.token, id, t1, pids[0], true); ok('제출 체크', r.ok && r.data.제출 === true, r);
  await call('setSubmit', cc.token, id, t1, pids[0], true);
  await call('setSubmit', cc.token, id, t1, pids[1], true);
  await call('setSubmit', cc.token, id, t2, pids[0], true);
  r = await call('getTasks', cc.token, id);
  ok('제출 현황', r.ok && r.data.submits[t1].length === 2 && r.data.submits[t2].length === 1, r.data.submits);
  if (!real) ok('같은 체크 중복 없음', db.t['과제제출'].length === 3, db.t['과제제출'].length);
  r = await call('setSubmit', cc.token, id, t1, pids[1], false);
  r = await call('getTasks', cc.token, id); ok('제출 해제', r.data.submits[t1].length === 1);
  r = await call('setSubmit', cc.token, id, t1, 'nobody', true); ok('없는 참여자 거부', !r.ok);
  r = await call('setSubmit', wj.token, id, t1, pids[0], true); ok('다른 지회 제출체크 거부', !r.ok);
  r = await call('deleteTask', cc.token, id, t1);
  ok('과제 삭제 + 제출기록 같이 삭제', r.ok && r.data.tasks.length === 1 && (real || db.t['과제제출'].length === 1), r);

  // ---- 수료 직접 체크
  r = await call('getCourseDetail', cc.token, id);
  const st = Object.fromEntries(r.data.participants.map(p => [p.이름, p]));
  ok('자동 판정: 가·나 수료, 다·라 미수료', st.가.수료 && st.나.수료 && !st.다.수료 && !st.라.수료 && r.data.result.수료인원 === 2, r.data.participants);
  r = await call('setCompletion', cc.token, id, pids[2], 'Y');
  ok('다를 수료로 직접 체크', r.ok && r.data.participants.find(p => p.이름 === '다').수료 && r.data.result.수료인원 === 3, r.data && r.data.result);
  r = await call('setCompletion', cc.token, id, pids[0], 'N');
  ok('가를 미수료로 직접 체크', r.ok && !r.data.participants.find(p => p.이름 === '가').수료 && r.data.result.수료인원 === 2, r.data && r.data.result);
  r = await call('getCertInfo', cc.token, id);
  ok('수료증 대상 = 직접 체크 반영(나, 다)', r.ok && r.data.people.map(p => p.이름).sort().join() === '나,다', r.data && r.data.people);
  await call('saveCertSetting', cc.token, id, r.data.setting);
  r = await call('issueCerts', cc.token, id, [pids[2]], '2026-07-01'); ok('직접 수료 체크한 사람 수료증 발급', r.ok, r);
  r = await call('setCompletion', cc.token, id, pids[2], 'N'); ok('수료증 받은 사람은 미수료 변경 거부', !r.ok && /수료증/.test(r.error), r);
  r = await call('setCompletion', cc.token, id, pids[0], ''); ok('자동으로 되돌리기', r.ok && r.data.participants.find(p => p.이름 === '가').수료 && r.data.participants.find(p => p.이름 === '가').수료확정 === '', r);
  r = await call('setCompletion', cc.token, id, pids[0], 'Q'); ok('이상한 값 거부', !r.ok);
  r = await call('setCompletion', adm.token, id, pids[0], 'Y'); ok('도협회는 지회 강좌 수료 체크 못 함', !r.ok && r.code === 'FORBIDDEN', r);
  r = await call('searchAll', cc.token, '라', {});
  const rs = r.data.수강생 && r.data.수강생[0];
  ok('검색에 미수료 표시', r.ok && rs && rs.수강[0].상태 === '미수료', r.data);
  await call('setCompletion', cc.token, id, pids[3], 'Y');
  r = await call('searchAll', cc.token, '라', {}); ok('검색에 직접 수료 반영', r.ok && r.data.수강생[0].수강[0].상태 === '수료', r.data);

  // 보고 제출 후에는 수료 체크도 잠김
  r = await call('submitReport', cc.token, 2026, '상반기', '춘천시지회'); ok('보고 제출', r.ok, r);
  r = await call('setCompletion', cc.token, id, pids[1], 'N'); ok('보고 제출 뒤 수료 체크 잠김', !r.ok && /수정할 수 없/.test(r.error), r);
  // 일지·과제는 보고와 무관하게 계속 가능
  r = await call('saveJournal', cc.token, id, 3, { 주제: '복습' }); ok('보고 후에도 일지 가능', r.ok, r);

  // 인원수만 입력 강좌
  r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '학교 특강', 시작일: '2026-04-01', 종료일: '2026-04-30', 총회차: 2, 회당시간: 1, 인원만입력: 'Y', 교육구분: '외부', 주관: '지회', 수료집계: false });
  if (r.ok) {
    const hid = r.data.course.강좌ID;
    r = await call('getTasks', cc.token, hid); ok('인원수 강좌는 과제 없음', !r.ok, r);
    r = await call('getJournal', cc.token, hid); ok('인원수 강좌도 일지는 가능', r.ok, r);
  }
  console.log(`${real ? '실DB' : '가짜DB'} 통과 ${pass} / 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
