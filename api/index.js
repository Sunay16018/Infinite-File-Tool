/* ═══════════════════════════════════════════════════════
   OmniVibe Studio — api/index.js
   Round-Robin Key Rotation: her istekte sıradaki key
   Rate limit'e takılmadan 5 key'i dengeli kullan
═══════════════════════════════════════════════════════ */

'use strict';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL   = 'qwen/qwen3.6-plus-preview:free';
const MAX_TOKENS      = 32000;
const RETRY_STATUSES  = [429, 401, 503];

const SITE_URL  = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';
const SITE_NAME = 'OmniVibe Studio';

/* ── Round-Robin Sayacı ──────────────────────────────
   Vercel serverless'ta global değişken aynı instance
   içinde persist eder. Her istek bir sonraki key'i alır.
   Instance yeniden başlarsa 0'dan başlar — sorun değil.
──────────────────────────────────────────────────────*/
let roundRobinIndex = 0;

/* ── API Keys ────────────────────────────────────────── */
function getApiKeys() {
  const keys = [];
  for (let i = 1; i <= 7; i++) {
    const key = process.env[`OPENROUTER_KEY_${i}`];
    if (key && key.trim()) keys.push(key.trim());
  }
  if (keys.length === 0 && process.env.OPENROUTER_API_KEY) {
    keys.push(process.env.OPENROUTER_API_KEY.trim());
  }
  return keys;
}

/* ── Round-Robin başlangıç index'ini hesapla ─────────
   Her istek bir sonraki key'den başlar.
   429 gelirse o key'i atla, sıradakine geç.
──────────────────────────────────────────────────────*/
function getStartIndex(keys) {
  const idx = roundRobinIndex % keys.length;
  roundRobinIndex = (roundRobinIndex + 1) % keys.length;
  return idx;
}

/* ── CORS ────────────────────────────────────────────── */
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function setCors(res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
}

function jsonRes(res, status, body) {
  setCors(res);
  res.status(status).setHeader('Content-Type', 'application/json').end(JSON.stringify(body));
}

/* ── Single OpenRouter call ──────────────────────────── */
async function callOpenRouter(apiKey, payload) {
  return fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  SITE_URL,
      'X-Title':       SITE_NAME,
    },
    body: JSON.stringify(payload),
  });
}

/* ── Round-Robin + Failover Rotation ────────────────────
   1. roundRobinIndex'ten başla (her istekte farklı key)
   2. 429/401/503 gelirse sıradakine geç
   3. Tüm keyler tükenirse hata fırlat
──────────────────────────────────────────────────────*/
async function callWithRotation(payload) {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error('Hicbir API anahtari bulunamadi. OPENROUTER_KEY_1...KEY_5 tanimlayin.');
  }

  const startIdx = getStartIndex(keys);
  let lastErr    = null;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIdx = (startIdx + attempt) % keys.length;
    const key    = keys[keyIdx];

    try {
      const resp = await callOpenRouter(key, payload);

      if (resp.ok) {
        console.log(`[OmniVibe] Key #${keyIdx + 1} kullanildi (round-robin)`);
        return resp;
      }

      if (RETRY_STATUSES.includes(resp.status)) {
        const errBody = await resp.text().catch(() => '');
        lastErr = new Error(`Key #${keyIdx + 1} HTTP ${resp.status}: ${errBody.slice(0, 150)}`);
        console.warn(`[OmniVibe] Key #${keyIdx + 1} basarisiz (${resp.status}), sonraki deneniyor...`);
        continue;
      }

      // Retry olmayan hata (400, 422 vb) — direkt fırlat
      const errBody = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${errBody.slice(0, 300)}`);

    } catch (err) {
      if (err.message.startsWith('HTTP ')) throw err;
      lastErr = err;
      console.warn(`[OmniVibe] Key #${keyIdx + 1} network hatasi: ${err.message}`);
    }
  }

  throw new Error(`Tum keyler basarisiz. Son hata: ${lastErr?.message}`);
}

/* ── Stream pump: Web Streams → Node ServerResponse ──── */
async function pumpStream(fetchResponse, res) {
  const reader = fetchResponse.body.getReader();

  setCors(res);
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache, no-transform');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch (err) {
    console.error('[OmniVibe] Stream pump error:', err.message);
  } finally {
    res.end();
  }
}

/* ── Request validation ──────────────────────────────── */
function validate(body) {
  if (!body || typeof body !== 'object') return 'Gecersiz istek govdesi';
  if (!Array.isArray(body.messages) || body.messages.length === 0) return '"messages" bos veya eksik';
  for (const m of body.messages) {
    if (!['user', 'assistant', 'system'].includes(m.role)) return `Gecersiz rol: "${m.role}"`;
    if (typeof m.content !== 'string') return 'Mesaj icerigi string olmali';
  }
  return null;
}

/* ── MAIN HANDLER ────────────────────────────────────── */
module.exports = async function handler(req, res) {

  if (req.method === 'OPTIONS') {
    setCors(res); res.status(204).end(); return;
  }

  if (req.method === 'GET') {
    const keys = getApiKeys();
    jsonRes(res, 200, {
      status:      'ok',
      service:     'OmniVibe Studio API',
      model:       DEFAULT_MODEL,
      keys:        keys.length,
      roundRobin:  roundRobinIndex,
      keyPreviews: keys.map((k, i) => ({ index: i + 1, prefix: k.slice(0, 10) + '...' })),
    });
    return;
  }

  if (req.method !== 'POST') {
    jsonRes(res, 405, { error: 'Method Not Allowed' }); return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { jsonRes(res, 400, { error: 'Gecersiz JSON' }); return; }
  }

  const validErr = validate(body);
  if (validErr) { jsonRes(res, 400, { error: validErr }); return; }

  const {
    messages,
    system,
    model       = DEFAULT_MODEL,
    stream      = true,
    temperature = 0.7,
    max_tokens  = MAX_TOKENS,
  } = body;

  const apiMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  const payload = {
    model,
    messages:          apiMessages,
    stream,
    temperature,
    max_tokens,
    top_p:             0.95,
    frequency_penalty: 0.05,
  };

  try {
    const upstreamResp = await callWithRotation(payload);

    if (stream) {
      await pumpStream(upstreamResp, res);
    } else {
      const data = await upstreamResp.json();
      jsonRes(res, 200, data);
    }
  } catch (err) {
    console.error('[OmniVibe] Handler error:', err.message);
    jsonRes(res, 503, {
      error: err.message,
      tip:   'OPENROUTER_KEY_1...KEY_5 ortam degiskenlerini kontrol edin.',
    });
  }
};
