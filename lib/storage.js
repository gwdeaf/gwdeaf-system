'use strict';
// 도협회·지회가 주고받는 파일은 Supabase Storage(파일 저장소)의 비공개 폴더에 둡니다.
// 업로드·다운로드는 브라우저가 저장소와 직접 주고받고(짧게 유효한 주소), 서버는 주소 발급과 삭제만 합니다.
const BUCKET = 'hq-files';

function env() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''), key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL 과 SUPABASE_SERVICE_KEY 환경변수가 필요합니다.');
  return { url, key, anon: process.env.SUPABASE_ANON_KEY || '' };
}
const enc = p => p.split('/').map(encodeURIComponent).join('/');

const real = {
  async signUpload(path) {
    const e = env();
    if (!e.anon) throw new Error('Vercel 환경변수 SUPABASE_ANON_KEY 가 필요합니다. (README 의 "자료 요청·회신" 설정을 확인하세요)');
    const r = await fetch(`${e.url}/storage/v1/object/upload/sign/${BUCKET}/${enc(path)}`, { method: 'POST', headers: { apikey: e.key, Authorization: 'Bearer ' + e.key, 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error('업로드 주소를 만들지 못했습니다. (저장소가 만들어졌는지 확인하세요: ' + (j.message || j.error || r.status) + ')');
    return { url: e.url + '/storage/v1' + j.url, apikey: e.anon };
  },
  async signDownload(path, name) {
    const e = env();
    const r = await fetch(`${e.url}/storage/v1/object/sign/${BUCKET}/${enc(path)}`, { method: 'POST', headers: { apikey: e.key, Authorization: 'Bearer ' + e.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 120 }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.signedURL) throw new Error('파일을 찾지 못했습니다. (' + (j.message || j.error || r.status) + ')');
    return e.url + '/storage/v1' + j.signedURL + '&download=' + encodeURIComponent(name || '');
  },
  async remove(paths) {
    if (!paths.length) return;
    const e = env();
    const r = await fetch(`${e.url}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { apikey: e.key, Authorization: 'Bearer ' + e.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error('파일 저장소에서 지우지 못했습니다. (' + (j.message || j.error || r.status) + ')'); }
  }
};
let impl = real;
module.exports = { BUCKET, get: () => impl, set: x => { impl = x || real; } };
