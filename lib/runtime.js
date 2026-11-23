'use strict';
// Code.gs(구글 앱스스크립트용 기존 코드)를 그대로 불러와 실행하되,
// 시트를 읽고 쓰는 부분만 Supabase 로 바꿔 끼우는 실행기입니다.
//   요청 하나 = [필요한 표를 DB에서 읽기] → [Code.gs 규칙대로 처리] → [바뀐 줄을 한 번에 저장]
const vm = require('vm');
const crypto = require('crypto');
const SOURCE = require('./gas_source');
const { toDbRow: toDbRowPlain, fromDbValue } = require('./schema');
const crypt = require('./crypt');

// DB 에 넣을 때: 수강생 이름·연락처·비고는 암호화
function toDbRow(headers, obj, tableName) {
  const o = toDbRowPlain(headers, obj);
  headers.forEach(h => { if (crypt.isSensitive(tableName, h) && o[h]) o[h] = crypt.encrypt(o[h]); });
  return o;
}

const SCRIPT = new vm.Script(SOURCE, { filename: 'Code.gs' });

// 시트 도우미를 DB 버전으로 바꿔 끼움
const OVERRIDES = new vm.Script(`
function resetMemo_() {}
function readTable_(def) { return __host.read(def); }
function updateRow_(table, obj) { __host.update(table, obj); }
function appendRows_(table, objs) { __host.append(table, objs); }
function deleteRows_(table, rowNums) { __host.remove(table, rowNums); }
function rewriteTable_() { throw new Error('이 작업은 구글 시트 메뉴에서만 쓸 수 있습니다.'); }
function appendLog_(id, action, detail) { __host.log(id, action, detail); }
function withLock_(fn) { return fn(); }
function auth_() { return __host.user; }
this.__x = { SHEETS: SHEETS, SESSION_HOURS: SESSION_HOURS, MAX_LOGIN_FAIL: MAX_LOGIN_FAIL, TZ: TZ };
`, { filename: 'overrides.js' });

// 웹 화면에서 부를 수 있는 함수: Code.gs 의 'function 이름(token, ...)' 모양을 자동으로 찾음
const API = {};
{
  const re = /function (\w+)\(token\b[^)]*\)\s*\{\s*return api_\(token,\s*user => ([^;]*?)\);/g;
  let m;
  while ((m = re.exec(SOURCE))) API[m[1]] = { write: /,\s*true\s*$/.test(m[2]) };
  const re2 = /^function (\w+)\(linkToken\b[^)]*\) \{ return (linkApi_|applyApi_|statusApi_|surveyApi_|resultApi_|groupApi_|feeApi_|attendApi_|payApi_|refundApi_|schoolApi_)\(.*\); \}$/gm;   // 강사 링크 함수는 한 줄로 씁니다
  while ((m = re2.exec(SOURCE))) API[m[1]] = { link: true, kind: m[2], write: /, true\); \}$/.test(m[0]) };
  API.login = { special: true };
  API.googleLogin = { special: true };
  API.logout = { special: true };
}

// 함수마다 읽어야 하는 표 (기본: 전부). 출석·명단은 길어질 수 있어 강좌 하나만 읽는 함수를 따로 표시
const ALL = ['MEMBERS', 'COURSES', 'PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS', 'CERTSET', 'CERTS', 'SESSIONPLAN'];
const COURSE_SCOPED = {
  getCourseDetail: id => id, saveAttendance: id => id, saveHeadcount: id => id, addParticipants: id => id,
  getCertInfo: id => id, saveCertSetting: id => id, issueCerts: id => id, deleteCourse: id => id,
  getJournal: id => id, saveJournal: id => id, addJournalPhoto: id => id, deleteJournalPhoto: id => id, deleteJournalMedia: id => id, getJournalPhotos: id => id, getTasks: id => id, saveTask: id => id, deleteTask: id => id,
  saveScores: id => id, saveFeeTax: id => id, getSurvey: id => id, saveSurveyQuestions: id => id, saveSurveyLink: id => id, saveSurveyResultLink: id => id,
  getQr: id => id, saveQr: id => id, getAttendNow: id => id, getSigns: id => id, savePosterImg: id => id, deletePosterImg: id => id, getPosterImg: id => id, getPlan: id => id, savePlan: id => id,
  getPay: id => id, setPaid: id => id, unsetPaid: id => id, issueReceipts: id => id, voidReceipt: id => id, createRefundLink: id => id, saveRefundRequest: id => id, completeRefund: id => id, cancelRefundRequest: id => id, savePayLink: id => id,
  getApply: id => id, saveApplyLink: id => id, addApply: id => id, decideApply: id => id, deleteApply: id => id,
  setSubmit: id => id, setCompletion: id => id, setConfirmReceived: id => id, getConfirm: id => id, resetConfirm: id => id, markConfirmSent: id => id, markConfirmSeen: id => id,
  getTeacherLink: id => id, createTeacherLink: id => id, revokeTeacherLink: id => id, setLinkExpiry: id => id,
  saveCourse: data => (data && data.강좌ID) || '__new__'
};
const FILE_TABLES = ['MEMBERS', 'REQUESTS', 'FILES', 'REPLIES'];
const FILE_FNS = ['listRequests', 'getRequest', 'saveRequest', 'deleteRequest', 'deleteRequestPaths', 'fileUploadPrep', 'fileUploadDone', 'fileDownloadPrep',
  'deleteFile', 'deleteFilePaths', 'saveReply', 'submitReply', 'rejectReply', 'deleteReplyFiles', 'deleteReplyPaths'];
