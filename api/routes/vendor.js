import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.render('VendorSide/VendorDashboard');
});

router.get('/reports', (req, res) => {
  res.render('VendorSide/VendorDashboard', { section: 'reports' });
});

router.get('/transactions', (req, res) => {
  res.render('VendorSide/VendorDashboard', { section: 'transactions' });
});

export default router;


