import mongoose, { Document, Schema } from "mongoose";

export interface IProgram extends Document {
  title: string;
  slug: string; // For URL
  description: string;
  category?: string;
  tags?: string[];
  objectives? : string[];
  level: string[];

  courses: mongoose.Types.ObjectId[]; // References Course
  order: number; // Optional: order in platform listing
  estimatedHours?: number; // Total across courses

  instructors: mongoose.Types.ObjectId[]; // Users
  coverImage?: string;
  bannerImage?: string;

  price?: number; // Optional: free or paid
  currency?: string; // e.g., 'USD', 'NGN'
  enrollmentLimit?: number; // Optional cap
  isPublished: boolean;

  startDate?: Date; // Cohort-based
  endDate?: Date;   // Cohort-based
  isSelfPaced?: boolean; // Defaults to true

  certificateTemplate?: string; // Optional template
  prerequisites?: string[]; // Program-level requirements
  targetAudience?: string;

  createdBy: mongoose.Types.ObjectId;
  approvalStatus: 'pending' | 'approved' | 'rejected';

  createdAt: Date;
  updatedAt: Date;
}


const programSchema = new Schema<IProgram>(
{
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, unique: true },
  description: { type: String, required: true },
  category: String,
  tags: [String],

  courses: [{ type: Schema.Types.ObjectId, ref: 'Course', required: true }],
  order: { type: Number, default: 1 },
  estimatedHours: Number,

  instructors: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  coverImage: String,
  bannerImage: String,
  level: {
      type: [String],
      enum: {
        values: ["beginner", "intermediate", "advanced"],
        message: "{VALUE} is not a valid level"
      },
      default: []
    },
  price: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  enrollmentLimit: Number,
  isPublished: { type: Boolean, default: false },

   objectives: {
      type: [String],
      default: [],
      validate: {
        validator: function(v: string[]) {
          return v.every(obj => obj.trim().length > 0);
        },
        message: "Objectives cannot contain empty strings"
      }
    },

  startDate: Date,
  endDate: Date,
  isSelfPaced: { type: Boolean, default: true },

  certificateTemplate: String,
  prerequisites: [String],
  targetAudience: String,

  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
},
{ timestamps: true }
);

// Optional: Index for faster program listing
programSchema.index({ title: 1, category: 1 });
programSchema.index({ isPublished: 1, order: 1 });
programSchema.index({ createdBy: 1 });
programSchema.index({ instructors: 1 });

export const Program: mongoose.Model<IProgram> = mongoose.model<IProgram>("Program", programSchema);