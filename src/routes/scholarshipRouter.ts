import express from 'express';
import { protect } from '../middlewares/auth';
import { authorize } from '../middlewares/adminAuth';
import {
  createScholarship,
  getAllScholarships,
  getScholarshipById,
  updateScholarship,
  deleteScholarship,
  getScholarshipStats,
  bulkCreateScholarships
} from '../controllers/scholarship';
import { UserRole } from '../models/user';

const scholarshipRouter = express.Router();

// All routes require authentication and admin role
scholarshipRouter.use(protect, authorize(UserRole.ADMIN));

// Get scholarship statistics
scholarshipRouter.get('/stats', getScholarshipStats);

// Bulk create scholarships
scholarshipRouter.post('/bulk', bulkCreateScholarships);

// Create a scholarship
scholarshipRouter.post('/', createScholarship);

// Get all scholarships
scholarshipRouter.get('/', getAllScholarships);

// Get single scholarship
scholarshipRouter.get('/:id', getScholarshipById);

// Update scholarship
scholarshipRouter.put('/:id', updateScholarship);

// Delete scholarship
scholarshipRouter.delete('/:id', deleteScholarship);

export { scholarshipRouter };