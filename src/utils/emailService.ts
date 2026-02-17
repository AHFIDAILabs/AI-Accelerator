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
    // Use MailerSend SMTP configuration
this.transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: {
    ciphers: "SSLv3"
  }
});

    // Verify connection
    this.transporter.verify((err, success) => {
      if (err) {
        console.error('❌ SMTP connection failed:', err);
        console.error('Email Host:', process.env.EMAIL_HOST);
        console.error('Email Port:', process.env.EMAIL_PORT);
        console.error('Email User:', process.env.EMAIL_USER ? '✓ Set' : '✗ Not set');
        console.error('Email Password:', process.env.EMAIL_PASSWORD ? '✓ Set' : '✗ Not set');
      } else {
        console.log('✅ SMTP connection successful');
        console.log('📧 Email service ready with:', process.env.EMAIL_HOST);
      }
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'AI4SID~Academy <info@ai4sid.org>',
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      throw error;
    }
  }

  async sendWelcomeEmail(user: { email: string; firstName: string }) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 32px;">Welcome to AI4SID~Academy! 🎉</h1>
        </div>
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; color: #333;">Hi ${user.firstName},</p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Thank you for joining the <strong>AI4SID~Academy Program</strong>. We're excited to have you on board!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            You can now access your dashboard and start your learning journey.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.CLIENT_URL}/dashboard" style="display: inline-block; padding: 14px 28px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Go to Dashboard
            </a>
          </div>
          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            Best regards,<br>
            <strong>AI4SID~Academy Team</strong>
          </p>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: user.email,
      subject: 'Welcome to AI4SID~Academy!',
      html,
    });
  }

  async sendPasswordResetEmail(user: { email: string; firstName: string }, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset Request 🔐</h1>
        </div>
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; color: #333;">Hi ${user.firstName},</p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            You requested to reset your password. Click the button below to reset it:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="display: inline-block; padding: 14px 28px; background-color: #f5576c; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              ⚠️ This link will expire in <strong>1 hour</strong>.
            </p>
          </div>
          <p style="font-size: 14px; color: #666;">
            If you didn't request this, please ignore this email. Your password will remain unchanged.
          </p>
          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            Best regards,<br>
            <strong>AI4SID~Academy Team</strong>
          </p>
        </div>
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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 40px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 32px;">Congratulations! 🎉</h1>
        </div>
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; color: #333;">Hi ${user.firstName},</p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Congratulations on completing the <strong>AI4SID~Academy Program</strong>!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Your certificate is now ready. You can download it using the link below:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${certificateUrl}" style="display: inline-block; padding: 14px 28px; background-color: #38ef7d; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Download Certificate 📜
            </a>
          </div>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            We're proud of your achievement and wish you all the best in your AI journey!
          </p>
          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            Best regards,<br>
            <strong>AI4SID~Academy Team</strong>
          </p>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: user.email,
      subject: 'Your AI4SID~Academy Certificate is Ready!',
      html,
    });
  }

  async sendAssessmentGradedEmail(
    user: { email: string; firstName: string },
    assessment: { title: string; score: number; totalPoints: number }
  ): Promise<void> {
    const percentage = Math.round((assessment.score / assessment.totalPoints) * 100);
    const isPassing = percentage >= 70;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Assessment Graded ✍️</h1>
        </div>
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; color: #333;">Hi ${user.firstName},</p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Your assessment <strong>"${assessment.title}"</strong> has been graded.
          </p>
          <div style="background-color: ${isPassing ? '#d4edda' : '#f8d7da'}; border-left: 4px solid ${isPassing ? '#28a745' : '#dc3545'}; padding: 20px; border-radius: 4px; margin: 20px 0;">
            <h2 style="margin: 0; color: ${isPassing ? '#155724' : '#721c24'}; font-size: 24px;">
              Score: ${assessment.score}/${assessment.totalPoints} (${percentage}%)
            </h2>
            <p style="margin: 10px 0 0 0; color: ${isPassing ? '#155724' : '#721c24'}; font-weight: bold;">
              ${isPassing ? '🎉 Great job! You passed!' : '📚 Keep learning and try again!'}
            </p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.CLIENT_URL}/dashboard" style="display: inline-block; padding: 14px 28px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
              View Detailed Feedback
            </a>
          </div>
          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            Best regards,<br>
            <strong>AI4SID Team</strong>
          </p>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: user.email,
      subject: `Assessment Graded: ${assessment.title}`,
      html,
    });
  }

  // NEW: Send scholarship email
  async sendScholarshipEmail(
    user: { email: string; firstName: string },
    scholarship: {
      code: string;
      programTitle: string;
      discountValue: number;
      discountType: 'percentage' | 'fixed_amount';
      expiresAt?: Date;
      notes?: string;
    }
  ): Promise<void> {
    const discountDisplay = scholarship.discountType === 'percentage' 
      ? `${scholarship.discountValue}%` 
      : `$${scholarship.discountValue}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 32px;">🎓 Scholarship Awarded!</h1>
        </div>
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; color: #333;">Hi ${user.firstName},</p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Congratulations! You have been awarded a scholarship for <strong>${scholarship.programTitle}</strong>.
          </p>
          
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; margin: 30px 0; border-radius: 10px; text-align: center;">
            <p style="color: white; font-size: 14px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 2px;">Your Scholarship Code</p>
            <p style="font-size: 36px; font-weight: bold; color: white; letter-spacing: 4px; margin: 0; font-family: 'Courier New', monospace;">
              ${scholarship.code}
            </p>
          </div>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 15px 0; color: #333;">Scholarship Details:</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; color: #666; font-size: 14px;">Discount:</td>
                <td style="padding: 10px 0; color: #333; font-weight: bold; font-size: 16px; text-align: right;">${discountDisplay}</td>
              </tr>
              ${scholarship.expiresAt ? `
              <tr>
                <td style="padding: 10px 0; color: #666; font-size: 14px;">Expires:</td>
                <td style="padding: 10px 0; color: #dc3545; font-weight: bold; font-size: 14px; text-align: right;">${new Date(scholarship.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
              </tr>
              ` : ''}
            </table>
          </div>
          
          <div style="background-color: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <h3 style="margin: 0 0 10px 0; color: #0d47a1; font-size: 16px;">How to Use Your Scholarship:</h3>
            <ol style="margin: 0; padding-left: 20px; color: #333;">
              <li style="margin: 8px 0;">Visit the program enrollment page</li>
              <li style="margin: 8px 0;">Click <strong>"Enroll Now"</strong></li>
              <li style="margin: 8px 0;">Select <strong>"Use Scholarship Code"</strong></li>
              <li style="margin: 8px 0;">Enter your code: <strong style="color: #764ba2;">${scholarship.code}</strong></li>
              <li style="margin: 8px 0;">Click <strong>"Apply & Enroll"</strong></li>
            </ol>
          </div>
          
          ${scholarship.notes ? `
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>Note:</strong> ${scholarship.notes}
            </p>
          </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.CLIENT_URL}/programs" style="display: inline-block; padding: 14px 28px; background-color: #f5576c; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
              View Program & Enroll
            </a>
          </div>
          
          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            If you have any questions, feel free to reach out to our support team.
          </p>
          
          <p style="font-size: 14px; color: #666; margin-top: 20px;">
            Best regards,<br>
            <strong>AI4SID Team</strong>
          </p>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: user.email,
      subject: `🎓 Scholarship Awarded for ${scholarship.programTitle}`,
      html,
    });
  }
}

export default new EmailService();