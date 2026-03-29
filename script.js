/* ═══════════════════════════════════════════════════════
   OmniVibe Studio — script.js
   Frontend: Chat, Code Flow, Preview, ZIP Download
═══════════════════════════════════════════════════════ */

'use strict';

/* ────────────────────────────────────────────────────
   STATE
──────────────────────────────────────────────────────*/
const State = {
  messages:       [],          // conversation history [{role, content}]
  files:          {},          // { filename: code_string }
  activeFile:     null,        // currently viewed filename
  isLoading:      false,
  currentTab:     'chat',      // 'chat' | 'code'  (mobile)
  streamBuffer:   '',          // live streaming text
  tokenCount:     0,
  shareUrl:       null,        // last generated share URL
  shareId:        null,        // last share ID
};

/* ────────────────────────────────────────────────────
   DOM REFS
──────────────────────────────────────────────────────*/
const $ = id => document.getElementById(id);

const DOM = {
  chatMessages:   () => $('chat-messages') || { appendChild: () => {}, scrollTo: () => {} },
  chatInput:      () => $('chat-input') || { value: '', style: {} },
  sendBtn:        () => $('send-btn') || { classList: { add:()=>{}, remove:()=>{} }, disabled: false },
  sendIcon:       () => $('send-icon') || { classList: { add:()=>{}, remove:()=>{} } },
  loadingIcon:    () => $('loading-icon') || { classList: { add:()=>{}, remove:()=>{} } },
  fileTabs:       () => $('file-tabs') || { innerHTML: '', appendChild: () => {} },
  codeContent:    () => $('code-content') || { classList: { add:()=>{}, remove:()=>{} } },
  codeHighlight:  () => $('code-highlight') || { removeAttribute: () => {}, textContent: '' },
  codeEmptyState: () => $('code-empty-state') || { classList: { add:()=>{}, remove:()=>{} } },
  codeFooter:     () => $('code-footer') || { style: {}, classList: { add:()=>{}, remove:()=>{} } },
  activeFileName: () => $('active-file-name') || { textContent: '' },
  lineCount:      () => $('line-count') || { textContent: '' },
  streamCursor:   () => $('stream-cursor') || {},
  noFilesHint:    () => $('no-files-hint') || { classList: { add:()=>{}, remove:()=>{} } },
  fileCountBadge: () => $('file-count-badge') || { classList: { add:()=>{}, remove:()=>{} }, textContent: '' },
  previewModal:   () => $('preview-modal') || { classList: { add:()=>{}, remove:()=>{} } },
  previewIframe:  () => $('preview-iframe') || { srcdoc: '' },
  tokenCounter:   () => $('token-counter') || { textContent: '' },
  contextBar:     () => $('context-bar') || { classList: { add:()=>{}, remove:()=>{} }, style: {} },
  contextLabel:   () => $('context-label') || { textContent: '' },
  tabChat:        () => $('tab-chat') || { classList: { add:()=>{}, remove:()=>{} } },
  tabCode:        () => $('tab-code') || { classList: { add:()=>{}, remove:()=>{} } },
};

/* ────────────────────────────────────────────────────
   SYSTEM PROMPT
──────────────────────────────────────────────────────*/
const SYSTEM_PROMPT = `Sen OmniVibe Studio'nun sınırları olmayan, evrensel bir kod yazma zekasısın. Görevin, kullanıcının istediği her türlü programlama dilinde (Web, Mobil, Masaüstü, Oyun, Otomasyon) tam ve eksiksiz dosyalar üretmektir.

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
/* ────────────────────────────────────────────────────
   API CALL — with streaming support
──────────────────────────────────────────────────────*/
async function callAPI(onChunk) {
  const response = await fetch('/api/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages:      State.messages,
      system:        SYSTEM_PROMPT,
      stream:        true,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Sunucu hatası' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  // Handle streaming response
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let   full    = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta  = parsed.choices?.[0]?.delta?.content || '';
        if (delta) {
          full += delta;
          // AI'nın gönderdiği ``` tırnaklarını ve dil isimlerini (html, js vb.) anlık temizle:
          const cleanFull = full.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
          onChunk(delta, cleanFull);
        }
      } catch {
        // non-JSON line, skip
      }
    }
  }

  return full;
}

