// ============================================
// src/controllers/module.controller.ts (ALIGNED)
// ============================================

import { Request, Response } from "express";
import mongoose from "mongoose";

import { Module } from "../models/Module";
import { Course } from "../models/Course";
import { Lesson } from "../models/Lesson";
import { Enrollment } from "../models/Enrollment";
import { Progress } from "../models/ProgressTrack"; // if needed later
import { NotificationType } from "../models/Notification";
import { UserRole } from "../models/user";
import { EnrollmentStatus } from "../models/Enrollment";

import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { QueryHelper } from "../utils/queryHelper";
import { pushNotification, notifyCourseStudents } from "../utils/pushNotification";
import { NotificationTemplates } from "../utils/notificationTemplates";
import { getIo } from "../config/socket";

import { cache } from '../utils/cache';


const getModuleCacheKey = (id: string) => `module:full:${id}`;

const invalidateModuleCache = (id: string) => {
  cache.delete(getModuleCacheKey(id));
};

const invalidateCourseCache = (id: string) => {
  cache.delete(`course:full:${id}`);
};

// ==============================
// CREATE MODULE
// ==============================
export const createModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    courseId,
    order,
    title,
    description,
    learningObjectives,
    weekNumber,
    sequenceLabel,
    estimatedMinutes,
    type,
  } = req.body;

  if (!req.user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  if (!courseId || !title || !description) {
    return res
      .status(400)
      .json({ success: false, error: "Please provide courseId, title, and description" });
  }

  const courseDoc = await Course.findById(courseId).populate("programId", "title createdBy createdAt coverImage");
  if (!courseDoc) {
    return res.status(404).json({ success: false, error: "Course not found" });
  }

  // Instructors can only modify their own courses
  if (
    req.user.role === UserRole.INSTRUCTOR &&
    courseDoc.createdBy.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({
      success: false,
      error: "Cannot add module to this course. You can only modify your own courses.",
    });
  }

  // Helper: get next available order per course
  const getNextOrder = async () => {
    const last = await Module.find({ courseId })
      .sort({ order: -1 })
      .limit(1)
      .select("order")
      .lean();
    return (last[0]?.order ?? 0) + 1;
  };

  let moduleOrder: number;

  if (typeof order === "number") {
    // Ensure provided order is not taken
    const exists = await Module.exists({ courseId, order });
    if (exists) {
      return res.status(409).json({
        success: false,
        error: `A module with order ${order} already exists in this course.`,
        code: "ORDER_CONFLICT",
      });
    }
    moduleOrder = order;
  } else {
    // Auto-assign next order
    moduleOrder = await getNextOrder();
  }

  try {
    const module = await Module.create({
      courseId,
      order: moduleOrder,
      title,
      description,
      learningObjectives: learningObjectives || [],
      weekNumber,
      sequenceLabel,
      estimatedMinutes: estimatedMinutes ?? 120,
      type: type || "core",
      isPublished: false,
    });

    // OPTIONAL: maintain course.moduleCount (if you want denormalized counts)
    await Course.findByIdAndUpdate(courseId, { $inc: { moduleCount: 1 } }).exec();

    invalidateModuleCache(module._id.toString());

    return res.status(201).json({
      success: true,
      message: "Module created successfully (pending publication)",
      data: module,
    });
  } catch (e: any) {
    // Handle unique index race: { courseId, order }
    if (e?.code === 11000) {
      if (typeof order !== "number") {
        const retryOrder = await getNextOrder();
        const module = await Module.create({
          courseId,
          order: retryOrder,
          title,
          description,
          learningObjectives: learningObjectives || [],
          weekNumber,
          sequenceLabel,
          estimatedMinutes: estimatedMinutes ?? 120,
          type: type || "core",
          isPublished: false,
        });

        await Course.findByIdAndUpdate(courseId, { $inc: { moduleCount: 1 } }).exec();

        return res.status(201).json({
          success: true,
          message: "Module created successfully (pending publication)",
          data: module,
        });
      }

      return res.status(409).json({
        success: false,
        error: `Order ${order} is already used for this course.`,
        code: "ORDER_CONFLICT",
      });
    }

    throw e;
  }
});

// ==============================
// TOGGLE MODULE PUBLISH
// ==============================

