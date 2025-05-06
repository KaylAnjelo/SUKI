const express = require('express');
const router = express.Router();

router.get('/sales', (req, res) => {
  res.render('reports/sales');
});

router.get('/transactions', (req, res) => {
  res.render('reports/transactions');
});

router.get('/activity', (req, res) => {
  res.render('reports/activity');
});

module.exports = router;