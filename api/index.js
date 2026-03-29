const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
    try {
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "google/gemini-2.0-flash-lite-001",
            messages: [
                { role: "system", content: "Sen sadece kod üreten bir makinesin. Yanıtlarını [FILE: isim] ... [END_FILE] formatında ver." },
                { role: "user", content: req.body.prompt }
            ]
        }, {
            headers: { "Authorization": `Bearer ${process.env.OPENROUTER_KEY_1}` },
            timeout: 25000 // 25 saniye bekleme süresi
        });

        res.json({ success: true, aiResponse: response.data.choices[0].message.content });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

module.exports = app;
