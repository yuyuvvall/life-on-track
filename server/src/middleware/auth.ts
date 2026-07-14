import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '@clerk/express';

/**
 * Returns the authenticated Clerk user id. Routes are mounted behind
 * requireAuth, so this is always set; throwing keeps a missing id from
 * ever widening a query to all users' rows.
 */
export function getUserId(req: Request): string {
  const { userId } = getAuth(req);
  if (!userId) {
    throw new Error('getUserId called on an unauthenticated request');
  }
  return userId;
}

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
