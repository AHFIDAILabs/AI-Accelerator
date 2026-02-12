// ============================================
// src/controllers/lesson.controller.ts
// ============================================

import { Request, Response } from "express";
import mongoose from "mongoose";
import { ILesson, Lesson, ResourceType, LessonType, IResource } from "../models/Lesson";
import { Module } from "../models/Module";
import { Course } from "../models/Course";
import { Progress } from "../models/ProgressTrack";
import { Enrollment, EnrollmentStatus } from "../models/Enrollment";
import { QueryHelper } from "../utils/queryHelper";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { getIo } from "../config/socket";
import { NotificationType } from "../models/Notification";
import { notifyCourseStudents, pushNotification } from "../utils/pushNotification";
import { NotificationTemplates } from "../utils/notificationTemplates";
import { Program } from "../models/program";

// ==============================
// CREATE LESSON
// ==============================
export const createLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    module,
    order,
    title,
    description,
    type,
    estimatedMinutes,
    content,
    learningObjectives,
    codeExamples,
    assignments,
    isPreview,
    isRequired,
    completionRule,
  } = req.body;

  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // Log received data for debugging
  console.log('Received lesson data:', {
    module,
    title,
    type,
    estimatedMinutes,
    learningObjectives,
    isPreview,
    isRequired
  });

  if (!module || !title || !description || !type || !estimatedMinutes || !content) {
    res.status(400).json({ 
      success: false, 
      error: "Please provide module, title, description, type, estimatedMinutes, and content" 
    });
    return;
  }

  // Verify module exists and get course info
  const moduleExists = await Module.findById(module)
    .populate('course', 'title createdBy');
  
  if (!moduleExists) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  // Check permissions for instructors
  if (req.user.role === 'instructor') {
    const course = moduleExists.course as any;
    if (course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({ 
        success: false, 
        error: "You can only create lessons in your own courses" 
      });
      return;
    }
  }

  // Handle uploaded files
  const resources: IResource[] = [];
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  if (files) {
    if (files.video) {
      files.video.forEach((f) => {
        resources.push({
          title: f.originalname,
          type: ResourceType.VIDEO,
          url: f.path,
          size: f.size,
        });
      });
    }
    
    if (files.documents) {
      files.documents.forEach((f) => {
        resources.push({
          title: f.originalname,
          type: ResourceType.PDF,
          url: f.path,
          size: f.size,
        });
      });
    }
    
    if (files.slides) {
      files.slides.forEach((f) => {
        resources.push({
          title: f.originalname,
          type: ResourceType.SLIDES,
          url: f.path,
          size: f.size,
        });
      });
    }
    
    if (files.resources) {
      files.resources.forEach((f) => {
        resources.push({
          title: f.originalname,
          type: ResourceType.OTHER,
          url: f.path,
          size: f.size,
        });
      });
    }
  }

  // Parse JSON strings from FormData (arrays and objects come as JSON strings)
  let parsedLearningObjectives: string[] = [];
  let parsedCodeExamples: string[] = [];
  let parsedAssignments: string[] = [];
  let parsedCompletionRule: any = { type: 'view' };

  try {
    if (learningObjectives) {
      parsedLearningObjectives = typeof learningObjectives === 'string' 
        ? JSON.parse(learningObjectives) 
        : learningObjectives;
    }
  } catch (e) {
    console.error('Error parsing learningObjectives:', e);
  }

  try {
    if (codeExamples) {
      parsedCodeExamples = typeof codeExamples === 'string' 
        ? JSON.parse(codeExamples) 
        : codeExamples;
    }
  } catch (e) {
    console.error('Error parsing codeExamples:', e);
  }

  try {
    if (assignments) {
      parsedAssignments = typeof assignments === 'string' 
        ? JSON.parse(assignments) 
        : assignments;
    }
  } catch (e) {
    console.error('Error parsing assignments:', e);
  }

  try {
    if (completionRule) {
      parsedCompletionRule = typeof completionRule === 'string' 
        ? JSON.parse(completionRule) 
        : completionRule;
    }
  } catch (e) {
    console.error('Error parsing completionRule:', e);
  }

  // Parse boolean values from FormData (they come as strings "true"/"false")
  const parsedIsPreview = isPreview === 'true' || isPreview === true;
  const parsedIsRequired = isRequired === 'false' ? false : true; // default true

  const lesson = await Lesson.create({
    module,
    order: order || 1,
    title,
    description,
    type,
    estimatedMinutes: parseInt(estimatedMinutes),
    content,
    learningObjectives: parsedLearningObjectives,
    resources,
    codeExamples: parsedCodeExamples,
    assignments: parsedAssignments,
    isPreview: parsedIsPreview,
    isRequired: parsedIsRequired,
    completionRule: parsedCompletionRule,
    isPublished: false,
  });

