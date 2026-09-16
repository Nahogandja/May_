// One-off script to create the first Admin account.
// There is no public signup path for Admins (by design), so this is how
// you create the account that can log into the Admin dashboard.
//
// Run it once from the may-backend folder:
//   node src/config/seedAdmin.js
//
// You can safely delete this file afterward, or keep it and just change
// the details below any time you need to add another Admin manually.

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

// ── Edit these before running ──────────────────────────────
const ADMIN_NAME     = 'MAY Admin';
const ADMIN_EMAIL    = 'admin@mayapp.com';
const ADMIN_PASSWORD = 'ChangeMe123!';   // change this, then change it again after first login
const ADMIN_PHONE    = null;
// ────────────────────────────────────────────────────────────

const seedAdmin = async () => {
  const client = await pool.connect();
  try {
    const email = ADMIN_EMAIL.toLowerCase();

    const existing = await client.query('SELECT id, role FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      console.log(`A user with email ${email} already exists (role: ${existing.rows[0].role}). No changes made.`);
      return;
    }

    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const { rows } = await client.query(
      `INSERT INTO users (name, email, password, phone, role, is_verified)
       VALUES ($1, $2, $3, $4, 'Admin', true)
       RETURNING id, name, email, role`,
      [ADMIN_NAME, email, hashed, ADMIN_PHONE]
    );

    console.log('Admin user created:');
    console.log(rows[0]);
    console.log(`Log in with email: ${email} and the password you set in this script.`);
  } catch (err) {
    console.error('Failed to create admin:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
};

seedAdmin();
