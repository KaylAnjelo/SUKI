import express from 'express';
import * as loginController from '../controllers/loginController.js';

const router = express.Router();

// Authentication routes
router.get('/', (req, res) => res.render('index'));
router.post('/login', loginController.login);
router.post('/logout', loginController.logout);

// Dashboard routes (role-based)
router.get('/admin-dashboard', async (req, res) => {
  console.log('🔍 Admin dashboard route hit');
  console.log('🔍 Session user:', req.session.user);
  
  // Check if user is authenticated and has admin role
  if (!req.session.user || req.session.user.role !== 'admin') {
    console.log('❌ Admin access denied, redirecting to home');
    return res.redirect('/');
  }
  
  console.log('✅ Calling getDashboard controller');
  // Import and call the dashboard controller
  try {
    const { getDashboard } = await import('../controllers/dashboardController.js');
    await getDashboard(req, res);
  } catch (error) {
    console.error('❌ Error loading dashboard controller:', error);
    res.render('AdminDashboard', { 
      user: req.session.user,
      error: 'Dashboard temporarily unavailable'
    });
  }
});

router.get('/owner-dashboard', (req, res) => {
  console.log('🔍 Owner dashboard route hit');
  console.log('🔍 Session user:', req.session.user);
  
  // Check if user is authenticated and has owner role
  if (!req.session.user || req.session.user.role !== 'owner') {
    console.log('❌ Owner access denied, redirecting to home');
    return res.redirect('/');
  }
  
  console.log('✅ Rendering OwnerSide/OwnerDashboard');
  // Render OwnerDashboard.hbs from views/OwnerSide/ folder
  res.render('OwnerSide/OwnerDashboard', { 
    user: req.session.user 
  });
});

export default router;