// ✅ ADD THIS: Push lesson to module's lessons array
  await Module.findByIdAndUpdate(
    module._id,
    { $push: { lessons: lesson._id } }
  );
  console.log('Lesson created successfully:', lesson._id);

  res.status(201).json({
    success: true,
    message: "Lesson created successfully, pending publication",
    data: lesson,
  });
});

// ==============================
// TOGGLE LESSON PUBLISH
// ==============================
export const toggleLessonPublish = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lesson = await Lesson.findById(req.params.id)
    .populate({
      path: 'module',
      populate: { 
        path: 'course', 
        select: 'title program',
        populate: {
          path: 'program',
          select: 'title'
        }
      }
    });
  
  if (!lesson) {
    res.status(404).json({ success: false, error: "Lesson not found" });
    return;
  }

  const wasPublished = lesson.isPublished;
  lesson.isPublished = !lesson.isPublished;
  await lesson.save();

  // Notify students when lesson is published
  if (lesson.isPublished && !wasPublished) {
    const module = lesson.module as any;
    const course = module.course as any;
    
    try {
      const notification = NotificationTemplates.lessonPublished(lesson.title, module.title);
      
      await notifyCourseStudents(course._id, {
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedId: lesson._id,
        relatedModel: "Lesson",
      });

      // Real-time notification via Socket.IO
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
            title: "New Lesson Available",
            message: `${lesson.title} is now available in ${module.title}`,
            lessonId: lesson._id,
            moduleId: module._id,
            courseId: course._id,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      console.error('Error sending lesson publish notifications:', error);
    }
  }

  res.json({
    success: true,
    message: `Lesson ${lesson.isPublished ? "published" : "unpublished"} successfully`,
    data: lesson,
  });
});

// ==============================
// START LESSON (Mark as In Progress)
// ==============================
export const startLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const lesson = await Lesson.findById(req.params.id);
  if (!lesson || !lesson.isPublished) {
    res.status(404).json({ success: false, error: "Lesson not found or not published" });
    return;
  }

  // Get module and course info
  const module = await Module.findById(lesson.module);
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const course = await Course.findById(module.course);
  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  // Find or create course-level progress
  let progress = await Progress.findOne({ 
    studentId: req.user._id, 
    courseId: course._id 
  });

  if (!progress) {
    // Count total lessons in course
    const modules = await Module.find({ course: course._id });
    const moduleIds = modules.map(m => m._id);
    const totalLessons = await Lesson.countDocuments({ module: { $in: moduleIds } });

    progress = await Progress.create({
      studentId: req.user._id,
      courseId: course._id,
      programId: course.program,
      modules: [],
      overallProgress: 0,
      completedLessons: 0,
      totalLessons,
      completedAssessments: 0,
      totalAssessments: 0,
      averageScore: 0,
      totalTimeSpent: 0,
      lastAccessedAt: new Date(),
      enrolledAt: new Date(),
    });
  }

  // Find or create module progress
  let moduleProgress = progress.modules.find(
    (m) => m.moduleId.toString() === lesson.module.toString()
  );

  if (!moduleProgress) {
    moduleProgress = {
      moduleId: lesson.module,
      lessons: [],
      assessments: [],
      completionPercentage: 0,
      startedAt: new Date(),
    };
    progress.modules.push(moduleProgress);
  }

  // Find or create lesson progress
  let lessonProgress = moduleProgress.lessons.find(
    (l) => l.lessonId.toString() === lesson._id.toString()
  );

  if (!lessonProgress) {
    lessonProgress = {
      lessonId: lesson._id,
      status: "in_progress",
      startedAt: new Date(),
      timeSpent: 0,
    };
    moduleProgress.lessons.push(lessonProgress);
  } else if (lessonProgress.status === "not_started") {
    lessonProgress.status = "in_progress";
    lessonProgress.startedAt = new Date();
  }

  progress.lastAccessedAt = new Date();
  await progress.save();

  res.status(200).json({
    success: true,
    message: "Lesson started",
    data: progress,
  });
});

