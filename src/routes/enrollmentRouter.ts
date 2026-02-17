// ============================================
// src/routes/enrollmentRouter.ts
// ============================================

import express from "express";
import {
  enrollStudent,
  getAllEnrollments,
  getStudentEnrollments,
  updateEnrollmentStatus,
  deleteEnrollment,
  getEnrollmentById,
  getEnrollmentStats,
  selfEnrollInProgram,
  updateCourseProgress,
  validateScholarshipCode,
  bulkEnrollStudentsInProgram,
  getAvailableStudents,
  bulkEnrollByEmail
} from "../controllers/enrollmentController";
import { protect } from "../middlewares/auth";
import { adminOnly, authorize } from "../middlewares/adminAuth";
import { UserRole } from "../models/user";

const enrollmentRouter = express.Router();

// ======================================================
// PUBLIC / PROTECTED ROUTES (Before adminOnly middleware)
// ======================================================

// All routes below require authentication
enrollmentRouter.use(protect);

// Get enrollments for logged-in student
enrollmentRouter.get("/me", getStudentEnrollments);

// Validate scholarship
enrollmentRouter.post("/validate-scholarship", validateScholarshipCode);

// Student self-enroll (must be BEFORE adminOnly middleware)
enrollmentRouter.post("/program/:programId/self-enroll", selfEnrollInProgram);

// Stats endpoint (MUST be before /:enrollmentId)
enrollmentRouter.get("/stats/overview", authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), getEnrollmentStats);

// ======================================================
// ADMIN ROUTES
// ======================================================

// Admin-only routes (everything below requires admin role)
enrollmentRouter.use(adminOnly);

// ✅ CRITICAL: Specific routes MUST come BEFORE dynamic params


// Available students endpoint
enrollmentRouter.get('/available-students', getAvailableStudents);

// Get all enrollments (should be before /:enrollmentId to avoid conflicts)
enrollmentRouter.get("/", getAllEnrollments);

// Bulk operations
enrollmentRouter.post("/bulk", bulkEnrollStudentsInProgram);
enrollmentRouter.post("/bulk-email", bulkEnrollByEmail);

// Enroll a student
enrollmentRouter.post("/", enrollStudent);

// ✅ Dynamic param routes MUST come LAST
// Update enrollment status
enrollmentRouter.put("/:enrollmentId", updateEnrollmentStatus);

// Update course progress inside enrollment
enrollmentRouter.put("/:enrollmentId/course/:courseId", updateCourseProgress);

// Get single enrollment
enrollmentRouter.get("/:enrollmentId", getEnrollmentById);

// Delete enrollment
enrollmentRouter.delete("/:enrollmentId", deleteEnrollment);

export default enrollmentRouter;