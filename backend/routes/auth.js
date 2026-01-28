const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { pool } = require('../db');

const authRouter = express.Router();

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev_secret_change_me';
}

function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

authRouter.post('/patient/register', async (req, res) => {
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const email = normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '');

    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({ error: 'fullName, email, phone, password are required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await pool.query('SELECT id FROM patients WHERE email = ?', [email]);
    if (existing[0]) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const [ins] = await pool.query(
      'INSERT INTO patients (full_name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
      [fullName, email, phone, passwordHash]
    );

    const token = signToken({ role: 'PATIENT', patientId: ins.insertId });

    res.status(201).json({
      data: {
        token,
        user: { id: ins.insertId, role: 'PATIENT', fullName, email, phone }
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register patient' });
  }
});

authRouter.post('/patient/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const [rows] = await pool.query(
      'SELECT id, full_name, email, phone, password_hash FROM patients WHERE email = ?',
      [email]
    );

    const patient = rows[0];
    if (!patient || !patient.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, patient.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ role: 'PATIENT', patientId: patient.id });

    res.json({
      data: {
        token,
        user: {
          id: patient.id,
          role: 'PATIENT',
          fullName: patient.full_name,
          email: patient.email,
          phone: patient.phone
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to login patient' });
  }
});

authRouter.post('/doctor/register', async (req, res) => {
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const email = normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '');
    const specialty = String(req.body?.specialty || '').trim();
    const city = String(req.body?.city || '').trim();

    if (!fullName || !email || !phone || !password || !specialty || !city) {
      return res
        .status(400)
        .json({ error: 'fullName, email, phone, password, specialty, city are required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await pool.query('SELECT id FROM doctors WHERE email = ?', [email]);
    if (existing[0]) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const [ins] = await pool.query(
      'INSERT INTO doctors (full_name, email, phone, password_hash, specialty, city, rating, review_count, avatar_url) VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL)',
      [fullName, email, phone, passwordHash, specialty, city]
    );

    const token = signToken({ role: 'DOCTOR', doctorId: ins.insertId });

    res.status(201).json({
      data: {
        token,
        user: { id: ins.insertId, role: 'DOCTOR', fullName, email, phone, specialty, city }
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register doctor' });
  }
});

authRouter.post('/doctor/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const [rows] = await pool.query(
      'SELECT id, full_name, email, phone, specialty, city, password_hash FROM doctors WHERE email = ?',
      [email]
    );

    const doctor = rows[0];
    if (!doctor || !doctor.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, doctor.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ role: 'DOCTOR', doctorId: doctor.id });

    res.json({
      data: {
        token,
        user: {
          id: doctor.id,
          role: 'DOCTOR',
          fullName: doctor.full_name,
          email: doctor.email,
          phone: doctor.phone,
          specialty: doctor.specialty,
          city: doctor.city
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to login doctor' });
  }
});

module.exports = { authRouter };
