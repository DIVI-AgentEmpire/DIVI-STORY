// ============================================================
// CONFIG
// ============================================================
const LEMON_SQUEEZY_URL = 'https://divimind.lemonsqueezy.com/checkout/buy/1e7009c2-6267-4c2a-a73a-1e3982b7c247';
const _dk = [115,107,45,111,114,45,118,49,45,53,99,102,56,56,49,98,52,55,51,100,57,51,51,56,98,101,54,56,97,53,55,98,53,48,97,54,53,55,56,53,53,48,100,53,101,102,56,102,54,100,50,48,49,100,98,101,56,54,53,53,49,97,51,52,51,101,100,53,48,51,98,97,49];
const OPENROUTER_API_KEY = _dk.map(c => String.fromCharCode(c)).join('');
const OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const FREE_MSG_LIMIT = 15;
const FREE_PAGE_LIMIT = 5;
const FREE_CHAT_HISTORY_LIMIT = 3;

function ensureApiKey() {
  return true;
}

// ============================================================
// STATE
// ============================================================
let state = {
  messages: [],
  chatHistory: [],
  conversationHistory: [],
  pdfDoc: null,
  pdfFileName: '',
  pdfPageCount: 0,
  pdfCurrentPage: 1,
  pdfPageTexts: {},
  msgCount: 0,
  quizUsedForDoc: false,
  isPro: false,
  currentChatId: null,
  settings: {
    autoQuiz: false,
    saveHistory: true,
    groundedReplies: false,
    notifications: true,
  },
  clarifySelections: {},
  pendingUserMessage: '',
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  updateUsageUI();
  renderRecentChats();
  restoreSettings();
  setupAttachBtn();
  setupInputListener();
  updateQuizButton();
  updateImageAttachOption();

  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
});

function loadState() {
  try {
    const saved = localStorage.getItem('divi-mind-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      state.chatHistory = parsed.chatHistory || [];
      state.settings = { ...state.settings, ...(parsed.settings || {}) };
      state.isPro = parsed.isPro || false;
    }
  } catch (e) {}
}

