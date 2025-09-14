import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import session from 'express-session';
import supabase from './config/db.js';
import authRoutes from './api/routes/authRoutes.js';
import notificationRoutes from './api/routes/notificationRoutes.js';
import reportsRoutes from './api/routes/reports.js';
import transactionsRoutes from './api/routes/transactions.js';
import userRouter from './api/routes/users.js';
import dashboardRoutes from './api/routes/dashboardRoutes.js';
import ownerRoutes from './api/routes/ownerRoutes.js';
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
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false}
}));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});
// Routes
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', notificationRoutes);
app.use('/reports', reportsRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/users', userRouter);
app.use('/api/owner', ownerRoutes);

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

// Owner routes
app.get("/owner/stores", async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.redirect('/login');
    }

    // Fetch stores owned by the user
    const { data: stores, error } = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching stores:', error);
      return res.status(500).send('Error loading stores');
    }

    res.render('OwnerSide/OwnerStores', {
      user: req.session.user,
      stores: stores || []
    });
  } catch (error) {
    console.error('Error in /owner/stores route:', error);
    res.status(500).send('Internal server error');
  }
});

app.get("/owner/redemptions", async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.redirect('/login');
    }

    res.render('OwnerSide/Redemptions', {
      user: req.session.user
    });
  } catch (error) {
    console.error('Error in /owner/redemptions route:', error);
    res.status(500).send('Internal server error');
  }
});

app.get("/owner/sales-report", async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.redirect('/login');
    }

    res.render('OwnerSide/SalesReport', {
      user: req.session.user
    });
  } catch (error) {
    console.error('Error in /owner/sales-report route:', error);
    res.status(500).send('Internal server error');
  }
});

app.listen(port, () => {
  console.log(`🚀 Server started on port ${port}`);
});
