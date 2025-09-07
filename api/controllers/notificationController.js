import supabase from '../../config/db.js';

export const getNotifications = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('admin_logs')
      .select('admin_name, login_time')
      .order('login_time', { ascending: false })
      .limit(2);
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
