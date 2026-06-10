/* ═══════════════════════════════════════════════════════
   OmniVibe Studio — script.js v3.0
   Monaco Editor + Gelişmiş Sandbox + Dosya Yönetimi + Kod Düzenleme
═══════════════════════════════════════════════════════ */

'use strict';

/* ────────────────────────────────────────────────────
   STATE
──────────────────────────────────────────────────────*/
const State = {
  messages:       [],
  files:          {},
  activeFile:     null,
  isLoading:      false,
  currentTab:     'chat',
  streamBuffer:   '',
  tokenCount:     0,
  shareUrl:       null,
  shareId:        null,
  monacoEditor:   null,
  isMonacoReady:  false,
  consoleLogs:    [],
  editorDecorations: [],
  undoStack:      {},
  redoStack:      {},
  lastSaved:      {},
  projectName:    'omnivibe-project',
  sessionId:      `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  previewTimeout: null,
};

/* ────────────────────────────────────────────────────
   DOM REFS
──────────────────────────────────────────────────────*/
const $ = id => document.getElementById(id);

const DOM = {
  chatMessages:     () => $('chat-messages'),
  chatInput:        () => $('chat-input'),
  sendBtn:          () => $('send-btn'),
  sendIcon:         () => $('send-icon'),
  loadingIcon:      () => $('loading-icon'),
  fileTabs:         () => $('file-tabs'),
  codeContent:      () => $('code-content'),
  codeHighlight:    () => $('code-highlight'),
  codeEmptyState:   () => $('code-empty-state'),
  codeFooter:       () => $('code-footer'),
  activeFileName:   () => $('active-file-name'),
  lineCount:        () => $('line-count'),
  charCount:        () => $('char-count'),
  cursorPosition:   () => $('cursor-position'),
  editorLanguage:   () => $('editor-language'),
  streamCursor:     () => $('stream-cursor'),
  noFilesHint:      () => $('no-files-hint'),
  fileCountBadge:   () => $('file-count-badge'),
  previewModal:     () => $('preview-modal'),
  previewIframe:    () => $('preview-iframe'),
  livePreviewIframe:() => $('live-preview-iframe'),
  tokenCounter:     () => $('token-counter'),
  contextBar:       () => $('context-bar'),
  contextLabel:     () => $('context-label'),
  tabChat:          () => $('tab-chat'),
  tabCode:          () => $('tab-code'),
  tabPreview:       () => $('tab-preview'),
  shareLinkBar:     () => $('share-link-bar'),
  shareLinkText:    () => $('share-link-text'),
  shareBtnLabel:    () => $('share-btn-label'),
  shareBtnIcon:     () => $('share-btn-icon'),
  shareLoadIcon:    () => $('share-loading-icon'),
  monacoEditor:     () => $('monaco-editor'),
  editorContainer:  () => $('editor-container'),
  previewLoading:   () => $('preview-loading'),
  previewStatus:    () => $('preview-status'),
  consolePanel:     () => $('console-panel'),
  consoleOutput:    () => $('console-output'),
  contextMenu:      () => $('context-menu'),
};

/* ────────────────────────────────────────────────────
   SYSTEM PROMPT
──────────────────────────────────────────────────────*/
const SYSTEM_PROMPT = `Sen OmniVibe Studio'nun hata kabul etmeyen, duygusuz ve %100 sonuc odakli "Bas Yazilim Mimari"sin.

### KESIN YASAKLAR:
1. BOS MESAJ YASAKTIR
2. OZET GECMEK YASAKTIR: "// kodun devami ayni" veya "// ... burayi doldur" kullanma
3. BASLAN BASLAMAK YASAKTIR: "devam" dediginde kaldigin yerden devam et
4. MARKDOWN YASAKTIR: Kodlari asla backtick icine alma

### ZORUNLU CIKTI PROTOKOLU:
Dosyalari SADECE bu yapida ver:
[FILE: dosya_adi.uzanti]
// Kodun tam ve eksiksiz icerigi
[END_FILE]

### OPERASYONEL KURALLAR:
- AKILLI TAMAMLAMA: Bagimliliklari otomatik ekle
- OTOMATIK DEVAM: Kod uzunsa "Devam etmek icin 'd' yazin" de
- MODERNIZM: 2026 standartlarinda, Glassmorphism, Dark UI
- TUM DOSYALARI TEK SEFERDE VER: Parcalama, her dosya tam ve eksiksiz olmali

### ILETISIM DILI:
- Teknik Analiz: Turkce
- Kod Mantigi: Ingilizce
- UI: Turkce`;

/* ────────────────────────────────────────────────────
   MONACO EDITOR INIT
──────────────────────────────────────────────────────*/
function initMonacoEditor() {
  if (State.isMonacoReady) return;

  try {
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
  } catch(e) {
    console.error('[OmniVibe] Monaco loader hatasi:', e);
  }

  require(['vs/editor/editor.main'], () => {
    monaco.editor.defineTheme('omnivibe-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '5A7A6A', fontStyle: 'italic' },
        { token: 'keyword', foreground: '10B981', fontStyle: 'bold' },
        { token: 'identifier', foreground: 'E2E8F0' },
        { token: 'string', foreground: '67E8F9' },
        { token: 'number', foreground: 'FBBF24' },
        { token: 'tag', foreground: 'F87171' },
        { token: 'attribute.name', foreground: 'FBBF24' },
        { token: 'attribute.value', foreground: '67E8F9' },
      ],
      colors: {
        'editor.background': '#050C09',
        'editor.foreground': '#E2E8F0',
        'editor.lineHighlightBackground': '#0D1F14',
        'editor.selectionBackground': '#10B98130',
        'editor.inactiveSelectionBackground': '#10B98115',
        'editorCursor.foreground': '#10B981',
        'editorLineNumber.foreground': '#334155',
        'editorLineNumber.activeForeground': '#10B981',
        'editorGutter.background': '#050C09',
        'editorWidget.background': '#0D1F14',
        'editorWidget.border': '#10B98130',
        'input.background': '#112918',
        'input.foreground': '#E2E8F0',
        'input.border': '#10B98130',
        'dropdown.background': '#0D1F14',
        'dropdown.border': '#10B98130',
        'list.activeSelectionBackground': '#10B98130',
        'list.hoverBackground': '#112918',
        'scrollbarSlider.background': '#10B98130',
        'scrollbarSlider.hoverBackground': '#10B98150',
      }
    });

    State.monacoEditor = monaco.editor.create(DOM.monacoEditor(), {
      value: '',
      language: 'javascript',
      theme: 'omnivibe-dark',
      fontSize: 13,
      fontFamily: 'JetBrains Mono, monospace',
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      minimap: { enabled: true, scale: 0.8 },
      automaticLayout: true,
      wordWrap: 'on',
      wrappingIndent: 'same',
      tabSize: 2,
      insertSpaces: true,
      formatOnPaste: true,
      formatOnType: true,
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      folding: true,
      foldingHighlight: true,
      showFoldingControls: 'always',
      unfoldOnClickAfterEndOfLine: true,
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      snippetSuggestions: 'top',
      parameterHints: { enabled: true },
      hover: { enabled: true },
      links: true,
      colorDecorators: true,
      lightbulb: { enabled: true },
      codeLens: true,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      contextmenu: true,
      mouseWheelZoom: true,
      multiCursorModifier: 'ctrlCmd',
      renderLineHighlight: 'all',
      renderLineHighlightOnlyWhenFocus: false,
      occurrencesHighlight: true,
      selectionHighlight: true,
      matchBrackets: 'always',
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      autoSurround: 'languageDefined',
      dragAndDrop: true,
      dropIntoEditor: { enabled: true },
      pasteAs: { enabled: true },
      stickyScroll: { enabled: true, maxLineCount: 5 },
    });

    State.monacoEditor.onDidChangeCursorPosition((e) => {
      const pos = DOM.cursorPosition();
      if (pos) pos.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    State.monacoEditor.onDidChangeModelContent(() => {
      if (State.activeFile) {
        const content = State.monacoEditor.getValue();
        State.files[State.activeFile].content = content;
        State.files[State.activeFile].isModified = true;
        updateFileTabModified(State.activeFile, true);
        updateEditorStats();
        updateLivePreview();
      }
    });

    State.monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      App.saveFile();
    });

    State.monacoEditor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
      App.formatCode();
    });

    State.monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => {
      State.monacoEditor.getAction('editor.action.startFindReplaceAction:').run();
    });

    State.isMonacoReady = true;
    console.log('%c[OmniVibe] Monaco Editor hazir', 'color: #10b981');
  }, (err) => {
    console.error('[OmniVibe] Monaco Editor yuklenemedi:', err);
    App.toast('Editor yuklenemedi, sayfayi yenile', true);
  });
}

/* ────────────────────────────────────────────────────
   API CALL
──────────────────────────────────────────────────────*/
async function callAPI(onChunk) {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': State.sessionId,
    },
    body: JSON.stringify({
      messages: State.messages,
      system: SYSTEM_PROMPT,
      stream: true,
      temperature: 0.3,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    let errData = null;
    try {
      errData = await response.json();
      errMsg = errData.error || errData.message || `HTTP ${response.status}`;
      console.error('[OmniVibe] API Hatasi:', errData);
    } catch(e) {
      const text = await response.text().catch(() => '');
      errMsg = text || `HTTP ${response.status}`;
    }
    // Hata panelini göster
    const panel = $('api-error-panel');
    const msgEl = $('api-error-msg');
    if (panel && msgEl && errData) {
      msgEl.innerHTML = `<strong>${errMsg}</strong><br><br>${errData.tip || ''}<br><br>
        <span class="text-slate-400">Debug: ${JSON.stringify(errData.envCheck || {})}</span>`;
      panel.classList.remove('hidden');
    }
    throw new Error(errMsg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = '';

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
        const delta = parsed.choices?.[0]?.delta?.content || '';
        if (delta) {
          full += delta;
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
   FILE PARSING
──────────────────────────────────────────────────────*/
function parseFiles(text) {
  const fileRegex = /\[FILE:\s*([^\]]+)\]\s*([\s\S]*?)\[END_FILE\]/g;
  const found = {};
  let match;

  while ((match = fileRegex.exec(text)) !== null) {
    const filename = match[1].trim();
    const rawContent = match[2].trim();
    const cleanContent = rawContent.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    found[filename] = cleanContent;
  }
  return found;
}

function stripFileBlocks(text) {
  return text
    .replace(/```[a-z]*\n?/gi, '').replace(/```/g, '')
    .replace(/\[FILE:\s*[^\]]+\][\s\S]*?\[END_FILE\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ────────────────────────────────────────────────────
   FILE TYPE HELPERS
──────────────────────────────────────────────────────*/
function getFileColor(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    html: 'dot-html', htm: 'dot-html',
    css: 'dot-css',
    js: 'dot-js', mjs: 'dot-js',
    ts: 'dot-ts', tsx: 'dot-ts',
    jsx: 'dot-js',
    json: 'dot-json',
    md: 'dot-md',
    py: 'dot-py',
    java: 'dot-java',
    c: 'dot-c', cpp: 'dot-cpp', h: 'dot-c',
    go: 'dot-go',
    rs: 'dot-rs',
    php: 'dot-php',
    sql: 'dot-sql',
    sh: 'dot-sh', bash: 'dot-sh',
    yaml: 'dot-yaml', yml: 'dot-yaml',
    xml: 'dot-xml',
    svg: 'dot-svg',
    png: 'dot-img', jpg: 'dot-img', jpeg: 'dot-img', gif: 'dot-img', webp: 'dot-img',
    txt: 'dot-txt',
  };
  return map[ext] || 'dot-default';
}

function getMonacoLanguage(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    html: 'html', htm: 'html',
    css: 'css',
    js: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    java: 'java',
    c: 'c', cpp: 'cpp', h: 'c',
    go: 'go',
    rs: 'rust',
    php: 'php',
    sql: 'sql',
    sh: 'shell', bash: 'shell',
    yaml: 'yaml', yml: 'yaml',
    xml: 'xml',
    svg: 'xml',
    txt: 'plaintext',
  };
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
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
}

function appendUserMessage(text) {
  const container = DOM.chatMessages();
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'animate-fade-up';
  div.innerHTML = `
    <div class="flex justify-end">
      <div class="msg-bubble-user">
        <div class="text-xs text-cyan-400/70 font-mono font-semibold mb-1 text-right">Sen</div>
        <p class="msg-text">${escapeHtml(text)}</p>
      </div>
    </div>`;
  container.appendChild(div);
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
  const container = DOM.chatMessages();
  if (container) container.appendChild(div);
  scrollToBottom();
  return div;
}

function updateTypingIndicator(div, textSoFar) {
  const bubble = div.querySelector('.msg-bubble-streaming');
  if (!bubble) return;
  const preview = stripFileBlocks(textSoFar).slice(0, 300);
  bubble.innerHTML = `
    <div class="text-xs text-emerald-400 font-semibold mb-1 font-mono">OmniVibe AI</div>
    <p class="msg-text" style="font-size:12.5px;">${escapeHtml(preview)}${preview.length ? '<span class="inline-block w-1.5 h-3.5 bg-emerald-500 rounded-sm ml-0.5 animate-pulse" style="vertical-align:text-bottom"></span>' : ''}</p>`;
}

function finalizeTypingIndicator(div, fullText, parsedFiles) {
  if (div) div.remove();

  const chatText = stripFileBlocks(fullText).trim();
  const fileNames = Object.keys(parsedFiles);

  const msgDiv = document.createElement('div');
  msgDiv.className = 'animate-fade-up';

  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-start gap-3';

  const avatarDiv = document.createElement('div');
  avatarDiv.className = 'avatar-ai flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center';
  avatarDiv.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#10b981" stroke-width="2" stroke-linejoin="round"/><path d="M2 17l10 5 10-5" stroke="#06b6d4" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble-ai flex-1';

  const label = document.createElement('div');
  label.className = 'text-xs text-emerald-400 font-semibold mb-1 font-mono';
  label.textContent = 'OmniVibe AI';
  bubble.appendChild(label);

  if (chatText) {
    const p = document.createElement('p');
    p.className = 'msg-text';
    p.innerHTML = formatMsgText(chatText);
    bubble.appendChild(p);
  }

  if (fileNames.length > 0) {
    const chipsDiv = document.createElement('div');
    chipsDiv.className = 'flex flex-wrap gap-1.5 mt-2';
    fileNames.forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'file-chip';
      btn.innerHTML = `<span class="w-2 h-2 rounded-full ${getFileColor(n)}"></span>${escapeHtml(n)}`;
      btn.onclick = () => App.viewFile(n);
      chipsDiv.appendChild(btn);
    });
    bubble.appendChild(chipsDiv);
  }

  wrapper.appendChild(avatarDiv);
  wrapper.appendChild(bubble);
  msgDiv.appendChild(wrapper);

  const container = DOM.chatMessages();
  if (container) {
    container.appendChild(msgDiv);
    scrollToBottom();
  }
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
  const container = DOM.chatMessages();
  if (container) container.appendChild(div);
  scrollToBottom();
}

function formatMsgText(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-emerald-300">$1</strong>')
    .replace(/`([^`<>]+)`/g, '<code>$1</code>')
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
  const tabs = DOM.fileTabs();
  const names = Object.keys(State.files);
  const hint = DOM.noFilesHint();
  const badge = DOM.fileCountBadge();

  if (names.length === 0) {
    hint.classList.remove('hidden');
    badge.classList.add('hidden');
    tabs.innerHTML = '';
    tabs.appendChild(hint);
    return;
  }

  hint.classList.add('hidden');
  badge.classList.remove('hidden');
  badge.textContent = `${names.length} dosya`;

  tabs.innerHTML = '';
  names.forEach(name => {
    const file = State.files[name];
    const isModified = file.isModified;
    const btn = document.createElement('button');
    btn.className = `file-tab ${name === State.activeFile ? 'active' : ''}`;
    btn.dataset.file = name;
    btn.innerHTML = `
      <span class="tab-dot ${getFileColor(name)}"></span>
      <span class="tab-name">${escapeHtml(name)}</span>
      ${isModified ? '<span class="tab-modified">●</span>' : ''}
      <span class="tab-close" onclick="event.stopPropagation(); App.closeFile('${name}')">×</span>`;
    btn.onclick = () => App.viewFile(name);
    tabs.appendChild(btn);
  });
}

function updateFileTabModified(filename, isModified) {
  const tab = document.querySelector(`.file-tab[data-file="${filename}"]`);
  if (!tab) return;
  const nameSpan = tab.querySelector('.tab-name');
  if (!nameSpan) return;
  let modSpan = tab.querySelector('.tab-modified');
  if (isModified && !modSpan) {
    modSpan = document.createElement('span');
    modSpan.className = 'tab-modified';
    modSpan.textContent = '●';
    nameSpan.after(modSpan);
  } else if (!isModified && modSpan) {
    modSpan.remove();
  }
}

function updateEditorStats() {
  if (!State.activeFile || !State.files[State.activeFile]) return;
  const content = State.files[State.activeFile].content;
  const lines = content.split('\n').length;
  const chars = content.length;

  const lineCount = DOM.lineCount();
  const charCount = DOM.charCount();
  const langSpan = DOM.editorLanguage();

  if (lineCount) lineCount.textContent = `${lines} satir`;
  if (charCount) charCount.textContent = `${chars} karakter`;
  if (langSpan) langSpan.textContent = getMonacoLanguage(State.activeFile).toUpperCase();
}

function renderCodeView(filename) {
  const file = State.files[filename];
  if (!file) return;

  const empty = DOM.codeEmptyState();
  const monacoDiv = DOM.monacoEditor();
  const footer = DOM.codeFooter();

  empty.classList.add('hidden');
  monacoDiv.classList.remove('hidden');
  footer.classList.remove('hidden');
  footer.style.display = 'flex';

  if (State.isMonacoReady && State.monacoEditor) {
    const oldModel = State.monacoEditor.getModel();
    const model = monaco.editor.createModel(
      file.content,
      getMonacoLanguage(filename)
    );
    State.monacoEditor.setModel(model);
    if (oldModel) oldModel.dispose();
    State.monacoEditor.focus();
  }

  DOM.activeFileName().textContent = filename;
  updateEditorStats();

  document.querySelectorAll('.file-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.file === filename);
  });

  updateLivePreview();
}

