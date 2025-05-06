const db = require('../../config/db');

exports.login = (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

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
      const logQuery = "INSERT INTO admin_logs (admin_name, login_time) VALUES ($1, NOW())";
      db.query(logQuery, [username], (logErr) => {
        if (logErr) {
          console.error('Failed to log admin login:', logErr);
        }
      });

      res.redirect('/Dashboard');
    } else {
      res.render('index', { error: 'Invalid username or password, try again.' });
    }
  });
};

exports.logout = (req, res) => {
  res.redirect('/');
};
