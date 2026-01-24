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
