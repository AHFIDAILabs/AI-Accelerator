import mongoose, { Schema, Document, Model } from "mongoose";

export enum LessonType {
  VIDEO = "video",
  READING = "reading",
  CODING = "coding",
  WORKSHOP = "workshop",
  PROJECT = "project",
  QUIZ = "quiz",
  PDF = "pdf",
  SLIDES = "slides",
  OTHER = "other"
}

export interface ILessonResource {
  title: string;
  type: string;
  url: string;
  size?: number;
  duration?: number;
}

export interface ILesson extends Document {
  moduleId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;

  title: string;
  description: string;
  type: LessonType;

  order: number;
  estimatedMinutes: number;

  content: string;
  learningObjectives: string[];

  resources: ILessonResource[];

  isPreview: boolean;
  isRequired: boolean;

  completionRule: {
    type: "view" | "quiz_pass" | "assignment_submit" | "project_review";
    passingScore?: number;
  };

  assessmentCount: number;

  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const resourceSchema = new Schema<ILessonResource>(
  {
    title: { type: String, required: true },
    type: { type: String, required: true },
    url: { type: String, required: true },
    size: Number,
    duration: Number
  },
  { _id: false }
);

const lessonSchema = new Schema<ILesson>(
  {
    moduleId: {
      type: Schema.Types.ObjectId,
      ref: "Module",
      required: true,
      index: true
    },

    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true
    },

    title: { type: String, required: true },
    description: { type: String, required: true },

    type: {
      type: String,
      enum: Object.values(LessonType),
      required: true
    },

    order: { type: Number, required: true },

    estimatedMinutes: { type: Number, required: true },

    content: { type: String, required: true },

    learningObjectives: [String],

    resources: [resourceSchema],

    isPreview: { type: Boolean, default: false },
    isRequired: { type: Boolean, default: true },

    completionRule: {
      type: {
        type: String,
        enum: ["view", "quiz_pass", "assignment_submit", "project_review"],
        default: "view"
      },
      passingScore: Number
    },

    assessmentCount: { type: Number, default: 0 },

    isPublished: { type: Boolean, default: false }
  },
  { timestamps: true }
);

lessonSchema.index({ moduleId: 1, order: 1 }, { unique: true });

export const Lesson: Model<ILesson> = mongoose.model("Lesson", lessonSchema);