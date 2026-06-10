/* ═══════════════════════════════════════════════════════
   OmniVibe Studio — api/index.js
   Cerebras GPT-OSS-120B "GOD MODE" Konfigürasyonu
   Round-Robin Key Rotation + Gelişmiş Hata Yönetimi
   HTTPS Modülü ile (Vercel Serverless Uyumlu)
═══════════════════════════════════════════════════════ */

'use strict';

const https = require('https');

const CEREBRAS_BASE = 'api.cerebras.ai';
const DEFAULT_MODEL = 'gpt-oss-120b';
const MAX_TOKENS    = 8192;
const RETRY_STATUSES = [429, 401, 403, 503];

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

/* ── API Keys ──────────────────────────────────────────
   Vercel'de CEREBRAS_API_KEY_1...KEY_7 olarak tanımlanmalı
   Key'ler 'csk_' ile başlamalıdır.
──────────────────────────────────────────────────────*/
function getApiKeys() {
  const keys = [];
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`CEREBRAS_API_KEY_${i}`];
    if (key && key.trim() && key.trim().startsWith('csk_')) keys.push(key.trim());
  }
  if (keys.length === 0 && process.env.CEREBRAS_API_KEY) {
    const fallback = process.env.CEREBRAS_API_KEY.trim();
    if (fallback.startsWith('csk_')) keys.push(fallback);
  }
  // DEBUG: env var'ları logla (sadece prefix, güvenli)
  if (keys.length === 0) {
    console.log('[OmniVibe DEBUG] CEREBRAS ile ilgili env varlar:');
    Object.keys(process.env).forEach(k => {
      if (k.includes('CEREBRAS') || k.includes('API_KEY')) {
        const v = process.env[k];
        console.log(`  ${k}: ${v ? v.slice(0, 10) + '...' : 'BOS'}`);
      }
    });
  }
  return keys;
}
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

/* ── GPT-OSS-120B "HIGH MODE" Konfigürasyonu ───────────
   reasoning_effort: "high"  -> En derin düşünme modu
   temperature: 0.3          -> Dengeli yaratıcılık + tutarlılık
   top_p: 0.9                -> Nükleus sampling
   max_completion_tokens: 8192 -> Uzun yanıtlar için
   clear_thinking: true      -> Önceki düşünceleri temizle
──────────────────────────────────────────────────────*/
function buildPayload(body, apiMessages, sessionId) {
  return {
    model: body.model || DEFAULT_MODEL,
    messages: apiMessages,
    reasoning_effort: body.reasoning_effort || 'high',
    temperature: body.temperature !== undefined ? body.temperature : 0.3,
    top_p: body.top_p !== undefined ? body.top_p : 0.9,
    max_completion_tokens: body.max_tokens || MAX_TOKENS,
    clear_thinking: body.clear_thinking !== undefined ? body.clear_thinking : true,
    stream: body.stream !== undefined ? body.stream : true,
    presence_penalty: body.presence_penalty !== undefined ? body.presence_penalty : 0.1,
    frequency_penalty: body.frequency_penalty !== undefined ? body.frequency_penalty : 0.1,
    user: sessionId || 'anonymous',
    prompt_cache_key: sessionId || null
  };
}

/* ── HTTPS Request Helper (Vercel Serverless Uyumlu) ───
   fetch() yerine Node.js native https modülü kullanıyoruz.
   Vercel serverless ortamında daha güvenli çalışır.
──────────────────────────────────────────────────────*/
function cerebrasRequest(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);

    const options = {
      hostname: CEREBRAS_BASE,
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': SITE_URL,
        'X-Title': SITE_NAME,
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 120000 // 120 saniye timeout
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: async () => parsed,
            text: async () => data,
            body: { getReader: () => ({ read: async () => ({ done: true, value: null }) }) }
          });
        } catch (e) {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: async () => ({ error: { message: data } }),
            text: async () => data,
            body: { getReader: () => ({ read: async () => ({ done: true, value: null }) }) }
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Network hatası: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout (120s)'));
    });

    req.write(postData);
    req.end();
  });
}

