'use strict';
// 구글 시트에서 내보낸 JSON 을 Supabase 로 옮기는 1회용 주소. IMPORT_KEY 가 맞아야만 동작합니다.
const { importTables, recalcAll } = require('../lib/runtime');
const { SupabaseDb } = require('../lib/db_supabase');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST 만 가능합니다.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!process.env.IMPORT_KEY || body.key !== process.env.IMPORT_KEY) return res.status(200).json({ ok: false, error: '가져오기 키가 맞지 않습니다.' });
    const db = new SupabaseDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const report = await importTables(db, body.tables || {}, { clear: !!body.clear });
    res.status(200).json({ ok: true, report: report });
  } catch (e) { res.status(200).json({ ok: false, error: e.message }); }
};
