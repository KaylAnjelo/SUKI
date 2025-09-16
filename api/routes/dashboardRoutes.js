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

// Owner dashboard
router.get('/owner-dashboard', (req, res) => {
  console.log('🔍 Owner dashboard route hit');
  console.log('🔍 Session user:', req.session.user);

  if (!req.session.user || req.session.user.role !== 'owner') {
    console.log('❌ Owner access denied, redirecting to home');
    return res.redirect('/');
  }

  res.render('OwnerSide/OwnerDashboard', { 
    user: req.session.user,
    total_stores: 0,
    total_customers: 0,
    total_points: 0,
    total_redemptions: 0,
    stores_growth: 0,
    customers_growth: 0,
    points_growth: 0,
    redemptions_growth: 0,
    stores_growth_class: 'neutral',
    customers_growth_class: 'neutral',
    points_growth_class: 'neutral',
    redemptions_growth_class: 'neutral',
    stores_icon: 'fa-minus',
    customers_icon: 'fa-minus',
    points_icon: 'fa-minus',
    redemptions_icon: 'fa-minus',
    store_growth: 0,
    store_growth_class: 'neutral',
    store_icon: 'fa-minus'
  });
});

// Owner profile view (redundant path to ensure availability)
router.get('/owner/profile', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'owner') {
    return res.redirect('/');
  }
  return res.render('OwnerSide/Profile', {
    user: req.session.user
  });
});

export default router;
