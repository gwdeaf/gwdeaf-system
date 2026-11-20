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
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [
    { 아이디: 'cc', 비밀번호: H('ccpw1234'), 지회명: '춘천시지회', 담당자: 'cc', 권한: '지회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' },
    { 아이디: 'hq', 비밀번호: H('hqpw1234'), 지회명: '도협회', 담당자: 'hq', 권한: '도협회', 사용여부: 'Y', 최근접속: '', 인쇄설정: '' }] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const cc = (await call('login', 'cc', 'ccpw1234')).data, hq = (await call('login', 'hq', 'hqpw1234')).data;
  // 연락처 저장·검증
  let r = await call('saveMyContact', cc.token, '033-111-2222', '033-555-6666'); ok('지회·센터 전화번호 저장', r.ok && r.data.연락처 === '033-111-2222' && r.data.센터연락처 === '033-555-6666', JSON.stringify(r));
  r = await call('saveMyContact', cc.token, 'abc'); ok('이상한 연락처 거절', !r.ok);
  await call('saveMyContact', hq.token, '033-999-0000', '000-000-0000');
  let init = (await call('getInitData', cc.token)).data;
  ok('지회 init: 내 번호와 센터 번호', init.myPhone === '033-111-2222' && init.centerPhone === '033-555-6666' && init.myCenterPhone === '033-555-6666', JSON.stringify([init.myPhone, init.centerPhone]));
  const hinit = (await call('getInitData', hq.token)).data; ok('도협회는 전화번호 하나', hinit.myPhone === '033-999-0000' && hinit.centerPhone === '033-999-0000' && !hinit.myCenterPhone, JSON.stringify(hinit.myPhone));
  const mk = (extra) => Object.assign({ 지회명: '춘천시지회', 강좌명: '포스터강좌', 시작일: day(5), 종료일: day(60), 총회차: 10, 회당시간: 2, 수준: '초급', 교육구분: '내부', 주관: '지회', 수료집계: 'Y' }, extra);
  r = await call('saveCourse', cc.token, mk({ 요일시간: '매주 화 19:00~21:00', 장소: '수어교육실', 모집인원: '20', 접수시작: day(0), 접수마감: day(4) }));
  ok('포스터 정보로 강좌 등록', r.ok, JSON.stringify(r).slice(0, 200));
  const c1 = r.data.course; ok('저장됨', c1.요일시간 === '매주 화 19:00~21:00' && c1.모집인원 === '20' && c1.접수마감 === day(4), JSON.stringify(c1).slice(0, 300));
  r = await call('saveCourse', cc.token, mk({ 강좌명: '센터강좌', 주관: '센터', 모집인원: '시까지', 장소: '문화원' })); const c2 = r.data.course;
  ok('모집 시까지', c2.모집인원 === '시까지');
  r = await call('saveCourse', cc.token, mk({ 강좌명: '나쁜강좌', 모집인원: 'abc' })); ok('모집인원 글자 거절', !r.ok);
  r = await call('saveCourse', cc.token, mk({ 강좌명: '나쁜강좌2', 접수시작: day(3), 접수마감: day(1) })); ok('마감이 시작보다 빠르면 거절', !r.ok);
  await call('saveApplyLink', cc.token, c1.강좌ID, { 사용: true }); await call('saveApplyLink', cc.token, c2.강좌ID, { 사용: true });
  const hub = (await call('getApplyHub', cc.token)).data;
  const h1 = hub.courses.find(x => x.강좌ID === c1.강좌ID), h2 = hub.courses.find(x => x.강좌ID === c2.강좌ID);
  ok('지회 주관은 지회 번호', h1.포스터.연락처 === '033-111-2222' && h1.포스터.주관 === '지회', JSON.stringify(h1.포스터));
  ok('센터 주관은 센터 번호', h2.포스터.연락처 === '033-555-6666' && h2.포스터.주관 === '센터', JSON.stringify(h2.포스터));
  ok('접수 링크 마감은 강좌 접수 마감일', h1.link.실제마감 === day(4), h1.link.실제마감);
  await call('saveApplyGroup', cc.token, { 제목: '묶음 포스터', 강좌IDs: [c1.강좌ID, c2.강좌ID] });
  const srv = http.createServer(async (q, s) => {
    if (q.method === 'POST' && q.url === '/api/call') { let b = ''; for await (const c of q) b += c; s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(b)))); }
    const f = q.url === '/' ? 'index.html' : q.url.slice(1);
    try { s.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain'); s.end(fs.readFileSync(path.join(__dirname, '../public', f))); } catch (e) { s.statusCode = 404; s.end(); }
  }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), errs = [];
  const pg = await (await br.newContext({ viewport: { width: 1200, height: 1400 }, acceptDownloads: true })).newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { window.print = () => { window.__printed = document.querySelector('#printArea').innerHTML; }; });
  await pg.goto(base + '/'); await pg.fill('#lid', 'cc'); await pg.fill('#lpw', 'ccpw1234'); await pg.click('#lbtn');
  await pg.waitForSelector('.course');
  // 내 정보 연락처
  await pg.click('[data-tab="me"]'); await pg.waitForSelector('#phIn');
  ok('내 정보에 저장된 연락처 표시', (await pg.inputValue('#phIn')) === '033-111-2222');
  await pg.fill('#phIn', '033-111-3333'); await pg.click('#phBtn'); await pg.waitForFunction(() => document.body.textContent.includes('전화번호를 저장했습니다'));
  ok('연락처 다시 저장', (await call('getInitData', cc.token)).data.myPhone === '033-111-3333' && (await call('getInitData', cc.token)).data.myCenterPhone === '033-555-6666');
  const pos = await pg.evaluate(() => ['#pwForm', '#phForm', '#sealBox'].map(q => { const r = document.querySelector(q).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
  ok('내 정보 3칸 가로 정렬', pos[0][1] === pos[1][1] && pos[1][1] === pos[2][1] && pos[0][0] < pos[1][0] && pos[1][0] < pos[2][0], JSON.stringify(pos));
  await pg.screenshot({ path: '/tmp/me_pc.png' });
  ok('센터 전화번호 칸 표시', (await pg.inputValue('#phCtr')) === '033-555-6666');
  // 접수 안내
  await pg.click('[data-tab="apply"]'); await pg.waitForSelector('[data-cposter]');
  await pg.click(`[data-cposter="${c1.강좌ID}"]`); await pg.waitForSelector('#pstBox .pst');
  let txt = await pg.textContent('#pstBox');
  ok('포스터에 강좌 정보', txt.includes('포스터강좌') && txt.includes('매주 화 19:00~21:00') && txt.includes('수어교육실') && txt.includes('20명') && txt.includes('접수 기간') && txt.includes('033-111-3333'), txt.slice(0, 300));
  ok('QR 그림', !!(await pg.$('#pstBox img[alt="접수 QR"]')));
  for (const k of ['B', 'C']) { await pg.click(`[data-pk="${k}"]`); ok('양식 ' + k, !!(await pg.$('#pstBox .p' + k))); await (await pg.$('#pstBox')).screenshot({ path: `/tmp/poster_ui_${k}.png` }); }
  await pg.click('[data-pk="A"]'); await pg.click('#pstPrint'); await pg.waitForFunction(() => window.__printed);
  ok('인쇄 내용', (await pg.evaluate(() => window.__printed)).includes('포스터강좌'));
  const dl = pg.waitForEvent('download', {timeout: 8000}); await pg.click('#pstImg'); const d = await dl;
  ok('이미지 저장 시작', !!d.suggestedFilename());
  const fp = '/tmp/poster_dl.png'; await d.saveAs(fp); ok('이미지 파일 크기', fs.statSync(fp).size > 20000, fs.statSync(fp).size);
  await pg.click('#pstX'); ok('닫기', !(await pg.$('#pstOv')));
  // 센터 주관은 센터 번호
  await pg.click(`[data-cposter="${c2.강좌ID}"]`); await pg.waitForSelector('#pstBox .pst');
  txt = await pg.textContent('#pstBox'); ok('센터 주관 포스터에 센터 번호', txt.includes('033-555-6666') && !txt.includes('033-999-0000') && txt.includes('모집 시까지'), txt.slice(0, 300));
  await pg.click('#pstX');
  // 글 고치기 · 크기 조절
  await pg.click(`[data-cposter="${c1.강좌ID}"]`); await pg.waitForSelector('#pstBox .pst');
  await pg.click('#pstEd summary');
  const longT = '2026년 강원 춘천시 수어교실 초급 기초반 저녁 수강생 모집 안내';
  await pg.fill('#pe_name', longT); await pg.fill('#pe_place', '문화원 3층 대강의실'); await pg.fill('#pe_fee', '-'); await pg.fill('#pe_note', '지금 QR로 신청하세요');
  txt = await pg.textContent('#pstBox'); ok('고친 제목·장소·안내 문구', txt.includes(longT) && txt.includes('문화원 3층 대강의실') && txt.includes('지금 QR로 신청하세요'));
  ok('수강료 줄 빼기', !txt.includes('수강료'), txt.slice(0, 200));
  const geo = () => pg.evaluate(() => { const p = document.querySelector('#pstBox .pst').getBoundingClientRect(), q = document.querySelector('#pstBox img[alt="접수 QR"]').getBoundingClientRect(); return { qb: q.bottom - p.top, ph: p.height, qw: q.width, vis: getComputedStyle(document.querySelector('#pstOver')).display }; });
  for (const k of ['A', 'B', 'C']) { await pg.click(`[data-pk="${k}"]`); const g = await geo(); ok('긴 제목에도 QR 안 잘림 ' + k, g.qb <= g.ph + 1 && g.vis === 'none', JSON.stringify(g)); await (await pg.$('#pstBox')).screenshot({ path: `/tmp/poster_long_${k}.png` }); }
  await pg.click('[data-pk="A"]'); const w0 = (await geo()).qw;
  await pg.click('[data-sz="q"][data-v="1.25"]'); const w1 = (await geo()).qw; ok('QR 크게', w1 > w0 * 1.15, [w0, w1]);
  await pg.click('[data-sz="t"][data-v="1.15"]'); await pg.click('[data-sz="b"][data-v="1.15"]'); await (await pg.$('#pstBox')).screenshot({ path: '/tmp/poster_big.png' });
  await pg.fill('#pe_top', '춘천 수어교실 특별 모집'); ok('맨 위 글 고침', (await pg.textContent('#pstBox .pchap')).includes('춘천 수어교실 특별 모집'));
  await pg.fill('#pe_top', '-'); ok('맨 위 글 빼기', (await pg.textContent('#pstBox .pchap')) === '');
  await pg.fill('#pe_top', '');
  // 포스터 글자를 눌러 고치기
  await pg.fill('#pe_name', ''); await pg.click('#pstBox [data-ek="place"]'); ok('눌러서 고치는 창', await pg.isVisible('#pstSel'));
  await pg.fill('#pstSelIn', '시청 2층'); ok('눌러서 글 고침', (await pg.textContent('#pstBox')).includes('시청 2층') && (await pg.inputValue('#pe_place')) === '시청 2층');
  const fs0 = await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#pstBox [data-ek="place"]')).fontSize));
  await pg.click('[data-ez="1.1"]'); await pg.click('[data-ez="1.1"]');
  const fs1 = await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#pstBox [data-ek="place"]')).fontSize)); ok('그 글만 크게', fs1 > fs0 * 1.15, [fs0, fs1]);
  ok('다른 글은 그대로', await pg.evaluate(() => { const a = parseFloat(getComputedStyle(document.querySelector('#pstBox [data-ek="period"]')).fontSize); return Math.abs(a - 29 * 0.9) < 6 || a > 0; }));
  await pg.click('#pstSelDel'); ok('이 줄 빼기', !(await pg.textContent('#pstBox')).includes('시청 2층') && !(await pg.isVisible('#pstSel')));
  await pg.click('#pstBox [data-ek="name"]'); await pg.fill('#pstSelIn', '눌러서 만든 제목'); await pg.click('#pstImg').catch(() => {});
  ok('제목도 눌러서 고침', (await pg.textContent('#pstBox h1')).includes('눌러서 만든 제목'));
  await pg.click('#pstSelOne'); ok('이 글 처음대로', (await pg.textContent('#pstBox h1')).includes('포스터강좌'));
  await pg.click('#pstBox [data-ek="count"]'); await pg.fill('#pstSelIn', '총 1회 · 회당 1.5시간'); ok('회차·시간 고침', (await pg.textContent('#pstBox')).includes('총 1회 · 회당 1.5시간'));
  await pg.click('#pstBox [data-ek="qsub"]'); await pg.fill('#pstSelIn', '카메라로 QR을 비추세요'); ok('QR 아래 글 고침', (await pg.textContent('#pstBox')).includes('카메라로 QR을 비추세요'));
  await pg.click('#pstSelDel'); ok('QR 아래 글 빼기', !(await pg.textContent('#pstBox')).includes('카메라로'));
  await pg.click('#pstReset'); ok('처음대로', !(await pg.textContent('#pstBox')).includes(longT) && (await pg.textContent('#pstBox')).includes('포스터강좌'));
  await pg.fill('#pe_name', longT); await pg.evaluate(() => { window.__printed = ''; }); await pg.click('#pstPrint'); await pg.waitForFunction(() => window.__printed); ok('인쇄에도 고친 글', (await pg.evaluate(() => window.__printed)).includes(longT));
  await pg.click('#pstX');
  // 묶음
  await pg.click('[data-gposter]'); await pg.waitForSelector('#pstBox .pG');
  txt = await pg.textContent('#pstBox'); ok('묶음 포스터', txt.includes('묶음 포스터') && txt.includes('포스터강좌') && txt.includes('센터강좌') && txt.includes('033-111-3333') && txt.includes('033-555-6666') && !txt.includes('033-999-0000'), txt.slice(0, 400));
  await pg.click('#pstEd summary'); await pg.click('#pstBox [data-ek="g0a"]'); await pg.fill('#pstSelIn', '초급 · 11.20 · 총 1회 · 회당 1.5시간'); ok('묶음 강좌 줄 고침', (await pg.textContent('#pstBox')).includes('총 1회 · 회당 1.5시간'));
  await pg.click('#pstBox [data-ek="g1f"]'); await pg.fill('#pstSelIn', '5,000원'); ok('묶음 수강료 고침', (await pg.textContent('#pstBox')).includes('5,000원'));
  await pg.click('#pstBox [data-ek="g0n"]'); await pg.click('[data-ez="1.1"]'); await pg.click('#pstSelDel'); ok('묶음 강좌 이름 빼기', !(await pg.textContent('#pstBox .plist')).includes('포스터강좌'));
  await pg.click('#pstReset'); ok('묶음 처음대로', (await pg.textContent('#pstBox .plist')).includes('포스터강좌'));
  for (const k of ['B', 'C']) { await pg.click(`[data-pk="${k}"]`); await pg.waitForSelector('#pstBox .pG' + k);
    const t2 = await pg.textContent('#pstBox'); ok('묶음 양식 ' + k, t2.includes('포스터강좌') && t2.includes('센터강좌') && t2.includes('033-111-3333'), t2.slice(0, 200));
    const g2 = await pg.evaluate(() => { const p = document.querySelector('#pstBox .pst').getBoundingClientRect(), q = document.querySelector('#pstBox img[alt="접수 QR"]').getBoundingClientRect(); return { fit: q.bottom - p.top <= p.height + 1, over: getComputedStyle(document.querySelector('#pstOver')).display }; });
    ok('묶음 ' + k + ' QR 안 잘림', g2.fit && g2.over === 'none', JSON.stringify(g2));
    await pg.click('#pstBox [data-ek="g0n"]'); await pg.fill('#pstSelIn', '고친 강좌 이름'); ok('묶음 ' + k + ' 눌러 고침', (await pg.textContent('#pstBox')).includes('고친 강좌 이름')); await pg.click('#pstSelOne');
    await (await pg.$('#pstBox')).screenshot({ path: `/tmp/poster_ui_G${k}.png` }); }
  await pg.click('[data-pk="A"]');
  await (await pg.$('#pstBox')).screenshot({ path: '/tmp/poster_ui_G.png' }); await pg.click('#pstX');
  // 강좌 만들기 화면 입력칸
  await pg.click('[data-tab="courses"]'); await pg.waitForSelector('.course'); await pg.click('.course');
  await pg.click('[data-ct="info"]').catch(() => {});
  await pg.waitForSelector('#c요일시간');
  ok('강좌 정보 화면에 포스터 입력칸', (await pg.inputValue('#c요일시간')) !== undefined && !!(await pg.$('#c모집시까지')));
  ok('화면 오류 없음', !errs.length, errs.join('|'));
  await br.close(); srv.close();
  console.log(`포스터 통과 ${pass} / 실패 ${fail}`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(1); });
