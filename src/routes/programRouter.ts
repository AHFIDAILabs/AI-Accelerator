import { Router } from "express";
import {
  createProgram,
  updateProgram,
  getPrograms,
  getProgram,
  addCourseToProgram,
  removeCourseFromProgram,
  toggleProgramPublish,
  deleteProgram,
} from "../controllers/programController";
import { protect } from "../middlewares/auth";
import { authorize } from "../middlewares/adminAuth";
import { UserRole } from "../models/user";

const programRouter = Router();

// 🔹 All routes that modify programs require authentication
programRouter.use(protect);

// =============================
// PUBLIC / AUTHENTICATED PROGRAM ROUTES
// =============================
programRouter.get("/", getPrograms);           // Authenticated users see programs according to role
programRouter.get("/:id", getProgram);         // Get single program details

// =============================
// PROGRAM MANAGEMENT ROUTES
// =============================

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
