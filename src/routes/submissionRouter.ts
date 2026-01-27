// ============================================
// src/routes/submission.routes.ts
// ============================================

import express from "express";
import { protect } from "../middlewares/auth";
import { authorize } from "../middlewares/adminAuth";
import { UserRole } from "../models/user";
import { 
  createSubmission, 
  gradeSubmission,
  getSubmission,
  getSubmissionsByAssessment,
  getMySubmissions,
  getSubmissionsByStudent
} from "../controllers/submissioController";

const submissionRouter = express.Router();

// ============================================
// STUDENT ROUTES
// ============================================

// Create submission
submissionRouter.post(
  "/", 
  protect, 
  authorize(UserRole.STUDENT), 
  createSubmission
);

// Get my submissions for an assessment
submissionRouter.get(
  "/assessments/:assessmentId/my-submissions",
  protect,
  authorize(UserRole.STUDENT),
  getMySubmissions
);

// Get single submission
submissionRouter.get(
  "/:id",
  protect,
  getSubmission
);

// ============================================
// ADMIN/INSTRUCTOR ROUTES
// ============================================

// Grade submission
submissionRouter.put(
  "/grade/:submissionId",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  gradeSubmission
);

// Get all submissions for an assessment
submissionRouter.get(
  "/assessments/:assessmentId",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getSubmissionsByAssessment
);

// Get submissions by student
submissionRouter.get(
  "/students/:studentId",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getSubmissionsByStudent
);

export default submissionRouter;