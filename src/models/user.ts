import mongoose, { Document, Model, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export enum UserRole {
  ADMIN = 'admin',
  STUDENT = 'student',
  INSTRUCTOR = 'instructor'
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  GRADUATED = 'graduated'
}

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  profileImage?: string;
  phoneNumber?: string;
  programId?: mongoose.Types.ObjectId[];
  courseIds?: mongoose.Types.ObjectId[];
  

  // Role-specific sub-docs
  studentProfile?: {
    cohort?: string;
    enrollmentDate?: Date;
    githubProfile?: string;
    linkedinProfile?: string;
    portfolioUrl?: string;
    programId?: mongoose.Types.ObjectId[];
  courseIds?: mongoose.Types.ObjectId[];
  };

  instructorProfile?: {
    bio?: string;
    coursesTaught?: mongoose.Types.ObjectId[];
    linkedinProfile?: string;
  };

  adminProfile?: {
    permissions?: string[];
  };

  // Security
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  refreshTokens: string[];
  accessToken?: string;
  lastLogin?: Date;

  createdAt: Date;
  updatedAt: Date;

  // Methods
  matchPassword(enteredPassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    lastName: { type: String, required: true, trim: true, maxlength: 50 },
    email: { 
      type: String, required: true, unique: true, lowercase: true, trim: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.STUDENT },
    status: { type: String, enum: Object.values(UserStatus), default: UserStatus.ACTIVE },
    profileImage: { type: String, default: 'default-avatar.png' },
    phoneNumber: { type: String, trim: true },

    // Role-specific fields
    studentProfile: {
      cohort: String,
      enrollmentDate: { type: Date, default: Date.now },
      githubProfile: String,
      linkedinProfile: String,
      portfolioUrl: String,
      
    },

    instructorProfile: {
      bio: String,
      coursesTaught: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
      programs: [{ type: Schema.Types.ObjectId, ref: 'Program' }],
      linkedinProfile: String
    },

    programId: [{ type: Schema.Types.ObjectId, ref: 'Program' }],
  courseIds: [{ type: Schema.Types.ObjectId, ref: 'Course' }],

  adminProfile: {
  permissions: {
    type: [String],
    default: ['createProgram', 'promoteInstructor', 'viewReports']
  }
},

    // Security fields
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    refreshTokens: [{ type: String, select: false }],
    accessToken: { type: String, select: false },
    lastLogin: Date
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// 🔹 Password hashing
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// 🔹 Match password method
userSchema.methods.matchPassword = async function(enteredPassword: string): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

// 🔹 Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
