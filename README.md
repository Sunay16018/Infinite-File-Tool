# OmniVibe Studio ⚡

> AI-powered Vibe Coding Studio — Dark Emerald/Cyan theme  
> 5 API Key rotation · Streaming · ZIP Download · Full Preview

---

## Dosya Yapısı

```
omnivibe-studio/
├── index.html        ← Ana UI (Chat + Code Panel)
├── style.css         ← OmniVibe tema stilleri
├── script.js         ← Frontend mantığı
├── api/
│   └── index.js      ← Vercel Serverless API (5-key rotation)
├── vercel.json       ← Vercel deployment config
├── package.json      ← Node.js package
└── README.md
```

---

## Vercel'e Deploy

### 1. Vercel CLI ile

```bash
npm i -g vercel
cd omnivibe-studio
vercel
```

### 2. Environment Variables (Vercel Dashboard)

Vercel > Project > Settings > Environment Variables bölümüne:

| Değişken | Değer |
|---|---|
| `OPENROUTER_KEY_1` | `sk-or-v1-...` |
| `OPENROUTER_KEY_2` | `sk-or-v1-...` |
| `OPENROUTER_KEY_3` | `sk-or-v1-...` |
| `OPENROUTER_KEY_4` | `sk-or-v1-...` |
| `OPENROUTER_KEY_5` | `sk-or-v1-...` |

En az 1 anahtar zorunlu, 5 anahtara kadar destekler.  
Bir anahtar 429/401 verirse otomatik diğerine geçer.

---

## Yerel Geliştirme

```bash
# .env dosyası oluştur
echo "OPENROUTER_KEY_1=sk-or-v1-xxxxx" > .env

# Çalıştır
node -r dotenv/config -e "require('./package.json').scripts.start" 
# veya
npm start
```

Tarayıcıda: `http://localhost:3000`

---

## Özellikler

| Özellik | Detay |
|---|---|
| 💬 Chat | Sol panel, conversation history |
| 📂 Code Flow | Sağ panel, dosya tabları + syntax highlight |
| 👁️ Full Preview | iframe'de canlı önizleme |
| 📦 ZIP Download | JSZip ile tüm dosyaları indir |
| 🔑 Key Rotation | 5 OpenRouter anahtarı arası otomatik failover |
| 📱 Mobile | 720p Android optimize, swipe desteği |
| ⚡ Streaming | SSE ile canlı kod akışı |

---

## API Endpoint

**POST** `/api/generate`

```json
{
  "messages": [
    { "role": "user", "content": "Todo list uygulaması yap" }
  ],
  "system": "...",
  "stream": true,
  "model": "google/gemini-2.0-flash-001"
}
```

**GET** `/api/health` — API durumu ve anahtar bilgisi

---

## Model Değiştirme

`api/index.js` içindeki `DEFAULT_MODEL` sabitini değiştir:

```js
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
// veya:
// 'anthropic/claude-3-5-sonnet'
// 'openai/gpt-4o'
// 'meta-llama/llama-3.1-70b-instruct'
```

---

Made with ⚡ by OmniVibe Studio
