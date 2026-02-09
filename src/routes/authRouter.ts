// ============================================
// src/routes/auth.routes.ts
// ============================================

import express from 'express';
import {
  register,
  login,
  getMe,
  refreshAccessToken,
  logout,
  logoutAll,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  getProfile,
} from '../controllers/authController';
import { protect } from '../middlewares/auth';
import { userValidation } from '../middlewares/validation';
import { uploadProfilePicture } from '../middlewares/uploadMiddleware';
import { apiLimiter,
  authLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
  uploadLimiter,
  quizLimiter, } from '../middlewares/rateLimiter';

const authRouter = express.Router();

// ============================================
// PUBLIC ROUTES (with rate limiting)
// ============================================

// Registration - 5 attempts per 15 min
authRouter.post(
  '/register',
 authLimiter,
  userValidation.register,
  register
);

// Login - 5 attempts per 15 min
authRouter.post(
  '/login',
authLimiter,
  userValidation.login,
  login
);

// Token refresh - moderate limiting
authRouter.post(
  '/refresh',
apiLimiter,
  refreshAccessToken
);

// Password reset request - 3 per hour
authRouter.post(
  '/forgot-password',
  userValidation.forgotPassword,
  forgotPassword
);

// Password reset completion - 3 per hour
authRouter.put(
  '/reset-password/:resetToken',
 passwordResetLimiter,
  userValidation.resetPassword,
  resetPassword
);

// Email verification - 5 per hour
authRouter.get(
  '/verify-email/:token',
 emailVerificationLimiter,
  verifyEmail
);


// ============================================
// PROTECTED ROUTES (require authentication)
// ============================================
authRouter.use(protect); // All routes below are protected

// Get current user
authRouter.get('/me', getMe);

// Get profile
authRouter.get(
  '/profile', getProfile
)

// Logout
authRouter.post('/logout', logout);

// Logout from all devices
authRouter.post('/logout-all', logoutAll);

// Update profile (with file upload)
authRouter.put(
  '/profile',
apiLimiter,
  uploadProfilePicture,
  userValidation.updateProfile,
  updateProfile
);

// Change password
authRouter.put(
  '/change-password',
  userValidation.changePassword,
  changePassword
);

export default authRouter;