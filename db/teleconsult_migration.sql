USE aura_health;

ALTER TABLE appointments
  ADD COLUMN room_id VARCHAR(64) NULL,
  ADD UNIQUE KEY uq_room_id (room_id);
