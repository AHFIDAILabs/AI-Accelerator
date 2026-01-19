// ============================================
// src/routes/module.routes.ts
// ============================================

import express from "express";
import {
  createModule,
  getModuleById,
  getAllModulesAdmin,
  getPublishedModules,
  updateModule,
  deleteModule,
  toggleModulePublish,
  reorderModules,
} from "../controllers/moduleController";
import { protect } from "../middlewares/auth";
import { UserRole } from "../models/user";
import { authorize } from "../middlewares/adminAuth";
const moduleRouter = express.Router();

// ==============================
// Public routes (students)
// ==============================
moduleRouter.get("/course/:courseId", getPublishedModules); // Get all published modules for a course
moduleRouter.get("/:id", getModuleById); // Get single module (published or admin/instructor access)

// ==============================
// Protected routes (admin & instructor)
// ==============================
moduleRouter.use(protect); // All routes below require authentication

moduleRouter.post("/", createModule); // Create module
moduleRouter.put("/:id", updateModule); // Update module
moduleRouter.delete("/:id", deleteModule); // Delete module
moduleRouter.patch("/reorder", reorderModules); // Bulk reorder modules

// Admin-only routes
moduleRouter.patch("/:id/publish", authorize(UserRole.ADMIN), toggleModulePublish);
moduleRouter.get("/", authorize(UserRole.ADMIN), getAllModulesAdmin); // Admin: get all modules

export default moduleRouter;
