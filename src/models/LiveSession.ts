import mongoose, { Schema, Document, Model } from "mongoose";

// Enumerations for platforms and session status
export enum LivePlatform {
  GOOGLE_MEET = "google_meet",
  ZOOM = "zoom",
  TEAMS = "teams"
}

export enum LiveSessionStatus {
  SCHEDULED = "scheduled",
  LIVE = "live",
  COMPLETED = "completed",
  CANCELLED = "cancelled"
}

// Resource for optional recording uploads
export interface ILiveResource {
  title: string;
  type: "video" | "pdf" | "slides" | "other";
  url: string;
  size?: number; // bytes
  duration?: number; // seconds
}

// LiveSession document interface
export interface ILiveSession extends Document {
  courseId: mongoose.Types.ObjectId;
  moduleId?: mongoose.Types.ObjectId; // Optional if session is tied to a module
  instructorId: mongoose.Types.ObjectId;

  title: string;
  description?: string;

  platform: LivePlatform;
  meetingUrl: string;

  startTime: Date;
  endTime: Date;

  status: LiveSessionStatus;

  resources?: ILiveResource[]; // Recordings or supporting files

  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const liveResourceSchema = new Schema<ILiveResource>(
  {
    title: { type: String, required: true },
    type: { type: String, enum: ["video", "pdf", "slides", "other"], required: true },
    url: { type: String, required: true },
    size: Number,
    duration: Number
  },
  { _id: false }
);

const liveSessionSchema = new Schema<ILiveSession>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    moduleId: { type: Schema.Types.ObjectId, ref: "Module" },
    instructorId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    title: { type: String, required: true, trim: true },
    description: { type: String },

    platform: {
      type: String,
      enum: Object.values(LivePlatform),
      required: true
    },
    meetingUrl: { type: String, required: true, trim: true },

    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },

    status: {
      type: String,
      enum: Object.values(LiveSessionStatus),
      default: LiveSessionStatus.SCHEDULED
    },

    resources: [liveResourceSchema],

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

// ===== Indexes for high-performance queries =====

// Quick lookup for a course's live sessions
liveSessionSchema.index({ courseId: 1, startTime: 1 });

// Ensure instructor cannot schedule overlapping sessions for same course
liveSessionSchema.index({ instructorId: 1, startTime: 1, endTime: 1 });

// Search by status (e.g., "live") quickly
liveSessionSchema.index({ status: 1 });

// Optional: lookup module-specific sessions
liveSessionSchema.index({ moduleId: 1, startTime: 1 });

// Optional: support text search on title/description
liveSessionSchema.index({ title: "text", description: "text" });


liveSessionSchema.pre<ILiveSession>("save", async function (next) {
  try {
    // Only check if startTime or endTime is being created/updated
    if (!this.isModified("startTime") && !this.isModified("endTime")) return next();

    const overlappingSession = await LiveSession.findOne({
      _id: { $ne: this._id }, // ignore current session if updating
      instructorId: this.instructorId,
      courseId: this.courseId,
      status: { $in: [LiveSessionStatus.SCHEDULED, LiveSessionStatus.LIVE] },
      $or: [
        {
          startTime: { $lt: this.endTime },
          endTime: { $gt: this.startTime },
        },
        {
          startTime: { $eq: this.startTime },
        },
      ],
    });

    if (overlappingSession) {
      return next(
        new Error(
          `Instructor already has a session overlapping this time: "${overlappingSession.title}" (${overlappingSession.startTime.toISOString()} - ${overlappingSession.endTime.toISOString()})`
        )
      );
    }

    next();
  } catch (error) {
    next(error as Error);
  }
});

export const LiveSession: Model<ILiveSession> = mongoose.model(
  "LiveSession",
  liveSessionSchema
);