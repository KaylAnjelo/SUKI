import supabase from '../../config/db.js';
import bcrypt from 'bcrypt';
import EmailService from '../services/emailService.js';

// Store verification codes in memory (use Redis in production)
const verificationCodes = new Map();

export const sendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists with this email
    const { data: user, error } = await supabase
      .from('users')
      .select('user_id, user_email, username')
      .eq('user_email', email)
      .maybeSingle();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Database error occurred' });
    }

    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({ 
        success: true, 
        message: 'If this email exists, a verification code has been sent.' 
      });
    }

    // Generate 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code with 10-minute expiry
    verificationCodes.set(email, {
      code,
      expires: Date.now() + 10 * 60 * 1000,
      userId: user.user_id
    });

    // Send email with verification code
    await EmailService.sendOTP(email, code);

    console.log(`✅ Verification code sent to ${email}`);

    return res.json({ 
      success: true, 
      message: 'Verification code sent to your email' 
    });

  } catch (error) {
    console.error('Error sending verification code:', error);
    return res.status(500).json({ error: 'Failed to send verification code' });
  }
};

export const verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    const storedData = verificationCodes.get(email);

    if (!storedData) {
      return res.status(400).json({ error: 'No verification code found. Please request a new one.' });
    }

    if (storedData.expires < Date.now()) {
      verificationCodes.delete(email);
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    if (storedData.code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    console.log(`✅ Code verified for ${email}`);

    return res.json({ 
      success: true, 
      message: 'Code verified successfully' 
    });

  } catch (error) {
    console.error('Error verifying code:', error);
    return res.status(500).json({ error: 'Failed to verify code' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password are required' });
    }

    // Validate password requirements
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    if (!/[a-z]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least 1 lowercase letter' });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least 1 uppercase letter' });
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least 1 special character' });
    }

    const storedData = verificationCodes.get(email);

    if (!storedData) {
      return res.status(400).json({ error: 'Verification required. Please start over.' });
    }

    if (storedData.expires < Date.now()) {
      verificationCodes.delete(email);
      return res.status(400).json({ error: 'Session expired. Please start over.' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    const { error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('user_id', storedData.userId);

    if (error) {
      console.error('Error updating password:', error);
      return res.status(500).json({ error: 'Failed to update password' });
    }

    // Clean up verification code
    verificationCodes.delete(email);

    console.log(`✅ Password reset successfully for ${email}`);

    return res.json({ 
      success: true, 
      message: 'Password reset successfully' 
    });

  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
};

export const showForgotPasswordPage = (req, res) => {
  res.render('forgot-password');
};
