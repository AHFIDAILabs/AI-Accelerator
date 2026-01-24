// ============================================
// src/controllers/auth.controller.ts
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

// ============================================
// @desc    Register new user
// @route   POST /api/auth/register
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
        error: 'User with this email already exists',
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

    // Send welcome email (don't await to avoid blocking)
    emailService.sendWelcomeEmail(user).catch((err) => {
      console.error('Error sending welcome email:', err);
    });

    // Send token response
    sendTokenResponse(user._id.toString(), 201, res, user);
  }
);

// ============================================
// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
// ============================================
export const login = asyncHandler(
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

    const { email, password } = req.body;

    // Check if user exists (include password for verification)
    const user = await User.findOne({ email }).select('+password +refreshTokens');
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
      return;
    }

    // Check if user is active
    if (user.status !== UserStatus.ACTIVE) {
      res.status(401).json({
        success: false,
        error: `Your account is ${user.status}. Please contact support.`,
      });
      return;
    }

    // Verify password
    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
      return;
    }

    // Generate new tokens
    const accessToken = generateAccessToken({ id: user._id.toString() });
    const refreshToken = generateRefreshToken({ id: user._id.toString() });

    // Add new refresh token to user's tokens (support multiple devices)
    // Keep only last 5 refresh tokens
    user.refreshTokens = [...(user.refreshTokens || []), refreshToken].slice(-5);
    user.lastLogin = new Date();
    await user.save();

    // Send token response
    sendTokenResponse(user._id.toString(), 200, res, user);
  }
);

// ============================================
// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
// ============================================
export const getMe = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authorized',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: req.user._id,
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
// @route   POST /api/auth/refresh
// @access  Public (requires refresh token)
// ============================================
export const refreshAccessToken = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Get refresh token from cookie or body
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: 'Refresh token not provided',
      });
      return;
    }

    try {
      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);

      // Find user and check if refresh token exists in database
      const user = await User.findById(decoded.id).select('+refreshTokens');
      
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      // Check if refresh token is in user's valid tokens
      if (!user.refreshTokens || !user.refreshTokens.includes(refreshToken)) {
        res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
        });
        return;
      }

      // Check if user is active
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

      // Replace old refresh token with new one (token rotation)
      user.refreshTokens = user.refreshTokens
        .filter((token) => token !== refreshToken)
        .concat(newRefreshToken)
        .slice(-5); // Keep only last 5 tokens

      await user.save();

      // Send new tokens
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
// @route   POST /api/auth/logout
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

    // Get refresh token from cookie
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      // Remove refresh token from database
      const user = await User.findById(req.user._id).select('+refreshTokens');
      if (user) {
        user.refreshTokens = (user.refreshTokens || []).filter(
          (token) => token !== refreshToken
        );
        await user.save();
      }
    }

    // Clear cookies
    clearTokens(res);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }
);

// ============================================
// @desc    Logout from all devices
// @route   POST /api/auth/logout-all
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

    // Remove all refresh tokens
    const user = await User.findById(req.user._id).select('+refreshTokens');
    if (user) {
      user.refreshTokens = [];
      await user.save();
    }

    // Clear cookies
    clearTokens(res);

    res.status(200).json({
      success: true,
      message: 'Logged out from all devices successfully',
    });
  }
);

// ============================================
// @desc    Update user profile (with optional profile picture)
// @route   PUT /api/auth/profile
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
    if (githubProfile !== undefined) user.studentProfile = { ...user.studentProfile, githubProfile };
    if (linkedinProfile !== undefined) user.studentProfile = { ...user.studentProfile, linkedinProfile };
    if (portfolioUrl !== undefined) user.studentProfile = { ...user.studentProfile, portfolioUrl };

    // Update profile picture if file was uploaded
    if (req.file) {
      // Delete old profile image from Cloudinary if it exists and is not default
      if (user.profileImage && user.profileImage !== 'default-avatar.png') {
        try {
          const publicId = CloudinaryHelper.extractPublicId(user.profileImage);
          if (publicId) {
            await CloudinaryHelper.deleteFile(publicId, 'image');
          }
        } catch (error) {
          console.error('Error deleting old profile image:', error);
          // Continue anyway - don't fail the update
        }
      }

      // Update with new Cloudinary URL
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
// @route   PUT /api/auth/change-password
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

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: 'Please provide current and new password',
      });
      return;
    }

    // Get user with password
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

    // Validate new password
    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters long',
      });
      return;
    }

    // Update password
    user.password = newPassword;
    
    // Invalidate all refresh tokens (force re-login on all devices)
    user.refreshTokens = [];
    
    await user.save();

    // Clear cookies
    clearTokens(res);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please login again.',
    });
  }
);

// ============================================
// @desc    Forgot password - send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
// ============================================
export const forgotPassword = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'Please provide an email',
      });
      return;
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if user exists or not
      res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token and save to user
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // Send reset email
    try {
      await emailService.sendPasswordResetEmail(user, resetToken);
      
      res.status(200).json({
        success: true,
        message: 'Password reset email sent',
      });
    } catch (error) {
      // Reset token fields if email fails
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
// @route   PUT /api/auth/reset-password/:resetToken
// @access  Public
// ============================================
export const resetPassword = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { resetToken } = req.params;
    const { password } = req.body;

    if (!password) {
      res.status(400).json({
        success: false,
        error: 'Please provide a new password',
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long',
      });
      return;
    }

    // Hash the token from URL
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Find user with valid reset token
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

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    
    // Invalidate all refresh tokens
    user.refreshTokens = [];
    
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successful. Please login with your new password.',
    });
  }
);

// ============================================
// @desc    Verify email (optional feature)
// @route   GET /api/auth/verify-email/:token
// @access  Public
// ============================================
export const verifyEmail = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Implementation for email verification if needed
    res.status(200).json({
      success: true,
      message: 'Email verification feature to be implemented',
    });
  }
);