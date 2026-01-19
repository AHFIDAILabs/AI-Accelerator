import { body, param, query, ValidationChain } from 'express-validator';

export const userValidation = {
  register: [
    body('firstName')
      .trim()
      .notEmpty()
      .withMessage('First name is required')
      .isLength({ max: 50 })
      .withMessage('First name cannot exceed 50 characters'),
    body('lastName')
      .trim()
      .notEmpty()
      .withMessage('Last name is required')
      .isLength({ max: 50 })
      .withMessage('Last name cannot exceed 50 characters'),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
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
};

export const courseValidation = {
  create: [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Course title is required'),
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Course description is required'),
    body('duration.weeks')
      .isInt({ min: 1 })
      .withMessage('Duration in weeks must be at least 1'),
  ],
};

export const assessmentValidation = {
  create: [
    body('title')
      .trim()
      .notEmpty()
      .withMessage('Assessment title is required'),
    body('type')
      .isIn(['quiz', 'assignment', 'project', 'capstone'])
      .withMessage('Invalid assessment type'),
    body('questions')
      .isArray({ min: 1 })
      .withMessage('At least one question is required'),
  ],
};

export const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
];
