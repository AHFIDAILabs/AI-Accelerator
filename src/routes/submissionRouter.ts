import express from "express";
import { protect } from "../middlewares/auth";
import { authorize } from "../middlewares/adminAuth";
import { UserRole } from "../models/user";
import { createSubmission, gradeSubmission } from "../controllers/submissioController";

const submissionRouter = express.Router();

// Student submits work
submissionRouter.post("/", protect, authorize(UserRole.STUDENT), createSubmission);

// Instructor/Admin grades
submissionRouter.put(
  "/grade/:submissionId",
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  gradeSubmission
);

export default submissionRouter;