function updateFilesFromResponse(parsedFiles) {
  let firstNew = null;
  for (const [name, code] of Object.entries(parsedFiles)) {
    const isNew = !State.files[name];
    State.files[name] = {
      content: code,
      language: getMonacoLanguage(name),
      isModified: false,
    };
    if (isNew && !firstNew) firstNew = name;
  }

  renderFileTabs();

  if (firstNew) {
    State.activeFile = firstNew;
  } else if (!State.activeFile && Object.keys(State.files).length > 0) {
    State.activeFile = Object.keys(State.files)[0];
  }

  if (State.activeFile) {
    renderCodeView(State.activeFile);
  }

  if (firstNew && window.innerWidth < 768) {
    App.switchTab('code');
  }
}

/* ────────────────────────────────────────────────────
   LIVE PREVIEW SYSTEM
──────────────────────────────────────────────────────*/
function buildPreviewDoc() {
  const fileNames = Object.keys(State.files);
  const htmlFile = fileNames.find(n => n === 'index.html')
    || fileNames.find(n => n.endsWith('.html'));

  if (!htmlFile) {
    const jsFile = fileNames.find(n => n.endsWith('.js'));
    const cssFile = fileNames.find(n => n.endsWith('.css'));
    let doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">`;
    if (cssFile) doc += `<style>${State.files[cssFile].content}</style>`;
    doc += `</head><body>`;
    if (jsFile) doc += `<script>${State.files[jsFile].content}<\/script>`;
    doc += `</body></html>`;
    return doc;
  }

  let html = State.files[htmlFile].content;

  html = html.replace(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi, (match, href) => {
    const cssName = href.split('/').pop();
    const cssFile = fileNames.find(n => n.endsWith(cssName) || n === cssName);
    if (cssFile) return `<style>\n${State.files[cssFile].content}\n</style>`;
    return match;
  });

  html = html.replace(/<script[^>]+src=["']([^"']+\.js)["'][^>]*><\/script>/gi, (match, src) => {
    const jsName = src.split('/').pop();
    const jsFile = fileNames.find(n => n.endsWith(jsName) || n === jsName);
    if (jsFile) return `<script>\n${State.files[jsFile].content}\n<\/script>`;
    return match;
  });

  const consoleInterceptor = `
<script>
(function() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  function sendToParent(type, args) {
    try {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
      window.parent.postMessage({ type: 'console', level: type, message: msg, timestamp: Date.now() }, '*');
    } catch(e) {}
  }

  console.log = function(...args) { sendToParent('log', args); originalLog.apply(console, args); };
  console.error = function(...args) { sendToParent('error', args); originalError.apply(console, args); };
  console.warn = function(...args) { sendToParent('warn', args); originalWarn.apply(console, args); };
  console.info = function(...args) { sendToParent('info', args); originalInfo.apply(console, args); };

  window.onerror = function(msg, url, line, col, err) {
    sendToParent('error', [\`\${msg} (satir \${line}, kolon \${col})\`]);
    return false;
  };

  window.onunhandledrejection = function(e) {
    sendToParent('error', [\`Unhandled Promise Rejection: \${e.reason}\`]);
  };
})();
<\/script>`;

  if (html.includes('</head>')) {
    html = html.replace('</head>', consoleInterceptor + '\n</head>');
  } else if (html.includes('<body>')) {
    html = html.replace('<body>', '<body>' + consoleInterceptor);
  }

  return html;
}