const ONLY = {   // 필요한 표만 읽는 함수 (속도)
  getInitData: ['MEMBERS', 'COURSES'],
  ...Object.fromEntries(['getApply', 'saveApplyLink', 'addApply', 'decideApply', 'deleteApply'].map(f => [f, ['MEMBERS', 'COURSES', 'PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS', 'APPLYLINKS', 'APPLICANTS', 'POSTERS']])),
  ...Object.fromEntries(['savePosterImg', 'deletePosterImg', 'getPosterImg'].map(f => [f, ['MEMBERS', 'COURSES', 'PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS', 'APPLYLINKS', 'APPLICANTS', 'POSTERS']])),
  getSigns: ['MEMBERS', 'COURSES', 'ATTENDSIGN'],
  ...Object.fromEntries(['getGroupPoster', 'saveGroupPoster', 'deleteGroupPoster'].map(f => [f, ['MEMBERS', 'APPLYGROUPS', 'POSTERS']])),
  ...Object.fromEntries(['getPay', 'setPaid', 'unsetPaid', 'issueReceipts', 'voidReceipt', 'createRefundLink', 'saveRefundRequest', 'completeRefund', 'cancelRefundRequest', 'savePayLink'].map(f => [f, ['MEMBERS', 'COURSES', 'PARTICIPANTS', 'PAYMENTS', 'STULINKS']])),
  ...Object.fromEntries(['getQr', 'saveQr', 'getAttendNow'].map(f => [f, ['MEMBERS', 'COURSES', 'ATTENDANCE', 'STULINKS', 'QRLOG']])),
  ...Object.fromEntries(['getSurvey', 'saveSurveyQuestions', 'saveSurveyLink', 'saveSurveyResultLink'].map(f => [f, ['MEMBERS', 'COURSES', 'SURVEYS', 'SURVEYRESP']])),
  ...Object.fromEntries(['getApplyHub', 'saveApplyGroup', 'deleteApplyGroup', 'createApplyLinks'].map(f => [f, ['MEMBERS', 'COURSES', 'APPLYLINKS', 'APPLYGROUPS', 'APPLICANTS']])),
  getFeeHub: ['MEMBERS', 'COURSES', 'SESSIONPLAN'], getFeeDraft: ['MEMBERS', 'COURSES', 'SESSIONPLAN'],
  getPlan: ['MEMBERS', 'COURSES', 'SESSIONPLAN'], savePlan: ['MEMBERS', 'COURSES', 'SESSIONPLAN', 'REPORTS', 'PARTICIPANTS', 'ATTENDANCE', 'RESULTS'],
  ...Object.fromEntries(['saveFeeCert', 'getFeeCert', 'createFeeLink', 'revokeFeeLink', 'resetFeeCert', 'deleteFeeCert'].map(f => [f, ['MEMBERS']])),
  saveMyContact: ['MEMBERS'],
  getSeals: ['MEMBERS', 'SEALS'], saveSeal: ['MEMBERS', 'SEALS'], deleteSeal: ['MEMBERS', 'SEALS'],
  getConfirm: ['COURSES', 'CONFIRMS'], resetConfirm: ['COURSES', 'CONFIRMS'], markConfirmSent: ['COURSES', 'CONFIRMS'], markConfirmSeen: ['COURSES', 'CONFIRMS'], listConfirmPending: ['MEMBERS', 'COURSES', 'CONFIRMS'],
  getTeacherLink: ['COURSES', 'LINKS'], createTeacherLink: ['COURSES', 'LINKS'], revokeTeacherLink: ['COURSES', 'LINKS'], setLinkExpiry: ['COURSES', 'LINKS'],
  getJournal: ['COURSES', 'ATTENDANCE', 'JOURNAL', 'PHOTOS'], saveJournal: ['COURSES', 'ATTENDANCE', 'JOURNAL', 'PHOTOS'],
  addJournalPhoto: ['COURSES', 'ATTENDANCE', 'JOURNAL', 'PHOTOS', 'PHOTODATA'], deleteJournalPhoto: ['COURSES', 'ATTENDANCE', 'JOURNAL', 'PHOTOS', 'PHOTODATA'], deleteJournalMedia: ['COURSES', 'ATTENDANCE', 'JOURNAL', 'PHOTOS', 'PHOTODATA', 'ATTENDSIGN'], getJournalPhotos: ['COURSES', 'PHOTODATA'],
  getTasks: ['COURSES', 'PARTICIPANTS', 'TASKS', 'SUBMITS'], saveTask: ['COURSES', 'PARTICIPANTS', 'TASKS', 'SUBMITS'],
  deleteTask: ['COURSES', 'PARTICIPANTS', 'TASKS', 'SUBMITS'], setSubmit: ['COURSES', 'PARTICIPANTS', 'TASKS', 'SUBMITS'],
  listCourses: ['MEMBERS', 'COURSES', 'RESULTS'],
  ...Object.fromEntries(FILE_FNS.map(f => [f, FILE_TABLES])),
  ...Object.fromEntries(['getInquiries', 'openInquiry', 'saveInquiry', 'replyInquiry', 'setInquiryStatus', 'getInquiryBadge'].map(f => [f, ['MEMBERS', 'INQUIRIES', 'COURSES', 'DISPATCH']])),
  ...Object.fromEntries(['getNotices', 'saveNotice', 'setNoticeStatus', 'deleteNotice'].map(f => [f, ['MEMBERS', 'NOTICES']])),
  ...Object.fromEntries(['getDispatches', 'getDispatchBadge', 'saveDispatch', 'saveDispatchBatch', 'cancelDispatch', 'deleteDispatch', 'revealFeeRrn'].map(f => [f, f === 'revealFeeRrn' ? ['MEMBERS'] : ['MEMBERS', 'DISPATCH']])),
  ...Object.fromEntries(['replyDispatch', 'confirmDispatch'].map(f => [f, ALL.concat(['DISPATCH'])])),
  ...Object.fromEntries(['changeDispatchSchedule', 'updateDispatchInfo'].map(f => [f, ALL.concat(['DISPATCH', 'INQUIRIES'])])),
  listCerts: ['MEMBERS', 'COURSES', 'CERTS'],
  deleteCert: ['MEMBERS', 'COURSES', 'CERTS'],
  changePassword: ['MEMBERS'], savePrintSettings: ['MEMBERS'], listMembers: ['MEMBERS'], resetPassword: ['MEMBERS']
};

