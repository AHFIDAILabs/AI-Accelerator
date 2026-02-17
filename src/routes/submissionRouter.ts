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

// ---------------------- STUDENT ----------------------

// Submit assessment
submissionRouter.post(
  "/", 
  protect, 
  authorize(UserRole.STUDENT), 
  createSubmission
);

// My submissions for one assessment
submissionRouter.get(
  "/assessment/:assessmentId/my-submissions",
  protect,
  authorize(UserRole.STUDENT),
  getMySubmissions
);

// Upload attachments
submissionRouter.post(
  "/upload",
  protect,
  authorize(UserRole.STUDENT),
  /* upload handler here */
);

// View one submission (student or instructor)
submissionRouter.get(
  "/:id",
  protect,
  getSubmission
);

// ---------------- Instructor / Admin ----------------

// All submissions for an assessment
submissionRouter.get(
  "/assessment/:assessmentId",
  protect,
  authorize(UserRole.INSTRUCTOR, UserRole.ADMIN),
  getSubmissionsByAssessment);

  // All submissions by a student (for instructors/admins)
submissionRouter.get(
  "/student/:studentId",
  protect,
  authorize(UserRole.INSTRUCTOR, UserRole.ADMIN),
  getSubmissionsByStudent
);

// Grade submission
submissionRouter.post(
  "/:id/grade",
  protect,
  authorize(UserRole.INSTRUCTOR, UserRole.ADMIN),
  gradeSubmission
);

export default submissionRouter;