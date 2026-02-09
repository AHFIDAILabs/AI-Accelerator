// ============================================
// src/controllers/module.controller.ts
// ============================================

import { Request, Response } from "express";
import mongoose from "mongoose";
import { Module, IModule } from "../models/Module";
import { Course } from "../models/Course";
import { Lesson } from "../models/Lesson";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { QueryHelper } from "../utils/queryHelper";
import { pushNotification, notifyCourseStudents } from "../utils/pushNotification";
import { NotificationType } from "../models/Notification";
import { NotificationTemplates } from "../utils/notificationTemplates";
import { getIo } from "../config/socket";
import { Enrollment } from "../models/Enrollment";

// ==============================
// CREATE MODULE
// ==============================
export const createModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    course,
    order,
    title,
    description,
    learningObjectives,
    sequenceLabel,
    estimatedMinutes,
    type,
  } = req.body;

  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  if (!course || !title || !description) {
    res.status(400).json({ 
      success: false, 
      error: "Please provide course, title, and description" 
    });
    return;
  }

  // Verify course exists and get details
  const courseDoc = await Course.findById(course).populate('program', 'title');
  if (!courseDoc) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  // Check permissions for instructors
  if (req.user.role === "instructor" && courseDoc.createdBy.toString() !== req.user._id.toString()) {
    res.status(403).json({ 
      success: false, 
      error: "Cannot add module to this course. You can only modify your own courses." 
    });
    return;
  }

  const module = await Module.create({
    course,
    order: order || 1,
    title,
    description,
    learningObjectives: learningObjectives || [],
    sequenceLabel,
    estimatedMinutes,
    type: type || 'core',
    isPublished: false,
  });

  res.status(201).json({
    success: true,
    message: "Module created successfully (pending publication)",
    data: module,
  });
});

// ==============================
// TOGGLE MODULE PUBLISH
// ==============================
export const toggleModulePublish = asyncHandler(async (req: AuthRequest, res: Response) => {
  const module = await Module.findById(req.params.id)
    .populate({
      path: 'course',
      select: 'title program',
      populate: {
        path: 'program',
        select: 'title'
      }
    });
  
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // Check if module has lessons before publishing
  if (!module.isPublished) {
    const lessonCount = await Lesson.countDocuments({ module: module._id });
    if (lessonCount === 0) {
      res.status(400).json({ 
        success: false, 
        error: "Cannot publish module without lessons. Please add lessons first." 
      });
      return;
    }
  }

  const wasPublished = module.isPublished;
  module.isPublished = !module.isPublished;
  await module.save();

  // Notify enrolled students when module is published
  if (module.isPublished && !wasPublished) {
    const course = module.course as any;
    
    try {
      const notification = NotificationTemplates.modulePublished(module.title, course.title);
      
      // Notify students enrolled in this course
      await notifyCourseStudents(course._id, {
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedId: module._id,
        relatedModel: "Module",
      });

      // Real-time Socket.IO notification
      const io = getIo();
      const enrollments = await Enrollment.find({
        program: course.program,
        'coursesProgress.course': course._id,
        status: { $in: ['active', 'pending'] },
      }).populate('studentId');

      for (const enrollment of enrollments) {
        if (enrollment.studentId) {
          const student = enrollment.studentId as any;
          
          io.to(student._id.toString()).emit("notification", {
            type: NotificationType.COURSE_UPDATE,
            title: "New Module Available",
            message: module.sequenceLabel 
              ? `${module.sequenceLabel}: ${module.title}`
              : module.title,
            moduleId: module._id,
            courseId: course._id,
            programId: course.program,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      console.error('Error sending module publish notifications:', error);
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
  const module = await Module.findById(req.params.id)
    .populate('course', 'title createdBy program');
  
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const course = module.course as any;

  // Check permissions for instructors
  if (req.user?.role === "instructor") {
    if (course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({ 
        success: false, 
        error: "Cannot update this module. You can only modify modules in your own courses." 
      });
      return;
    }
    // Unpublish module when instructor updates it
    module.isPublished = false;
  }

  // Update allowed fields
  const allowedUpdates = [
    'title', 'description', 'learningObjectives', 'sequenceLabel',
    'estimatedMinutes', 'type', 'order'
  ];

  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      (module as any)[field] = req.body[field];
    }
  });

  // Admin can update isPublished directly
  if (req.user?.role === 'admin' && req.body.isPublished !== undefined) {
    module.isPublished = req.body.isPublished;
  }

  await module.save();

  // Notify students if module was published and got updated
  if (module.isPublished && req.user?.role === 'admin') {
    try {
      await notifyCourseStudents(course._id, {
        type: NotificationType.COURSE_UPDATE,
        title: "Module Updated",
        message: `${module.title} has been updated with new content`,
        relatedId: module._id,
        relatedModel: "Module",
      });
    } catch (error) {
      console.error('Error sending module update notifications:', error);
    }
  }

  const message = req.user?.role === 'instructor'
    ? "Module updated and submitted for review"
    : "Module updated successfully";

  res.json({
    success: true,
    message,
    data: module,
  });
});

// ==============================
// GET ALL MODULES (ADMIN)
// ==============================
export const getAllModulesAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '20', courseId, type, isPublished } = req.query;

  const filter: any = {};
  if (courseId) filter.course = courseId;
  if (type) filter.type = type;
  if (isPublished !== undefined) filter.isPublished = isPublished === 'true';

  let query = Module.find(filter)
    .populate('course', 'title program')
    .sort({ order: 1 });

  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;

  const total = await Module.countDocuments(filter);
  const modules = await query;

  res.status(200).json({ 
    success: true, 
    count: modules.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: modules 
  });
});