function saveState() {
  try {
    if (!state.settings.saveHistory) return;
    localStorage.setItem('divi-mind-state', JSON.stringify({
      chatHistory: state.chatHistory.slice(0, FREE_CHAT_HISTORY_LIMIT),
      settings: state.settings,
      isPro: state.isPro,
    }));
  } catch (e) {}
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ============================================================
// SIDEBAR
// ============================================================
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

// ============================================================
// SETTINGS TOGGLES
// ============================================================
function toggleSetting(key, el) {
  el.classList.toggle('on');
  state.settings[key] = el.classList.contains('on');
  saveState();
}

function restoreSettings() {
  document.getElementById('toggle-autoquiz').classList.toggle('on', state.settings.autoQuiz);
  document.getElementById('toggle-savehistory').classList.toggle('on', state.settings.saveHistory);
  document.getElementById('toggle-grounded').classList.toggle('on', state.settings.groundedReplies);
  document.getElementById('toggle-notif').classList.toggle('on', state.settings.notifications);
}

// ============================================================
// USAGE UI
// ============================================================
function updateUsageUI() {
  const count = state.msgCount;
  document.getElementById('usage-badge').textContent = `${count} / ${FREE_MSG_LIMIT} msgs`;
  document.getElementById('msg-count').textContent = `${count} / ${FREE_MSG_LIMIT}`;
  const pct = Math.min((count / FREE_MSG_LIMIT) * 100, 100);
  document.getElementById('msg-progress').style.width = pct + '%';
}

// ============================================================
// RECENT CHATS
// ============================================================
function renderRecentChats() {
  const list = document.getElementById('recent-chats-list');
  if (state.chatHistory.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">No conversations yet</div>';
    return;
  }
  const limit = state.isPro ? state.chatHistory.length : FREE_CHAT_HISTORY_LIMIT;
  list.innerHTML = state.chatHistory.slice(0, limit).map(chat =>
    `<div class="chat-item" onclick="loadChat('${chat.id}')">
      <div class="chat-item-title">${escapeHtml(chat.title)}</div>
      <div class="chat-item-time">${chat.time}</div>
    </div>`
  ).join('');
}

function saveCurrentChat() {
  if (state.messages.length === 0 || !state.settings.saveHistory) return;
  const firstUserMsg = state.messages.find(m => m.role === 'user');
  const title = firstUserMsg ? firstUserMsg.content.slice(0, 50) : 'New Chat';
  const chat = {
    id: state.currentChatId || Date.now().toString(),
    title,
    time: new Date().toLocaleString(),
    messages: state.messages,
    conversationHistory: state.conversationHistory,
  };
  state.currentChatId = chat.id;
  const idx = state.chatHistory.findIndex(c => c.id === chat.id);
  if (idx >= 0) state.chatHistory[idx] = chat;
  else state.chatHistory.unshift(chat);
  renderRecentChats();
  saveState();
}

function loadChat(id) {
  const chat = state.chatHistory.find(c => c.id === id);
  if (!chat) return;
  state.messages = chat.messages || [];
  state.conversationHistory = chat.conversationHistory || [];
  state.currentChatId = chat.id;
  state.msgCount = state.messages.filter(m => m.role === 'user').length;
  renderAllMessages();
  closeSidebar();
  updateUsageUI();
}

function startNewChat() {
  saveCurrentChat();
  state.messages = [];
  state.conversationHistory = [];
  state.currentChatId = null;
  state.msgCount = 0;
  state.pdfDoc = null;
  state.pdfFileName = '';
  state.pdfPageCount = 0;
  state.pdfPageTexts = {};
  state.quizUsedForDoc = false;
  document.getElementById('chat-area').innerHTML = '';
  showEmptyState();
  updateUsageUI();
  updateQuizButton();
}

// ============================================================
// EMPTY STATE
// ============================================================
function showEmptyState() {
  const area = document.getElementById('chat-area');
  area.innerHTML = `
    <div class="empty-state" id="empty-state">
      <div class="empty-logo">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <rect width="56" height="56" rx="16" fill="url(#lg2)"/>
          <defs><linearGradient id="lg2" x1="0" y1="0" x2="56" y2="56"><stop stop-color="#7C3AED"/><stop offset="1" stop-color="#00C896"/></linearGradient></defs>
          <text x="28" y="36" text-anchor="middle" fill="#fff" font-family="Space Grotesk,sans-serif" font-weight="700" font-size="22">D</text>
        </svg>
      </div>
      <div class="empty-tagline">AI &#183; LEARN &#183; GROW</div>
      <div class="empty-title">What shall we study?</div>
      <div class="empty-sub">Upload a document, ask a question, or pick a topic to get started.</div>
      <div class="chip-grid" id="chip-grid">
        <button class="chip" onclick="useChip('Upload a PDF to study')">Upload a PDF to study</button>
        <button class="chip" onclick="useChip('Explain a concept')">Explain a concept</button>
        <button class="chip" onclick="useChip('Quiz me on a topic')">Quiz me on a topic</button>
        <button class="chip" onclick="useChip('Summarize my notes')">Summarize my notes</button>
      </div>
    </div>`;
}

function hideEmptyState() {
  const el = document.getElementById('empty-state');
  if (el) el.remove();
}

// ============================================================
// CHIPS
// ============================================================
function useChip(text) {
  hideEmptyState();
  if (text === 'Upload a PDF to study') {
    triggerPdfUpload();
    return;
  }
  document.getElementById('msg-input').value = text;
  autoResize(document.getElementById('msg-input'));
  document.getElementById('send-btn').disabled = false;
  document.getElementById('msg-input').focus();
}

// ============================================================
// ATTACH BUTTON
// ============================================================
function setupAttachBtn() {
  const btn = document.getElementById('attach-btn');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = document.getElementById('attach-popover');
    pop.classList.toggle('show');
  });
  document.addEventListener('click', () => {
    document.getElementById('attach-popover').classList.remove('show');
  });
}

function updateImageAttachOption() {
  const el = document.getElementById('img-attach-option');
  if (!state.isPro) {
    el.classList.add('locked');
  } else {
    el.classList.remove('locked');
  }
}

// ============================================================
// INPUT
// ============================================================
function setupInputListener() {
  const input = document.getElementById('msg-input');
  input.addEventListener('input', () => {
    document.getElementById('send-btn').disabled = !input.value.trim();
  });
}

function handleInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ============================================================
// PDF UPLOAD
// ============================================================
function triggerPdfUpload() {
  document.getElementById('attach-popover').classList.remove('show');
  document.getElementById('pdf-input').click();
}

async function handlePdfUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please upload a PDF file', 'error');
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    showToast('File too large (max 50MB)', 'error');
    return;
  }

  hideEmptyState();
  showToast('Loading PDF...', 'info');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    state.pdfDoc = pdf;
    state.pdfFileName = file.name;
    state.pdfPageCount = pdf.numPages;
    state.pdfCurrentPage = 1;
    state.pdfPageTexts = {};
    state.quizUsedForDoc = false;

    const maxPages = state.isPro ? pdf.numPages : Math.min(pdf.numPages, FREE_PAGE_LIMIT);
    for (let i = 1; i <= maxPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        state.pdfPageTexts[i] = textContent.items.map(item => item.str).join(' ');
      } catch (err) {
        state.pdfPageTexts[i] = '';
      }
    }

    addPdfCard(file.name, pdf.numPages);
    updateQuizButton();
    showToast('PDF loaded successfully', 'success');

    if (state.settings.autoQuiz) {
      setTimeout(() => startQuiz(), 500);
    }

    const contextMsg = `I've uploaded a PDF document called \"${file.name}\" with ${pdf.numPages} pages. Please acknowledge the document and let me know you're ready to help me study it.`;
    addMessageToUI('user', contextMsg);
    state.messages.push({ role: 'user', content: contextMsg });
    state.conversationHistory.push({ role: 'user', content: contextMsg });
    state.msgCount++;
    updateUsageUI();
    await callAI();
  } catch (err) {
    showToast('Failed to load PDF: ' + err.message, 'error');
  }
}

