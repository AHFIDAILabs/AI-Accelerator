// ============================================
// src/routes/assessment.routes.ts (RECOMMENDED REORDERING)
// ============================================

import express from 'express';
import {
  createAssessment,
  getAllAssessmentsAdmin,
  getPublishedAssessments,
  getAssessmentById,
  updateAssessment,
  deleteAssessment,
  toggleAssessmentPublish,
  reorderAssessments,
  getAssessmentsByCourse,
  getAssessmentsByModule,
  sendAssessmentReminder,
} from '../controllers/assessmentController';
import { protect } from '../middlewares/auth';
import { authorize } from '../middlewares/adminAuth';
import { UserRole } from '../models/user';
import { uploadGeneral } from '../middlewares/uploadMiddleware';

const assessmentRouter = express.Router();

// ============================================
// ADMIN/INSTRUCTOR ROUTES (Most specific first)
// ============================================

// Get all assessments (includes unpublished)
assessmentRouter.get(
  '/admin/all',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getAllAssessmentsAdmin
);

// Create assessment
assessmentRouter.post(
  '/admin',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  uploadGeneral.array('files'),
  createAssessment
);

// Reorder assessments (before /:id to avoid conflict)
assessmentRouter.patch(
  '/admin/reorder',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  reorderAssessments
);

// Send assessment reminder (before /:id to avoid conflict)
assessmentRouter.post(
  '/admin/:assessmentId/reminder',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  sendAssessmentReminder
);

// Publish/unpublish assessment
assessmentRouter.patch(
  '/admin/:id/publish',
  protect,
  authorize(UserRole.ADMIN),
  toggleAssessmentPublish
);

// Update assessment
assessmentRouter.put(
  '/admin/:id',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  uploadGeneral.array('files'),
  updateAssessment
);

// Delete assessment
assessmentRouter.delete(
  '/admin/:id',
  protect,
  authorize(UserRole.ADMIN),
  deleteAssessment
);

// ============================================
// STUDENT ROUTES (Specific paths before dynamic params)
// ============================================

// Get assessments by course (before /:id)
assessmentRouter.get('/courses/:courseId', protect, getAssessmentsByCourse);

// Get assessments by module (before /:id)
assessmentRouter.get('/modules/:moduleId', protect, getAssessmentsByModule);

// Get all published assessments (root path)
assessmentRouter.get('/', protect, getPublishedAssessments);

// Get single assessment (LAST - most generic)
assessmentRouter.get('/:id', protect, getAssessmentById);

export default assessmentRouter;

/* 
  ============================================
  ROUTE ORDER EXPLANATION
  ============================================
  
  Express matches routes in the order they're defined.
  Routes should go from MOST SPECIFIC to LEAST SPECIFIC:
  
  1. /admin/all            ← Most specific
  2. /admin/reorder        ← Specific
  3. /admin/:id/reminder   ← Specific with param
  4. /admin/:id/publish    ← Specific with param
  5. /admin/:id            ← Dynamic but namespaced
  6. /courses/:courseId    ← Specific path
  7. /modules/:moduleId    ← Specific path
  8. /                     ← Root path
  9. /:id                  ← LEAST specific (catch-all)
  
  ============================================
  WHY THIS MATTERS
  ============================================
  
  If you put /:id before /courses/:courseId:
  - Request to /assessments/courses/123 would match /:id
  - The id would be "courses" (wrong!)
  
  If you put /admin/:id before /admin/all:
  - Request to /assessments/admin/all would match /admin/:id
  - The id would be "all" (wrong!)
  
  ============================================
*/