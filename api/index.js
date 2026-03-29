const express = require('express');
const fileUpload = require('express-fileupload');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(fileUpload());

const getKeys = () => [
    process.env.OPENROUTER_KEY_1, process.env.OPENROUTER_KEY_2,
    process.env.OPENROUTER_KEY_3, process.env.OPENROUTER_KEY_4,
    process.env.OPENROUTER_KEY_5
].filter(k => k);

let currentKeyIndex = 0;

async function callGemini(fileData, task, fileName, mimeType, attempt = 0) {
    const keys = getKeys();
    if (attempt >= keys.length) throw new Error("Limitler doldu!");

    let messageContent = [];
    const systemPrompt = "Sen bir dosya işleme asistanısın. Kullanıcıya asla nasıl yapacağını anlatma, rehberlik etme. Sadece istenen çıktıyı üret. Eğer HTML/Görsel istenirse doğrudan <img> ve HTML etiketlerini kullan.";

    if (fileData) {
        if (mimeType && mimeType.startsWith('image/')) {
            messageContent = [
                { type: "text", text: `${systemPrompt}\nTalimat: ${task}` },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileData}` } }
            ];
        } else {
            messageContent = `${systemPrompt}\nDosya: ${fileName}\nİçerik: ${fileData}\nTalimat: ${task}`;
        }
    } else {
        messageContent = `${systemPrompt}\nTalimat: ${task}`;
    }

    try {
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "google/gemini-2.0-flash-lite-001",
            messages: [{ role: "user", content: messageContent }]
        }, {
            headers: { "Authorization": `Bearer ${keys[currentKeyIndex]}`, "Content-Type": "application/json" },
            timeout: 60000
        });
        return response.data.choices[0].message.content;
    } catch (error) {
        if (error.response && (error.response.status === 429 || error.response.status === 401)) {
            currentKeyIndex = (currentKeyIndex + 1) % keys.length;
            return callGemini(fileData, task, fileName, mimeType, attempt + 1);
        }
        throw new Error("AI Hatası: " + (error.response?.data?.error?.message || "Bağlantı koptu."));
    }
}

app.post('/api/upload', async (req, res) => {
    try {
        const { task } = req.body;
        let content = null, fileName = null, mimeType = null;

        if (req.files && req.files.file) {
            const file = req.files.file;
            fileName = file.name;
            mimeType = file.mimetype;
            if (file.mimetype === 'application/pdf') {
                const data = await pdfParse(file.data);
                content = data.text;
            } else if (file.mimetype.startsWith('image/')) {
                content = file.data.toString('base64');
            } else {
                content = file.data.toString('utf8');
            }
        }
        const result = await callGemini(content, task, fileName, mimeType);
        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = app;
