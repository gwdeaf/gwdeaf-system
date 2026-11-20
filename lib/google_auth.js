'use strict';
// 통합 시스템 구글 로그인 확인: 화면이 보낸 로그인 정보(JWT)를 Supabase 에 물어 확인하고,
// 직원 등록 표(staff_access)에서 지회·권한을 찾아 교육관리 사용자 정보로 바꿉니다.
const ALLOWED = () => String(process.env.ALLOWED_EMAIL_DOMAINS || 'gwdeaf.or.kr').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

async function rest(base, key, path) {
  const r = await fetch(base + '/rest/v1' + path, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  const t = await r.text();
  if (!r.ok) throw new Error('직원 정보를 읽지 못했습니다. (' + r.status + ')');
  return t ? JSON.parse(t) : [];
}

async function identify(jwt, env) {
  env = env || process.env;
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, ''), key = env.SUPABASE_SERVICE_KEY;
  const fail = (msg) => { const e = new Error(msg); e.userError = true; return e; };
  if (!jwt || typeof jwt !== 'string') throw fail('로그인이 필요합니다.');
  const r = await fetch(base + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + jwt } });
  if (!r.ok) throw fail('로그인이 만료되었습니다. 홈에서 다시 로그인해 주세요.');
  const u = await r.json();
  const g = (u.identities || []).filter(i => i.provider === 'google')[0];
  const em = g && g.identity_data && g.identity_data.email;
  if (!em || g.identity_data.email_verified === false) throw fail('구글 계정으로 로그인해야 합니다.');
  const email = String(em).toLowerCase();
  const dom = ALLOWED();
  if (dom.length && dom.indexOf(email.split('@')[1]) < 0) throw fail('허용되지 않은 이메일 도메인입니다.');
  const rows = await rest(base, key, '/staff_access?select=id,email,name,chapter_id,role,active&active=eq.true&email=ilike.' + encodeURIComponent(email) + '&limit=1');
  const s = rows[0];
  if (!s) throw fail('통합 시스템에 등록되지 않은 계정입니다. 지회 담당자에게 문의하세요.');
  const ch = (await rest(base, key, '/chapters?select=name,is_hq&id=eq.' + s.chapter_id))[0];
  if (!ch) throw fail('소속 지회를 찾을 수 없습니다.');
  let allowed = s.role === 'admin' || s.role === 'lead';
  if (!allowed) {
    const gr = await rest(base, key, '/staff_grants?select=perm&staff_id=eq.' + s.id + '&system=eq.edu&limit=1');
    allowed = gr.length > 0;
  }
  if (!allowed) throw fail('교육관리 사용 권한이 없습니다. 지회 담당자에게 권한을 요청하세요.');
  const hq = s.role === 'admin' || !!ch.is_hq;
  let profile = null;   // 통합 시스템 '기관 정보'의 전화번호 (없으면 교육관리에 있던 값을 그대로 둠)
  try { const pr = (await rest(base, key, '/org_profile?select=phone,center_phone,direct_phone&chapter_id=eq.' + s.chapter_id))[0]; if (pr) profile = { phone: pr.phone || '', center: pr.center_phone || '', direct: pr.direct_phone || '' }; } catch (e) { profile = null; }
  return { email, name: s.name || '', role: hq ? '도협회' : '지회', chapter: hq ? '도협회' : ch.name, profile };
}
module.exports = { identify };