/* ────────────────────────────────────────────────────
   FILE PARSING  [FILE: name] ... [END_FILE]
──────────────────────────────────────────────────────*/
function parseFiles(text) {
  const fileRegex = /\[FILE:\s*([^\]]+)\]\s*([\s\S]*?)\[END_FILE\]/g;
  const found     = {};
  let   match;

  while ((match = fileRegex.exec(text)) !== null) {
    const filename = match[1].trim();
    // AI'nın eklediği o gereksiz ```html ve ``` işaretlerini burada temizliyoruz:
    const rawContent = match[2].trim();
    const cleanContent = rawContent.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    
    found[filename] = cleanContent;
  }
  return found;
}

function stripFileBlocks(text) {
  return text
    // 1. Önce AI'nın eklediği ```html ve ``` işaretlerini siler
    .replace(/```[a-z]*\n?/gi, '').replace(/```/g, '')
    // 2. Sonra [FILE] bloklarını temizler
    .replace(/\[FILE:\s*[^\]]+\][\s\S]*?\[END_FILE\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ────────────────────────────────────────────────────
   FILE TYPE HELPERS
──────────────────────────────────────────────────────*/
function getFileColor(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map  = { html:'dot-html', css:'dot-css', js:'dot-js', ts:'dot-ts',
                 json:'dot-json', md:'dot-md', py:'dot-py' };
  return map[ext] || 'dot-default';
}

function getLang(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = { html:'html', css:'css', js:'javascript', ts:'typescript',
                json:'json', md:'markdown', py:'python', sh:'bash', txt:'plaintext' };
  return map[ext] || 'plaintext';
}

function countTokensApprox(text) {
  return Math.ceil((text || '').length / 3.8);
}

/* ────────────────────────────────────────────────────
   UI — CHAT MESSAGES
──────────────────────────────────────────────────────*/
function scrollToBottom() {
  const el = DOM.chatMessages();
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
}

function appendUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'animate-fade-up';
  div.innerHTML = `
    <div class="flex justify-end">
      <div class="msg-bubble-user">
        <div class="text-xs text-cyan-400/70 font-mono font-semibold mb-1 text-right">Sen</div>
        <p class="msg-text">${escapeHtml(text)}</p>
      </div>
    </div>`;
  DOM.chatMessages().appendChild(div);
  scrollToBottom();
}

function appendTypingIndicator() {
  const div = document.createElement('div');
  div.id = 'typing-indicator';
  div.className = 'animate-fade-up';
  div.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="avatar-ai flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#10b981" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 17l10 5 10-5" stroke="#06b6d4" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="msg-bubble-streaming">
        <div class="text-xs text-emerald-400 font-semibold mb-1 font-mono">OmniVibe AI</div>
        <div class="typing-dots flex items-center gap-1 h-5">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>`;
  DOM.chatMessages().appendChild(div);
  scrollToBottom();
  return div;
}

function updateTypingIndicator(div, textSoFar) {
  const bubble = div.querySelector('.msg-bubble-streaming');
  if (!bubble) return;

  // Show short preview of what's being written
  const preview = stripFileBlocks(textSoFar).slice(0, 300);
  bubble.innerHTML = `
    <div class="text-xs text-emerald-400 font-semibold mb-1 font-mono">OmniVibe AI</div>
    <p class="msg-text" style="font-size:12.5px;">${escapeHtml(preview)}${preview.length ? '<span class="inline-block w-1.5 h-3.5 bg-emerald-500 rounded-sm ml-0.5 animate-pulse" style="vertical-align:text-bottom"></span>' : ''}</p>`;
}

function finalizeTypingIndicator(div, fullText, parsedFiles) {
  div.remove();

  const chatText = stripFileBlocks(fullText).trim();
  const fileNames = Object.keys(parsedFiles);

  // Build file chips
  const chipsHtml = fileNames.map(n => `
    <button class="file-chip" onclick="App.viewFile('${escapeHtml(n)}')">
      <span class="w-2 h-2 rounded-full ${getFileColor(n)}"></span>
      ${escapeHtml(n)}
    </button>`).join('');

  const msgDiv = document.createElement('div');
  msgDiv.className = 'animate-fade-up';
  msgDiv.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="avatar-ai flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#10b981" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 17l10 5 10-5" stroke="#06b6d4" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="msg-bubble-ai flex-1">
        <div class="text-xs text-emerald-400 font-semibold mb-1 font-mono">OmniVibe AI</div>
        ${chatText ? `<p class="msg-text">${formatMsgText(chatText)}</p>` : ''}
        ${chipsHtml ? `<div class="flex flex-wrap gap-1.5 mt-2">${chipsHtml}</div>` : ''}
      </div>
    </div>`;

  DOM.chatMessages().appendChild(msgDiv);
  scrollToBottom();
}

function appendErrorMessage(errText) {
  const div = document.createElement('div');
  div.className = 'animate-fade-up';
  div.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="avatar-ai flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-red-950/40 border border-red-700/30">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
        </svg>
      </div>
      <div class="msg-bubble-error flex-1">
        <div class="text-xs text-red-400 font-semibold mb-1 font-mono">Hata</div>
        <p class="msg-text text-red-300">${escapeHtml(errText)}</p>
      </div>
    </div>`;
  DOM.chatMessages().appendChild(div);
  scrollToBottom();
}

function formatMsgText(text) {
  // Basic markdown: **bold**, `code`, line breaks
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-emerald-300">$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ────────────────────────────────────────────────────
   UI — FILE TABS & CODE VIEW
──────────────────────────────────────────────────────*/
function renderFileTabs() {
  const tabs  = DOM.fileTabs();
  const names = Object.keys(State.files);
  const hint  = DOM.noFilesHint();
  const badge = DOM.fileCountBadge();

  if (names.length === 0) {
    hint.classList.remove('hidden');
    badge.classList.add('hidden');
    // rebuild just the hint
    tabs.innerHTML = '';
    tabs.appendChild(hint);
    return;
  }

  hint.classList.add('hidden');
  badge.classList.remove('hidden');
  badge.textContent = `${names.length} dosya`;

  tabs.innerHTML = '';
  names.forEach(name => {
    const btn = document.createElement('button');
    btn.className = `file-tab ${name === State.activeFile ? 'active' : ''}`;
    btn.dataset.file = name;
    btn.innerHTML = `
      <span class="tab-dot ${getFileColor(name)}"></span>
      ${escapeHtml(name)}`;
    btn.onclick = () => App.viewFile(name);
    tabs.appendChild(btn);
  });
}

function renderCodeView(filename) {
  const code     = State.files[filename] || '';
  const lang     = getLang(filename);
  const lines    = code.split('\n').length;
  const hl       = DOM.codeHighlight();
  const pre      = DOM.codeContent();
  const empty    = DOM.codeEmptyState();
  const footer   = DOM.codeFooter();

  // Highlight
  hl.removeAttribute('class');
  hl.className = `language-${lang}`;
  hl.textContent = code;
  hljs.highlightElement(hl);

  pre.classList.remove('hidden');
  empty.classList.add('hidden');
  footer.classList.remove('hidden');
  footer.style.display = 'flex';

  DOM.activeFileName().textContent = filename;
  DOM.lineCount().textContent = `${lines} satır`;

  // Update tab active states
  document.querySelectorAll('.file-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.file === filename);
  });
}

function updateFilesFromResponse(parsedFiles) {
  let firstNew = null;
  for (const [name, code] of Object.entries(parsedFiles)) {
    const isNew = !State.files[name];
    State.files[name] = code;
    if (isNew && !firstNew) firstNew = name;
  }

  renderFileTabs();

  // Auto-open first new file, or first file
  if (firstNew) {
    State.activeFile = firstNew;
  } else if (!State.activeFile && Object.keys(State.files).length > 0) {
    State.activeFile = Object.keys(State.files)[0];
  }

  if (State.activeFile) {
    renderCodeView(State.activeFile);
  }

  // On mobile, show code tab if files were generated
  if (firstNew && window.innerWidth < 768) {
    App.switchTab('code');
  }
}

/* ────────────────────────────────────────────────────
   KOD ÇALIŞTIRMA (BACKEND SİMÜLASYONU)
──────────────────────────────────────────────────────*/
function executeActiveCode() {
  const filename = State.activeFile;
  const code = State.files[filename];

  if (!filename || !code) return;

  // HTML ise Önizleme sekmesine geç
  if (filename.endsWith('.html')) {
    App.switchTab('preview');
    return;
  }

  // JS ise tarayıcı konsolunda simüle et
  if (filename.endsWith('.js')) {
    try {
      console.log(`%c[OmniVibe] ${filename} çalıştırılıyor...`, 'color: #10b981; font-weight: bold;');
      // Yeni bir fonksiyon oluşturup çalıştırır
      const run = new Function(code);
      run();
      alert(`${filename} başarıyla çalıştırıldı! Sonuçları tarayıcı konsolunda (F12) görebilirsin.`);
    } catch (err) {
      alert("Kod hatası: " + err.message);
    }
  } else {
    alert("Şu an sadece .html ve .js dosyaları direkt çalıştırılabilir. .sk veya .py için backend entegrasyonu gerekir.");
  }
}

/* ────────────────────────────────────────────────────
   LIVE STREAMING CODE UPDATE
──────────────────────────────────────────────────────*/
let streamPartialBuffer = '';

function onStreamChunk(delta, fullSoFar) {
  streamPartialBuffer = fullSoFar;

  // Parse partial files and update code view live
  const partial = parseFiles(fullSoFar);
  if (Object.keys(partial).length > 0) {
    // Update files silently (no tab re-render for each chunk)
    let firstNew = null;
    for (const [name, code] of Object.entries(partial)) {
      const isNew = !State.files[name];
      if (isNew) firstNew = name;
      State.files[name] = code;
    }

    // Re-render tabs
    renderFileTabs();

    // Auto-activate first new file
    if (firstNew) State.activeFile = firstNew;
    else if (!State.activeFile) State.activeFile = Object.keys(State.files)[0];

    // Update code view (lightweight, no full re-highlight during stream)
    if (State.activeFile && State.files[State.activeFile]) {
      const pre = DOM.codeContent();
      const hl  = DOM.codeHighlight();
      pre.classList.remove('hidden');
      DOM.codeEmptyState().classList.add('hidden');
      hl.textContent = State.files[State.activeFile];
      // Throttle highlight during streaming
      if (Math.random() < 0.08) hljs.highlightElement(hl);
    }
  }
}

/* ────────────────────────────────────────────────────
   MAIN SEND FLOW
──────────────────────────────────────────────────────*/
async function sendMessage(text) {
  if (State.isLoading || !text.trim()) return;

  State.isLoading = true;
  streamPartialBuffer = '';

  // Update UI
  const input = DOM.chatInput();
  input.value = '';
  input.style.height = '40px';
  setLoadingState(true);

  // Add user message to history
  State.messages.push({ role: 'user', content: text });
  appendUserMessage(text);

  // Update token counter
  State.tokenCount += countTokensApprox(text);
  updateTokenCounter();

  // Show typing indicator
  const indicator = appendTypingIndicator();

  let fullResponse = '';

  try {
    fullResponse = await callAPI((delta, full) => {
      updateTypingIndicator(indicator, full);
      onStreamChunk(delta, full);
    });

    // Final parse
    const parsedFiles = parseFiles(fullResponse);

    // Update state
    State.messages.push({ role: 'assistant', content: fullResponse });
    State.tokenCount += countTokensApprox(fullResponse);
    updateTokenCounter();

    // Update context bar
    updateContextBar();

    // Finalize UI
    finalizeTypingIndicator(indicator, fullResponse, parsedFiles);

    // Full file update + render
    updateFilesFromResponse(parsedFiles);

    // Final syntax highlight
    if (State.activeFile) {
      renderCodeView(State.activeFile);
    }

  } catch (err) {
    indicator.remove();
    const msg = err.message || 'Bilinmeyen hata';
    appendErrorMessage(`API Hatası: ${msg}`);
    // Remove last user message from history on error
    State.messages.pop();
    App.toast(`Hata: ${msg}`, true);
  } finally {
    State.isLoading = false;
    setLoadingState(false);
    streamPartialBuffer = '';
  }
}

function setLoadingState(loading) {
  const btn    = DOM.sendBtn();
  const sIcon  = DOM.sendIcon();
  const lIcon  = DOM.loadingIcon();
  const input  = DOM.chatInput();

  if (loading) {
    btn.disabled = true;
    btn.classList.add('loading');
    sIcon.classList.add('hidden');
    lIcon.classList.remove('hidden');
    input.disabled = true;
  } else {
    btn.disabled = false;
    btn.classList.remove('loading');
    sIcon.classList.remove('hidden');
    lIcon.classList.add('hidden');
    input.disabled = false;
    input.focus();
  }
}

function updateTokenCounter() {
  const el = DOM.tokenCounter();
  if (el) el.textContent = `~${State.tokenCount.toLocaleString('tr')} token`;
}

function updateContextBar() {
  const bar   = DOM.contextBar();
  const label = DOM.contextLabel();
  if (State.messages.length > 1) {
    bar.classList.remove('hidden');
    bar.style.display = 'flex';
    label.textContent = `${State.messages.length} mesaj | Bağlam aktif`;
  }
}

/* ────────────────────────────────────────────────────
   PREVIEW
──────────────────────────────────────────────────────*/
function buildPreviewDoc() {
  // Merge files into a single HTML document for preview
  const fileNames = Object.keys(State.files);
  const htmlFile  = fileNames.find(n => n.endsWith('.html') || n === 'index.html')
                 || fileNames.find(n => n.endsWith('.html'));

  if (!htmlFile) {
    // No HTML? Try to show the first JS/CSS in a wrapper
    const jsFile  = fileNames.find(n => n.endsWith('.js'));
    const cssFile = fileNames.find(n => n.endsWith('.css'));
    let doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">`;
    if (cssFile) doc += `<style>${State.files[cssFile]}</style>`;
    doc += `</head><body>`;
    if (jsFile)  doc += `<script>${State.files[jsFile]}<\/script>`;
    doc += `</body></html>`;
    return doc;
  }

  let html = State.files[htmlFile];

  // Inline CSS files (e.g. href="style.css")
  html = html.replace(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi, (match, href) => {
    const cssName = href.split('/').pop();
    const cssFile = fileNames.find(n => n.endsWith(cssName) || n === cssName);
    if (cssFile) return `<style>\n${State.files[cssFile]}\n</style>`;
    return match;
  });

  // Inline JS files (e.g. src="script.js")
  html = html.replace(/<script[^>]+src=["']([^"']+\.js)["'][^>]*><\/script>/gi, (match, src) => {
    const jsName = src.split('/').pop();
    const jsFile = fileNames.find(n => n.endsWith(jsName) || n === jsName);
    if (jsFile) return `<script>\n${State.files[jsFile]}\n<\/script>`;
    return match;
  });

  return html;
}

