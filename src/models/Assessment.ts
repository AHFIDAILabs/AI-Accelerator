import mongoose, { Schema, Document, Model } from "mongoose";

export enum AssessmentType {
  QUIZ = "quiz",
  ASSIGNMENT = "assignment",
  PROJECT = "project",
  CAPSTONE = "capstone"
}

export enum QuestionType {
  MULTIPLE_CHOICE = "multiple_choice",
  TRUE_FALSE = "true_false",
  SHORT_ANSWER = "short_answer",
  CODING = "coding",
  ESSAY = "essay"
}

export interface IQuestion {
  questionText: string;
  type: QuestionType;
  options?: string[];
  correctAnswer?: string | string[];
  points: number;
  explanation?: string;
  codeTemplate?: string;
}

export interface IAssessment extends Document {
  programId?: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  moduleId?: mongoose.Types.ObjectId;
  lessonId?: mongoose.Types.ObjectId;

  title: string;
  description: string;

  type: AssessmentType;
  questions: IQuestion[];

  totalPoints: number;
  passingScore: number;
  duration?: number;

  attempts: number;
  isRequiredForCompletion: boolean;
  isPublished: boolean;

  order?: number;
  endDate?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    questionText: { type: String, required: true },
    type: { type: String, enum: Object.values(QuestionType), required: true },
    options: [String],
    correctAnswer: Schema.Types.Mixed,
    points: { type: Number, required: true },
    explanation: String,
    codeTemplate: String
  },
  
);

const assessmentSchema = new Schema<IAssessment>(
  {
    programId: { type: Schema.Types.ObjectId, ref: "Program" },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    moduleId: { type: Schema.Types.ObjectId, ref: "Module" },
    lessonId: { type: Schema.Types.ObjectId, ref: "Lesson" },

    title: { type: String, required: true },
    description: { type: String, required: true },

    type: {
      type: String,
      enum: Object.values(AssessmentType),
      required: true
    },

    questions: [questionSchema],

    totalPoints: { type: Number, default: 0 },
    passingScore: { type: Number, required: true },

    duration: Number,

    attempts: { type: Number, default: 2 },

    isPublished: { type: Boolean, default: false },
    isRequiredForCompletion: { type: Boolean, default: true },

    order: Number
  },
  { timestamps: true }
);

// Auto calculate totalPoints
assessmentSchema.pre("save", function (next) {
  this.totalPoints = this.questions.reduce((sum, q) => sum + q.points, 0);
  next();
});

export const Assessment: Model<IAssessment> = mongoose.model(
  "Assessment",
  assessmentSchema
);