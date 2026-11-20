'use strict';
// Supabase(PostgREST) 연결. 서버(Vercel 함수)에서만 쓰며, 비밀 키는 환경변수로만 받습니다.
const PAGE = 1000;

class SupabaseDb {
  constructor(url, key) {
    if (!url || !key) throw new Error('SUPABASE_URL 과 SUPABASE_SERVICE_KEY 환경변수가 필요합니다.');
    this.base = String(url).replace(/\/+$/, '') + '/rest/v1';
    this.headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  }

  async req(method, path, body, extra) {
    const res = await fetch(this.base + path, {
      method, headers: Object.assign({}, this.headers, extra || {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`DB 오류 ${res.status}: ${text.slice(0, 300)}`);
    return { res, json: text ? JSON.parse(text) : null };
  }

  // 한 표의 줄을 모두 읽기 (1000줄씩 나누어 병렬로). filter: { 열이름: 값 }
  async loadTable(name, filter) {
    const t = encodeURIComponent(name);
    let q = '?select=*&order=id.asc';
    Object.keys(filter || {}).forEach(k => {
      const v = filter[k];
      q += Array.isArray(v) ? `&${encodeURIComponent(k)}=in.(${v.map(x => '"' + String(x).replace(/["\\]/g, '') + '"').map(encodeURIComponent).join(',')})` : `&${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`;
    });
    const first = await this.req('GET', `/${t}${q}`, undefined, { 'Range-Unit': 'items', Range: `0-${PAGE - 1}`, Prefer: 'count=exact' });
    let rows = first.json || [];
    const m = /\/(\d+)$/.exec(first.res.headers.get('content-range') || '');
    const total = m ? Number(m[1]) : rows.length;
    if (total > rows.length) {
      const jobs = [];
      for (let from = PAGE; from < total; from += PAGE) {
        jobs.push(this.req('GET', `/${t}${q}`, undefined, { 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` }));
      }
      (await Promise.all(jobs)).forEach(r => { rows = rows.concat(r.json || []); });
    }
    return rows;
  }

  async applyOps(ops) {
    if (!ops.length) return;
    await this.req('POST', '/rpc/apply_ops', { ops: ops });
  }

  async tryLock(name, owner, seconds) {
    const r = await this.req('POST', '/rpc/try_lock', { p_name: name, p_owner: owner, p_seconds: seconds });
    return r.json === true;
  }
  async releaseLock(name, owner) {
    await this.req('POST', '/rpc/release_lock', { p_name: name, p_owner: owner });
  }

  async getSession(token) {
    const r = await this.req('GET', `/app_sessions?select=*&token=eq.${encodeURIComponent(token)}`);
    const s = r.json && r.json[0];
    return s ? { memberId: s.member_id, expiresAt: Date.parse(s.expires_at) } : null;
  }
  async putSession(token, memberId, expiresAt) {
    await this.req('POST', '/app_sessions', { token: token, member_id: memberId, expires_at: new Date(expiresAt).toISOString() },
      { Prefer: 'resolution=merge-duplicates' });
  }
  async touchSession(token, expiresAt) {
    await this.req('PATCH', `/app_sessions?token=eq.${encodeURIComponent(token)}`, { expires_at: new Date(expiresAt).toISOString() });
  }
  async delSession(token) {
    await this.req('DELETE', `/app_sessions?token=eq.${encodeURIComponent(token)}`);
  }
  async purgeSessions() {
    await this.req('DELETE', `/app_sessions?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`);
    await this.req('DELETE', `/app_login_fail?until_at=lt.${encodeURIComponent(new Date().toISOString())}`);
  }

  async getFail(key) {
    const r = await this.req('GET', `/app_login_fail?select=*&key=eq.${encodeURIComponent(key)}`);
    const f = r.json && r.json[0];
    return f && Date.parse(f.until_at) > Date.now() ? Number(f.n) : 0;
  }
  async setFail(key, n, seconds) {
    await this.req('POST', '/app_login_fail', { key: key, n: n, until_at: new Date(Date.now() + seconds * 1000).toISOString() },
      { Prefer: 'resolution=merge-duplicates' });
  }
  async clearFail(key) {
    await this.req('DELETE', `/app_login_fail?key=eq.${encodeURIComponent(key)}`);
  }

  async ping() {
    const r = await this.req('GET', '/%ED%9A%8C%EC%9B%90%EC%A0%95%EB%B3%B4?select=id&limit=1');
    return Array.isArray(r.json);
  }
}

module.exports = { SupabaseDb };
