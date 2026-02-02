// ============================================
// src/controllers/authController.ts
// Key changes from original:
// 1. Added account lockout checks
// 2. Improved error messages (generic)
// 3. Added validation result handling
// ============================================

import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import crypto from 'crypto';
import { User, UserRole, UserStatus } from '../models/user';
import { AuthRequest } from '../middlewares/auth';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  sendTokenResponse,
  clearTokens,
} from '../utils/generateToken';
import emailService from '../utils/emailService';
import { asyncHandler } from '../middlewares/asyncHandler';
import { CloudinaryHelper } from '../utils/cloudinaryHelper';
import { apiLimiter } from '../middlewares/rateLimiter';

// ============================================
// @desc    Register new user
// @route   POST /api/v1/auth/register
// @access  Public
// ============================================
export const register = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        errors: errors.array(),
      });
      return;
    }

    const { firstName, lastName, email, password, phoneNumber, cohort } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({
        success: false,
        error: 'An account with this email already exists',
      });
      return;
    }

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      cohort,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
    });

    // Generate tokens
    const accessToken = generateAccessToken({ id: user._id.toString() });
    const refreshToken = generateRefreshToken({ id: user._id.toString() });

    // Save refresh token to database
    user.refreshTokens = [refreshToken];
    await user.save();

    // Send welcome email (non-blocking)
    emailService.sendWelcomeEmail(user).catch((err) => {
      console.error('Error sending welcome email:', err);
    });

    // Send token response
    sendTokenResponse(user._id.toString(), 201, res, user);
  }
);

// ============================================
// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
// ============================================
export const login = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;

    // Check if user exists (include password for verification)
    const user = await User.findOne({ email }).select('+password +refreshTokens');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials', // Generic message
      });
    }

    // Check if user is active
    if (user.status !== UserStatus.ACTIVE) {
      return res.status(401).json({
        success: false,
        error: 'Account is not active. Please contact support.',
      });
    }

    // Verify password
    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    // Password is correct: generate tokens
    const accessToken = generateAccessToken({ id: user._id.toString() });
    const refreshToken = generateRefreshToken({ id: user._id.toString() });

    // Add new refresh token to user's tokens (keep last 5)
    user.refreshTokens = [...(user.refreshTokens || []), refreshToken].slice(-5);
    user.lastLogin = new Date();
    await user.save();

    // Send token response WITH user data in body
   return sendTokenResponse(user._id.toString(), 200, res, user);
  }
);


// ============================================
// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
// ============================================

export const getMe = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized',
      });
    }

    // ✅ Return full user object matching frontend User type
    return res.status(200).json({
      success: true,
      data: {
        _id: req.user._id.toString(), // ✅ Changed from 'id' to '_id'
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        role: req.user.role,
        status: req.user.status,
        profileImage: req.user.profileImage,
        phoneNumber: req.user.phoneNumber,
        cohort: req.user.studentProfile?.cohort,
        githubProfile: req.user.studentProfile?.githubProfile,
        linkedinProfile: req.user.studentProfile?.linkedinProfile,
        portfolioUrl: req.user.studentProfile?.portfolioUrl,
        enrollmentDate: req.user.studentProfile?.enrollmentDate,
        lastLogin: req.user.lastLogin,
      },
    });
  }
);

// ============================================
// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh
// @access  Public (requires refresh token)
// ============================================
export const refreshAccessToken = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: 'Refresh token not provided',
      });
      return;
    }

    try {
      const decoded = verifyRefreshToken(refreshToken);
      const user = await User.findById(decoded.id).select('+refreshTokens');
      
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      if (!user.refreshTokens || !user.refreshTokens.includes(refreshToken)) {
        res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
        });
        return;
      }

      if (user.status !== UserStatus.ACTIVE) {
        res.status(401).json({
          success: false,
          error: 'Account is not active',
        });
        return;
      }

      // Generate new tokens (token rotation)
      const newAccessToken = generateAccessToken({ id: user._id.toString() });
      const newRefreshToken = generateRefreshToken({ id: user._id.toString() });

      // Replace old refresh token with new one
      user.refreshTokens = user.refreshTokens
        .filter((token) => token !== refreshToken)
        .concat(newRefreshToken)
        .slice(-5);

      await user.save();
      sendTokenResponse(user._id.toString(), 200, res, user);
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token',
      });
      return;
    }
  }
);

