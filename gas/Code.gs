/**
 * ============================================================
 *  강원 18개 지회 통합 수어교육 관리 시스템 — 백엔드 (Code.gs)
 *  버전 2.0
 * ============================================================
 *
 *  [설치 방법]
 *  1. Apps Script 편집기에서 기존 파일(Code.gs, code.gs 등)의 코드를 모두 지우고
 *     이 파일 전체를 Code.gs 하나에 붙여넣기 → 저장(Ctrl+S)
 *  2. 스프레드시트 탭을 새로고침 → 상단 메뉴 [📚 교육관리] → [① 시트 초기 설정]
 *  3. [📚 교육관리] → [샘플 데이터로 테스트] → 모두 ✅ 인지 확인 → [샘플 데이터 지우기]
 *  4. '회원정보' 시트에 계정별 비밀번호 입력 → [② 비밀번호 암호화]
 *
 *  [자료 원칙]
 *  - 강좌·참여자는 고유ID로 구분합니다. (지회·연도가 달라도, 이름이 같아도 섞이지 않음)
 *  - 출석은 '한 줄 = 한 사람의 한 회차'로 저장합니다. (회차 수 제한 없음, 최대 100회)
 *  - 연도/반기는 강좌 '시작일' 기준으로 자동 결정합니다. (1~6월 상반기, 7~12월 하반기)
 *  - 연인원 = 출석(O) 횟수의 합계
 *    실인원 = 1회 이상 출석한 사람 수
 *    수료   = 출석횟수 ÷ 총회차 ≥ 수료기준(%)
 *  - 보고 단위: 상반기 / 하반기 / 연간. 연간은 그해 상반기와 하반기를 합산해 따로 제출·승인합니다.
 *    연간 보고가 제출되거나 승인되면 그해 모든 강좌가 잠깁니다. (보완 요청하면 풀림)
 *  - '인원만 입력' 강좌(학교 특강 등)는 이름 없이 회차별 인원수만 입력합니다.
 *    연인원 = 회차별 인원의 합, 실인원 = 회차별 인원 중 최대값, 수료는 집계하지 않음
 *             단, 강좌의 '수료집계'가 N이면 수료인원을 집계하지 않음(0, 화면에는 '-')
 *    총강의시간 = 실제 진행한 회차 × 회당 시간
 *  - 보고가 '제출완료' 또는 '승인'된 기간의 자료는 수정이 잠깁니다. (도협회가 '보완 요청'하면 풀림. 저장 값은 호환을 위해 '반려' 그대로)
 *  - 중도 포기자는 삭제하지 마세요. 삭제하면 그 사람의 출석이 실적에서 빠집니다.
 *    (삭제는 '잘못 등록한 사람'에게만 사용)
 *  - 회원정보의 '지회명'은 사용 시작 후 바꾸지 마세요. 자료가 지회명으로 연결됩니다.
 *  - 이름 끝에 _ 가 붙은 함수는 웹 화면에서 호출할 수 없습니다. (보안)
 */

// ===================== 1. 기본 설정 =====================
const TZ = 'Asia/Seoul';
const SESSION_HOURS = 6;          // 로그인 유지 시간(최대 6)
const MAX_SESSIONS = 100;         // 강좌당 최대 회차
const DEFAULT_CRITERIA = 80;      // 기본 수료기준(%)
const MAX_LOGIN_FAIL = 5;         // 비밀번호 연속 오류 허용 횟수 (초과 시 10분 잠금)
const ROLE_ADMIN = '도협회';
const ROLE_CHAPTER = '지회';
const HALVES = ['상반기', '하반기'];
const ORGS = ['지회', '센터'];                       // 주관: 지회 주관 / 센터 주관
const KINDS = ['내부', '외부'];                       // 교육 구분: 내부 교육 / 외부 교육(학교·기관 출강 등)
const LEVELS = ['초급', '중급', '고급', '특강', '구분없음'];   // 수준 (과정)
const ANNUAL = '연간';                       // 연간 보고 = 그해 상반기 + 하반기 합산
const PERIODS = ['1분기', '상반기', '3분기', ANNUAL];   // 보고 단위(누계): 1분기=1~3월, 상반기=1~6월, 3분기=1~9월, 연간=1~12월
const PERIOD_END = { '1분기': 3, '상반기': 6, '3분기': 9, '연간': 12 };
function monthOf_(d) { return Number(String(d || '').slice(5, 7)) || 0; }
// 강좌 시작일(또는 '기간' 문자열 앞부분)이 그 보고 기간에 들어가는가
function inPeriod_(period, dateStr) { const m = monthOf_(dateStr); return m >= 1 && m <= (PERIOD_END[period] || 12); }
const HQ = ROLE_ADMIN;   // 도협회가 직접 여는 강좌의 '지회명' 값 (보고 대상이 아님)
const ST_NONE = '미제출', ST_SUBMITTED = '제출완료', ST_APPROVED = '승인', ST_REJECTED = '반려';
const LOCKED_STATUSES = [ST_SUBMITTED, ST_APPROVED];
const TEST_CHAPTER = '테스트지회';
const HEADCOUNT_ID = 'HEADCOUNT';   // 인원만 입력하는 강좌의 출석 줄에 쓰는 표시

// [지회명, 기본 아이디]
const CHAPTERS = [
  ['춘천시지회', 'chuncheon'], ['원주시지회', 'wonju'], ['강릉시지회', 'gangneung'],
  ['동해시지회', 'donghae'], ['태백시지회', 'taebaek'], ['속초시지회', 'sokcho'],
  ['삼척시지회', 'samcheok'], ['홍천군지회', 'hongcheon'], ['횡성군지회', 'hoengseong'],
  ['영월군지회', 'yeongwol'], ['평창군지회', 'pyeongchang'], ['정선군지회', 'jeongseon'],
  ['철원군지회', 'cheorwon'], ['화천군지회', 'hwacheon'], ['양구군지회', 'yanggu'],
  ['인제군지회', 'inje'], ['고성군지회', 'goseong'], ['양양군지회', 'yangyang']
];

const SHEETS = {
  MEMBERS: { name: '회원정보', headers: ['아이디', '비밀번호', '지회명', '담당자', '권한', '사용여부', '최근접속', '인쇄설정', '연락처', '센터연락처', '직통번호'] },
  COURSES: { name: '강좌정보', headers: ['강좌ID', '지회명', '연도', '반기', '강좌명', '주관', '교육구분', '수준', '기관명', '시작일', '종료일', '총회차', '회당시간', '강사', '교재', '수료기준', '수료집계', '인원만입력', '상태', '등록일시', '수정일시', '확인서필요', '확인서수령', '확인서수령일', '링크만료일', '보조강사', '강사비기준', '강사비단가', '보조강사비단가', '강사세율', '보조세율', '수료배점', '기타항목명', '종료처리일', '파견ID', '강사비집행', '예정일', '파견비고', '파견장소', '수강료', '요일시간', '장소', '모집인원', '접수시작', '접수마감'] },
  PARTICIPANTS: { name: '참여자명단', headers: ['참여자ID', '강좌ID', '지회명', '이름', '연락처', '비고', '삭제', '등록일시', '수료확정', '성별', '점수'] },
  SESSIONPLAN: { name: '회차강사', headers: ['강좌ID', '회차', '강사', '시작시간', '종료시간'] },
  ATTENDANCE: { name: '출석기록', headers: ['강좌ID', '참여자ID', '회차', '출석', '기록일시', '기록자', '수업일'] },
  RESULTS: { name: '최종실적', headers: ['강좌ID', '지회명', '연도', '반기', '강좌명', '주관', '교육구분', '수준', '기관명', '기간', '강사', '교재', '총회차', '진행회차', '회당시간', '총강의시간', '등록인원', '실인원', '연인원', '수료인원', '수료율', '수료집계', '계산일시'] },
  REPORTS: { name: '보고현황', headers: ['지회명', '연도', '반기', '상태', '강좌수', '실인원', '연인원', '수료인원', '총강의시간', '제출일시', '제출자', '처리일시', '처리자', '반려사유'] },
  CERTSET: { name: '수료증서식', headers: ['강좌ID', '지회명', '제목', '번호접두어', '번호연도', '자리수', '문구', '기관명', '직위', '성명', '수정일시'] },
  CONFIRMS: { name: '강의확인서', headers: ['강좌ID', '내용', '강사서명', '강사서명일시', '기관소속', '기관담당자', '기관서명', '기관서명일시', '수정자', '수정일시', '제출일시', '학교토큰해시', '학교토큰', '링크발송일시', '담당확인일시'] },
  DISPATCH: { name: '파견요청', headers: ['파견ID', '학교명', '지회명', '담당교사', '담당교사연락처', '장소', '일정', '회당시간', '회차수', '수준', '출석방식', '강사비기준', '강사단가', '보조강사단가', '비고', '상태', '차수', '회신', '강좌ID', '만든이', '만든일시', '수정일시'] },
  INQUIRIES: { name: '문의', headers: ['문의ID', '지회명', '제목', '강좌ID', '파견ID', '상태', '글', '지회확인', '도협회확인', '마지막쪽', '마지막일시', '만든일시', '수정일시'] },
  NOTICES: { name: '공지사항', headers: ['공지ID', '제목', '내용', '대상', '시작일', '종료일', '상태', '등록자', '등록일시', '수정일시'] },
  REQUESTS: { name: '자료요청', headers: ['요청ID', '제목', '설명', '마감일', '대상', '상태', '등록자', '등록일시'] },
  FILES: { name: '자료파일', headers: ['파일ID', '요청ID', '구분', '지회명', '파일명', '경로', '크기', '상태', '올린이', '올린일시'] },
  REPLIES: { name: '자료회신', headers: ['요청ID', '지회명', '메모', '상태', '제출일시', '반려사유', '확인일시', '수정일시'] },
  LINKS: { name: '강사링크', headers: ['강좌ID', '토큰해시', '토큰', '만든이', '만든일시', '사용'] },
  PHOTOS: { name: '교육일지사진', headers: ['사진ID', '강좌ID', '회차', '올린이', '올린일시'] },
  SEALS: { name: '직인', headers: ['지회명', '종류', '이미지', '수정일시'] },
  SURVEYS: { name: '만족도조사', headers: ['강좌ID', '토큰해시', '토큰', '사용', '마감일', '안내', '결과토큰해시', '결과토큰', '결과사용', '만든일시', '문항'] },
  SURVEYRESP: { name: '만족도응답', headers: ['응답ID', '강좌ID', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', '의견', '제출일시', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10'] },
  APPLYLINKS: { name: '접수링크', headers: ['강좌ID', '토큰해시', '토큰', '사용', '마감일', '안내', '만든일시', '항목'] },
  POSTERS: { name: '접수포스터', headers: ['강좌ID', '이미지', '올린일시'] },
  ATTENDSIGN: { name: '출석서명', headers: ['강좌ID', '회차', '참여자ID', '서명', '일시'] },
  STULINKS: { name: '수강생링크', headers: ['강좌ID', '종류', '토큰해시', '토큰', '사용', '만든일시'] },
  QRLOG: { name: 'QR출석기록', headers: ['강좌ID', '회차', '기기', '참여자ID', '결과', '일시'] },
  PAYMENTS: { name: '수납', headers: ['수납ID', '강좌ID', '지회명', '참여자ID', '금액', '납부일', '방법', '상태', '영수번호', '영수일', '영수상태', '환불요청일시', '환불사유', '환불은행', '환불계좌', '환불예금주', '환불일', '환불토큰해시', '환불토큰', '만든일시', '수정일시'] },
  APPLYGROUPS: { name: '접수묶음', headers: ['묶음ID', '지회명', '제목', '강좌IDs', '토큰해시', '토큰', '사용', '마감일', '안내', '만든일시'] },
  FEECERTS: { name: '강사비확인증', headers: ['확인증ID', '지회명', '강사명', '연락처', '은행', '계좌번호', '예금주', '기간시작', '기간종료', '항목', '총액', '원천세', '소득세', '지방소득세', '실지급액', '상태', '토큰해시', '토큰', '서명', '서명일시', '비고', '만든일시', '수정일시', '주민번호'] },
  FEETEACHERS: { name: '강사정보', headers: ['지회명', '강사명', '연락처', '은행', '계좌번호', '예금주', '원천세'] },
  APPLICANTS: { name: '접수신청', headers: ['접수ID', '강좌ID', '이름', '연락처', '비고', '상태', '신청일시', '처리일시', '신청경로', '주소', '답변'] },
  PHOTODATA: { name: '교육일지사진자료', headers: ['사진ID', '강좌ID', '회차', '사진'] },
  JOURNAL: { name: '교육일지', headers: ['강좌ID', '회차', '수업일', '주제', '내용', '과제', '특이사항', '작성자', '수정일시', '작성자서명', '참가인원'] },
  TASKS: { name: '과제', headers: ['과제ID', '강좌ID', '과제명', '회차', '마감일', '설명', '등록일시'] },
  SUBMITS: { name: '과제제출', headers: ['강좌ID', '과제ID', '참여자ID', '제출', '기록일시', '기록자'] },
  CERTS: { name: '수료증발급', headers: ['번호', '강좌ID', '지회명', '참여자ID', '이름', '발급일', '발급자', '발급일시'] },
  LOGS: { name: '작업로그', headers: ['일시', '아이디', '작업', '내용'] }
};

// 글자(텍스트) 서식으로 고정할 열 — 010 앞의 0이 사라지거나 날짜가 자동 변환되는 것 방지
const TEXT_COLS = ['과제ID', '마감일', '아이디', '비밀번호', '강좌ID', '참여자ID', '연락처', '센터연락처', '시작일', '종료일', '기간',
  '등록일시', '수정일시', '기록일시', '수업일', '계산일시', '제출일시', '처리일시', '최근접속', '일시', '인쇄설정', '번호', '발급일', '시작시간', '종료시간', '직통번호'];


// ===================== 2. 웹앱 / 메뉴 =====================
function doGet() {
  try {
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('강원 수어교육 관리')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (e) {
    return HtmlService.createHtmlOutput('<h2>화면(index.html)은 다음 단계에서 추가됩니다.</h2>');
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('📚 교육관리')
    .addItem('① 시트 초기 설정', 'setupSheets')
    .addItem('② 비밀번호 암호화', 'hashAllPasswords')
    .addSeparator()
    .addItem('샘플 데이터로 테스트', 'menuSampleTest')
    .addItem('샘플 데이터 지우기', 'menuClearSample')
    .addSeparator()
    .addItem('③ Supabase 이전용 내보내기', 'menuExportForSupabase')
    .addItem('전체 실적 다시 계산', 'menuRecalcAll')
    .addItem('지난 연도 자료 보관(이동)', 'menuArchiveYear')
    .addToUi();
}

// 메뉴 전용 함수 보호: 웹 화면에서 호출하면 여기서 오류가 나서 아무 작업도 하지 않음
function menuGuard_() {
  return SpreadsheetApp.getUi();
}


// ===================== 3. 웹 화면에서 부르는 함수 (API) =====================
// 모든 함수는 { ok: true, data } 또는 { ok: false, error, code } 를 돌려줍니다.
// code: 'AUTH'(다시 로그인 필요) / 'BUSY'(잠시 후 재시도) / 'FORBIDDEN' / 'SYSTEM'

function login(id, password) {
  try {
    resetMemo_();
    const uid = String(id == null ? '' : id).trim().toLowerCase();
    const pw = String(password == null ? '' : password);
    if (!uid || !pw) fail_('아이디와 비밀번호를 입력해 주세요.');
    const cache = CacheService.getScriptCache();
    const failKey = 'fail_' + uid;
    const fails = Number(cache.get(failKey) || 0);
    if (fails >= MAX_LOGIN_FAIL) fail_(`비밀번호를 ${MAX_LOGIN_FAIL}번 틀려 10분간 로그인이 제한됩니다.`);

    return withLock_(() => {
      const t = readTable_(SHEETS.MEMBERS);
      const m = t.rows.find(r => String(r.아이디).trim().toLowerCase() === uid);
      const stored = m ? String(m.비밀번호 == null ? '' : m.비밀번호) : '';
      if (m && !stored) fail_('비밀번호가 아직 설정되지 않은 계정입니다. 도협회에 문의하세요.');
      if (!m || !checkPassword_(pw, stored)) {
        cache.put(failKey, String(fails + 1), 600);
        fail_('아이디 또는 비밀번호가 맞지 않습니다.');
      }
      if (String(m.사용여부).trim().toUpperCase() === 'N') fail_('사용이 중지된 계정입니다. 도협회에 문의하세요.');
      const user = memberToUser_(m);
      cache.remove(failKey);
      if (!isHashed_(stored)) m.비밀번호 = makeHash_(pw);   // 처음 로그인 시 자동 암호화
      m.최근접속 = now_();
      updateRow_(t, m);
      const token = Utilities.getUuid();
      cache.put('tok_' + token, JSON.stringify({ id: user.id }), Math.min(SESSION_HOURS, 6) * 3600);
      log_(user, '로그인', '');
      return { ok: true, data: { token: token, user: user } };
    });
  } catch (e) {
    return errorResult_(e);
  }
}

function logout(token) {
  try { CacheService.getScriptCache().remove('tok_' + token); } catch (e) { /* 무시 */ }
  return { ok: true, data: null };
}

function savePrintSettings(token, cfg) { return api_(token, user => savePrintSettings_(user, cfg), true); }
function changePassword(token, oldPw, newPw) {
  return api_(token, user => changePassword_(user, oldPw, newPw), true);
}
function listMembers(token) { return api_(token, user => listMembers_(user)); }
function resetPassword(token, memberId, newPw) { return api_(token, user => resetPassword_(user, memberId, newPw), true); }
function getInitData(token) { return api_(token, user => getInitData_(user)); }
function listCourses(token, filter) { return api_(token, user => listCourses_(user, filter)); }
function getCourseDetail(token, courseId) { return api_(token, user => getCourseDetail_(user, courseId)); }
function saveCourse(token, data) { return api_(token, user => saveCourse_(user, data), true); }
function deleteCourse(token, courseId) { return api_(token, user => deleteCourse_(user, courseId), true); }
function addParticipants(token, courseId, list) { return api_(token, user => addParticipants_(user, courseId, list), true); }
function updateParticipant(token, pid, data) { return api_(token, user => updateParticipant_(user, pid, data), true); }
function deleteParticipant(token, pid) { return api_(token, user => deleteParticipant_(user, pid), true); }
function saveAttendance(token, courseId, session, presentIds, date) {
  return api_(token, user => saveAttendance_(user, courseId, session, presentIds, date), true);
}
function saveHeadcount(token, courseId, session, count, date) {
  return api_(token, user => saveHeadcount_(user, courseId, session, count, date), true);
}
function getExportData(token, year, chapter) { return api_(token, user => getExportData_(user, year, chapter)); }
function searchAll(token, q, filter) { return api_(token, user => searchAll_(user, q, filter)); }
function getStats(token, year, chapter) { return api_(token, user => getStats_(user, year, chapter)); }
function getReportStatus(token, year, half) { return api_(token, user => getReportStatus_(user, year, half)); }
function getReportDetail(token, chapter, year, half) { return api_(token, user => getReportDetail_(user, chapter, year, half)); }
function submitReport(token, year, half, chapter) { return api_(token, user => submitReport_(user, year, half, chapter), true); }
function approveReport(token, chapter, year, half) { return api_(token, user => approveReport_(user, chapter, year, half), true); }
function rejectReport(token, chapter, year, half, reason) {
  return api_(token, user => rejectReport_(user, chapter, year, half, reason), true);
}


// ===================== 4. 공통 처리 (로그인 확인 · 잠금 · 오류) =====================
function api_(token, fn, write) {
  try {
    resetMemo_();
    const user = auth_(token);
    const data = write ? withLock_(() => fn(user)) : fn(user);
    return { ok: true, data: data };
  } catch (e) {
    return errorResult_(e);
  }
}

// 사용자에게 보여줄 오류 (입력 실수 등)
function fail_(msg, code) {
  const e = new Error(msg);
  e.userError = true;
  e.code = code || '';
  throw e;
}

function errorResult_(e) {
  if (e && e.userError) return { ok: false, error: e.message, code: e.code || '' };
  const msg = (e && e.message) ? e.message : String(e);
  appendLog_('system', '오류', msg + (e && e.stack ? '\n' + e.stack : ''));
  return { ok: false, error: '처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요. (' + msg + ')', code: 'SYSTEM' };
}

// 18개 지회가 동시에 저장해도 자료가 꼬이지 않도록 한 번에 하나씩 처리
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) fail_('지금 다른 곳에서 저장 중입니다. 잠시 후 다시 시도해 주세요.', 'BUSY');
  try {
    resetMemo_();   // 잠금을 얻은 뒤에는 항상 최신 시트를 읽음
    const r = fn();
    SpreadsheetApp.flush();
    return r;
  } finally {
    lock.releaseLock();
  }
}

function auth_(token) {
  if (!token) fail_('로그인이 필요합니다.', 'AUTH');
  const cache = CacheService.getScriptCache();
  const raw = cache.get('tok_' + token);
  if (!raw) fail_('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'AUTH');
  const s = JSON.parse(raw);
  cache.put('tok_' + token, raw, Math.min(SESSION_HOURS, 6) * 3600);   // 사용할 때마다 연장
  // 속도: 계정 확인 결과를 2분간 기억 (그동안은 회원정보 시트를 읽지 않음). 사용 중지 처리는 최대 2분 뒤 반영
  const uk = 'usr_' + s.id, ur = cache.get(uk);
  if (ur) { try { return JSON.parse(ur); } catch (e) { /* 다시 확인 */ } }
  const m = findMember_(s.id);
  if (!m || String(m.사용여부).trim().toUpperCase() === 'N') {
    cache.remove('tok_' + token);
    fail_('사용할 수 없는 계정입니다. 도협회에 문의하세요.', 'AUTH');
  }
  const user = memberToUser_(m);
  cache.put(uk, JSON.stringify(user), 120);
  return user;
}

function findMember_(id) {
  const uid = String(id || '').trim().toLowerCase();
  return readTable_(SHEETS.MEMBERS).rows.find(r => String(r.아이디).trim().toLowerCase() === uid) || null;
}

function memberToUser_(m) {
  const role = String(m.권한 || '').trim();
  if (role !== ROLE_ADMIN && role !== ROLE_CHAPTER) fail_('계정의 권한 설정이 잘못되었습니다. (지회 또는 도협회) 도협회에 문의하세요.', 'AUTH');
  const chapter = String(m.지회명 || '').trim();
  if (role === ROLE_CHAPTER && !chapter) fail_('계정에 지회명이 없습니다. 도협회에 문의하세요.', 'AUTH');
  return { id: String(m.아이디).trim().toLowerCase(), name: String(m.담당자 || '').trim(), chapter: chapter, role: role };
}

function isAdmin_(user) { return user.role === ROLE_ADMIN; }

function requireAdmin_(user) {
  if (!isAdmin_(user)) fail_('도협회 계정만 할 수 있는 작업입니다.', 'FORBIDDEN');
}

function assertAccess_(user, chapter) {
  if (isAdmin_(user)) return;
  if (user.chapter !== chapter) fail_('다른 지회의 자료에는 접근할 수 없습니다.', 'FORBIDDEN');
}

// 보고 제출/승인된 기간이면 수정 금지
function lockInfo_(chapter, year, startDate) {
  const rows = readTable_(SHEETS.REPORTS).rows;
  const m = monthOf_(startDate);
  const keys = PERIODS.filter(k => PERIOD_END[k] >= m);   // 이 강좌가 포함되는 모든 보고 기간
  for (let i = 0; i < keys.length; i++) {
    const r = findReport_(rows, chapter, year, keys[i]);
    if (r && LOCKED_STATUSES.indexOf(r.상태) !== -1) return { name: `${year}년 ${keys[i]}`, status: r.상태 };
  }
  return null;
}

function assertEditable_(chapter, year, startDate) {
  const l = lockInfo_(chapter, year, startDate);
  if (l) fail_(`${l.name} 보고가 '${l.status}' 상태라 수정할 수 없습니다. 수정이 필요하면 도협회에 보완 요청을 부탁하세요.`);
}

function isLocked_(chapter, year, startDate) { return !!lockInfo_(chapter, year, startDate); }


// ===================== 5. 비밀번호 =====================
function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function makeHash_(pw) {
  const salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  return 'sha256$' + salt + '$' + sha256_(salt + '|' + pw);
}
function isHashed_(s) { return /^sha256\$[0-9a-f]+\$[0-9a-f]{64}$/.test(String(s)); }
function checkPassword_(pw, stored) {
  if (isHashed_(stored)) {
    const p = String(stored).split('$');
    return sha256_(p[1] + '|' + pw) === p[2];
  }
  return pw === String(stored);
}

function changePassword_(user, oldPw, newPw) {
  const pw = String(newPw == null ? '' : newPw);
  if (pw.length < 6) fail_('새 비밀번호는 6자 이상으로 입력해 주세요.');
  const t = readTable_(SHEETS.MEMBERS);
  const m = t.rows.find(r => String(r.아이디).trim().toLowerCase() === user.id);
  if (!m || !checkPassword_(String(oldPw == null ? '' : oldPw), String(m.비밀번호))) fail_('현재 비밀번호가 맞지 않습니다.');
  m.비밀번호 = makeHash_(pw);
  updateRow_(t, m);
  log_(user, '비밀번호변경', '');
  return true;
}

// 도협회 전용: 지회 계정 목록 (비밀번호는 보내지 않음)
function listMembers_(user) {
  requireAdmin_(user);
  const order = CHAPTERS.map(c => c[0]);
  return readTable_(SHEETS.MEMBERS).rows
    .filter(m => String(m.권한).trim() === ROLE_CHAPTER && String(m.지회명).trim() !== TEST_CHAPTER)
    .map(m => ({ 아이디: String(m.아이디).trim(), 지회명: String(m.지회명).trim(), 담당자: String(m.담당자 || '').trim(),
                 사용여부: String(m.사용여부).trim().toUpperCase() === 'N' ? 'N' : 'Y' }))
    .sort((a, b) => (order.indexOf(a.지회명) === -1 ? 999 : order.indexOf(a.지회명)) - (order.indexOf(b.지회명) === -1 ? 999 : order.indexOf(b.지회명)));
}
// 도협회 전용: 선택한 지회 계정의 비밀번호를 새 값으로 바꿈 (원래 비밀번호는 알 수 없으므로 '초기화'만 가능)
function resetPassword_(user, memberId, newPw) {
  requireAdmin_(user);
  const id = String(memberId == null ? '' : memberId).trim().toLowerCase();
  const pw = String(newPw == null ? '' : newPw);
  if (pw.length < 6) fail_('새 비밀번호는 6자 이상으로 입력해 주세요.');
  const t = readTable_(SHEETS.MEMBERS);
  const m = t.rows.find(r => String(r.아이디).trim().toLowerCase() === id);
  if (!m || String(m.권한).trim() !== ROLE_CHAPTER) fail_('지회 계정을 찾을 수 없습니다.');
  m.비밀번호 = makeHash_(pw);
  updateRow_(t, m);
  log_(user, '비밀번호초기화', String(m.지회명) + ' (' + id + ')');
  return { 지회명: String(m.지회명) };
}

function hashAllPasswords() {
  const ui = menuGuard_();
  let n = 0;
  withLock_(() => {
    const t = readTable_(SHEETS.MEMBERS);
    t.rows.forEach(m => {
      const pw = String(m.비밀번호 == null ? '' : m.비밀번호);
      if (pw && !isHashed_(pw)) { m.비밀번호 = makeHash_(pw); updateRow_(t, m); n++; }
    });
  });
  ui.alert(`비밀번호 ${n}개를 암호화했습니다.\n(암호화된 비밀번호는 다시 볼 수 없으니 따로 기록해 두세요.)`);
}


// ===================== 6. 시트 읽기/쓰기 도우미 =====================
// 속도: 한 번의 요청 안에서 같은 시트를 여러 번 읽지 않도록 기억해 둠 (쓰기가 일어나면 해당 시트 기억을 지움)
let SS_MEMO_ = null, TBL_MEMO_ = {};
function resetMemo_() { TBL_MEMO_ = {}; }
function ss_() { return SS_MEMO_ || (SS_MEMO_ = SpreadsheetApp.getActiveSpreadsheet()); }

function getSheet_(def) {
  const sh = ss_().getSheetByName(def.name);
  if (!sh) throw new Error(`'${def.name}' 시트가 없습니다. 메뉴에서 [① 시트 초기 설정]을 실행하세요.`);
  return sh;
}

// 시트를 '제목줄 이름' 기준으로 읽기 → 열 순서가 바뀌거나 열이 추가돼도 안전
function readTable_(def) {
  if (TBL_MEMO_[def.name]) return TBL_MEMO_[def.name];
  const sh = getSheet_(def);
  const values = sh.getDataRange().getValues();
  if (!values.length || values[0].every(v => String(v).trim() === '')) throw new Error(`'${def.name}' 시트에 제목줄이 없습니다. [① 시트 초기 설정]을 실행하세요.`);
  const headers = values[0].map(h => String(h).trim());
  const missing = def.headers.filter(h => headers.indexOf(h) === -1);
  if (missing.length) throw new Error(`'${def.name}' 시트에 [${missing.join(', ')}] 열이 없습니다. [① 시트 초기 설정]을 다시 실행하세요.`);
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r.every(v => v === '' || v === null)) continue;   // 빈 줄 건너뛰기
    const o = { _row: i + 1 };
    headers.forEach((h, j) => { if (h) o[h] = normCell_(r[j]); });
    rows.push(o);
  }
  return (TBL_MEMO_[def.name] = { sh: sh, headers: headers, rows: rows });
}

// 날짜 칸은 글자로 바꿔서 돌려줌 (웹 화면으로 Date를 보내면 값이 사라지는 문제 방지)
function normCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  if (typeof v === 'string') return v.trim();
  return v;
}

function toRowArray_(headers, obj) {
  return headers.map(h => (h && obj[h] !== undefined && obj[h] !== null) ? obj[h] : '');
}

function updateRow_(table, obj) {
  resetMemo_();
  table.sh.getRange(obj._row, 1, 1, table.headers.length).setValues([toRowArray_(table.headers, obj)]);
}

function appendRows_(table, objs) {
  if (!objs.length) return;
  resetMemo_();
  const sh = table.sh;
  const start = sh.getLastRow() + 1;
  ensureRows_(sh, start + objs.length - 1);
  const arr = objs.map(o => toRowArray_(table.headers, o));
  sh.getRange(start, 1, arr.length, table.headers.length).setValues(arr);
  objs.forEach((o, i) => { o._row = start + i; });
}

// 시트의 줄 수가 모자라면 늘리기 (기본 1000줄 → 넘으면 오류 나는 문제 방지)
function ensureRows_(sh, lastRowNeeded) {
  const max = sh.getMaxRows();
  if (lastRowNeeded <= max) return;
  const add = lastRowNeeded - max + 500;
  sh.insertRowsAfter(max, add);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  headers.forEach((h, i) => {
    if (TEXT_COLS.indexOf(h) !== -1) sh.getRange(max + 1, i + 1, add, 1).setNumberFormat('@');
  });
}

// 조건에 맞는 줄만 남기고 시트를 다시 쓰기 (삭제·보관용). 지운 줄을 돌려줌
function rewriteTable_(def, keepFn) {
  resetMemo_();
  const sh = getSheet_(def);
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const raw = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const keep = [], removed = [];
  raw.forEach(r => {
    if (r.every(v => v === '' || v === null)) return;
    const o = {};
    headers.forEach((h, j) => { if (h) o[h] = normCell_(r[j]); });
    (keepFn(o) ? keep : removed).push(r);
  });
  if (!removed.length) return [];
  sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, lastCol).setValues(keep);
  return removed;
}

// 줄 지우기 (뒤에서부터). Supabase 버전에서는 이 함수만 바꿔 끼움
function deleteRows_(table, rowNums) {
  resetMemo_();
  rowNums.slice().sort((a, b) => b - a).forEach(row => table.sh.deleteRow(row));
}

function groupBy_(rows, key) {
  const g = {};
  rows.forEach(r => { const k = String(r[key]); (g[k] = g[k] || []).push(r); });
  return g;
}

function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }

function log_(user, action, detail) { appendLog_(user ? user.id : '', action, detail); }

function appendLog_(id, action, detail) {
  try {
    const sh = ss_().getSheetByName(SHEETS.LOGS.name);
    if (sh) sh.appendRow([now_(), id, action, String(detail || '').slice(0, 1000)]);
  } catch (e) { /* 로그 실패는 무시 */ }
}


// ===================== 7. 입력값 검사 =====================
function clean_(v, maxLen, label) {
  let s = (v === null || v === undefined) ? '' : String(v);
  s = s.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (maxLen && s.length > maxLen) fail_(`${label || '입력값'}은(는) ${maxLen}자 이하로 입력해 주세요.`);
  if (/^[=+\-@]/.test(s)) s = "'" + s;   // 시트에서 수식으로 실행되는 것 방지
  return s;
}

function toInt_(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  const n = Number(s);
  return Number.isInteger(n) ? n : NaN;
}

function toNum_(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  return Number(s);
}

function toDateStr_(v, label) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?$/);
  if (!m) fail_(`${label}은 2026-03-02 형식으로 입력해 주세요.`);
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (y < 2020 || y > 2100 || dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    fail_(`${label} 날짜(${s})가 올바르지 않습니다.`);
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 시트에서 읽은 날짜(글자 또는 Date)를 yyyy-MM-dd 로. 날짜가 아니면 ''
function dateText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const m = String(v == null ? '' : v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
// 출석 기록 한 줄의 수업일: 수업일 → (옛 기록) 기록일시의 날짜
function sessionDate_(a) { return dateText_(a.수업일) || dateText_(a.기록일시); }

function normPhone_(v) {
  const s = String(v == null ? '' : v).replace(/[\s.]/g, '');
  if (!s) return '';
  if (!/^[0-9-]{2,20}$/.test(s)) fail_('연락처는 숫자와 - 만 입력해 주세요.');
  const d = s.replace(/-/g, '');
  if (/^01\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^01\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return s;
}

function parsePeriod_(year, half) {
  const y = toInt_(year);
  if (!(y >= 2020 && y <= 2100)) fail_('연도가 올바르지 않습니다.');
  const h = String(half || '').trim();
  if (PERIODS.indexOf(h) === -1) fail_('보고 기간은 1분기·상반기·3분기·연간 중에서 골라 주세요.');
  return { year: y, half: h };
}

function halfOf_(dateStr) { return Number(dateStr.slice(5, 7)) <= 6 ? '상반기' : '하반기'; }

function isHeadcount_(c) { return String(c.인원만입력 == null ? '' : c.인원만입력).trim().toUpperCase() === 'Y'; }

// 강사가 직접 정한 수료 여부: 'Y'(수료) / 'N'(미수료) / ''(출석률로 자동 판정)
function completionOverride_(p) { const v = String(p && p.수료확정 || '').trim().toUpperCase(); return v === 'Y' || v === 'N' ? v : ''; }
// 항목별 비율(수료배점)로 판정하는 강좌: '출석:50,과제:30,기타:20' 모양. 비어 있으면 예전처럼 출석률만 봅니다.
const SCORE_KEYS = ['출석', '발표', '과제', '중간', '기말', '기타'];
function parsePairs_(str) {
  const o = {};
  String(str == null ? '' : str).split(',').forEach(x => {
    const m = /^(.+?):(\d+(?:\.\d+)?)$/.exec(x.trim());
    if (m && SCORE_KEYS.indexOf(m[1]) !== -1) o[m[1]] = Number(m[2]);
  });
  return o;
}
function parseWeights_(c) {
  const o = parsePairs_(c.수료배점);
  const sum = Object.keys(o).reduce((a, k) => a + o[k], 0);
  return sum > 0 ? o : null;
}
function totalScore_(c, p, n) {
  const w = parseWeights_(c), sc = parsePairs_(p.점수), total = Number(c.총회차) || 0;
  let t = 0;
  SCORE_KEYS.forEach(k => {
    if (!w || !w[k]) return;
    const v = k === '출석' ? (total > 0 ? Math.min(100, n * 100 / total) : 0) : (sc[k] || 0);
    t += v * w[k] / 100;
  });
  return Math.round(t * 10) / 10;
}
function isDone_(c, p, n) {
  const ov = completionOverride_(p);
  if (ov) return ov === 'Y';
  if (parseWeights_(c)) { const t = totalScore_(c, p, n); return t > 0 && t + 1e-9 >= Number(c.수료기준); }
  const total = Number(c.총회차) || 0;
  return n > 0 && total > 0 && n * 100 >= Number(c.수료기준) * total;   // 소수점 오차 없는 비교
}
function countsCompletion_(c) { return String(c.수료집계 == null ? '' : c.수료집계).trim().toUpperCase() !== 'N'; }

function isDeleted_(p) { return String(p.삭제 || '').trim().toUpperCase() === 'Y'; }


// ===================== 8. 시작 정보 =====================
// 문의 연락처: 지회 계정은 '지회 전화번호'와 '센터 전화번호'를 각자 적고, 도협회 계정은 '전화번호' 하나만 적음
// (센터 주관 교육 포스터 → 센터 전화번호 / 지회 주관 교육 포스터 → 지회 전화번호. 도협회가 정한 번호를 지회가 가져다 쓰지 않음)
function saveMyContact(token, phone, centerPhone, direct) { return api_(token, user => saveMyContact_(user, phone, centerPhone, direct), true); }
function cleanPhone_(v) {
  const t = String(v == null ? '' : v).trim();
  if (t.length > 30) fail_('연락처가 너무 깁니다.');
  if (t && !/^[0-9\-\s()+]+$/.test(t)) fail_('연락처는 숫자와 하이픈(-)만 입력해 주세요. 예: 033-000-0000');
  return t;
}
function memberPhone_(user) { const m = findMember_(user.id); return m ? String(m.연락처 || '').trim() : ''; }
function memberCenterPhone_(user) { const m = findMember_(user.id); return m ? String(m.센터연락처 || '').trim() : ''; }
// 센터 주관(또는 도협회 강좌) 포스터의 문의 번호: 지회 계정은 자기가 적은 센터 전화번호, 도협회 계정은 자기 전화번호
function centerContact_(user) { return isAdmin_(user) ? memberPhone_(user) : memberCenterPhone_(user); }
function memberDirect_(user) { const m = findMember_(user.id); return m ? String(m.직통번호 || '').trim() : ''; }
function saveMyContact_(user, phone, centerPhone, direct) {
  const t = readTable_(SHEETS.MEMBERS), row = t.rows.find(r => String(r.아이디).trim().toLowerCase() === user.id);
  if (!row) fail_('계정을 찾을 수 없습니다.');
  row.연락처 = cleanPhone_(phone);
  if (!isAdmin_(user) && centerPhone !== undefined) row.센터연락처 = cleanPhone_(centerPhone);
  if (direct !== undefined) row.직통번호 = cleanPhone_(direct);
  updateRow_(t, row);
  log_(user, '연락처저장', '');
  return { 연락처: row.연락처, 센터연락처: String(row.센터연락처 || ''), 직통번호: String(row.직통번호 || '') };
}
// 홍보 포스터에 넣는 강좌 정보
function posterFields_(data) {
  data = data || {};
  const sched = limitText_(data.요일시간, 60, '요일·시간'), place = limitText_(data.장소, 60, '장소');
  let cap = String(data.모집인원 == null ? '' : data.모집인원).trim();
  if (cap && cap !== '시까지') { cap = cap.replace(/[,\s명]/g, ''); if (!/^\d{1,4}$/.test(cap) || Number(cap) < 1) fail_('모집 인원은 숫자로 입력하거나 "모집 시까지"를 골라 주세요.'); cap = String(Number(cap)); }
  const d1 = String(data.접수시작 || '').trim(), d2 = String(data.접수마감 || '').trim();
  const from = d1 ? toDateStr_(d1, '접수 시작일') : '', to = d2 ? toDateStr_(d2, '접수 마감일') : '';
  if (from && to && to < from) fail_('접수 마감일은 시작일보다 빠를 수 없습니다.');
  return { 요일시간: sched, 장소: place, 모집인원: cap, 접수시작: from, 접수마감: to };
}
function posterBlank_() { return { 요일시간: '', 장소: '', 모집인원: '', 접수시작: '', 접수마감: '' }; }
function getInitData_(user) {
  const now = new Date();
  const y = Number(Utilities.formatDate(now, TZ, 'yyyy'));
  const m = Number(Utilities.formatDate(now, TZ, 'M'));
  return {
    user: user,
    today: Utilities.formatDate(now, TZ, 'yyyy-MM-dd'),
    currentYear: y,
    currentHalf: m <= 6 ? '상반기' : '하반기',
    // 지난 분기 보고: 4~6월=1분기, 7~9월=상반기, 10~12월=3분기, 1~3월=작년 연간
    reportPeriod: m >= 10 ? { 연도: y, 반기: '3분기' } : m >= 7 ? { 연도: y, 반기: '상반기' } : m >= 4 ? { 연도: y, 반기: '1분기' } : { 연도: y - 1, 반기: ANNUAL },
    chapters: isAdmin_(user) ? chapterList_() : [user.chapter],
    owners: isAdmin_(user) ? ownerList_() : [user.chapter],   // 도협회 화면: 강좌 등록·조회용 (도협회 포함)
    hasCenter: !isAdmin_(user) && readTable_(SHEETS.COURSES).rows.some(c => c.상태 !== '삭제' && c.지회명 === user.chapter && c.주관 === '센터'),
    maxSessions: MAX_SESSIONS,
    defaultCriteria: DEFAULT_CRITERIA,
    printCfg: loadPrintCfg_(user),
    myPhone: memberPhone_(user), centerPhone: centerContact_(user), myCenterPhone: isAdmin_(user) ? '' : memberCenterPhone_(user), myDirect: memberDirect_(user)
  };
}

// 인쇄 설정(결재란 칸 수·직위·성명·용지 방향): 계정별로 시트에 저장 → 어느 기기에서 로그인해도 같음
function normLine_(c) {
  c = c || {};
  const n = Number(c.n);
  if ([0, 3, 4].indexOf(n) === -1) fail_('결재란은 3칸, 4칸, 없음 중에서 골라 주세요.');
  const cells = Array.isArray(c.cells) ? c.cells.slice(0, 4) : [];
  while (cells.length < 4) cells.push({ role: '확인', name: '' });
  return { n: n, cells: cells.map(x => ({ role: clean_(x && x.role, 8, '직위').replace(/^'/, '') || '확인', name: clean_(x && x.name, 10, '성명').replace(/^'/, '') })) };
}
// 설정 모양: { orient, last: '지회'|'센터', lines: { 지회: {n, cells}, 센터: {n, cells} } }  (예전 모양 {n, cells, orient}도 받아 줌)
function normPrintCfg_(c) {
  c = c || {};
  const lines = c.lines ? { 지회: normLine_(c.lines.지회), 센터: normLine_(c.lines.센터) } : (() => { const l = normLine_(c); return { 지회: l, 센터: l }; })();
  return { orient: c.orient === 'landscape' ? 'landscape' : 'portrait', last: c.last === '센터' ? '센터' : '지회', lines: lines };
}
function loadPrintCfg_(user) {
  try {
    const m = readTable_(SHEETS.MEMBERS).rows.find(r => String(r.아이디).trim().toLowerCase() === user.id);
    return m && m.인쇄설정 ? normPrintCfg_(JSON.parse(String(m.인쇄설정))) : null;
  } catch (e) { return null; }
}
function savePrintSettings_(user, cfg) {
  const v = normPrintCfg_(cfg);
  const t = readTable_(SHEETS.MEMBERS);
  const m = t.rows.find(r => String(r.아이디).trim().toLowerCase() === user.id);
  if (!m) fail_('계정을 찾을 수 없습니다.');
  m.인쇄설정 = JSON.stringify(v);
  updateRow_(t, m);
  return v;
}

function ownerList_() { return chapterList_().concat([HQ]); }   // 강좌를 가질 수 있는 곳: 지회 + 도협회
function chapterList_() {
  const order = CHAPTERS.map(c => c[0]);
  const set = {};
  readTable_(SHEETS.MEMBERS).rows.forEach(m => {
    const ch = String(m.지회명 || '').trim();
    if (String(m.권한).trim() === ROLE_CHAPTER && ch && ch !== TEST_CHAPTER &&
        String(m.사용여부).trim().toUpperCase() !== 'N') set[ch] = true;
  });
  return Object.keys(set).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
  });
}


// ===================== 9. 강좌 =====================
function getCourseOrFail_(courseId) {
  const id = String(courseId == null ? '' : courseId).trim();
  const t = readTable_(SHEETS.COURSES);
  const c = t.rows.find(r => String(r.강좌ID) === id);
  if (!id || !c || c.상태 === '삭제') fail_('강좌를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.');
  return { t: t, c: c };
}

function listCourses_(user, filter) {
  filter = filter || {};
  const chapter = isAdmin_(user) ? String(filter.지회명 || '').trim() : user.chapter;
  const year = filter.연도 ? toInt_(filter.연도) : null;
  const half = filter.반기 || null;
  const results = {};
  readTable_(SHEETS.RESULTS).rows.forEach(r => { results[String(r.강좌ID)] = r; });
  const rows = readTable_(SHEETS.COURSES).rows.filter(c =>
    c.상태 !== '삭제' &&
    (!chapter || c.지회명 === chapter) &&
    (!year || Number(c.연도) === year) &&
    (!half || c.반기 === half));
  rows.sort((a, b) => String(b.시작일).localeCompare(String(a.시작일)));
  return rows.map(c => Object.assign({}, c, { 실적: results[String(c.강좌ID)] || null }));
}

function getCourseDetail_(user, courseId) {
  const c = getCourseOrFail_(courseId).c;
  assertAccess_(user, c.지회명);
  const id = String(c.강좌ID);
  const total = Number(c.총회차);
  const parts = readTable_(SHEETS.PARTICIPANTS).rows.filter(p => String(p.강좌ID) === id && !isDeleted_(p));
  const map = {}, headcounts = {}, dates = {};
  readTable_(SHEETS.ATTENDANCE).rows.forEach(a => {
    if (String(a.강좌ID) !== id) return;
    const sd = sessionDate_(a);
    if (sd && !dates[Number(a.회차)]) dates[Number(a.회차)] = sd;
    const pid = String(a.참여자ID);
    if (pid === HEADCOUNT_ID) { headcounts[Number(a.회차)] = Number(a.출석) || 0; return; }
    (map[pid] = map[pid] || {})[Number(a.회차)] = a.출석;
  });
  const result = readTable_(SHEETS.RESULTS).rows.find(r => String(r.강좌ID) === id) || null;
  if (isAdmin_(user) && !isHeadcount_(c) && c.지회명 !== HQ && !String(c.파견ID || '')) {   // (파견 교육은 도협회가 수료증을 발급하므로 예외)
   // 인원수만 입력하는 강좌는 개인정보가 없어 도협회도 입력 가능
    // 도협회에는 수강생 이름·연락처·개인별 출석을 보내지 않고, 회차별 인원수만 보냄
    const sessions = [];
    for (let sn = 1; sn <= total; sn++) {
      let done = headcounts[sn] !== undefined, cnt = headcounts[sn] || 0;
      if (!isHeadcount_(c)) {
        Object.keys(map).forEach(pid => { if (map[pid][sn] !== undefined) done = true; if (map[pid][sn] === 'O') cnt++; });
      }
      if (done) sessions.push({ 회차: sn, 수업일: dates[sn] || '', 출석: cnt });
    }
    return { course: c, 명단숨김: true, 참여자수: parts.length, sessions: sessions, participants: [], attendance: {}, headcounts: {}, dates: dates,
      result: result, locked: isLocked_(c.지회명, Number(c.연도), c.시작일), lockedBy: (lockInfo_(c.지회명, Number(c.연도), c.시작일) || {}).name || '' };
  }
  return {
    course: c,
    participants: parts.map(p => {
      const att = map[String(p.참여자ID)] || {};
      const cnt = Object.keys(att).filter(s => att[s] === 'O' && Number(s) <= total).length;
      return { 참여자ID: String(p.참여자ID), 이름: p.이름, 연락처: String(p.연락처 || ''), 비고: p.비고, 성별: String(p.성별 || ''), 출석횟수: cnt,
        점수: parsePairs_(p.점수), 총점: parseWeights_(c) ? totalScore_(c, p, cnt) : null,
        수료확정: completionOverride_(p), 수료: countsCompletion_(c) && !isHeadcount_(c) && isDone_(c, p, cnt) };
    }),
    attendance: map,
    headcounts: headcounts,
    dates: dates,
    result: result,
    locked: isLocked_(c.지회명, Number(c.연도), c.시작일),
    lockedBy: (lockInfo_(c.지회명, Number(c.연도), c.시작일) || {}).name || ''
  };
}

function saveCourse_(user, data) {
  data = data || {};
  const name = clean_(data.강좌명, 100, '강좌명');
  if (!name) fail_('강좌명을 입력해 주세요.');
  const start = toDateStr_(data.시작일, '시작일');
  const end = toDateStr_(data.종료일, '종료일');
  if (end < start) fail_('종료일이 시작일보다 빠릅니다.');
  const total = toInt_(data.총회차);
  if (!(total >= 1 && total <= MAX_SESSIONS)) fail_(`총회차는 1~${MAX_SESSIONS} 사이의 숫자로 입력해 주세요.`);
  const hours = toNum_(data.회당시간);
  if (!(hours > 0 && hours <= 12)) fail_('회당 강의시간은 0보다 크고 12시간 이하로 입력해 주세요. (예: 1.5)');
  const rawCrit = data.수료기준;
  const criteria = (rawCrit === '' || rawCrit == null) ? DEFAULT_CRITERIA : toNum_(rawCrit);
  if (!(criteria >= 0 && criteria <= 100)) fail_('수료기준은 0~100(%) 사이로 입력해 주세요.');
  const feeRaw = String(data.수강료 == null ? '' : data.수강료).replace(/[,\s원]/g, '');
  if (feeRaw && !/^\d{1,9}$/.test(feeRaw)) fail_('수강료는 숫자(원)만 입력해 주세요. 무료 강좌는 비워 두세요.');
  const tuition = feeRaw ? Number(feeRaw) : '';
  const poster = posterFields_(data);
  const status = data.상태 === '종료' ? '종료' : '진행중';
  const headIn = String(data.인원만입력 == null ? '' : data.인원만입력).trim().toUpperCase() === 'Y' ? 'Y' : '';
  const needConfirm = String(data.확인서필요 == null ? '' : data.확인서필요).trim().toUpperCase() === 'Y' ? 'Y' : '';
  const countComp = (headIn === 'Y' || data.수료집계 === false || String(data.수료집계 == null ? '' : data.수료집계).trim().toUpperCase() === 'N') ? 'N' : 'Y';
  const year = Number(start.slice(0, 4));
  const half = halfOf_(start);
  const teacher = clean_(data.강사, 50, '강사');
  const place = clean_(data.기관명, 60, '기관명');
  const book = clean_(data.교재, 100, '교재');
  const assistant = clean_(data.보조강사, 50, '보조강사');
  let feeBasis = ['시간', '회'].indexOf(String(data.강사비기준 || '').trim()) !== -1 ? String(data.강사비기준).trim() : '';
  const feeNum = (v, label) => { const t = String(v == null ? '' : v).replace(/[,\s원]/g, ''); if (t === '') return ''; const n = Number(t); if (!(n >= 0 && n <= 100000000)) fail_(`${label}은(는) 0 이상의 숫자로 입력해 주세요.`); return Math.round(n); };
  let feeRate = feeNum(data.강사비단가, '강사비'), feeRate2 = feeNum(data.보조강사비단가, '보조강사비');
  if ((feeRate !== '' || feeRate2 !== '') && !feeBasis) fail_('강사비 기준(시간당 / 회당)을 선택해 주세요.');
  // 수료 배점: 쓰는 항목은 합이 100이어야 함
  let weightStr = '';
  if (data.수료배점 && typeof data.수료배점 === 'object') {
    const parts = []; let sum = 0;
    SCORE_KEYS.forEach(k => { const n = Number(data.수료배점[k]); if (n > 0) { if (n > 100) fail_('항목별 비율은 100을 넘을 수 없습니다.'); parts.push(k + ':' + n); sum += n; } });
    if (parts.length && Math.abs(sum - 100) > 1e-9) fail_(`수료 항목별 비율의 합이 100이어야 합니다. (지금 ${sum})`);
    weightStr = parts.join(',');
  }
  const etcName = clean_(data.기타항목명, 20, '기타 항목 이름');
  const kind = String(data.교육구분 == null ? '' : data.교육구분).trim();
  if (KINDS.indexOf(kind) === -1) fail_('교육 구분(내부 / 외부)을 선택해 주세요.');
  const level = String(data.수준 == null ? '' : data.수준).trim();
  if (LEVELS.indexOf(level) === -1) fail_('수준(초급 / 중급 / 고급 / 특강 / 구분 없음)을 선택해 주세요.');

  const t = readTable_(SHEETS.COURSES);
  const ts = now_();
  const editId = String(data.강좌ID || '').trim();
  // 도협회가 직접 여는 강좌는 주관 구분이 없음
  const owner = editId ? String((t.rows.find(r => String(r.강좌ID) === editId) || {}).지회명 || '')
                       : (isAdmin_(user) ? String(data.지회명 || '').trim() : user.chapter);
  const org = owner === HQ ? '' : String(data.주관 == null ? '' : data.주관).trim();
  if (owner !== HQ && ORGS.indexOf(org) === -1) fail_('주관(지회 주관 / 센터 주관)을 선택해 주세요.');

  if (editId) {
    // ---- 수정 ----
    const c = t.rows.find(r => String(r.강좌ID) === editId);
    if (!c || c.상태 === '삭제') fail_('강좌를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.');
    assertAccess_(user, c.지회명);
    assertEditable_(c.지회명, Number(c.연도), c.시작일);        // 원래 기간
    assertEditable_(c.지회명, year, start);                    // 바뀔 기간
    checkDuplicateCourse_(t.rows, c.지회명, name, start, editId);
    if (headIn !== (isHeadcount_(c) ? 'Y' : '')) fail_('입력 방식(이름 체크 / 인원만 입력)은 등록한 뒤에는 바꿀 수 없습니다. 새 강좌를 등록해 주세요.');
    const maxRec = maxRecordedSession_(editId);
    if (total < maxRec) fail_(`이미 ${maxRec}회차까지 출석이 기록되어 있어 총회차를 ${total}회로 줄일 수 없습니다.`);
    if (status === '종료' && c.상태 !== '종료') c.종료처리일 = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    if (status !== '종료') c.종료처리일 = '';
    if (String(c.파견ID || '')) { feeBasis = String(c.강사비기준 || ''); feeRate = c.강사비단가; feeRate2 = c.보조강사비단가; }   // 파견 교육의 강사비 단가는 도협회가 정함
    Object.assign(c, { 연도: year, 반기: half, 강좌명: name, 주관: org, 교육구분: kind, 수준: level, 시작일: start, 종료일: end, 총회차: total,
      회당시간: hours, 강사: teacher, 기관명: place, 교재: book, 수료기준: criteria, 수료집계: countComp, 상태: status, 수정일시: ts, 보조강사: assistant, 강사비기준: feeBasis, 강사비단가: feeRate, 보조강사비단가: feeRate2, 수료배점: weightStr, 기타항목명: etcName, 확인서필요: needConfirm, 확인서수령: needConfirm ? (c.확인서수령 || '') : '', 확인서수령일: needConfirm ? (c.확인서수령일 || '') : '' });
    Object.assign(c, (isHeadcount_(c) || String(c.파견ID || '')) ? posterBlank_() : poster);   // 인원수만·파견 교육은 포스터 정보 없음
    c.수강료 = (isHeadcount_(c) || String(c.파견ID || '')) ? '' : tuition;   // 인원수만·파견 교육은 수강료를 받지 않음
    if (String(c.파견ID || '')) { c.확인서필요 = 'Y'; if (isHeadcount_(c)) c.수료집계 = 'N'; }   // 파견 교육: 확인서 필수, 수료 집계 안 함 (강사비 단가는 도협회가 정함)
    updateRow_(t, c);
    recalcCourses_([editId]);
    log_(user, '강좌수정', `${editId} ${name}`);
    return getCourseDetail_(user, editId);
  }

  // ---- 새로 등록 ----
  const chapter = isAdmin_(user) ? String(data.지회명 || '').trim() : user.chapter;
  if (!chapter) fail_('지회를 선택해 주세요.');
  if (chapter !== HQ && chapter !== TEST_CHAPTER && !readTable_(SHEETS.MEMBERS).rows.some(m => String(m.권한).trim() === ROLE_CHAPTER && String(m.지회명).trim() === chapter)) fail_('없는 지회입니다.');
  assertEditable_(chapter, year, start);
  checkDuplicateCourse_(t.rows, chapter, name, start, null);
  const id = nextCourseId_(t.rows, chapter, year);
  const c = { 강좌ID: id, 지회명: chapter, 연도: year, 반기: half, 강좌명: name, 주관: org, 교육구분: kind, 수준: level, 시작일: start, 종료일: end,
    총회차: total, 회당시간: hours, 강사: teacher, 기관명: place, 교재: book, 수료기준: criteria, 수료집계: countComp, 인원만입력: headIn, 상태: status,
    보조강사: assistant, 강사비기준: feeBasis, 강사비단가: feeRate, 보조강사비단가: feeRate2, 강사세율: '', 보조세율: '', 수료배점: weightStr, 기타항목명: etcName,
    등록일시: ts, 수정일시: ts, 확인서필요: needConfirm, 확인서수령: '', 확인서수령일: '', 종료처리일: status === '종료' ? Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') : '',
    파견ID: DISPATCH_CREATE_.on ? DISPATCH_CREATE_.id : '', 강사비집행: DISPATCH_CREATE_.on ? HQ : '', 예정일: DISPATCH_CREATE_.on ? DISPATCH_CREATE_.dates : '', 파견비고: DISPATCH_CREATE_.on ? DISPATCH_CREATE_.memo : '', 파견장소: DISPATCH_CREATE_.on ? DISPATCH_CREATE_.place : '', 수강료: (headIn === 'Y' || DISPATCH_CREATE_.on) ? '' : tuition };
  if (!(headIn === 'Y' || DISPATCH_CREATE_.on)) Object.assign(c, poster);
  appendRows_(t, [c]);
  recalcCourses_([id]);
  log_(user, '강좌등록', `${id} ${name}`);
  return getCourseDetail_(user, id);
}

// 같은 지회 + 같은 강좌명 + 같은 시작일 = 중복 (저장 버튼 두 번 누름 방지)
function checkDuplicateCourse_(rows, chapter, name, start, exceptId) {
  const key = name.replace(/\s+/g, '').toLowerCase();
  const dup = rows.find(r => r.상태 !== '삭제' && r.지회명 === chapter &&
    String(r.시작일) === start && String(r.강좌ID) !== exceptId &&
    String(r.강좌명).replace(/^'/, '').replace(/\s+/g, '').toLowerCase() === key.replace(/^'/, ''));
  if (dup) fail_(`같은 시작일(${start})에 같은 이름의 강좌가 이미 있습니다: ${dup.강좌명} (${dup.강좌ID})`);
}

function nextCourseId_(rows, chapter, year) {
  const prefix = `${chapter}-${year}-`;
  let max = 0;
  rows.forEach(r => {
    const id = String(r.강좌ID);
    if (id.indexOf(prefix) === 0) {
      const n = parseInt(id.slice(prefix.length), 10);
      if (n > max) max = n;
    }
  });
  return prefix + String(max + 1).padStart(3, '0');
}

function maxRecordedSession_(courseId) {
  let max = 0;
  readTable_(SHEETS.ATTENDANCE).rows.forEach(a => {
    if (String(a.강좌ID) === courseId && Number(a.회차) > max) max = Number(a.회차);
  });
  return max;
}

function deleteCourse_(user, courseId) {
  const found = getCourseOrFail_(courseId);
  const t = found.t, c = found.c;
  assertAccess_(user, c.지회명);
  assertEditable_(c.지회명, Number(c.연도), c.시작일);
  c.상태 = '삭제';
  c.수정일시 = now_();
  updateRow_(t, c);
  recalcCourses_([String(c.강좌ID)]);
  log_(user, '강좌삭제', `${c.강좌ID} ${c.강좌명}`);
  return { deleted: String(c.강좌ID) };
}


// ===================== 10. 참여자 =====================
function newPid_() { return 'P' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase(); }

function validateParticipant_(item) {
  item = item || {};
  const name = clean_(item.이름, 30, '이름');
  if (!name) fail_('이름을 입력해 주세요.');
  return { 이름: name, 연락처: normPhone_(item.연락처), 비고: clean_(item.비고, 100, '비고'), 성별: clean_(item.성별, 10, '성별') };
}

function addParticipants_(user, courseId, list) {
  const c = getCourseOrFail_(courseId).c;
  if (isHeadcount_(c)) fail_('이 강좌는 인원수만 입력하는 강좌라서 명단이 필요하지 않습니다.');
  assertAccess_(user, c.지회명);
  assertEditable_(c.지회명, Number(c.연도), c.시작일);
  if (!Array.isArray(list) || !list.length) fail_('추가할 참여자가 없습니다.');
  if (list.length > 300) fail_('한 번에 300명까지 등록할 수 있습니다.');
  const cid = String(c.강좌ID);
  const t = readTable_(SHEETS.PARTICIPANTS);
  const existing = t.rows.filter(p => String(p.강좌ID) === cid && !isDeleted_(p));
  const errors = [], toAdd = [], skipped = [], warnings = [];
  const ts = now_();
  list.forEach((item, i) => {
    try {
      const v = validateParticipant_(item);
      const all = existing.concat(toAdd);
      if (all.some(p => p.이름 === v.이름 && String(p.연락처 || '') === v.연락처)) {
        skipped.push(`${v.이름}: 이미 등록됨 (동명이인이면 연락처를 함께 입력하세요)`);
        return;
      }
      if (all.some(p => p.이름 === v.이름)) warnings.push(`${v.이름}: 같은 이름이 이미 있습니다. 동명이인인지 확인하세요.`);
      toAdd.push({ 참여자ID: newPid_(), 강좌ID: cid, 지회명: c.지회명, 이름: v.이름, 연락처: v.연락처,
        비고: v.비고, 성별: v.성별, 삭제: '', 등록일시: ts });
    } catch (e) {
      if (!e.userError) throw e;
      errors.push(`${i + 1}번째: ${e.message}`);
    }
  });
  if (errors.length) fail_('입력 오류가 있어 아무도 등록하지 않았습니다.\n' + errors.join('\n'));
  appendRows_(t, toAdd);
  if (toAdd.length) log_(user, '참여자등록', `${cid} ${toAdd.length}명`);
  return { added: toAdd.length, skipped: skipped, warnings: warnings, detail: getCourseDetail_(user, cid) };
}

function getParticipantOrFail_(pid) {
  const id = String(pid == null ? '' : pid).trim();
  const t = readTable_(SHEETS.PARTICIPANTS);
  const p = t.rows.find(r => String(r.참여자ID) === id);
  if (!id || !p || isDeleted_(p)) fail_('참여자를 찾을 수 없습니다. 화면을 새로고침해 주세요.');
  return { t: t, p: p };
}

function updateParticipant_(user, pid, data) {
  const found = getParticipantOrFail_(pid);
  const t = found.t, p = found.p;
  const c = getCourseOrFail_(p.강좌ID).c;
  assertAccess_(user, c.지회명);
  assertEditable_(c.지회명, Number(c.연도), c.시작일);
  const v = validateParticipant_(data);
  const dup = t.rows.find(r => String(r.강좌ID) === String(p.강좌ID) && !isDeleted_(r) &&
    String(r.참여자ID) !== String(p.참여자ID) && r.이름 === v.이름 && String(r.연락처 || '') === v.연락처);
  if (dup) fail_('같은 이름·연락처의 참여자가 이미 있습니다.');
  Object.assign(p, v);
  updateRow_(t, p);
  log_(user, '참여자수정', `${p.참여자ID}`);
  return getCourseDetail_(user, String(p.강좌ID));
}

function deleteParticipant_(user, pid) {
  const found = getParticipantOrFail_(pid);
  const t = found.t, p = found.p;
  const c = getCourseOrFail_(p.강좌ID).c;
  assertAccess_(user, c.지회명);
  assertEditable_(c.지회명, Number(c.연도), c.시작일);
  p.삭제 = 'Y';
  updateRow_(t, p);
  recalcCourses_([String(p.강좌ID)]);
  log_(user, '참여자삭제', `${p.참여자ID}`);
  return getCourseDetail_(user, String(p.강좌ID));
}


// ===================== 11. 출석 =====================
// 한 회차를 한 번에 저장: presentIds = 출석한 참여자ID 목록, 나머지는 결석(X)
function saveAttendance_(user, courseId, session, presentIds, date) {
  const c = getCourseOrFail_(courseId).c;
  if (isHeadcount_(c)) fail_('이 강좌는 인원수만 입력하는 강좌입니다. 인원 입력 화면을 사용하세요.');
  assertAccess_(user, c.지회명);
  assertEditable_(c.지회명, Number(c.연도), c.시작일);
  const cid = String(c.강좌ID);
  const s = toInt_(session);
  const total = Number(c.총회차);
  if (!(s >= 1 && s <= total)) fail_(`회차는 1~${total} 사이여야 합니다.`);
  if (presentIds != null && !Array.isArray(presentIds)) fail_('출석자 목록 형식이 올바르지 않습니다.');
  const day = (date == null || String(date).trim() === '') ? '' : toDateStr_(date, '수업일');

  const parts = readTable_(SHEETS.PARTICIPANTS).rows.filter(p => String(p.강좌ID) === cid && !isDeleted_(p));
  if (!parts.length) fail_('먼저 참여자를 등록해 주세요.');
  const activeIds = {};
  parts.forEach(p => { activeIds[String(p.참여자ID)] = true; });
  const present = {};
  (presentIds || []).forEach(id => {
    const k = String(id);
    if (!activeIds[k]) fail_('명단에 없는 참여자가 포함되어 있습니다. 화면을 새로고침한 뒤 다시 저장해 주세요.');
    present[k] = true;
  });

  const attT = readTable_(SHEETS.ATTENDANCE);
  const index = {};   // 참여자ID → 이 회차의 기존 기록들
  attT.rows.forEach(r => {
    if (String(r.강좌ID) === cid && Number(r.회차) === s) {
      const k = String(r.참여자ID);
      (index[k] = index[k] || []).push(r);
    }
  });
  const ts = now_();
  // 수업일: 입력값 → 이 회차의 기존 수업일 → 오늘
  let sessionDay = day;
  if (!sessionDay) {
    const any = attT.rows.find(r => String(r.강좌ID) === cid && Number(r.회차) === s && sessionDate_(r));
    sessionDay = any ? sessionDate_(any) : today_();
  }
  const toAppend = [];
  parts.forEach(p => {
    const pid = String(p.참여자ID);
    const val = present[pid] ? 'O' : 'X';
    const ex = index[pid];
    if (ex) {
      ex.forEach(r => {        // 혹시 같은 기록이 두 줄 있어도 모두 같은 값으로 맞춤
        if (r.출석 !== val || dateText_(r.수업일) !== sessionDay) {
          r.출석 = val; r.수업일 = sessionDay; r.기록일시 = ts; r.기록자 = user.id; updateRow_(attT, r);
        }
      });
    } else {
      toAppend.push({ 강좌ID: cid, 참여자ID: pid, 회차: s, 출석: val, 기록일시: ts, 기록자: user.id, 수업일: sessionDay });
    }
  });
  appendRows_(attT, toAppend);
  recalcCourses_([cid]);
  log_(user, '출석저장', `${cid} ${s}회차 출석 ${Object.keys(present).length}/${parts.length}명`);
  return getCourseDetail_(user, cid);
}


function saveHeadcount_(user, courseId, session, count, date) {
  const c = getCourseOrFail_(courseId).c;
  assertAccess_(user, c.지회명);
  assertEditable_(c.지회명, Number(c.연도), c.시작일);
  if (!isHeadcount_(c)) fail_('이 강좌는 이름으로 출석을 체크하는 강좌입니다.');
  const cid = String(c.강좌ID);
  const s = toInt_(session), total = Number(c.총회차);
  if (!(s >= 1 && s <= total)) fail_(`회차는 1~${total} 사이여야 합니다.`);
  const n = toInt_(count);
  if (!(n >= 0 && n <= 10000)) fail_('인원은 0~10,000 사이의 숫자로 입력해 주세요.');
  const day = (date == null || String(date).trim() === '') ? '' : toDateStr_(date, '수업일');
  const attT = readTable_(SHEETS.ATTENDANCE);
  const ex = attT.rows.filter(r => String(r.강좌ID) === cid && String(r.참여자ID) === HEADCOUNT_ID && Number(r.회차) === s);
  const ts = now_();
  if (ex.length) {
    ex.forEach(r => { r.출석 = n; r.수업일 = day || sessionDate_(r) || today_(); r.기록일시 = ts; r.기록자 = user.id; updateRow_(attT, r); });
  } else {
    appendRows_(attT, [{ 강좌ID: cid, 참여자ID: HEADCOUNT_ID, 회차: s, 출석: n, 기록일시: ts, 기록자: user.id, 수업일: day || today_() }]);
  }
  recalcCourses_([cid]);
  log_(user, '인원저장', `${cid} ${s}회차 ${n}명`);
  return getCourseDetail_(user, cid);
}


// ===================== 12. 실적 자동 계산 =====================
// 회차별 강의시간: '회차별 강사·시간'에 시작·끝 시간을 적은 회차는 그 시간, 아니면 회당 시간
function planHourMap_(plan) { const m = {}; (plan || []).forEach(p => { m[Number(p.회차)] = p; }); return m; }
function sumHours_(sessions, plan, hours) {
  const m = planHourMap_(plan);
  return Math.round(sessions.reduce((a, s) => a + planHours_(m[Number(s)], hours), 0) * 10) / 10;
}
function calcHeadcount_(c, att, plan) {
  const total = Number(c.총회차) || 0, hours = Number(c.회당시간) || 0;
  const by = {};
  att.forEach(a => {
    const s = Number(a.회차);
    if (String(a.참여자ID) !== HEADCOUNT_ID || !(s >= 1 && s <= total)) return;
    by[s] = Number(a.출석) || 0;
  });
  const ss = Object.keys(by);
  const sum = ss.reduce((a, k) => a + by[k], 0);
  const max = ss.reduce((a, k) => Math.max(a, by[k]), 0);
  return {
    강좌ID: String(c.강좌ID), 지회명: c.지회명, 연도: Number(c.연도), 반기: c.반기, 강좌명: c.강좌명, 주관: c.주관 || '', 교육구분: c.교육구분 || '', 수준: c.수준 || '', 기관명: c.기관명 || '',
    기간: `${c.시작일} ~ ${c.종료일}`, 강사: c.강사, 교재: c.교재,
    총회차: total, 진행회차: ss.length, 회당시간: hours,
    총강의시간: sumHours_(ss, plan, hours),
    등록인원: max, 실인원: max, 연인원: sum, 수료인원: 0, 수료율: 0, 수료집계: 'N',
    계산일시: now_()
  };
}

function calcCourse_(c, parts, att, plan) {
  if (isHeadcount_(c)) return calcHeadcount_(c, att, plan);
  const total = Number(c.총회차) || 0;
  const hours = Number(c.회당시간) || 0;
  const criteria = Number(c.수료기준);
  const active = {};
  parts.forEach(p => { if (!isDeleted_(p)) active[String(p.참여자ID)] = p; });
  const attended = {};   // 참여자ID → 출석한 회차 모음 (같은 회차 중복 기록은 1번만 셈)
  const held = {};       // 실제 진행한 회차
  att.forEach(a => {
    const s = Number(a.회차), pid = String(a.참여자ID);
    if (!(s >= 1 && s <= total) || !active[pid]) return;
    held[s] = true;
    if (a.출석 === 'O') (attended[pid] = attended[pid] || {})[s] = true;
  });
  const countComp = countsCompletion_(c);
  let personTimes = 0, actual = 0, completed = 0;
  Object.keys(active).forEach(pid => {
    const n = attended[pid] ? Object.keys(attended[pid]).length : 0;
    personTimes += n;
    if (n > 0) actual++;
    if (countComp && isDone_(c, active[pid], n)) completed++;
  });
  const heldCount = Object.keys(held).length;
  return {
    강좌ID: String(c.강좌ID), 지회명: c.지회명, 연도: Number(c.연도), 반기: c.반기, 강좌명: c.강좌명, 주관: c.주관 || '', 교육구분: c.교육구분 || '', 수준: c.수준 || '', 기관명: c.기관명 || '',
    기간: `${c.시작일} ~ ${c.종료일}`, 강사: c.강사, 교재: c.교재,
    총회차: total, 진행회차: heldCount, 회당시간: hours,
    총강의시간: sumHours_(Object.keys(held), plan, hours),
    등록인원: Object.keys(active).length, 실인원: actual, 연인원: personTimes, 수료인원: completed,
    수료율: actual ? Math.min(100, Math.round(completed / actual * 1000) / 10) : 0,
    수료집계: countComp ? 'Y' : 'N',
    계산일시: now_()
  };
}

// 지정한 강좌들만 다시 계산해서 '최종실적' 시트에 반영
function recalcCourses_(courseIds) {
  const ids = {};
  courseIds.forEach(id => { ids[String(id)] = true; });
  const courses = {};
  readTable_(SHEETS.COURSES).rows.forEach(c => { if (ids[String(c.강좌ID)]) courses[String(c.강좌ID)] = c; });
  const parts = groupBy_(readTable_(SHEETS.PARTICIPANTS).rows.filter(p => ids[String(p.강좌ID)]), '강좌ID');
  const att = groupBy_(readTable_(SHEETS.ATTENDANCE).rows.filter(a => ids[String(a.강좌ID)]), '강좌ID');
  const plans = groupBy_(readTable_(SHEETS.SESSIONPLAN).rows.filter(a => ids[String(a.강좌ID)]), '강좌ID');
  const resT = readTable_(SHEETS.RESULTS);
  const existing = groupBy_(resT.rows.filter(r => ids[String(r.강좌ID)]), '강좌ID');
  const toAppend = [], toDelete = [];
  Object.keys(ids).forEach(id => {
    const c = courses[id];
    const ex = existing[id] || [];
    if (!c || c.상태 === '삭제') { ex.forEach(r => toDelete.push(r._row)); return; }
    const r = calcCourse_(c, parts[id] || [], att[id] || [], plans[id] || []);
    if (ex.length) {
      r._row = ex[0]._row;
      updateRow_(resT, r);
      ex.slice(1).forEach(x => toDelete.push(x._row));   // 중복 줄 정리
    } else {
      toAppend.push(r);
    }
  });
  appendRows_(resT, toAppend);
  resetMemo_();
  deleteRows_(resT, toDelete);
}

// 전체 다시 계산 (메뉴용) — 실적 시트를 통째로 새로 씀
function recalcAll_() {
  const courses = readTable_(SHEETS.COURSES).rows.filter(c => c.상태 !== '삭제');
  const parts = groupBy_(readTable_(SHEETS.PARTICIPANTS).rows, '강좌ID');
  const att = groupBy_(readTable_(SHEETS.ATTENDANCE).rows, '강좌ID');
  const plans = groupBy_(readTable_(SHEETS.SESSIONPLAN).rows, '강좌ID');
  const resT = readTable_(SHEETS.RESULTS);
  const out = courses.map(c => {
    const id = String(c.강좌ID);
    return toRowArray_(resT.headers, calcCourse_(c, parts[id] || [], att[id] || [], plans[id] || []));
  });
  resetMemo_();
  const lastRow = resT.sh.getLastRow();
  if (lastRow > 1) resT.sh.getRange(2, 1, lastRow - 1, resT.headers.length).clearContent();
  if (out.length) {
    ensureRows_(resT.sh, out.length + 1);
    resT.sh.getRange(2, 1, out.length, resT.headers.length).setValues(out);
  }
  return out.length;
}


// ===================== 13. 반기 보고 =====================
function findReport_(rows, chapter, year, half) {
  return rows.find(r => r.지회명 === chapter && Number(r.연도) === Number(year) && r.반기 === half) || null;
}

function summarize_(resultRows, chapter, year, half, org) {
  const rs = resultRows.filter(r => r.지회명 === chapter && Number(r.연도) === year && inPeriod_(half, r.기간) && (!org || r.주관 === org));
  const sum = k => rs.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  return { 강좌수: rs.length, 실인원: sum('실인원'), 연인원: sum('연인원'), 수료인원: sum('수료인원'),
    총강의시간: Math.round(sum('총강의시간') * 10) / 10 };
}

/* 교육구분·수준별 소계: 값이 비어 있는 옛 강좌는 '미분류' */
function splitBy_(rows, field, order) {
  const g = {};
  rows.forEach(r => {
    const k = String(r[field] || '').trim() || '미분류';
    const t = g[k] = g[k] || { 강좌수: 0, 실인원: 0, 연인원: 0, 수료인원: 0, 총강의시간: 0 };
    t.강좌수++; t.실인원 += Number(r.실인원) || 0; t.연인원 += Number(r.연인원) || 0;
    t.수료인원 += Number(r.수료인원) || 0; t.총강의시간 = Math.round((t.총강의시간 + (Number(r.총강의시간) || 0)) * 10) / 10;
  });
  const keys = Object.keys(g).sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)));
  return keys.map(k => Object.assign({ 구분: k }, g[k]));
}

// 연간 보고용: 분기마다 따로 합산(누계 아님) — 1~3월 / 4~6월 / 7~9월 / 10~12월 시작 강좌
function quarterSplit_(resultRows, chapter, year) {
  const out = {};
  [['1분기', 1, 3], ['2분기', 4, 6], ['3분기', 7, 9], ['4분기', 10, 12]].forEach(q => {
    const rs = resultRows.filter(r => r.지회명 === chapter && Number(r.연도) === year && monthOf_(r.기간) >= q[1] && monthOf_(r.기간) <= q[2]);
    const sum = k => rs.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    out[q[0]] = { 강좌수: rs.length, 실인원: sum('실인원'), 연인원: sum('연인원'), 수료인원: sum('수료인원'), 총강의시간: Math.round(sum('총강의시간') * 10) / 10 };
  });
  return out;
}

function periodCourseIds_(chapter, year, half) {
  return readTable_(SHEETS.COURSES).rows
    .filter(c => c.상태 !== '삭제' && c.지회명 === chapter && Number(c.연도) === year && inPeriod_(half, c.시작일))
    .map(c => String(c.강좌ID));
}

// 제출 전 확인할 점
function periodWarnings_(resultRows, chapter, year, half) {
  const w = [];
  resultRows.filter(r => r.지회명 === chapter && Number(r.연도) === year && inPeriod_(half, r.기간)).forEach(r => {
    if (Number(r.등록인원) === 0) w.push(`${r.강좌명}: 참여자(인원)가 입력되지 않았습니다.`);
    else if (Number(r.진행회차) < Number(r.총회차)) w.push(`${r.강좌명}: 총 ${r.총회차}회 중 ${r.진행회차}회만 출석이 기록되었습니다.`);
  });
  return w;
}

function getReportStatus_(user, year, half) {
  const p = parsePeriod_(year, half);
  const reports = readTable_(SHEETS.REPORTS).rows;
  const results = readTable_(SHEETS.RESULTS).rows;
  const chapters = isAdmin_(user) ? chapterList_() : [user.chapter];
  const counts = { 전체: chapters.length, 미제출: 0, 제출완료: 0, 승인: 0, 반려: 0 };
  const rows = chapters.map(ch => {
    const r = findReport_(reports, ch, p.year, p.half);
    const status = r ? r.상태 : ST_NONE;
    counts[status] = (counts[status] || 0) + 1;
    const snapshot = r && LOCKED_STATUSES.indexOf(status) !== -1;
    return {
      지회명: ch, 상태: status,
      수치: snapshot
        ? { 강좌수: r.강좌수, 실인원: r.실인원, 연인원: r.연인원, 수료인원: r.수료인원, 총강의시간: r.총강의시간 }
        : summarize_(results, ch, p.year, p.half),
      수치기준: snapshot ? '제출 시점' : '현재',
      제출일시: r ? r.제출일시 : '', 제출자: r ? r.제출자 : '',
      처리일시: r ? r.처리일시 : '', 처리자: r ? r.처리자 : '', 반려사유: r ? r.반려사유 : ''
    };
  });
  return { 연도: p.year, 반기: p.half, counts: counts, rows: rows };
}

function getReportDetail_(user, chapter, year, half) {
  const p = parsePeriod_(year, half);
  const ch = isAdmin_(user) ? String(chapter || '').trim() : user.chapter;
  if (!ch) fail_('지회를 선택해 주세요.');
  assertAccess_(user, ch);
  const results = readTable_(SHEETS.RESULTS).rows;
  const r = findReport_(readTable_(SHEETS.REPORTS).rows, ch, p.year, p.half);
  const inPeriod = results.filter(x => x.지회명 === ch && Number(x.연도) === p.year && inPeriod_(p.half, x.기간));
  return {
    지회명: ch, 연도: p.year, 반기: p.half,
    상태: r ? r.상태 : ST_NONE,
    보고: r,
    합계: summarize_(results, ch, p.year, p.half),
    분기별: p.half === ANNUAL ? quarterSplit_(results, ch, p.year) : null,
    강좌별: inPeriod.sort((a, b) => String(a.기간).localeCompare(String(b.기간))),
    주관별: splitBy_(inPeriod, '주관', ORGS),
    구분별: splitBy_(inPeriod, '교육구분', KINDS),
    수준별: splitBy_(inPeriod, '수준', LEVELS),
    확인사항: periodWarnings_(results, ch, p.year, p.half)
  };
}

// ===================== 13-1. 검색 =====================
// 수강생(지회만) · 강사 · 기관 · 강좌를 한 번에 검색. 검색어가 없으면 조건에 맞는 강좌 목록.
function searchNorm_(v) { return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ''); }

function searchAll_(user, q, filt) {
  filt = filt || {};
  const qq = searchNorm_(q);
  const qd = String(q == null ? '' : q).replace(/\D/g, '');
  const fy = filt.연도 ? toInt_(filt.연도) : 0;
  const hasFilter = !!(fy || filt.주관 || filt.교육구분 || filt.수준);
  if (!qq && !hasFilter) fail_('검색어를 입력하거나 조건을 골라 주세요.');
  if (String(q || '').length > 50) fail_('검색어는 50자 이하로 입력해 주세요.');
  const admin = isAdmin_(user);
  let courses = readTable_(SHEETS.COURSES).rows.filter(c => c.상태 !== '삭제' && (admin || c.지회명 === user.chapter));
  courses = courses.filter(c => (!fy || Number(c.연도) === fy) && (!filt.주관 || c.주관 === filt.주관) &&
    (!filt.교육구분 || c.교육구분 === filt.교육구분) && (!filt.수준 || c.수준 === filt.수준));
  const resMap = {};
  readTable_(SHEETS.RESULTS).rows.forEach(r => { resMap[String(r.강좌ID)] = r; });
  const LIMIT = 50;
  const brief = c => {
    const r = resMap[String(c.강좌ID)] || {};
    return { 강좌ID: String(c.강좌ID), 지회명: c.지회명, 연도: Number(c.연도), 반기: c.반기, 강좌명: c.강좌명, 주관: c.주관 || '', 교육구분: c.교육구분 || '',
      수준: c.수준 || '', 기관명: c.기관명 || '', 강사: c.강사 || '', 교재: c.교재 || '', 시작일: c.시작일, 종료일: c.종료일, 총회차: Number(c.총회차) || 0,
      진행회차: Number(r.진행회차) || 0, 총강의시간: Number(r.총강의시간) || 0, 실인원: Number(r.실인원) || 0, 연인원: Number(r.연인원) || 0,
      인원만입력: isHeadcount_(c), 확인서필요: String(c.확인서필요 || '').trim().toUpperCase() === 'Y' ? 'Y' : '', 확인서수령: String(c.확인서수령 || '').trim().toUpperCase() === 'Y' ? 'Y' : '' };
  };
  const byDate = (a, b) => String(b.시작일).localeCompare(String(a.시작일));
  const out = { 검색어: String(q || ''), 강좌: [], 강사: [], 기관: [], 수강생: admin ? null : [], 더있음: {} };

  // 강좌 (강좌명·강사·교재·기관명, 도협회는 지회명도)
  const cm = qq ? courses.filter(c => searchNorm_([c.강좌명, c.강사, c.교재, c.기관명, admin ? c.지회명 : ''].join('|')).indexOf(qq) !== -1) : courses;
  out.강좌 = cm.map(brief).sort(byDate);
  if (out.강좌.length > LIMIT) { out.더있음.강좌 = out.강좌.length; out.강좌 = out.강좌.slice(0, LIMIT); }

  if (qq) {
    // 강사별
    const tm = {};
    courses.forEach(c => {
      splitNames_(c.강사).forEach(t => { if (searchNorm_(t).indexOf(qq) !== -1) (tm[searchNorm_(t)] = tm[searchNorm_(t)] || { 강사: t, 강좌: [] }).강좌.push(brief(c)); });
    });
    out.강사 = Object.keys(tm).map(k => {
      const g = tm[k]; g.강좌.sort(byDate);
      g.건수 = g.강좌.length; g.총강의시간 = Math.round(g.강좌.reduce((a, x) => a + x.총강의시간, 0) * 10) / 10;
      return g;
    }).slice(0, LIMIT);
    // 기관별
    const om = {};
    courses.forEach(c => {
      const t = String(c.기관명 || '').trim();
      if (t && searchNorm_(t).indexOf(qq) !== -1) (om[searchNorm_(t)] = om[searchNorm_(t)] || { 기관명: t, 강좌: [] }).강좌.push(brief(c));
    });
    out.기관 = Object.keys(om).map(k => {
      const g = om[k]; g.강좌.sort(byDate);
      g.건수 = g.강좌.length; g.연인원 = g.강좌.reduce((a, x) => a + x.연인원, 0);
      return g;
    }).slice(0, LIMIT);

    // 수강생 (지회 계정만: 도협회에는 이름·연락처를 보여주지 않음)
    if (!admin) {
      const cmap = {}; courses.forEach(c => { cmap[String(c.강좌ID)] = c; });
      // '이름', '전화번호(일부)', '이름 전화번호' 모두 가능 (같은 이름은 전화번호를 함께 적어 구분)
      const toks = String(q || '').trim().split(/\s+/).filter(Boolean);
      const phoneToks = toks.filter(t => /^[\d-]+$/.test(t)).map(t => t.replace(/\D/g, ''));
      const nameToks = toks.filter(t => !/^[\d-]+$/.test(t)).map(searchNorm_);
      const minPhone = nameToks.length ? 2 : 3;
      const usablePhone = phoneToks.filter(t => t.length >= minPhone);
      const hit = (!nameToks.length && !usablePhone.length) ? [] : readTable_(SHEETS.PARTICIPANTS).rows.filter(p => {
        if (!cmap[String(p.강좌ID)] || isDeleted_(p)) return false;
        const nm = searchNorm_(p.이름), ph = String(p.연락처 || '').replace(/\D/g, '');
        return nameToks.every(t => nm.indexOf(t) !== -1) && usablePhone.every(t => ph.indexOf(t) !== -1) && phoneToks.length === usablePhone.length;
      });
      const needIds = {}; hit.forEach(p => { needIds[String(p.강좌ID)] = true; });
      const attended = {};   // 강좌ID|참여자ID → { 회차: true }
      readTable_(SHEETS.ATTENDANCE).rows.forEach(a => {
        const cid = String(a.강좌ID);
        if (!needIds[cid] || a.출석 !== 'O') return;
        const k = cid + '|' + String(a.참여자ID);
        (attended[k] = attended[k] || {})[Number(a.회차)] = true;
      });
      const pm = {};
      hit.forEach(p => {
        const c = cmap[String(p.강좌ID)], total = Number(c.총회차) || 0, r = resMap[String(c.강좌ID)] || {};
        const n = Object.keys(attended[String(p.강좌ID) + '|' + String(p.참여자ID)] || {}).filter(s => Number(s) >= 1 && Number(s) <= total).length;
        let status;
        if (!countsCompletion_(c)) status = '집계 안 함';
        else if (isDone_(c, p, n)) status = '수료';
        else if (completionOverride_(p) === 'N') status = '미수료';
        else if ((Number(r.진행회차) || 0) < total) status = '진행 중';
        else status = '미수료';
        const phone = String(p.연락처 || '');
        const key = searchNorm_(p.이름) + '|' + phone.replace(/\D/g, '');
        const g = pm[key] = pm[key] || { 이름: p.이름, 연락처: phone, 수강: [] };
        const b = brief(c);
        g.수강.push({ 강좌ID: b.강좌ID, 강좌명: b.강좌명, 연도: b.연도, 주관: b.주관, 교육구분: b.교육구분, 수준: b.수준, 기관명: b.기관명, 강사: b.강사,
          시작일: b.시작일, 종료일: b.종료일, 총회차: total, 출석: n, 상태: status });
      });
      out.수강생 = Object.keys(pm).map(k => {
        const g = pm[k]; g.수강.sort((a, b) => String(b.시작일).localeCompare(String(a.시작일)));
        g.수강건수 = g.수강.length; g.수료건수 = g.수강.filter(x => x.상태 === '수료').length;
        return g;
      });
      // 같은 이름이 여러 명이면 표시 (연락처로 구분)
      const nameCount = {}; out.수강생.forEach(g => { const k = searchNorm_(g.이름); nameCount[k] = (nameCount[k] || 0) + 1; });
      out.수강생.forEach(g => { g.동명이인 = nameCount[searchNorm_(g.이름)]; });
      out.수강생.sort((a, b) => String(a.이름).localeCompare(String(b.이름)) || String(a.연락처).localeCompare(String(b.연락처)));
      out.수강생 = out.수강생.slice(0, LIMIT);
    }
  }
  return out;
}


// ===================== 13-1b. 연도 전체 내보내기 자료 =====================
// 지회: 강좌 + 출석부(이름·연락처 포함) + 통계 / 도협회: 강좌 + 통계 (수강생 정보 없음)
function getExportData_(user, year, chapter) {
  const y = toInt_(year);
  if (!(y >= 2020 && y <= 2100)) fail_('연도를 확인해 주세요.');
  const admin = isAdmin_(user);
  let want = null, label = user.chapter;
  if (admin) {
    const ch = String(chapter == null ? '' : chapter).trim();
    if (ch && ch !== '전체') { if (ownerList_().indexOf(ch) === -1) fail_('없는 지회입니다.'); want = ch; label = ch; } else { label = '전체'; }
  }
  const courses = readTable_(SHEETS.COURSES).rows.filter(c => c.상태 !== '삭제' && Number(c.연도) === y && (admin ? (!want || c.지회명 === want) : c.지회명 === user.chapter));
  const resMap = {}; readTable_(SHEETS.RESULTS).rows.forEach(r => { resMap[String(r.강좌ID)] = r; });
  const list = courses.map(c => {
    const r = resMap[String(c.강좌ID)] || {};
    return { 강좌ID: String(c.강좌ID), 지회명: c.지회명, 연도: y, 반기: c.반기, 강좌명: c.강좌명, 주관: c.주관 || '', 교육구분: c.교육구분 || '', 수준: c.수준 || '', 기관명: c.기관명 || '',
      강사: c.강사 || '', 교재: c.교재 || '', 시작일: c.시작일, 종료일: c.종료일, 총회차: Number(c.총회차) || 0, 회당시간: Number(c.회당시간) || 0,
      진행회차: Number(r.진행회차) || 0, 총강의시간: Number(r.총강의시간) || 0, 등록인원: Number(r.등록인원) || 0, 실인원: Number(r.실인원) || 0, 연인원: Number(r.연인원) || 0,
      수료인원: Number(r.수료인원) || 0, 수료기준: Number(c.수료기준) || 0, 수료집계: c.수료집계 === 'N' ? 'N' : 'Y', 인원만입력: isHeadcount_(c) ? 'Y' : '', 상태: c.상태 };
  }).sort((a, b) => String(a.지회명).localeCompare(String(b.지회명)) || String(a.시작일).localeCompare(String(b.시작일)));
  let book = null;
  if (!admin || want === HQ) {   // 도협회 자신의 강좌는 출석부(이름 포함)도 내보냄
    const ids = {}; courses.forEach(c => { ids[String(c.강좌ID)] = true; });
    const parts = groupBy_(readTable_(SHEETS.PARTICIPANTS).rows.filter(p => ids[String(p.강좌ID)] && !isDeleted_(p)), '강좌ID');
    const att = groupBy_(readTable_(SHEETS.ATTENDANCE).rows.filter(a => ids[String(a.강좌ID)]), '강좌ID');
    book = list.map(c => {
      const rows = att[c.강좌ID] || [], dates = {}, mark = {}, heads = {};
      rows.forEach(a => {
        const sn = Number(a.회차), sd = sessionDate_(a);
        if (!(sn >= 1 && sn <= c.총회차)) return;
        if (sd && !dates[sn]) dates[sn] = sd;
        const pid = String(a.참여자ID);
        if (pid === HEADCOUNT_ID) heads[sn] = Number(a.출석) || 0; else (mark[pid] = mark[pid] || {})[sn] = a.출석;
      });
      const people = (parts[c.강좌ID] || []).map(p => {
        const m = mark[String(p.참여자ID)] || {};
        const cnt = Object.keys(m).filter(k => m[k] === 'O').length;
        let status;
        if (c.수료집계 === 'N') status = '집계 안 함';
        else if (isDone_(c, p, cnt)) status = '수료';
        else if (completionOverride_(p) === 'N') status = '미수료';
        else if (c.진행회차 < c.총회차) status = '진행 중';
        else status = '미수료';
        return { 이름: p.이름, 연락처: String(p.연락처 || ''), 출석: m, 횟수: cnt, 상태: status };
      });
      return { 강좌ID: c.강좌ID, 수업일: dates, 인원: heads, 사람: people };
    });
  }
  return { 연도: y, 대상: label, 강좌: list, 출석부: book, 통계: getStats_(user, y, admin ? (want || '') : '') };
}


// ===================== 13-2. 통계 (월별 · 상반기 · 하반기 · 연간) =====================
// 월별은 '수업일' 기준, 상반기/하반기/연간은 보고와 같은 기준(강좌 시작일의 반기)
function getStats_(user, year, chapter) {
  const y = toInt_(year);
  if (!(y >= 2020 && y <= 2100)) fail_('연도를 확인해 주세요.');
  let target;   // 지회명 목록
  let label;
  if (isAdmin_(user)) {
    const ch = String(chapter == null ? '' : chapter).trim();
    if (ch && ch !== '전체') {
      if (ownerList_().indexOf(ch) === -1) fail_('없는 지회입니다.');
      target = [ch]; label = ch;
    } else { target = ownerList_(); label = '전체'; }
  } else { target = [user.chapter]; label = user.chapter; }
  const want = {}; target.forEach(c => { want[c] = true; });

  const courses = readTable_(SHEETS.COURSES).rows.filter(c => c.상태 !== '삭제' && want[c.지회명]);
  const cid = {}; courses.forEach(c => { cid[String(c.강좌ID)] = true; });
  const parts = groupBy_(readTable_(SHEETS.PARTICIPANTS).rows.filter(p => cid[String(p.강좌ID)] && !isDeleted_(p)), '강좌ID');
  const att = groupBy_(readTable_(SHEETS.ATTENDANCE).rows.filter(a => cid[String(a.강좌ID)]), '강좌ID');

  const mk = () => { const a = []; for (let m = 1; m <= 12; m++) a.push({ 월: m, 건수: 0, 실인원: 0, 연인원: 0, 강의시간: 0 }); return a; };
  const months = { 전체: mk(), 지회: mk(), 센터: mk() };
  const plans = groupBy_(readTable_(SHEETS.SESSIONPLAN).rows.filter(p => cid[String(p.강좌ID)]), '강좌ID');
  const monthDetail = {};   // 월 → 그달 수업한 강좌별 내역 (월별 인쇄·엑셀용)
  let guessed = 0;   // 수업일이 없어 입력일·시작일로 대신 센 회차 수

  courses.forEach(c => {
    const id = String(c.강좌ID), total = Number(c.총회차) || 0;
    const rows = att[id] || [];
    const head = isHeadcount_(c);
    const active = {}; (parts[id] || []).forEach(p => { active[String(p.참여자ID)] = true; });
    // 회차별: 날짜, 출석한 사람들(또는 인원수)
    const sess = {};
    rows.forEach(a => {
      const sn = Number(a.회차), pid = String(a.참여자ID);
      if (!(sn >= 1 && sn <= total)) return;
      if (head ? pid !== HEADCOUNT_ID : !active[pid]) return;
      const o = sess[sn] = sess[sn] || { day: '', ids: {}, count: 0 };
      if (!o.day) o.day = dateText_(a.수업일) || '';
      if (!o.day) o.guess = dateText_(a.기록일시);
      if (head) o.count = Number(a.출석) || 0;
      else if (a.출석 === 'O') o.ids[pid] = true;
    });
    const perMonth = {};   // m → { people:{}, pt:0, headMax:0, sns:[] }
    const pm = planHourMap_(plans[id]), hrs = Number(c.회당시간) || 0;
    Object.keys(sess).forEach(sn => {
      const o = sess[sn];
      let day = o.day;
      if (!day) { guessed++; day = o.guess || dateText_(c.시작일); }
      if (!day || Number(day.slice(0, 4)) !== y) return;
      const m = Number(day.slice(5, 7));
      const b = perMonth[m] = perMonth[m] || { people: {}, pt: 0, headMax: 0, sns: [], hours: 0 };
      b.sns.push(Number(sn)); b.hours += planHours_(pm[Number(sn)], hrs);
      if (head) { b.pt += o.count; b.headMax = Math.max(b.headMax, o.count); }
      else { Object.keys(o.ids).forEach(pid => { b.pt++; b.people[pid] = true; }); }
    });
    Object.keys(perMonth).forEach(m => {
      const b = perMonth[m];
      const groups = [months.전체]; if (ORGS.indexOf(c.주관) !== -1) groups.push(months[c.주관]);
      const real = head ? b.headMax : Object.keys(b.people).length, hh = Math.round(b.hours * 10) / 10;
      groups.forEach(arr => {
        const row = arr[Number(m) - 1];
        row.건수++; row.연인원 += b.pt; row.강의시간 = Math.round((row.강의시간 + hh) * 10) / 10;
        row.실인원 += real;
      });
      (monthDetail[m] = monthDetail[m] || []).push({ 지회명: c.지회명, 강좌명: c.강좌명, 주관: c.주관 || '', 교육구분: c.교육구분 || '', 수준: c.수준 || '', 강사: c.강사 || '',
        회차: b.sns.sort((x, y) => x - y).join(', '), 회차수: b.sns.length, 강의시간: hh, 실인원: real, 연인원: b.pt });
    });
  });

  const results = readTable_(SHEETS.RESULTS).rows;
  const period = half => {
    const o = {};
    ['전체', '지회', '센터'].forEach(k => {
      const t = { 건수: 0, 실인원: 0, 연인원: 0 };
      target.forEach(ch => { const r = summarize_(results, ch, y, half, k === '전체' ? '' : k); t.건수 += r.강좌수; t.실인원 += r.실인원; t.연인원 += r.연인원; });
      o[k] = t;
    });
    return o;
  };
  Object.keys(monthDetail).forEach(m => monthDetail[m].sort((a, b) => (a.지회명 + a.강좌명).localeCompare(b.지회명 + b.강좌명, 'ko')));
  const out = { 연도: y, 대상: label, 월별: months, 월상세: monthDetail,
    기간별: { '1분기': period('1분기'), 상반기: period('상반기'), '3분기': period('3분기'), 연간: period(ANNUAL) },
    지회별: null, 날짜추정: guessed };
  if (isAdmin_(user) && label === '전체') {
    out.지회별 = target.map(ch => { const r = summarize_(results, ch, y, ANNUAL); return { 지회명: ch, 건수: r.강좌수, 실인원: r.실인원, 연인원: r.연인원 }; });
  }
  return out;
}


function submitReport_(user, year, half, chapterParam) {
  const p = parsePeriod_(year, half);
  const chapter = isAdmin_(user) ? String(chapterParam || '').trim() : user.chapter;   // 도협회는 대리 제출 가능
  if (!chapter) fail_('지회를 선택해 주세요.');
  const t = readTable_(SHEETS.REPORTS);
  const r = findReport_(t.rows, chapter, p.year, p.half);
  if (r && LOCKED_STATUSES.indexOf(r.상태) !== -1) fail_(`이미 '${r.상태}' 상태입니다.`);
  recalcCourses_(periodCourseIds_(chapter, p.year, p.half));   // 제출 직전 최신 계산
  const s = summarize_(readTable_(SHEETS.RESULTS).rows, chapter, p.year, p.half);
  const fields = Object.assign({ 지회명: chapter, 연도: p.year, 반기: p.half, 상태: ST_SUBMITTED,
    제출일시: now_(), 제출자: user.name || user.id, 처리일시: '', 처리자: '', 반려사유: '' }, s);
  if (r) { Object.assign(r, fields); updateRow_(t, r); } else { appendRows_(t, [fields]); }
  log_(user, '보고제출', `${chapter} ${p.year} ${p.half} 연인원 ${s.연인원}`);
  return fields;
}

function approveReport_(user, chapter, year, half) {
  requireAdmin_(user);
  const p = parsePeriod_(year, half);
  const t = readTable_(SHEETS.REPORTS);
  const r = findReport_(t.rows, String(chapter || '').trim(), p.year, p.half);
  if (!r || r.상태 !== ST_SUBMITTED) fail_(`'제출완료' 상태인 보고만 승인할 수 있습니다. (현재: ${r ? r.상태 : ST_NONE})`);
  Object.assign(r, { 상태: ST_APPROVED, 처리일시: now_(), 처리자: user.name || user.id });
  updateRow_(t, r);
  log_(user, '보고승인', `${chapter} ${p.year} ${p.half}`);
  return r;
}

function rejectReport_(user, chapter, year, half, reason) {
  requireAdmin_(user);
  const p = parsePeriod_(year, half);
  const why = clean_(reason, 200, '보완 요청 사유');
  if (!why) fail_('보완 요청 사유를 입력해 주세요.');
  const t = readTable_(SHEETS.REPORTS);
  const r = findReport_(t.rows, String(chapter || '').trim(), p.year, p.half);
  if (!r || LOCKED_STATUSES.indexOf(r.상태) === -1) fail_(`'제출완료' 또는 '승인' 상태인 보고만 보완 요청할 수 있습니다. (현재: ${r ? r.상태 : ST_NONE})`);
  Object.assign(r, { 상태: ST_REJECTED, 처리일시: now_(), 처리자: user.name || user.id, 반려사유: why });
  updateRow_(t, r);
  log_(user, '보고반려', `${chapter} ${p.year} ${p.half}: ${why}`);
  return r;
}


// ===================== 13-2. 수료증 =====================
// 수료증서식: 강좌별 서식(번호 접두어·문구·전달자 등) / 수료증발급: 발급 대장(번호는 지회별로 따로 셈)
function getCertInfo(token, courseId) { return api_(token, user => getCertInfo_(user, courseId)); }
function saveCertSetting(token, courseId, s) { return api_(token, user => saveCertSetting_(user, courseId, s), true); }
function listCerts(token) { return api_(token, user => listCerts_(user)); }
function deleteCert(token, no) { return api_(token, user => deleteCert_(user, no), true); }
// 대장에서 수료증 한 건 삭제 (잘못 발급한 경우). 지운 번호는 다시 쓸 수 있고, 그 사람은 다시 발급할 수 있음
function deleteCert_(user, no) {
  const owner = isAdmin_(user) ? HQ : user.chapter, key = String(no == null ? '' : no).trim();
  if (!key) fail_('지울 수료증 번호가 없습니다.');
  const t = readTable_(SHEETS.CERTS), r = t.rows.find(x => x.지회명 === owner && String(x.번호) === key);
  if (!r) fail_('대장에서 해당 수료증을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.');
  deleteRows_(t, [r._row]);
  log_(user, '수료증삭제', `${key} ${r.이름} (${r.강좌ID})`);
  return listCerts_(user);
}
function issueCerts(token, courseId, pids, date, numbers) { return api_(token, user => issueCerts_(user, courseId, pids, date, numbers), true); }

// 발급 대장: 지회는 자기 지회 것, 도협회는 도협회 강좌 것만 (지회 수강생 이름은 보내지 않음)
function listCerts_(user) {
  const owner = isAdmin_(user) ? HQ : user.chapter;
  const names = {};
  readTable_(SHEETS.COURSES).rows.forEach(c => { names[String(c.강좌ID)] = c.강좌명; });
  return readTable_(SHEETS.CERTS).rows.filter(r => r.지회명 === owner)
    .sort((a, b) => String(a.번호).localeCompare(String(b.번호), 'ko', { numeric: true }))   // 번호 순서대로
    .map(r => ({ 번호: String(r.번호), 이름: r.이름, 강좌ID: String(r.강좌ID), 강좌명: names[String(r.강좌ID)] || '(삭제된 강좌)',
                 발급일: dateText_(r.발급일), 발급자: r.발급자 }));
}

function certCourse_(user, courseId) {
  const c = getCourseOrFail_(courseId).c;
  assertAccess_(user, c.지회명);
  if (String(c.파견ID || '')) { if (!isAdmin_(user)) fail_('파견 교육의 수료증은 도협회에서 발급합니다.', 'FORBIDDEN'); }
  else if (isAdmin_(user) && c.지회명 !== HQ && !isHeadcount_(c)) fail_('지회 수강생의 수료증은 해당 지회에서 발급합니다.', 'FORBIDDEN');
  if (isHeadcount_(c) || !countsCompletion_(c)) fail_('수료를 집계하지 않는 강좌는 수료증을 발급할 수 없습니다.');
  return c;
}

function certOwner_(c) { return String(c.파견ID || '') ? HQ : c.지회명; }   // 파견 교육 수료증은 도협회 이름으로 발급·번호 관리
function certDefaults_(c) {
  const lv = (c.수준 && c.수준 !== '구분없음') ? '-' + c.수준 : '';
  const base = certOwner_(c) === HQ ? '도협회' : String(c.지회명).replace(/(시|군)?지회$/, '');
  return {
    제목: '수 료 증', 번호접두어: base + lv, 번호연도: '자동', 자리수: 3,
    문구: '위 사람은 {기간} 동안 진행한 「{강좌명}」 과정({시간}시간)을 성실히 이수하였기에 이 증서를 수여합니다.',
    기관명: certOwner_(c) === HQ ? '강원특별자치도농아인협회' : (/지회$/.test(c.지회명) ? '강원특별자치도농아인협회' + c.지회명 : c.지회명), 직위: certOwner_(c) === HQ ? '회장' : '지회장', 성명: ''
  };
}

// 이 강좌의 서식. 없으면 같은 지회·같은 수준의 가장 최근 서식을 불러오고, 그것도 없으면 기본값
function certSetting_(c) {
  const rows = readTable_(SHEETS.CERTSET).rows;
  const own = rows.find(r => String(r.강좌ID) === String(c.강좌ID));
  const keys = ['제목', '번호접두어', '번호연도', '자리수', '문구', '기관명', '직위', '성명'];
  const pick = r => { const o = {}; keys.forEach(k => { o[k] = r[k]; }); o.자리수 = Number(o.자리수) || 3; o.번호연도 = String(o.번호연도 || '') || '자동'; return o; };
  if (own) return { saved: true, s: pick(own) };
  const lv = {};
  readTable_(SHEETS.COURSES).rows.forEach(x => { lv[String(x.강좌ID)] = x.수준; });
  const mine = rows.filter(r => r.지회명 === certOwner_(c)).sort((a, b) => String(b.수정일시).localeCompare(String(a.수정일시)));
  const same = mine.find(r => lv[String(r.강좌ID)] === c.수준);
  if (same) return { saved: false, s: pick(same) };
  // 같은 수준 서식이 없으면 같은 지회의 가장 최근 서식(번호 방식·문구·전달자)을 따르고, 수준이 붙은 앞부분만 이 강좌 수준으로 바꿈
  const last = mine[0];
  if (!last) return { saved: false, s: certDefaults_(c) };
  const o = pick(last), olv = String(lv[String(last.강좌ID)] || '');
  if (olv && olv !== '구분없음' && String(o.번호접두어).endsWith('-' + olv)) {
    o.번호접두어 = String(o.번호접두어).slice(0, -(olv.length + 1)) + ((c.수준 && c.수준 !== '구분없음') ? '-' + c.수준 : '');
  }
  return { saved: false, s: o };
}

function getCertInfo_(user, courseId) {
  const c = certCourse_(user, courseId);
  const d = getCourseDetail_(user, courseId);
  const total = Number(c.총회차) || 0, crit = Number(c.수료기준);
  const ledger = {};
  readTable_(SHEETS.CERTS).rows.forEach(r => { if (String(r.강좌ID) === String(c.강좌ID)) ledger[String(r.참여자ID)] = r; });
  const people = [];
  d.participants.forEach(p => {
    const done = !!p.수료;
    const L = ledger[p.참여자ID];
    if (!done && !L) return;
    people.push({ 참여자ID: p.참여자ID, 이름: p.이름, 출석횟수: p.출석횟수, 수료: done,
                  번호: L ? String(L.번호) : '', 발급일: L ? dateText_(L.발급일) : '' });
  });
  const st = certSetting_(c);
  let nextNo = 1;
  const certAll = readTable_(SHEETS.CERTS).rows, stemInfo = st.s;
  const yv = stemInfo.번호연도 === '자동' ? String(Number(c.연도)) : (stemInfo.번호연도 === '없음' ? '' : stemInfo.번호연도);
  const stem2 = [stemInfo.번호접두어, yv].filter(Boolean).map(x => x + '-').join('');
  certAll.forEach(r => { const no = String(r.번호); if (r.지회명 === certOwner_(c) && no.indexOf(stem2) === 0 && /^\d+$/.test(no.slice(stem2.length))) nextNo = Math.max(nextNo, parseInt(no.slice(stem2.length), 10) + 1); });
  return { setting: st.s, saved: st.saved, people: people, locked: d.locked, nextNo: nextNo };
}

function saveCertSetting_(user, courseId, s) {
  const c = certCourse_(user, courseId);
  s = s || {};
  const prefix = clean_(s.번호접두어, 30, '번호 접두어');   // 비워도 됨
  if (/[\/\\]/.test(prefix)) fail_('번호 접두어에는 / 와 \\ 를 쓸 수 없습니다.');
  const ym = clean_(s.번호연도, 20, '번호 연도') || '자동';   // 자동 = 강좌 연도, 없음 = 넣지 않음, 그 밖에는 적은 글자 그대로
  const digits = toInt_(s.자리수);
  if (!(digits >= 1 && digits <= 6)) fail_('번호 자리수는 1~6 사이로 입력해 주세요.');
  const text = clean_(s.문구, 500, '문구');
  if (!text) fail_('수료증 문구를 입력해 주세요.');
  const row = {
    강좌ID: String(c.강좌ID), 지회명: certOwner_(c), 제목: clean_(s.제목, 30, '제목') || '수 료 증',
    번호접두어: prefix, 번호연도: ym, 자리수: digits, 문구: text, 기관명: clean_(s.기관명, 60, '기관명'),
    직위: clean_(s.직위, 30, '직위'), 성명: clean_(s.성명, 30, '전달자 성명'), 수정일시: now_()
  };
  const t = readTable_(SHEETS.CERTSET);
  const ex = t.rows.find(r => String(r.강좌ID) === String(c.강좌ID));
  if (ex) { row._row = ex._row; updateRow_(t, row); } else appendRows_(t, [row]);
  log_(user, '수료증서식저장', `${c.강좌ID} ${c.강좌명}`);
  return getCertInfo_(user, courseId);
}

function issueCerts_(user, courseId, pids, date, numbers) {
  const c = certCourse_(user, courseId);
  const info = getCertInfo_(user, courseId);
  if (!info.saved) fail_('먼저 수료증 서식을 저장해 주세요.');
  if (!Array.isArray(pids) || !pids.length) fail_('수료증을 발급할 사람을 선택해 주세요.');
  const when = date ? toDateStr_(date, '발급일') : today_();
  const byId = {};
  info.people.forEach(p => { byId[p.참여자ID] = p; });
  const t = readTable_(SHEETS.CERTS);
  const ymv = info.setting.번호연도;
  const yp = ymv === '자동' ? String(Number(c.연도)) : (ymv === '없음' ? '' : ymv);
  const stem = [info.setting.번호접두어, yp].filter(Boolean).map(x => x + '-').join('');   // 예: 춘천-초급-2026-
  let seq = 0;
  t.rows.forEach(r => {
    const no = String(r.번호);
    if (r.지회명 === certOwner_(c) && no.indexOf(stem) === 0 && /^\d+$/.test(no.slice(stem.length))) seq = Math.max(seq, parseInt(no.slice(stem.length), 10));
  });
  const add = [], seen = {}, used = {};
  t.rows.forEach(r => { if (r.지회명 === certOwner_(c)) used[String(r.번호)] = true; });
  pids.forEach(id => {
    id = String(id);
    const p = byId[id];
    if (!p || seen[id]) return;
    seen[id] = true;
    if (p.번호) return;                       // 이미 발급된 사람은 같은 번호 그대로
    if (!p.수료) fail_(`${p.이름}님은 수료 기준에 미달해 발급할 수 없습니다.`);
    const typed = numbers && numbers[id] != null ? String(numbers[id]).trim() : '';
    let no;
    if (typed) {   // 담당자가 직접 적은 번호: 숫자만 쓰면 서식(접두어-연도-자리수)에 맞춰 만들고, 글자가 섞이면 그대로 씀
      if (typed.length > 40 || /[\/\\]/.test(typed)) fail_('수료번호는 40자 이내로, / 와 \\ 없이 적어 주세요.');
      no = /^\d+$/.test(typed) ? stem + typed.padStart(info.setting.자리수, '0') : typed;
    } else { do { seq++; no = stem + String(seq).padStart(info.setting.자리수, '0'); } while (used[no]); }
    if (used[no]) fail_(`수료번호 ${no}은(는) 이미 사용 중이거나 중복입니다. 번호를 확인해 주세요. (${p.이름})`);
    used[no] = true;
    add.push({ 번호: no, 강좌ID: String(c.강좌ID), 지회명: certOwner_(c), 참여자ID: id, 이름: p.이름,
               발급일: when, 발급자: user.id, 발급일시: now_() });
  });
  appendRows_(t, add);
  if (add.length) log_(user, '수료증발급', `${c.강좌ID} ${add.length}명 (${add[0].번호} ~ ${add[add.length - 1].번호})`);
  const fresh = getCertInfo_(user, courseId);
  const want = {};
  Object.keys(seen).forEach(k => { want[k] = true; });
  fresh.certs = fresh.people.filter(p => want[p.참여자ID] && p.번호);
  fresh.issuedNow = add.length;
  if (!fresh.certs.length) fail_('수료 기준을 채운 사람만 수료증을 발급할 수 있습니다. 선택한 사람을 확인해 주세요.');
  return fresh;
}


// ===================== 13-4. 회차별 강사·시간 =====================
// 강좌의 '강사' 칸에 여러 명을 쉼표(,)로 적을 수 있고, 회차마다 맡을 강사와 수업 시간을 따로 정할 수 있음
function splitNames_(v) { const out = []; String(v == null ? '' : v).split(/[,，、;]+/).forEach(x => { x = x.trim(); if (x && out.indexOf(x) === -1) out.push(x); }); return out; }
function nameIn_(v, nm) { return splitNames_(v).indexOf(String(nm == null ? '' : nm).trim()) !== -1; }
function timeText_(v) {
  const t = String(v == null ? '' : v).trim(); if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) fail_('시간은 19:00 처럼 입력해 주세요.');
  return (m[1].length < 2 ? '0' : '') + m[1] + ':' + m[2];
}
function timeMin_(t) { const m = /^(\d{2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
function planRows_(id) { return readTable_(SHEETS.SESSIONPLAN).rows.filter(r => String(r.강좌ID) === String(id)); }
function planHours_(r, dflt) { const a = timeMin_(r && r.시작시간), b = timeMin_(r && r.종료시간); return a !== null && b !== null && b > a ? Math.round((b - a) / 6) / 10 : dflt; }
function getPlan(token, courseId) { return api_(token, user => getPlan_(user, courseId)); }
function savePlan(token, courseId, rows) { return api_(token, user => savePlan_(user, courseId, rows), true); }
function getPlan_(user, courseId) {
  const c = getCourseOrFail_(courseId).c;
  assertAccess_(user, c.지회명);
  const id = String(c.강좌ID), by = {}, total = Number(c.총회차) || 0, rows = [];
  planRows_(id).forEach(r => { by[Number(r.회차)] = r; });
  for (let sn = 1; sn <= total; sn++) { const x = by[sn] || {}; rows.push({ 회차: sn, 강사: String(x.강사 || ''), 시작시간: String(x.시작시간 || ''), 종료시간: String(x.종료시간 || '') }); }
  return { 메인강사: mainTeacher_(c), 강사목록: splitNames_(c.강사).concat(splitNames_(c.보조강사).filter(x => splitNames_(c.강사).indexOf(x) === -1)), 총회차: total, 회당시간: Number(c.회당시간) || 0, 요일시간: String(c.요일시간 || ''), rows: rows };
}
function savePlan_(user, courseId, rows) {
  const c = getCourseOrFail_(courseId).c;
  assertAccess_(user, c.지회명);
  assertEditable_(c.지회명, Number(c.연도), c.시작일);
  if (!Array.isArray(rows)) fail_('저장할 내용이 없습니다.');
  const id = String(c.강좌ID), total = Number(c.총회차) || 0, out = [];
  rows.forEach(x => {
    x = x || {};
    const sn = toInt_(x.회차);
    if (!(sn >= 1 && sn <= total)) return;
    const who = limitText_(x.강사, 30, '강사'), s = timeText_(x.시작시간), e = timeText_(x.종료시간);
    if ((s && !e) || (!s && e)) fail_(`${sn}회차: 시작 시간과 끝나는 시간을 모두 입력해 주세요.`);
    if (s && timeMin_(e) <= timeMin_(s)) fail_(`${sn}회차: 끝나는 시간이 시작 시간보다 늦어야 합니다.`);
    if (who || s) out.push({ 강좌ID: id, 회차: sn, 강사: who, 시작시간: s, 종료시간: e });
  });
  const pt = readTable_(SHEETS.SESSIONPLAN), old = pt.rows.filter(x => String(x.강좌ID) === id);
  if (old.length) deleteRows_(pt, old.map(x => x._row));
  if (out.length) appendRows_(readTable_(SHEETS.SESSIONPLAN), out);
  log_(user, '회차강사저장', `${id} ${out.length}회차`);
  recalcCourses_([id]);   // 회차별 시간이 실적(총강의시간)에 바로 반영되도록
  return getPlan_(user, id);
}

// ===================== 13-3. 교육일지 · 과제 제출 · 수료 직접 체크 =====================
function getJournal(token, courseId) { return api_(token, user => getJournal_(user, courseId)); }
function saveJournal(token, courseId, session, entry) { return api_(token, user => saveJournal_(user, courseId, session, entry), true); }
function getTasks(token, courseId) { return api_(token, user => getTasks_(user, courseId)); }
function saveTask(token, courseId, task) { return api_(token, user => saveTask_(user, courseId, task), true); }
function deleteTask(token, courseId, taskId) { return api_(token, user => deleteTask_(user, courseId, taskId), true); }
function setSubmit(token, courseId, taskId, pid, on) { return api_(token, user => setSubmit_(user, courseId, taskId, pid, on), true); }
function saveScores(token, courseId, pid, scores) { return api_(token, user => saveScores_(user, courseId, pid, scores), true); }
function saveFeeTax(token, courseId, tax) { return api_(token, user => saveFeeTax_(user, courseId, tax), true); }
function setCompletion(token, courseId, pid, value) { return api_(token, user => setCompletion_(user, courseId, pid, value), true); }

// 수강생 이름이 들어가는 자료라서 해당 지회만 쓸 수 있음 (도협회는 도협회 강좌만)
function classCourse_(user, courseId) {
  const c = getCourseOrFail_(courseId).c;
  assertAccess_(user, c.지회명);
  if (isAdmin_(user) && c.지회명 !== HQ && !isHeadcount_(c) && !String(c.파견ID || '')) fail_('지회 강좌의 교육일지·과제·수료 체크는 해당 지회에서 관리합니다.', 'FORBIDDEN');
  return c;
}
function limitText_(v, max, label) {
  const t = String(v == null ? '' : v).replace(/\r\n/g, '\n').trim();
  if (t.length > max) fail_(`${label}은(는) ${max}자까지 쓸 수 있습니다. (지금 ${t.length}자)`);
  return t;
}

// ----- 일지 사진·서명 보관 기간 (교육 종료 후 3개월) -----
const MEDIA_KEEP_MONTHS = 3;
function addMonths_(ymd, n) {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7)) - 1 + n, d = Number(ymd.slice(8, 10));
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
// 삭제 예정일: 종료 처리한 날(없으면 강좌 종료일) + 3개월
function mediaExpiry_(c) {
  const base = dateText_(c.종료처리일) || dateText_(c.종료일);
  return /^\d{4}-\d{2}-\d{2}$/.test(base) ? addMonths_(base, MEDIA_KEEP_MONTHS) : '';
}
function wipeMedia_(courseIds) {   // 사진·서명을 지움. 지운 사진 수를 돌려줌
  const ids = {}; courseIds.forEach(i => { ids[String(i)] = true; });
  const pt = readTable_(SHEETS.PHOTOS), pr = pt.rows.filter(r => ids[String(r.강좌ID)]);
  if (pr.length) deleteRows_(pt, pr.map(r => r._row));
  const dt = readTable_(SHEETS.PHOTODATA), dr = dt.rows.filter(r => ids[String(r.강좌ID)]);
  if (dr.length) deleteRows_(dt, dr.map(r => r._row));
  const st = readTable_(SHEETS.ATTENDSIGN), sr = st.rows.filter(r => ids[String(r.강좌ID)]);
  if (sr.length) deleteRows_(st, sr.map(r => r._row));
  const jt = readTable_(SHEETS.JOURNAL);
  jt.rows.forEach(r => { if (ids[String(r.강좌ID)] && String(r.작성자서명 || '')) { r.작성자서명 = ''; updateRow_(jt, r); } });
  return pr.length;
}
// 담당자가 직접 '사진·서명 모두 삭제'
function deleteJournalMedia(token, courseId) { return api_(token, user => deleteJournalMedia_(user, courseId), true); }
function deleteJournalMedia_(user, courseId) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID);
  const n = wipeMedia_([id]);
  log_(user, '일지사진서명전체삭제', `${id} 사진 ${n}장`);
  return getJournal_(user, id);
}
// 매일 자동 실행: 기간이 지난 강좌의 사진·서명 삭제 (본문은 남김)
function purgeExpiredMedia_() {
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const ids = readTable_(SHEETS.COURSES).rows.filter(c => c.상태 !== '삭제' && mediaExpiry_(c) && mediaExpiry_(c) <= today).map(c => String(c.강좌ID));
  purgeExpiredPosters_();
  if (!ids.length) return 0;
  const n = wipeMedia_(ids);
  if (n) log_({ id: 'system', name: '자동삭제' }, '일지사진서명자동삭제', `강좌 ${ids.length}개 사진 ${n}장`);
  return n;
}

function getJournal_(user, courseId) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID), total = Number(c.총회차) || 0;
  const dates = {}, held = {};
  readTable_(SHEETS.ATTENDANCE).rows.forEach(a => {
    if (String(a.강좌ID) !== id) return;
    const sn = Number(a.회차); held[sn] = true;
    const sd = sessionDate_(a); if (sd && !dates[sn]) dates[sn] = sd;
  });
  const ent = {}, cntAuto = {};
  readTable_(SHEETS.ATTENDANCE).rows.forEach(a => {
    if (String(a.강좌ID) !== id) return;
    const sn = Number(a.회차);
    if (String(a.참여자ID) === HEADCOUNT_ID) cntAuto[sn] = Number(a.출석) || 0; else if (a.출석 === 'O') cntAuto[sn] = (cntAuto[sn] || 0) + 1;
  });
  readTable_(SHEETS.JOURNAL).rows.forEach(r => { if (String(r.강좌ID) === id) ent[Number(r.회차)] = r; });
  const pics = {};
  readTable_(SHEETS.PHOTOS).rows.forEach(r => { if (String(r.강좌ID) === id) (pics[Number(r.회차)] = pics[Number(r.회차)] || []).push(String(r.사진ID)); });
  const sessions = [];
  for (let sn = 1; sn <= total; sn++) {
    const e = ent[sn];
    sessions.push({ 사진: pics[sn] || [], 회차: sn, 진행: !!held[sn], 작성: !!e, 수업일: (e && dateText_(e.수업일)) || dates[sn] || '',
      주제: e ? String(e.주제 || '') : '', 내용: e ? String(e.내용 || '') : '', 과제: e ? String(e.과제 || '') : '',
      특이사항: e ? String(e.특이사항 || '') : '', 출석수: cntAuto[sn] || 0, 참가인원: e && String(e.참가인원 == null ? '' : e.참가인원) !== '' ? Number(e.참가인원) : '', 작성자: e ? String(e.작성자 || '') : '', 수정일시: e ? String(e.수정일시 || '') : '', 서명: e ? String(e.작성자서명 || '') : '' });
  }
  return { course: { 강좌ID: id, 강좌명: c.강좌명, 지회명: c.지회명, 총회차: total, 강사: c.강사 || '', 보조강사: c.보조강사 || '', 삭제예정일: mediaExpiry_(c), 상태: c.상태 || '' }, 기본작성자: c.강사 || '', sessions: sessions };
}

function saveJournal_(user, courseId, session, entry) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID), total = Number(c.총회차) || 0;
  const sn = toInt_(session);
  if (!(sn >= 1 && sn <= total)) fail_(`회차는 1~${total} 사이여야 합니다.`);
  const e = entry || {};
  const topic = limitText_(e.주제, 100, '수업 주제'), body = limitText_(e.내용, 3000, '수업 내용'),
    hw = limitText_(e.과제, 1000, '내준 과제'), note = limitText_(e.특이사항, 1000, '특이사항');
  const day = String(e.수업일 == null ? '' : e.수업일).trim() === '' ? '' : toDateStr_(e.수업일, '수업일');
  const rawN = String(e.참가인원 == null ? '' : e.참가인원).trim();
  let headN = '';
  if (rawN !== '') { headN = toInt_(rawN); if (!(headN >= 0 && headN <= 10000)) fail_('참가 인원은 0 이상의 숫자로 입력해 주세요.'); }
  if (!topic && !body && !hw && !note) fail_('수업 주제나 내용을 한 가지 이상 적어 주세요.');
  const t = readTable_(SHEETS.JOURNAL);
  const ex = t.rows.find(r => String(r.강좌ID) === id && Number(r.회차) === sn);
  const ts = now_();
  const who = limitText_(e.작성자, 30, '작성자') || (ex && ex.작성자) || c.강사 || user.name || user.id;
  // 서명: 보내지 않으면 기존 유지, 빈 값이면 지움(인쇄 후 직접 서명), 그림이면 저장
  const sig = e.작성자서명 === undefined ? (ex ? String(ex.작성자서명 || '') : '') : (String(e.작성자서명) === '' ? '' : pngOk_(e.작성자서명, '작성자'));
  const obj = { 강좌ID: id, 회차: sn, 수업일: day, 주제: topic, 내용: body, 과제: hw, 특이사항: note, 작성자: who, 수정일시: ts, 작성자서명: sig, 참가인원: headN };
  if (ex) { Object.keys(obj).forEach(k => { ex[k] = obj[k]; }); updateRow_(t, ex); } else appendRows_(t, [obj]);
  log_(user, '교육일지저장', `${id} ${sn}회차`);
  return getJournal_(user, id);
}

// ---- 교육일지 사진 (선택, 회차마다 최대 3장. 화면에서 줄여서 보내므로 한 장이 가볍습니다) ----
const PHOTO_MAX = 3, PHOTO_MAX_CHARS = 260000;
function addJournalPhoto(token, courseId, session, data) { return api_(token, user => addJournalPhoto_(user, courseId, session, data), true); }
function deleteJournalPhoto(token, courseId, photoId) { return api_(token, user => deleteJournalPhoto_(user, courseId, photoId), true); }
function getJournalPhotos(token, courseId, session) { return api_(token, user => getJournalPhotos_(user, courseId, session)); }
function addJournalPhoto_(user, courseId, session, data) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID), total = Number(c.총회차) || 0, sn = toInt_(session);
  if (!(sn >= 1 && sn <= total)) fail_(`회차는 1~${total} 사이여야 합니다.`);
  const img = String(data == null ? '' : data);
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(img)) fail_('사진 형식을 확인할 수 없습니다. (JPG, PNG 사진만 올릴 수 있습니다)');
  if (img.length > PHOTO_MAX_CHARS) fail_('사진이 너무 큽니다. 더 작은 사진으로 올려 주세요.');
  const t = readTable_(SHEETS.PHOTOS);
  if (t.rows.filter(r => String(r.강좌ID) === id && Number(r.회차) === sn).length >= PHOTO_MAX) fail_(`사진은 회차마다 ${PHOTO_MAX}장까지 올릴 수 있습니다.`);
  const pid = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  appendRows_(t, [{ 사진ID: pid, 강좌ID: id, 회차: sn, 올린이: user.name || user.id, 올린일시: now_() }]);
  appendRows_(readTable_(SHEETS.PHOTODATA), [{ 사진ID: pid, 강좌ID: id, 회차: sn, 사진: img }]);
  log_(user, '교육일지사진올림', `${id} ${sn}회차`);
  return getJournal_(user, id);
}
function deleteJournalPhoto_(user, courseId, photoId) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID), pid = String(photoId || '').trim();
  const t = readTable_(SHEETS.PHOTOS), r = t.rows.find(x => String(x.사진ID) === pid && String(x.강좌ID) === id);
  if (!r) fail_('사진을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');
  deleteRows_(t, [r._row]);
  const d = readTable_(SHEETS.PHOTODATA), dr = d.rows.filter(x => String(x.사진ID) === pid);
  if (dr.length) deleteRows_(d, dr.map(x => x._row));
  log_(user, '교육일지사진삭제', `${id} ${r.회차}회차`);
  return getJournal_(user, id);
}
function getJournalPhotos_(user, courseId, session) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID), sn = Number(session) || 0;
  return { photos: readTable_(SHEETS.PHOTODATA).rows.filter(r => String(r.강좌ID) === id && (!sn || Number(r.회차) === sn))
    .map(r => ({ 사진ID: String(r.사진ID), 회차: Number(r.회차), 사진: String(r.사진) })) };
}

function tasksCourse_(user, courseId) {
  const c = classCourse_(user, courseId);
  if (isHeadcount_(c)) fail_('인원수만 입력하는 강좌는 과제를 관리하지 않습니다.');
  return c;
}

function getTasks_(user, courseId) {
  const c = tasksCourse_(user, courseId), id = String(c.강좌ID);
  const people = readTable_(SHEETS.PARTICIPANTS).rows.filter(p => String(p.강좌ID) === id && !isDeleted_(p))
    .map(p => ({ 참여자ID: String(p.참여자ID), 이름: p.이름 }));
  const tasks = readTable_(SHEETS.TASKS).rows.filter(r => String(r.강좌ID) === id)
    .map(r => ({ 과제ID: String(r.과제ID), 과제명: r.과제명, 회차: r.회차 === '' || r.회차 == null ? '' : Number(r.회차), 마감일: dateText_(r.마감일), 설명: String(r.설명 || ''), 등록일시: String(r.등록일시 || '') }))
    .sort((a, b) => (Number(a.회차) || 999) - (Number(b.회차) || 999) || String(a.등록일시).localeCompare(String(b.등록일시)));
  const submits = {};
  readTable_(SHEETS.SUBMITS).rows.forEach(r => {
    if (String(r.강좌ID) !== id || r.제출 !== 'O') return;
    (submits[String(r.과제ID)] = submits[String(r.과제ID)] || []).push(String(r.참여자ID));
  });
  return { course: { 강좌ID: id, 강좌명: c.강좌명, 총회차: Number(c.총회차) || 0 }, tasks: tasks, people: people, submits: submits };
}

function saveTask_(user, courseId, task) {
  const c = tasksCourse_(user, courseId), id = String(c.강좌ID), total = Number(c.총회차) || 0;
  const t = task || {};
  const name = limitText_(t.과제명, 60, '과제 이름');
  if (!name) fail_('과제 이름을 입력해 주세요.');
  const desc = limitText_(t.설명, 500, '과제 설명');
  let sn = '';
  if (String(t.회차 == null ? '' : t.회차).trim() !== '') {
    sn = toInt_(t.회차);
    if (!(sn >= 1 && sn <= total)) fail_(`회차는 1~${total} 사이여야 합니다.`);
  }
  const due = String(t.마감일 == null ? '' : t.마감일).trim() === '' ? '' : toDateStr_(t.마감일, '마감일');
  const tt = readTable_(SHEETS.TASKS);
  const tid = String(t.과제ID == null ? '' : t.과제ID).trim();
  if (tid) {
    const ex = tt.rows.find(r => String(r.강좌ID) === id && String(r.과제ID) === tid);
    if (!ex) fail_('과제를 찾을 수 없습니다. 화면을 새로고침해 주세요.');
    ex.과제명 = name; ex.회차 = sn; ex.마감일 = due; ex.설명 = desc;
    updateRow_(tt, ex);
  } else {
    if (tt.rows.filter(r => String(r.강좌ID) === id).length >= 50) fail_('과제는 한 강좌에 50개까지 만들 수 있습니다.');
    appendRows_(tt, [{ 과제ID: 'A' + Utilities.getUuid().replace(/-/g, '').slice(0, 8), 강좌ID: id, 과제명: name, 회차: sn, 마감일: due, 설명: desc, 등록일시: now_() }]);
  }
  log_(user, tid ? '과제수정' : '과제추가', `${id} ${name}`);
  return getTasks_(user, id);
}

function deleteTask_(user, courseId, taskId) {
  const c = tasksCourse_(user, courseId), id = String(c.강좌ID), tid = String(taskId == null ? '' : taskId).trim();
  const tt = readTable_(SHEETS.TASKS);
  const ex = tt.rows.find(r => String(r.강좌ID) === id && String(r.과제ID) === tid);
  if (!ex) fail_('과제를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.');
  const st = readTable_(SHEETS.SUBMITS);
  const subs = st.rows.filter(r => String(r.강좌ID) === id && String(r.과제ID) === tid).map(r => r._row);
  if (subs.length) deleteRows_(st, subs);
  deleteRows_(tt, [ex._row]);
  log_(user, '과제삭제', `${id} ${ex.과제명}`);
  return getTasks_(user, id);
}

// 한 사람의 한 과제 제출 여부를 켜고 끔
function setSubmit_(user, courseId, taskId, pid, on) {
  const c = tasksCourse_(user, courseId), id = String(c.강좌ID), tid = String(taskId == null ? '' : taskId).trim(), p = String(pid == null ? '' : pid).trim();
  if (!readTable_(SHEETS.TASKS).rows.some(r => String(r.강좌ID) === id && String(r.과제ID) === tid)) fail_('과제를 찾을 수 없습니다. 화면을 새로고침해 주세요.');
  if (!readTable_(SHEETS.PARTICIPANTS).rows.some(r => String(r.강좌ID) === id && String(r.참여자ID) === p && !isDeleted_(r))) fail_('명단에 없는 참여자입니다. 화면을 새로고침해 주세요.');
  const st = readTable_(SHEETS.SUBMITS);
  const mine = st.rows.filter(r => String(r.강좌ID) === id && String(r.과제ID) === tid && String(r.참여자ID) === p);
  const want = on === true || on === 'true' || on === 'Y' || on === 'O';
  if (want) {
    if (mine.length) {
      mine.forEach(r => { if (r.제출 !== 'O') { r.제출 = 'O'; r.기록일시 = now_(); r.기록자 = user.id; updateRow_(st, r); } });
    } else appendRows_(st, [{ 강좌ID: id, 과제ID: tid, 참여자ID: p, 제출: 'O', 기록일시: now_(), 기록자: user.id }]);
  } else if (mine.length) deleteRows_(st, mine.map(r => r._row));
  return { 과제ID: tid, 참여자ID: p, 제출: want };
}

// 강사가 직접 정하는 수료 여부. value: 'Y' 수료 / 'N' 미수료 / '' 출석률로 자동
function saveScores_(user, courseId, pid, scores) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID);
  const w = parseWeights_(c);
  if (!w || isHeadcount_(c) || !countsCompletion_(c)) fail_('이 강좌는 항목별 점수로 수료를 판정하지 않습니다.');
  assertEditable_(c.지회명, Number(c.연도), c.시작일);
  const t = readTable_(SHEETS.PARTICIPANTS);
  const p = t.rows.find(r => String(r.강좌ID) === id && String(r.참여자ID) === String(pid) && !isDeleted_(r));
  if (!p) fail_('명단에 없는 참여자입니다. 화면을 새로고침해 주세요.');
  const cur = parsePairs_(p.점수), parts = [];
  SCORE_KEYS.forEach(k => {
    if (k === '출석' || !w[k]) return;
    let v = scores && scores[k] !== undefined ? scores[k] : cur[k];
    if (v === '' || v == null) return;
    v = Number(v);
    if (!(v >= 0 && v <= 100)) fail_(`${k} 점수는 0~100 사이로 입력해 주세요.`);
    parts.push(k + ':' + Math.round(v * 10) / 10);
  });
  p.점수 = parts.join(',');
  updateRow_(t, p);
  recalcCourses_([id]);
  log_(user, '수료점수', `${id}`);
  return getCourseDetail_(user, id);
}
function saveFeeTax_(user, courseId, tax) {
  const c = getCourseOrFail_(courseId).c;
  assertAccess_(user, c.지회명);
  tax = tax || {};
  const ok = v => ['없음', '3.3', '8.8'].indexOf(String(v)) !== -1 ? String(v) : '';
  const t = readTable_(SHEETS.COURSES);
  const row = t.rows.find(r => String(r.강좌ID) === String(c.강좌ID));
  row.강사세율 = ok(tax.강사세율); row.보조세율 = ok(tax.보조세율);
  updateRow_(t, row);
  log_(user, '강사비세율', String(c.강좌ID));
  return getCourseDetail_(user, c.강좌ID);
}
function setCompletion_(user, courseId, pid, value) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID);
  if (isHeadcount_(c) || !countsCompletion_(c)) fail_('수료를 집계하지 않는 강좌입니다.');
  assertEditable_(c.지회명, Number(c.연도), c.시작일);
  const v = String(value == null ? '' : value).trim().toUpperCase();
  if (v !== '' && v !== 'Y' && v !== 'N') fail_('수료 여부 값이 올바르지 않습니다.');
  const t = readTable_(SHEETS.PARTICIPANTS);
  const p = t.rows.find(r => String(r.강좌ID) === id && String(r.참여자ID) === String(pid) && !isDeleted_(r));
  if (!p) fail_('명단에 없는 참여자입니다. 화면을 새로고침해 주세요.');
  if (v === 'N') {   // 이미 수료증을 받은 사람을 미수료로 바꾸는 실수를 막음
    if (readTable_(SHEETS.CERTS).rows.some(r => String(r.강좌ID) === id && String(r.참여자ID) === String(pid))) fail_(`${p.이름}님은 이미 수료증이 발급되어 미수료로 바꿀 수 없습니다.`);
  }
  p.수료확정 = v;
  updateRow_(t, p);
  recalcCourses_([id]);
  log_(user, '수료직접체크', `${id} ${v || '자동'}`);
  return getCourseDetail_(user, id);
}


// ===================== 13-4. 강사 링크 (로그인 없이 출석·일지·과제 입력) =====================
const LINK_GRACE_DAYS = 14;   // 강좌 종료일 + 14일까지만 링크 사용 가능

// ===================== 13-5. 자료 요청 · 회신 (도협회 ↔ 지회 파일 주고받기) =====================
// 파일 자체는 Supabase 저장소에 있고, 여기에는 이름·경로·상태만 둡니다. (저장소 작업은 서버가 맡음)
const FILE_MAX_BYTES = 20 * 1024 * 1024;
const FILE_EXTS = ['hwp', 'hwpx', 'xls', 'xlsx', 'csv', 'doc', 'docx', 'ppt', 'pptx', 'pdf', 'txt', 'zip', 'jpg', 'jpeg', 'png'];
const FILE_MAX_COUNT = 10;

// ===================== 13-10. 파견 교육 (도협회가 학교별 요청 → 지회가 강사 선정·일정 회신 → 확정 시 강좌 자동 생성) =====================
const DISPATCH_CREATE_ = { on: false, id: '', dates: '', memo: '', place: '' };   // 서버가 파견 강좌를 만들 때만 켜는 표시
const DISPATCH_MAX_DATES = 30;
const DISPATCH_CRITERIA = 70;   // 파견 교육 기본 수료 기준(%)
const DISPATCH_MAX_ROUNDS = 2;   // 일정 조율은 최대 2번
function getDispatches(token) { return api_(token, user => getDispatches_(user)); }
function getDispatchBadge(token) { return api_(token, user => getDispatchBadge_(user)); }
function updateDispatchInfo(token, id, data) { return api_(token, user => updateDispatchInfo_(user, id, data), true); }
function saveDispatchBatch(token, list) { return api_(token, user => saveDispatchBatch_(user, list), true); }
function saveDispatch(token, data) { return api_(token, user => saveDispatch_(user, data), true); }
function replyDispatch(token, id, form) { return api_(token, user => replyDispatch_(user, id, form), true); }
function confirmDispatch(token, id) { return api_(token, user => confirmDispatch_(user, id), true); }
function changeDispatchSchedule(token, id, dates) { return api_(token, user => changeDispatchSchedule_(user, id, dates), true); }
function cancelDispatch(token, id, on) { return api_(token, user => cancelDispatch_(user, id, on), true); }
function deleteDispatch(token, id) { return api_(token, user => deleteDispatch_(user, id), true); }

function jsonArr_(v) { try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function feeStateMap_() {   // 강좌ID → 도협회 강사비 확인증 진행 상태 (작성 / 서명대기 / 서명완료)
  const rank = { '작성': 1, '서명대기': 2, '서명완료': 3 }, m = {};
  readTable_(SHEETS.FEECERTS).rows.forEach(r => {
    if (r.지회명 !== HQ) return;
    const st = String(r.상태 || '작성');
    jsonArr_(r.항목).forEach(l => { const id = String(l.강좌ID || ''); if (id && (!m[id] || rank[st] > rank[m[id]])) m[id] = st; });
  });
  return m;
}
function dispatchOut_(r, fee) {
  const cid = String(r.강좌ID || '');
  return { 파견ID: String(r.파견ID), 학교명: String(r.학교명 || ''), 지회명: String(r.지회명 || ''), 담당교사: String(r.담당교사 || ''), 담당교사연락처: String(r.담당교사연락처 || ''),
    장소: String(r.장소 || ''), 일정: jsonArr_(r.일정), 회당시간: Number(r.회당시간) || 0, 회차수: Number(r.회차수) || 0, 수준: String(r.수준 || ''), 출석방식: String(r.출석방식 || '') === '이름' ? '이름' : '인원', 강사비기준: String(r.강사비기준 || ''),
    강사단가: Number(r.강사단가) || 0, 보조강사단가: Number(r.보조강사단가) || 0, 비고: String(r.비고 || ''), 상태: String(r.상태 || '요청'), 차수: Number(r.차수) || 1,
    회신: jsonArr_(r.회신), 강좌ID: cid, 강사비상태: cid ? (fee[cid] || '미작성') : '', 수정일시: String(r.수정일시 || ''), 만든일시: String(r.만든일시 || '') };
}
function getDispatches_(user) {
  const fee = feeStateMap_(), admin = isAdmin_(user);
  const rows = readTable_(SHEETS.DISPATCH).rows.filter(r => String(r.상태) !== '삭제' && (admin || String(r.지회명) === user.chapter));
  return { 관리: admin, 목록: rows.map(r => dispatchOut_(r, fee)).sort((a, b) => a.만든일시 < b.만든일시 ? 1 : -1) };
}
function getDispatchBadge_(user) {
  const rows = readTable_(SHEETS.DISPATCH).rows.filter(r => String(r.상태) !== '삭제');
  return { 개수: rows.filter(r => isAdmin_(user) ? String(r.상태) === '조정필요' : (String(r.지회명) === user.chapter && String(r.상태) === '요청')).length };
}
function parseSchedule_(raw) {
  if (!Array.isArray(raw) || !raw.length) fail_('수업 날짜를 한 개 이상 넣어 주세요.');
  if (raw.length > DISPATCH_MAX_DATES) fail_(`수업 날짜는 ${DISPATCH_MAX_DATES}개까지 넣을 수 있습니다.`);
  const seen = {}, out = [];
  raw.forEach((x, i) => {
    const d = toDateStr_(x && x.일자, `${i + 1}번째 날짜`);
    if (seen[d]) fail_(`${d} 날짜가 두 번 들어 있습니다.`);
    seen[d] = true;
    out.push({ 일자: d, 시간: limitText_(x.시간, 30, '시간') });
  });
  out.sort((a, b) => a.일자 < b.일자 ? -1 : 1);
  return out;
}
function dispatchMoney_(v, label, must) {
  const t = String(v == null ? '' : v).replace(/[,\s원]/g, '');
  if (t === '') { if (must) fail_(`${label}을(를) 입력해 주세요.`); return 0; }
  const n = Number(t);
  if (!(n >= 0 && n <= 100000000)) fail_(`${label}은(는) 0 이상의 숫자로 입력해 주세요.`);
  if (must && !(n > 0)) fail_(`${label}을(를) 입력해 주세요.`);
  return Math.round(n);
}
function saveDispatchBatch_(user, list) {   // 여러 건을 한꺼번에 요청 (하나라도 틀리면 아무것도 저장하지 않음)
  requireAdmin_(user);
  if (!Array.isArray(list) || !list.length) fail_('요청할 줄이 없습니다.');
  if (list.length > 100) fail_('한 번에 100건까지 보낼 수 있습니다.');
  let out = null;
  list.forEach((d, i) => {
    try { out = saveDispatch_(user, Object.assign({}, d, { 파견ID: '', 재요청: false })); }
    catch (e) { if (e && e.userError) e.message = `${i + 1}번째 줄 (${String((d && d.학교명) || '')}): ${e.message}`; throw e; }
  });
  out.등록건수 = list.length;
  return out;
}
function saveDispatch_(user, data) {
  requireAdmin_(user);
  data = data || {};
  const school = clean_(data.학교명, 60, '학교명');
  if (!school) fail_('학교 이름을 입력해 주세요.');
  const chapter = String(data.지회명 || '').trim();
  if (chapterList_().indexOf(chapter) === -1) fail_('담당 지회를 선택해 주세요.');
  const teacher = limitText_(data.담당교사, 30, '담당 선생님'), phone = normPhone_(data.담당교사연락처);
  if (!teacher) fail_('학교 담당 선생님 이름을 입력해 주세요.');
  if (!phone) fail_('학교 담당 선생님 연락처를 입력해 주세요.');
  const place = limitText_(data.장소, 100, '장소');
  if (!place) fail_('교육 장소를 입력해 주세요.');
  const dates = parseSchedule_(data.일정);
  const hours = toNum_(data.회당시간);
  if (!(hours > 0 && hours <= 12)) fail_('회당 강의시간은 0보다 크고 12시간 이하로 입력해 주세요. (예: 1.5)');
  const level = String(data.수준 || '').trim();
  if (LEVELS.indexOf(level) === -1) fail_('수준(초급 / 특강 등)을 선택해 주세요.');
  const mode = String(data.출석방식 || '인원') === '이름' ? '이름' : '인원';
  const basis = String(data.강사비기준 || '').trim();
  if (basis !== '시간' && basis !== '회') fail_('강사비 기준(시간당 / 회당)을 선택해 주세요.');
  const rate = dispatchMoney_(data.강사단가, '강사 단가', true), rate2 = dispatchMoney_(data.보조강사단가, '보조강사 단가', false);
  const memo = limitText_(data.비고, 500, '비고');
  const t = readTable_(SHEETS.DISPATCH), ts = now_(), editId = String(data.파견ID || '').trim();
  const body = { 학교명: school, 지회명: chapter, 담당교사: teacher, 담당교사연락처: phone, 장소: place, 일정: JSON.stringify(dates), 회당시간: hours, 회차수: dates.length, 수준: level, 출석방식: mode, 강사비기준: basis, 강사단가: rate, 보조강사단가: rate2, 비고: memo, 수정일시: ts };
  if (editId) {
    const r = t.rows.find(x => String(x.파견ID) === editId && x.상태 !== '삭제');
    if (!r) fail_('파견 요청을 찾을 수 없습니다.');
    if (String(r.상태) === '확정') fail_('이미 확정되어 강좌가 만들어졌습니다. 날짜나 강사는 강좌에서 고쳐 주세요.');
    if (String(r.상태) === '취소') fail_('취소된 요청입니다. 다시 요청하려면 새 요청을 만들어 주세요.');
    if (chapter !== String(r.지회명) && jsonArr_(r.회신).length) fail_('지회가 이미 회신해서 담당 지회를 바꿀 수 없습니다.');
    if (data.재요청 === true) {
      if (String(r.상태) !== '조정필요') fail_('지회가 "조정 필요"로 회신한 요청만 다시 요청할 수 있습니다.');
      if ((Number(r.차수) || 1) >= DISPATCH_MAX_ROUNDS) fail_(`일정 조율은 ${DISPATCH_MAX_ROUNDS}번까지입니다. 도협회가 직접 협의해서 "이 일정으로 확정"하거나 취소해 주세요.`);
      body.상태 = '요청'; body.차수 = (Number(r.차수) || 1) + 1;
    }
    Object.assign(r, body);
    updateRow_(t, r);
    log_(user, data.재요청 === true ? '파견재요청' : '파견수정', `${editId} ${school}`);
  } else {
    const id = 'D' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    appendRows_(t, [Object.assign({ 파견ID: id, 상태: '요청', 차수: 1, 회신: '[]', 강좌ID: '', 만든이: user.name || user.id, 만든일시: ts }, body)]);
    log_(user, '파견요청', `${id} ${school} ${chapter}`);
  }
  return getDispatches_(user);
}
function dispatchRow_(id) {
  const t = readTable_(SHEETS.DISPATCH), r = t.rows.find(x => String(x.파견ID) === String(id) && x.상태 !== '삭제');
  if (!r) fail_('파견 요청을 찾을 수 없습니다.');
  return { t: t, r: r };
}
function makeDispatchCourse_(user, r, teacher, assistant) {
  const dates = jsonArr_(r.일정);
  const text = dates.map(x => x.일자 + (x.시간 ? ' ' + x.시간 : '')).join(', ');
  const pseudo = { id: user.id, name: user.name, role: ROLE_ADMIN }, nameMode = String(r.출석방식 || '') === '이름';
  DISPATCH_CREATE_.on = true; DISPATCH_CREATE_.id = String(r.파견ID); DISPATCH_CREATE_.dates = text; DISPATCH_CREATE_.memo = String(r.비고 || ''); DISPATCH_CREATE_.place = String(r.장소 || '');
  try {
    const det = saveCourse_(pseudo, { 지회명: r.지회명, 강좌명: `${r.학교명} 수어교육`, 시작일: dates[0].일자, 종료일: dates[dates.length - 1].일자, 총회차: dates.length, 회당시간: Number(r.회당시간),
      수준: r.수준, 교육구분: '외부', 주관: '센터', 인원만입력: nameMode ? '' : 'Y', 수료집계: nameMode ? 'Y' : 'N', 확인서필요: 'Y', 강사: teacher, 보조강사: assistant, 강사비기준: r.강사비기준, 수료기준: DISPATCH_CRITERIA,
      강사비단가: Number(r.강사단가) || '', 보조강사비단가: Number(r.보조강사단가) || '', 기관명: String(r.학교명).slice(0, 60) });
    return String(det.course.강좌ID);
  } finally { DISPATCH_CREATE_.on = false; DISPATCH_CREATE_.id = ''; DISPATCH_CREATE_.dates = ''; DISPATCH_CREATE_.memo = ''; DISPATCH_CREATE_.place = ''; }
}
function replyDispatch_(user, id, form) {
  if (isAdmin_(user)) fail_('회신은 해당 지회가 합니다.', 'FORBIDDEN');
  const x = dispatchRow_(id), r = x.r;
  if (String(r.지회명) !== user.chapter) fail_('이 요청에 접근할 수 없습니다.', 'FORBIDDEN');
  if (String(r.상태) !== '요청') fail_('지금은 회신할 수 없는 상태입니다. (이미 회신했거나 확정·취소된 요청)');
  form = form || {};
  const result = form.결과 === '가능' ? '가능' : form.결과 === '조정필요' ? '조정필요' : '';
  if (!result) fail_('"가능" 또는 "조정 필요"를 선택해 주세요.');
  const teacher = limitText_(form.강사, 30, '강사'), assistant = limitText_(form.보조강사, 30, '보조강사');
  const wish = limitText_(form.희망일, 200, '희망 날짜'), why = limitText_(form.사유, 500, '사유'), memo = limitText_(form.메모, 500, '메모');
  if (result === '가능' && !teacher) fail_('강사 이름을 입력해 주세요.');
  if (result === '조정필요' && !wish && !why) fail_('원하는 날짜나 사유를 적어 주세요.');
  const list = jsonArr_(r.회신);
  list.push({ 차수: Number(r.차수) || 1, 결과: result, 강사: teacher, 보조강사: assistant, 희망일: wish, 사유: why, 메모: memo, 일시: now_(), 작성자: user.name || user.id });
  r.회신 = JSON.stringify(list); r.수정일시 = now_();
  if (result === '가능') { r.강좌ID = makeDispatchCourse_(user, r, teacher, assistant); r.상태 = '확정'; }
  else r.상태 = '조정필요';
  updateRow_(x.t, r);
  log_(user, '파견회신', `${id} ${result}`);
  return getDispatches_(user);
}
function confirmDispatch_(user, id) {
  requireAdmin_(user);
  const x = dispatchRow_(id), r = x.r;
  if (String(r.상태) !== '조정필요') fail_('지회가 "조정 필요"로 회신한 요청만 직접 확정할 수 있습니다.');
  const list = jsonArr_(r.회신), last = list[list.length - 1] || {};
  if (!String(last.강사 || '').trim()) fail_('지회가 강사를 적지 않았습니다. 강사가 정해진 뒤에 확정해 주세요.');
  r.강좌ID = makeDispatchCourse_(user, r, String(last.강사), String(last.보조강사 || ''));
  list.push({ 차수: Number(r.차수) || 1, 결과: '도협회확정', 강사: String(last.강사), 보조강사: String(last.보조강사 || ''), 희망일: '', 사유: '', 메모: '', 일시: now_(), 작성자: user.name || user.id });
  r.회신 = JSON.stringify(list); r.상태 = '확정'; r.수정일시 = now_();
  updateRow_(x.t, r);
  log_(user, '파견직접확정', String(id));
  return getDispatches_(user);
}
function inqAutoPost_(user, r, text) {   // 도협회가 바꾼 내용을 해당 지회의 문의함에 자동으로 알림
  const t = readTable_(SHEETS.INQUIRIES), ts = inqNow_();
  const th = t.rows.find(q => String(q.파견ID) === String(r.파견ID) && String(q.지회명) === String(r.지회명) && q.상태 !== '삭제' && q.상태 !== '해결');
  const post = { 쪽: '도협회', 작성자: user.name || user.id, 내용: text, 일시: ts };
  if (th) {
    const posts = jsonArr_(th.글); posts.push(post);
    Object.assign(th, { 글: JSON.stringify(posts), 마지막쪽: '도협회', 마지막일시: ts, 도협회확인: ts, 수정일시: ts });
    updateRow_(t, th);
  } else {
    appendRows_(t, [{ 문의ID: 'Q' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(), 지회명: r.지회명, 제목: '[파견] ' + String(r.학교명) + ' 변경 안내', 강좌ID: String(r.강좌ID || ''), 파견ID: String(r.파견ID),
      상태: '진행', 글: JSON.stringify([post]), 지회확인: '', 도협회확인: ts, 마지막쪽: '도협회', 마지막일시: ts, 만든일시: ts, 수정일시: ts }]);
  }
}
function updateDispatchInfo_(user, id, data) {   // 확정 뒤에도 장소·담당 선생님·비고·회당 시간·강사비 단가를 고침 (도협회만)
  requireAdmin_(user);
  data = data || {};
  const x = dispatchRow_(id), r = x.r;
  if (String(r.상태) !== '확정' || !String(r.강좌ID || '')) fail_('확정된 요청만 여기서 고칠 수 있습니다. (확정 전에는 요청 화면의 수정을 쓰세요)');
  const next = {
    장소: limitText_(data.장소, 100, '장소'), 담당교사: limitText_(data.담당교사, 30, '담당 선생님'), 담당교사연락처: normPhone_(data.담당교사연락처),
    비고: limitText_(data.비고, 500, '비고'), 회당시간: toNum_(data.회당시간), 강사비기준: String(data.강사비기준 || '').trim(),
    강사단가: dispatchMoney_(data.강사단가, '강사 단가', true), 보조강사단가: dispatchMoney_(data.보조강사단가, '보조강사 단가', false) };
  if (!next.장소) fail_('교육 장소를 입력해 주세요.');
  if (!next.담당교사) fail_('학교 담당 선생님 이름을 입력해 주세요.');
  if (!next.담당교사연락처) fail_('학교 담당 선생님 연락처를 입력해 주세요.');
  if (!(next.회당시간 > 0 && next.회당시간 <= 12)) fail_('회당 강의시간은 0보다 크고 12시간 이하로 입력해 주세요.');
  if (next.강사비기준 !== '시간' && next.강사비기준 !== '회') fail_('강사비 기준(시간당 / 회당)을 선택해 주세요.');
  const cid = String(r.강좌ID), lines = [];
  const money = { 회당시간: Number(r.회당시간), 강사비기준: String(r.강사비기준), 강사단가: Number(r.강사단가), 보조강사단가: Number(r.보조강사단가) || 0 };
  const moneyChanged = Object.keys(money).some(k => money[k] !== (typeof money[k] === 'number' ? Number(next[k]) || 0 : next[k]));
  if (moneyChanged && feeStateMap_()[cid] === '서명완료') fail_('강사비 확인증이 이미 서명되어 회당 시간·강사비를 바꿀 수 없습니다. 서명을 지운 뒤 바꿔 주세요.');
  const diff = (label, a, b) => { if (String(a) !== String(b)) lines.push(`${label}: ${a || '(없음)'} → ${b || '(없음)'}`); };
  diff('장소', r.장소, next.장소); diff('학교 담당 선생님', r.담당교사, next.담당교사); diff('담당 선생님 연락처', r.담당교사연락처, next.담당교사연락처);
  diff('비고', r.비고, next.비고); diff('회당 시간', r.회당시간, next.회당시간);
  diff('강사비 기준', r.강사비기준 === '시간' ? '시간당' : '회당', next.강사비기준 === '시간' ? '시간당' : '회당');
  diff('강사 단가', r.강사단가, next.강사단가); diff('보조강사 단가', r.보조강사단가 || 0, next.보조강사단가);
  if (!lines.length) fail_('바뀐 내용이 없습니다.');
  const t = readTable_(SHEETS.COURSES), c = t.rows.find(q => String(q.강좌ID) === cid);
  if (!c || c.상태 === '삭제') fail_('연결된 강좌를 찾을 수 없습니다. 삭제되었을 수 있습니다.');
  assertEditable_(c.지회명, Number(c.연도), c.시작일);
  Object.assign(c, { 회당시간: next.회당시간, 강사비기준: next.강사비기준, 강사비단가: next.강사단가, 보조강사비단가: next.보조강사단가, 파견비고: next.비고, 파견장소: next.장소, 수정일시: now_() });
  updateRow_(t, c);
  recalcCourses_([cid]);
  Object.assign(r, { 장소: next.장소, 담당교사: next.담당교사, 담당교사연락처: next.담당교사연락처, 비고: next.비고, 회당시간: next.회당시간, 강사비기준: next.강사비기준, 강사단가: next.강사단가, 보조강사단가: next.보조강사단가, 수정일시: now_() });
  const list = jsonArr_(r.회신); list.push({ 차수: Number(r.차수) || 1, 결과: '내용변경', 강사: '', 보조강사: '', 희망일: '', 사유: '', 메모: lines.join('\n'), 일시: now_(), 작성자: user.name || user.id });
  r.회신 = JSON.stringify(list);
  updateRow_(x.t, r);
  inqAutoPost_(user, r, '도협회가 파견 내용을 바꿨습니다.\n' + lines.join('\n'));
  log_(user, '파견내용변경', `${id} ${lines.join(' / ')}`);
  const out = getDispatches_(user);
  out.안내 = feeStateMap_()[cid] ? '이미 만든 강사비 확인증(서명 전)에는 바뀐 단가가 자동으로 반영되지 않습니다. 확인증을 열어 확인해 주세요.' : '';
  return out;
}
function changeDispatchSchedule_(user, id, rawDates) {   // 확정 뒤 날짜 변경: 요청·강좌 기간/회차·예정일을 함께 고침 (도협회만)
  requireAdmin_(user);
  const x = dispatchRow_(id), r = x.r;
  if (String(r.상태) !== '확정' || !String(r.강좌ID || '')) fail_('확정된 요청만 일정을 바꿀 수 있습니다.');
  const dates = parseSchedule_(rawDates), cid = String(r.강좌ID);
  if (feeStateMap_()[cid] === '서명완료') fail_('강사비 확인증이 이미 서명되어 일정을 바꿀 수 없습니다. 서명을 지운 뒤 바꿔 주세요.');
  const t = readTable_(SHEETS.COURSES), c = t.rows.find(q => String(q.강좌ID) === cid);
  if (!c || c.상태 === '삭제') fail_('연결된 강좌를 찾을 수 없습니다. 삭제되었을 수 있습니다.');
  assertEditable_(c.지회명, Number(c.연도), c.시작일);
  const start = dates[0].일자, end = dates[dates.length - 1].일자;
  assertEditable_(c.지회명, Number(start.slice(0, 4)), start);
  const maxRec = maxRecordedSession_(cid);
  if (dates.length < maxRec) fail_(`이미 ${maxRec}회차까지 인원이 기록되어 있어 ${dates.length}회로 줄일 수 없습니다.`);
  const text = dates.map(d => d.일자 + (d.시간 ? ' ' + d.시간 : '')).join(', ');
  Object.assign(c, { 연도: Number(start.slice(0, 4)), 반기: halfOf_(start), 시작일: start, 종료일: end, 총회차: dates.length, 예정일: text, 수정일시: now_() });
  updateRow_(t, c);
  recalcCourses_([cid]);
  r.일정 = JSON.stringify(dates); r.회차수 = dates.length; r.수정일시 = now_();
  const list = jsonArr_(r.회신); list.push({ 차수: Number(r.차수) || 1, 결과: '일정변경', 강사: '', 보조강사: '', 희망일: '', 사유: '', 메모: text, 일시: now_(), 작성자: user.name || user.id });
  r.회신 = JSON.stringify(list);
  updateRow_(x.t, r);
  inqAutoPost_(user, r, '도협회가 교육 일정을 바꿨습니다.\n새 일정: ' + text);
  log_(user, '파견일정변경', `${id} ${text}`);
  const out = getDispatches_(user);
  out.안내 = feeStateMap_()[cid] ? '이미 만든 강사비 확인증(서명 전)의 일시는 자동으로 바뀌지 않습니다. 확인증을 열어 일시를 확인해 주세요.' : '';
  return out;
}
function cancelDispatch_(user, id, on) {
  requireAdmin_(user);
  const x = dispatchRow_(id), r = x.r, yes = on === true || String(on) === 'true';
  if (String(r.상태) === '확정') fail_('이미 확정되어 강좌가 만들어졌습니다. 취소하려면 강좌를 삭제해 주세요.');
  if (yes) { if (String(r.상태) === '취소') return getDispatches_(user); r.상태 = '취소'; }
  else { if (String(r.상태) !== '취소') return getDispatches_(user); r.상태 = jsonArr_(r.회신).length ? '조정필요' : '요청'; }
  r.수정일시 = now_();
  updateRow_(x.t, r);
  log_(user, yes ? '파견취소' : '파견취소해제', String(id));
  return getDispatches_(user);
}
function deleteDispatch_(user, id) {
  requireAdmin_(user);
  const x = dispatchRow_(id), r = x.r;
  if (String(r.상태) === '확정') fail_('이미 확정되어 강좌가 만들어졌습니다. 삭제할 수 없습니다.');
  r.상태 = '삭제'; r.수정일시 = now_();
  updateRow_(x.t, r);
  log_(user, '파견삭제', String(id));
  return getDispatches_(user);
}

// ===================== 13-9. 공지사항 (도협회가 올리면 대상 지회 화면 맨 위에 계속 표시) =====================
function getInquiries(token) { return api_(token, user => getInquiries_(user)); }
function openInquiry(token, id) { return api_(token, user => openInquiry_(user, id), true); }
function saveInquiry(token, data) { return api_(token, user => saveInquiry_(user, data), true); }
function replyInquiry(token, id, text) { return api_(token, user => replyInquiry_(user, id, text), true); }
function setInquiryStatus(token, id, done) { return api_(token, user => setInquiryStatus_(user, id, done), true); }
function getInquiryBadge(token) { return api_(token, user => getInquiryBadge_(user)); }
function getNotices(token) { return api_(token, user => getNotices_(user)); }
function saveNotice(token, data) { return api_(token, user => saveNotice_(user, data), true); }
function setNoticeStatus(token, id, on) { return api_(token, user => setNoticeStatus_(user, id, on), true); }
function deleteNotice(token, id) { return api_(token, user => deleteNotice_(user, id), true); }

function noticeState_(r) {   // 게시중 / 예약 / 기간종료 / 내림
  if (String(r.상태) !== '게시') return '내림';
  const a = dateText_(r.시작일), b = dateText_(r.종료일), t = today_();
  if (a && t < a) return '예약';
  if (b && t > b) return '기간종료';
  return '게시중';
}
function noticeOut_(r) {
  return { 공지ID: String(r.공지ID), 제목: String(r.제목 || ''), 내용: String(r.내용 || ''), 대상: String(r.대상 || '전체'), 시작일: dateText_(r.시작일), 종료일: dateText_(r.종료일),
    상태: noticeState_(r), 등록자: String(r.등록자 || ''), 등록일시: String(r.등록일시 || ''), 수정일시: String(r.수정일시 || '') };
}
/* ---------- 문의 (지회 ↔ 도협회): 글 주고받기 + 확인(읽음) 표시 ---------- */
function inqNow_() { return now_() + '.' + ('00' + (new Date().getMilliseconds())).slice(-3); }   // 같은 초에 오간 글도 순서를 구분
function inqSide_(user) { return isAdmin_(user) ? '도협회' : '지회'; }
function inqRow_(user, id) {
  const t = readTable_(SHEETS.INQUIRIES), r = t.rows.find(x => String(x.문의ID) === String(id) && x.상태 !== '삭제');
  if (!r) fail_('문의를 찾을 수 없습니다.');
  if (!isAdmin_(user) && String(r.지회명) !== user.chapter) fail_('이 문의에 접근할 수 없습니다.', 'FORBIDDEN');
  return { t: t, r: r };
}
function inqUnread_(r, side) {   // 상대가 마지막 글을 썼고, 내가 그 뒤로 열어 보지 않았으면 새 글
  const last = String(r.마지막일시 || '');
  if (!last || String(r.마지막쪽) === side) return false;
  return String(side === '도협회' ? r.도협회확인 : r.지회확인 || '') < last;
}
function inqOut_(r, side, names) {
  const posts = jsonArr_(r.글), last = String(r.마지막일시 || ''), other = side === '도협회' ? '지회' : '도협회';
  const seenOther = String(other === '도협회' ? r.도협회확인 : r.지회확인) || '';
  const mine = String(r.마지막쪽) === side;
  return { 문의ID: String(r.문의ID), 지회명: String(r.지회명), 제목: String(r.제목), 강좌ID: String(r.강좌ID || ''), 파견ID: String(r.파견ID || ''),
    관련: names[String(r.강좌ID || '')] || names['D' + String(r.파견ID || '')] || '', 상태: String(r.상태), 글: posts,
    마지막쪽: String(r.마지막쪽 || ''), 마지막일시: last, 새글: inqUnread_(r, side),
    상대확인: mine && last ? (seenOther >= last ? seenOther : '') : '', 내글: mine, 만든일시: String(r.만든일시) };
}
function inqNames_() {
  const m = {};
  try { readTable_(SHEETS.COURSES).rows.forEach(c => { m[String(c.강좌ID)] = String(c.강좌명 || ''); }); } catch (e) {}
  try { readTable_(SHEETS.DISPATCH).rows.forEach(d => { m['D' + String(d.파견ID)] = '파견 · ' + String(d.학교명 || ''); }); } catch (e) {}
  return m;
}
function getInquiries_(user) {
  const side = inqSide_(user), names = inqNames_();
  const rows = readTable_(SHEETS.INQUIRIES).rows.filter(r => r.상태 !== '삭제' && (side === '도협회' || String(r.지회명) === user.chapter));
  rows.sort((a, b) => String(b.마지막일시).localeCompare(String(a.마지막일시)));
  return { 목록: rows.map(r => inqOut_(r, side, names)), 쪽: side };
}
function getInquiryBadge_(user) {
  const side = inqSide_(user);
  return { 개수: readTable_(SHEETS.INQUIRIES).rows.filter(r => r.상태 !== '삭제' && r.상태 !== '해결' && (side === '도협회' || String(r.지회명) === user.chapter) && inqUnread_(r, side)).length };
}
function openInquiry_(user, id) {   // 열어 보면 '확인함'으로 기록
  const x = inqRow_(user, id), side = inqSide_(user), ts = inqNow_();
  if (inqUnread_(x.r, side) || !String(side === '도협회' ? x.r.도협회확인 : x.r.지회확인)) {
    if (side === '도협회') x.r.도협회확인 = ts; else x.r.지회확인 = ts;
    updateRow_(x.t, x.r);
  }
  return getInquiries_(user);
}
function saveInquiry_(user, data) {   // 새 문의 (지회가 도협회에게)
  if (isAdmin_(user)) fail_('문의는 지회에서 보냅니다. 도협회는 받은 문의에 답해 주세요.', 'FORBIDDEN');
  data = data || {};
  const body = limitText_(data.내용, 1000, '내용');
  if (!body) fail_('내용을 적어 주세요.');
  let cid = String(data.강좌ID || '').trim(), did = String(data.파견ID || '').trim(), title = clean_(data.제목, 100, '제목');
  if (cid) { const c = readTable_(SHEETS.COURSES).rows.find(q => String(q.강좌ID) === cid && q.상태 !== '삭제'); if (!c || String(c.지회명) !== user.chapter) fail_('강좌를 찾을 수 없습니다.'); if (!title) title = String(c.강좌명) + ' 문의'; }
  if (did) { const d = readTable_(SHEETS.DISPATCH).rows.find(q => String(q.파견ID) === did && q.상태 !== '삭제'); if (!d || String(d.지회명) !== user.chapter) fail_('파견 요청을 찾을 수 없습니다.'); if (!title) title = '[파견] ' + String(d.학교명) + ' 문의'; }
  if (!title) title = body.split('\n')[0].slice(0, 40);
  const t = readTable_(SHEETS.INQUIRIES), ts = inqNow_(), id = 'Q' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
  appendRows_(t, [{ 문의ID: id, 지회명: user.chapter, 제목: title, 강좌ID: cid, 파견ID: did, 상태: '진행', 글: JSON.stringify([{ 쪽: '지회', 작성자: user.name || user.id, 내용: body, 일시: ts }]),
    지회확인: ts, 도협회확인: '', 마지막쪽: '지회', 마지막일시: ts, 만든일시: ts, 수정일시: ts }]);
  log_(user, '문의등록', id);
  return getInquiries_(user);
}
function replyInquiry_(user, id, text) {
  const x = inqRow_(user, id), r = x.r, side = inqSide_(user);
  const body = limitText_(text, 1000, '내용');
  if (!body) fail_('내용을 적어 주세요.');
  const posts = jsonArr_(r.글);
  if (posts.length >= 200) fail_('글이 너무 많습니다. 새 문의로 이어서 써 주세요.');
  const ts = inqNow_();
  posts.push({ 쪽: side, 작성자: user.name || user.id, 내용: body, 일시: ts });
  r.글 = JSON.stringify(posts); r.마지막쪽 = side; r.마지막일시 = ts; r.수정일시 = ts; r.상태 = '진행';
  if (side === '도협회') r.도협회확인 = ts; else r.지회확인 = ts;
  updateRow_(x.t, r);
  log_(user, '문의글', String(id));
  return getInquiries_(user);
}
function setInquiryStatus_(user, id, done) {
  const x = inqRow_(user, id);
  x.r.상태 = done ? '해결' : '진행'; x.r.수정일시 = now_();
  updateRow_(x.t, x.r);
  log_(user, done ? '문의해결' : '문의재개', String(id));
  return getInquiries_(user);
}
function getNotices_(user) {
  const rows = readTable_(SHEETS.NOTICES).rows.filter(r => String(r.상태) !== '삭제');
  if (isAdmin_(user)) return { 관리: true, 목록: rows.map(noticeOut_).sort((a, b) => b.등록일시 < a.등록일시 ? -1 : 1) };
  const ch = user.chapter;
  return { 관리: false, 목록: rows.map(noticeOut_).filter(n => n.상태 === '게시중' && (n.대상 === '전체' || n.대상.split(',').some(x => x.replace(/\s+/g, '') === String(ch).replace(/\s+/g, ''))))
    .sort((a, b) => b.등록일시 < a.등록일시 ? -1 : 1).map(n => ({ 공지ID: n.공지ID, 제목: n.제목, 내용: n.내용, 등록일시: n.등록일시 })) };
}
function saveNotice_(user, data) {
  requireAdmin_(user);
  data = data || {};
  const title = clean_(data.제목, 100, '제목');
  if (!title) fail_('제목을 입력해 주세요.');
  const body = limitText_(data.내용, 2000, '내용');
  if (!String(body).trim()) fail_('내용을 입력해 주세요.');
  const rawA = String(data.시작일 == null ? '' : data.시작일).trim(), rawB = String(data.종료일 == null ? '' : data.종료일).trim();
  const a = rawA ? toDateStr_(rawA, '시작일') : '', b = rawB ? toDateStr_(rawB, '종료일') : '';
  if (a && b && b < a) fail_('종료일이 시작일보다 앞입니다.');
  let target = '전체';
  if (Array.isArray(data.대상) && data.대상.length && data.대상.indexOf('전체') === -1) {
    const all = chapterList_(), pick = data.대상.map(x => String(x).trim()).filter(x => all.indexOf(x) !== -1);
    if (!pick.length) fail_('대상 지회를 한 곳 이상 고르세요.');
    target = pick.join(',');
  }
  const t = readTable_(SHEETS.NOTICES), ts = now_(), editId = String(data.공지ID || '').trim();
  if (editId) {
    const r = t.rows.find(x => String(x.공지ID) === editId && x.상태 !== '삭제');
    if (!r) fail_('공지를 찾을 수 없습니다.');
    Object.assign(r, { 제목: title, 내용: body, 대상: target, 시작일: a, 종료일: b, 수정일시: ts });
    updateRow_(t, r);
    log_(user, '공지수정', editId);
  } else {
    const id = 'N' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    appendRows_(t, [{ 공지ID: id, 제목: title, 내용: body, 대상: target, 시작일: a, 종료일: b, 상태: '게시', 등록자: user.name || user.id, 등록일시: ts, 수정일시: ts }]);
    log_(user, '공지등록', id);
  }
  return getNotices_(user);
}
function setNoticeStatus_(user, id, on) {
  requireAdmin_(user);
  const t = readTable_(SHEETS.NOTICES), r = t.rows.find(x => String(x.공지ID) === String(id) && x.상태 !== '삭제');
  if (!r) fail_('공지를 찾을 수 없습니다.');
  const yes = on === true || String(on) === 'true';
  r.상태 = yes ? '게시' : '내림'; r.수정일시 = now_();
  updateRow_(t, r);
  log_(user, yes ? '공지게시' : '공지내림', String(id));
  return getNotices_(user);
}
function deleteNotice_(user, id) {
  requireAdmin_(user);
  const t = readTable_(SHEETS.NOTICES), r = t.rows.find(x => String(x.공지ID) === String(id) && x.상태 !== '삭제');
  if (!r) fail_('공지를 찾을 수 없습니다.');
  r.상태 = '삭제'; r.수정일시 = now_();
  updateRow_(t, r);
  log_(user, '공지삭제', String(id));
  return getNotices_(user);
}

function listRequests(token) { return api_(token, user => listRequests_(user)); }
function getRequest(token, requestId) { return api_(token, user => getRequest_(user, requestId)); }
function saveRequest(token, data) { return api_(token, user => saveRequest_(user, data), true); }
function deleteRequest(token, requestId) { return api_(token, user => deleteRequest_(user, requestId), true); }
function deleteRequestPaths(token, requestId) { return api_(token, user => deleteRequestPaths_(user, requestId)); }
function fileUploadPrep(token, requestId, kind, chapter, name, size) { return api_(token, user => fileUploadPrep_(user, requestId, kind, chapter, name, size), true); }
function fileUploadDone(token, fileId) { return api_(token, user => fileUploadDone_(user, fileId), true); }
function fileDownloadPrep(token, fileId) { return api_(token, user => fileDownloadPrep_(user, fileId)); }
function deleteFile(token, fileId) { return api_(token, user => deleteFile_(user, fileId), true); }
function deleteFilePaths(token, fileId) { return api_(token, user => deleteFilePaths_(user, fileId)); }
function saveReply(token, requestId, memo) { return api_(token, user => saveReply_(user, requestId, memo), true); }
function submitReply(token, requestId, on) { return api_(token, user => submitReply_(user, requestId, on), true); }
function rejectReply(token, requestId, chapter, reason) { return api_(token, user => rejectReply_(user, requestId, chapter, reason), true); }
function deleteReplyFiles(token, requestId, chapter) { return api_(token, user => deleteReplyFiles_(user, requestId, chapter), true); }
function deleteReplyPaths(token, requestId, chapter) { return api_(token, user => deleteReplyPaths_(user, requestId, chapter)); }

function reqRow_(requestId) {
  const id = String(requestId == null ? '' : requestId).trim();
  const r = readTable_(SHEETS.REQUESTS).rows.find(x => String(x.요청ID) === id && x.상태 !== '삭제');
  if (!r) fail_('요청을 찾을 수 없습니다. 삭제되었을 수 있습니다.');
  return r;
}
function reqTargets_(r) {
  const t = String(r.대상 || '').trim();
  if (!t || t === '전체') return chapterList_();
  const all = chapterList_();
  return t.split(',').map(x => x.trim()).filter(x => x && all.indexOf(x) !== -1);
}
function reqChapter_(user, r, chapter) {   // 지회: 자기 지회 / 도협회: 지정한 지회
  const ch = isAdmin_(user) ? String(chapter || '').trim() : user.chapter;
  if (!ch) fail_('지회를 선택해 주세요.');
  if (reqTargets_(r).indexOf(ch) === -1) fail_('이 요청의 대상 지회가 아닙니다.', 'FORBIDDEN');
  return ch;
}
function fileOut_(f) { return { 파일ID: String(f.파일ID), 파일명: String(f.파일명), 크기: Number(f.크기) || 0, 올린일시: String(f.올린일시), 올린이: String(f.올린이 || '') }; }
function doneFiles_() { return readTable_(SHEETS.FILES).rows.filter(f => f.상태 === '완료'); }
function replyRow_(requestId, chapter) {
  return readTable_(SHEETS.REPLIES).rows.find(x => String(x.요청ID) === String(requestId) && String(x.지회명) === chapter) || null;
}
function replyOut_(rp, files) {
  rp = rp || {};
  return { 상태: String(rp.상태 || ''), 메모: String(rp.메모 || ''), 제출일시: String(rp.제출일시 || ''), 반려사유: String(rp.반려사유 || ''), 확인일시: String(rp.확인일시 || ''), 파일: files.map(fileOut_) };
}
function reqOut_(r) {
  const dl = dateText_(r.마감일);
  return { 요청ID: String(r.요청ID), 제목: String(r.제목), 설명: String(r.설명 || ''), 마감일: dl, 마감지남: !!dl && today_() > dl, 대상: String(r.대상 || '전체'), 상태: String(r.상태 || '진행'), 등록일시: String(r.등록일시) };
}

function listRequests_(user) {
  const reqs = readTable_(SHEETS.REQUESTS).rows.filter(r => r.상태 !== '삭제');
  const replies = readTable_(SHEETS.REPLIES).rows;
  const admin = isAdmin_(user);
  const out = [];
  reqs.forEach(r => {
    const targets = reqTargets_(r);
    if (!admin && targets.indexOf(user.chapter) === -1) return;
    const o = reqOut_(r), mine = replies.filter(x => String(x.요청ID) === o.요청ID);
    if (admin) {
      o.대상수 = targets.length;
      o.제출수 = targets.filter(ch => mine.some(x => String(x.지회명) === ch && (x.상태 === '제출'))).length;
      o.미제출 = targets.filter(ch => !mine.some(x => String(x.지회명) === ch && x.상태 === '제출'));
    } else {
      const m = mine.find(x => String(x.지회명) === user.chapter);
      o.내상태 = m ? String(m.상태 || '') : '';
      o.확인일시 = m ? String(m.확인일시 || '') : '';
    }
    out.push(o);
  });
  out.sort((a, b) => (a.상태 === '종료') - (b.상태 === '종료') || String(b.등록일시).localeCompare(String(a.등록일시)));
  return { requests: out };
}
function getRequest_(user, requestId) {
  const r = reqRow_(requestId), o = reqOut_(r), id = o.요청ID;
  const files = doneFiles_().filter(f => String(f.요청ID) === id);
  const forms = files.filter(f => f.구분 === '양식').map(fileOut_);
  const targets = reqTargets_(r);
  if (isAdmin_(user)) {
    o.대상목록 = targets;
    const chapters = targets.map(ch => {
      const rp = replyRow_(id, ch);
      return Object.assign({ 지회명: ch }, replyOut_(rp, files.filter(f => f.구분 === '회신' && String(f.지회명) === ch)));
    });
    return { request: o, 양식: forms, 지회: chapters };
  }
  if (targets.indexOf(user.chapter) === -1) fail_('이 요청의 대상 지회가 아닙니다.', 'FORBIDDEN');
  const rp = replyRow_(id, user.chapter);
  return { request: o, 양식: forms, 내회신: replyOut_(rp, files.filter(f => f.구분 === '회신' && String(f.지회명) === user.chapter)) };
}
function saveRequest_(user, data) {
  requireAdmin_(user);
  data = data || {};
  const title = clean_(data.제목, 100, '제목');
  if (!title) fail_('제목을 입력해 주세요.');
  const desc = limitText_(data.설명, 2000, '설명');
  const dl = String(data.마감일 == null ? '' : data.마감일).trim() === '' ? '' : toDateStr_(data.마감일, '마감일');
  let target = '전체';
  if (Array.isArray(data.대상) && data.대상.length && data.대상.indexOf('전체') === -1) {
    const all = chapterList_(), pick = data.대상.map(x => String(x).trim()).filter(x => all.indexOf(x) !== -1);
    if (!pick.length) fail_('대상 지회를 한 곳 이상 고르세요.');
    target = pick.join(',');
  }
  const status = data.상태 === '종료' ? '종료' : '진행';
  const t = readTable_(SHEETS.REQUESTS), ts = now_();
  const editId = String(data.요청ID || '').trim();
  if (editId) {
    const r = t.rows.find(x => String(x.요청ID) === editId && x.상태 !== '삭제');
    if (!r) fail_('요청을 찾을 수 없습니다.');
    Object.assign(r, { 제목: title, 설명: desc, 마감일: dl, 대상: target, 상태: status });
    updateRow_(t, r);
    log_(user, '자료요청수정', editId);
    return getRequest_(user, editId);
  }
  const id = 'R' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  appendRows_(t, [{ 요청ID: id, 제목: title, 설명: desc, 마감일: dl, 대상: target, 상태: status, 등록자: user.name || user.id, 등록일시: ts }]);
  log_(user, '자료요청등록', id + ' ' + title);
  return getRequest_(user, id);
}
function requestFilePaths_(requestId) {
  return readTable_(SHEETS.FILES).rows.filter(f => String(f.요청ID) === String(requestId)).map(f => String(f.경로)).filter(x => x);
}
function deleteRequestPaths_(user, requestId) {
  requireAdmin_(user);
  reqRow_(requestId);
  return { paths: requestFilePaths_(requestId) };
}
function deleteRequest_(user, requestId) {
  requireAdmin_(user);
  const r = reqRow_(requestId), id = String(r.요청ID);
  [SHEETS.FILES, SHEETS.REPLIES, SHEETS.REQUESTS].forEach(def => {
    const t = readTable_(def);
    deleteRows_(t, t.rows.filter(o => String(o.요청ID) === id).map(o => o._row));
  });
  log_(user, '자료요청삭제', id);
  return { deleted: id };
}
function fileExt_(name) { const m = /\.([A-Za-z0-9]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
function fileUploadPrep_(user, requestId, kind, chapter, name, size) {
  const r = reqRow_(requestId), id = String(r.요청ID);
  const nm = clean_(name, 150, '파일 이름'), sz = Number(size);
  if (!nm) fail_('파일 이름이 없습니다.');
  if (FILE_EXTS.indexOf(fileExt_(nm)) === -1) fail_(`올릴 수 없는 파일 형식입니다. (가능: ${FILE_EXTS.join(', ')})`);
  if (!(sz > 0)) fail_('빈 파일은 올릴 수 없습니다.');
  if (sz > FILE_MAX_BYTES) fail_('파일은 20MB까지 올릴 수 있습니다.');
  let ch = '';
  if (kind === '양식') { requireAdmin_(user); }
  else if (kind === '회신') { ch = reqChapter_(user, r, chapter); if (isAdmin_(user)) fail_('회신 파일은 지회가 올립니다.', 'FORBIDDEN'); }
  else fail_('파일 종류를 알 수 없습니다.');
  const rows = readTable_(SHEETS.FILES).rows;
  const have = rows.filter(f => String(f.요청ID) === id && f.구분 === kind && String(f.지회명 || '') === ch && f.상태 === '완료').length;
  if (have >= FILE_MAX_COUNT) fail_(`파일은 ${FILE_MAX_COUNT}개까지 올릴 수 있습니다. 불필요한 파일을 지운 뒤 올려 주세요.`);
  // 올리다 만 흔적(1시간 지난 '업로드중')은 정리
  const cutoff = Utilities.formatDate(new Date(Date.now() - 3600 * 1000), TZ, 'yyyy-MM-dd HH:mm:ss');
  const stale = rows.filter(f => f.상태 === '업로드중' && String(f.올린일시) < cutoff);
  if (stale.length) deleteRows_(readTable_(SHEETS.FILES), stale.map(f => f._row));
  const fid = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  const path = 'f/' + fid;
  appendRows_(readTable_(SHEETS.FILES), [{ 파일ID: fid, 요청ID: id, 구분: kind, 지회명: ch, 파일명: nm, 경로: path, 크기: sz, 상태: '업로드중', 올린이: user.name || user.id, 올린일시: now_() }]);
  return { 파일ID: fid, path: path };
}
function fileOwnerCheck_(user, f) {   // 파일을 건드릴 수 있는 사람인가
  const r = reqRow_(f.요청ID);
  if (isAdmin_(user)) return r;
  if (f.구분 === '회신' && String(f.지회명) === user.chapter) return r;
  if (f.구분 === '양식' && reqTargets_(r).indexOf(user.chapter) !== -1) return r;
  fail_('이 파일에 접근할 수 없습니다.', 'FORBIDDEN');
}
function fileRow_(fileId) {
  const f = readTable_(SHEETS.FILES).rows.find(x => String(x.파일ID) === String(fileId || '').trim());
  if (!f) fail_('파일을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.');
  return f;
}
function replyTouch_(requestId, chapter, user) {   // 파일이 바뀌면 다시 제출하도록 '작성중'으로
  const t = readTable_(SHEETS.REPLIES), rp = t.rows.find(x => String(x.요청ID) === String(requestId) && String(x.지회명) === chapter);
  if (rp) { if (rp.상태 === '제출' || rp.상태 === '반려') { rp.상태 = ''; rp.제출일시 = ''; } rp.확인일시 = ''; rp.수정일시 = now_(); updateRow_(t, rp); }
}
function fileUploadDone_(user, fileId) {
  const t = readTable_(SHEETS.FILES), f = t.rows.find(x => String(x.파일ID) === String(fileId || '').trim());
  if (!f) fail_('파일 기록을 찾을 수 없습니다. 다시 올려 주세요.');
  if (f.상태 === '완료') return { 파일ID: String(f.파일ID) };
  if (String(f.올린이) !== (user.name || user.id)) fail_('이 업로드는 다른 사람이 시작했습니다.', 'FORBIDDEN');
  fileOwnerCheck_(user, f);
  f.상태 = '완료'; f.올린일시 = now_();
  updateRow_(t, f);
  if (f.구분 === '회신') replyTouch_(f.요청ID, String(f.지회명), user);
  log_(user, '자료파일올림', `${f.요청ID} ${f.구분}`);
  return { 파일ID: String(f.파일ID) };
}
function fileDownloadPrep_(user, fileId) {
  const f = fileRow_(fileId);
  if (f.상태 !== '완료') fail_('아직 올리는 중인 파일입니다.');
  fileOwnerCheck_(user, f);
  log_(user, '자료파일내려받기', `${f.요청ID} ${f.구분}`);
  return { path: String(f.경로), name: String(f.파일명) };
}
function deleteFileGuard_(user, f) {
  fileOwnerCheck_(user, f);
  if (f.구분 === '양식' && !isAdmin_(user)) fail_('양식 파일은 도협회만 지울 수 있습니다.', 'FORBIDDEN');
}
function deleteFilePaths_(user, fileId) {
  const f = fileRow_(fileId); deleteFileGuard_(user, f);
  return { paths: [String(f.경로)] };
}
function deleteFile_(user, fileId) {
  const f = fileRow_(fileId); deleteFileGuard_(user, f);
  const t = readTable_(SHEETS.FILES);
  deleteRows_(t, [f._row]);
  if (f.구분 === '회신') replyTouch_(f.요청ID, String(f.지회명), user);
  log_(user, '자료파일삭제', `${f.요청ID} ${f.구분}`);
  return { deleted: String(f.파일ID) };
}
function replyRowEnsure_(requestId, chapter) {
  const t = readTable_(SHEETS.REPLIES);
  let rp = t.rows.find(x => String(x.요청ID) === String(requestId) && String(x.지회명) === chapter);
  if (!rp) { rp = { 요청ID: String(requestId), 지회명: chapter, 메모: '', 상태: '', 제출일시: '', 반려사유: '', 확인일시: '', 수정일시: now_() }; appendRows_(t, [rp]); }
  return { t: t, rp: rp };
}
function saveReply_(user, requestId, memo) {
  if (isAdmin_(user)) fail_('회신은 지회가 작성합니다.', 'FORBIDDEN');
  const r = reqRow_(requestId), ch = reqChapter_(user, r, '');
  const text = limitText_(memo, 1000, '메모');
  const x = replyRowEnsure_(r.요청ID, ch);
  x.rp.메모 = text; x.rp.수정일시 = now_();
  if (x.rp.상태 === '제출' || x.rp.상태 === '반려') { x.rp.상태 = ''; x.rp.제출일시 = ''; }
  updateRow_(x.t, x.rp);
  return getRequest_(user, r.요청ID);
}
function submitReply_(user, requestId, on) {
  if (isAdmin_(user)) fail_('회신은 지회가 제출합니다.', 'FORBIDDEN');
  const r = reqRow_(requestId), ch = reqChapter_(user, r, '');
  if (r.상태 === '종료') fail_('종료된 요청입니다.');
  const x = replyRowEnsure_(r.요청ID, ch);
  const yes = on === true || String(on) === 'true';
  if (yes) {
    const n = doneFiles_().filter(f => String(f.요청ID) === String(r.요청ID) && f.구분 === '회신' && String(f.지회명) === ch).length;
    if (!n) fail_('회신 파일을 한 개 이상 올린 뒤에 제출해 주세요.');
    x.rp.상태 = '제출'; x.rp.제출일시 = now_(); x.rp.반려사유 = '';
  } else { x.rp.상태 = ''; x.rp.제출일시 = ''; }
  x.rp.수정일시 = now_();
  updateRow_(x.t, x.rp);
  log_(user, yes ? '회신제출' : '회신제출취소', String(r.요청ID));
  return getRequest_(user, r.요청ID);
}
function rejectReply_(user, requestId, chapter, reason) {
  requireAdmin_(user);
  const r = reqRow_(requestId), ch = reqChapter_(user, r, chapter);
  const x = replyRowEnsure_(r.요청ID, ch);
  x.rp.상태 = '반려'; x.rp.반려사유 = limitText_(reason, 500, '보완 요청 사유') || '다시 확인해 주세요.'; x.rp.제출일시 = ''; x.rp.수정일시 = now_();
  updateRow_(x.t, x.rp);
  log_(user, '회신반려', `${r.요청ID} ${ch}`);
  return getRequest_(user, r.요청ID);
}
function deleteReplyPaths_(user, requestId, chapter) {
  requireAdmin_(user);
  const r = reqRow_(requestId), ch = reqChapter_(user, r, chapter);
  return { paths: readTable_(SHEETS.FILES).rows.filter(f => String(f.요청ID) === String(r.요청ID) && f.구분 === '회신' && String(f.지회명) === ch).map(f => String(f.경로)) };
}
function deleteReplyFiles_(user, requestId, chapter) {
  requireAdmin_(user);
  const r = reqRow_(requestId), ch = reqChapter_(user, r, chapter), id = String(r.요청ID);
  const ft = readTable_(SHEETS.FILES);
  deleteRows_(ft, ft.rows.filter(o => String(o.요청ID) === id && o.구분 === '회신' && String(o.지회명) === ch).map(o => o._row));
  const x = replyRowEnsure_(id, ch);
  x.rp.확인일시 = now_(); x.rp.수정일시 = now_();
  updateRow_(x.t, x.rp);
  log_(user, '회신파일확인삭제', `${id} ${ch}`);
  return getRequest_(user, id);
}


// ---- 강의확인서(기관 담당자 서명) 받았는지 표시 ----
function setConfirmReceived(token, courseId, on, date) { return api_(token, user => setConfirmReceived_(user, courseId, on, date), true); }
function setConfirmReceived_(user, courseId, on, date) {
  const c = getCourseOrFail_(courseId).c;
  assertAccess_(user, c.지회명);
  if (String(c.확인서필요).trim().toUpperCase() !== 'Y') fail_('이 강좌는 강의확인서가 필요한 강좌로 등록되어 있지 않습니다.');
  const t = readTable_(SHEETS.COURSES);
  const row = t.rows.find(r => String(r.강좌ID) === String(c.강좌ID));
  const yes = on === true || String(on).toUpperCase() === 'Y' || String(on) === 'true';
  row.확인서수령 = yes ? 'Y' : '';
  row.확인서수령일 = yes ? (date ? toDateStr_(date, '받은 날짜') : today_()) : '';
  updateRow_(t, row);
  log_(user, yes ? '확인서수령' : '확인서수령취소', String(c.강좌ID));
  return getCourseDetail_(user, c.강좌ID);
}

// ---- 강의확인서: 회차별 교육내용 + 강사 서명 + 기관 담당자 서명 (강사 링크에서 작성) ----
function confirmCourse_(user, courseId) {
  const c = getCourseOrFail_(courseId).c;
  assertAccess_(user, c.지회명);
  if (String(c.확인서필요).trim().toUpperCase() !== 'Y') fail_('이 강좌는 강의확인서가 필요한 강좌로 등록되어 있지 않습니다.');
  return c;
}
function confirmContents_(row, total) {
  let arr = [];
  try { arr = JSON.parse(String(row && row.내용 || '[]')); } catch (e) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  const out = [];
  for (let i = 0; i < total; i++) out.push(String(arr[i] == null ? '' : arr[i]));
  return out;
}
function confirmView_(c, row) {
  const total = Number(c.총회차) || 0, r = row || {};
  return { 내용: confirmContents_(r, total), 강사서명: String(r.강사서명 || ''), 강사서명일시: String(r.강사서명일시 || ''),
    기관소속: String(r.기관소속 || ''), 기관담당자: String(r.기관담당자 || ''), 기관서명: String(r.기관서명 || ''), 기관서명일시: String(r.기관서명일시 || ''),
    완료: !!(r.강사서명 && r.기관서명), 수정일시: String(r.수정일시 || ''),
    제출일시: String(r.제출일시 || ''), 제출: !!r.제출일시, 링크발송일시: String(r.링크발송일시 || ''), 담당확인일시: String(r.담당확인일시 || '') };
}
function getConfirm_(user, courseId) {
  const c = confirmCourse_(user, courseId);
  const row = readTable_(SHEETS.CONFIRMS).rows.find(r => String(r.강좌ID) === String(c.강좌ID));
  return confirmView_(c, row);
}
function saveConfirm_(user, courseId, contents) {
  const c = confirmCourse_(user, courseId), id = String(c.강좌ID), total = Number(c.총회차) || 0;
  const t = readTable_(SHEETS.CONFIRMS);
  const ex = t.rows.find(r => String(r.강좌ID) === id);
  if (ex && (ex.강사서명 || ex.기관서명)) fail_('서명이 있는 확인서는 고칠 수 없습니다. 내용을 고치려면 먼저 서명을 지워 주세요.');
  const arr = Array.isArray(contents) ? contents : [];
  const out = [];
  for (let i = 0; i < total; i++) out.push(limitText_(arr[i], 200, (i + 1) + '회차 교육내용'));
  if (!out.some(x => x)) fail_('회차별 교육내용을 한 가지 이상 적어 주세요.');
  const obj = { 강좌ID: id, 내용: JSON.stringify(out), 수정자: user.name || user.id, 수정일시: now_() };
  if (ex) { Object.keys(obj).forEach(k => { ex[k] = obj[k]; }); updateRow_(t, ex); } else appendRows_(t, [obj]);
  log_(user, '확인서내용저장', id);
  return getConfirm_(user, id);
}
function pngOk_(v, label) {
  const s = String(v == null ? '' : v);
  if (!/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(s) || s.length > 90000) fail_(`${label} 서명을 확인할 수 없습니다. 다시 서명해 주세요.`);
  if (s.length < 800) fail_(`${label} 서명이 비어 있습니다. 서명해 주세요.`);
  return s;
}
function signConfirm_(user, courseId, who, info) {
  const c = confirmCourse_(user, courseId), id = String(c.강좌ID);
  info = info || {};
  const t = readTable_(SHEETS.CONFIRMS);
  const ex = t.rows.find(r => String(r.강좌ID) === id);
  if (!ex || !confirmContents_(ex, Number(c.총회차) || 0).some(x => x)) fail_('먼저 회차별 교육내용을 저장해 주세요.');
  const ts = now_();
  if (who === '강사') {
    ex.강사서명 = pngOk_(info.png, '강사'); ex.강사서명일시 = ts;
  } else if (who === '기관') {
    const org = limitText_(info.org, 60, '기관 소속·직위'), name = limitText_(info.name, 30, '기관 담당자 성명');
    if (!name) fail_('기관 담당자 성명을 입력해 주세요.');
    ex.기관소속 = org; ex.기관담당자 = name; ex.기관서명 = pngOk_(info.png, '기관 담당자'); ex.기관서명일시 = ts;
  } else fail_('서명할 사람을 알 수 없습니다.');
  ex.수정자 = user.name || user.id; ex.수정일시 = ts;
  updateRow_(t, ex);
  if (ex.강사서명 && ex.기관서명) {
    const ct = readTable_(SHEETS.COURSES), row = ct.rows.find(r => String(r.강좌ID) === id);
    row.확인서수령 = 'Y'; row.확인서수령일 = today_(); updateRow_(ct, row);
  }
  log_(user, '확인서서명', `${id} ${who}`);
  return getConfirm_(user, id);
}
function resetConfirmSign_(user, courseId) {
  const c = confirmCourse_(user, courseId), id = String(c.강좌ID);
  const t = readTable_(SHEETS.CONFIRMS);
  const ex = t.rows.find(r => String(r.강좌ID) === id);
  if (ex) {
    ['강사서명', '강사서명일시', '기관소속', '기관담당자', '기관서명', '기관서명일시', '제출일시', '학교토큰해시', '학교토큰', '링크발송일시', '담당확인일시'].forEach(k => { ex[k] = ''; });
    ex.수정자 = user.name || user.id; ex.수정일시 = now_();
    updateRow_(t, ex);
    const ct = readTable_(SHEETS.COURSES), row = ct.rows.find(r => String(r.강좌ID) === id);
    if (row && String(row.확인서수령) === 'Y') { row.확인서수령 = ''; row.확인서수령일 = ''; updateRow_(ct, row); }
  }
  log_(user, '확인서서명삭제', id);
  return getConfirm_(user, id);
}



// ---- 강의확인서 새 흐름: 강사가 매회 출석+교육내용 [저장] → 마지막 회차에 서명하고 [제출] → 학교 링크 → 학교 담당자 서명 ----
function getConfirmAdmin_(user, courseId) {
  const c = confirmCourse_(user, courseId);
  const row = readTable_(SHEETS.CONFIRMS).rows.find(r => String(r.강좌ID) === String(c.강좌ID));
  const v = confirmView_(c, row);
  v.학교토큰 = row && row.제출일시 && !row.기관서명 ? String(row.학교토큰 || '') : '';   // 담당자만: 학교에 보낼 링크
  return v;
}
// 담당자 할 일: 학교 링크 보내기 / 학교 서명 완료(출력) — 우리 지회 강좌만
function listConfirmPending_(user) {
  const cs = readTable_(SHEETS.COURSES).rows.filter(c => c.지회명 === user.chapter && c.상태 !== '삭제'), out = [];
  readTable_(SHEETS.CONFIRMS).rows.forEach(r => {
    if (!r.제출일시) return;
    const c = cs.find(x => String(x.강좌ID) === String(r.강좌ID)); if (!c) return;
    const st = r.기관서명 ? (r.담당확인일시 ? '' : '학교서명완료') : (r.링크발송일시 ? '학교서명대기' : '링크보내기');
    if (st) out.push({ 강좌ID: String(c.강좌ID), 강좌명: c.강좌명, 기관명: c.기관명 || '', 상태: st, 일시: String(r.기관서명일시 || r.제출일시 || '') });
  });
  return out.sort((a, b) => String(b.일시).localeCompare(String(a.일시)));
}
function markConfirm_(user, courseId, col, on) {
  const c = confirmCourse_(user, courseId), id = String(c.강좌ID);
  const t = readTable_(SHEETS.CONFIRMS), ex = t.rows.find(r => String(r.강좌ID) === id);
  if (!ex || !ex.제출일시) fail_('강사가 아직 확인서를 제출하지 않았습니다.');
  ex[col] = on === false ? '' : (ex[col] || now_());
  updateRow_(t, ex);
  return getConfirmAdmin_(user, id);
}
function confirmSaveOne_(user, c, session, content) {
  const id = String(c.강좌ID), total = Number(c.총회차) || 0, n = Number(session) || 0;
  if (n < 1 || n > total) fail_('회차를 확인해 주세요.');
  const t = readTable_(SHEETS.CONFIRMS);
  let ex = t.rows.find(r => String(r.강좌ID) === id);
  if (ex && (ex.제출일시 || ex.강사서명 || ex.기관서명)) fail_('확인서를 이미 제출했습니다. 고쳐야 하면 지회 담당자에게 요청해 주세요.');
  const arr = confirmContents_(ex, total);
  arr[n - 1] = limitText_(content, 200, n + '회차 교육내용');
  const obj = { 강좌ID: id, 내용: JSON.stringify(arr), 수정자: user.name || user.id, 수정일시: now_() };
  if (ex) { Object.keys(obj).forEach(k => { ex[k] = obj[k]; }); updateRow_(t, ex); } else { appendRows_(t, [obj]); }
}
function confirmSaveSession_(user, c, session, data) {
  data = data || {};
  const info0 = tInfo_(user, c);
  if (!info0.locked) {
    if (isHeadcount_(c)) saveHeadcount_(user, c.강좌ID, session, data.count, data.date);
    else saveAttendance_(user, c.강좌ID, session, Array.isArray(data.present) ? data.present : [], data.date);
  }
  if (String(c.확인서필요 || '').trim().toUpperCase() === 'Y' && data.content !== undefined) confirmSaveOne_(user, c, session, data.content);
}
function tSaveSession_(user, c, session, data) {
  confirmSaveSession_(user, c, session, data);
  log_(user, '회차저장', String(c.강좌ID) + ' ' + session + '회');
  return { info: tInfo_(user, c), cf: String(c.확인서필요 || '').trim().toUpperCase() === 'Y' ? getConfirm_(user, c.강좌ID) : null };
}
function tSubmitConfirm_(user, c, session, data, png) {
  const id = String(c.강좌ID), total = Number(c.총회차) || 0;
  if (String(c.확인서필요 || '').trim().toUpperCase() !== 'Y') fail_('이 강좌는 강의확인서가 필요한 강좌가 아닙니다.');
  if (Number(session) !== total) fail_('마지막 회차(' + total + '회)에서 제출할 수 있습니다.');
  confirmSaveSession_(user, c, session, data);
  // 모든 회차 출석·교육내용이 있는지
  const d = getCourseDetail_(user, id), head = isHeadcount_(c), missA = [], missC = [];
  const t = readTable_(SHEETS.CONFIRMS), ex = t.rows.find(r => String(r.강좌ID) === id), arr = confirmContents_(ex, total);
  for (let n = 1; n <= total; n++) {
    const held = head ? d.headcounts[n] !== undefined : d.participants.some(p => (d.attendance[p.참여자ID] || {})[n] !== undefined);
    if (!held) missA.push(n);
    if (!String(arr[n - 1] || '').trim()) missC.push(n);
  }
  if (missA.length) fail_('출석을 저장하지 않은 회차가 있습니다: ' + missA.join(', ') + '회');
  if (missC.length) fail_('교육내용을 쓰지 않은 회차가 있습니다: ' + missC.join(', ') + '회');
  const tok = (Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')).slice(0, 40), ts = now_();
  ex.강사서명 = pngOk_(png, '강사'); ex.강사서명일시 = ts; ex.제출일시 = ts;
  ex.학교토큰해시 = schoolHash_(tok); ex.학교토큰 = tok; ex.링크발송일시 = ''; ex.담당확인일시 = '';
  ex.수정자 = user.name || user.id; ex.수정일시 = ts;
  updateRow_(t, ex);
  log_(user, '확인서제출', id);
  return { info: tInfo_(user, c), cf: getConfirm_(user, id) };
}

// ---- 학교(기관) 담당자 서명 링크 ----
function schoolHash_(tok) { return sha256_('school-sign|' + tok); }
function schoolApi_(linkToken, fn, write) {
  try {
    resetMemo_();
    const run = () => {
      const tok = String(linkToken == null ? '' : linkToken).trim();
      const row = /^[0-9a-f]{40}$/.test(tok) ? readTable_(SHEETS.CONFIRMS).rows.find(r => String(r.학교토큰해시) === schoolHash_(tok) && r.제출일시) : null;
      if (!row) fail_('서명 링크가 올바르지 않거나 닫혔습니다. 담당자에게 문의해 주세요.', 'LINK');
      const c = readTable_(SHEETS.COURSES).rows.find(r => String(r.강좌ID) === String(row.강좌ID));
      if (!c || c.상태 === '삭제') fail_('강좌를 찾을 수 없습니다. 담당자에게 문의해 주세요.', 'LINK');
      return fn({ id: '학교링크', name: '기관 담당자(링크)', chapter: c.지회명, role: ROLE_CHAPTER }, c, row);
    };
    return { ok: true, data: write ? withLock_(run) : run() };
  } catch (e) {
    return errorResult_(e);
  }
}
function schoolCourseId_(tok) {
  tok = String(tok == null ? '' : tok).trim();
  if (!/^[0-9a-f]{40}$/.test(tok)) return '';
  const row = readTable_(SHEETS.CONFIRMS).rows.find(r => String(r.학교토큰해시) === schoolHash_(tok));
  return row ? String(row.강좌ID) : '';
}
function sInfo_(user, c, row) {
  const d = getCourseDetail_(user, c.강좌ID), total = Number(c.총회차) || 0, head = isHeadcount_(c), arr = confirmContents_(row, total), rows = [];
  for (let n = 1; n <= total; n++) {
    let cnt = '';
    if (head) { if (d.headcounts[n] !== undefined) cnt = d.headcounts[n]; }
    else if (d.participants.some(p => (d.attendance[p.참여자ID] || {})[n] !== undefined)) cnt = d.participants.filter(p => (d.attendance[p.참여자ID] || {})[n] === 'O').length;
    rows.push({ 회차: n, 수업일: d.dates[n] || '', 인원: cnt, 내용: arr[n - 1] || '' });
  }
  return { course: { 강좌명: c.강좌명, 지회명: c.지회명, 기관명: c.기관명 || '', 시작일: dateText_(c.시작일), 종료일: dateText_(c.종료일), 총회차: total, 회당시간: Number(c.회당시간) || 0, 강사: c.강사 || '', 보조강사: c.보조강사 || '' },
    rows: rows, 강사서명: String(row.강사서명 || ''), 강사서명일시: String(row.강사서명일시 || ''),
    기관소속: String(row.기관소속 || ''), 기관담당자: String(row.기관담당자 || ''), 기관서명: String(row.기관서명 || ''), 기관서명일시: String(row.기관서명일시 || ''), 완료: !!row.기관서명 };
}
function sSign_(user, c, row, info) {
  info = info || {};
  if (row.기관서명) fail_('이미 서명이 끝난 확인서입니다.');
  const org = limitText_(info.org, 60, '소속·직위'), name = limitText_(info.name, 30, '성명');
  if (!name) fail_('성명을 입력해 주세요.');
  const t = readTable_(SHEETS.CONFIRMS), ex = t.rows.find(r => String(r.강좌ID) === String(row.강좌ID)), ts = now_();
  ex.기관소속 = org; ex.기관담당자 = name; ex.기관서명 = pngOk_(info.png, '담당자'); ex.기관서명일시 = ts;
  ex.담당확인일시 = ''; ex.수정자 = '기관 담당자(링크)'; ex.수정일시 = ts;
  updateRow_(t, ex);
  const ct = readTable_(SHEETS.COURSES), cr = ct.rows.find(r => String(r.강좌ID) === String(row.강좌ID));
  if (cr) { cr.확인서수령 = 'Y'; cr.확인서수령일 = today_(); updateRow_(ct, cr); }
  log_(user, '확인서기관서명', String(row.강좌ID));
  return sInfo_(user, c, ex);
}

function getTeacherLink(token, courseId) { return api_(token, user => getTeacherLink_(user, courseId)); }
function setLinkExpiry(token, courseId, date) { return api_(token, user => setLinkExpiry_(user, courseId, date), true); }
function createTeacherLink(token, courseId) { return api_(token, user => createTeacherLink_(user, courseId), true); }
function revokeTeacherLink(token, courseId) { return api_(token, user => revokeTeacherLink_(user, courseId), true); }

function getConfirm(token, courseId) { return api_(token, user => getConfirmAdmin_(user, courseId)); }
function markConfirmSent(token, courseId, on) { return api_(token, user => markConfirm_(user, courseId, '링크발송일시', on), true); }
function listConfirmPending(token) { return api_(token, user => listConfirmPending_(user)); }
function markConfirmSeen(token, courseId) { return api_(token, user => markConfirm_(user, courseId, '담당확인일시', true), true); }
function resetConfirm(token, courseId) { return api_(token, user => resetConfirmSign_(user, courseId), true); }
function tGetConfirm(linkToken) { return linkApi_(linkToken, (user, c) => getConfirm_(user, c.강좌ID)); }
function tSaveConfirm(linkToken, contents) { return linkApi_(linkToken, (user, c) => saveConfirm_(user, c.강좌ID, contents), true); }
function tSignConfirm(linkToken, who, info) { return linkApi_(linkToken, (user, c) => signConfirm_(user, c.강좌ID, who, info), true); }
function tResetConfirm(linkToken) { return linkApi_(linkToken, (user, c) => resetConfirmSign_(user, c.강좌ID), true); }
function tSaveSession(linkToken, session, data) { return linkApi_(linkToken, (user, c) => tSaveSession_(user, c, session, data), true); }
function tSubmitConfirm(linkToken, session, data, png) { return linkApi_(linkToken, (user, c) => tSubmitConfirm_(user, c, session, data, png), true); }
function sInfo(linkToken) { return schoolApi_(linkToken, (user, c, row) => sInfo_(user, c, row)); }
function sSign(linkToken, info) { return schoolApi_(linkToken, (user, c, row) => sSign_(user, c, row, info), true); }

function tInfo(linkToken) { return linkApi_(linkToken, (user, c) => tInfo_(user, c)); }
function tSaveAttendance(linkToken, session, presentIds, date) { return linkApi_(linkToken, (user, c) => { saveAttendance_(user, c.강좌ID, session, presentIds, date); return tInfo_(user, c); }, true); }
function tSaveHeadcount(linkToken, session, count, date) { return linkApi_(linkToken, (user, c) => { saveHeadcount_(user, c.강좌ID, session, count, date); return tInfo_(user, c); }, true); }
function tGetJournal(linkToken) { return linkApi_(linkToken, (user, c) => getJournal_(user, c.강좌ID)); }
function tSaveJournal(linkToken, session, entry) { return linkApi_(linkToken, (user, c) => saveJournal_(user, c.강좌ID, session, entry), true); }
function tAddJournalPhoto(linkToken, session, data) { return linkApi_(linkToken, (user, c) => addJournalPhoto_(user, c.강좌ID, session, data), true); }
function tDeleteJournalPhoto(linkToken, photoId) { return linkApi_(linkToken, (user, c) => deleteJournalPhoto_(user, c.강좌ID, photoId), true); }
function tGetJournalPhotos(linkToken, session) { return linkApi_(linkToken, (user, c) => getJournalPhotos_(user, c.강좌ID, session)); }
function tSaveScores(linkToken, pid, scores) { return linkApi_(linkToken, (user, c) => { saveScores_(user, c.강좌ID, pid, scores); return tInfo_(user, c); }, true); }
function tSetCompletion(linkToken, pid, value) { return linkApi_(linkToken, (user, c) => { setCompletion_(user, c.강좌ID, pid, value); return tInfo_(user, c); }, true); }
function tGetTasks(linkToken) { return linkApi_(linkToken, (user, c) => getTasks_(user, c.강좌ID)); }
function tSaveTask(linkToken, task) { return linkApi_(linkToken, (user, c) => saveTask_(user, c.강좌ID, task), true); }
function tSetSubmit(linkToken, taskId, pid, on) { return linkApi_(linkToken, (user, c) => setSubmit_(user, c.강좌ID, taskId, pid, on), true); }

function linkApi_(linkToken, fn, write) {
  try {
    resetMemo_();
    const run = () => { const x = linkContext_(linkToken); return fn(x.user, x.c); };
    return { ok: true, data: write ? withLock_(run) : run() };
  } catch (e) {
    return errorResult_(e);
  }
}
function linkHash_(tok) { return sha256_('teacher-link|' + tok); }
function linkExpiry_(c) {   // 'yyyy-MM-dd' (강좌별로 직접 정했으면 그 날짜, 아니면 종료일 + 2주)
  const own = dateText_(c.링크만료일);
  if (/^\d{4}-\d{2}-\d{2}$/.test(own)) return own;
  return linkDefaultExpiry_(c);
}
function linkDefaultExpiry_(c) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateText_(c.종료일));
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + LINK_GRACE_DAYS));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}
// 링크로 강좌 찾기 (없으면 null)
function linkRow_(linkToken) {
  const tok = String(linkToken == null ? '' : linkToken).trim();
  if (!/^[0-9a-f]{40}$/.test(tok)) return null;
  const h = linkHash_(tok);
  return readTable_(SHEETS.LINKS).rows.find(r => String(r.토큰해시) === h && String(r.사용).trim().toUpperCase() !== 'N') || null;
}
function linkCourseId_(linkToken) { const r = linkRow_(linkToken); return r ? String(r.강좌ID) : ''; }
function linkContext_(linkToken) {
  const row = linkRow_(linkToken);
  const bad = () => fail_('링크가 올바르지 않거나 더 이상 사용할 수 없습니다. 담당자에게 새 링크를 요청해 주세요.', 'LINK');
  if (!row) bad();
  const c = readTable_(SHEETS.COURSES).rows.find(r => String(r.강좌ID) === String(row.강좌ID));
  if (!c || c.상태 === '삭제') bad();
  const exp = linkExpiry_(c);
  if (!exp || today_() > exp) fail_(`이 링크는 사용 기간(${exp || '-'}까지)이 끝났습니다. 담당자에게 문의해 주세요.`, 'LINK');
  return { user: { id: '강사링크', name: '강사(링크)', chapter: c.지회명, role: ROLE_CHAPTER }, c: c };
}

// 강사에게 필요한 것만 (연락처·비고·수료 판정은 보내지 않음)
function tInfo_(user, c) {
  const d = getCourseDetail_(user, c.강좌ID), cc = d.course;
  return {
    course: { 강좌명: cc.강좌명, 지회명: cc.지회명, 시작일: dateText_(cc.시작일), 종료일: dateText_(cc.종료일), 총회차: Number(cc.총회차) || 0,
      회당시간: Number(cc.회당시간) || 0, 강사: cc.강사 || '', 보조강사: cc.보조강사 || '', 기관명: cc.기관명 || '', 수료배점: parseWeights_(cc), 기타항목명: cc.기타항목명 || '', 수료집계: countsCompletion_(cc), 수료기준: Number(cc.수료기준) || 0, 인원만입력: isHeadcount_(cc), 만료일: linkExpiry_(cc),
      확인서필요: String(cc.확인서필요 || '').trim().toUpperCase() === 'Y' },
    participants: d.participants.map(p => ({ 참여자ID: p.참여자ID, 이름: p.이름, 연락처: p.연락처, 성별: p.성별, 비고: p.비고, 출석횟수: p.출석횟수, 점수: p.점수, 총점: p.총점, 수료확정: p.수료확정, 수료: p.수료 })),
    attendance: d.attendance, headcounts: d.headcounts, dates: d.dates, locked: d.locked, lockedBy: d.lockedBy, today: today_()
  };
}

function getTeacherLink_(user, courseId) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID);
  const row = readTable_(SHEETS.LINKS).rows.find(r => String(r.강좌ID) === id && String(r.사용).trim().toUpperCase() !== 'N');
  const exp = linkExpiry_(c);
  return { active: !!row, token: row ? String(row.토큰) : '', 만료일: exp, 직접설정: exp !== linkDefaultExpiry_(c) && !!dateText_(c.링크만료일), 기본만료일: linkDefaultExpiry_(c), 만료됨: !!exp && today_() > exp, 만든일시: row ? String(row.만든일시) : '' };
}
function createTeacherLink_(user, courseId) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID);
  const tok = (Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')).slice(0, 40);
  const t = readTable_(SHEETS.LINKS);
  const mine = t.rows.filter(r => String(r.강좌ID) === id);
  const obj = { 강좌ID: id, 토큰해시: linkHash_(tok), 토큰: tok, 만든이: user.name || user.id, 만든일시: now_(), 사용: 'Y' };
  if (mine.length) {
    const keep = mine[0];
    Object.keys(obj).forEach(k => { keep[k] = obj[k]; });
    updateRow_(t, keep);
    if (mine.length > 1) deleteRows_(t, mine.slice(1).map(r => r._row));
  } else appendRows_(t, [obj]);
  log_(user, '강사링크생성', id);
  return getTeacherLink_(user, id);
}
function setLinkExpiry_(user, courseId, date) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID);
  const t = readTable_(SHEETS.COURSES);
  const row = t.rows.find(r => String(r.강좌ID) === id);
  const raw = String(date == null ? '' : date).trim();
  let d = '';
  if (raw) { d = toDateStr_(raw, '유지 기한'); if (d < today_()) fail_('유지 기한은 오늘 이후 날짜로 정해 주세요.'); }
  row.링크만료일 = d;
  updateRow_(t, row);
  log_(user, '강사링크기한', id + ' ' + (d || '기본'));
  return getTeacherLink_(user, id);
}
function revokeTeacherLink_(user, courseId) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID);
  const t = readTable_(SHEETS.LINKS);
  t.rows.filter(r => String(r.강좌ID) === id).forEach(r => { r.사용 = 'N'; updateRow_(t, r); });
  log_(user, '강사링크해제', id);
  return getTeacherLink_(user, id);
}


// ===================== 13-6. 수강 접수 (신청 링크 + 담당자 입력 → 승인하면 명단에 등록) =====================
const APPLY_MAX = 500;   // 강좌 하나에 쌓을 수 있는 접수 건수 (스팸 방지)
function getApply(token, courseId) { return api_(token, user => getApply_(user, courseId)); }
function saveApplyLink(token, courseId, opt) { return api_(token, user => saveApplyLink_(user, courseId, opt), true); }
function addApply(token, courseId, form) { return api_(token, user => addApply_(user, courseId, form), true); }
function decideApply(token, courseId, ids, decision) { return api_(token, user => decideApply_(user, courseId, ids, decision), true); }
function deleteApply(token, courseId, ids) { return api_(token, user => deleteApply_(user, courseId, ids), true); }
function applyInfo(linkToken) { return applyApi_(linkToken, (user, c, row) => applyInfo_(c, row)); }
function applySubmit(linkToken, form) { return applyApi_(linkToken, (user, c, row) => applySubmit_(user, c, form, row), true); }
function applyStatus(linkToken, form) { return statusApi_(linkToken, (ids) => applyStatus_(ids, form)); }

function applyApi_(linkToken, fn, write) {
  try {
    resetMemo_();
    const run = () => { const x = applyContext_(linkToken); return fn(x.user, x.c, x.row); };
    return { ok: true, data: write ? withLock_(run) : run() };
  } catch (e) {
    return errorResult_(e);
  }
}
function applyHash_(tok) { return sha256_('apply-link|' + tok); }
function applyRow_(linkToken) {
  const tok = String(linkToken == null ? '' : linkToken).trim();
  if (!/^[0-9a-f]{40}$/.test(tok)) return null;
  const h = applyHash_(tok);
  return readTable_(SHEETS.APPLYLINKS).rows.find(r => String(r.토큰해시) === h && String(r.사용).trim().toUpperCase() !== 'N') || null;
}
function applyCourseId_(linkToken) { const r = applyRow_(linkToken); return r ? String(r.강좌ID) : ''; }
function deadlineOr_(own, c) {   // 접수 링크에 마감일이 없으면: 강좌 정보의 접수 마감일 → 강좌 종료일
  if (/^\d{4}-\d{2}-\d{2}$/.test(own)) return own;
  const cd = dateText_(c.접수마감);
  return /^\d{4}-\d{2}-\d{2}$/.test(cd) ? cd : dateText_(c.종료일);
}
function applyDeadline_(c, row) {   // 마감일을 따로 정하지 않으면 강좌 종료일까지
  const own = row ? dateText_(row.마감일) : '';
  return deadlineOr_(own, c);
}
function applyContext_(linkToken) {
  const row = applyRow_(linkToken);
  const bad = () => fail_('접수 링크가 올바르지 않거나 닫혔습니다. 담당자에게 문의해 주세요.', 'LINK');
  if (!row) bad();
  const c = readTable_(SHEETS.COURSES).rows.find(r => String(r.강좌ID) === String(row.강좌ID));
  if (!c || c.상태 === '삭제' || isHeadcount_(c)) bad();
  const dl = applyDeadline_(c, row);
  if (!dl || today_() > dl) fail_(`접수가 마감되었습니다. (${dl || '-'}까지)`, 'LINK');
  return { user: { id: '접수링크', name: '접수링크', chapter: c.지회명, role: ROLE_CHAPTER }, c: c, row: row };
}
// ---- 접수 항목 (담당자가 켜고 끄거나 새로 추가) ----
const APPLY_EXTRA_MAX = 10;
function applyFields_(row) {
  let o = {};
  try { o = JSON.parse(String(row && row.항목 || '')) || {}; } catch (e) { o = {}; }
  const extra = (Array.isArray(o.추가) ? o.추가 : []).slice(0, APPLY_EXTRA_MAX).map((x, i) => ({
    id: 'x' + (i + 1), 라벨: String(x.라벨 || '').trim().slice(0, 30), 유형: x.유형 === '선택' ? '선택' : '글', 필수: x.필수 === true,
    선택지: x.유형 === '선택' ? (Array.isArray(x.선택지) ? x.선택지 : []).map(v => String(v).trim().slice(0, 30)).filter(v => v).slice(0, 8) : [] })).filter(x => x.라벨);
  return { 주소: o.주소 !== false, 전달할말: o.전달할말 !== false, 전달할말라벨: String(o.전달할말라벨 || '').trim().slice(0, 30), 추가: extra };
}
function chapterApplyFields_(chapter, exceptId) {   // 같은 지회 다른 강좌에서 쓴 접수 항목 (최근 순) → 불러오기·새 강좌 기본값
  const cs = {}; readTable_(SHEETS.COURSES).rows.forEach(c => { if (c.지회명 === chapter && c.상태 !== '삭제') cs[String(c.강좌ID)] = c; });
  return readTable_(SHEETS.APPLYLINKS).rows.filter(r => cs[String(r.강좌ID)] && String(r.강좌ID) !== String(exceptId || '') && String(r.항목 || '').trim())
    .map(r => ({ 강좌ID: String(r.강좌ID), 강좌명: String(cs[String(r.강좌ID)].강좌명 || ''), 만든일시: String(r.만든일시 || ''), 원본: String(r.항목), 항목: applyFields_(r) }))
    .filter(x => x.항목.추가.length).sort((a, b) => a.만든일시 < b.만든일시 ? 1 : -1).slice(0, 10);
}
function cleanApplyFields_(v) {
  v = v || {};
  const extra = (Array.isArray(v.추가) ? v.추가 : []).filter(x => x && String(x.라벨 || '').trim());
  if (extra.length > APPLY_EXTRA_MAX) fail_(`접수 항목은 ${APPLY_EXTRA_MAX}개까지 추가할 수 있습니다.`);
  const out = extra.map(x => {
    const lab = String(x.라벨).trim();
    if (lab.length > 30) fail_('항목 이름은 30자까지 쓸 수 있습니다.');
    const sel = x.유형 === '선택';
    const opts = sel ? (Array.isArray(x.선택지) ? x.선택지 : String(x.선택지 || '').split(',')).map(o => String(o).trim()).filter(o => o) : [];
    if (sel && opts.length < 2) fail_(`'${lab}' 항목은 선택지를 2개 이상 적어 주세요. (쉼표로 구분)`);
    if (opts.some(o => o.length > 30) || opts.length > 8) fail_(`'${lab}' 항목의 선택지는 8개 이내, 각 30자 이내로 적어 주세요.`);
    return { 라벨: lab, 유형: sel ? '선택' : '글', 필수: x.필수 === true, 선택지: opts };
  });
  return JSON.stringify({ 주소: v.주소 !== false, 전달할말: v.전달할말 !== false, 전달할말라벨: String(v.전달할말라벨 || '').trim().slice(0, 30), 추가: out });
}
function applyAnswers_(fields, form) {   // 추가 항목 답변 → [{라벨, 값}] (빈 필수 항목이면 오류)
  const src = form && typeof form.답변 === 'object' && form.답변 ? form.답변 : {}, out = [];
  fields.추가.forEach(x => {
    const val = String(src[x.id] == null ? '' : src[x.id]).trim().slice(0, 200);
    if (!val) { if (x.필수) fail_(`'${x.라벨}' 항목을 입력해 주세요.`); return; }
    if (x.유형 === '선택' && x.선택지.indexOf(val) === -1) fail_(`'${x.라벨}' 항목은 목록에서 골라 주세요.`);
    out.push({ 라벨: x.라벨, 값: val });
  });
  return out;
}
function posterOf_(id) { const r = readTable_(SHEETS.POSTERS).rows.find(x => String(x.강좌ID) === String(id)); return r ? String(r.이미지 || '') : ''; }
function applyInfo_(c, row) {
  return { 강좌명: c.강좌명, 지회명: c.지회명, 시작일: dateText_(c.시작일), 종료일: dateText_(c.종료일), 총회차: Number(c.총회차) || 0,
    회당시간: Number(c.회당시간) || 0, 기관명: c.기관명 || '', 강사: c.강사 || '', 수준: c.수준 || '', 요일시간: String(c.요일시간 || ''), 장소: String(c.장소 || ''), 모집인원: String(c.모집인원 || ''), 마감일: applyDeadline_(c, row), 안내: String(row.안내 || ''), 항목: applyFields_(row), 포스터: posterOf_(c.강좌ID) };
}
// ---- 접수 결과(상태) 조회: 접수 링크의 글자 + 이름 + 연락처가 모두 맞아야 본인 것만 보임 ----
function statusApi_(linkToken, fn) {
  try { resetMemo_(); return { ok: true, data: fn(statusCourseIds_(linkToken)) }; } catch (e) { return errorResult_(e); }
}
function statusCourseIds_(linkToken) {
  const a = applyRow_(linkToken); if (a) return [String(a.강좌ID)];
  const g = groupRow_(linkToken); return g ? groupIds_(g) : [];
}
function applyStatus_(ids, form) {
  form = form || {};
  if (!ids.length) fail_('접수 링크가 올바르지 않거나 닫혔습니다. 담당자에게 문의해 주세요.', 'LINK');
  const name = normName_(form.이름), ph = normPhone_(form.연락처);
  if (!name || !ph) fail_('접수할 때 적은 이름과 연락처를 모두 입력해 주세요.');
  const courses = readTable_(SHEETS.COURSES).rows;
  const mine = readTable_(SHEETS.APPLICANTS).rows.filter(r => ids.indexOf(String(r.강좌ID)) !== -1 && normName_(r.이름) === name && String(r.연락처 || '') === ph);
  const msg = { 대기: '담당자가 확인하는 중입니다. 확정되면 연락드립니다.', 승인: '수강이 확정되었습니다. 수업 일정에 맞춰 참석해 주세요.', 반려: '이번에는 수강이 어렵습니다. 자세한 사항은 담당자에게 문의해 주세요.' };
  return { 결과: mine.map(r => {
    const c = courses.find(x => String(x.강좌ID) === String(r.강좌ID)) || {}, st = String(r.상태 || '대기');
    return { 강좌명: String(c.강좌명 || ''), 지회명: String(c.지회명 || ''), 상태: st, 안내: msg[st] || '', 신청일시: String(r.신청일시 || ''), 처리일시: String(r.처리일시 || ''), 시작일: dateText_(c.시작일), 종료일: dateText_(c.종료일) };
  }).sort((a, b) => a.신청일시 < b.신청일시 ? 1 : -1) };
}
function applyCourse_(user, courseId) {
  const c = classCourse_(user, courseId);
  if (isHeadcount_(c)) fail_('인원수만 입력하는 강좌는 접수를 받을 수 없습니다.');
  return c;
}
function applyItems_(id) {
  return readTable_(SHEETS.APPLICANTS).rows.filter(r => String(r.강좌ID) === id)
    .map(r => ({ 접수ID: String(r.접수ID), 이름: String(r.이름 || ''), 연락처: String(r.연락처 || ''), 비고: String(r.비고 || ''), 상태: String(r.상태 || '대기'),
      신청일시: String(r.신청일시 || ''), 처리일시: String(r.처리일시 || ''), 신청경로: String(r.신청경로 || ''), 주소: String(r.주소 || ''), 답변: String(r.답변 || '') }))
    .sort((a, b) => a.신청일시 < b.신청일시 ? -1 : a.신청일시 > b.신청일시 ? 1 : 0);
}
function getApply_(user, courseId) {
  const c = applyCourse_(user, courseId), id = String(c.강좌ID);
  const row = readTable_(SHEETS.APPLYLINKS).rows.find(r => String(r.강좌ID) === id);
  const active = !!row && String(row.사용).trim().toUpperCase() !== 'N';
  const dl = applyDeadline_(c, row);
  return { link: { 있음: !!row, active: active, token: active ? String(row.토큰) : '', 마감일: row ? dateText_(row.마감일) : '', 실제마감: dl, 마감됨: !!dl && today_() > dl,
      안내: row ? String(row.안내 || '') : '', 항목: applyFields_(row) }, items: applyItems_(id), 포스터: posterInfo_(c),
    지회항목: chapterApplyFields_(c.지회명, id).map(x => ({ 강좌ID: x.강좌ID, 강좌명: x.강좌명, 항목: x.항목 })) };
}
const POSTER_KEEP_DAYS = 14;   // 접수가 끝난 뒤 포스터 이미지를 지우기까지의 날짜
function addDays_(ymd, n) { const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)) + n)); return d.toISOString().slice(0, 10); }
function posterExpiry_(c, row) { const dl = applyDeadline_(c, row); return /^\d{4}-\d{2}-\d{2}$/.test(dl) ? addDays_(dl, POSTER_KEEP_DAYS) : ''; }
function posterInfo_(c) {
  const r = readTable_(SHEETS.POSTERS).rows.find(x => String(x.강좌ID) === String(c.강좌ID));
  const row = readTable_(SHEETS.APPLYLINKS).rows.find(x => String(x.강좌ID) === String(c.강좌ID));
  return { 있음: !!r, 올린일시: r ? String(r.올린일시 || '') : '', 삭제예정일: r ? posterExpiry_(c, row) : '' };
}
function getPosterImg(token, courseId) { return api_(token, user => ({ 이미지: posterOf_(applyCourse_(user, courseId).강좌ID) })); }
function savePosterImg(token, courseId, data) { return api_(token, user => savePosterImg_(user, courseId, data), true); }
function deletePosterImg(token, courseId) { return api_(token, user => deletePosterImg_(user, courseId), true); }
function savePosterImg_(user, courseId, data) {
  const c = applyCourse_(user, courseId), id = String(c.강좌ID), s = String(data == null ? '' : data);
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(s) || s.length > 450000) fail_('이미지를 확인할 수 없습니다. 더 작은 사진으로 다시 올려 주세요.');
  const t = readTable_(SHEETS.POSTERS), ex = t.rows.find(r => String(r.강좌ID) === id);
  if (ex) { ex.이미지 = s; ex.올린일시 = now_(); updateRow_(t, ex); } else appendRows_(t, [{ 강좌ID: id, 이미지: s, 올린일시: now_() }]);
  log_(user, '접수포스터저장', id);
  return getApply_(user, id);
}
function deletePosterImg_(user, courseId) {
  const c = applyCourse_(user, courseId), id = String(c.강좌ID);
  const t = readTable_(SHEETS.POSTERS), rows = t.rows.filter(r => String(r.강좌ID) === id);
  if (rows.length) deleteRows_(t, rows.map(r => r._row));
  log_(user, '접수포스터삭제', id);
  return getApply_(user, id);
}
// 접수가 끝나고 14일이 지난 강좌의 포스터 이미지를 지움 (매일 자동)
function purgeExpiredPosters_() {
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const t = readTable_(SHEETS.POSTERS);
  if (!t.rows.length) return 0;
  const courses = readTable_(SHEETS.COURSES).rows, links = readTable_(SHEETS.APPLYLINKS).rows;
  const groups = readTable_(SHEETS.APPLYGROUPS).rows;
  const gone = t.rows.filter(r => {
    const g = groups.find(x => String(x.묶음ID) === String(r.강좌ID));
    if (g) { const dl = dateText_(g.마감일); return /^\d{4}-\d{2}-\d{2}$/.test(dl) && addDays_(dl, POSTER_KEEP_DAYS) < today; }   // 접수 안내(묶음) 포스터
    const c = courses.find(x => String(x.강좌ID) === String(r.강좌ID));
    if (!c || c.상태 === '삭제') return true;
    const exp = posterExpiry_(c, links.find(x => String(x.강좌ID) === String(r.강좌ID)));
    return !!exp && exp < today;
  });
  if (gone.length) { deleteRows_(t, gone.map(r => r._row)); log_({ id: 'system', name: '자동삭제' }, '접수포스터자동삭제', `${gone.length}장`); }
  return gone.length;
}
function saveApplyLink_(user, courseId, opt) {
  const c = applyCourse_(user, courseId), id = String(c.강좌ID);
  opt = opt || {};
  const raw = String(opt.마감일 == null ? '' : opt.마감일).trim();
  const dl = raw ? toDateStr_(raw, '접수 마감일') : '';
  if (dl && dl < today_()) fail_('접수 마감일은 오늘 이후 날짜로 정해 주세요.');
  const note = limitText_(opt.안내, 300, '안내 문구');
  const fields = opt.항목 === undefined ? undefined : cleanApplyFields_(opt.항목);
  const t = readTable_(SHEETS.APPLYLINKS);
  let row = t.rows.find(r => String(r.강좌ID) === id);
  const newTok = () => (Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')).slice(0, 40);
  const on = opt.사용 === false ? 'N' : 'Y';
  if (!row) {
    const tok = newTok();
    // 처음 여는 접수: 항목을 따로 정하지 않았으면 같은 지회에서 가장 최근에 쓴 접수 항목을 그대로 사용
    const def = fields === undefined ? (chapterApplyFields_(c.지회명, id)[0] || {}).원본 || '' : fields;
    appendRows_(t, [{ 강좌ID: id, 토큰해시: applyHash_(tok), 토큰: tok, 사용: on, 마감일: dl, 안내: note, 만든일시: now_(), 항목: def }]);
  } else {
    if (opt.새토큰 === true) { const tok = newTok(); row.토큰해시 = applyHash_(tok); row.토큰 = tok; }
    row.사용 = on; row.마감일 = dl; row.안내 = note;
    if (fields !== undefined) row.항목 = fields;
    updateRow_(t, row);
  }
  log_(user, '접수링크저장', id + (on === 'N' ? ' 닫음' : ''));
  return getApply_(user, id);
}
function applyEntry_(id, form, route, fields) {
  const v = validateParticipant_(form);
  const addr = fields && !fields.주소 ? '' : limitText_(form.주소, 200, '주소');   // 선택
  const memo = fields && !fields.전달할말 ? '' : v.비고;
  const ans = fields ? applyAnswers_(fields, form) : [];
  const t = readTable_(SHEETS.APPLICANTS);
  const mine = t.rows.filter(r => String(r.강좌ID) === id);
  if (mine.length >= APPLY_MAX) fail_('접수 건수가 가득 찼습니다. 담당자에게 문의해 주세요.');
  if (mine.some(r => String(r.이름) === v.이름 && String(r.연락처 || '') === v.연락처 && r.상태 !== '반려')) return false;   // 이미 접수됨
  appendRows_(t, [{ 접수ID: 'A' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase(), 강좌ID: id, 이름: v.이름, 연락처: v.연락처, 비고: memo,
    상태: '대기', 신청일시: now_(), 처리일시: '', 신청경로: route, 주소: addr, 답변: ans.length ? JSON.stringify(ans) : '' }]);
  return true;
}
function applySubmit_(user, c, form, row) {
  form = form || {};
  if (String(form.website || '').trim() !== '') return { done: true };   // 자동 입력 프로그램(스팸)은 조용히 무시
  if (form.동의 !== true) fail_('개인정보 수집·이용에 동의해 주세요.');
  if (!normPhone_(form.연락처)) fail_('연락처를 입력해 주세요.');
  const added = applyEntry_(String(c.강좌ID), form, '링크', applyFields_(row));
  return { done: true, 이미접수: !added };
}
function addApply_(user, courseId, form) {
  const c = applyCourse_(user, courseId), id = String(c.강좌ID);
  if (!applyEntry_(id, form, '담당자')) fail_('같은 이름·연락처로 이미 접수되어 있습니다.');
  log_(user, '접수입력', id);
  return getApply_(user, id);
}
function decideApply_(user, courseId, ids, decision) {
  const c = applyCourse_(user, courseId), id = String(c.강좌ID);
  if (['승인', '반려', '대기'].indexOf(decision) === -1) fail_('처리 방법을 확인할 수 없습니다.');
  const want = {}; (Array.isArray(ids) ? ids : []).forEach(x => { want[String(x)] = true; });
  const t = readTable_(SHEETS.APPLICANTS);
  const rows = t.rows.filter(r => String(r.강좌ID) === id && want[String(r.접수ID)]);
  if (!rows.length) fail_('처리할 접수를 선택해 주세요.');
  let note = [];
  if (decision === '승인') {
    const todo = rows.filter(r => r.상태 !== '승인');
    if (todo.length) {
      const res = addParticipants_(user, id, todo.map(r => ({ 이름: r.이름, 연락처: r.연락처, 비고: r.비고 })));
      note = res.skipped.concat(res.warnings);
    }
  }
  const ts = now_();
  rows.forEach(r => { r.상태 = decision; r.처리일시 = decision === '대기' ? '' : ts; updateRow_(t, r); });
  log_(user, '접수' + decision, `${id} ${rows.length}건`);
  return Object.assign(getApply_(user, id), { notes: note });
}
function deleteApply_(user, courseId, ids) {
  const c = applyCourse_(user, courseId), id = String(c.강좌ID);
  const want = {}; (Array.isArray(ids) ? ids : []).forEach(x => { want[String(x)] = true; });
  const t = readTable_(SHEETS.APPLICANTS);
  const rows = t.rows.filter(r => String(r.강좌ID) === id && want[String(r.접수ID)]);
  if (!rows.length) fail_('삭제할 접수를 선택해 주세요.');
  deleteRows_(t, rows.map(r => r._row));
  log_(user, '접수삭제', `${id} ${rows.length}건`);
  return getApply_(user, id);
}


// ===================== 13-7. QR 출석 (수강생이 QR을 찍고 이름+연락처 뒤 4자리로 직접 출석) =====================
const QR_MAX_FAIL = 5;   // 한 휴대폰이 하루에 틀릴 수 있는 횟수
function getSigns(token, courseId) { return api_(token, user => getSigns_(user, courseId)); }
function getSigns_(user, courseId) {   // 참여자ID → 회차 → 서명 그림 (같은 회차에 여러 번이면 마지막 것)
  const c = classCourse_(user, courseId), id = String(c.강좌ID), out = {};
  readTable_(SHEETS.ATTENDSIGN).rows.filter(r => String(r.강좌ID) === id).sort((a, b) => String(a.일시) < String(b.일시) ? -1 : 1)
    .forEach(r => { (out[String(r.참여자ID)] = out[String(r.참여자ID)] || {})[Number(r.회차)] = String(r.서명 || ''); });
  return { 서명: out };
}
function getQr(token, courseId) { return api_(token, user => getQr_(user, courseId)); }
function getAttendNow(token, courseId, session) { return api_(token, user => getAttendNow_(user, courseId, session)); }
// 관리자 출석 화면 자동 갱신용: 한 회차에 지금 출석으로 기록된 사람 (QR로 들어온 출석이 바로 보이게)
function getAttendNow_(user, courseId, session) {
  const c = classCourse_(user, courseId), id = String(c.강좌ID), sn = toInt_(session);
  const present = [];
  readTable_(SHEETS.ATTENDANCE).rows.forEach(r => { if (String(r.강좌ID) === id && Number(r.회차) === sn && r.출석 === 'O') present.push(String(r.참여자ID)); });
  const t = qrTarget_(c);
  const qr = t ? readTable_(SHEETS.QRLOG).rows.filter(r => String(r.강좌ID) === id && Number(r.회차) === t.회차 && String(r.결과) === '성공').length : 0;
  return { 회차: sn, 출석: present, 지금회차: t ? t.회차 : 0, 지금회차QR수: qr };
}
function saveQr(token, courseId, opt) { return api_(token, user => saveQr_(user, courseId, opt), true); }
function attendInfo(linkToken) { return attendApi_(linkToken, (user, c, row) => attendInfo_(c)); }
function attendSubmit(linkToken, form) { return attendApi_(linkToken, (user, c, row) => attendSubmit_(user, c, form), true); }

function attendApi_(linkToken, fn, write) {
  try {
    resetMemo_();
    const run = () => { const x = attendContext_(linkToken); return fn(x.user, x.c, x.row); };
    return { ok: true, data: write ? withLock_(run) : run() };
  } catch (e) {
    return errorResult_(e);
  }
}
function stuHash_(tok) { return sha256_('stu-link|' + tok); }
function stuRow_(linkToken, kind) {
  const tok = String(linkToken == null ? '' : linkToken).trim();
  if (!/^[0-9a-f]{40}$/.test(tok)) return null;
  const h = stuHash_(tok);
  return readTable_(SHEETS.STULINKS).rows.find(r => String(r.토큰해시) === h && String(r.종류) === kind && String(r.사용).trim().toUpperCase() !== 'N') || null;
}
function attendCourseId_(linkToken) { const r = stuRow_(linkToken, '출석'); return r ? String(r.강좌ID) : ''; }
function attendContext_(linkToken) {
  const row = stuRow_(linkToken, '출석');
  const bad = () => fail_('출석 링크가 올바르지 않거나 지금은 닫혀 있습니다. 강사에게 문의해 주세요.', 'LINK');
  if (!row) bad();
  const c = readTable_(SHEETS.COURSES).rows.find(r => String(r.강좌ID) === String(row.강좌ID));
  if (!c || c.상태 === '삭제' || isHeadcount_(c)) bad();
  return { user: { id: 'QR출석', name: 'QR출석', chapter: c.지회명, role: ROLE_CHAPTER }, c: c, row: row };
}
function qrTarget_(c) {   // 지금 QR로 받을 회차: 오늘 수업일로 저장된 회차 → 아직 기록이 없는 가장 앞 회차
  const cid = String(c.강좌ID), total = Number(c.총회차) || 0, today = today_();
  if (today < dateText_(c.시작일) || today > dateText_(c.종료일)) return null;
  const by = {};
  readTable_(SHEETS.ATTENDANCE).rows.forEach(r => { if (String(r.강좌ID) === cid) { const k = Number(r.회차); (by[k] = by[k] || []).push(r); } });
  for (let s = 1; s <= total; s++) if (by[s] && by[s].some(r => sessionDate_(r) === today)) return { 회차: s, 수업일: today };
  for (let s = 1; s <= total; s++) if (!by[s]) return { 회차: s, 수업일: today };
  return null;
}
function attendInfo_(c) {
  const t = qrTarget_(c), cid = String(c.강좌ID);
  // 이름을 잘못 쓰지 않도록 등록된 수강생 이름을 보여 줌 (연락처는 보내지 않음). 이번 회차에 이미 출석한 사람은 표시
  const done = {};
  if (t) readTable_(SHEETS.ATTENDANCE).rows.forEach(r => { if (String(r.강좌ID) === cid && Number(r.회차) === t.회차 && r.출석 === 'O') done[String(r.참여자ID)] = true; });
  const seen = {}, names = [];
  readTable_(SHEETS.PARTICIPANTS).rows.filter(p => String(p.강좌ID) === cid && !isDeleted_(p))
    .sort((a, b) => String(a.이름).localeCompare(String(b.이름), 'ko'))
    .forEach(p => { const nm = String(p.이름 || '').trim(); if (!nm) return; seen[nm] = (seen[nm] || 0) + 1; names.push({ 이름: nm, 출석: !!done[String(p.참여자ID)] }); });
  return { 강좌명: c.강좌명, 지회명: c.지회명, 회차: t ? t.회차 : 0, 수업일: t ? t.수업일 : '', 열림: !!t,
    명단: t ? names.map(x => ({ 이름: x.이름, 출석: x.출석, 같은이름: seen[x.이름] > 1 })) : [] };
}
function normName_(v) { return String(v == null ? '' : v).replace(/\s+/g, '').toLowerCase(); }
function matchPart_(cid, name, last4) {   // 이름 + 연락처 뒤 4자리로 명단에서 한 사람 찾기 (연락처가 없으면 이름만)
  return readTable_(SHEETS.PARTICIPANTS).rows.filter(p => String(p.강좌ID) === cid && !isDeleted_(p) && normName_(p.이름) === name).filter(p => {
    const ph = String(p.연락처 || '').replace(/\D/g, '');
    return ph.length >= 4 ? ph.slice(-4) === last4 : true;
  });
}
function attendSubmit_(user, c, form) {
  form = form || {};
  if (String(form.website || '').trim() !== '') return { done: false, 사유: '처리하지 못했습니다.' };   // 자동 입력 프로그램은 조용히 무시
  const cid = String(c.강좌ID);
  const dev = String(form.기기 == null ? '' : form.기기).trim();
  if (!/^[0-9a-zA-Z-]{16,64}$/.test(dev)) fail_('이 휴대폰을 확인할 수 없습니다. 브라우저를 새로 열어 다시 시도해 주세요.');
  const dh = sha256_('qr-dev|' + cid + '|' + dev);
  const name = normName_(form.이름);
  if (!name) fail_('이름을 입력해 주세요.');
  const last4 = String(form.뒤4자리 == null ? '' : form.뒤4자리).replace(/\D/g, '');
  if (last4 && last4.length !== 4) fail_('연락처 뒤 4자리를 숫자 4개로 입력해 주세요. (명단에 연락처가 없으면 비워 두세요)');
  const sign = form.서명 ? pngOk_(form.서명, '수강생') : '';
  const t = qrTarget_(c);
  if (!t) fail_('지금은 QR 출석을 받는 회차가 없습니다. 수업일에 다시 시도하거나 강사에게 말씀해 주세요.');
  const log = readTable_(SHEETS.QRLOG);
  const mine = log.rows.filter(r => String(r.강좌ID) === cid && String(r.기기) === dh);
  if (mine.some(r => Number(r.회차) === t.회차 && String(r.결과) === '성공')) fail_('이 휴대폰으로는 이미 이번 회차 출석을 했습니다. 한 휴대폰으로는 한 사람만 출석할 수 있어요. 다른 분은 강사에게 말씀해 주세요.');
  const today = today_();
  const fails = mine.filter(r => String(r.결과) === '실패' && String(r.일시).slice(0, 10) === today).length;
  if (fails >= QR_MAX_FAIL) fail_('확인에 여러 번 실패해 오늘은 이 휴대폰으로 출석할 수 없습니다. 강사에게 말씀해 주세요.');
  const hit = matchPart_(cid, name, last4);
  const ts = now_();
  if (hit.length !== 1) {
    appendRows_(log, [{ 강좌ID: cid, 회차: t.회차, 기기: dh, 참여자ID: '', 결과: '실패', 일시: ts }]);
    return { done: false, 사유: '이름 또는 연락처 뒤 4자리가 명단과 맞지 않습니다. 다시 확인하거나 강사에게 말씀해 주세요.', 남은횟수: Math.max(0, QR_MAX_FAIL - fails - 1) };
  }
  const pid = String(hit[0].참여자ID);
  const present = [];
  readTable_(SHEETS.ATTENDANCE).rows.forEach(r => { if (String(r.강좌ID) === cid && Number(r.회차) === t.회차 && r.출석 === 'O') present.push(String(r.참여자ID)); });
  const already = present.indexOf(pid) !== -1;
  if (!already) { present.push(pid); saveAttendance_(user, cid, t.회차, present, t.수업일); }
  appendRows_(log, [{ 강좌ID: cid, 회차: t.회차, 기기: dh, 참여자ID: pid, 결과: '성공', 일시: ts }]);
  if (sign) appendRows_(readTable_(SHEETS.ATTENDSIGN), [{ 강좌ID: cid, 회차: t.회차, 참여자ID: pid, 서명: sign, 일시: ts }]);
  return { done: true, 이미: already, 이름: String(hit[0].이름), 회차: t.회차, 수업일: t.수업일, 강좌명: c.강좌명 };
}
function qrCourse_(user, courseId) {
  const c = classCourse_(user, courseId);
  if (isHeadcount_(c)) fail_('인원수만 입력하는 강좌에서는 QR 출석을 쓸 수 없습니다.');
  return c;
}
function getQr_(user, courseId) {
  const c = qrCourse_(user, courseId), id = String(c.강좌ID);
  const row = readTable_(SHEETS.STULINKS).rows.find(r => String(r.강좌ID) === id && String(r.종류) === '출석');
  const active = !!row && String(row.사용).trim().toUpperCase() !== 'N';
  const t = qrTarget_(c);
  const n = t ? readTable_(SHEETS.QRLOG).rows.filter(r => String(r.강좌ID) === id && Number(r.회차) === t.회차 && String(r.결과) === '성공').length : 0;
  return { link: { 있음: !!row, active: active, token: active ? String(row.토큰) : '' }, 지금회차: t ? t.회차 : 0, 지금회차QR수: n };
}
function saveQr_(user, courseId, opt) {
  const c = qrCourse_(user, courseId), id = String(c.강좌ID);
  opt = opt || {};
  const t = readTable_(SHEETS.STULINKS);
  let row = t.rows.find(r => String(r.강좌ID) === id && String(r.종류) === '출석');
  const newTok = () => (Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')).slice(0, 40);
  const on = opt.사용 === false ? 'N' : 'Y';
  if (!row) {
    const tok = newTok();
    appendRows_(t, [{ 강좌ID: id, 종류: '출석', 토큰해시: stuHash_(tok), 토큰: tok, 사용: on, 만든일시: now_() }]);
  } else {
    if (opt.새토큰 === true) { const tok = newTok(); row.토큰해시 = stuHash_(tok); row.토큰 = tok; }
    row.사용 = on;
    updateRow_(t, row);
  }
  log_(user, 'QR출석' + (opt.새토큰 ? '교체' : on === 'N' ? '닫음' : '열기'), id);
  return getQr_(user, id);
}


// ===================== 13-8. 수강료 · 영수증(납입 확인서) · 환불 요청 =====================
function getPay(token, courseId) { return api_(token, user => getPay_(user, courseId)); }
function setPaid(token, courseId, pids, opt) { return api_(token, user => setPaid_(user, courseId, pids, opt), true); }
function unsetPaid(token, courseId, pids) { return api_(token, user => unsetPaid_(user, courseId, pids), true); }
function issueReceipts(token, courseId, pids, date) { return api_(token, user => issueReceipts_(user, courseId, pids, date), true); }
function voidReceipt(token, courseId, pid) { return api_(token, user => voidReceipt_(user, courseId, pid), true); }
function createRefundLink(token, courseId, pid) { return api_(token, user => createRefundLink_(user, courseId, pid), true); }
function saveRefundRequest(token, courseId, pid, form) { return api_(token, user => saveRefundRequest_(user, courseId, pid, form), true); }
function completeRefund(token, courseId, pid, date) { return api_(token, user => completeRefund_(user, courseId, pid, date), true); }
function cancelRefundRequest(token, courseId, pid) { return api_(token, user => cancelRefundRequest_(user, courseId, pid), true); }
function savePayLink(token, courseId, opt) { return api_(token, user => savePayLink_(user, courseId, opt), true); }
function payInfo(linkToken) { return payApi_(linkToken, (user, c, row) => payInfo_(c, row)); }
function payReceipt(linkToken, form) { return payApi_(linkToken, (user, c, row) => payReceipt_(user, c, form), true); }
function refundInfo(linkToken) { return refundApi_(linkToken, (user, c, pay) => refundInfo_(c, pay)); }
function refundSubmit(linkToken, form) { return refundApi_(linkToken, (user, c, pay) => refundSubmit_(c, pay, form), true); }

const PAY_METHODS = ['현금', '계좌이체', '카드'];
function payApi_(linkToken, fn, write) {
  try {
    resetMemo_();
    const run = () => {
      const row = stuRow_(linkToken, '영수증');
      if (!row) fail_('영수증 링크가 올바르지 않거나 지금은 닫혀 있습니다. 담당자에게 문의해 주세요.', 'LINK');
      const c = readTable_(SHEETS.COURSES).rows.find(r => String(r.강좌ID) === String(row.강좌ID));
      if (!c || c.상태 === '삭제' || isHeadcount_(c)) fail_('영수증 링크가 올바르지 않거나 지금은 닫혀 있습니다. 담당자에게 문의해 주세요.', 'LINK');
      return fn({ id: '영수증링크', name: '영수증링크', chapter: c.지회명, role: ROLE_CHAPTER }, c, row);
    };
    return { ok: true, data: write ? withLock_(run) : run() };
  } catch (e) {
    return errorResult_(e);
  }
}
function payCourseId_(linkToken) { const r = stuRow_(linkToken, '영수증'); return r ? String(r.강좌ID) : ''; }
function refundHash_(tok) { return sha256_('refund-link|' + tok); }
function refundApi_(linkToken, fn, write) {
  try {
    resetMemo_();
    const run = () => {
      const tok = String(linkToken == null ? '' : linkToken).trim();
      const bad = () => fail_('환불 요청 링크가 올바르지 않거나 이미 처리되었습니다. 담당자에게 문의해 주세요.', 'LINK');
      if (!/^[0-9a-f]{40}$/.test(tok)) bad();
      const h = refundHash_(tok);
      const pay = readTable_(SHEETS.PAYMENTS).rows.find(r => String(r.환불토큰해시) === h && String(r.상태) !== '환불완료');
      if (!pay) bad();
      const c = readTable_(SHEETS.COURSES).rows.find(r => String(r.강좌ID) === String(pay.강좌ID));
      if (!c || c.상태 === '삭제') bad();
      return fn({ id: '환불링크', name: '환불링크', chapter: c.지회명, role: ROLE_CHAPTER }, c, pay);
    };
    return { ok: true, data: write ? withLock_(run) : run() };
  } catch (e) {
    return errorResult_(e);
  }
}
function payCourse_(user, courseId) {
  const c = classCourse_(user, courseId);
  if (isHeadcount_(c) || String(c.파견ID || '')) fail_('이 강좌는 수강료를 받지 않는 강좌입니다.');
  return c;
}
function payRows_(cid) { return readTable_(SHEETS.PAYMENTS).rows.filter(r => String(r.강좌ID) === cid); }
function payCurrent_(rows, pid) {   // 한 사람의 가장 최근 수납 (환불완료 뒤에 다시 낸 경우를 위해 마지막 줄)
  const mine = rows.filter(r => String(r.참여자ID) === String(pid));
  return mine.length ? mine[mine.length - 1] : null;
}
function payOut_(r) {
  if (!r) return { 수납: false };
  return { 수납: true, 수납ID: String(r.수납ID), 금액: Number(r.금액) || 0, 납부일: dateText_(r.납부일), 방법: String(r.방법 || ''), 상태: String(r.상태 || '납부'),
    영수번호: String(r.영수번호 || ''), 영수일: dateText_(r.영수일), 영수상태: String(r.영수상태 || ''), 환불요청일시: String(r.환불요청일시 || ''), 환불사유: String(r.환불사유 || ''),
    환불은행: String(r.환불은행 || ''), 환불계좌: String(r.환불계좌 || ''), 환불예금주: String(r.환불예금주 || ''), 환불일: dateText_(r.환불일), 환불링크: !!String(r.환불토큰 || '') };
}
function getPay_(user, courseId) {
  const c = payCourse_(user, courseId), cid = String(c.강좌ID);
  const pays = payRows_(cid);
  const parts = readTable_(SHEETS.PARTICIPANTS).rows.filter(p => String(p.강좌ID) === cid);
  const items = [];
  parts.forEach(p => {
    const cur = payCurrent_(pays, p.참여자ID), gone = isDeleted_(p);
    if (gone && !cur) return;
    items.push(Object.assign({ 참여자ID: String(p.참여자ID), 이름: String(p.이름 || '') + (gone ? ' (명단에서 삭제됨)' : ''), 연락처: String(p.연락처 || '') }, payOut_(cur)));
  });
  const row = readTable_(SHEETS.STULINKS).rows.find(r => String(r.강좌ID) === cid && String(r.종류) === '영수증');
  const active = !!row && String(row.사용).trim().toUpperCase() !== 'N';
  const paid = items.filter(x => x.수납 && x.상태 !== '환불완료').length;
  return { 수강료: Number(c.수강료) || 0, items: items, link: { 있음: !!row, active: active, token: active ? String(row.토큰) : '' },
    합계: { 납부: paid, 환불요청: items.filter(x => x.상태 === '환불요청').length, 환불완료: items.filter(x => x.상태 === '환불완료').length,
      납부액: items.filter(x => x.수납 && x.상태 !== '환불완료').reduce((a, x) => a + x.금액, 0) } };
}
function payIds_(pids, cid) {
  const set = {}; (Array.isArray(pids) ? pids : []).forEach(x => { set[String(x)] = true; });
  const parts = readTable_(SHEETS.PARTICIPANTS).rows.filter(p => String(p.강좌ID) === cid && !isDeleted_(p) && set[String(p.참여자ID)]);
  if (!parts.length) fail_('먼저 사람을 선택해 주세요.');
  return parts;
}
function payMoney_(v, label) {
  const t = String(v == null ? '' : v).replace(/[,\s원]/g, '');
  if (!/^\d{1,9}$/.test(t) || Number(t) <= 0) fail_(`${label}은(는) 0보다 큰 숫자(원)로 입력해 주세요.`);
  return Number(t);
}
function setPaid_(user, courseId, pids, opt) {
  const c = payCourse_(user, courseId), cid = String(c.강좌ID);
  opt = opt || {};
  const fee = Number(c.수강료) || 0;
  if (!fee && !opt.금액) fail_('먼저 강좌 정보에서 수강료를 입력해 주세요.');
  const amount = opt.금액 === '' || opt.금액 == null ? fee : payMoney_(opt.금액, '납부 금액');
  const day = opt.납부일 ? toDateStr_(opt.납부일, '납부일') : today_();
  const method = PAY_METHODS.indexOf(String(opt.방법 || '')) !== -1 ? String(opt.방법) : '계좌이체';
  const parts = payIds_(pids, cid);
  const t = readTable_(SHEETS.PAYMENTS), ts = now_(), add = [];
  parts.forEach(p => {
    const cur = payCurrent_(t.rows, p.참여자ID);
    if (cur && String(cur.상태) !== '환불완료') {
      if (String(cur.상태) === '환불요청') fail_(`${p.이름}님은 환불 요청 중입니다. 환불 요청을 먼저 처리해 주세요.`);
      if (String(cur.영수번호) && String(cur.영수상태) === '발급') fail_(`${p.이름}님은 영수증이 발급되어 납부 내용을 바꿀 수 없습니다. 영수증을 먼저 취소해 주세요.`);
      Object.assign(cur, { 금액: amount, 납부일: day, 방법: method, 수정일시: ts });
      updateRow_(t, cur);
    } else {
      add.push({ 수납ID: 'P' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase(), 강좌ID: cid, 지회명: c.지회명, 참여자ID: String(p.참여자ID), 금액: amount, 납부일: day, 방법: method,
        상태: '납부', 영수번호: '', 영수일: '', 영수상태: '', 환불요청일시: '', 환불사유: '', 환불은행: '', 환불계좌: '', 환불예금주: '', 환불일: '', 환불토큰해시: '', 환불토큰: '', 만든일시: ts, 수정일시: ts });
    }
  });
  if (add.length) appendRows_(t, add);
  log_(user, '납부처리', `${cid} ${parts.length}명 ${amount}원`);
  return getPay_(user, cid);
}
function unsetPaid_(user, courseId, pids) {
  const c = payCourse_(user, courseId), cid = String(c.강좌ID);
  const parts = payIds_(pids, cid), t = readTable_(SHEETS.PAYMENTS);
  const del = [];
  parts.forEach(p => {
    const cur = payCurrent_(t.rows, p.참여자ID);
    if (!cur || String(cur.상태) === '환불완료') return;
    if (String(cur.영수번호)) fail_(`${p.이름}님은 영수증이 발급된 적이 있어 납부 표시를 지울 수 없습니다. 잘못 처리했다면 영수증 취소 후 환불 처리를 이용하세요.`);
    if (String(cur.상태) === '환불요청') fail_(`${p.이름}님은 환불 요청 중입니다.`);
    del.push(cur._row);
  });
  if (!del.length) fail_('지울 납부 표시가 없습니다.');
  deleteRows_(t, del);
  log_(user, '납부취소', `${cid} ${del.length}명`);
  return getPay_(user, cid);
}
function issueReceipts_(user, courseId, pids, date) {
  const c = payCourse_(user, courseId), cid = String(c.강좌ID);
  const when = date ? toDateStr_(date, '발급일') : today_();
  const parts = payIds_(pids, cid), t = readTable_(SHEETS.PAYMENTS);
  const stem = '영수-' + cid + '-';
  let seq = 0;
  t.rows.forEach(r => { const no = String(r.영수번호 || ''); if (String(r.강좌ID) === cid && no.indexOf(stem) === 0) seq = Math.max(seq, parseInt(no.slice(stem.length), 10) || 0); });
  const done = [];
  parts.forEach(p => {
    const cur = payCurrent_(t.rows, p.참여자ID);
    if (!cur || String(cur.상태) !== '납부') fail_(`${p.이름}님은 납부가 확인되지 않아 영수증을 발급할 수 없습니다. 먼저 납부 처리를 해 주세요.`);
    if (String(cur.영수번호) && String(cur.영수상태) === '발급') { done.push(String(p.참여자ID)); return; }   // 이미 발급된 사람은 같은 번호
    seq++;
    Object.assign(cur, { 영수번호: stem + String(seq).padStart(2, '0'), 영수일: when, 영수상태: '발급', 수정일시: now_() });
    updateRow_(t, cur);
    done.push(String(p.참여자ID));
  });
  log_(user, '영수증발급', `${cid} ${done.length}명`);
  return Object.assign(getPay_(user, cid), { 발급대상: done });
}
function voidReceipt_(user, courseId, pid) {
  const c = payCourse_(user, courseId), cid = String(c.강좌ID);
  const t = readTable_(SHEETS.PAYMENTS), cur = payCurrent_(t.rows.filter(r => String(r.강좌ID) === cid), pid);
  if (!cur || !String(cur.영수번호) || String(cur.영수상태) !== '발급') fail_('취소할 영수증이 없습니다.');
  Object.assign(cur, { 영수상태: '취소', 수정일시: now_() });
  updateRow_(t, cur);
  log_(user, '영수증취소', `${cid} ${cur.영수번호}`);
  return getPay_(user, cid);
}
function payTarget_(user, courseId, pid) {
  const c = payCourse_(user, courseId), cid = String(c.강좌ID);
  const t = readTable_(SHEETS.PAYMENTS), cur = payCurrent_(t.rows.filter(r => String(r.강좌ID) === cid), pid);
  if (!cur || String(cur.상태) === '환불완료') fail_('납부 기록이 없거나 이미 환불이 끝났습니다.');
  return { c: c, cid: cid, t: t, cur: cur };
}
function newPlainToken_() { return (Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')).slice(0, 40); }
function createRefundLink_(user, courseId, pid) {
  const x = payTarget_(user, courseId, pid);
  if (String(x.cur.상태) !== '납부') fail_('이미 환불 요청이 들어와 있습니다.');
  const tok = newPlainToken_();
  Object.assign(x.cur, { 환불토큰해시: refundHash_(tok), 환불토큰: tok, 수정일시: now_() });
  updateRow_(x.t, x.cur);
  log_(user, '환불링크', `${x.cid}`);
  return Object.assign(getPay_(user, x.cid), { 환불링크토큰: tok });
}
function refundForm_(form) {
  form = form || {};
  const bank = limitText_(form.은행, 30, '은행'), acct = String(form.계좌 == null ? '' : form.계좌).replace(/[^0-9-]/g, '').slice(0, 30), holder = limitText_(form.예금주, 30, '예금주');
  if (!bank || !acct || !holder) fail_('은행, 계좌번호, 예금주를 모두 입력해 주세요.');
  if (acct.replace(/-/g, '').length < 8) fail_('계좌번호를 확인해 주세요.');
  return { 환불은행: bank, 환불계좌: acct, 환불예금주: holder, 환불사유: limitText_(form.사유, 200, '환불 사유') };
}
function saveRefundRequest_(user, courseId, pid, form) {   // 종이로 받은 환불 요청서 내용을 담당자가 대신 입력
  const x = payTarget_(user, courseId, pid);
  if (String(x.cur.상태) !== '납부') fail_('이미 환불 요청이 들어와 있습니다.');
  Object.assign(x.cur, refundForm_(form), { 상태: '환불요청', 환불요청일시: now_(), 수정일시: now_() });
  updateRow_(x.t, x.cur);
  log_(user, '환불요청입력', `${x.cid}`);
  return getPay_(user, x.cid);
}
function completeRefund_(user, courseId, pid, date) {
  const x = payTarget_(user, courseId, pid);
  if (String(x.cur.상태) !== '환불요청') fail_('환불 요청이 접수된 건만 환불 완료 처리할 수 있습니다.');
  Object.assign(x.cur, { 상태: '환불완료', 환불일: date ? toDateStr_(date, '환불일') : today_(), 환불은행: '', 환불계좌: '', 환불예금주: '', 환불토큰해시: '', 환불토큰: '', 수정일시: now_() });
  if (String(x.cur.영수번호)) x.cur.영수상태 = '취소';   // 영수증은 취소됨으로 남김
  updateRow_(x.t, x.cur);
  log_(user, '환불완료', `${x.cid}`);
  return getPay_(user, x.cid);
}
function cancelRefundRequest_(user, courseId, pid) {
  const x = payTarget_(user, courseId, pid);
  if (String(x.cur.상태) !== '환불요청') fail_('환불 요청이 없습니다.');
  Object.assign(x.cur, { 상태: '납부', 환불요청일시: '', 환불사유: '', 환불은행: '', 환불계좌: '', 환불예금주: '', 환불토큰해시: '', 환불토큰: '', 수정일시: now_() });
  updateRow_(x.t, x.cur);
  log_(user, '환불요청취소', `${x.cid}`);
  return getPay_(user, x.cid);
}
function savePayLink_(user, courseId, opt) {
  const c = payCourse_(user, courseId), id = String(c.강좌ID);
  opt = opt || {};
  const t = readTable_(SHEETS.STULINKS);
  let row = t.rows.find(r => String(r.강좌ID) === id && String(r.종류) === '영수증');
  const on = opt.사용 === false ? 'N' : 'Y';
  if (!row) { const tok = newPlainToken_(); appendRows_(t, [{ 강좌ID: id, 종류: '영수증', 토큰해시: stuHash_(tok), 토큰: tok, 사용: on, 만든일시: now_() }]); }
  else { if (opt.새토큰 === true) { const tok = newPlainToken_(); row.토큰해시 = stuHash_(tok); row.토큰 = tok; } row.사용 = on; updateRow_(t, row); }
  log_(user, '영수증링크' + (on === 'N' ? '닫음' : '열기'), id);
  return getPay_(user, id);
}
function payInfo_(c, row) {
  return { 강좌명: c.강좌명, 지회명: c.지회명, 수강료: Number(c.수강료) || 0, 시작일: dateText_(c.시작일), 종료일: dateText_(c.종료일) };
}
function receiptData_(c, p, pay) {
  const seal = readTable_(SHEETS.SEALS).rows.find(r => r.지회명 === c.지회명 && String(r.종류) === '지회');
  return { 번호: String(pay.영수번호), 이름: String(p.이름), 강좌명: c.강좌명, 지회명: c.지회명, 시작일: dateText_(c.시작일), 종료일: dateText_(c.종료일),
    금액: Number(pay.금액) || 0, 납부일: dateText_(pay.납부일), 방법: String(pay.방법 || ''), 발급일: dateText_(pay.영수일), 직인: seal ? String(seal.이미지 || '') : '' };
}
function payReceipt_(user, c, form) {   // 수강생이 직접 받기: 이름 + 연락처 뒤 4자리 → 납부가 확인된 사람에게만 영수증
  form = form || {};
  if (String(form.website || '').trim() !== '') return { done: false, 사유: '처리하지 못했습니다.' };
  const cid = String(c.강좌ID), dev = String(form.기기 == null ? '' : form.기기).trim();
  if (!/^[0-9a-zA-Z-]{16,64}$/.test(dev)) fail_('이 휴대폰을 확인할 수 없습니다. 브라우저를 새로 열어 다시 시도해 주세요.');
  const dh = sha256_('pay-dev|' + cid + '|' + dev), name = normName_(form.이름);
  if (!name) fail_('이름을 입력해 주세요.');
  const last4 = String(form.뒤4자리 == null ? '' : form.뒤4자리).replace(/\D/g, '');
  if (last4 && last4.length !== 4) fail_('연락처 뒤 4자리를 숫자 4개로 입력해 주세요. (명단에 연락처가 없으면 비워 두세요)');
  const log = readTable_(SHEETS.QRLOG), today = today_();
  const fails = log.rows.filter(r => String(r.강좌ID) === cid && String(r.기기) === dh && String(r.결과) === '영수실패' && String(r.일시).slice(0, 10) === today).length;
  if (fails >= QR_MAX_FAIL) fail_('확인에 여러 번 실패해 오늘은 이 휴대폰으로 받을 수 없습니다. 담당자에게 문의해 주세요.');
  const hit = matchPart_(cid, name, last4);
  const pays = payRows_(cid), cur = hit.length === 1 ? payCurrent_(pays, hit[0].참여자ID) : null;
  const bad = msg => { appendRows_(log, [{ 강좌ID: cid, 회차: 0, 기기: dh, 참여자ID: '', 결과: '영수실패', 일시: now_() }]); return { done: false, 사유: msg, 남은횟수: Math.max(0, QR_MAX_FAIL - fails - 1) }; };
  if (hit.length !== 1) return bad('이름 또는 연락처 뒤 4자리가 명단과 맞지 않습니다. 다시 확인하거나 담당자에게 문의해 주세요.');
  if (!cur || String(cur.상태) === '환불완료') return { done: false, 사유: '아직 납부가 확인되지 않았습니다. 담당자가 납부를 확인한 뒤에 받을 수 있습니다.' };
  if (String(cur.상태) === '환불요청') return { done: false, 사유: '환불 요청 중이라 영수증을 받을 수 없습니다.' };
  if (!(String(cur.영수번호) && String(cur.영수상태) === '발급')) {   // 아직 번호가 없으면 지금 발급
    let seq = 0; const stem = '영수-' + cid + '-';
    pays.forEach(r => { const no = String(r.영수번호 || ''); if (no.indexOf(stem) === 0) seq = Math.max(seq, parseInt(no.slice(stem.length), 10) || 0); });
    Object.assign(cur, { 영수번호: stem + String(seq + 1).padStart(2, '0'), 영수일: today, 영수상태: '발급', 수정일시: now_() });
    updateRow_(readTable_(SHEETS.PAYMENTS), cur);
  }
  return { done: true, 영수증: receiptData_(c, hit[0], cur) };
}
function refundInfo_(c, pay) {
  return { 강좌명: c.강좌명, 지회명: c.지회명, 금액: Number(pay.금액) || 0, 납부일: dateText_(pay.납부일), 영수번호: String(pay.영수번호 || ''), 이미요청: String(pay.상태) === '환불요청' };
}
function refundSubmit_(c, pay, form) {
  form = form || {};
  if (String(form.website || '').trim() !== '') return { done: true };
  if (form.동의 !== true) fail_('개인정보(계좌) 수집·이용에 동의해 주세요.');
  if (String(pay.상태) !== '납부') fail_('이미 환불 요청이 접수되었습니다. 담당자가 확인할 때까지 기다려 주세요.');
  Object.assign(pay, refundForm_(form), { 상태: '환불요청', 환불요청일시: now_(), 수정일시: now_() });
  updateRow_(readTable_(SHEETS.PAYMENTS), pay);
  return { done: true };
}


// ===================== 13-6b. 교육 접수 안내 (강좌별 링크·QR, 여러 강좌를 묶은 링크·QR) =====================
const GROUP_MAX_COURSES = 20;
function getApplyHub(token) { return api_(token, user => getApplyHub_(user)); }
function saveApplyGroup(token, opt) { return api_(token, user => saveApplyGroup_(user, opt), true); }
function deleteApplyGroup(token, groupId) { return api_(token, user => deleteApplyGroup_(user, groupId), true); }
function createApplyLinks(token, courseIds) { return api_(token, user => createApplyLinks_(user, courseIds), true); }
function groupInfo(linkToken) { return groupApi_(linkToken, (user, row, courses) => groupInfo_(row, courses)); }
function getGroupPoster(token, groupId) { return api_(token, user => ({ 이미지: posterOf_(myGroup_(user, groupId).묶음ID) })); }
function saveGroupPoster(token, groupId, data) { return api_(token, user => saveGroupPoster_(user, groupId, data), true); }
function deleteGroupPoster(token, groupId) { return api_(token, user => deleteGroupPoster_(user, groupId), true); }
function myGroup_(user, groupId) {
  const g = readTable_(SHEETS.APPLYGROUPS).rows.find(x => String(x.묶음ID) === String(groupId) && x.지회명 === user.chapter);
  if (!g) fail_('접수 안내를 찾을 수 없습니다.');
  return g;
}
function saveGroupPoster_(user, groupId, data) {
  const g = myGroup_(user, groupId), id = String(g.묶음ID), s = String(data == null ? '' : data);
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(s) || s.length > 450000) fail_('이미지를 확인할 수 없습니다. 더 작은 사진으로 다시 올려 주세요.');
  const t = readTable_(SHEETS.POSTERS), ex = t.rows.find(r => String(r.강좌ID) === id);
  if (ex) { ex.이미지 = s; ex.올린일시 = now_(); updateRow_(t, ex); } else appendRows_(t, [{ 강좌ID: id, 이미지: s, 올린일시: now_() }]);
  log_(user, '접수포스터저장', id);
  return { 있음: true };
}
function deleteGroupPoster_(user, groupId) {
  const g = myGroup_(user, groupId), id = String(g.묶음ID);
  const t = readTable_(SHEETS.POSTERS), rows = t.rows.filter(r => String(r.강좌ID) === id);
  if (rows.length) deleteRows_(t, rows.map(r => r._row));
  log_(user, '접수포스터삭제', id);
  return { 있음: false };
}
function groupSubmit(linkToken, form) { return groupApi_(linkToken, (user, row, courses) => groupSubmit_(row, courses, form), true); }

function groupApi_(linkToken, fn, write) {
  try {
    resetMemo_();
    const run = () => { const x = groupContext_(linkToken); return fn(x.user, x.row, x.courses); };
    return { ok: true, data: write ? withLock_(run) : run() };
  } catch (e) {
    return errorResult_(e);
  }
}
function groupHash_(tok) { return sha256_('group-link|' + tok); }
function groupRow_(linkToken) {
  const tok = String(linkToken == null ? '' : linkToken).trim();
  if (!/^[0-9a-f]{40}$/.test(tok)) return null;
  const h = groupHash_(tok);
  return readTable_(SHEETS.APPLYGROUPS).rows.find(r => String(r.토큰해시) === h && String(r.사용).trim().toUpperCase() !== 'N') || null;
}
function groupIds_(row) { return String(row.강좌IDs || '').split(',').map(x => x.trim()).filter(x => x); }
function groupCourseIds_(linkToken) { const r = groupRow_(linkToken); return r ? groupIds_(r) : []; }
function groupDeadline_(c, row) {
  const own = row ? dateText_(row.마감일) : '';
  return deadlineOr_(own, c);
}
function groupContext_(linkToken) {
  const row = groupRow_(linkToken);
  if (!row) fail_('접수 링크가 올바르지 않거나 닫혔습니다. 담당자에게 문의해 주세요.', 'LINK');
  const ids = groupIds_(row), all = readTable_(SHEETS.COURSES).rows;
  const courses = ids.map(id => all.find(c => String(c.강좌ID) === id)).filter(c => c && c.상태 !== '삭제' && !isHeadcount_(c));
  if (!courses.length) fail_('접수 링크가 올바르지 않거나 닫혔습니다. 담당자에게 문의해 주세요.', 'LINK');
  const open = courses.filter(c => { const dl = groupDeadline_(c, row); return dl && today_() <= dl; });
  if (!open.length) fail_('접수가 마감되었습니다.', 'LINK');
  return { user: { id: '접수링크', name: '접수링크', chapter: row.지회명, role: ROLE_CHAPTER }, row: row, courses: open };
}
function groupInfo_(row, courses) {
  return { 제목: String(row.제목 || ''), 지회명: String(row.지회명 || ''), 안내: String(row.안내 || ''), 포스터: posterOf_(row.묶음ID),
    강좌: courses.map(c => ({ 강좌ID: String(c.강좌ID), 강좌명: c.강좌명, 시작일: dateText_(c.시작일), 종료일: dateText_(c.종료일), 총회차: Number(c.총회차) || 0, 회당시간: Number(c.회당시간) || 0,
      기관명: c.기관명 || '', 강사: c.강사 || '', 수준: c.수준 || '', 마감일: groupDeadline_(c, row) })) };
}
function groupSubmit_(row, courses, form) {
  form = form || {};
  if (String(form.website || '').trim() !== '') return { done: true, 결과: [] };   // 자동 입력 프로그램(스팸)은 조용히 무시
  if (form.동의 !== true) fail_('개인정보 수집·이용에 동의해 주세요.');
  if (!normPhone_(form.연락처)) fail_('연락처를 입력해 주세요.');
  const want = {}; (Array.isArray(form.강좌IDs) ? form.강좌IDs : []).forEach(x => { want[String(x)] = true; });
  const picked = courses.filter(c => want[String(c.강좌ID)]);
  if (!picked.length) fail_('신청할 강좌를 하나 이상 선택해 주세요.');
  const res = picked.map(c => ({ 강좌ID: String(c.강좌ID), 강좌명: c.강좌명, 이미접수: !applyEntry_(String(c.강좌ID), form, '묶음링크') }));
  return { done: true, 결과: res };
}
function applyCourseRows_(user) {
  return readTable_(SHEETS.COURSES).rows.filter(c => c.상태 !== '삭제' && !isHeadcount_(c) && c.지회명 === user.chapter);
}
function getApplyHub_(user) {
  const links = readTable_(SHEETS.APPLYLINKS).rows, apps = readTable_(SHEETS.APPLICANTS).rows;
  const count = id => { const m = apps.filter(a => String(a.강좌ID) === id); return { 접수수: m.length, 대기수: m.filter(a => (a.상태 || '대기') === '대기').length }; };
  const rows = applyCourseRows_(user).sort((a, b) => String(dateText_(b.시작일)).localeCompare(String(dateText_(a.시작일))));
  const courses = rows.map(c => {
    const id = String(c.강좌ID), row = links.find(r => String(r.강좌ID) === id);
    const active = !!row && String(row.사용).trim().toUpperCase() !== 'N', dl = applyDeadline_(c, row);
    const ctr = String(c.주관) === '센터' || String(c.지회명) === HQ;
    return Object.assign({ 강좌ID: id, 강좌명: c.강좌명, 시작일: dateText_(c.시작일), 종료일: dateText_(c.종료일), 기관명: c.기관명 || '', 진행상태: c.상태 || '',
      포스터: { 수준: String(c.수준 || ''), 총회차: Number(c.총회차) || 0, 회당시간: Number(c.회당시간) || 0, 수강료: Number(c.수강료) || 0, 요일시간: String(c.요일시간 || ''), 장소: String(c.장소 || ''), 모집인원: String(c.모집인원 || ''),
        접수시작: dateText_(c.접수시작), 접수마감: dateText_(c.접수마감), 주관: ctr ? '센터' : '지회', 연락처: ctr ? centerContact_(user) : memberPhone_(user), 지회명: String(c.지회명) },
      link: { 있음: !!row, active: active, token: active ? String(row.토큰) : '', 실제마감: dl, 마감됨: !!dl && today_() > dl } }, count(id));
  });
  const byId = {}; courses.forEach(c => { byId[c.강좌ID] = c; });
  const groups = readTable_(SHEETS.APPLYGROUPS).rows.filter(g => g.지회명 === user.chapter).map(g => {
    const ids = groupIds_(g).filter(id => byId[id]), active = String(g.사용).trim().toUpperCase() !== 'N';
    return { 묶음ID: String(g.묶음ID), 제목: String(g.제목 || ''), 강좌IDs: ids, 강좌: ids.map(id => ({ 강좌ID: id, 강좌명: byId[id].강좌명 })), active: active, token: active ? String(g.토큰) : '',
      마감일: dateText_(g.마감일), 안내: String(g.안내 || ''), 접수수: ids.reduce((a, id) => a + byId[id].접수수, 0), 대기수: ids.reduce((a, id) => a + byId[id].대기수, 0), 만든일시: String(g.만든일시 || '') };
  }).sort((a, b) => a.만든일시 < b.만든일시 ? 1 : -1);
  return { courses: courses, groups: groups };
}
function newToken_() { return (Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')).slice(0, 40); }
function saveApplyGroup_(user, opt) {
  opt = opt || {};
  const title = limitText_(opt.제목, 60, '제목');
  if (!title) fail_('접수 안내 제목을 입력해 주세요. (예: 2027년 1학기 수어교실)');
  const ids = []; (Array.isArray(opt.강좌IDs) ? opt.강좌IDs : []).forEach(x => { x = String(x); if (ids.indexOf(x) === -1) ids.push(x); });
  if (!ids.length) fail_('묶을 강좌를 하나 이상 선택해 주세요.');
  if (ids.length > GROUP_MAX_COURSES) fail_(`한 링크에는 강좌를 ${GROUP_MAX_COURSES}개까지 묶을 수 있습니다.`);
  ids.forEach(id => applyCourse_(user, id));
  const raw = String(opt.마감일 == null ? '' : opt.마감일).trim();
  const dl = raw ? toDateStr_(raw, '접수 마감일') : '';
  if (dl && dl < today_()) fail_('접수 마감일은 오늘 이후 날짜로 정해 주세요.');
  const note = limitText_(opt.안내, 300, '안내 문구');
  const t = readTable_(SHEETS.APPLYGROUPS), on = opt.사용 === false ? 'N' : 'Y';
  const row = opt.묶음ID ? t.rows.find(r => String(r.묶음ID) === String(opt.묶음ID) && r.지회명 === user.chapter) : null;
  if (opt.묶음ID && !row) fail_('묶음을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.');
  if (!row) {
    const tok = newToken_();
    appendRows_(t, [{ 묶음ID: 'G' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase(), 지회명: user.chapter, 제목: title, 강좌IDs: ids.join(','), 토큰해시: groupHash_(tok), 토큰: tok, 사용: on, 마감일: dl, 안내: note, 만든일시: now_() }]);
  } else {
    if (opt.새토큰 === true) { const tok = newToken_(); row.토큰해시 = groupHash_(tok); row.토큰 = tok; }
    Object.assign(row, { 제목: title, 강좌IDs: ids.join(','), 사용: on, 마감일: dl, 안내: note });
    updateRow_(t, row);
  }
  log_(user, '접수묶음저장', title + ` ${ids.length}강좌` + (on === 'N' ? ' 닫음' : ''));
  return getApplyHub_(user);
}
function deleteApplyGroup_(user, groupId) {
  const t = readTable_(SHEETS.APPLYGROUPS), row = t.rows.find(r => String(r.묶음ID) === String(groupId) && r.지회명 === user.chapter);
  if (!row) fail_('묶음을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.');
  deleteRows_(t, [row._row]);
  log_(user, '접수묶음삭제', String(row.제목 || ''));
  return getApplyHub_(user);
}
function createApplyLinks_(user, courseIds) {
  const ids = []; (Array.isArray(courseIds) ? courseIds : []).forEach(x => { x = String(x); if (ids.indexOf(x) === -1) ids.push(x); });
  if (!ids.length) fail_('강좌를 선택해 주세요.');
  ids.forEach(id => applyCourse_(user, id));
  const t = readTable_(SHEETS.APPLYLINKS);
  ids.forEach(id => {
    const row = t.rows.find(r => String(r.강좌ID) === id);
    if (!row) { const tok = newToken_(); appendRows_(t, [{ 강좌ID: id, 토큰해시: applyHash_(tok), 토큰: tok, 사용: 'Y', 마감일: '', 안내: '', 만든일시: now_() }]); }
    else if (String(row.사용).trim().toUpperCase() === 'N') { row.사용 = 'Y'; updateRow_(t, row); }
  });
  log_(user, '접수링크일괄', `${ids.length}강좌`);
  return getApplyHub_(user);
}


// ===================== 13-8. 강사비 관리 (강사 1명 + 기간 → 확인증 → 서명 링크 / 인쇄) =====================
const FEE_TAX_TYPES = ['없음', '사업소득', '기타소득'];   // 사업소득 3.3% (3%+0.3%), 기타소득 8.8% (8%+0.8%)
const FEE_MAX_LINES = 30;
function getFeeHub(token, from, to) { return api_(token, user => getFeeHub_(user, from, to)); }
function getFeeDraft(token, name, from, to) { return api_(token, user => getFeeDraft_(user, name, from, to)); }
function saveFeeCert(token, data) { return api_(token, user => saveFeeCert_(user, data), true); }
function getFeeCert(token, id) { return api_(token, user => getFeeCert_(user, id)); }
function createFeeLink(token, id) { return api_(token, user => createFeeLink_(user, id), true); }
function revokeFeeLink(token, id) { return api_(token, user => revokeFeeLink_(user, id), true); }
function resetFeeCert(token, id) { return api_(token, user => resetFeeCert_(user, id), true); }
function deleteFeeCert(token, id) { return api_(token, user => deleteFeeCert_(user, id), true); }
function feeInfo(linkToken) { return feeApi_(linkToken, (row) => feeInfo_(row)); }
function feeSign(linkToken, sig, info) { return feeApi_(linkToken, (row) => feeSign_(row, sig, info), true); }

function feeHash_(tok) { return sha256_('fee-link|' + tok); }
function feeApi_(linkToken, fn, write) {
  try {
    resetMemo_();
    const run = () => {
      const tok = String(linkToken == null ? '' : linkToken).trim();
      const row = /^[0-9a-f]{40}$/.test(tok) ? readTable_(SHEETS.FEECERTS).rows.find(r => String(r.토큰해시) === feeHash_(tok) && String(r.토큰)) : null;
      if (!row) fail_('확인증 링크가 올바르지 않거나 닫혔습니다. 담당자에게 문의해 주세요.', 'LINK');
      return fn(row);
    };
    return { ok: true, data: write ? withLock_(run) : run() };
  } catch (e) {
    return errorResult_(e);
  }
}
function feeMoney_(v) { const n = Math.round(Number(String(v == null ? '' : v).replace(/[^\d.]/g, ''))); return isFinite(n) && n > 0 ? n : 0; }
function feeTax_(type, amount) {
  const rate = type === '사업소득' ? 3 : type === '기타소득' ? 8 : 0;
  const inc = Math.floor(amount * rate / 100 / 10) * 10, loc = Math.floor(inc * 10 / 100 / 10) * 10;
  return { 소득세: inc, 지방소득세: loc, 실지급액: amount - inc - loc };
}
function feeRange_(from, to) {
  const f = toDateStr_(from, '기간 시작일'), t = toDateStr_(to, '기간 종료일');
  if (t < f) fail_('기간의 끝날이 시작일보다 빠릅니다.');
  return { from: f, to: t };
}
/* 강사비 확인증을 만들 수 있는 강좌: 지회는 자기 강좌 중 '도협회가 집행'이 아닌 것, 도협회는 자기 강좌 + 모든 지회의 파견 교육 */
function feeOwns_(user, c) {
  if (c.상태 === '삭제') return false;
  const hqPay = String(c.강사비집행 || '') === HQ;
  return isAdmin_(user) ? (c.지회명 === HQ || hqPay) : (c.지회명 === user.chapter && !hqPay);
}
function feeCourses_(user, name) {
  const nm = String(name == null ? '' : name).trim();
  if (!nm) return [];
  const byPlan = {}; readTable_(SHEETS.SESSIONPLAN).rows.forEach(p => { if (String(p.강사 || '').trim() === nm) byPlan[String(p.강좌ID)] = true; });
  return readTable_(SHEETS.COURSES).rows.filter(c => feeOwns_(user, c) && (nameIn_(c.강사, nm) || nameIn_(c.보조강사, nm) || byPlan[String(c.강좌ID)]));
}
function mainTeacher_(c) { return splitNames_(c.강사)[0] || ''; }   // 메인 강사 = 강사 칸의 첫 번째 이름
// (서버 전용) 이 강사의 강좌 번호들 — 출석·일지를 이 강좌만 읽기 위해 먼저 부름
function feeScopeIds_(user, token, name, from, to) {
  const r = feeRange_(from, to);
  return feeCourses_(user, name).filter(c => dateText_(c.시작일) <= r.to && dateText_(c.종료일) >= r.from).map(c => String(c.강좌ID));
}
function feeTeacherInfo_(user) {
  const o = {};
  readTable_(SHEETS.FEETEACHERS).rows.forEach(r => { if (r.지회명 === user.chapter) o[String(r.강사명)] = { 연락처: String(r.연락처 || ''), 은행: String(r.은행 || ''), 계좌번호: String(r.계좌번호 || ''), 예금주: String(r.예금주 || ''), 원천세: String(r.원천세 || '') }; });
  return o;
}
function feeCertBrief_(r) {
  return { 확인증ID: String(r.확인증ID), 강사명: String(r.강사명 || ''), 기간시작: dateText_(r.기간시작), 기간종료: dateText_(r.기간종료), 총액: Number(r.총액) || 0, 원천세: String(r.원천세 || '없음'),
    실지급액: Number(r.실지급액) || 0, 상태: String(r.상태 || '작성'), 링크: !!String(r.토큰 || ''), 서명일시: String(r.서명일시 || ''), 수정일시: String(r.수정일시 || '') };
}
function getFeeHub_(user, from, to) {
  const r = feeRange_(from, to), names = {};
  readTable_(SHEETS.COURSES).rows.forEach(c => {
    if (!feeOwns_(user, c)) return;
    if (!(dateText_(c.시작일) <= r.to && dateText_(c.종료일) >= r.from)) return;
    const planNames = []; readTable_(SHEETS.SESSIONPLAN).rows.forEach(p => { const w = String(p.강사 || '').trim(); if (String(p.강좌ID) === String(c.강좌ID) && w && !nameIn_(c.강사, w) && planNames.indexOf(w) === -1) planNames.push(w); });
    [[c.강사, '강사'], [c.보조강사, '보조강사'], [planNames.join(','), '강사']].forEach(x => {
      splitNames_(x[0]).forEach(nm => {
        const o = names[nm] = names[nm] || { 이름: nm, 강좌: [] };
        o.강좌.push(`${c.강좌명}${x[1] === '보조강사' ? '(보조)' : ''}${isAdmin_(user) && c.지회명 !== HQ ? ' [' + c.지회명 + ']' : ''}`);
      });
    });
  });
  const certs = readTable_(SHEETS.FEECERTS).rows.filter(c => c.지회명 === user.chapter).map(feeCertBrief_).sort((a, b) => a.수정일시 < b.수정일시 ? 1 : -1);
  return { 강사: Object.keys(names).sort().map(k => names[k]), 확인증: certs, 강사정보: feeTeacherInfo_(user) };
}
/* 강사비 확인증의 '일시' 기본값: 강좌의 교육 기간 (화면에서 고칠 수 있음) */
function feePeriodText_(c) {
  if (String(c.예정일 || '').trim()) return String(c.예정일).trim();   // 파견 교육: 날짜별 일정
  const a = dateText_(c.시작일), b = dateText_(c.종료일);
  return a && b && a !== b ? `${a} ~ ${b}` : (a || b || '');
}
function getFeeDraft_(user, name, from, to) {
  const r = feeRange_(from, to), nm = String(name == null ? '' : name).trim();
  if (!nm) fail_('강사를 선택해 주세요.');
  const att = readTable_(SHEETS.ATTENDANCE).rows, jr = readTable_(SHEETS.JOURNAL).rows;
  const lines = [];
  feeCourses_(user, nm).forEach(c => {
    const id = String(c.강좌ID), total = Number(c.총회차) || 0;
    if (!(dateText_(c.시작일) <= r.to && dateText_(c.종료일) >= r.from)) return;
    const held = {}, jmap = {};
    att.forEach(a => { if (String(a.강좌ID) !== id) return; const sn = Number(a.회차); if (!(sn >= 1 && sn <= total)) return; const d = sessionDate_(a); held[sn] = held[sn] || ''; if (d && !held[sn]) held[sn] = d; });
    jr.forEach(j => { if (String(j.강좌ID) !== id) return; const sn = Number(j.회차); jmap[sn] = j; if (held[sn] !== undefined && !held[sn] && dateText_(j.수업일)) held[sn] = dateText_(j.수업일); });
    const sessions = Object.keys(held).map(Number).sort((a, b) => a - b).filter(sn => !held[sn] || (held[sn] >= r.from && held[sn] <= r.to));
    if (!sessions.length) return;
    const plan = {}; planRows_(id).forEach(p => { plan[Number(p.회차)] = p; });
    const hasPlan = Object.keys(plan).some(k => plan[k].강사);
    const roles = []; if (nameIn_(c.강사, nm) || (hasPlan && Object.keys(plan).some(k => String(plan[k].강사 || '').trim() === nm))) roles.push('강사'); if (nameIn_(c.보조강사, nm)) roles.push('보조강사');
    roles.forEach(role => {
      // 회차별 강사를 정해 둔 강좌는, 이 강사가 맡은 회차만 계산 (강사를 비워 둔 회차는 메인 강사 몫) + 회차별 시간을 더함
      const who = sn => (plan[sn] && String(plan[sn].강사 || '').trim()) || mainTeacher_(c);
      const ss = role === '강사' && hasPlan ? sessions.filter(sn => who(sn) === nm) : sessions;
      if (!ss.length) return;
      const hours = Math.round(ss.reduce((a, sn) => a + planHours_(plan[sn], Number(c.회당시간) || 0), 0) * 10) / 10;
      const basis = String(c.강사비기준 || ''), rate = feeMoney_(role === '강사' ? c.강사비단가 : c.보조강사비단가);
      const qty = basis === '회' ? ss.length : hours;
      const topics = ss.map(sn => jmap[sn] && String(jmap[sn].주제 || '').trim() ? `${sn}회 ${String(jmap[sn].주제).trim()}` : '').filter(x => x).join(' / ');
      lines.push({ 강좌ID: id, 강좌명: String(c.강좌명), 구분: role, 일시: feePeriodText_(c), 회차수: ss.length, 시간: hours,
        강의내용: topics.slice(0, 300), 단가기준: basis, 단가: rate, 수량: qty, 금액: rate && basis ? Math.round(rate * qty) : 0 });
    });
  });
  const info = feeTeacherInfo_(user)[nm] || { 연락처: '', 은행: '', 계좌번호: '', 예금주: '', 원천세: '' };
  return { 강사명: nm, 기간시작: r.from, 기간종료: r.to, 항목: lines, 강사정보: info };
}
function normFeeLines_(arr) {
  if (!Array.isArray(arr) || !arr.length) fail_('강의 내역이 없습니다. 강좌에 강사가 지정되어 있고 그 기간에 출석이 기록되어 있는지 확인하세요.');
  if (arr.length > FEE_MAX_LINES) fail_(`강의 내역은 ${FEE_MAX_LINES}줄까지 넣을 수 있습니다.`);
  return arr.map(x => {
    x = x || {};
    const amt = feeMoney_(x.금액);
    return { 강좌ID: String(x.강좌ID || '').slice(0, 40), 강좌명: limitText_(x.강좌명, 100, '강의명'), 구분: x.구분 === '보조강사' ? '보조강사' : x.구분 === '기타' ? '기타' : '강사', 일시: limitText_(x.일시, 200, '일시'),
      회차수: Number(x.회차수) || 0, 시간: Number(x.시간) || 0, 강의내용: limitText_(x.강의내용, 300, '강의내용'), 단가기준: x.단가기준 === '회' ? '회' : x.단가기준 === '시간' ? '시간' : '',
      단가: feeMoney_(x.단가), 수량: Number(x.수량) || 0, 금액: amt };
  });
}
function saveFeeCert_(user, data) {
  data = data || {};
  const name = limitText_(data.강사명, 30, '강사 이름');
  if (!name) fail_('강사 이름을 입력해 주세요.');
  const r = feeRange_(data.기간시작, data.기간종료);
  const lines = normFeeLines_(data.항목);
  const type = FEE_TAX_TYPES.indexOf(data.원천세) !== -1 ? data.원천세 : '없음';
  const total = lines.reduce((a, l) => a + l.금액, 0);
  if (!total) fail_('강사료 금액이 0원입니다. 금액을 입력해 주세요.');
  const tax = feeTax_(type, total);
  const phone = normPhone_(data.연락처);
  const obj = { 지회명: user.chapter, 강사명: name, 연락처: phone, 은행: limitText_(data.은행, 20, '은행'), 계좌번호: limitText_(data.계좌번호, 40, '계좌번호'), 예금주: limitText_(data.예금주, 30, '예금주'),
    기간시작: r.from, 기간종료: r.to, 항목: JSON.stringify(lines), 총액: total, 원천세: type, 소득세: tax.소득세, 지방소득세: tax.지방소득세, 실지급액: tax.실지급액, 비고: limitText_(data.비고, 200, '비고'), 수정일시: now_() };
  const rrn = isAdmin_(user) ? normRrn_(data.주민번호) : '';
  if (rrn) obj.주민번호 = rrn;
  const t = readTable_(SHEETS.FEECERTS);
  let row = data.확인증ID ? t.rows.find(x => String(x.확인증ID) === String(data.확인증ID) && x.지회명 === user.chapter) : null;
  if (data.확인증ID && !row) fail_('확인증을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.');
  if (row && String(row.상태) === '서명완료') fail_('이미 강사가 서명한 확인증입니다. 고치려면 먼저 "서명 지우기"를 눌러 주세요.');
  if (row) ['연락처', '은행', '계좌번호', '예금주'].forEach(k => { if (obj[k] === '' && String(row[k] || '')) obj[k] = row[k]; });   // 강사가 직접 적은 값을 빈 칸으로 지우지 않음
  if (!row) appendRows_(t, [Object.assign({ 확인증ID: 'F' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(), 상태: '작성', 토큰해시: '', 토큰: '', 서명: '', 서명일시: '', 주민번호: '', 만든일시: now_() }, obj)]);
  else { Object.keys(obj).forEach(k => { row[k] = obj[k]; }); updateRow_(t, row); }
  // 다음에 자동으로 채우도록 강사 정보 기억
  const ti = readTable_(SHEETS.FEETEACHERS), ex = ti.rows.find(x => x.지회명 === user.chapter && String(x.강사명) === name);
  const tinfo = { 지회명: user.chapter, 강사명: name, 연락처: phone, 은행: obj.은행, 계좌번호: obj.계좌번호, 예금주: obj.예금주, 원천세: type };
  if (ex) { Object.keys(tinfo).forEach(k => { ex[k] = tinfo[k]; }); updateRow_(ti, ex); } else appendRows_(ti, [tinfo]);
  log_(user, '강사비확인증저장', `${r.from}~${r.to} ${lines.length}건 ${total}원`);
  const saved = readTable_(SHEETS.FEECERTS).rows.filter(x => x.지회명 === user.chapter && String(x.강사명) === name && dateText_(x.기간시작) === r.from && dateText_(x.기간종료) === r.to);
  const cur = row || saved[saved.length - 1];
  return getFeeCert_(user, String(cur.확인증ID));
}
function feeCertRow_(user, id) {
  const t = readTable_(SHEETS.FEECERTS), row = t.rows.find(x => String(x.확인증ID) === String(id) && x.지회명 === user.chapter);
  if (!row) fail_('확인증을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.');
  return { t: t, row: row };
}
function getFeeCert_(user, id) {
  const row = feeCertRow_(user, id).row;
  let lines = []; try { lines = JSON.parse(String(row.항목 || '[]')); } catch (e) { lines = []; }
  return Object.assign(feeCertBrief_(row), { 지회명: row.지회명, 연락처: String(row.연락처 || ''), 은행: String(row.은행 || ''), 계좌번호: String(row.계좌번호 || ''), 예금주: String(row.예금주 || ''), 항목: lines,
    소득세: Number(row.소득세) || 0, 지방소득세: Number(row.지방소득세) || 0, 비고: String(row.비고 || ''), 서명: String(row.서명 || ''), 토큰: String(row.토큰 || ''),
    주민번호있음: !!String(row.주민번호 || ''), 주민번호표시: rrnMask_(row.주민번호), 도협회집행: row.지회명 === HQ });
}
function revealFeeRrn(token, id) { return api_(token, user => revealFeeRrn_(user, id)); }
function revealFeeRrn_(user, id) {
  requireAdmin_(user);
  const row = feeCertRow_(user, id).row;
  log_(user, '주민번호열람', String(id));
  return { 주민번호: rrnFmt_(row.주민번호) };
}
function rrnDigits_(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
function rrnFmt_(v) { const d = rrnDigits_(v); return d.length === 13 ? d.slice(0, 6) + '-' + d.slice(6) : ''; }
function rrnMask_(v) { const d = rrnDigits_(v); return d.length === 13 ? d.slice(0, 6) + '-' + d.slice(6, 7) + '******' : ''; }
/* 주민(외국인)등록번호: 숫자 13자리 (원천징수 신고용). 비어 있으면 '' */
function normRrn_(v) {
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return '';
  const d = rrnDigits_(raw);
  if (d.length !== 13 || !/^[0-9\- ]+$/.test(raw)) fail_('주민등록번호는 숫자 13자리로 입력해 주세요.');
  const mo = Number(d.slice(2, 4)), dy = Number(d.slice(4, 6));
  if (mo < 1 || mo > 12 || dy < 1 || dy > 31) fail_('주민등록번호 앞 6자리(생년월일)를 확인해 주세요.');
  return d;
}
function createFeeLink_(user, id) {
  const x = feeCertRow_(user, id);
  if (String(x.row.상태) === '서명완료') fail_('이미 서명이 끝난 확인증입니다.');
  const tok = newToken_();
  x.row.토큰 = tok; x.row.토큰해시 = feeHash_(tok); x.row.상태 = '서명대기'; x.row.수정일시 = now_();
  updateRow_(x.t, x.row);
  log_(user, '강사비서명링크', String(id));
  return getFeeCert_(user, id);
}
function revokeFeeLink_(user, id) {
  const x = feeCertRow_(user, id);
  x.row.토큰 = ''; x.row.토큰해시 = '';
  if (String(x.row.상태) === '서명대기') x.row.상태 = '작성';
  updateRow_(x.t, x.row);
  log_(user, '강사비링크닫음', String(id));
  return getFeeCert_(user, id);
}
function resetFeeCert_(user, id) {
  const x = feeCertRow_(user, id);
  x.row.서명 = ''; x.row.서명일시 = ''; x.row.상태 = String(x.row.토큰) ? '서명대기' : '작성'; x.row.수정일시 = now_();
  updateRow_(x.t, x.row);
  log_(user, '강사비서명지움', String(id));
  return getFeeCert_(user, id);
}
function deleteFeeCert_(user, id) {
  const x = feeCertRow_(user, id);
  deleteRows_(x.t, [x.row._row]);
  log_(user, '강사비확인증삭제', String(id));
  return getFeeHubAfterDelete_(user);
}
function getFeeHubAfterDelete_(user) { return { 확인증: readTable_(SHEETS.FEECERTS).rows.filter(c => c.지회명 === user.chapter).map(feeCertBrief_).sort((a, b) => a.수정일시 < b.수정일시 ? 1 : -1) }; }
function maskTail_(s, keep) { s = String(s || ''); return s.length <= keep ? s : s.slice(0, Math.min(3, s.length - keep)).replace(/./g, '*') + '…' + s.slice(-keep); }
function feeInfo_(row) {
  let lines = []; try { lines = JSON.parse(String(row.항목 || '[]')); } catch (e) { lines = []; }
  return { 지회명: String(row.지회명 || ''), 강사명: String(row.강사명 || ''), 기간시작: dateText_(row.기간시작), 기간종료: dateText_(row.기간종료), 항목: lines, 총액: Number(row.총액) || 0, 원천세: String(row.원천세 || '없음'),
    소득세: Number(row.소득세) || 0, 지방소득세: Number(row.지방소득세) || 0, 실지급액: Number(row.실지급액) || 0, 은행: String(row.은행 || ''), 계좌끝: String(row.계좌번호 || '').replace(/\D/g, '').slice(-4),
    예금주: String(row.예금주 || ''), 입력받음: row.지회명 === HQ, 계좌있음: !!(String(row.은행 || '') && String(row.계좌번호 || '') && String(row.예금주 || '')), 주민있음: !!String(row.주민번호 || ''), 연락처끝: String(row.연락처 || '').replace(/\D/g, '').slice(-4), 상태: String(row.상태 || ''), 서명: String(row.서명 || ''), 서명일시: String(row.서명일시 || ''), 비고: String(row.비고 || '') };
}
function feeSign_(row, sig, info) {
  if (String(row.상태) === '서명완료') fail_('이미 서명하셨습니다.');
  const png = pngOk_(sig, '강사');
  const t = readTable_(SHEETS.FEECERTS), r = t.rows.find(x => String(x.확인증ID) === String(row.확인증ID));
  if (r.지회명 === HQ) {   // 도협회가 집행하는 강사비: 강사가 계좌와 주민등록번호를 직접 입력 (보조금 정산·원천징수 신고용)
    info = info || {};
    const bank = limitText_(info.은행, 20, '은행') || String(r.은행 || ''), holder = limitText_(info.예금주, 30, '예금주') || String(r.예금주 || '');
    const acc = limitText_(info.계좌번호, 40, '계좌번호') || String(r.계좌번호 || ''), rrn = normRrn_(info.주민번호) || rrnDigits_(r.주민번호);
    if (!bank || !acc || !holder) fail_('은행, 계좌번호, 예금주를 입력해 주세요.');
    if (!/^[0-9-]{6,30}$/.test(acc)) fail_('계좌번호는 숫자와 - 만 입력해 주세요.');
    if (rrn.length !== 13) fail_('주민등록번호를 입력해 주세요.');
    r.은행 = bank; r.계좌번호 = acc; r.예금주 = holder; r.주민번호 = rrn;
  }
  r.서명 = png; r.서명일시 = now_(); r.상태 = '서명완료'; r.수정일시 = now_();
  updateRow_(t, r);
  log_({ id: '강사링크', name: '강사링크' }, '강사비서명', String(row.확인증ID));
  return feeInfo_(r);
}


// ===================== 13-7. 직인 이미지 (수료증에 넣음) =====================
const SEAL_KINDS = ['지회', '센터'];
const SEAL_MAX_CHARS = 150000;
function getSeals(token) { return api_(token, user => getSeals_(user)); }
function saveSeal(token, kind, data) { return api_(token, user => saveSeal_(user, kind, data), true); }
function deleteSeal(token, kind) { return api_(token, user => deleteSeal_(user, kind), true); }
function sealOwner_(user) { return isAdmin_(user) ? HQ : user.chapter; }
function getSeals_(user) {
  const owner = sealOwner_(user), out = { 지회: '', 센터: '' };
  readTable_(SHEETS.SEALS).rows.forEach(r => { if (r.지회명 === owner && SEAL_KINDS.indexOf(String(r.종류)) !== -1) out[String(r.종류)] = String(r.이미지 || ''); });
  return out;
}
function saveSeal_(user, kind, data) {
  if (SEAL_KINDS.indexOf(kind) === -1) fail_('직인 종류(지회 / 센터)를 선택해 주세요.');
  const img = String(data == null ? '' : data);
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(img)) fail_('직인 이미지 형식을 확인할 수 없습니다. (PNG, JPG 이미지만 가능)');
  if (img.length > SEAL_MAX_CHARS) fail_('직인 이미지가 너무 큽니다. 더 작은 이미지를 올려 주세요.');
  const owner = sealOwner_(user), t = readTable_(SHEETS.SEALS);
  const ex = t.rows.find(r => r.지회명 === owner && String(r.종류) === kind);
  const obj = { 지회명: owner, 종류: kind, 이미지: img, 수정일시: now_() };
  if (ex) { Object.keys(obj).forEach(k => { ex[k] = obj[k]; }); updateRow_(t, ex); } else appendRows_(t, [obj]);
  log_(user, '직인저장', kind);
  return getSeals_(user);
}
function deleteSeal_(user, kind) {
  if (SEAL_KINDS.indexOf(kind) === -1) fail_('직인 종류를 선택해 주세요.');
  const owner = sealOwner_(user), t = readTable_(SHEETS.SEALS);
  const rows = t.rows.filter(r => r.지회명 === owner && String(r.종류) === kind);
  if (rows.length) deleteRows_(t, rows.map(r => r._row));
  log_(user, '직인삭제', kind);
  return getSeals_(user);
}

// ===================== 13-8. 만족도 조사 (수강생 링크 → 결과 통계 → 강사용 결과 링크) =====================
const SURVEY_MAX = 1000;
const SURVEY_QS = ['강의 내용이 도움이 되었다', '강사의 설명과 진행이 좋았다', '교재·자료가 적절했다', '교육 시간·장소(환경)가 적절했다', '전반적으로 만족한다'];
function getSurvey(token, courseId) { return api_(token, user => getSurvey_(user, courseId)); }
function saveSurveyLink(token, courseId, opt) { return api_(token, user => saveSurveyLink_(user, courseId, opt), true); }
function saveSurveyQuestions(token, courseId, list) { return api_(token, user => saveSurveyQuestions_(user, courseId, list), true); }
function saveSurveyResultLink(token, courseId, opt) { return api_(token, user => saveSurveyResultLink_(user, courseId, opt), true); }
function surveyInfo(linkToken) { return surveyApi_(linkToken, (user, c, row) => surveyInfo_(c, row)); }
function surveySubmit(linkToken, form) { return surveyApi_(linkToken, (user, c, row) => surveySubmit_(c, form, row), true); }
function resultInfo(linkToken) { return resultApi_(linkToken, (user, c, row) => resultInfo_(c, row)); }

function surveyApi_(linkToken, fn, write) { return pubApi_(surveyContext_, linkToken, fn, write); }
function resultApi_(linkToken, fn, write) { return pubApi_(resultContext_, linkToken, fn, write); }
function pubApi_(ctxFn, linkToken, fn, write) {
  try {
    resetMemo_();
    const run = () => { const x = ctxFn(linkToken); return fn(x.user, x.c, x.row); };
    return { ok: true, data: write ? withLock_(run) : run() };
  } catch (e) {
    return errorResult_(e);
  }
}
function surveyHash_(tok) { return sha256_('survey-link|' + tok); }
function resultHash_(tok) { return sha256_('survey-result|' + tok); }
function surveyRow_(tok) {
  tok = String(tok == null ? '' : tok).trim();
  if (!/^[0-9a-f]{40}$/.test(tok)) return null;
  const h = surveyHash_(tok);
  return readTable_(SHEETS.SURVEYS).rows.find(r => String(r.토큰해시) === h && String(r.사용).trim().toUpperCase() === 'Y') || null;
}
function resultRow_(tok) {
  tok = String(tok == null ? '' : tok).trim();
  if (!/^[0-9a-f]{40}$/.test(tok)) return null;
  const h = resultHash_(tok);
  return readTable_(SHEETS.SURVEYS).rows.find(r => String(r.결과토큰해시) === h && String(r.결과사용).trim().toUpperCase() === 'Y') || null;
}
function surveyCourseId_(tok) { const r = surveyRow_(tok); return r ? String(r.강좌ID) : ''; }
function resultCourseId_(tok) { const r = resultRow_(tok); return r ? String(r.강좌ID) : ''; }
function surveyCourse_(row) {
  const c = readTable_(SHEETS.COURSES).rows.find(r => String(r.강좌ID) === String(row.강좌ID));
  if (!c || c.상태 === '삭제') fail_('조사 링크가 올바르지 않거나 닫혔습니다. 담당자에게 문의해 주세요.', 'LINK');
  return c;
}
function surveyContext_(tok) {
  const row = surveyRow_(tok);
  if (!row) fail_('조사 링크가 올바르지 않거나 닫혔습니다. 담당자에게 문의해 주세요.', 'LINK');
  const c = surveyCourse_(row);
  const dl = dateText_(row.마감일);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dl) && today_() > dl) fail_(`조사가 마감되었습니다. (${dl}까지)`, 'LINK');
  return { user: { id: '조사링크', name: '조사링크', chapter: c.지회명, role: ROLE_CHAPTER }, c: c, row: row };
}
function resultContext_(tok) {
  const row = resultRow_(tok);
  if (!row) fail_('결과 링크가 올바르지 않거나 닫혔습니다. 담당자에게 문의해 주세요.', 'LINK');
  return { user: { id: '결과링크', name: '결과링크', chapter: '', role: ROLE_CHAPTER }, c: surveyCourse_(row), row: row };
}
function surveyInfo_(c, row) {
  return { 강좌명: c.강좌명, 지회명: c.지회명, 시작일: dateText_(c.시작일), 종료일: dateText_(c.종료일), 강사: c.강사 || '', 마감일: dateText_(row.마감일), 안내: String(row.안내 || ''), 문항: surveyQs_(row) };
}
const SURVEY_MAXQ = 10;
/* 이 강좌의 조사 문항: 관리자가 정한 문항이 있으면 그것, 없으면 기본 5문항 (모두 5점 척도) */
function surveyQs_(row) {
  let a = null;
  try { a = row && row.문항 ? JSON.parse(String(row.문항)) : null; } catch (e) { a = null; }
  if (!Array.isArray(a) || !a.length) return SURVEY_QS.map(q => ({ 문항: q, 유형: '점수' }));
  return a.slice(0, SURVEY_MAXQ).map(x => ({ 문항: String(x.문항 || ''), 유형: x.유형 === '글' ? '글' : '점수' }));
}
function surveySubmit_(c, form, row) {
  form = form || {};
  if (String(form.website || '').trim() !== '') return { done: true };   // 자동 입력(스팸)은 조용히 무시
  const id = String(c.강좌ID), t = readTable_(SHEETS.SURVEYRESP), qs = surveyQs_(row);
  const obj = { 응답ID: 'S' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase(), 강좌ID: id, 의견: limitText_(form.의견, 1000, '의견'), 제출일시: now_() };
  qs.forEach((q, k) => {
    const i = k + 1;
    if (q.유형 === '글') { obj['Q' + i] = limitText_(form['q' + i], 500, i + '번 답변'); return; }
    const v = toInt_(form['q' + i]);
    if (!(v >= 1 && v <= 5)) fail_(`${i}번 문항의 점수를 선택해 주세요.`);
    obj['Q' + i] = v;
  });
  if (t.rows.filter(r => String(r.강좌ID) === id).length >= SURVEY_MAX) fail_('응답이 가득 찼습니다. 담당자에게 문의해 주세요.');
  appendRows_(t, [obj]);
  return { done: true };
}
function surveyStats_(id, row) {
  const rows = readTable_(SHEETS.SURVEYRESP).rows.filter(r => String(r.강좌ID) === id);
  const qs = surveyQs_(row).map((q, i) => {
    if (q.유형 === '글') return { 문항: q.문항, 유형: '글', 답변: rows.map(r => String(r['Q' + (i + 1)] == null ? '' : r['Q' + (i + 1)]).trim()).filter(Boolean) };
    const dist = [0, 0, 0, 0, 0];
    let sum = 0;
    rows.forEach(r => { const v = Number(r['Q' + (i + 1)]); if (v >= 1 && v <= 5) { dist[v - 1]++; sum += v; } });
    return { 문항: q.문항, 유형: '점수', 분포: dist, 평균: rows.length ? Math.round(sum / rows.length * 100) / 100 : 0 };
  });
  const sc = qs.filter(q => q.유형 === '점수');
  const avg = rows.length && sc.length ? Math.round(sc.reduce((a, q) => a + q.평균, 0) / sc.length * 100) / 100 : 0;
  return { 응답수: rows.length, 문항: qs, 전체평균: avg,
    의견: rows.map(r => String(r.의견 || '').trim()).filter(Boolean) };
}
function resultInfo_(c, row) {
  return { 강좌명: c.강좌명, 지회명: c.지회명, 시작일: dateText_(c.시작일), 종료일: dateText_(c.종료일), 강사: c.강사 || '', 보조강사: c.보조강사 || '', 결과: surveyStats_(String(c.강좌ID), row) };
}
function surveyCourseAccess_(user, courseId) {
  const c = getCourseOrFail_(courseId).c;
  assertAccess_(user, c.지회명);
  return c;
}
function getSurvey_(user, courseId) {
  const c = surveyCourseAccess_(user, courseId), id = String(c.강좌ID);
  const row = readTable_(SHEETS.SURVEYS).rows.find(r => String(r.강좌ID) === id);
  const on = !!row && String(row.사용).trim().toUpperCase() === 'Y', ron = !!row && String(row.결과사용).trim().toUpperCase() === 'Y';
  const dl = row ? dateText_(row.마감일) : '';
  return { 문항: surveyQs_(row), 기본문항: SURVEY_QS, link: { 있음: !!row && !!String(row.토큰 || ''), active: on, token: on ? String(row.토큰) : '', 마감일: dl, 마감됨: !!dl && today_() > dl, 안내: row ? String(row.안내 || '') : '' },
    resultLink: { active: ron, token: ron ? String(row.결과토큰) : '' }, 결과: surveyStats_(id, row) };
}
function surveyTok_() { return (Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '')).slice(0, 40); }
function saveSurveyLink_(user, courseId, opt) {
  const c = surveyCourseAccess_(user, courseId), id = String(c.강좌ID);
  opt = opt || {};
  const raw = String(opt.마감일 == null ? '' : opt.마감일).trim();
  const dl = raw ? toDateStr_(raw, '조사 마감일') : '';
  if (dl && dl < today_()) fail_('조사 마감일은 오늘 이후 날짜로 정해 주세요.');
  const note = limitText_(opt.안내, 300, '안내 문구');
  const t = readTable_(SHEETS.SURVEYS);
  const row = t.rows.find(r => String(r.강좌ID) === id);
  const on = opt.사용 === false ? 'N' : 'Y';
  if (!row) {
    const tok = surveyTok_();
    appendRows_(t, [{ 강좌ID: id, 토큰해시: surveyHash_(tok), 토큰: tok, 사용: on, 마감일: dl, 안내: note, 결과토큰해시: '', 결과토큰: '', 결과사용: '', 만든일시: now_(), 문항: '' }]);
  } else {
    if (opt.새토큰 === true || !row.토큰) { const tok = surveyTok_(); row.토큰해시 = surveyHash_(tok); row.토큰 = tok; }
    row.사용 = on; row.마감일 = dl; row.안내 = note;
    updateRow_(t, row);
  }
  log_(user, '만족도링크저장', id + (on === 'N' ? ' 닫음' : ''));
  return getSurvey_(user, id);
}
function saveSurveyQuestions_(user, courseId, list) {
  const c = surveyCourseAccess_(user, courseId), id = String(c.강좌ID);
  if (!Array.isArray(list) || !list.length) fail_('문항을 1개 이상 만들어 주세요.');
  if (list.length > SURVEY_MAXQ) fail_(`문항은 ${SURVEY_MAXQ}개까지 만들 수 있습니다.`);
  const qs = list.map((x, i) => {
    const t = String((x && x.문항) == null ? '' : x.문항).trim();
    if (!t) fail_(`${i + 1}번 문항의 내용을 적어 주세요.`);
    return { 문항: limitText_(t, 100, i + 1 + '번 문항'), 유형: x.유형 === '글' ? '글' : '점수' };
  });
  const t = readTable_(SHEETS.SURVEYS);
  let row = t.rows.find(r => String(r.강좌ID) === id);
  const has = readTable_(SHEETS.SURVEYRESP).rows.some(r => String(r.강좌ID) === id);
  if (has) {
    const old = surveyQs_(row);
    if (old.length !== qs.length || old.some((q, i) => q.유형 !== qs[i].유형)) fail_('이미 응답이 있어 문항을 더하거나 지우거나 순서·종류를 바꿀 수 없습니다. 문구만 고칠 수 있습니다.');
  }
  const json = JSON.stringify(qs);
  if (!row) appendRows_(t, [{ 강좌ID: id, 토큰해시: '', 토큰: '', 사용: '', 마감일: '', 안내: '', 결과토큰해시: '', 결과토큰: '', 결과사용: '', 만든일시: now_(), 문항: json }]);
  else { row.문항 = json; updateRow_(t, row); }
  log_(user, '만족도문항저장', id);
  return getSurvey_(user, id);
}
function saveSurveyResultLink_(user, courseId, opt) {
  const c = surveyCourseAccess_(user, courseId), id = String(c.강좌ID);
  opt = opt || {};
  const t = readTable_(SHEETS.SURVEYS);
  let row = t.rows.find(r => String(r.강좌ID) === id);
  if (!row || !String(row.토큰 || '')) fail_('먼저 만족도 조사를 시작해 주세요.');
  if (opt.사용 === false) row.결과사용 = 'N';
  else {
    if (opt.새토큰 === true || !row.결과토큰) { const tok = surveyTok_(); row.결과토큰해시 = resultHash_(tok); row.결과토큰 = tok; }
    row.결과사용 = 'Y';
  }
  updateRow_(t, row);
  log_(user, '만족도결과링크', id + (opt.사용 === false ? ' 끔' : ''));
  return getSurvey_(user, id);
}

// ===================== 14. 관리 메뉴 =====================
function setupSheets() {
  const ui = menuGuard_();
  const ss = ss_();
  ss.setSpreadsheetTimeZone(TZ);
  const msgs = [];
  withLock_(() => {
    Object.keys(SHEETS).forEach(key => {
      const def = SHEETS[key];
      let sh = ss.getSheetByName(def.name);
      if (!sh) sh = ss.insertSheet(def.name);
      if (sh.getLastRow() <= 1) {
        sh.clear();
        sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
        msgs.push(`✅ ${def.name}: 준비 완료`);
      } else {
        const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
        const missing = def.headers.filter(h => headers.indexOf(h) === -1);
        if (missing.length) {
          sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
          msgs.push(`🔧 ${def.name}: 열 추가 (${missing.join(', ')})`);
        } else {
          msgs.push(`✅ ${def.name}: 기존 자료 유지`);
        }
      }
      formatSheet_(sh);
    });
    const old = ss.getSheetByName('회차별출석');   // 1차 버전 시트
    if (old) {
      if (old.getLastRow() <= 1) { ss.deleteSheet(old); msgs.push('🗑 이전 버전 회차별출석 시트 삭제'); }
      else msgs.push('⚠ 회차별출석 시트에 자료가 있어 남겨 두었습니다. (새 버전은 출석기록 시트 사용)');
    }
    ['시트1', 'Sheet1'].forEach(n => {
      const s = ss.getSheetByName(n);
      if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
    });
    const seeded = seedMembers_();
    if (seeded) msgs.push(`👥 회원정보: 계정 ${seeded}개 생성 (18개 지회 + 도협회 admin)`);
  });
  ui.alert('시트 초기 설정 완료',
    msgs.join('\n') + '\n\n다음 순서: [샘플 데이터로 테스트] → 회원정보에 비밀번호 입력 → [② 비밀번호 암호화]',
    ui.ButtonSet.OK);
}

function formatSheet_(sh) {
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const maxRows = sh.getMaxRows();
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, lastCol).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  if (maxRows > 1) {
    headers.forEach((h, i) => {
      if (TEXT_COLS.indexOf(h) !== -1) sh.getRange(2, i + 1, maxRows - 1, 1).setNumberFormat('@');
    });
  }
  if (sh.getName() === SHEETS.MEMBERS.name && maxRows > 1) {
    const rule = list => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
    const roleCol = headers.indexOf('권한') + 1, useCol = headers.indexOf('사용여부') + 1;
    if (roleCol) sh.getRange(2, roleCol, maxRows - 1, 1).setDataValidation(rule([ROLE_CHAPTER, ROLE_ADMIN]));
    if (useCol) sh.getRange(2, useCol, maxRows - 1, 1).setDataValidation(rule(['Y', 'N']));
  }
  sh.autoResizeColumns(1, lastCol);
}

function seedMembers_() {
  const t = readTable_(SHEETS.MEMBERS);
  if (t.rows.length) return 0;
  const rows = CHAPTERS.map(c => ({ 아이디: c[1], 비밀번호: '', 지회명: c[0], 담당자: '', 권한: ROLE_CHAPTER, 사용여부: 'Y' }));
  rows.push({ 아이디: 'admin', 비밀번호: '', 지회명: '도협회', 담당자: '', 권한: ROLE_ADMIN, 사용여부: 'Y' });
  appendRows_(t, rows);
  return rows.length;
}

function menuRecalcAll() {
  const ui = menuGuard_();
  const n = withLock_(recalcAll_);
  ui.alert(`강좌 ${n}개의 실적을 다시 계산했습니다.`);
}

function menuClearSample() {
  const ui = menuGuard_();
  if (ui.alert('샘플 데이터 지우기', `'${TEST_CHAPTER}' 자료를 모두 지울까요?`, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  withLock_(clearSample_);
  ui.alert('샘플 데이터를 지웠습니다.');
}

function clearSample_() {
  const ids = {};
  readTable_(SHEETS.COURSES).rows.forEach(c => { if (c.지회명 === TEST_CHAPTER) ids[String(c.강좌ID)] = true; });
  rewriteTable_(SHEETS.COURSES, o => o.지회명 !== TEST_CHAPTER);
  rewriteTable_(SHEETS.PARTICIPANTS, o => o.지회명 !== TEST_CHAPTER);
  rewriteTable_(SHEETS.ATTENDANCE, o => !ids[String(o.강좌ID)]);
  rewriteTable_(SHEETS.RESULTS, o => o.지회명 !== TEST_CHAPTER);
  rewriteTable_(SHEETS.REPORTS, o => o.지회명 !== TEST_CHAPTER);
  rewriteTable_(SHEETS.CERTSET, o => o.지회명 !== TEST_CHAPTER);
  rewriteTable_(SHEETS.CERTS, o => o.지회명 !== TEST_CHAPTER);
  rewriteTable_(SHEETS.LINKS, o => !ids[String(o.강좌ID)]);
  rewriteTable_(SHEETS.JOURNAL, o => !ids[String(o.강좌ID)]);
  rewriteTable_(SHEETS.PHOTOS, o => !ids[String(o.강좌ID)]);
  rewriteTable_(SHEETS.PHOTODATA, o => !ids[String(o.강좌ID)]);
  rewriteTable_(SHEETS.APPLYLINKS, o => !ids[String(o.강좌ID)]);
  rewriteTable_(SHEETS.APPLICANTS, o => !ids[String(o.강좌ID)]);
  rewriteTable_(SHEETS.SURVEYS, o => !ids[String(o.강좌ID)]);
  rewriteTable_(SHEETS.SURVEYRESP, o => !ids[String(o.강좌ID)]);
  rewriteTable_(SHEETS.CONFIRMS, o => !ids[String(o.강좌ID)]);
  rewriteTable_(SHEETS.TASKS, o => !ids[String(o.강좌ID)]);
  rewriteTable_(SHEETS.SUBMITS, o => !ids[String(o.강좌ID)]);
}

// 지난 연도 자료를 새 파일로 복사한 뒤 이 파일에서 지움 (몇 년 뒤 파일이 무거워지면 사용)
function menuArchiveYear() {
  const ui = menuGuard_();
  const res = ui.prompt('지난 연도 자료 보관',
    '보관할 연도를 입력하세요. (예: 2025)\n해당 연도 자료가 새 파일로 복사된 뒤 이 파일에서 삭제됩니다.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const year = toInt_(res.getResponseText());
  const thisYear = Number(Utilities.formatDate(new Date(), TZ, 'yyyy'));
  if (!(year >= 2020 && year < thisYear)) { ui.alert('올해보다 이전 연도만 보관할 수 있습니다.'); return; }
  const notApproved = readTable_(SHEETS.REPORTS).rows
    .filter(r => Number(r.연도) === year && r.상태 !== ST_APPROVED)
    .map(r => `${r.지회명} ${r.반기} (${r.상태})`);
  if (notApproved.length && ui.alert('확인', `승인되지 않은 보고가 있습니다.\n${notApproved.join('\n')}\n\n그래도 진행할까요?`,
    ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  if (ui.alert('최종 확인', `${year}년 자료를 새 파일로 옮깁니다. 진행할까요?`, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const url = withLock_(() => {
    const ids = {};
    readTable_(SHEETS.COURSES).rows.forEach(c => { if (Number(c.연도) === year) ids[String(c.강좌ID)] = true; });
    const byCourse = o => !!ids[String(o.강좌ID)];
    const plan = [
      [SHEETS.COURSES, byCourse], [SHEETS.PARTICIPANTS, byCourse], [SHEETS.ATTENDANCE, byCourse],
      [SHEETS.RESULTS, byCourse], [SHEETS.REPORTS, o => Number(o.연도) === year]
    ];
    const data = plan.map(([def, pred]) => {
      const t = readTable_(def);
      return { def: def, headers: t.headers, rows: t.rows.filter(pred).map(o => toRowArray_(t.headers, o)) };
    });
    const copied = data.reduce((a, d) => a + d.rows.length, 0);
    if (!copied) return '';
    // 1) 먼저 복사 — 복사 중 오류가 나면 원본은 그대로 남음
    const archive = SpreadsheetApp.create(`교육관리_보관_${year}`);
    data.forEach(d => {
      const rows = d.rows, t = { headers: d.headers }, def = d.def;
      const sh = archive.insertSheet(def.name);
      const width = t.headers.length;
      sh.getRange(1, 1, Math.max(rows.length + 1, 2), width).setNumberFormat('@');
      sh.getRange(1, 1, 1, width).setValues([t.headers]);
      if (rows.length) {
        ensureRows_(sh, rows.length + 1);
        sh.getRange(2, 1, rows.length, width).setValues(rows);
      }
    });
    archive.getSheets().forEach(s => { if (s.getLastRow() === 0 && archive.getSheets().length > 1) archive.deleteSheet(s); });
    // 2) 복사가 끝난 뒤 원본에서 삭제
    plan.forEach(([def, pred]) => rewriteTable_(def, o => !pred(o)));
    appendLog_('menu', '자료보관', `${year}년 ${copied}줄 → ${archive.getUrl()}`);
    return archive.getUrl();
  });
  ui.alert(url ? `보관 완료!\n보관 파일: ${url}` : `${year}년 자료가 없습니다.`);
}


// ===================== 15. 샘플 테스트 (메뉴) =====================
// Supabase로 옮길 때 쓰는 내보내기: 모든 시트를 JSON 파일 하나로 만들어 내 드라이브에 저장
function exportTables_() {
  const out = { version: 1, exportedAt: now_(), tables: {} };
  Object.keys(SHEETS).forEach(key => {
    const def = SHEETS[key];
    const sh = ss_().getSheetByName(def.name);
    out.tables[def.name] = [];
    if (!sh || sh.getLastRow() < 2) return;
    const values = sh.getDataRange().getValues();
    const headers = values[0].map(h => String(h).trim());
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (r.every(v => v === '' || v === null)) continue;
      const o = {};
      def.headers.forEach(h => {
        const j = headers.indexOf(h);
        let v = j < 0 ? '' : r[j];
        if (v instanceof Date) v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss');
        o[h] = (v === null || v === undefined) ? '' : v;
      });
      out.tables[def.name].push(o);
    }
  });
  return out;
}
function menuExportForSupabase() {
  const ui = menuGuard_();
  const data = exportTables_();
  const json = JSON.stringify(data, null, 1);   // 줄바꿈을 넣어 한 줄이 너무 길어지지 않게 함
  const name = '교육관리_이전용_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmm') + '.json';
  const counts = Object.keys(data.tables).map(k => k + ' ' + data.tables[k].length + '줄').join(' / ');
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = '<div style="font-family:sans-serif;font-size:14px;line-height:1.6">'
    + '<p><b>내보내기 준비 완료</b> (' + json.length + '글자)</p>'
    + '<p style="color:#444">' + esc(counts) + '</p>'
    + '<p><button id="dl" style="font-size:15px;padding:8px 16px">파일 내려받기</button> <span id="msg"></span></p>'
    + '<p style="color:#a00">수강생 이름·연락처가 들어 있으니 이전이 끝나면 파일을 지우세요.</p>'
    + '<p style="color:#444">내려받기가 안 되면 아래 칸을 클릭 → Ctrl+A → Ctrl+C 로 복사해서, 가져오기 화면의 붙여넣기 칸에 붙여넣으세요.</p>'
    + '<textarea id="d" readonly style="width:98%;height:150px;font-size:11px">' + esc(json) + '</textarea>'
    + '<script>'
    + 'document.getElementById("d").onclick=function(){this.select();};'
    + 'document.getElementById("dl").onclick=function(){var m=document.getElementById("msg");try{'
    + 'var t=document.getElementById("d").value;var b=new Blob([t],{type:"application/json"});'
    + 'var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=' + JSON.stringify(name) + ';'
    + 'document.body.appendChild(a);a.click();m.textContent="내려받는 중… 다운로드 폴더를 확인하세요.";'
    + '}catch(e){m.textContent="실패: "+e.message;}};'
    + '</script></div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(620).setHeight(430), '이전용 내보내기');
}

function menuSampleTest() {
  const ui = menuGuard_();
  const lines = runSampleTest_();
  const failed = lines.filter(l => l.indexOf('❌') === 0).length;
  ui.alert(failed ? `테스트 결과: ${failed}개 실패` : '테스트 결과: 모두 통과 🎉',
    lines.join('\n') + '\n\n확인 후 [샘플 데이터 지우기]로 테스트 자료를 지워 주세요.', ui.ButtonSet.OK);
}

function runSampleTest_() {
  const year = Number(Utilities.formatDate(new Date(), TZ, 'yyyy'));
  const admin = { id: 'test-admin', name: '테스트관리자', role: ROLE_ADMIN, chapter: '도협회' };
  const staff = { id: 'test-staff', name: '테스트담당자', role: ROLE_CHAPTER, chapter: TEST_CHAPTER };
  const other = { id: 'test-other', name: '다른지회', role: ROLE_CHAPTER, chapter: '춘천시지회' };
  const lines = [];
  const check = (label, cond, extra) => lines.push(`${cond ? '✅' : '❌'} ${label}${extra !== undefined ? ' → ' + extra : ''}`);
  const expectFail = (label, fn) => {
    try { fn(); check(label, false, '막혀야 하는데 통과됨'); }
    catch (e) { if (!e.userError) throw e; check(label, true, '차단됨'); }
  };
  const base = { 주관: '지회', 교육구분: '내부', 수준: '초급', 강좌명: '[샘플] 수어 초급 1기', 시작일: `${year}-03-02`, 종료일: `${year}-03-30`,
    총회차: 4, 회당시간: 2, 강사: '홍강사', 교재: '기초 교재', 수료기준: 75 };
  try {
    withLock_(() => {
      clearSample_();
      const d = saveCourse_(staff, base);
      const cid = d.course.강좌ID;
      check('강좌 등록', !!cid, cid);
      check('연도·반기 자동 판정', Number(d.course.연도) === year && d.course.반기 === '상반기', `${d.course.연도} ${d.course.반기}`);
      expectFail('같은 강좌 두 번 저장 차단', () => saveCourse_(staff, base));
      expectFail('주관(지회/센터)을 안 고르면 차단', () => saveCourse_(staff, Object.assign({}, base, { 강좌명: '[샘플] W', 주관: '' })));
      expectFail('교육 구분(내부/외부)을 안 고르면 차단', () => saveCourse_(staff, Object.assign({}, base, { 강좌명: '[샘플] Y', 교육구분: '' })));
      expectFail('수준을 안 고르면 차단', () => saveCourse_(staff, Object.assign({}, base, { 강좌명: '[샘플] Z', 수준: '' })));
      expectFail('없는 날짜(2월 30일) 차단', () => saveCourse_(staff, Object.assign({}, base, { 강좌명: '[샘플] X', 시작일: `${year}-02-30` })));
      expectFail('다른 지회 강좌 보기 차단', () => getCourseDetail_(other, cid));

      const one = saveCourse_(staff, { 주관: '센터', 교육구분: '외부', 수준: '구분없음', 강좌명: '[샘플] 1회 특강', 시작일: `${year}-10-10`, 종료일: `${year}-10-10`,
        총회차: 1, 회당시간: 3, 수료기준: 80, 수료집계: 'N' });
      const op = addParticipants_(staff, one.course.강좌ID, [{ 이름: '특강A' }, { 이름: '특강B' }]).detail.participants;
      const one2 = saveAttendance_(staff, one.course.강좌ID, 1, op.map(p => p.참여자ID));
      check('1회 특강: 수료 집계 안 함 → 수료 0, 연인원 2', one2.result.수료인원 === 0 && one2.result.연인원 === 2 && one2.result.수료집계 === 'N',
        `수료 ${one2.result.수료인원}, 연인원 ${one2.result.연인원}`);

      const hc = saveCourse_(staff, { 주관: '센터', 교육구분: '외부', 수준: '구분없음', 강좌명: '[샘플] 학교 특강', 시작일: `${year}-10-12`, 종료일: `${year}-10-30`,
        총회차: 3, 회당시간: 1, 인원만입력: 'Y' });
      const hid = hc.course.강좌ID;
      expectFail('인원만 입력 강좌에 명단 추가 차단', () => addParticipants_(staff, hid, [{ 이름: '가' }]));
      expectFail('인원만 입력 강좌에 이름 출석 저장 차단', () => saveAttendance_(staff, hid, 1, []));
      expectFail('인원이 음수면 차단', () => saveHeadcount_(staff, hid, 1, -3));
      expectFail('인원 입력 방식은 등록 후 변경 차단', () => saveCourse_(staff, { 주관: '센터', 교육구분: '외부', 수준: '구분없음', 강좌ID: hid, 강좌명: '[샘플] 학교 특강', 시작일: `${year}-10-12`, 종료일: `${year}-10-30`, 총회차: 3, 회당시간: 1 }));
      saveHeadcount_(staff, hid, 1, 30); saveHeadcount_(staff, hid, 2, 28); saveHeadcount_(staff, hid, 3, 35);
      const hr = saveHeadcount_(staff, hid, 2, 25).result;
      check('학교 특강 3회 (30, 25, 35명): 연인원 90, 실인원 35, 수료 0', hr.연인원 === 90 && hr.실인원 === 35 && hr.수료인원 === 0 && hr.수료집계 === 'N',
        `연인원 ${hr.연인원}, 실인원 ${hr.실인원}, 수료 ${hr.수료인원}`);

      const r1 = addParticipants_(staff, cid, [
        { 이름: '김가람', 연락처: '01011112222' }, { 이름: '이나래' },
        { 이름: '박다온', 연락처: '010-3333-4444' }, { 이름: '최라온' },
        { 이름: '김가람', 연락처: '010-1111-2222' }]);
      check('참여자 4명 등록, 중복 1명 건너뜀', r1.added === 4 && r1.skipped.length === 1, `등록 ${r1.added} / 건너뜀 ${r1.skipped.length}`);
      check('휴대폰 번호 자동 정리(0 유지)', r1.detail.participants[0].연락처 === '010-1111-2222', r1.detail.participants[0].연락처);
      const ids = {};
      r1.detail.participants.forEach(p => { ids[p.이름] = p.참여자ID; });

      // 김가람 4회, 이나래 3회, 박다온 1회, 최라온 0회
      const plan = { 1: ['김가람', '이나래', '박다온'], 2: ['김가람', '이나래'], 3: ['김가람'], 4: ['김가람', '이나래'] };
      Object.keys(plan).forEach(s => saveAttendance_(staff, cid, Number(s), plan[s].map(n => ids[n])));
      saveAttendance_(staff, cid, 2, plan[2].map(n => ids[n]));   // 같은 회차 다시 저장
      expectFail('총회차(4회)를 넘는 5회차 저장 차단', () => saveAttendance_(staff, cid, 5, []));

      let res = getCourseDetail_(staff, cid).result;
      check('연인원 = 8 (4+3+1+0)', res.연인원 === 8, res.연인원);
      check('실인원 = 3 (1회 이상 출석)', res.실인원 === 3, res.실인원);
      check('수료인원 = 2 (75% 이상)', res.수료인원 === 2, res.수료인원);
      check('총강의시간 = 8 (4회 × 2시간)', res.총강의시간 === 8, res.총강의시간);
      const attRows = readTable_(SHEETS.ATTENDANCE).rows.filter(a => String(a.강좌ID) === cid).length;
      check('출석 기록 중복 없음 (4명 × 4회 = 16줄)', attRows === 16, attRows + '줄');
      expectFail('출석 기록된 회차보다 총회차 줄이기 차단',
        () => saveCourse_(staff, Object.assign({}, base, { 강좌ID: cid, 총회차: 3 })));

      deleteParticipant_(staff, ids['박다온']);
      res = getCourseDetail_(staff, cid).result;
      check('잘못 등록한 참여자 삭제 → 자동 재계산 (연인원 7)', res.연인원 === 7, res.연인원);

      const sub = submitReport_(staff, year, '상반기');
      check('반기 보고 제출', sub.상태 === ST_SUBMITTED && sub.연인원 === 7, `${sub.상태}, 연인원 ${sub.연인원}`);
      expectFail('제출 후 출석 수정 잠금', () => saveAttendance_(staff, cid, 1, []));
      expectFail('제출 후 같은 반기에 새 강좌 등록 잠금',
        () => saveCourse_(staff, Object.assign({}, base, { 강좌명: '[샘플] 추가 강좌' })));
      expectFail('지회 계정으로 승인 차단', () => approveReport_(staff, TEST_CHAPTER, year, '상반기'));

      rejectReport_(admin, TEST_CHAPTER, year, '상반기', '테스트 반려');
      saveAttendance_(staff, cid, 3, [ids['김가람'], ids['이나래']]);
      res = getCourseDetail_(staff, cid).result;
      check('반려 후 수정 가능 (연인원 8)', res.연인원 === 8, res.연인원);
      submitReport_(staff, year, '상반기');
      const ap = approveReport_(admin, TEST_CHAPTER, year, '상반기');
      check('재제출 → 도협회 승인', ap.상태 === ST_APPROVED, ap.상태);
      const st = getReportStatus_(staff, year, '상반기');
      check('지회 화면에도 승인 표시', st.rows[0].상태 === ST_APPROVED, st.rows[0].상태);

      const an = submitReport_(staff, year, '연간');
      check('연간 보고 제출: 상·하반기 강좌 3개 합산 (연인원 100)', an.상태 === ST_SUBMITTED && an.강좌수 === 3 && an.연인원 === 100,
        `강좌 ${an.강좌수}개, 연인원 ${an.연인원}`);
      const ad = getReportDetail_(staff, '', year, '연간');
      check('내부/외부별 소계: 내부 8, 외부 92', ad.구분별.length === 2 && ad.구분별[0].구분 === '내부' && ad.구분별[0].연인원 === 8 && ad.구분별[1].연인원 === 92,
        ad.구분별.map(x => `${x.구분} ${x.연인원}`).join(', '));
      check('수준별 소계: 초급 8, 구분없음 92', ad.수준별[0].구분 === '초급' && ad.수준별[0].연인원 === 8 && ad.수준별[1].구분 === '구분없음',
        ad.수준별.map(x => `${x.구분} ${x.연인원}`).join(', '));
      check('연간 상세: 상반기 8 + 하반기 92', ad.반기별.상반기.연인원 === 8 && ad.반기별.하반기.연인원 === 92,
        `${ad.반기별.상반기.연인원} + ${ad.반기별.하반기.연인원}`);
      expectFail('연간 보고 제출 후 하반기 강좌 수정 잠금', () => saveHeadcount_(staff, hid, 1, 5));
      rejectReport_(admin, TEST_CHAPTER, year, '연간', '테스트 반려');
      saveHeadcount_(staff, hid, 1, 31);
      check('연간 반려 후 수정 가능', true);
    });
  } catch (e) {
    lines.push('❌ 예상하지 못한 오류: ' + (e && e.message ? e.message : e));
  }
  return lines;
}