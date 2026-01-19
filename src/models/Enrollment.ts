import mongoose, { Schema, Model, Document } from "mongoose";

export enum EnrollmentStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  DROPPED = 'dropped',
  SUSPENDED = 'suspended'
}

export interface IEnrollment extends Document {
  studentId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  status: EnrollmentStatus;
  enrollmentDate: Date;
  completionDate?: Date;
  dropDate?: Date;
  cohort?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const enrollmentSchema = new Schema<IEnrollment>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: Object.values(EnrollmentStatus),
      default: EnrollmentStatus.PENDING
    },
    enrollmentDate: {
      type: Date,
      default: Date.now
    },
    completionDate: Date,
    dropDate: Date,
    cohort: String,

    notes: String
  },
  { timestamps: true }
);

// Compound index for unique enrollment
enrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

export const Enrollment: Model<IEnrollment> = mongoose.model<IEnrollment>('Enrollment', enrollmentSchema);