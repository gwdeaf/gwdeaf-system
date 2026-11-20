'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const http = require('http'), fs = require('fs'), path = require('path');
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : String(x).slice(0, 400)); } };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [{ 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data;
  let r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '초급 1기', 시작일: '2026-11-01', 종료일: '2026-12-31', 총회차: 2, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50, 강사: '김강사', 보조강사: '이보조', 강사비기준: '시간', 강사비단가: '50,000', 보조강사비단가: 30000 });
  const id = r.data.course.강좌ID;
  r = await call('addParticipants', cc.token, id, [{ 이름: '가나다' }, { 이름: '라마바' }]);
  const pids = r.data.detail.participants.map(p => p.참여자ID);
  await call('saveAttendance', cc.token, id, 1, pids, '2026-11-02'); await call('saveAttendance', cc.token, id, 2, pids, '2026-11-09');
  r = await call('saveSeal', cc.token, '지회', PNG); ok('직인 저장', r.ok, r);
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    try { s.setHeader('Content-Type', 'text/html; charset=utf-8'); s.end(fs.readFileSync(path.join(__dirname, '../public', q.url === '/' ? 'index.html' : q.url.slice(1)))); } catch (e) { s.statusCode = 404; s.end('x'); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), errs = [];
  const pg = await (await br.newContext({ viewport: { width: 1200, height: 1000 } })).newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(base + '/'); await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn');
  await pg.waitForSelector('.course');
  // 강좌 등록 양식: 배점·강사비 칸
  await pg.click('#newCourse'); await pg.waitForSelector('#c강사비기준', { state: 'attached' });
  ok('양식에 보조강사·배점·강사비', !!(await pg.$('#c보조강사')) && !!(await pg.$('#c배점사용')) && !!(await pg.$('#c강사비단가')));
  await pg.screenshot({ path: '/home/claude/out/course_form.png', fullPage: true });
  await pg.goBack().catch(() => {}); await pg.goto(base + '/'); await pg.waitForSelector('.course', { timeout: 8000 }).catch(async () => { await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn'); await pg.waitForSelector('.course'); });
  await pg.click('.course');
  await pg.click('[data-cts~=info]'); if (await pg.$('.subtabs [data-ct=info]')) await pg.click('.subtabs [data-ct=info]'); await pg.waitForSelector('#c강사비기준', { state: 'attached' });
  ok('강좌 정보에서 강사비 계산 박스는 빠지고 안내만', !(await pg.$('#feeBox')) && (await pg.textContent('#cTabBody')).includes('강사비</b> 탭') || (await pg.textContent('#cTabBody')).includes('강사비 탭'));
  // 수료증: 번호 수기, 직인
  await pg.click('[data-cts~=cert]'); if (await pg.$('.subtabs [data-ct=cert]')) await pg.click('.subtabs [data-ct=cert]'); await pg.waitForSelector('[data-no]');
  const ins = await pg.$$('[data-no]'); ok('번호 입력칸 2개', ins.length === 2);
  await ins[0].fill('8'); await ins[1].fill('7');
  ok('직인 선택 있음', (await pg.textContent('body')).includes('직인'));
  await pg.screenshot({ path: '/home/claude/out/cert_tab.png', fullPage: true });
  await pg.evaluate(() => { window.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} }); }); await pg.click('#ctIssue');
  await pg.waitForTimeout(800);
  const L = (await call('listCerts', cc.token)).data;
  const nos = L.map(x => x.번호);
  ok('수기 번호 8,7 → 대장 순서 7,8', nos.length === 2 && String(nos[0]).endsWith('7') && String(nos[1]).endsWith('8'), nos);
  // 내 정보: 직인
  await pg.goto(base + '/'); await pg.waitForSelector('.course').catch(() => {});
  ok('에러 없음', errs.length === 0, errs.join('|'));
  console.log('batch9b UI 통과', pass, '/ 실패', fail);
  await br.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
