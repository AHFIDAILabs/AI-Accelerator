// ============================================
// src/routes/instructorRouter.ts
// ============================================

import express from 'express';
import { protect } from '../middlewares/auth';
import { authorize } from '../middlewares/adminAuth';
import { UserRole } from '../models/user';
import {
  getInstructorProfile,
  updateInstructorProfile,
  getInstructorCourses,
  getInstructorCourse,
  getInstructorStudents,
  getStudentCourseProgress,
  getPendingSubmissions,
  gradeSubmission,
  sendCourseAnnouncement,
  getInstructorDashboardStats,
  createInstructorCourse
} from '../controllers/instructorController';
import { uploadCourseCover } from '../middlewares/uploadMiddleware';
import { courseValidation } from '../middlewares/validation';

const instructorRouter = express.Router();

// Apply protection and authorization to all routes
instructorRouter.use(protect);
instructorRouter.use(authorize(UserRole.INSTRUCTOR, UserRole.ADMIN));

// Profile routes
instructorRouter.get('/me', getInstructorProfile);
instructorRouter.put('/me', updateInstructorProfile);

// Course routes - FIXED: Remove duplicate middleware
instructorRouter.post('/create-courses', protect,
  authorize(UserRole.ADMIN, UserRole.INSTRUCTOR),
  uploadCourseCover,
  courseValidation.create,
   createInstructorCourse);
instructorRouter.get('/courses', getInstructorCourses);
instructorRouter.get('/courses/:id', getInstructorCourse);

// Student routes
instructorRouter.get('/students', getInstructorStudents);
instructorRouter.get('/students/:studentId/courses/:courseId/progress', getStudentCourseProgress);

// Assessment & Grading routes
instructorRouter.get('/submissions/pending', getPendingSubmissions);
instructorRouter.put('/submissions/:id/grade', gradeSubmission);

// Announcement routes
instructorRouter.post('/courses/:courseId/announcements', sendCourseAnnouncement);

// Dashboard routes
instructorRouter.get('/dashboard/stats', getInstructorDashboardStats);

export default instructorRouter;