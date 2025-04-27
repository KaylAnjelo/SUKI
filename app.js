const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const db = require('./config/db');

dotenv.config({ path: './.env' });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const port = process.env.PORT || 5000;
process.env.TZ = 'Asia/Manila';

// Static files
const publicDirectory = path.join(__dirname, './public');
app.use(express.static(publicDirectory));

// View engine
app.set('view engine', 'hbs');

// Routes
const dashboardRoutes = require('./api/routes/dashboardRoutes');
const authRoutes = require('./api/routes/authRoutes');
const notificationRoutes = require('./api/routes/notificationRoutes');

app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', notificationRoutes);

// Reports
app.get("/reports", (req, res) => {
  res.render("GenerateReports");
});

// Points Allocation
app.get("/allocation", (req, res) => {
  res.render("PointsAllocation");
});

// Transactions
app.get("/transac", (req, res) => {
  res.render("Transactions");
});

// Redemptions
app.get("/redemptions", (req, res) => {
  res.render("Redemptions");
});

// User Management
app.get("/userman", (req, res) => {
  res.render("UserManagement");
});


// Start server
app.listen(port, () => {
  console.log(`🚀 Server started on port ${port}`);
});
