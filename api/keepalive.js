'use strict';
// 일주일에 한 번 Vercel 이 자동으로 부르는 주소입니다. Supabase 가 쉬지 않도록 가볍게 읽고 쓰기를 합니다.
const { SupabaseDb } = require('../lib/db_supabase');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const db = new SupabaseDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    await db.ping();
    await db.purgeSessions();   // 만료된 로그인 기록 정리(쓰기 1회)
    res.status(200).json({ ok: true, at: new Date().toISOString() });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
};
