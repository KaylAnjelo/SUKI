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
};

export default EmailService;
