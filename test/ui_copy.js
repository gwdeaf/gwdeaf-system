'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const http = require('http'), fs = require('fs'), path = require('path');
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : String(x).slice(0, 300)); } };
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [{ 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data;
  let r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '초급 1기', 시작일: '2026-11-01', 종료일: '2026-12-31', 총회차: 3, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50, 강사: '김강사' });
  const id = r.data.course.강좌ID;
  await call('addParticipants', cc.token, id, [{ 이름: '가나다' }, { 이름: '라마바' }]);
  const tok = (await call('createTeacherLink', cc.token, id)).data.token;
  await call('saveJournal', cc.token, id, 2, { 수업일: '2026-11-08', 주제: '숫자', 내용: '숫자 연습', 과제: '', 특이사항: '' });
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') {
      let b = ''; for await (const c of q) b += c;
      s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b))));
    }
    const f = q.url.startsWith('/t/') ? 'teacher.html' : (q.url === '/' ? 'index.html' : q.url.slice(1));
    try { s.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end(); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), pg = await (await br.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/');
  await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn');
  await pg.waitForSelector('.course'); await pg.click('.course');
  await pg.click('[data-ctab=info], button:has-text("강좌 정보")'); await pg.waitForSelector('#cCopy');
  await pg.click('#cCopy'); await pg.waitForSelector('#c강좌명');
  ok('복사 안내', (await pg.textContent('body')).includes('설정을 복사했습니다'));
  ok('이름 복사·날짜 비움', (await pg.inputValue('#c강좌명')) === '초급 1기' && (await pg.inputValue('#c시작일')) === '');
  ok('설정 복사', (await pg.inputValue('#c총회차')) === '3' && (await pg.inputValue('#c강사')) === '김강사', await pg.inputValue('#c총회차'));
  await pg.fill('#c강좌명', '초급 2기'); await pg.fill('#c시작일', '2026-12-01'); await pg.fill('#c종료일', '2026-12-31');
  await pg.click('#cSave'); await pg.waitForTimeout(800);
  const list = (await call('listCourses', (await call('login', 'cc', 'ccpw1234')).data.token)).data;
  const names = JSON.stringify(list);
  ok('새 강좌 생성', names.includes('초급 2기') && names.includes('초급 1기'), names.slice(0, 200));
  ok('에러 없음', errs.length === 0, errs.join('|'));
  console.log('통과', pass, '/ 실패', fail);
  await br.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
