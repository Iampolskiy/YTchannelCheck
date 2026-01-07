/**
 * Error Handling Middleware
 * 
 * Per .cursorrules: Handle edge cases explicitly, show meaningful errors.
 * Per Lastenheft: Skip on error, don't crash.
 */

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { formatZodError } from './validation.js';

/**
 * API Error class for structured error responses
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, details);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, message);
  }

  static internal(message: string): ApiError {
    return new ApiError(500, message);
  }
}

/**
 * Error response structure
 */
interface ErrorResponse {
  ok: false;
  error: string;
  details?: unknown;
}

/**
 * Global error handler middleware
 * 
 * Handles:
 * - ZodError (validation failures)
 * - ApiError (application errors)
 * - Generic errors (unexpected failures)
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Zod validation errors
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      ok: false,
      error: 'Validation failed',
      details: formatZodError(err),
    };
    res.status(400).json(response);
    return;
  }

  // Application errors
  if (err instanceof ApiError) {
    const response: ErrorResponse = {
      ok: false,
      error: err.message,
      details: err.details,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // MongoDB duplicate key error
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: number }).code === 11000
  ) {
    const response: ErrorResponse = {
      ok: false,
      error: 'Duplicate entry',
      details: 'A record with this key already exists',
    };
    res.status(409).json(response);
    return;
  }

  // Generic errors
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('Unhandled error:', err);

  const response: ErrorResponse = {
    ok: false,
    error: message,
  };
  res.status(500).json(response);
};

/**
 * 404 handler for unknown routes
 */
export const notFoundHandler = (_req: Request, res: Response): void => {
  const response: ErrorResponse = {
    ok: false,
    error: 'Route not found',
  };
  res.status(404).json(response);
};

