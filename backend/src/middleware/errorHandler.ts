import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { isKnownRequestError, isValidationError } from '../lib/prismaErrors';

/** Wraps async handlers so rejected promises reach the error middleware. */
export function asyncHandler<T extends RequestHandler>(handler: T): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

function zodDetails(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Terminal error handler. Never leaks stack traces or driver internals
 * (OWASP A05/A09) while still returning actionable validation details.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Terjadi kesalahan pada server';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Data tidak valid';
    details = zodDetails(err);
  } else if (isKnownRequestError(err)) {
    if (err.code === 'P2002') {
      status = 409;
      code = 'DUPLICATE';
      message = 'Data sudah ada';
      details = { fields: (err.meta as { target?: unknown } | undefined)?.target };
    } else if (err.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Data tidak ditemukan';
    } else if (err.code === 'P2003') {
      status = 400;
      code = 'INVALID_REFERENCE';
      message = 'Referensi data tidak valid';
    } else {
      status = 400;
      code = 'DATABASE_ERROR';
      message = 'Permintaan tidak dapat diproses';
    }
  } else if (isValidationError(err)) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Data tidak valid';
  } else if (err instanceof SyntaxError && 'body' in err) {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Body JSON tidak valid';
  } else if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Payload terlalu besar';
  } else if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Body JSON tidak valid';
  }

  const body: ErrorBody = { error: { code, message, requestId: req.id ?? 'unknown' } };
  if (details !== undefined) body.error.details = details;

  if (status >= 500) {
    logger.error({ err, reqId: req.id, path: req.path }, 'unhandled error');
  } else {
    logger.warn({ reqId: req.id, code, path: req.path, status }, 'request rejected');
  }

  res.status(status).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ErrorBody = {
    error: { code: 'NOT_FOUND', message: `Rute ${req.method} ${req.path} tidak ditemukan`, requestId: req.id },
  };
  res.status(404).json(body);
}
