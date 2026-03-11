# AuraHealth

AuraHealth is a full-stack appointment booking platform where patients can book appointments with doctors for in-clinic and online consultations.

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js (Express)
- Database: MySQL
- Tele-consultation: WebRTC (signaling via WebSocket)
- AI: Google Gemini for symptom triage

## Requirements

- Node.js 18+ (recommended)
- MySQL Server + MySQL Workbench
- Google Gemini API key (for Aura AI features)

## Project Structure

- `public/`
  - UI pages (`index.html`, `patient.html`, `doctor.html`, `teleconsult.html`)
  - Frontend logic (`app.js`, `dashboard_patient.js`, `dashboard_doctor.js`, `teleconsult.js`)
  - Styles (`styles.css`)
- `backend/`
  - Express server (`server.js`)
  - DB connector (`db.js`)
  - Auth middleware (`auth_middleware.js`)
  - WebRTC signaling (`ws.js`)
  - Routes:
    - `auth.js` - Registration/login
    - `doctors.js` - Doctor discovery
    - `appointments.js` - Booking
    - `availability.js` - Doctor availability & slots
    - `dashboard.js` - Patient/doctor dashboards
    - `ai.js` - Aura AI triage
    - `me.js` - Current user info
- `db/`
  - `schema.sql` - Core tables
  - `auth_migration.sql` - Auth system
  - `teleconsult_migration.sql` - Tele-consultation
  - `availability_slots_migration.sql` - Availability & slot management

## Setup

### 1) Install dependencies

From the project root:

```bash
npm install
```

### 2) Create the database

Open MySQL Workbench and run in this order:

1. `db/schema.sql`
2. `db/auth_migration.sql`
3. `db/teleconsult_migration.sql`
4. `db/availability_slots_migration.sql`

### 3) Configure environment variables

Create a `.env` file in the project root (same folder as `package.json`) and set:

```env
PORT=3000
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD="YOUR_PASSWORD_HERE"
MYSQL_DATABASE=aura_health
JWT_SECRET=dev_secret_change_me

# Gemini (Aura AI)
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-1.5-flash
```

Important:
- If your MySQL password contains `#`, wrap it in quotes (example above) so it doesn't get treated as a comment.
- Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey) for Aura AI features.

### 4) Start the server

```bash
npm start
```

Open:

- `http://localhost:3000`

## Features

### Authentication

- Patient and doctor registration/login
- JWT-based auth

Useful endpoints:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`

### Doctor discovery

- `GET /api/doctors` (lists doctors)

### Appointments

- `POST /api/appointments` (book)
- `GET /api/appointments` (list)
- `PATCH /api/appointments/:id/cancel` (cancel)

### Doctor Availability

Doctors can set weekly recurring availability rules and manage time slots:

- `GET /api/availability/me` (get my availability rules)
- `PUT /api/availability/me` (update availability rules)
- `GET /api/availability/me/slots` (view my slots for a date)
- `POST /api/availability/me/slots/:id/cancel` (cancel a slot)
- `POST /api/availability/me/slots/cancel-range` (cancel multiple slots)
- `GET /api/availability/doctor/:id/slots` (patient view: available slots)
- `GET /api/availability/me/unavailability` (view unavailability blocks)
- `POST /api/availability/me/unavailability` (add unavailability)
- `DELETE /api/availability/me/unavailability/:id` (remove unavailability)

### Dashboards

- Patient dashboard: `patient.html`
  - `GET /api/dashboard/patient/appointments`
- Doctor dashboard: `doctor.html`
  - `GET /api/dashboard/doctor/appointments`

### Aura AI (symptom triage)

Powered by Google Gemini AI for intelligent symptom analysis.

Endpoint:
- `POST /api/ai/triage`

Example request:

```json
{
  "symptoms": "knee pain",
  "city": ""
}
```

The AI analyzes symptoms using Gemini and returns recommended specialties with matching doctors.

Note: Requires `GEMINI_API_KEY` in `.env`.

### Tele-consultation (WebRTC)

- Page: `teleconsult.html`
- Uses WebRTC for audio/video + WebSocket signaling (server attaches signaling in `backend/ws.js`).

#### Testing on the same laptop

- Open two browser windows (or an Incognito window for the second user)
- Login as doctor in one and patient in the other
- Join the same room

#### Testing with a friend on the same Wi‑Fi

1. Find your local IP (example: `192.168.x.x`)
2. Start the server
3. Your friend opens:

- `http://YOUR_LOCAL_IP:3000`

Important:
- Many browsers block camera/mic on plain HTTP for non-localhost. For reliable camera/mic access on another device, use HTTPS (e.g., a secure tunnel) or a browser configuration that explicitly allows the insecure origin.

## Dependencies

- `express` - Web framework
- `mysql2` - MySQL client
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT auth
- `dotenv` - Environment variables
- `cors` - CORS middleware
- `ws` - WebSocket for WebRTC signaling

## Scripts

- `npm start` – start the server
- `npm run dev` – start the server (same as start)

## Troubleshooting

- MySQL connection fails:
  - Verify `.env` values
  - Confirm MySQL is running
  - Confirm `MYSQL_PASSWORD` quoting if it contains `#`
  - Ensure all migration files are executed in order

- Aura AI not working:
  - Verify `GEMINI_API_KEY` is set in `.env`
  - Check API key is valid at [Google AI Studio](https://aistudio.google.com/)

- Friend can't access `http://<your-ip>:3000`:
  - Ensure Windows network profile is Private
  - Allow Node.js through Windows Firewall
  - Ensure both devices are on the same LAN and not on a guest/isolated Wi‑Fi
