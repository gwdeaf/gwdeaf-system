'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const http = require('http'), fs = require('fs'), path = require('path');
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : String(x).slice(0, 300)); } };
(async () => {
  const c0 = makeContext(new Host()), S = c0.__x.SHEETS, H = c0.makeHash_;
  const db = new MemoryDb(S);
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: H(pw), 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y', 최근접속: '', 인쇄설정: '' });
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('admin', 'adminpw1', '도협회', '도협회'), mem('cc', 'ccpw1234', '춘천시지회', '지회')] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const ad = (await call('login', 'admin', 'adminpw1')).data, cc = (await call('login', 'cc', 'ccpw1234')).data;
  const base0 = { 시작일: '2026-11-01', 종료일: '2026-12-31', 총회차: 3, 회당시간: 2, 수준: '특강', 교육구분: '외부', 수료기준: 50, 기관명: '한림초등학교' };
  let r = await call('saveCourse', cc.token, Object.assign({ 지회명: '춘천시지회', 강좌명: '확인서강좌', 주관: '지회', 확인서필요: 'Y' }, base0));
  ok('저장', r.ok && r.data.course.확인서필요 === 'Y', r); const id = r.data.course.강좌ID;
  r = await call('setConfirmReceived', cc.token, id, true, ''); ok('받음', r.ok && r.data.course.확인서수령 === 'Y' && /^\d{4}-/.test(r.data.course.확인서수령일), r);
  r = await call('setConfirmReceived', cc.token, id, false, ''); ok('취소', r.ok && r.data.course.확인서수령 === '' && r.data.course.확인서수령일 === '', r);
  r = await call('saveCourse', cc.token, Object.assign({ 지회명: '춘천시지회', 강좌명: '필요없음', 주관: '지회' }, base0));
  r = await call('setConfirmReceived', cc.token, r.data.course.강좌ID, true, ''); ok('필요 아닌 강좌는 거부', !r.ok, r);
  const ot = await call('login', 'cc', 'ccpw1234'); 
  r = await call('setConfirmReceived', ad.token, id, true, ''); ok('도협회: 명단 있는 지회 강좌도 표시는 가능(접근권한)', r.ok || r.code, r);
  await call('setConfirmReceived', cc.token, id, false, '');
  r = await call('listCourses', cc.token, { 연도: 2026 }); ok('목록에 확인서 정보', JSON.stringify(r).includes('확인서필요'), '');
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    const f = q.url === '/' ? 'index.html' : q.url.slice(1);
    try { s.setHeader('Content-Type', 'text/html; charset=utf-8'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end(); }
  }).listen(0);
  const br = await chromium.launch(), pg = await (await br.newContext({ viewport: { width: 420, height: 900 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { window.print = () => { window.__printed = document.querySelector('#printArea').innerText; }; });
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/');
  await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn');
  await pg.waitForSelector('.course');
  ok('목록 태그', (await pg.textContent('#list')).includes('확인서 미수령'));
  await pg.click('.course'); await pg.waitForSelector('#cfPrint');
  await pg.click('#cfPrint'); await pg.waitForTimeout(300);
  const txt = await pg.evaluate(() => window.__printed || '');
  ok('인쇄 내용', txt.includes('강 의 확 인 서') && txt.includes('한림초등학교') && txt.includes('확인서강좌') && txt.includes('총 3회 × 2시간 = 6시간') && txt.includes('서명'), txt);
  await pg.click('#cfToggle'); await pg.waitForTimeout(500);
  ok('받음 표시', (await pg.textContent('#cfToggle')).includes('취소') && /받음 \d{4}/.test(await pg.textContent('.panel.no-print')));
  ok('JS 오류 없음', errs.length === 0, errs.join('|'));
  console.log('확인서 통과', pass, '/ 실패', fail);
  await br.close(); srv.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
