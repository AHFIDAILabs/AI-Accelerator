// ============================================
// src/controllers/authController.ts
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
// @route   POST /api/v1/auth/register
// @access  Public
// ============================================
export const register = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { firstName, lastName, email, password, phoneNumber, cohort } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({
        success: false,
        error: 'An account with this email already exists',
      });
      return;
    }

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

    const accessToken = generateAccessToken({ id: user._id.toString() });
    const refreshToken = generateRefreshToken({ id: user._id.toString() });

    user.refreshTokens = [refreshToken];
    await user.save();

    // Welcome email — non-blocking so a mail failure never blocks registration
    emailService
      .sendWelcomeEmail({ email: user.email, firstName: user.firstName })
      .catch((err) =>
        console.error(`[Email] Welcome email failed for ${user.email}:`, err)
      );

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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password +refreshTokens');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.status !== UserStatus.ACTIVE) {
      return res.status(401).json({
        success: false,
        message: 'Account is not active. Please contact support.',
      });
    }

    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken({ id: user._id.toString() });
    const refreshToken = generateRefreshToken({ id: user._id.toString() });

    user.refreshTokens = [...(user.refreshTokens || []), refreshToken].slice(-5);
    user.lastLogin = new Date();
    await user.save();

    return sendTokenResponse(user._id.toString(), 200, res, user);
  }
);

// ============================================
// @desc    Get current logged-in user
// @route   GET /api/v1/auth/me
// @access  Private
// ============================================
export const getMe = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authorized' });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: req.user._id.toString(),
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
      res.status(401).json({ success: false, error: 'Refresh token not provided' });
      return;
    }

    try {
      const decoded = verifyRefreshToken(refreshToken);
      const user = await User.findById(decoded.id).select('+refreshTokens');

      if (!user) {
        res.status(401).json({ success: false, error: 'User not found' });
        return;
      }

      if (!user.refreshTokens?.includes(refreshToken)) {
        res.status(401).json({ success: false, error: 'Invalid refresh token' });
        return;
      }

      if (user.status !== UserStatus.ACTIVE) {
        res.status(401).json({ success: false, error: 'Account is not active' });
        return;
      }

      const newAccessToken = generateAccessToken({ id: user._id.toString() });
      const newRefreshToken = generateRefreshToken({ id: user._id.toString() });

      user.refreshTokens = user.refreshTokens
        .filter((t) => t !== refreshToken)
        .concat(newRefreshToken)
        .slice(-5);

      await user.save();
      sendTokenResponse(user._id.toString(), 200, res, user);
    } catch {
      res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
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
      res.status(401).json({ success: false, error: 'Not authorized' });
      return;
    }

    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const user = await User.findById(req.user._id).select('+refreshTokens');
      if (user) {
        user.refreshTokens = (user.refreshTokens || []).filter((t) => t !== refreshToken);
        await user.save();
      }
    }

    clearTokens(res);
    res.status(200).json({ success: true, message: 'Logged out successfully' });
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
      res.status(401).json({ success: false, error: 'Not authorized' });
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
// @desc    Get user profile
// @route   GET /api/v1/auth/profile
// @access  Private
// ============================================
export const getProfile = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not Authorized' });
      return;
    }

    const profile = await User.findById(req.user._id).select(
      'firstName lastName email phoneNumber profileImage studentProfile'
    );

    if (!profile) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: profile._id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        phoneNumber: profile.phoneNumber,
        profileImage: profile.profileImage,
        githubProfile: profile.studentProfile?.githubProfile,
        linkedinProfile: profile.studentProfile?.linkedinProfile,
        portfolioUrl: profile.studentProfile?.portfolioUrl,
      },
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
      res.status(401).json({ success: false, error: 'Not authorized' });
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { firstName, lastName, phoneNumber, githubProfile, linkedinProfile, portfolioUrl } =
      req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (githubProfile !== undefined && user.studentProfile)
      user.studentProfile.githubProfile = githubProfile;
    if (linkedinProfile !== undefined && user.studentProfile)
      user.studentProfile.linkedinProfile = linkedinProfile;
    if (portfolioUrl !== undefined && user.studentProfile)
      user.studentProfile.portfolioUrl = portfolioUrl;

    if (req.file) {
      if (user.profileImage && user.profileImage !== 'default-avatar.png') {
        try {
          const publicId = CloudinaryHelper.extractPublicId(user.profileImage);
          if (publicId) await CloudinaryHelper.deleteFile(publicId, 'image');
        } catch (err) {
          console.error('[Cloudinary] Failed to delete old profile image:', err);
        }
      }
      user.profileImage = req.file.path;
    }

    await user.save();

    // Notify the user about the profile change (non-blocking)
    emailService
      .sendProfileUpdatedEmail({ email: user.email, firstName: user.firstName })
      .catch((err) =>
        console.error(`[Email] Profile update email failed for ${user.email}:`, err)
      );

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
      res.status(401).json({ success: false, error: 'Not authorized' });
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password +refreshTokens');
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const isPasswordValid = await user.matchPassword(currentPassword);
    if (!isPasswordValid) {
      res.status(401).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    user.password = newPassword;
    user.refreshTokens = []; // Invalidate all sessions
    await user.save();

    clearTokens(res);

    // Security alert email — non-blocking
    emailService
      .sendPasswordChangedEmail({ email: user.email, firstName: user.firstName })
      .catch((err) =>
        console.error(`[Email] Password change email failed for ${user.email}:`, err)
      );

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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always return same response to prevent user enumeration
    if (!user) {
      res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
      return;
    }

    // ── Cooldown check: if a valid token still exists, don't send a new one ──
    if (user.resetPasswordToken && user.resetPasswordExpire) {
      const timeLeft = user.resetPasswordExpire.getTime() - Date.now()
      if (timeLeft > 0) {
        const minutesLeft = Math.ceil(timeLeft / 60000)
        res.status(200).json({
          success: true,
          cooldown: true,                  // ← frontend uses this flag
          minutesLeft,
          expiresAt: user.resetPasswordExpire, // ← frontend uses for countdown
          message: `A reset link was already sent. Please check your email or try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
        });
        return;
      }
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    try {
      await emailService.sendPasswordResetEmail(
        { email: user.email, firstName: user.firstName },
        resetToken
      );

      res.status(200).json({
        success: true,
        cooldown: false,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();

      console.error(`[Email] Password reset email failed for ${user.email}:`, err);

      res.status(500).json({
        success: false,
        error: 'Failed to send password reset email. Please try again later.',
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
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
      res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
      return;
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.refreshTokens = []; // Invalidate all existing sessions
    await user.save();

    // Confirm the reset via email — non-blocking
    emailService
      .sendPasswordResetSuccessEmail({ email: user.email, firstName: user.firstName })
      .catch((err) =>
        console.error(`[Email] Reset success email failed for ${user.email}:`, err)
      );

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