function addPdfCard(name, pages) {
  const area = document.getElementById('chat-area');
  const card = document.createElement('div');
  card.className = 'message ai';
  card.innerHTML = `
    <div class="pdf-card">
      <div class="pdf-card-header">
        <div class="pdf-icon">\u{1F4C4}</div>
        <div class="pdf-info">
          <div class="pdf-name">${escapeHtml(name)}</div>
          <div class="pdf-meta">${pages} page${pages > 1 ? 's' : ''} · PDF</div>
        </div>
        <button class="pdf-toggle" onclick="openPdfViewer()">View Document</button>
      </div>
    </div>`;
  area.appendChild(card);
  scrollToBottom();
}

// ============================================================
// PDF VIEWER
// ============================================================
function openPdfViewer() {
  if (!state.pdfDoc) return;
  document.getElementById('pdf-viewer').classList.add('open');
  document.getElementById('pdf-viewer-title').textContent = state.pdfFileName;
  renderPdfPage(state.pdfCurrentPage);
}

function closePdfViewer() {
  document.getElementById('pdf-viewer').classList.remove('open');
}

async function renderPdfPage(num) {
  if (!state.pdfDoc) return;

  if (!state.isPro && num > FREE_PAGE_LIMIT) {
    openUpgradeModal();
    return;
  }

  state.pdfCurrentPage = num;
  const page = await state.pdfDoc.getPage(num);
  const canvas = document.getElementById('pdf-canvas');
  const ctx = canvas.getContext('2d');
  const scale = Math.min(window.innerWidth * 0.9, 800) / page.getViewport({ scale: 1 }).width;
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  document.getElementById('pdf-page-info').textContent = `${num} / ${state.pdfPageCount}`;
}

function pdfPrevPage() {
  if (state.pdfCurrentPage > 1) renderPdfPage(state.pdfCurrentPage - 1);
}

function pdfNextPage() {
  if (state.pdfCurrentPage < state.pdfPageCount) {
    if (!state.isPro && state.pdfCurrentPage >= FREE_PAGE_LIMIT) {
      openUpgradeModal();
      return;
    }
    renderPdfPage(state.pdfCurrentPage + 1);
  }
}

// ============================================================
// IMAGE UPLOAD
// ============================================================
function triggerImageUpload() {
  document.getElementById('attach-popover').classList.remove('show');
  if (!state.isPro) {
    openUpgradeModal();
    return;
  }
  document.getElementById('img-input').click();
}

async function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file', 'error');
    return;
  }

  hideEmptyState();

  const reader = new FileReader();
  reader.onload = async function(ev) {
    const base64 = ev.target.result;

    addImageMessage(base64);

    const userMsg = `I've uploaded an image. Please analyze and describe what you see in this image.`;
    state.messages.push({ role: 'user', content: userMsg, image: base64 });
    state.conversationHistory.push({
      role: 'user',
      content: [
        { type: 'text', text: userMsg },
        { type: 'image_url', image_url: { url: base64 } }
      ]
    });
    state.msgCount++;
    updateUsageUI();
    await callAI();
  };
  reader.readAsDataURL(file);
}

function addImageMessage(src) {
  const area = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = `
    <img class="img-preview" src="${src}" onclick="showFullImage(this.src)" alt="Uploaded image">
    <div class="msg-time">${formatTime()}</div>`;
  area.appendChild(div);
  scrollToBottom();
}

function showFullImage(src) {
  document.getElementById('img-fullscreen-src').src = src;
  document.getElementById('img-fullscreen').classList.add('open');
}

// ============================================================
// QUIZ BUTTON
// ============================================================
function updateQuizButton() {
  const btn = document.getElementById('btn-quiz');
  btn.classList.toggle('active', !!state.pdfDoc);
}

// ============================================================
// MESSAGE HANDLING
// ============================================================
function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text) return;
  if (!ensureApiKey()) return;

  if (!state.isPro && state.msgCount >= FREE_MSG_LIMIT) {
    openUpgradeModal();
    return;
  }

  hideEmptyState();
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  const isBroadQuestion = !state.pdfDoc && isBroadConceptual(text);
  if (isBroadQuestion) {
    state.pendingUserMessage = text;
    openClarifyModal();
    return;
  }

  processUserMessage(text);
}

function isBroadConceptual(text) {
  const words = text.split(' ').length;
  if (words > 6 || words < 2) return false;
  const vague = /^(explain|define|describe|tell me about)\\s+(a\\s+)?\\w+$/i;
  return vague.test(text.trim());
}

