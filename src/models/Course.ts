import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ICourse extends Document {
  program: mongoose.Types.ObjectId;
  order: number;

  title: string;
  description: string;
  estimatedHours: number;

  objectives: string[];
  prerequisites: string[];
  targetAudience: string;

  coverImage?: string;
  isPublished: boolean;

  completionCriteria: {
    minimumQuizScore: number;
    requiredProjects: number;
    capstoneRequired: boolean;
  };
  currentEnrollment?: number;

  createdBy: mongoose.Types.ObjectId;
  approvalStatus: 'pending' | 'approved' | 'rejected';

  createdAt: Date;
  updatedAt: Date;
}


const courseSchema = new Schema<ICourse>(
{
  program: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Program",
    required: true,
    index: true
  },

  order: {
    type: Number,
    required: true
  },

  title: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    required: true
  },

  estimatedHours: Number,
  currentEnrollment: { type: Number, default: 0 },

  objectives: [{ type: String }],
  prerequisites: [String],
  targetAudience: String,

  coverImage: String,

  isPublished: { type: Boolean, default: false },

  completionCriteria: {
    minimumQuizScore: { type: Number, default: 70 },
    requiredProjects: { type: Number, default: 5 },
    capstoneRequired: { type: Boolean, default: true }
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