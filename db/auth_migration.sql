USE aura_health;

ALTER TABLE patients
  ADD COLUMN password_hash VARCHAR(255) NULL;

ALTER TABLE doctors
  ADD COLUMN email VARCHAR(190) NULL,
  ADD COLUMN phone VARCHAR(30) NULL,
  ADD COLUMN password_hash VARCHAR(255) NULL,
  ADD UNIQUE KEY uq_doctors_email (email);
