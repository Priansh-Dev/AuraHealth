const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');

const appointmentsRouter = express.Router();

function makeRoomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function parseScheduledAt(s) {
  if (!s || typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  const isoLike = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const d = new Date(isoLike);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

appointmentsRouter.post('/', async (req, res) => {
  try {
    const {
      doctorId,
      mode,
      scheduledAt,
      notes,
      patientFullName,
      patientEmail,
      patientPhone
    } = req.body || {};

    const dId = Number(doctorId);
    if (!Number.isFinite(dId)) return res.status(400).json({ error: 'Invalid doctorId' });

    if (mode !== 'IN_CLINIC' && mode !== 'TELE') {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    if (!scheduledAt || typeof scheduledAt !== 'string') {
      return res.status(400).json({ error: 'scheduledAt is required' });
    }

    const scheduledDate = parseScheduledAt(scheduledAt);
    if (!scheduledDate) {
      return res.status(400).json({ error: 'Invalid scheduledAt' });
    }

    if (scheduledDate.getTime() < Date.now()) {
      return res.status(400).json({ error: 'scheduledAt must be in the future' });
    }

    if (!patientFullName || !patientEmail || !patientPhone) {
      return res.status(400).json({ error: 'Patient details are required' });
    }

    const [doctorRows] = await pool.query('SELECT id FROM doctors WHERE id = ?', [dId]);
    if (!doctorRows[0]) return res.status(404).json({ error: 'Doctor not found' });

    const [patientRows] = await pool.query('SELECT id FROM patients WHERE email = ?', [patientEmail]);

    let patientId;
    if (patientRows[0]) {
      patientId = patientRows[0].id;
      await pool.query(
        'UPDATE patients SET full_name = ?, phone = ? WHERE id = ?',
        [patientFullName, patientPhone, patientId]
      );
    } else {
      const [ins] = await pool.query(
        'INSERT INTO patients (full_name, email, phone) VALUES (?, ?, ?)',
        [patientFullName, patientEmail, patientPhone]
      );
      patientId = ins.insertId;
    }

    const roomId = mode === 'TELE' ? makeRoomId() : null;

    const [apptIns] = await pool.query(
      'INSERT INTO appointments (patient_id, doctor_id, mode, scheduled_at, notes, room_id) VALUES (?, ?, ?, ?, ?, ?)',
      [patientId, dId, mode, scheduledAt, notes || null, roomId]
    );

    res.status(201).json({
      data: {
        appointmentId: apptIns.insertId,
        roomId,
        joinUrl: roomId ? `/teleconsult.html?room=${encodeURIComponent(roomId)}` : null
      }
    });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This slot is already booked' });
    }
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

appointmentsRouter.get('/', async (req, res) => {
  try {
    const email = (req.query.email || '').trim();
    if (!email) return res.status(400).json({ error: 'email query param is required' });

    const [rows] = await pool.query(
      `SELECT
        a.id,
        a.mode,
        a.room_id,
        a.scheduled_at,
        a.status,
        a.notes,
        d.full_name AS doctor_name,
        d.specialty AS doctor_specialty,
        d.city AS doctor_city,
        p.full_name AS patient_name,
        p.email AS patient_email,
        p.phone AS patient_phone
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN doctors d ON d.id = a.doctor_id
      WHERE p.email = ?
      ORDER BY a.scheduled_at DESC`,
      [email]
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load appointments' });
  }
});

module.exports = { appointmentsRouter };
