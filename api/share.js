/* ═══════════════════════════════════════════════════════
   OmniVibe Studio — api/share.js
   Paylaşılabilir Önizleme Sistemi
   
   POST /api/share        → HTML'i kaydeder, {id, url} döner
   GET  /api/share?id=xxx → O id'nin HTML'ini döner
   DELETE /api/share?id=x → Siler (opsiyonel)

   Storage: Vercel KV (varsa) veya in-process Map (dev/fallback)
   TTL: 24 saat (86400 saniye)
═══════════════════════════════════════════════════════ */

'use strict';

/* ── In-process store (Vercel KV yoksa fallback) ─────
   Vercel Serverless Function'lar stateless ama aynı
   instance birkaç dakika ayakta kalır. Production'da
   Vercel KV kullanın. */
const memStore = new Map(); // { id: { html, expires } }

/* ── TTL: 24 saat ────────────────────────────────────── */
const TTL_MS = 24 * 60 * 60 * 1000;

/* ── ID generator: 8 char alphanumeric ──────────────── */
function genId() {
  return Math.random().toString(36).slice(2, 6) +
         Math.random().toString(36).slice(2, 6);
}

/* ── Vercel KV helpers (optional) ───────────────────── */
async function kvSet(id, html) {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      await kv.set(`share:${id}`, html, { ex: TTL_MS / 1000 });
      return true;
    }
  } catch { /* KV unavailable */ }
  return false;
}

async function kvGet(id) {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      return await kv.get(`share:${id}`);
    }
  } catch { /* KV unavailable */ }
  return null;
}

async function kvDel(id) {
  try {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const { kv } = await import('@vercel/kv');
      await kv.del(`share:${id}`);
      return true;
    }
  } catch {}
  return false;
}

/* ── Store + retrieve with fallback ─────────────────── */
async function storeHtml(id, html) {
  const usedKv = await kvSet(id, html);
  if (!usedKv) {
    // Fallback: in-process Map
    memStore.set(id, { html, expires: Date.now() + TTL_MS });
    // Cleanup expired entries
    for (const [k, v] of memStore) {
      if (v.expires < Date.now()) memStore.delete(k);
    }
  }
}

async function fetchHtml(id) {
  // Try KV first
  const fromKv = await kvGet(id);
  if (fromKv) return fromKv;
  // Fallback: in-process Map
  const entry = memStore.get(id);
  if (!entry) return null;
  if (entry.expires < Date.now()) { memStore.delete(id); return null; }
  return entry.html;
}

async function deleteHtml(id) {
  await kvDel(id);
  memStore.delete(id);
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
  res.status(status)
     .setHeader('Content-Type', 'application/json')
     .end(JSON.stringify(body));
}

/* ── MAIN HANDLER ────────────────────────────────────── */
module.exports = async function handler(req, res) {

  /* Preflight */
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.status(204).end();
    return;
  }

  /* ── POST /api/share — save HTML ── */
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {
        jsonRes(res, 400, { error: 'Geçersiz JSON' }); return;
      }
    }

    const { html } = body || {};
    if (!html || typeof html !== 'string') {
      jsonRes(res, 400, { error: '"html" alanı zorunlu' }); return;
    }
    if (html.length > 2 * 1024 * 1024) { // 2MB limit
      jsonRes(res, 413, { error: 'HTML çok büyük (max 2MB)' }); return;
    }

    const id      = genId();
    const host    = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const proto   = req.headers['x-forwarded-proto'] || 'http';
    const shareUrl = `${proto}://${host}/p/${id}`;

    await storeHtml(id, html);

    jsonRes(res, 200, {
      id,
      url:     shareUrl,
      expires: new Date(Date.now() + TTL_MS).toISOString(),
      ttlHours: 24,
    });
    return;
  }

  /* ── GET /api/share?id=xxx — fetch HTML ── */
  if (req.method === 'GET') {
    const id = (req.query?.id || new URL(req.url, 'http://x').searchParams.get('id') || '').trim();

    if (!id) {
      jsonRes(res, 400, { error: 'id parametresi gerekli' }); return;
    }

    const html = await fetchHtml(id);
    if (!html) {
      // Return a nice "expired" page
      setCors(res);
      res.status(404)
         .setHeader('Content-Type', 'text/html; charset=utf-8')
         .end(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>OmniVibe — Önizleme Bulunamadı</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#050c09;color:#94a3b8;font-family:system-ui,sans-serif;
         display:flex;align-items:center;justify-content:center;
         min-height:100vh;text-align:center;padding:24px}
    .card{background:#0d1f14;border:1px solid rgba(16,185,129,.2);
          border-radius:16px;padding:40px 32px;max-width:400px}
    .icon{font-size:48px;margin-bottom:16px}
    h1{color:#10b981;font-size:20px;margin-bottom:8px}
    p{font-size:14px;line-height:1.6;color:#64748b}
    .badge{display:inline-block;margin-top:16px;padding:4px 12px;
           border-radius:99px;background:rgba(16,185,129,.1);
           border:1px solid rgba(16,185,129,.2);
           font-size:12px;font-family:monospace;color:#34d399}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⏰</div>
    <h1>Önizleme Süresi Doldu</h1>
    <p>Bu paylaşım linki artık geçerli değil.<br>
       Önizlemeler 24 saat sonra otomatik silinir.</p>
    <span class="badge">ID: ${id}</span>
  </div>
</body>
</html>`);
      return;
    }

    // Serve the HTML page
    setCors(res);
    res.status(200)
       .setHeader('Content-Type', 'text/html; charset=utf-8')
       .setHeader('Cache-Control', 'public, max-age=3600')
       .end(html);
    return;
  }

  /* ── DELETE /api/share?id=xxx — delete ── */
  if (req.method === 'DELETE') {
    const id = (req.query?.id || new URL(req.url, 'http://x').searchParams.get('id') || '').trim();
    if (!id) { jsonRes(res, 400, { error: 'id gerekli' }); return; }
    await deleteHtml(id);
    jsonRes(res, 200, { deleted: true, id });
    return;
  }

  jsonRes(res, 405, { error: 'Method Not Allowed' });
};
