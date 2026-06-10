const express = require('express');
const fileUpload = require('express-fileupload');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(fileUpload());

// ═══════════════════════════════════════════════════════════════
//  CEREBRAS AI - GPT-OSS-120B "GOD MODE" KONFİGÜRASYONU
// ═══════════════════════════════════════════════════════════════

// --- ÇEVRE DEĞİŞKENLERİ (Vercel Panelinden Ayarlanacak) ---
// CEREBRAS_API_KEY_1, CEREBRAS_API_KEY_2, ... CEREBRAS_API_KEY_5
// Her biri cloud.cerebras.ai'den alınan ayrı API key olmalı

const getKeys = () => [
    process.env.CEREBRAS_API_KEY_1,
    process.env.CEREBRAS_API_KEY_2,
    process.env.CEREBRAS_API_KEY_3,
    process.env.CEREBRAS_API_KEY_4,
    process.env.CEREBRAS_API_KEY_5
].filter(key => key && key.startsWith('csk_')); // Cerebras keyleri 'csk_' ile başlar

let currentKeyIndex = 0;

// --- CEREBRAS API YAPILANDIRMASI ---
const CEREBRAS_BASE_URL = 'https://api.cerebras.ai/v1';
const MODEL = 'gpt-oss-120b';

// GPT-OSS-120B için "HIGH MODE" / En İyi Kalite Parametreleri
// reasoning_effort: "high"  -> En derin düşünme, en iyi akıl yürütme
// temperature: 0.3          -> Dengeli yaratıcılık + tutarlılık (kod için ideal)
// top_p: 0.9                -> Çeşitlilik kontrolü
// max_completion_tokens: 8192 -> Uzun yanıtlar için geniş limit
// clear_thinking: true      -> Önceki düşünce zincirlerini temizle (daha hızlı)
// prompt_cache_key: otomatik -> Aynı session'da cache kullan
const HIGH_MODE_CONFIG = {
    model: MODEL,
    reasoning_effort: 'high',           // 🧠 EN DERİN DÜŞÜNME MODU
    temperature: 0.3,                    // Dengeli, odaklı
    top_p: 0.9,                          // Nükleus sampling
    max_completion_tokens: 8192,         // Uzun yanıtlar için
    clear_thinking: true,                // Önceki düşünceleri temizle
    stream: false,                       // Tam yanıt bekle (streaming yok)
    presence_penalty: 0.1,               // Tekrarları azalt
    frequency_penalty: 0.1               // Kelime tekrarını önle
};

