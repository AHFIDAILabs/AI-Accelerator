import  mongoose, { Document, Model, Schema } from 'mongoose';

export interface IModule extends Document {
  course: mongoose.Types.ObjectId;
  lessons: mongoose.Types.ObjectId[];
  order: number;

  title: string;
  description: string;
  learningObjectives: string[];

  sequenceLabel?: string;      // "Week 1", "Unit 2"
  estimatedMinutes?: number;

  type: 'core' | 'project' | 'assessment' | 'capstone';

  isPublished: boolean;

  createdAt: Date;
  updatedAt: Date;
}


const moduleSchema = new Schema<IModule>(
{
  course: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },

  lessons: [{
  type: Schema.Types.ObjectId,
  ref: 'Lesson'
}],

  order: {
    type: Number,
    required: true
  },

  title: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    required: true
  },

  learningObjectives: [{ type: String }],

  sequenceLabel: String,      // "Week 1", "Unit 2"
  estimatedMinutes: Number,

  type: {
    type: String,
    enum: ['core', 'project', 'assessment', 'capstone'],
    default: 'core'
  },

  isPublished: {
    type: Boolean,
    default: false
  }
},
{ timestamps: true }
);

// Order unique per course
moduleSchema.index({ course: 1, order: 1 }, { unique: true });


export const Module: Model<IModule> = mongoose.model<IModule>('Module', moduleSchema);