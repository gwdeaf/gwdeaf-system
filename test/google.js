'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'svc';
const { handle, makeContext, Host } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const { identify } = require('../lib/google_auth');
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x || '').slice(0, 300)); } };
const staff = { 'lead@gwdeaf.or.kr': { id: 1, email: 'lead@gwdeaf.or.kr', name: '담당', chapter_id: 5, role: 'lead' }, 'st@gwdeaf.or.kr': { id: 2, email: 'st@gwdeaf.or.kr', name: '직원', chapter_id: 5, role: 'staff' },
  'ed@gwdeaf.or.kr': { id: 3, email: 'ed@gwdeaf.or.kr', name: '교육직원', chapter_id: 5, role: 'staff' }, 'ad@gwdeaf.or.kr': { id: 4, email: 'ad@gwdeaf.or.kr', name: '관리', chapter_id: 1, role: 'admin' },
  'hq@gwdeaf.or.kr': { id: 5, email: 'hq@gwdeaf.or.kr', name: '본부직원', chapter_id: 1, role: 'staff' } };
const grants = { 3: [{ perm: 'view' }], 5: [{ perm: 'view' }] };
const chapters = { 1: { name: '도협회', is_hq: true }, 5: { name: '춘천시지회', is_hq: false } };
global.fetch = async (url, o) => {
  const R = (j, st = 200) => ({ ok: st < 300, status: st, json: async () => j, text: async () => JSON.stringify(j) });
  const h = (o && o.headers) || {};
  if (url.includes('/auth/v1/user')) {
    const t = h.Authorization.replace('Bearer ', '');
    if (t === 'bad') return R({}, 401);
    const email = t === 'gmail' ? 'a@gmail.com' : t === 'nogoogle' ? 'x@gwdeaf.or.kr' : t;
    return R({ identities: t === 'nogoogle' ? [{ provider: 'email', identity_data: { email } }] : [{ provider: 'google', identity_data: { email, email_verified: true } }] });
  }
  if (url.includes('/staff_access')) { const em = decodeURIComponent(/email=ilike\.([^&]+)/.exec(url)[1]); return R(staff[em] ? [staff[em]] : []); }
  if (url.includes('/chapters')) return R([chapters[/id=eq\.(\d+)/.exec(url)[1]]]);
  if (url.includes('/org_profile')) return R(url.includes('chapter_id=eq.5') ? [{ phone: '033-1', center_phone: '033-2', direct_phone: '033-3' }] : []);
  if (url.includes('/staff_grants')) return R(grants[/staff_id=eq\.(\d+)/.exec(url)[1]] || []);
  throw new Error('unexpected ' + url);
};
(async () => {
  const ctx0 = makeContext(new Host()); const db = new MemoryDb(ctx0.__x.SHEETS);
  const E = async t => { try { return await identify(t); } catch (e) { return { err: e.message }; } };
  ok('담당자→지회', (await E('lead@gwdeaf.or.kr')).role === '지회' && (await E('lead@gwdeaf.or.kr')).chapter === '춘천시지회');
  ok('교육권한 직원→지회', (await E('ed@gwdeaf.or.kr')).role === '지회');
  ok('권한 없는 직원 거부', /권한이 없/.test((await E('st@gwdeaf.or.kr')).err));
  ok('관리자→도협회', (await E('ad@gwdeaf.or.kr')).role === '도협회');
  ok('도협회 직원(교육권한)→도협회', (await E('hq@gwdeaf.or.kr')).role === '도협회');
  ok('미등록 거부', /등록되지 않/.test((await E('none@gwdeaf.or.kr')).err));
  ok('타 도메인 거부', /도메인/.test((await E('gmail')).err));
  ok('구글 아닌 로그인 거부', /구글/.test((await E('nogoogle')).err));
  ok('잘못된 토큰 거부', /만료/.test((await E('bad')).err));
  const lp = await E('lead@gwdeaf.or.kr'); ok('기관 정보 전화번호 가져옴', lp.profile && lp.profile.center === '033-2', lp);
  ok('기관 정보 없으면 null', (await E('ad@gwdeaf.or.kr')).profile === null);
  // 로그인 처리
  let r = await handle(db, { fn: 'googleLogin', args: [{ email: 'lead@gwdeaf.or.kr', name: '담당', role: '지회', chapter: '춘천시지회' }] });
  ok('구글 로그인 성공', r.ok && r.data.user.chapter === '춘천시지회' && r.data.user.role === '지회', r);
  ok('회원정보 자동 생성', db.t['회원정보'].length === 1 && db.t['회원정보'][0].아이디 === 'lead@gwdeaf.or.kr');
  const tok = r.data.token;
  r = await handle(db, { fn: 'googleLogin', args: [lp] }); ok('로그인 시 전화번호 반영', r.ok && db.t['회원정보'][0].연락처 === '033-1' && db.t['회원정보'][0].센터연락처 === '033-2', db.t['회원정보'][0]);
  r = await handle(db, { fn: 'getInitData', args: [tok] }); ok('토큰으로 사용', r.ok, r);
  r = await handle(db, { fn: 'googleLogin', args: [{ email: 'lead@gwdeaf.or.kr', name: '새이름', role: '지회', chapter: '원주시지회' }] });
  ok('재로그인 시 지회·이름 갱신', r.ok && r.data.user.chapter === '원주시지회' && db.t['회원정보'].length === 1, r);
  r = await handle(db, { fn: 'login', args: ['lead@gwdeaf.or.kr', 'x'] }); ok('비밀번호 로그인 차단', !r.ok && /구글/.test(r.error), r);
  r = await handle(db, { fn: 'googleLogin', args: [null] }); ok('정보 없이 거부', !r.ok, r);
  console.log('구글 로그인 통과 ' + pass + ' / 실패 ' + fail);
})();
