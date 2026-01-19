import { Request, Response, NextFunction, RequestHandler } from 'express';

// Async handler to wrap async route handlers
export const asyncHandler = (fn: RequestHandler) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};