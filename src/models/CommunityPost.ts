// ============================================
// src/models/CommunityPost.ts
// ============================================

import mongoose, { Schema, Document, Model } from "mongoose";

export type PostContext = "general" | "program" | "course";
export type PostCategory = "question" | "discussion" | "announcement" | "win";

export interface ICommunityPost extends Document {
  authorId:    mongoose.Types.ObjectId;
  title:       string;
  body:        string;
  category:    PostCategory;

  // Where this post lives
  context:     PostContext;
  contextId?:  mongoose.Types.ObjectId;   // programId or courseId if not general

  isPinned:    boolean;
  isAnswered:  boolean;     // for category === 'question'
  isLocked:    boolean;     // admin/instructor can lock thread

  upvotes:     mongoose.Types.ObjectId[]; // user IDs who upvoted
  upvoteCount: number;                    // denormalized for fast sorting

  replyCount:  number;                    // denormalized

  // Soft delete
  isDeleted:   boolean;
  deletedAt?:  Date;

  createdAt:   Date;
  updatedAt:   Date;
}

const communityPostSchema = new Schema<ICommunityPost>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    body:  { type: String, required: true, trim: true, maxlength: 5000 },

    category: {
      type: String,
      enum: ["question", "discussion", "announcement", "win"],
      default: "discussion",
    },

    context:   { type: String, enum: ["general", "program", "course"], default: "general" },
    contextId: { type: Schema.Types.ObjectId, refPath: "contextModel" },

    isPinned:    { type: Boolean, default: false },
    isAnswered:  { type: Boolean, default: false },
    isLocked:    { type: Boolean, default: false },

    upvotes:     [{ type: Schema.Types.ObjectId, ref: "User" }],
    upvoteCount: { type: Number, default: 0 },

    replyCount:  { type: Number, default: 0 },

    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  { timestamps: true }
);

// Fast feed queries
communityPostSchema.index({ context: 1, contextId: 1, createdAt: -1 });
communityPostSchema.index({ context: 1, contextId: 1, upvoteCount: -1 });
communityPostSchema.index({ authorId: 1, createdAt: -1 });
communityPostSchema.index({ isPinned: -1, createdAt: -1 });
communityPostSchema.index({ isDeleted: 1 });

export const CommunityPost: Model<ICommunityPost> =
  mongoose.model("CommunityPost", communityPostSchema);