const chapterOnly = u => ({ FEECERTS: { 지회명: u.chapter }, FEETEACHERS: { 지회명: u.chapter } });
const PHASE2 = {   // 강사비: 로그인한 지회의 확인증만 읽음. 출석·일지는 그 강사의 강좌만 읽음
  ...Object.fromEntries(['getDispatches', 'saveDispatch', 'saveDispatchBatch', 'cancelDispatch', 'deleteDispatch', 'replyDispatch', 'confirmDispatch', 'changeDispatchSchedule', 'updateDispatchInfo'].map(f => [f, () => ({ FEECERTS: { 지회명: '도협회' } })])),
  revealFeeRrn: chapterOnly,
  getFeeHub: chapterOnly, saveFeeCert: chapterOnly, getFeeCert: chapterOnly, createFeeLink: chapterOnly, revokeFeeLink: chapterOnly, resetFeeCert: chapterOnly, deleteFeeCert: chapterOnly,
  getFeeDraft: (u, ctx, args) => { const ids = ctx.feeScopeIds_(u, ...args); return { FEETEACHERS: { 지회명: u.chapter }, ATTENDANCE: ids, JOURNAL: ids, SESSIONPLAN: ids }; }
};

function tablePlan(fn, args) {
  let keys = ONLY[fn] || ALL;
  // 실적(RESULTS)을 다시 계산하는 함수는 회차별 시간(SESSIONPLAN)도 함께 읽음
  if (keys.includes('RESULTS') && !keys.includes('SESSIONPLAN')) keys = keys.concat(['SESSIONPLAN']);
  const filters = {};
  if (COURSE_SCOPED[fn]) {
    const id = COURSE_SCOPED[fn](args[0]);
    if (id !== undefined && id !== null && id !== '') { filters.PARTICIPANTS = id; filters.ATTENDANCE = id; filters.JOURNAL = id; filters.TASKS = id; filters.SESSIONPLAN = id; filters.SUBMITS = id; filters.LINKS = id; filters.APPLYLINKS = id; filters.APPLICANTS = id; filters.SURVEYS = id; filters.SURVEYRESP = id; filters.CONFIRMS = id; filters.PHOTOS = id; filters.STULINKS = id; filters.QRLOG = id; filters.PAYMENTS = id; }
    // 사진 본문은 크므로 필요한 것만 읽음 (표 이름 PHOTODATA)
    if (fn === 'getJournalPhotos') filters.PHOTODATA = args[1] ? { 강좌ID: id, 회차: Number(args[1]) || 0 } : id;
    if (fn === 'addJournalPhoto') filters.PHOTODATA = { 사진ID: '__none__' };
    if (fn === 'deleteJournalMedia') { filters.PHOTODATA = { 강좌ID: id }; filters.ATTENDSIGN = { 강좌ID: id }; }
    if (fn === 'getSigns') filters.ATTENDSIGN = id;
    if (['getApply', 'saveApplyLink', 'addApply', 'decideApply', 'deleteApply', 'savePosterImg', 'deletePosterImg', 'getPosterImg'].includes(fn)) filters.POSTERS = id;
    if (fn === 'getApply' || fn === 'saveApplyLink') delete filters.APPLYLINKS;   // 같은 지회 다른 강좌의 접수 항목 불러오기용
    if (fn === 'deleteJournalPhoto') filters.PHOTODATA = { 사진ID: String(args[1] || '') };
  }
  if (['getGroupPoster', 'saveGroupPoster', 'deleteGroupPoster'].includes(fn)) filters.POSTERS = { 강좌ID: String(args[0] || '__none__') };   // 그 접수 안내(묶음)의 포스터만
  return { keys, filters };
}

