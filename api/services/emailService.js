import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER || 'your@email.com',
    pass: process.env.EMAIL_PASSWORD || 'yourpassword',
  },
  tls: {
    rejectUnauthorized: false
  }
});

const EmailService = {
  async sendAccountCreated(to, { name, username, role }) {
    const subject = 'Your Account Has Been Created';
    const text = `Hello ${name || username},\n\nYour account (${role}) has been created.\nPlease sign in and change your password immediately.\n\nUsername: ${username}\n\nThank you.`;
    const html = `<p>Hello <strong>${name || username}</strong>,</p>
      <p>Your account (<strong>${role}</strong>) has been created.</p>
      <p>Please sign in and <strong>change your password</strong> immediately.</p>
      <p>Username: <strong>${username}</strong></p>
      <p>Password: <strong>changemeplease</strong></p>
      <p>Thank you.</p>`;
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@example.com',
      to,
      subject,
      text,
      html,
    });
  },

  async sendOTP(to, code) {
    const subject = 'Your Password Reset Code';
    const text = `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this code, please ignore this email.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7D0006;">Password Reset Request</h2>
        <p>You have requested to reset your password. Please use the verification code below:</p>
        <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          ${code}
        </div>
        <p style="color: #666;">This code will expire in <strong>10 minutes</strong>.</p>
        <p style="color: #666;">If you did not request this code, please ignore this email.</p>
      </div>
    `;
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@example.com',
      to,
      subject,
      text,
      html,
    });
  },
};

export default EmailService;
