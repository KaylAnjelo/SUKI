import supabase from '../../config/db.js';

export const getNotifications = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_logs')
      .select('log_id, user_id, username, login_time')
      .order('login_time', { ascending: false })
      .limit(5);
    if (error) {
      console.error('Error fetching notifications:', error);
      return res.status(500).json({ error: 'Failed to fetch notifications' });
    }
    res.json(data);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};
