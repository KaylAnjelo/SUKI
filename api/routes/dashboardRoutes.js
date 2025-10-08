import express from 'express';
import { getDashboard, getEngagementData, getProductBreakdown, getStores } from '../controllers/dashboardController.js';

const router = express.Router();

// Admin dashboard
router.get('/admin-dashboard', async (req, res) => {
  console.log('🔍 Admin dashboard route hit');
  console.log('🔍 Session user:', req.session.user);
  console.log('🔍 Session userId:', req.session.userId);
  console.log('🔍 Session ID:', req.sessionID);

  if (!req.session.user) {
    console.log('❌ No user session found, redirecting to login');
    return res.redirect('/');
  }

  if (req.session.user.role !== 'admin') {
    console.log('❌ User role is not admin, role is:', req.session.user.role);
    console.log('❌ Redirecting to home');
    return res.redirect('/');
  }

  console.log('✅ Admin access granted, loading dashboard');

  try {
    await getDashboard(req, res);
  } catch (error) {
    console.error('❌ Error loading dashboard controller:', error);
    res.render('AdminDashboard', { 
      user: req.session.user,
      error: 'Dashboard temporarily unavailable'
    });
  }
});

router.get('/api/engagement', getEngagementData);
router.get('/api/product-breakdown', getProductBreakdown);
router.get('/api/stores', getStores);

export default router;
