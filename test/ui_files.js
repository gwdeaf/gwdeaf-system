'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const http = require('http'), fs = require('fs'), path = require('path');
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const storage = require('../lib/storage');
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : String(x).slice(0, 300)); } };
(async () => {
  const c0 = makeContext(new Host()), S = c0.__x.SHEETS, H = c0.makeHash_;
  const db = new MemoryDb(S);
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: H(pw), 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y', 최근접속: '', 인쇄설정: '' });
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('admin', 'adminpw1', '도협회', '도협회'), mem('cc', 'ccpw1234', '춘천시지회', '지회'), mem('wj', 'wjpw1234', '원주시지회', '지회')] }]);
  const blobs = new Map(); let base = '';
  storage.set({
    async signUpload(p) { return { url: base + '/__up/' + p, apikey: 'anon-key' }; },
    async signDownload(p, n) { if (!blobs.has(p)) throw new Error('없음'); return base + '/__dl/' + p + '?download=' + encodeURIComponent(n); },
    async remove(ps) { ps.forEach(p => blobs.delete(p)); }
  });
  const hdrs = [];
  const srv = http.createServer(async (q, s) => {
    const chunks = []; for await (const c of q) chunks.push(c); const buf = Buffer.concat(chunks);
    if (q.method === 'OPTIONS') { s.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); return s.end(); }
    if (q.method === 'PUT' && q.url.startsWith('/__up/')) { hdrs.push(q.headers.apikey); blobs.set(q.url.slice(6), buf); s.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); return s.end('{}'); }
    if (q.url.startsWith('/__dl/')) { const p = decodeURIComponent(q.url.slice(6).split('?')[0]); s.writeHead(200, { 'Content-Disposition': 'attachment; filename="x.bin"', 'Content-Type': 'application/octet-stream' }); return s.end(blobs.get(p) || ''); }
    if (q.method === 'POST' && q.url === '/api/call') { s.setHeader('Content-Type', 'application/json'); return s.end(JSON.stringify(await handle(db, JSON.parse(buf.toString())))); }
    if (q.url === '/qrcode.js') { s.setHeader('Content-Type', 'text/javascript'); return s.end(fs.readFileSync(path.join(__dirname, '../public/qrcode.js'))); }
    s.setHeader('Content-Type', 'text/html; charset=utf-8'); s.end(fs.readFileSync(path.join(__dirname, '../public/index.html')));
  }).listen(0);
  base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch(), errs = [];
  const open = async (id, pw) => { const ctx = await br.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true }), pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.goto(base + '/'); await pg.fill('#lid', id); await pg.fill('#lpw', pw); await pg.click('#lbtn'); await pg.waitForSelector('#tabs:not(.hidden)'); return pg; };
  const ad = await open('admin', 'adminpw1');
  await ad.click('[data-tab=files]'); await ad.waitForSelector('#rqNew'); await ad.click('#rqNew');
  await ad.fill('#rqT', '현황 조사'); await ad.fill('#rqD', '엑셀로 작성'); await ad.fill('#rqL', '2026-12-01');
  ok('파일 전에는 요청 만들기 비활성', await ad.isDisabled('#rqSave'));
  await ad.setInputFiles('#rqFiles', { name: '양식.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('FORM-DATA') });
  ok('파일 올리면 활성', !(await ad.isDisabled('#rqSave')));
  await ad.click('#rqSave'); await ad.waitForSelector('[data-dl]');
  ok('양식 올라감', [...blobs.values()].some(b => b.toString().includes('FORM-DATA')));
  ok('anon 키 헤더 전달', hdrs.every(h => h === 'anon-key') && hdrs.length === 1, hdrs);
  const cc = await open('cc', 'ccpw1234');
  ok('지회 탭에 미제출 수', (await cc.textContent('#filesTab')).includes('(1)'), await cc.textContent('#filesTab'));
  await cc.click('[data-tab=files]'); await cc.waitForSelector('[data-rq]'); await cc.click('[data-rq]'); await cc.waitForSelector('#replyUp', { state: 'attached' });
  const [dl] = await Promise.all([cc.waitForEvent('download'), cc.click('[data-dl]')]); ok('양식 내려받기', true);
  ok('파일 없으면 제출 버튼 비활성', await cc.isDisabled('#rpSubmit'));
  await cc.setInputFiles('#replyUp', { name: '춘천.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('REPLY-CC') }); await cc.waitForSelector('[data-fdel]');
  await cc.fill('#rpMemo', '확인 바랍니다'); await cc.click('#rpSubmit'); await cc.waitForSelector('#rpUndo');
  const wj = await open('wj', 'wjpw1234'); await wj.click('[data-tab=files]'); await wj.waitForSelector('[data-rq]'); await wj.click('[data-rq]'); await wj.waitForSelector('#replyUp', { state: 'attached' });
  ok('다른 지회에는 회신 파일 안 보임', (await wj.$$('[data-fdel]')).length === 0 && !(await wj.textContent('body')).includes('춘천.xlsx'));
  await ad.click('#rqBack'); await ad.waitForSelector('[data-rq]');
  ok('도협회 목록: 제출 1/2, 미제출 원주', (await ad.textContent('[data-rq]')).includes('제출 1/2') && (await ad.textContent('[data-rq]')).includes('미제출: 원주시지회'), await ad.textContent('[data-rq]'));
  await ad.click('[data-rq]'); await ad.waitForSelector('[data-confirm]');
  ok('도협회가 메모·파일 봄', (await ad.textContent('tbody')).includes('확인 바랍니다') && (await ad.textContent('tbody')).includes('춘천.xlsx'));
  await ad.click('[data-confirm]'); await ad.click('#dlgOk'); await ad.waitForSelector('[data-confirm]', { state: 'detached' });
  ok('확인 후 삭제: 저장소에서 사라짐', ![...blobs.values()].some(b => b.toString().includes('REPLY-CC')) && [...blobs.values()].some(b => b.toString().includes('FORM-DATA')), [...blobs.values()].map(String));
  ok('도협회 화면 삭제 표시', (await ad.textContent('tbody')).includes('확인 후 파일 삭제됨'));
  await cc.click('#rqBack'); await cc.click('[data-rq]'); await cc.waitForSelector('.notice.info');
  ok('지회에 확인 완료 안내', (await cc.textContent('.notice.info')).includes('삭제되었습니다'));
  ok('JS 오류 없음', errs.length === 0, errs.join('|'));
  console.log('자료요청 화면 통과', pass, '/ 실패', fail);
  await br.close(); srv.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