// ==============================
// COMPLETE LESSON
// ==============================
export const completeLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { timeSpent } = req.body; // in minutes

  const lesson = await Lesson.findById(req.params.id);
  if (!lesson || !lesson.isPublished) {
    res.status(404).json({ success: false, error: "Lesson not found or not published" });
    return;
  }

  const module = await Module.findById(lesson.module);
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const course = await Course.findById(module.course);
  if (!course) {
    res.status(404).json({ success: false, error: "Course not found" });
    return;
  }

  // Find or create progress
  let progress = await Progress.findOne({ 
    studentId: req.user._id, 
    courseId: course._id 
  });

  if (!progress) {
    const modules = await Module.find({ course: course._id });
    const moduleIds = modules.map(m => m._id);
    const totalLessons = await Lesson.countDocuments({ module: { $in: moduleIds } });

    progress = await Progress.create({
      studentId: req.user._id,
      courseId: course._id,
      programId: course.program,
      modules: [],
      overallProgress: 0,
      completedLessons: 0,
      totalLessons,
      completedAssessments: 0,
      totalAssessments: 0,
      averageScore: 0,
      totalTimeSpent: 0,
      lastAccessedAt: new Date(),
      enrolledAt: new Date(),
    });
  }

  // Find or create module progress
  let moduleProgress = progress.modules.find(
    (m) => m.moduleId.toString() === lesson.module.toString()
  );

  if (!moduleProgress) {
    moduleProgress = {
      moduleId: lesson.module,
      lessons: [],
      assessments: [],
      completionPercentage: 0,
      startedAt: new Date(),
    };
    progress.modules.push(moduleProgress);
  }

  // Find or create lesson progress
  let lessonProgress = moduleProgress.lessons.find(
    (l) => l.lessonId.toString() === lesson._id.toString()
  );

  if (!lessonProgress) {
    lessonProgress = {
      lessonId: lesson._id,
      status: "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      timeSpent: timeSpent || 0,
    };
    moduleProgress.lessons.push(lessonProgress);
  } else if (lessonProgress.status !== "completed") {
    lessonProgress.status = "completed";
    lessonProgress.completedAt = new Date();
    lessonProgress.timeSpent = (lessonProgress.timeSpent || 0) + (timeSpent || 0);
  }

  // Calculate module completion percentage
  const moduleLessons = await Lesson.countDocuments({ module: lesson.module });
  const completedInModule = moduleProgress.lessons.filter(l => l.status === "completed").length;
  moduleProgress.completionPercentage = Math.round((completedInModule / moduleLessons) * 100);

  if (moduleProgress.completionPercentage === 100 && !moduleProgress.completedAt) {
    moduleProgress.completedAt = new Date();
  }

  // Calculate overall progress
  const totalCompletedLessons = progress.modules.reduce(
    (sum, m) => sum + m.lessons.filter(l => l.status === "completed").length,
    0
  );

  progress.completedLessons = totalCompletedLessons;
  progress.overallProgress = progress.totalLessons > 0 
    ? Math.round((totalCompletedLessons / progress.totalLessons) * 100) 
    : 0;
  
  progress.totalTimeSpent += (timeSpent || 0) / 60; // Convert minutes to hours
  progress.lastAccessedAt = new Date();

  await progress.save();

  // Update enrollment progress
  await updateEnrollmentProgress(req.user._id, course.program, course._id);

  // Check for module completion and notify
  if (moduleProgress.completionPercentage === 100 && completedInModule === moduleLessons) {
    try {
      await pushNotification({
        userId: req.user._id,
        type: NotificationType.COURSE_UPDATE,
        title: "Module Completed!",
        message: `Congratulations! You've completed ${module.title}`,
        relatedId: module._id,
        relatedModel: "Module",
      });
    } catch (error) {
      console.error('Error sending module completion notification:', error);
    }
  }

  res.json({ 
    success: true, 
    message: "Lesson marked as completed", 
    data: progress 
  });
});

