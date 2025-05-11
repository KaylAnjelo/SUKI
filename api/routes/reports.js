const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');

router.get('/sales', reportsController.getReports);

router.get('/transactions', (req, res) => {
  res.render('reports/transactions');
});

router.get('/activity', (req, res) => {
  res.render('reports/activity');
});

module.exports = router;