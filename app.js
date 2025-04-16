const express = require('express');
const path = require('path');
const mysql = require("mysql");
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const db = mysql.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE
});

const publicDirectory = path.join(__dirname, './public');
app.use(express.static(publicDirectory));

app.set("view engine", "hbs");

db.connect((error) => {
  if (error) {
    console.log('❌ MySQL Connection Error:', error);
  } else {
    console.log("✅ MySQL Connected");
  }
});

// Home page
app.get("/", (req, res) => {
  res.render("index");
});

// Login route with admin login logging
app.post('/login', (req, res) => {
  const username = req.body["username"];
  const password = req.body["password"];

  console.log('Login attempt:', username);

  if (!username || !password) {
    return res.send('⚠️ Please enter both email and password.');
  }

  const query = "SELECT * FROM admin WHERE Username = ? AND Password = ?";
  db.query(query, [username, password], (err, results) => {
    if (err) {
      console.error('❌ Database error:', err);
      return res.send('🚫 An error occurred while checking your credentials.');
    }

    if (results.length > 0) {
      console.log('✅ Login successful for:', username);

      // Log the admin login in admin_logins table
      const logQuery = "INSERT INTO admin_logins (admin_name) VALUES (?)";
      db.query(logQuery, [username], (logErr) => {
        if (logErr) {
          console.error('⚠️ Failed to log admin login:', logErr);
        }
      });

      res.render('GenerateReports');
    } else {
      console.log('❌ Invalid login attempt for:', username);
      res.send('❌ Invalid email or password.');
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
    FROM admin_logins
    ORDER BY login_time DESC
    LIMIT 5
  `;

  db.query(notifQuery, (err, results) => {
    if (err) {
      console.error('❌ Error fetching notifications:', err);
      return res.status(500).json({ error: 'Failed to fetch notifications' });
    }

    res.json(results);
  });
});

app.listen(5000, () => {
  console.log('🚀 Server started on port 5000');
});
