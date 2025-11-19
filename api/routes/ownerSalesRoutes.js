import express from 'express';
import {
  getStoresDropdown,
  getSalesReport,
  exportSalesCsv,
  exportSalesPdf
} from '../controllers/ownerSalesController.js';

const router = express.Router();

// GET /api/owner/sales-report/stores/dropdown
router.get('/sales-report/stores/dropdown', getStoresDropdown);

// GET /api/owner/sales-report (returns JSON with paging)
router.get('/sales-report', getSalesReport);

// GET /api/owner/sales-report/csv
router.get('/sales-report/csv', exportSalesCsv);

// GET /api/owner/sales-report/pdf
router.get('/sales-report/pdf', exportSalesPdf);

export default router;
