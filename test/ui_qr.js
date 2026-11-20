'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const http = require('http'), fs = require('fs'), path = require('path');
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : String(x).slice(0, 300)); } };
const day = d => new Date(Date.now() + d * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
const sign = async pg => { const b = await pg.locator('#sg').boundingBox(); await pg.mouse.move(b.x + 20, b.y + 30); await pg.mouse.down(); for (let i = 0; i < 12; i++) await pg.mouse.move(b.x + 20 + i * 12, b.y + 30 + (i % 3) * 15); await pg.mouse.up(); };
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [{ 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data;
  let r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: 'QR화면강좌', 시작일: day(-2), 종료일: day(30), 총회차: 3, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료집계: 'Y' });
  const id = r.data.course.강좌ID;
  await call('addParticipants', cc.token, id, [{ 이름: '가나다', 연락처: '010-1234-5678' }, { 이름: '라마바', 연락처: '' }]);
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    const f = q.url.startsWith('/q/') ? 'attend.html' : (q.url === '/' ? 'index.html' : q.url.slice(1));
    try { s.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end(); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), errs = [];
  const pg = await (await br.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(base + '/'); await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn');
  await pg.waitForSelector('.course'); await pg.click('.course');
  await pg.waitForSelector('#qrBox'); await pg.click('#qrBox summary'); await pg.waitForSelector('#qrOn');
  await pg.click('#qrOn'); await pg.waitForSelector('#qrCopy');
  ok('QR 그림이 나옴', !!(await pg.$('#qrBody canvas')));
  const tok = (await call('getQr', cc.token, id)).data.link.token;
  const sc = await br.newContext({ viewport: { width: 390, height: 800 } });
  const sp = await sc.newPage(); sp.on('pageerror', e => errs.push(e.message));
  await sp.goto(base + '/q/' + tok); await sp.waitForSelector('#n');
  ok('수강생 화면에 회차 표시', (await sp.textContent('.sess')).includes('1회차'));
  ok('수강생 화면에 명단이 보이지 않음', !(await sp.content()).includes('가나다'));
  await sp.fill('#n', '가나다'); await sp.fill('#p', '9999'); await sp.click('#b'); await sp.waitForSelector('.err'); ok('서명 없으면 안내', (await sp.textContent('.err')).includes('서명'), 0); await sign(sp); await sp.click('#b'); await sp.waitForFunction(() => /맞지 않/.test((document.querySelector('.err') || { textContent: '' }).textContent));
  ok('틀리면 안내', (await sp.textContent('.err')).includes('맞지 않습니다'));
  await sp.fill('#p', '5678'); await sp.click('#b'); await sp.waitForSelector('.ok');
  ok('출석 완료 화면', (await sp.textContent('h2')).includes('가나다님') && (await sp.textContent('h2')).includes('출석되었습니다'));
  await sp.screenshot({ path: process.env.SHOT ? process.env.SHOT : '/tmp/qr_ok.png' });
  // 같은 휴대폰(같은 브라우저)으로 두 번째 사람
  await sp.reload(); await sp.waitForSelector('#n'); await sp.fill('#n', '라마바'); await sign(sp); await sp.click('#b'); await sp.waitForSelector('.err');
  ok('같은 휴대폰 두 번째 사람 거절', (await sp.textContent('.err')).includes('이미'));
  // 강사 화면에서 새로 불러오면 출석 반영
  await pg.click('#qrRef'); await pg.waitForFunction(() => { const e = document.querySelector('.name[data-pid]'); return e && e.getAttribute('aria-pressed') === 'true'; }).catch(() => {});
  ok('강사 화면에 QR 출석 반영', (await pg.getAttribute('.name[data-pid]', 'aria-pressed')) === 'true');
  await pg.click('#qrBox summary').catch(() => {});
  ok('화면 오류 없음', !errs.length, errs.join('|'));
  await br.close(); srv.close();
  console.log(`QR 화면 통과 ${pass} / 실패 ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(1); });
