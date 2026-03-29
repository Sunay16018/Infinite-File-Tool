/* ═══════════════════════════════════════════════════════
   OmniVibe Studio — api/share.js
   Upstash Redis REST API — düzeltilmiş SET/GET
   TTL: 24 saat
═══════════════════════════════════════════════════════ */

'use strict';

const TTL_SECONDS = 60 * 60 * 24; // 24 saat

/* ── ID generator ────────────────────────────────────── */
function genId() {
  return Math.random().toString(36).slice(2, 6) +
         Math.random().toString(36).slice(2, 6);
}

/* ── Upstash Redis REST ───────────────────────────────
   Doğru format: POST /set/key/value?EX=ttl
   Body YOK — değer URL'de path segment olarak geçer
──────────────────────────────────────────────────────*/
async function redisSet(id, html) {
  const baseUrl = process.env.KV_REST_API_URL;
  const token   = process.env.KV_REST_API_TOKEN;
  if (!baseUrl || !token) throw new Error('KV_REST_API_URL veya KV_REST_API_TOKEN eksik');

  // HTML'i base64'e çevir — özel karakter sorununu önler
  const encoded = Buffer.from(html, 'utf8').toString('base64');

  // Upstash REST: POST /set/<key>/<value>?EX=<ttl>
  const resp = await fetch(
    `${baseUrl}/set/share:${id}/${encodeURIComponent(encoded)}?EX=${TTL_SECONDS}`,
    {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`Redis SET hatası: ${resp.status} ${err}`);
  }
  return true;
}

async function redisGet(id) {
  const baseUrl = process.env.KV_REST_API_URL;
  const token   = process.env.KV_REST_API_TOKEN;
  if (!baseUrl || !token) return null;

  const resp = await fetch(`${baseUrl}/get/share:${id}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!resp.ok) return null;
  const data = await resp.json().catch(() => null);
  const raw  = data?.result;
  if (!raw) return null;

  // base64'ten geri çevir
  try {
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    return raw; // eski kayıtlar için fallback
  }
}

async function redisDel(id) {
  const baseUrl = process.env.KV_REST_API_URL;
  const token   = process.env.KV_REST_API_TOKEN;
  if (!baseUrl || !token) return;
  await fetch(`${baseUrl}/del/share:${id}`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  }).catch(() => {});
}

/* ── CORS ────────────────────────────────────────────── */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
function setCors(res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
}
function jsonRes(res, status, body) {
  setCors(res);
  res.status(status).setHeader('Content-Type', 'application/json').end(JSON.stringify(body));
}

/* ── MAIN HANDLER ────────────────────────────────────── */
module.exports = async function handler(req, res) {

  if (req.method === 'OPTIONS') { setCors(res); res.status(204).end(); return; }

  /* ── POST — HTML kaydet ── */
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { jsonRes(res, 400, { error: 'Geçersiz JSON' }); return; }
    }

    const { html } = body || {};
    if (!html || typeof html !== 'string') { jsonRes(res, 400, { error: '"html" alanı zorunlu' }); return; }
    if (html.length > 2 * 1024 * 1024)    { jsonRes(res, 413, { error: 'HTML çok büyük (max 2MB)' }); return; }

    const id    = genId();
    const host  = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const shareUrl = `${proto}://${host}/p/${id}`;

    try { await redisSet(id, html); }
    catch (err) { jsonRes(res, 500, { error: 'Redis kayıt hatası: ' + err.message }); return; }

    jsonRes(res, 200, {
      id,
      url:      shareUrl,
      expires:  new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
      ttlHours: 24,
    });
    return;
  }

  /* ── GET — HTML getir ── */
  if (req.method === 'GET') {
    const id = (req.query?.id || new URL(req.url, 'http://x').searchParams.get('id') || '').trim();
    if (!id) { jsonRes(res, 400, { error: 'id parametresi gerekli' }); return; }

    let html = null;
    try { html = await redisGet(id); } catch {}

    if (!html) {
      setCors(res);
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').end(`<!DOCTYPE html>
<html lang="tr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OmniVibe — Süre Doldu</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#050c09;color:#94a3b8;font-family:system-ui,sans-serif;
     display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}
.card{background:#0d1f14;border:1px solid rgba(16,185,129,.2);border-radius:16px;padding:40px 32px;max-width:400px}
.icon{font-size:48px;margin-bottom:16px}
h1{color:#10b981;font-size:20px;margin-bottom:8px}
p{font-size:14px;line-height:1.6;color:#64748b}
.badge{display:inline-block;margin-top:16px;padding:4px 12px;border-radius:99px;
       background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);
       font-size:12px;font-family:monospace;color:#34d399}
</style>
</head><body>
<div class="card">
  <div class="icon">⏰</div>
  <h1>Önizleme Süresi Doldu</h1>
  <p>Bu paylaşım linki artık geçerli değil.<br>Önizlemeler 24 saat sonra otomatik silinir.</p>
  <span class="badge">ID: ${id}</span>
</div>
</body></html>`);
      return;
    }

    setCors(res);
    res.status(200)
       .setHeader('Content-Type', 'text/html; charset=utf-8')
       .setHeader('Cache-Control', 'public, max-age=3600')
       .end(html);
    return;
  }

  /* ── DELETE ── */
  if (req.method === 'DELETE') {
    const id = (req.query?.id || new URL(req.url, 'http://x').searchParams.get('id') || '').trim();
    if (!id) { jsonRes(res, 400, { error: 'id gerekli' }); return; }
    await redisDel(id);
    jsonRes(res, 200, { deleted: true, id });
    return;
  }

  jsonRes(res, 405, { error: 'Method Not Allowed' });
};
