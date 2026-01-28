const express = require('express');
const { pool } = require('../db');

const aiRouter = express.Router();

function normalize(s) {
  return String(s || '').toLowerCase();
}

const SPECIALTY_RULES = [
  {
    specialty: 'Cardiologist',
    dbSpecialties: ['Cardiologist', 'Cardiology'],
    keywords: [
      'chest pain',
      'shortness of breath',
      'breathlessness',
      'palpitations',
      'heart',
      'bp',
      'blood pressure'
    ]
  },
  {
    specialty: 'Dermatologist',
    dbSpecialties: ['Dermatologist', 'Dermatology'],
    keywords: ['skin', 'rash', 'acne', 'itch', 'itching', 'eczema', 'hair fall', 'dandruff']
  },
  {
    specialty: 'Neurologist',
    dbSpecialties: ['Neurologist', 'Neurology'],
    keywords: ['headache', 'migraine', 'seizure', 'fits', 'numbness', 'tingling', 'stroke', 'dizzy']
  },
  {
    specialty: 'Pediatrician',
    dbSpecialties: ['Pediatrician', 'Pediatrics'],
    keywords: ['child', 'baby', 'infant', 'kids', 'fever in child', 'vaccination']
  },
  {
    specialty: 'Orthopedic',
    dbSpecialties: ['Orthopedic', 'Orthopedics', 'Orthopaedic', 'Orthopaedics'],
    keywords: ['knee', 'back pain', 'joint pain', 'fracture', 'sprain', 'shoulder pain']
  },
  {
    specialty: 'ENT',
    dbSpecialties: ['ENT', 'Otolaryngology'],
    keywords: ['throat', 'ear', 'sinus', 'cold', 'cough', 'nose', 'tonsil']
  },
  {
    specialty: 'General Physician',
    dbSpecialties: ['General Physician', 'General Medicine'],
    keywords: ['fever', 'cold', 'cough', 'body pain', 'weakness', 'fatigue', 'stomach', 'vomit']
  }
];

function getDbSpecialtiesFor(rule) {
  const v = rule && Array.isArray(rule.dbSpecialties) && rule.dbSpecialties.length ? rule.dbSpecialties : [rule.specialty];
  return v;
}

function scoreSpecialties(text) {
  const t = normalize(text);
  const scored = SPECIALTY_RULES.map((r) => {
    let score = 0;
    for (const kw of r.keywords) {
      const k = normalize(kw);
      if (!k) continue;
      if (t.includes(k)) score += k.length >= 8 ? 3 : 2;
      else {
        const parts = k.split(' ').filter(Boolean);
        if (parts.length > 1 && parts.every((p) => t.includes(p))) score += 2;
      }
    }
    return { specialty: r.specialty, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [{ specialty: 'General Physician', score: 1 }];
  return scored;
}

aiRouter.post('/triage', async (req, res) => {
  try {
    const symptoms = String(req.body?.symptoms || '').trim();
    const city = String(req.body?.city || '').trim();

    if (!symptoms) return res.status(400).json({ error: 'symptoms is required' });

    const ranked = scoreSpecialties(symptoms);
    const picked = ranked.slice(0, 2).map((x) => x.specialty);

    const pickedRules = picked
      .map((s) => SPECIALTY_RULES.find((r) => r.specialty === s))
      .filter(Boolean);

    const dbSpecialties = Array.from(
      new Set(pickedRules.flatMap((r) => getDbSpecialtiesFor(r)))
    );

    if (!dbSpecialties.length) dbSpecialties.push('General Physician');

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
