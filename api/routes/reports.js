import express from 'express';
import * as reportsController from '../controllers/reportsController.js';
import { getSalesWithTotals } from '../controllers/reportsController.js';
const router = express.Router();

router.get('/sales-totals', getSalesWithTotals);

router.get('/sales', reportsController.getReports);
router.post('/sales/filter', reportsController.filterReports);
router.get('/sales/export/csv', reportsController.exportSalesCsv);
router.get('/sales/export/pdf', reportsController.exportSalesPdf);

// Transaction export routes
router.get('/transactions/export/csv', reportsController.exportTransactionsCsv);
router.get('/transactions/export/pdf', reportsController.exportTransactionsPdf);

router.get('/transactions', (req, res) => {
  res.render('reports/transactions');
});
router.post('/transactions/filter', reportsController.filterReports);

router.get('/activity', (req, res) => {
  res.render('reports/activity');
});
router.post('/activity/filter', reportsController.filterReports);

export default router;