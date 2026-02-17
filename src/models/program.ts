import mongoose, { Schema, Document, Model } from "mongoose";

export interface IProgram extends Document {
  title: string;
  slug: string;
  description: string;
courses: mongoose.Types.ObjectId[];
  category?: string;
  tags?: string[];
  objectives?: string[];
  level: ("beginner" | "intermediate" | "advanced")[];

  courseCount: number;
  estimatedHours?: number;

  instructors: mongoose.Types.ObjectId[];
  coverImage?: string;
  bannerImage?: string;

  price?: number;
  currency?: string;
  enrollmentLimit?: number;

  isPublished: boolean;
  isSelfPaced: boolean;

  startDate?: Date;
  endDate?: Date;

  certificateTemplate?: string;
  prerequisites?: string[];
  targetAudience?: string;

  createdBy: mongoose.Types.ObjectId;
  approvalStatus: "pending" | "approved" | "rejected";

  createdAt: Date;
  updatedAt: Date;
}

const programSchema = new Schema<IProgram>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },

    description: { type: String, required: true },
    category: String,
    tags: [String],
courses: [{ type: Schema.Types.ObjectId, ref: "Course" }],
    objectives: { type: [String], default: [] },
    level: {
      type: [String],
      enum: ["beginner", "intermediate", "advanced"],
      default: []
    },

    courseCount: { type: Number, default: 0 },
    estimatedHours: Number,

    instructors: [{ type: Schema.Types.ObjectId, ref: "User" }],
    coverImage: String,
    bannerImage: String,

    price: { type: Number, default: 0 },
    currency: { type: String, default: "USD" },
    enrollmentLimit: Number,

    isPublished: { type: Boolean, default: false },
    isSelfPaced: { type: Boolean, default: true },

    startDate: Date,
    endDate: Date,

    certificateTemplate: String,
    prerequisites: [String],
    targetAudience: String,

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    }
  },
  { timestamps: true }
);

programSchema.index({ title: 1, category: 1 });
programSchema.index({ slug: 1 });


export const Program: Model<IProgram> = mongoose.model("Program", programSchema);