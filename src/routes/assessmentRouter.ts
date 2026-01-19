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
import { assessmentValidation } from '../middlewares/validation';

const assessmentRouter = express.Router();

// ============================================
// PUBLIC/STUDENT ROUTES
// ============================================

// Get all published assessments (students)
assessmentRouter.get(
  '/published',
  protect,
  authorize(UserRole.STUDENT),
  getPublishedAssessments
);

// Get single assessment by ID
assessmentRouter.get('/:id', protect, getAssessmentById);

// Get assessments by course
assessmentRouter.get(
  '/course/:courseId',
  protect,
  getAssessmentsByCourse
);

// Get assessments by module
assessmentRouter.get(
  '/module/:moduleId',
  protect,
  getAssessmentsByModule
);

// ============================================
// ADMIN & INSTRUCTOR ROUTES
// ============================================

// Get all assessments (admin view - includes unpublished)
assessmentRouter.get(
  '/admin/all',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getAllAssessmentsAdmin
);

// Create assessment
assessmentRouter.post(
  '/admin/create',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  assessmentValidation.create,
  createAssessment
);

// Update assessment
assessmentRouter.put(
  '/admin/:id',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  updateAssessment
);

// Delete assessment (admin only)
assessmentRouter.delete(
  '/admin/:id',
  protect,
  authorize(UserRole.ADMIN),
  deleteAssessment
);

// Publish/unpublish assessment (admin only)
assessmentRouter.patch(
  '/admin/:id/publish',
  protect,
  authorize(UserRole.ADMIN),
  toggleAssessmentPublish
);

// Reorder assessments (admin only)
assessmentRouter.patch(
  '/admin/reorder',
  protect,
  authorize(UserRole.ADMIN),
  reorderAssessments
);

// Send assessment reminder (admin & instructor)
assessmentRouter.post(
  '/admin/:assessmentId/reminder',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  sendAssessmentReminder
);

export default assessmentRouter;