function makeContext(host) {
  const tz = (d, tzName) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(d).map(x => [x.type, x.value]));
    return { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour === '24' ? '00' : p.hour, mm: p.minute, ss: p.second, M: String(Number(p.month)) };
  };
  const memCache = new Map();
  const ctx = {
    console, __host: host,
    Utilities: {
      formatDate: (d, tzName, fmt) => { const p = tz(d, tzName); return fmt.replace(/yyyy|MM|dd|HH|mm|ss|M/g, t => p[t]); },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' }
    },
    CacheService: { getScriptCache: () => ({ get: k => (memCache.has(k) ? memCache.get(k) : null), put: (k, v) => memCache.set(k, String(v)), remove: k => memCache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    SpreadsheetApp: { flush: () => {}, getUi: () => { throw new Error('구글 시트 메뉴에서만 쓸 수 있습니다.'); },
      getActiveSpreadsheet: () => { throw new Error('구글 시트를 쓰지 않는 환경입니다.'); } },
    HtmlService: {}
  };
  vm.createContext(ctx);
  SCRIPT.runInContext(ctx);
  OVERRIDES.runInContext(ctx);
  return ctx;
}

// 한 요청 동안의 표 모음 + 바뀐 줄 기록
class Host {
  constructor() { this.tables = {}; this.ops = []; this.logs = []; this.tmp = 0; this.user = null; this.ctx = null; }

  setTable(def, rawRows) {
    const rows = rawRows.map(r => {
      const o = { _row: Number(r.id) };
      def.headers.forEach(h => { o[h] = fromDbValue(h, crypt.isSensitive(def.name, h) ? crypt.decrypt(r[h]) : r[h]); });
      return o;
    });
    this.tables[def.name] = { def: def, headers: def.headers.slice(), rows: rows, sh: null };
  }
  read(def) {
    const t = this.tables[def.name];
    if (!t) throw new Error(`내부 오류: '${def.name}' 표를 이 요청에서 읽지 않았습니다.`);
    return t;
  }
  update(table, obj) {
    const name = table.def.name;
    const v = toDbRow(table.headers, obj, name);
    const at = table.rows.findIndex(r => r._row === obj._row);   // 같은 요청 안에서 다시 읽어도 바뀐 값이 보이게 함 (시트와 똑같이)
    if (at >= 0 && table.rows[at] !== obj) table.rows[at] = obj;
    const pending = this.ops.find(o => o.k === 'insert' && o.t === name && o.rows && o.rows.includes(obj));
    if (pending) { pending.vals[pending.rows.indexOf(obj)] = v; return; }   // 같은 요청에서 방금 추가한 줄
    const key = name + '#' + obj._row;
    const prev = this.ops.find(o => o.key === key);
    if (prev) { prev.v = v; return; }
    this.ops.push({ k: 'update', t: name, id: obj._row, v: v, key: key });
  }
  append(table, objs) {
    if (!objs.length) return;
    const name = table.def.name;
    objs.forEach(o => { o._row = -(++this.tmp); table.rows.push(o); });
    this.ops.push({ k: 'insert', t: name, rows: objs.slice(), vals: objs.map(o => toDbRow(table.headers, o, name)) });
  }
  remove(table, rowNums) {
    const name = table.def.name, real = [], gone = new Set(rowNums);
    rowNums.forEach(n => { if (n > 0) real.push(n); });
    table.rows = table.rows.filter(r => !gone.has(r._row));
    this.ops.forEach(o => {
      if (o.k === 'insert' && o.t === name) {
        for (let i = o.rows.length - 1; i >= 0; i--) if (gone.has(o.rows[i]._row)) { o.rows.splice(i, 1); o.vals.splice(i, 1); }
      }
    });
    this.ops = this.ops.filter(o => !(o.k === 'update' && o.t === name && gone.has(o.id)));
    if (real.length) this.ops.push({ k: 'delete', t: name, ids: real });
  }
  log(id, action, detail) {
    const def = this.ctx.__x.SHEETS.LOGS;
    this.logs.push({ k: 'insert', t: def.name, v: [toDbRow(def.headers,
      { 일시: this.ctx.now_(), 아이디: id, 작업: action, 내용: String(detail || '').slice(0, 1000) })] });
  }
  // DB 로 보낼 모양으로 정리
  flushOps(includeChanges) {
    const out = [];
    if (includeChanges) {
      this.ops.forEach(o => {
        if (o.k === 'insert') { if (o.vals.length) out.push({ k: 'insert', t: o.t, v: o.vals }); }
        else if (o.k === 'update') out.push({ k: 'update', t: o.t, id: o.id, v: o.v });
        else out.push(o);
      });
    }
    this.logs.forEach(l => out.push(l));
    return out;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function errJson(ctx, e) { return ctx.errorResult_(e); }

async function loadInto(db, host, ctx, keys, filters) {
  const S = ctx.__x.SHEETS;
  await Promise.all(keys.map(async k => {
    const def = S[k];
    const fv = filters && filters[k], f = fv ? (typeof fv === 'object' && !Array.isArray(fv) ? fv : { 강좌ID: fv }) : undefined;
    host.setTable(def, await db.loadTable(def.name, f));
  }));
}

// ===== 로그인 =====
async function doLogin(db, id, password) {
  const host = new Host();
  const ctx = makeContext(host); host.ctx = ctx;
  try {
    const uid = String(id == null ? '' : id).trim().toLowerCase();
    const pw = String(password == null ? '' : password);
    if (!uid || !pw) ctx.fail_('아이디와 비밀번호를 입력해 주세요.');
    const failKey = 'fail_' + uid, MAX = ctx.__x.MAX_LOGIN_FAIL;
    const fails = await db.getFail(failKey);
    if (fails >= MAX) ctx.fail_(`비밀번호를 ${MAX}번 틀려 10분간 로그인이 제한됩니다.`);
    await loadInto(db, host, ctx, ['MEMBERS']);
    const t = ctx.readTable_(ctx.__x.SHEETS.MEMBERS);
    const m = t.rows.find(r => String(r.아이디).trim().toLowerCase() === uid);
    const stored = m ? String(m.비밀번호 == null ? '' : m.비밀번호) : '';
    if (m && !stored) ctx.fail_('비밀번호가 아직 설정되지 않은 계정입니다. 도협회에 문의하세요.');
    if (!m || !ctx.checkPassword_(pw, stored)) {
      await db.setFail(failKey, fails + 1, 600);
      ctx.fail_('아이디 또는 비밀번호가 맞지 않습니다.');
    }
    if (String(m.사용여부).trim().toUpperCase() === 'N') ctx.fail_('사용이 중지된 계정입니다. 도협회에 문의하세요.');
    const user = ctx.memberToUser_(m);
    if (fails) await db.clearFail(failKey);
    if (!ctx.isHashed_(stored)) m.비밀번호 = ctx.makeHash_(pw);   // 처음 로그인 시 자동 암호화
    m.최근접속 = ctx.now_();
    ctx.updateRow_(t, m);
    host.user = user;
    ctx.log_(user, '로그인', '');
    await db.applyOps(host.flushOps(true));
    const token = crypto.randomUUID();
    const hours = Math.min(ctx.__x.SESSION_HOURS, 6);
    await db.purgeSessions();
    await db.putSession(token, user.id, Date.now() + hours * 3600 * 1000);
    return { ok: true, data: { token: token, user: user } };
  } catch (e) {
    return errJson(ctx, e);
  }
}

// ===== 구글 로그인 (통합 시스템) =====
// ident = { email, name, role: '도협회' | '지회', chapter }  ← api/call.js 가 구글 로그인 확인 후 직접 만들어 넣습니다. 화면이 보낸 값이 아닙니다.
async function doGoogleLogin(db, ident) {
  const host = new Host();
  const ctx = makeContext(host); host.ctx = ctx;
  try {
    if (!ident || !ident.email) ctx.fail_('구글 로그인 확인에 실패했습니다.', 'AUTH');
    const uid = String(ident.email).trim().toLowerCase();
    await loadInto(db, host, ctx, ['MEMBERS']);
    const S1 = ctx.__x.SHEETS.MEMBERS;
    const t = ctx.readTable_(S1);
    let m = t.rows.find(r => String(r.아이디).trim().toLowerCase() === uid);
    if (m) {   // 이름·지회·권한은 통합 시스템 직원 등록 내용을 따라감
      m.지회명 = ident.role === '도협회' ? (m.지회명 || '도협회') : ident.chapter;
      m.담당자 = ident.name || m.담당자; m.권한 = ident.role; m.사용여부 = 'Y'; m.최근접속 = ctx.now_();
      if (ident.profile) { m.연락처 = ident.profile.phone; m.센터연락처 = ident.profile.center; m.직통번호 = ident.profile.direct; }
      ctx.updateRow_(t, m);
    } else {
      m = { 아이디: uid, 비밀번호: ctx.makeHash_(crypto.randomBytes(24).toString('hex')), 지회명: ident.role === '도협회' ? '도협회' : ident.chapter,
            담당자: ident.name || '', 권한: ident.role, 사용여부: 'Y', 최근접속: ctx.now_(),
            연락처: ident.profile ? ident.profile.phone : '', 센터연락처: ident.profile ? ident.profile.center : '', 직통번호: ident.profile ? ident.profile.direct : '' };
      ctx.appendRows_(t, [m]);
    }
    const user = ctx.memberToUser_(m);
    host.user = user;
    ctx.log_(user, '로그인', '구글');
    await db.applyOps(host.flushOps(true));
    const token = crypto.randomUUID();
    const hours = Math.min(ctx.__x.SESSION_HOURS, 6);
    await db.purgeSessions();
    await db.putSession(token, user.id, Date.now() + hours * 3600 * 1000);
    return { ok: true, data: { token: token, user: user } };
  } catch (e) {
    return errJson(ctx, e);
  }
}

// ===== 일반 요청 =====
async function acquireLock(db, owner) {
  for (let i = 0; i < 40; i++) {            // 최대 약 10초 기다림
    if (await db.tryLock('main', owner, 25)) return true;
    await sleep(250);
  }
  return false;
}

async function callApi(db, fn, args) {
  const spec = API[fn];
  const token = args[0];
  const host = new Host();
  const ctx = makeContext(host); host.ctx = ctx;
  const owner = crypto.randomUUID();
  let locked = false;
  try {
    if (!token) ctx.fail_('로그인이 필요합니다.', 'AUTH');
    const plan = tablePlan(fn, args.slice(1));
    if (spec.write) {
      if (!(await acquireLock(db, owner))) ctx.fail_('지금 다른 곳에서 저장 중입니다. 잠시 후 다시 시도해 주세요.', 'BUSY');
      locked = true;
    }
    const keys = plan.keys.includes('MEMBERS') ? plan.keys : ['MEMBERS'].concat(plan.keys);
    const [sess] = await Promise.all([db.getSession(String(token)), loadInto(db, host, ctx, keys, plan.filters)]);
    if (!sess || sess.expiresAt < Date.now()) ctx.fail_('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'AUTH');
    const m = ctx.findMember_(sess.memberId);
    if (!m || String(m.사용여부).trim().toUpperCase() === 'N') {
      await db.delSession(String(token));
      ctx.fail_('사용할 수 없는 계정입니다. 도협회에 문의하세요.', 'AUTH');
    }
    host.user = ctx.memberToUser_(m);
    if (PHASE2[fn]) {   // 로그인한 사람이 정해진 뒤, 그 지회 것만 더 읽기
      const want = PHASE2[fn](host.user, ctx, args), S2 = ctx.__x.SHEETS;
      await Promise.all(Object.keys(want).map(async k => {
        const v = want[k];
        if (v === null || (Array.isArray(v) && !v.length)) return host.setTable(S2[k], []);
        host.setTable(S2[k], await db.loadTable(S2[k].name, Array.isArray(v) ? { 강좌ID: v } : v));
      }));
    }
    const hours = Math.min(ctx.__x.SESSION_HOURS, 6), full = hours * 3600 * 1000;
    if (sess.expiresAt - Date.now() < full - 10 * 60 * 1000) await db.touchSession(String(token), Date.now() + full);
    const result = ctx[fn](...args);
    const ok = result && result.ok;
    const system = result && !result.ok && result.code === 'SYSTEM';
    if (ok || system) await db.applyOps(host.flushOps(!!ok));
    return JSON.parse(JSON.stringify(result === undefined ? null : result));
  } catch (e) {
    const r = errJson(ctx, e);
    try { await db.applyOps(host.flushOps(false)); } catch (e2) { /* 기록 실패는 무시 */ }
    return JSON.parse(JSON.stringify(r));
  } finally {
    if (locked) { try { await db.releaseLock('main', owner); } catch (e) { /* 잠금은 25초 뒤 자동 해제 */ } }
  }
}

// 강사 링크: 로그인 없이 링크 글자만으로 한 강좌에 대해서만 동작
const LINK_TABLES = {
  tInfo: ['PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS'],
  tSaveAttendance: ['PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS'],
  tSaveHeadcount: ['PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS'],
  tGetConfirm: ['CONFIRMS'], tSaveConfirm: ['CONFIRMS'], tSignConfirm: ['CONFIRMS'], tResetConfirm: ['CONFIRMS'],
  tSaveSession: ['PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS', 'CONFIRMS'], tSubmitConfirm: ['PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS', 'CONFIRMS'],
  sInfo: ['PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS', 'CONFIRMS'], sSign: ['PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS', 'CONFIRMS'],
  tGetJournal: ['ATTENDANCE', 'JOURNAL', 'PHOTOS'], tSaveJournal: ['ATTENDANCE', 'JOURNAL', 'PHOTOS'],
  tAddJournalPhoto: ['ATTENDANCE', 'JOURNAL', 'PHOTOS', 'PHOTODATA'], tDeleteJournalPhoto: ['ATTENDANCE', 'JOURNAL', 'PHOTOS', 'PHOTODATA'], tGetJournalPhotos: ['PHOTODATA'],
  payInfo: [], payReceipt: ['PARTICIPANTS', 'PAYMENTS', 'QRLOG', 'SEALS'], refundInfo: [], refundSubmit: [],
  attendInfo: ['PARTICIPANTS', 'ATTENDANCE', 'QRLOG'], attendSubmit: ['PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS', 'QRLOG', 'ATTENDSIGN'],
  applyInfo: ['POSTERS'], applySubmit: ['APPLICANTS'], applyStatus: ['APPLICANTS'], feeInfo: [], feeSign: [], groupInfo: ['POSTERS'], groupSubmit: ['APPLICANTS'], surveyInfo: [], surveySubmit: ['SURVEYRESP'], resultInfo: ['SURVEYRESP'],
  tSaveScores: ['PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS'], tSetCompletion: ['PARTICIPANTS', 'ATTENDANCE', 'RESULTS', 'REPORTS', 'CERTS'],
  tGetTasks: ['PARTICIPANTS', 'TASKS', 'SUBMITS'], tSaveTask: ['PARTICIPANTS', 'TASKS', 'SUBMITS'], tSetSubmit: ['PARTICIPANTS', 'TASKS', 'SUBMITS']
};
async function callLinkApi(db, fn, args) {
  const spec = API[fn];
  const host = new Host();
  const ctx = makeContext(host); host.ctx = ctx;
  const owner = crypto.randomUUID();
  let locked = false;
  try {
    if (spec.write) {
      if (!(await acquireLock(db, owner))) ctx.fail_('지금 다른 곳에서 저장 중입니다. 잠시 후 다시 시도해 주세요.', 'BUSY');
      locked = true;
    }
    await loadInto(db, host, ctx, spec.kind === 'feeApi_' ? [] : spec.kind === 'refundApi_' ? ['COURSES'] : ['COURSES', 'LINKS', 'APPLYLINKS', 'SURVEYS', 'APPLYGROUPS', 'STULINKS']);
    if (spec.kind === 'feeApi_') {   // 확인증 링크: 그 링크의 줄 하나만 읽음
      const tok = String(args[0] == null ? '' : args[0]).trim(), S2 = ctx.__x.SHEETS;
      host.setTable(S2.FEECERTS, /^[0-9a-f]{40}$/.test(tok) ? await db.loadTable(S2.FEECERTS.name, { 토큰해시: ctx.feeHash_(tok) }) : []);
      const result = ctx[fn](...args), ok = result && result.ok, system = result && !result.ok && result.code === 'SYSTEM';
      if (ok || system) await db.applyOps(host.flushOps(!!ok));
      return JSON.parse(JSON.stringify(result === undefined ? null : result));
    }
    if (spec.kind === 'refundApi_') {   // 환불 링크: 그 링크의 수납 줄 하나만 읽음
      const tok = String(args[0] == null ? '' : args[0]).trim(), S2 = ctx.__x.SHEETS;
      host.setTable(S2.PAYMENTS, /^[0-9a-f]{40}$/.test(tok) ? await db.loadTable(S2.PAYMENTS.name, { 환불토큰해시: ctx.refundHash_(tok) }) : []);
      const result = ctx[fn](...args), ok = result && result.ok, system = result && !result.ok && result.code === 'SYSTEM';
      if (ok || system) await db.applyOps(host.flushOps(!!ok));
      return JSON.parse(JSON.stringify(result === undefined ? null : result));
    }
    if (spec.kind === 'schoolApi_') {   // 학교 서명 링크: 먼저 그 확인서 줄을 찾아 강좌를 알아냄
      const tok = String(args[0] == null ? '' : args[0]).trim(), S2 = ctx.__x.SHEETS;
      host.setTable(S2.CONFIRMS, /^[0-9a-f]{40}$/.test(tok) ? await db.loadTable(S2.CONFIRMS.name, { 학교토큰해시: ctx.schoolHash_(tok) }) : []);
    }
    const resolver = { schoolApi_: 'schoolCourseId_', applyApi_: 'applyCourseId_', statusApi_: 'statusCourseIds_', surveyApi_: 'surveyCourseId_', resultApi_: 'resultCourseId_', groupApi_: 'groupCourseIds_', attendApi_: 'attendCourseId_', payApi_: 'payCourseId_' }[spec.kind] || 'linkCourseId_';
    let id = ctx[resolver](String(args[0] == null ? '' : args[0]));
    if (Array.isArray(id)) id = id.length ? id : '';   // 묶음 링크: 강좌 여러 개
    const f = id ? { PAYMENTS: id, QRLOG: id, APPLICANTS: id, SURVEYRESP: id, PARTICIPANTS: id, ATTENDANCE: id, JOURNAL: id, TASKS: id, SUBMITS: id, CONFIRMS: id, PHOTOS: id, POSTERS: id, SESSIONPLAN: id } : {};
    if (id) {
      if (fn === 'attendSubmit') f.ATTENDSIGN = { 참여자ID: '__none__' };
      if (fn === 'tGetJournalPhotos') f.PHOTODATA = args[1] ? { 강좌ID: id, 회차: Number(args[1]) || 0 } : id;
      if (fn === 'tAddJournalPhoto') f.PHOTODATA = { 사진ID: '__none__' };
      if (fn === 'tDeleteJournalPhoto') f.PHOTODATA = { 사진ID: String(args[1] || '') };
    }
    if (fn === 'groupInfo') { const g = ctx.groupRow_(String(args[0] == null ? '' : args[0])); f.POSTERS = { 강좌ID: g ? String(g.묶음ID) : '__none__' }; }   // 묶음 포스터
    if (id && fn === 'payReceipt') { const cr = ctx.readTable_(ctx.__x.SHEETS.COURSES).rows.find(r => String(r.강좌ID) === id); f.SEALS = { 지회명: cr ? cr.지회명 : '__none__' }; }
    let lt = id ? (LINK_TABLES[fn] || []) : [];
    if (lt.includes('RESULTS') && !lt.includes('SESSIONPLAN')) lt = lt.concat(['SESSIONPLAN']);   // 실적 다시 계산 → 회차별 시간
    await loadInto(db, host, ctx, lt, f);
    const result = ctx[fn](...args);
    const ok = result && result.ok;
    const system = result && !result.ok && result.code === 'SYSTEM';
    if (ok || system) await db.applyOps(host.flushOps(!!ok));
    return JSON.parse(JSON.stringify(result === undefined ? null : result));
  } catch (e) {
    return JSON.parse(JSON.stringify(errJson(ctx, e)));
  } finally {
    if (locked) { try { await db.releaseLock('main', owner); } catch (e) { /* 25초 뒤 자동 해제 */ } }
  }
}

async function handle(db, body) {
  const fn = body && body.fn;
  const args = Array.isArray(body && body.args) ? body.args : [];
  if (!fn || !Object.prototype.hasOwnProperty.call(API, fn)) return { ok: false, error: '알 수 없는 요청입니다.', code: 'SYSTEM' };
  try {
    if (fn === 'login' && process.env.ALLOW_PASSWORD_LOGIN === '1') return await doLogin(db, args[0], args[1]);   // 시험용
    if (fn === 'login') return { ok: false, error: '아이디·비밀번호 로그인은 사용하지 않습니다. 업무 시스템 홈에서 구글로 로그인하세요.', code: 'AUTH' };
    if (fn === 'googleLogin') return await doGoogleLogin(db, args[0]);
    if (fn === 'logout') { if (args[0]) await db.delSession(String(args[0])); return { ok: true, data: null }; }
    if (API[fn].link) return await callLinkApi(db, fn, args);
    const st = require('./storage').get();
    if (fn === 'fileUploadPrep') {          // 업로드 주소 발급
      const res = await callApi(db, fn, args);
      if (res.ok) { try { res.data.upload = await st.signUpload(res.data.path); delete res.data.path; } catch (e) { return { ok: false, error: e.message, code: 'SYSTEM' }; } }
      return res;
    }
    if (fn === 'fileDownloadPrep') {        // 내려받기 주소 발급 (2분 동안만 유효)
      const res = await callApi(db, fn, args);
      if (res.ok) { try { res.data = { url: await st.signDownload(res.data.path, res.data.name), name: res.data.name }; } catch (e) { return { ok: false, error: e.message, code: 'SYSTEM' }; } }
      return res;
    }
    const PRE = { deleteRequest: 'deleteRequestPaths', deleteFile: 'deleteFilePaths', deleteReplyFiles: 'deleteReplyPaths' };
    if (PRE[fn]) {                          // 파일 저장소에서 먼저 지우고, 성공하면 기록(DB)도 지움
      const pre = await callApi(db, PRE[fn], args);
      if (!pre.ok) return pre;
      try { await st.remove(pre.data.paths || []); } catch (e) { return { ok: false, error: e.message, code: 'SYSTEM' }; }
    }
    return await callApi(db, fn, args);
  } catch (e) {
    return { ok: false, error: '처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요. (' + (e && e.message) + ')', code: 'SYSTEM' };
  }
}

// ===== 관리용: 자료 가져오기 / 전체 실적 다시 계산 =====
async function importTables(db, tables, opts) {
  const host = new Host();
  const ctx = makeContext(host);
  const S = ctx.__x.SHEETS, report = {};
  const ops = [];
  Object.keys(S).forEach(k => {
    const def = S[k], rows = tables[def.name];
    if (!Array.isArray(rows)) return;
    if (opts.clear) ops.push({ k: 'truncate', t: def.name });
    report[def.name] = rows.length;
    for (let i = 0; i < rows.length; i += 500) {
      ops.push({ k: 'insert', t: def.name, v: rows.slice(i, i + 500).map(r => toDbRow(def.headers, r, def.name)) });
    }
  });
  await db.applyOps(ops);
  return report;
}

async function recalcAll(db) {
  const host = new Host();
  const ctx = makeContext(host); host.ctx = ctx;
  const owner = crypto.randomUUID();
  if (!(await acquireLock(db, owner))) throw new Error('다른 저장이 진행 중입니다. 잠시 후 다시 시도하세요.');
  try {
    await loadInto(db, host, ctx, ['COURSES', 'PARTICIPANTS', 'ATTENDANCE', 'RESULTS']);
    const ids = ctx.readTable_(ctx.__x.SHEETS.COURSES).rows.map(c => String(c.강좌ID));
    ctx.recalcCourses_(ids);
    await db.applyOps(host.flushOps(true));
    return ids.length;
  } finally { await db.releaseLock('main', owner); }
}

// 매일 자동 실행: 종료 후 3개월 지난 강좌의 일지 사진·서명 삭제
async function purgeMedia(db) {
  const host = new Host();
  const ctx = makeContext(host); host.ctx = ctx;
  const owner = crypto.randomUUID();
  if (!(await acquireLock(db, owner))) throw new Error('다른 저장이 진행 중입니다. 잠시 후 다시 시도하세요.');
  try {
    await loadInto(db, host, ctx, ['COURSES', 'PHOTOS', 'PHOTODATA', 'JOURNAL', 'ATTENDSIGN', 'POSTERS', 'APPLYLINKS', 'APPLYGROUPS']);
    const n = ctx.purgeExpiredMedia_();
    await db.applyOps(host.flushOps(true));
    return n;
  } finally { await db.releaseLock('main', owner); }
}

module.exports = { doLogin, handle, importTables, recalcAll, purgeMedia, API, makeContext, Host };
