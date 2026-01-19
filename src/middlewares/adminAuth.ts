import { NextFunction, Response } from "express";
import { UserRole } from "../models/user";
import { AuthRequest } from "./auth";

export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authorized to access this route',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `User role '${req.user.role}' is not authorized to access this route`,
      });
      return;
    }

    next();
  };
};

// Admin only middleware
export const adminOnly = authorize(UserRole.ADMIN);

// Admin and Instructor middleware
export const instructorAccess = authorize(UserRole.ADMIN, UserRole.INSTRUCTOR);