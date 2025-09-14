import express from 'express';
import { getDashboard, getEngagementData, getProductBreakdown, getStores } from '../controllers/dashboardController.js';

const router = express.Router();

// Admin dashboard
router.get('/admin-dashboard', async (req, res) => {
  console.log('🔍 Admin dashboard route hit');
  console.log('🔍 Session user:', req.session.user);

  if (!req.session.user || req.session.user.role !== 'admin') {
    console.log('❌ Admin access denied, redirecting to home');
    return res.redirect('/');
  }

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

export default router;
