var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
var GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
var GROQ_MODEL = 'openai/gpt-oss-120b';
var GROQ_SEARCH_MODEL = 'groq/compound';

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

async function callGroq(groqKey, messages, maxTokens, temperature, model) {
  var r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + groqKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || GROQ_MODEL, messages: messages, max_tokens: maxTokens || 2048, temperature: temperature || 0.7 }),
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

async function searchWeb(query) {
  try {
    var url = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1';
    var r = await fetch(url, { headers: { 'User-Agent': 'DIVI-Mind/1.0' } });
    if (!r.ok) return null;
    var data = await r.json();
    var facts = [];
    if (data.AbstractText) facts.push(data.AbstractText);
    if (data.Answer) facts.push(data.Answer);
    if (data.RelatedTopics) {
      for (var i = 0; i < Math.min(data.RelatedTopics.length, 5); i++) {
        if (data.RelatedTopics[i] && data.RelatedTopics[i].Text) facts.push(data.RelatedTopics[i].Text);
      }
    }
    if (facts.length > 0) return facts.join('\n');
  } catch (e) {
    console.warn('DDG API failed:', e.message.slice(0, 80));
  }
  try {
    var htmlUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    var r2 = await fetch(htmlUrl, { headers: { 'User-Agent': 'DIVI-Mind/1.0' } });
    if (!r2.ok) return null;
    var html = await r2.text();
    var snippets = [];
    var re = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    var m;
    while ((m = re.exec(html)) !== null && snippets.length < 5) {
      var text = m[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
      if (text.length > 30) snippets.push(text);
    }
    if (snippets.length > 0) return snippets.join('\n');
  } catch (e2) {
    console.warn('DDG HTML failed:', e2.message.slice(0, 80));
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
    // ── CHAT ──
    if (action === 'chat') {
      var systemPrompt = req.body.systemPrompt || '';
      var messages = req.body.messages || [];
      var userMsg = req.body.userMsg || '';
      var langMode = req.body.langMode || 'en';
      var hasPdfContext = req.body.hasPdfContext || false;

      var debug = { path: 'groq-only', geminiModel: null, groundingError: null };
      var groundingFailed = false;
      var factual = isFactualQuestion(userMsg);

      var reply;

      if (factual) {
        // Factual/current-affairs → web search + Groq
        var webFacts = await searchWeb(userMsg);
        if (webFacts) {
          var factSP = systemPrompt + '\n\n[VERIFIED WEB SEARCH RESULTS — These are CURRENT and CORRECT. Base your answer on these facts. Do NOT contradict them.]\n' + webFacts;
          reply = await callGroq(groqKey, [{ role: 'system', content: factSP }, { role: 'user', content: userMsg }], 2048, 0.3);
          debug.path = 'web-search';
        } else {
          var groqMsgs = [{ role: 'system', content: systemPrompt }].concat(messages);
          reply = await callGroq(groqKey, groqMsgs, 2048, 0.7);
          debug.path = 'groq-only';
          groundingFailed = true;
        }

      } else {
        // Non-factual → plain Groq
        var groqMsgs2 = [{ role: 'system', content: systemPrompt }].concat(messages);
        reply = await callGroq(groqKey, groqMsgs2, 2048, 0.7);
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

    // ── QUIZ ──
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

    // ── TEST ──
    if (action === 'test') {
      var testResults = { geminiKeySet: !!geminiKey, groqKeySet: !!groqKey, steps: [] };

      // Test web search (DuckDuckGo)
      try {
        var webResult = await searchWeb('Who is the current Chief Minister of Karnataka?');
        testResults.steps.push({ step: 'webSearch', ok: !!webResult, text: webResult ? webResult.slice(0, 400) : 'No results' });
      } catch (e5) {
        testResults.steps.push({ step: 'webSearch', ok: false, error: e5.message.slice(0, 200) });
      }

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
        testResults.steps.push({ step: 'groundedGenerate', ok: true, text: extractGeminiText(gr2).slice(0, 300), hasGroundingChunks: hasGroundingSupport(gr2) });
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
