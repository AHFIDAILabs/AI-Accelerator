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
  module: mongoose.Types.ObjectId;
  order: number;

  title: string;
  description: string;
  type: LessonType;

  estimatedMinutes: number;
  content: string;
  learningObjectives: string[];

  resources: IResource[];

  codeExamples?: string[];
  assignments?: string[];

  isPreview: boolean;
  isRequired: boolean;

  completionRule: {
    type: 'view' | 'quiz_pass' | 'assignment_submit' | 'project_review';
    passingScore?: number;
  };

  isPublished: boolean;

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
  module: {
    type: Schema.Types.ObjectId,
    ref: "Module",
    required: true,
    index: true
  },

  order: { type: Number, required: true },

  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },

  type: { type: String, enum: Object.values(LessonType), required: true },

  estimatedMinutes: { type: Number, required: true, min: 1 },

  content: { type: String, required: true },

  learningObjectives: [{ type: String }],

  resources: [resourceSchema],

  codeExamples: [String],
  assignments: [String],

  isPreview: { type: Boolean, default: false },
  isRequired: { type: Boolean, default: true },

  completionRule: {
    type: {
      type: String,
      enum: ['view', 'quiz_pass', 'assignment_submit', 'project_review'],
      default: 'view'
    },
    passingScore: Number
  },

  isPublished: { type: Boolean, default: false }
},
{ timestamps: true }
);

// Order unique per module
lessonSchema.index({ module: 1, order: 1 }, { unique: true });

export const Lesson: Model<ILesson> = mongoose.model<ILesson>("Lesson", lessonSchema);
