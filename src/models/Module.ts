import mongoose, { Schema, Document, Model } from "mongoose";

export interface IModule extends Document {
  courseId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  lessons: mongoose.Types.ObjectId[];

  order: number;
  weekNumber?: number;

  learningObjectives: string[];
  sequenceLabel?: string;

  estimatedMinutes?: number;
  lessonCount: number;

  type: "core" | "project" | "assessment" | "capstone";
  isPublished: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const moduleSchema = new Schema<IModule>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    lessons: [
      {
        type: Schema.Types.ObjectId,
        ref: "Lesson"
      }
    ],

    title: { type: String, required: true },
    description: { type: String, required: true },

    order: { type: Number, required: true },

    weekNumber: Number,
    sequenceLabel: String,

    learningObjectives: [String],

    estimatedMinutes: Number,
    lessonCount: { type: Number, default: 0 },

    type: {
      type: String,
      enum: ["core", "project", "assessment", "capstone"],
      default: "core"
    },

    isPublished: { type: Boolean, default: false }
  },
  { timestamps: true }
);

moduleSchema.index({ courseId: 1, order: 1 }, { unique: true });

export const Module: Model<IModule> = mongoose.model("Module", moduleSchema);