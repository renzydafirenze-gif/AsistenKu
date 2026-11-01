import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { BadRequestError } from '../lib/errors';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and *replaces* the request segments with parsed output, so handlers
 * never see unknown keys (mass-assignment defence) and types are narrowed.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as Request['params'];
      if (schemas.query) req.query = schemas.query.parse(req.query) as Request['query'];
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Rejects requests that carry unexpected top-level keys (defence in depth). */
export function assertNoUnknownKeys(value: unknown, allowed: string[], field = 'body'): void {
  if (!value || typeof value !== 'object') return;
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new BadRequestError(`Properti tidak dikenal pada ${field}`, unknown);
  }
}
