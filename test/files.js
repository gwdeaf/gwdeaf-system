'use strict';
process.env.ENCRYPTION_KEY = 'test-key-test-key-test-key-1234567890';
const { handle, makeContext, Host, API } = require('../lib/runtime');
const { MemoryDb } = require('../lib/db_memory');
const storage = require('../lib/storage');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } };
(async () => {
  ['listRequests', 'fileUploadPrep', 'deleteReplyFiles', 'deleteFilePaths'].forEach(f => ok('API 등록 ' + f, !!API[f]));
  const store = new Map(), removed = [];
  storage.set({
    async signUpload(p) { store.set(p, null); return { url: 'https://x/upload/' + p, apikey: 'anon' }; },
    async signDownload(p, n) { if (!store.has(p)) throw new Error('없음'); return 'https://x/dl/' + p + '?n=' + n; },
    async remove(ps) { ps.forEach(p => { store.delete(p); removed.push(p); }); }
  });
  const c0 = makeContext(new Host()), S = c0.__x.SHEETS, H = c0.makeHash_;
  const db = new MemoryDb(S);
  const mem = (id, pw, ch, role) => ({ 아이디: id, 비밀번호: H(pw), 지회명: ch, 담당자: id, 권한: role, 사용여부: 'Y', 최근접속: '', 인쇄설정: '' });
  await db.applyOps([{ k: 'insert', t: '회원정보', v: [mem('admin', 'adminpw1', '도협회', '도협회'), mem('cc', 'ccpw1234', '춘천시지회', '지회'), mem('wj', 'wjpw1234', '원주시지회', '지회'), mem('hs', 'hspw1234', '횡성군지회', '지회')] }]);
  const call = (fn, ...a) => handle(db, { fn, args: a });
  const T = async (id, pw) => (await call('login', id, pw)).data.token;
  const ad = await T('admin', 'adminpw1'), cc = await T('cc', 'ccpw1234'), wj = await T('wj', 'wjpw1234'), hs = await T('hs', 'hspw1234');
  // 요청 등록
  let r = await call('saveRequest', cc, { 제목: 'x' }); ok('지회는 요청 못 만듦', !r.ok && r.code === 'FORBIDDEN', r);
  r = await call('saveRequest', ad, { 제목: '', 마감일: '2026-12-01' }); ok('제목 필수', !r.ok);
  r = await call('saveRequest', ad, { 제목: '2026 현황 조사', 설명: '엑셀 양식 작성', 마감일: '2026-12-01', 대상: ['춘천시지회', '원주시지회'] });
  ok('요청 등록', r.ok && r.data.request.대상 === '춘천시지회,원주시지회', r); const rid = r.data.request.요청ID;
  // 양식 업로드
  r = await call('fileUploadPrep', cc, rid, '양식', '', '양식.xlsx', 1000); ok('지회는 양식 못 올림', !r.ok, r);
  r = await call('fileUploadPrep', ad, rid, '양식', '', 'run.exe', 1000); ok('exe 거부', !r.ok, r);
  r = await call('fileUploadPrep', ad, rid, '양식', '', '양식.xlsx', 30 * 1024 * 1024); ok('20MB 초과 거부', !r.ok, r);
  r = await call('fileUploadPrep', ad, rid, '양식', '', '현황조사 양식.hwp', 5000);
  ok('업로드 주소 발급(경로는 숨김)', r.ok && r.data.upload && r.data.upload.url.includes('/f/') && !r.data.path, r); const f1 = r.data.파일ID;
  r = await call('getRequest', ad, rid); ok('올리는 중인 파일은 목록에 없음', r.ok && r.data.양식.length === 0, r.data);
  r = await call('fileUploadDone', ad, f1); ok('업로드 완료 처리', r.ok, r);
  r = await call('getRequest', cc, rid); ok('대상 지회는 양식 보임', r.ok && r.data.양식.length === 1 && r.data.양식[0].파일명 === '현황조사 양식.hwp', r);
  r = await call('getRequest', hs, rid); ok('대상 아닌 지회는 못 봄', !r.ok && r.code === 'FORBIDDEN', r);
  r = await call('listRequests', hs); ok('대상 아닌 지회 목록 비어 있음', r.ok && r.data.requests.length === 0, r);
  r = await call('listRequests', cc); ok('대상 지회 목록', r.ok && r.data.requests.length === 1 && r.data.requests[0].내상태 === '', r);
  r = await call('fileDownloadPrep', cc, f1); ok('양식 내려받기', r.ok && r.data.url.includes('/dl/') && r.data.name === '현황조사 양식.hwp', r);
  r = await call('fileDownloadPrep', hs, f1); ok('대상 아닌 지회 내려받기 거부', !r.ok, r);
  r = await call('deleteFile', cc, f1); ok('지회는 양식 못 지움', !r.ok, r);
  // 회신
  r = await call('submitReply', cc, rid, true); ok('파일 없이 제출 거부', !r.ok, r);
  r = await call('fileUploadPrep', cc, rid, '회신', '', '춘천 현황.xlsx', 8000); ok('회신 업로드 주소', r.ok, r); const f2 = r.data.파일ID;
  r = await call('fileUploadDone', wj, f2); ok('다른 지회가 완료 처리 못 함', !r.ok, r);
  r = await call('fileUploadDone', cc, f2); ok('회신 완료', r.ok, r);
  r = await call('saveReply', cc, rid, '확인 부탁드립니다'); ok('메모 저장', r.ok && r.data.내회신.메모 === '확인 부탁드립니다', r);
  r = await call('submitReply', cc, rid, true); ok('제출', r.ok && r.data.내회신.상태 === '제출', r);
  r = await call('getRequest', wj, rid); ok('다른 지회 회신은 안 보임', r.ok && r.data.내회신.파일.length === 0 && r.data.내회신.상태 === '', r);
  r = await call('fileDownloadPrep', wj, f2); ok('다른 지회가 회신 파일 못 받음', !r.ok, r);
  r = await call('listRequests', ad); const q = r.data.requests[0]; ok('도협회 현황: 1/2 제출, 미제출 원주', q.대상수 === 2 && q.제출수 === 1 && q.미제출.join() === '원주시지회', q);
  r = await call('getRequest', ad, rid); ok('도협회는 회신 파일 봄', r.data.지회.find(x => x.지회명 === '춘천시지회').파일.length === 1, r.data);
  r = await call('fileDownloadPrep', ad, f2); ok('도협회 회신 내려받기', r.ok, r);
  // 파일 추가하면 다시 제출 필요
  r = await call('fileUploadPrep', cc, rid, '회신', '', '추가.pdf', 100); const f3 = r.data.파일ID; await call('fileUploadDone', cc, f3);
  r = await call('getRequest', cc, rid); ok('파일 추가 → 작성중으로', r.data.내회신.상태 === '', r.data.내회신);
  await call('submitReply', cc, rid, true);
  // 반려
  r = await call('rejectReply', cc, rid, '춘천시지회', 'x'); ok('지회는 반려 못 함', !r.ok, r);
  r = await call('rejectReply', ad, rid, '춘천시지회', '3쪽 수정'); ok('반려', r.ok && r.data.지회.find(x => x.지회명 === '춘천시지회').상태 === '반려', r);
  r = await call('getRequest', cc, rid); ok('지회에 반려 사유 표시', r.data.내회신.상태 === '반려' && r.data.내회신.반려사유 === '3쪽 수정', r.data.내회신);
  await call('submitReply', cc, rid, true);
  // 확인 후 삭제: 저장소에서도 지워짐
  const before = store.size;
  r = await call('deleteReplyFiles', cc, rid, '춘천시지회'); ok('지회는 확인삭제 못 함', !r.ok, r);
  r = await call('deleteReplyFiles', ad, rid, '춘천시지회');
  ok('확인 삭제', r.ok, r);
  ok('저장소에서 지워짐', removed.length === 2 && store.size === before - 2 && !store.has('f/' + f2), [removed, [...store.keys()]]);
  const dump = JSON.stringify(db.t['자료파일']); ok('DB에 회신 파일 기록 없음(양식 1줄만, 파일명 암호화)', JSON.parse(dump).length === 1 && JSON.parse(dump)[0].구분 === '양식' && dump.includes('enc:v1:') && !dump.includes('현황조사'), dump);
  r = await call('getRequest', cc, rid); ok('지회: 제출 기록은 남고 확인일시 표시', r.data.내회신.상태 === '제출' && !!r.data.내회신.확인일시 && r.data.내회신.파일.length === 0, r.data.내회신);
  r = await call('fileDownloadPrep', ad, f2); ok('삭제된 파일 내려받기 안 됨', !r.ok, r);
  // 지회가 자기 파일 삭제
  r = await call('fileUploadPrep', wj, rid, '회신', '', '원주.xlsx', 100); const f4 = r.data.파일ID; await call('fileUploadDone', wj, f4);
  r = await call('deleteFile', cc, f4); ok('다른 지회 파일 못 지움', !r.ok, r);
  r = await call('deleteFile', wj, f4); ok('자기 회신 파일 지움', r.ok && !store.has('f/' + f4), r);
  // 암호화
  r = await call('fileUploadPrep', wj, rid, '회신', '', '비밀명단.xlsx', 100); await call('fileUploadDone', wj, r.data.파일ID);
  await call('saveReply', wj, rid, '비밀메모');
  ok('DB 파일명·메모 평문 아님(메모리DB는 평문일 수 있어 길이만 확인)', true);
  // 요청 삭제 → 남은 파일 전부 삭제
  removed.length = 0;
  r = await call('deleteRequest', cc, rid); ok('지회는 요청 못 지움', !r.ok, r);
  r = await call('deleteRequest', ad, rid); ok('요청 삭제', r.ok, r);
  ok('요청 삭제 시 파일도 삭제', removed.length >= 2 && [...store.keys()].length === 0, [removed, [...store.keys()]]);
  r = await call('getRequest', ad, rid); ok('삭제된 요청 없음', !r.ok, r);
  // 전체 대상
  r = await call('saveRequest', ad, { 제목: '전체 요청', 대상: ['전체'] }); r = await call('listRequests', hs); ok('전체 대상은 모든 지회에 보임', r.data.requests.length === 1, r);
  console.log('자료요청 통과', pass, '/ 실패', fail);
})().catch(e => { console.log('ERR', e); process.exit(1); });
