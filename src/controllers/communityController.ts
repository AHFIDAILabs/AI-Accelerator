// ============================================
// src/controllers/community.controller.ts
// ============================================

import { Response }          from "express";
import mongoose              from "mongoose";
import { asyncHandler }      from "../middlewares/asyncHandler";
import { AuthRequest }       from "../middlewares/auth";
import { CommunityPost }     from "../models/CommunityPost";
import { CommunityReply }    from "../models/CommunityReply";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { Course }            from "../models/Course";
import { Program }           from "../models/program";
import { User, UserRole }    from "../models/user";
import { pushNotification }  from "../utils/pushNotification";
import { NotificationType }  from "../models/Notification";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isAdmin      = (req: AuthRequest) => req.user?.role === UserRole.ADMIN;
const isInstructor = (req: AuthRequest) => req.user?.role === UserRole.INSTRUCTOR;
const isStaff      = (req: AuthRequest) => isAdmin(req) || isInstructor(req);

/**
 * Verify the requesting user has access to a given context.
 * - general: any authenticated user
 * - program: must be enrolled (student) OR instructor of a course in the program OR admin
 * - course: must be enrolled in the program that owns the course OR instructor OR admin
 */
async function canAccessContext(
  req: AuthRequest,
  context: "general" | "program" | "course",
  contextId?: string
): Promise<boolean> {
  if (!req.user) return false;
  if (isStaff(req)) return true;
  if (context === "general") return true;
  if (!contextId || !mongoose.Types.ObjectId.isValid(contextId)) return false;

  if (context === "program") {
    const enrollment = await Enrollment.findOne({
      studentId: req.user._id,
      programId: contextId,
      status: EnrollmentStatus.ACTIVE,
    });
    return !!enrollment;
  }

  if (context === "course") {
    const course = await Course.findById(contextId).select("programId");
    if (!course) return false;
    const enrollment = await Enrollment.findOne({
      studentId: req.user._id,
      programId: course.programId,
      status: EnrollmentStatus.ACTIVE,
    });
    return !!enrollment;
  }

  return false;
}

// ─── POST HANDLERS ────────────────────────────────────────────────────────────

// @desc   Get all posts (feed) — filtered by context
// @route  GET /api/v1/community/posts
// @access Protected
export const getPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const {
    context   = "general",
    contextId,
    category,
    sort      = "latest",   // latest | top | unanswered
    page      = "1",
    limit     = "20",
    search,
  } = req.query as Record<string, string>;

  // Access check
  const hasAccess = await canAccessContext(req, context as any, contextId);
  if (!hasAccess) {
    return res.status(403).json({ success: false, error: "Access denied to this context" });
  }

  const filter: any = { isDeleted: false, context };
  if (contextId && mongoose.Types.ObjectId.isValid(contextId)) {
    filter.contextId = contextId;
  }
  if (category) filter.category = category;
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { body:  { $regex: search, $options: "i" } },
    ];
  }

  const sortMap: Record<string, any> = {
    latest:     { isPinned: -1, createdAt: -1 },
    top:        { isPinned: -1, upvoteCount: -1, createdAt: -1 },
    unanswered: { isPinned: -1, createdAt: -1 },
  };
  if (sort === "unanswered") filter.isAnswered = false;

  const skip  = (parseInt(page) - 1) * parseInt(limit);
  const total = await CommunityPost.countDocuments(filter);

  const posts = await CommunityPost.find(filter)
    .sort(sortMap[sort] ?? sortMap.latest)
    .skip(skip)
    .limit(parseInt(limit))
    .populate("authorId", "firstName lastName profileImage role")
    .lean();

  // Attach hasUpvoted flag for the requesting user
  const userId = req.user._id.toString();
  const enriched = posts.map(p => ({
    ...p,
    hasUpvoted: p.upvotes.some((id: any) => id.toString() === userId),
    upvotes: undefined, // don't expose full array
  }));

  return res.status(200).json({
    success: true,
    data:    enriched,
    count:   enriched.length,
    total,
    page:    parseInt(page),
    pages:   Math.ceil(total / parseInt(limit)),
  });
});


