import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ICourse extends Document {
  title: string;
  description: string;
  duration: {
    weeks: number;
    hoursPerWeek: number;
    totalHours: number;
  };
  objectives: string[];
  prerequisites: string[];
  targetAudience: string;
  coverImage?: string;
  isPublished: boolean;
  startDate?: Date;
  endDate?: Date;
  enrollmentLimit?: number;
  currentEnrollment: number;
  certificationCriteria: {
    minimumAttendance: number;
    minimumQuizScore: number;
    requiredProjects: number;
    capstoneRequired: boolean;
  };
  createdBy: mongoose.Types.ObjectId;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const courseSchema = new Schema<ICourse>(
  {
    title: {
      type: String,
      required: [true, 'Course title is required'],
      trim: true,
      unique: true
    },
    description: {
      type: String,
      required: [true, 'Course description is required']
    },
    duration: {
      weeks: { type: Number, required: true },
      hoursPerWeek: { type: Number, required: true },
      totalHours: { type: Number, required: true }
    },
    objectives: [{
      type: String,
      required: true
    }],
    prerequisites: [String],
    targetAudience: {
      type: String,
      required: true
    },
    coverImage: String,
    isPublished: {
      type: Boolean,
      default: false
    },
    startDate: Date,
    endDate: Date,
    enrollmentLimit: Number,
    currentEnrollment: {
      type: Number,
      default: 0
    },
    certificationCriteria: {
      minimumAttendance: {
        type: Number,
        default: 70,
        min: 0,
        max: 100
      },
      minimumQuizScore: {
        type: Number,
        default: 70,
        min: 0,
        max: 100
      },
      requiredProjects: {
        type: Number,
        default: 5
      },
      capstoneRequired: {
        type: Boolean,
        default: true
      }
    },
   createdBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true
},
approvalStatus: {
  type: String,
  enum: ["pending", "approved", "rejected"],
  default: "pending"
}
  },
  { timestamps: true }
);

export const Course: Model<ICourse> = mongoose.model<ICourse>('Course', courseSchema);