CREATE DATABASE IF NOT EXISTS aura_health;
USE aura_health;

CREATE TABLE IF NOT EXISTS patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_patients_email (email)
);

CREATE TABLE IF NOT EXISTS doctors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  specialty VARCHAR(80) NOT NULL,
  city VARCHAR(80) NOT NULL,
  rating DECIMAL(2,1) NOT NULL DEFAULT 4.5,
  review_count INT NOT NULL DEFAULT 0,
  avatar_url VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  doctor_id INT NOT NULL,
  mode ENUM('IN_CLINIC','TELE') NOT NULL,
  scheduled_at DATETIME NOT NULL,
  status ENUM('BOOKED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'BOOKED',
  notes VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_doctor_time_mode (doctor_id, scheduled_at, mode)
);

INSERT INTO doctors (full_name, specialty, city, rating, review_count, avatar_url)
VALUES
  ('Dr. Ananya Kulkarni', 'Cardiologist', 'Bangalore', 4.9, 120, NULL),
  ('Dr. Rohan Mehta', 'General Physician', 'Mumbai', 4.6, 120, NULL),
  ('Dr. Meera Iyer', 'Dermatologist', 'Mumbai', 4.8, 120, NULL),
  ('Dr. Aarav Sharma', 'Pediatrician', 'Delhi', 4.9, 120, NULL);
