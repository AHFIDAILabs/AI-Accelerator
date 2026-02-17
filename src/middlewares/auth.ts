import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser, UserRole, UserStatus } from '../models/user';

// Extend Express Request interface
export interface AuthRequest extends Request {
  user?: IUser;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token = req.headers.authorization?.startsWith('Bearer')
      ? req.headers.authorization.split(' ')[1]
      : req.cookies?.token;

    if (!token) {
      res.status(401).json({ success: false, error: 'Not authorized' });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      res.status(401).json({ success: false, error: 'User no longer exists' });
      return;
    }
    if (user.status !== UserStatus.ACTIVE) {
      res.status(401).json({ success: false, error: 'Your account is not active' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Not authorized' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Try to get token from header or cookie
    let token = req.headers.authorization?.startsWith('Bearer')
      ? req.headers.authorization.split(' ')[1]
      : req.cookies?.token;

    // If no token, continue without user (guest access)
    if (!token) {
      console.log('📭 No token - continuing as guest');
      req.user = undefined;
      next();
      return;
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
      
      // Get user from database
      const user = await User.findById(decoded.id).select('-password');

      if (user && user.status === UserStatus.ACTIVE) {
        // Attach user to request
        req.user = user;
        console.log('✅ User authenticated:', {
          id: user._id,
          email: user.email,
          role: user.role
        });
      } else {
        // User not found or not active - continue as guest
        console.log('⚠️ User not found or inactive - continuing as guest');
        req.user = undefined;
      }
    } catch (err: any) {
      // Invalid token - continue as guest
      console.log('⚠️ Invalid token - continuing as guest:', err.message);
      req.user = undefined;
    }

    next();
  } catch (error) {
    // On any error, continue as guest
    console.error('❌ OptionalAuth error:', error);
    req.user = undefined;
    next();
  }
};
