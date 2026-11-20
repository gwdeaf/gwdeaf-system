'use strict';
// 시험용 가짜 DB (Supabase 와 같은 방식으로 동작). 실제 서비스에서는 쓰지 않습니다.
const { NUMERIC } = require('./schema');

class MemoryDb {
  constructor(sheets) {
    this.defs = {};   // 표 이름 → 열 이름들
    Object.keys(sheets).forEach(k => { this.defs[sheets[k].name] = sheets[k].headers; });
    this.t = {}; this.seq = {};
    Object.keys(this.defs).forEach(n => { this.t[n] = []; this.seq[n] = 0; });
    this.sessions = {}; this.fails = {}; this.locks = {};
    this.calls = [];   // 시험용: 어떤 표를 읽었는지 기록
  }
  coerce(col, v) {
    if (v === undefined) v = null;
    if (NUMERIC.has(col)) {
      if (v === null || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error('invalid input syntax for type numeric: ' + v);
      return n;
    }
    return v === null ? null : String(v);
  }
  insert(tbl, v) {
    const row = { id: ++this.seq[tbl] };
    this.defs[tbl].forEach(h => { row[h] = this.coerce(h, v[h]); });
    this.t[tbl].push(row);
  }
  async loadTable(name, filter) {
    if (!this.t[name]) throw new Error('relation does not exist: ' + name);
    this.calls.push({ name, filter });
    let rows = this.t[name];
    Object.keys(filter || {}).forEach(k => { rows = rows.filter(r => Array.isArray(filter[k]) ? filter[k].map(String).includes(String(r[k])) : String(r[k]) === String(filter[k])); });
    return JSON.parse(JSON.stringify(rows));
  }
  async applyOps(ops) {
    const snap = JSON.stringify([this.t, this.seq]);
    try {
      ops.forEach(o => {
        if (!this.t[o.t]) throw new Error('invalid table: ' + o.t);
        if (o.k === 'truncate') { this.t[o.t] = []; this.seq[o.t] = 0; }
        else if (o.k === 'insert') o.v.forEach(v => this.insert(o.t, v));
        else if (o.k === 'update') {
          const r = this.t[o.t].find(x => x.id === Number(o.id));
          if (r) (o.c || this.defs[o.t]).forEach(h => { r[h] = this.coerce(h, o.v[h]); });
        } else if (o.k === 'delete') {
          const ids = new Set(o.ids.map(Number));
          this.t[o.t] = this.t[o.t].filter(r => !ids.has(r.id));
        } else throw new Error('invalid op: ' + o.k);
      });
    } catch (e) {
      const [t, s] = JSON.parse(snap); this.t = t; this.seq = s;   // 하나라도 실패하면 모두 취소
      throw e;
    }
  }
  async tryLock(name, owner, secs) {
    const l = this.locks[name];
    if (l && l.until > Date.now()) return false;
    this.locks[name] = { owner, until: Date.now() + secs * 1000 };
    return true;
  }
  async releaseLock(name, owner) { if (this.locks[name] && this.locks[name].owner === owner) delete this.locks[name]; }
  async getSession(token) { const s = this.sessions[token]; return s ? { memberId: s.memberId, expiresAt: s.expiresAt } : null; }
  async putSession(token, memberId, expiresAt) { this.sessions[token] = { memberId, expiresAt }; }
  async touchSession(token, expiresAt) { if (this.sessions[token]) this.sessions[token].expiresAt = expiresAt; }
  async delSession(token) { delete this.sessions[token]; }
  async purgeSessions() {
    Object.keys(this.sessions).forEach(k => { if (this.sessions[k].expiresAt < Date.now()) delete this.sessions[k]; });
  }
  async getFail(key) { const f = this.fails[key]; return f && f.until > Date.now() ? f.n : 0; }
  async setFail(key, n, secs) { this.fails[key] = { n, until: Date.now() + secs * 1000 }; }
  async clearFail(key) { delete this.fails[key]; }
  async ping() { return true; }
}

module.exports = { MemoryDb };
