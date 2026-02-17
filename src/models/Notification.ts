import mongoose, { Schema, Model, Document } from "mongoose";

export enum NotificationType {
  PROGRAM_UPDATE = 'program_update',
  COURSE_UPDATE = 'course_update',
  ASSESSMENT_DUE = 'assessment_due',
  GRADE_POSTED = 'grade_posted',
  CERTIFICATE_ISSUED = 'certificate_issued',
  ANNOUNCEMENT = 'announcement',
  REMINDER = 'reminder'
}

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  programId?: mongoose.Types.ObjectId;
  type: NotificationType;

  title: string;
  message: string;

  relatedId?: mongoose.Types.ObjectId;
  relatedModel?: 'Program' | 'Course' | 'Module' | 'Lesson' | 'Assessment' | 'Certificate' | 'Submission';
  url?: string;

  isRead: boolean;
  readAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    programId: { type: Schema.Types.ObjectId, ref: 'Program', index: true },

    type: { type: String, enum: Object.values(NotificationType), required: true },

    title: { type: String, required: true },
    message: { type: String, required: true },

    relatedId: { type: Schema.Types.ObjectId, refPath: 'relatedModel' },

    relatedModel: {
      type: String,
      enum: ['Program', 'Course', 'Module', 'Lesson', 'Assessment', 'Certificate', 'Submission']
    },

    url: String,

    isRead: { type: Boolean, default: false },
    readAt: Date
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification: Model<INotification> =
  mongoose.model('Notification', notificationSchema);
