import  mongoose, { Document, Model, Schema } from 'mongoose';

export interface IModule extends Document {
  courseId: mongoose.Types.ObjectId;
  moduleNumber: number;
  title: string;
  description: string;
  weekNumber: number;
  learningObjectives: string[];
  startDate?: Date;
  endDate?: Date;
  isPublished: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const moduleSchema = new Schema<IModule>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true
    },
    moduleNumber: {
      type: Number,
      required: true
    },
    title: {
      type: String,
      required: [true, 'Module title is required'],
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    weekNumber: {
      type: Number,
      required: true
    },
    learningObjectives: [{
      type: String,
      required: true
    }],
    startDate: Date,
    endDate: Date,
    isPublished: {
      type: Boolean,
      default: false
    },
    order: {
      type: Number,
      required: true
    }
  },
  { timestamps: true }
);

// Compound index for course and module number
moduleSchema.index({ courseId: 1, moduleNumber: 1 }, { unique: true });

export const Module: Model<IModule> = mongoose.model<IModule>('Module', moduleSchema);