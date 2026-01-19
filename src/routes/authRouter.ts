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
} from '../controllers/authController';
import { protect } from '../middlewares/auth';
import { userValidation } from '../middlewares/validation';
import { uploadProfilePicture } from '../middlewares/uploadMiddleware';

const authRouter = express.Router();

// Public routes
authRouter.post('/register', userValidation.register, register);
authRouter.post('/login', userValidation.login, login);
authRouter.post('/refresh', refreshAccessToken);
authRouter.post('/forgot-password', forgotPassword);
authRouter.put('/reset-password/:resetToken', resetPassword);
authRouter.get('/verify-email/:token', verifyEmail);

// Protected routes (require authentication)
authRouter.use(protect); // All routes below this are protected

authRouter.get('/me', getMe);
authRouter.post('/logout', logout);
authRouter.post('/logout-all', logoutAll);
authRouter.put('/profile', uploadProfilePicture, updateProfile);
authRouter.put('/change-password', changePassword);

export default authRouter;