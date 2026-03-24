const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth_middleware');

const availabilityRouter = express.Router();

function isValidDow(d) {
  return Number.isInteger(d) && d >= 0 && d <= 6;
}

function isValidTimeString(s) {
  return typeof s === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(s);
}

function toTimeHHMMSS(s) {
  if (!isValidTimeString(s)) return null;
  return s.length === 5 ? `${s}:00` : s;
}

function minutesBetween(t1, t2) {
  const [h1, m1] = t1.split(':').map((x) => Number(x));
  const [h2, m2] = t2.split(':').map((x) => Number(x));
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function fmtSqlDateTime(d) {
  const pad2 = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

function localStartOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function buildDateAtTime(day, timeHHMMSS) {
  const [hh, mm, ss] = timeHHMMSS.split(':').map((x) => Number(x));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm, ss || 0, 0);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

async function ensureSlotsForDoctor({ doctorId, mode, daysAhead = 7 }) {
  const [rules] = await pool.query(
    `SELECT id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot
     FROM doctor_availability_rules
     WHERE doctor_id = ? AND mode = ?`,
    [doctorId, mode]
  );

  if (!rules.length) return;

  const [blocks] = await pool.query(
    `SELECT id, start_at, end_at
     FROM doctor_unavailability
     WHERE doctor_id = ? AND mode = ?
       AND end_at > NOW()
       AND start_at < DATE_ADD(NOW(), INTERVAL ? DAY)
     ORDER BY start_at ASC`,
    [doctorId, mode, daysAhead]
  );

  const blockRanges = (blocks || [])
    .map((b) => ({
      start: new Date(b.start_at),
      end: new Date(b.end_at)
    }))
    .filter((b) => Number.isFinite(b.start.getTime()) && Number.isFinite(b.end.getTime()) && b.end > b.start);

  const now = new Date();
  const startDay = localStartOfDay(now);
  const endDay = localStartOfDay(addMinutes(startDay, daysAhead * 24 * 60));

  for (let i = 0; i < daysAhead; i++) {
    const day = addMinutes(startDay, i * 24 * 60);
    const dow = day.getDay();

    const dayRules = rules.filter((r) => Number(r.day_of_week) === dow);
    if (!dayRules.length) continue;

    for (const r of dayRules) {
      const startTime = String(r.start_time).slice(0, 8);
      const endTime = String(r.end_time).slice(0, 8);
      const slotMinutes = Number(r.slot_minutes || 30);
      const capacity = Number(r.capacity_per_slot);

      if (!Number.isFinite(slotMinutes) || slotMinutes <= 0) continue;
      if (!Number.isFinite(capacity) || capacity <= 0) continue;

      const total = minutesBetween(startTime.slice(0, 5), endTime.slice(0, 5));
      if (total <= 0) continue;

      const slotsCount = Math.floor(total / slotMinutes);
      if (slotsCount <= 0) continue;

      for (let s = 0; s < slotsCount; s++) {
        const slotStart = addMinutes(buildDateAtTime(day, startTime), s * slotMinutes);
        const slotEnd = addMinutes(slotStart, slotMinutes);

        if (slotEnd <= now) continue;
        if (slotStart < startDay || slotStart >= endDay) continue;

        const isBlocked = blockRanges.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
        if (isBlocked) continue;

        await pool.query(
          `INSERT INTO doctor_slots (doctor_id, mode, slot_start, slot_end, capacity, status)
           VALUES (?, ?, ?, ?, ?, 'ACTIVE')
           ON DUPLICATE KEY UPDATE
             capacity = IF(status = 'ACTIVE', VALUES(capacity), capacity)`,
          [doctorId, mode, fmtSqlDateTime(slotStart), fmtSqlDateTime(slotEnd), capacity]
        );
      }
    }
  }
}

availabilityRouter.get('/me', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });

    const doctorId = Number(req.user.doctorId);
    const [rows] = await pool.query(
      `SELECT id, mode, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot
       FROM doctor_availability_rules
       WHERE doctor_id = ?
       ORDER BY mode, day_of_week, start_time`,
      [doctorId]
    );

    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load availability' });
  }
});

