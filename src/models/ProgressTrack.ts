import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ILessonProgress {
  lessonId: mongoose.Types.ObjectId;
  status: 'not_started' | 'in_progress' | 'completed';
  startedAt?: Date;
  completedAt?: Date;
  timeSpent?: number;
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
  programId?: mongoose.Types.ObjectId;
  courseId?: mongoose.Types.ObjectId;

  modules: IModuleProgress[];

  overallProgress: number;
  completedLessons: number;
  totalLessons: number;
  completedAssessments: number;
  totalAssessments: number;
  averageScore: number;
  totalTimeSpent: number;

  completedCourses?: number;
  totalCourses?: number;

  lastAccessedAt: Date;
  enrolledAt: Date;
  completedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const progressSchema = new Schema<IProgress>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    programId: { type: Schema.Types.ObjectId, ref: 'Program' },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },

    modules: [
      {
        moduleId: { type: Schema.Types.ObjectId, ref: 'Module', required: true },
        lessons: [
          {
            lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
            status: { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' },
            startedAt: Date,
            completedAt: Date,
            timeSpent: { type: Number, default: 0 }
          }
        ],
        assessments: [
          {
            assessmentId: { type: Schema.Types.ObjectId, ref: 'Assessment', required: true },
            score: Number,
            status: { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' },
            startedAt: Date,
            completedAt: Date,
            attempts: { type: Number, default: 0 }
          }
        ],
        completionPercentage: { type: Number, default: 0, min: 0, max: 100 },
        startedAt: Date,
        completedAt: Date
      }
    ],

    overallProgress: { type: Number, default: 0 },
    completedLessons: { type: Number, default: 0 },
    totalLessons: { type: Number, default: 0 },
    completedAssessments: { type: Number, default: 0 },
    totalAssessments: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    totalTimeSpent: { type: Number, default: 0 },

    completedCourses: { type: Number, default: 0 },
    totalCourses: { type: Number, default: 0 },

    lastAccessedAt: { type: Date, default: Date.now },
    enrolledAt: { type: Date, default: Date.now },
    completedAt: Date
  },
  { timestamps: true }
);

progressSchema.index(
  { studentId: 1, courseId: 1 },
  { unique: true, partialFilterExpression: { courseId: { $exists: true } } }
);

progressSchema.index(
  { studentId: 1, programId: 1 },
  { unique: true, partialFilterExpression: { programId: { $exists: true } } }
);

export const Progress: Model<IProgress> = mongoose.model('Progress', progressSchema);