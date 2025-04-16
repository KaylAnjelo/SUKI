router.get('/notifications', async (req, res) => {
  const [notifications] = await db.query(`
    SELECT admin_name, login_time 
    FROM admin_logins 
    ORDER BY login_time DESC 
    LIMIT 5
  `);
  res.json(notifications);
});
