'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const http = require('http'), fs = require('fs'), path = require('path');
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { chromium } = require('playwright');
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : String(x).slice(0, 300)); } };
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_, db = new MemoryDb(S);
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: H(pw), 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y', 최근접속: '', 인쇄설정: '' });
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('admin', 'adminpw1', '도협회', '도협회'), mem('cc', 'ccpw1234', '춘천시지회', '지회'), mem('wj', 'wjpw1234', '원주시지회', '지회')] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  for (const [u, pw, ch, names] of [['cc', 'ccpw1234', '춘천시지회', ['초급반', '중급반']], ['wj', 'wjpw1234', '원주시지회', ['특강']]]) {
    const t = (await call('login', u, pw)).data;
    for (const nm of names) await call('saveCourse', t.token, { 지회명: ch, 강좌명: nm, 시작일: '2026-11-02', 종료일: '2026-12-28', 총회차: 4, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50, 강사: nm + '강사' });
  }
  const srv = http.createServer(async (q, s2) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s2.setHeader('Content-Type', 'application/json'); return s2.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    try { const f = q.url === '/' ? 'index.html' : q.url.slice(1); s2.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8'); s2.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s2.statusCode = 404; s2.end('x'); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port, br = await chromium.launch(), errs = [];
  const pg = await (await br.newContext({ viewport: { width: 1000, height: 900 } })).newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(base + '/'); await pg.fill('#lid', 'admin'); await pg.fill('#lpw', 'adminpw1'); await pg.click('#lbtn'); await pg.waitForSelector('details.grp');
  ok('지회별 묶음 2개', (await pg.$$('details.grp')).length === 2);
  ok('처음엔 접혀 있음', (await pg.$$eval('details.grp', e => e.every(d => !d.open))));
  ok('접힌 상태에서는 강좌 카드 안 보임', (await pg.$$('.course:visible')).length === 0);
  ok('굵은 지회명·강좌 수 표시', (await pg.textContent('details.grp summary')).includes('강좌 2개') || (await pg.textContent('details.grp summary')).includes('강좌 1개'));
  await pg.click('details.grp summary'); ok('눌러서 펼치면 카드 보임', (await pg.$$('.course:visible')).length >= 1);
  await pg.click('#fOpen'); ok('모두 펴기', (await pg.$$('.course:visible')).length === 3);
  await pg.click('#fClose'); ok('모두 접기', (await pg.$$('.course:visible')).length === 0);
  await pg.fill('#fq', '특강'); ok('걸러보기: 원주 특강만, 자동 펼침', (await pg.$$('.course:visible')).length === 1 && (await pg.$$('details.grp')).length === 1);
  await pg.fill('#fq', '중급반강사'); ok('강사 이름으로도 걸러짐', (await pg.$$('.course:visible')).length === 1 && (await pg.textContent('#list')).includes('중급반'));
  await pg.fill('#fq', '없는이름'); ok('결과 없음 안내', (await pg.textContent('#list')).includes('걸러낸 결과가 없습니다'));
  await pg.fill('#fq', ''); await pg.click('#fOpen'); await pg.click('.course >> nth=0'); await pg.waitForSelector('#back'); await pg.click('#back'); await pg.waitForSelector('details.grp');
  ok('상세 보고 돌아오면 펼친 상태 유지', (await pg.$$('.course:visible')).length === 3);
  const cp = await (await br.newContext({ viewport: { width: 1000, height: 900 } })).newPage(); cp.on('pageerror', e => errs.push(e.message));
  await cp.goto(base + '/'); await cp.fill('#lid', 'cc'); await cp.fill('#lpw', 'ccpw1234'); await cp.click('#lbtn'); await cp.waitForSelector('.course');
  ok('지회 화면은 그대로(접이식 아님, 필터칸 없음)', (await cp.$$('details.grp')).length === 0 && !(await cp.$('#fq')) && (await cp.$$('.course')).length === 2);
  ok('화면 오류 없음', errs.length === 0, errs.join('|'));
  console.log('도협회 목록 통과', pass, '/ 실패', fail); await br.close(); srv.close();
})().catch(e => { console.log(e); process.exit(1); });
