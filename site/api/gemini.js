const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

let cachedModel = null;
let cachedAt = 0;

async function pickFlashModel(apiKey) {
  if (cachedModel && Date.now() - cachedAt < 86400000) return cachedModel;
  try {
    const res = await fetch(GEMINI_BASE + '/models?key=' + apiKey);
    if (!res.ok) return 'gemini-2.5-flash';
    const data = await res.json();
    if (!data.models) return 'gemini-2.5-flash';
    const flash = data.models
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

async function geminiGenerate(apiKey, model, contents, tools) {
  var body = { contents: contents };
  if (tools) body.tools = tools;
  var res = await fetch(
    GEMINI_BASE + '/models/' + model + ':generateContent?key=' + apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    var errText = await res.text().catch(function () { return ''; });
    throw new Error('Gemini ' + res.status + ': ' + errText.slice(0, 200));
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  var action = req.body.action;
  var model;
  try {
    model = await pickFlashModel(apiKey);
  } catch (e) {
    model = 'gemini-2.5-flash';
  }

  try {
    if (action === 'ground') {
      var prompt = req.body.prompt || '';
      var result = await geminiGenerate(
        apiKey,
        model,
        [{ role: 'user', parts: [{ text: prompt }] }],
        [{ google_search: {} }]
      );
      var candidate = result.candidates && result.candidates[0];
      var text = '';
      if (candidate && candidate.content && candidate.content.parts) {
        text = candidate.content.parts.map(function (p) { return p.text || ''; }).join('');
      }
      var grounding = candidate && candidate.groundingMetadata || null;
      return res.json({ text: text, grounding: grounding, model: model });
    }

    if (action === 'kannada') {
      var answer = req.body.answer || '';
      var kannadaPrompt =
        'Rewrite this educational answer in simple spoken Kannada for Karnataka PUC/B.Com students. Rules:\n' +
        '1. Keep all English subject terms (debit, credit, depreciation, journal, ledger, etc.) in English.\n' +
        '2. First time a key term appears, show the PUC textbook Kannada term in brackets.\n' +
        '3. Use simple conversational Kannada, not formal/literary.\n' +
        '4. Keep tables, lists, formulas, and structure exactly as they are.\n' +
        '5. Keep ₹ for currency.\n\n' +
        'Answer to rewrite:\n' + answer;
      var result2 = await geminiGenerate(
        apiKey,
        model,
        [{ role: 'user', parts: [{ text: kannadaPrompt }] }]
      );
      var candidate2 = result2.candidates && result2.candidates[0];
      var text2 = '';
      if (candidate2 && candidate2.content && candidate2.content.parts) {
        text2 = candidate2.content.parts.map(function (p) { return p.text || ''; }).join('');
      }
      return res.json({ text: text2 || answer, model: model });
    }

    return res.status(400).json({ error: 'Invalid action. Use "ground" or "kannada".' });
  } catch (err) {
    console.error('Gemini API error:', err.message);
    return res.status(502).json({ error: err.message, model: model });
  }
};
