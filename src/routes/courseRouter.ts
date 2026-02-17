// ============================================
// src/routes/course.routes.ts
// ============================================

import express from 'express';
import {
  // Public endpoints
  getAllCourses,
  getCourseById,
  
  // Admin course management
  getAllCoursesAdmin,
  createCourse,
  updateCourse,
  deleteCourse,
  toggleCoursePublish,
  approveCourse,
  rejectCourse,
  
  // Course content
  getCourseContent,
  
  // Enrollment management
  getCourseEnrollments,
  getCourseStats,
  
  // Student course access
  getMyEnrolledCourses,
  enrollInCourse,
} from '../controllers/courseController';

import { protect } from '../middlewares/auth';
import { authorize } from '../middlewares/adminAuth';
import { UserRole } from '../models/user';
import { uploadCourseCover } from '../middlewares/uploadMiddleware';
import { courseValidation } from '../middlewares/validation';

const courseRouter = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================
courseRouter.get('/', getAllCourses);

// ============================================
// STUDENT ROUTES (Require Authentication)
// ============================================
courseRouter.get('/student/my-courses', protect, getMyEnrolledCourses);
courseRouter.post('/:id/enroll', protect, authorize(UserRole.STUDENT), enrollInCourse);

// ============================================
// ADMIN ROUTES (Admin Only)
// ============================================
courseRouter.get(
  '/admin/all',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getAllCoursesAdmin
);

courseRouter.post(
  '/admin/create',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  uploadCourseCover,
  courseValidation.create,
  createCourse
);

courseRouter.put(
  '/admin/:id',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  uploadCourseCover,
  updateCourse
);

courseRouter.post(
  '/admin/:id/approve',
  protect,
  authorize(UserRole.ADMIN),
  approveCourse
);

courseRouter.post(
  '/admin/:id/reject',
  protect,
  authorize(UserRole.ADMIN),
  rejectCourse
);

courseRouter.delete(
  '/admin/:id',
  protect,
  authorize(UserRole.ADMIN),
  deleteCourse
);

courseRouter.patch(
  '/admin/:id/publish',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  toggleCoursePublish
);

// ============================================
// COURSE CONTENT & MANAGEMENT
// (Admin & Instructor Access)
// ============================================
courseRouter.get(
  '/admin/:id/content',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getCourseContent
);

courseRouter.get(
  '/admin/:id/enrollments',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getCourseEnrollments
);

courseRouter.get(
  '/admin/:id/stats',
  protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  getCourseStats
);


courseRouter.get('/:id', getCourseById);


export default courseRouter;