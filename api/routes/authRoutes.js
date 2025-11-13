import express from 'express';
import * as loginController from '../controllers/loginController.js';

const router = express.Router();

// Authentication routes
router.get('/', (req, res, next) => {
  res.render('index');
});
router.post('/login', loginController.login);
router.post('/logout', loginController.logout);
router.post('/clear-remember-me', (req, res) => {
  // Clear remember me cookie (for security purposes)
  res.clearCookie('rememberMe', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  });
  res.json({ success: true, message: 'Remember me cookie cleared' });
});

export default router;