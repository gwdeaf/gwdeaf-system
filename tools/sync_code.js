// gas/Code.gs 를 lib/gas_source.js 로 복사합니다. (Code.gs 를 고친 뒤 한 번 실행: node tools/sync_code.js)
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
fs.writeFileSync(path.join(__dirname, '..', 'lib', 'gas_source.js'),
  '// 자동 생성 파일입니다. 직접 고치지 마세요. (node tools/sync_code.js)\nmodule.exports = ' + JSON.stringify(src) + ';\n');
console.log('lib/gas_source.js 갱신 완료 (' + src.length + '자)');