// ==============================
// HELPER: Update Enrollment Progress
// ==============================
async function updateEnrollmentProgress(
  studentId: mongoose.Types.ObjectId,
  programId: mongoose.Types.ObjectId,
  courseId: mongoose.Types.ObjectId
) {
  try {
    const enrollment = await Enrollment.findOne({ studentId, program: programId });
    if (!enrollment) return;

    const courseProgressIndex = enrollment.coursesProgress.findIndex(
      cp => cp.course.toString() === courseId.toString()
    );

    if (courseProgressIndex === -1) return;

    const progress = await Progress.findOne({ studentId, courseId });
    if (!progress) return;

    // Update lessons completed count
    enrollment.coursesProgress[courseProgressIndex].lessonsCompleted = progress.completedLessons;
    
    // Update course status to active if it was pending
    if (enrollment.coursesProgress[courseProgressIndex].status === EnrollmentStatus.PENDING && 
        progress.completedLessons > 0) {
      enrollment.coursesProgress[courseProgressIndex].status = EnrollmentStatus.ACTIVE;
    }
    
    // Check if course is completed (100% progress)
    if (progress.overallProgress === 100 && 
        enrollment.coursesProgress[courseProgressIndex].status !== EnrollmentStatus.COMPLETED) {
      enrollment.coursesProgress[courseProgressIndex].status = EnrollmentStatus.COMPLETED;
      enrollment.coursesProgress[courseProgressIndex].completionDate = new Date();

      // Notify student of course completion
      const course = await Course.findById(courseId).select('title');
      if (course) {
        await pushNotification({
          userId: studentId,
          type: NotificationType.COURSE_UPDATE,
          title: "Course Completed!",
          message: `Congratulations! You've completed ${course.title}`,
          relatedId: courseId,
          relatedModel: "Course",
        });
      }
    }

    await enrollment.save();

    // Check if all courses in the program are completed
    const allCoursesCompleted = enrollment.coursesProgress.every(
      cp => cp.status === EnrollmentStatus.COMPLETED
    );

    if (allCoursesCompleted && enrollment.status !== EnrollmentStatus.COMPLETED) {
      enrollment.status = EnrollmentStatus.COMPLETED;
      enrollment.completionDate = new Date();
      await enrollment.save();

      // Notify student of program completion
      const programDoc = await Program.findById(programId).select('title');
      
      if (programDoc) {
        await pushNotification({
          userId: studentId,
          type: NotificationType.CERTIFICATE_ISSUED,
          title: "Program Completed!",
          message: `Congratulations! You've completed the ${programDoc.title} program`,
          relatedId: programId,
          relatedModel: "Course",
        });
      }
    }
  } catch (error) {
    console.error('Error updating enrollment progress:', error);
  }
}

// ==============================
// GET ALL LESSONS (ADMIN)
// ==============================
export const getAllLessonsAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '20', moduleId, type, isPublished } = req.query;

  const filter: any = {};
  if (moduleId) filter.module = moduleId;
  if (type) filter.type = type;
  if (isPublished !== undefined) filter.isPublished = isPublished === 'true';

  let query = Lesson.find(filter)
    .populate('module', 'title course')
    .sort({ order: 1 });

  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;

  const total = await Lesson.countDocuments(filter);
  const lessons = await query;

  res.status(200).json({ 
    success: true, 
    count: lessons.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: lessons 
  });
});

// ==============================
// GET PUBLISHED LESSONS
// ==============================
export const getPublishedLessons = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '20', moduleId, type } = req.query;

  const filter: any = { isPublished: true };
  if (moduleId) filter.module = moduleId;
  if (type) filter.type = type;

  let query = Lesson.find(filter)
    .populate('module', 'title course')
    .sort({ order: 1 });

  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.filter().search(["title", "description"]).sort().paginate().query;

  const total = await Lesson.countDocuments(filter);
  const lessons = await query;

  res.status(200).json({ 
    success: true, 
    count: lessons.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: lessons 
  });
});

// ==============================
// GET LESSON BY ID
// ==============================
export const getLessonById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lesson = await Lesson.findById(req.params.id)
    .populate({
      path: 'module',
      select: 'title description course',
      populate: {
        path: 'course',
        select: 'title program'
      }
    });

  if (!lesson) {
    res.status(404).json({ success: false, error: "Lesson not found" });
    return;
  }

  // Check access permissions
  if (!lesson.isPublished && !lesson.isPreview) {
    if (!req.user || !['admin', 'instructor'].includes(req.user.role)) {
      res.status(404).json({ success: false, error: "Lesson not found" });
      return;
    }
  }

  res.status(200).json({ success: true, data: lesson });
});

