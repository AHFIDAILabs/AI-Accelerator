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
// PUBLIC / PROTECTED ROUTES
// ======================================================

// All routes below require authentication
enrollmentRouter.use(protect);

// Get enrollments for logged-in student
enrollmentRouter.get("/me", getStudentEnrollments);
enrollmentRouter.post("/validate-scholarship", validateScholarshipCode)

// ======================================================
// ADMIN ROUTES
// ======================================================

// Admin-only routes
enrollmentRouter.use(adminOnly);


enrollmentRouter.get('/available-students', getAvailableStudents)

// Bulk Enroll Students
enrollmentRouter.post("/bulk", protect, authorize(UserRole.ADMIN), bulkEnrollStudentsInProgram)
enrollmentRouter.post("/bulk-email", protect, authorize(UserRole.ADMIN), bulkEnrollByEmail)

// Enroll a student
enrollmentRouter.post("/", enrollStudent);

// Get all enrollments
enrollmentRouter.get("/", getAllEnrollments);

// Update enrollment status
enrollmentRouter.put("/:enrollmentId", updateEnrollmentStatus);

// Delete enrollment
enrollmentRouter.delete("/:enrollmentId", deleteEnrollment);

// Student self-enroll
enrollmentRouter.post("/program/:programId/self-enroll", selfEnrollInProgram);

// Get single enrollment
enrollmentRouter.get("/:enrollmentId", getEnrollmentById);

// Update course progress inside enrollment
enrollmentRouter.put("/:enrollmentId/course/:courseId", updateCourseProgress);

// Stats
enrollmentRouter.get("/stats/overview", getEnrollmentStats);

export default enrollmentRouter;