availabilityRouter.get('/me/unavailability', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });
    const doctorId = Number(req.user.doctorId);

    const [rows] = await pool.query(
      `SELECT id, mode, start_at, end_at, created_at
       FROM doctor_unavailability
       WHERE doctor_id = ?
       ORDER BY start_at ASC`,
      [doctorId]
    );

    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load unavailability' });
  }
});

availabilityRouter.post('/me/unavailability', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });
    const doctorId = Number(req.user.doctorId);

    const mode = String(req.body?.mode || '').trim();
    const startAt = new Date(req.body?.start_at);
    const endAt = new Date(req.body?.end_at);

    if (mode !== 'IN_CLINIC' && mode !== 'TELE') return res.status(400).json({ error: 'Invalid mode' });
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
      return res.status(400).json({ error: 'Invalid start_at/end_at' });
    }

    await pool.query(
      `INSERT INTO doctor_unavailability (doctor_id, mode, start_at, end_at)
       VALUES (?, ?, ?, ?)`,
      [doctorId, mode, fmtSqlDateTime(startAt), fmtSqlDateTime(endAt)]
    );

    await pool.query(
      `UPDATE doctor_slots
       SET status = 'CANCELLED'
       WHERE doctor_id = ? AND mode = ?
         AND booked_count = 0
         AND status = 'ACTIVE'
         AND slot_start < ?
         AND slot_end > ?`,
      [doctorId, mode, fmtSqlDateTime(endAt), fmtSqlDateTime(startAt)]
    );

    res.json({ data: { ok: true } });
  } catch {
    res.status(500).json({ error: 'Failed to save unavailability' });
  }
});

availabilityRouter.delete('/me/unavailability/:id', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });
    const doctorId = Number(req.user.doctorId);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    await pool.query('DELETE FROM doctor_unavailability WHERE id = ? AND doctor_id = ?', [id, doctorId]);
    res.json({ data: { ok: true } });
  } catch {
    res.status(500).json({ error: 'Failed to delete unavailability' });
  }
});

availabilityRouter.get('/me/slots', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });
    const doctorId = Number(req.user.doctorId);

    const mode = String(req.query.mode || '').trim();
    const dateKey = String(req.query.date || '').trim();
    if (mode !== 'IN_CLINIC' && mode !== 'TELE') return res.status(400).json({ error: 'mode is required (IN_CLINIC or TELE)' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

    const start = new Date(`${dateKey}T00:00:00`);
    const end = addMinutes(start, 24 * 60);

    await ensureSlotsForDoctor({ doctorId, mode, daysAhead: 7 });

    const [rows] = await pool.query(
      `SELECT id, slot_start, slot_end, capacity, booked_count, status
       FROM doctor_slots
       WHERE doctor_id = ? AND mode = ?
         AND slot_start >= ? AND slot_start < ?
       ORDER BY slot_start ASC`,
      [doctorId, mode, fmtSqlDateTime(start), fmtSqlDateTime(end)]
    );

    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load slots' });
  }
});

availabilityRouter.post('/me/slots/:id/cancel', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });
    const doctorId = Number(req.user.doctorId);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid slot id' });

    const [rows] = await pool.query(
      `SELECT id, booked_count, status
       FROM doctor_slots
       WHERE id = ? AND doctor_id = ?`,
      [id, doctorId]
    );

    const slot = rows[0];
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    if (Number(slot.booked_count) > 0) return res.status(409).json({ error: 'Cannot cancel: slot has bookings' });
    if (String(slot.status) === 'CANCELLED') return res.json({ data: { ok: true } });

    await pool.query(`UPDATE doctor_slots SET status = 'CANCELLED' WHERE id = ? AND doctor_id = ?`, [id, doctorId]);
    res.json({ data: { ok: true } });
  } catch {
    res.status(500).json({ error: 'Failed to cancel slot' });
  }
});

