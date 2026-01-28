# AuraHealth

AuraHealth is a full-stack appointment booking platform where patients can book appointments with doctors for in-clinic and online consultations.

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js (Express)
- Database: MySQL
- Tele-consultation: WebRTC (signaling via WebSocket)

## Requirements

- Node.js 18+ (recommended)
- MySQL Server + MySQL Workbench

## Project Structure

- `public/`
  - UI pages (`index.html`, `patient.html`, `doctor.html`, `teleconsult.html`)
  - Frontend logic (`app.js`, `dashboard_patient.js`, `dashboard_doctor.js`, `teleconsult.js`)
- `backend/`
  - Express server (`server.js`)
  - DB connector (`db.js`)
  - Routes (`backend/routes/*`)
  - WebRTC signaling (`ws.js`)
- `db/`
  - `schema.sql`
  - `auth_migration.sql`
  - `teleconsult_migration.sql`

## Setup

### 1) Install dependencies

From the project root:

```bash
npm install
```

### 2) Create the database

Open MySQL Workbench and run:

- `db/schema.sql`
- `db/auth_migration.sql`
- `db/teleconsult_migration.sql`

(You can run them in that order.)

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
```

Important:
- If your MySQL password contains `#`, wrap it in quotes (example above) so it doesn’t get treated as a comment.

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

### Dashboards

- Patient dashboard: `patient.html`
- Doctor dashboard: `doctor.html`

### Aura AI (symptom triage)

Endpoint:
- `POST /api/ai/triage`

Example request:

```json
{
  "symptoms": "knee pain",
  "city": ""
}
```

The AI ranks specialties based on symptom keywords and returns matching doctors.

Note: Specialty matching is tolerant of common naming differences (example: `Orthopedic` vs `Orthopedics`).

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

## Scripts

- `npm start` – start the server
- `npm run dev` – start the server (same as start)

## Troubleshooting

- MySQL connection fails:
  - Verify `.env` values
  - Confirm MySQL is running
  - Confirm `MYSQL_PASSWORD` quoting if it contains `#`

- Friend can’t access `http://<your-ip>:3000`:
  - Ensure Windows network profile is Private
  - Allow Node.js through Windows Firewall
  - Ensure both devices are on the same LAN and not on a guest/isolated Wi‑Fi