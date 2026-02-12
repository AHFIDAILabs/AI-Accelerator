import mongoose, { Document, Model, Schema } from "mongoose";

export enum QuestionType {
  MULTIPLE_CHOICE = 'multiple_choice',
  TRUE_FALSE = 'true_false',
  SHORT_ANSWER = 'short_answer',
  CODING = 'coding',
  ESSAY = 'essay'
}

export enum AssessmentType {
  QUIZ = 'quiz',
  ASSIGNMENT = 'assignment',
  PROJECT = 'project',
  CAPSTONE = 'capstone'
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
  _id: mongoose.Types.ObjectId; // Explicitly add _id for clarity
  
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
  isPublished: boolean;
  isRequiredForCompletion: boolean;

  order?: number;

  startDate?: Date;
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
    points: { type: Number, required: true, min: 0 },
    explanation: String,
    codeTemplate: String
  },
  { _id: false }
);

const assessmentSchema = new Schema<IAssessment>(
  {
    programId: { type: Schema.Types.ObjectId, ref: 'Program', index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    moduleId: { type: Schema.Types.ObjectId, ref: 'Module', index: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', index: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    type: { type: String, enum: Object.values(AssessmentType), required: true },

    questions: [questionSchema],

    totalPoints: { type: Number, default: 0 },
    passingScore: { type: Number, required: true, min: 0, max: 100 },

    duration: { type: Number, min: 0 },
    
    // ✅ FIX: Change default from 1 to 2 to match controller
    attempts: { type: Number, default: 2, min: 1 }, // Changed from default: 1
    
    isPublished: { type: Boolean, default: false },
    isRequiredForCompletion: { type: Boolean, default: true },

    order: { type: Number },

    startDate: Date,
    endDate: Date
  },
  { timestamps: true }
);

// Pre-save hook to calculate totalPoints
assessmentSchema.pre<IAssessment>('save', function(next) {
  if (this.questions && this.questions.length > 0) {
    this.totalPoints = this.questions.reduce((sum, q) => sum + q.points, 0);
  }
  next();
});

export const Assessment: Model<IAssessment> = mongoose.model<IAssessment>('Assessment', assessmentSchema);
