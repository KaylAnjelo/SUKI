import db from '../../config/db.js';

export const getNotifications = (req, res) => {
  const notifQuery = `
    SELECT admin_name, login_time
    FROM admin_logs
    ORDER BY login_time DESC
    LIMIT 2
  `;

  db.query(notifQuery, (err, results) => {
    if (err) {
      console.error('Error fetching notifications:', err);
      return res.status(500).json({ error: 'Failed to fetch notifications' });
    }

    res.json(results.rows);
  });
};
