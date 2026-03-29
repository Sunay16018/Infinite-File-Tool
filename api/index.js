const express = require('express');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(fileUpload());

// Kendi OpenRouter Key'ini buraya koyduğundan emin ol kanka
const getKeys = () => [
    process.env.OPENROUTER_KEY_1, process.env.OPENROUTER_KEY_2,
    process.env.OPENROUTER_KEY_3, process.env.OPENROUTER_KEY_4,
    process.env.OPENROUTER_KEY_5
].filter(k => k);

let currentKeyIndex = 0;

app.post('/api/chat', async (req, res) => {
    const { prompt, history } = req.body;
    const keys = getKeys();
    
    if (keys.length === 0) {
        return res.status(500).json({ success: false, message: "API Key bulunamadı!" });
    }

    // İŞTE GEMİNİ'Yİ HİZAYA SOKAN O EFSANE KOMUT:
    const systemInstruction = `
    SEN OMNIVIBE STUDIO'NUN BAŞ GELİŞTİRİCİSİSİN.
    GÖREVİN: Kullanıcının isteğini eksiksiz, çalışan ve profesyonel dosyalara dönüştürmektir.
    
    ÇOK ÖNEMLİ KURALLAR (BUNLARA UYMAZSAN SİSTEM ÇÖKER):
    1. Asla "Merhaba, yapıyorum, işte kodlar" gibi sohbet cümleleri kurma! SADECE KOD YAZ!
    2. Her bir dosyayı İSTİSNASIZ şu formatta vermelisin:
    
    [FILE: dosya_adi.uzanti]
    kodlar buraya gelecek...
    [END_FILE]
    
    3. Kodların etrafına asla markdown ( backtick \`\`\` ) koyma. Direkt [FILE] bloğunun içine yaz.
    4. Projeyi modüllere ayır (HTML, CSS, JS ayrı dosyalar olsun).
    5. Bitirdiğinde mesajın en sonuna sadece "PROJE_TAMAMLANDI" yaz. Başka hiçbir şey ekleme.
    `;

    try {
        const response = await axios.post("[https://openrouter.ai/api/v1/chat/completions](https://openrouter.ai/api/v1/chat/completions)", {
            model: "google/gemini-2.0-flash-lite-001",
            messages: [
                { role: "system", content: systemInstruction },
                ...history,
                { role: "user", content: prompt }
            ],
            temperature: 0.2 // Sıcaklığı düşürdük ki kafasına göre laf uydurmasın, koda odaklansın
        }, {
            headers: { 
                "Authorization": `Bearer ${keys[currentKeyIndex]}`, 
                "Content-Type": "application/json" 
            },
            timeout: 60000 // Büyük projeler için 60 saniye süre verdik
        });

        res.json({ success: true, aiResponse: response.data.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || "Bağlantı koptu." });
    }
});

module.exports = app;
