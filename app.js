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
const reportsRoutes = require('./api/routes/reports');
const userRouter = require('./api/routes/users')

app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', notificationRoutes);
app.use('/reports', reportsRoutes);
app.use('/users', userRouter);

// Reports
app.get("/reports", (req, res) => {
  res.render("GenerateReports");
});

// Transactions
app.get("/transac", (req, res) => {
  res.render("Transactions");
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server started on port ${port}`);
});