function updateLivePreview() {
  const iframe = DOM.livePreviewIframe();
  if (!iframe) return;

  const fileNames = Object.keys(State.files);
  const hasHtml = fileNames.some(n => n.endsWith('.html'));
  const hasJs = fileNames.some(n => n.endsWith('.js'));
  const hasCss = fileNames.some(n => n.endsWith('.css'));

  if (!hasHtml && !hasJs && !hasCss) return;

  const loading = DOM.previewLoading();
  if (loading) loading.classList.remove('hidden');

  clearTimeout(State.previewTimeout);
  State.previewTimeout = setTimeout(() => {
    const doc = buildPreviewDoc();
    iframe.srcdoc = doc;
    if (loading) loading.classList.add('hidden');

    const status = DOM.previewStatus();
    if (status) {
      status.classList.remove('bg-red-500');
      status.classList.add('bg-emerald-500');
    }
  }, 800);
}

/* ────────────────────────────────────────────────────
   CONSOLE SYSTEM
──────────────────────────────────────────────────────*/
function initConsoleListener() {
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'console') {
      addConsoleEntry(e.data.level, e.data.message, e.data.timestamp);
    }
  });
}

function addConsoleEntry(level, message, timestamp) {
  const output = DOM.consoleOutput();
  if (!output) return;

  const entry = document.createElement('div');
  const time = new Date(timestamp).toLocaleTimeString('tr-TR', { hour12: false });
  const levelColors = {
    log: 'text-slate-300',
    error: 'text-red-400',
    warn: 'text-amber-400',
    info: 'text-cyan-400',
  };

  entry.className = `flex gap-2 ${levelColors[level] || 'text-slate-300'}`;
  entry.innerHTML = `
    <span class="text-slate-600 flex-shrink-0">[${time}]</span>
    <span class="break-all">${escapeHtml(message)}</span>`;

  output.appendChild(entry);
  output.scrollTop = output.scrollHeight;

  if (level === 'error') {
    const panel = DOM.consolePanel();
    if (panel) {
      panel.classList.remove('hidden');
      panel.style.display = 'flex';
    }
  }
}

