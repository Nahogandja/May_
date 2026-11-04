const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const validPhone = (value) => /^\+?[0-9][0-9 +()\-]{6,20}$/.test(String(value || '').trim());

const register = async (req, res) => {
  const { name, email, password, phone, role, emergencyContactName, emergencyContactPhone, gender } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  if (!validPhone(phone)) {
    return res.status(400).json({ message: 'A valid phone number is required for both passengers and drivers' });
  }

  const contactName = String(emergencyContactName || '').trim();
  const contactPhone = String(emergencyContactPhone || '').trim();
  if (!contactName || !/^\+?[0-9][0-9 +()\-]{6,20}$/.test(contactPhone)) {
    return res.status(400).json({ message: 'Emergency contact name and valid phone number are required' });
  }
  const allowedRoles = ['Passenger', 'Driver'];
  const assignedRole = allowedRoles.includes(role) ? role : 'Passenger';

  if (assignedRole === 'Driver' && !['Female', 'Male', 'Other', 'Prefer not to say'].includes(gender)) {
    return res.status(400).json({ message: 'Please select your gender for the driver profile' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password, phone, role, emergency_contact_name, emergency_contact_phone, gender)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, email, role`,
      [name, email.toLowerCase(), hashed, String(phone).trim(), assignedRole, contactName, contactPhone, assignedRole === 'Driver' ? gender : null]
    );

    const user = rows[0];

    if (assignedRole === 'Driver') {
      await pool.query(
        `INSERT INTO drivers (user_id, vetting_status, background_check, is_available)
         VALUES ($1, 'Pending', false, false)`,
        [user.id]
      );
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ message: 'Registration successful', token, user });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!rows.length) return res.status(401).json({ message: 'Invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
};

// PATCH /api/auth/change-password  (requires auth middleware — req.user is set)
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }

  try {
    // req.user only has non-sensitive columns (see authMiddleware), so fetch the hash fresh
    const { rows } = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    const match = await bcrypt.compare(currentPassword, rows[0].password);
    if (!match) return res.status(401).json({ message: 'Current password is incorrect' });

    const sameAsOld = await bcrypt.compare(newPassword, rows[0].password);
    if (sameAsOld) {
      return res.status(400).json({ message: 'New password must be different from the current password' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user.id]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Could not update password', error: err.message });
  }
};

const updateEmergencyContact = async (req, res) => {
  const name = String(req.body?.emergencyContactName || '').trim();
  const phone = String(req.body?.emergencyContactPhone || '').trim();
  if (!name || !/^\+?[0-9][0-9 +()\-]{6,20}$/.test(phone)) {
    return res.status(400).json({ message: 'Provide a valid emergency contact name and phone number' });
  }
  try {
    await pool.query(`UPDATE users SET emergency_contact_name=$1, emergency_contact_phone=$2 WHERE id=$3`, [name, phone, req.user.id]);
    res.json({ message: 'Emergency contact saved' });
  } catch (err) { res.status(500).json({ message: 'Could not save contact' }); }
};
const updateMyPhone = async (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  if (!validPhone(phone)) return res.status(400).json({ message: 'Enter a valid phone number' });
  try {
    await pool.query('UPDATE users SET phone=$1 WHERE id=$2', [phone, req.user.id]);
    return res.json({ message: 'Phone number saved', phone });
  } catch (error) { return res.status(500).json({ message: 'Could not update phone number' }); }
};

const mySafetyProfile = async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT phone, emergency_contact_name, emergency_contact_phone, gender FROM users WHERE id=$1`, [req.user.id]);
    res.json({ profile: rows[0] || {} });
  } catch (_) { res.status(500).json({ message: 'Could not load safety profile' }); }
};
module.exports = { register, login, changePassword, updateEmergencyContact, mySafetyProfile, updateMyPhone };
