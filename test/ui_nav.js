'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const http = require('http'), fs = require('fs'), path = require('path');
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : String(x).slice(0, 300)); } };
const day = d => new Date(Date.now() + d * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [{ 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data;
  const mk = { 지회명: '춘천시지회', 강좌명: '뒤로가기강좌', 시작일: day(5), 종료일: day(60), 총회차: 10, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료집계: 'Y' };
  await call('saveCourse', cc.token, mk);
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    const f = q.url === '/' ? 'index.html' : q.url.slice(1);
    try { s.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end(); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), errs = [];
  const pg = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(base + '/'); await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn'); await pg.waitForSelector('.course');
  ok('첫 화면에서는 뒤로 버튼 없음', await pg.isHidden('#backBtn'));
  const box = await pg.evaluate(() => { const t = document.querySelector('#tabs').getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect(), b = [...document.querySelectorAll('#tabs button')].map(x => x.getBoundingClientRect()); return { tl: t.left, tw: t.width, ml: m.left, tops: b.map(x => Math.round(x.top)), small: getComputedStyle(document.querySelector('#tabs small')).display }; });
  ok('PC: 메뉴가 왼쪽 세로', box.tl === 0 && box.tw > 150 && box.tops[1] > box.tops[0] && box.ml >= 220, JSON.stringify(box));
  ok('PC: 큰 이름 아래 작은 설명', box.small === 'block' && (await pg.textContent('#tabs [data-tab="courses"] small')).includes('출석'));
  await pg.screenshot({ path: '/tmp/nav_pc.png' });
  await pg.click('#tabs [data-tab="me"]'); await pg.waitForSelector('#phIn');
  ok('이동하면 뒤로 버튼', await pg.isVisible('#backBtn'));
  await pg.click('#backBtn'); await pg.waitForSelector('.course'); ok('뒤로 → 강좌', true);
  await pg.click('.course'); await pg.waitForSelector('#back'); await pg.click('#tabs [data-tab="apply"]'); await pg.waitForTimeout(200);
  await pg.goBack(); await pg.waitForSelector('#back'); ok('브라우저 뒤로: 강좌 상세', true);
  await pg.goBack(); await pg.waitForSelector('.course'); ok('브라우저 뒤로: 목록', (await pg.$$('#back')).length === 0);
  await pg.click('#tabs [data-tab="me"]'); await pg.waitForSelector('#phIn'); await pg.click('#homeLink'); await pg.waitForSelector('.course'); ok('제목 누르면 첫 화면', true);
  // 회차별 강사·시간
  await pg.click('.course'); await pg.waitForSelector('#back'); await pg.click('[data-ct="info"]'); await pg.click('[data-ct="plan"]'); await pg.waitForSelector('#plTbl');
  ok('회차 강사 표', (await pg.$$('#plTbl tbody tr')).length === 10);
  await pg.fill('#plAllW', '김강사'); await pg.fill('#plAllS', '19:00'); await pg.fill('#plAllE', '20:30'); await pg.click('#plAll');
  ok('한꺼번에 넣기', (await pg.textContent('#plTbl tbody tr:first-child [data-h]')).includes('1.5'));
  await pg.fill('#plTbl tbody tr:nth-child(2) [data-f="강사"]', '이강사'); await pg.click('#plSave'); await pg.waitForFunction(() => document.body.textContent.includes('회차별 강사·시간을 저장했습니다'));
  const pl = (await call('getPlan', cc.token, '춘천시지회-' + new Date().getFullYear() + '-001')).data;
  ok('저장됨', pl.rows[1].강사 === '이강사' && pl.rows[0].시작시간 === '19:00', JSON.stringify(pl.rows.slice(0, 2)));
  await pg.click('#tabs [data-tab="courses"]'); await pg.waitForSelector('.course');
  const pm = await (await br.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await pm.goto(base + '/'); await pm.fill('#lid', 'cc'); await pm.fill('#lpw', 'ccpw1234'); await pm.click('#lbtn'); await pm.waitForSelector('.course');
  const mb = await pm.evaluate(() => { const t = document.querySelector('#tabs').getBoundingClientRect(); return { top: t.top, h: t.height, small: getComputedStyle(document.querySelector('#tabs small')).display, vw: innerHeight }; });
  ok('휴대폰: 아래 메뉴 그대로', mb.top > 600 && mb.small === 'none', JSON.stringify(mb));
  await pm.screenshot({ path: '/tmp/nav_m.png' });
  ok('화면 오류 없음', errs.length === 0, errs.join('|'));
  console.log(`뒤로가기·메뉴 통과 ${pass} / 실패 ${fail}`); await br.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
