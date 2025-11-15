import path from 'path';
import express from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import supabase from './config/db.js';
import authRoutes from './api/routes/authRoutes.js';
import notificationRoutes from './api/routes/notificationRoutes.js';
import reportsRoutes from './api/routes/reports.js';
import transactionsRoutes from './api/routes/transactions.js';
import userRouter from './api/routes/users.js';
import dashboardRoutes from './api/routes/dashboardRoutes.js';
import ownerDashboardRoutes from './api/routes/ownerDashboardRoutes.js';
import ownerProfileRoutes from './api/routes/ownerProfileRoutes.js'; 
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import recommendationKMeans from './api/controllers/recommendationKMeansController.js';
import * as ownerTransactions from './api/controllers/ownerTransactionController.js';
import * as ownerSales from './api/controllers/ownerSalesController.js';
import ownerProductsRoutes from './api/routes/ownerProductsRoutes.js';
import ownerPromotionsRoutes from './api/routes/ownerPromotionsRoutes.js';

// For __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // use path.dirname

dotenv.config({ path: './.env' });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

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
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours default
  }
}));

// Remember me middleware
app.use(async (req, res, next) => {
  // Check if user is not already logged in and remember me cookie exists
  if (!req.session.user && req.cookies.rememberMe) {
    try {
      const rememberMeData = JSON.parse(req.cookies.rememberMe);
      const { userId, token, username } = rememberMeData;
      
      // Basic validation of remember me data
      if (!userId || !token || !username) {
        throw new Error("Invalid remember me data structure");
      }
      
      // Verify the remember me token by fetching user from database
      const { data: user, error } = await supabase
        .from("users")
        .select("user_id, username, first_name, last_name, role")
        .eq("user_id", userId)
        .eq("username", username) // Additional validation
        .maybeSingle();

      if (user && !error && user.username === username) {
        // Restore the session
        req.session.user = {
          id: user.user_id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role
        };
        req.session.userId = user.user_id;
        
        console.log("🔄 Session restored from remember me cookie for user:", user.username);
      } else {
        // User not found or username mismatch - clear the cookie
        throw new Error("User validation failed");
      }
    } catch (err) {
      console.error("Error restoring session from remember me:", err.message);
      // Clear invalid remember me cookie
      res.clearCookie('rememberMe', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax'
      });
    }
  }
  next();
});

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Fix for Express 5.x - make next available on req for res.render()
app.use((req, res, next) => {
  req.next = next;
  next();
});

// Simple setUser middleware (ensure res.locals.user is available)
function setUser(req, res, next) {
  res.locals.user = req.session?.user || null;
  next();
}

// Routes
app.use(setUser);
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', notificationRoutes);
app.use('/reports', reportsRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/users', userRouter);
app.use('/owner/profile', ownerProfileRoutes);
app.use('/owner/dashboard', ownerDashboardRoutes);      // view paths
app.use('/api/owner/dashboard', ownerDashboardRoutes);  // canonical API path frontend uses
app.use('/api/owner', ownerDashboardRoutes); // compatibility
app.use('/api/owner/promotions', ownerPromotionsRoutes); // promotions API


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

app.get("/owner/transactions", async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.redirect('/login');
    }

    res.render('OwnerSide/OwnerTransactions', {
      user: req.session.user
    });
  } catch (error) {
    console.error('Error in /owner/transactions route:', error);
    res.status(500).send('Internal server error');
  }
});

app.get("/owner/promotions", async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.redirect('/login');
    }

    res.render('OwnerSide/Promotions', {
      user: req.session.user
    });
  } catch (error) {
    console.error('Error in /owner/promotions route:', error);
    res.status(500).send('Internal server error');
  }
});

