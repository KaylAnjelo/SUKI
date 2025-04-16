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
  
      res.json(results); // Send notifications to the client
    });
  });
  