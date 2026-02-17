// ============================================
// src/routes/moduleRouter.ts
// ============================================

import express from 'express';
import { optionalAuth, protect } from '../middlewares/auth';
import { authorize } from '../middlewares/adminAuth';
import { UserRole } from '../models/user';
import {
  createModule,
  getAllModulesAdmin,
  getPublishedModules,
  getModuleById,
  getModulesByCourse,
  updateModule,
  deleteModule,
  toggleModulePublish,
  reorderModules,
  getModuleStats,
  getModuleContent,
} from '../controllers/moduleController';

const moduleRouter = express.Router();

// ============================================
// PUBLIC ROUTES (No Auth Required)
// ============================================

// Get published modules (must come before /:id)
moduleRouter.get('/published', getPublishedModules);


// Public routes
moduleRouter.get('/published', getPublishedModules);

// ============================================
// PROTECTED ROUTES (Auth Required)
// ============================================

// Apply authentication to all routes below
moduleRouter.use(protect);

// IMPORTANT: Specific routes MUST come BEFORE generic /:id route
// Get modules by course (instructors can see unpublished)
moduleRouter.get('/course/:courseId', getModulesByCourse);

// Get module statistics (admin only)
moduleRouter.get('/stats/overview', authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), getModuleStats);

// Reorder modules
moduleRouter.put('/reorder', authorize(UserRole.INSTRUCTOR, UserRole.ADMIN), reorderModules);

// ============================================
// GENERIC ID ROUTES (Must come AFTER specific routes)
// ============================================

// Get module by ID (public if published, protected if unpublished)
moduleRouter.get('/:moduleId/content', optionalAuth, getModuleContent);
moduleRouter.get('/:id', optionalAuth, getModuleById);

// ============================================
// INSTRUCTOR & ADMIN ROUTES
// ============================================

// Create module
moduleRouter.post('/', authorize(UserRole.INSTRUCTOR, UserRole.ADMIN), createModule);

// Update module
moduleRouter.put('/:id', authorize(UserRole.INSTRUCTOR, UserRole.ADMIN), updateModule);

// Toggle publish status
moduleRouter.patch('/:id/toggle-publish', authorize(UserRole.INSTRUCTOR, UserRole.ADMIN), toggleModulePublish);

// Delete module
moduleRouter.delete('/:id', authorize(UserRole.INSTRUCTOR, UserRole.ADMIN), deleteModule);

// ============================================
// ADMIN ONLY ROUTES
// ============================================

// Get all modules (admin only)
moduleRouter.get('/', authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), getAllModulesAdmin);

export default moduleRouter;