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
} from "../controllers/enrollmentController";
import { protect } from "../middlewares/auth";
import { adminOnly } from "../middlewares/adminAuth";

const enrollmentRouter = express.Router();

// ======================================================
// PUBLIC / PROTECTED ROUTES
// ======================================================

// All routes below require authentication
enrollmentRouter.use(protect);

// Get enrollments for logged-in student
enrollmentRouter.get("/me", getStudentEnrollments);

// ======================================================
// ADMIN ROUTES
// ======================================================

// Admin-only routes
enrollmentRouter.use(adminOnly);

// Enroll a student
enrollmentRouter.post("/", enrollStudent);

// Get all enrollments
enrollmentRouter.get("/", getAllEnrollments);

// Update enrollment status
enrollmentRouter.put("/:enrollmentId", updateEnrollmentStatus);

// Delete enrollment
enrollmentRouter.delete("/:enrollmentId", deleteEnrollment);

export default enrollmentRouter;
