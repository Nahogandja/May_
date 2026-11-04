
const pool = require('../config/db');

// GET /api/admin/drivers
const getAllDrivers = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         d.*,
         u.name,
         u.email,
         u.phone,
         u.gender
       FROM drivers d
       JOIN users u ON d.user_id = u.id
       ORDER BY d.created_at DESC`
    );

    res.json(rows);
  } catch (err) {
    console.error('Fetch drivers error:', err);

    res.status(500).json({
      message: 'Could not fetch drivers',
      error: err.message,
    });
  }
};

// PATCH /api/admin/approve-driver/:id
const approveDriver = async (req, res) => {
  const { id } = req.params;
  const { action } = req.body || {};

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({
      message: 'Action must be approve or reject',
    });
  }

  const status = action === 'approve'
    ? 'Approved'
    : 'Rejected';

  try {
    if (action === 'approve') {
      const {rows: complete}=await pool.query(`SELECT d.license_number,d.vehicle_details,d.vehicle_color,
        d.plate_number,d.headshot_url,d.certified_id_path,d.certified_licence_path,u.gender
        FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.id=$1`,[id]);
      if (!complete.length) return res.status(404).json({message:'Driver not found'});
      const p=complete[0];
      const required = [
        ['license_number', 'licence number'],
        ['vehicle_details', 'vehicle description'],
        ['vehicle_color', 'vehicle colour'],
        ['plate_number', 'vehicle plate number'],
        ['headshot_url', 'headshot'],
        ['certified_id_path', 'certified ID'],
        ['certified_licence_path', "certified driver's licence"],
        ['gender', 'gender']
      ];
      const missingFields = required
        .filter(([field]) => !String(p[field] ?? '').trim())
        .map(([, label]) => label);
      if (missingFields.length) {
        return res.status(409).json({
          message: `Cannot approve driver. Missing: ${missingFields.join(', ')}.`,
          missingFields
        });
      }
    }
    const { rows } = await pool.query(
      `UPDATE drivers
       SET
         vetting_status = $1::VARCHAR,
         approved_by = $2,
         is_available = CASE
           WHEN $1::VARCHAR = 'Rejected' THEN FALSE
           ELSE is_available
         END
       WHERE id = $3
       RETURNING *`,
      [status, req.user.id, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: 'Driver not found',
      });
    }

    const updatedDriver = rows[0];

    console.log(
      `Driver ${id} updated to ${status}`
    );

    return res.status(200).json({
      message: `Driver ${status.toLowerCase()} successfully`,
      driver: updatedDriver,
    });
  } catch (err) {
    console.error('Driver approval error:', err);

    return res.status(500).json({
      message: 'Could not update driver approval',
      error: err.message,
    });
  }
};

// GET /api/admin/rides
const getAllRides = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         r.*,
         p.name AS passenger_name,
         p.email AS passenger_email,
         d.name AS driver_name,
         d.email AS driver_email
       FROM rides r
       LEFT JOIN users p ON r.passenger_id = p.id
       LEFT JOIN users d ON r.driver_id = d.id
       ORDER BY r.created_at DESC`
    );

    res.json(rows);
  } catch (err) {
    console.error('Fetch admin rides error:', err);

    res.status(500).json({
      message: 'Could not fetch rides',
      error: err.message,
    });
  }
};

// GET /api/admin/users
const getAllUsers = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         id,
         name,
         email,
         role,
         phone, emergency_contact_name, emergency_contact_phone, gender,
         is_verified,
         created_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json(rows);
  } catch (err) {
    console.error('Fetch admin users error:', err);

    res.status(500).json({
      message: 'Could not fetch users',
      error: err.message,
    });
  }
};

module.exports = {
  getAllDrivers,
  approveDriver,
  getAllRides,
  getAllUsers,
};
