'use strict';
// 링크 미리보기 이미지 (1200×630 PNG): /api/og?k=a&n=춘천시지회
//  큰 글씨 두 줄 + 아래 기관명 (지회는 '강원특별자치도농아인협회○○지회' 띄어쓰기 없이, 센터 등은 그 이름 그대로)
const fs = require('fs');
const path = require('path');
const KINDS = require('../lib/og_kinds');
let FONT = null, EMB = null;

function orgLine(n) {
  n = String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
  if (!n || n === '도협회' || /농아인협회$/.test(n)) return '강원특별자치도농아인협회';
  if (/지회$/.test(n)) return '강원특별자치도농아인협회' + n;   // 띄어쓰기 없이: 강원특별자치도농아인협회춘천시지회
  return n;   // 센터·문화원 등은 그 이름 그대로
}

// 아무 글자나 넣어 가짜 기관명 그림을 만들지 못하게: 수어교육 강좌에 실제로 있는 지회명만 씀
async function realName(n) {
  n = String(n || '').trim().slice(0, 40);
  if (!n) return '';
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''), key = process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) return '';
  try {
    const r = await fetch(base + '/rest/v1/' + encodeURIComponent('강좌정보') + '?' + encodeURIComponent('지회명') + '=eq.' + encodeURIComponent(n) + '&select=' + encodeURIComponent('지회명') + '&limit=1',
      { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    const rows = r.ok ? await r.json() : [];
    return rows.length ? n : '';
  } catch (e) { return ''; }
}

module.exports = async (req, res) => {
  try {
    const q = Object.assign({}, req.query || {});
    q.n = await realName(q.n);
    const k = KINDS[q.k] ? q.k : 'home';
    const K = KINDS[k];
    const { ImageResponse } = await import('@vercel/og');
    if (!FONT) FONT = fs.readFileSync(path.join(process.cwd(), 'og', 'NotoSansKR-Bold-sub.otf'));
    if (!EMB) EMB = 'data:image/png;base64,' + fs.readFileSync(path.join(process.cwd(), 'og', 'emblem.png')).toString('base64');
    const h = (type, style, children) => ({ type, props: { style, children } });
    const lines = [K.t1, K.t2].filter(Boolean);
    const big = lines.length === 2 ? 150 : 170;
    const img = new ImageResponse(
      h('div', { width: '100%', height: '100%', display: 'flex', background: '#ffffff', padding: '60px', borderTop: '14px solid #4a5bd4' },
        h('div', { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f3f5fc', borderRadius: '36px' },
          lines.map((t, i) => h('div', { fontSize: big, color: i === 0 ? '#1f2937' : '#4a5bd4', lineHeight: 1.15 }, t))
            .concat([h('div', { display: 'flex', alignItems: 'center', marginTop: 40 }, [
              { type: 'img', props: { src: EMB, width: 84, height: 84, style: { marginRight: 16, borderRadius: 42, background: '#fff' } } },
              h('div', { fontSize: 38, color: '#6b7280' }, orgLine(q.n))])]))),
      { width: 1200, height: 630, fonts: [{ name: 'K', data: FONT, weight: 700 }] });
    const buf = Buffer.from(await img.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    res.status(200).send(buf);
  } catch (e) {
    // 그림을 못 만들면 미리 만들어 둔 기본 그림으로
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(302, { Location: '/og/og-' + ((req.query && KINDS[req.query.k] && req.query.k) || 'home') + '.png' });
    res.end();
  }
};
module.exports.orgLine = orgLine;
