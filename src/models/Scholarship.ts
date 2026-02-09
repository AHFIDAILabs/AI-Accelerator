import mongoose, { Schema, Model, Document } from "mongoose";
import crypto from "crypto";

export enum ScholarshipStatus {
  ACTIVE = "active",
  USED = "used",
  EXPIRED = "expired",
  REVOKED = "revoked",
}

export enum DiscountType {
  PERCENTAGE = "percentage",
  FIXED_AMOUNT = "fixed_amount",
}

export interface IScholarship extends Document {
  code: string;
  programId: mongoose.Types.ObjectId;
  studentEmail?: string;
  discountType: DiscountType;
  discountValue: number;
  status: ScholarshipStatus;
  usedBy?: mongoose.Types.ObjectId;
  usedAt?: Date;
  expiresAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;

  validateForStudent(email?: string): { valid: boolean; error?: string };
  markAsUsed(studentId: mongoose.Types.ObjectId): Promise<IScholarship>;
}

const scholarshipSchema = new Schema<IScholarship>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    studentEmail: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
    },
    discountType: {
      type: String,
      enum: Object.values(DiscountType),
      default: DiscountType.PERCENTAGE,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
      max: 1000000, // sanity cap
      validate: {
        validator: function (this: IScholarship, value: number) {
          if (this.discountType === DiscountType.PERCENTAGE) {
            return value >= 0 && value <= 100;
          }
          return value >= 0;
        },
        message: "Invalid discount value",
      },
    },
    status: {
      type: String,
      enum: Object.values(ScholarshipStatus),
      default: ScholarshipStatus.ACTIVE,
      index: true,
    },
    usedBy: { type: Schema.Types.ObjectId, ref: "User" },
    usedAt: Date,
    expiresAt: Date,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: String,
  },
  { timestamps: true }
);

/* ================= INDEXES ================= */
scholarshipSchema.index({ programId: 1, status: 1 });
scholarshipSchema.index({ studentEmail: 1, status: 1 });
scholarshipSchema.index({ code: 1, programId: 1 });

/* ================= VIRTUAL ================= */
scholarshipSchema.virtual("isValid").get(function () {
  if (this.status !== ScholarshipStatus.ACTIVE) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
});

/* ================= STATIC ================= */
scholarshipSchema.statics.generateCode = function (
  prefix: string = "SCHOLAR"
): string {
  const randomStr = crypto.randomBytes(5).toString("hex").toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${timestamp}-${randomStr}`;
};

/* ================= METHODS ================= */

// Safe business validation
scholarshipSchema.methods.validateForStudent = function (
  email?: string
): { valid: boolean; error?: string } {
  if (this.status !== ScholarshipStatus.ACTIVE) {
    return { valid: false, error: "Scholarship code is not active" };
  }

  if (this.expiresAt && this.expiresAt < new Date()) {
    this.status = ScholarshipStatus.EXPIRED;
    return { valid: false, error: "Scholarship code has expired" };
  }

  if (this.usedBy) {
    return { valid: false, error: "Scholarship already used" };
  }

  if (this.studentEmail) {
    if (!email || this.studentEmail !== email.toLowerCase()) {
      return {
        valid: false,
        error: "This scholarship code is not valid for your account",
      };
    }
  }

  return { valid: true };
};

// 🔒 Atomic usage (prevents double redemption)
scholarshipSchema.methods.markAsUsed = async function (
  studentId: mongoose.Types.ObjectId
) {
  const updated = await Scholarship.findOneAndUpdate(
    {
      _id: this._id,
      status: ScholarshipStatus.ACTIVE,
      usedBy: { $exists: false },
    },
    {
      status: ScholarshipStatus.USED,
      usedBy: studentId,
      usedAt: new Date(),
    },
    { new: true }
  );

  if (!updated) throw new Error("Scholarship already used or invalid");

  return updated;
};

export const Scholarship: Model<IScholarship> =
  mongoose.model<IScholarship>("Scholarship", scholarshipSchema);
