// ============================================
// src/routes/sessionRouter.ts
// ============================================

import { Router } from "express";
import {
  createLiveSession,
  updateLiveSession,
  deleteLiveSession,
  getLiveSession,
  getLiveSessionsForCourse,
  getStudentPastSessions,
  getStudentUpcomingSessions,
} from "../controllers/liveSession";
import { protect } from "../middlewares/auth";

const sessionRouter = Router();

// ── Named/static routes FIRST (before any :id wildcards) ─────────────────────
sessionRouter.get("/student/upcoming", protect, getStudentUpcomingSessions);
sessionRouter.get("/student/past",     protect, getStudentPastSessions);

// ── Course sessions — distinct prefix avoids collision with /:id ──────────────
sessionRouter.get("/course/:courseId", protect, getLiveSessionsForCourse);

// ── CRUD ─────────────────────────────────────────────────────────────────────
sessionRouter.post("/",      protect, createLiveSession);
sessionRouter.put("/:id",    protect, updateLiveSession);
sessionRouter.delete("/:id", protect, deleteLiveSession);

// ── Wildcard :id LAST ────────────────────────────────────────────────────────
sessionRouter.get("/:id", protect, getLiveSession);

export default sessionRouter;