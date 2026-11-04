const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const permit = require('../middleware/roleMiddleware');
const { getWallet, demoTopUp } = require('../controllers/walletController');

router.use(auth);
router.use(permit('Passenger', 'Driver'));
router.get('/', getWallet);
router.post('/demo-topup', permit('Passenger'), demoTopUp);
module.exports = router;