export const toggleModulePublish = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findById(req.params.id).populate({
    path: "courseId",
    select: "title programId createdBy",
    populate: { path: "programId", select: "title" },
  });

  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // 🔐 Ownership for instructors
  if (req.user?.role === UserRole.INSTRUCTOR) {
    const course = module.courseId as any;
    if (course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        error: "You can only publish/unpublish modules in your own courses",
      });
      return;
    }
  }

  // Require at least one lesson before publishing
  if (!module.isPublished) {
    const lessonCount = await Lesson.countDocuments({ moduleId: module._id });
    if (lessonCount === 0) {
      res.status(400).json({
        success: false,
        error: "Cannot publish module without lessons. Please add lessons first.",
      });
      return;
    }
  }

  const wasPublished = module.isPublished;
  module.isPublished = !module.isPublished;
  await module.save();
invalidateModuleCache(module._id.toString());

  // Notify enrolled students when module is newly published
  if (module.isPublished && !wasPublished) {
    const course = module.courseId as any;
    try {
      const notification = NotificationTemplates.modulePublished(module.title, course.title);

      await notifyCourseStudents(course._id, {
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedId: module._id,
        relatedModel: "Module",
      });

      // Real-time Socket.IO notification for enrolled students
      const io = getIo();
      const enrollments = await Enrollment.find({
        programId: course.programId,
        "coursesProgress.courseId": course._id,
        status: { $in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PENDING] },
      }).populate("studentId");

      for (const enrollment of enrollments) {
        const student = (enrollment as any).studentId;
        if (student?._id) {
          io.to(student._id.toString()).emit("notification", {
            type: NotificationType.COURSE_UPDATE,
            title: "New Module Available",
            message: module.sequenceLabel ? `${module.sequenceLabel}: ${module.title}` : module.title,
            moduleId: module._id,
            courseId: course._id,
            programId: course.programId,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      console.error("Error sending module publish notifications:", error);
    }
  }

  res.status(200).json({
    success: true,
    message: `Module ${module.isPublished ? "published" : "unpublished"} successfully`,
    data: module,
  });
});

// ==============================
// UPDATE MODULE
// ==============================
export const updateModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findById(req.params.id).populate("courseId", "title createdBy programId");

  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const course = module.courseId as any;

  // Instructors can only update modules in their courses; their updates unpublish the module
  if (req.user?.role === UserRole.INSTRUCTOR) {
    if (course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        error: "Cannot update this module. You can only modify modules in your own courses.",
      });
      return;
    }
    module.isPublished = false;
  }

  // Whitelisted fields
  const allowedUpdates = [
    "title",
    "description",
    "learningObjectives",
    "sequenceLabel",
    "estimatedMinutes",
    "type",
    "order",
    "weekNumber",
  ];

  for (const field of allowedUpdates) {
    if (req.body[field] !== undefined) {
      (module as any)[field] = req.body[field];
    }
  }

  // Admin may toggle publish directly
  if (req.user?.role === UserRole.ADMIN && req.body.isPublished !== undefined) {
    // If publishing, ensure it has lessons
    if (req.body.isPublished === true) {
      const lessonCount = await Lesson.countDocuments({ moduleId: module._id });
      if (lessonCount === 0) {
        res.status(400).json({
          success: false,
          error: "Cannot publish module without lessons. Please add lessons first.",
        });
        return;
      }
    }
    module.isPublished = req.body.isPublished;
  }

  await module.save();

  invalidateModuleCache(module._id.toString());
  invalidateCourseCache(course.programId.toString());
  // Notify students if module was published and updated (admin flow)
  if (module.isPublished && req.user?.role === UserRole.ADMIN) {
    try {
      await notifyCourseStudents(course._id, {
        type: NotificationType.COURSE_UPDATE,
        title: "Module Updated",
        message: `${module.title} has been updated with new content`,
        relatedId: module._id,
        relatedModel: "Module",
      });
    } catch (error) {
      console.error("Error sending module update notifications:", error);
    }
  }

  const message =
    req.user?.role === UserRole.INSTRUCTOR
      ? "Module updated and submitted for review"
      : "Module updated successfully";

  res.json({ success: true, message, data: module });
});

