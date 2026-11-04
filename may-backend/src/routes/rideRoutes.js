const express = require('express');
const router = express.Router();
const {
  getNearbyDrivers,
  getAvailableCabs,
  bookRide,
  submitSafeArrival,
  cancelRide,
  myRides,
  getRideRoute, previewRoute, frequentPlaces, rateRide,
  emergency
} = require('../controllers/rideController');
const { createEmergencyAlert } = require('../controllers/emergencyController');
const { passengerResponse } = require('../controllers/rideSafetyController');
const auth   = require('../middleware/authMiddleware');
const permit = require('../middleware/roleMiddleware');

router.use(auth);

router.get(
  '/nearby-drivers',
  permit('Passenger'),
  getNearbyDrivers
);

router.get(
  '/available-cabs',
  permit('Passenger'),
  getAvailableCabs
);

router.get('/route-preview', permit('Passenger','Driver'), previewRoute);
router.get('/frequent-places', permit('Passenger'), frequentPlaces);
router.get('/route/:id', getRideRoute);
router.post('/safety-response/:id', permit('Passenger'), passengerResponse);
router.post('/rating/:id', permit('Passenger'), rateRide);
router.post('/book',                permit('Passenger'), bookRide);
router.post('/safe-arrival/:id',    permit('Passenger'), submitSafeArrival);
router.patch('/cancel/:id', permit('Passenger'), cancelRide);
router.get('/my-rides',             permit('Passenger'), myRides);
router.post('/emergency',           permit('Passenger'), createEmergencyAlert);

module.exports = router;
