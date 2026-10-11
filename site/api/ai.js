var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
var GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
var GROQ_MODEL = 'openai/gpt-oss-120b';

var cachedModel = null;
var cachedAt = 0;

async function pickFlashModel(apiKey) {
  if (cachedModel && Date.now() - cachedAt < 86400000) return cachedModel;
  try {
    var res = await fetch(GEMINI_BASE + '/models?key=' + apiKey);
    if (!res.ok) return 'gemini-2.5-flash';
    var data = await res.json();
    if (!data.models) return 'gemini-2.5-flash';
    var flash = data.models
      .filter(function (m) {
        return /flash/i.test(m.name)
          && !/preview|exp|audio|tts|live|embed|image|vision|lite/i.test(m.name)
          && m.supportedGenerationMethods
          && m.supportedGenerationMethods.indexOf('generateContent') >= 0;
      })
      .map(function (m) { return m.name.replace('models/', ''); })
      .sort(function (a, b) { return b.localeCompare(a); });
    cachedModel = flash[0] || 'gemini-2.5-flash';
    cachedAt = Date.now();
    return cachedModel;
  } catch (e) {
    return 'gemini-2.5-flash';
  }
}

async function geminiGenerate(apiKey, model, contents, tools, systemInstruction) {
  var body = { contents: contents };
  if (tools) body.tools = tools;
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  var res = await fetch(
    GEMINI_BASE + '/models/' + model + ':generateContent?key=' + apiKey,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    var errText = await res.text().catch(function () { return ''; });
    throw new Error('Gemini ' + res.status + ': ' + errText.slice(0, 300));
  }
  return res.json();
}

function extractGeminiText(result) {
  var c = result.candidates && result.candidates[0];
  if (c && c.content && c.content.parts) {
    return c.content.parts.map(function (p) { return p.text || ''; }).join('');
  }
  return '';
}

function hasGroundingSupport(result) {
  var c = result.candidates && result.candidates[0];
  return !!(c && c.groundingMetadata && c.groundingMetadata.groundingChunks && c.groundingMetadata.groundingChunks.length > 0);
}

async function callGroq(groqKey, messages, maxTokens, temperature) {
  var res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + groqKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GROQ_MODEL, messages: messages, max_tokens: maxTokens || 2048, temperature: temperature || 0.7 }),
  });
  if (!res.ok) {
    var errText = await res.text().catch(function () { return ''; });
    var errMsg = 'Groq ' + res.status;
    try { var e = JSON.parse(errText); if (e.error && e.error.message) errMsg = e.error.message; } catch (x) {}
    throw new Error(errMsg);
  }
  var data = await res.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error('Invalid Groq response');
  return data.choices[0].message.content || '';
}

function shouldGround(userMsg, hasPdfContext) {
  if (hasPdfContext) return false;
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|bye|good)\b/i.test(userMsg.trim())) return false;
  return true;
}

