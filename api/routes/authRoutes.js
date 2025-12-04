import express from 'express';
import * as loginController from '../controllers/loginController.js';
import * as forgotPasswordController from '../controllers/forgotPasswordController.js';

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

// Forgot password routes
router.get('/forgot-password', forgotPasswordController.showForgotPasswordPage);
router.post('/forgot-password/send-code', forgotPasswordController.sendVerificationCode);
router.post('/forgot-password/verify-code', forgotPasswordController.verifyCode);
router.post('/forgot-password/reset-password', forgotPasswordController.resetPassword);

export default router;