// ==============================
// GET LESSONS BY MODULE
// ==============================
export const getLessonsByModule = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { moduleId } = req.params;
  const { page = "1", limit = "20", includeUnpublished } = req.query;

  console.log('📥 getLessonsByModule called:', {
    moduleId,
    includeUnpublished,
    userRole: req.user?.role,
    includeUnpublishedType: typeof includeUnpublished
  });

  const moduleExists = await Module.findById(moduleId);
  if (!moduleExists) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const filter: any = { module: moduleId };
  
  // Convert string 'true'/'false' to boolean
  const shouldIncludeUnpublished = includeUnpublished === 'true';
  const isAdminOrInstructor = req.user?.role === 'admin' || req.user?.role === 'instructor';
  
  console.log('🔍 Filter logic:', {
    shouldIncludeUnpublished,
    isAdminOrInstructor,
    willShowUnpublished: shouldIncludeUnpublished && isAdminOrInstructor
  });
  
  // Only show published lessons unless:
  // 1. includeUnpublished is explicitly 'true' AND
  // 2. User is admin or instructor
  if (!shouldIncludeUnpublished || !isAdminOrInstructor) {
    filter.isPublished = true;
  }

  console.log('📋 Final filter:', filter);

  let query = Lesson.find(filter).sort({ order: 1 });
  const queryHelper = new QueryHelper(query, req.query);
  query = queryHelper.sort().paginate().query;

  const total = await Lesson.countDocuments(filter);
  const lessons = await query;

  console.log('✅ Found lessons:', {
    count: lessons.length,
    total,
    lessonIds: lessons.map(l => l._id)
  });

  res.status(200).json({
    success: true,
    count: lessons.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: lessons,
  });
});

// ==============================
// UPDATE LESSON
// ==============================
export const updateLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lesson = await Lesson.findById(req.params.id).populate({
    path: 'module',
    populate: { path: 'course', select: 'createdBy' }
  });

  if (!lesson) {
    res.status(404).json({ success: false, error: "Lesson not found" });
    return;
  }

  // Check permissions for instructors
  if (req.user?.role === "instructor") {
    const module = lesson.module as any;
    const course = module.course as any;
    
    if (course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, error: "Cannot update this lesson" });
      return;
    }
    
    // Unpublish lesson when instructor updates
    lesson.isPublished = false;
  }

  // Handle uploaded files
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  if (files) {
    const newResources: IResource[] = [];

    if (files.video) {
      files.video.forEach((f) => {
        newResources.push({
          title: f.originalname,
          type: ResourceType.VIDEO,
          url: f.path,
          size: f.size,
        });
      });
    }

    if (files.documents) {
      files.documents.forEach((f) => {
        newResources.push({
          title: f.originalname,
          type: ResourceType.PDF,
          url: f.path,
          size: f.size,
        });
      });
    }

    if (files.slides) {
      files.slides.forEach((f) => {
        newResources.push({
          title: f.originalname,
          type: ResourceType.SLIDES,
          url: f.path,
          size: f.size,
        });
      });
    }

    if (files.resources) {
      files.resources.forEach((f) => {
        newResources.push({
          title: f.originalname,
          type: ResourceType.OTHER,
          url: f.path,
          size: f.size,
        });
      });
    }

    // Merge with existing resources if needed, or replace
    lesson.resources = [...(lesson.resources || []), ...newResources];
  }

  // Update other fields
  const allowedUpdates = [
    'title', 'description', 'type', 'estimatedMinutes', 'content',
    'learningObjectives', 'codeExamples', 'assignments', 'order',
    'isPreview', 'isRequired', 'completionRule'
  ];

  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      (lesson as any)[field] = req.body[field];
    }
  });

  await lesson.save();

  res.json({ 
    success: true, 
    message: req.user?.role === 'instructor' 
      ? "Lesson updated and submitted for review"
      : "Lesson updated successfully", 
    data: lesson 
  });
});

// ==============================
// DELETE LESSON
// ==============================
export const deleteLesson = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lesson = await Lesson.findById(req.params.id).populate({
    path: 'module',
    populate: { path: 'course', select: 'createdBy' }
  });

  if (!lesson) {
    res.status(404).json({ success: false, error: "Lesson not found" });
    return;
  }

  // Check permissions for instructors
  if (req.user?.role === "instructor") {
    const module = lesson.module as any;
    const course = module.course as any;
    
    if (course.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, error: "Cannot delete this lesson" });
      return;
    }
  }

  await lesson.deleteOne();

  res.status(200).json({ success: true, message: "Lesson deleted successfully" });
});

