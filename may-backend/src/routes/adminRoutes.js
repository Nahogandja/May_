"use strict";

const express = require("express");
const path = require("node:path");
const fs = require("node:fs/promises");

const pool = require("../config/db");

const auth = require("../middleware/authMiddleware");
const permit = require("../middleware/roleMiddleware");

const {
  getAllDrivers,
  approveDriver,
  getAllRides,
  getAllUsers,
} = require("../controllers/adminController");

const {
  listEmergencyAlerts,
  updateEmergencyAlert,
  recordEscalation,
} = require("../controllers/emergencyController");

const {
  listPayments,
} = require("../controllers/adminPaymentController");

const {
  listSafetyAlerts,
  reviewSafetyAlert,
} = require("../controllers/rideSafetyController");

const router = express.Router();

// All routes require an authenticated administrator.
router.use(auth);
router.use(permit("Admin"));

const UPLOAD_ROOT = path.resolve(
  __dirname,
  "../../uploads"
);

const DOCUMENT_FIELD = Object.freeze({
  id: "certified_id_path",
  licence: "certified_licence_path",
  headshot: "headshot_url",
});

// Resolve locally stored upload filenames.
// Supports legacy filenames and upload subdirectories.
function candidatePaths(stored) {
  const normalized = String(stored)
    .split(/[?#]/)[0]
    .replace(/\\/g, "/");

  const lower = normalized.toLowerCase();

  const marker = lower.lastIndexOf("/uploads/");

  const relative =
    marker >= 0
      ? normalized.slice(
          marker + "/uploads/".length
        )
      : lower.startsWith("uploads/")
      ? normalized.slice("uploads/".length)
      : path.posix.basename(normalized);

  const filename =
    path.posix.basename(normalized);

  return [
    ...new Set([
      relative,
      `verification/${filename}`,
      `headshots/${filename}`,
      `drivers/${filename}`,
      `profiles/${filename}`,
      filename,
    ]),
  ];
}

// GET /api/admin/driver-document/:driverId/:kind
router.get(
  "/driver-document/:driverId/:kind",
  async (req, res) => {
    const field =
      Object.prototype.hasOwnProperty.call(
        DOCUMENT_FIELD,
        req.params.kind
      )
        ? DOCUMENT_FIELD[req.params.kind]
        : null;

    if (!field) {
      return res.status(400).json({
        message: "Unknown document type",
      });
    }

    try {
      const { rows } = await pool.query(
        `
        SELECT
          ${field} AS filename
        FROM drivers
        WHERE id = $1
        `,
        [req.params.driverId]
      );

      if (!rows[0]?.filename) {
        return res.status(404).json({
          message: "Document not available",
        });
      }

      const realRoot = await fs
        .realpath(UPLOAD_ROOT)
        .catch(() => null);

      if (!realRoot) {
        return res.status(404).json({
          message: "Upload folder not found",
        });
      }

      let found = null;

      for (
        const relative of candidatePaths(
          rows[0].filename
        )
      ) {
        const target = path.resolve(
          UPLOAD_ROOT,
          relative
        );

        // Prevent paths outside the upload folder.
        if (
          target === UPLOAD_ROOT ||
          !target.startsWith(
            `${UPLOAD_ROOT}${path.sep}`
          )
        ) {
          continue;
        }

        const realTarget = await fs
          .realpath(target)
          .catch(() => null);

        if (
          !realTarget ||
          !realTarget.startsWith(
            `${realRoot}${path.sep}`
          )
        ) {
          continue;
        }

        const stat = await fs
          .stat(realTarget)
          .catch(() => null);

        if (!stat?.isFile()) {
          continue;
        }

        found = realTarget;
        break;
      }

      if (!found) {
        return res.status(404).json({
          message: "Document file not found",
        });
      }

      if (
        req.params.kind === "headshot" &&
        !/\.(jpe?g|png|webp)$/i.test(found)
      ) {
        return res.status(415).json({
          message: "Unsupported headshot format",
        });
      }

      res.setHeader(
        "Cache-Control",
        "private, no-store"
      );

      res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
      );

      return res.sendFile(found);
    } catch (error) {
      console.error(
        "Admin document download error:",
        error
      );

      return res.status(500).json({
        message: "Could not load document",
      });
    }
  }
);

// DRIVER ADMINISTRATION
router.get("/drivers", getAllDrivers);

router.patch(
  "/approve-driver/:id",
  approveDriver
);

// RIDES
router.get("/rides", getAllRides);

// PAYMENTS
router.get("/payments", listPayments);

// USERS
router.get("/users", getAllUsers);

// SOS / IMMEDIATE RESPONSE TEAM
router.get(
  "/emergency",
  listEmergencyAlerts
);

router.patch(
  "/emergency/:id/escalation",
  recordEscalation
);

router.patch(
  "/emergency/:id",
  updateEmergencyAlert
);

// ROUTE SAFETY
router.get(
  "/safety-alerts",
  listSafetyAlerts
);

router.patch(
  "/safety-alerts/:id",
  reviewSafetyAlert
);

module.exports = router;