function isFactualQuestion(userMsg) {
  var msg = userMsg.toLowerCase();
  if (/\b(who is|who was|who are|current|present|latest|recent|as of|right now|today)\b/.test(msg)) return true;
  if (/\b(cm |chief minister|prime minister|pm |president|governor|minister)\b/.test(msg)) return true;
  if (/\b(population|capital of|gdp|when did|when was|how many|price of|cost of|rate of)\b/.test(msg)) return true;
  if (/\b(news|latest|update|announce|elect|appoint|resign|winner|result)\b/.test(msg)) return true;
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var groqKey = process.env.GROQ_API_KEY;
  var geminiKey = process.env.GEMINI_API_KEY;
  if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

  var action = req.body.action;

  try {
    // ── CHAT: full pipeline ──
    if (action === 'chat') {
      var systemPrompt = req.body.systemPrompt || '';
      var messages = req.body.messages || [];
      var userMsg = req.body.userMsg || '';
      var langMode = req.body.langMode || 'en';
      var hasPdfContext = req.body.hasPdfContext || false;

      var debug = { path: 'groq-only', geminiModel: null, groundingError: null };
      var groundingFailed = false;
      var groundedFacts = '';
      var groundingResult = null;
      var factual = isFactualQuestion(userMsg);

      // ── Stage 1: Gemini grounding ──
      if (geminiKey && shouldGround(userMsg, hasPdfContext)) {
        var gemModel;
        try { gemModel = await pickFlashModel(geminiKey); } catch (e) { gemModel = 'gemini-2.5-flash'; }
        debug.geminiModel = gemModel;
        try {
          groundingResult = await geminiGenerate(
            geminiKey, gemModel,
            [{ role: 'user', parts: [{ text: userMsg }] }],
            [{ google_search: {} }]
          );
          groundedFacts = extractGeminiText(groundingResult);
          if (groundedFacts) {
            debug.path = 'gemini-grounded';
          } else {
            debug.path = 'groq-only';
            debug.groundingError = 'Gemini returned empty text';
          }
        } catch (e) {
          console.warn('Grounding failed:', e.message);
          groundingFailed = true;
          debug.groundingError = e.message;
          debug.path = 'groq-only';
        }
      } else if (!geminiKey) {
        debug.groundingError = 'GEMINI_API_KEY not set';
      }

      var reply;

      // ── Stage 2: Generate answer ──
      if (factual && groundedFacts && hasGroundingSupport(groundingResult)) {
        // For factual questions with good grounding, let Gemini answer directly
        // so Groq can't override the web-searched facts
        debug.path = 'gemini-direct';
        var gemModel2;
        try { gemModel2 = await pickFlashModel(geminiKey); } catch (e) { gemModel2 = 'gemini-2.5-flash'; }
        try {
          var directResult = await geminiGenerate(
            geminiKey, gemModel2,
            [{ role: 'user', parts: [{ text: userMsg }] }],
            [{ google_search: {} }],
            systemPrompt
          );
          reply = extractGeminiText(directResult);
          if (!reply) {
            // Fallback to Groq with grounded facts if Gemini gives empty answer
            debug.path = 'gemini-grounded';
            var fullSP = systemPrompt + '\n\n[VERIFIED FACTS from web search — these are CORRECT and CURRENT. You MUST use these facts in your answer. Do NOT contradict them.]:\n' + groundedFacts;
            var groqMsgs = [{ role: 'system', content: fullSP }].concat(messages);
            reply = await callGroq(groqKey, groqMsgs, 2048, 0.4);
          }
        } catch (e) {
          // Gemini direct failed, fall back to Groq with grounded facts
          console.warn('Gemini direct answer failed, using Groq:', e.message);
          debug.path = 'gemini-grounded';
          var fullSP2 = systemPrompt + '\n\n[VERIFIED FACTS from web search — these are CORRECT and CURRENT. You MUST use these facts in your answer. Do NOT contradict them.]:\n' + groundedFacts;
          var groqMsgs2 = [{ role: 'system', content: fullSP2 }].concat(messages);
          reply = await callGroq(groqKey, groqMsgs2, 2048, 0.4);
        }
      } else if (groundedFacts) {
        // Non-factual question but grounding found useful context — feed to Groq with stronger instruction
        var fullSystemPrompt = systemPrompt + '\n\n[VERIFIED FACTS from web search — these are CORRECT and CURRENT. You MUST use these facts in your answer. Do NOT contradict them.]:\n' + groundedFacts;
        var groqMessages = [{ role: 'system', content: fullSystemPrompt }].concat(messages);
        reply = await callGroq(groqKey, groqMessages, 2048, 0.5);
      } else {
        // No grounding — Groq only
        var groqMessages3 = [{ role: 'system', content: systemPrompt }].concat(messages);
        reply = await callGroq(groqKey, groqMessages3, 2048, 0.7);
      }

      // ── Grounding failure note ──
      if (groundingFailed && factual) {
        reply += '\n\n---\n⚠️ *I could not verify this with the latest sources. Please cross-check recent textbooks or official sites for the most current information.*';
      }

      // ── Stage 3: Kannada refinement ──
      if ((langMode === 'kn' || langMode === 'kn-mix') && geminiKey) {
        var gemModel3;
        try { gemModel3 = await pickFlashModel(geminiKey); } catch (e) { gemModel3 = 'gemini-2.5-flash'; }
        var knPrompt;
        if (langMode === 'kn') {
          knPrompt =
            'Rewrite this educational answer in simple spoken Kannada for Karnataka PUC/B.Com students. Rules:\n' +
            '1. Keep all English subject terms (debit, credit, depreciation, journal, ledger, etc.) in English.\n' +
            '2. First time a key term appears, show the PUC textbook Kannada term in brackets.\n' +
            '3. Use simple conversational Kannada, not formal/literary.\n' +
            '4. Keep tables, lists, formulas, and structure exactly as they are.\n' +
            '5. Keep ₹ for currency.\n\n' +
            'Answer to rewrite:\n' + reply;
        } else {
          knPrompt =
            'Improve this educational answer for Karnataka students who study in Kannada + English. Rules:\n' +
            '1. Keep all English subject terms as-is.\n' +
            '2. For key terms, add the PUC textbook Kannada equivalent in brackets on first mention.\n' +
            '3. The main text stays in English but make it more natural for Indian students.\n' +
            '4. Keep tables, lists, formulas, structure exactly as they are.\n' +
            '5. Keep ₹ for currency.\n\n' +
            'Answer to improve:\n' + reply;
        }
        try {
          var knResult = await geminiGenerate(
            geminiKey, gemModel3,
            [{ role: 'user', parts: [{ text: knPrompt }] }]
          );
          var knText = extractGeminiText(knResult);
          if (knText) reply = knText;
        } catch (e) {
          console.warn('Kannada refinement skipped:', e.message);
        }
      }

      return res.json({ reply: reply, groundingFailed: groundingFailed, debug: debug });
    }

    // ── QUIZ: generate MCQ via Groq ──
    if (action === 'quiz') {
      var quizSystem = req.body.systemPrompt || '';
      var quizUser = req.body.userMsg || '';
      var quizReply = await callGroq(
        groqKey,
        [{ role: 'system', content: quizSystem }, { role: 'user', content: quizUser }],
        1500, 0.5
      );
      return res.json({ reply: quizReply });
    }

    return res.status(400).json({ error: 'Invalid action. Use "chat" or "quiz".' });
  } catch (err) {
    console.error('AI API error:', err.message);
    return res.status(502).json({ error: err.message });
  }
};