// --- GELİŞMİŞ HATA YÖNETİMİ & KEY ROTASYONU ---
async function callCerebras(content, task, fileName, sessionId, attempt = 0) {
    const keys = getKeys();

    if (keys.length === 0) {
        throw new Error("❌ Hiç Cerebras API anahtarı bulunamadı! Vercel Environment Variables'e CEREBRAS_API_KEY_1 ekleyin.");
    }

    if (attempt >= keys.length * 2) { // Her key için 2 deneme hakkı
        throw new Error("🚫 Tüm API limitleri doldu kanka! Yeni Cerebras anahtarları eklemelisin. (cloud.cerebras.ai)");
    }

    const currentKey = keys[currentKeyIndex];

    // GPT-OSS-120B için "developer" rolü kullanılması önerilir (system yerine)
    // Ama system de kabul edilir, developer daha modern
    const messages = [
        { 
            role: "developer", 
            content: `Sen evrensel bir dosya uzmanısın. Kullanıcının gönderdiği dosyayı derinlemesine analiz et ve talimatına göre işlemi yap.

Kurallar:
- Kod çevirme: En iyi pratikleri kullan, açıklamalı yorumlar ekle
- PDF özetleme: Başlıklar, alt başlıklar ve bullet points kullan
- Veri ayıklama: JSON/Tablo formatında düzenli çıktı ver
- Her zaman Türkçe yanıt ver` 
        },
        { 
            role: "user", 
            content: `📁 Dosya Adı: ${fileName}
🎯 Talimat: ${task}

📄 İçerik:
${content.substring(0, 120000)}` // 120K token sınırı güvenliği
        }
    ];

    try {
        const response = await axios.post(
            `${CEREBRAS_BASE_URL}/chat/completions`,
            {
                ...HIGH_MODE_CONFIG,
                messages: messages,
                user: sessionId || 'anonymous', // Abuse monitoring için
                prompt_cache_key: sessionId || null // Aynı session'da cache
            },
            {
                headers: { 
                    "Authorization": `Bearer ${currentKey}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                timeout: 120000, // Cerebras çok hızlı ama reasoning high modda 2 dk limit
                maxBodyLength: 50 * 1024 * 1024, // 50MB body limit
                maxContentLength: 50 * 1024 * 1024
            }
        );

        // Başarılı yanıt logu
        const usage = response.data.usage;
        const timeInfo = response.data.time_info;
        console.log(`✅ [Cerebras] Key ${currentKeyIndex + 1}/${keys.length} | Model: ${response.data.model} | Tokens: ${usage?.total_tokens || 'N/A'} | Süre: ${timeInfo?.total_time?.toFixed(2) || 'N/A'}s`);

        // Eğer reasoning varsa, onu da döndür (debug için)
        const choice = response.data.choices[0];
        const result = {
            content: choice.message.content,
            reasoning: choice.message.reasoning || null, // Chain-of-thought
            finishReason: choice.finish_reason,
            usage: usage,
            timing: timeInfo,
            model: response.data.model
        };

        return result;

    } catch (error) {
        const status = error.response?.status;
        const errorData = error.response?.data;

        console.error(`❌ [Cerebras Hata] Key ${currentKeyIndex + 1} | Status: ${status} | Mesaj: ${errorData?.error?.message || error.message}`);

        // 429 (Rate Limit) veya 401 (Unauthorized) -> Key değiştir
        if (status === 429 || status === 401 || status === 403) {
            console.log(`🔄 Key ${currentKeyIndex + 1} limit aşıldı/bitti, sıradakine geçiliyor...`);
            currentKeyIndex = (currentKeyIndex + 1) % keys.length;

            // Kısa bekleme (rate limit için exponential backoff)
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            await new Promise(r => setTimeout(r, delay));

            return callCerebras(content, task, fileName, sessionId, attempt + 1);
        }

        // 413 (Payload Too Large) -> İçeriği kırp ve tekrar dene
        if (status === 413) {
            const trimmedContent = content.substring(0, 60000);
            console.log(`📏 İçerik çok büyük, kırpılıyor (60K karakter)...`);
            return callCerebras(trimmedContent, task, fileName, sessionId, attempt);
        }

        // Diğer hatalar
        throw new Error(
            errorData?.error?.message || 
            errorData?.message || 
            `Cerebras API hatası (Status: ${status || 'Unknown'})`
        );
    }
}

// ═══════════════════════════════════════════════════════════════
//  ANA UPLOAD ENDPOINT
// ═══════════════════════════════════════════════════════════════

app.post('/api/upload', async (req, res) => {
    const requestStart = Date.now();
    const sessionId = req.headers['x-session-id'] || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
        // --- VALIDASYON ---
        if (!req.files || !req.files.file) {
            return res.status(400).json({ 
                success: false, 
                message: '❌ Dosya yüklenmedi! Lütfen bir dosya seçin.' 
            });
        }

        if (!req.body.task || req.body.task.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: '❌ Görev (task) belirtilmedi! Ne yapılacağını yazın.' 
            });
        }

        const file = req.files.file;
        const task = req.body.task.trim();

        // --- DOSYA BOYUT KONTROLÜ (50MB) ---
        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
        if (file.size > MAX_FILE_SIZE) {
            return res.status(413).json({
                success: false,
                message: `❌ Dosya çok büyük! Maksimum 50MB olmalı. (Gönderilen: ${(file.size / 1024 / 1024).toFixed(2)}MB)`
            });
        }

        // --- DOSYA TİPİNE GÖRE İÇERİK ÇIKARMA ---
        let text = "";
        let fileType = "unknown";

        if (file.mimetype === 'application/pdf') {
            try {
                const data = await pdfParse(file.data);
                text = data.text;
                fileType = "pdf";
            } catch (pdfErr) {
                return res.status(422).json({
                    success: false,
                    message: `❌ PDF okunamadı: ${pdfErr.message}`
                });
            }
        } else if (
            file.mimetype.startsWith('text/') ||
            file.mimetype === 'application/json' ||
            file.mimetype === 'application/javascript' ||
            file.name.match(/\.(js|ts|jsx|tsx|py|java|c|cpp|h|php|go|rs|html|css|json|xml|yaml|yml|md|sql|sh|bat)$/i)
        ) {
            text = file.data.toString('utf8');
            fileType = "text/code";
        } else {
            // Binary dosyalar için base64 veya metin dönüşümü dene
            try {
                text = file.data.toString('utf8');
                fileType = "text";
            } catch {
                return res.status(415).json({
                    success: false,
                    message: `❌ Desteklenmeyen dosya formatı: ${file.mimetype}. PDF, TXT, kod dosyaları yükleyin.`
                });
            }
        }

        // --- BOŞ İÇERİK KONTROLÜ ---
        if (!text || text.trim().length === 0) {
            return res.status(422).json({
                success: false,
                message: '❌ Dosya içeriği boş veya okunamadı!'
            });
        }

        // --- CEREBRAS AI ÇAĞRISI ---
        const aiResult = await callCerebras(text, task, file.name, sessionId);

        const totalTime = ((Date.now() - requestStart) / 1000).toFixed(2);

        // --- BAŞARILI YANIT ---
        res.json({ 
            success: true,
            result: aiResult.content,
            meta: {
                model: aiResult.model,
                reasoning: aiResult.reasoning, // Chain-of-thought (varsa)
                finishReason: aiResult.finishReason,
                usage: aiResult.usage,
                timing: {
                    ...aiResult.timing,
                    totalRequestTime: parseFloat(totalTime)
                },
                fileInfo: {
                    name: file.name,
                    type: fileType,
                    size: file.size,
                    mimetype: file.mimetype
                },
                sessionId: sessionId
            }
        });

    } catch (err) {
        const totalTime = ((Date.now() - requestStart) / 1000).toFixed(2);
        console.error(`💥 [Upload Endpoint Hatası] ${err.message} | Süre: ${totalTime}s`);

        res.status(500).json({ 
            success: false, 
            message: err.message || "Bilinmeyen bir sunucu hatası oluştu.",
            sessionId: sessionId,
            elapsedTime: parseFloat(totalTime)
        });
    }
});

// ═══════════════════════════════════════════════════════════════
//  SAĞLIK KONTROLÜ (HEALTH CHECK)
// ═══════════════════════════════════════════════════════════════
app.get('/api/health', (req, res) => {
    const keys = getKeys();
    res.json({
        status: 'ok',
        service: 'Cerebras GPT-OSS-120B AI Tool',
        version: '2.0.0-godmode',
        availableKeys: keys.length,
        model: MODEL,
        mode: 'HIGH_REASONING',
        timestamp: new Date().toISOString()
    });
});

// ═══════════════════════════════════════════════════════════════
//  Vercel Export
// ═══════════════════════════════════════════════════════════════
module.exports = app;
