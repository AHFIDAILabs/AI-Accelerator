import mongoose, { Document, Model, Schema } from 'mongoose';

export enum SubmissionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  GRADED = 'graded',
  LATE = 'late'
}

export interface IAnswer {
  questionId: string;
  answer: string | string[];
  isCorrect?: boolean;
  pointsEarned?: number;
}

export interface ISubmission extends Document {
  assessmentId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;

  // Optional for analytics / faster queries
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
  timeSpent?: number; // in minutes
  isLate?: boolean;

  createdAt: Date;
  updatedAt: Date;
}


const submissionSchema = new Schema<ISubmission>(
{
  assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
  programId: { type: Schema.Types.ObjectId, ref: 'Program', index: true },

  answers: [{
    questionId: { type: Schema.Types.ObjectId, required: true }, // changed from string
    answer: Schema.Types.Mixed,
    isCorrect: Boolean,
    pointsEarned: { type: Number, min: 0 }
  }],

  score: { type: Number, default: 0, min: 0 },
  percentage: { type: Number, default: 0, min: 0, max: 100 },
  status: { type: String, enum: Object.values(SubmissionStatus), default: SubmissionStatus.DRAFT },
  attemptNumber: { type: Number, required: true, min: 1 },

  startedAt: { type: Date, default: Date.now },
  submittedAt: Date,
  gradedAt: Date,
  gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  feedback: String,
  timeSpent: { type: Number, min: 0 },
  isLate: { type: Boolean, default: false }
},
{ timestamps: true }
);

// Compound index for unique submissions per attempt
submissionSchema.index({ assessmentId: 1, studentId: 1, attemptNumber: 1 }, { unique: true });

export const Submission: Model<ISubmission> = mongoose.model<ISubmission>('Submission', submissionSchema);
