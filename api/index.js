const express = require('express');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(fileUpload());

const keys = [process.env.OPENROUTER_KEY_1]; // Kendi keylerini ekle

app.post('/api/chat', async (req, res) => {
    const { prompt, history } = req.body;
    
    // Gemini'ye proje yapısını nasıl döndüreceğini öğreten sert komut
    const systemInstruction = `
    Sen bir Vibe Coding uzmanısın. Kullanıcıyla konuşurken aynı zamanda arka planda dosya oluşturursun.
    HER DOSYAYI ŞU FORMATTA VERMEK ZORUNDASIN:
    [FILE: dosya_adi.uzanti]
    kodlar buraya...
    [END_FILE]
    
    Kullanıcıya hangi dosyaları oluşturduğunu adım adım açıkla. Bitince 'PROJE HAZIR' de.
    `;

    try {
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "google/gemini-2.0-flash-lite-001",
            messages: [
                { role: "system", content: systemInstruction },
                ...history,
                { role: "user", content: prompt }
            ]
        }, {
            headers: { "Authorization": `Bearer ${keys[0]}` }
        });

        res.json({ success: true, aiResponse: response.data.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = app;