/* ────────────────────────────────────────────────────
   STREAMING CODE UPDATE
──────────────────────────────────────────────────────*/
let streamPartialBuffer = '';

function onStreamChunk(delta, fullSoFar) {
  streamPartialBuffer = fullSoFar;
  const partial = parseFiles(fullSoFar);

  if (Object.keys(partial).length > 0) {
    let firstNew = null;
    for (const [name, code] of Object.entries(partial)) {
      const isNew = !State.files[name];
      if (isNew) firstNew = name;
      State.files[name] = {
        content: code,
        language: getMonacoLanguage(name),
        isModified: false,
      };
    }

    renderFileTabs();

    if (firstNew) State.activeFile = firstNew;
    else if (!State.activeFile) State.activeFile = Object.keys(State.files)[0];

    if (State.activeFile && State.files[State.activeFile]) {
      const file = State.files[State.activeFile];
      if (State.isMonacoReady && State.monacoEditor) {
        const currentModel = State.monacoEditor.getModel();
        if (currentModel && currentModel.getValue() !== file.content) {
          State.monacoEditor.setValue(file.content);
        }
      }
    }
  }
}

/* ────────────────────────────────────────────────────
   MAIN SEND FLOW
──────────────────────────────────────────────────────*/
async function sendMessage(text) {
  if (State.isLoading || !text.trim()) return;
  // Önceki hata panelini gizle
  const errPanel = $('api-error-panel');
  if (errPanel) errPanel.classList.add('hidden');

  State.isLoading = true;
  streamPartialBuffer = '';

  const input = DOM.chatInput();
  input.value = '';
  input.style.height = '40px';
  setLoadingState(true);

  State.messages.push({ role: 'user', content: text });
  appendUserMessage(text);

  State.tokenCount += countTokensApprox(text);
  updateTokenCounter();

  const indicator = appendTypingIndicator();

  let fullResponse = '';

  try {
    fullResponse = await callAPI((delta, full) => {
      updateTypingIndicator(indicator, full);
      onStreamChunk(delta, full);
    });

    const parsedFiles = parseFiles(fullResponse);

    State.messages.push({ role: 'assistant', content: fullResponse });
    State.tokenCount += countTokensApprox(fullResponse);
    updateTokenCounter();
    updateContextBar();

    finalizeTypingIndicator(indicator, fullResponse, parsedFiles);
    updateFilesFromResponse(parsedFiles);

    if (State.activeFile) {
      renderCodeView(State.activeFile);
    }

  } catch (err) {
    indicator.remove();
    const msg = err.message || 'Bilinmeyen hata';
    console.error('[OmniVibe] Tam hata:', err);
    appendErrorMessage(`API Hatasi: ${msg}`);
    // Hata detayını da göster
    if (err.stack) {
      console.error('[OmniVibe] Stack:', err.stack);
    }
    State.messages.pop();
    App.toast(`Hata: ${msg}`, true);
  } finally {
    State.isLoading = false;
    setLoadingState(false);
    streamPartialBuffer = '';
  }
}

