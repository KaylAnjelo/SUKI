import express from 'express';
import * as reportsController from '../controllers/reportsController.js';

const router = express.Router();

router.get('/sales', reportsController.getReports);
router.post('/sales/filter', reportsController.filterReports);

router.get('/transactions', (req, res) => {
  res.render('reports/transactions');
});
router.post('/transactions/filter', reportsController.filterReports);

router.get('/activity', (req, res) => {
  res.render('reports/activity');
});
router.post('/activity/filter', reportsController.filterReports);

export default router;