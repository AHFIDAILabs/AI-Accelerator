// ============================================
// src/routes/community.routes.ts
// ============================================

import express from "express";
import {
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  upvotePost,
  pinPost,
  lockPost,
  createReply,
  updateReply,
  deleteReply,
  upvoteReply,
  acceptReply,
} from "../controllers/communityController";
import { protect }    from "../middlewares/auth";
import { authorize }  from "../middlewares/adminAuth";
import { UserRole }   from "../models/user";

const communityRouter = express.Router();

// All community routes require authentication
communityRouter.use(protect);

// ── Posts 
communityRouter.get("/posts",          getPosts);
communityRouter.post("/posts",         createPost);

communityRouter.get("/posts/:id",      getPost);
communityRouter.put("/posts/:id",      updatePost);
communityRouter.delete("/posts/:id",   deletePost);

// Actions
communityRouter.post("/posts/:id/upvote", upvotePost);
communityRouter.post(
  "/posts/:id/pin",
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  pinPost
);
communityRouter.post(
  "/posts/:id/lock",
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  lockPost
);

// ── Replies 
communityRouter.post("/posts/:id/replies", createReply);

communityRouter.put("/replies/:id",        updateReply);
communityRouter.delete("/replies/:id",     deleteReply);
communityRouter.post("/replies/:id/upvote",  upvoteReply);
communityRouter.post("/replies/:id/accept",  acceptReply);

export default communityRouter;