import mongoose, {Document, Schema, Model} from "mongoose";

export enum CertificateStatus {
  PENDING = 'pending',
  ISSUED = 'issued',
  REVOKED = 'revoked'
}

export interface ICertificate extends Document {
  studentId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  certificateNumber: string;
  issueDate: Date;
  status: CertificateStatus;
  pdfUrl?: string;
  verificationCode: string;
  studentName: string;
  courseName: string;
  completionDate: Date;
  grade?: string;
  finalScore?: number;
  achievements?: string[];
  issuedBy: mongoose.Types.ObjectId;
  metadata: {
    totalModules: number;
    completedProjects: number;
    averageScore: number;
    totalHours: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const certificateSchema = new Schema<ICertificate>(
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
    certificateNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true
    },
    issueDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: Object.values(CertificateStatus),
      default: CertificateStatus.PENDING
    },
    pdfUrl: String,
    verificationCode: {
      type: String,
      required: true,
      unique: true
    },
    studentName: {
      type: String,
      required: true
    },
    courseName: {
      type: String,
      required: true
    },
    completionDate: {
      type: Date,
      required: true
    },
    grade: String,
    finalScore: {
      type: Number,
      min: 0,
      max: 100
    },
    achievements: [String],
    issuedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    metadata: {
      totalModules: { type: Number, required: true },
      completedProjects: { type: Number, required: true },
      averageScore: { type: Number, required: true },
      totalHours: { type: Number, required: true }
    }
  },
  { timestamps: true }
);

// Compound index for unique certificate per student per course
certificateSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

// Generate certificate number before saving
certificateSchema.pre('save', async function() {
  if (!this.certificateNumber) {
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.certificateNumber = `AI-ACC-${year}-${random}`;
  }
  if (!this.verificationCode) {
    this.verificationCode = Math.random().toString(36).substring(2, 15).toUpperCase();
  }
});

export const Certificate: Model<ICertificate> = mongoose.model<ICertificate>('Certificate', certificateSchema);