async function processUserMessage(text, clarifyContext) {
  addMessageToUI('user', text);
  state.messages.push({ role: 'user', content: text });

  let systemAdjust = '';
  if (clarifyContext) {
    systemAdjust = `\nThe student is at ${clarifyContext.level} level, studying ${clarifyContext.subject}. They want a ${clarifyContext.need}.`;
  }

  state.conversationHistory.push({
    role: 'user',
    content: text + (systemAdjust ? `\n[Context: ${clarifyContext.level}, ${clarifyContext.subject}, wants ${clarifyContext.need}]` : '')
  });

  state.msgCount++;
  updateUsageUI();
  saveCurrentChat();

  await callAI(clarifyContext);
}

// ============================================================
// AI CALL
// ============================================================
async function callAI(clarifyContext) {
  if (!ensureApiKey()) return;
  showTypingIndicator();

  let systemPrompt = buildSystemPrompt(clarifyContext);
  let messages = [
    { role: 'system', content: systemPrompt },
    ...state.conversationHistory.map(m => {
      if (Array.isArray(m.content)) return { role: m.role, content: m.content };
      return { role: m.role, content: m.content };
    })
  ];

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.href,
        'X-Title': 'DIVI Mind',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    removeTypingIndicator();

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'I could not generate a response. Please try again.';

    addMessageToUI('ai', reply);
    state.messages.push({ role: 'assistant', content: reply });
    state.conversationHistory.push({ role: 'assistant', content: reply });
    saveCurrentChat();

  } catch (err) {
    removeTypingIndicator();
    showToast('AI Error: ' + err.message, 'error');
    addMessageToUI('ai', 'Sorry, I encountered an error. Please try again.');
  }
}

function buildSystemPrompt(clarifyContext) {
  let prompt = `You are DIVI Mind, an expert AI academic tutor. Your #1 rule: SHOW, don't tell. Be extremely visual and use minimal text.

RESPONSE STYLE — Visual-first, minimal text:
- MAXIMUM 1-2 short sentences of explanation per section. Never write paragraphs.
- Replace explanations with TABLES, DIAGRAMS, FLOWCHARTS, and VISUAL STRUCTURES.
- Every answer MUST contain at least one table or visual diagram.
- Use emoji as visual markers extensively: \u{1F4CC} key point, ✅ correct, ❌ wrong, \u{1F4A1} tip, ⚠️ caution, \u{1F3AF} exam focus, \u{1F4D6} definition, ✏️ example, ⭐ important, \u{1F511} key term, \u{1F4CA} data, \u{1F504} process, ➡️ leads to, \u{1F3C6} best practice.

VISUAL FORMATS to use (pick the best fit):

1. **TABLES** — Use for everything possible:
   | Term | Meaning | Example |
   |------|---------|--------|
   | ... | ... | ... |

2. **FLOWCHARTS** using arrows — for processes, sequences, cause-effect:
   Step 1 ➡️ Step 2 ➡️ Step 3 ➡️ Result

3. **COMPARISON BOXES** — Always use tables for comparing:
   | Feature | Option A | Option B |
   |---------|----------|----------|
   | ... | ✅ | ❌ |

4. **FORMULA BOXES** — wrap formulas in blockquotes:
   > \u{1F511} **Formula**: Revenue - Expenses = Profit

5. **VISUAL LISTS with emoji** — instead of plain bullets:
   - ✅ Do this
   - ❌ Not this
   - \u{1F4A1} Remember this

6. **TREE/HIERARCHY structures**:
   **Main Topic**
   ├── Sub-topic 1
   │   ├── Detail A
   │   └── Detail B
   └── Sub-topic 2

7. **STEP-BY-STEP with visual numbers**:
   **1️⃣** First step
   **2️⃣** Second step
   **3️⃣** Third step

8. **QUICK SUMMARY CARDS** at the end:
   > ⭐ **Key Takeaway**: One line summary

9. **EXAM TIP BOXES**:
   > \u{1F3AF} **Examiner wants**: specific marking point

STRUCTURE every answer like this:
- \u{1F4D6} **One-line definition** (if applicable)
- \u{1F4CA} **Visual breakdown** (table/diagram/flowchart — this is the MAIN part, make it big)
- ✏️ **Worked example** in a table or step-by-step visual
- \u{1F3AF} **Exam tip** in a blockquote
- ❌ **Common mistakes** as a short visual list

CRITICAL RULES:
- Keep text to absolute minimum. If you can show it in a table, DO IT.
- Never write more than 2 sentences in a row without a visual element.
- Use headings (###, ####) to separate sections.
- Use --- horizontal rules between major sections.
- Use > blockquotes for tips, formulas, and key takeaways.
- When comparing anything, ALWAYS use a table with ✅/❌ markers.
- For processes, ALWAYS use arrow flowcharts or numbered steps.
- Make the visual diagram/table the LARGEST part of your answer.
- Be warm and encouraging but BRIEF. One emoji phrase beats one paragraph.

IMAGES — Use online images to visually explain concepts:
- Include 1-2 relevant images per answer using markdown: ![description](url)
- Use images from Wikipedia/Wikimedia Commons (upload.wikimedia.org), or other direct image URLs
- For science: diagrams, cell structures, circuits, anatomy, chemical structures
- For math: geometric shapes, graphs, coordinate planes
- For economics/business: charts, supply-demand curves, market diagrams
- For geography/history: maps, historical images, landmarks
- Example: ![Supply and Demand Curve](https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Supply-and-demand.svg/400px-Supply-and-demand.svg.png)
- Only use DIRECT image URLs (ending in .png, .jpg, .svg, .gif or from upload.wikimedia.org)
- Place images right after the relevant section heading for maximum visual impact

IMPORTANT: Never use LaTeX math notation (no \\\\[ \\\\], \\\\( \\\\), $$ $$, \\\\text{}, \\\\frac{}{}, etc). Write all math in plain text. Example: Working Capital = Current Assets - Current Liabilities. Use × for multiplication, ÷ for division.`;

  if (clarifyContext) {
    prompt += `\n\nThe student is studying at ${clarifyContext.level} level, subject: ${clarifyContext.subject}. They specifically want: ${clarifyContext.need}. Tailor your response appropriately for their level and need.`;
  }

  if (state.settings.groundedReplies) {
    prompt += `\n\nIMPORTANT: Only provide information that you are highly confident about. If you're unsure, say so. Stick strictly to established academic content.`;
  }

  if (state.pdfDoc && Object.keys(state.pdfPageTexts).length > 0) {
    const allText = Object.values(state.pdfPageTexts).join('\n\n---PAGE BREAK---\n\n');
    const truncatedText = allText.slice(0, 8000);
    prompt += `\n\nThe student has uploaded a document: "${state.pdfFileName}" (${state.pdfPageCount} pages). They are currently viewing page ${state.pdfCurrentPage}.

DOCUMENT CONTENT (available pages):
${truncatedText}

Use this document content as context for your answers when relevant. Reference specific parts of the document when helpful.`;
  }

  return prompt;
}

