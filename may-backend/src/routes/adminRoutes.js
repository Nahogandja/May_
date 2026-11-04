const express = require('express');
const router = express.Router();
const { getAllDrivers, approveDriver, getAllRides, getAllUsers } = require('../controllers/adminController');
const { listEmergencyAlerts, updateEmergencyAlert } = require('../controllers/emergencyController');
const { listPayments } = require('../controllers/adminPaymentController');
const { listSafetyAlerts, reviewSafetyAlert } = require('../controllers/rideSafetyController');
const { recordEscalation } = require('../controllers/emergencyController');
const auth   = require('../middleware/authMiddleware');
const permit = require('../middleware/roleMiddleware');

router.use(auth);
router.use(permit('Admin'));

const path=require('node:path');
const pool=require('../config/db');
router.get('/driver-document/:driverId/:kind',async(req,res)=>{
  const field=req.params.kind==='id'?'certified_id_path':req.params.kind==='licence'?'certified_licence_path':null;
  if(!field) return res.status(400).json({message:'Unknown document type'});
  try{
    const {rows}=await pool.query(`SELECT ${field} AS filename FROM drivers WHERE id=$1`,[req.params.driverId]);
    if(!rows[0]?.filename)return res.status(404).json({message:'Document not available'});
    const folder=path.join(__dirname,'../../uploads/verification');
    res.sendFile(path.join(folder,path.basename(rows[0].filename)));
  }catch(error){res.status(500).json({message:'Could not load document'});}
});
router.get('/drivers',              getAllDrivers);
router.patch('/approve-driver/:id', approveDriver);
router.get('/rides',                getAllRides);
router.get('/payments',             listPayments);
router.get('/users',                getAllUsers);
router.get('/emergency',            listEmergencyAlerts);
router.patch('/emergency/:id/escalation', recordEscalation);
router.get('/safety-alerts', listSafetyAlerts);
router.patch('/safety-alerts/:id', reviewSafetyAlert);
router.patch('/emergency/:id',      updateEmergencyAlert);

module.exports = router;
