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
  getCourseProgress
} from '../controllers/lessonController';
import { protect } from '../middlewares/auth';
import { adminOnly, instructorAccess } from '../middlewares/adminAuth';
import { uploadMixedFiles } from '../middlewares/uploadMiddleware';


const lessonRouter = express.Router();

// ==============================
// PUBLIC LESSON ROUTES
// ==============================

// Get all published lessons for a module
lessonRouter.get('/module/:moduleId', getLessonsByModule);

// Get single lesson by ID
lessonRouter.get('/:id', getLessonById);

// ==============================
// LESSON MANAGEMENT (Admin & Instructor)
// ==============================

// Protect all routes below
lessonRouter.use(protect);

// Create lesson (Instructor & Admin)
lessonRouter.post(
  '/',
  instructorAccess,
  uploadMixedFiles,
  createLesson
);


// Update lesson (Instructor & Admin)
lessonRouter.put('/:id', instructorAccess, updateLesson);

// Delete lesson (Admin only)
lessonRouter.delete('/:id', adminOnly, deleteLesson);

// Publish / Unpublish lesson (Admin only)
lessonRouter.patch('/:id/publish', adminOnly, toggleLessonPublish);

// ==============================
// STUDENT LESSON ACTIONS
// ==============================

// Start lesson (Student)
lessonRouter.post('/:id/start', startLesson);

// Mark lesson as complete (Student)
lessonRouter.post('/:id/complete', completeLesson);

// Get student progress for a course
lessonRouter.get('/course/:courseId/progress', getCourseProgress);

export default lessonRouter;
