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
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') {
      let b = ''; for await (const c of q) b += c;
      s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b))));
    }
    const f = q.url.startsWith('/t/') ? 'teacher.html' : (q.url === '/' ? 'index.html' : q.url.slice(1));
    try { s.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end(); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), pg = await (await br.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(base + '/t/' + tok);
  await pg.waitForSelector('.person');
  ok('제목', (await pg.textContent('header h1')).includes('초급 1기'));
  await pg.click('[data-p]:nth-child(1)');
  await pg.click('#save'); await pg.waitForSelector('.toast');
  let d = (await call('getCourseDetail', cc.token, id)).data;
  ok('출석 반영', d.participants.find(p => p.이름 === '가나다').출석횟수 === 1, JSON.stringify(d.participants.map(p => p.출석횟수)));
  await pg.click('[data-t=jr]'); await pg.waitForSelector('#jt');
  await pg.fill('#jt', '인사 표현'); await pg.fill('#jc', '기본 인사 연습'); await pg.click('#save'); await pg.waitForTimeout(400);
  const j = (await call('getJournal', cc.token, id)).data;
  ok('일지 반영', JSON.stringify(j).includes('인사 표현'));
  await pg.click('[data-t=tk]'); await pg.waitForSelector('#kn');
  await pg.fill('#kn', '자기소개 영상'); await pg.click('#ksave'); await pg.waitForSelector('[data-tk]');
  await pg.click('[data-tk]'); await pg.waitForTimeout(400);
  const t = (await call('getTasks', cc.token, id)).data;
  ok('과제 제출 반영', Object.values(t.submits).flat().length === 1, JSON.stringify(t.submits));
  await pg.goto(base + '/t/' + '0'.repeat(40)); await pg.waitForSelector('.center h2');
  ok('잘못된 링크 안내', (await pg.textContent('.center h2')).includes('사용할 수 없는'));
  await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '춘천인원강좌', 시작일: '2026-11-01', 종료일: '2026-12-31', 총회차: 3, 회당시간: 2, 수준: '특강', 교육구분: '내부', 주관: '지회', 수료기준: 50, 인원만입력: 'Y' });
  await call('revokeTeacherLink', cc.token, id);
  await pg.goto(base + '/t/' + tok); await pg.waitForSelector('.center h2');
  ok('끈 링크 차단', (await pg.textContent('.center h2')).includes('사용할 수 없는'));
  await call('revokeTeacherLink', cc.token, id);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [{ 아이디: 'admin', 비밀번호: H('adminpw1'), 지회명: '도협회', 담당자: 'a', 권한: '도협회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const ad = (await call('login', 'admin', 'adminpw1')).data;
  for (const head of ['Y', '']) {
    await call('saveCourse', ad.token, { 지회명: '도협회', 강좌명: 'HQ강좌' + head, 시작일: '2026-11-01', 종료일: '2026-12-31', 총회차: 3, 회당시간: 2, 수준: '특강', 교육구분: '내부', 주관: '센터', 수료기준: 50, 인원만입력: head });
  }
  await pg.goto(base + '/');
  await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'adminpw1'); await pg.click('#lbtn');
  await pg.waitForSelector('#fOpen'); await pg.click('#fOpen'); await pg.waitForSelector('.course');
  const names = await pg.$$eval('.course', e => e.map(x => x.textContent.trim().slice(0, 30)));
  console.log(names);
  const cs = await pg.$$('.course');
  for (let k = 0; k < cs.length; k++) {
    await (await pg.$$('.course'))[k].click();
    await pg.waitForSelector('#cTabBody');
    const has = await pg.$('[data-ct=link]');
    console.log(k, 'tab', !!has, (await pg.$$eval('[data-ct]', e => e.map(x => x.textContent))).join('|'));
    if (has) { await pg.click('[data-cts~=link]'); if (await pg.$('.subtabs [data-ct=link]')) await pg.click('.subtabs [data-ct=link]'); await pg.waitForTimeout(600); if (await pg.$('#lkMake')) { await pg.click('#lkMake'); await pg.waitForTimeout(600); console.log('만들기 후 주소', !!(await pg.$('#lkUrl'))); } console.log((await pg.textContent('#cTabBody')).replace(/\s+/g, ' ').slice(0, 150)); }
    await pg.click('#back');
    await pg.waitForSelector('#fOpen'); await pg.click('#fOpen'); await pg.waitForSelector('.course');
  }
  ok('JS 오류 없음', errs.length === 0, errs.join('|'));
  console.log('강사화면 통과', pass, '/ 실패', fail);
  await br.close(); srv.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
