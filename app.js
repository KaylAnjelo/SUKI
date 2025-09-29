import express from 'express';
import path from 'path';
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
import ownerProfileRoutes from './api/routes/ownerProfileRoutes.js';
import ownerRoutes from './api/routes/ownerRoutes.js';
import ownerTransactionRoutes from './api/routes/ownerTransactionRoutes.js';
import ownerStoresRoutes from './api/routes/ownerStoresRoutes.js';
import { setUser } from './middleware/setUser.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// For __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
// Routes
app.use(setUser);
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', notificationRoutes);
app.use('/reports', reportsRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/users', userRouter);
app.use('/owner/profile/data', ownerProfileRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/owner/transactions', ownerTransactionRoutes);
app.use('/api/owner/stores', ownerStoresRoutes);


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

app.get("/owner/products", async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.redirect('/login');
    }

    res.render('OwnerSide/Products', {
      user: req.session.user
    });
  } catch (error) {
    console.error('Error in /owner/products route:', error);
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

app.listen(port, () => {
  console.log(`🚀 Server started on port ${port}`);
});