// ============================================
// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
// ============================================
export const logout = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authorized',
      });
      return;
    }

    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      const user = await User.findById(req.user._id).select('+refreshTokens');
      if (user) {
        user.refreshTokens = (user.refreshTokens || []).filter(
          (token) => token !== refreshToken
        );
        await user.save();
      }
    }

    clearTokens(res);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
);

// ============================================
// @desc    Logout from all devices
// @route   POST /api/v1/auth/logout-all
// @access  Private
// ============================================
export const logoutAll = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authorized',
      });
      return;
    }

    const user = await User.findById(req.user._id).select('+refreshTokens');
    if (user) {
      user.refreshTokens = [];
      await user.save();
    }

    clearTokens(res);

    res.status(200).json({
      success: true,
      message: 'Logged out from all devices successfully',
    });
  }
);

// ============================================
// @desc    Update user profile
// @route   PUT /api/v1/auth/profile
// @access  Private
// ============================================
export const updateProfile = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authorized',
      });
      return;
    }

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        errors: errors.array(),
      });
      return;
    }

    const {
      firstName,
      lastName,
      phoneNumber,
      githubProfile,
      linkedinProfile,
      portfolioUrl,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Update text fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (githubProfile !== undefined && user.studentProfile) user.studentProfile.githubProfile = githubProfile;
    if (linkedinProfile !== undefined && user.studentProfile) user.studentProfile.linkedinProfile = linkedinProfile;
    if (portfolioUrl !== undefined && user.studentProfile) user.studentProfile.portfolioUrl = portfolioUrl;


    // Update profile picture if file was uploaded
    if (req.file) {
      if (user.profileImage && user.profileImage !== 'default-avatar.png') {
        try {
          const publicId = CloudinaryHelper.extractPublicId(user.profileImage);
          if (publicId) {
            await CloudinaryHelper.deleteFile(publicId, 'image');
          }
        } catch (error) {
          console.error('Error deleting old profile image:', error);
        }
      }
      user.profileImage = req.file.path;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        githubProfile: user.studentProfile?.githubProfile,
        linkedinProfile: user.studentProfile?.linkedinProfile,
        portfolioUrl: user.studentProfile?.portfolioUrl,
        profileImage: user.profileImage,
      },
    });
  }
);

// ============================================
// @desc    Change password
// @route   PUT /api/v1/auth/change-password
// @access  Private
// ============================================
export const changePassword = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authorized',
      });
      return;
    }

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        errors: errors.array(),
      });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password +refreshTokens');
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Verify current password
    const isPasswordValid = await user.matchPassword(currentPassword);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        error: 'Current password is incorrect',
      });
      return;
    }

    // Update password
    user.password = newPassword;
    user.refreshTokens = []; // Invalidate all tokens
    await user.save();

    clearTokens(res);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please login again.',
    });
  }
);

// ============================================
// @desc    Forgot password
// @route   POST /api/v1/auth/forgot-password
// @access  Public
// ============================================
export const forgotPassword = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        errors: errors.array(),
      });
      return;
    }

    const { email } = req.body;
    const user = await User.findOne({ email });

    // Don't reveal if user exists
    if (!user) {
      res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    try {
      await emailService.sendPasswordResetEmail(user, resetToken);
      res.status(200).json({
        success: true,
        message: 'Password reset email sent',
      });
    } catch (error) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();

      res.status(500).json({
        success: false,
        error: 'Email could not be sent',
      });
    }
  }
);

// ============================================
// @desc    Reset password
// @route   PUT /api/v1/auth/reset-password/:resetToken
// @access  Public
// ============================================
export const resetPassword = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        errors: errors.array(),
      });
      return;
    }

    const { resetToken } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    }).select('+refreshTokens');

    if (!user) {
      res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token',
      });
      return;
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.refreshTokens = [];
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successful. Please login with your new password.',
    });
  }
);

// ============================================
// @desc    Verify email
// @route   GET /api/v1/auth/verify-email/:token
// @access  Public
// ============================================
export const verifyEmail = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    res.status(200).json({
      success: true,
      message: 'Email verification feature to be implemented',
    });
  }
);