'use strict';
// 수강생 이름·연락처·비고를 DB 에 넣기 전에 암호화합니다 (AES-256-GCM).
// 열쇠는 Vercel 환경변수 ENCRYPTION_KEY 에만 있고, Supabase 에는 암호문만 남습니다.
const crypto = require('crypto');

const SENSITIVE = {
  '참여자명단': ['이름', '연락처', '비고', '성별', '점수'],
  '수료증발급': ['이름'],
  '강사링크': ['토큰'],
  '교육일지사진자료': ['사진'],
  '교육일지': ['작성자서명'],
  '접수링크': ['토큰'],
  '수강생링크': ['토큰'],
  '수납': ['환불은행', '환불계좌', '환불예금주', '환불토큰'],
  '접수묶음': ['토큰'],
  '강사비확인증': ['강사명', '연락처', '은행', '계좌번호', '예금주', '토큰', '서명', '주민번호'],
  '파견요청': ['담당교사', '담당교사연락처'],
  '문의': ['제목', '글'],
  '강사정보': ['강사명', '연락처', '계좌번호', '예금주'],
  '직인': ['이미지'],
  '만족도조사': ['토큰', '결과토큰'],
  '만족도응답': ['의견'],
  '접수신청': ['이름', '연락처', '비고', '주소'],
  '자료파일': ['파일명'],
  '자료회신': ['메모'],
  '강의확인서': ['강사서명', '기관소속', '기관담당자', '기관서명', '학교토큰']
};
const PREFIX = 'enc:v1:';
let cached = null;

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 24) throw new Error('ENCRYPTION_KEY 환경변수가 없거나 너무 짧습니다. (영문·숫자 32자 이상으로 정해 Vercel 에 넣어 주세요)');
  if (!cached || cached.raw !== raw) cached = { raw: raw, key: crypto.scryptSync(raw, 'gw-sign-edu-v1', 32) };
  return cached.key;
}

function isSensitive(table, col) { return !!(SENSITIVE[table] && SENSITIVE[table].includes(col)); }

function encrypt(text) {
  const s = String(text == null ? '' : text);
  if (s === '' || s.startsWith(PREFIX)) return s;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([c.update(s, 'utf8'), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), ct].map(b => b.toString('base64')).join('.');
}

function decrypt(text) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) return text;   // 암호화 이전의 값은 그대로
  const [iv, tag, ct] = text.slice(PREFIX.length).split('.').map(x => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  d.setAuthTag(tag);
  try { return Buffer.concat([d.update(ct), d.final()]).toString('utf8'); }
  catch (e) { throw new Error('수강생 정보를 풀지 못했습니다. ENCRYPTION_KEY 가 처음 정한 값과 같은지 확인해 주세요.'); }
}

module.exports = { SENSITIVE, isSensitive, encrypt, decrypt, getKey, PREFIX };