// Get products for promotion selection
app.get("/api/products", async (req, res) => {
  console.log('GET /api/products route hit');
  
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    console.log('Fetching products for user:', userId);
    
    // Get user's store_id - try direct store_id first, then owner relationship
    let storeId = null;
    
    // First try to get store_id directly from user
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('store_id')
      .eq('user_id', userId)
      .single();
    
    if (userData && userData.store_id) {
      storeId = userData.store_id;
      console.log('Found user store_id:', storeId);
    } else {
      // If no direct store_id, try to find store where user is owner
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('store_id')
        .eq('owner_id', userId)
        .single();
      
      if (storeData && storeData.store_id) {
        storeId = storeData.store_id;
        console.log('Found owner store_id:', storeId);
      }
    }
    
    if (!storeId) {
      console.error('No store found for user:', userId);
      return res.status(404).json({ error: 'Store not found for user' });
    }
    
    // Fetch products for the store
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, product_name, price, product_type')
      .eq('store_id', storeId)
      .order('product_name');
    
    if (productsError) {
      console.error('Error querying products:', productsError);
      return res.status(500).json({ error: 'Error fetching products: ' + productsError.message });
    }
    
    console.log('Found products:', products ? products.length : 0);
    res.json({ products: products || [] });
    
  } catch (error) {
    console.error('Detailed error in GET /api/products:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// app.get("/owner/profile", async (req, res) => {
//   try {
//     const userId = req.session.userId;

//     if (!userId) {
//       return res.redirect('/login');
//     }

//     res.render('OwnerSide/Profile', {
//       user: req.session.user
//     });
//   } catch (error) {
//     console.error('Error in /owner/profile route:', error);
//     res.status(500).send('Internal server error');
//   }
// });

// // Backward compatibility: if something links to API path, redirect to view path
// app.get("/api/owner/profile", (req, res) => {
//   return res.redirect(302, "/owner/profile");
// });

// mount owner products routes
app.use('/owner/products', ownerProductsRoutes);
app.use('/api/owner/products', ownerProductsRoutes);

// Function to update promotion active states based on expiration
async function updatePromotionActiveStates() {
  try {
    console.log('🔄 Updating promotion active states...');
    
    // Query all promotions with start/end dates
    const { data: promotions, error } = await supabase
      .from('rewards')
      .select('reward_id, start_date, end_date, is_active')
      .not('start_date', 'is', null)
      .not('end_date', 'is', null);
    
    if (error) {
      console.error('❌ Error fetching promotions for status update:', error);
      return;
    }
    
    if (promotions && promotions.length > 0) {
      const now = new Date();
      let updatedCount = 0;
      
      for (const promo of promotions) {
        const startDate = new Date(promo.start_date);
        const endDate = new Date(promo.end_date);
        
        // Set time boundaries
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        const shouldBeActive = now >= startDate && now <= endDate;
        
        // Update if status has changed
        if (promo.is_active !== shouldBeActive) {
          const { error: updateError } = await supabase
            .from('rewards')
            .update({ is_active: shouldBeActive })
            .eq('reward_id', promo.reward_id);
          
          if (!updateError) {
            updatedCount++;
            console.log(`📅 Updated promotion ${promo.reward_id}: ${promo.is_active} → ${shouldBeActive}`);
          } else {
            console.error(`❌ Failed to update promotion ${promo.reward_id}:`, updateError);
          }
        }
      }
      
      console.log(`✅ Promotion active states updated: ${updatedCount}/${promotions.length} changed`);
    } else {
      console.log('ℹ️ No promotions with dates found for status update');
    }
  } catch (error) {
    console.error('❌ Error updating promotion active states:', error);
  }
}

// Run promotion status update every hour
setInterval(updatePromotionActiveStates, 60 * 60 * 1000);

// Mount owner API routes needed by frontend
app.get('/api/owner/stores', ownerTransactions.getOwnerStores);
app.get('/api/owner/transactions', ownerTransactions.getOwnerTransactions);
app.get('/api/owner/transactions/:id', ownerTransactions.getOwnerTransactionById);

// Sales-report endpoints used by frontend
app.get('/api/owner/sales-report/stores/dropdown', ownerSales.getStoresDropdown);
app.get('/api/owner/sales-report', ownerSales.getSalesReport);
app.get('/api/owner/sales-report/csv', ownerSales.exportSalesCsv);
app.get('/api/owner/sales-report/pdf', ownerSales.exportSalesPdf);

app.listen(port, () => {
  console.log(`🚀 Server started on port ${port}`);
});

// after your app is configured and DB client is ready, add the scheduled job:
function scheduleBiWeeklyRecompute() {
  // Cron: every 14 days at 03:00 (starts on day 1 and repeats every 14 days)
  // Note: this uses day-of-month step (*/14) — acceptable for typical bi-weekly runs.
  cron.schedule('0 3 */14 * *', async () => {
    console.log('[scheduler] Bi-weekly recompute started', new Date().toISOString());
    try {
      // fetch all owners (adjust column names to your users/owners table)
      const { data: owners, error } = await supabase.from('owners').select('id').limit(1000);
      if (error) {
        console.error('[scheduler] failed to fetch owners', error);
        return;
      }
      for (const owner of (owners || [])) {
        try {
          const ownerId = owner.id;
          // run recompute with sensible defaults; this runs server-side (no session)
          const res = await recommendationKMeans.computeKMeansForOwner(ownerId, { period: '30d', topFeatures: 100, k: 8, minCount: 5, topPerProduct: 5 });
          console.log(`[scheduler] recompute owner=${ownerId} result:`, res);
        } catch (err) {
          console.error('[scheduler] recompute error for owner', owner, err);
        }
      }
      console.log('[scheduler] Bi-weekly recompute finished', new Date().toISOString());
    } catch (err) {
      console.error('[scheduler] unexpected error', err);
    }
  }, {
    timezone: 'UTC' // change to your server timezone if desired
  });
}

// call the scheduler after app startup
scheduleBiWeeklyRecompute();

export default app;


// GAGANA NA
