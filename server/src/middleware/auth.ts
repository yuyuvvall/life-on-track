import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '@clerk/express';

// Fail closed: when Clerk keys are absent, protected routes return 503
// instead of silently serving data unauthenticated.
export const isClerkConfigured = Boolean(
  process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!isClerkConfigured) {
    return res.status(503).json({
      status: 'fail',
      message: 'Authentication is not configured (CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY are missing)',
    });
  }

  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
  }

  return next();
}