// ==============================
// GET PUBLISHED MODULES
// ==============================
export const getPublishedModules = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '20', courseId, type } = req.query;

  const filter: any = { isPublished: true };
  if (courseId) filter.course = courseId;
  if (type) filter.type = type;

  let query = Module.find(filter)
    .populate('course', 'title program')
    .sort({ order: 1 });

  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;

  const total = await Module.countDocuments(filter);
  const modules = await query;

  res.status(200).json({ 
    success: true, 
    count: modules.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: modules 
  });
});

// ==============================
// GET MODULE BY ID
// ==============================
export const getModuleById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lessonMatch: any = {};

  if (!req.user || req.user.role === 'student') {
    lessonMatch.isPublished = true;
  }

  const module = await Module.findById(req.params.id)
    .populate({
      path: 'course',
      select: 'title description program',
      populate: {
        path: 'program',
        select: 'title slug'
      }
    })
    .populate({
      path: 'lessons',
      match: lessonMatch,
      options: { sort: { order: 1 } }
    });

  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  if (!module.isPublished && (!req.user || !['admin', 'instructor'].includes(req.user.role))) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const lessons = module.lessons as any[];

  res.status(200).json({
    success: true,
    data: {
      module,
      lessons,
      stats: {
        totalLessons: lessons.length,
        estimatedMinutes: lessons.reduce((sum, l) => sum + l.estimatedMinutes, 0)
      }
    }
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

  const filter: any = { course: courseId };
  
  // Only show published modules unless admin/instructor requests unpublished
  if (!includeUnpublished || (req.user?.role !== 'admin' && req.user?.role !== 'instructor')) {
    filter.isPublished = true;
  }

  const modules = await Module.find(filter).sort({ order: 1 });

  // Get lesson counts for each module
  const modulesWithStats = await Promise.all(
    modules.map(async (module) => {
      const lessonCount = await Lesson.countDocuments({ 
        module: module._id,
        isPublished: true 
      });
      
      const totalMinutes = await Lesson.aggregate([
        { $match: { module: module._id, isPublished: true } },
        { $group: { _id: null, total: { $sum: '$estimatedMinutes' } } }
      ]);

      return {
        ...module.toObject(),
        stats: {
          lessonCount,
          totalMinutes: totalMinutes[0]?.total || 0
        }
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
  const module = await Module.findById(req.params.id).populate('course', 'createdBy');
  
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // Check permissions for instructors
  if (req.user?.role === "instructor") {
    const course = module.course as any;
    if (course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({ 
        success: false, 
        error: "Cannot delete this module. You can only delete modules in your own courses." 
      });
      return;
    }
  }

  // Check if module has lessons
  const lessonCount = await Lesson.countDocuments({ module: module._id });
  if (lessonCount > 0) {
    res.status(400).json({ 
      success: false, 
      error: `Cannot delete module with ${lessonCount} lessons. Please delete lessons first.` 
    });
    return;
  }

  await module.deleteOne();

  res.status(200).json({ 
    success: true, 
    message: "Module deleted successfully" 
  });
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

  // Verify all modules belong to the same course
  const moduleIds = orders.map(o => o.moduleId);
  const modules = await Module.find({ _id: { $in: moduleIds } });

  if (modules.length !== orders.length) {
    res.status(404).json({ success: false, error: "Some modules not found" });
    return;
  }

  const courseIds = [...new Set(modules.map(m => m.course.toString()))];
  if (courseIds.length > 1) {
    res.status(400).json({ 
      success: false, 
      error: "Cannot reorder modules from different courses" 
    });
    return;
  }

  // Check permissions for instructors
  if (req.user?.role === "instructor") {
    const course = await Course.findById(courseIds[0]);
    if (!course || course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({ 
        success: false, 
        error: "Cannot reorder modules in this course" 
      });
      return;
    }
  }

  const bulkOps = orders.map((item: any) => ({
    updateOne: { 
      filter: { _id: item.moduleId }, 
      update: { order: item.order } 
    },
  }));

  await Module.bulkWrite(bulkOps);

  res.status(200).json({ 
    success: true, 
    message: "Modules reordered successfully" 
  });
});

// ==============================
// GET MODULE STATISTICS
// ==============================
export const getModuleStats = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.query;

  const matchStage: any = {};
  if (courseId) matchStage.course = new mongoose.Types.ObjectId(courseId as string);

  const stats = await Module.aggregate([
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

  const totalStats = await Module.aggregate([
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
      byType: stats,
      overall: totalStats[0] || {
        totalModules: 0,
        publishedModules: 0,
        totalEstimatedMinutes: 0
      }
    }
  });
});

// ==============================
// GET MODULE CONTENT STRUCTURE
// ==============================
export const getModuleContent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { moduleId } = req.params;

  const module = await Module.findById(moduleId)
    .populate({
      path: 'course',
      select: 'title program',
      populate: {
        path: 'program',
        select: 'title'
      }
    });

  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // Check access permissions
  if (!module.isPublished && (!req.user || !['admin', 'instructor'].includes(req.user.role))) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // Get all lessons
  const lessons = await Lesson.find({ 
    module: moduleId,
    isPublished: true 
  }).sort({ order: 1 });

  // Calculate statistics
  const totalMinutes = lessons.reduce((sum, l) => sum + l.estimatedMinutes, 0);
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
        lessonsByType
      }
    }
  });
});