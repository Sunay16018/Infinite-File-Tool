const express = require('express');
const fileUpload = require('express-fileupload');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(fileUpload());

// --- API ANAHTARLARI (Vercel Panelinden eklenecek) ---
const getKeys = () => [
    process.env.OPENROUTER_KEY_1,
    process.env.OPENROUTER_KEY_2,
    process.env.OPENROUTER_KEY_3,
    process.env.OPENROUTER_KEY_4,
    process.env.OPENROUTER_KEY_5
].filter(key => key); // Sadece içi dolu olanları al

let currentKeyIndex = 0;

async function callGemini(content, task, fileName, attempt = 0) {
    const keys = getKeys();
    if (attempt >= keys.length) {
        throw new Error("Tüm API limitleri doldu kanka! Yeni anahtarlar eklemelisin.");
    }

    try {
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "stepfun/step-3.5-flash:free",
            messages: [
                { role: "system", content: "Sen OmniVibe Studio'nun sınırları olmayan, evrensel bir kod yazma zekasısın. Görevin, kullanıcının istediği her türlü programlama dilinde (Web, Mobil, Masaüstü, Oyun, Otomasyon) tam ve eksiksiz dosyalar üretmektir.

ÇIKTI FORMATI — HAYATİ ÖNEMDE:
Kodları sadece şu formatta ver:
[FILE: dosya_adi.uzanti]
// kodun tamamı
[END_FILE]

KURALLAR:
1. DİL SINIRLAMASI YOK: Kullanıcı ne isterse (Python, C++, Java, PHP, Rust, Skript, SQL, Node.js, C#, Go vb.) o dilde dosya oluştur.
2. MODERN YAPI: Her zaman o dilin en güncel ve performanslı standartlarını kullan.
3. TAM KOD: Kodları asla "buraya gelecek" diyerek kısaltma, her satırı baştan sona yaz.
4. GÖRSEL KALİTE: Eğer bir arayüz (UI) yapıyorsan, modern ve şık (dark mode uyumlu) tasarımlar seç.
5. MARKDOWN YASAK: Kod bloklarını tırnak ( \`\`\` ) içine alma, sadece [FILE:] formatını kullan.
6. AKILLI ANALİZ: Kullanıcının projesine göre eksik olabilecek dosyaları (örn: .env, requirements.txt, README.md) otomatik olarak ekle.
7. DEĞİŞİM: Eğer önceki bir kodu güncelliyorsan, sadece değişen veya yeni eklenen dosyaları ver.

CEVAP DİLİ:
- Açıklamalar: Her zaman Türkçe.
- Kod İçeriği: İngilizce veya proje gereksinimine göre.`;
            ]
        }, {
            headers: { 
                "Authorization": `Bearer ${keys[currentKeyIndex]}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://seninsiten.com", // OpenRouter için opsiyonel
                "X-Title": "Smart AI Tool"
            },
            timeout: 40000
        });
        return response.data.choices[0].message.content;
    } catch (error) {
        if (error.response && (error.response.status === 429 || error.response.status === 401)) {
            console.log(`Key ${currentKeyIndex + 1} bitti, sıradakine geçiliyor...`);
            currentKeyIndex = (currentKeyIndex + 1) % keys.length;
            return callGemini(content, task, fileName, attempt + 1);
        }
        throw new Error(error.response?.data?.error?.message || "AI yanıt vermedi.");
    }
}

app.post('/api/upload', async (req, res) => {
    try {
        if (!req.files || !req.files.file) return res.status(400).json({ message: 'Dosya yok!' });
        
        const file = req.files.file;
        const task = req.body.task;
        let text = "";

        if (file.mimetype === 'application/pdf') {
            const data = await pdfParse(file.data);
            text = data.text;
        } else {
            text = file.data.toString('utf8');
        }

        const result = await callGemini(text, task, file.name);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = app; // Vercel için export
