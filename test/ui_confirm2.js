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
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [{ 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data;
  let r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '반갑다 수어야', 주관: '지회', 시작일: '2026-11-02', 종료일: '2026-11-20', 총회차: 3, 회당시간: 2, 수준: '초급', 교육구분: '외부', 수료기준: 50, 기관명: '한림초', 강사: '홍길동', 인원만입력: 'Y', 확인서필요: 'Y' });
  const id = r.data.course.강좌ID;
  await call('saveHeadcount', cc.token, id, 1, 25, '2026-11-02'); await call('saveHeadcount', cc.token, id, 2, 23, '2026-11-09');
  const tok = (await call('createTeacherLink', cc.token, id)).data.token;
  // 서버 규칙
  r = await call('tSignConfirm', tok, '강사', { png: 'data:image/png;base64,AAAA' }); ok('내용 없이 서명 거부', !r.ok, r);
  r = await call('tSaveConfirm', tok, ['', '', '']); ok('빈 내용 거부', !r.ok, r);
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    const f = q.url.startsWith('/t/') ? 'teacher.html' : (q.url === '/' ? 'index.html' : q.url.slice(1));
    try { s.setHeader('Content-Type', 'text/html; charset=utf-8'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end(); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), ctx = await br.newContext({ viewport: { width: 390, height: 900 } }), pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(base + '/t/' + tok); await pg.waitForSelector('[data-t=cf]');
  await pg.click('[data-t=cf]'); await pg.waitForSelector('[data-c]');
  const draw = async sel => { const el = await pg.$(sel + ' canvas'); await el.scrollIntoViewIfNeeded(); const b = await el.boundingBox(); await pg.mouse.move(b.x + 20, b.y + 30); await pg.mouse.down(); await pg.mouse.move(b.x + 120, b.y + 90, { steps: 6 }); await pg.mouse.move(b.x + 200, b.y + 40, { steps: 6 }); await pg.mouse.up(); };
  await pg.click('[data-sign=강사]'); await pg.waitForSelector('.toast'); ok('내용 저장 전 서명 막힘', (await pg.textContent('.toast')).includes('저장'));
  await pg.fill('[data-c="0"]', '인사 표현'); await pg.fill('[data-c="1"]', '숫자 익히기'); await pg.click('#cfSave'); await pg.waitForSelector('.sigimg', { state: 'detached' }).catch(() => {}); await pg.waitForTimeout(500);
  await pg.click('[data-sign=강사]'); await pg.waitForTimeout(300); ok('빈 서명 거부', (await pg.$$eval('.toast', e => e.map(x => x.textContent).join('|'))).includes('서명란'));
  await draw('#pad-a'); await pg.click('[data-sign=강사]'); await pg.waitForSelector('.sigimg');
  await pg.fill('#cfNm', '김담당'); await pg.fill('#cfOrg', '한림초 교무부장'); await draw('#pad-b'); await pg.click('[data-sign=기관]'); await pg.waitForTimeout(600);
  ok('서명 2개 완료', (await pg.$$('.sigimg')).length === 2 && (await pg.textContent('#body')).includes('확인서가 완성되었습니다'));
  r = await call('tSaveConfirm', tok, ['x', 'y', 'z']); ok('서명 후 수정 거부', !r.ok, r);
  const d = (await call('getConfirm', cc.token, id)).data; ok('서버에 저장됨', d.완료 && d.기관담당자 === '김담당' && d.강사서명.startsWith('data:image/png') && d.내용[0] === '인사 표현', JSON.stringify(d).slice(0, 200));
  const raw = JSON.stringify(db.t['강의확인서']); ok('DB에 서명·성명 암호문', !raw.includes('김담당') && !raw.includes('data:image'), raw.slice(0, 200));
  const cd = (await call('getCourseDetail', cc.token, id)).data.course; ok('수령 자동 표시', cd.확인서수령 === 'Y', cd.확인서수령);
  // 지회 화면
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push(e.message));
  await p2.addInitScript(() => { window.print = () => { window.__printed = document.querySelector('#printArea').innerHTML; }; });
  await p2.goto(base + '/'); await p2.fill('#lid', 'cc'); await p2.fill('#lpw', 'ccpw1234'); await p2.click('#lbtn');
  await p2.waitForSelector('.course'); await p2.click('.course'); await p2.waitForSelector('#cfPrint'); await p2.waitForTimeout(500);
  await p2.waitForTimeout(800); const st = await p2.textContent('#cfState'); ok('상태 표시', st.includes('강사 서명 ✓') && st.includes('김담당'), st);
  await p2.click('#cfPrint'); await p2.waitForTimeout(600);
  const html = await p2.evaluate(() => window.__printed || '');
  ok('인쇄: 표·내용·서명', html.includes('인사 표현') && html.includes('숫자 익히기') && (html.match(/<img/g) || []).length === 2 && html.includes('김담당') && html.includes('cf-sign'), html.slice(0, 200));
  await p2.screenshot({ path: '/tmp/cf_ui.png' });
  await p2.emulateMedia({ media: 'print' }); await p2.pdf({ path: '/tmp/cf2.pdf', format: 'A4', margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' } });
  ok('JS 오류 없음', errs.length === 0, errs.join('|'));
  console.log('확인서2 통과', pass, '/ 실패', fail);
  await br.close(); srv.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
