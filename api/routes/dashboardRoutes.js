import express from 'express';
import * as dashboardController from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/dashboard', async (req, res, next) => {
  try {
    console.log('🚀 Dashboard route accessed:', req.url);
    console.log('👤 Session user:', req.session?.user);
    
    // Call the dashboard controller
    await dashboardController.getDashboard(req, res);
  } catch (error) {
    console.error('❌ Dashboard route error:', error);
    res.status(500).send('Dashboard error: ' + error.message);
  }
});

export default router;