// @desc   Get single post with its replies
// @route  GET /api/v1/community/posts/:id
// @access Protected
export const getPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false })
    .populate("authorId", "firstName lastName profileImage role");

  if (!post) return res.status(404).json({ success: false, error: "Post not found" });

  const hasAccess = await canAccessContext(req, post.context, post.contextId?.toString());
  if (!hasAccess) return res.status(403).json({ success: false, error: "Access denied" });

  // Fetch replies — accepted first, then chronological; exclude deleted
  const replies = await CommunityReply.find({ postId: post._id, isDeleted: false })
    .sort({ isAccepted: -1, parentReplyId: 1, createdAt: 1 })
    .populate("authorId", "firstName lastName profileImage role")
    .lean();

  const userId = req.user._id.toString();

  const enrichedReplies = replies.map(r => ({
    ...r,
    hasUpvoted: r.upvotes.some((id: any) => id.toString() === userId),
    upvotes: undefined,
  }));

  return res.status(200).json({
    success: true,
    data: {
      post: {
        ...post.toObject(),
        hasUpvoted: post.upvotes.some(id => id.toString() === userId),
        upvotes: undefined,
      },
      replies: enrichedReplies,
    },
  });
});


// @desc   Create a post
// @route  POST /api/v1/community/posts
// @access Protected
export const createPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { title, body, category = "discussion", context = "general", contextId } = req.body;

  if (!title?.trim() || !body?.trim()) {
    return res.status(400).json({ success: false, error: "Title and body are required" });
  }

  // Only admins/instructors can post announcements
  if (category === "announcement" && !isStaff(req)) {
    return res.status(403).json({ success: false, error: "Only staff can post announcements" });
  }

  const hasAccess = await canAccessContext(req, context, contextId);
  if (!hasAccess) {
    return res.status(403).json({ success: false, error: "Access denied to this context" });
  }

  // Validate contextId exists
  if (context !== "general" && contextId) {
    if (context === "program") {
      const exists = await Program.exists({ _id: contextId });
      if (!exists) return res.status(404).json({ success: false, error: "Program not found" });
    }
    if (context === "course") {
      const exists = await Course.exists({ _id: contextId });
      if (!exists) return res.status(404).json({ success: false, error: "Course not found" });
    }
  }

  const post = await CommunityPost.create({
    authorId: req.user._id,
    title:    title.trim(),
    body:     body.trim(),
    category,
    context,
    contextId: contextId || undefined,
  });

  await post.populate("authorId", "firstName lastName profileImage role");

  return res.status(201).json({ success: true, data: post });
});


// @desc   Update a post (author only, or admin)
// @route  PUT /api/v1/community/posts/:id
// @access Protected
export const updatePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false });
  if (!post) return res.status(404).json({ success: false, error: "Post not found" });

  const isAuthor = post.authorId.toString() === req.user._id.toString();
  if (!isAuthor && !isAdmin(req)) {
    return res.status(403).json({ success: false, error: "Not authorized" });
  }

  const { title, body } = req.body;
  if (title?.trim()) post.title = title.trim();
  if (body?.trim())  post.body  = body.trim();
  await post.save();

  return res.status(200).json({ success: true, data: post });
});


// @desc   Delete a post (soft delete — author or admin)
// @route  DELETE /api/v1/community/posts/:id
// @access Protected
export const deletePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false });
  if (!post) return res.status(404).json({ success: false, error: "Post not found" });

  const isAuthor = post.authorId.toString() === req.user._id.toString();
  if (!isAuthor && !isAdmin(req)) {
    return res.status(403).json({ success: false, error: "Not authorized" });
  }

  post.isDeleted = true;
  post.deletedAt = new Date();
  await post.save();

  // Soft-delete all replies too
  await CommunityReply.updateMany(
    { postId: post._id },
    { isDeleted: true, deletedAt: new Date() }
  );

  return res.status(200).json({ success: true, message: "Post deleted" });
});


