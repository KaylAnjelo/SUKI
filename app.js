const express = require('express');
const path = require('path');
const pg = require("pg");
const dotenv = require('dotenv');
const { error } = require('console');

dotenv.config({ path: './.env' });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const port = process.env.PORT || 5000;

let db;

process.env.TZ = 'Asia/Manila';

if (process.env.DATABASE_URL) {
  db = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log("Connecting to Railway PostgreSQL using connection string");
} else {
  db = new pg.Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: String(process.env.PGPASSWORD),
    port: Number(process.env.PGPORT),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  console.log("LOCAL")
}

console.log("🔐 ENV:", {
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  db: process.env.PGDATABASE,
  port: process.env.PGPORT
});
db.connect()
  .then(() => {
    console.log("🎉 Connected to PostgreSQL database");
  })
  .catch((err) => {
    console.error("😭 Connection error", err.stack);
  });

// Static file directory
const publicDirectory = path.join(__dirname, './public');
app.use(express.static(publicDirectory));

// View engine setup
app.set("view engine", "hbs");


// Function to fetch dashboard data from the database
async function getDashboardData() {
  try {
    // Use the global db connection pool
    const storeOwnersResult = await db.query('SELECT COUNT(*) FROM stores');
    const totalStoreOwners = parseInt(storeOwnersResult.rows[0].count, 10);

    const customersResult = await db.query('SELECT COUNT(*) FROM users');
    const totalCustomers = parseInt(customersResult.rows[0].count, 10);

    const totalpointsResult = await db.query('SELECT COALESCE(SUM(total_points), 0) AS total_points_sum FROM user_points');
    const totalPoints = totalpointsResult.rows[0].total_points_sum;

    const redeempointsResult = await db.query('SELECT COALESCE(SUM(redeemed_points), 0) AS total_redeemed_points_sum FROM user_points')
    const totalRedeem = redeempointsResult.rows[0].total_redeemed_points_sum;

    return { totalStoreOwners, totalCustomers,totalPoints,totalRedeem };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    throw error; // Re-throw the error to be caught by the route handler
  }
}

// Dashboard route
app.get("/dashboard", async (req, res) => {
  try {
    const dashboardData = await getDashboardData();
    res.render('Dashboard', {
      title: 'Dashboard', //optional
      total_owners: dashboardData.totalStoreOwners,
      total_customers: dashboardData.totalCustomers,
      total_points: dashboardData.totalPoints,
      redeemed_points: dashboardData.totalRedeem
    });
  } catch (error) {
    console.error("Error in /dashboard route:", error);
    res.status(500).send("Internal Server Error"); // Or render an error page
  }
});

// Login Page
app.get("/", (req, res) => {
  res.render("index");
});

// Reports
app.get("/reports", (req, res) => {
  res.render("GenerateReports");
});

// Points Allocation
app.get("/allocation", (req, res) => {
  res.render("PointsAllocation");
})

// Transactions 
app.get("/transac", (req, res) => {
  res.render("Transactions")
})

// User Redemptions
app.get("/redemptions", (req, res) => {
  res.render("Redemptions")
})

// User Management 
app.get("/userman", (req, res) => {
  res.render("UserManagement")
})



// Login route with admin login logging
app.post('/login', (req, res) => {
  const username = req.body["username"];
  const password = req.body["password"];

  console.log('Login attempt:', username);

  if (!username || !password) {
    return res.render('index', { error: 'Please enter both username and password' });
  }

  const query = "SELECT * FROM admin WHERE Username = $1 AND Password = $2";
  db.query(query, [username, password], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.render('index', { error: 'An error occurred while checking your credentials.' });
    }

    if (results.rows.length > 0) {
      console.log('✅ Login successful for:', username);

      // Log the admin login in admin_logs table
      const logQuery = "INSERT INTO admin_logs (admin_name, login_time) VALUES ($1, NOW())";
      db.query(logQuery, [username], (logErr) => {
        if (logErr) {
          console.error('⚠️ Failed to log admin login:', logErr);
        }
      });

      res.render('Dashboard');
    } else {
      console.log('❌ Invalid login attempt for:', username);
      res.render('index', { error: 'Invalid username or password, try again.' });
    }
  });
});


// Logout route
app.post('/logout', (req, res) => {
  res.redirect('/');
});

// GET /notifications route (fetch recent admin logins)
app.get('/notifications', (req, res) => {
  const notifQuery = `
    SELECT admin_name, login_time
    FROM admin_logs
    ORDER BY login_time DESC
    LIMIT 2
  `;

  db.query(notifQuery, (err, results) => {
    if (err) {
      console.error('❌ Error fetching notifications:', err);
      return res.status(500).json({ error: 'Failed to fetch notifications' });
    }

    res.json(results.rows);  // PostgreSQL result access
  });
});


app.listen(port, () => {
  console.log(`🚀 Server started on port ${port}`);
});