function setLoadingState(loading) {
  const btn = DOM.sendBtn();
  const sIcon = DOM.sendIcon();
  const lIcon = DOM.loadingIcon();
  const input = DOM.chatInput();

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
  const bar = DOM.contextBar();
  const label = DOM.contextLabel();
  if (State.messages.length > 1) {
    bar.classList.remove('hidden');
    bar.style.display = 'flex';
    label.textContent = `${State.messages.length} mesaj | Baglam aktif`;
  }
}

/* ────────────────────────────────────────────────────
   PREVIEW
──────────────────────────────────────────────────────*/
function openPreviewFullscreen() {
  const fileCount = Object.keys(State.files).length;
  if (fileCount === 0) {
    App.toast('Onizlenecek dosya yok', true);
    return;
  }

  const doc = buildPreviewDoc();
  const iframe = DOM.previewIframe();
  iframe.srcdoc = doc;
  DOM.previewModal().classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

/* ────────────────────────────────────────────────────
   SHARE PREVIEW
──────────────────────────────────────────────────────*/
async function sharePreview() {
  const fileCount = Object.keys(State.files).length;
  if (fileCount === 0) {
    App.toast('Once bir seyler uret!', true);
    return;
  }

  const btnLabel = DOM.shareBtnLabel();
  const btnIcon = DOM.shareBtnIcon();
  const loadIcon = DOM.shareLoadIcon();
  const shareBtn = $('btn-share-preview');

  if (shareBtn) shareBtn.disabled = true;
  if (btnLabel) btnLabel.textContent = 'Yukleniyor...';
  if (btnIcon) btnIcon.classList.add('hidden');
  if (loadIcon) loadIcon.classList.remove('hidden');

  try {
    const html = buildPreviewDoc();

    const resp = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    State.shareUrl = data.url;
    State.shareId = data.id;

    const bar = DOM.shareLinkBar();
    const text = DOM.shareLinkText();
    if (bar) { bar.classList.remove('hidden'); bar.style.display = 'flex'; }
    if (text) text.textContent = data.url;

    const urlBar = $('preview-url-bar');
    if (urlBar) urlBar.textContent = data.url;

    const ttlBadge = $('share-ttl-badge');
    if (ttlBadge) ttlBadge.textContent = '24s gecerli';

    try {
      await navigator.clipboard.writeText(data.url);
      App.toast('Link kopyalandi! 24 saat gecerli');
    } catch {
      App.toast('Link olusturuldu! Manuel kopyalayin.');
    }

    if (btnLabel) btnLabel.textContent = 'Paylas';
    if (btnIcon) btnIcon.classList.remove('hidden');
    if (loadIcon) loadIcon.classList.add('hidden');
    if (shareBtn) shareBtn.disabled = false;

  } catch (err) {
    if (btnLabel) btnLabel.textContent = 'Paylas';
    if (btnIcon) btnIcon.classList.remove('hidden');
    if (loadIcon) loadIcon.classList.add('hidden');
    if (shareBtn) shareBtn.disabled = false;
    App.toast('Paylasim hatasi: ' + err.message, true);
  }
}

async function copyShareLink() {
  const url = State.shareUrl;
  if (!url) return;

  const btn = $('share-link-bar')?.querySelector('.share-copy-btn');
  const copyIcon = $('copy-icon');
  const copiedIcon = $('copied-icon');
  const copyLabel = $('copy-btn-label');

  try {
    await navigator.clipboard.writeText(url);
    if (btn) btn.classList.add('copied');
    if (copyIcon) copyIcon.classList.add('hidden');
    if (copiedIcon) copiedIcon.classList.remove('hidden');
    if (copyLabel) copyLabel.textContent = 'Kopyalandi!';

    App.toast('Link kopyalandi!');

    setTimeout(() => {
      if (btn) btn.classList.remove('copied');
      if (copyIcon) copyIcon.classList.remove('hidden');
      if (copiedIcon) copiedIcon.classList.add('hidden');
      if (copyLabel) copyLabel.textContent = 'Kopyala';
    }, 2500);
  } catch {
    App.toast('Kopyalama basarisiz', true);
  }
}

/* ────────────────────────────────────────────────────
   ZIP DOWNLOAD
──────────────────────────────────────────────────────*/
async function downloadZip() {
  const fileCount = Object.keys(State.files).length;
  if (fileCount === 0) {
    App.toast('Heniz indirilecek dosya yok!', true);
    return;
  }

  try {
    const zip = new JSZip();
    const folder = zip.folder(State.projectName);

    for (const [name, file] of Object.entries(State.files)) {
      folder.file(name, file.content);
    }

    const fileList = Object.keys(State.files).map(n => `- ${n}`).join('\n');
    folder.file('README.md', `# ${State.projectName}\n\nOmniVibe Studio tarafindan olusturuldu.\n\n## Dosyalar\n\n${fileList}\n\n## Kullanim\n\nindex.html dosyasini bir tarayicide acin.\n`);

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${State.projectName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    App.toast(`${fileCount} dosya ZIP olarak indirildi!`);
  } catch (err) {
    App.toast('ZIP olusturma hatasi: ' + err.message, true);
  }
}

/* ────────────────────────────────────────────────────
   FILE OPERATIONS
──────────────────────────────────────────────────────*/
function addNewFile() {
  const name = prompt('Dosya adi (orn: style.css, app.js):');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  if (State.files[trimmed]) {
    App.toast('Bu dosya zaten var!', true);
    return;
  }
  State.files[trimmed] = {
    content: '',
    language: getMonacoLanguage(trimmed),
    isModified: true,
  };
  State.activeFile = trimmed;
  renderFileTabs();
  renderCodeView(trimmed);
  App.toast(`Yeni dosya: ${trimmed}`);
}

function renameFile() {
  if (!State.activeFile) {
    App.toast('Once bir dosya secin', true);
    return;
  }
  const newName = prompt('Yeni dosya adi:', State.activeFile);
  if (!newName || !newName.trim() || newName.trim() === State.activeFile) return;
  const trimmed = newName.trim();
  if (State.files[trimmed]) {
    App.toast('Bu isimde dosya zaten var!', true);
    return;
  }
  State.files[trimmed] = State.files[State.activeFile];
  delete State.files[State.activeFile];
  State.activeFile = trimmed;
  renderFileTabs();
  renderCodeView(trimmed);
  App.toast(`Dosya yeniden adlandirildi: ${trimmed}`);
}

function deleteFile() {
  if (!State.activeFile) {
    App.toast('Once bir dosya secin', true);
    return;
  }
  if (!confirm(`${State.activeFile} dosyasini silmek istediginize emin misiniz?`)) return;
  delete State.files[State.activeFile];
  const remaining = Object.keys(State.files);
  State.activeFile = remaining.length > 0 ? remaining[0] : null;
  renderFileTabs();
  if (State.activeFile) {
    renderCodeView(State.activeFile);
  } else {
    DOM.codeContent().classList.add('hidden');
    DOM.codeEmptyState().classList.remove('hidden');
    DOM.codeFooter().style.display = 'none';
  }
  App.toast('Dosya silindi');
}

function closeFile(name) {
  if (!State.files[name]) return;
  const wasActive = State.activeFile === name;
  delete State.files[name];
  const remaining = Object.keys(State.files);
  if (wasActive) {
    State.activeFile = remaining.length > 0 ? remaining[0] : null;
  }
  renderFileTabs();
  if (State.activeFile) {
    renderCodeView(State.activeFile);
  } else {
    DOM.codeContent().classList.add('hidden');
    DOM.codeEmptyState().classList.remove('hidden');
    DOM.codeFooter().style.display = 'none';
  }
}

function saveFile() {
  if (!State.activeFile) {
    App.toast('Kaydedilecek dosya yok', true);
    return;
  }
  State.files[State.activeFile].isModified = false;
  updateFileTabModified(State.activeFile, false);
  State.lastSaved[State.activeFile] = Date.now();
  App.toast(`${State.activeFile} kaydedildi`);
}

function formatCode() {
  if (!State.isMonacoReady || !State.monacoEditor) return;
  State.monacoEditor.getAction('editor.action.formatDocument').run();
  App.toast('Kod formatlandi');
}

/* ────────────────────────────────────────────────────
   PROJECT OPERATIONS
──────────────────────────────────────────────────────*/
function newProject() {
  if (Object.keys(State.files).length > 0) {
    if (!confirm('Mevcut projeyi temizlemek istediginize emin misiniz?')) return;
  }
  State.files = {};
  State.activeFile = null;
  State.messages = [];
  State.tokenCount = 0;
  State.shareUrl = null;
  State.shareId = null;

  DOM.codeContent().classList.add('hidden');
  DOM.codeEmptyState().classList.remove('hidden');
  DOM.codeFooter().style.display = 'none';
  renderFileTabs();

  const chatContainer = DOM.chatMessages();
  chatContainer.innerHTML = '';

  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'system-msg animate-fade-up';
  welcomeDiv.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="avatar-ai flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#10b981" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 17l10 5 10-5" stroke="#06b6d4" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="msg-bubble-ai flex-1">
        <div class="text-xs text-emerald-400 font-semibold mb-1 font-mono">OmniVibe AI</div>
        <p class="text-sm text-slate-300 leading-relaxed">
          Yeni proje baslatildi! <span class="text-emerald-400 font-semibold">OmniVibe Studio</span>'yum.
          <span class="text-cyan-400 font-mono text-xs">gpt-oss-120b · high reasoning</span><br>
          Ne insa etmek istedigini soyle!
        </p>
      </div>
    </div>`;
  chatContainer.appendChild(welcomeDiv);

  updateTokenCounter();
  const bar = DOM.contextBar();
  bar.classList.add('hidden');

  App.toast('Yeni proje baslatildi');
}

/* ────────────────────────────────────────────────────
   CONSOLE OPERATIONS
──────────────────────────────────────────────────────*/
function clearConsole() {
  const output = DOM.consoleOutput();
  if (output) output.innerHTML = '';
  State.consoleLogs = [];
}

function toggleConsole() {
  const panel = DOM.consolePanel();
  if (!panel) return;
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    panel.style.display = 'flex';
  } else {
    panel.classList.add('hidden');
  }
}

/* ────────────────────────────────────────────────────
   RESIZE PANEL
──────────────────────────────────────────────────────*/
function initResize() {
  const handle = $('resize-handle');
  const chat = $('panel-chat');
  if (!handle || !chat) return;

  let dragging = false;
  let startX = 0;
  let startW = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = chat.getBoundingClientRect().width;
    document.body.style.userSelect = 'none';
    document.body.style.pointerEvents = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const newW = Math.min(Math.max(startW + dx, 280), window.innerWidth * 0.5);
    chat.style.width = newW + 'px';
    chat.style.flex = 'none';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.pointerEvents = '';
  });
}

/* ────────────────────────────────────────────────────
   TOAST
──────────────────────────────────────────────────────*/
let toastTimer = null;

function showToast(msg, isError = false) {
  const toast = $('toast');
  if (!toast) return;
  const inner = toast.querySelector('.toast-inner');
  const icon = $('toast-icon');
  const text = $('toast-msg');

  if (text) text.textContent = msg;
  if (icon) icon.textContent = isError ? '✕' : '✓';
  if (inner) inner.classList.toggle('error', isError);

  toast.style.transition = 'opacity 0.2s ease';
  toast.style.opacity = '0';
  toast.classList.remove('hidden');

  void toast.offsetHeight;
  toast.style.opacity = '1';

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.classList.add('hidden'), 250);
  }, 3000);
}

/* ────────────────────────────────────────────────────
   CONTEXT MENU
──────────────────────────────────────────────────────*/
function showContextMenu(x, y) {
  const menu = DOM.contextMenu();
  if (!menu) return;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.remove('hidden');
}

function hideContextMenu() {
  const menu = DOM.contextMenu();
  if (menu) menu.classList.add('hidden');
}

function contextAction(action) {
  hideContextMenu();
  if (!State.isMonacoReady || !State.monacoEditor) return;

  const editor = State.monacoEditor;
  const selection = editor.getSelection();

  switch (action) {
    case 'copy':
      editor.trigger('keyboard', 'editor.action.clipboardCopyAction', {});
      break;
    case 'cut':
      editor.trigger('keyboard', 'editor.action.clipboardCutAction', {});
      break;
    case 'paste':
      editor.trigger('keyboard', 'editor.action.clipboardPasteAction', {});
      break;
    case 'delete':
      if (selection && !selection.isEmpty()) {
        editor.executeEdits('contextmenu', [{ range: selection, text: '' }]);
      }
      break;
  }
}

/* ────────────────────────────────────────────────────
   PUBLIC APP API
──────────────────────────────────────────────────────*/
const App = {
  send() {
    const input = DOM.chatInput();
    const text = input.value.trim();
    if (text) sendMessage(text);
  },

  handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      App.send();
    }
  },

  autoResize(el) {
    el.style.height = '40px';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  },

  quickPrompt(text) {
    DOM.chatInput().value = text;
    App.send();
  },

  viewFile(name) {
    if (!State.files[name]) return;
    State.activeFile = name;
    renderCodeView(name);
    if (window.innerWidth < 768) {
      App.switchTab('code');
    }
  },

  clearFiles() {
    if (Object.keys(State.files).length === 0) return;
    if (!confirm('Tum dosyalari silmek istediginize emin misiniz?')) return;
    State.files = {};
    State.activeFile = null;
    DOM.codeContent().classList.add('hidden');
    DOM.codeEmptyState().classList.remove('hidden');
    DOM.codeFooter().style.display = 'none';
    renderFileTabs();
    App.toast('Dosyalar temizlendi');
  },

  clearContext() {
    State.messages = [];
    State.tokenCount = 0;
    updateTokenCounter();
    const bar = DOM.contextBar();
    bar.classList.add('hidden');
    App.toast('Baglam sifirlandi');
  },

  copyActiveFile() {
    if (!State.activeFile || !State.files[State.activeFile]) return;
    navigator.clipboard.writeText(State.files[State.activeFile].content)
      .then(() => App.toast(`${State.activeFile} kopyalandi!`))
      .catch(() => App.toast('Kopyalama basarisiz', true));
  },

  openPreview() {
    openPreviewFullscreen();
  },

  closePreview() {
    DOM.previewModal().classList.add('hidden');
    DOM.previewIframe().srcdoc = '';
    document.body.style.overflow = '';
    const bar = DOM.shareLinkBar();
    if (bar) bar.classList.add('hidden');
  },

  refreshPreview() {
    const doc = buildPreviewDoc();
    const iframe = DOM.previewIframe();
    iframe.srcdoc = '';
    setTimeout(() => { iframe.srcdoc = doc; }, 50);
  },

  refreshPreviewPanel() {
    updateLivePreview();
  },

  openPreviewFullscreen,

  sharePreview,
  copyShareLink,
  downloadZip,

  switchTab(tab) {
    State.currentTab = tab;
    const chatPanel = $('panel-chat');
    const codePanel = $('panel-code');
    const previewPanel = $('panel-preview');
    const tabChat = DOM.tabChat();
    const tabCode = DOM.tabCode();
    const tabPreview = DOM.tabPreview();

    [tabChat, tabCode, tabPreview].forEach(t => t?.classList.remove('active'));

    if (tab === 'chat') {
      if (chatPanel) chatPanel.style.display = 'flex';
      codePanel?.classList.add('hidden');
      codePanel?.classList.remove('mobile-visible');
      previewPanel?.classList.add('hidden');
      previewPanel?.classList.remove('mobile-visible');
      tabChat?.classList.add('active');
    } else if (tab === 'code') {
      if (chatPanel) chatPanel.style.display = 'none';
      codePanel?.classList.remove('hidden');
      codePanel?.classList.add('mobile-visible');
      previewPanel?.classList.add('hidden');
      previewPanel?.classList.remove('mobile-visible');
      tabCode?.classList.add('active');
    } else if (tab === 'preview') {
      if (chatPanel) chatPanel.style.display = 'none';
      codePanel?.classList.add('hidden');
      codePanel?.classList.remove('mobile-visible');
      previewPanel?.classList.remove('hidden');
      previewPanel?.classList.add('mobile-visible');
      tabPreview?.classList.add('active');
      updateLivePreview();
    }
  },

  addNewFile,
  renameFile,
  deleteFile,
  closeFile,
  saveFile,
  formatCode,

  newProject,

  clearConsole,
  toggleConsole,

  contextAction,

  testAPI: async () => {
    try {
      const resp = await fetch('/api/generate', { method: 'GET' });
      const data = await resp.json();
      console.log('[OmniVibe] API Test:', data);
      App.toast(`API OK! ${data.keys} key bulundu`);
      return data;
    } catch (err) {
      console.error('[OmniVibe] API Test Hatasi:', err);
      App.toast('API Test Hatasi: ' + err.message, true);
      // Hata panelini göster
      const panel = $('api-error-panel');
      const msg = $('api-error-msg');
      if (panel && msg) {
        msg.textContent = err.message + '. Vercel Dashboard > Environment Variables kismina CEREBRAS_API_KEY_1 eklemeyi unutma. Sonra YENI DEPLOY yap.';
        panel.classList.remove('hidden');
      }
      throw err;
    }
  },

  toast: showToast,
};

/* ────────────────────────────────────────────────────
   KEYBOARD SHORTCUTS
──────────────────────────────────────────────────────*/
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('preview-modal').classList.contains('hidden')) {
      App.closePreview();
    }
    hideContextMenu();
  }
  if (e.ctrlKey && e.key === 'Enter') {
    App.send();
  }
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    App.newProject();
  }
  if (e.ctrlKey && e.key === 'o') {
    e.preventDefault();
    App.addNewFile();
  }
});

/* ────────────────────────────────────────────────────
   MOBILE SWIPE
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
      const tabs = ['chat', 'code', 'preview'];
      const currentIdx = tabs.indexOf(State.currentTab);
      if (dx > 0 && currentIdx > 0) {
        App.switchTab(tabs[currentIdx - 1]);
      } else if (dx < 0 && currentIdx < tabs.length - 1) {
        App.switchTab(tabs[currentIdx + 1]);
      }
    }
  }, { passive: true });
})();

/* ────────────────────────────────────────────────────
   CONTEXT MENU LISTENER
──────────────────────────────────────────────────────*/
document.addEventListener('contextmenu', e => {
  if (e.target.closest('#monaco-editor')) {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('#context-menu')) {
    hideContextMenu();
  }
});

/* ────────────────────────────────────────────────────
   INIT
──────────────────────────────────────────────────────*/
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => DOM.chatInput()?.focus(), 300);
  initResize();
  initMonacoEditor();
  initConsoleListener();

  if (window.innerWidth < 768) {
    App.switchTab('chat');
  }

  console.log(
    '%c OmniVibe Studio v3 %c Ready ',
    'background:#10b981;color:#050c09;font-weight:bold;padding:2px 6px;border-radius:4px 0 0 4px;',
    'background:#0d1f14;color:#34d399;padding:2px 6px;border-radius:0 4px 4px 0;border:1px solid #10b981;'
  );
});

window.App = App;
