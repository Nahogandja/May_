const router=require('express').Router();
const auth=require('../middleware/authMiddleware');
const permit=require('../middleware/roleMiddleware');
const messages=require('../controllers/messageController');
router.use(auth,permit('Passenger','Driver'));
router.get('/',messages.conversations);
router.get('/:rideId',messages.list);
router.post('/:rideId',messages.send);
module.exports=router;