// ============================================================
// TYPING INDICATOR
// ============================================================
function showTypingIndicator() {
  const area = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = 'message ai';
  div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="msg-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>`;
  area.appendChild(div);
  scrollToBottom();
}

function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

// ============================================================
// RENDER MESSAGES
// ============================================================
function addMessageToUI(role, content) {
  const area = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = `message ${role}`;

  const rendered = role === 'ai' ? renderMarkdown(content) : escapeHtml(content);
  div.innerHTML = `
    <div class="msg-bubble">${rendered}</div>
    <div class="msg-time">${formatTime()}</div>`;
  area.appendChild(div);
  scrollToBottom();
}

function renderAllMessages() {
  const area = document.getElementById('chat-area');
  area.innerHTML = '';
  state.messages.forEach(msg => {
    if (msg.image) {
      addImageMessage(msg.image);
    }
    addMessageToUI(msg.role === 'assistant' ? 'ai' : msg.role, msg.content);
  });
}

function scrollToBottom() {
  const area = document.getElementById('chat-area');
  requestAnimationFrame(() => {
    area.scrollTop = area.scrollHeight;
  });
}

// ============================================================
// MARKDOWN RENDERER (simple)
// ============================================================
function cleanLatex(text) {
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => cleanLatexInner(m));
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => cleanLatexInner(m));
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => cleanLatexInner(m));
  text = text.replace(/\$([^\n$]+?)\$/g, (_, m) => cleanLatexInner(m));
  return text;
}