/* ────────────────────────────────────────────────────
   SHARE PREVIEW
──────────────────────────────────────────────────────*/
async function sharePreview() {
  const fileCount = Object.keys(State.files).length;
  if (fileCount === 0) {
    App.toast('Paylaşılacak dosya yok', true);
    return;
  }

  // Set button to loading state
  const btnLabel  = DOM.shareBtnLabel();
  const btnIcon   = DOM.shareBtnIcon();
  const loadIcon  = DOM.shareLoadIcon();
  const shareBtn  = $('btn-share-preview');

  if (shareBtn) shareBtn.disabled = true;
  if (btnLabel) btnLabel.textContent = 'Yükleniyor...';
  if (btnIcon)  btnIcon.classList.add('hidden');
  if (loadIcon) loadIcon.classList.remove('hidden');

  try {
    const html = buildPreviewDoc();

    const resp = await fetch('/api/share', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ html }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    State.shareUrl = data.url;
    State.shareId  = data.id;

    // Show share link bar
    const bar  = DOM.shareLinkBar();
    const text = DOM.shareLinkText();
    if (bar)  { bar.classList.add('visible'); }
    if (text) { text.textContent = data.url; }

    // Update preview url bar
    const urlBar = $('preview-url-bar');
    if (urlBar) urlBar.textContent = data.url;

    // Update TTL badge
    const ttlBadge = $('share-ttl-badge');
    if (ttlBadge) ttlBadge.textContent = '24s geçerli';

    // Auto-copy to clipboard
    try {
      await navigator.clipboard.writeText(data.url);
      App.toast('Link kopyalandı! 24 saat geçerli ✓');
    } catch {
      App.toast('Link oluşturuldu! Manuel kopyalayın.');
    }

    // Reset button
    if (btnLabel) btnLabel.textContent = 'Paylaş';
    if (btnIcon)  btnIcon.classList.remove('hidden');
    if (loadIcon) loadIcon.classList.add('hidden');
    if (shareBtn) shareBtn.disabled = false;

  } catch (err) {
    if (btnLabel) btnLabel.textContent = 'Paylaş';
    if (btnIcon)  btnIcon.classList.remove('hidden');
    if (loadIcon) loadIcon.classList.add('hidden');
    if (shareBtn) shareBtn.disabled = false;
    App.toast('Paylaşım hatası: ' + err.message, true);
  }
}

