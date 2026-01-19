import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { Response } from 'express';

interface TokenPayload {
  id: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  const secret = process.env.JWT_SECRET as Secret;

  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not defined');
  }

  return jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_ACCESS_EXPIRE || '15m') as SignOptions['expiresIn'],
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  const secret = (process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_SECRET) as Secret;

  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is not defined');
  }

  return jwt.sign(payload, secret, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRE || '7d') as SignOptions['expiresIn'],
  });
};

// Verify Refresh Token
export const verifyRefreshToken = (token: string): TokenPayload => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is not defined');
  }

  return jwt.verify(token, secret) as TokenPayload;
};

// Send both tokens in response
export const sendTokenResponse = (
  userId: string,
  statusCode: number,
  res: Response,
  user: any
): void => {
  // Create tokens
  const accessToken = generateAccessToken({ id: userId });
  const refreshToken = generateRefreshToken({ id: userId });

  // Cookie options for access token
  const accessTokenOptions = {
    expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
  };

  // Cookie options for refresh token
  const refreshTokenOptions = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/auth/refresh', // Only send on refresh endpoint
  };

  res
    .status(statusCode)
    .cookie('accessToken', accessToken, accessTokenOptions)
    .cookie('refreshToken', refreshToken, refreshTokenOptions)
    .json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
};

// Clear tokens on logout
export const clearTokens = (res: Response): void => {
  res
    .cookie('accessToken', '', {
      httpOnly: true,
      expires: new Date(0),
    })
    .cookie('refreshToken', '', {
      httpOnly: true,
      expires: new Date(0),
    });
};