const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const http = require('http');
const express = require('express');
const cors = require('cors');
 
const { pool } = require('./db');

const { attachWebRtcSignaling } = require('./ws');

const { authRouter } = require('./routes/auth');
const { aiRouter } = require('./routes/ai');
const { meRouter } = require('./routes/me');
const { dashboardRouter } = require('./routes/dashboard');
const { doctorsRouter } = require('./routes/doctors');
const { appointmentsRouter } = require('./routes/appointments');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/ai', aiRouter);
app.use('/api/me', meRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/doctors', doctorsRouter);
app.use('/api/appointments', appointmentsRouter);

pool
  .query('SELECT 1')
  .then(() => {
    console.log('MySQL connection: OK');
  })
  .catch((err) => {
    console.error('MySQL connection: FAILED');
    console.error(err);
  });

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = Number(process.env.PORT || 3000);

const server = http.createServer(app);
attachWebRtcSignaling(server);

server.listen(port, () => {
  console.log(`AuraHealth running on http://localhost:${port}`);
});
