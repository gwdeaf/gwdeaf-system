'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const http = require('http'), fs = require('fs'), path = require('path');
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { chromium } = require('playwright');
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : String(x).slice(0, 300)); } };
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_, db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [{ 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data;
  const mk = async (name, s, e) => (await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: name, 시작일: s, 종료일: e, 총회차: 2, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50 })).data.course.강좌ID;
  await mk('초급반', '2026-12-01', '2027-03-31'); await mk('중급반', '2026-12-02', '2027-03-31'); await mk('고급반', '2026-12-03', '2027-03-31');
  const route = u => u.startsWith('/g/') ? 'group.html' : u.startsWith('/a/') ? 'apply.html' : (u === '/' ? 'index.html' : u.slice(1));
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    try { const f = route(q.url); s.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end('x'); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), errs = [];
  const pg = await (await br.newContext({ viewport: { width: 1200, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(base + '/'); await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn'); await pg.waitForSelector('.course');
  await pg.click('[data-tab=apply]'); await pg.waitForSelector('#hubAll');
  ok('강좌 3개 표시', (await pg.$$('[data-hs]')).length === 3);
  await pg.click('#hubAll'); ok('선택 3개', (await pg.textContent('#hubCnt')) === '3');
  await pg.fill('#hubT', '2027 1학기 수어교실'); await pg.click('#hubGrp'); await pg.waitForSelector('[data-lk^=g] canvas');
  ok('묶음 QR 그려짐', (await pg.$$('[data-lk^=g] canvas')).length === 1);
  const gurl = await pg.inputValue('[data-lk^=g] input'); ok('묶음 링크 /g/', /\/g\/[0-9a-f]{40}$/.test(gurl), gurl);
  await pg.click('[data-hs]:nth-of-type(1)').catch(() => {});
  await pg.evaluate(() => document.querySelectorAll('[data-hs]').forEach((c, i) => { c.checked = i < 2; c.dispatchEvent(new Event('change')); }));
  await pg.click('#hubEach'); await pg.waitForSelector('[data-lk^=c] canvas');
  ok('강좌별 QR 2개', (await pg.$$('[data-lk^=c] canvas')).length === 2, (await pg.$$('[data-lk^=c] canvas')).length);
  await pg.screenshot({ path: '/home/claude/out/hub.png', fullPage: true });
  // 수강생 화면
  const sp = await (await br.newContext({ viewport: { width: 390, height: 900 } })).newPage(); sp.on('pageerror', e => errs.push(e.message));
  await sp.goto(gurl); await sp.waitForSelector('#cl');
  ok('묶음 신청 화면 3강좌', (await sp.$$('input[name=cc]')).length === 3);
  await sp.fill('#n', '홍길동'); await sp.fill('#p', '010-5555-6666'); await sp.check('#a');
  await sp.click('#b'); await sp.waitForSelector('.err'); ok('강좌 미선택 안내', (await sp.textContent('.err')).includes('선택'));
  await sp.evaluate(() => { document.querySelectorAll('input[name=cc]').forEach((c, i) => { if (i < 2) c.click(); }); });
  await sp.click('#b'); await sp.waitForSelector('#rcpt');
  const rc = await sp.textContent('#rcpt'); ok('접수증에 2강좌', rc.includes('홍길동') && rc.includes('고급반') && rc.includes('중급반') && !rc.includes('초급반'), rc);
  await sp.screenshot({ path: '/home/claude/out/group_receipt.png' });
  // 담당자 허브 대기 수 반영
  await pg.click('[data-tab=courses]'); await pg.click('[data-tab=apply]'); await pg.waitForSelector('#hubAll');
  ok('허브에 대기 2건', (await pg.textContent('body')).includes('대기 2'));
  // 강좌 접수 탭 QR
  await pg.click('[data-cmanage]'); await pg.waitForSelector('#apCopy'); ok('강좌 접수 탭 QR', !!(await pg.$('#cTabBody canvas')));
  ok('에러 없음', errs.length === 0, errs.join('|'));
  console.log('접수안내 UI 통과', pass, '/ 실패', fail); await br.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