// ==============================
// GET ALL MODULES (ADMIN / INSTRUCTOR)
// ==============================
export const getAllModulesAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = "1", limit = "20", courseId, type, isPublished } = req.query;

  const filter: any = {};
  if (courseId) filter.courseId = courseId;
  if (type) filter.type = type;
  if (isPublished !== undefined) filter.isPublished = isPublished === "true";

  // Instructors: only modules from their own courses
  if (req.user?.role === UserRole.INSTRUCTOR) {
    const myCourseIds = await Course.find({ createdBy: req.user._id }).distinct("_id");
    filter.courseId = filter.courseId ?? { $in: myCourseIds };
  }

  let query = Module.find(filter)
    .populate("courseId", "title programId")
    .sort({ order: 1 });

  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;

  const total = await Module.countDocuments(filter);
  const modules = await query;

  res.status(200).json({
    success: true,
    count: modules.length,
    total,
    page: parseInt(page as string, 10),
    pages: Math.ceil(total / parseInt(limit as string, 10)),
    data: modules,
  });
});

// ==============================
// GET PUBLISHED MODULES (PUBLIC)
// ==============================
export const getPublishedModules = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = "1", limit = "20", courseId, type } = req.query;

  const filter: any = { isPublished: true };
  if (courseId) filter.courseId = courseId;
  if (type) filter.type = type;

  let query = Module.find(filter).populate("courseId", "title programId").sort({ order: 1 });

  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;

  const total = await Module.countDocuments(filter);
  const modules = await query;

  res.status(200).json({
    success: true,
    count: modules.length,
    total,
    page: parseInt(page as string, 10),
    pages: Math.ceil(total / parseInt(limit as string, 10)),
    data: modules,
  });
});

// ==============================
// GET MODULE BY ID (PUBLIC/ROLE-AWARE)
// ==============================
export const getModuleById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findById(req.params.id).populate({
    path: "courseId",
    select: "title description programId",
    populate: { path: "programId", select: "title slug" },
  });

  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // If not published, only admin/instructor can view
  if (!module.isPublished && (!req.user || ![UserRole.ADMIN, UserRole.INSTRUCTOR].includes(req.user.role))) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // Fetch lessons based on role visibility
  const lessonFilter: any = { moduleId: module._id };
  if (!req.user || req.user.role === UserRole.STUDENT) {
    lessonFilter.isPublished = true;
  }

  const lessons = await Lesson.find(lessonFilter).sort({ order: 1 });
  const totalMinutes = lessons.reduce((sum, l) => sum + (l.estimatedMinutes || 0), 0);

  res.status(200).json({
    success: true,
    data: {
      module,
      lessons,
      stats: {
        totalLessons: lessons.length,
        estimatedMinutes: totalMinutes,
      },
    },
  });
});

// ==============================
// GET MODULES BY COURSE
// ==============================
export const getModulesByCourse = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { courseId } = req.params;
  const { includeUnpublished } = req.query;

  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  const filter: any = { courseId };

  // Only show published unless admin/instructor explicitly asks for unpublished
  const canSeeUnpublished =
    includeUnpublished && [UserRole.ADMIN, UserRole.INSTRUCTOR].includes(req.user?.role as UserRole);

  if (!canSeeUnpublished) filter.isPublished = true;

  const modules = await Module.find(filter).sort({ order: 1 });

  const modulesWithStats = await Promise.all(
    modules.map(async (mod) => {
      const lessonFilter: any = { moduleId: mod._id };
      if (!canSeeUnpublished) lessonFilter.isPublished = true;

      const lessons = await Lesson.find(lessonFilter).sort({ order: 1 });
      const lessonCount = lessons.length;
      const totalMinutes = lessons.reduce((sum, l) => sum + (l.estimatedMinutes || 0), 0);

      return {
        ...mod.toObject(),
        lessons,
        stats: { lessonCount, totalMinutes },
      };
    })
  );

  res.status(200).json({
    success: true,
    count: modulesWithStats.length,
    data: modulesWithStats,
  });
});

