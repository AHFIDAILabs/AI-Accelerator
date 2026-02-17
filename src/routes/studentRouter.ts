// src/routes/student.routes.ts
import express from "express";
import { protect } from "../middlewares/auth";
import {
  getDashboardOverview,
  getEnrolledCourses,
  getEnrolledPrograms,
  getProgramCourses,
  getCourseProgress,
  getCourseModules,
  getModuleLessons,
  getLessonDetails,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  getRecentActivity,
  getLearningStatistics,
  
} from "../controllers/studentController";

const studentRouter = express.Router();

// All routes below require authentication
studentRouter.use(protect);

// ======================================================
// Dashboard Overview
// GET /api/student/dashboard
// ======================================================
studentRouter.get("/dashboard", getDashboardOverview);

// ======================================================
// Get all enrolled courses
// GET /api/student/courses
// ======================================================
studentRouter.get("/courses", getEnrolledCourses);

// ======================================================
// Get all enrolled programs
// GET /api/student/programs
// ======================================================
studentRouter.get("/programs", getEnrolledPrograms);

// ======================================================
// Get courses for a specific program
// GET /api/student/program/:programId/courses
// ======================================================
studentRouter.get("/program/:programId/courses", getProgramCourses);

// ======================================================
// Get progress for a specific course
// GET /api/student/course/:courseId/progress
// ======================================================
studentRouter.get("/course/:courseId/progress", getCourseProgress);

// ======================================================
// Get modules for a specific course
// GET /api/student/course/:courseId/modules
// ======================================================
studentRouter.get("/course/:courseId/modules", getCourseModules);

// ======================================================
// Get all lessons in a module (with student progress)
// GET /api/student/module/:moduleId/lessons
// ======================================================
studentRouter.get("/module/:moduleId/lessons", getModuleLessons);

// ======================================================
// Get single lesson details (with student progress)
// GET /api/student/lesson/:lessonId
// ======================================================
studentRouter.get("/lesson/:lessonId", getLessonDetails);

// ======================================================
// Notifications
// GET /api/student/notifications
studentRouter.get("/notifications", getNotifications);

// ======================================================
// Mark single notification as read
// PATCH /api/student/notifications/:notificationId/read
studentRouter.patch("/notifications/:notificationId/read", markNotificationRead);

// ======================================================
// Mark all notifications as read
// PATCH /api/student/notifications/read-all
studentRouter.patch("/notifications/read-all", markAllNotificationsRead);

// ======================================================
// Delete notification
// DELETE /api/student/notifications/:notificationId
studentRouter.delete("/notifications/:notificationId", deleteNotification);

// ======================================================
// Recent activity
// GET /api/student/recent-activity
studentRouter.get("/recent-activity", getRecentActivity);

// ======================================================
// Learning statistics
// GET /api/student/statistics
studentRouter.get("/statistics", getLearningStatistics);

export default studentRouter;
