const pool = require('../config/db');

// GET /api/admin/drivers
const getAllDrivers = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, u.name, u.email, u.phone
       FROM drivers d
       JOIN users u ON d.user_id = u.id
       ORDER BY d.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch drivers', error: err.message });
  }
};

// PATCH /api/admin/approve-driver/:id
const approveDriver = async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'approve' or 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'Action must be approve or reject' });
  }

  try {
    const status = action === 'approve' ? 'Approved' : 'Rejected';
    const { rows } = await pool.query(
      `UPDATE drivers
       SET vetting_status = $1, approved_by = $2
       WHERE id = $3
       RETURNING *`,
      [status, req.user.id, id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Driver not found' });
    res.json({ message: `Driver ${status.toLowerCase()}`, driver: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not update driver', error: err.message });
  }
};

// GET /api/admin/rides
const getAllRides = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              p.name AS passenger_name, p.email AS passenger_email,
              d.name AS driver_name,    d.email AS driver_email
       FROM rides r
       LEFT JOIN users p ON r.passenger_id = p.id
       LEFT JOIN users d ON r.driver_id    = d.id
       ORDER BY r.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch rides', error: err.message });
  }
};

// GET /api/admin/users
const getAllUsers = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, phone, is_verified, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not fetch users', error: err.message });
  }
};

module.exports = { getAllDrivers, approveDriver, getAllRides, getAllUsers };
