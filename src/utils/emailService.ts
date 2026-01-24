import nodemailer, { Transporter } from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: any[];
}

class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail', // Gmail specific
      auth: {
        user: process.env.EMAIL_USER ,
        pass: process.env.EMAIL_PASSWORD , // App Password, no spaces!
      },
    });

    // Verify connection
    this.transporter.verify((err, success) => {
      if (err) console.error('❌ SMTP connection failed:', err);
      else console.log('✅ SMTP connection successful');
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent:', info.messageId);
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      throw error;
    }
  }

  async sendWelcomeEmail(user: { email: string; firstName: string }) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Welcome to AI Accelerator!</h1>
        <p>Hi ${user.firstName},</p>
        <p>Thank you for joining the AI Accelerator Program. We're excited to have you on board!</p>
        <p>You can now access your dashboard and start your learning journey.</p>
        <p>Best regards,<br>AI Accelerator Team</p>
      </div>
    `;

    await this.sendEmail({
      to: user.email,
      subject: 'Welcome to AI Accelerator!',
      html,
    });
  }


  async sendPasswordResetEmail(user: { email: string; firstName: string }, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Password Reset Request</h1>
        <p>Hi ${user.firstName},</p>
        <p>You requested to reset your password. Click the button below to reset it:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <p>Best regards,<br>AI Accelerator Team</p>
      </div>
    `;

    await this.sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      html,
    });
  }

  async sendCertificateEmail(
    user: { email: string; firstName: string },
    certificateUrl: string
  ): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Congratulations! 🎉</h1>
        <p>Hi ${user.firstName},</p>
        <p>Congratulations on completing the AI Accelerator Program!</p>
        <p>Your certificate is now ready. You can download it using the link below:</p>
        <a href="${certificateUrl}" style="display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">Download Certificate</a>
        <p>We're proud of your achievement and wish you all the best in your AI journey!</p>
        <p>Best regards,<br>AI Accelerator Team</p>
      </div>
    `;

    await this.sendEmail({
      to: user.email,
      subject: 'Your AI Accelerator Certificate is Ready!',
      html,
    });
  }

  async sendAssessmentGradedEmail(
    user: { email: string; firstName: string },
    assessment: { title: string; score: number; totalPoints: number }
  ): Promise<void> {
    const percentage = Math.round((assessment.score / assessment.totalPoints) * 100);
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Assessment Graded</h1>
        <p>Hi ${user.firstName},</p>
        <p>Your assessment "${assessment.title}" has been graded.</p>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="margin: 0; color: #333;">Score: ${assessment.score}/${assessment.totalPoints} (${percentage}%)</h2>
        </div>
        <p>Log in to your dashboard to see detailed feedback.</p>
        <p>Best regards,<br>AI Accelerator Team</p>
      </div>
    `;

    await this.sendEmail({
      to: user.email,
      subject: `Assessment Graded: ${assessment.title}`,
      html,
    });
  }
}

export default new EmailService();