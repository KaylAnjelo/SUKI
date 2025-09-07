import express from 'express';
import * as reportsController from '../controllers/reportsController.js';
import { getSalesWithTotals, exportActivityCsv, exportActivityPdf, getUsersForFilter, getStoresForFilter } from '../controllers/reportsController.js';
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
router.get('/transactions/users', getUsersForFilter);
router.get('/transactions/stores', getStoresForFilter);

router.get('/activity', (req, res) => {
  res.render('reports/activity');
});
router.post('/activity/filter', reportsController.filterReports);
router.get('/activity/users', getUsersForFilter);
router.get('/activity/export/csv', exportActivityCsv);
router.get('/activity/export/pdf', exportActivityPdf);

export default router;