/**
 * Zod Validation Middleware
 * 
 * Per .cursorrules: Parse request body at route entry.
 * Let Zod errors bubble to error handler middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Middleware factory for validating request body with Zod
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory for validating request query params with Zod
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as typeof req.query;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory for validating request params with Zod
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as typeof req.params;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Format Zod errors for API response
 * Zod v4 uses .issues instead of .errors
 */
export function formatZodError(error: ZodError): { field: string; message: string }[] {
  // Zod v4 uses .issues, v3 uses .errors
  const issues = 'issues' in error ? error.issues : [];
  return issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