async function copyShareLink() {
  const url = State.shareUrl;
  if (!url) return;

  const btn         = $('share-link-bar')?.querySelector('.share-copy-btn');
  const copyIcon    = $('copy-icon');
  const copiedIcon  = $('copied-icon');
  const copyLabel   = $('copy-btn-label');

  try {
    await navigator.clipboard.writeText(url);

    // Visual feedback
    if (btn)        btn.classList.add('copied');
    if (copyIcon)   copyIcon.classList.add('hidden');
    if (copiedIcon) copiedIcon.classList.remove('hidden');
    if (copyLabel)  copyLabel.textContent = 'Kopyalandı!';

    App.toast('Link kopyalandı! ✓');

    setTimeout(() => {
      if (btn)        btn.classList.remove('copied');
      if (copyIcon)   copyIcon.classList.remove('hidden');
      if (copiedIcon) copiedIcon.classList.add('hidden');
      if (copyLabel)  copyLabel.textContent = 'Kopyala';
    }, 2500);
  } catch {
    App.toast('Kopyalama başarısız', true);
  }
}

/* ────────────────────────────────────────────────────
   ZIP DOWNLOAD
──────────────────────────────────────────────────────*/
async function downloadZip() {
  const fileCount = Object.keys(State.files).length;
  if (fileCount === 0) {
    App.toast('Henüz indirılacak dosya yok!', true);
    return;
  }

  try {
    const zip = new JSZip();
    const folder = zip.folder('omnivibe-project');

    for (const [name, code] of Object.entries(State.files)) {
      folder.file(name, code);
    }

    // Add a README
    const fileList = Object.keys(State.files).map(n => `- ${n}`).join('\n');
    folder.file('README.md', `# OmniVibe Project\n\nOmniVibe Studio tarafından oluşturuldu.\n\n## Dosyalar\n\n${fileList}\n\n## Kullanım\n\nindex.html dosyasını bir tarayıcıda açın.\n`);

    const blob = await zip.generateAsync({
      type:               'blob',
      compression:        'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'omnivibe-project.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    App.toast(`${fileCount} dosya ZIP olarak indirildi! ✓`);
  } catch (err) {
    App.toast('ZIP oluşturma hatası: ' + err.message, true);
  }
}

/* ────────────────────────────────────────────────────
   RESIZE PANEL (Desktop)
──────────────────────────────────────────────────────*/
function initResize() {
  const handle = $('resize-handle');
  const chat   = $('panel-chat');
  if (!handle || !chat) return;

  let dragging  = false;
  let startX    = 0;
  let startW    = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX   = e.clientX;
    startW   = chat.getBoundingClientRect().width;
    document.body.style.userSelect    = 'none';
    document.body.style.pointerEvents = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx     = e.clientX - startX;
    const newW   = Math.min(Math.max(startW + dx, 280), window.innerWidth * 0.7);
    chat.style.width = newW + 'px';
    chat.style.flex  = 'none';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect    = '';
    document.body.style.pointerEvents = '';
  });
}

