// ============================================
// src/routes/admin.routes.ts
// ============================================

import express from 'express';
import {
  // User Management
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  updateUserStatus,
  updateUserRole,
  
  // Student Management
  getAllStudents,
  getStudentProgress,
  
  // Instructor Management
  getAllInstructors,
  promoteToInstructor,
  demoteToStudent,
  
  // Dashboard
  getDashboardStats,
  
  // Bulk Operations
  bulkEnrollStudents,
  bulkUpdateStatus,
  
  // Reports
  getUserActivityReport,
  getCourseCompletionReport,

  // Programs
  getAllPrograms,
  getProgramById, 
  updateProgram,
  deleteProgram,
  createProgram,
  getAdminCourseById,
  getProgramProgress
} from '../controllers/adminController';

import { protect } from '../middlewares/auth';
import { authorize } from '../middlewares/adminAuth';
import { UserRole } from '../models/user';

const adminRouter = express.Router();

// All admin routes require authentication
adminRouter.use(protect);
//=============================================
// PROGRAM MANAGEMENT (Admin Only)
// ============================================

adminRouter.get('/')

// ============================================
// USER MANAGEMENT (Admin Only)
// ============================================
adminRouter.get('/users', authorize(UserRole.ADMIN), getAllUsers);
adminRouter.get('/users/:id', authorize(UserRole.ADMIN), getUserById);
adminRouter.put('/users/:id', authorize(UserRole.ADMIN), updateUser);
adminRouter.delete('/users/:id', authorize(UserRole.ADMIN), deleteUser);
adminRouter.patch('/users/:id/status', authorize(UserRole.ADMIN), updateUserStatus);
adminRouter.patch('/users/:id/role', authorize(UserRole.ADMIN), updateUserRole);

// ============================================
// STUDENT MANAGEMENT (Admin & Instructor)
// ============================================
adminRouter.get('/students', authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), getAllStudents);
adminRouter.get('/students/:id/progress', authorize(UserRole.ADMIN, UserRole.INSTRUCTOR), getStudentProgress);

// ============================================
// INSTRUCTOR MANAGEMENT (Admin Only)
// ============================================
adminRouter.get('/instructors', authorize(UserRole.ADMIN), getAllInstructors);
adminRouter.patch('/users/:id/promote-instructor', authorize(UserRole.ADMIN), promoteToInstructor);
adminRouter.patch('/users/:id/demote-instructor', authorize(UserRole.ADMIN), demoteToStudent);

// ============================================
// DASHBOARD (Admin Only)
// ============================================
adminRouter.get('/dashboard/stats', authorize(UserRole.ADMIN), getDashboardStats);
adminRouter.get("/courses/:id", authorize(UserRole.ADMIN), getAdminCourseById)

// ============================================
// BULK OPERATIONS (Admin Only)
// ============================================
adminRouter.post('/bulk/enroll', authorize(UserRole.ADMIN), bulkEnrollStudents);
adminRouter.patch('/bulk/status', authorize(UserRole.ADMIN), bulkUpdateStatus);

// ============================================
// REPORTS (Admin Only)
// ============================================
adminRouter.get('/reports/user-activity', authorize(UserRole.ADMIN), getUserActivityReport);
adminRouter.get('/reports/course-completion', authorize(UserRole.ADMIN), getCourseCompletionReport);

export default adminRouter;