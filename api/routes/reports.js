const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');

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

module.exports = router;