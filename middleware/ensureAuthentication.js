export function ensureAuthenticated(req, res, next) {
  try {
    console.log('Auth middleware: req.session:', req.session);
    console.log('Auth middleware: req.session.user:', req.session ? req.session.user : undefined);
    if (req.session && req.session.user) {
      req.user = req.session.user; // attach user to req for controllers
      return next();
    }
    return res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ success: false, message: 'Authentication middleware failed.' });
  }
}
