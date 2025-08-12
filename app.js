import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import supabase from './config/db.js';
import dashboardRoutes from './api/routes/dashboardRoutes.js';
import authRoutes from './api/routes/authRoutes.js';
import notificationRoutes from './api/routes/notificationRoutes.js';
import reportsRoutes from './api/routes/reports.js';
import transactionsRoutes from './api/routes/transactions.js';
import userRouter from './api/routes/users.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// For __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', notificationRoutes);
app.use('/reports', reportsRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/users', userRouter);

// Views
app.get("/reports", (req, res) => {
  res.render("GenerateReports");
});

app.get("/transac", (req, res) => {
  const chartLabels = JSON.stringify(["Jan", "Feb", "Mar"]);
  const chartData = JSON.stringify([120, 150, 180]);
  res.render("Transactions", {
    chartLabels,
    chartData,
  });
});

app.get('/dashboard', async (req, res) => {
  const chartLabels = JSON.stringify(["Jan", "Feb", "Mar"]);
  const chartData = JSON.stringify([120, 150, 180]);
  res.render('Dashboard', {
    chartLabels,
    chartData,
  });
});

app.listen(port, () => {
  console.log(`🚀 Server started on port ${port}`);
});

async function run() {
  const { data, error } = await supabase
    .from('admin')
    .select('*');

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✅ Data:', data);
  }
}

run();
