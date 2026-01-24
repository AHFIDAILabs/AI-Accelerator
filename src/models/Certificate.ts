import mongoose, {Document, Schema, Model} from "mongoose";

export enum CertificateStatus {
  PENDING = 'pending',
  ISSUED = 'issued',
  REVOKED = 'revoked'
}

export interface ICertificate extends Document {
  studentId: mongoose.Types.ObjectId;
  programId?: mongoose.Types.ObjectId; // Optional for program-level cert
  courseId?: mongoose.Types.ObjectId;  // Optional if program-level
  certificateNumber: string;
  issueDate: Date;
  status: CertificateStatus;
  pdfUrl?: string;
  verificationCode: string;
  studentName: string;
  programName?: string; // Optional
  courseName?: string;  // Optional
  completionDate: Date;
  grade?: string;
  finalScore?: number;
  achievements?: string[];
  issuedBy: mongoose.Types.ObjectId;
  metadata: {
    totalModules?: number;
    completedProjects?: number;
    averageScore?: number;
    totalHours?: number;
    totalCourses?: number; // For program certs
    coursesCompleted?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}


const certificateSchema = new Schema<ICertificate>(
{
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  programId: { type: Schema.Types.ObjectId, ref: 'Program', index: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },

  certificateNumber: { type: String, required: true, unique: true, uppercase: true },
  issueDate: { type: Date, default: Date.now },
  status: { type: String, enum: Object.values(CertificateStatus), default: CertificateStatus.PENDING },
  pdfUrl: String,
  verificationCode: { type: String, required: true, unique: true },

  studentName: { type: String, required: true },
  programName: String,
  courseName: String,
  completionDate: { type: Date, required: true },

  grade: String,
  finalScore: { type: Number, min: 0, max: 100 },
  achievements: [String],

  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

  metadata: {
    totalModules: Number,
    completedProjects: Number,
    averageScore: Number,
    totalHours: Number,
    totalCourses: Number,
    coursesCompleted: Number
  }
},
{ timestamps: true }
);

// Compound index for uniqueness
certificateSchema.index(
  { studentId: 1, courseId: 1 },
  { unique: true, partialFilterExpression: { courseId: { $exists: true } } }
);
certificateSchema.index(
  { studentId: 1, programId: 1 },
  { unique: true, partialFilterExpression: { programId: { $exists: true } } }
);

// Pre-save hook
certificateSchema.pre<ICertificate>('save', function(next) {
  if (!this.certificateNumber) {
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.certificateNumber = `AI-ACC-${year}-${random}`;
  }
  if (!this.verificationCode) {
    this.verificationCode = Math.random().toString(36).substring(2, 15).toUpperCase();
  }
  next();
});

export const Certificate: Model<ICertificate> = mongoose.model<ICertificate>('Certificate', certificateSchema);
