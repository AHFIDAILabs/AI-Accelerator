import mongoose, { Document, Model, Schema } from 'mongoose';

export enum SubmissionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  GRADED = 'graded',
  LATE = 'late'
}

export interface IAnswer {
  questionIndex: number;   // FIXED
  answer: string | string[];
  isCorrect?: boolean;
  pointsEarned?: number;
}

export interface ISubmission extends Document {
  assessmentId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;

  courseId?: mongoose.Types.ObjectId;
  programId?: mongoose.Types.ObjectId;

  answers: IAnswer[];
  score: number;
  percentage: number;
  status: SubmissionStatus;

  attemptNumber: number;

  startedAt: Date;
  submittedAt?: Date;
  gradedAt?: Date;
  gradedBy?: mongoose.Types.ObjectId;

  feedback?: string;
  timeSpent?: number;
  isLate?: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const submissionSchema = new Schema<ISubmission>(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    programId: { type: Schema.Types.ObjectId, ref: 'Program' },

    answers: [
      {
        questionIndex: { type: Number, required: true }, // FIXED
        answer: Schema.Types.Mixed,
        isCorrect: Boolean,
        pointsEarned: Number
      }
    ],

    score: { type: Number, default: 0 },
    percentage: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: Object.values(SubmissionStatus), default: SubmissionStatus.DRAFT },

    attemptNumber: { type: Number, required: true },

    startedAt: { type: Date, default: Date.now },
    submittedAt: Date,
    gradedAt: Date,
    gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    feedback: String,
    timeSpent: Number,
    isLate: { type: Boolean, default: false }
  },
  { timestamps: true }
);

submissionSchema.index(
  { assessmentId: 1, studentId: 1, attemptNumber: 1 },
  { unique: true }
);

export const Submission: Model<ISubmission> =
  mongoose.model('Submission', submissionSchema);