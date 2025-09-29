import express from 'express';
import { getOwnerProfileData } from '../controllers/ownerProfileController.js';

const router = express.Router();

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

export default router;
