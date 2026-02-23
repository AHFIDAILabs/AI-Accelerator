import mongoose, { Schema, Model, Document } from "mongoose";

export enum EnrollmentStatus {
  PENDING = "pending",
  ACTIVE = "active",
  COMPLETED = "completed",
  DROPPED = "dropped",
  SUSPENDED = "suspended"
}

export interface IEnrollment extends Document {
  studentId: mongoose.Types.ObjectId;
  programId: mongoose.Types.ObjectId;

  status: EnrollmentStatus;
  enrollmentDate: Date;
  completionDate?: Date;
  dropDate?: Date;
  cohort?: string;
  notes?: string;

  coursesProgress: {
    courseId: mongoose.Types.ObjectId;
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
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      
    },

    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(EnrollmentStatus),
      default: EnrollmentStatus.PENDING
    },

    enrollmentDate: { type: Date, default: Date.now },
    completionDate: Date,
    dropDate: Date,
    cohort: String,
    notes: String,

    coursesProgress: [
      {
        courseId: {
          type: Schema.Types.ObjectId,
          ref: "Course",
          required: true,
        },

        status: {
          type: String,
          enum: Object.values(EnrollmentStatus),
          default: EnrollmentStatus.PENDING
        },

        lessonsCompleted: { type: Number, default: 0 },
        totalLessons: { type: Number, default: 0 },
        completionDate: Date
      }
    ]
  },
  { timestamps: true }
);

// Unique per student per program
enrollmentSchema.index({ studentId: 1, programId: 1 }, { unique: true });

// Useful for analytics (optional but important)
enrollmentSchema.index({ studentId: 1 });
enrollmentSchema.index({ programId: 1 });
enrollmentSchema.index({ "coursesProgress.courseId": 1 });

export const Enrollment: Model<IEnrollment> =
  mongoose.model<IEnrollment>("Enrollment", enrollmentSchema);