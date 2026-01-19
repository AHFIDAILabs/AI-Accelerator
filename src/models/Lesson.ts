import mongoose, { Document, Model, Schema } from "mongoose";

export enum LessonType {
  VIDEO = "video",
  READING = "reading",
  CODING = "coding",
  WORKSHOP = "workshop",
  PROJECT = "project",
  QUIZ = "quiz",
}

export enum ResourceType {
  PDF = "pdf",
  VIDEO = "video",
  CODE = "code",
  LINK = "link",
  SLIDES = "slides",
  OTHER = "other",
}

export interface IResource {
  title: string;
  type: ResourceType;
  url: string;
  size?: number;
  duration?: number; // for videos in minutes
}

export interface ILesson extends Document {
  moduleId: mongoose.Types.ObjectId;
  dayNumber: number;
  title: string;
  description: string;
  type: LessonType;
  duration: number; // in hours
  content: string; // Rich text
  learningObjectives: string[];
  resources: {
    video?: IResource[];
    documents?: IResource[];
    others?: IResource[];
  };
  videoUrl?: string; // Optional single video link
  codeExamples?: string[];
  assignments?: string[];
  isPublished: boolean;
  order: number;
  scheduledDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const resourceSchema = new Schema<IResource>(
  {
    title: { type: String, required: true },
    type: { type: String, enum: Object.values(ResourceType), required: true },
    url: { type: String, required: true },
    size: Number,
    duration: Number,
  },
  { _id: false }
);

const lessonSchema = new Schema<ILesson>(
  {
    moduleId: { type: Schema.Types.ObjectId, ref: "Module", required: true, index: true },
    dayNumber: { type: Number, required: true },
    title: { type: String, required: [true, "Lesson title is required"], trim: true },
    description: { type: String, required: true },
    type: { type: String, enum: Object.values(LessonType), required: true },
    duration: { type: Number, required: true, min: 0 },
    content: { type: String, required: true },
    learningObjectives: [{ type: String, required: true }],
    resources: {
      video: [resourceSchema],
      documents: [resourceSchema],
      others: [resourceSchema],
      default: {},
    },
    videoUrl: String,
    codeExamples: [String],
    assignments: [String],
    isPublished: { type: Boolean, default: false },
    order: { type: Number, required: true },
    scheduledDate: Date,
  },
  { timestamps: true }
);

// Compound index to ensure unique day per module
lessonSchema.index({ moduleId: 1, dayNumber: 1 }, { unique: true });

export const Lesson: Model<ILesson> = mongoose.model<ILesson>("Lesson", lessonSchema);