availabilityRouter.post('/me/slots/cancel-range', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });
    const doctorId = Number(req.user.doctorId);

    const mode = String(req.body?.mode || '').trim();
    const startAt = new Date(req.body?.start_at);
    const endAt = new Date(req.body?.end_at);

    if (mode !== 'IN_CLINIC' && mode !== 'TELE') return res.status(400).json({ error: 'Invalid mode' });
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
      return res.status(400).json({ error: 'Invalid start_at/end_at' });
    }

    const [result] = await pool.query(
      `UPDATE doctor_slots
       SET status = 'CANCELLED'
       WHERE doctor_id = ? AND mode = ?
         AND booked_count = 0
         AND status = 'ACTIVE'
         AND slot_start >= ?
         AND slot_start < ?`,
      [doctorId, mode, fmtSqlDateTime(startAt), fmtSqlDateTime(endAt)]
    );

    res.json({ data: { ok: true, cancelled: Number(result?.affectedRows || 0) } });
  } catch {
    res.status(500).json({ error: 'Failed to cancel slots' });
  }
});

availabilityRouter.put('/me', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });

    const doctorId = Number(req.user.doctorId);
    const rules = Array.isArray(req.body?.rules) ? req.body.rules : null;
    if (!rules) return res.status(400).json({ error: 'rules array is required' });

    const normalized = [];
    for (const r of rules) {
      const mode = r?.mode;
      const day = Number(r?.day_of_week);
      const start = toTimeHHMMSS(r?.start_time);
      const end = toTimeHHMMSS(r?.end_time);
      const slotMinutes = Number(r?.slot_minutes ?? 30);
      const capacity = Number(r?.capacity_per_slot);

      if (mode !== 'IN_CLINIC' && mode !== 'TELE') {
        return res.status(400).json({ error: 'Invalid mode in rules' });
      }
      if (!isValidDow(day)) return res.status(400).json({ error: 'Invalid day_of_week in rules' });
      if (!start || !end) return res.status(400).json({ error: 'Invalid start_time/end_time in rules' });
      if (!Number.isFinite(slotMinutes) || slotMinutes !== 30) {
        return res.status(400).json({ error: 'slot_minutes must be 30' });
      }
      if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 50) {
        return res.status(400).json({ error: 'capacity_per_slot must be between 1 and 50' });
      }
      const dur = minutesBetween(start.slice(0, 5), end.slice(0, 5));
      if (dur <= 0) return res.status(400).json({ error: 'end_time must be after start_time' });
      if (dur < 30) return res.status(400).json({ error: 'time range must be at least 30 minutes' });

      normalized.push({ mode, day, start, end, slotMinutes, capacity });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM doctor_availability_rules WHERE doctor_id = ?', [doctorId]);
      for (const r of normalized) {
        await conn.query(
          `INSERT INTO doctor_availability_rules
           (doctor_id, mode, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [doctorId, r.mode, r.day, r.start, r.end, r.slotMinutes, r.capacity]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Pre-generate slots for next 7 days for both modes
    await ensureSlotsForDoctor({ doctorId, mode: 'IN_CLINIC', daysAhead: 7 });
    await ensureSlotsForDoctor({ doctorId, mode: 'TELE', daysAhead: 7 });

    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save availability' });
  }
});

availabilityRouter.get('/doctor/:id/slots', async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    if (!Number.isFinite(doctorId)) return res.status(400).json({ error: 'Invalid doctor id' });

    const mode = String(req.query.mode || '').trim();
    if (mode !== 'IN_CLINIC' && mode !== 'TELE') {
      return res.status(400).json({ error: 'mode is required (IN_CLINIC or TELE)' });
    }

    await ensureSlotsForDoctor({ doctorId, mode, daysAhead: 7 });

    const [rows] = await pool.query(
      `SELECT id, slot_start, slot_end, capacity, booked_count
       FROM doctor_slots
       WHERE doctor_id = ? AND mode = ?
         AND slot_end > NOW()
         AND slot_start < DATE_ADD(NOW(), INTERVAL 7 DAY)
         AND status = 'ACTIVE'
         AND booked_count < capacity
       ORDER BY slot_start ASC`,
      [doctorId, mode]
    );

    res.json({ data: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load slots' });
  }
});

module.exports = { availabilityRouter };
