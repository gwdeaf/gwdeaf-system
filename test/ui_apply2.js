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
  let r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '화면강좌', 시작일: day(-2), 종료일: day(30), 총회차: 3, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료집계: 'Y' });
  const id = r.data.course.강좌ID;
  await call('addParticipants', cc.token, id, [{ 이름: '서명이', 연락처: '010-1234-5678' }]);
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    const f = q.url.startsWith('/a/') ? 'apply.html' : q.url.startsWith('/g/') ? 'group.html' : (q.url === '/' ? 'index.html' : q.url.slice(1));
    try { s.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end(); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), errs = [];
  const pg = await (await br.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.print = () => { window.__printed = document.querySelector('#printArea').innerHTML; }; });
  await pg.goto(base + '/'); await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn');
  await pg.waitForSelector('.course'); await pg.click('.course');
  await pg.click('[data-cts~=apply]'); if (await pg.$('.subtabs [data-ct=apply]')) await pg.click('.subtabs [data-ct=apply]'); await pg.waitForSelector('#apSave');
  ok('링크 전에는 항목 편집 안내', (await pg.textContent('body')).includes('접수를 시작하면 받을 항목'));
  await pg.click('#apSave'); await pg.waitForSelector('#fdSave');
  await pg.uncheck('#fdAddr');
  await pg.click('#fdAdd'); await pg.fill('[data-fd=라벨][data-i="0"]', '청각장애 여부'); await pg.selectOption('[data-fd=유형][data-i="0"]', '선택');
  await pg.fill('[data-fd=선택지][data-i="0"]', '청각장애인, 비장애인'); await pg.check('[data-fd=필수][data-i="0"]');
  await pg.click('#fdAdd'); await pg.fill('[data-fd=라벨][data-i="1"]', '수어 경험');
  await pg.click('#fdSave'); await pg.waitForFunction(() => /접수 항목을 저장/.test(document.body.textContent));
  ok('항목 저장 후 유지', (await pg.inputValue('[data-fd=라벨][data-i="0"]')) === '청각장애 여부' && !(await pg.isChecked('#fdAddr')));
  // 포스터 이미지 올리기 (작은 PNG)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADq8AdW7oAAAAAElFTkSuQmCC', 'base64');
  await pg.setInputFiles('#pstFile', { name: 'p.png', mimeType: 'image/png', buffer: png });
  await pg.waitForSelector('#pstImg'); await pg.waitForFunction(() => document.querySelector('#pstImg').src.startsWith('data:image/jpeg'));
  ok('포스터 미리보기', true);
  if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '_admin.png', fullPage: true });
  const url = await pg.inputValue('#apUrl');
  const sp = await (await br.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  sp.on('pageerror', e => errs.push(e.message));
  await sp.goto(url); await sp.waitForSelector('#f');
  ok('접수 화면에 포스터', await sp.locator('img[alt$="홍보 포스터"]').count() === 1);
  ok('주소 칸 숨김', await sp.locator('#z').count() === 0);
  ok('추가 항목 표시', (await sp.textContent('#f')).includes('청각장애 여부') && (await sp.textContent('#f')).includes('수어 경험'));
  ok('동의문에 항목 표시', (await sp.textContent('.agree')).includes('청각장애 여부'));
  if (process.env.SHOT) await sp.screenshot({ path: process.env.SHOT + '_apply.png', fullPage: true });
  await sp.fill('#n', '이수강'); await sp.fill('#p', '010-3333-4444'); await sp.check('#a');
  await sp.click('#b'); await sp.waitForTimeout(300);
  ok('필수 항목 비면 막힘', await sp.locator('.ok').count() === 0);
  await sp.selectOption('#x1', '청각장애인'); await sp.fill('#x2', '1년'); await sp.click('#b'); await sp.waitForSelector('.ok');
  ok('접수증에 답변', (await sp.textContent('#rcpt')).includes('청각장애인') && (await sp.textContent('#rcpt')).includes('1년'));
  // 상태 조회
  await sp.fill('#sn', '이수강'); await sp.fill('#sp', '01033334444'); await sp.click('#sb'); await sp.waitForSelector('.st');
  ok('대기 상태 보임', (await sp.textContent('.st')).includes('확인 중'));
  await sp.fill('#sp', '010-0000-0000'); await sp.click('#sb'); await sp.waitForSelector('#se .err');
  ok('틀린 연락처는 없음 안내', true);
  // 담당자: 목록에 답변 + 승인
  await pg.click('[data-ct=apply]').catch(() => {}); await pg.reload(); await pg.waitForSelector('.course'); await pg.click('.course');
  await pg.click('[data-cts~=apply]'); if (await pg.$('.subtabs [data-ct=apply]')) await pg.click('.subtabs [data-ct=apply]'); await pg.waitForSelector('[data-ap]');
  ok('목록에 추가 답변', (await pg.textContent('.tbl')).includes('청각장애 여부: 청각장애인'));
  await pg.check('[data-ap]'); await pg.click('#apOk'); await pg.waitForFunction(() => /승인하고/.test(document.body.textContent));
  await sp.fill('#sp', '010-3333-4444'); await sp.click('#sb'); await sp.waitForFunction(() => /수강 확정/.test(document.querySelector('#se').textContent));
  ok('승인 상태 보임', true);
  // 포스터 삭제
  await pg.waitForSelector('#pstDel'); await pg.click('#pstDel'); await pg.click('#dlgOk'); await pg.waitForFunction(() => !document.querySelector('#pstImg'));
  ok('포스터 삭제', (await call('applyInfo', url.split('/').pop())).data.포스터 === '');
  // 서명용 출석부
  r = await call('saveQr', cc.token, id, {}); const qt = r.data.link.token;
  const sc = await (await br.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await sc.goto(base + '/q/' + qt).catch(() => {});
  await call('attendSubmit', qt, { 이름: '서명이', 뒤4자리: '5678', 기기: 'device-' + '2'.repeat(20), 서명: 'data:image/png;base64,' + 'A'.repeat(1200) });
  await pg.click('#back'); await pg.waitForSelector('.course'); await pg.click('.course'); await pg.waitForSelector('#prtSign');
  await pg.click('#prtSign'); await pg.waitForSelector('#dlgOk'); await pg.click('#dlgOk'); await pg.waitForFunction(() => window.__printed);
  const html = await pg.evaluate(() => window.__printed);
  ok('서명용 출석부에 서명 그림과 이름', html.includes('서명이') && html.includes('data:image/png;base64,AAAA') && html.includes('1회'));
  // 내 정보 직통번호
  await pg.click('[data-tab=me]').catch(async () => { await pg.click('#tabs button:last-child'); });
  await pg.waitForSelector('#phDir'); await pg.fill('#phDir', '033-555-6666'); await pg.click('#phBtn'); await pg.waitForFunction(() => /저장했습니다/.test(document.body.textContent));
  ok('직통번호 저장', (await call('getInitData', cc.token)).data.myDirect === '033-555-6666');
  ok('화면 오류 없음', errs.length === 0, errs.join('|'));
  console.log('접수 화면2 통과', pass, '/ 실패', fail); await br.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
