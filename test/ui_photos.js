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
  const br = await chromium.launch();
  // 큰 사진(2400x1800)을 만들어 올립니다
  const pgm = await br.newPage(); await pgm.setContent('<canvas id=c width=2400 height=1800></canvas>');
  const big = Buffer.from(await pgm.evaluate(() => { const c = document.getElementById('c'), g = c.getContext('2d'); for (let i = 0; i < 400; i++) { g.fillStyle = `rgb(${i % 255},${(i * 7) % 255},${(i * 13) % 255})`; g.fillRect((i * 37) % 2400, (i * 53) % 1800, 300, 200); } return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  const pg = await (await br.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(base + '/t/' + tok); await pg.waitForSelector('.person');
  await pg.click('[data-t=jr]'); await pg.waitForSelector('#jp1');
  await pg.setInputFiles('[data-padd="1"]', { name: 'a.png', mimeType: 'image/png', buffer: big });
  await pg.waitForSelector('#jp1 img'); 
  let j = (await call('getJournal', cc.token, id)).data;
  ok('강사 사진 1장 저장', j.sessions[0].사진.length === 1, JSON.stringify(j.sessions[0]));
  const ph = (await call('getJournalPhotos', cc.token, id, 1)).data.photos[0];
  ok('사진 줄여서 저장', ph.사진.startsWith('data:image/jpeg') && ph.사진.length < 245000, ph.사진.length);
  await pg.setInputFiles('[data-padd="1"]', { name: 'b.png', mimeType: 'image/png', buffer: big }); await pg.waitForFunction(() => document.querySelectorAll('#jp1 img').length === 2);
  await pg.setInputFiles('[data-padd="1"]', { name: 'c.png', mimeType: 'image/png', buffer: big }); await pg.waitForFunction(() => document.querySelectorAll('#jp1 img').length === 3);
  ok('3장이면 추가 버튼 숨김', (await pg.$$('[data-padd="1"]')).length === 0);
  await pg.click('[data-pdel]'); await pg.waitForFunction(() => document.querySelectorAll('#jp1 img').length === 2);
  j = (await call('getJournal', cc.token, id)).data; ok('강사 삭제', j.sessions[0].사진.length === 2);
  await pg.fill('#jt', '인사'); await pg.fill('#jw', '김강사님'); 
  const bb = await (await pg.$('#js canvas')).boundingBox();
  await pg.mouse.move(bb.x + 20, bb.y + 40); await pg.mouse.down(); for (let k = 0; k < 20; k++) await pg.mouse.move(bb.x + 20 + k * 8, bb.y + 40 + (k % 5) * 12); await pg.mouse.up();
  await pg.click('#save'); await pg.waitForTimeout(600);
  j = (await call('getJournal', cc.token, id)).data;
  ok('작성자·서명 저장', j.sessions[0].작성자 === '김강사님' && j.sessions[0].서명.startsWith('data:image/png'), JSON.stringify(j.sessions[0]).slice(0, 200));
  ok('사진은 그대로', j.sessions[0].사진.length === 2);
  ok('저장된 서명이 보임', (await pg.$$('#js img')).length === 1);
  await pg.click('#save'); await pg.waitForTimeout(500);
  ok('다시 저장해도 서명 유지', (await call('getJournal', cc.token, id)).data.sessions[0].서명.length > 800);
  // 지회 화면
  const pg2 = await (await br.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  pg2.on('pageerror', e => errs.push(e.message)); pg2.on('dialog', d => d.accept());
  await pg2.addInitScript(() => { window.print = () => { window.__printed = document.querySelector('#printArea').innerHTML; }; });
  await pg2.goto(base + '/'); await pg2.fill('#lid', 'cc'); await pg2.fill('#lpw', 'ccpw1234'); await pg2.click('#lbtn');
  await pg2.waitForSelector('.course'); await pg2.click('.course');
  await pg2.click('[data-ct=journal], [data-tab=journal], button:has-text("교육일지")'); await pg2.waitForSelector('#jPrt');
  await pg2.click('[data-jsn="1"] summary'); await pg2.waitForSelector('#jp1 img');
  ok('지회에도 사진 표시', (await pg2.$$('#jp1 img')).length === 2);
  await pg2.setInputFiles('[data-padd="2"]', { name: 'd.png', mimeType: 'image/png', buffer: big }).catch(async () => { await pg2.click('[data-jsn="2"] summary'); await pg2.setInputFiles('[data-padd="2"]', { name: 'd.png', mimeType: 'image/png', buffer: big }); });
  await pg2.waitForSelector('#jp2 img');
  await pg2.click('#jPrt'); await pg2.waitForSelector('#dlgOk'); await pg2.click('#dlgOk'); await pg2.waitForFunction(() => window.__printed, null, { timeout: 8000 });
  const html = await pg2.evaluate(() => window.__printed);
  ok('1회차=1장 (2페이지)', (html.match(/class="jr-page"/g) || []).length === 2, (html.match(/jr-page/g) || []).length);
  ok('인쇄에 사진 포함', (html.match(/<img /g) || []).length === 4, (html.match(/<img /g) || []).length);
  ok('하단 작성일·작성자·서명', html.includes('jr-sign') && html.includes('김강사님') && html.includes('2026-11-08'), html.slice(-400));
  ok('에러 없음', errs.length === 0, errs.join('|'));
  console.log('통과', pass, '/ 실패', fail);
  await br.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
