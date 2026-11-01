import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { prisma } from '../db/prisma';
import type { Role } from '../domain/enums';

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

/**
 * Verifies the HS256 access token, then re-checks the account against the
 * database. The DB check is what makes deactivation and role changes take effect
 * immediately instead of at token expiry.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = bearerToken(req);
    if (!token) throw new UnauthorizedError('Header Authorization tidak ditemukan');

    const payload = verifyAccessToken(token);
    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, email: true, fullName: true, role: true, classId: true, isActive: true },
    });

    if (!user || !user.isActive) throw new UnauthorizedError('Akun tidak aktif');

    // A role change invalidates outstanding tokens rather than silently
    // honouring stale privileges.
    if (user.role !== payload.role) {
      throw new UnauthorizedError('Hak akses berubah, silakan masuk kembali');
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as Role,
      classId: user.classId,
    };
    next();
  } catch (error) {
    next(error);
  }
}

/** Coarse-grained role gate. Fine-grained ownership checks live in services. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Peran ${req.user.role} tidak diizinkan untuk aksi ini`));
    }
    next();
  };
}

/** Guards a resource that must belong to the caller's class (or staff's class). */
export function assertSameClass(req: Request, classId: string | null): void {
  if (!req.user) throw new UnauthorizedError();
  if (req.user.role === 'STUDENT' || req.user.role === 'PARENT') return;
  if (classId && req.user.classId && classId !== req.user.classId) {
    throw new ForbiddenError('Tidak dapat mengakses kelas lain');
  }
}
