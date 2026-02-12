// ============================================
// src/middlewares/validation.ts
// ============================================

import { body, param, query, ValidationChain } from 'express-validator';

// ============================================
// USER / AUTH VALIDATION
// ============================================
export const userValidation = {
  register: [
    body('firstName')
      .trim()
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ max: 50 })
      .withMessage('First name cannot exceed 50 characters')
      .matches(/^[a-zA-Z\s-']+$/)
      .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('lastName')
      .trim()
      .notEmpty()
      .withMessage('Last name is required')
      .isLength({ max: 50 })
      .withMessage('Last name cannot exceed 50 characters')
      .matches(/^[a-zA-Z\s-']+$/)
      .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail()
      .isLength({ max: 100 })
      .withMessage('Email cannot exceed 100 characters'),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    
    body('phoneNumber')
      .optional()
      .trim()
      .matches(/^[\d\s\-\+\(\)]+$/)
      .withMessage('Invalid phone number format'),
    
    body('cohort')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Cohort name cannot exceed 50 characters'),
  ],
  
  login: [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
  ],
  
  updateProfile: [
    body('firstName')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('First name cannot exceed 50 characters')
      .matches(/^[a-zA-Z\s-']+$/)
      .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('lastName')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Last name cannot exceed 50 characters')
      .matches(/^[a-zA-Z\s-']+$/)
      .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('phoneNumber')
      .optional()
      .trim()
      .matches(/^[\d\s\-\+\(\)]+$/)
      .withMessage('Invalid phone number format'),
    
    body('githubProfile')
      .optional()
      .trim()
      .isURL()
      .withMessage('GitHub profile must be a valid URL'),
    
    body('linkedinProfile')
      .optional()
      .trim()
      .isURL()
      .withMessage('LinkedIn profile must be a valid URL'),
    
    body('portfolioUrl')
      .optional()
      .trim()
      .isURL()
      .withMessage('Portfolio URL must be a valid URL'),
  ],
  
  changePassword: [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    
    body('newPassword')
      .notEmpty()
      .withMessage('New password is required')
      .isLength({ min: 8, max: 128 })
      .withMessage('New password must be between 8 and 128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
      .custom((value, { req }) => {
        if (value === req.body.currentPassword) {
          throw new Error('New password must be different from current password');
        }
        return true;
      }),
  ],
  
  forgotPassword: [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
  ],
  
  resetPassword: [
    param('resetToken')
      .notEmpty()
      .withMessage('Reset token is required')
      .isLength({ min: 64, max: 64 })
      .withMessage('Invalid reset token'),
    
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be between 8 and 128 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  ],
};

// ============================================
// COURSE VALIDATION
// ============================================
export const courseValidation = {
  create: [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Course title is required')
      .isLength({ min: 3, max: 200 })
      .withMessage('Course title must be between 3 and 200 characters'),
    
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Course description is required')
      .isLength({ min: 10, max: 5000 })
      .withMessage('Course description must be between 10 and 5000 characters'),
    
    body('instructor')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Instructor name cannot exceed 100 characters'),
    
    body('duration.weeks')
      .optional()
      .isInt({ min: 1, max: 52 })
      .withMessage('Duration must be between 1 and 52 weeks'),
    
    body('level')
      .optional()
      .isIn(['beginner', 'intermediate', 'advanced'])
      .withMessage('Level must be beginner, intermediate, or advanced'),
  ],
  
  update: [
    param('id')
      .isMongoId()
      .withMessage('Invalid course ID'),
    
    body('title')
      .optional()
      .trim()
      .isLength({ min: 3, max: 200 })
      .withMessage('Course title must be between 3 and 200 characters'),
    
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10, max: 5000 })
      .withMessage('Course description must be between 10 and 5000 characters'),
  ],
};

// ============================================
// MODULE VALIDATION
// ============================================
export const moduleValidation = {
  create: [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Module title is required')
      .isLength({ min: 3, max: 200 })
      .withMessage('Module title must be between 3 and 200 characters'),
    
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Module description is required')
      .isLength({ min: 10, max: 2000 })
      .withMessage('Module description must be between 10 and 2000 characters'),
    
    body('order')
      .isInt({ min: 0 })
      .withMessage('Order must be a non-negative integer'),
  ],
};

// ============================================
// LESSON VALIDATION
// ============================================
export const lessonValidation = {
  create: [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Lesson title is required')
      .isLength({ min: 3, max: 200 })
      .withMessage('Lesson title must be between 3 and 200 characters'),
    
    body('content')
      .trim()
      .notEmpty()
      .withMessage('Lesson content is required')
      .isLength({ min: 10 })
      .withMessage('Lesson content must be at least 10 characters'),
    
    body('videoUrl')
      .optional()
      .trim()
      .isURL()
      .withMessage('Video URL must be valid'),
    
    body('duration')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Duration must be at least 1 minute'),
    
    body('order')
      .isInt({ min: 0 })
      .withMessage('Order must be a non-negative integer'),
  ],
};

// ============================================
// QUIZ / ASSESSMENT VALIDATION
// ============================================
export const assessmentValidation = {
  create: [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Assessment title is required')
      .isLength({ min: 3, max: 200 })
      .withMessage('Assessment title must be between 3 and 200 characters'),
    
    body('type')
      .isIn(['quiz', 'assignment', 'project', 'capstone'])
      .withMessage('Invalid assessment type'),
    
    body('questions')
      .isArray({ min: 1 })
      .withMessage('At least one question is required'),
    
    body('questions.*.question')
      .trim()
      .notEmpty()
      .withMessage('Question text is required'),
    
    body('questions.*.type')
      .isIn(['multiple-choice', 'true-false', 'short-answer'])
      .withMessage('Invalid question type'),
    
    body('questions.*.points')
      .isInt({ min: 1 })
      .withMessage('Points must be at least 1'),
    
    body('passingScore')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Passing score must be between 0 and 100'),
    
    body('timeLimit')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Time limit must be at least 1 minute'),
    
    body('attempts')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Attempts must be between 1 and 10'),
  ],
  
  submit: [
    param('quizId')
      .isMongoId()
      .withMessage('Invalid quiz ID'),
    
    body('answers')
      .isObject()
      .withMessage('Answers must be an object'),
  ],
};

// ============================================
// GENERAL VALIDATION
// ============================================
export const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
];

export const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be at least 1'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('sort')
    .optional()
    .isIn(['createdAt', '-createdAt', 'title', '-title', 'order', '-order'])
    .withMessage('Invalid sort parameter'),
];

export const instructorStudentValidation = {
  getProgress: [
    param('studentId')
      .isMongoId()
      .withMessage('Invalid studentId'),

    param('courseId')
      .isMongoId()
      .withMessage('Invalid courseId'),
  ],
};