/* ────────────────────────────────────────────────────
   TOAST
──────────────────────────────────────────────────────*/
let toastTimer = null;

function showToast(msg, isError = false) {
  const toast = $('toast');
  const inner = toast.querySelector('.toast-inner');
  const icon  = $('toast-icon');
  const text  = $('toast-msg');

  text.textContent = msg;
  icon.textContent = isError ? '✕' : '✓';
  inner.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  toast.style.opacity = '1';

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.classList.add('hidden'), 200);
  }, 3000);
}

/* ────────────────────────────────────────────────────
   PUBLIC APP API
──────────────────────────────────────────────────────*/
const App = {
  /* Send chat message */
  send() {
    const input = DOM.chatInput();
    const text  = input.value.trim();
    if (text) sendMessage(text);
  },

  /* Keyboard handler */
  handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      App.send();
    }
  },

  /* Auto-resize textarea */
  autoResize(el) {
    el.style.height = '40px';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  },

  /* Quick prompt button */
  quickPrompt(text) {
    DOM.chatInput().value = text;
    App.send();
  },

  /* View a file in the code panel */
  viewFile(name) {
    if (!State.files[name]) return;
    State.activeFile = name;
    renderCodeView(name);

    // Switch to code tab on mobile
    if (window.innerWidth < 768) {
      App.switchTab('code');
    }
  },

  /* Clear all files */
  clearFiles() {
    State.files      = {};
    State.activeFile = null;
    DOM.codeContent().classList.add('hidden');
    DOM.codeEmptyState().classList.remove('hidden');
    DOM.codeFooter().style.display = 'none';
    renderFileTabs();
    App.toast('Dosyalar temizlendi');
  },

  /* Clear conversation context */
  clearContext() {
    State.messages   = [];
    State.tokenCount = 0;
    updateTokenCounter();
    const bar = DOM.contextBar();
    bar.classList.add('hidden');
    App.toast('Bağlam sıfırlandı');
  },

  /* Copy active file content */
  copyActiveFile() {
    if (!State.activeFile || !State.files[State.activeFile]) return;
    navigator.clipboard.writeText(State.files[State.activeFile])
      .then(() => App.toast(`${State.activeFile} kopyalandı!`))
      .catch(() => App.toast('Kopyalama başarısız', true));
  },

   /* Open full preview & Execute JS */
  openPreview() {
    const fileCount = Object.keys(State.files).length;
    if (fileCount === 0) {
      App.toast('Önizlenecek dosya yok', true);
      return;
    }

    const fileNames = Object.keys(State.files);
    const hasHtml = fileNames.some(n => n.endsWith('.html'));
    
    // HTML yoksa ama aktif dosya JS ise direkt çalıştır (Backend mantığı)
    if (!hasHtml && State.activeFile?.endsWith('.js')) {
      try {
        const run = new Function(State.files[State.activeFile]);
        run();
        App.toast(`${State.activeFile} başarıyla çalıştırıldı! ✓`);
        return; 
      } catch (err) {
        App.toast('Kod Hatası: ' + err.message, true);
        return;
      }
    }

    // Klasik HTML/CSS/JS önizleme modu
    const doc    = buildPreviewDoc();
    const iframe = DOM.previewIframe();
    iframe.srcdoc = doc;
    DOM.previewModal().classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  /* Close preview */
  closePreview() {
    DOM.previewModal().classList.add('hidden');
    DOM.previewIframe().srcdoc = '';
    document.body.style.overflow = '';
    // Hide share bar on close
    const bar = DOM.shareLinkBar();
    if (bar) bar.classList.remove('visible');
  },

  /* Refresh preview */
  refreshPreview() {
    const doc    = buildPreviewDoc();
    const iframe = DOM.previewIframe();
    iframe.srcdoc = '';
    setTimeout(() => { iframe.srcdoc = doc; }, 50);
  },

  /* Share preview */
  sharePreview,

  /* Copy share link */
  copyShareLink,

  /* Download ZIP */
  downloadZip,

  /* Mobile tab switch */
    switchTab(tab) {
    State.currentTab = tab;
    const chatPanel = $('panel-chat');
    const codePanel = $('panel-code');
    const tabChat   = DOM.tabChat();
    const tabCode   = DOM.tabCode();

    if (tab === 'chat') {
      if(chatPanel) chatPanel.style.display = 'flex';
      codePanel?.classList.remove('mobile-visible');
      tabChat?.classList.add('active'); // ? işareti null hatasını engeller
      tabCode?.classList.remove('active');
    } else {
      if(chatPanel) chatPanel.style.display = 'none';
      codePanel?.classList.add('mobile-visible');
      tabChat?.classList.remove('active');
      tabCode?.classList.add('active');
    }
  },

  /* Toast helper */
  toast: showToast,
};