/* ── Round-Robin + Failover Rotation ────────────────────
   1. roundRobinIndex'ten başla (her istekte farklı key)
   2. 429/401/403/503 gelirse sıradakine geç
   3. Tüm keyler tükenirse hata fırlat
──────────────────────────────────────────────────────*/
async function callWithRotation(payload, attempt = 0) {
  const keys = getApiKeys();

  if (keys.length === 0) {
    throw new Error('API KEY BULUNAMADI! Vercel Dashboard > Project Settings > Environment Variables kısmına CEREBRAS_API_KEY_1, CEREBRAS_API_KEY_2... seklinde csk_ ile baslayan keyleri ekle. Keyler Production ve Preview environmentlarina atanmali. (cloud.cerebras.ai)');
  }

  if (attempt >= keys.length * 2) {
    throw new Error('Tüm API limitleri doldu! Yeni Cerebras anahtarları eklemelisin. (cloud.cerebras.ai)');
  }

  const startIdx = getStartIndex(keys);
  let lastErr    = null;

  for (let i = 0; i < keys.length; i++) {
    const keyIdx = (startIdx + i) % keys.length;
    const key    = keys[keyIdx];

    try {
      const resp = await cerebrasRequest(key, payload);

      if (resp.ok) {
        const data = await resp.json();
        const usage = data.usage;
        const timeInfo = data.time_info;
        console.log(`✅ [OmniVibe] Key #${keyIdx + 1}/${keys.length} | Model: ${data.model} | Tokens: ${usage?.total_tokens || 'N/A'} | Süre: ${timeInfo?.total_time?.toFixed(2) || 'N/A'}s`);
        return data;
      }

      if (RETRY_STATUSES.includes(resp.status)) {
        const errBody = await resp.text();
        lastErr = new Error(`Key #${keyIdx + 1} HTTP ${resp.status}: ${errBody.slice(0, 150)}`);
        console.warn(`⚠️ [OmniVibe] Key #${keyIdx + 1} HTTP ${resp.status} hatasi, sonraki key deneniyor... Hata: ${errBody.slice(0, 100)}`);
        continue;
      }

      // 413 (Payload Too Large) -> İçeriği kırp ve tekrar dene
      if (resp.status === 413) {
        console.warn(`📏 [OmniVibe] İçerik çok büyük, kırpılıyor...`);
        payload.messages[payload.messages.length - 1].content = 
          payload.messages[payload.messages.length - 1].content.substring(0, 60000);
        return callWithRotation(payload, attempt + 1);
      }

      // Retry olmayan hata (400, 422 vb) — direkt fırlat
      const errBody = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${errBody.slice(0, 300)}`);

    } catch (err) {
      if (err.message.startsWith('HTTP ')) throw err;
      lastErr = err;
      console.warn(`⚠️ [OmniVibe] Key #${keyIdx + 1} network hatası: ${err.message}`);
    }
  }

  // Tüm keyler başarısız -> exponential backoff ile tekrar dene
  const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
  console.log(`⏳ [OmniVibe] Tüm keyler bitti, ${delay}ms bekleniyor...`);
  await new Promise(r => setTimeout(r, delay));

  return callWithRotation(payload, attempt + 1);
}

/* ── Request validation ──────────────────────────────── */
function validate(body) {
  if (!body || typeof body !== 'object') return 'Geçersiz istek gövdesi';
  if (!Array.isArray(body.messages) || body.messages.length === 0) return '"messages" boş veya eksik';
  for (const m of body.messages) {
    if (!['user', 'assistant', 'system', 'developer'].includes(m.role)) return `Geçersiz rol: "${m.role}"`;
    if (typeof m.content !== 'string') return 'Mesaj içeriği string olmalı';
  }
  return null;
}

/* ── MAIN HANDLER ────────────────────────────────────── */
module.exports = async function handler(req, res) {
  const sessionId = req.headers['x-session-id'] || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const requestStart = Date.now();

  if (req.method === 'OPTIONS') {
    setCors(res); res.status(204).end(); return;
  }

  if (req.method === 'GET') {
    const keys = getApiKeys();
    jsonRes(res, 200, {
      status:      'ok',
      service:     'OmniVibe Studio API',
      model:       DEFAULT_MODEL,
      mode:        'HIGH_REASONING',
      keys:        keys.length,
      roundRobin:  roundRobinIndex,
      keyPreviews: keys.map((k, i) => ({ index: i + 1, prefix: k.slice(0, 10) + '...' })),
      envCheck:    {
        cerebrasVarsFound: Object.keys(process.env).filter(k => k.includes('CEREBRAS')).length,
        allEnvVars: Object.keys(process.env).filter(k => k.includes('CEREBRAS') || k.includes('API_KEY')),
      },
      timestamp:   new Date().toISOString()
    });
    return;
  }

  if (req.method !== 'POST') {
    jsonRes(res, 405, { error: 'Method Not Allowed' }); return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { jsonRes(res, 400, { error: 'Geçersiz JSON' }); return; }
  }

  const validErr = validate(body);
  if (validErr) { jsonRes(res, 400, { error: validErr }); return; }

  const {
    messages,
    system,
    model       = DEFAULT_MODEL,
    stream      = true,
    temperature = 0.3,
    max_tokens  = MAX_TOKENS,
  } = body;

  // GPT-OSS-120B için "developer" rolü önerilir (system yerine)
  const apiMessages = system
    ? [{ role: 'developer', content: system }, ...messages]
    : messages;

  const payload = buildPayload(body, apiMessages, sessionId);

  try {
    const data = await callWithRotation(payload);
    const totalTime = ((Date.now() - requestStart) / 1000).toFixed(2);

    const choice = data.choices[0];
    const result = {
      id: data.id,
      object: 'chat.completion',
      created: data.created,
      model: data.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: choice.message.content,
          reasoning: choice.message.reasoning || null
        },
        finish_reason: choice.finish_reason
      }],
      usage: data.usage,
      timing: {
        ...data.time_info,
        totalRequestTime: parseFloat(totalTime)
      },
      sessionId: sessionId
    };

    jsonRes(res, 200, result);

  } catch (err) {
    const totalTime = ((Date.now() - requestStart) / 1000).toFixed(2);
    console.error('[OmniVibe] Handler error:', err.message);
    jsonRes(res, 503, {
      error: err.message,
      tip:   'Vercel Dashboard > Environment Variables kismina git. CEREBRAS_API_KEY_1, CEREBRAS_API_KEY_2... seklinde csk_ ile baslayan keyleri ekle. Keyler Production + Preview environmentlarina atanmali. Sonra YENI DEPLOY yap (sadece redeploy yetmez, yeni commit gerek).',
      debug: 'GET /api/generate endpointine istek atarak key sayisini kontrol edebilirsin.',
      sessionId: sessionId,
      elapsedTime: parseFloat(totalTime)
    });
  }
};
