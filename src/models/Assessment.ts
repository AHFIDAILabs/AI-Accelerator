import mongoose, {Document, Model, Schema} from "mongoose";

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
  codeTemplate?: string; // For coding questions
}

export interface IAssessment extends Document {
  moduleId?: mongoose.Types.ObjectId;
  lessonId?: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  type: AssessmentType;
  questions: IQuestion[];
  totalPoints: number;
  passingScore: number;
  duration?: number; // in minutes
  attempts: number;
  isPublished: boolean;
  startDate?: Date;
  endDate?: Date;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const assessmentSchema = new Schema<IAssessment>(
  {
    moduleId: {
      type: Schema.Types.ObjectId,
      ref: 'Module',
      index: true
    },
    lessonId: {
      type: Schema.Types.ObjectId,
      ref: 'Lesson',
      index: true
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Assessment title is required'],
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: Object.values(AssessmentType),
      required: true
    },
    questions: [{
      questionText: { type: String, required: true },
      type: { 
        type: String, 
        enum: Object.values(QuestionType),
        required: true 
      },
      options: [String],
      correctAnswer: Schema.Types.Mixed,
      points: { type: Number, required: true, min: 0 },
      explanation: String,
      codeTemplate: String
    }],
    totalPoints: {
      type: Number,
      required: true,
      min: 0
    },
    passingScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    duration: {
      type: Number,
      min: 0
    },
    attempts: {
      type: Number,
      default: 1,
      min: 1
    },
    isPublished: {
      type: Boolean,
      default: false
    },
    startDate: Date,
    endDate: Date,
    order: {
      type: Number,
      required: true
    }
  },
  { timestamps: true }
);

// Calculate total points automatically
assessmentSchema.pre('save', function() {
  if (this.questions && this.questions.length > 0) {
    this.totalPoints = this.questions.reduce((sum, q) => sum + q.points, 0);
  }
});
export const Assessment: Model<IAssessment> = mongoose.model<IAssessment>('Assessment', assessmentSchema);