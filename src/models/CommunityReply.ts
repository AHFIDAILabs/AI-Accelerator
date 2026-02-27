// ============================================
// src/models/CommunityReply.ts
// ============================================

import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICommunityReply extends Document {
  postId:          mongoose.Types.ObjectId;
  authorId:        mongoose.Types.ObjectId;
  body:            string;

  // One level of nesting only (reply to a reply)
  parentReplyId?:  mongoose.Types.ObjectId;

  isAccepted:      boolean;   // marked as "best answer" by post author or instructor
  upvotes:         mongoose.Types.ObjectId[];
  upvoteCount:     number;

  isDeleted:       boolean;
  deletedAt?:      Date;

  createdAt:       Date;
  updatedAt:       Date;
}

const communityReplySchema = new Schema<ICommunityReply>(
  {
    postId:   { type: Schema.Types.ObjectId, ref: "CommunityPost", required: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User",          required: true },

    body: { type: String, required: true, trim: true, maxlength: 3000 },

    parentReplyId: { type: Schema.Types.ObjectId, ref: "CommunityReply", default: null },

    isAccepted:  { type: Boolean, default: false },
    upvotes:     [{ type: Schema.Types.ObjectId, ref: "User" }],
    upvoteCount: { type: Number, default: 0 },

    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  { timestamps: true }
);

communityReplySchema.index({ postId: 1, createdAt: 1 });
communityReplySchema.index({ postId: 1, isAccepted: -1 });
communityReplySchema.index({ authorId: 1 });
communityReplySchema.index({ isDeleted: 1 });

export const CommunityReply: Model<ICommunityReply> =
  mongoose.model("CommunityReply", communityReplySchema);