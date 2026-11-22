'use strict';
// 수강생·강사에게 보내는 링크(/a/토큰, /t/토큰 …)를 열 때 화면 파일에 미리보기 정보를 넣어 줌
//  카카오톡은 화면의 자바스크립트를 실행하지 않고 <head> 의 og 태그만 읽기 때문에, 서버에서 지회명을 넣어 줌
//  · 토큰으로 강좌 → 지회명을 찾고 (못 찾으면 기관명만), 미리보기 그림은 /api/og 가 만듦
//  · 화면 동작은 그대로 (주소창 주소도 그대로 /a/토큰)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const KINDS = require('../lib/og_kinds');
const PAGES = {};

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

async function rest(table, query) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) return [];
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 2500);
  try {
    const r = await fetch(base + '/rest/v1/' + encodeURIComponent(table) + '?' + query, { headers: { apikey: key, Authorization: 'Bearer ' + key }, signal: ctl.signal });
    return r.ok ? await r.json() : [];
  } catch (e) { return []; } finally { clearTimeout(tm); }
}

// 토큰 → 지회명 (못 찾으면 '')
async function chapterOf(k, token) {
  const K = KINDS[k];
  if (!K || !K.table || !/^[0-9A-Za-z_-]{8,80}$/.test(token || '')) return '';
  const h = sha(K.pre + token);
  const sel = k === 'g' ? '지회명' : '강좌ID';
  const rows = await rest(K.table, encodeURIComponent(K.col) + '=eq.' + h + '&select=' + encodeURIComponent(sel) + '&limit=1');
  if (!rows.length) return '';
  if (k === 'g') return rows[0]['지회명'] || '';
  const cid = rows[0]['강좌ID'];
  if (!cid) return '';
  const cs = await rest('강좌정보', encodeURIComponent('강좌ID') + '=eq.' + encodeURIComponent(cid) + '&select=' + encodeURIComponent('지회명') + '&limit=1');
  return (cs[0] && cs[0]['지회명']) || '';
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const k = KINDS[q.k] && KINDS[q.k].file ? q.k : null;
  if (!k) { res.status(404).send('Not found'); return; }
  const K = KINDS[k];
  let html = PAGES[K.file];
  if (!html) html = PAGES[K.file] = fs.readFileSync(path.join(process.cwd(), 'edu', K.file), 'utf8');
  const name = await chapterOf(k, String(q.token || ''));
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const origin = 'https://' + host;
  const unit = name ? name + ' ' : '';
  const img = origin + '/api/og?k=' + k + (name ? '&n=' + encodeURIComponent(name) : '');
  const desc = (name ? require('./og').orgLine(name) : '강원특별자치도농아인협회') + ' · 링크를 눌러 확인하세요.';
  const tags = [
    '<meta property="og:type" content="website">',
    '<meta property="og:title" content="' + esc(unit + K.title) + '">',
    '<meta property="og:description" content="' + esc(desc) + '">',
    '<meta property="og:image" content="' + esc(img) + '">',
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="icon" href="/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  ].join('\n');
  const out = html.replace(/<meta property="og:[^>]*>\s*/g, '').replace('</head>', tags + '\n</head>');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.status(200).send(out);
};
