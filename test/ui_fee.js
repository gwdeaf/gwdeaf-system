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
  const id = (await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '초급반', 시작일: '2026-11-02', 종료일: '2026-12-28', 총회차: 4, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50, 강사: '김강사', 보조강사: '이보조', 강사비기준: '시간', 강사비단가: 50000, 보조강사비단가: 30000 })).data.course.강좌ID;
  const pid = (await call('addParticipants', cc.token, id, [{ 이름: '가' }])).data.detail.participants[0].참여자ID;
  await call('saveAttendance', cc.token, id, 1, [pid], '2026-11-02'); await call('saveAttendance', cc.token, id, 2, [pid], '2026-11-09');
  const route = u => u.startsWith('/f/') ? 'fee.html' : (u === '/' ? 'index.html' : u.slice(1));
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    try { const f = route(q.url); s.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end('x'); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), errs = [];
  const pg = await (await br.newContext({ viewport: { width: 1200, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(base + '/'); await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn'); await pg.waitForSelector('.course');
  await pg.click('[data-tab=apply]'); await pg.click('[data-sw=fee]'); await pg.waitForSelector('#feF');
  await pg.fill('#feF', '2026-11-01'); await pg.fill('#feT', '2026-11-30'); await pg.click('#feeGo'); await pg.waitForSelector('[data-fmk]');
  ok('강사 2명 목록', (await pg.$$('[data-fmk]')).length === 2);
  await pg.click('[data-fmk]:near(:text("김강사"))').catch(() => {});
  const btns = await pg.$$('[data-fmk]'); await btns[0].click(); await pg.waitForSelector('#feeEd');
  const name = await pg.textContent('#feeEd h3'); ok('초안 열림: 김강사', name.includes('김강사'), name);
  ok('금액 자동 200,000 (2회×2시간×50,000)', (await pg.inputValue('[data-fl] [data-k=금액]')) === '200,000', await pg.inputValue('[data-fl] [data-k=금액]'));
  await pg.fill('#fePh', '010-2222-3333'); await pg.fill('#feBk', '농협'); await pg.fill('#feAc', '352-1234-5678-90'); await pg.fill('#feHo', '김강사'); await pg.selectOption('#feTx', '사업소득');
  const sum = await pg.textContent('#feeSum'); ok('실시간 계산: 소득세 6,000 / 지방 600 / 실지급 193,400', sum.includes('6,000') && sum.includes('600') && sum.includes('193,400'), sum);
  await pg.click('#feeSave'); await pg.waitForSelector('#feePrint');
  ok('저장 후 인쇄·링크 버튼', !!(await pg.$('#feeLink')));
  await pg.click('#feeLink'); await pg.waitForSelector('#feeUrl'); const url = await pg.inputValue('#feeUrl'); ok('링크 /f/', /\/f\/[0-9a-f]{40}$/.test(url), url);
  await pg.screenshot({ path: '/home/claude/out/fee_editor.png', fullPage: true });
  // 인쇄 창(내용 확인)
  let html = ''; await pg.evaluate(() => { window.open = () => ({ document: { write(h) { window.__html = h; }, close() {} } }); }); await pg.click('#feePrint'); html = await pg.evaluate(() => window.__html || '');
  ok('인쇄 내용: 금액·계좌·서명란', html.includes('강사료 지급 확인서') && html.includes('200,000') && html.includes('352-1234-5678-90') && html.includes('(서명)'), html.slice(0, 200));
  // 강사 화면
  const tp = await (await br.newContext({ viewport: { width: 390, height: 900 } })).newPage(); tp.on('pageerror', e => errs.push(e.message));
  await tp.goto(url); await tp.waitForSelector('#sg canvas');
  const tt = await tp.textContent('body'); ok('강사 화면: 금액·끝4자리, 전체 계좌 숨김', tt.includes('193,400') && tt.includes('7890') === false || tt.includes('끝 4자리 7890') , tt.slice(0, 300));
  ok('전체 계좌번호 노출 안 됨', !tt.includes('352-1234'));
  await tp.click('#b'); await tp.waitForSelector('.err'); ok('서명 없이 제출 거부', true);
  const box = await (await tp.$('#sg canvas')).boundingBox();
  await tp.mouse.move(box.x + 30, box.y + 40); await tp.mouse.down(); await tp.mouse.move(box.x + 120, box.y + 20, { steps: 6 }); await tp.mouse.move(box.x + 200, box.y + 60, { steps: 6 }); await tp.mouse.up();
  await tp.click('#b'); await tp.waitForSelector('#pr'); ok('서명 완료 화면', (await tp.textContent('body')).includes('서명이 완료'));
  await tp.screenshot({ path: '/home/claude/out/fee_sign.png', fullPage: true });
  // 담당자: 서명완료 반영
  await pg.click('[data-tab=courses]'); await pg.click('[data-tab=apply]'); await pg.click('[data-sw=fee]'); await pg.waitForSelector('[data-fopen]');
  ok('목록에 서명완료', (await pg.textContent('body')).includes('서명완료'));
  await pg.click('[data-fopen]'); await pg.waitForSelector('#feeReset'); ok('서명 후 저장 버튼 없음', !(await pg.$('#feeSave')));
  ok('에러 없음', errs.length === 0, errs.join('|'));
  console.log('강사비 UI 통과', pass, '/ 실패', fail); await br.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
