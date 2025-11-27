import express from 'express';
import { 
  getSalesWithTotals,
  getReports,
  filterReports,
  exportSalesCsv,
  exportSalesPdf,
  exportTransactionsCsv,
  exportTransactionsPdf,
  exportActivityCsv,
  exportActivityPdf,
  getUsersForFilter,
  getUserRolesForFilter,
  getStoresForFilter
  ,debugVendorData
} from '../controllers/reportsController.js';

const router = express.Router();

// Sales routes
router.get('/sales-totals', getSalesWithTotals);
router.get('/sales', getReports);
router.post('/sales/filter', filterReports);
router.get('/sales/export/csv', exportSalesCsv);
router.get('/sales/export/pdf', exportSalesPdf);

// Transaction routes
router.get('/transactions', (req, res) => {
  res.render('reports/transactions', {
    title: 'Transaction Reports'
  });
});
router.post('/transactions/filter', filterReports);
router.get('/transactions/export/csv', exportTransactionsCsv);
router.get('/transactions/export/pdf', exportTransactionsPdf);

// Activity routes
router.get('/activity', (req, res) => {
  res.render('reports/activity', {
    title: 'Activity Reports'
  });
});
router.post('/activity/filter', filterReports);
router.get('/activity/export/csv', exportActivityCsv);
router.get('/activity/export/pdf', exportActivityPdf);

// Filter dropdown data routes
router.get('/users', getUsersForFilter);
router.get('/user-roles', getUserRolesForFilter);
router.get('/stores', getStoresForFilter);

// Transaction types endpoint (for filtering dropdowns)
router.get('/transaction-types', (req, res) => {
  res.json(['Purchase', 'Redemption', 'Refund']);
});

// Deprecated routes for backward compatibility
router.get('/transactions/users', getUsersForFilter);
router.get('/transactions/stores', getStoresForFilter);
router.get('/activity/users', getUsersForFilter);
// Debugging endpoint
router.get('/debug/vendor-data', debugVendorData);

export default router;
