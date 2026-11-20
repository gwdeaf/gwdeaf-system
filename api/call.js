'use strict';
const { handle } = require('../lib/runtime');
const { SupabaseDb } = require('../lib/db_supabase');
const { identify } = require('../lib/google_auth');
let db;
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST 만 가능합니다.' });
  try {
    db = db || new SupabaseDb(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (body && body.fn === 'googleLogin') {   // 구글 로그인 확인 후, 서버가 만든 사용자 정보로만 로그인 처리
      let ident;
      try { ident = await identify(body.args && body.args[0]); }
      catch (e) { return res.status(200).json({ ok: false, error: e.message, code: e.userError ? 'AUTH' : 'SYSTEM' }); }
      return res.status(200).json(await handle(db, { fn: 'googleLogin', args: [ident] }));
    }
    res.status(200).json(await handle(db, body));
  } catch (e) {
    res.status(200).json({ ok: false, error: '서버 설정 문제입니다: ' + e.message, code: 'SYSTEM' });
  }
};
