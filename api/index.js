/* ═══════════════════════════════════════════════════════
   OmniVibe Studio — api/index.js
   Vercel Serverless Function
   5 API Key Rotation: OPENROUTER_KEY_1 → OPENROUTER_KEY_5
   Auto-failover on 429 / 401 errors
═══════════════════════════════════════════════════════ */

'use strict';

/* ── Constants ──────────────────────────────────────── */
const OPENROUTER_BASE  = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL    = 'google/gemini-2.0-flash-001';
const MAX_TOKENS       = 16000;
const MAX_RETRIES      = 5;        // equals number of keys
const RETRY_STATUSES   = [429, 401, 503];

const SITE_URL  = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

const SITE_NAME = 'OmniVibe Studio';

/* ── API Keys ────────────────────────────────────────── */
function getApiKeys() {
  const keys = [];
  for (let i = 1; i <= 5; i++) {
    const key = process.env[`OPENROUTER_KEY_${i}`];
    if (key && key.trim()) keys.push(key.trim());
  }
  // Fallback: single key env var
  if (keys.length === 0 && process.env.OPENROUTER_API_KEY) {
    keys.push(process.env.OPENROUTER_API_KEY.trim());
  }
  return keys;
}

/* ── CORS Headers ───────────────────────────────────── */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/* ── Helper: send JSON response ─────────────────────── */
function jsonResponse(res, statusCode, body) {
  res.status(statusCode)
     .setHeader('Content-Type', 'application/json')
     .end(JSON.stringify(body));
}

/* ── Helper: pipe stream ─────────────────────────────── */
function streamResponse(res, upstreamResponse) {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.status(200);
  upstreamResponse.body.pipe(res);
}

/* ── Core: call OpenRouter with a specific key ────────── */
async function callOpenRouter(apiKey, payload) {
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':   'application/json',
      'Authorization':  `Bearer ${apiKey}`,
      'HTTP-Referer':   SITE_URL,
      'X-Title':        SITE_NAME,
    },
    body: JSON.stringify(payload),
  });
  return response;
}

/* ── Core: rotate through keys ───────────────────────── */
async function callWithKeyRotation(payload) {
  const keys = getApiKeys();

  if (keys.length === 0) {
    throw new Error(
      'Hiçbir OpenRouter API anahtarı bulunamadı. ' +
      'Lütfen OPENROUTER_KEY_1 ile OPENROUTER_KEY_5 arasındaki ' +
      'ortam değişkenlerini Vercel\'de ayarlayın.'
    );
  }

  let lastError   = null;
  let lastStatus  = null;
  let keyIndex    = 0;

  while (keyIndex < keys.length) {
    const key = keys[keyIndex];
    keyIndex++;

    try {
      const response = await callOpenRouter(key, payload);

      // Success — return upstream response
      if (response.ok) {
        return { response, keyIndex };
      }

      // Check if we should retry with next key
      if (RETRY_STATUSES.includes(response.status)) {
        lastStatus = response.status;
        const errBody = await response.text().catch(() => '');
        lastError = new Error(
          `Anahtar #${keyIndex} başarısız (HTTP ${response.status}): ${errBody.slice(0, 200)}`
        );
        console.warn(
          `[OmniVibe] Key #${keyIndex} failed with ${response.status}. ` +
          `${keyIndex < keys.length ? 'Trying next key...' : 'All keys exhausted.'}`
        );
        continue; // try next key
      }

      // Non-retryable error — fail immediately
      const errBody = await response.text().catch(() => '');
      throw new Error(`OpenRouter hatası (HTTP ${response.status}): ${errBody.slice(0, 300)}`);

    } catch (fetchErr) {
      // Network error — try next key
      lastError = fetchErr;
      console.warn(`[OmniVibe] Key #${keyIndex} threw: ${fetchErr.message}`);
      continue;
    }
  }

  // All keys failed
  const exhaustedMsg =
    lastStatus === 429
      ? `Tüm API anahtarlarının rate limit'i doldu (429). Lütfen birkaç dakika bekleyin.`
      : lastStatus === 401
      ? `Tüm API anahtarları geçersiz (401). Lütfen anahtarlarınızı kontrol edin.`
      : `Tüm API anahtarları başarısız oldu. Son hata: ${lastError?.message || 'Bilinmeyen hata'}`;

  throw new Error(exhaustedMsg);
}

/* ── Request validation ──────────────────────────────── */
function validateRequest(body) {
  if (!body || typeof body !== 'object') {
    return 'Geçersiz istek gövdesi';
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return '"messages" dizisi boş veya eksik';
  }
  for (const msg of body.messages) {
    if (!['user', 'assistant', 'system'].includes(msg.role)) {
      return `Geçersiz mesaj rolü: "${msg.role}"`;
    }
    if (typeof msg.content !== 'string') {
      return 'Mesaj içeriği string olmalı';
    }
  }
  return null;
}

/* ── MAIN HANDLER ────────────────────────────────────── */
module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.status(204).end();
    return;
  }

  // Set CORS on all responses
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  // Health check
  if (req.method === 'GET') {
    const keys    = getApiKeys();
    const keyInfo = keys.map((k, i) => ({
      index:    i + 1,
      prefix:   k.slice(0, 8) + '...',
      length:   k.length,
    }));
    jsonResponse(res, 200, {
      status:  'ok',
      service: 'OmniVibe Studio API',
      model:   DEFAULT_MODEL,
      keys:    keyInfo.length,
      keyDetails: keyInfo,
    });
    return;
  }

  // Only POST allowed beyond this point
  if (req.method !== 'POST') {
    jsonResponse(res, 405, { error: 'Method Not Allowed. Use POST.' });
    return;
  }

  /* ── Parse body ── */
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { jsonResponse(res, 400, { error: 'Geçersiz JSON' }); return; }
  }

  /* ── Validate ── */
  const validationError = validateRequest(body);
  if (validationError) {
    jsonResponse(res, 400, { error: validationError });
    return;
  }

  /* ── Build payload ── */
  const {
    messages,
    system,
    model    = DEFAULT_MODEL,
    stream   = true,
    temperature = 0.7,
    max_tokens  = MAX_TOKENS,
  } = body;

  // Build message array with optional system prompt
  const apiMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  const payload = {
    model,
    messages:    apiMessages,
    stream,
    temperature,
    max_tokens,
    top_p:            0.95,
    frequency_penalty: 0.05,
  };

  /* ── Call API with key rotation ── */
  try {
    const { response, keyIndex } = await callWithKeyRotation(payload);

    console.log(`[OmniVibe] Request served with key #${keyIndex}`);

    if (stream) {
      // Pipe SSE stream directly to client
      streamResponse(res, response);
    } else {
      // Buffer full response and return JSON
      const data = await response.json();
      jsonResponse(res, 200, data);
    }

  } catch (err) {
    console.error('[OmniVibe] All keys failed:', err.message);
    jsonResponse(res, 503, {
      error:   err.message,
      details: 'Tüm API anahtarları tükendi veya geçersiz.',
      tip:     'OPENROUTER_KEY_1 ... OPENROUTER_KEY_5 ortam değişkenlerini kontrol edin.',
    });
  }
};
