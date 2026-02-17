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
import { protect, optionalAuth } from '../middlewares/auth';
import { adminOnly, authorize, instructorAccess } from '../middlewares/adminAuth';
import { uploadMixedFiles } from '../middlewares/uploadMiddleware';
import { UserRole } from '../models/user';

const lessonRouter = express.Router();

// ==============================
// PUBLIC LESSON ROUTES (before auth)
// ==============================

// Get all published lessons (public)
lessonRouter.get('/published', getPublishedLessons);

// ✅ Public view for published lessons; unpublished allowed for Admin/Instructor (controller enforces)
lessonRouter.get('/:id', optionalAuth, getLessonById);

// ==============================
// PROTECTED ROUTES (require auth)
// ==============================
lessonRouter.use(protect);

// Lessons for a module (protected; instructors/admin can include unpublished with ?includeUnpublished=true)
lessonRouter.get('/module/:moduleId', getLessonsByModule);

// Admin + Instructor dashboards/listing
lessonRouter.get('/admin/all', adminOnly, getAllLessonsAdmin);
lessonRouter.get('/', instructorAccess, getAllLessonsInstructor);

// Stats
lessonRouter.get('/stats', authorize(UserRole.INSTRUCTOR, UserRole.ADMIN), lessonStats);

// Reorder
lessonRouter.patch('/reorder', instructorAccess, reorderLessons);

// Student actions
lessonRouter.get('/course/:courseId/progress', getCourseProgress);
lessonRouter.post('/:id/start', startLesson);
lessonRouter.post('/:id/complete', completeLesson);
lessonRouter.get('/:lessonId/progress', getLessonProgress);

// Management (Instructor & Admin)
lessonRouter.post('/', instructorAccess, uploadMixedFiles, createLesson);
lessonRouter.patch('/:id/publish', instructorAccess, toggleLessonPublish);
lessonRouter.put('/:id', instructorAccess, uploadMixedFiles, updateLesson);
lessonRouter.delete('/:id', adminOnly, deleteLesson);

export default lessonRouter;