/* ────────────────────────────────────────────────────
   KEYBOARD SHORTCUTS
──────────────────────────────────────────────────────*/
document.addEventListener('keydown', e => {
  // Escape to close preview
  if (e.key === 'Escape') {
    if (!$('preview-modal').classList.contains('hidden')) {
      App.closePreview();
    }
  }
  // Ctrl+Enter to send
  if (e.ctrlKey && e.key === 'Enter') {
    App.send();
  }
});

/* ────────────────────────────────────────────────────
   MOBILE SWIPE  (swipe right on code = go back to chat)
──────────────────────────────────────────────────────*/
(function initSwipe() {
  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (window.innerWidth >= 768) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx > 0 && State.currentTab === 'code') {
        App.switchTab('chat');
      } else if (dx < 0 && State.currentTab === 'chat') {
        App.switchTab('code');
      }
    }
  }, { passive: true });
})();

/* ────────────────────────────────────────────────────
   INIT
──────────────────────────────────────────────────────*/
document.addEventListener('DOMContentLoaded', () => {
  // Focus input
  setTimeout(() => DOM.chatInput()?.focus(), 300);

  // Init panel resize
  initResize();

  // Mobile: ensure correct initial tab
  if (window.innerWidth < 768) {
    App.switchTab('chat');
  }

  console.log(
    '%c OmniVibe Studio %c Ready ⚡ ',
    'background:#10b981;color:#050c09;font-weight:bold;padding:2px 6px;border-radius:4px 0 0 4px;',
    'background:#0d1f14;color:#34d399;padding:2px 6px;border-radius:0 4px 4px 0;border:1px solid #10b981;'
  );
});

/* Expose globally */
window.App = App;
