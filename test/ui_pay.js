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
  let r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '유료강좌', 시작일: day(-2), 종료일: day(30), 총회차: 3, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료집계: 'Y', 수강료: '80,000' });
  const id = r.data.course.강좌ID;
  await call('addParticipants', cc.token, id, [{ 이름: '가나다', 연락처: '010-1234-5678' }, { 이름: '라마바', 연락처: '' }]);
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    const f = q.url.startsWith('/p/') ? 'receipt.html' : q.url.startsWith('/x/') ? 'refund.html' : (q.url === '/' ? 'index.html' : q.url.slice(1));
    try { s.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end(); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), errs = [];
  const pg = await (await br.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.print = () => { window.__printed = document.querySelector('#printArea').innerHTML; }; });
  await pg.goto(base + '/'); await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn');
  await pg.waitForSelector('.course'); await pg.click('.course');
  await pg.waitForSelector('[data-cts~="pay"]'); await pg.click('[data-cts~="pay"]'); await pg.click('.subtabs [data-ct="pay"]');
  await pg.waitForSelector('#pyPaid');
  ok('수강료 표시', (await pg.textContent('#cTabBody')).includes('80,000원'));
  await pg.click('[data-py]'); await pg.click('#pyPaid');
  await pg.waitForFunction(() => document.body.textContent.includes('납부 1명'));
  ok('납부 처리', true);
  await pg.click('#pyRc');
  await pg.waitForFunction(() => window.__printed);
  const pr = await pg.evaluate(() => window.__printed);
  ok('영수증 인쇄 내용', pr.includes('일금 팔만원정') && pr.includes('가나다') && pr.includes('영수번호'), pr.slice(0, 200));
  // 수강생 직접 받기
  await pg.click('#pyOn'); await pg.waitForSelector('#pyUrl');
  const url = await pg.inputValue('#pyUrl');
  ok('영수증 링크 /p/', /\/p\/[0-9a-f]{40}$/.test(url), url);
  const sp = await (await br.newContext({ viewport: { width: 390, height: 800 } })).newPage(); sp.on('pageerror', e => errs.push(e.message));
  await sp.goto(base + '/p/' + url.split('/').pop()); await sp.waitForSelector('#n');
  await sp.fill('#n', '가나다'); await sp.fill('#p', '5678'); await sp.click('#b'); await sp.waitForSelector('.rc');
  ok('수강생 영수증 화면', (await sp.textContent('.rc')).includes('팔만원정'));
  // 환불 링크
  await pg.click('[data-plk]'); await pg.waitForSelector('#dlgOk'); const msg = await pg.textContent('#dlgBody').catch(() => ''); await pg.click('#dlgOk');
  const gp = (await call('getPay', cc.token, id)).data;
  ok('환불 링크 생성', gp.items.find(x => x.이름 === '가나다').환불링크 === true);
  const rl = (await call('createRefundLink', cc.token, id, gp.items.find(x => x.이름 === '가나다').참여자ID)).data.환불링크토큰;
  const rp = await (await br.newContext({ viewport: { width: 390, height: 800 } })).newPage(); rp.on('pageerror', e => errs.push(e.message));
  await rp.goto(base + '/x/' + String(rl).split('/').pop()); await rp.waitForSelector('#rb');
  await rp.fill('#rb', '농협'); await rp.fill('#ra', '123-4567-8901'); await rp.fill('#rh', '가나다'); await rp.check('#ag'); await rp.click('#b'); await rp.waitForSelector('.ok');
  ok('환불 요청 접수', (await rp.textContent('h2')).includes('접수'));
  await pg.click('.subtabs [data-ct="apply"]'); await pg.click('.subtabs [data-ct="pay"]'); await pg.waitForSelector('#pyPaid');
  ok('강사 화면에 환불 요청과 계좌', (await pg.textContent('#cTabBody')).includes('123-4567-8901'));
  await pg.click('[data-prf]'); await pg.waitForFunction(() => window.__printed && window.__printed.includes('환불 요청서'));
  ok('환불 요청서 인쇄', true);
  await pg.click('[data-pdn]'); await pg.click('#dlgOk'); await pg.waitForFunction(() => document.body.textContent.includes('환불 완료') && !document.body.textContent.includes('123-4567-8901'));
  ok('환불 완료(계좌 지워짐)', true);
  await pg.screenshot({ path: '/tmp/pay_ui.png' });
  ok('화면 오류 없음', !errs.length, errs.join('|'));
  await br.close(); srv.close();
  console.log(`수납 화면 통과 ${pass} / 실패 ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(1); });
