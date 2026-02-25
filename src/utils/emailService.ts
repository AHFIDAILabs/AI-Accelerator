// ============================================
// src/utils/emailService.ts
// ============================================

import "isomorphic-fetch";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: {
    filename: string;
    contentType?: string;
    content: Buffer;
  }[];
}

interface BaseUser {
  email: string;
  firstName: string;
}

// ─────────────────────────────────────────────────────────────
// Shared design tokens (kept here so all templates are consistent)
// ─────────────────────────────────────────────────────────────

const BRAND = {
  gradientStart: "#667eea",
  gradientEnd: "#764ba2",
  primary: "#667eea",
  danger: "#f5576c",
  warning: "#ffc107",
  success: "#28a745",
  textDark: "#333333",
  textMid: "#555555",
  textLight: "#666666",
  bg: "#f8f9fa",
  name: "EASYAIACADEMY",
  supportEmail: process.env.SUPPORT_EMAIL || "support@aiacademy.com",
};

const header = (title: string) => `
  <div style="background: linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%);
              padding: 40px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 26px; line-height: 1.3;">${title}</h1>
  </div>`;

const footer = () => `
  <p style="font-size: 13px; color: ${BRAND.textLight}; margin-top: 32px; border-top: 1px solid #e0e0e0; padding-top: 16px;">
    Need help? Contact us at
    <a href="mailto:${BRAND.supportEmail}" style="color: ${BRAND.primary};">${BRAND.supportEmail}</a>
    <br/>Best regards, <strong>${BRAND.name} Team</strong>
  </p>`;

