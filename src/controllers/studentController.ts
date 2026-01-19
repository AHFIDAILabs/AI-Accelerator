// src/controllers/studentDashboardController.ts
import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { User } from "../models/user";
import { Module } from "../models/Module";
import { Lesson } from "../models/Lesson";
import { Progress, IProgress, IModuleProgress, ILessonProgress } from "../models/ProgressTrack";
import { Notification } from "../models/Notification";
import { ObjectId } from "mongodb";

// ======================================================
// DASHBOARD OVERVIEW
// ======================================================
export const getDashboardOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  // Fetch all progress entries for this student
  const progressList = await Progress.find({ studentId: req.user._id });

  const totalCourses = progressList.length;
  const overallProgress =
    progressList.length > 0
      ? Math.round(progressList.reduce((sum, p) => sum + p.overallProgress, 0) / progressList.length)
      : 0;

  const totalLessonsCompleted = progressList.reduce((sum, p) => sum + p.completedLessons, 0);
  const totalLessons = progressList.reduce((sum, p) => sum + p.totalLessons, 0);

  // Get recent notifications (unread count)
  const unreadNotifications = await Notification.countDocuments({
    userId: req.user._id,
    isRead: false,
  });

  return res.status(200).json({
    success: true,
    data: {
      totalCourses,
      overallProgress,
      totalLessonsCompleted,
      totalLessons,
      unreadNotifications,
    },
  });
});

// ======================================================
// GET ENROLLED COURSES (via Modules)
// ======================================================
export const getEnrolledCourses = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  // Find all progress entries for the student
  const progressList = await Progress.find({ studentId: req.user._id }).populate({
    path: "modules.moduleId",
    select: "title courseId",
  });

  const coursesMap: Record<string, any> = {};
  progressList.forEach((progress) => {
    progress.modules.forEach((module) => {
      const moduleData: any = module.moduleId;
      if (!moduleData) return;
      const courseId = moduleData.courseId.toString();
      if (!coursesMap[courseId]) {
        coursesMap[courseId] = {
          courseId,
          modules: [],
        };
      }
      coursesMap[courseId].modules.push({
        moduleId: moduleData._id,
        title: moduleData.title,
        completionPercentage: module.completionPercentage,
      });
    });
  });

  return res.status(200).json({
    success: true,
    data: Object.values(coursesMap),
  });
});

// ======================================================
// GET COURSE PROGRESS
// ======================================================
export const getCourseProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { courseId } = req.params;

  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const progress = await Progress.findOne({ studentId: req.user._id, courseId }).populate({
    path: "modules.moduleId",
    select: "title order",
  });

  if (!progress) return res.status(404).json({ success: false, error: "Progress not found" });

  return res.status(200).json({ success: true, data: progress });
});

// ======================================================
// GET MODULE LESSONS WITH PROGRESS
// ======================================================
export const getModuleLessons = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { moduleId } = req.params;

  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const moduleExists = await Module.findById(moduleId);
  if (!moduleExists) return res.status(404).json({ success: false, error: "Module not found" });

  const lessons = await Lesson.find({ moduleId, isPublished: true }).sort({ order: 1 });

  const progress = await Progress.findOne({ studentId: req.user._id, courseId: moduleExists.courseId });

  let lessonProgressMap: Record<string, ILessonProgress> = {};
  if (progress) {
    const moduleProgress: IModuleProgress | undefined = progress.modules.find(
      (m) => m.moduleId.toString() === moduleId
    );
    if (moduleProgress) {
      moduleProgress.lessons.forEach((l) => {
        lessonProgressMap[l.lessonId.toString()] = l;
      });
    }
  }

  const lessonsWithProgress = lessons.map((lesson) => ({
    ...lesson.toObject(),
    progress: lessonProgressMap[lesson._id.toString()] || { status: "not_started" },
  }));

  return res.status(200).json({ success: true, data: lessonsWithProgress });
});

// ======================================================
// GET SINGLE LESSON DETAILS WITH PROGRESS
// ======================================================
export const getLessonDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { lessonId } = req.params;

  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const lesson = await Lesson.findById(lessonId).populate("moduleId", "title courseId");
  if (!lesson || !lesson.isPublished)
    return res.status(404).json({ success: false, error: "Lesson not found" });

  const progress = await Progress.findOne({ studentId: req.user._id, courseId: lesson.moduleId._id });

  let lessonProgress: ILessonProgress = {
    status: "not_started",
    lessonId: new ObjectId(),
  };
  if (progress) {
    const moduleProgress: IModuleProgress | undefined = progress.modules.find(
      (m) => m.moduleId.toString() === lesson.moduleId._id.toString()
    );
    if (moduleProgress) {
      const lProgress = moduleProgress.lessons.find((l) => l.lessonId.toString() === lesson._id.toString());
      if (lProgress) lessonProgress = lProgress;
    }
  }

  return res.status(200).json({
    success: true,
    data: {
      lesson,
      progress: lessonProgress,
    },
  });
});

// ======================================================
// GET STUDENT NOTIFICATIONS
// ======================================================
export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { page = '1', limit = '20', unreadOnly = 'false' } = req.query;

  const filter: any = { userId: req.user._id };
  if (unreadOnly === 'true') {
    filter.isRead = false;
  }

  const total = await Notification.countDocuments(filter);

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .skip((parseInt(page as string) - 1) * parseInt(limit as string))
    .limit(parseInt(limit as string));

  return res.status(200).json({
    success: true,
    count: notifications.length,
    total,
    page: parseInt(page as string),
    pages: Math.ceil(total / parseInt(limit as string)),
    data: notifications,
  });
});

// ======================================================
// MARK NOTIFICATION AS READ
// ======================================================
export const markNotificationRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { notificationId } = req.params;

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId: req.user._id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({ success: false, error: "Notification not found" });
  }

  return res.status(200).json({
    success: true,
    message: "Notification marked as read",
    data: notification,
  });
});

// ======================================================
// MARK ALL NOTIFICATIONS AS READ
// ======================================================
export const markAllNotificationsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const result = await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  return res.status(200).json({
    success: true,
    message: `${result.modifiedCount} notifications marked as read`,
    count: result.modifiedCount,
  });
});

// ======================================================
// DELETE NOTIFICATION
// ======================================================
export const deleteNotification = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });

  const { notificationId } = req.params;

  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    userId: req.user._id,
  });

  if (!notification) {
    return res.status(404).json({ success: false, error: "Notification not found" });
  }

  return res.status(200).json({
    success: true,
    message: "Notification deleted successfully",
  });
});