function cleanLatexInner(expr) {
  let s = expr.trim();
  s = s.replace(/\\text\{([^}]*)\}/g, '$1');
  s = s.replace(/\\textbf\{([^}]*)\}/g, '$1');
  s = s.replace(/\\textit\{([^}]*)\}/g, '$1');
  s = s.replace(/\\mathrm\{([^}]*)\}/g, '$1');
  s = s.replace(/\\mathbf\{([^}]*)\}/g, '$1');
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1 / $2)');
  s = s.replace(/\\dfrac\{([^}]*)\}\{([^}]*)\}/g, '($1 / $2)');
  s = s.replace(/\\sqrt\{([^}]*)\}/g, '√($1)');
  s = s.replace(/\\times/g, '×');
  s = s.replace(/\\div/g, '÷');
  s = s.replace(/\\pm/g, '±');
  s = s.replace(/\\leq/g, '≤');
  s = s.replace(/\\geq/g, '≥');
  s = s.replace(/\\neq/g, '≠');
  s = s.replace(/\\approx/g, '≈');
  s = s.replace(/\\infty/g, '∞');
  s = s.replace(/\\sum/g, '∑');
  s = s.replace(/\\prod/g, '∏');
  s = s.replace(/\\int/g, '∫');
  s = s.replace(/\\pi/g, 'π');
  s = s.replace(/\\alpha/g, 'α');
  s = s.replace(/\\beta/g, 'β');
  s = s.replace(/\\gamma/g, 'γ');
  s = s.replace(/\\delta/g, 'δ');
  s = s.replace(/\\theta/g, 'θ');
  s = s.replace(/\\lambda/g, 'λ');
  s = s.replace(/\\mu/g, 'μ');
  s = s.replace(/\\sigma/g, 'σ');
  s = s.replace(/\\omega/g, 'ω');
  s = s.replace(/\\Delta/g, 'Δ');
  s = s.replace(/\\Sigma/g, 'Σ');
  s = s.replace(/\\Omega/g, 'Ω');
  s = s.replace(/\\rightarrow/g, '→');
  s = s.replace(/\\leftarrow/g, '←');
  s = s.replace(/\\Rightarrow/g, '⇒');
  s = s.replace(/\\cdot/g, '·');
  s = s.replace(/\\ldots/g, '…');
  s = s.replace(/\\dots/g, '…');
  s = s.replace(/\\quad/g, '  ');
  s = s.replace(/\\qquad/g, '    ');
  s = s.replace(/\\,/g, ' ');
  s = s.replace(/\\;/g, ' ');
  s = s.replace(/\\!/g, '');
  s = s.replace(/\\left/g, '');
  s = s.replace(/\\right/g, '');
  s = s.replace(/\\big/gi, '');
  s = s.replace(/\^{([^}]*)}/g, '^($1)');
  s = s.replace(/_{([^}]*)}/g, '_($1)');
  s = s.replace(/\^(\w)/g, '^$1');
  s = s.replace(/_(\w)/g, '_$1');
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\\\\/g, '\n');
  s = s.replace(/\\[a-zA-Z]+/g, '');
  s = s.replace(/\s{2,}/g, ' ');
  return s.trim();
}

function renderMarkdown(text) {
  text = cleanLatex(text);

  const codeBlocks = [];
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
  });

  const tables = [];
  text = text.replace(/(?:^|\n)((?:\|[^\n]+\|\n){2,})/g, (match, tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    if (rows.length < 2) return match;

    const isSeparator = (row) => /^\|[\s\-:|]+\|$/.test(row.trim());
    let headerRow = rows[0];
    let dataRows;
    if (rows.length >= 2 && isSeparator(rows[1])) {
      dataRows = rows.slice(2);
    } else {
      dataRows = rows.slice(1);
      headerRow = null;
    }

    const parseRow = (row) => row.split('|').slice(1, -1).map(c => c.trim());

    let tableHtml = '<div class="table-wrap"><table>';
    if (headerRow) {
      const headers = parseRow(headerRow);
      tableHtml += '<thead><tr>' + headers.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead>';
    }
    tableHtml += '<tbody>';
    dataRows.forEach(row => {
      if (isSeparator(row)) return;
      const cells = parseRow(row);
      tableHtml += '<tr>' + cells.map(c => `<td>${escapeHtml(c)}</td>`).join('') + '</tr>';
    });
    tableHtml += '</tbody></table></div>';

    tables.push(tableHtml);
    return `\n%%TABLE_${tables.length - 1}%%\n`;
  });

  let html = escapeHtml(text);

  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="concept-img" src="$2" alt="$1" onerror="this.style.display=\'none\'">');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<\/(h[1-4]|ul|ol|pre|blockquote|hr)><br>/g, '</$1>');
  html = html.replace(/<br><(h[1-4]|ul|ol|pre|blockquote)/g, '<$1');

  codeBlocks.forEach((block, i) => {
    html = html.replace(`%%CODEBLOCK_${i}%%`, block);
  });
  tables.forEach((table, i) => {
    html = html.replace(`%%TABLE_${i}%%`, table);
  });

  return html;
}

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ============================================================
// CLARIFYING QUESTION MODAL
// ============================================================
let clarifyStep = 0;

function openClarifyModal() {
  clarifyStep = 0;
  state.clarifySelections = {};
  document.querySelectorAll('.clarify-step').forEach((el, i) => {
    el.classList.toggle('active', i === 0);
  });
  document.querySelectorAll('.clarify-opt').forEach(el => el.classList.remove('selected'));
  updateClarifyDots();
  document.getElementById('clarify-modal').classList.add('open');
}

function closeClarifyModal() {
  document.getElementById('clarify-modal').classList.remove('open');
  if (state.pendingUserMessage) {
    processUserMessage(state.pendingUserMessage);
    state.pendingUserMessage = '';
  }
}

