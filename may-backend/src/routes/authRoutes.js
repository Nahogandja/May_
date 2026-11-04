const express = require('express');
const router = express.Router();
const { register, login, changePassword, updateEmergencyContact, mySafetyProfile, updateMyPhone } = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.patch('/change-password', auth, changePassword);
router.get('/safety-profile', auth, mySafetyProfile);
router.patch('/emergency-contact', auth, updateEmergencyContact);
router.patch('/phone', auth, updateMyPhone);

module.exports = router;
