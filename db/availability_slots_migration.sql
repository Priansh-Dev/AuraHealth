USE aura_health;

-- 1) Availability rules (weekly recurring)
CREATE TABLE IF NOT EXISTS doctor_availability_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  mode ENUM('IN_CLINIC','TELE') NOT NULL,
  day_of_week TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_minutes INT NOT NULL DEFAULT 30,
  capacity_per_slot INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_availability_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  INDEX ix_availability_doctor_mode_day (doctor_id, mode, day_of_week)
);

-- 2) Generated slots (next 7 days)
CREATE TABLE IF NOT EXISTS doctor_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  mode ENUM('IN_CLINIC','TELE') NOT NULL,
  slot_start DATETIME NOT NULL,
  slot_end DATETIME NOT NULL,
  capacity INT NOT NULL,
  booked_count INT NOT NULL DEFAULT 0,
  status ENUM('ACTIVE','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_slots_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  UNIQUE KEY uq_doctor_mode_slot_start (doctor_id, mode, slot_start),
  INDEX ix_slots_start (slot_start)
);

SET @slot_status_col_exists := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'doctor_slots'
    AND column_name = 'status'
);

SET @add_slot_status_sql := IF(
  @slot_status_col_exists > 0,
  'SELECT 1',
  'ALTER TABLE doctor_slots ADD COLUMN status ENUM(\'ACTIVE\',\'CANCELLED\') NOT NULL DEFAULT \'ACTIVE\''
);

PREPARE stmt FROM @add_slot_status_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_slots_doc_mode_start_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'doctor_slots'
    AND index_name = 'ix_slots_doctor_mode_start'
);

SET @create_slots_doc_mode_start_sql := IF(
  @idx_slots_doc_mode_start_exists > 0,
  'SELECT 1',
  'CREATE INDEX ix_slots_doctor_mode_start ON doctor_slots (doctor_id, mode, slot_start)'
);

PREPARE stmt FROM @create_slots_doc_mode_start_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS doctor_unavailability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doctor_id INT NOT NULL,
  mode ENUM('IN_CLINIC','TELE') NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_unavailability_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  INDEX ix_unavailability_doctor_mode_start (doctor_id, mode, start_at),
  INDEX ix_unavailability_range (start_at, end_at)
);

-- 3) Link appointments to a slot (supports capacity > 1 per slot)
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'appointments'
    AND column_name = 'slot_id'
);

SET @add_col_sql := IF(
  @col_exists > 0,
  'SELECT 1',
  'ALTER TABLE appointments ADD COLUMN slot_id INT NULL'
);

PREPARE stmt FROM @add_col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(1)
  FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'appointments'
    AND constraint_name = 'fk_appointments_slot'
    AND constraint_type = 'FOREIGN KEY'
);

SET @add_fk_sql := IF(
  @fk_exists > 0,
  'SELECT 1',
  'ALTER TABLE appointments ADD CONSTRAINT fk_appointments_slot FOREIGN KEY (slot_id) REFERENCES doctor_slots(id) ON DELETE SET NULL'
);

PREPARE stmt FROM @add_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) Ensure the FK columns have their own indexes.
-- MySQL may be using uq_doctor_time_mode to satisfy FK index requirements.

SET @idx_doctor_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'appointments'
    AND index_name = 'ix_appointments_doctor_id'
);

SET @create_doctor_idx_sql := IF(
  @idx_doctor_exists > 0,
  'SELECT 1',
  'CREATE INDEX ix_appointments_doctor_id ON appointments (doctor_id)'
);

PREPARE stmt FROM @create_doctor_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_patient_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'appointments'
    AND index_name = 'ix_appointments_patient_id'
);

SET @create_patient_idx_sql := IF(
  @idx_patient_exists > 0,
  'SELECT 1',
  'CREATE INDEX ix_appointments_patient_id ON appointments (patient_id)'
);

PREPARE stmt FROM @create_patient_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5) Remove the old uniqueness constraint that prevents multiple bookings per slot
-- (Required to support capacity > 1)

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'appointments'
    AND index_name = 'uq_doctor_time_mode'
);

SET @drop_sql := IF(
  @idx_exists > 0,
  'ALTER TABLE appointments DROP INDEX uq_doctor_time_mode',
  'SELECT 1'
);

PREPARE stmt FROM @drop_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
