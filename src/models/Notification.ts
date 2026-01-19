// src/models/Notification.ts
import mongoose, { Schema, Model, Document } from "mongoose";

export enum NotificationType {
  COURSE_UPDATE = 'course_update',
  ASSESSMENT_DUE = 'assessment_due',
  GRADE_POSTED = 'grade_posted',
  CERTIFICATE_ISSUED = 'certificate_issued',
  ANNOUNCEMENT = 'announcement',
  REMINDER = 'reminder'
}

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: mongoose.Types.ObjectId;
  relatedModel?: 'Course' | 'Module' | 'Lesson' | 'Assessment' | 'Certificate';
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    relatedId: {
      type: Schema.Types.ObjectId,
      refPath: 'relatedModel'
    },
    relatedModel: {
      type: String,
      enum: ['Course', 'Module', 'Lesson', 'Assessment', 'Certificate']
    },
    isRead: {
      type: Boolean,
      default: false
    },
    readAt: Date
  },
  { timestamps: true }
);

// Optional: compound index to speed up fetching notifications per user
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification: Model<INotification> = mongoose.model<INotification>('Notification', notificationSchema);
