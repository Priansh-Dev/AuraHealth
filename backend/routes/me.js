const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth_middleware');

const meRouter = express.Router();

meRouter.get('/', requireAuth, async (req, res) => {
  try {
    const role = req.user?.role;

    if (role === 'PATIENT') {
      const [rows] = await pool.query(
        'SELECT id, full_name, email, phone FROM patients WHERE id = ?',
        [req.user.patientId]
      );
      if (!rows[0]) return res.status(404).json({ error: 'User not found' });
      return res.json({ data: { role: 'PATIENT', ...rows[0] } });
    }

    if (role === 'DOCTOR') {
      const [rows] = await pool.query(
        'SELECT id, full_name, email, phone, specialty, city FROM doctors WHERE id = ?',
        [req.user.doctorId]
      );
      if (!rows[0]) return res.status(404).json({ error: 'User not found' });
      return res.json({ data: { role: 'DOCTOR', ...rows[0] } });
    }

    return res.status(400).json({ error: 'Invalid role' });
  } catch {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

module.exports = { meRouter };
