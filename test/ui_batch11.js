'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const http = require('http'), fs = require('fs'), path = require('path');
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { chromium } = require('playwright');
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : String(x).slice(0, 300)); } };
const SIG = 'data:image/png;base64,' + 'A'.repeat(900);
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_, db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [{ 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data;
  const id = (await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '초급반', 시작일: '2026-11-02', 종료일: '2026-12-28', 총회차: 4, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 50, 강사: '김강사', 강사비기준: '시간', 강사비단가: 40000 })).data.course.강좌ID;
  const pid = (await call('addParticipants', cc.token, id, [{ 이름: '가' }])).data.detail.participants[0].참여자ID;
  await call('saveAttendance', cc.token, id, 1, [pid], '2026-11-02');
  const draft = (await call('getFeeDraft', cc.token, '김강사', '2026-11-01', '2026-12-31')).data;
  const cert = (await call('saveFeeCert', cc.token, { 강사명: '김강사', 연락처: '01011112222', 은행: '국민', 계좌번호: '123-456-789012', 예금주: '김강사', 기간시작: '2026-11-01', 기간종료: '2026-12-31', 항목: draft.항목, 원천세: '사업소득' })).data;
  const ftok = (await call('createFeeLink', cc.token, cert.확인증ID)).data.토큰;
  await call('feeSign', ftok, SIG);
  const route = u => u.startsWith('/f/') ? 'fee.html' : u.startsWith('/s/') ? 'survey.html' : (u === '/' ? 'index.html' : u.slice(1));
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    try { const f = route(q.url); s.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end('x'); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), errs = [];
  // 모바일 강사 화면
  const mp = await (await br.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true })).newPage(); mp.on('pageerror', e => errs.push(e.message));
  await mp.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await mp.goto(base + '/f/' + ftok); await mp.waitForSelector('#pr');
  ok('일시 = 교육기간 표시', (await mp.textContent('body')).includes('2026-11-02 ~ 2026-12-28'));
  await mp.tap('#pr'); ok('인쇄 버튼 동작', (await mp.evaluate(() => window.__printed)) === 1);
  await mp.tap('#pic'); await mp.waitForSelector('#pv img');
  const src = await mp.getAttribute('#pv img', 'src'); ok('사진으로 저장: PNG 이미지 생성', /^data:image\/png;base64,/.test(src) && src.length > 5000, src.length);
  ok('이미지 파일로 받기 버튼', !!(await mp.$('#dl')));
  // 관리자: 만족도 문항 편집
  const pg = await (await br.newContext({ viewport: { width: 1200, height: 1000 } })).newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto(base + '/'); await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn'); await pg.waitForSelector('.course'); await pg.click('.course');
  await pg.click('[data-cts~=survey]'); await pg.click('.subtabs [data-ct=survey]'); await pg.waitForSelector('#sqSave');
  ok('기본 5문항이 화면에 보임', (await pg.$$('[data-sqt]')).length === 5 && (await pg.inputValue('[data-sqt]')).includes('도움'));
  ok('변경 전 저장 버튼 비활성', await pg.isDisabled('#sqSave'));
  await pg.click('#sqAdd'); await pg.fill('[data-sq="5"] [data-sqt]', '바라는 점을 적어 주세요'); await pg.selectOption('[data-sq="5"] [data-squ]', '글');
  ok('수정하면 저장 활성', !(await pg.isDisabled('#sqSave')));
  await pg.click('[data-sq="4"] [data-sqdel]'); ok('삭제하면 5개', (await pg.$$('[data-sqt]')).length === 5);
  await pg.click('#sqSave'); await pg.waitForFunction(() => document.querySelector('#svQPanel h3') && document.querySelector('#svQPanel h3').textContent.includes('(5개)') && document.querySelector('#sqSave').disabled);
  const t = await call('getSurvey', cc.token, id); ok('서버에 저장됨', t.data.문항.length === 5 && t.data.문항[4].유형 === '글');
  await pg.click('#svSave'); await pg.waitForSelector('#svUrl'); const url = await pg.inputValue('#svUrl');
  const sp = await (await br.newContext({ viewport: { width: 390, height: 800 } })).newPage(); sp.on('pageerror', e => errs.push(e.message));
  await sp.goto(url); await sp.waitForSelector('textarea#q5');
  ok('수강생 화면: 점수 4문항 + 글 1문항', (await sp.$$('.scale')).length === 4 && (await sp.textContent('body')).includes('바라는 점을 적어 주세요'));
  for (let i = 1; i <= 4; i++) await sp.check(`input[name=q${i}][value="5"]`, { force: true });
  await sp.fill('#q5', '회화 시간 늘려주세요'); await sp.click('#b'); await sp.waitForSelector('text=참여해 주셔서');
  ok('제출 완료', true);
  const res = (await call('getSurvey', cc.token, id)).data.결과; ok('글 답변 저장', res.응답수 === 1 && res.문항[4].답변[0] === '회화 시간 늘려주세요');
  await pg.click('[data-cts~=info]'); await pg.waitForSelector('#c강사비기준', { state: 'attached' }); await pg.click('[data-cts~=survey]'); await pg.click('.subtabs [data-ct=survey]'); await pg.waitForSelector('#sqSave');
  ok('응답 후 추가 버튼 잠김', await pg.isDisabled('#sqAdd'));
  ok('화면 오류 없음', errs.length === 0, errs.join('|'));
  console.log('batch11 UI 통과', pass, '/ 실패', fail); await br.close(); srv.close();
})().catch(e => { console.log(e); process.exit(1); });