// ==============================
// DELETE MODULE
// ==============================
export const deleteModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findById(req.params.id).populate("courseId", "createdBy");
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // Instructors can only delete modules in their courses
  if (req.user?.role === UserRole.INSTRUCTOR) {
    const course = module.courseId as any;
    if (!course || course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        error: "Cannot delete this module. You can only delete modules in your own courses.",
      });
      return;
    }
  }

  // If module has lessons, block deletion
  const lessonCount = await Lesson.countDocuments({ moduleId: module._id });
  if (lessonCount > 0) {
    res.status(400).json({
      success: false,
      error: `Cannot delete module with ${lessonCount} lessons. Please delete lessons first.`,
    });
    return;
  }

  await module.deleteOne();
  await Course.findByIdAndUpdate(module.courseId, { $inc: { moduleCount: -1 } }).exec();

  invalidateModuleCache(module._id.toString());
  invalidateCourseCache((module.courseId as any).toString());

  res.status(200).json({ success: true, message: "Module deleted successfully" });
});

// ==============================
// REORDER MODULES
// ==============================
export const reorderModules = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { orders } = req.body;
  if (!Array.isArray(orders) || orders.length === 0) {
    res.status(400).json({ success: false, error: "Invalid orders array" });
    return;
  }

  const moduleIds = orders.map((o) => o.moduleId);
  const modules = await Module.find({ _id: { $in: moduleIds } });

  if (modules.length !== orders.length) {
    res.status(404).json({ success: false, error: "Some modules not found" });
    return;
  }

  const courseIds = [...new Set(modules.map((m) => m.courseId.toString()))];
  if (courseIds.length > 1) {
    res.status(400).json({ success: false, error: "Cannot reorder modules from different courses" });
    return;
  }

  // Instructors can only reorder within their own course
  if (req.user?.role === UserRole.INSTRUCTOR) {
    const course = await Course.findById(courseIds[0]);
    if (!course || course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, error: "Cannot reorder modules in this course" });
      return;
    }
  }

  const bulkOps = orders.map((item: any) => ({
    updateOne: {
      filter: { _id: item.moduleId },
      update: { order: item.order },
    },
  }));

  await Module.bulkWrite(bulkOps);

  invalidateModuleCache(courseIds[0]);
  invalidateCourseCache(courseIds[0]);
  

  res.status(200).json({ success: true, message: "Modules reordered successfully" });
});

// ==============================
// GET MODULE STATISTICS
// ==============================
export const getModuleStats = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.query;

  const matchStage: any = {};
  if (courseId) matchStage.courseId = new mongoose.Types.ObjectId(courseId as string);

  const byType = await Module.aggregate([
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    {
      $group: {
        _id: "$type",
        total: { $sum: 1 },
        published: { $sum: { $cond: ["$isPublished", 1, 0] } },
        avgEstimatedMinutes: { $avg: "$estimatedMinutes" },
      },
    },
  ]);

  const overall = await Module.aggregate([
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    {
      $group: {
        _id: null,
        totalModules: { $sum: 1 },
        publishedModules: { $sum: { $cond: ["$isPublished", 1, 0] } },
        totalEstimatedMinutes: { $sum: "$estimatedMinutes" },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    data: {
      byType,
      overall: overall[0] || { totalModules: 0, publishedModules: 0, totalEstimatedMinutes: 0 },
    },
  });
});

// ==============================
// GET MODULE CONTENT STRUCTURE
// ==============================
export const getModuleContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { moduleId } = req.params;

  const module = await Module.findById(moduleId).populate({
    path: "courseId",
    select: "title programId",
    populate: { path: "programId", select: "title" },
  });

  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // Access control
  if (!module.isPublished && (!req.user || ![UserRole.ADMIN, UserRole.INSTRUCTOR].includes(req.user.role))) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // Lessons (published only for public/student)
  const lessonFilter: any = { moduleId };
  if (!req.user || req.user.role === UserRole.STUDENT) {
    lessonFilter.isPublished = true;
  }

  const lessons = await Lesson.find(lessonFilter).sort({ order: 1 });

  const totalMinutes = lessons.reduce((sum, l) => sum + (l.estimatedMinutes || 0), 0);
  const lessonsByType = lessons.reduce((acc, lesson) => {
    acc[lesson.type] = (acc[lesson.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  res.status(200).json({
    success: true,
    data: {
      module,
      lessons,
      stats: {
        totalLessons: lessons.length,
        totalMinutes,
        estimatedHours: Math.round((totalMinutes / 60) * 10) / 10,
        lessonsByType,
      },
    },
  });
});