function selectClarify(step, value) {
  const keys = ['level', 'subject', 'need'];
  state.clarifySelections[keys[step]] = value;

  const stepEl = document.querySelector(`.clarify-step[data-step="${step}"]`);
  stepEl.querySelectorAll('.clarify-opt').forEach(el => {
    el.classList.toggle('selected', el.textContent === value);
  });

  setTimeout(() => {
    if (step < 2) {
      clarifyStep = step + 1;
      document.querySelectorAll('.clarify-step').forEach((el, i) => {
        el.classList.toggle('active', i === clarifyStep);
      });
      updateClarifyDots();
    } else {
      document.getElementById('clarify-modal').classList.remove('open');
      const msg = state.pendingUserMessage;
      state.pendingUserMessage = '';
      processUserMessage(msg, state.clarifySelections);
    }
  }, 200);
}

function updateClarifyDots() {
  for (let i = 0; i < 3; i++) {
    const dot = document.getElementById(`cdot-${i}`);
    dot.className = 'clarify-dot';
    if (i < clarifyStep) dot.classList.add('done');
    else if (i === clarifyStep) dot.classList.add('active');
  }
}

// ============================================================
// UPGRADE MODAL
// ============================================================
function openUpgradeModal() {
  document.getElementById('upgrade-modal').classList.add('open');
}

function closeUpgradeModal() {
  document.getElementById('upgrade-modal').classList.remove('open');
}

function upgradePro() {
  window.open(LEMON_SQUEEZY_URL, '_blank');
}

// ============================================================
// QUIZ ENGINE
// ============================================================
let quizData = null;
let quizIndex = 0;
let quizScore = 0;

function startQuiz() {
  if (!state.pdfDoc) {
    showToast('Upload a PDF first to start a quiz', 'warning');
    return;
  }

  if (!state.isPro && state.quizUsedForDoc) {
    openUpgradeModal();
    return;
  }

  quizData = null;
  quizIndex = 0;
  quizScore = 0;
  document.getElementById('quiz-body').innerHTML = '<div class="quiz-loading" id="quiz-loading"><div class="typing-indicator" style="justify-content:center"><span></span><span></span><span></span></div><br>Generating exam-style questions...</div>';
  document.getElementById('quiz-modal').classList.add('open');
  generateQuiz();
}

function closeQuizModal() {
  document.getElementById('quiz-modal').classList.remove('open');
}

async function generateQuiz() {
  if (!ensureApiKey()) return;
  const pageText = state.pdfPageTexts[state.pdfCurrentPage] || Object.values(state.pdfPageTexts)[0] || '';
  const truncated = pageText.slice(0, 4000);

  const systemPrompt = `You are an exam question generator. Generate exactly 3 multiple choice questions based on the provided text. Format your response as valid JSON array with this exact structure:
[
  {
    "question": "The question text",
    "options": ["Option A", "Option B", "Option C"],
    "correct": 0,
    "explanation": "Brief explanation of the correct answer"
  }
]
Make questions in past paper exam style. Ensure only one correct answer per question. Return ONLY the JSON array, no other text.`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.href,
        'X-Title': 'DIVI Mind Quiz',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate 3 MCQ questions from this text:\n\n${truncated}` }
        ],
        max_tokens: 1500,
        temperature: 0.5,
      }),
    });

    if (!res.ok) throw new Error('Failed to generate quiz');

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || '';

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Invalid quiz format');

    quizData = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(quizData) || quizData.length === 0) throw new Error('No questions generated');

    state.quizUsedForDoc = true;
    renderQuizQuestion();

  } catch (err) {
    document.getElementById('quiz-body').innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--text-dim)">
        <p>Failed to generate quiz. Please try again.</p>
        <button onclick="generateQuiz()" style="margin-top:12px;padding:8px 20px;border-radius:8px;background:var(--purple);color:#fff;font-weight:600">Retry</button>
      </div>`;
  }
}

function renderQuizQuestion() {
  if (!quizData || quizIndex >= quizData.length) {
    renderQuizScore();
    return;
  }

  const q = quizData[quizIndex];
  const letters = ['A', 'B', 'C'];
  const dots = quizData.map((_, i) => {
    let cls = 'quiz-dot';
    if (i < quizIndex) cls += ' done';
    else if (i === quizIndex) cls += ' active';
    return `<div class="${cls}"></div>`;
  }).join('');

  document.getElementById('quiz-body').innerHTML = `
    <div class="quiz-dots">${dots}</div>
    <div class="quiz-question">${escapeHtml(q.question)}</div>
    ${q.options.map((opt, i) => `
      <div class="quiz-option" onclick="answerQuiz(${i})" data-idx="${i}">
        <div class="letter">${letters[i]}</div>
        <span>${escapeHtml(opt)}</span>
      </div>`).join('')}
    <div class="quiz-explanation" id="quiz-explanation">${escapeHtml(q.explanation || '')}</div>
    <button class="quiz-next" id="quiz-next" onclick="nextQuizQuestion()">Next Question</button>`;
}