// @desc   Toggle upvote on a post
// @route  POST /api/v1/community/posts/:id/upvote
// @access Protected
export const upvotePost = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false });
  if (!post) return res.status(404).json({ success: false, error: "Post not found" });

  const userId    = req.user._id;
  const hasVoted  = post.upvotes.some(id => id.toString() === userId.toString());

  if (hasVoted) {
    post.upvotes     = post.upvotes.filter(id => id.toString() !== userId.toString()) as any;
    post.upvoteCount = Math.max(0, post.upvoteCount - 1);
  } else {
    post.upvotes.push(userId as any);
    post.upvoteCount += 1;
  }

  await post.save();

  return res.status(200).json({
    success: true,
    data: { upvoteCount: post.upvoteCount, hasUpvoted: !hasVoted },
  });
});


// @desc   Pin / unpin a post (admin or instructor)
// @route  POST /api/v1/community/posts/:id/pin
// @access Staff only
export const pinPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || !isStaff(req)) {
    return res.status(403).json({ success: false, error: "Staff only" });
  }

  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false });
  if (!post) return res.status(404).json({ success: false, error: "Post not found" });

  post.isPinned = !post.isPinned;
  await post.save();

  return res.status(200).json({ success: true, data: { isPinned: post.isPinned } });
});


// @desc   Lock / unlock a post (admin or instructor)
// @route  POST /api/v1/community/posts/:id/lock
// @access Staff only
export const lockPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || !isStaff(req)) {
    return res.status(403).json({ success: false, error: "Staff only" });
  }

  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false });
  if (!post) return res.status(404).json({ success: false, error: "Post not found" });

  post.isLocked = !post.isLocked;
  await post.save();

  return res.status(200).json({ success: true, data: { isLocked: post.isLocked } });
});


// ─── REPLY HANDLERS ───────────────────────────────────────────────────────────

// @desc   Add a reply to a post
// @route  POST /api/v1/community/posts/:id/replies
// @access Protected
export const createReply = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const post = await CommunityPost.findOne({ _id: req.params.id, isDeleted: false });
  if (!post) return res.status(404).json({ success: false, error: "Post not found" });

  if (post.isLocked && !isStaff(req)) {
    return res.status(403).json({ success: false, error: "This thread is locked" });
  }

  const hasAccess = await canAccessContext(req, post.context, post.contextId?.toString());
  if (!hasAccess) return res.status(403).json({ success: false, error: "Access denied" });

  const { body, parentReplyId } = req.body;
  if (!body?.trim()) return res.status(400).json({ success: false, error: "Reply body is required" });

  // Validate parentReplyId belongs to this post
  if (parentReplyId) {
    const parent = await CommunityReply.findOne({ _id: parentReplyId, postId: post._id, isDeleted: false });
    if (!parent) return res.status(400).json({ success: false, error: "Parent reply not found" });
    // Only allow 1 level of nesting — if parent has a parentReplyId, reject
    if (parent.parentReplyId) {
      return res.status(400).json({ success: false, error: "Only one level of reply nesting is supported" });
    }
  }

  const reply = await CommunityReply.create({
    postId:        post._id,
    authorId:      req.user._id,
    body:          body.trim(),
    parentReplyId: parentReplyId || null,
  });

  // Increment replyCount on post
  await CommunityPost.findByIdAndUpdate(post._id, { $inc: { replyCount: 1 } });

  await reply.populate("authorId", "firstName lastName profileImage role");

  // Notify post author (unless they replied to themselves)
  if (post.authorId.toString() !== req.user._id.toString()) {
    await pushNotification({
      userId:       post.authorId as any,
      type:         NotificationType.OTHER,
      title:        "New reply on your post",
      message:      `${req.user.firstName} ${req.user.lastName} replied to "${post.title}"`,
      relatedId:    post._id as any,
      relatedModel: "CommunityPost" as any,
    });
  }

  // If replying to someone else's reply, notify that person too
  if (parentReplyId) {
    const parentReply = await CommunityReply.findById(parentReplyId);
    if (
      parentReply &&
      parentReply.authorId.toString() !== req.user._id.toString() &&
      parentReply.authorId.toString() !== post.authorId.toString()
    ) {
      await pushNotification({
        userId:       parentReply.authorId as any,
        type:         NotificationType.OTHER,
        title:        "Someone replied to your comment",
        message:      `${req.user.firstName} ${req.user.lastName} replied to your comment in "${post.title}"`,
        relatedId:    post._id as any,
        relatedModel: "CommunityPost" as any,
      });
    }
  }

  return res.status(201).json({ success: true, data: reply });
});


