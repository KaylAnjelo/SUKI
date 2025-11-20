
import express from 'express';
import { getOwnerProfileData, updateOwnerProfile, changeOwnerPassword, sendPasswordChangeCode, verifyPasswordChangeCode } from '../controllers/ownerProfileController.js';
import upload from '../../middleware/multerConfig.js';
const router = express.Router();

// Send password change code to email
router.post('/send-password-code', sendPasswordChangeCode);
// Verify password change code
router.post('/verify-password-code', verifyPasswordChangeCode);

// Main profile page - use controller
router.get('/', getOwnerProfileData);

// Optional JSON endpoint (if needed by AJAX in your HBS modal)
router.get('/data', async (req, res) => {
  try {
    await getOwnerProfileData(req, res);
  } catch (err) {
    console.error("❌ Error in /owner/profile/data:", err);
    res.status(500).json({ error: "Failed to fetch profile data" });
  }
});

// Expecting owner profile photo field name 'ownerProfilePhoto' from the edit profile form
router.put('/', upload.single('ownerProfilePhoto'), updateOwnerProfile);

export default router;