const wrapper = (headerHtml: string, bodyHtml: string) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    ${headerHtml}
    <div style="background-color: ${BRAND.bg}; padding: 30px; border-radius: 0 0 10px 10px;">
      ${bodyHtml}
      ${footer()}
    </div>
  </div>`;

const infoBox = (content: string, color = "#e7f3ff", border = "#2196F3") => `
  <div style="background-color: ${color}; border-left: 4px solid ${border};
              padding: 15px; margin: 20px 0; border-radius: 4px;">
    ${content}
  </div>`;

const ctaButton = (label: string, url: string, bg = BRAND.primary) => `
  <div style="text-align: center; margin: 28px 0;">
    <a href="${url}"
       style="display: inline-block; padding: 14px 28px; background-color: ${bg};
              color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
      ${label}
    </a>
  </div>`;

// ─────────────────────────────────────────────────────────────
// EmailService class
// ─────────────────────────────────────────────────────────────

class EmailService {
  private graphClient: Client;
  private sender: string;

  constructor() {
    const tenantId = process.env.MS_TENANT_ID!;
    const clientId = process.env.MS_CLIENT_ID!;
    const clientSecret = process.env.MS_CLIENT_SECRET!;
    this.sender = process.env.MS_SENDER_EMAIL!;

    if (!tenantId || !clientId || !clientSecret || !this.sender) {
      throw new Error("❌ Missing Microsoft OAuth environment variables");
    }

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

    this.graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken(
            "https://graph.microsoft.com/.default"
          );
          return token?.token!;
        },
      },
    });

    console.log("✅ Azure Microsoft Graph Email Service Initialized");
  }

  // ── Core send method ──────────────────────────────────────

  async sendEmail(options: EmailOptions): Promise<void> {
    const message: any = {
      subject: options.subject,
      body: {
        contentType: options.html ? "HTML" : "Text",
        content: options.html || options.text,
      },
      toRecipients: [{ emailAddress: { address: options.to } }],
    };

    if (options.attachments?.length) {
      message.attachments = options.attachments.map((file) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: file.filename,
        contentType: file.contentType || "application/octet-stream",
        contentBytes: file.content.toString("base64"),
      }));
    }

    await this.graphClient
      .api(`/users/${this.sender}/sendMail`)
      .post({ message, saveToSentItems: true });

    console.log(`✅ Email sent to ${options.to}: "${options.subject}"`);
  }

  // ═══════════════════════════════════════════════════════════
  // ENROLLMENT EMAILS
  // ═══════════════════════════════════════════════════════════

  /**
   * Sent to an EXISTING user when an admin or bulk-enroll enrolls them.
   */
  async sendEnrollmentConfirmationEmail(
    user: BaseUser,
    data: { programTitle: string; courseCount: number; loginUrl: string }
  ): Promise<void> {
    const html = wrapper(
      header(`🎉 You're Enrolled in ${data.programTitle}!`),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Hi ${user.firstName},</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        Great news — you have been enrolled in <strong>${data.programTitle}</strong>.
        You now have access to <strong>${data.courseCount} course${data.courseCount !== 1 ? "s" : ""}</strong>.
        Log in to start learning today!
      </p>
      ${infoBox(`
        <p style="margin: 0; color: #0d47a1; font-weight: bold;">📚 What's waiting for you:</p>
        <ul style="margin: 8px 0 0 0; padding-left: 18px; color: ${BRAND.textDark};">
          <li>${data.courseCount} course${data.courseCount !== 1 ? "s" : ""} unlocked</li>
          <li>Track your progress on the dashboard</li>
          <li>Earn a certificate upon completion</li>
        </ul>
      `)}
      ${ctaButton("Go to My Dashboard", data.loginUrl)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: `You're enrolled in ${data.programTitle}! 🎓`,
      html,
    });
  }

  /**
   * Sent when a brand-new user account is created during bulk-email enroll.
   * Includes temporary credentials.
   */
  async sendNewAccountEnrollmentEmail(
    user: BaseUser,
    data: { tempPassword: string; programTitle: string; loginUrl: string }
  ): Promise<void> {
    const html = wrapper(
      header(`Welcome to ${BRAND.name}! 🎉`),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Hi ${user.firstName},</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        An account has been created for you and you have been enrolled in
        <strong>${data.programTitle}</strong>. Use the credentials below to log in.
      </p>
      ${infoBox(`
        <h3 style="margin: 0 0 10px 0; color: #0d47a1;">Your Login Credentials</h3>
        <p style="margin: 4px 0; color: ${BRAND.textDark};"><strong>Email:</strong> ${user.email}</p>
        <p style="margin: 4px 0; color: ${BRAND.textDark};">
          <strong>Temporary Password:</strong>
          <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">${data.tempPassword}</code>
        </p>
      `)}
      ${infoBox(
        `<p style="margin: 0; color: #856404; font-size: 14px;">
          ⚠️ <strong>Important:</strong> Please change your password after your first login for security.
        </p>`,
        "#fff3cd",
        BRAND.warning
      )}
      ${ctaButton("Login to Your Account", data.loginUrl)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: `Welcome to ${BRAND.name} — Your Account is Ready! 🎓`,
      html,
    });
  }

  /**
   * Sent when a student self-enrolls using a scholarship code.
   */
  async sendScholarshipEnrollmentEmail(
    user: BaseUser,
    data: {
      programTitle: string;
      scholarshipCode: string;
      originalPrice: number;
      discountAmount: number;
      finalPrice: number;
      courseCount: number;
      loginUrl: string;
    }
  ): Promise<void> {
    const html = wrapper(
      header(`🎓 Scholarship Enrollment Confirmed!`),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Congratulations ${user.firstName}!</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        Your scholarship has been applied and you are now enrolled in
        <strong>${data.programTitle}</strong>.
      </p>
      ${infoBox(`
        <h3 style="margin: 0 0 10px 0; color: #0d47a1;">Scholarship Summary</h3>
        <p style="margin: 4px 0; color: ${BRAND.textDark};"><strong>Code Used:</strong> ${data.scholarshipCode}</p>
        <p style="margin: 4px 0; color: ${BRAND.textDark};"><strong>Original Price:</strong> $${data.originalPrice.toFixed(2)}</p>
        <p style="margin: 4px 0; color: ${BRAND.textDark};"><strong>Discount:</strong> -$${data.discountAmount.toFixed(2)}</p>
        <p style="margin: 4px 0; color: ${BRAND.success};"><strong>Amount Paid:</strong> $${data.finalPrice.toFixed(2)}</p>
        <p style="margin: 4px 0; color: ${BRAND.textDark};"><strong>Courses Unlocked:</strong> ${data.courseCount}</p>
      `)}
      ${ctaButton("Start Learning Now", data.loginUrl, BRAND.success)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: `Scholarship Enrollment Confirmed — ${data.programTitle} 🎓`,
      html,
    });
  }

  /**
   * Sent when an admin changes the enrollment status
   * (active, suspended, dropped, completed, etc.).
   */
  async sendEnrollmentStatusUpdateEmail(
    user: BaseUser,
    data: {
      programTitle: string;
      newStatus: string;
      emailType: "completed" | "suspended" | "dropped" | "reactivated" | "generic";
      message: string;
      dashboardUrl: string;
    }
  ): Promise<void> {
    const configs: Record<
      typeof data.emailType,
      { emoji: string; subject: string; boxColor: string; boxBorder: string; buttonLabel: string; buttonBg: string }
    > = {
      completed: {
        emoji: "🏆",
        subject: `You completed ${data.programTitle}!`,
        boxColor: "#d4edda",
        boxBorder: BRAND.success,
        buttonLabel: "View Your Certificate",
        buttonBg: BRAND.success,
      },
      reactivated: {
        emoji: "✅",
        subject: `Your enrollment in ${data.programTitle} is active`,
        boxColor: "#e7f3ff",
        boxBorder: "#2196F3",
        buttonLabel: "Continue Learning",
        buttonBg: BRAND.primary,
      },
      suspended: {
        emoji: "⏸️",
        subject: `Enrollment suspended — ${data.programTitle}`,
        boxColor: "#fff3cd",
        boxBorder: BRAND.warning,
        buttonLabel: "Contact Support",
        buttonBg: "#f0a500",
      },
      dropped: {
        emoji: "📋",
        subject: `Enrollment update — ${data.programTitle}`,
        boxColor: "#f8d7da",
        boxBorder: BRAND.danger,
        buttonLabel: "Contact Support",
        buttonBg: BRAND.danger,
      },
      generic: {
        emoji: "ℹ️",
        subject: `Enrollment update — ${data.programTitle}`,
        boxColor: "#e7f3ff",
        boxBorder: "#2196F3",
        buttonLabel: "Go to Dashboard",
        buttonBg: BRAND.primary,
      },
    };

    const cfg = configs[data.emailType];

    const html = wrapper(
      header(`${cfg.emoji} Enrollment Update`),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Hi ${user.firstName},</p>
      ${infoBox(
        `<p style="margin: 0; font-size: 15px; color: ${BRAND.textDark};">${data.message}</p>`,
        cfg.boxColor,
        cfg.boxBorder
      )}
      ${ctaButton(cfg.buttonLabel, data.dashboardUrl, cfg.buttonBg)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: cfg.subject,
      html,
    });
  }

  /**
   * Sent when all courses in a program are marked complete
   * (triggered from updateCourseProgress).
   */
  async sendProgramCompletionEmail(
    user: BaseUser,
    data: { programTitle: string; completionDate: Date; dashboardUrl: string }
  ): Promise<void> {
    const formattedDate = data.completionDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const html = wrapper(
      header(`🏆 Congratulations, ${user.firstName}!`),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">
        You have successfully completed <strong>${data.programTitle}</strong>!
      </p>
      ${infoBox(`
        <p style="margin: 0; color: ${BRAND.textDark};">
          🎓 <strong>Completion Date:</strong> ${formattedDate}<br/>
          Your certificate will be available shortly in your dashboard.
        </p>
      `, "#d4edda", BRAND.success)}
      ${ctaButton("View My Dashboard", data.dashboardUrl, BRAND.success)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: `You completed ${data.programTitle}! 🏆`,
      html,
    });
  }

  /**
   * Sent when an admin removes a student's enrollment.
   */
  async sendEnrollmentRemovedEmail(
    user: BaseUser,
    data: { programTitle: string; supportUrl: string }
  ): Promise<void> {
    const html = wrapper(
      header("Enrollment Removed"),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Hi ${user.firstName},</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        Your enrollment in <strong>${data.programTitle}</strong> has been removed.
        If you believe this was a mistake or have any questions, please contact our support team.
      </p>
      ${ctaButton("Contact Support", data.supportUrl, BRAND.danger)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: `Enrollment update for ${data.programTitle}`,
      html,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ACCOUNT & AUTH EMAILS
  // ═══════════════════════════════════════════════════════════

  async sendWelcomeEmail(user: BaseUser): Promise<void> {
    const html = wrapper(
      header(`Welcome to ${BRAND.name}! 🎉`),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Hi ${user.firstName},</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        Thank you for joining the <strong>${BRAND.name} Program</strong>. We're excited to have you on board!
      </p>
      ${ctaButton("Go to Dashboard", `${process.env.CLIENT_URL}/dashboard`)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: `Welcome to ${BRAND.name}! 🎉`,
      html,
    });
  }

  async sendPasswordResetEmail(
    user: BaseUser,
    resetToken: string
  ): Promise<void> {
    const resetUrl = `${process.env.CLIENT_URL}/auth/resetPassword/${resetToken}`;

    const html = wrapper(
      header("Password Reset Request 🔐"),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Hi ${user.firstName},</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        We received a request to reset your password. Click the button below — this link expires in
        <strong>1 hour</strong>.
      </p>
      ${ctaButton("Reset My Password", resetUrl, BRAND.danger)}
      ${infoBox(
        `<p style="margin: 0; color: #856404; font-size: 13px;">
          If you did not request a password reset, you can safely ignore this email.
        </p>`,
        "#fff3cd",
        BRAND.warning
      )}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      html,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // CERTIFICATE & ASSESSMENT EMAILS
  // ═══════════════════════════════════════════════════════════

  async sendCertificateEmail(
    user: BaseUser,
    certificateUrl: string
  ): Promise<void> {
    const html = wrapper(
      header("Your Certificate is Ready! 🎉"),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Congratulations ${user.firstName}!</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        Your certificate of completion has been issued and is ready to download.
      </p>
      ${ctaButton("Download Certificate", certificateUrl, BRAND.success)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: `Your ${BRAND.name} Certificate is Ready! 🏆`,
      html,
    });
  }

  async sendAssessmentGradedEmail(
    user: BaseUser,
    assessment: { title: string; score: number; totalPoints: number }
  ): Promise<void> {
    const percentage = Math.round(
      (assessment.score / assessment.totalPoints) * 100
    );
    const passed = percentage >= 50;

    const html = wrapper(
      header(`Assessment Graded ✍️`),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Hi ${user.firstName},</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        Your submission for <strong>${assessment.title}</strong> has been graded.
      </p>
      ${infoBox(`
        <p style="margin: 4px 0; color: ${BRAND.textDark};"><strong>Score:</strong> ${assessment.score} / ${assessment.totalPoints}</p>
        <p style="margin: 4px 0; color: ${passed ? BRAND.success : BRAND.danger};">
          <strong>Result:</strong> ${percentage}% — ${passed ? "Passed ✅" : "Needs improvement ❌"}
        </p>
      `, passed ? "#d4edda" : "#f8d7da", passed ? BRAND.success : BRAND.danger)}
      ${ctaButton("View Details", `${process.env.CLIENT_URL}/dashboard`)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: `Assessment Graded: ${assessment.title}`,
      html,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SCHOLARSHIP EMAIL  (issued by admin, before enrollment)
  // ═══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════
  // AUTH / ACCOUNT SECURITY EMAILS
  // ═══════════════════════════════════════════════════════════

  /**
   * Sent (non-blocking) after a successful profile update.
   */
  async sendProfileUpdatedEmail(user: BaseUser): Promise<void> {
    const html = wrapper(
      header("Profile Updated ✏️"),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Hi ${user.firstName},</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        Your profile has been updated successfully. If you did not make this change,
        please contact support immediately.
      </p>
      ${infoBox(
        `<p style="margin: 0; color: #856404; font-size: 14px;">
          ⚠️ If this wasn't you, secure your account by resetting your password right away.
        </p>`,
        "#fff3cd",
        BRAND.warning
      )}
      ${ctaButton("Go to My Profile", `${process.env.CLIENT_URL}/profile`)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: "Your profile has been updated",
      html,
    });
  }

  /**
   * Security alert sent (non-blocking) after a successful password change.
   * All sessions are already invalidated at this point.
   */
  async sendPasswordChangedEmail(user: BaseUser): Promise<void> {
    const html = wrapper(
      header("Password Changed 🔐"),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Hi ${user.firstName},</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        Your password was changed successfully and all active sessions have been signed out.
        Please log in again with your new password.
      </p>
      ${infoBox(
        `<p style="margin: 0; color: #721c24; font-size: 14px;">
          🚨 If you did not make this change, reset your password immediately and contact support.
        </p>`,
        "#f8d7da",
        BRAND.danger
      )}
      ${ctaButton("Log In", `${process.env.CLIENT_URL}/auth/login`)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: "Your password has been changed",
      html,
    });
  }

  /**
   * Confirmation sent (non-blocking) after a password reset completes successfully.
   */
  async sendPasswordResetSuccessEmail(user: BaseUser): Promise<void> {
    const html = wrapper(
      header("Password Reset Successful ✅"),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Hi ${user.firstName},</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        Your password has been reset successfully. You can now log in with your new password.
        All previous sessions have been signed out for your security.
      </p>
      ${infoBox(
        `<p style="margin: 0; color: #856404; font-size: 14px;">
          ⚠️ If you did not request this reset, please contact support immediately.
        </p>`,
        "#fff3cd",
        BRAND.warning
      )}
      ${ctaButton("Log In Now", `${process.env.CLIENT_URL}/auth/login`)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: "Your password has been reset successfully",
      html,
    });
  }

  async sendScholarshipEmail(
    user: BaseUser,
    scholarship: {
      code: string;
      programTitle: string;
      discountValue: number;
      discountType: "percentage" | "fixed_amount";
      expiresAt?: Date;
      notes?: string;
    }
  ): Promise<void> {
    const discountDisplay =
      scholarship.discountType === "percentage"
        ? `${scholarship.discountValue}%`
        : `$${scholarship.discountValue}`;

    const expiry = scholarship.expiresAt
      ? `<p style="margin: 4px 0; color: ${BRAND.textDark};"><strong>Expires:</strong> ${scholarship.expiresAt.toLocaleDateString()}</p>`
      : "";

    const html = wrapper(
      header("🎓 Scholarship Awarded!"),
      `
      <p style="font-size: 16px; color: ${BRAND.textDark};">Hi ${user.firstName},</p>
      <p style="font-size: 16px; color: ${BRAND.textMid}; line-height: 1.6;">
        You have been awarded a scholarship for <strong>${scholarship.programTitle}</strong>!
      </p>
      ${infoBox(`
        <h3 style="margin: 0 0 10px 0; color: #0d47a1;">Scholarship Details</h3>
        <p style="margin: 4px 0; color: ${BRAND.textDark};"><strong>Code:</strong> <code style="background:#fff;padding:2px 6px;border-radius:3px;">${scholarship.code}</code></p>
        <p style="margin: 4px 0; color: ${BRAND.textDark};"><strong>Discount:</strong> ${discountDisplay}</p>
        ${expiry}
        ${scholarship.notes ? `<p style="margin: 4px 0; color: ${BRAND.textMid}; font-size: 13px;">${scholarship.notes}</p>` : ""}
      `)}
      ${ctaButton("Enroll Now", `${process.env.CLIENT_URL}/programs`)}
      `
    );

    await this.sendEmail({
      to: user.email,
      subject: `🎓 Scholarship Awarded for ${scholarship.programTitle}`,
      html,
    });
  }
}

export default new EmailService();