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
import { protect, optionalAuth } from "../middlewares/auth";
import { authorize } from "../middlewares/adminAuth";
import { UserRole } from "../models/user";

const programRouter = Router();

// =============================
// PUBLIC ROUTES (No Authentication Required)
// =============================


// Public
programRouter.get("/", optionalAuth, getPrograms);
programRouter.get("/slug/:slug", optionalAuth, getProgramBySlug);
programRouter.get("/details/:id", optionalAuth, getProgramWithDetails);
programRouter.get("/:id", optionalAuth, getProgram);

// Authenticated
programRouter.use(protect);
programRouter.post("/", authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), createProgram);
programRouter.put("/:id", authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), updateProgram);
programRouter.post("/add-course", authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), addCourseToProgram);
programRouter.post("/remove-course", authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), removeCourseFromProgram);
programRouter.put("/:id/toggle-publish", authorize(UserRole.ADMIN), toggleProgramPublish);
programRouter.delete("/:id", authorize(UserRole.ADMIN), deleteProgram);

export default programRouter;
