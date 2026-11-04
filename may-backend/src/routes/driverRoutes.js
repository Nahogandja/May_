const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const multer = require('multer');
const pool = require('../config/db');
const { createDriverEmergencyAlert } = require('../controllers/emergencyController');
const router = express.Router();
const {
  getProfile,
  updateProfile,
  getAssignedRides,
  startRide,
  endRide,
  updateLocation,
  setAvailability
} = require('../controllers/driverController');
const auth = require('../middleware/authMiddleware');
const permit = require('../middleware/roleMiddleware');

router.use(auth);
router.use(permit('Driver'));

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
const photoDir = path.join(__dirname, '../../uploads/driver-headshots');
fs.mkdirSync(photoDir, { recursive: true });
const headshotUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, photoDir),
    filename: (_req, file, cb) => cb(null, randomUUID() + (file.mimetype === 'image/png' ? '.png' : '.jpg'))
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png'].includes(file.mimetype))
}).single('photo');
router.post('/headshot', (req, res) => headshotUpload(req, res, async (err) => {
  if (err) return res.status(400).json({ message: 'Choose a JPEG/PNG headshot under 2 MB' });
  if (!req.file) return res.status(400).json({ message: 'A JPEG or PNG headshot is required' });
  try {
    const url = `/uploads/driver-headshots/${req.file.filename}`;
    const { rows } = await pool.query("UPDATE drivers SET headshot_url=$1,vetting_status='Pending',is_available=FALSE WHERE user_id=$2 RETURNING headshot_url", [url, req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'Driver profile not found' });
    return res.json({ headshotUrl: url });
  } catch (error) { return res.status(500).json({ message: 'Could not save headshot' }); }
}));
// Certified documents remain private: no public static file server.
const privateDir = path.join(__dirname, '../../uploads/verification');
fs.mkdirSync(privateDir, { recursive: true });
const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req,_file,cb)=>cb(null,privateDir),
    filename: (_req,file,cb)=>cb(null,randomUUID()+ (file.mimetype==='application/pdf'?'.pdf': file.mimetype==='image/png'?'.png':'.jpg'))
  }),
  limits: {fileSize:5*1024*1024},
  fileFilter: (_req,file,cb)=>cb(null,['application/pdf','image/jpeg','image/png'].includes(file.mimetype))
}).single('document');
router.post('/verification/:kind', (req,res)=>documentUpload(req,res,async error=>{
  if(error)return res.status(400).json({message:'Choose a PDF, JPEG or PNG under 5 MB'});
  const field=req.params.kind==='id'?'certified_id_path':req.params.kind==='licence'?'certified_licence_path':null;
  if(!field||!req.file){if(req.file)fs.unlink(req.file.path,()=>{});return res.status(400).json({message:'Upload a certified ID or licence document'});}
  try {
    const {rows}=await pool.query(`UPDATE drivers SET ${field}=$1,vetting_status='Pending',is_available=false,
      documents_reviewed_at=NULL WHERE user_id=$2 RETURNING user_id`,[req.file.filename,req.user.id]);
    if(!rows.length)return res.status(404).json({message:'Driver profile not found'});
    return res.json({message:'Document submitted for verification',kind:req.params.kind});
  }catch(err){fs.unlink(req.file.path,()=>{});return res.status(500).json({message:'Document upload failed'});}
}));
router.get('/verification/:kind',async(req,res)=>{
  // Document read access is intentionally limited to its owner.
  const field=req.params.kind==='id'?'certified_id_path':req.params.kind==='licence'?'certified_licence_path':null;
  if(!field)return res.status(400).json({message:'Invalid document type'});
  try {
    const {rows}=await pool.query(`SELECT ${field} AS filename FROM drivers WHERE user_id=$1`,[req.user.id]);
    if(!rows[0]?.filename)return res.status(404).json({message:'Document not found'});
    return res.sendFile(path.join(privateDir,path.basename(rows[0].filename)));
  }catch(error){return res.status(500).json({message:'Unable to retrieve document'});}
});
router.get('/rides', getAssignedRides);
router.post('/emergency', createDriverEmergencyAlert);
router.patch('/start-ride/:id', startRide);
router.patch('/end-ride/:id', endRide);
router.patch('/location', updateLocation);
router.patch('/availability', setAvailability);

module.exports = router;
