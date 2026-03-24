const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireAuth } = require('../auth_middleware');

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

appointmentsRouter.post('/', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'PATIENT') return res.status(403).json({ error: 'Forbidden' });

    const {
      doctorId,
      mode,
      scheduledAt,
      slotId,
      notes,
      patientFullName,
      patientPhone
    } = req.body || {};

    const dId = Number(doctorId);
    if (!Number.isFinite(dId)) return res.status(400).json({ error: 'Invalid doctorId' });

    if (mode !== 'IN_CLINIC' && mode !== 'TELE') {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    const sId = slotId == null ? null : Number(slotId);
    if (slotId != null && !Number.isFinite(sId)) {
      return res.status(400).json({ error: 'Invalid slotId' });
    }

    // Backward-compatible path: allow scheduledAt booking when slotId is not provided.
    let scheduledAtEffective = null;
    if (!sId) {
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
      scheduledAtEffective = scheduledAt;
    }

    const [doctorRows] = await pool.query('SELECT id FROM doctors WHERE id = ?', [dId]);
    if (!doctorRows[0]) return res.status(404).json({ error: 'Doctor not found' });

    const patientId = Number(req.user.patientId);
    if (!Number.isFinite(patientId)) return res.status(401).json({ error: 'Unauthorized' });

    const [patientRows] = await pool.query('SELECT id FROM patients WHERE id = ?', [patientId]);
    if (!patientRows[0]) return res.status(404).json({ error: 'Patient not found' });

    if (patientFullName || patientPhone) {
      await pool.query(
        'UPDATE patients SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone) WHERE id = ?',
        [patientFullName || null, patientPhone || null, patientId]
      );
    }

    const roomId = null;

    let apptIns;
    let usedSlotId = null;

    if (sId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [slotRows] = await conn.query(
          `SELECT id, doctor_id, mode, slot_start, slot_end, capacity, booked_count, status
           FROM doctor_slots
           WHERE id = ?
           FOR UPDATE`,
          [sId]
        );

        const slot = slotRows[0];
        if (!slot) {
          await conn.rollback();
          conn.release();
          return res.status(404).json({ error: 'Slot not found' });
        }

        if (Number(slot.doctor_id) !== dId) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({ error: 'Slot does not belong to this doctor' });
        }

        if (String(slot.mode) !== mode) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({ error: 'Slot mode mismatch' });
        }

        if (String(slot.status || 'ACTIVE') !== 'ACTIVE') {
          await conn.rollback();
          conn.release();
          return res.status(409).json({ error: 'Slot is unavailable' });
        }

        const slotEnd = new Date(slot.slot_end);
        if (!Number.isFinite(slotEnd.getTime()) || slotEnd.getTime() < Date.now()) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({ error: 'Slot is in the past' });
        }

        const capacity = Number(slot.capacity);
        const booked = Number(slot.booked_count);
        if (!Number.isFinite(capacity) || !Number.isFinite(booked) || booked >= capacity) {
          await conn.rollback();
          conn.release();
          return res.status(409).json({ error: 'Slot is fully booked' });
        }

        await conn.query('UPDATE doctor_slots SET booked_count = booked_count + 1 WHERE id = ?', [sId]);

        const scheduledSql = slot.slot_start;
        [apptIns] = await conn.query(
          'INSERT INTO appointments (patient_id, doctor_id, mode, scheduled_at, notes, room_id, slot_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [patientId, dId, mode, scheduledSql, notes || null, roomId, sId]
        );

        await conn.commit();
        usedSlotId = sId;
      } catch (e) {
        try {
          await conn.rollback();
        } catch {
          // ignore
        }
        throw e;
      } finally {
        try {
          conn.release();
        } catch {
          // ignore
        }
      }
    } else {
      [apptIns] = await pool.query(
        'INSERT INTO appointments (patient_id, doctor_id, mode, scheduled_at, notes, room_id) VALUES (?, ?, ?, ?, ?, ?)',
        [patientId, dId, mode, scheduledAtEffective, notes || null, roomId]
      );
    }

    const apptId = apptIns.insertId;

    res.status(201).json({
      data: {
        appointmentId: apptId,
        slotId: usedSlotId,
        roomId,
        joinUrl:
          mode === 'TELE'
            ? `/teleconsult.html?appt=${encodeURIComponent(String(apptId))}`
            : roomId
              ? `/teleconsult.html?room=${encodeURIComponent(roomId)}`
              : null
      }
    });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This slot is already booked' });
    }
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

appointmentsRouter.get('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await pool.query(
      'SELECT id, patient_id, doctor_id, mode, room_id, scheduled_at, status, notes FROM appointments WHERE id = ?',
      [id]
    );
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'Appointment not found' });

    if (req.user?.role === 'PATIENT' && Number(req.user.patientId) !== a.patient_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (req.user?.role === 'DOCTOR' && Number(req.user.doctorId) !== a.doctor_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ data: a });
  } catch {
    res.status(500).json({ error: 'Failed to load appointment' });
  }
});

appointmentsRouter.post('/:id/accept', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const doctorId = Number(req.user.doctorId);
    const [rows] = await pool.query(
      'SELECT id, mode, room_id, status FROM appointments WHERE id = ? AND doctor_id = ?',
      [id, doctorId]
    );
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'Appointment not found' });
    if (a.mode !== 'TELE') return res.status(400).json({ error: 'Not a tele-consult appointment' });
    if (a.status !== 'BOOKED') return res.status(400).json({ error: 'Appointment not active' });

    if (!a.room_id) {
      const roomId = makeRoomId();
      await pool.query('UPDATE appointments SET room_id = ? WHERE id = ? AND room_id IS NULL', [roomId, id]);
    }

    const [updated] = await pool.query('SELECT room_id FROM appointments WHERE id = ?', [id]);
    const roomId = updated[0]?.room_id || null;

    res.json({
      data: {
        appointmentId: id,
        roomId,
        joinUrl: roomId ? `/teleconsult.html?appt=${encodeURIComponent(String(id))}` : null
      }
    });
  } catch {
    res.status(500).json({ error: 'Failed to accept appointment' });
  }
});

appointmentsRouter.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'DOCTOR') return res.status(403).json({ error: 'Forbidden' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const doctorId = Number(req.user.doctorId);
    await pool.query(
      "UPDATE appointments SET status = 'COMPLETED' WHERE id = ? AND doctor_id = ? AND status = 'BOOKED'",
      [id, doctorId]
    );

    res.json({ data: { appointmentId: id, status: 'COMPLETED' } });
  } catch {
    res.status(500).json({ error: 'Failed to complete appointment' });
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
