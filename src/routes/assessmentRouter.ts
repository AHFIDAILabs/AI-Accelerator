// ============================================
// src/routes/assessment.routes.ts
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
// STUDENT ROUTES
// ============================================

// Get all published assessments
assessmentRouter.get('/', protect, getPublishedAssessments);

// Get assessments by course
assessmentRouter.get('/courses/:courseId', protect, getAssessmentsByCourse);

// Get assessments by module
assessmentRouter.get('/modules/:moduleId', protect, getAssessmentsByModule);

// Get single assessment
assessmentRouter.get('/:id', protect, getAssessmentById);

// ============================================
// ADMIN/INSTRUCTOR ROUTES
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
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),uploadGeneral.array('files'),
  createAssessment
);

// Update assessment
assessmentRouter.put(
  '/admin/:id',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), uploadGeneral.array('files'),
  updateAssessment
);

// Delete assessment
assessmentRouter.delete(
  '/admin/:id',
  protect,
  authorize(UserRole.ADMIN),
  deleteAssessment
);

// Publish/unpublish assessment
assessmentRouter.patch(
  '/admin/:id/publish',
  protect,
  authorize(UserRole.ADMIN),
  toggleAssessmentPublish
);

// Reorder assessments
assessmentRouter.patch(
  '/admin/reorder',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  reorderAssessments
);

// Send assessment reminder
assessmentRouter.post(
  '/admin/:assessmentId/reminder',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  sendAssessmentReminder
);

export default assessmentRouter;
