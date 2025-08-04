import supabase from '../../config/db.js';

export const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('index', { error: 'Please enter both username and password' });
  }

  try {
    const { data, error } = await supabase
      .from('admin')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.render('index', { error: 'An error occurred while checking your credentials.' });
    }

    if (data) {
      // Log the admin login
      const logInsert = await supabase
        .from('admin_logs')
        .insert([{ admin_name: username, timestamp: new Date().toISOString() }]);

      if (logInsert.error) {
        console.error('Failed to log admin login:', logInsert.error);
      }

      return res.redirect('/Dashboard');
    } else {
      return res.render('index', { error: 'Invalid username or password, try again.' });
    }

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.render('index', { error: 'Server error. Please try again.' });
  }
};

export const logout = (req, res) => {
  res.redirect('/');
};
