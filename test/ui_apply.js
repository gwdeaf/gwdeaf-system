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
    const f = q.url.startsWith('/a/') ? 'apply.html' : q.url.startsWith('/t/') ? 'teacher.html' : (q.url === '/' ? 'index.html' : q.url.slice(1));
    try { s.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end(); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch();
  const errs = [];
  const pg = await (await br.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(base + '/'); await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn');
  await pg.waitForSelector('.course'); await pg.click('.course');
  await pg.click('[data-cts~=apply]'); if (await pg.$('.subtabs [data-ct=apply]')) await pg.click('.subtabs [data-ct=apply]'); await pg.waitForSelector('#apSave');
  await pg.fill('#apNote', '준비물: 필기도구'); await pg.click('#apSave'); await pg.waitForSelector('#apUrl');
  const url = await pg.inputValue('#apUrl'); ok('접수 링크 생성', /\/a\/[0-9a-f]{40}$/.test(url), url);
  // 수강생 화면
  const sp = await (await br.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  sp.on('pageerror', e => errs.push(e.message));
  await sp.addInitScript(() => { window.daum = { Postcode: function (o) { this.embed = el => { el.innerHTML = '<button id=pick>선택</button>'; el.querySelector('#pick').onclick = () => o.oncomplete({ zonecode: '24341', roadAddress: '강원 춘천시 중앙로 1' }); }; } }; });
  await sp.goto(url); await sp.waitForSelector('#f');
  ok('강좌·안내 표시', (await sp.textContent('body')).includes('초급 1기') && (await sp.textContent('body')).includes('필기도구'));
  await sp.fill('#n', '이수강'); await sp.fill('#p', '010-3333-4444'); await sp.click('#b'); await sp.waitForSelector('.err');
  ok('동의 안 하면 막힘', (await sp.textContent('.err')).includes('동의'));
  await sp.click('#zb'); await sp.click('#pick'); await sp.fill('#a2', '101호');
  ok('주소 채워짐', (await sp.inputValue('#z')) === '24341' && (await sp.inputValue('#a1')).includes('중앙로'));
  await sp.check('#a'); await sp.click('#b'); await sp.waitForSelector('.ok');
  ok('접수 완료 화면', (await sp.textContent('body')).includes('접수되었습니다'));
  // 담당자: 담당자 입력 + 승인
  await pg.fill('#apN', '박전화'); await pg.fill('#apP', '010-9999-0000'); await pg.click('#apAdd'); await pg.waitForFunction(() => document.querySelectorAll('[data-ap]').length === 2);
  await pg.waitForTimeout(1500); console.log('ERRS', errs); console.log((await pg.evaluate(()=>document.querySelector('#view').innerHTML)).replace(/[\s\S]*(<div class="seg")/, '$1').slice(0,900)); await pg.click('[data-cts~=apply]'); if (await pg.$('.subtabs [data-ct=apply]')) await pg.click('.subtabs [data-ct=apply]'); await pg.waitForSelector('#apSave'); await pg.waitForFunction(() => document.querySelectorAll('[data-ap]').length === 2);
  ok('목록에 2건', (await pg.$$('[data-ap]')).length === 2);
  await pg.evaluate(() => document.querySelector('#apAll').click()); await pg.click('#apOk'); await pg.waitForFunction(() => document.body.innerText.includes('승인 2'));
  const d = (await call('getCourseDetail', cc.token, id)).data;
  ok('승인하면 명단 등록', d.participants.length === 4 && d.participants.some(p => p.이름 === '이수강'), d.participants.map(p => p.이름));
  ok('담당자 화면에 주소', (await pg.textContent('body')).includes('(24341) 강원 춘천시 중앙로 1 101호'));
  // 접수 닫기
  await pg.click('#apOff'); await pg.click('#dlgOk'); await pg.waitForFunction(() => !document.querySelector('#apUrl'));
  await sp.goto(url); await sp.waitForSelector('.center h2');
  ok('닫으면 신청 불가', (await sp.textContent('.center')).includes('신청할 수 없습니다'));
  ok('에러 없음', errs.length === 0, errs.join('|'));
  console.log('접수 화면 통과', pass, '/ 실패', fail);
  await br.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
