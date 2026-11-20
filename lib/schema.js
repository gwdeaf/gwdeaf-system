'use strict';
// 숫자로 저장하는 열 이름 (나머지는 모두 글자). Code.gs 의 시트 열 이름과 같아야 합니다.
const NUMERIC = new Set(['연도', '총회차', '회당시간', '수료기준', '회차', '진행회차', '총강의시간',
  '등록인원', '실인원', '연인원', '수료인원', '수료율', '강좌수', '자리수', '크기', '수강료', '금액']);

// 앱 안에서 값을 DB 칸에 맞는 모양으로 바꿈
function toDbValue(col, v) {
  if (NUMERIC.has(col)) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`'${col}' 칸에는 숫자만 넣을 수 있습니다: ${v}`);
    return n;
  }
  if (v === null || v === undefined) return '';
  return String(v);
}

// DB 값을 앱이 쓰는 모양으로 (빈 칸 = '')
function fromDbValue(col, v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  return v;
}

function toDbRow(headers, obj) {
  const o = {};
  headers.forEach(h => { o[h] = toDbValue(h, obj[h]); });
  return o;
}

module.exports = { NUMERIC, toDbValue, fromDbValue, toDbRow };
