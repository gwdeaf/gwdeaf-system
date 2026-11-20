'use strict';
const { SupabaseDb } = require('../lib/db_supabase');
const crypt = require('../lib/crypt');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const db = new SupabaseDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    await db.ping();
    let enc = '암호화 키 정상';
    try { crypt.getKey(); } catch (e) { enc = e.message; }
    // 자료 요청·회신(파일 저장소) 준비 상태
    let files = '파일 저장소 정상';
    if (!process.env.SUPABASE_ANON_KEY) files = '환경변수 SUPABASE_ANON_KEY 가 없습니다 (자료 요청·회신의 파일 올리기에 필요)';
    else {
      try {
        const r = await fetch(String(process.env.SUPABASE_URL).replace(/\/+$/, '') + '/storage/v1/bucket/hq-files', { headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY } });
        if (!r.ok) files = '파일 저장소(hq-files)가 없습니다. supabase/schema.sql 을 다시 실행해 주세요';
      } catch (e) { files = '파일 저장소를 확인하지 못했습니다: ' + e.message; }
    }
    res.status(200).json({ ok: enc === '암호화 키 정상', db: '연결 정상', encryption: enc, files: files, import_key: !!process.env.IMPORT_KEY });
  } catch (e) { res.status(200).json({ ok: false, error: e.message }); }
};
