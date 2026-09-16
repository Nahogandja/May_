const express = require('express');
const router = express.Router();
const { getAssignedRides, startRide, endRide, updateLocation, setAvailability } = require('../controllers/driverController');
const auth   = require('../middleware/authMiddleware');
const permit = require('../middleware/roleMiddleware');

router.use(auth);
router.use(permit('Driver'));

router.get('/rides',              getAssignedRides);
router.patch('/start-ride/:id',   startRide);
router.patch('/end-ride/:id',     endRide);
router.patch('/location',         updateLocation);
router.patch('/availability',     setAvailability);

module.exports = router;
