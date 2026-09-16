const express = require('express');
const router = express.Router();
const { getAllDrivers, approveDriver, getAllRides, getAllUsers } = require('../controllers/adminController');
const auth   = require('../middleware/authMiddleware');
const permit = require('../middleware/roleMiddleware');

router.use(auth);
router.use(permit('Admin'));

router.get('/drivers',              getAllDrivers);
router.patch('/approve-driver/:id', approveDriver);
router.get('/rides',                getAllRides);
router.get('/users',                getAllUsers);

module.exports = router;