// @desc   Update a reply (author or admin)
// @route  PUT /api/v1/community/replies/:id
// @access Protected
export const updateReply = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const reply = await CommunityReply.findOne({ _id: req.params.id, isDeleted: false });
  if (!reply) return res.status(404).json({ success: false, error: "Reply not found" });

  const isAuthor = reply.authorId.toString() === req.user._id.toString();
  if (!isAuthor && !isAdmin(req)) {
    return res.status(403).json({ success: false, error: "Not authorized" });
  }

  if (req.body.body?.trim()) reply.body = req.body.body.trim();
  await reply.save();

  return res.status(200).json({ success: true, data: reply });
});


// @desc   Delete a reply (soft delete — author or admin)
// @route  DELETE /api/v1/community/replies/:id
// @access Protected
export const deleteReply = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const reply = await CommunityReply.findOne({ _id: req.params.id, isDeleted: false });
  if (!reply) return res.status(404).json({ success: false, error: "Reply not found" });

  const isAuthor = reply.authorId.toString() === req.user._id.toString();
  if (!isAuthor && !isAdmin(req)) {
    return res.status(403).json({ success: false, error: "Not authorized" });
  }

  reply.isDeleted = true;
  reply.deletedAt = new Date();
  await reply.save();

  await CommunityPost.findByIdAndUpdate(reply.postId, {
    $inc: { replyCount: -1 },
  });

  return res.status(200).json({ success: true, message: "Reply deleted" });
});


// @desc   Toggle upvote on a reply
// @route  POST /api/v1/community/replies/:id/upvote
// @access Protected
export const upvoteReply = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const reply = await CommunityReply.findOne({ _id: req.params.id, isDeleted: false });
  if (!reply) return res.status(404).json({ success: false, error: "Reply not found" });

  const userId   = req.user._id;
  const hasVoted = reply.upvotes.some(id => id.toString() === userId.toString());

  if (hasVoted) {
    reply.upvotes     = reply.upvotes.filter(id => id.toString() !== userId.toString()) as any;
    reply.upvoteCount = Math.max(0, reply.upvoteCount - 1);
  } else {
    reply.upvotes.push(userId as any);
    reply.upvoteCount += 1;
  }

  await reply.save();

  return res.status(200).json({
    success: true,
    data: { upvoteCount: reply.upvoteCount, hasUpvoted: !hasVoted },
  });
});


// @desc   Mark a reply as accepted answer (post author or staff)
// @route  POST /api/v1/community/replies/:id/accept
// @access Protected
export const acceptReply = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const reply = await CommunityReply.findOne({ _id: req.params.id, isDeleted: false });
  if (!reply) return res.status(404).json({ success: false, error: "Reply not found" });

  const post = await CommunityPost.findById(reply.postId);
  if (!post) return res.status(404).json({ success: false, error: "Post not found" });

  const isPostAuthor = post.authorId.toString() === req.user._id.toString();
  if (!isPostAuthor && !isStaff(req)) {
    return res.status(403).json({ success: false, error: "Only the post author or staff can accept a reply" });
  }

  // Un-accept all other replies for this post first
  await CommunityReply.updateMany(
    { postId: post._id, isAccepted: true },
    { isAccepted: false }
  );

  // Toggle — if same reply is accepted again, it un-accepts
  const wasAccepted  = reply.isAccepted;
  reply.isAccepted   = !wasAccepted;
  await reply.save();

  // Mark post as answered / unanswered
  post.isAnswered = !wasAccepted;
  await post.save();

  // Notify reply author
  if (!wasAccepted && reply.authorId.toString() !== req.user._id.toString()) {
    await pushNotification({
      userId:       reply.authorId as any,
      type:         NotificationType.OTHER,
      title:        "Your reply was accepted!",
      message:      `Your answer in "${post.title}" was marked as the accepted answer.`,
      relatedId:    post._id as any,
      relatedModel: "CommunityPost" as any,
    });
  }

  return res.status(200).json({
    success: true,
    data: { isAccepted: reply.isAccepted, postIsAnswered: post.isAnswered },
  });
});