'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host, purgeMedia } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SIG = 'data:image/png;base64,' + 'A'.repeat(900);
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_, db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [{ 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data;
  const mk = async (name, start, end, extra) => (await call('saveCourse', cc.token, Object.assign({ 지회명: '춘천시지회', 강좌명: name, 시작일: start, 종료일: end, 총회차: 2, 회당시간: 1, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50 }, extra || {}))).data.course;
  const old = (await mk('옛 강좌', '2026-01-05', '2026-02-28')).강좌ID, fresh = (await mk('새 강좌', '2026-11-01', '2027-03-31')).강좌ID;
  for (const id of [old, fresh]) {
    const jr = await call('saveJournal', cc.token, id, 1, { 주제: '인사', 내용: '내용', 작성자서명: SIG }); if (!jr.ok) console.log('SJ', id, jr.error);
    await call('addJournalPhoto', cc.token, id, 1, PNG);
  }
  let r = await call('getJournal', cc.token, fresh); ok('삭제 예정일 = 종료일+3개월', r.ok && r.data.course.삭제예정일 === '2027-06-30', r.data && r.data.course);
  r = await call('getJournal', cc.token, old); ok('옛 강좌 삭제예정일', r.data.course.삭제예정일 === '2026-05-28', r.data.course);
  const n = await purgeMedia(db); ok('자동삭제 1장', n === 1, n);
  r = await call('getJournal', cc.token, old); ok('옛 강좌 사진 0장·글은 남음', r.data.sessions[0].사진.length === 0 && r.data.sessions[0].주제 === '인사', r.data.sessions[0]);
  r = await call('getJournal', cc.token, fresh); ok('새 강좌 사진 유지', r.data.sessions[0].사진.length === 1);
  ok('옛 강좌 서명 삭제', db.t['교육일지'].filter(x => String(x.강좌ID) === old).every(x => !x.작성자서명), '');
  ok('새 강좌 서명 유지', db.t['교육일지'].filter(x => String(x.강좌ID) === fresh).every(x => !!x.작성자서명));
  ok('자동삭제 로그', JSON.stringify(db.t['작업로그']).includes('일지사진서명자동삭제'));
  // 직접 삭제
  r = await call('deleteJournalMedia', cc.token, fresh); ok('전체 삭제', r.ok && r.data.sessions[0].사진.length === 0, r);
  ok('서명도 삭제', db.t['교육일지'].filter(x => String(x.강좌ID) === fresh).every(x => !x.작성자서명));
  // 종료 처리
  const id3 = (await mk('종료할 강좌', '2026-10-01', '2026-12-31')).강좌ID;
  r = await call('saveCourse', cc.token, { 강좌ID: id3, 지회명: '춘천시지회', 강좌명: '종료할 강좌', 시작일: '2026-10-01', 종료일: '2026-12-31', 총회차: 2, 회당시간: 1, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50, 상태: '종료' });
  ok('종료 처리일 기록', r.ok && db.t['강좌정보'].find(x => String(x.강좌ID) === id3).종료처리일 === '2026-11-13', db.t['강좌정보'].find(x => String(x.강좌ID) === id3));
  r = await call('getJournal', cc.token, id3); ok('종료 처리일 기준 삭제예정일', r.data.course.삭제예정일 === '2027-02-13', r.data.course);
  console.log('batch10 통과', pass, '/ 실패', fail); process.exit(fail ? 1 : 0);
})();
