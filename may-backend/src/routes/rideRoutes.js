const express = require('express');
const router = express.Router();
const {
  getNearbyDrivers,
  bookRide,
  submitSafeArrival,
  myRides,
  emergency
} = require('../controllers/rideController');
const auth   = require('../middleware/authMiddleware');
const permit = require('../middleware/roleMiddleware');

router.use(auth);

router.get(
  '/nearby-drivers',
  permit('Passenger'),
  getNearbyDrivers
);

router.post('/book',                permit('Passenger'), bookRide);
router.post('/safe-arrival/:id',    permit('Passenger'), submitSafeArrival);
router.get('/my-rides',             permit('Passenger'), myRides);
router.post('/emergency',           permit('Passenger'), emergency);

module.exports = router;
