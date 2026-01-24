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
  program: mongoose.Types.ObjectId;
  status: EnrollmentStatus;
  enrollmentDate: Date;
  completionDate?: Date;
  dropDate?: Date;
  cohort?: string;
  notes?: string;

  coursesProgress: {
    course: mongoose.Types.ObjectId;
    status: EnrollmentStatus;
    lessonsCompleted: number;
    totalLessons: number;
    completionDate?: Date;
  }[];

  createdAt: Date;
  updatedAt: Date;
}


const enrollmentSchema = new Schema<IEnrollment>(
{
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  program: { type: Schema.Types.ObjectId, ref: 'Program', required: true, index: true },

  status: { type: String, enum: Object.values(EnrollmentStatus), default: EnrollmentStatus.PENDING },

  enrollmentDate: { type: Date, default: Date.now },
  completionDate: Date,
  dropDate: Date,
  cohort: String,
  notes: String,

  coursesProgress: [{
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    status: { type: String, enum: Object.values(EnrollmentStatus), default: EnrollmentStatus.PENDING },
    lessonsCompleted: { type: Number, default: 0 },
    totalLessons: { type: Number, default: 0 },
    completionDate: Date
  }]
},
{ timestamps: true }
);

// Unique per student/program
enrollmentSchema.index({ studentId: 1, program: 1 }, { unique: true });


export const Enrollment: Model<IEnrollment> = mongoose.model<IEnrollment>('Enrollment', enrollmentSchema);