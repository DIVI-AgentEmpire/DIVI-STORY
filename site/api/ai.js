var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
var GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
var GROQ_MODEL = 'openai/gpt-oss-120b';

var cachedModel = null;
var cachedAt = 0;

async function pickFlashModel(apiKey) {
  if (cachedModel && Date.now() - cachedAt < 86400000) return cachedModel;
  try {
    var r = await fetch(GEMINI_BASE + '/models?key=' + apiKey);
    if (!r.ok) return 'gemini-2.5-flash';
    var data = await r.json();
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
  var r = await fetch(
    GEMINI_BASE + '/models/' + model + ':generateContent?key=' + apiKey,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!r.ok) {
    var errText = await r.text().catch(function () { return ''; });
    var err = new Error('Gemini ' + r.status + ': ' + errText.slice(0, 300));
    err.status = r.status;
    throw err;
  }
  return r.json();
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
  var r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + groqKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GROQ_MODEL, messages: messages, max_tokens: maxTokens || 2048, temperature: temperature || 0.7 }),
  });
  if (!r.ok) {
    var errText = await r.text().catch(function () { return ''; });
    var errMsg = 'Groq ' + r.status;
    try { var e = JSON.parse(errText); if (e.error && e.error.message) errMsg = e.error.message; } catch (x) {}
    throw new Error(errMsg);
  }
  var data = await r.json();
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

// Try Gemini grounding with fallback chain:
// 1. Gemini + Google Search (best: real-time web data)
// 2. Gemini plain (fallback: training data, no web, but more recent than Groq)
// 3. null (caller falls through to Groq)
async function tryGeminiGrounding(geminiKey, gemModel, userMsg) {
  // Step 1: try with Google Search
  try {
    var result = await geminiGenerate(
      geminiKey, gemModel,
      [{ role: 'user', parts: [{ text: userMsg }] }],
      [{ google_search: {} }]
    );
    var text = extractGeminiText(result);
    if (text) {
      return { text: text, result: result, source: 'gemini-search', grounded: hasGroundingSupport(result) };
    }
  } catch (e) {
    console.warn('Gemini+Search failed:', e.status || '', e.message.slice(0, 100));
    // If 429, try without search
  }

  // Step 2: try plain Gemini (no Google Search tool — separate/higher quota)
  try {
    var plainResult = await geminiGenerate(
      geminiKey, gemModel,
      [{ role: 'user', parts: [{ text: userMsg }] }]
    );
    var plainText = extractGeminiText(plainResult);
    if (plainText) {
      return { text: plainText, result: plainResult, source: 'gemini-plain', grounded: false };
    }
  } catch (e2) {
    console.warn('Gemini plain also failed:', e2.status || '', e2.message.slice(0, 100));
  }

  return null;
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
      var geminiInfo = null;
      var factual = isFactualQuestion(userMsg);

      // ── Stage 1: Gemini grounding (with fallback chain) ──
      if (geminiKey && shouldGround(userMsg, hasPdfContext)) {
        var gemModel;
        try { gemModel = await pickFlashModel(geminiKey); } catch (e) { gemModel = 'gemini-2.5-flash'; }
        debug.geminiModel = gemModel;

        geminiInfo = await tryGeminiGrounding(geminiKey, gemModel, userMsg);

        if (geminiInfo) {
          debug.path = geminiInfo.source;
          if (geminiInfo.grounded) debug.path = 'gemini-grounded';
        } else {
          groundingFailed = true;
          debug.groundingError = 'All Gemini calls failed (likely 429 quota)';
          debug.path = 'groq-only';
        }
      } else if (!geminiKey) {
        debug.groundingError = 'GEMINI_API_KEY not set';
      }

      var reply;

      // ── Stage 2: Generate answer ──
      if (factual && geminiInfo && (geminiInfo.grounded || geminiInfo.source === 'gemini-plain')) {
        // Factual question with Gemini data available
        if (geminiInfo.grounded) {
          // Best case: web-grounded Gemini answer — use directly
          debug.path = 'gemini-direct';
          reply = geminiInfo.text;
        } else {
          // Gemini plain (no web search, but newer training data than Groq)
          debug.path = 'gemini-plain';
          reply = geminiInfo.text;
        }
      } else if (geminiInfo && geminiInfo.text) {
        // Non-factual question with Gemini context — feed to Groq
        var fullSystemPrompt = systemPrompt + '\n\n[VERIFIED FACTS from search — these are CORRECT and CURRENT. You MUST use these facts in your answer. Do NOT contradict them.]:\n' + geminiInfo.text;
        var groqMessages = [{ role: 'system', content: fullSystemPrompt }].concat(messages);
        reply = await callGroq(groqKey, groqMessages, 2048, 0.5);
      } else {
        // No Gemini data — Groq only
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
          console.warn('Kannada refinement skipped:', e.message.slice(0, 80));
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

    // ── TEST: diagnostic endpoint ──
    if (action === 'test') {
      var testResults = { geminiKeySet: !!geminiKey, groqKeySet: !!groqKey, steps: [] };
      if (!geminiKey) return res.json(testResults);
      var tm2;
      try {
        tm2 = await pickFlashModel(geminiKey);
        testResults.steps.push({ step: 'pickModel', ok: true, model: tm2 });
      } catch (e2) {
        testResults.steps.push({ step: 'pickModel', ok: false, error: e2.message });
        return res.json(testResults);
      }
      try {
        var pr2 = await geminiGenerate(geminiKey, tm2, [{ role: 'user', parts: [{ text: 'Say hello in one word' }] }]);
        testResults.steps.push({ step: 'plainGenerate', ok: true, text: extractGeminiText(pr2).slice(0, 100) });
      } catch (e3) {
        testResults.steps.push({ step: 'plainGenerate', ok: false, error: e3.message.slice(0, 200) });
      }
      try {
        var gr2 = await geminiGenerate(geminiKey, tm2, [{ role: 'user', parts: [{ text: 'Who is the current Chief Minister of Karnataka?' }] }], [{ google_search: {} }]);
        var gt2 = extractGeminiText(gr2);
        testResults.steps.push({ step: 'groundedGenerate', ok: true, text: gt2.slice(0, 300), hasGroundingChunks: hasGroundingSupport(gr2) });
      } catch (e4) {
        testResults.steps.push({ step: 'groundedGenerate', ok: false, error: e4.message.slice(0, 300) });
      }
      return res.json(testResults);
    }

    return res.status(400).json({ error: 'Invalid action. Use "chat", "quiz", or "test".' });
  } catch (err) {
    console.error('AI API error:', err.message);
    return res.status(502).json({ error: err.message });
  }
};