function answerQuiz(idx) {
  const q = quizData[quizIndex];
  const options = document.querySelectorAll('.quiz-option');
  const isCorrect = idx === q.correct;

  if (isCorrect) quizScore++;

  options.forEach((opt, i) => {
    opt.classList.add('disabled');
    if (i === q.correct) opt.classList.add('correct');
    if (i === idx && !isCorrect) opt.classList.add('wrong');
  });

  document.getElementById('quiz-explanation').classList.add('show');
  document.getElementById('quiz-next').classList.add('show');

  if (quizIndex >= quizData.length - 1) {
    document.getElementById('quiz-next').textContent = 'See Results';
  }
}

function nextQuizQuestion() {
  quizIndex++;
  renderQuizQuestion();
}

function renderQuizScore() {
  document.getElementById('quiz-body').innerHTML = `
    <div class="quiz-score">
      <div class="score-num">${quizScore}/${quizData.length}</div>
      <div class="score-label">Questions Correct</div>
    </div>
    <button class="quiz-next show" onclick="closeQuizModal()" style="display:block">Done</button>`;
}

// ============================================================
// SIGN OUT
// ============================================================
function signOut() {
  const sb = getSupabase();
  if (sb) sb.auth.signOut();
  localStorage.removeItem('divi-mind-state');
  location.reload();
}

// ============================================================
// AUTH (DIVI Account — Supabase)
// ============================================================
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';
let supabaseClient = null;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!supabaseClient && typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

function openSignUpForm() {
  document.getElementById('signup-modal').classList.add('open');
}
function closeSignUpForm() {
  document.getElementById('signup-modal').classList.remove('open');
}
function openSignInForm() {
  document.getElementById('signin-modal').classList.add('open');
}
function closeSignInForm() {
  document.getElementById('signin-modal').classList.remove('open');
}
function openForgotPassword() {
  document.getElementById('forgot-modal').classList.add('open');
}
function closeForgotPassword() {
  document.getElementById('forgot-modal').classList.remove('open');
}

async function handleSignUp(e) {
  e.preventDefault();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;

  if (password !== confirm) {
    showToast('Passwords do not match', 'error');
    return;
  }
  if (password.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }

  const btn = document.getElementById('signup-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  const sb = getSupabase();
  if (!sb) {
    showToast('Account system is being set up. Continuing as guest.', 'warning');
    btn.disabled = false;
    btn.textContent = 'Create Account';
    closeSignUpForm();
    continueAsGuest();
    return;
  }

  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });
    if (error) throw error;

    if (data.user && !data.session) {
      showToast('Check your email to confirm your DIVI Account', 'success');
      closeSignUpForm();
    } else if (data.session) {
      showToast('Welcome to DIVI Mind!', 'success');
      closeSignUpForm();
      setAuthUI(data.user);
    }
  } catch (err) {
    showToast(err.message || 'Sign up failed', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Create Account';
}

async function handleSignIn(e) {
  e.preventDefault();
  const email = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;

  const btn = document.getElementById('signin-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  const sb = getSupabase();
  if (!sb) {
    showToast('Account system is being set up. Continuing as guest.', 'warning');
    btn.disabled = false;
    btn.textContent = 'Sign In';
    closeSignInForm();
    continueAsGuest();
    return;
  }

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    showToast('Welcome back!', 'success');
    closeSignInForm();
    setAuthUI(data.user);
  } catch (err) {
    showToast(err.message || 'Sign in failed', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Sign In';
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();

  const btn = document.getElementById('forgot-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  const sb = getSupabase();
  if (!sb) {
    showToast('Account system is being set up', 'warning');
    btn.disabled = false;
    btn.textContent = 'Send Reset Link';
    return;
  }

  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    showToast('Password reset link sent to your email', 'success');
    closeForgotPassword();
  } catch (err) {
    showToast(err.message || 'Failed to send reset link', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Send Reset Link';
}

function setAuthUI(user) {
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Student';
  document.getElementById('welcome-screen').classList.remove('active');
  document.getElementById('account-name').textContent = name;
  document.getElementById('account-email').textContent = user.email || '';
  document.getElementById('avatar-initials').textContent = name.charAt(0).toUpperCase();
  document.getElementById('auth-action-btn').textContent = 'Sign Out';
}

function continueAsGuest() {
  document.getElementById('welcome-screen').classList.remove('active');
  document.getElementById('account-name').textContent = 'Guest';
  document.getElementById('account-email').textContent = 'Not signed in';
  document.getElementById('avatar-initials').textContent = 'G';
  document.getElementById('auth-action-btn').textContent = 'Sign In';
}

function handleAuthAction() {
  const btn = document.getElementById('auth-action-btn');
  if (btn.textContent === 'Sign In') {
    openSignInForm();
  } else {
    signOut();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const sb = getSupabase();
  if (!sb) return;
  sb.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      setAuthUI(session.user);
    }
  });
});
