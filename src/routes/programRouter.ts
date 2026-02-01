import { Router } from "express";
import {
  createProgram,
  updateProgram,
  getPrograms,
  getProgram,
  getProgramWithDetails,
  getProgramBySlug,
  addCourseToProgram,
  removeCourseFromProgram,
  toggleProgramPublish,
  deleteProgram,
} from "../controllers/programController";
import { protect } from "../middlewares/auth";
import { authorize } from "../middlewares/adminAuth";
import { UserRole } from "../models/user";

const programRouter = Router();

// =============================
// PUBLIC ROUTES (No Authentication Required)
// =============================

// Get all published programs
programRouter.get("/", getPrograms);

// ⚠️ CRITICAL: Specific routes MUST come BEFORE generic /:id route
// Otherwise Express matches /:id first and treats "slug" or "details" as an ID

// Get program by slug - MUST BE BEFORE /:id
programRouter.get("/slug/:slug", getProgramBySlug);

// Get program with full details (courses, modules, lessons) - MUST BE BEFORE /:id
programRouter.get("/details/:id", getProgramWithDetails);

// Get single program basic info - MUST BE LAST
programRouter.get("/:id", getProgram);

// =============================
// AUTHENTICATED ROUTES
// =============================

// Apply authentication to all routes below
programRouter.use(protect);

// Only Admins and Instructors can create programs
programRouter.post("/", authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), createProgram);

// Update program — must be Admin or Instructor owning the program
programRouter.put("/:id", authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), updateProgram);

// Add / Remove courses — must be Admin or Instructor owning the program
programRouter.post("/add-course", authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), addCourseToProgram);
programRouter.post("/remove-course", authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), removeCourseFromProgram);

// Publish / Unpublish — Admin only
programRouter.put("/:id/toggle-publish", authorize(UserRole.ADMIN), toggleProgramPublish);

// Delete — Admin only
programRouter.delete("/:id", authorize(UserRole.ADMIN), deleteProgram);

export default programRouter;