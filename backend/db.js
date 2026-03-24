const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

let sslConfig = undefined;

if (process.env.MYSQL_HOST && process.env.MYSQL_HOST.includes('aivencloud')) {
  sslConfig = { rejectUnauthorized: true };
  
  if (process.env.MYSQL_CA_CERT) {
    sslConfig.ca = process.env.MYSQL_CA_CERT;
  } else {
    const caPath = path.join(__dirname, '..', 'ca.pem');
    if (fs.existsSync(caPath)) {
      sslConfig.ca = fs.readFileSync(caPath);
    } else {
      console.warn("Warning: Aiven CA certificate not found. Please place ca.pem in the project root or set MYSQL_CA_CERT in .env.");
    }
  }
}

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: sslConfig
});

module.exports = { pool };
