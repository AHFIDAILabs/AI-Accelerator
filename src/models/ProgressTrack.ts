import mongoose, { Document, Model, Schema } from 'mongoose';


export interface ILessonProgress {
  lessonId: mongoose.Types.ObjectId;
  status: 'not_started' | 'in_progress' | 'completed';
  startedAt?: Date;
  completedAt?: Date;
  timeSpent?: number; // in minutes
}

export interface IAssessmentProgress {
  assessmentId: mongoose.Types.ObjectId;
  score?: number;
  status: 'not_started' | 'in_progress' | 'completed';
  startedAt?: Date;
  completedAt?: Date;
  attempts?: number;
}

export interface IModuleProgress {
  moduleId: mongoose.Types.ObjectId;
  lessons: ILessonProgress[];
  assessments: IAssessmentProgress[];
  completionPercentage: number;
  startedAt?: Date;
  completedAt?: Date;
}



export interface IProgress extends Document {
  studentId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  modules: IModuleProgress[];
  overallProgress: number;
  completedLessons: number;
  totalLessons: number;
  completedAssessments: number;
  totalAssessments: number;
  averageScore: number;
  totalTimeSpent: number; // in hours
  lastAccessedAt: Date;
  enrolledAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const progressSchema = new Schema<IProgress>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true
    },
 modules: [{
  moduleId: { type: Schema.Types.ObjectId, ref: 'Module', required: true },
  lessons: [{
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    status: { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' },
    startedAt: Date,
    completedAt: Date,
    timeSpent: { type: Number, default: 0 }
  }],
  assessments: [{ // new
    assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
    score: Number,
    status: { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' },
    startedAt: Date,
    completedAt: Date,
    attempts: { type: Number, default: 0 }
  }],
  completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
  startedAt: Date,
  completedAt: Date
}],

    overallProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    completedLessons: {
      type: Number,
      default: 0
    },
    totalLessons: {
      type: Number,
      default: 0
    },
    completedAssessments: {
      type: Number,
      default: 0
    },
    totalAssessments: {
      type: Number,
      default: 0
    },
    averageScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    totalTimeSpent: {
      type: Number,
      default: 0,
      min: 0
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now
    },
    enrolledAt: {
      type: Date,
      default: Date.now
    },
    completedAt: Date
  },
  { timestamps: true }
);

// Compound index for unique progress per student per course
progressSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

export const Progress: Model<IProgress> = mongoose.model<IProgress>('Progress', progressSchema);