// ============================================
// src/routes/progress.routes.ts
// ============================================

import express from "express";
import {
  startLesson,
  completeLesson,
  startAssessment,
  completeAssessment,
  getCourseProgress,
} from "../controllers/progressController";
import { protect } from "../middlewares/auth";

const progressRouter = express.Router();

// All routes are protected
progressRouter.use(protect);

// ==============================
// Lesson routes
// ==============================
progressRouter.post("/lesson/:lessonId/start", startLesson);       // Start lesson
progressRouter.post("/lesson/:lessonId/complete", completeLesson); // Complete lesson

// ==============================
// Assessment routes
// ==============================
progressRouter.post("/assessment/:assessmentId/start", startAssessment);       // Start assessment
progressRouter.post("/assessment/:assessmentId/complete", completeAssessment); // Complete assessment

// ==============================
// Get student progress for a course
// ==============================
progressRouter.get("/course/:courseId", getCourseProgress);

export default progressRouter;