// ==============================
// REORDER LESSONS
// ==============================
export const reorderLessons = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { orders } = req.body;

  if (!Array.isArray(orders) || orders.length === 0) {
    res.status(400).json({ success: false, error: "Invalid orders array" });
    return;
  }

  const bulkOps = orders.map((item: any) => ({
    updateOne: { 
      filter: { _id: item.lessonId }, 
      update: { order: item.order } 
    },
  }));

  await Lesson.bulkWrite(bulkOps);

  res.status(200).json({ success: true, message: "Lessons reordered successfully" });
});

// ==============================
// GET LESSON STATISTICS
// ==============================
export const lessonStats = asyncHandler(async (req: Request, res: Response) => {
  const { moduleId, courseId } = req.query;

  const matchStage: any = {};
  if (moduleId) matchStage.module = new mongoose.Types.ObjectId(moduleId as string);
  if (courseId) {
    const modules = await Module.find({ course: courseId });
    matchStage.module = { $in: modules.map(m => m._id) };
  }

  const stats = await Lesson.aggregate([
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    {
      $group: {
        _id: "$type",
        total: { $sum: 1 },
        published: { $sum: { $cond: ["$isPublished", 1, 0] } },
        avgDuration: { $avg: "$estimatedMinutes" },
      },
    },
  ]);

  const totalStats = await Lesson.aggregate([
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    {
      $group: {
        _id: null,
        totalLessons: { $sum: 1 },
        publishedLessons: { $sum: { $cond: ["$isPublished", 1, 0] } },
        totalMinutes: { $sum: "$estimatedMinutes" },
      },
    },
  ]);

  res.status(200).json({ 
    success: true, 
    data: {
      byType: stats,
      overall: totalStats[0] || {
        totalLessons: 0,
        publishedLessons: 0,
        totalMinutes: 0
      }
    }
  });
});

// ==============================
// GET STUDENT'S COURSE PROGRESS
// ==============================
export const getCourseProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { courseId } = req.params;

  const progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: courseId
  })
  .populate({
    path: 'modules.moduleId',
    select: 'title description order'
  })
  .populate({
    path: 'modules.lessons.lessonId',
    select: 'title type estimatedMinutes order'
  });

  if (!progress) {
    res.status(404).json({ 
      success: false, 
      error: "No progress found for this course" 
    });
    return;
  }

  res.status(200).json({ success: true, data: progress });
});

// ==============================
// GET STUDENT'S LESSON PROGRESS
// ==============================
export const getLessonProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const { lessonId } = req.params;

  const lesson = await Lesson.findById(lessonId);
  if (!lesson) {
    res.status(404).json({ success: false, error: "Lesson not found" });
    return;
  }

  const module = await Module.findById(lesson.module);
  if (!module) {
    res.status(404).json({ success: false, error: "Module not found" });
    return;
  }

  const progress = await Progress.findOne({
    studentId: req.user._id,
    courseId: module.course
  });

  if (!progress) {
    res.status(200).json({ 
      success: true, 
      data: {
        status: 'not_started',
        timeSpent: 0,
        completedAt: null
      }
    });
    return;
  }

  const moduleProgress = progress.modules.find(
    m => m.moduleId.toString() === lesson.module.toString()
  );

  if (!moduleProgress) {
    res.status(200).json({ 
      success: true, 
      data: {
        status: 'not_started',
        timeSpent: 0,
        completedAt: null
      }
    });
    return;
  }

  const lessonProgress = moduleProgress.lessons.find(
    l => l.lessonId.toString() === lessonId
  );

  res.status(200).json({ 
    success: true, 
    data: lessonProgress || {
      status: 'not_started',
      timeSpent: 0,
      completedAt: null
    }
  });
});

// ==============================================
// GET ALL LESSONS (INSTRUCTOR + ADMIN)
// ==============================================
export const getAllLessonsInstructor = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    // Only instructors and admins are allowed
    if (!["admin", "instructor"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    const {
      page = "1",
      limit = "20",
      search,
      type,
      isPublished,
      moduleId,
    } = req.query;

    // Build filter
    const filter: any = {};
    if (moduleId) filter.module = moduleId;
    if (type) filter.type = type;
    if (isPublished !== undefined)
      filter.isPublished = isPublished === "true";

    // Base query
    let query = Lesson.find(filter)
      .populate("module", "title course")
      .sort({ updatedAt: -1 });

    // Apply QueryHelper
    const helper = new QueryHelper(query, req.query)
      .search(["title", "description"])
      .filter()
      .sort()
      .paginate();

    const lessons = await helper.query;
    const total = await Lesson.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: lessons,
      total,
      count: lessons.length,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  }
);