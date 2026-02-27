// ============================================
// src/controllers/contact.controller.ts
// ============================================

import { Request, Response } from 'express'
import { asyncHandler } from '../middlewares/asyncHandler'
import { AuthRequest } from '../middlewares/auth'
import { ContactMessage } from '../models/Contact'
import emailService from '../utils/emailService'

const APP_URL    = process.env.CLIENT_URL   || 'http://localhost:3000'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.MS_SENDER_EMAIL!

// ── PUBLIC: Submit contact form ───────────────────────────────────────────────
export const submitContactForm = asyncHandler(async (req: Request, res: Response) => {
  const { firstName, lastName, email, phone, subject, message, inquiryType } = req.body

  if (!firstName || !lastName || !email || !subject || !message) {
    return res.status(400).json({ success: false, error: 'Please fill in all required fields' })
  }

  const contact = await ContactMessage.create({
    firstName, lastName, email, phone, subject, message, inquiryType,
  })

  // Notify admin (non-blocking)
  emailService.sendEmail({
    to:      ADMIN_EMAIL,
    subject: `[New Contact] ${(inquiryType as string).toUpperCase()}: ${subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                    padding: 24px; border-radius: 8px 8px 0 0; border-bottom: 3px solid #a3e635;">
          <h2 style="color: #a3e635; margin: 0;">New Contact Form Submission</h2>
        </div>
        <div style="background: #1e293b; padding: 24px; border-radius: 0 0 8px 8px; color: #e2e8f0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #94a3b8; width: 140px;">Name</td>
                <td style="padding: 8px 0; font-weight: 600;">${firstName} ${lastName}</td></tr>
            <tr><td style="padding: 8px 0; color: #94a3b8;">Email</td>
                <td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #a3e635;">${email}</a></td></tr>
            ${phone ? `<tr><td style="padding: 8px 0; color: #94a3b8;">Phone</td>
                <td style="padding: 8px 0;">${phone}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #94a3b8;">Inquiry Type</td>
                <td style="padding: 8px 0; text-transform: capitalize;">${inquiryType}</td></tr>
            <tr><td style="padding: 8px 0; color: #94a3b8;">Subject</td>
                <td style="padding: 8px 0; font-weight: 600;">${subject}</td></tr>
          </table>
          <div style="margin-top: 16px; padding: 16px; background: #0f172a; border-radius: 6px; border-left: 3px solid #a3e635;">
            <p style="color: #94a3b8; margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Message</p>
            <p style="margin: 0; line-height: 1.7;">${message}</p>
          </div>
          <div style="margin-top: 24px; text-align: center;">
            <a href="${APP_URL}/dashboard/admin/contacts"
               style="display: inline-block; padding: 12px 24px; background: #a3e635; color: #0f172a;
                      border-radius: 6px; text-decoration: none; font-weight: 700;">
              View in Admin Dashboard →
            </a>
          </div>
        </div>
      </div>`,
  }).catch(err => console.error('Admin notify failed (non-fatal):', err))

  // Auto-reply to sender (non-blocking)
  emailService.sendEmail({
    to:      email,
    subject: `We received your message — ${subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                    padding: 24px; border-radius: 8px 8px 0 0; border-bottom: 3px solid #a3e635;">
          <h2 style="color: #a3e635; margin: 0;">Thanks for reaching out, ${firstName}!</h2>
        </div>
        <div style="background: #f8f9fa; padding: 28px; border-radius: 0 0 8px 8px; color: #333;">
          <p style="font-size: 16px; line-height: 1.6;">
            We've received your message and will get back to you within <strong>24 hours</strong>.
          </p>
          <div style="background: #fff; border-left: 4px solid #a3e635; padding: 16px; border-radius: 4px; margin: 20px 0;">
            <p style="color: #666; margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Your message</p>
            <p style="font-weight: 600; margin: 0 0 8px;">${subject}</p>
            <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.6;">
              ${message.substring(0, 200)}${message.length > 200 ? '…' : ''}
            </p>
          </div>
          <p style="color: #666; font-size: 14px;">For urgent inquiries, reach us on WhatsApp: <strong>+234 (0) 123 4567</strong></p>
          <p style="font-size: 13px; color: #999; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
            Best regards, <strong>AI4SID Academy Team</strong>
          </p>
        </div>
      </div>`,
  }).catch(err => console.error('Auto-reply failed (non-fatal):', err))

  return res.status(201).json({
    success: true,
    message: "Message received! We'll get back to you within 24 hours.",
    data: { id: contact._id },
  })
})

// ── ADMIN: Get all messages ───────────────────────────────────────────────────
export const getContactMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' })
  }

  const { page = 1, limit = 50, status, inquiryType } = req.query

  const filter: any = {}
  if (status)      filter.status      = status
  if (inquiryType) filter.inquiryType = inquiryType

  const total    = await ContactMessage.countDocuments(filter)
  const unread   = await ContactMessage.countDocuments({ status: 'unread' })
  const messages = await ContactMessage.find(filter)
    .sort({ createdAt: -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)

  return res.status(200).json({ success: true, data: messages, total, unread })
})

// ── ADMIN: Mark as read ───────────────────────────────────────────────────────
export const markContactRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' })
  }

  const msg = await ContactMessage.findByIdAndUpdate(
    req.params.id,
    { status: 'read' },
    { new: true }
  )
  if (!msg) return res.status(404).json({ success: false, error: 'Message not found' })

  return res.status(200).json({ success: true, data: msg })
})

// ── ADMIN: Reply to a message ─────────────────────────────────────────────────
export const replyToContact = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' })
  }

  const { message: replyMessage } = req.body
  if (!replyMessage?.trim()) {
    return res.status(400).json({ success: false, error: 'Reply message is required' })
  }

  const contact = await ContactMessage.findById(req.params.id)
  if (!contact) return res.status(404).json({ success: false, error: 'Message not found' })

  const adminName = `${req.user.firstName} ${req.user.lastName}`

  // Push reply into replies array & mark as replied
  contact.replies.push({
    message:       replyMessage.trim(),
    repliedBy:     req.user._id,
    repliedByName: adminName,
    sentAt:        new Date(),
  })
  contact.status = 'replied'
  await contact.save()

  // Send the reply email to the original sender
  await emailService.sendEmail({
    to:      contact.email,
    subject: `Re: ${contact.subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                    padding: 24px; border-radius: 8px 8px 0 0; border-bottom: 3px solid #a3e635;">
          <h2 style="color: #a3e635; margin: 0;">Reply from AI4SID Academy</h2>
        </div>
        <div style="background: #f8f9fa; padding: 28px; border-radius: 0 0 8px 8px; color: #333;">
          <p style="font-size: 16px; line-height: 1.6;">Hi ${contact.firstName},</p>

          <!-- Admin reply -->
          <div style="background: #fff; border-left: 4px solid #a3e635;
                      padding: 18px; border-radius: 4px; margin: 20px 0;">
            <p style="color: #666; margin: 0 0 10px; font-size: 11px;
                      text-transform: uppercase; letter-spacing: 1px;">
              Reply from ${adminName}
            </p>
            <p style="margin: 0; line-height: 1.8; color: #333; font-size: 15px; white-space: pre-line;">
              ${replyMessage.trim()}
            </p>
          </div>

          <!-- Original message quoted -->
          <div style="margin-top: 24px; padding: 16px; background: #e9ecef;
                      border-radius: 6px; border-left: 3px solid #ccc;">
            <p style="color: #888; margin: 0 0 8px; font-size: 11px;
                      text-transform: uppercase; letter-spacing: 1px;">
              Your original message
            </p>
            <p style="font-weight: 600; margin: 0 0 6px; color: #555;">${contact.subject}</p>
            <p style="margin: 0; color: #777; font-size: 13px; line-height: 1.6;">
              ${contact.message.substring(0, 300)}${contact.message.length > 300 ? '…' : ''}
            </p>
          </div>

          <p style="font-size: 13px; color: #999; margin-top: 24px;
                    padding-top: 16px; border-top: 1px solid #e0e0e0;">
            Best regards, <strong>AI4SID Academy Team</strong><br/>
            <a href="mailto:${ADMIN_EMAIL}" style="color: #a3e635;">${ADMIN_EMAIL}</a>
          </p>
        </div>
      </div>`,
  })

  return res.status(200).json({
    success: true,
    message: `Reply sent to ${contact.email}`,
    data: contact,
  })
})

// ── ADMIN: Delete message ─────────────────────────────────────────────────────
export const deleteContactMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' })
  }

  const msg = await ContactMessage.findByIdAndDelete(req.params.id)
  if (!msg) return res.status(404).json({ success: false, error: 'Message not found' })

  return res.status(200).json({ success: true, message: 'Message deleted' })
})