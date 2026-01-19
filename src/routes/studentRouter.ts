// src/routes/student.routes.ts
import express from "express";
import { protect } from "../middlewares/auth";
import {
  getDashboardOverview,
  getEnrolledCourses,
  getCourseProgress,
  getModuleLessons,
  getLessonDetails,
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
// Get progress for a specific course
// GET /api/student/course/:courseId/progress
// ======================================================
studentRouter.get("/course/:courseId/progress", getCourseProgress);

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

export default studentRouter;
