const express = require('express');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(fileUpload());

// OpenRouter veya kendi Gemini API anahtarlarını buraya ekle
const API_KEYS = [process.env.OPENROUTER_KEY]; 

app.post('/api/chat', async (req, res) => {
    const { prompt, history } = req.body;

    // Gemini'ye nasıl davranması gerektiğini dikte eden sert talimat
    const systemInstruction = `
    Sen bir 'Vibe Coding' uzmanısın. Kullanıcının isteklerine göre profesyonel dosya yapıları oluşturursun.
    
    STRİKT KURALLAR:
    1. Mesajlarına asla 'Merhaba', 'Tabii ki yaparım', 'İşte dosyalar' gibi girişlerle başlama.
    2. Her dosyayı MUTLAKA şu formatta başlat ve bitir:
       [FILE: dosya_adi.uzanti]
       (buraya kodun tamamı gelecek, markdown/backtick kullanma)
       [END_FILE]
    3. index.html dosyasını her zaman en başta veya en sonda mutlaka oluştur veya güncelle.
    4. Eğer bir hata düzeltmesi istenirse, sadece değişen dosyaları gönder.
    5. Proje tamamen bittiğinde mesajın en sonuna 'PROJE HAZIR' ibaresini ekle.
    6. 1M token sınırın var, projeyi ne kadar detaylandırırsan o kadar iyi.
    `;

    try {
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "google/gemini-2.0-flash-lite-001", // Yüksek hızlı ve 1M token destekli model
            messages: [
                { role: "system", content: systemInstruction },
                ...history,
                { role: "user", content: prompt }
            ],
            temperature: 0.3, // Daha tutarlı kod yazımı için düşük ısı
        }, {
            headers: { 
                "Authorization": `Bearer ${API_KEYS[0]}`,
                "HTTP-Referer": "https://omnivibe-studio.vercel.app", // Kendi site adresin
                "X-Title": "OmniVibe Studio"
            }
        });

        if (response.data.choices && response.data.choices[0]) {
            res.json({ 
                success: true, 
                aiResponse: response.data.choices[0].message.content 
            });
        } else {
            throw new Error("AI yanıt veremedi.");
        }

    } catch (err) {
        console.error("Sistem Hatası:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "Sunucu hatası: " + err.message 
        });
    }
});

// Vercel için export
module.exports = app;
