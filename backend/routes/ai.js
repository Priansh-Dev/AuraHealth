const express = require('express');
const https = require('https');
const { pool } = require('../db');

const aiRouter = express.Router();

function normalize(s) {
  return String(s || '').toLowerCase();
}

function normalizeSpecialtyName(s) {
  return normalize(s)
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractJsonFromText(text) {
  const t = String(text || '').trim();
  if (!t) return null;

  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    const obj = safeJsonParse(fenced[1].trim());
    if (obj) return obj;
  }

  const firstBrace = t.indexOf('{');
  const lastBrace = t.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = t.slice(firstBrace, lastBrace + 1);
    const obj = safeJsonParse(slice);
    if (obj) return obj;
  }

  return null;
}

function geminiGenerateJson({ apiKey, model, prompt, temperature = 0.2 }) {
  return new Promise((resolve, reject) => {
    const urlPath = `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: 1022,
        responseMimeType: 'application/json'
      }
    });

    const req = https.request(
      {
        method: 'POST',
        hostname: 'generativelanguage.googleapis.com',
        path: urlPath,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            const detail = String(data || '').slice(0, 800);
            return reject(new Error(`Gemini API error (${res.statusCode}): ${detail || 'No details'}`));
          }

          const body = safeJsonParse(data);
          if (!body) return reject(new Error('Gemini returned non-JSON response'));

          const text =
            body?.candidates?.[0]?.content?.parts
              ?.map((p) => p?.text)
              .filter(Boolean)
              .join('\n') ||
            '';

          const extracted = extractJsonFromText(text);
          if (!extracted) return reject(new Error('Gemini response did not contain valid JSON'));
          resolve(extracted);
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function buildTriagePrompt(symptoms) {
  return [
    'You are a medical triage assistant. You are NOT a doctor. Provide informational suggestions only.',
    'Given a short symptom description, output ONLY a single valid JSON object (no markdown, no code fences, no extra text).',
    'The JSON must be strictly valid (double quotes, no trailing commas).',
    'Keep the output SHORT to avoid truncation.',
    'Return exactly:',
    '{',
    '  "condition": {"name": string, "confidence": number (0..1)},',
    '  "recommended_specialist": string,',
    '  "urgency": "emergency" | "urgent" | "routine",',
    '  "disclaimer": string',
    '}',
    'Rules:',
    '- Always include recommended_specialist.',
    '- recommended_specialist must be one of: Cardiologist, Dermatologist, Neurologist, Orthopedic, ENT, General Physician, Pediatrician.',
    '- If unsure, use General Physician.',
    '- condition.name must be <= 40 characters and must not include parentheses.',
    '- disclaimer must be exactly: "Informational only."',
    'Example output (format only; do not copy values):',
    '{"condition":{"name":"Condition A","confidence":0.55},"recommended_specialist":"General Physician","urgency":"routine","disclaimer":"Informational only."}',
    '',
    `Symptoms: ${symptoms}`
  ].join('\n');
}

function pickDbSpecialtiesFromGeminiOutput(modelSpecialties, dbSpecialties) {
  const db = (dbSpecialties || []).filter(Boolean);
  const dbNorm = db.map((s) => ({ raw: s, n: normalizeSpecialtyName(s) }));

  const fromModel = (modelSpecialties || [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .slice(0, 4);

  const matched = [];
  for (const ms of fromModel) {
    const m = normalizeSpecialtyName(ms);
    if (!m) continue;

    const direct = dbNorm.find((x) => x.n === m);
    if (direct) {
      matched.push(direct.raw);
      continue;
    }

    const contains = dbNorm.find((x) => x.n.includes(m) || m.includes(x.n));
    if (contains) {
      matched.push(contains.raw);
      continue;
    }

    if (m.includes('ortho')) {
      const ortho = dbNorm.find((x) => x.n.includes('ortho'));
      if (ortho) matched.push(ortho.raw);
    }
    if (m === 'ent' || m.includes('otolaryng')) {
      const ent = dbNorm.find((x) => x.n === 'ent' || x.n.includes('otolaryng'));
      if (ent) matched.push(ent.raw);
    }
  }

  const uniq = Array.from(new Set(matched));
  if (uniq.length) return uniq;

  const gp = dbNorm.find((x) => x.n.includes('general'));
  return gp ? [gp.raw] : ['General Physician'];
}

aiRouter.post('/triage', async (req, res) => {
  try {
    const symptoms = String(req.body?.symptoms || '').trim();
    const city = String(req.body?.city || '').trim();

    if (!symptoms) return res.status(400).json({ error: 'symptoms is required' });

    const [specRows] = await pool.query('SELECT DISTINCT specialty FROM doctors');
    const dbSpecialtiesList = (specRows || []).map((r) => r.specialty).filter(Boolean);

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    let triage = null;
    if (apiKey) {
      try {
        triage = await geminiGenerateJson({
          apiKey,
          model,
          prompt: buildTriagePrompt(symptoms)
        });
      } catch (e) {
        triage = null;
      }
    }

    const modelRecommended =
      triage && typeof triage.recommended_specialist === 'string' && triage.recommended_specialist.trim()
        ? [triage.recommended_specialist]
        : Array.isArray(triage?.recommended_specialties)
          ? triage.recommended_specialties
          : [];

    const dbSpecialties = pickDbSpecialtiesFromGeminiOutput(modelRecommended, dbSpecialtiesList);

    const picked = dbSpecialties.slice(0, 2);

    const placeholders = dbSpecialties.map(() => '?').join(', ');
    const params = [...dbSpecialties];

    let sql = `SELECT id, full_name, specialty, city, rating, review_count, avatar_url FROM doctors WHERE specialty IN (${placeholders})`;

    if (city) {
      sql += ' AND city = ?';
      params.push(city);
    }

    sql += ' ORDER BY rating DESC, review_count DESC, full_name ASC LIMIT 9';

    const [rows] = await pool.query(sql, params);

    res.json({
      data: {
        symptoms,
        matchedSpecialties: picked,
        doctors: rows
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Aura AI failed' });
  }
});

module.exports = { aiRouter };
