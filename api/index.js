const express = require('express');
const fileUpload = require('express-fileupload');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Vercel Environment Variables'dan gelen 5 anahtar
const getKeys = () => [
    process.env.OPENROUTER_KEY_1,
    process.env.OPENROUTER_KEY_2,
    process.env.OPENROUTER_KEY_3,
    process.env.OPENROUTER_KEY_4,
    process.env.OPENROUTER_KEY_5
].filter(k => k && k.trim() !== "");

let currentKeyIndex = 0;

async function callGemini(content, task, fileName, attempt = 0) {
    const keys = getKeys();
    if (attempt >= keys.length) throw new Error("Tüm API limitleri doldu!");

    try {
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "google/gemini-2.0-flash-lite-001",
            messages: [
                { role: "system", content: "Sen evrensel bir dosya uzmanısın. Görevin dosyayı analiz edip kullanıcının isteğine göre dönüştürmek veya özetlemek." },
                { role: "user", content: `Dosya: ${fileName}\nİçerik: ${content}\nTalimat: ${task}` }
            ]
        }, {
            headers: { 
                "Authorization": `Bearer ${keys[currentKeyIndex]}`,
                "Content-Type": "application/json"
            },
            timeout: 50000 
        });
        return response.data.choices[0].message.content;
    } catch (error) {
        // Limit hatası (429) veya Yetki hatası (401) gelirse diğer keye geç
        if (error.response && (error.response.status === 429 || error.response.status === 401)) {
            currentKeyIndex = (currentKeyIndex + 1) % keys.length;
            return callGemini(content, task, fileName, attempt + 1);
        }
        throw new Error(error.response?.data?.error?.message || "Bağlantı hatası.");
    }
}

app.post('/api/upload', async (req, res) => {
    try {
        if (!req.files || !req.files.file) return res.status(400).json({ success: false, message: 'Dosya seçilmedi.' });
        
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

module.exports = app;
