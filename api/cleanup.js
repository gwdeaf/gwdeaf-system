'use strict';
// 하루에 한 번 Vercel 이 자동으로 부르는 주소입니다. 교육 종료 후 3개월이 지난 강좌의 일지 사진·서명을 지웁니다.
// (환경변수 CRON_SECRET 을 넣어 두면 Vercel 이 보내는 암호가 맞을 때만 실행됩니다.)
const { purgeMedia } = require('../lib/runtime');
const { SupabaseDb } = require('../lib/db_supabase');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== 'Bearer ' + secret) return res.status(401).json({ ok: false });
  try {
    const db = new SupabaseDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const n = await purgeMedia(db);
    res.status(200).json({ ok: true, deletedPhotos: n, at: new Date().toISOString() });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
};
