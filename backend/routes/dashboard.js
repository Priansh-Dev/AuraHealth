const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth_middleware');

const dashboardRouter = express.Router();

function fmtSqlDateTime(d) {
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function isDateKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

dashboardRouter.get('/patient/appointments', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'PATIENT') return res.status(403).json({ error: 'Forbidden' });

    const nowStr = fmtSqlDateTime(new Date());

    const [rows] = await pool.query(
      `SELECT
        a.id,
        a.mode,
        a.room_id,
        a.scheduled_at,
        s.slot_end AS scheduled_end,
        a.status,
        a.notes,
        d.full_name AS doctor_name,
        d.specialty AS doctor_specialty,
        d.city AS doctor_city
      FROM appointments a
      JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN doctor_slots s ON s.id = a.slot_id
      WHERE a.patient_id = ? AND a.status = 'BOOKED' AND (
        (s.id IS NOT NULL AND s.slot_end > ?) OR
        (s.id IS NULL AND a.scheduled_at > ?)
      )
      ORDER BY a.scheduled_at ASC`,
      [req.user.patientId, nowStr, nowStr]
    );

    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load patient appointments' });
  }
});

dashboardRouter.get('/doctor/appointments', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });

    const dateKey = isDateKey(req.query.date) ? String(req.query.date) : fmtSqlDateTime(new Date()).slice(0, 10);
    const start = `${dateKey} 00:00:00`;
    const end = `${dateKey} 23:59:59`;

    const [rows] = await pool.query(
      `SELECT
        a.id,
        a.mode,
        a.room_id,
        a.scheduled_at,
        s.slot_end AS scheduled_end,
        a.status,
        a.notes,
        p.full_name AS patient_name,
        p.email AS patient_email,
        p.phone AS patient_phone
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      LEFT JOIN doctor_slots s ON s.id = a.slot_id
      WHERE a.doctor_id = ?
        AND a.status = 'BOOKED'
        AND a.scheduled_at >= ? AND a.scheduled_at <= ?
      ORDER BY a.scheduled_at ASC`,
      [req.user.doctorId, start, end]
    );

    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load doctor appointments' });
  }
});

module.exports = { dashboardRouter };
