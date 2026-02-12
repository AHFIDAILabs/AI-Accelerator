import express from 'express';
import {
  getLessonsByModule,
  getLessonById,
  createLesson,
  updateLesson,
  deleteLesson,
  toggleLessonPublish,
  startLesson,
  completeLesson,
  getCourseProgress,
  getAllLessonsAdmin,
  getLessonProgress,
  lessonStats,
  reorderLessons,
  getPublishedLessons,
  getAllLessonsInstructor
} from '../controllers/lessonController';
import { protect } from '../middlewares/auth';
import { adminOnly, instructorAccess } from '../middlewares/adminAuth';
import { uploadMixedFiles } from '../middlewares/uploadMiddleware';

const lessonRouter = express.Router();

// ==============================
// PUBLIC LESSON ROUTES (before auth)
// ==============================

// Get all published lessons (public)
lessonRouter.get('/published', getPublishedLessons);

// ==============================
// PROTECTED ROUTES (require auth)
// ==============================

lessonRouter.use(protect);

// ==============================
// MOVED: Get lessons by module (now protected)
// ==============================

// Get lessons for a module (protected - can see unpublished if instructor/admin)
lessonRouter.get('/module/:moduleId', getLessonsByModule);

// ==============================
// ADMIN-ONLY ROUTES (must be before generic :id routes)
// ==============================

// Get all lessons (admin)
lessonRouter.get('/admin/all', adminOnly, getAllLessonsAdmin);

// Get all lessons for instructor (can include unpublished)
lessonRouter.get("/", instructorAccess, getAllLessonsInstructor);

// Get lesson statistics
lessonRouter.get('/stats', adminOnly, instructorAccess, lessonStats);

// Reorder lessons
lessonRouter.patch('/reorder', instructorAccess, reorderLessons);

// ==============================
// STUDENT ACTIONS (specific routes before :id)
// ==============================

// Get student progress for a course
lessonRouter.get('/course/:courseId/progress', getCourseProgress);

// ==============================
// LESSON MANAGEMENT (Instructor & Admin)
// ==============================

// Create lesson
lessonRouter.post(
  '/',
  instructorAccess,
  uploadMixedFiles,
  createLesson
);

// ==============================
// LESSON-SPECIFIC ROUTES (:id routes)
// ==============================

// Start lesson (Student)
lessonRouter.post('/:id/start', startLesson);

// Complete lesson (Student)
lessonRouter.post('/:id/complete', completeLesson);

// Get lesson progress
lessonRouter.get('/:lessonId/progress', getLessonProgress);

// Publish/Unpublish lesson (Admin only)
lessonRouter.patch('/:id/publish', instructorAccess, toggleLessonPublish);

// Update lesson
lessonRouter.put(
  '/:id',
  instructorAccess,
  uploadMixedFiles,
  updateLesson
);

// Delete lesson (Admin only)
lessonRouter.delete('/:id', adminOnly, deleteLesson);

// Get single lesson by ID (must be last)
lessonRouter.get('/:id', getLessonById);

export default lessonRouter;