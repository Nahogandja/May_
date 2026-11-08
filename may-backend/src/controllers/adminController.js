"use strict";

const pool = require("../config/db");

// GET /api/admin/drivers
const getAllDrivers = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        d.*,
        u.name,
        u.email,
        u.phone,
        u.gender
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      ORDER BY d.created_at DESC
    `);

    return res.json(rows);
  } catch (err) {
    console.error("Fetch drivers error:", err);

    return res.status(500).json({
      message: "Could not fetch drivers",
    });
  }
};

// PATCH /api/admin/approve-driver/:id
const approveDriver = async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body || {};

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({
      message: "Action must be approve or reject",
    });
  }

  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    // Lock the driver record during approval/dismissal.
    const { rows } = await client.query(
      `
      SELECT
        d.*,
        u.gender
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      WHERE d.id = $1
      FOR UPDATE OF d
      `,
      [id]
    );

    if (!rows.length) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Driver not found",
      });
    }

    const driver = rows[0];

    const isDismissal =
      action === "reject" &&
      driver.vetting_status === "Approved";

    // DRIVER APPROVAL VALIDATION
    if (action === "approve") {
      // Previously dismissed drivers cannot be
      // reinstated through ordinary approval.
      if (driver.dismissed_at) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "Dismissed drivers cannot be reapproved through the standard approval action.",
        });
      }

      const required = [
        ["license_number", "licence number"],
        ["vehicle_details", "vehicle description"],
        ["vehicle_color", "vehicle colour"],
        ["plate_number", "vehicle plate number"],
        ["headshot_url", "headshot"],
        ["certified_id_path", "certified ID"],
        [
          "certified_licence_path",
          "certified driver's licence",
        ],
        ["gender", "gender"],
      ];

      const missingFields = required
        .filter(
          ([field]) =>
            !String(driver[field] ?? "").trim()
        )
        .map(([, label]) => label);

      if (missingFields.length) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            `Cannot approve driver. Missing: ${missingFields.join(", ")}.`,
          missingFields,
        });
      }
    }

    // DISMISS AN ALREADY APPROVED DRIVER
    if (isDismissal) {
      const dismissalReason =
        typeof reason === "string"
          ? reason.trim()
          : "";

      if (
        dismissalReason.length < 10 ||
        dismissalReason.length > 500
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "Dismissal reason must contain 10–500 characters.",
        });
      }

      const { rows: updated } = await client.query(
        `
        UPDATE drivers
        SET
          vetting_status = 'Rejected',
          approved_by = $2,
          is_available = FALSE,
          dismissal_reason = $3::text,
          dismissed_by = $2,
          dismissed_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          req.user.id,
          dismissalReason,
        ]
      );

      await client.query("COMMIT");

      console.info(
        `Driver ${id} dismissed by administrator ${req.user.id}`
      );

      return res.status(200).json({
        message:
          "Driver dismissed and blocked from new bookings.",
        driver: updated[0],
      });
    }

    // PREVENT REPEATED REJECTION
    if (
      action === "reject" &&
      driver.vetting_status === "Rejected"
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message: "Driver is already rejected",
      });
    }

    // NORMAL APPROVAL OR REJECTION
    const status =
      action === "approve"
        ? "Approved"
        : "Rejected";

    const { rows: updated } = await client.query(
      `
      UPDATE drivers
      SET
        vetting_status = $2::varchar,
        approved_by = $3,
        is_available = FALSE
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        status,
        req.user.id,
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message:
        `Driver ${status.toLowerCase()} successfully`,
      driver: updated[0],
    });
  } catch (err) {
    if (client) {
      await client
        .query("ROLLBACK")
        .catch(() => {});
    }

    console.error(
      "Driver approval/dismissal error:",
      err
    );

    return res.status(500).json({
      message:
        "Could not update driver approval",
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};

// GET /api/admin/rides
const getAllRides = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        r.*,
        p.name AS passenger_name,
        p.email AS passenger_email,
        d.name AS driver_name,
        d.email AS driver_email
      FROM rides r
      LEFT JOIN users p
        ON p.id = r.passenger_id
      LEFT JOIN users d
        ON d.id = r.driver_id
      ORDER BY r.created_at DESC
    `);

    return res.json(rows);
  } catch (err) {
    console.error(
      "Fetch admin rides error:",
      err
    );

    return res.status(500).json({
      message: "Could not fetch rides",
    });
  }
};

// GET /api/admin/users
const getAllUsers = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        name,
        email,
        role,
        phone,
        emergency_contact_name,
        emergency_contact_phone,
        gender,
        is_verified,
        created_at
      FROM users
      ORDER BY created_at DESC
    `);

    return res.json(rows);
  } catch (err) {
    console.error(
      "Fetch admin users error:",
      err
    );

    return res.status(500).json({
      message: "Could not fetch users",
    });
  }
};

module.exports = {
  getAllDrivers,
  approveDriver,
  getAllRides,
  getAllUsers,
};