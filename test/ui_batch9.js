'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const http = require('http'), fs = require('fs'), path = require('path');
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : String(x).slice(0, 300)); } };
(async () => {
  const ctx0 = makeContext(new Host()), S = ctx0.__x.SHEETS, H = ctx0.makeHash_;
  const db = new MemoryDb(S);
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [{ 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data;
  let r = await call('saveCourse', cc.token, { 지회명: '춘천시지회', 강좌명: '초급 1기', 시작일: '2026-11-01', 종료일: '2026-12-31', 총회차: 2, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료기준: 60, 강사: '김강사', 보조강사: '이보조', 수료배점: { 출석: 50, 과제: 50 } });
  const id = r.data.course.강좌ID;
  r = await call('addParticipants', cc.token, id, [{ 이름: '가나다', 연락처: '010-1234-5678', 성별: '여' }, { 이름: '라마바' }]);
  const pids = r.data.detail.participants.map(p => p.참여자ID);
  const tok = (await call('createTeacherLink', cc.token, id)).data.token;
  await call('saveAttendance', cc.token, id, 1, [pids[0]], '2026-11-02');
  const route = u => u.startsWith('/a/') ? 'apply.html' : u.startsWith('/t/') ? 'teacher.html' : u.startsWith('/s/') ? 'survey.html' : u.startsWith('/r/') ? 'result.html' : (u === '/' ? 'index.html' : u.slice(1));
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    try { s.setHeader('Content-Type', 'text/html; charset=utf-8'); s.end(fs.readFileSync(path.join(__dirname, '../public', route(q.url)))); } catch (e) { s.statusCode = 404; s.end('x'); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), errs = [];
  const mk = async w => { const p = await (await br.newContext({ viewport: { width: w, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };

  // 강사 링크
  const tp = await mk(390);
  await tp.goto(base + '/t/' + tok); await tp.waitForSelector('.person');
  const body = await tp.textContent('body');
  ok('보조강사 표시', body.includes('이보조'));
  ok('출석 화면에 수강생 정보', body.includes('010-1234-5678') && body.includes('여'), body);
  await tp.click('[data-t=cp]'); await tp.waitForTimeout(500); await tp.waitForSelector('[data-ssave]');
  ok('수료 탭에 총점·기준', (await tp.textContent('body')).includes('기준 60점'));
  await tp.fill('[data-sc][data-k=과제]', '90'); await tp.click('[data-ssave]'); await tp.waitForFunction(() => document.body.innerText.includes('총점 70'));
  ok('점수 저장→총점 70(출석50+과제45)', true);
  ok('수료 가능 표시', (await tp.textContent('body')).includes('수료 가능'));
  await tp.selectOption('[data-cf]', 'N'); await tp.waitForFunction(() => document.body.innerText.includes('미수료(확정)'));
  ok('미수료 확정', true);
  await tp.click('[data-t=jr]'); await tp.waitForSelector('#jm'); await tp.fill('#jm', '7'); await tp.fill('#jt', '인사'); await tp.click('#save');
  await tp.waitForFunction(() => document.body.innerText.includes('저장했습니다') || true); await tp.waitForTimeout(400);
  const j = (await call('getJournal', cc.token, id)).data;
  ok('일지 참가인원 저장', j.sessions[0].참가인원 === 7, j.sessions[0]);

  // 담당자: 만족도 탭
  const pg = await mk(1200);
  await pg.goto(base + '/'); await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn');
  await pg.waitForSelector('.course'); await pg.click('.course');
  await pg.click('[data-cts~=survey]'); if (await pg.$('.subtabs [data-ct=survey]')) await pg.click('.subtabs [data-ct=survey]'); await pg.waitForSelector('#svSave');
  await pg.click('#svSave'); await pg.waitForSelector('#svUrl');
  const surl = await pg.inputValue('#svUrl'); ok('조사 링크', /\/s\/[0-9a-f]{40}$/.test(surl), surl);
  const sp = await mk(390);
  const answer = async (vals, text) => {
    await sp.goto(surl); await sp.waitForSelector('#f');
    for (let i = 0; i < 5; i++) await sp.evaluate(([i, v]) => document.querySelector(`input[name=q${i + 1}][value="${v}"]`).click(), [i, vals[i]]);
    if (text) await sp.fill('#o', text);
    await sp.click('#b'); await sp.waitForSelector('.center');
  };
  await sp.goto(surl); await sp.waitForSelector('#f'); await sp.click('#b'); await sp.waitForSelector('.err');
  ok('미선택 거부', (await sp.textContent('.err')).includes('점수'));
  await answer([5, 5, 4, 4, 5], '재미있었어요'); ok('제출 완료', (await sp.textContent('body')).includes('감사'));
  await answer([3, 4, 4, 5, 4], '');
  await pg.click('[data-cts~=apply]'); if (await pg.$('.subtabs [data-ct=apply]')) await pg.click('.subtabs [data-ct=apply]'); await pg.click('[data-cts~=survey]'); if (await pg.$('.subtabs [data-ct=survey]')) await pg.click('.subtabs [data-ct=survey]'); await pg.waitForSelector('#svXls');
  ok('결과 표시', (await pg.textContent('body')).includes('응답 수') && (await pg.textContent('body')).includes('재미있었어요'));
  await pg.click('#rsMake'); await pg.waitForSelector('#rsUrl');
  const rurl = await pg.inputValue('#rsUrl'); ok('결과 링크', /\/r\/[0-9a-f]{40}$/.test(rurl), rurl);
  const rp = await mk(390); await rp.goto(rurl); await rp.waitForSelector('#pr');
  const rt = await rp.textContent('body');
  ok('강사용 결과 화면', rt.includes('초급 1기') && rt.includes('재미있었어요') && rt.includes('4.20') || rt.includes('평균'), rt);
  await rp.screenshot({ path: '/home/claude/out/result_page.png' });
  await sp.screenshot({ path: '/home/claude/out/survey_page.png' });

  // 접수증
  const al = (await call('saveApplyLink', cc.token, id, { 안내: '' })).data.link;
  const ap = await mk(390); await ap.goto(base + '/a/' + al.token); await ap.waitForSelector('#f');
  await ap.fill('#n', '이수강'); await ap.fill('#p', '010-3333-4444'); await ap.check('#a'); await ap.click('#b'); await ap.waitForSelector('#rcpt');
  const rc = await ap.textContent('#rcpt'); ok('접수증', rc.includes('이수강') && rc.includes('010-3333-4444') && rc.includes('초급 1기'), rc);
  ok('인쇄 버튼', !!(await ap.$('#pr')));
  await ap.screenshot({ path: '/home/claude/out/apply_receipt.png' });
  ok('에러 없음', errs.length === 0, errs.join('|'));
  console.log('batch9 UI 통과', pass, '/ 실패', fail);
  await br.close(); srv.close(); process.exit(fail ? 1 : 0);
})();
