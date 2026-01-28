const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth_middleware');

const dashboardRouter = express.Router();

function toUpcomingWhere() {
  return "a.status = 'BOOKED' AND a.scheduled_at >= NOW()";
}

dashboardRouter.get('/patient/appointments', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'PATIENT') return res.status(403).json({ error: 'Forbidden' });

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
        d.city AS doctor_city
      FROM appointments a
      JOIN doctors d ON d.id = a.doctor_id
      WHERE a.patient_id = ? AND ${toUpcomingWhere()}
      ORDER BY a.scheduled_at ASC`,
      [req.user.patientId]
    );

    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load patient appointments' });
  }
});

dashboardRouter.get('/doctor/appointments', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });

    const [rows] = await pool.query(
      `SELECT
        a.id,
        a.mode,
        a.room_id,
        a.scheduled_at,
        a.status,
        a.notes,
        p.full_name AS patient_name,
        p.email AS patient_email,
        p.phone AS patient_phone
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      WHERE a.doctor_id = ? AND ${toUpcomingWhere()}
      ORDER BY a.scheduled_at ASC`,
      [req.user.doctorId]
    );

    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load doctor appointments' });
  }
});

module.exports = { dashboardRouter };
