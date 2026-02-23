import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICourse extends Document {
  programId: mongoose.Types.ObjectId;
  title: string;
  slug: string;

  order: number;
  description: string;
  level: ("beginner" | "intermediate" | "advanced")[];
  estimatedHours: number;

  moduleCount: number;
  lessonCount: number;

  objectives: string[];
  prerequisites: string[];
  targetAudience: string;

  instructorId: mongoose.Types.ObjectId;

  coverImage?: string;
  isPublished: boolean;

  completionCriteria: {
    minimumQuizScore: number;
    requiredProjects: number;
    capstoneRequired: boolean;
  };
  currentEnrollment?: number;

  createdBy: mongoose.Types.ObjectId;
  approvalStatus: "pending" | "approved" | "rejected";

  createdAt: Date;
  updatedAt: Date;
}

const courseSchema = new Schema<ICourse>(
  {
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
    },

    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, trim: true },

    order: { type: Number, required: true },

    description: { type: String, required: true },

    level: {
      type: [String],
      enum: ["beginner", "intermediate", "advanced"],
      default: []
    },

    estimatedHours: { type: Number, default: 0 },

    moduleCount: { type: Number, default: 0 },
    lessonCount: { type: Number, default: 0 },

    currentEnrollment: { type: Number, default: 0 },

    objectives: [String],
    prerequisites: [String],
    targetAudience: String,

    instructorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    coverImage: String,
    isPublished: { type: Boolean, default: false },

    completionCriteria: {
      minimumQuizScore: { type: Number, default: 70 },
      requiredProjects: { type: Number, default: 0 },
      capstoneRequired: { type: Boolean, default: false }
    },

    createdBy: {
      type: Schema.Types.ObjectId,
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

courseSchema.index({ programId: 1, order: 1 }, { unique: true });
courseSchema.index({ slug: 1 });

export const Course: Model<ICourse> = mongoose.model("Course", courseSchema);