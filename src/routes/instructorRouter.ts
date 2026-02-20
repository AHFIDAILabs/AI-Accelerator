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
  createInstructorCourse,
  getInstructorAssessments,
  getInstructorLessons,
  getInstructorModules,
  getSubmissionsByAssessment,
  getSubmissionById
} from '../controllers/instructorController';
import { uploadCourseCover } from '../middlewares/uploadMiddleware';
import { courseValidation, instructorStudentValidation } from '../middlewares/validation';

const instructorRouter = express.Router();

// Apply to all routes
instructorRouter.use(protect);
instructorRouter.use(authorize(UserRole.INSTRUCTOR, UserRole.ADMIN));

// Profile
instructorRouter.get('/me', getInstructorProfile);
instructorRouter.put('/me', updateInstructorProfile);

// Courses
instructorRouter.post('/courses', uploadCourseCover, courseValidation.create, createInstructorCourse);
instructorRouter.get('/courses', getInstructorCourses);
instructorRouter.get('/courses/:id', getInstructorCourse);

// Students
instructorRouter.get('/students', getInstructorStudents);
instructorRouter.get('/students/:studentId/courses/:courseId/progress', instructorStudentValidation.getProgress, getStudentCourseProgress);

// Grading
instructorRouter.get('/submissions/pending', getPendingSubmissions);
instructorRouter.put('/submissions/:id/grade', gradeSubmission);

// Announcements
instructorRouter.post('/courses/:courseId/announcements', sendCourseAnnouncement);

instructorRouter.get('/content/assessments', getInstructorAssessments);
instructorRouter.get('/content/lessons', getInstructorLessons);
instructorRouter.get('/content/modules', getInstructorModules);

// Submissions
instructorRouter.get('/assessments/:assessmentId/submissions', getSubmissionsByAssessment);
instructorRouter.get('/submissions/:submissionId', getSubmissionById);

// Dashboard
instructorRouter.get('/dashboard/stats', getInstructorDashboardStats);

export default instructorRouter;