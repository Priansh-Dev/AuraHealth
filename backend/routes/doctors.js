const express = require('express');
const { pool } = require('../db');

const doctorsRouter = express.Router();

doctorsRouter.get('/', async (req, res) => {
  try {
    const city = (req.query.city || '').trim();

    const params = [];
    let sql =
      'SELECT id, full_name, specialty, city, rating, review_count, avatar_url FROM doctors';

    if (city) {
      sql += ' WHERE city = ?';
      params.push(city);
    }

    sql += ' ORDER BY rating DESC, review_count DESC, full_name ASC';

    const [rows] = await pool.query(sql, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load doctors' });
  }
});

doctorsRouter.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await pool.query(
      'SELECT id, full_name, specialty, city, rating, review_count, avatar_url FROM doctors WHERE id = ?',
      [id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Doctor not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load doctor' });
  }
});

module.exports = { doctorsRouter };
