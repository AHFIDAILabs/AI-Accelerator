import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ICourse extends Document {
  program: mongoose.Types.ObjectId;
  order: number;
  slug: string;
  title: string;
  instructor: mongoose.Types.ObjectId;
  description: string;
  estimatedHours: number;
  level: string[];
  objectives: string[];
  prerequisites: string[];
  targetAudience: string;
  coverImage?: string;
  isPublished: boolean;
  completionCriteria: {
    minimumQuizScore: number;
    requiredProjects: number;
    capstoneRequired: boolean;
  };
  currentEnrollment?: number;
  createdBy: mongoose.Types.ObjectId;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
  // Virtual fields (populated at runtime)
  modules?: any[];
}

const courseSchema = new Schema<ICourse>(
  {
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      required: [true, "Program is required"],
    },

    order: {
      type: Number,
      required: [true, "Order is required"],
      min: [1, "Order must be at least 1"]
    },

    slug: {
      type: String,
      trim: true,
      unique: true,
      lowercase: true,
    },

    level: {
      type: [String],
      enum: {
        values: ["beginner", "intermediate", "advanced"],
        message: "{VALUE} is not a valid level"
      },
      default: []
    },

    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"]
    },

    instructor: {
       type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Facilitator is required"],
    },
    
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"]
    },

    estimatedHours: {
      type: Number,
      min: [0, "Estimated hours cannot be negative"],
      default: 0
    },

    currentEnrollment: {
      type: Number,
      default: 0,
      min: [0, "Enrollment count cannot be negative"]
    },

    objectives: {
      type: [String],
      default: [],
      validate: {
        validator: function(v: string[]) {
          return v.every(obj => obj.trim().length > 0);
        },
        message: "Objectives cannot contain empty strings"
      }
    },

    prerequisites: {
      type: [String],
      default: []
    },

    targetAudience: {
      type: String,
      trim: true,
      maxlength: [500, "Target audience description cannot exceed 500 characters"]
    },

    coverImage: {
      type: String,
      trim: true
    },

    isPublished: {
      type: Boolean,
      default: false,
    },

    completionCriteria: {
      minimumQuizScore: {
        type: Number,
        default: 70,
        min: [0, "Minimum quiz score cannot be less than 0"],
        max: [100, "Minimum quiz score cannot exceed 100"]
      },
      requiredProjects: {
        type: Number,
        default: 5,
        min: [0, "Required projects cannot be negative"]
      },
      capstoneRequired: {
        type: Boolean,
        default: true
      }
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },

    approvalStatus: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected"],
        message: "{VALUE} is not a valid approval status"
      },
      default: "pending",
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// =====================================================
// INDEXES
// =====================================================
courseSchema.index({ program: 1, order: 1 });
courseSchema.index({ slug: 1 });
courseSchema.index({ isPublished: 1, approvalStatus: 1 });
courseSchema.index({ createdBy: 1 });
courseSchema.index({ instructor: 1 });
courseSchema.index({ title: 'text', description: 'text' });

// =====================================================
// MIDDLEWARE
// =====================================================

// Generate slug before saving if not provided
courseSchema.pre('save', async function(next) {
  if (this.isModified('title') && !this.slug) {
    const baseSlug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    let slug = baseSlug;
    let counter = 1;
    
    // Ensure slug is unique
    while (await mongoose.models.Course.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
  }
  next();
});

// Update program's course order when course is deleted
courseSchema.pre('findOneAndDelete', async function(next) {
  const course = await this.model.findOne(this.getFilter());
  if (course) {
    // Update order of other courses in the same program
    await mongoose.models.Course.updateMany(
      {
        program: course.program,
        order: { $gt: course.order }
      },
      {
        $inc: { order: -1 }
      }
    );
  }
  next();
});

// =====================================================
// VIRTUALS
// =====================================================

// ✅ Virtual for modules (populated when needed)
courseSchema.virtual('modules', {
  ref: 'Module',
  localField: '_id',
  foreignField: 'course',
  options: { sort: { order: 1 } }
});

// Virtual for enrollment count
courseSchema.virtual('enrollmentCount', {
  ref: 'Enrollment',
  localField: '_id',
  foreignField: 'coursesProgress.course',
  count: true
});

// =====================================================
// METHODS
// =====================================================

// Instance method to check if course is complete for publishing
courseSchema.methods.isReadyForPublishing = async function(): Promise<boolean> {
  const moduleCount = await mongoose.models.Module.countDocuments({
    course: this._id,
    isPublished: true
  });
  
  return (
    this.title &&
    this.description &&
    this.targetAudience &&
    this.objectives.length > 0 &&
    moduleCount > 0 &&
    this.approvalStatus === 'approved'
  );
};

// =====================================================
// STATICS
// =====================================================

// Static method to get published courses
courseSchema.statics.getPublishedCourses = function(
  programId?: string,
  limit?: number
) {
  const query = this.find({ isPublished: true, approvalStatus: 'approved' });
  
  if (programId) {
    query.where('program').equals(programId);
  }
  
  if (limit) {
    query.limit(limit);
  }
  
  return query
    .populate('program', 'title slug description')
    .populate('createdBy', 'firstName lastName email')
    .populate('instructor', 'firstName lastName email')
    .sort({ order: 1 });
};

// Static method to get courses by program with stats
courseSchema.statics.getCoursesWithStats = async function(programId: string) {
  return this.aggregate([
    { $match: { program: new mongoose.Types.ObjectId(programId) } },
    {
      $lookup: {
        from: 'modules',
        localField: '_id',
        foreignField: 'course',
        as: 'modules'
      }
    },
    {
      $lookup: {
        from: 'enrollments',
        let: { courseId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ['$$courseId', '$coursesProgress.course']
              }
            }
          }
        ],
        as: 'enrollments'
      }
    },
    {
      $addFields: {
        moduleCount: { $size: '$modules' },
        enrollmentCount: { $size: '$enrollments' }
      }
    },
    {
      $project: {
        modules: 0,
        enrollments: 0
      }
    },
    { $sort: { order: 1 } }
  ]);
};

export const Course: Model<ICourse> = mongoose.model<ICourse>('Course', courseSchema);