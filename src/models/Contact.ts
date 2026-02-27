// ============================================
// src/models/ContactMessage.ts
// ============================================

import mongoose, { Schema, Document } from 'mongoose'

export interface IContactReply {
  message: string
  repliedBy: mongoose.Types.ObjectId
  repliedByName: string
  sentAt: Date
}

export interface IContactMessage extends Document {
  firstName: string
  lastName: string
  email: string
  phone?: string
  subject: string
  message: string
  inquiryType: string
  status: 'unread' | 'read' | 'replied'
  replies: IContactReply[]
  createdAt: Date
  updatedAt: Date
}

const ContactReplySchema = new Schema<IContactReply>(
  {
    message:       { type: String, required: true, trim: true },
    repliedBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repliedByName: { type: String, required: true },
    sentAt:        { type: Date, default: Date.now },
  },
  { _id: true }
)

const ContactMessageSchema = new Schema<IContactMessage>(
  {
    firstName:   { type: String, required: true, trim: true },
    lastName:    { type: String, required: true, trim: true },
    email:       { type: String, required: true, trim: true, lowercase: true },
    phone:       { type: String, trim: true },
    subject:     { type: String, required: true, trim: true },
    message:     { type: String, required: true, trim: true },
    inquiryType: { type: String, default: 'general' },
    status:      { type: String, enum: ['unread', 'read', 'replied'], default: 'unread' },
    replies:     { type: [ContactReplySchema], default: [] },
  },
  { timestamps: true }
)

export const ContactMessage = mongoose.model<IContactMessage>('ContactMessage', ContactMessageSchema)