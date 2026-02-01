// ============================================
// src/middlewares/rateLimiter.ts - In-Memory Only
// ============================================

import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';

// ============================================
// HELPER FUNCTION TO CREATE RATE LIMITERS
// ============================================
const createLimiter = (options: any): RateLimitRequestHandler => {
  return rateLimit({
    ...options,
  });
};

// ============================================
// RATE LIMITERS (In-memory)
// ============================================
export const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: {
    success: false,
    error: 'Too many requests from this User, please try again later.',
  },
});

export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

export const passwordResetLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    error: 'Too many password reset attempts. Please try again after an hour.',
  },
});

export const emailVerificationLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Too many verification requests. Please try again later.',
  },
});

export const uploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many file uploads. Please try again later.',
  },
});

export const quizLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'Too many quiz submissions. Please slow down.',
  },
});

// ============================================
// EXPORT LIMITERS
// ============================================
export default {
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
  uploadLimiter,
  quizLimiter,
};
